// Synthesized audio kit shared by every Multiverse dimension and transition
// (contract.js section 4). It rides on the valley game's Audio instance: same
// context, same master bus and compressor. That context only exists after the
// first user gesture, so every entry point re-reads base.ctx / base.master and
// is a no-op until they do.
//
//   one-shots ──→ fx bus ───────────────────────┐
//   music ──→ pattern gain ──→ music bus (duck) ─┼──→ out (kit volume) ──→ base.master
//   a module's own nodes ───────────────────────┘
//
// There are no timers in here: the director calls update() once per frame, and
// that runs the music scheduler and the housekeeping.

const MAX_VOICES = 48;  // one-shot cap; past it new sounds are dropped, never queued
const HARD_VOICES = 72; // an sfx admitted under the cap may still finish its own layers
const MAX_MUSIC = 64;
const LOOKAHEAD = 0.2;  // seconds of music scheduled ahead of the audio clock
const XFADE = 0.3;
const EPS = 1e-4;       // exponential ramps can neither start from nor reach zero
const FLOOR = 1e-3;     // envelopes fall 60 dB over their duration...
const TAIL = 0.01;      // ...then run out linearly to a true zero

const WAVES = new Set(['sine', 'square', 'sawtooth', 'triangle']);
const FILTERS = new Set(['lowpass', 'highpass', 'bandpass', 'lowshelf', 'highshelf', 'peaking', 'notch', 'allpass']);
// Drum voices [default gain, default decay]: a kick at a lead's 0.2 would vanish in the mix.
const DRUMS = { __proto__: null, kick: [0.5, 0.3], snare: [0.3, 0.17], hat: [0.12, 0.06], noise: [0.2, 0.08] };

const num = (v, d, lo, hi) => (Number.isFinite(v) ? (v < lo ? lo : v > hi ? hi : v) : d);
const off = (n) => { try { n.disconnect(); } catch {} };

