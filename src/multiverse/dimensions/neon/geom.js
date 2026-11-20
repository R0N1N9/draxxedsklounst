// Convex-polygon geometry for the lattice: rail rays, sight lines, circle push-out and the
// shadow volumes behind every pillar. Polygons are flat [x0, y0, x1, y1, ...] arrays; the
// winding does not matter anywhere (normals are always turned against the incoming ray).
import { TAU } from '../../kit.js';

export function rectPts(x, y, w, h) {
  return [x, y, x + w, y, x + w, y + h, x, y + h];
}

/** A len x thick slab centred on (cx, cy), turned by ang. */
export function slabPts(cx, cy, len, thick, ang) {
  const c = Math.cos(ang), s = Math.sin(ang), hl = len / 2, ht = thick / 2;
  return [
    cx - hl * c + ht * s, cy - hl * s - ht * c,
    cx + hl * c + ht * s, cy + hl * s - ht * c,
    cx + hl * c - ht * s, cy + hl * s + ht * c,
    cx - hl * c - ht * s, cy - hl * s + ht * c,
  ];
}

export function ngonPts(cx, cy, r, n, rot = 0) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(cx + Math.cos(rot + (i / n) * TAU) * r, cy + Math.sin(rot + (i / n) * TAU) * r);
  return out;
}

export class Solid {
  /** kind: 'bound' | 'gantry' | 'pillar' | 'shutter' | 'drone' | 'crush'. cast = throws a shadow. */
  constructor(pts, kind = 'pillar', cast = true) {
    this.pts = pts;
    this.n = pts.length >> 1;
    this.kind = kind;
    this.cast = cast;
    this.on = true;
    this.minX = this.minY = this.maxX = this.maxY = this.cx = this.cy = 0;
    this.fit();
  }

  fit() {
    const p = this.pts;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, sx = 0, sy = 0;
    for (let i = 0; i < p.length; i += 2) {
      const x = p[i], y = p[i + 1];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      sx += x;
      sy += y;
    }
    this.minX = x0; this.maxX = x1; this.minY = y0; this.maxY = y1;
    this.cx = sx / this.n;
    this.cy = sy / this.n;
  }

  /** Re-shape a four-cornered solid in place (the moving pieces do this every frame). */
  setRect(x, y, w, h) {
    const p = this.pts;
    p[0] = x; p[1] = y; p[2] = x + w; p[3] = y; p[4] = x + w; p[5] = y + h; p[6] = x; p[7] = y + h;
    this.fit();
  }
}

// Closest boundary point of a convex polygon to (x, y), and whether (x, y) is inside it.
const near = { x: 0, y: 0, d2: 0, inside: false };
function closest(s, x, y) {
  const p = s.pts, n = s.n;
  let ax = p[2 * n - 2], ay = p[2 * n - 1], best = Infinity, pos = 0, neg = 0;
  for (let i = 0; i < n; i++) {
    const bx = p[2 * i], by = p[2 * i + 1];
    const ex = bx - ax, ey = by - ay;
    const cr = ex * (y - ay) - ey * (x - ax);
    if (cr > 0) pos++;
    else if (cr < 0) neg++;
    let t = ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + ex * t, qy = ay + ey * t;
    const d2 = (x - qx) * (x - qx) + (y - qy) * (y - qy);
    if (d2 < best) { best = d2; near.x = qx; near.y = qy; }
    ax = bx;
    ay = by;
  }
  near.d2 = best;
  near.inside = pos === 0 || neg === 0;
  return near;
}

/** Distance from a point to a solid's boundary (0 inside). */
export function solidDist(s, x, y) {
  const c = closest(s, x, y);
  return c.inside ? 0 : Math.sqrt(c.d2);
}

/** Smallest gap between two convex solids, sampled along both outlines (0 when they overlap). */
export function polyGap(a, b) {
  let best = Infinity;
  for (let k = 0; k < 2; k++) {
    const s = k ? b : a, o = k ? a : b;
    const p = s.pts, n = s.n;
    let ax = p[2 * n - 2], ay = p[2 * n - 1];
    for (let i = 0; i < n; i++) {
      const bx = p[2 * i], by = p[2 * i + 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 18));
      for (let j = 0; j < steps; j++) {
        const c = closest(o, ax + ((bx - ax) * j) / steps, ay + ((by - ay) * j) / steps);
        if (c.inside) return 0;
        if (c.d2 < best) best = c.d2;
      }
      ax = bx;
      ay = by;
    }
  }
  return Math.sqrt(best);
}

/** Distance from point P to segment AB. */
export function pointSeg(px, py, ax, ay, bx, by) {
  const ex = bx - ax, ey = by - ay;
  let t = ((px - ax) * ex + (py - ay) * ey) / (ex * ex + ey * ey || 1);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - ax - ex * t, py - ay - ey * t);
}

export class Solids {
  constructor() {
    this.list = [];
  }

  add(s) {
    this.list.push(s);
    return s;
  }

