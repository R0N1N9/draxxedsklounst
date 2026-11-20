// Shared helpers for dimension and transition modules: maths, seeded randomness, colour,
// 2D geometry, a little 2D juice, and three.js conveniences. Everything three-related
// takes THREE as an argument so that 2D modules never pull three in through this file.
import { clamp, lerp, smoothstep, TAU, mulberry32, noise2, fbm } from '../util.js';

export { clamp, lerp, smoothstep, TAU, mulberry32, noise2, fbm };

// ---------------------------------------------------------------------------
// Maths / time
// ---------------------------------------------------------------------------
/** Clamp to [0, 1]. */
export const clamp01 = (x) => (x > 0 ? (x > 1 ? 1 : x) : 0); // NaN → 0
/** Where x sits between a and b (unclamped; 0 when a === b). */
export const invLerp = (a, b, x) => (a === b ? 0 : (x - a) / (b - a));
/** Map x from [a, b] to [c, d], clamped. */
export const remap = (x, a, b, c, d) => c + (d - c) * clamp01(invLerp(a, b, x));
/** Frame-rate independent exponential approach of `current` towards `target`. */
export const damp = (current, target, lambda, dt) => target + (current - target) * Math.exp(-lambda * dt);
/** Signed shortest difference b - a, in (-PI, PI]. */
export function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d <= -Math.PI) d += TAU;
  return d;
}
/** Interpolate angles along the shortest arc. */
export const angLerp = (a, b, t) => a + angDiff(a, b) * t;
/** damp() for angles. */
export const angDamp = (current, target, lambda, dt) => current + angDiff(current, target) * (1 - Math.exp(-lambda * dt));
/** Progress of t through [t0, t1], clamped to [0, 1] — the workhorse of transition timelines. */
export const seg = (t, t0, t1) => (t1 === t0 ? (t >= t1 ? 1 : 0) : clamp01((t - t0) / (t1 - t0)));
/** A 0→1→0 window over [t0, t1] with soft edges `fade` seconds wide. */
export const pulse = (t, t0, t1, fade = 0.2) => (fade <= 0 ? (t >= t0 && t <= t1 ? 1 : 0) : Math.min(smoothstep(t0, t0 + fade, t), 1 - smoothstep(t1 - fade, t1, t)));

const bounceOut = (t) => {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};
/** Easing curves on [0, 1] (every one maps 0→0 and 1→1). */
export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inQuart: (t) => t * t * t * t,
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  inOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  inExpo: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, 10 * t - 10)),
  outExpo: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutExpo: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
  inBack: (t) => 2.70158 * t * t * t - 1.70158 * t * t,
  outBack: (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  inOutBack: (t) => {
    const c = 1.70158 * 1.525;
    return t < 0.5 ? (Math.pow(2 * t, 2) * ((c + 1) * 2 * t - c)) / 2 : (Math.pow(2 * t - 2, 2) * ((c + 1) * (t * 2 - 2) + c) + 2) / 2;
  },
  outElastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1),
  outBounce: bounceOut,
  inSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  outSine: (t) => Math.sin((t * Math.PI) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};

/** Damped spring step on state {x, v} (semi-implicit, sub-stepped: stable at dt = 1/20). Returns state. */
export function spring(state, target, stiffness, damping, dt) {
  const n = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    state.v += (-stiffness * (state.x - target) - damping * state.v) * h;
    state.x += state.v * h;
  }
  return state;
}