// Recipes. T = tone, N = noise (options as in the public methods; the caller's
// gain / pitch / delay / pan are folded in by sfx()), R = Math.random.
// Envelopes fall 60 dB over `dur`, so a layer is audible for roughly half of it.
const SFX = {
  __proto__: null,

  // Dry rifle crack: bright transient, a short bark, a low thump. No tail.
  shot(T, N, R) {
    const k = 0.96 + R() * 0.08; // no two rounds sound identical
    N({ filter: 'highpass', freq: 3000, q: 0.5, dur: 0.06, gain: 0.28, attack: 0.001 });
    N({ filter: 'bandpass', freq: 1700 * k, freqEnd: 480, q: 0.9, dur: 0.17, gain: 0.8, attack: 0.001 });
    N({ filter: 'lowpass', freq: 750 * k, freqEnd: 200, q: 0.7, dur: 0.22, gain: 0.6, attack: 0.002 });
    T({ freq: 155 * k, freqEnd: 48, dur: 0.18, gain: 0.32, attack: 0.002 });
  },

  // Anti-materiel: the same crack an octave down, a sub boom and a tail that rolls away.
  shotHeavy(T, N, R) {
    const k = 0.96 + R() * 0.08;
    N({ filter: 'highpass', freq: 2000, q: 0.5, dur: 0.1, gain: 0.25, attack: 0.001 });
    N({ filter: 'bandpass', freq: 1100 * k, freqEnd: 240, q: 0.7, dur: 0.5, gain: 0.75, attack: 0.001 });
    N({ filter: 'lowpass', freq: 520, freqEnd: 90, q: 0.8, dur: 1.7, gain: 1.0, attack: 0.004 });
    T({ freq: 120 * k, freqEnd: 30, dur: 1.0, gain: 0.36, attack: 0.002 });
    // A knock an octave up: the sub alone is inaudible on tablet speakers.
    T({ type: 'triangle', freq: 240 * k, freqEnd: 52, dur: 0.32, gain: 0.18, attack: 0.001 });
    N({ filter: 'bandpass', freq: 800, freqEnd: 300, q: 0.6, dur: 0.7, gain: 0.3, attack: 0.02, delay: 0.19 }); // slap-back
  },

  laser(T, N) {
    T({ type: 'sawtooth', freq: 2400, freqEnd: 260, dur: 0.26, gain: 0.15 });
    T({ type: 'square', freq: 1200, freqEnd: 130, dur: 0.22, gain: 0.09, detune: 14 });
    T({ freq: 3600, freqEnd: 600, dur: 0.12, gain: 0.12 });
    N({ filter: 'highpass', freq: 5000, dur: 0.04, gain: 0.1, attack: 0.001 });
  },

  // Electric arc: mains buzz under two falling squeals, crackle, a re-strike.
  zap(T, N) {
    T({ type: 'sawtooth', freq: 92, freqEnd: 60, dur: 0.24, gain: 0.16 });
    T({ type: 'square', freq: 1900, freqEnd: 220, dur: 0.1, gain: 0.11 });
    T({ type: 'square', freq: 2600, freqEnd: 400, dur: 0.08, gain: 0.09, delay: 0.06 });
    N({ filter: 'bandpass', freq: 4500, freqEnd: 1500, q: 3, dur: 0.2, gain: 0.7, attack: 0.001 });
    N({ filter: 'highpass', freq: 6000, dur: 0.03, gain: 0.14, attack: 0.001, delay: 0.09 });
  },

  // Body in the 100-300 Hz range: anything lower is lost on small speakers.
  thud(T, N, R) {
    const k = 0.95 + R() * 0.1;
    T({ freq: 170 * k, freqEnd: 55, dur: 0.22, gain: 0.36, attack: 0.002 });
    T({ type: 'triangle', freq: 300 * k, freqEnd: 90, dur: 0.12, gain: 0.28, attack: 0.002 });
    N({ filter: 'lowpass', freq: 700, freqEnd: 150, dur: 0.13, gain: 0.9, attack: 0.002 });
  },

  // Sub-drop explosion: crack, a fireball that closes down, rumble, falling sub.
  boom(T, N) {
    N({ filter: 'highpass', freq: 2500, q: 0.5, dur: 0.07, gain: 0.22, attack: 0.001 });
    N({ filter: 'lowpass', freq: 3000, freqEnd: 90, q: 0.7, dur: 1.1, gain: 0.7, attack: 0.003 });
    N({ filter: 'bandpass', freq: 260, freqEnd: 70, q: 0.8, dur: 2.2, gain: 1.2, attack: 0.05 });
    T({ freq: 110, freqEnd: 26, dur: 1.5, gain: 0.38, attack: 0.003 });
    T({ type: 'triangle', freq: 200, freqEnd: 40, dur: 0.5, gain: 0.18, attack: 0.002 });
  },

  // Round on target: a snap and a short falling knock. Light, not meaty.
  hit(T, N, R) {
    const k = 0.95 + R() * 0.1;
    N({ filter: 'bandpass', freq: 2800 * k, freqEnd: 1200, q: 1.4, dur: 0.08, gain: 0.7, attack: 0.001 });
    T({ type: 'triangle', freq: 640 * k, freqEnd: 190, dur: 0.12, gain: 0.24, attack: 0.001 });
    T({ type: 'square', freq: 1500 * k, freqEnd: 900, dur: 0.04, gain: 0.06, attack: 0.001 });
    T({ freq: 110, freqEnd: 55, dur: 0.1, gain: 0.2, attack: 0.002 });
  },

  // Two-note confirmation, a rising fifth: short A5 with a thump, then E6 left to ring.
  kill(T, N) {
    T({ type: 'triangle', freq: 880, dur: 0.16, gain: 0.26 });
    T({ freq: 1760, dur: 0.12, gain: 0.08 });
    T({ freq: 120, freqEnd: 50, dur: 0.16, gain: 0.3, attack: 0.002 });
    N({ filter: 'highpass', freq: 6000, dur: 0.02, gain: 0.08, attack: 0.001 });
    T({ type: 'triangle', freq: 1318.5, dur: 0.55, gain: 0.3, delay: 0.085 });
    T({ freq: 2637, dur: 0.5, gain: 0.1, delay: 0.085 });
    T({ freq: 3955.5, dur: 0.3, gain: 0.035, delay: 0.085 });
  },

  // Air sweeping up and past; swoosh is its mirror image.
  whoosh(T, N) {
    N({ filter: 'bandpass', freq: 250, freqEnd: 3800, q: 1.6, dur: 0.55, gain: 0.9, attack: 0.3 });
    N({ filter: 'bandpass', freq: 500, freqEnd: 7600, q: 0.8, dur: 0.5, gain: 0.3, attack: 0.33 });
  },

  swoosh(T, N) {
    N({ filter: 'bandpass', freq: 4200, freqEnd: 260, q: 1.6, dur: 0.5, gain: 0.8, attack: 0.12 });
    N({ filter: 'bandpass', freq: 8400, freqEnd: 520, q: 0.8, dur: 0.45, gain: 0.25, attack: 0.1 });
  },

  // 1.5 s of rising tension that stops dead at the top: follow it with 'drop' or 'boom'.
  riser(T, N) {
    const d = 1.5;
    N({ filter: 'bandpass', freq: 300, freqEnd: 7000, q: 2.5, dur: d, gain: 0.7, attack: d * 0.93 });
    N({ filter: 'bandpass', freq: 600, freqEnd: 12000, q: 1.2, dur: d, gain: 0.25, attack: d * 0.95 });
    T({ type: 'sawtooth', freq: 110, freqEnd: 880, dur: d, gain: 0.07, attack: d * 0.92, detune: -16, pan: -0.4 });
    T({ type: 'sawtooth', freq: 110, freqEnd: 880, dur: d, gain: 0.07, attack: d * 0.92, detune: 16, pan: 0.4 });
    T({ type: 'sawtooth', freq: 55, freqEnd: 440, dur: d, gain: 0.07, attack: d * 0.92 });
    T({ freq: 440, freqEnd: 3520, dur: d, gain: 0.04, attack: d * 0.95 });
  },

  // The release: snap, a sweep falling out of the sky, the sub dropping away.
  drop(T, N) {
    N({ filter: 'highpass', freq: 3000, q: 0.5, dur: 0.05, gain: 0.2, attack: 0.001 });
    N({ filter: 'lowpass', freq: 8000, freqEnd: 100, q: 1.2, dur: 0.9, gain: 0.36, attack: 0.002 });
    T({ freq: 180, freqEnd: 30, dur: 1.3, gain: 0.45, attack: 0.003 });
    T({ type: 'sawtooth', freq: 880, freqEnd: 55, dur: 0.6, gain: 0.07, detune: -12, pan: -0.3 });
    T({ type: 'sawtooth', freq: 880, freqEnd: 55, dur: 0.6, gain: 0.07, detune: 12, pan: 0.3 });
  },

  // 4-6 gated square blips on a coarse pitch grid, stuttering like a stuck buffer.
  glitch(T, N, R) {
    const grid = [110, 165, 220, 330, 440, 660, 880, 1320, 1760, 2640];
    const n = 4 + Math.floor(R() * 3);
    let at = 0;
    let f = 0;
    for (let i = 0; i < n; i++) {
      if (!f || R() > 0.4) f = grid[Math.floor(R() * grid.length)]; // else repeat: the stutter
      const len = 0.02 + R() * 0.04;
      const pan = R() * 1.2 - 0.6;
      T({ type: 'square', freq: f, dur: len * 1.6, gain: 0.14, attack: 0.001, delay: at, pan });
      // Narrow noise at an unrelated pitch stands in for aliasing.
      if (R() < 0.6) N({ filter: 'bandpass', freq: 1500 + R() * 6500, q: 9, dur: len, gain: 1.2, attack: 0.001, delay: at, pan: -pan });
      at += len + (R() < 0.3 ? 0.03 + R() * 0.05 : 0.004);
    }
  },

  blip(T) {
    T({ type: 'square', freq: 990, dur: 0.07, gain: 0.12, attack: 0.002 });
    T({ freq: 1980, dur: 0.09, gain: 0.1 });
  },

  click(T, N) {
    N({ filter: 'bandpass', freq: 3800, q: 3, dur: 0.03, gain: 0.7, attack: 0.001 });
    T({ type: 'triangle', freq: 1900, freqEnd: 900, dur: 0.025, gain: 0.14, attack: 0.001 });
  },

  // Open fifth and octave, each with a glassy inharmonic partial.
  chime(T) {
    const notes = [1046.5, 1568, 2093];
    for (let i = 0; i < 3; i++) {
      T({ freq: notes[i], dur: 0.8 + i * 0.25, gain: 0.2, delay: i * 0.08, pan: (i - 1) * 0.25 });
      T({ freq: notes[i] * 3.01, dur: 0.3, gain: 0.035, delay: i * 0.08, pan: (i - 1) * 0.25 });
    }
  },

  // Major arpeggio racing up over a swell.
  powerup(T, N) {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    for (let i = 0; i < 5; i++) {
      T({ type: 'square', freq: notes[i], dur: i === 4 ? 0.5 : 0.14, gain: 0.1, delay: i * 0.055 });
      if (i > 1) T({ type: 'triangle', freq: notes[i] * 2, dur: i === 4 ? 0.6 : 0.16, gain: 0.08, delay: i * 0.055 });
    }
    T({ type: 'sawtooth', freq: 262, freqEnd: 2093, dur: 0.36, gain: 0.05, attack: 0.3 });
    N({ filter: 'bandpass', freq: 5000, freqEnd: 9000, q: 1.5, dur: 0.4, gain: 0.08, attack: 0.2, delay: 0.1 });
  },

  // Two buzzes a tritone apart, falling: unmistakably "no".
  error(T) {
    T({ type: 'sawtooth', freq: 196, dur: 0.22, gain: 0.2 });
    T({ type: 'square', freq: 98, dur: 0.22, gain: 0.15, detune: 9 });
    T({ type: 'sawtooth', freq: 138.6, dur: 0.42, gain: 0.22, delay: 0.16 });
    T({ type: 'square', freq: 69.3, dur: 0.42, gain: 0.17, delay: 0.16, detune: -9 });
  },

  // Church-bell partial series (hum, prime, tierce, quint, nominal...): the upper
  // partials die first, which is what makes it read as struck metal.
  bell(T, N) {
    const parts = [[0.5, 0.12, 4.2], [1, 0.155, 3.6], [1.183, 0.085, 3.0], [1.506, 0.063, 2.4], [2, 0.1, 2.0], [2.514, 0.05, 1.5], [2.662, 0.04, 1.2], [3.011, 0.035, 0.9], [4.166, 0.02, 0.6]];
    for (const [r, g, d] of parts) T({ freq: 440 * r, dur: d, gain: g, attack: 0.002 });
    N({ filter: 'bandpass', freq: 3200, q: 1.2, dur: 0.05, gain: 0.3, attack: 0.001 }); // clapper
  },

  // Glass: the break, hissing debris, and shards ringing at unrelated pitches.
  shatter(T, N, R) {
    N({ filter: 'highpass', freq: 4500, q: 0.7, dur: 0.3, gain: 0.26, attack: 0.001 });
    N({ filter: 'bandpass', freq: 8000, freqEnd: 3000, q: 3, dur: 0.75, gain: 0.5, attack: 0.002, delay: 0.02 });
    const shards = [1860, 2480, 3170, 3990, 4760, 5830, 7120];
    for (let i = 0; i < shards.length; i++) {
      T({
        type: i & 1 ? 'triangle' : 'sine', freq: shards[i] * (0.94 + R() * 0.12), dur: 0.14 + R() * 0.45,
        gain: 0.07 + R() * 0.05, attack: 0.001, delay: i ? R() * 0.2 : 0, pan: R() * 1.4 - 0.7,
      });
    }
  },

  tick(T, N) {
    T({ type: 'triangle', freq: 1000, dur: 0.07, gain: 0.28, attack: 0.001 });
    T({ freq: 2000, dur: 0.04, gain: 0.09, attack: 0.001 });
    N({ filter: 'bandpass', freq: 4200, q: 2, dur: 0.012, gain: 0.35, attack: 0.001 });
  },

  // Lub-dub: the first sound is lower and longer, the second higher and shorter.
  // Each has an octave partial and a puff of noise so it survives small speakers.
  heartbeat(T, N) {
    T({ freq: 100, freqEnd: 55, dur: 0.24, gain: 0.4, attack: 0.012 });
    T({ type: 'triangle', freq: 200, freqEnd: 100, dur: 0.15, gain: 0.28, attack: 0.008 });
    N({ filter: 'lowpass', freq: 400, dur: 0.1, gain: 0.8, attack: 0.01 });
    T({ freq: 125, freqEnd: 68, dur: 0.17, gain: 0.3, attack: 0.01, delay: 0.27 });
    T({ type: 'triangle', freq: 250, freqEnd: 125, dur: 0.1, gain: 0.22, attack: 0.008, delay: 0.27 });
    N({ filter: 'lowpass', freq: 480, dur: 0.07, gain: 0.65, attack: 0.008, delay: 0.27 });
  },
};

