// CARTRIDGE CANYON geometry and physics: two cliffs, a rope bridge, crates, nests, spring
// pads, and the things that move on the clock (thermals, balloon, bird, rising lava).
// Everything here is a pure function of the seed and ctx.time, so both online clients agree.
import { clamp, rand, randInt, pick, segRect, segCircle } from '../../kit.js';
import { FW, FH } from './palette.js';

export const C = {
  RUN: 62, CROUCH_RUN: 26, ACC_G: 900, ACC_A: 420, GRAV: 640, JUMP_V: 226,
  JET_ACC: 1500, JET_CAP: 108, JET_BURN: 0.5, JET_REGEN: 1.0, JET_DELAY: 0.1, SPRING_V: 345,
  BULLET_V: 540, BULLET_G: 135, RELOAD: 1.25, SD_RELOAD: 0.8, METRE: 1.5, // px -> metres
  CRATE: 12, PF: 168, SAG: 4, BIRD_Y: 83, BIRD_DUR: 6.6, LAVA_V: 3.6, BALLOON_R: 14,
  SMOKE_CD: 13, SMOKE_LIFE: 8, SMOKE_R: 24, DECOY_CD: 15, DECOY_LIFE: 9, DECOY_V: 32,
};
// Body sizes by stance: 0 stand, 1 crouch, 2 prone. Hit boxes (w, h) and where the rifle sits (shoulder).
export const BODY = [{ w: 6, h: 15, sh: 13 }, { w: 6, h: 10, sh: 7 }, { w: 14, h: 5, sh: 3 }];
export const HW = 3; // half width used for movement collision in every stance

