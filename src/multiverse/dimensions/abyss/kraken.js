// THE DEEP — the kraken. A mantle the length of the wreck, eight arms of 26 m, two feeding
// tentacles that stretch to 60 m, and one great pale eye on each side of its head.
//
// Everything it does is a pure function of the round clock and the seed (both clients see
// the same animal):
//   PATROL   a slow loop far below the drop-off, ~50 m down, lights rippling along its arms.
//   REACH    while it patrols, the two feeding tentacles climb out of the deep into the open
//            water and sweep along it: two moving walls across the long sightline.
//   PASS     twice a round it rises up the wall and glides over the arena just under the
//            surface, its bulk darkening the reef and cutting the light shafts, its arms
//            dragging down through the depth the divers fight at.
//   CAGE     sudden death: it settles under the wreck and raises all eight arms round the
//            arena in a ring of pillars that closes in.
// It shoves and blinds; it never kills. Only a spear scores.
import { clamp, lerp, smoothstep, makeRng, hashSeed } from '../../kit.js';
import { WATER_GLSL, VERT_COMMON } from './shaders.js';

export const ROUND = 60;
const N = 24;                 // centreline points per arm
const ARMS = 8, TENT = 2, ALL = ARMS + TENT;
const ARM_LEN = 26, TENT_LEN = 42;
export const CAGE_C = { x: 5, z: 0 };

const smooth = (a, b, t) => smoothstep(a, b, t);
const env = (t, t0, t1, fade) => Math.min(smooth(t0, t0 + fade, t), 1 - smooth(t1 - fade, t1, t));

