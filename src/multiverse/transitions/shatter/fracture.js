// BROKEN REALITY — the fracture: where a pane breaks, and the solid shards it breaks into.
// A pane is the rectangle [-A, A] x [-1, 1] (A = aspect ratio). It is cut into the cells of
// a Voronoi diagram whose sites are laid out for a look (an impact web, a cellular scatter,
// long slivers), and every cell is extruded into a bevelled slab. All of a pane's shards
// live in ONE geometry: each vertex carries its shard's id, and the vertex shader fetches
// that shard's pose from a small float texture, so a hundred tumbling shards are one draw.
import { rand, randInt, TAU, clamp } from '../../kit.js';

// Keep the part of a convex polygon on the near side of the line through (mx, my) with normal (nx, ny).
function clipHalf(poly, mx, my, nx, ny) {
  const out = [], n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const da = (a[0] - mx) * nx + (a[1] - my) * ny, db = (b[0] - mx) * nx + (b[1] - my) * ny;
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const k = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
    }
  }
  return out;
}

// Each site's cell: the bounds, clipped by the bisector with every other site. O(n^2), n <= ~160.
function voronoi(sites, bounds) {
  const cells = [];
  for (let i = 0; i < sites.length; i++) {
    const s = sites[i];
    let poly = bounds;
    for (let j = 0; j < sites.length && poly.length >= 3; j++) {
      if (j === i) continue;
      const o = sites[j];
      poly = clipHalf(poly, (s[0] + o[0]) / 2, (s[1] + o[1]) / 2, o[0] - s[0], o[1] - s[1]);
    }
    if (poly.length >= 3) cells.push(poly);
  }
  return cells;
}

// Mitchell's best candidate: an even scatter, `bias` pulling points towards the focus.
function scatter(rng, n, A, fx, fy, bias) {
  const pts = [[fx, fy]];
  while (pts.length < n) {
    let best = null, bestD = -1;
    for (let k = 0; k < 7; k++) {
      let x, y;
      if (rng() < bias) {
        const a = rng() * TAU, r = Math.abs(rng() + rng() - 1) * 0.75;
        x = fx + Math.cos(a) * r;
        y = fy + Math.sin(a) * r;
      } else {
        x = rand(rng, -A, A);
        y = rand(rng, -1, 1);
      }
      x = clamp(x, -A, A);
      y = clamp(y, -1, 1);
      let d = 1e9;
      for (const p of pts) d = Math.min(d, Math.hypot(p[0] - x, p[1] - y));
      d /= 0.22 + Math.hypot(x - fx, y - fy); // near the impact the pieces may be smaller
      if (d > bestD) { bestD = d; best = [x, y]; }
    }
    if (best) pts.push(best);
  }
  return pts;
}

export const PATTERNS = ['web', 'cells', 'slivers'];

/**
 * Break the pane around the focus (fx, fy). Returns convex cells, counter-clockwise:
 * [{pts:[[x,y]...], cx, cy, area, rad, dist, ang}] — dist / ang are polar about the focus.
 */
export function fracture(rng, pattern, A, fx, fy) {
  const rect = [[-A, -1], [A, -1], [A, 1], [-A, 1]];
  let raw;
  if (pattern === 'web') {
    // Radial cracks crossed by rings that widen as they leave the impact.
    const spokes = randInt(rng, 8, 13), grow = rand(rng, 1.34, 1.56), rot = rng() * TAU;
    const far = Math.hypot(A + Math.abs(fx), 1 + Math.abs(fy)) + 0.3;
    const sites = [[fx, fy]];
    let k = 0;
    for (let r = rand(rng, 0.075, 0.11); r < far; r *= grow, k++) {
      const m = spokes * (r > 0.85 ? 2 : 1); // split the spokes far out, or the outer shards become planks
      for (let i = 0; i < m; i++) {
        const a = rot + ((i + (k % 2) * 0.5 + rand(rng, -0.24, 0.24)) / m) * TAU, rr = r * (1 + rand(rng, -0.11, 0.11));
        const x = fx + Math.cos(a) * rr, y = fy + Math.sin(a) * rr;
        if (Math.abs(x) < A + 0.3 && Math.abs(y) < 1.3) sites.push([x, y]);
      }
    }
    raw = voronoi(sites, rect);
  } else if (pattern === 'slivers') {
    // The same scatter in a stretched space: long blades all leaning one way.
    const th = rng() * Math.PI, c = Math.cos(th), s = Math.sin(th), st = rand(rng, 2.4, 3.3);
    const fwd = (p) => [p[0] * c + p[1] * s, (-p[0] * s + p[1] * c) * st];
    const back = (p) => { const y = p[1] / st; return [p[0] * c - y * s, p[0] * s + y * c]; };
    const sites = scatter(rng, randInt(rng, 44, 84), A, fx, fy, 0.3).map(fwd);
    raw = voronoi(sites, rect.map(fwd)).map((poly) => poly.map(back));
  } else {
    raw = voronoi(scatter(rng, randInt(rng, 50, 112), A, fx, fy, 0.34), rect);
  }

  const cells = [];
  for (const poly of raw) {
    // Snap to a grid so that neighbours agree on their shared corners, then drop repeats.
    const pts = [];
    for (const p of poly) {
      const q = [Math.round(p[0] * 2e4) / 2e4, Math.round(p[1] * 2e4) / 2e4];
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(last[0] - q[0], last[1] - q[1]) > 2e-4) pts.push(q);
    }
    if (pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) <= 2e-4) pts.pop();
    if (pts.length < 3) continue;
    let area = 0, cx = 0, cy = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], w = a[0] * b[1] - b[0] * a[1];
      area += w;
      cx += (a[0] + b[0]) * w;
      cy += (a[1] + b[1]) * w;
    }
    if (Math.abs(area) < 2e-5) continue; // a sliver too thin to see
    cx /= 3 * area;
    cy /= 3 * area;
    if (area < 0) pts.reverse();
    let rad = 0;
    for (const p of pts) rad = Math.max(rad, Math.hypot(p[0] - cx, p[1] - cy));
    cells.push({ pts, cx, cy, area: Math.abs(area) / 2, rad, dist: Math.hypot(cx - fx, cy - fy), ang: Math.atan2(cy - fy, cx - fx) });
  }
  return cells;
}

