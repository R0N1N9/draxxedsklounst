// Pieces of the picture that only need the camera: bullets, smoke clouds, afterimage trails, the closing page,
// the foreground railing and the concentration lines.
import { ease, TAU } from '../../kit.js';
import { C } from './ink.js';
import { WZ, CHEST } from './world.js';

export function drawSteam(g, v, t, c) {
  g.strokeStyle = C.ink;
  g.lineWidth = 1.2 / v.S;
  g.fillStyle = C.white;
  for (let i = 0; i < 3; i++) {
    const u = ((t * 0.5 + i / 3) % 1), x = 1.4 + Math.sin(t + i * 2) * 0.35, y = -c.h * 0.55 - 0.4 - u * 3.4, r = 0.28 + u * 0.55;
    g.globalAlpha = 1 - u;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.stroke();
  }
  g.globalAlpha = 1;
}

export function drawBullet(g, v, b, col) {
  const S_ = v.S, tip = { x: v.sx(b.x), y: v.sy(b.z, CHEST) }, tl = b.live ? 7 : 7 * (1 - b.age / 0.25);
  if (tl <= 0) return;
  const tx = v.sx(b.x - b.ux * tl), ty = v.sy(b.z - b.uz * tl, CHEST);
  g.lineCap = 'round';
  g.strokeStyle = C.white;
  g.lineWidth = 5.5;
  g.beginPath(); g.moveTo(tx, ty); g.lineTo(tip.x, tip.y); g.stroke();
  g.strokeStyle = C.ink;
  g.lineWidth = 2.6;
  g.beginPath(); g.moveTo(tx, ty); g.lineTo(tip.x, tip.y); g.stroke();
  const nx = -(tip.y - ty), ny = tip.x - tx, nl = Math.hypot(nx, ny) || 1;
  g.lineWidth = 1.1;
  g.beginPath();
  for (const o of [-1, 1]) { g.moveTo(tx + (nx / nl) * o * 4, ty + (ny / nl) * o * 4); g.lineTo(tx - (tip.x - tx) * 0.9 + (nx / nl) * o * 4, ty - (tip.y - ty) * 0.9 + (ny / nl) * o * 4); }
  g.stroke();
  if (b.live) {
    g.fillStyle = col;
    g.strokeStyle = C.ink;
    g.lineWidth = 1.6;
    g.beginPath(); g.arc(tip.x, tip.y, 3.4, 0, TAU); g.fill(); g.stroke();
  }
}

export function drawSmoke(g, v, tones, t, s) {
  const k = ease.outCubic(Math.min(1, s.age / 0.38)) * (s.age > s.life - 0.6 ? Math.max(0, (s.life - s.age) / 0.6) : 1), S_ = v.S;
  if (k <= 0.02) return;
  const cx = v.sx(s.x), cy = v.sy(s.z, 1.2);
  g.lineWidth = 2.2;
  g.strokeStyle = C.ink;
  g.fillStyle = C.white;
  for (const q of s.puffs) {
    const r = s.r * 0.5 * q.rr * k * S_, wob = Math.sin(t * 2.3 + q.dx) * 0.05 * S_;
    g.beginPath();
    g.ellipse(cx + q.dx * S_ * k, cy + q.dz * S_ * k * 1.0 + wob - (q.rr * 0.8) * k * S_ * 0.5, r, r * 0.86, 0, 0, TAU);
    g.fill();
    g.stroke();
  }
  tones.use(g, 'd1', 1);
  for (const q of s.puffs) { const r = s.r * 0.5 * q.rr * k * S_; g.beginPath(); g.ellipse(cx + q.dx * S_ * k + r * 0.2, cy + q.dz * S_ * k - q.rr * 0.4 * k * S_ + r * 0.25, r * 0.75, r * 0.6, 0, 0, TAU); g.fill(); }
  if (s.age < 0.3) { // the pop: ink speed lines blasting outward
    g.strokeStyle = C.ink;
    g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU + 0.3, r0 = s.r * S_ * 0.45 * k, r1 = r0 + S_ * (1.5 + (i % 3)) * (1 - s.age / 0.3); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.7); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 0.7); }
    g.stroke();
  }
}

