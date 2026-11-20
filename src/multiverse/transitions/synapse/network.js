// The tissue for LAST SYNAPSE: the route the impulse takes, the forest around it, and
// every vertex's appointment with the light. All of it is static geometry built once
// from the seeded rng — the film is then a single uTime run against these buffers,
// which is what makes any frame renderable on demand.
import { rand, randInt, pick, chance, lerp, clamp, clamp01, hexToRgb, TAU } from '../../kit.js';

export const NEVER = 1e3;
export const LAND = 0.72;      // fraction of a hop spent in flight; the rest is the dwell on the node

export const rgb = (hex, k = 1) => { const c = hexToRgb(hex); return [(c.r / 255) * k, (c.g / 255) * k, (c.b / 255) * k]; };
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const V = () => ({ x: 0, y: 0, z: 0 });

function unit(rng) {
  const z = rng() * 2 - 1, a = rng() * TAU, r = Math.sqrt(1 - z * z);
  return { x: r * Math.cos(a), y: r * Math.sin(a), z };
}
// Radius profile of a capsule: round ends `cap` long (as a fraction of the strip), flat between.
function capped(u, cap) {
  const e = Math.min(u, 1 - u);
  if (e >= cap) return 1;
  const k = 1 - e / cap;
  return Math.sqrt(Math.max(0, 1 - k * k));
}
function norm(v) {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  v.x /= l; v.y /= l; v.z /= l;
  return v;
}

// Stains: how the tissue was prepared. The snipers' amber and cyan must read against all.
export const STAINS = [
  { id: 'violet', bg: [0.034, 0.024, 0.09], den: ['#5b4bff', '#8a3df0', '#3b6cff'], soma: ['#e86bff', '#ff7ad9'], mote: '#c9c2ff', sheath: '#b9b4ff' },
  { id: 'gfp', bg: [0.008, 0.05, 0.04], den: ['#19d98c', '#2fe0c2', '#7bea4a'], soma: ['#c8ff6a', '#6affc9'], mote: '#d6ffe9', sheath: '#bff7df' },
  { id: 'crimson', bg: [0.075, 0.012, 0.032], den: ['#ff3d6e', '#e8305a', '#ff5a8d'], soma: ['#ff9a7a', '#ff7ab0'], mote: '#ffd9cf', sheath: '#ffc9d0' },
  { id: 'brainbow', bg: [0.022, 0.026, 0.055], den: ['#ff4fa0', '#4f8dff', '#ffe04f', '#6dff7a', '#a070ff'], soma: ['#ff4fa0', '#ffe04f', '#6dff7a', '#a070ff'], mote: '#ffffff', sheath: '#e8e8ff' },
  { id: 'silver', bg: [0.04, 0.034, 0.03], den: ['#9a938a', '#b5a999', '#8d97a3'], soma: ['#e9dcc7', '#cfd8e6'], mote: '#fff4e0', sheath: '#e6ded2' },
];

// The route: a polyline with exact 2-unit steps (so arc length is the parameter), dead
// straight before s = 0 so the camera arrives on rails, wandering after.
function makeRoute(rng, L, wander) {
  const S0 = -100, DS = 2, n = Math.ceil((L + 130 - S0) / DS) + 1;
  const f = [rand(rng, 0.018, 0.034), rand(rng, 0.04, 0.07), rand(rng, 0.02, 0.045)];
  const ph = [rng() * TAU, rng() * TAU, rng() * TAU];
  const sm = (s) => { const k = clamp01(s / 45); return k * k * (3 - 2 * k); };
  const yaw = (s) => wander * sm(s) * (Math.sin(s * f[0] + ph[0]) + 0.5 * Math.sin(s * f[1] + ph[1]));
  const pitch = (s) => 0.55 * wander * sm(s) * Math.sin(s * f[2] + ph[2]);
  const dir = (s, o) => {
    const y = yaw(s), p = pitch(s), cp = Math.cos(p);
    o.x = Math.sin(y) * cp; o.y = Math.sin(p); o.z = -Math.cos(y) * cp;
    return o;
  };
  const P = new Float32Array(n * 3), d = V();
  let x = 0, y = 0, z = -S0;
  for (let i = 0; i < n; i++) {
    P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
    dir(S0 + (i + 0.5) * DS, d);
    x += d.x * DS; y += d.y * DS; z += d.z * DS;
  }
  return {
    L,
    dir,
    at(s, o) {
      const u = clamp((s - S0) / DS, 0, n - 1.001), i = Math.floor(u), k = u - i, a = i * 3;
      o.x = P[a] + (P[a + 3] - P[a]) * k;
      o.y = P[a + 1] + (P[a + 4] - P[a + 1]) * k;
      o.z = P[a + 2] + (P[a + 5] - P[a + 2]) * k;
      return o;
    },
    // Tangent, and two normals from a fixed up (the route never goes vertical).
    frame(s, T, B, N) {
      dir(s, T);
      B.x = -T.z; B.y = 0; B.z = T.x;
      norm(B);
      N.x = B.y * T.z - B.z * T.y; N.y = B.z * T.x - B.x * T.z; N.z = B.x * T.y - B.y * T.x;
    },
  };
}

