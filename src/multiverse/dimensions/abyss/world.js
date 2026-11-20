// THE DEEP — the reef as numbers: the seabed heightfield, every collider, the kelp, the
// wreck and the places a diver can hold. No three.js here; build.js turns this into
// meshes and the game, the bot and the spears ask it questions.
//
// Axes: y up, the surface at y = 0. The reef wall runs along z (the duel axis): the sunlit
// shelf and its kelp are at -x, the drop-off into the abyss at +x. A ledge halfway down the
// wall holds the wreck at the centre. Every seeded feature is mirrored z → -z, so spawn A
// (z < 0) and spawn B (z > 0) face the same reef.
import { clamp, lerp, smoothstep, noise2, fbm, rand } from '../../kit.js';

export const ARENA = { x0: -36, x1: 32, z: 47, y0: -46, y1: -1.7 };
export const SPAWN = [
  { x: 2, y: -12.5, z: -31, yaw: Math.PI },
  { x: 2, y: -12.5, z: 31, yaw: 0 },
];
export const RADIUS = 0.5; // a diver, for the world

const zf = (z) => Math.sqrt(z * z + 4); // symmetric in z without a crease at 0

export function edgeX(z) { return -1.2 + 3.4 * noise2(zf(z) * 0.045, 1.7); }

export function heightAt(x, z) {
  const zz = zf(z);
  const t = x - edgeX(z) + 1.4 * fbm(zz * 0.11, x * 0.05 + 3, 2);
  // the shelf: rolling sand and rock, shallower inshore
  let y = -11.6 + 1.5 * fbm(x * 0.07 + 7, zz * 0.07, 3) + 4.2 * smoothstep(-14, -70, t);
  // spur-and-groove channels running out to the lip
  y += 0.7 * Math.sin(zz * 0.42 + noise2(x * 0.05, zz * 0.05) * 3) * smoothstep(-30, -6, t) * smoothstep(1, -3, t);
  const ledge = 1 - smoothstep(17, 29, zz);
  const L = 4.2 + 14 * ledge;
  y -= 12.5 * smoothstep(0, 4.6, t);                        // the first wall, down to the ledge
  y -= 30 * smoothstep(L, L + 6.5, t) + 92 * smoothstep(L + 4, L + 72, t); // the second, into the deep
  // rock texture where it is steep
  const steep = smoothstep(-1, 2, t) * (1 - smoothstep(L + 9, L + 20, t)) + smoothstep(L - 1, L + 4, t) * (1 - smoothstep(L + 8, L + 26, t));
  y += 1.6 * fbm(x * 0.21, z * 0.21 + y * 0.08, 3) * steep;
  return y;
}

export function normalAt(x, z, out) {
  const e = 0.35;
  const dx = heightAt(x + e, z) - heightAt(x - e, z), dz = heightAt(x, z + e) - heightAt(x, z - e);
  const l = Math.hypot(dx, 2 * e, dz);
  out.x = -dx / l; out.y = (2 * e) / l; out.z = -dz / l;
  return out;
}

// ---------------------------------------------------------------------------------------
// Oriented boxes: { c:[x,y,z], ax:[3 unit axes], he:[3 half extents], surf, local }

// The wreck in its own frame: x across (+x = starboard, towards the deep), y up from the
// keel, z along (+z = bow). These numbers are shared by the mesh and the colliders.
export const HULL = { len: 17, half: 8.5, beam: 2.7, depth: 3.7, deck: 3.25, hatch: [-1.2, 2.6, 1.45], breach: [-3.2, 0.6, 0.85, 2.85] };
export function hullHalfBeam(z) {
  const bow = Math.pow(clamp((z + 1.5) / 10, 0, 1), 2.3);
  return HULL.beam * Math.sqrt(Math.max(0, 1 - bow)) * (1 - 0.14 * smoothstep(-4, -8.5, z));
}