// Catmull-Rom through pts (arrays of [x,y,z]) at u in [0,1].
function spline(pts, u, out) {
  const n = pts.length - 1, f = clamp(u, 0, 1) * n, i = Math.min(n - 1, Math.floor(f)), t = f - i;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
  const t2 = t * t, t3 = t2 * t;
  for (let k = 0; k < 3; k++) {
    out[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
  }
  return out;
}

export function makeKrakenSim(seed) {
  const rng = makeRng(hashSeed(seed, 'kraken'));
  const ph = [rng() * 6.28, rng() * 6.28, rng() * 6.28];
  const W = (Math.PI * 2) / 84;
  const passes = [];
  const p1 = 15 + rng() * 6, d1 = rng() < 0.5 ? 1 : -1;
  passes.push({ t0: p1, dur: 30, dir: d1 }, { t0: p1 + 36 + rng() * 4, dur: 30, dir: -d1 });
  const reaches = [];
  const rz = rng() < 0.5 ? 1 : -1;
  reaches.push({ t0: 2.5 + rng() * 2, dur: 13, z0: -24 * rz, z1: 12 * rz, x: 12 + rng() * 4 });
  reaches.push({ t0: passes[0].t0 + 31, dur: 12, z0: 20 * rz, z1: -16 * rz, x: 13 + rng() * 4 });
  for (const p of passes) {
    const s = p.dir;
    p.pts = [null, [34, -32, -48 * s], [9, -9.5, -30 * s], [1.5, -6.2, -4 * s], [3, -6.6, 22 * s], [30, -30, 50 * s], null];
  }

  function patrol(t, out) {
    out[0] = 25 + 11 * Math.sin(W * t + ph[0]);
    out[1] = -49 + 5 * Math.sin(W * 1.7 * t + ph[1]);
    out[2] = 28 * Math.sin(W * 0.5 * t + ph[2]);
    return out;
  }
  const tmpA = [0, 0, 0], tmpB = [0, 0, 0];
  // The body centre at time t, and how strongly a pass is under way (0..1).
  function bodyAt(t, out) {
    patrol(t, out);
    let pw = 0;
    for (const p of passes) {
      if (t < p.t0 || t > p.t0 + p.dur) continue;
      p.pts[0] = patrol(p.t0, [0, 0, 0]);
      p.pts[6] = patrol(p.t0 + p.dur, [0, 0, 0]);
      const u = (t - p.t0) / p.dur;
      spline(p.pts, u, tmpA);
      out[0] = tmpA[0]; out[1] = tmpA[1]; out[2] = tmpA[2];
      pw = env(t, p.t0, p.t0 + p.dur, 6);
    }
    if (t > ROUND) {
      // sudden death: down under the wreck, rising a little as the cage closes
      const k = smooth(ROUND, ROUND + 7, t);
      out[0] = lerp(out[0], CAGE_C.x + 6, k);
      out[1] = lerp(out[1], -58 + 6 * smooth(ROUND + 7, ROUND + 30, t), k);
      out[2] = lerp(out[2], CAGE_C.z, k);
      pw *= 1 - k;
    }
    return pw;
  }

  // ---- live state, refreshed by update(t)
  const S = {
    t: 0, pos: [0, -50, 0], F: [0, 0, 1], U: [0, 1, 0], R: [1, 0, 0], speed: 1, pass: 0, reach: 0, cage: 0, cageR: 60,
    head: [0, 0, 0], eye: [[0, 0, 0], [0, 0, 0]],
    lines: [], radii: [], box: [], // per tentacle: Float32Array(N*3), Float32Array(N), [minx,miny,minz,maxx,maxy,maxz]
    reachTips: [[0, 0, 0], [0, 0, 0]], wake: 0,
  };
  for (let a = 0; a < ALL; a++) {
    S.lines.push(new Float32Array(N * 3));
    const r = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      const s = k / (N - 1);
      r[k] = a < ARMS ? 1.45 * Math.pow(1 - s, 0.85) + 0.1 : 0.62 * (1 - s) + 0.12 + 0.42 * Math.exp(-Math.pow((s - 0.88) / 0.05, 2));
    }
    S.radii.push(r);
    S.box.push([0, 0, 0, 0, 0, 0]);
  }
  const lagF = [];
  for (let k = 0; k < N; k++) lagF.push([0, 0, 1]);
  const prev = [0, 0, 0], next = [0, 0, 0];

  function frameAt(t, F) {
    bodyAt(t - 0.7, prev);
    bodyAt(t + 0.7, next);
    let fx = next[0] - prev[0], fy = next[1] - prev[1], fz = next[2] - prev[2];
    const l = Math.hypot(fx, fy, fz);
    if (l < 1e-4) { fx = 0; fy = 0; fz = 1; } else { fx /= l; fy /= l; fz /= l; }
    F[0] = fx; F[1] = fy; F[2] = fz;
    return l / 1.4;
  }

  function update(t) {
    S.t = t;
    S.pass = bodyAt(t, S.pos);
    S.speed = frameAt(t, S.F);
    // the mantle points along its travel; level it a little so it never swims on its side
    const F = S.F;
    let ux = -F[0] * F[1], uy = 1 - F[1] * F[1], uz = -F[2] * F[1];
    const ul = Math.hypot(ux, uy, uz) || 1;
    S.U[0] = ux / ul; S.U[1] = uy / ul; S.U[2] = uz / ul;
    const U = S.U, R = S.R;
    R[0] = U[1] * F[2] - U[2] * F[1]; R[1] = U[2] * F[0] - U[0] * F[2]; R[2] = U[0] * F[1] - U[1] * F[0];
    // head (arm roots) behind the body centre
    for (let k = 0; k < 3; k++) S.head[k] = S.pos[k] - F[k] * 6.2;
    for (let e = 0; e < 2; e++) for (let k = 0; k < 3; k++) S.eye[e][k] = S.pos[k] - F[k] * 4.6 + R[k] * (e ? 2.75 : -2.75) + U[k] * 0.5;
    for (let k = 0; k < N; k++) frameAt(t - (k / (N - 1)) * 3.2, lagF[k]);

    S.reach = 0;
    for (const r of reaches) S.reach = Math.max(S.reach, env(t, r.t0, r.t0 + r.dur, 3.2));
    S.cage = smooth(ROUND + 1, ROUND + 8, t);
    S.cageR = lerp(44, 12.5, smooth(ROUND + 5, ROUND + 30, t));
    S.wake = Math.max(S.pass, S.reach * 0.5, S.cage * 0.6);

    const droop = lerp(0.22, 0.62, S.pass);
    for (let a = 0; a < ALL; a++) {
      const L = S.lines[a], tent = a >= ARMS;
      const th = tent ? (a === ARMS ? -0.5 : 0.5) - Math.PI / 2 : (a / ARMS) * Math.PI * 2 + 0.3;
      const ca = Math.cos(th), sa = Math.sin(th);
      // radial direction of this arm's root in the body frame
      const rx = R[0] * ca + U[0] * sa, ry = R[1] * ca + U[1] * sa, rz = R[2] * ca + U[2] * sa;
      const px = -U[0] * ca + R[0] * sa, py = -U[1] * ca + R[1] * sa, pz = -U[2] * ca + R[2] * sa; // around the ring
      let x = S.head[0] + rx * (tent ? 1.2 : 1.9), y = S.head[1] + ry * (tent ? 1.2 : 1.9), z = S.head[2] + rz * (tent ? 1.2 : 1.9);
      const seg = (tent ? TENT_LEN : ARM_LEN) / (N - 1);
      const lagk = tent ? 1 : 0.8;
      for (let k = 0; k < N; k++) {
        L[k * 3] = x; L[k * 3 + 1] = y; L[k * 3 + 2] = z;
        const s = k / (N - 1), lf = lagF[Math.min(N - 1, Math.round(k * lagk))];
        const w1 = 0.42 * Math.sin(s * 6.3 - t * 1.05 + th * 2.1) * (0.3 + s);
        const w2 = 0.34 * Math.cos(s * 4.7 - t * 0.8 + th * 1.3) * (0.3 + s);
        let dx = -lf[0] + rx * (0.22 + 0.3 * s) + px * w1 + U[0] * w2;
        let dy = -lf[1] + ry * (0.22 + 0.3 * s) + py * w1 + U[1] * w2 - droop * s * (tent ? 1.6 : 1);
        let dz = -lf[2] + rz * (0.22 + 0.3 * s) + pz * w1 + U[2] * w2;
        const dl = Math.hypot(dx, dy, dz) || 1;
        x += (dx / dl) * seg; y += (dy / dl) * seg; z += (dz / dl) * seg;
      }
    }
    // REACH: the feeding tentacles climb to tips that sweep the open water
    if (S.reach > 0.001) {
      for (const r of reaches) {
        const w = env(t, r.t0, r.t0 + r.dur, 3.2);
        if (w <= 0) continue;
        const u = clamp((t - r.t0) / r.dur, 0, 1);
        for (let j = 0; j < 2; j++) {
          const tip = S.reachTips[j];
          tip[0] = r.x + j * 7 + 2.5 * Math.sin(t * 0.4 + j);
          tip[1] = -7 - j * 2.5 + 1.5 * Math.sin(t * 0.55 + j * 2);
          tip[2] = lerp(r.z0, r.z1, smooth(0, 1, u)) + (j ? -9 : 0) * Math.sign(r.z1 - r.z0);
          reachLine(S.lines[ARMS + j], S.head, tip, t, j, w);
        }
      }
    }
    // CAGE: the arms rise round the arena and close in
    if (S.cage > 0.001) {
      for (let a = 0; a < ARMS; a++) {
        const th = (a / ARMS) * Math.PI * 2 + 0.04 * (t - ROUND);
        const cx = CAGE_C.x + Math.cos(th) * S.cageR, cz = CAGE_C.z + Math.sin(th) * S.cageR;
        cageLine(S.lines[a], S.head, cx, cz, th, t, S.cage);
      }
    }
    for (let a = 0; a < ALL; a++) {
      const L = S.lines[a], b = S.box[a];
      b[0] = b[1] = b[2] = 1e9; b[3] = b[4] = b[5] = -1e9;
      for (let k = 0; k < N; k++) for (let c = 0; c < 3; c++) { const v = L[k * 3 + c]; if (v < b[c]) b[c] = v; if (v > b[c + 3]) b[c + 3] = v; }
      const pad = S.radii[a][0] + 1;
      for (let c = 0; c < 3; c++) { b[c] -= pad; b[c + 3] += pad; }
    }
    return S;
  }

  // A cubic from the root up to a target, swaying, blended over the trailing pose by w.
  const c1 = [0, 0, 0], c2 = [0, 0, 0];
  function bez(p0, p1, p2, p3, u, k) { const v = 1 - u; return v * v * v * p0[k] + 3 * v * v * u * p1[k] + 3 * v * u * u * p2[k] + u * u * u * p3[k]; }
  function reachLine(L, root, tip, t, j, w) {
    c1[0] = root[0] - 2 + j * 3; c1[1] = root[1] + 18; c1[2] = root[2];
    c2[0] = tip[0] + 3; c2[1] = tip[1] - 16; c2[2] = tip[2] + (j ? 4 : -4);
    for (let k = 0; k < N; k++) {
      const u = k / (N - 1), sw = Math.sin(u * 5 - t * 1.2 + j * 2) * 1.6 * Math.sin(u * Math.PI);
      const x = bez(root, c1, c2, tip, u, 0) + sw, y = bez(root, c1, c2, tip, u, 1), z = bez(root, c1, c2, tip, u, 2) + Math.cos(u * 4 - t + j) * 1.2 * Math.sin(u * Math.PI);
      L[k * 3] = lerp(L[k * 3], x, w); L[k * 3 + 1] = lerp(L[k * 3 + 1], y, w); L[k * 3 + 2] = lerp(L[k * 3 + 2], z, w);
    }
  }
  const tp = [0, 0, 0], q1 = [0, 0, 0], q2 = [0, 0, 0];
  function cageLine(L, root, cx, cz, th, t, w) {
    const inx = -Math.cos(th), inz = -Math.sin(th);
    q1[0] = cx * 0.6 + root[0] * 0.4; q1[1] = -46; q1[2] = cz * 0.6 + root[2] * 0.4;
    q2[0] = cx; q2[1] = -20; q2[2] = cz;
    tp[0] = cx + inx * 3.5; tp[1] = -2.6 + Math.sin(t * 0.7 + th) * 0.8; tp[2] = cz + inz * 3.5;
    for (let k = 0; k < N; k++) {
      const u = k / (N - 1), sw = Math.sin(u * 6 - t * 1.4 + th * 3) * 1.1 * Math.sin(u * Math.PI);
      const x = bez(root, q1, q2, tp, u, 0) + inz * sw, y = bez(root, q1, q2, tp, u, 1), z = bez(root, q1, q2, tp, u, 2) - inx * sw;
      L[k * 3] = lerp(L[k * 3], x, w); L[k * 3 + 1] = lerp(L[k * 3 + 1], y, w); L[k * 3 + 2] = lerp(L[k * 3 + 2], z, w);
    }
  }

  // ---- queries
  // Body as three spheres along the mantle.
  const BODY = [[3.6, 2.6], [0, 4.1], [-4.4, 3.2]];
  // Segment a→b (thickness rad) against the animal: fraction of first contact, or -1.
  // `which` tells what was hit: -1 body, 0..9 a tentacle.
  const res = { t: -1, which: -1, x: 0, y: 0, z: 0 };
  function ray(ax, ay, az, bx, by, bz, rad) {
    res.t = -1;
    const dx = bx - ax, dy = by - ay, dz = bz - az, len2 = dx * dx + dy * dy + dz * dz || 1e-9;
    let best = 2;
    for (const [off, r] of BODY) {
      const cx = S.pos[0] + S.F[0] * off, cy = S.pos[1] + S.F[1] * off, cz = S.pos[2] + S.F[2] * off;
      const u = clamp(((cx - ax) * dx + (cy - ay) * dy + (cz - az) * dz) / len2, 0, 1);
      const ex = ax + dx * u - cx, ey = ay + dy * u - cy, ez = az + dz * u - cz;
      if (ex * ex + ey * ey + ez * ez < (r + rad) * (r + rad) && u < best) { best = u; res.which = -1; }
    }
    const mnx = Math.min(ax, bx), mny = Math.min(ay, by), mnz = Math.min(az, bz), mxx = Math.max(ax, bx), mxy = Math.max(ay, by), mxz = Math.max(az, bz);
    for (let a = 0; a < ALL; a++) {
      const b = S.box[a];
      if (mxx < b[0] || mnx > b[3] || mxy < b[1] || mny > b[4] || mxz < b[2] || mnz > b[5]) continue;
      const L = S.lines[a], rr = S.radii[a];
      for (let k = 0; k < N - 1; k++) {
        const u = segSeg(ax, ay, az, dx, dy, dz, L, k);
        if (segD2 < (rr[k] + rad) * (rr[k] + rad) && u < best) { best = u; res.which = a; }
      }
    }
    if (best <= 1) { res.t = best; res.x = ax + dx * best; res.y = ay + dy * best; res.z = az + dz * best; }
    return res;
  }
  // closest approach of segment a + d·u (u in 0..1) to the centreline segment k of L
  let segD2 = 0;
  function segSeg(ax, ay, az, dx, dy, dz, L, k) {
    const px = L[k * 3], py = L[k * 3 + 1], pz = L[k * 3 + 2];
    const ex = L[k * 3 + 3] - px, ey = L[k * 3 + 4] - py, ez = L[k * 3 + 5] - pz;
    const rx = ax - px, ry = ay - py, rz = az - pz;
    const a = dx * dx + dy * dy + dz * dz, e = ex * ex + ey * ey + ez * ez, f = ex * rx + ey * ry + ez * rz;
    const c = dx * rx + dy * ry + dz * rz, b = dx * ex + dy * ey + dz * ez, den = a * e - b * b;
    let s = den > 1e-9 ? clamp((b * f - c * e) / den, 0, 1) : 0;
    let v = e > 1e-9 ? (b * s + f) / e : 0;
    if (v < 0) { v = 0; s = clamp(-c / a, 0, 1); } else if (v > 1) { v = 1; s = clamp((b - c) / a, 0, 1); }
    const qx = rx + dx * s - ex * v, qy = ry + dy * s - ey * v, qz = rz + dz * s - ez * v;
    segD2 = qx * qx + qy * qy + qz * qz;
    return s;
  }
  // A diver sphere touching the animal: push direction and depth into out {x,y,z,d}, and
  // the velocity of what touched it (so a sweeping arm carries you with it).
  const prevLines = S.lines.map((l) => new Float32Array(l.length));
  let prevT = -1;
  function snapshot() { for (let a = 0; a < ALL; a++) prevLines[a].set(S.lines[a]); prevT = S.t; }
  function touch(p, r, out) {
    out.d = 0; out.vx = out.vy = out.vz = 0;
    for (const [off, br] of BODY) {
      const cx = S.pos[0] + S.F[0] * off, cy = S.pos[1] + S.F[1] * off, cz = S.pos[2] + S.F[2] * off;
      const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz, d = Math.hypot(dx, dy, dz), pen = br + r - d;
      if (pen > out.d) { out.d = pen; out.x = dx / (d || 1); out.y = dy / (d || 1); out.z = dz / (d || 1); out.vx = S.F[0] * S.speed; out.vy = S.F[1] * S.speed; out.vz = S.F[2] * S.speed; }
    }
    for (let a = 0; a < ALL; a++) {
      const b = S.box[a];
      if (p.x < b[0] - r || p.x > b[3] + r || p.y < b[1] - r || p.y > b[4] + r || p.z < b[2] - r || p.z > b[5] + r) continue;
      const L = S.lines[a], rr = S.radii[a];
      for (let k = 0; k < N - 1; k++) {
        segSeg(p.x, p.y, p.z, 0, 0, 0, L, k);
        const d = Math.sqrt(segD2), pen = rr[k] + r - d;
        if (pen > out.d) {
          const px = L[k * 3], py = L[k * 3 + 1], pz = L[k * 3 + 2];
          const ex = L[k * 3 + 3] - px, ey = L[k * 3 + 4] - py, ez = L[k * 3 + 5] - pz, e2 = ex * ex + ey * ey + ez * ez || 1;
          const v = clamp(((p.x - px) * ex + (p.y - py) * ey + (p.z - pz) * ez) / e2, 0, 1);
          const nx = p.x - (px + ex * v), ny = p.y - (py + ey * v), nz = p.z - (pz + ez * v), nl = Math.hypot(nx, ny, nz) || 1;
          out.d = pen; out.x = nx / nl; out.y = ny / nl; out.z = nz / nl;
          const dt = S.t - prevT;
          if (prevT >= 0 && dt > 1e-4 && dt < 0.5) {
            const P = prevLines[a];
            out.vx = (L[k * 3] - P[k * 3]) / dt; out.vy = (L[k * 3 + 1] - P[k * 3 + 1]) / dt; out.vz = (L[k * 3 + 2] - P[k * 3 + 2]) / dt;
          }
        }
      }
    }
    return out.d > 0;
  }
  // Distance from a point to the nearest part of the animal (for sound, eye and wake).
  function distance(x, y, z) {
    let best = Math.hypot(x - S.pos[0], y - S.pos[1], z - S.pos[2]) - 4;
    for (let a = 0; a < ALL; a++) {
      const L = S.lines[a];
      for (let k = 0; k < N; k += 3) best = Math.min(best, Math.hypot(x - L[k * 3], y - L[k * 3 + 1], z - L[k * 3 + 2]) - S.radii[a][k]);
    }
    return best;
  }

  return { S, update, snapshot, ray, touch, distance, passes, reaches, N, ARMS, ALL };
}

