// INK CITY — the printing press. The scene arrives as flat colour + sunlight (see mats.js)
// with a depth buffer; this turns it into a comic page in one full-screen pass:
//   ink     outlines wherever depth breaks or creases (1/z is linear across any flat face,
//           so its second difference is zero on a wall and jumps at an edge), and wherever
//           two flat colours meet; lines thin out with distance like a real inker's
//   tone    lit colour, Ben-Day dots through the half-light, flat violet in shadow
//   sky     painted here from the view ray: banded sunset, dotted gradients, inked clouds
//   paper   grain, a warm stock, mis-registered edges, the scope panel, the splash burst
// A quarter-size bloom of the unlit colours (windows, neon, tracers) is laid over the ink.

const VERT = 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const HEAD = 'precision highp float;\nvarying vec2 vUv;\nuniform sampler2D tSrc;\nuniform vec2 uTexel;\n';

const PREFILTER = HEAD + `
void main() {
  vec4 a = texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)), b = texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0));
  vec4 c = texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)), d = texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0));
  // Only unlit colour glows (alpha 1), and only its brightest part.
  vec3 s = a.rgb * step(0.97, a.a) + b.rgb * step(0.97, b.a) + c.rgb * step(0.97, c.a) + d.rgb * step(0.97, d.a);
  s *= 0.25;
  float m = max(s.r, max(s.g, s.b));
  gl_FragColor = vec4(min(s * smoothstep(0.55, 1.0, m), vec3(4.0)), 1.0);
}`;
const BLUR = HEAD + `
uniform vec2 uDir;
void main() {
  vec2 o1 = uDir * uTexel * 1.3846, o2 = uDir * uTexel * 3.2308;
  gl_FragColor = texture2D(tSrc, vUv) * 0.2270 + (texture2D(tSrc, vUv + o1) + texture2D(tSrc, vUv - o1)) * 0.3162
    + (texture2D(tSrc, vUv + o2) + texture2D(tSrc, vUv - o2)) * 0.0703;
}`;

