const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync(require.resolve('../js/host.js'), 'utf8');
const controller = fs.readFileSync(require.resolve('../js/controller.js'), 'utf8');
const start = source.indexOf('const VOTE_WINDOW_SECONDS = 7');
const end = source.indexOf('\n      // Accepted by the vote', start);
const voteWindow = source.slice(start, end);

assert.ok(start >= 0 && end > start, 'HarfHunt vote window must exist');
assert.match(
  voteWindow,
  /collectWithTimer\([\s\S]*?type: 'harfvote'[\s\S]*?forceTimer: true[\s\S]*?otherPids, VOTE_WINDOW_SECONDS\)/,
  'the single HarfHunt vote must use the forced seven-second timer',
);
assert.doesNotMatch(
  source + controller,
  /harfchallenge/,
  'the removed first-stage challenge screen must not return',
);
assert.match(voteWindow, /const rejected = reject > otherPids\.length \/ 2/,
  'only a strict majority of all eligible voters may reject the answer');
assert.match(controller, /'Do you agree\?'/, 'the vote must ask a clear question');
assert.match(controller, /'YES'.*'harf-vote-accept'/s, 'the positive action must be YES');
assert.match(controller, /'NO'.*'harf-vote-reject'/s, 'the negative action must be NO');

console.log('HarfHunt single vote: regression test passed');
