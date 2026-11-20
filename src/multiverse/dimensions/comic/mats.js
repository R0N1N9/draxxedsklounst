// INK CITY — one material family for the whole world. Nothing here shades: every surface
// writes its flat PRINT COLOUR to rgb and HOW MUCH SUN IT GETS to alpha (1 = unlit ink,
// a light, lettering). The comic pass (post.js) turns that into tone steps and Ben-Day
// dots in screen space, which is why the picture reads as printed rather than rendered.

const VERT = `
#include <common>
#include <shadowmap_pars_vertex>
#ifdef INST
attribute vec3 aCol;
attribute float aKind;
#endif
uniform vec3 uColor;
uniform float uKind;
varying vec3 vWp;
varying vec3 vWn;
varying vec3 vCol;
varying float vKind;
varying vec3 vLp;
varying vec3 vScl;
varying vec2 vUv2;
void main() {
  #include <beginnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <project_vertex>
  #include <worldpos_vertex>
  #include <shadowmap_vertex>
  vec4 wp = vec4(transformed, 1.0);
  vScl = vec3(1.0);
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
    vScl = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  #endif
  wp = modelMatrix * wp;
  vWp = wp.xyz;
  vWn = normalize(inverseTransformDirection(transformedNormal, viewMatrix));
  vLp = position;
  vUv2 = uv;
  #ifdef INST
    vCol = aCol; vKind = aKind;
  #else
    vCol = uColor; vKind = uKind;
  #endif
}`;

const FRAG = `
#include <common>
#include <packing>
#include <bsdfs>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
uniform vec3 uSun;
uniform float uTime;
uniform float uErase;
uniform float uLit;
uniform float uMinL;
#ifdef MAP
uniform sampler2D map;
#endif
varying vec3 vWp;
varying vec3 vWn;
varying vec3 vCol;
varying float vKind;
varying vec3 vLp;
varying vec3 vScl;
varying vec2 vUv2;
float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
// The sun's shadow, sampled here rather than through three's filters: those cost 17 taps a
// pixel, and the half-light is going to be printed as dots anyway. Four taps soften the
// edge enough for the dots to grade it; SOFT off is a single tap for machines with no GPU.
float sunShadow() {
  #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
    vec4 sc = vDirectionalShadowCoord[0];
    sc.xyz /= sc.w;
    sc.z += directionalLightShadows[0].shadowBias;
    if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;
    #ifdef SOFT
      vec2 t = 1.1 / directionalLightShadows[0].shadowMapSize;
      return 0.25 * (texture2DCompare(directionalShadowMap[0], sc.xy + t * vec2(-0.9, -0.3), sc.z) + texture2DCompare(directionalShadowMap[0], sc.xy + t * vec2(0.3, -0.9), sc.z)
        + texture2DCompare(directionalShadowMap[0], sc.xy + t * vec2(0.9, 0.3), sc.z) + texture2DCompare(directionalShadowMap[0], sc.xy + t * vec2(-0.3, 0.9), sc.z));
    #else
      return texture2DCompare(directionalShadowMap[0], sc.xy, sc.z);
    #endif
  #else
    return 1.0;
  #endif
}
void main() {
  vec3 n = normalize(vWn);
  vec3 col = vCol;
  float unlit = uLit;
  int kind = int(vKind + 0.5);
  if (kind == 1) {
    // A building: tar on top, a cornice, and rows of windows spaced to fit each wall exactly.
    if (n.y > 0.7) {
      col = mix(vec3(0.8, 0.62, 0.6), vCol, 0.22);
    } else if (abs(n.y) < 0.3) {
      bool xf = abs(n.x) > 0.5;
      float wd = xf ? vScl.z : vScl.x;
      float uu = ((xf ? vLp.z : vLp.x) + 0.5) * wd;
      float top = (0.5 - vLp.y) * vScl.y;
      float cnt = max(1.0, floor(wd / 2.7));
      vec2 cell = vec2(uu / (wd / cnt), (top - 1.1) / 3.3);
      vec2 id = floor(cell), f = fract(cell);
      float seed = h21(floor(vWp.xz * 0.37) + (xf ? 7.0 : 3.0));
      if (top < 0.55) col = vCol * 1.16 + 0.05;
      else if (top > 1.1 && f.x > 0.24 && f.x < 0.76 && f.y > 0.2 && f.y < 0.74) {
        float r = h21(id + seed * 91.0);
        if (r > 0.76) { col = mix(vec3(1.0, 0.88, 0.45), vec3(1.0, 0.64, 0.32), step(0.93, r)); unlit = 1.0; }
        else col = dot(n, uSun) > 0.25 ? vec3(0.98, 0.56, 0.36) : vec3(0.2, 0.15, 0.36);
        // a sash bar across the middle of every window
        if (abs(f.y - 0.47) < 0.02) { col = vCol * 0.7; unlit = uLit; }
      }
    }
  } else if (kind == 3) {
    // The street far below: lane dashes and kerbs.
    float az = abs(vWp.z);
    col = vec3(0.2, 0.17, 0.3);
    if (az < 0.18 && fract(vWp.x / 7.0) < 0.5) col = vec3(0.95, 0.83, 0.5);
    if (az > 6.6 && az < 6.85) col = vec3(0.7, 0.62, 0.74);
  } else if (kind == 4) {
    // Sheet metal: slats down the sides, a fan on top.
    if (abs(n.y) < 0.3) { if (fract(vWp.y * 4.0) < 0.3) col *= 0.72; }
    else { float r = length(vLp.xz * vScl.xz) / min(vScl.x, vScl.z); if (r < 0.36 && r > 0.07) col *= 0.6; }
  } else if (kind == 6) {
    // Staves of a water tank.
    float a = atan(vLp.z, vLp.x) * 5.1;
    col *= fract(a) < 0.5 ? 1.0 : 0.86;
    if (abs(fract(vLp.y * 3.0 + 0.5) - 0.5) < 0.06) col = vec3(0.24, 0.19, 0.33);
  } else if (kind == 8) {
    // The airship's livery, painted in its own space.
    float s = vLp.y;
    if (abs(s + 0.08) < 0.11) col = vec3(0.89, 0.25, 0.23);
    if (vLp.x > 0.62) col = vec3(0.17, 0.7, 0.64);
    if (abs(vLp.x + 0.55) < 0.03 || abs(vLp.x - 0.2) < 0.012 || abs(vLp.x + 0.2) < 0.012) col *= 0.82;
  }
  if (kind == 5) unlit = 1.0;
  #ifdef MAP
    vec4 tx = texture2D(map, vUv2);
    if (tx.a < 0.5) discard;
    col = tx.rgb;
  #endif
  if (uErase > 0.0) {
    // Rubbed out: what is left of this prop is the artist's blue pencil.
    float s = fract((gl_FragCoord.x + gl_FragCoord.y) * 0.085 + h21(floor(vWp.xz)) * 3.0);
    if (s > mix(1.0, 0.16, uErase)) discard;
    col = mix(col, vec3(0.52, 0.74, 0.98), uErase);
    unlit = 1.0;
  }
  float ndl = dot(n, uSun);
  float l = smoothstep(-0.35, 0.45, ndl);
  if (l > 0.12 && unlit < 0.5) l = min(l, mix(0.1, 1.0, sunShadow()));
  l = max(l, uMinL);
  gl_FragColor = vec4(col, unlit > 0.5 ? 1.0 : l * 0.9);
}`;

