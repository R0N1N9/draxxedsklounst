// TTY DUEL — the facility: a 88 x 24 character grid. One column is one unit wide, one row is
// two units tall (a terminal cell is twice as tall as it is wide), and all physics runs in
// those square units. The map is mirrored both ways, so neither sniper's side is better.
import { clamp, rand, raycastRects, lineOfSight, resolveCircleRects } from '../../kit.js';

export const COLS = 88, ROWS = 24, CH = 2;
export const W = COLS, H = ROWS * CH;
export const R_BODY = 0.9;       // how fat a sniper is for walls
export const RANGE = 150;        // a round dies after this many units, bounces included
export const SEE_R = 24;         // beyond this you only see an enemy who moves, shoots or is pinged
export const SWEEP_W = 4, DOOR_PERIOD = 13, DOOR_SHUT = 3.4, DOOR_WARN = 1.6;

// Doors sit in these gaps (cols c0..c1 of a wall row); the lane walls are rows 3 / 20, the vault's 8 / 15.
const DOORS = [[30, 33, 3], [54, 57, 20], [42, 45, 8], [42, 45, 15]];
const GAPS = [[8, 11], [20, 21], [30, 33], [42, 43]];
// Optional extra cover, tried in a seeded order: [col, row, w, h] in the top-left quadrant.
const EXTRAS = [[14, 5, 2, 1], [24, 5, 2, 1], [27, 10, 2, 1], [33, 6, 2, 1], [19, 10, 1, 2], [34, 10, 2, 1], [29, 8, 2, 1]];

function carve(rng, extras) {
  const g = new Uint8Array(COLS * ROWS);
  const put = (c, r, v) => {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return;
    const c2 = COLS - 1 - c, r2 = ROWS - 1 - r;
    g[r * COLS + c] = g[r * COLS + c2] = g[r2 * COLS + c] = g[r2 * COLS + c2] = v;
  };
  const fill = (c0, r0, c1, r1, v = 1) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) put(c, r, v); };
  fill(0, 0, 43, 0);
  fill(0, 0, 0, 11);
  fill(1, 3, 43, 3);                       // lane wall
  for (const [a, b] of GAPS) fill(a, 3, b, 3, 0);
  fill(1, 7, 10, 7);                       // spawn room
  fill(10, 7, 10, 9);
  fill(14, 9, 15, 11);                     // blast shield in front of the spawn door
  fill(18, 5, 18, 7);                      // free-standing wall
  fill(37, 8, 43, 8);                      // the vault
  fill(37, 8, 37, 11);
  fill(42, 8, 43, 8, 0);
  fill(40, 10, 41, 11);                    // racks inside it
  fill(30, 10, 30, 11);
  const order = extras.slice();
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
  const n = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < n && i < order.length; i++) { const [c, r, w, h] = order[i]; fill(c, r, c + w - 1, r + h - 1); }
  return g;
}

function mergeRects(g) {
  const rects = [];
  let prev = new Map();
  for (let r = 0; r < ROWS; r++) {
    const cur = new Map();
    let c = 0;
    while (c < COLS) {
      if (!g[r * COLS + c]) { c++; continue; }
      const c0 = c;
      while (c < COLS && g[r * COLS + c]) c++;
      const key = c0 * 128 + (c - 1);
      let rc = prev.get(key);
      if (rc) rc.r1 = r;
      else { rc = { c0, c1: c - 1, r0: r, r1: r, x: 0, y: 0, w: 0, h: 0, border: false, dead: false }; rects.push(rc); }
      cur.set(key, rc);
    }
    prev = cur;
  }
  for (const rc of rects) {
    rc.x = rc.c0; rc.y = rc.r0 * CH; rc.w = rc.c1 - rc.c0 + 1; rc.h = (rc.r1 - rc.r0 + 1) * CH;
    rc.border = rc.c0 === 0 || rc.r0 === 0 || rc.c1 === COLS - 1 || rc.r1 === ROWS - 1;
  }
  return rects;
}

const tri = (s, L) => { s = ((s % (2 * L)) + 2 * L) % (2 * L); return s < L ? s : 2 * L - s; };

