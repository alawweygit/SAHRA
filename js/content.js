/* SAHRA — content packs (original, bilingual) + AI hook
   AI HOOK: set window.SAHRA_CONFIG.aiEndpoint to a URL on your Railway backend.
   POST { mode, lang, count } -> { prompts: [...] } matching the shapes below.
   If unset or the request fails, local packs are used. */

const PACKS = {
  /* ---- BLUFF BANQUET: { fact: text with ___ , truth } ---- */
  bluff: {
    en: [
      { fact: 'In Switzerland, it is illegal to own ___', truth: 'JUST ONE GUINEA PIG (they get lonely)' },
      { fact: 'The Dubai Police supercar fleet famously includes ___', truth: 'A BUGATTI VEYRON' },
      { fact: 'Australia regularly exports ___ to Saudi Arabia', truth: 'CAMELS' },
      { fact: 'Astronauts in space temporarily become ___', truth: 'ABOUT 5CM TALLER' },
      { fact: 'Archaeologists found 3,000-year-old ___ in Egyptian tombs — still edible', truth: 'HONEY' },
      { fact: 'To make it rain more, the UAE uses ___', truth: 'CLOUD-SEEDING DRONES' },
      { fact: 'An octopus has three ___', truth: 'HEARTS' },
      { fact: 'The Eiffel Tower gets about 15cm ___ every summer', truth: 'TALLER (metal expands)' },
      { fact: 'Botanically speaking, a banana is actually ___', truth: 'A BERRY' },
      { fact: 'In Japan, a train station stayed open for years to serve ___', truth: 'ONE SINGLE STUDENT' },
      { fact: 'Scotland’s official national animal is ___', truth: 'THE UNICORN' },
      { fact: 'A single strand of spaghetti is called ___', truth: 'A SPAGHETTO' },
    ],
    ar: [
      { fact: 'في سويسرا، يمنع قانونياً امتلاك ___', truth: 'خنزير غينيا واحد فقط (لأنه يحس بالوحدة)' },
      { fact: 'أسطول شرطة دبي للسيارات الفارهة يضم ___', truth: 'بوغاتي فيرون' },
      { fact: 'أستراليا تصدّر بانتظام ___ إلى السعودية', truth: 'الجِمال' },
      { fact: 'رواد الفضاء في الفضاء يصيرون مؤقتاً ___', truth: 'أطول بحوالي ٥ سم' },
      { fact: 'علماء الآثار لقوا ___ عمرها ٣٠٠٠ سنة في مقابر مصرية — ولا زالت صالحة للأكل', truth: 'عسل' },
      { fact: 'عشان تزيد الأمطار، الإمارات تستخدم ___', truth: 'طائرات مسيّرة لتلقيح السحب' },
      { fact: 'الأخطبوط عنده ثلاثة ___', truth: 'قلوب' },
      { fact: 'برج إيفل يزيد حوالي ١٥ سم ___ كل صيف', truth: 'طولاً (المعدن يتمدد)' },
      { fact: 'نباتياً، الموز يعتبر فعلياً ___', truth: 'نوع من التوت' },
      { fact: 'في اليابان، محطة قطار ظلت شغالة سنوات عشان تخدم ___', truth: 'طالبة وحدة فقط' },
      { fact: 'الحيوان الوطني الرسمي لاسكتلندا هو ___', truth: 'وحيد القرن الخرافي (يونيكورن)' },
      { fact: 'الخيط الواحد من السباغيتي اسمه ___', truth: 'سباغيتو' },
    ],
  },

  /* ---- WOULD YOU RATHER PERSONAL: { a, b } (target player answers) ---- */
  wyr: {
    en: [
      { a: 'Lose your phone for a month', b: 'Lose your car for a month' },
      { a: 'Only shawarma forever', b: 'Only machboos forever' },
      { a: 'Always 30 minutes late', b: 'Always 2 hours early' },
      { a: 'Know everyone’s salary', b: 'Everyone knows YOUR salary' },
      { a: 'A Gulf summer week with no AC', b: 'A Norway winter week with no jacket' },
      { a: 'Give up coffee forever', b: 'Give up karak forever' },
      { a: 'Famous on TikTok', b: 'Rich but completely anonymous' },
      { a: 'Only communicate in voice notes', b: 'Never send a voice note again' },
      { a: 'A wedding with 2,000 guests', b: 'Elope with only 10 people' },
      { a: 'Free flights forever (middle seat only)', b: 'One business-class trip per year' },
      { a: 'Live without music', b: 'Live without series & movies' },
      { a: 'Your search history goes public', b: 'Your bank statement goes public' },
    ],
    ar: [
      { a: 'تفقد جوالك شهر كامل', b: 'تفقد سيارتك شهر كامل' },
      { a: 'شاورما بس لبقية عمرك', b: 'مچبوس بس لبقية عمرك' },
      { a: 'دايماً متأخر نص ساعة', b: 'دايماً مبكر ساعتين' },
      { a: 'تعرف رواتب الكل', b: 'الكل يعرف راتبك أنت' },
      { a: 'أسبوع صيف خليجي بدون مكيف', b: 'أسبوع شتاء نرويجي بدون جاكيت' },
      { a: 'تترك القهوة للأبد', b: 'تترك الكرك للأبد' },
      { a: 'مشهور بتيك توك', b: 'غني بس محد يعرفك' },
      { a: 'تتواصل بس بالرسائل الصوتية', b: 'ما ترسل رسالة صوتية أبداً' },
      { a: 'عرس بـ٢٠٠٠ معزوم', b: 'زواج بس بـ١٠ أشخاص' },
      { a: 'طيران مجاني للأبد (بس كرسي النص)', b: 'رحلة درجة أعمال وحدة بالسنة' },
      { a: 'تعيش بدون موسيقى', b: 'تعيش بدون مسلسلات وأفلام' },
      { a: 'سجل بحثك يصير عام', b: 'كشف حسابك البنكي يصير عام' },
    ],
  },

  /* ---- THE INTERROGATION: { q } (everyone answers anonymously) ---- */
  interrogation: {
    en: [
      { q: 'What’s the most childish thing you still do?' },
      { q: 'Your go-to excuse for leaving a gathering early?' },
      { q: 'You’re invisible for one day. First thing you do?' },
      { q: 'The weirdest thing you googled recently?' },
      { q: 'Your guilty-pleasure song or artist?' },
      { q: 'If you had to marry a food, which one?' },
      { q: 'A totally useless superpower you’d still take?' },
      { q: 'The most embarrassing thing in your screenshots folder?' },
      { q: 'A job you would be absolutely terrible at?' },
      { q: 'First thing you buy with 1 million?' },
      { q: 'A habit in this friend group that secretly annoys you?' },
      { q: 'The biggest lie you told your parents as a kid?' },
    ],
    ar: [
      { q: 'شنو أكثر تصرف طفولي للحين تسويه؟' },
      { q: 'شنو عذرك الجاهز للانسحاب من القعدة بدري؟' },
      { q: 'صرت خفي ليوم واحد. أول شي بتسويه؟' },
      { q: 'أغرب شي بحثت عنه في قوقل مؤخراً؟' },
      { q: 'أغنية أو فنان تستحي تعترف إنك تسمعه؟' },
      { q: 'لو لازم تتزوج أكلة، شنو تختار؟' },
      { q: 'قوة خارقة عديمة الفايدة بس تاخذها؟' },
      { q: 'أكثر شي محرج في ملف السكرين شوت عندك؟' },
      { q: 'وظيفة بتكون فيها فاشل تماماً؟' },
      { q: 'أول شي تشتريه بمليون؟' },
      { q: 'عادة في هالشلة تزعجك بسرّية؟' },
      { q: 'أكبر كذبة كذبتها على أهلك وأنت صغير؟' },
    ],
  },

  /* ---- DISS TRACK WARS: { p } (prompt about the opponent) ---- */
  diss: {
    en: [
      { p: 'Write a fake WhatsApp status for your opponent' },
      { p: 'Your opponent’s GPS voice would say…' },
      { p: 'The title of your opponent’s autobiography' },
      { p: 'What’s REALLY in your opponent’s search history' },
      { p: 'A one-star review of your opponent' },
      { p: 'Your opponent’s honest LinkedIn headline' },
      { p: 'The warning label printed on your opponent' },
      { p: 'If your opponent was an app, its description would be…' },
      { p: 'Your opponent’s secret talent nobody asked for' },
      { p: 'The ancient prophecy about your opponent' },
      { p: 'Your opponent’s villain origin story in one line' },
      { p: 'What your opponent’s phone would say in therapy' },
    ],
    ar: [
      { p: 'اكتب حالة واتساب مزيفة لخصمك' },
      { p: '…صوت الملاحة (GPS) عند خصمك بيقول' },
      { p: 'عنوان السيرة الذاتية لخصمك' },
      { p: 'شنو فعلياً في سجل بحث خصمك' },
      { p: 'تقييم نجمة وحدة لخصمك' },
      { p: 'عنوان LinkedIn الصادق لخصمك' },
      { p: 'ملصق التحذير المطبوع على خصمك' },
      { p: '…لو خصمك تطبيق، وصفه بيكون' },
      { p: 'موهبة خصمك السرية اللي محد طلبها' },
      { p: 'النبوءة القديمة عن خصمك' },
      { p: 'قصة تحول خصمك لشرير — بسطر واحد' },
      { p: 'شنو بيقول جوال خصمك عند الطبيب النفسي' },
    ],
  },

  /* ---- MAJLIS QUIZ: { q, options[4], correct(index) } ---- */
  quiz: {
    en: [
      { q: 'Which country has the most islands in the world?', options: ['Indonesia', 'Sweden', 'Philippines', 'Greece'], correct: 1 },
      { q: 'What is the national animal of Oman?', options: ['Falcon', 'Arabian Horse', 'Arabian Oryx', 'Camel'], correct: 2 },
      { q: 'How many strings does a classic oud usually have?', options: ['6', '8', '11', '12'], correct: 2 },
      { q: 'Which planet has the most moons?', options: ['Jupiter', 'Saturn', 'Neptune', 'Mars'], correct: 1 },
      { q: 'The capital of Australia is…', options: ['Sydney', 'Melbourne', 'Canberra', 'Perth'], correct: 2 },
      { q: 'Which sea has no coastline at all?', options: ['Dead Sea', 'Sargasso Sea', 'Caspian Sea', 'Coral Sea'], correct: 1 },
      { q: 'The first Arab country to play in a FIFA World Cup?', options: ['Morocco', 'Saudi Arabia', 'Egypt', 'Tunisia'], correct: 2 },
      { q: 'Omani cuisine is famous for which dried ingredient?', options: ['Dried lime (loomi)', 'Dried figs', 'Dried mint', 'Dried mango'], correct: 0 },
      { q: 'What does “www” stand for?', options: ['World Wide Web', 'Web World Wide', 'Wide World Web', 'World Web Wire'], correct: 0 },
      { q: 'The fastest land animal is…', options: ['Gazelle', 'Cheetah', 'Greyhound', 'Ostrich'], correct: 1 },
      { q: 'Which of these is botanically a berry?', options: ['Strawberry', 'Raspberry', 'Banana', 'Blackberry'], correct: 2 },
      { q: 'The tallest building in the world is in…', options: ['Riyadh', 'Shanghai', 'Dubai', 'Kuala Lumpur'], correct: 2 },
    ],
    ar: [
      { q: 'أي دولة عندها أكبر عدد جزر في العالم؟', options: ['إندونيسيا', 'السويد', 'الفلبين', 'اليونان'], correct: 1 },
      { q: 'شنو الحيوان الوطني لسلطنة عُمان؟', options: ['الصقر', 'الحصان العربي', 'المها العربي', 'الجمل'], correct: 2 },
      { q: 'كم وتر عادةً في العود الكلاسيكي؟', options: ['٦', '٨', '١١', '١٢'], correct: 2 },
      { q: 'أي كوكب عنده أكبر عدد أقمار؟', options: ['المشتري', 'زحل', 'نبتون', 'المريخ'], correct: 1 },
      { q: '…عاصمة أستراليا هي', options: ['سيدني', 'ملبورن', 'كانبرا', 'بيرث'], correct: 2 },
      { q: 'أي بحر ما عنده أي سواحل؟', options: ['البحر الميت', 'بحر سارجاسو', 'بحر قزوين', 'البحر المرجاني'], correct: 1 },
      { q: 'أول دولة عربية تشارك في كأس العالم؟', options: ['المغرب', 'السعودية', 'مصر', 'تونس'], correct: 2 },
      { q: 'المطبخ العماني مشهور بأي مكوّن مجفف؟', options: ['اللومي (الليمون المجفف)', 'التين المجفف', 'النعناع المجفف', 'المانجو المجفف'], correct: 0 },
      { q: 'شنو معنى «www»؟', options: ['World Wide Web', 'Web World Wide', 'Wide World Web', 'World Web Wire'], correct: 0 },
      { q: '…أسرع حيوان بري هو', options: ['الغزال', 'الفهد', 'كلب السلوقي', 'النعامة'], correct: 1 },
      { q: 'أي واحد من هذي يعتبر نباتياً من التوتيات؟', options: ['الفراولة', 'التوت الأحمر', 'الموز', 'التوت الأسود'], correct: 2 },
      { q: '…أطول برج في العالم موجود في', options: ['الرياض', 'شنغهاي', 'دبي', 'كوالالمبور'], correct: 2 },
    ],
  },
};

