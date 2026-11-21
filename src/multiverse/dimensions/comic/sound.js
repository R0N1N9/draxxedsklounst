// INK CITY — sound: a fat pulp rifle, rocket boots, a caper for a score.
import { clamp } from '../../kit.js';

const _ = null;
// A rooftop caper in D minor: walking bass, a muted brass stab, brushes.
const MUSIC = {
  bpm: 132, gain: 0.42,
  tracks: [
    { type: 'sawtooth', gain: 0.2, decay: 0.2, cutoff: 520, notes: [38, _, 38, _, 41, _, 43, _, 45, _, 43, _, 41, _, 40, _, 38, _, 38, _, 36, _, 38, _, 41, _, 45, _, 44, _, 43, 41] },
    { type: 'square', gain: 0.06, decay: 0.16, cutoff: 1500, notes: [_, _, _, _, 65, _, _, 69, _, _, _, _, 65, _, 62, _, _, _, _, _, 67, _, _, 70, _, _, _, _, 69, 67, 65, _] },
    { type: 'triangle', gain: 0.09, decay: 0.5, notes: [74, _, _, _, _, _, _, _, _, _, 72, _, 69, _, _, _, 70, _, _, _, _, _, _, _, _, _, 69, _, 65, _, 62, _] },
    { type: 'kick', gain: 0.5, notes: [1, _, _, _, _, _, 1, _, _, _, 1, _, _, _, _, _] },
    { type: 'snare', gain: 0.2, notes: [_, _, _, _, 1, _, _, _, _, _, _, _, 1, _, _, 1] },
    { type: 'hat', gain: 0.09, notes: [1, _, 1, 1, 1, _, 1, 1] },
  ],
};