// Copy and sanitise a MusicSpec once, so the scheduler never meets bad data and
// later mutation of the caller's object cannot desync it. null = nothing playable.
// spec.steps is not needed: a step is always a 16th and every track loops over
// its own notes, whatever their number.
function normSpec(spec) {
  if (!spec || typeof spec !== 'object' || !Array.isArray(spec.tracks)) return null;
  const tracks = [];
  for (const tr of spec.tracks) {
    if (tracks.length >= 16) break;
    if (!tr || typeof tr !== 'object' || !Array.isArray(tr.notes) || !tr.notes.length) continue;
    const drum = DRUMS[tr.type];
    if (!drum && !WAVES.has(tr.type)) continue;
    const gain = num(tr.gain, drum ? drum[0] : 0.2, 0, 2);
    if (gain < EPS) continue;
    const src = tr.notes.length > 1024 ? tr.notes.slice(0, 1024) : tr.notes;
    // Rests become 0. Besides null that covers 0 / false / NaN, which authors
    // write for "no hit" far more often than they mean a hit by them.
    const notes = src.map(drum ? (n) => (n ? 1 : 0) : (n) => (Number.isFinite(n) && n > 0 ? n : 0));
    tracks.push({
      type: tr.type, notes, gain,
      decay: num(tr.decay, drum ? drum[1] : 0.18, 0.01, 8),
      cutoff: num(tr.cutoff, 0, 20, 20000),
    });
  }
  if (!tracks.length) return null;
  const snap = { bpm: num(spec.bpm, 120, 20, 400), gain: num(spec.gain, 0.5, 0, 2), tracks };
  snap.sig = JSON.stringify(snap);
  return snap;
}