  /**
   * Nearest surface along a unit ray. Fills out {d, x, y, nx, ny, solid} (the normal faces
   * the ray) and returns true on a hit.
   */
  raycast(ox, oy, dx, dy, max, out) {
    const list = this.list;
    const ex = ox + dx * max, ey = oy + dy * max;
    const x0 = ox < ex ? ox : ex, x1 = ox < ex ? ex : ox, y0 = oy < ey ? oy : ey, y1 = oy < ey ? ey : oy;
    let best = max, hit = null, bnx = 0, bny = 0;
    for (let k = 0; k < list.length; k++) {
      const s = list[k];
      if (!s.on || s.maxX < x0 || s.minX > x1 || s.maxY < y0 || s.minY > y1) continue;
      const p = s.pts, n = s.n;
      let ax = p[2 * n - 2], ay = p[2 * n - 1];
      for (let i = 0; i < n; i++) {
        const bx = p[2 * i], by = p[2 * i + 1];
        const sx = bx - ax, sy = by - ay;
        const den = dx * sy - dy * sx;
        if (den > 1e-9 || den < -1e-9) {
          const t = ((ax - ox) * sy - (ay - oy) * sx) / den;
          if (t > 1e-4 && t < best) {
            const u = ((ax - ox) * dy - (ay - oy) * dx) / den;
            if (u >= 0 && u <= 1) {
              best = t;
              hit = s;
              const l = Math.hypot(sx, sy) || 1;
              bnx = sy / l;
              bny = -sx / l;
              if (bnx * dx + bny * dy > 0) { bnx = -bnx; bny = -bny; }
            }
          }
        }
        ax = bx;
        ay = by;
      }
    }
    out.d = best;
    out.x = ox + dx * best;
    out.y = oy + dy * best;
    out.nx = bnx;
    out.ny = bny;
    out.solid = hit;
    return hit !== null;
  }

  /** True when no live solid crosses the segment A→B. */
  los(ax, ay, bx, by) {
    const list = this.list;
    const x0 = ax < bx ? ax : bx, x1 = ax < bx ? bx : ax, y0 = ay < by ? ay : by, y1 = ay < by ? by : ay;
    const dx = bx - ax, dy = by - ay;
    for (let k = 0; k < list.length; k++) {
      const s = list[k];
      if (!s.on || s.maxX < x0 || s.minX > x1 || s.maxY < y0 || s.minY > y1) continue;
      const p = s.pts, n = s.n;
      let cx = p[2 * n - 2], cy = p[2 * n - 1];
      for (let i = 0; i < n; i++) {
        const ex = p[2 * i], ey = p[2 * i + 1];
        const sx = ex - cx, sy = ey - cy;
        const den = dx * sy - dy * sx;
        if (den > 1e-9 || den < -1e-9) {
          const t = ((cx - ax) * sy - (cy - ay) * sx) / den;
          if (t > 0 && t < 1) {
            const u = ((cx - ax) * dy - (cy - ay) * dx) / den;
            if (u >= 0 && u <= 1) return false;
          }
        }
        cx = ex;
        cy = ey;
      }
    }
    return true;
  }

  /** True when a circle of radius r at (x, y) touches nothing. */
  free(x, y, r) {
    const list = this.list;
    for (let k = 0; k < list.length; k++) {
      const s = list[k];
      if (!s.on || x < s.minX - r || x > s.maxX + r || y < s.minY - r || y > s.maxY + r) continue;
      const c = closest(s, x, y);
      if (c.inside || c.d2 < r * r) return false;
    }
    return true;
  }

  /** Keep a circle at pos {x, y} (mutated) out of every solid. True if it touched anything. */
  push(pos, r) {
    const list = this.list;
    let any = false;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (let k = 0; k < list.length; k++) {
        const s = list[k];
        if (!s.on || pos.x < s.minX - r || pos.x > s.maxX + r || pos.y < s.minY - r || pos.y > s.maxY + r) continue;
        const c = closest(s, pos.x, pos.y);
        if (c.inside) {
          // Swallowed (a moving piece ran us over): leave through the nearest face.
          const d = Math.sqrt(c.d2);
          let ux = pos.x >= s.cx ? 1 : -1, uy = 0;
          if (d > 1e-6) { ux = (c.x - pos.x) / d; uy = (c.y - pos.y) / d; }
          pos.x = c.x + ux * r;
          pos.y = c.y + uy * r;
          moved = true;
        } else if (c.d2 < r * r) {
          const d = Math.sqrt(c.d2);
          if (d > 1e-6) {
            pos.x = c.x + ((pos.x - c.x) / d) * r;
            pos.y = c.y + ((pos.y - c.y) / d) * r;
            moved = true;
          }
        }
      }
      if (!moved) break;
      any = true;
    }
    return any;
  }

  /**
   * Add the shadow volume of every casting solid, as seen from (vx, vy), to g's current
   * path: each edge drags a quad out to `far`. Their union is exactly the unseen area.
   */
  shadow(g, vx, vy, far) {
    const list = this.list;
    for (let k = 0; k < list.length; k++) {
      const s = list[k];
      if (!s.on || !s.cast) continue;
      const p = s.pts, n = s.n;
      let ax = p[2 * n - 2], ay = p[2 * n - 1];
      let ka = far / (Math.hypot(ax - vx, ay - vy) || 1);
      for (let i = 0; i < n; i++) {
        const bx = p[2 * i], by = p[2 * i + 1];
        const kb = far / (Math.hypot(bx - vx, by - vy) || 1);
        // Wind every quad the same way round the viewer, or overlapping ones would cancel
        // under the non-zero fill rule and punch holes in the dark.
        if ((bx - ax) * (vy - ay) - (by - ay) * (vx - ax) >= 0) {
          g.moveTo(ax, ay);
          g.lineTo(bx, by);
          g.lineTo(bx + (bx - vx) * kb, by + (by - vy) * kb);
          g.lineTo(ax + (ax - vx) * ka, ay + (ay - vy) * ka);
        } else {
          g.moveTo(bx, by);
          g.lineTo(ax, ay);
          g.lineTo(ax + (ax - vx) * ka, ay + (ay - vy) * ka);
          g.lineTo(bx + (bx - vx) * kb, by + (by - vy) * kb);
        }
        g.closePath();
        ax = bx;
        ay = by;
        ka = kb;
      }
    }
  }
}
