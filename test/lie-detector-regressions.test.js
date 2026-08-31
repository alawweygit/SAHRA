const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const hostSource = fs.readFileSync(require.resolve('../js/host.js'), 'utf8');
const helperStart = hostSource.indexOf('function normalizeBluffWord(');
const helperEnd = hostSource.indexOf('\n  /* ================================================================', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'Lie Detector answer builder must be present');

const context = {
  LANG: 'en',
  shuffle: values => values,
  val: (inputs, pid) => inputs[pid] ? inputs[pid].value : null,
};
vm.runInNewContext(`${hostSource.slice(helperStart, helperEnd)}\nglobalThis.build = buildBluffAnswers;`, context);

const round = {
  fact: 'The first alarm clock could only ring at ___ o’clock',
  truth: 'FOUR',
  decoys: ['THREE', 'FIVE', 'SIX', 'SEVEN'],
};
const pids = ['p1', 'p2', 'p3'];
const answers = context.build(round, [round], pids, {
  p1: { value: 'four' },
  p2: { value: 'four' },
  p3: { value: 'London' },
});

assert.equal(answers.length, pids.length + 1,
  'merged truth submissions must not shrink the visible choice count');
assert.equal(answers.filter(answer => answer.truth).length, 1,
  'the real answer must appear on exactly one card');
assert.deepEqual(Array.from(answers.find(answer => answer.truth).writers), ['p1', 'p2'],
  'every player who independently wrote the truth must retain credit');
assert.equal(new Set(answers.map(answer => answer.text)).size, answers.length,
  'all visible choices must remain unique');

const scoringBlock = hostSource.slice(
  hostSource.indexOf('const finders = votesByCard[ti]'),
  hostSource.indexOf('// Special callout for truth writers'),
);
assert.match(scoringBlock, /new Set\(\[\.\.\.finders, \.\.\.writerPids\]\)/,
  'truth finders and writers must be de-duplicated before scoring');
assert.match(scoringBlock, /allWinners\.forEach\(pid => addScore\(pid, 1000\)\)/,
  'each truth winner must receive exactly one standard truth award');

console.log('LIE DETECTOR REGRESSIONS PASSED ✅');
