// The arena: seeded cover (mirrored left/right, so neither spawn is favoured), the moving
// pieces (every one a pure function of the round clock, so both online clients agree),
// rail tracing with its single ricochet, and a coarse nav grid for the bot.
import { TAU, clamp, lerp } from '../../kit.js';
import { Solid, Solids, rectPts, slabPts, ngonPts, polyGap, solidDist, pointSeg } from './geom.js';

export const W = 1600, H = 900, R = 15;
export const BPM = 112, BEAT = 60 / BPM;
export const PULSE_EVERY = 16 * BEAT; // the lattice strobes every four bars
export const ROUND_TIME = 55;
export const RAIL_RANGE = 2800, RAIL_SPEED = 5200; // near-instant: a quarter of a second wall to wall
export const SPEED = 255, CRAWL = 66;             // a sniper's run, and the crawl while focused
export const RELOAD = 1.25, BEAM_FADE = 0.6;
// Corner chamfers. The big bottom ones keep the fight out from under a tablet player's thumbs.
export const CH_TOP = 110, CH_BOT = 250;
// The scoreboard housing: a notch in the top wall that sits under the shared score strip.
export const GANTRY = { x0: 370, x1: 1230, inset: 46, d: 62 };
export const SPAWNS = [{ x: 150, y: 420 }, { x: W - 150, y: 420 }];
export const MID = { x: W / 2, y: 440 };
export const SHUTTER = { len: 150, thick: 18, amp: 205, period: 13 };
export const DRONE = { y: 822, size: 34, amp: 430, period: 24 };
export const CRUSH = { hw: 270, hh: 165, time: 22, delay: 1.5 }; // sudden death: the box the walls close to

const CELL = 25, COLS = W / CELL, ROWS = H / CELL, N = COLS * ROWS;
const GAP = 66; // a sniper is 30 across: every passage leaves room to spare

const TYPES = [
  { k: 'prism', w: 3, make: (x, y) => rectPts(x - 35, y - 35, 70, 70) },
  { k: 'diamond', w: 2, make: (x, y) => ngonPts(x, y, 52, 4) },
  { k: 'hex', w: 2, make: (x, y) => ngonPts(x, y, 46, 6) },
  { k: 'slab', w: 2, make: (x, y) => slabPts(x, y, 170, 18, 0) },
  { k: 'slab', w: 2, make: (x, y) => slabPts(x, y, 170, 18, Math.PI / 2) },
  { k: 'slab', w: 2, make: (x, y) => slabPts(x, y, 160, 18, Math.PI / 4) },
  { k: 'slab', w: 2, make: (x, y) => slabPts(x, y, 160, 18, -Math.PI / 4) },
];
const TYPE_W = TYPES.reduce((s, t) => s + t.w, 0);

const mirror = (pts) => {
  const o = [];
  for (let i = pts.length - 2; i >= 0; i -= 2) o.push(W - pts[i], pts[i + 1]);
  return o;
};

/** A rail path: muzzle → first surface → (one ricochet) → last surface. */
export const mkPath = () => ({ n: 2, x0: 0, y0: 0, x1: 0, y1: 0, x2: 0, y2: 0, l1: 0, l2: 0, n1x: 0, n1y: 0, n2x: 0, n2y: 0 });

