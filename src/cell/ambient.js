// Sniper Cell — the night soundscape. No constant tones (no mains hum, no drones): everything
// is shaped noise or short, sparse natural sounds, positioned around the listener in 3D.
//   outdoors   wind that gusts and settles, trees stirring with the gusts, insects chirping
//              from a few spots around you, and now and then something far off: an owl, a
//              dog, an aircraft passing high over the valley
//   indoors    the outside fades; quiet air handling, a touch more airflow in the rack rooms
export class Ambience {
  constructor(audio) {
    this.a = audio;
    this.on = false;
    this.inside = 0; // 0 outdoors .. 1 indoors (smoothed)
    this.t = 0;
    this.next = { owl: 25 + Math.random() * 30, dog: 70 + Math.random() * 60, plane: 90 + Math.random() * 90, gust: 3 };
    this.bugs = [];
  }

  start() {
    const A = this.a;
    if (this.on || !A || !A.ctx || !A.noise) return;
    this.on = true;
    const ctx = A.ctx;
    // Outdoor bed: wind (two bands) under a master "outside" gain.
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(A.master);
    this.wind = this._noise(ctx, 'bandpass', 320, 0.6, 0.026, this.out);
    this.leaves = this._noise(ctx, 'highpass', 2600, 0.5, 0.004, this.out);
    // Indoor bed: low air handling (lowpassed noise) and a brighter airflow for rack rooms.
    this.room = ctx.createGain();
    this.room.gain.value = 0;
    this.room.connect(A.master);
    this.air = this._noise(ctx, 'lowpass', 480, 0.5, 0.02, this.room);
    this.racks = this._noise(ctx, 'bandpass', 1500, 0.4, 0, this.room);
    if (A.setWind) A.setWind(0); // the shared wind bed is replaced by ours
  }

  _noise(ctx, type, f, q, gain, dest) {
    const src = ctx.createBufferSource();
    src.buffer = this.a.noise;
    src.loop = true;
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(fl).connect(g).connect(dest);
    src.start(0, Math.random() * 2);
    return { src, fl, g };
  }

  // Per frame: listener position, whether you're inside, and whether in a rack room.
  update(dt, pos, inside, racks) {
    if (!this.on) return;
    const A = this.a, ctx = A.ctx, now = ctx.currentTime;
    this.t += dt;
    this.inside += ((inside ? 1 : 0) - this.inside) * Math.min(1, dt * 1.5);
    this.out.gain.setTargetAtTime(1 - this.inside * 0.88, now, 0.1);
    this.room.gain.setTargetAtTime(this.inside, now, 0.1);
    this.racks.g.gain.setTargetAtTime(racks ? 0.012 : 0, now, 0.4);
    // Wind gusts: pick a new strength every few seconds and glide to it.
    this.next.gust -= dt;
    if (this.next.gust <= 0) {
      this.next.gust = 3 + Math.random() * 6;
      const s = 0.4 + Math.random() * Math.random() * 1.6;
      this.wind.g.gain.setTargetAtTime(0.014 + 0.018 * s, now, 1.6);
      this.wind.fl.frequency.setTargetAtTime(240 + 160 * s, now, 2);
      this.leaves.g.gain.setTargetAtTime(0.0015 + 0.005 * Math.max(0, s - 0.6), now, 1.2);
    }
    if (this.inside > 0.6) return;
    // Insects: a few chirpers around you, each with its own pitch and rhythm.
    if (!this.bugs.length) for (let i = 0; i < 4; i++) this.bugs.push(this._bug());
    for (const b of this.bugs) {
      b.t -= dt;
      if (b.t > 0) continue;
      b.t = b.gap * (0.7 + Math.random() * 0.6);
      if (Math.random() < 0.15) Object.assign(b, this._bug()); // they move about
      this._chirp({ x: pos.x + b.dx, y: pos.y, z: pos.z + b.dz }, b);
    }
    // Something far off, now and then.
    for (const k of ['owl', 'dog', 'plane']) {
      this.next[k] -= dt;
      if (this.next[k] > 0) continue;
      this.next[k] = { owl: 40 + Math.random() * 50, dog: 80 + Math.random() * 90, plane: 120 + Math.random() * 120 }[k];
      const ang = Math.random() * Math.PI * 2, r = k === 'plane' ? 300 : 120 + Math.random() * 120;
      this['_' + k]({ x: pos.x + Math.cos(ang) * r, y: pos.y + (k === 'plane' ? 260 : 6), z: pos.z + Math.sin(ang) * r });
    }
  }

  _bug() {
    const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 22;
    return { dx: Math.cos(a) * r, dz: Math.sin(a) * r, f: 3600 + Math.random() * 1600, n: 2 + Math.floor(Math.random() * 3), gap: 1.4 + Math.random() * 2.6, t: Math.random() * 2 };
  }
  _chirp(at, b) {
    const A = this.a, ctx = A.ctx, t = A.now;
    const p = A._panner(at, 6);
    const g = ctx.createGain();
    g.gain.value = 0.32 * (1 - this.inside);
    g.connect(p);
    for (let i = 0; i < b.n; i++) {
      const o = ctx.createOscillator(), e = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = b.f * (1 + (Math.random() - 0.5) * 0.01);
      const s = t + i * 0.06;
      e.gain.setValueAtTime(0.0001, s);
      e.gain.exponentialRampToValueAtTime(0.06, s + 0.008);
      e.gain.exponentialRampToValueAtTime(0.0001, s + 0.04);
      o.connect(e).connect(g);
      o.start(s);
      o.stop(s + 0.05);
    }
  }
  // A soft two-note hoot.
  _owl(at) {
    const A = this.a, ctx = A.ctx, t = A.now, p = A._panner(at, 40);
    for (const [d, f0, f1, len] of [[0, 410, 380, 0.35], [0.55, 400, 340, 0.6]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, t + d);
      o.frequency.exponentialRampToValueAtTime(f1, t + d + len);
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.09, t + d + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + len);
      o.connect(g).connect(p);
      o.start(t + d);
      o.stop(t + d + len + 0.05);
    }
  }
  // A far-off bark or two, mostly lost in the distance.
  _dog(at) {
    const A = this.a, t = A.now, p = A._panner(at, 40);
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) A._noiseBurst(p, t + i * 0.42, 0.14, 'bandpass', 700 + Math.random() * 200, 3, 0.35, 0.1);
  }
  // A high aircraft: a slow swell and fade of low, filtered air.
  _plane(at) {
    const A = this.a, ctx = A.ctx, t = A.now, p = A._panner(at, 200);
    const src = ctx.createBufferSource();
    src.buffer = A.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 260;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.35, t + 7);
    g.gain.linearRampToValueAtTime(0.0001, t + 16);
    src.connect(f).connect(g).connect(p);
    src.start(t, Math.random());
    src.stop(t + 16.5);
  }
}
