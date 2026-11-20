// Chiptune music (square lead, triangle bass, kick and snare) and crunchy 8-bit effects,
// all through ctx.audio. The rifle is a square-wave thump under a noise crack.
import { clamp } from '../../kit.js';
import { FW } from './palette.js';

const _ = null;
// Four bars in A minor: Am, G, F, E. A tense, heroic little loop.
const LEAD = [
  69, _, _, 72, _, _, 76, _, 74, _, 72, _, 69, _, _, _,
  67, _, _, 71, _, _, 74, _, 72, _, 71, _, 67, _, _, _,
  65, _, _, 69, _, _, 72, _, 71, _, 69, _, 65, _, _, _,
  64, _, 67, _, 71, _, _, _, 76, _, 74, _, 71, _, 67, _,
];
const bass = (r, o = 12) => [r, _, r, _, r + o, _, r, _, r, _, r, _, r + o, _, r, r];
const BASS = [...bass(45), ...bass(43), ...bass(41), ...bass(40)];
const KICK = [1, _, _, _, _, _, _, _, 1, _, 1, _, _, _, _, _];
const SNARE = [_, _, _, _, 1, _, _, _, _, _, _, _, 1, _, _, 1];
const CALM = {
  bpm: 124, gain: 0.5,
  tracks: [
    { type: 'square', gain: 0.075, decay: 0.16, cutoff: 3400, notes: LEAD },
    { type: 'triangle', gain: 0.2, decay: 0.2, notes: BASS },
    { type: 'kick', gain: 0.4, notes: KICK },
    { type: 'snare', gain: 0.16, decay: 0.1, notes: SNARE },
  ],
};
// Sudden death: faster, an octave of stabs on top, the kick on every beat.
const STAB = [81, _, 81, 76, _, 81, _, 76, 79, _, 79, 74, _, 79, _, 74, 77, _, 77, 72, _, 77, _, 72, 76, _, 80, _, 83, _, 80, _];
const HOT = {
  bpm: 152, gain: 0.52,
  tracks: [
    { type: 'square', gain: 0.07, decay: 0.09, cutoff: 3800, notes: STAB },
    { type: 'sawtooth', gain: 0.1, decay: 0.12, cutoff: 700, notes: [45, 45, 57, 45, 45, 57, 45, 45, 43, 43, 55, 43, 41, 41, 53, 40] },
    { type: 'kick', gain: 0.45, notes: [1, _, _, _, 1, _, _, _, 1, _, _, _, 1, _, 1, _] },
    { type: 'snare', gain: 0.18, decay: 0.08, notes: [_, _, 1, _, 1, _, _, 1, _, _, 1, _, 1, _, 1, 1] },
  ],
};

