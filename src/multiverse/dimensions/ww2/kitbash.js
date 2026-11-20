// IRON AUTUMN — construction helpers. The whole static town is a handful of merged meshes
// (one per material), so the draw-call count stays in the dozens however much rubble there is.
import { fbm, clamp } from '../../kit.js';

// Direction TO the sun: low in the west, a little to the south. Fixed, so both ends of the
// square see it side-on and neither sniper has to shoot into it.
export const SUN = (() => { const l = Math.hypot(-1, 0.3, 0.1); return { x: -1 / l, y: 0.3 / l, z: 0.1 / l }; })();

const FOG_FRAG = `
#ifdef USE_FOG
  float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  float sunAmt = max( dot( normalize( - vViewPosition ), uSunView ), 0.0 );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, mix( fogColor, uSunFog, sunAmt * sunAmt * sunAmt ), fogFactor );
#endif`;

// Fog that glows towards the sun and cools away from it: most of the picture's depth.
export function makeFogPatch(THREE) {
  const shared = { uSunView: { value: new THREE.Vector3(0, 0, -1) }, uSunFog: { value: new THREE.Color() } };
  function patch(material, key = '', extra = null) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uSunView = shared.uSunView;
      shader.uniforms.uSunFog = shared.uSunFog;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\nuniform vec3 uSunView;\nuniform vec3 uSunFog;')
        .replace('#include <fog_fragment>', FOG_FRAG);
      if (extra) extra(shader);
    };
    material.customProgramCacheKey = () => 'ww2fog' + key;
    return material;
  }
  return { shared, patch };
}

// Grime: every merged surface is darkened by slow noise and where it meets the ground.
function grime(x, y, z) {
  const n = fbm(x * 0.23 + y * 0.17, z * 0.23 - y * 0.13, 3);
  return (0.86 + n * 0.5) * (y < 0.6 ? 0.74 + 0.43 * Math.max(0, y) : 1);
}

export class Batch {
  // uvScale: texture repeats per metre (UVs are box-mapped from world position).
  constructor(THREE, uvScale = 0.4, tint = grime) {
    this.T = THREE;
    this.uvScale = uvScale;
    this.tint = tint;
    this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = [];
    this.n = 0;
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler();
    this.p = new THREE.Vector3(); this.s = new THREE.Vector3(); this.v = new THREE.Vector3();
    this.nm = new THREE.Matrix3(); this.c = new THREE.Color();
  }

  // Merge `geo` (consumed) transformed by `matrix`, coloured `color`. soot darkens upwards from soot.y0.
  add(geo, matrix, color, soot = 0) {
    const { pos, nor, uv, col, idx, v, c, nm, uvScale: k } = this;
    const P = geo.attributes.position, N = geo.attributes.normal, I = geo.index, base = this.n;
    if (matrix) nm.getNormalMatrix(matrix);
    c.set(color);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i);
      if (matrix) v.applyMatrix4(matrix);
      const x = v.x, y = v.y, z = v.z;
      pos.push(x, y, z);
      v.fromBufferAttribute(N, i);
      if (matrix) v.applyMatrix3(nm).normalize();
      nor.push(v.x, v.y, v.z);
      const ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z);
      if (ay > ax && ay > az) uv.push(x * k, z * k);
      else if (ax > az) uv.push(z * k, y * k);
      else uv.push(x * k, y * k);
      let t = this.tint ? this.tint(x, y, z) : 1;
      if (soot) t *= 1 - soot * clamp(0.25 + fbm(x * 0.4 + z * 0.4, y * 0.3 + 9, 2) * 1.6, 0, 1);
      col.push(c.r * t, c.g * t, c.b * t);
    }
    if (I) for (let i = 0; i < I.count; i++) idx.push(base + I.getX(i));
    else for (let i = 0; i < P.count; i++) idx.push(base + i);
    this.n += P.count;
    geo.dispose();
    return this;
  }

  mat(x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    this.e.set(rx, ry, rz, 'YXZ');
    return this.m.compose(this.p.set(x, y, z), this.q.setFromEuler(this.e), this.s.set(sx, sy, sz));
  }

  // Box with its centre at (x, y, z).
  box(x, y, z, w, h, d, color, ry = 0, rx = 0, rz = 0, soot = 0) {
    return this.add(new this.T.BoxGeometry(w, h, d), this.mat(x, y, z, ry, rx, rz), color, soot);
  }

  // Upright cylinder (or cone) with its centre at (x, y, z); pass rx / rz to lay it over.
  cyl(x, y, z, rTop, rBot, h, color, seg = 10, ry = 0, rx = 0, rz = 0) {
    return this.add(new this.T.CylinderGeometry(rTop, rBot, h, seg), this.mat(x, y, z, ry, rx, rz), color);
  }

  build() {
    const T = this.T, g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new T.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.n > 65535 ? new T.Uint32BufferAttribute(this.idx, 1) : new T.Uint16BufferAttribute(this.idx, 1));
    this.pos = this.nor = this.uv = this.col = this.idx = null;
    return g;
  }
}

