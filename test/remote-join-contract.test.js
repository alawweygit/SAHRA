const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeFakeFirebase } = require('./fake-firebase');

const ROOT = path.join(__dirname, '..');
const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8'));
const validation = rules.rules.rooms.$roomId.players.$pid['.validate'];

assert.match(validation, /name/);
assert.match(validation, /emoji/);
assert.match(validation, /color/);
assert.doesNotMatch(validation, /'avatar'/,
  'Firebase rules must validate the fields the current player writer actually sends');

const FB = makeFakeFirebase();
global.window = { HYPOX_CONFIG: { firebase: { databaseURL: 'https://x.firebaseio.com' } } };
global.firebase = FB;
let source = fs.readFileSync(path.join(ROOT, 'js/net.js'), 'utf8')
  .replace('const AVATARS =', 'global.AVATARS =')
  .replace('const CODE_CHARS =', 'global.CODE_CHARS =')
  .replace('const makeCode =', 'global.makeCode =')
  .replace('const normalizeUniqueAnswer =', 'global.normalizeUniqueAnswer =')
  .replace('const uniqueAnswerKey =', 'global.uniqueAnswerKey =')
  .replace('const validPlayerRecord =', 'global.validPlayerRecord =')
  .replace(/^class FirebaseNet/m, 'global.FirebaseNet=class FirebaseNet')
  .replace(/^class LocalNet/m, 'global.LocalNet=class LocalNet')
  .replace(/^function createNet/m, 'global.createNet=function createNet');
eval(source);

(async () => {
  const host = new FirebaseNet(FB.database());
  const code = await host.createRoom('en');
  const remote = new FirebaseNet(FB.database());
  const joined = await remote.joinRoom(code, 'Remote Friend', { emoji: '🐼', color: '#60a5fa' });
  const saved = FB.__root.rooms[code].players[joined.pid];
  assert.equal(saved.name, 'Remote Friend');
  assert.equal(saved.emoji, '🐼');
  assert.equal(saved.color, '#60a5fa');
  assert.ok(FB.__root.rooms[code].presence[joined.pid],
    'a remote join must establish presence before the controller opens');

  const flakyPresencePhone = new FirebaseNet(FB.database());
  const normalRoom = flakyPresencePhone.room.bind(flakyPresencePhone);
  flakyPresencePhone.room = pathName => {
    const ref = normalRoom(pathName);
    if (String(pathName).startsWith('presence/')) {
      return { ...ref, set: async () => { throw new Error('permission-denied'); } };
    }
    return ref;
  };
  const flakyJoin = await flakyPresencePhone.joinRoom(code, 'Cellular Friend', {
    emoji: '🐸', color: '#4ade80',
  });
  assert.equal(FB.__root.rooms[code].players[flakyJoin.pid].name, 'Cellular Frien',
    'a secondary heartbeat failure must not reject an accepted player join');
  console.log('REMOTE JOIN CONTRACT PASSED ✅');
})().catch(error => { console.error(error); process.exitCode = 1; });