export class AudioKit {
  constructor(base) {
    this.base = base || null;
    this._vol = 1;
    this._out = null;         // kit bus → base.master
    this._master = null;
    this._fx = null;          // one-shot bus; stopAll swaps it so a fade cannot swallow the next scene
    this._mus = null;         // music bus; duck() rides it
    this._live = new Set();   // one-shot voices, counted against the cap
    this._mlive = new Set();  // music voices
    this._dying = new Set();  // voices cut short, waiting for their ended event
    this._retired = [];       // faded buses to disconnect once silent: { at, nodes }
    this._music = null;       // the playing pattern
    this._want = null;        // pattern asked for while locked; update() starts it after the unlock
    this._burst = false;      // inside an sfx recipe (see HARD_VOICES)
    this._own = null;         // our noise buffer, when base has none
  }

  get ctx() {
    const b = this.base;
    return (b && b.ctx) || null;
  }

  get out() {
    try {
      const b = this.base;
      const ctx = b && b.ctx;
      const master = b && b.master;
      if (!ctx || !master || ctx.state === 'closed') return null;
      if (!this._out || this._out.context !== ctx || this._master !== master) this._build(ctx, master);
      return this._out;
    } catch {
      return null;
    }
  }

  get now() {
    const c = this.ctx;
    return (c && c.currentTime) || 0;
  }

