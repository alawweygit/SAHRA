const assert = require('node:assert/strict');
const Module = require('node:module');

const routes = new Map();
const generationRequests = [];
const verificationRequests = [];
let rejectMedical = false;

function sample(mode, index) {
  const suffix = String(index + 1);
  const samples = {
    bluff: { fact: `A surprising fact ${suffix} contains ___ creatures`, truth: `ANSWER${suffix}`, decoys: [`WRONG${suffix}A`, `WRONG${suffix}B`, `WRONG${suffix}C`, `WRONG${suffix}D`] },
    wyr: { a: `Option A ${suffix}`, b: `Option B ${suffix}` },
    interrogation: { q: `[NAME] just did something ${suffix}. What was it?` },
    diss: { p: `Roast prompt ${suffix}` },
    quiz: { q: `Trivia question ${suffix}?`, options: ['A', 'B', 'C', 'D'], correct: index % 4 },
    mostlikely: { q: `Who is most likely to do thing ${suffix}?` },
    trueorlie: { s: `Statement ${suffix}`, truth: index % 2 === 0, ...(index % 2 !== 0 ? { correction: `Corrected statement ${suffix}` } : {}) },
    pinpoint: { en: `City ${suffix}`, ar: `مدينة ${suffix}`, countryEn: 'Country', countryAr: 'دولة', lat: 20 + index, lon: 50 + index },
    emoji: { answer: `WORD${suffix}`, category: 'Word', e: '🌊🦉', parts: ['sea', 'owl'], explanation: 'rebus' },
    emojiplace: { answer: `CITY${suffix}`, category: 'City', e: '🐾🌹', parts: ['paw', 'ris'], explanation: 'rebus' },
    year: { q: `Event ${suffix}`, y: 2000 + index },
    higherlow: { q: `Quantity ${suffix}?`, n: 20 + index, unit: '%' },
    flaghunt: { flag: index % 2 ? '🇴🇲' : '🇯🇵', options: ['A', 'B', 'C', 'D'], correct: index % 4 },
    spy: { category: `Places ${suffix}`, words: Array.from({ length: 8 }, (_, wordIndex) => `Place ${suffix}-${wordIndex}`) },
    '2t1l': { cat: `CATEGORY ${suffix}`, emoji: '🤥', q: `Name 3 things ${suffix}` },
    busted: { q: `What is your answer ${suffix}?`, other: `What is {name}'s answer ${suffix}?` },
    blendin: { a: `Something packed for school ${suffix}`, b: `Something packed for work ${suffix}` },
  };
  if (mode === 'harfhunt') return `Broad category ${suffix}`;
  return samples[mode];
}

function express() {
  return {
    use() {},
    post(path, handler) { routes.set(`POST ${path}`, handler); },
    get(path, handler) { routes.set(`GET ${path}`, handler); },
    listen() { throw new Error('server must not listen when imported by tests'); },
  };
}
express.json = () => (_req, _res, next) => next && next();

class AnthropicMock {
  constructor() {
    this.messages = {
      create: async request => {
        if (request.tools?.some(tool => tool.name === 'web_search')) {
          verificationRequests.push(request);
          const questions = JSON.parse(request.messages[0].content.split('Questions:\n')[1]);
          const url = 'https://www.fda.gov/drugs/test-source';
          return { stop_reason:'end_turn', content:[
            {type:'web_search_tool_result',content:[{type:'web_search_result',url}]},
            {type:'text',text:'Evidence',citations:[{type:'web_search_result_location',url,cited_text:'Evidence from a test source'}]},
            {type:'text',text:'MEDICAL_VERDICTS_START'+JSON.stringify(questions.map(question=>({id:question.id,valid:!rejectMedical,correct:question.id%4,sources:[url],reason:'Test evidence'})))+'MEDICAL_VERDICTS_END'},
          ] };
        }
        const prompt = request.messages[0].content;
        const mode = prompt.match(/prompts for "([^"]+)"/)?.[1];
        const count = Number(prompt.match(/Generate exactly (\d+)/)?.[1]);
        generationRequests.push({ mode, count, maxTokens: request.max_tokens });
        const items = Array.from({ length: count }, (_, index) => sample(mode, index));
        if (prompt.includes('quoted-booleans')) items.forEach(item => { item.truth = String(item.truth); });
        return { content: [{ type: 'text', text: JSON.stringify(items) }] };
      },
    };
  }
}

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'express') return express;
  if (request === 'cors') return () => (_req, _res, next) => next && next();
  if (request === '@anthropic-ai/sdk') return AnthropicMock;
  if (request === 'firebase-admin/app') return {};
  if (request === 'firebase-admin/database') return {};
  return originalLoad.call(this, request, parent, isMain);
};

