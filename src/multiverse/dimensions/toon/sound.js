// Everything you hear: a honky-tonk ragtime piano loop (stride left hand, syncopated right) and the
// cartoon foley — pops, bonks, boings, slide whistles, a gong for the anvil and a steam whistle for the
// train. All through ctx.audio.
import { clamp } from '../../kit.js';
import { W } from './world.js';

const _ = null;

// One chord per bar: bass root and fifth (low), the three tones of the left-hand chord.
const BARS = [
  { b: [36, 43], ch: [52, 55, 60] }, // C
  { b: [33, 40], ch: [52, 55, 61] }, // A7
  { b: [38, 45], ch: [53, 57, 62] }, // Dm
  { b: [43, 38], ch: [53, 59, 62] }, // G7
  { b: [36, 43], ch: [52, 55, 60] }, // C
  { b: [40, 47], ch: [50, 56, 59] }, // E7
  { b: [41, 48], ch: [53, 57, 60] }, // F
  { b: [36, 43], ch: [52, 55, 60], ch2: [53, 59, 62] }, // C, then G7 for the turnaround
];
// Right hand: [step, note] per bar. Syncopated: lots of notes just off the beat.
const MELODY = [
  [[0, 79], [3, 76], [6, 72], [8, 76], [11, 79], [14, 84]],
  [[0, 81], [3, 85], [6, 81], [8, 76], [11, 81], [14, 79]],
  [[0, 77], [3, 74], [6, 69], [8, 74], [11, 78], [14, 81]],
  [[0, 79], [3, 83], [6, 79], [8, 77], [11, 74], [12, 71], [14, 67]],
  [[0, 76], [2, 79], [4, 84], [6, 79], [8, 76], [10, 72], [12, 76], [14, 79]],
  [[0, 80], [3, 83], [6, 76], [8, 80], [11, 83], [14, 86]],
  [[0, 81], [3, 84], [6, 81], [8, 77], [10, 81], [12, 84], [14, 81]],
  [[0, 79], [3, 76], [6, 72], [8, 74], [9, 71], [10, 67], [12, 72], [14, 67]],
];

function track(fn) {
  const out = [];
  for (let b = 0; b < 8; b++) for (let s = 0; s < 16; s++) out.push(fn(b, s) || _);
  return out;
}

function build(bpm, trans, hot) {
  const mel = track((b, s) => { const m = MELODY[b].find((n) => n[0] === s); return m ? m[1] + trans : 0; });
  const mel2 = track((b, s) => { const m = MELODY[b].find((n) => n[0] === s); return m ? m[1] + trans + 12 : 0; });
  const bass = track((b, s) => (s === 0 ? BARS[b].b[0] + trans : s === 8 ? BARS[b].b[1] + trans : 0));
  const chord = (i) => track((b, s) => {
    if (s !== 4 && s !== 12 && !(hot && s === 14)) return 0;
    const ch = b === 7 && s >= 12 ? BARS[b].ch2 : BARS[b].ch;
    return ch[i] + trans;
  });
  const tracks = [
    { type: 'square', gain: 0.058, decay: 0.2, cutoff: 3000, notes: mel },
    { type: 'triangle', gain: 0.075, decay: 0.3, notes: mel2 },
    { type: 'triangle', gain: 0.23, decay: 0.26, notes: bass },
    { type: 'sawtooth', gain: 0.06, decay: 0.2, cutoff: 650, notes: bass }, // the tuba's overtones, for small speakers
    { type: 'triangle', gain: 0.06, decay: 0.15, notes: chord(0) },
    { type: 'triangle', gain: 0.055, decay: 0.15, notes: chord(1) },
    { type: 'triangle', gain: 0.05, decay: 0.15, notes: chord(2) },
    { type: 'kick', gain: 0.22, decay: 0.12, notes: track((b, s) => (s === 0 || s === 8 ? 1 : 0)) },
    { type: 'noise', gain: 0.05, decay: 0.07, cutoff: 3400, notes: track((b, s) => (s === 4 || s === 12 || (hot && s % 2 === 0) ? 1 : 0)) },
    { type: 'hat', gain: 0.028, decay: 0.04, notes: track((b, s) => (s % 4 === 2 ? 1 : 0)) },
  ];
  return { bpm, steps: 16, gain: 0.55, tracks };
}

