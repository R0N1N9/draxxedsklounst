// Everything you hear: a heavy rifle under rain, wet footsteps, the crossing bell and the train, and a
// koto-and-taiko bed in the hirajoshi scale. All through ctx.audio.
import { clamp } from '../../kit.js';

const _ = null;
// A minor hirajoshi: A B C E F. The koto line walks it slowly; the bass holds A and E.
const KOTO = [
  69, _, _, 72, _, 76, _, _, 77, _, 76, _, 72, _, _, _,
  71, _, _, 74, _, 77, _, _, 76, _, 72, _, 71, _, _, _,
  69, _, 72, _, 76, _, 81, _, 77, _, 76, _, 72, _, 69, _,
  64, _, _, _, 69, _, _, 72, _, _, 71, _, 69, _, _, _,
];
const PAD = [45, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, 45, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, 41, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, 40, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _];
const TAIKO = [1, _, _, _, _, _, _, _, _, _, 1, _, _, _, _, _, 1, _, _, _, _, _, _, _, _, _, _, _, 1, _, 1, _, 1, _, _, _, _, _, _, _, _, _, 1, _, _, _, _, _, 1, _, _, _, _, _, _, _, 1, _, _, _, _, _, 1, 1];
const RAIN = Array.from({ length: 64 }, (_, i) => (i % 2 === 1 || i % 7 === 0 ? 1 : null));
const CALM = {
  bpm: 84, steps: 16, gain: 0.5,
  tracks: [
    { type: 'triangle', gain: 0.17, decay: 0.42, notes: KOTO },
    { type: 'sine', gain: 0.2, decay: 1.4, notes: PAD },
    { type: 'kick', gain: 0.5, notes: TAIKO },
    { type: 'hat', gain: 0.05, decay: 0.05, notes: RAIN },
  ],
};
const KOTO_HOT = [
  81, _, 77, 76, _, 72, _, 76, 77, _, 81, _, 84, _, 81, _,
  83, _, 79, 77, _, 74, _, 77, 79, _, 83, _, 86, _, 83, _,
  81, 76, 72, _, 76, 77, _, 81, 84, _, 81, 77, _, 76, 72, _,
  76, _, 72, _, 71, _, 69, _, 64, 69, 72, 76, 81, _, _, _,
];
const HOT = {
  bpm: 132, steps: 16, gain: 0.52,
  tracks: [
    { type: 'triangle', gain: 0.15, decay: 0.2, notes: KOTO_HOT },
    { type: 'sawtooth', gain: 0.07, decay: 0.16, cutoff: 600, notes: [45, 45, _, 45, 57, _, 45, 45, 41, 41, _, 41, 53, _, 41, 41, 43, 43, _, 43, 55, _, 43, 43, 40, 40, _, 40, 52, _, 40, 40, 45, 45, _, 45, 57, _, 45, 45, 41, 41, _, 41, 53, _, 41, 41, 43, 43, _, 43, 55, _, 43, 43, 40, 52, 40, 52, 40, 52, 40, 52] },
    { type: 'kick', gain: 0.55, notes: [1, _, _, _, 1, _, _, _, 1, _, _, _, 1, _, 1, _] },
    { type: 'snare', gain: 0.14, decay: 0.08, notes: [_, _, _, _, _, _, 1, _, _, _, _, _, _, _, 1, 1] },
    { type: 'hat', gain: 0.06, decay: 0.04, notes: RAIN },
  ],
};

