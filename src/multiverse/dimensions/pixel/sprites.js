// The snipers: a pixel puppet built from rectangles (so every pose, run cycle and recoil is
// cheap to animate), outlined in ink, with the rifle drawn as a Bresenham line.
import { PAL } from './palette.js';
import { line } from './px.js';
import { BODY } from './world.js';

const MAXP = 28;
const PX = new Float32Array(MAXP), PY = new Float32Array(MAXP), PW = new Float32Array(MAXP), PH = new Float32Array(MAXP);
const PC = new Array(MAXP).fill('#000');
let n = 0;
const part = (x, y, w, h, c) => { PX[n] = x; PY[n] = y; PW[n] = w; PH[n] = h; PC[n++] = c; };

/** Where a sniper's rifle muzzle is, given the same fields drawSniper takes. Fills `out` {x, y, sx, sy}. */
export function muzzle(o, out) {
  const b = BODY[o.st];
  const fwd = o.st === 2 ? 3 : 1;
  out.sx = o.x + o.face * fwd;
  out.sy = o.y - b.sh;
  out.x = out.sx + Math.cos(o.aim) * 12;
  out.y = out.sy + Math.sin(o.aim) * 12;
  return out;
}
const _m = { x: 0, y: 0, sx: 0, sy: 0 };

/**
 * Draw one sniper. o: {x, y (feet), face (+1/-1), st (0 stand, 1 crouch, 2 prone), run (phase), moving, air, vy,
 * aim (radians, sway included), recoil 0..1, col, colD, t, jet, tint ('' | '#colour' flat fill), decoy}
 */
