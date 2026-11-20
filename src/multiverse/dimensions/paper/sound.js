// Paper sounds: a flat dry crack for the rifle, punched-card holes, folding whooshes, a gantry horn, gulls — and a
// bouncy ukulele-and-shaker bed that tightens when sudden death starts. All through ctx.audio.
const _ = null;
const MEL = [
  69, _, 72, _, 76, _, 72, _, 74, _, 72, 69, _, _, _, _,
  67, _, 71, _, 74, _, 71, _, 72, _, 71, 67, _, _, _, _,
  69, _, 72, _, 76, _, 79, _, 77, _, 76, 72, _, 74, _, _,
  76, _, 74, _, 72, _, 71, _, 69, _, _, _, 64, _, _, _,
];
const BASS = [
  45, _, _, _, 45, _, _, 52, 43, _, _, _, 43, _, _, 50, 41, _, _, _, 41, _, _, 48, 40, _, _, _, 40, _, 43, _,
  45, _, _, _, 45, _, _, 52, 43, _, _, _, 43, _, _, 50, 41, _, _, _, 41, _, 45, _, 40, _, _, _, 40, _, 52, _,
];
const PLUCK = Array.from({ length: 64 }, (_, i) => (i % 4 === 2 ? [57, 60, 64, 60][Math.floor(i / 4) % 4] + (i >= 32 ? -2 : 0) : null));
const SHAKE = Array.from({ length: 64 }, (_, i) => (i % 2 === 1 || i % 8 === 0 ? 1 : null));
const KICK = Array.from({ length: 64 }, (_, i) => (i % 16 === 0 || i % 16 === 10 ? 1 : null));
const SNARE = Array.from({ length: 64 }, (_, i) => (i % 16 === 8 ? 1 : null));
const CALM = { bpm: 104, steps: 16, gain: 0.5, tracks: [
  { type: 'triangle', gain: 0.17, decay: 0.3, notes: MEL },
  { type: 'sine', gain: 0.22, decay: 0.34, notes: BASS },
  { type: 'square', gain: 0.045, decay: 0.12, cutoff: 1400, notes: PLUCK },
  { type: 'hat', gain: 0.06, decay: 0.04, notes: SHAKE },
  { type: 'kick', gain: 0.3, notes: KICK },
  { type: 'snare', gain: 0.1, decay: 0.09, notes: SNARE },
] };
const HOT = { bpm: 132, steps: 16, gain: 0.55, tracks: [
  { type: 'triangle', gain: 0.17, decay: 0.2, notes: MEL.map((n) => (n === null ? null : n + 3)) },
  { type: 'sawtooth', gain: 0.07, decay: 0.14, cutoff: 700, notes: BASS },
  { type: 'square', gain: 0.05, decay: 0.1, cutoff: 1600, notes: PLUCK },
  { type: 'hat', gain: 0.07, decay: 0.04, notes: SHAKE },
  { type: 'kick', gain: 0.45, notes: Array.from({ length: 64 }, (_, i) => (i % 4 === 0 ? 1 : null)) },
  { type: 'snare', gain: 0.14, decay: 0.08, notes: Array.from({ length: 64 }, (_, i) => (i % 8 === 4 ? 1 : i % 16 === 15 ? 1 : null)) },
] };

