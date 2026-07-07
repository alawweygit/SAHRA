/* SAHRA — visual FX: confetti + transitions */
const FX = (() => {
  let canvas, ctx, parts = [], raf = null;

  function init() {
    canvas = document.getElementById('confetti');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
    addEventListener('resize', resize); resize();
  }

  const COLORS = ['#ff3d8a', '#ffd23f', '#2de1fc', '#7dff6a', '#b78bff', '#fff6e9'];
  function spawn(x, y, big) {
    const shape = Math.random();
    parts.push({
      x, y,
      vx: (Math.random() - .5) * (big ? 7 : 10),
      vy: big ? Math.random() * 3 + 2 : -(Math.random() * 10 + 4),
      g: .24, w: Math.random() * 10 + 5, h: Math.random() * 6 + 4,
      c: COLORS[Math.floor(Math.random() * COLORS.length)],
      r: Math.random() * Math.PI, vr: (Math.random() - .5) * (shape > .75 ? .55 : .28),
      kind: shape < .55 ? 'rect' : shape < .8 ? 'circle' : 'ribbon',
      wob: Math.random() * Math.PI * 2,
      life: big ? 270 : 140,
    });
  }
  function burst(n = 140, big = false) {
    if (!ctx) return;
    for (let i = 0; i < n; i++) spawn(Math.random() * canvas.width, big ? -20 : canvas.height * .35, big);
    if (!raf) loop();
  }
  function burstAt(el, n = 36) {
    if (!ctx || !el) return;
    const r = el.getBoundingClientRect();
    for (let i = 0; i < n; i++) spawn(r.left + Math.random() * r.width, r.top + r.height / 2, false);
    if (!raf) loop();
  }
  function shake() {
    const app = document.getElementById('app');
    if (!app) return;
    app.classList.remove('shaking'); void app.offsetWidth; app.classList.add('shaking');
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    parts = parts.filter(p => p.life > 0 && p.y < canvas.height + 30);
    if (!parts.length) { cancelAnimationFrame(raf); raf = null; return; }
    for (const p of parts) {
      p.vy += p.g; p.wob += .12;
      p.x += p.vx + Math.sin(p.wob) * .7;
      p.y += p.vy; p.r += p.vr; p.life--;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      if (p.kind === 'circle') { ctx.beginPath(); ctx.arc(0, 0, p.w / 2.4, 0, 7); ctx.fill(); }
      else if (p.kind === 'ribbon') { ctx.scale(1, 2.6 + Math.sin(p.wob)); ctx.fillRect(-p.w / 4, -p.h / 2, p.w / 2, p.h); }
      else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
  }

  async function wipe() {
    const w = document.getElementById('wipe');
    if (!w) return;
    Audio_.sfx.whoosh();
    w.classList.remove('go'); void w.offsetWidth; w.classList.add('go');
    await sleep(380);
  }

  function flyPoints(anchorEl, text) {
    const r = anchorEl.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'pts-fly'; el.textContent = text;
    el.style.left = (r.left + r.width * 0.25) + 'px';
    el.style.top = r.top + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }

  return { init, burst, burstAt, shake, wipe, flyPoints };
})();

/* shared helpers */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
