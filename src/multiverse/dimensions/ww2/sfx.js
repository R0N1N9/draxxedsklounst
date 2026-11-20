// IRON AUTUMN — the sound of it. Everything goes through ctx.audio; distance sets level
// and a little delay (sound is slower than a bullet's flash), bearing sets the pan.
import { clamp } from '../../kit.js';

// A slow march for a dead town: field drum, a drone on D, a horn that keeps losing its place.
const n = null;
export const MUSIC = {
  bpm: 76, gain: 0.42,
  tracks: [
    { type: 'snare', gain: 0.1, decay: 0.09, cutoff: 2400, notes: [1, n, n, 1, n, n, 1, 1, 1, n, n, 1, n, 1, 1, 1, 1, n, n, 1, n, n, 1, 1, 1, n, 1, 1, 1, 1, 1, 1] },
    { type: 'kick', gain: 0.34, decay: 0.42, notes: [1, n, n, n, n, n, n, n, 1, n, n, n, n, n, 1, n] },
    { type: 'sawtooth', gain: 0.11, decay: 3.4, cutoff: 190, notes: [38, ...Array(15).fill(n), 38, ...Array(15).fill(n), 34, ...Array(15).fill(n), 33, ...Array(15).fill(n)] },
    { type: 'sine', gain: 0.07, decay: 3.2, notes: [57, ...Array(15).fill(n), 62, ...Array(15).fill(n), 58, ...Array(15).fill(n), 57, ...Array(15).fill(n)] },
    {
      type: 'triangle', gain: 0.085, decay: 1.1, cutoff: 1500,
      notes: [69, n, n, n, n, n, 65, n, 64, n, n, n, 62, n, n, n, n, n, n, n, n, n, n, n, 62, n, 64, n, 65, n, n, n,
        67, n, n, n, n, n, 65, n, 62, n, n, n, 61, n, n, n, 62, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n],
    },
  ],
};

