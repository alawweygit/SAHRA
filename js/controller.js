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

      const pinIcon = typeof L !== 'undefined' ? L.divIcon({
        html: '<div style="font-size:32px;line-height:1;margin-left:-12px;margin-top:-32px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))">📍</div>',
        className: '', iconSize: [0, 0],
      }) : null;

      function initMap(el) {
        try {
          const m = L.map(el, {
            center: [22, 25], zoom: 2, minZoom: 2, maxZoom: 10,
            worldCopyJump: true, attributionControl: false, zoomSnap: 0.5,
          });
          L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
            subdomains: 'abcd', maxZoom: 10, keepBuffer: 6, updateWhenIdle: false,
          }).addTo(m);
          return m;
        } catch(e) { console.error('map init failed', e); return null; }
      }

      let mainMap = null;
      setTimeout(() => {
        mainMap = initMap(mapWrap.querySelector('.leaf-map'));
        if (!mainMap) return;
        mainMap.on('click', e => {
          const lat = e.latlng.lat;
          const lon = ((e.latlng.lng+180)%360+360)-180;
          if (marker) { marker.setLatLng(e.latlng); } 
          else { marker = L.marker(e.latlng, { icon: pinIcon }).addTo(mainMap); }
          guess = { lat, lon };
          btn.disabled = false;
          if (navigator.vibrate) navigator.vibrate(15);
        });
      }, 60);

      // Fullscreen map overlay
      fsBtn.addEventListener('click', () => {
        const ov = document.createElement('div');
        ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#000;display:flex;flex-direction:column;';
        const closeBar = document.createElement('div');
        closeBar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:rgba(0,0,0,.7);color:#fff;font-family:Fredoka One,sans-serif;font-size:18px;';
        closeBar.innerHTML = `<span>${spec.title||''}</span>`;
        const closeBtn = document.createElement('button');
        closeBtn.textContent = typeof LANG!=='undefined'&&LANG==='ar'?'✕ تأكيد':'✕ Confirm';
        closeBtn.style.cssText = 'background:var(--pink,#f472b6);color:#fff;border:none;border-radius:50px;padding:8px 20px;font-size:15px;cursor:pointer;font-family:Fredoka One,sans-serif;';
        closeBar.appendChild(closeBtn);
        ov.appendChild(closeBar);
        const mapEl = document.createElement('div');
        mapEl.style.cssText = 'flex:1;';
        ov.appendChild(mapEl);
        document.body.appendChild(ov);
        let fsMarker = null;
        const fsMap = initMap(mapEl);
        if (guess && fsMap) fsMap.setView([guess.lat, guess.lon], 4);
        if (fsMap) {
          fsMap.on('click', e => {
            const lat = e.latlng.lat;
            const lon = ((e.latlng.lng+180)%360+360)-180;
            if (fsMarker) { fsMarker.setLatLng(e.latlng); }
            else { fsMarker = L.marker(e.latlng, { icon: pinIcon }).addTo(fsMap); }
            guess = { lat, lon };
            // sync to mini map
            if (marker && mainMap) { marker.setLatLng(e.latlng); }
            else if (mainMap) { marker = L.marker(e.latlng, { icon: pinIcon }).addTo(mainMap); }
            btn.disabled = false;
            if (navigator.vibrate) navigator.vibrate(15);
          });
        }
        closeBtn.addEventListener('click', () => { document.body.removeChild(ov); });
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
