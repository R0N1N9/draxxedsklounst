// TTY DUEL — glyph particles (sparks that are characters) and the cell list of a ray.
import { COLS, ROWS, CH } from './world.js';

export const RAY_CH = ['=', '|', '/', '\\'];
export const AIM_CH = ['-', '¦', '/', '\\'];

/** Which line character suits a heading (screen angles; the cell is twice as tall as wide, the world is not). */
export function rayChar(dx, dy) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ay < ax * 0.42) return 0;
  if (ax < ay * 0.42) return 1;
  return dx * dy < 0 ? 2 : 3;
}

const SPARKS = ['*', '+', '.', '*', "'", 'x'];
const DEBRIS = ['@', '0', '1', '#', '%', 'x', '$', '&', '0', '1'];

export function makeParts(max = 260) {
  const pool = [];
  for (let i = 0; i < max; i++) pool.push({ live: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, ch: '*', col: '#fff', big: false, drag: 0, g: 0 });
  let next = 0;
  const P = { pool, max };
  P.emit = (x, y, vx, vy, life, ch, col, big, drag, g) => {
    const q = pool[next];
    next = (next + 1) % max;
    q.live = true; q.x = x; q.y = y; q.vx = vx; q.vy = vy; q.age = 0; q.life = life; q.ch = ch; q.col = col; q.big = !!big; q.drag = drag || 0; q.g = g || 0;
  };
  /** A hit on a wall: sparks thrown back along the normal. */
  P.sparks = (x, y, nx, ny, col, n = 9, speed = 46) => {
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(ny, nx) + (Math.random() - 0.5) * 2.2, s = speed * (0.25 + Math.random() * 0.9);
      P.emit(x + nx * 0.4, y + ny * 0.4, Math.cos(a) * s, Math.sin(a) * s, 0.28 + Math.random() * 0.5, SPARKS[(Math.random() * SPARKS.length) | 0], col, Math.random() < 0.25, 3.2);
    }
  };
  /** The victim comes apart into the characters it was made of. */
  P.debris = (x, y, col, n = 46) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 6 + Math.random() * 46;
      P.emit(x, y, Math.cos(a) * s, Math.sin(a) * s * 0.7, 0.6 + Math.random() * 1.1, DEBRIS[(Math.random() * DEBRIS.length) | 0], col, Math.random() < 0.4, 1.8, 12);
    }
  };
  P.update = (dt) => {
    for (let i = 0; i < max; i++) {
      const q = pool[i];
      if (!q.live) continue;
      q.age += dt;
      if (q.age >= q.life) { q.live = false; continue; }
      const k = Math.exp(-q.drag * dt);
      q.vx *= k; q.vy *= k;
      q.vy += q.g * dt;
      q.x += q.vx * dt; q.y += q.vy * dt;
    }
  };
  P.clear = () => { for (const q of pool) q.live = false; };
  return P;
}

/** The characters a ray passes through: cell, glyph, and how far along the route each one is. */
export function rayCells(p, step = 0.55) {
  const cap = 300;
  const o = { n: 0, c: new Int16Array(cap), r: new Int16Array(cap), k: new Uint8Array(cap), s: new Float32Array(cap), leg: new Uint8Array(cap), bounceAt: -1 };
  let lc = -1, lr = -1;
  const leg = (x0, y0, x1, y1, base, which) => {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    if (len < 0.01) return;
    const ux = dx / len, uy = dy / len, kk = rayChar(ux, uy);
    for (let d = which ? 0.5 : 1.2; d <= len && o.n < cap; d += step) {
      const x = x0 + ux * d, y = y0 + uy * d;
      const c = Math.floor(x), r = Math.floor(y / CH);
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS || (c === lc && r === lr)) continue;
      lc = c; lr = r;
      o.c[o.n] = c; o.r[o.n] = r; o.k[o.n] = kk; o.s[o.n] = base + d; o.leg[o.n] = which; o.n++;
    }
  };
  leg(p.x0, p.y0, p.x1, p.y1, 0, 0);
  if (p.bounce) { o.bounceAt = p.l1; lc = lr = -1; leg(p.x1 + p.n1x * 0.03, p.y1 + p.n1y * 0.03, p.x2, p.y2, p.l1, 1); }
  return o;
}
