const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const AI_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

const SHAPES = {
  bluff:        '[{"fact":"A weird true fact with ___ replacing the surprising part","truth":"THE SURPRISING ANSWER IN CAPS"}]',
  wyr:          '[{"a":"Option A (a real dilemma)","b":"Option B (equally tempting or equally bad)"}]',
  interrogation:'[{"q":"What is [NAME] most likely to do at 3am?"}]',
  diss:         '[{"p":"A roast battle setup prompt about your opponent"}]',
  quiz:         '[{"q":"Trivia question","options":["Correct answer","Wrong 1","Wrong 2","Wrong 3"],"correct":0}]',
  mostlikely:   '[{"q":"Who is most likely to..."}]',
  trueorlie:    '[{"s":"An absurd-sounding statement","truth":true}]',
  pinpoint:     '[{"en":"City Name","ar":"اسم المدينة","countryEn":"Country Name","countryAr":"اسم الدولة","lat":25.2,"lon":55.3}]',
  emoji:        '[{"answer":"SEOUL","category":"City","e":"🌊🦉","parts":["sea","owl"],"explanation":"Sea + owl = Seoul"}]',
  emojiplace:   '[{"answer":"PARIS","category":"City","e":"🐾🌹","parts":["paw","ris"],"explanation":"Paw + ris = Paris"}]',
  year:         '[{"q":"The first iPhone was released","y":2007}]',
  higherlow:    '[{"q":"How many floors does the Burj Khalifa have?","n":163,"unit":"floors"}]',
  flaghunt:     '[{"flag":"🇯🇵","options":["Japan","China","South Korea","Vietnam"],"correct":0}]',
  spy:          '[{"category":"location","words":["Coffee shop","Airport","Hospital","Casino","Zoo","Library","Prison","Stadium"]}]',
  '2t1l':       '[{"cat":"ABOUT YOU","emoji":"🤥","q":"Name 3 things you have done while travelling"}]',
  busted:       '[{"q":"A short question asked directly to the subject","other":"The same question about {name}"}]',
  blendin:      '[{"a":"Question shown to most players","b":"A closely related but different question shown to the spy"}]',
  harfhunt:     '["Animals","Things in a kitchen","Things you take on holiday"]',
};

const GUIDANCE = {
  bluff:        'Fill-in-the-blank SHOCKING funny true facts. ___ replaces the most surprising word. RULES: (1) truth must be ONE SINGLE WORD only — no exceptions, never a phrase (e.g. BANANAS, LOUDER, CATS, DUBAI, CRYING). (2) The fact must be genuinely shocking, funny, or embarrassing — not boring trivia. (3) The blank should make players laugh or say "no way". (4) Wrong guesses should sound equally plausible. (5) Mix bizarre animal facts, embarrassing human body facts, shocking Gulf/Arab facts, and absurd world records. AVOID: anything educational-sounding, anything obvious, multi-word truths.',
  wyr:          'Would You Rather dilemmas — both options equally appealing or awful. No obvious right answer. Gulf situations welcome in Arabic.',
  interrogation:'Funny, spicy or thought-provoking hot-seat prompts about one person. Every question MUST include the exact [NAME] placeholder naturally. Examples: "What would [NAME] do if they were invisible for a day?", "What is [NAME] definitely Googling in private?". Gulf/Arab situations in Arabic. Fun, relatable, makes people laugh.',
  diss:         'Roast battle setup lines — prompt to write a funny one-liner insult about the opponent.',
  quiz:         'Multiple-choice trivia. Vary correct position (0-3). Gulf/Arab focus in Arabic. Mix difficulty.',
  mostlikely:   '"Who is most likely to…" questions sparking funny debates. Gulf social situations in Arabic.',
  trueorlie:    'Absurd-sounding statements, genuinely TRUE or FALSE. "truth" must be boolean. Mix science, history, Gulf facts.',
  pinpoint:     'Real cities worldwide. Accurate lat/lon. Always include the city and country in both languages: en, ar, countryEn, countryAr. MENA cities in Arabic mode.',
  emoji:        'Phonetic rebus: emojis SOUND OUT a word. "parts" = phonetic sounds.',
  emojiplace:   'Phonetic rebus for CITIES only. MENA cities in Arabic.',
  year:         'Historical events with exact year. Mix world history, tech, sports, Gulf milestones.',
  higherlow:    '"n" = exact real number. "unit" = label. Mix: counts (floors, episodes, goals, medals), distances (km), heights (m), weights (kg), speeds (km/h), populations, temperatures (°C), historical years (unit="year"), ages, prices. ALL values must be accurate.',
  flaghunt:     'Flag emoji + 4 country options. "correct" is 0-based index. Vary position. Mix all continents.',
  spy:          'Secret word pool. ONE object with "category" and "words" array (15-20 specific items). Arab-world items in Arabic.',
  '2t1l':       'Short personal category prompts that let one player write exactly two truths and one lie. Ask them to name 3 related things. Include a fitting emoji.',
  busted:       'Personal, playful questions with two versions. "q" addresses the subject directly. "other" asks the same thing about {name}; preserve the exact {name} placeholder. Answers should be short enough for a party game.',
  blendin:      'Each object is a subtle question pair. "a" and "b" must be closely related and invite the same kind of short answer, but not be identical. The different answer should be detectable only after discussion.',
  harfhunt:     'Return broad, familiar party-game category strings only. Each category must have many plausible answers across many starting letters. Avoid narrow or obscure categories.',
};

