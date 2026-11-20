// LIFE FLASH — the memories. Sixteen small cut-paper vignettes, each a pure function
//   scene(g, W, H, u, tt, m)
// painting the box (0, 0, W, H): u is 0 → 1 through the memory's time on screen (its one
// piece of action plays out over it, however short the slot), tt is seconds (loops and
// wobbles), m is who it is about: { col, skin, hair, cool, age, n, other, world }.
// The hero is always the figure in the identity colour with the bobble hat.
import { lerp, clamp01, seg, ease, TAU, mixHex, shade, rgba, roundRect, luminance } from '../../kit.js';

export const INK = '#2a1b17';
const CREAM = '#f5e6c8', TERRA = '#c8553d', MUSTARD = '#e0a63a', SAGE = '#93a87e', TEAL = '#2f6f77', NAVY = '#2b3a55';
const PEACH = '#f2c79b', PINK = '#e39a86', BRICK = '#a8483a', WOOD = '#8c5e3f', OLIVE = '#6f8a4f', GRASS = '#8fae5d', NIGHT = '#1c2748';
const SKINS = ['#f1c9a2', '#d9a273', '#a9714b', '#7a4d33', '#f6d7b8'];
const HAIRS = ['#3a2a22', '#6b4226', '#b5793a', '#1f1a1c', '#8e8a86', '#c0432f'];

/** Integer hash → [0, 1): cosmetic scatter that is identical on every machine. */
export const hash = (n) => {
  let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

// ---- primitives -------------------------------------------------------------------------
function circ(g, x, y, r, c) { g.beginPath(); g.arc(x, y, Math.max(0, r), 0, TAU); g.fillStyle = c; g.fill(); }
function ell(g, x, y, rx, ry, c, rot = 0) { g.beginPath(); g.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot, 0, TAU); g.fillStyle = c; g.fill(); }
function box(g, x, y, w, h, c, r = 0) {
  g.fillStyle = c;
  if (r > 0) { roundRect(g, x, y, w, h, r); g.fill(); } else g.fillRect(x, y, w, h);
}
function limb(g, x1, y1, x2, y2, w, c) {
  g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
}
function poly(g, pts, c) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  g.fillStyle = c;
  g.fill();
}
function ring(g, x, y, r, w, c) { g.beginPath(); g.arc(x, y, Math.max(0, r), 0, TAU); g.strokeStyle = c; g.lineWidth = w; g.stroke(); }
function star(g, x, y, r, c, n = 4, rot = 0, inner = 0.28) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n, rr = i & 1 ? r * inner : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fillStyle = c;
  g.fill();
}

// ---- the cut-paper person ------------------------------------------------------------------
// Feet at (x, y), `s` tall. o: col, skin, hair, hairStyle (0 short, 1 bob, 2 bun, 3 none),
// kid (0 adult .. 1 toddler), face (-1 / 0 / 1), armL / armR (0 hangs, PI/2 straight out,
// PI straight up), step (walk phase), lean, hat, mouth, blink, dress, noLegs, look.
// Returns the hands and head so props can be attached.
export function person(g, x, y, s, o = {}) {
  const kid = o.kid || 0;
  const hr = s * lerp(0.105, 0.175, kid);
  const leg = s * lerp(0.43, 0.25, kid);
  const bw = s * lerp(0.21, 0.3, kid);
  const lw = s * lerp(0.075, 0.105, kid);
  const col = o.col || TERRA, skin = o.skin || SKINS[0], legs = o.legs || '#3b3550';
  const face = o.face || 0;
  const sx = x + (o.lean || 0) * s;
  const top = y - s + hr * 1.85, hip = y - leg;
  const st = o.step === undefined ? 0 : Math.sin(o.step) * s * 0.1;
  if (!o.noLegs) {
    const lx = bw * 0.24;
    limb(g, x - lx, hip, x - lx - st, y - lw * 0.45, lw, legs);
    limb(g, x + lx, hip, x + lx + st, y - lw * 0.45, lw, legs);
    ell(g, x - lx - st + face * lw * 0.35, y - lw * 0.32, lw * 0.8, lw * 0.46, INK);
    ell(g, x + lx + st + face * lw * 0.35, y - lw * 0.32, lw * 0.8, lw * 0.46, INK);
  }
  const al = s * lerp(0.3, 0.25, kid), sh = top + lw * 0.55;
  const hands = [];
  const arm = (side, a, front) => {
    const dir = face || side;
    const ox = sx + side * bw * 0.4;
    const hx = ox + Math.sin(a) * al * dir, hy = sh + Math.cos(a) * al;
    limb(g, ox, sh, hx, hy, lw * 0.82, front ? col : shade(col, -0.14));
    circ(g, hx, hy, lw * 0.5, skin);
    hands[side < 0 ? 0 : 1] = { x: hx, y: hy };
  };
  const aL = o.armL === undefined ? 0.16 : o.armL, aR = o.armR === undefined ? 0.16 : o.armR;
  const backSide = face < 0 ? 1 : -1;
  arm(backSide, backSide < 0 ? aL : aR, false);
  // body: a soft trapezoid; a dress flares past the hips
  const r = lw * 0.5;
  const bot = o.dress ? hip + leg * 0.5 : hip + lw * 0.2, bwB = o.dress ? bw * 0.78 : bw * 0.44;
  g.beginPath();
  g.moveTo(sx - bw * 0.42, top + r);
  g.lineTo(sx + bw * 0.42, top + r);
  g.lineTo(x + bwB, bot);
  g.lineTo(x - bwB, bot);
  g.closePath();
  g.fillStyle = col;
  g.strokeStyle = col;
  g.lineWidth = r * 2;
  g.lineJoin = 'round';
  g.fill();
  g.stroke();
  if (o.sash) limb(g, sx - bw * 0.36, top + r, x + bwB * 0.7, bot - r, lw * 0.5, o.sash);
  arm(-backSide, backSide < 0 ? aR : aL, true);
  // head
  const hx = sx + face * hr * 0.18, hy = top - hr * 0.72;
  const hair = o.hair || HAIRS[0], hs = o.hairStyle || 0;
  if (hs === 1) box(g, hx - hr * 1.08, hy - hr * 0.5, hr * 2.16, hr * 1.55, hair, hr * 0.5);
  if (hs === 2) circ(g, hx - face * hr * 0.5, hy - hr * 1.15, hr * 0.45, hair);
  if (hs !== 3) circ(g, hx - face * hr * 0.12, hy - hr * 0.16, hr * 1.04, hair);
  circ(g, hx, hy, hr, skin);
  if (hs !== 3 && !o.hat) { g.beginPath(); g.arc(hx, hy, hr * 1.01, Math.PI * 1.08 - face * 0.25, Math.PI * 1.92 - face * 0.25); g.closePath(); g.fillStyle = hair; g.fill(); }
  // face
  const ex = hx + (face * 0.3 + (o.look || 0) * 0.2) * hr, ey = hy + hr * 0.05, er = hr * 0.115;
  if (o.blink) {
    limb(g, ex - hr * 0.5, ey, ex - hr * 0.24, ey, er * 0.9, INK);
    limb(g, ex + hr * 0.24, ey, ex + hr * 0.5, ey, er * 0.9, INK);
  } else {
    circ(g, ex - hr * 0.37, ey, er, INK);
    circ(g, ex + hr * 0.37, ey, er, INK);
  }
  circ(g, ex - hr * 0.6, ey + hr * 0.32, hr * 0.2, 'rgba(226,96,72,0.3)');
  circ(g, ex + hr * 0.6, ey + hr * 0.32, hr * 0.2, 'rgba(226,96,72,0.3)');
  const my = hy + hr * 0.48;
  g.strokeStyle = INK; g.lineWidth = er * 0.9; g.lineCap = 'round';
  if (o.mouth === 'o') circ(g, ex, my, hr * 0.16, INK);
  else if (o.mouth === 'flat') limb(g, ex - hr * 0.2, my, ex + hr * 0.2, my, er * 0.9, INK);
  else if (o.mouth === 'grin') { g.beginPath(); g.arc(ex, my - hr * 0.1, hr * 0.32, 0.1, Math.PI - 0.1); g.closePath(); g.fillStyle = INK; g.fill(); }
  else { g.beginPath(); g.arc(ex, my - hr * 0.16, hr * 0.3, 0.35, Math.PI - 0.35); g.stroke(); }
  // hats
  const hat = o.hat, hc = o.hatCol || shade(col, -0.18);
  if (hat === 'beanie' || hat === 'bonnet') {
    g.beginPath(); g.arc(hx, hy - hr * 0.08, hr * 1.1, Math.PI * 1.02, Math.PI * 1.98); g.closePath(); g.fillStyle = hc; g.fill();
    box(g, hx - hr * 1.14, hy - hr * 0.36, hr * 2.28, hr * 0.34, shade(hc, 0.2), hr * 0.16);
    circ(g, hx, hy - hr * 1.22, hr * 0.3, CREAM);
  } else if (hat === 'party') {
    poly(g, [hx - hr * 0.62, hy - hr * 0.72, hx + hr * 0.62, hy - hr * 0.72, hx + hr * 0.1, hy - hr * 2.1], o.hatCol || MUSTARD);
    limb(g, hx - hr * 0.36, hy - hr * 1.12, hx + hr * 0.42, hy - hr * 1.2, hr * 0.12, CREAM);
    circ(g, hx + hr * 0.1, hy - hr * 2.1, hr * 0.2, TERRA);
  } else if (hat === 'grad') {
    box(g, hx - hr * 0.7, hy - hr * 1.12, hr * 1.4, hr * 0.5, o.hatCol || INK);
    poly(g, [hx - hr * 1.35, hy - hr * 1.18, hx, hy - hr * 1.55, hx + hr * 1.35, hy - hr * 1.18, hx, hy - hr * 0.86], o.hatCol || INK);
  } else if (hat === 'veil') {
    g.beginPath(); g.arc(hx, hy - hr * 0.1, hr * 1.12, Math.PI, TAU); g.lineTo(hx + hr * 1.5 * (face || 1) * -1, hy + hr * 2.6); g.lineTo(hx - hr * 0.2 * (face || 1), hy - hr * 0.2); g.closePath();
    g.fillStyle = 'rgba(255,250,240,0.78)'; g.fill();
  } else if (hat === 'crown') {
    poly(g, [hx - hr * 0.8, hy - hr * 0.7, hx - hr * 0.8, hy - hr * 1.5, hx - hr * 0.4, hy - hr * 1.1, hx, hy - hr * 1.6, hx + hr * 0.4, hy - hr * 1.1, hx + hr * 0.8, hy - hr * 1.5, hx + hr * 0.8, hy - hr * 0.7], MUSTARD);
  }
  return { hands, hx, hy, hr, bw, lw, top, hip };
}
const hero = (m, extra) => ({ col: m.col, skin: m.skin, hair: m.hair, hat: 'beanie', ...extra });
const extraPerson = (i, extra) => ({ skin: SKINS[(i * 3 + 1) % SKINS.length], hair: HAIRS[(i * 5 + 2) % HAIRS.length], hairStyle: i % 3, ...extra });