// ---------------------------------------------------------------------------------------
// The look: one skin shader for mantle, fins, arms and tentacles; a separate one for the eye.
const SKIN_VERT = VERT_COMMON + `
varying vec2 vUv;
varying vec3 vO;
uniform float uTime;
void main() {
  vUv = uv;
  vO = position;
  vec3 p = position;
#ifdef FIN
  // the fins ripple from root to edge
  p.y += sin(uTime * 1.6 - abs(position.x) * 0.55 + position.z * 0.4) * 0.12 * abs(position.x);
#endif
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const SKIN_FRAG = `
precision highp float;
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
varying vec3 vO;
uniform float uFlinch, uGlow;
${WATER_GLSL}
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(uCam - vW);
  vec2 uv = vUv;
  float t = uTime;
#ifdef ARM
  vec4 nz = texture2D(tNoise, vec2(uv.x * 2.0, uv.y * 7.0));
  float under = smoothstep(0.24, 0.06, abs(uv.x - 0.5));
  float top = smoothstep(0.2, 0.0, min(uv.x, 1.0 - uv.x));
#else
  vec4 nz = texture2D(tNoise, vO.xz * 0.06 + vO.y * 0.02);
  float under = smoothstep(0.1, -0.6, vO.y / 3.0) * 0.0;
  float top = 0.0;
