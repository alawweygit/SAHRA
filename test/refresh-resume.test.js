const fs = require('fs');
const path = require('path');
const { makeFakeFirebase } = require('./fake-firebase');

const ROOT = path.join(__dirname, '..');
const FB = makeFakeFirebase();
global.window = { HYPOX_CONFIG: { firebase: { databaseURL: 'https://x.firebaseio.com' } } };
global.firebase = FB;

let source = fs.readFileSync(path.join(ROOT, 'js/net.js'), 'utf8')
  .replace('const AVATARS =', 'global.AVATARS =')
  .replace('const CODE_CHARS =', 'global.CODE_CHARS =')
  .replace('const makeCode =', 'global.makeCode =')
  .replace('const normalizeUniqueAnswer =', 'global.normalizeUniqueAnswer =')
  .replace('const uniqueAnswerKey =', 'global.uniqueAnswerKey =')
  .replace(/^class FirebaseNet/m, 'global.FirebaseNet=class FirebaseNet')
  .replace(/^class LocalNet/m, 'global.LocalNet=class LocalNet')
  .replace(/^function createNet/m, 'global.createNet=function createNet');
eval(source);

(async () => {
  const originalHost = new FirebaseNet(FB.database());
  const code = await originalHost.createRoom('en');
  await originalHost.setPlayMode('phones');

  const originalPlayer = new FirebaseNet(FB.database());
  const joined = await originalPlayer.joinRoom(code, 'Ali', { emoji: '🦊', color: '#f472b6' });

  const refreshedPlayer = new FirebaseNet(FB.database());
  const playerResume = await refreshedPlayer.resumePlayer(code, joined.pid);
  if (playerResume.pid !== joined.pid || playerResume.player.name !== 'Ali') {
    throw new Error('a refreshed phone did not reconnect to its existing player');
  }
  const storedPlayers = FB.__root.rooms[code].players;
  if (Object.keys(storedPlayers).length !== 1) {
    throw new Error('refresh created a duplicate player');
  }

  const refreshedHost = new FirebaseNet(FB.database());
  const hostResume = await refreshedHost.resumeHost(code, joined.pid);
  if (hostResume.playMode !== 'phones' || hostResume.players.length !== 1) {
    throw new Error('a refreshed host did not restore its room and players');
  }
  if (FB.__root.rooms[code].state.phase !== 'lobby') {
    throw new Error('host resume did not clear the temporary disconnected state');
  }

  console.log('REFRESH RESUME PASSED ✅');
})().catch(error => { console.error(error); process.exitCode = 1; });
