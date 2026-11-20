// Light that outlives the frame it was made in: lit floor tiles, rings across the grid,
// flashes, afterimages, scars on the walls, sparks — and the shatter of a sniper who was
// hit. Fixed-size pools throughout: nothing here allocates while the duel is running.
import { Particles2D, Shake, TAU } from '../../kit.js';
import { HOT } from './style.js';

function pool(n, proto) {
  const a = [];
  for (let i = 0; i < n; i++) a.push({ live: false, age: 0, life: 1, ...proto });
  a.next = 0;
  return a;
}
function take(a) {
  const o = a[a.next];
  a.next = (a.next + 1) % a.length;
  o.live = true;
  o.age = 0;
  return o;
}
function agePool(a, dt) {
  for (let i = 0; i < a.length; i++) {
    const o = a[i];
    if (o.live && (o.age += dt) >= o.life) o.live = false;
  }
}

/** The pools, as fields of the shared state. */
export const fxState = () => ({
  tiles: pool(56, { x: 0, y: 0, owner: 0 }),             // floor cells lit by a runner
  rings: pool(12, { x: 0, y: 0, owner: 0, size: 100 }),  // shots and blinks ring out across the grid
  flashes: pool(16, { x: 0, y: 0, owner: -1, size: 60, star: false, a: 0 }),
  echoes: pool(6, { x: 0, y: 0, a: 0, owner: 0 }),       // blink afterimages
  scars: pool(20, { x: 0, y: 0, nx: 0, ny: 0, owner: 0 }),
  parts: new Particles2D(520),
  shake: new Shake(9, 0.012),
  shakeOut: { x: 0, y: 0, rot: 0 },
});

export function makeFx(ctx, S) {
  const color = (i) => ctx.players[i].color;
  return {
    /** A runner's footfall lights the 50-unit cell under it. */
    tile(x, y, owner) {
      const o = take(S.tiles);
      o.x = Math.floor(x / 50) * 50;
      o.y = Math.floor(y / 50) * 50;
      o.owner = owner;
      o.life = 1.5;
    },
    ring(x, y, owner, size, life) {
      const o = take(S.rings);
      o.x = x; o.y = y; o.owner = owner; o.size = size; o.life = life;
    },
    /** owner -1 = white. star = a muzzle flash, long along angle a. */
    flash(x, y, owner, size, life, star, a) {
      const o = take(S.flashes);
      o.x = x; o.y = y; o.owner = owner; o.size = size; o.life = life; o.star = !!star; o.a = a || 0;
    },
    echo(x, y, a, owner) {
      const o = take(S.echoes);
      o.x = x; o.y = y; o.a = a; o.owner = owner; o.life = 0.9;
    },
    scar(x, y, nx, ny, owner) {
      const o = take(S.scars);
      o.x = x; o.y = y; o.nx = nx; o.ny = ny; o.owner = owner; o.life = 5;
    },
    sparks(x, y, nx, ny, owner, n, speed) {
      const col = color(owner), base = Math.atan2(ny, nx);
      for (let i = 0; i < n; i++) {
        const a = base + (Math.random() - 0.5) * 2.2, s = speed * (0.25 + Math.random());
        S.parts.emit({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.25 + Math.random() * 0.4, size: 2 + Math.random() * 2.2, color: i % 3 ? col : HOT, shape: 'spark', drag: 3.5, additive: true });
      }
    },
    /** Motes dragged along a blink. */
    streak(x0, y0, x1, y1, owner) {
      const col = color(owner), d = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / d, uy = (y1 - y0) / d;
      for (let i = 0; i < 14; i++) {
        const k = Math.random(), v = 260 * Math.random();
        S.parts.emit({ x: x0 + (x1 - x0) * k + (Math.random() - 0.5) * 16, y: y0 + (y1 - y0) * k + (Math.random() - 0.5) * 16, vx: ux * v, vy: uy * v, life: 0.3 + Math.random() * 0.3, size: 3, color: col, shape: 'spark', drag: 4, additive: true });
      }
    },
    /** A hologram comes apart in squares. */
    pixels(x, y, owner) {
      const col = color(owner);
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * TAU, s = 60 + Math.random() * 260;
        S.parts.emit({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + Math.random() * 0.5, size: 3 + Math.random() * 3, color: col, shape: 'square', drag: 3, additive: true });
      }
    },
    /**
     * The kill: shards of light thrown the way the rail was travelling (dx, dy), and the
     * glass floor cracking under the victim. Returns the cracks as point lists.
     */
    shatter(v, dx, dy) {
      const col = color(v.i), dir = Math.atan2(dy, dx);
      for (let i = 0; i < 70; i++) {
        const a = dir + (Math.random() - 0.5) * (i % 3 ? 1.7 : TAU), s = 90 + Math.random() * 620;
        S.parts.emit({ x: v.x, y: v.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.8, size: 2.5 + Math.random() * 3, color: i % 4 ? col : HOT, shape: 'spark', drag: 2.2, additive: true });
      }
      for (let i = 0; i < 34; i++) {
        const a = Math.random() * TAU, s = 40 + Math.random() * 300;
        S.parts.emit({ x: v.x, y: v.y, vx: Math.cos(a) * s + dx * 160, vy: Math.sin(a) * s + dy * 160, life: 0.7 + Math.random() * 0.8, size: 4 + Math.random() * 6, sizeEnd: 1, color: col, shape: 'square', rot: Math.random() * 3, spin: (Math.random() - 0.5) * 14, drag: 1.6, additive: true });
      }
      const cracks = [];
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * TAU + Math.random() * 0.4, along = Math.max(0, Math.cos(a) * dx + Math.sin(a) * dy);
        const len = 60 + Math.random() * 70 + along * 130, c = [v.x, v.y];
        for (let j = 1; j <= 5; j++) {
          const k = (j / 5) * len, off = (Math.random() - 0.5) * 22;
          c.push(v.x + Math.cos(a) * k - Math.sin(a) * off, v.y + Math.sin(a) * k + Math.cos(a) * off);
        }
        cracks.push(c);
      }
      this.flash(v.x, v.y, -1, 260, 0.5);
      this.flash(v.x, v.y, v.i, 200, 0.7);
      S.shake.add(1);
      return cracks;
    },
    update(dt) {
      agePool(S.tiles, dt);
      agePool(S.rings, dt);
      agePool(S.flashes, dt);
      agePool(S.echoes, dt);
      agePool(S.scars, dt);
      S.parts.update(dt);
      S.shakeOut = S.shake.update(dt);
    },
  };
}
