const assert = require('node:assert/strict');
const fs = require('node:fs');

const controller = fs.readFileSync(require.resolve('../js/controller.js'), 'utf8');
const host = fs.readFileSync(require.resolve('../js/host.js'), 'utf8');
const main = fs.readFileSync(require.resolve('../js/main.js'), 'utf8');
const net = fs.readFileSync(require.resolve('../js/net.js'), 'utf8');
const css = fs.readFileSync(require.resolve('../css/style.css'), 'utf8');

for (const [name, source] of Object.entries({ controller, host, main })) {
  assert.match(source, /tile\.openstreetmap\.org/,
    `${name} must use the v190 OpenStreetMap tiles (CARTO's voyager_nolabels now requires an API key and shows a watermark instead of the map)`);
  assert.doesNotMatch(source, /basemaps\.cartocdn\.com|World_Physical_Map|World_Terrain_Base|dark_nolabels/,
    `${name} must not retain a map source that requires an API key or was previously reverted`);
}

assert.match(controller, /subdomains: 'abc', maxZoom: 10, keepBuffer: 6, updateWhenIdle: false/,
  'the interactive map must use OSM\'s 3 subdomains (a/b/c, not CARTO\'s a/b/c/d)');
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
assert.match(main, /pinpoint-reveal-map'[\s\S]*leafletInited==='1'[\s\S]*continue;/,
  'same-scene updates must preserve the live player Leaflet map');
assert.match(main, /const rm = L\.map\(mapEl,[\s\S]*mapEl\.dataset\.leafletInited = '1'/,
  'the player map must only be marked initialized after Leaflet succeeds');
assert.ok((host.match(/host-only-ui,\.leaflet-container/g) || []).length >= 2,
  'both host shared-screen observers must ignore Leaflet rendering mutations');
assert.doesNotMatch(host + net, /console\.log\('\[HYPOX\]/,
  'routine disconnect diagnostics must not clutter the console');

console.log('Pin Point map, player reveal persistence, and clean console: 21 checks passed');
