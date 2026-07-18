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
  higherlow:    '[{"q":"How many bones are in the human body?","n":206,"unit":"bones"}]',
  flaghunt:     '[{"flag":"🇯🇵","options":["Japan","China","South Korea","Vietnam"],"correct":0}]',
  spy:          '[{"category":"location","words":["Coffee shop","Airport","Hospital","Casino","Zoo","Library","Prison","Stadium"]}]',
};

const GUIDANCE = {
  bluff:        'Fill-in-the-blank weird true facts. ___ replaces the most surprising element. Truth in CAPS. Mix global and Gulf/Arab facts in Arabic.',
  wyr:          'Would You Rather dilemmas — both options equally appealing or awful. No obvious right answer. Gulf situations welcome in Arabic.',
  interrogation:'Deep personal questions that reveal personality differences. Spicy but fun. Gulf/khaleeji situations in Arabic.',
  diss:         'Roast battle setup lines — prompt to write a funny one-liner insult about the opponent.',
  quiz:         'Multiple-choice trivia. Vary correct position (0-3). Gulf/Arab focus in Arabic. Mix difficulty. For football category: clubs, players, World Cup, Gulf football.',
  mostlikely:   '"Who is most likely to…" questions sparking funny debates. Gulf social situations in Arabic.',
  trueorlie:    'Absurd-sounding statements, genuinely TRUE or FALSE. "truth" must be boolean. Mix science, history, Gulf facts, pop culture.',
  pinpoint:     'Real cities worldwide. Accurate lat/lon. "ar" = real Arabic name. MENA cities in Arabic mode.',
  emoji:        'Phonetic rebus: emojis SOUND OUT a word. Example: 🌊🦉 = sea+owl = SEOUL. "parts" = phonetic sounds.',
  emojiplace:   'Phonetic rebus for CITIES only. Emojis sound out place name. MENA cities in Arabic.',
  year:         'Historical events with exact year (number). Mix world history, tech, sports, Gulf milestones. NEVER repeat the same event.',
  higherlow:    '"n" is the EXACT real answer (a NUMBER). "unit" is the measurement unit. "q" is a quantity question. RULES: NEVER use year questions (no "in what year", no dates). ONLY use measurable quantities: heights, weights, speeds, distances, counts, temperatures, ages, populations, lengths, volumes, calories, prices. The reference hint will be a random offset from the real answer — so questions must be about quantities where numbers make intuitive sense. Good: "How many episodes did Breaking Bad have?" n:62 unit:"episodes". Bad: "What year was X invented?" (years don\'t work as higher/lower).',
  flaghunt:     'Flag emoji + 4 country options. "correct" is 0-based index. Vary correct position. Mix all continents.',
  spy:          'Secret word pool for Spy Game. ONE object with "category" and "words" array (15-20 specific recognizable items). Arab-world items in Arabic.',
};

// Pool: stores unused questions per key
// Used: tracks ALL questions ever sent per base key (mode:lang) to prevent repeats
const pool = new Map();
const usedFingerprints = new Map(); // mode:lang -> Set of JSON fingerprints

function fingerprint(item) {
  // Key field that identifies uniqueness per mode
  const f = item.q || item.fact || item.s || item.p || item.a || item.answer || item.flag || JSON.stringify(item).slice(0,60);
  return f;
}

// Topic domains to rotate through for variety
const DOMAINS = {
  higherlow: [
    'human body facts (bones, organs, senses)',
    'world records (tallest, fastest, heaviest, oldest)',
    'animal kingdom (speeds, sizes, lifespans)',
    'geography (distances, altitudes, populations)',
    'food and drink (calories, production volumes)',
    'sports statistics (records, distances)',
    'space and science (temperatures, distances, sizes)',
    'technology (storage, speeds, counts)',
    'money and economics (prices, GDPs)',
    'history and culture (durations, counts)',
    'Gulf and Arab world facts',
    'entertainment (episodes, box office, plays)',
  ],
};

async function generateBatch(mode, lang, existingFingerprints) {
  const langName = lang === 'ar' ? 'Gulf Arabic (khaleeji dialect, casual)' : 'English';
  const audience = lang === 'ar'
    ? 'Arab friend groups in their 20s-30s in the Gulf.'
    : 'Mixed international friend groups in their 20s-30s.';

  // Pick a random domain to force variety
  const domains = DOMAINS[mode] || [];
  const randomDomain = domains.length
    ? domains[Math.floor(Math.random() * domains.length)]
    : '';
  const domainHint = randomDomain
    ? `\n- THIS BATCH FOCUS: Generate questions specifically about "${randomDomain}". Stay in this domain for variety across sessions.`
    : '';

  const avoidHint = existingFingerprints && existingFingerprints.size > 0
    ? `\n- ALREADY USED (do NOT repeat these topics): ${[...existingFingerprints].slice(-15).join(' | ')}`
    : '';

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{ role: 'user', content:
      `Generate 40 UNIQUE party game prompts for "${mode}" in ${langName}.\n` +
      `Audience: ${audience}\n` +
      `Guidance: ${GUIDANCE[mode]}\n` +
      `Rules:\n` +
      `- Every question must be clearly different from all others${domainHint}${avoidHint}\n` +
      `- No offensive content\n` +
      `- Return ONLY valid JSON array, no markdown\n` +
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

    // Refill pool if running low
    if (currentPool.length < count + 5) {
      try {
        const fresh = await generateBatch(mode, lang, used);
        // Filter out already-used items
        const novel = fresh.filter(item => !used.has(fingerprint(item)));
        currentPool = currentPool.concat(novel);
        // Shuffle for variety
        currentPool.sort(() => Math.random() - 0.5);
      } catch(e) {
        console.error('Generation error:', e.message);
        if (!currentPool.length) return res.status(500).json({ error: 'generation failed' });
      }
    }

    // Serve requested count
    const out = currentPool.slice(0, count);
    // Mark as used
    out.forEach(item => used.add(fingerprint(item)));
    // Keep used fingerprints bounded (last 200)
    if (used.size > 200) {
      const arr = [...used];
      usedFingerprints.set(baseKey, new Set(arr.slice(-150)));
    }
    // Store remaining pool
    pool.set(baseKey, currentPool.slice(count));

    res.json({ prompts: out });
  } catch (e) {
    console.error('Backend error:', e.message);
    res.status(500).json({ error: 'generation failed', detail: e.message });
  }
});

app.get('/health', (_, res) => res.json({ ok: true, modes: Object.keys(SHAPES) }));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('HYPOX backend port ' + PORT));
