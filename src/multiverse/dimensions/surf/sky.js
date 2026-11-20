// BREAK POINT — golden hour. The sky is painted once into a small HDR panorama (gradient,
// sun glow, two decks of cloud lit from underneath); the dome shows it, the sea reflects it,
// and one haze function tints everything with distance so the horizon closes without a seam.
import { GLSL_NOISE } from '../../kit.js';

const AZ = 0.56, EL = 0.14; // the sun: out to sea and off to the right, about eight degrees up
export const SUN = { x: Math.sin(AZ) * Math.cos(EL), y: Math.sin(EL), z: Math.cos(AZ) * Math.cos(EL) };
export const SUN_COLOR = [1.0, 0.56, 0.24];

// vec3 hazeColor(vec3 dir) — the colour distance fades to, looking along the unit vector dir.
// Works in any space as long as uSunDir is given in the same one.
export const HAZE_GLSL = `
vec3 hazeColor(vec3 dir, vec3 sun) {
  float s = max(dot(dir, sun), 0.0);
  return mix(vec3(0.25, 0.235, 0.265), vec3(0.98, 0.5, 0.22), s * s * s) + vec3(1.1, 0.45, 0.1) * pow(s, 24.0);
}`;

// vec3 skyTex(vec3 dir, float lod) — look the panorama up (lod > 0: blurred, for what rough water
// mirrors). Rows are packed towards the horizon.
export const SKY_GLSL = `
uniform sampler2D tSky;
vec3 skyTex(vec3 d, float lod) {
  float v = sqrt(clamp(asin(clamp(d.y, 0.0, 1.0)) * 0.63662, 0.0, 1.0));
  return textureLod(tSky, vec2(atan(d.x, d.z) * 0.1591549 + 0.5, v * 0.985 + 0.0075), lod).rgb;
}`;

const BAKE = `precision highp float;
varying vec2 vUv;
uniform vec3 uSunDir;
${GLSL_NOISE}
${HAZE_GLSL}
float deck(vec2 q) { return fbm(q + (fbm(q * 0.5 + 7.3) - 0.5) * 2.2); }
void main() {
  float az = (vUv.x - 0.5) * 6.2831853, el = vUv.y * vUv.y * 1.5707963;
  vec3 d = vec3(sin(az) * cos(el), sin(el), cos(az) * cos(el));
  float y = d.y, sd = max(dot(d, uSunDir), 0.0), saz = max(dot(normalize(d.xz), normalize(uSunDir.xz)), 0.0);
  vec3 col = mix(hazeColor(d, uSunDir), mix(vec3(0.075, 0.15, 0.25), vec3(0.62, 0.31, 0.2), saz * saz), smoothstep(0.0, 0.22, y));
  // opposite the sun: the blue-grey shadow of the earth on the horizon, and the rose belt above it
  col = mix(col, vec3(0.55, 0.36, 0.31), smoothstep(0.005, 0.07, y) * (1.0 - smoothstep(0.07, 0.24, y)) * (1.0 - saz) * 0.65);
  col = mix(col, vec3(0.012, 0.07, 0.15), smoothstep(0.1, 0.8, y));
  col += vec3(1.0, 0.45, 0.13) * (pow(sd, 5.0) * 0.3 + pow(sd, 36.0) * 0.9);
  // Clouds live on a plane overhead; dividing by height lays them down towards the horizon.
  vec2 p = d.xz / (y + 0.1);
  vec2 ls = normalize(uSunDir.xz) * 0.22;
  // high cirrus: thin streaks that have already gone pink
  float ci = smoothstep(0.5, 0.82, fbm(p * vec2(0.22, 0.95) + vec2(11.0, 3.0) + fbm(p * 0.4) * 0.8)) * smoothstep(0.03, 0.3, y);
  col = mix(col, mix(vec3(0.7, 0.42, 0.36), vec3(1.5, 0.74, 0.34), saz * saz), ci * 0.6);
  // low deck: long bars, dark bellies, burning edges on the side that faces the sun
  vec2 q = p * vec2(0.42, 1.25) + vec2(2.0, -1.0);
  float n = deck(q), dens = smoothstep(0.5, 0.7, n) * smoothstep(0.012, 0.09, y) * (1.0 - smoothstep(0.55, 0.95, y) * 0.6);
  float lit = clamp((n - deck(q + ls * vec2(0.42, 1.25))) * 5.0 + 0.42, 0.0, 1.0);
  vec3 cl = mix(mix(vec3(0.1, 0.095, 0.14), vec3(0.32, 0.15, 0.14), saz * saz), mix(vec3(1.0, 0.52, 0.36), vec3(2.6, 1.1, 0.3), pow(saz, 1.5)), lit * lit);
  col = mix(col, cl, dens * 0.92);
  gl_FragColor = vec4(col, 1.0);
}`;

const DOME_V = `varying vec3 vDir; void main() { vDir = position; vec4 p = viewMatrix * vec4(position * 3000.0 + cameraPosition, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.99999; }`;
const DOME_F = `precision highp float;
varying vec3 vDir;
uniform vec3 uSunDir;
uniform float uTime;
${SKY_GLSL}
${HAZE_GLSL}
void main() {
  vec3 d = normalize(vDir);
  vec3 col = d.y > 0.0 ? skyTex(d, 0.0) : hazeColor(normalize(vec3(d.x, 0.0, d.z)), uSunDir);
  float sd = dot(d, uSunDir);
  // The disc: flattened a touch by the thick air, white-hot in the middle.
  vec3 e = d - uSunDir; e.y *= 1.18;
  float disc = 1.0 - smoothstep(0.019, 0.023, length(e));
  col += vec3(1.0, 0.62, 0.26) * disc * 26.0 + vec3(1.0, 0.5, 0.2) * pow(max(sd, 0.0), 900.0) * 3.0;
  gl_FragColor = vec4(col, 0.0); // alpha 0 marks "sky" for the light shafts
}`;

export function makeSky(THREE, renderer, Q) {
  const sun = new THREE.Vector3(SUN.x, SUN.y, SUN.z);
  // (a software rasteriser paints a smaller panorama: this one pass is its most expensive second)
  const rt = new THREE.WebGLRenderTarget(Q.soft ? 512 : 1024, Q.soft ? 256 : 512, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping });
  {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uSunDir: { value: sun } }, fragmentShader: BAKE, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    });
    const quad = new THREE.Mesh(geo, mat);
    quad.frustumCulled = false;
    renderer.setRenderTarget(rt);
    renderer.render(quad, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
    renderer.setRenderTarget(null);
    geo.dispose();
    mat.dispose();
  }
  const uniforms = { tSky: { value: rt.texture }, uSunDir: { value: sun }, uTime: { value: 0 } };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.ShaderMaterial({ uniforms, vertexShader: DOME_V, fragmentShader: DOME_F, side: THREE.BackSide, depthWrite: false, depthTest: true }));
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  return { dome, texture: rt.texture, sun, dispose() { rt.dispose(); dome.geometry.dispose(); dome.material.dispose(); } };
}
