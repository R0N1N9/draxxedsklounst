// BREAK POINT — the sound of it: a rifle with the whole bay to echo in, water in every
// register (hiss, plink, slap, the gulp of going under), the animals, the ship, and a
// twangy tremolo-picked tune over a surf beat. Everything is ctx.audio; the one thing built
// by hand is the bed of surf that never stops (two filtered noise loops, freed in dispose).
import { clamp } from '../../kit.js';

const n = null;
// An original line on the "harbour" scale every surf band borrows (E F G# A B), picked in
// sixteenths over a walking bass and the two-and-four-and beat.
const MUSIC = {
  bpm: 148, gain: 0.34,
  tracks: [
    { type: 'sawtooth', gain: 0.085, decay: 0.11, cutoff: 2300, notes: [
      64, 64, 65, 65, 68, 68, 69, 69, 71, 71, 69, 69, 68, 68, 65, 65, 64, 64, 64, 64, 62, 62, 64, 64, 65, 65, 68, 68, 65, 65, 64, 64,
      69, 69, 71, 71, 72, 72, 71, 71, 69, 69, 68, 68, 65, 65, 68, 68, 64, 64, n, n, 64, 64, n, n, 59, 59, 62, 62, 64, n, n, n] },
    { type: 'triangle', gain: 0.2, decay: 0.24, notes: [
      40, n, 40, n, 40, n, 47, n, 40, n, 40, n, 44, n, 45, n, 40, n, 40, n, 40, n, 47, n, 45, n, 44, n, 41, n, 40, n,
      45, n, 45, n, 45, n, 52, n, 45, n, 44, n, 41, n, 44, n, 40, n, 40, n, 40, n, 47, n, 47, n, 46, n, 45, n, 44, n] },
    { type: 'kick', gain: 0.34, decay: 0.22, notes: [1, n, n, n, n, n, n, 1, 1, n, n, n, n, n, n, n] },
    { type: 'snare', gain: 0.17, decay: 0.12, cutoff: 3200, notes: [n, n, n, n, 1, n, 1, n, n, n, n, n, 1, n, n, 1] },
  ],
};

