// THE DEEP — everything that drifts, rises, glows or flies: bubbles, ink, silt, glows,
// marine snow, the spears and their streaks, sonar shells. Particles are camera-facing
// instanced quads (no point-size limits, so an ink cloud can fill the screen), pooled,
// with no allocation after create().
import { WATER_GLSL, keepAlpha } from './shaders.js';

const BB_VERT = `
uniform vec3 uCam;
attribute vec3 iPos;
attribute vec4 iCol;
attribute vec2 iSize; // x: size (m), y: spin / stretch
varying vec2 vQ;
varying vec4 vCol;
varying vec3 vW;
void main() {
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float c = cos(iSize.y), s = sin(iSize.y);
  vec2 q = vec2(position.x * c - position.y * s, position.x * s + position.y * c);
  // never more than about half the view across: bounds the overdraw of a cloud you swim into
  float cd0 = length(iPos - uCam);
  vec3 w = iPos + (right * q.x + up * q.y) * min(iSize.x, cd0 * 0.6);
  vQ = position.xy * 2.0;
  vCol = iCol;
  vW = w;
  // a particle almost touching the lens would fill the screen many times over: fade it out
  // before it gets there, and drop it entirely inside 25 cm (or 1 m for the big soft ones)
  float cd = length(iPos - uCam), near = iSize.x > 1.0 ? 1.0 : 0.25;
  vCol.a *= smoothstep(near, near * 2.5, cd);
  gl_Position = cd < near ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
const BB_FRAG = `
precision highp float;
varying vec2 vQ;
varying vec4 vCol;
varying vec3 vW;
${WATER_GLSL}
void main() {
  float r = length(vQ);
  if (r > 1.0) discard;
  float d = length(vW - uCam);
  vec3 col;
  float a;
#ifdef BUBBLE
  // a bubble: a bright rim, a hot highlight up and towards the sun, clear in the middle
  float rim = smoothstep(0.62, 0.95, r) * (1.0 - smoothstep(0.95, 1.0, r));
  float hl = (1.0 - smoothstep(0.0, 0.3, length(vQ - vec2(-0.32, 0.38))));
  vec3 light = sunAt(vW.y) * 0.5 + ambientAt(vec3(0.0, 1.0, 0.0), vW.y) * 3.0 + lamps(vW, vec3(0.0, 1.0, 0.0)) * 1.5;
  col = light * (rim * 0.9 + hl * 1.6) + vCol.rgb * 0.0;
  a = (rim * 0.75 + hl + 0.06) * vCol.a;
  col = mix(col, waterBg(normalize(vW - uCam), vW.y), 1.0 - exp(-d * 0.026));
#endif
#ifdef GLOW
  float g = exp(-r * r * 4.0) + 0.25 * exp(-r * r * 40.0);
  col = vCol.rgb * g;
  a = vCol.a * exp(-d * 0.02);
#endif
#ifdef SMOKE
  // ink and silt: soft, dense, lit only by the water around it
  float g = (1.0 - smoothstep(0.15, 1.0, r));
  vec3 light = ambientAt(vec3(0.0, 1.0, 0.0), vW.y) * 2.0 + sunAt(vW.y) * 0.08;
  col = vCol.rgb * light;
  col = waterFog(col, vW, 1.0);
  a = g * g * vCol.a;
#endif
  gl_FragColor = vec4(col, a);
}`;

export class Cloud {
  constructor(THREE, mats, max, kind) {
    this.max = max;
    this.n = 0;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max * 2);
    this.aPos = new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.InstancedBufferAttribute(this.size, 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos);
    g.setAttribute('iCol', this.aCol);
    g.setAttribute('iSize', this.aSize);
    g.instanceCount = 0;
    this.geo = g;
    const m = keepAlpha(THREE, mats.shader({ vertexShader: BB_VERT, fragmentShader: BB_FRAG, defines: { [kind]: 1 } }), kind === 'GLOW');
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = kind === 'GLOW' ? 3 : kind === 'BUBBLE' ? 2 : 1;
    // the simulation side
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max * 2); // age, lifetime
    this.base = new Float32Array(max * 4); // r g b a at birth
    this.grow = new Float32Array(max * 2); // size at birth, growth per s
    this.drag = new Float32Array(max);
    this.buoy = new Float32Array(max);
    this.next = 0;
  }
  emit(x, y, z, vx, vy, vz, size, grow, life, r, g, b, a, drag = 0.8, buoy = 0) {
    let i = this.next;
    this.next = (this.next + 1) % this.max;
    const p = i * 3, c = i * 4;
    this.pos[p] = x; this.pos[p + 1] = y; this.pos[p + 2] = z;
    this.vel[p] = vx; this.vel[p + 1] = vy; this.vel[p + 2] = vz;
    this.life[i * 2] = 0; this.life[i * 2 + 1] = life;
    this.base[c] = r; this.base[c + 1] = g; this.base[c + 2] = b; this.base[c + 3] = a;
    this.grow[i * 2] = size; this.grow[i * 2 + 1] = grow;
    this.drag[i] = drag; this.buoy[i] = buoy;
    this.size[i * 2 + 1] = Math.random() * 6.28;
  }
  // `bubbles`: wobble and grow as they rise; die at the surface
  update(dt, t, bubbles) {
    let live = 0;
    const P = this.pos, V = this.vel, L = this.life, C = this.col, B = this.base, S = this.size, G = this.grow;
    for (let i = 0; i < this.max; i++) {
      const age = L[i * 2] + dt, life = L[i * 2 + 1];
      if (life <= 0) continue;
      if (age >= life || (bubbles && P[i * 3 + 1] > -0.15)) { L[i * 2 + 1] = 0; continue; }
      L[i * 2] = age;
      const k = Math.exp(-this.drag[i] * dt), p = i * 3;
      V[p] *= k; V[p + 1] = V[p + 1] * k + this.buoy[i] * dt; V[p + 2] *= k;
      let wx = 0, wz = 0;
      if (bubbles) { wx = Math.sin(t * 9 + i * 1.7) * 0.35; wz = Math.cos(t * 7.3 + i * 2.3) * 0.35; }
      P[p] += (V[p] + wx) * dt; P[p + 1] += V[p + 1] * dt; P[p + 2] += (V[p + 2] + wz) * dt;
      live++;
    }
    // pack the living to the front of the draw arrays
    let n = 0;
    for (let i = 0; i < this.max; i++) {
      const life = L[i * 2 + 1];
      if (life <= 0) continue;
      const u = L[i * 2] / life, p = i * 3;
      if (n !== i) { P[n * 3] = P[p]; P[n * 3 + 1] = P[p + 1]; P[n * 3 + 2] = P[p + 2]; }
      const fade = Math.min(1, u * 8) * (1 - u * u);
      C[n * 4] = B[i * 4]; C[n * 4 + 1] = B[i * 4 + 1]; C[n * 4 + 2] = B[i * 4 + 2]; C[n * 4 + 3] = B[i * 4 + 3] * fade;
      S[n * 2] = G[i * 2] + G[i * 2 + 1] * L[i * 2];
      if (n !== i) {
        S[n * 2 + 1] = S[i * 2 + 1];
        // keep the simulation slots aligned with the draw slots
        V[n * 3] = V[p]; V[n * 3 + 1] = V[p + 1]; V[n * 3 + 2] = V[p + 2];
        L[n * 2] = L[i * 2]; L[n * 2 + 1] = L[i * 2 + 1];
        B[n * 4] = B[i * 4]; B[n * 4 + 1] = B[i * 4 + 1]; B[n * 4 + 2] = B[i * 4 + 2]; B[n * 4 + 3] = B[i * 4 + 3];
        G[n * 2] = G[i * 2]; G[n * 2 + 1] = G[i * 2 + 1];
        this.drag[n] = this.drag[i]; this.buoy[n] = this.buoy[i];
        L[i * 2 + 1] = 0;
      }
      n++;
    }
    this.next = n % this.max;
    this.n = n;
    this.geo.instanceCount = n;
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
    return live;
  }
  // A sprite for this frame only, drawn after the living particles (call after update()).
  put(x, y, z, size, r, g, b, a) {
    const i = this.geo.instanceCount;
    if (i >= this.max) return;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
    this.size[i * 2] = size; this.size[i * 2 + 1] = 0;
    this.life[i * 2 + 1] = 0; // not a particle: the next update() will not keep it
    this.geo.instanceCount = i + 1;
  }
  clear() { this.life.fill(0); this.n = 0; this.geo.instanceCount = 0; }
  dispose() { this.geo.dispose(); }
}

// Marine snow: a fixed cloud of motes that wraps around the camera, drifting down and
// with the current. Nothing on the CPU per frame.
const SNOW_VERT = `
attribute vec3 iPos;
attribute vec2 iSize;
uniform float uTime;
uniform vec3 uCam;
uniform float uBox;
varying vec2 vQ;
varying vec3 vW;
varying float vA;
void main() {
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 drift = vec3(0.18, -0.12, 0.09) * uTime + vec3(sin(uTime * 0.3 + iPos.y), 0.0, cos(uTime * 0.23 + iPos.x)) * 0.4;
  vec3 c = mod(iPos + drift - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;
  vec3 w = c + (right * position.x + up * position.y) * iSize.x;
  vQ = position.xy * 2.0;
  vW = w;
  float d = length(c - uCam);
  vA = (1.0 - smoothstep(uBox * 0.3, uBox * 0.5, d)) * smoothstep(0.3, 1.2, d) * iSize.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
const SNOW_FRAG = `
precision highp float;
varying vec2 vQ;
varying vec3 vW;
varying float vA;
${WATER_GLSL}
void main() {
  float r = length(vQ);
  if (r > 1.0) discard;
  vec3 light = sunAt(vW.y) * 0.6 * (0.4 + 0.6 * sunShadow(vW, 0.003)) + ambientAt(vec3(0.0, 1.0, 0.0), vW.y) * 3.0 + lamps(vW, vec3(0.0, 1.0, 0.0)) * 3.0;
  float d = length(vW - uCam);
  vec3 col = light * vec3(0.9, 0.95, 0.85);
  col = mix(col, waterBg(normalize(vW - uCam), vW.y), 1.0 - exp(-d * 0.06));
  gl_FragColor = vec4(col, (1.0 - smoothstep(0.2, 1.0, r)) * vA * 0.55);
}`;
export function makeSnow(THREE, mats, count) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const box = 34, pos = new Float32Array(count * 3), size = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = Math.random() * box; pos[i * 3 + 1] = Math.random() * box; pos[i * 3 + 2] = Math.random() * box;
    size[i * 2] = 0.025 + Math.pow(Math.random(), 3) * 0.07; size[i * 2 + 1] = 0.4 + Math.random() * 0.6;
  }
  g.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 3));
  g.setAttribute('iSize', new THREE.InstancedBufferAttribute(size, 2));
  g.instanceCount = count;
  const m = keepAlpha(THREE, mats.shader({ vertexShader: SNOW_VERT, fragmentShader: SNOW_FRAG, uniforms: { uBox: { value: box } } }), false);
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  return { mesh, geo: g, setCount(n) { g.instanceCount = Math.min(count, n); }, dispose() { g.dispose(); } };
}

