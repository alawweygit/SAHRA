const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadFirebaseNet({ now = 100_000, intervals = [] } = {}) {
  const source = fs.readFileSync(require.resolve('../js/net.js'), 'utf8');
  class FakeDate extends Date {
    static now() { return now; }
  }
  const context = {
    console: { log() {}, error() {} },
    Date: FakeDate,
    setInterval(fn) { intervals.push(fn); return intervals.length; },
    clearInterval() {},
    setTimeout,
    clearTimeout,
    window: {},
  };
  vm.runInNewContext(`${source}\nglobalThis.__FirebaseNet = FirebaseNet;`, context);
  context.__FirebaseNet.__testWindow = context.window;
  return context.__FirebaseNet;
}

function makeDb(initial, { failPresenceRemove = false } = {}) {
  const data = structuredClone(initial);
  const parts = path => path.split('/').filter(Boolean);
  const read = path => parts(path).reduce((value, key) => value?.[key], data);
  const remove = path => {
    const keys = parts(path);
    const key = keys.pop();
    const parent = keys.reduce((value, part) => value?.[part], data);
    if (parent && key in parent) delete parent[key];
  };
  const write = (path, value) => {
    const keys = parts(path);
    const key = keys.pop();
    const parent = keys.reduce((value, part) => value[part] ||= {}, data);
    parent[key] = value;
  };
  return {
    data,
    ref(path) {
      return {
        async get() {
          const value = structuredClone(read(path));
          return { val: () => value, exists: () => value != null };
        },
        async set(value) { write(path, value); },
        async remove() {
          if (failPresenceRemove && path.includes('/presence/')) throw new Error('permission-denied');
          remove(path);
        },
      };
    },
  };
}

async function testPresenceCleanupCannotBlockCallback() {
  const FirebaseNet = loadFirebaseNet();
  const db = makeDb({
    rooms: { TEST: {
      players: { p1: { name: 'Ali', score: 7, joinedAt: 1 } },
      presence: { p1: { t: 1 } },
    } },
  }, { failPresenceRemove: true });
  const net = new FirebaseNet(db);
  net.code = 'TEST';
  let removedPid = null;
  net._onRemoveCb = pid => { removedPid = pid; };

  await net._removePlayerNow('p1');

  assert.equal(db.data.rooms.TEST.players.p1, undefined);
  assert.equal(removedPid, 'p1', 'presence cleanup failure must not suppress the host callback');
}

async function testMissingPresenceStillExpiresPlayer() {
  const intervals = [];
  const FirebaseNet = loadFirebaseNet({ intervals });
  const db = makeDb({
    rooms: { TEST: {
      players: { p1: { name: 'Ali', score: 7, joinedAt: 70_000 } },
      presence: {},
    } },
  });
  const net = new FirebaseNet(db);
  net.code = 'TEST';
  let removedPid = null;
  net.watchAndRemoveOffline(pid => { removedPid = pid; });

  assert.equal(intervals.length, 1);
  await intervals[0]();

  assert.equal(db.data.rooms.TEST.players.p1, undefined);
  assert.equal(removedPid, 'p1', 'players with no heartbeat entry must not remain forever');
}

function testWarningDoesNotDependOnStatusAvatar() {
  const source = fs.readFileSync(require.resolve('../js/host.js'), 'utf8');
  const start = source.indexOf('const paintOffline = () => {');
  const end = source.indexOf('\n    paintOffline();', start);
  const paintOffline = source.slice(start, end);
  const warning = paintOffline.indexOf('if (_off && !_warnedOffline.has(pid))');
  const missingAvatarReturn = paintOffline.indexOf('if (!el) return;');

  assert.ok(warning >= 0 && missingAvatarReturn >= 0);
  assert.ok(warning < missingAvatarReturn,
    'countdown broadcast must run even when a mode has no #statusRow avatar');
  assert.match(paintOffline, /showHostDisconnectWarning\(p, deadline\)/,
    'phones-only host must see the same countdown as surviving players');
}

