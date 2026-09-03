const assert = require('node:assert/strict');
const fs = require('node:fs');

const controller = fs.readFileSync(require.resolve('../js/controller.js'), 'utf8');
const host = fs.readFileSync(require.resolve('../js/host.js'), 'utf8');
const main = fs.readFileSync(require.resolve('../js/main.js'), 'utf8');
const maps = fs.readFileSync(require.resolve('../js/maps.js'), 'utf8');
const net = fs.readFileSync(require.resolve('../js/net.js'), 'utf8');
const css = fs.readFileSync(require.resolve('../css/style.css'), 'utf8');
const index = fs.readFileSync(require.resolve('../index.html'), 'utf8');

for (const [name, source] of Object.entries({ controller, host, main, maps })) {
  assert.doesNotMatch(source, /tile\.openstreetmap\.org|basemaps\.cartocdn\.com|World_Physical_Map|World_Terrain_Base|dark_nolabels/,
    `${name} must not retain blocked, watermarked, or reverted raster tile sources`);
}

assert.match(index, /maplibre-gl@5\.6\.0\/dist\/maplibre-gl\.js/,
  'the app must load the older-phone-compatible direct MapLibre renderer');
assert.match(index, /cdn\.jsdelivr\.net\/npm\/maplibre-gl@5\.6\.0\/dist\/maplibre-gl\.js/,
  'Pin Point must retain a second CDN path for players whose network blocks unpkg');
assert.match(index, /js\/maps\.js\?v=\d{8}-fixes-\d+/,
  'the versioned shared map adapter must be loaded');
assert.ok(index.indexOf('js/maps.js') < index.indexOf('js/host.js'),
  'the shared map adapter must load before the game modules');
assert.doesNotMatch(index, /leaflet/,
  'the removed raster renderer must not add another download to every game');
assert.match(maps, /tiles\.openfreemap\.org\/styles\/liberty/,
  'the map must use the no-key OpenFreeMap vector style');
assert.match(maps, /new maplibregl\.Map\(/,
  'Pin Point must render directly with MapLibre/WebGL');
assert.doesNotMatch(maps, /maplibreGL|keepBuffer|updateWhenIdle/,
  'the map must not use the slower Leaflet bridge or eager raster loading');
assert.match(maps, /new maplibregl\.NavigationControl/,
  'interactive maps must retain clear zoom controls');
assert.match(maps, /touchZoomRotate: interactive/,
  'native touch pinch/zoom must be enabled');
assert.match(maps, /powerPreference: 'high-performance'/,
  'the renderer must request the high-performance GPU path on phones');
assert.match(maps, /\['symbol', 'line', 'circle', 'heatmap', 'fill-extrusion'\]\.includes\(layer\.type\)/,
  'labels, city dots, roads, borders, and other line/symbol layers must be hidden');
assert.match(maps, /\(building\|aeroway\|airport\|transport\|road\|boundary\|admin\|place\|poi\|industrial\)/,
  'artificial fill layers must be hidden while natural land and water remain');
assert.match(maps, /setPaintProperty\(layer\.id, 'fill-outline-color', 'rgba\(0,0,0,0\)'\)/,
  'remaining natural fills must not draw artificial outline strokes');
assert.match(maps, /attributionControl: false/,
  'the expandable map details control must not cover Pin Point maps');
assert.match(maps, /destroyWithin\(root\)/,
  'map scenes must expose deterministic WebGL cleanup');
assert.match(controller, /HypoxMaps\.create\(el,[\s\S]*mainMap\.onClick/,
  'the interactive controller map must use the shared vector adapter');
assert.match(controller, /mainMap\.addHtmlMarker/,
  'a map tap must add the player pin');
assert.doesNotMatch(controller, /hypox-plain-map/,
  'the post-v184 visual filter must be removed');

assert.match(host, /const REVEAL_ZOOM = 6/);
assert.match(host, /const REVEAL_VISIBLE_KM = 700/);
assert.match(host, /duration: 1\.2/);
assert.match(main, /const REVEAL_ZOOM = 6/);
assert.match(main, /const REVEAL_VISIBLE_KM = 700/);
assert.match(main, /duration: 1\.2/);
assert.match(host, /city: \{ lat: city\.lat, lon: city\.lon, name: cityName, country: countryName \}/,
  'the result payload must send the country to player devices');
assert.match(host, /class="pinpoint-result-country">\$\{esc\(countryName\)\}/,
  'the host/player result scene must visibly name the country');
assert.match(host, /width:min\(92vw,900px\)|class="pinpoint-reveal-map"/,
  'the host result map must use the non-collapsing reveal container');
assert.match(css, /\.pinpoint-reveal-map\s*\{[\s\S]*width:min\(92vw,900px\)!important;/,
  'the host result map must have an explicit responsive width');
assert.doesNotMatch(css, /\.hypox-plain-map/,
  'the removed raster-style visual filter must stay gone');

assert.match(controller, /closeBar\.className = 'map-fullscreen-bar'/);
assert.match(controller, /closeBtn\.className = 'map-fullscreen-confirm'/);
assert.match(css, /\.map-fullscreen-bar[\s\S]*padding-right:max\(112px/,
  'fullscreen Confirm must reserve a separate safe area from the menu button');
assert.match(main, /pinpoint-reveal-map'[\s\S]*hypoxMapInited==='1'[\s\S]*continue;/,
  'same-scene updates must preserve the live player vector map');
assert.match(main, /const rm = HypoxMaps\.create\(mapEl,[\s\S]*mapEl\.dataset\.hypoxMapInited = '1'/,
  'the player map must only be marked initialized after MapLibre succeeds');
assert.ok((host.match(/host-only-ui,\.hypox-map-runtime/g) || []).length >= 2,
  'both host shared-screen observers must ignore WebGL rendering mutations');
assert.match(host, /clone\.querySelectorAll\([^\n]*\.hypox-map-runtime/,
  'shared-screen clones must strip the host WebGL runtime');
assert.doesNotMatch(host + net, /console\.log\('\[HYPOX\]/,
  'routine disconnect diagnostics must not clutter the console');

console.log('Pin Point vector map, player reveal persistence, and clean console: 32 checks passed');
