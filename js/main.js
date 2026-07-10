/* HYPOX — main.js v4: games on title, mode selection last, QR + copy link, persistent rooms */
(() => {
  const AVATARS_LIST = [
    {emoji:'🦊',color:'#f472b6',label:'Fox'},
    {emoji:'🐼',color:'#60a5fa',label:'Panda'},
    {emoji:'🐸',color:'#34d399',label:'Frog'},
    {emoji:'🦄',color:'#a78bfa',label:'Unicorn'},
    {emoji:'🤖',color:'#fb923c',label:'Robot'},
    {emoji:'🐫',color:'#facc15',label:'Camel'},
    {emoji:'🦅',color:'#38bdf8',label:'Eagle'},
    {emoji:'🐙',color:'#f87171',label:'Octopus'},
    {emoji:'🦁',color:'#fbbf24',label:'Lion'},
    {emoji:'🐢',color:'#4ade80',label:'Turtle'},
    {emoji:'🦋',color:'#c084fc',label:'Butterfly'},
    {emoji:'🐬',color:'#22d3ee',label:'Dolphin'},
    {emoji:'🐺',color:'#94a3b8',label:'Wolf'},
    {emoji:'🐯',color:'#f59e0b',label:'Tiger'},
    {emoji:'🦈',color:'#0ea5e9',label:'Shark'},
  ];

  const MODE_MIN_PLAYERS = {bluff:3,wyr:3,interrogation:3,diss:4,quiz:2,trivia:2};
  const MODE_ICONS = {bluff:'🔍',wyr:'⚖️',interrogation:'🔦',diss:'🎤',quiz:'⚡',trivia:'📚'};
  const MODE_COLORS = {bluff:'#f472b6',wyr:'#60a5fa',interrogation:'#a78bfa',diss:'#fb923c',quiz:'#facc15',trivia:'#34d399'};
  const CAT_INFO = [
    {id:'general',icon:'🎲',name:'General Mix'},
    {id:'geography',icon:'🌍',name:'Geography'},
    {id:'science',icon:'🔬',name:'Science'},
    {id:'gulf',icon:'🕌',name:'Gulf & Arab'},
    {id:'pop',icon:'🎬',name:'Pop Culture'},
    {id:'sports',icon:'⚽',name:'Sports'},
  ];

  window.HYPOX_STATE = window.HYPOX_STATE || {region:null,rounds:5,category:'general',flavor:'global'};

  let net=null, players=[], myPid=null, isVip=false, hostMode='tv';
  let selectedAvatar=AVATARS_LIST[0];
  let _ppDismiss=null, _avatarCallback=null, _avatarContext=null;
  let gameActive=false;
  let currentRoomCode=null;

  const show=id=>{$$('.screen').forEach(s=>s.classList.remove('active'));$(id).classList.add('active');};
  const $=s=>document.querySelector(s);
  const $$=s=>Array.from(document.querySelectorAll(s));
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.esc=esc;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));

  let booted=false;
  document.addEventListener('DOMContentLoaded',()=>{
    if(booted)return;booted=true;
    applyTheme();
    FX.init();
    buildTitleGameCards();

    // Top bar
    $('#soundBtn').addEventListener('click',e=>{const on=Audio_.toggle();e.target.textContent=on?'🔊':'🔇';});
    $('#themeBtn').addEventListener('click',()=>{setTheme(THEME==='dark'?'light':'dark');$('#themeBtn').textContent=THEME==='dark'?'🌙':'☀️';});
    $('#themeBtn').textContent=THEME==='dark'?'🌙':'☀️';
    $('#skipBtn').addEventListener('click',()=>{if(window.__hypoxSkip){window.__hypoxSkip();window.__hypoxSkip=null;}});

    // Menu
    $('#menuBtn').addEventListener('click',openMenu);
    $('#menuClose').addEventListener('click',closeMenu);
    $('#menuResume').addEventListener('click',closeMenu);
    $('#menuLeave').addEventListener('click',()=>{closeMenu();leaveGame();});

    // Join
    $('#joinBtn').addEventListener('click',()=>{Audio_.sfx.blip();show('#scr-join');});
    $('#joinGo').addEventListener('click',joinAsPlayer);
    $('#joinCode').addEventListener('keydown',e=>{if(e.key==='Enter')$('#joinName').focus();});
    $('#joinName').addEventListener('keydown',e=>{if(e.key==='Enter')joinAsPlayer();});
    $('#backFromJoin').addEventListener('click',()=>{Audio_.sfx.blip();show('#scr-title');});

    // Avatar
    buildAvatarGrid();
    $('#avatarDone').addEventListener('click',confirmAvatar);
    $('#avatarName').addEventListener('keydown',e=>{if(e.key==='Enter')confirmAvatar();});

    // Lobby
    $('#addLocalBtn').addEventListener('click',()=>showAvatarPicker('offline'));
    $('#startGameBtn').addEventListener('click',()=>{
      if(players.length<2){Audio_.sfx.buzzer();$('#lobbyHint').classList.add('shake');setTimeout(()=>$('#lobbyHint').classList.remove('shake'),500);return;}
      showPackPicker();
    });

    // Check URL for room code (auto-join)
    const urlParams=new URLSearchParams(window.location.search);
    const urlCode=urlParams.get('room');
    if(urlCode){
      $('#joinCode').value=urlCode.toUpperCase();
      show('#scr-join');
    }
  });

  function applyTheme(){
    document.body.classList.toggle('theme-dark',THEME==='dark');
    document.body.classList.toggle('theme-light',THEME==='light');
  }

  /* ---- Title screen: game cards ---- */
  function buildTitleGameCards(){
    const grid=$('#titleGameGrid');
    if(!grid)return;
    const modes=Object.keys(MODE_ICONS);
    grid.innerHTML=modes.map((m,i)=>`
      <button class="title-game-card" data-mode="${m}" style="animation-delay:${i*.08}s;--mc:${MODE_COLORS[m]}">
        <div class="tgc-icon">${MODE_ICONS[m]}</div>
        <div class="tgc-name display">${t('mode_names')[m]||m}</div>
        <div class="tgc-tag">${t('mode_taglines')[m]||''}</div>
        <div class="tgc-min">👥 ${MODE_MIN_PLAYERS[m]}+ players</div>
      </button>`).join('');
    $$('.title-game-card').forEach(card=>card.addEventListener('click',()=>{
      Audio_.sfx.pop();
      Audio_.unlock();
      const mode=card.dataset.mode;
      showPreGameFlow(mode);
    }));
  }

  /* ---- Pre-game flow: settings → play mode → lobby ---- */
  async function showPreGameFlow(mode){
    show('#scr-pregame');
    const isTrivia=mode==='trivia'||mode==='quiz';
    const modeName=t('mode_names')[mode]||mode;
    const modeIcon=MODE_ICONS[mode]||'🎮';
    const modeColor=MODE_COLORS[mode]||'var(--pink)';

    // Build scrollable content + sticky play mode footer
    const pregameEl = document.getElementById('pregameContent');
    pregameEl.innerHTML=`
      <div class="pregame-header">
        <div class="pregame-icon">${modeIcon}</div>
        <div class="pregame-title display" style="color:${modeColor}">${esc(modeName)}</div>
        <div class="pregame-desc">${esc(t('mode_taglines')[mode]||'')}</div>
      </div>
      <div class="pregame-rules">${esc(t('mode_rules')[mode]||'')}</div>
      <div class="pregame-settings">
        <div class="gs-section">
          <div class="gs-label">ROUNDS</div>
          <div class="round-btns">
            ${[5,10,15].map(n=>`<button class="round-btn${window.HYPOX_STATE.rounds===n?' selected':''}" data-r="${n}">${n}</button>`).join('')}
          </div>
        </div>
        <div class="gs-section">
          <div class="gs-label">CONTENT</div>
          <div class="content-btns">
            <button class="content-btn${window.HYPOX_STATE.flavor==='arab'?' selected':''}" data-flavor="arab">🕌 Arab Flavor</button>
            <button class="content-btn${window.HYPOX_STATE.flavor!=='arab'?' selected':''}" data-flavor="global">🌍 Global Mix</button>
          </div>
        </div>
        ${isTrivia?`
        <div class="gs-section">
          <div class="gs-label">CATEGORY</div>
          <div class="cat-grid-small">
            ${CAT_INFO.map((c,i)=>`
              <button class="cat-card-sm${window.HYPOX_STATE.category===c.id?' selected':''}" data-cat="${c.id}" style="animation-delay:${i*.06}s">
                <div class="cat-icon-sm">${c.icon}</div>
                <div class="cat-name-sm">${c.name}</div>
              </button>`).join('')}
          </div>
        </div>`:''}
      </div>`;

    // Sticky bottom — always visible, no scrolling needed
    // Remove old sticky if any
    const oldSticky = document.getElementById('pregameSticky');
    if(oldSticky) oldSticky.remove();
    const sticky = document.createElement('div');
    sticky.id = 'pregameSticky';
    sticky.className = 'pregame-sticky-bottom';
    sticky.innerHTML = `
      <div class="gs-label">HOW ARE YOU PLAYING?</div>
      <div class="play-modes-mini">
        <button class="pmm-btn" id="pgHostBtn"><span class="pmm-icon">📺</span><span class="pmm-name">TV + Phones</span></button>
        <button class="pmm-btn feature" id="pgPhonesBtn"><span class="pmm-icon">📱</span><span class="pmm-name">Phones Only</span></button>
        <button class="pmm-btn" id="pgOfflineBtn"><span class="pmm-icon">🤝</span><span class="pmm-name">One Device</span></button>
      </div>`;
    document.getElementById('scr-pregame').appendChild(sticky);

    // Settings listeners
    $$('.round-btn').forEach(btn=>btn.addEventListener('click',()=>{
      $$('.round-btn').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');
      window.HYPOX_STATE.rounds=+btn.dataset.r;
      Audio_.sfx.blip();
    }));
    $$('.content-btn').forEach(btn=>btn.addEventListener('click',()=>{
      $$('.content-btn').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');
      window.HYPOX_STATE.flavor=btn.dataset.flavor;
      Audio_.sfx.blip();
    }));
    if(isTrivia){
      $$('.cat-card-sm').forEach(btn=>btn.addEventListener('click',()=>{
        $$('.cat-card-sm').forEach(b=>b.classList.remove('selected'));
        btn.classList.add('selected');
        window.HYPOX_STATE.category=btn.dataset.cat;
        Audio_.sfx.blip();
      }));
    }

    // Play mode buttons
    document.getElementById('pgHostBtn').addEventListener('click',()=>startGameWithMode('tv',mode),{once:true});
    document.getElementById('pgPhonesBtn').addEventListener('click',()=>startGameWithMode('phones',mode),{once:true});
    document.getElementById('pgOfflineBtn').addEventListener('click',()=>startGameWithMode('offline',mode),{once:true});

    // Back
    const backBtn=$('#backFromPregame');
    const newBack=backBtn.cloneNode(true);
    backBtn.parentNode.replaceChild(newBack,backBtn);
    newBack.addEventListener('click',()=>{Audio_.sfx.blip();show('#scr-title');});
  }

  /* ---- Start game with selected mode ---- */
  async function startGameWithMode(playMode, gameMode){
    Audio_.sfx.submit();
    hostMode=playMode;

    if(playMode!=='offline'&&!FirebaseNet.available()){
      Audio_.sfx.buzzer();
      alert('Firebase not configured. Use One Device mode.');
      return;
    }

    // If room already exists and alive, reuse it
    if(net&&currentRoomCode&&!net.isOffline&&playMode!=='offline'){
      // already have a live room, go straight to lobby
      show('#scr-lobby');
      return;
    }

    net=createNet(playMode==='offline');
    if(playMode==='offline'&&!net.isOffline)net=new LocalNet();
    if(net.isOffline)net.promptLocal=passAndPlayPrompt;

    const code=await net.createRoom(LANG);
    currentRoomCode=code;
    $('#roomCodeText').textContent=net.isOffline?'PASS & PLAY':code;
    $('#topbar').classList.add('show');
    $('#menuBtn').classList.remove('hidden');
    $('#roundPill').textContent='Lobby';

    if(playMode==='phones'){
      showAvatarPicker('phones',async(name,av)=>{
        const res=await net.joinRoom(code,name,av);
        myPid=res.pid;isVip=res.isVip;
        net.hostSelfPid=myPid;
        net.promptLocal=passAndPlayPrompt;
        show('#scr-lobby');
        setupLobby(gameMode);
      });
      return;
    }
    show('#scr-lobby');
    setupLobby(gameMode);
  }

  function setupLobby(gameMode){
    gameActive=false;
    $('#localAdd').classList.toggle('hidden',!net.isOffline);

    if(!net.isOffline&&currentRoomCode){
      const siteUrl=window.location.origin+window.location.pathname;
      const joinUrl=`${siteUrl}?room=${currentRoomCode}`;
      $('#joinHint').innerHTML=`
        <div class="lobby-share">
          <div class="share-url"><b>${currentRoomCode}</b> · <a href="${joinUrl}" style="color:var(--cyan)">${joinUrl.replace('https://','')}</a></div>
          <div class="share-btns">
            <button class="bar-btn" id="copyLinkBtn">📋 Copy Link</button>
            <button class="bar-btn" id="showQrBtn">📱 QR Code</button>
          </div>
          <div id="qrArea" class="hidden"></div>
        </div>`;
      $('#copyLinkBtn').addEventListener('click',()=>{
        navigator.clipboard.writeText(joinUrl).then(()=>{
          $('#copyLinkBtn').textContent='✓ Copied!';
          setTimeout(()=>$('#copyLinkBtn').textContent='📋 Copy Link',2000);
        });
        Audio_.sfx.submit();
      });
      $('#showQrBtn').addEventListener('click',()=>{
        const qr=$('#qrArea');
        if(qr.classList.contains('hidden')){
          qr.classList.remove('hidden');
          qr.innerHTML=generateQR(joinUrl);
          $('#showQrBtn').textContent='✕ Hide QR';
        } else {
          qr.classList.add('hidden');
          $('#showQrBtn').textContent='📱 QR Code';
        }
        Audio_.sfx.blip();
      });
    } else {
      $('#joinHint').textContent='';
    }

    net.onPlayers(list=>{
      const prev=players.length;
      players=list;
      if(list.length>prev)Audio_.sfx.pop();
      $('#playerRow').innerHTML=list.map(p=>`
        <div class="player">
          <div class="avatar" style="background:${p.color}">${p.emoji}</div>
          <div class="pname">${p.isVip?'👑 ':''}${esc(p.name)}</div>
        </div>`).join('');
      const canStart=list.length>=2;
      $('#startGameBtn').classList.toggle('dim',!canStart);
      $('#lobbyHint').textContent=list.length<2?'Need at least 2 players':list.length<3?'Some games need 3+ players':'';
    });

    // Auto-start with the chosen game mode
    const btn=$('#startGameBtn');
    const newBtn=btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn,btn);
    newBtn.addEventListener('click',()=>{
      if(players.length<2){Audio_.sfx.buzzer();$('#lobbyHint').classList.add('shake');setTimeout(()=>$('#lobbyHint').classList.remove('shake'),500);return;}
      startDirectGame(gameMode);
    });
  }

  async function startDirectGame(gameMode){
    Audio_.stopMusic();
    await FX.wipe();
    Host.hideHost();
    show('#scr-game');
    gameActive=true;
    $('#skipBtn').classList.remove('hidden');
    $('#roundPill').textContent=t('mode_names')[gameMode]||gameMode;
    net.setState({phase:'wait',msg:'Get ready!'});
    await Host.run(net,players,gameMode);
    // After game ends, go back to pack picker for next game
    showPackPicker();
  }

  /* ---- Pack picker (shown after first game, for choosing next game) ---- */
  async function showPackPicker(){
    Audio_.stopMusic();
    await FX.wipe();
    Host.hideHost();
    show('#scr-game');
    gameActive=true;
    $('#skipBtn').classList.add('hidden');
    $('#roundPill').textContent='Pick a Game';
    const modeList=Object.keys(MODE_ICONS);
    Host.scene(`
      <div class="lobby-title display">NEXT GAME?</div>
      <div class="pack-grid">
        ${modeList.map((m,i)=>`
          <button class="pack-card" data-mode="${m}" style="animation-delay:${i*.08}s">
            <div class="pack-icon">${MODE_ICONS[m]}</div>
            <div class="pack-name display">${esc(t('mode_names')[m])}</div>
            <div class="pack-tag">${esc(t('mode_taglines')[m])}</div>
            <div class="pack-min">👥 <span>${MODE_MIN_PLAYERS[m]}</span>+</div>
          </button>`).join('')}
      </div>
      <button class="bar-btn" id="backToLobbyBtn" style="margin-top:2vmin">← Back to Lobby</button>`);
    Audio_.startMusic('lobby');
    net.setState({phase:'wait',msg:'Watch the main screen!'});
    $$('.pack-card').forEach(btn=>btn.addEventListener('click',async()=>{
      const mode=btn.dataset.mode;
      const minP=MODE_MIN_PLAYERS[mode]||2;
      if(players.length<minP){
        Audio_.sfx.buzzer();
        const err=document.createElement('div');
        err.style.cssText='position:fixed;bottom:4vmin;left:50%;transform:translateX(-50%);background:var(--pink);color:#fff;font-family:Fredoka One,sans-serif;font-size:18px;padding:12px 28px;border-radius:50px;z-index:50;animation:popIn .3s both';
        err.textContent=`Need ${minP}+ players`;
        document.body.appendChild(err);
        setTimeout(()=>err.remove(),2200);
        return;
      }
      Audio_.sfx.submit();
      await startDirectGame(mode);
    },{once:true}));
    document.getElementById('backToLobbyBtn')?.addEventListener('click',()=>{
      show('#scr-lobby');
      Audio_.startMusic('lobby');
    },{once:true});
  }

  /* ---- Simple QR code generator (pure JS, no library) ---- */
  function generateQR(url){
    // Use a free QR API — renders as an img
    const encoded=encodeURIComponent(url);
    return `<img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encoded}" width="160" height="160" style="border-radius:12px;border:4px solid var(--card-hi);display:block;margin:12px auto;" alt="QR Code">`;
  }

  /* ---- Menu ---- */
  function openMenu(){$('#menuOverlay').classList.remove('hidden');Audio_.sfx.blip();}
  function closeMenu(){$('#menuOverlay').classList.add('hidden');}
  function leaveGame(){
    gameActive=false;window.__hypoxSkip=null;
    Audio_.stopMusic();currentRoomCode=null;net=null;players=[];
    show('#scr-title');$('#topbar').classList.remove('show');
    $('#menuBtn').classList.add('hidden');$('#skipBtn').classList.add('hidden');
  }

  /* ---- Avatar ---- */
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
      btn.classList.add('selected');
      selectedAvatar=AVATARS_LIST[+btn.dataset.i];
      btn.style.borderColor=selectedAvatar.color;
    }));
  }

  function showAvatarPicker(context,cb){
    _avatarContext=context;_avatarCallback=cb||null;
    buildAvatarGrid();$('#avatarName').value='';
    const backBtn=$('#backFromAvatar');
    const newBack=backBtn.cloneNode(true);
    backBtn.parentNode.replaceChild(newBack,backBtn);
    newBack.addEventListener('click',()=>{
      Audio_.sfx.blip();
      if(_avatarContext==='offline')show('#scr-lobby');
      else show('#scr-title');
    });
    show('#scr-avatar');
  }

  function confirmAvatar(){
    const name=$('#avatarName').value.trim();
    if(!name){$('#avatarName').classList.add('shake');setTimeout(()=>$('#avatarName').classList.remove('shake'),500);return;}
    Audio_.sfx.submit();
    if(_avatarCallback){_avatarCallback(name,selectedAvatar);return;}
    if(net&&net.isOffline){const p=net.addLocalPlayer(name,selectedAvatar);if(p)show('#scr-lobby');}
  }

  /* ---- Pass & Play overlay ---- */
  function passAndPlayPrompt(spec,player){
    return new Promise(resolve=>{
      const ov=$('#ppOverlay');
      ov.classList.add('show');
      let settled=false;
      const done=value=>{if(settled)return;settled=true;_ppDismiss=null;setTimeout(()=>{ov.classList.remove('show');resolve(value);},400);};
      _ppDismiss=()=>{if(settled)return;settled=true;_ppDismiss=null;ov.classList.remove('show');resolve(null);};
      window.__hypoxDismissPP=()=>{if(_ppDismiss)_ppDismiss();};
      ov.innerHTML=`
        <div class="pp-card">
          <div class="eyebrow">PASS TO</div>
          <div class="pp-player">
            <div class="avatar" style="background:${player.color}">${player.emoji}</div>
            <div class="pp-name display">${esc(player.name)}</div>
          </div>
          <button class="big-btn" id="ppReady">TAP WHEN READY</button>
        </div>`;
      Audio_.sfx.sting();
      $('#ppReady').addEventListener('click',()=>{
        Audio_.sfx.pop();
        ov.innerHTML=`<div class="pp-card"><div id="ppCtrl"></div></div>`;
        Controller.render($('#ppCtrl'),spec,value=>done(value));
      },{once:true});
    });
  }

  /* ---- JOIN (phone) ---- */
  async function joinAsPlayer(){
    const code=$('#joinCode').value.trim().toUpperCase();
    const name=$('#joinName').value.trim();
    if(!code||!name){Audio_.sfx.buzzer();return;}
    if(!FirebaseNet.available()){$('#joinErr').textContent='Firebase not configured.';return;}
    $('#joinErr').textContent='Connecting…';
    try{
      net=FirebaseNet.create();
      const res=await net.joinRoom(code,name,selectedAvatar);
      myPid=res.pid;isVip=res.isVip;
    }catch(e){$('#joinErr').textContent='Could not connect. Check room code.';return;}
    show('#scr-controller');
    $('#menuBtn').classList.remove('hidden');
    const ctrl=$('#ctrlArea');
    Controller.waitScreen(ctrl,isVip?'You\'re the host 👑':'You\'re in! Watch the main screen.');
    const mstrip=$('#phoneMirror');
    function renderMirror(m){
      if(!m)return;
      mstrip.classList.remove('hidden');
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
          lastPhaseId=state.phaseId;Audio_.sfx.sting();
          if(navigator.vibrate)navigator.vibrate(120);
          Controller.render(ctrl,state.spec,value=>{net.submitInput(state.phaseId,value);setTimeout(()=>Controller.waitScreen(ctrl),600);});
        }else{Controller.waitScreen(ctrl,'Watch the main screen!');}
      }else if(state.phase==='input-split'&&state.phaseId!==lastPhaseId){
        lastPhaseId=state.phaseId;Audio_.sfx.sting();
        if(navigator.vibrate)navigator.vibrate(120);
        const spec=state.specs[myPid]||state.specs._default;
        Controller.render(ctrl,spec,value=>{net.submitInput(state.phaseId,value);setTimeout(()=>Controller.waitScreen(ctrl),600);});
      }else if(state.phase==='wait'){
        Controller.waitScreen(ctrl,state.msg||'Watch the main screen!');
      }else if(state.phase==='winner'){
        ctrl.innerHTML=`<div class="ctrl-wrap"><div class="crown">👑</div><div class="ctrl-title display">${state.emoji} ${esc(state.name)}</div><div class="ctrl-sub">Champion of the night!</div></div>`;
        Audio_.sfx.fanfare();
      }
    });
  }
})();
