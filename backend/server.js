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
  bluff:        'Fill-in-the-blank SHOCKING funny true facts. ___ replaces the most surprising word. RULES: (1) truth must be ONE SINGLE WORD only — no exceptions, never a phrase (e.g. BANANAS, LOUDER, CATS, DUBAI, CRYING). (2) The fact must make someone go "wait, WHAT?" out loud — not a fact you\'d read in a textbook or a kids\' encyclopedia. If it sounds like a "did you know" wall poster, throw it out and pick something weirder. (3) Favor facts about famous people, scandals, records, money, or bizarre real events over plain science/biology facts — those tend to read as dry. (4) Wrong guesses should sound equally plausible, not obviously wrong. (5) EVERY SINGLE ITEM in this batch must come from a DIFFERENT topic — never write two facts back-to-back from the same subject area (e.g. do not follow a food fact with another food fact, or one animal fact with another animal fact). (6) KEEP THE WORDING SIMPLE: short sentences (under 15 words if possible), everyday words a 12-year-old would know, no technical/scientific jargon, no complex sentence structure. A player must understand the whole fact in one quick read, out loud, in a noisy room — simple words, not simple ideas. AVOID: anything educational-sounding, anything obvious, multi-word truths, dry biology/science-class facts, long or complicated sentences, technical vocabulary.',
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
    'space and astronomy oddities',
    'the human body and brain\'s weird quirks',
    'money, currency, and business with strange true stories',
    'language and words with surprising origins',
    'famous people\'s bizarre lesser-known habits or facts',
    'movies, music, and pop culture behind-the-scenes trivia',
    'nature and the ocean\'s stranger corners',
    'crime, law, and bizarre real court cases',
    'inventions and everyday objects with a wild backstory',
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
    // v208 — "truth must be ONE SINGLE WORD" was only ever a prompt
    // instruction; nothing here ever checked it, so a multi-word truth
    // from the model could reach real games (it stands out immediately
    // next to one-word player lies, breaking the bluff). Numbers like
    // "1889" and hyphenated single words like "SPAGHETTO-ISH" still pass;
    // only whitespace-separated multi-word phrases are rejected.
    case 'bluff': return text('fact') && item.fact.includes('___') && text('truth') &&
      item.truth.trim().split(/\s+/).length === 1;
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

// v208 — previously a whole 8-40 item batch was pinned to ONE domain (e.g.
// "food and cooking"), so consecutive rounds pulled from the same batch felt
// stuck on one topic (bananas -> Big Macs -> ...). "Avoid last domain" only
// applied batch-to-batch, which didn't help mid-batch. Fixed by shuffling a
// spread of DIFFERENT domains into the same request and explicitly telling
// the model to rotate across them item-by-item, so variety happens WITHIN a
// single batch, not just between batches.
function pickDomainSpread(mode) {
  const domains = DOMAINS[mode];
  if (!domains || !domains.length) return [];
  const last = lastDomain.get(mode) || '';
  const shuffled = [...domains].sort(() => Math.random() - 0.5);
  const ordered = shuffled[0] === last ? [...shuffled.slice(1), shuffled[0]] : shuffled;
  lastDomain.set(mode, ordered[ordered.length - 1]);
  return ordered;
}

async function generateBatch(mode, lang, used, baseKey, requestedCount, region) {
  const langName = lang === 'ar' ? 'Gulf Arabic (khaleeji dialect)' : 'English';
  const isMena = region === 'mena';
  // Language and region are independent: Arabic already leans Gulf/Arab via
  // langName/audience below, but a player can also want MENA-flavored
  // content while staying in English — that combination previously produced
  // generic global content because "region" never reached this prompt.
  const audience = isMena
    ? 'Arab/Gulf friend groups (MENA region) — even if this request is in English, keep the flavor, references, and cultural context distinctly Arab/Gulf.'
    : (lang === 'ar' ? 'Arab friend groups in the Gulf.' : 'Mixed international friend groups.');
  const regionSection = isMena
    ? `\\nREGION: Every item in this batch must be Arab/MENA/Gulf-flavored — people, places, food, culture, history, or context should draw specifically from the Arab world (Gulf, Levant, North Africa), not generic/Western/global defaults. This applies regardless of the output language.`
    : '';
  // Build a strong avoidance list from recent fingerprints + always-banned
  const recentUsed = used ? [...used].slice(-20) : [];
  const alwaysBanned = ALWAYS_BANNED[baseKey] ? [...ALWAYS_BANNED[baseKey]] : [];
  const avoidList = [...new Set([...alwaysBanned, ...recentUsed])];

  const avoidSection = avoidList.length
    ? `\nSTRICTLY AVOID these topics/phrases: "${avoidList.join('", "')}"` 
    : '';

  // bluff rotates domain PER ITEM (see pickDomainSpread comment above);
  // other modes keep one domain for the whole batch, unaffected by this.
  let domainSection = '';
  if (mode === 'bluff') {
    const spread = pickDomainSpread(mode);
    domainSection = spread.length
      ? `\nTOPIC ROTATION — cycle through these domains in order, one per item, wrapping around if you run out: ${spread.map((d, i) => `${i + 1}) ${d}`).join('; ')}. Item 1 uses domain 1, item 2 uses domain 2, etc. Never let two consecutive items share a domain.`
      : '';
  } else {
    const domain = pickDomain(mode);
    domainSection = domain
      ? `\nTHIS BATCH MUST be about: "${domain}" — stay focused on this specific category.`
      : '';
  }

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
      `RULES:${domainSection}${regionSection}${avoidSection}\n` +
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
    const { mode, lang = 'en', region = null } = req.body || {};
    const count = Math.min(40, Math.max(1, Math.floor(Number(req.body && req.body.count) || 10)));
    if (!SHAPES[mode]) return res.status(400).json({ error: 'Unknown mode: ' + mode });

    // region is part of the cache/used-fingerprint key so MENA-flavored and
    // global-flavored batches for the same mode+lang never get mixed together.
    const baseKey = mode + ':' + lang + (region ? ':' + region : '');
    let currentPool = pool.get(baseKey) || [];
    if (!usedFingerprints.has(baseKey)) usedFingerprints.set(baseKey, new Set());
    const used = usedFingerprints.get(baseKey);

    if (currentPool.length < count) {
      try {
        const fresh = await generateBatch(mode, lang, used, baseKey, count, region);
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
