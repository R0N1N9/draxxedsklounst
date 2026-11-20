// IRON AUTUMN — the lens and the lab. The scene is rendered in linear HDR to a half-float
// target; everything after that happens at a quarter resolution or lower (bloom, light
// shafts from the low sun) except one full-screen composite: tone map, grade, grain, vignette.
// The sky writes alpha 0 and everything else alpha 1, which is the occlusion mask the
// shafts are cut from — no depth texture needed.

const VERT = 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const HEAD = 'precision highp float;\nvarying vec2 vUv;\nuniform sampler2D tSrc;\nuniform vec2 uTexel;\n';

// Scene → quarter size: what is bright enough to bloom (rgb) and how much sky-light could
// become a shaft (a).
const PREFILTER = HEAD + `
void main() {
  vec4 a = texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)), b = texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0));
  vec4 c = texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)), d = texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0));
  vec4 s = min((a + b + c + d) * 0.25, vec4(40.0));
  float lum = dot(s.rgb, vec3(0.2126, 0.7152, 0.0722));
  float sky = 1.0 - clamp(s.a, 0.0, 1.0);
  gl_FragColor = vec4(s.rgb * (max(lum - 1.0, 0.0) / max(lum, 1e-3)), sky * min(max(lum - 0.75, 0.0), 6.0));
}`;
const BLUR = HEAD + `
uniform vec2 uDir;
void main() {
  vec2 o1 = uDir * uTexel * 1.3846, o2 = uDir * uTexel * 3.2308;
  gl_FragColor = texture2D(tSrc, vUv) * 0.2270 + (texture2D(tSrc, vUv + o1) + texture2D(tSrc, vUv - o1)) * 0.3162
    + (texture2D(tSrc, vUv + o2) + texture2D(tSrc, vUv - o2)) * 0.0703;
}`;
const DOWN = HEAD + `
void main() {
  gl_FragColor = (texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)) + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0))
    + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)) + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0))) * 0.25;
}`;
// Radial smear of the sky mask towards the sun: light shafts through the smoke.
const RAYS = HEAD + `
uniform vec2 uSun;
void main() {
  vec2 d = (uSun - vUv) * (0.9 / 18.0);
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  vec2 p = vUv + d * n;
  float acc = 0.0, w = 1.0;
  for (int i = 0; i < 18; i++) { acc += texture2D(tSrc, p).a * w; w *= 0.93; p += d; }
  gl_FragColor = vec4(acc * 0.085);
}`;
// Tone map and grade, into an 8-bit image at the scene's own resolution. PRESENT puts that
// on the screen — and can do so again on frames when the scene itself is not redrawn.
const FINAL = `
uniform sampler2D tBloom, tWide, tRays;
uniform vec3 uSunCol;
uniform float uTime, uExposure, uRays, uFlinch, uFlash, uFade, uScope, uAspect;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  vec2 c = vUv - 0.5;
  float r2 = dot(c, c);
#ifdef LENS
  // A touch of lateral colour, as old glass has; stronger when the world has just kicked you.
  vec2 ca = c * r2 * (0.012 + 0.05 * uFlinch);
  vec3 col = vec3(texture2D(tSrc, vUv + ca).r, texture2D(tSrc, vUv).g, texture2D(tSrc, vUv - ca).b);
#else
  vec3 col = texture2D(tSrc, vUv).rgb;
#endif
  col += texture2D(tBloom, vUv).rgb * 0.5 + texture2D(tWide, vUv).rgb * 0.85;
  col += uSunCol * texture2D(tRays, vUv).r * uRays;
  col = aces(col * uExposure);
  // The grade: pull the colour out, then put warmth back into the highlights only.
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, 0.66 - 0.4 * uFlinch);
  col *= mix(vec3(0.84, 0.98, 1.12), vec3(1.13, 1.0, 0.82), smoothstep(0.1, 0.72, l));
  col = clamp((col - 0.5) * 1.1 + 0.5 - 0.012, 0.0, 1.0);
  col = pow(col, vec3(1.0 / 2.2));
  float vig = 1.0 - smoothstep(0.2, 0.95, length(c * vec2(1.0, 0.9)) * (1.0 + 0.5 * uFlinch));
  col *= mix(0.42, 1.0, vig);
  // Through the scope the image dims and softens towards the edge of the tube.
  float sr = length(c * vec2(uAspect, 1.0));
  col *= mix(1.0, (1.0 - smoothstep(0.3, 0.52, sr)) * 0.92 + 0.08, uScope);
  gl_FragColor = vec4(mix(col, vec3(1.0, 0.95, 0.85), uFlash) * uFade, 1.0);
}`;
// Graded image → screen: one fetch, and grain at the screen's own pitch so the picture
// never looks like an enlargement (the scene may be drawn smaller than the screen).
const PRESENT = HEAD + `
uniform float uTime;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 col = texture2D(tSrc, vUv).rgb;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor = vec4(col + (hash(gl_FragCoord.xy + fract(uTime * 7.31) * 113.0) - 0.5) * (0.085 - 0.05 * l), 1.0);
}`;

