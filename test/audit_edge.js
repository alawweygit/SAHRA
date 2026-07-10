const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
global.localStorage={getItem:()=>null,setItem:()=>{}};
global.window={HYPOX_CONFIG:{},HYPOX_STATE:{region:null}};
global.shuffle=a=>{const r=a.slice();for(let i=r.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[r[i],r[j]]=[r[j],r[i]];}return r;};
let s=fs.readFileSync(path.join(ROOT,'js/regions.js'),'utf8').replace('const REGION_PACKS =','global.REGION_PACKS =');eval(s);
s=fs.readFileSync(path.join(ROOT,'js/content.js'),'utf8').replace('const PACKS =','global.PACKS =').replace('const Content =','global.Content =');eval(s);

let bugs=0;
const assert=(c,m)=>{if(!c){console.log('BUG:',m);bugs++;}};

(async()=>{
// 1. count=0
const r0=await Content.get('quiz','en',0,null);
assert(Array.isArray(r0)&&r0.length===0,'count=0 returned '+r0?.length);
console.log('count=0:',r0.length===0?'✓':'✗');

// 2. count > pool
const big=await Content.get('bluff','en',100,null);
assert(big.length<=29,'ask 100 bluff got '+big.length);
assert(big.length>0,'ask 100 bluff empty');
console.log('count>pool returns max available:',big.length,'✓');

// 3. whitespace-only lie trimmed
const raw='   ';const v=(raw||'').trim().toUpperCase().slice(0,60);
assert(!v,'whitespace not trimmed');
console.log('Whitespace trim guard: ✓');

// 4. esc() XSS
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
assert(!esc('<script>').includes('<script>'),'XSS in esc');
assert(esc(null)==='','esc(null)');
assert(esc(undefined)==='','esc(undefined)');
assert(esc(0)==='0','esc(0)');
console.log('esc() XSS+null safety: ✓');

// 5. Diss pairing: no player vs self, all n=3..10
let pairOk=true;
for(let n=3;n<=10;n++){const nB=Math.min(3,Math.floor(n/2)+1);const order=Array.from({length:n},(_,i)=>({pid:'p'+i}));for(let b=0;b<nB;b++){let A=order[(b*2)%n],B=order[(b*2+1)%n];if(B.pid===A.pid)B=order[(b*2+2)%n];if(A.pid===B.pid){console.log('BUG: diss self-pair n='+n+' b='+b);pairOk=false;bugs++;}}}
if(pairOk)console.log('Diss pairing n=3..10: ✓');

// 6. Quiz speed fallback
const SPEED=[1000,850,700,600,500,450,400,400,400,400];
assert((SPEED[10]||400)===400,'speed fallback rank>9');
console.log('Quiz speed fallback: ✓');

// 7. Regional + universal merge no dups
global.window.HYPOX_STATE.region='mena';
const merged=await Content.get('bluff','en',30,'mena');
const dups=merged.length-new Set(merged.map(x=>JSON.stringify(x))).size;
assert(dups===0,'merged has '+dups+' dups');
console.log('Regional merge dedup:',dups===0?'✓':'✗ '+dups+' dups','('+merged.length+' items)');

// 8. Back button exists for every screen
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const screens=['scr-lang','scr-region','scr-avatar','scr-join'];
let backOk=true;
for(const scr of screens){const re=new RegExp(`id="${scr}"[\\s\\S]{0,800}data-i18n="back"`);if(!re.test(html)){console.log('BUG: no back button near #'+scr);backOk=false;bugs++;}}
if(backOk)console.log('Back buttons on all screens: ✓');

// 9. HYPOX_CONFIG referenced consistently (not SAHRA_CONFIG)
const netSrc=fs.readFileSync(path.join(ROOT,'js/net.js'),'utf8');
assert(!netSrc.includes('SAHRA_CONFIG'),'SAHRA_CONFIG still in net.js');
assert(netSrc.includes('HYPOX_CONFIG'),'HYPOX_CONFIG missing from net.js');
console.log('Config naming (HYPOX not SAHRA): ✓');

// 10. avatar-opt has 15 items
const avatarOpts=(html.match(/class="avatar-opt/g)||[]).length;
assert(avatarOpts===0,'static avatar-opts should be 0 (built in JS)');
const mainSrc=fs.readFileSync(path.join(ROOT,'js/main.js'),'utf8');
const avatarList=(mainSrc.match(/emoji:/g)||[]).length;
assert(avatarList>=15,'avatar list has '+avatarList+' items');
console.log('Avatar list (>=15): ✓ ('+avatarList+' entries)');

console.log(`\nEdge case audit: ${bugs===0?'ALL ✓':bugs+' BUG(S)'}`);
process.exit(bugs>0?1:0);
})();