  tone(o) {
    try {
      const bus = this._bus();
      if (!bus || !o || !Number.isFinite(o.freq) || o.freq <= 0 || !this._room()) return;
      const ctx = bus.context;
      const top = Math.min(20000, ctx.sampleRate * 0.45);
      const peak = num(o.gain, 0.25, 0, 4);
      if (peak < EPS) return;
      const dur = num(o.dur, 0.2, 0.005, 30);
      this._osc(
        bus, this._live, null, ctx.currentTime + num(o.delay, 0, 0, 60), WAVES.has(o.type) ? o.type : 'sine',
        num(o.freq, 440, 1, top), o.freqEnd > 0 ? num(o.freqEnd, 0, 1, top) : 0, dur, dur, peak,
        num(o.attack, 0.004, 0.0005, 30), num(o.pan, 0, -1, 1), num(o.detune, 0, -4800, 4800),
      );
    } catch {}
  }

  noise(o) {
    try {
      const bus = this._bus();
      if (!bus || !this._room()) return;
      if (!o) o = {};
      const ctx = bus.context;
      const top = Math.min(20000, ctx.sampleRate * 0.45);
      const peak = num(o.gain, 0.3, 0, 4);
      if (peak < EPS) return;
      this._nz(
        bus, this._live, null, ctx.currentTime + num(o.delay, 0, 0, 60), FILTERS.has(o.filter) ? o.filter : 'bandpass',
        num(o.freq, 1200, 10, top), o.freqEnd > 0 ? num(o.freqEnd, 0, 10, top) : 0, num(o.q, 1, 0.0001, 30),
        num(o.dur, 0.2, 0.005, 30), peak, num(o.attack, 0.004, 0.0005, 30), num(o.pan, 0, -1, 1),
      );
    } catch {}
  }