export function buildWorld(rng) {
  const spheres = [];  // { x, y, z, r, surf }
  const boxes = [];    // obb()
  const decor = { brain: [], branch: [], fan: [], sponge: [], boulder: [], outcrop: [], grass: [] };
  const kelp = [];     // { x, y, z, h, phase }
  const kelpPatches = []; // { x, y, z, r, k }
  const arches = [];   // { x, y, z, span, rise, r, yaw }

  const mirrored = (fn) => { fn(1); fn(-1); };
  // A random stream per half, but one value per pair: both halves get the same feature.
  const R = (a, b) => rand(rng, a, b);

  // ---- kelp forests on the shelf
  const kelpSpots = [];
  for (let i = 0; i < 4; i++) kelpSpots.push({ x: R(-30, -9), z: R(7, 42), r: R(5, 9) });
  kelpSpots.push({ x: R(-18, -12), z: R(1.5, 3.5), r: 4.5 }); // a thin screen across the middle
  for (const s of kelpSpots) {
    const n = Math.round(s.r * s.r * 0.33);
    const stalks = [];
    for (let j = 0; j < n; j++) {
      const a = R(0, Math.PI * 2), d = Math.sqrt(R(0, 1)) * s.r;
      stalks.push({ dx: Math.cos(a) * d, dz: Math.sin(a) * d, h: R(0.72, 1), phase: R(0, 6.28) });
    }
    mirrored((m) => {
      const cz = s.z * m;
      for (const st of stalks) {
        const x = s.x + st.dx, z = cz + st.dz * m, y = heightAt(x, z);
        const top = lerp(-4.2, -1.4, st.h);
        kelp.push({ x, y, z, h: top - y, phase: st.phase + (m < 0 ? 1.3 : 0) });
      }
      kelpPatches.push({ x: s.x, y: heightAt(s.x, cz) + 4.5, z: cz, r: s.r + 1, k: 0.22 });
    });
  }

  // ---- arches: rock bridges near the lip, swum through along z
  {
    const z = R(14, 19), x = R(-9, -6), yaw = R(-0.25, 0.25), span = R(8.5, 10), rise = R(6.5, 8), r = R(1.4, 1.8);
    mirrored((m) => {
      const y = heightAt(x, z * m) - 0.6;
      arches.push({ x, y, z: z * m, span, rise, r, yaw: yaw * m });
      // colliders along the arc (in the arch's x-y plane, turned by yaw)
      for (let k = 0; k <= 16; k++) {
        const a = (k / 16) * Math.PI, lx = -Math.cos(a) * span * 0.5, ly = Math.sin(a) * rise;
        const thick = r * (1.25 - 0.35 * Math.sin(a));
        spheres.push({ x: x + Math.cos(yaw * m) * lx, y: y + ly, z: z * m - Math.sin(yaw * m) * lx, r: thick, surf: 'rock' });
      }
    });
  }

  // ---- coral heads, boulders, wall outcrops
  const clearOfArches = (x, z, pad) => arches.every((a) => Math.hypot(x - a.x, z - a.z) > a.span * 0.5 + pad);
  for (let i = 0; i < 15; i++) {
    const x = R(-32, -1.5), z = R(3, 44), r = R(0.8, 2.1), kind = R(0, 1);
    if (!clearOfArches(x, z, 2)) continue;
    mirrored((m) => {
      const y = heightAt(x, z * m);
      decor.brain.push({ x, y: y + r * 0.35, z: z * m, r, hue: kind, rot: R(0, 6.28) });
      spheres.push({ x, y: y + r * 0.2, z: z * m, r: r * 0.95, surf: 'coral' });
    });
  }
  for (let i = 0; i < 46; i++) {
    const x = R(-33, 0.5), z = R(1, 45), s = R(0.5, 1.4), kind = R(0, 1);
    mirrored((m) => {
      const y = heightAt(x, z * m);
      if (kind < 0.4) decor.branch.push({ x, y, z: z * m, s, rot: R(0, 6.28), hue: R(0, 1) });
      else if (kind < 0.7) decor.fan.push({ x, y, z: z * m, s: s * 1.5, rot: R(0, 6.28), hue: R(0, 1) });
      else decor.sponge.push({ x, y, z: z * m, s, rot: R(0, 6.28), hue: R(0, 1) });
    });
  }
  for (let i = 0; i < 90; i++) {
    const x = R(-34, 2), z = R(0, 46), s = R(0.4, 1);
    mirrored((m) => decor.grass.push({ x, y: heightAt(x, z * m), z: z * m, s, rot: R(0, 6.28) }));
  }
  for (let i = 0; i < 7; i++) {
    const x = R(-30, 14), z = R(4, 44), r = R(1.6, 3.8);
    if (!clearOfArches(x, z, r + 1)) continue;
    mirrored((m) => {
      const y = heightAt(x, z * m);
      if (y < -36) return;
      decor.boulder.push({ x, y: y + r * 0.25, z: z * m, r, rot: R(0, 6.28) });
      spheres.push({ x, y: y + r * 0.25, z: z * m, r: r * 0.92, surf: 'rock' });
    });
  }
  // outcrops studding the wall face: they break the heightfield's smoothness and give cover
  for (let i = 0; i < 16; i++) {
    const z = R(0, 46), depth = R(-34, -14), r = R(1.4, 3.2);
    mirrored((m) => {
      const zz = z * m;
      // find the wall's x at this depth
      let x = -2;
      for (let k = 0; k < 40 && heightAt(x, zz) > depth; k++) x += 0.6;
      decor.outcrop.push({ x: x - r * 0.3, y: depth, z: zz, r, rot: R(0, 6.28) });
      spheres.push({ x: x - r * 0.3, y: depth, z: zz, r: r * 0.9, surf: 'rock' });
    });
  }

  // ---- the wreck: on the ledge, bow towards +z, listing towards the deep
  const wx = edgeX(0) + 11.5, wz = 0.6;
  const wreck = { x: wx, y: heightAt(wx, wz) - 0.35, z: wz, yaw: 0.1, pitch: -0.045, roll: 0.2 };
  {
    const w = wreck, H = HULL;
    const cy = Math.cos(w.yaw), sy = Math.sin(w.yaw), cp = Math.cos(w.pitch), sp = Math.sin(w.pitch), cr = Math.cos(w.roll), sr = Math.sin(w.roll);
    // local → world, matching obb()'s rotation
    const toW = (lx, ly, lz) => {
      // roll about z, then pitch about x, then yaw about y
      const x1 = lx * cr - ly * sr, y1 = lx * sr + ly * cr, z1 = lz;
      const y2 = y1 * cp - z1 * sp, z2 = y1 * sp + z1 * cp;
      return [w.x + x1 * cy + z2 * sy, w.y + y2, w.z - x1 * sy + z2 * cy];
    };
    w.toW = toW;
    const rot = (lx, ly, lz) => { const a = toW(lx, ly, lz); return [a[0] - w.x, a[1] - w.y, a[2] - w.z]; };
    const box = (lx, ly, lz, hx, hy, hz, ryaw = 0, surf = 'wood') => {
      const cr2 = Math.cos(ryaw), sr2 = Math.sin(ryaw);
      boxes.push({ c: toW(lx, ly, lz), ax: [rot(cr2, 0, -sr2), rot(0, 1, 0), rot(sr2, 0, cr2)], he: [hx, hy, hz], surf, local: [lx, ly, lz, hx, hy, hz, ryaw] });
    };
    box(0, 0.3, 0, H.beam * 0.55, 0.32, H.half - 0.4);                 // keel and floor
    box(0, H.depth * 0.5, -H.half + 0.12, H.beam * 0.86, H.depth * 0.5, 0.14); // transom
    // the sides, in segments that follow the taper; the starboard middle one has the breach
    const segs = [[-8.4, -3.2], [-3.2, 0.6], [0.6, 4], [4, 6.6], [6.6, 8.4]];
    for (const [z0, z1] of segs) {
      const zc = (z0 + z1) / 2, b0 = hullHalfBeam(z0), b1 = hullHalfBeam(z1), bc = (b0 + b1) / 2 * 0.95, len = Math.hypot(z1 - z0, b1 - b0) / 2;
      const ang = Math.atan2(b0 - b1, z1 - z0);
      for (const s of [-1, 1]) {
        if (s > 0 && z0 === H.breach[0]) {
          box(bc, H.breach[2] * 0.5, zc, 0.16, H.breach[2] * 0.5, len, -ang);
          box(bc, (H.breach[3] + H.depth) * 0.5, zc, 0.16, (H.depth - H.breach[3]) * 0.5, len, -ang);
        } else box(bc * s, H.depth * 0.5, zc, 0.16, H.depth * 0.5, len, -ang * s);
      }
    }
    // the deck, round the hatch
    const [hz0, hz1, hx] = H.hatch;
    box(0, H.deck, (hz1 + 7.6) / 2, H.beam * 0.8, 0.14, (7.6 - hz1) / 2);
    box(0, H.deck, (-8.3 + hz0) / 2, H.beam * 0.86, 0.14, (hz0 + 8.3) / 2);
    box((hx + H.beam) / 2, H.deck, (hz0 + hz1) / 2, (H.beam - hx) / 2, 0.14, (hz1 - hz0) / 2);
    box(-(hx + H.beam) / 2, H.deck, (hz0 + hz1) / 2, (H.beam - hx) / 2, 0.14, (hz1 - hz0) / 2);
    box(0, H.deck + 1.25, -5.4, 1.55, 1.25, 1.9);                      // wheelhouse
    // the mast: broken off and leaning over the deep
    const m0 = toW(0, H.deck, 4.6), m1 = toW(2.4, H.deck + 8.5, 5.4);
    wreck.mast = [m0, m1];
    for (let k = 0; k <= 5; k++) {
      const u = k / 5;
      spheres.push({ x: lerp(m0[0], m1[0], u), y: lerp(m0[1], m1[1], u), z: lerp(m0[2], m1[2], u), r: 0.28, surf: 'wood' });
    }
  }

  // ---- places worth holding (the bot's map): a coarse lattice of open-water points,
  // scored by how much cover sits around them
  const posts = [];
  for (let x = -30; x <= 26; x += 6) {
    for (let z = -42; z <= 42; z += 6) {
      const floor = heightAt(x, z);
      for (const up of [2.6, 6.5]) {
        const y = Math.min(floor + up, -7.5);
        if (y < ARENA.y0 + 3 || y - floor < 1.6) continue;
        const p = { x, y, z, cover: 0 };
        let blocked = false;
        for (const s of spheres) {
          const d = Math.hypot(s.x - x, s.y - y, s.z - z);
          if (d < s.r + 1.2) { blocked = true; break; }
          if (d < s.r + 5) p.cover += 1;
        }
        if (blocked || pointInBoxes(boxes, x, y, z, 1.2)) continue;
        for (const k of kelpPatches) if (Math.hypot(k.x - x, k.z - z) < k.r) p.cover += 2;
        if (floor > -16 && up < 3) p.cover += 1; // hugging the shelf
        posts.push(p);
      }
    }
  }

  return { spheres, boxes, decor, kelp, kelpPatches, arches, wreck, posts };
}

