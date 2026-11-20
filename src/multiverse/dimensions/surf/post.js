// BREAK POINT — the lens. The world is drawn in linear HDR into a half-float target; from
// there everything expensive happens at a quarter of the resolution or less: bloom (which is
// what turns the sun's road into glitter), a wide soft halo, and shafts of light smeared
// from the sun through whatever stands in front of the sky. One full-size pass tone-maps and
// grades (teal shadows, amber highlights), and a last one puts the picture on the screen
// under grain at the screen's own pitch — so a scene drawn small never looks enlarged.
// The cost is in pixels: everything is sized from the drawing buffer in resize().

const VERT = 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const HEAD = 'precision highp float;\nvarying vec2 vUv;\nuniform sampler2D tSrc;\nuniform vec2 uTexel;\n';

const PREFILTER = HEAD + `
void main() {
  vec4 a = texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)), b = texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0));
  vec4 c = texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)), d = texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0));
  vec4 s = min((a + b + c + d) * 0.25, vec4(30.0));
  float lum = dot(s.rgb, vec3(0.2126, 0.7152, 0.0722));
  float sky = 1.0 - clamp(s.a, 0.0, 1.0);
  gl_FragColor = vec4(s.rgb * (max(lum - 1.0, 0.0) / max(lum, 1e-3)), sky * min(max(lum - 0.6, 0.0), 5.0));
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
const RAYS = HEAD + `
uniform vec2 uSun;
void main() {
  vec2 d = (uSun - vUv) * (0.85 / 16.0);
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  vec2 p = vUv + d * n;
  float acc = 0.0, w = 1.0;
  for (int i = 0; i < 16; i++) { acc += texture2D(tSrc, p).a * w; w *= 0.92; p += d; }
  gl_FragColor = vec4(acc * 0.09);
}`;
const GRADE = `
uniform sampler2D tBloom, tWide, tRays;
uniform vec3 uSunCol;
uniform float uTime, uExposure, uRays, uFlinch, uFlash, uFade, uBrace, uDive, uAspect;
uniform vec3 uWater; // the lens going under: waterline height (0 bottom .. 1 top, < 0 = dry), tilt, froth
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
// Three sizes of bubble, each in its own rising lattice: a disc, a rim and a glint.
float bubbles(vec2 p, float t) {
  float acc = 0.0;
  for (int L = 0; L < 3; L++) {
    float fl = float(L), s = 6.0 + fl * 8.0;
    vec2 q = p * s + vec2(fl * 3.7 + sin(t * 1.3 + p.y * 5.0 + fl) * 0.12, -t * (1.0 + fl * 0.8));
    vec2 c = floor(q), f = fract(q) - 0.5 - (vec2(h21(c), h21(c + 3.1)) - 0.5) * 0.5;
    float r = h21(c + 7.0), rad = 0.1 + 0.26 * r * r, d = length(f);
    acc += step(0.42, h21(c + 11.0)) * ((1.0 - smoothstep(rad * 0.7, rad, d)) * 0.3 + (1.0 - smoothstep(0.0, 0.035, abs(d - rad * 0.88))) * 0.55 + (1.0 - smoothstep(0.0, rad * 0.3, length(f - vec2(-0.32, 0.32) * rad))) * 0.7);
  }
  return acc;
}
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  vec2 c = vUv - 0.5, uv = vUv;
  float r2 = dot(c, c);
  // under the surface the picture swims
  uv += vec2(sin(uv.y * 34.0 + uTime * 9.0), cos(uv.x * 27.0 + uTime * 7.0)) * 0.0045 * uDive;
#ifdef LENS
  vec2 ca = c * r2 * (0.014 + 0.05 * uFlinch);
  vec3 col = vec3(texture2D(tSrc, uv + ca).r, texture2D(tSrc, uv).g, texture2D(tSrc, uv - ca).b);
#else
  vec3 col = texture2D(tSrc, uv).rgb;
