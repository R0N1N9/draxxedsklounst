// THE DEEP — the lens. The scene renders in linear HDR to a half-float target whose alpha
// holds each pixel's distance from the eye (every material writes it). From that:
//   SHADOW  the sun's view of everything big (layer 1) as depth, at the start of the frame;
//           every lit surface and the light shafts read it, so the kraken's bulk darkens
//           the reef and cuts the shafts as it passes over.
//   SHAFTS  a short ray march per pixel at quarter resolution, out to the pixel's distance:
//           sunlight let through the swell's lenses (the shaft pattern is where each point's
//           light entered the surface), shadowed, fading with depth, scattered forwards
//           towards the sun; plus the two divers' torch beams.
//   BLOOM   two levels, prefiltered.
//   FINAL   the water's wobble and the mask's glass (a little barrel and fringing), ACES,
//           a grade (teal shadows, warm light), the mask's rubber at the corners, ink,
//           hold-breath tunnel, grain.
const VERT = 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const HEAD = 'precision highp float;\nvarying vec2 vUv;\nuniform sampler2D tSrc;\nuniform vec2 uTexel;\n';

const DEPTH_VERT = `
void main() {
  vec4 p = vec4(position, 1.0);
#ifdef USE_INSTANCING
  p = instanceMatrix * p;
#endif
  gl_Position = projectionMatrix * modelViewMatrix * p;
}`;
const DEPTH_FRAG = 'precision highp float;\nvoid main() { gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0); }';

const SHAFTS = (steps) => HEAD + `
uniform sampler2D tShadow, tNoise, tCaustic;
uniform mat4 uShadowMat, uCamWorld, uProjInv;
uniform vec3 uCam, uL, uSunCol;
uniform float uTime, uDim, uK;
uniform vec3 uLampPos[2];
uniform vec3 uLampDir[2];
uniform vec3 uLampCol[2];
float shadowAt(vec3 p) {
  vec4 s = uShadowMat * vec4(p, 1.0);
  if (s.x <= 0.0 || s.x >= 1.0 || s.y <= 0.0 || s.y >= 1.0) return 1.0;
  return step(s.z - 0.002, texture2D(tShadow, s.xy).r);
}
void main() {
  float dist = texture2D(tSrc, vUv).a;
  vec4 v = uProjInv * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 dir = normalize((uCamWorld * vec4(normalize(v.xyz / v.w), 0.0)).xyz);
  float far = min(dist, 85.0);
  // only as far as the surface going up
  if (dir.y > 0.001) far = min(far, (-0.05 - uCam.y) / dir.y);
  float stepL = max(far, 0.0) / float(${steps});
  float j = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + uTime * 0.0) * 43758.5453);
  vec3 sun = vec3(0.0), lamp = vec3(0.0);
  float cosT = dot(dir, uL);
  // Henyey-Greenstein, g = 0.62: underwater light scatters mostly forwards
  float g = 0.62, ph = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cosT, 1.5);
  for (int i = 0; i < ${steps}; i++) {
    float d = (float(i) + j) * stepL;
    vec3 p = uCam + dir * d;
    float ext = exp(-d * 0.045);
    vec2 q = p.xz - uL.xz / uL.y * p.y;
    float a = texture2D(tCaustic, q * 0.021 + vec2(uTime * 0.006, uTime * 0.004), 2.5).r;
    float b = texture2D(tNoise, q * 0.011 + vec2(-uTime * 0.004, uTime * 0.003)).r;
    float shaft = smoothstep(0.12, 0.55, a * 1.6 * (0.55 + b));
    float depth = exp(min(p.y, 0.0) * 0.045);
    sun += vec3(shaft * shadowAt(p) * depth * ext) * exp(min(p.y, 0.0) * vec3(0.06, 0.02, 0.012));
    for (int k = 0; k < 2; k++) {
      vec3 l = p - uLampPos[k];
      float ld = length(l);
      float cone = smoothstep(0.86, 0.97, dot(l / max(ld, 1e-3), uLampDir[k]));
      lamp += uLampCol[k] * cone * ext / (1.0 + ld * ld * 0.07);
    }
  }
  vec3 col = (sun * uSunCol * (0.006 + ph * 0.022) + lamp * 0.012) * stepL * uK * (1.0 - 0.7 * uDim);
  gl_FragColor = vec4(col, 1.0);
}`;
const PREFILTER = HEAD + `
void main() {
  vec4 a = texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)), b = texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0));
  vec4 c = texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)), d = texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0));
  vec3 s = min((a.rgb + b.rgb + c.rgb + d.rgb) * 0.25, vec3(30.0));
  float lum = dot(s, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor = vec4(s * (max(lum - 0.55, 0.0) / max(lum, 1e-3)), 1.0);
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
const FINAL = HEAD + `
uniform sampler2D tBloom, tWide, tVol;
uniform float uTime, uExposure, uAspect, uBreath, uInk, uFlash, uHurt, uKill, uMask, uFade, uSat, uMaskK;
uniform vec3 uFlashCol, uInkCol;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 c = vUv - 0.5;
  vec2 ca2 = c * vec2(uAspect, 1.0);
  float r2 = dot(ca2, ca2);
  // the water moves the picture a hair; the mask's glass bends its edges
  vec2 wob = vec2(sin(vUv.y * 21.0 + uTime * 1.6), cos(vUv.x * 17.0 + uTime * 1.2)) * (0.0007 + uHurt * 0.004);
  vec2 uv = 0.5 + c * (1.0 - 0.035 * r2 * uMaskK) + wob;
  // the mask going on: a film of water on the glass, draining down and away
  float line = uMask * 1.2 - 0.1 + sin(vUv.x * 13.0 + uTime * 2.3) * 0.025 + sin(vUv.x * 37.0 - uTime) * 0.01;
  float wet = smoothstep(line + 0.02, line - 0.03, vUv.y) * step(0.001, uMask);
  float men = smoothstep(0.035, 0.0, abs(vUv.y - line)) * step(0.001, uMask);
  uv += vec2(sin(vUv.y * 31.0 + uTime * 3.0), cos(vUv.x * 23.0 + uTime * 2.0)) * 0.014 * wet + vec2(0.0, men * 0.01);
