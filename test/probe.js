const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const html = fs.readFileSync('index.html','utf8').replace(/<script src="https:[^"]+"><\/script>/g,'').replace(/<link rel="stylesheet"[^>]+>/g,'');
const dom = new JSDOM(html,{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true});
const {window} = dom; const {document} = window;
window.AudioContext = class { constructor(){this.state='running';this.destination={};this.sampleRate=44100;this.currentTime=0;} resume(){} };
window.SAHRA_CONFIG = {firebase:{databaseURL:'PASTE_'},aiEndpoint:null};
let bundle='';
for (const f of ['js/i18n.js','js/audio.js','js/fx.js','js/content.js','js/net.js','js/controller.js','js/host.js','js/main.js']) bundle += fs.readFileSync(f,'utf8')+'\n;\n';
window.eval(bundle);
document.dispatchEvent(new window.Event('DOMContentLoaded'));
setTimeout(()=>{
  const btn = document.querySelector('#langBtn');
  console.log('before click: lang=', document.documentElement.lang, 'dir=', document.documentElement.dir);
  btn.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));
  setTimeout(()=>{
    console.log('after click:  lang=', document.documentElement.lang, 'dir=', document.documentElement.dir);
    console.log('hostBtn text:', document.querySelector('#hostBtn').textContent);
    console.log('body.ar class:', document.body.classList.contains('ar'));
    process.exit(0);
  },100);
},100);
