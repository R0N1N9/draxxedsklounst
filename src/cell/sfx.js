// Sniper Cell — synthesized sounds for this mode (no asset files, like the rest of the game):
// enemy barks, plasma fire, energy shields, the juggernaut's blade, the bulwark's beam rifle,
// and the extraction van.
export class Sfx {
  constructor(audio) {
    this.a = audio;
  }
  get ok() {
    return !!(this.a && this.a.ctx);
  }
  _out(pos, ref = 12) {
    const A = this.a;
    return pos ? A._panner(pos, ref) : A.master;
  }
  _tone(dest, t, type, f0, f1, dur, gain) {
    const c = this.a.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.02, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // Enemy voices: scavs chitter and shriek, juggernauts roar, bulwarks screech.
  bark(kind, pos) {
    if (!this.ok) return;
    const t = this.a.now, out = this._out(pos, 10);
    if (kind === 'scav') for (let i = 0; i < 3; i++) this._tone(out, t + i * 0.09, 'square', 700 + Math.random() * 300, 1200 + Math.random() * 500, 0.08, 0.12);
    else if (kind === 'flee') for (let i = 0; i < 6; i++) this._tone(out, t + i * 0.07, 'sawtooth', 1400 - i * 60, 1900, 0.07, 0.1);
    else if (kind === 'jugg') { this._tone(out, t, 'sawtooth', 90, 55, 0.9, 0.35); this._tone(out, t, 'square', 140, 70, 0.7, 0.12); this.a._noiseBurst(out, t, 0.8, 'lowpass', 300, 0.6, 0.4, 0.6); }
    else if (kind === 'bulwark') { this._tone(out, t, 'sawtooth', 2200, 900, 0.35, 0.12); this._tone(out, t + 0.12, 'triangle', 1800, 2600, 0.25, 0.08); }
  }
  plasma(pos, heavy = false) {
    if (!this.ok) return;
    const t = this.a.now, out = this._out(pos, 14);
    this._tone(out, t, 'sawtooth', heavy ? 420 : 900, heavy ? 120 : 260, heavy ? 0.28 : 0.18, heavy ? 0.22 : 0.14);
  }
  laser(pos) {
    if (!this.ok) return;
    const t = this.a.now, out = this._out(pos, 20);
    this._tone(out, t, 'sine', 300, 1400, 1.4, 0.05);
  }
  beam(pos) {
    if (!this.ok) return;
    const t = this.a.now, out = this._out(pos, 40);
    this._tone(out, t, 'sawtooth', 2400, 300, 0.4, 0.3);
    this.a._noiseBurst(out, t, 0.3, 'highpass', 2000, 0.7, 0.5, 0.2);
  }
  shieldHit(pos) {
    if (!this.ok) return;
    const t = this.a.now, out = this._out(pos, 12);
    this._tone(out, t, 'sine', 1600, 600, 0.2, 0.18);
  }
  shieldPop(pos) {
    if (!this.ok) return;
    const t = this.a.now, out = this._out(pos, 16);
    this._tone(out, t, 'square', 1800, 180, 0.5, 0.2);
    this.a._noiseBurst(out, t, 0.4, 'bandpass', 2500, 0.8, 0.5, 0.3);
  }
  blade(pos) {
    if (!this.ok) return;
    const t = this.a.now, out = this._out(pos, 8);
    this._tone(out, t, 'sawtooth', 160, 420, 0.35, 0.2);
    this.a._noiseBurst(out, t, 0.25, 'bandpass', 1800, 1.5, 0.4, 0.2);
  }
  ui(high = true) {
    if (!this.ok) return;
    const t = this.a.now;
    this._tone(this.a.master, t, 'sine', high ? 1300 : 700, high ? 1700 : 500, 0.09, 0.08);
  }
  door(pos) {
    if (!this.ok) return;
    const t = this.a.now, out = this._out(pos, 6);
    this.a._noiseBurst(out, t, 0.18, 'lowpass', 500, 0.7, 0.8, 0.12);
    this.a._thump(out, t, 80, 0.5, 0.15);
  }
  // Electric motor whine rising as the van pulls away.
  van(pos) {
    if (!this.ok) return;
    const t = this.a.now, out = this._out(pos, 10);
    this._tone(out, t, 'sine', 180, 1400, 5, 0.12);
    this._tone(out, t, 'triangle', 90, 700, 5, 0.06);
  }
  // (The night ambience lives in ambient.js now: no constant hum.)
}
