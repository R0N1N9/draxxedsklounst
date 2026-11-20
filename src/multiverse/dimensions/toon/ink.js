// Hand-inked line work. Every outline here is a closed curve through jittered points whose jitter
// re-rolls a few times a second: that is the "boil" of a 1930s cel, where each frame was traced
// afresh and no two lines agree. Nothing allocates: the point scratch buffers are shared.
import { TAU } from '../../kit.js';

export const C = {
  ink: '#1b1612', paper: '#f2eAd8', paper2: '#e6dcc4', g1: '#d6ccb6', g2: '#b9af99', g3: '#8f8675', g4: '#625a4d', g5: '#3a342c',
};
export const FONT = '"Marker Felt", "Chalkboard SE", Impact, "Arial Black", "Rajdhani", sans-serif';

/** The ink frame: bumped by the renderer ~12 times a second. */
export const boil = { f: 0 };

export function hash1(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
/** A jitter in [-amp, amp] that is stable within one ink frame. */
export const jit = (i, amp) => (hash1(i * 7.13 + boil.f * 3.71) - 0.5) * 2 * amp;

const PX = new Float32Array(64), PY = new Float32Array(64);

/** Trace a smooth closed ellipse-ish outline (no fill or stroke). */
export function blobPath(g, cx, cy, rx, ry, seed, amp = 1.1, n = 12, rot = 0) {
  n = Math.min(n, 30);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rot;
    PX[i] = cx + Math.cos(a) * rx + jit(seed + i * 1.37, amp);
    PY[i] = cy + Math.sin(a) * ry + jit(seed + i * 1.37 + 50, amp);
  }
  g.beginPath();
  g.moveTo((PX[n - 1] + PX[0]) / 2, (PY[n - 1] + PY[0]) / 2);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    g.quadraticCurveTo(PX[i], PY[i], (PX[i] + PX[j]) / 2, (PY[i] + PY[j]) / 2);
  }
  g.closePath();
}

/** A filled, inked blob. fill / stroke may be null. */
export function blob(g, cx, cy, rx, ry, seed, fill, lw = 3, amp = 1.1, n = 12, rot = 0, stroke = C.ink) {
  blobPath(g, cx, cy, rx, ry, seed, amp, n, rot);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (lw > 0 && stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.lineJoin = 'round'; g.stroke(); }
}

/** A closed polygon from a flat [x, y, ...] array with slightly bowed, jittered edges. */
export function poly(g, pts, seed, fill, lw = 3, amp = 1, stroke = C.ink, bow = 0.8) {
  const n = pts.length >> 1;
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const x = pts[i * 2] + jit(seed + i * 2.1, amp), y = pts[i * 2 + 1] + jit(seed + i * 2.1 + 40, amp);
    const j = (i + 1) % n;
    const x2 = pts[j * 2] + jit(seed + j * 2.1, amp), y2 = pts[j * 2 + 1] + jit(seed + j * 2.1 + 40, amp);
    if (i === 0) g.moveTo(x, y);
    const mx = (x + x2) / 2 + jit(seed + i * 5.3, bow), my = (y + y2) / 2 + jit(seed + i * 5.3 + 9, bow);
    g.quadraticCurveTo(mx, my, x2, y2);
  }
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (lw > 0 && stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
}

/** A hand-ruled line (a little bowed). Adds to the current path. */
export function wline(g, x1, y1, x2, y2, seed, amp = 1) {
  g.moveTo(x1 + jit(seed, amp * 0.6), y1 + jit(seed + 1, amp * 0.6));
  g.quadraticCurveTo((x1 + x2) / 2 + jit(seed + 2, amp), (y1 + y2) / 2 + jit(seed + 3, amp), x2 + jit(seed + 4, amp * 0.6), y2 + jit(seed + 5, amp * 0.6));
}

/** A rubber-hose limb: one smooth curve from A to B bowed sideways by `bend`, stroked in ink. */
export function hose(g, x0, y0, x1, y1, bend, w, seed, col = C.ink) {
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1;
  g.beginPath();
  g.moveTo(x0, y0);
  g.quadraticCurveTo(mx - (dy / d) * bend + jit(seed, 0.5), my + (dx / d) * bend + jit(seed + 1, 0.5), x1, y1);
  g.strokeStyle = col;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.stroke();
}

/** A five-point star path (no fill or stroke). */
export function starPath(g, x, y, r, rot = 0, inner = 0.45) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5 - Math.PI / 2, rr = i & 1 ? r * inner : r;
    if (i) g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

/** Lettering with a thick ink outline, like a title card's. */
export function letters(g, text, x, y, px, rot = 0, fill = C.paper, lw = 0.2) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.font = `900 ${px}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = px * lw;
  g.strokeStyle = C.ink;
  g.strokeText(text, 0, 0);
  g.fillStyle = fill;
  g.fillText(text, 0, 0);
  g.restore();
}