// ---- set dressing -----------------------------------------------------------------------------
function sky(g, W, H, top, bot, to = 0.75) {
  const gr = g.createLinearGradient(0, 0, 0, H * to);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bot);
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
}
function hills(g, W, H, y, amp, c, ph) {
  g.beginPath();
  g.moveTo(0, H);
  for (let i = 0; i <= 28; i++) g.lineTo((W * i) / 28, y - amp * (0.5 + 0.35 * Math.sin(i * 0.42 + ph) + 0.15 * Math.sin(i * 1.1 + ph * 2.3)));
  g.lineTo(W, H);
  g.closePath();
  g.fillStyle = c;
  g.fill();
}
function tree(g, x, y, s, c, trunk = '#6b4630') {
  box(g, x - s * 0.05, y - s * 0.5, s * 0.1, s * 0.5, trunk);
  circ(g, x, y - s * 0.7, s * 0.3, c);
  circ(g, x - s * 0.18, y - s * 0.55, s * 0.2, c);
  circ(g, x + s * 0.18, y - s * 0.57, s * 0.22, c);
  circ(g, x - s * 0.08, y - s * 0.78, s * 0.13, shade(c, 0.14));
}
function room(g, W, H, wall, floor, fy = 0.72, stripes = true) {
  box(g, 0, 0, W, H * fy, wall);
  if (stripes) {
    g.fillStyle = shade(wall, 0.09);
    const n = Math.max(6, Math.round((W / H) * 9));
    for (let i = 0; i < n; i++) g.fillRect(((i + 0.25) * W) / n, 0, (W / n) * 0.34, H * fy);
  }
  box(g, 0, H * fy, W, H * (1 - fy), floor);
  box(g, 0, H * fy - H * 0.022, W, H * 0.03, CREAM);
  g.fillStyle = shade(floor, -0.12);
  for (let i = 1; i < 4; i++) g.fillRect(0, H * (fy + ((1 - fy) * i) / 4), W, H * 0.006);
}
function bunting(g, x0, y0, x1, y1, sag, n, cols, sz) {
  g.strokeStyle = INK; g.lineWidth = sz * 0.1;
  g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag * 2, x1, y1); g.stroke();
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n, x = lerp(x0, x1, k), y = lerp(y0, y1, k) + sag * 4 * k * (1 - k);
    poly(g, [x - sz * 0.5, y, x + sz * 0.5, y, x, y + sz], cols[i % cols.length]);
  }
}
function confetti(g, W, H, k, n, cols, seed) {
  if (k <= 0) return;
  for (let i = 0; i < n; i++) {
    const a = hash(seed + i * 3), b = hash(seed + i * 3 + 1), c = hash(seed + i * 3 + 2);
    const y = (k * (0.7 + 0.8 * b) - 0.25 * c) * H * 1.15;
    if (y < 0 || y > H) continue;
    const x = a * W + Math.sin(k * 9 + i) * H * 0.02, s = H * (0.012 + 0.012 * c);
    g.save();
    g.translate(x, y);
    g.rotate(k * 12 * (b - 0.5) + i);
    g.fillStyle = cols[i % cols.length];
    g.fillRect(-s, -s * 0.5, s * 2, s);
    g.restore();
  }
}
function sun(g, x, y, r, c) {
  circ(g, x, y, r * 1.7, rgba(c, 0.18));
  circ(g, x, y, r * 1.3, rgba(c, 0.25));
  circ(g, x, y, r, c);
}
const PARTY = [TERRA, MUSTARD, TEAL, CREAM, PINK];
const wallFor = (m) => (m.cool ? '#dc9f4b' : '#6f9d97');
const skyFor = (m) => (m.cool ? ['#f4c58d', '#f8e6c2'] : ['#a9d3cf', '#f3ead0']);

// ---- 1 · first steps ---------------------------------------------------------------------------
function steps(g, W, H, u, tt, m) {
  const U = H;
  room(g, W, H, wallFor(m), '#9a6a45', 0.68);
  box(g, W * 0.5 - U * 0.5, H * 0.14, U * 0.26, U * 0.2, CREAM, U * 0.012);
  box(g, W * 0.5 - U * 0.48, H * 0.16, U * 0.22, U * 0.16, '#a9c7c0');
  circ(g, W * 0.5 - U * 0.4, H * 0.22, U * 0.03, MUSTARD);
  box(g, W * 0.5 - U * 0.48, H * 0.27, U * 0.22, U * 0.05, OLIVE);
  // armchair and lamp
  box(g, W * 0.5 - U * 0.72, H * 0.4, U * 0.3, U * 0.34, BRICK, U * 0.06);
  box(g, W * 0.5 - U * 0.76, H * 0.52, U * 0.4, U * 0.22, TERRA, U * 0.05);
  box(g, W * 0.5 - U * 0.7, H * 0.5, U * 0.26, U * 0.1, shade(TERRA, 0.15), U * 0.04);
  ell(g, W * 0.5, H * 0.87, U * 0.62, U * 0.1, '#b9483a');
  ell(g, W * 0.5, H * 0.87, U * 0.52, U * 0.075, '#e6c79a');
  ell(g, W * 0.5, H * 0.87, U * 0.44, U * 0.06, '#b9483a');
  // blocks
  box(g, W * 0.5 - U * 0.46, H * 0.83, U * 0.07, U * 0.07, TEAL, U * 0.008);
  box(g, W * 0.5 - U * 0.4, H * 0.86, U * 0.07, U * 0.07, MUSTARD, U * 0.008);
  box(g, W * 0.5 - U * 0.44, H * 0.765, U * 0.065, U * 0.065, CREAM, U * 0.008);
  // a parent, kneeling at the edge of the frame with open arms
  person(g, W * 0.5 + U * 0.5, H * 1.2, U * 0.92, extraPerson(1, { col: CREAM, face: -1, armL: 1.25 + Math.sin(tt * 5) * 0.08, armR: 1.0 + Math.sin(tt * 5) * 0.08, mouth: 'grin', noLegs: true }));
  const k = ease.inOutSine(u);
  const x = W * 0.5 + lerp(-U * 0.24, U * 0.2, k), wob = Math.sin(tt * 8);
  person(g, x, H * 0.9 - Math.abs(Math.sin(tt * 9)) * U * 0.012, U * 0.34, hero(m, { kid: 1, hat: 'bonnet', face: 1, armL: 1.9 + wob * 0.25, armR: 1.6 - wob * 0.25, step: tt * 9, lean: wob * 0.05, mouth: 'o' }));
}

// ---- 2 · the birthday --------------------------------------------------------------------------
function cake(g, W, H, u, tt, m) {
  const U = H, cx = W * 0.5;
  room(g, W, H, wallFor(m), WOOD, 0.8);
  bunting(g, -W * 0.05, H * 0.06, W * 1.05, H * 0.04, H * 0.05, Math.round(W / H * 9), PARTY, U * 0.07);
  for (let i = 0; i < 3; i++) {
    const bx = cx + [-0.62, 0.58, 0.74][i] * U, by = H * [0.3, 0.24, 0.38][i] + Math.sin(tt * 2 + i * 2) * U * 0.012;
    limb(g, bx, by + U * 0.1, bx + U * 0.02, H * 0.8, U * 0.004, INK);
    ell(g, bx, by, U * 0.075, U * 0.095, [TERRA, TEAL, MUSTARD][i]);
    ell(g, bx - U * 0.025, by - U * 0.035, U * 0.018, U * 0.028, 'rgba(255,255,255,0.4)', -0.5);
  }
  const blow = seg(u, 0.5, 0.62), out = u >= 0.62;
  const clap = Math.sin(tt * 16) * 0.2;
  person(g, cx - U * 0.42, H * 0.98, U * 0.6, extraPerson(2, { col: TEAL, kid: 0.5, hat: 'party', hatCol: PINK, armL: 2.1 + (out ? clap : 0), armR: 2.1 - (out ? clap : 0), mouth: 'grin', noLegs: true }));
  person(g, cx + U * 0.42, H * 0.98, U * 0.64, extraPerson(4, { col: BRICK, kid: 0.5, hat: 'party', hatCol: TEAL, armL: 2.1 - (out ? clap : 0), armR: 2.1 + (out ? clap : 0), mouth: 'grin', noLegs: true }));
  person(g, cx, H * 0.96, U * 0.66, hero(m, { kid: 0.6, hat: 'party', hatCol: m.cool ? TERRA : MUSTARD, armL: 0.5, armR: 0.5, mouth: blow > 0 && !out ? 'o' : 'grin', lean: blow * (1 - seg(u, 0.62, 0.7)) * 0.03, noLegs: true }));
  // table and cake
  box(g, 0, H * 0.78, W, H * 0.22, CREAM);
  g.fillStyle = rgba(TERRA, 0.55);
  for (let i = 0; i * U * 0.09 < W; i++) g.fillRect(i * U * 0.09, H * 0.78, U * 0.045, H * 0.22);
  for (let i = 0; i * U * 0.09 < W + U; i++) circ(g, i * U * 0.09, H * 0.78, U * 0.045, CREAM);
  ell(g, cx, H * 0.86, U * 0.3, U * 0.04, '#d9cdb4');
  box(g, cx - U * 0.24, H * 0.66, U * 0.48, U * 0.2, PINK, U * 0.02);
  box(g, cx - U * 0.25, H * 0.64, U * 0.5, U * 0.07, CREAM, U * 0.035);
  for (let i = 0; i < 7; i++) circ(g, cx - U * 0.21 + i * U * 0.07, H * 0.7 + (i % 2) * U * 0.012, U * 0.024, CREAM);
  for (let i = 0; i < 6; i++) circ(g, cx - U * 0.19 + i * U * 0.076, H * 0.8, U * 0.014, TERRA);
  const n = Math.max(1, Math.min(7, m.age));
  for (let i = 0; i < n; i++) {
    const x = cx + (i - (n - 1) / 2) * U * 0.062, y = H * 0.64;
    box(g, x - U * 0.008, y - U * 0.085, U * 0.016, U * 0.09, i % 2 ? TEAL : MUSTARD);
    if (!out) {
      const f = 1 - blow * 0.6, bend = blow * U * 0.03 + Math.sin(tt * 21 + i * 2) * U * 0.003;
      ell(g, x + bend, y - U * 0.115, U * 0.016 * f, U * 0.032 * f, '#f08a2c', bend * 8 / U);
      ell(g, x + bend, y - U * 0.108, U * 0.008 * f, U * 0.016 * f, '#ffe9a0', bend * 8 / U);
      circ(g, x, y - U * 0.11, U * 0.05, 'rgba(255,214,120,0.16)');
    } else {
      const s = seg(u, 0.62, 0.95);
      circ(g, x + Math.sin(s * 5 + i) * U * 0.012, y - U * 0.1 - s * U * 0.12, U * (0.012 + s * 0.02), `rgba(240,236,228,${0.55 * (1 - s)})`);
    }
  }
  confetti(g, W, H, seg(u, 0.62, 1.15), 46, PARTY, 100 + m.n);
}

