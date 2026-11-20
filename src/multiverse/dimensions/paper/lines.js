// Fat ink lines: every segment is a screen-space quad, so a line is the same number of pixels wide at 2 m and
// at 200 m (the "drawn" look). One draw call per LineSet.
import { lin } from './style.js';

const VERT = `
precision highp float;
attribute vec3 aStart; attribute vec3 aEnd; attribute vec4 aCol; attribute float aW;
uniform vec2 uRes; uniform float uWidth; uniform float uNear; uniform float uBias;
varying vec4 vCol;
void main() {
  vCol = aCol;
  if (aCol.a < 0.004) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec4 vs = modelViewMatrix * vec4(aStart, 1.0);
  vec4 ve = modelViewMatrix * vec4(aEnd, 1.0);
  vs.xyz *= 1.0 - uBias; ve.xyz *= 1.0 - uBias;
  float nz = -uNear;
  if (vs.z > nz && ve.z > nz) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  if (vs.z > nz) vs = mix(vs, ve, (nz - vs.z) / (ve.z - vs.z));
  else if (ve.z > nz) ve = mix(vs, ve, (nz - vs.z) / (ve.z - vs.z));
  vec4 cs = projectionMatrix * vs; vec4 ce = projectionMatrix * ve;
  vec2 d = (ce.xy / ce.w - cs.xy / cs.w) * uRes * 0.5;
  float len = length(d);
  d = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 n = vec2(-d.y, d.x);
  float hw = 0.5 * uWidth * aW;
  vec2 off = (n * position.y + d * (position.x * 2.0 - 1.0)) * hw;
  vec4 c = position.x > 0.5 ? ce : cs;
  gl_Position = vec4((c.xy / c.w + off * 2.0 / uRes) * c.w, c.z, c.w);
}`;
const FRAG = `
precision highp float;
varying vec4 vCol;
void main() {
  gl_FragColor = vec4(vCol.rgb, vCol.a);
  #include <colorspace_fragment>
}`;

/** Three line materials sharing one resolution: 'ink' (opaque, world), 'fig' (opaque, no depth bias), 'fade' (blended). */
export function makeLineMats(THREE) {
  const mk = (bias, transparent) => {
    const m = new THREE.ShaderMaterial({
      uniforms: { uRes: { value: new THREE.Vector2(1280, 720) }, uWidth: { value: 3 }, uNear: { value: 0.25 }, uBias: { value: bias } },
      vertexShader: VERT, fragmentShader: FRAG, transparent, depthWrite: !transparent, side: THREE.DoubleSide,
    });
    return m;
  };
  const mats = { ink: mk(0.0009, false), fig: mk(0, false), fade: mk(0.0009, true) };
  mats.set = (w, h, px, near) => {
    for (const k of ['ink', 'fig', 'fade']) {
      const u = mats[k].uniforms;
      u.uRes.value.set(w, h);
      u.uWidth.value = px;
      u.uNear.value = near;
    }
  };
  mats.dispose = () => { mats.ink.dispose(); mats.fig.dispose(); mats.fade.dispose(); };
  return mats;
}

/**
 * A batch of fat segments as ONE plain indexed mesh (four vertices per segment, the same segment data repeated on
 * each corner). Not instanced on purpose: instancing costs a fixed overhead per instance on software rasterisers
 * and thousands of ink lines would dominate the frame; a plain mesh is the same picture for a fraction of the cost.
 */
