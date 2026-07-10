const fs = require("fs"), path = require("path");
const { makeFakeFirebase } = require("./fake-firebase");
const ROOT = path.join(__dirname,"..");
global.localStorage = { getItem:()=>null, setItem:()=>{} };
global.window = { SAHRA_CONFIG:{firebase:{databaseURL:"https://x.firebaseio.com"},apiKey:"x"} };
global.firebase = makeFakeFirebase();

let src = fs.readFileSync(path.join(ROOT,"js/net.js"),"utf8");
src = src
  .replace("const AVATARS =","global.AVATARS =")
  .replace("const CODE_CHARS =","global.CODE_CHARS =")
  .replace("const makeCode =","global.makeCode =")
  .replace(/^class FirebaseNet/m,"global.FirebaseNet=class FirebaseNet")
  .replace(/^class LocalNet/m,"global.LocalNet=class LocalNet")
  .replace(/^function createNet/m,"global.createNet=function createNet");
eval(src);

let bugs=0;
const req=["createRoom","addLocalPlayer","onPlayers","setState","onState","setMirror","onMirror","onEachInput","collect","updateScore"];

const local=new LocalNet();
const miss=req.filter(m=>typeof local[m]!=="function");
miss.length?(console.log("LocalNet missing:",miss),bugs++):console.log("LocalNet API completeness: ✓");
local.isOffline?console.log("LocalNet.isOffline: ✓"):(console.log("isOffline wrong"),bugs++);

const l2=new LocalNet(); for(let i=0;i<10;i++) l2.addLocalPlayer("P"+i);
l2.addLocalPlayer("ov")===null?console.log("Max 10 players: ✓"):(console.log("11th not rejected"),bugs++);

const l3=new LocalNet(), p=l3.addLocalPlayer("VeryLongPlayerNameHere");
p&&p.name.length<=14?console.log("Name truncation (14): ✓ ->",p.name):(console.log("Name not truncated"),bugs++);

// room code: no I or O  
const INVALID=new Set(["I","O"]);
const codes=Array.from({length:1000},()=>makeCode());
const badCodes=codes.filter(c=>[...c].some(ch=>INVALID.has(ch)));
badCodes.length?(console.log("Code has I/O:",badCodes[0]),bugs++):console.log("Room codes (no I/O): ✓");
// room code length = 4
const wrong4=codes.filter(c=>c.length!==4);
wrong4.length?(console.log("Code length wrong:",wrong4[0]),bugs++):console.log("Room code length (4): ✓");

const fb=FirebaseNet.create();
const fbmiss=req.filter(m=>typeof fb[m]!=="function");
fbmiss.length?(console.log("FirebaseNet missing:",fbmiss),bugs++):console.log("FirebaseNet API completeness: ✓");

const uniq=new Set(AVATARS.slice(0,10).map(a=>a.emoji));
(AVATARS.length>=10&&uniq.size===10)?console.log("10 unique avatars: ✓"):(console.log("Avatar issue"),bugs++);

const l4=new LocalNet(),p0=l4.addLocalPlayer("First"),p1=l4.addLocalPlayer("Second");
(p0.isVip&&!p1.isVip)?console.log("VIP first-only: ✓"):(console.log("VIP wrong"),bugs++);

const l5=new LocalNet();
try{l5.setMirror({x:1});l5.onMirror(()=>{});console.log("LocalNet mirror no-ops: ✓");}
catch(e){console.log("mirror no-op threw:",e.message);bugs++;}
try{l5.setState({});l5.onState(()=>{});console.log("LocalNet state no-ops: ✓");}
catch(e){console.log("state no-op threw:",e.message);bugs++;}

// Avatar colors are valid hex
const badColors=AVATARS.filter(a=>!/^#[0-9a-fA-F]{6}$/.test(a.color));
badColors.length?(console.log("Bad avatar colors:",badColors.map(a=>a.color)),bugs++):console.log("Avatar colors (hex): ✓");

console.log(`\nNet audit: ${bugs===0?"ALL ✓":bugs+" BUG(S) FOUND"}`);
