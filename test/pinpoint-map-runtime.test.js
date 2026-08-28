const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const dom = new JSDOM('<!doctype html><body><div id="ctrl"></div></body>', {
  url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true,
});
const { window } = dom;
const { document } = window;
const maps = [];
const plain = value => JSON.parse(JSON.stringify(value));

class FakeMap {
  constructor(options) {
    this.options = options;
    this.handlers = {};
    this.removed = false;
    this.zoom = options.zoom;
    options.container.appendChild(document.createElement('canvas'));
    maps.push(this);
  }
  addControl(control, position) { this.control = { control, position }; return this; }
  once(name, fn) { if (name === 'load') window.setTimeout(fn, 0); return this; }
  on(name, fn) { (this.handlers[name] ||= new Set()).add(fn); return this; }
  off(name, fn) { this.handlers[name]?.delete(fn); return this; }
  fire(name, payload) { this.handlers[name]?.forEach(fn => fn(payload)); }
  jumpTo(options) { this.jump = options; this.zoom = options.zoom; }
  flyTo(options) { this.flight = options; this.zoom = options.zoom; }
  resize() { this.resizeCount = (this.resizeCount || 0) + 1; }
  remove() { this.removed = true; }
}
class FakeMarker {
  constructor(options) { this.options = options; }
  setLngLat(value) { this.lngLat = value; return this; }
  addTo(map) { this.map = map; map.options.container.appendChild(this.options.element); return this; }
  remove() { this.removed = true; }
}
window.maplibregl = {
  supported: () => true,
  Map: FakeMap,
  Marker: FakeMarker,
  NavigationControl: class { constructor(options) { this.options = options; } },
};
window.LANG = 'en';
window.t = key => key;
window.Audio_ = { sfx: { vote() {}, pop() {} } };
window.navigator.vibrate = () => true;

const source = [
  fs.readFileSync(path.join(root, 'js/maps.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'js/controller.js'), 'utf8'),
  'window.__HypoxMaps=HypoxMaps;window.__Controller=Controller;',
].join('\n;\n');
window.eval(source);

(async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const adapter = window.__HypoxMaps.create(container, { center: [10, 20], zoom: 3 });
  const raw = maps.at(-1);
  assert.deepEqual(plain(raw.options.center), [20, 10], 'public lat/lon must convert to MapLibre lon/lat');
  assert.equal(raw.options.style, 'https://tiles.openfreemap.org/styles/liberty');
  assert.equal(raw.options.dragRotate, false);
  assert.equal(raw.options.touchZoomRotate, true);
  assert.equal(raw.control.position, 'top-left');

  let clicked;
  adapter.onClick(value => { clicked = value; });
  raw.fire('click', { lngLat: { lat: 12.5, lng: 44.2 } });
  assert.deepEqual(plain(clicked), { latlng: { lat: 12.5, lng: 44.2 } });
  const marker = adapter.addHtmlMarker([12.5, 44.2], '<b>📍</b>', { anchor: 'bottom' });
  assert.deepEqual(plain(raw.options.center), [20, 10]);
  marker.setLatLng({ lat: 13, lng: 45 });
  adapter.flyTo([15, 50], 6, { duration: 1.2 });
  assert.deepEqual(plain(raw.flight.center), [50, 15]);
  assert.equal(raw.flight.duration, 1200);
  adapter.remove();
  assert.equal(raw.removed, true);
  assert.equal(container.children.length, 0);

  const ctrl = document.getElementById('ctrl');
  let submitted = null;
  window.__Controller.render(ctrl, { type: 'map', title: 'Los Angeles' }, value => { submitted = value; });
  await new Promise(resolve => window.setTimeout(resolve, 90));
  const ctrlMap = maps.at(-1);
  const submit = ctrl.querySelector('.ctrl-submit');
  assert.equal(submit.disabled, true, 'pin must be required before submitting');
  ctrlMap.fire('click', { lngLat: { lat: 34.0522, lng: -118.2437 } });
  assert.equal(submit.disabled, false, 'a map tap must enable submit');
  assert.ok(ctrl.querySelector('.hypox-drop-pin'), 'a map tap must render the pin');
  submit.click();
  const answer = JSON.parse(submitted);
  assert.equal(answer.lat, 34.0522);
  assert.ok(Math.abs(answer.lon - (-118.2437)) < 1e-9);

  window.__Controller.render(ctrl, { type: 'wait' }, () => {});
  assert.equal(ctrlMap.removed, true, 'rendering the next controller must release WebGL resources');
  console.log('Pin Point MapLibre runtime and controller interaction: 23 checks passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