function pointInBoxes(boxes, x, y, z, pad) {
  for (const b of boxes) {
    const dx = x - b.c[0], dy = y - b.c[1], dz = z - b.c[2];
    let inside = true;
    for (let i = 0; i < 3 && inside; i++) {
      const a = b.ax[i], d = dx * a[0] + dy * a[1] + dz * a[2];
      if (Math.abs(d) > b.he[i] + pad) inside = false;
    }
    if (inside) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------
// Queries. `hit` is reused: after a ray, hit.t (fraction), hit.n (normal), hit.surf.
export const hit = { t: 1, nx: 0, ny: 1, nz: 0, surf: '' };
const nrm = { x: 0, y: 1, z: 0 };

// Segment from o along d·len (d unit) against the static world. Returns the distance to
// the first contact (or len) and fills `hit`.
export function rayWorld(W, ox, oy, oz, dx, dy, dz, len) {
  let best = len;
  hit.surf = '';
  // the seabed: march, then refine by bisection
  const steps = Math.max(2, Math.ceil(len / 0.8));
  let pd = oy - heightAt(ox, oz);
  if (pd > 0) {
    for (let i = 1; i <= steps; i++) {
      const s = (len * i) / steps, x = ox + dx * s, y = oy + dy * s, z = oz + dz * s, d = y - heightAt(x, z);
      if (d <= 0) {
        let a = (len * (i - 1)) / steps, b = s;
        for (let k = 0; k < 6; k++) { const m = (a + b) / 2; if (oy + dy * m - heightAt(ox + dx * m, oz + dz * m) > 0) a = m; else b = m; }
        best = b;
        normalAt(ox + dx * b, oz + dz * b, nrm);
        hit.nx = nrm.x; hit.ny = nrm.y; hit.nz = nrm.z; hit.surf = 'sand';
        break;
      }
      pd = d;
    }
  }
  for (const s of W.spheres) {
    const fx = ox - s.x, fy = oy - s.y, fz = oz - s.z;
    const b = fx * dx + fy * dy + fz * dz, c = fx * fx + fy * fy + fz * fz - s.r * s.r;
    if (c > 0 && b > 0) continue;
    const disc = b * b - c;
    if (disc < 0) continue;
    const t = -b - Math.sqrt(disc);
    if (t >= 0 && t < best) {
      best = t;
      const hx = ox + dx * t - s.x, hy = oy + dy * t - s.y, hz = oz + dz * t - s.z, l = Math.hypot(hx, hy, hz) || 1;
      hit.nx = hx / l; hit.ny = hy / l; hit.nz = hz / l; hit.surf = s.surf;
    }
  }
  for (const bx of W.boxes) {
    const t = rayBox(bx, ox, oy, oz, dx, dy, dz, best);
    if (t >= 0 && t < best) { best = t; hit.surf = bx.surf; }
  }
  hit.t = best / len;
  return best;
}

const rb = { n: 0, s: 0 };
function rayBox(b, ox, oy, oz, dx, dy, dz, len) {
  const px = ox - b.c[0], py = oy - b.c[1], pz = oz - b.c[2];
  let t0 = 0, t1 = len;
  rb.n = -1;
  for (let i = 0; i < 3; i++) {
    const a = b.ax[i], o = px * a[0] + py * a[1] + pz * a[2], d = dx * a[0] + dy * a[1] + dz * a[2], e = b.he[i];
    if (Math.abs(d) < 1e-9) { if (o < -e || o > e) return -1; continue; }
    let ta = (-e - o) / d, tb = (e - o) / d, s = -1;
    if (ta > tb) { const q = ta; ta = tb; tb = q; s = 1; }
    if (ta > t0) { t0 = ta; rb.n = i; rb.s = s; }
    if (tb < t1) t1 = tb;
    if (t0 > t1) return -1;
  }
  if (rb.n < 0) return -1; // started inside
  const a = b.ax[rb.n];
  hit.nx = a[0] * rb.s; hit.ny = a[1] * rb.s; hit.nz = a[2] * rb.s;
  return t0;
}

// Keep a sphere at p {x,y,z} (mutated) out of the seabed, the colliders and the arena's
// edges. Returns how hard it was pushed (m) and leaves the last push direction in nrm.
export function collide(W, p, r) {
  let pushed = 0;
  const floor = heightAt(p.x, p.z) + r;
  if (p.y < floor) {
    normalAt(p.x, p.z, nrm);
    pushed += floor - p.y;
    p.y = floor;
  }
  for (const s of W.spheres) {
    const dx = p.x - s.x, dy = p.y - s.y, dz = p.z - s.z, rr = s.r + r, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= rr * rr) continue;
    const d = Math.sqrt(d2) || 1e-3, k = (rr - d) / d;
    p.x += dx * k; p.y += dy * k; p.z += dz * k;
    pushed += rr - d;
  }
  for (const b of W.boxes) {
    const px = p.x - b.c[0], py = p.y - b.c[1], pz = p.z - b.c[2];
    // closest point in the box, in its frame
    let qx = 0, qy = 0, qz = 0, inside = true, minPen = 1e9, minAx = 0, minS = 1;
    for (let i = 0; i < 3; i++) {
      const a = b.ax[i], o = px * a[0] + py * a[1] + pz * a[2], e = b.he[i];
      const c = o < -e ? -e : o > e ? e : o;
      if (c !== o) inside = false;
      const pen = e - Math.abs(o);
      if (pen < minPen) { minPen = pen; minAx = i; minS = o < 0 ? -1 : 1; }
      qx += a[0] * c; qy += a[1] * c; qz += a[2] * c;
    }
    if (inside) {
      const a = b.ax[minAx], k = (minPen + r) * minS;
      p.x += a[0] * k; p.y += a[1] * k; p.z += a[2] * k;
      pushed += minPen + r;
      continue;
    }
    const dx = px - qx, dy = py - qy, dz = pz - qz, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= r * r) continue;
    const d = Math.sqrt(d2) || 1e-3, k = (r - d) / d;
    p.x += dx * k; p.y += dy * k; p.z += dz * k;
    pushed += r - d;
  }
  return pushed;
}

