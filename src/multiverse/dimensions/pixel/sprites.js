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
  const body = flat || o.col, dark = flat || o.colD, skin = flat || PAL.peach, trou = flat || PAL.night, steel = flat || PAL.steel, wood = flat || PAL.wood;
  const edge = o.decoy ? PAL.cream : PAL.ink;
  n = 0;
  const st = o.st;
  const bob = o.moving && !o.air && st === 0 ? (Math.sin(o.run * 2) > 0 ? 1 : 0) : 0;
  const rc = o.recoil > 0 ? Math.round(o.recoil * 2) : 0; // the whole body kicks back
  const flutter = Math.round(Math.sin(o.t * 9 + 1) * 1);
  if (st === 0) {
    const sw = o.moving && !o.air ? Math.sin(o.run) * 3 : 0, lift = o.moving && !o.air ? Math.max(0, Math.cos(o.run)) * 2 : 0, lift2 = o.moving && !o.air ? Math.max(0, -Math.cos(o.run)) * 2 : 0;
    if (o.air) {
      const up = o.vy < 0;
      part(-3, -5 + (up ? 1 : 0), 3, up ? 4 : 5, trou); part(0, -4 + (up ? 0 : 1), 3, up ? 3 : 4, trou);
      part(-3, -1, 3, 1, PAL.ink); part(0, -1, 3, 1, PAL.ink);
    } else {
      part(-3 + Math.round(sw), -5 - Math.round(lift), 3, 5, trou); part(0 - Math.round(sw), -5 - Math.round(lift2), 3, 5, trou);
      part(-3 + Math.round(sw), -1 - Math.round(lift), 3, 1, PAL.ink); part(0 - Math.round(sw), -1 - Math.round(lift2), 3, 1, PAL.ink);
    }
    part(-3 - rc, -11 - bob, 6, 6, body); part(-3 - rc, -6 - bob, 6, 1, dark); // coat, belt
    part(-6 - rc, -11 - bob, 3, 7, steel); part(-6 - rc, -7 - bob, 3, 1, dark); // jetpack tank
    part(-2 - rc, -14 - bob, 5, 3, skin); part(1 - rc, -13 - bob, 1, 1, PAL.ink); // face, eye
    part(-3 - rc, -17 - bob, 6, 3, body); part(3 - rc, -15 - bob, 2, 1, dark); // cap, brim
    part(-8 - rc + flutter, -11 - bob, 2, 1, dark); part(-10 - rc, -10 - bob + flutter, 2, 1, dark); // scarf tail
  } else if (st === 1) {
    part(-3, -2, 3, 2, trou); part(0, -2, 3, 2, trou);
    part(-3 - rc, -7, 6, 5, body); part(-3 - rc, -3, 6, 1, dark);
    part(-6 - rc, -7, 3, 5, steel);
    part(-2 - rc, -10, 5, 3, skin); part(1 - rc, -9, 1, 1, PAL.ink);
    part(-3 - rc, -12, 6, 3, body); part(3 - rc, -10, 2, 1, dark);
    part(-8 - rc + flutter, -7, 2, 1, dark);
  } else {
    part(-9, -2, 4, 2, trou); part(-9, -4, 3, 1, steel); // boots, tank end
    part(-6 - rc, -4, 8, 4, body); part(-6 - rc, -1, 8, 1, dark); // back
    part(-6 - rc, -6, 3, 2, steel);
    part(2 - rc, -5, 4, 4, skin); part(4 - rc, -4, 1, 1, PAL.ink); // head, eye
    part(1 - rc, -6, 5, 2, body); part(5 - rc, -5, 1, 1, dark); // cap
    part(-12 - rc + flutter, -3, 3, 1, dark);
  }
  // outline pass, then fill pass
  g.fillStyle = edge;
  for (let i = 0; i < n; i++) g.fillRect(f > 0 ? ox + PX[i] - 1 : ox - PX[i] - PW[i] - 1, oy + PY[i] - 1, PW[i] + 2, PH[i] + 2);
  for (let i = 0; i < n; i++) { g.fillStyle = PC[i]; g.fillRect(f > 0 ? ox + PX[i] : ox - PX[i] - PW[i], oy + PY[i], PW[i], PH[i]); }

  // jetpack flame
  if (o.jet && !flat) {
    const fl = ((o.t * 40) | 0) % 3, bx = ox - f * 5;
    g.fillStyle = PAL.coral; g.fillRect(bx - 1, oy - 4, 3, 3 + fl);
    g.fillStyle = PAL.peach; g.fillRect(bx, oy - 4, 1, 2 + fl);
    g.fillStyle = PAL.cream; g.fillRect(bx, oy - 4, 1, 1);
  }
  // rifle
  const m = muzzle(o, _m);
  const k = o.recoil > 0 ? o.recoil * 2.2 : 0;
  const ca = Math.cos(o.aim), sa = Math.sin(o.aim);
  const x0 = m.sx - ca * (4 + k), y0 = m.sy - sa * (4 + k), x1 = m.x - ca * k, y1 = m.y - sa * k;
  // sleeve + glove reach to the rifle
  line(g, m.sx - ca * 1, m.sy - sa * 1 + 1, m.sx + ca * 4 - ca * k, m.sy + sa * 4 + 1 - sa * k, edge, 3);
  line(g, x0, y0, x1, y1, edge, 3);
  line(g, x0, y0, m.sx + ca * 1 - ca * k, m.sy + sa * 1 - sa * k, wood, 1);
  line(g, m.sx + ca * 1 - ca * k, m.sy + sa * 1 - sa * k, x1, y1, steel, 1);
  line(g, m.sx - ca * k, m.sy - sa * k + 1, m.sx + ca * 4 - ca * k, m.sy + sa * 4 + 1 - sa * k, dark, 1);
  // scope: two pixels above the barrel, perpendicular to it
  const px = m.sx + ca * 5 - ca * k + sa * 2 * (ca > 0 ? 1 : -1) * 0, py = m.sy + sa * 5 - sa * k - 2;
  g.fillStyle = flat || PAL.cream;
  g.fillRect(Math.round(px), Math.round(py), 2, 1);
  g.fillStyle = flat || PAL.ink;
  g.fillRect(Math.round(px) - 1, Math.round(py) + 1, 4, 1);
  if (st === 2) { // bipod
    const bx = Math.round(m.sx + ca * 8), by = Math.round(m.sy + sa * 8);
    g.fillStyle = steel; g.fillRect(bx, by + 1, 1, Math.max(1, oy - by - 1)); g.fillRect(bx + 2, by + 1, 1, Math.max(1, oy - by - 1));
  }
}

const _h = { x: 0, y: 0 };
/** A tiny bobbing chevron over the local player's head, in their colour. */
export function drawMarker(g, o, t) {
  const top = BODY[o.st].h + 6;
  const bob = Math.round(Math.sin(t * 5) * 1.2);
  const x = Math.round(o.x), y = Math.round(o.y - top + bob);
  g.fillStyle = PAL.ink;
  g.fillRect(x - 3, y - 1, 7, 2); g.fillRect(x - 2, y + 1, 5, 2); g.fillRect(x - 1, y + 3, 3, 2);
  g.fillStyle = o.col;
  g.fillRect(x - 2, y, 5, 1); g.fillRect(x - 1, y + 1, 3, 1); g.fillRect(x, y + 2, 1, 1);
  return _h;
}