// --- geometry accumulators ---------------------------------------------------------
class Ribbons {
  constructor() { this.pos = []; this.geo = []; this.col = []; this.lit = []; this.tim = []; this.ka = []; this.idx = []; this.n = 0; }
  // pts: flat xyz. radFn / arcFn / onFn take u in 0..1 along the strip.
  strip(pts, radFn, arcFn, onFn, col, lit, decay, sustain, kind, order) {
    const n = pts.length / 3;
    if (n < 2) return;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1) * 3, b = Math.min(n - 1, i + 1) * 3, c = i * 3;
      let tx = pts[b] - pts[a], ty = pts[b + 1] - pts[a + 1], tz = pts[b + 2] - pts[a + 2];
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl; ty /= tl; tz /= tl;
      const u = i / (n - 1), r = Math.max(1e-3, radFn(u)), arc = arcFn(u), on = onFn(u);
      for (let s = -1; s <= 1; s += 2) {
        this.pos.push(pts[c], pts[c + 1], pts[c + 2]);
        this.geo.push(tx, ty, tz, s * r);
        this.col.push(col[0], col[1], col[2]);
        this.lit.push(lit[0], lit[1], lit[2]);
        this.tim.push(on, decay, sustain, order);
        this.ka.push(kind, arc);
      }
      if (i < n - 1) { const k = this.n + i * 2; this.idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    this.n += n * 2;
  }
  build(THREE) {
    const g = new THREE.BufferGeometry();
    const f = (name, arr, size) => g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(arr), size));
    f('position', this.pos, 3); f('aGeo', this.geo, 4); f('aCol', this.col, 3); f('aLit', this.lit, 3); f('aTim', this.tim, 4); f('aKA', this.ka, 2);
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(this.idx), 1));
    return g;
  }
}

const CORNERS = [-1, -1, 1, -1, 1, 1, -1, 1];
class Quads {
  constructor(spec) { this.spec = spec; this.data = {}; for (const k in spec) this.data[k] = []; this.idx = []; this.n = 0; }
  add(v) {
    for (let c = 0; c < 4; c++) {
      for (const k in this.spec) {
        if (k === 'aCorner') this.data[k].push(CORNERS[c * 2], CORNERS[c * 2 + 1]);
        else { const a = v[k]; for (let i = 0; i < a.length; i++) this.data[k].push(a[i]); }
      }
    }
    const k = this.n;
    this.idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
    this.n += 4;
  }
  build(THREE) {
    const g = new THREE.BufferGeometry();
    for (const k in this.spec) g.setAttribute(k, new THREE.BufferAttribute(new Float32Array(this.data[k]), this.spec[k]));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(this.idx), 1));
    return g;
  }
}

/**
 * Build everything. o = { T (timeline), stain, pulse, sideCols [a, b], accent, fg }
 * (colours as [r,g,b]). Returns the route, the hop schedule and three geometries.
 */
