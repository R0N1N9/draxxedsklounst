// The stage of RUBBER HOSE RIDGE as numbers: two mesas with a long canyon between them, a seesaw rock
// with a crate tower on a pillar, ladders, springboards, a handcar on the canyon floor — plus the
// slapstick timetable, which is built once from the round's seed and then only ever read as a pure
// function of ctx.time, so both online clients see the same anvils, trains and vultures.
import { clamp, rand } from '../../kit.js';

export const W = 1600, H = 900, GY = 340, FLOOR = 760, MID = 800;
export const LIP = [450, 1150];
export const PW = 20, PH = 100, PHC = 60, SHOULDER = 62; // body half width, standing / crouching height, shoulder height
export const SPAWN = [170, 1430];
export const PIV = { x: 800, y: 520 };
export const PLANK = 190, CRATE = 58;
export const GRAV = 1900, RUN = 285, JUMP = 650, CLIMB = 190, SPRING = 1000;
export const CAR_Y = FLOOR - 36, CAR_W = 132;
export const ANVIL = { warn: 1.7, fall: 0.35, stay: 3.4, w: 72, h: 56 };
export const TRAIN = { warn: 2, len: 470, speed: 920 };
export const WEED = { r: 33, speed: 330 };

const mirror = (r) => ({ x: W - r.x - r.w, y: r.y, w: r.w, h: r.h, k: r.k });

export function buildWorld(rng) {
  const solids = [];
  const add = (r) => { solids.push(r); };
  add({ x: -700, y: GY, w: 1150, h: 1400, k: 'mesa' });
  add({ x: 1150, y: GY, w: 1150, h: 1400, k: 'mesa' });
  add({ x: 450, y: FLOOR, w: 700, h: 700, k: 'floor' });
  add({ x: 735, y: PIV.y + 4, w: 130, h: FLOOR - PIV.y - 4, k: 'pillar' });
  const rockL = { x: 286, y: GY - 64, w: 96, h: 64, k: 'rock' };
  add(rockL);
  add(mirror(rockL));
  const perchL = { x: 250, y: 205, w: 170, h: 12, k: 'board' };
  const boards = [perchL, mirror(perchL)];
  const ladders = [
    { x: 264, top: 205, bot: GY, z0: 244, z1: 284, k: 'perch' },
    { x: 1336, top: 205, bot: GY, z0: 1316, z1: 1356, k: 'perch' },
    { x: 472, top: GY, bot: FLOOR, z0: 408, z1: 450, k: 'cliff' },
    { x: 1128, top: GY, bot: FLOOR, z0: 1150, z1: 1192, k: 'cliff' },
    { x: 718, top: PIV.y, bot: FLOOR, z0: 700, z1: 736, k: 'pillar' },
    { x: 882, top: PIV.y, bot: FLOOR, z0: 864, z1: 900, k: 'pillar' },
  ];
  const springs = [{ x0: 404, x1: 448, y: GY, dir: 1 }, { x0: 1152, x1: 1196, y: GY, dir: -1 }];
  const w = {
    solids, boards, ladders, springs,
    tilt: 0, tiltV: 0, tilt0: 0,
    tower: { n: 3, x: PIV.x - CRATE / 2, wob: 0, wobV: 0, rect: { x: PIV.x - CRATE / 2, y: 0, w: CRATE, h: 0, k: 'tower' }, lost: [] },
    car: { x: MID, y: CAR_Y, vx: 0, w: CAR_W, ph: rand(rng, 0, 6.28), lastX: MID },
    anvils: [], // live anvil rects, rebuilt every frame
    cr: [], // everything a cork can hit, rebuilt every frame
    ev: buildEvents(rng),
    carOn: true,
  };
  w.carX = (t) => MID + 300 * Math.sin(t * 0.43 + w.car.ph);
  refresh(w, 0);
  return w;
}

/** Height of the seesaw plank at x. */
export const plankY = (w, x) => PIV.y + (x - PIV.x) * Math.tan(w.tilt);
export const onPlank = (x) => Math.abs(x - PIV.x) <= PLANK;

