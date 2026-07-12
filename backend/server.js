const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const SHAPES = {
  bluff: '[{"fact":"A weird true fact with ___ replacing the surprising part","truth":"THE SURPRISING ANSWER IN CAPS"}]',
  wyr: '[{"a":"Option A (a real dilemma)","b":"Option B (equally tempting or equally bad)"}]',
  interrogation: '[{"q":"A spicy but fun personal question about the players themselves"}]',
  diss: '[{"p":"A roast battle setup prompt about your opponent"}]',
  quiz: '[{"q":"Trivia question","options":["Correct answer","Wrong answer","Wrong answer","Wrong answer"],"correct":0}]',
  pinpoint: '[{"city":"City name in English","city_ar":"اسم المدينة بالعربي","lat":25.2,"lng":55.3}]',
  emoji: '[{"e":"🗼🥐🍷","options":["Paris","Rome","London","Madrid"],"correct":0}]',
  year: '[{"q":"The first iPhone was released","y":2007}]',
};
const GUIDANCE = {
  bluff: 'Fill-in-the-blank weird facts. The blank (___) replaces the most surprising element. Truth in CAPS. Mix global and Gulf/Arab facts when in Arabic.',
  wyr: 'Would You Rather dilemmas where both options are equally appealing or equally terrible. No obvious right answer. Gulf situations welcome in Arabic.',
  interrogation: 'Anonymous confession prompts revealing personality differences between friends. Spicy but not offensive.',
  diss: 'Roast battle setup lines — a prompt letting players write a funny insult about their opponent.',
  quiz: 'Multiple choice trivia. Vary the position of the correct answer randomly across questions and set the correct index accordingly. Gulf/Arab trivia when in Arabic.',
  pinpoint: 'Real world cities — mix of famous and surprising. Must include accurate lat/lng coordinates.',
  emoji: 'Emoji riddles: 3-4 emojis representing a country, city, or famous place, plus 4 answer options. Vary the correct index. Mix global and Arab/Gulf places when in Arabic.',
  year: 'Historical events with their exact year (y as a number). Mix world history, tech, pop culture, sports, and Arab/Gulf milestones.',
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
      const audience = lang === 'ar' ? 'Arab friend groups in their 20s-30s in the Gulf. Content should feel native, not translated.' : 'Mixed international friend groups in their 20s-30s.';
      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        messages: [{ role: 'user', content: 'Generate 20 unique party game prompts for the "' + mode + '" mode in ' + langName + '.\nAudience: ' + audience + '\nGuidance: ' + GUIDANCE[mode] + '\nRules:\n- Be creative, funny, and culturally relevant\n- No offensive content (racism, explicit sexual content, religion-mocking)\n- Each prompt must be distinct\n- Return ONLY a valid JSON array, no markdown fences, no explanation\n- Match exactly this shape: ' + SHAPES[mode] }],
      });
      const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
      const clean = text.replace(/```json|```/g, '').trim();
      let fresh;
      try { fresh = JSON.parse(clean); } catch (e) { return res.status(500).json({ error: 'AI returned invalid JSON' }); }
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
app.get('/health', (_, res) => res.json({ ok: true, timestamp: new Date().toISOString() }));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('HYPOX AI backend running on port ' + PORT));
