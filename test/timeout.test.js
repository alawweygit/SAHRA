/* Reproduces the phones-only stuck-overlay bug: host never answers, timer expires.
   Asserts the overlay closes and the game continues. */
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const { makeFakeFirebase } = require('./fake-firebase');
const ROOT = path.join(__dirname,'..');
const html = fs.readFileSync(path.join(ROOT,'index.html'),'utf8').replace(/<script src="https:[^"]+"><\/script>/g,'').replace(/<link rel="stylesheet"[^>]+>/g,'');
const FB = makeFakeFirebase();
const fakeParam=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
class FN{constructor(){this.type='';this.buffer=null;this.Q=fakeParam();for(const p of['frequency','gain','threshold','knee','ratio','attack','release','detune'])this[p]=fakeParam();}connect(x){return x}start(){}stop(){}}
class AC{constructor(){this.currentTime=0;this.sampleRate=44100;this.destination=new FN();this.state='running';}resume(){}createOscillator(){return new FN()}createGain(){return new FN()}createBuffer(c,l){return{getChannelData(){return new Float32Array(64)}}}createBufferSource(){return new FN()}createBiquadFilter(){return new FN()}createDynamicsCompressor(){return new FN()}createConvolver(){return new FN()}}
const files=['js/i18n.js','js/audio.js','js/fx.js','js/regions.js','js/content.js','js/net.js','js/controller.js','js/host.js','js/main.js'];
const srcs=files.map(f=>{let s=fs.readFileSync(path.join(ROOT,f),'utf8');if(f==='js/fx.js')s=s.replace('const sleep = ms => new Promise(r => setTimeout(r, ms));','const sleep = ms => new Promise(r => setTimeout(r, Math.max(1, ms/10)));');return s;});
function dev(name){
  const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true});
  const {window}=dom,{document}=window;
  window.AudioContext=AC;window.HTMLCanvasElement.prototype.getContext=()=>null;window.firebase=FB;
  window.SAHRA_CONFIG={firebase:{databaseURL:'https://x.firebaseio.com',apiKey:'x'},aiEndpoint:null};
  window.alert=()=>{};window.__name=name;
  let b='';for(const s of srcs)b+=s+'\n;\n';window.eval(b);
  document.dispatchEvent(new window.Event('DOMContentLoaded'));
  return {window,document,$:s=>document.querySelector(s),$$:s=>[...document.querySelectorAll(s)],click:el=>el&&el.dispatchEvent(new window.MouseEvent('click',{bubbles:true}))};
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(fn,l,to=30000){const t0=Date.now();while(Date.now()-t0<to){const v=fn();if(v)return v;await sleep(25);}throw new Error('TIMEOUT '+l);}

(async()=>{
 try{
  const host=dev('ALI');
  host.window.prompt=()=>'ALI';
  host.click(await waitFor(()=>host.$('.lang-card[data-lang="en"]'),'l'));
  host.click(await waitFor(()=>host.$('#scr-region.active .region-card[data-region="global"]'),'r'));
  host.click(await waitFor(()=>host.$('#scr-title.active #phonesBtn'),'p'));
  await waitFor(()=>host.$('#scr-lobby').classList.contains('active'),'lobby');
  const code=host.$('#roomCodeText').textContent.trim();
  // 3 remotes that DO answer fast
  const rem=[];
  for(const nm of ['MAITHAM','RAMY','NOURA']){
    const d=dev(nm);
    d.click(await waitFor(()=>d.$('.lang-card[data-lang="en"]'),'l'));
    d.click(await waitFor(()=>d.$('#scr-region.active .region-card[data-region="global"]'),'r'));
    d.click(await waitFor(()=>d.$('#scr-title.active #joinBtn'),'t'));
    (await waitFor(()=>d.$('#joinCode'),'c')).value=code;
    (await waitFor(()=>d.$('#joinName'),'n')).value=nm;
    d.click(d.$('#joinGo'));
    await waitFor(()=>d.$('#scr-controller').classList.contains('active'),'ctrl');
    // autopilot remotes only
    (async()=>{for(;;){await sleep(30);const sc=d.$('#ctrlArea');if(!sc)continue;const ta=sc.querySelector('textarea:not(:disabled)');if(ta){ta.value='x'+Math.random();const b=sc.querySelector('.ctrl-submit');if(b&&!b.disabled)d.click(b);continue;}const ch=sc.querySelectorAll('.choice-btn:not(:disabled):not(.picked)');if(ch.length)d.click(ch[0]);}})();
    rem.push(d);
  }
  await waitFor(()=>host.$$('#playerRow .player').length===4,'4p');
  // autoskip host title cards but NEVER answer host overlay
  (async()=>{for(;;){await sleep(300);const s=host.$('#skipBtn');if(s&&!s.classList.contains('hidden'))host.click(s);}})();
  host.click(host.$('#startGameBtn'));
  await waitFor(()=>host.$('.pack-grid'),'picker');
  // play quiz — host will NOT answer; timer must expire and overlay must close
  host.click(await waitFor(()=>host.$('.pack-card[data-mode="quiz"]'),'quiz'));

  // At some point host overlay opens (host's own turn). We deliberately ignore it.
  // Assert: game still reaches winner screen AND overlay is closed at the end.
  const again=await waitFor(()=>host.$('#againBtn'),'winner despite host silence',240000);
  const ovOpen=host.$('#ppOverlay').classList.contains('show');
  console.log('reached winner screen with silent host:',!!again);
  console.log('overlay closed at end:',!ovOpen);
  if(ovOpen){console.error('❌ overlay STUCK open');process.exit(1);}
  console.log('\nTIMEOUT-OVERLAY FIX VERIFIED ✅');
  process.exit(0);
 }catch(e){console.error('❌',e.message);process.exit(1);}
})();
