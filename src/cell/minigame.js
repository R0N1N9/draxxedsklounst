// Sniper Cell — the two server minigames (mouse, keyboard or touch).
//   UPLOAD · SIGNAL LOCK   three rings spin around the port; each has a gap. Lock a ring
//                          (click / tap / SPACE) when its gap passes the notch at the top.
//                          Outer ring first. A miss spikes SENTINEL's trace and speeds the ring up.
//   EXTRACT · DRIVE RELEASE  a marker sweeps across three latches; release each (click / tap /
//                          SPACE) while the marker is inside its green window. Windows shrink.
// Esc or ✕ backs out (you can come back to it).
export class Minigame {
  constructor() {
    const el = (this.el = document.createElement('div'));
    el.id = 'cell-mini';
    el.innerHTML = '<div class="mg-card"><div class="mg-top"><b class="mg-title"></b><button class="mg-x">✕</button></div><canvas class="mg-cv"></canvas><p class="mg-hint"></p><button class="mg-act">LOCK</button></div>';
    document.body.appendChild(el);
    this.cv = el.querySelector('.mg-cv');
    this.ctx = this.cv.getContext('2d');
    this.title = el.querySelector('.mg-title');
    this.hint = el.querySelector('.mg-hint');
    this.btn = el.querySelector('.mg-act');
    el.querySelector('.mg-x').addEventListener('pointerdown', (e) => { e.preventDefault(); this.close(false); });
    this.btn.addEventListener('pointerdown', (e) => { e.preventDefault(); this._act(); });
    this.cv.addEventListener('pointerdown', (e) => { e.preventDefault(); this._act(); });
    addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') { e.preventDefault(); e.stopPropagation(); this._act(); }
      if (e.code === 'Escape') { e.preventDefault(); this.close(false); }
    }, true);
  }

  // kind: 'upload' | 'extract'. cb(ok) when it ends; onMiss() for each mistake.
  start(kind, cb, onMiss) {
    this.kind = kind;
    this.cb = cb;
    this.onMiss = onMiss;
    this.open = true;
    this.t = 0;
    this.step = 0;
    this.flash = 0;
    this.el.classList.add('on');
    const k = Math.min(devicePixelRatio, 2);
    this.cv.width = 340 * k;
    this.cv.height = 240 * k;
    if (kind === 'upload') {
      this.title.textContent = 'UPLOAD · SIGNAL LOCK';
      this.hint.textContent = 'Lock each ring when its gap passes the notch (SPACE / click / tap). Outer ring first.';
      this.btn.textContent = 'LOCK';
      this.rings = [0, 1, 2].map((i) => ({ a: Math.random() * Math.PI * 2, v: (1.3 + i * 0.5) * (i % 2 ? -1 : 1), locked: false, r: 92 - i * 26, gap: 0.5 - i * 0.07 }));
    } else {
      this.title.textContent = 'EXTRACT · DRIVE RELEASE';
      this.hint.textContent = 'Release each latch while the marker is in the green window (SPACE / click / tap).';
      this.btn.textContent = 'RELEASE';
      this.pos = 0;
      this.dir = 1;
      this.speed = 0.75;
      this.wins = [0, 1, 2].map((i) => ({ c: 0.2 + Math.random() * 0.6, w: 0.16 - i * 0.035 }));
    }
    const loop = (t0) => {
      if (!this.open) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - (this._last || now)) / 1000);
      this._last = now;
      this._tick(dt);
      this._draw();
      requestAnimationFrame(loop);
    };
    this._last = 0;
    requestAnimationFrame(loop);
  }

  close(ok) {
    if (!this.open) return;
    this.open = false;
    this.el.classList.remove('on');
    const cb = this.cb;
    this.cb = null;
    if (cb) cb(ok);
  }

  _tick(dt) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 3);
    if (this.kind === 'upload') for (const R of this.rings) { if (!R.locked) R.a += R.v * dt; }
    else {
      this.pos += this.dir * this.speed * dt;
      if (this.pos > 1) { this.pos = 1; this.dir = -1; }
      if (this.pos < 0) { this.pos = 0; this.dir = 1; }
    }
  }

  _act() {
    if (!this.open) return;
    if (this.kind === 'upload') {
      const R = this.rings[this.step];
      // Gap centre vs. the notch at the top (-90°).
      let d = ((R.a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      d = Math.min(d, Math.PI * 2 - d);
      if (d < R.gap / 2) { R.locked = true; R.a = 0; this.step++; this._beep(true); if (this.step >= 3) setTimeout(() => this.close(true), 350); }
      else this._miss(() => { R.v *= 1.15; });
    } else {
      const W = this.wins[this.step];
      if (Math.abs(this.pos - W.c) < W.w / 2) { W.done = true; this.step++; this.speed *= 1.25; this._beep(true); if (this.step >= 3) setTimeout(() => this.close(true), 350); }
      else this._miss(() => {});
    }
  }
  _miss(fn) {
    this.flash = 1;
    fn();
    this._beep(false);
    if (this.onMiss) this.onMiss();
  }
  _beep(ok) {
    try {
      const A = window.__game && window.__game.audio;
      if (A && A.ctx) { const o = A.ctx.createOscillator(), g = A.ctx.createGain(); o.type = 'square'; o.frequency.value = ok ? 1400 : 220; g.gain.setValueAtTime(0.06, A.now); g.gain.exponentialRampToValueAtTime(0.0001, A.now + 0.15); o.connect(g).connect(A.master); o.start(); o.stop(A.now + 0.16); }
    } catch {}
  }

  _draw() {
    const c = this.ctx, k = this.cv.width / 340;
    c.setTransform(k, 0, 0, k, 0, 0);
    c.fillStyle = '#02080b';
    c.fillRect(0, 0, 340, 240);
    if (this.flash > 0) { c.fillStyle = `rgba(255,40,70,${this.flash * 0.25})`; c.fillRect(0, 0, 340, 240); }
    c.strokeStyle = 'rgba(0,255,224,0.07)';
    for (let x = 0; x < 340; x += 20) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 240); c.stroke(); }
    if (this.kind === 'upload') {
      const cx = 170, cy = 128;
      c.fillStyle = '#00ffe0';
      c.beginPath(); c.moveTo(cx, cy - 112); c.lineTo(cx - 7, cy - 124); c.lineTo(cx + 7, cy - 124); c.closePath(); c.fill();
      this.rings.forEach((R, i) => {
        c.lineWidth = 12;
        c.strokeStyle = R.locked ? '#30ff90' : i === this.step ? '#00ffe0' : 'rgba(0,255,224,0.35)';
        const g0 = -Math.PI / 2 + R.a + R.gap / 2, g1 = -Math.PI / 2 + R.a - R.gap / 2 + Math.PI * 2;
        c.beginPath(); c.arc(cx, cy, R.r, g0, g1); c.stroke();
      });
      c.fillStyle = this.step >= 3 ? '#30ff90' : '#ffb020';
      c.beginPath(); c.arc(cx, cy, 18, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#02080b';
      c.font = '700 12px JetBrains Mono, monospace';
      c.textAlign = 'center';
      c.fillText(`${this.step}/3`, cx, cy + 4);
    } else {
      const x0 = 30, x1 = 310, y = 120;
      c.fillStyle = 'rgba(0,255,224,0.12)';
      c.fillRect(x0, y - 18, x1 - x0, 36);
      this.wins.forEach((W, i) => {
        const a = x0 + (W.c - W.w / 2) * (x1 - x0), b = x0 + (W.c + W.w / 2) * (x1 - x0);
        c.fillStyle = W.done ? 'rgba(48,255,144,0.25)' : i === this.step ? 'rgba(48,255,144,0.7)' : 'rgba(48,255,144,0.2)';
        if (i === this.step || W.done) c.fillRect(a, y - 18, b - a, 36);
      });
      const mx = x0 + this.pos * (x1 - x0);
      c.fillStyle = '#ffffff';
      c.fillRect(mx - 2, y - 26, 4, 52);
      c.fillStyle = '#00ffe0';
      c.font = '700 12px JetBrains Mono, monospace';
      c.textAlign = 'center';
      c.fillText(`LATCH ${Math.min(3, this.step + 1)} / 3`, 170, 190);
    }
  }
}
