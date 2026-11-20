// The yard plan: where the steel stands, where the paper stands, and the timetable of everything that moves.
// The layout is half a yard (the end that belongs to player 0, z > 0) turned 180 degrees about the centre for the
// other half, so both snipers face the same fight. Seeds only change colours and which dressing appears.
export const CW = 2.4, CH = 2.6; // a shipping container: width and height (metres)
export const SPAWN_Z = 37, YARD_X = 31.6, YARD_Z = 41.2, BUILD_Z = 44, GANTRY_X = 37.6;
export const EYE = 1.55, RADIUS = 0.42;

// [cx, cz, along, length, levels]
export const STEEL = [
  [33, 6, 'z', 12, 3], [33, 18, 'z', 12, 2], [33, 30, 'z', 12, 3], [33, 38.5, 'z', 6, 1],
  [-33, 6, 'z', 12, 2], [-33, 18, 'z', 12, 3], [-33, 30, 'z', 12, 2], [-33, 38.5, 'z', 6, 2],
  [9.6, 12, 'z', 12, 2], [9.6, 31, 'z', 12, 1], [20.4, 9, 'z', 6, 1], [20.4, 21, 'x', 12, 3], [26, 33, 'z', 12, 2],
  [-12, 15, 'x', 6, 1], [-12, 28, 'z', 12, 2], [-22, 11, 'z', 12, 3], [-22, 29, 'z', 12, 1],
];
// [kind, cx, cz, width, height, y0, yaw] — paper stops your view but never a bullet
export const PAPER = [
  ['up', 0, 31.2, 5.8, 1.4, 0, 0],
  ['fragile', -6.5, 24, 3.2, 2.5, 0, 0.25],
  ['hazard', 6, 17.5, 3.0, 2.4, 0, -0.3],
  ['crate', 0.6, 10.5, 2.6, 2.2, 0, 0.12],
  ['mascot', -2.6, 14.5, 1.0, 1.96, 0, 0.2],
  ['mascot', 3.2, 27.6, 1.0, 1.96, 0, -0.25],
  ['poster', 16.8, 14.5, 4.2, 1.5, 2.2, 0],
  ['poster', -17, 25.5, 4.2, 1.5, 2.2, 0.1],
];

// ---- timetables: pure functions of ctx.time, so both clients see the same machinery ----
export const CRANE_T = 40, CRANE_X = 26;
const sm = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
/** The gantry trolley: x position, height of the hanging container's underside, and the warning state. */
export function craneAt(t, out) {
  const p = ((t % CRANE_T) + CRANE_T) % CRANE_T;
  let x, y, warn = 0, moving = 0;
  if (p < 6) { x = -CRANE_X; y = 0; warn = p > 3.4 ? 1 : 0; }
  else if (p < 8) { x = -CRANE_X; y = 0.95 * sm((p - 6) / 2); warn = 1; }
  else if (p < 19) { const u = (p - 8) / 11; x = -CRANE_X + 2 * CRANE_X * (0.5 - 0.5 * Math.cos(Math.PI * u)); y = 0.95; moving = 1; }
  else if (p < 21) { x = CRANE_X; y = 0.95 * (1 - sm((p - 19) / 2)); }
  else if (p < 27) { x = CRANE_X; y = 0; warn = p > 23.4 ? 1 : 0; }
  else if (p < 29) { x = CRANE_X; y = 0.95 * sm((p - 27) / 2); warn = 1; }
  else { const u = (p - 29) / 11; x = CRANE_X - 2 * CRANE_X * (0.5 - 0.5 * Math.cos(Math.PI * u)); y = 0.95; moving = 1; }
  out.x = x; out.y = y; out.warn = warn; out.moving = moving;
  return out;
}
export const FORK_T = 34, FORK_X = 17.5, FORK_Z = 16;
/** Forklift in the left lane (z along the lane) and its mirror in the right lane; dz is its direction. */
export function forkAt(t, ph, out) {
  const w = (Math.PI * 2 * t) / FORK_T + ph;
  out.z = FORK_Z * Math.sin(w);
  out.dz = Math.cos(w) >= 0 ? 1 : -1;
  return out;
}
/** Wind along +x in -1..1: a slow swell and a quicker gust, from the seed. */
export function windAt(t, s) {
  return 0.62 * Math.sin(t * 0.33 + s) + 0.38 * Math.sin(t * 0.91 + s * 2.3 + 1);
}