export function buildWorld(rng) {
  const W = FW, H = FH, PF = C.PF;
  const GY = 100 + randInt(rng, -3, 4);
  const E = 92 + randInt(rng, -2, 6);
  const mirror = (r) => ({ x: W - r.x - r.w, y: r.y, w: r.w, h: r.h });
  const bodies = [];
  for (const r of [{ x: 0, y: GY, w: E, h: H - GY }, { x: E, y: GY + 28, w: 12, h: H - GY - 28 }, { x: E + 12, y: GY + 52, w: 10, h: H - GY - 52 }]) bodies.push(r, mirror(r));
  bodies.push({ x: E + 22, y: PF, w: W - 2 * (E + 22), h: H - PF });
  const walls = [{ x: -40, y: -200, w: 40, h: 400 }, { x: W, y: -200, w: 40, h: 400 }, { x: -40, y: -60, w: W + 80, h: 70 }];

  const span = W - 2 * E;
  const bridgeY = (x) => (x > E && x < W - E ? GY + C.SAG * Math.sin((Math.PI * (x - E)) / span) : -1);

  // Crates: stacked groups on each plateau (mirrored), and one on the bridge.
  const crates = [];
  const addCrate = (x, y) => crates.push({ id: crates.length, x, y, w: C.CRATE, h: C.CRATE, alive: true });
  const group = (cx, kind) => {
    const g = GY - C.CRATE;
    if (kind === 'single') addCrate(cx - 6, g);
    else if (kind === 'pair') { addCrate(cx - 6, g); addCrate(cx - 6, g - C.CRATE); }
    else { addCrate(cx - 12, g); addCrate(cx, g); addCrate(cx - 6, g - C.CRATE); }
  };
  const kinds = ['single', 'pair', 'tri'];
  const near = randInt(rng, 46, 58), far = randInt(rng, E - 28, E - 18);
  const left = [[near, pick(rng, kinds)], [far, pick(rng, ['single', 'single', 'pair'])]];
  for (const [cx, k] of left) group(cx, k);
  const nL = crates.length;
  for (let i = 0; i < nL; i++) { const c = crates[i]; addCrate(W - c.x - c.w, c.y); }
  const mid = bridgeY(W / 2 - 6);
  const midKind = pick(rng, ['single', 'single', 'pair']);
  addCrate(W / 2 - 6, mid - C.CRATE + 1);
  if (midKind === 'pair') addCrate(W / 2 - 6, mid - C.CRATE * 2 + 1);

  const nx = randInt(rng, 34, 44);
  const nests = [{ x: nx, y: GY - 34, w: 26 }, { x: W - nx - 26, y: GY - 34, w: 26 }];
  const pd = randInt(rng, 24, 44);
  const pads = [{ x: W / 2 - pd, y: PF }, { x: W / 2 + pd, y: PF }];

  const world = {
    W, H, GY, E, PF, bodies, walls, crates, nests, pads, span, bridgeY,
    spawns: [{ x: 22, y: GY }, { x: W - 22, y: GY }],
    solids: [],
    phase: [rand(rng, 0, 6.28), rand(rng, 0, 6.28), rand(rng, 0, 6.28)],
    birds: [], balloon: { x: 160, y: 64, on: true, r: C.BALLOON_R }, bird: { on: false, x: 0, y: C.BIRD_Y, dir: 1, warn: 0, flap: 0 },
    U: 0, lavaY: 999, sdT: -1, // thermal lift now, lava surface, seconds since sudden death
  };
  // Birds: first one early enough to be seen, then every ~21 s, alternating sides.
  let t0 = rand(rng, 13, 19), dir = rng() < 0.5 ? 1 : -1;
  for (let k = 0; k < 10; k++) { world.birds.push({ t0, dir }); t0 += rand(rng, 19, 25); dir = -dir; }
  world.rebuild = () => {
    world.solids.length = 0;
    for (const r of bodies) world.solids.push(r);
    for (const r of walls) world.solids.push(r);
    for (const c of crates) if (c.alive) world.solids.push(c);
  };
  world.rebuild();

  /** Advance everything that lives on the clock. t = ctx.time, sd = seconds since sudden death began (<0 before). */
  world.sync = (t, sd) => {
    world.sdT = sd;
    const ph = world.phase;
    world.U = sd >= 0 ? 0 : 60 * Math.sin(t * 0.5 + ph[0]) + 32 * Math.sin(t * 1.27 + ph[1]);
    const b = world.balloon;
    b.on = true;
    b.x = 160 + 124 * Math.sin(t * 0.17 + ph[2]);
    b.y = 66 + 4 * Math.sin(t * 0.7 + ph[0]) - (sd > 0 ? sd * sd * 9 : 0); // sudden death: it floats away
    if (b.y < -40) b.on = false;
    const bd = world.bird;
    bd.on = false;
    bd.warn = 0;
    for (const e of world.birds) {
      const dt = t - e.t0;
      if (dt > -2.4 && dt < 0) { bd.warn = 1 - -dt / 2.4; bd.dir = e.dir; }
      if (dt >= 0 && dt < C.BIRD_DUR) {
        bd.on = true;
        bd.dir = e.dir;
        const u = dt / C.BIRD_DUR, ex = -28 + (W + 56) * u;
        bd.x = e.dir > 0 ? ex : W - ex;
        bd.y = C.BIRD_Y + 3 * Math.sin(dt * 2.2);
        bd.flap = dt * 7;
      }
    }
    world.lavaY = sd >= 0 ? 178 - sd * C.LAVA_V : 999;
  };
  /** Thermal lift (px/s^2, positive = up) at column x: strongest over the middle of the chasm. */
  world.lift = (x) => {
    if (x <= E || x >= W - E) return 0;
    return world.U * Math.pow(Math.sin((Math.PI * (x - E)) / span), 0.7);
  };
  /** Which way the bird will cross column x: seconds until it arrives (Infinity if it will not soon). */
  world.birdEta = (x) => {
    const bd = world.bird;
    if (bd.warn > 0 && !bd.on) {
      const t = world.birdTime;
      for (const e of world.birds) if (t - e.t0 > -2.4 && t - e.t0 < 0) { const d = e.dir > 0 ? x + 28 : W + 28 - x; return -(t - e.t0) + (d / (W + 56)) * C.BIRD_DUR; }
    }
    if (bd.on) { const d = bd.dir > 0 ? x - bd.x : bd.x - x; if (d >= -14) return d / ((W + 56) / C.BIRD_DUR); }
    return Infinity;
  };
  // The highest standing surface at or below y over column x (for things that slide along the ground).
  world.floorY = (x, y) => {
    let best = Infinity;
    for (const r of world.solids) if (x >= r.x && x <= r.x + r.w && r.y >= y - 3 && r.y < best) best = r.y;
    const bw = bridgeY(x);
    if (bw >= 0 && bw >= y - 3 && bw < best) best = bw;
    return best;
  };
  return world;
}

const overlap = (b, hw, hh, r) => b.x - hw < r.x + r.w && b.x + hw > r.x && b.y - hh < r.y + r.h && b.y - 1e-3 > r.y;

/**
 * Move a standing body one small step: gravity-less (the caller sets vy), solids, one-way
 * surfaces (nests, the bridge) and spring pads. Sets b.ground / b.bounce.
 */