function testRosterDeletionNotifiesHost() {
  const FirebaseNet = loadFirebaseNet();
  let playersListener = null;
  const db = {
    ref(path) {
      assert.equal(path, 'rooms/TEST/players');
      return { on(event, listener) { assert.equal(event, 'value'); playersListener = listener; } };
    },
  };
  const net = new FirebaseNet(db);
  net.code = 'TEST';
  net.pid = 'host';
  net._players = [
    { pid: 'p1', name: 'Stays', joinedAt: 1 },
    { pid: 'p2', name: 'Leaves', joinedAt: 2 },
  ];
  let removedPid = null;
  net._onRemoveCb = pid => { removedPid = pid; };
  net.onPlayers(() => {});

  playersListener({ val: () => ({ p1: { name: 'Stays', joinedAt: 1 } }) });

  assert.equal(removedPid, 'p2',
    'deleting a player record via Leave Game must notify and unstick the host');
}

function testPlayerLeaveCannotReplaceSharedPhase() {
  const source = fs.readFileSync(require.resolve('../js/main.js'), 'utf8');
  const start = source.indexOf('async function leaveGame()');
  const end = source.indexOf('\n  /* ---- AVATAR ---- */', start);
  const leaveGame = source.slice(start, end);
  assert.match(leaveGame, /leavingNet&&savedRole==='host'.*setState/,
    'only the room owner may publish a wait phase while leaving');
}

function testEveryCollectionDropsDepartedTargets() {
  const source = fs.readFileSync(require.resolve('../js/host.js'), 'utf8');
  const start = source.indexOf('async function collectWithTimer(');
  const end = source.indexOf('\n  /* ---------- shared frames', start);
  const collectWithTimer = source.slice(start, end);
  const liveRosterFilter = collectWithTimer.indexOf(
    'new Set(players.map(player => player.pid))');
  const publishPhase = collectWithTimer.indexOf('net.setState({ phase: \'input\'');

  assert.ok(liveRosterFilter >= 0 && publishPhase >= 0);
  assert.ok(liveRosterFilter < publishPhase,
    'every new input/vote phase must discard players who already left');
  assert.match(collectWithTimer, /pids = requestedPids\.filter\(pid => livePids\.has\(pid\)\)/,
    'stale mode-level target lists must be reconciled with the current roster');
}

async function testDisconnectDropsOnlyThatPlayerFromCollection() {
  const FirebaseNet = loadFirebaseNet();
  let inputListener = null;
  const inputRef = {
    on(event, listener) { assert.equal(event, 'value'); inputListener = listener; },
    off() {},
  };
  const net = new FirebaseNet({});
  net.room = path => {
    assert.equal(path, 'inputs/round-1');
    return inputRef;
  };

  let resolved = false;
  const resultPromise = net.collect('round-1', null, ['host', 'stays', 'leaves'], 60_000)
    .then(result => { resolved = true; return result; });
  inputListener({ val: () => ({ stays: { v: 'B', t: 1 } }) });
  assert.equal(FirebaseNet.__testWindow.__hypoxDropCollectPid('leaves'), true);
  await Promise.resolve();
  assert.equal(resolved, false,
    'disconnecting one player must not reveal while another live player is unanswered');

  inputListener({ val: () => ({ stays: { v: 'B', t: 1 }, host: { v: 'A', t: 2 } }) });
  const result = await resultPromise;
  assert.deepEqual(Object.keys(result).sort(), ['host', 'stays']);
  assert.equal(result.host.value, 'A', 'the host answer must remain their own submitted answer');
}

function testEveryModeUsesPidDropInsteadOfForceReveal() {
  const source = fs.readFileSync(require.resolve('../js/host.js'), 'utf8');
  const runStart = source.indexOf('async function run(netInstance, playerList, mode)');
  const run = source.slice(runStart);
  assert.match(run, /window\.__hypoxDropCollectPid\(pid\)/,
    'the shared disconnect handler must shrink any active collection in every mode');
  assert.doesNotMatch(run, /force-finishing collection due to disconnect/,
    'disconnect must never finish the entire question with partial answers');
}

