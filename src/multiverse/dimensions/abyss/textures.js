// THE DEEP — textures baked once on the GPU at create(): a tileable caustic net and a
// tileable four-channel noise. Every animated pattern in the world (caustics on the reef,
// light shafts in the water, ripples on the surface, rock grain) is two cheap lookups into
// these instead of procedural noise per pixel.
import { fullscreenPass } from '../../kit.js';

// Tileable value noise / voronoi over a torus of `P` cells: wrap the lattice with mod().
const COMMON = `
precision highp float;
varying vec2 vUv;
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float tnoise(vec2 p, float P) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  float a = h21(mod(i, P)), b = h21(mod(i + vec2(1.0, 0.0), P)), c = h21(mod(i + vec2(0.0, 1.0), P)), d = h21(mod(i + vec2(1.0, 1.0), P));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float tfbm(vec2 p, float P) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++) { s += a * tnoise(p, P); p *= 2.0; P *= 2.0; a *= 0.5; }
  return s / 0.984;
}
`;

// Caustics: the edges of a jittered voronoi, F2 - F1, sharpened — the bright net that the
// surface's lenses focus onto the floor. Two of these at different scales and drifts,
// multiplied, read as moving light.
const CAUSTIC = COMMON + `
void main() {
  float P = 9.0;
  vec2 p = vUv * P;
  // a warp so the cells are lumpy lenses, not polygons
  p += (vec2(tnoise(vUv * 6.0, 6.0), tnoise(vUv * 6.0 + 3.7, 6.0)) - 0.5) * 0.9;
  vec2 ip = floor(p), fp = fract(p);
  float f1 = 9.0, f2 = 9.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y));
    vec2 c = o + h22(mod(ip + o, P)) * 0.85 + 0.075 - fp;
    float d = dot(c, c);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  float e = sqrt(f2) - sqrt(f1);
  float net = pow(clamp(1.0 - e * 2.2, 0.0, 1.0), 5.0);
  float glow = pow(clamp(1.0 - e * 1.1, 0.0, 1.0), 2.0) * 0.18;
  gl_FragColor = vec4(vec3(net + glow), 1.0);
}`;

// r: soft fbm · g: ridged fbm (veins, kelp fibre) · b: fine grain · a: large blotches
const NOISE = COMMON + `
void main() {
  vec2 p = vUv;
  float r = tfbm(p * 4.0, 4.0);
  float g = 1.0 - abs(tfbm(p * 6.0 + 11.0, 6.0) * 2.0 - 1.0);
  float b = tfbm(p * 32.0 + 5.0, 32.0);
  float a = tfbm(p * 2.0 + 23.0, 2.0);
  gl_FragColor = vec4(r, g, b, a);
}`;

export function makeTextures(THREE, renderer) {
  const mk = (size) => {
    const rt = new THREE.WebGLRenderTarget(size, size, {
      type: THREE.UnsignedByteType, depthBuffer: false, generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
    });
    rt.texture.colorSpace = THREE.NoColorSpace;
    return rt;
  };
  const caustic = mk(512), noise = mk(256);
  const prevTarget = renderer.getRenderTarget(), prevAuto = renderer.autoClear;
  renderer.autoClear = true;
  for (const [rt, frag] of [[caustic, CAUSTIC], [noise, NOISE]]) {
    const pass = fullscreenPass(THREE, { fragmentShader: frag });
    renderer.setRenderTarget(rt);
    pass.render(renderer);
    pass.dispose();
  }
  renderer.setRenderTarget(prevTarget);
  renderer.autoClear = prevAuto;
  for (const rt of [caustic, noise]) {
    rt.texture.wrapS = rt.texture.wrapT = THREE.RepeatWrapping;
    rt.texture.anisotropy = 4;
  }
  return {
    caustic: caustic.texture,
    noise: noise.texture,
    dispose() { caustic.dispose(); noise.dispose(); },
  };
}