// Pre-seeded banned questions — things Claude defaults to that we NEVER want
const ALWAYS_BANNED = {
  'higherlow:en': new Set([
    'teeth', 'bones', 'human teeth', 'adult teeth', 'adult human',
    'episodes did friends', 'friends have', 'iPhone released', 'first iphone',
    'bones in the human body', 'teeth does an adult',
  ]),
  'higherlow:ar': new Set(['أسنان', 'عظام', 'عظام الإنسان']),
  'bluff:en': new Set(['platypus', 'honey never expires', 'cleopatra']),
};

// Topic domains to rotate — forces different categories each call
const DOMAINS = {
  higherlow: [
    'architecture and buildings (floors, heights of famous structures worldwide)',
    'animals (speeds, weights, lifespans, number of species)',
    'sports records (goals scored, medals won, distances, game durations)',
    'geography (river lengths, mountain heights, country populations, lake depths)',
    'food and drink (calories, production volumes, price per kg)',
    'space and astronomy (planet sizes, distances, temperatures)',
    'technology (storage sizes, processing speeds, user counts)',
    'historical years (famous events, inventions, discoveries — unit="year")',
    'Gulf and Arab world facts (heights, populations, oil production)',
    'movies and TV (box office in millions, runtime in minutes, number of seasons)',
    'human body (NOT teeth or bones — use: blood vessels km, heartbeats/day, neurons)',
    'transportation (top speeds, passenger capacity, range in km)',
  ],
  bluff: [
    'Gulf and Arab world unusual laws and customs',
    'animals with surprising abilities or behaviors',
    'historical events with shocking true details',
    'food and cooking with weird scientific facts',
    'technology inventions with surprising origins',
    'sports with bizarre true records',
  ],
};

// Per-key pool and fingerprint tracking (resets on restart, but pre-seeds keep quality high)
const pool = new Map();
const usedFingerprints = new Map();

function getFingerprint(item) {
  if (typeof item === 'string') return item.toLowerCase().slice(0, 60);
  if (!item || typeof item !== 'object') return '';
  const key = item.q || item.fact || item.s || item.p || item.a || item.answer ||
    item.en || item.flag || item.category || (Array.isArray(item.words) ? item.words.join('|') : '');
  return key.toLowerCase().slice(0, 60);
}

