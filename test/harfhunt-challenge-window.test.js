const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync(require.resolve('../js/host.js'), 'utf8');
const start = source.indexOf("const cwPhaseId = 'hcw' + Date.now()");
const end = source.indexOf('\n      if (challenged) {', start);
const challengeWindow = source.slice(start, end);

assert.ok(start >= 0 && end > start, 'HarfHunt challenge window must exist');
assert.match(
  challengeWindow,
  /net\.collect\([\s\S]*?CHALLENGE_WINDOW_SECONDS \* 1000,[\s\S]*?\)/,
  'the seven-second HarfHunt constant must be converted to milliseconds for net.collect',
);
assert.doesNotMatch(
  source,
  /\[HYPOX-DEBUG\]/,
  'temporary HarfHunt diagnostics must be removed once the cause is confirmed',
);

console.log('HarfHunt challenge window: regression test passed');
