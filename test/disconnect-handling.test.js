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

(async () => {
  await testPresenceCleanupCannotBlockCallback();
  await testMissingPresenceStillExpiresPlayer();
  testWarningDoesNotDependOnStatusAvatar();
  testRosterDeletionNotifiesHost();
  testPlayerLeaveCannotReplaceSharedPhase();
  testEveryCollectionDropsDepartedTargets();
  testRemovedAvatarIsPurgedAndRunningRosterAcceptsRejoin();
  testClosedTabReconnectsWithoutSessionNavigationState();
  testStaleDepartureAnnouncementCannotOverrideRejoin();
  console.log('disconnect handling: 9 tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