// A camera-facing streak through a list of points (the spear's wake), additive.
const RIB_VERT = `
attribute float aU;
attribute float aSide;
uniform vec3 uCamPos;
varying float vU;
varying vec3 vW;
void main() {
  vU = aU;
  vW = position;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}`;
const RIB_FRAG = `
precision highp float;
uniform vec3 uColor;
uniform float uAlpha;
varying float vU;
varying vec3 vW;
${WATER_GLSL}
void main() {
  float d = length(vW - uCam);
  // (faded where it leaves your own gun: a streak out in the water, not a pole across your mask)
  gl_FragColor = vec4(uColor * (0.25 + 0.75 * vU), uAlpha * vU * vU * exp(-d * 0.018) * smoothstep(0.8, 4.0, d));
}`;
export class Ribbon {
  constructor(THREE, mats, n, color) {
    this.n = n;
    this.pts = new Float32Array(n * 3);
    this.count = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 2 * 3);
    const u = new Float32Array(n * 2), side = new Float32Array(n * 2), idx = [];
    for (let i = 0; i < n; i++) { u[i * 2] = u[i * 2 + 1] = 1 - i / (n - 1); side[i * 2] = -1; side[i * 2 + 1] = 1; }
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    this.pa = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pa);
    g.setAttribute('aU', new THREE.BufferAttribute(u, 1));
    g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    g.setIndex(idx);
    this.geo = g;
    this.mat = keepAlpha(THREE, mats.shader({ vertexShader: RIB_VERT, fragmentShader: RIB_FRAG, uniforms: { uColor: { value: new THREE.Color(color).multiplyScalar(2.2) }, uAlpha: { value: 1 } }, side: THREE.DoubleSide }), true);
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
  }
  reset(x, y, z) { for (let i = 0; i < this.n; i++) { this.pts[i * 3] = x; this.pts[i * 3 + 1] = y; this.pts[i * 3 + 2] = z; } this.count = 1; }
  push(x, y, z) {
    this.pts.copyWithin(3, 0, (this.n - 1) * 3);
    this.pts[0] = x; this.pts[1] = y; this.pts[2] = z;
    this.count = Math.min(this.n, this.count + 1);
  }
  head(x, y, z) { this.pts[0] = x; this.pts[1] = y; this.pts[2] = z; }
  // rebuild the strip facing the camera at (cx, cy, cz), `w` wide
  build(cx, cy, cz, w) {
    const P = this.pts, O = this.pos, n = this.n;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      const tx = P[b * 3] - P[a * 3], ty = P[b * 3 + 1] - P[a * 3 + 1], tz = P[b * 3 + 2] - P[a * 3 + 2];
      const vx = P[i * 3] - cx, vy = P[i * 3 + 1] - cy, vz = P[i * 3 + 2] - cz;
      let sx = ty * vz - tz * vy, sy = tz * vx - tx * vz, sz = tx * vy - ty * vx;
      const sl = Math.hypot(sx, sy, sz) || 1, k = (w * (0.35 + 0.65 * (1 - i / n))) / sl;
      sx *= k; sy *= k; sz *= k;
      O[i * 6] = P[i * 3] - sx; O[i * 6 + 1] = P[i * 3 + 1] - sy; O[i * 6 + 2] = P[i * 3 + 2] - sz;
      O[i * 6 + 3] = P[i * 3] + sx; O[i * 6 + 4] = P[i * 3 + 1] + sy; O[i * 6 + 5] = P[i * 3 + 2] + sz;
    }
    this.pa.needsUpdate = true;
  }
  dispose() { this.geo.dispose(); }
}