let backend;
try {
  backend = require('../backend/server.js');
} finally {
  Module._load = originalLoad;
}

async function postPrompts(body) {
  const handler = routes.get('POST /api/prompts');
  assert.ok(handler, 'prompt route must be registered');
  const response = { statusCode: 200, payload: null };
  response.status = code => { response.statusCode = code; return response; };
  response.json = payload => { response.payload = payload; return response; };
  await handler({ body }, response);
  return response;
}

(async () => {
  const modes = Object.keys(backend.SHAPES);
  for (const mode of modes) {
    for (const lang of ['en', 'ar']) {
      const response = await postPrompts({ mode, lang, count: 2 });
      assert.equal(response.statusCode, 200, `${mode}/${lang} route status`);
      assert.equal(response.payload.prompts.length, 2, `${mode}/${lang} prompt count`);
      assert.ok(response.payload.prompts.every(item => backend.isValidPrompt(mode, item)), `${mode}/${lang} response contract`);
    }
  }

  assert.equal(generationRequests.length, modes.length * 2);
  assert.ok(generationRequests.every(request => request.count === 8),
    'small requests must generate the eight-item minimum reserve, never 40');
  assert.ok(generationRequests.every(request => request.maxTokens <= 1200),
    'small requests must keep a bounded output budget');

  for (const invalid of [null, undefined, false, true, '', ' ', [], [1], {}]) {
    for (const mode of ['quiz', 'flaghunt']) {
      assert.equal(backend.isValidPrompt(mode, { ...sample(mode, 0), correct: invalid }), false,
        `${mode} must reject a missing or nonnumeric answer index`);
    }
    assert.equal(backend.isValidPrompt('year', { q: 'Event?', y: invalid }), false);
    assert.equal(backend.isValidPrompt('higherlow', { q: 'Behavior?', n: invalid, unit: '%' }), false);
    for (const field of ['lat', 'lon']) {
      assert.equal(backend.isValidPrompt('pinpoint', { ...sample('pinpoint', 0), [field]: invalid }), false,
        `Pinpoint must reject a missing or nonnumeric ${field}`);
    }
  }
  for (const mode of ['quiz', 'flaghunt']) {
    assert.equal(backend.isValidPrompt(mode, { ...sample(mode, 0), options: ['A', ' a ', 'B', 'C'] }), false,
      `${mode} choices must remain distinct after normalization`);
    const numericString = { ...sample(mode, 0), correct: '2' };
    assert.equal(backend.isValidPrompt(mode, numericString), true);
    assert.equal(numericString.correct, 2, 'valid numeric strings must still normalize');
  }
  for (const [lat, lon] of [[91, 20], [-91, 20], [20, 181], [20, -181], [0, 0]]) {
    assert.equal(backend.isValidPrompt('pinpoint', { ...sample('pinpoint', 0), lat, lon }), false);
  }
  const cityWithStrings = { ...sample('pinpoint', 0), lat: '24.5', lon: '45.5' };
  assert.equal(backend.isValidPrompt('pinpoint', cityWithStrings), true);
  assert.equal(cityWithStrings.lat, 24.5);
  assert.equal(cityWithStrings.lon, 45.5);
  assert.equal(backend.isValidPrompt('year', { q: 'Event?', y: '2007' }), true);
  assert.equal(backend.isValidPrompt('year', { q: 'Event?', y: 2007.5 }), false);
  assert.equal(backend.isValidPrompt('higherlow', { q: 'Behavior?', n: '38', unit: '%' }), true);
  assert.equal(backend.isValidPrompt('higherlow', { q: 'Behavior?', n: 38.5, unit: '%' }), false);

  const trueFalseBatch = await postPrompts({ mode: 'trueorlie', lang: 'en', topic: 'balance-test', count: 8 });
  assert.equal(trueFalseBatch.statusCode, 200);
  assert.ok(trueFalseBatch.payload.prompts.some(item => item.truth === true));
  assert.ok(trueFalseBatch.payload.prompts.some(item => item.truth === false),
    'True or False AI must provide both true and false statements');
  const quoted = await postPrompts({ mode:'trueorlie', lang:'en', topic:'quoted-booleans', count:8 });
  assert.equal(quoted.statusCode,200);
  assert.equal(quoted.payload.prompts.length,8);
  assert.deepEqual(new Set(quoted.payload.prompts.map(item=>item.truth)),new Set([true,false]));
  const medical = await postPrompts({ mode:'quiz', lang:'en', topic:'medical', count:2 });
  assert.equal(medical.statusCode,200);
  assert.equal(medical.payload.prompts.length,2);
  assert.ok(medical.payload.prompts.every(item=>item.medicalSources?.length));
  assert.equal(verificationRequests.length,1,'Pharmacy must invoke independent sourced verification');
  await postPrompts({ mode:'quiz', lang:'en', topic:'medical', count:2 });
  assert.equal(verificationRequests.length,1,'cached verified questions should not incur another review');
  rejectMedical = true;
  const rejectedMedical = await postPrompts({ mode:'quiz', lang:'ar', topic:'medical', count:2 });
  assert.equal(rejectedMedical.payload.prompts.length,0,'failed medical review must not leak the original questions');
  rejectMedical = false;


  assert.equal(backend.isValidPrompt('blendin', {
    a: "What is the world's longest river?", b: 'What is the largest rainforest?',
  }), false, 'Blend In must reject factual trivia questions');
  assert.equal(backend.isValidPrompt('blendin', {
    a: 'ما هو أطول نهر', b: 'ما اسم أكبر غابة',
  }), false, 'Blend In must reject Arabic factual trivia even without question marks');
  assert.equal(backend.isValidPrompt('blendin', {
    a: 'Something you take to school', b: 'Something you take to work',
  }), true, 'Blend In must accept closely related everyday writing prompts');
  assert.equal(backend.isValidPrompt('blendin', {
    a: 'شي تاخذه للمدرسة', b: 'شي تاخذه للشغل',
  }), true, 'Blend In must accept Arabic everyday writing prompts');

  const firstFresh = await postPrompts({ mode: 'quiz', lang: 'en', topic: 'exclude-test', count: 2 });
  const excluded = firstFresh.payload.prompts.map(backend.getFingerprint);
  const secondFresh = await postPrompts({ mode: 'quiz', lang: 'en', topic: 'exclude-test', count: 2, exclude: excluded });
  assert.equal(secondFresh.statusCode, 200);
  assert.ok(secondFresh.payload.prompts.every(item => !excluded.includes(backend.getFingerprint(item))),
    'caller-provided persistent history must exclude prompts even when cached on the backend');

  assert.equal(backend.isValidPrompt('bluff', {
    fact: 'The first alarm clock could only ring at ___',
    truth: 'FOUR', decoys: ['THREE', 'FIVE', 'SIX', 'SEVEN'],
  }), false, 'bare numeric answers without a unit must be rejected');
  assert.equal(backend.isValidPrompt('bluff', {
    fact: 'The first alarm clock could only ring at ___ o’clock',
    truth: 'FOUR', decoys: ['THREE', 'FIVE', 'SIX', 'SEVEN'],
  }), true, 'numeric answers with explicit context must pass');
  assert.equal(backend.isValidPrompt('bluff', {
    fact: 'The first alarm clock could only ring at ___ o’clock',
    truth: 'FOUR', decoys: ['FOUR', 'FIVE', 'SIX', 'SEVEN'],
  }), false, 'truth and decoys must all be unique');

  assert.equal(backend.isValidPrompt('wyr', {
    a: 'Give up music forever',
    b: 'Give up movies forever',
  }), true, 'short Would You Rather options must pass');
  assert.equal(backend.isValidPrompt('wyr', {
    a: 'Always explain every tiny detail before you can answer any simple question aloud',
    b: 'Give up movies forever',
  }), false, 'Would You Rather options over twelve words must be rejected');

  const unknown = await postPrompts({ mode: 'not-a-game', count: 2 });
  assert.equal(unknown.statusCode, 400);

  console.log(`Backend AI generation contracts: ${modes.length} modes × 2 languages passed`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
