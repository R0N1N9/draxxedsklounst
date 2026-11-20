// INK CITY — the map. Two clusters of rooftops either side of a street canyon, built from
// the round's seed and mirrored through the centre so neither sniper has the better block.
// Everything here is plain numbers: roofs to stand on, boxes that stop bullets and eyes,
// the walking and leaping rules, and the airship's timetable (a pure function of time).
import { clamp, rand, resolveCircleRects } from '../../kit.js';

export const HALF_X = 40, STREET = 10, EDGE = 0.55, STEP_UP = 1.3, RADIUS = 0.4;
export const LEAP_MIN = 5, LEAP_MAX = 42, LEAP_UP = 10.5;
export const BLIMP = { y: 41.2, rx: 15, ry: 4.3, rz: 4.3, span: 135, speed: 8 };
/** What the last ray() struck. kind: 0 nothing, 1 building, 2 prop, 3 street, 4 airship. */
export const hit = { kind: 0, nx: 0, ny: 1, nz: 0, surf: 'brick' };

// Three terraces per side: the ledge over the street, the middle, and the perch at the back.
const ROWS = [
  { z0: STREET, z1: 26, h0: 25, h1: 28.5, n: 4 },
  { z0: 26, z1: 43, h0: 30, h1: 33.5, n: 3 },
  { z0: 43, z1: 60, h0: 35.5, h1: 38.5, n: 3 },
];
// kind → footprint (w along x, d along z), height, what a bullet meets [y0, y1 above the roof], surface
const PROP = {
  bulk: { w: 3.4, d: 3.0, h: 2.7, y0: 0, y1: 2.7, surf: 'brick' },   // stair head: full cover
  ac: { w: 2.3, d: 1.5, h: 1.25, y0: 0, y1: 1.25, surf: 'metal' },   // chest high
  chim: { w: 1.0, d: 1.0, h: 2.5, y0: 0, y1: 2.5, surf: 'brick' },
  sky: { w: 2.8, d: 1.9, h: 0.6, y0: 0, y1: 0.6, surf: 'glass' },
  bill: { w: 9, d: 0.5, h: 5.6, y0: 1.3, y1: 5.6, surf: 'paper' },   // hides all but your legs
  tank: { w: 2.9, d: 2.9, h: 5.6, y0: 2.3, y1: 5.2, surf: 'wood' },  // you can be shot under it
  sign: { w: 11, d: 0.6, h: 4.4, y0: 1.7, y1: 4.4, surf: 'metal' },
};

// Slab test, no allocation. b: {x0,y0,z0,x1,y1,z1}; (dx,dy,dz) unit; returns distance or -1.
let nAxis = 0, nSign = 0;
function rayBox(ox, oy, oz, dx, dy, dz, len, b) {
  let t0 = 0, t1 = len, ax = -1, sg = 0, a, c, s;
  if (Math.abs(dx) < 1e-9) { if (ox < b.x0 || ox > b.x1) return -1; } else {
    a = (b.x0 - ox) / dx; c = (b.x1 - ox) / dx; s = -1;
    if (a > c) { const q = a; a = c; c = q; s = 1; }
    if (a > t0) { t0 = a; ax = 0; sg = s; }
    if (c < t1) t1 = c;
    if (t0 > t1) return -1;
  }
  if (Math.abs(dy) < 1e-9) { if (oy < b.y0 || oy > b.y1) return -1; } else {
    a = (b.y0 - oy) / dy; c = (b.y1 - oy) / dy; s = -1;
    if (a > c) { const q = a; a = c; c = q; s = 1; }
    if (a > t0) { t0 = a; ax = 1; sg = s; }
    if (c < t1) t1 = c;
    if (t0 > t1) return -1;
  }
  if (Math.abs(dz) < 1e-9) { if (oz < b.z0 || oz > b.z1) return -1; } else {
    a = (b.z0 - oz) / dz; c = (b.z1 - oz) / dz; s = -1;
    if (a > c) { const q = a; a = c; c = q; s = 1; }
    if (a > t0) { t0 = a; ax = 2; sg = s; }
    if (c < t1) t1 = c;
    if (t0 > t1) return -1;
  }
  if (ax < 0) return -1; // started inside: let it out
  nAxis = ax; nSign = sg;
  return t0;
}

