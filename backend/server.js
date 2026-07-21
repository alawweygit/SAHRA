const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SHAPES = {
  bluff:        '[{"fact":"A weird true fact with ___ replacing the surprising part","truth":"THE SURPRISING ANSWER IN CAPS"}]',
  wyr:          '[{"a":"Option A (a real dilemma)","b":"Option B (equally tempting or equally bad)"}]',
  interrogation:'[{"q":"A spicy but fun personal question"}]',
  diss:         '[{"p":"A roast battle setup prompt about your opponent"}]',
  quiz:         '[{"q":"Trivia question","options":["Correct answer","Wrong 1","Wrong 2","Wrong 3"],"correct":0}]',
  mostlikely:   '[{"q":"Who is most likely to..."}]',
  trueorlie:    '[{"s":"An absurd-sounding statement","truth":true}]',
  pinpoint:     '[{"en":"City Name","ar":"اسم المدينة","lat":25.2,"lon":55.3}]',
  emoji:        '[{"answer":"SEOUL","category":"City","e":"🌊🦉","parts":["sea","owl"],"explanation":"Sea + owl = Seoul"}]',
  emojiplace:   '[{"answer":"PARIS","category":"City","e":"🐾🌹","parts":["paw","ris"],"explanation":"Paw + ris = Paris"}]',
  year:         '[{"q":"The first iPhone was released","y":2007}]',
  higherlow:    '[{"q":"How many floors does the Burj Khalifa have?","n":163,"unit":"floors"}]',
  flaghunt:     '[{"flag":"🇯🇵","options":["Japan","China","South Korea","Vietnam"],"correct":0}]',
  spy:          '[{"category":"location","words":["Coffee shop","Airport","Hospital","Casino","Zoo","Library","Prison","Stadium"]}]',
};

const GUIDANCE = {
  bluff:        'Fill-in-the-blank SHOCKING funny true facts. ___ replaces the most surprising word. RULES: (1) truth must be ONE SINGLE WORD only — no exceptions, never a phrase (e.g. BANANAS, LOUDER, CATS, DUBAI, CRYING). (2) The fact must be genuinely shocking, funny, or embarrassing — not boring trivia. (3) The blank should make players laugh or say "no way". (4) Wrong guesses should sound equally plausible. (5) Mix bizarre animal facts, embarrassing human body facts, shocking Gulf/Arab facts, and absurd world records. AVOID: anything educational-sounding, anything obvious, multi-word truths.',
  wyr:          'Would You Rather dilemmas — both options equally appealing or awful. No obvious right answer. Gulf situations welcome in Arabic.',
  interrogation:'Funny, spicy or thought-provoking prompts where everyone writes a creative honest answer. Examples: "What would you do if you were invisible for a day?", "What habit would your 15-year-old self hate about you?", "What\'s the most embarrassing thing in your search history?". Gulf/Arab situations in Arabic. Fun, relatable, makes people laugh.',
  diss:         'Roast battle setup lines — prompt to write a funny one-liner insult about the opponent.',
  quiz:         'Multiple-choice trivia. Vary correct position (0-3). Gulf/Arab focus in Arabic. Mix difficulty.',
  mostlikely:   '"Who is most likely to…" questions sparking funny debates. Gulf social situations in Arabic.',
  trueorlie:    'Absurd-sounding statements, genuinely TRUE or FALSE. "truth" must be boolean. Mix science, history, Gulf facts.',
  pinpoint:     'Real cities worldwide. Accurate lat/lon. "ar" = real Arabic name. MENA cities in Arabic mode.',
  emoji:        'Phonetic rebus: emojis SOUND OUT a word. "parts" = phonetic sounds.',
  emojiplace:   'Phonetic rebus for CITIES only. MENA cities in Arabic.',
  year:         'Historical events with exact year. Mix world history, tech, sports, Gulf milestones.',
  higherlow:    '"n" = exact real number. "unit" = label. Mix: counts (floors, episodes, goals, medals), distances (km), heights (m), weights (kg), speeds (km/h), populations, temperatures (°C), historical years (unit="year"), ages, prices. ALL values must be accurate.',
  flaghunt:     'Flag emoji + 4 country options. "correct" is 0-based index. Vary position. Mix all continents.',
  spy:          'Secret word pool. ONE object with "category" and "words" array (15-20 specific items). Arab-world items in Arabic.',
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
  const key = item.q || item.fact || item.s || item.p || item.a || item.answer || '';
  return key.toLowerCase().slice(0, 60);
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

async function generateBatch(mode, lang, used, baseKey) {
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

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{ role: 'user', content:
      `Generate 40 party game prompts for "${mode}" in ${langName}.\n` +
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
    const { mode, lang = 'en', count = 10 } = req.body || {};
    if (!SHAPES[mode]) return res.status(400).json({ error: 'Unknown mode: ' + mode });

    const baseKey = mode + ':' + lang;
    let currentPool = pool.get(baseKey) || [];
    if (!usedFingerprints.has(baseKey)) usedFingerprints.set(baseKey, new Set());
    const used = usedFingerprints.get(baseKey);

    if (currentPool.length < count + 5) {
      try {
        const fresh = await generateBatch(mode, lang, used, baseKey);
        // Filter out used AND always-banned items
        const novel = fresh.filter(item => {
          const fp = getFingerprint(item);
          return !used.has(fp) && !isBanned(item, baseKey);
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
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('HYPOX backend port ' + PORT));

// Self-warm: pre-generate the 3 most popular modes on startup so first request is instant
const WARM_MODES = [
  { mode: 'bluff', lang: 'ar' },
  { mode: 'bluff', lang: 'en' },
  { mode: 'wyr',   lang: 'ar' },
];
setTimeout(async () => {
  for (const { mode, lang } of WARM_MODES) {
    try {
      const baseKey = mode + ':' + lang;
      if (!usedFingerprints.has(baseKey)) usedFingerprints.set(baseKey, new Set());
      const fresh = await generateBatch(mode, lang, usedFingerprints.get(baseKey), baseKey);
      const current = pool.get(baseKey) || [];
      pool.set(baseKey, [...current, ...fresh]);
      console.log(`[warm] ${baseKey} — ${fresh.length} items cached`);
    } catch(e) {
      console.warn(`[warm] ${mode}:${lang} failed — ${e.message}`);
    }
  }
}, 3000); // wait 3s after boot before warming
