const assert = require('node:assert/strict');
const fs = require('node:fs');

const controller = fs.readFileSync(require.resolve('../js/controller.js'), 'utf8');
const host = fs.readFileSync(require.resolve('../js/host.js'), 'utf8');
const main = fs.readFileSync(require.resolve('../js/main.js'), 'utf8');
const css = fs.readFileSync(require.resolve('../css/style.css'), 'utf8');

for (const [name, source] of Object.entries({ controller, host, main })) {
  assert.match(source, /rastertiles\/voyager_nolabels/,
    `${name} must use the exact v184 Pin Point tiles`);
  assert.doesNotMatch(source, /World_Physical_Map|World_Terrain_Base|dark_nolabels/,
    `${name} must not retain a post-v184 map source`);
}

assert.match(controller, /subdomains: 'abcd', maxZoom: 10, keepBuffer: 6, updateWhenIdle: false/,
  'the interactive map must restore the exact v184 tile settings');
assert.doesNotMatch(controller, /hypox-plain-map/,
  'the post-v184 visual filter must be removed');
assert.match(host, /const REVEAL_ZOOM = 6/);
assert.match(host, /const REVEAL_VISIBLE_KM = 700/);
assert.match(host, /duration: 1\.2/);
assert.match(main, /const REVEAL_ZOOM = 6/);
assert.match(main, /const REVEAL_VISIBLE_KM = 700/);
assert.match(main, /duration: 1\.2/);
assert.doesNotMatch(host, /pp-country-banner|pinpoint-reveal-shell/,
  'the result map markup must match v184');
assert.doesNotMatch(css, /\.hypox-plain-map|\.pp-country-banner|\.pinpoint-reveal-shell/,
  'post-v184 map presentation styles must be gone');

assert.match(controller, /closeBar\.className = 'map-fullscreen-bar'/);
assert.match(controller, /closeBtn\.className = 'map-fullscreen-confirm'/);
assert.match(css, /\.map-fullscreen-bar[\s\S]*padding-right:max\(112px/,
  'fullscreen Confirm must reserve a separate safe area from the menu button');

console.log('Pin Point v184 map restore + fullscreen separation: 17 checks passed');