function isValidPrompt(mode, item) {
  if (mode === 'harfhunt') return typeof item === 'string' && item.trim().length >= 3;
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  const text = key => typeof item[key] === 'string' && item[key].trim().length > 0;
  const fourChoices = () => Array.isArray(item.options) && item.options.length === 4 &&
    item.options.every(option => typeof option === 'string' && option.trim()) &&
    Number.isInteger(item.correct) && item.correct >= 0 && item.correct < 4;
  switch (mode) {
    case 'bluff': return text('fact') && item.fact.includes('___') && text('truth');
    case 'wyr': return text('a') && text('b');
    case 'interrogation': return text('q') && item.q.includes('[NAME]');
    case 'diss': return text('p');
    case 'quiz': return text('q') && fourChoices();
    case 'mostlikely': return text('q');
    case 'trueorlie': return text('s') && typeof item.truth === 'boolean';
    case 'pinpoint': return text('en') && text('ar') && text('countryEn') && text('countryAr') && Number.isFinite(item.lat) && Number.isFinite(item.lon);
    case 'emoji':
    case 'emojiplace': return text('answer') && text('e');
    case 'year': return text('q') && Number.isFinite(item.y);
    case 'higherlow': return text('q') && Number.isFinite(item.n) && text('unit');
    case 'flaghunt': return text('flag') && fourChoices();
    case 'spy': return text('category') && Array.isArray(item.words) && item.words.length >= 8 && item.words.every(word => typeof word === 'string' && word.trim());
    case '2t1l': return text('q');
    case 'busted': return text('q') && text('other') && item.other.includes('{name}');
    case 'blendin': return text('a') && text('b') && item.a.trim() !== item.b.trim();
    default: return false;
  }
}

function isBanned(item, baseKey) {
  const fp = getFingerprint(item);
  const banned = ALWAYS_BANNED[baseKey];
  if (!banned) return false;
  return [...banned].some(b => fp.includes(b.toLowerCase()));
}

// Pick a random domain, weighted to avoid recently used ones
const lastDomain = new Map();
function pickDomain(mode) {
  const domains = DOMAINS[mode];
  if (!domains || !domains.length) return '';
  const last = lastDomain.get(mode) || '';
  // Filter out last used domain for variety
  const available = domains.filter(d => d !== last);
  const chosen = available[Math.floor(Math.random() * available.length)];
  lastDomain.set(mode, chosen);
  return chosen;
}

async function generateBatch(mode, lang, used, baseKey, requestedCount) {
  const langName = lang === 'ar' ? 'Gulf Arabic (khaleeji dialect)' : 'English';
  const audience = lang === 'ar' ? 'Arab friend groups in the Gulf.' : 'Mixed international friend groups.';
  const domain = pickDomain(mode);

  // Build a strong avoidance list from recent fingerprints + always-banned
  const recentUsed = used ? [...used].slice(-20) : [];
  const alwaysBanned = ALWAYS_BANNED[baseKey] ? [...ALWAYS_BANNED[baseKey]] : [];
  const avoidList = [...new Set([...alwaysBanned, ...recentUsed])];

  const avoidSection = avoidList.length
    ? `\nSTRICTLY AVOID these topics/phrases: "${avoidList.join('", "')}"` 
    : '';

  const domainSection = domain
    ? `\nTHIS BATCH MUST be about: "${domain}" — stay focused on this specific category.`
    : '';

  // The old backend generated 40 items for every request, even when the
  // game needed only 2 or 3. That made a cold request take long enough for
  // the browser's timeout to fire. Generate a small reserve instead: enough
  // for this game plus a few cached follow-ups, capped for predictable cost.
  const batchSize = Math.min(40, Math.max(8, Number(requestedCount) + 3));
  const msg = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: Math.min(4000, Math.max(1200, batchSize * 140)),
    messages: [{ role: 'user', content:
      `Generate exactly ${batchSize} party game prompts for "${mode}" in ${langName}.\n` +
      `Audience: ${audience}\n` +
      `Format: ${GUIDANCE[mode]}\n` +
      `RULES:${domainSection}${avoidSection}\n` +
      `- Every item must be GENUINELY DIFFERENT from all others\n` +
      `- Be specific and surprising — avoid generic/obvious examples\n` +
      `- All facts must be 100% accurate\n` +
      `- Return ONLY a valid JSON array, no markdown or explanation\n` +
      `- Every item must match: ${SHAPES[mode]}`
    }],
  });

  const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

