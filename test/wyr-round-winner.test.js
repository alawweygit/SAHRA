const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const host = fs.readFileSync(path.join(__dirname, '..', 'js', 'host.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
const start = host.indexOf('async function playWyr()');
const end = host.indexOf('async function playInterrogation()', start);
const wyr = host.slice(start, end);

assert.match(wyr, /await waitNext\(10, LANG==='ar' \? 'نتيجة الجولة' : 'ROUND WINNER'\)/,
  'the three-answer reveal must lead to a separate round-winner page');
assert.match(wyr, /Knows \$\{esc\(target\.name\)\} Best/,
  'each round winner page must name the hot-seat person');
assert.match(wyr, /turnWinners = turnRanking\.filter/,
  'round results must preserve tied winners instead of picking an arbitrary player');
assert.match(wyr, /await waitNext\(10\);[\s\S]*Knows the Group Best/,
  'the round winner must advance before the existing overall group winner');
assert.match(css, /\.wyr-round-winner\{/,
  'the dedicated round-winner scene is missing its layout');

new Function(host);
console.log('WYR ROUND WINNER PASSED ✅');