// ---- 3 · the bike -------------------------------------------------------------------------------
function bike(g, W, H, u, tt, m) {
  const U = H, sk = skyFor(m);
  sky(g, W, H, sk[0], sk[1]);
  sun(g, W * 0.8, H * 0.2, U * 0.07, '#fff3c9');
  hills(g, W, H, H * 0.6, U * 0.14, SAGE, 0.4 + u * 0.3);
  hills(g, W, H, H * 0.66, U * 0.08, OLIVE, 2.2 + u * 0.6);
  const sc = u * U * 0.9;
  for (let i = -1; i < 7; i++) {
    const x = ((i * U * 0.46 - sc) % (U * 3.22) + U * 3.22) % (U * 3.22) - U * 0.4;
    tree(g, x, H * 0.74, U * (0.34 + 0.08 * hash(i + 4)), i % 2 ? '#5f8f55' : '#7fa14d');
  }
  box(g, 0, H * 0.72, W, H * 0.05, '#cdbb97');
  box(g, 0, H * 0.76, W, H * 0.24, '#6f5d58');
  g.fillStyle = CREAM;
  for (let i = -1; i * U * 0.3 < W + U; i++) g.fillRect(i * U * 0.3 - ((sc * 2) % (U * 0.3)), H * 0.87, U * 0.15, H * 0.014);
  const k = ease.inOutSine(u);
  const bx = W * 0.5 + lerp(-U * 0.12, U * 0.2, k), by = H * 0.93, wr = U * 0.095;
  // the parent, letting go, then cheering
  const let_ = seg(u, 0.3, 0.6);
  const px = bx - U * (0.3 + 0.32 * ease.outCubic(let_));
  person(g, px, H * 0.92, U * 0.62, extraPerson(3, { col: m.cool ? BRICK : TEAL, face: 1, armL: lerp(1.4, 2.9, let_) + Math.sin(tt * 12) * 0.12 * let_, armR: lerp(1.3, 2.7, let_), step: tt * 11 * (1 - let_), mouth: let_ > 0.5 ? 'grin' : 'o' }));
  g.save();
  g.translate(bx, by);
  g.rotate(Math.sin(tt * 6.5) * 0.07 * (1 - 0.6 * k));
  for (const s of [-1, 1]) {
    ring(g, s * wr * 1.4, -wr, wr, U * 0.017, INK);
    for (let j = 0; j < 4; j++) { const a = tt * 9 + (j * Math.PI) / 4; limb(g, s * wr * 1.4 - Math.cos(a) * wr, -wr - Math.sin(a) * wr, s * wr * 1.4 + Math.cos(a) * wr, -wr + Math.sin(a) * wr, U * 0.004, rgba(INK, 0.6)); }
    circ(g, s * wr * 1.4, -wr, U * 0.012, CREAM);
  }
  const fc = m.cool ? TERRA : TEAL;
  limb(g, -wr * 1.4, -wr, -wr * 0.5, -wr * 2.25, U * 0.018, fc);
  limb(g, -wr * 0.5, -wr * 2.25, wr * 0.95, -wr * 2.3, U * 0.018, fc);
  limb(g, -wr * 0.5, -wr * 2.25, 0, -wr, U * 0.018, fc);
  limb(g, 0, -wr, wr * 0.95, -wr * 2.3, U * 0.018, fc);
  limb(g, wr * 1.4, -wr, wr * 0.85, -wr * 2.75, U * 0.018, fc);
  limb(g, wr * 0.6, -wr * 2.8, wr * 1.1, -wr * 2.72, U * 0.02, INK);
  limb(g, -wr * 0.75, -wr * 2.4, -wr * 0.25, -wr * 2.4, U * 0.026, INK);
  const pa = tt * 9;
  for (const s of [1, -1]) {
    const px2 = Math.cos(pa + (s > 0 ? 0 : Math.PI)) * wr * 0.42, py2 = -wr + Math.sin(pa + (s > 0 ? 0 : Math.PI)) * wr * 0.42;
    limb(g, -wr * 0.45, -wr * 2.5, px2, py2, U * 0.034, s > 0 ? '#3b3550' : '#2c2740');
    ell(g, px2 + U * 0.01, py2, U * 0.024, U * 0.013, INK);
  }
  g.strokeStyle = m.col; g.lineWidth = U * 0.085; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-wr * 0.45, -wr * 2.75); g.lineTo(wr * 0.05, -wr * 3.75); g.stroke();
  limb(g, wr * 0.1, -wr * 3.7, wr * 0.9, -wr * 2.85, U * 0.03, shade(m.col, -0.14));
  circ(g, wr * 0.9, -wr * 2.85, U * 0.018, m.skin);
  const hx = wr * 0.3, hy = -wr * 4.45, hr = U * 0.062;
  circ(g, hx, hy, hr, m.skin);
  g.beginPath(); g.arc(hx, hy - hr * 0.08, hr * 1.1, Math.PI * 1.02, Math.PI * 1.98); g.closePath(); g.fillStyle = shade(m.col, -0.18); g.fill();
  box(g, hx - hr * 1.14, hy - hr * 0.36, hr * 2.28, hr * 0.34, shade(m.col, 0.05), hr * 0.16);
  circ(g, hx, hy - hr * 1.22, hr * 0.3, CREAM);
  circ(g, hx + hr * 0.25, hy + hr * 0.1, hr * 0.115, INK);
  circ(g, hx + hr * 0.75, hy + hr * 0.1, hr * 0.115, INK);
  circ(g, hx + hr * 0.5, hy + hr * 0.52, hr * (0.12 + 0.08 * k), INK);
  g.restore();
}