export function stepBody(w, b, h, hw, hh) {
  const prevY = b.y;
  b.ground = false;
  b.bounce = false;
  b.x += b.vx * h;
  const sol = w.solids;
  for (let i = 0; i < sol.length; i++) {
    const r = sol[i];
    if (!overlap(b, hw, hh, r)) continue;
    if (b.vx > 0) b.x = r.x - hw;
    else if (b.vx < 0) b.x = r.x + r.w + hw;
    else b.x += b.x < r.x + r.w / 2 ? -0.5 : 0.5;
    b.vx = 0;
    b.wall = true;
  }
  b.y += b.vy * h;
  for (let i = 0; i < sol.length; i++) {
    const r = sol[i];
    if (!overlap(b, hw, hh, r)) continue;
    if (b.vy >= 0) { b.y = r.y; b.ground = true; } else b.y = r.y + r.h + hh;
    b.vy = 0;
  }
  if (b.vy >= 0) {
    const bw = w.bridgeY(b.x);
    if (bw >= 0 && prevY <= bw + 2.5 && b.y >= bw - 0.01) { b.y = bw; b.vy = 0; b.ground = true; }
    for (let i = 0; i < w.nests.length; i++) {
      const n = w.nests[i];
      if (b.x > n.x && b.x < n.x + n.w && prevY <= n.y + 0.5 && b.y >= n.y) { b.y = n.y; b.vy = 0; b.ground = true; }
    }
    for (let i = 0; i < w.pads.length; i++) {
      const p = w.pads[i];
      if (Math.abs(b.x - p.x) <= 8 && b.y >= p.y - 1 && b.y <= p.y + 2) { b.vy = -C.SPRING_V; b.bounce = true; b.ground = false; }
    }
  }
}

/** Is there something solid at this point? (bot sensing) */
export function solidAt(w, x, y) {
  for (let i = 0; i < w.solids.length; i++) {
    const r = w.solids[i];
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return true;
  }
  return false;
}

/** One ballistic step of a bullet (gravity and thermals); g/lift scales let sudden death flatten the arc. */
export function bulletStep(w, b, h, gs, ls) {
  b.vy += (C.BULLET_G * gs - w.lift(b.x) * ls) * h;
  b.x += b.vx * h;
  b.y += b.vy * h;
}

const _seg = { x: 0, y: 0, hit: 0, t: 0, nx: 0, ny: 0, idx: -1 };
/**
 * Fly a bullet from (x, y) at `ang` until it strikes cover, the balloon or the ground, up to maxT.
 * Returns a shared result {hit: 0 none | 1 solid | 2 crate | 3 balloon, x, y, t, idx}. `path`, if given,
 * receives the points (a flat array reused by the caller) for the aim preview.
 */
export function traceBullet(w, x, y, ang, maxT, gs, ls, path) {
  const b = { x, y, vx: Math.cos(ang) * C.BULLET_V, vy: Math.sin(ang) * C.BULLET_V };
  const h = 1 / 80;
  let np = 0;
  _seg.hit = 0;
  for (let t = 0; t < maxT; t += h) {
    const ax = b.x, ay = b.y;
    bulletStep(w, b, h, gs, ls);
    if (path && np < path.length - 1 && ((t / h) | 0) % 2 === 0) { path[np++] = b.x; path[np++] = b.y; }
    const hit = firstHit(w, ax, ay, b.x, b.y);
    if (hit) {
      _seg.hit = hit.kind; _seg.x = hit.x; _seg.y = hit.y; _seg.idx = hit.idx; _seg.t = t;
      break;
    }
    if (b.x < -20 || b.x > w.W + 20 || b.y > w.H + 20) { _seg.t = t; break; }
  }
  if (path) path.n = np;
  return _seg;
}

const _hit = { kind: 0, x: 0, y: 0, idx: -1, t: 1 };
/** Nearest cover (solids, crates, balloon) crossed by the segment A->B, or null. */
export function firstHit(w, ax, ay, bx, by) {
  let best = null, bt = 2;
  const sol = w.solids;
  for (let i = 0; i < sol.length; i++) {
    const hit = segRect(ax, ay, bx, by, sol[i]);
    if (hit && hit.t < bt) { bt = hit.t; best = sol[i]; _hit.kind = best.id !== undefined ? 2 : 1; _hit.idx = best.id !== undefined ? best.id : i; }
  }
  const bl = w.balloon;
  if (bl.on) {
    const t = segCircle(ax, ay, bx, by, bl.x, bl.y, bl.r);
    if (t >= 0 && t < bt) { bt = t; best = bl; _hit.kind = 3; _hit.idx = -1; }
    const bk = { x: bl.x - 4, y: bl.y + bl.r - 2, w: 8, h: 9 };
    const hk = segRect(ax, ay, bx, by, bk);
    if (hk && hk.t < bt) { bt = hk.t; best = bl; _hit.kind = 3; _hit.idx = -1; }
  }
  if (!best) return null;
  _hit.x = ax + (bx - ax) * bt;
  _hit.y = ay + (by - ay) * bt;
  _hit.t = bt;
  return _hit;
}

export const clampX = (x) => clamp(x, 4, FW - 4);
