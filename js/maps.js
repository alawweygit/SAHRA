/* HYPOX maps — one smooth, keyless vector-map implementation for Pin Point.
   OpenFreeMap supplies the map style/data; MapLibre renders it directly with
   WebGL so phone panning and zooming stay fluid without loading hundreds of
   raster image tiles during a gesture. */
const HypoxMaps = (() => {
  const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

  function supported() {
    return typeof maplibregl !== 'undefined' &&
      typeof maplibregl.Map === 'function' &&
      (typeof maplibregl.supported !== 'function' || maplibregl.supported());
  }

  function create(container, options = {}) {
    if (!container) throw new Error('Map container missing');
    if (!supported()) throw new Error('This device does not support the map renderer');
    if (container._hypoxMapInstance) container._hypoxMapInstance.remove();

    // A dedicated runtime child lets the phones-only shared-screen clone
    // remove WebGL canvases while preserving the empty reveal-map placeholder
    // that each player device initializes locally.
    container.replaceChildren();
    container.classList.add('hypox-map-shell');
    const runtime = document.createElement('div');
    runtime.className = 'hypox-map-runtime';
    container.appendChild(runtime);

    const center = options.center || [22, 25]; // public API stays [lat, lon]
    const interactive = options.interactive !== false;
    const map = new maplibregl.Map({
      container: runtime,
      style: STYLE_URL,
      center: [center[1], center[0]],
      zoom: options.zoom ?? 1.8,
      minZoom: options.minZoom ?? 1.2,
      maxZoom: options.maxZoom ?? 10,
      renderWorldCopies: options.worldCopies !== false,
      attributionControl: options.attributionControl !== false,
      interactive,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      keyboard: interactive,
      scrollZoom: interactive,
      boxZoom: false,
      doubleClickZoom: interactive,
      dragPan: interactive,
      touchZoomRotate: interactive,
      fadeDuration: 120,
      canvasContextAttributes: { antialias: false, powerPreference: 'high-performance' },
      localIdeographFontFamily: 'system-ui, sans-serif',
    });

    if (interactive && options.zoomControl !== false) {
      map.addControl(new maplibregl.NavigationControl({
        showCompass: false,
        showZoom: true,
        visualizePitch: false,
      }), 'top-left');
    }

    // Pin Point is a geography challenge: built-in place names would reveal
    // the answer. Hide every style layer that contains map text while keeping
    // terrain, coastlines, roads and borders. Our own result markers are HTML
    // elements, so the city name shown after the guess is unaffected.
    const hideStyleLabels = () => {
      if (options.labels === true) return;
      const layers = map.getStyle()?.layers || [];
      layers.forEach(layer => {
        if (layer.type !== 'symbol' || layer.layout?.['text-field'] === undefined) return;
        if (layer.layout['text-field'] === '') return;
        map.setLayoutProperty(layer.id, 'text-field', '');
      });
    };
    map.on('styledata', hideStyleLabels);

    const markers = new Set();
    map.once('load', () => {
      hideStyleLabels();
      map.resize();
    });

    const adapter = {
      raw: map,
      onClick(handler) {
        const listener = event => handler({
          latlng: { lat: event.lngLat.lat, lng: event.lngLat.lng },
        });
        map.on('click', listener);
        return () => map.off('click', listener);
      },
      addHtmlMarker(latlng, html, markerOptions = {}) {
        const element = document.createElement('div');
        element.className = `hypox-map-marker ${markerOptions.className || ''}`.trim();
        element.innerHTML = html;
        element.style.pointerEvents = 'none';
        const marker = new maplibregl.Marker({
          element,
          anchor: markerOptions.anchor || 'center',
          offset: markerOptions.offset || [0, 0],
        }).setLngLat([latlng[1], latlng[0]]).addTo(map);
        markers.add(marker);
        return {
          setLatLng(next) { marker.setLngLat([next.lng ?? next[1], next.lat ?? next[0]]); },
          remove() { markers.delete(marker); marker.remove(); },
        };
      },
      setView(latlng, zoom) {
        map.jumpTo({ center: [latlng[1], latlng[0]], zoom });
      },
      flyTo(latlng, zoom, flyOptions = {}) {
        map.flyTo({
          center: [latlng[1], latlng[0]],
          zoom,
          duration: Math.max(0, (flyOptions.duration ?? 1.2) * 1000),
          essential: true,
        });
      },
      resize() { map.resize(); },
      remove() {
        markers.forEach(marker => marker.remove());
        markers.clear();
        map.remove();
        delete container._hypoxMapInstance;
        container.classList.remove('hypox-map-shell');
        container.replaceChildren();
      },
    };
    container._hypoxMapInstance = adapter;
    return adapter;
  }

  function destroyWithin(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('.hypox-map-shell').forEach(shell => {
      try { shell._hypoxMapInstance?.remove(); } catch (e) { /* stale scene */ }
    });
  }

  return { create, destroyWithin, supported, STYLE_URL };
})();