export function buildWorld(rng) {
  const roofs = [], props = [], boxes = [];
  // ---- side 0 (z > 0); side 1 is its image under (x, z) → (−x, −z) ----
  const half = [];
  ROWS.forEach((row, ri) => {
    const wts = [], gaps = [];
    let sum = 0, gapSum = 0;
    for (let i = 0; i < row.n; i++) { const w = rand(rng, 0.8, 1.25); wts.push(w); sum += w; }
    for (let i = 0; i < row.n - 1; i++) { const g = rng() < 0.45 ? 2.6 : 0; gaps.push(g); gapSum += g; }
    let x = -HALF_X;
    for (let i = 0; i < row.n; i++) {
      const w = (wts[i] / sum) * (HALF_X * 2 - gapSum);
      half.push({ row: ri, x0: x, x1: x + w, z0: row.z0, z1: row.z1, h: Math.round(rand(rng, row.h0, row.h1) * 2) / 2, tint: Math.floor(rng() * 6) });
      x += w + (gaps[i] || 0);
    }
  });
  for (const side of [0, 1]) for (const r of half) {
    const m = side ? { x0: -r.x1, x1: -r.x0, z0: -r.z1, z1: -r.z0 } : r;
    roofs.push({ i: roofs.length, side, row: r.row, x0: m.x0, x1: m.x1, z0: m.z0, z1: m.z1, h: r.h, tint: r.tint, cx: (m.x0 + m.x1) / 2, cz: (m.z0 + m.z1) / 2, rects: [], props: [], spots: [] });
  }
  const nHalf = half.length;

  // ---- the spawn: the middle of the perch, 100-odd metres from its mirror image ----
  const home = roofs.find((r) => r.side === 0 && r.row === 2 && r.x0 <= 0 && r.x1 >= 0) || roofs.find((r) => r.side === 0 && r.row === 2);
  const sx = clamp(rand(rng, -5, 5), home.x0 + 3, home.x1 - 3), sz = 51.5;
  const spawn = [{ x: sx, z: sz, roof: home.i, yaw: 0 }, { x: -sx, z: -sz, roof: home.i + nHalf, yaw: Math.PI }];

  // ---- what stands on the roofs ----
  const placed = [];
  const tryPlace = (r, kind, where) => {
    const d = PROP[kind];
    for (let n = 0; n < 14; n++) {
      const px = rand(rng, r.x0 + 1.7 + d.w / 2, r.x1 - 1.7 - d.w / 2);
      const pz = where === 'front' ? r.z0 + 1.7 + rng() * 1.2 : where === 'back' ? r.z1 - 2.0 - d.d / 2 - rng() * 1.5 : rand(rng, r.z0 + 1.9 + d.d / 2, r.z1 - 1.9 - d.d / 2);
      if (!(r.x1 - r.x0 > d.w + 3.6)) return;
      if (r === home && Math.hypot(px - sx, pz - sz) < 4.2 + d.w / 2) continue;
      let ok = true;
      for (const q of placed) if (q.roof === r.i && Math.abs(q.x - px) < (q.w + d.w) / 2 + 1.5 && Math.abs(q.z - pz) < (q.d + d.d) / 2 + 1.5) { ok = false; break; }
      if (!ok) continue;
      const p = { kind, roof: r.i, x: px, z: pz, w: d.w, d: d.d, h: d.h, seed: rng() };
      placed.push(p);
      return p;
    }
  };
  for (const r of roofs) {
    if (r.side) continue;
    // Order matters: the big silhouettes first, then the small cover fills what is left.
    if (r.row === 0) { if (rng() < 0.55) tryPlace(r, rng() < 0.5 ? 'sign' : 'bill', 'front'); if (rng() < 0.5) tryPlace(r, 'tank', 'any'); }
    if (r.row === 1) { if (rng() < 0.7) tryPlace(r, 'bill', 'front'); tryPlace(r, 'bulk', 'any'); }
    if (r.row === 2) { tryPlace(r, 'bulk', r === home ? 'back' : 'any'); if (rng() < 0.6) tryPlace(r, 'tank', 'back'); }
    tryPlace(r, 'ac', 'any');
    if (rng() < 0.75) tryPlace(r, 'ac', 'any');
    tryPlace(r, 'chim', 'any');
    if (rng() < 0.6) tryPlace(r, 'chim', 'any');
    if (rng() < 0.55) tryPlace(r, 'sky', 'any');
  }
  for (const side of [0, 1]) for (const q of placed) {
    const p = side ? { ...q, roof: q.roof + nHalf, x: -q.x, z: -q.z } : q;
    const r = roofs[p.roof], d = PROP[p.kind];
    p.y = r.h; p.side = side; p.i = props.length;
    props.push(p);
    r.props.push(p);
    r.rects.push({ x: p.x - p.w / 2, y: p.z - p.d / 2, w: p.w, h: p.d });
    boxes.push({ x0: p.x - p.w / 2, x1: p.x + p.w / 2, z0: p.z - p.d / 2, z1: p.z + p.d / 2, y0: r.h + d.y0, y1: r.h + d.y1, prop: p, surf: d.surf });
  }
  for (const r of roofs) boxes.push({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, y0: -2, y1: r.h, prop: null, surf: 'brick' });

  // Places to stand: a loose grid on every roof, clear of the props.
  for (const r of roofs) {
    for (let x = r.x0 + 1.3; x <= r.x1 - 1.3; x += 2.1) for (let z = r.z0 + 1.3; z <= r.z1 - 1.3; z += 2.1) {
      let ok = true;
      for (const q of r.rects) if (x > q.x - 0.6 && x < q.x + q.w + 0.6 && z > q.y - 0.6 && z < q.y + q.h + 0.6) { ok = false; break; }
      if (ok) r.spots.push({ x, z, roof: r.i });
    }
  }

  // Sudden death's last panel: the two ledges nearest the middle, face to face across the street.
  let duel = roofs[0];
  for (const r of roofs) if (r.side === 0 && r.row === 0 && Math.abs(r.cx) < Math.abs(duel.cx)) duel = r;
  const dx0 = clamp(0, duel.x0 + 2.5, duel.x1 - 2.5);
  const showdown = [{ x: dx0, z: duel.z0 + 2.6, roof: duel.i }, { x: -dx0, z: -(duel.z0 + 2.6), roof: duel.i + nHalf }];

  const blimpPhase = rand(rng, 20, 75);
  const pos = { x: 0, y: 0 }, lt = { ok: false, x: 0, z: 0, roof: 0 }, bl = { x: 0, y: 0, z: 0 };
  const W = {
    roofs, props, boxes, spawn, showdown, smokes: [], erased: false, lt,

    /** Where the airship is at time T (the same object every call). It crosses, turns far out of sight, and comes back. */
    blimp(T) {
      const s = (T * BLIMP.speed + blimpPhase) % (BLIMP.span * 4), u = s < BLIMP.span * 2 ? s - BLIMP.span : BLIMP.span * 3 - s;
      bl.x = u; bl.y = BLIMP.y + Math.sin(T * 0.31) * 0.7; bl.z = Math.sin(T * 0.13 + 1) * 2.2;
      bl.dir = s < BLIMP.span * 2 ? 1 : -1;
      return bl;
    },

    roofAt(x, z, except) {
      for (let i = 0; i < roofs.length; i++) { const r = roofs[i]; if (r !== except && x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r; }
      return null;
    },

    /** Distance along the unit ray to the first solid thing, or len. Fills `hit`. */
    ray(ox, oy, oz, dx, dy, dz, len, T) {
      let best = len;
      hit.kind = 0;
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (b.prop && W.erased) continue;
        const t = rayBox(ox, oy, oz, dx, dy, dz, best, b);
        if (t >= 0 && t < best) { best = t; hit.kind = b.prop ? 2 : 1; hit.surf = b.surf; hit.nx = nAxis === 0 ? nSign : 0; hit.ny = nAxis === 1 ? nSign : 0; hit.nz = nAxis === 2 ? nSign : 0; }
      }
      if (dy < -1e-6) { const t = -oy / dy; if (t >= 0 && t < best) { best = t; hit.kind = 3; hit.surf = 'brick'; hit.nx = 0; hit.ny = 1; hit.nz = 0; } }
      // The airship: an ellipsoid, solved as a unit sphere in its own scaled space.
      const c = W.blimp(T), px = (ox - c.x) / BLIMP.rx, py = (oy - c.y) / BLIMP.ry, pz = (oz - c.z) / BLIMP.rz;
      const qx = dx / BLIMP.rx, qy = dy / BLIMP.ry, qz = dz / BLIMP.rz;
      const A = qx * qx + qy * qy + qz * qz, B = px * qx + py * qy + pz * qz, C = px * px + py * py + pz * pz - 1;
      const disc = B * B - A * C;
      if (C > 0 && disc > 0) {
        const t = (-B - Math.sqrt(disc)) / A;
        if (t >= 0 && t < best) {
          best = t; hit.kind = 4; hit.surf = 'blimp';
          const nx = (px + qx * t) / BLIMP.rx, ny = (py + qy * t) / BLIMP.ry, nz = (pz + qz * t) / BLIMP.rz, l = Math.hypot(nx, ny, nz) || 1;
          hit.nx = nx / l; hit.ny = ny / l; hit.nz = nz / l;
        }
      }
      return best;
    },

    /** True when a smoke cloud lies across the segment. */
    smoked(ax, ay, az, bx, by, bz, T) {
      for (let i = 0; i < W.smokes.length; i++) {
        const s = W.smokes[i];
        if (T < s.t0 + 0.2 || T > s.t1 - 0.7) continue;
        const dx = bx - ax, dy = by - ay, dz = bz - az, l2 = dx * dx + dy * dy + dz * dz || 1;
        const u = clamp(((s.x - ax) * dx + (s.y - ay) * dy + (s.z - az) * dz) / l2, 0, 1);
        const ex = ax + dx * u - s.x, ey = ay + dy * u - s.y, ez = az + dz * u - s.z;
        if (ex * ex + ey * ey + ez * ez < s.r * s.r * 0.72) return true;
      }
      return false;
    },

    /** Can a see b? Walls, props, the airship — and, unless told otherwise, smoke. */
    los(ax, ay, az, bx, by, bz, T, throughSmoke) {
      const dx = bx - ax, dy = by - ay, dz = bz - az, l = Math.hypot(dx, dy, dz);
      if (l < 0.05) return true;
      if (W.ray(ax, ay, az, dx / l, dy / l, dz / l, l, T) < l - 0.05) return false;
      return throughSmoke || !W.smoked(ax, ay, az, bx, by, bz, T);
    },

    /** Keep (x, z) on roof r and out of its props. Result in the returned scratch object. */
    settle(r, x, z) {
      pos.x = clamp(x, r.x0 + EDGE, r.x1 - EDGE); pos.y = clamp(z, r.z0 + EDGE, r.z1 - EDGE);
      if (!W.erased) resolveCircleRects(pos, RADIUS, r.rects);
      pos.x = clamp(pos.x, r.x0 + EDGE, r.x1 - EDGE); pos.y = clamp(pos.y, r.z0 + EDGE, r.z1 - EDGE);
      return pos;
    },

    /**
     * Walk p by (dx, dz). Roofs that touch can be stepped between: down any drop, up a low
     * step. Returns 0, or 1 when p changed roof, or 2 when p ran at an alley it can hop —
     * then W.lt holds the landing.
     */
    walk(p, dx, dz) {
      const c = roofs[p.roof];
      let x = p.x + dx, z = p.z + dz, res = 0;
      const ex = x > c.x1 - EDGE ? 1 : x < c.x0 + EDGE ? -1 : 0, ez = z > c.z1 - EDGE ? 1 : z < c.z0 + EDGE ? -1 : 0;
      if ((ex || ez) && p.y - c.h < 0.5) {
        // Leaning on a parapet: is there a roof right behind it?
        let n = null, qx = x, qz = z;
        if (ex && ex * dx > 0) { qx = (ex > 0 ? c.x1 : c.x0) + ex * EDGE; n = W.roofAt(qx, clamp(z, c.z0 + EDGE, c.z1 - EDGE), c); qz = clamp(z, c.z0 + EDGE, c.z1 - EDGE); }
        if (!n && ez && ez * dz > 0) { qx = clamp(x, c.x0 + EDGE, c.x1 - EDGE); qz = (ez > 0 ? c.z1 : c.z0) + ez * EDGE; n = W.roofAt(qx, qz, c); }
        if (n && n.h - c.h <= STEP_UP && n.x1 - n.x0 > 2 * EDGE + 0.2) {
          p.roof = n.i;
          const s = W.settle(n, qx, qz);
          p.x = s.x; p.z = s.y;
          return 1;
        }
        // An alley: run at it and you hop it.
        if (!n && ex && ex * dx > 0 && Math.abs(dx) > Math.abs(dz) * 0.6) {
          const zz = clamp(z, c.z0 + EDGE, c.z1 - EDGE);
          for (let g = 1.2; g <= 3.6 && !n; g += 0.8) n = W.roofAt((ex > 0 ? c.x1 : c.x0) + ex * g, zz, c);
          if (n && n.h - c.h <= 1.1) {
            const s = W.settle(n, (ex > 0 ? n.x0 : n.x1) + ex * 1.3, zz);
            lt.ok = true; lt.x = s.x; lt.z = s.y; lt.roof = n.i;
            res = 2;
          }
        }
      }
      const s = W.settle(c, x, z);
      p.x = s.x; p.z = s.y;
      return res;
    },

    /**
     * Where LEAP would land a sniper standing at p who looks from (ex, ey, ez) along the unit
     * direction d: the roof under the crosshair, or failing that the next roof ahead. → W.lt
     */
    leapTarget(p, ex, ey, ez, dx, dy, dz) {
      const cur = roofs[p.roof];
      let best = null, bt = 1e9, tx = 0, tz = 0;
      if (dy < -0.01) for (let i = 0; i < roofs.length; i++) {
        const r = roofs[i];
        if (r === cur) continue;
        const t = (r.h - ey) / dy;
        if (t <= 0 || t >= bt) continue;
        const x = ex + dx * t, z = ez + dz * t;
        if (x < r.x0 - 0.4 || x > r.x1 + 0.4 || z < r.z0 - 0.4 || z > r.z1 + 0.4) continue;
        best = r; bt = t; tx = x; tz = z;
      }
      const hl = Math.hypot(dx, dz) || 1, hx = dx / hl, hz = dz / hl;
      if (best && Math.hypot(tx - p.x, tz - p.z) > LEAP_MAX) best = null;
      if (!best) for (let s = LEAP_MIN; s <= LEAP_MAX && !best; s += 1.25) {
        const r = W.roofAt(p.x + hx * s, p.z + hz * s, cur);
        if (r) { best = r; tx = p.x + hx * (s + 1.2); tz = p.z + hz * (s + 1.2); }
      }
      lt.ok = false;
      if (!best || best.h - p.y > LEAP_UP) return lt;
      const s = W.settle(best, clamp(tx, best.x0 + 1, best.x1 - 1), clamp(tz, best.z0 + 1, best.z1 - 1));
      if (Math.hypot(s.x - p.x, s.y - p.z) < LEAP_MIN - 1.5) return lt;
      lt.ok = true; lt.x = s.x; lt.z = s.y; lt.roof = best.i;
      return lt;
    },
  };
  return W;
}