#endif
  col += texture2D(tBloom, uv).rgb * 0.5 + texture2D(tWide, uv).rgb * 0.75;
  col += uSunCol * texture2D(tRays, uv).r * uRays;
  col = mix(col, col * vec3(0.16, 0.62, 0.66) + vec3(0.0, 0.05, 0.07), uDive * 0.85);
  col = aces(col * uExposure);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, 1.12 - 0.5 * uFlinch);
  col *= mix(vec3(0.86, 1.0, 1.1), vec3(1.1, 1.0, 0.88), smoothstep(0.08, 0.7, l)); // teal shadows, amber lights
  col = clamp((col - 0.5) * 1.07 + 0.5, 0.0, 1.0);
  col = pow(col, vec3(1.0 / 2.2));
  float vig = 1.0 - smoothstep(0.25, 1.0, length(c * vec2(1.0, 0.9)) * (1.0 + 0.45 * uFlinch + 0.35 * uBrace + 0.5 * uDive));
  col *= mix(0.5, 1.0, vig);
  if (uWater.x > -0.5) {
    vec2 p = vec2(vUv.x * uAspect, vUv.y);
    float line = uWater.x + (vUv.x - 0.5) * uWater.y + sin(vUv.x * 9.0 + uTime * 2.6) * 0.012 + (vn(vec2(vUv.x * 14.0, uTime * 1.7)) - 0.5) * 0.03;
    float d = line - vUv.y, under = smoothstep(-0.006, 0.006, d); // d > 0: this pixel is under water
    vec3 uw = mix(vec3(0.0, 0.33, 0.52), vec3(0.01, 0.1, 0.27), smoothstep(0.0, 0.75, d));              // blue below
    uw = mix(uw, vec3(0.45, 0.93, 0.88), exp(-max(d, 0.0) * 6.5) * 0.9);                                 // the bright surface just overhead
    uw += vec3(0.2, 0.42, 0.4) * pow(vn(vec2(vUv.x * 11.0 - d * 3.0, uTime * 0.5)), 3.0) * exp(-max(d, 0.0) * 2.5); // shafts of light
    uw = mix(uw, col * vec3(0.35, 0.8, 0.9), 0.18 * exp(-max(d, 0.0) * 4.0));                            // a ghost of the world above
    float trail = exp(-pow((vUv.x - 0.5) * 3.2, 2.0));                                                   // thickest where the diver went
    uw = mix(uw, vec3(0.9, 1.0, 1.0), clamp(bubbles(p, uTime) * (0.3 + 0.7 * trail + exp(-max(d, 0.0) * 5.0) * 0.6), 0.0, 1.0) * 0.85);
    float froth = smoothstep(0.45, 0.8, vn(p * 9.0 + vec2(0.0, uTime * 0.8)) * 0.6 + vn(p * 23.0 - vec2(uTime * 0.5, 0.0)) * 0.5) * exp(-max(d, 0.0) * 4.5) * uWater.z;
    uw = mix(uw, vec3(0.95, 1.0, 0.98), froth);                                                          // churned white under the line
    col = mix(col, uw, under);
    col = mix(col, vec3(0.8, 0.95, 0.95), 0.4 * (1.0 - smoothstep(0.0, 0.16, -d)) * (1.0 - under) * uWater.z); // water sheeting off the glass
    col = mix(col, vec3(1.0), exp(-abs(d) * 90.0) * 0.9);                                                // the seam itself
  }
  gl_FragColor = vec4(mix(col, vec3(1.0, 0.96, 0.88), uFlash) * uFade, 1.0);
}`;
const PRESENT = HEAD + `
uniform float uTime;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 col = texture2D(tSrc, vUv).rgb;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor = vec4(col + (hash(gl_FragCoord.xy + fract(uTime * 7.31) * 113.0) - 0.5) * (0.05 - 0.03 * l), 1.0);
}`;

// q: { msaa, scale (scene resolution relative to the drawing buffer), lens }
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
    tBloom: { value: null }, tWide: { value: null }, tRays: { value: null }, uSunCol: { value: new THREE.Color(1, 0.6, 0.28) },
    uTime: { value: 0 }, uExposure: { value: 1 }, uRays: { value: 0 }, uFlinch: { value: 0 }, uFlash: { value: 0 }, uFade: { value: 1 },
    uBrace: { value: 0 }, uDive: { value: 0 }, uAspect: { value: 1 }, uWater: { value: new THREE.Vector3(-1, 0, 0) },
  };
  const mGrade = mat(HEAD + (q.lens ? '#define LENS\n' : '') + GRADE, fu), mPresent = mat(PRESENT, { uTime: fu.uTime });
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
    get height() { return scene.height; },
    resize() {
      renderer.getDrawingBufferSize(size);
      const w = Math.max(8, Math.round(size.x * scale)), h = Math.max(8, Math.round(size.y * scale));
      // Multisample where there are few pixels to hide the stair-steps; a retina panel hides them itself.
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
      mBlur.uniforms.uDir.value.set(2.2, 0); // wider across than up: glitter smears like it does through real glass
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
      renderer.setRenderTarget(null);
      renderer.autoClear = auto;
    },
    // The last graded frame again under fresh grain: all a frame costs when the scene is not redrawn.
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
