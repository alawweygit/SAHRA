const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const admin = require('firebase-admin');
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const AI_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

// v237 — global, persistent "already generated this" memory, shared across
// every player/room/device. Previously usedFingerprints (below) lived only
// in this process's RAM, which reset on every redeploy/crash/restart — with
// how many deploys go out in a single day, that meant the AI's "don't
// repeat this" memory was wiped almost constantly, and since every player
// is on a different device/browser, there was no way for the AI to know
// "this exact group already saw this" across sessions either. Firebase
// Realtime Database (the same project the frontend already uses) now
// stores this instead, so it survives everything and is shared globally.
//
// Requires a FIREBASE_SERVICE_ACCOUNT env var on Railway containing the
// full service account JSON (Firebase Console → Project Settings → Service
// Accounts → Generate new private key → paste the whole file's contents as
// this single env var's value). If that's not set, everything below
// degrades gracefully to the old RAM-only behavior — this is a pure
// addition, never a hard requirement for the server to run.
let firebaseDb = null;
try {
  const svcAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (svcAccountRaw) {
    const svcAccount = JSON.parse(svcAccountRaw);
    admin.initializeApp({
      credential: admin.credential.cert(svcAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://highpox-1eec7-default-rtdb.firebaseio.com',
    });
    firebaseDb = admin.database();
    console.log('[HYPOX] Global content dedup: Firebase connected.');
  } else {
    console.log('[HYPOX] Global content dedup: FIREBASE_SERVICE_ACCOUNT not set, using in-memory dedup only.');
  }
} catch (e) {
  console.error('[HYPOX] Global content dedup: Firebase init failed, using in-memory dedup only.', e.message);
  firebaseDb = null;
}

// How many recent fingerprints to keep per mode/region/topic bucket, and how
// many to actually send to the AI as an avoid-list per request (kept small
// so the prompt itself doesn't grow — the STORED history can be larger than
// what's sent on any single call).
const GLOBAL_DEDUP_KEEP = 300;
const GLOBAL_DEDUP_SEND = 25;

function dedupPath(baseKey) {
  // baseKey already looks like "quiz:en:mena:sports" etc — safe as a
  // Firebase path segment once slashes/dots (invalid in RTDB keys) are
  // stripped; baseKey never contains those today, but guard anyway.
  return 'aiUsedContent/' + String(baseKey).replace(/[.#$\[\]\/]/g, '_');
}

async function getGlobalAvoidList(baseKey) {
  if (!firebaseDb) return [];
  try {
    const snap = await firebaseDb.ref(dedupPath(baseKey))
      .orderByChild('t').limitToLast(GLOBAL_DEDUP_SEND).once('value');
    const val = snap.val();
    if (!val) return [];
    return Object.values(val).map(v => v.fp).filter(Boolean);
  } catch (e) {
    console.error('[HYPOX] getGlobalAvoidList failed:', e.message);
    return [];
  }
}

async function recordGlobalUsed(baseKey, fingerprints) {
  if (!firebaseDb || !fingerprints.length) return;
  try {
    const ref = firebaseDb.ref(dedupPath(baseKey));
    const now = Date.now();
    const updates = {};
    fingerprints.forEach((fp, i) => {
      updates[ref.push().key] = { fp, t: now + i };
    });
    await ref.update(updates);
    // Prune: keep only the most recent GLOBAL_DEDUP_KEEP entries so this
    // path doesn't grow forever. Cheap to run every write since RTDB
    // queries here are small and indexed by 't'.
    const snap = await ref.orderByChild('t').once('value');
    const val = snap.val();
    if (val) {
      const keys = Object.keys(val);
      if (keys.length > GLOBAL_DEDUP_KEEP) {
        const sorted = keys.sort((a, b) => val[a].t - val[b].t);
        const toDelete = sorted.slice(0, keys.length - GLOBAL_DEDUP_KEEP);
        const delUpdates = {};
        toDelete.forEach(k => { delUpdates[k] = null; });
        await ref.update(delUpdates);
      }
    }
  } catch (e) {
    console.error('[HYPOX] recordGlobalUsed failed:', e.message);
  }
}

const SHAPES = {
  bluff:        '[{"fact":"A clear weird fact with ___ replacing one word","truth":"ONEWORD","decoys":["WRONG1","WRONG2","WRONG3","WRONG4"]}]',
  wyr:          '[{"a":"Option A (a real dilemma)","b":"Option B (equally tempting or equally bad)"}]',
  interrogation:'[{"q":"What is [NAME] most likely to do at 3am?"}]',
  diss:         '[{"p":"A roast battle setup prompt about your opponent"}]',
  quiz:         '[{"q":"Trivia question","options":["Correct answer","Wrong 1","Wrong 2","Wrong 3"],"correct":0}]',
  mostlikely:   '[{"q":"Who is most likely to..."}]',
  trueorlie:    '[{"s":"An absurd-sounding TRUE statement","truth":true},{"s":"An absurd-sounding FALSE statement","truth":false,"correction":"The real, corrected version of that same statement"}]',
  pinpoint:     '[{"en":"City Name","ar":"اسم المدينة","countryEn":"Country Name","countryAr":"اسم الدولة","lat":25.2,"lon":55.3}]',
  emoji:        '[{"answer":"SEOUL","category":"City","e":"🌊🦉","parts":["sea","owl"],"explanation":"Sea + owl = Seoul"}]',
  emojiplace:   '[{"answer":"PARIS","category":"City","e":"🐾🌹","parts":["paw","ris"],"explanation":"Paw + ris = Paris"}]',
  year:         '[{"q":"The first iPhone was released","y":2007}]',
  higherlow:    '[{"q":"What percentage of people have worn mismatched socks by accident?","n":38,"unit":"%"}]',
  flaghunt:     '[{"flag":"🇯🇵","options":["Japan","China","South Korea","Vietnam"],"correct":0}]',
  spy:          '[{"category":"location","words":["Coffee shop","Airport","Hospital","Casino","Zoo","Library","Prison","Stadium"]}]',
  '2t1l':       '[{"cat":"ABOUT YOU","emoji":"🤥","q":"Name 3 things you have done while travelling"}]',
  busted:       '[{"q":"A short question asked directly to the subject","other":"The same question about {name}"}]',
  blendin:      '[{"a":"Question shown to most players","b":"A closely related but different question shown to the spy"}]',
  harfhunt:     '["Animals","Things in a kitchen","Things you take on holiday"]',
};

const GUIDANCE = {
  bluff:        'Fill-in-the-blank SHOCKING funny true facts. ___ replaces the most surprising word. RULES: (1) truth must be ONE SINGLE WORD only — no exceptions, never a phrase (e.g. BANANAS, LOUDER, CATS, DUBAI, CRYING). (2) The completed sentence must be fully understandable by itself. NEVER leave a number or number-word without its unit or meaning: write "ring at ___ o’clock", NOT "ring at ___"; write "___ years old", NOT just "___". Read the sentence with the truth inserted and reject it if a player could ask "what does that mean?". (3) Include exactly four plausible ONE-WORD wrong answers in decoys. They must fit the blank grammatically, be unique, and differ from truth. (4) The fact must make someone go "wait, WHAT?" out loud — not a dry textbook fact. (5) Favor famous people, scandals, records, money, or bizarre real events. (6) EVERY item must use a different topic. (7) KEEP THE WORDING SIMPLE: under 15 words if possible, everyday words a 12-year-old would know, and clear in one quick read in a noisy room. AVOID: ambiguous missing units, obvious answers, multi-word truths or decoys, dry biology/science-class facts, long sentences, and technical vocabulary.',
  wyr:          'Would You Rather dilemmas — both options equally appealing or awful. No obvious right answer. KEEP BOTH OPTIONS SHORT: max 10-12 words each, one clean idea, no extra setup or explanation tacked on. Say it the way you would say it out loud to a friend, not like a written paragraph. Cut any word that is not doing real work.',
  interrogation:'Funny, spicy or thought-provoking hot-seat prompts about one person. Every question MUST include the exact [NAME] placeholder naturally. Examples: "What would [NAME] do if they were invisible for a day?", "What is [NAME] definitely Googling in private?". Fun, relatable, makes people laugh.',
  diss:         'Roast battle setup lines — prompt to write a funny one-liner insult about the opponent.',
  quiz:         'Multiple-choice trivia. Vary correct position (0-3) so the answer is not predictable. DIFFICULTY MIX: across this batch, include a real spread of easy, medium, and hard questions (roughly equal thirds) rather than making everything the same difficulty — easy = something most people would know quickly, medium = requires some real knowledge, hard = genuinely challenging even for someone knowledgeable. LANGUAGE: keep the wording short and simple (plain, everyday words, no complex sentence structure) so a non-native English speaker or a distracted party-game player can read it in one glance — difficulty should come from the KNOWLEDGE required, never from complicated phrasing. DIVERSITY: within a batch, cover different sub-angles of the topic — do not ask multiple questions that are really the same fact restated, and do not repeat the same specific answer/fact across items.',
  mostlikely:   '"Who is most likely to…" prompts that spark funny debates. ONE IDEA ONLY: each prompt must describe exactly ONE single action or scenario — never combine two separate things into one prompt (e.g. NOT "Who is most likely to show up to the wrong wedding and stay for the food?" — that is two jokes stacked together: showing up to the wrong wedding, AND staying for the food. Pick just one: "Who is most likely to show up to the wrong wedding?" or "Who is most likely to crash a stranger\'s wedding?"). If you notice an "and" joining two different actions in your own draft, cut it down to one. LENGTH: one short, punchy sentence, under 10 words. LANGUAGE: simple, everyday words a 12-year-old would understand — no complicated phrasing, the humor should come from the IDEA, not clever wording. FUNNY: the scenario itself should genuinely make people laugh or go "haha, that\'s so [name]" — pick a specific, instantly-picturable, slightly embarrassing or chaotic single action, not a generic, bland, or compound one. GOOD EXAMPLES (single idea each): "Who is most likely to cry at a Pixar movie?", "Who is most likely to get banned from a group chat?", "Who is most likely to marry a stranger in Vegas?", "Who is most likely to become an overnight influencer?", "Who is most likely to trip on flat ground?", "Who is most likely to become a meme?". MIX THE STYLE: within a batch, blend two flavors roughly evenly — everyday-embarrassing (e.g. crying at a movie, falling asleep in a meeting) and slightly absurd/chaotic (e.g. marrying a stranger in Vegas, becoming a meme) — do not make every item the same flavor. DIVERSITY: cover clearly different situations and topics across the batch (relationships, social habits, work, random chaos, etc.) — never repeat the same underlying scenario reworded, and never reuse the exact examples given here verbatim. AVOID: compound sentences joining two scenarios with "and", unnecessary setup/backstory, and anything that reads like a written paragraph instead of something you\'d blurt out loud to friends.',
  trueorlie:    'Absurd-sounding statements, genuinely TRUE or FALSE. TOPICS: literally anything — science, history, geography, pop culture, sports, animals, food, space, the human body, everyday life. Not limited to just science and history. LANGUAGE: simple, everyday words a 12-year-old would understand — never formal/official/textbook vocabulary. AVOID words like "inaugurated" (say "became president" or "took office" instead), "commenced" (say "started"), "assassinated" (say "was killed"), "ratified" (say "was signed" or "was approved"), or other stiff news-headline language. Read it back and ask: would a 12-year-old know this word? If not, replace it. LENGTH: one short, clean sentence, under 15 words. TOPIC DIVERSITY: every item in a batch must use a different topic — never repeat the same category twice in a row (e.g. two animal facts, two space facts). RECOGNIZABILITY: the subject of the fact should be something a general audience has heard of — not so obscure or niche that nobody could even take an educated guess. ONE CLAIM ONLY: state a single surprising fact and stop — never stack multiple specific details (exact numbers, full official names, precise dates) into one sentence. The underlying fact can absolutely be historical, obscure-sounding, or specific (e.g. a famously short war, a bizarre law, a surprising record) — that is exactly the kind of thing that makes a good round — but trim it down to its one core surprising claim rather than including every detail you know about it. Example: NOT "The shortest war in recorded history lasted only 38 to 45 minutes and was fought between Britain and the Sultanate of Zanzibar in 1896" (three stacked details: exact minute range, both country names, exact year) — instead "The shortest war in history lasted under 40 minutes" (same fun fact, one clean claim, nobody needs to know the war\'s name to enjoy guessing). BELIEVABLE FALSE STATEMENTS: a FALSE statement must sound just as plausible as a TRUE one — never write an obviously fake claim that gives itself away (e.g. wildly impossible numbers, joke logic, or a claim that contradicts common sense on its face). The best FALSE statements are ones that sound completely reasonable until you learn the real answer, so the guess actually feels like a coin flip, not a giveaway. NO AMBIGUOUS OR TRICK WORDING: avoid absolutes like "always" or "never" and vague qualifiers that make a statement debatable both ways — every statement must have one single, undisputed correct answer with no room for "well, technically..." arguments. "truth" must be a plain boolean (true or false), never written as a quoted string like "true" or "false". CORRECTION FIELD: when truth is false, you must also include a "correction" field — the real, true version of that exact same statement (same sentence structure, just with the false detail swapped for the real one), so players learn the actual fact instead of just being told "false". Example: statement "The first man-made object to reach space was launched by the USA" (false) needs correction "The first man-made object to reach space was launched by the USSR" — same sentence shape, one detail corrected, same plain language rules apply to the correction too. When truth is true, omit the correction field entirely (a true statement has nothing to correct). EVERY batch must contain both true and false statements. For an even batch, make exactly half true and half false, alternating truth values so one type can never dominate.',
  pinpoint:     'Real, well-known cities — national capitals or major globally-recognizable cities (e.g. Dubai, Abu Dhabi, New York, Tokyo, Cairo, Paris) that most people would recognize by name, not obscure towns. Always include the city and country in both languages: en, ar, countryEn, countryAr. Accurate lat/lon. VARIETY: within a single batch, spread picks across DIFFERENT continents/regions (do not cluster on the same 2-3 regions) and avoid defaulting to only the most stereotypical handful of world capitals every time — there are dozens of well-known cities to draw from, actively rotate through them rather than settling on the same "safe" few.',
  emoji:        'Phonetic rebus: emojis SOUND OUT a word. "parts" = phonetic sounds.',
  emojiplace:   'Phonetic rebus for CITIES only.',
  year:         'Historical events with exact year. Mix world history, tech, and sports milestones. LANGUAGE: simple, everyday words a 12-year-old would understand — describe WHAT happened in plain terms, never formal/official vocabulary. AVOID words like "inaugurated" (say "became president" or "took office" instead), "commenced" (say "started"), "assassinated" (say "was killed"), "ratified" (say "was signed" or "was approved"), or other stiff textbook/news-headline language. Read it back and ask: would a 12-year-old know this word? If not, replace it. LENGTH: one short, clean sentence, under 15 words if possible — no stacked details or subordinate clauses. TOPIC DIVERSITY: every item in a batch must use a different topic/event — never repeat the same category twice in a row (e.g. two tech launches, two sports records). RECOGNIZABILITY: pick events a general audience would recognize by name — not obscure or niche facts nobody could place even roughly. ONE CLAIM ONLY: describe a single fact/event — never stack multiple details (exact dates, extra names, secondary facts) into one description. The year must be a plain number (e.g. 2007), never written as a string or in quotes.',
  higherlow:    'FORMAT: every question asks "What percentage of people have/do ___?" — "n" is that percentage (a whole number 1-99), "unit" is always "%". This is a GUESSPIONAGE-style mode (Jackbox Party Pack 3), not a trivia-facts mode — the entire point is guessing human behavior, not recalling external facts. LANGUAGE: simple, everyday words a 12-year-old would understand — never formal/official/textbook vocabulary. LENGTH: under 20 words, one short clean question. TOPIC DIVERSITY: every item in a batch must cover a different kind of behavior — never repeat the same flavor twice in a row (e.g. two food habits, two embarrassing-moment questions). RECOGNIZABILITY: the behavior must be something a general audience can instantly picture themselves or someone they know doing — a specific, concrete, everyday scenario, never a vague or oddly niche situation nobody has actually experienced. RELATABLE HUMAN BEHAVIOR ONLY, NOT EXTERNAL TRIVIA: every question must be about something ordinary people do, have done, believe, or prefer — daily habits, quirky behaviors, embarrassing moments, common preferences, social situations, minor bad habits, funny coincidences. NEVER ask about external facts, measurements, historical events, celebrities, sports statistics, animal facts, or anything requiring specialized knowledge to answer — if the question could appear in Time Machine, Quiz, or a trivia book, it is the WRONG question for this mode. ONE CLEAR YES/NO BEHAVIOR: the question must describe one single, concrete, unambiguous action or habit — not a vague feeling, not multiple actions stacked together, not something debatable about what counts, no compound questions. COUNTERINTUITIVE TRUTH (the single most important rule — this is what makes or breaks the whole mode): the real percentage must genuinely surprise most people, not confirm what they already assume. Before picking "n", ask yourself what percentage an average person would instinctively guess just from reading the question — then the REAL answer must land noticeably far from that instinct, either much higher or much lower. If a behavior sounds common, make the true percentage surprisingly LOW; if a behavior sounds rare or embarrassing, make the true percentage surprisingly HIGH. A question whose true answer matches common intuition is a failed question for this mode — there is nothing to guess, because everyone already knows the rough answer. This is different from just avoiding 0%/100% extremes: a question can sit safely in the middle (e.g. 45%) and STILL be a bad question if 45% is exactly what people would have guessed anyway. The test is not "is this a moderate percentage" — the test is "would most people be surprised to learn this number, in either direction". Examples of the RIGHT shape (style only, invent new specific behaviors, do not reuse verbatim): a mundane-sounding habit that turns out almost everyone secretly does (surprisingly high), or a behavior that sounds extremely common but turns out to be a minority habit (surprisingly low). BELIEVABLE RANGE: keep "n" somewhere between roughly 10 and 90 so the guess is never a giveaway from the number alone — the surprise must come from the gap between intuition and truth, not from an extreme number. KEEP IT PARTY-APPROPRIATE: funny, embarrassing, quirky, or relatable is great — but never sexual, offensive, humiliating toward a protected group, or inappropriate for a mixed group of friends. "n" must be a plain number (1-99), never a quoted string, and "unit" must always be exactly "%".',
  flaghunt:     'Flag emoji + 4 country options. "correct" is 0-based index. Vary position. Mix all continents.',
  spy:          'Secret word pool. ONE object with "category" and "words" array (15-20 specific items).',
  '2t1l':       'Short personal category prompts that let one player write exactly two truths and one lie. Ask them to name 3 related things. Include a fitting emoji.',
  busted:       'Personal, playful questions with two versions. "q" addresses the subject directly. "other" asks the same thing about {name}; preserve the exact {name} placeholder. Answers should be short enough for a party game.',
  blendin:      'Each object is a subtle question pair. "a" and "b" must be closely related and invite the same kind of short answer, but not be identical. The different answer should be detectable only after discussion.',
  harfhunt:     'Return broad, familiar party-game category strings only. Each category must have many plausible answers across many starting letters. Avoid narrow or obscure categories.',
};

// Pre-seeded banned questions — things Claude defaults to that we NEVER want
const ALWAYS_BANNED = {
  'higherlow:en': new Set([]),
  'higherlow:ar': new Set([]),
  'bluff:en': new Set(['platypus', 'honey never expires', 'cleopatra']),
};

// Topic domains to rotate — forces different categories each call
const DOMAINS = {
  higherlow: [
    'daily habits and routines (morning/night habits, phone habits, hygiene habits)',
    'embarrassing moments (social slip-ups, awkward situations, minor accidents)',
    'food and eating habits (quirky preferences, unusual combinations, table manners)',
    'social media and phone behavior (checking habits, posting habits, texting habits)',
    'relationships and social situations (dating, friendships, awkward interactions)',
    'money and shopping habits (impulse buys, haggling, price-tag habits)',
    'sleep and bedroom habits (sleep positions, nighttime routines, dreams)',
    'travel and driving habits (road trip habits, packing habits, driving quirks)',
    'work and school habits (procrastination, meeting habits, classroom habits)',
    'minor superstitions and quirky beliefs (lucky habits, small rituals)',
    'pet and animal-related behavior (talking to pets, treating pets like people)',
    'small white lies and social fibs (polite lies, excuses, avoidance tactics)',
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
  if (typeof item === 'string') return item.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 160);
  if (!item || typeof item !== 'object') return '';
  const key = item.q || item.fact || item.s || item.p || item.a || item.answer ||
    item.en || item.flag || item.category || (Array.isArray(item.words) ? item.words.join('|') : '');
  return String(key || '').trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 160);
}

// v215 — country list used to code-level enforce the region toggle for the
// two modes where "which country/city" is objectively checkable data
// (pinpoint, flaghunt). Other modes (bluff, wyr, quiz, etc.) are judgment/
// prose-based and can only be steered via the prompt (regionSection in
// generateBatch), not verified in code — there's no reliable programmatic
// way to tell if a fact or dilemma "is" Arab-flavored the way there is for
// a country name.
const MENA_COUNTRIES = new Set([
  'saudi arabia', 'uae', 'united arab emirates', 'oman', 'qatar', 'bahrain', 'kuwait',
  'jordan', 'lebanon', 'syria', 'iraq', 'palestine', 'egypt', 'libya', 'tunisia',
  'algeria', 'morocco', 'sudan', 'yemen', 'mauritania', 'comoros', 'djibouti', 'somalia',
  'المملكة العربية السعودية', 'السعودية', 'الإمارات', 'عمان', 'قطر', 'البحرين', 'الكويت',
  'الأردن', 'لبنان', 'سوريا', 'العراق', 'فلسطين', 'مصر', 'ليبيا', 'تونس', 'الجزائر',
  'المغرب', 'السودان', 'اليمن', 'موريتانيا', 'جزر القمر', 'جيبوتي', 'الصومال',
]);

function isValidPrompt(mode, item, region) {
  if (mode === 'harfhunt') return typeof item === 'string' && item.trim().length >= 3;
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  const text = key => typeof item[key] === 'string' && item[key].trim().length > 0;
  // v253 — same bug class as Time Machine (v239) and True or Lie (v243):
  // Number.isInteger(item.correct) rejects the ENTIRE item the moment the
  // model returns "correct":"2" (a quoted string) instead of "correct":2
  // (a bare number) -- LLMs do this inconsistently. Used by both Quiz and
  // Flaghunt (fourChoices() below is shared by both), so this one bug could
  // silently degrade two AI-backed modes to their small static pools at
  // once, with no visible error. Coerce numeric-looking strings instead of
  // rejecting them outright, normalizing item.correct in place so
  // downstream code always gets a real number.
  const fourChoices = () => {
    if (!Array.isArray(item.options) || item.options.length !== 4) return false;
    if (!item.options.every(option => typeof option === 'string' && option.trim())) return false;
    const correctNum = Number(item.correct);
    if (!Number.isInteger(correctNum) || correctNum < 0 || correctNum >= 4) return false;
    item.correct = correctNum;
    return true;
  };
  const oneWord = value => typeof value === 'string' && value.trim() && value.trim().split(/\s+/).length === 1;
  const atMostWords = (value, limit) => typeof value === 'string' &&
    value.trim().length > 0 && value.trim().split(/\s+/).length <= limit;
  const clearBluff = () => {
    if (!text('fact') || !item.fact.includes('___') || !oneWord(item.truth)) return false;
    if (!Array.isArray(item.decoys) || item.decoys.length !== 4 || !item.decoys.every(oneWord)) return false;
    const normalized = [item.truth, ...item.decoys].map(value => value.trim().toLocaleUpperCase());
    if (new Set(normalized).size !== normalized.length) return false;

    // A bare number at the end of a sentence is exactly the kind of unclear
    // output that produced "could only ring at FOUR". Require visible context
    // after numeric answers ("FOUR o'clock", "SEVEN years", etc.).
    const numberWords = /^(?:\d+(?:[.,]\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|واحد|واحدة|اثنان|اثنين|ثلاثة|أربعة|اربعة|خمسة|ستة|سبعة|ثمانية|تسعة|عشرة|[٠-٩]+)$/iu;
    if (numberWords.test(item.truth.trim())) {
      const afterBlank = item.fact.split('___', 2)[1] || '';
      if (!/[\p{L}\p{N}]/u.test(afterBlank)) return false;
    }
    return true;
  };
  switch (mode) {
    // v208 — "truth must be ONE SINGLE WORD" was only ever a prompt
    // instruction; nothing here ever checked it, so a multi-word truth
    // from the model could reach real games (it stands out immediately
    // next to one-word player lies, breaking the bluff). Numbers like
    // "1889" and hyphenated single words like "SPAGHETTO-ISH" still pass;
    // only whitespace-separated multi-word phrases are rejected.
    case 'bluff': return clearBluff();
    // The prompt asks the model for short spoken-style choices, but prompt
    // guidance is not enforcement. Reject anything over the stated limit so
    // a verbose AI response is regenerated instead of reaching a phone.
    case 'wyr': return atMostWords(item.a, 12) && atMostWords(item.b, 12);
    case 'interrogation': return text('q') && item.q.includes('[NAME]');
    case 'diss': return text('p');
    case 'quiz': return text('q') && fourChoices();
    case 'mostlikely': return text('q');
    case 'trueorlie': {
      // v243 — same bug class as Time Machine's year field (v239). The
      // strict typeof item.truth === 'boolean' check rejects the entire
      // item the moment the model returns "truth":"true" (a quoted
      // string) instead of "truth":true (a real boolean) -- and this is
      // if anything MORE likely to happen than the year-as-string bug,
      // since LLMs frequently write booleans as the words "true"/"false"
      // in quotes. If this happens somewhat systematically for this
      // shape, most/all of a batch gets silently rejected and _load()
      // quietly serves the small static PACKS.trueorlie pool instead --
      // nothing errors, it just looks like AI isn't running. Accept
      // "true"/"false" strings (case-insensitively) as well as real
      // booleans, and normalize item.truth to an actual boolean in place
      // so downstream code (host.js's correctId comparison) always gets
      // real true/false, never a truthy-but-wrong string.
      // v257 — Ali's request: when the answer is FALSE, show the corrected
      // true statement too (e.g. "was launched by the USSR" instead of the
      // false claim's "USA"), so wrong statements actually teach something
      // rather than just being revealed as wrong. Only required when
      // truth===false; a true statement has nothing to correct.
      if (!text('s')) return false;
      let truthOk = false;
      if (typeof item.truth === 'boolean') truthOk = true;
      else if (typeof item.truth === 'string') {
        const normalized = item.truth.trim().toLowerCase();
        if (normalized === 'true') { item.truth = true; truthOk = true; }
        else if (normalized === 'false') { item.truth = false; truthOk = true; }
      }
      if (!truthOk) return false;
      if (item.truth === false && !text('correction')) return false;
      return true;
    }
    case 'pinpoint': {
      // v253 — same bug class as year/trueorlie/fourChoices/higherlow above:
      // Number.isFinite(item.lat/lon) rejects the whole item if the model
      // returns coordinates as quoted strings instead of bare numbers.
      if (!(text('en') && text('ar') && text('countryEn') && text('countryAr'))) return false;
      const latNum = Number(item.lat), lonNum = Number(item.lon);
      if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) return false;
      item.lat = latNum; item.lon = lonNum;
      const isMenaCountry = MENA_COUNTRIES.has(String(item.countryEn).trim().toLowerCase()) || MENA_COUNTRIES.has(String(item.countryAr).trim());
      if (region === 'mena' && !isMenaCountry) return false;
      if (region !== 'mena' && isMenaCountry) return false;
      return true;
    }
    case 'emoji':
    case 'emojiplace': return text('answer') && text('e');
    case 'year': {
      // v239 — Ali reported Time Machine's AI content "not working" (in
      // practice: felt like the same ~20 historical facts on repeat, the
      // same symptom pattern as the earlier Quiz-category bug). The
      // frontend request/response path tested fine in isolation, so the
      // likely cause is here: the strict Number.isFinite(item.y) check
      // rejects the ENTIRE item if the model ever returns the year as a
      // quoted string ("2007") instead of a bare number (2007) -- which
      // LLMs do inconsistently despite the schema hint saying "y":2007.
      // One rejected item wouldn't matter, but if this happens somewhat
      // systematically for this shape, most/all of a batch could get
      // silently rejected here, and _load()'s fallback quietly serves the
      // small static PACKS.year pool instead -- indistinguishable from "AI
      // isn't running" to a player, since nothing errors, it just looks
      // repetitive. Coerce numeric-looking strings instead of rejecting
      // them outright, and normalize item.y in place so downstream
      // arithmetic (the year-difference scoring in host.js) always gets a
      // real number, not a string.
      if (!text('q')) return false;
      const yNum = Number(item.y);
      if (!Number.isFinite(yNum)) return false;
      item.y = yNum;
      return true;
    }
    case 'higherlow': {
      // v261 — full rebuild per Ali's request (researched Jackbox's
      // Guesspionage as the reference design): every question is now
      // "What percentage of people ___?" instead of an external-fact
      // measurement. Schema simplified accordingly -- unit must always be
      // "%", and n must be a believable percentage (1-99, never a giveaway
      // 0 or 100).
      // v253 — same bug class as year/trueorlie/fourChoices above:
      // Number.isFinite(item.n) rejects the whole item if the model returns
      // the number as a quoted string ("50") instead of a bare number (50).
      if (!text('q')) return false;
      const nNum = Number(item.n);
      if (!Number.isFinite(nNum) || nNum < 1 || nNum > 99) return false;
      if (String(item.unit).trim() !== '%') return false;
      item.n = nNum;
      return true;
    }
    case 'flaghunt': {
      if (!(text('flag') && fourChoices())) return false;
      const correctCountry = item.options && item.options[item.correct];
      if (typeof correctCountry !== 'string') return true; // fourChoices/correct-index already validated elsewhere
      const isMenaCountry = MENA_COUNTRIES.has(correctCountry.trim().toLowerCase());
      if (region === 'mena' && !isMenaCountry) return false;
      if (region !== 'mena' && isMenaCountry) return false;
      return true;
    }
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

// v209 — pickDomain() (whole-batch domain pinning) removed; every mode with
// a DOMAINS list now uses pickDomainSpread() (per-item rotation) below instead.
const lastDomain = new Map();

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

// v231 — topic map for Quiz's category picker (General Mix, Geography,
// Science, Pharmacy, Gulf & Arab, Pop Culture, Sports, Football, History).
// Previously the frontend only used this to filter its OWN static question
// pool (js/content.js's TRIVIA_CATS) — once that pool ran short and AI
// content filled the gap, the AI request never mentioned which category was
// picked at all, so AI-generated overflow silently ignored it (e.g.
// picking "Sports" could still return Science questions once the static
// pool of ~20 ran out). Keys match the frontend's CAT_INFO ids exactly.
const QUIZ_TOPICS = {
  geography: 'Geography — world capitals, countries, landmarks, rivers, mountains, borders.',
  science:   'Science — physics, chemistry, biology, space, everyday science facts. Keep it general-audience, not textbook-technical.',
  medical:   'Pharmacy and pharmaceuticals — drug names (generic and brand), drug classes (e.g. antibiotics, painkillers, antihistamines), how common medicines work, famous drugs and their history, vaccines, OTC vs prescription, dosage forms (tablet/syrup/injection). Written for someone with a pharmacy-student level of interest, but still understandable to a general party-game audience — no obscure pharmacology jargon, no specific dosing numbers that could be mistaken for real medical advice.',
  gulf:      'Gulf and Arab world — history, culture, geography, food, landmarks, and notable figures specific to the Gulf and wider Arab world.',
  pop:       'Pop culture — movies, TV shows, music, celebrities, internet culture, games. Keep references broadly recognizable, not deep-cut/niche.',
  sports:    'Sports in general — Olympics, tennis, basketball, athletics, and other sports besides football/soccer.',
  football:  'Football (soccer) — clubs, players, World Cup history, leagues, records. Football/soccer specifically, not other sports.',
  history:   'History — major world events, civilizations, wars, discoveries, historical figures. Keep dates/names widely known, not obscure.',
};

async function generateBatch(mode, lang, used, baseKey, requestedCount, region, topic) {
  const langName = lang === 'ar' ? 'Gulf Arabic (khaleeji dialect)' : 'English';
  const isMena = region === 'mena';
  // Language and region are independent: previously several per-mode
  // GUIDANCE strings hardcoded Arab/Gulf content whenever lang==='ar',
  // regardless of what the region flag said. That's now removed — the
  // regionSection below is the single, mode-agnostic source of truth.
  const audience = isMena
    ? 'Arab/Gulf friend groups (MENA region) — even if this request is in English, keep the flavor, references, and cultural context distinctly Arab/Gulf.'
    : 'Mixed international friend groups — do not skew specifically Arab/Gulf/MENA regardless of output language.';
  // v215 — made strict/exclusionary in both directions. Previously this only
  // added a positive push toward MENA content when region==='mena' and did
  // nothing otherwise, so Global Mix could still surface Arab-specific
  // content (the AI has no reason to avoid it unless told to), and MENA mode
  // was phrased as "should" rather than "only", so global content could
  // still slip in. Also several per-mode GUIDANCE strings independently said
  // things like "Gulf/Arab focus in Arabic" or "Mix... Gulf milestones" —
  // those are now superseded by this always-present, mode-agnostic section,
  // which is the single source of truth keyed off the actual region flag,
  // not language.
  const regionSection = isMena
    ? `\nREGION (STRICT): Every single item in this batch MUST be Arab/MENA/Gulf-specific — real people, places, food, history, or culture drawn distinctly from the Arab world (Gulf, Levant, North Africa). ZERO items may reference non-Arab countries, non-Arab celebrities/figures, or generic/Western/global defaults. If you cannot make an item authentically Arab/MENA, pick a different topic entirely rather than writing something generic. This applies regardless of the output language.`
    : `\nREGION (STRICT): This is GLOBAL content — do not skew toward the Arab world/Gulf/MENA. Draw from a wide international mix (Americas, Europe, Asia, Africa, Oceania, etc.) the way a general worldwide audience would expect. It is fine if an item happens to touch the Arab world occasionally as part of that global mix, but do not make it the recurring theme, and do not default to Gulf/Arab context just because the output language is Arabic.`;

  // v231 — topic section for Quiz's category picker. Only meaningful for
  // 'quiz' (the only mode with a player-facing category selector); topic is
  // undefined/ignored for every other mode. When a category IS selected,
  // this takes priority over the generic "mix of everything" default quiz
  // behavior -- every item in the batch must fit the chosen category.
  const topicSection = (mode === 'quiz' && topic && QUIZ_TOPICS[topic])
    ? `\nTOPIC (STRICT): Every single item in this batch must be about ${QUIZ_TOPICS[topic]} Do not drift into unrelated categories.`
    : '';
  // Build a strong avoidance list from recent fingerprints + always-banned
  // + the global, persistent, cross-device history (see getGlobalAvoidList
  // above) — this last one is what actually survives redeploys and is
  // shared across every player/room, not just this one server process.
  const recentUsed = used ? [...used].slice(-20) : [];
  const alwaysBanned = ALWAYS_BANNED[baseKey] ? [...ALWAYS_BANNED[baseKey]] : [];
  const globalUsed = await getGlobalAvoidList(baseKey);
  const avoidList = [...new Set([...alwaysBanned, ...recentUsed, ...globalUsed])];

  const avoidSection = avoidList.length
    ? `\nSTRICTLY AVOID these topics/phrases: "${avoidList.join('", "')}"` 
    : '';

  // v209 — the per-item domain-spread fix (originally bluff-only, v208) is
  // now applied to EVERY mode that has a DOMAINS list (currently bluff and
  // higherlow), not just bluff. Higher/Lower was still using the old
  // whole-batch pickDomain(), so a batch of "architecture" questions could
  // surface several building-height questions back to back before the next
  // batch's domain changed. Any mode with a DOMAINS[] entry now rotates
  // domains per item within the batch; modes with no DOMAINS entry are
  // unaffected (domainSection stays empty for them, same as before).
  let domainSection = '';
  if (DOMAINS[mode] && DOMAINS[mode].length) {
    const spread = pickDomainSpread(mode);
    domainSection = spread.length
      ? `\nTOPIC ROTATION — cycle through these domains in order, one per item, wrapping around if you run out: ${spread.map((d, i) => `${i + 1}) ${d}`).join('; ')}. Item 1 uses domain 1, item 2 uses domain 2, etc. Never let two consecutive items share a domain or feel closely related (e.g. don't follow one building-height question with another building-height question, or one animal question with another animal question).`
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
      `RULES:${domainSection}${regionSection}${topicSection}${avoidSection}\n` +
      `- Every item must be GENUINELY DIFFERENT from all others\n` +
      `- Be specific and surprising — avoid generic/obvious examples\n` +
      `- All facts must be 100% accurate\n` +
      `- Return ONLY a valid JSON array, no markdown or explanation\n` +
      `- Every item must match: ${SHAPES[mode]}`
    }],
  });

  const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const clean = text.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);
  if (mode === 'trueorlie' && parsed.length > 1) {
    const truthValues = new Set(parsed.filter(item => typeof item?.truth === 'boolean').map(item => item.truth));
    if (truthValues.size < 2) throw new Error('trueorlie batch must mix true and false statements');
  }
  return parsed;
}

