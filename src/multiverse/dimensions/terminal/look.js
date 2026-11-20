// TTY DUEL — palette, screen layout and the static map layer (the part of the picture that
// only changes when cover is deleted or the window is resized).
import { clamp, mixHex } from '../../kit.js';
import { COLS, ROWS, CH, H } from './world.js';

export const FONT = '"JetBrains Mono", "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';

/** Green or amber phosphor; every colour the screen uses is derived from it. */
export function makePalette(amber, c0, c1) {
  const base = amber ? '#ff9a1f' : '#4dff6a';
  const bg = amber ? '#0d0600' : '#010b04';
  return {
    amber, bg, base, p0: c0, p1: c1,
    hi: mixHex(base, '#ffffff', 0.6),
    mid: base,
    lo: mixHex(base, bg, 0.5),
    dim: mixHex(base, bg, 0.78),
    warn: amber ? '#fff0c2' : '#f2ff6a',
    ink: bg,
  };
}

/** Where everything sits: the map in unit space (u CSS px per unit), the console under it, or over it on a phone. */
export function fitLayout(L, w, h, touch) {
  const compact = h < 480;
  L.w = w; L.h = h; L.touch = touch; L.compact = compact;
  L.top = compact ? 46 : w < 900 ? 54 : 60;
  L.cf = clamp(Math.round(Math.min(w, h) * 0.0185), 10, 15);
  L.lineH = Math.round(L.cf * 1.4);
  const consMin = compact ? 0 : L.lineH * 4 + 12;
  L.u = Math.max(2, Math.min((w - 8) / COLS, (h - L.top - consMin - 4) / H));
  L.mw = COLS * L.u; L.mh = H * L.u;
  L.mx = Math.round((w - L.mw) / 2);
  const spare = h - L.top - L.mh - 4;
  L.my = Math.round(L.top + (compact ? Math.max(0, spare) : Math.min(8, Math.max(0, spare - consMin) / 2)));
  L.fs = Math.max(6, L.u * 1.58);
  // The console: under the map, between the thumbs on touch and clear of the ability chips on desktop.
  if (compact) {
    L.cx0 = Math.round(w * 0.27); L.cx1 = Math.round(w * 0.73);
    L.cy1 = h - 5; L.lines = 3; L.cy0 = L.cy1 - L.lines * L.lineH - 4;
  } else {
    L.cx0 = touch ? Math.min(230, w * 0.2) : Math.max(8, L.mx);
    L.cx1 = touch ? w - Math.min(230, w * 0.2) : (w > 1000 ? w - 400 : w - 10);
    L.cy0 = L.my + L.mh + 6; L.cy1 = h - 6;
    L.lines = clamp(Math.floor((L.cy1 - L.cy0) / L.lineH), 4, 9);
    L.cy0 = L.cy1 - L.lines * L.lineH;
  }
  return L;
}

/** Make (or resize) the canvas a layer draws into; returns true when it has to be redrawn. */
export function sizeLayer(Y, L, rs) {
  const sc = Math.min(rs, 2200 / L.mw, 2);
  const wpx = Math.max(1, Math.round(COLS * L.u * sc)), hpx = Math.max(1, Math.round(H * L.u * sc));
  Y.sc = sc;
  if (Y.canvas.width === wpx && Y.canvas.height === hpx) return false;
  Y.canvas.width = Y.masked.width = wpx;
  Y.canvas.height = Y.masked.height = hpx;
  return true;
}

// Cell groups small enough to be pillars get a double outline; long runs are thin box-drawing lines.
const isPillar = (q) => !q.border && (q.c1 - q.c0 + 1) * (q.r1 - q.r0 + 1) <= 8 && (q.c1 > q.c0 || q.r1 > q.r0);

