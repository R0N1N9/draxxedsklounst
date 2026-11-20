// The two snipers, drawn in ink: a black raincoat, a white face, one paper umbrella strapped to the back
// and a scarf, both in the sniper's identity colour. Everything else about them is line.
//
// The figure is built in "figure units" (feet at 0, up is negative, facing +x, mirrored for facing left)
// and drawn through a transform of S px per unit. Silhouette first (a white keyline, then ink), then the
// gouache highlights, so the cast stays readable on any background.
import { C, taperInto } from './ink.js';
import { FIG } from './world.js';

const TAU = Math.PI * 2;
const HALO = 2.6; // keyline width on screen, px
export const SC = 1.15; // drawn over life size: two snipers across a whole street must still read on a tablet

// scratch points for tapered limbs: no allocation per frame
const T = new Float32Array(16);

function limb(g, n, w0, w1) {
  taperInto(g, T, n, w0, w1);
}

// The paper umbrella, open, canopy centred on the origin (ferrule at the top).
export function drawUmbrella(g, col, hw) {
  g.beginPath();
  g.moveTo(-1.75, -0.25);
  g.quadraticCurveTo(-1.5, -1.75, 0, -1.95);
  g.quadraticCurveTo(1.5, -1.75, 1.75, -0.25);
  g.arc(1.17, -0.25, 0.58, 0, Math.PI, false); // scalloped rim
  g.arc(0, -0.25, 0.58, 0, Math.PI, false);
  g.arc(-1.17, -0.25, 0.58, 0, Math.PI, false);
  g.closePath();
  g.strokeStyle = C.white;
  g.lineWidth = hw;
  g.stroke();
  g.fillStyle = col;
  g.fill();
  g.strokeStyle = C.ink;
  g.lineWidth = 0.09;
  g.stroke();
  g.lineWidth = 0.05;
  g.beginPath();
  for (const k of [-1.05, -0.4, 0.4, 1.05]) { g.moveTo(0, -1.95); g.quadraticCurveTo(k * 0.55, -1.2, k * 1.35, -0.28); }
  g.stroke();
  g.strokeStyle = C.white; // the gouache highlight
  g.lineWidth = 0.1;
  g.beginPath();
  g.moveTo(-1.05, -1.25);
  g.quadraticCurveTo(-0.7, -1.62, -0.15, -1.7);
  g.stroke();
  g.lineWidth = 0.05;
  g.beginPath();
  g.moveTo(-0.5, -1.4); g.lineTo(-0.38, -1.52);
  g.stroke();
  g.fillStyle = C.ink;
  g.fillRect(-0.04, -2.2, 0.08, 0.3);
}

