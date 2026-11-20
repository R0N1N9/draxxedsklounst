// TOY BOX — the battlefield as numbers: the rug, the things standing on it, the train's
// timetable, where the light falls. No three.js in here: the simulation and the bot read
// this, the builders dress it. World units are "toy inches": a soldier is 1.7 tall.
// x runs across the screen, z towards the camera; the map mirrors left to right.
import { clamp, lerp, smoothstep, rand, shuffle, TAU } from '../../kit.js';

export const RUG_A = 21, RUG_B = 12.5;      // the rug is an ellipse; soldiers never leave it
export const BODY_R = 0.66, FIG = 1.36;     // a soldier's footprint; how much bigger than the model it is drawn
export const MUZZLE = 1.9;                  // how far in front of its feet the muzzle is
export const gunY = (k) => 1.7 - 0.34 * k;  // muzzle height, standing (k = 0) to kneeling (k = 1)
export const SPAWN = [{ x: -17, z: -1.3 }, { x: 17, z: -1.3 }];
export const LOOP = { x: 0, z: 0.6, a: 10.2, b: 4.7 }; // centre line of the train track
export const CAR_N = 3, CAR_HW = 1.38, CAR_HD = 0.72, CAR_GAP = 3.15, LAP = 24; // seconds per lap
export const POOL = { r0: 6.2, r1: 10.4 };  // the lamp's pool: full light inside r0, none past r1
export const SPOT_R = 3.1;                  // a copter's spotlight on the floor
export const TIDY = 5.5, ROLL_UP = 19, LAST = 5.2; // sudden death: the props go, then the rug rolls up to ±LAST

export const hit = { t: 0, nx: 0, nz: 0, s: null }; // result of the last cast

const solid = (kind, x, z, hw, hd, rot, h, mat) => ({ kind, x, z, hw, hd, rot, c: Math.cos(rot), s: Math.sin(rot), h, mat, on: true, popAt: 1e9, id: 0, face: null, row: null });
const place = (o, x, z, rot) => { o.x = x; o.z = z; o.rot = rot; o.c = Math.cos(rot); o.s = Math.sin(rot); };

// Ray against one rotated box (padded by `pad`): distance along the unit ray, or -1.
// A ray that starts inside reports nothing — that is what lets a ricochet leave its wall.
function rayBox(ox, oz, dx, dz, max, o, pad) {
  const rx = ox - o.x, rz = oz - o.z;
  const lx = rx * o.c + rz * o.s, lz = -rx * o.s + rz * o.c, ldx = dx * o.c + dz * o.s, ldz = -dx * o.s + dz * o.c;
  const hw = o.hw + pad, hd = o.hd + pad;
  let t0 = 0, t1 = max, nx = 0, nz = 0;
  if (Math.abs(ldx) < 1e-9) { if (lx < -hw || lx > hw) return -1; } else {
    let a = (-hw - lx) / ldx, b = (hw - lx) / ldx, s = -1;
    if (a > b) { const t = a; a = b; b = t; s = 1; }
    if (a > t0) { t0 = a; nx = s; nz = 0; }
    if (b < t1) t1 = b;
    if (t0 > t1) return -1;
  }
  if (Math.abs(ldz) < 1e-9) { if (lz < -hd || lz > hd) return -1; } else {
    let a = (-hd - lz) / ldz, b = (hd - lz) / ldz, s = -1;
    if (a > b) { const t = a; a = b; b = t; s = 1; }
    if (a > t0) { t0 = a; nx = 0; nz = s; }
    if (b < t1) t1 = b;
    if (t0 > t1) return -1;
  }
  if (nx === 0 && nz === 0) return -1;
  hit.nx = nx * o.c - nz * o.s; hit.nz = nx * o.s + nz * o.c;
  return t0;
}

