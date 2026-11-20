// BREAK POINT — everything that flies, splashes and fades. Four small systems, all pooled:
//   sprites  one instanced draw of camera-facing quads: mist, droplets, rings on the water,
//            flashes and glints (soft spray lights up when the sun is behind it)
//   streaks  instanced ribbons: a round's white-hot head and the line it leaves in the air
//   wakes    a foam ribbon behind each board that rides the surface
//   rainbow  the bow that hangs in the mist of a wipe-out
import { clamp, fbm, GLSL_NOISE } from '../../kit.js';
import { HAZE_GLSL } from './sky.js';

const MAX = 1500, SEGS = 128, WAKE_N = 44, WAKE_LIFE = 5.5;

const SPRITE_V = `
attribute vec3 iPos;
attribute vec4 iSR;  // size, rotation, kind, additive
attribute vec4 iCol;
uniform vec3 uSunDir;
varying vec2 vUv;
varying vec4 vCol;
varying vec3 vK;
${HAZE_GLSL}
void main() {
  vUv = position.xy + 0.5;
  float cs = cos(iSR.y), sn = sin(iSR.y);
  vec2 q = vec2(position.x * cs - position.y * sn, position.x * sn + position.y * cs) * iSR.x;
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  if (iSR.z > 1.5 && iSR.z < 2.5) mv = viewMatrix * vec4(iPos + vec3(q.x, 0.0, q.y), 1.0); // rings lie on the water
  else mv.xy += q;
  gl_Position = projectionMatrix * mv;
  vec3 vd = normalize(iPos - cameraPosition);
  float back = pow(max(dot(vd, uSunDir), 0.0), 5.0), dist = length(iPos - cameraPosition);
  vec3 c = iCol.rgb * (1.0 + back * 2.4 * step(iSR.z, 1.5) * (1.0 - iSR.w));
  if (iSR.w < 0.5) c = mix(c, hazeColor(vd, uSunDir), 1.0 - exp(-dist * 0.00045));
  vCol = vec4(c, iCol.a);
  vK = vec3(iSR.z, iSR.w, 0.0);
}`;
// (One texture fetch per pixel: spray is the most overdrawn thing in the picture.)
const SPRITE_F = `precision highp float;
uniform sampler2D tPuff;
varying vec2 vUv;
varying vec4 vCol;
varying vec3 vK;
void main() {
  vec2 c = vUv * 2.0 - 1.0;
  float r = length(c), a;
  if (vK.x < 0.5) a = texture2D(tPuff, vUv).r;
  else if (vK.x < 1.5) a = 1.0 - smoothstep(0.5, 1.0, r);
  else if (vK.x < 2.5) a = smoothstep(0.55, 0.8, r) * (1.0 - smoothstep(0.86, 1.0, r)) * (0.45 + 1.1 * texture2D(tPuff, vUv * 0.5 + 0.25).g);
  else a = pow(max(0.0, 1.0 - r), 3.0) * 1.3 + pow(max(0.0, 1.0 - abs(c.x) * 10.0 - abs(c.y) * 0.95), 2.0) + pow(max(0.0, 1.0 - abs(c.y) * 10.0 - abs(c.x) * 0.95), 2.0);
  a *= vCol.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol.rgb * a, a * (1.0 - vK.y));
}`;
const STREAK_V = `
attribute vec3 iA;
attribute vec3 iB;
attribute vec4 iC;
attribute float iW;
varying vec4 vC;
varying float vS;
void main() {
  vec3 p = mix(iA, iB, position.x), side = normalize(cross(iB - iA, cameraPosition - p) + vec3(1e-5));
  float d = length(cameraPosition - p);
  p += side * position.y * (iW + d * 0.0011); // never thinner than a pixel or so
  vC = iC; vS = position.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const STREAK_F = `precision highp float;
