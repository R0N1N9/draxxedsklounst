import * as THREE from 'three';

// Time-of-day palettes. Dusk is the signature look; golden hour is the alternate.
export const PALETTES = {
  dusk: {
    name: 'Dusk',
    zenith: '#0b0c1c',
    mid: '#272644',
    horizon: '#5b4a76',
    sunHaze: '#d9806c',
    sun: '#ffa486',
    sunIntensity: 4.5,
    sunElevation: 3.5,
    sunAzimuth: 180, // degrees, 180 = toward -X (west, down the valley)
    hemiSky: '#7a72a8',
    hemiGround: '#3a3446',
    hemiIntensity: 7.5,
    hazeDensity: 0.00088,
    hazeFloor: 0.16,
    hazeFalloff: 130,
    stars: 1,
    exposure: 1.05,
    glint: 0.85,
    windowGlow: 1,
  },
  golden: {
    name: 'Golden Hour',
    zenith: '#2b4f8c',
    mid: '#8d8fb3',
    horizon: '#e7b27d',
    sunHaze: '#ffd590',
    sun: '#ffd09a',
    sunIntensity: 6.5,
    sunElevation: 9,
    sunAzimuth: 180,
    hemiSky: '#a7b6da',
    hemiGround: '#5c4a3a',
    hemiIntensity: 6.0,
    hazeDensity: 0.00075,
    hazeFloor: 0.14,
    hazeFalloff: 150,
    stars: 0,
    exposure: 1.0,
    glint: 1.15,
    windowGlow: 0.35,
  },
};

export const hazeUniforms = {
  uHazeColor: { value: new THREE.Color() },
  uHazeSunColor: { value: new THREE.Color() },
  uSunDir: { value: new THREE.Vector3(-1, 0.06, 0).normalize() },
  uHazeDensity: { value: 0.001 },
  uHazeFloor: { value: 0.15 },
  uHazeFalloff: { value: 130 },
  uHazeBase: { value: 0 },
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector2(1, 0) }, // world-space wind vector (m/s, x/z)
};

const HAZE_PARS_V = /* glsl */ `varying vec3 vHazeWorld;`;
const HAZE_V = /* glsl */ `
{
  vec4 hzW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    hzW = instanceMatrix * hzW;
  #endif
  hzW = modelMatrix * hzW;
  vHazeWorld = hzW.xyz;
}`;
export const HAZE_PARS_F = /* glsl */ `
varying vec3 vHazeWorld;
uniform vec3 uHazeColor;
uniform vec3 uHazeSunColor;
uniform vec3 uSunDir;
uniform float uHazeDensity;
uniform float uHazeFloor;
uniform float uHazeFalloff;
uniform float uHazeBase;
vec3 hazeTint(vec3 dir) {
  float s = pow(max(dot(dir, uSunDir), 0.0), 5.0);
  return mix(uHazeColor, uHazeSunColor, s);
}
float hazeAmount(vec3 camPos, vec3 wp) {
  vec3 ray = wp - camPos;
  float dist = length(ray);
  float y0 = max(camPos.y - uHazeBase, -30.0);
  float y1 = max(wp.y - uHazeBase, -30.0);
  float H = uHazeFalloff;
  float dy = y1 - y0;
  float e0 = exp(-y0 / H);
  float e1 = exp(-y1 / H);
  float avg = abs(dy) > 0.5 ? (e0 - e1) * H / dy : e0;
  float od = uHazeDensity * dist * (avg + uHazeFloor) + pow(dist / 2400.0, 2.0) * 1.1;
  return 1.0 - exp(-od);
}`;
const HAZE_F = /* glsl */ `
{
  vec3 hzDir = normalize(vHazeWorld - cameraPosition);
  float hzF = hazeAmount(cameraPosition, vHazeWorld);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeTint(hzDir), hzF);
}`;

