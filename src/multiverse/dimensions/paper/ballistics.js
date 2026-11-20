// Flight of a round, planned the moment it leaves the barrel. The path is analytic (muzzle velocity, drop, a
// sideways wind push), so both clients can draw it; steel, the ground, paper holes and cardboard decoys along it are
// worked out once with the world as it will be at each instant (the crane and forklifts are pure functions of time).
// Only the other sniper is judged live, frame by frame, because they move.
import { shotAt, MAXT } from './fx.js';
import { sheetHit } from './figures.js';

export const hitN = { x: 0, y: 0, z: 0 };
const A = { x: 0, y: 0, z: 0 }, B = { x: 0, y: 0, z: 0 };

/** First entry of segment a→b into an axis-aligned box: t in [0, 1] or -1. Sets hitN to the face normal. */
export function segBoxT(ax, ay, az, bx, by, bz, b) {
  let t0 = 0, t1 = 1, nx = 0, ny = 0, nz = 0;
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  for (let i = 0; i < 3; i++) {
    const o = i === 0 ? ax : i === 1 ? ay : az, d = i === 0 ? dx : i === 1 ? dy : dz;
    const lo = i === 0 ? b.x0 : i === 1 ? b.y0 : b.z0, hi = i === 0 ? b.x1 : i === 1 ? b.y1 : b.z1;
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return -1; continue; }
    let ta = (lo - o) / d, tb = (hi - o) / d, s = -1;
    if (ta > tb) { const q = ta; ta = tb; tb = q; s = 1; }
    if (ta > t0) { t0 = ta; nx = i === 0 ? s : 0; ny = i === 1 ? s : 0; nz = i === 2 ? s : 0; }
    if (tb < t1) t1 = tb;
    if (t0 > t1) return -1;
  }
  if (!nx && !ny && !nz) return -1; // started inside
  hitN.x = nx; hitN.y = ny; hitN.z = nz;
  return t0;
}

/** Crossing of a→b with a paper panel's plane: sets cross.{t,u,v}; false when it misses the sheet. */
export const cross = { t: 0, u: 0, v: 0 };
export function panelCross(p, ax, ay, az, bx, by, bz) {
  const s0 = (ax - p.x) * p.nx + (az - p.z) * p.nz, s1 = (bx - p.x) * p.nx + (bz - p.z) * p.nz;
  if ((s0 > 0 && s1 > 0) || (s0 < 0 && s1 < 0) || s0 === s1) return false;
  const t = s0 / (s0 - s1);
  const px = ax + (bx - ax) * t, py = ay + (by - ay) * t, pz = az + (bz - az) * t;
  const u = (px - p.x) * p.ux + (pz - p.z) * p.uz, v = py - p.y0;
  if (u < -p.w / 2 || u > p.w / 2 || v < 0 || v > p.h) return false;
  cross.t = t; cross.u = u; cross.v = v;
  return true;
}

/**
 * Plan a shot: fills s.tauEnd, s.endKind ('steel' | 'ground' | 'air'), s.end* (point and normal), s.holes
 * ([panelId, u, v, tau]...) and s.hits ([standeeSlot, tau]...).
 */
export function planFlight(s, env, t0) {
  s.holes.length = 0;
  s.hits.length = 0;
  s.endKind = 'air';
  s.tauEnd = MAXT;
  const dt = 1 / 100;
  let prev = 0;
  shotAt(s, 0, A);
  const stands = env.standeeList();
  for (let tau = dt; tau <= MAXT + 1e-6; tau += dt) {
    shotAt(s, tau, B);
    const dyn = env.dynAt(t0 + tau);
    let best = 2, kind = '', n = null;
    for (const b of env.boxes) {
      const t = segBoxT(A.x, A.y, A.z, B.x, B.y, B.z, b);
      if (t >= 0 && t < best) { best = t; kind = 'steel'; n = { x: hitN.x, y: hitN.y, z: hitN.z }; }
    }
    for (let i = 0; i < dyn.length; i++) {
      const t = segBoxT(A.x, A.y, A.z, B.x, B.y, B.z, dyn[i]);
      if (t >= 0 && t < best) { best = t; kind = 'steel'; n = { x: hitN.x, y: hitN.y, z: hitN.z }; }
    }
    if (B.y < 0 && A.y >= 0) { const t = A.y / (A.y - B.y); if (t < best) { best = t; kind = 'ground'; n = { x: 0, y: 1, z: 0 }; } }
    for (const p of env.panels) {
      if (!panelCross(p, A.x, A.y, A.z, B.x, B.y, B.z) || cross.t >= best) continue;
      if (p.fig && !sheetHit(cross.u, cross.v)) continue;
      if (env.inHole(p, cross.u, cross.v)) continue;
      let dup = false;
      for (const h of s.holes) if (h[0] === p.id) dup = true;
      if (!dup && s.holes.length < 6) s.holes.push([p.id, cross.u, cross.v, prev + (tau - prev) * cross.t]);
    }
    for (const st of stands) {
      if (st.owner === s.owner) continue;
      if (panelCross(st, A.x, A.y, A.z, B.x, B.y, B.z) && cross.t < best && sheetHit(cross.u, cross.v)) s.hits.push([st.slot, prev + (tau - prev) * cross.t]);
    }
    if (kind) {
      const tt = prev + (tau - prev) * best;
      s.tauEnd = tt;
      s.endKind = kind;
      shotAt(s, tt, B);
      s.ex = B.x; s.ey = B.y; s.ez = B.z; s.en = n;
      return;
    }
    A.x = B.x; A.y = B.y; A.z = B.z;
    prev = tau;
  }
  shotAt(s, MAXT, B);
  s.ex = B.x; s.ey = B.y; s.ez = B.z; s.en = null;
}

/**
 * Does segment a→b pass through the printed sniper standing at (fx, fz) with sheet yaw `yaw`? Returns 0 (no),
 * 1 (hit) or 2 (head). The sheet is thick enough that a clean edge-on pose is a few centimetres wide.
 */
export function sheetSeg(fx, fz, yaw, ax, ay, az, bx, by, bz) {
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  const rax = ax - fx, raz = az - fz, rbx = bx - fx, rbz = bz - fz;
  const lxa = rax * c - raz * sn, lza = rax * sn + raz * c, lxb = rbx * c - rbz * sn, lzb = rbx * sn + rbz * c;
  const TH = 0.075;
  let t0 = 0, t1 = 1;
  const dz = lzb - lza;
  if (Math.abs(dz) < 1e-9) { if (Math.abs(lza) > TH) return 0; }
  else {
    let ta = (-TH - lza) / dz, tb = (TH - lza) / dz;
    if (ta > tb) { const q = ta; ta = tb; tb = q; }
    t0 = Math.max(0, ta); t1 = Math.min(1, tb);
    if (t0 > t1) return 0;
  }
  let res = 0;
  for (let k = 0; k < 5; k++) {
    const t = t0 + ((t1 - t0) * k) / 4;
    const lx = lxa + (lxb - lxa) * t, ly = ay + (by - ay) * t;
    if (sheetHit(lx, ly)) { res = Math.max(res, ly > 1.3 ? 2 : 1); }
  }
  return res;
}
