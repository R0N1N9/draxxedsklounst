// Sound for the lattice: a dark, patient synth pulse, and a rifle that cracks like a
// capacitor bank letting go. Everything goes through ctx.audio (no nodes of our own).
import { clamp } from '../../kit.js';
import { W, BPM } from './world.js';

const _ = null;
const bar = (root) => [root, _, _, root, _, _, root, _, _, root, _, _, root, _, root + 3, _];
// Four bars, A minor: the bass walks A A F G under a sparse arpeggio.
const COOL = {
  bpm: BPM, gain: 0.42,
  tracks: [
    { type: 'kick', gain: 0.5, decay: 0.34, notes: [1, _, _, _, _, _, _, _, 1, _, _, _, _, _, 1, _] },
    { type: 'hat', gain: 0.045, decay: 0.04, notes: [_, _, 1, _, _, _, 1, _, _, _, 1, _, _, _, 1, 1] },
    { type: 'sawtooth', gain: 0.17, decay: 0.3, cutoff: 360, notes: [...bar(33), ...bar(33), ...bar(29), ...bar(31)] },
    { type: 'triangle', gain: 0.085, decay: 0.42, cutoff: 2600, notes: [
      _, _, 76, _, _, 72, _, _, 69, _, _, _, 76, _, _, _, _, _, 81, _, _, 76, _, _, 72, _, _, _, _, _, 69, _,
      _, _, 77, _, _, 72, _, _, 69, _, _, _, 77, _, _, _, _, _, 79, _, _, 74, _, _, 71, _, _, _, 74, _, 76, _] },
  ],
};
// Sudden death: the same harmony with the brakes off.
const HOT = {
  bpm: BPM, gain: 0.46,
  tracks: [
    { type: 'kick', gain: 0.55, decay: 0.26, notes: [1, _, _, _, 1, _, _, _, 1, _, _, _, 1, _, 1, _] },
    { type: 'hat', gain: 0.06, decay: 0.035, notes: [_, 1, 1, _, _, 1, 1, _, _, 1, 1, _, _, 1, 1, 1] },
    { type: 'sawtooth', gain: 0.19, decay: 0.16, cutoff: 620, notes: [33, 33, 45, 33, 33, 45, 33, 33, 29, 29, 41, 29, 31, 31, 43, 31] },
    { type: 'square', gain: 0.05, decay: 0.12, cutoff: 3000, notes: [81, 76, 72, 76, 81, 76, 72, 76, 77, 72, 69, 72, 79, 74, 71, 74] },
  ],
};

export function makeSound(ctx) {
  const A = ctx.audio;
  const pan = (x) => clamp((x / W) * 2 - 1, -1, 1) * 0.7;
  return {
    // The rail: a bright crack, a falling whine, and enough low end to feel it.
    rail(x, mine) {
      const g = mine ? 1 : 0.7, p = pan(x);
      A.sfx('shot', { gain: 0.9 * g, pitch: 0.82, pan: p });
      A.sfx('laser', { gain: 0.8 * g, pitch: 0.7, pan: p });
      A.tone({ type: 'sawtooth', freq: 2200, freqEnd: 70, dur: 0.42, gain: 0.1 * g, pan: p });
      A.tone({ freq: 130, freqEnd: 38, dur: 0.5, gain: 0.34 * g, attack: 0.002, pan: p });
      A.noise({ filter: 'bandpass', freq: 900, freqEnd: 200, q: 0.7, dur: 0.55, gain: 0.3 * g, attack: 0.01, delay: 0.05, pan: p });
    },
    ricochet(x) {
      const p = pan(x), k = 0.9 + Math.random() * 0.25;
      A.tone({ type: 'triangle', freq: 3100 * k, freqEnd: 1500 * k, dur: 0.22, gain: 0.16, pan: p });
      A.tone({ freq: 4650 * k, freqEnd: 2300 * k, dur: 0.16, gain: 0.07, pan: p });
      A.noise({ filter: 'highpass', freq: 5200, dur: 0.05, gain: 0.2, attack: 0.001, pan: p });
    },
    impact(x) { A.sfx('hit', { gain: 0.45, pitch: 1.2, pan: pan(x) }); },
    ready() {
      A.sfx('click', { gain: 0.5 });
      A.tone({ type: 'triangle', freq: 990, freqEnd: 1480, dur: 0.09, gain: 0.07 });
    },
    blink(x) {
      const p = pan(x);
      A.sfx('zap', { gain: 0.45, pitch: 1.3, pan: p });
      A.tone({ type: 'sine', freq: 380, freqEnd: 2600, dur: 0.14, gain: 0.12, pan: p });
    },
    deny() { A.sfx('error', { gain: 0.35 }); },
    decoy(x) {
      A.sfx('glitch', { gain: 0.4, pan: pan(x) });
      A.tone({ type: 'square', freq: 660, freqEnd: 1320, dur: 0.12, gain: 0.05, pan: pan(x) });
    },
    pop(x) {
      A.sfx('glitch', { gain: 0.5, pitch: 1.5, pan: pan(x) });
      A.sfx('shatter', { gain: 0.3, pitch: 1.6, pan: pan(x) });
    },
    painted() { A.tone({ type: 'square', freq: 1760, dur: 0.05, gain: 0.07 }); },
    lightsOut() {
      A.sfx('drop', { gain: 0.5 });
      A.tone({ type: 'sawtooth', freq: 220, freqEnd: 40, dur: 0.7, gain: 0.12 });
    },
    count(i) { A.tone({ type: 'triangle', freq: 660 * Math.pow(2, i / 12), dur: 0.08, gain: 0.07 }); },
    pulse() {
      A.sfx('bell', { gain: 0.35, pitch: 0.5 });
      A.noise({ filter: 'bandpass', freq: 400, freqEnd: 5000, q: 1.2, dur: 0.5, gain: 0.3, attack: 0.02 });
      A.tone({ freq: 90, freqEnd: 45, dur: 0.5, gain: 0.3, attack: 0.002 });
    },
    sudden() { A.sfx('riser', { gain: 0.5 }); },
    kill(x) {
      A.sfx('shatter', { gain: 0.8, pan: pan(x) });
      A.sfx('boom', { gain: 0.5, pan: pan(x) });
      A.tone({ type: 'triangle', freq: 1320, freqEnd: 165, dur: 0.9, gain: 0.12, pan: pan(x) });
    },
    music(kind) { A.music(kind === 'hot' ? HOT : COOL); },
    stop() { A.stopMusic(0.9); },
  };
}
