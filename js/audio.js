/* SAHRA — audio engine v2: warm synth, master compression, procedural reverb.
   No audio files. All names kept from v1 so game code is untouched. */
const Audio_ = (() => {
  let AC = null, soundOn = true, musicTimer = null;
  let master = null, reverb = null, wet = null;

  function ac() {
    if (!AC) {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      // master chain: lowpass -> compressor -> gain -> out
      const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9500;
      const comp = AC.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 20; comp.ratio.value = 5;
      comp.attack.value = .004; comp.release.value = .18;
      const g = AC.createGain(); g.gain.value = .9;
      lp.connect(comp); comp.connect(g); g.connect(AC.destination);
      master = lp;
      // procedural reverb: 1.6s exponentially-decaying noise impulse
      reverb = AC.createConvolver();
      const len = Math.floor(AC.sampleRate * 1.6);
      const ir = AC.createBuffer(2, len, AC.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
      reverb.buffer = ir;
      wet = AC.createGain(); wet.gain.value = .16;
      reverb.connect(wet); wet.connect(master);
    }
    if (AC.state === 'suspended') AC.resume();
    return AC;
  }

  /* soft two-layer pluck: triangle + quiet sine an octave up, gentle envelope */
  function pluck(f, { t = 0, dur = .35, vol = .16, type = 'triangle', verb = .5, bend = 0 } = {}) {
    if (!soundOn) return;
    const c = ac(), when = c.currentTime + t;
    const g = c.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vol, when + .008);
    g.gain.exponentialRampToValueAtTime(.0001, when + dur);
    const o1 = c.createOscillator(); o1.type = type; o1.frequency.setValueAtTime(f, when);
    const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.setValueAtTime(f * 2.001, when);
    if (bend) { o1.frequency.exponentialRampToValueAtTime(Math.max(30, f + bend), when + dur * .8);
                o2.frequency.exponentialRampToValueAtTime(Math.max(60, (f + bend) * 2), when + dur * .8); }
    const g2 = c.createGain(); g2.gain.value = .35;
    o1.connect(g); o2.connect(g2); g2.connect(g);
    g.connect(master);
    if (verb) { const send = c.createGain(); send.gain.value = verb; g.connect(send); send.connect(reverb); }
    o1.start(when); o2.start(when);
    o1.stop(when + dur + .1); o2.stop(when + dur + .1);
  }

  function nz({ t = 0, dur = .2, vol = .15, freq = 1200, q = 1, type = 'bandpass', slide = 0 } = {}) {
    if (!soundOn) return;
    const c = ac(), when = c.currentTime + t;
    const buf = c.createBuffer(1, Math.max(1, c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, when); f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(60, freq + slide), when + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(.0001, when + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(when);
  }

  function kick(t = 0, vol = .5) {
    if (!soundOn) return;
    const c = ac(), when = c.currentTime + t;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(130, when);
    o.frequency.exponentialRampToValueAtTime(42, when + .13);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(.001, when + .16);
    o.connect(g); g.connect(master);
    o.start(when); o.stop(when + .2);
  }
  const hat = (t = 0, vol = .05) => nz({ t, dur: .035, vol, freq: 9000, type: 'highpass' });
  const snare = (t = 0, vol = .14) => { nz({ t, dur: .09, vol, freq: 1900, q: .8 }); pluck(210, { t, dur: .07, vol: vol * .5, verb: .2 }); };

  /* pentatonic sparkle helper */
  const PENTA = [523.25, 587.33, 659.25, 783.99, 880];

  const sfx = {
    blip: () => pluck(1250 + Math.random() * 350, { dur: .05, vol: .025, verb: .15 }),
    pop: () => pluck(340, { dur: .18, vol: .2, bend: 380, verb: .3 }),
    whoosh: () => nz({ dur: .45, vol: .12, freq: 2600, slide: -2200, q: .6 }),
    tick: () => pluck(1650, { dur: .05, vol: .07, verb: .1 }),
    tickLow: () => pluck(880, { dur: .08, vol: .12, verb: .1 }),
    submit: () => { pluck(659, { dur: .16, vol: .14 }); pluck(988, { t: .07, dur: .25, vol: .14 }); },
    buzzer: () => { pluck(196, { dur: .45, vol: .22, type: 'sawtooth', verb: .2 }); pluck(185, { dur: .45, vol: .16, type: 'sawtooth' }); kick(0, .35); },
    reveal: () => { [0, 1, 2, 3, 4].forEach(i => pluck(PENTA[i], { t: i * .06, dur: .5, vol: .13, verb: .8 })); },
    drum: () => { for (let i = 0; i < 16; i++) { const acc = 1 - i / 22; snare(i * (.1 - i * .0028), .05 + (i % 4 === 0 ? .05 : 0) * acc); } },
    fanfare: () => {
      const seq = [[523, 659, 784], [587, 740, 880], [659, 831, 988], [784, 988, 1175]];
      seq.forEach((chord, i) => { chord.forEach(f => pluck(f, { t: i * .17, dur: .5, vol: .09, verb: .7 })); kick(i * .17, .3); });
      [0, 1, 2, 3, 4].forEach(i => pluck(PENTA[i] * 2, { t: .68 + i * .05, dur: .4, vol: .07, verb: .9 }));
    },
    vote: () => pluck(PENTA[Math.floor(Math.random() * PENTA.length)], { dur: .22, vol: .12, verb: .4 }),
    sting: () => { pluck(392, { dur: .3, vol: .13 }); pluck(494, { t: .07, dur: .3, vol: .13 }); pluck(587, { t: .14, dur: .45, vol: .15, verb: .6 }); },
    wrong: () => { pluck(330, { dur: .3, vol: .16 }); pluck(311, { t: .16, dur: .5, vol: .16, verb: .3 }); },
    correct: () => { pluck(784, { dur: .18, vol: .15 }); pluck(1175, { t: .09, dur: .35, vol: .15, verb: .5 }); },
    versus: () => { kick(0, .6); nz({ t: .04, dur: .7, vol: .1, freq: 300, slide: 2400, q: 2 }); pluck(98, { dur: .6, vol: .2, type: 'sawtooth', verb: .3 }); },
    crown: () => { [0, 1, 2, 3, 4].forEach(i => pluck(PENTA[i], { t: i * .1, dur: .6, vol: .14, verb: .9 })); pluck(1046.5, { t: .55, dur: 1, vol: .16, verb: 1 }); },
  };

  /* ------- music: chord-progression sequencers, 8 steps/bar ------- */
  const CHORDS = {
    Am: [220, 261.6, 329.6], F: [174.6, 220, 261.6], C: [261.6, 329.6, 392], G: [196, 246.9, 293.7],
    Dm: [146.8, 220, 293.7], Bb: [233.1, 293.7, 349.2], Gm: [196, 233.1, 293.7], A: [220, 277.2, 329.6],
  };
  const LOOPS = {
    lobby:   { prog: ['C', 'Am', 'F', 'G'],  bpm: 96,  swing: .18, bright: 1 },
    tension: { prog: ['Dm', 'Bb', 'Gm', 'A'], bpm: 112, swing: 0,  bright: 0 },
    results: { prog: ['C', 'G', 'Am', 'F'],  bpm: 120, swing: .12, bright: 1 },
  };

  function startMusic(name = 'lobby') {
    stopMusic();
    const L = LOOPS[name] || LOOPS.lobby;
    const stepMs = 60000 / L.bpm / 2; // 8th notes
    let step = 0;
    musicTimer = setInterval(() => {
      if (!soundOn) return;
      const bar = Math.floor(step / 8) % 4;
      const beat8 = step % 8;
      const swing = (beat8 % 2 === 1) ? L.swing * stepMs / 1000 : 0;
      const chord = CHORDS[L.prog[bar]];
      if (beat8 === 0 || beat8 === 4) kick(swing, name === 'results' ? .34 : .26);
      if (beat8 === 4 && L.bright) snare(swing, .05);
      hat(swing, beat8 % 2 ? .028 : .045);
      if (beat8 === 0) chord.forEach(f => pluck(f / 2, { t: swing, dur: stepMs / 1000 * 3.4, vol: .05, verb: .25 }));
      if ([0, 3, 6].includes(beat8)) {
        const n = chord[(step * 7 + bar) % 3] * (L.bright && beat8 === 6 ? 2 : 1);
        pluck(n * 2, { t: swing, dur: .22, vol: .035, verb: .5 });
      }
      step++;
    }, stepMs);
  }
  function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }

  return {
    sfx, startMusic, stopMusic,
    unlock: () => ac(),
    toggle() { soundOn = !soundOn; if (!soundOn) stopMusic(); return soundOn; },
    get on() { return soundOn; },
  };
})();
