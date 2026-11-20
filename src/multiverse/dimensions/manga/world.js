// The street: its size, its cover, the train and the gusts, and the ground-plane geometry shared by
// the simulation, the bot and the renderer.
//
// The play field is a ground plane: x runs along the street, z is depth (0 = the shopfronts, WZ = the
// gutter). The camera looks at it from the side with the depth axis squashed by DY, so a point on the
// ground lands at  sx = ox + x*S,  sy = oy + z*DY*S - height*S.  A shot is aimed with a screen angle and
// flies along the matching ground direction at chest height, which is what makes "aim at the figure you
// see" work in every lane.
import { rand, randInt, hashSeed, resolveCircleRects, raycastRects } from '../../kit.js';

export const WX = 96, WZ = 20, DY = 0.55, FIG = 3.4;
export const R_BODY = 0.85;       // hit radius on the ground plane
export const R_WALK = 0.8;        // collision radius against cover
export const V_X = 6.8, V_Z = 5.2, BULLET_V = 130, CHEST = 2.35; // CHEST: the height of the rifle on screen (the figures are drawn 15% over life size)
export const XING = { x: WX / 2, w: 9.4, rails: [WX / 2 - 1.5, WX / 2 + 1.5] };
export const SPAWN = [{ x: 14, z: 10 }, { x: WX - 14, z: 10 }];
export const TRAIN = { v: 52, len: 46, w: 5.4, warn: 3.4 };

// kind: footprint (w x d), height h, tall = stops a bullet flying at chest height
export const KINDS = {
  vend: { w: 2.6, d: 1.4, h: 3.8, tall: true },
  crate: { w: 3.2, d: 2.1, h: 3.5, tall: true },
  bins: { w: 2.3, d: 1.3, h: 2.7, tall: true },
  cart: { w: 3.5, d: 1.7, h: 3.4, tall: true },
  scoot: { w: 2.7, d: 1.0, h: 1.9, tall: false },
  toro: { w: 1.5, d: 1.5, h: 3.9, tall: true },
  pole: { w: 0.8, d: 0.8, h: 11, tall: true },
  bench: { w: 3.2, d: 1.1, h: 1.3, tall: false },
  pillar: { w: 1.0, d: 1.0, h: 8.6, tall: true },
};

// Left half of the street; the right half is its mirror image, so neither spawn is favoured.
const LAYOUT = [
  ['vend', 5, 0.7], ['vend', 8, 0.7], ['scoot', 15.5, 2.2], ['crate', 11.5, 15.8], ['scoot', 24.5, 14.6],
  ['crate', 31.5, 7.6], ['bins', 43, 2.4], ['cart', 47.5, 13.6], ['toro', 38.5, 12.4], ['pole', 54.5, 6.2],
  ['bench', 52, 17.6], ['crate', 26.5, 1.4], ['vend', 56.5, 0.7], ['pole', 33, 18.4], ['pillar', 40, 4.2], ['pillar', 46.2, 4.2],
];

export function buildWorld(rng) {
  const cover = [];
  for (let i = 0; i < LAYOUT.length; i++) {
    const [kind, x0, z0] = LAYOUT[i], k = KINDS[kind], sx = x0 * (WX / 132);
    const x = sx + (kind === 'pillar' || kind === 'vend' ? 0 : rand(rng, -1.2, 1.2)), z = z0 + (kind === 'pillar' || kind === 'vend' ? 0 : rand(rng, -0.8, 0.8));
    const v = randInt(rng, 0, 2);
    cover.push({ kind, x, z, w: k.w, d: k.d, h: k.h, tall: k.tall, v, mirror: false, id: i });
    cover.push({ kind, x: WX - x - k.w, z, w: k.w, d: k.d, h: k.h, tall: k.tall, v: (v + 1) % 3, mirror: true, id: i + 100 });
  }
  const walk = [], shield = [];
  for (const c of cover) {
    c.rect = { x: c.x, y: c.z, w: c.w, h: c.d };
    walk.push(c.rect);
    if (c.tall) shield.push(c.rect);
  }
  // the train: one moving rectangle that is part of both lists for the whole round (parked far away until it runs)
  const trainRect = { x: -999, y: 0, w: TRAIN.w, h: TRAIN.len };
  walk.push(trainRect);
  shield.push(trainRect);

  // Event schedules: precomputed from the seeded rng so both clients agree to the millisecond.
  const trains = [];
  for (let t = rand(rng, 13, 17); t < 140; t += (t < 45 ? rand(rng, 18, 22) : rand(rng, 7, 9))) trains.push(t);
  const gusts = [];
  for (let t = rand(rng, 6, 9); t < 140; t += rand(rng, 8, 12)) gusts.push({ t, dur: rand(rng, 1.8, 2.6), dir: rng() < 0.5 ? -1 : 1 });
  const seed = randInt(rng, 1, 1 << 30);
  return { cover, walk, shield, trainRect, trains, gusts, seed };
}