const Content = {
  /* Async so an AI backend can be swapped in with zero changes elsewhere.
     region: 'mena' | 'weur' | 'asia' | 'africa' | null (null = universal only) */
  async get(mode, lang, count, region) {
    region = region || (window.SAHRA_STATE && window.SAHRA_STATE.region) || null;
    const cfg = window.SAHRA_CONFIG || {};
    if (cfg.aiEndpoint) {
      try {
        const res = await fetch(cfg.aiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode, lang, count, region }),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.prompts) && data.prompts.length) return data.prompts.slice(0, count);
        }
      } catch (e) { /* fall through to local packs */ }
    }

    // Guard: nothing to fetch
    if (count <= 0) return [];

    // Universal pool (always available)
    const universal = (PACKS[mode] && (PACKS[mode][lang] || PACKS[mode].en)) || [];

    // Regional pool for location-sensitive modes (quiz/bluff), if a region is set
    let regional = [];
    if (region && typeof REGION_PACKS !== 'undefined' && REGION_PACKS[region] && REGION_PACKS[region][mode]) {
      regional = REGION_PACKS[region][mode][lang] || REGION_PACKS[region][mode].en || [];
    }

    // Prefer regional first (feels local), then top up from universal so variety stays high.
    const merged = [...shuffle(regional), ...shuffle(universal)];
    // De-dupe by full content
    const seen = new Set(), out = [];
    for (const item of merged) {
      if (out.length >= count) break;
      const key = JSON.stringify(item);
      if (seen.has(key)) continue;
      seen.add(key); out.push(item);
    }
    return out.length ? out : shuffle(universal).slice(0, count);
  },
};