// Patch any built-in material so it gets our height-based, sun-tinted haze.
// `extra` can inject additional vertex code (e.g. wind sway) before projection.
export function withHaze(material, extra = null) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    Object.assign(shader.uniforms, hazeUniforms);
    if (extra && extra.uniforms) Object.assign(shader.uniforms, extra.uniforms);
    let vs = shader.vertexShader;
    vs = vs.replace('#include <fog_pars_vertex>', HAZE_PARS_V + '\nuniform float uTime;\nuniform vec2 uWind;\n' + (extra?.parsVertex || ''));
    if (extra?.vertex) vs = vs.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + extra.vertex);
    vs = vs.replace('#include <fog_vertex>', HAZE_V);
    shader.vertexShader = vs;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <fog_pars_fragment>', HAZE_PARS_F + (extra?.parsFragment || ''))
      .replace('#include <fog_fragment>', (extra?.fragment || '') + HAZE_F);
  };
  material.customProgramCacheKey = () => 'haze' + (extra?.key || '');
  return material;
}

export function makeSky() {
  const uniforms = {
    uZenith: { value: new THREE.Color() },
    uMid: { value: new THREE.Color() },
    uSun: { value: new THREE.Color() },
    uStars: { value: 1 },
    uTime: hazeUniforms.uTime,
    uHazeColor: hazeUniforms.uHazeColor,
    uHazeSunColor: hazeUniforms.uHazeSunColor,
    uSunDir: hazeUniforms.uSunDir,
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 uZenith, uMid, uSun, uHazeColor, uHazeSunColor, uSunDir;
      uniform float uStars, uTime;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        float s = max(dot(d, uSunDir), 0.0);
        vec3 horizon = mix(uHazeColor, uHazeSunColor, pow(s, 5.0));
        vec3 col = mix(horizon, uMid, smoothstep(0.0, 0.28, h));
        col = mix(col, uZenith, smoothstep(0.22, 0.95, h));
        col = mix(col, horizon * 0.85, smoothstep(0.0, -0.15, h));
        // Sun disc + bloom-y corona.
        col += uSun * (smoothstep(0.9993, 0.9997, s) * 6.0 + pow(s, 64.0) * 0.6 + pow(s, 8.0) * 0.18);
        // Stars.
        if (uStars > 0.0 && h > 0.05) {
          vec3 g = floor(d * 380.0);
          float r = hash(g);
          if (r > 0.9965) {
            float tw = 0.65 + 0.35 * sin(uTime * (1.0 + r * 3.0) + r * 50.0);
            col += vec3(0.9, 0.9, 1.0) * tw * smoothstep(0.08, 0.5, h) * uStars * 1.4;
          }
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.userData.uniforms = uniforms;
  return mesh;
}

export function applyPalette(pal, { sky, sunLight, hemi, renderer }) {
  hazeUniforms.uHazeColor.value.set(pal.horizon);
  hazeUniforms.uHazeSunColor.value.set(pal.sunHaze);
  hazeUniforms.uHazeDensity.value = pal.hazeDensity;
  hazeUniforms.uHazeFloor.value = pal.hazeFloor;
  hazeUniforms.uHazeFalloff.value = pal.hazeFalloff;
  const el = THREE.MathUtils.degToRad(pal.sunElevation);
  const az = THREE.MathUtils.degToRad(pal.sunAzimuth);
  const dir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el) + 0.12).normalize();
  hazeUniforms.uSunDir.value.copy(dir);
  const u = sky.userData.uniforms;
  u.uZenith.value.set(pal.zenith);
  u.uMid.value.set(pal.mid);
  u.uSun.value.set(pal.sun);
  u.uStars.value = pal.stars;
  sunLight.color.set(pal.sun);
  sunLight.intensity = pal.sunIntensity;
  hemi.color.set(pal.hemiSky);
  hemi.groundColor.set(pal.hemiGround);
  hemi.intensity = pal.hemiIntensity;
  renderer.toneMappingExposure = pal.exposure;
  return dir;
}
