// TOY BOX — everything is plastic, wood or tin, and sounds it: a spring gun with a real
// thump under it, pellets that tock off wood, clattering pieces, a tin motor, a music box.
import { clamp } from '../../kit.js';

export function makeSfx(ctx) {
  const A = ctx.audio, t = (o) => A.tone(o), n = (o) => A.noise(o), P = (x) => clamp(x / 24, -0.8, 0.8);
  let clatT = 0, hopT = 0;
  const buzz = [null, null];
  const stopBuzz = (i, fade = 0.25) => {
    const b = buzz[i];
    buzz[i] = null;
    if (!b) return;
    try { const now = b.g.context.currentTime; b.g.gain.cancelScheduledValues(now); b.g.gain.setTargetAtTime(0, now, fade / 3); for (const o of b.osc) o.stop(now + fade + 0.1); } catch { /* already gone */ }
  };

  // The music box: a lullaby in A minor that has had too much sugar.
  const N = null;
  const lead = [69, N, 72, N, 76, N, 72, N, 69, N, 72, N, 77, N, 76, N, 74, N, 71, N, 67, N, 71, N, 74, N, 76, N, 72, N, 71, N,
    69, N, 72, N, 76, N, 81, N, 79, N, 76, N, 72, N, 76, N, 74, N, 77, N, 76, N, 74, N, 72, 71, 69, N, N, N, N, N];
  const bass = [45, N, N, N, N, N, 45, N, 41, N, N, N, N, N, 41, N, 43, N, N, N, N, N, 43, N, 40, N, N, N, 40, N, 43, N];
  const tick = [1, N, N, 1, N, N, 1, N, N, N, 1, N, N, 1, N, N];
  const drum = [1, N, N, N, N, N, N, N, 1, N, N, 1, N, N, N, N];

  return {
    shot(x, mine) {
      const g = mine ? 1 : 0.72, p = P(x);
      A.sfx('shot', { gain: 0.45 * g, pitch: 1.6, pan: p });
      n({ dur: 0.06, gain: 0.55 * g, filter: 'highpass', freq: 2800, pan: p });
      t({ freq: 1500, freqEnd: 170, type: 'square', dur: 0.08, gain: 0.2 * g, pan: p }); // the crack
      t({ freq: 160, freqEnd: 48, type: 'sine', dur: 0.22, gain: 0.7 * g, pan: p }); // the thump
      t({ freq: 480, freqEnd: 820, type: 'triangle', dur: 0.14, gain: 0.1 * g, delay: 0.04, pan: p }); // the spring
      t({ freq: 760, freqEnd: 500, type: 'triangle', dur: 0.2, gain: 0.07 * g, delay: 0.1, pan: p });
    },
    cock(x) { A.sfx('click', { gain: 0.5, pitch: 0.8, pan: P(x) }); t({ freq: 300, freqEnd: 520, type: 'triangle', dur: 0.07, gain: 0.1, delay: 0.05, pan: P(x) }); A.sfx('click', { gain: 0.6, pitch: 1.3, delay: 0.14, pan: P(x) }); },
    dry() { A.sfx('click', { gain: 0.35, pitch: 0.6 }); },
    ping(x, mat) {
      const p = P(x);
      if (mat === 'wood') { t({ freq: 1040 + Math.random() * 240, freqEnd: 620, type: 'triangle', dur: 0.09, gain: 0.3, pan: p }); t({ freq: 310, freqEnd: 240, type: 'sine', dur: 0.07, gain: 0.3, pan: p }); n({ dur: 0.03, gain: 0.3, filter: 'bandpass', freq: 2200, q: 2, pan: p }); }
      else if (mat === 'soft') { n({ dur: 0.1, gain: 0.5, filter: 'lowpass', freq: 500, freqEnd: 160, pan: p }); t({ freq: 120, freqEnd: 70, type: 'sine', dur: 0.1, gain: 0.3, pan: p }); }
      else { t({ freq: 2300, freqEnd: 1700, type: 'square', dur: 0.03, gain: 0.12, pan: p }); n({ dur: 0.03, gain: 0.25, filter: 'highpass', freq: 3000, pan: p }); }
    },
    whiz(x) { n({ filter: 'bandpass', freq: 2600, freqEnd: 900, q: 3, dur: 0.18, gain: 0.3, attack: 0.01, pan: P(x) }); },
    domino(x, k) { t({ freq: 1900 + k * 60, freqEnd: 1300, type: 'square', dur: 0.025, gain: 0.1, pan: P(x) }); n({ dur: 0.03, gain: 0.22, filter: 'bandpass', freq: 3400, q: 1.5, pan: P(x) }); },
    hop(x, mine) {
      const now = A.now;
      if (now - hopT < 0.09) return;
      hopT = now;
      t({ freq: 420 + Math.random() * 80, freqEnd: 260, type: 'triangle', dur: 0.035, gain: mine ? 0.09 : 0.05, pan: P(x) });
    },
    kneel(x, down) { n({ dur: 0.07, gain: 0.2, filter: 'lowpass', freq: down ? 700 : 1100, pan: P(x) }); t({ freq: down ? 260 : 340, freqEnd: down ? 190 : 420, type: 'triangle', dur: 0.06, gain: 0.12, pan: P(x) }); },
    roll(x) { A.sfx('swoosh', { gain: 0.5, pitch: 1.3, pan: P(x) }); t({ freq: 380, freqEnd: 240, type: 'triangle', dur: 0.05, gain: 0.2, delay: 0.34, pan: P(x) }); n({ dur: 0.04, gain: 0.25, filter: 'bandpass', freq: 1800, delay: 0.34, pan: P(x) }); },
    shove(x) { t({ freq: 240, freqEnd: 150, type: 'triangle', dur: 0.08, gain: 0.25, pan: P(x) }); n({ dur: 0.05, gain: 0.25, filter: 'bandpass', freq: 1200, pan: P(x) }); },
    pop(x) { t({ freq: 520, freqEnd: 1300, type: 'sine', dur: 0.07, gain: 0.16, pan: P(x) }); n({ dur: 0.04, gain: 0.14, filter: 'highpass', freq: 3500, pan: P(x) }); },
    toot(x) { for (const [f, d] of [[659, 0], [784, 0], [659, 0.2], [784, 0.2]]) t({ freq: f, type: 'square', dur: 0.14, gain: 0.03, attack: 0.02, delay: d, pan: P(x) }); },
    chuff(x) { n({ dur: 0.09, gain: 0.07, filter: 'bandpass', freq: 900, freqEnd: 500, q: 0.8, pan: P(x) }); },
    car(dir) { n({ dur: 3.4, gain: 0.2, filter: 'lowpass', freq: 260, freqEnd: 420, attack: 1.4, pan: -dir * 0.5 }); n({ dur: 2.4, gain: 0.08, filter: 'bandpass', freq: 1100, freqEnd: 500, q: 0.6, attack: 1.2, delay: 0.5, pan: dir * 0.5 }); },
    lightsOn() { A.sfx('click', { gain: 0.9, pitch: 0.7 }); t({ freq: 96, type: 'sine', dur: 0.6, gain: 0.25 }); },
    burst(x) {
      const p = P(x);
      A.sfx('shatter', { gain: 0.5, pitch: 1.5, pan: p });
      t({ freq: 900, freqEnd: 200, type: 'square', dur: 0.1, gain: 0.2, pan: p });
      t({ freq: 180, freqEnd: 60, type: 'sine', dur: 0.3, gain: 0.5, pan: p });
      n({ dur: 0.2, gain: 0.5, filter: 'bandpass', freq: 3200, freqEnd: 1400, q: 0.7, pan: p });
      for (const [f, d] of [[1319, 0.5], [1047, 0.72], [880, 0.94]]) t({ freq: f, type: 'sine', dur: 0.5, gain: 0.07, delay: d }); // the music box winds down
    },
    // one piece of plastic meeting the floorboards
    clatter(x, k) {
      const now = A.now;
      if (now - clatT < 0.035) return;
      clatT = now;
      t({ freq: 1500 + Math.random() * 1900, freqEnd: 900, type: 'square', dur: 0.022, gain: 0.05 + 0.1 * k, pan: P(x) });
      n({ dur: 0.03, gain: 0.1 + 0.2 * k, filter: 'bandpass', freq: 2600 + Math.random() * 1500, q: 2, pan: P(x) });
    },
    copterOut(x) { t({ freq: 300, freqEnd: 900, type: 'sawtooth', dur: 0.3, gain: 0.07, pan: P(x) }); for (let i = 0; i < 5; i++) A.sfx('click', { gain: 0.3, pitch: 1.6 + i * 0.12, delay: i * 0.035, pan: P(x) }); },
    spotted() { for (let i = 0; i < 3; i++) t({ freq: 1320, type: 'square', dur: 0.06, gain: 0.07, delay: i * 0.11 }); },
    // A tin motor: two detuned saws chopped by the rotor. Runs while a copter is up.
    buzz(i, on, x, k) {
      if (!on) { stopBuzz(i); return; }
      const out = A.out;
      if (!out) return;
      if (!buzz[i]) {
        try {
          const c = out.context, g = c.createGain(), f = c.createBiquadFilter(), lfo = c.createOscillator(), lg = c.createGain(), o1 = c.createOscillator(), o2 = c.createOscillator();
          o1.type = 'sawtooth'; o2.type = 'square'; o1.frequency.value = 118 + i * 9; o2.frequency.value = 236 + i * 17;
          f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.7;
          lfo.frequency.value = 31; lg.gain.value = 0.02; g.gain.value = 0;
          lfo.connect(lg); lg.connect(g.gain); o1.connect(f); o2.connect(f); f.connect(g); g.connect(out);
          for (const o of [o1, o2, lfo]) o.start();
          buzz[i] = { g, osc: [o1, o2, lfo], o1, o2 };
        } catch { buzz[i] = null; return; }
      }
      try { const b = buzz[i], now = b.g.context.currentTime; b.g.gain.setTargetAtTime(0.035 * k, now, 0.08); b.o1.frequency.setTargetAtTime((118 + i * 9) * (0.6 + 0.4 * k), now, 0.1); b.o2.frequency.setTargetAtTime((236 + i * 17) * (0.6 + 0.4 * k), now, 0.1); } catch { /* audio went away */ }
    },
    music(sudden) {
      A.music({
        bpm: sudden ? 132 : 104, gain: 0.42,
        tracks: [
          { type: 'sine', notes: lead, gain: 0.5, decay: 0.5 },
          { type: 'triangle', notes: lead.map((v) => (v ? v + 12 : v)), gain: 0.14, decay: 0.25 },
          { type: 'triangle', notes: bass, gain: 0.55, decay: 0.34, cutoff: 700 },
          { type: 'hat', notes: sudden ? tick.map((v, i) => (i & 1 ? v : 1)) : tick, gain: 0.16 },
          { type: 'kick', notes: drum, gain: sudden ? 0.6 : 0.42 },
        ],
      });
    },
    dispose() { stopBuzz(0, 0.05); stopBuzz(1, 0.05); A.stopMusic(0.3); },
  };
}
