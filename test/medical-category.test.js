const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const contentSource = fs.readFileSync('js/content.js', 'utf8');
const mainSource = fs.readFileSync('js/main.js', 'utf8');
const i18nSource = fs.readFileSync('js/i18n.js', 'utf8');

const sandbox = {
  window: { HYPOX_STATE: { aiEnabled: false, flavor: 'global' }, HYPOX_CONFIG: {} },
  document: { createElement: () => ({ style: {}, remove() {} }), body: { appendChild() {} } },
  setTimeout,
  clearTimeout,
  console,
};
vm.createContext(sandbox);
vm.runInContext(`${contentSource}\nthis.__TRIVIA_CATS__ = TRIVIA_CATS;`, sandbox);

const medical = sandbox.__TRIVIA_CATS__.medical;
assert.ok(medical, 'Pharmacy must have a dedicated trivia bank');

for (const lang of ['en', 'ar']) {
  const questions = medical[lang];
  assert.ok(Array.isArray(questions), `Pharmacy ${lang} bank must be an array`);
  assert.ok(questions.length >= 15, `Pharmacy ${lang} must cover the 15-round option without repeats`);

  const seenQuestions = new Set();
  for (const [index, question] of questions.entries()) {
    assert.ok(question.q && question.q.trim(), `Pharmacy ${lang} question ${index + 1} needs text`);
    assert.equal(question.options.length, 4, `Pharmacy ${lang} question ${index + 1} needs four choices`);
    assert.ok(Number.isInteger(question.correct) && question.correct >= 0 && question.correct < 4,
      `Pharmacy ${lang} question ${index + 1} needs a valid correct answer`);
    assert.equal(new Set(question.options.map(option => option.trim().toLocaleLowerCase())).size, 4,
      `Pharmacy ${lang} question ${index + 1} choices must be unique`);
    assert.ok(question.options[question.correct].trim(), `Pharmacy ${lang} question ${index + 1} correct choice cannot be empty`);

    const normalized = question.q.trim().toLocaleLowerCase();
    assert.ok(!seenQuestions.has(normalized), `Pharmacy ${lang} questions must not repeat`);
    seenQuestions.add(normalized);
  }
}

assert.match(mainSource, /id:'medical',icon:'💊',name:'Pharmacy',nameAr:'صيدلة'/,
  'Pharmacy (formerly Medical) must appear in the Questions category picker');
assert.match(i18nSource, /cat_medical:\s*'Pharmacy'/, 'Pharmacy needs an English label');
assert.match(i18nSource, /cat_medical:\s*'صيدلة'/, 'Pharmacy needs an Arabic label');

console.log(`Pharmacy category passed: ${medical.en.length} English + ${medical.ar.length} Arabic questions`);