app.post('/api/prompts', async (req, res) => {
  try {
    const { mode, lang = 'en', region = null, topic = null } = req.body || {};
    const count = Math.min(40, Math.max(1, Math.floor(Number(req.body && req.body.count) || 10)));
    if (!SHAPES[mode]) return res.status(400).json({ error: 'Unknown mode: ' + mode });

    // The browser persists these fingerprints across rooms and sends them
    // back on every request. This closes the gap left by Railway restarts or
    // multiple backend instances, where the in-memory `used` set alone can
    // forget yesterday's cities/questions and generate them again.
    const requestedExclusions = new Set(
      (Array.isArray(req.body && req.body.exclude) ? req.body.exclude : [])
        .filter(value => typeof value === 'string' && value.trim())
        .slice(-300)
        .map(value => value.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 160))
    );

    // region and topic are both part of the cache/used-fingerprint key so
    // MENA-flavored, global-flavored, and per-category batches for the same
    // mode+lang never get mixed together (a "Pharmacy" batch should never
    // silently reuse a "Sports" batch's cached pool, for example).
    const baseKey = mode + ':' + lang + (region ? ':' + region : '') + (topic ? ':' + topic : '');
    let currentPool = pool.get(baseKey) || [];
    if (!usedFingerprints.has(baseKey)) usedFingerprints.set(baseKey, new Set());
    const used = usedFingerprints.get(baseKey);
    const blocked = new Set([...used, ...requestedExclusions]);

    // Cached reserve items may have been generated before this device's
    // persistent history arrived. Remove those before deciding whether the
    // pool is large enough; otherwise an excluded item could still be served.
    currentPool = currentPool.filter(item => {
      const fp = getFingerprint(item);
      return fp && !blocked.has(fp) && !isBanned(item, baseKey);
    });
    currentPool.forEach(item => blocked.add(getFingerprint(item)));

    // Validation/model variance can occasionally leave fewer usable items
    // than requested. Make up to three bounded attempts so games receive a
    // full fresh set instead of silently reusing an excluded prompt.
    for (let attempt = 0; currentPool.length < count && attempt < 3; attempt++) {
      try {
        const fresh = await generateBatch(mode, lang, blocked, baseKey, count - currentPool.length, region, topic);
        // Filter out used AND always-banned items
        const novel = fresh.filter(item => {
          const fp = getFingerprint(item);
          if (!fp || blocked.has(fp) || !isValidPrompt(mode, item, region) || isBanned(item, baseKey)) return false;
          blocked.add(fp);
          return true;
        });
        currentPool = [...currentPool, ...novel].sort(() => Math.random() - 0.5);
      } catch(e) {
        console.error('Generation error:', e.message);
        // Invalid model output (including an all-true/all-false batch) gets a
        // fresh attempt. Do not turn one malformed AI response into a failed
        // game when two retry opportunities remain.
        if (attempt < 2) continue;
        if (!currentPool.length) return res.status(500).json({ error: 'generation failed: ' + e.message });
        break;
      }
    }

    let out;
    if (mode === 'trueorlie' && count > 1) {
      // The reserve is shuffled, so slicing it can accidentally return only
      // one answer type even when generation was balanced. Pin one of each
      // into the game, then fill the remaining slots from the unused reserve.
      const oneTrue = currentPool.find(item => item.truth === true);
      const oneFalse = currentPool.find(item => item.truth === false);
      const required = [oneTrue, oneFalse].filter(Boolean);
      const requiredSet = new Set(required);
      out = [...required, ...currentPool.filter(item => !requiredSet.has(item))].slice(0, count);
    } else {
      out = currentPool.slice(0, count);
    }
    out.forEach(item => used.add(getFingerprint(item)));

    // Keep used set bounded
    if (used.size > 300) {
      const arr = [...used];
      usedFingerprints.set(baseKey, new Set(arr.slice(-200)));
    }

    // v237 — record what was actually delivered into the global, persistent
    // Firebase dedup history too, not just this process's RAM. Fire-and-
    // forget (not awaited) so a slow/unreachable Firebase never delays the
    // response back to players; recordGlobalUsed already no-ops safely if
    // firebaseDb isn't configured.
    recordGlobalUsed(baseKey, out.map(getFingerprint).filter(Boolean));

    const delivered = new Set(out);
    pool.set(baseKey, currentPool.filter(item => !delivered.has(item)));
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
    // v258 — this endpoint is shared by every mode's translate button
    // (Bluff, Quiz, Time Machine, Most Likely To, True or Lie, etc.), but
    // the prompt used to unconditionally say "Keep ___ as is" -- an
    // instruction only relevant to Bluff's fill-in-the-blank sentences.
    // For modes with no blank at all (e.g. True or Lie's complete
    // statements), priming the model to expect and preserve a placeholder
    // that isn't there caused it to truncate the translation and insert a
    // stray placeholder instead of translating the full sentence (Ali
    // reported "Nintendo started out as a playing card company" coming
    // back as "...لصناعة ـــ." with the actual ending missing). Only
    // include the blank-preservation instruction when the text actually
    // contains one.
    const hasBlank = text.includes('___');
    const instructions = hasBlank
      ? 'Translate this game question to Arabic. Keep ___ as is. Return ONLY the translation, nothing else:'
      : 'Translate this game question to Arabic, translating the FULL sentence completely with nothing omitted. Return ONLY the translation, nothing else:';
    const msg = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 300,
      messages: [{ role: 'user', content: `${instructions}\n${text}` }],
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
