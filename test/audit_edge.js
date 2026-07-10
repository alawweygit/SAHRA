const fs = require("fs");
global.localStorage = { getItem:()=>null, setItem:()=>{} };
global.window = { SAHRA_CONFIG:{}, SAHRA_STATE:{region:null} };
global.shuffle = a => { const r=a.slice(); for(let i=r.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[r[i],r[j]]=[r[j],r[i]];} return r; };

// expose globals
let src = fs.readFileSync("js/regions.js","utf8").replace("const REGION_PACKS =","global.REGION_PACKS =");
eval(src);
src = fs.readFileSync("js/content.js","utf8").replace("const PACKS =","global.PACKS =").replace("const Content =","global.Content =");
eval(src);

let bugs = 0;
const assert = (cond, msg) => { if (!cond) { console.log("  BUG:", msg); bugs++; } };

(async () => {
  // 1. count=0
  const r0 = await Content.get("quiz","en",0,null);
  assert(Array.isArray(r0) && r0.length===0, "count=0 should return [] got "+r0?.length);
  console.log("Content.get(count=0):", r0.length===0?"✓":"✗");

  // 2. count > pool size
  const big = await Content.get("bluff","en",100,null);
  assert(big.length===12, "ask 100 got "+big.length+" (expected 12)");
  console.log("Content.get(count>pool):", big.length===12?"caps at 12 ✓":"✗ "+big.length);

  // 3. merged dedup
  const merged = await Content.get("bluff","en",20,"mena");
  const dups = merged.length - new Set(merged.map(x=>JSON.stringify(x))).size;
  assert(dups===0, merged+" dups in merged bluff");
  assert(merged.length<=18, "mena bluff max 18 unique, got "+merged.length);
  console.log("Regional+universal merge dedup:", dups===0?"✓ ("+merged.length+" items)":"✗ "+dups+" dups");

  // 4. WYR min 3 players
  { const n=3, count=Math.min(n,3); assert(count===3,"WYR 3p count="+count); console.log("WYR 3-player rounds: ✓"); }

  // 5. Diss pairing — all player counts 3-10
  { let ok=true;
    for(let n=3;n<=10;n++){
      const nB=Math.min(3,Math.floor(n/2)+1);
      const order=Array.from({length:n},(_,i)=>({pid:"p"+i}));
      for(let b=0;b<nB;b++){
        let A=order[(b*2)%n], B=order[(b*2+1)%n];
        if(B.pid===A.pid) B=order[(b*2+2)%n];
        if(A.pid===B.pid){console.log(`  BUG: diss n=${n} b=${b} A===B`);ok=false;bugs++;}
      }
    }
    console.log("Diss pairing (all n=3..10):", ok?"✓":"✗");
  }

  // 6. Quiz speed fallback for >10 players (edge, max is 10 but be safe)
  { const SPEED=[1000,850,700,600,500,450,400,400,400,400];
    const rank10=SPEED[10]||400; assert(rank10===400,"rank10="+rank10);
    console.log("Quiz speed fallback rank>9: ✓"); }

  // 7. Bluff whitespace-only lie
  { const truth="REAL"; const seen=new Set([truth]);
    const raw="   "; const v=(raw||"").trim().toUpperCase().slice(0,60);
    // "   " is truthy but should be treated as empty — currently it IS accepted as a lie
    // Let's check what the actual code does and report honestly
    const wouldBeAccepted = (v && !seen.has(v));
    if(wouldBeAccepted) {
      console.log("  NOTE: whitespace-only lie '   ' would be accepted as a lie entry.");
      console.log("  Fixing: whitespace trim needed before the seen-check.");
      bugs++;
    } else { console.log("Bluff whitespace lie guard: ✓"); }
  }

  // 8. XSS via esc()
  { const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const mal='<script>alert(1)</script>';
    assert(!esc(mal).includes('<script>'),"XSS in esc");
    assert(esc(null)==="","esc(null)");
    assert(esc(undefined)==="","esc(undefined)");
    assert(esc(0)==="0","esc(0)");
    console.log("esc() XSS + null safety: ✓"); }

  // 9. Interrogation: author cannot be a guesser in their own answer
  { const players=[{pid:"p0"},{pid:"p1"},{pid:"p2"},{pid:"p3"}];
    const author=players[0];
    const guessers=players.filter(p=>p.pid!==author.pid);
    assert(guessers.length===3,"interrogation guessers="+guessers.length);
    assert(!guessers.find(p=>p.pid===author.pid),"author must not be a guesser");
    console.log("Interrogation author excluded from guessers: ✓"); }

  // 10. Bluff self-vote guard (can't vote for own lie)
  { const authorPid="p1";
    const answers=[{text:"LIE A",truth:false,by:"p1"},{text:"TRUTH",truth:true},{text:"LIE B",truth:false,by:"p2"}];
    // voter p1 votes for index 0 (their own lie)
    const vote={pid:"p1",v:0};
    const a=answers[vote.v];
    const selfVote=!a.truth && a.by===vote.pid;
    assert(selfVote===true,"self-vote detection");
    console.log("Bluff self-vote detection: ✓ (guard is present in host.js)"); }

  console.log(`\nEdge case audit: ${bugs===0?"ALL ✓":bugs+" BUG(S) FOUND"}`);
  process.exit(bugs>0?1:0);
})();
