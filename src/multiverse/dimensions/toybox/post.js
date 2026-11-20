// TOY BOX — the lens. The room is drawn once in linear HDR; everything after that is small:
// a half- and a quarter-size blurred copy (the tilt-shift: the picture melts towards the top
// and bottom of the frame, which is what makes a floor look like a tabletop), bloom from the
// quarter, and one full-size pass that puts them together, tone-maps, grades and adds grain.

const VERT = 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const HEAD = 'precision highp float;\nvarying vec2 vUv;\nuniform sampler2D tSrc;\nuniform vec2 uTexel;\n';
const DOWN = HEAD + `
void main() {
  gl_FragColor = min((texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)) + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0))
    + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)) + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0))) * 0.25, vec4(24.0));
}`;
const BLUR = HEAD + `
uniform vec2 uDir;
void main() {
  vec2 o1 = uDir * uTexel * 1.3846, o2 = uDir * uTexel * 3.2308;
  gl_FragColor = texture2D(tSrc, vUv) * 0.2270 + (texture2D(tSrc, vUv + o1) + texture2D(tSrc, vUv - o1)) * 0.3162
    + (texture2D(tSrc, vUv + o2) + texture2D(tSrc, vUv - o2)) * 0.0703;
}`;
const BRIGHT = HEAD + `
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor = vec4(c * (max(l - 1.05, 0.0) / max(l, 1e-3)), 1.0);
}`;
const FINAL = HEAD + `
uniform sampler2D tHalf, tQuarter, tBloom, tWide;
uniform vec2 uFocus; // centre and half-height of the sharp band, in screen v
uniform float uTime, uTilt, uFlash, uPunch, uGrain, uAspect;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 c = vUv - 0.5;
  // Tilt-shift: sharp across the rug, melting towards the top and bottom of the frame.
  float f = clamp((abs(vUv.y - uFocus.x) - uFocus.y) / max(0.5 - uFocus.y, 0.05), 0.0, 1.0);
  f = f * f * (3.0 - 2.0 * f) * uTilt;
  // A breath of lateral colour at the edges; a real kick of it when someone is hit.
  vec2 ca = c * dot(c, c) * (0.006 + 0.012 * uPunch);
  vec3 sharp = vec3(texture2D(tSrc, vUv + ca).r, texture2D(tSrc, vUv).g, texture2D(tSrc, vUv - ca).b);
  vec3 col = mix(sharp, texture2D(tHalf, vUv).rgb, clamp(f * 2.2, 0.0, 1.0));
  col = mix(col, texture2D(tQuarter, vUv).rgb, clamp(f * 2.2 - 1.0, 0.0, 1.0));
  col += texture2D(tBloom, vUv).rgb * 0.55 + texture2D(tWide, vUv).rgb * 0.5;
  col = aces(col * 1.05);
  // Grade: cool, slightly lifted shadows; warm highlights; a little extra colour, as toys have.
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, 1.06 - 0.2 * uPunch);
  col *= mix(vec3(0.9, 0.97, 1.14), vec3(1.07, 1.0, 0.9), smoothstep(0.08, 0.7, l));
  col = clamp((col - 0.5) * 1.06 + 0.5, 0.0, 1.0);
  col = pow(col, vec3(1.0 / 2.2));
  float vig = 1.0 - smoothstep(0.35, 1.05, length(c * vec2(1.0, 1.25)) * (1.0 + 0.35 * uPunch));
  col *= mix(0.3, 1.0, vig);
  col += (hash(gl_FragCoord.xy + fract(uTime * 7.31) * 113.0) - 0.5) * uGrain * (1.0 - 0.6 * l);
  gl_FragColor = vec4(mix(col, vec3(1.0, 0.96, 0.9), uFlash), 1.0);
}`;