export function makeSound(ctx, panOf) {
  const A = ctx.audio;
  const P = (x) => clamp(panOf(x), -1, 1) * 0.7;
  let rainT = 0, bellT = 0, rumT = 0, stepT = 0, heartT = 0, on = '';
  return {
    shot(x, mine) {
      const g = mine ? 1 : 0.72, p = P(x);
      A.noise({ filter: 'highpass', freq: 2600, dur: 0.05, gain: 0.3 * g, attack: 0.001, pan: p });
      A.noise({ filter: 'bandpass', freq: 1500, freqEnd: 360, q: 0.8, dur: 0.22, gain: 0.9 * g, attack: 0.001, pan: p });
      A.noise({ filter: 'lowpass', freq: 650, freqEnd: 130, dur: 0.34, gain: 0.8 * g, attack: 0.002, pan: p });
      A.tone({ type: 'triangle', freq: 150, freqEnd: 40, dur: 0.3, gain: 0.42 * g, attack: 0.001, pan: p });
      A.tone({ freq: 74, freqEnd: 44, dur: 0.55, gain: 0.32 * g, attack: 0.002, pan: p });
      A.noise({ filter: 'bandpass', freq: 520, freqEnd: 150, q: 0.6, dur: 1.0, gain: 0.18 * g, attack: 0.03, delay: 0.17, pan: p }); // the street gives it back
    },
    bolt(stage, x) {
      const p = P(x);
      A.noise({ filter: 'highpass', freq: 3000, dur: 0.03, gain: 0.35, attack: 0.001, pan: p });
      A.tone({ type: 'square', freq: stage ? 520 : 380, freqEnd: stage ? 900 : 260, dur: 0.07, gain: 0.07, pan: p });
      A.tone({ type: 'triangle', freq: stage ? 140 : 190, freqEnd: 70, dur: 0.1, gain: 0.2, pan: p });
    },
    ready() { A.tone({ type: 'square', freq: 1480, dur: 0.05, gain: 0.04 }); A.tone({ type: 'sine', freq: 2217, dur: 0.12, gain: 0.05, delay: 0.04 }); },
    step(x, dt, speed) {
      stepT -= dt;
      if (stepT > 0) return;
      stepT = 0.5 / (0.5 + speed);
      A.noise({ filter: 'lowpass', freq: 1300, freqEnd: 380, dur: 0.07, gain: 0.14, attack: 0.001, pan: P(x) });
      A.noise({ filter: 'highpass', freq: 4200, dur: 0.05, gain: 0.05, attack: 0.001, delay: 0.02, pan: P(x) });
    },
    dash(x) {
      A.sfx('swoosh', { gain: 0.8, pan: P(x) });
      A.tone({ type: 'sawtooth', freq: 500, freqEnd: 2600, dur: 0.09, gain: 0.07, pan: P(x) });
      A.noise({ filter: 'highpass', freq: 5000, dur: 0.12, gain: 0.12, pan: P(x) });
    },
    puff(x) {
      A.noise({ filter: 'lowpass', freq: 3200, freqEnd: 180, dur: 0.55, gain: 0.85, attack: 0.002, pan: P(x) });
      A.tone({ freq: 230, freqEnd: 58, dur: 0.38, gain: 0.34, pan: P(x) });
      A.tone({ type: 'triangle', freq: 1175, freqEnd: 1760, dur: 0.14, gain: 0.06, delay: 0.03, pan: P(x) });
    },
    pop(x) {
      A.noise({ filter: 'highpass', freq: 3500, dur: 0.2, gain: 0.55, attack: 0.001, pan: P(x) });
      A.noise({ filter: 'bandpass', freq: 1800, q: 1.2, dur: 0.12, gain: 0.5, pan: P(x) });
      A.tone({ type: 'triangle', freq: 950, freqEnd: 300, dur: 0.12, gain: 0.18, pan: P(x) });
    },
    impact(x) {
      A.noise({ filter: 'lowpass', freq: 2400, freqEnd: 300, dur: 0.14, gain: 0.55, attack: 0.001, pan: P(x) });
      A.tone({ type: 'triangle', freq: 280, freqEnd: 80, dur: 0.1, gain: 0.2, pan: P(x) });
    },
    whiz(x) {
      A.noise({ filter: 'bandpass', freq: 2800, freqEnd: 900, q: 4, dur: 0.24, gain: 0.6, attack: 0.01, pan: P(x) });
      A.tone({ type: 'sawtooth', freq: 1900, freqEnd: 620, dur: 0.16, gain: 0.05, pan: P(x) });
    },
    focus(on_) {
      if (on_) {
        A.tone({ type: 'sine', freq: 660, freqEnd: 990, dur: 0.55, gain: 0.06, attack: 0.25 });
        A.noise({ filter: 'bandpass', freq: 3400, freqEnd: 2200, q: 6, dur: 0.5, gain: 0.07, attack: 0.2 });
      } else A.tone({ type: 'sine', freq: 440, freqEnd: 300, dur: 0.18, gain: 0.04 });
    },
    heart(dt, f) { // a slow pulse while concentrating
      if (f < 0.6) { heartT = 0; return; }
      heartT -= dt;
      if (heartT <= 0) { heartT = 0.8; A.tone({ freq: 62, freqEnd: 42, dur: 0.16, gain: 0.2 }); A.tone({ freq: 58, freqEnd: 40, dur: 0.14, gain: 0.14, delay: 0.14 }); }
    },
    thunder() {
      A.noise({ filter: 'lowpass', freq: 500, freqEnd: 60, dur: 2.4, gain: 1.1, attack: 0.12 });
      A.noise({ filter: 'bandpass', freq: 900, freqEnd: 120, q: 0.5, dur: 1.6, gain: 0.5, attack: 0.05, delay: 0.1 });
    },
    crow() { for (let i = 0; i < 3; i++) A.tone({ type: 'sawtooth', freq: 520 - i * 40, freqEnd: 300 - i * 30, dur: 0.18, gain: 0.05, delay: i * 0.24, attack: 0.01 }); },
    gust() { A.noise({ filter: 'bandpass', freq: 380, freqEnd: 1700, q: 1.2, dur: 1.5, gain: 0.35, attack: 0.6 }); },
    crossing(dt, d) { // d < 0 warning: the bell; d > 0: horn once, then the roar
      if (d < 0) {
        bellT -= dt;
        if (bellT <= 0) {
          bellT = 0.34;
          const hi = ((Math.floor(d * 3) % 2) + 2) % 2;
          A.tone({ type: 'sine', freq: hi ? 1568 : 1318, dur: 0.16, gain: 0.2 });
          A.tone({ type: 'square', freq: hi ? 3136 : 2637, dur: 0.03, gain: 0.025 });
        }
        return;
      }
      rumT -= dt;
      if (rumT <= 0) {
        rumT = 0.28;
        A.noise({ filter: 'lowpass', freq: 220, freqEnd: 110, dur: 0.5, gain: 1.0, attack: 0.02 });
        A.noise({ filter: 'bandpass', freq: 1200, freqEnd: 600, q: 0.6, dur: 0.3, gain: 0.25 });
        A.tone({ freq: 52, freqEnd: 44, dur: 0.5, gain: 0.32 });
      }
    },
    horn() { A.tone({ type: 'sawtooth', freq: 233, dur: 1.2, gain: 0.1, attack: 0.04 }); A.tone({ type: 'sawtooth', freq: 311, dur: 1.2, gain: 0.08, attack: 0.04 }); A.tone({ type: 'triangle', freq: 117, dur: 1.2, gain: 0.14, attack: 0.04 }); },
    rain(dt) {
      rainT -= dt;
      if (rainT <= 0) { rainT = 1.5; A.noise({ filter: 'highpass', freq: 4800, dur: 2.3, gain: 0.05, attack: 0.7 }); A.noise({ filter: 'bandpass', freq: 1800, q: 0.4, dur: 2.3, gain: 0.03, attack: 0.7 }); }
    },
    kill() {
      A.noise({ filter: 'lowpass', freq: 2200, freqEnd: 80, dur: 1.1, gain: 0.9, attack: 0.002 });
      A.tone({ freq: 70, freqEnd: 34, dur: 1.1, gain: 0.6, attack: 0.002 });
      A.tone({ type: 'sine', freq: 196, dur: 2.2, gain: 0.1, delay: 0.1 });
      A.tone({ type: 'sine', freq: 294, dur: 2.2, gain: 0.07, delay: 0.1 });
      A.sfx('boom', { gain: 0.4 });
    },
    music(hot) {
      const k = hot ? 'hot' : 'calm';
      if (on === k) return;
      on = k;
      A.music(hot ? HOT : CALM);
    },
    stop() { A.stopMusic(0.2); },
  };
}
