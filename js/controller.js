/* HYPOX — controller renderers
   A "spec" describes what input we need. The same renderers power:
   1) remote phones (online mode)  2) the pass-and-play overlay (offline mode)

   Spec shapes:
   { type:'text',   title, sub?, placeholder?, maxLen? }
   { type:'choice', title, sub?, options:[{id,label,color?}] , context? }
   { type:'wait',   title, sub? }
*/

const Controller = (() => {

  // v102 — after an input renders, scroll it into view and flag that there
  // is content below, so the player never sits on a screen not realising
  // the input card exists further down.
  function scrollInputIntoView(wrap) {
    if (!wrap || !wrap.isConnected) return;
    const run = () => {
      try {
        const r = wrap.getBoundingClientRect();
        const vh = window.innerHeight || document.documentElement.clientHeight;
        // Only act when the card actually starts below the visible area.
        if (r.top > vh * 0.75) {
          // Do not smooth-scroll a newly rendered form. On iOS Safari a tap
          // made while that animation is still moving is consumed as a
          // scroll gesture, so the textarea often needs two or three taps
          // before the keyboard opens. An immediate reposition is stable
          // before the player can tap.
          wrap.scrollIntoView({ behavior: 'auto', block: 'center' });
        }
      } catch (e) { /* non-fatal: scrolling is a nicety, never break input */ }
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
  }

  // Make every shared text control claim focus on the first deliberate tap.
  // Pointer/touch start is still a direct user gesture on iOS, so it can
  // open the keyboard; the click fallback covers desktop and older browsers.
  function makeTextInputResponsive(input) {
    if (!input) return;
    const focusNow = () => {
      if (input.disabled || document.activeElement === input) return;
      try { input.focus({ preventScroll: true }); }
      catch (e) { input.focus(); }
    };
    // Focus at pointer-down, before iOS can reinterpret the gesture as a
    // scroll. The click fallback covers keyboards and older browsers.
    input.addEventListener('pointerdown', focusNow, { passive: true });
    input.addEventListener('touchstart', focusNow, { passive: true });
    input.addEventListener('click', focusNow);
  }

  function render(container, spec, onSubmit) {
    if (!container) return;
    if (typeof HypoxMaps !== 'undefined') HypoxMaps.destroyWithin(container);
    document.querySelectorAll('.hypox-map-overlay').forEach(overlay => {
      if (typeof HypoxMaps !== 'undefined') HypoxMaps.destroyWithin(overlay);
      overlay.remove();
    });
    const wrap = document.createElement('div');
    wrap.className = 'ctrl-wrap';
    if (spec.type === 'text' || spec.type === 'multitext') wrap.classList.add('ctrl-text-card');
    if (spec.type === 'choice' || spec.type === 'higherlow' || spec.type === 'wyr-multi') {
      wrap.classList.add('ctrl-choice-card');
    }
    if (spec.compactRebus) wrap.classList.add('rebus-controller');
    if (spec.controlsOnly) wrap.classList.add('ctrl-controls-only');

    // v110 — question now renders ABOVE the answer area, as the visual
    // headline, with the title demoted to a small label right above the
    // input. Was reversed: 'Your answer' rendered big and yellow as the
    // headline while the actual question sat below it in a small 13px gray
    // box — so on modes like Blend In, where the question IS the entire
    // task, players had to hunt for it in small print under a generic
    // heading. DOM order is unchanged (title element first) so nothing
    // downstream that references it by position breaks; the swap is CSS —
    // see .ctrl-context / .ctrl-title in style.css.
    if (!spec.controlsOnly) {
      const title = document.createElement('div');
      title.className = 'ctrl-title display';
      title.textContent = spec.title || '';
      wrap.appendChild(title);
    }

    if (spec.context) {
      const ctx = document.createElement('div');
      ctx.className = 'ctrl-context';
      ctx.textContent = spec.context;
      if (!spec.controlsOnly) wrap.appendChild(ctx);
    }
    // Translate button — only for players (not host, host has its own button)
    const _txCtx = spec.translateContext || spec.context;
    if(_txCtx && typeof LANG !== 'undefined' && LANG !== 'ar'){
      const txBtn = document.createElement('button');
      txBtn.textContent = '🌐 ترجم';
      txBtn.style.cssText = 'background:linear-gradient(135deg,rgba(167,139,250,0.15),rgba(96,165,250,0.15));border:1.5px solid rgba(167,139,250,0.4);border-radius:20px;color:var(--purple);font-size:13px;padding:6px 16px;cursor:pointer;margin-top:8px;margin-bottom:8px;font-family:Fredoka One,sans-serif;box-shadow:0 2px 12px rgba(167,139,250,0.2);display:block;';
      const txDiv = document.createElement('div');
      txDiv.style.cssText = 'font-weight:700;font-size:13px;color:var(--text2);background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:10px 14px;line-height:1.5;margin-top:6px;direction:rtl;text-align:right;display:none;';
      let txDone = false;
      txBtn.addEventListener('click', async () => {
        if(txDone){txDiv.style.display='none';txBtn.textContent='🌐 ترجم';txDone=false;return;}
        txBtn.textContent='...';
        try{
          const r=await fetch('https://hypox-ai-backend-production.up.railway.app/api/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:_txCtx,to:'ar'})});
          const d=await r.json();
          if(d.translation){txDiv.textContent=d.translation;txDiv.style.display='block';txBtn.textContent='🔤 English';txDone=true;}
          else txBtn.textContent='🌐 ترجم';
        }catch(e){txBtn.textContent='🌐 ترجم';}
      });
      // Insert translate button right below question card if in shared stage.
      // Only look there when THIS render has no visible context of its own
      // (spec.controlsOnly) — otherwise always attach to wrap, so the button
      // never lands inside a #phoneSharedStage clone that's currently hidden
      // (e.g. while this player is actively answering a choice/vote).
      const _qCard = spec.controlsOnly
        ? document.querySelector('#phoneSharedStage .ctrl-context, #phoneSharedStage .prompt-card')
        : null;
      if(_qCard){
        _qCard.parentNode.insertBefore(txBtn, _qCard.nextSibling);
        _qCard.parentNode.insertBefore(txDiv, txBtn.nextSibling);
      } else {
        wrap.appendChild(txBtn);
        wrap.appendChild(txDiv);
      }
    }

    if (!spec.controlsOnly && spec.sub) {
      const sub = document.createElement('div');
      sub.className = 'ctrl-sub';
      sub.textContent = spec.sub;
      wrap.appendChild(sub);
    }



    // v102 — 'multitext': several labelled fields on ONE card with a single
    // submit. Added for 2 Truths 1 Lie, which previously fired three
    // separate sequential input phases: the player couldn't see how many
    // answers were wanted, couldn't revise before committing (the whole
    // game is deciding WHICH of your three should be the lie), and any
    // hiccup in the phase hand-off left them stuck after answer one.
    // Submits a JSON array string; the host parses it back.
    if (spec.type === 'multitext') {
      wrap.classList.add('ctrl-multitext');
      const fields = Array.isArray(spec.fields) ? spec.fields : [];
      const tas = [];
      fields.forEach((f, i) => {
        const row = document.createElement('div');
        row.className = `ctrl-multitext-row ${f.lie ? 'is-lie' : 'is-truth'}`;
        const lab = document.createElement('div');
        lab.className = 'ctrl-multitext-label';
        lab.textContent = f.label || '';
        row.appendChild(lab);
        const ta = document.createElement('textarea');
        ta.className = 'ctrl-input ctrl-multitext-input';
        ta.placeholder = f.placeholder || '…';
        ta.maxLength = spec.maxLen || 80;
        ta.rows = 1;
        ta.autocomplete = 'off';
        makeTextInputResponsive(ta);
        ta.style.borderColor = f.lie ? 'var(--pink)' : 'var(--green)';
        ta.style.borderWidth = '2px';
        row.appendChild(ta);
        tas.push(ta);
        wrap.appendChild(row);
      });

      const count = document.createElement('div');
      count.className = 'ctrl-count';
      wrap.appendChild(count);

      const btn = document.createElement('button');
      btn.className = 'big-btn ctrl-submit';
      wrap.appendChild(btn);

      const filled = () => tas.filter(x => x.value.trim()).length;
      const refresh = () => {
        const n = filled();
        const all = n === tas.length;
        count.textContent = LANG==='ar' ? `${n} من ${tas.length} تعبّت` : `${n} of ${tas.length} filled`;
        btn.disabled = !all;
        btn.style.opacity = all ? '1' : '.5';
        btn.textContent = all ? t('submit') : (LANG==='ar' ? `عبّي ${tas.length} عشان ترسل` : `Fill all ${tas.length} to send`);
      };
      tas.forEach(ta => ta.addEventListener('input', refresh));
      refresh();

      let submitting = false;
      btn.addEventListener('click', async () => {
        if (submitting) return;
        const vals = tas.map(x => x.value.trim());
        const emptyIdx = vals.findIndex(v => !v);
        if (emptyIdx !== -1) {
          tas[emptyIdx].classList.add('shake');
          setTimeout(() => tas[emptyIdx].classList.remove('shake'), 500);
          tas[emptyIdx].focus();
          return;
        }
        submitting = true;
        btn.disabled = true;
        wrap.setAttribute('aria-busy', 'true');
        try {
          await onSubmit(JSON.stringify(vals));
        } catch (e) {
          submitting = false;
          btn.disabled = false;
          wrap.removeAttribute('aria-busy');
          refresh();
        }
      });
      // NOTE: must attach here rather than `return`-ing — render()'s single
      // container.replaceChildren(wrap) lives at the end of the function, so
      // an early return would render nothing at all.
      container.replaceChildren(wrap);
      scrollInputIntoView(wrap);
      return;
    }

    // HarfHunt turn: pick an available letter, then answer with it — both
    // steps live under ONE authoritative deadline (net.setState's `deadline`
    // set by collectWithTimer covers letter-pick + typing combined). Locking
    // the letter once chosen is deliberate per design: no re-picking while
    // the clock runs. Submits a single JSON payload {letter, answer}.
    if (spec.type === 'harfturn') {
      wrap.classList.add('ctrl-harfturn');
      // v135 — the ring timer v134 fixed lives on the shared stage, but
      // this fullscreenInput panel takes over the ENTIRE phone screen and
      // covers that stage completely — so the countdown was still
      // invisible to players even after v134, just for a different reason
      // (wrong screen, not "never built"). This panel needs its own.
      if (spec.deadline) {
        const cd = document.createElement('div');
        cd.className = 'harf-turn-countdown';
        wrap.appendChild(cd);
        const tick = () => {
          const left = Math.max(0, Math.ceil((spec.deadline - Date.now()) / 1000));
          cd.textContent = left;
          cd.classList.toggle('danger', left <= 5 && left > 0);
        };
        tick();
        const cdInterval = setInterval(() => {
          tick();
          if (spec.deadline - Date.now() <= 0) clearInterval(cdInterval);
        }, 1000);
      }
      const pickHint = document.createElement('div');
      pickHint.className = 'harf-pick-hint';
      pickHint.textContent = LANG === 'ar' ? 'اضغط على حرف متاح' : 'Tap an available letter';
      wrap.appendChild(pickHint);
      const grid = document.createElement('div');
      grid.className = 'harf-letter-grid';
      const letters = Array.isArray(spec.letters) ? spec.letters : [];
      let chosen = null;

      const stage2 = document.createElement('div');
      stage2.className = 'harf-answer-stage';
      const bigLetter = document.createElement('div');
      bigLetter.className = 'harf-big-letter';
      const ansLabel = document.createElement('div');
      ansLabel.className = 'harf-answer-label';
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'ctrl-input harf-answer-input';
      input.maxLength = spec.maxLen || 30;
      input.autocomplete = 'off';
      input.placeholder = LANG === 'ar' ? '…اكتب جوابك' : 'Type your answer…';
      const btn = document.createElement('button');
      btn.className = 'big-btn ctrl-submit';
      btn.textContent = t('submit');
      btn.disabled = true;
      stage2.append(bigLetter, ansLabel, input, btn);

      letters.forEach(L => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'harf-letter-btn';
        b.textContent = L;
        b.addEventListener('click', () => {
          if (chosen) return; // v120 — locked once picked, no re-choosing mid-turn
          chosen = L;
          Audio_.sfx.vote && Audio_.sfx.vote();
          grid.classList.add('harf-grid-locked');
          [...grid.querySelectorAll('.harf-letter-btn')].forEach(x => x.disabled = true);
          b.classList.add('picked');
          // v132 — was just dimming the grid (opacity .3, still full height
          // on screen). The grid staying at full size, THEN stage2 (answer
          // box) appended below it, THEN the keyboard opening on top of all
          // of that, meant the real answer input needed a very precise
          // scroll to end up visible — v129's scrollIntoView fix wasn't
          // reliably winning that race. Hiding the grid outright once a
          // letter's picked (it's inactive anyway) shrinks the page enough
          // that the answer box sits near the top with much less scrolling
          // needed, so it's far less dependent on scroll-timing working
          // perfectly against the keyboard's own animation.
          grid.style.display = 'none';
          pickHint.style.display = 'none';
          bigLetter.textContent = L;
          ansLabel.textContent = (LANG === 'ar' ? 'جاوب بحرف ' : 'Answer with ') + L;
          stage2.classList.add('shown');
          requestAnimationFrame(() => {
            input.focus();
            // v129 — the earlier scrollInputIntoView(wrap) call runs once,
            // right when the letter grid first renders — before stage2 (the
            // answer box) exists. Picking a letter reveals stage2 further
            // down AND pops the keyboard at the same time, which together
            // pushed the actual answer box out of view: the player saw the
            // keyboard's own toolbar with no visible app input, and only
            // noticed the real (correctly pink-bordered, focused) box after
            // typing triggered the browser's own scroll correction. Give the
            // keyboard time to finish animating in, then explicitly bring
            // the real input into view.
            setTimeout(() => input.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350);
          });
        });
        grid.appendChild(b);
      });

      input.addEventListener('input', () => { btn.disabled = !input.value.trim(); });

      let submitting = false;
      const doSubmit = async () => {
        if (submitting || !chosen) return;
        const v = input.value.trim();
        if (!v) { input.classList.add('shake'); setTimeout(() => input.classList.remove('shake'), 400); return; }
        submitting = true;
        btn.disabled = true; input.disabled = true;
        wrap.setAttribute('aria-busy', 'true');
        try { await onSubmit(JSON.stringify({ letter: chosen, answer: v })); }
        catch (e) { submitting = false; btn.disabled = false; input.disabled = false; wrap.removeAttribute('aria-busy'); }
      };
      btn.addEventListener('click', doSubmit);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSubmit(); } });

      wrap.appendChild(grid);
      wrap.appendChild(stage2);
      container.replaceChildren(wrap);
      scrollInputIntoView(wrap);
      return;
    }

    // HarfHunt appeal review: everyone sees this round's accepted answers and
    // can toggle CHALLENGE on any that isn't their own, then hits DONE. No
    // countdown — collectWithTimer just gives this a generous window and
    // waits for every connected player to press Done (per spec: no rush).
    if (spec.type === 'harfreview') {
      wrap.classList.add('ctrl-harfreview');
      const heading = document.createElement('div');
      heading.className = 'harf-review-heading';
      heading.textContent = LANG === 'ar' ? 'راجع الجولة' : 'Review This Round';
      wrap.appendChild(heading);

      const list = document.createElement('div');
      list.className = 'harf-review-list';
      const answers = Array.isArray(spec.answers) ? spec.answers : [];
      const challenged = new Set();
      answers.forEach(a => {
        const card = document.createElement('div');
        card.className = 'harf-review-card';
        const letterEl = document.createElement('div');
        letterEl.className = 'harf-review-letter';
        letterEl.textContent = a.letter;
        const body = document.createElement('div');
        body.className = 'harf-review-body';
        const ansEl = document.createElement('div');
        ansEl.className = 'harf-review-answer';
        ansEl.textContent = a.answer;
        const nameEl = document.createElement('div');
        nameEl.className = 'harf-review-name';
        nameEl.textContent = a.name || '';
        body.append(ansEl, nameEl);
        card.append(letterEl, body);

        const isOwn = spec.viewerPid !== undefined && String(a.pid) === String(spec.viewerPid);
        if (!isOwn) {
          const chBtn = document.createElement('button');
          chBtn.className = 'harf-challenge-btn';
          chBtn.textContent = LANG === 'ar' ? 'اعتراض' : 'CHALLENGE';
          chBtn.addEventListener('click', () => {
            if (challenged.has(a.id)) { challenged.delete(a.id); chBtn.classList.remove('active'); }
            else { challenged.add(a.id); chBtn.classList.add('active'); Audio_.sfx.vote && Audio_.sfx.vote(); }
          });
          card.appendChild(chBtn);
        }
        list.appendChild(card);
      });
      wrap.appendChild(list);

      const doneBtn = document.createElement('button');
      doneBtn.className = 'big-btn ctrl-submit';
      doneBtn.textContent = LANG === 'ar' ? 'خلصت' : 'DONE';
      let submitting = false;
      doneBtn.addEventListener('click', async () => {
        if (submitting) return;
        submitting = true;
        doneBtn.disabled = true;
        try { await onSubmit(JSON.stringify([...challenged])); }
        catch (e) { submitting = false; doneBtn.disabled = false; }
      });
      wrap.appendChild(doneBtn);

      container.replaceChildren(wrap);
      scrollInputIntoView(wrap);
      return;
    }

    if (spec.type === 'harfvote') {
      wrap.classList.add('ctrl-harfvote');
      if (spec.category || spec.letter || spec.answer) {
        const ctx = document.createElement('div');
        ctx.className = 'harf-vote-context';
        ctx.innerHTML = `
          ${spec.category ? `<div class="harf-vote-cat">${esc(spec.category)}</div>` : ''}
          ${spec.answerText ? `<div class="harf-vote-answer">${esc(spec.answerText)}</div>` : ''}
          ${spec.byName ? `<div class="harf-vote-by">${esc(spec.byName)}</div>` : ''}
        `;
        wrap.appendChild(ctx);
      }
      const question = document.createElement('div');
      question.className = 'harf-vote-question';
      question.textContent = LANG === 'ar' ? 'هل توافق؟' : 'Do you agree?';
      wrap.appendChild(question);
      if (spec.deadline) {
        const countdown = document.createElement('div');
        countdown.className = 'harf-vote-countdown';
        const tick = () => {
          const left = Math.max(0, Math.ceil((spec.deadline - Date.now()) / 1000));
          countdown.textContent = left;
        };
        tick();
        const countdownInterval = setInterval(() => {
          tick();
          if (spec.deadline - Date.now() <= 0) clearInterval(countdownInterval);
        }, 1000);
        wrap.appendChild(countdown);
      }
      const row = document.createElement('div');
      row.className = 'harf-vote-row';
      const mk = (id, label, cls) => {
        const b = document.createElement('button');
        b.className = 'harf-vote-btn ' + cls;
        b.textContent = label;
        b.addEventListener('click', () => {
          Audio_.sfx.vote && Audio_.sfx.vote();
          [...row.querySelectorAll('.harf-vote-btn')].forEach(x => x.disabled = true);
          b.classList.add('picked');
          onSubmit(id);
        });
        return b;
      };
      row.appendChild(mk('accept', LANG === 'ar' ? 'نعم' : 'YES', 'harf-vote-accept'));
      row.appendChild(mk('reject', LANG === 'ar' ? 'لا' : 'NO', 'harf-vote-reject'));
      wrap.appendChild(row);
      container.replaceChildren(wrap);
      scrollInputIntoView(wrap);
      return;
    }

    if (spec.type === 'text') {
      const ta = document.createElement('textarea');
      ta.className = 'ctrl-input';
      ta.placeholder = spec.placeholder || '…';
      ta.maxLength = spec.maxLen || 80;
      ta.rows = (spec.numeric || spec.compactRebus) ? 1 : 3;
      ta.autocomplete = 'off';
      makeTextInputResponsive(ta);
      if (spec.numeric) {
        ta.inputMode = 'numeric';
        ta.classList.add('ctrl-input-year');
        ta.placeholder = spec.placeholder || (typeof LANG !== 'undefined' && LANG === 'ar' ? 'مثال: ٢٠٠٧' : 'e.g. 2007');
        ta.addEventListener('input', () => { ta.value = ta.value.replace(/[^0-9٠-٩]/g, ''); });
      }
      wrap.appendChild(ta);

      const count = document.createElement('div');
      count.className = 'ctrl-count';
      const updateCount = () => count.textContent = `${ta.value.length}/${ta.maxLength}`;
      ta.addEventListener('input', updateCount); updateCount();
      wrap.appendChild(count);

      const btn = document.createElement('button');
      btn.className = 'big-btn ctrl-submit';
      btn.textContent = t('submit');
      let submitting = false;
      const showDuplicateHint = () => {
        let hint = wrap.querySelector('.dup-hint');
        if (!hint) {
          hint = document.createElement('div');
          hint.className = 'dup-hint';
          hint.style.cssText = 'color:var(--pink);font-size:13px;text-align:center;animation:shake .3s;margin-top:6px';
          wrap.appendChild(hint);
        }
        hint.style.color = 'var(--pink)';
        hint.textContent = LANG==='ar' ? '⚠️ هذه الإجابة موجودة — جرب إجابة ثانية!' : '⚠️ That answer is taken! Try another one.';
        ta.classList.add('shake');
        setTimeout(() => ta.classList.remove('shake'), 500);
        ta.focus(); ta.select();
      };
      const showTruthHint = points => {
        let hint = wrap.querySelector('.dup-hint');
        if (!hint) {
          hint = document.createElement('div');
          hint.className = 'dup-hint';
          hint.style.cssText = 'color:var(--green);font-size:13px;text-align:center;animation:shake .3s;margin-top:6px';
          wrap.appendChild(hint);
        }
        const score = Number(points) || 1000;
        hint.style.color = 'var(--green)';
        hint.textContent = LANG==='ar'
          ? `🎯 هذه هي الإجابة الصحيحة! ربحت +${score.toLocaleString()} نقطة. اكتب إجابة مزيفة ثانية.`
          : `🎯 That is the correct answer! You earned +${score.toLocaleString()} points. Now enter a different fake answer.`;
        ta.value = '';
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.classList.add('shake');
        setTimeout(() => ta.classList.remove('shake'), 500);
        ta.focus();
      };
      btn.addEventListener('click', async () => {
        if (submitting) return;
        const v = ta.value.trim();
        if (!v) { ta.classList.add('shake'); setTimeout(() => ta.classList.remove('shake'), 500); return; }
        // A broadcast list gives immediate feedback when available. The final
        // decision is still made atomically by submitInput on Firebase.
        if (spec.enforceUnique) {
          const taken = window._hypoxTakenAnswers || [];
          const normalized = s => String(s).normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase();
          if (taken.some(answer => normalized(answer) === normalized(v))) { showDuplicateHint(); return; }
        }
        // One-word validation (bluff mode)
        if (spec.oneWord && v.trim().split(/\s+/).length > 1) {
          wrap.querySelector('.oneword-hint')?.remove();
          const msg = document.createElement('div');
          msg.className = 'oneword-hint';
          msg.style.cssText = 'color:var(--pink);font-size:13px;text-align:center;animation:shake .3s;margin-top:6px';
          msg.textContent = LANG==='ar' ? '⚠️ كلمة واحدة فقط!' : '⚠️ One word only!';
          wrap.appendChild(msg);
          ta.classList.add('shake');
          setTimeout(() => ta.classList.remove('shake'), 500);
          return;
        }
        // If answerLen hint provided (emoji riddle), validate length
        if (spec.answerLen && v.replace(/\s/g,'').length !== spec.answerLen) {
          const msg = document.createElement('div');
          msg.style.cssText = 'color:var(--pink);font-size:13px;text-align:center;animation:shake .3s;margin-top:6px';
          msg.textContent = LANG==='ar' ? `الجواب ${spec.answerLen} حروف — حاول مرة ثانية!` : `Answer is ${spec.answerLen} letters — try again!`;
          // Remove previous hint if any
          wrap.querySelector('.len-hint')?.remove();
          msg.className = 'len-hint';
          wrap.appendChild(msg);
          ta.classList.add('shake');
          setTimeout(() => { ta.classList.remove('shake'); }, 500);
          return;
        }
        submitting = true;
        btn.disabled = true;
        wrap.setAttribute('aria-busy', 'true');
        try {
          const result = await onSubmit(v);
          if (result?.accepted === false && (result.reason === 'duplicate' || result.reason === 'truth')) {
            submitting = false;
            btn.disabled = false;
            wrap.removeAttribute('aria-busy');
            if (result.reason === 'truth') showTruthHint(result.points);
            else showDuplicateHint();
            return;
          }
          Audio_.sfx.submit();
          lock(wrap);
        } catch (error) {
          submitting = false;
          btn.disabled = false;
          wrap.removeAttribute('aria-busy');
          let hint = wrap.querySelector('.submit-hint');
          if (!hint) { hint = document.createElement('div'); hint.className = 'submit-hint'; hint.style.cssText = 'color:var(--pink);font-size:13px;text-align:center;margin-top:6px'; wrap.appendChild(hint); }
          hint.textContent = LANG==='ar' ? 'تعذر الإرسال — حاول مرة ثانية.' : 'Could not submit — please try again.';
        }
      });
      wrap.appendChild(btn);
      // No auto-focus here on purpose: focusing immediately pops the
      // keyboard, and iOS Safari's native "scroll focused input into
      // view" behavior then scrolls the question/statement above the
      // input out of view before the player has even read it — they'd
      // have to manually scroll back up to see what they're guessing
      // the year for. Let them tap the field themselves when ready.
    }

    else if (spec.type === 'higherlow') {
      // Question bold on top, reference number big yellow, then Higher/Lower buttons
      // Clear the generic title/context already added
      wrap.innerHTML = '';
      if (!spec.controlsOnly) {
        const q = document.createElement('div');
        q.className = 'ctrl-title display';
        q.style.cssText = 'font-size:clamp(16px,4vw,22px);margin-bottom:8px';
        q.textContent = spec.question || '';
        wrap.appendChild(q);
        const refBlock = document.createElement('div');
        refBlock.style.cssText = 'text-align:center;margin:8px 0 4px';
        refBlock.innerHTML = `<div style="font-size:11px;color:var(--text3);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">${spec.refLabel||'Reference'}</div><div style="font-family:'Fredoka One',sans-serif;font-size:clamp(32px,10vw,52px);color:var(--yellow);line-height:1">${spec.ref||''}</div>`;
        wrap.appendChild(refBlock);
      }
      const grid = document.createElement('div');
      grid.className = 'ctrl-choices';
      grid.style.cssText = 'margin-top:16px';
      spec.options.forEach((o, i) => {
        const b = document.createElement('button');
        b.className = 'choice-btn';
        b.textContent = o.label;
        if (o.color) b.style.setProperty('--cb', o.color);
        b.style.animationDelay = (i * .07) + 's';
        b.addEventListener('click', () => {
          Audio_.sfx.vote();
          b.classList.add('picked');
          lock(wrap);
          onSubmit(o.id);
        });
        grid.appendChild(b);
      });
      wrap.appendChild(grid);
    }

    else if (spec.type === 'wyr-multi') {
      // 3 questions shown at once — player answers all then submits
      wrap.innerHTML = '';
      const isTarget = spec.targetPid && typeof myPid !== 'undefined' && myPid === spec.targetPid;
      const header = document.createElement('div');
      header.style.cssText = 'font-family:Fredoka One,sans-serif;font-size:clamp(13px,3.5vw,16px);color:var(--yellow);text-align:center;margin-bottom:10px;letter-spacing:0.5px;';
      header.textContent = isTarget
        ? (typeof LANG!=='undefined'&&LANG==='ar' ? '🔥 أنت على الكرسي! جاوب عن نفسك' : '🔥 You\'re in the hot seat! Answer for yourself')
        : (typeof LANG!=='undefined'&&LANG==='ar' ? `شكثر تعرف ${spec.targetName}؟ توقع اختياره` : `How well do you know ${spec.targetName}? Predict their picks`);
      wrap.appendChild(header);

      const answers = new Array(spec.questions.length).fill(null);
      const btnStyle = (bg, fg) => `position:relative;flex:1;min-width:0;min-height:52px;padding:10px 8px;border-radius:14px;background:${bg};color:${fg};font-family:'Fredoka One',sans-serif;font-size:clamp(12px,3.2vw,15px);border:3px solid transparent;cursor:pointer;line-height:1.3;word-break:break-word;overflow-wrap:break-word;font-weight:700;transition:border-color 0.2s;`;

      spec.questions.forEach((Q, qi) => {
        const qWrap = document.createElement('div');
        qWrap.style.cssText = 'display:flex;gap:6px;align-items:stretch;margin-bottom:8px;';
        qWrap.innerHTML = `<button id="wm_${qi}_a" style="${btnStyle('#2de1fc','#000')}">${Q.a}</button><div style="font-family:'Fredoka One',sans-serif;font-size:14px;color:var(--text3);display:flex;align-items:center;padding:0 3px;flex-shrink:0">VS</div><button id="wm_${qi}_b" style="${btnStyle('#ff3d8a','#fff')}">${Q.b}</button>`;
        wrap.appendChild(qWrap);

        const pick = (v) => {
          answers[qi] = v;
          const btnA = document.getElementById(`wm_${qi}_a`);
          const btnB = document.getElementById(`wm_${qi}_b`);
          // Both buttons stay fully visible regardless of which was picked --
          // only the chosen one gets a border highlight + checkmark badge.
          // Dimming the unchosen one (previous behaviour) could read as "this
          // got hidden/disabled" rather than simply "not picked".
          [[btnA,'a'],[btnB,'b']].forEach(([btn,key])=>{
            if (!btn) return;
            btn.disabled = true;
            if (key === v) {
              btn.style.borderColor = '#fff';
              const badge = document.createElement('span');
              badge.textContent = '✓';
              badge.style.cssText = 'position:absolute;top:-8px;right:-8px;width:22px;height:22px;border-radius:50%;background:#fff;color:#111;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;box-shadow:0 2px 6px rgba(0,0,0,0.3);';
              btn.appendChild(badge);
            }
          });
          if (answers.every(a => a !== null)) {
            lock(wrap);
            onSubmit(answers.join(','));
          }
        };
        // Use setTimeout to ensure elements are in DOM
        setTimeout(() => {
          document.getElementById(`wm_${qi}_a`)?.addEventListener('click', () => { Audio_.sfx.vote(); pick('a'); }, { once: true });
          document.getElementById(`wm_${qi}_b`)?.addEventListener('click', () => { Audio_.sfx.vote(); pick('b'); }, { once: true });
        }, 0);
      });
    }

    else if (spec.type === 'choice') {
      const grid = document.createElement('div');
      grid.className = 'ctrl-choices' + (spec.gridClass ? ' ' + spec.gridClass : '');
      // A realtime state may be replayed and some game modes build their choices
      // dynamically. Keep one button per option id so a malformed/repeated list
      // can never turn into a second visible answer set.
      const seenOptionIds = new Set();
      const options = (Array.isArray(spec.options) ? spec.options : []).filter(o => {
        const key = String(o.id);
        if (seenOptionIds.has(key)) return false;
        seenOptionIds.add(key);
        // Hide player's own answer
        if (spec.excludeId !== undefined && String(o.id) === String(spec.excludeId)) return false;
        return true;
      });
      options.forEach((o, i) => {
        if (i > 0 && spec.gridClass === 'wyr-choices') {
          const vs = document.createElement('div');
          vs.className = 'wyr-vs';
          vs.textContent = 'VS';
          grid.appendChild(vs);
        }
        const b = document.createElement('button');
        b.className = 'choice-btn' + (o.btnClass ? ' ' + o.btnClass : '');
        b.textContent = o.label;
        if (o.color) b.style.setProperty('--cb', o.color);
        b.style.animationDelay = (i * .07) + 's';
        b.addEventListener('click', () => {
          Audio_.sfx.vote();
          b.classList.add('picked');
          lock(wrap);
          onSubmit(o.id);
        });
        grid.appendChild(b);
      });
      wrap.appendChild(grid);
    }

    else if (spec.type === 'map') {
      // Map handled below — skip the wait fallback
    }

    else { /* wait */
      const w = document.createElement('div');
      w.className = 'ctrl-waiting';
      w.innerHTML = `<div class="pulse-dot"></div><div class="pulse-dot"></div><div class="pulse-dot"></div>`;
      wrap.appendChild(w);
    }

    if (spec.type === 'map') {
      const mapWrap = document.createElement('div');
      mapWrap.className = 'ctrl-map';
      mapWrap.innerHTML = `
        <div class="leaf-map" style="width:100%;height:42vh;min-height:220px;max-height:380px;border-radius:16px;overflow:hidden;background:#a8d3f0;"></div>
        <div class="ctrl-sub" style="margin-top:6px">${typeof LANG!=='undefined'&&LANG==='ar'?'حرّك وكبّر الخريطة واضغط لتحط دبوسك 📍':'Pan & zoom, then tap to drop your pin 📍'}</div>`;
      wrap.appendChild(mapWrap);

      const btn = document.createElement('button');
      btn.className = 'big-btn ctrl-submit';
      btn.textContent = spec.submitLabel || (typeof LANG!=='undefined'&&LANG==='ar'?'ثبّت الدبوس':'LOCK IT IN');
      btn.disabled = true;
      wrap.appendChild(btn);

      let guess = null, marker = null;

      // Fullscreen overlay map
      const fsBtn = document.createElement('button');
      fsBtn.className = 'bar-btn map-fs-btn';
      fsBtn.textContent = typeof LANG!=='undefined'&&LANG==='ar' ? '⛶ خريطة كاملة' : '⛶ Full Map';
      fsBtn.style.cssText = 'margin-top:2px;font-size:13px;';
      mapWrap.appendChild(fsBtn);

      const pinHTML = '<div class="hypox-drop-pin">📍</div>';

      function initMap(el) {
        try {
          return HypoxMaps.create(el, {
            center: [22, 25], zoom: 1.8, minZoom: 1.2, maxZoom: 10,
            interactive: true, zoomControl: true, worldCopies: true,
          });
        } catch(e) {
          console.error('map init failed', e);
          el.innerHTML = `<div class="hypox-map-error">${typeof LANG!=='undefined'&&LANG==='ar'?'تعذّر تحميل الخريطة':'Could not load the map'}</div>`;
          return null;
        }
      }

      let mainMap = null;
      setTimeout(() => {
        mainMap = initMap(mapWrap.querySelector('.leaf-map'));
        if (!mainMap) return;
        // Size the WebGL canvas once the container has settled its final dimensions.
        setTimeout(() => { if (mainMap) mainMap.resize(); }, 150);
        mainMap.onClick(e => {
          const lat = e.latlng.lat;
          // Normalize longitude to [-180,180). The old formula was missing a
          // final %360, so wrapping could leave values like 362 instead of 2 —
          // distance math (sin/cos) doesn't care since it's periodic, but
          // The map renderer's marker projection does, so the pin rendered in the wrong
          // spot on the reveal map even though the recorded distance was correct.
          const lon = (((e.latlng.lng+180)%360)+360)%360-180;
          if (marker) { marker.setLatLng({ lat, lng: lon }); }
          else { marker = mainMap.addHtmlMarker([lat, lon], pinHTML, { anchor:'bottom' }); }
          guess = { lat, lon };
          btn.disabled = false;
          if (navigator.vibrate) navigator.vibrate(15);
        });
      }, 60);

      // Fullscreen map overlay
      fsBtn.addEventListener('click', () => {
        const ov = document.createElement('div');
        ov.className = 'hypox-map-overlay';
        ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#000;display:flex;flex-direction:column;';
        const closeBar = document.createElement('div');
        closeBar.className = 'map-fullscreen-bar';
        closeBar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:rgba(0,0,0,.7);color:#fff;font-family:Fredoka One,sans-serif;font-size:18px;';
        closeBar.innerHTML = `<span>${spec.title||''}</span>`;
        const closeBtn = document.createElement('button');
        closeBtn.className = 'map-fullscreen-confirm';
        const _lockLabel = spec.submitLabel || (typeof LANG!=='undefined'&&LANG==='ar'?'ثبّت الدبوس':'LOCK IT IN');
        closeBtn.textContent = _lockLabel;
        closeBtn.disabled = !guess;
        closeBtn.style.cssText = 'background:var(--pink,#f472b6);color:#fff;border:none;border-radius:50px;padding:8px 20px;font-size:15px;cursor:pointer;font-family:Fredoka One,sans-serif;';
        closeBtn.style.opacity = closeBtn.disabled ? '0.5' : '1';
        closeBar.appendChild(closeBtn);
        ov.appendChild(closeBar);
        const mapEl = document.createElement('div');
        mapEl.style.cssText = 'flex:1;';
        ov.appendChild(mapEl);
        document.body.appendChild(ov);
        let fsMarker = null;
        const fsMap = initMap(mapEl);
        if (guess && fsMap) {
          fsMap.setView([guess.lat, guess.lon], 4);
          fsMarker = fsMap.addHtmlMarker([guess.lat, guess.lon], pinHTML, { anchor:'bottom' });
        }
        if (fsMap) {
          fsMap.onClick(e => {
            const lat = e.latlng.lat;
            const lon = (((e.latlng.lng+180)%360)+360)%360-180;
            if (fsMarker) { fsMarker.setLatLng({ lat, lng: lon }); }
            else { fsMarker = fsMap.addHtmlMarker([lat, lon], pinHTML, { anchor:'bottom' }); }
            guess = { lat, lon };
            // sync to mini map
            if (marker && mainMap) { marker.setLatLng({ lat, lng: lon }); }
            else if (mainMap) { marker = mainMap.addHtmlMarker([lat, lon], pinHTML, { anchor:'bottom' }); }
            btn.disabled = false;
            closeBtn.disabled = false;
            closeBtn.style.opacity = '1';
            if (navigator.vibrate) navigator.vibrate(15);
          });
        }
        closeBtn.addEventListener('click', () => {
          if (!guess) return;
          btn.disabled = true;
          closeBtn.disabled = true;
          fsMap?.remove();
          document.body.removeChild(ov);
          onSubmit(JSON.stringify(guess));
        });
      });

      btn.addEventListener('click', () => {
        if (!guess) return;
        btn.disabled = true;
        onSubmit(JSON.stringify(guess));
      });
    }

    // Swap the complete controller atomically. This guarantees that repeated
    // Firebase snapshots replace the old question instead of appending another
    // copy while buttons remain wired to the current phase callback.
    container.replaceChildren(wrap);
    // v102 — bring the input into view. Players were landing on the stage
    // with the input card entirely below the fold and no indication it was
    // there, so they didn't know they were meant to do anything.
    scrollInputIntoView(wrap);
  }

  function lock(wrap) {
    wrap.querySelectorAll('button, textarea').forEach(el => el.disabled = true);
    const done = document.createElement('div');
    done.className = 'ctrl-done';
    done.textContent = '✓ ' + t('answered');
    wrap.appendChild(done);
  }

  function waitScreen(container, msg) {
    render(container, { type: 'wait', title: msg || t('waiting_others') }, () => { });
  }

  return { render, waitScreen };
})();