// o: x, z, sx, sy (screen position of the feet), S, f (+1/-1), a (screen aim angle), ph (walk phase), spd (0..1),
//    focus (0..1), recoil (0..1), stun, col, t (clock), wind (-1..1), umb (draw the umbrella), ghost, sil (flat silhouette)
export function drawSniper(g, o) {
  const S = o.S * SC, f = o.f, t = o.t;
  g.save();
  g.translate(o.sx, o.sy);
  g.scale(f * S, S);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const hw = (HALO * 2) / S, ghost = o.ghost, sil = o.sil;
  const mv = o.spd, ph = o.ph, bob = mv > 0.05 ? Math.abs(Math.sin(ph)) * 0.09 * mv : Math.sin(t * 1.9 + o.x) * 0.018;
  const lean = o.focus * 0.1 - o.recoil * 0.1 + mv * 0.05, crouch = o.focus * 0.16 + (o.stun ? 0.25 : 0);
  const hipY = -1.32 + crouch * 0.5, shY = -2.4 + crouch - bob, headY = -2.98 + crouch * 1.1 - bob;
  const wind = o.wind;

  const dark = ghost ? 'rgba(22,18,15,0.32)' : C.ink;
  const col = o.col;

  // ---- umbrella strapped on the back (behind everything) ----
  if (o.umb && !ghost) {
    g.save();
    g.translate(-0.28 - lean * 0.6, shY - 0.15);
    g.rotate(-0.34 - lean * 0.9 + wind * 0.12 + Math.sin(t * 2.3 + o.z) * 0.015);
    drawUmbrella(g, col, hw);
    g.restore();
  }

  // ---- scarf: a ribbon of identity colour that tells you how fast you are going and where the wind is ----
  if (!ghost) {
    const n = 7, flow = 0.55 + mv * 0.9 + Math.abs(wind) * 0.7 - o.focus * 0.4;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), k = u * 3.1 * flow;
      T[i * 2] = -0.1 - k * 0.9 - (wind * -0.5) * u;
      T[i * 2 + 1] = shY - 0.1 + u * 0.35 + Math.sin(t * (7 + mv * 5) - u * 5 + o.z) * 0.14 * u * (0.5 + mv + Math.abs(wind));
    }
    g.beginPath();
    limb(g, n, 0.34, 0.12);
    g.strokeStyle = C.white;
    g.lineWidth = hw * 0.8;
    g.stroke();
    g.fillStyle = col;
    g.fill();
    g.strokeStyle = C.ink;
    g.lineWidth = 0.06;
    g.stroke();
  }

  // ---- body silhouette: legs, boots, coat, collar, hair ----
  const swing = mv > 0.05 ? Math.sin(ph) * (0.62 * mv + 0.12) : 0, swing2 = -swing;
  const stance = 0.22 + o.focus * 0.12;
  g.beginPath();
  for (let leg = 0; leg < 2; leg++) {
    const sw = leg ? swing2 : swing, lift = mv > 0.05 ? Math.max(0, Math.cos(ph + (leg ? Math.PI : 0))) * 0.3 * mv : 0;
    const fx = (leg ? -stance : stance) + sw, fy = -lift;
    T[0] = (leg ? -0.1 : 0.1) + lean * 0.4; T[1] = hipY;
    T[2] = (T[0] + fx) / 2 + 0.1 + mv * 0.1; T[3] = (hipY + fy) / 2 - 0.02;
    T[4] = fx; T[5] = fy - 0.14;
    limb(g, 3, 0.62, 0.42);
    g.moveTo(fx - 0.28, fy);
    g.quadraticCurveTo(fx - 0.2, fy - 0.38, fx + 0.1, fy - 0.36);
    g.quadraticCurveTo(fx + 0.5, fy - 0.3, fx + 0.62, fy);
    g.closePath();
  }
  // coat: a long, belted raincoat whose hem streams backwards as it runs
  const tail = 0.15 + mv * 0.55 + Math.abs(wind) * 0.4, fl = Math.sin(t * 9 + o.x) * 0.06 * (0.4 + mv);
  g.moveTo(-0.66 + lean, shY - 0.02);
  g.quadraticCurveTo(-0.2, shY - 0.2, 0.6 + lean, shY);
  g.quadraticCurveTo(0.8 + lean * 0.4, (shY + hipY) / 2, 0.78, -0.82);
  g.lineTo(0.1, -0.74 + fl);
  g.lineTo(-0.78 - tail, -0.7 - fl);
  g.quadraticCurveTo(-0.96 - tail * 0.5, hipY, -0.66 + lean * 0.6, hipY - 0.5);
  g.closePath();
  g.moveTo(0.58 + lean, shY + 0.02);
  g.ellipse(0.05 + lean, shY - 0.12, 0.52, 0.3, 0, 0, TAU); // high collar
  g.moveTo(0.1 + lean + 0.48, headY);
  g.arc(0.1 + lean, headY, 0.48, 0, TAU); // hair covers the whole head; the face is painted over it
  g.strokeStyle = C.white;
  g.lineWidth = hw;
  g.stroke();
  g.fillStyle = dark;
  g.fill();

  // ---- gouache highlights on the coat ----
  if (!ghost && !sil) {
    g.strokeStyle = C.white;
    g.lineCap = 'round';
    g.lineWidth = 0.075;
    g.beginPath();
    g.moveTo(-0.58 + lean, shY + 0.25);
    g.quadraticCurveTo(-0.7, (shY + hipY) / 2, -0.76 - tail * 0.6, -0.9);
    g.stroke();
    g.lineWidth = 0.045;
    g.beginPath();
    g.moveTo(0.22, shY + 0.6); g.lineTo(0.32, -0.95);
    g.moveTo(-0.15, hipY + 0.08); g.lineTo(0.62, hipY + 0.14); // belt
    g.stroke();
  }

  // ---- face ----
  const hx = 0.12 + lean, hr = 0.38;
  if (!sil || ghost) {
    g.beginPath();
    g.arc(hx + 0.1, headY + 0.06, hr, 0, TAU);
    g.fillStyle = ghost ? 'rgba(255,253,246,0.5)' : C.paper;
    g.fill();
  }
  if (!ghost && !sil) {
    g.fillStyle = C.ink;
    g.beginPath(); // fringe
    g.moveTo(hx - 0.36, headY + 0.05);
    g.quadraticCurveTo(hx - 0.2, headY - 0.52, hx + 0.3, headY - 0.4);
    g.lineTo(hx + 0.52, headY - 0.1);
    g.lineTo(hx + 0.3, headY - 0.18);
    g.lineTo(hx + 0.38, headY + 0.0);
    g.lineTo(hx + 0.18, headY - 0.14);
    g.lineTo(hx + 0.08, headY + 0.1);
    g.lineTo(hx - 0.1, headY - 0.08);
    g.closePath();
    g.fill();
    // the eye narrows as concentration rises; a white glint keeps it alive
    const ey = headY + 0.17, narrow = 0.1 - o.focus * 0.05;
    g.strokeStyle = C.ink;
    g.lineWidth = 0.075 + o.focus * 0.05;
    g.beginPath();
    g.moveTo(hx + 0.2, ey + 0.02);
    g.quadraticCurveTo(hx + 0.36, ey - narrow, hx + 0.54, ey - 0.02);
    g.stroke();
    g.fillStyle = C.white;
    g.beginPath();
    g.arc(hx + 0.4, ey + 0.01, 0.025, 0, TAU);
    g.fill();
    g.fillStyle = C.ink;
    g.fillRect(hx + 0.28, ey + 0.2, 0.2, 0.035);
    if (o.stun) { // dizzy: spirals
      g.strokeStyle = C.ink;
      g.lineWidth = 0.05;
      g.beginPath();
      for (let k = 0; k < 3; k++) { const a = t * 6 + k * 2.1; g.moveTo(hx + Math.cos(a) * 0.7, headY - 0.5 + Math.sin(a) * 0.18); g.lineTo(hx + Math.cos(a) * 0.7 + 0.14, headY - 0.5 + Math.sin(a) * 0.18 + 0.1); }
      g.stroke();
    }
  }

  // ---- rifle and arms (in the screen aim direction, so the barrel lines up with the aim line) ----
  const aL = f > 0 ? o.a : Math.PI - o.a, kick = o.recoil * 0.42, down = o.stun ? 0.7 : 0;
  g.save();
  g.translate(0.18 + lean, shY + 0.34);
  g.rotate(aL + down - o.recoil * 0.1 * f * 0);
  g.translate(-kick, 0);
  g.beginPath();
  // arms first: elbow below the barrel
  T[0] = 0; T[1] = 0.02; T[2] = 0.45; T[3] = 0.48; T[4] = 1.15; T[5] = 0.14;
  limb(g, 3, 0.42, 0.3);
  T[0] = -0.1; T[1] = -0.06; T[2] = -0.55; T[3] = 0.36; T[4] = -0.62; T[5] = 0.1;
  limb(g, 3, 0.4, 0.3);
  // stock, body, barrel
  g.moveTo(-1.0, -0.22); g.lineTo(-0.1, -0.3); g.lineTo(2.55, -0.2); g.lineTo(2.55, -0.04); g.lineTo(0.3, 0.06); g.lineTo(-0.2, 0.3); g.lineTo(-1.0, 0.34); g.closePath();
  g.moveTo(2.5, -0.27); g.lineTo(2.95, -0.27); g.lineTo(2.95, -0.0); g.lineTo(2.5, -0.0); g.closePath(); // muzzle brake
  g.moveTo(0.3, -0.34); g.lineTo(1.6, -0.34); g.lineTo(1.6, -0.62); g.lineTo(0.3, -0.62); g.closePath(); // scope
  g.moveTo(0.2, 0.05); g.lineTo(0.7, 0.05); g.lineTo(0.66, 0.5); g.lineTo(0.28, 0.5); g.closePath(); // magazine
  if (!sil) {
    g.strokeStyle = C.white;
    g.lineWidth = hw * 0.75;
    g.stroke();
  }
  g.fillStyle = dark;
  g.fill();
  if (!ghost && !sil) {
    g.strokeStyle = C.white;
    g.lineWidth = 0.05;
    g.beginPath();
    g.moveTo(-0.85, -0.14); g.lineTo(2.4, -0.15);
    g.moveTo(0.4, -0.5); g.lineTo(1.4, -0.5);
    g.stroke();
    g.fillStyle = C.white;
    g.beginPath(); g.arc(1.55, -0.48, 0.07, 0, TAU); g.arc(0.35, -0.48, 0.05, 0, TAU); g.fill();
  }
  g.restore();

  // ---- the concentration tell: a ring of short ink ticks that the opponent can see too ----
  if (o.focus > 0.2 && !ghost && !sil) {
    g.strokeStyle = C.ink;
    g.lineWidth = 0.06;
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU + t * 0.6, r0 = 1.9 + Math.sin(t * 9 + k) * 0.12, r1 = r0 + 0.35 + o.focus * 0.4;
      g.moveTo(Math.cos(a) * r0, -1.9 + Math.sin(a) * r0 * 1.15);
      g.lineTo(Math.cos(a) * r1, -1.9 + Math.sin(a) * r1 * 1.15);
    }
    g.globalAlpha = Math.min(1, o.focus);
    g.stroke();
    g.globalAlpha = 1;
  }
  g.restore();
}

