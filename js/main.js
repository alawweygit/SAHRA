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
  const MODE_MIN = {bluff:3,wyr:3,interrogation:3,diss:3,trivia:2,pinpoint:2,emoji:2,year:2,mostlikely:3,trueorlie:2,flaghunt:2,higherlow:2,'2t1l':3,emojiplace:2,spy:3};
  const MODE_ICONS = {bluff:'🔍',wyr:'⚖️',interrogation:'🔥',diss:'🎤',trivia:'⚡',pinpoint:'📍',emoji:'🧩',year:'⏳',mostlikely:'🏆',trueorlie:'✅',flaghunt:'🚩',higherlow:'📊','2t1l':'🤥',emojiplace:'🌍',spy:'🕵️'};
  const MODE_COLORS = {bluff:'#f472b6',wyr:'#60a5fa',interrogation:'#ff6b35',diss:'#fb923c',trivia:'#facc15',pinpoint:'#22d3ee',emoji:'#e879f9',year:'#fbbf24',mostlikely:'#f43f5e',trueorlie:'#10b981',flaghunt:'#ef4444',higherlow:'#8b5cf6','2t1l':'#f97316',emojiplace:'#06b6d4',spy:'#64748b'};
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

  function showHypoxHeader(){
    $('#topbar').classList.add('show');
    $('#roundPill').innerHTML='<span class="logo-letters display" style="justify-content:center;gap:3px;font-size:clamp(16px,3.5vw,22px)"><span class="logo-lt" style="--i:0">H</span><span class="logo-lt" style="--i:1">Y</span><span class="logo-lt" style="--i:2">P</span><span class="logo-lt" style="--i:3">O</span><span class="logo-lt" style="--i:4">X</span></span>';
    $('#roundPill').style.cssText='visibility:visible;background:none;border:none;box-shadow:none;';
    document.getElementById('topbarBack')?.style.setProperty('visibility','hidden');
  }
  let net=null, players=[], myPid=null, isVip=false, hostMode='tv';
  let currentGameMode=null,currentPregameMode=null,currentViewKind='title';
  let selectedAvatar=AVATARS_LIST[0];
  let _ppDismiss=null, _avatarCallback=null, _avatarContext=null;
  let gameActive=false, currentRoomCode=null;
  let _menuScrollY=0;
  if('scrollRestoration' in history)history.scrollRestoration='manual';

  function resetScrollPosition(){
    const scrollingElement=document.scrollingElement;
    const targets=[
      scrollingElement,document.documentElement,document.body,
      ...$$('.screen,#hostStage,#scr-controller,#phoneSharedStage,#ctrlArea,#ppOverlay,.host-input-dock,.menu-card')
    ];
    targets.forEach(el=>{
      if(!el)return;
      el.scrollTop=0;
      el.scrollLeft=0;
    });
    window.scrollTo(0,0);
  }

  function resetScrollPositionAfterLayout(){
    resetScrollPosition();
    requestAnimationFrame(()=>{
      resetScrollPosition();
      requestAnimationFrame(resetScrollPosition);
    });
    setTimeout(resetScrollPosition,80);
    setTimeout(resetScrollPosition,240);
    setTimeout(resetScrollPosition,600);
    setTimeout(resetScrollPosition,1200);
  }
  // Host scenes live in a separate module, so expose one shared reset hook.
  // Every logical screen change uses this instead of relying on Safari's
  // remembered position for whichever element currently owns scrolling.
  window.__hypoxResetScroll=resetScrollPositionAfterLayout;

  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) && /WebKit/.test(navigator.userAgent);

  const show=id=>{
    $$('.screen').forEach(s=>{s.classList.remove('active');s.scrollTop=0;});
    const _sel=$(id);if(_sel){_sel.classList.add('active');_sel.scrollTop=0;requestAnimationFrame(()=>{_sel.scrollTop=0;requestAnimationFrame(()=>{_sel.scrollTop=0;});});}
    if(id==='#scr-title')currentViewKind='title';
    else if(id==='#scr-games')currentViewKind='games';
    else if(id==='#scr-join')currentViewKind='join';
    else if(id==='#scr-controller')currentViewKind='controller';
    resetScrollPositionAfterLayout();
    saveNavigationState(id.replace(/^#/,''));
    // iOS scroll: force top on every transition
    window.scrollTo({top:0,left:0,behavior:'auto'});
    window.scrollTo({top:0,left:0,behavior:'auto'});
    document.documentElement.scrollTop=0;
    document.body.scrollTop=0;
  };
  const $=s=>document.querySelector(s);
  const $$=s=>Array.from(document.querySelectorAll(s));
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.esc=esc;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));

  const NAV_STATE_KEY='hypox_navigation_v1';
  function navigationState(screenId){
    const active=screenId||document.querySelector('.screen.active')?.id||'scr-title';
    return {
      screen:active,
      viewKind:currentViewKind,
      pregameMode:currentPregameMode,
      gameMode:currentGameMode,
      playMode:hostMode,
      gameActive,
      roomCode:currentRoomCode,
      role:net?(net.isOffline||net.isRoomOwner?'host':'player'):null,
      hostSelfPid:net?.hostSelfPid||null,
      players:net?.isOffline?players.map(player=>({...player})):null,
      hypoxState:{...window.HYPOX_STATE},
      joinCode:document.getElementById('joinCode')?.value||'',
      joinName:document.getElementById('joinName')?.value||'',
      avatarContext:_avatarContext||null,
      savedAt:Date.now(),
    };
  }
  function saveNavigationState(screenId){
    try{sessionStorage.setItem(NAV_STATE_KEY,JSON.stringify(navigationState(screenId)));}catch(e){}
  }
  function readNavigationState(){
    try{
      const saved=JSON.parse(sessionStorage.getItem(NAV_STATE_KEY)||'null');
      return saved&&Date.now()-(saved.savedAt||0)<30*60*1000?saved:null;
    }catch(e){return null;}
  }

  async function restoreNavigationState(){
    const saved=readNavigationState();
    if(!saved||saved.screen==='scr-title')return false;
    // Safety timeout — if restore hangs, fall back to title after 5s
    const _safetyTimer=setTimeout(()=>{
      document.getElementById('restoreLoader')?.remove();
      document.querySelectorAll('.screen').forEach(s=>{s.style.opacity='';s.style.pointerEvents='';});
      show('#scr-title');
    },5000);
    const _origRemove=()=>clearTimeout(_safetyTimer);
    // Hide all screens instantly to prevent flash while restoring
    const _allScreens=document.querySelectorAll('.screen');
    _allScreens.forEach(s=>{s.style.opacity='0';s.style.pointerEvents='none';});
    // Show loading overlay
    const _loader=document.createElement('div');
    _loader.id='restoreLoader';
    _loader.style.cssText='position:fixed;inset:0;z-index:9999;background:var(--bg);display:flex;align-items:center;justify-content:center;';
    _loader.innerHTML='<svg width="40" height="40" viewBox="0 0 24 24" fill="none" style="animation:spin 0.8s linear infinite"><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.2)" stroke-width="3"/><path d="M12 2a10 10 0 0 1 10 10" stroke="#ff3d8a" stroke-width="3" stroke-linecap="round"/></svg>';
    document.body.appendChild(_loader);
    const _removeLoader=()=>{
      clearTimeout(_safetyTimer);
      document.getElementById('restoreLoader')?.remove();
      _allScreens.forEach(s=>{s.style.opacity='';s.style.pointerEvents='';});
    };
    if(saved.hypoxState)window.HYPOX_STATE={...window.HYPOX_STATE,...saved.hypoxState};
    currentPregameMode=saved.pregameMode||null;
    currentGameMode=saved.gameMode||saved.pregameMode||null;
    hostMode=saved.playMode||'tv';

    // A joined phone keeps its Firebase player id, so a refresh reconnects the
    // same player instead of creating a duplicate entry or going home.
    if(saved.role==='player'&&saved.roomCode&&FirebaseNet.available()){
      try{
        const session=JSON.parse(sessionStorage.getItem('hypox_session')||'null');
        if(!session?.pid)throw new Error('missing-player-session');
        net=FirebaseNet.create();
        const resumed=await net.resumePlayer(saved.roomCode,session.pid);
        myPid=resumed.pid;isVip=resumed.isVip;currentRoomCode=saved.roomCode;
        selectedAvatar={emoji:session.emoji||resumed.player.emoji,color:session.color||resumed.player.color};
        _removeLoader();
        openPlayerController();
        // Show reconnect toast
        setTimeout(()=>{
          const _t=document.createElement('div');
          _t.style.cssText='position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:500;background:var(--card);border:2px solid #4ade80;border-radius:20px;padding:10px 22px;font-family:Fredoka One,sans-serif;font-size:15px;color:#4ade80;';
          _t.textContent=LANG==='ar'?'✓ عدت للعبة!':'✓ Back in the game!';
          document.body.appendChild(_t);
          setTimeout(()=>_t.remove(),3000);
        },500);
        return true;
      }catch(e){
        net=null;currentRoomCode=null;
        showHypoxHeader();paintJoin();
        $('#joinCode').value=saved.roomCode||saved.joinCode||'';
        $('#joinName').value=saved.joinName||'';
        $('#joinErr').textContent=LANG==='ar'?'انتهت الغرفة. يمكنك الانضمام من جديد.':'That room ended. You can join again.';
        // Session missing — go home instead of join screen
        _removeLoader();
        show('#scr-title');
        return true;
      }
    }

    // The room is intentionally kept during an unexpected reload. Reattach
    // the host, preserve all players, then reopen the same game area.
    if(saved.role==='host'&&saved.roomCode&&saved.roomCode!=='LOCAL'&&FirebaseNet.available()){
      try{
        net=FirebaseNet.create();
        const resumed=await net.resumeHost(saved.roomCode,saved.hostSelfPid||null);
        players=resumed.players||[];hostMode=resumed.playMode||saved.playMode||'tv';
        net.phonesOnly=hostMode==='phones';net.hostSelfPid=saved.hostSelfPid||null;
        myPid=saved.hostSelfPid||null;currentRoomCode=saved.roomCode;
        window.__hypoxAbort=false;
        show('#scr-lobby');setupLobby(currentGameMode);
        if(saved.viewKind==='game'&&currentGameMode)setTimeout(()=>startDirectGame(currentGameMode),0);
        else if(saved.viewKind==='pack-picker')setTimeout(()=>showPackPicker(),0);
        return true;
      }catch(e){
        net=null;currentRoomCode=null;players=[];
      }
    }

    if(saved.role==='host'&&saved.roomCode==='LOCAL'){
      net=new LocalNet();
      net.players=Array.isArray(saved.players)?saved.players.map(player=>({...player})):[];
      net.promptLocal=passAndPlayPrompt;players=net.players.slice();
      currentRoomCode='LOCAL';hostMode='offline';window.__hypoxAbort=false;
      show('#scr-lobby');setupLobby(currentGameMode);
      if(saved.viewKind==='game'&&currentGameMode)setTimeout(()=>startDirectGame(currentGameMode),0);
      else if(saved.viewKind==='pack-picker')setTimeout(()=>showPackPicker(),0);
      return true;
    }

    if(saved.screen==='scr-games'){
      document.getElementById('heroStart')?.click();
      return true;
    }
    if(saved.screen==='scr-pregame'&&currentPregameMode){
      document.getElementById('heroStart')?.click();
      showPregame(currentPregameMode);
      const modeButton={tv:'pgHostBtn',phones:'pgPhonesBtn',offline:'pgOfflineBtn'}[hostMode];
      if(modeButton)document.getElementById(modeButton)?.click();
      return true;
    }
    if(saved.screen==='scr-join'){
      showHypoxHeader();paintJoin();
      $('#joinCode').value=saved.joinCode||saved.roomCode||'';
      $('#joinName').value=saved.joinName||'';
      show('#scr-join');
      return true;
    }
    // Non-serializable avatar callbacks cannot be recreated safely; return to
    // the nearest setup screen instead of unexpectedly sending the user home.
    if(saved.screen==='scr-avatar'&&currentPregameMode){
      document.getElementById('heroStart')?.click();showPregame(currentPregameMode);
      return true;
    }
    return false;
  }

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
    // iOS reload-to-top: if we reloaded to fix scroll, jump to target screen
    try{
      const _goto=sessionStorage.getItem('hypox_goto');
      if(_goto){
        sessionStorage.removeItem('hypox_goto');
        applyTheme();applyLang();FX.init();
        buildTitleScreen();
        requestAnimationFrame(()=>{
          window.scrollTo({top:0,left:0,behavior:'auto'});
          document.documentElement.scrollTop=0;
          document.body.scrollTop=0;
          // Only safe screens to jump to directly
          if(_goto==='#scr-controller'||_goto==='#scr-game'||_goto==='#scr-lobby'){restoreNavigationState();}
          else if(_goto==='#scr-title'){show('#scr-title');}
          else{show(_goto);}
        });
        return;
      }
    }catch(e){}
    // Expose show() globally for host.js to use
    window.__hypoxShowScreen = show;
    applyTheme();
    applyLang();
    FX.init();
    $('#roundPill').style.visibility='hidden';
    buildTitleScreen();
    setTimeout(()=>FX.burst(70),650);
    // Warm up Railway backend immediately so it's ready when game starts
    const _cfg = window.HYPOX_CONFIG||{};
    if(_cfg.aiEndpoint) fetch(_cfg.aiEndpoint.replace('/api/prompts','/health'),{method:'GET'}).catch(()=>{});
    // Pre-fill join form if session was saved (run after buildJoinAvatarRow)
    setTimeout(()=>{
      try{
        const saved=sessionStorage.getItem('hypox_session');
        if(saved){
          const s=JSON.parse(saved);
          if(s.code&&s.name&&!s.pid&&FirebaseNet.available()){
            const jc=$('#joinCode'),jn=$('#joinName');
            if(jc)jc.value=s.code;
            if(jn)jn.value=s.name;
            if(s.emoji){
              selectedAvatar={emoji:s.emoji,color:s.color||'#ff3d8a'};
              $$('.join-av').forEach(b=>{if(b.textContent.trim()===s.emoji)b.classList.add('selected');});
            }
            const banner=document.createElement('div');
            banner.id='reconnectBanner';
            banner.style.cssText='position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:999;background:var(--card);border:1.5px solid var(--yellow);border-radius:40px;padding:8px 20px;font-family:"Fredoka One",sans-serif;font-size:14px;color:var(--yellow);cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,0.4)';
            banner.textContent=`↩ Rejoin ${s.code}`;
            banner.onclick=()=>{banner.remove();show('#scr-join');};
            document.body.appendChild(banner);
            setTimeout(()=>banner?.remove(),8000);
          }
        }
      }catch(e){}
    },100); // welcome confetti on landing

    // Resume room banner for host after page reload
    try{
      const _resume=JSON.parse(sessionStorage.getItem('hypox_resume')||'null');
      const _noPlayerSession=!sessionStorage.getItem('hypox_session');
      if(_resume&&_resume.code&&_noPlayerSession&&Date.now()-(_resume.savedAt||0)<2*60*60*1000&&FirebaseNet.available()){
        const _rb=document.createElement('div');
        _rb.id='resumeRoomBanner';
        _rb.style.cssText='position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:999;background:var(--card);border:2px solid var(--yellow);border-radius:20px;padding:14px 20px;font-family:Fredoka One,sans-serif;font-size:15px;color:var(--text);box-shadow:0 4px 24px rgba(0,0,0,0.5);display:flex;flex-direction:column;align-items:center;gap:10px;min-width:260px;text-align:center;';
        _rb.innerHTML='<div style="color:var(--yellow);font-size:17px">'+(LANG==='ar'?'استأنف الغرفة؟':'Resume Room?')+'</div><div style="color:var(--text2);font-size:13px">'+(LANG==='ar'?'كود الغرفة:':'Room code:')+'&nbsp;<b style="color:var(--yellow)">'+_resume.code+'</b></div><div style="display:flex;gap:10px"><button id="resumeYes" style="background:var(--yellow);color:#000;border:none;border-radius:12px;padding:8px 22px;font-family:Fredoka One,sans-serif;font-size:15px;cursor:pointer">'+(LANG==='ar'?'استأنف ▶':'Resume ▶')+'</button><button id="resumeNo" style="background:var(--card2,#2a2a3e);color:var(--text2);border:1.5px solid var(--border);border-radius:12px;padding:8px 18px;font-family:Fredoka One,sans-serif;font-size:14px;cursor:pointer">'+(LANG==='ar'?'لا، شكراً':'No thanks')+'</button></div>';
        document.body.appendChild(_rb);
        document.getElementById('resumeNo').onclick=()=>{
          sessionStorage.removeItem('hypox_resume');
          _rb.remove();
        };
        document.getElementById('resumeYes').onclick=async()=>{
          _rb.remove();
          sessionStorage.removeItem('hypox_resume');
          try{
            net=FirebaseNet.create();
            const resumed=await net.resumeHost(_resume.code,_resume.hostSelfPid||null);
            players=resumed.players||[];
            hostMode=resumed.playMode||'tv';
            net.phonesOnly=hostMode==='phones';
            net.hostSelfPid=_resume.hostSelfPid||null;
            myPid=_resume.hostSelfPid||null;
            currentRoomCode=_resume.code;
            currentGameMode=_resume.mode||null;
            window.__hypoxAbort=false;
            show('#scr-lobby');
            setupLobby(currentGameMode);
            requestAnimationFrame(()=>{const _ls=document.getElementById('scr-lobby');if(_ls){_ls.scrollTop=0;requestAnimationFrame(()=>{_ls.scrollTop=0;});}});
          }catch(e){
            net=null;currentRoomCode=null;players=[];
            alert(LANG==='ar'?'انتهت الغرفة.':'That room has ended.');
          }
        };
        setTimeout(()=>_rb?.remove(),15000);
      }
    }catch(e){}

    $('#soundBtn').addEventListener('click',e=>{const on=Audio_.toggle();e.target.textContent=on?'🔊':'🔇';});
    $('#themeBtn').addEventListener('click',()=>{setTheme(THEME==='dark'?'light':'dark');$('#themeBtn').textContent=THEME==='dark'?'🌙':'☀️';});
    $('#themeBtn').textContent=THEME==='dark'?'🌙':'☀️';
    $('#langBtn').addEventListener('click',()=>{
      setLang(LANG==='en'?'ar':'en');
      $('#langBtn').textContent=LANG==='en'?'عر':'EN';
      // Save current screen so we return to it after reload
      const _activeScreen=document.querySelector('.screen.active');
      if(_activeScreen)try{sessionStorage.setItem('hypox_goto','#'+_activeScreen.id);}catch(e){}
      location.reload();
    });
    $('#langBtn').textContent=LANG==='en'?'عر':'EN';
    $('#menuBtn').addEventListener('click',openMenu);

    $('#menuClose').addEventListener('click',closeMenu);
    $('#menuResume').addEventListener('click',closeMenu);
    $('#menuLeave').addEventListener('click',()=>{
      closeMenu();
      if(gameActive||currentRoomCode){
        const _conf=document.createElement('div');
        _conf.style.cssText='position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;';
        _conf.innerHTML='<div style="background:var(--card);border:2px solid var(--border-hi);border-radius:24px;padding:28px 24px;max-width:320px;width:90%;text-align:center;font-family:Fredoka One,sans-serif"><div style="font-size:20px;color:var(--text);margin-bottom:8px">'+(LANG==='ar'?'تريد تغادر؟':'Leave the game?')+'</div><div style="font-size:14px;color:var(--text2);margin-bottom:20px">'+(LANG==='ar'?'اللاعبين الثانيين بيكملون':'Other players will continue')+'</div><div style="display:flex;gap:12px;justify-content:center"><button id="_confYes" style="background:var(--pink);color:#fff;border:none;border-radius:14px;padding:10px 28px;font-family:Fredoka One,sans-serif;font-size:16px;cursor:pointer">'+(LANG==='ar'?'اغادر':'Leave')+'</button><button id="_confNo" style="background:var(--card2,#2a2a3e);color:var(--text2);border:1.5px solid var(--border);border-radius:14px;padding:10px 28px;font-family:Fredoka One,sans-serif;font-size:16px;cursor:pointer">'+(LANG==='ar'?'ارجع':'Stay')+'</button></div></div>';
        document.body.appendChild(_conf);
        document.getElementById('_confYes').onclick=()=>{_conf.remove();leaveGame();};
        document.getElementById('_confNo').onclick=()=>_conf.remove();
      }else{show('#scr-title');}
    });
    // Join screen — build mini avatar picker
    buildJoinAvatarRow();
    $('#joinGo').addEventListener('click',joinAsPlayer);
    $('#joinCode').addEventListener('keydown',e=>{if(e.key==='Enter')$('#joinName').focus();});
    $('#joinName').addEventListener('keydown',e=>{if(e.key==='Enter')joinAsPlayer();});

    // Avatar
    buildAvatarGrid();
    $('#avatarDone').addEventListener('click',()=>{
      const name=$('#avatarName').value.trim();
      if(!name){$('#avatarName').classList.add('shake');setTimeout(()=>$('#avatarName').classList.remove('shake'),500);return;}
      if(!selectedAvatar){return;}
      const btn=$('#avatarDone');
      btn.disabled=true;btn.innerHTML='<span style="display:inline-flex;align-items:center;gap:8px"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="animation:spin 0.8s linear infinite"><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" stroke-width="3"/><path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>'+(LANG==='ar'?'جاري...':'Loading...')+'</span>';
      confirmAvatar();
    });
    $('#avatarName').addEventListener('keydown',e=>{if(e.key==='Enter')confirmAvatar();});

    // Lobby
    $('#addLocalBtn').addEventListener('click',()=>{
      if(!net||!net.isOffline){console.warn('Not in offline mode');return;}
      showAvatarPicker('offline');
    });

    // URL auto-join
    const urlParams=new URLSearchParams(window.location.search);
    const urlCode=urlParams.get('room');
    // Clear saved nav state when opening via QR/link so spinner never blocks
    if(urlCode){try{sessionStorage.removeItem(NAV_STATE_KEY);}catch(e){}}
    const savedNav=readNavigationState();
    if(urlCode&&savedNav?.roomCode!==urlCode.toUpperCase()){$('#joinCode').value=urlCode.toUpperCase();showHypoxHeader();paintJoin();show('#scr-join');}
    // Player rejoin banner — shows if tab was closed but localStorage has a session
    const _ps=JSON.parse(localStorage.getItem('hypox_player_session')||'null');
    const _noSession=!sessionStorage.getItem('hypox_session');
    if(_ps&&_ps.code&&_ps.pid&&_noSession&&FirebaseNet.available()&&!urlCode){
      const _pb=document.createElement('div');
      _pb.id='playerRejoinBanner';
      _pb.style.cssText='position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:999;background:var(--card);border:2px solid var(--pink);border-radius:20px;padding:16px 22px;font-family:Fredoka One,sans-serif;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.5);min-width:260px;';
      _pb.innerHTML='<div style="color:var(--pink);font-size:17px">'+(LANG==='ar'?'تريد ترجع للعبة؟':'Rejoin the game?')+'</div><div style="color:var(--text2);font-size:13px;margin:4px 0 12px">'+(LANG==='ar'?'الغرفة:':'Room:')+'&nbsp;<b style="color:var(--yellow)">'+_ps.code+'</b></div><div style="display:flex;gap:10px;justify-content:center"><button id="rejoinYes" style="background:var(--pink);color:#fff;border:none;border-radius:12px;padding:8px 22px;font-family:Fredoka One,sans-serif;font-size:15px;cursor:pointer">'+(LANG==='ar'?'ارجع ▶':'Rejoin ▶')+'</button><button id="rejoinNo" style="background:var(--card2,#2a2a3e);color:var(--text2);border:1.5px solid var(--border);border-radius:12px;padding:8px 18px;font-family:Fredoka One,sans-serif;font-size:14px;cursor:pointer">'+(LANG==='ar'?'لا':'No')+'</button></div>';
      document.body.appendChild(_pb);
      document.getElementById('rejoinNo').onclick=()=>{localStorage.removeItem('hypox_player_session');_pb.remove();};
      document.getElementById('rejoinYes').onclick=async()=>{
        _pb.remove();
        try{
          sessionStorage.setItem('hypox_session',JSON.stringify(_ps));
          await restoreNavigationState();
        }catch(e){localStorage.removeItem('hypox_player_session');show('#scr-title');}
      };
      setTimeout(()=>_pb?.remove(),20000);
    } else if(!urlCode) restoreNavigationState();
    window.addEventListener('pagehide',()=>saveNavigationState());
    window.addEventListener('beforeunload',()=>saveNavigationState());
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
    if(joinBtn){joinBtn.textContent=T.joinGame();joinBtn.onclick=()=>{Audio_.sfx.blip();showHypoxHeader();show('#scr-join');paintJoin();};}
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
    currentPregameMode=mode;currentGameMode=mode;currentViewKind='pregame';
    document.getElementById('pgStickyBar')?.remove(); // clean up from previous
    // Start AI preload immediately when user picks a game — maximizes loading time
    try{
      const _cfg=window.HYPOX_CONFIG||{};
      if(_cfg.aiEndpoint&&window.Content){
        const _cm=mode==='trivia'?'quiz':mode;
        window.Content.preload(_cm,LANG,window.HYPOX_STATE?.rounds||5).catch(()=>{});
      }
    }catch(e){}
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
      selectedPlayMode=playMode;hostMode=playMode;
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
      // Show content-ready indicator on the button
      const _cm2=mode==='trivia'?'quiz':mode;
      const _preloadPromise=window.Content?window.Content.preload(_cm2,LANG,window.HYPOX_STATE?.rounds||5):null;
      startBtn.textContent=LANG==='ar'?'▶ ابدأ اللعبة':'▶ START GAME';
      startBtn.onclick=async()=>{
        if(!selectedPlayMode){alert(LANG==='ar'?'اختر طريقة اللعب أولاً':'Please select how you are playing first');return;}
        startBtn.disabled=true;
        // Show full-screen loading spinner while AI prepares
        const _sl=document.createElement('div');
        _sl.id='startLoader';
        _sl.style.cssText='position:fixed;inset:0;z-index:9999;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;';
        _sl.innerHTML='<svg width="56" height="56" viewBox="0 0 24 24" fill="none" style="animation:spin 0.8s linear infinite"><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.2)" stroke-width="3"/><path d="M12 2a10 10 0 0 1 10 10" stroke="#ff3d8a" stroke-width="3" stroke-linecap="round"/></svg><div style="font-family:Fredoka One,sans-serif;font-size:18px;color:var(--text2)">'+(LANG==='ar'?'جاري تحضير الأسئلة…':'Preparing questions…')+'</div>';
        document.body.appendChild(_sl);
        // Wait up to 20s for AI, then start anyway
        const _cm2=mode==='trivia'?'quiz':mode;
        if(window.Content){
          try{await window.Content.preload(_cm2,LANG,window.HYPOX_STATE?.rounds||5);}catch(e){}
        }
        _sl.remove();
        startBtn.disabled=false;
        startGameWithMode(selectedPlayMode,mode);
      };
      saveNavigationState('scr-pregame');
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
    window._hypoxIsHost=true;
    Audio_.sfx.submit();hostMode=playMode;currentGameMode=gameMode;currentViewKind='starting';
    window.__hypoxAbort=false;
    window.__hypoxSkip=null;
    // Show loading on button immediately so user knows tap worked
    const startBtn=document.getElementById('pgStartBtn');
    if(startBtn){
      startBtn.innerHTML=`<span class="hypox-spinner" aria-hidden="true"></span><span>${LANG==='ar'?'جاري...':'Starting...'}</span>`;
      startBtn.classList.add('is-loading');
      startBtn.setAttribute('aria-busy','true');
      startBtn.disabled=true;
    }
    const restoreBtn=()=>{if(startBtn){startBtn.textContent=LANG==='ar'?'▶ ابدأ اللعبة':'▶ START GAME';startBtn.classList.remove('is-loading');startBtn.removeAttribute('aria-busy');startBtn.disabled=false;}};
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
    if(net&&net.startHeartbeat&&net.pid)net.startHeartbeat();
    show('#scr-lobby');setupLobby(gameMode);requestAnimationFrame(()=>{const _ls=document.getElementById('scr-lobby');if(_ls){_ls.scrollTop=0;requestAnimationFrame(()=>{_ls.scrollTop=0;});}});
  }

  function setupLobby(gameMode){
    gameActive=false;currentGameMode=gameMode;currentViewKind='lobby';
    saveNavigationState('scr-lobby');
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
    // Add Bot button for testing
    let addBotBtn=document.getElementById('addBotBtn');
    if(!addBotBtn&&!isOff&&net.addBot){
      addBotBtn=document.createElement('button');
      addBotBtn.id='addBotBtn';
      addBotBtn.className='bar-btn';
      addBotBtn.style.cssText='margin-top:8px;display:block;margin-left:auto;margin-right:auto;opacity:0.7;font-size:13px;';
      addBotBtn.textContent='🤖 Add Bot (testing)';
      addBotBtn.onclick=async()=>{
        const botNames=['HAL','R2D2','JARVIS','ARIS','NOVA','ZARA','MAX'];
        const botAvatars=[{emoji:'🤖',color:'#b78bff'},{emoji:'👾',color:'#2de1fc'},{emoji:'🦾',color:'#7dff6a'}];
        const av=botAvatars[Math.floor(Math.random()*botAvatars.length)];
        const name=botNames[Math.floor(Math.random()*botNames.length)];
        const botPid='bot_'+Date.now();
        Audio_.sfx.pop();
        await net.addBot(botPid,name,av);
      };
      document.getElementById('scr-lobby').appendChild(addBotBtn);
    }
    // Back button via topbarBack (top-left) — not bottom
    // Presence monitoring — update player row colors when online/offline status changes
    if(net&&net.onPresence){
      net.onPresence(status=>{
        window._hypoxPresence=status;
        // re-render player row with new status (reuses existing list)
        if(net._players){
          const _ls=document.getElementById('scr-lobby');
          const _prevScroll=_ls?_ls.scrollTop:0;
          const _pStatus=status||{};
          const row=document.getElementById('playerRow');
          if(row){
            row.innerHTML=net._players.map(p=>{
              const _offline=_pStatus[p.pid]==='away'||_pStatus[p.pid]==='offline';
              const _isHost=net.isRoomOwner||net.isOffline;
              const _xBtn=_isHost&&!p.isVip?`<button class="kick-btn" data-pid="${p.pid}" title="Remove" style="background:none;border:none;color:var(--text3);font-size:13px;cursor:pointer;padding:2px 4px;line-height:1;margin-left:4px">✕</button>`:'';
              return `<div class="player${_offline?' player-offline':''}"><div class="avatar" style="background:${p.color};${_offline?'filter:grayscale(0.8);opacity:0.5':''}">${p.emoji}</div><div class="pname">${p.isVip?'👑 ':''}${esc(p.name)}${_offline?'<span style="display:block;font-size:10px;color:var(--text3)">📶 offline</span>':''}${_xBtn}</div></div>`;
            }).join('');
            row.querySelectorAll('.kick-btn').forEach(btn=>{
              btn.addEventListener('click',async()=>{
                const pid=btn.dataset.pid;
                const p=net._players?.find(x=>x.pid===pid);
                if(!p)return;
                if(!confirm((LANG==='ar'?'تريد تطرد ':'Remove ')+p.name+'?'))return;
                try{await net.room('players/'+pid).remove();await net.room('presence/'+pid).remove();}catch(e){}
                net._players=net._players?.filter(x=>x.pid!==pid);
                players=players.filter(x=>x.pid!==pid);
              },{once:true});
            });
          }
          if(_ls)requestAnimationFrame(()=>{_ls.scrollTop=_prevScroll<10?0:_prevScroll;});
        }
      });
    }
    // Auto-remove offline players from lobby after 30s
    if(net&&net.watchAndRemoveOffline){
      net.watchAndRemoveOffline(pid=>{
        players=players.filter(p=>p.pid!==pid);
        if(net._players)net._players=net._players.filter(p=>p.pid!==pid);
        const row=document.getElementById('playerRow');
        if(row&&net._players){
          row.innerHTML=net._players.map(p=>`<div class="player"><div class="avatar" style="background:${p.color}">${p.emoji}</div><div class="pname">${p.isVip?'👑 ':''}${esc(p.name)}</div></div>`).join('');
        }
        const _c=document.getElementById('lobbyCount');if(_c)_c.textContent=(net._players||players).length+'/20';
        const toast=document.createElement('div');
        toast.style.cssText='position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:var(--text2);font-family:Fredoka One,sans-serif;font-size:14px;padding:8px 20px;border-radius:20px;z-index:500;';
        const removed=players.find(p=>p.pid===pid)||{emoji:'👤',name:'Player'};
        toast.textContent=(removed.emoji||'👤')+' '+(removed.name||'Player')+(LANG==='ar'?' غادر الغرفة':' left the lobby');
        document.body.appendChild(toast);
        setTimeout(()=>toast.remove(),3000);
      });
    }
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
      const _ls=document.getElementById('scr-lobby');
      const _prevScroll=_ls?_ls.scrollTop:0;
      const _pStatus=window._hypoxPresence||{};
      $('#playerRow').innerHTML=list.map(p=>{
        const _offline=_pStatus[p.pid]==='away'||_pStatus[p.pid]==='offline';
        return `<div class="player${_offline?' player-offline':''}"><div class="avatar" style="background:${p.color};${_offline?'filter:grayscale(0.8);opacity:0.5':''}">${p.emoji}</div><div class="pname">${p.isVip?'👑 ':''}${esc(p.name)}${_offline?'<span style="display:block;font-size:10px;color:var(--text3)">📶 offline</span>':''}</div></div>`;
      }).join('');
      if(_ls){requestAnimationFrame(()=>{_ls.scrollTop=_prevScroll<10?0:_prevScroll;requestAnimationFrame(()=>{if(_ls.scrollTop<10)_ls.scrollTop=0;});});}
      const canStart=list.length>=2;
      $('#startGameBtn').classList.toggle('dim',!canStart);
      $('#lobbyHint').textContent=list.length<2?T.need2():list.length<3?T.need3():'';
    });

    const startBtn=document.getElementById('startGameBtn');
    if(startBtn)startBtn.onclick=()=>{
      startBtn.disabled=true;startBtn.innerHTML='<span style="display:inline-flex;align-items:center;gap:8px"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="animation:spin 0.8s linear infinite"><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" stroke-width="3"/><path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>'+(LANG==='ar'?'جاري...':'Starting...')+'</span>';
      const minPlayers = 2; // testing: allow 2 players for any game (real min shown on cards)
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
    const runningNet=net;
    currentGameMode=gameMode;currentViewKind='game';saveNavigationState('scr-game');
    Audio_.stopMusic();await FX.wipe();
    if(window.__hypoxAbort||!runningNet||net!==runningNet)return;
    Host.hideHost();
    show('#scr-game');gameActive=true;document.getElementById('topbarBack')?.style.setProperty('visibility','hidden');$('#topbar').classList.add('show');$('#roundPill').style.visibility='visible';
    
    $('#roundPill').textContent=(t('mode_names')||{})[gameMode]||gameMode;
    const _isPhones=net.playMode==='phones';
    net.setState({phase:'wait',msg:_isPhones?(LANG==='ar'?'اللعبة تبدأ الآن…':'Game starting…'):T.watchScreen()});
    await Host.run(net,players,gameMode);
    if(window.__hypoxAbort||!net||net!==runningNet||!gameActive)return;
    showPackPicker();
  }

  async function showPackPicker(){
    const runningNet=net;
    currentViewKind='pack-picker';saveNavigationState('scr-game');
    Audio_.stopMusic();await FX.wipe();
    if(window.__hypoxAbort||!runningNet||net!==runningNet)return;
    Host.hideHost();
    show('#scr-game');gameActive=true;document.getElementById('topbarBack')?.style.setProperty('visibility','hidden');
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
    Audio_.startMusic('lobby');net.setState({phase:'packpicker',msg:T.watchScreen()});
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
    const _mo=$('#menuOverlay');if(_mo)_mo.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;';
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
  function clearGameUI(){
    if(_ppDismiss)try{_ppDismiss();}catch(e){}
    _ppDismiss=null;window.__hypoxDismissPP=null;
    document.querySelectorAll('.phones-host-input-overlay').forEach(overlay=>overlay.remove());
    const dock=$('#hostInputDock');if(dock){dock.classList.add('hidden');dock.innerHTML='';dock.removeAttribute('style');}
    const pp=$('#ppOverlay');if(pp){pp.classList.remove('show');pp.innerHTML='';}
    const ctrl=$('#ctrlArea');if(ctrl){ctrl.classList.add('hidden');ctrl.innerHTML='';}
    const shared=$('#phoneSharedStage');if(shared){shared.classList.add('hidden');shared.innerHTML='';shared.dataset.sharedReady='';shared.dataset.gameStarted='';shared.dataset.sceneId='';}
    const sharedHost=$('#phoneSharedHost');if(sharedHost){sharedHost.className='phone-shared-host hidden';sharedHost.innerHTML='';}
    const mirror=$('#phoneMirror');if(mirror){mirror.classList.add('hidden');mirror.querySelectorAll('#pmPill,#pmHeadline,#pmSpeech').forEach(el=>el.textContent='');}
    const stage=$('#hostStage');if(stage)stage.innerHTML='';
    $('#scr-game')?.classList.remove('rebus-input-active');
    document.body.classList.remove('phones-only-player','phones-host-answering','phones-player-answering');
    Host.hideHost?.();
    const speech=$('#speechText');if(speech)speech.textContent='';
  }
  async function leaveGame(){
    window.__hypoxAbort = true;
    window.__hypoxPlayAgain=false;
    gameActive=false;
    Host.stopSharedScreen?.();
    if(window.__hypoxSkip)window.__hypoxSkip();
    window.__hypoxSkip=null;
    const leavingNet=net;
    const savedCode=currentRoomCode;
    const savedMode=currentGameMode;
    const savedHostSelfPid=net?.hostSelfPid||null;
    const savedRole=(net?.isOffline||net?.isRoomOwner)?'host':'player';
    // Show full-screen spinner while leaving
    // Spinner overlay on same page
    const _leaveLoader=document.createElement('div');
    _leaveLoader.style.cssText='position:fixed;inset:0;z-index:500;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;';
    _leaveLoader.innerHTML='<svg width="40" height="40" viewBox="0 0 24 24" fill="none" style="animation:spin 0.8s linear infinite"><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.2)" stroke-width="3"/><path d="M12 2a10 10 0 0 1 10 10" stroke="#ff3d8a" stroke-width="3" stroke-linecap="round"/></svg>';
    document.body.appendChild(_leaveLoader);
    if(leavingNet)try{leavingNet.setState({phase:'wait',msg:''});}catch(e){}
    Audio_.stopMusic();
    // Save resume info BEFORE closing net
    if(savedCode&&savedCode!=='LOCAL'&&savedRole==='host'){
      try{sessionStorage.setItem('hypox_resume',JSON.stringify({
        code:savedCode,mode:savedMode,hostSelfPid:savedHostSelfPid,savedAt:Date.now()
      }));}catch(e){}
    }
    try{sessionStorage.removeItem('hypox_session');localStorage.removeItem('hypox_player_session');}catch(e){}
    if(leavingNet)try{await leavingNet.close();}catch(e){}
    window.location.href=window.location.origin+window.location.pathname+'?t='+Date.now();
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
    $('#avatarDone').textContent=T.letsGo();$('#avatarDone').disabled=false;
    const backBtn=$('#backFromAvatar');
    $('#topbar').classList.add('show');
    const avatarBack=document.getElementById('topbarBack');
    if(avatarBack){
      avatarBack.style.setProperty('visibility','visible');
      avatarBack.onclick=()=>{
        Audio_.sfx.blip();
        avatarBack.style.setProperty('visibility','hidden');
        if(_avatarContext==='offline')show('#scr-lobby');else show('#scr-pregame');
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
  function phonesHostPrompt(spec,player,submitInput){
    return new Promise(resolve=>{
      const hidesStageAnswers=spec?.type==='choice'||spec?.type==='higherlow';
      if(hidesStageAnswers)document.body.classList.add('phones-host-answering');
      // Use a body-level modal overlay — avoids all overflow/stacking context issues
      const overlay=document.createElement('div');
      overlay.className='phones-host-input-overlay';
      overlay.style.cssText='position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;justify-content:flex-end;pointer-events:none;';
      const panel=document.createElement('div');
      panel.style.cssText='pointer-events:auto;background:var(--bg);border-top:2px solid var(--border-hi);padding:16px 16px max(20px,env(safe-area-inset-bottom));width:100%;max-height:60vh;overflow-y:auto;box-shadow:0 -8px 40px rgba(0,0,0,.6);';
      overlay.appendChild(panel);
      document.body.appendChild(overlay);
      let settled=false;
      const done=value=>{
        if(settled)return;settled=true;_ppDismiss=null;
        overlay.remove();
        if(hidesStageAnswers)document.body.classList.remove('phones-host-answering');
        resolve(value);
      };
      _ppDismiss=()=>done(null);
      window.__hypoxDismissPP=()=>{if(_ppDismiss)_ppDismiss();};
      const _hExclude=spec?.playerExcludes?.[net?.hostSelfPid];
      const hostSpec={...spec,controlsOnly:true,title:LANG==='ar'?'👆 اختيارك':'👆 Your pick',context:'',sub:'',...(_hExclude!==undefined?{excludeId:_hExclude}:{})};

      Controller.render(panel,hostSpec,async value=>{
        const result=submitInput?await submitInput(value):{accepted:true};
        if(result?.accepted===false)return result;
        done(value);
        return result;
      });
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
    // Save the stable player id so refresh reconnects this player instead of
    // adding a second copy to the room.
    try{const _sd=JSON.stringify({code,name,pid:myPid,isVip,emoji:selectedAvatar.emoji,color:selectedAvatar.color});sessionStorage.setItem('hypox_session',_sd);localStorage.setItem('hypox_player_session',_sd);}catch(e){}
    // Go directly to controller — no reload needed
    openPlayerController();
  }

  async function _claimHost(){
    if(!net||!currentRoomCode)return;
    const _code=currentRoomCode;
    const _session=JSON.parse(sessionStorage.getItem('hypox_session')||'null');
    try{sessionStorage.setItem('hypox_resume',JSON.stringify({
      code:_code,mode:currentGameMode,hostSelfPid:_session?.pid||null,savedAt:Date.now()
    }));}catch(e){}
    // Stop heartbeat only — do NOT close/remove from Firebase
    // We need to stay in the room so host can resume and see us
    if(net)try{net.stopHeartbeat?.();}catch(e){}
    window.location.href=window.location.origin+window.location.pathname;
  }

  function openPlayerController(){
    window._hypoxIsHost=false;
    currentViewKind='controller';gameActive=true;
    window._hypoxHostGone=false;
    if(net&&net.startHeartbeat)net.startHeartbeat();
    show('#scr-controller');
    showHypoxHeader(); // shows HYPOX logo in center, topbar visible
    updateMenu();
    const ctrl=$('#ctrlArea');
    const shared=$('#phoneSharedStage');
    const sharedHost=$('#phoneSharedHost');
    const phonesOnly=net.playMode==='phones';
    net.phonesOnly=phonesOnly;
    document.body.classList.toggle('phones-only-player',phonesOnly);
    // The Phones Only layout changes which element owns scrolling. Reset only
    // after that class is applied so iPhone Safari cannot restore the old offset.
    resetScrollPositionAfterLayout();
    shared.dataset.gameStarted='';
    shared.dataset.sharedReady='';
    shared.dataset.sceneId='';
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
      setTimeout(()=>window.scrollTo({top:0,behavior:'auto'}),50);
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
    let _lastAnnounceId = null;
    function renderMirror(m){
      if(!m)return;
      // Show player-left toast on phones
      if(m.announce && m.announceId && m.announceId !== _lastAnnounceId){
        _lastAnnounceId = m.announceId;
        const _t = document.createElement('div');
        _t.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#ccc;font-family:Fredoka One,sans-serif;font-size:14px;padding:8px 20px;border-radius:20px;z-index:999;white-space:nowrap;';
        _t.textContent = m.announce;
        document.body.appendChild(_t);
        setTimeout(() => _t.remove(), 3000);
      }
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
        const _sc=document.getElementById('scr-controller');
        if(_sc){_sc.scrollTop=0;requestAnimationFrame(()=>{_sc.scrollTop=0;requestAnimationFrame(()=>{_sc.scrollTop=0;});});}
        resetScrollPositionAfterLayout();
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
    function renderSharedStatus(title,sub=''){
      if(!phonesOnly)return;
      shared.innerHTML=`<div class="shared-status ctrl-wrap"><div class="ctrl-title display">${esc(title)}</div>${sub?`<div class="ctrl-sub">${esc(sub)}</div>`:''}<div class="ctrl-mirror-dots"><div class="pulse-dot"></div><div class="pulse-dot"></div><div class="pulse-dot"></div></div></div>`;
      resetScrollPositionAfterLayout();
    }
    function renderShared(view){
      if(!phonesOnly||!view?.html||!String(view.html).trim())return false;
      const html=safeSharedHTML(view.html);
      if(!html.trim())return false;
      const nextSceneId=String(view.sceneId??'');
      const sceneChanged=nextSceneId!==''&&shared.dataset.sceneId!==nextSceneId;
      shared.innerHTML=html;
      shared.dataset.sharedReady='1';
      shared.dataset.gameStarted='1';
      if(nextSceneId!=='')shared.dataset.sceneId=nextSceneId;
      if(view.pill!==undefined)$('#roundPill').textContent=view.pill||'';
      // Mutation updates inside one scene (avatars, scores, timers) must not
      // yank a player who is choosing below. Only a new game scene goes top.
      if(sceneChanged)resetScrollPositionAfterLayout();
      return true;
    }
    function renderSharedLobby(list){
      if(!phonesOnly||shared.dataset.sharedReady==='1')return;
      shared.innerHTML=`<div class="shared-lobby"><div class="lobby-title display">${LANG==='ar'?'اللاعبون':'PLAYERS'}</div><div class="shared-player-row">${list.map(p=>`<div class="player"><div class="avatar" style="background:${p.color}">${p.emoji}</div><div class="pname">${p.isVip?'👑 ':''}${esc(p.name)}</div></div>`).join('')}</div><div class="shared-lobby-count">${list.length}/20</div></div>`;
      const _sc=document.getElementById('scr-controller');
      if(_sc){_sc.scrollTop=0;requestAnimationFrame(()=>{_sc.scrollTop=0;requestAnimationFrame(()=>{_sc.scrollTop=0;});});}
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
      const el = ctrl.querySelector('textarea:not([disabled]),input:not([disabled]),.ctrl-map,.choice-btn:not(.picked),.ctrl-choices');
      return !!el;
    }
    net.onMirror(renderMirror);
    // Re-render input when phone comes back from lock screen
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='visible'&&gameActive&&net){
        try{
          net.room('state').get().then(snap=>{
            const st=snap.val();
            if(st&&st.phase==='input'&&st.phaseId&&st.spec){
              const now=Date.now();
              const deadline=st.deadline||0;
              if(deadline>now&&st.targets&&st.targets.includes(myPid)){
                // Still time left — re-render input
                lastPhaseId=null; // force re-render
                net.onState._lastState=null;
              }
            }
          }).catch(()=>{});
        }catch(e){}
      }
    });
    if(phonesOnly){
      // Always show a useful state while Firebase delivers the lobby/game.
      renderSharedStatus(LANG==='ar'?'تم الاتصال!':'YOU\'RE IN!',LANG==='ar'?'جاري تحميل الصالة…':'Loading the lobby…');
      net.onPlayers(renderSharedLobby);
      net.onSharedScreen(view=>renderShared(view));
    }
    let lastPhaseId=null;
    let hostLeftTimer=null;
    net.onState(state=>{
      if(!state||state.phase==='hostLeft'){
        document.body.classList.remove('phones-player-answering');
        // If game is active, don't redirect — show banner and let game finish
        if(gameActive){
          // Show subtle banner that host disconnected but game continues
          let _hb=document.getElementById('hostGoneBanner');
          if(!_hb){
            _hb=document.createElement('div');
            _hb.id='hostGoneBanner';
            _hb.style.cssText='position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:300;background:rgba(0,0,0,0.85);border:1.5px solid var(--yellow);border-radius:20px;padding:10px 20px;font-family:Fredoka One,sans-serif;font-size:14px;color:var(--yellow);text-align:center;';
            _hb.textContent=LANG==='ar'?'المضيف انقطع — اللعبة مستمرة ⚡':'Host disconnected — game continues ⚡';
            document.body.appendChild(_hb);
          }
          window._hypoxHostGone=true;
          return;
        }
        // Not in game — show host left screen with option to become host
        ctrl.innerHTML=`<div class="ctrl-wrap" style="text-align:center;padding:30px 20px">
          <div style="font-size:48px">😢</div>
          <div style="font-family:'Fredoka One',sans-serif;font-size:20px;color:var(--text2);margin-top:12px">${LANG==='ar'?'المضيف غادر اللعبة':'Host left the game'}</div>
          <button id="becomeHostBtn" class="big-btn" style="margin-top:20px">${LANG==='ar'?'أنا سأكون المضيف 👑':'I\'ll be the host 👑'}</button>
        </div>`;
        resetScrollPositionAfterLayout();
        document.getElementById('becomeHostBtn')?.addEventListener('click',()=>_claimHost());
        if(!hostLeftTimer)hostLeftTimer=setTimeout(()=>{
          try{sessionStorage.removeItem('hypox_session');localStorage.removeItem('hypox_player_session');}catch(e){}
          clearGameUI();currentRoomCode=null;net=null;players=[];gameActive=false;
          currentGameMode=null;currentPregameMode=null;currentViewKind='title';
          show('#scr-title');
        },8000);
        return;
      }
      // A host refresh briefly publishes hostLeft, then resumeHost restores a
      // normal state. Cancel the delayed redirect as soon as that happens.
      if(hostLeftTimer){clearTimeout(hostLeftTimer);hostLeftTimer=null;}
      // If host came back, remove the gone banner
      if(window._hypoxHostGone){
        window._hypoxHostGone=false;
        document.getElementById('hostGoneBanner')?.remove();
      }
      if(state.takenAnswers) window._hypoxTakenAnswers=state.takenAnswers;
      else if(state.phase==='input') window._hypoxTakenAnswers=[];
      if(state.mirror)renderMirror(state.mirror);
      if(state.phase==='input'&&state.phaseId!==lastPhaseId){
        _lastMirrorKey=''; // clear mirror when input starts
        if(!state.targets||state.targets.includes(myPid)){
          lastPhaseId=state.phaseId;Audio_.sfx.sting();if(navigator.vibrate)navigator.vibrate(120);
          ctrl.classList.remove('hidden');
          const _rawSpec=state.spec?{...state.spec}:null;
          if(_rawSpec&&_rawSpec.playerExcludes&&myPid!==undefined&&_rawSpec.playerExcludes[myPid]!==undefined){_rawSpec.excludeId=_rawSpec.playerExcludes[myPid];}
          const phoneSpec=_rawSpec?(phonesOnly?{..._rawSpec,controlsOnly:true,title:'',context:'',sub:''}:_rawSpec):null;
          if(!phoneSpec){renderSharedStatus(LANG==='ar'?'جاري تحميل السؤال…':'Loading the question…');return;}
          document.body.classList.toggle('phones-player-answering',phonesOnly&&(phoneSpec.type==='choice'||phoneSpec.type==='higherlow'));
          Controller.render(ctrl,phoneSpec,async value=>{
            const result=await net.submitInput(state.phaseId,value,{enforceUnique:phoneSpec.enforceUnique===true});
            if(result?.accepted===false)return result;
            setTimeout(()=>{if(phonesOnly){document.body.classList.remove('phones-player-answering');ctrl.classList.add('hidden');ctrl.innerHTML='';}else Controller.waitScreen(ctrl);},600);
            return result;
          });
          resetScrollPositionAfterLayout();
        }else if(phonesOnly){document.body.classList.remove('phones-player-answering');ctrl.classList.add('hidden');ctrl.innerHTML='';}else{Controller.waitScreen(ctrl,T.watchScreen());resetScrollPositionAfterLayout();}
      }else if(state.phase==='input-split'&&state.phaseId!==lastPhaseId){
        lastPhaseId=state.phaseId;Audio_.sfx.sting();if(navigator.vibrate)navigator.vibrate(120);
        const rawSpec=state.specs?.[myPid]||state.specs?._default;
        if(!rawSpec){renderSharedStatus(LANG==='ar'?'جاري تحميل السؤال…':'Loading the question…');return;}
        const spec=phonesOnly?{...rawSpec,controlsOnly:true,title:'',context:'',sub:''}:rawSpec;
        ctrl.classList.remove('hidden');
        document.body.classList.toggle('phones-player-answering',phonesOnly&&(spec.type==='choice'||spec.type==='higherlow'));
        Controller.render(ctrl,spec,async value=>{
          const result=await net.submitInput(state.phaseId,value,{enforceUnique:spec.enforceUnique===true});
          if(result?.accepted===false)return result;
          setTimeout(()=>{if(phonesOnly){document.body.classList.remove('phones-player-answering');ctrl.classList.add('hidden');ctrl.innerHTML='';}else Controller.waitScreen(ctrl);},600);
          return result;
        });
        resetScrollPositionAfterLayout();
      }else if(state.phase==='packpicker'){
        // Game ended — host is showing next game picker
        gameActive=false;
        document.getElementById('hostGoneBanner')?.remove();
        if(window._hypoxHostGone){
          window._hypoxHostGone=false;
          ctrl.innerHTML='<div class="ctrl-wrap" style="text-align:center;padding:30px 20px"><div style="font-size:48px">🎉</div><div style="font-family:Fredoka One,sans-serif;font-size:22px;color:var(--text);margin-top:12px;margin-bottom:20px">'+(LANG==='ar'?'انتهت اللعبة!':'Game Over!')+'</div><div style="font-family:Fredoka One,sans-serif;font-size:16px;color:var(--text2);margin-bottom:20px">'+(LANG==='ar'?'المضيف غادر — من يريد أن يكون المضيف؟':'Host left — who wants to host next?')+'</div><button id="becomeHostBtn2" class="big-btn">'+(LANG==='ar'?'أنا سأكون المضيف 👑':"I'll be the host 👑")+'</button></div>';
          resetScrollPositionAfterLayout();
          document.getElementById('becomeHostBtn2')?.addEventListener('click',()=>_claimHost());
          return;
        }
      }else if(state.phase==='wait'||state.phase==='mirror'){
        // Show full game content on phone using mirror data
        if(phonesOnly){
          document.body.classList.remove('phones-player-answering');
          ctrl.classList.add('hidden');ctrl.innerHTML='';
          if(shared.dataset.sharedReady!=='1')renderSharedStatus(state.msg||T.watchScreen(),LANG==='ar'?'اللعبة تبدأ الآن…':'The game is starting…');
          return;
        }
        const m = state.mirror||state;
        if(m.headline){
          if(!isInputActive()){ctrl.innerHTML=buildMirrorHTML(m);resetScrollPositionAfterLayout();}
        } else {
          if(!isInputActive()){Controller.waitScreen(ctrl,state.msg||T.watchScreen());resetScrollPositionAfterLayout();}
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
            resetScrollPositionAfterLayout();
          },{once:true});
          resetScrollPositionAfterLayout();
        }
      }else if(state.phase==='gameinfo'){
        // Hide shared stage, show tutorial only in controller
        if(phonesOnly){shared.classList.add('hidden');shared.innerHTML='';}
        ctrl.classList.remove('hidden');
        ctrl.innerHTML=`<div class="ctrl-wrap" style="text-align:center;padding:20px 16px">
          <div style="font-size:56px;margin-bottom:8px">${esc(state.icon||'🎮')}</div>
          <div style="font-family:'Fredoka One',sans-serif;font-size:clamp(20px,5vw,28px);color:var(--yellow);margin-bottom:6px">${esc(state.modeName||'')}</div>
          <div style="font-size:clamp(13px,3.5vw,16px);color:var(--text2);margin-bottom:12px">${esc(state.tagline||'')}</div>
          ${state.rules?`<div style="font-size:clamp(12px,3vw,14px);color:var(--text3);line-height:1.5;background:rgba(255,255,255,0.06);border-radius:12px;padding:10px 14px;text-align:left">${esc(state.rules)}</div>`:''}
          <div style="margin-top:16px;font-size:13px;color:var(--text3)">${LANG==='ar'?'انتظر المضيف يبدأ…':'Waiting for host to start…'}</div>
        </div>`;
        resetScrollPositionAfterLayout();
      }else if(state.phase==='winner'){
        ctrl.classList.remove('hidden');
        ctrl.innerHTML=`<div class="ctrl-wrap"><div class="crown">👑</div><div class="ctrl-title display">${state.emoji} ${esc(state.name)}</div><div class="ctrl-sub">${T.winner()}</div></div>`;
        resetScrollPositionAfterLayout();
        Audio_.sfx.fanfare();
      }
    });
  }
})();
