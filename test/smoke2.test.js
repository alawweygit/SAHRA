/* HYPOX smoke test v2 — current flow:
   hero → START A GAME → grid → pregame → One Device → 4 players → all 8 modes */
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace(/<script src="https:[^"]+"><\/script>/g, '')
  .replace(/<link rel="stylesheet"[^>]+>/g, '');
const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
const { window } = dom, { document } = window;

/* ---- stubs ---- */
const fp = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
class FN { constructor() { this.type = ''; this.buffer = null; this.Q = fp(); for (const p of ['frequency','gain','threshold','knee','ratio','attack','release','detune']) this[p] = fp(); } connect(x) { return x } start() {} stop() {} }
window.AudioContext = class { constructor() { this.currentTime = 0; this.sampleRate = 44100; this.destination = new FN(); this.state = 'running'; } resume() {} createOscillator() { return new FN() } createGain() { return new FN() } createBuffer() { return { getChannelData() { return new Float32Array(64) } } } createBufferSource() { return new FN() } createBiquadFilter() { return new FN() } createDynamicsCompressor() { return new FN() } createConvolver() { return new FN() } };
window.HTMLCanvasElement.prototype.getContext = () => null;
window.HYPOX_CONFIG = { firebase: { databaseURL: 'PASTE_' }, aiEndpoint: null };
window.alert = () => {};
/* Leaflet stub: auto-fires a map click so PinPoint is playable headlessly */
window.L = {
  map: () => {
    const m = { on(ev, cb) { if (ev === 'click') setTimeout(() => cb({ latlng: { lat: 20 + Math.random() * 10, lng: 30 + Math.random() * 10 } }), 120); return m; }, setView() { return m }, fitBounds() {}, addTo() { return m } };
    return m;
  },
  tileLayer: () => ({ addTo() {} }),
  circleMarker: () => ({ addTo() { return { bindTooltip() { return this } } }, setLatLng() {}, bindTooltip() { return this } }),
  polyline: () => ({ addTo() {} }),
};

const files = ['js/i18n.js','js/audio.js','js/fx.js','js/regions.js','js/content.js','js/net.js','js/controller.js','js/host.js','js/main.js'];
let bundle = '';
for (const f of files) {
  let s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (f === 'js/fx.js') s = s.replace('const sleep = ms => new Promise(r => setTimeout(r, ms));', 'const sleep = ms => new Promise(r => setTimeout(r, Math.max(1, ms/10)));');
  bundle += s + '\n;\n';
}
window.eval(bundle);
document.dispatchEvent(new window.Event('DOMContentLoaded'));

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const click = el => el && el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
async function waitFor(fn, label, to = 30000) { const t0 = Date.now(); while (Date.now() - t0 < to) { const v = fn(); if (v) return v; await sleep(20); } throw new Error('TIMEOUT: ' + label); }

let answered = 0;
async function autopilot() {
  for (;;) {
    await sleep(25);
    const smb = $('#startModeBtn'); if (smb && !smb.disabled) { click(smb); await sleep(40); }
    const ppr = $('#ppReady'); if (ppr && !ppr.disabled) { click(ppr); await sleep(40); }
    if (window.__hypoxSkip) { window.__hypoxSkip(); await sleep(40); continue; }
    const ov = $('#ppOverlay');
    const scope = (ov && ov.classList.contains('show')) ? ov : $('#ctrlArea');
    if (!scope) continue;
    const ta = scope.querySelector('textarea:not(:disabled)');
    if (ta) {
      ta.value = ta.classList.contains('ctrl-input-year') ? String(1900 + Math.floor(Math.random() * 120)) : 'BOT' + Math.floor(Math.random() * 999);
      const b = scope.querySelector('.ctrl-submit');
      if (b && !b.disabled) { click(b); answered++; await sleep(50); }
      continue;
    }
    const mapBtn = scope.querySelector('.ctrl-submit:not(:disabled)');
    if (mapBtn && scope.querySelector('.leaf-map')) { click(mapBtn); answered++; await sleep(50); continue; }
    const ch = scope.querySelectorAll('.choice-btn:not(:disabled):not(.picked)');
    if (ch.length) { click(ch[Math.floor(Math.random() * ch.length)]); answered++; await sleep(50); }
  }
}

(async () => {
  try {
    // 1) hero landing
    await waitFor(() => $('#scr-title.active'), 'hero');
    if (!$('#topbar').classList.contains('show')) throw new Error('topbar hidden on landing');
    console.log('✔ hero landing + topbar visible');

    // 2) START A GAME → grid
    click($('#heroStart'));
    await waitFor(() => $('#scr-games.active'), 'games grid');
    const cards = $$('.title-game-card');
    if (cards.length !== 8) throw new Error('expected 8 game cards, got ' + cards.length);
    console.log('✔ game grid: 8 cards');

    // 3) pregame → One Device
    click(cards.find(c => c.dataset.mode === 'trivia'));
    await waitFor(() => $('#scr-pregame.active'), 'pregame');
    if (!$('.cat-grid-small')) throw new Error('trivia category picker missing');
    click($('#pgOfflineBtn'));
    await waitFor(() => $('#scr-lobby.active'), 'lobby');
    console.log('✔ pregame (with categories) → One Device lobby');

    // 4) add 4 players
    for (const nm of ['ALI', 'MAITHAM', 'RAMY', 'NOURA']) {
      click($('#addLocalBtn'));
      await waitFor(() => $('#scr-avatar.active'), 'avatar');
      $('#avatarName').value = nm; click($('#avatarDone'));
      await waitFor(() => $('#scr-lobby.active'), 'lobby back');
      await sleep(40);
    }
    console.log('✔ 4 players added');

    autopilot();
    click($('#startGameBtn'));
    await waitFor(() => $('#againBtn'), 'winner trivia', 240000);
    console.log('✔ trivia complete | host:', $('#host .host-name')?.textContent?.trim());
    click($('#againBtn'));

    // 5) every other mode from the pack picker
    for (const mode of ['bluff', 'wyr', 'interrogation', 'diss', 'emoji', 'year', 'pinpoint']) {
      click(await waitFor(() => $(`.pack-card[data-mode="${mode}"]`), 'pick ' + mode, 40000));
      await waitFor(() => $('#againBtn'), 'winner ' + mode, 240000);
      console.log('✔', mode, 'complete | winner:', $('.winner-name')?.textContent?.trim());
      click($('#againBtn'));
    }

    // 6) session leaderboard shows on the NEXT GAME screen
    await waitFor(() => $('.session-lb'), 'session leaderboard');
    const pts = $$('.slb-pts').map(e => parseInt(e.textContent.replace(/[^\d]/g, ''), 10));
    if (!pts.some(v => v > 0)) throw new Error('session leaderboard shows no accumulated points');
    console.log('✔ session leaderboard carries totals:', pts.join(','));

    console.log('✔ inputs answered:', answered);
    console.log('ALL PASS ✅');
    process.exit(0);
  } catch (e) { console.error('FAILED ❌', e.message); process.exit(1); }
})();
