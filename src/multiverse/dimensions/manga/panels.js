// The page itself: the inked frame, the cut-in panels that slide over it for the big beats (narrowed eyes
// when you focus, the hand working the bolt, a tall muzzle-flash panel), the full-bleed splash page of the
// kill, and the small in-world marks (aim line, reticle, pointers, captions).
import { clamp, ease, damp, TAU } from '../../kit.js';
import { C, drawSfx, radialLines, inkFrame, taperInto } from './ink.js';
import { drawSniper, drawUmbrella, drawFlung, SC } from './figures.js';

const FONT = '"Arial Narrow", "Futura", "Avenir Next Condensed", "Rajdhani", Impact, sans-serif';

// ---------------------------------------------------------------------------
// frame: paper margin, a double ruled border, registration marks
// ---------------------------------------------------------------------------
export function drawFrame(g, v) {
  const { W, H, px, py, pw, ph } = v;
  g.fillStyle = C.paper;
  g.fillRect(0, 0, W, py);
  g.fillRect(0, py + ph, W, H - py - ph);
  g.fillRect(0, py, px, ph);
  g.fillRect(px + pw, py, W - px - pw, ph);
  inkFrame(g, px, py, pw, ph, Math.max(3, Math.min(5, W / 300)), 0);
  const o = Math.max(2.5, px * 0.42);
  inkFrame(g, px - o, py - o, pw + 2 * o, ph + 2 * o, 1, 2.5);
}

// ---------------------------------------------------------------------------
// cut-in panels
// ---------------------------------------------------------------------------
function beginPanel(g, x, y, w, h, rot, bg) {
  g.save();
  g.translate(x + w / 2, y + h / 2);
  g.rotate(rot);
  g.fillStyle = C.paper; // the white gutter that makes it a panel laid over the art
  g.fillRect(-w / 2 - 6, -h / 2 - 6, w + 12, h + 12);
  g.fillStyle = bg;
  g.fillRect(-w / 2, -h / 2, w, h);
  g.save();
  g.beginPath();
  g.rect(-w / 2, -h / 2, w, h);
  g.clip();
}

function endPanel(g, w, h, lw) {
  g.restore();
  g.lineJoin = 'miter';
  g.strokeStyle = C.ink;
  g.lineWidth = lw;
  g.strokeRect(-w / 2, -h / 2, w, h);
  g.restore();
}

function eye(g, cx, cy, ew, eh, col, side, look) {
  g.beginPath();
  g.moveTo(cx - ew / 2, cy + eh * 0.25);
  g.quadraticCurveTo(cx, cy - eh * 1.75, cx + ew / 2, cy + eh * 0.25);
  g.quadraticCurveTo(cx, cy + eh * 1.05, cx - ew / 2, cy + eh * 0.25);
  g.closePath();
  g.fillStyle = C.white;
  g.fill();
  g.save();
  g.clip();
  const ix = cx + look * ew * 0.08, r = Math.max(eh * 1.15, 4);
  g.fillStyle = col;
  g.beginPath(); g.arc(ix, cy, r, 0, TAU); g.fill();
  g.fillStyle = C.ink;
  g.beginPath(); g.arc(ix, cy, r * 0.46, 0, TAU); g.fill();
  g.lineWidth = 1.2;
  g.strokeStyle = C.ink;
  g.beginPath(); g.arc(ix, cy, r, 0, TAU); g.stroke();
  g.fillStyle = C.white;
  g.beginPath(); g.arc(ix - r * 0.32, cy - r * 0.3, r * 0.22, 0, TAU); g.fill();
  g.beginPath(); g.arc(ix + r * 0.25, cy + r * 0.28, r * 0.1, 0, TAU); g.fill();
  g.fillStyle = C.ink; // the lid's shadow
  g.fillRect(cx - ew / 2, cy - eh * 2, ew, eh * 1.05);
  g.restore();
  g.strokeStyle = C.ink;
  g.lineCap = 'round';
  g.lineWidth = Math.max(2.5, eh * 0.55);
  g.beginPath();
  g.moveTo(cx - ew / 2 - ew * 0.04, cy + eh * 0.22);
  g.quadraticCurveTo(cx, cy - eh * 1.85, cx + ew / 2 + ew * 0.04, cy + eh * 0.22);
  g.stroke();
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(cx - ew / 2, cy + eh * 0.28);
  g.quadraticCurveTo(cx, cy + eh * 1.1, cx + ew / 2, cy + eh * 0.28);
  g.stroke();
  g.beginPath(); // lashes at the outer corner
  for (let i = 0; i < 3; i++) { g.moveTo(cx + side * ew * 0.5, cy + eh * 0.1 - i * 2); g.lineTo(cx + side * (ew * 0.5 + ew * 0.1), cy - eh * (0.15 + i * 0.28)); }
  g.stroke();
  // brow: heavy, slanting down toward the nose
  g.beginPath();
  taperInto(g, [cx - side * ew * 0.35, cy - eh * 2.9 + 0, cx, cy - eh * 3.1 - eh * 0.15, cx + side * ew * 0.55, cy - eh * 2.6], 3, eh * 0.28, eh * 0.62);
  g.fillStyle = C.ink;
  g.fill();
}

