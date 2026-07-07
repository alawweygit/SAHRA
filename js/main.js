/* SAHRA — bootstrap: routing between Title → (Host lobby | Join) → Pack picker → Game */

(() => {
  let net = null, players = [], myPid = null, isVip = false;

  const show = id => {
    $$('.screen').forEach(s => s.classList.remove('active'));
    $(id).classList.add('active');
  };

  // Shared app state (region readable by content.js)
  window.SAHRA_STATE = window.SAHRA_STATE || { region: null };
  const REGION_EMOJI = { mena: '🕌', weur: '🗽', asia: '🏯', africa: '🦁', global: '🌍' };

  /* ------------------------------------------------ boot */
  let booted = false;
  document.addEventListener('DOMContentLoaded', () => {
    if (booted) return; booted = true;
    FX.init();
    applyLang();
    paintStatics();

    // --- language picker ---
    $$('.lang-card').forEach(card => card.addEventListener('click', () => {
      Audio_.unlock(); Audio_.sfx.pop();
      setLang(card.dataset.lang);
      paintStatics();
      show('#scr-region');
    }));

    // --- region picker ---
    $$('.region-card').forEach(card => card.addEventListener('click', () => {
      Audio_.sfx.submit();
      const r = card.dataset.region;
      window.SAHRA_STATE.region = (r === 'global') ? null : r;
      $('#regionBadge').textContent = REGION_EMOJI[r] || '🌍';
      show('#scr-title');
    }));
    $('#regionBack').addEventListener('click', () => { Audio_.sfx.pop(); show('#scr-lang'); });

    // --- region badge on title re-opens region picker ---
    $('#regionBadge').addEventListener('click', () => { Audio_.sfx.pop(); show('#scr-region'); });

    $('#soundBtn').addEventListener('click', e => {
      e.target.textContent = Audio_.toggle() ? '🔊' : '🔇';
    });

    $('#hostBtn').addEventListener('click', () => { Audio_.unlock(); startHost('tv'); });
    $('#phonesBtn').addEventListener('click', () => { Audio_.unlock(); startHost('phones'); });
    $('#offlineBtn').addEventListener('click', () => { Audio_.unlock(); startHost('offline'); });
    $('#joinBtn').addEventListener('click', () => { Audio_.unlock(); show('#scr-join'); paintStatics(); });
    $('#joinGo').addEventListener('click', joinAsPlayer);
    $('#addLocalBtn').addEventListener('click', addLocalPlayer);
    $('#localName').addEventListener('keydown', e => { if (e.key === 'Enter') addLocalPlayer(); });
    $('#startGameBtn').addEventListener('click', () => {
      if (players.length < 3) { Audio_.sfx.buzzer(); $('#lobbyHint').classList.add('shake'); setTimeout(() => $('#lobbyHint').classList.remove('shake'), 500); return; }
      showPackPicker();
    });
  });

  function paintStatics() {
    // Repaint every element carrying a data-i18n key
    $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    $$('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  }

  /* ------------------------------------------------ HOST flow
     mode: 'tv'   → shared screen + remote phones (Firebase)
           'phones' → no TV; creator's phone hosts AND plays (Firebase)
           'offline' → pass & play on one device (LocalNet) */
  let hostMode = 'tv';
  async function startHost(mode) {
    hostMode = mode;
    const offline = mode === 'offline';

    if (!offline && !FirebaseNet.available()) {
      // Online modes need Firebase; guide the user instead of silently degrading.
      Audio_.sfx.buzzer();
      alert(t('no_firebase'));
      return;
    }

    net = createNet(offline);
    if (offline && FirebaseNet && !net.isOffline) net = new LocalNet(); // force

    if (net.isOffline) {
      net.promptLocal = passAndPlayPrompt; // wire the overlay
    }

    const code = await net.createRoom(LANG);
    $('#roomCodeText').textContent = net.isOffline ? t('offline_badge') : code;
    $('#topbar').classList.add('show');
    $('#roundPill').textContent = t('lobby');

    // In phones-only mode the creator is ALSO a player — register them now.
    if (mode === 'phones') {
      const name = (prompt(t('player_name')) || 'Host').trim().slice(0, 14) || 'Host';
      const res = await net.joinRoom(code, name);
      myPid = res.pid; isVip = res.isVip;
      // the host's own turns are collected via the pass&play overlay
      net.hostSelfPid = myPid;
      net.promptLocal = passAndPlayPrompt;
    }

    show('#scr-lobby');
    $('#localAdd').classList.toggle('hidden', !net.isOffline);
    $('#joinHint').classList.toggle('hidden', net.isOffline);

    Audio_.startMusic('lobby');
    Host.say(tPick('banter_lobby'));

    net.onPlayers(list => {
      const prev = players.length;
      players = list;
      if (list.length > prev) Audio_.sfx.pop();
      $('#playerRow').innerHTML = list.map(p => `
        <div class="player">
          ${Host.avatarHTML(p)}
          <div class="pname">${p.isVip ? '👑 ' : ''}${esc(p.name)}</div>
        </div>`).join('');
      $('#startGameBtn').classList.toggle('dim', list.length < 3);
      $('#lobbyHint').textContent = list.length < 3 ? t('need_players') : '';
    });
  }

  function addLocalPlayer() {
    const inp = $('#localName');
    const name = inp.value.trim();
    if (!name) return;
    if (net.addLocalPlayer(name)) { Audio_.sfx.pop(); inp.value = ''; inp.focus(); }
  }

  /* ------------------------------------------------ Pack picker */
  const MODE_ICONS = { bluff: '🎭', wyr: '⚖️', interrogation: '🔦', diss: '🎤', quiz: '⚡' };

  async function showPackPicker() {
    Audio_.stopMusic();
    await FX.wipe();
    Host.hideHost();
    show('#scr-game');
    $('#roundPill').textContent = t('pick_pack');
    Host.scene(`
      <div class="lobby-title display">${esc(t('pick_pack'))}</div>
      <div class="pack-grid">
        ${Object.keys(MODE_ICONS).map((m, i) => `
          <button class="pack-card" data-mode="${m}" style="animation-delay:${i * .1}s">
            <div class="pack-icon">${MODE_ICONS[m]}</div>
            <div class="pack-name display">${esc(t('mode_names')[m])}</div>
            <div class="pack-tag">${esc(t('mode_taglines')[m])}</div>
          </button>`).join('')}
      </div>`);
    Audio_.startMusic('lobby');
    net.setState({ phase: 'wait', msg: t('watch_screen') });

    $$('.pack-card').forEach(btn => btn.addEventListener('click', async () => {
      Audio_.sfx.submit();
      const mode = btn.dataset.mode;
      await Host.run(net, players, mode);
      showPackPicker(); // back to picker, scores persist across packs
    }, { once: true }));
  }

  /* ------------------------------------------------ Pass & Play overlay */
  let _ppDismiss = null;
  function passAndPlayPrompt(spec, player) {
    return new Promise(resolve => {
      const ov = $('#ppOverlay');
      ov.classList.add('show');
      let settled = false;
      const done = value => {
        if (settled) return; settled = true;
        _ppDismiss = null;
        setTimeout(() => { ov.classList.remove('show'); resolve(value); }, 450);
      };
      // Allow the game to force-close this overlay (e.g. round timer expired
      // in phones-only mode before the host submitted).
      _ppDismiss = () => { if (settled) return; settled = true; _ppDismiss = null; ov.classList.remove('show'); resolve(null); };

      // Step 1: pass screen
      ov.innerHTML = `
        <div class="pp-card">
          <div class="eyebrow">${esc(t('pass_to'))}</div>
          <div class="pp-player">${Host.avatarHTML(player)}<div class="pp-name display">${esc(player.name)}</div></div>
          <button class="big-btn" id="ppReady">${esc(t('tap_ready'))}</button>
        </div>`;
      Audio_.sfx.sting();
      $('#ppReady').addEventListener('click', () => {
        Audio_.sfx.pop();
        // Step 2: the actual input
        ov.innerHTML = `<div class="pp-card"><div id="ppCtrl"></div></div>`;
        Controller.render($('#ppCtrl'), spec, value => done(value));
      }, { once: true });
    });
  }
  // exposed so net.collect can close a stale host overlay when a phase ends
  window.__sahraDismissPP = () => { if (_ppDismiss) _ppDismiss(); };

  /* ------------------------------------------------ PLAYER (phone) flow */
  async function joinAsPlayer() {
    const code = $('#joinCode').value.trim().toUpperCase();
    const name = $('#joinName').value.trim();
    if (!code || !name) { Audio_.sfx.buzzer(); return; }
    if (!FirebaseNet.available()) { $('#joinErr').textContent = t('no_firebase'); return; }

    $('#joinErr').textContent = t('connecting');
    try {
      net = FirebaseNet.create();
      const res = await net.joinRoom(code, name);
      myPid = res.pid; isVip = res.isVip;
    } catch (e) {
      $('#joinErr').textContent = t('conn_fail');
      return;
    }

    show('#scr-controller');
    const ctrl = $('#ctrlArea');
    Controller.waitScreen(ctrl, isVip ? t('vip_hint') : t('joined_wait'));

    // Phone mirror: show what's happening on "the screen" right on the phone.
    // Populated from both the mirror channel and the mirror embedded in states.
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
      }
      else if (state.phase === 'input-split' && state.phaseId !== lastPhaseId) {
        lastPhaseId = state.phaseId;
        const spec = state.specs[myPid] || state.specs._default;
        Audio_.sfx.sting();
        if (navigator.vibrate) navigator.vibrate(120);
        Controller.render(ctrl, spec, value => {
          net.submitInput(state.phaseId, value);
          setTimeout(() => Controller.waitScreen(ctrl), 600);
        });
      }
      else if (state.phase === 'wait') {
        Controller.waitScreen(ctrl, state.msg || t('watch_screen'));
      }
      else if (state.phase === 'winner') {
        ctrl.innerHTML = `<div class="ctrl-wrap"><div class="crown">👑</div>
          <div class="ctrl-title display">${state.emoji} ${esc(state.name)}</div>
          <div class="ctrl-sub">${esc(t('winner'))}</div></div>`;
        Audio_.sfx.fanfare();
      }
    });
  }
})();
