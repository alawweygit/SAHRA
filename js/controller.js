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
      ta.rows = spec.numeric ? 1 : 3;
      ta.autocomplete = 'off';
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
        <div class="leaf-map" style="width:100%;height:64vh;min-height:340px;border-radius:16px;overflow:hidden;background:#0e1626;"></div>
        <div class="ctrl-sub" style="margin-top:6px">${typeof LANG!=='undefined'&&LANG==='ar'?'حرّك وكبّر الخريطة، واضغط لتحط دبوسك':'Pan & zoom, tap to drop your pin'}</div>`;
      wrap.appendChild(mapWrap);

      const btn = document.createElement('button');
      btn.className = 'big-btn ctrl-submit';
      btn.textContent = spec.submitLabel || (typeof LANG!=='undefined'&&LANG==='ar'?'ثبّت الدبوس':'LOCK IT IN');
      btn.disabled = true;
      wrap.appendChild(btn);

      let guess = null, marker = null;
      setTimeout(() => {
        try {
          const map = L.map(mapWrap.querySelector('.leaf-map'), {
            center: [22, 25], zoom: 2, minZoom: 2, maxZoom: 10,
            worldCopyJump: true, attributionControl: false,
          });
          L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
            subdomains: 'abcd', maxZoom: 10,
          }).addTo(map);
          map.on('click', e => {
            const lat = e.latlng.lat;
            const lon = ((e.latlng.lng + 180) % 360 + 360) % 360 - 180;
            if (marker) marker.setLatLng(e.latlng);
            else marker = L.circleMarker(e.latlng, { radius: 11, color: '#fff', weight: 3, fillColor: '#f472b6', fillOpacity: 1 }).addTo(map);
            guess = { lat, lon };
            btn.disabled = false;
            if (navigator.vibrate) navigator.vibrate(15);
          });
        } catch(err) { console.error('map init failed', err); }
      }, 60);

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