function drawEyes(g, w, h, k, col, t) {
  g.fillStyle = C.ink;
  radialLines(g, 0, 0, h * 0.45, w * 0.9, 54, w * 0.045, 5, 0.8, t * 0.25);
  g.fill();
  const eh = h * (0.21 - 0.09 * k);
  eye(g, -w * 0.24, 0, w * 0.4, eh, col, -1, 0.5);
  eye(g, w * 0.24, 0, w * 0.4, eh, col, 1, 0.5);
}

function drawBolt(g, w, h, p, t) {
  g.fillStyle = C.ink;
  for (let i = 0; i < 9; i++) { const y = -h * 0.45 + i * h * 0.11; g.fillRect(-w * 0.5, y, w * (0.3 + 0.25 * ((i * 37) % 7) / 7), 1.3); g.fillRect(w * (0.15 + 0.06 * ((i * 13) % 5)), y + 3, w * 0.4, 1.3); }
  const lift = p < 0.16 ? p / 0.16 : p > 0.84 ? (1 - p) / 0.16 : 1;
  const pull = p < 0.18 ? 0 : p < 0.46 ? (p - 0.18) / 0.28 : p < 0.62 ? 1 : p < 0.82 ? 1 - (p - 0.62) / 0.2 : 0;
  const by = h * 0.12, bx = -pull * w * 0.2;
  // receiver and barrel
  g.fillStyle = C.ink;
  g.beginPath();
  g.moveTo(-w * 0.6, by - h * 0.1); g.lineTo(w * 0.6, by - h * 0.05); g.lineTo(w * 0.6, by + h * 0.08); g.lineTo(-w * 0.6, by + h * 0.16); g.closePath();
  g.fill();
  g.fillStyle = C.white;
  g.fillRect(-w * 0.3, by - h * 0.04, w * 0.28, 3); // ejection port glint
  g.fillRect(w * 0.05, by - h * 0.06, w * 0.4, 1.6);
  // the bolt: a rod sliding in the receiver, a handle swinging up and a knob
  g.strokeStyle = C.ink;
  g.lineCap = 'round';
  g.lineWidth = h * 0.07;
  g.beginPath();
  g.moveTo(bx - w * 0.05, by + h * 0.02);
  g.lineTo(bx + w * 0.07, by + h * 0.02 - lift * h * 0.12);
  g.lineTo(bx + w * 0.16, by - h * 0.05 - lift * h * 0.2);
  g.stroke();
  g.fillStyle = C.ink;
  g.beginPath(); g.arc(bx + w * 0.17, by - h * 0.06 - lift * h * 0.21, h * 0.085, 0, TAU); g.fill();
  g.strokeStyle = C.white;
  g.lineWidth = 1.6;
  g.beginPath(); g.arc(bx + w * 0.17, by - h * 0.06 - lift * h * 0.21, h * 0.085, 3.6, 4.7); g.stroke();
  // the gloved hand closing round the knob
  const hx = bx + w * 0.2, hy = by - h * 0.02 - lift * h * 0.2;
  g.fillStyle = C.ink;
  g.beginPath();
  g.moveTo(hx + w * 0.3, hy + h * 0.5); g.lineTo(hx + w * 0.28, hy + h * 0.06); g.quadraticCurveTo(hx + w * 0.14, hy - h * 0.26, hx - w * 0.02, hy - h * 0.12);
  g.quadraticCurveTo(hx - w * 0.07, hy + h * 0.04, hx + w * 0.02, hy + h * 0.1); g.lineTo(hx + w * 0.02, hy + h * 0.5);
  g.closePath();
  g.fill();
  g.strokeStyle = C.white;
  g.lineWidth = 1.3;
  g.beginPath();
  for (let i = 0; i < 3; i++) { g.moveTo(hx + w * 0.07 + i * w * 0.045, hy - h * 0.14 + i * 2); g.lineTo(hx + w * 0.1 + i * w * 0.045, hy + h * 0.02); }
  g.stroke();
  // the spent case tumbling out
  if (p > 0.3 && p < 0.7) {
    const u = (p - 0.3) / 0.4, cx = -w * 0.15 - u * w * 0.2, cy = by - h * 0.1 - Math.sin(u * Math.PI) * h * 0.32 + u * u * h * 0.2;
    g.save();
    g.translate(cx, cy);
    g.rotate(u * 9);
    g.fillStyle = C.white;
    g.strokeStyle = C.ink;
    g.lineWidth = 1.6;
    g.fillRect(-h * 0.05, -h * 0.02, h * 0.1, h * 0.04);
    g.strokeRect(-h * 0.05, -h * 0.02, h * 0.1, h * 0.04);
    g.restore();
  }
  drawSfx(g, p < 0.55 ? 'カッ' : 'コッ', -w * 0.28, -h * 0.3, h * 0.3, -0.12, { fill: C.ink, line: C.white, shadow: 1.5 });
}

