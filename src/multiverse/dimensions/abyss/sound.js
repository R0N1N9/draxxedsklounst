// THE DEEP — what it sounds like down here: everything muffled (low-passed, nothing above
// a few kHz but the bubbles), your own breath in the regulator, the thump and twang of a
// band-powered gun, the sonar's ping, whale song far off, and the kraken: a sub-bass you
// feel as it passes. The bed (the hush of the sea and the kraken's rumble) is built by
// hand and freed in dispose(); everything else is ctx.audio.
import { clamp } from '../../kit.js';

const n = null;
// A slow, wide bed in D dorian: pads that swell, a bass that breathes, a bell figure like
// light on the water, and a heartbeat kick.
const PAD = [50, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, 53, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, 48, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, 45, n, n, n, n, n, n, n, 47, n, n, n, n, n, n, n];
const MUSIC = {
  bpm: 66, gain: 0.3,
  tracks: [
    { type: 'triangle', gain: 0.13, decay: 3.6, cutoff: 900, notes: PAD },
    { type: 'sine', gain: 0.08, decay: 3.4, notes: PAD.map((v) => (v === null ? null : v + 7)) },
    { type: 'sine', gain: 0.07, decay: 3.2, notes: PAD.map((v) => (v === null ? null : v + 15)) },
    { type: 'sine', gain: 0.22, decay: 1.4, notes: [38, n, n, n, n, n, n, n, n, n, 38, n, n, n, n, n, 41, n, n, n, n, n, n, n, n, n, n, n, 40, n, n, n, 36, n, n, n, n, n, n, n, n, n, 36, n, n, n, n, n, 33, n, n, n, n, n, n, n, 35, n, n, n, n, n, n, n] },
    { type: 'sine', gain: 0.045, decay: 1.6, notes: [n, n, 74, n, n, n, 81, n, n, n, n, n, 77, n, n, n, n, n, n, n, 76, n, n, n, 72, n, n, n, n, n, n, n, n, n, 79, n, n, n, 76, n, n, n, n, n, 74, n, n, n, n, n, 72, n, n, n, 69, n, n, n, n, n, n, n, n, n] },
    { type: 'kick', gain: 0.16, decay: 0.3, notes: [1, n, n, 1, n, n, n, n, n, n, n, n, n, n, n, n] },
  ],
};
const SUDDEN = {
  bpm: 92, gain: 0.32,
  tracks: [
    { type: 'sawtooth', gain: 0.06, decay: 0.5, cutoff: 700, notes: [38, n, 38, n, 41, n, 38, n, 36, n, 38, n, 41, n, 43, n] },
    { type: 'sine', gain: 0.24, decay: 0.6, notes: [26, n, n, n, 26, n, n, n, 29, n, n, n, 24, n, n, n] },
    { type: 'kick', gain: 0.3, decay: 0.3, notes: [1, n, n, 1, n, n, n, n, 1, n, n, 1, n, n, n, n] },
    { type: 'noise', gain: 0.03, decay: 0.2, cutoff: 1200, notes: [n, n, 1, n, n, n, 1, n, n, n, 1, n, n, n, 1, n] },
  ],
};

