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

  // Once the host has timed a player out and removed the live roster entry,
  // the same phone must still be able to restore the original pid and score.
  await originalHost.updateScore(joined.pid, 900);
  await originalHost._removePlayerNow(joined.pid);
  if (FB.__root.rooms[code].players?.[joined.pid]) {
    throw new Error('disconnect setup did not remove the live player record');
  }
  const afterTimeout = new FirebaseNet(FB.database());
  const restored = await afterTimeout.resumePlayer(code, joined.pid, {
    name: 'Ali', emoji: '🦊', color: '#f472b6', isVip: true,
  });
  if (restored.pid !== joined.pid || restored.player.score !== 900) {
    throw new Error('timed-out player did not reclaim the same pid and score');
  }
  if (FB.__root.rooms[code].disconnected?.ali) {
    throw new Error('reclaimed disconnect record was not consumed');
  }

  // A player who returns through the room-code form instead of automatic
  // restore gets the same identity as well.
  await originalHost._removePlayerNow(joined.pid);
  const manualReturn = new FirebaseNet(FB.database());
  const rejoined = await manualReturn.joinRoom(code, 'Ali', { emoji: '🐼', color: '#60a5fa' });
  if (rejoined.pid !== joined.pid || FB.__root.rooms[code].players[joined.pid].score !== 900) {
    throw new Error('manual rejoin did not reclaim the original player');
  }

  // If connectivity returns in the still-open phone tab, its next heartbeat
  // should self-heal the removed roster record without requiring a reload.
  await originalHost._removePlayerNow(joined.pid);
  manualReturn.startHeartbeat();
  await new Promise(resolve => setTimeout(resolve, 0));
  manualReturn.stopHeartbeat();
  if (!FB.__root.rooms[code].players?.[joined.pid]) {
    throw new Error('returning heartbeat did not restore the removed player');
  }

  console.log('REFRESH + REMOVAL REJOIN PASSED ✅');
})().catch(error => { console.error(error); process.exitCode = 1; });