// ---------------------------------------------------------------------------
// Seeded randomness — the first argument is always an rng function (ctx.rng or Math.random)
// ---------------------------------------------------------------------------
/** Uniform float in [a, b). */
export const rand = (rng, a = 0, b = 1) => a + rng() * (b - a);
/** Uniform integer in [a, b], inclusive. */
export const randInt = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
/** One element of the array (undefined for an empty array). */
export const pick = (rng, array) => array[Math.floor(rng() * array.length)];
/** A shuffled copy (Fisher-Yates); the input is not modified. */
export function shuffle(rng, array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}
/** True with probability p. */
export const chance = (rng, p) => rng() < p;
/** -1 or +1. */
export const randSign = (rng) => (rng() < 0.5 ? -1 : 1);
/** Standard normal sample (Box-Muller). */
export const gauss = (rng) => Math.sqrt(-2 * Math.log(1 - rng() * 0.999999)) * Math.cos(TAU * rng());
/** A fresh PRNG from a seed. */
export const makeRng = (seed) => mulberry32(seed >>> 0);
/** Stable uint32 hash of any mix of strings and numbers — derive sub-seeds with it. */
export function hashSeed(...parts) {
  let h = 2166136261;
  for (const p of parts) {
    const s = String(p) + '|';
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Colour (CSS in, CSS out)
// ---------------------------------------------------------------------------
let cssProbe = null;
const cssCache = new Map();
/**
 * A colour → {r, g, b} in 0..255. Takes '#rgb', '#rrggbb' (and their alpha forms), a
 * 0xRRGGBB number, and — in a browser — any other CSS colour ('rgb(...)', 'tomato').
 * Black for anything unparseable.
 */
export function hexToRgb(hex) {
  if (typeof hex === 'number') return { r: (hex >> 16) & 255, g: (hex >> 8) & 255, b: hex & 255 };
  const str = String(hex).trim();
  let h = str.replace('#', '');
  if (/^[0-9a-f]{3,4}$/i.test(h)) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h)) {
    const n = parseInt(h.slice(0, 6), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  if (cssCache.has(str)) return cssCache.get(str);
  let out = { r: 0, g: 0, b: 0 };
  if (typeof document !== 'undefined') {
    // Let the browser parse it: a canvas normalises any valid colour to #rrggbb or rgba().
    cssProbe ||= document.createElement('canvas').getContext('2d');
    cssProbe.fillStyle = '#000';
    cssProbe.fillStyle = str;
    const v = cssProbe.fillStyle;
    const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v);
    if (m) out = { r: +m[1], g: +m[2], b: +m[3] };
    else if (v[0] === '#') { const n = parseInt(v.slice(1, 7), 16); out = { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }
  }
  cssCache.set(str, out);
  return out;
}
/** 0..255 components → '#rrggbb'. */
export const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
/** Blend two hex colours. */
export function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  t = clamp01(t);
  return rgbToHex(A.r + (B.r - A.r) * t, A.g + (B.g - A.g) * t, A.b + (B.b - A.b) * t);
}
/** Hex colour with alpha → 'rgba(r,g,b,a)'. */
export function rgba(hex, alpha = 1) {
  const c = hexToRgb(hex);
  return `rgba(${c.r},${c.g},${c.b},${clamp01(alpha)})`;
}
/** Darken (amount < 0) or lighten (amount > 0) a hex colour; amount in [-1, 1]. */
export const shade = (hex, amount) => (amount < 0 ? mixHex(hex, '#000000', -amount) : mixHex(hex, '#ffffff', amount));
/** 'hsla(...)' with h in degrees, s and l in 0..1. */
export const hsl = (h, s, l, a = 1) => `hsla(${((h % 360) + 360) % 360},${clamp01(s) * 100}%,${clamp01(l) * 100}%,${clamp01(a)})`;
/** Relative luminance (0..1) of a hex colour. */
export function luminance(hex) {
  const c = hexToRgb(hex);
  const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}
/** '#000' or '#fff', whichever reads better on the given colour. */
export const contrastOn = (hex) => (luminance(hex) > 0.4 ? '#000' : '#fff');

// ---------------------------------------------------------------------------
// 2D geometry — plain numbers; rects are {x, y, w, h}; circles {x, y, r}
// ---------------------------------------------------------------------------
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const dist2 = (ax, ay, bx, by) => (bx - ax) * (bx - ax) + (by - ay) * (by - ay);

/** Segment AB against segment CD: t along AB in [0, 1] of the crossing, or -1 (parallel counts as no hit). */
export function segSeg(ax, ay, bx, by, cx, cy, dx, dy) {
  const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return -1;
  const t = ((cx - ax) * sy - (cy - ay) * sx) / den;
  const u = ((cx - ax) * ry - (cy - ay) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : -1;
}

/** Segment AB against a circle: first t in [0, 1], or -1. Starting inside the circle returns 0. */
export function segCircle(ax, ay, bx, by, cx, cy, r) {
  const dx = bx - ax, dy = by - ay, fx = ax - cx, fy = ay - cy;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  if (a < 1e-12) return -1;
  const b = fx * dx + fy * dy;
  const disc = b * b - a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / a;
  return t >= 0 && t <= 1 ? t : -1;
}

/**
 * Segment AB against a rect: {t, nx, ny} entry point and outward normal, or null.
 * A segment that STARTS inside the rect (or exactly on its edge, heading in) reports no
 * hit — which is what lets a ricochet leave the face it bounced off. The flip side:
 * never start a shot from a point you have not checked. Fire from the shooter's centre
 * (which collision keeps outside every rect), not from a muzzle point further out that
 * may already be inside the wall they are hugging.
 */
export function segRect(ax, ay, bx, by, rect) {
  const dx = bx - ax, dy = by - ay;
  let t0 = 0, t1 = 1, nx = 0, ny = 0;
  // X slab
  if (Math.abs(dx) < 1e-12) {
    if (ax < rect.x || ax > rect.x + rect.w) return null;
  } else {
    let ta = (rect.x - ax) / dx, tb = (rect.x + rect.w - ax) / dx, s = -1;
    if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; s = 1; }
    if (ta > t0) { t0 = ta; nx = s; ny = 0; }
    if (tb < t1) t1 = tb;
    if (t0 > t1) return null;
  }
  // Y slab
  if (Math.abs(dy) < 1e-12) {
    if (ay < rect.y || ay > rect.y + rect.h) return null;
  } else {
    let ta = (rect.y - ay) / dy, tb = (rect.y + rect.h - ay) / dy, s = -1;
    if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; s = 1; }
    if (ta > t0) { t0 = ta; nx = 0; ny = s; }
    if (tb < t1) t1 = tb;
    if (t0 > t1) return null;
  }
  if (nx === 0 && ny === 0) return null; // started inside
  return { t: t0, nx, ny };
}