  sfx(name, o) {
    try {
      const recipe = typeof name === 'string' ? SFX[name] : null;
      if (!recipe || !this._bus() || !this._room()) return;
      const gain = num(o && o.gain, 1, 0, 4);
      const pitch = num(o && o.pitch, 1, 0.05, 20);
      const delay = num(o && o.delay, 0, 0, 60);
      const pan = num(o && o.pan, 0, -1, 1);
      if (gain < EPS) return;
      const fold = (v) => {
        v.freq *= pitch;
        if (v.freqEnd) v.freqEnd *= pitch;
        v.gain *= gain;
        v.delay = (v.delay || 0) + delay;
        v.pan = (v.pan || 0) + pan;
        return v;
      };
      // The cap was checked once, above: a recipe cut off between layers sounds broken.
      this._burst = true;
      try {
        recipe((v) => this.tone(fold(v)), (v) => this.noise(fold(v)), Math.random);
      } finally {
        this._burst = false;
      }
    } catch {}
  }

  music(spec) {
    try {
      const snap = normSpec(spec);
      if (!snap) this.stopMusic(XFADE);
      else if (this.out) this._start(snap);
      else this._want = snap;
    } catch {}
  }

  stopMusic(fade = 0.4) {
    try {
      this._want = null;
      const m = this._music;
      this._music = null;
      if (m) this._end(m, num(fade, 0.4, 0, 10));
    } catch {}
  }

  update() {
    try {
      const out = this.out;
      if (!out) return;
      const now = out.context.currentTime;
      this._sweep(now);
      if (this._want) {
        const w = this._want;
        this._want = null;
        this._start(w);
      }
      const m = this._music;
      if (!m) return;
      // Fell behind (hidden tab, long hitch): pick the pattern up from here
      // rather than machine-gun every step that was missed.
      if (m.next < now) m.next = now + 0.02;
      const horizon = now + LOOKAHEAD;
      for (let i = 0; i < 32 && m.next < horizon; i++) {
        this._step(m, m.next);
        m.step++;
        m.next += m.dur;
      }
    } catch {}
  }

  setVolume(v) {
    try {
      this._vol = num(v, this._vol, 0, 1);
      const out = this.out;
      if (out) out.gain.setTargetAtTime(this._vol, out.context.currentTime, 0.015);
    } catch {}
  }

  // Pull the music down to `amount` of its level (0 = silent, 1 = untouched),
  // hold it there for `time` seconds, then let it swell back.
  duck(amount = 0.35, time = 0.25) {
    try {
      if (!this.out) return;
      const g = this._mus.gain;
      const t = this._out.context.currentTime;
      const hold = num(time, 0.25, 0.02, 10);
      // setTargetAtTime starts from wherever the gain is, so overlapping ducks
      // need neither cancelAndHoldAtTime nor a read of the automated value.
      g.cancelScheduledValues(t);
      g.setTargetAtTime(num(amount, 0.35, 0, 1), t, 0.012);
      g.setTargetAtTime(1, t + hold, Math.max(0.08, hold * 0.6));
    } catch {}
  }

