/* SAHRA smoke test — plays the actual game headlessly in jsdom.
   Pass & Play mode, 4 bot players, runs MAJLIS QUIZ then BLUFF BANQUET. */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  // strip external CDN scripts (no network in test; firebase guarded by typeof check)
  .replace(/<script src="https:[^"]+"><\/script>/g, '')
  .replace(/<link rel="stylesheet"[^>]+>/g, '');

const dom = new JSDOM(html, {
  url: 'http://localhost/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
});
const { window } = dom;
const { document } = window;

// --- stubs for APIs jsdom lacks ---
const fakeParam = () => ({ value: 0, setValueAtTime(){}, linearRampToValueAtTime(){}, exponentialRampToValueAtTime(){} });
class FakeNode {
  constructor(){ this.type=''; this.buffer=null; this.Q=fakeParam();
    for (const p of ['frequency','gain','threshold','knee','ratio','attack','release','detune']) this[p]=fakeParam(); }
  connect(x){ return x; } start(){} stop(){}
}
class FakeAudioCtx {
  constructor(){ this.currentTime = 0; this.sampleRate = 44100; this.destination = new FakeNode(); this.state='running'; }
  resume(){}
  createOscillator(){ return new FakeNode(); }
  createGain(){ return new FakeNode(); }
  createBuffer(ch, len){ return { getChannelData(){ return new Float32Array(Math.min(len||64, 128)); } }; }
  createBufferSource(){ return new FakeNode(); }
  createBiquadFilter(){ return new FakeNode(); }
  createDynamicsCompressor(){ return new FakeNode(); }
  createConvolver(){ return new FakeNode(); }
}
window.AudioContext = FakeAudioCtx;
window.HTMLCanvasElement.prototype.getContext = () => null; // FX guards on !ctx
window.SAHRA_CONFIG = { firebase: { databaseURL: 'PASTE_' }, aiEndpoint: null };

// --- load our scripts in order, with sleep() accelerated 8x for test speed ---
const files = ['js/i18n.js','js/audio.js','js/fx.js','js/regions.js','js/content.js','js/net.js','js/controller.js','js/host.js','js/main.js'];
let bundle = '';
for (const f of files) {
  let src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (f === 'js/fx.js') {
    src = src.replace(
      'const sleep = ms => new Promise(r => setTimeout(r, ms));',
      'const sleep = ms => new Promise(r => setTimeout(r, Math.max(1, ms / 8)));'
    );
  }
  bundle += src + '\n;\n';
}
try { window.eval(bundle); } catch (e) { console.error('EVAL FAIL', e.message); process.exit(1); }
document.dispatchEvent(new window.Event('DOMContentLoaded'));

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const click = el => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

async function waitFor(fn, label, timeout = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = fn();
    if (v) return v;
    await sleep(40);
  }
  throw new Error('TIMEOUT waiting for: ' + label);
}

let inputsAnswered = 0;
/* Autopilot: whenever the pass&play overlay shows, tap ready + answer */
async function autopilot() {
  for (;;) {
    await sleep(50);
    const ready = $('#ppReady');
    if (ready) { click(ready); await sleep(80); continue; }
    const ov = $('#ppOverlay');
    if (!ov || !ov.classList.contains('show')) continue;
    const ta = ov.querySelector('textarea:not(:disabled)');
    if (ta) {
      ta.value = 'BOT LINE ' + Math.floor(Math.random() * 1e5);
      const btn = ov.querySelector('.ctrl-submit');
      if (btn && !btn.disabled) { click(btn); inputsAnswered++; await sleep(120); }
      continue;
    }
    const choices = ov.querySelectorAll('.choice-btn:not(:disabled):not(.picked)');
    if (choices.length) {
      click(choices[Math.floor(Math.random() * choices.length)]);
      inputsAnswered++;
      await sleep(120);
    }
  }
}

/* Auto-skip mode title cards */
async function autoskip() {
  for (;;) {
    await sleep(400);
    const skip = $('#skipBtn');
    if (skip && !skip.classList.contains('hidden')) click(skip);
  }
}

async function playMode(mode) {
  const card = await waitFor(() => $(`.pack-card[data-mode="${mode}"]`), 'pack picker: ' + mode, 40000);
  console.log('▶ starting mode:', mode);
  click(card);
  const again = await waitFor(() => $('#againBtn'), 'winner screen for ' + mode, 240000);
  const winner = $('.winner-name')?.textContent?.trim();
  console.log('✔ mode complete:', mode, '— winner:', winner);
  const scores = window.eval('JSON.stringify((typeof players!=="undefined")?players:[])');
  click(again);
  return winner;
}

(async () => {
  try {
    // Language picker → English
    const langCard = await waitFor(() => $('.lang-card[data-lang="en"]'), 'language picker');
    click(langCard);
    console.log('✔ language picker: chose English');

    // Region picker → Middle East
    const regionCard = await waitFor(() => $('#scr-region.active .region-card[data-region="mena"]'), 'region picker');
    click(regionCard);
    console.log('✔ region picker: chose Middle East, state.region =', window.SAHRA_STATE.region);

    // Title → Pass & Play
    await waitFor(() => $('#scr-title.active #offlineBtn'), 'title screen');
    click($('#offlineBtn'));
    await waitFor(() => $('#scr-lobby').classList.contains('active'), 'lobby');
    console.log('✔ lobby reached (offline mode), room pill =', $('#roomCodeText').textContent);

    // Add 4 players
    for (const name of ['ALI', 'MAITHAM', 'RAMY', 'NOURA']) {
      $('#localName').value = name;
      click($('#addLocalBtn'));
      await sleep(60);
    }
    const n = $$('#playerRow .player').length;
    if (n !== 4) throw new Error('expected 4 players in lobby, got ' + n);
    console.log('✔ 4 players added');

    // Start → pack picker
    autopilot(); autoskip();
    click($('#startGameBtn'));
    await waitFor(() => $('.pack-grid'), 'pack picker');
    console.log('✔ pack picker shown with', $$('.pack-card').length, 'modes');

    await playMode('quiz');
    await playMode('bluff');
    await playMode('wyr');
    await playMode('interrogation');
    await playMode('diss');

    console.log('✔ total controller inputs auto-answered:', inputsAnswered);
    console.log('\nALL MODES PASSED ✅');
    process.exit(0);
  } catch (e) {
    console.error('\nTEST FAILED ❌', e.message);
    console.error('active screen:', $$('.screen.active').map(s => s.id).join(','));
    console.error('stage snippet:', ($('#hostStage')?.innerHTML || '').slice(0, 300));
    process.exit(1);
  }
})();