/** Nearest rect hit by a ray: {dist, x, y, nx, ny, index} or null. (dx, dy) need not be normalised. */
export function raycastRects(ox, oy, dx, dy, maxDist, rects) {
  const len = Math.hypot(dx, dy);
  if (len < 1e-12 || !(maxDist > 0)) return null;
  if (!Number.isFinite(maxDist)) maxDist = 1e6; // "no limit"
  dx /= len;
  dy /= len;
  const ex = ox + dx * maxDist, ey = oy + dy * maxDist;
  let best = null;
  for (let i = 0; i < rects.length; i++) {
    const h = segRect(ox, oy, ex, ey, rects[i]);
    if (h && (!best || h.t * maxDist < best.dist)) {
      const d = h.t * maxDist;
      best = { dist: d, x: ox + dx * d, y: oy + dy * d, nx: h.nx, ny: h.ny, index: i };
    }
  }
  return best;
}

/** True when nothing in `rects` blocks the segment A→B. */
export function lineOfSight(ax, ay, bx, by, rects) {
  for (let i = 0; i < rects.length; i++) if (segRect(ax, ay, bx, by, rects[i])) return false;
  return true;
}

/** Push a circle out of a rect: {x, y, hit} is the corrected centre (handles a centre inside the rect). */
export function circleRectPush(cx, cy, r, rect) {
  const px = clamp(cx, rect.x, rect.x + rect.w), py = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - px, dy = cy - py;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return { x: cx, y: cy, hit: false };
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    return { x: px + (dx / d) * r, y: py + (dy / d) * r, hit: true };
  }
  // Centre inside: leave through the nearest edge.
  const l = cx - rect.x, rr = rect.x + rect.w - cx, t = cy - rect.y, b = rect.y + rect.h - cy;
  const m = Math.min(l, rr, t, b);
  if (m === l) return { x: rect.x - r, y: cy, hit: true };
  if (m === rr) return { x: rect.x + rect.w + r, y: cy, hit: true };
  if (m === t) return { x: cx, y: rect.y - r, hit: true };
  return { x: cx, y: rect.y + rect.h + r, hit: true };
}