function drawMuzzle(g, w, h, p, col, word) {
  g.fillStyle = C.ink;
  g.fillRect(-w / 2, -h / 2, w, h);
  g.fillStyle = C.white;
  radialLines(g, 0, h * 0.28, w * 0.1, h * 0.95, 40, w * 0.07, 3, 0.9);
  g.fill();
  const k = ease.outBack(clamp(p / 0.3, 0, 1)) * (1 - clamp((p - 0.55) / 0.45, 0, 1) * 0.6);
  g.beginPath();
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU, r = (i & 1 ? 0.34 : 1) * w * 0.62 * k * (0.8 + 0.4 * ((i * 53) % 7) / 7);
    g.lineTo(Math.cos(a) * r, h * 0.28 + Math.sin(a) * r * 1.35);
  }
  g.closePath();
  g.fillStyle = C.white;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = C.ink;
  g.stroke();
  g.beginPath();
  g.arc(0, h * 0.28, w * 0.2 * k, 0, TAU);
  g.fillStyle = col;
  g.fill();
  g.stroke();
  // the barrel coming up from the bottom of the panel
  g.fillStyle = C.ink;
  g.strokeStyle = C.white;
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(-w * 0.14, h * 0.5); g.lineTo(-w * 0.1, h * 0.36); g.lineTo(w * 0.1, h * 0.36); g.lineTo(w * 0.14, h * 0.5);
  g.closePath();
  g.stroke();
  g.fill();
  drawSfx(g, word, 0, -h * 0.2, w * 0.52, 0, { fill: C.white, line: C.ink, lineW: 4, vertical: true, shadow: 0 });
}

