// THE DEEP — everything alive that is not trying to spear you. All of it is decoration
// (Math.random is fine): shoals that mill and part round the divers and burst away from a
// spear or the kraken's wake, reef fish that hover over their coral, a turtle, a manta
// crossing the light, a shark that circles and comes for a look, and the lights of the deep
// — jellyfish pulsing, anglerfish lures, sparks of plankton.
import { clamp, lerp, damp } from '../../kit.js';
import { WATER_GLSL } from './shaders.js';

const FISH_VERT = `
attribute vec3 aFish; // phase, beat rate, kind
uniform float uTime, uAmp, uWave, uFreq;
varying vec3 vW;
varying vec3 vN;
varying vec3 vO;
varying vec3 vC;
void main() {
  vec3 p = position;
  float ph = aFish.x, rate = aFish.y;
  // the body wave, growing towards the tail (the head is +z)
  float tail = clamp((0.45 - p.z) / 1.0, 0.0, 1.2);
  float sw = sin(p.z * uWave - uTime * uFreq * rate + ph);
  p.x += sw * uAmp * (0.15 + tail * tail);
  vO = position;
  vC = instanceColor;
  vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vW = w.xyz;
  // bend the normal with the wave a little so the flank flashes as it flexes
  vec3 n = normal + vec3(-cos(p.z * uWave - uTime * uFreq * rate + ph) * uAmp * uWave * 0.6 * tail, 0.0, 0.0);
  vN = normalize(mat3(modelMatrix * instanceMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FISH_FRAG = `