/** Keep a circle at pos {x, y} (mutated) out of every rect; up to 3 relaxation passes. True if it touched anything. */
export function resolveCircleRects(pos, r, rects) {
  let any = false;
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (let i = 0; i < rects.length; i++) {
      const q = rects[i];
      const px = clamp(pos.x, q.x, q.x + q.w), py = clamp(pos.y, q.y, q.y + q.h);
      const dx = pos.x - px, dy = pos.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      moved = any = true;
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2);
        pos.x = px + (dx / d) * r;
        pos.y = py + (dy / d) * r;
      } else {
        const l = pos.x - q.x, rr = q.x + q.w - pos.x, t = pos.y - q.y, b = q.y + q.h - pos.y;
        const m = Math.min(l, rr, t, b);
        if (m === l) pos.x = q.x - r;
        else if (m === rr) pos.x = q.x + q.w + r;
        else if (m === t) pos.y = q.y - r;
        else pos.y = q.y + q.h + r;
      }
    }
    if (!moved) break;
  }
  return any;
}

/** Reflect velocity (vx, vy) about a unit normal. */
export function reflect(vx, vy, nx, ny) {
  const d = 2 * (vx * nx + vy * ny);
  return { x: vx - d * nx, y: vy - d * ny };
}
export const pointInRect = (px, py, rect) => px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
export const rectsOverlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// ---------------------------------------------------------------------------
// 2D juice
// ---------------------------------------------------------------------------
const P_DEFAULTS = { x: 0, y: 0, vx: 0, vy: 0, life: 0.6, size: 3, sizeEnd: 0, color: '#fff', alpha: 1, drag: 0, gravity: 0, shape: 'circle', rot: 0, spin: 0, additive: false };
const P_KEYS = Object.keys(P_DEFAULTS);

/** Pooled 2D particles: nothing is allocated after construction; the oldest is recycled when full. */
export class Particles2D {
  constructor(max = 400) {
    this.max = Math.max(1, max | 0);
    this.pool = [];
    for (let i = 0; i < this.max; i++) this.pool.push({ ...P_DEFAULTS, age: 0, live: false });
    this.next = 0;
    this.count = 0;
  }

  /** p = {x, y, vx, vy, life, size, sizeEnd, color, alpha, drag, gravity, shape:'circle'|'square'|'spark', rot, spin, additive} */
  emit(p) {
    const q = this.pool[this.next];
    this.next = (this.next + 1) % this.max;
    if (!q.live) this.count++;
    for (let i = 0; i < P_KEYS.length; i++) {
      const k = P_KEYS[i];
      q[k] = p[k] !== undefined ? p[k] : P_DEFAULTS[k];
    }
    q.age = 0;
    q.live = true;
  }