#ifdef LEAN
  vec3 col = texture2D(tSrc, uv).rgb;
#else
  vec2 ca = c * r2 * (0.008 + uHurt * 0.03) * uMaskK;
  vec3 col = vec3(texture2D(tSrc, uv + ca).r, texture2D(tSrc, uv).g, texture2D(tSrc, uv - ca).b);
#endif
  col += texture2D(tVol, uv).rgb;
  col += texture2D(tBloom, uv).rgb * 0.5 + texture2D(tWide, uv).rgb * 0.65;
  col = aces(col * uExposure);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat);
  // teal in the shadows, the sun's warmth in the light
  col *= mix(vec3(0.86, 1.02, 1.08), vec3(1.08, 1.0, 0.86), smoothstep(0.2, 0.85, l));
  col = clamp((col - 0.5) * 1.06 + 0.5 + 0.004, 0.0, 1.0);
  // ink: a blinding violet-black that thins from the middle out
  col = mix(col, uInkCol, uInk * (0.7 + 0.3 * smoothstep(0.6, 0.0, sqrt(r2))));
  col = pow(col, vec3(1.0 / 2.2));
  // vignette, and the mask: dark rubber in the corners, a glint where the glass ends
  float vig = 1.0 - smoothstep(0.35, 1.05, length(ca2 * vec2(0.82, 1.0)));
  col *= mix(0.5, 1.0, vig);
  vec2 m = abs(c) * 2.0;
  float box = length(max(m - vec2(0.86, 0.8), 0.0)) - 0.17;
  float rim = smoothstep(0.0, 0.07, box) * uMaskK;
  col *= 1.0 - rim * 0.9;
  col += vec3(0.5, 0.65, 0.7) * smoothstep(0.03, 0.0, abs(box + 0.004)) * 0.06 * uMaskK;
  // holding your breath: the world narrows, the colour drains from the edges
  float tun = smoothstep(0.25, 0.9, length(ca2)) * uBreath;
  col = mix(col, vec3(dot(col, vec3(0.3, 0.55, 0.15))) * 0.5, tun * 0.8);
  col = mix(col, col * vec3(0.85, 1.02, 1.05) + vec3(0.02, 0.05, 0.05), wet * 0.6);
  col += vec3(0.35, 0.45, 0.45) * men * 0.5;
  col = mix(col, uFlashCol, uFlash);
  gl_FragColor = vec4(col * uFade, 1.0);
}`;
// graded image → screen: one fetch, and grain at the screen's own pitch
const PRESENT = HEAD + `
uniform float uTime;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 col = texture2D(tSrc, vUv).rgb;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor = vec4(col + (hash(gl_FragCoord.xy + fract(uTime * 7.31) * 113.0) - 0.5) * (0.055 - 0.035 * l), 1.0);
}`;

export function makePost(THREE, renderer, U, q) {
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
  const shaftU = {
    tShadow: U.tShadow, tNoise: U.tNoise, tCaustic: U.tCaustic, uShadowMat: U.uShadowMat, uCam: U.uCam, uL: U.uL, uSunCol: U.uSunCol,
    uTime: U.uTime, uDim: U.uDim, uLampPos: U.uLampPos, uLampDir: U.uLampDir, uLampCol: U.uLampCol,
    uCamWorld: { value: new THREE.Matrix4() }, uProjInv: { value: new THREE.Matrix4() }, uK: { value: 1 },
  };
  const shafts = [null, null, null];
  const mShaft = (tier) => (shafts[tier] ||= mat(SHAFTS([22, 15, 9][tier]), shaftU));
  const fu = {
    tBloom: { value: null }, tWide: { value: null }, tVol: { value: null },
    uTime: U.uTime, uExposure: { value: 1.55 }, uAspect: { value: 1 }, uBreath: { value: 0 }, uInk: { value: 0 }, uFlash: { value: 0 },
    uHurt: { value: 0 }, uKill: { value: 0 }, uMask: { value: 0 }, uFade: { value: 1 }, uSat: { value: 1.12 }, uMaskK: { value: 1 },
    uFlashCol: { value: new THREE.Color(1, 1, 1) }, uInkCol: { value: new THREE.Color(0.012, 0.004, 0.02) },
  };
  const mFinal = mat((q.soft ? '#define LEAN\n' : '') + FINAL, fu), mPresent = mat(PRESENT, { uTime: U.uTime });
  const depthMat = new THREE.ShaderMaterial({ vertexShader: DEPTH_VERT, fragmentShader: DEPTH_FRAG, side: THREE.DoubleSide });
  const rt = (o) => new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false, ...o });
  const scene = rt({ depthBuffer: true }), ldr = rt({ type: THREE.UnsignedByteType }), qa = rt(), qb = rt(), ea = rt(), eb = rt(), vol = rt(), volB = rt();
  let shadow = null, shadowSize = 0;
  const size = new THREE.Vector2();
  // the sun's camera: an orthographic box over the arena, looking down the light
  const sunCam = new THREE.OrthographicCamera(-62, 62, 62, -62, 1, 260);
  sunCam.layers.set(1);
  const bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  let scale = q.scale, tier = q.tier;

  function setShadowSize(s) {
    if (s === shadowSize) return;
    if (shadow) shadow.dispose();
    shadow = new THREE.WebGLRenderTarget(s, s, { type: THREE.HalfFloatType, depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    shadowSize = s;
    U.tShadow.value = shadow.texture;
    U.uShadowTexel.value = 1 / s;
  }
  setShadowSize(q.shadow);

  function pass(material, src, dst, tw, th) {
    material.uniforms.tSrc.value = src.texture;
    material.uniforms.uTexel.value.set(1 / tw, 1 / th);
    quad.material = material;
    renderer.setRenderTarget(dst);
    renderer.render(quad, cam);
  }
  const clear = new THREE.Color();

  // every pass material on a quad, so the renderer can compile them ahead of the first frame
  const warmScene = new THREE.Scene();
  for (const m of [mPre, mBlur, mDown, mFinal, mPresent, mShaft(tier)]) { const w = new THREE.Mesh(geo, m); w.frustumCulled = false; warmScene.add(w); }
  const api = {
    u: fu,
    warmScene,
    get tier() { return tier; },
    setTier(t) { tier = t; },
    setShadow: setShadowSize,
    setScale(k) { k = Math.max(0.3, Math.min(1, k)); if (Math.abs(k - scale) > 0.02) { scale = k; api.resize(); } },
    resize() {
      renderer.getDrawingBufferSize(size);
      const w = Math.max(8, Math.round(size.x * scale)), h = Math.max(8, Math.round(size.y * scale));
      const samples = !q.msaa || w * h > 3.2e6 ? 0 : w * h > 1.6e6 ? 2 : 4;
      if (scene.samples !== samples) { scene.samples = samples; scene.dispose(); }
      scene.setSize(w, h);
      ldr.setSize(w, h);
      const qw = Math.max(4, w >> 2), qh = Math.max(4, h >> 2), ew = Math.max(2, w >> 3), eh = Math.max(2, h >> 3);
      qa.setSize(qw, qh); qb.setSize(qw, qh); vol.setSize(qw, qh); volB.setSize(qw, qh);
      ea.setSize(ew, eh); eb.setSize(ew, eh);
      fu.uAspect.value = w / h;
    },
    // Fit the sun's box round `center` and draw the casters into the shadow map.
    shadowPass(world, cx, cz) {
      const L = U.uL.value;
      sunCam.position.set(cx + L.x * 120, L.y * 120, cz + L.z * 120);
      sunCam.up.set(0, 0, 1);
      sunCam.lookAt(cx, -20, cz);
      sunCam.updateMatrixWorld();
      sunCam.updateProjectionMatrix();
      U.uShadowMat.value.multiplyMatrices(bias, sunCam.projectionMatrix).multiply(sunCam.matrixWorldInverse);
      const prevO = world.overrideMaterial, prevBg = world.background;
      renderer.getClearColor(clear);
      const ca = renderer.getClearAlpha();
      world.overrideMaterial = depthMat;
      renderer.setClearColor(0xffffff, 1);
      renderer.setRenderTarget(shadow);
      renderer.clear();
      renderer.render(world, sunCam);
      world.overrideMaterial = prevO;
      world.background = prevBg;
      renderer.setClearColor(clear, ca);
    },
    // draw: world, then the gun in your hands over it (after a depth clear), then the lens
    render(world, camera, hands) {
      const auto = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setRenderTarget(scene);
      renderer.setClearColor(0x000000, 1);
      renderer.clear();
      renderer.render(world, camera);
      if (hands) { renderer.clearDepth(); renderer.render(hands, camera); }
      renderer.autoClear = true;
      const w = scene.width, h = scene.height;
      shaftU.uCamWorld.value.copy(camera.matrixWorld);
      shaftU.uProjInv.value.copy(camera.projectionMatrixInverse);
      pass(mShaft(tier), scene, vol, vol.width, vol.height);
      mBlur.uniforms.uDir.value.set(1, 0);
      pass(mBlur, vol, volB, vol.width, vol.height);
      mBlur.uniforms.uDir.value.set(0, 1);
      pass(mBlur, volB, vol, vol.width, vol.height);
      pass(mPre, scene, qa, w, h);
      mBlur.uniforms.uDir.value.set(1, 0);
      pass(mBlur, qa, qb, qa.width, qa.height);
      mBlur.uniforms.uDir.value.set(0, 1);
      pass(mBlur, qb, qa, qa.width, qa.height);
      pass(mDown, qa, ea, qa.width, qa.height);
      mBlur.uniforms.uDir.value.set(1.6, 0);
      pass(mBlur, ea, eb, ea.width, ea.height);
      mBlur.uniforms.uDir.value.set(0, 1.6);
      pass(mBlur, eb, ea, ea.width, ea.height);
      fu.tBloom.value = qa.texture;
      fu.tWide.value = ea.texture;
      fu.tVol.value = vol.texture;
      pass(mFinal, scene, ldr, w, h);
      pass(mPresent, ldr, null, w, h);
      renderer.autoClear = auto;
    },
    dispose() {
      renderer.setRenderTarget(null);
      for (const t of [scene, ldr, qa, qb, ea, eb, vol, volB]) t.dispose();
      if (shadow) shadow.dispose();
      for (const m of [mPre, mBlur, mDown, mFinal, mPresent, depthMat, ...shafts]) if (m) m.dispose();
      geo.dispose();
    },
  };
  return api;
}