precision highp float;
varying vec3 vW;
varying vec3 vN;
varying vec3 vO;
varying vec3 vC;
uniform float uSilver;
${WATER_GLSL}
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(uCam - vW);
  // countershading: dark back, pale belly; a stripe for the reef kinds
  float up = clamp(vO.y * 6.0 + 0.5, 0.0, 1.0);
  vec3 alb = mix(vC * 1.25 + 0.05, vC * 0.35, up);
  alb = mix(alb, vC.gbr * 1.2, (1.0 - uSilver) * smoothstep(0.04, 0.0, abs(vO.z - 0.05)) * 0.8);
  vec3 col = litWater(alb, vW, n, 1.0, 0.4, 0.5);
  // silver flanks mirror the bright water above: shoals flash as they turn
  vec3 r = reflect(-v, n);
  col += (waterBg(r, vW.y) * 2.5 + sunAt(vW.y) * pow(max(dot(r, uL), 0.0), 10.0) * 0.6) * uSilver * (0.4 + 0.6 * (1.0 - up));
  gl_FragColor = vec4(waterFog(col, vW, 1.0), length(vW - uCam));
}`;

// A fish body along +z: a squashed spindle, a forked tail and a fin on top.
function fishGeometry(THREE, deep) {
  const g = new THREE.SphereGeometry(1, 10, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // y of the sphere becomes the length
    const L = y;
    const taper = 1 - Math.max(0, -L) * 0.75;
    p.setXYZ(i, x * 0.07 * taper, z * (deep ? 0.2 : 0.11) * taper, L * 0.5 + 0.05);
  }
  g.computeVertexNormals();
  const tail = new THREE.BufferGeometry();
  tail.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.38, 0, 0.16, -0.62, 0, 0.02, -0.52, 0, 0, -0.38, 0, -0.02, -0.52, 0, -0.16, -0.62], 3));
  tail.computeVertexNormals();
  const fin = new THREE.BufferGeometry();
  fin.setAttribute('position', new THREE.Float32BufferAttribute([0, deep ? 0.18 : 0.1, 0.1, 0, deep ? 0.32 : 0.17, -0.1, 0, deep ? 0.15 : 0.09, -0.2], 3));
  fin.computeVertexNormals();
  const parts = [g.toNonIndexed(), tail, fin];
  g.dispose();
  let n = 0;
  for (const q of parts) n += q.attributes.position.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
  let o = 0;
  for (const q of parts) { pos.set(q.attributes.position.array, o * 3); nrm.set(q.attributes.normal.array, o * 3); o += q.attributes.position.count; q.dispose(); }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return out;
}

// One instanced population with simple steering.
class School {
  constructor(THREE, mats, U, geo, n, o) {
    this.n = n;
    this.o = o;
    const phase = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { phase[i * 3] = Math.random() * 6.28; phase[i * 3 + 1] = 0.8 + Math.random() * 0.5; phase[i * 3 + 2] = 0; }
    this.geo = geo.clone();
    this.geo.setAttribute('aFish', new THREE.InstancedBufferAttribute(phase, 3));
    this.mat = mats.shader({
      vertexShader: FISH_VERT, fragmentShader: FISH_FRAG, side: THREE.DoubleSide,
      uniforms: { uAmp: { value: o.amp }, uWave: { value: o.wave }, uFreq: { value: o.freq }, uSilver: { value: o.silver } },
    });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) { o.color(c, i); this.mesh.setColorAt(i, c); }
    this.p = new Float32Array(n * 3);
    this.v = new Float32Array(n * 3);
    this.slot = new Float32Array(n * 4); // per fish: angle, radius, height, speed in the formation
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, r = o.radius * (0.35 + 0.65 * Math.sqrt(Math.random()));
      this.slot[i * 4] = a; this.slot[i * 4 + 1] = r; this.slot[i * 4 + 2] = (Math.random() - 0.5) * o.thick; this.slot[i * 4 + 3] = 0.8 + Math.random() * 0.4;
      const h = o.home(i);
      this.p[i * 3] = h[0] + Math.cos(a) * r; this.p[i * 3 + 1] = h[1] + this.slot[i * 4 + 2]; this.p[i * 3 + 2] = h[2] + Math.sin(a) * r;
    }
    this.size = new Float32Array(n);
    for (let i = 0; i < n; i++) this.size[i] = o.size * (0.8 + Math.random() * 0.45);
    this.panic = 0;
  }
  // threats: Float32Array [x,y,z,r, ...] count k; t: time
  update(dt, t, threats, k) {
    const o = this.o, P = this.p, V = this.v, S = this.slot, M = this.mesh.instanceMatrix.array;
    this.panic = Math.max(0, this.panic - dt * 0.6);
    for (let i = 0; i < this.n; i++) {
      const h = o.home(i, t);
      const a = S[i * 4] + t * o.spin * S[i * 4 + 3], r = S[i * 4 + 1] * (1 + this.panic * 0.6);
      const tx = h[0] + Math.cos(a) * r, ty = h[1] + S[i * 4 + 2] + Math.sin(a * 2 + i) * 0.3, tz = h[2] + Math.sin(a) * r;
      const p = i * 3;
      let ax = (tx - P[p]) * o.pull, ay = (ty - P[p + 1]) * o.pull, az = (tz - P[p + 2]) * o.pull;
      // swim along the ring as well as towards it
      ax += -Math.sin(a) * o.cruise; az += Math.cos(a) * o.cruise;
      for (let j = 0; j < k; j++) {
        const dx = P[p] - threats[j * 4], dy = P[p + 1] - threats[j * 4 + 1], dz = P[p + 2] - threats[j * 4 + 2], d2 = dx * dx + dy * dy + dz * dz, R = threats[j * 4 + 3];
        if (d2 < R * R && d2 > 1e-4) {
          const d = Math.sqrt(d2), f = ((R - d) / R) * o.flee / d;
          ax += dx * f; ay += dy * f * 0.6; az += dz * f;
        }
      }
      const drag = Math.exp(-o.drag * dt);
      V[p] = (V[p] + ax * dt) * drag; V[p + 1] = (V[p + 1] + ay * dt) * drag; V[p + 2] = (V[p + 2] + az * dt) * drag;
      const sp = Math.hypot(V[p], V[p + 1], V[p + 2]);
      if (sp > o.max) { const q = o.max / sp; V[p] *= q; V[p + 1] *= q; V[p + 2] *= q; }
      P[p] += V[p] * dt; P[p + 1] += V[p + 1] * dt; P[p + 2] += V[p + 2] * dt;
      if (o.floor) { const fl = o.floor(P[p], P[p + 2]) + 0.4; if (P[p + 1] < fl) P[p + 1] = fl; }
      if (P[p + 1] > -0.8) P[p + 1] = -0.8;
      // a basis from the heading: +z forward, +y up
      let fx = V[p], fy = V[p + 1] * 0.7, fz = V[p + 2];
      const fl2 = Math.hypot(fx, fy, fz) || 1;
      fx /= fl2; fy /= fl2; fz /= fl2;
      let rx = fz, rz = -fx; // right = up × fwd with up = y
      const rl = Math.hypot(rx, rz) || 1;
      rx /= rl; rz /= rl;
      const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
      const s = this.size[i], m = i * 16;
      M[m] = rx * s; M[m + 1] = 0; M[m + 2] = rz * s; M[m + 3] = 0;
      M[m + 4] = ux * s; M[m + 5] = uy * s; M[m + 6] = uz * s; M[m + 7] = 0;
      M[m + 8] = fx * s; M[m + 9] = fy * s; M[m + 10] = fz * s; M[m + 11] = 0;
      M[m + 12] = P[p]; M[m + 13] = P[p + 1]; M[m + 14] = P[p + 2]; M[m + 15] = 1;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() { this.geo.dispose(); }
}

// A creature built from a few parts that swims a path: turtle, manta, shark.
const CREA_VERT = `
uniform float uTime, uAmp, uFreq;
varying vec3 vW;
varying vec3 vN;
varying vec3 vO;
varying vec3 vC;
void main() {
  vec3 p = position;
  vC = color;
#ifdef FLAP
  // wings beat in a slow wave from root to tip
  float wx = abs(p.x);
  p.y += sin(uTime * uFreq - wx * 0.5) * uAmp * wx * wx * 0.35;
#endif
#ifdef SWIM
  float tail = clamp((0.2 - p.z) / 1.4, 0.0, 1.0);
  p.x += sin(p.z * 2.2 - uTime * uFreq) * uAmp * (0.1 + tail * tail);
#endif
  vO = position;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const CREA_FRAG = `
precision highp float;
varying vec3 vW;
varying vec3 vN;
varying vec3 vO;
varying vec3 vC;
${WATER_GLSL}
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(uCam - vW);
  vec3 alb = vC;
#ifdef SHELL
  vec4 nz = texture2D(tNoise, vO.xz * 0.9);
  alb *= 0.6 + 0.8 * smoothstep(0.35, 0.6, nz.g);
#endif
  vec3 col = litWater(alb, vW, n, 1.0, 0.4, 0.7);
  col += vec3(0.04, 0.16, 0.18) * pow(1.0 - max(dot(n, v), 0.0), 3.0);
  gl_FragColor = vec4(waterFog(col, vW, 1.0), length(vW - uCam));
}`;

function tint(THREE, g, f) {
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const k = f(p.getX(i), p.getY(i), p.getZ(i)); c[i * 3] = k[0]; c[i * 3 + 1] = k[1]; c[i * 3 + 2] = k[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

export function buildLife(THREE, mats, U, W, Q, heightAt) {
  const group = new THREE.Group();
  const geos = [];
  const keep = (g) => { geos.push(g); return g; };
  const slim = keep(fishGeometry(THREE, false)), deep = keep(fishGeometry(THREE, true));
  const schools = [];
  // the bait ball: hundreds of silver fish milling in the open water over the drop-off
  let baitC = [10, -13, 0];
  const bait = new School(THREE, mats, U, slim, Q.fish, {
    radius: 6.5, thick: 5, spin: 0.35, pull: 1.6, cruise: 2.4, flee: 30, drag: 1.4, max: 9, size: 0.42, amp: 0.05, wave: 9, freq: 15, silver: 1,
    color: (c) => c.setRGB(0.45, 0.55, 0.62),
    home: () => baitC,
  });
  // fusiliers: a blue stream along the wall
  let fusC = [-3, -16, 18];
  const fus = new School(THREE, mats, U, slim, Math.round(Q.fish * 0.45), {
    radius: 4.5, thick: 3, spin: -0.5, pull: 1.4, cruise: 2.8, flee: 26, drag: 1.4, max: 9, size: 0.55, amp: 0.06, wave: 8, freq: 13, silver: 0.55,
    color: (c) => c.setRGB(0.25, 0.45, 0.95),
    home: () => fusC,
  });
  // reef fish: each hovers over its own coral head
  const corals = W.decor.brain.length ? W.decor.brain : [{ x: -10, y: -11, z: 0, r: 1 }];
  const reefN = Math.round(Q.fish * 0.35);
  const reefHome = [];
  for (let i = 0; i < reefN; i++) { const c = corals[i % corals.length]; reefHome.push([c.x + (Math.random() - 0.5) * 2, c.y + c.r * 0.6 + 0.7 + Math.random() * 1.2, c.z + (Math.random() - 0.5) * 2]); }
  const reefCols = [[1, 0.75, 0.1], [0.95, 0.4, 0.2], [0.3, 0.6, 1], [0.95, 0.9, 0.85], [0.8, 0.3, 0.8]];
  const reef = new School(THREE, mats, U, deep, reefN, {
    radius: 1.2, thick: 0.8, spin: 0.25, pull: 2.2, cruise: 0.4, flee: 18, drag: 2.5, max: 6, size: 0.42, amp: 0.05, wave: 7, freq: 9, silver: 0.15,
    color: (c, i) => { const k = reefCols[i % reefCols.length]; c.setRGB(k[0], k[1], k[2]); },
    home: (i) => reefHome[i],
    floor: heightAt,
  });
  // jacks: big silver fish cruising round the wreck
  const jw = W.wreck;
  let jackC = [jw.x, jw.y + 6, jw.z];
  const jacks = new School(THREE, mats, U, deep, 14, {
    radius: 10, thick: 4, spin: 0.16, pull: 0.5, cruise: 3, flee: 14, drag: 0.8, max: 7, size: 1.15, amp: 0.04, wave: 6, freq: 8, silver: 0.85,
    color: (c) => c.setRGB(0.5, 0.55, 0.55),
    home: () => jackC,
  });
  schools.push(bait, fus, reef, jacks);
  for (const s of schools) group.add(s.mesh);

  // ---- the turtle
  const creature = (define, amp, freq) => (mats.lean && (define = null), mats.shader({ vertexShader: CREA_VERT, fragmentShader: CREA_FRAG, vertexColors: true, defines: define ? { [define]: 1 } : {}, uniforms: { uAmp: { value: amp }, uFreq: { value: freq } }, side: THREE.DoubleSide }));
  const turtle = new THREE.Group();
  {
    const shell = new THREE.SphereGeometry(0.62, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    shell.scale(1, 0.45, 1.25);
    tint(THREE, shell, () => [0.45, 0.36, 0.2]);
    const belly = new THREE.SphereGeometry(0.6, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    belly.scale(1, 0.18, 1.2);
    tint(THREE, belly, () => [0.8, 0.72, 0.5]);
    const head = new THREE.SphereGeometry(0.17, 10, 8); head.scale(0.9, 0.8, 1.3); head.translate(0, 0.03, 0.85);
    tint(THREE, head, () => [0.5, 0.5, 0.35]);
    const sm = creature('SHELL', 0, 0), bm = creature(null, 0, 0);
    turtle.add(new THREE.Mesh(keep(shell), sm), new THREE.Mesh(keep(belly), bm), new THREE.Mesh(keep(head), bm));
    const flip = keep(tint(THREE, (() => { const g = new THREE.SphereGeometry(0.5, 10, 6); g.scale(0.9, 0.06, 0.3); g.translate(0.45, 0, 0); return g; })(), () => [0.5, 0.5, 0.35]));
    turtle.flippers = [];
    for (const [x, z, s] of [[0.45, 0.4, 1], [-0.45, 0.4, -1], [0.35, -0.5, 1], [-0.35, -0.5, -1]]) {
      const f = new THREE.Mesh(flip, bm);
      f.position.set(x, 0, z);
      f.scale.set(s * (z > 0 ? 1 : 0.6), 1, z > 0 ? 1 : 0.7);
      turtle.add(f);
      turtle.flippers.push(f);
    }
  }
  group.add(turtle);
  // ---- the manta: one wide wing that beats slowly
  const manta = (() => {
    const pos = [], col = [], idx = [];
    const NX = 14, NZ = 8;
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
      const u = (i / NX) * 2 - 1, v = j / NZ;
      // a delta wing: wide in the middle, swept tips
      const span = 2.6 * Math.sin(Math.PI * Math.min(1, v * 1.1 + 0.05));
      const x = u * span, z = 1.2 - v * 2.4 - Math.abs(u) * Math.abs(u) * 0.9 * (1 - v);
      const y = (1 - Math.abs(u)) * 0.22 * Math.sin(v * Math.PI);
      pos.push(x, y, z);
      col.push(0.08, 0.09, 0.11);
    }
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + NX + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    // white belly underneath: a second sheet just below
    const base = pos.length / 3;
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) { const k = (j * (NX + 1) + i) * 3; pos.push(pos[k] * 0.92, pos[k + 1] - 0.05, pos[k + 2] * 0.92); col.push(0.85, 0.85, 0.82); }
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const a = base + j * (NX + 1) + i, b = a + NX + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(keep(g), creature('FLAP', 0.42, 1.3));
    const tail = new THREE.Mesh(keep(tint(THREE, (() => { const c = new THREE.CylinderGeometry(0.01, 0.04, 2.6, 4); c.rotateX(Math.PI / 2); c.translate(0, 0, -2.4); return c; })(), () => [0.08, 0.08, 0.1])), creature(null, 0, 0));
    const grp = new THREE.Group();
    grp.add(m, tail);
    grp.scale.setScalar(1.5);
    return grp;
  })();
  manta.traverse((o) => { if (o.isMesh) o.layers.enable(1); });
  group.add(manta);
  // ---- the shark: a long grey body, a tall fin, a slow side-to-side
  const shark = (() => {
    const g = new THREE.SphereGeometry(1, 16, 10);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), L = y, taper = L < 0 ? 1 - (-L) * 0.82 : 1 - L * L * 0.35;
      p.setXYZ(i, x * 0.28 * taper, z * 0.32 * taper, L * 1.4);
    }
    g.computeVertexNormals();
    tint(THREE, g, (x, y) => (y > -0.02 ? [0.32, 0.36, 0.4] : [0.8, 0.8, 0.78]));
    const fin = (pts, c) => { const f = new THREE.BufferGeometry(); f.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); f.computeVertexNormals(); return tint(THREE, f, () => c); };
    const dorsal = fin([0, 0.25, 0.3, 0, 0.75, -0.15, 0, 0.25, -0.35], [0.3, 0.34, 0.38]);
    const tailF = fin([0, 0, -1.3, 0, 0.75, -1.9, 0, 0.05, -1.55, 0, 0, -1.3, 0, -0.45, -1.75, 0, -0.03, -1.5], [0.3, 0.34, 0.38]);
    const pecs = fin([0.2, -0.1, 0.4, 0.95, -0.35, -0.05, 0.2, -0.1, 0.0, -0.2, -0.1, 0.4, -0.95, -0.35, -0.05, -0.2, -0.1, 0.0], [0.3, 0.34, 0.38]);
    const mat = creature('SWIM', 0.22, 3.2);
    const grp = new THREE.Group();
    for (const q of [g, dorsal, tailF, pecs]) grp.add(new THREE.Mesh(keep(q), mat));
    grp.scale.setScalar(1.25);
    return grp;
  })();
  shark.traverse((o) => { if (o.isMesh) o.layers.enable(1); });
  group.add(shark);

  // ---- lights of the deep (drawn through the glow cloud each frame)
  const jellies = [];
  for (let i = 0; i < 16; i++) jellies.push({ x: 8 + Math.random() * 45, y: -26 - Math.random() * 45, z: (Math.random() - 0.5) * 100, ph: Math.random() * 6.28, hue: Math.random(), r: 0.5 + Math.random() * 0.9 });
  const lures = [];
  for (let i = 0; i < 12; i++) lures.push({ x: 6 + Math.random() * 30, y: -38 - Math.random() * 40, z: (Math.random() - 0.5) * 90, ph: Math.random() * 6.28 });
  const jellyGeo = keep((() => {
    // a bell and a skirt of trailing threads, one mesh
    const g = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
    return g;
  })());
  const JELLY_FRAG = `
precision highp float;
varying vec3 vW;
varying vec3 vN;
varying vec3 vO;
varying vec3 vC;
uniform vec3 uGlowCol;
uniform float uPulse;
${WATER_GLSL}
void main() {
  vec3 n = normalize(vN), v = normalize(uCam - vW);
  float fr = pow(1.0 - abs(dot(n, v)), 2.0);
  float rim = smoothstep(0.25, 0.0, vO.y);
  float d = length(vW - uCam);
  vec3 col = uGlowCol * (fr * 0.9 + rim * 1.4) * (0.55 + 0.45 * uPulse);
  gl_FragColor = vec4(col * exp(-d * 0.02), 0.85);
}`;
  const jellyMeshes = jellies.map((j) => {
    const m = mats.shader({ vertexShader: CREA_VERT, fragmentShader: JELLY_FRAG, side: THREE.DoubleSide, vertexColors: true, uniforms: { uAmp: { value: 0 }, uFreq: { value: 0 }, uGlowCol: { value: new THREE.Color().setHSL(0.55 + j.hue * 0.35, 0.8, 0.55).multiplyScalar(1.4) }, uPulse: { value: 0 } } });
    m.transparent = true; m.depthWrite = false;
    m.blending = THREE.CustomBlending; m.blendSrc = THREE.SrcAlphaFactor; m.blendDst = THREE.OneFactor; m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor;
    const mesh = new THREE.Mesh(jellyGeo, m);
    mesh.position.set(j.x, j.y, j.z);
    mesh.scale.setScalar(j.r);
    mesh.renderOrder = 3;
    group.add(mesh);
    return mesh;
  });
  // CREA_VERT reads `color`; the jelly material has none, so give the geometry a white one
  tint(THREE, jellyGeo, () => [1, 1, 1]);

  // creature paths (decoration only)
  const tmp = { x: 0, y: 0, z: 0 };
  let sharkA = Math.random() * 6.28, sharkMode = 0, sharkT = 8 + Math.random() * 6, sharkX = 0, sharkY = -15, sharkZ = 0, sharkYaw = 0;
  const threats = new Float32Array(4 * 12);
  let prevMx = 0, prevMz = 0, prevTx = 0, prevTz = 0;

  return {
    group, schools, jellies, lures,
    scare(x, y, z, strength) { for (const s of schools) { s.panic = Math.min(1.5, s.panic + strength); } },
    // ctx: { t, divers:[{x,y,z}], extra: [[x,y,z,r]], glow (Cloud), kraken (sim state) }
    update(dt, t, c) {
      // where the shoals hang: the bait ball drifts in the open water, flees the kraken
      const K = c.kraken;
      let k = 0;
      for (const d of c.divers) { threats[k * 4] = d.x; threats[k * 4 + 1] = d.y; threats[k * 4 + 2] = d.z; threats[k * 4 + 3] = 5.5; k++; }
      for (const e of c.extra) { if (k >= 11) break; threats[k * 4] = e[0]; threats[k * 4 + 1] = e[1]; threats[k * 4 + 2] = e[2]; threats[k * 4 + 3] = e[3]; k++; }
      threats[k * 4] = K.pos[0]; threats[k * 4 + 1] = K.pos[1]; threats[k * 4 + 2] = K.pos[2]; threats[k * 4 + 3] = 22; k++;
      baitC[0] = 11 + 6 * Math.sin(t * 0.05); baitC[1] = -14 + 3 * Math.sin(t * 0.07); baitC[2] = 14 * Math.sin(t * 0.031 + 1);
      const kd = Math.hypot(baitC[0] - K.pos[0], baitC[1] - K.pos[1], baitC[2] - K.pos[2]);
      if (kd < 30) { baitC[0] -= (K.pos[0] - baitC[0]) * (30 - kd) / 60; baitC[2] -= (K.pos[2] - baitC[2]) * (30 - kd) / 60; baitC[1] = Math.max(baitC[1], -10); }
      fusC[0] = -2 + 2 * Math.sin(t * 0.09); fusC[1] = -17 + 2 * Math.sin(t * 0.11); fusC[2] = 24 * Math.sin(t * 0.045 + 2);
      jackC[1] = jw.y + 6 + Math.sin(t * 0.2) * 2;
      for (const s of schools) s.update(dt, t, threats, k);
      for (const s of schools) s.mat.uniforms.uFreq.value = s.o.freq * (1 + s.panic * 0.8);

      // turtle: a slow figure of eight over the shelf
      const ta = t * 0.045;
      tmp.x = -16 + 8 * Math.sin(ta); tmp.z = 22 * Math.sin(ta * 0.5); tmp.y = heightAt(tmp.x, tmp.z) + 3 + Math.sin(t * 0.3);
      turtle.position.set(tmp.x, tmp.y, tmp.z);
      const tdx = tmp.x - prevTx, tdz = tmp.z - prevTz;
      if (Math.abs(tdx) + Math.abs(tdz) > 1e-5) turtle.rotation.y = Math.atan2(tdx, tdz);
      prevTx = tmp.x; prevTz = tmp.z;
      for (const [i, f] of turtle.flippers.entries()) f.rotation.z = Math.sin(t * 1.5 + (i < 2 ? 0 : 1.2)) * (i < 2 ? 0.6 : 0.3) * (i % 2 ? -1 : 1);
      // manta: a wide circuit overhead, silhouetted against the light
      const ma = t * 0.06 + 1;
      const mx = 2 + 26 * Math.cos(ma), mz = 34 * Math.sin(ma), my = -5.5 + 1.5 * Math.sin(t * 0.21);
      manta.position.set(mx, my, mz);
      manta.rotation.set(0, Math.atan2(mx - prevMx, mz - prevMz), Math.sin(t * 0.21) * 0.15);
      prevMx = mx; prevMz = mz;
      // shark: circles, and every so often comes in for a look at the nearest diver
      sharkT -= dt;
      const near = c.divers.length ? c.divers.reduce((b, d) => (Math.hypot(d.x - sharkX, d.z - sharkZ) < Math.hypot(b.x - sharkX, b.z - sharkZ) ? d : b), c.divers[0]) : null;
      let gx, gy, gz;
      if (sharkMode === 0) {
        sharkA += dt * 0.11;
        gx = 8 + 24 * Math.cos(sharkA); gz = 30 * Math.sin(sharkA); gy = -17 + 4 * Math.sin(sharkA * 2);
        if (sharkT < 0 && near) { sharkMode = 1; sharkT = 6; }
      } else {
        gx = near ? near.x : sharkX; gy = near ? near.y - 1 : sharkY; gz = near ? near.z : sharkZ;
        const dd = near ? Math.hypot(gx - sharkX, gy - sharkY, gz - sharkZ) : 0;
        if (dd < 7 || sharkT < 0) { sharkMode = 0; sharkT = 14 + Math.random() * 10; sharkA = Math.atan2(sharkZ / 30, (sharkX - 8) / 24); }
      }
      const want = Math.atan2(gx - sharkX, gz - sharkZ);
      let dy = want - sharkYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      sharkYaw += clamp(dy, -dt * 0.6, dt * 0.6);
      const ss = sharkMode ? 4.2 : 3;
      sharkX += Math.sin(sharkYaw) * ss * dt; sharkZ += Math.cos(sharkYaw) * ss * dt; sharkY = damp(sharkY, gy, 0.5, dt);
      shark.position.set(sharkX, sharkY, sharkZ);
      shark.rotation.set(0, sharkYaw, -clamp(dy, -0.5, 0.5) * 0.5);
      // the deep: jellies pulse and drift, lures bob, all through the glow cloud
      const G = c.glow;
      for (let i = 0; i < jellies.length; i++) {
        const j = jellies[i], m = jellyMeshes[i];
        const pulse = Math.pow(0.5 + 0.5 * Math.sin(t * 1.3 + j.ph), 3);
        j.y += (0.12 + pulse * 0.25) * dt;
        if (j.y > -18) j.y = -75;
        m.position.set(j.x + Math.sin(t * 0.1 + j.ph) * 2, j.y, j.z);
        m.scale.set(j.r * (1 + pulse * 0.18), j.r * (1 - pulse * 0.25), j.r * (1 + pulse * 0.18));
        m.material.uniforms.uPulse.value = pulse;
        const gc = m.material.uniforms.uGlowCol.value;
        G.put(m.position.x, m.position.y - j.r * 0.2, m.position.z, j.r * 6, gc.r * 0.25, gc.g * 0.25, gc.b * 0.25, 0.6 + pulse * 0.4);
        // threads: a few motes hanging below the bell
        for (let q = 0; q < 3; q++) G.put(m.position.x + Math.sin(t + q * 2 + j.ph) * 0.3 * j.r, m.position.y - j.r * (0.8 + q * 0.9), m.position.z + Math.cos(t * 0.8 + q) * 0.3 * j.r, j.r * 0.9, gc.r * 0.8, gc.g * 0.8, gc.b * 0.8, 0.5);
      }
      for (const l of lures) {
        const fl = 0.6 + 0.4 * Math.sin(t * 2.3 + l.ph) * Math.sin(t * 0.7 + l.ph * 2);
        G.put(l.x + Math.sin(t * 0.4 + l.ph) * 0.8, l.y + Math.sin(t * 0.9 + l.ph) * 0.4, l.z, 1.6, 0.4 * fl, 1.2 * fl, 1.0 * fl, 1);
      }
    },
    dispose() { for (const s of schools) s.dispose(); for (const g of geos) g.dispose(); },
  };
}