/** Step the sudden-death curtains: the playable half-length of the yard at time ts since SUDDEN DEATH began. */
export function yardLimit(ts) {
  if (ts <= 0) return YARD_Z;
  return Math.max(6.5, YARD_Z - ts * 1.6);
}

// ---- collision + navigation ----
export const NAV = 1.5;
export function makeNav(rects) {
  const x0 = -34, z0 = -44, nx = Math.ceil(68 / NAV), nz = Math.ceil(88 / NAV);
  const blocked = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const cx = x0 + (i + 0.5) * NAV, cz = z0 + (j + 0.5) * NAV;
      let b = Math.abs(cx) > YARD_X - 0.3 || Math.abs(cz) > YARD_Z - 0.3;
      for (let k = 0; k < rects.length && !b; k++) {
        const r = rects[k];
        if (cx > r.x - 0.9 && cx < r.x + r.w + 0.9 && cz > r.y - 0.9 && cz < r.y + r.h + 0.9) b = true;
      }
      blocked[j * nx + i] = b ? 1 : 0;
    }
  }
  const dist = new Int16Array(nx * nz);
  const queue = new Int32Array(nx * nz);
  const cell = (x, z) => {
    const i = Math.min(nx - 1, Math.max(0, Math.floor((x - x0) / NAV))), j = Math.min(nz - 1, Math.max(0, Math.floor((z - z0) / NAV)));
    return j * nx + i;
  };
  const centre = (c, out) => { out.x = x0 + ((c % nx) + 0.5) * NAV; out.z = z0 + (Math.floor(c / nx) + 0.5) * NAV; return out; };
  /** Fill dist with steps-from-goal (-1 unreachable) by flood fill from the free cell nearest the goal. */
  function field(gx, gz) {
    dist.fill(-1);
    let g = cell(gx, gz);
    if (blocked[g]) { // nearest free cell
      let best = -1, bd = 1e9;
      for (let c = 0; c < blocked.length; c++) if (!blocked[c]) { const q = centre(c, { x: 0, z: 0 }); const d = (q.x - gx) ** 2 + (q.z - gz) ** 2; if (d < bd) { bd = d; best = c; } }
      g = best;
    }
    if (g < 0) return;
    let h = 0, t = 0;
    queue[t++] = g;
    dist[g] = 0;
    while (h < t) {
      const c = queue[h++], i = c % nx, j = (c / nx) | 0, d = dist[c] + 1;
      for (let k = 0; k < 4; k++) {
        const ni = i + (k === 0 ? 1 : k === 1 ? -1 : 0), nj = j + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
        const n = nj * nx + ni;
        if (blocked[n] || dist[n] >= 0) continue;
        dist[n] = d;
        queue[t++] = n;
      }
    }
  }
  /** The next waypoint (world x, z) from (x, z) downhill on the current field, or null when there is none. */
  function step(x, z, out) {
    const c = cell(x, z), i = c % nx, j = (c / nx) | 0;
    let best = dist[c] >= 0 ? dist[c] : 1e9, bn = -1;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
        const n = nj * nx + ni;
        if (dist[n] < 0 || blocked[n]) continue;
        if (di && dj && (blocked[j * nx + ni] || blocked[nj * nx + i])) continue; // no corner cutting
        const d = dist[n] + (di && dj ? 0.4 : 0);
        if (d < best) { best = d; bn = n; }
      }
    }
    if (bn < 0) return null;
    return centre(bn, out);
  }
  const free = (x, z) => !blocked[cell(x, z)];
  return { field, step, free, dist, cell, centre, blocked, nx, nz, x0, z0 };
}