export const BPM = 120, BPM_HOT = 148;
const CALM = build(BPM, 0, false);
const HOT = build(BPM_HOT, -3, true);

export function makeSound(ctx) {
  const A = ctx.audio;
  const P = (x) => clamp((x - W / 2) / (W / 2), -1, 1) * 0.55;
  let stepT = 0, tickT = 0, rumT = 0, on = '';
  const t = (o) => A.tone(o);
  const n = (o) => A.noise(o);
  return {
    music(hot) {
      const k = hot ? 'hot' : 'calm';
      if (on === k) return;
      on = k;
      A.music(hot ? HOT : CALM);
    },
    stop(f = 0.4) { on = ''; A.stopMusic(f); },
    // the cork gun: a wet little "pock" with a hollow tube ring; charged shots are fatter
    pop(x, mine, c) {
      const g = mine ? 1 : 0.7, p = P(x);
      n({ filter: 'bandpass', freq: 1500, freqEnd: 500, q: 1.1, dur: 0.1, gain: 0.8 * g, attack: 0.001, pan: p });
      t({ type: 'sine', freq: 820 - c * 300, freqEnd: 190, dur: 0.12, gain: 0.5 * g, attack: 0.001, pan: p });
      t({ type: 'triangle', freq: 300 - c * 120, freqEnd: 90, dur: 0.16, gain: 0.3 * g, pan: p });
      if (c > 0.5) t({ type: 'sine', freq: 1500, freqEnd: 400, dur: 0.4, gain: 0.07 * g, delay: 0.03, pan: p }); // the long barrel sings
    },
    whistle(x, c) { t({ type: 'sine', freq: 1500 + c * 800, freqEnd: 600, dur: 0.5, gain: 0.04, attack: 0.04, pan: P(x) }); },
    ratchet(x, c) { t({ type: 'square', freq: 700 + c * 900, dur: 0.022, gain: 0.05, pan: P(x) }); n({ filter: 'highpass', freq: 4000, dur: 0.02, gain: 0.08, pan: P(x) }); },
    ready(x) { t({ type: 'sine', freq: 1568, dur: 0.1, gain: 0.07, pan: P(x) }); t({ type: 'sine', freq: 2093, dur: 0.18, gain: 0.07, delay: 0.07, pan: P(x) }); },
    recork(x) { n({ filter: 'bandpass', freq: 700, q: 2, dur: 0.05, gain: 0.25, pan: P(x) }); t({ type: 'square', freq: 220, freqEnd: 330, dur: 0.05, gain: 0.05, delay: 0.1, pan: P(x) }); },
    bonk(x, big) {
      const p = P(x);
      t({ type: 'square', freq: 560, freqEnd: 300, dur: 0.07, gain: 0.16, attack: 0.001, pan: p });
      t({ type: 'triangle', freq: 230, freqEnd: 110, dur: 0.18, gain: big ? 0.55 : 0.34, pan: p });
      n({ filter: 'lowpass', freq: 1800, freqEnd: 300, dur: 0.12, gain: 0.45, attack: 0.001, pan: p });
    },
    thunk(x) { t({ type: 'triangle', freq: 190, freqEnd: 90, dur: 0.09, gain: 0.25, pan: P(x) }); n({ filter: 'lowpass', freq: 1400, dur: 0.06, gain: 0.3, pan: P(x) }); },
    boing(x, pitch = 1) {
      const p = P(x);
      t({ type: 'sine', freq: 180 * pitch, freqEnd: 760 * pitch, dur: 0.28, gain: 0.3, attack: 0.004, pan: p });
      t({ type: 'sine', freq: 190 * pitch, freqEnd: 330 * pitch, dur: 0.5, gain: 0.16, delay: 0.1, pan: p });
      t({ type: 'triangle', freq: 95 * pitch, freqEnd: 380 * pitch, dur: 0.3, gain: 0.2, pan: p });
    },
    jump(x) { t({ type: 'sine', freq: 340, freqEnd: 940, dur: 0.14, gain: 0.1, pan: P(x) }); },
    land(x, hard) { t({ type: 'triangle', freq: 150, freqEnd: 70, dur: 0.1, gain: hard ? 0.35 : 0.18, pan: P(x) }); if (hard) t({ type: 'sine', freq: 900, freqEnd: 600, dur: 0.1, gain: 0.07, pan: P(x) }); },
    step(x, dt, speed) {
      stepT -= dt;
      if (stepT > 0) return;
      stepT = 0.17;
      t({ type: 'square', freq: 520 + Math.random() * 120, freqEnd: 300, dur: 0.03, gain: 0.04, pan: P(x) });
      n({ filter: 'bandpass', freq: 2400, dur: 0.03, gain: 0.06, pan: P(x) });
    },
    rung(x) { t({ type: 'square', freq: 420, freqEnd: 360, dur: 0.025, gain: 0.04, pan: P(x) }); },
    duck(x) { t({ type: 'sine', freq: 420, freqEnd: 240, dur: 0.07, gain: 0.07, pan: P(x) }); },
    slap(x) { // portable hole: a wet slap and a rising slide
      const p = P(x);
      n({ filter: 'lowpass', freq: 1200, freqEnd: 200, dur: 0.14, gain: 0.7, attack: 0.001, pan: p });
      t({ type: 'sine', freq: 110, freqEnd: 420, dur: 0.22, gain: 0.35, pan: p });
      t({ type: 'triangle', freq: 880, freqEnd: 1320, dur: 0.12, gain: 0.07, delay: 0.1, pan: p });
    },
    drop(x) { t({ type: 'sine', freq: 1100, freqEnd: 180, dur: 0.3, gain: 0.16, pan: P(x) }); n({ filter: 'bandpass', freq: 600, freqEnd: 200, dur: 0.25, gain: 0.3, pan: P(x) }); },
    pop2(x) { t({ type: 'sine', freq: 180, freqEnd: 1100, dur: 0.22, gain: 0.2, pan: P(x) }); n({ filter: 'highpass', freq: 3000, dur: 0.1, gain: 0.25, pan: P(x) }); },
    sign(x) { // the cut-out: two quick knocks on wood
      for (let i = 0; i < 2; i++) { t({ type: 'square', freq: 330, freqEnd: 190, dur: 0.05, gain: 0.14, delay: i * 0.09, pan: P(x) }); n({ filter: 'bandpass', freq: 900, q: 3, dur: 0.05, gain: 0.3, delay: i * 0.09, pan: P(x) }); }
    },
    signPop(x) { t({ type: 'triangle', freq: 700, freqEnd: 160, dur: 0.2, gain: 0.3, pan: P(x) }); n({ filter: 'highpass', freq: 2500, dur: 0.15, gain: 0.35, pan: P(x) }); t({ type: 'sine', freq: 1200, freqEnd: 300, dur: 0.3, gain: 0.1, delay: 0.05, pan: P(x) }); },
    anvilWarn(x) { t({ type: 'sine', freq: 880, dur: 0.16, gain: 0.1, pan: P(x) }); t({ type: 'sine', freq: 1175, dur: 0.3, gain: 0.1, delay: 0.14, pan: P(x) }); },
    anvilFall(x) { t({ type: 'sine', freq: 2200, freqEnd: 420, dur: 0.6, gain: 0.12, attack: 0.02, pan: P(x) }); },
    anvilLand(x) {
      const p = P(x);
      n({ filter: 'lowpass', freq: 800, freqEnd: 80, dur: 0.4, gain: 0.9, attack: 0.001, pan: p });
      t({ type: 'sine', freq: 70, freqEnd: 40, dur: 0.4, gain: 0.5, pan: p });
      for (const f of [196, 295, 392]) t({ type: 'sine', freq: f, dur: 1.3, gain: 0.1, delay: 0.03, pan: p }); // the gong
    },
    trainWarn() { for (let i = 0; i < 2; i++) { t({ type: 'sawtooth', freq: 392, dur: 0.32, gain: 0.07, attack: 0.03, delay: i * 0.46 }); t({ type: 'sawtooth', freq: 494, dur: 0.32, gain: 0.06, attack: 0.03, delay: i * 0.46 }); t({ type: 'triangle', freq: 196, dur: 0.32, gain: 0.1, attack: 0.03, delay: i * 0.46 }); } },
    trainBurst() { n({ filter: 'lowpass', freq: 3000, freqEnd: 200, dur: 0.5, gain: 0.8 }); t({ type: 'sawtooth', freq: 523, dur: 0.9, gain: 0.07, attack: 0.04 }); t({ type: 'sawtooth', freq: 659, dur: 0.9, gain: 0.06, attack: 0.04 }); },
    trainRun(dt, x) {
      rumT -= dt;
      if (rumT > 0) return;
      rumT = 0.12;
      n({ filter: 'lowpass', freq: 380, freqEnd: 140, dur: 0.16, gain: 0.7, pan: P(x) });
      n({ filter: 'bandpass', freq: 1400, freqEnd: 700, q: 0.8, dur: 0.07, gain: 0.25, pan: P(x) });
    },
    weed(x) { n({ filter: 'bandpass', freq: 900, freqEnd: 1700, q: 1.5, dur: 0.9, gain: 0.18, attack: 0.3, pan: P(x) }); },
    rattle(dt, x) { tickT -= dt; if (tickT > 0) return; tickT = 0.11; n({ filter: 'bandpass', freq: 2600 + Math.random() * 700, q: 2, dur: 0.04, gain: 0.07, pan: P(x) }); },
    squawk(x) { for (let i = 0; i < 2; i++) { t({ type: 'sawtooth', freq: 760, freqEnd: 300, dur: 0.22, gain: 0.07, attack: 0.01, delay: i * 0.26, pan: P(x) }); n({ filter: 'bandpass', freq: 1800, freqEnd: 900, q: 2, dur: 0.2, gain: 0.12, delay: i * 0.26, pan: P(x) }); } },
    stolen(x) { t({ type: 'square', freq: 800, freqEnd: 200, dur: 0.18, gain: 0.1, pan: P(x) }); t({ type: 'sine', freq: 300, freqEnd: 1200, dur: 0.2, gain: 0.12, delay: 0.1, pan: P(x) }); },
    plop(x) { t({ type: 'triangle', freq: 260, freqEnd: 150, dur: 0.1, gain: 0.25, pan: P(x) }); t({ type: 'sine', freq: 400, freqEnd: 700, dur: 0.12, gain: 0.1, delay: 0.06, pan: P(x) }); },
    dizzy(x) { for (let i = 0; i < 4; i++) t({ type: 'sine', freq: 1400 + (i % 2) * 300, dur: 0.12, gain: 0.05, delay: i * 0.1, pan: P(x) }); },
    glint(x) { t({ type: 'sine', freq: 2637, dur: 0.12, gain: 0.05, pan: P(x) }); t({ type: 'sine', freq: 3520, dur: 0.2, gain: 0.04, delay: 0.05, pan: P(x) }); },
    whiz(x) { n({ filter: 'bandpass', freq: 2400, freqEnd: 800, q: 3, dur: 0.22, gain: 0.3, attack: 0.01, pan: P(x) }); },
    sudden() { for (let i = 0; i < 4; i++) t({ type: 'sawtooth', freq: 220 + (i % 2) * 110, dur: 0.14, gain: 0.08, delay: i * 0.16 }); },
    kill(x) {
      const p = P(x);
      t({ type: 'square', freq: 520, freqEnd: 260, dur: 0.1, gain: 0.2, attack: 0.001, pan: p });
      t({ type: 'triangle', freq: 220, freqEnd: 80, dur: 0.3, gain: 0.6, pan: p });
      n({ filter: 'highpass', freq: 5000, dur: 0.9, gain: 0.35, attack: 0.002, pan: p }); // the cymbal
      t({ type: 'sine', freq: 1600, freqEnd: 140, dur: 1.0, gain: 0.14, delay: 0.08, pan: p }); // slide whistle
    },
    birds() { for (let i = 0; i < 5; i++) t({ type: 'sine', freq: 2200 + (i % 3) * 380, freqEnd: 3000, dur: 0.07, gain: 0.05, delay: 0.5 + i * 0.16 }); },
    tada() { for (const [f, d] of [[523, 0], [659, 0.09], [784, 0.18], [1047, 0.27]]) t({ type: 'triangle', freq: f, dur: 0.5, gain: 0.1, delay: d }); },
  };
}
