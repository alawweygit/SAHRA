const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname,'..');
const html = fs.readFileSync(path.join(ROOT,'index.html'),'utf8')
  .replace(/<script src="https:[^"]+"><\/script>/g,'')
  .replace(/<link rel="stylesheet"[^>]+>/g,'');
const dom = new JSDOM(html,{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true});
const {window}=dom,{document}=window;
const fakeParam=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
class FN{constructor(){this.type='';this.buffer=null;this.Q=fakeParam();for(const p of['frequency','gain','threshold','knee','ratio','attack','release','detune'])this[p]=fakeParam();}connect(x){return x}start(){}stop(){}}
window.AudioContext=class{constructor(){this.currentTime=0;this.sampleRate=44100;this.destination=new FN();this.state='running';}resume(){}createOscillator(){return new FN()}createGain(){return new FN()}createBuffer(c,l){return{getChannelData(){return new Float32Array(64)}}}createBufferSource(){return new FN()}createBiquadFilter(){return new FN()}createDynamicsCompressor(){return new FN()}createConvolver(){return new FN()}};
window.HTMLCanvasElement.prototype.getContext=()=>null;
window.SAHRA_CONFIG={firebase:{databaseURL:'PASTE_'},aiEndpoint:null};
window.alert=()=>{};
window.prompt=()=>'ALI';
const files=['js/i18n.js','js/audio.js','js/fx.js','js/regions.js','js/content.js','js/net.js','js/controller.js','js/host.js','js/main.js'];
let bundle='';
for(const f of files){let s=fs.readFileSync(path.join(ROOT,f),'utf8');if(f==='js/fx.js')s=s.replace('const sleep = ms => new Promise(r => setTimeout(r, ms));','const sleep = ms => new Promise(r => setTimeout(r, Math.max(1, ms/10)));');bundle+=s+'\n;\n';}
window.eval(bundle);
document.dispatchEvent(new window.Event('DOMContentLoaded'));
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const click=el=>el&&el.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));
async function waitFor(fn,l,to=30000){const t0=Date.now();while(Date.now()-t0<to){const v=fn();if(v)return v;await sleep(25);}throw new Error('TIMEOUT: '+l);}
let answered=0;
async function autopilot(){for(;;){await sleep(30);
  // skip/next/start buttons
  for(const id of['startModeBtn','nextBtn','ppReady']){const b=$(('#'+id));if(b&&!b.disabled){click(b);await sleep(60);continue;}}
  // auto-advance skip
  if(window.__sahraSkip){window.__sahraSkip();await sleep(60);continue;}
  const ov=$('#ppOverlay');
  const scope=(ov&&ov.classList.contains('show'))?ov:$('#ctrlArea');
  if(!scope)continue;
  const ta=scope.querySelector('textarea:not(:disabled)');
  if(ta){ta.value='BOT'+Math.random();const b=scope.querySelector('.ctrl-submit');if(b&&!b.disabled){click(b);answered++;await sleep(80);}continue;}
  const ch=scope.querySelectorAll('.choice-btn:not(:disabled):not(.picked)');
  if(ch.length){click(ch[Math.floor(Math.random()*ch.length)]);answered++;await sleep(80);}
}}
(async()=>{try{
  // Theme picker
  click(await waitFor(()=>$('.theme-card[data-theme="dark"]'),'theme'));
  // Lang picker
  click(await waitFor(()=>$('.lang-card[data-lang="en"]'),'lang'));
  // Region picker
  click(await waitFor(()=>$('#scr-region.active .region-card[data-region="mena"]'),'region'));
  // Title
  await waitFor(()=>$('#scr-title.active'),'title');
  console.log('✔ theme → lang → region → title');
  // Offline
  click($('#offlineBtn'));
  await waitFor(()=>$('#scr-lobby').classList.contains('active'),'lobby');
  // Add 4 players via avatar screen
  for(const nm of['ALI','MAITHAM','RAMY','NOURA']){
    click($('#addLocalBtn'));
    await waitFor(()=>$('#scr-avatar').classList.contains('active'),'avatar screen');
    $('#avatarName').value=nm;
    click($('#avatarDone'));
    await waitFor(()=>$('#scr-lobby').classList.contains('active'),'back to lobby');
    await sleep(60);
  }
  const n=$$('#playerRow .player').length;
  if(n!==4)throw new Error('expected 4 players, got '+n);
  console.log('✔ 4 players added via avatar picker');
  autopilot();
  click($('#startGameBtn'));
  await waitFor(()=>$('.pack-grid'),'pack picker');
  console.log('✔ pack picker shown');
  for(const mode of['quiz','bluff','wyr','interrogation','diss']){
    const card=await waitFor(()=>$(`.pack-card[data-mode="${mode}"]`),'pick '+mode,40000);
    click(card);
    const again=await waitFor(()=>$('#againBtn'),'winner '+mode,240000);
    console.log('✔ mode complete:',mode,'winner:',document.querySelector('.winner-name')?.textContent?.trim());
    click(again);
  }
  console.log('✔ inputs answered:',answered);
  console.log('\nALL MODES PASSED ✅');
  process.exit(0);
}catch(e){console.error('\nFAILED ❌',e.message);process.exit(1);}})();