export function buildNetwork(THREE, rng, o) {
  const { T, stain } = o;
  const relays = randInt(rng, 1, 3);
  const L = 150 + relays * 30 + rand(rng, 0, 24);
  const route = makeRoute(rng, L, rand(rng, 0.28, 0.6));
  const rb = new Ribbons();
  const sm = new Quads({ position: 3, aCorner: 2, aSom: 4, aCol: 3, aLit: 3, aTim: 4 });
  const sp = new Quads({ position: 3, aCorner: 2, aVel: 3, aTim: 4, aCol: 3, aKind: 1 });
  const P = V(), Tn = V(), Bn = V(), Nn = V(), Q = V();
  const sheathCol = rgb(stain.sheath);
  const moteCol = rgb(stain.mote);

  // --- stations: where the light lands. Somas, the nodes between sheaths, the terminal.
  const R0 = 3.4, RR = 3.0, BOUTON = 8, GAP = 1.3;
  const stops = [0];
  for (let i = 0; i < relays; i++) stops.push(((L * (i + 1)) / (relays + 1)) * rand(rng, 0.93, 1.07));
  stops.push(L);
  const stations = [{ s: 0, kind: 'soma' }];
  const sheaths = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const last = i === stops.length - 2;
    const a = stops[i] + (i === 0 ? R0 : RR), b = last ? L - BOUTON : stops[i + 1] - RR;
    const m = Math.max(2, Math.round((b - a) / rand(rng, 13, 20)));
    for (let k = 0; k < m; k++) {
      const n0 = a + ((b - a) * k) / m, n1 = a + ((b - a) * (k + 1)) / m;
      sheaths.push({ a: n0 + GAP / 2, b: n1 - GAP / 2, hop: stations.length - 1 });
      stations.push(k < m - 1 ? { s: n1, kind: 'node' } : last ? { s: L - 1.2, kind: 'terminal' } : { s: stops[i + 1], kind: 'soma' });
    }
  }
  // Hops accelerate geometrically; a hop into a cell body lingers (the cell has to decide).
  const J = stations.length - 1;
  const rho = rand(rng, 0.86, 0.91);
  const wts = [];
  let wsum = 0;
  for (let j = 0; j < J; j++) { const w = Math.pow(rho, j) * (stations[j + 1].kind === 'soma' ? 1.5 : 1); wts.push(w); wsum += w; }
  let tt = T.chase0;
  stations[0].land = T.ignite;
  for (let j = 0; j < J; j++) {
    stations[j].t = tt;
    stations[j].d = (wts[j] / wsum) * (T.chase1 - T.chase0);
    stations[j + 1].land = tt + LAND * stations[j].d;
    tt += stations[j].d;
  }
  stations[J].t = tt;
  stations[J].d = 0.3;

  const hopAt = (t) => { let j = 0; while (j < J - 1 && t >= stations[j + 1].t) j++; return j; };
  const e3 = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  /** Arc position of the impulse: flies node to node, dwells, flies again. */
  const pulseS = (t) => {
    if (t <= T.chase0) return 0;
    if (t >= stations[J].t) return stations[J].s;
    const j = hopAt(t), st = stations[j];
    return lerp(st.s, stations[j + 1].s, e3(clamp01((t - st.t) / (LAND * st.d))));
  };
  const sLin = (t) => {
    if (t <= T.chase0) return 0;
    if (t >= stations[J].t) return stations[J].s;
    const j = hopAt(t), st = stations[j];
    return lerp(st.s, stations[j + 1].s, (t - st.t) / st.d);
  };
  /** The camera's anchor: the same journey with the hops smoothed out of it. */
  const camS = (t) => (sLin(t - 0.26) + sLin(t - 0.13) + sLin(t) + sLin(t + 0.13) + sLin(t + 0.26)) / 5;
  /** When the impulse passes arc s. */
  const passTime = (s) => {
    if (s <= 0) return T.ignite;
    for (let j = 0; j < J; j++) {
      if (s <= stations[j + 1].s) return stations[j].t + LAND * stations[j].d * clamp01((s - stations[j].s) / (stations[j + 1].s - stations[j].s));
    }
    return stations[J].land;
  };

  const along = (s0, s1, step, off) => {
    const n = Math.max(2, Math.ceil((s1 - s0) / step) + 1), pts = [];
    for (let i = 0; i < n; i++) {
      route.at(lerp(s0, s1, i / (n - 1)), P);
      pts.push(P.x + (off ? off.x : 0), P.y + (off ? off.y : 0), P.z + (off ? off.z : 0));
    }
    return pts;
  };

  // --- dendrites: a wandering branch that forks, thinning as it goes
  function grow(start, dir, len, r0, depth, arc0, st) {
    const step = 1.6, n = Math.max(3, Math.round(len / step));
    const pts = [start.x, start.y, start.z], d = { x: dir.x, y: dir.y, z: dir.z }, p = { x: start.x, y: start.y, z: start.z };
    for (let i = 1; i <= n; i++) {
      d.x += (rng() - 0.5) * st.wander; d.y += (rng() - 0.5) * st.wander; d.z += (rng() - 0.5) * st.wander;
      norm(d);
      p.x += d.x * step; p.y += d.y * step; p.z += d.z * step;
      pts.push(p.x, p.y, p.z);
    }
    const r1 = r0 * 0.55, span = n * step;
    const flare = depth === 0 ? st.flare || 0 : 0;
    rb.strip(pts, (u) => (r0 + (r1 - r0) * u) * (1 + flare * Math.exp(-u * 9)), (u) => arc0 + u * span, (u) => (st.fire >= NEVER ? NEVER : st.fire + (arc0 + u * span) / st.speed), st.col, st.lit, st.decay, st.sustain, 0, st.order);
    if (depth >= st.depth) return;
    const kids = depth === 0 || chance(rng, 0.7) ? 2 : 1;
    for (let k = 0; k < kids; k++) {
      const j = unit(rng), cd = norm({ x: d.x + j.x * 0.85, y: d.y + j.y * 0.85, z: d.z + j.z * 0.85 });
      grow(p, cd, len * rand(rng, 0.6, 0.85), r1, depth + 1, arc0 + span, st);
    }
  }
  // A whole cell: body + trees. avoid = a direction no trunk may leave along (the axon's).
  function neuron(c, radius, n) {
    sm.add({ position: [c.x, c.y, c.z], aSom: [radius, n.tile, n.mem, n.order], aCol: n.somaCol, aLit: n.lit, aTim: [n.fire, 1.7, 0.3, 0] });
    for (let i = 0; i < n.trees; i++) {
      let d = unit(rng);
      for (let tries = 0; n.avoid && tries < 8 && Math.abs(d.x * n.avoid.x + d.y * n.avoid.y + d.z * n.avoid.z) > 0.72; tries++) d = unit(rng);
      grow({ x: c.x + d.x * radius * 0.92, y: c.y + d.y * radius * 0.92, z: c.z + d.z * radius * 0.92 }, d, rand(rng, n.len[0], n.len[1]), n.r0 * rand(rng, 0.75, 1.15), 0, radius, n);
    }
  }
  const tissue = (k = 1) => rgb(pick(rng, stain.den), rand(rng, 0.4, 0.8) * k);
  const somaCol = (k = 1) => rgb(pick(rng, stain.soma), rand(rng, 0.5, 0.8) * k);
  const order = (s) => clamp01(1 - s / L + rand(rng, -0.1, 0.1)); // flood order: the far end turns first
  const ring = (p, t, size, life, col) => sp.add({ position: [p.x, p.y, p.z], aVel: [0, 0, 0], aTim: [t, life, size, rng()], aCol: col, aKind: [3] });
  const sparks = (p, t, n, speed, life, cols, bias, spread) => {
    for (let i = 0; i < n; i++) {
      const u = unit(rng), v = rand(rng, speed[0], speed[1]);
      const d = bias ? norm({ x: bias.x + u.x * spread, y: bias.y + u.y * spread, z: bias.z + u.z * spread }) : u;
      sp.add({ position: [p.x, p.y, p.z], aVel: [d.x * v, d.y * v, d.z * v], aTim: [t + rng() * 0.05, rand(rng, life[0], life[1]), rand(rng, 0.05, 0.11), rng()], aCol: mul(pick(rng, cols), rand(rng, 1.2, 2.6)), aKind: [1] });
    }
  };
  const white = [1, 1, 1];
  const hot = mix3(o.pulse, white, 0.45);

  // --- the main axon: bare core, myelin sheaths, the arcs that jump them
  rb.strip(along(R0 * 0.8, L - BOUTON + 0.6, 1.4), () => 0.26, (u) => u * L, (u) => passTime(lerp(R0 * 0.8, L - BOUTON + 0.6, u)), mul(sheathCol, 0.3), o.pulse, 2.2, 0.32, 0, 0.5);
  for (const sh of sheaths) {
    const st = stations[sh.hop], len = sh.b - sh.a, cap = 1.1 / len;
    const ord = order((sh.a + sh.b) / 2);
    rb.strip(along(sh.a, sh.b, 0.9), (u) => 0.72 * capped(u, cap), (u) => u * len, (u) => st.t + u * LAND * st.d, mul(sheathCol, 0.26), o.pulse, 2.6, 0.26, 1, ord);
    const strands = randInt(rng, 2, 3);
    for (let k = 0; k < strands; k++) {
      const th = rng() * TAU, amp = rand(rng, 1.4, 2.4), n = 13, pts = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n, s = lerp(sh.a - GAP / 2, sh.b + GAP / 2, u);
        route.at(s, P);
        route.frame(s, Tn, Bn, Nn);
        const mid = i > 0 && i < n ? 1 : 0, bulge = Math.sin(Math.PI * u) * amp;
        const cx = Math.cos(th) * bulge + (rng() - 0.5) * 0.9 * mid, cy = Math.sin(th) * bulge + (rng() - 0.5) * 0.9 * mid;
        pts.push(P.x + Bn.x * cx + Nn.x * cy, P.y + Bn.y * cx + Nn.y * cy, P.z + Bn.z * cx + Nn.z * cy);
      }
      rb.strip(pts, () => 0.085, (u) => u * 10, (u) => st.t + u * LAND * st.d * 0.92, [0, 0, 0], hot, 7, 0, 2, rng());
    }
  }

  // --- the cells on the route. Each relay answers in a sniper's colour, alternating.
  const heroDen = () => rgb(pick(rng, stain.den), 0.62);
  let side = chance(rng, 0.5) ? 0 : 1;
  let tile = 1;
  for (let j = 0; j <= J; j++) {
    const st = stations[j];
    route.at(st.s, P);
    route.dir(st.s, Tn);
    if (st.kind === 'soma') {
      const first = j === 0, lit = first ? o.pulse : o.sideCols[side++ & 1];
      neuron(P, first ? R0 : RR, { trees: first ? 7 : 5, len: first ? [16, 26] : [12, 20], depth: 3, r0: 0.5, flare: 1.6, wander: 0.5, col: heroDen(), somaCol: somaCol(1.1), lit, fire: st.land, speed: 46, decay: 1.3, sustain: 0.3, order: order(st.s), tile: first ? 0 : tile++, mem: first ? 1.15 : 1, avoid: Tn });
      ring(P, st.land, first ? 15 : 10, first ? 0.75 : 0.5, mul(lit, 1.6));
      sparks(P, st.land, first ? 80 : 46, [10, 38], [0.35, 0.8], [lit, white, hot]);
    } else if (st.kind === 'node') {
      ring(P, st.land, 2.6, 0.32, mul(hot, 1.5));
      sparks(P, st.land, 12, [8, 30], [0.2, 0.45], [hot, white], Tn, 0.8);
    }
  }

  // --- the terminal: a bouton packed with vesicles, the cleft, the spine that receives
  const bulb = (u) => Math.pow(Math.sin(Math.PI * Math.pow(clamp01(u), 1.6)), 0.8);
  rb.strip(along(L - BOUTON, L, 0.5), (u) => 0.26 + 2.7 * bulb(u), (u) => u * BOUTON, () => stations[J].land, mul(sheathCol, 0.3), o.pulse, 2.0, 0.4, 1, 0);
  const CLEFT = 2.3, SPINE = 8.5, cleftS = L + CLEFT / 2;
  const tCross = T.cross;
  rb.strip(along(L + CLEFT, L + CLEFT + SPINE, 0.5), (u) => 0.5 + 2.9 * bulb(1 - u * 0.97), (u) => u * SPINE, (u) => tCross + u * 0.12, mul(sheathCol, 0.28), o.accent, 1.2, 0.55, 1, 0);
  const trunk0 = L + CLEFT + SPINE, somaS = trunk0 + rand(rng, 20, 28);
  rb.strip(along(trunk0 - 0.5, somaS, 1.2), () => 0.55, (u) => u * 20, (u) => tCross + 0.1 + u * 0.22, mul(sheathCol, 0.3), o.accent, 1.4, 0.5, 0, 0);
  route.at(somaS, P);
  route.dir(somaS, Tn);
  neuron(P, 4.2, { trees: 8, len: [18, 30], depth: 3, r0: 0.6, flare: 1.6, wander: 0.45, col: heroDen(), somaCol: somaCol(1.1), lit: o.accent, fire: tCross + 0.3, speed: 110, decay: 1.0, sustain: 0.6, order: 0, tile: 0, mem: 0, avoid: null });
  // Vesicles crowd the release face; on the impulse they are driven into it and burst.
  route.frame(L, Tn, Bn, Nn);
  const face = route.at(L - 0.3, V());
  for (let i = 0; i < 54; i++) {
    const u = rand(rng, 0.45, 0.93), s = L - BOUTON + u * BOUTON, rr = (0.26 + 2.7 * bulb(u)) * Math.sqrt(rng()) * 0.72, th = rng() * TAU;
    route.at(s, P);
    const x = P.x + (Bn.x * Math.cos(th) + Nn.x * Math.sin(th)) * rr, y = P.y + (Bn.y * Math.cos(th) + Nn.y * Math.sin(th)) * rr, z = P.z + (Bn.z * Math.cos(th) + Nn.z * Math.sin(th)) * rr;
    const jx = (rng() - 0.5) * 1.6, jy = (rng() - 0.5) * 1.6;
    const ex = face.x + Bn.x * jx + Nn.x * jy, ey = face.y + Bn.y * jx + Nn.y * jy, ez = face.z + Bn.z * jx + Nn.z * jy;
    const t0 = T.burst + rng() * 0.16, life = rand(rng, 0.18, 0.3);
    sp.add({ position: [x, y, z], aVel: [ex - x, ey - y, ez - z], aTim: [t0, life, rand(rng, 0.22, 0.36), rng()], aCol: mul(mix3(o.accent, white, 0.5), 0.9), aKind: [2] });
    // ...and each one that bursts throws its charge across the cleft.
    const E = { x: ex, y: ey, z: ez };
    sparks(E, t0 + life, 16, [7, 46], [0.35, 0.95], [o.accent, o.fg, white, o.sideCols[0]], Tn, 0.42);
  }
  // Receptors on the spine's face take the hit.
  for (let i = 0; i < 16; i++) {
    const th = rng() * TAU, rr = Math.sqrt(rng()) * 2.1;
    route.at(L + CLEFT + 0.25 + rr * rr * 0.12, P);
    sp.add({ position: [P.x + (Bn.x * Math.cos(th) + Nn.x * Math.sin(th)) * rr, P.y + (Bn.y * Math.cos(th) + Nn.y * Math.sin(th)) * rr, P.z + (Bn.z * Math.cos(th) + Nn.z * Math.sin(th)) * rr], aVel: [0, 0, 0], aTim: [tCross + rng() * 0.12, 1, 0.2, rng()], aCol: mul(o.accent, 1.4), aKind: [4] });
  }
  ring(route.at(cleftS, P), tCross, 16, 0.6, mul(mix3(o.accent, white, 0.4), 2));

  // --- the forest. Cells near the route are recruited as the impulse goes by: a
  // collateral carries the light out and the whole tree answers in a sniper's colour;
  // towards the end of the run they answer in the next world's instead.
  const count = randInt(rng, 54, 70);
  for (let i = 0; i < count; i++) {
    const s = rand(rng, -40, L + 60), rho2 = 15 + 50 * Math.pow(rng(), 1.35), th = rng() * TAU, rad = rand(rng, 1.4, 2.7);
    route.at(s, P);
    route.frame(s, Tn, Bn, Nn);
    const dx = Math.cos(th), dy = Math.sin(th);
    const dirOut = { x: Bn.x * dx + Nn.x * dy, y: Bn.y * dx + Nn.y * dy, z: Bn.z * dx + Nn.z * dy };
    const c = { x: P.x + dirOut.x * rho2, y: P.y + dirOut.y * rho2, z: P.z + dirOut.z * rho2 };
    const prog = clamp01(s / L);
    const fires = s > 4 && s < L - 4 && rho2 < 40 && chance(rng, 0.22 + 0.78 * Math.pow(prog, 1.4));
    const lit = prog > 0.7 && chance(rng, 0.65) ? o.accent : o.sideCols[side++ & 1];
    const tOut = passTime(s), lag = 0.03 + rho2 * 0.006;
    const ord = order(s);
    neuron(c, rad, { trees: randInt(rng, 4, 6), len: [9, 20], depth: 2, r0: rand(rng, 0.2, 0.34), flare: 2.2, wander: 0.6, col: tissue(), somaCol: somaCol(), lit, fire: fires ? tOut + lag : NEVER, speed: 55, decay: 1.5, sustain: 0.22, order: ord, tile: randInt(rng, 0, 3), mem: rand(rng, 0.3, 0.7), avoid: null });
    if (fires) {
      // The collateral: a sagging thread from the axon to the cell.
      const bend = unit(rng), pts = [], n = 12;
      for (let k = 0; k <= n; k++) {
        const u = k / n, w = 4 * u * (1 - u) * rho2 * 0.22, e = rho2 - rad;
        pts.push(P.x + dirOut.x * e * u + bend.x * w, P.y + dirOut.y * e * u + bend.y * w, P.z + dirOut.z * e * u + bend.z * w);
      }
      rb.strip(pts, () => 0.1, (u) => u * rho2, (u) => tOut + u * lag, tissue(0.5), lit, 2.4, 0.3, 0, ord);
      ring(c, tOut + lag, rad * 3.2, 0.45, mul(lit, 1.2));
    }
  }
  // Long fibres from cells we never meet, crossing the whole volume: the "forest" read.
  for (let i = 0; i < 40; i++) {
    const s = rand(rng, -30, L + 40), rho2 = rand(rng, 7, 46), th = rng() * TAU, len = rand(rng, 70, 150);
    route.at(s, P);
    route.frame(s, Tn, Bn, Nn);
    const c = { x: P.x + (Bn.x * Math.cos(th) + Nn.x * Math.sin(th)) * rho2, y: P.y + (Bn.y * Math.cos(th) + Nn.y * Math.sin(th)) * rho2, z: P.z + (Bn.z * Math.cos(th) + Nn.z * Math.sin(th)) * rho2 };
    // Roughly tangent to the cylinder around the route, so they cross the view, not the lens.
    const tang = { x: -Bn.x * Math.sin(th) + Nn.x * Math.cos(th), y: -Bn.y * Math.sin(th) + Nn.y * Math.cos(th), z: -Bn.z * Math.sin(th) + Nn.z * Math.cos(th) };
    const j = unit(rng), d = norm({ x: tang.x + Tn.x * rand(rng, -0.7, 0.7) + j.x * 0.3, y: tang.y + Tn.y * rand(rng, -0.7, 0.7) + j.y * 0.3, z: tang.z + Tn.z * rand(rng, -0.7, 0.7) + j.z * 0.3 });
    const pts = [], n = 28, bend = unit(rng), sag = rand(rng, 2, 9);
    for (let k = 0; k <= n; k++) {
      const u = k / n - 0.5, w = (0.25 - u * u) * 4 * sag;
      pts.push(c.x + d.x * len * u + bend.x * w, c.y + d.y * len * u + bend.y * w, c.z + d.z * len * u + bend.z * w);
    }
    const late = clamp01(s / L) > 0.45 && chance(rng, 0.45), fr = rand(rng, 0.07, 0.13);
    rb.strip(pts, () => fr, (u) => u * len, (u) => (late ? passTime(s) + u * 0.5 : NEVER), tissue(0.55), late ? o.accent : white, 3, 0.25, 0, order(s));
  }
  // Motes: neurotransmitter adrift in the fluid; the lens turns the near ones to bokeh.
  for (let i = 0; i < 1500; i++) {
    const s = rand(rng, -95, L + 70), rho2 = 1.6 + 34 * Math.sqrt(rng()), th = rng() * TAU;
    route.at(s, P);
    route.frame(s, Tn, Bn, Nn);
    const dx = Math.cos(th) * rho2, dy = Math.sin(th) * rho2;
    sp.add({ position: [P.x + Bn.x * dx + Nn.x * dy, P.y + Bn.y * dx + Nn.y * dy, P.z + Bn.z * dx + Nn.z * dy], aVel: [rand(rng, 0.3, 1.2), rand(rng, 0.3, 1.2), rand(rng, 0.3, 1.2)], aTim: [0, 1, rand(rng, 0.045, 0.15), rng()], aCol: mul(moteCol, rand(rng, 0.25, 1.0)), aKind: [0] });
  }

  return {
    route, L, stations, hops: J, relays, pulseS, camS, passTime, cleftS,
    ribbons: rb.build(THREE), somas: sm.build(THREE), sprites: sp.build(THREE),
    // Q is scratch for callers that only need a point back.
    point: (s) => route.at(s, Q),
  };
}

