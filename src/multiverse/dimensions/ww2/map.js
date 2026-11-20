// IRON AUTUMN — the square as data: heightfield, colliders, cover posts, navigation and
// the timetable of everything the world does to the duel. No three.js in here: this is
// what both online clients must agree on, so it is built from ctx.rng and nothing else.
//
// Axes: x east, y up, z south. Player 0 holds the south end (z > 0), player 1 the north.
// The layout is mirrored in z = 0 (the church faces the square from the east on that axis),
// so each sniper gets the same square with left and right swapped.
import { clamp, lerp, smoothstep, fbm } from '../../kit.js';

export const HALF_W = 30, HALF_L = 60;
export const TERRACE_Y = 2.2;
export const SPAWN = [{ x: 6, z: 51.5, yaw: 0 }, { x: 6, z: -51.5, yaw: Math.PI }];
export const SHELL_WARN = 2.5;     // seconds of whistle and ground marker before a shell lands
export const SHELL_LETHAL = 2.7;   // metres: "lethal only at the centre"
export const FLARE_BURN = 9, FLARE_RADIUS = 21;
export const BELL_MASK = 1.0;     // seconds after each strike during which a shot is drowned out

const HF = 0.5, HX0 = -34, HZ0 = -66, HNX = 137, HNZ = 265; // heightfield grid
const NAV = 1.25, NCOLS = 48, NROWS = 96;                   // navigation grid over the playable area

// Scratch for ray results: { t, kind (0 none, 1 box, 2 cylinder, 3 ground, 4 smoke), nx, ny, nz, surf }.
export const hit = { t: 0, kind: 0, nx: 0, ny: 1, nz: 0, surf: 'stone' };

