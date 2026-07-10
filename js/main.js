/* HYPOX — main.js v3: streamlined flow, menu, rounds, categories */
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

  const MODE_MIN_PLAYERS = { bluff:3, wyr:3, interrogation:3, diss:4, quiz:2, trivia:2 };
  const MODE_ICONS = { bluff:'🔍', wyr:'⚖️', interrogation:'🔦', diss:'🎤', quiz:'⚡', trivia:'📚' };
  const CAT_INFO = [
    {id:'general',  icon:'🎲', name:'General Mix'},
    {id:'geography',icon:'🌍', name:'Geography'},
    {id:'science',  icon:'🔬', name:'Science'},
    {id:'gulf',     icon:'🕌', name:'Gulf & Arab'},
    {id:'pop',      icon:'🎬', name:'Pop Culture'},
    {id:'sports',   icon:'⚽', name:'Sports'},
  ];

  window.HYPOX_STATE = window.HYPOX_STATE || { region:null, rounds:5, category:'general', flavor:'global' };

  let net=null, players=[], myPid=null, isVip=false, hostMode='tv';
  let selectedAvatar = AVATARS_LIST[0];
  let _ppDismiss=null, _avatarCallback=null, _avatarContext=null;
  let gameActive = false;

  const show = id => { $$('.screen').forEach(s=>s.classList.remove('active')); $(id).classList.add('active'); };
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.esc = esc;

  let booted=false;
  document.addEventListener('DOMContentLoaded', () => {
    if(booted) return; booted=true;
    applyTheme();
    FX.init();

    // Top bar controls
    $('#soundBtn').addEventListener('click', e => { const on=Audio_.toggle(); e.target.textContent=on?'🔊':'🔇'; });
    $('#themeBtn').addEventListener('click', () => { setTheme(THEME==='dark'?'light':'dark'); $('#themeBtn').textContent=THEME==='dark'?'🌙':'☀️'; });
    $('#themeBtn').textContent = THEME==='dark'?'🌙':'☀️';
    // lang button removed — English only
    $('#skipBtn').addEventListener('click', () => { if(window.__hypoxSkip){window.__hypoxSkip();window.__hypoxSkip=null;} });

    // Menu
    $('#menuBtn').addEventListener('click', openMenu);
    $('#menuClose').addEventListener('click', closeMenu);
    $('#menuResume').addEventListener('click', closeMenu);
    $('#menuLeave').addEventListener('click', () => { closeMenu(); leaveGame(); });

    // Title
    $('#hostBtn').addEventListener('click', () => { Audio_.unlock(); startHost('tv'); });
    $('#phonesBtn').addEventListener('click', () => { Audio_.unlock(); startHost('phones'); });
    $('#offlineBtn').addEventListener('click', () => { Audio_.unlock(); startHost('offline'); });
    $('#joinBtn').addEventListener('click', () => { Audio_.sfx.blip(); show('#scr-join'); });

    // Avatar
    buildAvatarGrid();
    $('#avatarDone').addEventListener('click', confirmAvatar);
    $('#avatarName').addEventListener('keydown', e => { if(e.key==='Enter') confirmAvatar(); });
    $('#backFromAvatar').addEventListener('click', () => {
      Audio_.sfx.blip();
      if(_avatarContext==='offline') show('#scr-lobby');
      else show('#scr-title');
    });

    // Lobby
    $('#addLocalBtn').addEventListener('click', () => showAvatarPicker('offline'));
    $('#startGameBtn').addEventListener('click', () => {
      if(players.length<2){ Audio_.sfx.buzzer(); $('#lobbyHint').classList.add('shake'); setTimeout(()=>$('#lobbyHint').classList.remove('shake'),500); return; }
      showPackPicker();
    });

    // Join
    $('#joinGo').addEventListener('click', joinAsPlayer);
    $('#joinCode').addEventListener('keydown', e => { if(e.key==='Enter') $('#joinName').focus(); });
    $('#joinName').addEventListener('keydown', e => { if(e.key==='Enter') joinAsPlayer(); });
    $('#backFromJoin').addEventListener('click', () => { Audio_.sfx.blip(); show('#scr-title'); });
  });

  function applyTheme() {
    document.body.classList.toggle('theme-dark', THEME==='dark');
    document.body.classList.toggle('theme-light', THEME==='light');
  }

  /* ---- Menu ---- */
  function openMenu() {
    $('#menuOverlay').classList.remove('hidden');
    Audio_.sfx.blip();
  }
  function closeMenu() {
    $('#menuOverlay').classList.add('hidden');
  }
  function leaveGame() {
    gameActive = false;
    window.__hypoxSkip = null;
    Audio_.stopMusic();
    show('#scr-title');
    $('#topbar').classList.remove('show');
    $('#menuBtn').classList.add('hidden');
    $('#skipBtn').classList.add('hidden');
    players = []; net = null;
  }

  /* ---- Avatar ---- */
  function buildAvatarGrid() {
    const grid = $('#avatarGrid');
    grid.innerHTML = AVATARS_LIST.map((av,i) => `
      <button class="avatar-opt${i===0?' selected':''}" data-i="${i}" style="${i===0?'border-color:'+av.color:''}">
        <div class="avatar-emoji">${av.emoji}</div>
        <div class="avatar-label">${av.label}</div>
      </button>`).join('');
    $$('.avatar-opt').forEach(btn => btn.addEventListener('click', () => {
      Audio_.sfx.vote();
      $$('.avatar-opt').forEach(b => { b.classList.remove('selected'); b.style.borderColor=''; });
      btn.classList.add('selected');
      selectedAvatar = AVATARS_LIST[+btn.dataset.i];
      btn.style.borderColor = selectedAvatar.color;
    }));
  }

  function showAvatarPicker(context, cb) {
    _avatarContext = context;
    _avatarCallback = cb||null;
    buildAvatarGrid();
    $('#avatarName').value='';
    show('#scr-avatar');
  }

  function confirmAvatar() {
    const name = $('#avatarName').value.trim();
    if(!name){ $('#avatarName').classList.add('shake'); setTimeout(()=>$('#avatarName').classList.remove('shake'),500); return; }
    Audio_.sfx.submit();
    if(_avatarCallback){ _avatarCallback(name, selectedAvatar); return; }
    if(net&&net.isOffline){
      const p = net.addLocalPlayer(name, selectedAvatar);
      if(p) show('#scr-lobby');
    }
  }

  /* ---- HOST ---- */
  async function startHost(mode) {
    hostMode = mode;
    if(mode!=='offline' && !FirebaseNet.available()){
      Audio_.sfx.buzzer();
      alert('Firebase not configured. Use One Device mode.');
      return;
    }
    net = createNet(mode==='offline');
    if(mode==='offline'&&!net.isOffline) net=new LocalNet();
    if(net.isOffline) net.promptLocal=passAndPlayPrompt;

    const code = await net.createRoom(LANG);
    $('#roomCodeText').textContent = net.isOffline?'PASS & PLAY':code;
    $('#topbar').classList.add('show');
    $('#menuBtn').classList.remove('hidden');
    $('#roundPill').textContent='Lobby';

    if(mode==='phones'){
      showAvatarPicker('phones', async (name,av) => {
        const res = await net.joinRoom(code, name, av);
        myPid=res.pid; isVip=res.isVip;
        net.hostSelfPid=myPid;
        net.promptLocal=passAndPlayPrompt;
        show('#scr-lobby'); setupLobby();
      });
      return;
    }
    show('#scr-lobby'); setupLobby();
  }

  function setupLobby() {
    gameActive=false;
    $('#localAdd').classList.toggle('hidden', !net.isOffline);
    if(!net.isOffline) {
      $('#joinHint').innerHTML = `Join at <b>${location.host}</b> → JOIN A GAME → enter code <b>${$('#roomCodeText').textContent}</b>`;
    } else {
      $('#joinHint').textContent='';
    }
    net.onPlayers(list => {
      const prev=players.length;
      players=list;
      if(list.length>prev) Audio_.sfx.pop();
      $('#playerRow').innerHTML=list.map(p=>`
        <div class="player">
          <div class="avatar" style="background:${p.color}">${p.emoji}</div>
          <div class="pname">${p.isVip?'👑 ':''}${esc(p.name)}</div>
        </div>`).join('');
      const canStart = list.length>=2;
      $('#startGameBtn').classList.toggle('dim', !canStart);
      $('#lobbyHint').textContent = list.length<2 ? 'Need at least 2 players' : list.length<3 ? 'Some games need 3+ players' : '';
    });
  }

  /* ---- Pack picker with round selector + min players ---- */
  async function showPackPicker() {
    Audio_.stopMusic();
    await FX.wipe();
    Host.hideHost();
    show('#scr-game');
    gameActive=true;
    $('#skipBtn').classList.add('hidden');
    $('#roundPill').textContent='Pick a Game';

    const modeList = Object.keys(MODE_ICONS);
    Host.scene(`
      <div class="lobby-title display">PICK A GAME</div>

      <div class="pack-grid">
        ${modeList.map((m,i)=>`
          <button class="pack-card" data-mode="${m}" style="animation-delay:${i*.08}s">
            <div class="pack-icon">${MODE_ICONS[m]}</div>
            <div class="pack-name display">${esc(t('mode_names')[m])}</div>
            <div class="pack-tag">${esc(t('mode_taglines')[m])}</div>
            <div class="pack-min">👥 <span>${MODE_MIN_PLAYERS[m]}</span> min players</div>
          </button>`).join('')}
      </div>`);

    Audio_.startMusic('lobby');
    net.setState({ phase:'wait', msg:'Watch the main screen!' });

    $$('.pack-card').forEach(btn => btn.addEventListener('click', async () => {
      const mode = btn.dataset.mode;
      const minP = MODE_MIN_PLAYERS[mode]||2;
      if(players.length < minP){
        Audio_.sfx.buzzer();
        btn.classList.add('shake');
        setTimeout(()=>btn.classList.remove('shake'),500);
        const err = document.createElement('div');
        err.style.cssText='position:fixed;bottom:4vmin;left:50%;transform:translateX(-50%);background:var(--pink);color:#fff;font-family:Fredoka One,sans-serif;font-size:18px;padding:12px 28px;border-radius:50px;z-index:50;animation:popIn .3s both';
        err.textContent=`Need ${minP}+ players for this game`;
        document.body.appendChild(err);
        setTimeout(()=>err.remove(),2500);
        return;
      }
      Audio_.sfx.submit();
      await showGameSettings(mode);
    }, {once:true}));
  }

  /* ---- Game settings screen (rounds + content flavor + category for trivia) ---- */
  async function showGameSettings(mode) {
    await FX.wipe();
    $('#roundPill').textContent = t('mode_names')[mode] || mode;
    const isTrivia = mode === 'trivia' || mode === 'quiz';
    const modeName = t('mode_names')[mode] || mode;
    const modeIcon = MODE_ICONS[mode] || '🎮';

    Host.scene(`
      <div class="game-settings-card">
        <div class="gs-header">
          <div class="gs-icon">${modeIcon}</div>
          <div class="gs-title display">${esc(modeName)}</div>
        </div>

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

        ${isTrivia ? `
        <div class="gs-section">
          <div class="gs-label">CATEGORY</div>
          <div class="cat-grid-small">
            ${CAT_INFO.map((c,i)=>`
              <button class="cat-card-sm${window.HYPOX_STATE.category===c.id?' selected':''}" data-cat="${c.id}" style="animation-delay:${i*.06}s">
                <div class="cat-icon-sm">${c.icon}</div>
                <div class="cat-name-sm">${c.name}</div>
              </button>`).join('')}
          </div>
        </div>` : ''}

        <div class="gs-actions">
          <button class="big-btn" id="gsStart">START GAME →</button>
          <button class="bar-btn" id="gsBack">← Back</button>
        </div>
      </div>`);

    // Round buttons
    $$('.round-btn').forEach(btn => btn.addEventListener('click', () => {
      $$('.round-btn').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');
      window.HYPOX_STATE.rounds = +btn.dataset.r;
      Audio_.sfx.blip();
    }));

    // Content flavor
    $$('.content-btn').forEach(btn => btn.addEventListener('click', () => {
      $$('.content-btn').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');
      window.HYPOX_STATE.flavor = btn.dataset.flavor;
      Audio_.sfx.blip();
    }));

    // Category (trivia only)
    if(isTrivia) {
      $$('.cat-card-sm').forEach(btn => btn.addEventListener('click', () => {
        $$('.cat-card-sm').forEach(b=>b.classList.remove('selected'));
        btn.classList.add('selected');
        window.HYPOX_STATE.category = btn.dataset.cat;
        Audio_.sfx.blip();
      }));
    }

    $('#gsBack').addEventListener('click', () => showPackPicker(), {once:true});
    $('#gsStart').addEventListener('click', async () => {
      Audio_.sfx.submit();
      await Host.run(net, players, mode);
      showPackPicker();
    }, {once:true});
  }

  /* ---- Pass & Play overlay ---- */
  function passAndPlayPrompt(spec, player) {
    return new Promise(resolve => {
      const ov = $('#ppOverlay');
      ov.classList.add('show');
      let settled=false;
      const done = value => {
        if(settled) return; settled=true;
        _ppDismiss=null;
        setTimeout(()=>{ ov.classList.remove('show'); resolve(value); },400);
      };
      _ppDismiss = ()=>{ if(settled) return; settled=true; _ppDismiss=null; ov.classList.remove('show'); resolve(null); };
      window.__hypoxDismissPP = ()=>{ if(_ppDismiss) _ppDismiss(); };

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
      $('#ppReady').addEventListener('click', ()=>{
        Audio_.sfx.pop();
        ov.innerHTML=`<div class="pp-card"><div id="ppCtrl"></div></div>`;
        Controller.render($('#ppCtrl'), spec, value=>done(value));
      },{once:true});
    });
  }

  /* ---- JOIN ---- */
  async function joinAsPlayer() {
    const code=$('#joinCode').value.trim().toUpperCase();
    const name=$('#joinName').value.trim();
    if(!code||!name){ Audio_.sfx.buzzer(); return; }
    if(!FirebaseNet.available()){ $('#joinErr').textContent='Firebase not configured.'; return; }
    $('#joinErr').textContent='Connecting…';
    try {
      net=FirebaseNet.create();
      const res=await net.joinRoom(code,name,selectedAvatar);
      myPid=res.pid; isVip=res.isVip;
    } catch(e) {
      $('#joinErr').textContent='Could not connect. Check room code.';
      return;
    }
    show('#scr-controller');
    $('#menuBtn').classList.remove('hidden');
    const ctrl=$('#ctrlArea');
    Controller.waitScreen(ctrl, isVip?'You\'re the host 👑 — start the game when everyone\'s in.':'You\'re in! Watch the main screen.');

    const mstrip=$('#phoneMirror');
    function renderMirror(m){
      if(!m) return;
      mstrip.classList.remove('hidden');
      if(m.pill!==undefined) $('#pmPill').textContent=m.pill||'';
      if(m.headline!==undefined) $('#pmHeadline').textContent=m.headline||'';
      if(m.speech!==undefined){ $('#pmSpeech').textContent=m.speech||''; $('#pmLaith').style.display=m.speech?'flex':'none'; }
    }
    net.onMirror(renderMirror);

    let lastPhaseId=null;
    net.onState(state => {
      if(state.mirror) renderMirror(state.mirror);
      if(state.phase==='input'&&state.phaseId!==lastPhaseId){
        if(!state.targets||state.targets.includes(myPid)){
          lastPhaseId=state.phaseId;
          Audio_.sfx.sting();
          if(navigator.vibrate) navigator.vibrate(120);
          Controller.render(ctrl, state.spec, value=>{ net.submitInput(state.phaseId,value); setTimeout(()=>Controller.waitScreen(ctrl),600); });
        } else {
          Controller.waitScreen(ctrl,'Watch the main screen!');
        }
      } else if(state.phase==='input-split'&&state.phaseId!==lastPhaseId){
        lastPhaseId=state.phaseId;
        const spec=state.specs[myPid]||state.specs._default;
        Audio_.sfx.sting();
        if(navigator.vibrate) navigator.vibrate(120);
        Controller.render(ctrl,spec,value=>{ net.submitInput(state.phaseId,value); setTimeout(()=>Controller.waitScreen(ctrl),600); });
      } else if(state.phase==='wait'){
        Controller.waitScreen(ctrl,state.msg||'Watch the main screen!');
      } else if(state.phase==='winner'){
        ctrl.innerHTML=`<div class="ctrl-wrap"><div class="crown">👑</div><div class="ctrl-title display">${state.emoji} ${esc(state.name)}</div><div class="ctrl-sub">Champion of the night!</div></div>`;
        Audio_.sfx.fanfare();
      }
    });
  }
})();
