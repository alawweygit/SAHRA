const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const vc = new VirtualConsole();
vc.on('jsdomError', e => console.log('JSDOM ERROR:', e.message, e.detail && e.detail.message));
const html = fs.readFileSync('index.html','utf8').replace(/<script src="https:[^"]+"><\/script>/g,'').replace(/<link rel="stylesheet"[^>]+>/g,'');
const dom = new JSDOM(html,{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc});
const {window} = dom; const {document} = window;
window.AudioContext = class { constructor(){this.state='running';this.destination={};this.sampleRate=44100;this.currentTime=0;} resume(){} };
window.HTMLCanvasElement.prototype.getContext = () => null;
window.SAHRA_CONFIG = {firebase:{databaseURL:'PASTE_'},aiEndpoint:null};
let bundle='';
for (const f of ['js/i18n.js','js/audio.js','js/fx.js','js/content.js','js/net.js','js/controller.js','js/host.js','js/main.js']) bundle += fs.readFileSync(f,'utf8')+'\n;\n';
window.eval(bundle);
document.dispatchEvent(new window.Event('DOMContentLoaded'));
setTimeout(()=>{
  document.querySelector('#langBtn').dispatchEvent(new window.MouseEvent('click',{bubbles:true}));
  setTimeout(()=>{
    console.log('dir=', document.documentElement.dir, '| hostBtn=', document.querySelector('#hostBtn').textContent, '| body.ar=', document.body.classList.contains('ar'));
    process.exit(0);
  },100);
},100);
