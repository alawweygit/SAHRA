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

    // Optional countdown timer
    if (spec.seconds) {
      const tm = document.createElement('div');
      tm.className = 'ctrl-timer display';
      let left = spec.seconds;
      tm.textContent = '⏱ ' + left;
      wrap.appendChild(tm);
      const iv = setInterval(() => {
        left--;
        if (left <= 0) { clearInterval(iv); tm.textContent = '⏱ 0'; }
        else tm.textContent = '⏱ ' + left;
        if (left <= 5) tm.classList.add('danger');
      }, 1000);
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

    if (spec.type === 'map') {
      const mapWrap = document.createElement('div');
      mapWrap.className = 'ctrl-map';
      mapWrap.innerHTML = `
        <svg viewBox="0 0 360 180" class="pin-map" style="width:100%;border-radius:12px;background:#0e2a47;touch-action:none;">
          <!-- rough continents -->
          <polygon points="18,30 60,22 95,30 88,60 60,78 40,96 30,120 20,90 12,60" fill="#1e4d2b" opacity="0.85"/>
          <polygon points="95,95 115,90 125,110 118,145 100,160 92,130" fill="#1e4d2b" opacity="0.85"/>
          <polygon points="150,28 185,22 205,35 200,55 175,60 158,48" fill="#1e4d2b" opacity="0.85"/>
          <polygon points="165,62 195,58 210,75 205,105 185,125 170,100 160,80" fill="#1e4d2b" opacity="0.85"/>
          <polygon points="205,25 260,18 300,28 310,55 285,70 250,65 220,50" fill="#1e4d2b" opacity="0.85"/>
          <polygon points="255,75 285,72 300,88 290,100 265,95" fill="#1e4d2b" opacity="0.85"/>
          <polygon points="295,115 325,110 338,125 328,140 305,138" fill="#1e4d2b" opacity="0.85"/>
          <line x1="0" y1="90" x2="360" y2="90" stroke="rgba(255,255,255,0.15)" stroke-dasharray="4 4"/>
          <circle id="pinDot" r="6" fill="#f472b6" stroke="#fff" stroke-width="2" style="display:none"/>
        </svg>
        <div class="ctrl-sub" style="margin-top:6px">${typeof LANG!=='undefined'&&LANG==='ar'?'اضغط على الخريطة لتحط دبوسك':'Tap the map to drop your pin'}</div>`;
      wrap.appendChild(mapWrap);

      const btn = document.createElement('button');
      btn.className = 'big-btn ctrl-submit';
      btn.textContent = spec.submitLabel || (typeof LANG!=='undefined'&&LANG==='ar'?'ثبّت الدبوس':'LOCK IT IN');
      btn.disabled = true;
      wrap.appendChild(btn);

      let guess = null;
      const svg = mapWrap.querySelector('svg');
      const dot = mapWrap.querySelector('#pinDot');
      svg.addEventListener('pointerdown', e => {
        const r = svg.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width * 360;
        const y = (e.clientY - r.top) / r.height * 180;
        dot.setAttribute('cx', x); dot.setAttribute('cy', y);
        dot.style.display = 'block';
        // convert to lat/lon (equirectangular)
        guess = { lon: (x / 360) * 360 - 180, lat: 90 - (y / 180) * 180 };
        btn.disabled = false;
      });
      btn.addEventListener('click', () => {
        if (!guess) return;
        btn.disabled = true;
        onSubmit(JSON.stringify(guess));
      });
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
