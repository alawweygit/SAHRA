const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname,'..');
const html = fs.readFileSync(path.join(ROOT,'index.html'),'utf8').replace(/<script src="https:[^"]+"><\/script>/g,'').replace(/<link rel="stylesheet"[^>]+>/g,'');
const dom = new JSDOM(html,{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true});
const {window}=dom,{document}=window;
const fp=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
class FN{constructor(){this.type='';this.buffer=null;this.Q=fp();for(const p of['frequency','gain','threshold','knee','ratio','attack','release','detune'])this[p]=fp();}connect(x){return x}start(){}stop(){}}
window.AudioContext=class{constructor(){this.currentTime=0;this.sampleRate=44100;this.destination=new FN();this.state='running';}resume(){}createOscillator(){return new FN()}createGain(){return new FN()}createBuffer(c,l){return{getChannelData(){return new Float32Array(64)}}}createBufferSource(){return new FN()}createBiquadFilter(){return new FN()}createDynamicsCompressor(){return new FN()}createConvolver(){return new FN()}};
window.HTMLCanvasElement.prototype.getContext=()=>null;
window.HTMLMediaElement.prototype.play=()=>Promise.resolve();
window.HTMLMediaElement.prototype.pause=()=>{};
window.HYPOX_CONFIG={firebase:{databaseURL:'PASTE_'},aiEndpoint:null};
window.alert=()=>{};window.prompt=()=>'ALI';
const files=['js/i18n.js','js/audio.js','js/fx.js','js/regions.js','js/content.js','js/net.js','js/controller.js','js/host.js','js/main.js'];
let bundle='';
for(const f of files){let s=fs.readFileSync(path.join(ROOT,f),'utf8');if(f==='js/fx.js')s=s.replace('const sleep = ms => new Promise(r => setTimeout(r, ms));','const sleep = ms => new Promise(r => setTimeout(r, Math.max(1,ms/10)));');bundle+=s+'\n;\n';}
window.eval(bundle);
document.dispatchEvent(new window.Event('DOMContentLoaded'));
const $=s=>document.querySelector(s);const $$=s=>[...document.querySelectorAll(s)];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const click=el=>el&&el.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));
async function waitFor(fn,l,to=30000){const t0=Date.now();while(Date.now()-t0<to){const v=fn();if(v)return v;await sleep(20);}throw new Error('TIMEOUT: '+l);}
let answered=0;
async function autopilot(){for(;;){await sleep(25);
  for(const id of['startModeBtn','nextBtn','ppReady']){const b=$('#'+id);if(b&&!b.disabled){click(b);await sleep(50);}}
  if(window.__hypoxSkip){window.__hypoxSkip();await sleep(50);continue;}
  const ov=$('#ppOverlay');
  const scope=(ov&&ov.classList.contains('show'))?ov:$('#ctrlArea');
  if(!scope)continue;
  const ta=scope.querySelector('textarea:not(:disabled)');
  if(ta){ta.value='BOT'+Math.random();const b=scope.querySelector('.ctrl-submit');if(b&&!b.disabled){click(b);answered++;await sleep(70);}continue;}
  const ch=scope.querySelectorAll('.choice-btn:not(:disabled):not(.picked)');
  if(ch.length){click(ch[Math.floor(Math.random()*ch.length)]);answered++;await sleep(70);}
}}
(async()=>{try{
  click(await waitFor(()=>$('.theme-card[data-theme="dark"]'),'theme'));
  click(await waitFor(()=>$('.lang-card[data-lang="en"]'),'lang'));
  click(await waitFor(()=>$('#scr-region.active .region-card[data-region="mena"]'),'region'));
  await waitFor(()=>$('#scr-title.active'),'title');
  click($('#offlineBtn'));
  await waitFor(()=>$('#scr-lobby').classList.contains('active'),'lobby');
  for(const nm of['ALI','MAITHAM','RAMY','NOURA']){
    click($('#addLocalBtn'));
    await waitFor(()=>$('#scr-avatar').classList.contains('active'),'avatar');
    $('#avatarName').value=nm; click($('#avatarDone'));
    await waitFor(()=>$('#scr-lobby').classList.contains('active'),'lobby back');
    await sleep(50);
  }
  console.log('✔ flow: theme→lang→region→title→lobby, 4 players via avatar picker');
  autopilot();
  click($('#startGameBtn'));
  await waitFor(()=>$('.pack-grid'),'pack picker');
  for(const mode of['quiz','bluff','wyr','interrogation','diss']){
    click(await waitFor(()=>$(`.pack-card[data-mode="${mode}"]`),'pick '+mode,40000));
    await waitFor(()=>$('#againBtn'),'winner '+mode,240000);
    console.log('✔',mode,'complete | winner:',document.querySelector('.winner-name')?.textContent?.trim());
    click($('#againBtn'));
  }
  console.log('✔ inputs answered:',answered);
  console.log('\nALL MODES PASSED ✅');process.exit(0);
}catch(e){console.error('\nFAILED ❌',e.message,e.stack?.split('\n')[1]);process.exit(1);}})();
