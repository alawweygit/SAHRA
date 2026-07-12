/* HYPOX AI Content Backend — deploy on Railway
   POST /api/prompts { mode, lang, count } → { prompts: [...] }
   Uses Claude to generate fresh party game prompts on demand. */
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SHAPES = {
  bluff: `[{"fact":"A weird true fact with ___ replacing the surprising part","truth":"THE ANSWER"}]`,
  wyr: `[{"a":"Option A dilemma","b":"Option B dilemma"}]`,
  interrogation: `[{"q":"A spicy personal question for friends"}]`,
  diss: `[{"p":"A roast battle prompt about 'your opponent'"}]`,
  quiz: `[{"q":"Trivia question","options":["A","B","C","D"],"correct":0}]`,
};

const cache = new Map(); // simple in-memory cache per mode+lang

app.post('/api/prompts', async (req, res) => {
  try {
    const { mode, lang = 'en', count = 10 } = req.body || {};
    if (!SHAPES[mode]) return res.status(400).json({ error: 'bad mode' });

    const key = `${mode}:${lang}`;
    let pool = cache.get(key) || [];

    if (pool.length < count) {
      const langName = lang === 'ar' ? 'Gulf Arabic (khaleeji dialect, casual)' : 'English';
      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        messages: [{
          role: 'user',
          content: `Generate 20 party game prompts for the "${mode}" game mode in ${langName}.
The audience is Arab friend groups in their 20s-30s. Content should be funny, edgy but clean, culturally relevant to Gulf/MENA when in Arabic.
Return ONLY a JSON array, no markdown, matching exactly this shape: ${SHAPES[mode]}`
        }],
      });
      const text = msg.content.map(b => b.text || '').join('');
      const clean = text.replace(/```json|```/g, '').trim();
      const fresh = JSON.parse(clean);
      pool = pool.concat(fresh);
    }

    const out = pool.slice(0, count);
    cache.set(key, pool.slice(count)); // consume
    res.json({ prompts: out });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'generation failed' });
  }
});

app.get('/health', (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('HYPOX AI backend on :' + PORT));
