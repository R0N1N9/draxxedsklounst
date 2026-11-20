// BREAK POINT — the water you see. One polar sheet of triangles that follows the camera
// (fine at your feet, coarse at the horizon), pushed into shape by the shared Gerstner code
// in the vertex shader and lit per pixel: the baked sky by Fresnel, a road of glitter under
// the sun, green light coming through the faces that stand between you and it, lace foam
// where the surface folds, turquoise shallows and a wash of foam on the sand, the soft
// shadows of the two riders, and haze with distance.
import { TAU, mulberry32 } from '../../kit.js';
import { SEA_GLSL, SHORE_Z } from './sea.js';
import { SKY_GLSL, HAZE_GLSL, SUN_COLOR } from './sky.js';

const RINGS = 216, SEGS = 256, R_MAX = 5200, GROW = 5.4;
const SHORE = `float shoreDepth(vec2 p) { return (p.y - (${SHORE_Z.toFixed(1)} + 0.00105 * p.x * p.x)) * 0.055; }`;

const VERT = `
uniform vec2 uCenter;
varying vec3 vW;
varying vec2 vP0;
varying float vK;
${SEA_GLSL}
${SHORE}
void main() {
  vec2 p0 = position.xz + uCenter;
  float depth = shoreDepth(p0);
  float k = (1.0 - smoothstep(380.0, 1000.0, length(position.xz))) * smoothstep(0.1, 3.0, depth);
  vec3 d = seaDisp(p0) * k;
  // the wash: the waterline breathes up and down the sand
  d.y += (0.16 * sin(uSea.x * 0.55 + p0.x * 0.021) + 0.07 * sin(uSea.x * 0.93 - p0.x * 0.057)) * (1.0 - smoothstep(0.0, 2.5, depth));
  vW = vec3(p0.x + d.x, d.y, p0.y + d.z);
  vP0 = p0; vK = k;
  gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
}`;