export function buildMap(rng) {
  const boxes = [], cyls = [], pieces = [], craters = [], trench = [], posts = [];
  const R = (a, b) => a + rng() * (b - a);

  // ---- colliders ----------------------------------------------------------------------
  // A box blocks bodies when it is taller than a step and blocks bullets always. `from` /
  // `until` (seconds of ctx.time) give it a lifetime: that is how the wall falls on both clients.
  function box(x0, z0, x1, z1, y0, y1, surf = 'stone', o) {
    const b = { x0, y0, z0, x1, y1, z1, surf, from: -1, until: 1e9, ...o };
    boxes.push(b);
    return b;
  }
  function cyl(x, z, r, y0, y1, surf = 'stone') {
    const c = { x, z, r, y0, y1, surf };
    cyls.push(c);
    return c;
  }
  // Everything is listed for the south half and mirrored; `m` runs over [+1, -1].
  const both = (fn) => { fn(1); fn(-1); };
  const zr = (m, z0, z1) => (m > 0 ? [z0, z1] : [-z1, -z0]);
  function mbox(m, x0, z0, x1, z1, y0, y1, surf, o) {
    const [a, b] = zr(m, z0, z1);
    return box(x0, a, x1, b, y0, y1, surf, o);
  }
  const piece = (type, o) => { const p = { type, ...o }; pieces.push(p); return p; };

  // East: the church on its terrace.
  box(31, -21, 44, 21, 0, 40);
  box(24, -19, 31, 19, 0, TERRACE_Y);
  for (let i = 0; i < 6; i++) box(19.2 + 0.8 * i, -4, 24, 4, 0, (TERRACE_Y / 6) * (i + 1));
  for (const s of [-1, 1]) box(19.2, s > 0 ? 4 : -4.5, 24, s > 0 ? 4.5 : -4, 0, 1.5); // cheek walls: the steps are entered from the front
  piece('church', {});
  both((m) => {
    // Rubble ramps off both ends of the terrace (stacked slabs: each one is a step).
    for (let i = 0; i < 6; i++) mbox(m, 25, 19, 30.6, 19 + 1.1 * (6 - i), 0, (TERRACE_Y / 6) * (i + 1), 'dirt');
    mbox(m, 24.45, 19, 25, 25.2, 0, 1.5); // and the ramp from its foot, not over its side
    piece('ramp', { m, x0: 25, x1: 30.6, z0: 19, z1: 25.6 });
    // Parapet along the terrace edge, broken in places.
    for (const [a, b] of [[4.6, 9.2], [12.4, 19]]) {
      mbox(m, 24, a, 24.45, b, TERRACE_Y, TERRACE_Y + 1.0);
      piece('parapet', { m, z0: a, z1: b });
    }
    mbox(m, 24, 18.6, 25, 19, TERRACE_Y, TERRACE_Y + 1.0);
    // The terrace nest: sandbags across it, and crates against the church wall.
    mbox(m, 24.6, 9.6, 28.4, 10.4, TERRACE_Y, TERRACE_Y + 1.15, 'sand');
    piece('sandbags', { m, x0: 24.6, x1: 28.4, z0: 9.6, z1: 10.4, y: TERRACE_Y, h: 1.15 });
    mbox(m, 29.2, 13.2, 30.6, 14.8, TERRACE_Y, TERRACE_Y + 1.1, 'wood');
    piece('crates', { m, x0: 29.2, x1: 30.6, z0: 13.2, z1: 14.8, y: TERRACE_Y, h: 1.1 });
    // House row north and south of the church, with one alley to duck into.
    mbox(m, 30.6, 21, 44, 37, 0, 30);
    mbox(m, 30.6, 41, 44, 64, 0, 30);
    mbox(m, 36, 37, 44, 41, 0, 30);
    piece('row', { m, side: 1, z0: 21, z1: 37 });
    piece('row', { m, side: 1, z0: 41, z1: 62 });
    // West: a continuous ruined frontage (the sun comes through what is left of it).
    mbox(m, -44, 0, -30, 64, 0, 30);
    piece('row', { m, side: -1, z0: 0, z1: 31 });
    piece('row', { m, side: -1, z0: 31, z1: 62 });
    // The ends: buildings either side of a barricaded street.
    mbox(m, -44, 60, 44, 66, 0, 30);
    piece('end', { m });

    // Low walls and standing cover.
    const wall = (x0, z0, x1, z1, h) => { mbox(m, x0, z0, x1, z1, 0, h); piece('wall', { m, x0, x1, z0, z1, h }); };
    wall(19.5, 30, 26.5, 30.55, 1.25);
    wall(-17, 19.6, -10.5, 20.2, 1.3);
    wall(-2, 23.6, 4.5, 24.25, 2.7);
    wall(-5.3, 36, -4.65, 42.5, 2.5);
    wall(-17, 45.4, -11.5, 46.05, 3.0);
    wall(-17, 46.05, -16.35, 50, 2.1);
    wall(14.5, 26.2, 18.5, 26.8, 1.2);
    // Sandbag nests: a front wall and two stubs.
    const nest = (cx, z, w) => {
      mbox(m, cx - w, z, cx + w, z + 0.8, 0, 1.15, 'sand');
      piece('sandbags', { m, x0: cx - w, x1: cx + w, z0: z, z1: z + 0.8, y: 0, h: 1.15 });
      for (const s of [-1, 1]) {
        const x0 = s < 0 ? cx - w : cx + w - 0.75;
        mbox(m, x0, z + 0.8, x0 + 0.75, z + 2.5, 0, 1.0, 'sand');
        piece('sandbags', { m, x0, x1: x0 + 0.75, z0: z + 0.8, z1: z + 2.5, y: 0, h: 1.0 });
      }
    };
    nest(-10, 28.4, 2.2);
    nest(13, 38.4, 2.2);
    // The barricade each sniper starts behind.
    mbox(m, 2.5, 47.4, 9.5, 48.2, 0, 1.15, 'sand');
    piece('sandbags', { m, x0: 2.5, x1: 9.5, z0: 47.4, z1: 48.2, y: 0, h: 1.15 });
    mbox(m, -1.6, 48.6, 1.2, 50.1, 0, 1.35, 'wood');
    piece('cart', { m, x: -0.2, z: 49.35, rot: 0.25 });
    mbox(m, 20.6, 43.3, 23.4, 44.8, 0, 1.35, 'wood');
    piece('cart', { m, x: 22, z: 44.05, rot: -0.12 });
    // Crates.
    mbox(m, 3.5, 11.8, 5.7, 13.3, 0, 1.0, 'wood');
    mbox(m, 3.8, 12.0, 4.9, 13.1, 1.0, 1.85, 'wood');
    piece('crates', { m, x0: 3.5, x1: 5.7, z0: 11.8, z1: 13.3, y: 0, h: 1.0, top: true });
    mbox(m, -16.6, 36.2, -14.4, 37.8, 0, 1.0, 'wood');
    piece('crates', { m, x0: -16.6, x1: -14.4, z0: 36.2, z1: 37.8, y: 0, h: 1.0 });
    // The wrecks: a tank in the north half, a half-track in the south. Same footprint.
    mbox(m, 8.1, 15.5, 13.9, 18.5, 0, 1.55, 'metal');
    mbox(m, 9.6, 15.9, 12.5, 18.1, 1.55, 2.45, 'metal');
    piece(m > 0 ? 'halftrack' : 'tank', { m, x: 11, z: m * 17 });
    // Tank traps, an advertising column, trees, lamp posts.
    for (const x of [5.5, 9, 12.5, 16]) { cyl(x, m * 7.5, 0.45, 0, 1.2, 'metal'); piece('hedgehog', { x, z: m * 7.5 }); }
    for (const x of [-12, -8.5]) { cyl(x, m * 10.5, 0.45, 0, 1.2, 'metal'); piece('hedgehog', { x, z: m * 10.5 }); }
    cyl(-3, m * 14, 0.75, 0, 3.3);
    piece('column', { x: -3, z: m * 14 });
    for (const [x, z] of [[17.5, 34], [-13, 54.5]]) { cyl(x, m * z, 0.3, 0, 7, 'wood'); piece('tree', { x, z: m * z }); }
    for (const [x, z] of [[18.6, 11], [-18, 27], [-7, 56], [17, 52]]) { cyl(x, m * z, 0.13, 0, 4.6, 'metal'); piece('lamp', { x, z: m * z, m }); }
  });
  // Centre: the dry fountain, and the wall that will not last the round.
  cyl(0, 0, 3.1, 0, 0.75);
  cyl(0, 0, 0.8, 0, 3.4);
  piece('fountain', { x: 0, z: 0 });
  const collapseT = Math.round(R(35, 43) * 10) / 10;
  const fallWall = { x0: -17, x1: -6, z: 0, h: 7.4, t: collapseT, warn: 3.2 };
  box(-17, -0.4, -6, 0.4, 0, fallWall.h, 'stone', { until: collapseT });
  box(-17, -2, -6, 2, 0, 0.95, 'stone', { from: collapseT });
  piece('fallwall', fallWall);

  // ---- terrain ------------------------------------------------------------------------
  // Trench on the west flank: a covered lane from each end to the middle of the square.
  // Segments carry a depth at each end, so ramps are just segments that shoal.
  const seg = (ax, az, bx, bz, da = 1.5, db = 1.5) => trench.push({ ax, az, bx, bz, da, db });
  both((m) => {
    seg(-22, 0, -22, m * 4);
    seg(-22, m * 4, -25, m * 8);
    seg(-25, m * 8, -25, m * 20);
    seg(-25, m * 20, -22, m * 24);
    seg(-22, m * 24, -22, m * 36);
    seg(-22, m * 36, -22, m * 41.5, 1.5, 0);
    seg(-25, m * 13, -19.5, m * 13, 1.5, 0);
  });
  // Craters: mirrored pairs on open ground, a few at fixed spots so every round has pits
  // on the centre lanes, the rest wherever the seed drops them.
  const blocked = (x, z, pad) => {
    for (const b of boxes) if (b.y1 > 0.5 && x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad) return true;
    for (const c of cyls) if (Math.hypot(x - c.x, z - c.z) < c.r + pad) return true;
    for (const s of trench) if (segDist(x, z, s.ax, s.az, s.bx, s.bz) < pad + 1.6) return true;
    for (const c of craters) if (Math.hypot(x - c.x, z - c.z) < c.r + pad + 0.8) return true;
    return false;
  };
  const crater = (x, z, r, d) => { craters.push({ x, z, r, d }, { x, z: -z, r, d }); };
  crater(-9.5 + R(-1, 1), 12 + R(-1, 1), 3.4, 1.15);
  crater(9 + R(-1.5, 1.5), 29.5 + R(-1, 1), 3.2, 1.1);
  crater(-1 + R(-1, 1), 33 + R(-1, 1), 3.0, 1.05);
  for (let i = 0, tries = 0; i < 5 && tries < 200; tries++) {
    const r = R(2.2, 3.6), x = R(-18, 19), z = R(5, 46);
    if (blocked(x, z, r)) continue;
    crater(x, z, r, r * R(0.3, 0.36));
    i++;
  }

  // Analytic height before it is baked into the grid.
  function rawHeight(x, z) {
    let h = fbm(x * 0.13 + 7.1, z * 0.13 - 3.3, 3) * 0.1;
    // Rubble banked up against the frontages and the ends.
    const edge = Math.max(Math.abs(x) - 24.5, (Math.abs(z) - 55) * 1.1);
    if (edge > 0) {
      const n = 0.55 + 0.45 * fbm(x * 0.31, z * 0.31 + 20, 3) * 2;
      const church = smoothstep(16, 20, x) * (1 - smoothstep(25.6, 29, Math.abs(z))); // the terrace is kept clear
      h += smoothstep(0, 5.5, edge) * 0.95 * clamp(n, 0.15, 1.2) * (1 - church);
    }
    for (const c of craters) {
      if (Math.abs(x - c.x) > c.r * 1.6 || Math.abs(z - c.z) > c.r * 1.6) continue;
      const q = Math.hypot(x - c.x, z - c.z) / c.r;
      if (q < 1.6) {
        if (q < 1) { const k = 1 - q * q; h -= c.d * k * k; }
        const e = (q - 1.05) / 0.22;
        h += 0.2 * c.d * Math.exp(-e * e);
      }
    }
    let cut = 0, bank = 0;
    if (x < -16 && x > -28.5) for (const s of trench) { // the trench keeps to the west flank
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      const t = clamp(((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz), 0, 1);
      const d = Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t));
      if (d > 2.6) continue;
      const depth = lerp(s.da, s.db, t);
      cut = Math.max(cut, depth * (1 - smoothstep(0.62, 1.12, d)));
      bank = Math.max(bank, 0.3 * Math.min(1, depth) * smoothstep(1.0, 1.5, d) * (1 - smoothstep(1.7, 2.6, d)));
    }
    return cut > 0.02 ? Math.min(h, 0.05) - cut : h + bank;
  }
  const hf = new Float32Array(HNX * HNZ);
  for (let j = 0; j < HNZ; j++) for (let i = 0; i < HNX; i++) hf[j * HNX + i] = rawHeight(HX0 + i * HF, HZ0 + j * HF);
  function height(x, z) {
    const fx = clamp((x - HX0) / HF, 0, HNX - 1.001), fz = clamp((z - HZ0) / HF, 0, HNZ - 1.001);
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * HNX + i;
    return (hf[k] * (1 - u) + hf[k + 1] * u) * (1 - v) + (hf[k + HNX] * (1 - u) + hf[k + HNX + 1] * u) * v;
  }

  // ---- queries ------------------------------------------------------------------------
  const smokes = []; // { x, y, z, r, t0, t1 } — managed by the game, blocks sight only
  const smokeR = (s, time) => s.r * Math.min(1, (time - s.t0) / 1.6) * (1 - smoothstep(s.t1 - 2.5, s.t1, time));

  // Highest thing to stand on at (x, z) for feet currently at y: the ground, or the top of
  // any box no more than a step above.
  function floorAt(x, z, y, time) {
    let f = height(x, z);
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 || b.y1 > y + 0.5 || b.y1 <= f) continue;
      if (time < b.from || time >= b.until) continue;
      f = b.y1;
    }
    return f;
  }

  // Push a body (circle of radius r, feet at y) out of everything solid. Mutates p {x, z}.
  function pushOut(p, r, y, time) {
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (b.y1 <= y + 0.5 || b.y0 >= y + 1.5 || time < b.from || time >= b.until) continue;
        const px = clamp(p.x, b.x0, b.x1), pz = clamp(p.z, b.z0, b.z1);
        const dx = p.x - px, dz = p.z - pz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        moved = true;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          p.x = px + (dx / d) * r;
          p.z = pz + (dz / d) * r;
        } else {
          const l = p.x - b.x0, rr = b.x1 - p.x, t = p.z - b.z0, bb = b.z1 - p.z, mn = Math.min(l, rr, t, bb);
          if (mn === l) p.x = b.x0 - r;
          else if (mn === rr) p.x = b.x1 + r;
          else if (mn === t) p.z = b.z0 - r;
          else p.z = b.z1 + r;
        }
      }
      for (let i = 0; i < cyls.length; i++) {
        const c = cyls[i];
        if (c.y1 <= y + 0.5 || c.y0 >= y + 1.5) continue;
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), min = c.r + r;
        if (d >= min) continue;
        moved = true;
        if (d > 1e-5) { p.x = c.x + (dx / d) * min; p.z = c.z + (dz / d) * min; }
        else p.x = c.x + min;
      }
      if (!moved) break;
    }
    p.x = clamp(p.x, -HALF_W + 0.4, HALF_W + 0.4);
    p.z = clamp(p.z, -HALF_L + 0.3, HALF_L - 0.3);
  }

  // Walk a body: a = { x, y, z, vy }. Steps up boxes, refuses slopes steeper than ~50
  // degrees (the trench walls), slides along what it cannot climb, falls off edges.
  const mv = { x: 0, z: 0 };
  function tryStep(a, nx, nz, time) {
    mv.x = nx; mv.z = nz;
    pushOut(mv, 0.36, a.y, time);
    const d = Math.hypot(mv.x - a.x, mv.z - a.z);
    if (d < 1e-5) return false;
    const ground = height(mv.x, mv.z), f = floorAt(mv.x, mv.z, a.y, time);
    if (f - a.y > 0.5) return false;
    if (f === ground && ground - a.y > 1.25 * d + 0.04) return false;
    a.x = mv.x; a.z = mv.z;
    return true;
  }
  function walk(a, dx, dz, dt, time) {
    if (dx || dz) {
      if (!tryStep(a, a.x + dx, a.z + dz, time) && !(dx && tryStep(a, a.x + dx, a.z, time))) { if (dz) tryStep(a, a.x, a.z + dz, time); }
    } else {
      mv.x = a.x; mv.z = a.z;
      pushOut(mv, 0.36, a.y, time);
      a.x = mv.x; a.z = mv.z;
    }
    const f = floorAt(a.x, a.z, a.y, time);
    if (a.y > f + 0.02) {
      a.vy -= 20 * dt;
      a.y += a.vy * dt;
      if (a.y <= f) { a.y = f; a.vy = 0; }
    } else { a.y = f; a.vy = 0; }
  }

  // First thing a ray hits within maxT. (dx, dy, dz) must be normalised. Result in `hit`.
  function ray(ox, oy, oz, dx, dy, dz, maxT, time, smoke) {
    let best = maxT;
    hit.kind = 0;
    const ix = dx !== 0 ? 1 / dx : 1e30, iy = dy !== 0 ? 1 / dy : 1e30, iz = dz !== 0 ? 1 / dz : 1e30;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (time < b.from || time >= b.until) continue;
      let t1 = (b.x0 - ox) * ix, t2 = (b.x1 - ox) * ix, tmin, tmax, ax = 0, tmp;
      if (t1 > t2) { tmp = t1; t1 = t2; t2 = tmp; }
      tmin = t1; tmax = t2;
      t1 = (b.y0 - oy) * iy; t2 = (b.y1 - oy) * iy;
      if (t1 > t2) { tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) { tmin = t1; ax = 1; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
      t1 = (b.z0 - oz) * iz; t2 = (b.z1 - oz) * iz;
      if (t1 > t2) { tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) { tmin = t1; ax = 2; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax || tmax < 0 || tmin >= best) continue;
      if (tmin < 0) continue; // started inside: let the shot out rather than swallow it
      best = tmin;
      hit.kind = 1;
      hit.surf = b.surf;
      hit.nx = ax === 0 ? -Math.sign(dx) : 0;
      hit.ny = ax === 1 ? -Math.sign(dy) : 0;
      hit.nz = ax === 2 ? -Math.sign(dz) : 0;
    }
    const a2 = dx * dx + dz * dz;
    if (a2 > 1e-9) {
      for (let i = 0; i < cyls.length; i++) {
        const c = cyls[i], fx = ox - c.x, fz = oz - c.z;
        const bq = fx * dx + fz * dz, cq = fx * fx + fz * fz - c.r * c.r;
        const disc = bq * bq - a2 * cq;
        if (disc < 0 || cq < 0) continue;
        const t = (-bq - Math.sqrt(disc)) / a2;
        if (t < 0 || t >= best) continue;
        const y = oy + dy * t;
        if (y < c.y0 || y > c.y1) continue;
        best = t;
        hit.kind = 2;
        hit.surf = c.surf;
        hit.nx = (ox + dx * t - c.x) / c.r;
        hit.ny = 0;
        hit.nz = (oz + dz * t - c.z) / c.r;
      }
    }
    // Ground: march, then bisect. Nothing on the square's floor rises above 1.4 m.
    if (!(oy > 1.5 && dy >= 0)) {
      const end = dy < 0 ? Math.min(best, (oy + 1.8) / -dy + 1) : best;
      let pt = 0;
      for (let t = 0.75; pt < end; t += 0.75) {
        const tt = t > end ? end : t, y = oy + dy * tt;
        const d = y - height(ox + dx * tt, oz + dz * tt);
        if (d < 0) {
          let lo = pt, hi = tt;
          for (let k = 0; k < 5; k++) {
            const mid = (lo + hi) * 0.5;
            if (oy + dy * mid - height(ox + dx * mid, oz + dz * mid) < 0) hi = mid; else lo = mid;
          }
          if (hi < best) { best = hi; hit.kind = 3; hit.surf = 'dirt'; hit.nx = 0; hit.ny = 1; hit.nz = 0; }
          break;
        }
        if (y > 1.5 && dy > 0) break;
        pt = tt;
      }
    }
    if (smoke) {
      for (let i = 0; i < smokes.length; i++) {
        const s = smokes[i], r = smokeR(s, time);
        if (r < 0.5) continue;
        const fx = ox - s.x, fy = oy - s.y, fz = oz - s.z;
        const bq = fx * dx + fy * dy + fz * dz, cq = fx * fx + fy * fy + fz * fz - r * r;
        const disc = bq * bq - cq;
        if (disc < 0) continue;
        const t = cq < 0 ? 0 : -bq - Math.sqrt(disc);
        if (t < 0 || t >= best) continue;
        best = t;
        hit.kind = 4;
      }
    }
    hit.t = best;
    return best;
  }

  // Clear line between two points? Smoke blocks it unless `noSmoke`.
  function los(ax, ay, az, bx, by, bz, time, noSmoke) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz);
    if (d < 1e-4) return true;
    return ray(ax, ay, az, dx / d, dy / d, dz / d, d, time, !noSmoke) >= d - 1e-3;
  }

  // ---- navigation ---------------------------------------------------------------------
  const nFloor = new Float32Array(NCOLS * NROWS), nFree = new Uint8Array(NCOLS * NROWS);
  const cellX = (c) => -HALF_W + (c + 0.5) * NAV, cellZ = (r) => -HALF_L + (r + 0.5) * NAV;
  const colOf = (x) => clamp(Math.floor((x + HALF_W) / NAV), 0, NCOLS - 1), rowOf = (z) => clamp(Math.floor((z + HALF_L) / NAV), 0, NROWS - 1);
  {
    for (let r = 0; r < NROWS; r++) for (let c = 0; c < NCOLS; c++) {
      const x = cellX(c), z = cellZ(r), k = r * NCOLS + c;
      // The terrace and its stairs are floors, not obstacles: probe from above.
      const f = floorAt(x, z, x > 18.5 && Math.abs(z) < 26 ? 2.4 : 0.3, 0);
      nFloor[k] = f;
      let free = true; // boxes of every lifetime count: the wall and the rubble it leaves both block the way
      for (const b of boxes) {
        if (b.y1 <= f + 0.5 || b.y0 >= f + 1.5) continue;
        if (x > b.x0 - 0.5 && x < b.x1 + 0.5 && z > b.z0 - 0.5 && z < b.z1 + 0.5) { free = false; break; }
      }
      if (free) for (const cc of cyls) if (cc.y1 > f + 0.5 && Math.hypot(x - cc.x, z - cc.z) < cc.r + 0.5) { free = false; break; }
      nFree[k] = free ? 1 : 0;
    }
  }
  const gCost = new Float32Array(NCOLS * NROWS), came = new Int32Array(NCOLS * NROWS), state = new Uint8Array(NCOLS * NROWS);
  const open = new Int32Array(NCOLS * NROWS), fCost = new Float32Array(NCOLS * NROWS);
  const canGo = (a, b) => nFree[b] && Math.abs(nFloor[a] - nFloor[b]) < 0.8;
  function nearestFree(x, z, y = height(x, z)) {
    const c0 = colOf(x), r0 = rowOf(z), k0 = r0 * NCOLS + c0;
    if (nFree[k0] && Math.abs(nFloor[k0] - y) < 1) return k0;
    let best = -1, bd = 1e9;
    for (let r = Math.max(0, r0 - 4); r <= Math.min(NROWS - 1, r0 + 4); r++) for (let c = Math.max(0, c0 - 4); c <= Math.min(NCOLS - 1, c0 + 4); c++) {
      const k = r * NCOLS + c;
      if (!nFree[k]) continue;
      const d = Math.hypot(cellX(c) - x, cellZ(r) - z) + Math.abs(nFloor[k] - y) * 3;
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }
  // Straight walk from a to b without leaving free ground, crossing a ledge or brushing
  // anything solid? Cells are coarse (a free cell can still hold the corner of a sandbag
  // wall), so the body itself is tried against the colliders along the way.
  const probe = { x: 0, z: 0 };
  function clearWalk(ax, az, bx, bz) {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.4));
    let prev = rowOf(az) * NCOLS + colOf(ax);
    for (let i = 1; i <= n; i++) {
      const x = lerp(ax, bx, i / n), z = lerp(az, bz, i / n), k = rowOf(z) * NCOLS + colOf(x);
      if (k !== prev && !canGo(prev, k)) return false;
      prev = k;
      probe.x = x; probe.z = z;
      pushOut(probe, 0.42, nFloor[k], 0);
      if (Math.abs(probe.x - x) + Math.abs(probe.z - z) > 0.03) return false;
    }
    return true;
  }
  // A* over the grid, then string-pulled. Returns [{x, z}, ...] ending at the goal, or null.
  // `avoid(x, z)` may add cost to a cell (the bot uses it to stay out of the enemy's sight).
  function path(ax, az, bx, bz, avoid, ay, by) {
    const s = nearestFree(ax, az, ay), g = nearestFree(bx, bz, by);
    if (s < 0 || g < 0) return null;
    state.fill(0);
    let n = 0;
    const gx = cellX(g % NCOLS), gz = cellZ((g / NCOLS) | 0);
    gCost[s] = 0; came[s] = -1; state[s] = 1;
    fCost[s] = Math.hypot(cellX(s % NCOLS) - gx, cellZ((s / NCOLS) | 0) - gz);
    open[n++] = s;
    let found = false;
    for (let guard = 0; n > 0 && guard < 6000; guard++) {
      let bi = 0;
      for (let i = 1; i < n; i++) if (fCost[open[i]] < fCost[open[bi]]) bi = i;
      const cur = open[bi];
      open[bi] = open[--n];
      if (cur === g) { found = true; break; }
      state[cur] = 2;
      const c = cur % NCOLS, r = (cur / NCOLS) | 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= NCOLS || nr >= NROWS) continue;
        const k = nr * NCOLS + nc;
        if (state[k] === 2 || !canGo(cur, k)) continue;
        if (dr && dc && (!canGo(cur, r * NCOLS + nc) || !canGo(cur, nr * NCOLS + c))) continue; // no corner cutting
        let step = (dr && dc ? 1.414 : 1) * NAV;
        if (avoid) step += avoid(cellX(nc), cellZ(nr));
        const ng = gCost[cur] + step;
        if (state[k] === 1 && ng >= gCost[k]) continue;
        gCost[k] = ng;
        fCost[k] = ng + Math.hypot(cellX(nc) - gx, cellZ(nr) - gz);
        came[k] = cur;
        if (state[k] !== 1) { state[k] = 1; open[n++] = k; }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let k = g; k >= 0; k = came[k]) cells.push(k);
    cells.reverse();
    // Pulled taut from where the body actually is, not from the middle of its cell.
    const out = [], cx = (k) => cellX(k % NCOLS), cz = (k) => cellZ((k / NCOLS) | 0);
    let i = 0, px = ax, pz = az;
    while (i < cells.length - 1) {
      let j = Math.min(cells.length - 1, i + 14);
      while (j > i + 1 && !clearWalk(px, pz, cx(cells[j]), cz(cells[j]))) j--;
      px = cx(cells[j]); pz = cz(cells[j]);
      out.push({ x: px, z: pz });
      i = j;
    }
    if (out.length) { const last = out[out.length - 1]; if (Math.hypot(last.x - bx, last.z - bz) < 2) { last.x = bx; last.z = bz; } }
    else out.push({ x: bx, z: bz });
    return out;
  }

  // ---- cover posts --------------------------------------------------------------------
  // dir = which way the cover faces: -1 shields against the north, +1 against the south.
  // kind: 'low' (crouch to hide, scope to peek over), 'high' (stand behind, step to px to
  // shoot), 'pit' (crater or trench: crouch to vanish, stand to shoot).
  function post(x, z, dir, kind, px = x) {
    const y = floorAt(x, z, x > 23 && Math.abs(z) < 20 ? 2.4 : 0.3, 0), k = nearestFree(x, z, y);
    if (k < 0 || Math.hypot(cellX(k % NCOLS) - x, cellZ((k / NCOLS) | 0) - z) > 1.3) return;
    posts.push({ x, z, dir, kind, px, y });
  }
  for (const p of pieces) {
    if (p.type === 'sandbags' || p.type === 'wall' || p.type === 'crates' || p.type === 'cart') {
      let x0 = p.x0, x1 = p.x1, z0, z1, h = p.h;
      if (p.type === 'cart') { x0 = p.x - 1.4; x1 = p.x + 1.4; [z0, z1] = [p.m * p.z - 0.75, p.m * p.z + 0.75]; h = 1.35; }
      else [z0, z1] = zr(p.m, p.z0, p.z1);
      if (x1 - x0 < 1.6 || x1 - x0 < z1 - z0) continue;
      // (Three along the long barricades: the middle one looks straight down the centre lane.)
      const kind = h > 1.5 ? 'high' : 'low', n = x1 - x0 > 6 && kind === 'low' ? 3 : x1 - x0 > 4.5 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const x = n === 1 ? (x0 + x1) / 2 : lerp(x0 + 1.1, x1 - 1.1, i / (n - 1));
        const px = kind === 'high' ? (i === 0 && n > 1 ? x0 - 0.75 : x1 + 0.75) : x;
        post(x, z1 + 0.75, -1, kind, px);
        post(x, z0 - 0.75, 1, kind, px);
      }
    } else if (p.type === 'tank' || p.type === 'halftrack') {
      for (const d of [-1, 1]) { post(p.x - 1.8, p.z - d * 2.4, d, 'high', p.x - 3.7); post(p.x + 1.8, p.z - d * 2.4, d, 'high', p.x + 3.7); }
    } else if (p.type === 'fountain') {
      for (const d of [-1, 1]) { post(-1.6, -d * 4.0, d, 'low'); post(1.6, -d * 4.0, d, 'low'); }
    }
  }
  for (const c of craters) for (const d of [-1, 1]) if (c.d > 0.8) post(c.x, c.z - d * c.r * 0.25, d, 'pit');
  both((m) => {
    for (const [x, z] of [[-22, 2.5], [-25, 11], [-25, 17], [-22, 27], [-22, 33]]) for (const d of [-1, 1]) post(x, m * z, d, 'pit');
  });

  // ---- the timetable ------------------------------------------------------------------
  // Artillery: every salvo walks a line of shells through one of the places a sniper likes
  // to sit, and the same line through its mirror image, so neither end is favoured.
  const camps = [[6, 50], [13, 40], [-10, 30], [27, 12], [-24, 14], [11, 20], [1, 25.5], [-22, 30], [0, 5], [22, 31], [-13, 47], [-9.5, 12]];
  for (let i = camps.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [camps[i], camps[j]] = [camps[j], camps[i]]; }
  const shells = [];
  for (let k = 0; k < 7; k++) {
    const t0 = 8.5 + k * 9.5 + R(-1.2, 1.2), [cx, cz] = camps[k % camps.length], a = R(0, Math.PI), n = 5;
    for (let i = 0; i < n; i++) {
      const s = (i - (n - 1) / 2) * 4.6 + R(-0.8, 0.8);
      const x = clamp(cx + Math.cos(a) * s, -28, 29), z = clamp(cz + Math.sin(a) * s, -58, 58), t = t0 + i * 0.45;
      shells.push({ t, x, z }, { t, x, z: -z });
    }
  }
  shells.sort((a, b) => a.t - b.t);
  for (const s of shells) s.y = floorAt(s.x, s.z, 3, 0);
  // Parachute flares: a mirrored pair at a time, over ground worth lighting up.
  const flares = [];
  const lit = [[-10, 30], [13, 40], [6, 48], [-22, 26], [10, 20], [26, 12], [0, 22], [-14, 44], [18, 34]];
  for (let k = 0; k < 4; k++) {
    const t = 12 + k * 15 + R(-2, 2), [fx, fz] = lit[Math.floor(rng() * lit.length)];
    const x = fx + R(-4, 4), z = fz + R(-4, 4), sw = R(0, 6.28);
    flares.push({ t, x, z, sw }, { t, x, z: -z, sw: sw + 2 });
  }
  // The bell: three strokes at a time. A rifle fired on a stroke is drowned out.
  const bellStrokes = [];
  for (let k = 0; k < 8; k++) for (let i = 0; i < 3; i++) bellStrokes.push(24 + k * 17 + i * 2.2);
  const bellMasked = (time) => {
    for (let i = 0; i < bellStrokes.length; i++) { const d = time - bellStrokes[i]; if (d >= -0.05 && d < BELL_MASK) return true; if (d < -0.05) break; }
    return false;
  };

  // Sudden death: the barrage closes on the fountain from both ends. Everything outside
  // |z| <= safeZ(t) is being shelled; t is seconds since sudden death began.
  const safeZ = (t) => (t < 16 ? lerp(HALF_L, 13, smoothstep(0, 16, t)) : lerp(13, 2.5, smoothstep(16, 26, t)));

  return {
    boxes, cyls, pieces, craters, trench, posts, smokes, hf, HF, HX0, HZ0, HNX, HNZ,
    height, rawHeight, floorAt, walk, pushOut, ray, los, path, smokeR,
    shells, flares, bellStrokes, bellMasked, collapseT, fallWall, safeZ,
  };
}

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