export class Panels {
  constructor() {
    this.eyes = 0;
    this.bolt = 0;
    this.mineT = 9;
    this.incT = 9;
    this.reload = 0;
    this.reloadMax = 1;
    this.t = 0;
  }

  fire(mine) { if (mine) this.mineT = 0; else this.incT = 0; }

  update(dt, focus, reload, reloadMax, live) {
    this.t += dt;
    this.eyes = damp(this.eyes, live && focus > 0.04 ? 1 : 0, 9, dt);
    this.bolt = damp(this.bolt, live && reload > 0.08 ? 1 : 0, 12, dt);
    this.reload = reload;
    this.reloadMax = reloadMax;
    this.mineT += dt;
    this.incT += dt;
    this.focus = focus;
  }

  draw(g, v, colMe, colFoe, touch) {
    const u = clamp(Math.min(v.W, v.H * 1.78) / 1280, 0.55, 1.2), top = Math.max(v.py + 34, touch ? 50 : 40);
    const lx = v.px + 14 * u, rx = v.px + v.pw - 14 * u;
    if (this.eyes > 0.01) {
      const w = 250 * u, h = 90 * u, k = ease.outBack(this.eyes);
      beginPanel(g, lx - (1 - k) * (w + 30), top, w, h, -0.025, C.paper);
      drawEyes(g, w, h, this.focus, colMe, this.t);
      endPanel(g, w, h, 3.2);
    }
    if (this.bolt > 0.01) {
      const w = 210 * u, h = 118 * u, k = ease.outBack(this.bolt);
      beginPanel(g, rx - w + (1 - k) * (w + 30), top, w, h, 0.02, C.paper);
      drawBolt(g, w, h, clamp(1 - this.reload / this.reloadMax, 0, 1), this.t);
      endPanel(g, w, h, 3.2);
    }
    if (this.mineT < 0.36) {
      const w = 86 * u, h = 236 * u, p = this.mineT / 0.36, k = p < 0.12 ? p / 0.12 : p > 0.8 ? 1 - (p - 0.8) / 0.2 : 1;
      beginPanel(g, lx - (1 - k) * (w + 30), top + 112 * u, w, h, 0.03, C.ink);
      drawMuzzle(g, w, h, p, colMe, 'ドン!');
      endPanel(g, w, h, 3.2);
    }
    if (this.incT < 0.34) {
      const w = 64 * u, h = 168 * u, p = this.incT / 0.34, k = p < 0.12 ? p / 0.12 : p > 0.8 ? 1 - (p - 0.8) / 0.2 : 1;
      beginPanel(g, rx - w + (1 - k) * (w + 30), top + 132 * u, w, h, -0.03, C.ink);
      drawMuzzle(g, w, h, p, colFoe, 'バン!');
      endPanel(g, w, h, 3);
    }
  }
}