export function makeSfx(ctx) {
  const A = ctx.audio;
  const ear = { x: 0, y: 0, z: 0, rx: 1, rz: 0 };
  // how loud and where, for something that happens at (x, y, z)
  const at = (x, y, z, ref) => {
    const dx = x - ear.x, dz = z - ear.z, d = Math.hypot(dx, y - ear.y, dz);
    at.pan = clamp((dx * ear.rx + dz * ear.rz) / (d + 4), -1, 1) * 0.8;
    return clamp(ref / (ref + d), 0.08, 1);
  };
  at.pan = 0;
  return {
    ear,
    music() { A.music(MUSIC); },
    shot(x, y, z, mine) {
      const g = mine ? 1 : at(x, y, z, 55), pan = mine ? 0.1 : at.pan;
      A.sfx('shotHeavy', { gain: 0.8 * g, pitch: 1.12, pan });
      A.tone({ type: 'square', freq: 220, freqEnd: 55, dur: 0.12, gain: 0.16 * g, pan });
      A.noise({ filter: 'bandpass', freq: 2600, freqEnd: 700, q: 0.8, dur: 0.1, gain: 0.5 * g, pan });
    },
    bolt(step) {
      A.noise({ filter: 'bandpass', freq: step ? 2100 : 2900, q: 3, dur: 0.05, gain: 0.3 });
      A.tone({ type: 'square', freq: step ? 240 : 320, dur: 0.035, gain: 0.07 });
    },
    reload() { for (let i = 0; i < 3; i++) A.sfx('click', { gain: 0.5, delay: i * 0.16, pitch: 0.8 + i * 0.15 }); },
    dry() { A.sfx('click', { gain: 0.4, pitch: 1.6 }); },
    whiff(pan) { A.noise({ filter: 'bandpass', freq: 3200, freqEnd: 900, q: 2.5, dur: 0.16, gain: 0.5, pan }); A.tone({ type: 'sine', freq: 2400, freqEnd: 500, dur: 0.14, gain: 0.07, pan }); },
    impact(x, y, z, surf) {
      const g = at(x, y, z, 30), pan = at.pan;
      if (surf === 'metal') { A.tone({ type: 'triangle', freq: 2300, freqEnd: 1500, dur: 0.3, gain: 0.2 * g, pan }); A.tone({ type: 'sine', freq: 3400, dur: 0.22, gain: 0.08 * g, pan }); }
      else if (surf === 'blimp') A.tone({ type: 'sine', freq: 160, freqEnd: 420, dur: 0.22, gain: 0.3 * g, pan });
      else if (surf === 'glass') A.sfx('shatter', { gain: 0.35 * g, pan });
      else if (surf === 'wood' || surf === 'paper') A.tone({ type: 'triangle', freq: 190, freqEnd: 90, dur: 0.12, gain: 0.3 * g, pan });
      A.noise({ filter: 'bandpass', freq: 1500, freqEnd: 500, q: 0.9, dur: 0.14, gain: 0.45 * g, pan });
    },
    leap(x, y, z, mine) {
      const g = mine ? 1 : at(x, y, z, 40), pan = mine ? 0 : at.pan;
      A.noise({ filter: 'bandpass', freq: 500, freqEnd: 2600, q: 1.1, dur: 0.7, gain: 0.55 * g, attack: 0.03, pan });
      A.tone({ type: 'sawtooth', freq: 110, freqEnd: 330, dur: 0.6, gain: 0.12 * g, attack: 0.02, pan });
      A.sfx('whoosh', { gain: 0.5 * g, pan });
    },
    hop() { A.sfx('swoosh', { gain: 0.35, pitch: 1.3 }); },
    land(x, y, z, mine, hard) {
      const g = (mine ? 1 : at(x, y, z, 30)) * (hard ? 1 : 0.55);
      A.sfx('thud', { gain: 0.8 * g, pan: mine ? 0 : at.pan });
      A.noise({ filter: 'lowpass', freq: 600, freqEnd: 120, dur: 0.18, gain: 0.4 * g });
    },
    poof(x, y, z, mine) {
      const g = mine ? 1 : at(x, y, z, 40), pan = mine ? 0 : at.pan;
      A.noise({ filter: 'lowpass', freq: 3000, freqEnd: 300, dur: 0.6, gain: 0.7 * g, attack: 0.005, pan });
      A.tone({ type: 'sine', freq: 90, freqEnd: 50, dur: 0.3, gain: 0.3 * g, pan });
      A.tone({ type: 'triangle', freq: 880, freqEnd: 1760, dur: 0.12, gain: 0.08 * g, pan });
    },
    deny() { A.sfx('error', { gain: 0.3 }); },
    step() { A.noise({ filter: 'lowpass', freq: 900, dur: 0.05, gain: 0.1 }); },
    glint() { A.tone({ type: 'sine', freq: 3100, dur: 0.2, gain: 0.05 }); A.tone({ type: 'sine', freq: 4650, dur: 0.14, gain: 0.03, delay: 0.03 }); },
    train() { for (let i = 0; i < 14; i++) A.noise({ filter: 'lowpass', freq: 420, dur: 0.09, gain: 0.16 * (1 - Math.abs(i - 7) / 9), delay: i * 0.17 + (i & 1) * 0.05 }); A.tone({ type: 'sawtooth', freq: 62, dur: 2.6, gain: 0.06, attack: 0.8 }); },
    erase() { A.noise({ filter: 'bandpass', freq: 1800, freqEnd: 3800, q: 0.7, dur: 1.4, gain: 0.3, attack: 0.3 }); A.sfx('riser', { gain: 0.4 }); },
    showdown() { A.sfx('drop', { gain: 0.6 }); A.sfx('bell', { gain: 0.5, delay: 0.1 }); },
    // the splash page: one enormous hit, then a cymbal that the slow motion stretches out
    kill() {
      A.sfx('boom', { gain: 0.8 });
      A.tone({ type: 'square', freq: 330, freqEnd: 82, dur: 0.3, gain: 0.2 });
      A.noise({ filter: 'highpass', freq: 5200, dur: 1.5, gain: 0.22, attack: 0.002 });
      for (let i = 0; i < 5; i++) A.tone({ type: 'triangle', freq: [587, 698, 880, 1175, 1397][i], dur: 0.5, gain: 0.07, delay: 0.42 + i * 0.07 });
    },
  };
}