#endif
  vec3 skin = mix(vec3(0.26, 0.035, 0.05), vec3(0.6, 0.13, 0.1), smoothstep(0.35, 0.7, nz.r));
  // chromatophores: speckles that flush darker and brighter, slowly
  float sp = texture2D(tNoise, uv * vec2(6.0, 30.0) + vec2(t * 0.013, -t * 0.02)).b;
  skin *= 0.7 + 0.6 * smoothstep(0.45, 0.65, sp);
  skin = mix(skin, vec3(0.75, 0.62, 0.55), under * 0.75);
  vec3 emit = vec3(0.0);
#ifdef ARM
  // suckers: two rows of pale rings down the inside of each arm
  float cnt = 70.0;
  float row = fract(uv.y * cnt + step(0.5, uv.x) * 0.5);
  float dd = length(vec2((row - 0.5) * 1.7, (abs(uv.x - 0.5) - 0.07) * 13.0));
  float ring = smoothstep(0.5, 0.38, dd) * under;
  skin = mix(skin, vec3(0.9, 0.78, 0.72), ring * 0.9);
  skin *= 1.0 - smoothstep(0.24, 0.12, dd) * under * 0.6;
  // photophores along the top, a wave of light running out to the tips
  float dots = smoothstep(0.32, 0.12, length(vec2(fract(uv.y * 36.0) - 0.5, (min(uv.x, 1.0 - uv.x) - 0.04) * 9.0)));
  float wave = 0.25 + 0.75 * pow(0.5 + 0.5 * sin(uv.y * 18.0 - t * 2.6 + vO.x * 0.01), 3.0);
  emit = vec3(0.45, 0.3, 1.5) * dots * wave * (1.0 - uv.y * 0.5);