// How much kelp a sight line passes through (0 clear .. 1+ opaque).
export function kelpAlong(W, ax, ay, az, bx, by, bz) {
  let acc = 0;
  const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz) || 1;
  for (const k of W.kelpPatches) {
    // length of the segment inside the patch's vertical cylinder (top at the surface)
    const fx = ax - k.x, fz = az - k.z, a = dx * dx + dz * dz;
    if (a < 1e-6) { if (fx * fx + fz * fz < k.r * k.r) acc += len * k.k * 0.5; continue; }
    const b = fx * dx + fz * dz, c = fx * fx + fz * fz - k.r * k.r, disc = b * b - a * c;
    if (disc <= 0) continue;
    const sq = Math.sqrt(disc), t0 = clamp((-b - sq) / a, 0, 1), t1 = clamp((-b + sq) / a, 0, 1);
    if (t1 <= t0) continue;
    // only below the kelp's canopy
    const ym = ay + dy * (t0 + t1) * 0.5;
    if (ym > -1.5 || ym < k.y - 6) continue;
    acc += (t1 - t0) * len * k.k;
  }
  return acc;
}

// Inside the arena? Returns a push back towards it (the current) in out, 0 when inside.
export function boundsPush(p, out) {
  out.x = p.x < ARENA.x0 ? ARENA.x0 - p.x : p.x > ARENA.x1 ? ARENA.x1 - p.x : 0;
  out.z = p.z < -ARENA.z ? -ARENA.z - p.z : p.z > ARENA.z ? ARENA.z - p.z : 0;
  out.y = p.y < ARENA.y0 ? ARENA.y0 - p.y : p.y > ARENA.y1 ? ARENA.y1 - p.y : 0;
  return Math.abs(out.x) + Math.abs(out.y) + Math.abs(out.z);
}