function testRemovedAvatarIsPurgedAndRunningRosterAcceptsRejoin() {
  const source = fs.readFileSync(require.resolve('../js/host.js'), 'utf8');
  const runStart = source.indexOf('async function run(netInstance, playerList, mode)');
  const run = source.slice(runStart);

  assert.match(source, /function removePlayerStatusElements\(pid\)/,
    'host must have a dedicated stale-status cleanup path');
  assert.match(run, /removePlayerStatusElements\(pid\)/,
    'disconnect removal must delete the grey avatar from the current phase');
  assert.match(run, /net\.onPlayers\(liveList =>/,
    'running games must continue watching for players who rejoin');
  assert.match(run, /players\.push\(\{ \.\.\.livePlayer \}\)/,
    'a rejoining player must be restored to the host engine roster');
}

function testClosedTabReconnectsWithoutSessionNavigationState() {
  const source = fs.readFileSync(require.resolve('../js/main.js'), 'utf8');
  const start = source.indexOf('// Player rejoin banner');
  const end = source.indexOf("window.addEventListener('pagehide'", start);
  const rejoinBlock = source.slice(start, end);

  assert.match(rejoinBlock, /await resumeSavedPlayer\(_ps\)/,
    'a reopened tab must reconnect directly from its persistent player session');
  assert.doesNotMatch(rejoinBlock, /await restoreNavigationState\(\)/,
    'closed-tab reconnect cannot depend on sessionStorage navigation state');
}

function testStaleDepartureAnnouncementCannotOverrideRejoin() {
  const source = fs.readFileSync(require.resolve('../js/main.js'), 'utf8');
  assert.match(source, /m\.announceId > _lastAnnounceId/,
    'older embedded state announcements must not replay after a newer rejoin announcement');
  assert.match(source, /m\.disconnectWarnId > _lastDisconnectWarnId/,
    'an older disconnect warning must not reappear after its newer clear event');
}

function testHostLeftPreservesActivePlayerScreen() {
  const source = fs.readFileSync(require.resolve('../js/main.js'), 'utf8');
  const branchStart = source.indexOf("if(!state||state.phase==='hostLeft'){");
  const gameStart = source.indexOf('if(gameActive){', branchStart);
  const gameReturn = source.indexOf('\n          return;', gameStart);
  const beforeActiveReturn = source.slice(branchStart, gameReturn);

  assert.doesNotMatch(beforeActiveReturn, /setSharedStageHidden\(false\)/,
    'hostLeft must not unhide a stale shared result over an active player question');
  assert.doesNotMatch(beforeActiveReturn, /classList\.remove\('phones-player-answering'\)/,
    'hostLeft must preserve the active player-screen layout atomically');
  assert.match(source, /state\.phase!==['"]hostLeft['"]&&state\.phase!==['"]input['"]/,
    'hostLeft must not cancel an in-flight player question render');
}

function testNewChoiceHidesPreviousResultImmediately() {
  const source = fs.readFileSync(require.resolve('../js/main.js'), 'utf8');
  const start = source.indexOf('const _hideTrackerOnly = phonesOnly && !_pa1;');
  const end = source.indexOf('const _tmSubmit=', start);
  const transition = source.slice(start, end);
  assert.match(transition, /if\(_pa1\)[\s\S]*setSharedStageHidden\(true\)/,
    'a new full-screen question must hide the previous result before awaiting its wipe');
}

(async () => {
  await testPresenceCleanupCannotBlockCallback();
  await testMissingPresenceStillExpiresPlayer();
  testWarningDoesNotDependOnStatusAvatar();
  testRosterDeletionNotifiesHost();
  testPlayerLeaveCannotReplaceSharedPhase();
  testEveryCollectionDropsDepartedTargets();
  await testDisconnectDropsOnlyThatPlayerFromCollection();
  testEveryModeUsesPidDropInsteadOfForceReveal();
  testRemovedAvatarIsPurgedAndRunningRosterAcceptsRejoin();
  testClosedTabReconnectsWithoutSessionNavigationState();
  testStaleDepartureAnnouncementCannotOverrideRejoin();
  testHostLeftPreservesActivePlayerScreen();
  testNewChoiceHidesPreviousResultImmediately();
  console.log('disconnect handling: 13 tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
