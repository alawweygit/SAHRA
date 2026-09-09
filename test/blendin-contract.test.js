const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const contentSource = fs.readFileSync(path.join(ROOT, 'js/content.js'), 'utf8');
const hostSource = fs.readFileSync(path.join(ROOT, 'js/host.js'), 'utf8');
const cssSource = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');

global.window = {
  HYPOX_STATE: {}, HYPOX_CONFIG: {},
  localStorage: { getItem() { return null; }, setItem() {} },
};
eval(contentSource.replace(/^const PACKS =/m, 'global.PACKS ='));

const triviaOpening = /^(?:what|which|who|where|when|why|how many|how much|name the|ما هو|ما هي|ما اسم|من هو|من هي|أين|اين|متى|كم|وش اسم|ايش اسم)(?=\s|$)/iu;
for (const lang of ['en', 'ar']) {
  const pairs = PACKS.blendin[lang];
  assert.ok(pairs.length >= 30, `Blend In ${lang} needs a deep curated fallback pool`);
  for (const pair of pairs) {
    for (const prompt of [pair.a, pair.b]) {
      assert.ok(prompt && typeof prompt === 'string');
      assert.doesNotMatch(prompt, /[?؟]/u, `Blend In ${lang} must use prompts, not questions: ${prompt}`);
      assert.doesNotMatch(prompt, triviaOpening, `Blend In ${lang} must reject trivia wording: ${prompt}`);
      assert.ok(prompt.trim().split(/\s+/).length <= 14, `Blend In prompt is too long: ${prompt}`);
    }
    assert.notEqual(pair.a, pair.b);
  }
}

assert.match(contentSource, /if \(!validClientItem\(mode, item\)\) continue/,
  'the browser must reject stale trivia returned by an older AI backend');

const blendStart = hostSource.indexOf('async function playBlendIn()');
const blendEnd = hostSource.indexOf('// v115 — Blend In', blendStart);
const blend = hostSource.slice(blendStart, blendEnd);
const revealStart = blend.indexOf('// ---- Reveal: grouped BY PROMPT');
const discussionStart = blend.indexOf('// ---- Discussion ----', revealStart);
const reveal = blend.slice(revealStart, discussionStart);
assert.match(reveal, /setPill\(`\$\{LANG==='ar'\?'المهمة':'Prompt'\} \$\{q\+1\}/,
  'each reveal must update the global progress pill to its own prompt number');
assert.match(reveal, /await waitNext\(12, LANG==='ar' \? 'التالي' : 'Next'\)/,
  'reveals must use Next, allowing only prompt 3 of 3 to become Final Results');
assert.match(blend, /blendin-prompt-pairs/);
assert.match(blend, /blendin-prompt-pair/);
assert.match(cssSource, /\.blendin-prompt-pair \.tm-score-name,[\s\S]*white-space:normal/,
  'full prompt pairs must wrap on phones instead of using score-row ellipsis');

new Function(hostSource);
console.log('BLEND IN CONTRACT PASSED ✅');
