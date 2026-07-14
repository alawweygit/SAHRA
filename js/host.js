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
    }
  }
  /* Say a line from the current host's own banter pool (falls back to i18n keys) */
  function hostSay(kind) {
    if (currentHost) {
      const pool = (currentHost.banter[LANG] || currentHost.banter.en || {})[kind];
      if (pool && pool.length) return say(pool[Math.floor(Math.random() * pool.length)]);
    }
    const legacy = { prompt: 'banter_prompt', vote: 'banter_vote', scores: 'banter_scores' }[kind];
    return legacy ? say(tPick(legacy)) : Promise.resolve();
  }

  /* ---------- tiny host-screen helpers ---------- */
  const stage = () => $('#hostStage');

  /* Mirror: in phones-only mode there is no shared TV, so we broadcast a
     lightweight text mirror of the stage to every player's phone. Harmless
     (just extra state fields) in TV mode. */
  let mirror = { headline: '', sub: '', pill: '' };
  function pushMirror(patch) {
    mirror = { ...mirror, ...patch };
    if (net && net.setMirror) net.setMirror({ ...mirror });
  }

  function scene(html) {
    const s = stage();
    s.innerHTML = html;
    s.classList.remove('scene-in'); void s.offsetWidth; s.classList.add('scene-in');
  }

  function setPill(text) { $('#roundPill').textContent = text; pushMirror({ pill: text }); }

  async function say(text, { speed = 24 } = {}) {
    const host = $('#host'), out = $('#speechText');
    pushMirror({ speech: text });
    host.classList.add('show', 'talking'); out.textContent = '';
    for (const ch of text) {
      out.textContent += ch;
      if (ch !== ' ' && Math.random() > .55) Audio_.sfx.blip();
      await sleep(speed);
    }
    host.classList.remove('talking');
    await sleep(600);
  }
  const hideHost = () => $('#host').classList.remove('show');

  function avatarHTML(p, cls = 'avatar') {
    return `<div class="${cls}" style="background:${p.color}">${p.emoji}</div>`;
  }

  function skippable() {
    return new Promise(res => { window.__hypoxSkip = () => { window.__hypoxSkip = null; res('skip'); }; });
  }

  /* ---------- input collection with big timer ---------- */
  async function collectWithTimer(spec, pids, seconds, statusLabelFn) {
    const phaseId = 'ph' + (++phaseCounter);
    const deadline = Date.now() + seconds * 1000;

    pushMirror({ headline: spec.context || spec.title || '', sub: spec.title || '' });
    net.setState({ phase: 'input', phaseId, spec, targets: pids, deadline, mirror: { ...mirror } });

    // status row of mini avatars
    const row = $('#statusRow');
    if (row) {
      row.innerHTML = pids.map(pid => {
        const p = players.find(x => x.pid === pid);
        return `<div class="mini" id="mini-${pid}">${avatarHTML(p)}<div class="check">✓</div></div>`;
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

    const inputs = await net.collect(phaseId, spec, pids, net.isOffline ? 9e7 : seconds * 1000);
    if (timerInt) clearInterval(timerInt);
    net.setState({ phase: 'wait', msg: t('watch_screen'), mirror: { ...mirror } });
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
    await FX.wipe();
    Audio_.stopMusic();
    Audio_.sfx.versus();
    const startLabel = LANG === 'ar' ? 'ابدأ ▶' : 'START ▶';
    Content.get(mode, LANG, window.HYPOX_STATE?.rounds||5).catch(()=>{});
    scene(`
      <div class="mode-card">
        <div class="mode-title display">${esc(t('mode_names')[mode])}</div>
        <div class="mode-tag">${esc(t('mode_taglines')[mode])}</div>
        <div class="mode-rules">${esc(t('mode_rules')[mode])}</div>
        <button class="big-btn" id="startModeBtn" style="margin-top:2vmin">${startLabel}</button>
      </div>`);
    setPill(t('mode_names')[mode]);
    hostSay('gamestart');
    await new Promise(res => {
      const btn = document.getElementById('startModeBtn');
      let timer = null;
      const onStart = () => { window.__hypoxSkip = null; if (timer) clearInterval(timer); res(); };
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
      headline: sorted.slice(0, 4).map((p, i) => `${['🥇','🥈','🥉','4.'][i]} ${p.name} ${p.score}`).join('  ·  '),
    });
    scene(`
      <div class="lobby-title display">${final ? esc(t('final_results')) : esc(t('scores'))}</div>
      <div class="score-list">
        ${sorted.map((p, i) => `
          <div class="score-row" style="animation-delay:${i * .12}s">
            <div class="medal">${['🥇','🥈','🥉'][i] || ''}</div>
            ${avatarHTML(p)}
            <div class="bar-track"><div class="bar-fill" id="bar-${p.pid}" style="background:${p.color}">${esc(p.name)} · ${p.score}</div></div>
          </div>`).join('')}
      </div>`);
    await sleep(300);
    sorted.forEach((p, i) => setTimeout(() => {
      Audio_.sfx.submit();
      const b = $('#bar-' + p.pid);
      if (b) b.style.width = Math.max(18, (p.score / max) * 100) + '%';
    }, i * 220));
    await sleep(800);
    if (!final) {
      await hostSay('scores');
      Audio_.stopMusic();
      await waitNext(7);
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
      <button class="big-btn" id="againBtn" style="margin-top:2vmin">${esc(t('play_again'))}</button>`);
    Audio_.sfx.crown(); Audio_.sfx.fanfare();
    hostSay('winner');
    FX.shake(); FX.burst(260, true);
    setTimeout(() => FX.burst(180, true), 900);
    net.setState({ phase: 'winner', name: w.name, emoji: w.emoji });
    await new Promise(res => $('#againBtn').addEventListener('click', res, { once: true }));
  }

  function addScore(pid, pts) {
    const p = players.find(x => x.pid === pid);
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

      const pids = players.map(p => p.pid);
      const inputs = await collectWithTimer(
        { type: 'text', title: t('write_lie'), context: R.fact.replace('___', '____'), maxLen: 60 },
        pids, 60);

      // Build answer set: unique lies + truth
      const seen = new Set([R.truth.toUpperCase()]);
      const lies = [];
      for (const pid of pids) {
        const v = (val(inputs, pid) || '').trim().toUpperCase().slice(0, 60);
        if (v && !seen.has(v)) { seen.add(v); lies.push({ text: v, by: pid }); }
      }
      const answers = shuffle([{ text: R.truth.toUpperCase(), truth: true }, ...lies]);

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

      const votes = await collectWithTimer({
        type: 'choice', title: t('pick_truth'),
        options: answers.map((a, i) => ({ id: i, label: a.text })),
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
          const p = players.find(x => x.pid === pid);
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
        const author = players.find(x => x.pid === a.by);
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
      finders.forEach(pid => addScore(pid, 1000));
      if (finders.length) {
        const names = finders.map(pid => players.find(x => x.pid === pid).name).join(' & ');
        FX.flyPoints(tCard, `+1000 ${names}`);
      }
      await sleep(1600);
      await showScores();
    }
  }

  /* ================================================================
     MODE 2 — WOULD YOU RATHER: PERSONAL  (predict the hot seat)
  ================================================================ */
  async function playWyr() {
    await modeTitleCard('wyr');
    const count = window.HYPOX_STATE?.rounds||3;
    const prompts = await Content.get('wyr', LANG, count);
    const seats = Array.from({length:count},(_,i)=>players[i%players.length]);

    for (let r = 0; r < prompts.length; r++) {
      const R = prompts[r], target = seats[r];
      await FX.wipe();
      setPill(`${t('round')} ${r + 1} ${t('of')} ${prompts.length}`);
      scene(frameWithTimer(`
        <div class="hotseat">${avatarHTML(target)}<div class="pname">${esc(target.name)}</div></div>
        <div class="prompt-card small display">
          <span class="opt-a">${esc(R.a)}</span>
          <span class="vs-mid display">${esc(t('vs'))}</span>
          <span class="opt-b">${esc(R.b)}</span>
        </div>`, t('mode_names')['wyr']));
      say(LANG === 'ar'
        ? `${target.name} على الكرسي الساخن! والباقي — توقعوا اختياره.`
        : `${target.name} is in the hot seat! Everyone else — predict their pick.`);

      const others = players.filter(p => p.pid !== target.pid).map(p => p.pid);
      const opts = [{ id: 'a', label: R.a, color: '#2de1fc' }, { id: 'b', label: R.b, color: '#ff3d8a' }];

      // collect both in parallel online; offline collects target then predictors
      let targetPick, predictions;
      if (net.isOffline) {
        const ti = await collectWithTimer({ type: 'choice', title: t('your_pick'), options: opts }, [target.pid], 30);
        targetPick = val(ti, target.pid);
        predictions = await collectWithTimer({ type: 'choice', title: `${t('predict')} (${target.name})`, options: opts }, others, 30);
      } else {
        const phaseId = 'ph' + (++phaseCounter);
        net.setState({
          phase: 'input-split', phaseId, deadline: Date.now() + 30000,
          specs: {
            [target.pid]: { type: 'choice', title: t('your_pick'), options: opts },
            _default: { type: 'choice', title: `${t('predict')} (${target.name})`, options: opts },
          },
        });
        const row = $('#statusRow');
        row.innerHTML = players.map(p => `<div class="mini" id="mini-${p.pid}">${avatarHTML(p)}<div class="check">✓</div></div>`).join('');
        net.onEachInput(pid => { Audio_.sfx.submit(); $('#mini-' + pid)?.classList.add('done'); });
        const all = await net.collect(phaseId, null, players.map(p => p.pid), 30000);
        net.onEachInput(null);
        net.setState({ phase: 'wait', msg: t('watch_screen') });
        targetPick = val(all, target.pid);
        predictions = {};
        for (const pid of others) if (all[pid]) predictions[pid] = all[pid];
      }

      // reveal
      await FX.wipe();
      if (targetPick === null || targetPick === undefined) targetPick = Math.random() < .5 ? 'a' : 'b';
      const pickedLabel = targetPick === 'a' ? R.a : R.b;
      const matchers = Object.entries(predictions).filter(([, e]) => e.value === targetPick).map(([pid]) => pid);
      scene(`
        <div class="hotseat big">${avatarHTML(target)}<div class="pname">${esc(target.name)}</div></div>
        <div class="prompt-card display reveal-pick ${targetPick === 'a' ? 'pick-a' : 'pick-b'}">${esc(pickedLabel)}</div>
        <div class="match-row" id="matchRow"></div>`);
      Audio_.sfx.drum();
      await sleep(1200);
      Audio_.sfx.reveal(); FX.burst(120);
      const mr = $('#matchRow');
      if (matchers.length) {
        for (const pid of matchers) {
          const p = players.find(x => x.pid === pid);
          addScore(pid, 500);
          mr.insertAdjacentHTML('beforeend', `<div class="player" style="animation-delay:0s">${avatarHTML(p)}<div class="pname">+500</div></div>`);
          Audio_.sfx.correct();
          await sleep(300);
        }
        await say(LANG === 'ar' ? `${matchers.length} ${t('matched')}!` : `${matchers.length} ${t('matched')}!`);
      } else {
        Audio_.sfx.wrong();
        await say(LANG === 'ar' ? `${t('nobody')} توقع صح. ${target.name} لغز.` : `${t('nobody')} saw that coming. ${target.name} is an enigma.`);
      }
      await showScores();
    }
  }

  /* ================================================================
     MODE 3 — THE INTERROGATION  (anonymous answers, public blame)
  ================================================================ */
  async function playInterrogation() {
    await modeTitleCard('interrogation');
    const rounds = await Content.get('interrogation', LANG, 1);
    const R = rounds[0];
    const pids = players.map(p => p.pid);

    await FX.wipe();
    setPill(t('mode_names')['interrogation']);
    scene(frameWithTimer(`<div class="prompt-card display">${esc(R.q)}</div>`, t('mode_names')['interrogation']));
    hostSay('prompt');

    const inputs = await collectWithTimer(
      { type: 'text', title: R.q, sub: LANG === 'ar' ? 'إجابتك مجهولة… مبدئياً' : 'Your answer is anonymous… for now', maxLen: 70 },
      pids, 60);

    const entries = shuffle(pids.filter(pid => val(inputs, pid))
      .map(pid => ({ pid, text: val(inputs, pid) })));

    for (let i = 0; i < entries.length; i++) {
      const E = entries[i];
      const author = players.find(p => p.pid === E.pid);
      await FX.wipe();
      setPill(`${i + 1} / ${entries.length}`);
      scene(frameWithTimer(`
        <div class="eyebrow">${esc(t('who_wrote_it'))}</div>
        <div class="prompt-card display quote-card">“${esc(E.text)}”</div>
        <div class="suspect-row" id="suspectRow">
          ${players.map(p => `<div class="mini suspect" id="sus-${p.pid}">${avatarHTML(p)}<div class="pname">${esc(p.name)}</div><div class="sus-votes" id="susv-${p.pid}"></div></div>`).join('')}
        </div>`, t('who_wrote_it')));
      Audio_.sfx.sting();

      const guessers = pids.filter(pid => pid !== E.pid);
      const votes = await collectWithTimer({
        type: 'choice', title: t('who_wrote_it'), context: `“${E.text}”`,
        options: players.map(p => ({ id: p.pid, label: `${p.emoji} ${p.name}`, color: p.color })),
      }, guessers, 25);

      // show votes landing on suspects
      for (const pid of guessers) {
        const v = val(votes, pid);
        if (!v) continue;
        const voter = players.find(x => x.pid === pid);
        const slot = $('#susv-' + v);
        if (slot) {
          Audio_.sfx.vote();
          slot.insertAdjacentHTML('beforeend', `<div class="voter" style="background:${voter.color}">${voter.emoji}</div>`);
          await sleep(350);
        }
      }
      await sleep(600);

      // reveal author
      Audio_.sfx.drum();
      await say(t('they_wrote_it'), { speed: 45 });
      hideHost();
      const susEl = $('#sus-' + E.pid);
      susEl?.classList.add('revealed');
      Audio_.sfx.reveal(); FX.burst(100); FX.burstAt(susEl, 30);

      let caught = 0;
      for (const pid of guessers) {
        if (val(votes, pid) === E.pid) { addScore(pid, 400); caught++; }
      }
      const hidden = guessers.length - caught;
      if (hidden > 0) addScore(E.pid, hidden * 300);
      if (susEl) FX.flyPoints(susEl, caught ? `${caught} ✓` : `+${hidden * 300} ${author.name}`);
      await sleep(1500);
    }
    await showScores();
  }

  /* ================================================================
     MODE 4 — DISS TRACK WARS  (1v1 roast battles, crowd votes)
  ================================================================ */
  async function playDiss() {
    await modeTitleCard('diss');
    const nBattles = Math.min(window.HYPOX_STATE?.rounds||3, Math.floor(players.length / 2) + 1);
    const prompts = await Content.get('diss', LANG, nBattles);
    const order = shuffle(players);

    for (let b = 0; b < prompts.length; b++) {
      const R = prompts[b];
      const A = order[(b * 2) % players.length];
      let B = order[(b * 2 + 1) % players.length];
      if (B.pid === A.pid) B = order[(b * 2 + 2) % players.length];

      await FX.wipe();
      Audio_.sfx.versus();
      setPill(`${t('round')} ${b + 1} ${t('of')} ${prompts.length}`);
      scene(frameWithTimer(`
        <div class="versus-row">
          <div class="fighter">${avatarHTML(A)}<div class="pname">${esc(A.name)}</div></div>
          <div class="vs-badge display">${esc(t('vs'))}</div>
          <div class="fighter">${avatarHTML(B)}<div class="pname">${esc(B.name)}</div></div>
        </div>
        <div class="prompt-card small display">${esc(R.p)}</div>`, t('write_diss')));
      say(LANG === 'ar' ? 'سطر واحد. بدون رحمة. بدون حقد بعدين.' : 'One line. No mercy. No grudges after.');

      const inputs = await collectWithTimer(
        { type: 'text', title: t('write_diss'), context: R.p, maxLen: 90 },
        [A.pid, B.pid], 60);

      const lineA = val(inputs, A.pid) || t('no_answer');
      const lineB = val(inputs, B.pid) || t('no_answer');

      // crowd votes
      await FX.wipe();
      setPill(t('vote_title'));
      scene(frameWithTimer(`
        <div class="diss-grid">
          <div class="ans-card diss" id="dissA"><div class="ans-face ans-front"><div class="diss-line">“${esc(lineA)}”</div><div class="voter-strip" id="dvA"></div></div></div>
          <div class="ans-card diss" id="dissB"><div class="ans-face ans-front"><div class="diss-line">“${esc(lineB)}”</div><div class="voter-strip" id="dvB"></div></div></div>
        </div>`, t('vote_title')));
      Audio_.sfx.pop();

      const crowd = players.filter(p => p.pid !== A.pid && p.pid !== B.pid).map(p => p.pid);
      const votes = await collectWithTimer({
        type: 'choice', title: t('vote_title'), context: R.p,
        options: [{ id: 'A', label: `“${lineA}”` }, { id: 'B', label: `“${lineB}”` }],
      }, crowd, 25);

      let vA = 0, vB = 0;
      for (const pid of crowd) {
        const v = val(votes, pid);
        const voter = players.find(x => x.pid === pid);
        if (v === 'A') { vA++; $('#dvA')?.insertAdjacentHTML('beforeend', `<div class="voter" style="background:${voter.color}">${voter.emoji}</div>`); }
        else if (v === 'B') { vB++; $('#dvB')?.insertAdjacentHTML('beforeend', `<div class="voter" style="background:${voter.color}">${voter.emoji}</div>`); }
        Audio_.sfx.vote();
        await sleep(350);
      }
      await sleep(500);

      const winner = vA === vB ? null : (vA > vB ? A : B);
      addScore(A.pid, vA * 250); addScore(B.pid, vB * 250);
      if (winner && ((winner === A && vB === 0) || (winner === B && vA === 0)) && crowd.length > 1) {
        addScore(winner.pid, 500); // sweep bonus
      }
      Audio_.sfx.drum(); await sleep(700);
      if (winner) {
        const el = winner === A ? $('#dissA') : $('#dissB');
        el?.classList.add('diss-winner');
        Audio_.sfx.fanfare(); FX.shake(); FX.burst(130); FX.burstAt(el, 36);
        await say(LANG === 'ar' ? `${winner.name} ياخذ الجولة!` : `${winner.name} takes the round!`);
      } else {
        Audio_.sfx.wrong();
        await say(LANG === 'ar' ? 'تعادل! الجمهور جبان.' : 'A tie! The crowd is a coward.');
      }
    }
    await showScores();
  }

  /* ================================================================
     MODE 5 — MAJLIS QUIZ  (speed trivia)
  ================================================================ */
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
    const SPEED_PTS = [1000, 850, 700, 600, 500, 450, 400, 400, 400, 400];

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
        type: 'choice', title: t('quiz_pick'), context: Q.q, seconds: 15,
        options: Q.options.map((o, j) => ({ id: j, label: `${'ABCD'[j]} · ${o}`, color: colors[j] })),
      }, pids, 15);

      // reveal
      Audio_.sfx.drum(); await sleep(900);
      $('#qopt-' + Q.correct)?.classList.add('q-correct');
      Q.options.forEach((_, j) => { if (j !== Q.correct) $('#qopt-' + j)?.classList.add('q-dim'); });
      Audio_.sfx.correct(); FX.burst(80);

      const right = pids.filter(pid => val(answers, pid) === Q.correct)
        .sort((a, b) => answers[a].order - answers[b].order);
      right.forEach((pid, rank) => {
        addScore(pid, net.isOffline ? 700 : (SPEED_PTS[rank] || 400));
      });
      const names = right.map(pid => players.find(p => p.pid === pid).name).join(', ');
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
    const ALLPP = (typeof PINPOINT_CITIES !== 'undefined' ? PINPOINT_CITIES : []).concat(typeof PINPOINT_PLACES !== 'undefined' ? PINPOINT_PLACES : []);
    const pool = ALLPP.slice().sort(() => Math.random() - .5).slice(0, rounds);
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
    await showScores(true);
  }

  /* Wait for Next press, or auto-advance if autoplay is on */
  function waitNext(autoSeconds = 6) {
    return new Promise(res => {
      const stage = document.getElementById('hostStage');
      const btn = document.createElement('button');
      btn.className = 'big-btn';
      btn.style.marginTop = '2vmin';
      const done = () => { window.__hypoxSkip = null; if (timer) clearInterval(timer); res(); };
      let timer = null;
      if (window.HYPOX_STATE?.autoplay) {
        let left = autoSeconds;
        btn.textContent = `${t('next_round')} (${left})`;
        timer = setInterval(() => {
          left--;
          if (left <= 0) { done(); return; }
          btn.textContent = `${t('next_round')} (${left})`;
        }, 1000);
      } else {
        btn.textContent = t('next_round');
      }
      btn.addEventListener('click', done, { once: true });
      stage.appendChild(btn);
      window.__hypoxSkip = done;
    });
  }

  /* ================= EMOJI RIDDLE ================= */
  async function playEmoji() {
    await modeTitleCard('emoji');
    const rounds = window.HYPOX_STATE?.rounds || 5;
    const qs = await Content.get('emoji', LANG, rounds);
    const pids = players.map(p=>p.pid);
    const SP = [1000,850,700,600,500,450,400,400,400,400];
    for (let i = 0; i < qs.length; i++) {
      const Q = qs[i];
      const answer = Q.options ? Q.options[Q.correct] : (Q.answer||'');
      const ansUp = answer.toUpperCase();
      let rev = new Set();
      const lIdxs = answer.split('').map((_,j)=>j).filter(j=>answer[j]!==' ').sort(()=>Math.random()-.5);
      let rI=0;
      const hHTML=r=>answer.split('').map((ch,j)=>{if(ch===' ')return '<span class="hint-space"> </span>';return r.has(j)||r.has('all')?`<span class="hint-letter revealed">${esc(ch)}</span>`:'<span class="hint-letter blank">_</span>';}).join('');
      await FX.wipe(); setPill(`${i+1}/${qs.length}`);
      scene(`<div class="eyebrow">🧩 ${LANG==='ar'?'فك الرموز':'EMOJI RIDDLE'}</div>
        <div style="font-size:clamp(50px,10vw,110px);text-align:center;margin:2vmin 0">${esc(Q.e)}</div>
        <div class="hint-display" id="hD">${hHTML(rev)}</div>
        <div class="timer-bar"><div class="timer-fill" id="tF" style="width:100%"></div></div>
        <div id="statusRow" class="status-row"></div>`);
      pushMirror({headline:Q.e,pill:`${i+1}/${qs.length}`}); Audio_.sfx.sting();
      const t0=Date.now();
      const tI=setInterval(()=>{
        const el=document.getElementById('tF');if(el)el.style.width=Math.max(0,100-(Date.now()-t0)/250)+'%';
        if((Date.now()-t0)>6000*(rI+1)&&rI<Math.floor(lIdxs.length*.6)){rev.add(lIdxs[rI++]);const d=document.getElementById('hD');if(d)d.innerHTML=hHTML(rev);}
      },200);
      const answers=await collectWithTimer({type:'text',title:LANG==='ar'?'اكتب الجواب!':'Type the answer!',context:Q.e,maxLen:60,seconds:25},pids,25);
      clearInterval(tI);
      const right=pids.filter(pid=>{const v=(val(answers,pid)||'').trim().toUpperCase();return v===ansUp||v===ansUp.replace(/\s/g,'');}).sort((a,b)=>answers[a].order-answers[b].order);
      right.forEach((pid,rank)=>addScore(pid,SP[rank]||400));
      Audio_.sfx.reveal(); FX.burst(80);
      scene(`<div class="eyebrow">🧩 ${esc(Q.e)}</div>
        <div class="prompt-card display" style="color:var(--yellow)">${esc(answer)}</div>
        <div class="score-list">${pids.map((pid,idx)=>{const p=players.find(x=>x.pid===pid);const got=right.includes(pid);const pts=got?SP[right.indexOf(pid)]||400:0;return `<div class="score-row" style="animation-delay:${idx*.1}s"><div class="avatar" style="background:${p.color}">${p.emoji}</div><div class="bar-track"><div class="bar-fill" style="width:${got?80:10}%;background:${got?'var(--green)':'rgba(255,255,255,.1)'}">${esc(p.name)} ${got?'✓ +'+pts:'✗ 0'}</div></div></div>`;}).join('')}</div>`);
      pushMirror({headline:`🧩 = ${answer}`});
      await say(right.length?`${right.map(pid=>players.find(p=>p.pid===pid)?.name).join(', ')} ${t('got_it_right')}!`:(LANG==='ar'?`الجواب: ${answer}`:`Answer: ${answer}`));
      hideHost(); await waitNext();
      if(i<qs.length-1) await showScores();
    }
    await showScores(true);
  }

  /* ================= TIME MACHINE ================= */
  async function playYear() {
    await modeTitleCard('year');
    const rounds = window.HYPOX_STATE?.rounds || 5;
    const qs = await Content.get('year', LANG, rounds);
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
        type: 'text', title: LANG==='ar'?'اكتب السنة':'Type the year', context: Q.q, maxLen: 4, numeric: true, seconds: 20,
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
    await showScores(true);
  }


  async function playMostlikely() {
    await modeTitleCard('mostlikely');
    const rounds = window.HYPOX_STATE?.rounds || 5;
    const prompts = await Content.get('mostlikely', LANG, rounds);
    for (let i = 0; i < prompts.length; i++) {
      const Q = prompts[i];
      await FX.wipe();
      setPill(`${t('round')} ${i+1} ${t('of')} ${prompts.length}`);
      scene(`<div class="eyebrow">🏆 ${LANG==='ar'?'الأرجح':'MOST LIKELY TO'}</div><div class="prompt-card display">${esc(Q.q)}</div><div class="pick-sub">${LANG==='ar'?'الكل يصوت — من الأرجح؟':'Everyone votes — who is it?'}</div><div id="statusRow" class="status-row"></div>`);
      pushMirror({ headline: Q.q });
      Audio_.sfx.sting(); hostSay('prompt');
      const pids = players.map(p => p.pid);
      const votes = await collectWithTimer({ type:'choice', title:LANG==='ar'?'من الأرجح؟':'Who is most likely?', context:Q.q, options:players.map(p=>({id:p.pid,label:`${p.emoji} ${p.name}`,color:p.color})), seconds:20 }, pids, 20);
      const tally = {};
      pids.forEach(pid => { const v = val(votes, pid); if (v) tally[v] = (tally[v]||0)+1; });
      const maxV = Math.max(0, ...Object.values(tally));
      const winners = Object.entries(tally).filter(([,c])=>c===maxV).map(([pid])=>pid);
      winners.forEach(pid => addScore(pid, 500));
      Audio_.sfx.reveal(); FX.burst(80);
      scene(`<div class="eyebrow">${esc(Q.q)}</div><div class="score-list">${players.slice().sort((a,b)=>(tally[b.pid]||0)-(tally[a.pid]||0)).map((p,idx)=>`<div class="score-row" style="animation-delay:${idx*.1}s"><div class="medal">${winners.includes(p.pid)?'👑':''}</div><div class="avatar" style="background:${p.color}">${p.emoji}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(10,((tally[p.pid]||0)/pids.length)*100)}%;background:linear-gradient(90deg,var(--pink),var(--purple))">${esc(p.name)} · ${tally[p.pid]||0} ${LANG==='ar'?'أصوات':'votes'}</div></div></div>`).join('')}</div>`);
      const wNames = winners.map(pid=>players.find(p=>p.pid===pid)?.name).join(' & ');
      pushMirror({ headline: `👑 ${wNames}` });
      await say(LANG==='ar'?`${wNames} — الكل يشوف كذا!`:`${wNames} — the crowd has spoken!`);
      hideHost(); await waitNext();
      if (i < prompts.length - 1) await showScores();
    }
    await showScores(true);
  }

  async function playTrueorlie() {
    await modeTitleCard('trueorlie');
    const rounds = window.HYPOX_STATE?.rounds || 5;
    const prompts = await Content.get('trueorlie', LANG, rounds);
    const SPEED_PTS = [1000,850,700,600,500,450,400,400,400,400];
    for (let i = 0; i < prompts.length; i++) {
      const Q = prompts[i];
      await FX.wipe();
      setPill(`${t('round')} ${i+1} ${t('of')} ${prompts.length}`);
      const opts = [{id:'true',label:LANG==='ar'?'✅ صح':'✅ TRUE',color:'#34d399'},{id:'false',label:LANG==='ar'?'❌ كذب':'❌ LIE',color:'#f472b6'}];
      scene(`<div class="eyebrow">✅❌ ${LANG==='ar'?'صح ولا كذب؟':'TRUE OR LIE?'}</div><div class="prompt-card display">${esc(Q.s)}</div><div id="statusRow" class="status-row"></div>`);
      pushMirror({ headline: Q.s });
      Audio_.sfx.sting(); hostSay('prompt');
      const pids = players.map(p => p.pid);
      const answers = await collectWithTimer({ type:'choice', title:LANG==='ar'?'صح ولا كذب؟':'True or Lie?', context:Q.s, options:opts, seconds:15 }, pids, 15);
      const correctId = Q.truth ? 'true' : 'false';
      Audio_.sfx.drum(); await sleep(900);
      const right = pids.filter(pid=>val(answers,pid)===correctId).sort((a,b)=>answers[a].order-answers[b].order);
      right.forEach((pid,rank)=>addScore(pid,SPEED_PTS[rank]||400));
      Audio_.sfx.reveal();
      const resultLabel = Q.truth?(LANG==='ar'?'✅ صح!':'✅ TRUE!'):(LANG==='ar'?'❌ كذب!':'❌ LIE!');
      scene(`<div class="eyebrow">${esc(Q.s)}</div><div class="prompt-card display" style="color:${Q.truth?'var(--green)':'var(--pink)'}">${resultLabel}</div><div class="score-list">${pids.map((pid,idx)=>{const p=players.find(x=>x.pid===pid);const got=val(answers,pid)===correctId;return `<div class="score-row" style="animation-delay:${idx*.1}s"><div class="avatar" style="background:${p.color}">${p.emoji}</div><div class="bar-track"><div class="bar-fill" style="width:${got?80:20}%;background:${got?'var(--green)':'rgba(255,255,255,.1)'}">${esc(p.name)} ${got?'✓ +'+( SPEED_PTS[right.indexOf(pid)]||400):'✗ 0'}</div></div></div>`;}).join('')}</div>`);
      pushMirror({ headline: resultLabel });
      FX.burst(60);
      await say(right.length?`${right.map(pid=>players.find(p=>p.pid===pid)?.name).join(', ')} ${t('got_it_right')}!`:(LANG==='ar'?'ولا واحد عرفها!':'Nobody got it!'));
      hideHost(); await waitNext();
      if (i < prompts.length - 1) await showScores();
    }
    await showScores(true);
  }

  async function playFlaghunt() {
    await modeTitleCard('flaghunt');
    const rounds = window.HYPOX_STATE?.rounds || 5;
    const qs = await Content.get('flaghunt', LANG, rounds);
    const SPEED_PTS = [1000,850,700,600,500,450,400,400,400,400];
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
      right.forEach((pid,rank)=>addScore(pid,SPEED_PTS[rank]||400));
      Audio_.sfx.reveal(); FX.burst(80);
      scene(`<div class="eyebrow">🚩 ${Q.flag} = <span style="color:var(--yellow)">${esc(answer)}</span></div>
        <div class="score-list">${pids.map((pid,idx)=>{const p=players.find(x=>x.pid===pid);const got=right.includes(pid);const pts=got?SPEED_PTS[right.indexOf(pid)]||400:0;return `<div class="score-row" style="animation-delay:${idx*.1}s"><div class="avatar" style="background:${p.color}">${p.emoji}</div><div class="bar-track"><div class="bar-fill" style="width:${got?80:10}%;background:${got?'var(--green)':'rgba(255,255,255,.1)'}">${esc(p.name)} ${got?'✓ +'+pts:'✗ 0'}</div></div></div>`;}).join('')}</div>`);
      pushMirror({ headline: `${Q.flag} = ${answer}` });
      await say(right.length?`${right.map(pid=>players.find(p=>p.pid===pid)?.name).join(', ')} ${t('got_it_right')}!`:(LANG==='ar'?`ولا واحد! هو ${answer}`:`Nobody! It was ${answer}.`));
      hideHost(); await waitNext();
      if(i<qs.length-1) await showScores();
    }
    await showScores(true);
  }

  async function playHigherlow() {
    await modeTitleCard('higherlow');
    const rounds = window.HYPOX_STATE?.rounds || 5;
    const qs = await Content.get('higherlow', LANG, rounds);
    const SPEED_PTS = [1000,850,700,600,500,450,400,400,400,400];
    for (let i = 0; i < qs.length; i++) {
      const Q = qs[i];
      const hint = Math.round(Q.n * (0.6 + Math.random() * 0.6));
      await FX.wipe();
      setPill(`${t('round')} ${i+1} ${t('of')} ${qs.length}`);
      const opts = [{id:'higher',label:LANG==='ar'?'⬆️ أكثر':'⬆️ Higher',color:'#34d399'},{id:'lower',label:LANG==='ar'?'⬇️ أقل':'⬇️ Lower',color:'#f472b6'}];
      scene(`<div class="eyebrow">📊 ${LANG==='ar'?'فوق ولا تحت؟':'HIGHER OR LOWER?'}</div><div class="prompt-card display">${esc(Q.q)}</div><div class="year-reveal" style="font-size:clamp(28px,5vw,52px)">${hint.toLocaleString()} ${esc(Q.unit)}</div><div id="statusRow" class="status-row"></div>`);
      pushMirror({ headline: Q.q });
      Audio_.sfx.sting(); hostSay('prompt');
      const pids = players.map(p=>p.pid);
      const answers = await collectWithTimer({ type:'choice', title:LANG==='ar'?'فوق ولا تحت؟':'Higher or Lower?', context:Q.q, options:opts, seconds:15 }, pids, 15);
      const correctId = Q.n > hint ? 'higher' : 'lower';
      Audio_.sfx.drum(); await sleep(900);
      const right = pids.filter(pid=>val(answers,pid)===correctId).sort((a,b)=>answers[a].order-answers[b].order);
      right.forEach((pid,rank)=>addScore(pid,SPEED_PTS[rank]||400));
      Audio_.sfx.reveal(); FX.burst(60);
      const ansLabel = correctId==='higher'?(LANG==='ar'?`⬆️ فوق! الجواب: ${Q.n.toLocaleString()} ${Q.unit}`:`⬆️ Higher! Answer: ${Q.n.toLocaleString()} ${Q.unit}`):(LANG==='ar'?`⬇️ تحت! الجواب: ${Q.n.toLocaleString()} ${Q.unit}`:`⬇️ Lower! Answer: ${Q.n.toLocaleString()} ${Q.unit}`);
      scene(`<div class="eyebrow">${esc(Q.q)}</div><div class="prompt-card display" style="color:var(--yellow)">${ansLabel}</div><div class="score-list">${pids.map((pid,idx)=>{const p=players.find(x=>x.pid===pid);const got=val(answers,pid)===correctId;return `<div class="score-row" style="animation-delay:${idx*.1}s"><div class="avatar" style="background:${p.color}">${p.emoji}</div><div class="bar-track"><div class="bar-fill" style="width:${got?80:20}%;background:${got?'var(--green)':'rgba(255,255,255,.1)'}">${esc(p.name)} ${got?'✓ +'+( SPEED_PTS[right.indexOf(pid)]||400):'✗ 0'}</div></div></div>`;}).join('')}</div>`);
      pushMirror({ headline: ansLabel });
      await say(right.length?`${right.map(pid=>players.find(p=>p.pid===pid)?.name).join(', ')} ${t('got_it_right')}!`:(LANG==='ar'?'ولا واحد صاح!':'Nobody got it!'));
      hideHost(); await waitNext();
      if (i < qs.length - 1) await showScores();
    }
    await showScores(true);
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
      finders.forEach(pid=>addScore(pid,700));
      if(finders.length===0) addScore(target.pid,500);
      const fNames = finders.map(pid=>players.find(p=>p.pid===pid)?.name).join(', ');
      pushMirror({ headline: LANG==='ar'?`الكذبة: ${stmts[lieIdx].text}`:`The lie: ${stmts[lieIdx].text}` });
      await say(finders.length===0?(LANG==='ar'?`ولا واحد اكتشف! ${target.name} فاز!`:`Nobody caught ${target.name}! They win!`):(LANG==='ar'?`${fNames} اكتشفوا الكذبة!`:`${fNames} found the lie!`));
      hideHost(); await waitNext();
      if (r < seats.length - 1) await showScores();
    }
    await showScores(true);
  }

  async function playEmojiphrase() {
    await modeTitleCard('emojiphrase');
    const rounds = window.HYPOX_STATE?.rounds || 5;
    const qs = await Content.get('emojiphrase', LANG, rounds);
    const SPEED_PTS = [1000,850,700,600,500,450,400,400,400,400];
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
      right.forEach((pid,rank)=>addScore(pid,SPEED_PTS[rank]||400));
      pushMirror({ headline: `${Q.e} = ${opts[correct]}` });
      await say(right.length?`${right.map(pid=>players.find(p=>p.pid===pid)?.name).join(', ')} ${t('got_it_right')}!`:(LANG==='ar'?`الجواب: ${opts[correct]}`:`Answer: ${opts[correct]}`));
      hideHost(); await waitNext();
      if (i < qs.length - 1) await showScores();
    }
    await showScores(true);
  }

  async function playEmojiword() {
    await modeTitleCard('emojiword');
    const rounds = window.HYPOX_STATE?.rounds || 5;
    const qs = await Content.get('emojiword', LANG, rounds);
    const SPEED_PTS = [1000,850,700,600,500,450,400,400,400,400];
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
      right.forEach((pid,rank)=>addScore(pid,SPEED_PTS[rank]||400));
      pushMirror({ headline: `${Q.e} = ${opts[correct]}` });
      await say(right.length?`${right.map(pid=>players.find(p=>p.pid===pid)?.name).join(', ')} ${t('got_it_right')}!`:(LANG==='ar'?`الجواب: ${opts[correct]}`:`Answer: ${opts[correct]}`));
      hideHost(); await waitNext();
      if (i < qs.length - 1) await showScores();
    }
    await showScores(true);
  }

  async function playEmojiplace() {
    await modeTitleCard('emojiplace');
    const rounds = window.HYPOX_STATE?.rounds || 5;
    const qs = await Content.get('emojiplace', LANG, rounds);
    const pids = players.map(p=>p.pid);
    const SP = [1000,850,700,600,500,450,400,400,400,400];
    for (let i = 0; i < qs.length; i++) {
      const Q = qs[i];
      const answer = Q.options ? Q.options[Q.correct] : (Q.answer||'');
      const ansUp = answer.toUpperCase();
      let rev = new Set();
      const lIdxs = answer.split('').map((_,j)=>j).filter(j=>answer[j]!==' ').sort(()=>Math.random()-.5);
      let rI=0;
      const hHTML=r=>answer.split('').map((ch,j)=>{if(ch===' ')return '<span class="hint-space"> </span>';return r.has(j)||r.has('all')?`<span class="hint-letter revealed">${esc(ch)}</span>`:'<span class="hint-letter blank">_</span>';}).join('');
      await FX.wipe(); setPill(`${i+1}/${qs.length}`);
      scene(`<div class="eyebrow">🌍 ${LANG==='ar'?'وين المكان؟':'EMOJI PLACE'}</div>
        <div style="font-size:clamp(50px,10vw,110px);text-align:center;margin:2vmin 0">${esc(Q.e)}</div>
        <div class="hint-display" id="hD">${hHTML(rev)}</div>
        <div class="timer-bar"><div class="timer-fill" id="tF" style="width:100%"></div></div>
        <div id="statusRow" class="status-row"></div>`);
      pushMirror({headline:Q.e}); Audio_.sfx.sting();
      const t0=Date.now();
      const tI=setInterval(()=>{
        const el=document.getElementById('tF');if(el)el.style.width=Math.max(0,100-(Date.now()-t0)/250)+'%';
        if((Date.now()-t0)>6000*(rI+1)&&rI<Math.floor(lIdxs.length*.6)){rev.add(lIdxs[rI++]);const d=document.getElementById('hD');if(d)d.innerHTML=hHTML(rev);}
      },200);
      const answers=await collectWithTimer({type:'text',title:LANG==='ar'?'اكتب المكان!':'Type the place!',context:Q.e,maxLen:50,seconds:25},pids,25);
      clearInterval(tI);
      const right=pids.filter(pid=>{const v=(val(answers,pid)||'').trim().toUpperCase();return v===ansUp||v===ansUp.replace(/\s/g,'');}).sort((a,b)=>answers[a].order-answers[b].order);
      right.forEach((pid,rank)=>addScore(pid,SP[rank]||400));
      Audio_.sfx.reveal(); FX.burst(80);
      scene(`<div class="eyebrow">🌍 ${esc(Q.e)}</div>
        <div class="prompt-card display" style="color:var(--yellow)">${esc(answer)}</div>
        <div class="score-list">${pids.map((pid,idx)=>{const p=players.find(x=>x.pid===pid);const got=right.includes(pid);const pts=got?SP[right.indexOf(pid)]||400:0;return `<div class="score-row" style="animation-delay:${idx*.1}s"><div class="avatar" style="background:${p.color}">${p.emoji}</div><div class="bar-track"><div class="bar-fill" style="width:${got?80:10}%;background:${got?'var(--green)':'rgba(255,255,255,.1)'}">${esc(p.name)} ${got?'✓ +'+pts:'✗ 0'}</div></div></div>`;}).join('')}</div>`);
      pushMirror({headline:`🌍 = ${answer}`});
      await say(right.length?`${right.map(pid=>players.find(p=>p.pid===pid)?.name).join(', ')} ${t('got_it_right')}!`:(LANG==='ar'?`المكان: ${answer}`:`It was ${answer}`));
      hideHost(); await waitNext();
      if(i<qs.length-1) await showScores();
    }
    await showScores(true);
  }


  /* ===== SPY GAME ===== */
  async function playSpy() {
    await modeTitleCard('spy');
    const numSpies = window.HYPOX_STATE?.spyCount || 1;
    const catKey = window.HYPOX_STATE?.spyCategory || 'location';
    const CATS = {
      location:{en:['Coffee shop','Beach','Airport','Hospital','School','Police station','Restaurant','Hotel','Bank','Library','Cinema','Gym','Museum','Train station','Mosque','Football stadium','Wedding hall','Desert camp','Shopping mall','Submarine','Zoo','Space station','Casino','Prison','Cruise ship'],ar:['مقهى','شاطئ','مطار','مستشفى','مدرسة','مركز شرطة','مطعم','فندق','بنك','مكتبة','سينما','صالة رياضية','متحف','محطة قطار','مسجد','ملعب كرة قدم','قاعة أفراح','مخيم صحراوي','مول تجاري','سوق شعبي','حديقة حيوان','غواصة','محطة فضاء','سجن','سفينة سياحية']},
      event:{en:['Birthday party','Wedding','Job interview','First date','Graduation','Funeral','Press conference','Sports final','Music concert','Surprise party','Business meeting','Baby shower','Divorce party','Prom night','Therapy session','Court trial'],ar:['حفلة عيد ميلاد','حفل زفاف','مقابلة عمل','موعد أول','تخرج','جنازة','مؤتمر صحفي','نهائي رياضي','حفل موسيقي','حفلة مفاجأة','اجتماع عمل','بيبي شاور','حفلة طلاق','ليلة السفرة','جلسة علاج نفسي','محاكمة']},
      movie:{en:['The Lion King','Titanic','Avengers','Harry Potter','Shrek','Frozen','The Godfather','Star Wars','Jurassic Park','Toy Story','Interstellar','The Dark Knight','Forrest Gump','The Matrix','Home Alone','Joker'],ar:['الأسد الملك','تيتانيك','أفنجرز','هاري بوتر','شريك','فروزن','العراب','حرب النجوم','حديقة الديناصورات','قصة لعبة','إنترستيلار','فارس الظلام','فورست غامب','ذا ماتريكس','وحيدًا في المنزل','جوكر']},
      food:{en:['Pizza','Sushi','Burger','Shawarma','Pasta','Tacos','Biryani','Hummus','Ramen','Steak','Fried chicken','Cheesecake'],ar:['بيتزا','سوشي','برغر','شاورما','باستا','تاكوس','برياني','حمص','رامن','ستيك','دجاج مقلي','تشيزكيك']},
      sport:{en:['Football','Basketball','Tennis','Swimming','Boxing','Golf','Formula 1','Wrestling','Volleyball','Baseball','Cricket','Table tennis'],ar:['كرة القدم','كرة السلة','تنس','سباحة','ملاكمة','غولف','فورمولا 1','مصارعة','كرة طائرة','بيسبول','كريكيت','تنس طاولة']},
      animal:{en:['Lion','Elephant','Dolphin','Eagle','Gorilla','Penguin','Giraffe','Shark','Crocodile','Panda','Kangaroo','Octopus'],ar:['أسد','فيل','دولفين','نسر','غوريلا','بطريق','زرافة','قرش','تمساح','باندا','كنغر','أخطبوط']},
      celebrity:{en:['Cristiano Ronaldo','Elon Musk','Beyonce','Will Smith','Kim Kardashian','Lionel Messi','Taylor Swift','Jeff Bezos','MrBeast','Bad Bunny'],ar:['كريستيانو رونالدو','إيلون ماسك','بيونسيه','ويل سميث','كيم كارداشيان','ليونيل ميسي','تايلور سويفت','جيف بيزوس','مستر بيست','محمد عبده']},
    };
    const flavor = window.HYPOX_STATE?.flavor || 'global';
    const langKey = flavor==='arab' ? 'ar' : LANG;
    const pool=(CATS[catKey]||CATS.location)[langKey]||(CATS[catKey]||CATS.location).en;
    const word=pool[Math.floor(Math.random()*pool.length)];
    const pids=players.map(p=>p.pid);
    const spyPids=pids.slice().sort(()=>Math.random()-.5).slice(0,numSpies);
    await FX.wipe(); setPill(LANG==='ar'?'الجاسوس':'SPY');
    scene(`<div class="eyebrow">🕵️ ${LANG==='ar'?'لعبة الجاسوس':'SPY GAME'}</div>
      <div class="prompt-card display">${LANG==='ar'?'الكل شاف دوره على جواله':'Everyone check your role on your phone'}</div>
      <div class="pick-sub">${LANG==='ar'?numSpies+' جاسوس بينكم!':numSpies+' spy among you!'}</div>`);
    if(net.isOffline){
      // One device: show each player their role privately one at a time
      for(const pid of pids){
        const p=players.find(x=>x.pid===pid);
        const isSpy=spyPids.includes(pid);
        await FX.wipe();
        scene(`<div class="eyebrow">🕵️ ${esc(p.emoji+' '+p.name)}</div>
          <div class="prompt-card display" style="color:${isSpy?'var(--pink)':'var(--green)'}">${isSpy?(LANG==='ar'?'🕵️ أنت الجاسوس!':'🕵️ YOU ARE THE SPY!'):(LANG==='ar'?'🤵 أنت عميل':'🤵 YOU ARE AN AGENT')}</div>
          <div class="pick-sub">${isSpy?(LANG==='ar'?'اكتشف الكلمة السرية من الحديث':'Find the secret word from the discussion'):(LANG==='ar'?'الكلمة السرية: <strong style="color:var(--yellow)">'+word+'</strong>':'Secret word: <strong style="color:var(--yellow)">'+word+'</strong>')}</div>
          <div class="pick-sub" style="opacity:.5;font-size:13px">${LANG==='ar'?'اضغط التالي لما تحفظ دورك':'Press Next when you have memorised your role'}</div>`);
        await waitNext();
        await FX.wipe();
        scene(`<div class="prompt-card display">${LANG==='ar'?'✅ جاهز — مرّر الجهاز للشخص التالي':'✅ Done — pass the device to the next person'}</div>`);
        await sleep(1500);
      }
    } else {
      net.setState({phase:'spy-roles',roles:Object.fromEntries(pids.map(pid=>[pid,spyPids.includes(pid)?{role:'spy',word:null}:{role:'agent',word}])),word,numSpies});
      Audio_.sfx.sting(); await sleep(7000);
    }
    const DISC=Math.max(90,players.length*20);
    await FX.wipe();
    scene(`<div class="eyebrow">🕵️ ${LANG==='ar'?'وقت النقاش':'DISCUSSION TIME'}</div>
      <div class="prompt-card display">${LANG==='ar'?'ناقشوا — من الجاسوس؟':'Discuss — who is the spy?'}</div>
      <div class="year-reveal" id="discT">${DISC}</div>
      <div class="pick-sub" style="color:var(--yellow)">${LANG==='ar'?'الكلمة السرية: '+word+' (لا تقولوها!)':'Secret word: '+word+' (dont say it!)'}</div>`);
    pushMirror({headline:LANG==='ar'?'ناقشوا!':'Discuss!',sub:LANG==='ar'?'من هو الجاسوس؟':'Who is the spy?'});
    let disc=DISC;
    const dI=setInterval(()=>{disc--;const el=document.getElementById('discT');if(el)el.textContent=disc;if(disc<=0)clearInterval(dI);},1000);
    await sleep(DISC*1000); clearInterval(dI);
    await FX.wipe();
    scene(`<div class="eyebrow">🗳️ ${LANG==='ar'?'صوّتوا':'VOTE'}</div>
      <div class="prompt-card display">${LANG==='ar'?'من هو الجاسوس؟':'Who is the spy?'}</div>
      <div id="statusRow" class="status-row"></div>`);
    const votes=await collectWithTimer({type:'choice',title:LANG==='ar'?'من هو الجاسوس؟':'Who is the spy?',options:players.map(p=>({id:p.pid,label:p.emoji+' '+p.name,color:p.color})),seconds:net.isOffline?999:20},pids,net.isOffline?999:20);
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
        pids.filter(pid=>!spyPids.includes(pid)).forEach(pid=>addScore(pid,700));
        scene(`<div class="crown">🎉</div><div class="prompt-card display" style="color:var(--green)">${LANG==='ar'?'العملاء فازوا! الجاسوس ما عرف!':'Agents win! Spy failed!'}</div><div class="pick-sub">${LANG==='ar'?'الكلمة: '+word:'Word: '+word}</div>`);
      }
    } else {
      spyPids.forEach(pid=>addScore(pid,1000));
      pids.filter(pid=>!spyPids.includes(pid)).forEach(pid=>addScore(pid,200));
      const spyNames=spyPids.map(pid=>players.find(p=>p.pid===pid)?.name).join(' & ');
      Audio_.sfx.buzzer();
      scene(`<div class="crown">🕵️</div><div class="prompt-card display" style="color:var(--pink)">${LANG==='ar'?'الجاسوس فاز! كان '+spyNames+'!':'Spy wins! It was '+spyNames+'!'}</div><div class="pick-sub">${LANG==='ar'?'الكلمة: '+word:'Word: '+word}</div>`);
    }
    hideHost(); await waitNext();
    await showScores(true);
  }

  const MODES = { bluff: playBluff, wyr: playWyr, interrogation: playInterrogation, diss: playDiss, quiz: playQuiz, trivia: playQuiz, pinpoint: playPinpoint, emoji: playEmoji, year: playYear, mostlikely: playMostlikely, trueorlie: playTrueorlie, flaghunt: playFlaghunt, higherlow: playHigherlow, '2t1l': play2t1l, emojiplace: playEmojiplace, spy: playSpy };

  async function run(netInstance, playerList, mode) {
    net = netInstance;
    players = playerList;
    pickHost();
    $('#skipBtn')?.classList.remove('hidden');
    await MODES[mode]();
    await winnerScene();
    $('#skipBtn')?.classList.add('hidden');
  }

  return { run, say, hideHost, avatarHTML, scene, setPill };
})();