/** [r, g, b] in 0..1 from '#rrggbb' — print colours are used as written, never converted. */
export const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

export function makeMats(THREE, sun, soft) {
  const shared = { uSun: { value: sun }, uTime: { value: 0 } };
  const all = [];
  /** o: { inst, map, color '#hex', kind, lit (unlit ink), minL (never darker than this: the snipers), side, add (additive glow) } */
  const make = (o = {}) => {
    const defines = {};
    if (o.inst) defines.INST = '';
    if (o.map) defines.MAP = '';
    if (soft) defines.SOFT = '';
    const m = new THREE.ShaderMaterial({
      lights: true, defines, vertexShader: VERT, fragmentShader: FRAG, side: o.side || THREE.FrontSide,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.lights, {
        uColor: { value: new THREE.Vector3(...rgb(o.color || '#ffffff')) }, uKind: { value: o.kind || 0 }, uErase: { value: 0 }, uLit: { value: o.lit ? 1 : 0 }, uMinL: { value: o.minL || 0 }, map: { value: null },
      }]),
    });
    m.uniforms.uSun = shared.uSun;
    m.uniforms.uTime = shared.uTime;
    if (o.map) m.uniforms.map.value = o.map;
    if (o.add) {
      // Glow adds to the colour and leaves the light channel alone.
      m.blending = THREE.CustomBlending; m.blendEquation = THREE.AddEquation;
      m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor; m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor;
      m.transparent = true; m.depthWrite = false;
    }
    all.push(m);
    return m;
  };
  return {
    shared, make,
    setColor(m, hex) { const c = rgb(hex); m.uniforms.uColor.value.set(c[0], c[1], c[2]); },
    dispose() { for (const m of all) m.dispose(); all.length = 0; },
  };
}
