/* HYPOX — main.js v5 */
(() => {
  const AVATARS_LIST = [
    {emoji:'🦊',color:'#f472b6',label:'Fox'},{emoji:'🐼',color:'#60a5fa',label:'Panda'},
    {emoji:'🐸',color:'#34d399',label:'Frog'},{emoji:'🦄',color:'#a78bfa',label:'Unicorn'},
    {emoji:'🤖',color:'#fb923c',label:'Robot'},{emoji:'🐫',color:'#facc15',label:'Camel'},
    {emoji:'🦅',color:'#38bdf8',label:'Eagle'},{emoji:'🐙',color:'#f87171',label:'Octopus'},
    {emoji:'🦁',color:'#fbbf24',label:'Lion'},{emoji:'🐢',color:'#4ade80',label:'Turtle'},
    {emoji:'🦋',color:'#c084fc',label:'Butterfly'},{emoji:'🐬',color:'#22d3ee',label:'Dolphin'},
    {emoji:'🐺',color:'#94a3b8',label:'Wolf'},{emoji:'🐯',color:'#f59e0b',label:'Tiger'},
    {emoji:'🦈',color:'#0ea5e9',label:'Shark'},
  ];
  const MODE_MIN = {bluff:3,wyr:3,interrogation:3,diss:4,trivia:2,pinpoint:2,emoji:2,year:2,mostlikely:3,trueorlie:2,flaghunt:2,higherlow:2,'2t1l':3,emojiplace:2,spy:3};
  const MODE_ICONS = {bluff:'🔍',wyr:'⚖️',interrogation:'🔦',diss:'🎤',trivia:'⚡',pinpoint:'📍',emoji:'🧩',year:'⏳',mostlikely:'🏆',trueorlie:'✅',flaghunt:'🚩',higherlow:'📊','2t1l':'🤥',emojiplace:'🌍',spy:'🕵️'};
  const MODE_COLORS = {bluff:'#f472b6',wyr:'#60a5fa',interrogation:'#a78bfa',diss:'#fb923c',trivia:'#facc15',pinpoint:'#22d3ee',emoji:'#e879f9',year:'#fbbf24',mostlikely:'#f43f5e',trueorlie:'#10b981',flaghunt:'#ef4444',higherlow:'#8b5cf6','2t1l':'#f97316',emojiplace:'#06b6d4',spy:'#64748b'};
  const CAT_INFO = [
    {id:'general',icon:'🎲',name:'General Mix',nameAr:'خلطة عامة'},
    {id:'geography',icon:'🌍',name:'Geography',nameAr:'جغرافيا'},
    {id:'science',icon:'🔬',name:'Science',nameAr:'علوم'},
    {id:'gulf',icon:'🕌',name:'Gulf & Arab',nameAr:'خليج وعرب'},
    {id:'pop',icon:'🎬',name:'Pop Culture',nameAr:'ثقافة شعبية'},
    {id:'sports',icon:'⚽',name:'Sports',nameAr:'رياضة'},
  ];

  window.HYPOX_STATE = window.HYPOX_STATE || {region:null,rounds:5,category:'general',flavor:'global',autoplay:false};
  let net=null, players=[], myPid=null, isVip=false, hostMode='tv';
  let selectedAvatar=AVATARS_LIST[0];
  let _ppDismiss=null, _avatarCallback=null, _avatarContext=null;
  let gameActive=false, currentRoomCode=null;

  const show=id=>{$$('.screen').forEach(s=>s.classList.remove('active'));$(id).classList.add('active');};
  const $=s=>document.querySelector(s);
  const $$=s=>Array.from(document.querySelectorAll(s));
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.esc=esc;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));

  // Translation helper for inline strings
  const T = {
    rounds: ()=>LANG==='ar'?'الجولات':'ROUNDS',
    content: ()=>LANG==='ar'?'المحتوى':'CONTENT',
    category: ()=>LANG==='ar'?'الفئة':'CATEGORY',
    arabFlavor: ()=>LANG==='ar'?'🕌 طابع عربي':'🕌 Arab Flavor',
    globalMix: ()=>LANG==='ar'?'🌍 خلطة عالمية':'🌍 Global Mix',
    howPlay: ()=>LANG==='ar'?'كيف بتلعبون؟':'HOW ARE YOU PLAYING?',
    tvPhones: ()=>LANG==='ar'?'شاشة + جوالات':'TV + Phones',
    tvSub: ()=>LANG==='ar'?'الشاشة تعرض · الجوالات تتحكم':'Big screen hosts · phones control',
    phonesOnly: ()=>LANG==='ar'?'جوالات فقط':'Phones Only',
    phonesSub: ()=>LANG==='ar'?'بدون شاشة · كل واحد على جواله':'No TV · everyone on their phone',
    oneDevice: ()=>LANG==='ar'?'جهاز واحد':'One Device',
    oneSub: ()=>LANG==='ar'?'مرّر الجوال · بدون إنترنت':'Pass the phone · no internet',
    tapGame: ()=>LANG==='ar'?'اضغط على لعبة للبدء':'TAP A GAME TO START',
    joinGame: ()=>LANG==='ar'?'انضم للعبة':'JOIN A GAME',
    waitPlayers: ()=>LANG==='ar'?'انتظار اللاعبين…':'WAITING FOR PLAYERS…',
    addPlayer: ()=>LANG==='ar'?'+ أضف لاعب':'+ Add Player',
    startGame: ()=>LANG==='ar'?'ابدأ اللعبة':'START GAME',
    pickAvatar: ()=>LANG==='ar'?'اختر أفاتار':'PICK YOUR AVATAR',
    yourName: ()=>LANG==='ar'?'اسمك':'Your name',
    letsGo: ()=>LANG==='ar'?'يلا →':'Let\'s Go →',
    back: ()=>LANG==='ar'?'← رجوع':'← Back',
    roomCode: ()=>LANG==='ar'?'الغرفة':'ROOM',
    minPlayers: n=>LANG==='ar'?`${n}+ لاعبين`:`${n}+ players`,
    next: ()=>LANG==='ar'?'التالي →':'NEXT →',
    copyLink: ()=>LANG==='ar'?'📋 انسخ الرابط':'📋 Copy Link',
    copied: ()=>LANG==='ar'?'✓ تم النسخ!':'✓ Copied!',
    qrCode: ()=>LANG==='ar'?'📱 رمز QR':'📱 QR Code',
    resume: ()=>LANG==='ar'?'▶ استمر في اللعبة':'▶ Resume Game',
    leave: ()=>LANG==='ar'?'✕ اغادر اللعبة':'✕ Leave Game',
    cancel: ()=>LANG==='ar'?'إلغاء':'Cancel',
    menu: ()=>LANG==='ar'?'قائمة':'MENU',
    connecting: ()=>LANG==='ar'?'جاري الاتصال…':'Connecting…',
    connFail: ()=>LANG==='ar'?'تعذر الاتصال. تحقق من رمز الغرفة.':'Could not connect. Check room code.',
    noFirebase: ()=>LANG==='ar'?'الوضع الأونلاين يحتاج إعداد. استخدم جهاز واحد.':'Online mode needs setup. Use One Device.',
    watchScreen: ()=>LANG==='ar'?'تابع الشاشة الرئيسية!':'Watch the main screen!',
    youreIn: ()=>LANG==='ar'?'دخلت! تابع الشاشة.':'You\'re in! Watch the main screen.',
    youreHost: ()=>LANG==='ar'?'أنت المضيف 👑':'You\'re the host 👑',
    passto: ()=>LANG==='ar'?'مرّر الجوال إلى':'PASS TO',
    tapReady: ()=>LANG==='ar'?'اضغط إذا جاهز':'TAP WHEN READY',
    winner: ()=>LANG==='ar'?'بطل الليلة!':'Champion of the night!',
    nextGame: ()=>LANG==='ar'?'اللعبة التالية؟':'NEXT GAME?',
    backLobby: ()=>LANG==='ar'?'← رجوع للصالة':'← Back to Lobby',
    needPlayers: ()=>LANG==='ar'?'تحتاج لاعبين أكثر':'Need more players',
    need2: ()=>LANG==='ar'?'تحتاج لاعبين على الأقل':'Need at least 2 players',
    need3: ()=>LANG==='ar'?'بعض الألعاب تحتاج ٣+ لاعبين':'Some games need 3+ players',
    skip: ()=>LANG==='ar'?'تخطَّ ◂':'Skip ▸',
  };

  let booted=false;
  document.addEventListener('DOMContentLoaded',()=>{
    if(booted)return;booted=true;
    // Expose show() globally for host.js to use
    window.__hypoxShowScreen = show;
    applyTheme();
    applyLang();
    FX.init();
    $('#roundPill').style.visibility='hidden';
    buildTitleScreen();
    setTimeout(()=>FX.burst(70),650); // welcome confetti on landing

    $('#soundBtn').addEventListener('click',e=>{const on=Audio_.toggle();e.target.textContent=on?'🔊':'🔇';});
    $('#themeBtn').addEventListener('click',()=>{setTheme(THEME==='dark'?'light':'dark');$('#themeBtn').textContent=THEME==='dark'?'🌙':'☀️';});
    $('#themeBtn').textContent=THEME==='dark'?'🌙':'☀️';
    $('#langBtn').addEventListener('click',()=>{
      setLang(LANG==='en'?'ar':'en');
      $('#langBtn').textContent=LANG==='en'?'عر':'EN';
      // If no room/game is active, a reload repaints EVERY screen instantly (lang is saved)
      if(!currentRoomCode && !gameActive){ location.reload(); return; }
      buildTitleScreen(); // in-game: rebuild what we safely can
    });
    $('#langBtn').textContent=LANG==='en'?'عر':'EN';
    // Skip is handled by #menuSkip inside the menu overlay
    $('#menuBtn').addEventListener('click',openMenu);
    $('#menuBtn').classList.remove('hidden'); // always visible from start
    $('#menuClose').addEventListener('click',closeMenu);
    $('#menuResume').addEventListener('click',closeMenu);
    $('#menuSkip').addEventListener('click',()=>{closeMenu();if(window.__hypoxSkip){window.__hypoxSkip();window.__hypoxSkip=null;}});
    $('#menuLeave').addEventListener('click',()=>{closeMenu();if(gameActive){leaveGame();}else{show('#scr-title');}});

    // Join screen — build mini avatar picker
    buildJoinAvatarRow();
    $('#joinGo').addEventListener('click',joinAsPlayer);
    $('#joinCode').addEventListener('keydown',e=>{if(e.key==='Enter')$('#joinName').focus();});
    $('#joinName').addEventListener('keydown',e=>{if(e.key==='Enter')joinAsPlayer();});

    // Avatar
    buildAvatarGrid();
    $('#avatarDone').addEventListener('click',confirmAvatar);
    $('#avatarName').addEventListener('keydown',e=>{if(e.key==='Enter')confirmAvatar();});

    // Lobby
    $('#addLocalBtn').addEventListener('click',()=>{
      if(!net||!net.isOffline){console.warn('Not in offline mode');return;}
      showAvatarPicker('offline');
    });

    // URL auto-join
    const urlParams=new URLSearchParams(window.location.search);
    const urlCode=urlParams.get('room');
    if(urlCode){$('#joinCode').value=urlCode.toUpperCase();show('#scr-join');}
  });

  function applyTheme(){
    document.body.classList.toggle('theme-dark',THEME==='dark');
    document.body.classList.toggle('theme-light',THEME==='light');
  }

  /* ---- TITLE SCREEN ---- */
  function buildTitleScreen(){
    const grid=$('#titleGameGrid');
    if(!grid)return;
    const modes=Object.keys(MODE_ICONS);
    const modeNamesObj=t('mode_names')||{};
    const modeTagsObj=t('mode_taglines')||{};
    grid.innerHTML=modes.map((m,i)=>`
      <button class="title-game-card" data-mode="${m}" style="animation-delay:${i*.07}s;--mc:${MODE_COLORS[m]}">
        <div class="tgc-art">${MODE_ICONS[m]}</div>
        <div class="tgc-name display">${esc(modeNamesObj[m]||m)}</div>
        <div class="tgc-tag">${esc(modeTagsObj[m]||'')}</div>
        <div class="tgc-min">👥 ${T.minPlayers(MODE_MIN[m])}</div>
      </button>`).join('');

    // Hero text (translated)
    const hh=$('#heroHeadline'), hs=$('#heroSub');
    if(hh)hh.textContent=LANG==='ar'?'السهرة تبدأ من هنا':'The Party Starts Here';
    if(hs)hs.textContent=LANG==='ar'?'ألعاب أصحابك بيتهاوشون عليها. بدون تطبيقات وبدون تحميل — بس جوالات وفوضى.':'Games your friends will actually fight over. No apps, no downloads — just phones and chaos.';

    const tapLabel=$('#tapLabel');
    if(tapLabel)tapLabel.textContent=LANG==='ar'?'اختر لعبتك':'PICK YOUR GAME';
    const joinBtn=$('#joinBtn');
    if(joinBtn){joinBtn.textContent=T.joinGame();joinBtn.onclick=()=>{Audio_.sfx.blip();show('#scr-join');paintJoin();};}
    const hstart=$('#heroStart');
    if(hstart){hstart.textContent=LANG==='ar'?'▶ ابدأ لعبة':'START A GAME ▶';hstart.onclick=()=>{Audio_.sfx.pop();$('#roundPill').textContent=LANG==='ar'?'اختر لعبة':'PICK A GAME';show('#scr-games');};}
    const hstart2=$('#heroStart2');
    if(hstart2){hstart2.textContent=LANG==='ar'?'▶ ابدأ لعبة':'START A GAME ▶';hstart2.onclick=()=>{Audio_.sfx.pop();$('#roundPill').textContent=LANG==='ar'?'اختر لعبة':'PICK A GAME';show('#scr-games');};}
    const LS={howTitle:['HOW IT WORKS','كيف تلعب؟'],how1:['📺 TV + Phones','📺 شاشة + جوالات'],how1d:['Host opens on laptop or TV, shares screen. Everyone joins by QR or link. Phones = controllers, TV = the show.','افتح على اللابتوب أو التلفاز وشارك الشاشة. الكل يدخل عن طريق QR أو رابط. الجوالات للإجابة، التلفاز للعرض.'],how2:['📱 Phones Only','📱 جوالات فقط'],how2d:['No TV? No problem. Everyone plays on their own phone. Share the room code and you are in.','ما في تلفاز؟ لا مشكلة. الكل يلعب من جواله. شارك الكود وابدأ.'],how3:['🤝 One Device','🤝 جهاز واحد'],how3d:['Pass one phone around the table. No internet needed. Perfect for road trips or anywhere.','مرّر جوال واحد على الجميع. بدون إنترنت. مثالية في الرحلات وأي مكان.'],previewTitle:['THE GAMES. INFINITE CHAOS.','الألعاب. فوضى لا تنتهي.'],prev1:['LIE DETECTOR','كاشف الكذب'],prev1d:['Spot the lie. Fool your friends.','اكتشف الكذبة. اخدع ربعك.'],prev2:['WOULD YOU RATHER','يا هذا يا هذا'],prev2d:['How well do you know them?','شكثر تعرفهم صح؟'],prev3:['ROAST BATTLE','حرب القصايد'],prev3d:['One-liner battle. Crowd decides.','مواجهة بسطر واحد. الجمهور يحكم.'],prev4:['PIN POINT','حدد المكان'],prev4d:['Drop your pin. Closest wins.','حط دبوسك. الأقرب يفوز.'],prev5:['EMOJI RIDDLE','فزورة الإيموجي'],prev5d:['Decode the emojis. Beat the clock.','فك رموز الإيموجي قبل غيرك.'],prev6:['TIME MACHINE','آلة الزمن'],prev6d:['Guess the year. Closest wins.','خمّن السنة. الأقرب يفوز.'],proofTitle:['WHAT PEOPLE SAY','شو يقولون عنا؟'],proof1:['"We played for 3 hours straight. Nobody wanted to stop."','"لعبنا ٣ ساعات متواصلة. ما أحد أبى يوقف."'],proof2:['"Finally a party game that actually works in Arabic. The Gulf humor is spot on."','"أخيراً لعبة سهرة تشتغل بالعربي. الروح الخليجية موجودة."'],proof3:['"No app, no login, no drama. Just scan and play."','"بدون تطبيق، بدون تسجيل. بس امسح والعب."'],finalTitle:['READY TO START?','جاهز تبدأ؟']};
    Object.entries(LS).forEach(([id,[en,ar]])=>{const el=document.getElementById(id);if(el)el.textContent=LANG==='ar'?ar:en;});
    const tp=document.querySelectorAll('.trust-pill');
    const tpArr=LANG==='ar'?['📱 بدون تحميل','⚡ ابدأ في ثواني','👥 ٢-٢٠ لاعب','🌍 عربي وإنجليزي']:['📱 No downloads','⚡ Start in seconds','👥 2-20 players','🌍 Arabic & English'];
    tp.forEach((el,i)=>{if(tpArr[i])el.textContent=tpArr[i];});
    const bfg=$('#backFromGames');
    if(bfg){bfg.textContent=LANG==='ar'?'→ رجوع':'← Back';bfg.onclick=()=>{Audio_.sfx.blip();show('#scr-title');};}

    $$('.title-game-card').forEach(card=>card.addEventListener('click',()=>{
      Audio_.sfx.pop();Audio_.unlock();
      const m=card.dataset.mode;
      // Kick off content preload immediately so it's ready by the time user hits START
      if(window.Content) Content.get(m,LANG,window.HYPOX_STATE?.rounds||5).catch(()=>{});
      showPregame(m);
    }));
  }

  function paintJoin(){
    $('#backFromJoin').textContent=T.back();
    $('#backFromJoin').onclick=()=>{Audio_.sfx.blip();show('#scr-title');};
    $('#joinCode').placeholder=LANG==='ar'?'رمز الغرفة':'Room code';
    $('#joinName').placeholder=T.yourName();
    $('#joinGo').textContent=LANG==='ar'?'دخول →':'Join →';
  }

  /* ---- PREGAME: single page, no scroll ---- */
  function showPregame(mode){
    show('#scr-pregame');
    const isTrivia=mode==='trivia'||mode==='quiz';
    const modeNamesObj=t('mode_names')||{};
    const modeTagsObj=t('mode_taglines')||{};
    const modeRulesObj=t('mode_rules')||{};
    const modeName=modeNamesObj[mode]||mode;
    const modeColor=MODE_COLORS[mode]||'var(--pink)';

    $('#pregameInner').innerHTML=`
      <div class="pg-header">
        <div class="pg-icon">${MODE_ICONS[mode]}</div>
        <div>
          <div class="pg-title display" style="color:${modeColor}">${esc(modeName)}</div>
          <div class="pg-tag">${esc(modeTagsObj[mode]||'')}</div>
        </div>
      </div>

      <div class="pg-row">
        ${mode!=='spy'?`<div class="pg-block">
          <div class="pg-label">${T.rounds()}</div>
          <div class="round-btns">
            ${[5,10,15].map(n=>`<button class="round-btn${window.HYPOX_STATE.rounds===n?' selected':''}" data-r="${n}">${n}</button>`).join('')}
          </div>
        </div>`:''}
        <div class="pg-block">
          <div class="pg-label">${T.content()}</div>
          <div class="content-btns">
            <button class="content-btn${window.HYPOX_STATE.flavor==='arab'?' selected':''}" data-flavor="arab">${T.arabFlavor()}</button>
            <button class="content-btn${window.HYPOX_STATE.flavor!=='arab'?' selected':''}" data-flavor="global">${T.globalMix()}</button>
          </div>
        </div>
        <div class="pg-block full">
          <div class="pg-label">${LANG==='ar'?'وتيرة اللعب':'GAME PACING'}</div>
          <div class="content-btns">
            <button class="content-btn pace-btn${!window.HYPOX_STATE.autoplay?' selected':''}" data-pace="manual">✋ ${LANG==='ar'?'أنا أتحكم (زر التالي)':'I control (Next button)'}</button>
            <button class="content-btn pace-btn${window.HYPOX_STATE.autoplay?' selected':''}" data-pace="auto">⏩ ${LANG==='ar'?'تلقائي (يكمل لحاله)':'Autoplay (advances itself)'}</button>
          </div>
        </div>
      </div>

      ${mode==='spy'?`
      <div class="pg-block full">
        <div class="pg-label">${LANG==='ar'?'عدد الجواسيس':'NUMBER OF SPIES'}</div>
        <div class="round-btns">${[1,2,3].map(n=>`<button class="round-btn${(window.HYPOX_STATE.spyCount||1)===n?' selected':''}" data-spy="${n}">${n}</button>`).join('')}</div>
      </div>
      <div class="pg-block full">
        <div class="pg-label">${LANG==='ar'?'نوع الكلمة السرية':'SECRET WORD CATEGORY'}</div>
        <div class="content-btns">
          <button class="content-btn spy-cat${(window.HYPOX_STATE.spyCategory||'location')==='location'?' selected':''}" data-spycat="location">📍 ${LANG==='ar'?'مكان':'Location'}</button>
          <button class="content-btn spy-cat${(window.HYPOX_STATE.spyCategory||'location')==='event'?' selected':''}" data-spycat="event">🎉 ${LANG==='ar'?'حدث':'Event'}</button>
          <button class="content-btn spy-cat${(window.HYPOX_STATE.spyCategory||'location')==='movie'?' selected':''}" data-spycat="movie">🎬 ${LANG==='ar'?'فيلم':'Movie'}</button>
          <button class="content-btn spy-cat${(window.HYPOX_STATE.spyCategory||'location')==='food'?' selected':''}" data-spycat="food">🍕 ${LANG==='ar'?'أكل':'Food'}</button>
          <button class="content-btn spy-cat${(window.HYPOX_STATE.spyCategory||'location')==='sport'?' selected':''}" data-spycat="sport">⚽ ${LANG==='ar'?'رياضة':'Sport'}</button>
          <button class="content-btn spy-cat${(window.HYPOX_STATE.spyCategory||'location')==='animal'?' selected':''}" data-spycat="animal">🦁 ${LANG==='ar'?'حيوان':'Animal'}</button>
          <button class="content-btn spy-cat${(window.HYPOX_STATE.spyCategory||'location')==='celebrity'?' selected':''}" data-spycat="celebrity">⭐ ${LANG==='ar'?'مشهور':'Celebrity'}</button>
        </div>
      </div>`:''}
      ${isTrivia?`
      <div class="pg-block full">
        <div class="pg-label">${T.category()}</div>
        <div class="cat-grid-small">
          ${CAT_INFO.map((c,i)=>`
            <button class="cat-card-sm${window.HYPOX_STATE.category===c.id?' selected':''}" data-cat="${c.id}" style="animation-delay:${i*.05}s">
              <div class="cat-icon-sm">${c.icon}</div>
              <div class="cat-name-sm">${LANG==='ar'?c.nameAr:c.name}</div>
            </button>`).join('')}
        </div>
      </div>`:''}

      <div class="pg-block full">
        <div class="pg-label">${T.howPlay()}</div>
        <div class="pg-play-modes">
          <button class="pmm-btn play-mode-btn" id="pgHostBtn">
            <span class="pmm-icon">📺</span>
            <div><div class="pmm-name">${T.tvPhones()}</div><div class="pmm-sub">${T.tvSub()}</div></div>
          </button>
          <button class="pmm-btn play-mode-btn" id="pgPhonesBtn">
            <span class="pmm-icon">📱</span>
            <div><div class="pmm-name">${T.phonesOnly()}</div><div class="pmm-sub">${T.phonesSub()}</div></div>
          </button>
          <button class="pmm-btn play-mode-btn" id="pgOfflineBtn">
            <span class="pmm-icon">🤝</span>
            <div><div class="pmm-name">${T.oneDevice()}</div><div class="pmm-sub">${T.oneSub()}</div></div>
          </button>
        </div>
      </div>`;

    // Round buttons (each group independent)
    $$('[data-r]').forEach(btn=>btn.addEventListener('click',()=>{
      $$('[data-r]').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');window.HYPOX_STATE.rounds=+btn.dataset.r;Audio_.sfx.blip();
    }));
    // Flavor buttons (Arab/Global)
    $$('[data-flavor]').forEach(btn=>btn.addEventListener('click',()=>{
      $$('[data-flavor]').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');window.HYPOX_STATE.flavor=btn.dataset.flavor;Audio_.sfx.blip();
    }));
    // Pace buttons
    $$('[data-pace]').forEach(btn=>btn.addEventListener('click',()=>{
      $$('[data-pace]').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');window.HYPOX_STATE.autoplay=btn.dataset.pace==='auto';Audio_.sfx.blip();
    }));
    // Trivia category
    if(isTrivia){
      $$('.cat-card-sm').forEach(btn=>btn.addEventListener('click',()=>{
        $$('.cat-card-sm').forEach(b=>b.classList.remove('selected'));
        btn.classList.add('selected');window.HYPOX_STATE.category=btn.dataset.cat;Audio_.sfx.blip();
      }));
    }
    // Spy count
    document.querySelectorAll('[data-spy]').forEach(btn=>btn.addEventListener('click',()=>{
      window.HYPOX_STATE.spyCount=+btn.dataset.spy;
      document.querySelectorAll('[data-spy]').forEach(b=>b.classList.toggle('selected',b===btn));
      Audio_.sfx.blip();
    }));
    // Spy category - independent of flavor
    document.querySelectorAll('[data-spycat]').forEach(btn=>btn.addEventListener('click',()=>{
      window.HYPOX_STATE.spyCategory=btn.dataset.spycat;
      document.querySelectorAll('[data-spycat]').forEach(b=>b.classList.toggle('selected',b===btn));
      Audio_.sfx.blip();
    }));
    // Play mode buttons now just SET the mode, show a START button
    let selectedPlayMode = null;
    function selectPlayMode(playMode){
      selectedPlayMode=playMode;
      $$('.play-mode-btn').forEach(b=>{
        b.classList.remove('selected');
        b.style.borderColor='';b.style.color='';b.style.background='';
      });
      const btn=document.getElementById('pg'+({tv:'Host',phones:'Phones',offline:'Offline'}[playMode])+'Btn');
      if(btn){
        btn.classList.add('selected');
        btn.style.borderColor='var(--yellow)';
        btn.style.color='var(--yellow)';
        btn.style.background='rgba(251,191,36,0.12)';
      }
      // Show start button
      let startBtn=document.getElementById('pgStartBtn');
      if(!startBtn){
        startBtn=document.createElement('button');
        startBtn.id='pgStartBtn';
        startBtn.className='big-btn';
        startBtn.style.cssText='margin-top:2vmin;width:100%;max-width:400px;';
        document.getElementById('pregameInner').appendChild(startBtn);
      }
      startBtn.textContent=LANG==='ar'?'▶ ابدأ اللعبة':'▶ START GAME';
      startBtn.onclick=()=>{if(!selectedPlayMode){alert(LANG==='ar'?'اختر طريقة اللعب أولاً':'Please select how you are playing first');return;}startGameWithMode(selectedPlayMode,mode);};
      Audio_.sfx.blip();
    }
    document.getElementById('pgHostBtn').onclick=()=>selectPlayMode('tv');
    document.getElementById('pgPhonesBtn').onclick=()=>selectPlayMode('phones');
    document.getElementById('pgOfflineBtn').onclick=()=>selectPlayMode('offline');
    // Pre-show start button with no mode selected yet
    {
      const startBtn=document.createElement('button');
      startBtn.id='pgStartBtn';startBtn.className='big-btn';
      startBtn.style.cssText='margin-top:2vmin;width:100%;max-width:400px;';
      startBtn.textContent=LANG==='ar'?'▶ ابدأ اللعبة':'▶ START GAME';
      startBtn.onclick=()=>{
        if(!selectedPlayMode){
          // Default to phones only if nothing selected
          selectPlayMode('phones');
          setTimeout(()=>startGameWithMode('phones',mode),100);
          return;
        }
        startGameWithMode(selectedPlayMode,mode);
      };
      document.getElementById('pregameInner').appendChild(startBtn);
    }

    const backBtn=$('#backFromPregame');
    backBtn.textContent=T.back();
    backBtn.onclick=()=>{Audio_.sfx.blip();show('#scr-games');};
  }

  /* ---- START GAME ---- */
  async function startGameWithMode(playMode,gameMode){
    Audio_.sfx.submit();hostMode=playMode;
    window.__hypoxSkip=null;
    // Show loading state
    const startBtn=document.getElementById('pgStartBtn');
    if(startBtn){startBtn.textContent=LANG==='ar'?'⏳ جاري التحميل…':'⏳ Loading…';startBtn.disabled=true;}
    if(playMode!=='offline'&&!FirebaseNet.available()){Audio_.sfx.buzzer();alert(T.noFirebase());return;}
    if(net&&currentRoomCode&&!net.isOffline&&playMode!=='offline'){show('#scr-lobby');return;}
    net=createNet(playMode==='offline');
    if(playMode==='offline'&&!net.isOffline)net=new LocalNet();
    if(net.isOffline)net.promptLocal=passAndPlayPrompt;
    const code=await net.createRoom(LANG);
    currentRoomCode=code;
    $('#roomCodeText').textContent=net.isOffline?(LANG==='ar'?'مرّر الجوال':'PASS & PLAY'):code;
    $('#topbar').classList.add('show');
    $('#menuBtn').classList.remove('hidden');$('#topbar').classList.add('show');
    $('#roundPill').textContent=LANG==='ar'?'الصالة':'Lobby';
    updateMenu();
    if(playMode==='phones'){
      showAvatarPicker('phones',async(name,av)=>{
        const res=await net.joinRoom(code,name,av);
        myPid=res.pid;isVip=res.isVip;net.hostSelfPid=myPid;net.promptLocal=passAndPlayPrompt;
        show('#scr-lobby');setupLobby(gameMode);
      });return;
    }
    show('#scr-lobby');setupLobby(gameMode);
    $('#menuBtn').classList.remove('hidden');
  }

  function setupLobby(gameMode){
    gameActive=false;
    const isOff = net && net.isOffline;
    $('#localAdd').classList.toggle('hidden',!isOff);
    if(isOff) $('#addLocalBtn').onclick=()=>showAvatarPicker('offline');
    $('#addLocalBtn').textContent=T.addPlayer();
    $('#startGameBtn').textContent=T.startGame();
    // Back button — goes to game picker
    // Remove old back btn if exists
    document.getElementById('lobbyBackBtn')?.remove();
    {
      const bb=document.createElement('button');
      bb.id='lobbyBackBtn';bb.className='bar-btn';
      bb.style.cssText='margin-top:1vmin;display:block;margin-left:auto;margin-right:auto;';
      bb.textContent=LANG==='ar'?'→ رجوع':'← Back';
      bb.onclick=()=>{Audio_.sfx.blip();if(net)try{net.close?.();}catch(e){}net=null;currentRoomCode=null;players=[];gameActive=false;$('#menuBtn').classList.add('hidden');$('#roundPill').style.visibility='hidden';show('#scr-games');};
      document.getElementById('scr-lobby').appendChild(bb);
    }
    if(!net.isOffline&&currentRoomCode){
      const siteUrl=window.location.origin+window.location.pathname;
      const joinUrl=`${siteUrl}?room=${currentRoomCode}`;
      $('#joinHint').innerHTML=`<div class="lobby-share">
        <div class="share-code"><b>${currentRoomCode}</b></div>
        <div class="share-btns">
          <button class="bar-btn" id="copyLinkBtn">${T.copyLink()}</button>
          <button class="bar-btn" id="showQrBtn">${T.qrCode()}</button>
          <button class="bar-btn wa-btn" id="waShareBtn"><svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366" style="vertical-align:middle;margin-right:4px"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>WhatsApp</button>
        </div>
        <div id="qrArea" class="hidden"></div>
      </div>`;
      $('#copyLinkBtn').onclick=()=>{
        navigator.clipboard.writeText(joinUrl).then(()=>{$('#copyLinkBtn').textContent=T.copied();setTimeout(()=>$('#copyLinkBtn').textContent=T.copyLink(),2000);});
        Audio_.sfx.submit();
      };
      $('#waShareBtn').onclick=()=>{
        const msg=LANG==='ar'?`تعال نلعب HYPOX! 🎉 ادخل من هنا: ${joinUrl}`:`Come play HYPOX! 🎉 Join here: ${joinUrl}`;
        window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank');
        Audio_.sfx.pop();
      };
      $('#showQrBtn').onclick=()=>{
        const qr=$('#qrArea');
        if(qr.classList.contains('hidden')){qr.classList.remove('hidden');qr.innerHTML=`<img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(joinUrl)}" width="160" height="160" style="border-radius:12px;margin:10px auto;display:block;" alt="QR">`;$('#showQrBtn').textContent=LANG==='ar'?'✕ أخفِ QR':'✕ Hide QR';}
        else{qr.classList.add('hidden');$('#showQrBtn').textContent=T.qrCode();}
        Audio_.sfx.blip();
      };
    }else{$('#joinHint').textContent='';}

    net.onPlayers(list=>{
      const prev=players.length;players=list;
      if(list.length>prev){
        Audio_.sfx.pop();
        // Laith greets on first player joining
        if(prev===0&&list.length===1) Host.say(tPick('banter_lobby'));
      }
      $('#playerRow').innerHTML=list.map(p=>`<div class="player"><div class="avatar" style="background:${p.color}">${p.emoji}</div><div class="pname">${p.isVip?'👑 ':''}${esc(p.name)}</div></div>`).join('');
      const canStart=list.length>=2;
      $('#startGameBtn').classList.toggle('dim',!canStart);
      $('#lobbyHint').textContent=list.length<2?T.need2():list.length<3?T.need3():'';
    });

    const startBtn=document.getElementById('startGameBtn');
    if(startBtn)startBtn.onclick=()=>{
      if(players.length<2){Audio_.sfx.buzzer();$('#lobbyHint').classList.add('shake');setTimeout(()=>$('#lobbyHint').classList.remove('shake'),500);return;}
      startDirectGame(gameMode);
    };
  }

  async function startDirectGame(gameMode){
    Audio_.stopMusic();await FX.wipe();Host.hideHost();
    show('#scr-game');gameActive=true;const sk=$('#menuSkip');if(sk)sk.classList.remove('hidden');$('#menuBtn').classList.remove('hidden');$('#topbar').classList.add('show');$('#roundPill').style.visibility='visible';
    
    $('#roundPill').textContent=(t('mode_names')||{})[gameMode]||gameMode;
    net.setState({phase:'wait',msg:T.watchScreen()});
    await Host.run(net,players,gameMode);
    showPackPicker();
  }

  async function showPackPicker(){
    Audio_.stopMusic();await FX.wipe();Host.hideHost();
    show('#scr-game');gameActive=true;const sk2=$('#menuSkip');if(sk2)sk2.classList.add('hidden');
    $('#roundPill').textContent=T.nextGame();
    const modeNamesObj=t('mode_names')||{};
    const modeTagsObj=t('mode_taglines')||{};
    Host.scene(`
      <div class="lobby-title display">${T.nextGame()}</div>
      <div class="pack-grid">
        ${Object.keys(MODE_ICONS).map((m,i)=>`
          <button class="pack-card" data-mode="${m}" style="animation-delay:${i*.07}s">
            <div class="pack-icon">${MODE_ICONS[m]}</div>
            <div class="pack-name display">${esc(modeNamesObj[m]||m)}</div>
            <div class="pack-tag">${esc(modeTagsObj[m]||'')}</div>
            <div class="pack-min">👥 ${T.minPlayers(MODE_MIN[m])}</div>
          </button>`).join('')}
      </div>
      <div class="session-lb">
        <div class="slb-title display">${LANG==='ar'?'🏆 صدارة السهرة':'🏆 TONIGHT\'S LEADERBOARD'}</div>
        ${players.slice().sort((a,b)=>(b.score||0)-(a.score||0)).slice(0,8).map((pl,i)=>`
          <div class="slb-row" style="animation-delay:${i*.08}s">
            <span class="slb-rank">${i===0?'👑':(i+1)}</span>
            <span class="slb-av" style="background:${pl.color}">${pl.emoji}</span>
            <span class="slb-name">${esc(pl.name)}</span>
            <span class="slb-pts display">${(pl.score||0).toLocaleString()}</span>
          </div>`).join('')}
      </div>
      <button class="bar-btn" id="backToLobbyBtn" style="margin-top:2vmin">${T.backLobby()}</button>`);
    Audio_.startMusic('lobby');net.setState({phase:'wait',msg:T.watchScreen()});
    $$('.pack-card').forEach(btn=>btn.addEventListener('click',async()=>{
      const mode=btn.dataset.mode,minP=MODE_MIN[mode]||2;
      if(players.length<minP){
        Audio_.sfx.buzzer();
        const err=document.createElement('div');
        err.style.cssText='position:fixed;bottom:4vmin;left:50%;transform:translateX(-50%);background:var(--pink);color:#fff;font-family:Fredoka One,sans-serif;font-size:18px;padding:12px 28px;border-radius:50px;z-index:50;animation:popIn .3s both';
        err.textContent=T.needPlayers();document.body.appendChild(err);setTimeout(()=>err.remove(),2200);return;
      }
      Audio_.sfx.submit();await startDirectGame(mode);
    },{once:true}));
    document.getElementById('backToLobbyBtn')?.addEventListener('click',()=>{show('#scr-lobby');Audio_.startMusic('lobby');},{once:true});
  }

  /* ---- MENU ---- */
  function updateMenu(){
    const m=$('#menuOverlay .menu-card');
    if(!m)return;
    m.querySelector('.menu-title').textContent=T.menu();
    m.querySelector('#menuResume').textContent=T.resume();
    m.querySelector('#menuLeave').textContent=T.leave();
    m.querySelector('#menuClose').textContent=T.cancel();
  }
  function openMenu(){
    // Update menu labels based on game state
    const resumeEl=document.getElementById('menuResumeLabel');
    const leaveEl=document.getElementById('menuLeaveLabel');
    const skipEl=$('#menuSkip');
    if(resumeEl) resumeEl.textContent=gameActive?(LANG==='ar'?'استمر في اللعبة':'Resume Game'):(LANG==='ar'?'العب':'Play');
    if(leaveEl) leaveEl.textContent=gameActive?(LANG==='ar'?'اترك اللعبة':'Leave Game'):(LANG==='ar'?'الرئيسية':'Home');
    if(skipEl) skipEl.classList.toggle('hidden',!gameActive);
    $('#menuOverlay').classList.remove('hidden');
    Audio_.sfx.blip();
  }
  function closeMenu(){$('#menuOverlay').classList.add('hidden');}
  function leaveGame(){
    gameActive=false;
    window.__hypoxAbort = true;  // tells Host.run to stop after current await
    if(window.__hypoxSkip)window.__hypoxSkip();
    window.__hypoxSkip=null;
    if(net)try{net.setState({phase:'wait',msg:''});}catch(e){}
    Audio_.stopMusic();
    currentRoomCode=null;net=null;players=[];
    const hel=$('#host');if(hel)hel.classList.remove('show');
    show('#scr-title');
    const skc=$('#menuSkip');if(skc)skc.classList.add('hidden');
    $('#roundPill').style.visibility='hidden';
    $('#topbar').classList.remove('show');
    $('#menuBtn').classList.add('hidden');
  }

  /* ---- AVATAR ---- */
  function buildAvatarGrid(){
    const grid=$('#avatarGrid');
    grid.innerHTML=AVATARS_LIST.map((av,i)=>`
      <button class="avatar-opt${i===0?' selected':''}" data-i="${i}" style="${i===0?'border-color:'+av.color:''}">
        <div class="avatar-emoji">${av.emoji}</div>
        <div class="avatar-label">${av.label}</div>
      </button>`).join('');
    $$('.avatar-opt').forEach(btn=>btn.addEventListener('click',()=>{
      Audio_.sfx.vote();
      $$('.avatar-opt').forEach(b=>{b.classList.remove('selected');b.style.borderColor='';});
      btn.classList.add('selected');selectedAvatar=AVATARS_LIST[+btn.dataset.i];btn.style.borderColor=selectedAvatar.color;
    }));
  }
  function showAvatarPicker(context,cb){
    _avatarContext=context;_avatarCallback=cb||null;buildAvatarGrid();
    $('#avatarName').value='';$('#avatarName').placeholder=T.yourName();
    $('#avatarTitle').textContent=T.pickAvatar();
    $('#avatarDone').textContent=T.letsGo();
    const backBtn=$('#backFromAvatar');
    backBtn.textContent=T.back();
    backBtn.onclick=()=>{Audio_.sfx.blip();if(_avatarContext==='offline')show('#scr-lobby');else show('#scr-title');};
    show('#scr-avatar');
  }
  function confirmAvatar(){
    const name=$('#avatarName').value.trim();
    if(!name){$('#avatarName').classList.add('shake');setTimeout(()=>$('#avatarName').classList.remove('shake'),500);return;}
    Audio_.sfx.submit();
    if(_avatarCallback){_avatarCallback(name,selectedAvatar);return;}
    if(net&&net.isOffline){
      const p=net.addLocalPlayer(name,selectedAvatar);
      if(p){
        Audio_.sfx.pop();
        show('#scr-lobby');
        // Force player list refresh
        if(net._playersCb) net._playersCb(net.players.slice());
      }
    }
  }

  /* ---- PASS & PLAY ---- */
  function passAndPlayPrompt(spec,player){
    return new Promise(resolve=>{
      const ov=$('#ppOverlay');ov.classList.add('show');
      let settled=false;
      const done=value=>{if(settled)return;settled=true;_ppDismiss=null;setTimeout(()=>{ov.classList.remove('show');resolve(value);},400);};
      _ppDismiss=()=>{if(settled)return;settled=true;_ppDismiss=null;ov.classList.remove('show');resolve(null);};
      window.__hypoxDismissPP=()=>{if(_ppDismiss)_ppDismiss();};
      ov.innerHTML=`<div class="pp-card">
        <div class="eyebrow">${T.passto()}</div>
        <div class="pp-player"><div class="avatar" style="background:${player.color}">${player.emoji}</div><div class="pp-name display">${esc(player.name)}</div></div>
        <button class="big-btn" id="ppReady">${T.tapReady()}</button>
      </div>`;
      Audio_.sfx.sting();
      $('#ppReady').addEventListener('click',()=>{
        Audio_.sfx.pop();ov.innerHTML=`<div class="pp-card"><div id="ppCtrl"></div></div>`;
        Controller.render($('#ppCtrl'),spec,value=>done(value));
      },{once:true});
    });
  }

  /* ---- JOIN ---- */
  function buildJoinAvatarRow(){
    const row=document.getElementById('joinAvatarRow');
    if(!row)return;
    // Show first 10 avatars in a horizontal row
    row.innerHTML=AVATARS_LIST.slice(0,10).map((av,i)=>`
      <button class="join-av${i===0?' selected':''}" data-i="${i}" style="background:${av.color};${i===0?'outline:3px solid #fff;transform:scale(1.15)':''}" title="${av.label}">${av.emoji}</button>`).join('');
    row.querySelectorAll('.join-av').forEach(btn=>btn.addEventListener('click',()=>{
      row.querySelectorAll('.join-av').forEach(b=>{b.style.outline='';b.style.transform='';b.classList.remove('selected');});
      btn.classList.add('selected');
      btn.style.outline='3px solid #fff';btn.style.transform='scale(1.15)';
      selectedAvatar=AVATARS_LIST[+btn.dataset.i];
      Audio_.sfx.vote();
    }));
  }

  async function joinAsPlayer(){
    const code=$('#joinCode').value.trim().toUpperCase();
    const name=$('#joinName').value.trim();
    if(!code||!name){Audio_.sfx.buzzer();return;}
    if(!FirebaseNet.available()){$('#joinErr').textContent=T.noFirebase();return;}
    $('#joinErr').textContent=T.connecting();
    try{net=FirebaseNet.create();const res=await net.joinRoom(code,name,selectedAvatar);myPid=res.pid;isVip=res.isVip;}
    catch(e){$('#joinErr').textContent=T.connFail();return;}
    show('#scr-controller');
    $('#menuBtn').classList.remove('hidden');$('#topbar').classList.add('show');
    updateMenu();
    const ctrl=$('#ctrlArea');
    Controller.waitScreen(ctrl,isVip?T.youreHost():T.youreIn());
    const mstrip=$('#phoneMirror');
    function renderMirror(m){
      if(!m)return;mstrip.classList.remove('hidden');
      if(m.pill!==undefined)$('#pmPill').textContent=m.pill||'';
      if(m.headline!==undefined)$('#pmHeadline').textContent=m.headline||'';
      if(m.speech!==undefined){$('#pmSpeech').textContent=m.speech||'';$('#pmLaith').style.display=m.speech?'flex':'none';}
      // If ctrl is showing a wait screen, update it with new mirror content
      if(m.headline && ctrl.querySelector('.ctrl-waiting, .ctrl-wrap')){
        const isInputActive = ctrl.querySelector('textarea,input,.ctrl-choice');
        if(!isInputActive){
          ctrl.innerHTML=`<div class="ctrl-wrap" style="text-align:center;padding:20px 16px">
            ${m.pill?`<div style="font-family:'Fredoka One',sans-serif;font-size:11px;letter-spacing:1px;color:var(--text3);text-transform:uppercase;margin-bottom:10px">${esc(m.pill)}</div>`:''}
            <div style="font-family:'Fredoka One',sans-serif;font-size:clamp(16px,4.5vw,22px);color:var(--text);line-height:1.35;margin-bottom:16px">${esc(m.headline)}</div>
            ${m.speech?`<div style="font-size:13px;color:var(--text2);font-style:italic;margin-bottom:12px">"${esc(m.speech)}"</div>`:''}
            <div style="display:flex;gap:8px;justify-content:center"><div class="pulse-dot"></div><div class="pulse-dot"></div><div class="pulse-dot"></div></div>
          </div>`;
        }
      }
    }
    net.onMirror(renderMirror);
    let lastPhaseId=null;
    net.onState(state=>{
      if(state.mirror)renderMirror(state.mirror);
      if(state.phase==='input'&&state.phaseId!==lastPhaseId){
        if(!state.targets||state.targets.includes(myPid)){
          lastPhaseId=state.phaseId;Audio_.sfx.sting();if(navigator.vibrate)navigator.vibrate(120);
          Controller.render(ctrl,state.spec,value=>{net.submitInput(state.phaseId,value);setTimeout(()=>Controller.waitScreen(ctrl),600);});
        }else Controller.waitScreen(ctrl,T.watchScreen());
      }else if(state.phase==='input-split'&&state.phaseId!==lastPhaseId){
        lastPhaseId=state.phaseId;Audio_.sfx.sting();if(navigator.vibrate)navigator.vibrate(120);
        const spec=state.specs[myPid]||state.specs._default;
        Controller.render(ctrl,spec,value=>{net.submitInput(state.phaseId,value);setTimeout(()=>Controller.waitScreen(ctrl),600);});
      }else if(state.phase==='wait'){
        // Show mirror content prominently if available, otherwise simple wait card
        const m = state.mirror||{};
        if(m.headline){
          ctrl.innerHTML=`<div class="ctrl-wrap" style="text-align:center;padding:20px 16px">
            ${m.pill?`<div style="font-family:'Fredoka One',sans-serif;font-size:11px;letter-spacing:1px;color:var(--text3);text-transform:uppercase;margin-bottom:10px">${esc(m.pill)}</div>`:''}
            <div style="font-family:'Fredoka One',sans-serif;font-size:clamp(16px,4.5vw,22px);color:var(--text);line-height:1.35;margin-bottom:16px">${esc(m.headline)}</div>
            ${m.speech?`<div style="font-size:13px;color:var(--text2);font-style:italic;margin-bottom:12px">"${esc(m.speech)}"</div>`:''}
            <div style="display:flex;gap:8px;justify-content:center"><div class="pulse-dot"></div><div class="pulse-dot"></div><div class="pulse-dot"></div></div>
          </div>`;
        } else {
          Controller.waitScreen(ctrl,state.msg||T.watchScreen());
        }
      }else if(state.phase==='spy-roles'&&state.roles){
        const myRole=state.roles[myPid];
        if(myRole){
          const isSpy=myRole.role==='spy';
          ctrl.innerHTML='<div class="ctrl-wrap" style="text-align:center;padding:30px 20px"><div style="font-size:64px;margin-bottom:16px">'+(isSpy?'🕵️':'🤵')+'</div><div style="font-family:Fredoka One,sans-serif;font-size:28px;color:'+(isSpy?'var(--pink)':'var(--green)')+'">'+( isSpy?(LANG==='ar'?'أنت الجاسوس!':'YOU ARE THE SPY!'):(LANG==='ar'?'أنت عميل':'YOU ARE AN AGENT'))+'</div><div style="font-size:18px;margin-top:12px;color:var(--text2)">'+(isSpy?(LANG==='ar'?'اكتشف الكلمة من الحديث':'Find the word from discussion'):(LANG==='ar'?'الكلمة: '+myRole.word:'Word: '+myRole.word))+'</div></div>';
          if(isSpy)Audio_.sfx.buzzer();else Audio_.sfx.sting();
        }
      }else if(state.phase==='gameinfo'){
        ctrl.innerHTML=`<div class="ctrl-wrap" style="text-align:center;padding:20px 16px">
          <div style="font-size:56px;margin-bottom:8px">${esc(state.icon||'🎮')}</div>
          <div style="font-family:'Fredoka One',sans-serif;font-size:clamp(20px,5vw,28px);color:var(--yellow);margin-bottom:6px">${esc(state.modeName||'')}</div>
          <div style="font-size:clamp(13px,3.5vw,16px);color:var(--text2);margin-bottom:12px">${esc(state.tagline||'')}</div>
          ${state.rules?`<div style="font-size:clamp(12px,3vw,14px);color:var(--text3);line-height:1.5;background:rgba(255,255,255,0.06);border-radius:12px;padding:10px 14px;text-align:left">${esc(state.rules)}</div>`:''}
          <div style="margin-top:16px;font-size:13px;color:var(--text3)">${LANG==='ar'?'انتظر المضيف يبدأ…':'Waiting for host to start…'}</div>
        </div>`;
      }else if(state.phase==='winner'){
        ctrl.innerHTML=`<div class="ctrl-wrap"><div class="crown">👑</div><div class="ctrl-title display">${state.emoji} ${esc(state.name)}</div><div class="ctrl-sub">${T.winner()}</div></div>`;
        Audio_.sfx.fanfare();
      }
    });
  }
})();
