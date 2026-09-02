const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
  .replace('const validPlayerRecord =', 'global.validPlayerRecord =')
  .replace(/^class FirebaseNet/m, 'global.FirebaseNet=class FirebaseNet')
  .replace(/^class LocalNet/m, 'global.LocalNet=class LocalNet')
  .replace(/^function createNet/m, 'global.createNet=function createNet');
eval(source);

(async () => {
  const originalHost = new FirebaseNet(FB.database());
  const code = await originalHost.createRoom('en');
  await originalHost.setPlayMode('phones');

  const oldHostJoin = new FirebaseNet(FB.database());
  const oldHost = await oldHostJoin.joinRoom(code, 'Old Host', { emoji: '🦊', color: '#f472b6' });
  await originalHost.setHostPlayer(oldHost.pid, 'Old Host');

  const phoneA = new FirebaseNet(FB.database());
  const playerA = await phoneA.joinRoom(code, 'Maya', { emoji: '🐼', color: '#60a5fa' });
  const phoneB = new FirebaseNet(FB.database());
  const playerB = await phoneB.joinRoom(code, 'Omar', { emoji: '🐸', color: '#4ade80' });
  await originalHost.addBot('bot-1', 'Bot', { emoji: '🤖', color: '#a78bfa' });

  const now = Date.now();
  await originalHost.room(`presence/${oldHost.pid}`).set({ t: now });
  await originalHost.room(`presence/${playerA.pid}`).set({ t: now });
  await originalHost.room(`presence/${playerB.pid}`).set({ t: now });
  await originalHost.setGameSession({ mode: 'bluff', playMode: 'phones', hypoxState: { rounds: 5 }, active: true });
  await originalHost.setState({ phase: 'input', phaseId: 'round-3', headline: 'Keep this question' });

  const oldAssignment = FB.__root.rooms[code].host;
  await originalHost.room('hostStatus').set({
    status: 'offline', hostPid: oldHost.pid, hostName: 'Old Host',
    epoch: oldAssignment.epoch, electionId: oldAssignment.epoch,
  });

  const assignmentA = await phoneA.electReplacementHost();
  const assignmentB = await phoneB.electReplacementHost();
  assert.ok([playerA.pid, playerB.pid].includes(assignmentA.pid), 'a connected real player must be selected');
  assert.notEqual(assignmentA.pid, oldHost.pid, 'the disconnected host cannot elect themselves');
  assert.notEqual(assignmentA.pid, 'bot-1', 'a Bot cannot become host');
  assert.equal(assignmentB.pid, assignmentA.pid, 'concurrent phones must converge on one host');
  assert.equal(FB.__root.rooms[code].state.phase, 'input', 'host loss must not overwrite the active game phase');
  assert.equal(FB.__root.rooms[code].state.phaseId, 'round-3', 'the active question must remain intact during election');
  assert.equal(FB.__root.rooms[code].hostStatus.status, 'transferring');
  assert.equal(FB.__root.rooms[code].hostStatus.hostName, assignmentA.name);
  assert.equal(FB.__root.rooms[code].players[oldHost.pid].isVip, false, 'the previous host must lose the crown');
  assert.equal(FB.__root.rooms[code].players[assignmentA.pid].isVip, true, 'the replacement host must receive the crown');

  const promoted = new FirebaseNet(FB.database());
  const resumed = await promoted.resumeHost(code, assignmentA.pid);
  assert.equal(resumed.session.mode, 'bluff', 'the promoted phone must restore the interrupted game mode');
  assert.equal(FB.__root.rooms[code].state.phase, 'input', 'promoting a host must not create a second/overlapping phase');
  assert.equal(FB.__root.rooms[code].hostStatus.status, 'online');
  assert.equal(FB.__root.rooms[code].hostStatus.reason, 'transfer');

  const returningOldHost = new FirebaseNet(FB.database());
  await assert.rejects(
    returningOldHost.resumeHost(code, oldHost.pid),
    error => error?.message === 'host-reassigned',
    'the previous host must never reclaim host after transfer',
  );
  const oldAsPlayer = await returningOldHost.resumePlayer(code, oldHost.pid, {
    name: 'Old Host', emoji: '🦊', color: '#f472b6',
  });
  assert.equal(oldAsPlayer.pid, oldHost.pid, 'the previous host must reconnect as their same player');
  assert.equal(FB.__root.rooms[code].host.pid, assignmentA.pid, 'old-host reconnect must not replace the new host');

  const main = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');
  assert.match(main, /New host is \$\{status\.hostName\|\|''\}/, 'all phones must announce the new host by name');
  assert.match(main, /hypox_promoted_host/, 'the elected phone must use the dedicated promotion boot path');
  assert.match(main, /e\?\.message==='host-reassigned'/, 'an old host refresh must fall back to player reconnect');
  const hostSource = fs.readFileSync(path.join(ROOT, 'js/host.js'), 'utf8');
  assert.match(hostSource, /preserveTransferredScores = isFirstRound && window\.__hypoxPreserveScoresOnce === true/,
    'a clean host-transfer restart must preserve the existing scores');

  console.log('HOST TRANSFER PASSED ✅');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