export class LineSet {
  constructor(THREE, cap, material, dynamic = false) {
    this.cap = cap;
    this.n = 0;
    const V = cap * 4;
    this.A = new Float32Array(V * 3);
    this.B = new Float32Array(V * 3);
    this.C = new Float32Array(V * 4);
    this.W = new Float32Array(V);
    const corner = new Float32Array(V * 3);
    const idx = V > 65535 ? new Uint32Array(cap * 6) : new Uint16Array(cap * 6);
    for (let i = 0; i < cap; i++) {
      const o = i * 4;
      for (let k = 0; k < 4; k++) { corner[(o + k) * 3] = k >> 1; corner[(o + k) * 3 + 1] = (k & 1) * 2 - 1; }
      idx[i * 6] = o; idx[i * 6 + 1] = o + 1; idx[i * 6 + 2] = o + 2; idx[i * 6 + 3] = o + 2; idx[i * 6 + 4] = o + 1; idx[i * 6 + 5] = o + 3;
    }
    const g = (this.geo = new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(corner, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const usage = dynamic ? THREE.DynamicDrawUsage : THREE.StaticDrawUsage;
    this.attrs = [new THREE.BufferAttribute(this.A, 3).setUsage(usage), new THREE.BufferAttribute(this.B, 3).setUsage(usage), new THREE.BufferAttribute(this.C, 4).setUsage(usage), new THREE.BufferAttribute(this.W, 1).setUsage(usage)];
    g.setAttribute('aStart', this.attrs[0]);
    g.setAttribute('aEnd', this.attrs[1]);
    g.setAttribute('aCol', this.attrs[2]);
    g.setAttribute('aW', this.attrs[3]);
    g.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
  }
  clear() { this.n = 0; }
  /** Append a segment; colour is a hex string; w scales the base width. Returns its index. */
  add(ax, ay, az, bx, by, bz, hex, w = 1, a = 1) {
    if (this.n >= this.cap) return -1;
    return this.set(this.n++, ax, ay, az, bx, by, bz, hex, w, a);
  }
  set(i, ax, ay, az, bx, by, bz, hex, w = 1, a = 1) {
    const c = lin(hex), A = this.A, B = this.B, C = this.C, W = this.W;
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k, v3 = v * 3, v4 = v * 4;
      A[v3] = ax; A[v3 + 1] = ay; A[v3 + 2] = az;
      B[v3] = bx; B[v3 + 1] = by; B[v3 + 2] = bz;
      C[v4] = c.r; C[v4 + 1] = c.g; C[v4 + 2] = c.b; C[v4 + 3] = a;
      W[v] = w;
    }
    return i;
  }
  hide(i) { for (let k = 0; k < 4; k++) this.C[(i * 4 + k) * 4 + 3] = 0; }
  /** Upload after writing. count: how many segments to draw (default: the appended ones). */
  flush(count = this.n) {
    this.geo.setDrawRange(0, Math.min(count, this.cap) * 6);
    for (const a of this.attrs) a.needsUpdate = true;
  }
  dispose() { this.geo.dispose(); }
}

/** Plain-array collectors for static geometry: build first, then freeze into one mesh each. */
export class FillBuf {
  constructor() { this.p = []; this.c = []; }
  tri(ax, ay, az, bx, by, bz, cx, cy, cz, hex) {
    const k = lin(hex);
    this.p.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    this.c.push(k.r, k.g, k.b, k.r, k.g, k.b, k.r, k.g, k.b);
  }
  quad(a, b, c, d, hex) {
    this.tri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], hex);
    this.tri(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2], hex);
  }
  /** A flat polygon in the ground plane at height y (counter-clockwise seen from above not required: no culling). */
  ground(pts, y, hex) {
    for (let i = 1; i < pts.length - 1; i++) this.tri(pts[0][0], y, pts[0][1], pts[i][0], y, pts[i][1], pts[i + 1][0], y, pts[i + 1][1], hex);
  }
  mesh(THREE, material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3));
    return new THREE.Mesh(g, material);
  }
}
export class LineBuf {
  constructor() { this.a = []; }
  add(ax, ay, az, bx, by, bz, hex, w = 1, al = 1) { this.a.push(ax, ay, az, bx, by, bz, hex, w, al); }
  set(THREE, material) {
    const n = this.a.length / 9;
    const ls = new LineSet(THREE, Math.max(1, n), material);
    for (let i = 0; i < n; i++) {
      const o = i * 9, a = this.a;
      ls.add(a[o], a[o + 1], a[o + 2], a[o + 3], a[o + 4], a[o + 5], a[o + 6], a[o + 7], a[o + 8]);
    }
    ls.flush();
    return ls;
  }
}
