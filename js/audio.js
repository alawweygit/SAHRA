/* HYPOX — audio engine v4
   Real music: royalty-free tracks loaded from Pixabay CDN (free, no license needed).
   Falls back to synthesized tones if audio can't load.
   SFX: warm pluck synth (no harsh bleeps). */

const Audio_ = (() => {
  let AC = null, soundOn = true;
  let currentMusic = null, currentMusicName = null, musicGain = null;
  let master = null;

  // Royalty-free tracks from Pixabay (no license required)
  const TRACKS = {
    lobby: [
      'https://cdn.pixabay.com/audio/2023/10/30/audio_9971916c5a.mp3',
      'https://cdn.pixabay.com/audio/2024/01/16/audio_6e1e09d2c7.mp3',
    ],
    tension: [
      'https://cdn.pixabay.com/audio/2023/08/22/audio_d1718ab609.mp3',
    ],
    results: [
      'https://cdn.pixabay.com/audio/2023/04/18/audio_c5b6e4b9af.mp3',
    ],
    winner: [
      'https://cdn.pixabay.com/audio/2022/11/22/audio_fbc4b2c2f1.mp3',
    ],
  };

  function ac() {
    if (!AC) {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      const comp = AC.createDynamicsCompressor();
      comp.threshold.value = -22; comp.knee.value = 28;
      comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.22;
      const g = AC.createGain(); g.gain.value = 0.82;
      comp.connect(g); g.connect(AC.destination);
      master = comp;
      musicGain = AC.createGain(); musicGain.gain.value = 0.35;
      musicGain.connect(g);
    }
    if (AC.state === 'suspended') AC.resume();
    return AC;
  }

  /* ---- Soft pluck synth (fallback + SFX) ---- */
  function pluck(freq, { t=0, dur=0.3, vol=0.12, attack=0.01 }={}) {
    if (!soundOn) return;
    const c = ac(), when = c.currentTime + t;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(freq, when);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vol, when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(master);
    o.start(when); o.stop(when + dur + 0.05);
  }

  function chord(freqs, t=0, dur=0.6, vol=0.07) {
    freqs.forEach((f,i) => pluck(f, {t: t+i*0.04, dur, vol}));
  }

  function kick(t=0, vol=0.3) {
    if (!soundOn) return;
    const c = ac(), when = c.currentTime + t;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(110, when);
    o.frequency.exponentialRampToValueAtTime(38, when + 0.1);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.14);
    o.connect(g); g.connect(master);
    o.start(when); o.stop(when + 0.18);
  }

  const PENTA = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 659.3, 784.0];

  const sfx = {
    blip:    () => { pluck(660, {dur:0.08, vol:0.07}); pluck(880, {t:0.05, dur:0.1, vol:0.06}); },
    pop:     () => chord([523, 659, 784], 0, 0.5, 0.09),
    whoosh:  () => { [200,350,550].forEach((f,i) => pluck(f, {t:i*0.07, dur:0.22, vol:0.07})); },
    tick:    () => pluck(1047, {dur:0.06, vol:0.07, attack:0.004}),
    tickLow: () => pluck(784, {dur:0.08, vol:0.1, attack:0.004}),
    submit:  () => { pluck(523,{dur:0.1,vol:0.1}); pluck(784,{t:0.07,dur:0.16,vol:0.1}); pluck(1047,{t:0.14,dur:0.2,vol:0.09}); },
    buzzer:  () => { [392,330,262].forEach((f,i) => pluck(f,{t:i*0.11,dur:0.2,vol:0.11})); kick(0, 0.18); },
    reveal:  () => PENTA.slice(0,6).forEach((f,i) => pluck(f*2, {t:i*0.06, dur:0.4, vol:0.08})),
    drum:    () => { for(let i=0;i<8;i++) kick(i*0.07, 0.12+(i===7?0.18:0)); },
    fanfare: () => {
      [[523,659,784,1047],[587,740,880],[659,831,988,1319]].forEach((ch,i) => chord(ch, i*0.28, 0.75, 0.09));
      PENTA.slice(0,6).forEach((f,i) => pluck(f*2, {t:0.85+i*0.06, dur:0.5, vol:0.07}));
      [0,0.28,0.56].forEach(t => kick(t, 0.25));
    },
    vote:    () => pluck(PENTA[Math.floor(Math.random()*PENTA.length)], {dur:0.2, vol:0.09}),
    sting:   () => { chord([392,494,587], 0, 0.32, 0.08); pluck(784, {t:0.18, dur:0.38, vol:0.1}); },
    wrong:   () => { pluck(311,{dur:0.24,vol:0.1}); pluck(262,{t:0.14,dur:0.28,vol:0.09}); },
    correct: () => { pluck(659,{dur:0.13,vol:0.1}); pluck(880,{t:0.09,dur:0.18,vol:0.1}); pluck(1175,{t:0.18,dur:0.28,vol:0.09}); },
    versus:  () => { kick(0, 0.45); chord([196,247,294], 0.04, 0.55, 0.1); pluck(392,{t:0.28,dur:0.4,vol:0.12}); },
    crown:   () => { PENTA.slice(0,8).forEach((f,i) => pluck(f,{t:i*0.07,dur:0.55,vol:0.09})); chord([523,659,784,1047],0.6,1.1,0.1); },
  };

  /* ---- Real music via Audio elements ---- */
  function stopMusic() {
    if (currentMusic) {
      try { currentMusic.pause(); currentMusic.currentTime = 0; } catch(e) {}
      currentMusic = null; currentMusicName = null;
    }
  }

  function startMusic(name='lobby') {
    if (currentMusicName === name) return; // already playing
    stopMusic();
    if (!soundOn) return;

    const pool = TRACKS[name] || TRACKS.lobby;
    const url = pool[Math.floor(Math.random() * pool.length)];

    const audio = new Audio();
    audio.loop = true;
    audio.volume = 0.28;
    audio.src = url;

    // Connect to Web Audio for consistent volume management
    try {
      ac();
      const src = AC.createMediaElementSource(audio);
      const g = AC.createGain(); g.gain.value = 1;
      src.connect(g); g.connect(musicGain);
    } catch(e) {
      // fallback: just play normally
    }

    // Resume AudioContext if suspended (iOS requirement)
    if (AC && AC.state === 'suspended') AC.resume().catch(()=>{});
    const playPromise = audio.play();
    if (playPromise) {
      playPromise.catch(() => {
        // Autoplay blocked — play on next user interaction (iOS needs touchstart)
        const resume = () => {
          if (AC && AC.state === 'suspended') AC.resume();
          audio.play().catch(()=>{});
          document.removeEventListener('click', resume);
          document.removeEventListener('touchstart', resume);
        };
        document.addEventListener('click', resume, { once: true });
        document.addEventListener('touchstart', resume, { once: true });
      });
    }

    currentMusic = audio;
    currentMusicName = name;
  }

  return {
    sfx, startMusic, stopMusic,
    unlock: () => { ac(); if (currentMusic) currentMusic.play().catch(()=>{}); },
    toggle() {
      soundOn = !soundOn;
      if (!soundOn) { stopMusic(); }
      else if (currentMusicName) { startMusic(currentMusicName); }
      return soundOn;
    },
    get on() { return soundOn; },
    setVolume(v) { if (musicGain) musicGain.gain.value = v; },
  };
})();
