// THE DEEP — the reef in meshes: the seabed, rock, coral, the arches, the wreck and the
// kelp. Built once from world.js's numbers; nothing here moves except through its shader
// (kelp and soft coral sway, the kraken's wake bends the kelp).
import { clamp, lerp, smoothstep, noise2, fbm, makeRng, hashSeed } from '../../kit.js';
import { heightAt, HULL, hullHalfBeam } from './world.js';
import { WATER_GLSL, VERT_COMMON } from './shaders.js';

// ---- geometry helpers
function paint(g, r, gg, b) {
  const n = g.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = r; c[i * 3 + 1] = gg; c[i * 3 + 2] = b; }
  g.setAttribute('color', new (g.attributes.position.constructor)(c, 3));
  return g;
}
function merge(THREE, list) {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array.subarray(0, c * 3), o * 3);
    if (!g.attributes.normal) g.computeVertexNormals();
    nrm.set(g.attributes.normal.array.subarray(0, c * 3), o * 3);
    if (g.attributes.color) col.set(g.attributes.color.array.subarray(0, c * 3), o * 3); else col.fill(1, o * 3, (o + c) * 3);
    o += c;
  }
  for (const g of list) g.dispose();
  for (const g of parts) g.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}
// A displaced blob: rock (faceted, rough) or coral (smooth, ridged).
function blob(THREE, seed, kind) {
  const g = kind === 'rock' ? new THREE.IcosahedronGeometry(1, 2) : new THREE.SphereGeometry(1, 22, 14);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const l = v.length() || 1;
    v.multiplyScalar(1 / l);
    let d;
    if (kind === 'rock') d = 1 + 0.32 * fbm(v.x * 1.6 + seed, v.y * 1.6 + v.z * 1.3, 4) + 0.12 * noise2(v.x * 5 + seed, v.z * 5 - v.y * 3);
    else {
      // brain coral: meandering grooves over a squashed dome
      const m = Math.sin((noise2(v.x * 2.2 + seed, v.z * 2.2 + v.y) * 4 + v.y * 2) * 5);
      d = 1 + 0.045 * m + 0.08 * noise2(v.x * 1.5, v.z * 1.5 + seed);
      if (v.y < -0.2) d *= 0.75 + 0.25 * smoothstep(-1, -0.2, v.y);
    }
    v.multiplyScalar(d);
    if (kind !== 'rock') v.y *= 0.72;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
// A static tube through points with per-point radius, roughened by noise.
function tube(THREE, pts, radii, m, rough, seed) {
  const n = pts.length, pos = [], idx = [];
  let nx = 0, ny = 1, nz = 0;
  for (let k = 0; k < n; k++) {
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    const dp = nx * tx + ny * ty + nz * tz;
    nx -= tx * dp; ny -= ty * dp; nz -= tz * dp;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
    for (let j = 0; j <= m; j++) {
      const ang = (j / m) * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang);
      const ox = nx * ca + bx * sa, oy = ny * ca + by * sa, oz = nz * ca + bz * sa;
      const c = pts[k];
      const r = radii[k] * (1 + rough * fbm(c[0] * 0.4 + ox * 1.3 + seed, c[1] * 0.4 + oy * 1.3 + c[2] * 0.3 + oz, 3));
      pos.push(c[0] + ox * r, c[1] + oy * r, c[2] + oz * r);
    }
  }
  for (let k = 0; k < n - 1; k++) for (let j = 0; j < m; j++) { const a = k * (m + 1) + j, b = a + m + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------------------
const KELP_VERT = VERT_COMMON + `
attribute float aLeaf;
attribute vec2 aKelp;
uniform float uTime;
uniform vec4 uWake;
varying float vLeaf;
varying float vH;
void main() {
  vec3 p = instPos(position);
  vec3 n = instNrm(normal);
  vec4 w = modelMatrix * vec4(p, 1.0);
  vec3 base = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float h = max(w.y - base.y, 0.0), k = pow(h / 9.0, 1.35);
  float ph = aKelp.x;
  // the surge: a long slow lean, and a shorter shiver on top
  vec2 sway = vec2(sin(uTime * 0.5 + ph + h * 0.13), cos(uTime * 0.37 + ph * 1.7 + h * 0.1) * 0.6) * 1.3 + vec2(sin(uTime * 1.7 + ph * 3.0 + h * 0.6), 0.0) * 0.18;
  // the kraken's wake shoves the whole forest away from it
  vec3 wd = base - uWake.xyz;
  float wl = length(wd.xz);
  sway += normalize(wd.xz + 0.001) * uWake.w * 5.5 * exp(-wl / 34.0) * (0.75 + 0.25 * sin(uTime * 2.3 + ph));
  w.xz += sway * k;
  w.y -= dot(sway, sway) * k * 0.06;
  w.x += sin(uTime * 2.6 + ph + h) * aLeaf * 0.12;
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  vLeaf = aLeaf;
  vH = h / 9.0;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const KELP_FRAG = `
precision highp float;
varying vec3 vW;
varying vec3 vN;
varying float vLeaf;
varying float vH;
${WATER_GLSL}
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(uCam - vW);
  if (dot(n, v) < 0.0) n = -n;
  float vein = texture2D(tNoise, vec2(vLeaf * 0.6, vW.y * 0.4)).g;
  vec3 alb = mix(vec3(0.3, 0.24, 0.06), vec3(0.52, 0.42, 0.12), vein) * (0.65 + 0.45 * vH);
  vec3 col = litWater(alb, vW, n, 0.9, 0.6, 0.6);
  // sunlight through the blade: kelp glows gold against the light
  float back = pow(max(dot(-v, uL), 0.0), 2.5);
  col += vec3(0.85, 0.6, 0.15) * sunAt(vW.y) * back * (0.35 + 0.5 * vein) * sunShadow(vW, 0.002) * 0.5;
  gl_FragColor = vec4(waterFog(col, vW, 1.0), length(vW - uCam));
}`;

function kelpGeometry(THREE) {
  const pos = [], nrm = [], leaf = [], idx = [];
  const H = 9, seg = 16;
  const add = (x, y, z, l) => { pos.push(x, y, z); nrm.push(0, 0, 1); leaf.push(l); return pos.length / 3 - 1; };
  // the stipe: a narrow ribbon
  for (let i = 0; i <= seg; i++) { const y = (i / seg) * H, w = 0.05; add(-w, y, 0, 0); add(w, y, 0, 0); }
  for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  // blades: long tapering leaves off alternate sides, each a fan of quads
  for (let i = 1; i < seg; i++) {
    const y0 = (i / seg) * H, side = i % 2 ? 1 : -1, len = 0.9 + 0.6 * Math.sin((i / seg) * Math.PI), ang = side * 0.55 + (i % 3) * 0.3;
    const dx = Math.sin(ang), dz = Math.cos(ang) * 0.4;
    const st = 4, first = pos.length / 3;
    for (let k = 0; k <= st; k++) {
      const u = k / st, wdt = 0.16 * Math.sin(Math.PI * Math.min(1, u * 1.15 + 0.08)) + 0.01;
      const x = dx * len * u, y = y0 + len * u * 0.85, z = dz * len * u;
      add(x - dz * wdt, y - wdt * 0.3, z + dx * wdt * 0.2, u);
      add(x + dz * wdt, y + wdt * 0.3, z - dx * wdt * 0.2, u);
    }
    for (let k = 0; k < st; k++) { const a = first + k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aLeaf', new THREE.Float32BufferAttribute(leaf, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------------------
export function buildReef(THREE, W, mats, U, seed, lean) {
  const group = new THREE.Group();
  const rng = makeRng(hashSeed(seed, 'reef-look')); // looks only: both clients may differ
  const caster = (o) => { o.layers.enable(1); return o; };
  const geos = [];
  const keep = (g) => { geos.push(g); return g; };

  // ---- the seabed: dense over the arena, coarse out to the edge of sight
  const axis = (a, b, inner, step) => {
    const out = [];
    for (let x = a; x < -inner; x += Math.max(step, (-inner - x) * 0.18)) out.push(x);
    for (let x = -inner; x <= inner; x += step) out.push(x);
    let x = inner + step;
    while (x < b) { out.push(x); x += Math.max(step, (x - inner) * 0.18); }
    out.push(b);
    return out;
  };
  const xs = axis(-120, 150, 44, lean ? 1.6 : 0.85), zs = axis(-130, 130, 52, lean ? 1.8 : 0.95);
  const nx = xs.length, nz = zs.length;
  const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), idx = [];
  const hs = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) hs[j * nx + i] = heightAt(xs[i], zs[j]);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = xs[i], z = zs[j], y = hs[k];
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
    // crevices are darker: compare with the neighbours
    const ia = Math.max(0, i - 2), ib = Math.min(nx - 1, i + 2), ja = Math.max(0, j - 2), jb = Math.min(nz - 1, j + 2);
    const avg = (hs[j * nx + ia] + hs[j * nx + ib] + hs[ja * nx + i] + hs[jb * nx + i]) / 4;
    col[k * 3] = 0.5 + 0.5 * noise2(x * 0.08 + 4, z * 0.08);              // where sand gathers
    col[k * 3 + 1] = 0.75 + 0.25 * noise2(x * 0.15, z * 0.15 + 9);        // rock tint
    col[k * 3 + 2] = clamp(0.75 + (y - avg) * 0.35, 0, 1);                 // ambient occlusion
  }
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const tg = keep(new THREE.BufferGeometry());
  tg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  tg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  tg.setIndex(idx);
  tg.computeVertexNormals();
  const terrain = caster(new THREE.Mesh(tg, mats.terrain));
  group.add(terrain);

  // ---- instanced pieces
  const dummy = new THREE.Object3D(), c3 = new THREE.Color();
  const inst = (geo, mat, list, place, cast = true) => {
    if (!list.length) return null;
    const m = new THREE.InstancedMesh(keep(geo), mat, list.length);
    list.forEach((it, i) => { place(it, dummy, c3); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, c3); });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    if (cast) caster(m);
    group.add(m);
    return m;
  };
  const rockGeos = [0, 1, 2].map((k) => paint(blob(THREE, k * 7.3 + 1, 'rock'), 1, 1, 1));
  const rocks = W.decor.boulder.concat(W.decor.outcrop);
  for (let v = 0; v < 3; v++) {
    inst(rockGeos[v], mats.rock, rocks.filter((_, i) => i % 3 === v), (r, d, c) => {
      d.position.set(r.x, r.y, r.z);
      d.rotation.set(r.rot * 0.3, r.rot, r.rot * 0.7);
      d.scale.set(r.r * 1.12, r.r * 0.95, r.r * 1.05);
      const k = 0.72 + rng() * 0.25;
      c.setRGB(0.5 * k, 0.45 * k, 0.4 * k);
    });
  }
  // brain coral
  const coralHues = [[0.85, 0.55, 0.25], [0.65, 0.3, 0.55], [0.9, 0.75, 0.35], [0.45, 0.6, 0.35], [0.9, 0.42, 0.3]];
  inst(paint(blob(THREE, 3.1, 'coral'), 1, 1, 1), mats.coral, W.decor.brain, (r, d, c) => {
    d.position.set(r.x, r.y, r.z);
    d.rotation.set(0, r.rot, 0);
    d.scale.setScalar(r.r);
    const h = coralHues[Math.floor(r.hue * coralHues.length) % coralHues.length];
    c.setRGB(h[0], h[1], h[2]);
  });
  // branching coral: a little tree of tapering cylinders
  const branchGeo = (() => {
    const parts = [], r2 = makeRng(77);
    const limb = (x, y, z, dx, dy, dz, len, rad, depth) => {
      const g = new THREE.CylinderGeometry(rad * 0.7, rad, len, 5, 1, true);
      g.translate(0, len / 2, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize());
      g.applyQuaternion(q);
      g.translate(x, y, z);
      parts.push(paint(g, 1, 1, 1));
      if (depth <= 0) return;
      const ex = x + dx * len, ey = y + dy * len, ez = z + dz * len;
      for (let i = 0; i < 2; i++) {
        const a = r2() * 6.28;
        limb(ex, ey, ez, dx + Math.cos(a) * 0.6, dy + 0.3, dz + Math.sin(a) * 0.6, len * 0.75, rad * 0.7, depth - 1);
      }
    };
    for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.28; limb(0, 0, 0, Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5, 0.6, 0.085, 2); }
    return merge(THREE, parts);
  })();
  const branchHues = [[0.95, 0.5, 0.35], [0.8, 0.75, 0.9], [0.98, 0.82, 0.45], [0.55, 0.85, 0.8]];
  inst(branchGeo, mats.coral, W.decor.branch, (r, d, c) => {
    d.position.set(r.x, r.y - 0.1, r.z);
    d.rotation.set(0, r.rot, 0);
    d.scale.setScalar(r.s * 1.4);
    const h = branchHues[Math.floor(r.hue * branchHues.length) % branchHues.length];
    c.setRGB(h[0], h[1], h[2]);
  });
  // sea fans: a fine lattice cut by the shader, swaying
  const fanGeo = (() => {
    const g = new THREE.CircleGeometry(1, 24, 0, Math.PI);
    g.rotateZ(0);
    g.translate(0, 0.05, 0);
    return paint(g, 1, 1, 1);
  })();
  const fanMat = mats.reefFan;
  if (fanMat) inst(fanGeo, fanMat, W.decor.fan, (r, d, c) => {
    d.position.set(r.x, r.y - 0.05, r.z);
    d.rotation.set(0, r.rot, 0);
    d.scale.setScalar(r.s * 1.2);
    const fh = [[0.75, 0.25, 0.55], [0.9, 0.55, 0.25], [0.95, 0.8, 0.4]][Math.floor(r.hue * 3) % 3];
    c.setRGB(fh[0], fh[1], fh[2]);
  }, false);
  // tube sponges
  const spongeGeo = (() => {
    const parts = [];
    for (let i = 0; i < 4; i++) {
      const h = 0.7 + i * 0.25, a = i * 1.7, g = new THREE.CylinderGeometry(0.16, 0.12, h, 10, 1, true);
      g.translate(Math.cos(a) * 0.2, h / 2, Math.sin(a) * 0.2);
      parts.push(paint(g, 1, 1, 1));
    }
    return merge(THREE, parts);
  })();
  inst(spongeGeo, mats.coralSway, W.decor.sponge, (r, d, c) => {
    d.position.set(r.x, r.y - 0.05, r.z);
    d.rotation.set(0, r.rot, 0);
    d.scale.setScalar(r.s * 1.2);
    const sh = [[0.85, 0.65, 0.2], [0.6, 0.35, 0.7], [0.4, 0.6, 0.75]][Math.floor(r.hue * 3) % 3];
    c.setRGB(sh[0], sh[1], sh[2]);
  }, false);
  // sea grass / soft coral tufts
  const tuftGeo = (() => {
    const parts = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * 6.28, g = new THREE.PlaneGeometry(0.06, 0.6 + (i % 3) * 0.2, 1, 3);
      g.translate(0, 0.35, 0);
      g.rotateZ(Math.cos(a) * 0.35);
      g.rotateY(a);
      g.translate(Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08);
      parts.push(paint(g, 1, 1, 1));
    }
    return merge(THREE, parts);
  })();
  inst(tuftGeo, mats.coralSway, W.decor.grass, (r, d, c) => {
    d.position.set(r.x, r.y - 0.05, r.z);
    d.rotation.set(0, r.rot, 0);
    d.scale.setScalar(r.s * 1.3);
    c.setRGB(0.45 + rng() * 0.2, 0.55 + rng() * 0.2, 0.25);
  }, false);

  // ---- arches
  for (const a of W.arches) {
    const pts = [], radii = [];
    for (let k = 0; k <= 24; k++) {
      const t = k / 24, ang = t * Math.PI, lx = -Math.cos(ang) * a.span * 0.5, ly = Math.sin(ang) * a.rise;
      pts.push([a.x + Math.cos(a.yaw) * lx, a.y + ly - (k === 0 || k === 24 ? 1.2 : 0), a.z - Math.sin(a.yaw) * lx]);
      radii.push(a.r * (1.3 - 0.4 * Math.sin(ang)) * (k === 0 || k === 24 ? 1.5 : 1));
    }
    const g = paint(tube(THREE, pts, radii, 14, 0.35, a.z), 0.48, 0.42, 0.37);
    group.add(caster(new THREE.Mesh(keep(g), mats.rock)));
  }

  // ---- the wreck
  const wreck = buildWreck(THREE, W, mats, keep);
  group.add(wreck);

  // ---- kelp
  const kg = keep(kelpGeometry(THREE));
  const kelpPh = new Float32Array(W.kelp.length * 2);
  W.kelp.forEach((k, i) => { kelpPh[i * 2] = k.phase; kelpPh[i * 2 + 1] = k.h; });
  kg.setAttribute('aKelp', new THREE.InstancedBufferAttribute(kelpPh, 2));
  const kelpMat = mats.shader({ vertexShader: KELP_VERT, fragmentShader: KELP_FRAG, uniforms: { uWake: U.uWake }, side: THREE.DoubleSide });
  const kelp = new THREE.InstancedMesh(kg, kelpMat, W.kelp.length);
  W.kelp.forEach((k, i) => {
    dummy.position.set(k.x, k.y - 0.2, k.z);
    dummy.rotation.set(0, k.phase * 3, 0);
    dummy.scale.setScalar(k.h / 9);
    dummy.updateMatrix();
    kelp.setMatrixAt(i, dummy.matrix);
  });
  kelp.instanceMatrix.needsUpdate = true;
  kelp.frustumCulled = false; // the sway moves it outside its bounds
  group.add(kelp);

  return { group, terrain, kelp, dispose() { for (const g of geos) g.dispose(); } };
}

// ---------------------------------------------------------------------------------------
// A small steel trawler, sunk upright with a list: a hull you can swim into through the
// hatch and out of through the breach on the deep side.
function buildWreck(THREE, W, mats, keep) {
  const w = W.wreck, H = HULL;
  const g = new THREE.Group();
  g.position.set(w.x, w.y, w.z);
  g.rotation.set(w.pitch, w.yaw, w.roll, 'YXZ');
  // hull shell: stations along z, a U section at each
  const st = 34, sec = 22, pos = [], col = [], idx = [];
  for (let i = 0; i <= st; i++) {
    const z = -H.half + (i / st) * (H.len - 0.6);
    const b = Math.max(0.05, hullHalfBeam(z));
    for (let j = 0; j <= sec; j++) {
      const v = j / sec * 2 - 1, th = Math.abs(v) * Math.PI / 2, s = Math.sign(v) || 1;
      const x = s * b * Math.pow(Math.sin(th), 0.55), y = H.depth * (1 - Math.cos(th)) * (1 - 0.06 * Math.sin(th * 2));
      const yy = y + 0.25 * Math.pow(clamp((z - 3) / 5.5, 0, 1), 2) * (y / H.depth); // a sheer that lifts at the bow
      pos.push(x, yy, z);
      // paint: antifouling red below, faded teal topsides, a white band at the gunwale
      const band = yy > H.depth - 0.35 ? 2 : yy > 1.15 ? 1 : 0;
      if (band === 2) col.push(0.82, 0.8, 0.74); else if (band === 1) col.push(0.18, 0.38, 0.42); else col.push(0.5, 0.17, 0.12);
    }
  }
  const [bz0, bz1, by0, by1] = H.breach;
  for (let i = 0; i < st; i++) for (let j = 0; j < sec; j++) {
    const a = i * (sec + 1) + j, b = a + sec + 1;
    // leave the breach open (a ragged edge from noise)
    const cx = (pos[a * 3] + pos[(b + 1) * 3]) / 2, cy = (pos[a * 3 + 1] + pos[(b + 1) * 3 + 1]) / 2, cz = (pos[a * 3 + 2] + pos[(b + 1) * 3 + 2]) / 2;
    const rag = noise2(cz * 1.7, cy * 1.7) * 0.4;
    if (cx > 0 && cz > bz0 - rag && cz < bz1 + rag && cy > by0 - rag && cy < by1 + rag) continue;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const hg = keep(new THREE.BufferGeometry());
  hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  hg.setIndex(idx);
  hg.computeVertexNormals();
  const parts = [new THREE.Mesh(hg, mats.wreck)];
  // transom
  {
    const sh = new THREE.Shape(), z = -H.half, b = hullHalfBeam(z);
    sh.moveTo(-b, H.depth);
    for (let j = 0; j <= 10; j++) { const th = (1 - j / 10) * Math.PI / 2; sh.lineTo(-b * Math.pow(Math.sin(th), 0.55), H.depth * (1 - Math.cos(th))); }
    for (let j = 0; j <= 10; j++) { const th = (j / 10) * Math.PI / 2; sh.lineTo(b * Math.pow(Math.sin(th), 0.55), H.depth * (1 - Math.cos(th))); }
    const tg = paint(new THREE.ShapeGeometry(sh), 0.5, 0.2, 0.14);
    tg.translate(0, 0, z);
    parts.push(new THREE.Mesh(keep(tg), mats.wreck));
  }
  // deck with the hatch cut out
  {
    const sh = new THREE.Shape();
    const zs = [];
    for (let z = -H.half + 0.15; z <= 7.4; z += 0.6) zs.push(z);
    sh.moveTo(hullHalfBeam(zs[0]) * 0.96, zs[0]);
    for (const z of zs) sh.lineTo(hullHalfBeam(z) * 0.96, z);
    for (let i = zs.length - 1; i >= 0; i--) sh.lineTo(-hullHalfBeam(zs[i]) * 0.96, zs[i]);
    const [hz0, hz1, hx] = H.hatch, hole = new THREE.Path();
    hole.moveTo(-hx, hz0); hole.lineTo(-hx, hz1); hole.lineTo(hx, hz1); hole.lineTo(hx, hz0); hole.lineTo(-hx, hz0);
    sh.holes.push(hole);
    const dg = paint(new THREE.ShapeGeometry(sh), 0.42, 0.33, 0.24);
    dg.rotateX(Math.PI / 2);
    dg.translate(0, H.deck, 0);
    parts.push(new THREE.Mesh(keep(dg), mats.wreck));
    // hatch coaming
    const cm = [];
    for (const [x, z, sx, sz] of [[0, hz0, hx * 2 + 0.3, 0.15], [0, hz1, hx * 2 + 0.3, 0.15], [-hx, (hz0 + hz1) / 2, 0.15, hz1 - hz0], [hx, (hz0 + hz1) / 2, 0.15, hz1 - hz0]]) {
      const b = new THREE.BoxGeometry(sx, 0.45, sz); b.translate(x, H.deck + 0.2, z); cm.push(paint(b, 0.3, 0.3, 0.28));
    }
    parts.push(new THREE.Mesh(keep(merge(THREE, cm)), mats.wreck));
  }
  // wheelhouse: walls, roof, dark empty windows
  {
    const wh = [];
    const box = (sx, sy, sz, x, y, z, r, gg, b) => { const bg = new THREE.BoxGeometry(sx, sy, sz); bg.translate(x, y, z); wh.push(paint(bg, r, gg, b)); };
    const y0 = H.deck, cz = -5.4;
    box(3.1, 2.5, 3.8, 0, y0 + 1.25, cz, 0.7, 0.7, 0.64);
    box(3.5, 0.18, 4.3, 0, y0 + 2.6, cz, 0.62, 0.6, 0.55);
    for (const x of [-0.9, 0.0, 0.9]) box(0.7, 0.75, 0.08, x, y0 + 1.75, cz + 1.92, 0.04, 0.05, 0.06);
    for (const s of [-1, 1]) for (const z of [-0.9, 0.6]) box(0.08, 0.7, 0.9, s * 1.57, y0 + 1.75, cz + z, 0.04, 0.05, 0.06);
    box(0.08, 1.8, 0.8, -1.57, y0 + 0.95, cz - 1.2, 0.05, 0.05, 0.05); // the door, gone
    box(0.3, 0.9, 0.3, 0.6, y0 + 3.1, cz - 0.8, 0.3, 0.3, 0.3);         // a stack
    parts.push(new THREE.Mesh(keep(merge(THREE, wh)), mats.wreck));
  }
  // the mast and its gear, leaning out over the deep
  {
    const m0 = [0, H.deck, 4.6], m1 = [2.4, H.deck + 8.5, 5.4];
    const mg = [];
    const pole = (a, b, r, c) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), cg = new THREE.CylinderGeometry(r * 0.8, r, len, 8);
      cg.translate(0, len / 2, 0);
      cg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize()));
      cg.translate(a[0], a[1], a[2]);
      mg.push(paint(cg, c[0], c[1], c[2]));
    };
    pole(m0, m1, 0.22, [0.4, 0.35, 0.3]);
    pole([0.3, H.deck + 5.5, 4.85], [-2.4, H.deck + 6.2, 1.2], 0.12, [0.4, 0.35, 0.3]); // the boom
    // rails along the gunwales, with gaps where they rusted through
    for (const s of [-1, 1]) {
      for (let z = -7.5; z < 6.5; z += 1.25) {
        if ((Math.floor(z * 3) + (s > 0 ? 1 : 0)) % 5 === 0) continue;
        const b = hullHalfBeam(z) * 0.97;
        pole([s * b, H.depth, z], [s * b, H.depth + 0.8, z], 0.035, [0.55, 0.5, 0.45]);
        pole([s * b, H.depth + 0.8, z], [s * hullHalfBeam(z + 1.25) * 0.97, H.depth + 0.8, z + 1.25], 0.03, [0.55, 0.5, 0.45]);
      }
    }
    parts.push(new THREE.Mesh(keep(merge(THREE, mg)), mats.wreck));
    // fenders: old tyres hanging off the side
    const tyres = [];
    for (const z of [-4.5, -0.8, 3]) { const t = new THREE.TorusGeometry(0.35, 0.13, 6, 14); t.rotateY(Math.PI / 2); t.translate(-hullHalfBeam(z) - 0.15, H.depth - 0.6, z); tyres.push(paint(t, 0.12, 0.12, 0.12)); }
    parts.push(new THREE.Mesh(keep(merge(THREE, tyres)), mats.wreck));
    // a torn net from the mast down over the starboard side, floats along its head rope
    const net = new THREE.PlaneGeometry(5.5, 9, 12, 18);
    const np = net.attributes.position;
    for (let i = 0; i < np.count; i++) {
      const u = np.getX(i) / 5.5 + 0.5, v = np.getY(i) / 9 + 0.5;
      let x, y;
      if (v < 0.45) { const k = v / 0.45; x = H.beam + 0.45 + (1 - k) * 1.6; y = lerp(-0.5, H.depth + 0.6, k); }
      else { const k = (v - 0.45) / 0.55; x = lerp(H.beam + 0.45, 2.3, k); y = lerp(H.depth + 0.6, H.deck + 8.2, k); }
      x += Math.sin(u * 7 + v * 3) * 0.22;
      y += Math.sin(u * 3.14) * 0.5 * (1 - v);
      np.setXYZ(i, x, y, lerp(1.6, 7.2, u) + Math.sin(v * 9) * 0.25);
    }
    net.computeVertexNormals();
    paint(net, 0.5, 0.46, 0.3);
    if (mats.net) parts.push(new THREE.Mesh(keep(net), mats.net));
    const floats = [];
    for (let i = 0; i < 6; i++) {
      const s = new THREE.SphereGeometry(0.28, 10, 8);
      s.translate(2.3 + i * 0.1, H.deck + 8.6 + Math.sin(i) * 0.3 + i * 0.05, 1.8 + i * 1.05);
      floats.push(paint(s, 0.95, 0.42, 0.12));
    }
    parts.push(new THREE.Mesh(keep(merge(THREE, floats)), mats.coral));
  }
  for (const p of parts) { p.layers.enable(1); g.add(p); }
  return g;
}