export function buildWorld(rng, names) {
  const solids = [], rows = [];
  const add = (o) => { o.id = solids.length; solids.push(o); return o; };
  const both = (make, x, z, rot) => { add(make(x, z, rot)); add(make(-x, z, -rot)); };

  const block = (x, z, rot, face) => { const o = solid('block', x, z, 1.05, 1.05, rot, 2.1, 'wood'); o.face = face; return o; };
  const pair = (x, z, rot) => solid('pair', x, z, 2.1, 1.05, rot, 2.1, 'wood');
  const books = (x, z, rot) => { const o = solid('books', x, z, 2.25, 1.6, rot, 2.3, 'soft'); o.n = 3; return o; };
  const dominoes = (x, z, rot) => {
    const n = 7, gap = 0.64, o = solid('row', x, z, (n * gap) / 2, 0.5, rot, 1.9, 'domino');
    o.row = { n, gap, lo: 0, hi: n - 1, fall: new Float32Array(n).fill(-1), dir: new Int8Array(n), cx: x, cz: z };
    rows.push(o);
    return o;
  };
  const MAKE = { pair, books, row: dominoes };

  // Each sniper starts behind a block with their own initial on it.
  const hr = rand(rng, 0.35, 0.8);
  add(block(-14, -1.2, hr, 0)); add(block(14, -1.2, -hr, 1));
  // Four places on each flank, outside the track; one of them stays empty.
  const slots = [[-10.6, -7.5], [-4.6, -9.4], [-11, 6.3], [-5, 9.5]];
  const bag = shuffle(rng, ['pair', 'books', 'row', rng() < 0.5 ? 'pair' : 'row']);
  const empty = Math.floor(rng() * 4);
  slots.forEach(([x, z], i) => {
    if (i === empty) return;
    const kind = bag[i], jx = rand(rng, -0.5, 0.5), jz = rand(rng, -0.4, 0.4);
    const rot = kind === 'row' ? rand(rng, 1.0, 2.1) : rand(rng, -0.7, 0.7);
    both(MAKE[kind], x + jx, z + jz, rot);
  });
  // Inside the loop, in the lamp light: a tower in the middle (it spells V S), dominoes either side.
  const tower = add(block(LOOP.x, LOOP.z, rand(rng, 0.5, 1.0), 2));
  tower.tall = true;
  const inner = rng();
  if (inner < 0.7) both(dominoes, -5.3, LOOP.z + rand(rng, -0.3, 0.3), Math.PI / 2 + rand(rng, -0.25, 0.25));
  else both((x, z, r) => block(x, z, r, -1), -5.2, LOOP.z, rand(rng, 0.2, 1.2));
  const statics = solids.length;

  // The train: an engine and two wagons, at constant speed round the loop.
  const cars = [];
  for (let i = 0; i < CAR_N; i++) cars.push(add(solid('car', 0, 0, CAR_HW, CAR_HD, 0, i ? 1.7 : 2.2, 'wood')));
  const N = 360, arc = new Float32Array(N + 1);
  const loopAt = (th, out) => { out.x = LOOP.x + Math.cos(th) * LOOP.a; out.z = LOOP.z + Math.sin(th) * LOOP.b; return out; };
  for (let i = 1; i <= N; i++) { const a = ((i - 0.5) / N) * TAU; arc[i] = arc[i - 1] + Math.hypot(LOOP.a * Math.sin(a), LOOP.b * Math.cos(a)) * (TAU / N); }
  const LEN = arc[N], dir = rng() < 0.5 ? 1 : -1, s0 = rng() * LEN;
  // Arc length → angle round the loop.
  const angleAt = (s) => {
    s = ((s % LEN) + LEN) % LEN;
    let lo = 0, hi = N;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arc[m] <= s) lo = m; else hi = m; }
    return ((lo + (s - arc[lo]) / (arc[hi] - arc[lo])) / N) * TAU;
  };
  const tp = { x: 0, z: 0 };

  // Car headlights from the street, through the blind: the times they sweep the room.
  const sweeps = [];
  for (let t = rand(rng, 7, 10); t < 140; t += rand(rng, 11, 16)) sweeps.push({ t, dir: rng() < 0.5 ? 1 : -1 });
  const SWEEP = 3.4, HA = -0.42, hca = Math.cos(HA), hsa = Math.sin(HA);

  // Cover posts for the bot: points just off the corners and faces of everything that stands still.
  const posts = [];
  const W = {
    solids, rows, cars, statics, tower, sweeps, posts, names, trainDir: dir,
    suddenAt: -1, lim: RUG_A - BODY_R - 0.2, spots: [{ on: 0, x: 0, z: 0 }, { on: 0, x: 0, z: 0 }], pool: { x: 0, z: 0.5 }, head: { p: 0, k: 0, ca: hca, sa: hsa },

    // Everything that moves by the clock: the train, the lamp's sway, the headlights, the tidy-up.
    setTime(T) {
      const head = s0 + dir * (LEN / LAP) * T;
      for (let i = 0; i < CAR_N; i++) {
        const c = cars[i], th = angleAt(head - dir * i * CAR_GAP);
        loopAt(th, tp);
        place(c, tp.x, tp.z, Math.atan2(LOOP.b * Math.cos(th) * dir, -LOOP.a * Math.sin(th) * dir));
      }
      W.pool.x = Math.sin(T * 0.23) * 2.6;
      W.pool.z = 0.5 + Math.sin(T * 0.37 + 1) * 1.1;
      W.head.k = 0;
      for (let i = 0; i < sweeps.length; i++) {
        const u = (T - sweeps[i].t) / SWEEP;
        if (u > 0 && u < 1) { W.head.k = Math.sin(u * Math.PI) ** 0.5; W.head.p = (u * 2 - 1) * 34 * sweeps[i].dir; }
      }
      const ts = W.suddenAt >= 0 ? T - W.suddenAt : -1;
      if (ts >= 0) for (const o of solids) if (o.on && ts >= o.popAt) o.on = false;
      W.lim = ts < TIDY ? RUG_A - BODY_R - 0.2 : lerp(RUG_A - BODY_R - 0.2, LAST, clamp((ts - TIDY) / ROLL_UP, 0, 1));
    },
    // When sudden death begins everything is put away, from the ends inwards.
    beginSudden(T) {
      if (W.suddenAt >= 0) return;
      W.suddenAt = T;
      for (const o of solids) o.popAt = o.kind === 'car' ? TIDY - 1.2 + o.id * 0.05 : lerp(TIDY - 1.6, 0.5, clamp(Math.abs(o.x) / 15, 0, 1)) + (o.x < 0 ? 0 : 0.12);
    },
    suddenT(T) { return W.suddenAt >= 0 ? T - W.suddenAt : -1; },

    // Nearest thing a pellet (or a line of sight) meets along a unit ray. Fills `hit`.
    cast(ox, oz, dx, dz, max, pad = 0) {
      let best = max, s = null, nx = 0, nz = 0;
      for (let i = 0; i < solids.length; i++) {
        const o = solids[i];
        if (!o.on) continue;
        const t = rayBox(ox, oz, dx, dz, best, o, pad);
        if (t >= 0 && t < best) { best = t; s = o; nx = hit.nx; nz = hit.nz; }
      }
      hit.t = best; hit.s = s; hit.nx = nx; hit.nz = nz;
      return best;
    },
    los(ax, az, bx, bz, pad = 0) {
      const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz);
      return d < 1e-6 || W.cast(ax, az, dx / d, dz / d, d, pad) >= d;
    },
    inside(x, z, pad) {
      for (let i = 0; i < solids.length; i++) {
        const o = solids[i];
        if (!o.on) continue;
        const rx = x - o.x, rz = z - o.z;
        if (Math.abs(rx * o.c + rz * o.s) < o.hw + pad && Math.abs(-rx * o.s + rz * o.c) < o.hd + pad) return o;
      }
      return null;
    },
    // Keep a soldier on the rug and out of the furniture. Returns the car that shoved them, if one did.
    walk(p, r) {
      let shoved = null;
      for (let pass = 0; pass < 3; pass++) {
        let moved = false;
        for (let i = 0; i < solids.length; i++) {
          const o = solids[i];
          if (!o.on) continue;
          const rx = p.x - o.x, rz = p.z - o.z;
          if (rx * rx + rz * rz > (o.hw + o.hd + r) * (o.hw + o.hd + r)) continue;
          const lx = rx * o.c + rz * o.s, lz = -rx * o.s + rz * o.c;
          const qx = clamp(lx, -o.hw, o.hw), qz = clamp(lz, -o.hd, o.hd);
          let ex = lx - qx, ez = lz - qz;
          const d2 = ex * ex + ez * ez;
          if (d2 >= r * r) continue;
          let nx, nz, push;
          if (d2 > 1e-9) { const d = Math.sqrt(d2); nx = ex / d; nz = ez / d; push = r - d; }
          else {
            // Centre inside the box: out through the nearest face.
            const px = o.hw - Math.abs(lx), pz = o.hd - Math.abs(lz);
            if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; push = px + r; } else { nx = 0; nz = Math.sign(lz) || 1; push = pz + r; }
          }
          p.x += (nx * o.c - nz * o.s) * push;
          p.z += (nx * o.s + nz * o.c) * push;
          moved = true;
          if (o.kind === 'car') shoved = o;
        }
        if (!moved) break;
      }
      const a = RUG_A - r - 0.2, b = RUG_B - r - 0.2, f = (p.x * p.x) / (a * a) + (p.z * p.z) / (b * b);
      if (f > 1) { const k = 1 / Math.sqrt(f); p.x *= k; p.z *= k; }
      if (p.x > W.lim) p.x = W.lim; else if (p.x < -W.lim) p.x = -W.lim;
      return shoved;
    },
    onRug(x, z, pad = 0) { return Math.abs(x) < W.lim - pad && (x * x) / ((RUG_A - pad) * (RUG_A - pad)) + (z * z) / ((RUG_B - pad) * (RUG_B - pad)) < 1; },

    // How well lit a spot on the rug is, 0..1: the lamp's pool, a copter's spotlight, passing
    // headlights — or the big light, once someone has switched it on.
    light(x, z) {
      if (W.suddenAt >= 0) return 1;
      let l = 1 - smoothstep(POOL.r0, POOL.r1, Math.hypot((x - W.pool.x) * 0.92, (z - W.pool.z) * 1.12));
      for (let i = 0; i < 2; i++) {
        const s = W.spots[i];
        if (s.on > 0) l = Math.max(l, s.on * (1 - smoothstep(SPOT_R * 0.55, SPOT_R, Math.hypot(x - s.x, z - s.z))));
      }
      if (W.head.k > 0) l = Math.max(l, W.head.k * (1 - smoothstep(4.6, 7, Math.abs(x * hca + z * hsa - W.head.p))));
      return l;
    },

    // A pellet knocked domino `i` of a row over towards `sgn`: it and everything beyond it goes down in turn.
    topple(row, i, sgn, T) {
      const r = row.row;
      if (i < r.lo || i > r.hi) return false;
      for (let k = i, n = 0; k >= r.lo && k <= r.hi; k += sgn, n++) { r.fall[k] = T + n * 0.075; r.dir[k] = sgn; }
      if (sgn > 0) r.hi = i - 1; else r.lo = i + 1;
      const m = r.hi - r.lo + 1;
      if (m <= 0) row.on = false;
      else {
        // What still stands is a shorter wall.
        const mid = ((r.lo + r.hi) / 2 - (r.n - 1) / 2) * r.gap;
        row.x = r.cx + mid * Math.cos(row.rot); row.z = r.cz + mid * Math.sin(row.rot); row.hw = (m * r.gap) / 2;
      }
      return true;
    },
    // Which domino of the row a hit at (x, z) landed on.
    dominoAt(row, x, z) {
      const r = row.row, l = (x - r.cx) * Math.cos(row.rot) + (z - r.cz) * Math.sin(row.rot);
      return clamp(Math.round(l / r.gap + (r.n - 1) / 2), r.lo, r.hi);
    },
  };

  W.setTime(0);
  for (let i = 0; i < statics; i++) {
    const o = solids[i];
    for (let k = 0; k < 8; k++) {
      const ex = k < 4 ? (k & 1 ? 1 : -1) : k === 4 ? 1 : k === 5 ? -1 : 0, ez = k < 4 ? (k & 2 ? 1 : -1) : k === 6 ? 1 : k === 7 ? -1 : 0;
      const lx = ex * (o.hw + 1.05), lz = ez * (o.hd + 1.05), x = o.x + lx * o.c - lz * o.s, z = o.z + lx * o.s + lz * o.c;
      if (!W.onRug(x, z, 1.2) || W.inside(x, z, 0.6)) continue;
      const f = ((x - LOOP.x) / LOOP.a) ** 2 + ((z - LOOP.z) / LOOP.b) ** 2;
      if (f > 0.72 && f < 1.35) continue; // not on the track
      posts.push({ x, z, o });
    }
  }
  // A few open spots along the edge of the lamp light, so there is always somewhere to go.
  for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU + 0.3; posts.push({ x: Math.cos(a) * 15.5, z: Math.sin(a) * 8.4, o: null }); }
  return W;
}