// ---------------------------------------------------------------------------
// the kill: a full-bleed splash page
// ---------------------------------------------------------------------------
// s: t (seconds since the hit), sgn (+1 when the shooter stands left of the victim), wcol / lcol (identity colours),
//    word, seed, tones, touch (the thumbs' buttons sit at the right edge: compose with the shooter on the left).
// The top fifth of the page is kept calm: the core lays its kill banner there.
export function drawSplash(g, v, s) {
  const { px, py, pw, ph } = v, t = s.t;
  if (t < 0.09) return;
  const q = clamp((t - 0.09) / 0.2, 0, 1), pop = ease.outBack(q), sgn = s.touch ? 1 : s.sgn, aim = sgn > 0 ? 0.06 : Math.PI - 0.06;
  g.save();
  g.beginPath();
  g.rect(px, py, pw, ph);
  g.clip();
  const sh = t < 0.5 ? (0.5 - t) * Math.sin(t * 90) * 7 : 0;
  g.translate(sh, -sh * 0.6);
  g.fillStyle = C.paper;
  g.fillRect(px - 20, py - 20, pw + 40, ph + 40);
  const cx = px + pw * (0.5 + sgn * 0.04), cy = py + ph * 0.6, R = ph * 0.43;
  // tone at the page edges
  s.tones.use(g, 'd1', 1);
  g.fillRect(px, py, pw, ph);
  g.fillStyle = C.paper;
  g.beginPath(); g.ellipse(cx, cy, R * 1.7, R * 1.3, 0, 0, TAU); g.fill();
  // focus lines beyond the burst
  g.fillStyle = C.ink;
  radialLines(g, cx, cy, R * 0.95, R * 3.4, 90, R * 0.03, s.seed, 0.9, t * 0.04);
  g.fill();
  // the burst: black spikes, a white spotlight inside them, white speed lines over the black ring
  const spikes = (R0, ph0) => {
    g.beginPath();
    const n = 30;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + ph0, hsh = ((i * 2654435761 + s.seed) >>> 0) % 100 / 100, r = (i & 1 ? 0.55 : 1.0 + hsh * 0.24) * R0 * pop, sn = Math.sin(a);
      g.lineTo(cx + Math.cos(a) * r, cy + sn * r * (sn < 0 ? 0.6 : 0.95)); // shorter upward: the banner strip stays clear
    }
    g.closePath();
  };
  spikes(R * 0.8, 0);
  g.fillStyle = C.ink;
  g.fill();
  g.fillStyle = C.white;
  radialLines(g, cx, cy, R * 0.6, R * 0.88 * pop, 64, R * 0.03, s.seed + 3, 0.9, -t * 0.05);
  g.fill();
  spikes(R * 0.66, 0.06);
  g.fillStyle = C.paper;
  g.fill();
  g.strokeStyle = C.ink;
  g.lineWidth = 2;
  g.stroke();
  g.fillStyle = C.ink;
  radialLines(g, cx, cy, R * 0.36, R * 0.66 * pop, 40, R * 0.012, s.seed + 9, 0.9, t * 0.04);
  g.fill();

  // the shooter, far side, frozen: a small black figure with the muzzle still flaring
  const Sh = ph * 0.2 / 3.9, bx = sgn > 0 ? px + pw * 0.11 : px + pw * 0.89, by = py + ph * 0.7;
  const gy = by - 2.06 * SC * Sh, mx = bx + Math.cos(aim) * 3.4 * SC * Sh, my = gy + Math.sin(aim) * 3.4 * SC * Sh;
  // the bullet's last streak, from the muzzle to the chest
  if (q > 0) {
    const ex = mx + (cx - mx) * pop, ey = my + (cy - my) * pop;
    g.lineCap = 'round';
    g.strokeStyle = C.paper;
    g.lineWidth = 11;
    g.beginPath(); g.moveTo(mx, my); g.lineTo(ex, ey); g.stroke();
    g.strokeStyle = C.ink;
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(mx, my); g.lineTo(ex, ey); g.stroke();
  }
  drawSniper(g, { sx: bx, sy: by, S: Sh, f: sgn > 0 ? 1 : -1, a: aim, ph: 0, spd: 0, focus: 1, recoil: 1, stun: false, col: s.wcol, t, wind: 0, umb: true, sil: true, x: 0, z: 0 });
  if (t < 0.45) { // the muzzle flash
    const k = 1 - t / 0.45, Rf = Sh * (1.4 + 2.2 * k);
    g.save();
    g.translate(mx, my);
    g.rotate(aim);
    g.beginPath();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, r = (i & 1 ? 0.35 : 1) * Rf * (i % 4 === 0 ? 1.6 : 1); g.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.7); }
    g.closePath();
    g.fillStyle = C.white; g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 2.5; g.stroke();
    g.restore();
  }

  // the victim, hurled back from the point of impact
  const ease1 = ease.outCubic(clamp((t - 0.1) / 0.8, 0, 1)), vs = ph * 0.44 / 3.4, vx = cx + sgn * pw * 0.05 * ease1, vy = cy - ph * 0.03 * ease1;
  drawFlung(g, vx, vy, vs, sgn, s.lcol, 0.5 + 0.45 * ease1, t);
  // the umbrella, knocked clean off, tumbling away across the lower page (never up into the banner)
  const ut = Math.max(0, t - 0.1), us = vs * 0.55, ux = vx + sgn * (vs * 0.9 + ut * pw * 0.62), uy = vy - vs * 1.2 - ut * ph * 0.26 + ut * ut * ph * 1.0;
  if (uy < py + ph + us * 3) {
    g.save();
    g.translate(ux, uy);
    g.rotate(sgn * ut * 7);
    g.lineJoin = 'round';
    g.scale(us, us);
    drawUmbrella(g, s.lcol, 3 / us);
    g.restore();
    g.strokeStyle = C.ink; // its speed lines
    g.lineWidth = 2;
    g.beginPath();
    for (let i = -1; i <= 1; i++) { g.moveTo(ux - sgn * (us * 2 + i * 6), uy - i * us * 0.5); g.lineTo(ux - sgn * (us * 5 + i * 10 + ut * pw * 0.08), uy - i * us * 0.5 - ut * ph * 0.05); }
    g.stroke();
  }
  // the point of impact: a white star on the chest
  if (t < 0.5) {
    const k = 1 - t / 0.5, Ri = R * (0.12 + 0.3 * k * k);
    g.beginPath();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU + 0.2, r = (i & 1 ? 0.3 : 1) * Ri * (0.85 + 0.3 * (((i * 7) % 5) / 5)); g.lineTo(vx + Math.cos(a) * r, vy + Math.sin(a) * r); }
    g.closePath();
    g.fillStyle = C.white; g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 3; g.stroke();
  }
  // the one enormous sound effect, lettered across the lower page
  if (t > 0.16) {
    const k = ease.outBack(clamp((t - 0.16) / 0.2, 0, 1)), n = s.word.length, sz = Math.min(ph * 0.46, (pw * 0.8) / (n * 0.9)) * k;
    drawSfx(g, s.word, px + pw * 0.5 + sgn * pw * 0.05, py + ph * 0.77, sz, -0.1 * sgn, { w: sz * 0.125, fill: C.ink, line: C.white, lineW: sz * 0.1, shadow: sz * 0.04 });
  }
  if (t < 0.22) { g.fillStyle = `rgba(255,253,246,${1 - t / 0.22})`; g.fillRect(px, py, pw, ph); }
  g.restore();
}

