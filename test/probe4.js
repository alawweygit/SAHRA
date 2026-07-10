const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync('index.html','utf8').replace(/<script src="https:[^"]+"><\/script>/g,'').replace(/<link rel="stylesheet"[^>]+>/g,'');
const dom = new JSDOM(html,{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true});
const {window} = dom; const {document} = window;
window.AudioContext = class { constructor(){this.state='running';this.destination={};this.sampleRate=44100;this.currentTime=0;} resume(){} createOscillator(){return{type:'',frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(x){return x},start(){},stop(){}}} createGain(){return{gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(x){return x}}} createBuffer(){return{getChannelData(){return new Float32Array(64)}}} createBufferSource(){return{buffer:null,connect(x){return x},start(){}}} createBiquadFilter(){return{type:'',frequency:{value:0},connect(x){return x}}} };
window.HTMLCanvasElement.prototype.getContext = () => null;
window.SAHRA_CONFIG = {firebase:{databaseURL:'PASTE_'},aiEndpoint:null};
let bundle='';
for (const f of ['js/i18n.js','js/audio.js','js/fx.js','js/content.js','js/net.js','js/controller.js','js/host.js','js/main.js']) bundle += fs.readFileSync(f,'utf8')+'\n;\n';
bundle = bundle
  .replace("$('#langBtn').addEventListener('click', () => {", "$('#langBtn').addEventListener('click', () => { console.log('LANG BTN CLICKED, LANG was', LANG);")
  .replace('function applyLang() {', "function applyLang() { console.log('applyLang called, LANG=', LANG);");
window.eval(bundle);
document.dispatchEvent(new window.Event('DOMContentLoaded'));
setTimeout(()=>{
  document.querySelector('#langBtn').dispatchEvent(new window.MouseEvent('click',{bubbles:true}));
  setTimeout(()=>{ console.log('final dir:', document.documentElement.dir, 'lang:', document.documentElement.lang); process.exit(0); },100);
},100);
