(function () {
  class TestMap {
    constructor(options) {
      this.options = options;
      this.handlers = {};
      this.zoom = options.zoom;
      this.center = options.center;
      const surface = document.createElement('div');
      surface.className = 'mock-vector-surface';
      surface.style.cssText = 'position:absolute;inset:0;background:linear-gradient(155deg,#9bd7f5 0 48%,#e9e5d4 48% 56%,#a7d9f1 56%);cursor:grab;';
      surface.innerHTML = '<div style="position:absolute;inset:18% 12%;border-radius:48% 38% 50% 30%;background:#ece9da;box-shadow:-85px 80px 0 -35px #ece9da,110px 55px 0 -42px #ece9da;opacity:.96"></div>';
      options.container.appendChild(surface);
      surface.addEventListener('click', event => {
        const box = surface.getBoundingClientRect();
        const lng = ((event.clientX - box.left) / box.width) * 360 - 180;
        const lat = 85 - ((event.clientY - box.top) / box.height) * 170;
        (this.handlers.click || []).forEach(fn => fn({ lngLat: { lat, lng } }));
      });
    }
    addControl() {
      const controls = document.createElement('div');
      controls.className = 'maplibregl-ctrl-top-left';
      controls.innerHTML = '<div class="maplibregl-ctrl-group"><button aria-label="Zoom in">+</button><button aria-label="Zoom out">−</button></div>';
      this.options.container.appendChild(controls);
    }
    once(name, fn) { if (name === 'load') setTimeout(fn, 0); }
    on(name, fn) { (this.handlers[name] ||= []).push(fn); }
    off(name, fn) { this.handlers[name] = (this.handlers[name] || []).filter(value => value !== fn); }
    resize() {}
    jumpTo(options) { this.center = options.center; this.zoom = options.zoom; }
    flyTo(options) { this.center = options.center; this.zoom = options.zoom; }
    remove() { this.options.container.replaceChildren(); }
  }
  class TestMarker {
    constructor(options) { this.element = options.element; }
    setLngLat(value) { this.value = value; return this; }
    addTo(map) { map.options.container.appendChild(this.element); return this; }
    remove() { this.element.remove(); }
  }
  window.maplibregl = {
    supported: () => true,
    Map: TestMap,
    Marker: TestMarker,
    NavigationControl: class {},
  };
})();