export function mkPath() {
  return { x0: 0, y0: 0, x1: 0, y1: 0, x2: 0, y2: 0, l1: 0, l2: 0, bounce: false, hit1: false, hit2: false, n1x: 0, n1y: 0, n2x: 0, n2y: 0 };
}

export function buildWorld(rng) {
  // A seeded layout, with a plain fallback should the extras ever seal something off.
  let grid = carve(rng, EXTRAS), all = mergeRects(grid), walk = walkMask(all, grid);
  for (let tries = 0; tries < 4 && !connected(walk); tries++) {
    grid = carve(rng, tries === 3 ? [] : EXTRAS);
    all = mergeRects(grid);
    walk = walkMask(all, grid);
  }
  const stat = all.slice();
  const occ = new Uint8Array(COLS * ROWS);
  const solids = [];
  const decayOrder = all.filter((r) => !r.border);
  for (let i = decayOrder.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = decayOrder[i]; decayOrder[i] = decayOrder[j]; decayOrder[j] = t; }

  const doors = DOORS.map(([c0, c1, r], i) => ({ c0, c1, r, e: 1, warn: 0, phase: rand(rng, 0, DOOR_PERIOD), rect: { x: c0, y: r * CH, w: c1 - c0 + 1, h: CH }, id: i }));
  const sweepers = [0, 1].map((i) => ({ i, rect: { x: 0, y: i ? 42 : 2, w: SWEEP_W, h: 4 }, xmin: 6, xmax: 78, speed: 6.5, phase: rand(rng, 0, 150), dir: 1, x: 0 }));
  const shrink = [{ x: 0, y: 0, w: 0, h: H }, { x: 0, y: 0, w: 0, h: H }, { x: 0, y: 0, w: W, h: 0 }, { x: 0, y: 0, w: W, h: 0 }];
  let shrinkK = 0, decayN = 0, version = 0;

  const world = {
    cols: COLS, rows: ROWS, grid, occ, solids, doors, sweepers, shrinkRects: shrink, rects: all,
    gridVersion: () => decayN,
    spawns: [{ x: 5.5, y: H / 2 }, { x: W - 5.5, y: H / 2 }],
    version: 0,
    // Floor labels: purely scenery, but they make the place a place.
    labels: [
      { c: 2, r: 9, t: '~/p0' }, { c: COLS - 6, r: 9, t: '~/p1' }, { c: 40, r: 1, t: '/lib' }, { c: 44, r: 21, t: '/bin' },
      { c: 40, r: 12, t: '/root' }, { c: 22, r: 15, t: '/var/log' }, { c: 58, r: 5, t: '/var/log' }, { c: 29, r: 17, t: '/etc' }, { c: 56, r: 6, t: '/tmp' },
      { c: 20, r: 12, t: '/dev/null' }, { c: 61, r: 12, t: '/dev/zero' },
    ],
  };

  function rebuildOcc() {
    occ.fill(0);
    for (let i = 0; i < grid.length; i++) occ[i] = grid[i];
  }
  const stampRect = (rc) => {
    const c0 = Math.max(0, Math.floor(rc.x + 0.001)), c1 = Math.min(COLS - 1, Math.ceil(rc.x + rc.w - 0.001) - 1);
    const r0 = Math.max(0, Math.floor(rc.y / CH + 0.001)), r1 = Math.min(ROWS - 1, Math.ceil((rc.y + rc.h) / CH - 0.001) - 1);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) occ[r * COLS + c] = 1;
  };

  /** Move every scripted piece of the world to its place at live time t (a pure function of t). */
  world.sync = (t) => {
    rebuildOcc();
    solids.length = 0;
    for (let i = 0; i < stat.length; i++) if (!stat[i].dead) solids.push(stat[i]);
    for (const d of doors) {
      const u = (((t + d.phase) % DOOR_PERIOD) + DOOR_PERIOD) % DOOR_PERIOD, cs = DOOR_PERIOD - DOOR_SHUT - 0.5;
      d.e = u < cs ? 1 : u < cs + 0.5 ? 1 - (u - cs) / 0.5 : u < DOOR_PERIOD - 0.5 ? 0 : (u - (DOOR_PERIOD - 0.5)) / 0.5;
      d.warn = u >= cs - DOOR_WARN && u < cs ? 1 : 0;
      d.rect.w = (d.c1 - d.c0 + 1) * (1 - d.e);
      if (d.rect.w > 0.05) { solids.push(d.rect); stampRect(d.rect); }
    }
    for (const s of sweepers) {
      const L = s.xmax - s.xmin, p = t * s.speed + s.phase * s.speed;
      const m = ((p % (2 * L)) + 2 * L) % (2 * L);
      s.dir = m < L ? 1 : -1;
      s.x = s.xmin + tri(p, L);
      s.rect.x = s.x;
      solids.push(s.rect);
      stampRect(s.rect);
    }
    if (shrinkK > 0) for (const r of shrink) { solids.push(r); stampRect(r); }
    world.version = ++version;
  };

  /** Sudden death: the border closes in (k 0..1). Returns the inner bounds. */
  world.setShrink = (k) => {
    shrinkK = clamp(k, 0, 1);
    const s = shrinkK, mx = 1 + s * 19, my = 4 + s * 12;
    shrink[0].w = mx; shrink[0].x = 0;
    shrink[1].w = mx; shrink[1].x = W - mx;
    shrink[2].h = my; shrink[2].y = 0;
    shrink[3].h = my; shrink[3].y = H - my;
    return shrink;
  };
  world.shrinkAmount = () => shrinkK;

  /** Sudden death: delete cover (`rm -rf`) in waves. Returns true when something went. */
  world.decayTo = (n) => {
    if (n <= decayN) return false;
    const per = Math.ceil(decayOrder.length / 4);
    for (let i = decayN * per; i < Math.min(decayOrder.length, n * per); i++) {
      const rc = decayOrder[i];
      rc.dead = true;
      for (let r = rc.r0; r <= rc.r1; r++) for (let c = rc.c0; c <= rc.c1; c++) grid[r * COLS + c] = 0;
    }
    decayN = n;
    return true;
  };

  // ---- queries ----
  const cellIdx = (x, y) => clamp(Math.floor(y / CH), 0, ROWS - 1) * COLS + clamp(Math.floor(x), 0, COLS - 1);
  world.cellAt = cellIdx;
  world.free = (x, y, r) => {
    for (let i = 0; i < solids.length; i++) {
      const q = solids[i];
      const px = clamp(x, q.x, q.x + q.w), py = clamp(y, q.y, q.y + q.h);
      if ((x - px) * (x - px) + (y - py) * (y - py) < r * r) return false;
    }
    return true;
  };
  world.push = (pos, r) => resolveCircleRects(pos, r, solids);
  world.los = (ax, ay, bx, by) => lineOfSight(ax, ay, bx, by, solids);
  // Either shoulder will do: a sniper half behind a pillar is half seen.
  world.sees = (ax, ay, bx, by) => {
    if (lineOfSight(ax, ay, bx, by, solids)) return true;
    const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || 1, sx = (-dy / d) * 0.8, sy = (dx / d) * 0.8;
    return lineOfSight(ax, ay, bx + sx, by + sy, solids) || lineOfSight(ax, ay, bx - sx, by - sy, solids);
  };
  world.ray = (x, y, dx, dy, max) => raycastRects(x, y, dx, dy, max, solids);

  /** A round's route: out to the first wall, one bounce, out to the second. Fills and returns `p`. */
  world.trace = (x, y, a, p) => {
    const dx = Math.cos(a), dy = Math.sin(a);
    p.x0 = x; p.y0 = y; p.l2 = 0; p.bounce = false; p.hit2 = false;
    const h = raycastRects(x, y, dx, dy, RANGE, solids);
    if (!h) { p.x1 = x + dx * RANGE; p.y1 = y + dy * RANGE; p.l1 = RANGE; p.hit1 = false; p.x2 = p.x1; p.y2 = p.y1; return p; }
    p.x1 = h.x; p.y1 = h.y; p.l1 = h.dist; p.hit1 = true; p.n1x = h.nx; p.n1y = h.ny;
    p.x2 = p.x1; p.y2 = p.y1;
    const rem = RANGE - h.dist;
    if (rem < 2) return p;
    const d = 2 * (dx * h.nx + dy * h.ny), rx = dx - d * h.nx, ry = dy - d * h.ny;
    const ox = h.x + h.nx * 0.03, oy = h.y + h.ny * 0.03;
    const h2 = raycastRects(ox, oy, rx, ry, rem, solids);
    p.bounce = true;
    if (h2) { p.x2 = h2.x; p.y2 = h2.y; p.l2 = h2.dist + 0.03; p.hit2 = true; p.n2x = h2.nx; p.n2y = h2.ny; } else { p.x2 = ox + rx * rem; p.y2 = oy + ry * rem; p.l2 = rem; }
    return p;
  };

  /** Which cells the sniper at (px, py) can see: out[cell] = brightness 1..255 (0 = hidden). */
  world.fov = (px, py, out, maxD = 130) => {
    out.fill(0);
    const N = 1100;
    const c0 = clamp(Math.floor(px), 0, COLS - 1), r0 = clamp(Math.floor(py / CH), 0, ROWS - 1);
    out[r0 * COLS + c0] = 255;
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
      let c = c0, r = r0;
      const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
      const tdx = Math.abs(dx) < 1e-9 ? 1e9 : 1 / Math.abs(dx), tdy = Math.abs(dy) < 1e-9 ? 1e9 : CH / Math.abs(dy);
      let tx = Math.abs(dx) < 1e-9 ? 1e9 : (dx > 0 ? c0 + 1 - px : px - c0) * tdx;
      let ty = Math.abs(dy) < 1e-9 ? 1e9 : (dy > 0 ? (r0 + 1) * CH - py : py - r0 * CH) * tdy / CH;
      for (let step = 0; step < 220; step++) {
        let t;
        if (tx < ty) { c += sx; t = tx; tx += tdx; } else { r += sy; t = ty; ty += tdy; }
        if (c < 0 || r < 0 || c >= COLS || r >= ROWS || t > maxD) break;
        const i = r * COLS + c;
        const v = Math.round(255 * clamp(1 - Math.max(0, t - 12) / 150, 0.5, 1));
        if (v > out[i]) out[i] = v;
        if (occ[i]) break;
      }
    }
    return out;
  };

  // ---- navigation (for the bot) ----
  world.walk = walk;
  const gS = new Float32Array(COLS * ROWS), came = new Int32Array(COLS * ROWS), closed = new Uint8Array(COLS * ROWS), stamp = new Int32Array(COLS * ROWS);
  const heapI = new Int32Array(COLS * ROWS * 4), heapF = new Float32Array(COLS * ROWS * 4);
  let epoch = 0;
  const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 2], [0, -1, 2], [1, 1, 2.3], [1, -1, 2.3], [-1, 1, 2.3], [-1, -1, 2.3]];
  const okCell = (c, r, avoid) => c >= 0 && r >= 0 && c < COLS && r < ROWS && walk[r * COLS + c] && !(avoid && occ[r * COLS + c]);
  world.nearestWalk = (x, y) => {
    const c0 = clamp(Math.floor(x), 0, COLS - 1), r0 = clamp(Math.floor(y / CH), 0, ROWS - 1);
    if (walk[r0 * COLS + c0]) return r0 * COLS + c0;
    for (let d = 1; d < 12; d++) {
      let best = -1, bd = 1e9;
      for (let r = r0 - d; r <= r0 + d; r++) for (let c = c0 - d * 2; c <= c0 + d * 2; c++) {
        if (!okCell(c, r, false)) continue;
        const dd = (c - c0) * (c - c0) + (r - r0) * (r - r0) * 4;
        if (dd < bd) { bd = dd; best = r * COLS + c; }
      }
      if (best >= 0) return best;
    }
    return -1;
  };
  /** A* over walkable cells (cells blocked right now by a door or the sweeper are avoided). Waypoints go to out as x,y pairs; returns how many. */
  world.path = (x0, y0, x1, y1, out) => {
    const s = world.nearestWalk(x0, y0), e = world.nearestWalk(x1, y1);
    if (s < 0 || e < 0) return 0;
    epoch++;
    let hn = 0;
    const push = (i, f) => { let k = hn++; while (k > 0) { const p = (k - 1) >> 1; if (heapF[p] <= f) break; heapF[k] = heapF[p]; heapI[k] = heapI[p]; k = p; } heapF[k] = f; heapI[k] = i; };
    const pop = () => { const top = heapI[0], f = heapF[--hn]; const i = heapI[hn]; let k = 0; for (;;) { let c = k * 2 + 1; if (c >= hn) break; if (c + 1 < hn && heapF[c + 1] < heapF[c]) c++; if (heapF[c] >= f) break; heapF[k] = heapF[c]; heapI[k] = heapI[c]; k = c; } heapF[k] = f; heapI[k] = i; return top; };
    const ec = e % COLS, er = (e / COLS) | 0;
    gS[s] = 0; came[s] = -1; stamp[s] = epoch; closed[s] = 0; push(s, 0);
    let found = false;
    while (hn > 0) {
      const cur = pop();
      if (closed[cur] === 1 && stamp[cur] === epoch) continue;
      closed[cur] = 1;
      if (cur === e) { found = true; break; }
      const cc = cur % COLS, cr = (cur / COLS) | 0;
      for (let k = 0; k < 8; k++) {
        const nc = cc + NB[k][0], nr = cr + NB[k][1];
        if (!okCell(nc, nr, true)) continue;
        if (NB[k][0] && NB[k][1] && (!okCell(cc + NB[k][0], cr, true) || !okCell(cc, cr + NB[k][1], true))) continue;
        const ni = nr * COLS + nc, g = gS[cur] + NB[k][2];
        if (stamp[ni] === epoch && g >= gS[ni]) continue;
        stamp[ni] = epoch; closed[ni] = 0; gS[ni] = g; came[ni] = cur;
        push(ni, g + Math.hypot(nc - ec, (nr - er) * 2) * 1.0);
      }
    }
    if (!found) return 0;
    let n = 0, i = e;
    const tmp = [];
    while (i >= 0 && n < 400) { tmp.push(i); i = came[i]; n++; }
    let m = 0;
    for (let k = tmp.length - 1; k >= 0 && m < out.length - 1; k--) { out[m++] = (tmp[k] % COLS) + 0.5; out[m++] = ((tmp[k] / COLS) | 0) * CH + 1; }
    return m / 2;
  };

  // Hold-and-peek spots for the bot: walkable, spread out, graded by how far they see and how much wall is at hand.
  const spots = [];
  for (let r = 1; r < ROWS - 1; r += 1) for (let c = 2; c < COLS - 2; c += 3) {
    if (!walk[r * COLS + c]) continue;
    const x = c + 0.5, y = r * CH + 1;
    let sight = 0, wall = 99;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const h = raycastRects(x, y, Math.cos(a), Math.sin(a), 70, stat);
      const d = h ? h.dist : 70;
      sight = Math.max(sight, d);
      wall = Math.min(wall, d);
    }
    spots.push({ x, y, c, r, sight, wall });
  }
  world.spots = spots;
  world.sync(0);
  return world;
}