  stopAll(fade = 0.15) {
    try {
      const f = Math.max(0.005, num(fade, 0.15, 0, 10));
      this.stopMusic(f);
      const bus = this._fx;
      if (!bus || !this._live.size) return;
      const end = bus.context.currentTime + f;
      this._sweep(end - f); // earlier leftovers, in case nobody is calling update()
      this._fade(bus.gain, end - f, f);
      for (const v of this._live) this._cut(v, end);
      // The old scene's voices must not count against the next scene's cap.
      this._live.clear();
      this._retired.push({ at: end + 0.1, nodes: [bus] });
      this._fx = null;
    } catch {}
  }

  // ---------------------------------------------------------------------------
  // Graph
  // ---------------------------------------------------------------------------
  _build(ctx, master) {
    // A different context (or master) orphans everything made for the old one.
    if (this._out) off(this._out);
    this._live.clear();
    this._mlive.clear();
    this._dying.clear();
    this._retired.length = 0;
    this._music = null;
    this._fx = null;
    this._out = null;
    const out = ctx.createGain();
    out.gain.value = this._vol;
    const mus = ctx.createGain();
    mus.connect(out);
    out.connect(master);
    this._mus = mus;
    this._master = master;
    this._out = out;
  }

  _bus() {
    const out = this.out;
    if (!out) return null;
    if (!this._fx) {
      this._fx = out.context.createGain();
      this._fx.connect(out);
    }
    return this._fx;
  }

  _room() {
    const cap = this._burst ? HARD_VOICES : MAX_VOICES;
    if (this._live.size < cap) return true;
    this._reap(this._live, this.now); // an ended event may have gone missing
    return this._live.size < cap;
  }

  _noiseBuf(ctx) {
    const nb = this.base && this.base.noise;
    if (nb && nb.length > 0 && typeof nb.getChannelData === 'function') return nb;
    if (!this._own || this._own.sampleRate !== ctx.sampleRate) {
      const len = Math.floor(ctx.sampleRate * 2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._own = buf;
    }
    return this._own;
  }

  // ---------------------------------------------------------------------------
  // Voices
  // ---------------------------------------------------------------------------
  // Envelope gain (→ pan) → dest; returns the node the source should feed.
  _amp(ctx, dest, nodes, t0, dur, peak, attack, pan) {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(EPS, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + Math.min(attack, dur * 0.98));
    g.gain.exponentialRampToValueAtTime(peak * FLOOR, t0 + dur);
    g.gain.linearRampToValueAtTime(0, t0 + dur + TAIL);
    nodes.push(g);
    if (pan && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(dest);
      nodes.push(p);
    } else {
      g.connect(dest);
    }
    return g;
  }

  _osc(dest, set, owner, t0, type, f0, f1, glide, dur, peak, attack, pan, detune) {
    const ctx = dest.context;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 > 0 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + glide);
    if (detune) o.detune.value = detune;
    const nodes = [o];
    o.connect(this._amp(ctx, dest, nodes, t0, dur, peak, attack, pan));
    this._play(o, nodes, set, owner, t0, t0 + dur + TAIL * 2);
  }

  _nz(dest, set, owner, t0, type, f0, f1, q, dur, peak, attack, pan) {
    const ctx = dest.context;
    const buf = this._noiseBuf(ctx);
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t0);
    if (f1 > 0 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    f.Q.value = q;
    const nodes = [s, f];
    s.connect(f);
    f.connect(this._amp(ctx, dest, nodes, t0, dur, peak, attack, pan));
    // Random offset: two bursts started together must not be the same samples.
    this._play(s, nodes, set, owner, t0, t0 + dur + TAIL * 2, Math.random() * buf.duration);
  }

  _play(src, nodes, set, owner, t0, end, offset) {
    const v = { src, nodes, set, owner, end };
    src.onended = () => this._free(v);
    set.add(v);
    if (offset === undefined) src.start(t0);
    else src.start(t0, offset);
    src.stop(end);
  }

  // Leaving nodes connected after they end is the classic WebAudio leak.
  _free(v) {
    if (!v.set.delete(v)) return;
    v.src.onended = null;
    for (const n of v.nodes) off(n);
  }

  // End a voice early; it stays tracked (off the books of the cap) until it has.
  _cut(v, end) {
    v.set = this._dying;
    this._dying.add(v);
    if (v.end > end) {
      v.end = end;
      try { v.src.stop(end); } catch {}
    }
  }

