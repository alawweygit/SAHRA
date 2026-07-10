const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync('index.html','utf8').replace(/<script src="https:[^"]+"><\/script>/g,'').replace(/<link rel="stylesheet"[^>]+>/g,'');
const dom = new JSDOM(html,{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true});
const {window} = dom; const {document} = window;
window.AudioContext = class { constructor(){this.state='running';this.destination={};this.sampleRate=44100;this.currentTime=0;} resume(){} };
window.HTMLCanvasElement.prototype.getContext = () => null;
window.SAHRA_CONFIG = {firebase:{databaseURL:'PASTE_'},aiEndpoint:null};
let bundle='';
for (const f of ['js/i18n.js','js/audio.js','js/fx.js','js/content.js','js/net.js','js/controller.js','js/host.js','js/main.js']) bundle += fs.readFileSync(f,'utf8')+'\n;\n';
// instrument: wrap the DOMContentLoaded registration to confirm handler execution
window.__handlerRan = false;
bundle = bundle.replace("document.addEventListener('DOMContentLoaded', () => {", "document.addEventListener('DOMContentLoaded', () => { window.__handlerRan = true;");
window.eval(bundle);
console.log('readyState before dispatch:', document.readyState);
document.dispatchEvent(new window.Event('DOMContentLoaded'));
setTimeout(()=>{
  console.log('handlerRan:', window.__handlerRan);
  // test offlineBtn transition
  document.querySelector('#offlineBtn').dispatchEvent(new window.MouseEvent('click',{bubbles:true}));
  setTimeout(()=>{
    console.log('lobby active after offline click:', document.querySelector('#scr-lobby').classList.contains('active'));
    document.querySelector('#langBtn').dispatchEvent(new window.MouseEvent('click',{bubbles:true}));
    setTimeout(()=>{ console.log('dir after lang click:', document.documentElement.dir); process.exit(0); },80);
  },200);
},80);
