/* HYPOX — host engine: the main-screen state machine + all game modes.
   Everything original: format is the classic party-game loop
   (prompt → submit → vote → reveal → score), content & art are ours. */

const Host = (() => {
  let net = null, players = [], phaseCounter = 0, skipResolve = null;
  let currentHost = null;

  /* Pick a random host persona for this game and repaint the blob */
  function pickHost() {
    const roster = (typeof HOSTS !== 'undefined' && HOSTS.length) ? HOSTS : null;
    currentHost = roster ? roster[Math.floor(Math.random() * roster.length)] : null;
    const el = $('#host');
    if (el && currentHost) {
      el.classList.remove('host-purple', 'host-pink', 'host-orange');
      el.classList.add(currentHost.color);
      const nm = el.querySelector('.host-name');
      if (nm) nm.textContent = `${currentHost.nameEn} · ${currentHost.nameAr}`;
      pushMirror({ hostName: `${currentHost.nameEn} · ${currentHost.nameAr}`, hostColor: currentHost.color });
    }
  }
  /* Say a line from the current host's own banter pool (falls back to i18n keys) */
  function hostSay(kind) {
    // Only show host avatar before/after game — not during prompt/vote
    if (kind === 'prompt' || kind === 'vote') return Promise.resolve();
    if (currentHost) {
      const pool = (currentHost.banter[LANG] || currentHost.banter.en || {})[kind];
      if (pool && pool.length) return say(pool[Math.floor(Math.random() * pool.length)]);
    }
    const legacy = { prompt: 'banter_prompt', vote: 'banter_vote', scores: 'banter_scores', reveal: 'banter_reveal', winner: 'banter_winner' }[kind];
    return legacy ? say(tPick(legacy)) : Promise.resolve();
  }

  /* ---------- tiny host-screen helpers ---------- */
  const stage = () => $('#hostStage');

  /* Phones Only gets the same presentation as the host. A debounced DOM
     snapshot is published independently of input state, so timers, revealed
     hints, avatars and score animations stay live without interrupting forms. */
  let sharedObserver = null, sharedTimer = null, lastSharedHTML = '', sharedSceneId = 0;
  function sharedHTML() {
    const source = stage();
    if (!source) return '';
    const clone = source.cloneNode(true);
    clone.querySelectorAll('script,style,iframe,object,embed,.leaflet-pane,.leaflet-control-container').forEach(el => el.remove());
    clone.querySelectorAll('*').forEach(el => {
      el.removeAttribute('id');
      [...el.attributes].forEach(a => {
        if (/^on/i.test(a.name) || /javascript:/i.test(a.value)) el.removeAttribute(a.name);
      });
      if (/^(BUTTON|INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
        el.setAttribute('disabled', '');
        el.setAttribute('tabindex', '-1');
      }
    });
    return clone.innerHTML;
  }
  function publishSharedScreen(force = false) {
    if (!net?.phonesOnly || !net.setSharedScreen) return;
    clearTimeout(sharedTimer);
    sharedTimer = setTimeout(() => {
      const html = sharedHTML();
      if (!force && html === lastSharedHTML) return;
      lastSharedHTML = html;
      net.setSharedScreen({ html, pill: $('#roundPill')?.textContent || '', sceneId: sharedSceneId });
    }, force ? 0 : 120);
  }
  function startSharedScreen() {
    if (!net?.phonesOnly || sharedObserver) return;
    sharedObserver = new MutationObserver(() => publishSharedScreen());
    sharedObserver.observe(stage(), { childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['class','style'] });
    publishSharedScreen(true);
  }
  function stopSharedScreen() {
    sharedObserver?.disconnect(); sharedObserver = null;
    clearTimeout(sharedTimer); sharedTimer = null; lastSharedHTML = '';
  }

  /* Mirror: in phones-only mode there is no shared TV, so we broadcast a
     lightweight text mirror of the stage to every player's phone. Harmless
     (just extra state fields) in TV mode. */
  let mirror = { headline: '', sub: '', pill: '' };
  // Safe player lookup — never returns undefined, uses ghost fallback
  const safeP = pid => players.find(x => x.pid === pid) || { pid, name: '?', emoji: '👤', color: '#555', score: 0, isVip: false };

  function addTranslateBtn(factText) {
    if(LANG === 'ar') return;
    setTimeout(() => {
      const _card = document.querySelector('#hostStage .prompt-card');
      if(!_card || document.getElementById('_hostTxBtn')) return;
      const _tb = document.createElement('button');
      _tb.id = '_hostTxBtn';
      _tb.textContent = '🌐 ترجم';
      _tb.style.cssText = 'background:linear-gradient(135deg,rgba(167,139,250,0.15),rgba(96,165,250,0.15));border:1.5px solid rgba(167,139,250,0.4);border-radius:20px;color:var(--purple);font-size:13px;padding:6px 16px;cursor:pointer;margin:8px auto 0;display:block;font-family:Fredoka One,sans-serif;box-shadow:0 2px 12px rgba(167,139,250,0.2);';
      let _done = false;
      _card.parentNode.insertBefore(_tb, _card.nextSibling);
      _tb.addEventListener('click', async () => {
        if(_done){ _card.innerHTML=esc(factText).replace('___','<span class="blank">&nbsp;???&nbsp;</span>'); _card.dir='ltr'; _tb.textContent='🌐 ترجم'; _done=false; return; }
        _tb.textContent='...';
        try{
          const r=await fetch('https://hypox-ai-backend-production.up.railway.app/api/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:factText,to:'ar'})});
          const d=await r.json();
          if(d.translation){_card.innerHTML=d.translation.replace('___','<span class="blank">&nbsp;???&nbsp;</span>');_card.dir='rtl';_tb.textContent='🔤 English';_done=true;}
          else _tb.textContent='🌐 ترجم';
        }catch(e){_tb.textContent='🌐 ترجم';}
      });
    }, 100);
  }
  function pushMirror(patch) {
    mirror = { ...mirror, ...patch };
    if (net && net.setMirror) net.setMirror({ ...mirror });
  }

  function scene(html) {
    const s = stage();
    sharedSceneId++;
    s.innerHTML = html;
    s.classList.remove('scene-in'); void s.offsetWidth; s.classList.add('scene-in');
    publishSharedScreen(true);
    window.__hypoxResetScroll?.();
  }

  function setPill(text) { $('#roundPill').textContent = text; pushMirror({ pill: text }); publishSharedScreen(); }

  async function say(text, { speed = 24, autoHide = 4000 } = {}) {
    const host = $('#host'), out = $('#speechText');
    pushMirror({ speech: text, hostVisible: true, hostName: currentHost ? `${currentHost.nameEn} · ${currentHost.nameAr}` : '', hostColor: currentHost?.color || 'host-purple' });
    host.classList.add('show', 'talking'); out.textContent = '';
    for (const ch of text) {
      out.textContent += ch;
      if (ch !== ' ' && Math.random() > .55) Audio_.sfx.blip();
      await sleep(speed);
    }
    host.classList.remove('talking');
    await sleep(600);
    // Auto-dismiss after display time
    setTimeout(() => {
      host.classList.remove('show');
      pushMirror({ speech: '', hostVisible: false });
    }, autoHide);
  }
  const hideHost = () => { $('#host').classList.remove('show'); pushMirror({ hostVisible: false }); };

  function avatarHTML(p, cls = 'avatar') {
    return `<div class="${cls}" style="background:${p.color}">${p.emoji}</div>`;
  }

  function skippable() {
    return new Promise(res => { window.__hypoxSkip = () => { window.__hypoxSkip = null; res('skip'); }; });
  }

  const autoplayEnabled = () => window.HYPOX_STATE?.autoplay === true;
  const inputDeadline = seconds => autoplayEnabled() ? Date.now() + seconds * 1000 : null;
  const inputTimeout = seconds => autoplayEnabled() ? seconds * 1000 : 9e7;

  /* ---------- input collection with big timer ---------- */
  async function collectWithTimer(spec, pids, seconds, statusLabelFn) {
    const phaseId = 'ph' + (++phaseCounter);
    const deadline = inputDeadline(seconds);

    pushMirror({ headline: spec.context || spec.title || '', sub: spec.title || '' });
    net.setState({ phase: 'input', phaseId, spec, targets: pids, deadline, mirror: { ...mirror } });
    try { Audio_.startMusic('tension'); } catch(e) {}

    // Auto-submit answers for bot players
    const botPids = net.getBotPids ? net.getBotPids() : [];
    const botPidsInRound = pids.filter(p => botPids.includes(p));
    if (botPidsInRound.length > 0 && net.room) {
      botPidsInRound.forEach(botPid => {
        const delay = 1500 + Math.random() * 2500; // 1.5-4s thinking time
        setTimeout(async () => {
          try {
            let botVal;
            if (spec.type === 'choice' || spec.type === 'higherlow') {
              const opts = spec.options || [];
              botVal = opts.length ? opts[Math.floor(Math.random() * opts.length)].id : 0;
            } else if (spec.type === 'text') {
              const fakes = LANG==='ar'
                ? ['ربما','لا أعرف','يمكن','أكيد','ممكن','شايف','معقول']
                : ['Maybe','Idk','Could be','Probably','Nope','Sure','Hmm'];
              botVal = fakes[Math.floor(Math.random() * fakes.length)];
            } else if (spec.type === 'number') {
              botVal = String(Math.floor(Math.random() * 9000) + 1000);
            } else {
              botVal = 'bot';
            }
            await net.room(`inputs/${phaseId}/${botPid}`).set({ v: botVal, t: Date.now() });
          } catch(e) {}
        }, delay);
      });
    }
    // status row of mini avatars
    const row = $('#statusRow');
    if (row) {
      row.innerHTML = pids.map(pid => {
        const p = safeP(pid);
        const _st = (window._hypoxPresence||{})[pid];
        const _off = _st==='away'||_st==='offline';
        return `<div class="mini${_off?' mini-offline':''}" id="mini-${pid}" style="${_off?'opacity:0.4;filter:grayscale(0.8)':''}">${avatarHTML(p)}<div class="check">✓</div></div>`;
      }).join('');
    }
    net.onEachInput(pid => {
      Audio_.sfx.submit();
      const el = $('#mini-' + pid);
      if (el) el.classList.add('done');
    });

    // countdown (online only — offline is turn-based, no global clock)
    let timerInt = null;
    const CIRC = 276.5;
    // Ring timer removed per design decision — speed scoring handles urgency
    $('#ringTimer')?.classList.add('hidden');
    if (false && net.isOffline) {
      const num = $('#timerNum'), fill = $('#timerFill');
      if (fill) { fill.style.transition = 'none'; fill.style.strokeDashoffset = 0; await sleep(40); fill.style.transition = 'stroke-dashoffset .95s linear'; }
      timerInt = setInterval(() => {
        const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        if (num) {
          num.textContent = left;
          num.classList.toggle('danger', left <= 5 && left > 0);
        }
        if (fill) fill.style.strokeDashoffset = (1 - left / seconds) * CIRC;
        if (left <= 5 && left > 0) Audio_.sfx.tickLow();
        else if (left <= 10 && left > 0) Audio_.sfx.tick();
      }, 1000);
    }

    // Manual pacing must not silently complete a phase when its old 12–60s
    // response timer expires. It still proceeds normally once everyone answers.
    const inputs = await net.collect(phaseId, spec, pids, net.isOffline ? 9e7 : inputTimeout(seconds));
    if (timerInt) clearInterval(timerInt);
    try { Audio_.stopMusic(); } catch(e) {}
    net.setState({ phase: 'wait', msg: LANG==='ar'?'👆 تابع الشاشة':'👆 Watch the screen', mirror: { ...mirror } });
    net.onEachInput(null);
    if (Object.keys(inputs).length === pids.length) Audio_.sfx.sting();
    else Audio_.sfx.buzzer();
    return inputs;
  }

  /* ---------- shared frames ---------- */
  function frameWithTimer(innerHTML, eyebrow) {
    return `
      <div class="eyebrow">${esc(eyebrow || '')}</div>
      ${innerHTML}
      <div class="ring-timer" id="ringTimer">
        <svg viewBox="0 0 100 100">
          <circle class="ring-bg" cx="50" cy="50" r="44"/>
          <circle class="ring-fg" id="timerFill" cx="50" cy="50" r="44"/>
        </svg>
        <div class="timer-num" id="timerNum"></div>
      </div>
      <div id="statusRow" class="status-row"></div>`;
  }

  async function modeTitleCard(mode) {
    // Skip tutorial on play again
    if (window.__hypoxSkipTutorial) {
      const contentMode = mode === 'trivia' ? 'quiz' : mode;
      Content.preload(contentMode, LANG, window.HYPOX_STATE?.rounds||5).catch(()=>{});
      return;
    }
    await FX.wipe();
    Audio_.stopMusic();
    Audio_.sfx.versus();
    const startLabel = LANG === 'ar' ? 'ابدأ ▶' : 'START ▶';
    // Start the AI request while players read the tutorial, then consume the
    // exact same promise when the round begins.
    const contentMode = mode === 'trivia' ? 'quiz' : mode;
    // Use same count as game will request — ensures cache hit on START
    const preloadCount = window.HYPOX_STATE?.rounds || 5;
    Content.preload(contentMode, LANG, preloadCount).catch(()=>{});
    const icon = (typeof MODE_ICONS !== 'undefined' ? MODE_ICONS : {})[mode] || '🎮';
    const rulesText = t('mode_rules')[mode] || '';
    const bulletRules = rulesText.split('.').filter(s=>s.trim().length>5).slice(0,3)
      .map(s=>`<div class="tutorial-bullet">▸ ${esc(s.trim())}.</div>`).join('');
    // Broadcast to phones so they see game name + tagline while host reads the card
    const modeName = t('mode_names')[mode] || mode;
    const tagline = t('mode_taglines')[mode] || '';
    const shortRules = rulesText.split('.').filter(s=>s.trim().length>5).slice(0,2).map(s=>s.trim()).join('. ');
    net.setState({ phase: 'gameinfo', modeName, icon, tagline, rules: shortRules });
    scene(`
      <div class="mode-card">
        <div class="tutorial-icon">${icon}</div>
        <div class="mode-title display">${esc(modeName)}</div>
        <div class="mode-tag">${esc(tagline)}</div>
        <div class="tutorial-bullets">${bulletRules}</div>
        <button class="big-btn pulse-btn" id="startModeBtn" style="margin-top:2vmin">${startLabel}</button>
      </div>`);
    setPill(modeName);
    hostSay('gamestart');
    await new Promise(res => {
      const btn = document.getElementById('startModeBtn');
      let timer = null;
      const onStart = () => {
        window.__hypoxSkip = null;
        if (timer) clearInterval(timer);
        if (btn) { btn.disabled = true; btn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:8px"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="animation:spin 0.8s linear infinite"><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" stroke-width="3"/><path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>Loading…</span>'; }
        res();
      };
      if (btn) {
        btn.addEventListener('click', onStart, { once: true });
        if (window.HYPOX_STATE?.autoplay) {
          let left = 8;
          btn.textContent = `${startLabel} (${left})`;
          timer = setInterval(() => {
            left--;
            if (left <= 0) { onStart(); return; }
            btn.textContent = `${startLabel} (${left})`;
          }, 1000);
        }
      }
      window.__hypoxSkip = onStart;
    });
  }

  async function showScores(final = false) {
    await FX.wipe();
    Audio_.startMusic('results');
    setPill(final ? t('final_results') : t('scores'));
    const sorted = players.slice().sort((a, b) => b.score - a.score);
    const max = Math.max(...sorted.map(p => p.score), 1);
    // Broadcast leaderboard to every phone (not just host screen)
    pushMirror({
      pill: final ? t('final_results') : t('scores'),
      headline: final ? '🏆 ' + (t('final_results')||'Final Results') : '📊 ' + (t('scores')||'Scores'),
      scores: sorted.map((p,i) => ({ medal: ['🥇','🥈','🥉'][i]||'', name: p.name, score: p.score })),
    });
    scene(`
      <div class="lobby-title display">${final ? esc(t('final_results')) : esc(t('scores'))}</div>
      <div class="score-list">
        ${sorted.map((p, i) => `
          <div class="score-row" style="animation-delay:${i * .12}s">
            <div class="medal">${['🥇','🥈','🥉'][i] || ''}</div>
            ${avatarHTML(p)}
            <div class="bar-track${p.score===0?' zero-track':''}">
              <div class="bar-fill" id="bar-${p.pid}" style="background:${p.color};width:0"><span class="bar-name">${esc(p.name)}</span><span class="bar-pts" id="pts-${p.pid}">${p.score===0?'':'0'}</span></div>
              ${p.score===0?`<div class="bar-zero"><span>${esc(p.name)}</span><span>0</span></div>`:''}
            </div>
          </div>`).join('')}
      </div>`);
    await sleep(300);
    sorted.forEach((p, i) => setTimeout(() => {
      if(i===0)Audio_.sfx.submit();
      const b = $('#bar-' + p.pid);
      const ptsEl = $('#pts-' + p.pid);
      if (b) b.style.width = p.score > 0 ? Math.max(18, (p.score / max) * 100) + '%' : '0';
      // Count up the score number
      if (ptsEl && p.score > 0) {
        const dur = 900, steps = 20, step = p.score / steps;
        let cur = 0, n = 0;
        const iv = setInterval(() => {
          n++; cur = n >= steps ? p.score : Math.round(step * n);
          ptsEl.textContent = cur.toLocaleString();
          if (n >= steps) clearInterval(iv);
        }, dur / steps);
      } else if (ptsEl) {
        ptsEl.textContent = '0';
      }
    }, i * 80));
    await sleep(800);
    await hostSay('scores');
    Audio_.stopMusic();
    if (!final) {
      await waitNext(10); // 10s autoplay countdown — plenty of time to read
    } else {
      await sleep(2500); // longer pause on final scores before winner scene
    }
  }

  async function winnerScene() {
    await showScores(true);
    await FX.wipe();
    hideHost();
    const sorted = players.slice().sort((a, b) => b.score - a.score);
    const w = sorted[0];
    setPill(t('final_results'));
    scene(`
      <div class="crown">👑</div>
      <div class="winner-name display">${w.emoji} ${esc(w.name)}</div>
      <div class="tagline">${esc(t('winner'))}</div>
      <div class="final-lb">${sorted.map((p,i)=>`<div class="final-lb-row"><span class="final-medal">${['🥇','🥈','🥉'][i]||((i+1)+'.')}</span>${avatarHTML(p)}<span class="final-name">${esc(p.name)}</span><span class="final-pts">${p.score}</span></div>`).join('')}</div>
      <div style="display:flex;flex-direction:column;gap:12px;margin-top:2vmin;align-items:center;">
        <button class="big-btn" id="againBtn" style="max-width:340px;width:100%">🔄 ${LANG==='ar'?'العب مرة ثانية':'Play Again'}</button>
        <button class="big-btn ghost" id="changeGameBtn" style="max-width:340px;width:100%">🎮 ${LANG==='ar'?'العب لعبة ثانية':'Play Another Game'}</button>
      </div>`);
    Audio_.sfx.crown(); Audio_.sfx.fanfare();
    await say(tPick('banter_winner')||'');
    FX.shake(); FX.burst(260, true);
    setTimeout(() => FX.burst(180, true), 900);
    net.setState({ phase: 'winner', name: w.name, emoji: w.emoji });
    await new Promise(res => {
      document.getElementById('againBtn')?.addEventListener('click', () => { window.__hypoxPlayAgain = true; res(); }, { once: true });
      document.getElementById('changeGameBtn')?.addEventListener('click', () => {
        players.forEach(p => p.score = 0); // reset scores for fresh start
        window.__hypoxAbort = true;
        if(window.__hypoxShowPackPicker) window.__hypoxShowPackPicker(); else if(window.__hypoxShowScreen) window.__hypoxShowScreen('#scr-games');
        res();
      }, { once: true });
    });
  }

  function addScore(pid, pts) {
    const p = safeP(pid);
    if (!p) return;
    p.score += pts;
    net.updateScore(pid, p.score);
  }

  const val = (inputs, pid) => inputs[pid] ? inputs[pid].value : null;

  /* ================================================================
     MODE 1 — BLUFF BANQUET  (write a lie, find the truth)
  ================================================================ */
  async function playBluff() {
    await modeTitleCard('bluff');
    const numRounds = window.HYPOX_STATE?.rounds||3;
    const rounds = await Content.get('bluff', LANG, numRounds);

    for (let r = 0; r < rounds.length; r++) {
      const R = rounds[r];
      await FX.wipe();
      setPill(`${t('round')} ${r + 1} ${t('of')} ${rounds.length}`);
      scene(frameWithTimer(
        `<div class="prompt-card display">${esc(R.fact).replace('___', '<span class="blank">&nbsp;???&nbsp;</span>')}</div>`,
        t('write_lie')));
      hostSay('prompt');

      const _bluffBots = net.getBotPids ? net.getBotPids() : [];
      const pids = [...new Set([...players.map(p => p.pid), ...(net.hostSelfPid && !_bluffBots.includes(net.hostSelfPid) ? [net.hostSelfPid] : [])])];

      const inputs = await collectWithTimer(
        { type: 'text', title: t('write_lie'), context: R.fact.replace('___', '____'), translateContext: R.fact, maxLen: 30, enforceUnique: true, oneWord: true },
        pids, 60);

      // Build answer set: unique lies + truth (all UPPERCASE)
      const truthUp = R.truth.toUpperCase();
      const seen = new Set([truthUp]);
      const lies = [];
      const truthWriters = []; // players who wrote the correct answer
      for (const pid of pids) {
        const v = (val(inputs, pid) || '').trim().toUpperCase().slice(0, 60);
        if (!v) continue;
        if (v === truthUp) {
          // Player wrote the truth — they get credit, don't add as separate answer
          truthWriters.push(pid);
        } else if (!seen.has(v)) {
          seen.add(v); lies.push({ text: v, by: pid });
        }
      }
      const answers = shuffle([{ text: truthUp, truth: true, writers: truthWriters }, ...lies]);

      // VOTE — each player picks (can't pick own lie)
      await FX.wipe();
      setPill(t('vote_title'));
      scene(`
        <div class="eyebrow">${esc(t('pick_truth'))}</div>
        <div class="prompt-card small display">${esc(R.fact).replace('___', '<span class="blank">&nbsp;???&nbsp;</span>')}</div>
        <div class="answer-grid" id="answerGrid">
          ${answers.map((a, i) => `
            <div class="ans-card" id="card-${i}" style="animation-delay:${i * .12}s">
              <div class="ans-inner">
                <div class="ans-face ans-front"><div>${esc(a.text)}</div><div class="voter-strip" id="voters-${i}"></div></div>
                <div class="ans-face ans-back ${a.truth ? 'truth' : 'lie'}">
                  <div class="ans-tag">${a.truth ? '✦ ' + esc(t('truth')) + ' ✦' : esc(t('a_lie_by'))}</div>
                  <div>${a.truth ? esc(a.text) : ''}</div>
                </div>
              </div>
            </div>`).join('')}
        </div>
        <div id="statusRow" class="status-row"></div>`);
      answers.forEach((a, i) => setTimeout(() => Audio_.sfx.pop(), i * 120));
      hostSay('vote');

      // Build per-player excludeId map (each player can't vote for their own lie)
      const _bluffExcludeMap = {};
      const _allVoters = [...pids, ...(net.hostSelfPid ? [net.hostSelfPid] : [])];
      for (const pid of _allVoters) {
        const ownIdx = answers.findIndex(a => !a.truth && a.by === pid);
        if (ownIdx !== -1) _bluffExcludeMap[pid] = ownIdx;
      }
      // For host self-vote: find and exclude host's own lie index
      const _hostExcludeIdx = net.hostSelfPid ? answers.findIndex(a => !a.truth && a.by === net.hostSelfPid) : -1;
      const votes = await collectWithTimer({
        type: 'choice', title: t('pick_truth'),
        options: answers.map((a, i) => ({ id: i, label: a.text })),
        playerExcludes: _bluffExcludeMap,
        hostExcludeIdx: _hostExcludeIdx,
      }, pids, 30);

      // land voters on cards (skip self-votes on own lie)
      const votesByCard = answers.map(() => []);
      for (const pid of pids) {
        const v = val(votes, pid);
        if (v === null || v === undefined) continue;
        const a = answers[v];
        if (!a) continue;
        if (!a.truth && a.by === pid) continue; // own lie doesn't count
        votesByCard[v].push(pid);
      }
      for (let i = 0; i < answers.length; i++) {
        for (const pid of votesByCard[i]) {
          Audio_.sfx.vote();
          const p = safeP(pid);
          const strip = $('#voters-' + i);
          if (strip) strip.insertAdjacentHTML('beforeend',
            `<div class="voter" style="background:${p.color}">${p.emoji}</div>`);
          await sleep(380);
        }
      }
      await sleep(500);
      hideHost();

      // reveal lies first
      for (let i = 0; i < answers.length; i++) {
        const a = answers[i];
        if (a.truth) continue;
        await sleep(650);
        const card = $('#card-' + i);
        const author = safeP(a.by);
        card.querySelector('.ans-back div:last-child').textContent = author ? `${author.emoji} ${author.name}` : '?';
        card.classList.add('flipped');
        await sleep(400);
        Audio_.sfx.buzzer(); card.classList.add('shake'); FX.shake(); FX.burstAt(card, 26);
        const fooled = votesByCard[i].length;
        if (fooled && author) {
          addScore(a.by, fooled * 500);
          FX.flyPoints(card, `+${fooled * 500} ${author.name}`);
        }
        await sleep(850);
      }
      // then truth
      Audio_.sfx.drum();
      await say(LANG === 'ar' ? '…والحقيقة هي' : 'And the truth is…', { speed: 40 });
      hideHost();
      const ti = answers.findIndex(a => a.truth);
      const tCard = $('#card-' + ti);
      tCard.classList.add('flipped');
      await sleep(350);
      Audio_.sfx.reveal(); FX.shake(); FX.burst(150); FX.burstAt(tCard, 40);
      const finders = votesByCard[ti];
      // Also give points to players who WROTE the truth
      const truthAns = answers[ti];
      const writerPids = truthAns.writers || [];
      // Combine voters and writers (no duplicates)
      const allWinners = [...new Set([...finders, ...writerPids])];
      allWinners.forEach(pid => addScore(pid, 1000));
      if (allWinners.length) {
        const names = allWinners.map(pid => safeP(pid)?.name).filter(Boolean).join(' & ');
        FX.flyPoints(tCard, `+1000 ${names}`);
      }
      // Special callout for truth writers
      if (writerPids.length) {
        const writerNames = writerPids.map(pid => safeP(pid)?.name).filter(Boolean).join(' & ');
        await sleep(400);
        await say(LANG === 'ar' ? `🎯 ${writerNames} كتب الإجابة الصحيحة!` : `🎯 ${writerNames} wrote the truth!`, { speed: 35 });
        hideHost();
      }
      await sleep(1600);
      await showScores();
    }
  }

  /* ================================================================
     MODE 2 — WOULD YOU RATHER: KNOW YOUR CREW
     Each player is hot seat once. 3 questions shown at once.
     Everyone answers simultaneously. Reveal who knows who best.
  ================================================================ */
  async function playWyr() {
    await modeTitleCard('wyr');
    const QS_PER_PLAYER = 3;
    const totalNeeded = players.length * QS_PER_PLAYER;
    const allPrompts = await Content.get('wyr', LANG, totalNeeded);
    // Give each player exactly QS_PER_PLAYER questions
    const playerTurns = players.map((p, i) => ({
      player: p,
      questions: allPrompts.slice(i * QS_PER_PLAYER, i * QS_PER_PLAYER + QS_PER_PLAYER)
    }));
    // Track scores per (predictor → subject)
    const knowScores = {}; // knowScores[predictorPid][subjectPid] = correct count

    for (let r = 0; r < playerTurns.length; r++) {
      const { player: target, questions } = playerTurns[r];
      if (!questions.length) continue;
      await FX.wipe();
      setPill(`${LANG==='ar'?'دور':'Turn'} ${r+1} ${LANG==='ar'?'من':'of'} ${playerTurns.length}`);
      // "Whose turn" announcement — 3D card flip
      scene(`
        <div style="text-align:center;padding:3vmin 2vmin;display:flex;flex-direction:column;align-items:center;gap:1.5vmin">
          <div style="font-family:'Fredoka One',sans-serif;font-size:clamp(12px,2vmin,16px);color:var(--text2);letter-spacing:3px;text-transform:uppercase;animation:fadeSlideUp 0.4s both">${LANG==='ar'?'شكثر تعرف':'HOW WELL DO YOU KNOW'}</div>
          <div style="position:relative;margin:1vmin auto;animation:wyrTrophyPop 0.7s 0.2s both cubic-bezier(0.34,1.56,0.64,1)">
            <div style="width:clamp(100px,16vmin,140px);height:clamp(100px,16vmin,140px);border-radius:50%;background:radial-gradient(circle at 35% 35%,rgba(255,255,255,0.15),transparent);box-shadow:0 0 40px ${target.color||'#a78bff'}88,0 0 80px ${target.color||'#a78bff'}44;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:clamp(52px,9vmin,80px);">${target.emoji||'😊'}</div>
            <div style="position:absolute;inset:-4px;border-radius:50%;border:3px solid ${target.color||'#a78bff'};animation:wyrRingPulse 1.5s ease-in-out infinite;"></div>
          </div>
          <div style="font-family:'Fredoka One',sans-serif;font-size:clamp(30px,6vmin,60px);color:var(--text);animation:fadeSlideUp 0.5s 0.6s both;line-height:1">${esc(target.name)}</div>
          <div style="display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#ff3d8a33,#ff3d8a11);border:1.5px solid #ff3d8a66;border-radius:30px;padding:6px 20px;animation:fadeSlideUp 0.5s 0.8s both">
            <span style="font-size:clamp(14px,2vmin,18px)">🔥</span>
            <span style="font-family:'Fredoka One',sans-serif;font-size:clamp(13px,2vmin,17px);color:#ff3d8a">${LANG==='ar'?'على الكرسي الساخن':'is in the hot seat'}</span>
          </div>
        </div>`);
      net.setState({ phase:'wait', msg: `${LANG==='ar'?'شكثر تعرف':'How well do you know'} ${target.name}?` });
      await sleep(2800);
      await FX.wipe();

      // Build 3-question spec for phones
      const wyrQSpecs = questions.map((Q, qi) => ({
        qIndex: qi,
        a: Q.a, b: Q.b
      }));
      const phoneWyrSpec = {
        type: 'wyr-multi',
        targetName: target.name,
        targetPid: target.pid,
        questions: wyrQSpecs,
      };

      // Host screen: avatar + status row only (host answers via buttons like everyone else)
      scene(frameWithTimer(`
        <div class="hotseat">${avatarHTML(target)}<div class="pname">${esc(target.name)}</div></div>
        <div id="statusRow" class="status-row" style="margin-top:12px"></div>`, t('mode_names')['wyr']));

      const phaseId = 'ph' + (++phaseCounter);
      net.setState({
        phase: 'input-split', phaseId, deadline: inputDeadline(45),
        specs: { _default: phoneWyrSpec },
      });

      const statusRow = $('#statusRow');
      if (statusRow) statusRow.innerHTML = players.map(p => `<div class="mini" id="mini-${p.pid}">${avatarHTML(p)}<div class="check">✓</div></div>`).join('');
      net.onEachInput(pid => { Audio_.sfx.submit(); $('#mini-' + pid)?.classList.add('done'); });

      const botPids = net.getBotPids ? net.getBotPids() : [];
      players.filter(p => botPids.includes(p.pid)).forEach(botP => {
        setTimeout(async () => {
          try {
            const picks = questions.map(() => Math.random() < 0.5 ? 'a' : 'b');
            await net.room('inputs/' + phaseId + '/' + botP.pid).set({ v: picks.join(','), t: Date.now() });
          } catch(e) {}
        }, 1000 + Math.random() * 2500);
      });

      // Host renders 3 sets of cyan/pink buttons locally
      if (net.hostSelfPid) {
        const hostWyrWrap = document.createElement('div');
        hostWyrWrap.id = 'wyrHostBtns';
        hostWyrWrap.className = 'host-only-ui';
        hostWyrWrap.style.cssText = 'width:100%;max-width:680px;margin-top:8px;display:flex;flex-direction:column;gap:10px;padding:0 12px;box-sizing:border-box;';
        const hostAnswers = new Array(questions.length).fill(null);
        const btnStyle = (bg,fg) => `flex:1;min-height:56px;padding:12px 10px;border-radius:16px;background:${bg};color:${fg};font-family:'Fredoka One',sans-serif;font-size:clamp(13px,1.8vmin,18px);border:none;cursor:pointer;line-height:1.3;word-break:break-word;font-weight:700;transition:opacity 0.2s;`;
        questions.forEach((Q, qi) => {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;gap:8px;align-items:stretch;';
          row.innerHTML = `<button id="wyrH_${qi}_a" style="${btnStyle('#2de1fc','#000')}">${esc(Q.a)}</button><div style="font-family:'Fredoka One',sans-serif;font-size:16px;color:var(--text3);display:flex;align-items:center;padding:0 4px;flex-shrink:0">VS</div><button id="wyrH_${qi}_b" style="${btnStyle('#ff3d8a','#fff')}">${esc(Q.b)}</button>`;
          hostWyrWrap.appendChild(row);
          const pick = (v) => {
            hostAnswers[qi] = v;
            const btnA = document.getElementById(`wyrH_${qi}_a`);
            const btnB = document.getElementById(`wyrH_${qi}_b`);
            if (btnA) { btnA.style.opacity = v==='a' ? '1' : '0.35'; btnA.disabled = true; }
            if (btnB) { btnB.style.opacity = v==='b' ? '1' : '0.35'; btnB.disabled = true; }
            // If all answered, submit
            if (hostAnswers.every(a => a !== null)) {
              hostWyrWrap.remove();
              net.room('inputs/' + phaseId + '/' + net.hostSelfPid).set({ v: hostAnswers.join(','), t: Date.now() }).catch(()=>{});
            }
          };
        });
        document.getElementById('hostStage')?.appendChild(hostWyrWrap);
        // Wire buttons AFTER appending to DOM
        questions.forEach((Q, qi) => {
          document.getElementById(`wyrH_${qi}_a`)?.addEventListener('click', () => {
            Audio_.sfx.submit();
            hostAnswers[qi] = 'a';
            const btnA = document.getElementById(`wyrH_${qi}_a`);
            const btnB = document.getElementById(`wyrH_${qi}_b`);
            if (btnA) { btnA.style.opacity='1'; btnA.style.outline='3px solid #fff'; }
            if (btnB) { btnB.style.opacity='0.35'; btnB.style.outline='none'; }
            if (hostAnswers.every(a => a !== null)) {
              hostWyrWrap.remove();
              net.room('inputs/' + phaseId + '/' + net.hostSelfPid).set({ v: hostAnswers.join(','), t: Date.now() }).catch(()=>{});
            }
          });
          document.getElementById(`wyrH_${qi}_b`)?.addEventListener('click', () => {
            Audio_.sfx.submit();
            hostAnswers[qi] = 'b';
            const btnA = document.getElementById(`wyrH_${qi}_a`);
            const btnB = document.getElementById(`wyrH_${qi}_b`);
            if (btnA) { btnA.style.opacity='0.35'; btnA.style.outline='none'; }
            if (btnB) { btnB.style.opacity='1'; btnB.style.outline='3px solid #fff'; }
            if (hostAnswers.every(a => a !== null)) {
              hostWyrWrap.remove();
              net.room('inputs/' + phaseId + '/' + net.hostSelfPid).set({ v: hostAnswers.join(','), t: Date.now() }).catch(()=>{});
            }
          });
        });
      }

      const all = await net.collect(phaseId, null, players.map(p => p.pid), inputTimeout(45));
      net.onEachInput(null);
      net.setState({ phase: 'wait', msg: t('watch_screen') });

      // Parse answers: stored as "a,b,a" strings
      const parseAnswers = (entry) => entry?.value ? String(entry.value).split(',') : [];
      const targetAnswers = parseAnswers(all[target.pid]);
      // Fill missing answers randomly
      while (targetAnswers.length < questions.length) targetAnswers.push(Math.random()<.5?'a':'b');

      // Reveal: show all 3 questions with what target picked + who guessed right
      await FX.wipe();
      Audio_.sfx.drum();

      // Build per-predictor correct counts for this turn
      const others = players.filter(p => p.pid !== target.pid);
      const turnCorrect = {}; // pid -> correct count
      others.forEach(p => { turnCorrect[p.pid] = 0; });

      const revealRows = questions.map((Q, qi) => {
        const tPick = targetAnswers[qi];
        const tLabel = tPick === 'a' ? Q.a : Q.b;
        const predictorResults = others.map(p => {
          const pAnswers = parseAnswers(all[p.pid]);
          const pPick = pAnswers[qi] || null;
          const correct = pPick === tPick;
          if (correct) turnCorrect[p.pid]++;
          return `<div class="wyr-reveal-predictor ${correct?'correct':'wrong'}">${avatarHTML(p)}<div class="wyr-reveal-check">${correct?'✓':'✗'}</div></div>`;
        }).join('');
        return `
          <div class="wyr-reveal-row">
            <div class="wyr-reveal-q">
              <span class="wyr-reveal-${tPick==='a'?'a':'b'}">${esc(tLabel)}</span>
            </div>
            <div class="wyr-reveal-predictors">${predictorResults}</div>
          </div>`;
      }).join('');

      scene(`
        <div class="hotseat">${avatarHTML(target)}<div class="pname">${esc(target.name)}</div></div>
        <div class="wyr-reveal-block">${revealRows}</div>`);

      await sleep(1000);
      Audio_.sfx.reveal(); FX.burst(80);

      // Award points and track know-scores
      for (const p of others) {
        const correct = turnCorrect[p.pid];
        const pts = correct * 500;
        if (pts > 0) addScore(p.pid, pts);
        if (!knowScores[p.pid]) knowScores[p.pid] = {};
        knowScores[p.pid][target.pid] = correct;
      }

      // Mini leaderboard: who knows target best
      const bestPredictor = others.reduce((best, p) => {
        const c = turnCorrect[p.pid] || 0;
        return (!best || c > (turnCorrect[best.pid]||0)) ? p : best;
      }, null);
      if (bestPredictor) {
        const bestCount = turnCorrect[bestPredictor.pid];
        await say(LANG==='ar'
          ? `${bestPredictor.name} يعرف ${target.name} أكثر — ${bestCount}/${questions.length} ✓`
          : `${bestPredictor.name} knows ${target.name} best — ${bestCount}/${questions.length} ✓`);
      }
      await waitNext();
    }

    // Final summary: who knows the whole group best
    await FX.wipe();
    const totalByPredictor = {};
    players.forEach(p => {
      totalByPredictor[p.pid] = Object.values(knowScores[p.pid]||{}).reduce((a,b)=>a+b,0);
    });
    const groupBest = players.reduce((best, p) => {
      return (totalByPredictor[p.pid]||0) > (totalByPredictor[best.pid]||0) ? p : best;
    }, players[0]);
    const maxPossible = (players.length - 1) * QS_PER_PLAYER; // each player can't vote for themselves
    const groupBestTotal = totalByPredictor[groupBest.pid]||0;
    scene(`
      <div style="text-align:center;padding:2vmin;perspective:1000px">
        <div style="font-family:'Fredoka One',sans-serif;font-size:clamp(14px,2.2vmin,20px);color:var(--text2);letter-spacing:2px;text-transform:uppercase;animation:fadeSlideUp 0.5s both">${LANG==='ar'?'الفائز':'WINNER'}</div>
        <div style="font-family:'Fredoka One',sans-serif;font-size:clamp(20px,3.5vmin,30px);color:var(--yellow);margin-bottom:2vmin;animation:fadeSlideUp 0.5s 0.1s both">${LANG==='ar'?'أكثر واحد يعرف المجموعة':'Knows the Group Best'}</div>
        <div style="position:relative;display:inline-block;animation:wyrTrophyPop 0.7s 0.3s both cubic-bezier(0.34,1.56,0.64,1)">
          <div style="font-size:clamp(48px,8vmin,72px);margin-bottom:0.5vmin">🏆</div>
        </div>
        <div style="animation:wyrTrophyPop 0.6s 0.6s both cubic-bezier(0.34,1.56,0.64,1);display:flex;justify-content:center;margin:0 auto">
          ${avatarHTML(groupBest)}
        </div>
        <div style="font-family:'Fredoka One',sans-serif;font-size:clamp(26px,5vmin,48px);color:var(--text);margin-top:1vmin;animation:fadeSlideUp 0.5s 0.9s both;text-align:center">${esc(groupBest.name)}</div>
        <div style="display:inline-block;background:linear-gradient(135deg,#2de1fc,#a78bff);border-radius:40px;padding:8px 28px;margin-top:1.5vmin;animation:fadeSlideUp 0.5s 1.1s both">
          <span style="font-family:'Fredoka One',sans-serif;font-size:clamp(18px,3vmin,28px);color:#000;font-weight:900">${groupBestTotal}/${maxPossible} ✓</span>
        </div>
        <div style="margin-top:2vmin;display:flex;justify-content:center;gap:16px;flex-wrap:wrap;animation:fadeSlideUp 0.5s 1.3s both">
          ${players.filter(p=>p.pid!==groupBest.pid).map(p=>`
            <div style="text-align:center;opacity:0.7">
              ${avatarHTML(p)}
              <div style="font-size:clamp(11px,1.6vmin,14px);color:var(--text2);margin-top:4px">${totalByPredictor[p.pid]||0}/${maxPossible}</div>
            </div>`).join('')}
        </div>
      </div>`);
    Audio_.sfx.reveal(); FX.burst(150);
    await waitNext(12);
  }

  /* ================================================================
     MODE 3 — THE INTERROGATION  (anonymous answers, public blame)
  ================================================================ */
  async function playInterrogation() {
    // HOT TAKES — Quiplash style with Crowd Wisdom scoring
    // Everyone writes a funny/honest answer → vote for favorite → winner+bonus pts
    await modeTitleCard('interrogation');
    const rounds = window.HYPOX_STATE?.rounds || 5;
    const qs = await Content.get('interrogation', LANG, rounds);
    if (!qs.length) { scene(`<div class="prompt-card display">🔥 No questions loaded</div>`); await waitNext(5); return; }
    const COLS = ['#f472b6','#60a5fa','#34d399','#fb923c','#a78bff','#fbbf24','#22d3ee','#f43f5e'];

    for (let i = 0; i < qs.length; i++) {
      const Q = qs[i];
      const pids = players.map(p => p.pid);

      // Phase 1: Show question, collect answers
      await FX.wipe();
      setPill(`${t('round')} ${i+1} ${t('of')} ${qs.length}`);
      scene(`<div class="eyebrow">🔥 ${LANG==='ar'?'هوت تيك':'HOT TAKES'}</div>
        <div class="prompt-card display">${esc(Q.q)}</div>
        <div class="pick-sub" style="opacity:.6">${LANG==='ar'?'اكتب أذكى/أصدق إجابة!':'Write the funniest or most honest answer!'}</div>
        <div id="statusRow" class="status-row"></div>`);
      pushMirror({ headline: Q.q, sub: LANG==='ar'?'✍️ اكتب إجابتك...':'✍️ Write your answer...' });
      Audio_.sfx.sting(); hostSay('prompt');

      const row = $('#statusRow');
      row.innerHTML = pids.map(pid => `<div class="mini" id="mini-${pid}">${avatarHTML(safeP(pid))}<div class="check">✓</div></div>`).join('');
      net.onEachInput(pid => { Audio_.sfx.submit(); $('#mini-'+pid)?.classList.add('done'); });

      const answers = await collectWithTimer({
        type: 'text',
        title: LANG==='ar' ? '✍️ اكتب إجابتك' : '✍️ Write your answer',
        context: Q.q, maxLen: 80,
      }, pids, 40);

      const answerList = pids
        .map(pid => ({ pid, text: (val(answers, pid)||'').trim() }))
        .filter(a => a.text)
        .sort(() => Math.random() - 0.5);

      if (answerList.length < 2) continue;

      // Phase 2: Vote for favorite (can't vote own)
      const votePhaseId = 'ph' + (++phaseCounter);
      const voteDeadline = inputDeadline(25);
      await FX.wipe();
      scene(`<div class="eyebrow">🗳️ ${LANG==='ar'?'صوّت للأفضل':'VOTE FOR THE BEST'}</div>
        <div class="prompt-card display" style="font-size:clamp(14px,2.2vmin,20px)">${esc(Q.q)}</div>
        <div class="ans-reveal-list">${answerList.map((a,idx)=>
          `<div class="ans-card" style="border-color:${COLS[idx%COLS.length]}60">
            <span class="ans-letter" style="color:${COLS[idx%COLS.length]}">${String.fromCharCode(65+idx)}</span>${esc(a.text)}
          </div>`).join('')}</div>
        <div id="statusRow" class="status-row"></div>`);
      Audio_.sfx.sting();

      // Per-player vote specs (each sees all answers except their own)
      const voteSpecs = {};
      for (const pid of pids) {
        const votable = answerList
          .map((a,idx) => ({ id: a.pid, label: `${String.fromCharCode(65+idx)}. ${a.text}`, color: COLS[idx%COLS.length] }))
          .filter(opt => opt.id !== pid);
        voteSpecs[pid] = { type: 'choice', title: LANG==='ar'?'🗳️ صوّت للأفضل':'🗳️ Vote for the best', options: votable };
      }
      net.setState({ phase: 'input-split', phaseId: votePhaseId, deadline: voteDeadline, specs: voteSpecs, mirror: { ...mirror } });

      const voteRow = $('#statusRow');
      voteRow.innerHTML = pids.map(pid => `<div class="mini" id="vmini-${pid}">${avatarHTML(safeP(pid))}<div class="check">✓</div></div>`).join('');
      net.onEachInput(pid => { Audio_.sfx.submit(); $('#vmini-'+pid)?.classList.add('done'); });

      // Bot auto-vote
      const botPids = net.getBotPids ? net.getBotPids() : [];
      players.filter(p => botPids.includes(p.pid)).forEach(botP => {
        setTimeout(async () => {
          try {
            const votable = answerList.filter(a => a.pid !== botP.pid);
            if (votable.length) {
              const pick = votable[Math.floor(Math.random()*votable.length)];
              await net.room('inputs/'+votePhaseId+'/'+botP.pid).set({ v: pick.pid, t: Date.now() });
            }
          } catch(e) {}
        }, 1000 + Math.random()*2000);
      });

      // Host votes if phones-only
      if (net.hostSelfPid) {
        const myVotable = answerList.filter(a => a.pid !== net.hostSelfPid);
        if (myVotable.length) {
          const btnRow = document.createElement('div');
          btnRow.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:14px;width:100%;max-width:700px;';
          btnRow.innerHTML = myVotable.map((a,idx) => {
            const globalIdx = answerList.indexOf(a);
            return `<button id="ht_${idx}" style="padding:12px 16px;border-radius:14px;background:${COLS[globalIdx%COLS.length]}22;border:2px solid ${COLS[globalIdx%COLS.length]}60;color:var(--text);font-family:'Fredoka One',sans-serif;font-size:clamp(13px,1.8vmin,16px);cursor:pointer;text-align:left;transition:background .15s">
              <span style="color:${COLS[globalIdx%COLS.length]};margin-right:8px">${String.fromCharCode(65+globalIdx)}</span>${esc(a.text)}
            </button>`;
          }).join('');
          const stage = document.getElementById('hostStage');
          if (stage) stage.appendChild(btnRow);
          myVotable.forEach((a, idx) => {
            document.getElementById('ht_'+idx)?.addEventListener('click', async () => {
              Audio_.sfx.submit(); btnRow.remove();
              await net.room('inputs/'+votePhaseId+'/'+net.hostSelfPid).set({ v: a.pid, t: Date.now() });
            }, { once: true });
          });
        }
      }

      const votes = await net.collect(votePhaseId, null, pids, inputTimeout(25));
      net.onEachInput(null);

      // Count votes
      const voteCounts = {};
      answerList.forEach(a => { voteCounts[a.pid] = 0; });
      for (const pid of pids) {
        const v = val(votes, pid);
        if (v && v in voteCounts) voteCounts[v]++;
      }
      const maxVotes = Math.max(...Object.values(voteCounts));
      const winners = Object.keys(voteCounts).filter(pid => voteCounts[pid] === maxVotes && maxVotes > 0);

      // Score: winner 1000pts, correct voters 300pts bonus
      winners.forEach(winPid => addScore(winPid, CORRECT_PTS));
      for (const pid of pids) {
        const v = val(votes, pid);
        if (v && winners.includes(v)) addScore(pid, 300);
      }

      // Reveal
      Audio_.sfx.reveal(); FX.burst(60);
      scene(`<div class="eyebrow">🔥 ${LANG==='ar'?'النتائج':'RESULTS'}</div>
        <div class="prompt-card display" style="font-size:clamp(13px,1.9vmin,18px)">${esc(Q.q)}</div>
        <div class="ans-reveal-list">${answerList.map((a,idx) => {
          const p = safeP(a.pid);
          const vc = voteCounts[a.pid]||0;
          const isWin = winners.includes(a.pid);
          return `<div class="ans-card${isWin?' ans-card-win':''}" style="border-color:${COLS[idx%COLS.length]}${isWin?'':'40'}">
            <span class="ans-letter" style="color:${COLS[idx%COLS.length]}">${String.fromCharCode(65+idx)}</span>
            ${esc(a.text)}
            ${isWin?`<span style="color:var(--yellow);font-family:'Fredoka One',sans-serif"> 🏆 +1000</span>`:''}
            <div style="font-size:11px;color:var(--text3);margin-top:3px;display:flex;align-items:center;gap:6px">${avatarHTML(p)}<span>${esc(p?.name||'')} · ${vc} ${LANG==='ar'?'صوت':'vote'}${vc!==1?'s':''}</span></div>
          </div>`;
        }).join('')}</div>`);
      await hostSay('reveal');
      await waitNext();
      if (i < qs.length-1) await showScores();
    }
    await showScores();
  }
  async function playDiss() {
    await modeTitleCard('diss');
    const allPids = players.map(p => p.pid);
    const nBattles = Math.min(window.HYPOX_STATE?.rounds||3, Math.floor(players.length/2));
    const prompts = await Content.get('diss', LANG, nBattles * 2);
    if (!prompts.length) { scene(`<div class="prompt-card display">🎤 No prompts loaded</div>`); await waitNext(5); return; }

    const shuffled = shuffle(players.slice());
    const botPids = net.getBotPids ? net.getBotPids() : [];

    for (let b = 0; b < nBattles; b++) {
      const A = shuffled[b * 2 % shuffled.length];
      const B = shuffled[(b * 2 + 1) % shuffled.length];
      if (!A || !B || A.pid === B.pid) continue;
      const duelerPids = [A.pid, B.pid];
      const audiencePids = allPids.filter(p => !duelerPids.includes(p));
      const prompt = prompts[b % prompts.length];
      const promptText = typeof prompt === 'string' ? prompt : (prompt.p || prompt.prompt || JSON.stringify(prompt));

      // Phase 1: Both duelers write (secretly — they don't know each other)
      await FX.wipe();
      setPill(`${LANG==='ar'?'معركة':'Battle'} ${b+1}/${nBattles}`);
      scene(`<div class="eyebrow">🎤 ${LANG==='ar'?'معركة الروست':'ROAST BATTLE'}</div>
        <div class="prompt-card display">${esc(promptText)}</div>
        <div class="pick-sub" style="opacity:.6">${LANG==='ar'?'مقاتلان سريان يكتبان الآن...':'Two fighters writing in secret...'}</div>
        <div id="statusRow" class="status-row"></div>`);
      pushMirror({ headline: promptText, sub: LANG==='ar'?'✍️ اكتب خطك!':'✍️ Write your line!' });
      Audio_.sfx.sting();

      const sRow = $('#statusRow');
      sRow.innerHTML = duelerPids.map(pid=>`<div class="mini" id="mini-${pid}">${avatarHTML(safeP(pid))}<div class="check">✓</div></div>`).join('');
      net.onEachInput(pid => { Audio_.sfx.submit(); $('#mini-'+pid)?.classList.add('done'); });

      // Auto-submit bots
      duelerPids.filter(p=>botPids.includes(p)).forEach(botPid => {
        setTimeout(async()=>{
          try {
            const lines=['Walked so you could crawl','Peak character, no development','My autocorrect rejected your name','Nature\'s way of saying try again','Even your horoscope gave up'];
            await net.room('inputs/'+('ph'+(phaseCounter+1))+'/'+botPid).set({v:lines[Math.floor(Math.random()*lines.length)],t:Date.now()});
          }catch(e){}
        }, 1500+Math.random()*2000);
      });

      const lines = await collectWithTimer({
        type:'text',
        title: LANG==='ar'?'🎤 اكتب خطك الأقوى!':'🎤 Write your most savage line!',
        context: promptText, maxLen:100
      }, duelerPids, 35);

      const lineA = (val(lines,A.pid)||'').trim() || (LANG==='ar'?'لا يوجد خط':'(no line submitted)');
      const lineB = (val(lines,B.pid)||'').trim() || (LANG==='ar'?'لا يوجد خط':'(no line submitted)');

      // Phase 2: Boxing intro + vote — audience + duelers all vote
      const votePhaseId = 'ph'+(++phaseCounter);
      const voteDeadline = inputDeadline(20);
      await FX.wipe();
      scene(`<div class="eyebrow" style="font-size:clamp(18px,3vmin,28px)">🥊 ${LANG==='ar'?'التصويت!':'WHO WINS?'}</div>
        <div class="duel-cards">
          <div class="duel-card" style="border-color:var(--pink)">
            <div class="duel-letter" style="color:var(--pink)">A</div>
            <div class="duel-line">${esc(lineA)}</div>
          </div>
          <div class="duel-vs">VS</div>
          <div class="duel-card" style="border-color:var(--blue)">
            <div class="duel-letter" style="color:var(--blue)">B</div>
            <div class="duel-line">${esc(lineB)}</div>
          </div>
        </div>
        <div id="statusRow" class="status-row" style="margin-top:1vmin"></div>`);
      Audio_.sfx.sting();

      const vRow = $('#statusRow');
      vRow.innerHTML = allPids.map(pid=>`<div class="mini" id="vmini-${pid}">${avatarHTML(safeP(pid))}<div class="check">✓</div></div>`).join('');
      net.onEachInput(pid=>{Audio_.sfx.submit();$('#vmini-'+pid)?.classList.add('done');});

      const voteOpts = [
        {id:'a',label:`A — ${lineA.slice(0,40)}${lineA.length>40?'…':''}`,color:'#f472b6'},
        {id:'b',label:`B — ${lineB.slice(0,40)}${lineB.length>40?'…':''}`,color:'#60a5fa'}
      ];

      // Per-player spec (duelers can vote for opponent)
      const voteSpecs = {};
      for (const pid of allPids) {
        // A votes for B or against, B votes for A or against — everyone votes
        const myOpt = pid===A.pid?'a':pid===B.pid?'b':null;
        // Duelers can vote but obviously not for themselves
        const opts = myOpt ? voteOpts.filter(o=>o.id!==myOpt) : voteOpts;
        if (opts.length) voteSpecs[pid] = {type:'choice',title:LANG==='ar'?'🥊 من يفوز؟':'🥊 Who wins?',options:opts};
      }
      net.setState({phase:'input-split',phaseId:votePhaseId,deadline:voteDeadline,specs:voteSpecs,mirror:{...mirror}});

      // Bot auto-vote
      allPids.filter(p=>botPids.includes(p)).forEach(botPid=>{
        setTimeout(async()=>{
          try{
            const myOpt=botPid===A.pid?'a':botPid===B.pid?'b':null;
            const opts=myOpt?['a','b'].filter(o=>o!==myOpt):['a','b'];
            await net.room('inputs/'+votePhaseId+'/'+botPid).set({v:opts[Math.floor(Math.random()*opts.length)],t:Date.now()});
          }catch(e){}
        },800+Math.random()*2000);
      });

      // Host vote if phones-only
      if (net.hostSelfPid) {
        const myOpt=net.hostSelfPid===A.pid?'a':net.hostSelfPid===B.pid?'b':null;
        const votableOpts=myOpt?voteOpts.filter(o=>o.id!==myOpt):voteOpts;
        if (votableOpts.length) {
          const btnRow=document.createElement('div');
          btnRow.style.cssText='display:flex;gap:12px;justify-content:center;margin-top:14px;width:100%;max-width:700px;align-items:stretch;';
          btnRow.innerHTML=votableOpts.map(o=>`<button id="diss_${o.id}" style="flex:1;max-width:320px;padding:14px;border-radius:14px;background:${o.color}22;border:2px solid ${o.color}60;color:var(--text);font-family:'Fredoka One',sans-serif;font-size:clamp(13px,1.8vmin,16px);cursor:pointer;line-height:1.4;text-align:left">${esc(o.id==='a'?lineA:lineB)}</button>`).join('<div style="font-family:Fredoka One;font-size:18px;color:var(--text3);display:flex;align-items:center">VS</div>');
          document.getElementById('hostStage')?.appendChild(btnRow);
          votableOpts.forEach(o=>{
            document.getElementById('diss_'+o.id)?.addEventListener('click',async()=>{
              Audio_.sfx.submit();btnRow.remove();
              await net.room('inputs/'+votePhaseId+'/'+net.hostSelfPid).set({v:o.id,t:Date.now()});
            },{once:true});
          });
        }
      }

      const votes = await net.collect(votePhaseId, null, allPids, inputTimeout(20));
      net.onEachInput(null);

      // Count votes
      let votesA=0, votesB=0;
      const voterReveal=[];
      for (const pid of allPids) {
        const v = val(votes,pid);
        if (v==='a') { votesA++; voterReveal.push({pid,pick:'a'}); }
        else if (v==='b') { votesB++; voterReveal.push({pid,pick:'b'}); }
      }
      const winnerPid = votesA > votesB ? A.pid : votesA < votesB ? B.pid : null;
      if (winnerPid) addScore(winnerPid, CORRECT_PTS);
      // Bonus for correct voters
      for (const {pid,pick} of voterReveal) {
        if ((pick==='a'&&winnerPid===A.pid)||(pick==='b'&&winnerPid===B.pid)) addScore(pid,300);
      }

      // Dramatic reveal scene
      Audio_.sfx.reveal(); FX.burst(80);
      const winnerPlayer = winnerPid ? safeP(winnerPid) : null;
      scene(`<div class="eyebrow" style="font-size:clamp(20px,3.5vmin,32px)">
          ${winnerPlayer ? `🏆 ${esc(winnerPlayer.name)} ${LANG==='ar'?'يفوز!':'WINS!'}` : `🤝 ${LANG==='ar'?'تعادل!':'TIE!'}`}
        </div>
        <div class="duel-reveal">
          <div class="duel-card${winnerPid===A.pid?' duel-card-win':''}" style="border-color:var(--pink)">
            <div class="duel-letter" style="color:var(--pink)">A</div>
            <div class="duel-line">${esc(lineA)}</div>
            <div class="duel-author">${avatarHTML(A)} ${esc(A.name)}${winnerPid===A.pid?' 🏆 +1000':''}</div>
            <div class="duel-votes" style="color:var(--pink)">${votesA} ${LANG==='ar'?'صوت':'vote'}${votesA!==1?'s':''}</div>
          </div>
          <div class="duel-vs">VS</div>
          <div class="duel-card${winnerPid===B.pid?' duel-card-win':''}" style="border-color:var(--blue)">
            <div class="duel-letter" style="color:var(--blue)">B</div>
            <div class="duel-line">${esc(lineB)}</div>
            <div class="duel-author">${avatarHTML(B)} ${esc(B.name)}${winnerPid===B.pid?' 🏆 +1000':''}</div>
            <div class="duel-votes" style="color:var(--blue)">${votesB} ${LANG==='ar'?'صوت':'vote'}${votesB!==1?'s':''}</div>
          </div>
        </div>
        <div class="voter-reveal">${voterReveal.map(({pid,pick})=>{
          const p=safeP(pid);
          const correct=(pick==='a'&&winnerPid===A.pid)||(pick==='b'&&winnerPid===B.pid);
          return `<div class="voter-chip ${correct?'voter-correct':'voter-wrong'}">${avatarHTML(p)}<span>${esc(p?.name||'')}</span><span style="font-size:11px;opacity:.7">→ ${pick.toUpperCase()}</span>${correct?'<span>+300</span>':''}`;
        }).join('')}</div>`);
      await hostSay('reveal');
      await waitNext();
      if (b < nBattles-1) await showScores();
    }
    await showScores();
  }
  async function playQuiz() {
    await modeTitleCard('quiz');
    const cat = window.HYPOX_STATE?.category || 'general';
    const flavor = window.HYPOX_STATE?.flavor || 'global';
    const rounds = window.HYPOX_STATE?.rounds || 5;
    let qs;
    // If specific category chosen (not general), use TRIVIA_CATS
    if (cat !== 'general' && typeof TRIVIA_CATS !== 'undefined' && TRIVIA_CATS[cat]) {
      const pool = TRIVIA_CATS[cat][LANG] || TRIVIA_CATS[cat].en || [];
      const shuffled = pool.slice().sort(()=>Math.random()-.5);
      qs = shuffled.slice(0, rounds);
      // Supplement with AI if pool is small
      if (qs.length < rounds) {
        const aiExtra = await Content.get('quiz', LANG, rounds - qs.length);
        qs = [...qs, ...aiExtra].slice(0, rounds);
      }
    } else if (cat === 'general' && flavor === 'arab' && typeof TRIVIA_CATS !== 'undefined' && TRIVIA_CATS['gulf']) {
      // Arab Flavor + General = mix gulf + standard quiz
      const gulfPool = TRIVIA_CATS['gulf'][LANG] || TRIVIA_CATS['gulf'].en || [];
      const stdPool = (await Content.get('quiz', LANG, rounds));
      const mixed = [...gulfPool.slice().sort(()=>Math.random()-.5).slice(0, Math.ceil(rounds/2)), ...stdPool].slice(0, rounds);
      qs = mixed;
    } else {
      qs = await Content.get('quiz', LANG, rounds);
    }
    const pids = players.map(p => p.pid);
    const CORRECT_PTS = 1000; // flat: everyone who answers correctly gets same score

    for (let i = 0; i < qs.length; i++) {
      const Q = qs[i];
      await FX.wipe();
      setPill(`${i + 1} / ${qs.length}`);
      const colors = ['#2de1fc', '#ff3d8a', '#ffd23f', '#7dff6a'];
      scene(frameWithTimer(`
        <div class="prompt-card small display">${esc(Q.q)}</div>
        <div class="quiz-grid">
          ${Q.options.map((o, j) => `<div class="quiz-opt" id="qopt-${j}" style="--qc:${colors[j]}"><span class="q-letter display">${'ABCD'[j]}</span> ${esc(o)}</div>`).join('')}
        </div>`, t('quiz_pick')));
      Audio_.sfx.sting();

      const answers = await collectWithTimer({
        type: 'choice', title: t('quiz_pick'), context: Q.q, translateContext: Q.q, seconds: 15,
        options: Q.options.map((o, j) => ({ id: j, label: `${'ABCD'[j]} · ${o}`, color: colors[j] })),
      }, pids, 15);

      // reveal
      Audio_.sfx.drum(); await sleep(900);
      hostSay('reveal');
      $('#qopt-' + Q.correct)?.classList.add('q-correct');
      Q.options.forEach((_, j) => { if (j !== Q.correct) $('#qopt-' + j)?.classList.add('q-dim'); });
      Audio_.sfx.correct(); FX.burst(80);

      const right = pids.filter(pid => val(answers, pid) === Q.correct)
        .sort((a, b) => answers[a].order - answers[b].order);
      right.forEach((pid, rank) => {
        addScore(pid, CORRECT_PTS);
      });
      const names = right.map(pid => players.find(p => p.pid === pid)?.name).filter(Boolean).join(', ');
      pushMirror({ headline: `✓ ${Q.options[Q.correct]}` + (right.length ? ` — ${names}` : '') });
      await say(right.length
        ? `${names} ${t('got_it_right')}!`
        : (LANG === 'ar' ? 'ولا واحد؟ يا سلام عليكم.' : 'Nobody?! Incredible work, everyone.'));
      hideHost();
      await waitNext();
    }
    await showScores();
  }

  /* ================================================================ */
  /* ================= PINPOINT (PinWorld style) ================= */
  function haversine(a, b) {
    const R = 6371, d2r = Math.PI / 180;
    const dLat = (b.lat - a.lat) * d2r, dLon = (b.lon - a.lon) * d2r;
    const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*d2r) * Math.cos(b.lat*d2r) * Math.sin(dLon/2)**2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x)));
  }

  async function playPinpoint() {
    await modeTitleCard('pinpoint');
    const rounds = window.HYPOX_STATE?.rounds || 5;
    // Try AI backend first; normalize field names (AI uses en/ar/lat/lon, static same)
    let aiCities = [];
    try {
      const aiRaw = await Content.get('pinpoint', LANG, rounds);
      // AI returns {en, ar, lat, lon} — filter out entries with invalid/missing coordinates
      aiCities = aiRaw.filter(c =>
        c.en && c.ar &&
        typeof c.lat === 'number' && typeof c.lon === 'number' &&
        c.lat >= -90 && c.lat <= 90 &&
        c.lon >= -180 && c.lon <= 180 &&
        !(c.lat === 0 && c.lon === 0) // reject null island
      );
    } catch(e) {}
    const ALLPP = (typeof PINPOINT_CITIES !== 'undefined' ? PINPOINT_CITIES : []).concat(typeof PINPOINT_PLACES !== 'undefined' ? PINPOINT_PLACES : []);
    // Merge AI cities at front, fill rest from static pool (deduplicated by name)
    const usedNames = new Set(aiCities.map(c => c.en));
    const staticFill = ALLPP.filter(c => !usedNames.has(c.en)).sort(() => Math.random() - .5);
    const pool = [...aiCities, ...staticFill].slice(0, rounds);
    for (let r = 0; r < pool.length; r++) {
      const city = pool[r];
      const cityName = LANG === 'ar' ? city.ar : city.en;
      setPill(`${t('round')} ${r+1} ${t('of')} ${pool.length}`);
      scene(`
        <div class="eyebrow">📍 ${esc(t('mode_names').pinpoint || 'PIN POINT')}</div>
        ${city.img ? `<img class="pp-photo" src="${city.img}" alt="" onerror="this.style.display='none'"/>` : ''}
        <div class="prompt-card">${esc(cityName)}</div>
        <div class="pick-sub">${LANG==='ar'?'وين هالمدينة؟ حط دبوسك على الخريطة!':'Where is this city? Drop your pin on the map!'}</div>`);
      pushMirror({ headline: cityName, pill: `${r+1}/${pool.length}` });
      Audio_.sfx.sting();

      const answers = await collectWithTimer({
        type: 'map', title: cityName,
        sub: LANG==='ar'?'حط الدبوس أقرب ما تقدر':'Drop your pin as close as you can',
        seconds: 35,
      }, players.map(p => p.pid), 35);

      // Score by distance
      const results = players.map(p => {
        let guess = null;
        try {
          const raw = answers[p.pid] ? answers[p.pid].value : null;
          guess = raw ? JSON.parse(raw) : null;
        } catch(e) {}
        const km = guess ? haversine(guess, city) : 99999;
        return { p, km, guessed: !!guess, guess };
      }).sort((a,b) => a.km - b.km);

      const AWARD = [1000, 700, 500];
      results.forEach((r2, i) => {
        if (!r2.guessed) return;
        const pts = AWARD[i] !== undefined ? AWARD[i] : 300;
        addScore(r2.p.pid, pts);
      });

      Audio_.sfx.reveal();
      scene(`
        <div class="eyebrow">${esc(cityName)}</div>
        <div id="revealMap" style="height:36vh;min-height:220px;border-radius:16px;overflow:hidden;margin:1vmin auto 2vmin;max-width:900px;background:#0e1626"></div>
        <div class="score-list">
          ${results.map((r2, i) => `
            <div class="score-row" style="animation-delay:${i*.12}s">
              <div class="medal">${i===0?'🥇':i===1?'🥈':i===2?'🥉':''}</div>
              <div class="avatar" style="background:${r2.p.color}">${r2.p.emoji}</div>
              <div class="bar-track"><div class="bar-fill" style="width:${Math.max(15,100-i*20)}%;background:linear-gradient(90deg,var(--blue),var(--green))">
                ${esc(r2.p.name)} · ${r2.guessed ? r2.km.toLocaleString()+' km' : (LANG==='ar'?'ما جاوب':'no pin')}
              </div></div>
            </div>`).join('')}
        </div>`);
      try {
        const rm = L.map(document.getElementById('revealMap'), {
          center: [city.lat, city.lon], zoom: 3, zoomControl: false, attributionControl: false,
          dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false,
        });
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 10 }).addTo(rm);
        L.circleMarker([city.lat, city.lon], { radius: 13, color: '#fff', weight: 3, fillColor: '#facc15', fillOpacity: 1 })
          .addTo(rm).bindTooltip('⭐ ' + cityName, { permanent: true, direction: 'top' });
        const bounds = [[city.lat, city.lon]];
        results.forEach(r2 => {
          if (!r2.guess) return;
          L.circleMarker([r2.guess.lat, r2.guess.lon], { radius: 9, color: '#fff', weight: 2, fillColor: r2.p.color, fillOpacity: 1 })
            .addTo(rm).bindTooltip(r2.p.name, { direction: 'top' });
          L.polyline([[city.lat, city.lon], [r2.guess.lat, r2.guess.lon]], { color: r2.p.color, weight: 2, opacity: .55, dashArray: '6 6' }).addTo(rm);
          bounds.push([r2.guess.lat, r2.guess.lon]);
        });
        if (bounds.length > 1) rm.fitBounds(bounds, { padding: [45, 45], maxZoom: 6 });
      } catch(e) { console.error('reveal map failed', e); }
      pushMirror({ headline: results.slice(0,3).map((r2,i)=>`${i+1}. ${r2.p.name} ${r2.guessed?r2.km+'km':'—'}`).join(' · ') });
      await waitNext();
      if (r < pool.length - 1) await showScores();
    }
    await showScores();
  }

  /* Wait for Next press, or auto-advance if autoplay is on */
  function waitNext(autoSeconds = 6) {
    return new Promise(res => {
      const stage = document.getElementById('hostStage');
      const btn = document.createElement('button');
      btn.className = 'big-btn';
      btn.style.marginTop = '2vmin';
      const done = () => { window.__hypoxSkip = null; if (timer) clearInterval(timer); btn.remove?.(); res(); };
      let timer = null;
      const isAutoplay = window.HYPOX_STATE?.autoplay === true; // explicit check
      if (isAutoplay) {
        let left = autoSeconds;
        btn.textContent = `${t('next_round')} (${left})`;
        timer = setInterval(() => {
          left--;
          if (left <= 0) { done(); return; }
          btn.textContent = `${t('next_round')} (${left})`;
        }, 1000);
      } else {
        btn.textContent = t('next_round'); // manual: no timer ever
      }
      btn.addEventListener('click', done, { once: true });
      stage?.appendChild(btn);
      window.__hypoxSkip = done;
    });
  }

  /* ================= EMOJI RIDDLE (Phonetic Rebus) ================= */
  async function playEmoji() {
    await modeTitleCard('emoji');
    const rounds = window.HYPOX_STATE?.rounds || 5;
    const qs = await Content.get('emoji', LANG, rounds);
    if (!qs.length) { scene(`<div class="prompt-card display">🧩 ${LANG==='ar'?'تعذّر تحميل الأسئلة':'Could not load questions'}</div>`); await waitNext(5); return; }
    const pids = players.map(p=>p.pid);
    const BASE_PTS = 1000;
    const PTS_PER_REVEAL = 200; // lose 200 per letter revealed

    for (let i = 0; i < qs.length; i++) {
      const Q = qs[i];
      const answer = Q.answer || (Q.options ? Q.options[Q.correct] : '');
      const category = Q.category || 'Word';
      const ansUp = answer.toUpperCase().replace(/\s/g,'');
      const ansLetters = answer.toUpperCase().split('');
      const letterIndexes = ansLetters.map((ch,j)=>ch===' '?null:j).filter(j=>j!==null);
      const totalLetters = letterIndexes.length;

      // Letter reveal state - randomised order, never same position twice
      let revealed = new Array(ansLetters.length).fill(false);
      const revealOrder = letterIndexes.slice().sort(()=>Math.random()-.5);
      let revealCount = 0;
      let currentMaxPts = BASE_PTS;

      function blankDisplay() {
        return ansLetters.map((ch,j) => {
          if(ch === ' ') return '<span class="hint-space"> </span>';
          return revealed[j]
            ? `<span class="hint-letter revealed">${esc(ch)}</span>`
            : '<span class="hint-letter blank">_</span>';
        }).join('');
      }

      await FX.wipe();
      setPill(`${i+1}/${qs.length}`);

      // Host screen: show emojis + category + blanks + timer
      $('#scr-game').classList.add('rebus-input-active');
      scene(`<div class="rebus-live">
        <div class="eyebrow">🧩 EMOJI RIDDLE</div>
        <div class="rebus-emojis">${esc(Q.e)}</div>
        <div class="rebus-category">${esc(category)}</div>
        <div class="hint-display" id="hD">${blankDisplay()}</div>
        <div class="rebus-pts" id="rebPts">${currentMaxPts} pts</div>
        <div class="timer-bar"><div class="timer-fill" id="tF" style="width:100%"></div></div>
        <div id="statusRow" class="status-row"></div></div>`);

      // Phone screen: show emojis + category + blanks
      pushMirror({
        headline: Q.e,
        sub: `${category} · ${'_ '.repeat(totalLetters).trim()}`,
        pill: `${i+1}/${qs.length}`
      });
      Audio_.sfx.sting();

      const TOTAL_SECS = 30;
      const REVEAL_EVERY = Math.floor(TOTAL_SECS / (Math.floor(totalLetters * 0.6) + 1)) * 1000;
      const t0 = Date.now();

      const tI = setInterval(() => {
        const elapsed = Date.now() - t0;
        const frac = Math.max(0, 1 - elapsed / (TOTAL_SECS * 1000));
        const fill = document.getElementById('tF');
        if(fill) fill.style.width = (frac * 100) + '%';

        // Reveal a letter every REVEAL_EVERY ms
        if(revealCount < Math.floor(totalLetters * 0.6) &&
           elapsed > REVEAL_EVERY * (revealCount + 1)) {
          revealed[revealOrder[revealCount]] = true;
          revealCount++;
          currentMaxPts = Math.max(200, BASE_PTS - revealCount * PTS_PER_REVEAL);
          const hD = document.getElementById('hD');
          if(hD) hD.innerHTML = blankDisplay();
          const rPts = document.getElementById('rebPts');
          if(rPts) rPts.textContent = currentMaxPts + ' pts';
          // Update phone mirror with new blanks
          net.setState({phase:'mirror', headline: Q.e, sub: `${category} · ${blankDisplay().replace(/<[^>]+>/g,'')}` });
        }
      }, 200);

      const answers = await collectWithTimer({
        type: 'text',
        title: LANG==='ar' ? 'اكتب الجواب!' : 'Type the answer!',
        context: `${Q.e}\n${category} — ${totalLetters} ${LANG==='ar'?'حروف':'letters'}`,
        maxLen: 40,
        seconds: TOTAL_SECS,
        answerLen: totalLetters, // hint for phone-side validation
        compactRebus: true,
      }, pids, TOTAL_SECS);
      clearInterval(tI);
      $('#scr-game').classList.remove('rebus-input-active');

      // Score = currentMaxPts at time of answer (speed within reveal window)
      const right = pids.filter(pid => {
        const v = (val(answers, pid) || '').trim().toUpperCase().replace(/\s/g,'');
        return v === ansUp;
      }).sort((a,b) => answers[a].order - answers[b].order);

      // Lock each player's value at their own submission time.
      const earnedPoints = new Map(right.map(pid => {
        const submittedAt = answers[pid].receivedAt || answers[pid].t || Date.now();
        const revealsAtSubmit = Math.min(
          Math.floor(totalLetters * 0.6),
          Math.floor(Math.max(0, submittedAt - t0) / REVEAL_EVERY)
        );
        return [pid, Math.max(200, BASE_PTS - revealsAtSubmit * PTS_PER_REVEAL)];
      }));
      right.forEach(pid => addScore(pid, earnedPoints.get(pid)));

      Audio_.sfx.reveal(); FX.burst(80);

      // Show explanation
      const exp = Q.explanation || '';
      scene(`
        <div class="eyebrow">🧩 ${esc(Q.e)}</div>
        <div class="rebus-answer display">${esc(answer.toUpperCase())}</div>
        ${exp ? `<div class="rebus-explain">${esc(exp)}</div>` : ''}
        <div class="score-list">${pids.map((pid,idx) => {
          const p = safeP(pid);
          const got = right.includes(pid);
          const pts = got ? earnedPoints.get(pid) : 0;
          return `<div class="score-row" style="animation-delay:${idx*.1}s">
            <div class="avatar" style="background:${p.color}">${p.emoji}</div>
            <div class="bar-track${got?'':' zero-track'}">${got
              ? `<div class="bar-fill" style="width:80%;background:var(--green)">${esc(p.name)} ✓ +${pts}</div>`
              : `<div class="bar-zero"><span>${esc(p.name)} ✗</span><span>0</span></div>`}
            </div>
          </div>`;
        }).join('')}</div>`);

      pushMirror({headline: `🧩 = ${answer.toUpperCase()}`});
      await say(right.length
        ? `${right.map(pid=>players.find(p=>p.pid===pid)?.name).join(', ')} ${t('got_it_right')}!`
        : (LANG==='ar' ? `الجواب: ${answer}` : `Answer: ${answer}! ${exp}`));
      hideHost();
      await waitNext();
      if(i < qs.length - 1) await showScores();
    }
    await showScores();
  }

  /* ================= TIME MACHINE ================= */
  async function playYear() {
    await modeTitleCard('year');
    const rounds = window.HYPOX_STATE?.rounds || 5;
    const qs = await Content.get('year', LANG, rounds);
    if (!qs.length) { scene(`<div class="prompt-card display">⏳ ${LANG==='ar'?'تعذّر تحميل الأسئلة':'Could not load questions'}</div>`); await waitNext(5); return; }
    for (let i = 0; i < qs.length; i++) {
      const Q = qs[i];
      await FX.wipe();
      setPill(`${i + 1} / ${qs.length}`);
      scene(`
        <div class="eyebrow">⏳ ${esc(t('mode_names').year || 'TIME MACHINE')}</div>
        <div class="prompt-card display">${esc(Q.q)}</div>
        <div class="pick-sub">${LANG==='ar'?'أي سنة صارت؟ اكتب تخمينك!':'What year did this happen? Type your guess!'}</div>`);
      pushMirror({ headline: Q.q, pill: `${i+1}/${qs.length}` });
      Audio_.sfx.sting();
      const answers = await collectWithTimer({
        type: 'text', title: LANG==='ar'?'اكتب السنة':'Type the year', context: Q.q, translateContext: Q.q, maxLen: 4, numeric: true, seconds: 20,
      }, players.map(p => p.pid), 20);
      const results = players.map(p => {
        let raw = answers[p.pid] ? String(answers[p.pid].value || '').trim() : '';
        raw = raw.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)); // Arabic-Indic → Latin digits
        const yr = parseInt(raw, 10);
        const ok = !isNaN(yr) && yr > 0;
        return { p, yr: ok ? yr : null, diff: ok ? Math.abs(yr - Q.y) : 99999 };
      }).sort((a, b) => a.diff - b.diff);
      const AWARD = [1000, 700, 500];
      results.forEach((r2, idx) => {
        if (r2.yr === null) return;
        let pts = AWARD[idx] !== undefined ? AWARD[idx] : 300;
        if (r2.diff === 0) pts += 500;
        addScore(r2.p.pid, pts);
      });
      Audio_.sfx.reveal(); FX.burst(60);
      scene(`
        <div class="eyebrow">${esc(Q.q)}</div>
        <div class="prompt-card display year-reveal">${Q.y}</div>
        <div class="score-list">
          ${results.map((r2, idx) => `
            <div class="score-row" style="animation-delay:${idx*.12}s">
              <div class="medal">${idx===0?'🥇':idx===1?'🥈':idx===2?'🥉':''}</div>
              <div class="avatar" style="background:${r2.p.color}">${r2.p.emoji}</div>
              <div class="bar-track"><div class="bar-fill" style="width:${Math.max(15,100-idx*20)}%;background:linear-gradient(90deg,var(--purple),var(--pink))">
                ${esc(r2.p.name)} · ${r2.yr !== null ? r2.yr + (r2.diff===0 ? ' 🎯' : ' (±'+r2.diff+')') : (LANG==='ar'?'ما جاوب':'no guess')}
              </div></div>
            </div>`).join('')}
        </div>`);
      pushMirror({ headline: `${Q.y}` });
      await waitNext();
      if (i < qs.length - 1) await showScores();
    }
    await showScores();
  }


  async function playMostlikely() {
    await modeTitleCard('mostlikely');
    const rounds = window.HYPOX_STATE?.rounds || 5;
    const prompts = await Content.get('mostlikely', LANG, rounds);
    if (!prompts.length) { scene(`<div class="prompt-card display">🏆 ${LANG==='ar'?'تعذّر تحميل الأسئلة':'Could not load questions'}</div>`); await waitNext(5); return; }
    for (let i = 0; i < prompts.length; i++) {
      const Q = prompts[i];
      await FX.wipe();
      setPill(`${t('round')} ${i+1} ${t('of')} ${prompts.length}`);
      scene(`<div class="eyebrow">🏆 ${LANG==='ar'?'الأرجح':'MOST LIKELY TO'}</div><div class="prompt-card display">${esc(Q.q)}</div><div class="pick-sub">${LANG==='ar'?'الكل يصوت — من الأرجح؟':'Everyone votes — who is it?'}</div><div id="statusRow" class="status-row"></div>`);
      pushMirror({ headline: Q.q });
      Audio_.sfx.sting(); hostSay('prompt');
      const pids = players.map(p => p.pid);
      const votes = await collectWithTimer({ type:'choice', title:LANG==='ar'?'من الأرجح؟':'Who is most likely?', context:Q.q, translateContext:Q.q, options:players.map(p=>({id:p.pid,label:`${p.emoji} ${p.name}`,color:p.color})), seconds:20 }, pids, 20);
      const tally = {};
      pids.forEach(pid => { const v = val(votes, pid); if (v) tally[v] = (tally[v]||0)+1; });
      const maxV = Math.max(0, ...Object.values(tally));
      const winners = Object.entries(tally).filter(([,c])=>c===maxV).map(([pid])=>pid);
      winners.forEach(pid => addScore(pid, 1000));
      Audio_.sfx.reveal(); FX.burst(80);
      scene(`<div class="eyebrow">${esc(Q.q)}</div><div class="score-list">${players.slice().sort((a,b)=>(tally[b.pid]||0)-(tally[a.pid]||0)).map((p,idx)=>`<div class="score-row" style="animation-delay:${idx*.1}s"><div class="medal">${winners.includes(p.pid)?'👑':''}</div><div class="avatar" style="background:${p.color}">${p.emoji}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(10,((tally[p.pid]||0)/pids.length)*100)}%;background:linear-gradient(90deg,var(--pink),var(--purple))">${esc(p.name)} · ${tally[p.pid]||0} ${LANG==='ar'?'أصوات':'votes'}</div></div></div>`).join('')}</div>`);
      const wNames = winners.map(pid=>players.find(p=>p.pid===pid)?.name).join(' & ');
      pushMirror({ headline: `👑 ${wNames}` });
      await say(LANG==='ar'?`${wNames} — الكل يشوف كذا!`:`${wNames} — the crowd has spoken!`);
      hideHost(); await waitNext();
      if (i < prompts.length - 1) await showScores();
    }
    await showScores();
  }

  async function playTrueorlie() {
    await modeTitleCard('trueorlie');
    const rounds = window.HYPOX_STATE?.rounds || 5;
    const prompts = await Content.get('trueorlie', LANG, rounds);
    if (!prompts.length) { scene(`<div class="prompt-card display">✅ ${LANG==='ar'?'تعذّر تحميل الأسئلة':'Could not load questions'}</div>`); await waitNext(5); return; }
    const CORRECT_PTS = 1000;
    for (let i = 0; i < prompts.length; i++) {
      const Q = prompts[i];
      await FX.wipe();
      setPill(`${t('round')} ${i+1} ${t('of')} ${prompts.length}`);
      const opts = [{id:'true',label:LANG==='ar'?'✅ حقيقة':'✅ TRUE',color:'#34d399'},{id:'false',label:LANG==='ar'?'❌ خطأ':'❌ FALSE',color:'#f472b6'}];
      scene(`<div class="eyebrow">✅❌ ${LANG==='ar'?'صح ولا كذب؟':'TRUE OR LIE?'}</div><div class="prompt-card display">${esc(Q.s)}</div><div id="statusRow" class="status-row"></div>`);
      pushMirror({ headline: Q.s });
      Audio_.sfx.sting(); hostSay('prompt');
      const pids = players.map(p => p.pid);
      const answers = await collectWithTimer({ type:'choice', title:LANG==='ar'?'صح ولا كذب؟':'True or Lie?', context:Q.s, translateContext:Q.s, options:opts, seconds:15 }, pids, 15);
      const correctId = Q.truth ? 'true' : 'false';
      Audio_.sfx.drum(); await sleep(900);
      const right = pids.filter(pid=>val(answers,pid)===correctId).sort((a,b)=>answers[a].order-answers[b].order);
      right.forEach(pid=>addScore(pid,CORRECT_PTS));
      Audio_.sfx.reveal();
      const resultLabel = Q.truth?(LANG==='ar'?'✅ حقيقة!':'✅ TRUE!'):(LANG==='ar'?'❌ خطأ!':'❌ FALSE!');
      scene(`<div class="eyebrow">${esc(Q.s)}</div><div class="prompt-card display" style="color:${Q.truth?'var(--green)':'var(--pink)'}">${resultLabel}</div><div class="score-list">${pids.map((pid,idx)=>{const p=safeP(pid);if(!p)return '';const got=val(answers,pid)===correctId;return `<div class="score-row" style="animation-delay:${idx*.1}s"><div class="avatar" style="background:${p.color}">${p.emoji}</div><div class="bar-track"><div class="bar-fill" style="width:${got?80:20}%;background:${got?'var(--green)':'rgba(255,255,255,.1)'}">${esc(p.name.length>12?p.name.slice(0,11)+"…":p.name)} ${got?'✓ +'+( CORRECT_PTS):'✗ 0'}</div></div></div>`;}).join('')}</div>`);
      pushMirror({ headline: resultLabel });
      FX.burst(60);
      await say(right.length?`${right.map(pid=>players.find(p=>p.pid===pid)?.name).join(', ')} ${t('got_it_right')}!`:(LANG==='ar'?'ولا واحد عرفها!':'Nobody got it!'));
      hideHost(); await waitNext();
      if (i < prompts.length - 1) await showScores();
    }
    await showScores();
  }

  async function playFlaghunt() {
    await modeTitleCard('flaghunt');
    const rounds = window.HYPOX_STATE?.rounds || 5;
    const qs = await Content.get('flaghunt', LANG, rounds);
    if (!qs.length) { scene(`<div class="prompt-card display">🚩 ${LANG==='ar'?'تعذّر تحميل الأسئلة':'Could not load questions'}</div>`); await waitNext(5); return; }
    const CORRECT_PTS = 1000;
    for (let i = 0; i < qs.length; i++) {
      const Q = qs[i];
      const answer = Q.options[Q.correct];
      const ansUp = answer.toUpperCase();
      const pids = players.map(p=>p.pid);
      await FX.wipe();
      setPill(`${t('round')} ${i+1} ${t('of')} ${qs.length}`);
      scene(`<div class="eyebrow">🚩 ${LANG==='ar'?'عرّف العلم':'FLAG HUNT'}</div>
        <div style="font-size:clamp(90px,16vw,150px);text-align:center;margin:2vmin 0;line-height:1">${Q.flag}</div>
        <div class="pick-sub">${LANG==='ar'?'اكتب اسم الدولة':'Type the country name'}</div>
        <div id="statusRow" class="status-row"></div>`);
      pushMirror({ headline: Q.flag });
      Audio_.sfx.sting();
      const answers = await collectWithTimer({ type:'text', title:LANG==='ar'?'اسم الدولة؟':'Country name?', context:Q.flag, maxLen:40, seconds:15 }, pids, 15);
      const right = pids.filter(pid=>{
        const v=(val(answers,pid)||'').trim().toUpperCase();
        return v===ansUp||(ansUp.includes(v)&&v.length>2);
      }).sort((a,b)=>answers[a].order-answers[b].order);
      right.forEach(pid=>addScore(pid,CORRECT_PTS));
      Audio_.sfx.reveal(); FX.burst(80);
      scene(`<div class="eyebrow">🚩 FLAG HUNT</div>
        <div style="font-size:clamp(70px,12vw,110px);text-align:center;margin:1vmin 0;line-height:1">${Q.flag}</div>
        <div class="prompt-card display" style="color:var(--yellow);font-size:clamp(24px,4vw,42px);margin:1vmin 0">${esc(answer)}</div>
        <div class="score-list">${pids.map((pid,idx)=>{const p=safeP(pid);if(!p)return '';const got=right.includes(pid);const pts=got?CORRECT_PTS:0;const typed=(val(answers,pid)||'').trim()||'—';return `<div class="score-row" style="animation-delay:${idx*.1}s"><div class="avatar" style="background:${p.color}">${p.emoji}</div><div class="bar-track"><div class="bar-fill" style="width:${got?80:10}%;background:${got?'var(--green)':'rgba(255,255,255,.1)'}">${esc(p.name.length>12?p.name.slice(0,11)+"…":p.name)} ${got?'✓ +'+pts:'✗ '+esc(typed)}</div></div></div>`;}).join('')}</div>`);
      pushMirror({ headline: `${Q.flag} = ${answer}` });
      await say(right.length?`${right.map(pid=>players.find(p=>p.pid===pid)?.name).join(', ')} ${t('got_it_right')}!`:(LANG==='ar'?`ولا واحد! هو ${answer}`:`Nobody! It was ${answer}.`));
      hideHost(); await waitNext();
      if(i<qs.length-1) await showScores();
    }
    await showScores();
  }

  async function playHigherlow() {
    await modeTitleCard('higherlow');
    const rounds = window.HYPOX_STATE?.rounds || 5;
    const qs = await Content.get('higherlow', LANG, rounds);
    if (!qs.length) { scene(`<div class="prompt-card display">📊 ${LANG==='ar'?'تعذّر تحميل الأسئلة':'Could not load questions'}</div>`); await waitNext(5); return; }
    const CORRECT_PTS = 1000;
    for (let i = 0; i < qs.length; i++) {
      const Q = qs[i];
      // Smart hint: for year questions (n looks like a year), stay within ±30 years
      // For other quantities, use proportional offset (60-120% of real value)
      const isYear = Q.n > 1800 && Q.n <= new Date().getFullYear() + 1 && (!Q.unit || Q.unit.toLowerCase().includes('year') || Q.unit === '');
      const hint = isYear
        ? Q.n + Math.round((Math.random() > 0.5 ? 1 : -1) * (5 + Math.random() * 25))
        : Math.round(Q.n * (0.6 + Math.random() * 0.6));
      await FX.wipe();
      setPill(`${t('round')} ${i+1} ${t('of')} ${qs.length}`);
      const opts = [{id:'higher',label:LANG==='ar'?'⬆️ أكثر':'⬆️ Higher',color:'#34d399'},{id:'lower',label:LANG==='ar'?'⬇️ أقل':'⬇️ Lower',color:'#f472b6'}];
      scene(`<div class="eyebrow">📊 ${LANG==='ar'?'فوق ولا تحت؟':'HIGHER OR LOWER?'}</div>
        <div class="prompt-card display">${esc(Q.q)}</div>
        <div class="pick-sub" style="font-size:clamp(28px,5vw,52px);color:var(--yellow);font-family:'Fredoka One',sans-serif;margin:1vmin 0">${hint.toLocaleString()} ${Q.unit}</div>
        <div class="pick-sub" style="opacity:.7">${LANG==='ar'?'الرقم الحقيقي فوق ولا تحت؟':'Is the real answer higher or lower?'}</div>
        <div id="statusRow" class="status-row"></div>`);
      // Send to phone as separate fields so controller renders cleanly
      const hlSpec = {
        type: 'higherlow', // custom type for clean rendering
        question: Q.q,
        ref: `${hint.toLocaleString()} ${Q.unit}`,
        refLabel: LANG==='ar'?'الرقم المرجعي':'Reference number',
        options: opts,
        seconds: 15
      };
      pushMirror({ headline: Q.q, sub: `${hint.toLocaleString()} ${Q.unit}` });
      Audio_.sfx.sting(); hostSay('prompt');
      const pids = players.map(p=>p.pid);
      const answers = await collectWithTimer(hlSpec, pids, 15);
      const correctId = Q.n > hint ? 'higher' : 'lower';
      Audio_.sfx.drum(); await sleep(500);
      const right = pids.filter(pid=>val(answers,pid)===correctId).sort((a,b)=>answers[a].order-answers[b].order);
      right.forEach(pid=>addScore(pid,CORRECT_PTS));
      Audio_.sfx.reveal(); FX.burst(60);
      const arrow = correctId==='higher'?'⬆️':'⬇️';
      const ansLabel = `${arrow} ${LANG==='ar'?'الجواب':'Answer'}: ${Q.n.toLocaleString()} ${Q.unit}`;
      scene(`<div class="eyebrow">${esc(Q.q)}</div>
        <div class="prompt-card display" style="color:var(--yellow);font-size:clamp(20px,3.5vmin,36px)">${ansLabel}</div>
        <div class="score-list" style="margin-top:1.5vmin">${pids.map((pid,idx2)=>{const p=safeP(pid);const got=val(answers,pid)===correctId;return `<div class="score-row" style="animation-delay:${idx2*.1}s">${avatarHTML(p)}<div class="bar-track"><div class="bar-fill" style="width:${got?80:20}%;background:${got?'var(--green)':'rgba(255,255,255,.1)'}"><span class="bar-name">${esc(p.name)}</span><span class="bar-pts">${got?'✓ +'+(CORRECT_PTS):'✗ 0'}</span></div></div></div>`;}).join('')}</div>`);
      pushMirror({ headline: ansLabel });
      await hostSay('reveal');
      await waitNext();
      if (i < qs.length - 1) await showScores();
    }
    await showScores();
  }

  async function play2t1l() {
    await modeTitleCard('2t1l');
    const count = window.HYPOX_STATE?.rounds||3;
    const allSeats = players.slice().sort(()=>Math.random()-.5);
    const seats = Array.from({length:count},(_,i)=>allSeats[i%allSeats.length]);
    for (let r = 0; r < seats.length; r++) {
      const target = seats[r];
      await FX.wipe();
      setPill(`${t('round')} ${r+1} ${t('of')} ${seats.length}`);
      scene(`<div class="eyebrow">🤥 ${LANG==='ar'?'اثنين صح وكذبة':'2 TRUTHS 1 LIE'}</div><div class="hotseat">${avatarHTML(target)}<div class="pname">${esc(target.name)}</div></div><div class="pick-sub">${LANG==='ar'?`${target.name} يكتب الثلاث جمل على جواله`:`${target.name} — write your 3 statements on your phone`}</div><div id="statusRow" class="status-row"></div>`);
      pushMirror({ headline: LANG==='ar'?`دور ${target.name}!`:`${target.name}'s turn!` });
      Audio_.sfx.sting();
      const i1 = await collectWithTimer({ type:'text', title:LANG==='ar'?'حقيقة أولى':'Truth #1', context:LANG==='ar'?'اكتب حقيقة عنك':'Write a truth about yourself', maxLen:80, seconds:60 }, [target.pid], 60);
      const i2 = await collectWithTimer({ type:'text', title:LANG==='ar'?'حقيقة ثانية':'Truth #2', context:LANG==='ar'?'حقيقة ثانية':'Another truth', maxLen:80, seconds:60 }, [target.pid], 60);
      const i3 = await collectWithTimer({ type:'text', title:LANG==='ar'?'الكذبة':'The Lie', context:LANG==='ar'?'اكتب كذبة مقنعة':'Write a convincing lie', maxLen:80, seconds:60 }, [target.pid], 60);
      const s1=val(i1,target.pid)||'...', s2=val(i2,target.pid)||'...', s3=val(i3,target.pid)||'...';
      const stmts = shuffle([{text:s1,truth:true},{text:s2,truth:true},{text:s3,truth:false}]);
      const lieIdx = stmts.findIndex(s=>!s.truth);
      const colors = ['#2de1fc','#ff3d8a','#ffd23f'];
      await FX.wipe();
      scene(`<div class="eyebrow">${esc(target.name)} — ${LANG==='ar'?'أيها الكذبة؟':'which is the lie?'}</div><div class="quiz-grid" style="grid-template-columns:1fr">${stmts.map((st,j)=>`<div class="quiz-opt" id="stmt-${j}" style="--qc:${colors[j]};font-size:clamp(15px,2vw,18px)"><span class="q-letter display">${'ABC'[j]}</span> ${esc(st.text)}</div>`).join('')}</div>`);
      const others = players.filter(p=>p.pid!==target.pid).map(p=>p.pid);
      const votes = await collectWithTimer({ type:'choice', title:LANG==='ar'?'أيها الكذبة؟':'Which is the lie?', options:stmts.map((st,j)=>({id:j,label:`${'ABC'[j]} · ${st.text}`,color:colors[j]})), seconds:20 }, others, 20);
      Audio_.sfx.drum(); await sleep(900);
      document.getElementById('stmt-'+lieIdx)?.classList.add('q-correct');
      stmts.forEach((_,j)=>{if(j!==lieIdx)document.getElementById('stmt-'+j)?.classList.add('q-dim');});
      Audio_.sfx.correct(); FX.burst(80);
      const finders = others.filter(pid=>val(votes,pid)===lieIdx);
      finders.forEach(pid=>addScore(pid,1000));
      if(finders.length===0) addScore(target.pid,1000);
      const fNames = finders.map(pid=>players.find(p=>p.pid===pid)?.name).join(', ');
      pushMirror({ headline: LANG==='ar'?`الكذبة: ${stmts[lieIdx].text}`:`The lie: ${stmts[lieIdx].text}` });
      await say(finders.length===0?(LANG==='ar'?`ولا واحد اكتشف! ${target.name} فاز!`:`Nobody caught ${target.name}! They win!`):(LANG==='ar'?`${fNames} اكتشفوا الكذبة!`:`${fNames} found the lie!`));
      hideHost(); await waitNext();
      if (r < seats.length - 1) await showScores();
    }
    await showScores();
  }

  async function playEmojiphrase() {
    await modeTitleCard('emojiphrase');
    const rounds = window.HYPOX_STATE?.rounds || 5;
    const qs = await Content.get('emojiphrase', LANG, rounds);
    const CORRECT_PTS = 1000;
    const colors = ['#2de1fc','#ff3d8a','#ffd23f','#7dff6a'];
    for (let i = 0; i < qs.length; i++) {
      const Q = qs[i];
      const idxs = Q.options.map((_,j)=>j).sort(()=>Math.random()-.5);
      const opts = idxs.map(j=>Q.options[j]);
      const correct = idxs.indexOf(Q.correct);
      await FX.wipe();
      setPill(`${t('round')} ${i+1} ${t('of')} ${qs.length}`);
      scene(`<div class="eyebrow">💬 ${LANG==='ar'?'فك العبارة':'EMOJI PHRASE'}</div><div class="emoji-riddle">${esc(Q.e)}</div><div class="quiz-grid">${opts.map((o,j)=>`<div class="quiz-opt" id="qopt-${j}" style="--qc:${colors[j]}"><span class="q-letter display">${'ABCD'[j]}</span> ${esc(o)}</div>`).join('')}</div>`);
      pushMirror({ headline: Q.e });
      Audio_.sfx.sting();
      const pids = players.map(p=>p.pid);
      const answers = await collectWithTimer({ type:'choice', title:LANG==='ar'?'فك العبارة!':'Decode the phrase!', context:Q.e, seconds:15, options:opts.map((o,j)=>({id:j,label:`${'ABCD'[j]} · ${o}`,color:colors[j]})) }, pids, 15);
      Audio_.sfx.drum(); await sleep(900);
      document.getElementById('qopt-'+correct)?.classList.add('q-correct');
      opts.forEach((_,j)=>{if(j!==correct)document.getElementById('qopt-'+j)?.classList.add('q-dim');});
      Audio_.sfx.correct(); FX.burst(80);
      const right = pids.filter(pid=>val(answers,pid)===correct).sort((a,b)=>answers[a].order-answers[b].order);
      right.forEach(pid=>addScore(pid,CORRECT_PTS));
      pushMirror({ headline: `${Q.e} = ${opts[correct]}` });
      await say(right.length?`${right.map(pid=>players.find(p=>p.pid===pid)?.name).join(', ')} ${t('got_it_right')}!`:(LANG==='ar'?`الجواب: ${opts[correct]}`:`Answer: ${opts[correct]}`));
      hideHost(); await waitNext();
      if (i < qs.length - 1) await showScores();
    }
    await showScores();
  }

  async function playEmojiword() {
    await modeTitleCard('emojiword');
    const rounds = window.HYPOX_STATE?.rounds || 5;
    const qs = await Content.get('emojiword', LANG, rounds);
    const CORRECT_PTS = 1000;
    const colors = ['#2de1fc','#ff3d8a','#ffd23f','#7dff6a'];
    for (let i = 0; i < qs.length; i++) {
      const Q = qs[i];
      const idxs = Q.options.map((_,j)=>j).sort(()=>Math.random()-.5);
      const opts = idxs.map(j=>Q.options[j]);
      const correct = idxs.indexOf(Q.correct);
      await FX.wipe();
      setPill(`${t('round')} ${i+1} ${t('of')} ${qs.length}`);
      scene(`<div class="eyebrow">💡 ${LANG==='ar'?'فك الكلمة':'EMOJI WORD'}</div><div class="emoji-riddle">${esc(Q.e)}</div><div class="quiz-grid">${opts.map((o,j)=>`<div class="quiz-opt" id="qopt-${j}" style="--qc:${colors[j]}"><span class="q-letter display">${'ABCD'[j]}</span> ${esc(o)}</div>`).join('')}</div>`);
      pushMirror({ headline: Q.e });
      Audio_.sfx.sting();
      const pids = players.map(p=>p.pid);
      const answers = await collectWithTimer({ type:'choice', title:LANG==='ar'?'فك الكلمة!':'Decode the word!', context:Q.e, seconds:12, options:opts.map((o,j)=>({id:j,label:`${'ABCD'[j]} · ${o}`,color:colors[j]})) }, pids, 12);
      Audio_.sfx.drum(); await sleep(900);
      document.getElementById('qopt-'+correct)?.classList.add('q-correct');
      opts.forEach((_,j)=>{if(j!==correct)document.getElementById('qopt-'+j)?.classList.add('q-dim');});
      Audio_.sfx.correct(); FX.burst(80);
      const right = pids.filter(pid=>val(answers,pid)===correct).sort((a,b)=>answers[a].order-answers[b].order);
      right.forEach(pid=>addScore(pid,CORRECT_PTS));
      pushMirror({ headline: `${Q.e} = ${opts[correct]}` });
      await say(right.length?`${right.map(pid=>players.find(p=>p.pid===pid)?.name).join(', ')} ${t('got_it_right')}!`:(LANG==='ar'?`الجواب: ${opts[correct]}`:`Answer: ${opts[correct]}`));
      hideHost(); await waitNext();
      if (i < qs.length - 1) await showScores();
    }
    await showScores();
  }

  async function playEmojiplace() {
    await modeTitleCard('emojiplace');
    const rounds = window.HYPOX_STATE?.rounds || 5;
    const qs = await Content.get('emojiplace', LANG, rounds);
    if (!qs.length) { scene(`<div class="prompt-card display">🌍 ${LANG==='ar'?'تعذّر تحميل الأسئلة':'Could not load questions'}</div>`); await waitNext(5); return; }
    const pids = players.map(p=>p.pid);
    const BASE_PTS = 1000;
    const PTS_PER_REVEAL = 200;
    for (let i = 0; i < qs.length; i++) {
      const Q = qs[i];
      const answer = Q.answer || (Q.options ? Q.options[Q.correct] : '');
      const category = Q.category || 'Place';
      const ansUp = answer.toUpperCase().replace(/\s/g,'');
      const ansLetters = answer.toUpperCase().split('');
      const letterIndexes = ansLetters.map((ch,j)=>ch===' '?null:j).filter(j=>j!==null);
      const totalLetters = letterIndexes.length;
      let revealed = new Array(ansLetters.length).fill(false);
      const revealOrder = letterIndexes.slice().sort(()=>Math.random()-.5);
      let revealCount = 0;
      let currentMaxPts = BASE_PTS;
      function blankDisplay() {
        return ansLetters.map((ch,j)=>{
          if(ch===' ')return '<span class="hint-space"> </span>';
          return revealed[j]?`<span class="hint-letter revealed">${esc(ch)}</span>`:'<span class="hint-letter blank">_</span>';
        }).join('');
      }
      await FX.wipe(); setPill(`${i+1}/${qs.length}`);
      $('#scr-game').classList.add('rebus-input-active');
      scene(`<div class="rebus-live"><div class="eyebrow">🌍 EMOJI PLACE</div>
        <div class="rebus-emojis">${esc(Q.e)}</div>
        <div class="rebus-category">${esc(category)}</div>
        <div class="hint-display" id="hD">${blankDisplay()}</div>
        <div class="rebus-pts" id="rebPts">${currentMaxPts} pts</div>
        <div class="timer-bar"><div class="timer-fill" id="tF" style="width:100%"></div></div>
        <div id="statusRow" class="status-row"></div></div>`);
      pushMirror({headline:Q.e, sub:`${category} · ${totalLetters} letters`, pill:`${i+1}/${qs.length}`});
      Audio_.sfx.sting();
      const TOTAL_SECS = 30;
      const REVEAL_EVERY = Math.floor(TOTAL_SECS/(Math.floor(totalLetters*.6)+1))*1000;
      const t0=Date.now();
      const tI=setInterval(()=>{
        const elapsed=Date.now()-t0;
        const fill=document.getElementById('tF');
        if(fill)fill.style.width=Math.max(0,100-elapsed/(TOTAL_SECS*10))+'%';
        if(revealCount<Math.floor(totalLetters*.6)&&elapsed>REVEAL_EVERY*(revealCount+1)){
          revealed[revealOrder[revealCount]]=true;revealCount++;
          currentMaxPts=Math.max(200,BASE_PTS-revealCount*PTS_PER_REVEAL);
          const hD=document.getElementById('hD');if(hD)hD.innerHTML=blankDisplay();
          const rPts=document.getElementById('rebPts');if(rPts)rPts.textContent=currentMaxPts+' pts';
        }
      },200);
      const answers=await collectWithTimer({type:'text',title:LANG==='ar'?'اكتب المكان!':'Type the place!',context:`${Q.e}
${category} — ${totalLetters} letters`,maxLen:40,seconds:TOTAL_SECS,answerLen:totalLetters,compactRebus:true},pids,TOTAL_SECS);
      clearInterval(tI);
      $('#scr-game').classList.remove('rebus-input-active');
      const right=pids.filter(pid=>{const v=(val(answers,pid)||'').trim().toUpperCase().replace(/\s/g,'');return v===ansUp;}).sort((a,b)=>answers[a].order-answers[b].order);
      const earnedPoints=new Map(right.map(pid=>{
        const submittedAt=answers[pid].receivedAt||answers[pid].t||Date.now();
        const revealsAtSubmit=Math.min(
          Math.floor(totalLetters*.6),
          Math.floor(Math.max(0,submittedAt-t0)/REVEAL_EVERY)
        );
        return [pid,Math.max(200,BASE_PTS-revealsAtSubmit*PTS_PER_REVEAL)];
      }));
      right.forEach(pid=>addScore(pid,earnedPoints.get(pid)));
      Audio_.sfx.reveal(); FX.burst(80);
      const exp=Q.explanation||'';
      scene(`<div class="eyebrow">🌍 ${esc(Q.e)}</div>
        <div class="rebus-answer display">${esc(answer.toUpperCase())}</div>
        ${exp?`<div class="rebus-explain">${esc(exp)}</div>`:''}
        <div class="score-list">${pids.map((pid,idx)=>{const p=safeP(pid);if(!p)return '';const got=right.includes(pid);const pts=got?earnedPoints.get(pid):0;const name=esc(p.name.length>12?p.name.slice(0,11)+"…":p.name);return `<div class="score-row" style="animation-delay:${idx*.1}s"><div class="avatar" style="background:${p.color}">${p.emoji}</div><div class="bar-track${got?'':' zero-track'}">${got?`<div class="bar-fill" style="width:80%;background:var(--green)">${name} ✓ +${pts}</div>`:`<div class="bar-zero"><span>${name} ✗</span><span>0</span></div>`}</div></div>`;}).join('')}</div>`);
      pushMirror({headline:`🌍 = ${answer.toUpperCase()}`});
      await say(right.length?`${right.map(pid=>players.find(p=>p.pid===pid)?.name).join(', ')} ${t('got_it_right')}!`:(LANG==='ar'?`المكان: ${answer}`:`It was ${answer}! ${exp}`));
      hideHost(); await waitNext();
      if(i<qs.length-1) await showScores();
    }
    await showScores();
  }


  /* ===== SPY GAME ===== */
  async function playSpy() {
    await modeTitleCard('spy');
    const numSpies = window.HYPOX_STATE?.spyCount || 1;
    const catKey = window.HYPOX_STATE?.spyCategory || 'location';
    const CATS = {
      location:{en:['Coffee shop','Beach','Airport','Hospital','School','Police station','Restaurant','Hotel','Bank','Library','Cinema','Gym','Museum','Train station','Mosque','Football stadium','Wedding hall','Desert camp','Shopping mall','Submarine','Zoo','Space station','Casino','Prison','Cruise ship'],ar_en:['Souq','Desert camp','Majlis','Mosque','Hammam','Shisha cafe','Diwaniya','Camel race track','Corniche','Gold souk','Friday market','Wadi','Falconry club','Eid celebration','Wedding hall','Ramadan tent','Coffee shop','Dates farm','Palace','Fish market'],ar:['مقهى','شاطئ','مطار','مستشفى','مدرسة','مركز شرطة','مطعم','فندق','بنك','مكتبة','سينما','صالة رياضية','متحف','محطة قطار','مسجد','ملعب كرة قدم','قاعة أفراح','مخيم صحراوي','مول تجاري','سوق شعبي','حديقة حيوان','غواصة','محطة فضاء','سجن','سفينة سياحية']},
      event:{en:['Birthday party','Wedding','Job interview','First date','Graduation','Funeral','Press conference','Sports final','Music concert','Surprise party','Business meeting','Baby shower','Divorce party','Prom night','Therapy session','Court trial'],ar_en:['Arabic wedding','Eid gathering','Ramadan iftar','Diwaniya night','Graduation wasta','Gulf football derby','Desert road trip','Family reunion','Engagement night','Majlis debate','Haj trip','Umrah journey','National day celebration','Ghabqa night','Friday family lunch'],ar:['حفلة عيد ميلاد','حفل زفاف','مقابلة عمل','موعد أول','تخرج','جنازة','مؤتمر صحفي','نهائي رياضي','حفل موسيقي','حفلة مفاجأة','اجتماع عمل','بيبي شاور','حفلة طلاق','ليلة السفرة','جلسة علاج نفسي','محاكمة']},
      movie:{en:['The Lion King','Titanic','Avengers','Harry Potter','Shrek','Frozen','The Godfather','Star Wars','Jurassic Park','Toy Story','Interstellar','The Dark Knight','Forrest Gump','The Matrix','Home Alone','Joker'],ar_en:['Bab Al Hara','Selfie','Exit','The Green Sea','Wadjda','Captain Falken','The Idol','Perfect Strangers Arab','Gamoura','Abu Zaabal'],ar:['الأسد الملك','تيتانيك','أفنجرز','هاري بوتر','شريك','فروزن','العراب','حرب النجوم','حديقة الديناصورات','قصة لعبة','إنترستيلار','فارس الظلام','فورست غامب','ذا ماتريكس','وحيدًا في المنزل','جوكر']},
      food:{en:['Pizza','Sushi','Burger','Shawarma','Pasta','Tacos','Biryani','Hummus','Ramen','Steak','Fried chicken','Cheesecake'],ar_en:['Kabsa','Shawarma','Harees','Machboos','Muhallabia','Luqaimat','Balaleet','Saleeg','Manti','Margoog','Jareesh','Thareed','Asida','Shakshouka','Fatteh'],ar:['بيتزا','سوشي','برغر','شاورما','باستا','تاكوس','برياني','حمص','رامن','ستيك','دجاج مقلي','تشيزكيك']},
      sport:{en:['Football','Basketball','Tennis','Swimming','Boxing','Golf','Formula 1','Wrestling','Volleyball','Baseball','Cricket','Table tennis'],ar_en:['Gulf Cup','Camel racing','Falconry','Al Hilal vs Al Ittihad','Saudi Pro League','Padel','Arab Champions League','Equestrian','Desert rally','Fishing tournament'],ar:['كرة القدم','كرة السلة','تنس','سباحة','ملاكمة','غولف','فورمولا 1','مصارعة','كرة طائرة','بيسبول','كريكيت','تنس طاولة']},
      animal:{en:['Lion','Elephant','Dolphin','Eagle','Gorilla','Penguin','Giraffe','Shark','Crocodile','Panda','Kangaroo','Octopus'],ar_en:['Camel','Saluki dog','Falcon','Arabian horse','Oryx','Sand gazelle','Honey badger','Desert fox','Red sea turtle','Dugong'],ar:['أسد','فيل','دولفين','نسر','غوريلا','بطريق','زرافة','قرش','تمساح','باندا','كنغر','أخطبوط']},
      celebrity:{en:['Cristiano Ronaldo','Elon Musk','Beyonce','Will Smith','Kim Kardashian','Lionel Messi','Taylor Swift','Jeff Bezos','MrBeast','Bad Bunny','Dwayne Johnson','Rihanna','LeBron James','Kylie Jenner','Drake'],ar_en:['Mohammed bin Salman','Sheikh Mohammed Dubai','Amr Diab','Nancy Ajram','Haifa Wehbe','Maher Zain','Mohamed Salah','Yusra Mardini','Omar Abdulaziz','Nayef Aggad','Turki Al Sheikh','Ragheb Alama','Majid Al Mohandis','Balqees','Nawal El Zoghbi'],ar:['كريستيانو رونالدو','إيلون ماسك','بيونسيه','ويل سميث','كيم كارداشيان','ليونيل ميسي','تايلور سويفت','جيف بيزوس','مستر بيست','دواين جونسون','ريهانا','محمد صلاح','عمرو دياب','نانسي عجرم','هيفاء وهبي']},
    };
    const flavor = window.HYPOX_STATE?.flavor || 'global';
    // Arab flavor = Arabic-cultural content in English; Global = worldwide content
    const poolLang = flavor==='arab' ? 'ar_en' : 'en';
    const staticPool = (CATS[catKey]||CATS.location)[poolLang] || (CATS[catKey]||CATS.location).en;
    // Try AI backend for fresh words (returns {category, words:[...]})
    let aiWords = [];
    try {
      const aiRaw = await Content.get('spy', LANG, 1);
      if (aiRaw && aiRaw[0] && Array.isArray(aiRaw[0].words)) aiWords = aiRaw[0].words;
    } catch(e) {}
    // Merge: AI words first (fresh), then static (familiar), deduplicated
    const seen = new Set();
    const pool = [...aiWords, ...staticPool].filter(w => {
      const k = w.toUpperCase(); if (seen.has(k)) return false; seen.add(k); return true;
    });
    const word = pool[Math.floor(Math.random()*pool.length)];
    const pids=players.map(p=>p.pid);
    const safeSpyCount = Math.min(numSpies, Math.floor(pids.length/2));
    const spyPids=pids.slice().sort(()=>Math.random()-.5).slice(0,safeSpyCount);
    await FX.wipe(); setPill(LANG==='ar'?'الجاسوس':'SPY');
    scene(`<div class="eyebrow">🕵️ ${LANG==='ar'?'لعبة الجاسوس':'SPY GAME'}</div>
      <div class="prompt-card display">${LANG==='ar'?'الكل شاف دوره على جواله':'Everyone check your role on your phone'}</div>
      <div class="pick-sub">${LANG==='ar'?numSpies+' جاسوس بينكم!':numSpies+' spy among you!'}</div>`);
    if(net.isOffline){
      // One device: show "pass to X" then reveal role privately
      for(let pi=0; pi<pids.length; pi++){
        const pid=pids[pi];
        const p=safeP(pid);
        const isSpy=spyPids.includes(pid);
        const nextP=pi<pids.length-1?safeP(pids[pi+1]):null;
        // Step 1: Pass screen (everyone sees this)
        await FX.wipe();
        scene(`<div class="eyebrow">🕵️ SPY GAME</div>
          <div style="font-size:clamp(48px,9vw,80px);text-align:center;margin:2vmin 0">${p.emoji}</div>
          <div class="prompt-card display">Pass to <strong style="color:var(--yellow)">${esc(p.name)}</strong></div>
          <div class="pick-sub">Only ${esc(p.name)} should look at the screen now</div>
          <button class="big-btn" id="revealRoleBtn" style="margin-top:2vmin">👁️ Reveal My Role</button>`);
        await new Promise(res=>$('#revealRoleBtn').addEventListener('click',res,{once:true}));
        // Step 2: Show role
        await FX.wipe();
        scene(`<div class="eyebrow">${p.emoji} ${esc(p.name)}</div>
          <div class="prompt-card display" style="color:${isSpy?'var(--pink)':'var(--green)'};font-size:clamp(22px,4vw,36px)">${isSpy?'🕵️ YOU ARE THE SPY!':'🤵 YOU ARE AN AGENT'}</div>
          <div class="pick-sub" style="font-size:clamp(15px,2vw,20px)">${isSpy?'Find the secret word from the discussion':'Secret word: <strong style="color:var(--yellow)">'+word+'</strong>'}</div>
          <div class="pick-sub" style="opacity:.6;font-size:13px;margin-top:12px">Memorise your role, then press Next</div>
          <button class="big-btn" id="doneRoleBtn" style="margin-top:2vmin">✓ Got It — Pass Phone${nextP?' to '+esc(nextP.name):''}</button>`);
        await new Promise(res=>$('#doneRoleBtn').addEventListener('click',res,{once:true}));
        // Step 3: Blank screen for passing
        await FX.wipe();
        scene(`<div class="prompt-card display" style="opacity:.5">🙈</div>`);
        await sleep(800);
      }
    } else {
      net.setState({phase:'spy-roles',roles:Object.fromEntries(pids.map(pid=>[pid,spyPids.includes(pid)?{role:'spy',word:null}:{role:'agent',word}])),word,numSpies});
      Audio_.sfx.sting(); await sleep(7000);
    }
    const DISC = window.HYPOX_STATE?.spyDisc || Math.max(60, players.length * 15);
    // Build discussion order: each player asks the next
    const discOrder = players.slice().sort(() => Math.random() - .5);
    const pairLines = discOrder.map((p, i) => {
      const next = discOrder[(i + 1) % discOrder.length];
      return `${p.emoji} <b>${esc(p.name)}</b> → ${next.emoji} ${esc(next.name)}`;
    }).join('<br>');
    await FX.wipe();
    scene(`<div class="eyebrow">🕵️ ${LANG==='ar'?'وقت النقاش':'DISCUSSION TIME'}</div>
      <div class="prompt-card display">${LANG==='ar'?'ناقشوا — من الجاسوس؟':'Discuss — who is the spy?'}</div>
      <div class="year-reveal" id="discT">${DISC}</div>
      <div class="pick-sub" style="font-size:clamp(12px,1.8vmin,15px);line-height:1.8;margin-top:1vmin">${pairLines}</div>
      <div class="pick-sub" style="opacity:.7;font-size:clamp(11px,1.5vmin,13px)">${LANG==='ar'?'اسألوا أسئلة — لا تقولوا الكلمة مباشرة!':'Ask questions — don\'t say the word directly!'}</div>`);
    pushMirror({headline:LANG==='ar'?'ناقشوا!':'Discuss!',sub:LANG==='ar'?'من هو الجاسوس؟':'Who is the spy?'});
    let disc=DISC;
    const dI=setInterval(()=>{disc--;const el=document.getElementById('discT');if(el)el.textContent=disc;if(disc<=0)clearInterval(dI);},1000);
    await sleep(DISC*1000); clearInterval(dI);
    await FX.wipe();
    scene(`<div class="eyebrow">🗳️ ${LANG==='ar'?'صوّتوا':'VOTE'}</div>
      <div class="prompt-card display">${LANG==='ar'?'من هو الجاسوس؟':'Who is the spy?'}</div>
      <div id="statusRow" class="status-row"></div>`);
    const votes=await collectWithTimer({type:'choice',title:LANG==='ar'?'من هو الجاسوس؟':'Who is the spy?',options:players.map(p=>({id:p.pid,label:p.emoji+' '+p.name,color:p.color})),seconds:30},pids,30);
    const tally={};
    pids.forEach(pid=>{const v=val(votes,pid);if(v&&v!==pid)tally[v]=(tally[v]||0)+1;});
    const maxV=Math.max(0,...Object.values(tally));
    const accused=Object.entries(tally).filter(([,c])=>c===maxV).map(([pid])=>pid);
    const caught=accused.some(pid=>spyPids.includes(pid));
    if(caught){
      const spyPs=spyPids.map(pid=>players.find(p=>p.pid===pid)).filter(Boolean);
      await FX.wipe();
      scene(`<div class="eyebrow">🕵️ ${LANG==='ar'?'الجاسوس اتكشف!':'SPY CAUGHT!'}</div>
        <div class="hotseat">${spyPs.map(sp=>avatarHTML(sp)).join('')}<div class="pname">${esc(spyPs.map(p=>p.name).join(' & '))}</div></div>
        <div class="pick-sub">${LANG==='ar'?'فرصة أخيرة — خمّن الكلمة السرية!':'Last chance — guess the secret word!'}</div>`);
      Audio_.sfx.buzzer(); await sleep(3000);
      const guesses=await collectWithTimer({type:'text',title:LANG==='ar'?'اخمن الكلمة!':'Guess the word!',maxLen:40,seconds:20},spyPids,20);
      const spyWon=spyPids.some(pid=>{const g=(val(guesses,pid)||'').trim().toUpperCase();return g===word.toUpperCase()||(word.toUpperCase().includes(g)&&g.length>3);});
      await FX.wipe(); Audio_.sfx.reveal(); FX.burst(120);
      if(spyWon){
        spyPids.forEach(pid=>addScore(pid,1000));
        scene(`<div class="crown">🕵️</div><div class="prompt-card display" style="color:var(--pink)">${LANG==='ar'?spyPs.map(p=>p.name).join(' & ')+' فاز! خمّن الكلمة!':spyPs.map(p=>p.name).join(' & ')+' wins! Guessed it!'}</div><div class="pick-sub">${LANG==='ar'?'الكلمة: '+word:'Word: '+word}</div>`);
      } else {
        pids.filter(pid=>!spyPids.includes(pid)).forEach(pid=>addScore(pid,1000));
        scene(`<div class="crown">🎉</div><div class="prompt-card display" style="color:var(--green)">${LANG==='ar'?'العملاء فازوا! الجاسوس ما عرف!':'Agents win! Spy failed!'}</div><div class="pick-sub">${LANG==='ar'?'الكلمة: '+word:'Word: '+word}</div>`);
      }
    } else {
      spyPids.forEach(pid=>addScore(pid,1000));
      // non-spies get 0 when spy wins
      const spyNames=spyPids.map(pid=>players.find(p=>p.pid===pid)?.name).join(' & ');
      Audio_.sfx.buzzer();
      scene(`<div class="crown">🕵️</div><div class="prompt-card display" style="color:var(--pink)">${LANG==='ar'?'الجاسوس فاز! كان '+spyNames+'!':'Spy wins! It was '+spyNames+'!'}</div><div class="pick-sub">${LANG==='ar'?'الكلمة: '+word:'Word: '+word}</div>`);
    }
    hideHost(); await waitNext();
    await showScores();
  }

  const MODES = { bluff: playBluff, wyr: playWyr, interrogation: playInterrogation, diss: playDiss, quiz: playQuiz, trivia: playQuiz, pinpoint: playPinpoint, emoji: playEmoji, year: playYear, mostlikely: playMostlikely, trueorlie: playTrueorlie, flaghunt: playFlaghunt, higherlow: playHigherlow, '2t1l': play2t1l, emojiplace: playEmojiplace, spy: playSpy };

  async function run(netInstance, playerList, mode) {
    net = netInstance;
    players = playerList;
    // Start auto-remove watcher for offline players
    if (net.watchAndRemoveOffline) {
      net.watchAndRemoveOffline(pid => {
        const idx = players.findIndex(p => p.pid === pid);
        if (idx !== -1) {
          const removed = players[idx];
          players.splice(idx, 1);
          const toast = document.createElement('div');
          toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:var(--text2);font-family:Fredoka One,sans-serif;font-size:14px;padding:8px 20px;border-radius:20px;z-index:500;';
          toast.textContent = (removed.emoji||'👤') + ' ' + (removed.name||'Player') + (LANG==='ar'?' غادر اللعبة':' left the game');
          document.body.appendChild(toast);
          setTimeout(() => toast.remove(), 3000);
          // Broadcast to all players' phones via mirror
          updateMirror({ announce: (removed.emoji||'👤') + ' ' + (removed.name||'Player') + (LANG==='ar'?' غادر اللعبة':' left the game'), announceId: Date.now() });
          setTimeout(() => updateMirror({ announce: null, announceId: null }), 4000);
        }
      });
    }
    startSharedScreen();
    window.__hypoxAbort = false;
    window._hypoxSession = Date.now().toString(36); window._clearContentCache && window._clearContentCache(); // fresh session + clear cache
    let playAgain = true;
    let isFirstRound = true;
    while(playAgain && !window.__hypoxAbort) {
      playAgain = false;
      window.__hypoxPlayAgain = false;
      window.__hypoxSkipTutorial = !isFirstRound; // skip tutorial on play again
      isFirstRound = false;
      players.forEach(p=>p.score=0);
      pickHost();
      try {
        if (!MODES[mode]) throw new Error(`Unknown mode: "${mode}" (available: ${Object.keys(MODES).join(', ')})`);
        await MODES[mode]();
      } catch(e) {
        if (window.__hypoxAbort) { stopSharedScreen(); return; }
        console.error('Game mode error:', e);
        scene(`<div class="eyebrow">⚠️ Something went wrong</div>
          <div class="prompt-card display" style="font-size:clamp(14px,2.5vmin,18px)">${esc(String(e))}</div>
          <button class="big-btn" id="errContinueBtn" style="margin-top:2vmin">Continue</button>`);
        await new Promise(r => document.getElementById('errContinueBtn')?.addEventListener('click', r, {once:true}));
      }
      if (window.__hypoxAbort) { stopSharedScreen(); return; }
      await winnerScene();
      if(window.__hypoxPlayAgain) {
        playAgain = true;
      }
    }
  }

  return { run, say, hideHost, avatarHTML, scene, setPill, stopSharedScreen };
})();