// q: { msaa (bool), scale (scene resolution relative to the drawing buffer), cap (most pixels the scene is ever drawn at) }
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
  const fu = {
    tHalf: { value: null }, tQuarter: { value: null }, tBloom: { value: null }, tWide: { value: null }, uFocus: { value: new THREE.Vector2(0.5, 0.3) },
    uTime: { value: 0 }, uTilt: { value: 1 }, uFlash: { value: 0 }, uPunch: { value: 0 }, uGrain: { value: 0.035 }, uAspect: { value: 1 },
  };
  const mDown = mat(DOWN), mBlur = mat(BLUR, { uDir: { value: new THREE.Vector2() } }), mBright = mat(BRIGHT), mFinal = mat(FINAL, fu);
  const rt = (o) => new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false, ...o });
  const scene = rt({ depthBuffer: true }), ha = rt(), hb = rt(), qa = rt(), qb = rt(), ba = rt(), bb = rt(), ea = rt(), eb = rt();
  const size = new THREE.Vector2();
  let scale = q.scale;

  function pass(material, src, dst, tw, th) {
    material.uniforms.tSrc.value = src.texture;
    material.uniforms.uTexel.value.set(1 / tw, 1 / th);
    quad.material = material;
    renderer.setRenderTarget(dst);
    renderer.render(quad, cam);
  }
  function blur(a, b, k) {
    mBlur.uniforms.uDir.value.set(k, 0);
    pass(mBlur, a, b, a.width, a.height);
    mBlur.uniforms.uDir.value.set(0, k);
    pass(mBlur, b, a, a.width, a.height);
  }

  const api = {
    u: fu,
    get scale() { return scale; },
    get height() { return scene.height; },
    // Sized from the drawing buffer: the core shrinks that when frames run long.
    resize() {
      renderer.getDrawingBufferSize(size);
      // A 16" retina screen is 7.7 million pixels: past the cap the scene is drawn smaller and
      // the final pass enlarges it under full-resolution grain. Nobody can tell; the GPU can.
      scale = Math.min(q.scale, Math.sqrt(q.cap / Math.max(1, size.x * size.y)));
      const w = Math.max(8, Math.round(size.x * scale)), h = Math.max(8, Math.round(size.y * scale));
      // Multisample where there are few pixels to hide the stair-steps; retina hides them itself.
      const samples = !q.msaa || w * h > 4.2e6 ? 0 : w * h > 2.2e6 ? 2 : 4;
      if (scene.samples !== samples) { scene.samples = samples; scene.dispose(); }
      scene.setSize(w, h);
      const hw = Math.max(4, w >> 1), hh = Math.max(4, h >> 1), qw = Math.max(4, w >> 2), qh = Math.max(4, h >> 2), ew = Math.max(2, w >> 3), eh = Math.max(2, h >> 3);
      ha.setSize(hw, hh); hb.setSize(hw, hh);
      qa.setSize(qw, qh); qb.setSize(qw, qh); ba.setSize(qw, qh); bb.setSize(qw, qh);
      ea.setSize(ew, eh); eb.setSize(ew, eh);
      fu.uAspect.value = w / h;
    },
    render(world, camera) {
      const auto = renderer.autoClear;
      renderer.autoClear = true;
      renderer.setRenderTarget(scene);
      renderer.render(world, camera);
      const w = scene.width, h = scene.height;
      pass(mDown, scene, ha, w, h);
      blur(ha, hb, 1);
      pass(mDown, ha, qa, ha.width, ha.height);
      blur(qa, qb, 1.4);
      pass(mBright, qa, ba, qa.width, qa.height);
      blur(ba, bb, 1);
      pass(mDown, ba, ea, ba.width, ba.height);
      blur(ea, eb, 1.6);
      fu.tHalf.value = ha.texture; fu.tQuarter.value = qa.texture; fu.tBloom.value = ba.texture; fu.tWide.value = ea.texture;
      pass(mFinal, scene, null, w, h);
      renderer.autoClear = auto;
    },
    dispose() {
      renderer.setRenderTarget(null);
      for (const t of [scene, ha, hb, qa, qb, ba, bb, ea, eb]) t.dispose();
      for (const m of [mDown, mBlur, mBright, mFinal]) m.dispose();
      geo.dispose();
    },
  };
  return api;
}