#else
  float spots = smoothstep(0.62, 0.7, nz.g) * smoothstep(0.3, 0.6, texture2D(tNoise, vO.xz * 0.21).b);
  emit = vec3(0.4, 0.26, 1.3) * spots * (0.4 + 0.6 * sin(t * 1.7 + vO.z * 0.4) * 0.5 + 0.3);
#endif
  emit *= uGlow;
  vec3 col = litWater(skin, vW, n, 1.0, 0.35, 0.8);
  // wet sheen and a rim of scattered light: the silhouette that reads in the murk
  float fr = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  col += vec3(0.05, 0.2, 0.22) * fr * exp(min(vW.y, 0.0) * 0.03) * 1.4;
  vec3 h = normalize(uL + v);
  col += sunAt(vW.y) * pow(max(dot(n, h), 0.0), 60.0) * 0.35 * sunShadow(vW, 0.002);
  col += vec3(0.6, 0.1, 0.1) * uFlinch * 0.4;
  col = waterFog(col, vW, 0.72);
  float d = length(vW - uCam);
  col += emit * exp(-d * 0.022);
  gl_FragColor = vec4(col, d);
}`;
const EYE_FRAG = `
precision highp float;
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
varying vec3 vO;
uniform float uBlink;
${WATER_GLSL}
void main() {
  vec3 n = normalize(vN), v = normalize(uCam - vW);
  vec3 d = normalize(vO);
  float c = d.z;
  float ang = atan(d.y, d.x);
  vec3 sclera = vec3(0.72, 0.74, 0.7);
  vec3 iris = mix(vec3(0.85, 0.55, 0.12), vec3(1.0, 0.86, 0.4), texture2D(tNoise, vec2(ang * 0.6, c * 2.0)).g);
  float irisM = smoothstep(0.52, 0.58, c);
  // a horizontal slit that is the darkest thing in the sea
  float slit = smoothstep(0.1, 0.05, abs(d.y) / max(0.12, (c - 0.6) * 1.1)) * smoothstep(0.7, 0.76, c);
  vec3 alb = mix(sclera, iris, irisM);
  alb = mix(alb, vec3(0.0), slit);
  alb *= 1.0 - smoothstep(0.5, 0.56, c) * (1.0 - irisM) * 0.6; // the limbal ring
  vec3 col = litWater(alb, vW, n, 1.0, 0.5, 0.4);
  vec3 h = normalize(uL + v);
  col += sunAt(vW.y) * pow(max(dot(n, h), 0.0), 120.0) * 1.2;
  col += vec3(0.18, 0.28, 0.3) * pow(1.0 - max(dot(n, v), 0.0), 4.0);
  // it glows faintly from within: you see the eye before you see the animal
  vec3 glow = mix(vec3(0.25, 0.3, 0.28), vec3(1.3, 0.85, 0.25), irisM) * (1.0 - slit) * 0.55;
  col = waterFog(col, vW, 0.7);
  float dist = length(vW - uCam);
  col += glow * exp(-dist * 0.016);
  col = mix(col, vec3(0.08, 0.02, 0.03) * exp(-dist * 0.03), uBlink);
  gl_FragColor = vec4(col, dist);
}`;

// A tube whose centreline is rewritten every frame.
class Tube {
  constructor(THREE, n, m) {
    this.n = n; this.m = m;
    const verts = n * (m + 1);
    this.pos = new Float32Array(verts * 3);
    this.nrm = new Float32Array(verts * 3);
    const uv = new Float32Array(verts * 2), idx = [];
    for (let k = 0; k < n; k++) for (let j = 0; j <= m; j++) { uv[(k * (m + 1) + j) * 2] = j / m; uv[(k * (m + 1) + j) * 2 + 1] = k / (n - 1); }
    for (let k = 0; k < n - 1; k++) for (let j = 0; j < m; j++) {
      const a = k * (m + 1) + j, b = a + m + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    // a rounded cap at the tip
    const g = new THREE.BufferGeometry();
    this.pa = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.na = new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pa);
    g.setAttribute('normal', this.na);
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.geo = g;
    this.T = [0, 0, 1]; this.Nv = [1, 0, 0]; this.B = [0, 1, 0];
  }
  // parallel-transported frames along L (Float32Array n*3), radii r
  set(L, r, U) {
    const n = this.n, m = this.m, P = this.pos, Nn = this.nrm;
    let nx = U[0], ny = U[1], nz = U[2];
    for (let k = 0; k < n; k++) {
      const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1);
      let tx = L[b * 3] - L[a * 3], ty = L[b * 3 + 1] - L[a * 3 + 1], tz = L[b * 3 + 2] - L[a * 3 + 2];
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl; ty /= tl; tz /= tl;
      // remove the tangent component from the carried normal
      const dp = nx * tx + ny * ty + nz * tz;
      nx -= tx * dp; ny -= ty * dp; nz -= tz * dp;
      let nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-4) { nx = ty; ny = -tx; nz = 0; nl = Math.hypot(nx, ny, nz) || 1; }
      nx /= nl; ny /= nl; nz /= nl;
      const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
      const cx = L[k * 3], cy = L[k * 3 + 1], cz = L[k * 3 + 2], rad = r[k];
      for (let j = 0; j <= m; j++) {
        const ang = (j / m) * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang);
        // flattened a little across the sucker side, as real arms are
        const ox = nx * ca + bx * sa * 0.82, oy = ny * ca + by * sa * 0.82, oz = nz * ca + bz * sa * 0.82;
        const i = (k * (m + 1) + j) * 3;
        P[i] = cx + ox * rad; P[i + 1] = cy + oy * rad; P[i + 2] = cz + oz * rad;
        const ol = Math.hypot(ox, oy, oz) || 1;
        Nn[i] = ox / ol; Nn[i + 1] = oy / ol; Nn[i + 2] = oz / ol;
      }
    }
    this.pa.needsUpdate = true;
    this.na.needsUpdate = true;
  }
}

export function buildKraken(THREE, mats, U, sim) {
  const group = new THREE.Group();
  const shader = (frag, defines) => mats.shader({ vertexShader: SKIN_VERT, fragmentShader: frag, defines, uniforms: { uFlinch: { value: 0 }, uGlow: { value: 1 }, uBlink: { value: 0 } } });
  const bodyMat = shader(SKIN_FRAG, {}), finMat = mats.lean ? bodyMat : shader(SKIN_FRAG, { FIN: 1 }), armMat = shader(SKIN_FRAG, { ARM: 1 }), eyeMat = shader(EYE_FRAG, {});
  finMat.side = THREE.DoubleSide;
  armMat.uniforms.uFlinch = bodyMat.uniforms.uFlinch; finMat.uniforms.uFlinch = bodyMat.uniforms.uFlinch;
  armMat.uniforms.uGlow = bodyMat.uniforms.uGlow; finMat.uniforms.uGlow = bodyMat.uniforms.uGlow;
  // mantle: a lathe along +y, turned to lie along +z (front = +z)
  const prof = [[0.05, 10.5], [1.1, 10], [2.2, 8.6], [3.2, 6.4], [3.9, 3.8], [4.2, 1.2], [4.15, -1.2], [3.8, -2.8], [3.35, -3.4], [3.0, -3.6], [3.05, -4.4], [3.25, -5.2], [2.95, -6.2], [2.3, -6.9], [1.6, -7.3], [0.3, -7.5]];
  const lathe = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 40);
  lathe.rotateX(Math.PI / 2);
  lathe.scale(1, 0.86, 1);
  const body = new THREE.Mesh(lathe, bodyMat);
  const fins = [];
  for (const s of [-1, 1]) {
    const g = new THREE.SphereGeometry(1, 24, 10);
    g.scale(4.6, 0.22, 3.4);
    g.translate(s * 4.4, 0, 0);
    const fin = new THREE.Mesh(g, finMat);
    fin.position.set(0, 0, 6.2);
    fin.rotation.z = s * 0.08;
    fins.push(fin);
  }
  const head = new THREE.Group();
  head.add(body, ...fins);
  const eyeGeo = new THREE.SphereGeometry(1.25, 32, 20);
  const eyes = [0, 1].map((e) => { const m = new THREE.Mesh(eyeGeo, eyeMat); m.position.set(e ? 2.75 : -2.75, 0.5, -4.6); head.add(m); return m; });
  group.add(head);
  const tubes = [];
  for (let a = 0; a < sim.ALL; a++) {
    const t = new Tube(THREE, sim.N, a < sim.ARMS ? 12 : 9);
    const mesh = new THREE.Mesh(t.geo, armMat);
    mesh.frustumCulled = false;
    group.add(mesh);
    tubes.push({ t, mesh });
  }
  group.traverse((o) => { if (o.isMesh) o.layers.enable(1); });
  const m4 = new THREE.Matrix4(), vF = new THREE.Vector3(), vU = new THREE.Vector3(), vR = new THREE.Vector3(), look = new THREE.Vector3();
  let flinch = 0, blinkT = 3 + Math.random() * 4;
  return {
    group, eyes,
    flinch() { flinch = 1; },
    // eyeTarget: where the near eye should look (null: ahead)
    update(dt, eyeTarget) {
      const S = sim.S;
      vF.set(S.F[0], S.F[1], S.F[2]); vU.set(S.U[0], S.U[1], S.U[2]); vR.set(S.R[0], S.R[1], S.R[2]);
      m4.makeBasis(vR, vU, vF);
      head.quaternion.setFromRotationMatrix(m4);
      head.position.set(S.pos[0], S.pos[1], S.pos[2]);
      // a slow breath of the mantle; a pulse when it jets
      const br = 1 + 0.03 * Math.sin(S.t * 0.9) + flinch * 0.06;
      body.scale.set(br, br, 1 - flinch * 0.05);
      head.updateMatrixWorld(true);
      // the eye on the target's side rolls to follow it; the other looks out to its side
      const near = eyeTarget ? (vR.dot(look.copy(eyeTarget).sub(head.position)) > 0 ? 1 : 0) : -1;
      for (let e = 0; e < 2; e++) {
        const eye = eyes[e];
        if (e === near) eye.lookAt(eyeTarget);
        else { look.set(e ? 9 : -9, -0.5, -3); head.localToWorld(look); eye.lookAt(look); }
      }
      for (let a = 0; a < tubes.length; a++) tubes[a].t.set(S.lines[a], S.radii[a], S.U);
      flinch = Math.max(0, flinch - dt * 0.8);
      bodyMat.uniforms.uFlinch.value = flinch;
      blinkT -= dt;
      eyeMat.uniforms.uBlink.value = blinkT < 0 ? Math.sin(clamp(-blinkT / 0.5, 0, 1) * Math.PI) : 0;
      if (blinkT < -0.5) blinkT = 4 + Math.random() * 6;
    },
    dispose() { for (const { t } of tubes) t.geo.dispose(); lathe.dispose(); eyeGeo.dispose(); for (const f of fins) f.geometry.dispose(); },
  };
}