// ---- timed set-pieces (pure functions of ctx.time) ----
// 0 = quiet, otherwise how far into the warning (<0) or the pass (>0) the crossing is: seconds relative to the head entering the street.
export function trainPhase(world, t) {
  const ts = world.trains;
  for (let i = 0; i < ts.length; i++) {
    const d = t - ts[i];
    if (d > -TRAIN.warn && d < (WZ + TRAIN.len + 8) / TRAIN.v) return d === 0 ? 1e-6 : d;
    if (d < -TRAIN.warn) break;
  }
  return 0;
}

export function trainHead(d) { return -6 + TRAIN.v * d; }

export function gustAt(world, t) {
  const gs = world.gusts;
  for (let i = 0; i < gs.length; i++) {
    const u = (t - gs[i].t) / gs[i].dur;
    if (u >= -0.35 && u <= 1) {
      // build up, hold, fall away; the telegraph is the build-up (lanterns sway, rain slants) before aim is affected
      const k = u < 0 ? 0 : Math.sin(Math.PI * Math.min(1, u)) ** 0.6;
      return { power: k, warn: u < 0 ? 1 + u / 0.35 : 1, dir: gs[i].dir };
    }
    if (u < -0.35) break;
  }
  return null;
}

// Keep the moving rectangle in step with the clock.
export function syncTrain(world, t) {
  const d = trainPhase(world, t), r = world.trainRect;
  if (d <= 0) { r.x = -999; return d; }
  const head = trainHead(d);
  r.x = XING.x - TRAIN.w / 2;
  r.y = head - TRAIN.len;
  r.h = TRAIN.len;
  return d;
}

// ---- geometry ----
// Screen aim angle -> unit ground direction (screen dy is squashed by DY on the ground).
export function aimDir(a, out) {
  const x = Math.cos(a), z = Math.sin(a) / DY, l = Math.hypot(x, z) || 1;
  out.x = x / l;
  out.z = z / l;
  return out;
}
// Ground vector -> screen aim angle.
export const aimAngleOf = (dx, dz) => Math.atan2(dz * DY, dx);

export function rayShield(world, ox, oz, ux, uz, maxD) {
  return raycastRects(ox, oz, ux, uz, maxD, world.shield);
}

export function lineClear(world, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz);
  return d < 1e-6 || !raycastRects(ax, az, dx, dz, d, world.shield);
}

export function pushOut(world, pos, r) {
  return resolveCircleRects(pos, r, world.walk);
}
// a blink leaps over low cover (scooters, benches) but not over walls, crates or the train
export function pushOutTall(world, pos, r) {
  return resolveCircleRects(pos, r, world.shield);
}

// Sudden death: the page's panels close in from both ends.
export function limits(t, sudden, suddenAt, out) {
  const k = sudden ? Math.min(1, Math.max(0, t - suddenAt) / 26) : 0;
  out.x0 = 2.5 + k * (WX / 2 - 9);
  out.x1 = WX - 2.5 - k * (WX / 2 - 9);
  return out;
}

export const seedHash = hashSeed;

// Camera and page layout: the panel (the inked frame) and the projection of the ground plane into it.
export function makeView() {
  return {
    W: 0, H: 0, dpr: 1, px: 0, py: 0, pw: 0, ph: 0, S: 12, cx: WX / 2, ox: 0, oy: 0, baseY: 0, y0: 0,
    // touch: the street sits higher on the page so that neither sniper hides under the thumbs' buttons; the canal fills the rest
    layout(W, H, dpr, cx, vis, touch) {
      const m = Math.max(6, Math.min(13, Math.min(W, H) * 0.017));
      this.W = W; this.H = H; this.dpr = dpr;
      this.px = m; this.py = m; this.pw = W - 2 * m; this.ph = H - 2 * m;
      this.S = this.pw / vis;
      this.cx = cx;
      this.baseY = this.py + this.ph * (touch ? (H < 520 ? 0.5 : 0.54) : H < 520 ? 0.6 : 0.69);
      this.ox = this.px + this.pw / 2 - cx * this.S;
      this.oy = this.baseY - (WZ / 2) * DY * this.S;
      this.y0 = this.oy;
    },
    sx(x) { return this.ox + x * this.S; },
    sy(z, h = 0) { return this.oy + z * DY * this.S - h * this.S; },
  };
}