/** The y of a ladder's top (the pillar ladders end at the tilted plank). */
export const ladderTop = (w, l) => (l.k === 'pillar' ? plankY(w, l.x) : l.top);

// ---- the slapstick timetable -----------------------------------------------------------------
function buildEvents(rng) {
  const ev = [];
  const R = (a, b) => rand(rng, a, b);
  const flip = (side, x) => (side ? W - x : x);
  // Anvils: a shadow grows for a second and a half, then it falls.
  let side = rng() < 0.5 ? 0 : 1;
  for (let t = R(6, 8.5), k = 0; k < 16; k++, t += R(7, 10.5), side ^= 1) {
    const r = rng();
    let x, y = GY;
    if (r < 0.4) x = flip(side, R(60, 250));
    else if (r < 0.58) x = flip(side, R(385, 438));
    else if (r < 0.8) { x = R(640, 960); y = PIV.y; }
    else { x = R(520, 1080); y = FLOOR; }
    ev.push({ k: 'anvil', t0: t, x, y, dur: ANVIL.warn + ANVIL.fall + ANVIL.stay, hit: false });
  }
  // Sudden death: the sky starts dropping them on the mesas, and then the weeds come twice as fast.
  side = rng() < 0.5 ? 0 : 1;
  for (let t = 46, k = 0; k < 18; k++, t += R(2.3, 3.4), side ^= 1) ev.push({ k: 'anvil', t0: t, x: flip(side, R(80, 430)), y: GY, dur: ANVIL.warn + ANVIL.fall + ANVIL.stay, hit: false, sd: true });
  // The train bursts out of one painted tunnel and vanishes into the other.
  let dir = rng() < 0.5 ? 1 : -1;
  for (let t = R(14, 19), k = 0; k < 9; k++, t += R(16, 21), dir = -dir) ev.push({ k: 'train', t0: t, dir, dur: TRAIN.warn + (LIP[1] - LIP[0] + TRAIN.len) / TRAIN.speed + 0.3 });
  // Tumbleweeds bowl along a mesa and fall into the canyon.
  side = rng() < 0.5 ? 0 : 1;
  for (let t = R(4.5, 7), k = 0; k < 18; k++, t += R(8.5, 12.5), side ^= 1) ev.push({ k: 'weed', t0: t, side, dur: 5.2, hit: false });
  for (let t = 47, k = 0; k < 12; k++, t += R(3.6, 5), side ^= 1) ev.push({ k: 'weed', t0: t, side, dur: 5.2, hit: false });
  // A vulture swoops at head height over one spot and steals whatever hat it finds.
  side = rng() < 0.5 ? 0 : 1;
  for (let t = R(17, 22), k = 0; k < 8; k++, t += R(16, 22), side ^= 1) {
    const sx = R(110, 300);
    ev.push({ k: 'bird', t0: t, side, x: flip(side, sx), dur: 4.2, hit: false });
  }
  ev.sort((a, b) => a.t0 - b.t0);
  return ev;
}

/** Anvil life: phase 0 warn, 1 falling, 2 sitting, 3 gone; y is the anvil's bottom edge. */
export function anvilState(e, t, w, out) {
  const u = t - e.t0;
  const ground = e.y === PIV.y ? plankY(w, e.x) : e.y;
  out.x = e.x; out.ground = ground;
  if (u < 0) { out.ph = 3; return out; }
  if (u < ANVIL.warn) { out.ph = 0; out.k = u / ANVIL.warn; out.y = ground - 400; return out; }
  if (u < ANVIL.warn + ANVIL.fall) { const k = (u - ANVIL.warn) / ANVIL.fall; out.ph = 1; out.k = k; out.y = -260 + (ground + 260) * k * k; return out; }
  if (u < e.dur) { out.ph = 2; out.k = (u - ANVIL.warn - ANVIL.fall) / ANVIL.stay; out.y = ground; return out; }
  out.ph = 3;
  return out;
}