export function makeSfx(ctx) {
  const au = ctx.audio;
  const ear = { x: 0, y: 0, z: 0, rx: 1, rz: 0 }; // listener position and right vector (set by the camera)
  let dist = 0, pan = 0, level = 1, late = 0;
  // Work out level / pan / delay for a sound at (x, y, z); `reach` = metres at which it has halved.
  function place(x, y, z, reach = 30) {
    const dx = x - ear.x, dy = y - ear.y, dz = z - ear.z;
    dist = Math.hypot(dx, dy, dz);
    pan = dist > 0.5 ? clamp(((dx * ear.rx + dz * ear.rz) / dist) * 0.8, -0.8, 0.8) : 0;
    level = 1 / (1 + dist / reach);
    late = Math.min(0.6, dist / 340);
  }
  return {
    ear,
    music() { au.music(MUSIC); },
    shot(x, y, z, mine) {
      place(x, y, z, 70);
      au.sfx('shotHeavy', { gain: (mine ? 1 : 0.9) * level, pitch: 1.18, pan, delay: late });
      au.noise({ filter: 'highpass', freq: 2600, dur: 0.07, gain: 0.5 * level, attack: 0.001, pan, delay: late });
      // The square answers: two slaps off the frontages.
      au.noise({ filter: 'bandpass', freq: 900, freqEnd: 350, q: 0.7, dur: 0.5, gain: 0.22 * level, attack: 0.02, delay: late + 0.16, pan: -0.5 });
      au.noise({ filter: 'bandpass', freq: 700, freqEnd: 260, q: 0.7, dur: 0.7, gain: 0.16 * level, attack: 0.03, delay: late + 0.31, pan: 0.5 });
    },
    // Bolt up-back, forward-down; `step` 0..3.
    bolt(step) { au.sfx('click', { gain: 0.55, pitch: [1.5, 0.8, 1.1, 1.7][step] || 1 }); if (step === 1) au.tone({ freq: 2800, freqEnd: 3600, type: 'triangle', dur: 0.09, gain: 0.05, delay: 0.05 }); },
    clip() { for (let i = 0; i < 5; i++) au.sfx('click', { gain: 0.4, pitch: 0.9 + i * 0.12, delay: 0.5 + i * 0.16 }); au.tone({ freq: 2100, type: 'triangle', dur: 0.25, gain: 0.07, delay: 1.45 }); },
    dry() { au.sfx('click', { gain: 0.4, pitch: 2.2 }); },
    impact(x, y, z, surf) {
      place(x, y, z, 22);
      if (surf === 'metal') { au.tone({ freq: 2300 + Math.random() * 900, freqEnd: 1500, type: 'triangle', dur: 0.4, gain: 0.3 * level, attack: 0.001, pan, delay: late }); au.sfx('hit', { gain: 0.5 * level, pan, delay: late }); }
      else if (surf === 'dirt' || surf === 'sand') au.noise({ filter: 'lowpass', freq: 900, freqEnd: 200, dur: 0.16, gain: 0.8 * level, attack: 0.002, pan, delay: late });
      else { au.noise({ filter: 'bandpass', freq: 2600, freqEnd: 900, q: 1.2, dur: 0.12, gain: 0.8 * level, attack: 0.001, pan, delay: late }); if (Math.random() < 0.4) au.tone({ freq: 3200, freqEnd: 900, type: 'sine', dur: 0.5, gain: 0.1 * level, attack: 0.01, pan, delay: late + 0.02 }); }
    },
    // A round going past your head: the crack, then the air closing behind it.
    crack(side) { au.noise({ filter: 'highpass', freq: 3500, dur: 0.05, gain: 0.9, attack: 0.001, pan: side }); au.noise({ filter: 'bandpass', freq: 1800, freqEnd: 500, q: 2, dur: 0.3, gain: 0.5, attack: 0.01, pan: -side, delay: 0.03 }); },
    step(crouched) { au.noise({ filter: 'lowpass', freq: crouched ? 500 : 800, dur: 0.07, gain: crouched ? 0.1 : 0.2, attack: 0.004 }); },
    whistle(x, z, dur) { place(x, 20, z, 45); au.tone({ freq: 620, freqEnd: 1750, type: 'sine', dur, gain: 0.22 * level + 0.03, attack: dur * 0.9, pan }); au.noise({ filter: 'bandpass', freq: 900, freqEnd: 3200, q: 6, dur, gain: 0.5 * level, attack: dur * 0.92, pan }); },
    shell(x, y, z) {
      place(x, y, z, 40);
      au.sfx('boom', { gain: 0.35 + 0.9 * level, pan, delay: late });
      au.noise({ filter: 'bandpass', freq: 3000, freqEnd: 600, q: 0.8, dur: 1.3, gain: 0.25 * level, attack: 0.3, pan, delay: late + 0.25 }); // debris coming back down
      return level;
    },
    bell(gain = 1, pitch = 0.5) { place(35, 21, 0, 90); au.sfx('bell', { gain: gain * (0.35 + 0.65 * level), pitch, pan }); },
    ring(x, y, z, pitch = 3) { place(x, y, z, 30); au.sfx('bell', { gain: 0.5 * level + 0.1, pitch, pan }); au.sfx('hit', { gain: 0.7 * level, pan }); },
    clink(x, y, z, g = 1) { place(x, y, z, 14); au.tone({ freq: 1900 + Math.random() * 500, type: 'triangle', dur: 0.18, gain: 0.25 * level * g, attack: 0.001, pan }); },
    thud(x, y, z) { place(x, y, z, 20); au.sfx('thud', { gain: level, pan }); },
    throwIt() { au.sfx('click', { gain: 0.5, pitch: 1.9 }); au.sfx('swoosh', { gain: 0.35, pitch: 1.3, delay: 0.05 }); },
    smokePop(x, y, z) { place(x, y, z, 30); au.noise({ filter: 'lowpass', freq: 1200, freqEnd: 300, dur: 0.25, gain: 0.8 * level, attack: 0.002, pan }); au.noise({ filter: 'highpass', freq: 4200, dur: 4.5, gain: 0.12 * level, attack: 0.2, pan, delay: 0.05 }); },
    decoy() { au.sfx('click', { gain: 0.5, pitch: 0.7 }); au.tone({ freq: 1500, type: 'triangle', dur: 0.12, gain: 0.08, delay: 0.12 }); },
    flare(x, z) { place(x, 35, z, 80); au.noise({ filter: 'bandpass', freq: 500, freqEnd: 1800, q: 3, dur: 0.5, gain: 0.3 * level, attack: 0.4, pan }); au.sfx('thud', { gain: 0.5 * level, pitch: 1.6, delay: 0.5, pan }); au.noise({ filter: 'highpass', freq: 5200, dur: 6, gain: 0.05 * level, attack: 0.3, delay: 0.55, pan }); },
    creak() { place(-11, 3, 0, 45); au.tone({ freq: 70 + Math.random() * 30, freqEnd: 45, type: 'sawtooth', dur: 0.7, gain: 0.2 * level, attack: 0.2, pan }); au.noise({ filter: 'bandpass', freq: 400, freqEnd: 900, q: 5, dur: 0.5, gain: 0.5 * level, attack: 0.3, pan }); },
    collapse() { place(-11, 3, 0, 55); au.sfx('boom', { gain: 0.5 + 0.6 * level, pitch: 0.7, pan }); au.noise({ filter: 'lowpass', freq: 700, freqEnd: 120, dur: 2.6, gain: 1.1 * level, attack: 0.25, pan }); for (let i = 0; i < 6; i++) au.sfx('thud', { gain: 0.6 * level, pitch: 0.7 + Math.random() * 0.6, delay: 0.3 + i * 0.22 + Math.random() * 0.1, pan }); },
    marked() { au.sfx('blip', { gain: 0.5, pitch: 0.6 }); },
    breath(inhale) { au.noise({ filter: 'bandpass', freq: inhale ? 900 : 600, freqEnd: inhale ? 1400 : 380, q: 1.2, dur: 1.2, gain: 0.05, attack: 0.5 }); },
    // Background war: it never quite stops. Called at random from the game's update.
    distant(kind) {
      if (kind === 0) { const p = Math.random() * 1.6 - 0.8; au.tone({ freq: 62, freqEnd: 34, dur: 1.1, gain: 0.2, attack: 0.03, pan: p }); au.noise({ filter: 'lowpass', freq: 240, freqEnd: 70, dur: 1.6, gain: 0.5, attack: 0.05, pan: p }); }
      else if (kind === 1) { const p = Math.random() * 1.6 - 0.8, k = 5 + ((Math.random() * 7) | 0); for (let i = 0; i < k; i++) au.noise({ filter: 'bandpass', freq: 900, q: 1.5, dur: 0.05, gain: 0.12, attack: 0.002, delay: i * 0.085, pan: p }); }
      else au.noise({ filter: 'bandpass', freq: 320, freqEnd: 520, q: 1.4, dur: 7, gain: 0.07, attack: 3, pan: Math.random() * 1.2 - 0.6 }); // wind through the frontages
    },
    drone(gain) { for (const f of [68, 71.5, 103]) au.tone({ freq: f, type: 'sawtooth', dur: 5, gain: 0.02 * gain, attack: 2.2 }); },
    flak(g) { au.tone({ freq: 90, freqEnd: 50, dur: 0.35, gain: 0.12 * g, attack: 0.01, delay: 0.9 }); au.noise({ filter: 'lowpass', freq: 500, freqEnd: 150, dur: 0.4, gain: 0.3 * g, attack: 0.01, delay: 0.9 }); },
  };
}
