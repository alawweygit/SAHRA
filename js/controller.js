/* HYPOX — controller renderers
   A "spec" describes what input we need. The same renderers power:
   1) remote phones (online mode)  2) the pass-and-play overlay (offline mode)

   Spec shapes:
   { type:'text',   title, sub?, placeholder?, maxLen? }
   { type:'choice', title, sub?, options:[{id,label,color?}] , context? }
   { type:'wait',   title, sub? }
*/

const Controller = (() => {

  function render(container, spec, onSubmit) {
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'ctrl-wrap';

    const title = document.createElement('div');
    title.className = 'ctrl-title display';
    title.textContent = spec.title || '';
    wrap.appendChild(title);

    if (spec.context) {
      const ctx = document.createElement('div');
      ctx.className = 'ctrl-context';
      ctx.textContent = spec.context;
      wrap.appendChild(ctx);
    }
    if (spec.sub) {
      const sub = document.createElement('div');
      sub.className = 'ctrl-sub';
      sub.textContent = spec.sub;
      wrap.appendChild(sub);
    }

    if (spec.type === 'text') {
      const ta = document.createElement('textarea');
      ta.className = 'ctrl-input';
      ta.placeholder = spec.placeholder || '…';
      ta.maxLength = spec.maxLen || 80;
      ta.rows = 3;
      ta.autocomplete = 'off';
      wrap.appendChild(ta);

      const count = document.createElement('div');
      count.className = 'ctrl-count';
      const updateCount = () => count.textContent = `${ta.value.length}/${ta.maxLength}`;
      ta.addEventListener('input', updateCount); updateCount();
      wrap.appendChild(count);

      const btn = document.createElement('button');
      btn.className = 'big-btn ctrl-submit';
      btn.textContent = t('submit');
      btn.addEventListener('click', () => {
        const v = ta.value.trim();
        if (!v) { ta.classList.add('shake'); setTimeout(() => ta.classList.remove('shake'), 500); return; }
        Audio_.sfx.submit();
        lock(wrap);
        onSubmit(v);
      });
      wrap.appendChild(btn);
      setTimeout(() => ta.focus(), 250);
    }

    else if (spec.type === 'choice') {
      const grid = document.createElement('div');
      grid.className = 'ctrl-choices';
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

    else { /* wait */
      const w = document.createElement('div');
      w.className = 'ctrl-waiting';
      w.innerHTML = `<div class="pulse-dot"></div><div class="pulse-dot"></div><div class="pulse-dot"></div>`;
      wrap.appendChild(w);
    }

    container.appendChild(wrap);
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