// A ground shadow: a flat ellipse of dark tone with a white hole of light under the lamp.
export function drawShadow(g, sx, sy, S, k = 1) {
  g.save();
  g.translate(sx, sy);
  g.scale(1, 0.34);
  g.beginPath();
  g.arc(0, 0, S * 1.15 * k, 0, TAU);
  g.fillStyle = 'rgba(22,18,15,0.55)';
  g.fill();
  g.restore();
}

export const FIG_H = FIG;

// The victim of the splash page: a silhouette hurled backwards by the shot, arms flung, coat and scarf whipping away.
// Drawn in its own flight pose (not the standing figure): (cx, cy) = the chest, where the shot landed, S px per figure
// unit, dir = +1 when the blow came from the left (the body flies to the right), rot = a little extra tilt.
// Every limb is its own path, so the white keyline never cuts holes where two shapes overlap.
const flingParts = [];
export function drawFlung(g, cx, cy, S, dir, col, rot, t) {
  g.save();
  g.translate(cx, cy);
  g.rotate((rot - 0.5) * dir * 0.5); // 0.5 is the pose as drawn; more or less tips it
  g.scale(dir * S, S);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const hw = (HALO * 3.4) / S, flap = Math.sin(t * 12) * 0.1;
  const parts = flingParts;
  parts.length = 0;
  const add = (fn) => { const p = new Path2D(); fn(p); parts.push(p); };
  const limb = (a, w0, w1) => add((p) => { for (let i = 0; i < a.length; i++) T[i] = a[i]; taperInto(p, T, a.length >> 1, w0, w1); });
  // scarf streaming back toward the shooter, in the identity colour (drawn first, under the body)
  for (let i = 0; i < 8; i++) { const u = i / 7; T[i * 2] = 0.5 - u * 3.2; T[i * 2 + 1] = -0.5 - u * 0.5 + Math.sin(t * 9 - u * 5) * 0.28 * u; }
  const sc = new Path2D();
  taperInto(sc, T, 8, 0.5, 0.12);
  g.strokeStyle = C.white; g.lineWidth = hw; g.stroke(sc);
  g.fillStyle = col; g.fill(sc);
  g.strokeStyle = C.ink; g.lineWidth = 0.07; g.stroke(sc);
  // legs: one kicked out, one trailing; boots
  limb([-0.65, 0.7, -0.95, 1.4, -1.85, 1.5], 0.66, 0.46);
  limb([-0.45, 0.75, -0.3, 1.45, -0.7, 2.15], 0.66, 0.46);
  add((p) => { p.moveTo(-1.8, 1.2); p.lineTo(-2.25, 1.5); p.lineTo(-2.0, 1.85); p.lineTo(-1.5, 1.8); p.closePath(); });
  add((p) => { p.moveTo(-0.55, 2.0); p.lineTo(-0.95, 2.5); p.lineTo(-0.5, 2.7); p.lineTo(-0.15, 2.3); p.closePath(); });
  // arms flung wide
  limb([0.15, -0.35, 0.55, -1.0, 0.0, -1.7 + flap], 0.46, 0.32);
  limb([0.25, 0.05, 1.0, 0.25, 1.75, -0.05 + flap], 0.46, 0.32);
  add((p) => { p.moveTo(0.22, -1.7 + flap); p.arc(-0.05, -1.75 + flap, 0.23, 0, TAU); });
  add((p) => { p.moveTo(1.98, -0.05 + flap); p.arc(1.8, -0.08 + flap, 0.23, 0, TAU); });
  // the raincoat: a long belted shape along the torso, its tails flaring back
  limb([0.62, -0.5, 0.0, 0.05, -0.75, 0.7], 0.84, 1.0);
  add((p) => { p.moveTo(-0.45, 0.35); p.lineTo(-1.1, 0.55 + flap); p.lineTo(-1.75, 1.0); p.lineTo(-1.1, 1.0); p.lineTo(-0.5, 1.15); p.lineTo(-0.1, 0.85); p.closePath(); });
  add((p) => { p.ellipse(0.5, -0.5, 0.5, 0.27, -0.75, 0, TAU); }); // the high collar
  // the head, thrown back, with hair whipping off it
  add((p) => { p.moveTo(1.4, -0.85); p.arc(0.98, -0.85, 0.44, 0, TAU); });
  add((p) => { p.moveTo(0.75, -1.15); p.lineTo(0.15, -1.55); p.lineTo(0.62, -0.9); p.lineTo(0.0, -1.0); p.lineTo(0.62, -0.7); p.closePath(); });
  g.strokeStyle = C.white; g.lineWidth = hw;
  for (const p of parts) g.stroke(p);
  g.fillStyle = C.ink;
  for (const p of parts) g.fill(p);
  // gouache keeps the silhouette from going to mud: the belt, the edge of the coat, a glint on the hair
  g.strokeStyle = C.white; g.lineWidth = 0.07;
  g.beginPath();
  g.moveTo(-0.35, 0.18); g.lineTo(-0.05, 0.62);
  g.moveTo(0.78, -0.2); g.quadraticCurveTo(0.2, 0.15, -0.55, 0.85);
  g.moveTo(-1.0, 0.7 + flap); g.lineTo(-1.5, 0.98);
  g.moveTo(0.82, -1.15); g.quadraticCurveTo(1.0, -1.3, 1.2, -1.15);
  g.stroke();
  // the rifle spinning away on its own
  g.save();
  g.translate(2.0, -3.1);
  g.rotate(-0.5 - t * 3);
  const rf = new Path2D();
  rf.rect(-1.3, -0.14, 2.7, 0.28); rf.rect(0.2, -0.36, 0.9, 0.2);
  g.strokeStyle = C.white; g.lineWidth = hw * 0.7; g.stroke(rf);
  g.fillStyle = C.ink; g.fill(rf);
  g.restore();
  g.restore();
}
