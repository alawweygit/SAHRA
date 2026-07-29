/* TEMPORARY — scroll-lock diagnostic HUD. Safe to delete this whole file
   (and its <script> tag in index.html) once the scroll bug is diagnosed. */
(() => {
  const LOG_MAX = 8;
  const log = [];
  let programmaticSets = 0;
  let userScrollEvents = 0;

  // Intercept every scrollTop WRITE app-wide (not just #scr-controller) so we
  // catch it regardless of which element/code path is responsible.
  const proto = Element.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'scrollTop')
    || Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop');
  if (desc && desc.set) {
    Object.defineProperty(proto, 'scrollTop', {
      configurable: true,
      enumerable: desc.enumerable,
      get: desc.get,
      set(v) {
        programmaticSets++;
        const stack = (new Error()).stack || '';
        // Grab the first stack line that points at our own JS files, skipping this wrapper.
        const line = stack.split('\n').slice(1).find(l => /main\.js|host\.js|controller\.js/.test(l)) || stack.split('\n')[1] || '?';
        const fn = (line.match(/at (\S+)/) || [,'?'])[1];
        const idOrClass = this.id ? '#' + this.id : (this.className ? '.' + String(this.className).split(' ')[0] : this.tagName);
        log.unshift(`[${new Date().toISOString().slice(11,19)}] SET ${idOrClass} -> ${Math.round(v)} via ${fn}`);
        if (log.length > LOG_MAX) log.length = LOG_MAX;
        render();
        return desc.set.call(this, v);
      }
    });
  }

  let hud;
  function ensureHud() {
    if (hud) return hud;
    hud = document.createElement('div');
    hud.id = 'scrollDebugHud';
    hud.style.cssText = `
      position:fixed;top:0;left:0;right:0;z-index:999999;
      background:rgba(0,0,0,0.88);color:#0f0;font:10px/1.4 monospace;
      padding:6px 8px;max-height:42vh;overflow:auto;pointer-events:none;
      white-space:pre-wrap;word-break:break-all;border-bottom:2px solid #0f0;
    `;
    document.body.appendChild(hud);
    return hud;
  }

  function render() {
    const el = document.getElementById('scr-controller');
    const st = el ? Math.round(el.scrollTop) : '?';
    const sh = el ? Math.round(el.scrollHeight) : '?';
    const ch = el ? Math.round(el.clientHeight) : '?';
    ensureHud().textContent =
      `SCROLL DEBUG HUD — #scr-controller scrollTop=${st} scrollHeight=${sh} clientHeight=${ch}\n` +
      `programmatic scrollTop writes: ${programmaticSets}  |  user scroll events: ${userScrollEvents}\n` +
      `--- last ${LOG_MAX} programmatic writes (newest first) ---\n` +
      (log.length ? log.join('\n') : '(none yet)');
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureHud();
    render();
    const el = document.getElementById('scr-controller');
    if (el) el.addEventListener('scroll', () => { userScrollEvents++; render(); }, { passive: true });
    setInterval(render, 1000);
  });
  if (document.readyState !== 'loading') {
    ensureHud(); render();
    const el = document.getElementById('scr-controller');
    if (el) el.addEventListener('scroll', () => { userScrollEvents++; render(); }, { passive: true });
    setInterval(render, 1000);
  }
})();
