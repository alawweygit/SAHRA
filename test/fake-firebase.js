/* Minimal in-memory Firebase RTDB shim for SAHRA tests.
   Implements the surface FirebaseNet uses: ref(path).set/get/transaction/remove/on('value')/off/onDisconnect().remove()
   Data is a nested object; paths are 'a/b/c'. Listeners fire on any change under their path. */
function makeFakeFirebase() {
  const root = {};
  const listeners = []; // {path, cb}

  const splitPath = p => p.split('/').filter(Boolean);
  function getAt(path) {
    let node = root;
    for (const k of splitPath(path)) {
      if (node == null || typeof node !== 'object') return undefined;
      node = node[k];
    }
    return node;
  }
  function setAt(path, val) {
    const parts = splitPath(path);
    if (!parts.length) { // root set
      for (const k of Object.keys(root)) delete root[k];
      if (val && typeof val === 'object') Object.assign(root, deepClone(val));
      return;
    }
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof node[parts[i]] !== 'object' || node[parts[i]] == null) node[parts[i]] = {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = deepClone(val);
  }
  function removeAt(path) {
    const parts = splitPath(path);
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (node[parts[i]] == null) return;
      node = node[parts[i]];
    }
    delete node[parts[parts.length - 1]];
  }
  const deepClone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));

  function notify(changedPath) {
    // Fire any listener whose path is an ancestor-or-equal of changedPath,
    // or a descendant (parent write should notify child listeners too).
    for (const L of listeners) {
      if (changedPath === L.path ||
          changedPath.startsWith(L.path + '/') ||
          L.path.startsWith(changedPath + '/') ||
          L.path === '' ) {
        const val = getAt(L.path);
        L.cb(makeSnap(val));
      }
    }
  }
  function makeSnap(val) {
    return {
      val: () => (val === undefined ? null : deepClone(val)),
      exists: () => val !== undefined && val !== null,
    };
  }

  function ref(path) {
    path = path.replace(/^\/+|\/+$/g, '');
    return {
      path,
      async set(val) { setAt(path, val); notify(path); return; },
      async remove() { removeAt(path); notify(path); return; },
      async get() { return makeSnap(getAt(path)); },
      async transaction(update) {
        const current = getAt(path);
        const next = update(current === undefined ? null : deepClone(current));
        if (next === undefined) return { committed: false, snapshot: makeSnap(current) };
        setAt(path, next); notify(path);
        return { committed: true, snapshot: makeSnap(next) };
      },
      on(evt, cb) {
        const L = { path, cb };
        listeners.push(L);
        // fire immediately with current value (RTDB behaviour)
        cb(makeSnap(getAt(path)));
        return cb;
      },
      off() {
        for (let i = listeners.length - 1; i >= 0; i--) if (listeners[i].path === path) listeners.splice(i, 1);
      },
      onDisconnect() { return { remove() {}, }; },
    };
  }

  return {
    apps: [{}], // pretend initialized
    initializeApp() {},
    database() { return { ref }; },
    __root: root,
  };
}
module.exports = { makeFakeFirebase };
