/* HYPOX — host engine: the main-screen state machine + all game modes.
   Everything original: format is the classic party-game loop
   (prompt → submit → vote → reveal → score), content & art are ours. */

const Host = (() => {
  let net = null, players = [], phaseCounter = 0, skipResolve = null;

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
    if (net.isOffline) {
      $('#ringTimer')?.classList.add('hidden');
    } else {
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
    scene(`
      <div class="mode-card">
        <div class="mode-title display">${esc(t('mode_names')[mode])}</div>
        <div class="mode-tag">${esc(t('mode_taglines')[mode])}</div>
        <div class="mode-rules">${esc(t('mode_rules')[mode])}</div>
        <button class="big-btn" id="startModeBtn" style="margin-top:2vmin">START ▶</button>
      </div>`);
    setPill(t('mode_names')[mode]);
    await new Promise(res => {
      const btn = document.getElementById('startModeBtn');
      let timer = null;
      const onStart = () => { window.__hypoxSkip = null; if (timer) clearInterval(timer); res(); };
      if (btn) {
        btn.addEventListener('click', onStart, { once: true });
        if (window.HYPOX_STATE?.autoplay) {
          let left = 8;
          btn.textContent = `START ▶ (${left})`;
          timer = setInterval(() => {
            left--;
            if (left <= 0) { onStart(); return; }
            btn.textContent = `START ▶ (${left})`;
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
      await say(tPick('banter_scores'));
      Audio_.stopMusic();
      await waitNext(7);
    }
  }

  async function winnerScene() {
    await FX.wipe();
    hideHost();
    const sorted = players.slice().sort((a, b) => b.score - a.score);
    const w = sorted[0];
    setPill(t('final_results'));
    scene(`
      <div class="crown">👑</div>
      <div class="winner-name display">${w.emoji} ${esc(w.name)}</div>
      <div class="tagline">${esc(t('winner'))}</div>
      <button class="big-btn" id="againBtn" style="margin-top:2vmin">${esc(t('play_again'))}</button>`);
    Audio_.sfx.crown(); Audio_.sfx.fanfare();
    FX.shake();
    FX.burst(260, true);
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
    const numRounds = Math.min(window.HYPOX_STATE?.rounds||3, 2);
    const rounds = await Content.get('bluff', LANG, numRounds);

    for (let r = 0; r < rounds.length; r++) {
      const R = rounds[r];
      await FX.wipe();
      setPill(`${t('round')} ${r + 1} ${t('of')} ${rounds.length}`);
      scene(frameWithTimer(
        `<div class="prompt-card display">${esc(R.fact).replace('___', '<span class="blank">&nbsp;???&nbsp;</span>')}</div>`,
        t('write_lie')));
      say(tPick('banter_prompt'));

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
      say(tPick('banter_vote'));

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
    const count = Math.min(players.length, window.HYPOX_STATE?.rounds||3);
    const prompts = await Content.get('wyr', LANG, count);
    const seats = shuffle(players).slice(0, count);

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
    say(tPick('banter_prompt'));

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
    const pool = (typeof PINPOINT_CITIES !== 'undefined' ? PINPOINT_CITIES : []).slice().sort(() => Math.random() - .5).slice(0, rounds);
    for (let r = 0; r < pool.length; r++) {
      const city = pool[r];
      const cityName = LANG === 'ar' ? city.ar : city.en;
      setPill(`${t('round')} ${r+1} ${t('of')} ${pool.length}`);
      scene(`
        <div class="eyebrow">📍 ${esc(t('mode_names').pinpoint || 'PIN POINT')}</div>
        <div class="prompt-card">${esc(cityName)}</div>
        <div class="pick-sub">${LANG==='ar'?'وين هالمدينة؟ حط دبوسك على الخريطة!':'Where is this city? Drop your pin on the map!'}</div>`);
      pushMirror({ headline: cityName, pill: `${r+1}/${pool.length}` });
      Audio_.sfx.sting();

      const answers = await collectWithTimer({
        type: 'map', title: cityName,
        sub: LANG==='ar'?'حط الدبوس أقرب ما تقدر':'Drop your pin as close as you can',
        seconds: 20,
      }, players.map(p => p.pid), 20);

      // Score by distance
      const results = players.map(p => {
        let guess = null;
        try {
          const raw = answers[p.pid] ? answers[p.pid].value : null;
          guess = raw ? JSON.parse(raw) : null;
        } catch(e) {}
        const km = guess ? haversine(guess, city) : 99999;
        return { p, km, guessed: !!guess };
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

  const MODES = { bluff: playBluff, wyr: playWyr, interrogation: playInterrogation, diss: playDiss, quiz: playQuiz, trivia: playQuiz, pinpoint: playPinpoint };

  async function run(netInstance, playerList, mode) {
    net = netInstance;
    players = playerList;
    $('#skipBtn')?.classList.remove('hidden');
    await MODES[mode]();
    await winnerScene();
    $('#skipBtn')?.classList.add('hidden');
  }

  return { run, say, hideHost, avatarHTML, scene, setPill };
})();