export function drawSniper(g, o) {
  const ox = Math.round(o.x), oy = Math.round(o.y), f = o.face >= 0 ? 1 : -1;
  const flat = o.tint || null;
  const body = flat || o.col, dark = flat || o.colD, skin = flat || PAL.peach, cheek = flat || PAL.coral, trou = flat || o.colD, steel = flat || PAL.steel, wood = flat || PAL.wood;
  const edge = o.decoy ? PAL.cream : PAL.ink, hi = flat || PAL.cream;
  n = 0;
  const st = o.st;
  const bob = o.moving && !o.air && st === 0 ? (Math.sin(o.run * 2) > 0 ? 1 : 0) : 0;
  const rc = o.recoil > 0 ? Math.round(o.recoil * 2) : 0; // the whole body kicks back
  const breathe = !o.decoy && !o.moving && Math.sin(o.t * 2.3) > 0.45 ? 1 : 0; // a still sniper still breathes: the head rides up a pixel
  const flutter = Math.round(Math.sin(o.t * 9 + 1));
  if (st === 0) {
    const run = o.moving && !o.air, sw = run ? Math.round(Math.sin(o.run) * 3) : 0;
    const lift = run ? Math.round(Math.max(0, Math.cos(o.run)) * 2) : 0, lift2 = run ? Math.round(Math.max(0, -Math.cos(o.run)) * 2) : 0;
    if (o.air) {
      const up = o.vy < 0;
      part(-3, up ? -4 : -5, 3, up ? 3 : 4, trou); part(0, up ? -3 : -4, 3, up ? 2 : 3, trou);
      part(-3, -1, 3, 1, PAL.ink); part(1, up ? -1 : 0, 3, 1, PAL.ink);
    } else {
      part(-3 + sw, -5 - lift, 3, 5, trou); part(0 - sw, -5 - lift2, 3, 5, trou);
      part(-4 + sw, -1 - lift, 4, 1, PAL.ink); part(0 - sw, -1 - lift2, 4, 1, PAL.ink);
    }
    part(-3 - rc, -13 - bob, 7, 8, body); part(-3 - rc, -7 - bob, 7, 1, dark); part(-3 - rc, -13 - bob, 1, 5, hi); // coat, belt, shoulder light
    part(0 - rc, -12 - bob, 1, 4, dark); // bandolier
    part(-7 - rc, -13 - bob, 4, 8, steel); part(-7 - rc, -9 - bob, 4, 1, dark); part(-6 - rc, -5 - bob, 2, 1, PAL.coral); // jetpack
    part(-3 - rc, -14 - bob, 7, 1, dark); // scarf at the neck
    part(-2 - rc, -18 - bob - breathe, 6, 4, skin); part(3 - rc, -17 - bob - breathe, 1, 1, PAL.ink); part(2 - rc, -16 - bob - breathe, 2, 1, cheek); // face, eye, cheek
    part(-3 - rc, -22 - bob - breathe, 7, 4, body); part(-3 - rc, -22 - bob - breathe, 2, 1, hi); part(4 - rc, -19 - bob - breathe, 2, 1, dark); part(-3 - rc, -19 - bob - breathe, 7, 1, dark); // cap, light, brim
    part(-9 - rc + flutter, -14 - bob, 3, 1, dark); part(-11 - rc, -13 - bob + flutter, 2, 1, dark); // scarf tail
  } else if (st === 1) {
    part(-3, -2, 3, 2, trou); part(0, -2, 4, 2, trou);
    part(-3 - rc, -8, 7, 6, body); part(-3 - rc, -3, 7, 1, dark); part(-3 - rc, -8, 1, 3, hi);
    part(-7 - rc, -8, 4, 6, steel); part(-6 - rc, -3, 2, 1, PAL.coral);
    part(-2 - rc, -11, 6, 3, skin); part(3 - rc, -10, 1, 1, PAL.ink); part(2 - rc, -9, 2, 1, cheek);
    part(-3 - rc, -13, 7, 3, body); part(-3 - rc, -13, 2, 1, hi); part(4 - rc, -11, 2, 1, dark); part(-3 - rc, -11, 7, 1, dark);
    part(-9 - rc + flutter, -8, 3, 1, dark);
  } else {
    part(-10, -2, 4, 2, trou); part(-10, -4, 3, 1, steel);
    part(-6 - rc, -4, 9, 4, body); part(-6 - rc, -1, 9, 1, dark); part(-6 - rc, -4, 3, 1, hi);
    part(-7 - rc, -6, 3, 3, steel); part(-6 - rc, -3, 1, 1, PAL.coral);
    part(2 - rc, -5, 5, 4, skin); part(5 - rc, -4, 1, 1, PAL.ink); part(4 - rc, -3, 2, 1, cheek);
    part(1 - rc, -7, 6, 3, body); part(1 - rc, -7, 2, 1, hi); part(6 - rc, -5, 2, 1, dark);
    part(-13 - rc + flutter, -3, 3, 1, dark);
  }
  // outline pass, then fill pass
  g.fillStyle = edge;
  for (let i = 0; i < n; i++) g.fillRect(f > 0 ? ox + PX[i] - 1 : ox - PX[i] - PW[i] - 1, oy + PY[i] - 1, PW[i] + 2, PH[i] + 2);
  for (let i = 0; i < n; i++) { g.fillStyle = PC[i]; g.fillRect(f > 0 ? ox + PX[i] : ox - PX[i] - PW[i], oy + PY[i], PW[i], PH[i]); }

  // jetpack flame
  if (o.jet && !flat) {
    const fl = ((o.t * 40) | 0) % 3, bx = ox - f * 6;
    g.fillStyle = PAL.coral; g.fillRect(bx - 1, oy - 4, 3, 3 + fl);
    g.fillStyle = PAL.peach; g.fillRect(bx, oy - 4, 1, 2 + fl);
    g.fillStyle = PAL.cream; g.fillRect(bx, oy - 4, 1, 1);
  }
  // rifle: a long steel barrel with a wooden stock, scope on top, hands in the sleeve colour
  const m = muzzle(o, _m);
  const k = o.recoil > 0 ? o.recoil * 2.2 : 0;
  const ca = Math.cos(o.aim), sa = Math.sin(o.aim);
  const sx = m.sx - ca * k, sy = m.sy - sa * k;
  const x0 = sx - ca * 5, y0 = sy - sa * 5, x1 = m.x - ca * k + ca * 3, y1 = m.y - sa * k + sa * 3;
  line(g, x0, y0 + 1, x1, y1 + 1, edge, 1); // ink shade under the whole rifle
  line(g, x0, y0 - 1, sx + ca * 2, sy + sa * 2 - 1, edge, 1);
  line(g, x0, y0, sx + ca, sy + sa, wood, 1);
  line(g, sx + ca, sy + sa, x1, y1, steel, 1);
  const bx = sx + ca * 7, by = sy + sa * 7;
  g.fillStyle = flat || PAL.cream; g.fillRect(Math.round(x1), Math.round(y1), 1, 1); // muzzle
  // scope
  const px = Math.round(sx + ca * 3), py = Math.round(sy + sa * 3) - 2;
  g.fillStyle = edge; g.fillRect(px - 1, py - 1, 6, 3);
  g.fillStyle = flat || PAL.night; g.fillRect(px, py, 4, 1);
  g.fillStyle = hi; g.fillRect(px + 3, py, 1, 1);
  // arms
  line(g, sx - ca, sy - sa + 1, sx + ca * 2, sy + sa * 2 + 1, body, 2);
  g.fillStyle = skin; g.fillRect(Math.round(bx), Math.round(by), 2, 2);
  if (st === 2) { // bipod
    const qx = Math.round(sx + ca * 9), qy = Math.round(sy + sa * 9);
    g.fillStyle = edge; g.fillRect(qx - 1, qy + 1, 4, Math.max(1, oy - qy - 1));
    g.fillStyle = steel; g.fillRect(qx, qy + 1, 1, Math.max(1, oy - qy - 1)); g.fillRect(qx + 2, qy + 1, 1, Math.max(1, oy - qy - 1));
  }
}

const _h = { x: 0, y: 0 };
/** A tiny bobbing chevron over the local player's head, in their colour. */
export function drawMarker(g, o, t) {
  const top = BODY[o.st].h + 9;
  const bob = Math.round(Math.sin(t * 5) * 1.2);
  const x = Math.round(o.x), y = Math.round(o.y - top + bob);
  g.fillStyle = PAL.ink;
  g.fillRect(x - 3, y - 1, 7, 2); g.fillRect(x - 2, y + 1, 5, 2); g.fillRect(x - 1, y + 3, 3, 2);
  g.fillStyle = o.col;
  g.fillRect(x - 2, y, 5, 1); g.fillRect(x - 1, y + 1, 3, 1); g.fillRect(x, y + 2, 1, 1);
  return _h;
}