// Which cells a sniper's centre may stand on (clearance for the body), for a set of static rects.
function walkMask(rects, g) {
  const walk = new Uint8Array(COLS * ROWS), rr = (R_BODY + 0.04) * (R_BODY + 0.04);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let ok = !g[r * COLS + c];
      if (ok) {
        const x = c + 0.5, y = r * CH + 1;
        for (const q of rects) {
          const px = clamp(x, q.x, q.x + q.w), py = clamp(y, q.y, q.y + q.h);
          if ((x - px) * (x - px) + (y - py) * (y - py) < rr) { ok = false; break; }
        }
      }
      walk[r * COLS + c] = ok ? 1 : 0;
    }
  }
  return walk;
}

// Flood fill over walkable cells: the two spawns must reach each other.
function connected(walk) {
  const seen = new Uint8Array(COLS * ROWS), st = [];
  const a = 11 * COLS + 5, b = 12 * COLS + COLS - 6;
  if (!walk[a] || !walk[b]) return false;
  st.push(a);
  seen[a] = 1;
  while (st.length) {
    const i = st.pop(), c = i % COLS, r = (i / COLS) | 0;
    for (let k = 0; k < 4; k++) {
      const nc = c + (k === 0 ? 1 : k === 1 ? -1 : 0), nr = r + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
      const j = nr * COLS + nc;
      if (walk[j] && !seen[j]) { seen[j] = 1; st.push(j); }
    }
  }
  return !!seen[b];
}
