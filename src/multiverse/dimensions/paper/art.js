// Every picture in FLAT OUT is drawn here with the 2D canvas API: flat fills, thick round-joined ink.
// Nothing is a photograph and nothing has a gradient. (Each function paints into a ready canvas.)
import { INK, PAPER, KRAFT, darker, lighter } from './style.js';

const TAU = Math.PI * 2;
function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function ink(g, fill, lw) {
  if (fill) { g.fillStyle = fill; g.fill(); }
  g.lineWidth = lw;
  g.strokeStyle = INK;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.stroke();
}
function poly(g, pts) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
}
function capsule(g, x1, y1, x2, y2, w, fill, lw) {
  g.lineCap = 'round';
  g.strokeStyle = INK;
  g.lineWidth = w + lw * 2;
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  g.strokeStyle = fill;
  g.lineWidth = w;
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
}

/** The sniper cut-out, 256 x 512 px = 1 x 2 m, feet at the bottom. kind: 'live' (white card) or 'standee' (cardboard). */
export function drawSniper(g, id, dark, kind) {
  const K = kind === 'standee';
  const jacket = K ? '#dcb27b' : PAPER, sleeve = K ? '#cfa46b' : '#ebe3cf', legs = K ? '#bf9159' : '#2e3752';
  const skin = K ? '#e4c08f' : '#f8e0c2', wood = K ? '#a8733b' : '#c98b4a', metal = K ? '#6b4f33' : '#34313f';
  g.clearRect(0, 0, 256, 512);
  // legs and shoes
  rr(g, 74, 326, 52, 154, 8); ink(g, legs, 8);
  rr(g, 130, 326, 52, 154, 8); ink(g, legs, 8);
  rr(g, 64, 466, 64, 34, 12); ink(g, INK, 6);
  rr(g, 128, 466, 64, 34, 12); ink(g, INK, 6);
  g.fillStyle = PAPER; g.fillRect(70, 490, 52, 5); g.fillRect(134, 490, 52, 5);
  // torso with the identity band across the chest
  g.save();
  rr(g, 46, 182, 164, 160, 24); g.clip();
  g.fillStyle = jacket; g.fillRect(40, 176, 176, 176);
  g.fillStyle = id; g.fillRect(40, 232, 176, 30);
  g.fillStyle = dark; g.fillRect(40, 262, 176, 5);
  g.fillStyle = INK; g.fillRect(40, 318, 176, 22);
  g.restore();
  rr(g, 46, 182, 164, 160, 24); ink(g, null, 8);
  g.fillStyle = '#e9c24a'; g.fillRect(118, 320, 20, 18); g.lineWidth = 4; g.strokeStyle = INK; g.strokeRect(118, 320, 20, 18);
  poly(g, [104, 182, 152, 182, 128, 218]); ink(g, dark, 5);
  rr(g, 66, 282, 38, 28, 5); ink(g, null, 4);
  // rifle across the chest: wooden stock, barrel, scope with a lens
  g.save();
  g.translate(128, 278);
  g.rotate(-0.42);
  rr(g, -128, -13, 74, 28, 8); ink(g, wood, 7);
  rr(g, -62, -8, 190, 16, 5); ink(g, metal, 7);
  rr(g, 112, -12, 22, 24, 4); ink(g, INK, 5);
  rr(g, -14, -34, 76, 20, 8); ink(g, metal, 6);
  g.beginPath(); g.arc(62, -24, 14, 0, TAU); ink(g, '#8ae6f5', 5);
  g.fillStyle = '#ffffff'; g.fillRect(56, -32, 5, 5);
  g.restore();
  // arms and hands over the rifle
  capsule(g, 62, 212, 94, 292, 38, sleeve, 6);
  capsule(g, 196, 214, 186, 250, 38, sleeve, 6);
  g.fillStyle = id; g.beginPath(); g.arc(94, 292, 25, 0, TAU); ink(g, id, 5);
  g.beginPath(); g.arc(186, 250, 25, 0, TAU); ink(g, id, 5);
  g.beginPath(); g.arc(99, 304, 17, 0, TAU); ink(g, skin, 5);
  g.beginPath(); g.arc(190, 262, 17, 0, TAU); ink(g, skin, 5);
  // head
  g.beginPath(); g.arc(77, 128, 13, 0, TAU); ink(g, skin, 5);
  g.beginPath(); g.arc(179, 128, 13, 0, TAU); ink(g, skin, 5);
  g.beginPath(); g.arc(128, 124, 52, 0, TAU); ink(g, skin, 8);
  g.fillStyle = INK;
  g.beginPath(); g.ellipse(110, 128, 5.5, 7, 0, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(146, 128, 5.5, 7, 0, 0, TAU); g.fill();
  g.lineWidth = 5; g.strokeStyle = INK; g.lineCap = 'round';
  g.beginPath(); g.arc(128, 138, 15, 0.25, Math.PI - 0.25); g.stroke();
  g.fillStyle = K ? '#d19a64' : '#f4a99a';
  g.beginPath(); g.arc(98, 144, 7, 0, TAU); g.fill();
  g.beginPath(); g.arc(158, 144, 7, 0, TAU); g.fill();
  // a folded-paper boat hat in the identity colour
  poly(g, [60, 98, 196, 98, 178, 62, 78, 62]); ink(g, id, 8);
  poly(g, [78, 62, 178, 62, 128, 8]); ink(g, id, 8);
  poly(g, [128, 8, 178, 62, 128, 62]); ink(g, dark, 6);
  g.lineWidth = 4; g.strokeStyle = INK; g.beginPath(); g.moveTo(66, 84); g.lineTo(190, 84); g.stroke();
  if (K) { // tape across the shoulder of a cardboard cut-out
    g.save(); g.translate(128, 196); g.rotate(-0.12);
    g.fillStyle = 'rgba(247,241,227,0.9)'; g.fillRect(-52, -9, 104, 18); g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(-52, -9, 104, 18);
    g.restore();
  }
}

/** Printed cardboard / poster sheets; w, h in metres sets the aspect (canvas px derived by the caller). */
export function drawSheet(g, W, H, kind, id) {
  const lw = Math.max(5, H * 0.035);
  g.clearRect(0, 0, W, H);
  const base = { up: KRAFT, fragile: '#f1e8d2', hazard: '#d9a766', poster: '#2f6f8f', crate: '#c48f55' }[kind] || KRAFT;
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  g.fillStyle = darker(base, 0.09);
  for (let x = W * 0.06; x < W; x += W * 0.07) g.fillRect(x, 0, W * 0.012, H); // corrugation
  if (kind === 'up') {
    g.fillStyle = INK;
    for (const cx of [0.3, 0.7]) {
      const x = W * cx, y = H * 0.28, s = Math.min(W * 0.14, H * 0.2);
      poly(g, [x, y, x + s, y + s * 1.1, x + s * 0.4, y + s * 1.1, x + s * 0.4, y + s * 2.2, x - s * 0.4, y + s * 2.2, x - s * 0.4, y + s * 1.1, x - s, y + s * 1.1]); g.fill();
    }
    g.font = `800 ${Math.round(H * 0.11)}px Impact, "Arial Black", sans-serif`;
    g.textAlign = 'center'; g.fillText('THIS WAY UP', W / 2, H * 0.9);
  } else if (kind === 'fragile') {
    g.fillStyle = '#d6352f'; g.fillRect(0, H * 0.36, W, H * 0.28);
    g.fillStyle = PAPER; g.font = `800 ${Math.round(H * 0.2)}px Impact, "Arial Black", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('FRAGILE', W / 2, H * 0.5);
    g.strokeStyle = INK; g.lineWidth = lw * 0.6; g.fillStyle = PAPER; // a wine glass
    const gx = W / 2, gy = H * 0.12, gs = H * 0.09;
    g.beginPath(); g.moveTo(gx - gs, gy); g.lineTo(gx + gs, gy); g.lineTo(gx + gs * 0.15, gy + gs * 1.4); g.lineTo(gx + gs * 0.15, gy + gs * 2.3); g.moveTo(gx - gs * 0.15, gy + gs * 1.4); g.lineTo(gx - gs * 0.15, gy + gs * 2.3); g.moveTo(gx - gs * 0.7, gy + gs * 2.4); g.lineTo(gx + gs * 0.7, gy + gs * 2.4); g.moveTo(gx - gs, gy); g.lineTo(gx - gs * 0.15, gy + gs * 1.4); g.stroke();
    g.fillStyle = INK; g.textBaseline = 'alphabetic'; g.font = `700 ${Math.round(H * 0.075)}px Menlo, "Courier New", monospace`; g.fillText('HANDLE WITH CARE', W / 2, H * 0.9);
  } else if (kind === 'hazard') {
    const by = H * 0.62, bh = H * 0.24;
    g.save(); g.beginPath(); g.rect(0, by, W, bh); g.clip();
    g.fillStyle = '#f2c230'; g.fillRect(0, by, W, bh);
    g.fillStyle = INK;
    for (let x = -bh; x < W + bh; x += bh * 0.9) { poly(g, [x, by + bh, x + bh * 0.45, by + bh, x + bh * 0.45 + bh, by, x + bh, by]); g.fill(); }
    g.restore();
    g.fillStyle = INK; g.font = `800 ${Math.round(H * 0.14)}px Impact, "Arial Black", sans-serif`; g.textAlign = 'center'; g.fillText('KEEP CLEAR', W / 2, H * 0.4);
    g.beginPath(); g.arc(W * 0.16, H * 0.2, H * 0.07, 0, TAU); g.fill();
  } else if (kind === 'poster') {
    g.fillStyle = '#ffd36a'; g.beginPath(); g.arc(W * 0.5, H * 0.48, H * 0.26, 0, TAU); ink(g, '#ffd36a', lw * 0.5);
    g.fillStyle = '#e7f3f6';
    for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(W * (0.12 + i * 0.26), H * 0.8, W * 0.17, H * 0.07, 0, Math.PI, TAU); ink(g, '#e7f3f6', lw * 0.35); }
    g.fillStyle = PAPER; g.font = `800 ${Math.round(H * 0.12)}px Impact, "Arial Black", sans-serif`; g.textAlign = 'center'; g.fillText('SAIL ON', W / 2, H * 0.13);
  } else { // plain crate with a stencil
    g.fillStyle = INK; g.font = `800 ${Math.round(H * 0.2)}px Impact, "Arial Black", sans-serif`; g.textAlign = 'center'; g.fillText('PAPERPORT', W / 2, H * 0.58);
    g.fillRect(W * 0.1, H * 0.7, W * 0.8, H * 0.05);
  }
  if (id) { g.fillStyle = id; g.fillRect(0, 0, W, H * 0.07); }
  g.strokeStyle = INK; g.lineWidth = lw; g.strokeRect(lw / 2, lw / 2, W - lw, H - lw);
  g.fillStyle = 'rgba(247,241,227,0.88)'; // tape tabs on the corners
  for (const [x, y, r] of [[0.02, 0.04, -0.6], [0.98, 0.04, 0.6], [0.02, 0.96, 0.6], [0.98, 0.96, -0.6]]) {
    g.save(); g.translate(W * x, H * y); g.rotate(r); g.fillRect(-W * 0.045, -H * 0.03, W * 0.09, H * 0.06); g.strokeStyle = INK; g.lineWidth = lw * 0.35; g.strokeRect(-W * 0.045, -H * 0.03, W * 0.09, H * 0.06); g.restore();
  }
}

/** A friendly dockhand cut-out: square head, hard hat, thumbs up. 256 x 512. */
export function drawMascot(g) {
  g.clearRect(0, 0, 256, 512);
  rr(g, 80, 320, 44, 170, 8); ink(g, '#38507a', 8);
  rr(g, 132, 320, 44, 170, 8); ink(g, '#38507a', 8);
  rr(g, 68, 464, 58, 36, 12); ink(g, INK, 6);
  rr(g, 130, 464, 58, 36, 12); ink(g, INK, 6);
  rr(g, 52, 178, 152, 158, 22); ink(g, '#f08a3c', 8);
  g.fillStyle = '#ffd96a'; g.fillRect(64, 250, 128, 18); g.fillRect(64, 290, 128, 18);
  rr(g, 52, 178, 152, 158, 22); ink(g, null, 8);
  capsule(g, 56, 206, 28, 290, 36, '#ececf2', 6);
  capsule(g, 200, 206, 226, 142, 36, '#ececf2', 6);
  g.beginPath(); g.arc(26, 300, 20, 0, TAU); ink(g, '#f4cba2', 5);
  g.beginPath(); g.arc(228, 130, 22, 0, TAU); ink(g, '#f4cba2', 5);
  g.lineWidth = 6; g.strokeStyle = INK; g.beginPath(); g.moveTo(228, 112); g.lineTo(228, 94); g.stroke();
  rr(g, 74, 62, 108, 106, 18); ink(g, '#f4cba2', 8);
  g.fillStyle = INK;
  g.beginPath(); g.arc(106, 110, 7, 0, TAU); g.fill();
  g.beginPath(); g.arc(150, 110, 7, 0, TAU); g.fill();
  g.lineWidth = 6; g.strokeStyle = INK; g.lineCap = 'round'; g.beginPath(); g.arc(128, 124, 22, 0.15, Math.PI - 0.15); g.stroke();
  poly(g, [62, 70, 194, 70, 182, 30, 76, 30]); ink(g, '#ffd23a', 8);
  rr(g, 100, 8, 56, 30, 8); ink(g, '#ffd23a', 7);
  g.fillStyle = INK; g.fillRect(70, 62, 116, 8);
}

/** The slanted dark sign over each concourse door: stencil lettering in yellow. 512 x 160. */
export function drawBerthSign(g, line1, line2) {
  g.fillStyle = INK; g.fillRect(0, 0, 512, 160);
  g.fillStyle = '#f2c230';
  g.font = '800 82px Impact, "Arial Black", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillText(line1, 30, 98);
  g.font = '700 34px Menlo, "Courier New", monospace'; g.fillText(line2, 32, 140);
  g.fillRect(430, 40, 56, 14); g.fillRect(430, 66, 56, 14);
  g.strokeStyle = '#f2c230'; g.lineWidth = 6; g.strokeRect(6, 6, 500, 148);
}

export function drawCloud(g, W, H) {
  g.clearRect(0, 0, W, H);
  const blobs = [[0.22, 0.62, 0.2], [0.4, 0.42, 0.26], [0.62, 0.5, 0.24], [0.8, 0.66, 0.18], [0.5, 0.7, 0.2]];
  g.fillStyle = INK;
  for (const [x, y, r] of blobs) { g.beginPath(); g.arc(W * x, H * y, H * r + 7, 0, TAU); g.fill(); }
  g.fillStyle = '#fbf8ef';
  for (const [x, y, r] of blobs) { g.beginPath(); g.arc(W * x, H * y, H * r, 0, TAU); g.fill(); }
}

export function drawMark(g, S) { // a bullet's ink splat on a wall
  g.clearRect(0, 0, S, S);
  g.fillStyle = INK; g.strokeStyle = INK; g.lineJoin = 'round';
  g.beginPath();
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, r = S * (i % 2 ? 0.26 : 0.46) * (0.82 + 0.18 * Math.sin(i * 5.3)); g.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r); }
  g.closePath(); g.fill();
  g.fillStyle = '#f7f1e3'; g.beginPath(); g.arc(S / 2, S / 2, S * 0.1, 0, TAU); g.fill();
}

export function drawFlash(g, S) { // a muzzle flash: a hard-edged starburst
  g.clearRect(0, 0, S, S);
  g.beginPath();
  for (let i = 0; i < 20; i++) { const a = (i / 20) * TAU, r = S * (i % 2 ? 0.2 : 0.47); g.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r); }
  g.closePath(); ink(g, '#ffe27a', S * 0.045);
  g.beginPath(); g.arc(S / 2, S / 2, S * 0.17, 0, TAU); ink(g, '#fffdf0', S * 0.03);
}

export { rr, ink, poly, lighter };
