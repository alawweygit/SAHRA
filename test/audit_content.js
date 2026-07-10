const fs = require("fs");
global.shuffle = a => a.slice();
global.window = { SAHRA_CONFIG:{}, SAHRA_STATE:{region:null} };
// expose globals
const wrapExpose = (src, names) => {
  let s = src;
  for (const n of names) s = s.replace(new RegExp(`const ${n}\\s*=`), `global.${n} =`);
  eval(s);
};
wrapExpose(fs.readFileSync("js/regions.js","utf8"), ["REGION_PACKS"]);
wrapExpose(fs.readFileSync("js/content.js","utf8"), ["PACKS","Content"]);

const SHAPES = {
  bluff: p => p && p.fact && p.truth,
  wyr:   p => p && p.a && p.b,
  interrogation: p => p && p.q,
  diss:  p => p && p.p,
  quiz:  p => p && p.q && Array.isArray(p.options) && p.options.length===4 && typeof p.correct==="number" && p.correct>=0 && p.correct<4,
};

let errs = 0;
for (const [mode, valid] of Object.entries(SHAPES)) {
  for (const lang of ["en","ar"]) {
    const pool = global.PACKS[mode]?.[lang];
    if (!pool) { console.log(`MISSING PACKS.${mode}.${lang}`); errs++; continue; }
    pool.forEach((item,i) => { if (!valid(item)) { console.log(`BAD PACKS.${mode}.${lang}[${i}]`, JSON.stringify(item).slice(0,60)); errs++; }});
    process.stdout.write(`  PACKS.${mode}.${lang}: ${pool.length} items ✓\n`);
  }
}

let rerrs = 0;
for (const region of ["mena","weur","asia","africa"]) {
  for (const mode of ["bluff","quiz"]) {
    for (const lang of ["en","ar"]) {
      const pool = global.REGION_PACKS[region]?.[mode]?.[lang];
      if (!pool) { console.log(`MISSING REGION.${region}.${mode}.${lang}`); rerrs++; continue; }
      pool.forEach((item,i) => { if (!SHAPES[mode](item)) { console.log(`BAD REGION.${region}.${mode}.${lang}[${i}]`); rerrs++; }});
    }
  }
}

// Quiz correct-index: must be 0-3 and < options.length
let qerrs = 0;
const checkQuiz = (pool, label) => pool.forEach((q,i) => {
  if (!q.options || q.correct < 0 || q.correct >= q.options.length) {
    console.log(`BAD quiz correct: ${label}[${i}] correct=${q.correct} opts=${q.options?.length}`); qerrs++;
  }
});
for (const lang of ["en","ar"]) checkQuiz(global.PACKS.quiz[lang], `PACKS.quiz.${lang}`);
for (const region of ["mena","weur","asia","africa"]) {
  for (const lang of ["en","ar"]) checkQuiz(global.REGION_PACKS[region].quiz[lang]||[], `REGION.${region}.quiz.${lang}`);
}

console.log(`\nUniversal shapes: ${errs===0?"✓":errs+" ERRORS"}`);
console.log(`Regional shapes: ${rerrs===0?"✓":rerrs+" ERRORS"}`);
console.log(`Quiz correct-index: ${qerrs===0?"✓":qerrs+" ERRORS"}`);

(async () => {
  global.window.SAHRA_STATE.region = "mena";
  const q = await global.Content.get("quiz","en",8,"mena");
  const dups = q.length - new Set(q.map(x=>x.q)).size;
  console.log(`Content.get dedup (mena quiz, ask 8): ${q.length} items, dups=${dups===0?"none ✓":dups+" ✗"}`);
  const b = await global.Content.get("bluff","ar",4,"weur");
  console.log(`Content.get bilingual (weur bluff ar, ask 4): ${b.length} items ✓`);
})().catch(e => { console.log("ASYNC ERR:", e.message); });