varying vec4 vC;
varying float vS;
void main() { float a = (1.0 - vS * vS); gl_FragColor = vec4(vC.rgb * a * a * vC.a, 0.0); }`;
const WAKE_V = `
attribute float aA;
attribute float aS;
varying float vA;
varying float vS;
varying vec2 vP;
void main() { vA = aA; vS = aS; vP = position.xz; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`;
const WAKE_F = `precision highp float;
uniform sampler2D tDetail;
uniform vec3 uFoam;
varying float vA;
varying float vS;
varying vec2 vP;
void main() {
  float lace = texture2D(tDetail, vP * 0.21).b * 0.7 + texture2D(tDetail, vP * 0.063 + 0.4).b * 0.6;
  float e = 1.0 - vS * vS;
  float a = clamp(vA * e * (0.3 + lace * 1.2 + e * 0.3), 0.0, 1.0);
  gl_FragColor = vec4(uFoam * a, a);
}`;
const BOW_F = `precision highp float;
varying vec2 vUv;
uniform float uA;
${GLSL_NOISE}
void main() {
  vec2 c = vec2((vUv.x - 0.5) * 2.0, vUv.y);
  float r = length(c), h = clamp((r - 0.74) / 0.15, 0.0, 1.0);
  vec3 col = clamp(abs(mod((1.0 - h) * 4.6 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); // red on the outside
  float a = smoothstep(0.0, 0.25, h) * smoothstep(1.0, 0.75, h) * smoothstep(0.02, 0.4, vUv.y) * (0.6 + 0.5 * noise(c * 6.0));
  gl_FragColor = vec4(col * a * uA, 0.0);
}`;

export function makeFx(THREE, sky, detail, sunCol, Q) {
  const group = new THREE.Group();
  const blend = { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };
  const quadPos = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), quadIdx = [0, 1, 2, 0, 2, 3];

  // ---- sprites ----
  const P = { x: new Float32Array(MAX), y: new Float32Array(MAX), z: new Float32Array(MAX), vx: new Float32Array(MAX), vy: new Float32Array(MAX), vz: new Float32Array(MAX),
    life: new Float32Array(MAX), age: new Float32Array(MAX), s0: new Float32Array(MAX), s1: new Float32Array(MAX), r: new Float32Array(MAX), g: new Float32Array(MAX), b: new Float32Array(MAX),
    a: new Float32Array(MAX), kind: new Uint8Array(MAX), add: new Float32Array(MAX), grav: new Float32Array(MAX), drag: new Float32Array(MAX), rot: new Float32Array(MAX), spin: new Float32Array(MAX), on: new Uint8Array(MAX) };
  let next = 0;
  const sGeo = new THREE.InstancedBufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(quadPos, 3));
  sGeo.setIndex(quadIdx);
  const iPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3), iSR = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4), iCol = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
  for (const a of [iPos, iSR, iCol]) a.setUsage(THREE.DynamicDrawUsage);
  sGeo.setAttribute('iPos', iPos); sGeo.setAttribute('iSR', iSR); sGeo.setAttribute('iCol', iCol);
  sGeo.instanceCount = 0;
  // A puff of spray: a soft ball with a torn edge (r), and plain cloud for breaking up rings (g).
  const puff = (() => {
    const N = 64, data = new Uint8Array(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const cx = (x + 0.5) / N * 2 - 1, cy = (y + 0.5) / N * 2 - 1, n = fbm(cx * 2.2 + 5, cy * 2.2 + 9, 4);
      const a = clamp((1 - (Math.hypot(cx, cy) + n * 0.7)) / 0.8, 0, 1), o = (y * N + x) * 4;
      data[o] = Math.round(a * a * 255); data[o + 1] = Math.round(clamp(0.5 + n, 0, 1) * 255); data[o + 3] = 255;
    }
    const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    t.magFilter = t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  })();
  const sMat = new THREE.ShaderMaterial({ uniforms: { uSunDir: { value: sky.sun }, tPuff: { value: puff } }, vertexShader: SPRITE_V, fragmentShader: SPRITE_F, ...blend });
  const sprites = new THREE.Mesh(sGeo, sMat);
  sprites.frustumCulled = false;
  sprites.renderOrder = 6;

  function emit(kind, x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, grav = 0, drag = 0, add = 0, spin = 0) {
    const i = next;
    next = (next + 1) % MAX;
    P.on[i] = 1; P.kind[i] = kind; P.x[i] = x; P.y[i] = y; P.z[i] = z; P.vx[i] = vx; P.vy[i] = vy; P.vz[i] = vz; P.life[i] = life; P.age[i] = 0;
    P.s0[i] = s0; P.s1[i] = s1; P.r[i] = r; P.g[i] = g; P.b[i] = b; P.a[i] = a; P.grav[i] = grav; P.drag[i] = drag; P.add[i] = add; P.rot[i] = Math.random() * 6.28; P.spin[i] = spin;
  }
  // The colour of white water in this light.
  const WR = 0.5 + sunCol[0] * 0.55, WG = 0.52 + sunCol[1] * 0.5, WB = 0.6 + sunCol[2] * 0.45;
  const rnd = (a = 1) => (Math.random() - 0.5) * 2 * a, thin = !!(Q && Q.soft); // (a software rasteriser gets every other puff)
  let thinN = 0;
  const api = {
    group, emit,
    mist(x, y, z, vx, vy, vz, life, s0, s1, a = 0.5, grav = 1.5, drag = 1.2) { if (thin && (thinN ^= 1)) return; emit(0, x, y, z, vx, vy, vz, life, s0, s1, WR, WG, WB, a, grav, drag, 0, rnd(0.6)); },
    drop(x, y, z, vx, vy, vz, life, s, a = 0.9) { emit(1, x, y, z, vx, vy, vz, life, s, s * 0.5, WR * 1.2, WG * 1.2, WB * 1.2, a, 12, 0.2, 0); },
    ring(x, y, z, s0, s1, life, a = 0.8) { emit(2, x, y + 0.08, z, 0, 0, 0, life, s0, s1, WR, WG, WB, a, 0, 0, 0); },
    star(x, y, z, size, r, g, b, life = 0.05) { emit(3, x, y, z, 0, 0, 0, life, size, size * 0.6, r, g, b, 1, 0, 0, 1); },
    spark(x, y, z, vx, vy, vz, life, s, r, g, b) { emit(1, x, y, z, vx, vy, vz, life, s, 0, r, g, b, 1, 9, 0.5, 1); },
    // A burst of water: n soft clouds thrown up and out, with droplets on top.
    splash(x, y, z, size, n = 6, up = 6) {
      for (let i = 0; i < n; i++) api.mist(x + rnd(size * 0.3), y + 0.2, z + rnd(size * 0.3), rnd(up * 0.35), up * (0.45 + Math.random() * 0.6), rnd(up * 0.35), 0.7 + Math.random() * 0.7, size * 0.5, size * 1.5, 0.55, 9, 0.8);
      for (let i = 0; i < n * 2; i++) api.drop(x, y + 0.2, z, rnd(up * 0.6), up * (0.6 + Math.random() * 0.8), rnd(up * 0.6), 0.6 + Math.random() * 0.6, 0.05 + Math.random() * 0.07 * size);
      api.ring(x, y, z, size * 0.6, size * 3.2, 0.9);
    },
    confetti(x, y, z, n, colors) {
      for (let i = 0; i < n; i++) { const c = colors[i % colors.length]; emit(1, x, y, z, rnd(7), 2 + Math.random() * 8, rnd(7), 0.9 + Math.random() * 0.9, 0.16, 0.1, c[0], c[1], c[2], 1, 7, 1.4, 0.5); }
    },
  };

  // Particles emitted this instant start `dt` seconds into their flight (an impact frame).
  api.warm = (dt) => {
    for (let i = 0; i < MAX; i++) {
      if (!P.on[i] || P.age[i] !== 0) continue;
      P.age[i] = Math.min(dt, P.life[i] * 0.5);
      P.vy[i] -= P.grav[i] * dt;
      P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.z[i] += P.vz[i] * dt;
    }
  };

  // ---- streaks ----
  const tGeo = new THREE.InstancedBufferGeometry();
  tGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0]), 3));
  tGeo.setIndex(quadIdx);
  const tA = new THREE.InstancedBufferAttribute(new Float32Array(SEGS * 3), 3), tB = new THREE.InstancedBufferAttribute(new Float32Array(SEGS * 3), 3), tC = new THREE.InstancedBufferAttribute(new Float32Array(SEGS * 4), 4), tW = new THREE.InstancedBufferAttribute(new Float32Array(SEGS), 1);
  for (const a of [tA, tB, tC, tW]) a.setUsage(THREE.DynamicDrawUsage);
  tGeo.setAttribute('iA', tA); tGeo.setAttribute('iB', tB); tGeo.setAttribute('iC', tC); tGeo.setAttribute('iW', tW);
  tGeo.instanceCount = 0;
  const tMat = new THREE.ShaderMaterial({ vertexShader: STREAK_V, fragmentShader: STREAK_F, ...blend, side: THREE.DoubleSide });
  const streaks = new THREE.Mesh(tGeo, tMat);
  streaks.frustumCulled = false;
  streaks.renderOrder = 7;
  const seg = [];
  for (let i = 0; i < SEGS; i++) seg.push({ on: false, ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, r: 1, g: 1, b: 1, a: 1, w: 0.05, life: 0.4, age: 0 });
  let segNext = 0;
  api.streak = (ax, ay, az, bx, by, bz, r, g, b, a, w, life) => {
    const s = seg[segNext];
    segNext = (segNext + 1) % SEGS;
    s.on = true; s.ax = ax; s.ay = ay; s.az = az; s.bx = bx; s.by = by; s.bz = bz; s.r = r; s.g = g; s.b = b; s.a = a; s.w = w; s.life = life; s.age = 0;
  };

  // ---- wakes ----
  const wakes = [0, 1].map(() => {
    const geo = new THREE.BufferGeometry(), pos = new THREE.BufferAttribute(new Float32Array(WAKE_N * 6), 3), al = new THREE.BufferAttribute(new Float32Array(WAKE_N * 2), 1), idx = [];
    pos.setUsage(THREE.DynamicDrawUsage); al.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < WAKE_N - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setAttribute('position', pos); geo.setAttribute('aA', al); geo.setIndex(idx);
    const sd = new Float32Array(WAKE_N * 2);
    for (let i = 0; i < WAKE_N; i++) { sd[i * 2] = -1; sd[i * 2 + 1] = 1; }
    geo.setAttribute('aS', new THREE.BufferAttribute(sd, 1));
    const mesh = new THREE.Mesh(geo, null);
    mesh.frustumCulled = false;
    mesh.renderOrder = -3;
    const nodes = [];
    for (let i = 0; i < WAKE_N; i++) nodes.push({ x: 0, z: 0, age: 99, k: 0 });
    return { geo, pos, al, mesh, nodes, head: 0, lx: 1e9, lz: 1e9 };
  });
  const wMat = new THREE.ShaderMaterial({ uniforms: { tDetail: { value: detail }, uFoam: { value: new THREE.Vector3(WR * 0.95, WG * 0.95, WB * 0.95) } }, vertexShader: WAKE_V, fragmentShader: WAKE_F, ...blend, side: THREE.DoubleSide });
  for (const w of wakes) { w.mesh.material = wMat; group.add(w.mesh); }

  // ---- the rainbow ----
  const bowU = { uA: { value: 0 } };
  const bowMat = new THREE.ShaderMaterial({ uniforms: bowU, vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: BOW_F, ...blend, side: THREE.DoubleSide });
  const bow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bowMat);
  bow.visible = false;
  bow.renderOrder = 5;
  let bowT = -1;
  api.rainbow = (x, y, z) => { bow.position.set(x, y, z); bow.visible = true; bowT = 0; };
  group.add(sprites, streaks, bow);

  // ---- per frame ----
  // riders: [{x, z, v, on}], the two boards (for the wakes)
  api.update = (dt, camera, sea, riders) => {
    let n = 0;
    const pa = iPos.array, sa = iSR.array, ca = iCol.array;
    for (let i = 0; i < MAX; i++) {
      if (!P.on[i]) continue;
      const age = (P.age[i] += dt), life = P.life[i];
      if (age >= life) { P.on[i] = 0; continue; }
      const k = age / life;
      if (P.drag[i]) { const d = Math.exp(-P.drag[i] * dt); P.vx[i] *= d; P.vy[i] *= d; P.vz[i] *= d; }
      P.vy[i] -= P.grav[i] * dt;
      P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.z[i] += P.vz[i] * dt;
      P.rot[i] += P.spin[i] * dt;
      const kind = P.kind[i], fade = kind === 0 ? Math.min(1, k * 8) * (1 - k) * (1 - k) : kind === 2 ? 1 - k : kind === 3 ? 1 : 1 - k * k * k;
      pa[n * 3] = P.x[i]; pa[n * 3 + 1] = P.y[i]; pa[n * 3 + 2] = P.z[i];
      sa[n * 4] = P.s0[i] + (P.s1[i] - P.s0[i]) * (kind === 2 ? 1 - (1 - k) * (1 - k) : k); sa[n * 4 + 1] = P.rot[i]; sa[n * 4 + 2] = kind; sa[n * 4 + 3] = P.add[i];
      ca[n * 4] = P.r[i]; ca[n * 4 + 1] = P.g[i]; ca[n * 4 + 2] = P.b[i]; ca[n * 4 + 3] = P.a[i] * fade;
      n++;
    }
    sGeo.instanceCount = n;
    iPos.needsUpdate = iSR.needsUpdate = iCol.needsUpdate = true;
    sprites.visible = n > 0;

    n = 0;
    for (let i = 0; i < SEGS; i++) {
      const s = seg[i];
      if (!s.on) continue;
      s.age += dt;
      if (s.age >= s.life) { s.on = false; continue; }
      const k = 1 - s.age / s.life;
      tA.array[n * 3] = s.ax; tA.array[n * 3 + 1] = s.ay; tA.array[n * 3 + 2] = s.az;
      tB.array[n * 3] = s.bx; tB.array[n * 3 + 1] = s.by; tB.array[n * 3 + 2] = s.bz;
      tC.array[n * 4] = s.r; tC.array[n * 4 + 1] = s.g; tC.array[n * 4 + 2] = s.b; tC.array[n * 4 + 3] = s.a * k * k;
      tW.array[n] = s.w * (0.4 + 0.6 * k);
      n++;
    }
    tGeo.instanceCount = n;
    tA.needsUpdate = tB.needsUpdate = tC.needsUpdate = tW.needsUpdate = true;
    streaks.visible = n > 0;

    for (let wi = 0; wi < 2; wi++) {
      const w = wakes[wi], rd = riders[wi];
      if (rd.on && Math.hypot(rd.x - w.lx, rd.z - w.lz) > 0.75) {
        w.head = (w.head + 1) % WAKE_N;
        const nd = w.nodes[w.head];
        nd.x = rd.x; nd.z = rd.z; nd.age = 0; nd.k = clamp(rd.v / 7, 0.15, 1);
        w.lx = rd.x; w.lz = rd.z;
      }
      const pos = w.pos.array, al = w.al.array;
      let px = rd.x, pz = rd.z;
      for (let j = 0; j < WAKE_N; j++) {
        const nd = w.nodes[(w.head - j + WAKE_N * 2) % WAKE_N], o = j * 6;
        nd.age += dt;
        let dx = px - nd.x, dz = pz - nd.z;
        const l = Math.hypot(dx, dz) || 1;
        dx /= l; dz /= l;
        const live = nd.age < WAKE_LIFE && l < 6, half = live ? 0.55 + nd.age * 0.6 : 0, y = live ? sea.height(nd.x, nd.z) + 0.07 : 0;
        pos[o] = nd.x - dz * half; pos[o + 1] = y; pos[o + 2] = nd.z + dx * half;
        pos[o + 3] = nd.x + dz * half; pos[o + 4] = y; pos[o + 5] = nd.z - dx * half;
        al[j * 2] = al[j * 2 + 1] = live ? nd.k * Math.min(1, j * 0.5 + 0.2) * Math.pow(1 - nd.age / WAKE_LIFE, 1.5) : 0;
        if (live) { px = nd.x; pz = nd.z; }
      }
      w.pos.needsUpdate = w.al.needsUpdate = true;
    }

    if (bowT >= 0) {
      bowT += dt;
      bowU.uA.value = clamp((bowT - 0.2) * 2.2, 0, 0.85);
      bow.scale.set(44, 22, 1);
      bow.rotation.set(0, Math.atan2(camera.position.x - bow.position.x, camera.position.z - bow.position.z), 0);
    }
  };
  api.dispose = () => {
    puff.dispose(); sGeo.dispose(); sMat.dispose(); tGeo.dispose(); tMat.dispose(); wMat.dispose(); bow.geometry.dispose(); bowMat.dispose();
    for (const w of wakes) w.geo.dispose();
  };
  return api;
}
