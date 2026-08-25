const assert = require('node:assert/strict');
const fs = require('node:fs');

const host = fs.readFileSync(require.resolve('../js/host.js'), 'utf8');
const main = fs.readFileSync(require.resolve('../js/main.js'), 'utf8');
const fx = fs.readFileSync(require.resolve('../js/fx.js'), 'utf8');
const css = fs.readFileSync(require.resolve('../css/style.css'), 'utf8');
const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');

assert.match(fx, /setPublisher/);
assert.match(host, /FX\.setPublisher\?\.\(publishFx\)/,
  'all host FX calls must use the shared publisher instead of mode-specific patches');
assert.match(host, /type: 'batch', events/,
  'rapid reveal effects must be delivered together without Firebase coalescing losses');
assert.match(main, /!\(net\.hostSelfPid&&net\.hostSelfPid===myPid\).*m\.fx/s,
  'every non-host player mode must replay celebrations locally');
assert.doesNotMatch(main.slice(main.indexOf('if(!(net.hostSelfPid'), main.indexOf('// Update the small strip')), /if\(phonesOnly/,
  'celebrations must not be limited to Phones Only mode');
assert.match(main, /_isStaleInitialFx/,
  'a reconnect must not replay an old celebration');

assert.match(host, /currentRoundIsFinal && nextLike \? t\('final_results'\)/,
  'the final reveal action must say Final Results');
assert.match(main, /window\.__hypoxNextLabel\|\|t\('next_round'\)/,
  'the phone-host footer must use the same final-round label');

assert.match(html, /id="hostRoomCodeBadge"/);
assert.match(main, /ROOM \$\{currentRoomCode\}/,
  'the room owner must retain a subtle join code throughout active play');
assert.match(css, /\.big-btn\.final-action-btn/);
assert.ok((main.match(/final-action-btn/g) || []).length >= 4,
  'both final actions must be compact in winner and scoreless phone layouts');

console.log('player FX + final UI: 12 checks passed');