// ---- 4 · first day of school -------------------------------------------------------------------
function school(g, W, H, u, tt, m) {
  const U = H, cx = W * 0.5, sk = skyFor(m);
  sky(g, W, H, sk[0], sk[1]);
  box(g, 0, H * 0.72, W, H * 0.28, GRASS);
  tree(g, cx - U * 0.72, H * 0.78, U * 0.62, '#d98a3a');
  tree(g, cx + U * 0.78, H * 0.76, U * 0.5, '#c8553d');
  box(g, cx - U * 0.52, H * 0.26, U * 1.04, H * 0.48, BRICK);
  poly(g, [cx - U * 0.58, H * 0.27, cx + U * 0.58, H * 0.27, cx + U * 0.46, H * 0.17, cx - U * 0.46, H * 0.17], '#5a3a34');
  box(g, cx - U * 0.09, H * 0.04, U * 0.18, H * 0.2, BRICK);
  poly(g, [cx - U * 0.13, H * 0.05, cx + U * 0.13, H * 0.05, cx, -H * 0.06], '#5a3a34');
  circ(g, cx, H * 0.12, U * 0.055, CREAM);
  limb(g, cx, H * 0.12, cx, H * 0.085, U * 0.007, INK);
  limb(g, cx, H * 0.12, cx + U * 0.025, H * 0.13, U * 0.007, INK);
  for (let i = 0; i < 4; i++) {
    const x = cx + [-0.4, -0.22, 0.22, 0.4][i] * U - U * 0.06;
    box(g, x, H * 0.33, U * 0.12, H * 0.16, '#f4e3b6', U * 0.01);
    box(g, x + U * 0.055, H * 0.33, U * 0.01, H * 0.16, BRICK);
    box(g, x, H * 0.405, U * 0.12, U * 0.01, BRICK);
    if (i === 0 || i === 3) box(g, x, H * 0.56, U * 0.12, H * 0.12, '#f4e3b6', U * 0.01);
  }
  box(g, cx - U * 0.1, H * 0.44, U * 0.2, H * 0.3, TEAL, U * 0.1);
  box(g, cx - U * 0.1, H * 0.58, U * 0.2, H * 0.16, TEAL);
  box(g, cx - U * 0.006, H * 0.45, U * 0.012, H * 0.29, shade(TEAL, -0.25));
  box(g, cx - U * 0.17, H * 0.345, U * 0.34, H * 0.065, CREAM, U * 0.01);
  g.fillStyle = INK; g.font = `700 ${U * 0.046}px 'Rajdhani', 'Futura', sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('S C H O O L', cx, H * 0.38);
  poly(g, [cx - U * 0.12, H * 0.74, cx + U * 0.12, H * 0.74, cx + U * 0.42, H, cx - U * 0.42, H], '#e9d5a8');
  // classmates heading in
  for (let i = 0; i < 3; i++) {
    const x = cx + [-0.3, 0.26, 0.4][i] * U * (1 - u * 0.45);
    person(g, x, H * (0.8 - 0.02 * i), U * 0.17, extraPerson(i + 2, { col: [MUSTARD, TEAL, PINK][i], kid: 0.7, step: tt * 9 + i, face: i ? -1 : 1 }));
  }
  for (let i = 0; i < 9; i++) {
    const a = hash(i * 7 + m.n), y = ((a + tt * 0.22 * (0.6 + hash(i))) % 1) * H;
    ell(g, a * W * 1.3 % W + Math.sin(tt * 2 + i) * U * 0.03, y, U * 0.02, U * 0.011, i % 2 ? '#d98a3a' : TERRA, tt * 2 + i);
  }
  // the hero and the bag that is bigger than they are
  const hx = cx - U * 0.02, hy = H * 0.99, s = U * 0.5;
  box(g, hx - s * 0.26, hy - s * 0.74, s * 0.52, s * 0.46, m.cool ? TERRA : TEAL, s * 0.09);
  box(g, hx - s * 0.17, hy - s * 0.46, s * 0.34, s * 0.14, shade(m.cool ? TERRA : TEAL, -0.18), s * 0.03);
  const wave = seg(u, 0.12, 0.3);
  const p = person(g, hx, hy, s, hero(m, { kid: 0.75, armR: lerp(0.2, 2.5, ease.outBack(wave)) + Math.sin(tt * 10) * 0.3 * wave, armL: 0.25, mouth: 'grin' }));
  limb(g, hx - p.bw * 0.3, p.top + p.lw * 0.3, hx - p.bw * 0.34, p.hip - p.lw, p.lw * 0.3, CREAM);
  limb(g, hx + p.bw * 0.3, p.top + p.lw * 0.3, hx + p.bw * 0.34, p.hip - p.lw, p.lw * 0.3, CREAM);
}

// ---- 5 · hide and seek ---------------------------------------------------------------------------
function hide(g, W, H, u, tt, m) {
  const U = H, cx = W * 0.5, sk = skyFor(m);
  sky(g, W, H, sk[0], sk[1]);
  for (let i = 0; i * U * 0.2 < W + U; i++) circ(g, i * U * 0.2, H * 0.56 + (i % 2) * U * 0.02, U * 0.15, '#5b7d49');
  box(g, 0, H * 0.56, W, H * 0.2, '#5b7d49');
  box(g, 0, H * 0.7, W, H * 0.3, GRASS);
  for (let i = 0; i < 14; i++) circ(g, hash(i * 3) * W, H * (0.76 + 0.22 * hash(i * 3 + 1)), U * 0.011, i % 3 ? CREAM : PINK);
  // the seeker, counting against the tree
  box(g, cx - U * 0.62, H * 0.2, U * 0.12, H * 0.66, '#6b4630');
  circ(g, cx - U * 0.56, H * 0.14, U * 0.3, '#6f9a52');
  circ(g, cx - U * 0.78, H * 0.24, U * 0.2, '#6f9a52');
  circ(g, cx - U * 0.36, H * 0.22, U * 0.2, '#7fa95c');
  person(g, cx - U * 0.4, H * 0.9, U * 0.46, extraPerson(1, { col: m.cool ? MUSTARD : PINK, kid: 0.6, face: -1, armL: 2.35, armR: 2.2, hairStyle: 2 }));
  g.font = `${U * 0.07}px 'Marker Felt', 'Bradley Hand', 'Comic Sans MS', cursive`; g.textAlign = 'left'; g.textBaseline = 'middle';
  const counts = ['98…', '99…', '100!'];
  for (let i = 0; i < 3; i++) {
    const a = seg(u, 0.05 + i * 0.2, 0.15 + i * 0.2) * (1 - seg(u, 0.5 + i * 0.2, 0.7 + i * 0.2));
    if (a <= 0) continue;
    g.fillStyle = rgba(INK, a);
    g.fillText(counts[i], cx - U * 0.32 + i * U * 0.1, H * (0.4 - i * 0.07) - a * U * 0.02);
  }
  // the hero: a bush with eyes
  const bx = cx + U * 0.36, by = H * 0.82;
  const peek = Math.sin(seg(u, 0.4, 0.72) * Math.PI) * U * 0.07;
  circ(g, bx + U * 0.02, by - U * 0.33 - peek, U * 0.05, CREAM);
  g.beginPath(); g.arc(bx + U * 0.02, by - U * 0.2 - peek, U * 0.11, Math.PI, TAU); g.closePath(); g.fillStyle = shade(m.col, -0.18); g.fill();
  box(g, bx - U * 0.1, by - U * 0.22 - peek, U * 0.24, U * 0.045, m.col, U * 0.02);
  const bc = '#4f7a45';
  circ(g, bx - U * 0.17, by - U * 0.02, U * 0.17, bc);
  circ(g, bx + U * 0.2, by - U * 0.03, U * 0.18, bc);
  circ(g, bx + U * 0.02, by - U * 0.1, U * 0.2, bc);
  circ(g, bx - U * 0.08, by - U * 0.16, U * 0.09, shade(bc, 0.12));
  circ(g, bx + U * 0.22, by - U * 0.1, U * 0.07, shade(bc, 0.12));
  for (let i = 0; i < 5; i++) circ(g, bx + (hash(i + 40) - 0.5) * U * 0.5, by - hash(i + 50) * U * 0.2, U * 0.014, TERRA);
  const blink = (tt * 1.3 + 0.2) % 1 < 0.1;
  for (const s of [-1, 1]) {
    if (blink) limb(g, bx + s * U * 0.055 - U * 0.025 + U * 0.02, by - U * 0.13, bx + s * U * 0.055 + U * 0.045, by - U * 0.13, U * 0.01, INK);
    else {
      ell(g, bx + s * U * 0.055 + U * 0.02, by - U * 0.13, U * 0.034, U * 0.04, '#fffaf0');
      circ(g, bx + s * U * 0.055 + U * 0.02 - U * 0.012 * (1 - seg(u, 0.4, 0.5)) , by - U * 0.128, U * 0.017, INK);
    }
  }
}

// ---- 6 · the school play ---------------------------------------------------------------------------
function play(g, W, H, u, tt, m) {
  const U = H, cx = W * 0.5;
  box(g, 0, 0, W, H, NIGHT);
  circ(g, cx + U * 0.3, H * 0.22, U * 0.1, '#f6e9c0');
  for (let i = 0; i < 9; i++) { const x = hash(i * 5) * W, y = H * (0.08 + 0.3 * hash(i * 5 + 1)); limb(g, x, 0, x, y, U * 0.003, rgba(CREAM, 0.4)); star(g, x, y, U * 0.03, MUSTARD, 5, tt + i, 0.45); }
  hills(g, W, H, H * 0.62, U * 0.16, '#2f5a55', 1.3);
  hills(g, W, H, H * 0.68, U * 0.08, '#3d7468', 3.1);
  box(g, 0, H * 0.72, W, H * 0.16, '#a87548');
  box(g, 0, H * 0.72, W, H * 0.012, '#c99562');
  // spotlight on the lead
  const lx = cx - U * 0.28;
  poly(g, [lx - U * 0.04, 0, lx + U * 0.1, 0, lx + U * 0.3, H * 0.86, lx - U * 0.3, H * 0.86], 'rgba(255,240,190,0.16)');
  ell(g, lx, H * 0.86, U * 0.3, U * 0.035, 'rgba(255,240,190,0.2)');
  const ges = Math.sin(tt * 4);
  const lead = person(g, lx, H * 0.86, U * 0.44, extraPerson(4, { col: BRICK, kid: 0.55, hat: 'crown', armR: 2.3 + ges * 0.4, armL: 0.9 - ges * 0.2, mouth: 'o', face: 1, hairStyle: 1 }));
  limb(g, lead.hands[1].x, lead.hands[1].y, lead.hands[1].x + U * 0.03, lead.hands[1].y - U * 0.12, U * 0.012, MUSTARD);
  // the hero: Tree No. 2, fully committed
  const tx = cx + U * 0.36, ty = H * 0.86, sway = Math.sin(tt * 2.4) * 0.07;
  g.save();
  g.translate(tx, ty);
  g.rotate(sway);
  ell(g, -U * 0.05, -U * 0.005, U * 0.045, U * 0.02, m.col);
  ell(g, U * 0.05, -U * 0.005, U * 0.045, U * 0.02, m.col);
  box(g, -U * 0.085, -U * 0.3, U * 0.17, U * 0.3, '#7a5234', U * 0.03);
  limb(g, -U * 0.06, -U * 0.2, -U * 0.06, -U * 0.08, U * 0.008, '#5c3c26');
  limb(g, U * 0.03, -U * 0.24, U * 0.03, -U * 0.14, U * 0.008, '#5c3c26');
  box(g, -U * 0.09, -U * 0.17, U * 0.18, U * 0.04, m.col);
  for (const s of [-1, 1]) {
    limb(g, s * U * 0.07, -U * 0.27, s * U * 0.25, -U * 0.4, U * 0.03, '#7a5234');
    circ(g, s * U * 0.27, -U * 0.43, U * 0.06, '#5f9a4e');
    circ(g, s * U * 0.21, -U * 0.47, U * 0.04, '#74ad58');
  }
  for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; circ(g, Math.cos(a) * U * 0.13, -U * 0.45 + Math.sin(a) * U * 0.11, U * 0.1, i % 2 ? '#5f9a4e' : '#6ea855'); }
  circ(g, 0, -U * 0.45, U * 0.15, '#5f9a4e');
  circ(g, 0, -U * 0.44, U * 0.085, m.skin);
  circ(g, -U * 0.03, -U * 0.445, U * 0.011, INK);
  circ(g, U * 0.03, -U * 0.445, U * 0.011, INK);
  limb(g, -U * 0.018, -U * 0.4, U * 0.018, -U * 0.4, U * 0.009, INK);
  g.restore();
  // curtains and audience
  for (const s of [-1, 1]) {
    g.beginPath();
    const ex = s < 0 ? 0 : W;
    g.moveTo(ex, 0);
    g.lineTo(ex - s * U * 0.34, 0);
    g.bezierCurveTo(ex - s * U * 0.3, H * 0.3, ex - s * U * 0.1, H * 0.5, ex - s * U * 0.16, H * 0.9);
    g.lineTo(ex, H * 0.9);
    g.closePath();
    g.fillStyle = '#9c2f2f'; g.fill();
    limb(g, ex - s * U * 0.2, H * 0.02, ex - s * U * 0.09, H * 0.86, U * 0.012, '#7a2222');
    limb(g, ex - s * U * 0.09, H * 0.02, ex - s * U * 0.04, H * 0.86, U * 0.012, '#7a2222');
  }
  for (let i = 0; i * U * 0.15 < W + U; i++) circ(g, i * U * 0.15, 0, U * 0.09, '#b23a36');
  for (let i = 0; i * U * 0.17 < W + U; i++) {
    const x = i * U * 0.17 + hash(i + 60) * U * 0.05, y = H * (1.0 + 0.03 * hash(i + 70));
    circ(g, x, y - U * 0.02, U * 0.075, '#1a1420');
    box(g, x - U * 0.1, y + U * 0.03, U * 0.2, U * 0.2, '#1a1420', U * 0.05);
  }
}

// ---- 7 · the funfair ---------------------------------------------------------------------------------
function fair(g, W, H, u, tt, m) {
  const U = H, cx = W * 0.5;
  sky(g, W, H, '#1b2145', '#5b3a6b', 1);
  for (let i = 0; i < 24; i++) circ(g, hash(i * 9) * W, hash(i * 9 + 1) * H * 0.5, U * 0.004 * (1 + hash(i)), rgba('#fff', 0.5 + 0.5 * Math.sin(tt * 3 + i)));
  // a big wheel far away
  ring(g, cx - U * 0.55, H * 0.42, U * 0.24, U * 0.012, '#8b5a8a');
  for (let i = 0; i < 8; i++) { const a = tt * 0.4 + (i * TAU) / 8; limb(g, cx - U * 0.55, H * 0.42, cx - U * 0.55 + Math.cos(a) * U * 0.24, H * 0.42 + Math.sin(a) * U * 0.24, U * 0.005, '#8b5a8a'); circ(g, cx - U * 0.55 + Math.cos(a) * U * 0.24, H * 0.42 + Math.sin(a) * U * 0.24, U * 0.022, i % 2 ? MUSTARD : PINK); }
  box(g, 0, H * 0.86, W, H * 0.14, '#3a2b45');
  // the stall
  const sx0 = cx - U * 0.2, sx1 = cx + U * 0.78;
  box(g, sx0, H * 0.24, sx1 - sx0, H * 0.5, '#20424a');
  box(g, sx0, H * 0.7, sx1 - sx0, H * 0.18, WOOD);
  box(g, sx0 - U * 0.02, H * 0.685, sx1 - sx0 + U * 0.04, H * 0.035, '#b88558', U * 0.01);
  for (let i = 0; i < 8; i++) {
    const x = sx0 - U * 0.04 + (i * (sx1 - sx0 + U * 0.08)) / 8, w2 = (sx1 - sx0 + U * 0.08) / 8;
    box(g, x, H * 0.12, w2 + 1, H * 0.13, i % 2 ? CREAM : TERRA);
    circ(g, x + w2 / 2, H * 0.25, w2 / 2, i % 2 ? CREAM : TERRA);
  }
  poly(g, [sx0 - U * 0.04, H * 0.12, sx1 + U * 0.04, H * 0.12, sx1 - U * 0.04, H * 0.05, sx0 + U * 0.04, H * 0.05], BRICK);
  for (let i = 0; i < 10; i++) circ(g, sx0 + ((i + 0.5) * (sx1 - sx0)) / 10, H * 0.3, U * 0.014, Math.sin(tt * 6 + i * 1.7) > 0 ? '#ffe9a0' : '#c98f3a');
  // the bear nobody was meant to win
  const bx = cx + U * 0.56, byy = H * 0.5 + Math.sin(tt * 2) * U * 0.006;
  circ(g, bx - U * 0.07, byy - U * 0.14, U * 0.035, '#a06a3c'); circ(g, bx + U * 0.07, byy - U * 0.14, U * 0.035, '#a06a3c');
  ell(g, bx, byy + U * 0.06, U * 0.1, U * 0.12, '#a06a3c');
  circ(g, bx, byy - U * 0.08, U * 0.085, '#b57a48');
  ell(g, bx, byy - U * 0.055, U * 0.04, U * 0.03, '#e6c79a');
  circ(g, bx - U * 0.03, byy - U * 0.1, U * 0.01, INK); circ(g, bx + U * 0.03, byy - U * 0.1, U * 0.01, INK); circ(g, bx, byy - U * 0.065, U * 0.012, INK);
  poly(g, [bx - U * 0.05, byy + U * 0.0, bx + U * 0.05, byy + U * 0.0, bx + U * 0.07, byy + U * 0.03, bx - U * 0.07, byy + U * 0.03], TERRA);
  // paper targets on a rack
  const hitU = 0.48, tx = cx + U * 0.4, tyy = H * 0.47; // the middle target is the one that gets it
  for (let i = 0; i < 3; i++) {
    const x = tx + (i - 1) * U * 0.15 - U * 0.1, y = tyy + (i - 1) * U * 0.02;
    const sw = i === 1 ? Math.sin(seg(u, hitU, hitU + 0.35) * Math.PI * 3) * (1 - seg(u, hitU, hitU + 0.35)) * 0.5 : 0;
    g.save(); g.translate(x, y - U * 0.1); g.rotate(sw);
    limb(g, 0, -U * 0.04, 0, 0, U * 0.006, CREAM);
    box(g, -U * 0.065, 0, U * 0.13, U * 0.16, '#f7efd9');
    ring(g, 0, U * 0.08, U * 0.05, U * 0.008, INK); ring(g, 0, U * 0.08, U * 0.028, U * 0.008, INK); circ(g, 0, U * 0.08, U * 0.012, TERRA);
    if (i === 1 && u > hitU) circ(g, U * 0.002, U * 0.08, U * 0.009, '#111');
    g.restore();
  }
  // the stallholder's face says it all
  person(g, cx - U * 0.07, H * 0.74, U * 0.5, extraPerson(5, { col: CREAM, sash: TERRA, armL: 0.3, armR: u > hitU ? 2.6 : 0.5, mouth: u > hitU ? 'o' : 'flat', noLegs: true, hairStyle: 3, look: 1 }));
  box(g, sx0, H * 0.7, U * 0.3, H * 0.05, WOOD);
  // the hero on a crate, cork rifle up
  box(g, cx - U * 0.62, H * 0.82, U * 0.24, U * 0.1, '#b88558', U * 0.008);
  limb(g, cx - U * 0.62, H * 0.87, cx - U * 0.38, H * 0.87, U * 0.008, WOOD);
  const rec = Math.sin(seg(u, hitU - 0.1, hitU + 0.05) * Math.PI) * 0.03;
  const p = person(g, cx - U * 0.5, H * 0.82, U * 0.46, hero(m, { kid: 0.5, face: 1, armL: 1.52, armR: 1.4, lean: -rec, mouth: u > hitU + 0.1 ? 'grin' : 'flat' }));
  const gy = p.hands[1].y + U * 0.012, gx = p.hands[0].x - U * 0.06;
  limb(g, gx, gy, gx + U * 0.3, gy, U * 0.02, '#6b4630');
  limb(g, gx + U * 0.12, gy - U * 0.004, gx + U * 0.34, gy - U * 0.004, U * 0.011, '#30303a');
  const fly = seg(u, hitU - 0.1, hitU);
  if (fly > 0 && fly < 1) circ(g, lerp(gx + U * 0.34, tx - U * 0.1, fly), lerp(gy, tyy + U * 0.0, fly) - Math.sin(fly * Math.PI) * U * 0.02, U * 0.012, '#c9a26b');
  const ding = seg(u, hitU, hitU + 0.25);
  if (ding > 0 && ding < 1) star(g, tx - U * 0.1, tyy, U * (0.05 + 0.12 * ding), rgba('#ffe9a0', 1 - ding), 8, tt, 0.4);
}

// ---- 8 · six cans --------------------------------------------------------------------------------------
function cans(g, W, H, u, tt, m) {
  const U = H, cx = W * 0.5, sk = skyFor(m);
  sky(g, W, H, sk[0], sk[1]);
  sun(g, W * 0.18, H * 0.18, U * 0.07, '#fff3c9');
  hills(g, W, H, H * 0.56, U * 0.14, SAGE, 0.9);
  // washing line
  g.strokeStyle = INK; g.lineWidth = U * 0.004; g.beginPath(); g.moveTo(cx - U * 0.2, H * 0.2); g.quadraticCurveTo(cx + U * 0.35, H * 0.3, cx + U * 0.95, H * 0.18); g.stroke();
  for (let i = 0; i < 4; i++) {
    const k = (i + 0.6) / 4.6, x = cx - U * 0.2 + U * 1.15 * k, y = H * (0.2 + 0.085 * 4 * k * (1 - k)) + U * 0.006;
    g.save(); g.translate(x, y); g.rotate(Math.sin(tt * 2.2 + i) * 0.08);
    box(g, -U * 0.05, 0, U * 0.1, U * (0.1 + 0.03 * (i % 2)), [CREAM, PINK, '#a9c7c0', MUSTARD][i], U * 0.008);
    g.restore();
  }
  box(g, 0, H * 0.74, W, H * 0.26, GRASS);
  // fence
  const fx0 = cx - U * 0.22, fy = H * 0.56;
  for (let i = 0; fx0 + i * U * 0.09 < W; i++) {
    const x = fx0 + i * U * 0.09;
    poly(g, [x, fy + U * 0.03, x + U * 0.035, fy, x + U * 0.07, fy + U * 0.03, x + U * 0.07, H * 0.84, x, H * 0.84], '#f3e6cc');
  }
  box(g, fx0 - U * 0.02, fy + U * 0.07, W, U * 0.03, '#e1d0ae');
  box(g, fx0 - U * 0.02, fy + U * 0.2, W, U * 0.03, '#e1d0ae');
  box(g, fx0 - U * 0.03, fy + U * 0.012, W, U * 0.022, '#d2bf99');
  // cans, and the stones that find them
  const p = person(g, cx - U * 0.56, H * 0.92, U * 0.44, hero(m, { kid: 0.5, face: 1, armL: 1.75, armR: 1.1 + Math.sin(u * 6 * Math.PI) * 0.35, mouth: 'flat', lean: -0.02 }));
  const sxh = p.hands[0].x, syh = p.hands[0].y;
  limb(g, sxh, syh + U * 0.04, sxh, syh - U * 0.01, U * 0.012, '#6b4630');
  limb(g, sxh, syh - U * 0.01, sxh - U * 0.022, syh - U * 0.05, U * 0.01, '#6b4630');
  limb(g, sxh, syh - U * 0.01, sxh + U * 0.022, syh - U * 0.05, U * 0.01, '#6b4630');
  for (let i = 0; i < 6; i++) {
    const x = fx0 + U * (0.12 + i * 0.125), y = fy + U * 0.012, hit = 0.12 + i * 0.13;
    const f = seg(u, hit, hit + 0.3), s = seg(u, hit - 0.07, hit);
    if (s > 0 && s < 1) circ(g, lerp(sxh, x, s), lerp(syh - U * 0.04, y - U * 0.05, s) - Math.sin(s * Math.PI) * U * 0.04, U * 0.01, '#5a5350');
    if (f >= 1) continue;
    g.save();
    g.translate(x + f * U * (0.18 + 0.05 * i), y - Math.sin(f * Math.PI * 0.8) * U * 0.3 + f * f * U * 0.3);
    g.rotate(f * (7 + i));
    box(g, -U * 0.03, -U * 0.085, U * 0.06, U * 0.085, '#b9c0c4', U * 0.006);
    box(g, -U * 0.03, -U * 0.066, U * 0.06, U * 0.04, [TERRA, TEAL, MUSTARD][i % 3]);
    box(g, -U * 0.03, -U * 0.085, U * 0.06, U * 0.01, '#8d9498');
    g.restore();
    if (f > 0 && f < 0.3) star(g, x, y - U * 0.05, U * 0.06 * (f / 0.3 + 0.4), rgba('#fff6d8', 1 - f / 0.3), 6, i, 0.35);
  }
}

// ---- 9 · first scope -------------------------------------------------------------------------------------
function scope(g, W, H, u, tt, m) {
  const U = H, cx = W * 0.5;
  sky(g, W, H, '#141b3c', '#3a3f74', 1);
  for (let i = 0; i < 46; i++) circ(g, hash(i * 9 + 2) * W, hash(i * 9 + 3) * H * 0.7, U * 0.0035 * (1 + 1.5 * hash(i + 9)), rgba('#fff', 0.45 + 0.45 * Math.sin(tt * 2.5 + i * 1.3)));
  const mx = cx + U * 0.42, my = H * 0.24;
  circ(g, mx, my, U * 0.21, 'rgba(246,233,192,0.1)');
  circ(g, mx, my, U * 0.165, 'rgba(246,233,192,0.16)');
  circ(g, mx, my, U * 0.13, '#f6e9c0');
  circ(g, mx - U * 0.04, my - U * 0.03, U * 0.03, '#e2d2a4'); circ(g, mx + U * 0.05, my + U * 0.04, U * 0.022, '#e2d2a4'); circ(g, mx + U * 0.02, my - U * 0.07, U * 0.014, '#e2d2a4');
  const s = seg(u, 0.5, 0.75);
  if (s > 0 && s < 1) {
    const x = lerp(cx - U * 0.2, cx - U * 0.75, s), y = lerp(H * 0.08, H * 0.3, s);
    const gr = g.createLinearGradient(x, y, x + U * 0.3, y - U * 0.13);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = gr; g.lineWidth = U * 0.008; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + U * 0.3, y - U * 0.13); g.stroke();
  }
  hills(g, W, H, H * 0.8, U * 0.14, '#1d2a3a', 2.0);
  // home, one window still lit
  box(g, cx - U * 0.9, H * 0.52, U * 0.34, H * 0.4, '#232b45');
  poly(g, [cx - U * 0.95, H * 0.53, cx - U * 0.73, H * 0.36, cx - U * 0.51, H * 0.53], '#1a2038');
  box(g, cx - U * 0.8, H * 0.6, U * 0.1, U * 0.11, '#ffd77a', U * 0.006);
  box(g, cx - U * 0.754, H * 0.6, U * 0.008, U * 0.11, '#232b45');
  box(g, 0, H * 0.86, W, H * 0.14, '#18233a');
  // telescope
  const px = cx + U * 0.02, py = H * 0.6, ang = Math.atan2(my - py, mx - px);
  for (const d of [-1, 0, 1]) limb(g, px, py + U * 0.02, px + d * U * 0.12, H * 0.9, U * 0.012, '#11131c');
  g.save(); g.translate(px, py); g.rotate(ang);
  box(g, -U * 0.14, -U * 0.03, U * 0.4, U * 0.06, '#d9d2c0', U * 0.01);
  box(g, U * 0.2, -U * 0.036, U * 0.07, U * 0.072, MUSTARD, U * 0.01);
  box(g, -U * 0.19, -U * 0.016, U * 0.06, U * 0.032, '#30303a');
  g.restore();
  const wow = u > 0.6;
  person(g, px - U * 0.25, H * 0.9, U * 0.44, hero(m, { kid: 0.5, face: 1, armL: 1.9, armR: wow ? 2.9 : 1.6, lean: 0.05, mouth: wow ? 'o' : 'smile' }));
  box(g, px + U * 0.26, H * 0.83, U * 0.05, U * 0.08, TERRA, U * 0.01);
  box(g, px + U * 0.265, H * 0.815, U * 0.04, U * 0.025, CREAM, U * 0.006);
}

// ---- 10 · the first shot (it was a camera) -------------------------------------------------------------------
function camera(g, W, H, u, tt, m) {
  const U = H, cx = W * 0.5, sk = skyFor(m);
  sky(g, W, H, sk[0], sk[1]);
  box(g, cx - U * 0.1, H * 0.1, W, H * 0.66, '#f0dcb2');
  poly(g, [cx - U * 0.18, H * 0.12, W, H * 0.12, W, -H * 0.05, cx + U * 0.1, -H * 0.05], BRICK);
  box(g, cx + U * 0.5, H * 0.36, U * 0.2, H * 0.4, TEAL, U * 0.01);
  circ(g, cx + U * 0.66, H * 0.57, U * 0.012, MUSTARD);
  box(g, cx + U * 0.02, H * 0.3, U * 0.22, U * 0.2, '#a9c7c0', U * 0.01);
  box(g, cx + U * 0.125, H * 0.3, U * 0.012, U * 0.2, '#f0dcb2');
  box(g, cx, H * 0.5, U * 0.26, U * 0.035, TERRA);
  for (let i = 0; i < 5; i++) circ(g, cx + U * (0.03 + i * 0.05), H * 0.49, U * 0.02, i % 2 ? PINK : MUSTARD);
  box(g, 0, H * 0.74, W, H * 0.26, GRASS);
  const after = u > 0.52, fl = Math.exp(-Math.pow((u - 0.5) / 0.06, 2));
  const stiff = { blink: after, mouth: after ? 'flat' : 'grin' };
  person(g, cx + U * 0.2, H * 0.92, U * 0.64, extraPerson(1, { col: m.cool ? BRICK : NAVY, ...stiff, armL: 0.1, armR: 0.5 }));
  person(g, cx + U * 0.46, H * 0.92, U * 0.6, extraPerson(2, { col: CREAM, dress: true, ...stiff, hairStyle: 1, armL: 0.5, armR: 0.1 }));
  person(g, cx + U * 0.33, H * 0.95, U * 0.36, extraPerson(3, { col: MUSTARD, kid: 0.7, ...stiff, hairStyle: 2, armL: 2.6, armR: 0.2 }));
  const p = person(g, cx - U * 0.5, H * 0.93, U * 0.46, hero(m, { kid: 0.5, face: 1, armL: 1.95, armR: 1.85 }));
  const kx = p.hx + p.hr * 1.0, ky = p.hy + p.hr * 0.05;
  box(g, kx - U * 0.05, ky - U * 0.04, U * 0.11, U * 0.085, '#30303a', U * 0.01);
  circ(g, kx + U * 0.045, ky + U * 0.005, U * 0.03, '#9aa0a8'); circ(g, kx + U * 0.045, ky + U * 0.005, U * 0.018, '#1a1c22');
  box(g, kx - U * 0.03, ky - U * 0.065, U * 0.04, U * 0.03, '#d9d2c0', U * 0.004);
  // the dog that ruined it
  const dk = seg(u, 0.3, 0.85);
  if (dk > 0 && dk < 1) {
    const dx = lerp(W + U * 0.1, cx - U * 0.2, dk), dy = H * 0.97 - Math.abs(Math.sin(dk * 14)) * U * 0.03;
    ell(g, dx, dy - U * 0.07, U * 0.1, U * 0.05, '#e9dcc0');
    circ(g, dx - U * 0.1, dy - U * 0.11, U * 0.045, '#e9dcc0');
    ell(g, dx - U * 0.085, dy - U * 0.15, U * 0.016, U * 0.03, '#8c5e3f', 0.4);
    circ(g, dx - U * 0.115, dy - U * 0.115, U * 0.008, INK); circ(g, dx - U * 0.14, dy - U * 0.1, U * 0.01, INK);
    limb(g, dx + U * 0.09, dy - U * 0.09, dx + U * 0.14, dy - U * 0.15, U * 0.014, '#e9dcc0');
    for (const o of [-0.06, 0.06]) limb(g, dx + U * o, dy - U * 0.04, dx + U * o + Math.sin(dk * 28 + o * 30) * U * 0.03, dy, U * 0.016, '#e9dcc0');
  }
  if (fl > 0.01) {
    const fx = kx - U * 0.01, fy = ky - U * 0.05;
    const gr = g.createRadialGradient(fx, fy, 0, fx, fy, U * 1.5);
    gr.addColorStop(0, `rgba(255,255,255,${fl})`); gr.addColorStop(0.3, `rgba(255,252,235,${fl * 0.7})`); gr.addColorStop(1, `rgba(255,250,230,${fl * 0.35})`);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    star(g, fx, fy, U * 0.3 * fl, `rgba(255,255,255,${fl})`, 4, 0.3, 0.12);
  }
}

// ---- 11 · six hours, one boot ------------------------------------------------------------------------------
function fish(g, W, H, u, tt, m) {
  const U = H, cx = W * 0.5;
  sky(g, W, H, m.cool ? '#f0a987' : '#9fc9cf', '#fbe7c2', 0.6);
  circ(g, cx + U * 0.3, H * 0.56, U * 0.13, '#fff1c4');
  hills(g, W, H, H * 0.56, U * 0.1, '#7d9a86', 1.7);
  box(g, 0, H * 0.56, W, H * 0.44, '#4f8f97');
  for (let i = 0; i < 8; i++) {
    const y = H * (0.6 + i * 0.05), wv = Math.sin(tt * 1.5 + i) * U * 0.03;
    box(g, cx + U * 0.3 - U * (0.06 + 0.02 * i) + wv, y, U * (0.12 + 0.04 * i), U * 0.012, 'rgba(255,241,196,0.5)', U * 0.006);
    box(g, ((hash(i + 3) * W + tt * U * 0.03 * (i + 1)) % (W + U * 0.3)) - U * 0.15, y + U * 0.025, U * 0.16, U * 0.006, 'rgba(255,255,255,0.22)', U * 0.003);
  }
  for (let i = 0; i < 6; i++) {
    const x = cx - U * (0.95 - i * 0.045), b = Math.sin(tt * 1.6 + i) * U * 0.01;
    limb(g, x, H * 0.95, x + b, H * (0.5 + 0.04 * (i % 3)), U * 0.008, '#3f6b45');
    ell(g, x + b, H * (0.5 + 0.04 * (i % 3)), U * 0.012, U * 0.04, '#6b4630');
  }
  // a duck with places to be
  const dx = ((tt * U * 0.05 + U * 0.2) % (W + U * 0.4)) - U * 0.2, dy = H * 0.64 + Math.sin(tt * 3) * U * 0.004;
  ell(g, dx, dy, U * 0.05, U * 0.028, '#f6efe0'); circ(g, dx + U * 0.04, dy - U * 0.035, U * 0.022, '#f6efe0');
  poly(g, [dx + U * 0.058, dy - U * 0.04, dx + U * 0.085, dy - U * 0.032, dx + U * 0.058, dy - U * 0.025], '#f08a2c');
  circ(g, dx + U * 0.045, dy - U * 0.04, U * 0.004, INK);
  // jetty
  const jx = cx - U * 0.05, jy = H * 0.74;
  for (let i = 0; i < 4; i++) box(g, jx - U * 0.2 - i * U * 0.28, jy, U * 0.03, H * 0.3, '#5c3f2a');
  box(g, -U * 0.1, jy - U * 0.02, jx + U * 0.12, U * 0.05, '#a87548', U * 0.008);
  box(g, -U * 0.1, jy + U * 0.03, jx + U * 0.12, U * 0.012, '#7a5234');
  const pull = ease.outBack(seg(u, 0.52, 0.72));
  limb(g, jx - U * 0.03, jy - U * 0.01, jx + U * 0.0, jy + U * 0.12 + Math.sin(tt * 3) * U * 0.01, U * 0.04, '#3b3550');
  limb(g, jx + U * 0.03, jy - U * 0.01, jx + U * 0.06, jy + U * 0.12 - Math.sin(tt * 3) * U * 0.01, U * 0.04, '#2c2740');
  const p = person(g, jx, jy + U * 0.105, U * 0.33, hero(m, { kid: 0.45, face: 1, armL: 1.55 + pull * 0.5, armR: 1.35 + pull * 0.5, noLegs: true, mouth: pull > 0.5 ? 'flat' : 'smile', lean: -pull * 0.04 }));
  const hx = p.hands[1].x, hy = p.hands[1].y;
  const tipx = hx + U * lerp(0.42, 0.3, pull), tipy = hy - U * lerp(0.26, 0.42, pull);
  g.strokeStyle = '#3a2a22'; g.lineWidth = U * 0.009; g.lineCap = 'round';
  g.beginPath(); g.moveTo(hx - U * 0.05, hy + U * 0.02); g.quadraticCurveTo(hx + U * 0.2, hy - U * (0.2 + 0.12 * pull), tipx, tipy); g.stroke();
  const fx = lerp(cx + U * 0.52, tipx + Math.sin(tt * 5) * U * 0.03, pull), fy = lerp(H * 0.7 + Math.sin(tt * 4) * U * 0.008, tipy + U * 0.25, pull);
  limb(g, tipx, tipy, fx, fy, U * 0.003, 'rgba(255,255,255,0.8)');
  if (pull < 0.05) { circ(g, fx, fy, U * 0.014, TERRA); circ(g, fx, fy - U * 0.008, U * 0.008, CREAM); ring(g, fx, fy + U * 0.01, U * 0.03 + ((tt * 0.5) % 1) * U * 0.03, U * 0.003, 'rgba(255,255,255,0.4)'); }
  else {
    g.save(); g.translate(fx, fy); g.rotate(Math.sin(tt * 5) * 0.25);
    poly(g, [-U * 0.03, 0, U * 0.03, 0, U * 0.03, U * 0.09, U * 0.085, U * 0.1, U * 0.085, U * 0.135, -U * 0.03, U * 0.135], '#6b4630');
    box(g, -U * 0.034, -U * 0.004, U * 0.068, U * 0.02, '#4a2f1f');
    box(g, -U * 0.03, U * 0.125, U * 0.118, U * 0.014, '#2a1b17');
    g.restore();
    for (let i = 0; i < 3; i++) { const d = (tt * 1.6 + i * 0.33) % 1; ell(g, fx + (i - 1) * U * 0.03, fy + U * 0.14 + d * U * 0.14, U * 0.006, U * 0.012, `rgba(190,230,235,${1 - d})`); }
  }
}

// ---- 12 · the driving test -------------------------------------------------------------------------------------
function car(g, W, H, u, tt, m) {
  const U = H, cx = W * 0.5, sk = skyFor(m);
  sky(g, W, H, sk[0], sk[1]);
  sun(g, cx - U * 0.4, H * 0.2, U * 0.07, '#fff3c9');
  for (let i = 0; i < 3; i++) { const x = cx + [-0.05, 0.42, -0.7][i] * U + tt * U * 0.01, y = H * [0.16, 0.3, 0.34][i]; ell(g, x, y, U * 0.13, U * 0.035, 'rgba(255,255,255,0.75)'); ell(g, x + U * 0.06, y - U * 0.025, U * 0.07, U * 0.035, 'rgba(255,255,255,0.75)'); }
  for (let i = 0; i * U * 0.22 < W + U; i++) circ(g, i * U * 0.22, H * 0.62, U * 0.14, '#5b7d49');
  box(g, 0, H * 0.6, W, H * 0.1, '#5b7d49');
  box(g, cx + U * 0.3, H * 0.36, U * 0.02, H * 0.34, '#6b4630');
  box(g, cx + U * 0.14, H * 0.3, U * 0.34, U * 0.13, CREAM, U * 0.012);
  g.fillStyle = INK; g.font = `700 ${U * 0.05}px 'Rajdhani', 'Futura', sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('TEST  TODAY', cx + U * 0.31, H * 0.3 + U * 0.07);
  box(g, 0, H * 0.68, W, H * 0.32, '#6f5d58');
  g.fillStyle = 'rgba(245,230,200,0.6)';
  for (let i = 0; i * U * 0.32 < W + U; i++) g.fillRect(i * U * 0.32, H * 0.7, U * 0.012, H * 0.12);
  const carX = lerp(-U * 0.5, W * 0.5 + U * 0.5, ease.inOutSine(u)), gy = H * 0.9;
  for (let i = 0; i < 6; i++) {
    const x = cx - U * 0.62 + i * U * 0.24, f = clamp01((carX + U * 0.22 - x) / (U * 0.42));
    g.save();
    g.translate(x + f * U * 0.22, gy - Math.sin(f * Math.PI) * U * (0.3 + 0.06 * (i % 3)));
    g.rotate(f < 1 ? f * (5 + i * 0.7) : Math.PI / 2 * (i % 2 ? 1 : -1));
    poly(g, [-U * 0.035, 0, U * 0.035, 0, U * 0.008, -U * 0.11, -U * 0.008, -U * 0.11], '#f0752e');
    box(g, -U * 0.022, -U * 0.06, U * 0.044, U * 0.02, CREAM);
    box(g, -U * 0.05, -U * 0.008, U * 0.1, U * 0.016, '#c95a1f', U * 0.004);
    g.restore();
  }
  g.save();
  g.translate(carX, gy + Math.sin(tt * 20) * U * 0.003);
  g.rotate(-0.02 + Math.sin(tt * 9) * 0.012);
  for (let i = 0; i < 3; i++) { const d = (tt * 2 + i * 0.33) % 1; circ(g, -U * 0.26 - d * U * 0.14, -U * 0.05 - d * U * 0.05, U * (0.015 + d * 0.03), `rgba(245,240,230,${0.5 * (1 - d)})`); }
  box(g, -U * 0.13, -U * 0.28, U * 0.27, U * 0.16, shade(m.col, -0.08), U * 0.04);
  box(g, -U * 0.105, -U * 0.26, U * 0.22, U * 0.1, '#cfe6e2', U * 0.025);
  // driver (hat) and examiner (clipboard, regret)
  circ(g, U * 0.05, -U * 0.2, U * 0.036, m.skin);
  g.beginPath(); g.arc(U * 0.05, -U * 0.205, U * 0.04, Math.PI, TAU); g.closePath(); g.fillStyle = shade(m.col, -0.25); g.fill();
  circ(g, U * 0.05, -U * 0.25, U * 0.012, CREAM);
  circ(g, U * 0.065, -U * 0.195, U * 0.004, INK);
  circ(g, -U * 0.045, -U * 0.2, U * 0.034, SKINS[2]);
  circ(g, -U * 0.03, -U * 0.2, U * 0.004, INK); circ(g, -U * 0.036, -U * 0.182, U * 0.008, INK);
  box(g, -U * 0.085, -U * 0.175, U * 0.035, U * 0.045, CREAM);
  box(g, -U * 0.01, -U * 0.27, U * 0.012, U * 0.12, shade(m.col, -0.08));
  box(g, -U * 0.25, -U * 0.17, U * 0.5, U * 0.13, m.col, U * 0.04);
  box(g, -U * 0.25, -U * 0.08, U * 0.5, U * 0.025, shade(m.col, -0.2));
  circ(g, U * 0.235, -U * 0.115, U * 0.016, '#fff3c9');
  box(g, -U * 0.24, -U * 0.14, U * 0.05, U * 0.05, '#fffaf0');
  g.fillStyle = TERRA; g.font = `700 ${U * 0.05}px 'Rajdhani', 'Futura', sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('L', -U * 0.215, -U * 0.112);
  for (const s of [-1, 1]) {
    circ(g, s * U * 0.15, -U * 0.04, U * 0.055, INK);
    circ(g, s * U * 0.15, -U * 0.04, U * 0.025, '#d9d2c0');
    limb(g, s * U * 0.15 - Math.cos(tt * 14) * U * 0.02, -U * 0.04 - Math.sin(tt * 14) * U * 0.02, s * U * 0.15 + Math.cos(tt * 14) * U * 0.02, -U * 0.04 + Math.sin(tt * 14) * U * 0.02, U * 0.006, INK);
  }
  g.restore();
}

// ---- 13 · graduation ---------------------------------------------------------------------------------------------
function grad(g, W, H, u, tt, m) {
  const U = H, cx = W * 0.5, sk = skyFor(m);
  sky(g, W, H, sk[0], sk[1]);
  poly(g, [cx - U * 0.75, H * 0.22, cx, H * 0.04, cx + U * 0.75, H * 0.22], '#e9d9b6');
  box(g, cx - U * 0.72, H * 0.22, U * 1.44, H * 0.05, '#d9c79f');
  for (let i = 0; i < 6; i++) box(g, cx - U * 0.64 + i * U * 0.243, H * 0.27, U * 0.075, H * 0.46, i % 2 ? '#efe1c0' : '#f6ead0');
  box(g, cx - U * 0.8, H * 0.7, U * 1.6, H * 0.06, '#d9c79f');
  box(g, 0, H * 0.76, W, H * 0.24, GRASS);
  bunting(g, -W * 0.02, H * 0.3, W * 1.02, H * 0.3, H * 0.04, Math.round(W / H * 8), PARTY, U * 0.06);
  const k = seg(u, 0.18, 1);
  for (let i = 0; i < 5; i++) {
    const me = i === 2, x = cx + (i - 2) * U * 0.27, y = H * (me ? 0.97 : 0.93 + 0.02 * (i % 2)), s = U * (me ? 0.62 : 0.54);
    const up = ease.outBack(seg(u, 0.1 + 0.03 * i, 0.3 + 0.03 * i));
    const o = me ? hero(m, { hat: null }) : extraPerson(i + 1, {});
    person(g, x, y, s, { ...o, col: NAVY, dress: true, legs: NAVY, sash: me ? m.col : CREAM, armL: lerp(0.3, 2.85, up), armR: lerp(0.3, 2.7, up), mouth: 'grin' });
    // caps: everyone else's comes back down
    const v = me ? 1.25 : 0.62 + 0.14 * hash(i + 5), gy = me ? 0.25 : 1.0;
    const cy = y - s * 0.95 - (v * k - gy * k * k * 0.62) * U * 1.2, cxx = x + (me ? 0.06 : (hash(i + 9) - 0.5) * 0.3) * k * U;
    if (k <= 0 || cy > y - s * 0.9) continue;
    g.save(); g.translate(cxx, cy); g.rotate(k * (4 + i) * (i % 2 ? 1 : -1));
    const cc = me ? m.col : INK;
    poly(g, [-U * 0.08, 0, 0, -U * 0.03, U * 0.08, 0, 0, U * 0.03], cc);
    box(g, -U * 0.04, U * 0.005, U * 0.08, U * 0.03, shade(cc, -0.2));
    limb(g, 0, 0, U * 0.07, U * 0.05, U * 0.006, MUSTARD);
    g.restore();
  }
  confetti(g, W, H, seg(u, 0.25, 1.25), 40, PARTY, 300 + m.n);
}

// ---- 14 · the range ---------------------------------------------------------------------------------------------------
function range(g, W, H, u, tt, m) {
  const U = H, cx = W * 0.5, sk = skyFor(m);
  sky(g, W, H, sk[0], sk[1], 0.62);
  sun(g, cx + U * 0.1, H * 0.2, U * 0.06, '#fff3c9');
  hills(g, W, H, H * 0.5, U * 0.2, '#9db39a', 0.3);
  hills(g, W, H, H * 0.56, U * 0.12, '#7f9c76', 2.6);
  box(g, 0, H * 0.58, W, H * 0.42, GRASS);
  poly(g, [0, H * 0.74, W, H * 0.66, W, H, 0, H], shade(GRASS, 0.08));
  // targets marching off into the distance
  const T3 = [[0.12, 0.71, 0.085, '100'], [0.36, 0.66, 0.06, '200'], [0.56, 0.615, 0.042, '400']];
  const shot = 0.46, hit = seg(u, shot + 0.02, shot + 0.3);
  for (let i = 0; i < 3; i++) {
    const x = cx + T3[i][0] * U, y = H * T3[i][1], r = U * T3[i][2] * (i === 2 ? 1 + Math.sin(hit * Math.PI) * 0.35 : 1);
    limb(g, x, y, x, y + r * 1.8, r * 0.16, '#6b4630');
    circ(g, x, y, r, '#f7efd9'); ring(g, x, y, r * 0.66, r * 0.16, INK); circ(g, x, y, r * 0.26, TERRA);
    box(g, x + r * 1.2, y + r * 1.0, r * 1.3, r * 0.7, CREAM);
    g.fillStyle = INK; g.font = `700 ${r * 0.6}px 'Rajdhani', 'Futura', sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(T3[i][3], x + r * 1.85, y + r * 1.38);
  }
  const fxp = cx - U * 0.08, fyp = H * 0.38;
  limb(g, fxp, H * 0.72, fxp, fyp, U * 0.01, '#6b4630');
  poly(g, [fxp, fyp, fxp + U * 0.14, fyp + U * 0.03 + Math.sin(tt * 7) * U * 0.012, fxp, fyp + U * 0.07], TERRA);
  // the spotter and the shooter
  const sp = person(g, cx - U * 0.6, H * 0.86, U * 0.5, extraPerson(4, { col: '#6f7b52', face: 1, armL: 2.2, armR: 2.1, hairStyle: 3, mouth: hit > 0.2 ? 'o' : 'flat' }));
  box(g, sp.hx + sp.hr * 0.5, sp.hy - sp.hr * 0.3, sp.hr * 1.2, sp.hr * 0.6, '#30303a', sp.hr * 0.15);
  const hx0 = cx - U * 0.56, hy0 = H * 0.9, rec = Math.sin(seg(u, shot, shot + 0.12) * Math.PI) * U * 0.012;
  box(g, hx0 - U * 0.1, hy0 - U * 0.012, U * 0.52, U * 0.03, '#d9c79f', U * 0.01);
  limb(g, hx0, hy0 - U * 0.04, hx0 - U * 0.12, hy0 - U * 0.03, U * 0.045, '#3b3550');
  limb(g, hx0 + U * 0.02, hy0 - U * 0.05, hx0 - U * 0.1, hy0 - U * 0.075, U * 0.045, '#2c2740');
  ell(g, hx0 - U * 0.13, hy0 - U * 0.035, U * 0.03, U * 0.02, INK);
  g.strokeStyle = m.col; g.lineWidth = U * 0.085; g.lineCap = 'round';
  g.beginPath(); g.moveTo(hx0 + U * 0.03 - rec, hy0 - U * 0.055); g.lineTo(hx0 + U * 0.2 - rec, hy0 - U * 0.085); g.stroke();
  const rx = hx0 + U * 0.22 - rec, ry = hy0 - U * 0.105;
  limb(g, hx0 + U * 0.19 - rec, hy0 - U * 0.07, rx + U * 0.1, hy0 - U * 0.035, U * 0.03, shade(m.col, -0.14));
  limb(g, rx - U * 0.02, ry, rx + U * 0.34, ry - U * 0.012, U * 0.016, '#30303a');
  limb(g, rx - U * 0.04, ry + U * 0.012, rx + U * 0.1, ry + U * 0.004, U * 0.03, '#6b4630');
  box(g, rx + U * 0.04, ry - U * 0.032, U * 0.1, U * 0.02, '#1a1c22', U * 0.006);
  limb(g, rx + U * 0.26, ry, rx + U * 0.29, hy0 - U * 0.012, U * 0.008, '#30303a');
  const hhx = hx0 + U * 0.27 - rec, hhy = hy0 - U * 0.13, hr = U * 0.056;
  circ(g, hhx, hhy, hr, m.skin);
  g.beginPath(); g.arc(hhx, hhy - hr * 0.08, hr * 1.1, Math.PI * 1.02, Math.PI * 1.98); g.closePath(); g.fillStyle = shade(m.col, -0.18); g.fill();
  box(g, hhx - hr * 1.14, hhy - hr * 0.36, hr * 2.28, hr * 0.34, shade(m.col, 0.05), hr * 0.16);
  circ(g, hhx, hhy - hr * 1.22, hr * 0.3, CREAM);
  limb(g, hhx + hr * 0.4, hhy + hr * 0.1, hhx + hr * 0.7, hhy + hr * 0.1, hr * 0.12, INK);
  // the shot
  const mxp = rx + U * 0.35, myp = ry - U * 0.012, t3x = cx + T3[2][0] * U, t3y = H * T3[2][1];
  const fl = Math.exp(-Math.pow((u - shot) / 0.03, 2));
  if (fl > 0.02) star(g, mxp, myp, U * 0.09 * fl, `rgba(255,243,200,${fl})`, 6, 0.2, 0.3);
  const tr = seg(u, shot, shot + 0.06), fade = 1 - seg(u, shot + 0.1, shot + 0.5);
  if (tr > 0 && fade > 0) {
    g.strokeStyle = rgba(mixHex(m.col, '#ffffff', 0.35), fade); g.lineWidth = U * 0.008; g.lineCap = 'round';
    g.beginPath(); g.moveTo(mxp, myp); g.lineTo(lerp(mxp, t3x, tr), lerp(myp, t3y, tr)); g.stroke();
  }
  if (hit > 0 && hit < 1) star(g, t3x, t3y, U * (0.03 + 0.09 * hit), rgba('#fff6d8', 1 - hit), 8, 0.4, 0.4);
}

