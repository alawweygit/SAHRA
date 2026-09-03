const assert = require('node:assert/strict');
const fs = require('node:fs');

const mainSource = fs.readFileSync(require.resolve('../js/main.js'), 'utf8');
const hostSource = fs.readFileSync(require.resolve('../js/host.js'), 'utf8');
const backendSource = fs.readFileSync(require.resolve('../backend/server.js'), 'utf8');
const contentSource = fs.readFileSync(require.resolve('../js/content.js'), 'utf8');

function objectKeys(source, declaration) {
  const start = source.indexOf(`const ${declaration} = {`);
  assert.notEqual(start, -1, `${declaration} declaration must exist`);
  const end = source.indexOf('};', start);
  assert.notEqual(end, -1, `${declaration} declaration must close`);
  const block = source.slice(start, end);
  return [...block.matchAll(/(?:\{|,)\s*(?:'([^']+)'|([a-zA-Z0-9_]+))\s*:/g)]
    .map(match => match[1] || match[2]);
}

const selectableModes = objectKeys(mainSource, 'MODE_ICONS').map(mode => mode === 'trivia' ? 'quiz' : mode);
const backendModes = new Set(objectKeys(backendSource, 'SHAPES'));
for (const mode of selectableModes) {
  assert.ok(backendModes.has(mode), `AI backend must support selectable mode: ${mode}`);
}

assert.match(hostSource, /Content\.get\('interrogation', LANG, shuffledPlayers\.length\)/,
  'Say It Anon must use the shared AI content pipeline');
assert.match(backendSource, /Generate exactly \$\{batchSize\}/,
  'backend must generate the requested-sized batch');
assert.doesNotMatch(backendSource, /Generate 40 party game prompts/,
  'backend must not generate 40 prompts for every small request');
assert.match(backendSource, /typeof item === 'string'/,
  'string-based HarfHunt categories must be fingerprinted safely');

global.shuffle = values => values.slice();
global.window = {
  HYPOX_CONFIG: { aiEndpoint: 'https://ai.example/api/prompts' },
  HYPOX_STATE: { region: null, flavor: 'global', aiEnabled: true },
  _hypoxSession: 'ai-test',
  _hypoxTestMode: false,
};
const storage = new Map();
global.window.localStorage = {
  getItem: key => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
};

let requestedCounts = [];
let requestedBodies = [];
global.fetch = async (_url, options) => {
  const body = JSON.parse(options.body);
  requestedCounts.push(body.count);
  requestedBodies.push(body);
  return {
    ok: true,
    json: async () => ({
      prompts: Array.from({ length: body.count }, (_, index) => ({
        a: `AI option A ${requestedCounts.length}-${index}`,
        b: `AI option B ${requestedCounts.length}-${index}`,
      })),
    }),
  };
};

let executable = contentSource
  .replace(/const PACKS\s*=/, 'global.PACKS =')
  .replace(/const Content\s*=/, 'global.Content =');
eval(executable);

(async () => {
  // Pregame starts five prompts. WYR later discovers it needs eight. It
  // should keep the five already loaded and request only the missing three.
  global.Content.preload('wyr', 'en', 5);
  const prompts = await global.Content.get('wyr', 'en', 8);
  assert.equal(prompts.length, 8);
  assert.deepEqual(requestedCounts, [5, 3]);
  assert.deepEqual(requestedBodies[0].exclude, [], 'the first AI request starts with no history');
  assert.equal(requestedBodies[1].exclude.length, 5,
    'the next request must exclude every AI prompt already fetched for this game');
  assert.ok(prompts.every(prompt => prompt.a.startsWith('AI option A')),
    'successful backend prompts must reach the game');
  const persisted = JSON.parse(storage.get('hypox_ai_seen_v1'));
  assert.equal(persisted['wyr:en:global:none'].length, 8,
    'AI history must persist outside the room/session cache');

  // The lobby switch remains a real global opt-out and must make no request.
  global.window.HYPOX_STATE.aiEnabled = false;
  global.window._clearContentCache();
  const before = requestedCounts.length;
  const fallback = await global.Content.get('wyr', 'en', 1);
  assert.equal(requestedCounts.length, before);
  assert.equal(fallback.length, 1);
  assert.ok(!fallback[0].a.startsWith('AI option A'));

  console.log(`AI content coverage and preload reuse: ${selectableModes.length} modes + 9 pipeline checks passed`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
