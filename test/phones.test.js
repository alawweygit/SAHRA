/* SAHRA phones-only test.
   Simulates: 1 host phone (creator, also a player) + 3 remote phones,
   all sharing one in-memory Firebase. Host runs the engine; everyone
   answers through their own controller. Plays QUIZ then BLUFF. */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { makeFakeFirebase } = require('./fake-firebase');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace(/<script src="https:[^"]+"><\/script>/g, '')
  .replace(/<link rel="stylesheet"[^>]+>/g, '');

// Shared fake firebase across all "devices"
const FB = makeFakeFirebase();

const fakeParam = () => ({ value: 0, setValueAtTime(){}, linearRampToValueAtTime(){}, exponentialRampToValueAtTime(){} });
class FakeNode { constructor(){ this.type=''; this.buffer=null; this.Q=fakeParam();
  for (const p of ['frequency','gain','threshold','knee','ratio','attack','release','detune']) this[p]=fakeParam(); }
  connect(x){ return x; } start(){} stop(){} }
class FakeAudioCtx {
  constructor(){ this.currentTime=0; this.sampleRate=44100; this.destination=new FakeNode(); this.state='running'; }
  resume(){} createOscillator(){ return new FakeNode(); } createGain(){ return new FakeNode(); }
  createBuffer(c,l){ return { getChannelData(){ return new Float32Array(Math.min(l||64,128)); } }; }
  createBufferSource(){ return new FakeNode(); } createBiquadFilter(){ return new FakeNode(); }
  createDynamicsCompressor(){ return new FakeNode(); } createConvolver(){ return new FakeNode(); }
}

const files = ['js/i18n.js','js/audio.js','js/fx.js','js/regions.js','js/content.js','js/net.js','js/controller.js','js/host.js','js/main.js'];
const srcs = files.map(f => {
  let src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (f === 'js/fx.js') src = src.replace(
    'const sleep = ms => new Promise(r => setTimeout(r, ms));',
    'const sleep = ms => new Promise(r => setTimeout(r, Math.max(1, ms / 10)));');
  return src;
});

function makeDevice(name) {
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom; const { document } = window;
  window.AudioContext = FakeAudioCtx;
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.firebase = FB; // shared backend
  window.SAHRA_CONFIG = { firebase: { databaseURL: 'https://sahra-test.firebaseio.com', apiKey: 'x' }, aiEndpoint: null };
  window.alert = () => {};
  window.__name = name;
  let bundle = '';
  for (const s of srcs) bundle += s + '\n;\n';
  window.eval(bundle);
  document.dispatchEvent(new window.Event('DOMContentLoaded'));
  return { dom, window, document,
    $: s => document.querySelector(s),
    $$: s => Array.from(document.querySelectorAll(s)),
    click(el){ el && el.dispatchEvent(new window.MouseEvent('click',{bubbles:true})); } };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, label, timeout = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { const v = fn(); if (v) return v; await sleep(25); }
  throw new Error('TIMEOUT: ' + label);
}

let answered = 0;
// Autopilot a device's controller (and pass&play overlay for the host's own turns)
function autopilotController(dev) {
  (async () => {
    for (;;) {
      await sleep(35);
      // host-self overlay
      const ready = dev.$('#ppReady');
      if (ready) { dev.click(ready); await sleep(50); continue; }
      const ov = dev.$('#ppOverlay');
      const scope = (ov && ov.classList.contains('show')) ? ov : dev.$('#ctrlArea');
      if (!scope) continue;
      const ta = scope.querySelector('textarea:not(:disabled)');
      if (ta) { ta.value = dev.window.__name + ' ' + Math.floor(Math.random()*1e4);
        const b = scope.querySelector('.ctrl-submit'); if (b && !b.disabled){ dev.click(b); answered++; await sleep(70);} continue; }
      const choices = scope.querySelectorAll('.choice-btn:not(:disabled):not(.picked)');
      if (choices.length) { dev.click(choices[Math.floor(Math.random()*choices.length)]); answered++; await sleep(70); }
    }
  })();
}
function autoskip(dev){ (async()=>{ for(;;){ await sleep(300); const s=dev.$('#skipBtn'); if(s&&!s.classList.contains('hidden')) dev.click(s);} })(); }

(async () => {
  try {
    // ---- HOST device (creator) ----
    const host = makeDevice('HOSTALI');
    // language → en, region → global, then Phones Only
    host.window.prompt = () => 'ALI'; // host player name
    host.click(await waitFor(() => host.$('.lang-card[data-lang="en"]'), 'host lang'));
    host.click(await waitFor(() => host.$('#scr-region.active .region-card[data-region="global"]'), 'host region'));
    host.click(await waitFor(() => host.$('#scr-title.active #phonesBtn'), 'phones btn'));
    await waitFor(() => host.$('#scr-lobby').classList.contains('active'), 'host lobby');
    const code = host.$('#roomCodeText').textContent.trim();
    console.log('✔ host started phones-only, room code =', code);
    if (!code || code.length !== 4) throw new Error('bad room code: ' + code);
    autopilotController(host); autoskip(host);

    // ---- 3 REMOTE devices join ----
    const remotes = [];
    for (const nm of ['MAITHAM','RAMY','NOURA']) {
      const d = makeDevice(nm);
      d.click(await waitFor(() => d.$('.lang-card[data-lang="en"]'), nm+' lang'));
      d.click(await waitFor(() => d.$('#scr-region.active .region-card[data-region="global"]'), nm+' region'));
      d.click(await waitFor(() => d.$('#scr-title.active #joinBtn'), nm+' title'));
      (await waitFor(() => d.$('#joinCode'), nm+' joinCode')).value = code;
      (await waitFor(() => d.$('#joinName'), nm+' joinName')).value = nm;
      d.click(d.$('#joinGo'));
      await waitFor(() => d.$('#scr-controller').classList.contains('active'), nm+' controller');
      autopilotController(d);
      remotes.push(d);
      console.log('✔', nm, 'joined and is on controller screen');
    }

    // host should now see 4 players (ALI + 3)
    await waitFor(() => host.$$('#playerRow .player').length === 4, 'host sees 4 players');
    console.log('✔ host lobby shows', host.$$('#playerRow .player').length, 'players');

    // ---- start game, play 2 modes ----
    host.click(host.$('#startGameBtn'));
    await waitFor(() => host.$('.pack-grid'), 'pack picker');
    console.log('✔ game started, pack picker visible');

    async function playMode(mode) {
      console.log('▶ playing', mode);
      host.click(await waitFor(() => host.$(`.pack-card[data-mode="${mode}"]`), 'pick '+mode, 40000));
      // verify a remote phone's mirror strip lights up during play
      await waitFor(() => { const m = remotes[0].$('#phoneMirror'); return m && !m.classList.contains('hidden'); }, 'remote mirror shows for '+mode, 60000);
      const again = await waitFor(() => host.$('#againBtn'), 'winner '+mode, 240000);
      console.log('  ✔', mode, 'complete — mirror worked, winner:', host.$('.winner-name')?.textContent?.trim());
      host.click(again);
    }
    await playMode('quiz');
    await playMode('bluff');

    console.log('✔ remote mirror strip confirmed populated');
    console.log('✔ total inputs answered across devices:', answered);
    console.log('\nPHONES-ONLY MODE PASSED ✅');
    process.exit(0);
  } catch (e) {
    console.error('\nPHONES-ONLY FAILED ❌', e.message);
    console.error(e.stack?.split('\n').slice(0,4).join('\n'));
    process.exit(1);
  }
})();