// Sonar: an expanding shell, bright at its grazing edge.
const SHELL_VERT = `
varying vec3 vN;
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const SHELL_FRAG = `
precision highp float;
uniform vec3 uColor;
uniform float uAlpha;
varying vec3 vN;
varying vec3 vW;
${WATER_GLSL}
void main() {
  vec3 v = normalize(uCam - vW);
  // a wavefront: only its grazing edge glows, with faint ripples trailing inside it
  float f = pow(1.0 - abs(dot(normalize(vN), v)), 5.0);
  float bands = 0.7 + 0.3 * sin(vW.y * 2.2 - uTime * 8.0);
  float d = length(vW - uCam);
  gl_FragColor = vec4(uColor * (f * 1.6 + 0.012) * bands * exp(-d * 0.012), uAlpha);
}`;
export function makeShell(THREE, mats, geo, color) {
  const m = keepAlpha(THREE, mats.shader({ vertexShader: SHELL_VERT, fragmentShader: SHELL_FRAG, uniforms: { uColor: { value: new THREE.Color(color).multiplyScalar(1.6) }, uAlpha: { value: 0 } }, side: THREE.DoubleSide }), true);
  const mesh = new THREE.Mesh(geo, m);
  mesh.visible = false;
  mesh.renderOrder = 4;
  return mesh;
}

// The spear: a steel shaft with a barbed tip and plastic vanes in the shooter's colour.
export function spearGeometry(THREE) {
  const parts = [];
  const add = (g, r, gg, b) => {
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = r; c[i * 3 + 1] = gg; c[i * 3 + 2] = b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    parts.push(g.index ? g.toNonIndexed() : g);
    if (g.index) g.dispose();
  };
  const shaft = new THREE.CylinderGeometry(0.012, 0.012, 1.35, 6); shaft.rotateX(Math.PI / 2); add(shaft, 0.75, 0.78, 0.8);
  const tip = new THREE.ConeGeometry(0.03, 0.13, 6); tip.rotateX(Math.PI / 2); tip.translate(0, 0, 0.74); add(tip, 0.95, 0.95, 0.95);
  const barb = new THREE.BoxGeometry(0.008, 0.06, 0.08); barb.translate(0, 0.02, 0.6); barb.rotateZ(0.4); add(barb, 0.9, 0.9, 0.9);
  for (let k = 0; k < 3; k++) { const v = new THREE.BoxGeometry(0.004, 0.05, 0.14); v.translate(0, 0.03, -0.6); v.rotateZ((k / 3) * Math.PI * 2); add(v, -1, -1, -1); }
  let n = 0;
  for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    const c = g.attributes.position.count;
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3);
    o += c;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}