export function makeSound(ctx) {
  const A = ctx.audio;
  const pan = (x) => clamp((x / FW) * 2 - 1, -1, 1) * 0.6;
  let jetT = 0, stepT = 0;
  return {
    shot(x, mine) {
      const g = mine ? 1 : 0.7, p = pan(x);
      A.noise({ filter: 'lowpass', freq: 5600, freqEnd: 260, dur: 0.32, gain: 0.85 * g, attack: 0.001, pan: p });
      A.tone({ type: 'square', freq: 360, freqEnd: 36, dur: 0.3, gain: 0.3 * g, attack: 0.001, pan: p });
      A.tone({ type: 'sawtooth', freq: 2000, freqEnd: 140, dur: 0.1, gain: 0.07 * g, pan: p });
      A.noise({ filter: 'bandpass', freq: 900, freqEnd: 140, q: 0.7, dur: 0.55, gain: 0.22 * g, attack: 0.02, delay: 0.05, pan: p });
    },
    bolt() {
      A.sfx('click', { gain: 0.6 });
      A.tone({ type: 'square', freq: 740, freqEnd: 1100, dur: 0.06, gain: 0.05, delay: 0.04 });
    },
    jump(x) { A.tone({ type: 'square', freq: 170, freqEnd: 460, dur: 0.1, gain: 0.1, pan: pan(x) }); },
    land(x) { A.noise({ filter: 'lowpass', freq: 500, dur: 0.07, gain: 0.2, pan: pan(x) }); },
    step(x, dt) {
      stepT -= dt;
      if (stepT > 0) return;
      stepT = 0.2;
      A.noise({ filter: 'bandpass', freq: 700 + Math.random() * 300, dur: 0.035, gain: 0.07, pan: pan(x) });
    },
    jet(x, dt) {
      jetT -= dt;
      if (jetT > 0) return;
      jetT = 0.07;
      A.noise({ filter: 'bandpass', freq: 1600 + Math.random() * 500, q: 0.8, dur: 0.09, gain: 0.09, attack: 0.004, pan: pan(x) });
      A.tone({ type: 'square', freq: 90 + Math.random() * 14, dur: 0.08, gain: 0.04, pan: pan(x) });
    },
    prone(x) { A.noise({ filter: 'lowpass', freq: 900, freqEnd: 300, dur: 0.1, gain: 0.14, pan: pan(x) }); },
    spring(x) {
      A.tone({ type: 'square', freq: 180, freqEnd: 980, dur: 0.2, gain: 0.12, pan: pan(x) });
      A.tone({ type: 'triangle', freq: 360, freqEnd: 1500, dur: 0.16, gain: 0.08, pan: pan(x), delay: 0.03 });
    },
    throwSmoke(x) { A.sfx('whoosh', { gain: 0.4, pitch: 1.3, pan: pan(x) }); },
    smoke(x) {
      A.noise({ filter: 'lowpass', freq: 1400, freqEnd: 180, dur: 0.7, gain: 0.42, attack: 0.01, pan: pan(x) });
      A.tone({ type: 'square', freq: 120, freqEnd: 40, dur: 0.2, gain: 0.14, pan: pan(x) });
    },
    decoy(x) {
      const p = pan(x);
      A.tone({ type: 'triangle', freq: 523, dur: 0.08, gain: 0.12, pan: p });
      A.tone({ type: 'triangle', freq: 784, dur: 0.1, gain: 0.12, delay: 0.07, pan: p });
      A.noise({ filter: 'highpass', freq: 3000, dur: 0.05, gain: 0.1, pan: p });
    },
    pop(x) {
      A.sfx('shatter', { gain: 0.35, pitch: 1.5, pan: pan(x) });
      A.tone({ type: 'square', freq: 900, freqEnd: 180, dur: 0.14, gain: 0.1, pan: pan(x) });
    },
    crate(x) {
      A.noise({ filter: 'bandpass', freq: 500, freqEnd: 200, dur: 0.18, gain: 0.4, pan: pan(x) });
      A.tone({ type: 'square', freq: 130, freqEnd: 50, dur: 0.1, gain: 0.14, pan: pan(x) });
    },
    impact(x) {
      A.tone({ type: 'square', freq: 1500, freqEnd: 380, dur: 0.05, gain: 0.08, pan: pan(x) });
      A.noise({ filter: 'highpass', freq: 4000, dur: 0.05, gain: 0.18, pan: pan(x) });
    },
    bonk(x) { A.tone({ type: 'triangle', freq: 320, freqEnd: 120, dur: 0.16, gain: 0.2, pan: pan(x) }); A.tone({ type: 'square', freq: 640, freqEnd: 240, dur: 0.05, gain: 0.05, pan: pan(x) }); },
    whizz() {
      A.noise({ filter: 'bandpass', freq: 5200, freqEnd: 700, q: 2, dur: 0.18, gain: 0.45, attack: 0.004 });
      A.tone({ type: 'sawtooth', freq: 1300, freqEnd: 260, dur: 0.14, gain: 0.05 });
    },
    birdWarn() {
      A.tone({ type: 'sawtooth', freq: 1250, freqEnd: 620, dur: 0.22, gain: 0.07 });
      A.tone({ type: 'sawtooth', freq: 1250, freqEnd: 620, dur: 0.22, gain: 0.07, delay: 0.26 });
    },
    bird(x) {
      A.tone({ type: 'sawtooth', freq: 520, freqEnd: 1400, dur: 0.18, gain: 0.1, pan: pan(x) });
      A.tone({ type: 'square', freq: 1400, freqEnd: 400, dur: 0.3, gain: 0.07, delay: 0.16, pan: pan(x) });
    },
    squawk(x) {
      const p = pan(x);
      A.tone({ type: 'sawtooth', freq: 900, freqEnd: 300, dur: 0.16, gain: 0.12, pan: p });
      A.tone({ type: 'square', freq: 1200, freqEnd: 500, dur: 0.12, gain: 0.08, delay: 0.1, pan: p });
      A.noise({ filter: 'bandpass', freq: 1800, dur: 0.12, gain: 0.2, pan: p });
    },
    kill(x) {
      const p = pan(x);
      A.sfx('boom', { gain: 0.6, pan: p });
      A.noise({ filter: 'highpass', freq: 2500, dur: 0.5, gain: 0.3, pan: p });
      [880, 660, 523, 392, 262].forEach((f, i) => A.tone({ type: 'square', freq: f, dur: 0.1, gain: 0.1, delay: 0.05 + i * 0.09, pan: p }));
    },
    pop2(x) { A.sfx('shatter', { gain: 0.7, pan: pan(x) }); A.tone({ type: 'triangle', freq: 1320, freqEnd: 165, dur: 0.7, gain: 0.1, pan: pan(x) }); },
    sudden() { A.sfx('riser', { gain: 0.5 }); },
    lava() { A.noise({ filter: 'lowpass', freq: 160, dur: 2.5, gain: 0.35, attack: 0.3 }); },
    music(kind) { A.music(kind === 'hot' ? HOT : CALM); },
    stop(fade = 0.9) { A.stopMusic(fade); },
  };
}