export function renderLayer(Y, L, world, pal) {
  const g = Y.g, u = L.u * Y.sc, wpx = Y.canvas.width, hpx = Y.canvas.height, grid = world.grid;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, wpx, hpx);
  const wall = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS && grid[r * COLS + c] === 1;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // Spawn rooms wear their sniper's colour.
  for (let i = 0; i < 2; i++) {
    const c0 = i ? COLS - 10 : 1;
    g.globalAlpha = 0.085;
    g.fillStyle = i ? pal.p1 : pal.p0;
    g.fillRect(c0 * u, 8 * CH * u, 9 * u, 8 * CH * u);
  }
  g.globalAlpha = 0.07;
  g.fillStyle = pal.mid;
  g.fillRect(38 * u, 9 * CH * u, 12 * u, 6 * CH * u); // the vault
  // floor: dots, registration marks, labels
  g.font = `${Math.round(u * 1.5)}px ${FONT}`;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (wall(c, r)) continue;
      const x = (c + 0.5) * u, y = (r + 0.5) * CH * u;
      if ((c % 11 === 5 && r % 4 === 1)) { g.globalAlpha = 0.55; g.fillStyle = pal.mid; g.fillText('+', x, y); } else if (((c + r) & 1) === 0) { g.globalAlpha = 0.34; g.fillStyle = pal.mid; g.fillText('·', x, y); }
    }
  }
  g.font = `600 ${Math.round(u * 1.5)}px ${FONT}`;
  for (const lb of world.labels) {
    g.fillStyle = lb.t === '~/p0' ? pal.p0 : lb.t === '~/p1' ? pal.p1 : pal.mid;
    g.globalAlpha = lb.t[0] === '~' ? 0.85 : 0.5;
    for (let k = 0; k < lb.t.length; k++) if (!wall(lb.c + k, lb.r)) g.fillText(lb.t[k], (lb.c + k + 0.5) * u, (lb.r + 0.5) * CH * u);
  }
  // walls: a tinted cell, a glowing box-drawing stroke
  const lw = Math.max(1, u * 0.15);
  g.globalAlpha = 0.07;
  g.fillStyle = pal.mid;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (wall(c, r)) g.fillRect(c * u, r * CH * u, u, CH * u);
  const pill = new Uint8Array(COLS * ROWS);
  for (const q of world.rects) {
    if (q.dead || !isPillar(q)) continue;
    for (let r = q.r0; r <= q.r1; r++) for (let c = q.c0; c <= q.c1; c++) pill[r * COLS + c] = 1;
  }
  const seg = (path) => {
    g.beginPath();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!wall(c, r) || pill[r * COLS + c]) continue;
        const x = (c + 0.5) * u, y = (r + 0.5) * CH * u, hy = CH * u / 2, hx = u / 2;
        const n = wall(c, r - 1), s = wall(c, r + 1), w = wall(c - 1, r), e = wall(c + 1, r);
        if (n) { g.moveTo(x, y); g.lineTo(x, y - hy); }
        if (s) { g.moveTo(x, y); g.lineTo(x, y + hy); }
        if (w) { g.moveTo(x, y); g.lineTo(x - hx, y); }
        if (e) { g.moveTo(x, y); g.lineTo(x + hx, y); }
        if (!n && !s && !w && !e) { g.moveTo(x - hx, y); g.lineTo(x + hx, y); }
      }
    }
    g.stroke();
  };
  g.lineCap = 'square';
  g.globalAlpha = 0.22; g.strokeStyle = pal.mid; g.lineWidth = lw * 2.6; seg();
  g.globalAlpha = 1; g.strokeStyle = pal.hi; g.lineWidth = lw; seg();
  // pillars and racks: double outline over a hatched block
  for (const q of world.rects) {
    if (q.dead || !isPillar(q)) continue;
    const x = q.x * u, y = q.y * u, w = q.w * u, h = q.h * u, i1 = u * 0.16, i2 = u * 0.46;
    g.globalAlpha = 0.14; g.fillStyle = pal.mid; g.fillRect(x, y, w, h);
    g.globalAlpha = 1; g.strokeStyle = pal.hi; g.lineWidth = lw;
    g.strokeRect(x + i1, y + i1, w - 2 * i1, h - 2 * i1);
    g.globalAlpha = 0.65; g.strokeStyle = pal.mid; g.lineWidth = lw * 0.8;
    if (w > 2.6 * u && h > 2 * i2) g.strokeRect(x + i2, y + i2 * 1.2, w - 2 * i2, h - 2.4 * i2);
  }
  g.globalAlpha = 1;
  g.lineCap = 'butt';
}