const COMIC = HEAD + `
uniform sampler2D tDepth, tBloom;
uniform vec2 uRes;
uniform float uPx, uNear, uFar, uPixAng, uTime, uAspect, uTanY;
uniform mat3 uCam;
uniform vec3 uSun, uSunR, uSunU;
uniform float uScope, uSpeed, uFlash, uSudden;
uniform vec4 uSplash;
uniform vec3 uSplashCol;
const vec3 INK = vec3(0.075, 0.05, 0.14);
float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float wOf(float d) { return (uFar + uNear - (2.0 * d - 1.0) * (uFar - uNear)) / (2.0 * uNear * uFar); }
// Distance to the nearest dot centre of a screen at 'pitch' px and 'ang' radians, in cells (0 .. 0.707).
float dots(vec2 p, float pitch, float ang) {
  float c = cos(ang), s = sin(ang);
  vec2 q = mat2(c, -s, s, c) * p / pitch;
  return length(fract(q) - 0.5);
}
vec3 band(float i) {
  if (i < 0.5) return vec3(1.0, 0.89, 0.42);
  if (i < 1.5) return vec3(1.0, 0.66, 0.26);
  if (i < 2.5) return vec3(0.99, 0.38, 0.36);
  if (i < 3.5) return vec3(0.8, 0.22, 0.5);
  if (i < 4.5) return vec3(0.42, 0.17, 0.54);
  return vec3(0.19, 0.11, 0.38);
}
vec3 sky(vec3 d, vec2 fc) {
  float e = d.y;
  float x = clamp(e * 2.5 + 0.05, 0.0, 0.999) * 5.0;
  float i = floor(x), f = x - i;
  // Each band gives way to the next through a field of growing dots.
  float cov = 1.0 - smoothstep(-0.03, 0.03, dots(fc, 7.0 * uPx, 0.5) - f * 0.74);
  vec3 col = mix(band(i), band(i + 1.0), cov * step(0.04, f));
  // The sun: a flat disc on the horizon, a halo, and wedge rays round it.
  float s = dot(d, uSun);
  vec2 sv = vec2(dot(d, uSunR), dot(d, uSunU));
  float ray = step(0.5, fract(atan(sv.y, sv.x) * 2.546 + uTime * 0.012));
  col = mix(col, band(0.0), ray * smoothstep(0.86, 0.97, s) * 0.3);
  if (s > 0.9925) col = vec3(1.0, 0.97, 0.8);
  else if (s > 0.985) col = mix(col, vec3(1.0, 0.93, 0.6), 1.0 - smoothstep(0.0, 0.03, dots(fc, 5.0 * uPx, 0.2) - 0.42));
  // Clouds: long streaks, two flat tones and an ink line.
  if (e > 0.015) {
    vec2 cp = d.xz / (e + 0.22) * vec2(0.55, 1.5) + vec2(uTime * 0.006, 0.0);
    float n = vnoise(cp) * 0.6 + vnoise(cp * 2.3 + 7.1) * 0.28 + vnoise(cp * 5.1 + 3.3) * 0.12;
    n *= smoothstep(0.015, 0.14, e);
    if (n > 0.6) col = n > 0.665 ? vec3(0.62, 0.24, 0.52) : vec3(1.0, 0.72, 0.5);
    col = mix(col, INK, (1.0 - smoothstep(0.0, 0.012, abs(n - 0.6))) * 0.85);
  }
  return col;
}
void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 p = vUv * 2.0 - 1.0;
  vec4 c = texture2D(tSrc, vUv);
  float dc = texture2D(tDepth, vUv).x;
  float w = wOf(dc), z = 1.0 / w;
  bool isSky = dc > 0.99999;
  // ---- ink ----
  float o = max(1.0, floor(uPx * mix(1.6, 0.8, smoothstep(10.0, 90.0, z)) + 0.5));
  vec2 ox = vec2(uTexel.x * o, 0.0), oy = vec2(0.0, uTexel.y * o);
  vec4 cl = texture2D(tSrc, vUv - ox), cr = texture2D(tSrc, vUv + ox), cu = texture2D(tSrc, vUv + oy), cd = texture2D(tSrc, vUv - oy);
  float wl = wOf(texture2D(tDepth, vUv - ox).x), wr = wOf(texture2D(tDepth, vUv + ox).x);
  float wu = wOf(texture2D(tDepth, vUv + oy).x), wd = wOf(texture2D(tDepth, vUv - oy).x);
  float kk = o * uPixAng;
  float e = (abs(wl + wr - 2.0 * w) + abs(wu + wd - 2.0 * w)) / max(w, 1e-5);
  float ink = smoothstep(0.55 * kk, 1.1 * kk, e);
  float ce = length(cl.rgb - cr.rgb) + length(cu.rgb - cd.rgb);
  ink = max(ink, smoothstep(0.3, 0.62, ce) * (1.0 - smoothstep(60.0, 150.0, z)) * 0.92);
  // ---- tone ----
  vec3 dir = normalize(uCam * vec3(p.x * uTanY * uAspect, p.y * uTanY, -1.0));
  vec3 col;
  float hz = 0.0;
  if (isSky) col = sky(dir, fc);
  else {
    vec3 alb = c.rgb;
    if (c.a > 0.95) col = alb;
    else {
      float l = c.a / 0.9;
      vec3 sh = alb * vec3(0.4, 0.3, 0.6) + vec3(0.03, 0.0, 0.07);
      vec3 hi = alb * vec3(1.05, 1.0, 0.9) + vec3(0.03, 0.01, 0.0);
      float r = 1.0 - smoothstep(0.2, 0.6, l);
      float cov = 1.0 - smoothstep(-0.05, 0.05, dots(fc, 5.5 * uPx, 0.52) - r * 0.76);
      col = mix(hi, sh, cov * step(0.03, r));
    }
    // Distance washes everything towards the sunset behind it.
    hz = smoothstep(60.0, 380.0, z) * 0.86;
    vec3 haze = mix(vec3(0.72, 0.22, 0.5), vec3(1.0, 0.56, 0.3), pow(max(dot(normalize(dir.xz), normalize(uSun.xz)), 0.0), 3.0));
    col = mix(col, haze, hz);
  }
  // ---- the kill: everything behind the victim becomes a burst ----
  if (uSplash.z > 0.001) {
    vec2 q = (vUv - uSplash.xy) * vec2(uAspect, 1.0);
    float rr = length(q), an = atan(q.y, q.x);
    float rays = step(0.5, fract(an * 2.546 + uTime * 0.05));
    vec3 b = mix(vec3(1.0, 0.95, 0.72), uSplashCol, rays);
    float cov = 1.0 - smoothstep(-0.04, 0.04, dots(fc, 9.0 * uPx, 0.3) - smoothstep(0.2, 0.95, rr) * 0.62);
    b = mix(b, mix(uSplashCol * 0.5, INK, 0.3), cov);
    b = mix(vec3(1.0), b, smoothstep(0.03, 0.09, rr));
    float k = uSplash.z * ((isSky || z > uSplash.w) ? 1.0 : 0.0);
    col = mix(col, b, k);
    hz *= 1.0 - k;
    ink *= isSky ? 1.0 : 1.0;
  }
  col = mix(col, INK, ink * (1.0 - hz * 0.75));
  col += texture2D(tBloom, vUv).rgb * 0.9;
  // ---- speed lines: leaping, and the rush of the scope ----
  float rad = length(p * vec2(uAspect, 1.0));
  float sp = max(uSpeed, uScope * 0.55);
  if (sp > 0.01) {
    float an = atan(p.y, p.x) * 28.6;
    float id = floor(an), fr = fract(an);
    float rnd = h21(vec2(id, floor(uTime * 14.0)));
    float start = mix(1.5, 0.62 + rnd * 0.55, sp);
    float wdt = 0.5 * rnd * smoothstep(start, start + 0.5, rad);
    float ln = step(abs(fr - 0.5), wdt * 0.5) * step(0.35, rnd);
    col = mix(col, rnd > 0.7 ? vec3(1.0, 0.97, 0.88) : INK, ln);
  }
  // ---- the scope: the view punches in to its own panel, set at an angle on bare paper ----
  if (uScope > 0.001) {
    vec2 q = vec2(p.x * uAspect + p.y * 0.07, p.y - p.x * 0.035);
    vec2 hb = vec2(uAspect * mix(1.6, 0.9, uScope), mix(1.6, 0.8, uScope));
    float dq = max(abs(q.x) - hb.x, abs(q.y) - hb.y);
    float bw = 5.0 * uPx / uRes.y * 2.0;
    if (dq > bw) {
      vec3 paper = vec3(0.99, 0.96, 0.87);
      float sh2 = max(abs(q.x - 0.035) - hb.x, abs(q.y + 0.035) - hb.y);
      col = sh2 < bw ? INK : mix(paper, INK, (1.0 - smoothstep(-0.04, 0.04, dots(fc, 6.0 * uPx, 0.5) - 0.3)) * 0.18);
    } else if (dq > -bw) col = INK;
  }
  // ---- paper ----
  float g = vnoise(fc * 0.55 / uPx) * 0.6 + h21(floor(fc / uPx)) * 0.4;
  col *= 0.93 + 0.09 * g;
  col *= vec3(1.0, 0.985, 0.955);
  col *= 1.0 - 0.3 * smoothstep(0.75, 1.45, rad);
  col = mix(col, vec3(0.95, 0.2, 0.3), uSudden * smoothstep(0.9, 1.5, rad) * 0.5);
  col = mix(col, vec3(1.0, 0.98, 0.9), uFlash);
  gl_FragColor = vec4(col, 1.0);
}`;

