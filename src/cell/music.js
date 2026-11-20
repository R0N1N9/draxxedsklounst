// Sniper Cell — a small procedural score for the ICE endgame, in the spirit of a big
// sci-fi shooter soundtrack. Two layers, cross-faded by state:
//   'tension'  while SENTINEL sweeps the building: a low drone, a slow heartbeat pulse,
//              a held minor choir and the odd glassy high note. Hide and seek.
//   'combat'   once they've spotted you: driving taiko-style drums at 132 bpm, a bass
//              ostinato, a minor-key choir ("aah" formants) and low brass stabs.
//   null       silence.
// Everything is synthesized with WebAudio; notes are scheduled a little ahead of time.
const A1 = 55;
const hz = (semi) => A1 * Math.pow(2, semi / 12);
// A minor: Am – F – G – Em, one chord per bar (semitones above A1).
const CHORDS = [[12, 15, 19], [8, 12, 15], [10, 14, 17], [7, 10, 14]];
const BASS = [0, 0, 12, 0, 3, 0, 7, 5]; // eighth notes, over the chord root
const ROOTS = [0, -4, -2, -5];

export class Score {
  constructor(audio) {
    this.a = audio;
    this.state = null;
    this.ready = false;
  }

  _init() {
    const ctx = this.a.ctx;
    if (!ctx || this.ready) return !!this.ready;
    this.ready = true;
    this.out = ctx.createGain();
    this.out.gain.value = 0.55;
    this.out.connect(this.a.master);
    this.tens = ctx.createGain();
    this.tens.gain.value = 0;
    this.comb = ctx.createGain();
    this.comb.gain.value = 0;
    // A touch of space: a short feedback delay shared by both layers.
    const dl = ctx.createDelay(1), fb = ctx.createGain(), wet = ctx.createGain();
    dl.delayTime.value = 0.23; fb.gain.value = 0.28; wet.gain.value = 0.25;
    dl.connect(fb).connect(dl);
    dl.connect(wet).connect(this.out);
    for (const g of [this.tens, this.comb]) { g.connect(this.out); g.connect(dl); }
    // Noise buffer for drums and air.
    const n = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, n, n);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    // The tension drone runs continuously; its gain decides whether you hear it.
    this._drone();
    this.step = 0;
    this.next = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this._schedule(), 60);
    return true;
  }

  // 'tension' | 'combat' | null
  set(state) {
    if (state === this.state) return;
    if (state && !this._init()) return;
    if (!this.ready) return;
    this.state = state;
    const t = this.a.ctx.currentTime;
    const fade = (g, v, dur) => { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(v, t + dur); };
    fade(this.tens, state === 'tension' ? 1 : state === 'combat' ? 0.25 : 0, state ? 2.5 : 4);
    fade(this.comb, state === 'combat' ? 1 : 0, state === 'combat' ? 0.6 : 3.5);
    if (state === 'combat') this.step = 0;
  }

  stop() {
    this.set(null);
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  _drone() {
    const ctx = this.a.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 2;
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 0.07; lg.gain.value = 120;
    lfo.connect(lg).connect(lp.frequency);
    lfo.start();
    const g = ctx.createGain();
    g.gain.value = 0.16;
    for (const [f, type] of [[hz(0), 'sawtooth'], [hz(0) * 1.004, 'sawtooth'], [hz(7), 'triangle'], [hz(-12), 'sine']]) {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = f;
      o.connect(lp);
      o.start();
    }
    lp.connect(g).connect(this.tens);
  }

  _schedule() {
    const ctx = this.a.ctx;
    if (!ctx || !this.state) { this.next = ctx ? ctx.currentTime + 0.1 : 0; return; }
    const spb = 60 / 132 / 2; // eighth notes
    while (this.next < ctx.currentTime + 0.25) {
      this._eighth(this.step, this.next, spb);
      this.next += spb;
      this.step++;
    }
  }

  _eighth(i, t, spb) {
    const bar = Math.floor(i / 8) % 4, e = i % 8;
    const root = ROOTS[bar];
    // Tension: a heartbeat every half bar, a held choir chord each bar, and a glass note now and then.
    if (e === 0 || e === 4) { this._thump(t, this.tens, 0.5); this._thump(t + spb * 0.55, this.tens, 0.3); }
    if (e === 0) this._choir(t, CHORDS[bar].map((s) => s + 12), spb * 8, this.tens, 0.05);
    if (e === 6 && bar % 2 === 1) this._glass(t, hz(CHORDS[bar][2] + 24 + (bar === 3 ? 2 : 0)), this.tens);
    // Combat only when it's audible.
    if (this.state !== 'combat') return;
    const C = this.comb;
    // Drums: big hits on 1 and the "and" of 2, rolls into 4.
    if (e === 0 || e === 3 || e === 4) this._taiko(t, C, e === 0 ? 1 : 0.7);
    if (e === 2 || e === 6) this._snare(t, C, 0.5);
    if (e === 7) { this._taiko(t, C, 0.45, 140); this._taiko(t + spb / 2, C, 0.55, 120); }
    this._hat(t, C, e % 2 ? 0.12 : 0.2);
    // Bass ostinato.
    this._bass(t, hz(root + BASS[e] - 12), spb * 0.9, C);
    // Choir on the bar, brass stabs on 1 and the "and" of 3.
    if (e === 0) this._choir(t, CHORDS[bar], spb * 8, C, 0.08);
    if (e === 0 || e === 5) this._brass(t, [hz(root), hz(root + 7), hz(root + 12)], spb * (e === 0 ? 2.5 : 1.5), C);
  }

  _env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  _thump(t, out, v) {
    const ctx = this.a.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
    this._env(g, t, 0.01, 0.5 * v, 0.3);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.4);
  }
  _taiko(t, out, v, f0 = 110) {
    const ctx = this.a.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.35);
    this._env(g, t, 0.005, 0.9 * v, 0.45);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.55);
    const n = ctx.createBufferSource(), ng = ctx.createGain(), bp = ctx.createBiquadFilter();
    n.buffer = this.noise; bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
    this._env(ng, t, 0.003, 0.35 * v, 0.12);
    n.connect(bp).connect(ng).connect(out); n.start(t, Math.random()); n.stop(t + 0.2);
  }
  _snare(t, out, v) {
    const ctx = this.a.ctx, n = ctx.createBufferSource(), g = ctx.createGain(), hp = ctx.createBiquadFilter();
    n.buffer = this.noise; hp.type = 'highpass'; hp.frequency.value = 1400;
    this._env(g, t, 0.003, 0.4 * v, 0.16);
    n.connect(hp).connect(g).connect(out); n.start(t, Math.random()); n.stop(t + 0.25);
  }
  _hat(t, out, v) {
    const ctx = this.a.ctx, n = ctx.createBufferSource(), g = ctx.createGain(), hp = ctx.createBiquadFilter();
    n.buffer = this.noise; hp.type = 'highpass'; hp.frequency.value = 7000;
    this._env(g, t, 0.002, 0.12 * v, 0.04);
    n.connect(hp).connect(g).connect(out); n.start(t, Math.random()); n.stop(t + 0.08);
  }
  _bass(t, f, dur, out) {
    const ctx = this.a.ctx, o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = f;
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(200, t + dur);
    this._env(g, t, 0.01, 0.22, dur);
    o.connect(lp).connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  // "Aah": detuned saws through two vowel formants.
  _choir(t, semis, dur, out, v) {
    const ctx = this.a.ctx, g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter();
    f1.type = f2.type = 'bandpass'; f1.frequency.value = 750; f2.frequency.value = 1150; f1.Q.value = f2.Q.value = 5;
    const mix = ctx.createGain();
    mix.connect(f1); mix.connect(f2);
    f1.connect(g); f2.connect(g); g.connect(out);
    for (const s of semis) for (const dt of [-6, 0, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = hz(s + 12); o.detune.value = dt;
      o.connect(mix); o.start(t); o.stop(t + dur + 0.05);
    }
  }
  _brass(t, fs, dur, out) {
    const ctx = this.a.ctx, g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(400, t); lp.frequency.linearRampToValueAtTime(1600, t + 0.08); lp.frequency.exponentialRampToValueAtTime(500, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.13, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(g).connect(out);
    for (const f of fs) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(t); o.stop(t + dur + 0.05); }
  }
  _glass(t, f, out) {
    const ctx = this.a.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    this._env(g, t, 0.02, 0.05, 2.2);
    o.connect(g).connect(out); o.start(t); o.stop(t + 2.4);
  }
}
