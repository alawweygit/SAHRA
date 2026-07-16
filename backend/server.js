const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SHAPES = {
  bluff:       '[{"fact":"A weird true fact with ___ replacing the surprising part","truth":"THE SURPRISING ANSWER IN CAPS"}]',
  wyr:         '[{"a":"Option A (a real dilemma)","b":"Option B (equally tempting or equally bad)"}]',
  interrogation:'[{"q":"A spicy but fun personal question about the players themselves"}]',
  diss:        '[{"p":"A roast battle setup prompt about your opponent"}]',
  quiz:        '[{"q":"Trivia question","options":["Correct answer","Wrong 1","Wrong 2","Wrong 3"],"correct":0}]',
  mostlikely:  '[{"q":"Who is most likely to..."}]',
  trueorlie:   '[{"s":"An absurd-sounding statement that is actually true or false","truth":true}]',
  pinpoint:    '[{"en":"City Name","ar":"اسم المدينة","lat":25.2,"lon":55.3}]',
  emoji:       '[{"answer":"SEOUL","category":"City","e":"🌊🦉","parts":["sea","owl"],"explanation":"Sea + owl = Seoul"}]',
  emojiplace:  '[{"answer":"PARIS","category":"City","e":"🐾🌹","parts":["paw","ris"],"explanation":"Paw + ris = Paris"}]',
  year:        '[{"q":"The first iPhone was released","y":2007}]',
};

const GUIDANCE = {
  bluff:       'Fill-in-the-blank weird true facts. The blank (___) replaces the most surprising element. Truth in CAPS. Mix global and Gulf/Arab facts when in Arabic.',
  wyr:         'Would You Rather dilemmas — both options equally appealing or equally awful. No obvious right answer. Gulf situations and local culture welcome in Arabic.',
  interrogation:'Anonymous confession prompts that reveal personality differences between friends. Spicy but fun, not offensive. Gulf dialect and local situations in Arabic.',
  diss:        'Roast battle setup lines — a prompt letting players write a funny one-liner insult about their specific opponent.',
  quiz:        'Multiple-choice trivia. Vary correct answer position randomly (0-3) and set correct accordingly. Gulf/Arab trivia focus in Arabic. Mix difficulty levels.',
  mostlikely:  '"Who is most likely to…" questions that spark funny debates in a friend group. Make them specific enough to actually point at someone. Gulf/Arab social situations in Arabic. Examples: "Who is most likely to bring their mom on a first date?" or "Who is most likely to eat alone in a restaurant and pretend they\'re waiting for someone?"',
  trueorlie:   'Absurd-sounding statements that are either genuinely TRUE or FALSE. Should make players doubt themselves. Mix science, history, Gulf/Arab facts, pop culture. "truth" field must be a boolean. Examples of TRUE ones: "Honey never expires" (true), "Saudi Arabia imports sand from Australia" (true). False ones should be believable but wrong.',
  pinpoint:    'Real cities from around the world. Mix famous capitals, mid-size cities, and surprising locations. Must include accurate lat/lon coordinates (decimal degrees). "ar" field must be the real Arabic city name. In Arabic mode, include more MENA and Arab-world cities.',
  emoji:       'Phonetic rebus puzzles: emojis that SOUND OUT a word phonetically. Example: 🌊🦉 = sea+owl = SEOUL. Answer is a country, city, object, animal, or common word. "parts" = phonetic sounds of each emoji. Keep answers 4-10 letters.',
  emojiplace:  'Phonetic rebus puzzles for CITIES AND COUNTRIES only. Emojis SOUND OUT the place name. Example: 🐾🌹 = paw+ris = PARIS. Use cities worldwide, especially MENA cities in Arabic mode.',
  year:        'Historical events with exact year (y as number). Mix world history, tech, pop culture, sports, Arab/Gulf milestones.',
};

const cache = new Map();

app.post('/api/prompts', async (req, res) => {
  try {
    const { mode, lang = 'en', count = 10 } = req.body || {};
    if (!SHAPES[mode]) return res.status(400).json({ error: 'Unknown mode: ' + mode });
    const key = mode + ':' + lang;
    let pool = cache.get(key) || [];
    if (pool.length < count) {
      const langName = lang === 'ar' ? 'Gulf Arabic (khaleeji dialect, casual, not formal MSA)' : 'English';
      const audience = lang === 'ar'
        ? 'Arab friend groups in their 20s-30s in the Gulf. Content must feel native, not translated.'
        : 'Mixed international friend groups in their 20s-30s.';
      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        messages: [{ role: 'user', content:
          `Generate 20 unique party game prompts for the "${mode}" mode in ${langName}.\n` +
          `Audience: ${audience}\n` +
          `Guidance: ${GUIDANCE[mode]}\n` +
          `Rules:\n` +
          `- Be creative, funny, and culturally relevant\n` +
          `- No offensive content (racism, explicit sexual content, religion-mocking)\n` +
          `- Each prompt must be meaningfully different from the others\n` +
          `- Return ONLY a valid JSON array, no markdown fences, no explanation\n` +
          `- Every item must match exactly this shape: ${SHAPES[mode]}`
        }],
      });
      const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
      const clean = text.replace(/```json|```/g, '').trim();
      let fresh;
      try { fresh = JSON.parse(clean); } catch (e) {
        return res.status(500).json({ error: 'AI returned invalid JSON', raw: clean.slice(0, 200) });
      }
      if (!Array.isArray(fresh) || !fresh.length) return res.status(500).json({ error: 'AI returned empty array' });
      pool = pool.concat(fresh);
    }
    const out = pool.slice(0, count);
    cache.set(key, pool.slice(count));
    res.json({ prompts: out });
  } catch (e) {
    console.error('Backend error:', e.message);
    res.status(500).json({ error: 'generation failed', detail: e.message });
  }
});

app.get('/health', (_, res) => res.json({ ok: true, modes: Object.keys(SHAPES), timestamp: new Date().toISOString() }));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('HYPOX AI backend on port ' + PORT));