// ---- 15 · the wedding -----------------------------------------------------------------------------------------------------
function wedding(g, W, H, u, tt, m) {
  const U = H, cx = W * 0.5;
  sky(g, W, H, m.cool ? '#f6cdb4' : '#bfdcd6', '#fbeed6');
  for (let i = 0; i * U * 0.22 < W + U; i++) circ(g, i * U * 0.22, H * 0.6, U * 0.15, '#6f9a62');
  box(g, 0, H * 0.58, W, H * 0.42, '#86b06a');
  poly(g, [cx - U * 0.14, H * 0.6, cx + U * 0.14, H * 0.6, cx + U * 0.4, H, cx - U * 0.4, H], '#f3dfc0');
  // the arch
  for (let i = 0; i <= 26; i++) {
    const a = Math.PI + (i / 26) * Math.PI, x = cx + Math.cos(a) * U * 0.4, y = H * 0.52 + Math.sin(a) * U * 0.42;
    circ(g, x, y, U * (0.045 + 0.02 * hash(i)), ['#6f9a62', PINK, '#fff3e0', '#5b8a55', '#e9b0a0'][i % 5]);
  }
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) circ(g, cx + s * U * 0.4, H * (0.55 + i * 0.07), U * 0.04, ['#6f9a62', '#fff3e0', PINK][i % 3]);
  for (const s of [-1, 1]) {
    const a = Math.sin(tt * 5 + s) * 0.35;
    g.save(); g.translate(cx + s * U * 0.07, H * 0.12); g.rotate(a);
    g.beginPath(); g.arc(0, U * 0.05, U * 0.045, Math.PI, TAU); g.lineTo(U * 0.06, U * 0.1); g.lineTo(-U * 0.06, U * 0.1); g.closePath(); g.fillStyle = MUSTARD; g.fill();
    circ(g, 0, U * 0.11, U * 0.014, '#b07a22');
    g.restore();
  }
  const sway = Math.sin(tt * 3) * 0.015;
  person(g, cx + U * 0.13, H * 0.92, U * 0.6, extraPerson(1, { col: '#fff6e6', dress: true, legs: '#fff6e6', face: -1, hat: 'veil', armL: 0.95, armR: 0.95, mouth: 'grin', lean: -sway, hairStyle: 2 }));
  person(g, cx - U * 0.13, H * 0.92, U * 0.62, hero(m, { face: 1, armL: 0.95, armR: 0.95, mouth: 'grin', lean: sway, legs: '#2c2740' }));
  const hb = 1 + Math.sin(tt * 8) * 0.12;
  g.save(); g.translate(cx, H * 0.3); g.scale(hb, hb);
  circ(g, -U * 0.022, 0, U * 0.028, TERRA); circ(g, U * 0.022, 0, U * 0.028, TERRA);
  poly(g, [-U * 0.047, U * 0.012, U * 0.047, U * 0.012, 0, U * 0.065], TERRA);
  g.restore();
  for (let i = 0; i * U * 0.2 < W + U; i++) {
    const x = i * U * 0.2 + hash(i + 80) * U * 0.06, y = H * 1.02;
    const thr = Math.abs(x - cx) > U * 0.2;
    if (thr && i % 2) limb(g, x + U * 0.06, y - U * 0.02, x + U * 0.1, y - U * (0.2 + 0.03 * Math.sin(tt * 9 + i)), U * 0.03, PARTY[i % 4]);
    circ(g, x, y - U * 0.05, U * 0.07, HAIRS[i % HAIRS.length]);
    box(g, x - U * 0.1, y, U * 0.2, U * 0.2, PARTY[(i + 2) % 4], U * 0.05);
  }
  confetti(g, W, H, 0.15 + u * 0.95, 60, ['#fff3e0', PINK, '#e9b0a0', MUSTARD], 500 + m.n);
}

