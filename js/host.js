/* HYPOX — host engine: the main-screen state machine + all game modes.
   Everything original: format is the classic party-game loop
   (prompt → submit → vote → reveal → score), content & art are ours. */

const Host = (() => {
  let net = null, players = [], phaseCounter = Date.now(), skipResolve = null;
  // Tracks the pids the currently in-flight collectWithTimer() call is
  // waiting on, so the offline-disconnect handler can tell whether the
  // player who just left is actually relevant to THIS collection before
  // force-finishing it (see watchAndRemoveOffline's callback below).
  let activeCollectionPids = null;
  // Host (Laith) should only speak before a mode's rounds begin and after
  // its final results — never mid-round. Rather than edit the ~25 scattered
  // say()/hostSay() call sites across every game mode individually (risky,
  // inconsistent call signatures), say() itself checks this single flag.
  // Toggled off right as rounds begin (end of modeTitleCard) and back on
  // right at final results (showScores(true)).
  let hostSpeechEnabled = true;
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

  // Phones-only modes with bespoke collection loops used to hand-build a
  // separate host UI. Route those through the player renderer too, while
  // keeping the wrapper local to the host and preserving each mode's spec.
  function renderHostPlayerCard(spec,onSubmit){
    const panel=document.createElement('div');
    panel.className='phones-host-inline-choice-panel host-only-ui';
    document.body.classList.add('phones-host-inline-answering');
    stage()?.appendChild(panel);
    Controller.render(panel,{...spec,controlsOnly:false},async value=>{
      const result=await onSubmit(value);
      if(result?.accepted===false)return result;
      panel.remove();
      document.body.classList.remove('phones-host-inline-answering');
      return result;
    });
    return panel;
  }

  /* Phones Only gets the same presentation as the host. A debounced DOM
     snapshot is published independently of input state, so timers, revealed
     hints, avatars and score animations stay live without interrupting forms. */
  let sharedObserver = null, sharedTimer = null, lastSharedHTML = '', sharedSceneId = 0;
  function sharedHTML(stripAnimations) {
    const source = stage();
    if (!source) return '';
    const clone = source.cloneNode(true);
    // Local host controls must never be serialized. Besides preventing an
    // accidental duplicate on player phones, removing them before the tree
    // walk avoids cloning and diffing a second set of animated answer buttons
    // on every input/timer update.
    clone.querySelectorAll('script,style,iframe,object,embed,.leaflet-pane,.leaflet-control-container,.host-only-ui').forEach(el => el.remove());
    clone.querySelectorAll('*').forEach(el => {
      el.removeAttribute('id');
      [...el.attributes].forEach(a => {
        if (/^on/i.test(a.name) || /javascript:/i.test(a.value)) el.removeAttribute(a.name);
      });
      if (/^(BUTTON|INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
        el.setAttribute('disabled', '');
        el.setAttribute('tabindex', '-1');
      }
      // Strip CSS animations only on incremental republishes of the SAME scene
      // (e.g. one per answer submitted, timer ticks). The scene-establishing
      // publish keeps its entrance animation so players still see cards deal
      // in etc — it's the repeat republishes of an already-seen scene that
      // caused the blink, since a full innerHTML replace restarts animations.
      if (stripAnimations) {
        if (el.style && el.style.animation) el.style.animation = 'none';
        const styleAttr = el.getAttribute('style');
        if (styleAttr && /animation\s*:/i.test(styleAttr)) {
          el.setAttribute('style', styleAttr.replace(/animation\s*:[^;]+;?/gi, 'animation:none;'));
        }
      }
    });
    return clone.innerHTML;
  }
  function publishSharedScreen(force = false, opts = {}) {
    if (!net?.phonesOnly || !net.setSharedScreen) return;
    clearTimeout(sharedTimer);
    const strip = opts.strip !== undefined ? opts.strip : !force;
    sharedTimer = setTimeout(() => {
      const html = sharedHTML(strip);
      if (!force && html === lastSharedHTML) return;
      lastSharedHTML = html;
      net.setSharedScreen({ html, pill: $('#roundPill')?.textContent || '', sceneId: sharedSceneId });
    }, force ? 0 : 400);
  }
  function startSharedScreen() {
    if (!net?.phonesOnly || sharedObserver) return;
    sharedObserver = new MutationObserver((records) => {
      // Ignore mutations confined entirely to .host-only-ui subtrees (e.g. the
      // waitNext countdown button's text ticking every second) — those are
      // already hidden from players via CSS, so republishing the whole clone
      // for them just causes a full DOM replace ~once/sec with nothing new
      // for the player to actually see. That repeated replace is what reads
      // as "blinking" throughout every reveal/scores countdown.
      const meaningful = records.some(r => {
        const n = r.target.nodeType === 1 ? r.target : r.target.parentElement;
        return !n?.closest?.('.host-only-ui');
      });
      if (meaningful) publishSharedScreen();
    });
    sharedObserver.observe(stage(), { childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['class','style'] });
    publishSharedScreen(true);
  }
  function stopSharedScreen() {
    sharedObserver?.disconnect(); sharedObserver = null;
    clearTimeout(sharedTimer); sharedTimer = null; lastSharedHTML = '';
  }
  // Pause the DOM-clone broadcast for a known animation window (e.g. the
  // score bar-fill + count-up in showScores()), then publish once cleanly
  // once everything has settled. Without this, the observer's debounce can
  // fire WHILE bars/counters are still mid-animation (staggered per player),
  // shipping players a half-finished snapshot that looks like a blink/jump
  // compared to the host's own live CSS transition.
  function suspendSharedScreen(ms) {
    if (!net?.phonesOnly) return;
    sharedObserver?.disconnect(); sharedObserver = null;
    clearTimeout(sharedTimer); sharedTimer = null;
    setTimeout(() => {
      if (!net?.phonesOnly) return;
      // Settled-state publish: force through immediately (no 400ms debounce)
      // but WITH animations stripped, so it doesn't replay the entrance
      // animation a second time on top of the one scene() already sent.
      publishSharedScreen(true, { strip: true });
      if (!sharedObserver) {
        sharedObserver = new MutationObserver((records) => {
          const meaningful = records.some(r => {
            const n = r.target.nodeType === 1 ? r.target : r.target.parentElement;
            return !n?.closest?.('.host-only-ui');
          });
          if (meaningful) publishSharedScreen();
        });
        sharedObserver.observe(stage(), { childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['class','style'] });
      }
    }, ms);
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
  let fxSeq = 0;
  // Confetti (canvas) and flyPoints (a transient div appended to
  // document.body, auto-removed after 1.3s) are both invisible to the
  // DOM-clone mirror players see in phones-only mode -- canvas pixels
  // and body-level elements outside #hostStage were never part of what
  // gets cloned. This broadcasts a small instruction instead, so each
  // player's own device replays the same effect locally, anchored to
  // their own copy of the card.
  function broadcastFx(fx) {
    pushMirror({ fx: { ...fx, seq: ++fxSeq } });
  }

  function scene(html) {
    const s = stage();
    // Every new scene clears the tracker-hiding state. collectWithTimer()
    // always runs AFTER the scene that shows the question, so it re-arms
    // per round; reveal/score scenes simply stay unaffected. This also
    // covers the timeout path where the host never submitted an answer.
    document.body.classList.remove('hide-tracker');
    document.body.classList.remove('phones-host-inline-answering');
    sharedSceneId++;
    s.innerHTML = html;
    s.classList.remove('scene-in'); void s.offsetWidth; s.classList.add('scene-in');
    publishSharedScreen(true);
    window.__hypoxResetScroll?.();
  }

  function setPill(text) { $('#roundPill').textContent = text; pushMirror({ pill: text }); publishSharedScreen(); }

  let _sayToken = 0;
  async function say(text, { speed = 24, autoHide = 4000 } = {}) {
    if (!hostSpeechEnabled) return; // muted mid-round — see flag comment above
    const myToken = ++_sayToken; // invalidates any in-flight say() call below
    const host = $('#host'), out = $('#speechText');
    pushMirror({ speech: text, hostVisible: true, hostName: currentHost ? `${currentHost.nameEn} · ${currentHost.nameAr}` : '', hostColor: currentHost?.color || 'host-purple' });
    host.classList.add('show', 'talking'); out.textContent = '';
    for (const ch of text) {
      if (myToken !== _sayToken) return; // a newer say() call has taken over — stop writing
      out.textContent += ch;
      if (ch !== ' ' && Math.random() > .55) Audio_.sfx.blip();
      await sleep(speed);
    }
    if (myToken !== _sayToken) return;
    host.classList.remove('talking');
    await sleep(600);
    if (myToken !== _sayToken) return;
    // Auto-dismiss after display time
    setTimeout(() => {
      if (myToken !== _sayToken) return;
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
  // v136 — spec.forceTimer bypasses the autoplay gate below. Without it,
  // inputDeadline returns null and inputTimeout returns ~25 hours whenever
  // autoplay is off — meaning HarfHunt's 15s turn cutoff (and its visible
  // countdown, which depends on a real deadline existing) silently did
  // nothing in manual/non-autoplay play. Ali wants the 15s cutoff to always
  // apply, so HarfHunt opts out of the gate; every other mode's existing
  // autoplay-dependent behavior is untouched.
  const inputDeadline = (seconds, force) => (force || autoplayEnabled()) ? Date.now() + seconds * 1000 : null;
  const inputTimeout = (seconds, force) => (force || autoplayEnabled()) ? seconds * 1000 : 9e7;

  /* ---------- input collection with big timer ---------- */
  async function collectWithTimer(spec, pids, seconds, statusLabelFn) {
    const phaseId = 'ph' + (++phaseCounter);
    const deadline = inputDeadline(seconds, spec.forceTimer === true);
    // v135 — attach deadline onto spec itself (not just as a sibling field
    // on state). fullscreenInput panels (HarfHunt's turn screen, etc.) take
    // over the WHOLE phone screen and never see the shared stage's own ring
    // timer — the v134 fix drove that ring, but it's invisible whenever a
    // fullscreen panel covers it. spec is the exact object that reaches
    // Controller.render on the phone (and net.collect's promptLocal call
    // for the host's own device), so this is the one place a countdown
    // built into the panel itself can read a deadline from.
    spec.deadline = deadline;

    pushMirror({ headline: spec.context || spec.title || '', sub: spec.title || '' });
    net.setState({ phase: 'input', phaseId, spec, targets: pids, deadline, mirror: { ...mirror } });

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
              const fakesEn = ['Maybe','Idk','Could be','Probably','Nope','Sure','Hmm','Nah','Guess so','Doubt it','Yep','Totally','Unlikely','No clue','Perhaps','Definitely','Not sure','Kinda','Obviously','Hardly','Somewhat','I think so','Not really','Absolutely','Barely'];
              const fakesAr = ['ربما','لا أعرف','يمكن','أكيد','ممكن','شايف','معقول','لا','أظن','مو متأكد','فعلاً','مستبعد','ولا فكرة','بصراحة','أكيد لأ','شكلها','غالباً','بجد؟','طبعاً','بعيد'];
              const fakes = LANG==='ar' ? fakesAr : fakesEn;
              // Avoid repeating a word another bot (or real player) already
              // submitted this phase -- bots write directly to Firebase
              // (see below), skipping the enforceUnique claim system real
              // players use, so this is their own lightweight collision check.
              let takenNorm = new Set();
              try {
                const snap = await net.room(`inputs/${phaseId}`).get();
                const existing = snap.val() || {};
                takenNorm = new Set(Object.values(existing).map(e => String(e.v||'').trim().toUpperCase()));
              } catch (e) {}
              const available = fakes.filter(w => !takenNorm.has(w.trim().toUpperCase()));
              const pool = available.length ? available : fakes;
              botVal = pool[Math.floor(Math.random() * pool.length)];
            } else if (spec.type === 'number') {
              botVal = String(Math.floor(Math.random() * 9000) + 1000);
            } else if (spec.type === 'harfturn') {
              // Bot turn: grab any available letter and a short filler word —
              // it only needs to survive validation often enough not to stall
              // testing; real polish isn't the point for a bot player.
              const opts = Array.isArray(spec.letters) ? spec.letters : [];
              const L = opts.length ? opts[Math.floor(Math.random() * opts.length)] : 'A';
              const fillers = LANG === 'ar'
                ? { ا:'اكل', ب:'بيت', ت:'تفاح', ج:'جبل', د:'دجاج', ر:'رز', ز:'زيت', س:'سيارة', ش:'شمس', ص:'صابون', ط:'طائرة', ع:'عصير', غ:'غيمة', ف:'فيل', ق:'قطة', ك:'كتاب', ل:'ليمون', م:'ماء', ن:'نجمة', ه:'هاتف', و:'وردة', ي:'يد' }
                : { A:'Apple', B:'Banana', C:'Chair', D:'Dog', E:'Elephant', F:'Fork', G:'Grape', H:'Hat', I:'Igloo', J:'Jacket', K:'Kite', L:'Lamp', M:'Mango', N:'Nest', O:'Onion', P:'Pizza', R:'Rabbit', S:'Sun', T:'Table', U:'Umbrella', V:'Van', W:'Water', Y:'Yogurt' };
              botVal = JSON.stringify({ letter: L, answer: fillers[L] || (LANG==='ar'?'شي':'Thing') });
            } else if (spec.type === 'harfreview') {
              botVal = JSON.stringify([]); // bots never initiate a challenge
            } else if (spec.type === 'harfvote') {
              botVal = Math.random() < 0.8 ? 'accept' : 'reject';
            } else if (spec.type === 'harfchallenge') {
              // v133 — was falling into the generic `else { botVal = 'bot' }`
              // fallback further below, which every bot fired within
              // ~1.5-4s of the window opening. Combined with onEachInput
              // force-finishing on ANY submitted value (not just an actual
              // challenge — also fixed this version), a bot's garbage 'bot'
              // value was silently ending the challenge window almost
              // instantly — exactly Ali's "milliseconds, shifts directly
              // from page to page" report. Bots now rarely challenge (10%)
              // so the window plays out normally most of the time, and when
              // they don't, they submit nothing at all rather than a
              // throwaway value.
              if (Math.random() < 0.10) botVal = 'challenge';
              else return; // no submission — let the real window run its course
            } else if (spec.type === 'multitext') {
              // v104 — multitext was added in v102 but never taught to the
              // bots, so bot players submitted nothing and every statement
              // fell back to the '...' placeholder. Must be a JSON array of
              // one string per field, matching what the controller sends.
              const nF = Array.isArray(spec.fields) ? spec.fields.length : 3;
              const botLines = LANG==='ar'
                ? ['أكلت شي غريب','سافرت لبلد بعيد','قابلت مشهور','خسرت جوالي','نمت في المطار','تعلمت لغة']
                : ['I ate something weird','I travelled somewhere far','I met someone famous','I lost my phone','I slept at an airport','I learned a language'];
              const picked = botLines.slice().sort(() => Math.random() - 0.5).slice(0, nF);
              while (picked.length < nF) picked.push(botLines[Math.floor(Math.random()*botLines.length)]);
              botVal = JSON.stringify(picked);
            } else {
              botVal = 'bot';
            }
            await net.room(`inputs/${phaseId}/${botPid}`).set({ v: botVal, t: Date.now() });
          } catch(e) {}
        }, delay);
      });
    }
    // Hide the tracker on THIS (host) device until the host has submitted
    // their own answer. Previously the row was populated the instant
    // collection began, so the host could see who had/hadn't answered while
    // still typing their own guess. Armed only when the host is actually a
    // participant — if they're just watching a hot-seat round, the tracker
    // should show immediately as before. Uses a body class (not inline
    // styles) so the DOM-clone broadcast can't leak host state to players.
    const _hostIsPlaying = net.hostSelfPid && pids.includes(net.hostSelfPid);
    if (_hostIsPlaying) document.body.classList.add('hide-tracker');
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
      // Host just answered — reveal the tracker from here on.
      if (net.hostSelfPid && pid === net.hostSelfPid) document.body.classList.remove('hide-tracker');
    });

    // countdown (online only — offline is turn-based, no global clock)
    let timerInt = null;
    const CIRC = 276.5;
    // v134 — was: unconditionally hide #ringTimer for every mode, and the
    // code that would have driven it was dead (`if (false && ...)`), so it
    // never ran for ANYONE. The comment above it explains why other modes
    // (quiz/trivia) deliberately dropped their ring — speed scoring already
    // conveys urgency there. But HarfHunt shares this same function and has
    // its OWN #ringTimer in harfTurnScene, and Ali explicitly wants a real,
    // visible 15s countdown per turn — the auto-fail-on-timeout behavior
    // below was already correct, only the on-screen display was missing.
    // Only hide/skip the ring for modes that made the deliberate choice to
    // drop it; HarfHunt keeps and drives its own.
    const showRing = spec.type === 'harfturn';
    if (!showRing) $('#ringTimer')?.classList.add('hidden');
    if (showRing) {
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
    activeCollectionPids = pids;
    let inputs;
    try {
      inputs = await net.collect(phaseId, spec, pids, net.isOffline ? 9e7 : inputTimeout(seconds, spec.forceTimer === true));
    } finally {
      activeCollectionPids = null;
    }
    if (timerInt) clearInterval(timerInt);
    try { Audio_.stopMusic(); } catch(e) {}
    net.setState({ phase: 'wait', msg: LANG==='ar'?'👆 تابع الشاشة':'👆 Watch the screen', mirror: { ...mirror } });
    net.onEachInput(null);
    if (Object.keys(inputs).length === pids.length) Audio_.sfx.sting();
    else Audio_.sfx.buzzer();
    return inputs;
  }

  /* ---------- shared frames ---------- */
  function frameWithTimer(innerHTML, eyebrow, eyebrowClass) {
    return `
      <div class="eyebrow${eyebrowClass ? ' ' + eyebrowClass : ''}">${esc(eyebrow || '')}</div>
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
      hostSpeechEnabled = false;
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
    hostSpeechEnabled = false; // rounds begin now — no more mid-game speech until final results
    // Force-hide immediately: the pre-round hostSay('gamestart') call above
    // has its own independent 4s auto-hide timeout running. If START is
    // tapped before that timer finishes, the flag only blocks *new* speech —
    // the still-running bubble stays visible into round 1 until its own
    // timer fires. hideHost() clears it the instant rounds begin instead.
    hideHost();
  }

  async function showScores(final = false) {
    if (final) hostSpeechEnabled = true; // final results — speech allowed again
    await FX.wipe();
    setPill(final ? t('final_results') : t('scores'));
    const sorted = players.slice().sort((a, b) => b.score - a.score);
    const max = Math.max(...sorted.map(p => p.score), 1);
    // In phones-only, phones see the shared stage (bar chart) directly — no need to mirror scores list
    if (!net?.phonesOnly) {
      pushMirror({
        pill: final ? t('final_results') : t('scores'),
        headline: final ? '🏆 ' + (t('final_results')||'Final Results') : '📊 ' + (t('scores')||'Scores'),
        scores: sorted.map((p,i) => ({ medal: ['🥇','🥈','🥉'][i]||'', name: p.name, score: p.score })),
      });
    } else {
      pushMirror({ pill: final ? t('final_results') : t('scores') });
    }
    scene(`
      <div class="lobby-title display">${final ? esc(t('final_results')) : esc(t('scores'))}</div>
      <div class="score-list">
        ${sorted.map((p, i) => `
          <div class="score-row" style="animation-delay:${i * .12}s">
            <div class="medal">${['🥇','🥈','🥉'][i] || ''}</div>
            ${avatarHTML(p)}
            <div class="bar-track${p.score===0?' zero-track':''}">
              <div class="bar-fill" id="bar-${p.pid}" style="background:${p.color};width:0"><span class="bar-name">${p.score===0?'':esc(p.name)}</span><span class="bar-pts" id="pts-${p.pid}">${p.score===0?'':'0'}</span></div>
              ${p.score===0?`<div class="bar-zero"><span>${esc(p.name)}</span><span>0</span></div>`:''}
            </div>
          </div>`).join('')}
      </div>`);
    // Pause the DOM-clone broadcast for the full animation window (staggered
    // start + count-up duration + buffer), then it auto-resumes and publishes
    // the settled end-state once — see suspendSharedScreen().
    suspendSharedScreen(300 + Math.max(0, sorted.length - 1) * 80 + 900 + 250);
    await sleep(300);
    sorted.forEach((p, i) => setTimeout(() => {
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
        // v93 — leave this empty: zero-score rows render their name and 0
        // via the separate .bar-zero overlay, so writing '0' here just
        // double-rendered it inside the (meant-to-be-invisible) fill.
        ptsEl.textContent = '';
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
      <div class="winner-wrap">
        <div class="crown">👑</div>
        <div class="winner-name display">${w.emoji} ${esc(w.name)}</div>
        <div class="tagline">${esc(t('winner'))}</div>
        <div class="final-lb">${sorted.map((p,i)=>`<div class="final-lb-row"><span class="final-medal">${['🥇','🥈','🥉'][i]||((i+1)+'.')}</span>${avatarHTML(p)}<span class="final-name">${esc(p.name)}</span><span class="final-pts">${p.score}</span></div>`).join('')}</div>
        <div style="display:flex;flex-direction:column;gap:12px;margin-top:2vmin;align-items:center;width:100%">
          <button class="big-btn" id="againBtn" style="max-width:340px;width:100%">🔄 ${LANG==='ar'?'العب مرة ثانية':'Play Again'}</button>
          <button class="big-btn ghost" id="changeGameBtn" style="max-width:340px;width:100%">🎮 ${LANG==='ar'?'العب لعبة ثانية':'Play Another Game'}</button>
        </div>
      </div>`);
    net.setState({ phase: 'winner', name: w.name, emoji: w.emoji });

    // Wire the result actions as soon as the buttons are visible. Winner
    // banter and effects can take a moment, and taps during that animation
    // must not be lost.
    const resultAction = new Promise(resolve => {
      const againBtn = document.getElementById('againBtn');
      const changeGameBtn = document.getElementById('changeGameBtn');
      let settled = false;
      const choose = action => {
        if (settled) return;
        settled = true;
        againBtn?.removeEventListener('click', playAgain);
        changeGameBtn?.removeEventListener('click', changeGame);
        [againBtn, changeGameBtn].forEach(btn => {
          if (!btn) return;
          btn.disabled = true;
          btn.setAttribute('aria-busy', 'true');
        });
        const activeBtn = action === 'again' ? againBtn : changeGameBtn;
        if (activeBtn) {
          activeBtn.textContent = action === 'again'
            ? (LANG === 'ar' ? '⏳ جاري إعادة اللعبة…' : '⏳ Starting again…')
            : (LANG === 'ar' ? '⏳ جاري فتح الألعاب…' : '⏳ Opening games…');
        }
        window.__hypoxPlayAgain = action === 'again';
        players.forEach(p => p.score = 0);
        resolve(action);
      };
      const playAgain = () => choose('again');
      const changeGame = () => choose('change');
      againBtn?.addEventListener('click', playAgain);
      changeGameBtn?.addEventListener('click', changeGame);
      // Poll for phone host choice (phones-only mode)
      const _poll = setInterval(() => {
        if(window.__hypoxWinnerChoice === 'again') {
          clearInterval(_poll); window.__hypoxWinnerChoice = null; choose('again');
        } else if(window.__hypoxWinnerChoice === 'change') {
          clearInterval(_poll); window.__hypoxWinnerChoice = null; choose('change');
        }
      }, 300);
    });

    Audio_.sfx.crown(); Audio_.sfx.fanfare();
    await say(tPick('banter_winner')||'');
    FX.shake(); FX.burst(260, true);
    setTimeout(() => FX.burst(180, true), 900);
    return await resultAction;
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
        { type: 'text', title: t('write_lie'), context: R.fact.replace('___', '____'), translateContext: R.fact, maxLen: 30, enforceUnique: true, oneWord: true, fullscreenInput: true },
        pids, 60);

      // Build answer set: unique lies + truth (all UPPERCASE)
      // v137 — content pack is now clean (single-word truths throughout),
      // but this stays as a defensive safety net for AI-generated content
      // that might still slip in a phrase. Last word, not first — 'THE
      // UNICORN' should resolve to UNICORN, not THE.
      const truthWords = R.truth.toUpperCase().replace(/\(.*?\)/g, '').trim().split(/\s+/);
      const truthUp = truthWords[truthWords.length - 1];
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
        <div class="lie-detector-choice-shell">
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
        // v137 — was missing entirely. 'choice' inputs hide the shared
        // stage on phones (where the fact/blank IS shown correctly — see
        // Ali's Mac screenshots), but nothing was passed to replace it, so
        // players on their own phones saw only 'Which one is the REAL
        // answer?' and the option buttons with no question at all.
        context: R.fact.replace('___', '____'),
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
          const flyText = `+${fooled * 500} ${author.name}`;
          FX.flyPoints(card, flyText);
          broadcastFx({ type: 'burstAt', cardIndex: i, n: 26, text: flyText });
        } else {
          broadcastFx({ type: 'burstAt', cardIndex: i, n: 26 });
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
        const flyText = `+1000 ${names}`;
        FX.flyPoints(tCard, flyText);
        broadcastFx({ type: 'truthBurst', cardIndex: ti, n: 150, n2: 40, text: flyText });
      } else {
        broadcastFx({ type: 'truthBurst', cardIndex: ti, n: 150, n2: 40 });
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
        <div class="hotseat wyr-keep-visible">${avatarHTML(target)}<div class="pname">${esc(target.name)}</div></div>
        <div id="statusRow" class="status-row wyr-keep-visible" style="margin-top:12px"></div>`, t('mode_names')['wyr'], 'wyr-keep-visible'));

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

      // Host uses the same multi-question card renderer as every player.
      if (net.hostSelfPid) {
        renderHostPlayerCard(phoneWyrSpec,value=>
          net.room('inputs/' + phaseId + '/' + net.hostSelfPid).set({v:value,t:Date.now()})
        );
      }

      // Online players already received the split-input state above. One
      // Device mode has no remote controller, so it still needs the complete
      // WYR spec to render each pass-the-phone answer sheet.
      // The host's own inline buttons above already handle their input when
      // phones-only, so skip the redundant auto-triggered overlay for them.
      const _savedPromptLocalWyr = net.promptLocal;
      if (net.hostSelfPid && !net.isOffline) net.promptLocal = null;
      const all = await net.collect(
        phaseId,
        net.isOffline ? phoneWyrSpec : null,
        players.map(p => p.pid),
        inputTimeout(45)
      );
      net.promptLocal = _savedPromptLocalWyr;
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
    // SAY IT ANON — Hot seat edition
    // Each player sits in the hot seat. A statement about them is shown.
    // Everyone else writes a funny anonymous answer.
    // Answers revealed one by one with animation.
    // Hot seat player ONLY picks their favorite → winner gets 1000pts.
    await modeTitleCard('interrogation');
    const WIN_PTS = 1000;
    const COLS = ['#f472b6','#60a5fa','#34d399','#fb923c','#a78bff','#fbbf24','#22d3ee','#f43f5e'];

    // Static prompts — [NAME] gets replaced with the hot seat player's name
    const PROMPTS_EN = [
      'What is [NAME] most scared to do?',
      'What would [NAME] spend 1 million dollars on first?',
      'What is [NAME]\'s biggest red flag?',
      'What is [NAME] definitely lying about right now?',
      'What would [NAME] do if they were invisible for a day?',
      'What is [NAME]\'s most embarrassing habit?',
      'What is [NAME] absolutely terrible at?',
      'What would [NAME] be doing at 3am on a Friday?',
      'What is [NAME]\'s go-to excuse for everything?',
      'What is [NAME] secretly obsessed with?',
      'What would [NAME]\'s villain origin story be?',
      'What would [NAME] do if they were president for one day?',
      'What is [NAME] definitely Googling in private?',
      'What is [NAME]\'s most useless skill?',
      'What would [NAME]\'s dating profile say?',
      'What is [NAME]\'s spirit animal and why?',
      'What would [NAME] do if they woke up famous tomorrow?',
      'What job would [NAME] be immediately fired from?',
      'What is [NAME]\'s most suspicious behavior?',
      'What is [NAME] definitely not telling us?',
    ];
    const PROMPTS_AR = [
      'شنو أكثر شي [NAME] يخاف يسويه؟',
      'شنو أول شي [NAME] يشتريه بمليون؟',
      'شنو أكبر علامة تحذير عند [NAME]؟',
      'شنو [NAME] يكذب فيه هالحين؟',
      'شنو [NAME] يسوي لو صار خفي ليوم؟',
      'شنو أكثر عادة محرجة عند [NAME]؟',
      'شنو [NAME] فاشل فيه بالكامل؟',
      'شنو [NAME] يسوي الساعة 3 الفجر يوم الجمعة؟',
      'شنو عذر [NAME] الجاهز لكل موقف؟',
      'شنو [NAME] مهووس فيه بسرية؟',
      'شنو قصة تحول [NAME] للشرير؟',
      'شنو [NAME] يسوي لو صار رئيس ليوم؟',
      'شنو [NAME] يبحث عنه بالسر في قوقل؟',
      'شنو أعظم موهبة عديمة الفايدة عند [NAME]؟',
      'شنو يكتب [NAME] في بروفايل المواعدة؟',
      'شنو حيوان يمثل [NAME] وليش؟',
      'شنو [NAME] يسوي لو صحى مشهور بكرة؟',
      'من أي وظيفة يطردون [NAME] فوراً؟',
      'شنو أكثر تصرف مريب يسويه [NAME]؟',
      'شنو [NAME] ما يقوله لنا؟',
    ];

    const prompts = LANG === 'ar' ? PROMPTS_AR : PROMPTS_EN;
    const shuffledPlayers = shuffle(players.slice());
    const usedPromptIdxs = new Set();

    for (let r = 0; r < shuffledPlayers.length; r++) {
      const hotSeat = shuffledPlayers[r];
      const hotPid = hotSeat.pid;
      const writerPids = players.map(p => p.pid).filter(pid => pid !== hotPid);
      if (writerPids.length < 1) continue;

      // Pick a unique prompt
      let promptIdx;
      do { promptIdx = Math.floor(Math.random() * prompts.length); } while (usedPromptIdxs.has(promptIdx) && usedPromptIdxs.size < prompts.length);
      usedPromptIdxs.add(promptIdx);
      const _hotName = hotSeat.name.charAt(0).toUpperCase() + hotSeat.name.slice(1);
      const promptText = prompts[promptIdx].replace(/\[NAME\]/g, _hotName);

      // Phase 1: Hot seat announcement — WYR style
      await FX.wipe();
      setPill(`${LANG==='ar'?'دور':'Turn'} ${r+1} ${LANG==='ar'?'من':'of'} ${shuffledPlayers.length}`);
      scene(`
        <div style="text-align:center;padding:3vmin 2vmin;display:flex;flex-direction:column;align-items:center;gap:1.5vmin">
          <div style="font-family:'Fredoka One',sans-serif;font-size:clamp(12px,2vmin,16px);color:var(--text2);letter-spacing:3px;text-transform:uppercase;animation:fadeSlideUp 0.4s both">${LANG==='ar'?'على الكرسي الساخن':'ON THE HOT SEAT'}</div>
          <div style="position:relative;margin:1vmin auto;animation:wyrTrophyPop 0.7s 0.2s both cubic-bezier(0.34,1.56,0.64,1)">
            <div style="width:clamp(100px,16vmin,140px);height:clamp(100px,16vmin,140px);border-radius:50%;background:radial-gradient(circle at 35% 35%,rgba(255,255,255,0.15),transparent);box-shadow:0 0 40px ${hotSeat.color||'#f472b6'}88,0 0 80px ${hotSeat.color||'#f472b6'}44;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:clamp(52px,9vmin,80px)">${hotSeat.emoji||'😂'}</div>
            <div style="position:absolute;inset:-4px;border-radius:50%;border:3px solid ${hotSeat.color||'#f472b6'};animation:wyrRingPulse 1.5s ease-in-out infinite"></div>
          </div>
          <div style="font-family:'Fredoka One',sans-serif;font-size:clamp(30px,6vmin,60px);color:var(--text);animation:fadeSlideUp 0.5s 0.6s both;line-height:1">${esc(hotSeat.name)}</div>
          <div style="display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#ff3d8a33,#ff3d8a11);border:1.5px solid #ff3d8a66;border-radius:30px;padding:6px 20px;animation:fadeSlideUp 0.5s 0.8s both">
            <span style="font-size:clamp(14px,2vmin,18px)">🔥</span>
            <span style="font-family:'Fredoka One',sans-serif;font-size:clamp(13px,2vmin,17px);color:#ff3d8a">${LANG==='ar'?'على الكرسي الساخن':'is in the hot seat'}</span>
          </div>
        </div>`);
      net.setState({ phase:'wait', msg: `🔥 ${esc(hotSeat.name)} ${LANG==='ar'?'على الكرسي الساخن':'is on the hot seat'}` });
      await sleep(2800);

      // Phase 2: Show prompt, collect answers from everyone except hot seat
      await FX.wipe();
      scene(`<div style="height:max(20px,3vmin)"></div>
        <div class="eyebrow">😂 ${LANG==='ar'?'قولها أنون':'SAY IT ANON'}</div>
        <div class="prompt-card display" style="margin-top:1vmin">${esc(promptText)}</div>
        <div class="pick-sub" style="margin-top:1.5vmin">${LANG==='ar'?'✍️ اكتب أضحك إجابة — هويتك سرية!':'✍️ Write the funniest answer — stay anonymous!'}</div>
        <div id="statusRow" class="status-row" style="margin-top:1vmin"></div>`);
      Audio_.sfx.sting(); hostSay('prompt');

      const row = $('#statusRow');
      row.innerHTML = writerPids.map(pid => `<div class="mini" id="mini-${pid}">${avatarHTML(safeP(pid))}<div class="check">✓</div></div>`).join('');
      net.onEachInput(pid => { if(writerPids.includes(pid)){ Audio_.sfx.submit(); $('#mini-'+pid)?.classList.add('done'); } });

      const answers = await collectWithTimer({
        type: 'text',
        title: LANG==='ar' ? '✍️ اكتب إجابتك' : '✍️ Write your answer',
        // No 'context' here — the prompt is already fully visible on the
        // shared display above (eyebrow + prompt-card); repeating it here
        // showed the exact same question text twice on screen.
        maxLen: 80,
      }, writerPids, 40);

      const answerList = writerPids
        .map(pid => ({ pid, text: (val(answers, pid)||'').trim() }))
        .filter(a => a.text)
        .sort(() => Math.random() - 0.5);

      if (answerList.length < 1) continue;
      net.onEachInput(null);

      // Phase 4: Hot seat player picks favorite (goes straight here from
      // writing — no separate "watch the answers" screen in between; the
      // pick screen itself already shows every answer)
      await FX.wipe();
      const pickPhaseId = 'ph' + (++phaseCounter);
      const pickDeadline = inputDeadline(30);

      // Build pick options for hot seat only
      const pickOptions = answerList.map((a, idx) => ({
        id: a.pid,
        label: `${String.fromCharCode(65+idx)}. ${a.text}`,
        color: COLS[idx % COLS.length]
      }));
      const pickSpecs = {};
      // Hot seat gets choice spec — works for both host (scene cards) and regular player (ctrl buttons)
      pickSpecs[hotPid] = {
        type: 'choice',
        title: LANG==='ar'?'😂 اختار الأضحك':'😂 Pick the funniest',
        context: promptText,
        options: pickOptions
      };
      // Everyone else waits
      for (const pid of writerPids) {
        pickSpecs[pid] = { type: 'wait', title: LANG==='ar'?`⏳ ${esc(hotSeat.name)} يختار الأضحك`:`⏳ ${esc(hotSeat.name)} is picking...` };
      }

      // Broadcast-safe view goes into hostStage/scene() always — this is what
      // every phone's shared-stage mirror clones, so it must be the generic
      // spectator view regardless of who's picking. Confirmed bug: this used
      // to branch on `net.hostSelfPid===hotPid` and write the picker's own
      // personalized "Pick the funniest" UI directly into hostStage — since
      // sharedHTML() clones hostStage indiscriminately to every other
      // player's phone, that personal UI was appearing on everyone's screen,
      // not just the host's own, whenever the host happened to be hot seat.
      scene(`
        <div style="height:max(60px,8vmin)"></div>
        <div class="eyebrow" style="text-transform:none;font-size:clamp(12px,2vmin,16px)">😂 ${LANG==='ar'?`${esc(hotSeat.name)} يختار الأضحك`:`<span style="text-transform:uppercase;letter-spacing:2px">${esc(hotSeat.name)}</span> PICKS THE FUNNIEST`}</div>
        <div class="prompt-card display" style="font-size:clamp(14px,2.2vmin,20px);margin-bottom:1.5vmin">${esc(promptText)}</div>
        <div class="ans-reveal-list" id="siaPickList" style="width:100%;max-width:700px">${answerList.map((a,idx)=>{
          const col=COLS[idx%COLS.length];
          return `<button class="sia-pick-btn" data-idx="${idx}" style="
            display:flex;align-items:center;gap:12px;width:100%;
            padding:clamp(14px,2.4vmin,22px) clamp(16px,2.6vmin,24px);
            border-radius:16px;border:1px solid var(--border);border-left:4px solid ${col};
            background:rgba(255,255,255,0.04);
            box-shadow:none;
            cursor:default;text-align:left;
            font-family:inherit;color:var(--text);
            transition:transform .15s,box-shadow .15s,border-color .15s;
            animation:cardIn 0.4s ${idx*0.1}s both">
            <span style="font-family:'Fredoka One',sans-serif;color:${col};font-size:clamp(22px,3.5vmin,32px);min-width:32px;text-shadow:0 0 14px ${col}88">${String.fromCharCode(65+idx)}</span>
            <span style="font-size:clamp(15px,2.2vmin,20px);font-weight:700;flex:1">${esc(a.text)}</span>
          </button>`;}).join('')}</div>
        <div class="pick-sub" style="margin-top:10px;animation:fadeSlideUp 0.5s 0.6s both;font-size:clamp(13px,1.8vmin,16px)">${LANG==='ar'?`🔥 ${esc(hotSeat.name)} يختار الآن...`:`🔥 ${esc(hotSeat.name)} is choosing...`}</div>`);

      // If the host IS the hot-seat picker, add their actual clickable UI as
      // a .host-only-ui overlay — this class is already excluded from the
      // DOM-clone broadcast (see sharedHTML()/mutation observer), so it stays
      // strictly local to the host's own screen.
      if (net.hostSelfPid === hotPid) {
        renderHostPlayerCard(pickSpecs[hotPid],value=>
          net.room('inputs/'+pickPhaseId+'/'+hotPid).set({v:value,t:Date.now()})
        );
        const _extraCtrl = document.getElementById('ctrlArea');
        if (_extraCtrl) { _extraCtrl.innerHTML = ''; _extraCtrl.classList.add('hidden'); }
        const _extraShared = document.getElementById('phoneSharedStage');
        if (_extraShared) _extraShared.style.setProperty('display', 'none', 'important');
      }

      // Send choice spec — hot seat player gets buttons on their device via controller
      net.setState({ phase: 'input-split', phaseId: pickPhaseId, deadline: pickDeadline, specs: pickSpecs });

      // Bot hot seat auto-picks
      const botPids = net.getBotPids ? net.getBotPids() : [];
      if (botPids.includes(hotPid)) {
        setTimeout(async () => {
          try {
            const pick = answerList[Math.floor(Math.random()*answerList.length)];
            await net.room('inputs/'+pickPhaseId+'/'+hotPid).set({ v: pick.pid, t: Date.now() });
          } catch(e) {}
        }, 1500 + Math.random()*2000);
      }

      // The host's own scene already has working click handlers for this pick
      // (wired above, when net.hostSelfPid===hotPid) — so the generic
      // "host answers via bottom overlay" auto-trigger inside net.collect()
      // would just duplicate it. Temporarily disable it for this one call.
      const _savedPromptLocal = net.promptLocal;
      if (net.hostSelfPid === hotPid) net.promptLocal = null;
      const picks = await net.collect(pickPhaseId, pickSpecs[hotPid], [hotPid], inputTimeout(30));
      net.promptLocal = _savedPromptLocal;
      net.onEachInput(null);

      const chosenPid = val(picks, hotPid);
      const winner = answerList.find(a => a.pid === chosenPid) || answerList[0];
      const winnerPlayer = safeP(winner.pid);
      if (winner.pid) addScore(winner.pid, WIN_PTS);

      // Phase 5: Reveal — show ONLY the winning answer, no scrolling list
      Audio_.sfx.reveal(); FX.burst(80);
      scene(`
        <div style="height:max(60px,8vmin)"></div>
        <div class="eyebrow">🏆 ${LANG==='ar'?'الأضحك':'FUNNIEST ANSWER'}</div>
        <div class="prompt-card display" style="font-size:clamp(14px,2.2vmin,20px);margin-bottom:1vmin">${esc(promptText)}</div>
        <div style="width:100%;max-width:700px">
          <div class="ans-card" style="
            border:2px solid var(--yellow);border-left:6px solid var(--yellow);
            background:linear-gradient(135deg,rgba(251,191,36,0.28),rgba(251,191,36,0.10));
            box-shadow:0 0 28px rgba(251,191,36,0.45),inset 0 0 0 2px rgba(251,191,36,0.5);
            flex-direction:column;gap:10px;padding:clamp(18px,2.6vmin,26px) clamp(18px,2.6vmin,26px);animation:cardIn 0.4s both">
            <div style="display:flex;align-items:center;gap:14px">
              <span style="flex:1;font-size:clamp(18px,2.6vmin,24px);font-weight:700">${esc(winner.text)}</span>
              <span style="font-family:'Fredoka One',sans-serif;color:var(--yellow);font-size:clamp(13px,1.7vmin,16px);white-space:nowrap;background:rgba(251,191,36,0.15);padding:4px 12px;border-radius:20px">🏆 +${WIN_PTS}</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px">
              ${avatarHTML(winnerPlayer)}
              <span style="font-size:clamp(12px,1.6vmin,15px);color:var(--yellow)">
                ${esc(winnerPlayer?.name||'')} · ${LANG==='ar'?'اختاره':'chosen by'} ${esc(hotSeat.name)} 🔥
              </span>
            </div>
          </div>
        </div>`);
      net.setState({ phase:'wait', msg: LANG==='ar'?`🏆 ${esc(winner.pid?safeP(winner.pid)?.name||'':'?')} فاز!`:`🏆 ${esc(winnerPlayer?.name||'')} wins!` });
      await hostSay('reveal');
      await waitNext();
      if (r < shuffledPlayers.length - 1) await showScores();
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
        context: promptText, maxLen:100, fullscreenInput: true
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
          renderHostPlayerCard({type:'choice',title:LANG==='ar'?'🥊 من يفوز؟':'🥊 Who wins?',options:votableOpts},value=>
            net.room('inputs/'+votePhaseId+'/'+net.hostSelfPid).set({v:value,t:Date.now()})
          );
        }
      }

      const _savedPromptLocalDiss = net.promptLocal;
      if (net.hostSelfPid) net.promptLocal = null;
      const votes = await net.collect(votePhaseId, null, allPids, inputTimeout(20));
      net.promptLocal = _savedPromptLocalDiss;
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
      if (i < qs.length - 1) await showScores();
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
        <div class="prompt-card">${esc(cityName)}</div>
        <div class="pick-sub">${LANG==='ar'?'وين هالمدينة؟ حط دبوسك على الخريطة!':'Where is this city? Drop your pin on the map!'}</div>
        <div id="statusRow" class="status-row"></div>`);
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

      // Hybrid scoring: distance decides most of the score (precision-based,
      // GeoGuessr-style exponential decay), with a small rank bonus on top so
      // 1st/2nd/3rd still feels rewarded. Previously this was pure rank-based
      // (1000/700/500/300 flat) — a wildly-off guess in 1st place scored the
      // same as a precise one, and two very different distances could tie.
      results.forEach((r2, i) => {
        if (!r2.guessed) return;
        const base = Math.round(1000 * Math.exp(-r2.km / 2000)); // ~1000 at 0km, ~368 at 2000km, ~7 at 10000km
        const rankBonus = i === 0 ? 200 : i === 1 ? 100 : i === 2 ? 50 : 0;
        addScore(r2.p.pid, base + rankBonus);
      });

      Audio_.sfx.reveal();
      // Push reveal coords to Firebase so player phones can init their own Leaflet map.
      // The DOM-clone broadcast (sharedHTML) strips .leaflet-pane elements, leaving the
      // #revealMap div empty on player devices. This state push is the fix for that.
      net.setState({
        phase: 'wait',
        msg: LANG === 'ar' ? '👆 تابع الشاشة' : '👆 Watch the screen',
        mirror: { ...mirror },
        pinpointReveal: {
          city: { lat: city.lat, lon: city.lon, name: cityName },
          guesses: results.filter(r2 => r2.guess).map(r2 => ({
            lat: r2.guess.lat, lon: r2.guess.lon,
            name: r2.p.name, color: r2.p.color, emoji: r2.p.emoji, km: r2.km
          }))
        }
      });
      scene(`
        <div class="eyebrow">${esc(cityName)}</div>
        <div id="revealMap" class="pinpoint-reveal-map" style="height:36vh;min-height:220px;border-radius:16px;overflow:hidden;margin:1vmin auto 2vmin;max-width:900px;background:#0e1626"></div>
        <div class="score-list">
          ${results.map((r2, i) => `
            <div class="score-row" style="animation-delay:${i*.12}s">
              <div class="medal">${i===0?'🥇':i===1?'🥈':i===2?'🥉':''}</div>
              <div class="avatar" style="background:${r2.p.color}">${r2.p.emoji}</div>
              <div class="bar-track"><div class="bar-fill" style="width:${r2.guessed ? Math.max(15,100-i*20) : 4}%;background:${r2.guessed ? 'linear-gradient(90deg,var(--blue),var(--green))' : 'rgba(255,255,255,.08)'}">
                ${esc(r2.p.name)} · ${r2.guessed ? r2.km.toLocaleString()+' km' : (LANG==='ar'?'ما جاوب':'no pin')}
              </div></div>
            </div>`).join('')}
        </div>`);
      try {
        // Fixed close zoom for every reveal — no longer computed from the
        // farthest guess, so one wildly-off guess can't force the whole map
        // to zoom out and make everything else tiny/illegible.
        const REVEAL_ZOOM = 6;
        // Guesses farther than this aren't plotted on the map (they'd land
        // off-frame at REVEAL_ZOOM anyway) — they're still fully visible in
        // the score list below with their name and distance.
        const REVEAL_VISIBLE_KM = 700;
        const rm = L.map(document.getElementById('revealMap'), {
          center: [city.lat, city.lon], zoom: 2, minZoom: 2, zoomControl: false, attributionControl: false,
          dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false,
          worldCopyJump: false, maxBounds: [[-90,-180],[90,180]], maxBoundsViscosity: 1.0,
        });
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 10, minZoom: 2, noWrap: true, bounds: [[-90,-180],[90,180]] }).addTo(rm);
        // Single city marker — a star-in-a-dot with its name label attached
        // directly beneath it, so it reads as ONE unmistakable mark instead
        // of a plain circle plus a separately-floating text label.
        L.marker([city.lat, city.lon], {
          icon: L.divIcon({
            html: `<div class="pp-city-marker"><div class="pp-city-dot">⭐</div><div class="pp-city-name">${esc(cityName)}</div></div>`,
            className: '', iconSize: [160, 70], iconAnchor: [80, 15]
          }),
          interactive: false
        }).addTo(rm);
        // Avatar-emoji pins — since players can't pick duplicate avatars,
        // showing the actual emoji is instantly recognizable without needing
        // to cross-reference a number against the score list below.
        results.forEach(r2 => {
          if (!r2.guess) return;
          if (r2.km > REVEAL_VISIBLE_KM) return; // too far to usefully show at this zoom
          L.marker([r2.guess.lat, r2.guess.lon], {
            icon: L.divIcon({ html: `<div class="pp-guess-avatar" style="background:${r2.p.color}">${r2.p.emoji}</div>`, className: '', iconSize: [30,30], iconAnchor: [15,15] }),
          }).addTo(rm);
        });
        // Animated reveal: start at a world view, then fly into the city at
        // the fixed close zoom — a bit of drama instead of an instant cut,
        // and the city is always dead-center so it's obvious what's being
        // measured against.
        setTimeout(() => {
          rm.invalidateSize();
          rm.flyTo([city.lat, city.lon], REVEAL_ZOOM, { duration: 1.2 });
        }, 60);
      } catch(e) { console.error('reveal map failed', e); }
      pushMirror({ headline: results.slice(0,3).map((r2,i)=>`${i+1}. ${r2.p.name} ${r2.guessed?r2.km+'km':'—'}`).join(' · ') });
      await waitNext();
      if (r < pool.length - 1) await showScores();
    }
    await showScores();
  }

  /* Wait for Next press, or auto-advance if autoplay is on */
  function waitNext(autoSeconds = 6, label = null) {
    return new Promise(res => {
      const action = document.getElementById('hostDockAction');
      const btn = document.createElement('button');
      btn.className = 'big-btn host-only-ui';
      action.innerHTML = '';
      action.appendChild(btn);
      const baseLabel = label || t('next_round');
      const done = () => { window.__hypoxSkip = null; if (timer) clearInterval(timer); action.innerHTML = ''; res(); };
      let timer = null;
      const isAutoplay = window.HYPOX_STATE?.autoplay === true; // explicit check
      if (isAutoplay) {
        let left = autoSeconds;
        btn.textContent = `${baseLabel} (${left})`;
        timer = setInterval(() => {
          left--;
          if (left <= 0) { done(); return; }
          btn.textContent = `${baseLabel} (${left})`;
        }, 1000);
      } else {
        btn.textContent = baseLabel; // manual: no timer ever
      }
      btn.addEventListener('click', done, { once: true });
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
      if (!Q || !Q.q) {
        console.error('[HYPOX][TimeMachine] Q.q missing at render time:', JSON.stringify(Q));
      }
      const _qText = (Q && Q.q) ? Q.q : (LANG==='ar'?'⚠️ تعذّر تحميل السؤال':'⚠️ Question failed to load');
      scene(`
        <div class="tm-wrap">
          <div class="tm-eyebrow">⏳ ${esc(t('mode_names').year || 'TIME MACHINE')}</div>
          <div class="tm-statement-card"><div class="tm-statement-text">${esc(_qText)}</div></div>
          <div class="tm-prompt">${LANG==='ar'?'أي سنة صارت؟ اكتب تخمينك!':'What year did this happen? Type your guess!'}</div>
          <div id="statusRow" class="status-row"></div>
        </div>`);
      pushMirror({ headline: Q.q, pill: `${i+1}/${qs.length}` });
      Audio_.sfx.sting();
      const answers = await collectWithTimer({
        type: 'text', title: LANG==='ar'?'اكتب السنة':'Type the year', context: Q.q, translateContext: Q.q, maxLen: 4, numeric: true, seconds: 20, customRenderer: 'timeMachine',
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
        if (r2.yr === null) { r2.pts = 0; return; }
        let pts = AWARD[idx] !== undefined ? AWARD[idx] : 300;
        if (r2.diff === 0) pts += 500;
        r2.pts = pts;
        addScore(r2.p.pid, pts);
      });
      Audio_.sfx.reveal(); FX.burst(60);
      scene(`
        <div class="tm-wrap">
          <div class="tm-reveal-statement">${esc(_qText)}</div>
          <div class="tm-reveal-year-card">
            <div class="tm-reveal-year-label">${LANG==='ar'?'السنة الصحيحة':'The Year Was'}</div>
            <div class="tm-reveal-year">${Q.y}</div>
          </div>
          <div class="tm-score-list">
            ${results.map((r2, idx) => `
              <div class="tm-score-row${idx===0?' tm-rank-1':''}" style="animation-delay:${idx*.08}s">
                <div class="tm-score-rank">${idx===0?'🥇':idx===1?'🥈':idx===2?'🥉':''}</div>
                <div class="tm-score-avatar" style="background:${r2.p.color}">${r2.p.emoji}</div>
                <div class="tm-score-info">
                  <div class="tm-score-name">${esc(r2.p.name)}</div>
                  <div class="tm-score-guess">${r2.yr !== null ? r2.yr + (r2.diff===0 ? ' 🎯 '+(LANG==='ar'?'بالضبط!':'Exact!') : ' (±'+r2.diff+')') : (LANG==='ar'?'ما جاوب':'No guess')}</div>
                </div>
                <div class="tm-score-pts${r2.pts===0?' tm-zero':''}">${r2.pts} ${LANG==='ar'?'نقطة':'pts'}</div>
              </div>`).join('')}
          </div>
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
      // v88 — scoring redesign per Ali's spec: the person voted "most likely"
      // did nothing themselves (they didn't vote), so they earn 0. Only the
      // voters who correctly called the group's pick score, flat 200 each —
      // no curve by group size, no reward/penalty either way for landslide
      // vs close votes (explicitly rejected during design discussion).
      const correctVoters = pids.filter(pid => !winners.includes(pid) && winners.includes(val(votes, pid)));
      correctVoters.forEach(pid => addScore(pid, 200));
      Audio_.sfx.reveal(); FX.burst(80);

      // v88 — spotlight reveal (reuses Know Your Crew's glowing-ring hot-seat
      // presentation, see wyrTrophyPop/wyrRingPulse) shown BEFORE the vote
      // bar chart, so the winner gets a real "moment" instead of just
      // appearing as the top bar in a stats screen.
      const winnerPlayers = winners.map(pid => players.find(p => p.pid === pid)).filter(Boolean);
      const spotlightAvatars = winnerPlayers.map(wp => `
          <div style="position:relative;margin:1vmin;animation:wyrTrophyPop 0.7s 0.2s both cubic-bezier(0.34,1.56,0.64,1)">
            <div style="width:clamp(90px,14vmin,130px);height:clamp(90px,14vmin,130px);border-radius:50%;background:radial-gradient(circle at 35% 35%,rgba(255,255,255,0.15),transparent);box-shadow:0 0 40px ${wp.color||'#facc15'}88,0 0 80px ${wp.color||'#facc15'}44;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:clamp(46px,8vmin,72px);">${wp.emoji||'😊'}</div>
            <div style="position:absolute;inset:-4px;border-radius:50%;border:3px solid ${wp.color||'#facc15'};animation:wyrRingPulse 1.5s ease-in-out infinite;"></div>
          </div>`).join('');
      const spotlightNames = winnerPlayers.map(wp => esc(wp.name)).join(' & ');
      // v92 — show who actually voted for the winner, right on the spotlight
      // screen, so it's not just a name in isolation. Shows EVERY voter who
      // picked the winner, including a self-vote if the winner voted for
      // themselves (that voter just doesn't score — see correctVoters above
      // — but they still count as having "called it").
      const voterPlayers = pids.filter(pid => winners.includes(val(votes, pid))).map(pid => players.find(p => p.pid === pid)).filter(Boolean);
      const votersRow = voterPlayers.length ? `
          <div style="display:flex;flex-direction:column;align-items:center;gap:0.8vmin;animation:fadeSlideUp 0.5s 1s both;margin-top:0.5vmin">
            <div style="font-family:'Fredoka One',sans-serif;font-size:clamp(10px,1.5vmin,13px);color:var(--text3);letter-spacing:2px;text-transform:uppercase">${LANG==='ar'?'صوّتوا له':'VOTED BY'}</div>
            <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:1vmin;max-width:90vw">
              ${voterPlayers.map(vp => `
                <div style="display:flex;flex-direction:column;align-items:center;gap:0.3vmin">
                  <div style="width:clamp(34px,5.5vmin,50px);height:clamp(34px,5.5vmin,50px);border-radius:50%;background:${vp.color};display:flex;align-items:center;justify-content:center;font-size:clamp(16px,2.6vmin,24px)">${vp.emoji||'😊'}</div>
                  <div style="font-size:clamp(9px,1.3vmin,11px);color:var(--text2);max-width:64px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(vp.name)}</div>
                </div>`).join('')}
            </div>
          </div>` : '';
      scene(`
        <div style="text-align:center;padding:3vmin 2vmin;display:flex;flex-direction:column;align-items:center;gap:1.5vmin">
          <div style="font-family:'Fredoka One',sans-serif;font-size:clamp(12px,2vmin,16px);color:var(--text2);letter-spacing:3px;text-transform:uppercase;animation:fadeSlideUp 0.4s both">🏆 ${LANG==='ar'?'الأرجح':'MOST LIKELY TO'}</div>
          <div style="display:flex;flex-wrap:wrap;justify-content:center">${spotlightAvatars}</div>
          <div style="font-family:'Fredoka One',sans-serif;font-size:clamp(28px,5.6vmin,56px);color:var(--text);animation:fadeSlideUp 0.5s 0.6s both;line-height:1.15">${spotlightNames}</div>
          <div style="display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#facc1533,#facc1511);border:1.5px solid #facc1566;border-radius:30px;padding:6px 20px;animation:fadeSlideUp 0.5s 0.8s both">
            <span style="font-size:clamp(14px,2vmin,18px)">👑</span>
            <span style="font-family:'Fredoka One',sans-serif;font-size:clamp(13px,2vmin,17px);color:#facc15">${LANG==='ar'?'الكل يشوف كذا':'the crowd has spoken'}</span>
          </div>
          ${votersRow}
        </div>`);
      await waitNext(8, LANG==='ar' ? 'التالي' : 'Next');
      await FX.wipe();

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
      // v94 — rebuilt to match Time Machine's reveal layout (Ali's request).
      // The old version crammed the name AND the result AND the points inside
      // the colored bar, and varied that bar's width by correctness (80%/20%),
      // so wrong answers got a short bar with squeezed, truncated text. Now
      // every piece gets its own column, exactly like .tm-score-row. Scoring
      // itself is deliberately UNCHANGED — flat CORRECT_PTS for right, 0 for
      // wrong (Ali reviewed the alternatives and chose to keep it as-is).
      const tlRows = pids.map(pid => {
        const p = safeP(pid);
        if (!p) return null;
        const a = val(answers, pid);
        return { p, got: a === correctId, answered: a === 'true' || a === 'false', said: a, order: answers[pid]?.order ?? Infinity };
      }).filter(Boolean).sort((a, b) => (b.got - a.got) || (a.order - b.order));
      const saidLabel = r => !r.answered
        ? (LANG==='ar' ? 'ما جاوب' : 'No answer')
        : (LANG==='ar'
            ? (r.said==='true' ? 'قال حقيقة' : 'قال خطأ')
            : (r.said==='true' ? 'Said TRUE' : 'Said FALSE'));
      scene(`
        <div class="tm-wrap">
          <div class="tm-reveal-statement">${esc(Q.s)}</div>
          <div class="tm-reveal-year-card">
            <div class="tm-reveal-year-label">${LANG==='ar'?'الجواب':'The Answer'}</div>
            <div class="tm-reveal-year" style="color:${Q.truth?'var(--green)':'var(--pink)'}">${resultLabel}</div>
          </div>
          <div class="tm-score-list">
            ${tlRows.map((r, idx) => `
              <div class="tm-score-row${r.got && idx===0 ? ' tm-rank-1' : ''}" style="animation-delay:${idx*.08}s">
                <div class="tm-score-rank">${r.got ? '✅' : '❌'}</div>
                <div class="tm-score-avatar" style="background:${r.p.color}">${r.p.emoji}</div>
                <div class="tm-score-info">
                  <div class="tm-score-name">${esc(r.p.name)}</div>
                  <div class="tm-score-guess">${saidLabel(r)}</div>
                </div>
                <div class="tm-score-pts${r.got?'':' tm-zero'}">${r.got?'+'+CORRECT_PTS:'0'} ${LANG==='ar'?'نقطة':'pts'}</div>
              </div>`).join('')}
          </div>
        </div>`);
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
        <div class="flag-display">${Q.flag}</div>
        <div class="pick-sub">${LANG==='ar'?'اكتب اسم الدولة':'Type the country name'}</div>
        <div id="statusRow" class="status-row"></div>`);
      pushMirror({ headline: Q.flag });
      Audio_.sfx.sting();
      // v95 — no `context` here on purpose. The flag is already displayed
      // large on the stage directly above (and mirrored to every phone in
      // phones-only), so passing it as input context rendered it a SECOND
      // time inside the input card. Same pattern ChatGPT used for Time
      // Machine (07c7150): keep the copy on the stage, drop the one in the
      // lower input panel.
      const answers = await collectWithTimer({ type:'text', title:LANG==='ar'?'اسم الدولة؟':'Country name?', maxLen:40, seconds:15 }, pids, 15);
      const right = pids.filter(pid=>{
        const v=(val(answers,pid)||'').trim().toUpperCase();
        return v===ansUp||(ansUp.includes(v)&&v.length>2);
      }).sort((a,b)=>answers[a].order-answers[b].order);
      right.forEach(pid=>addScore(pid,CORRECT_PTS));
      Audio_.sfx.reveal(); FX.burst(80);
      // v99 — same reveal layout as True or Lie (v94) / Higher or Lower
      // (v97): every piece gets its own column instead of a bar whose
      // width varied by correctness. Flag Hunt is free-text rather than a
      // fixed set of choices, so instead of "Said Higher/Lower" each row
      // shows what the player actually typed (or 'No answer').
      const fhRows = pids.map(pid => {
        const p = safeP(pid);
        if (!p) return null;
        const typed = (val(answers, pid) || '').trim();
        return { p, got: right.includes(pid), typed, order: answers[pid]?.order ?? Infinity };
      }).filter(Boolean).sort((a, b) => (b.got - a.got) || (a.order - b.order));
      const fhSaid = r => !r.typed
        ? (LANG==='ar' ? 'ما جاوب' : 'No answer')
        : (r.got ? esc(r.typed) : (LANG==='ar' ? `كتب: ${esc(r.typed)}` : `Typed: ${esc(r.typed)}`));
      scene(`
        <div class="tm-wrap">
          <div class="tm-reveal-statement">🚩 ${LANG==='ar'?'عرّف العلم':'FLAG HUNT'}</div>
          <div class="tm-reveal-year-card">
            <div class="flag-display" style="font-size:clamp(50px,8vw,80px);margin:0 0 0.5vmin 0">${Q.flag}</div>
            <div class="tm-reveal-year-label">${LANG==='ar'?'الجواب':'The Answer'}</div>
            <div class="tm-reveal-year">${esc(answer)}</div>
          </div>
          <div class="tm-score-list">
            ${fhRows.map((r, idx) => `
              <div class="tm-score-row${r.got && idx===0 ? ' tm-rank-1' : ''}" style="animation-delay:${idx*.08}s">
                <div class="tm-score-rank">${r.got ? '✅' : '❌'}</div>
                <div class="tm-score-avatar" style="background:${r.p.color}">${r.p.emoji}</div>
                <div class="tm-score-info">
                  <div class="tm-score-name">${esc(r.p.name)}</div>
                  <div class="tm-score-guess">${fhSaid(r)}</div>
                </div>
                <div class="tm-score-pts${r.got?'':' tm-zero'}">${r.got?'+'+CORRECT_PTS:'0'} ${LANG==='ar'?'نقطة':'pts'}</div>
              </div>`).join('')}
          </div>
        </div>`);
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
      // v97 — hint sizing moved out of an inline style into .hl-hint so it can
      // be scaled down while the host's input dock is on screen, same as
      // .flag-display (v95/v96). Inline styles can't be overridden by the
      // dock-clearance rules, which is what left tall stage content clipped.
      scene(`<div class="eyebrow">📊 ${LANG==='ar'?'فوق ولا تحت؟':'HIGHER OR LOWER?'}</div>
        <div class="prompt-card display">${esc(Q.q)}</div>
        <div class="pick-sub hl-hint">${hint.toLocaleString()} ${esc(Q.unit||'')}</div>
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
      // v97 — same reveal layout as True or Lie (v94) / Time Machine: every
      // piece gets its own column instead of being crammed into a bar whose
      // width varied by correctness. Both modes are two-option guesses, so
      // Ali wants them visually identical apart from the wording.
      const hlRows = pids.map(pid => {
        const p = safeP(pid);
        if (!p) return null;
        const a = val(answers, pid);
        return { p, got: a === correctId, answered: a === 'higher' || a === 'lower', said: a, order: answers[pid]?.order ?? Infinity };
      }).filter(Boolean).sort((a, b) => (b.got - a.got) || (a.order - b.order));
      const hlSaid = r => !r.answered
        ? (LANG==='ar' ? 'ما جاوب' : 'No answer')
        : (LANG==='ar'
            ? (r.said==='higher' ? 'قال أكثر' : 'قال أقل')
            : (r.said==='higher' ? 'Said Higher' : 'Said Lower'));
      scene(`
        <div class="tm-wrap">
          <div class="tm-reveal-statement">${esc(Q.q)}</div>
          <div class="tm-reveal-year-card">
            <div class="tm-reveal-year-label">${LANG==='ar'?'الجواب':'The Answer'}</div>
            <div class="tm-reveal-year">${arrow} ${Q.n.toLocaleString()} ${esc(Q.unit||'')}</div>
          </div>
          <div class="tm-score-list">
            ${hlRows.map((r, idx2) => `
              <div class="tm-score-row${r.got && idx2===0 ? ' tm-rank-1' : ''}" style="animation-delay:${idx2*.08}s">
                <div class="tm-score-rank">${r.got ? '✅' : '❌'}</div>
                <div class="tm-score-avatar" style="background:${r.p.color}">${r.p.emoji}</div>
                <div class="tm-score-info">
                  <div class="tm-score-name">${esc(r.p.name)}</div>
                  <div class="tm-score-guess">${hlSaid(r)}</div>
                </div>
                <div class="tm-score-pts${r.got?'':' tm-zero'}">${r.got?'+'+CORRECT_PTS:'0'} ${LANG==='ar'?'نقطة':'pts'}</div>
              </div>`).join('')}
          </div>
        </div>`);
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
    // v100 — the mode now uses a themed question bank (PACKS['2t1l']).
    // Defensive: if the AI endpoint returns rows in an unexpected shape,
    // drop anything without a .q so a bad payload can't break the round.
    let qbank = [];
    try { qbank = (await Content.get('2t1l', LANG, seats.length) || []).filter(x => x && typeof x.q === 'string' && x.q.trim()); }
    catch (e) { console.error('[HYPOX] 2t1l content failed:', e.message); }
    const DEFAULT_Q = LANG==='ar'
      ? { cat:'عنك', emoji:'🤥', q:'اذكر ٣ أشياء عنك.' }
      : { cat:'ABOUT YOU', emoji:'🤥', q:'Name 3 things about yourself.' };
    for (let r = 0; r < seats.length; r++) {
      const target = seats[r];
      const QC = qbank[r % (qbank.length || 1)] || DEFAULT_Q;
      await FX.wipe();
      setPill(`${t('round')} ${r+1} ${t('of')} ${seats.length}`);
      // The shared screen is for everyone who is WAITING. The active writer
      // gets a dedicated full-screen input card (below), so showing the same
      // oversized avatar/name/category here only duplicated content and
      // pushed their actual fields below the fold.
      scene(`
        <div class="t2l-wait-stage">
          <div class="t2l-mode-label">🤥 ${LANG==='ar'?'اثنين صح وكذبة':'2 TRUTHS 1 LIE'}</div>
          <div class="t2l-answering"><span class="t2l-answering-avatar" style="background:${target.color}">${target.emoji||'😊'}</span><span>${LANG==='ar'?`${target.name} يكتب إجاباته الآن…`:`${target.name} is answering…`}</span></div>
          <div class="tm-statement-card t2l-question-card">
            <div class="tm-statement-text">${esc(QC.q)}</div>
          </div>
          <div class="pick-sub">${LANG==='ar'?'إجابتان صحيحتان وإجابة واحدة كذبة':`Two truths and one lie — can ${target.name} fool you?`}</div>
          <div id="statusRow" class="status-row"></div>
        </div>`);
      pushMirror({ headline: LANG==='ar'?`دور ${target.name}!`:`${target.name}'s turn!` });
      Audio_.sfx.sting();
      // v100 — the old labels ("Truth #1" / "The Lie") were small titles and
      // easy to misread; a player mixing up which box is the lie ruins the
      // whole round, so make it loud: explicit TRUTH/LIE wording, the
      // question repeated as context, and 'x of 3' progress.
      // v102 — ONE input phase with all three fields instead of three
      // sequential phases. The old flow meant the player couldn't see how
      // many answers were wanted, couldn't revise before committing (the
      // real game is deciding WHICH of your three is the lie), and any
      // hiccup in the phase hand-off stranded them after answer one.
      const mtSpec = {
        type: 'multitext',
        title: LANG==='ar' ? '✍️ دورك' : '✍️ Your turn',
        context: QC.q,
        sub: LANG==='ar' ? 'اكتب حقيقتين وكذبة مقنعة' : 'Write two truths and one convincing lie',
        fullscreenInput: true,
        maxLen: 80,
        seconds: 90,
        fields: [
          { label: LANG==='ar' ? '✅ حقيقة ١' : '✅ TRUTH 1', placeholder: LANG==='ar' ? 'شيء صحيح عنك…' : 'Something true…' },
          { label: LANG==='ar' ? '✅ حقيقة ٢' : '✅ TRUTH 2', placeholder: LANG==='ar' ? 'شيء صحيح ثاني…' : 'Another true one…' },
          { label: LANG==='ar' ? '❌ الكذبة' : '❌ THE LIE', placeholder: LANG==='ar' ? 'كذبة مقنعة…' : 'A convincing lie…', lie: true },
        ],
      };
      const packed = await collectWithTimer(mtSpec, [target.pid], 90);
      let trio = [];
      try { trio = JSON.parse(val(packed, target.pid) || '[]'); } catch (e) { trio = []; }
      if (!Array.isArray(trio)) trio = [];
      const s1 = (trio[0]||'').trim() || '...', s2 = (trio[1]||'').trim() || '...', s3 = (trio[2]||'').trim() || '...';
      const stmts = shuffle([{text:s1,truth:true},{text:s2,truth:true},{text:s3,truth:false}]);
      const lieIdx = stmts.findIndex(s=>!s.truth);
      const colors = ['#2de1fc','#ff3d8a','#ffd23f'];
      await FX.wipe();
      // v104 — show the original question here as well. Voters were seeing
      // three bare statements with no idea what question they answered.
      scene(`<div class="eyebrow">${esc(target.name)} — ${LANG==='ar'?'أيها الكذبة؟':'which is the lie?'}</div>
        <div class="tm-statement-card" style="margin-bottom:1vmin"><div class="tm-statement-text" style="font-size:clamp(15px,2.8vmin,22px)">${esc(QC.q)}</div></div><div class="quiz-grid" style="grid-template-columns:1fr">${stmts.map((st,j)=>`<div class="quiz-opt" id="stmt-${j}" style="--qc:${colors[j]};font-size:clamp(15px,2vw,18px)"><span class="q-letter display">${'ABC'[j]}</span> ${esc(st.text)}</div>`).join('')}</div>`);
      const others = players.filter(p=>p.pid!==target.pid).map(p=>p.pid);
      const votes = await collectWithTimer({ type:'choice', title:LANG==='ar'?'أيها الكذبة؟':'Which is the lie?', context:QC.q, options:stmts.map((st,j)=>({id:j,label:`${'ABC'[j]} · ${st.text}`,color:colors[j]})), seconds:20 }, others, 20);
      Audio_.sfx.drum(); await sleep(900);
      document.getElementById('stmt-'+lieIdx)?.classList.add('q-correct');
      stmts.forEach((_,j)=>{if(j!==lieIdx)document.getElementById('stmt-'+j)?.classList.add('q-dim');});
      Audio_.sfx.correct(); FX.burst(80);
      const finders = others.filter(pid=>val(votes,pid)===lieIdx);
      // v100 — scoring reworked. Finders still get a flat 1000 (consistent
      // with True or Lie / Higher or Lower, deliberately kept flat). The
      // target used to get 1000 ONLY if literally nobody found the lie —
      // a cliff edge where fooling 5 of 6 players scored exactly the same
      // as fooling nobody: zero. Now they earn per person fooled, so a
      // nearly-perfect lie beats a bad one. Unlike Most Likely To (where
      // the voted person did nothing), the target here actively WROTE the
      // lie, so rewarding them is earned rather than luck.
      const FIND_PTS = 1000, FOOL_PTS = 300;
      finders.forEach(pid=>addScore(pid,FIND_PTS));
      const fooled = others.filter(pid=>!finders.includes(pid));
      const targetPts = fooled.length * FOOL_PTS;
      if (targetPts > 0) addScore(target.pid, targetPts);
      const fNames = finders.map(pid=>players.find(p=>p.pid===pid)?.name).join(', ');
      pushMirror({ headline: LANG==='ar'?`الكذبة: ${stmts[lieIdx].text}`:`The lie: ${stmts[lieIdx].text}` });
      // v100 — row-by-row breakdown, matching True or Lie (v94), Higher or
      // Lower (v97) and Flag Hunt (v99). This mode previously showed no
      // per-player result at all — just a highlighted statement and a
      // spoken line — so nobody could see who voted what or who scored.
      await waitNext(8, LANG==='ar' ? 'التالي' : 'Next');
      await FX.wipe();
      const t2Rows = others.map(pid => {
        const p = safeP(pid);
        if (!p) return null;
        const v = val(votes, pid);
        const picked = (typeof v === 'number' && stmts[v]) ? stmts[v].text : null;
        return { p, got: finders.includes(pid), picked, order: votes[pid]?.order ?? Infinity };
      }).filter(Boolean).sort((a, b) => (b.got - a.got) || (a.order - b.order));
      scene(`
        <div class="tm-wrap t2l-reveal">
          <div class="tm-reveal-statement">${esc(target.name)} — ${LANG==='ar'?'الكذبة كانت':'the lie was'}</div>
          <div class="tm-reveal-year-card">
            <div class="tm-reveal-year-label">${LANG==='ar'?'❌ الكذبة':'❌ The Lie'}</div>
            <div class="tm-reveal-year" style="font-size:clamp(18px,3.4vmin,28px)">${esc(stmts[lieIdx].text)}</div>
          </div>
          <div class="tm-score-list">
            ${t2Rows.map((r, idx) => `
              <div class="tm-score-row${r.got && idx===0 ? ' tm-rank-1' : ''}" style="animation-delay:${idx*.08}s">
                <div class="tm-score-rank">${r.got ? '✅' : '❌'}</div>
                <div class="tm-score-avatar" style="background:${r.p.color}">${r.p.emoji}</div>
                <div class="tm-score-info">
                  <div class="tm-score-name">${esc(r.p.name)}</div>
                  <div class="tm-score-guess">${r.picked ? (LANG==='ar'?`اختار: ${esc(r.picked)}`:`Picked: ${esc(r.picked)}`) : (LANG==='ar'?'ما صوّت':'No vote')}</div>
                </div>
                <div class="tm-score-pts${r.got?'':' tm-zero'}">${r.got?'+'+FIND_PTS:'0'} ${LANG==='ar'?'نقطة':'pts'}</div>
              </div>`).join('')}
            <div class="tm-score-row" style="animation-delay:${t2Rows.length*.08}s;border:1.5px solid #facc1566">
              <div class="tm-score-rank">🤥</div>
              <div class="tm-score-avatar" style="background:${target.color}">${target.emoji}</div>
              <div class="tm-score-info">
                <div class="tm-score-name">${esc(target.name)}</div>
                <div class="tm-score-guess">${fooled.length ? (LANG==='ar'?`ضحك على ${fooled.length}`:`Fooled ${fooled.length}`) : (LANG==='ar'?'ما ضحك على أحد':'Fooled nobody')}</div>
              </div>
              <div class="tm-score-pts${targetPts?'':' tm-zero'}">${targetPts?'+'+targetPts:'0'} ${LANG==='ar'?'نقطة':'pts'}</div>
            </div>
          </div>
        </div>`);
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

  /* ===== BUSTED — personal Lie Detector =====
     Same core loop as Lie Detector (write a lie -> mix with truth -> vote
     -> score for fooling / for finding truth), but the truth comes from a
     PLAYER, not a trivia pack. Each round one player is the subject: they
     answer privately first, then everyone else writes a fake answer about
     them. Deliberately built as a separate mode rather than replacing Lie
     Detector — the private-answer-first step gives it a different rhythm,
     and generic trivia bluffing is still worth keeping for when nobody
     wants to be put on the spot. */
  async function playBusted() {
    await modeTitleCard('busted');
    const numRounds = window.HYPOX_STATE?.rounds || 3;
    // v123 — scoring constants for the "how well do you know them" redesign.
    // Exact-match bonus set to 500 (matching the correct-voter bonus) as a
    // reasonable default — Ali said to finish the build and settle scoring
    // after, so this is a starting number, easy to retune from one place.
    const CORRECT_VOTER_BONUS = 500;   // each voter who correctly picks the truth
    const SUBJECT_PER_VOTER_BONUS = 500; // subject earns this × correct-voter count
    const FOOLER_BONUS_PER_VOTE = 250; // guess-writer earns this per vote their guess wrongly got
    const EXACT_MATCH_BONUS = 250;     // flat, to anyone whose guess is word-for-word the truth — same weight as the fooler bonus, per Ali

    let prompts = [];
    try { prompts = (await Content.get('busted', LANG, numRounds) || []).filter(x => x && x.q && x.other); }
    catch (e) { console.error('[HYPOX] busted content failed:', e.message); }
    if (!prompts.length) prompts = [{ q: LANG==='ar'?'أغرب شي أكلته':'The weirdest thing you have ever eaten', other: LANG==='ar'?'أغرب شي أكله {name}':'The weirdest thing {name} has ever eaten' }];

    const seatPool = players.slice().sort(() => Math.random() - 0.5);

    for (let r = 0; r < numRounds; r++) {
      const P = prompts[r % prompts.length];
      const subject = seatPool[r % seatPool.length];
      const others = players.filter(p => p.pid !== subject.pid).map(p => p.pid);
      if (!others.length) continue; // need at least one guesser

      const promptText = P.other.replace('{name}', subject.name);

      /* ---- Intro card — deliberately does NOT repeat the question text
         (that's what caused the duplicate box on phones-only screens: the
         mirrored TV scene and the controller's own spec.context both
         showed the same string). Shows the subject + flavor line instead. */
      await FX.wipe();
      setPill(`${t('round')} ${r + 1} ${t('of')} ${numRounds}`);
      scene(`
        <div style="text-align:center;padding:3vmin 2vmin;display:flex;flex-direction:column;align-items:center;gap:1.5vmin">
          <div style="font-family:'Fredoka One',sans-serif;font-size:clamp(12px,2vmin,16px);color:var(--text2);letter-spacing:3px;text-transform:uppercase;animation:fadeSlideUp 0.4s both">🎭 ${LANG==='ar'?'مكشوف':'BUSTED'}</div>
          <div style="position:relative;margin:1vmin;animation:wyrTrophyPop 0.7s 0.2s both cubic-bezier(0.34,1.56,0.64,1)">
            <div style="width:clamp(90px,14vmin,130px);height:clamp(90px,14vmin,130px);border-radius:50%;background:${subject.color};box-shadow:0 0 40px ${subject.color}88;display:flex;align-items:center;justify-content:center;font-size:clamp(46px,8vmin,72px)">${subject.emoji||'😊'}</div>
            <div style="position:absolute;inset:-4px;border-radius:50%;border:3px solid ${subject.color};animation:wyrRingPulse 1.5s ease-in-out infinite"></div>
          </div>
          <div style="font-family:'Fredoka One',sans-serif;font-size:clamp(28px,5.6vmin,56px);color:var(--text);animation:fadeSlideUp 0.5s 0.6s both;line-height:1.15">${esc(subject.name)}</div>
          <div class="pick-sub">${LANG==='ar'?'شكثر تعرفونه؟':'How well does everyone know them?'}</div>
        </div>`);
      pushMirror({ headline: LANG==='ar'?`دور ${subject.name}`:`${subject.name}'s round` });
      Audio_.sfx.sting();

      /* ---- Everyone writes AT ONCE — subject answers honestly, everyone
         else guesses what the subject wrote. One collect call, per-player
         title/context via playerTitles/playerContexts (see main.js) so
         nobody waits on anybody else. */
      const allPids = [subject.pid, ...others];
      const spec = {
        type: 'text',
        title: LANG==='ar' ? 'خمن جوابهم' : 'Guess their answer',
        context: promptText,
        maxLen: 30,
        fullscreenInput: true,
        playerTitles: { [subject.pid]: LANG==='ar' ? 'جاوب بصراحة' : 'Answer honestly' },
        playerContexts: { [subject.pid]: P.q },
      };
      const allInputs = await collectWithTimer(spec, allPids, 45);

      const truthUp = ((val(allInputs, subject.pid) || '').trim().toUpperCase().slice(0, 60)) || (LANG==='ar' ? 'ما جاوب' : 'NO ANSWER');

      /* ---- Build answer set: guesses that exactly match the truth merge
         into the truth card (writers list) exactly like Bluff does. ---- */
      const seen = new Set([truthUp]);
      const guesses = [];
      const truthWriters = [];
      for (const pid of others) {
        const v = (val(allInputs, pid) || '').trim().toUpperCase().slice(0, 60);
        if (!v) continue;
        if (v === truthUp) { truthWriters.push(pid); }
        else if (!seen.has(v)) { seen.add(v); guesses.push({ text: v, by: pid }); }
      }
      const answers = shuffle([{ text: truthUp, truth: true, writers: truthWriters }, ...guesses]);

      /* ---- Vote (subject excluded — they already know the answer) ---- */
      await FX.wipe();
      setPill(t('vote_title'));
      scene(`
        <div class="eyebrow">${esc(promptText)}</div>
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

      const _exclude = {};
      for (const pid of others) {
        const ownIdx = answers.findIndex(a => !a.truth && a.by === pid);
        if (ownIdx !== -1) _exclude[pid] = ownIdx;
      }
      const votes = await collectWithTimer({
        type: 'choice', title: t('pick_truth'),
        options: answers.map((a, i) => ({ id: i, label: a.text })),
        playerExcludes: _exclude,
      }, others, 30);

      // voter-strip: shows exactly who voted for each card (avatars land on
      // the card during reveal) — this already answers "who voted for who".
      const votesByCard = answers.map(() => []);
      for (const pid of others) {
        const v = val(votes, pid);
        if (v === null || v === undefined) continue;
        const a = answers[v];
        if (!a) continue;
        if (!a.truth && a.by === pid) continue;
        votesByCard[v].push(pid);
      }
      for (let i = 0; i < answers.length; i++) {
        for (const pid of votesByCard[i]) {
          Audio_.sfx.vote();
          const p = safeP(pid);
          const strip = $('#voters-' + i);
          if (strip) strip.insertAdjacentHTML('beforeend', `<div class="voter" style="background:${p.color}">${p.emoji}</div>`);
          await sleep(380);
        }
      }
      await sleep(500);
      hideHost();

      /* ---- Reveal wrong guesses, then the truth ---- */
      for (let i = 0; i < answers.length; i++) {
        const a = answers[i];
        if (a.truth) continue;
        await sleep(650);
        const card = $('#card-' + i);
        if (!card) continue;
        const author = safeP(a.by);
        card.querySelector('.ans-back div:last-child').textContent = author ? `${author.emoji} ${author.name}` : '?';
        card.classList.add('flipped');
        await sleep(400);
        Audio_.sfx.buzzer(); card.classList.add('shake'); FX.shake(); FX.burstAt(card, 26);
        // Fooler bonus — this guess got mistaken for the truth.
        const fooled = votesByCard[i].length;
        if (fooled && author) {
          const bonus = fooled * FOOLER_BONUS_PER_VOTE;
          addScore(a.by, bonus);
          FX.flyPoints(card, `+${bonus} ${author.name}`);
        }
        await sleep(850);
      }
      Audio_.sfx.drum();
      await say(LANG === 'ar' ? '…والحقيقة هي' : 'And the truth is…', { speed: 40 });
      hideHost();
      const ti = answers.findIndex(a => a.truth);
      const tCard = $('#card-' + ti);
      if (tCard) {
        tCard.classList.add('flipped');
        await sleep(350);
        Audio_.sfx.reveal(); FX.shake(); FX.burst(150); FX.burstAt(tCard, 40);
      }

      // Exact-match bonus — flat, regardless of votes.
      const truthAns = answers[ti];
      (truthAns.writers || []).forEach(pid => addScore(pid, EXACT_MATCH_BONUS));
      if (truthAns.writers?.length && tCard) {
        const names = truthAns.writers.map(pid => safeP(pid)?.name).filter(Boolean).join(' & ');
        FX.flyPoints(tCard, `+${EXACT_MATCH_BONUS} ${names}`);
        await sleep(500);
      }

      // Correct-voter bonus + subject's per-voter bonus.
      const correctVoters = votesByCard[ti];
      correctVoters.forEach(pid => addScore(pid, CORRECT_VOTER_BONUS));
      if (correctVoters.length) {
        const voterNames = correctVoters.map(pid => safeP(pid)?.name).filter(Boolean).join(' & ');
        if (tCard) FX.flyPoints(tCard, `+${CORRECT_VOTER_BONUS} ${voterNames}`);
        await sleep(500);
        addScore(subject.pid, SUBJECT_PER_VOTER_BONUS * correctVoters.length);
        if (tCard) FX.flyPoints(tCard, `+${SUBJECT_PER_VOTER_BONUS * correctVoters.length} ${subject.name}`);
      } else if (!truthAns.writers?.length) {
        await sleep(400);
        await say(LANG === 'ar' ? `😱 محد عرف ${subject.name}!` : `😱 Nobody knows ${subject.name} at all!`, { speed: 35 });
        hideHost();
      }
      await sleep(1600);
      await showScores();
    }
  }

  /* ===== BLEND IN =====
     Everyone answers the SAME question except one player (the spy), who gets
     a different but closely-related question. Crucially the spy is NOT told —
     they answer honestly and look odd without knowing why. At the reveal the
     AGENTS' question is shown (never the spy's), so the spy works out what
     happened at the same moment as everyone else, and can defend themselves
     during the discussion. No scoring by design: the payoff is the discussion
     and the reveal, not points. */
  async function playBlendIn() {
    await modeTitleCard('blendin');
    const pids = players.map(p => p.pid);
    const spy = players[Math.floor(Math.random() * players.length)];
    const QN = 3;
    let pairs = [];
    try { pairs = (await Content.get('blendin', LANG, QN) || []).filter(x => x && x.a && x.b); }
    catch (e) { console.error('[HYPOX] blendin content failed:', e.message); }
    if (!pairs.length) pairs = [{ a: LANG==='ar'?'اذكر شي تاخذه لجزيرة مهجورة.':'Name something you would take to a desert island.', b: LANG==='ar'?'اذكر شي تاخذه في رحلة بالسيارة.':'Name something you would take on a road trip.' }];

    const rounds = [];
    for (let q = 0; q < QN; q++) {
      const pair = pairs[q % pairs.length];
      await FX.wipe();
      setPill(`${LANG==='ar'?'سؤال':'Question'} ${q+1} ${t('of')} ${QN}`);
      // The stage must NOT show either question — it is visible to everyone,
      // and showing the agents' question would instantly expose the spy.
      // v113 — clearer copy (Ali's feedback on the old "Your question is on
      // your own screen", which read as unclear/generic) plus a real
      // submission tracker matching every other mode: mini avatars with a
      // checkmark that fills in as people answer. Blend In hand-rolls its
      // own collection loop (per-player specs aren't supported by
      // collectWithTimer), so it never got that tracker for free — added
      // manually here, mirroring collectWithTimer's own tracker code.
      scene(`<div class="eyebrow">🎭 ${LANG==='ar'?'اندمج':'BLEND IN'}</div>
        <div class="prompt-card display">${LANG==='ar'?`سؤال ${q+1} من ${QN}`:`Question ${q+1} of ${QN}`}</div>
        <div class="pick-sub">${LANG==='ar'?'📱 كل لاعب يشوف سؤاله الخاص على جواله':"📱 Everyone's question is different — check your own phone"}</div>
        <div id="statusRow" class="status-row"></div>`);
      // Mirror headline stays deliberately generic — it is broadcast to every
      // device, so it must never carry either question.
      pushMirror({ headline: LANG==='ar'?`سؤال ${q+1}`:`Question ${q+1}` });
      Audio_.sfx.sting();

      // v112 — fullscreenInput gives this its own full-screen panel (same
      // treatment 2 Truths 1 Lie already uses), so the question renders as
      // the headline at the TOP of the screen on host and player, Mac and
      // phone. It cannot go on the shared stage: that stage is broadcast
      // identically to every device, so the agents' question would be
      // visible to the spy and the mode would collapse. The per-player
      // input panel is the only surface that can show each person their
      // own question.
      const mkSpec = txt => ({ type:'text', title: LANG==='ar'?'إجابتك':'Answer', context: txt, maxLen:40, seconds:30, keepHostContext:true, fullscreenInput:true });
      const specs = {};
      pids.forEach(pid => { specs[pid] = mkSpec(pid === spy.pid ? pair.b : pair.a); });
      const phaseId = 'bi' + Date.now() + '_' + q;
      const deadline = Date.now() + inputTimeout(30) * 1000;
      // v118 — `targets` added: collectWithTimer sets it on every input
      // phase, and the reconnect/lock-screen recovery path reads it. Blend
      // In omitted it because it hand-rolls its own collection loop.
      net.setState({ phase:'input-split', phaseId, deadline, specs, targets: pids });

      const botPids = net.getBotPids ? net.getBotPids() : [];
      botPids.forEach(bp => {
        if (!pids.includes(bp)) return;
        setTimeout(async () => {
          try {
            const fakes = LANG==='ar' ? ['ماء','أكل','جوال','كتاب','بطانية','نظارة'] : ['water','snacks','my phone','a book','a blanket','sunglasses'];
            await net.room(`inputs/${phaseId}/${bp}`).set({ v: fakes[Math.floor(Math.random()*fakes.length)], t: Date.now() });
          } catch(e) {}
        }, 1200 + Math.random()*2500);
      });

      // Tracker: mini avatars + checkmark, filled in as answers come in.
      // Same "hide until the host has answered" behaviour as
      // collectWithTimer, so the host can't peek at who's answered while
      // still typing their own.
      const _hostIsPlayingBI = net.hostSelfPid && pids.includes(net.hostSelfPid);
      if (_hostIsPlayingBI) document.body.classList.add('hide-tracker');
      const biRow = $('#statusRow');
      if (biRow) {
        biRow.innerHTML = pids.map(pid => {
          const p = safeP(pid);
          return `<div class="mini" id="mini-${pid}">${avatarHTML(p)}<div class="check">✓</div></div>`;
        }).join('');
      }
      net.onEachInput(pid => {
        Audio_.sfx.submit();
        const el = $('#mini-' + pid);
        if (el) el.classList.add('done');
        if (net.hostSelfPid && pid === net.hostSelfPid) document.body.classList.remove('hide-tracker');
      });

      // v118 — after 12s, give the host a way out. Previously a single
      // unreachable player (dropped connection, closed tab, phone that never
      // recovered its input) stalled the entire room for the full 30s with
      // no button to press — exactly what Ali hit. Only appears once things
      // are clearly dragging, so it never clutters a normal round.
      const _biSkipTimer = setTimeout(() => {
        const action = document.getElementById('hostDockAction');
        if (!action || action.querySelector('#biSkipBtn')) return;
        const b = document.createElement('button');
        b.id = 'biSkipBtn';
        b.className = 'big-btn ghost host-only-ui';
        b.textContent = LANG==='ar' ? 'تخطّي الانتظار ⏭' : 'Skip waiting ⏭';
        b.addEventListener('click', () => {
          if (window.__hypoxForceCollect) window.__hypoxForceCollect();
        }, { once:true });
        action.appendChild(b);
      }, 12000);

      const ans = await net.collect(phaseId, specs[net.hostSelfPid] || mkSpec(pair.a), pids, inputTimeout(30));
      clearTimeout(_biSkipTimer);
      document.getElementById('biSkipBtn')?.remove();
      net.onEachInput(null);
      document.body.classList.remove('hide-tracker');
      rounds.push({ pair, ans });
    }

    // ---- Reveal: grouped BY QUESTION, always showing the agents' version ----
    for (let q = 0; q < rounds.length; q++) {
      const { pair, ans } = rounds[q];
      await FX.wipe();
      scene(`
        <div class="tm-wrap">
          <div class="tm-reveal-statement">${LANG==='ar'?`سؤال ${q+1} من ${QN}`:`Question ${q+1} of ${QN}`}</div>
          <div class="tm-reveal-year-card">
            <div class="tm-reveal-year-label">${LANG==='ar'?'السؤال':'The Question'}</div>
            <div class="tm-reveal-year" style="font-size:clamp(16px,3vmin,26px)">${esc(pair.a)}</div>
          </div>
          <div class="tm-score-list">
            ${players.map((p, i) => `
              <div class="tm-score-row" style="animation-delay:${i*.08}s">
                <div class="tm-score-avatar" style="background:${p.color}">${p.emoji}</div>
                <div class="tm-score-info">
                  <div class="tm-score-name">${esc(p.name)}</div>
                  <div class="tm-score-guess" style="font-family:'Fredoka One',sans-serif;font-weight:700;font-size:clamp(15px,2.4vmin,19px);color:var(--yellow)">${esc((val(ans, p.pid)||'').trim() || (LANG==='ar'?'ما جاوب':'No answer'))}</div>
                </div>
              </div>`).join('')}
          </div>
        </div>`);
      Audio_.sfx.reveal();
      await waitNext(12, LANG==='ar' ? 'التالي' : 'Next');
    }

    // ---- Discussion ----
    const DISC = 60; // v113 — was 90s, Ali wants 60
    await FX.wipe();
    scene(`<div class="eyebrow">🎭 ${LANG==='ar'?'وقت النقاش':'DISCUSSION TIME'}</div>
      <div class="prompt-card display">${LANG==='ar'?'مين جاوب على سؤال ثاني؟':'Who was answering a different question?'}</div>
      <div class="year-reveal" id="biT">${DISC}</div>
      <div class="pick-sub" style="opacity:.7">${LANG==='ar'?'ناقشوا الإجابات — وحد منكم ما شاف نفس السؤال':'Talk it through — one of you never saw that question'}</div>`);
    pushMirror({ headline: LANG==='ar'?'ناقشوا!':'Discuss!' });
    let d = DISC;
    const dI = setInterval(() => { d--; const el = document.getElementById('biT'); if (el) el.textContent = d; if (d <= 0) clearInterval(dI); }, 1000);
    await Promise.race([sleep(DISC*1000), waitNext(DISC, LANG==='ar'?'صوّتوا الحين':'Vote now')]);
    clearInterval(dI);

    // ---- Vote (no points — the vote is the climax, not a scoring event) ----
    await FX.wipe();
    scene(`<div class="eyebrow">🗳️ ${LANG==='ar'?'صوّتوا':'VOTE'}</div>
      <div class="prompt-card display">${LANG==='ar'?'مين الدخيل؟':'Who was the odd one out?'}</div>
      <div id="statusRow" class="status-row"></div>`);
    // v113 — nobody can vote for themselves. Uses the same playerExcludes
    // mechanism Bluff already relies on (each pid maps to the option id
    // they're not allowed to pick); main.js resolves it into excludeId for
    // both phones and the host's own overlay automatically.
    const _biExcludeMap = {};
    pids.forEach(pid => { _biExcludeMap[pid] = pid; });
    if (net.hostSelfPid) _biExcludeMap[net.hostSelfPid] = net.hostSelfPid;
    const votes = await collectWithTimer({ type:'choice', title:LANG==='ar'?'مين الدخيل؟':'Who was the odd one out?', options:players.map(p=>({id:p.pid,label:`${p.emoji} ${p.name}`,color:p.color})), playerExcludes:_biExcludeMap, seconds:30 }, pids, 30);
    const tally = {};
    pids.forEach(pid => { const v = val(votes, pid); if (v && v !== pid) tally[v] = (tally[v]||0)+1; });
    const maxV = Math.max(0, ...Object.values(tally));
    const accused = Object.entries(tally).filter(([,c]) => c === maxV).map(([pid]) => pid);
    const caught = accused.includes(spy.pid);

    await FX.wipe();
    Audio_.sfx.reveal(); FX.burst(120);
    scene(`
      <div style="text-align:center;padding:3vmin 2vmin;display:flex;flex-direction:column;align-items:center;gap:1.5vmin">
        <!-- v116 — was "CAUGHT!"/"GOT AWAY!", which never actually said WHO
             won (Ali's feedback: it wasn't clear if that meant the agents
             won or the spy did). Now states the winner outright; the spy's
             own avatar/name/"was the odd one out" line right below is
             unchanged so the spy is still shown clearly either way. -->
        <div style="font-family:'Fredoka One',sans-serif;font-size:clamp(15px,2.6vmin,20px);color:${caught?'var(--green)':'var(--pink)'};letter-spacing:2px;text-transform:uppercase">${caught ? (LANG==='ar'?'🎉 فاز الفريق!':'🎉 AGENTS WIN!') : (LANG==='ar'?'🎭 فاز الجاسوس!':'🎭 SPY WINS!')}</div>
        <div style="position:relative;margin:1vmin;animation:wyrTrophyPop 0.7s 0.2s both cubic-bezier(0.34,1.56,0.64,1)">
          <div style="width:clamp(90px,14vmin,130px);height:clamp(90px,14vmin,130px);border-radius:50%;background:${spy.color};box-shadow:0 0 40px ${spy.color}88;display:flex;align-items:center;justify-content:center;font-size:clamp(46px,8vmin,72px)">${spy.emoji||'😊'}</div>
          <div style="position:absolute;inset:-4px;border-radius:50%;border:3px solid ${spy.color};animation:wyrRingPulse 1.5s ease-in-out infinite"></div>
        </div>
        <div style="font-family:'Fredoka One',sans-serif;font-size:clamp(28px,5.6vmin,56px);color:var(--text);line-height:1.15">${esc(spy.name)}</div>
        <div class="pick-sub">${LANG==='ar'?'كان يجاوب على سؤال ثاني':'was answering a different question'}</div>
        <!-- v115 — Ali wants the results moment to BE the vote breakdown
             (who voted for whom, caught or not) instead of a scoreless
             leaderboard. Added here since Blend In no longer shows the
             shared winnerScene() at all. -->
        <div class="tm-score-list" style="margin-top:1.5vmin">
          ${players.map((p,i) => {
            const votedFor = val(votes, p.pid);
            const votedForP = votedFor ? safeP(votedFor) : null;
            const gotItRight = votedFor === spy.pid;
            return `
            <div class="tm-score-row" style="animation-delay:${i*.08}s">
              <div class="tm-score-rank">${p.pid===spy.pid ? '🕵️' : (gotItRight?'✅':'❌')}</div>
              <div class="tm-score-avatar" style="background:${p.color}">${p.emoji}</div>
              <div class="tm-score-info">
                <div class="tm-score-name">${esc(p.name)}</div>
                <div class="tm-score-guess">${p.pid===spy.pid
                  ? (LANG==='ar'?'كان هو الدخيل':'was the odd one out')
                  : votedForP
                    ? (LANG==='ar'?`صوّت لـ ${esc(votedForP.name)}`:`voted for ${esc(votedForP.name)}`)
                    : (LANG==='ar'?'ما صوّت':'did not vote')}</div>
              </div>
            </div>`;
          }).join('')}
        </div>
        <div class="tm-score-list" style="margin-top:1vmin">
          ${rounds.map((r,i) => `
            <div class="tm-score-row" style="animation-delay:${(players.length+i)*.08}s">
              <div class="tm-score-info">
                <div class="tm-score-name" style="color:var(--green);font-size:clamp(12px,1.8vmin,15px)">${esc(r.pair.a)}</div>
                <div class="tm-score-guess" style="color:var(--pink)">${LANG==='ar'?'الدخيل شاف: ':'They saw: '}${esc(r.pair.b)}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>`);
    await waitNext(15, LANG==='ar'?'خلصنا':'Done');
  }

  // v115 — Blend In (and any future scoreless mode) skips the shared
  // winnerScene() crown/leaderboard entirely: with everyone tied at 0,
  // it's a meaningless screen (Ali's earlier "Final Results" screenshot).
  // This shows just the Play Again / Play Another Game buttons, since the
  // actual "results" for a scoreless mode already happened on Blend In's
  // own reveal (who voted for whom, caught or not).
  /* ================================================================
     MODE — HARFHUNT (category + letters pressure game)
     Design: docs/ali-harfhunt-spec (v120). Turn-based, one authoritative
     timer per turn, single failure ends the round, appeal/vote system lets
     the group overturn provisionally-accepted answers after the round ends.
  ================================================================ */
  const HARF_TURN_SECONDS = 15;
  const HARF_PENALTY = 100;
  const HARF_MIN_ROUNDS = 5;
  const HARF_MAX_ROUNDS = 8;
  // Q/X/Z (and Arabic's rarest word-starters) excluded — see Ali's spec:
  // "remove hard letters" so a round doesn't die to an unwinnable letter.
  const HARF_LETTERS_EN = 'ABCDEFGHIJKLMNOPRSTUVWY'.split('');
  const HARF_LETTERS_AR = 'ابتجحدرزسشصطعغفقكلمنهوي'.split('');
  const harfLetters = () => (LANG === 'ar' ? HARF_LETTERS_AR : HARF_LETTERS_EN).slice();

  // AI validation — deterministic structured verdict from the backend
  // (see backend/server.js: /api/harfhunt-validate). ANY failure — timeout,
  // network error, non-200 — resolves to 'uncertain' rather than 'invalid'.
  // This is deliberate: an infrastructure hiccup must never read as a player
  // mistake (spec section 63). 'uncertain' is accepted provisionally; the
  // group's own appeal/vote system is what settles genuinely borderline
  // answers, not an over-eager validator.
  async function validateHarfAnswer(category, letter, answer) {
    // Global lobby AI toggle (next to Add Bot) — OFF means every answer goes
    // straight to 'uncertain' (accepted provisionally, settled by the
    // group's own appeal/vote system if disputed).
    if (window.HYPOX_STATE && window.HYPOX_STATE.aiEnabled === false) return 'uncertain';
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch('https://hypox-ai-backend-production.up.railway.app/api/harfhunt-validate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, letter, answer, lang: LANG }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) { console.warn('[HarfHunt AI] backend responded but not OK:', res.status); return 'uncertain'; }
      const data = await res.json();
      const result = ['valid', 'invalid', 'uncertain'].includes(data?.result) ? data.result : 'uncertain';
      console.log('[HarfHunt AI] verdict:', result, '(category:', category, 'letter:', letter, 'answer:', answer + ')');
      return result;
    } catch (e) {
      console.warn('[HarfHunt AI] call failed — treating as uncertain (this is intentional, not a bug):', e.message);
      return 'uncertain';
    }
  }

  function harfLetterGrid(available, activeLetter) {
    const all = harfLetters();
    return `<div class="harf-tv-grid">${all.map(L => {
      const used = !available.includes(L);
      const active = L === activeLetter;
      return `<div class="harf-tv-letter${used ? ' used' : ''}${active ? ' active' : ''}">${L}</div>`;
    }).join('')}</div>`;
  }

  function harfTurnScene(category, currentP, available, history) {
    return `
      <div class="harf-stage">
        <div class="eyebrow">🔤 ${LANG === 'ar' ? 'هارف هنت' : 'HARFHUNT'}</div>
        <div class="harf-category display">${esc(category)}</div>
        <div class="harf-turn-who">
          ${avatarHTML(currentP, 'avatar')}
          <div class="harf-turn-name">${esc(currentP.name)}${LANG === 'ar' ? ' دورها' : "'s turn"}</div>
        </div>
        <div class="ring-timer harf-ring" id="ringTimer">
          <svg viewBox="0 0 100 100">
            <circle class="ring-bg" cx="50" cy="50" r="44"/>
            <circle class="ring-fg" id="timerFill" cx="50" cy="50" r="44"/>
          </svg>
          <div class="timer-num" id="timerNum"></div>
        </div>
        ${harfLetterGrid(available)}
        <div class="harf-hint">${LANG === 'ar' ? 'اضغط على حرف متاح وجاوب على الفئة' : 'Tap an available letter, then answer the category'}</div>
        ${history.length ? `<div class="harf-history">${history.slice(-4).map(h =>
          `<span class="harf-history-chip"><b>${esc(h.letter)}</b> ${esc(h.answer)}</span>`).join('')}</div>` : ''}
        <div id="statusRow" class="status-row"></div>
      </div>`;
  }

  function harfRevealScene(letter, answer, p) {
    return `
      <div class="harf-reveal">
        <div class="harf-reveal-letter">${esc(letter)}</div>
        <div class="harf-reveal-answer display">${esc(answer.toUpperCase())}</div>
        <div class="harf-reveal-by">${avatarHTML(p, 'avatar')}<span>${esc(p.name)}</span></div>
      </div>`;
  }

  function harfFailScene(p, beforeScore, reason) {
    const label = reason === 'timeout' ? (LANG === 'ar' ? "خلص الوقت" : "TIME'S UP")
      : reason === 'invalid' ? (LANG === 'ar' ? 'جواب غلط' : 'INVALID ANSWER')
      : reason === 'rejected' ? (LANG === 'ar' ? 'رفضه الفريق' : 'VOTED OUT')
      : (LANG === 'ar' ? 'حرف غلط' : 'WRONG LETTER');
    return `
      <div class="harf-fail">
        <div class="harf-fail-label">${label}</div>
        ${avatarHTML(p, 'avatar')}
        <div class="harf-fail-name">${esc(p.name)}</div>
        <div class="harf-fail-penalty">−${HARF_PENALTY}</div>
        <div class="harf-fail-roundover">${LANG === 'ar' ? 'خلصت الجولة' : 'ROUND OVER'}</div>
      </div>`;
  }

  /* Runs ONE round's turn loop for a given player order + fresh letters.
     Shared by both normal rounds and sudden-death rounds. Returns
     { failure, roundAnswers, usedAllLetters }. */
  async function runHarfTurnLoop(category, order, answerSeqRef) {
    let available = harfLetters();
    const roundAnswers = [];
    let failure = null;
    let turnIdx = 0;

    while (true) {
      if (available.length === 0) return { failure: null, roundAnswers, usedAllLetters: true };
      const currentP = order[turnIdx % order.length];
      turnIdx++;

      await FX.wipe();
      scene(harfTurnScene(category, currentP, available, roundAnswers));
      pushMirror({ headline: category, sub: `${currentP.name} ${LANG === 'ar' ? 'دورها' : "'s turn"}` });
      Audio_.sfx.tick();
      net.setState({
        phase: 'harf-turn', category, currentPid: currentP.pid, available: available.slice(),
        history: roundAnswers.map(a => ({ letter: a.letter, answer: a.answer, name: safeP(a.pid).name })),
      });

      const spec = { type: 'harfturn', title: LANG === 'ar' ? 'دورك' : 'YOUR TURN', context: category, letters: available.slice(), fullscreenInput: true, forceTimer: true };
      const inputs = await collectWithTimer(spec, [currentP.pid], HARF_TURN_SECONDS);
      const raw = val(inputs, currentP.pid);

      let letter = null, answerText = '';
      if (raw) {
        try { const parsed = JSON.parse(raw); letter = parsed.letter; answerText = String(parsed.answer || '').trim(); }
        catch (e) { /* malformed payload treated as no-answer below */ }
      }

      // Deterministic checks first (spec section 10): non-empty, letter still
      // valid this exact turn, submitted answer actually starts with it.
      if (!raw || !letter || !answerText) return { failure: { pid: currentP.pid, reason: 'timeout' }, roundAnswers, usedAllLetters: false };
      if (!available.includes(letter)) return { failure: { pid: currentP.pid, reason: 'wrongletter' }, roundAnswers, usedAllLetters: false };
      const upAnswer = answerText.normalize('NFKC');
      const startsRight = LANG === 'ar' ? upAnswer.startsWith(letter) : upAnswer.toUpperCase().startsWith(letter.toUpperCase());
      if (!startsRight) return { failure: { pid: currentP.pid, reason: 'wrongletter' }, roundAnswers, usedAllLetters: false };

      net.setState({ phase: 'validating', category });
      pushMirror({ headline: LANG === 'ar' ? '...نتأكد' : 'CHECKING...' });
      const verdict = await validateHarfAnswer(category, letter, answerText);
      if (verdict === 'invalid') return { failure: { pid: currentP.pid, reason: 'invalid' }, roundAnswers, usedAllLetters: false };

      // v131 — Ali's hybrid redesign, replacing v130's mandatory vote-on-
      // every-answer entirely. That was too slow: a 15-answer round would
      // add over a minute of pure voting, breaking the letter-board/turn-
      // timer momentum that makes the mode tense. This is the compromise:
      //
      //  1. Answer shows to everyone with a short CHALLENGE window. If
      //     nobody challenges, auto-accept immediately — no vote at all.
      //  2. Only if someone actually challenges does the group stop and
      //     hold a real ACCEPT/REJECT vote.
      //  3. Burden of proof is on the CHALLENGE, not the answer: majority
      //     REJECT is required to overturn it. Ties, "anything else", and
      //     partial turnout with no clear reject majority all mean the
      //     answer stands — the OPPOSITE default bias from v130's "silence
      //     = rejected", which Ali explicitly said was unfair.
      //
      // Challenger identity is never shown anywhere in this flow (Ali's
      // spec: "challenge identity stays anonymous").
      // v132 — real bug: `order` holds player OBJECTS (see `currentP =
      // order[turnIdx % order.length]` above), not pid strings. Comparing
      // one against currentP.pid (a string) never matched, so otherPids was
      // actually the full array of player objects, answerer included. Used
      // as Object.fromEntries keys below, each object got coerced to the
      // literal string "[object Object]" by JS — exactly the Firebase
      // error Ali hit ("invalid key ([object Object])").
      const otherPids = order.filter(p => p.pid !== currentP.pid).map(p => p.pid);
      let challenged = false;

      if (otherPids.length) {
        await FX.wipe();
        // v133 — CHALLENGE_WINDOW_SECONDS: 4 -> 7, per Ali's "give it more
        // time" (currently felt instant, not a real usable window). Also
        // added a live, visibly ticking countdown (harfCwT) — there was
        // previously no number on screen at all, just a static hint line,
        // so even with a real 4-7s window running correctly there was
        // nothing showing the player HOW long they had.
        const CHALLENGE_WINDOW_SECONDS = 7;
        scene(`
          <div class="harf-reveal">
            <div class="harf-reveal-letter">${esc(letter)}</div>
            <div class="harf-reveal-answer display">${esc(answerText.toUpperCase())}</div>
            <div class="harf-reveal-by">${avatarHTML(currentP, 'avatar')}<span>${esc(currentP.name)}</span></div>
            <div class="harf-challenge-hint">${LANG === 'ar' ? 'اعتراض على الجواب؟' : 'Disagree with this?'}</div>
            <div class="year-reveal" id="harfCwT" style="font-size:clamp(32px,6vmin,64px)!important">${CHALLENGE_WINDOW_SECONDS}</div>
          </div>`);
        pushMirror({ headline: `${letter} — ${answerText}`, sub: currentP.name });
        Audio_.sfx.correct(); FX.burst(40);
        // v138 — removed a dead net.setState({phase:'harf-challenge-window'})
        // call that used to sit here. Nothing anywhere ever read that phase
        // name; it was immediately overwritten by the very next setState
        // call below (phase:'input-split'), so it was a spurious extra
        // state write on every single challenge window — two Firebase
        // writes in quick succession instead of one, which is exactly the
        // kind of thing that can cause a premature/duplicate render on a
        // receiving device. Confirmed dead, not just suspected.

        const cwPhaseId = 'hcw' + Date.now();
        const cwDeadline = Date.now() + CHALLENGE_WINDOW_SECONDS * 1000;
        net.setState({ phase: 'input-split', phaseId: cwPhaseId, deadline: cwDeadline, targets: otherPids,
          specs: Object.fromEntries(otherPids.map(pid => [pid, { type: 'harfchallenge' }])) });

        let cwLeft = CHALLENGE_WINDOW_SECONDS;
        const cwInterval = setInterval(() => {
          cwLeft--;
          const el = $('#harfCwT');
          if (el) el.textContent = Math.max(0, cwLeft);
          if (cwLeft <= 0) clearInterval(cwInterval);
        }, 1000);

        // v133 — real bug: this fired on ANY submitted input, value
        // unchecked. A bot's fallback garbage submission (or literally
        // anything) was enough to force-finish the window almost
        // instantly — that's what turned a real 4s window into what Ali
        // saw as milliseconds. Only an actual 'challenge' should cut the
        // window short now.
        net.onEachInput((pid, v) => {
          if (v === 'challenge' && window.__hypoxForceCollect) window.__hypoxForceCollect();
        });
        const cwResult = await net.collect(cwPhaseId, { type: 'harfchallenge' }, otherPids, CHALLENGE_WINDOW_SECONDS);
        net.onEachInput(null);
        clearInterval(cwInterval);
        challenged = otherPids.some(pid => val(cwResult, pid) === 'challenge');
      }

      if (challenged) {
        Audio_.sfx.buzzer(); FX.shake();
        await FX.wipe();
        scene(`
          <div class="harf-appeal">
            <div class="eyebrow">${LANG === 'ar' ? '⚠️ اعتراض على الجواب' : '⚠️ ANSWER CHALLENGED'}</div>
            <div class="harf-appeal-cat">${esc(category)}</div>
            <div class="harf-appeal-letter">${esc(letter)}</div>
            <div class="harf-appeal-answer display">${esc(answerText.toUpperCase())}</div>
            <div class="harf-appeal-by">${avatarHTML(currentP, 'avatar')}<span>${esc(currentP.name)}</span></div>
            <div class="pick-sub">${LANG === 'ar' ? 'هل الجواب صح؟' : 'Does this answer count?'}</div>
          </div>`);
        pushMirror({ headline: LANG === 'ar' ? 'اعتراض!' : 'CHALLENGED!', sub: `${letter} — ${answerText}` });
        net.setState({ phase: 'appealVote', category, letter, answer: answerText, pid: currentP.pid, eligibleVoters: otherPids });

        // No timer pressure on the actual vote (Ali: "there isn't necessarily
        // a need for a timer during the actual vote") — net.collect already
        // resolves as soon as everyone targeted has voted; the 60s figure
        // here is purely a safety ceiling in case someone drops.
        const votes = await collectWithTimer({ type: 'harfvote', category, answerText: `${letter} — ${answerText.toUpperCase()}`, byName: currentP.name, fullscreenInput: true }, otherPids, 60);
        let accept = 0, reject = 0;
        for (const pid of otherPids) {
          const v = val(votes, pid);
          if (v === 'reject') reject++; else if (v === 'accept') accept++;
        }
        const rejected = reject > accept; // burden of proof is on the challenge
        if (rejected) return { failure: { pid: currentP.pid, reason: 'rejected' }, roundAnswers, usedAllLetters: false };

        // Challenged but the vote didn't overturn it — answer stands.
        await sleep(300);
        Audio_.sfx.correct();
        scene(`
          <div class="harf-appeal-result stands">
            <div class="harf-fail-label" style="color:var(--green,#34d399)">${LANG === 'ar' ? 'الجواب صح' : 'ANSWER STANDS'}</div>
          </div>`);
        await sleep(900);
      }

      // Accepted — either nobody challenged, or a challenge failed to
      // overturn it. The reveal itself already played before the challenge
      // window opened (or, if there were no other players to challenge,
      // play it now) — don't show it a second time.
      available = available.filter(L => L !== letter);
      answerSeqRef.n++;
      roundAnswers.push({ answerId: 'a' + answerSeqRef.n, pid: currentP.pid, letter, answer: answerText, order: roundAnswers.length });
      net.setState({ phase: 'answerReveal', category, letter, answer: answerText, pid: currentP.pid });
      if (!otherPids.length) {
        // Nobody else at the table (heads-up edge case) — no challenge
        // window ran above, so show the reveal here.
        Audio_.sfx.correct(); FX.burst(40);
        scene(harfRevealScene(letter, answerText, currentP));
        pushMirror({ headline: `${letter} — ${answerText}`, sub: currentP.name });
      }
      await sleep(700);
    }
  }


  /* Sudden death: fresh round, only tied players, no scoring — first
     failure removes that player from the tie-break; repeat until one
     remains. Spec section 55: "Do not deduct normal game score during
     sudden death. The tie-break determines the winner." */
  async function runHarfSuddenDeath(tiedPids, usedCategories, answerSeqRef) {
    let contenders = tiedPids.slice();
    while (contenders.length > 1) {
      const pool = (await Content.get('harfhunt', LANG, HARF_MAX_ROUNDS)).filter(c => !usedCategories.has(c));
      const category = (pool[0] || (await Content.get('harfhunt', LANG, 1))[0] || (LANG === 'ar' ? 'حيوانات' : 'Animals'));
      usedCategories.add(category);
      const order = shuffle(contenders.map(pid => safeP(pid)));

      await FX.wipe();
      scene(`
        <div class="harf-sudden-intro">
          <div class="eyebrow">⚡ ${LANG === 'ar' ? 'موت مفاجئ' : 'SUDDEN DEATH'}</div>
          <div class="mode-title display">${esc(category)}</div>
        </div>`);
      Audio_.sfx.versus();
      net.setState({ phase: 'suddenDeath', category, contenders });
      await sleep(1600);

      const { failure } = await runHarfTurnLoop(category, order, answerSeqRef);
      if (!failure) { contenders = contenders.slice(0, 1); break; } // exhausted letters with 2 left — treat as no clear loser, stop safely
      const p = safeP(failure.pid);
      Audio_.sfx.buzzer(); FX.shake();
      scene(harfFailScene(p, p.score, failure.reason));
      await sleep(1400);
      contenders = contenders.filter(pid => pid !== failure.pid);
    }
    return contenders[0];
  }

  async function harfFinalResults(usedCategories, answerSeqRef) {
    const sorted = players.slice().sort((a, b) => b.score - a.score);
    const topScore = sorted[0]?.score;
    const tied = sorted.filter(p => p.score === topScore).map(p => p.pid);

    let championPid = tied[0];
    if (tied.length > 1) {
      await FX.wipe();
      scene(`
        <div class="harf-tie">
          <div class="eyebrow display">${LANG === 'ar' ? 'تعادل' : 'TIE'}</div>
          ${tied.map(pid => { const p = safeP(pid); return `<div class="harf-tie-row">${avatarHTML(p, 'avatar')}<span>${esc(p.name)} — ${p.score}</span></div>`; }).join('')}
        </div>`);
      await sleep(1800);
      championPid = await runHarfSuddenDeath(tied, usedCategories, answerSeqRef);
    }

    await showScores(true);
    const champion = safeP(championPid);
    Audio_.sfx.crown(); Audio_.sfx.fanfare(); FX.burst(220, true);
    scene(`
      <div class="harf-final">
        <div class="eyebrow">🏆 ${LANG === 'ar' ? 'بطل هارف هنت' : 'HARFHUNT CHAMPION'}</div>
        <div class="harf-final-champ">${avatarHTML(champion, 'avatar')}<div class="mode-title display">${esc(champion.name)} — ${champion.score}</div></div>
        <div class="harf-final-rest">
          ${sorted.filter(p => p.pid !== championPid).map(p => `<div class="harf-final-row">${esc(p.name)} — ${p.score}</div>`).join('')}
        </div>
      </div>`);
    net.setState({ phase: 'finalResults', championPid, standings: sorted.map(p => ({ pid: p.pid, name: p.name, score: p.score })) });
    await waitNext();
  }

  async function playHarfhunt() {
    await modeTitleCard('harfhunt');
    const roundCount = Math.max(HARF_MIN_ROUNDS, Math.min(HARF_MAX_ROUNDS, players.length));
    const startScore = roundCount * 100;
    players.forEach(p => { p.score = startScore; net.updateScore(p.pid, startScore); });

    const categories = await Content.get('harfhunt', LANG, roundCount);
    if (!categories.length) {
      scene(`<div class="prompt-card display">🔤 ${LANG === 'ar' ? 'تعذّر تحميل الفئات' : 'Could not load categories'}</div>`);
      await waitNext(5); return;
    }
    const usedCategories = new Set(categories);
    const answerSeqRef = { n: 0 };

    for (let roundNum = 1; roundNum <= roundCount; roundNum++) {
      const category = categories[roundNum - 1];
      const order = shuffle(players.slice());

      await FX.wipe();
      setPill(`${LANG === 'ar' ? 'الجولة' : 'ROUND'} ${roundNum} ${t('of')} ${roundCount}`);
      scene(`
        <div class="harf-round-intro">
          <div class="eyebrow">🔤 HARFHUNT</div>
          <div class="mode-title display">${esc(category)}</div>
          <div class="harf-order-strip">${order.map(p => avatarHTML(p, 'avatar')).join('')}</div>
        </div>`);
      pushMirror({ headline: category, sub: LANG === 'ar' ? `الجولة ${roundNum}` : `Round ${roundNum}` });
      Audio_.sfx.whoosh();
      net.setState({ phase: 'roundIntro', round: roundNum, roundCount, category, order: order.map(p => p.pid) });
      await sleep(1800);

      const { failure, roundAnswers, usedAllLetters } = await runHarfTurnLoop(category, order, answerSeqRef);

      if (failure) {
        const p = safeP(failure.pid);
        const before = p.score;
        addScore(failure.pid, -HARF_PENALTY);
        Audio_.sfx.buzzer(); FX.shake();
        scene(harfFailScene(p, before, failure.reason));
        net.setState({ phase: 'roundFailed', round: roundNum, pid: failure.pid, reason: failure.reason });
        await sleep(1600);
      } else if (usedAllLetters) {
        Audio_.sfx.fanfare(); FX.burst(160, true);
        scene(`
          <div style="text-align:center;padding:4vmin 2vmin">
            <div style="font-size:clamp(40px,8vmin,64px)">🏆</div>
            <div class="lobby-title display">${LANG === 'ar' ? 'جولة مثالية!' : 'PERFECT ROUND!'}</div>
            <div class="pick-sub">${LANG === 'ar' ? 'محد غلط — كل الحروف انستخدمت' : 'Nobody failed — every letter got used'}</div>
          </div>`);
        net.setState({ phase: 'roundFailed', round: roundNum, perfect: true });
        await sleep(1800);
      }

      // v130 — runHarfAppeals() (batch review of the whole round after it
      // ends) removed. Every answer is now voted on live, right after it's
      // submitted, inside runHarfTurnLoop itself.

      if (roundNum < roundCount) await showScores();
    }

    await harfFinalResults(usedCategories, answerSeqRef);
  }

  const SCORELESS_MODES = new Set(['blendin']);

  async function scorelessEndScreen() {
    await FX.wipe();
    hideHost();
    setPill(LANG==='ar'?'خلصنا':'All Done');
    scene(`
      <div style="text-align:center;padding:3vmin 2vmin">
        <div style="font-size:clamp(40px,8vmin,64px);margin-bottom:1vmin">🎉</div>
        <div class="lobby-title display">${LANG==='ar'?'خلصت اللعبة!':'That\'s a wrap!'}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;margin-top:2vmin;align-items:center;">
        <button class="big-btn" id="againBtnSL" style="max-width:340px;width:100%">🔄 ${LANG==='ar'?'العب مرة ثانية':'Play Again'}</button>
        <button class="big-btn ghost" id="changeGameBtnSL" style="max-width:340px;width:100%">🎮 ${LANG==='ar'?'العب لعبة ثانية':'Play Another Game'}</button>
      </div>`);
    net.setState({ phase: 'session-end-scoreless' });
    return new Promise(resolve => {
      const againBtn = document.getElementById('againBtnSL');
      const changeGameBtn = document.getElementById('changeGameBtnSL');
      let settled = false;
      const choose = action => {
        if (settled) return;
        settled = true;
        window.__hypoxPlayAgain = action === 'again';
        resolve(action);
      };
      againBtn?.addEventListener('click', () => choose('again'), { once:true });
      changeGameBtn?.addEventListener('click', () => choose('change'), { once:true });
      // Poll for phone host choice (phones-only mode) — reuses the exact
      // same bridge winnerScene() uses (__hypoxWinnerChoice), since main.js
      // already knows how to set it and this runs in the same JS context
      // as the host's own phone in phones-only mode.
      const _poll = setInterval(() => {
        if (window.__hypoxWinnerChoice === 'again') {
          clearInterval(_poll); window.__hypoxWinnerChoice = null; choose('again');
        } else if (window.__hypoxWinnerChoice === 'change') {
          clearInterval(_poll); window.__hypoxWinnerChoice = null; choose('change');
        }
      }, 300);
    });
  }

  const MODES = { bluff: playBluff, wyr: playWyr, interrogation: playInterrogation, diss: playDiss, quiz: playQuiz, trivia: playQuiz, pinpoint: playPinpoint, emoji: playEmoji, year: playYear, mostlikely: playMostlikely, trueorlie: playTrueorlie, flaghunt: playFlaghunt, higherlow: playHigherlow, '2t1l': play2t1l, emojiplace: playEmojiplace, spy: playSpy, blendin: playBlendIn, busted: playBusted, harfhunt: playHarfhunt };

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
          // Unstick any in-flight collection (vote/write phase) that was
          // waiting on THIS pid specifically -- without this, the offline
          // watcher correctly detects and removes them, but the round
          // itself keeps waiting for a submission that will never come.
          // Scoped to only the removed pid: an unrelated spectator
          // disconnecting during e.g. a hot-seat round (where only one
          // target is actually answering) must not cut off that target's
          // still-pending answer just because someone else dropped.
          if (activeCollectionPids && activeCollectionPids.includes(pid) && window.__hypoxForceCollect) {
            window.__hypoxForceCollect();
          }
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
      const resultAction = SCORELESS_MODES.has(mode) ? await scorelessEndScreen() : await winnerScene();
      if(resultAction === 'again') {
        playAgain = true;
      }
    }
  }

  return { run, say, hideHost, avatarHTML, scene, setPill, stopSharedScreen };
})();