export function makeSfx(ctx) {
  const au = ctx.audio;
  const ear = { x: 0, y: 0, z: 0, rx: 1, rz: 0 };
  let level = 1, pan = 0, late = 0, bed = null;
  function place(x, z, reach = 60) {
    const dx = x - ear.x, dz = z - ear.z, dist = Math.hypot(dx, dz);
    pan = dist > 0.5 ? clamp(((dx * ear.rx + dz * ear.rz) / dist) * 0.8, -0.8, 0.8) : 0;
    level = 1 / (1 + dist / reach);
    late = Math.min(0.5, dist / 340);
  }
  // The bed: surf that swells and falls, and a thin wind over it.
  function startBed() {
    const ac = au.ctx, out = au.out;
    if (bed || !ac || !out) return;
    try {
      const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const mk = (type, freq, q, gain, lfoHz, depth) => {
        const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
        src.buffer = buf; src.loop = true;
        f.type = type; f.frequency.value = freq; f.Q.value = q;
        g.gain.value = 0;
        g.gain.setTargetAtTime(gain, ac.currentTime, 1.2);
        lfo.frequency.value = lfoHz; lg.gain.value = depth;
        lfo.connect(lg); lg.connect(g.gain);
        src.connect(f); f.connect(g); g.connect(out);
        src.start(); lfo.start();
        return [src, f, g, lfo, lg];
      };
      bed = [...mk('lowpass', 420, 0.4, 0.085, 0.11, 0.045), ...mk('bandpass', 1500, 0.6, 0.016, 0.07, 0.009)];
    } catch { bed = null; }
  }
  const water = (g, f0, f1, dur, delay = 0) => au.noise({ filter: 'bandpass', freq: f0, freqEnd: f1, q: 0.8, dur, gain: g * level, attack: 0.004, pan, delay: late + delay });

  return {
    ear,
    music() { au.music(MUSIC); startBed(); },
    shot(x, z, mine) {
      place(x, z, 90);
      au.sfx('shotHeavy', { gain: (mine ? 1 : 0.85) * level, pitch: 1.25, pan, delay: late });
      au.noise({ filter: 'highpass', freq: 2800, dur: 0.06, gain: 0.5 * level, attack: 0.001, pan, delay: late });
      // open water: one long roll back off the headlands
      au.noise({ filter: 'lowpass', freq: 520, freqEnd: 160, q: 0.6, dur: 1.5, gain: 0.2 * level, attack: 0.12, delay: late + 0.3, pan: -pan * 0.6 });
      if (mine) au.duck(0.5, 0.25);
    },
    bolt() { au.sfx('click', { gain: 0.5, pitch: 1.4, delay: 0.25 }); au.sfx('click', { gain: 0.5, pitch: 0.9, delay: 0.5 }); au.sfx('click', { gain: 0.55, pitch: 1.7, delay: 0.82 }); },
    reload() { for (let i = 0; i < 4; i++) au.sfx('click', { gain: 0.4, pitch: 0.9 + i * 0.13, delay: 0.5 + i * 0.36 }); },
    reloaded() { au.sfx('click', { gain: 0.6, pitch: 2 }); au.tone({ freq: 1320, type: 'triangle', dur: 0.2, gain: 0.07 }); },
    dry() { au.sfx('click', { gain: 0.4, pitch: 2.3 }); },
    skip(x, z, n2) { place(x, z, 50); au.tone({ freq: 900 + n2 * 260, freqEnd: 2200 + n2 * 300, type: 'sine', dur: 0.09, gain: 0.16 * level, pan, delay: late }); water(0.55, 3200, 1200, 0.16); },
    plunge(x, z) { place(x, z, 50); water(0.7, 1400, 300, 0.3); au.tone({ freq: 240, freqEnd: 70, dur: 0.2, gain: 0.25 * level, pan, delay: late }); },
    crack(side) { au.noise({ filter: 'highpass', freq: 3600, dur: 0.05, gain: 0.85, attack: 0.001, pan: side }); au.noise({ filter: 'bandpass', freq: 1700, freqEnd: 500, q: 2, dur: 0.3, gain: 0.45, attack: 0.01, pan: -side, delay: 0.03 }); },
    carve(amount) { au.noise({ filter: 'bandpass', freq: 2400, freqEnd: 900, q: 0.7, dur: 0.35, gain: 0.12 * amount, attack: 0.05 }); },
    land(x, z, hard) { place(x, z, 40); water(0.5 + hard * 0.4, 900, 250, 0.35); au.sfx('thud', { gain: 0.5 * level * hard, pan }); },
    diveIn(x, z) { place(x, z, 50); water(0.8, 1800, 200, 0.4); au.tone({ freq: 420, freqEnd: 90, type: 'sine', dur: 0.45, gain: 0.3 * level, pan }); },
    diveOut(x, z) { place(x, z, 50); water(0.9, 500, 2600, 0.45); au.tone({ freq: 140, freqEnd: 520, type: 'sine', dur: 0.3, gain: 0.22 * level, pan }); },
    spray(x, z) { place(x, z, 60); water(0.9, 700, 3800, 0.7); water(0.5, 3000, 900, 1.4, 0.3); au.sfx('swoosh', { gain: 0.5 * level, pan }); },
    dolphin(x, z) { place(x, z, 50); for (let i = 0; i < 4; i++) au.tone({ freq: 2100 + i * 350, freqEnd: 3400 - i * 200, type: 'sine', dur: 0.07, gain: 0.14 * level, pan, delay: late + i * 0.075 }); },
    ball(x, z) { place(x, z, 50); au.tone({ freq: 190, freqEnd: 520, type: 'sine', dur: 0.22, gain: 0.4 * level, pan, delay: late }); au.tone({ freq: 380, freqEnd: 900, type: 'triangle', dur: 0.12, gain: 0.15 * level, pan, delay: late }); },
    buoy(x, z) { place(x, z, 70); au.sfx('bell', { gain: 0.8 * level, pitch: 1.3, pan, delay: late }); },
    fin(x, z) { place(x, z, 50); au.sfx('thud', { gain: 0.7 * level, pan, delay: late }); },
    bump() { au.sfx('thud', { gain: 1 }); au.tone({ freq: 90, freqEnd: 45, type: 'sawtooth', dur: 0.35, gain: 0.3 }); au.noise({ filter: 'lowpass', freq: 700, freqEnd: 200, dur: 0.4, gain: 0.5 }); },
    horn() { for (const [f, g] of [[87, 0.2], [130.5, 0.14], [174, 0.07]]) { au.tone({ freq: f, type: 'sawtooth', dur: 2.6, gain: g, attack: 0.25, pan: 0.3 }); au.tone({ freq: f * 1.005, type: 'sawtooth', dur: 1.1, gain: g * 0.9, attack: 0.15, pan: 0.3, delay: 2.9 }); } },
    gull(x, z) { place(x, z, 70); const f = 1500 + Math.random() * 500; au.tone({ freq: f, freqEnd: f * 0.72, type: 'triangle', dur: 0.28, gain: 0.07 * level, attack: 0.03, pan }); au.tone({ freq: f * 1.05, freqEnd: f * 0.7, type: 'triangle', dur: 0.24, gain: 0.05 * level, attack: 0.03, pan, delay: 0.3 }); },
    setWave() { au.noise({ filter: 'lowpass', freq: 160, freqEnd: 420, q: 0.5, dur: 5, gain: 0.5, attack: 3.5 }); },
    wipeout(x, z) {
      place(x, z, 120);
      au.sfx('boom', { gain: 0.8 * level, pan });
      water(1.2, 500, 3200, 0.9); water(1.0, 2600, 500, 2.2, 0.35);
      au.tone({ freq: 660, freqEnd: 1760, type: 'triangle', dur: 0.7, gain: 0.12 * level, attack: 0.02, delay: 0.1 }); // the board, leaving
      au.sfx('chime', { gain: 0.5, delay: 0.6 });
    },
    splashDown(x, z, size) { place(x, z, 80); water(0.9 * size, 1200, 260, 0.6); },
    sudden() { au.sfx('riser', { gain: 0.5 }); },
    dispose() {
      if (bed) for (const node of bed) { try { if (node.stop) node.stop(); } catch { /* never started */ } try { node.disconnect(); } catch { /* already gone */ } }
      bed = null;
    },
  };
}