export function makeSound(ctx) {
  const A = ctx.audio;
  const pan = (x) => Math.max(-1, Math.min(1, x)) * 0.7;
  let on = '';
  return {
    music(hot) {
      const key = hot ? 'hot' : 'calm';
      if (on === key) return;
      on = key;
      A.music(hot ? HOT : CALM);
    },
    stop() { A.stopMusic(0.3); on = ''; },
    shot(mine, p) {
      const g = mine ? 1 : 0.7, pn = pan(p);
      A.noise({ filter: 'highpass', freq: 3200, dur: 0.05, gain: 0.3 * g, attack: 0.001, pan: pn });
      A.noise({ filter: 'bandpass', freq: 1900, freqEnd: 520, q: 0.9, dur: 0.2, gain: 0.85 * g, attack: 0.001, pan: pn });
      A.noise({ filter: 'lowpass', freq: 800, freqEnd: 160, dur: 0.3, gain: 0.7 * g, attack: 0.002, pan: pn });
      A.tone({ type: 'triangle', freq: 170, freqEnd: 44, dur: 0.26, gain: 0.4 * g, attack: 0.001, pan: pn });
      A.tone({ freq: 78, freqEnd: 42, dur: 0.45, gain: 0.26 * g, attack: 0.002, pan: pn });
      A.noise({ filter: 'bandpass', freq: 560, freqEnd: 180, q: 0.6, dur: 0.7, gain: 0.14 * g, attack: 0.03, delay: 0.2, pan: pn });
    },
    bolt(stage) {
      A.noise({ filter: 'highpass', freq: 3500, dur: 0.03, gain: 0.3, attack: 0.001 });
      A.tone({ type: 'square', freq: stage ? 520 : 360, freqEnd: stage ? 880 : 240, dur: 0.07, gain: 0.07 });
      A.tone({ type: 'triangle', freq: stage ? 150 : 200, freqEnd: 70, dur: 0.09, gain: 0.2 });
    },
    scope(on) {
      A.noise({ filter: 'bandpass', freq: on ? 900 : 2200, freqEnd: on ? 2400 : 800, q: 1.2, dur: 0.16, gain: 0.3, attack: 0.03 });
      A.tone({ type: 'triangle', freq: on ? 520 : 380, freqEnd: on ? 760 : 260, dur: 0.06, gain: 0.07 });
    },
    whiz(p, near) {
      const pn = pan(p);
      A.noise({ filter: 'bandpass', freq: 3800, freqEnd: 1100, q: 1.6, dur: 0.22, gain: near ? 0.5 : 0.3, attack: 0.03, pan: pn });
      A.tone({ type: 'sine', freq: 1500, freqEnd: 700, dur: 0.18, gain: near ? 0.07 : 0.04, pan: pn });
    },
    dry() { A.tone({ type: 'square', freq: 220, freqEnd: 160, dur: 0.05, gain: 0.08 }); A.noise({ filter: 'highpass', freq: 4000, dur: 0.02, gain: 0.2 }); },
    hole(p) {
      const pn = pan(p);
      A.noise({ filter: 'bandpass', freq: 1300, freqEnd: 700, q: 1.1, dur: 0.1, gain: 0.5, attack: 0.001, pan: pn });
      A.tone({ type: 'triangle', freq: 420, freqEnd: 190, dur: 0.07, gain: 0.14, pan: pn });
    },
    steel(p) {
      const pn = pan(p);
      A.tone({ type: 'triangle', freq: 2300, freqEnd: 1900, dur: 0.3, gain: 0.12, attack: 0.001, pan: pn });
      A.tone({ type: 'sine', freq: 1450, freqEnd: 1380, dur: 0.38, gain: 0.08, attack: 0.001, pan: pn });
      A.noise({ filter: 'highpass', freq: 5000, dur: 0.04, gain: 0.3, attack: 0.001, pan: pn });
    },
    edge(into) {
      A.noise({ filter: 'bandpass', freq: into ? 500 : 2600, freqEnd: into ? 2600 : 500, q: 1.4, dur: 0.22, gain: 0.5, attack: 0.04 });
      A.tone({ type: 'triangle', freq: into ? 300 : 700, freqEnd: into ? 700 : 300, dur: 0.12, gain: 0.08 });
    },
    stand(p) {
      const pn = pan(p);
      A.tone({ type: 'triangle', freq: 190, freqEnd: 90, dur: 0.12, gain: 0.3, pan: pn });
      A.noise({ filter: 'lowpass', freq: 900, dur: 0.1, gain: 0.5, attack: 0.002, pan: pn });
      A.tone({ type: 'sine', freq: 620, freqEnd: 900, dur: 0.1, gain: 0.1, delay: 0.1, pan: pn });
    },
    tear(p) { A.noise({ filter: 'bandpass', freq: 2400, freqEnd: 900, q: 0.8, dur: 0.18, gain: 0.6, attack: 0.002, pan: pan(p) }); },
    step(l) { A.noise({ filter: 'lowpass', freq: 500 + Math.random() * 300, dur: 0.05, gain: 0.07 * l, attack: 0.002 }); },
    horn(p, g = 1) { const pn = pan(p); A.tone({ type: 'sawtooth', freq: 140, dur: 0.55, gain: 0.07 * g, attack: 0.02, pan: pn }); A.tone({ type: 'sawtooth', freq: 175, dur: 0.55, gain: 0.07 * g, attack: 0.02, pan: pn, delay: 0.18 }); },
    gull(p) { const pn = pan(p), f = 1100 + Math.random() * 300; A.tone({ type: 'sine', freq: f, freqEnd: f * 0.7, dur: 0.22, gain: 0.05, attack: 0.02, pan: pn }); A.tone({ type: 'sine', freq: f * 1.1, freqEnd: f * 0.72, dur: 0.2, gain: 0.04, attack: 0.02, delay: 0.17, pan: pn }); },
    hit() { A.sfx('hit'); },
    crumple() {
      for (let i = 0; i < 6; i++) A.noise({ filter: 'bandpass', freq: 1800 + Math.random() * 3000, q: 1.5, dur: 0.05, gain: 0.5, attack: 0.001, delay: i * 0.045 });
      A.tone({ type: 'triangle', freq: 160, freqEnd: 60, dur: 0.18, gain: 0.3, delay: 0.3 });
      A.noise({ filter: 'lowpass', freq: 600, dur: 0.1, gain: 0.5, delay: 0.62 });
      A.noise({ filter: 'highpass', freq: 3000, dur: 0.22, gain: 0.25, attack: 0.08, delay: 1.0 });
    },
  };
}