/** A loose convex polygon about the origin: a drifting fragment of some other pane. */
export function looseCell(rng, size) {
  const n = randInt(rng, 4, 6), rot = rng() * TAU, pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + ((i + rand(rng, -0.28, 0.28)) / n) * TAU, r = size * rand(rng, 0.62, 1);
    pts.push([Math.cos(a) * r * 1.25, Math.sin(a) * r]);
  }
  return { pts, cx: 0, cy: 0, rad: size * 1.25 };
}

/**
 * Extrude cells into bevelled slabs, all in one non-indexed (flat-shaded) geometry.
 * Vertices are stored relative to their cell's centre; the pose texture puts them in the world.
 *   aUv    where this vertex looks into the picture
 *   aRest  where it sits on the intact pane
 *   aData  x: 0 on the outline → 1 at the centre (crack lines are drawn where it is near 0)
 *          y: shard id   z: 0 front face, 1 bevels and sides, 2 back face
 * With the pose's depth at 0 the slab is flat and only its front faces the camera, so an
 * intact pane is exactly its picture.
 */
export function buildShards(THREE, cells, o) {
  let nv = 0;
  for (const c of cells) nv += c.pts.length * 24;
  const P = new Float32Array(nv * 3), Nn = new Float32Array(nv * 3), U = new Float32Array(nv * 2), R = new Float32Array(nv * 2), D = new Float32Array(nv * 3);
  let v = 0, id = 0, cell = null, face = 0;
  const uv = [0, 0];
  const tri = (a, b, c) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (const p of [a, b, c]) {
      P[v * 3] = p[0]; P[v * 3 + 1] = p[1]; P[v * 3 + 2] = p[2];
      Nn[v * 3] = nx; Nn[v * 3 + 1] = ny; Nn[v * 3 + 2] = nz;
      const x = cell.cx + p[0], y = cell.cy + p[1];
      o.uvOf(id, x, y, uv);
      U[v * 2] = uv[0]; U[v * 2 + 1] = uv[1];
      R[v * 2] = x; R[v * 2 + 1] = y;
      D[v * 3] = p[3]; D[v * 3 + 1] = id; D[v * 3 + 2] = face;
      v++;
    }
  };
  const h = o.thick / 2, zo = h - o.bevelD;
  for (id = 0; id < cells.length; id++) {
    cell = cells[id];
    const pts = cell.pts, n = pts.length;
    let inr = 1e9;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1];
      inr = Math.min(inr, Math.abs((cell.cx - a[0]) * ey - (cell.cy - a[1]) * ex) / (Math.hypot(ex, ey) || 1));
    }
    const s = clamp(1 - o.bevelW / Math.max(inr, 1e-4), 0.5, 0.985), e = 1 - s;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const ax = a[0] - cell.cx, ay = a[1] - cell.cy, bx = b[0] - cell.cx, by = b[1] - cell.cy;
      const O0 = [ax, ay, zo, 0], O1 = [bx, by, zo, 0], F0 = [ax * s, ay * s, h, e], F1 = [bx * s, by * s, h, e];
      const o0 = [ax, ay, -zo, 0], o1 = [bx, by, -zo, 0], f0 = [ax * s, ay * s, -h, e], f1 = [bx * s, by * s, -h, e];
      face = 0;
      tri([0, 0, h, 1], F0, F1);
      face = 1;
      tri(O0, O1, F1); tri(O0, F1, F0);
      tri(o0, o1, O1); tri(o0, O1, O0);
      tri(f0, f1, o1); tri(f0, o1, o0);
      face = 2;
      tri([0, 0, -h, 1], f1, f0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
  geo.setAttribute('aUv', new THREE.BufferAttribute(U, 2));
  geo.setAttribute('aRest', new THREE.BufferAttribute(R, 2));
  geo.setAttribute('aData', new THREE.BufferAttribute(D, 3));
  return geo;
}
