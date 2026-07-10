/* HYPOX — audio engine v3: pleasant warm tones, real music feel */
const Audio_ = (() => {
  let AC = null, soundOn = true, musicTimer = null;
  let master = null, compressor = null;

  function ac() {
    if (!AC) {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      compressor = AC.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 30;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      const gain = AC.createGain();
      gain.gain.value = 0.85;
      compressor.connect(gain);
      gain.connect(AC.destination);
      master = compressor;
    }
    if (AC.state === 'suspended') AC.resume();
    return AC;
  }

  // Soft sine pluck — clean, pleasant
  function pluck(freq, { t = 0, dur = 0.3, vol = 0.12, attack = 0.01 } = {}) {
    if (!soundOn) return;
    const c = ac(), when = c.currentTime + t;
    const o = c.createOscillator();
    const g = c.createGain();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = freq * 3;
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, when);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vol, when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(lp); lp.connect(g); g.connect(master);
    o.start(when); o.stop(when + dur + 0.05);
  }

  // Soft chord strum
  function chord(freqs, t = 0, dur = 0.6, vol = 0.07) {
    freqs.forEach((f, i) => pluck(f, { t: t + i * 0.04, dur, vol }));
  }

  // Warm kick
  function kick(t = 0, vol = 0.35) {
    if (!soundOn) return;
    const c = ac(), when = c.currentTime + t;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, when);
    o.frequency.exponentialRampToValueAtTime(40, when + 0.1);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.15);
    o.connect(g); g.connect(master);
    o.start(when); o.stop(when + 0.2);
  }

  // Soft hi-hat
  function hat(t = 0, vol = 0.03) {
    if (!soundOn) return;
    const c = ac(), when = c.currentTime + t;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.04), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 8000;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.04);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(when);
  }

  // Major pentatonic scale notes
  const PENTA = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3];

  const sfx = {
    // Button click — soft double pluck
    blip: () => { pluck(660, { dur: 0.1, vol: 0.06 }); pluck(880, { t: 0.06, dur: 0.12, vol: 0.05 }); },

    // Player joins — cheerful ascending
    pop: () => chord([523, 659, 784], 0, 0.5, 0.08),

    // Screen transition
    whoosh: () => { pluck(200, { dur: 0.25, vol: 0.08 }); pluck(400, { t: 0.08, dur: 0.2, vol: 0.06 }); pluck(600, { t: 0.15, dur: 0.15, vol: 0.05 }); },

    // Countdown tick
    tick: () => pluck(1047, { dur: 0.06, vol: 0.08, attack: 0.005 }),
    tickLow: () => pluck(784, { dur: 0.08, vol: 0.1, attack: 0.005 }),

    // Submit answer — satisfying
    submit: () => { pluck(523, { dur: 0.12, vol: 0.1 }); pluck(784, { t: 0.08, dur: 0.18, vol: 0.1 }); pluck(1047, { t: 0.16, dur: 0.22, vol: 0.09 }); },

    // Time up — gentle descending
    buzzer: () => { pluck(392, { dur: 0.2, vol: 0.12 }); pluck(330, { t: 0.12, dur: 0.2, vol: 0.11 }); pluck(262, { t: 0.24, dur: 0.3, vol: 0.1 }); kick(0, 0.2); },

    // Reveal — sparkle arpeggio
    reveal: () => PENTA.slice(0, 5).forEach((f, i) => pluck(f * 2, { t: i * 0.07, dur: 0.4, vol: 0.08 })),

    // Drum roll
    drum: () => { for (let i = 0; i < 8; i++) { kick(i * 0.08, 0.15 + (i === 7 ? 0.2 : 0)); hat(i * 0.08 + 0.04); } },

    // Fanfare — big win
    fanfare: () => {
      chord([523, 659, 784, 1047], 0, 0.8, 0.09);
      chord([587, 740, 880], 0.3, 0.7, 0.08);
      chord([659, 831, 988, 1319], 0.6, 1.0, 0.09);
      [0, 1, 2, 3, 4, 5].forEach(i => pluck(PENTA[i] * 2, { t: 0.9 + i * 0.06, dur: 0.5, vol: 0.06 }));
      kick(0, 0.3); kick(0.3, 0.25); kick(0.6, 0.35);
    },

    // Vote cast
    vote: () => pluck(PENTA[Math.floor(Math.random() * PENTA.length)], { dur: 0.2, vol: 0.09 }),

    // Mode sting
    sting: () => { chord([392, 494, 587], 0, 0.35, 0.08); pluck(784, { t: 0.2, dur: 0.4, vol: 0.1 }); },

    // Wrong answer
    wrong: () => { pluck(311, { dur: 0.25, vol: 0.1 }); pluck(277, { t: 0.15, dur: 0.3, vol: 0.09 }); },

    // Correct answer
    correct: () => { pluck(659, { dur: 0.15, vol: 0.1 }); pluck(880, { t: 0.1, dur: 0.2, vol: 0.1 }); pluck(1175, { t: 0.2, dur: 0.3, vol: 0.09 }); },

    // Versus
    versus: () => { kick(0, 0.5); chord([196, 247, 294], 0.05, 0.6, 0.1); pluck(392, { t: 0.3, dur: 0.4, vol: 0.12 }); },

    // Crown / winner
    crown: () => {
      [0, 1, 2, 3, 4, 5, 6, 7].forEach((i) => pluck(PENTA[i], { t: i * 0.08, dur: 0.6, vol: 0.09 }));
      chord([523, 659, 784, 1047], 0.65, 1.2, 0.1);
    },
  };

  // Music — chord progressions, gentle groove
  const MUSIC = {
    lobby: {
      chords: [[523,659,784],[440,554,659],[392,494,587],[349,440,523]],
      bpm: 90, bass: [130.8, 110, 98, 87.3],
    },
    tension: {
      chords: [[349,440,523],[311,392,466],[294,370,440],[277,349,415]],
      bpm: 105, bass: [87.3, 77.8, 73.4, 69.3],
    },
    results: {
      chords: [[523,659,784],[440,554,659],[523,659,784],[392,494,587]],
      bpm: 110, bass: [130.8, 110, 130.8, 98],
    },
  };

  function startMusic(name = 'lobby') {
    stopMusic();
    const M = MUSIC[name] || MUSIC.lobby;
    const stepMs = (60000 / M.bpm) * 2;
    let bar = 0;
    musicTimer = setInterval(() => {
      if (!soundOn) return;
      const c = M.chords[bar % M.chords.length];
      const b = M.bass[bar % M.bass.length];
      // bass note
      pluck(b, { dur: stepMs / 1000 * 1.8, vol: 0.06, attack: 0.02 });
      // chord voicing — arpeggiated softly
      c.forEach((f, i) => pluck(f, { t: i * 0.06, dur: stepMs / 1000 * 1.4, vol: 0.035 }));
      // kick on beats 1 and 3
      kick(0, 0.18);
      kick(stepMs / 2000, 0.12);
      // hats
      for (let h = 0; h < 4; h++) hat(h * stepMs / 4000, 0.025);
      bar++;
    }, stepMs);
  }

  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  return {
    sfx, startMusic, stopMusic,
    unlock: () => ac(),
    toggle() { soundOn = !soundOn; if (!soundOn) stopMusic(); return soundOn; },
    get on() { return soundOn; },
  };
})();
