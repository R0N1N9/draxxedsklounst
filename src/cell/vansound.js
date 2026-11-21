// Sniper Cell — the extraction van's sound in the cut-scenes (it's an EV, so no engine growl):
// tyre and road roar that scales with speed, gravel crunching on the track, a quiet electric
// motor whine rising with speed, a brake creak as it stops, door latches and slams, and the
// rustle of two operators kitting up. Everything is positioned on the van.
export class VanSound {
  constructor(audio) {
    this.a = audio;
    this.on = false;
  }

  start(pos, gravel = true) {
    const A = this.a;
    if (this.on || !A || !A.ctx || !A.noise) return;
    this.on = true;
    this.gravel = gravel;
    const ctx = A.ctx;
    this.p = A._panner(pos, 14);
    // Road / tyre roar.
    const src = ctx.createBufferSource();
    src.buffer = A.noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 300;
    this.roadG = ctx.createGain();
    this.roadG.gain.value = 0;
    src.connect(lp).connect(this.roadG).connect(this.p);
    src.start(0, Math.random());
    this.roadF = lp;
    this.src = src;
    // Motor whine: two quiet sines with a gentle high-pass, pitch follows speed.
    this.whineG = ctx.createGain();
    this.whineG.gain.value = 0;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 250;
    hp.connect(this.whineG).connect(this.p);
    this.osc = [1, 2.01].map((m) => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 300 * m; o.connect(hp); o.start(); return o; });
    this.speed = 0;
    this.grainT = 0;
  }

  // pos: van position; speed in m/s.
  update(dt, pos, speed) {
    if (!this.on) return;
    const A = this.a, ctx = A.ctx, now = ctx.currentTime;
    const P = this.p;
    if (P.positionX) { P.positionX.value = pos.x; P.positionY.value = pos.y + 0.6; P.positionZ.value = pos.z; } else P.setPosition(pos.x, pos.y + 0.6, pos.z);
    const s = Math.max(0, speed), k = Math.min(1, s / 25);
    this.roadG.gain.setTargetAtTime(0.02 + 0.5 * k, now, 0.15);
    this.roadF.frequency.setTargetAtTime(220 + 900 * k, now, 0.2);
    this.whineG.gain.setTargetAtTime(s > 0.3 ? 0.008 + 0.03 * k : 0, now, 0.2);
    this.osc[0].frequency.setTargetAtTime(240 + 46 * s, now, 0.2);
    this.osc[1].frequency.setTargetAtTime((240 + 46 * s) * 2.01, now, 0.2);
    // Gravel: little crunches, more of them the faster it rolls.
    if (this.gravel && s > 0.4) {
      this.grainT -= dt * (2 + s * 3);
      if (this.grainT <= 0) { this.grainT = Math.random(); A._noiseBurst(P, A.now, 0.03, 'bandpass', 1800 + Math.random() * 2400, 1.5, 0.05 + 0.1 * k, 0.025); }
    }
    // Brake creak once as it comes to rest.
    if (this.speed > 1.2 && s <= 1.2 && !this.braked) { this.braked = true; this._creak(); }
    this.speed = s;
  }

  _creak() {
    const A = this.a, ctx = A.ctx, t = A.now;
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(380, t);
    o.frequency.linearRampToValueAtTime(300, t + 0.45);
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 4;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.03, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(f).connect(g).connect(this.p);
    o.start(t);
    o.stop(t + 0.55);
  }

  // Door latch (open) or a solid slam (close).
  door(open) {
    if (!this.on) return;
    const A = this.a, t = A.now;
    if (open) {
      A._noiseBurst(this.p, t, 0.04, 'highpass', 2500, 1, 0.25, 0.03);
      A._noiseBurst(this.p, t + 0.06, 0.05, 'bandpass', 1200, 2, 0.15, 0.04);
    } else {
      A._thump(this.p, t, 70, 0.6, 0.22);
      A._noiseBurst(this.p, t, 0.08, 'lowpass', 900, 1, 0.4, 0.06);
      A._noiseBurst(this.p, t + 0.01, 0.03, 'highpass', 3000, 1, 0.12, 0.02);
    }
  }

  // Kit going on: cloth rustle, a strap, a velcro rip.
  gear() {
    if (!this.on) return;
    const A = this.a, t = A.now;
    A._noiseBurst(this.p, t, 0.35, 'bandpass', 2200, 0.8, 0.06, 0.25);
    A._noiseBurst(this.p, t + 0.5, 0.25, 'highpass', 3500, 0.7, 0.1, 0.2);
    A._noiseBurst(this.p, t + 0.9, 0.08, 'bandpass', 900, 2, 0.12, 0.05);
  }

  stop() {
    if (!this.on) return;
    this.on = false;
    const now = this.a.ctx.currentTime;
    this.roadG.gain.setTargetAtTime(0, now, 0.2);
    this.whineG.gain.setTargetAtTime(0, now, 0.2);
    setTimeout(() => { try { this.src.stop(); this.osc.forEach((o) => o.stop()); this.p.disconnect(); } catch {} }, 600);
  }
}