/**
 * Act 3's tree, in field space (x: 0..aspect, y: 0..1, y up): branches leave the root
 * (where the discharge was) and fork until they are off the picture. Returns a geometry
 * of one quad per segment for the MIN-blended growth field.
 */
export function buildGrowth(THREE, rng, aspect, root) {
  const segs = [];
  const STEP = 0.045;
  let tMax = 0.01;
  // Trunks run until they leave the picture; boughs and twigs are short, and each
  // generation forks less. A tree you can read, not a web.
  const walk = (x, y, ang, t, depth, w) => {
    const steps = depth === 0 ? 70 : randInt(rng, 5, 15 - depth * 2);
    let fork = randInt(rng, 3, 6);
    for (let i = 0; i < steps; i++) {
      ang += (rng() - 0.5) * 0.55;
      const nx = x + Math.cos(ang) * STEP, ny = y + Math.sin(ang) * STEP, nt = t + STEP * w;
      segs.push([x, y, nx, ny, t, nt, depth]);
      x = nx; y = ny; t = nt;
      if (t > tMax) tMax = t;
      if (x < -0.06 || x > aspect + 0.06 || y < -0.06 || y > 1.06) return;
      if (--fork <= 0 && depth < 3) {
        const sgn = chance(rng, 0.5) ? 1 : -1;
        walk(x, y, ang + sgn * rand(rng, 0.5, 1.0), t, depth + 1, w * 1.2);
        ang -= sgn * rand(rng, 0.08, 0.3);
        fork = randInt(rng, 4, 7) + depth * 2;
      }
    }
  };
  const n = randInt(rng, 5, 7), a0 = rng() * TAU;
  for (let i = 0; i < n; i++) walk(root.x, root.y, a0 + ((i + rand(rng, -0.3, 0.3)) / n) * TAU, 0, 0, 1);
  const pos = [], seg = [], tt = [], idx = [];
  const k = 0.58 / tMax; // the furthest tip arrives at 0.58; the gaps between branches fill after
  segs.forEach((s, i) => {
    const [ax, ay, bx, by] = s, ta = s[4] * k, tb = s[5] * k;
    const spread = 2.3 + 1.1 * s[6]; // a twig opens the white more slowly than a trunk
    const reach = Math.min(0.5, (1.02 - ta) / spread);
    const len = Math.hypot(bx - ax, by - ay) || 1e-6, ux = (bx - ax) / len, uy = (by - ay) / len;
    const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [cx, cy] of c) {
      const along = cx < 0 ? -reach : len + reach;
      pos.push(ax + ux * along - uy * cy * reach, ay + uy * along + ux * cy * reach, 0);
      seg.push(ax, ay, bx, by);
      tt.push(ta, tb, spread);
    }
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aSeg', new THREE.BufferAttribute(new Float32Array(seg), 4));
  g.setAttribute('aTT', new THREE.BufferAttribute(new Float32Array(tt), 3));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  return g;
}
