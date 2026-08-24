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

(async () => {
  await testPresenceCleanupCannotBlockCallback();
  await testMissingPresenceStillExpiresPlayer();
  testWarningDoesNotDependOnStatusAvatar();
  console.log('disconnect handling: 3 tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