  _reap(set, now) {
    for (const v of set) {
      if (now > v.end + 0.3) {
        try { v.src.stop(); } catch {}
        this._free(v);
      }
    }
  }

  _sweep(now) {
    if (this._live.size) this._reap(this._live, now);
    if (this._mlive.size) this._reap(this._mlive, now);
    if (this._dying.size) this._reap(this._dying, now);
    const r = this._retired;
    for (let i = r.length - 1; i >= 0; i--) {
      if (now >= r[i].at) {
        for (const n of r[i].nodes) off(n);
        r.splice(i, 1);
      }
    }
  }

  // Fade a gain to silence from whatever it is doing now.
  _fade(param, t, fade) {
    param.setTargetAtTime(0, t, fade / 5);
    param.setValueAtTime(0, t + fade);
  }

  // ---------------------------------------------------------------------------
  // Music
  // ---------------------------------------------------------------------------
  _start(snap) {
    const old = this._music;
    // Asking again for what is already playing must not restart it: a module
    // that calls music() every frame would otherwise never get past step 0.
    if (old && old.sig === snap.sig) return;
    const ctx = this._out.context;
    const t = ctx.currentTime;
    const gain = ctx.createGain();
    if (old) {
      this._end(old, XFADE);
      // In fast, so the new pattern's first downbeat lands at full level.
      gain.gain.value = 0;
      gain.gain.setValueAtTime(0, t);
      gain.gain.setTargetAtTime(snap.gain, t, 0.02);
    } else {
      gain.gain.value = snap.gain;
    }
    gain.connect(this._mus);
    const m = { sig: snap.sig, gain, nodes: [gain], tracks: [], step: 0, next: t + 0.06, dur: 15 / snap.bpm, top: Math.min(20000, ctx.sampleRate * 0.45) };
    for (const tr of snap.tracks) {
      let dest = gain;
      // One lowpass per pitched track, not per note.
      if (tr.cutoff && WAVES.has(tr.type)) {
        dest = ctx.createBiquadFilter();
        dest.type = 'lowpass';
        dest.frequency.value = Math.min(tr.cutoff, m.top);
        dest.connect(gain);
        m.nodes.push(dest);
      }
      m.tracks.push({ type: tr.type, notes: tr.notes, gain: tr.gain, decay: tr.decay, cutoff: Math.min(tr.cutoff, m.top), dest });
    }
    this._music = m;
  }

  _end(m, fade) {
    const f = Math.max(0.005, fade);
    const end = m.gain.context.currentTime + f;
    this._fade(m.gain.gain, end - f, f);
    for (const v of this._mlive) {
      if (v.owner === m) {
        this._mlive.delete(v);
        this._cut(v, end);
      }
    }
    this._retired.push({ at: end + 0.1, nodes: m.nodes });
  }

  _step(m, t) {
    const live = this._mlive;
    for (const tr of m.tracks) {
      const n = tr.notes[m.step % tr.notes.length];
      if (!n) continue;
      if (live.size >= MAX_MUSIC) return;
      const d = tr.dest;
      const g = tr.gain;
      const dec = tr.decay;
      switch (tr.type) {
        case 'kick':
          this._osc(d, live, m, t, 'sine', 150, 45, Math.min(0.1, dec), dec, g, 0.002, 0, 0);
          break;
        case 'snare':
          this._nz(d, live, m, t, 'bandpass', tr.cutoff || 1900, 0, 0.8, dec, g * 1.6, 0.001, 0);
          this._osc(d, live, m, t, 'triangle', 180, 150, 0.06, Math.min(dec, 0.12), g * 0.6, 0.001, 0, 0);
          break;
        case 'hat':
          this._nz(d, live, m, t, 'highpass', tr.cutoff || 8000, 0, 0.7, dec, g, 0.001, 0);
          break;
        case 'noise':
          this._nz(d, live, m, t, 'bandpass', tr.cutoff || 2400, 0, 1, dec, g * 2.4, 0.002, 0);
          break;
        default: {
          const f = 440 * Math.pow(2, (n - 69) / 12);
          if (f >= 12 && f <= m.top) this._osc(d, live, m, t, tr.type, f, 0, 0, dec, g, 0.004, 0, 0);
        }
      }
    }
  }
}
