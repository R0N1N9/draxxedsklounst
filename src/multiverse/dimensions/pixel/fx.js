// Juice made of whole pixels: a pooled particle field (confetti, sparks, wood chips, dust),
// expanding rings and the muzzle star. Nothing allocates after construction.
import { PAL } from './palette.js';
import { ring } from './px.js';
import { solidAt } from './world.js';

export function makeFx(max = 260) {
  const P = [];
  for (let i = 0; i < max; i++) P.push({ x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0, col: '#fff', size: 1, grav: 0, bounce: 0, drag: 0, live: false });
  let next = 0;
  const R = [];
  for (let i = 0; i < 24; i++) R.push({ x: 0, y: 0, r0: 0, r1: 0, age: 0, life: 0, col: '#fff', live: false });
  let rn = 0;
  return {
    emit(x, y, vx, vy, life, col, size = 1, grav = 0, bounce = 0, drag = 0) {
      const p = P[next];
      next = (next + 1) % max;
      p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.age = 0; p.life = life; p.col = col; p.size = size; p.grav = grav; p.bounce = bounce; p.drag = drag; p.live = true;
    },
    ring(x, y, r0, r1, life, col) {
      const r = R[rn];
      rn = (rn + 1) % R.length;
      r.x = x; r.y = y; r.r0 = r0; r.r1 = r1; r.age = 0; r.life = life; r.col = col; r.live = true;
    },
    /** A burst of sparks in a cone around angle `a` (spread radians). */
    sparks(x, y, a, spread, n, speed, cols) {
      for (let i = 0; i < n; i++) {
        const an = a + (Math.random() - 0.5) * spread, sp = speed * (0.3 + Math.random() * 0.8);
        this.emit(x, y, Math.cos(an) * sp, Math.sin(an) * sp, 0.25 + Math.random() * 0.4, cols[(Math.random() * cols.length) | 0], 1, 260, 0.3);
      }
    },
    /** Confetti squares in every direction. */
    confetti(x, y, n, speed, cols) {
      for (let i = 0; i < n; i++) {
        const an = Math.random() * 6.283, sp = speed * (0.25 + Math.random() * 0.85);
        this.emit(x, y, Math.cos(an) * sp, Math.sin(an) * sp - speed * 0.3, 0.9 + Math.random() * 1.3, cols[(Math.random() * cols.length) | 0], Math.random() < 0.35 ? 2 : 1, 300, 0.45, 0.3);
      }
    },
    update(dt, world) {
      for (let i = 0; i < max; i++) {
        const p = P[i];
        if (!p.live) continue;
        p.age += dt;
        if (p.age >= p.life) { p.live = false; continue; }
        if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; }
        p.vy += p.grav * dt;
        const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
        if (p.bounce && world && solidAt(world, nx, ny)) {
          if (solidAt(world, p.x, ny)) { p.vy = -p.vy * p.bounce; p.vx *= 0.8; if (Math.abs(p.vy) < 14) p.vy = 0; } else p.vx = -p.vx * p.bounce;
        } else { p.x = nx; p.y = ny; }
      }
      for (const r of R) if (r.live && (r.age += dt) >= r.life) r.live = false;
    },
    draw(g) {
      for (let i = 0; i < max; i++) {
        const p = P[i];
        if (!p.live) continue;
        if (p.life - p.age < 0.15 && ((p.age * 40) | 0) % 2) continue; // blink out, like old sprites
        g.fillStyle = p.col;
        g.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
      for (const r of R) {
        if (!r.live) continue;
        const k = r.age / r.life;
        ring(g, r.x, r.y, Math.round(r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k))), k < 0.55 ? r.col : PAL.cream === r.col ? PAL.peach : r.col);
      }
    },
    clear() { for (const p of P) p.live = false; for (const r of R) r.live = false; },
  };
}

/** The muzzle star: a four-point flash that spikes along the barrel. */
export function drawFlash(g, x, y, a, k) {
  x = Math.round(x); y = Math.round(y);
  const L = Math.round(8 * k) + 2, c = Math.cos(a), s = Math.sin(a);
  g.fillStyle = PAL.coral;
  for (let i = 0; i <= L; i++) g.fillRect(Math.round(x + c * i), Math.round(y + s * i), 1, 1);
  g.fillStyle = PAL.cream;
  g.fillRect(x - 1, y - 1, 3, 3);
  g.fillStyle = PAL.peach;
  for (let i = 1; i < L * 0.7; i++) g.fillRect(Math.round(x + c * i), Math.round(y + s * i) - 1, 1, 3);
  g.fillStyle = PAL.cream;
  g.fillRect(x, y - 3, 1, 7); g.fillRect(x - 3, y, 7, 1);
}