// ---------------------------------------------------------------------------
// small in-world marks
// ---------------------------------------------------------------------------
// A dotted sight line with range ticks; (x0, y0) -> (x1, y1) in screen px.
export function drawSight(g, x0, y0, x1, y1, focus, len, steady) {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
  g.save();
  g.lineCap = 'round';
  g.strokeStyle = C.white;
  g.lineWidth = 4.2;
  g.setLineDash([0.1, 9]);
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  g.strokeStyle = C.ink;
  g.lineWidth = 2.3 + focus * 0.8;
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  g.setLineDash([]);
  g.restore();
  return l;
}

export function drawReticle(g, x, y, r, focus, ready, t, col) {
  g.save();
  g.translate(x, y);
  g.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) {
    g.strokeStyle = pass ? C.ink : C.white;
    g.lineWidth = pass ? 2 : 5;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.moveTo(-r * 1.6, 0); g.lineTo(-r * 0.55, 0);
    g.moveTo(r * 1.6, 0); g.lineTo(r * 0.55, 0);
    g.moveTo(0, -r * 1.6); g.lineTo(0, -r * 0.55);
    g.moveTo(0, r * 1.6); g.lineTo(0, r * 0.55);
    g.stroke();
  }
  g.fillStyle = ready ? col : C.paper;
  g.strokeStyle = C.ink;
  g.lineWidth = 1.5;
  g.beginPath(); g.arc(0, 0, 2.6 + focus * 1.2, 0, TAU); g.fill(); g.stroke();
  g.restore();
}