// q: { msaa (bool), scale (0.4..1: scene resolution relative to the drawing buffer), lens (bool) }
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
  const mPre = mat(PREFILTER), mBlur = mat(BLUR, { uDir: { value: new THREE.Vector2() } }), mDown = mat(DOWN);
  const mRays = mat(RAYS, { uSun: { value: new THREE.Vector2(0.5, 0.5) } });
  const fu = {
    tBloom: { value: null }, tWide: { value: null }, tRays: { value: null }, uSunCol: { value: new THREE.Color(1, 0.6, 0.3) },
    uTime: { value: 0 }, uExposure: { value: 1 }, uRays: { value: 0 }, uFlinch: { value: 0 }, uFlash: { value: 0 }, uFade: { value: 1 },
    uScope: { value: 0 }, uAspect: { value: 1 },
  };
  const lens = q.lens ? '#define LENS\n' : '';
  const mGrade = mat(HEAD + lens + FINAL, fu), mPresent = mat(PRESENT, { uTime: fu.uTime });
  const rt = (o) => new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false, ...o });
  const scene = rt({ depthBuffer: true }), qa = rt(), qb = rt(), ea = rt(), eb = rt(), rays = rt(), ldr = rt({ type: THREE.UnsignedByteType });
  const size = new THREE.Vector2();
  let scale = q.scale;

  function pass(material, src, dst, tw, th) {
    material.uniforms.tSrc.value = src.texture;
    material.uniforms.uTexel.value.set(1 / tw, 1 / th);
    quad.material = material;
    renderer.setRenderTarget(dst);
    renderer.render(quad, cam);
  }

  const api = {
    u: fu,
    sun: mRays.uniforms.uSun.value,
    get scale() { return scale; },
    setScale(k) { k = Math.max(0.5, Math.min(1, k)); if (Math.abs(k - scale) > 0.02) { scale = k; api.resize(); } },
    // Sized from the drawing buffer: the core shrinks that when frames run long.
    resize() {
      renderer.getDrawingBufferSize(size);
      const w = Math.max(8, Math.round(size.x * scale)), h = Math.max(8, Math.round(size.y * scale));
      // Multisample where there are few pixels to hide the stair-steps; retina hides them itself.
      const samples = !q.msaa || w * h > 4.2e6 ? 0 : w * h > 2.2e6 ? 2 : 4;
      if (scene.samples !== samples) { scene.samples = samples; scene.dispose(); }
      scene.setSize(w, h);
      ldr.setSize(w, h);
      const qw = Math.max(4, w >> 2), qh = Math.max(4, h >> 2), ew = Math.max(2, w >> 3), eh = Math.max(2, h >> 3);
      qa.setSize(qw, qh); qb.setSize(qw, qh); rays.setSize(qw, qh);
      ea.setSize(ew, eh); eb.setSize(ew, eh);
      fu.uAspect.value = w / h;
    },
    render(world, camera, wantRays) {
      const auto = renderer.autoClear;
      renderer.autoClear = true;
      renderer.setRenderTarget(scene);
      renderer.render(world, camera);
      const w = scene.width, h = scene.height;
      pass(mPre, scene, qa, w, h);
      mBlur.uniforms.uDir.value.set(1, 0);
      pass(mBlur, qa, qb, qa.width, qa.height);
      mBlur.uniforms.uDir.value.set(0, 1);
      pass(mBlur, qb, qa, qa.width, qa.height);
      pass(mDown, qa, ea, qa.width, qa.height);
      mBlur.uniforms.uDir.value.set(1.8, 0); // wider across than up: a hint of anamorphic glass
      pass(mBlur, ea, eb, ea.width, ea.height);
      mBlur.uniforms.uDir.value.set(0, 1);
      pass(mBlur, eb, ea, ea.width, ea.height);
      if (wantRays) pass(mRays, qa, rays, qa.width, qa.height);
      fu.tBloom.value = qa.texture;
      fu.tWide.value = ea.texture;
      fu.tRays.value = rays.texture;
      if (!wantRays) fu.uRays.value = 0;
      pass(mGrade, scene, ldr, w, h);
      pass(mPresent, ldr, null, w, h);
      renderer.autoClear = auto;
    },
    // The last graded frame again, with fresh grain: all a frame costs when the scene is skipped.
    present() { pass(mPresent, ldr, null, ldr.width, ldr.height); renderer.setRenderTarget(null); },
    dispose() {
      renderer.setRenderTarget(null);
      for (const t of [scene, qa, qb, ea, eb, rays, ldr]) t.dispose();
      for (const m of [mPre, mBlur, mDown, mRays, mGrade, mPresent]) m.dispose();
      geo.dispose();
    },
  };
  return api;
}