// A length of ruined wall as one extruded outline: stepped, broken skyline and real holes
// for windows, so the sky and the sun come through. Wall space: u along, v up, depth = thickness.
//   tops(u) → standing height at u;  windows: [{ u, v, w, h, arch }] (arch: pointed head)
export function ruinWall(THREE, len, thick, tops, windows = []) {
  const step = 0.55, n = Math.max(2, Math.round(len / step)), top = new Float32Array(n);
  for (let i = 0; i < n; i++) top[i] = Math.max(0.3, Math.round(tops(((i + 0.5) / n) * len) / 0.3) * 0.3);
  const du = len / n, holes = [];
  for (const w of windows) {
    const i0 = clamp(Math.floor(w.u / du), 0, n - 1), i1 = clamp(Math.ceil((w.u + w.w) / du), 1, n);
    let min = 1e9;
    for (let i = Math.max(0, i0 - 1); i < Math.min(n, i1 + 1); i++) min = Math.min(min, top[i]);
    if (min > w.v + w.h + 0.45) holes.push(w);
    // Broken through: the opening becomes a notch in the skyline down to its sill.
    else if (min > w.v - 0.2) for (let i = i0; i < i1; i++) top[i] = Math.min(top[i], w.v + (i === i0 || i === i1 - 1 ? 0.3 : 0));
  }
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(len, 0);
  for (let i = n - 1; i >= 0; i--) {
    shape.lineTo((i + 1) * du, top[i]);
    shape.lineTo(i * du, top[i]);
  }
  shape.lineTo(0, 0);
  for (const w of holes) {
    const h = new THREE.Path();
    h.moveTo(w.u, w.v);
    if (w.arch) {
      const sh = w.h - w.w * 0.8;
      h.lineTo(w.u, w.v + sh);
      h.lineTo(w.u + w.w * 0.18, w.v + sh + w.w * 0.5);
      h.lineTo(w.u + w.w * 0.5, w.v + w.h);
      h.lineTo(w.u + w.w * 0.82, w.v + sh + w.w * 0.5);
      h.lineTo(w.u + w.w, w.v + sh);
    } else if (w.round) {
      h.moveTo(w.u + w.w, w.v + w.h / 2);
      for (let k = 1; k <= 14; k++) { const a = (k / 14) * Math.PI * 2; h.lineTo(w.u + w.w / 2 + Math.cos(a) * w.w / 2, w.v + w.h / 2 + Math.sin(a) * w.h / 2); }
    } else {
      h.lineTo(w.u, w.v + w.h);
      h.lineTo(w.u + w.w, w.v + w.h);
    }
    if (!w.round) { h.lineTo(w.u + w.w, w.v); h.lineTo(w.u, w.v); }
    shape.holes.push(h);
  }
  return { geo: new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false }), holes, top, du };
}
