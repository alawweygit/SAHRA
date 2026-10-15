const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.join(__dirname, '../..');
const { makeFakeFirebase } = require('../fake-firebase');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
const files = ['i18n', 'audio', 'fx', 'regions', 'content', 'maps', 'net', 'controller', 'host', 'main'];
const delay = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, label, ms = 8000) { const until = Date.now()+ms; while(Date.now()<until){const v=fn();if(v)return v;await delay(20);}throw Error('Timeout: '+label); }
function createHarness({ scale=20 }={}) {
const fb=makeFakeFirebase(),errors=[],devices=[];
let stopped=false;
const started=Date.now();
function device(lang='en',name='Player') {
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
  const w=dom.window;
  const originalTimeout=w.setTimeout.bind(w),originalInterval=w.setInterval.bind(w);
  w.setTimeout=(fn,ms,...args)=>originalTimeout(fn,Math.max(1,ms/scale),...args);
  w.setInterval=(fn,ms,...args)=>originalInterval(fn,Math.max(2,ms/scale),...args);
  w.Date.now=()=>started+(Date.now()-started)*scale;
  w.HTMLCanvasElement.prototype.getContext=()=>null;
  const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}});
  class Node {constructor(){this.type='';this.buffer=null;this.Q=param();for(const p of ['frequency','gain','threshold','knee','ratio','attack','release','detune'])this[p]=param();}connect(x){return x;}start(){}stop(){}}
  w.AudioContext=class{constructor(){this.currentTime=0;this.sampleRate=44100;this.destination=new Node();this.state='running';}resume(){return Promise.resolve();}createOscillator(){return new Node();}createGain(){return new Node();}createBuffer(c,l){return {getChannelData(){return new Float32Array(64);}};}createBufferSource(){return new Node();}createBiquadFilter(){return new Node();}createDynamicsCompressor(){return new Node();}createConvolver(){return new Node();}};
  w.HTMLMediaElement.prototype.play=()=>Promise.resolve();
  w.HTMLMediaElement.prototype.pause=()=>{};
  w.scrollTo=()=>{};
  // jsdom omits this browser API; game-generated FX ids are attribute values.
  w.CSS={escape:value=>String(value).replace(/[^a-zA-Z0-9_-]/g,c=>'\\'+c.codePointAt(0).toString(16)+' ')};
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  w.alert=message=>errors.push('Alert: '+message);
  w.confirm=()=>true;
  w.firebase=fb;
  w.HYPOX_CONFIG={firebase:{databaseURL:'https://audit.firebaseio.com',apiKey:'test'},aiEndpoint:null};
  w.localStorage.setItem('hypox_lang',lang);
  w._hypoxTestMode=true;
  w.eval(fs.readFileSync(path.join(root,'test/maplibre-browser-stub.js'),'utf8'));
  w.eval(files.map(name=>fs.readFileSync(path.join(root,'js',name+'.js'),'utf8')).join('\n;\n')+'\nwindow.__testContent=Content;');
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const d={name,dom,w,$:s=>w.document.querySelector(s),$$:s=>[...w.document.querySelectorAll(s)],click:s=>{const el=typeof s==='string'?w.document.querySelector(s):s;assert.ok(el,'Missing '+s);el.click();}};
  devices.push(d);return d;
}

async function room(mode,lang='en',count=4){
 const host=device(lang,'Host');
 await waitFor(()=>host.$('#scr-title.active'),'landing');
 host.click('#heroStart');host.click(`.title-game-card[data-mode="${mode}"]`);
 host.w.HYPOX_STATE.rounds=1;host.w.HYPOX_STATE.aiEnabled=false;
 host.click('#pgStartBtn');
 await waitFor(()=>host.$('#scr-avatar.active'),'host avatar');
 host.$('#avatarName').value='Host';host.click('#avatarDone');
 await waitFor(()=>host.$('#scr-lobby.active'),'host lobby');
 const code=JSON.parse(host.w.sessionStorage.getItem('hypox_session')).code;
 for(let i=1;i<count;i++){
  const guest=device(lang,'Guest'+i);guest.click('#joinBtn');
  guest.$('#joinCode').value=code;guest.$('#joinName').value=guest.name;
  guest.click(`.join-av[data-i="${i}"]`);guest.click('#joinGo');
  await waitFor(()=>guest.$('#scr-controller.active'),'guest controller');
 }
 await waitFor(()=>host.$$('#playerRow .player').length===count,'complete roster');
 return {host,code,guests:devices.filter(d=>d!==host)};
}
function autopilot(host,{silentHost=false,holdMedicalReveal=false}={}){
 let answers=0,running=true;
 const loop=(async()=>{
  while(!stopped&&running){
   await delay(8);if(stopped||!running)break;
   if(typeof host.w.__hypoxSkip==='function'&&!(holdMedicalReveal&&host.$('.medical-source-links')))host.w.__hypoxSkip();
   for(const d of devices){
    if(silentHost&&d===host)continue;
    const fields=d.$$('.ctrl-input:not(:disabled),.tm-year-input:not(:disabled)');
    fields.forEach((input,i)=>{
     if(input.value.trim())return;
     input.value=input.classList.contains('tm-year-input')?'2000':d.name+'WORD'+i;
     input.dispatchEvent(new d.w.Event('input',{bubbles:true}));
    });
    for(const shell of d.$$('.ctrl-map .hypox-map-shell')){
     const raw=shell._hypoxMapInstance?.raw;
     raw?.handlers.click?.forEach(fn=>fn({lngLat:{lat:24,lng:45}}));
    }
    const choice=d.$('.choice-btn:not(:disabled):not(.picked)');
    if(choice){choice.click();answers++;continue;}
    const submit=d.$('.ctrl-submit:not(:disabled),.tm-submit-btn:not(:disabled)');
    if(submit){submit.click();answers++;}
   }
  }
 })();
 return {get answers(){return answers;},loop,stop(){running=false;}};
}
async function finish(host,options={}){
 const pilot=autopilot(host,options);
 if(!options.alreadyStarted)host.click('#startGameBtn');
 await waitFor(()=>host.$('#againBtn')||host.$('#againBtnSL'),'game final controls',20000);
 assert.ok(pilot.answers>0,'real controller inputs must have been submitted');
 assert.equal(host.$('#ppOverlay')?.classList.contains('show'),false,'privacy/input overlay must close');
 assert.equal(errors.length,0,'uncaught UI errors: '+JSON.stringify(errors));
 pilot.stop();await pilot.loop;
 return pilot;
}
function close(){stopped=true;for(const d of devices)d.dom.window.close();}
return {device,room,finish,close,devices,errors,fb,waitFor};
}
module.exports={createHarness,waitFor,delay};