/** Train: head x (the front buffer), moving right when dir > 0. u < 0 while it is only warning. */
export function trainState(e, t, out) {
  const u = t - e.t0 - TRAIN.warn;
  out.u = u;
  out.warn = clamp((t - e.t0) / TRAIN.warn, 0, 1);
  const run = (LIP[1] - LIP[0] + TRAIN.len) / TRAIN.speed;
  out.on = u >= 0 && u <= run;
  const d = Math.max(0, u) * TRAIN.speed;
  out.head = e.dir > 0 ? LIP[0] + d : LIP[1] - d; // the front end
  out.tail = out.head - e.dir * TRAIN.len;
  return out;
}

/** Tumbleweed centre and whether it is rolling at all. */
export function weedState(e, t, out) {
  const u = t - e.t0;
  out.on = u >= 0 && u < e.dur;
  const d = WEED.speed * u;
  const lipD = 560; // distance rolled before it leaves the lip
  const sx = -190 + Math.min(d, lipD) + Math.max(0, d - lipD) * 0.9;
  const fall = Math.max(0, u - lipD / WEED.speed);
  const gx = -190 + d;
  out.gx = gx;
  out.x = e.side ? W - gx : gx;
  out.y = GY - WEED.r - Math.abs(Math.sin(u * 5.4)) * (d > lipD ? 10 : 26) + 0.5 * 1500 * fall * fall;
  out.rot = d / WEED.r * (e.side ? -1 : 1);
  out.sx = sx;
  return out;
}

/** The vulture: u in 0..1 over its flight, lowest (head height over the target) at u = 0.5. */
export function birdState(e, t, out) {
  const u = (t - e.t0) / e.dur;
  out.u = u;
  out.on = u >= 0 && u <= 1;
  const dir = e.side ? -1 : 1;
  out.x = e.x + dir * (u - 0.5) * 1300;
  const swoop = 1 - Math.pow(Math.abs(2 * u - 1), 2.2);
  out.y = -170 + (GY - 82 + 170) * swoop;
  out.dir = dir;
  out.low = swoop > 0.97;
  return out;
}

// ---- dynamic collision list ---------------------------------------------------------------------
const _an = { ph: 3, x: 0, y: 0, k: 0, ground: 0 };
const anvilPool = [];
for (let i = 0; i < 8; i++) anvilPool.push({ x: 0, y: 0, w: ANVIL.w, h: ANVIL.h, k: 'anvil', e: null });

/** Rebuild the crate tower's rectangle, the sitting anvils and the list of everything a cork can hit. */
export function refresh(w, t) {
  const tw = w.tower;
  const base = plankY(w, PIV.x) - 4;
  tw.rect.y = base - CRATE * tw.n;
  tw.rect.h = CRATE * tw.n;
  tw.base = base;
  w.anvils.length = 0;
  let n = 0;
  for (const e of w.ev) {
    if (e.k !== 'anvil' || t < e.t0 || t > e.t0 + e.dur) continue;
    anvilState(e, t, w, _an);
    if (_an.ph !== 2 || n >= anvilPool.length) continue;
    const a = anvilPool[n++];
    a.x = e.x - ANVIL.w / 2; a.y = _an.ground - ANVIL.h; a.e = e;
    w.anvils.push(a);
  }
  const cr = w.cr;
  cr.length = 0;
  for (const s of w.solids) cr.push(s);
  for (const b of w.boards) cr.push(b);
  if (tw.n > 0) cr.push(tw.rect);
  for (const a of w.anvils) cr.push(a);
  w.hand = w.carX(t);
}

// ---- bodies -------------------------------------------------------------------------------------
const SUB = 1 / 90;

/**
 * Move a standing / falling body {x, y (feet), vx, vy, hw, h, ground, plat, drop}: gravity, walls,
 * floors, one-way boards, the tilting plank and the handcar. Climbing is handled by the caller.
 */
