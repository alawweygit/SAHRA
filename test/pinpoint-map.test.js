const assert = require('node:assert/strict');
const fs = require('node:fs');

const controller = fs.readFileSync(require.resolve('../js/controller.js'), 'utf8');
const host = fs.readFileSync(require.resolve('../js/host.js'), 'utf8');
const main = fs.readFileSync(require.resolve('../js/main.js'), 'utf8');
const content = fs.readFileSync(require.resolve('../js/content.js'), 'utf8');
const backend = fs.readFileSync(require.resolve('../backend/server.js'), 'utf8');
const css = fs.readFileSync(require.resolve('../css/style.css'), 'utf8');

for (const [name, source] of Object.entries({ controller, host, main })) {
  assert.doesNotMatch(source, /dark_nolabels/,
    `${name} must not use the unreadable black map style`);
  assert.match(source, /World_Physical_Map/,
    `${name} must use the colorful physical geography style`);
  assert.match(source, /maxNativeZoom:\s*3/,
    `${name} must never fetch local street-level tiles while zooming`);
}
assert.match(css, /\.hypox-plain-map\{background:#9fd8ef!important;\}/,
  'the map must retain a clearly visible blue-water fallback');
assert.match(css, /filter:saturate\(1\.18\) contrast\(1\.05\) brightness\(1\.03\)/,
  'the map colors must stay clear and readable');

const citiesBlock = content.slice(content.indexOf('const PINPOINT_CITIES'), content.indexOf('/* ===== EMOJI RIDDLE'));
const placesBlock = content.slice(content.indexOf('const PINPOINT_PLACES'), content.indexOf('/* ===== MOST LIKELY'));
for (const line of [...citiesBlock.split('\n'), ...placesBlock.split('\n')].filter(line => /\{ en:/.test(line))) {
  assert.match(line, /countryEn:/, `missing English country: ${line.trim()}`);
  assert.match(line, /countryAr:/, `missing Arabic country: ${line.trim()}`);
}

assert.match(backend, /countryEn.*countryAr/,
  'new AI Pin Point content must include bilingual country names');
assert.match(host, /pp-country-banner/,
  'the host reveal must explicitly display the country');
assert.match(host, /country:\s*countryName/,
  'the country must be sent to every player reveal');
assert.match(main, /esc\(city\.country\)/,
  'player devices must label the reveal marker with its country');
assert.ok((host.match(/duration:\s*3\.2/g) || []).length >= 1);
assert.ok((main.match(/duration:\s*3\.2/g) || []).length >= 1);
assert.match(css, /@keyframes ppCountryReveal/);

console.log('Pin Point clean colorful map + country reveal: 20 checks passed');