// One attempt at a map. plain = shields and centre only (the fallback that always validates).
function assemble(rng, plain) {
  const solids = new Solids();
  const add = (pts, kind, cast) => solids.add(new Solid(pts, kind, cast));
  // The world outside the glass.
  add(rectPts(-600, -600, 600, H + 1200), 'edge', false);
  add(rectPts(W, -600, 600, H + 1200), 'edge', false);
  add(rectPts(-600, -600, W + 1200, 600), 'edge', false);
  add(rectPts(-600, H, W + 1200, 600), 'edge', false);
  add([0, 0, CH_TOP, 0, 0, CH_TOP], 'bound', false);
  add([W, 0, W, CH_TOP, W - CH_TOP, 0], 'bound', false);
  add([0, H, 0, H - CH_BOT, CH_BOT, H], 'bound', false);
  add([W, H, W - CH_BOT, H, W, H - CH_BOT], 'bound', false);
  add([GANTRY.x0, 0, GANTRY.x1, 0, GANTRY.x1 - GANTRY.inset, GANTRY.d, GANTRY.x0 + GANTRY.inset, GANTRY.d], 'gantry', true);

  const pieces = [];
  const place = (pts, type) => pieces.push({ solid: add(pts, 'pillar', true), pts, type });
  const both = (pts, type) => { place(pts, type); place(mirror(pts), type); };

  // A shield in front of each spawn: nobody is in sight when the lights go out.
  const shieldY = SPAWNS[0].y + (Math.floor(rng() * 3) - 1) * 20;
  both(slabPts(268, shieldY, 160, 18, Math.PI / 2), 'slab');

  const centre = Math.floor(rng() * 3);
  if (centre === 0) place(ngonPts(MID.x, MID.y, 80, 4), 'diamond');
  else if (centre === 1) {
    place(slabPts(MID.x, MID.y - 150, 170, 18, Math.PI / 2), 'slab');
    place(slabPts(MID.x, MID.y + 150, 170, 18, Math.PI / 2), 'slab');
  } else {
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) place(rectPts(MID.x + sx * 88 - 24, MID.y + sy * 88 - 24, 48, 48), 'prism');
  }

  // The shutters' sweep is kept clear of cover (reserved, never added to the solids).
  const trackX = MID.x - (rng() < 0.5 ? 205 : 255);
  const sweep = rectPts(trackX - SHUTTER.thick / 2, MID.y - SHUTTER.amp - SHUTTER.len / 2, SHUTTER.thick, SHUTTER.amp * 2 + SHUTTER.len);
  const keep = [new Solid(sweep), new Solid(mirror(sweep))];

  if (!plain) {
    const count = 4 + (rng() < 0.55 ? 1 : 0);
    const bands = [[120, 290], [540, 700], [330, 510]]; // one piece per lane first, then anywhere
    for (let i = 0; i < count; i++) {
      const band = bands[i] || [120, 700];
      for (let tries = 0; tries < 50; tries++) {
        let pickW = rng() * TYPE_W, T = TYPES[0];
        for (const t of TYPES) { pickW -= t.w; if (pickW < 0) { T = t; break; } }
        const x = 350 + Math.floor(rng() * 17) * 25;
        const y = band[0] + Math.floor(rng() * ((band[1] - band[0]) / 10 + 1)) * 10;
        const pts = T.make(x, y);
        const c = new Solid(pts);
        if (c.minX < 335 || c.maxX > MID.x - GAP / 2 || c.minY < GAP || c.maxY > DRONE.y - DRONE.size / 2 - GAP) continue;
        if (solidDist(c, SPAWNS[0].x, SPAWNS[0].y) < 190) continue;
        let ok = true;
        for (const s of solids.list) if (s.kind !== 'edge' && polyGap(c, s) < GAP) { ok = false; break; }
        for (const s of keep) if (ok && polyGap(c, s) < 58) ok = false;
        if (!ok) continue;
        both(pts, T.k);
        break;
      }
    }
  }
  return { solids, pieces, trackX, add };
}