// Presents the page: FXAA-style smoothing of the ink's stair-steps (the comic pass is all hard edges).
const PRESENT = HEAD + `
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec3 m = texture2D(tSrc, vUv).rgb;
  float lNW = luma(texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb), lNE = luma(texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb);
  float lSW = luma(texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb), lSE = luma(texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb);
  float lM = luma(m);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float red = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + red), -8.0, 8.0) * uTexel;
  vec3 a = 0.5 * (texture2D(tSrc, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tSrc, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tSrc, vUv - dir * 0.5).rgb + texture2D(tSrc, vUv + dir * 0.5).rgb);
  float lB = luma(b);
  gl_FragColor = vec4((lB < lMin || lB > lMax) ? a : b, 1.0);
}`;

// q: { scale (scene resolution relative to the drawing buffer), bloom, fxaa }
export function makePost(THREE, renderer, q) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(geo, null);
  quad.frustumCulled = false;
  const mat = (fragmentShader, uniforms) => new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader, depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, ...uniforms },
  });
  const u = {
    tDepth: { value: null }, tBloom: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uPx: { value: 1 }, uNear: { value: 0.3 }, uFar: { value: 900 },
    uPixAng: { value: 0.001 }, uTime: { value: 0 }, uAspect: { value: 1 }, uTanY: { value: 0.5 }, uCam: { value: new THREE.Matrix3() },
    uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunR: { value: new THREE.Vector3(1, 0, 0) }, uSunU: { value: new THREE.Vector3(0, 0, 1) },
    uScope: { value: 0 }, uSpeed: { value: 0 }, uFlash: { value: 0 }, uSudden: { value: 0 }, uSplash: { value: new THREE.Vector4(0.5, 0.5, 0, 1e6) }, uSplashCol: { value: new THREE.Vector3(1, 0.3, 0.3) },
  };
  const mPre = mat(PREFILTER), mBlur = mat(BLUR, { uDir: { value: new THREE.Vector2() } }), mComic = mat(COMIC, u), mPresent = mat(PRESENT);
  const depth = new THREE.DepthTexture(4, 4);
  depth.type = THREE.UnsignedIntType;
  const scene = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true, depthTexture: depth, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter });
  const rt = (filter) => new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false, magFilter: filter, minFilter: filter });
  const qa = rt(THREE.LinearFilter), qb = rt(THREE.LinearFilter);
  const page = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false });
  const size = new THREE.Vector2(), m4 = new THREE.Matrix4();
  const black = new THREE.Color(0, 0, 0);
  let scale = q.scale;

  function pass(material, src, dst, tw, th) {
    material.uniforms.tSrc.value = src.texture;
    material.uniforms.uTexel.value.set(1 / tw, 1 / th);
    quad.material = material;
    renderer.setRenderTarget(dst);
    renderer.render(quad, cam);
  }

  const api = {
    u,
    get scale() { return scale; },
    get height() { return scene.height; },
    // Sized from the drawing buffer: the core shrinks that when frames run long.
    resize() {
      renderer.getDrawingBufferSize(size);
      const w = Math.max(8, Math.round(size.x * scale)), h = Math.max(8, Math.round(size.y * scale));
      scene.setSize(w, h);
      page.setSize(w, h);
      qa.setSize(Math.max(4, w >> 2), Math.max(4, h >> 2));
      qb.setSize(Math.max(4, w >> 2), Math.max(4, h >> 2));
      u.uRes.value.set(w, h);
      u.uAspect.value = w / h;
      // Line weights and dot pitches are set for a 600-line page and scale with the real one.
      u.uPx.value = Math.max(1, h / 600);
    },
    render(world, camera) {
      const auto = renderer.autoClear;
      renderer.autoClear = true;
      renderer.setRenderTarget(scene);
      renderer.setClearColor(black, 1); // sky: no colour, "unlit", depth 1 — the pass paints it
      renderer.render(world, camera);
      const w = scene.width, h = scene.height;
      if (q.bloom) {
        pass(mPre, scene, qa, w, h);
        mBlur.uniforms.uDir.value.set(1, 0);
        pass(mBlur, qa, qb, qa.width, qa.height);
        mBlur.uniforms.uDir.value.set(0, 1);
        pass(mBlur, qb, qa, qa.width, qa.height);
      }
      u.tDepth.value = depth;
      u.tBloom.value = qa.texture;
      u.uNear.value = camera.near; u.uFar.value = camera.far;
      u.uTanY.value = Math.tan((camera.fov * Math.PI) / 360);
      u.uPixAng.value = (2 * u.uTanY.value) / h;
      u.uCam.value.setFromMatrix4(m4.copy(camera.matrixWorld));
      if (q.fxaa) { pass(mComic, scene, page, w, h); pass(mPresent, page, null, w, h); }
      else pass(mComic, scene, null, w, h);
      renderer.setRenderTarget(null);
      renderer.autoClear = auto;
    },
    dispose() {
      renderer.setRenderTarget(null);
      for (const t of [scene, qa, qb, page]) t.dispose();
      depth.dispose();
      for (const m of [mPre, mBlur, mComic, mPresent]) m.dispose();
      geo.dispose();
    },
  };
  return api;
}