// Reload: a ring of ink that fills as the bolt cycles.
export function drawReload(g, x, y, r, f) {
  g.save();
  g.lineCap = 'butt';
  g.strokeStyle = C.white;
  g.lineWidth = 7;
  g.beginPath(); g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * f); g.stroke();
  g.strokeStyle = C.ink;
  g.lineWidth = 4;
  g.beginPath(); g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * f); g.stroke();
  g.restore();
}

// A caption box (the narration boxes of a manga page) with a tail pointing at (tx, ty).
export function drawCaption(g, x, y, lines, size, tx, ty, t, x0 = 6, x1 = 1e5) {
  g.save();
  g.font = `700 ${size}px ${FONT}`;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  let w = 0;
  for (const l of lines) w = Math.max(w, g.measureText(l).width);
  const pad = size * 0.7, h = lines.length * size * 1.25 + pad * 1.1, bw = w + pad * 2, bob = Math.sin(t * 3) * 1.6;
  x = clamp(x - bw / 2, x0, Math.max(x0, x1 - bw));
  y -= h + bob;
  g.fillStyle = C.ink;
  g.fillRect(x + 4, y + 4, bw, h);
  g.fillStyle = C.paper;
  g.fillRect(x, y, bw, h);
  g.strokeStyle = C.ink;
  g.lineWidth = 2.4;
  g.lineJoin = 'miter';
  g.strokeRect(x, y, bw, h);
  // tail
  const bx = clamp(tx, x + 14, x + bw - 14);
  g.beginPath();
  g.moveTo(bx - 8, y + h); g.lineTo(tx, ty); g.lineTo(bx + 8, y + h);
  g.closePath();
  g.fillStyle = C.paper;
  g.fill();
  g.stroke();
  g.fillStyle = C.paper;
  g.fillRect(bx - 7, y + h - 2, 14, 4);
  g.fillStyle = C.ink;
  for (let i = 0; i < lines.length; i++) {
    g.font = `${i ? 600 : 800} ${i ? size * 0.82 : size}px ${FONT}`;
    g.fillText(lines[i], x + pad, y + pad * 0.62 + (i + 0.5) * size * 1.25 + (i ? 2 : 0));
  }
  g.restore();
}

// An arrow on the edge of the panel pointing at an off-screen sniper, with the range in metres.
export function drawPointer(g, v, x, y, col, label) {
  const m = 26, cx = clamp(x, v.px + m, v.px + v.pw - m), cy = clamp(y, v.py + 64, v.py + v.ph - 64), a = Math.atan2(y - cy, x - cx);
  g.save();
  g.translate(cx, cy);
  g.rotate(a);
  g.beginPath();
  g.moveTo(14, 0); g.lineTo(-8, -11); g.lineTo(-3, 0); g.lineTo(-8, 11);
  g.closePath();
  g.fillStyle = col;
  g.strokeStyle = C.ink;
  g.lineWidth = 3;
  g.lineJoin = 'round';
  g.stroke();
  g.fill();
  g.restore();
  g.font = `800 12px ${FONT}`;
  g.textAlign = cx < v.px + v.pw / 2 ? 'left' : 'right';
  g.textBaseline = 'middle';
  g.lineWidth = 4;
  g.strokeStyle = C.paper;
  g.fillStyle = C.ink;
  const tx = cx + (cx < v.px + v.pw / 2 ? 22 : -22);
  g.strokeText(label, tx, cy);
  g.fillText(label, tx, cy);
}
