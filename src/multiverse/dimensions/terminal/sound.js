// TTY DUEL — sound: a rifle in a server room, modem chirps and keyboard ticks.
import { clamp } from '../../kit.js';
import { W } from './world.js';

export function makeSound(ctx, amber) {
  const au = ctx.audio;
  const pan = (x) => clamp((x / W) * 2 - 1, -1, 1) * 0.7;
  const tr = amber ? 5 : 0; // the amber monitor plays a fourth higher
  let playing = '';
  let tickT = 0;

  const S = {
    shot(x, mine) {
      au.sfx(mine ? 'shotHeavy' : 'shot', { gain: mine ? 0.9 : 0.55, pan: pan(x) });
      au.tone({ freq: 2600, freqEnd: 240, type: 'sawtooth', dur: 0.14, gain: mine ? 0.07 : 0.04, pan: pan(x) });
    },
    ricochet(x) {
      au.tone({ freq: 2100, freqEnd: 760, type: 'triangle', dur: 0.2, gain: 0.1, pan: pan(x) });
      au.noise({ filter: 'bandpass', freq: 3200, q: 3, dur: 0.07, gain: 0.12, pan: pan(x) });
    },
    impact(x) {
      au.noise({ filter: 'bandpass', freq: 900, freqEnd: 300, q: 1.2, dur: 0.12, gain: 0.2, pan: pan(x) });
      au.tone({ freq: 220, freqEnd: 70, dur: 0.1, gain: 0.12, pan: pan(x) });
    },
    whizz(x) { au.sfx('whoosh', { gain: 0.4, pitch: 1.5, pan: pan(x) }); },
    ping(x) {
      au.tone({ freq: 660, freqEnd: 1760, type: 'sine', dur: 0.55, gain: 0.16, pan: pan(x) });
      au.tone({ freq: 660, freqEnd: 1760, type: 'sine', dur: 0.55, gain: 0.07, delay: 0.14, pan: pan(x) });
    },
    contact() {
      au.tone({ freq: 1320, dur: 0.09, type: 'square', gain: 0.07 });
      au.tone({ freq: 1980, dur: 0.14, type: 'square', gain: 0.07, delay: 0.1 });
    },
    pinged() {
      for (let i = 0; i < 3; i++) au.tone({ freq: 440, dur: 0.09, type: 'square', gain: 0.09, delay: i * 0.13 });
    },
    fork(x) {
      for (let i = 0; i < 5; i++) au.tone({ freq: 330 * Math.pow(1.26, i), dur: 0.06, type: 'square', gain: 0.06, delay: i * 0.05, pan: pan(x) });
    },
    pop(x) {
      au.sfx('glitch', { gain: 0.5, pan: pan(x) });
      au.tone({ freq: 900, freqEnd: 120, type: 'square', dur: 0.2, gain: 0.07, pan: pan(x) });
    },
    tick() {
      const now = au.now;
      if (now - tickT < 0.025) return;
      tickT = now;
      au.tone({ freq: 1500 + Math.random() * 700, type: 'square', dur: 0.014, gain: 0.018 });
    },
    key() { au.tone({ freq: 190, freqEnd: 90, type: 'square', dur: 0.05, gain: 0.04 }); },
    ready() { au.tone({ freq: 1200, type: 'square', dur: 0.03, gain: 0.07 }); au.tone({ freq: 800, type: 'square', dur: 0.04, gain: 0.05, delay: 0.04 }); },
    deny() { au.tone({ freq: 140, type: 'square', dur: 0.11, gain: 0.08 }); },
    inhale() { au.noise({ filter: 'bandpass', freq: 600, freqEnd: 1800, q: 0.7, dur: 0.5, gain: 0.07, attack: 0.3 }); },
    exhale() { au.noise({ filter: 'bandpass', freq: 1500, freqEnd: 500, q: 0.7, dur: 0.45, gain: 0.06, attack: 0.05 }); },
    gasp() { au.noise({ filter: 'highpass', freq: 1200, dur: 0.3, gain: 0.1, attack: 0.02 }); },
    step(x) { au.noise({ filter: 'lowpass', freq: 500, dur: 0.05, gain: 0.05, pan: pan(x) }); },
    doorWarn() { au.tone({ freq: 520, type: 'square', dur: 0.07, gain: 0.05 }); au.tone({ freq: 520, type: 'square', dur: 0.07, gain: 0.05, delay: 0.12 }); },
    doorShut(x) { au.noise({ filter: 'lowpass', freq: 400, freqEnd: 90, dur: 0.3, gain: 0.22, pan: pan(x) }); au.tone({ freq: 90, freqEnd: 40, dur: 0.25, gain: 0.15, pan: pan(x) }); },
    sweep(x) { au.tone({ freq: 70, freqEnd: 55, type: 'sawtooth', dur: 0.5, gain: 0.05, pan: pan(x) }); },
    boot() { au.tone({ freq: 220, type: 'square', dur: 0.08, gain: 0.05 }); au.tone({ freq: 440, type: 'square', dur: 0.08, gain: 0.05, delay: 0.09 }); au.tone({ freq: 880, type: 'square', dur: 0.14, gain: 0.05, delay: 0.18 }); },
    kill(x) {
      au.sfx('kill', { gain: 0.8, pan: pan(x) });
      au.tone({ freq: 700, freqEnd: 35, type: 'sawtooth', dur: 0.9, gain: 0.16 });
      for (let i = 0; i < 6; i++) au.noise({ filter: 'bandpass', freq: 800 + i * 700, q: 2, dur: 0.05, gain: 0.12, delay: i * 0.06 });
    },
    fault() { for (let i = 0; i < 4; i++) au.tone({ freq: 90, type: 'square', dur: 0.12, gain: 0.07, delay: 0.6 + i * 0.22 }); },
    sudden() { au.sfx('riser', { gain: 0.6 }); for (let i = 0; i < 3; i++) au.tone({ freq: 880, type: 'square', dur: 0.12, gain: 0.07, delay: i * 0.25 }); },
    music(kind) {
      if (playing === kind) return;
      playing = kind;
      const n = (a) => a.map((v) => (v === null ? null : v + tr));
      if (kind === 'cool') {
        au.music({
          bpm: 88, steps: 16, gain: 0.5,
          tracks: [
            { type: 'kick', notes: [1, null, null, null, null, null, null, null, 1, null, null, 1, null, null, null, null], gain: 0.34 },
            { type: 'hat', notes: [null, null, 1, null, null, null, 1, null, null, null, 1, null, null, 1, 1, null], gain: 0.09 },
            { type: 'triangle', notes: n([33, null, null, 33, null, null, 36, null, 31, null, null, 31, null, null, 38, null]), gain: 0.3, decay: 0.3 },
            { type: 'square', notes: n([69, null, 72, null, 76, null, 72, null, 67, null, 71, null, 74, null, 71, null]), gain: 0.05, decay: 0.12, cutoff: 1400 },
            { type: 'sine', notes: n([57, null, null, null, null, null, null, null, 55, null, null, null, null, null, null, null]), gain: 0.16, decay: 1.4 },
          ],
        });
      } else {
        au.music({
          bpm: 132, steps: 16, gain: 0.55,
          tracks: [
            { type: 'kick', notes: [1, null, null, null, 1, null, null, null, 1, null, null, null, 1, null, null, 1], gain: 0.4 },
            { type: 'snare', notes: [null, null, null, null, 1, null, null, null, null, null, null, null, 1, null, null, null], gain: 0.2 },
            { type: 'hat', notes: [1, null, 1, null, 1, null, 1, null, 1, null, 1, null, 1, 1, 1, 1], gain: 0.08 },
            { type: 'sawtooth', notes: n([33, 33, null, 33, 33, null, 36, 33, 31, 31, null, 31, 31, null, 38, 31]), gain: 0.2, decay: 0.12, cutoff: 900 },
            { type: 'square', notes: n([81, null, 79, null, 76, null, 79, null, 81, null, 84, null, 83, null, 79, null]), gain: 0.05, decay: 0.1, cutoff: 2200 },
          ],
        });
      }
    },
    stop(fade = 0.3) { playing = ''; au.stopMusic(fade); },
  };
  return S;
}