export function drawTrails(g, v, trails) {
  for (const q of trails) {
    const k = 1 - q.age / 0.35;
    if (k <= 0) continue;
    g.strokeStyle = C.ink;
    g.lineCap = 'round';
    g.globalAlpha = k;
    const ax = v.sx(q.x0), ay = v.sy(q.z0, 1.7), bx = v.sx(q.x1), by = v.sy(q.z1, 1.7);
    for (let i = -3; i <= 3; i++) { g.lineWidth = i === 0 ? 3 : 1.4; const o = i * v.S * 0.32; g.beginPath(); g.moveTo(ax, ay + o); g.lineTo(bx + (bx - ax) * 0.05, by + o); g.stroke(); }
    g.globalAlpha = 1;
  }
}

export function drawWalls(g, v, lim, t) {
  if (lim.x0 < 3) return;
  const top = v.py - 20, bot = v.py + v.ph + 20;
  for (const side of [0, 1]) {
    const ex = side ? v.sx(lim.x1) : v.sx(lim.x0), dir = side ? 1 : -1;
    g.beginPath();
    g.moveTo(ex, top);
    for (let y = top; y < bot; y += 22) g.lineTo(ex + Math.sin(y * 0.37 + side) * 7 + ((y / 22) & 1 ? 9 : -3) * -dir * -1, y + 11);
    g.lineTo(ex + dir * 900, bot);
    g.lineTo(ex + dir * 900, top);
    g.closePath();
    g.fillStyle = C.ink;
    g.fill();
    g.strokeStyle = C.white;
    g.lineWidth = 1.4;
    g.beginPath();
    for (let i = 0; i < 16; i++) { const x = ex + dir * (14 + i * 22 + ((t * 90 * (1 + (i % 3))) % 24)), y0 = ((i * 193) % 700) + top; g.moveTo(x, y0); g.lineTo(x, y0 + 80 + (i % 4) * 40); }
    g.stroke();
  }
}

export function drawFront(g, v) {
  // low-hanging power lines and the canal railing in the foreground
  const S_ = v.S, y = v.sy(WZ + 0.6);
  g.strokeStyle = C.ink;
  g.lineWidth = Math.max(2, S_ * 0.2);
  g.lineCap = 'round';
  const pitch = 7 * S_, x0 = (v.ox % pitch) - pitch;
  g.beginPath();
  for (let x = x0; x < v.px + v.pw + pitch; x += pitch) { g.moveTo(x, y); g.lineTo(x, y - S_ * 1.5); }
  g.stroke();
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(v.px - 20, y - S_ * 1.1); g.lineTo(v.px + v.pw + 20, y - S_ * 1.1);
  g.moveTo(v.px - 20, y - S_ * 0.55); g.lineTo(v.px + v.pw + 20, y - S_ * 0.55);
  g.stroke();
}

export function drawFocusLines(g, v, k, t) {
  if (k < 0.05) return;
  const cx = v.px + v.pw / 2, cy = v.py + v.ph / 2, R = Math.hypot(v.pw, v.ph) * 0.5;
  g.fillStyle = C.ink;
  g.beginPath();
  const n = 110;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + Math.sin(i * 12.9) * 0.02, w = 0.004 + 0.011 * ((i * 7) % 5) / 5, r0 = R * (1.0 - 0.3 * k - 0.16 * ((i * 13) % 7) / 7), r1 = R * 1.3, wob = Math.sin(t * 14 + i) * 0.004;
    g.moveTo(cx + Math.cos(a + wob) * r0, cy + Math.sin(a + wob) * r0);
    g.lineTo(cx + Math.cos(a - w) * r1, cy + Math.sin(a - w) * r1);
    g.lineTo(cx + Math.cos(a + w) * r1, cy + Math.sin(a + w) * r1);
    g.closePath();
  }
  g.globalAlpha = Math.min(1, k * 1.2);
  g.fill();
  g.globalAlpha = 1;
}

