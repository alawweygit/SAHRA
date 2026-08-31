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
  const first = new FirebaseNet(FB.database());
  const second = new FirebaseNet(FB.database());
  first.code = second.code = 'TEST';
  first.pid = 'phone-one';
  second.pid = 'phone-two';

  const [a, b] = await Promise.all([
    first.submitInput('phase-1', 'monkeys', { enforceUnique: true }),
    second.submitInput('phase-1', '  MONKEYS  ', { enforceUnique: true }),
  ]);
  const accepted = [a, b].filter(result => result.accepted);
  const rejected = [a, b].filter(result => !result.accepted && result.reason === 'duplicate');
  if (accepted.length !== 1 || rejected.length !== 1) {
    throw new Error(`matching simultaneous answers were not claimed exactly once: ${JSON.stringify([a, b])}`);
  }

  const inputs = FB.__root.rooms.TEST.inputs['phase-1'];
  if (Object.keys(inputs).length !== 1) throw new Error('duplicate answer was written to the phase inputs');

  const different = await second.submitInput('phase-1', 'apes', { enforceUnique: true });
  if (!different.accepted) throw new Error('a different retry was not accepted');
  if (FB.__root.rooms.TEST.inputs['phase-1']['phone-two'].v !== 'apes') throw new Error('accepted retry was not stored');

  await first.reserveUniqueAnswer('phase-truth', 'four', { reason: 'truth', points: 1000 });
  const foundTruth = await first.submitInput('phase-truth', '  FOUR ', { enforceUnique: true });
  if (foundTruth.accepted || foundTruth.reason !== 'truth' || foundTruth.points !== 1000) {
    throw new Error(`reserved truth was not returned as an inline retry: ${JSON.stringify(foundTruth)}`);
  }
  if (FB.__root.rooms.TEST.inputs?.['phase-truth']?.['phone-one']) {
    throw new Error('the correct answer was incorrectly submitted as a player lie');
  }
  const discoveries = await first.getTruthDiscoveries('phase-truth');
  if (!discoveries['phone-one'] || discoveries['phone-one'].points !== 1000) {
    throw new Error('truth discovery was not recorded exactly once for host scoring');
  }
  const fakeRetry = await first.submitInput('phase-truth', 'three', { enforceUnique: true });
  if (!fakeRetry.accepted) throw new Error('a fake retry after finding the truth was rejected');

  const local = new LocalNet();
  local.pid = 'local-one';
  await local.reserveUniqueAnswer('local-truth', 'honey', { reason: 'truth', points: 1000 });
  const localTruth = await local.submitInput('local-truth', 'HONEY', { enforceUnique: true });
  const localRetry = await local.submitInput('local-truth', 'CHEESE', { enforceUnique: true });
  const localDiscoveries = await local.getTruthDiscoveries('local-truth');
  if (localTruth.reason !== 'truth' || !localRetry.accepted || !localDiscoveries['local-one']) {
    throw new Error('pass-and-play did not preserve the same truth retry behavior');
  }

  console.log('UNIQUE INPUT PASSED ✅');
})().catch(error => { console.error(error); process.exitCode = 1; });