export function moveBody(w, b, dt) {
  const n = Math.max(1, Math.ceil(dt / SUB)), h = dt / n;
  for (let s = 0; s < n; s++) {
    if (b.ground && b.plat === 'car') b.x += w.car.vx * h;
    const prevY = b.y;
    b.x += b.vx * h;
    const top = b.y - b.h;
    const solids = w.solids;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0, ln = solids.length + 1 + w.anvils.length; i < ln; i++) {
        const q = i < solids.length ? solids[i] : i === solids.length ? w.tower.rect : w.anvils[i - solids.length - 1];
        if (q.h <= 0) continue;
        if (b.x + b.hw > q.x && b.x - b.hw < q.x + q.w && b.y > q.y + 1.5 && top < q.y + q.h - 1.5) {
          b.x = b.vx > 0 || (b.vx === 0 && b.x < q.x + q.w / 2) ? q.x - b.hw : q.x + q.w + b.hw;
          b.vx = 0;
        }
      }
    }
    b.vy = Math.min(b.vy + GRAV * h, 1700);
    b.y += b.vy * h;
    b.ground = false;
    b.plat = '';
    if (b.vy >= 0) {
      let best = 1e9, kind = '';
      const xl = b.x - b.hw * 0.8, xr = b.x + b.hw * 0.8;
      const test = (y, k) => { if (y >= prevY - 2 && y <= b.y + 0.01 && y < best) { best = y; kind = k; } };
      for (let i = 0; i < solids.length; i++) { const q = solids[i]; if (xr > q.x && xl < q.x + q.w) test(q.y, 'solid'); }
      const tw = w.tower.rect;
      if (tw.h > 0 && xr > tw.x && xl < tw.x + tw.w) test(tw.y, 'solid');
      for (let i = 0; i < w.anvils.length; i++) { const q = w.anvils[i]; if (xr > q.x && xl < q.x + q.w) test(q.y, 'solid'); }
      if (!(b.drop > 0)) {
        for (let i = 0; i < w.boards.length; i++) { const q = w.boards[i]; if (xr > q.x && xl < q.x + q.w) test(q.y, 'board'); }
        if (onPlank(b.x)) test(plankY(w, b.x), 'see');
        const c = w.car;
        if (w.carOn && Math.abs(b.x - w.hand) < c.w / 2) test(c.y, 'car');
      }
      if (kind) { b.y = best; b.vy = 0; b.ground = true; b.plat = kind; }
    } else {
      for (let i = 0; i < solids.length; i++) {
        const q = solids[i], qb = q.y + q.h;
        if (b.x + b.hw > q.x && b.x - b.hw < q.x + q.w && b.y - b.h < qb && prevY - b.h >= qb - 2) { b.y = qb + b.h; b.vy = 0; }
      }
    }
  }
  b.x = clamp(b.x, 34, W - 34);
  if (b.y > FLOOR + 40) { b.y = FLOOR; b.vy = 0; b.ground = true; b.plat = 'solid'; } // never lost under the floor
}

/** Where a cork flies: `out` receives x, y pairs every `step` seconds until it hits something (returns the count). */
export function traceCork(w, x, y, vx, vy, g, tmax, step, out) {
  let n = 0, px = x, py = y;
  out[n++] = x; out[n++] = y;
  const cr = w.cr;
  for (let t = step; t <= tmax && n < out.length - 2; t += step) {
    const nx = x + vx * t, ny = y + vy * t + 0.5 * g * t * t;
    for (let i = 0; i < cr.length; i++) {
      const q = cr[i];
      if (q.h > 0 && segHit(px, py, nx, ny, q)) { out[n++] = nx; out[n++] = ny; return n >> 1; }
    }
    out[n++] = nx; out[n++] = ny;
    px = nx; py = ny;
  }
  return n >> 1;
}

/** Does the segment (ax,ay)-(bx,by) pass through rect q? A coarse slab test: good enough for a preview. */
export function segHit(ax, ay, bx, by, q) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay;
  for (let k = 0; k < 2; k++) {
    const p = k ? dy : dx, a = k ? ay : ax, lo = k ? q.y : q.x, hi = lo + (k ? q.h : q.w);
    if (Math.abs(p) < 1e-9) { if (a < lo || a > hi) return false; } else {
      let ta = (lo - a) / p, tb = (hi - a) / p;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return false;
    }
  }
  return true;
}

/** Cork parameters for a charge in 0..1: held longer = flatter and faster. */
export function shotParams(c, sudden, out) {
  out.v = 1050 + 750 * c;
  out.g = 620 - 400 * c;
  if (sudden) { out.v *= 1.3; out.g *= 0.5; }
  return out;
}
