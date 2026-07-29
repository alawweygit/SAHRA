/* TEMPORARY — scroll-lock diagnostic HUD. Safe to delete this whole file
   (and its <script> tag in index.html) once the scroll bug is diagnosed. */
(() => {
  const LOG_MAX = 8;
  const log = [];
  const realScrollLog = [];
  let programmaticSets = 0;
  let userScrollEvents = 0;

  function describe(el) {
    if (!el) return '?';
    if (el === document || el === document.documentElement) return 'html';
    if (el === document.body) return 'body';
    return (el.id ? '#'+el.id : (el.className ? '.'+String(el.className).split(' ')[0] : el.tagName));
  }

  // Catch a scroll event on ANY element via capture phase at the document
  // level — scroll doesn't bubble, but capture still sees it fire on any
  // descendant. This tells us which element is ACTUALLY scrolling, since our
  // first pass assumed #scr-controller and the data proved that wrong.
  document.addEventListener('scroll', (e) => {
    userScrollEvents++;
    const t = e.target;
    const st = (t && t.scrollTop !== undefined) ? Math.round(t.scrollTop) : '?';
    realScrollLog.unshift(`[${new Date().toISOString().slice(11,19)}] SCROLL fired on ${describe(t)} scrollTop=${st}`);
    if (realScrollLog.length > LOG_MAX) realScrollLog.length = LOG_MAX;
    render();
  }, true);

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
        const idOrClass = describe(this);
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
      background:rgba(0,0,0,0.9);color:#0f0;font:9px/1.35 monospace;
      padding:6px 8px;max-height:58vh;overflow:auto;pointer-events:none;
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
    const bodyH = Math.round(document.body.scrollHeight);
    const winH = window.innerHeight;
    ensureHud().textContent =
      `#scr-controller scrollTop=${st} scrollHeight=${sh} clientHeight=${ch}\n` +
      `body.scrollHeight=${bodyH}  window.innerHeight=${winH}\n` +
      `programmatic scrollTop writes: ${programmaticSets}  |  REAL scroll events (any element): ${userScrollEvents}\n` +
      `--- last ${LOG_MAX} REAL scroll events (which element actually scrolled) ---\n` +
      (realScrollLog.length ? realScrollLog.join('\n') : '(none yet — try scrolling now)') + '\n' +
      `--- last ${LOG_MAX} programmatic scrollTop writes ---\n` +
      (log.length ? log.join('\n') : '(none yet)');
  }

  document.addEventListener('DOMContentLoaded', () => { ensureHud(); render(); setInterval(render, 1000); });
  if (document.readyState !== 'loading') { ensureHud(); render(); setInterval(render, 1000); }
})();
