/* HYPOX — regional content packs.
   The base PACKS (content.js) are the UNIVERSAL pool — they work anywhere.
   Below are region flavors for the two location-sensitive modes: quiz + bluff.
   When a region is chosen, its pool is MERGED with the universal pool so games
   feel local without losing variety. Personal modes (wyr/interrogation/diss)
   are universal by nature and take no regional packs.

   REGIONS: 'mena' | 'weur' (USA & Europe) | 'asia' | 'africa'
   The region picker also exists so the AI backend can later request
   region-matched prompts: POST { mode, lang, count, region }. */

const REGION_PACKS = {
  /* ============ MIDDLE EAST & NORTH AFRICA ============ */
  mena: {
    bluff: {
      en: [
        { fact: 'The world’s largest hand-woven carpet sits in a mosque in ___', truth: 'ABU DHABI (Sheikh Zayed Grand Mosque)' },
        { fact: 'Oman’s frankincense trade once made it as valuable as ___', truth: 'GOLD' },
        { fact: 'The Arabic coffee pot symbol on Saudi road signs is called a ___', truth: 'DALLAH' },
        { fact: 'Kuwait’s currency, the dinar, is the world’s ___', truth: 'HIGHEST-VALUED CURRENCY' },
        { fact: 'Petra in Jordan was carved by the ___', truth: 'NABATAEANS' },
        { fact: 'The traditional Gulf pearl divers were known as ___', truth: 'GHAWWAS' },
      ],
      ar: [
        { fact: 'أكبر سجادة منسوجة يدوياً بالعالم موجودة في مسجد في ___', truth: 'أبوظبي (جامع الشيخ زايد)' },
        { fact: 'تجارة اللبان في عُمان كانت تعادل قيمتها ___', truth: 'الذهب' },
        { fact: 'رمز دلة القهوة على إشارات الطرق السعودية اسمه ___', truth: 'الدلّة' },
        { fact: 'الدينار الكويتي يعتبر ___ في العالم', truth: 'أعلى عملة قيمةً' },
        { fact: 'مدينة البتراء في الأردن نحتها ___', truth: 'الأنباط' },
        { fact: 'غواصو اللؤلؤ التقليديون في الخليج كانوا يُسمّون ___', truth: 'الغوّاصة' },
      ],
    },
    quiz: {
      en: [
        { q: 'Which Gulf city hosts the Burj Khalifa?', options: ['Doha', 'Dubai', 'Riyadh', 'Manama'], correct: 1 },
        { q: 'The traditional Omani dagger is called a…', options: ['Khanjar', 'Jambiya', 'Shabriya', 'Koummya'], correct: 0 },
        { q: 'Which country is the largest by area in the Arab world?', options: ['Saudi Arabia', 'Algeria', 'Egypt', 'Sudan'], correct: 1 },
        { q: 'Karak, the beloved Gulf tea, is spiced mainly with…', options: ['Saffron', 'Cardamom', 'Cinnamon', 'Clove'], correct: 1 },
        { q: 'The ancient city of Petra is located in…', options: ['Lebanon', 'Jordan', 'Syria', 'Iraq'], correct: 1 },
        { q: 'Which sea borders Oman to the southeast?', options: ['Red Sea', 'Arabian Sea', 'Caspian Sea', 'Mediterranean'], correct: 1 },
      ],
      ar: [
        { q: 'أي مدينة خليجية فيها برج خليفة؟', options: ['الدوحة', 'دبي', 'الرياض', 'المنامة'], correct: 1 },
        { q: '…الخنجر العماني التقليدي اسمه', options: ['الخنجر', 'الجنبية', 'الشبرية', 'الكمية'], correct: 0 },
        { q: 'أي دولة هي الأكبر مساحةً في العالم العربي؟', options: ['السعودية', 'الجزائر', 'مصر', 'السودان'], correct: 1 },
        { q: '…الكرك، شاي الخليج المحبوب، يتبّل أساساً بـ', options: ['الزعفران', 'الهيل', 'القرفة', 'القرنفل'], correct: 1 },
        { q: '…مدينة البتراء الأثرية تقع في', options: ['لبنان', 'الأردن', 'سوريا', 'العراق'], correct: 1 },
        { q: 'أي بحر يحدّ عُمان من الجنوب الشرقي؟', options: ['البحر الأحمر', 'بحر العرب', 'بحر قزوين', 'المتوسط'], correct: 1 },
      ],
    },
    year: {
      en: [
        { q: 'Dubai\'s Burj Khalifa officially opened', y: 2010 },
        { q: 'Saudi Arabia allowed women to drive', y: 2018 },
        { q: 'The UAE was founded as a union of emirates', y: 1971 },
        { q: 'Qatar hosted the FIFA World Cup', y: 2022 },
        { q: 'Oman\'s Sultan Qaboos began his reign', y: 1970 },
        { q: 'The GCC (Gulf Cooperation Council) was founded', y: 1981 },
      ],
      ar: [
        { q: 'برج خليفة في دبي افتُتح رسمياً', y: 2010 },
        { q: 'السعودية سمحت للمرأة بقيادة السيارة', y: 2018 },
        { q: 'الإمارات تأسست كاتحاد إمارات', y: 1971 },
        { q: 'قطر استضافت كأس العالم لكرة القدم', y: 2022 },
        { q: 'السلطان قابوس بدأ حكمه في عُمان', y: 1970 },
        { q: 'مجلس التعاون الخليجي تأسس', y: 1981 },
      ],
    },
    flaghunt: {
      en: [
        { flag: '🇴🇲', options: ['Yemen', 'Oman', 'UAE', 'Qatar'], correct: 1 },
        { flag: '🇶🇦', options: ['Bahrain', 'UAE', 'Qatar', 'Kuwait'], correct: 2 },
        { flag: '🇧🇭', options: ['Bahrain', 'Qatar', 'Kuwait', 'Oman'], correct: 0 },
        { flag: '🇱🇧', options: ['Syria', 'Lebanon', 'Jordan', 'Iraq'], correct: 1 },
        { flag: '🇯🇴', options: ['Jordan', 'Syria', 'Lebanon', 'Palestine'], correct: 0 },
        { flag: '🇹🇳', options: ['Algeria', 'Libya', 'Tunisia', 'Morocco'], correct: 2 },
      ],
      ar: [
        { flag: '🇴🇲', options: ['اليمن', 'عُمان', 'الإمارات', 'قطر'], correct: 1 },
        { flag: '🇶🇦', options: ['البحرين', 'الإمارات', 'قطر', 'الكويت'], correct: 2 },
        { flag: '🇧🇭', options: ['البحرين', 'قطر', 'الكويت', 'عُمان'], correct: 0 },
        { flag: '🇱🇧', options: ['سوريا', 'لبنان', 'الأردن', 'العراق'], correct: 1 },
        { flag: '🇯🇴', options: ['الأردن', 'سوريا', 'لبنان', 'فلسطين'], correct: 0 },
        { flag: '🇹🇳', options: ['الجزائر', 'ليبيا', 'تونس', 'المغرب'], correct: 2 },
      ],
    },
    higherlow: {
      en: [
        { q: 'How many floors does the Burj Khalifa have?', n: 163, unit: 'floors' },
        { q: 'How many emirates make up the UAE?', n: 7, unit: 'emirates' },
        { q: 'What year did the GCC form?', n: 1981, unit: 'year' },
        { q: 'How many countries border Saudi Arabia?', n: 8, unit: 'countries' },
        { q: 'How tall is the Kingdom Tower in Jeddah, in meters?', n: 267, unit: 'meters' },
        { q: 'What year did Qatar host the World Cup?', n: 2022, unit: 'year' },
      ],
      ar: [
        { q: 'كم عدد طوابق برج خليفة؟', n: 163, unit: 'طابق' },
        { q: 'كم إمارة تتكون منها دولة الإمارات؟', n: 7, unit: 'إمارات' },
        { q: 'في أي سنة تأسس مجلس التعاون الخليجي؟', n: 1981, unit: 'سنة' },
        { q: 'كم دولة تحد السعودية؟', n: 8, unit: 'دول' },
        { q: 'كم يبلغ ارتفاع برج المملكة في جدة بالمتر؟', n: 267, unit: 'متر' },
        { q: 'في أي سنة استضافت قطر كأس العالم؟', n: 2022, unit: 'سنة' },
      ],
    },
    trueorlie: {
      en: [
        { s: 'The Burj Khalifa is the tallest building in the world', truth: true },
        { s: 'Saudi Arabia is the only G20 country with no rivers', truth: true },
        { s: 'Oman shares no land border with Saudi Arabia', truth: false },
        { s: 'Qatar has one of the highest GDP per capita in the world', truth: true },
        { s: 'The UAE has more mosques than any other country', truth: false },
        { s: 'Kuwait\'s currency is one of the highest-valued in the world', truth: true },
      ],
      ar: [
        { s: 'برج خليفة هو أطول مبنى في العالم', truth: true },
        { s: 'السعودية هي الدولة الوحيدة في مجموعة العشرين بلا أنهار', truth: true },
        { s: 'عُمان لا تشترك بحدود برية مع السعودية', truth: false },
        { s: 'قطر من أعلى دول العالم في نصيب الفرد من الناتج المحلي', truth: true },
        { s: 'الإمارات فيها أكثر عدد مساجد من أي دولة أخرى', truth: false },
        { s: 'الدينار الكويتي من أعلى العملات قيمة في العالم', truth: true },
      ],
    },
  },

  /* ============ USA & EUROPE ============ */
  weur: {
    bluff: {
      en: [
        { fact: 'The Statue of Liberty was a gift to the USA from ___', truth: 'FRANCE' },
        { fact: 'Big Ben is actually the name of the ___, not the tower', truth: 'BELL' },
        { fact: 'The average American eats about ___ pizzas a year', truth: '46 SLICES (~3 WHOLE PIES)' },
        { fact: 'The Eiffel Tower was originally meant to be ___', truth: 'TEMPORARY (torn down after 20 years)' },
        { fact: 'The White House has its own ___', truth: 'BOWLING ALLEY' },
        { fact: 'Venice, Italy is built on more than ___ islands', truth: '100 SMALL ISLANDS' },
      ],
      ar: [
        { fact: 'تمثال الحرية كان هدية لأمريكا من ___', truth: 'فرنسا' },
        { fact: '«بيغ بن» هو فعلياً اسم الـ ___، مو البرج', truth: 'الجرس' },
        { fact: 'الأمريكي المتوسط ياكل حوالي ___ بيتزا في السنة', truth: '٤٦ قطعة (٣ بيتزا كاملة)' },
        { fact: 'برج إيفل كان أصلاً مفروض يكون ___', truth: 'مؤقت (يُهدم بعد ٢٠ سنة)' },
        { fact: 'البيت الأبيض عنده ___ خاص فيه', truth: 'صالة بولينغ' },
        { fact: 'مدينة البندقية في إيطاليا مبنية على أكثر من ___', truth: '١٠٠ جزيرة صغيرة' },
      ],
    },
    quiz: {
      en: [
        { q: 'Which US city is nicknamed "The Big Apple"?', options: ['Chicago', 'New York', 'Boston', 'Los Angeles'], correct: 1 },
        { q: 'The Colosseum is located in which city?', options: ['Athens', 'Rome', 'Madrid', 'Lisbon'], correct: 1 },
        { q: 'How many US states are there?', options: ['48', '50', '52', '51'], correct: 1 },
        { q: 'Which country is home to Oktoberfest?', options: ['Austria', 'Germany', 'Belgium', 'Netherlands'], correct: 1 },
        { q: 'The currency used in most of the EU is the…', options: ['Pound', 'Franc', 'Euro', 'Mark'], correct: 2 },
        { q: 'Mount Rushmore features how many presidents?', options: ['3', '4', '5', '6'], correct: 1 },
      ],
      ar: [
        { q: 'أي مدينة أمريكية تُلقّب بـ«التفاحة الكبيرة»؟', options: ['شيكاغو', 'نيويورك', 'بوسطن', 'لوس أنجلوس'], correct: 1 },
        { q: 'الكولوسيوم موجود في أي مدينة؟', options: ['أثينا', 'روما', 'مدريد', 'لشبونة'], correct: 1 },
        { q: 'كم عدد الولايات الأمريكية؟', options: ['٤٨', '٥٠', '٥٢', '٥١'], correct: 1 },
        { q: 'أي دولة موطن مهرجان أكتوبر (أوكتوبرفست)؟', options: ['النمسا', 'ألمانيا', 'بلجيكا', 'هولندا'], correct: 1 },
        { q: '…العملة المستخدمة في معظم الاتحاد الأوروبي هي', options: ['الجنيه', 'الفرنك', 'اليورو', 'المارك'], correct: 2 },
        { q: 'نصب راشمور يضم وجوه كم رئيس؟', options: ['٣', '٤', '٥', '٦'], correct: 1 },
      ],
    },
  },

  /* ============ ASIA ============ */
  asia: {
    bluff: {
      en: [
        { fact: 'In Japan, there are more ___ than people in some towns', truth: 'VENDING MACHINES' },
        { fact: 'The world’s largest religious monument, Angkor Wat, is in ___', truth: 'CAMBODIA' },
        { fact: 'India has the world’s largest ___', truth: 'POSTAL NETWORK' },
        { fact: 'South Korea has the world’s fastest average ___', truth: 'INTERNET SPEED (historically)' },
        { fact: 'The Great Wall of China is roughly ___ long', truth: '21,000 KM' },
        { fact: 'Singapore is famous for banning the sale of ___', truth: 'CHEWING GUM' },
      ],
      ar: [
        { fact: 'في اليابان، بعض المدن فيها ___ أكثر من عدد سكانها', truth: 'آلات البيع الذاتي' },
        { fact: 'أكبر نصب ديني في العالم، أنغكور وات، موجود في ___', truth: 'كمبوديا' },
        { fact: 'الهند عندها أكبر ___ في العالم', truth: 'شبكة بريد' },
        { fact: 'كوريا الجنوبية عندها أسرع ___ في العالم', truth: 'متوسط سرعة إنترنت (تاريخياً)' },
        { fact: 'سور الصين العظيم طوله تقريباً ___', truth: '٢١٬٠٠٠ كم' },
        { fact: 'سنغافورة مشهورة بمنع بيع ___', truth: 'العلكة' },
      ],
    },
    quiz: {
      en: [
        { q: 'Which country has the largest population in Asia?', options: ['India', 'China', 'Indonesia', 'Japan'], correct: 0 },
        { q: 'Mount Fuji is located in…', options: ['China', 'Japan', 'South Korea', 'Vietnam'], correct: 1 },
        { q: 'The Taj Mahal is in which city?', options: ['Delhi', 'Agra', 'Jaipur', 'Mumbai'], correct: 1 },
        { q: 'Which is the currency of Thailand?', options: ['Ringgit', 'Baht', 'Rupiah', 'Dong'], correct: 1 },
        { q: 'The city-state known as the "Lion City" is…', options: ['Hong Kong', 'Singapore', 'Bangkok', 'Kuala Lumpur'], correct: 1 },
        { q: 'Which country is both in Asia and Europe by geography?', options: ['Iran', 'Turkey', 'Pakistan', 'Georgia'], correct: 1 },
      ],
      ar: [
        { q: 'أي دولة عندها أكبر عدد سكان في آسيا؟', options: ['الهند', 'الصين', 'إندونيسيا', 'اليابان'], correct: 0 },
        { q: '…جبل فوجي موجود في', options: ['الصين', 'اليابان', 'كوريا الجنوبية', 'فيتنام'], correct: 1 },
        { q: 'تاج محل في أي مدينة؟', options: ['دلهي', 'أغرا', 'جايبور', 'مومباي'], correct: 1 },
        { q: 'شنو عملة تايلاند؟', options: ['الرينغيت', 'الباهت', 'الروبية', 'الدونغ'], correct: 1 },
        { q: '…الدولة-المدينة المعروفة بـ«مدينة الأسد» هي', options: ['هونغ كونغ', 'سنغافورة', 'بانكوك', 'كوالالمبور'], correct: 1 },
        { q: 'أي دولة تقع جغرافياً في آسيا وأوروبا معاً؟', options: ['إيران', 'تركيا', 'باكستان', 'جورجيا'], correct: 1 },
      ],
    },
  },

  /* ============ AFRICA ============ */
  africa: {
    bluff: {
      en: [
        { fact: 'The longest river in the world, the Nile, flows through ___ countries', truth: '11 COUNTRIES' },
        { fact: 'Morocco is home to the world’s oldest still-operating ___', truth: 'UNIVERSITY (Al-Qarawiyyin)' },
        { fact: 'The Sahara Desert is roughly the size of ___', truth: 'THE UNITED STATES' },
        { fact: 'Ethiopia follows a calendar that is about ___ behind the West', truth: '7-8 YEARS' },
        { fact: 'Madagascar is home to animals found ___', truth: 'NOWHERE ELSE ON EARTH (lemurs)' },
        { fact: 'The pyramids of Sudan actually outnumber those in ___', truth: 'EGYPT' },
      ],
      ar: [
        { fact: 'أطول نهر بالعالم، النيل، يمر عبر ___ دولة', truth: '١١ دولة' },
        { fact: 'المغرب فيها أقدم ___ لا تزال تعمل في العالم', truth: 'جامعة (القرويين)' },
        { fact: 'الصحراء الكبرى تقريباً بحجم ___', truth: 'الولايات المتحدة' },
        { fact: 'إثيوبيا تتبع تقويماً متأخراً عن الغرب بحوالي ___', truth: '٧-٨ سنوات' },
        { fact: 'مدغشقر موطن حيوانات ما توجد ___', truth: 'في أي مكان آخر بالأرض (الليمور)' },
        { fact: 'أهرامات السودان فعلياً أكثر عدداً من أهرامات ___', truth: 'مصر' },
      ],
    },
    quiz: {
      en: [
        { q: 'What is the largest country in Africa by area?', options: ['Sudan', 'Algeria', 'Egypt', 'DR Congo'], correct: 1 },
        { q: 'Mount Kilimanjaro is located in…', options: ['Kenya', 'Tanzania', 'Uganda', 'Ethiopia'], correct: 1 },
        { q: 'Which river is the longest in Africa?', options: ['Congo', 'Niger', 'Nile', 'Zambezi'], correct: 2 },
        { q: 'The ancient pyramids of Giza are in…', options: ['Sudan', 'Egypt', 'Libya', 'Morocco'], correct: 1 },
        { q: 'Which country was never fully colonized?', options: ['Ghana', 'Ethiopia', 'Kenya', 'Nigeria'], correct: 1 },
        { q: 'Cape Town is a major city in…', options: ['Namibia', 'South Africa', 'Botswana', 'Angola'], correct: 1 },
      ],
      ar: [
        { q: 'شنو أكبر دولة في أفريقيا مساحةً؟', options: ['السودان', 'الجزائر', 'مصر', 'الكونغو الديمقراطية'], correct: 1 },
        { q: '…جبل كليمنجارو موجود في', options: ['كينيا', 'تنزانيا', 'أوغندا', 'إثيوبيا'], correct: 1 },
        { q: 'أي نهر هو الأطول في أفريقيا؟', options: ['الكونغو', 'النيجر', 'النيل', 'الزمبيزي'], correct: 2 },
        { q: '…أهرامات الجيزة القديمة موجودة في', options: ['السودان', 'مصر', 'ليبيا', 'المغرب'], correct: 1 },
        { q: 'أي دولة لم تُستعمَر بالكامل أبداً؟', options: ['غانا', 'إثيوبيا', 'كينيا', 'نيجيريا'], correct: 1 },
        { q: '…كيب تاون مدينة رئيسية في', options: ['ناميبيا', 'جنوب أفريقيا', 'بوتسوانا', 'أنغولا'], correct: 1 },
      ],
    },
  },
};