const FRAG = `precision highp float;
uniform vec3 uCam, uSunDir, uSunCol;
uniform sampler2D tDetail;
uniform vec4 uCast[2];  // each rider: feet (xyz), height (0 = none)
uniform vec3 uTint[2];  // and the colour their board throws on the water
varying vec3 vW;
varying vec2 vP0;
varying float vK;
${SEA_GLSL}
${SHORE}
${SKY_GLSL}
${HAZE_GLSL}
// How much sun reaches w past a standing figure: closest pass of the sun ray to the capsule.
float shade(vec3 w, vec4 c) {
  vec3 a = c.xyz - w;
  float t = clamp(dot(a + vec3(0.0, c.w * 0.5, 0.0), uSunDir), 0.0, 40.0);
  float y = clamp(uSunDir.y * t - a.y, 0.0, c.w);
  t = clamp(dot(a + vec3(0.0, y, 0.0), uSunDir), 0.0, 40.0);
  vec3 q = uSunDir * t - a;
  q.y -= clamp(q.y, 0.0, c.w);
  float r = 0.42 + t * 0.012;
  return 1.0 - (1.0 - smoothstep(r * 0.55, r + 0.3 + t * 0.03, length(q))) * step(0.01, c.w) * (1.0 - t / 40.0);
}
void main() {
  vec3 N; float J, h;
  seaShape(vP0, vK, N, J, h);
  vec3 V = uCam - vW;
  float dist = length(V), t = uSea.x;
  V /= dist;
  float far = smoothstep(30.0, 520.0, dist);
  vec4 d1 = texture2D(tDetail, vP0 * 0.031 + t * vec2(0.011, 0.017));
  vec4 d2 = texture2D(tDetail, vP0 * 0.0093 + t * vec2(-0.006, 0.0045) + 0.37);
  vec4 d3 = texture2D(tDetail, vP0 * 0.13 + t * vec2(-0.025, 0.04) + 0.71);
  vec2 rip = (d1.xy - 0.5) + (d2.xy - 0.5) * 1.3 + (d3.xy - 0.5) * 0.55 * (1.0 - far);
  N = normalize(N + vec3(rip.x, 0.0, rip.y) * mix(0.46, 0.2, far) * (0.3 + 0.7 * uSea.y));
  float ndv = max(dot(N, V), 0.0), sunN = max(dot(N, uSunDir), 0.0);
  float sh = shade(vW, uCast[0]) * shade(vW, uCast[1]);

  // what the surface mirrors
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 refl = skyTex(normalize(R + vec3(0.0, 0.03, 0.0)));
  float sd = max(dot(R, uSunDir), 0.0);
  float glit = pow(sd, 1500.0) * 80.0 + pow(sd, 200.0) * 3.2 + pow(sd, 22.0) * 0.2;

  // what is under it
  float depth = shoreDepth(vW.xz), shallow = 1.0 - smoothstep(0.0, 4.5, depth);
  vec3 body = mix(vec3(0.005, 0.045, 0.075), vec3(0.01, 0.15, 0.165), clamp(h * 0.2 + 0.45, 0.0, 1.0));
  body += vec3(0.012, 0.14, 0.14) * sunN * 0.55 * sh;
  // the light that comes THROUGH a wave: looking sunwards at water that stands up thin
  float through = pow(clamp(dot(V, -normalize(uSunDir + N * 0.5)), 0.0, 1.0), 2.4) * smoothstep(-0.5, 2.3, h) * (0.3 + 3.2 * clamp(1.0 - N.y, 0.0, 0.45));
  body += vec3(0.04, 0.62, 0.42) * through * 1.7 * sh;
  body = mix(body, vec3(0.05, 0.36, 0.34) * (0.45 + sunN * 1.3), shallow * 0.85);
  vec3 col = mix(body, refl, fres) + uSunCol * glit * (0.25 + 0.75 * fres) * sh;

  // each board glows a little in its rider's colour
  for (int i = 0; i < 2; i++) {
    vec2 g = vW.xz - uCast[i].xz;
    col += uTint[i] * exp(-dot(g, g) * 0.09) * 0.5 * step(0.01, uCast[i].w);
  }

  // foam: where the surface folds, in streaks on the high water, and along the sand
  float lace = d3.z * 0.55 + d1.z * 0.75;
  float foam = smoothstep(0.8, 0.36, J) * (0.5 + lace) + smoothstep(0.7, 2.6, h) * smoothstep(0.82, 1.2, lace + d2.w * 0.6) * 0.75;
  float band = sin(depth * 2.6 + t * 1.25 + d2.w * 3.0 + vP0.x * 0.02);
  foam += (smoothstep(0.55, 1.0, band) * (0.35 + lace) * smoothstep(4.5, 0.6, depth) + smoothstep(0.55, 0.05, depth) * (0.6 + lace)) * step(-0.3, depth);
  foam = clamp(foam, 0.0, 1.0);
  vec3 foamCol = vec3(0.92, 0.9, 0.88) * (uSunCol * (0.3 + sunN * 2.2) * sh + vec3(0.2, 0.26, 0.4));
  col = mix(col, foamCol, foam);
  col *= mix(0.72, 1.0, sh);

  col = mix(col, hazeColor(-V, uSunDir), 1.0 - exp(-dist * 0.0012));
  gl_FragColor = vec4(col, 1.0);
}`;

