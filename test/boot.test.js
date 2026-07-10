const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname,'..');
const html = fs.readFileSync(path.join(ROOT,'index.html'),'utf8').replace(/<script src="https:[^"]+"><\/script>/g,'').replace(/<link rel="stylesheet"[^>]+>/g,'');
const dom = new JSDOM(html,{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true});
const {window}=dom,{document}=window;
const fakeParam=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
class FN{constructor(){this.type='';this.buffer=null;this.Q=fakeParam();for(const p of['frequency','gain','threshold','knee','ratio','attack','release','detune'])this[p]=fakeParam();}connect(x){return x}start(){}stop(){}}
window.AudioContext=class{constructor(){this.currentTime=0;this.sampleRate=44100;this.destination=new FN();this.state='running';}resume(){}createOscillator(){return new FN()}createGain(){return new FN()}createBuffer(c,l){return{getChannelData(){return new Float32Array(64)}}}createBufferSource(){return new FN()}createBiquadFilter(){return new FN()}createDynamicsCompressor(){return new FN()}createConvolver(){return new FN()}};
window.HTMLCanvasElement.prototype.getContext=()=>null;
window.SAHRA_CONFIG={firebase:{databaseURL:'PASTE_'},aiEndpoint:null};
let b='';for(const f of ['js/i18n.js','js/audio.js','js/fx.js','js/regions.js','js/content.js','js/net.js','js/controller.js','js/host.js','js/main.js'])b+=fs.readFileSync(path.join(ROOT,f),'utf8')+'\n;\n';
window.eval(b);
document.dispatchEvent(new window.Event('DOMContentLoaded'));
const $=s=>document.querySelector(s), click=el=>el.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));
setTimeout(()=>{
  const checks=[];
  checks.push(['lang screen active first', $('#scr-lang').classList.contains('active')]);
  // pick Arabic
  click($('.lang-card[data-lang="ar"]'));
  setTimeout(()=>{
    checks.push(['dir=rtl after AR', document.documentElement.dir==='rtl']);
    checks.push(['region screen active', $('#scr-region').classList.contains('active')]);
    checks.push(['region title in arabic', $('[data-i18n="choose_region"]').textContent==='من وين تلعبون؟']);
    // pick a region
    click($('.region-card[data-region="mena"]'));
    setTimeout(()=>{
      checks.push(['title screen active', $('#scr-title').classList.contains('active')]);
      checks.push(['region badge set', $('#regionBadge').textContent==='🕌']);
      checks.push(['3 play cards present', document.querySelectorAll('.play-card').length===3]);
      checks.push(['phones btn exists', !!$('#phonesBtn')]);
      checks.push(['play mode text arabic', $('[data-i18n="mode_phones"]').textContent==='جوالات فقط']);
      // back to region via badge
      click($('#regionBadge'));
      checks.push(['badge reopens region', $('#scr-region').classList.contains('active')]);
      let ok=true;
      for(const [name,pass] of checks){ console.log((pass?'✔':'�’✗ FAIL')+' '+name); if(!pass)ok=false; }
      console.log(ok?'\nBOOT + PICKERS PASSED ✅':'\nBOOT FAILED ❌');
      process.exit(ok?0:1);
    },100);
  },100);
},100);
