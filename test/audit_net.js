const fs = require('fs'), path = require('path');
const { makeFakeFirebase } = require('./fake-firebase');
const ROOT = path.join(__dirname,'..');
global.localStorage={getItem:()=>null,setItem:()=>{}};
global.window={HYPOX_CONFIG:{firebase:{databaseURL:'https://x.firebaseio.com'},apiKey:'x'}};
global.firebase = makeFakeFirebase();
let src = fs.readFileSync(path.join(ROOT,'js/net.js'),'utf8')
  .replace('const AVATARS =','global.AVATARS =')
  .replace('const CODE_CHARS =','global.CODE_CHARS =')
  .replace('const makeCode =','global.makeCode =')
  .replace(/^class FirebaseNet/m,'global.FirebaseNet=class FirebaseNet')
  .replace(/^class LocalNet/m,'global.LocalNet=class LocalNet')
  .replace(/^function createNet/m,'global.createNet=function createNet');
eval(src);

let bugs=0;
const API=['createRoom','addLocalPlayer','onPlayers','setState','onState','setMirror','onMirror','onEachInput','collect','updateScore'];
const ln=new LocalNet();
const miss=API.filter(m=>typeof ln[m]!=='function');
miss.length?(console.log('LocalNet missing:',miss),bugs++):console.log('LocalNet API: ✓');
ln.isOffline?console.log('LocalNet.isOffline: ✓'):(console.log('isOffline wrong'),bugs++);
const l2=new LocalNet();for(let i=0;i<10;i++)l2.addLocalPlayer('P'+i);
l2.addLocalPlayer('ov')===null?console.log('Max 10: ✓'):(console.log('11th not rejected'),bugs++);
const l3=new LocalNet(),p=l3.addLocalPlayer('VeryLongPlayerNameHere');
p&&p.name.length<=14?console.log('Name truncation: ✓ ->',p.name):(console.log('Bad truncation'),bugs++);
const l4=new LocalNet(),av={emoji:'🦋',color:'#c084fc'};
const pa=l4.addLocalPlayer('Test',av);
pa&&pa.emoji==='🦋'?console.log('Custom avatar: ✓'):(console.log('Avatar not applied:',pa?.emoji),bugs++);
const INVALID=new Set(['I','O']);
const bad=Array.from({length:1000},()=>makeCode()).filter(c=>[...c].some(ch=>INVALID.has(ch)));
bad.length?(console.log('Code has I/O'),bugs++):console.log('Room codes (no I/O): ✓');
const l5=new LocalNet(),p0=l5.addLocalPlayer('A'),p1=l5.addLocalPlayer('B');
(p0.isVip&&!p1.isVip)?console.log('VIP first-only: ✓'):(console.log('VIP wrong'),bugs++);
const fb=FirebaseNet.create();
const fbmiss=API.filter(m=>typeof fb[m]!=='function');
fbmiss.length?(console.log('FirebaseNet missing:',fbmiss),bugs++):console.log('FirebaseNet API: ✓');
try{ln.setMirror({x:1});ln.onMirror(()=>{});console.log('Mirror no-ops: ✓');}catch(e){console.log('mirror threw:',e.message);bugs++;}
console.log(`\nNet audit: ${bugs===0?'ALL ✓':bugs+' BUG(S)'}`);