// ---- 16 · the handshake, this morning ---------------------------------------------------------------------------------------
function shake(g, W, H, u, tt, m) {
  const U = H, cx = W * 0.5, wp = m.world || { bg: '#1c2433', fg: '#e8e2d0', accent: '#e0a63a' };
  const dark = luminance(wp.bg) < 0.3;
  sky(g, W, H, dark ? mixHex(wp.bg, wp.accent, 0.12) : mixHex(wp.bg, '#ffffff', 0.2), mixHex(wp.bg, wp.accent, dark ? 0.55 : 0.3), 0.8);
  circ(g, cx, H * 0.56, U * 0.3, rgba(wp.accent, 0.35));
  circ(g, cx, H * 0.56, U * 0.2, rgba(mixHex(wp.accent, '#ffffff', 0.4), 0.6));
  hills(g, W, H, H * 0.66, U * 0.16, mixHex(wp.bg, wp.fg, dark ? 0.22 : 0.5), 0.7);
  hills(g, W, H, H * 0.72, U * 0.08, mixHex(wp.bg, wp.fg, dark ? 0.12 : 0.35), 2.9);
  box(g, 0, H * 0.78, W, H * 0.22, mixHex(wp.bg, '#000000', dark ? 0.25 : 0.45));
  const a = m.other || { col: TERRA, skin: SKINS[1], hair: HAIRS[1] };
  const sh = Math.sin(tt * 15) * 0.09 * seg(u, 0.12, 0.3);
  const who = [[-1, m, 'smile'], [1, a, 'grin']];
  for (const [s, c, mouth] of who) {
    const x = cx + s * U * 0.2;
    limb(g, x + s * U * 0.13, H * 0.36, x - s * U * 0.03, H * 0.82, U * 0.02, '#30303a');
    box(g, x + s * U * 0.065 - U * 0.012, H * 0.5, U * 0.024, U * 0.1, '#1a1c22', U * 0.006);
    const reach = lerp(0.3, 1.05, ease.outBack(seg(u, 0.02, 0.2)));
    person(g, x, H * 0.95, U * 0.68, { col: c.col, skin: c.skin, hair: c.hair, hat: 'beanie', face: -s, armL: s < 0 ? 0.2 : reach + sh, armR: s < 0 ? reach + sh : 0.2, mouth });
  }
  // who is who, in a helpful hand
  const lab = [[-1, m.name, m.col], [1, a.name, a.col]];
  g.textBaseline = 'middle';
  for (const [s, name, col] of lab) {
    if (!name) continue;
    const k = seg(u, 0.1 + (s > 0 ? 0.12 : 0), 0.3 + (s > 0 ? 0.12 : 0));
    if (k <= 0) continue;
    let px = U * 0.085;
    const font = (v) => { g.font = `${v}px 'Marker Felt', 'Bradley Hand', 'Comic Sans MS', cursive`; };
    font(px);
    while (px > U * 0.035 && g.measureText(name).width > W * 0.5 - U * 0.1) font((px *= 0.93));
    g.textAlign = s < 0 ? 'right' : 'left';
    const tx = cx + s * U * 0.07, ty = H * (s < 0 ? 0.09 : 0.18), c2 = rgba(mixHex(col, '#ffffff', 0.25), k);
    g.fillStyle = c2;
    g.fillText(name, tx, ty);
    const ax = cx + s * U * 0.2, ay = H * 0.3;
    g.strokeStyle = c2; g.lineWidth = U * 0.008; g.lineCap = 'round';
    g.beginPath(); g.moveTo(tx + s * U * 0.1, ty + U * 0.045); g.quadraticCurveTo(ax + s * U * 0.03, lerp(ty, ay, 0.5), ax, ay);
    g.moveTo(ax, ay); g.lineTo(ax + U * 0.03, ay - U * 0.025); g.moveTo(ax, ay); g.lineTo(ax - U * 0.025, ay - U * 0.03); g.stroke();
  }
}

export const SCENES = { steps, cake, bike, school, hide, play, fair, cans, scope, camera, fish, car, grad, range, wedding, shake };
export const LOOKS = { SKINS, HAIRS };
