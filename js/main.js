/* HYPOX — main.js: routing, lobby, join, avatar picker, pass & play */
(() => {
  const AVATARS_LIST = [
    { emoji:'🦊', color:'#f472b6', label:'Fox' },
    { emoji:'🐼', color:'#60a5fa', label:'Panda' },
    { emoji:'🐸', color:'#34d399', label:'Frog' },
    { emoji:'🦄', color:'#a78bfa', label:'Unicorn' },
    { emoji:'🤖', color:'#fb923c', label:'Robot' },
    { emoji:'🐫', color:'#facc15', label:'Camel' },
    { emoji:'🦅', color:'#38bdf8', label:'Eagle' },
    { emoji:'🐙', color:'#f87171', label:'Octopus' },
    { emoji:'🦁', color:'#fbbf24', label:'Lion' },
    { emoji:'🐢', color:'#4ade80', label:'Turtle' },
    { emoji:'🦋', color:'#c084fc', label:'Butterfly' },
    { emoji:'🐬', color:'#22d3ee', label:'Dolphin' },
    { emoji:'🐺', color:'#94a3b8', label:'Wolf' },
    { emoji:'🦊', color:'#fb923c', label:'Fox2' },
    { emoji:'🐯', color:'#f59e0b', label:'Tiger' },
  ];

  window.HYPOX_STATE = window.HYPOX_STATE || { region: null };
  const REGION_EMOJI = { mena:'🕌', weur:'🗽', asia:'🏯', africa:'🦁', global:'🌍' };

  let net = null, players = [], myPid = null, isVip = false;
  let hostMode = 'tv';
  let selectedAvatar = AVATARS_LIST[Math.floor(Math.random() * AVATARS_LIST.length)];
  let _ppDismiss = null;

  const show = id => { $$('.screen').forEach(s => s.classList.remove('active')); $(id).classList.add('active'); };
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.esc = esc;

  /* ---- boot ---- */
  let booted = false;
  document.addEventListener('DOMContentLoaded', () => {
    if (booted) return; booted = true;
    FX.init();
    applyTheme();
    applyLang();
    paintStatics();
    buildAvatarGrid();

    // Theme picker
    $$('.theme-card').forEach(c => c.addEventListener('click', () => {
      Audio_.unlock(); Audio_.sfx.pop();
      setTheme(c.dataset.theme);
      show('#scr-lang'); paintStatics();
    }));
    $('#backToTheme').addEventListener('click', () => { Audio_.sfx.blip(); show('#scr-theme'); });

    // Lang picker
    $$('.lang-card').forEach(c => c.addEventListener('click', () => {
      Audio_.sfx.pop(); setLang(c.dataset.lang); paintStatics();
      show('#scr-region');
    }));
    $('#backToLang').addEventListener('click', () => { Audio_.sfx.blip(); show('#scr-lang'); });

    // Region picker
    $$('.region-card').forEach(c => c.addEventListener('click', () => {
      Audio_.sfx.submit();
      const r = c.dataset.region;
      window.HYPOX_STATE.region = r === 'global' ? null : r;
      $('#regionBadge').textContent = REGION_EMOJI[r] || '🌍';
      show('#scr-title'); paintStatics(); Audio_.startMusic('lobby');
    }));
    $('#regionBadge').addEventListener('click', () => { Audio_.sfx.blip(); show('#scr-region'); });
    $('#backToRegion').addEventListener('click', () => { Audio_.sfx.blip(); show('#scr-region'); });

    // Title / play modes
    $('#hostBtn').addEventListener('click', () => { Audio_.unlock(); startHost('tv'); });
    $('#phonesBtn').addEventListener('click', () => { Audio_.unlock(); startHost('phones'); });
    $('#offlineBtn').addEventListener('click', () => { Audio_.unlock(); startHost('offline'); });
    $('#joinBtn').addEventListener('click', () => { Audio_.sfx.blip(); show('#scr-join'); paintStatics(); });
    $('#backFromJoin').addEventListener('click', () => { Audio_.sfx.blip(); show('#scr-title'); });

    // Avatar picker
    $('#avatarDone').addEventListener('click', confirmAvatar);
    $('#avatarName').addEventListener('keydown', e => { if (e.key === 'Enter') confirmAvatar(); });
    // backFromAvatar is wired dynamically in showAvatarPicker() per context

    // Lobby
    $('#addLocalBtn').addEventListener('click', () => showAvatarPicker('offline'));
    $('#startGameBtn').addEventListener('click', () => {
      if (players.length < 3) { Audio_.sfx.buzzer(); $('#lobbyHint').classList.add('shake'); setTimeout(() => $('#lobbyHint').classList.remove('shake'), 500); return; }
      showPackPicker();
    });

    // Join
    $('#joinGo').addEventListener('click', joinAsPlayer);
    $('#joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('#joinName').focus(); });
    $('#joinName').addEventListener('keydown', e => { if (e.key === 'Enter') joinAsPlayer(); });

    // Sound / theme toggles
    $('#soundBtn').addEventListener('click', e => {
      const on = Audio_.toggle();
      e.target.textContent = on ? '🔊' : '🔇';
    });
    $('#themeBtn').addEventListener('click', () => {
      setTheme(THEME === 'dark' ? 'light' : 'dark');
      $('#themeBtn').textContent = THEME === 'dark' ? '🌙' : '☀️';
    });
    $('#themeBtn').textContent = THEME === 'dark' ? '🌙' : '☀️';

    // Skip
    $('#skipBtn').addEventListener('click', () => {
      if (window.__hypoxSkip) { window.__hypoxSkip(); window.__hypoxSkip = null; }
    });
  });

  function paintStatics() {
    $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    $$('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  }

  /* ---- Avatar grid ---- */
  function buildAvatarGrid() {
    const grid = $('#avatarGrid');
    grid.innerHTML = AVATARS_LIST.map((av, i) => `
      <button class="avatar-opt ${i===0?'selected':''}" data-i="${i}" style="border-color:${i===0?av.color:''}">
        <div class="avatar-emoji">${av.emoji}</div>
        <div class="avatar-label">${av.label}</div>
      </button>`).join('');
    $$('.avatar-opt').forEach(btn => btn.addEventListener('click', () => {
      Audio_.sfx.vote();
      $$('.avatar-opt').forEach(b => { b.classList.remove('selected'); b.style.borderColor=''; });
      btn.classList.add('selected');
      const i = +btn.dataset.i;
      selectedAvatar = AVATARS_LIST[i];
      btn.style.borderColor = selectedAvatar.color;
    }));
  }

  /* Avatar picker can be shown for: 'offline' (add local player), 'phones' (host self) */
  let _avatarCallback = null;
  function showAvatarPicker(context, cb) {
    _avatarCallback = cb;
    buildAvatarGrid();
    $('#avatarName').value = '';
    // Replace back button listener fresh each call
    const backBtn = $('#backFromAvatar');
    const newBack = backBtn.cloneNode(true);
    backBtn.parentNode.replaceChild(newBack, backBtn);
    newBack.addEventListener('click', () => {
      Audio_.sfx.blip();
      if (context === 'offline') show('#scr-lobby');
      else if (context === 'phones') show('#scr-title');
      else show('#scr-title');
    });
    show('#scr-avatar');
  }

  function confirmAvatar() {
    const name = $('#avatarName').value.trim();
    if (!name) { $('#avatarName').classList.add('shake'); setTimeout(() => $('#avatarName').classList.remove('shake'), 500); return; }
    Audio_.sfx.submit();
    if (_avatarCallback) { _avatarCallback(name, selectedAvatar); return; }
    // offline: add local player directly
    if (net && net.isOffline) {
      const p = net.addLocalPlayer(name, selectedAvatar);
      if (p) { show('#scr-lobby'); }
    }
  }

  /* ---- HOST flow ---- */
  async function startHost(mode) {
    hostMode = mode;
    const offline = mode === 'offline';

    if (!offline && !FirebaseNet.available()) {
      Audio_.sfx.buzzer();
      alert(t('no_firebase'));
      return;
    }

    net = createNet(offline);
    if (offline && !net.isOffline) net = new LocalNet();
    if (net.isOffline) net.promptLocal = passAndPlayPrompt;

    const code = await net.createRoom(LANG);
    $('#roomCodeText').textContent = net.isOffline ? t('offline_badge') : code;
    $('#topbar').classList.add('show');
    $('#roundPill').textContent = t('lobby');

    if (mode === 'phones') {
      // host is also a player — show avatar picker, then register
      showAvatarPicker('phones', async (name, av) => {
        const res = await net.joinRoom(code, name, av);
        myPid = res.pid; isVip = res.isVip;
        net.hostSelfPid = myPid;
        net.promptLocal = passAndPlayPrompt;
        show('#scr-lobby'); setupLobby();
      });
      return;
    }

    show('#scr-lobby');
    setupLobby();
  }

  function setupLobby() {
    $('#localAdd').classList.toggle('hidden', !net.isOffline);
    $('#joinHint').classList.toggle('hidden', net.isOffline);
    if (!net.isOffline) $('#joinHint').innerHTML = t('join_hint').replace(/→/g,'<b>→</b>');

    net.onPlayers(list => {
      const prev = players.length;
      players = list;
      if (list.length > prev) Audio_.sfx.pop();
      $('#playerRow').innerHTML = list.map(p => `
        <div class="player">
          <div class="avatar" style="background:${p.color}">${p.emoji}</div>
          <div class="pname">${p.isVip?'👑 ':''}${esc(p.name)}</div>
        </div>`).join('');
      $('#startGameBtn').classList.toggle('dim', list.length < 3);
      $('#lobbyHint').textContent = list.length < 3 ? t('need_players') : '';
    });
  }

  /* ---- Pack picker ---- */
  const MODE_ICONS = { bluff:'🔍', wyr:'⚖️', interrogation:'🔦', diss:'🎤', quiz:'⚡' };

  async function showPackPicker() {
    Audio_.stopMusic();
    await FX.wipe();
    Host.hideHost();
    show('#scr-game');
    $('#roundPill').textContent = t('pick_pack');
    Host.scene(`
      <div class="lobby-title display">${esc(t('pick_pack'))}</div>
      <div class="pack-grid">
        ${Object.keys(MODE_ICONS).map((m,i) => `
          <button class="pack-card" data-mode="${m}" style="animation-delay:${i*.09}s">
            <div class="pack-icon">${MODE_ICONS[m]}</div>
            <div class="pack-name display">${esc(t('mode_names')[m])}</div>
            <div class="pack-tag">${esc(t('mode_taglines')[m])}</div>
          </button>`).join('')}
      </div>`);
    Audio_.startMusic('lobby');
    net.setState({ phase:'wait', msg:t('watch_screen') });
    $$('.pack-card').forEach(btn => btn.addEventListener('click', async () => {
      Audio_.sfx.submit();
      const mode = btn.dataset.mode;
      await Host.run(net, players, mode);
      showPackPicker();
    }, { once:true }));
  }

  /* ---- Pass & Play overlay ---- */
  function passAndPlayPrompt(spec, player) {
    return new Promise(resolve => {
      const ov = $('#ppOverlay');
      ov.classList.add('show');
      let settled = false;
      const done = value => {
        if (settled) return; settled = true;
        _ppDismiss = null;
        setTimeout(() => { ov.classList.remove('show'); resolve(value); }, 400);
      };
      _ppDismiss = () => { if (settled) return; settled = true; _ppDismiss = null; ov.classList.remove('show'); resolve(null); };
      window.__hypoxDismissPP = () => { if (_ppDismiss) _ppDismiss(); };

      ov.innerHTML = `
        <div class="pp-card">
          <div class="eyebrow">${esc(t('pass_to'))}</div>
          <div class="pp-player">
            <div class="avatar" style="background:${player.color}">${player.emoji}</div>
            <div class="pp-name display">${esc(player.name)}</div>
          </div>
          <button class="big-btn" id="ppReady">${esc(t('tap_ready'))}</button>
        </div>`;
      Audio_.sfx.sting();
      $('#ppReady').addEventListener('click', () => {
        Audio_.sfx.pop();
        ov.innerHTML = `<div class="pp-card"><div id="ppCtrl"></div></div>`;
        Controller.render($('#ppCtrl'), spec, value => done(value));
      }, { once:true });
    });
  }

  /* ---- JOIN (phone) ---- */
  async function joinAsPlayer() {
    const code = $('#joinCode').value.trim().toUpperCase();
    const name = $('#joinName').value.trim();
    if (!code || !name) { Audio_.sfx.buzzer(); return; }
    if (!FirebaseNet.available()) { $('#joinErr').textContent = t('no_firebase'); return; }

    $('#joinErr').textContent = t('connecting');
    try {
      net = FirebaseNet.create();
      const res = await net.joinRoom(code, name, selectedAvatar);
      myPid = res.pid; isVip = res.isVip;
    } catch (e) {
      $('#joinErr').textContent = t('conn_fail');
      return;
    }

    show('#scr-controller');
    const ctrl = $('#ctrlArea');
    Controller.waitScreen(ctrl, isVip ? t('vip_hint') : t('joined_wait'));

    const mstrip = $('#phoneMirror');
    function renderMirror(m) {
      if (!m) return;
      mstrip.classList.remove('hidden');
      if (m.pill !== undefined) $('#pmPill').textContent = m.pill || '';
      if (m.headline !== undefined) $('#pmHeadline').textContent = m.headline || '';
      if (m.speech !== undefined) {
        $('#pmSpeech').textContent = m.speech || '';
        $('#pmLaith').style.display = m.speech ? 'flex' : 'none';
      }
    }
    net.onMirror(renderMirror);

    let lastPhaseId = null;
    net.onState(state => {
      if (state.mirror) renderMirror(state.mirror);
      if (state.phase === 'input' && state.phaseId !== lastPhaseId) {
        if (!state.targets || state.targets.includes(myPid)) {
          lastPhaseId = state.phaseId;
          Audio_.sfx.sting();
          if (navigator.vibrate) navigator.vibrate(120);
          Controller.render(ctrl, state.spec, value => {
            net.submitInput(state.phaseId, value);
            setTimeout(() => Controller.waitScreen(ctrl), 600);
          });
        } else {
          Controller.waitScreen(ctrl, t('watch_screen'));
        }
      } else if (state.phase === 'input-split' && state.phaseId !== lastPhaseId) {
        lastPhaseId = state.phaseId;
        const spec = state.specs[myPid] || state.specs._default;
        Audio_.sfx.sting();
        if (navigator.vibrate) navigator.vibrate(120);
        Controller.render(ctrl, spec, value => {
          net.submitInput(state.phaseId, value);
          setTimeout(() => Controller.waitScreen(ctrl), 600);
        });
      } else if (state.phase === 'wait') {
        Controller.waitScreen(ctrl, state.msg || t('watch_screen'));
      } else if (state.phase === 'winner') {
        ctrl.innerHTML = `<div class="ctrl-wrap"><div class="crown">👑</div>
          <div class="ctrl-title display">${state.emoji} ${esc(state.name)}</div>
          <div class="ctrl-sub">${esc(t('winner'))}</div></div>`;
        Audio_.sfx.fanfare();
      }
    });
  }
})();
