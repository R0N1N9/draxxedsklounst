// Sniper Cell — radio voices. The operators (and ISR overwatch) talk over a scratchy radio:
// a squelch click and a burst of static open the channel, a hiss sits under the line, and a
// click closes it. Lines are spoken with the browser's speech synthesis (each speaker gets
// its own voice / pitch); where that isn't available you still get the radio clicks.
// Lines queue so nobody talks over anybody, and stale chatter is dropped.
const SPEAKERS = {
  shooter: { pitch: 0.72, rate: 1.0, pick: 0 },
  spotter: { pitch: 1.05, rate: 1.06, pick: 1 },
  isr: { pitch: 0.92, rate: 0.98, pick: 2 },
};

export function primeVoice() {
  // iOS only lets speech start from a user gesture: say nothing once, from a click.
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch {}
}

export class Radio {
  constructor(audio) {
    this.a = audio;
    this.q = [];
    this.busy = false;
    this.enabled = true;
    this.voices = [];
    const load = () => {
      try {
        const all = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
        this.voices = all.length ? all : speechSynthesis.getVoices();
      } catch {}
    };
    try { load(); speechSynthesis.onvoiceschanged = load; } catch {}
  }

  _voice(who) {
    const V = this.voices;
    if (!V.length) return null;
    const S = SPEAKERS[who] || SPEAKERS.shooter;
    // Prefer distinct voices per speaker when the device has several.
    const male = V.filter((v) => /male|daniel|alex|fred|david|james|guy|tom|aaron|arthur/i.test(v.name) && !/female/i.test(v.name));
    const female = V.filter((v) => /female|samantha|victoria|karen|zira|susan|moira|tessa|serena|kate/i.test(v.name));
    if (who === 'isr' && female.length) return female[0];
    if (who === 'shooter' && male.length) return male[0];
    if (who === 'spotter' && male.length > 1) return male[1];
    return V[S.pick % V.length];
  }

  say(who, text, prio = false) {
    if (!this.enabled || !text) return;
    if (prio) this.q.unshift({ who, text, t: performance.now() });
    else this.q.push({ who, text, t: performance.now() });
    while (this.q.length > 4) this.q.splice(prio ? 1 : 0, 1);
    if (!this.busy) this._next();
  }

  stop() {
    this.q.length = 0;
    try { speechSynthesis.cancel(); } catch {}
    this._hiss(false);
    this.busy = false;
  }

  _next() {
    // Drop lines that went stale waiting (> 6 s).
    while (this.q.length && performance.now() - this.q[0].t > 6000) this.q.shift();
    const item = this.q.shift();
    if (!item) { this.busy = false; return; }
    this.busy = true;
    this._squelch(true);
    this._hiss(true);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(guard);
      this._hiss(false);
      this._squelch(false);
      setTimeout(() => this._next(), 220);
    };
    const guard = setTimeout(finish, 1500 + item.text.length * 85);
    try {
      if (!window.speechSynthesis) throw new Error('no tts');
      const u = new SpeechSynthesisUtterance(item.text);
      const S = SPEAKERS[item.who] || SPEAKERS.shooter;
      const v = this._voice(item.who);
      if (v) u.voice = v;
      u.pitch = S.pitch;
      u.rate = S.rate;
      u.volume = 0.9;
      u.onend = finish;
      u.onerror = finish;
      setTimeout(() => speechSynthesis.speak(u), 110);
    } catch { setTimeout(finish, 600); }
  }

  // Squelch: a click plus a short crackle of band-limited static.
  _squelch(open) {
    const A = this.a;
    if (!A || !A.ctx) return;
    const t = A.now;
    A._noiseBurst(A.master, t, open ? 0.14 : 0.1, 'bandpass', open ? 2600 : 1800, 1.2, 0.35, open ? 0.1 : 0.07);
    const o = A.ctx.createOscillator();
    const g = A.ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(open ? 1450 : 900, t);
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g).connect(A.master);
    o.start(t);
    o.stop(t + 0.06);
  }

  // The hiss under a transmission.
  _hiss(on) {
    const A = this.a;
    if (!A || !A.ctx || !A.noise) return;
    if (on && !this.hiss) {
      const src = A.ctx.createBufferSource();
      src.buffer = A.noise;
      src.loop = true;
      const f = A.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 2200;
      f.Q.value = 0.9;
      const g = A.ctx.createGain();
      g.gain.value = 0.035;
      // Crackle: the hiss gain wobbles.
      const lfo = A.ctx.createOscillator();
      lfo.frequency.value = 13;
      const lg = A.ctx.createGain();
      lg.gain.value = 0.018;
      lfo.connect(lg).connect(g.gain);
      src.connect(f).connect(g).connect(A.master);
      src.start();
      lfo.start();
      this.hiss = { src, lfo, g };
    } else if (!on && this.hiss) {
      const h = this.hiss;
      this.hiss = null;
      try { h.g.gain.setTargetAtTime(0, A.ctx.currentTime, 0.03); setTimeout(() => { try { h.src.stop(); h.lfo.stop(); } catch {} }, 150); } catch {}
    }
  }
}
