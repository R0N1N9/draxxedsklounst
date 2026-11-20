// Ink effects: pooled sound-effect lettering, ground ripples and a few helpers for splashes of ink.
import { Particles2D, ease } from '../../kit.js';
import { C, drawSfx } from './ink.js';

// Pooled lettering. World-anchored words follow the camera; screen words stay put.
export class SfxPool {
  constructor(n = 10) {
    this.n = n;
    this.a = [];
    for (let i = 0; i < n; i++) this.a.push({ live: false, text: '', x: 0, z: 0, h: 0, sx: 0, sy: 0, size: 40, rot: 0, age: 0, life: 1, vert: false, world: true, rise: 0, fill: C.ink, line: C.white, big: false });
    this.next = 0;
  }

  // size is in px at 15 px/unit (so a word keeps its place in the picture as the camera zooms)
  add(text, x, y, size, rot, life, o) {
    const s = this.a[this.next];
    this.next = (this.next + 1) % this.n;
    s.live = true; s.text = text; s.size = size; s.rot = rot; s.age = 0; s.life = life;
    s.world = !(o && o.screen);
    s.x = x; s.z = y; s.sx = x; s.sy = y;
    s.h = (o && o.h) || 0;
    s.vert = !!(o && o.vert);
    s.rise = (o && o.rise) || 0;
    s.fill = (o && o.fill) || C.ink;
    s.line = (o && o.line) || C.white;
    s.shake = o && o.shake !== undefined ? o.shake : 1;
    return s;
  }

  update(dt) {
    for (const s of this.a) if (s.live && (s.age += dt) >= s.life) s.live = false;
  }

  clear() { for (const s of this.a) s.live = false; }

  draw(g, v) {
    for (const s of this.a) {
      if (!s.live) continue;
      const k = s.age / s.life, pop = ease.outBack(Math.min(1, s.age / 0.13)), fade = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      let x = s.sx, y = s.sy, px = s.size * Math.max(0.5, Math.min(1.5, v.ph / 700));
      if (s.world) { x = v.sx(s.x); y = v.sy(s.z, s.h) - s.rise * k * v.S; } else px = s.size;
      const jit = s.shake * Math.max(0, 1 - s.age * 4) * px * 0.04;
      g.save();
      g.globalAlpha = fade;
      drawSfx(g, s.text, x + (Math.random() - 0.5) * jit, y + (Math.random() - 0.5) * jit, px * (0.4 + 0.6 * pop), s.rot, { fill: s.fill, line: s.line, vertical: s.vert, shadow: px * 0.045 });
      g.restore();
    }
  }
}

// Expanding ellipses on the ground: footsteps in puddles, splashes, bullet strikes.
export class Ripples {
  constructor(n = 28) {
    this.n = n;
    this.a = [];
    for (let i = 0; i < n; i++) this.a.push({ live: false, x: 0, z: 0, age: 0, life: 0.6, r: 1 });
    this.next = 0;
  }

  add(x, z, r = 1.2, life = 0.6) {
    const q = this.a[this.next];
    this.next = (this.next + 1) % this.n;
    q.live = true; q.x = x; q.z = z; q.r = r; q.age = 0; q.life = life;
  }

  update(dt) { for (const q of this.a) if (q.live && (q.age += dt) >= q.life) q.live = false; }

  draw(g, v) {
    g.lineWidth = 1.3;
    for (const q of this.a) {
      if (!q.live) continue;
      const k = q.age / q.life, r = q.r * (0.25 + k) * v.S;
      g.globalAlpha = (1 - k) * 0.9;
      g.strokeStyle = C.ink;
      g.beginPath();
      g.ellipse(v.sx(q.x), v.sy(q.z), r, r * 0.4, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
  }
}

export function makeParticles() { return new Particles2D(420); }

// ink drops (black), paper chips (white / identity colour), streaks
export function inkBurst(pt, x, y, n, power, col) {
  pt.burst(n, () => {
    const a = Math.random() * Math.PI * 2, s = (0.2 + Math.random()) * power;
    return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - power * 0.2, life: 0.4 + Math.random() * 0.6, size: 2 + Math.random() * 4, color: col || C.ink, drag: 2.2, gravity: 500, shape: 'circle' };
  });
}

export function chips(pt, x, y, n, power, col) {
  pt.burst(n, () => {
    const a = Math.random() * Math.PI * 2, s = (0.2 + Math.random()) * power;
    return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - power * 0.3, life: 0.7 + Math.random() * 0.8, size: 4 + Math.random() * 5, color: Math.random() < 0.6 ? C.white : col || C.ink, drag: 1.5, gravity: 380, shape: 'square', rot: Math.random() * 6, spin: (Math.random() - 0.5) * 18 };
  });
}