export function buildWorld(rng) {
  let base = null, blocked = null, freeCells = null;
  // Nav grid over the static map; reject the (rare) layout that seals off part of the floor.
  const scan = (b, force) => {
    const blk = new Uint8Array(N);
    for (let i = 0; i < N; i++) blk[i] = b.solids.free((i % COLS) * CELL + CELL / 2, Math.floor(i / COLS) * CELL + CELL / 2, R + 6) ? 0 : 1;
    const seen = new Uint8Array(N), queue = new Int32Array(N);
    let qh = 0, qt = 0, total = 0;
    for (let i = 0; i < N; i++) if (!blk[i]) total++;
    const start = Math.floor(SPAWNS[0].y / CELL) * COLS + Math.floor(SPAWNS[0].x / CELL);
    seen[start] = 1;
    queue[qt++] = start;
    while (qh < qt) {
      const c = queue[qh++], cx = c % COLS, cy = (c / COLS) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const k = ny * COLS + nx;
        if (blk[k] || seen[k]) continue;
        seen[k] = 1;
        queue[qt++] = k;
      }
    }
    if (qt < total && !force) return false;
    blocked = blk;
    freeCells = queue.slice(0, qt);
    return true;
  };
  for (let attempt = 0; attempt < 6 && !base; attempt++) {
    const b = assemble(rng, attempt === 5);
    if (scan(b, attempt === 5)) base = b;
  }
  const { solids, pieces, trackX, add } = base;

  // ---- the moving pieces ----
  const shutters = [trackX, W - trackX].map((x) => ({ x, y: MID.y, solid: add(rectPts(0, 0, 1, 1), 'shutter', true) }));
  const drone = { x: MID.x, y: DRONE.y, solid: add(rectPts(0, 0, 1, 1), 'drone', true) };
  const crush = [0, 1, 2, 3].map(() => { const s = add(rectPts(0, 0, 1, 1), 'crush', false); s.on = false; return s; });
  const state = { gone: false, dissolve: 0, crushK: -1, safe: { x0: 0, y0: 0, x1: W, y1: H } };

  /** Put every moving piece where it belongs at round time `time` (seconds of live play). */
  function sync(time) {
    const sd = time - ROUND_TIME; // seconds into sudden death
    state.dissolve = clamp(sd / 1.2, 0, 1);
    const gone = sd >= 1.2; // the cover has dissolved: the shadows lift
    if (gone !== state.gone) {
      state.gone = gone;
      for (const p of pieces) p.solid.on = !gone;
      for (const s of shutters) s.solid.on = !gone;
      drone.solid.on = !gone;
    }
    const sy = MID.y + SHUTTER.amp * Math.sin((time / SHUTTER.period) * TAU);
    for (const s of shutters) {
      s.y = sy;
      s.solid.setRect(s.x - SHUTTER.thick / 2, sy - SHUTTER.len / 2, SHUTTER.thick, SHUTTER.len);
    }
    drone.x = MID.x + DRONE.amp * Math.sin((time / DRONE.period) * TAU);
    drone.solid.setRect(drone.x - DRONE.size / 2, drone.y - DRONE.size / 2, DRONE.size, DRONE.size);
    if (sd > 0) {
      const k = clamp((sd - CRUSH.delay) / CRUSH.time, 0, 1);
      const f = state.safe;
      f.x0 = lerp(0, MID.x - CRUSH.hw, k);
      f.x1 = W - f.x0;
      f.y0 = lerp(0, MID.y - CRUSH.hh, k);
      f.y1 = lerp(H, MID.y + CRUSH.hh, k);
      state.crushK = k;
      crush[0].setRect(-600, -600, 600 + f.x0, H + 1200);
      crush[1].setRect(f.x1, -600, 600 + W - f.x1, H + 1200);
      crush[2].setRect(-600, -600, W + 1200, 600 + f.y0);
      crush[3].setRect(-600, f.y1, W + 1200, 600 + H - f.y1);
      for (const s of crush) s.on = true;
    } else if (state.crushK >= 0) {
      state.crushK = -1;
      for (const s of crush) s.on = false;
    }
  }
  sync(0);

  // ---- rails ----
  const hit = { d: 0, x: 0, y: 0, nx: 0, ny: 0, solid: null };
  /** Fire a rail from (ox, oy) at angle ang: it ricochets exactly once. Fills and returns out. */
  function trace(ox, oy, ang, out) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    out.x0 = ox;
    out.y0 = oy;
    out.n = 2;
    out.l2 = 0;
    solids.raycast(ox, oy, dx, dy, RAIL_RANGE, hit);
    out.x1 = out.x2 = hit.x;
    out.y1 = out.y2 = hit.y;
    out.l1 = hit.d;
    out.n1x = hit.nx;
    out.n1y = hit.ny;
    if (!hit.solid) return out;
    const dot = dx * hit.nx + dy * hit.ny;
    const rx = dx - 2 * dot * hit.nx, ry = dy - 2 * dot * hit.ny;
    const sx = hit.x + hit.nx * 0.05, sy = hit.y + hit.ny * 0.05;
    solids.raycast(sx, sy, rx, ry, Math.max(1, RAIL_RANGE - out.l1), hit);
    out.n = 3;
    out.x2 = hit.x;
    out.y2 = hit.y;
    out.l2 = hit.d;
    out.n2x = hit.nx;
    out.n2y = hit.ny;
    return out;
  }

  const bp = mkPath();
  const bankMiss = (px, py, a, tx, ty) => {
    trace(px, py, a, bp);
    return bp.n < 3 ? Infinity : pointSeg(tx, ty, bp.x1, bp.y1, bp.x2, bp.y2);
  };
  /** An angle from (px, py) whose ricochet passes through (tx, ty), or null. */
  function bank(px, py, tx, ty) {
    const steps = 96;
    let bestA = 0, bestD = Infinity;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * TAU, d = bankMiss(px, py, a, tx, ty);
      if (d < bestD) { bestD = d; bestA = a; }
    }
    let span = TAU / steps;
    for (let it = 0; it < 8; it++) {
      span *= 0.5;
      for (let s = -1; s <= 1; s += 2) {
        const a = bestA + s * span, d = bankMiss(px, py, a, tx, ty);
        if (d < bestD) { bestD = d; bestA = a; }
      }
    }
    return bestD < R * 0.55 ? bestA : null;
  }

  // ---- navigation (static cover only: the moving pieces are handled by sliding) ----
  const cellOf = (x, y) => clamp(Math.floor(y / CELL), 0, ROWS - 1) * COLS + clamp(Math.floor(x / CELL), 0, COLS - 1);
  const cellX = (c) => (c % COLS) * CELL + CELL / 2;
  const cellY = (c) => ((c / COLS) | 0) * CELL + CELL / 2;
  /** The free cell nearest to (x, y), or -1. */
  function nearestCell(x, y) {
    const c0 = cellOf(x, y);
    if (!blocked[c0]) return c0;
    const cx = c0 % COLS, cy = (c0 / COLS) | 0;
    let best = -1, bd = Infinity;
    for (let r = 1; r <= 8 && best < 0; r++) {
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        const nx = cx + i, ny = cy + j;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || blocked[ny * COLS + nx]) continue;
        const d = (nx * CELL + CELL / 2 - x) ** 2 + (ny * CELL + CELL / 2 - y) ** 2;
        if (d < bd) { bd = d; best = ny * COLS + nx; }
      }
    }
    return best;
  }
  /** True when a sniper can walk the straight line A→B past the static cover. */
  function walk(ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay), steps = Math.max(1, Math.ceil(d / 10));
    for (let i = 1; i <= steps; i++) {
      if (blocked[cellOf(ax + ((bx - ax) * i) / steps, ay + ((by - ay) * i) / steps)]) return false;
    }
    return true;
  }

  const gS = new Float32Array(N), came = new Int32Array(N), mark = new Uint32Array(N), shut = new Uint32Array(N);
  const heap = new Int32Array(N * 8), heapF = new Float32Array(N * 8);
  let stamp = 0, hn = 0;
  const hpush = (c, f) => {
    if (hn >= heap.length) return;
    let i = hn++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapF[p] <= f) break;
      heap[i] = heap[p];
      heapF[i] = heapF[p];
      i = p;
    }
    heap[i] = c;
    heapF[i] = f;
  };
  const hpop = () => {
    const top = heap[0];
    hn--;
    if (hn > 0) {
      const c = heap[hn], f = heapF[hn];
      let i = 0;
      for (;;) {
        let k = i * 2 + 1;
        if (k >= hn) break;
        if (k + 1 < hn && heapF[k + 1] < heapF[k]) k++;
        if (heapF[k] >= f) break;
        heap[i] = heap[k];
        heapF[i] = heapF[k];
        i = k;
      }
      heap[i] = c;
      heapF[i] = f;
    }
    return top;
  };
  /** A* from A to B. Writes waypoints [x, y, ...] into out and returns how many. */
  function findPath(ax, ay, bx, by, out) {
    const a = nearestCell(ax, ay), b = nearestCell(bx, by);
    if (a < 0 || b < 0) return 0;
    stamp++;
    hn = 0;
    const bxc = b % COLS, byc = (b / COLS) | 0;
    gS[a] = 0;
    came[a] = -1;
    mark[a] = stamp;
    hpush(a, 0);
    let found = false;
    while (hn > 0) {
      const c = hpop();
      if (c === b) { found = true; break; }
      if (shut[c] === stamp) continue;
      shut[c] = stamp;
      const cx = c % COLS, cy = (c / COLS) | 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        if (!i && !j) continue;
        const nx = cx + i, ny = cy + j;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const k = ny * COLS + nx;
        if (blocked[k] || shut[k] === stamp) continue;
        if (i && j && (blocked[cy * COLS + nx] || blocked[ny * COLS + cx])) continue; // no corner cutting
        const g = gS[c] + (i && j ? 1.4142 : 1);
        if (mark[k] === stamp && gS[k] <= g) continue;
        mark[k] = stamp;
        gS[k] = g;
        came[k] = c;
        const hx = Math.abs(nx - bxc), hy = Math.abs(ny - byc);
        hpush(k, g + Math.max(hx, hy) + 0.4142 * Math.min(hx, hy));
      }
    }
    if (!found) return 0;
    let len = 0;
    for (let c = b; c >= 0; c = came[c]) len++;
    let i = len;
    for (let c = b; c >= 0; c = came[c]) {
      i--;
      out[i * 2] = cellX(c);
      out[i * 2 + 1] = cellY(c);
    }
    // End exactly where we were asked to, when that spot is itself walkable.
    if (!blocked[cellOf(bx, by)]) { out[(len - 1) * 2] = bx; out[(len - 1) * 2 + 1] = by; }
    return len;
  }

  const patrol = [];
  for (const [x, y] of [[430, 150], [800, 118], [1170, 150], [400, 440], [640, 440], [960, 440], [1200, 440], [470, 790], [800, 760], [1130, 790]]) {
    const c = nearestCell(x, y);
    if (c >= 0) patrol.push({ x: cellX(c), y: cellY(c) });
  }

  const outline = [
    CH_TOP, 0, GANTRY.x0, 0, GANTRY.x0 + GANTRY.inset, GANTRY.d, GANTRY.x1 - GANTRY.inset, GANTRY.d, GANTRY.x1, 0,
    W - CH_TOP, 0, W, CH_TOP, W, H - CH_BOT, W - CH_BOT, H, CH_BOT, H, 0, H - CH_BOT, 0, CH_TOP,
  ];

  return { solids, pieces, shutters, drone, state, outline, trackX, sync, trace, bank, findPath, walk, nearestCell, cellX, cellY, freeCells, patrol };
}
