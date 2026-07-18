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
  const MODE_MIN = {bluff:2,wyr:2,interrogation:2,diss:2,trivia:2,pinpoint:2,emoji:2,year:2,mostlikely:2,trueorlie:2,flaghunt:2,higherlow:2,'2t1l':2,emojiplace:2,spy:2};
  const MODE_ICONS = {bluff:'🔍',wyr:'⚖️',interrogation:'🔦',diss:'🎤',trivia:'⚡',pinpoint:'📍',emoji:'🧩',year:'⏳',mostlikely:'🏆',trueorlie:'✅',flaghunt:'🚩',higherlow:'📊','2t1l':'🤥',emojiplace:'🌍',spy:'🕵️'};
  const MODE_COLORS = {bluff:'#f472b6',wyr:'#60a5fa',interrogation:'#a78bfa',diss:'#fb923c',trivia:'#facc15',pinpoint:'#22d3ee',emoji:'#e879f9',year:'#fbbf24',mostlikely:'#f43f5e',trueorlie:'#10b981',flaghunt:'#ef4444',higherlow:'#8b5cf6','2t1l':'#f97316',emojiplace:'#06b6d4',spy:'#64748b'};
  const CAT_INFO = [
    {id:'general',icon:'🎲',name:'General Mix',nameAr:'خلطة عامة'},
    {id:'geography',icon:'🌍',name:'Geography',nameAr:'جغرافيا'},
    {id:'science',icon:'🔬',name:'Science',nameAr:'علوم'},
    {id:'gulf',icon:'🕌',name:'Gulf & Arab',nameAr:'خليج وعرب'},
    {id:'pop',icon:'🎬',name:'Pop Culture',nameAr:'ثقافة شعبية'},
    {id:'sports',icon:'⚽',name:'Sports',nameAr:'رياضة'},
    {id:'football',icon:'⚽',name:'Football',nameAr:'كرة القدم'},
  ];

  window.HYPOX_STATE = window.HYPOX_STATE || {region:null,rounds:5,category:'general',flavor:'global',autoplay:false};
  let net=null, players=[], myPid=null, isVip=false, hostMode='tv';
  let selectedAvatar=AVATARS_LIST[0];
  let _ppDismiss=null, _avatarCallback=null, _avatarContext=null;
  let gameActive=false, currentRoomCode=null;
  let _menuScrollY=0;

  const show=id=>{
    $$('.screen').forEach(s=>s.classList.remove('active'));
    $(id).classList.add('active');
    // Mobile screens use the document scroller so Safari pull-to-refresh works.
    // Always reset that scroller when navigating between screens.
    if(window.matchMedia('(max-width: 600px)').matches){
      requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:'auto'}));
    }
  };
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
    setTimeout(()=>FX.burst(70),650);
    // Pre-fill join form if session was saved (phone unlocked/reloaded)
    try{
      const saved=sessionStorage.getItem('hypox_session');
      if(saved){
        const s=JSON.parse(saved);
        if(s.code&&s.name&&FirebaseNet.available()){
          $('#joinCode').value=s.code;$('#joinName').value=s.name;
          if(s.emoji){
            selectedAvatar={emoji:s.emoji,color:s.color||'#ff3d8a'};
            // Highlight saved avatar in picker
            $$('.join-av').forEach(b=>{if(b.textContent.trim()===s.emoji)b.classList.add('selected');});
          }
          // Show reconnect banner instead of going straight to join screen
          // to avoid jarring automatic navigation
          const banner=document.createElement('div');
          banner.id='reconnectBanner';
          banner.style.cssText='position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:999;background:var(--card);border:1.5px solid var(--yellow);border-radius:40px;padding:8px 20px;font-family:"Fredoka One",sans-serif;font-size:14px;color:var(--yellow);cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,0.4)';
          banner.textContent=`↩ Rejoin ${s.code}`;
          banner.onclick=()=>{banner.remove();show('#scr-join');};
          document.body.appendChild(banner);
          setTimeout(()=>banner?.remove(),8000);
        }
      }
    }catch(e){} // welcome confetti on landing

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
    $('#menuBtn').addEventListener('click',openMenu);

    $('#menuClose').addEventListener('click',closeMenu);
    $('#menuResume').addEventListener('click',closeMenu);
    $('#menuLeave').addEventListener('click',()=>{closeMenu();if(gameActive||currentRoomCode){leaveGame();}else{show('#scr-title');}});
    // Topbar back button — leave game when active, go home otherwise
    document.getElementById('topbarBack')?.addEventListener('click',()=>{
      Audio_.sfx.blip();
      if(gameActive||currentRoomCode){
        if(confirm(LANG==='ar'?'تريد تترك اللعبة؟':'Leave the game?')) leaveGame();
      } else { show('#scr-title'); }
    });

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
    const COMING_SOON = new Set(['emoji']); // emoji riddle needs redesign
    grid.innerHTML=modes.map((m,i)=>{
      const soon = COMING_SOON.has(m);
      return `<button class="title-game-card${soon?' tgc-soon':''}" data-mode="${m}" style="animation-delay:${i*.07}s;--mc:${MODE_COLORS[m]}" ${soon?'disabled':''}>
        <div class="tgc-art">${MODE_ICONS[m]}</div>
        <div class="tgc-name display">${esc(modeNamesObj[m]||m)}</div>
        <div class="tgc-tag">${soon?'🔧 Coming Soon':esc(modeTagsObj[m]||'')}</div>
        <div class="tgc-min">👥 ${T.minPlayers(MODE_MIN[m])}</div>
        ${soon?'<div class="tgc-soon-badge">COMING SOON</div>':''}
      </button>`;
    }).join('');

    // Hero text (translated)
    const hh=$('#heroHeadline'), hs=$('#heroSub');
    if(hh)hh.textContent=LANG==='ar'?'السهرة تبدأ من هنا':'The Party Starts Here';
    if(hs)hs.textContent=LANG==='ar'?'ألعاب أصحابك بيتهاوشون عليها. بدون تطبيقات وبدون تحميل — بس جوالات وفوضى.':'Games your friends will actually fight over. No apps, no downloads — just phones and chaos.';

    const tapLabel=$('#tapLabel');
    if(tapLabel)tapLabel.textContent=LANG==='ar'?'اختر لعبتك':'PICK YOUR GAME';
    const joinBtn=$('#joinBtn');
    if(joinBtn){joinBtn.textContent=T.joinGame();joinBtn.onclick=()=>{Audio_.sfx.blip();show('#scr-join');paintJoin();};}
    const hstart=$('#heroStart');
    if(hstart){hstart.textContent=LANG==='ar'?'▶ ابدأ لعبة':'START A GAME ▶';hstart.onclick=()=>{Audio_.sfx.pop();$('#roundPill').innerHTML='<span class="logo-letters display" style="justify-content:center;gap:3px;font-size:clamp(18px,4vw,26px)"><span class="logo-lt" style="--i:0">H</span><span class="logo-lt" style="--i:1">Y</span><span class="logo-lt" style="--i:2">P</span><span class="logo-lt" style="--i:3">O</span><span class="logo-lt" style="--i:4">X</span></span>';$('#roundPill').style.visibility='visible';$('#roundPill').style.background='none';$('#roundPill').style.border='none';$('#roundPill').style.boxShadow='none';$('#topbar').classList.add('show');const tb=document.getElementById('topbarBack');
      if(tb){
        tb.style.setProperty('visibility','visible');
        tb.onclick=()=>{Audio_.sfx.blip();$('#topbar').classList.remove('show');$('#roundPill').innerHTML='HYPOX';$('#roundPill').style.cssText='';show('#scr-title');};
      }
      const bfgEl=$('#backFromGames');if(bfgEl)bfgEl.style.display='none';
      show('#scr-games');};}
    const hstart2=$('#heroStart2');
    if(hstart2){hstart2.textContent=LANG==='ar'?'▶ ابدأ لعبة':'START A GAME ▶';hstart2.onclick=()=>{Audio_.sfx.pop();$('#roundPill').innerHTML='<span class="logo-letters display" style="justify-content:center;gap:3px;font-size:clamp(18px,4vw,26px)"><span class="logo-lt" style="--i:0">H</span><span class="logo-lt" style="--i:1">Y</span><span class="logo-lt" style="--i:2">P</span><span class="logo-lt" style="--i:3">O</span><span class="logo-lt" style="--i:4">X</span></span>';$('#roundPill').style.visibility='visible';$('#roundPill').style.background='none';$('#roundPill').style.border='none';$('#roundPill').style.boxShadow='none';$('#topbar').classList.add('show');const tb=document.getElementById('topbarBack');
      if(tb){
        tb.style.setProperty('visibility','visible');
        tb.onclick=()=>{Audio_.sfx.blip();$('#topbar').classList.remove('show');$('#roundPill').innerHTML='HYPOX';$('#roundPill').style.cssText='';show('#scr-title');};
      }
      const bfgEl=$('#backFromGames');if(bfgEl)bfgEl.style.display='none';
      show('#scr-games');};}
    const LS={howTitle:['HOW IT WORKS','كيف تلعب؟'],how1:['📺 TV + Phones','📺 شاشة + جوالات'],how1d:['Host opens on laptop or TV, shares screen. Everyone joins by QR or link. Phones = controllers, TV = the show.','افتح على اللابتوب أو التلفاز وشارك الشاشة. الكل يدخل عن طريق QR أو رابط. الجوالات للإجابة، التلفاز للعرض.'],how2:['📱 Phones Only','📱 جوالات فقط'],how2d:['No TV? No problem. Everyone plays on their own phone. Share the room code and you are in.','ما في تلفاز؟ لا مشكلة. الكل يلعب من جواله. شارك الكود وابدأ.'],how3:['🤝 One Device','🤝 جهاز واحد'],how3d:['Pass one phone around the table. No internet needed. Perfect for road trips or anywhere.','مرّر جوال واحد على الجميع. بدون إنترنت. مثالية في الرحلات وأي مكان.'],previewTitle:['THE GAMES. INFINITE CHAOS.','الألعاب. فوضى لا تنتهي.'],prev1:['LIE DETECTOR','كاشف الكذب'],prev1d:['Spot the lie. Fool your friends.','اكتشف الكذبة. اخدع ربعك.'],prev2:['WOULD YOU RATHER','يا هذا يا هذا'],prev2d:['How well do you know them?','شكثر تعرفهم صح؟'],prev3:['ROAST BATTLE','حرب القصايد'],prev3d:['One-liner battle. Crowd decides.','مواجهة بسطر واحد. الجمهور يحكم.'],prev4:['PIN POINT','حدد المكان'],prev4d:['Drop your pin. Closest wins.','حط دبوسك. الأقرب يفوز.'],prev5:['EMOJI RIDDLE','فزورة الإيموجي'],prev5d:['Decode the emojis. Beat the clock.','فك رموز الإيموجي قبل غيرك.'],prev6:['TIME MACHINE','آلة الزمن'],prev6d:['Guess the year. Closest wins.','خمّن السنة. الأقرب يفوز.'],proofTitle:['WHAT PEOPLE SAY','شو يقولون عنا؟'],proof1:['"We played for 3 hours straight. Nobody wanted to stop."','"لعبنا ٣ ساعات متواصلة. ما أحد أبى يوقف."'],proof2:['"Finally a party game that actually works in Arabic. The Gulf humor is spot on."','"أخيراً لعبة سهرة تشتغل بالعربي. الروح الخليجية موجودة."'],proof3:['"No app, no login, no drama. Just scan and play."','"بدون تطبيق، بدون تسجيل. بس امسح والعب."'],finalTitle:['READY TO START?','جاهز تبدأ؟']};
    Object.entries(LS).forEach(([id,[en,ar]])=>{const el=document.getElementById(id);if(el)el.textContent=LANG==='ar'?ar:en;});
    const tp=document.querySelectorAll('.trust-pill');
    const tpArr=LANG==='ar'?['📱 بدون تحميل','⚡ ابدأ في ثواني','👥 ٢-٢٠ لاعب','🌍 عربي وإنجليزي']:['📱 No downloads','⚡ Start in seconds','👥 2-20 players','🌍 Arabic & English'];
    tp.forEach((el,i)=>{if(tpArr[i])el.textContent=tpArr[i];});
    const bfg=$('#backFromGames');
    if(bfg){bfg.textContent=LANG==='ar'?'→ رجوع':'← Back';bfg.onclick=()=>{Audio_.sfx.blip();$('#topbar').classList.remove('show');$('#roundPill').innerHTML='HYPOX';$('#roundPill').style.cssText='';show('#scr-title');};}

    $$('.title-game-card').forEach(card=>card.addEventListener('click',()=>{
      Audio_.sfx.pop();Audio_.unlock();
      const m=card.dataset.mode;
      showPregame(m);
    }));
  }

  function paintJoin(){
    $('#backFromJoin').textContent=T.back();
    $('#backFromJoin').onclick=()=>{Audio_.sfx.blip();$('#topbar').classList.remove('show');$('#roundPill').innerHTML='HYPOX';$('#roundPill').style.cssText='';show('#scr-title');};
    $('#joinCode').placeholder=LANG==='ar'?'رمز الغرفة':'Room code';
    $('#joinName').placeholder=T.yourName();
    $('#joinGo').textContent=LANG==='ar'?'دخول →':'Join →';
  }

  /* ---- PREGAME: single page, no scroll ---- */
  function showPregame(mode){
    document.getElementById('pgStickyBar')?.remove(); // clean up from previous
    // Wire topbar back button for pregame
    $('#topbar').classList.add('show');
    const pregameBack=document.getElementById('topbarBack');
    if(pregameBack){
      pregameBack.style.setProperty('visibility','visible');
      pregameBack.onclick=()=>{
        Audio_.sfx.blip();
        pregameBack.style.setProperty('visibility','hidden');
        show('#scr-games');
      };
    }
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
        <div class="pg-label">${LANG==='ar'?'مدة النقاش':'DISCUSSION TIME'}</div>
        <div class="round-btns">${[[60,'1 min'],[120,'2 min'],[180,'3 min'],[300,'5 min']].map(([s,l])=>`<button class="round-btn${(window.HYPOX_STATE.spyDisc||120)===s?' selected':''}" data-spydisc="${s}">${l}</button>`).join('')}</div>
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
    // Spy discussion timer
    document.querySelectorAll('[data-spydisc]').forEach(btn=>btn.addEventListener('click',()=>{
      window.HYPOX_STATE.spyDisc=+btn.dataset.spydisc;
      document.querySelectorAll('[data-spydisc]').forEach(b=>b.classList.toggle('selected',b===btn));
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
      // Show start button in normal page flow
      let startBtn=document.getElementById('pgStartBtn');
      if(!startBtn){
        startBtn=document.createElement('button');
        startBtn.id='pgStartBtn';
        startBtn.className='big-btn';
        startBtn.style.cssText='margin-top:16px;width:100%;max-width:400px;';
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
      startBtn.style.cssText='margin-top:16px;width:100%;max-width:400px;';
      startBtn.textContent=LANG==='ar'?'▶ ابدأ اللعبة':'▶ START GAME';
      document.getElementById('pregameInner').appendChild(startBtn);
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
    // Show loading on button immediately so user knows tap worked
    const startBtn=document.getElementById('pgStartBtn');
    if(startBtn){startBtn.textContent=LANG==='ar'?'⏳ جاري...':'⏳ Starting...';startBtn.disabled=true;}
    const restoreBtn=()=>{if(startBtn){startBtn.textContent=LANG==='ar'?'▶ ابدأ اللعبة':'▶ START GAME';startBtn.disabled=false;}};
    if(playMode!=='offline'&&!FirebaseNet.available()){Audio_.sfx.buzzer();restoreBtn();alert(T.noFirebase());return;}
    // Reset any existing session
    if(net)try{net.close?.();}catch(e){}
    net=null;currentRoomCode=null;players=[];
    net=createNet(playMode==='offline');
    if(playMode==='offline'&&!net.isOffline)net=new LocalNet();
    if(net.isOffline)net.promptLocal=passAndPlayPrompt;
    let code;
    try{
      const roomPromise=net.createRoom(LANG);
      code=await Promise.race([roomPromise,new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),8000))]);
    }catch(e){
      Audio_.sfx.buzzer();restoreBtn();net=null;
      alert(LANG==='ar'?'تعذر الاتصال. تحقق من الإنترنت وحاول مرة ثانية.':'Connection failed. Check your internet and try again.');
      return;
    }
    await Promise.race([net.setPlayMode(playMode),new Promise(r=>setTimeout(r,3000))]).catch(()=>{});
    net.phonesOnly=playMode==='phones';
    currentRoomCode=code;
    $('#topbar').classList.add('show');
    // menuBtn always visible (fixed position)
    $('#roundPill').textContent='';$('#roundPill').style.visibility='hidden';
    updateMenu();
    restoreBtn();
    if(playMode==='phones'){
      showAvatarPicker('phones',async(name,av)=>{
        const res=await net.joinRoom(code,name,av);
        myPid=res.pid;isVip=res.isVip;net.hostSelfPid=myPid;net.promptLocal=phonesHostPrompt;
        show('#scr-lobby');setupLobby(gameMode);
      });return;
    }
    show('#scr-lobby');setupLobby(gameMode);
  }

  function setupLobby(gameMode){
    gameActive=false;
    // Ensure topbar is correct
    $('#topbar').classList.add('show');
    // menuBtn always visible (fixed position)
    $('#roundPill').textContent='';$('#roundPill').style.visibility='hidden';
    $('#roundPill').style.visibility='visible';
    // Show back button in lobby topbar
    const topBarBackBtn = document.getElementById('topbarBack');
    if(topBarBackBtn){
      topBarBackBtn.style.setProperty('visibility','visible');
      topBarBackBtn.onclick=()=>{
        Audio_.sfx.blip();
        if(net)try{net.close?.();}catch(e){}
        net=null;currentRoomCode=null;players=[];gameActive=false;
        $('#roundPill').style.visibility='hidden';
        $('#topbar').classList.remove('show');
        show('#scr-games');
      };
    }
    updateMenu();
    const isOff = net && net.isOffline;
    $('#localAdd').classList.toggle('hidden',!isOff);
    if(isOff) $('#addLocalBtn').onclick=()=>showAvatarPicker('offline');
    $('#addLocalBtn').textContent=T.addPlayer();
    $('#startGameBtn').textContent=T.startGame();
    // Back button via topbarBack (top-left) — not bottom
    document.getElementById('lobbyBackBtn')?.remove();
    const lobbyBackEl=document.getElementById('topbarBack');
    if(lobbyBackEl){
      lobbyBackEl.style.setProperty('visibility','visible');
      lobbyBackEl.onclick=()=>{Audio_.sfx.blip();if(net)try{net.close?.();}catch(e){}net=null;currentRoomCode=null;players=[];gameActive=false;$('#roundPill').style.visibility='hidden';show('#scr-games');};
    }
    if(!net.isOffline&&currentRoomCode){
      const siteUrl=window.location.origin+window.location.pathname;
      const joinUrl=`${siteUrl}?room=${currentRoomCode}`;
      $('#joinHint').innerHTML=`<div class="lobby-share">
        <div class="share-code"><b>${currentRoomCode}</b></div>
        <div class="share-btns">
          <button class="bar-btn" id="copyLinkBtn">${T.copyLink()}</button>
          <button class="bar-btn wa-btn" id="waShareBtn"><svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366" style="vertical-align:middle;margin-right:4px"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>WhatsApp</button>
        </div>
        <div id="qrArea"><img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(joinUrl)}" width="180" height="180" style="border-radius:12px;margin:10px auto;display:block;" alt="QR"></div>
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
      
    }else{$('#joinHint').textContent='';}

    net.onPlayers(list=>{
      const prev=players.length;players=list;
      if(list.length>prev){
        Audio_.sfx.pop();
        const newPlayer=list[list.length-1];
        // Toast notification for host
        const toast=document.createElement('div');
        toast.style.cssText='position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:999;background:var(--card);border:1.5px solid var(--green);border-radius:40px;padding:8px 20px;font-family:"Fredoka One",sans-serif;font-size:14px;color:var(--green);animation:fadeInDown .3s ease;pointer-events:none';
        toast.textContent=`${newPlayer.emoji} ${newPlayer.name} ${LANG==='ar'?'انضم!':'joined!'}`;
        document.body.appendChild(toast);
        setTimeout(()=>toast.remove(),2500);
        // Laith greets on first player joining
        if(prev===0&&list.length===1) Host.say(tPick('banter_lobby'));
        else if(list.length>1) Host.say(LANG==='ar'?`${newPlayer.name} انضم! أهلاً!`:`${newPlayer.name} just joined!`);
      }
      $('#playerRow').innerHTML=list.map(p=>`<div class="player"><div class="avatar" style="background:${p.color}">${p.emoji}</div><div class="pname">${p.isVip?'👑 ':''}${esc(p.name)}</div></div>`).join('');
      const canStart=list.length>=2;
      $('#startGameBtn').classList.toggle('dim',!canStart);
      $('#lobbyHint').textContent=list.length<2?T.need2():list.length<3?T.need3():'';
    });

    const startBtn=document.getElementById('startGameBtn');
    if(startBtn)startBtn.onclick=()=>{
      const minPlayers=MODE_MIN[gameMode]||2;
      if(players.length<minPlayers){
        Audio_.sfx.buzzer();
        $('#lobbyHint').textContent=T.needPlayers();
        $('#lobbyHint').classList.add('shake');
        setTimeout(()=>$('#lobbyHint').classList.remove('shake'),500);
        return;
      }
      startDirectGame(gameMode);
    };
  }

  async function startDirectGame(gameMode){
    Audio_.stopMusic();await FX.wipe();Host.hideHost();
    show('#scr-game');gameActive=true;document.getElementById('topbarBack')?.style.setProperty('visibility','visible');$('#topbar').classList.add('show');$('#roundPill').style.visibility='visible';
    
    $('#roundPill').textContent=(t('mode_names')||{})[gameMode]||gameMode;
    net.setState({phase:'wait',msg:T.watchScreen()});
    await Host.run(net,players,gameMode);
    showPackPicker();
  }

  async function showPackPicker(){
    Audio_.stopMusic();await FX.wipe();Host.hideHost();
    show('#scr-game');gameActive=true;document.getElementById('topbarBack')?.style.setProperty('visibility','visible');
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
      <button class="bar-btn" id="backToLobbyBtn" style="margin-top:2vmin">${T.backLobby()}</button>`);
    Audio_.unlock();
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
    if(resumeEl) resumeEl.textContent=gameActive?(LANG==='ar'?'استمر في اللعبة':'Resume Game'):(LANG==='ar'?'العب':'Play');
    if(leaveEl) leaveEl.textContent=gameActive?(LANG==='ar'?'اترك اللعبة':'Leave Game'):(LANG==='ar'?'الرئيسية':'Home');
    if(window.matchMedia('(max-width: 600px)').matches&&!document.body.classList.contains('menu-open')){
      _menuScrollY=window.scrollY;
      document.body.style.top=`-${_menuScrollY}px`;
      document.body.classList.add('menu-open');
    }
    $('#menuOverlay').classList.remove('hidden');
    Audio_.sfx.blip();
  }
  function closeMenu(){
    $('#menuOverlay').classList.add('hidden');
    if(document.body.classList.contains('menu-open')){
      document.body.classList.remove('menu-open');
      document.body.style.top='';
      window.scrollTo({top:_menuScrollY,left:0,behavior:'auto'});
    }
  }
  async function leaveGame(){
    try{sessionStorage.removeItem('hypox_session');}catch(e){}
    gameActive=false;
    window.__hypoxAbort = true;  // tells Host.run to stop after current await
    Host.stopSharedScreen?.();
    if(window.__hypoxSkip)window.__hypoxSkip();
    window.__hypoxSkip=null;
    const leavingNet=net;
    if(leavingNet)try{leavingNet.setState({phase:'wait',msg:''});}catch(e){}
    Audio_.stopMusic();
    currentRoomCode=null;net=null;players=[];
    document.body.classList.remove('phones-only-player');
    const hel=$('#host');if(hel)hel.classList.remove('show');
    document.getElementById('topbarBack')?.style.setProperty('visibility','hidden');
    show('#scr-title');
    $('#roundPill').style.visibility='hidden';
    $('#topbar').classList.remove('show');
    // menuBtn always visible (fixed position)
    if(leavingNet)try{await leavingNet.close();}catch(e){console.warn('Room cleanup failed',e);}
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
    $('#topbar').classList.add('show');
    const avatarBack=document.getElementById('topbarBack');
    if(avatarBack){
      avatarBack.style.setProperty('visibility','visible');
      avatarBack.onclick=()=>{
        Audio_.sfx.blip();
        avatarBack.style.setProperty('visibility','hidden');
        if(_avatarContext==='offline')show('#scr-lobby');else show('#scr-title');
      };
    }
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

  /* The Phones Only host answers below the shared game instead of receiving
     the pass-the-device privacy overlay used by One Device mode. */
  function phonesHostPrompt(spec){
    return new Promise(resolve=>{
      const dock=$('#hostInputDock');
      dock.classList.remove('hidden');
      let settled=false;
      const done=value=>{
        if(settled)return;settled=true;_ppDismiss=null;
        dock.classList.add('hidden');dock.innerHTML='';resolve(value);
      };
      _ppDismiss=()=>done(null);
      window.__hypoxDismissPP=()=>{if(_ppDismiss)_ppDismiss();};
      const hostSpec=spec.compactRebus?{...spec,context:''}:spec;
      Controller.render(dock,hostSpec,done);
      setTimeout(()=>dock.scrollIntoView({behavior:'smooth',block:'nearest'}),80);
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
    $('#joinErr').innerHTML='<div class="join-spinner"><div class="spinner-ring"></div><span>'+(LANG==='ar'?'جاري الاتصال...':'Joining...')+'</span></div>';
    try{net=FirebaseNet.create();const res=await net.joinRoom(code,name,selectedAvatar);myPid=res.pid;isVip=res.isVip;currentRoomCode=code;await net.getPlayMode();}
    catch(e){$('#joinErr').textContent=T.connFail();return;}
    // Save session so reconnect works after phone lock
    try{sessionStorage.setItem('hypox_session',JSON.stringify({code,name,emoji:selectedAvatar.emoji,color:selectedAvatar.color}));}catch(e){}
    show('#scr-controller');
    $('#topbar').classList.add('show');
    $('#roomCodeText').textContent=code;
    $('#roundPill').textContent='';$('#roundPill').style.visibility='hidden';
    $('#roundPill').style.visibility='visible';
    updateMenu();
    const ctrl=$('#ctrlArea');
    const shared=$('#phoneSharedStage');
    const sharedHost=$('#phoneSharedHost');
    const phonesOnly=net.playMode==='phones';
    document.body.classList.toggle('phones-only-player',phonesOnly);
    shared.dataset.gameStarted='';
    shared.classList.toggle('hidden',!phonesOnly);
    if(phonesOnly){
      shared.classList.remove('hidden');
      ctrl.classList.add('hidden');
    }else{
      // Fun animated waiting screen with rotating banter
      const banterLines = LANG==='ar'
        ? ['أهلاً! انتظر المضيف يبدأ…','تجمعوا وجهزوا أنفسكم!','راح تكون سهرة ما تُنسى!','خليك مستعد، اللعبة قريبة!','استرح… لكن ما راح يطول!']
        : ['You\'re in! Waiting for host…','Get ready — it\'s about to get fun!','Gather round, game starting soon!','Stay sharp, the host is loading up!','Almost time… don\'t get too comfortable!'];
      let banterIdx = 0;
      ctrl.innerHTML=`<div class="ctrl-wait-pet">
        <div class="pet-emoji">🐶</div>
        <div class="pet-msg" id="petMsg">${banterLines[0]}</div>
        <div class="pet-dots"><span>.</span><span>.</span><span>.</span></div>
      </div>`;
      const pets=['🐶','🐱','🐼','🦊','🐸','🐯','🦁','🐨'];
      let pi=0;
      const petEl=ctrl.querySelector('.pet-emoji');
      const msgEl=ctrl.querySelector('#petMsg');
      const petInterval=setInterval(()=>{
        if(!petEl||!ctrl.contains(petEl)){clearInterval(petInterval);return;}
        pi=(pi+1)%pets.length;
        banterIdx=(banterIdx+1)%banterLines.length;
        petEl.style.transform='scale(1.3) rotate(10deg)';
        setTimeout(()=>{
          if(petEl&&ctrl.contains(petEl)){
            petEl.textContent=pets[pi];
            petEl.style.transform='';
          }
          if(msgEl&&ctrl.contains(msgEl)) msgEl.textContent=banterLines[banterIdx];
        },150);
      },3000);
    }
    const mstrip=$('#phoneMirror');
    let _lastMirrorKey = '';
    function renderMirror(m){
      if(!m)return;
      // Update the small strip
      if(!phonesOnly)mstrip.classList.remove('hidden');
      if(m.pill!==undefined)$('#pmPill').textContent=m.pill||'';
      if(m.headline!==undefined)$('#pmHeadline').textContent=m.headline||'';
      if(m.speech!==undefined){$('#pmSpeech').textContent=m.speech||'';$('#pmLaith').style.display=m.speech?'flex':'none';}
      if(phonesOnly&&m.hostVisible&&m.speech){
        sharedHost.className=`phone-shared-host ${esc(m.hostColor||'host-purple')}`;
        sharedHost.innerHTML=`<div class="psh-face"><span class="psh-eye">•</span><span class="psh-eye">•</span><span class="psh-smile">⌣</span><span class="psh-bow">◆</span></div><div class="psh-speech"><div class="psh-name">${esc(m.hostName||'')}</div>${esc(m.speech)}</div>`;
      }else if(phonesOnly&&m.hostVisible===false){sharedHost.classList.add('hidden');}
      // Full-screen mirror: skip re-render if content unchanged (prevents emoji/score blinking)
      const mirrorKey = JSON.stringify({h:m.headline,s:m.sub,sc:m.scores?m.scores.length:0});
      if(!isInputActive() && (m.headline||m.scores) && mirrorKey !== _lastMirrorKey){
        _lastMirrorKey = mirrorKey;
        ctrl.innerHTML=buildMirrorHTML(m);
      }
    }
    function safeSharedHTML(html){
      const box=document.createElement('template');box.innerHTML=html||'';
      box.content.querySelectorAll('script,style,iframe,object,embed').forEach(el=>el.remove());
      box.content.querySelectorAll('*').forEach(el=>{
        [...el.attributes].forEach(a=>{if(/^on/i.test(a.name)||/javascript:/i.test(a.value))el.removeAttribute(a.name);});
        if(/^(BUTTON|INPUT|TEXTAREA|SELECT)$/.test(el.tagName)){el.disabled=true;el.tabIndex=-1;}
      });
      return box.innerHTML;
    }
    function renderShared(view){
      if(!phonesOnly||!view?.html)return;
      shared.innerHTML=safeSharedHTML(view.html);
      if(view.pill!==undefined)$('#roundPill').textContent=view.pill||'';
    }
    function renderSharedLobby(list){
      if(!phonesOnly||shared.dataset.gameStarted==='1')return;
      shared.innerHTML=`<div class="shared-lobby"><div class="lobby-title display">${LANG==='ar'?'اللاعبون':'PLAYERS'}</div><div class="shared-player-row">${list.map(p=>`<div class="player"><div class="avatar" style="background:${p.color}">${p.emoji}</div><div class="pname">${p.isVip?'👑 ':''}${esc(p.name)}</div></div>`).join('')}</div><div class="shared-lobby-count">${list.length}/20</div></div>`;
    }
    function buildMirrorHTML(m){
      return `<div class="ctrl-mirror">
        ${m.pill?`<div class="ctrl-mirror-pill">${esc(m.pill)}</div>`:''}
        ${m.headline?`<div class="ctrl-mirror-headline">${esc(m.headline)}</div>`:''}
        ${m.sub?`<div class="ctrl-mirror-sub">${esc(m.sub)}</div>`:''}
        ${m.speech?`<div class="ctrl-mirror-speech">"${esc(m.speech)}"</div>`:''}
        ${m.options?`<div class="ctrl-mirror-opts">${m.options.map(o=>`<div class="ctrl-mirror-opt" style="background:${o.color||'var(--card)'}">${esc(o.label)}</div>`).join('')}</div>`:''}
        ${m.scores?`<div class="ctrl-mirror-scores">${m.scores.map(s=>`<div class="ctrl-mirror-score-row"><span class="ctrl-mirror-score-name">${esc(s.medal||'')} ${esc(s.name)}</span><span class="ctrl-mirror-score-pts">${s.score}</span></div>`).join('')}</div>`:''}
        ${!m.scores?`<div class="ctrl-mirror-dots"><div class="pulse-dot"></div><div class="pulse-dot"></div><div class="pulse-dot"></div></div>`:''}
      </div>`;
    }
    function isInputActive() {
      // Active = has enabled (not locked) interactive elements
      const el = ctrl.querySelector('textarea:not([disabled]),input:not([disabled]),.ctrl-choice:not(.answered),.ctrl-map');
      return !!el;
    }
    net.onMirror(renderMirror);
    if(phonesOnly){
      net.onPlayers(renderSharedLobby);
      net.onSharedScreen(view=>{shared.dataset.gameStarted='1';renderShared(view);});
    }
    let lastPhaseId=null;
    net.onState(state=>{
      if(!state||state.phase==='hostLeft'){
        // Host left — go back to home
        ctrl.innerHTML=`<div class="ctrl-wrap" style="text-align:center;padding:30px 20px">
          <div style="font-size:48px">😢</div>
          <div style="font-family:'Fredoka One',sans-serif;font-size:20px;color:var(--text2);margin-top:12px">${LANG==='ar'?'المضيف غادر اللعبة':'Host left the game'}</div>
        </div>`;
        setTimeout(()=>{
          currentRoomCode=null;net=null;players=[];gameActive=false;
          show('#scr-title');
        },2500);
        return;
      }
      if(state.mirror)renderMirror(state.mirror);
      if(state.phase==='input'&&state.phaseId!==lastPhaseId){
        if(!state.targets||state.targets.includes(myPid)){
          lastPhaseId=state.phaseId;Audio_.sfx.sting();if(navigator.vibrate)navigator.vibrate(120);
          ctrl.classList.remove('hidden');
          const phoneSpec=phonesOnly&&state.spec.compactRebus?{...state.spec,context:''}:state.spec;
          Controller.render(ctrl,phoneSpec,value=>{net.submitInput(state.phaseId,value);setTimeout(()=>{if(phonesOnly){ctrl.classList.add('hidden');ctrl.innerHTML='';}else Controller.waitScreen(ctrl);},600);});
        }else if(phonesOnly){ctrl.classList.add('hidden');ctrl.innerHTML='';}else Controller.waitScreen(ctrl,T.watchScreen());
      }else if(state.phase==='input-split'&&state.phaseId!==lastPhaseId){
        lastPhaseId=state.phaseId;Audio_.sfx.sting();if(navigator.vibrate)navigator.vibrate(120);
        const rawSpec=state.specs[myPid]||state.specs._default;
        const spec=phonesOnly&&rawSpec.compactRebus?{...rawSpec,context:''}:rawSpec;
        ctrl.classList.remove('hidden');
        Controller.render(ctrl,spec,value=>{net.submitInput(state.phaseId,value);setTimeout(()=>{if(phonesOnly){ctrl.classList.add('hidden');ctrl.innerHTML='';}else Controller.waitScreen(ctrl);},600);});
      }else if(state.phase==='wait'||state.phase==='mirror'){
        // Show full game content on phone using mirror data
        if(phonesOnly){ctrl.classList.add('hidden');ctrl.innerHTML='';return;}
        const m = state.mirror||state;
        if(m.headline){
          if(!isInputActive()) ctrl.innerHTML=buildMirrorHTML(m);
        } else {
          if(!isInputActive()) Controller.waitScreen(ctrl,state.msg||T.watchScreen());
        }
      }else if(state.phase==='spy-roles'&&state.roles){
        const myRole=state.roles[myPid];
        if(myRole){
          ctrl.classList.remove('hidden');
          const isSpy=myRole.role==='spy';
          ctrl.innerHTML=`<div class="ctrl-wrap" style="text-align:center;padding:30px 20px">
            <div style="font-size:64px;margin-bottom:16px">${isSpy?'🕵️':'🤵'}</div>
            <div style="font-family:'Fredoka One',sans-serif;font-size:clamp(22px,6vw,30px);color:${isSpy?'var(--pink)':'var(--green)'}">
              ${isSpy?(LANG==='ar'?'أنت الجاسوس!':'YOU ARE THE SPY!'):(LANG==='ar'?'أنت عميل':'YOU ARE AN AGENT')}
            </div>
            <div style="font-size:clamp(15px,4vw,18px);margin-top:12px;color:var(--text2)">
              ${isSpy?(LANG==='ar'?'اكتشف الكلمة السرية من النقاش':'Find the secret word from discussion'):(LANG==='ar'?'الكلمة السرية: <strong style="color:var(--yellow)">'+myRole.word+'</strong>':'Secret word: <strong style="color:var(--yellow)">'+myRole.word+'</strong>')}
            </div>
            <div style="font-size:12px;color:var(--text3);margin-top:8px;opacity:.7">${LANG==='ar'?'احفظ دورك ثم اضغط':'Memorise your role, then tap'}</div>
            <button class="big-btn" id="spyGotItBtn" style="margin-top:20px;max-width:280px">✓ ${LANG==='ar'?'فهمت':'Got It'}</button>
          </div>`;
          if(isSpy)Audio_.sfx.buzzer();else Audio_.sfx.sting();
          // Keep role on screen until player taps Got It
          document.getElementById('spyGotItBtn')?.addEventListener('click',()=>{
            ctrl.innerHTML=`<div class="ctrl-wrap" style="text-align:center;padding:30px 20px">
              <div style="font-size:48px">🎭</div>
              <div style="font-family:'Fredoka One',sans-serif;font-size:20px;color:var(--text3);margin-top:12px">${LANG==='ar'?'انتظر وتابع النقاش':'Wait and follow the discussion'}</div>
            </div>`;
          },{once:true});
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