// Tileable ripple map: normal (rg), lace foam (b), blotches (a).
function detailTexture(THREE, seed) {
  const S = 256, rng = mulberry32(seed), data = new Uint8Array(S * S * 4);
  const waves = [];
  for (let i = 0; i < 22; i++) {
    const kx = Math.round((rng() - 0.5) * 26), ky = Math.round((rng() - 0.5) * 26), k = Math.hypot(kx, ky);
    if (k < 2) { i--; continue; }
    waves.push({ kx, ky, a: 1 / Math.pow(k, 1.15), ph: rng() * TAU });
  }
  const C = 9, cells = [];
  for (let i = 0; i < C * C; i++) cells.push([rng(), rng()]);
  const blot = [0, 1, 2, 3].map(() => ({ kx: Math.round((rng() - 0.5) * 6) || 1, ky: Math.round((rng() - 0.5) * 6) || 2, ph: rng() * TAU }));
  const sinT = new Float32Array(S), cosT = new Float32Array(S);
  for (let i = 0; i < S; i++) { sinT[i] = Math.sin((i / S) * TAU); cosT[i] = Math.cos((i / S) * TAU); }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let gx = 0, gy = 0;
    for (let i = 0; i < waves.length; i++) {
      const w = waves[i], ph = (((w.kx * x + w.ky * y) % S) + S) % S; // integer wavenumbers: the phase is a table index
      const s = sinT[ph] * Math.cos(w.ph) + cosT[ph] * Math.sin(w.ph);
      gx -= w.a * w.kx * s; gy -= w.a * w.ky * s;
    }
    // lace: the seams between cells, like the net of foam a broken wave leaves behind
    const u = (x / S) * C, v = (y / S) * C, cx = Math.floor(u), cy = Math.floor(v);
    let f1 = 9, f2 = 9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const c = cells[((cy + j + C) % C) * C + ((cx + i + C) % C)], dx = cx + i + c[0] - u, dy = cy + j + c[1] - v, d = Math.hypot(dx, dy);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    const seam = 1 - Math.min(1, Math.max(0, (f2 - f1 - 0.02) / 0.2));
    let b = 0;
    for (const q of blot) b += Math.cos(((q.kx * x + q.ky * y) / S) * TAU + q.ph);
    const o = (y * S + x) * 4;
    data[o] = Math.max(0, Math.min(255, 127.5 + gx * 30));
    data[o + 1] = Math.max(0, Math.min(255, 127.5 + gy * 30));
    data[o + 2] = Math.round(seam * seam * 255);
    data[o + 3] = Math.max(0, Math.min(255, 127.5 + b * 40));
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

export function makeOcean(THREE, sea, sky, seed, tints) {
  const n = (RINGS + 1) * SEGS, pos = new Float32Array(n * 3), idx = new Uint32Array(RINGS * SEGS * 6);
  const e = Math.exp(GROW) - 1;
  for (let i = 0; i <= RINGS; i++) {
    const r = i === RINGS ? 9000 : (R_MAX * (Math.exp((GROW * i) / RINGS) - 1)) / e;
    for (let j = 0; j < SEGS; j++) {
      const a = ((j + (i & 1) * 0.5) / SEGS) * TAU, o = (i * SEGS + j) * 3;
      pos[o] = Math.cos(a) * r; pos[o + 2] = Math.sin(a) * r;
    }
  }
  let q = 0;
  for (let i = 0; i < RINGS; i++) for (let j = 0; j < SEGS; j++) {
    const a = i * SEGS + j, b = i * SEGS + ((j + 1) % SEGS), c = a + SEGS, d = b + SEGS;
    idx[q++] = a; idx[q++] = b; idx[q++] = c; idx[q++] = b; idx[q++] = d; idx[q++] = c;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const detail = detailTexture(THREE, seed);
  const uniforms = {
    ...sea.uniforms,
    uCenter: { value: new THREE.Vector2() }, uCam: { value: new THREE.Vector3() }, uSunDir: { value: sky.sun }, uSunCol: { value: new THREE.Vector3(...SUN_COLOR) },
    tDetail: { value: detail }, tSky: { value: sky.texture },
    uCast: { value: [new THREE.Vector4(), new THREE.Vector4()] }, uTint: { value: tints },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -5;
  return {
    mesh, uniforms,
    update(camera) { uniforms.uCenter.value.set(camera.position.x, camera.position.z); uniforms.uCam.value.copy(camera.position); },
    dispose() { geo.dispose(); mat.dispose(); detail.dispose(); },
  };
}