export function makeSound(ctx) {
  const au = ctx.audio;
  const ear = { x: 0, y: 0, z: 0, rx: 1, rz: 0 };
  let bed = null, rumble = null, hushG = null, growl = null, swell = 0, level = 1, pan = 0, late = 0, whaleT = 6 + Math.random() * 8;
  function place(x, y, z, reach = 40) {
    const dx = x - ear.x, dy = y - ear.y, dz = z - ear.z, dist = Math.hypot(dx, dy, dz);
    pan = dist > 0.5 ? clamp(((dx * ear.rx + dz * ear.rz) / dist) * 0.7, -0.7, 0.7) : 0;
    level = 1 / (1 + dist / reach);
    late = Math.min(0.12, dist / 1500); // sound is fast in water: barely any lag
  }
  // the hush of the sea, and the kraken's voice: built by hand, so they can swell and fade
  function startBed() {
    const ac = au.ctx, out = au.out;
    if (bed || !ac || !out) return;
    try {
      const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
      let b = 0;
      for (let i = 0; i < len; i++) { b = b * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = b * 6; } // brown noise
      const nodes = [];
      // one hush (its swell is driven from update, not an LFO: the fewer live nodes the better
      // on a busy machine), and the kraken's voice: two low tones through one filter
      const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      src.buffer = buf; src.loop = true;
      f.type = 'lowpass'; f.frequency.value = 360; f.Q.value = 0.4;
      g.gain.value = 0; g.gain.setTargetAtTime(0.12, ac.currentTime, 1.5);
      src.connect(f); f.connect(g); g.connect(out);
      src.start();
      nodes.push(src, f, g);
      hushG = g;
      const o1 = ac.createOscillator(), o2 = ac.createOscillator(), rf = ac.createBiquadFilter(), rg = ac.createGain();
      o1.type = 'sine'; o1.frequency.value = 36;
      o2.type = 'sawtooth'; o2.frequency.value = 54.5;
      rf.type = 'lowpass'; rf.frequency.value = 150; rf.Q.value = 2.5;
      rg.gain.value = 0;
      o1.connect(rf); o2.connect(rf); rf.connect(rg); rg.connect(out);
      o1.start(); o2.start();
      nodes.push(o1, o2, rf, rg);
      growl = o2;
      rumble = rg;
      bed = nodes;
    } catch { bed = []; }
  }
  const bub = (g, f0, f1, dur, delay = 0) => au.noise({ filter: 'bandpass', freq: f0, freqEnd: f1, q: 1.2, dur, gain: g * level, attack: 0.01, pan, delay: late + delay });
  let rumbleAt = 0;

  return {
    ear,
    start() { startBed(); },
    music(sudden) { au.music(sudden ? SUDDEN : MUSIC); startBed(); },
    // per frame: the kraken's distance (m) and how fast it moves (for the swell of its voice)
    update(dt, krakenDist, pass) {
      if (!bed) startBed();
      const ac = au.ctx;
      if (rumble && ac && (rumbleAt -= dt) <= 0) {
        rumbleAt = 0.1;
        const g = clamp(1.4 / (1 + Math.max(0, krakenDist) / 14), 0, 1) * (0.5 + pass * 0.7);
        rumble.gain.setTargetAtTime(g * 0.6, ac.currentTime, 0.35);
        swell += 0.1;
        if (growl) growl.frequency.setTargetAtTime(54.5 + Math.sin(swell * 0.31) * 9, ac.currentTime, 0.4);
        if (hushG) hushG.gain.setTargetAtTime(0.12 + Math.sin(swell * 0.5) * 0.04, ac.currentTime, 0.8);
      }
      if ((whaleT -= dt) <= 0) {
        whaleT = 14 + Math.random() * 16;
        // a whale, very far off: a long falling moan, then an answer
        const f = 180 + Math.random() * 120, p = (Math.random() - 0.5) * 1.4;
        au.tone({ freq: f, freqEnd: f * 0.55, type: 'sine', dur: 3.2, gain: 0.05, attack: 0.9, pan: p });
        au.tone({ freq: f * 1.5, freqEnd: f * 1.9, type: 'sine', dur: 2.2, gain: 0.025, attack: 0.7, pan: p, delay: 2.6 });
        au.tone({ freq: f * 0.7, freqEnd: f * 0.5, type: 'triangle', dur: 2.8, gain: 0.03, attack: 1, pan: -p, delay: 4.2 });
      }
    },
    inhale() { au.noise({ filter: 'bandpass', freq: 500, freqEnd: 1300, q: 0.7, dur: 0.9, gain: 0.07, attack: 0.35 }); au.noise({ filter: 'highpass', freq: 2500, dur: 0.6, gain: 0.02, attack: 0.3 }); },
    // breathing out through the regulator: a gurgle of bubbles
    exhale(x, y, z, mine, big) {
      place(x, y, z, 20);
      const g = (mine ? 1 : 0.6) * (big ? 1.5 : 1);
      for (let i = 0; i < (big ? 5 : 3); i++) bub(0.16 * g, 300 + Math.random() * 500, 900 + Math.random() * 900, 0.12 + Math.random() * 0.1, i * 0.07 + Math.random() * 0.03);
      au.noise({ filter: 'lowpass', freq: 500, freqEnd: 200, dur: 0.5 + (big ? 0.5 : 0), gain: 0.14 * g * level, attack: 0.03, pan, delay: late });
    },
    holdIn() { au.noise({ filter: 'bandpass', freq: 900, freqEnd: 400, q: 0.8, dur: 0.35, gain: 0.08, attack: 0.05 }); },
    heartbeat(k) { au.sfx('heartbeat', { gain: 0.25 + k * 0.4 }); },
    gasp() { au.noise({ filter: 'bandpass', freq: 700, freqEnd: 1800, q: 0.8, dur: 0.55, gain: 0.2, attack: 0.04 }); au.tone({ freq: 220, freqEnd: 120, type: 'triangle', dur: 0.3, gain: 0.08 }); },
    // the gun: a thump, the bands' twang, the spear hissing away
    fire(x, y, z, mine) {
      place(x, y, z, 45);
      const g = (mine ? 1 : 0.75) * level;
      au.noise({ filter: 'lowpass', freq: 1400, freqEnd: 150, q: 0.9, dur: 0.24, gain: 0.9 * g, attack: 0.001, pan, delay: late });
      au.tone({ freq: 140, freqEnd: 50, type: 'sine', dur: 0.22, gain: 0.45 * g, pan, delay: late });
      au.tone({ freq: 210, freqEnd: 160, type: 'sawtooth', dur: 0.32, gain: 0.07 * g, pan, delay: late + 0.005 }); // the bands
      au.tone({ freq: 330, freqEnd: 250, type: 'triangle', dur: 0.26, gain: 0.06 * g, pan, delay: late + 0.01 });
      au.noise({ filter: 'bandpass', freq: 1800, freqEnd: 600, q: 1.5, dur: 0.5, gain: 0.12 * g, attack: 0.02, pan, delay: late + 0.04 });
      if (mine) au.duck(0.4, 0.2);
    },
    click() { au.sfx('click', { gain: 0.4, pitch: 0.8 }); },
    dry() { au.sfx('click', { gain: 0.35, pitch: 1.8 }); },
    // the reload: the spear slides home, two bands stretched and hooked
    reload(len) {
      au.noise({ filter: 'bandpass', freq: 1300, freqEnd: 2600, q: 2, dur: 0.3, gain: 0.08, attack: 0.05, delay: 0.05 });
      au.sfx('click', { gain: 0.35, pitch: 1.1, delay: len * 0.38 });
      for (let i = 0; i < 2; i++) {
        const t = len * (0.48 + i * 0.27);
        au.tone({ freq: 120, freqEnd: 260, type: 'sawtooth', dur: 0.3, gain: 0.04, attack: 0.1, delay: t }); // rubber creaks as it stretches
        au.sfx('click', { gain: 0.5, pitch: 0.7 + i * 0.2, delay: t + 0.28 });
      }
    },
    loaded() { au.sfx('click', { gain: 0.55, pitch: 1.4 }); au.tone({ freq: 880, type: 'sine', dur: 0.12, gain: 0.03 }); },
    // a spear passing close by you: a hiss and a wash of bubbles
    whizz(side) { au.noise({ filter: 'bandpass', freq: 2200, freqEnd: 700, q: 1.4, dur: 0.4, gain: 0.35, attack: 0.02, pan: side }); bub(0.15, 800, 1600, 0.3); },
    thunk(x, y, z, surf) {
      place(x, y, z, 30);
      if (surf === 'wood') { au.sfx('thud', { gain: 0.6 * level, pitch: 1.2, pan, delay: late }); au.tone({ freq: 300, freqEnd: 180, type: 'triangle', dur: 0.12, gain: 0.1 * level, pan, delay: late }); }
      else if (surf === 'sand') au.noise({ filter: 'lowpass', freq: 600, freqEnd: 150, dur: 0.25, gain: 0.35 * level, pan, delay: late });
      else { au.tone({ freq: 1800, freqEnd: 1200, type: 'triangle', dur: 0.08, gain: 0.12 * level, pan, delay: late }); au.noise({ filter: 'bandpass', freq: 1500, freqEnd: 500, q: 1, dur: 0.2, gain: 0.3 * level, pan, delay: late }); }
    },
    // the spear finds its mark
    hit(x, y, z) {
      place(x, y, z, 80);
      au.sfx('thud', { gain: 1, pitch: 0.8 });
      au.noise({ filter: 'lowpass', freq: 900, freqEnd: 120, dur: 1.2, gain: 0.6, attack: 0.01 });
      au.tone({ freq: 90, freqEnd: 32, type: 'sine', dur: 1.4, gain: 0.5 });
      for (let i = 0; i < 6; i++) bub(0.25, 300 + Math.random() * 900, 1500 + Math.random() * 800, 0.2, 0.15 + i * 0.09);
      au.tone({ freq: 587, freqEnd: 580, type: 'sine', dur: 2.6, gain: 0.05, attack: 0.3, delay: 0.4 });
      au.tone({ freq: 880, freqEnd: 870, type: 'sine', dur: 2.6, gain: 0.035, attack: 0.4, delay: 0.55 });
    },
    // the kraken struck: a groan and the ink's rush
    krakenHit(x, y, z) {
      place(x, y, z, 90);
      au.tone({ freq: 70, freqEnd: 38, type: 'sawtooth', dur: 1.8, gain: 0.3 * level + 0.1, attack: 0.1 });
      au.tone({ freq: 140, freqEnd: 60, type: 'triangle', dur: 1.4, gain: 0.15 * level + 0.05, attack: 0.05 });
      au.noise({ filter: 'lowpass', freq: 700, freqEnd: 180, dur: 1.6, gain: 0.5 * level + 0.1, attack: 0.15, pan });
    },
    shove() {
      au.noise({ filter: 'lowpass', freq: 500, freqEnd: 100, dur: 0.7, gain: 0.7, attack: 0.01 });
      au.tone({ freq: 70, freqEnd: 35, type: 'sine', dur: 0.6, gain: 0.5 });
      for (let i = 0; i < 3; i++) bub(0.25, 400 + Math.random() * 600, 1300, 0.15, i * 0.08);
    },
    // sonar: a clean ping that rings out, and its echo
    ping(x, y, z, mine) {
      place(x, y, z, 120);
      const g = mine ? 1 : 0.8;
      au.tone({ freq: 1568, type: 'sine', dur: 1.8, gain: 0.16 * g, attack: 0.005, pan });
      au.tone({ freq: 1575, type: 'sine', dur: 1.4, gain: 0.07 * g, attack: 0.005, pan: -pan, delay: 0.32 });
      au.tone({ freq: 1568, type: 'sine', dur: 1.0, gain: 0.03 * g, attack: 0.005, delay: 0.7 });
    },
    pinged() { au.tone({ freq: 1568, type: 'sine', dur: 0.9, gain: 0.12 }); au.sfx('blip', { gain: 0.3, pitch: 0.7, delay: 0.1 }); au.tone({ freq: 784, type: 'square', dur: 0.12, gain: 0.03, delay: 0.25 }); },
    decoy(x, y, z, mine) { place(x, y, z, 30); au.sfx('click', { gain: 0.5 * level, pitch: 0.6 }); au.tone({ freq: 660, freqEnd: 990, type: 'sine', dur: 0.35, gain: 0.08 * level, pan }); bub(0.2, 500, 1200, 0.3, 0.1); },
    pop(x, y, z) { place(x, y, z, 40); au.tone({ freq: 900, freqEnd: 300, type: 'sine', dur: 0.2, gain: 0.15 * level, pan }); bub(0.3, 600, 1800, 0.35); },
    kick() { au.noise({ filter: 'lowpass', freq: 400, freqEnd: 150, dur: 0.35, gain: 0.16, attack: 0.04 }); },
    mask() { au.noise({ filter: 'bandpass', freq: 700, freqEnd: 300, q: 0.8, dur: 0.25, gain: 0.15, attack: 0.01 }); au.sfx('click', { gain: 0.3, pitch: 0.5, delay: 0.12 }); },
    splash() { au.noise({ filter: 'lowpass', freq: 1600, freqEnd: 200, dur: 1.4, gain: 0.45, attack: 0.01 }); for (let i = 0; i < 7; i++) au.noise({ filter: 'bandpass', freq: 400 + Math.random() * 900, freqEnd: 1600, q: 1.2, dur: 0.18, gain: 0.12, attack: 0.01, delay: i * 0.06 }); },
    sudden() { au.sfx('riser', { gain: 0.4 }); au.tone({ freq: 45, freqEnd: 30, type: 'sawtooth', dur: 3, gain: 0.25, attack: 0.5 }); },
    dispose() {
      if (bed) for (const node of bed) { try { if (node.stop) node.stop(); } catch { /* never started */ } try { node.disconnect(); } catch { /* gone */ } }
      bed = null; rumble = null; hushG = null; growl = null;
    },
  };
}
