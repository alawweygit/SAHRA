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
  const MODE_MIN = {bluff:3,wyr:3,interrogation:3,diss:4,quiz:2,trivia:2,pinpoint:2};
  const MODE_ICONS = {bluff:'🔍',wyr:'⚖️',interrogation:'🔦',diss:'🎤',quiz:'⚡',trivia:'📚',pinpoint:'📍'};
  const MODE_COLORS = {bluff:'#f472b6',wyr:'#60a5fa',interrogation:'#a78bfa',diss:'#fb923c',quiz:'#facc15',trivia:'#34d399',pinpoint:'#22d3ee'};
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
    applyTheme();
    applyLang();
    FX.init();
    buildTitleScreen();

    $('#soundBtn').addEventListener('click',e=>{const on=Audio_.toggle();e.target.textContent=on?'🔊':'🔇';});
    $('#themeBtn').addEventListener('click',()=>{setTheme(THEME==='dark'?'light':'dark');$('#themeBtn').textContent=THEME==='dark'?'🌙':'☀️';});
    $('#themeBtn').textContent=THEME==='dark'?'🌙':'☀️';
    $('#langBtn').addEventListener('click',()=>{
      setLang(LANG==='en'?'ar':'en');
      $('#langBtn').textContent=LANG==='en'?'عر':'EN';
      buildTitleScreen(); // rebuild with new language
    });
    $('#langBtn').textContent=LANG==='en'?'عر':'EN';
    $('#skipBtn').addEventListener('click',()=>{if(window.__hypoxSkip){window.__hypoxSkip();window.__hypoxSkip=null;}});
    $('#menuBtn').addEventListener('click',openMenu);
    $('#menuClose').addEventListener('click',closeMenu);
    $('#menuResume').addEventListener('click',closeMenu);
    $('#menuLeave').addEventListener('click',()=>{closeMenu();leaveGame();});

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
    $('#addLocalBtn').addEventListener('click',()=>showAvatarPicker('offline'));

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

    $$('.title-game-card').forEach(card=>card.addEventListener('click',()=>{
      Audio_.sfx.pop();Audio_.unlock();
      showPregame(card.dataset.mode);
    }));
  }

  function paintJoin(){
    $('#backFromJoin').textContent=T.back();
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
        <div class="pg-block">
          <div class="pg-label">${T.rounds()}</div>
          <div class="round-btns">
            ${[5,10,15].map(n=>`<button class="round-btn${window.HYPOX_STATE.rounds===n?' selected':''}" data-r="${n}">${n}</button>`).join('')}
          </div>
        </div>
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
          <button class="pmm-btn" id="pgHostBtn">
            <span class="pmm-icon">📺</span>
            <div><div class="pmm-name">${T.tvPhones()}</div><div class="pmm-sub">${T.tvSub()}</div></div>
          </button>
          <button class="pmm-btn feature" id="pgPhonesBtn">
            <span class="pmm-icon">📱</span>
            <div><div class="pmm-name">${T.phonesOnly()}</div><div class="pmm-sub">${T.phonesSub()}</div></div>
          </button>
          <button class="pmm-btn" id="pgOfflineBtn">
            <span class="pmm-icon">🤝</span>
            <div><div class="pmm-name">${T.oneDevice()}</div><div class="pmm-sub">${T.oneSub()}</div></div>
          </button>
        </div>
      </div>`;

    // Round buttons
    $$('.round-btn').forEach(btn=>btn.addEventListener('click',()=>{
      $$('.round-btn').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');window.HYPOX_STATE.rounds=+btn.dataset.r;Audio_.sfx.blip();
    }));
    $$('.content-btn:not(.pace-btn)').forEach(btn=>btn.addEventListener('click',()=>{
      $$('.content-btn:not(.pace-btn)').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');window.HYPOX_STATE.flavor=btn.dataset.flavor;Audio_.sfx.blip();
    }));
    $$('.pace-btn').forEach(btn=>btn.addEventListener('click',()=>{
      $$('.pace-btn').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');window.HYPOX_STATE.autoplay=btn.dataset.pace==='auto';Audio_.sfx.blip();
    }));
    if(isTrivia){
      $$('.cat-card-sm').forEach(btn=>btn.addEventListener('click',()=>{
        $$('.cat-card-sm').forEach(b=>b.classList.remove('selected'));
        btn.classList.add('selected');window.HYPOX_STATE.category=btn.dataset.cat;Audio_.sfx.blip();
      }));
    }

    document.getElementById('pgHostBtn').onclick=()=>startGameWithMode('tv',mode);
    document.getElementById('pgPhonesBtn').onclick=()=>startGameWithMode('phones',mode);
    document.getElementById('pgOfflineBtn').onclick=()=>startGameWithMode('offline',mode);

    const backBtn=$('#backFromPregame');
    backBtn.textContent=T.back();
    backBtn.onclick=()=>{Audio_.sfx.blip();show('#scr-title');};
  }

  /* ---- START GAME ---- */
  async function startGameWithMode(playMode,gameMode){
    Audio_.sfx.submit();hostMode=playMode;
    if(playMode!=='offline'&&!FirebaseNet.available()){Audio_.sfx.buzzer();alert(T.noFirebase());return;}
    if(net&&currentRoomCode&&!net.isOffline&&playMode!=='offline'){show('#scr-lobby');return;}
    net=createNet(playMode==='offline');
    if(playMode==='offline'&&!net.isOffline)net=new LocalNet();
    if(net.isOffline)net.promptLocal=passAndPlayPrompt;
    const code=await net.createRoom(LANG);
    currentRoomCode=code;
    $('#roomCodeText').textContent=net.isOffline?(LANG==='ar'?'مرّر الجوال':'PASS & PLAY'):code;
    $('#topbar').classList.add('show');
    $('#menuBtn').classList.remove('hidden');
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
  }

  function setupLobby(gameMode){
    gameActive=false;
    $('#localAdd').classList.toggle('hidden',!net.isOffline);
    $('#addLocalBtn').textContent=T.addPlayer();
    $('#startGameBtn').textContent=T.startGame();
    if(!net.isOffline&&currentRoomCode){
      const siteUrl=window.location.origin+window.location.pathname;
      const joinUrl=`${siteUrl}?room=${currentRoomCode}`;
      $('#joinHint').innerHTML=`<div class="lobby-share">
        <div class="share-code"><b>${currentRoomCode}</b></div>
        <div class="share-btns">
          <button class="bar-btn" id="copyLinkBtn">${T.copyLink()}</button>
          <button class="bar-btn" id="showQrBtn">${T.qrCode()}</button>
        </div>
        <div id="qrArea" class="hidden"></div>
      </div>`;
      $('#copyLinkBtn').onclick=()=>{
        navigator.clipboard.writeText(joinUrl).then(()=>{$('#copyLinkBtn').textContent=T.copied();setTimeout(()=>$('#copyLinkBtn').textContent=T.copyLink(),2000);});
        Audio_.sfx.submit();
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
    show('#scr-game');gameActive=true;$('#skipBtn').classList.remove('hidden');$('#menuBtn').classList.remove('hidden');
    $('#skipBtn').textContent=T.skip();
    $('#roundPill').textContent=(t('mode_names')||{})[gameMode]||gameMode;
    net.setState({phase:'wait',msg:T.watchScreen()});
    await Host.run(net,players,gameMode);
    showPackPicker();
  }

  async function showPackPicker(){
    Audio_.stopMusic();await FX.wipe();Host.hideHost();
    show('#scr-game');gameActive=true;$('#skipBtn').classList.add('hidden');
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
  function openMenu(){$('#menuOverlay').classList.remove('hidden');Audio_.sfx.blip();}
  function closeMenu(){$('#menuOverlay').classList.add('hidden');}
  function leaveGame(){
    gameActive=false;window.__hypoxSkip=null;Audio_.stopMusic();
    currentRoomCode=null;net=null;players=[];
    show('#scr-title');$('#topbar').classList.remove('show');
    $('#menuBtn').classList.add('hidden');$('#skipBtn').classList.add('hidden');
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
    if(net&&net.isOffline){const p=net.addLocalPlayer(name,selectedAvatar);if(p)show('#scr-lobby');}
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
    $('#menuBtn').classList.remove('hidden');
    updateMenu();
    const ctrl=$('#ctrlArea');
    Controller.waitScreen(ctrl,isVip?T.youreHost():T.youreIn());
    const mstrip=$('#phoneMirror');
    function renderMirror(m){
      if(!m)return;mstrip.classList.remove('hidden');
      if(m.pill!==undefined)$('#pmPill').textContent=m.pill||'';
      if(m.headline!==undefined)$('#pmHeadline').textContent=m.headline||'';
      if(m.speech!==undefined){$('#pmSpeech').textContent=m.speech||'';$('#pmLaith').style.display=m.speech?'flex':'none';}
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
        Controller.waitScreen(ctrl,state.msg||T.watchScreen());
      }else if(state.phase==='winner'){
        ctrl.innerHTML=`<div class="ctrl-wrap"><div class="crown">👑</div><div class="ctrl-title display">${state.emoji} ${esc(state.name)}</div><div class="ctrl-sub">${T.winner()}</div></div>`;
        Audio_.sfx.fanfare();
      }
    });
  }
})();
