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
  spy:         '[{"category":"location","words":["Coffee shop","Airport","Hospital","Casino","Zoo","Library","Prison","Stadium"]}]',
  flaghunt:    '[{"flag":"🇯🇵","options":["Japan","China","South Korea","Vietnam"],"correct":0}]',
  higherlow:   '[{"q":"How many bones are in the human body?","n":206,"unit":"bones"}]',
};

const GUIDANCE = {
  bluff:       'Fill-in-the-blank weird true facts. The blank (___) replaces the most surprising element. Truth in CAPS. Mix global and Gulf/Arab facts when in Arabic.',
  wyr:         'Would You Rather dilemmas — both options equally appealing or equally awful. No obvious right answer. Gulf situations and local culture welcome in Arabic.',
  diss:        'Roast battle setup lines — a prompt letting players write a funny one-liner insult about their specific opponent.',
  quiz:        'Multiple-choice trivia. Vary correct answer position randomly (0-3) and set correct accordingly. Gulf/Arab trivia focus in Arabic. Mix difficulty levels. For football category: World Cup, club football, famous players, Gulf football (Al-Hilal, Al-Ittihad, Saudi Pro League, Gulf Cup, Arab Champions League).',
  mostlikely:  '"Who is most likely to…" questions that spark funny debates in a friend group. Make them specific enough to actually point at someone. Gulf/Arab social situations in Arabic. Examples: "Who is most likely to bring their mom on a first date?" or "Who is most likely to eat alone in a restaurant and pretend they\'re waiting for someone?"',
  trueorlie:   'Absurd-sounding statements that are either genuinely TRUE or FALSE. Should make players doubt themselves. Mix science, history, Gulf/Arab facts, pop culture. "truth" field must be a boolean. Examples of TRUE ones: "Honey never expires" (true), "Saudi Arabia imports sand from Australia" (true). False ones should be believable but wrong.',
  pinpoint:    'Real cities for a geography pin-dropping game. Each entry: "en" = city name in English, "ar" = city name in Arabic script, "lat" = latitude (decimal, -90 to 90), "lon" = longitude (decimal, -180 to 180). ACCURACY IS CRITICAL — wrong coordinates break the game. Use well-known cities you are certain of: capitals, major cities, famous locations. Mix continents. In Arabic mode, include 50% MENA/Arab cities (Riyadh, Dubai, Cairo, Beirut, Amman, Muscat, Kuwait City, Doha, Manama, Tunis, Rabat, Casablanca, Baghdad, Damascus). Never invent coordinates — only use cities you know precisely.',
  emoji:       'EASY emoji rebuses for common words and phrases. Prefer direct compound clues where every symbol means a whole visible word: 🚪🔔 = DOORBELL, ⭐🐟 = STARFISH, 🔥🐶 = HOTDOG. You may mix emojis with uppercase letters or numbers when that makes the sound obvious. A player should understand every clue component in 2 seconds. Never invent a syllable from an unrelated emoji and never use obscure wordplay. Keep answers 4-10 letters and make at least 80% direct compound clues.',
  emojiplace:  'EASY place puzzles for famous cities and countries. Use unmistakable landmark/culture clues (🗼🥐 = PARIS, 🗽🍎 = NEW YORK, 🔺🐫 = CAIRO) or transparent rebuses using emojis plus uppercase letters/numbers (O + 👨 = OMAN, Q + ⏳ = KUWAIT). Never invent unclear syllables such as treating a random rock, mask, flower, or animal as letters. Every clue should be solvable by a casual player, with extra focus on recognizable MENA places in Arabic mode.',
  year:        'Historical events with exact year (y as number). Mix world history, tech, pop culture, sports, Arab/Gulf milestones.',
  interrogation:'Deep, personal, slightly awkward questions that reveal things about people in a friend group. Questions should make players think and be revealing when answered honestly. NOT generic party questions — make them specific and uncomfortable in a fun way. Examples: "What do you secretly judge people for?", "What is the most embarrassing thing you own?", "Who in this room would you call at 3am?". In Arabic mode, use khaleeji social situations: family expectations, wasta, weddings, WhatsApp drama.',
  spy:         'Secret word pools for the Spy Game. Return ONE object with a "category" (location/event/movie/food/sport/animal/celebrity) and "words" (array of 15-20 specific, recognizable words/phrases for that category). Words should be specific enough to discuss without saying the word directly (e.g. "Starbucks" not just "cafe"). In Arabic mode (ar_en flavor), use Arab-world themed words in English (e.g. Souq, Diwaniya, Iftar, Eid, Ramadan, Hajj, Wasta). In global mode, use internationally recognizable places/things.',
  flaghunt:    'Flag identification. "flag" is the flag emoji. "options" has 4 country names, "correct" is the 0-based index of the right answer. Vary the correct index (0-3). Mix flags from all continents — include Arab/Gulf countries in Arabic mode.',
  higherlow:   'Higher or Lower game. "q" is a quantity question, "n" is the exact numeric answer, "unit" is the unit label (e.g. "km", "years", "calories", "meters"). Use surprising facts about numbers. Mix geography, science, sports, food. In Arabic mode, include Gulf/Arab stats.',
};

const cache = new Map();

app.post('/api/prompts', async (req, res) => {
  try {
    const { mode, lang = 'en', count = 10 } = req.body || {};
    if (!SHAPES[mode]) return res.status(400).json({ error: 'Unknown mode: ' + mode });
    const key = mode + ':' + lang;
    let pool = cache.get(key) || [];
    // Keep a larger pool (50+ items) to avoid repeating; refill when running low
    if (pool.length < Math.max(count, 15)) {
      const langName = lang === 'ar' ? 'Gulf Arabic (khaleeji dialect, casual, not formal MSA)' : 'English';
      const audience = lang === 'ar'
        ? 'Arab friend groups in their 20s-30s in the Gulf. Content must feel native, not translated.'
        : 'Mixed international friend groups in their 20s-30s.';
      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        messages: [{ role: 'user', content:
          `Generate 30 unique party game prompts for the "${mode}" mode in ${langName}.\n` +
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
