import * as THREE from 'three';

// All sound is synthesized with WebAudio: no asset downloads.
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.8;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    // White noise buffer.
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // Valley echo: long decaying impulse response with discrete slap-backs off the ridges.
    const irLen = ctx.sampleRate * 3.2;
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < irLen; i++) {
        const t = i / ctx.sampleRate;
        let v = (Math.random() * 2 - 1) * Math.exp(-t * 1.6) * 0.35;
        for (const [et, ea] of [[0.55, 0.5], [1.15, 0.3], [1.9, 0.16]]) {
          const dt = t - et - c * 0.03;
          if (dt > 0 && dt < 0.25) v += (Math.random() * 2 - 1) * Math.exp(-dt * 14) * ea;
        }
        ch[i] = v;
      }
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.55;
    this.reverb.connect(this.reverbGain).connect(this.master);
    this._startWind();
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  setListener(cam) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const p = cam.getWorldPosition(new THREE.Vector3());
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setValueAtTime(p.x, t);
      l.positionY.setValueAtTime(p.y, t);
      l.positionZ.setValueAtTime(p.z, t);
      l.forwardX.setValueAtTime(f.x, t);
      l.forwardY.setValueAtTime(f.y, t);
      l.forwardZ.setValueAtTime(f.z, t);
      l.upX.setValueAtTime(u.x, t);
      l.upY.setValueAtTime(u.y, t);
      l.upZ.setValueAtTime(u.z, t);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
  }

  _panner(pos, refDist = 20) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = refDist;
    p.rolloffFactor = 0.9;
    p.maxDistance = 5000;
    if (p.positionX) {
      p.positionX.value = pos.x;
      p.positionY.value = pos.y;
      p.positionZ.value = pos.z;
    } else p.setPosition(pos.x, pos.y, pos.z);
    p.connect(this.master);
    return p;
  }

  _noiseBurst(dest, when, dur, type, freq, q, gain, decay) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    src.connect(f).connect(g).connect(dest);
    src.start(when, Math.random());
    src.stop(when + dur);
    return g;
  }

  _thump(dest, when, freq, gain, decay) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 2.2, when);
    o.frequency.exponentialRampToValueAtTime(freq, when + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    o.connect(g).connect(dest);
    o.start(when);
    o.stop(when + decay + 0.05);
  }

  // Your own rifle: loud, close, with the valley echoing it back.
  shotLocal(suppressed = false, pistol = false) {
    if (!this.ctx) return;
    const t = this.now;
    const bus = this.ctx.createGain();
    bus.gain.value = suppressed ? 0.35 : pistol ? 0.55 : 1;
    bus.connect(this.master);
    bus.connect(this.reverb);
    this._noiseBurst(bus, t, 0.5, 'bandpass', 1800, 0.6, 1.1, 0.18);
    this._noiseBurst(bus, t, 0.8, 'lowpass', 500, 0.7, 1.0, 0.45);
    this._thump(bus, t, 55, 1.2, 0.35);
  }

  // Distant muzzle report, arriving after the sound travel delay.
  shotDistant(pos, delay, suppressed = false) {
    if (!this.ctx) return;
    const t = this.now + delay;
    const p = this._panner(pos, suppressed ? 8 : 60);
    const bus = this.ctx.createGain();
    bus.gain.value = suppressed ? 0.5 : 1.6;
    bus.connect(p);
    const rv = this.ctx.createGain();
    rv.gain.value = 0.5;
    bus.connect(rv).connect(this.reverb);
    this._noiseBurst(bus, t, 1.2, 'lowpass', 900, 0.5, 1.0, 0.6);
    this._thump(bus, t, 45, 0.9, 0.7);
  }

  // Supersonic crack as a bullet passes close by. Louder the closer it is.
  crack(pos, delay, closeness) {
    if (!this.ctx) return;
    const t = this.now + Math.max(0, delay);
    const p = this._panner(pos, 4);
    const g = this.ctx.createGain();
    g.gain.value = 0.6 + closeness * 1.2;
    g.connect(p);
    this._noiseBurst(g, t, 0.08, 'highpass', 2500, 0.7, 1.4, 0.03);
    this._noiseBurst(g, t + 0.004, 0.12, 'bandpass', 5200, 1.5, 0.6, 0.06);
  }

  impact(pos, mat, delay = 0) {
    if (!this.ctx) return;
    const t = this.now + delay;
    const p = this._panner(pos, 10);
    if (mat === 'metal') {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = 1400 + Math.random() * 500;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(p);
      o.start(t);
      o.stop(t + 0.55);
    }
    this._noiseBurst(p, t, 0.3, 'lowpass', mat === 'dirt' ? 700 : 1500, 0.8, 0.8, 0.18);
  }

  // Satisfying confirmation tones.
  hitConfirm(head, delay = 0) {
    if (!this.ctx) return;
    const t = this.now + delay;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(head ? 1650 : 980, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (head ? 0.35 : 0.15));
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 3000;
    o.connect(f).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.4);
    if (head) this._thump(this.master, t, 90, 0.5, 0.25);
  }

  plateHit(pos, delay) {
    if (!this.ctx) return;
    const t = this.now + delay;
    const p = this._panner(pos, 80);
    for (const [f, a] of [[820, 0.7], [1310, 0.35], [2240, 0.2]]) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(a, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.connect(g).connect(p);
      o.start(t);
      o.stop(t + 1.2);
    }
  }

  bolt(delay = 0.25) {
    if (!this.ctx) return;
    const t = this.now + delay;
    this._noiseBurst(this.master, t, 0.08, 'bandpass', 3000, 3, 0.35, 0.05);
    this._noiseBurst(this.master, t + 0.28, 0.08, 'bandpass', 2400, 3, 0.4, 0.05);
    this._noiseBurst(this.master, t + 0.55, 0.06, 'bandpass', 3500, 4, 0.3, 0.04);
  }

  click() {
    if (!this.ctx) return;
    this._noiseBurst(this.master, this.now, 0.05, 'bandpass', 4000, 4, 0.25, 0.03);
  }

  beep(pos, high = false) {
    if (!this.ctx) return;
    const t = this.now;
    const dest = pos ? this._panner(pos, 25) : this.master;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = high ? 1320 : 880;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(pos ? 0.5 : 0.12, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.15);
  }

  ping() {
    if (!this.ctx) return;
    const t = this.now;
    for (let i = 0; i < 2; i++) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = i ? 1760 : 1320;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.12);
      g.gain.linearRampToValueAtTime(0.2, t + i * 0.12 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.4);
      o.connect(g).connect(this.master);
      o.start(t + i * 0.12);
      o.stop(t + i * 0.12 + 0.45);
    }
  }

  footstep(pos) {
    if (!this.ctx) return;
    const p = this._panner(pos, 3);
    this._noiseBurst(p, this.now, 0.1, 'bandpass', 600 + Math.random() * 300, 1.2, 0.35, 0.07);
  }

  _startWind() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 400;
    f.Q.value = 0.5;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.05;
    this.windFilter = f;
    src.connect(f).connect(this.windGain).connect(this.master);
    src.start();
  }

  setWind(speed) {
    if (!this.windGain) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.02 + speed * 0.012, t, 0.5);
    this.windFilter.frequency.setTargetAtTime(250 + speed * 60, t, 0.5);
  }

  // Persistent positional loops (e.g. drone rotor buzz).
  startLoop(key, pos, type, gain = 0.4) {
    if (!this.ctx) return;
    this.loops ||= {};
    if (this.loops[key]) return;
    const ctx = this.ctx;
    const p = this._panner(pos, 12);
    const g = ctx.createGain();
    g.gain.value = gain;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 0.8;
    const trem = ctx.createGain();
    trem.gain.value = 0.7;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 23;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.3;
    lfo.connect(lfoGain).connect(trem.gain);
    const oscs = [178, 183, 356].map((fr) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = fr;
      o.connect(f);
      o.start();
      return o;
    });
    f.connect(trem).connect(g).connect(p);
    lfo.start();
    this.loops[key] = { p, oscs, lfo, g };
  }

  updateLoop(key, pos) {
    const l = this.loops && this.loops[key];
    if (!l) return;
    if (l.p.positionX) {
      l.p.positionX.value = pos.x;
      l.p.positionY.value = pos.y;
      l.p.positionZ.value = pos.z;
    } else l.p.setPosition(pos.x, pos.y, pos.z);
  }

  stopLoop(key) {
    const l = this.loops && this.loops[key];
    if (!l) return;
    l.oscs.forEach((o) => o.stop());
    l.lfo.stop();
    l.p.disconnect();
    delete this.loops[key];
  }

  setMuffled(on) {
    if (!this.master) return;
    this.master.gain.setTargetAtTime(on ? this.volume * 0.4 : this.volume, this.ctx.currentTime, 0.2);
  }
}