app.post('/api/prompts', async (req, res) => {
  try {
    const { mode, lang = 'en' } = req.body || {};
    const count = Math.min(40, Math.max(1, Math.floor(Number(req.body && req.body.count) || 10)));
    if (!SHAPES[mode]) return res.status(400).json({ error: 'Unknown mode: ' + mode });

    const baseKey = mode + ':' + lang;
    let currentPool = pool.get(baseKey) || [];
    if (!usedFingerprints.has(baseKey)) usedFingerprints.set(baseKey, new Set());
    const used = usedFingerprints.get(baseKey);

    if (currentPool.length < count) {
      try {
        const fresh = await generateBatch(mode, lang, used, baseKey, count);
        // Filter out used AND always-banned items
        const novel = fresh.filter(item => {
          const fp = getFingerprint(item);
          return fp && isValidPrompt(mode, item) && !used.has(fp) && !isBanned(item, baseKey);
        });
        currentPool = [...currentPool, ...novel].sort(() => Math.random() - 0.5);
      } catch(e) {
        console.error('Generation error:', e.message);
        if (!currentPool.length) return res.status(500).json({ error: 'generation failed: ' + e.message });
      }
    }

    const out = currentPool.slice(0, count);
    out.forEach(item => used.add(getFingerprint(item)));

    // Keep used set bounded
    if (used.size > 300) {
      const arr = [...used];
      usedFingerprints.set(baseKey, new Set(arr.slice(-200)));
    }

    pool.set(baseKey, currentPool.slice(count));
    res.json({ prompts: out });
  } catch (e) {
    console.error('Backend error:', e.message);
    res.status(500).json({ error: 'generation failed', detail: e.message });
  }
});

app.get('/health', (_, res) => res.json({ ok: true, modes: Object.keys(SHAPES), timestamp: new Date().toISOString() }));

app.post('/api/translate', async (req, res) => {
  try {
    const { text, to } = req.body || {};
    if (!text) return res.status(400).json({ error: 'No text' });
    const msg = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 300,
      messages: [{ role: 'user', content: `Translate this game question to Arabic. Keep ___ as is. Return ONLY the translation, nothing else:\n${text}` }],
    });
    const translation = msg.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    res.json({ translation });
  } catch(e) {
    console.error('[translate] failed:', e.status || '', e.message);
    res.status(500).json({ error: e.message });
  }
});
// HarfHunt answer validation — deterministic, structured, low-latency.
// Deliberately biased toward NOT punishing borderline answers: the game's
// own appeal/vote system exists precisely so humans settle subjective calls.
// This endpoint only needs to catch answers that are clearly wrong; anything
// even slightly debatable should come back 'uncertain' and be accepted
// provisionally. A technical failure here must NEVER read as a game failure
// — the caller (host.js) treats any error/timeout as 'uncertain' too.
app.post('/api/harfhunt-validate', async (req, res) => {
  try {
    const { category, letter, answer, lang = 'en' } = req.body || {};
    if (!category || !letter || !answer) return res.status(400).json({ result: 'uncertain' });
    const msg = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 20,
      temperature: 0,
      messages: [{ role: 'user', content:
        `Party game "HarfHunt". Category: "${category}". Required starting letter: "${letter}". ` +
        `Player answer: "${answer}" (language: ${lang}).\n` +
        `Judge ONLY: does the answer plausibly belong to the category AND does it genuinely start with "${letter}" ` +
        `(after trimming whitespace, case-insensitive)? Be lenient on category fit — if a reasonable person ` +
        `at a party could argue it fits, it fits. Only mark invalid if it is CLEARLY wrong (wrong starting ` +
        `letter, nonsense text, or plainly unrelated to the category). If you are at all unsure, say uncertain.\n` +
        `Reply with EXACTLY one word, nothing else: valid, invalid, or uncertain.`
      }],
    });
    const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('').trim().toLowerCase();
    const result = ['valid', 'invalid', 'uncertain'].includes(text) ? text : 'uncertain';
    res.json({ result });
  } catch (e) {
    console.error('harfhunt-validate error:', e.message);
    res.json({ result: 'uncertain' }); // infra failure — never penalize the player for it
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log('HYPOX backend port ' + PORT));

  // v126 — self-warm removed. It regenerated 3 full content batches (~4000
  // output tokens each, ~$0.06/batch) on EVERY backend restart, which during
  // active development means every single git push — completely disconnected
  // from actual gameplay. Combined with the in-memory pool getting wiped on
  // each restart too, this was the dominant driver of token spend, not
  // players. The smaller request-sized batches above keep the first request
  // responsive without restoring that deploy-time cost.

  // Keep-warm: ping self every 20 minutes to prevent Railway sleep
  setInterval(() => {
    const port = process.env.PORT || 3000;
    require('http').get(`http://localhost:${port}/health`, () => {}).on('error', () => {});
  }, 20 * 60 * 1000);
}

module.exports = { app, SHAPES, GUIDANCE, getFingerprint, isValidPrompt };