  /** Emit n particles; fn(i) returns each one's description. */
  burst(n, fn) {
    for (let i = 0; i < n; i++) this.emit(fn(i));
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const q = this.pool[i];
      if (!q.live) continue;
      q.age += dt;
      if (q.age >= q.life) { q.live = false; this.count--; continue; }
      if (q.drag) { const k = Math.exp(-q.drag * dt); q.vx *= k; q.vy *= k; }
      q.vy += q.gravity * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.rot += q.spin * dt;
    }
  }

  draw(g) {
    const prevOp = g.globalCompositeOperation, prevAlpha = g.globalAlpha;
    const prevCap = g.lineCap, prevWidth = g.lineWidth, prevStroke = g.strokeStyle, prevFill = g.fillStyle;
    let additive = false;
    for (let i = 0; i < this.max; i++) {
      const q = this.pool[i];
      if (!q.live) continue;
      const k = q.age / q.life;
      const size = q.size + (q.sizeEnd - q.size) * k;
      if (size <= 0.01) continue;
      if (q.additive !== additive) { additive = q.additive; g.globalCompositeOperation = additive ? 'lighter' : prevOp; }
      g.globalAlpha = prevAlpha * q.alpha * (1 - k);
      if (q.shape === 'spark') {
        // A streak along the velocity; a dot when it is not moving.
        const sp = Math.hypot(q.vx, q.vy);
        const len = Math.min(size * 6, sp * 0.03) + size;
        const ux = sp > 1e-3 ? q.vx / sp : 1, uy = sp > 1e-3 ? q.vy / sp : 0;
        g.strokeStyle = q.color;
        g.lineWidth = Math.max(0.5, size * 0.6);
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(q.x - ux * len, q.y - uy * len);
        g.lineTo(q.x, q.y);
        g.stroke();
      } else if (q.shape === 'square') {
        g.fillStyle = q.color;
        if (q.rot) {
          g.save();
          g.translate(q.x, q.y);
          g.rotate(q.rot);
          g.fillRect(-size / 2, -size / 2, size, size);
          g.restore();
        } else g.fillRect(q.x - size / 2, q.y - size / 2, size, size);
      } else {
        g.fillStyle = q.color;
        g.beginPath();
        g.arc(q.x, q.y, size / 2, 0, TAU);
        g.fill();
      }
    }
    g.globalCompositeOperation = prevOp;
    g.globalAlpha = prevAlpha;
    g.lineCap = prevCap;
    g.lineWidth = prevWidth;
    g.strokeStyle = prevStroke;
    g.fillStyle = prevFill;
  }

  clear() {
    for (let i = 0; i < this.max; i++) this.pool[i].live = false;
    this.count = 0;
  }
}

/** Trauma-based screen shake: add(0..1), then read an offset every frame. */
export class Shake {
  constructor(maxOffset = 14, maxRot = 0.03) {
    this.maxOffset = maxOffset;
    this.maxRot = maxRot;
    this.trauma = 0;
    this.t = 0;
    this.out = { x: 0, y: 0, rot: 0 };
  }
  add(amount) { this.trauma = Math.min(1, this.trauma + amount); }
  /** Advance and return {x, y, rot} (the same object every call). Smooth noise, not white jitter. */
  update(dt) {
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    this.t += dt * 28;
    const k = this.trauma * this.trauma;
    this.out.x = noise2(this.t, 11.3) * k * this.maxOffset;
    this.out.y = noise2(7.7, this.t) * k * this.maxOffset;
    this.out.rot = noise2(this.t, 91.1) * k * this.maxRot;
    return this.out;
  }
  reset() { this.trauma = 0; this.out.x = this.out.y = this.out.rot = 0; }
}

/** Draw an image or canvas so it covers w x h (centre-cropped, like object-fit: cover). */
export function drawCover(g, image, w, h, alpha = 1) {
  const iw = image.width || image.videoWidth || 1, ih = image.height || image.videoHeight || 1;
  const s = Math.max(w / iw, h / ih);
  const dw = iw * s, dh = ih * s;
  const prev = g.globalAlpha;
  g.globalAlpha = prev * alpha;
  g.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
  g.globalAlpha = prev;
}

/** Trace a rounded rectangle path (no fill or stroke). Does not rely on ctx.roundRect. */
export function roundRect(g, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** A line with a bright core and a soft halo. State is restored. */
export function glowLine(g, x1, y1, x2, y2, color, width = 2, glow = 10) {
  g.save();
  g.lineCap = 'round';
  g.strokeStyle = color;
  g.shadowColor = color;
  g.shadowBlur = glow;
  g.lineWidth = width;
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
  g.shadowBlur = 0;
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = Math.max(0.5, width * 0.4);
  g.stroke();
  g.restore();
}

/** Set g.font to `${px}px ${fontTail}`, shrunk until `text` fits maxWidth. Returns the size used. */
export function fitText(g, text, maxWidth, basePx, fontTail) {
  let px = basePx;
  for (let i = 0; i < 40; i++) {
    g.font = `${px}px ${fontTail}`;
    const w = g.measureText(text).width;
    if (w <= maxWidth || px <= 6) break;
    px = Math.max(6, Math.min(px * 0.95, (px * maxWidth) / w));
  }
  return px;
}

/** Darken the corners. */
export function vignette(g, w, h, strength = 0.5, color = '#000') {
  const r = Math.hypot(w, h) / 2;
  const grad = g.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r);
  grad.addColorStop(0, rgba(color, 0));
  grad.addColorStop(1, rgba(color, strength));
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
}

// ---------------------------------------------------------------------------
// three.js helpers (THREE is passed in)
// ---------------------------------------------------------------------------
/** Dispose every geometry, material and texture under root, then detach it. Safe on null and on repeats. */
export function disposeTree(root) {
  if (!root) return;
  if (typeof root.traverse !== 'function') { if (typeof root.dispose === 'function') root.dispose(); return; } // e.g. a fullscreenPass
  const seen = new Set();
  const tex = (t) => { if (t && t.isTexture && !seen.has(t)) { seen.add(t); t.dispose(); } };
  root.traverse((o) => {
    if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (seen.has(m)) continue;
      seen.add(m);
      for (const k in m) tex(m[k]);
      if (m.uniforms) {
        for (const k in m.uniforms) {
          const v = m.uniforms[k] && m.uniforms[k].value;
          if (Array.isArray(v)) v.forEach(tex); // sampler arrays
          else if (v && typeof v === 'object' && !v.isTexture && !v.isColor && !v.isVector2 && !v.isVector3 && !v.isVector4 && !v.isMatrix3 && !v.isMatrix4) { for (const j in v) tex(v[j]); } // struct uniforms
          else tex(v);
        }
      }
      m.dispose();
    }
    if (o.isLight && o.shadow && o.shadow.map) o.shadow.map.dispose();
  });
  if (root.isScene) {
    tex(root.background);
    tex(root.environment);
  }
  if (root.parent) root.parent.remove(root);
}

/** A CanvasTexture ready for use. srgb: false when a shader will write the texels straight back out. */
export function canvasTexture(THREE, canvas, { filter = 'linear', srgb = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.generateMipmaps = false;
  t.minFilter = t.magFilter = filter === 'nearest' ? THREE.NearestFilter : THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

/** An off-screen canvas and its 2D context. */
export function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  return { canvas, g: canvas.getContext('2d') };
}

/**
 * One full-screen triangle with your fragment shader: how shader-driven transitions and
 * post effects draw. `varying vec2 vUv` is [0,1] with y up. Returns {scene, camera,
 * material, uniforms, mesh, render(renderer), dispose()}.
 */
export function fullscreenPass(THREE, { fragmentShader, uniforms = {}, transparent = false }) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const material = new THREE.ShaderMaterial({
    uniforms,
    fragmentShader,
    vertexShader: 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    transparent,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return {
    scene, camera, material, mesh, uniforms: material.uniforms,
    render(renderer) { renderer.render(scene, camera); },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}

/** GLSL: vec2 coverUv(vec2 uv, float screenAspect, float imageAspect) — object-fit: cover for a texture lookup. */
export const COVER_UV_GLSL = `
vec2 coverUv(vec2 uv, float screenAspect, float imageAspect) {
  vec2 s = screenAspect > imageAspect ? vec2(1.0, imageAspect / screenAspect) : vec2(screenAspect / imageAspect, 1.0);
  return (uv - 0.5) * s + 0.5;
}`;

/** GLSL: float hash21(vec2), float noise(vec2) (value noise, 0..1), float fbm(vec2) (5 octaves, 0..1). Keep inputs below a few thousand: wrap time-driven offsets with mod(). */
export const GLSL_NOISE = `
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}`;
