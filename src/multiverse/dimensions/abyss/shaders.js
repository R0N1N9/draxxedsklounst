// THE DEEP — the water itself. One block of GLSL every lit surface in the world shares:
// sunlight that reddens away with depth, the caustic net focused by the swell, the shadow
// map seen from the sun (so the kraken's bulk darkens the reef and cuts the light shafts),
// the two divers' torches, and the view-ray extinction that turns everything past ~70 m
// into the colour of the water behind it. Every material writes its distance from the eye
// into alpha: post.js marches the light shafts up to that distance (no depth texture).
//
// Uniform objects are shared by reference: index.js updates U once a frame and every
// material sees it.

export const WATER_GLSL = `
uniform float uTime;
uniform vec3 uCam, uL, uSunCol;
uniform sampler2D tCaustic, tNoise, tShadow;
uniform mat4 uShadowMat;
uniform float uShadowTexel, uDim, uFogK;
uniform vec3 uLampPos[2];
uniform vec3 uLampDir[2];
uniform vec3 uLampCol[2];

const vec3 EXT = vec3(0.072, 0.040, 0.035); // per metre of view ray: red goes first
const vec3 ABS = vec3(0.085, 0.034, 0.026); // per metre of depth the sunlight has come down

vec3 sunAt(float y) { return uSunCol * exp(min(y, 0.0) * ABS) * (1.0 - 0.6 * uDim); }

// The colour of the water itself, looking along d from depth y: bright teal towards the
// surface, the sun's glow through it, blue-black below.
vec3 waterBg(vec3 d, float y) {
  vec3 deep = vec3(0.0008, 0.0045, 0.011);
  vec3 mid = vec3(0.010, 0.064, 0.092);
  vec3 hi = vec3(0.050, 0.235, 0.255);
  vec3 c = mix(deep, mid, smoothstep(-0.8, 0.08, d.y));
  c = mix(c, hi, smoothstep(0.02, 1.0, d.y));
  float s = max(dot(d, uL), 0.0);
  c += uSunCol * (0.035 * pow(s, 5.0) + 0.16 * pow(s, 40.0)) * smoothstep(-0.3, 0.4, d.y);
  return c * exp(min(y, 0.0) * vec3(0.034, 0.021, 0.017)) * (1.0 - 0.45 * uDim);
}

vec3 waterFog(vec3 col, vec3 p, float k) {
  vec3 v = p - uCam;
  float d = length(v);
  vec3 dir = v / max(d, 1e-3);
  vec3 T = exp(-EXT * d * uFogK * k);
  return col * T + waterBg(dir, uCam.y + dir.y * min(d, 70.0) * 0.5) * (1.0 - T);
}

float sunShadow(vec3 p, float bias) {
  vec4 s = uShadowMat * vec4(p, 1.0);
  if (s.x <= 0.0 || s.x >= 1.0 || s.y <= 0.0 || s.y >= 1.0) return 1.0;
  float z = s.z - bias, t = uShadowTexel;
#ifdef LEAN
  return step(z, texture2D(tShadow, s.xy).r);
#endif
  float a = step(z, texture2D(tShadow, s.xy + vec2(-0.6, -1.4) * t).r);
  float b = step(z, texture2D(tShadow, s.xy + vec2(1.4, -0.6) * t).r);
  float c = step(z, texture2D(tShadow, s.xy + vec2(0.6, 1.4) * t).r);
  float e = step(z, texture2D(tShadow, s.xy + vec2(-1.4, 0.6) * t).r);
  return (a + b + c + e) * 0.25;
}

// Where this point's sunlight came through the surface, and the net the swell focused it
// into. Deeper water blurs the net (a mip bias), as it does in life.
float caustics(vec3 p) {
  vec2 q = p.xz - uL.xz / uL.y * p.y;
  float t = uTime, blur = clamp(-p.y * 0.05 - 0.2, 0.0, 2.5);
#ifdef LEAN
  return texture2D(tCaustic, q * 0.052 + vec2(t * 0.013, t * 0.008)).r * 0.9;
#endif
  float a = texture2D(tCaustic, q * 0.052 + vec2(t * 0.013, t * 0.008), blur).r;
  float b = texture2D(tCaustic, q * 0.067 + vec2(-t * 0.010, t * 0.014) + 0.37, blur).r;
  return a * b * 3.2 + (a + b) * 0.12;
}

vec3 lamps(vec3 p, vec3 n) {
  vec3 acc = vec3(0.0);
#ifdef LEAN
  for (int i = 0; i < 2; i++) { vec3 l = uLampPos[i] - p; acc += uLampCol[i] * 0.3 / (1.0 + dot(l, l) * 0.08); }
  return acc;
#endif
  for (int i = 0; i < 2; i++) {
    vec3 l = uLampPos[i] - p;
    float d = length(l);
    l /= max(d, 1e-3);
    float cone = smoothstep(0.78, 0.95, dot(-l, uLampDir[i]));
    acc += uLampCol[i] * (cone * 0.85 + 0.15) * max(dot(n, l) * 0.8 + 0.2, 0.0) * exp(-d * 0.06) / (1.0 + d * d * 0.045);
  }
  return acc;
}

vec3 ambientAt(vec3 n, float y) {
  return mix(vec3(0.003, 0.016, 0.026), vec3(0.032, 0.13, 0.15), n.y * 0.5 + 0.5) * exp(min(y, 0.0) * vec3(0.05, 0.027, 0.021)) * (1.0 - 0.5 * uDim);
}

// albedo lit by the sun (shadowed, with caustics), the water's ambient and the torches.
vec3 litWater(vec3 albedo, vec3 p, vec3 n, float ao, float wrap, float cauK) {
  float sh = sunShadow(p, 0.0016);
  float ndl = max((dot(n, uL) + wrap) / (1.0 + wrap), 0.0);
  float cau = caustics(p) * smoothstep(-0.3, 0.7, n.y) * cauK;
  vec3 direct = sunAt(p.y) * sh * ndl * (0.5 + cau * 1.7);
  return albedo * (direct + ambientAt(n, p.y) * ao + lamps(p, n));
}
`;

// Vertex side: world position and normal, instancing aware (uniform scales only).
export const VERT_COMMON = `
varying vec3 vW;
varying vec3 vN;
vec3 instPos(vec3 p) {
#ifdef USE_INSTANCING
  return (instanceMatrix * vec4(p, 1.0)).xyz;
#else
  return p;
#endif
}
vec3 instNrm(vec3 n) {
#ifdef USE_INSTANCING
  return mat3(instanceMatrix) * n;
#else
  return n;
#endif
}
`;

// ---------------------------------------------------------------------------------------
// Reef: terrain, rock, coral, wreck. Albedo from vertex colours (and the instance colour),
// detail from the noise texture by triplanar projection.
const REEF_VERT = VERT_COMMON + `
varying vec3 vC;
varying vec3 vO;
uniform float uTime;
uniform vec4 uSway;
void main() {
  vec3 p = instPos(position);
  vec3 n = instNrm(normal);
  vC = vec3(1.0);
#ifdef USE_COLOR
  vC = color;
#endif
#ifdef USE_INSTANCING_COLOR
  vC *= instanceColor;
#endif
  vO = position;
  vec4 w = modelMatrix * vec4(p, 1.0);
#ifdef SWAY
  // sea fans and soft coral lean with the surge, more at the top
  float k = max(position.y, 0.0) * uSway.x;
  w.x += sin(uTime * 0.9 + w.z * 0.13 + w.x * 0.05) * k;
  w.z += cos(uTime * 0.7 + w.x * 0.11) * k * 0.6;
#endif
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const REEF_FRAG = `
precision highp float;
varying vec3 vW;
varying vec3 vN;
varying vec3 vC;
varying vec3 vO;
${WATER_GLSL}
vec4 tri(vec3 p, vec3 n, float s) {
#ifdef LEAN
  return texture2D(tNoise, (abs(n.y) > 0.6 ? p.xz : abs(n.x) > abs(n.z) ? p.yz : p.xy) * s);
#endif
  vec3 b = abs(n);
  b = pow(b, vec3(4.0));
  b /= (b.x + b.y + b.z);
  return texture2D(tNoise, p.yz * s) * b.x + texture2D(tNoise, p.xz * s) * b.y + texture2D(tNoise, p.xy * s) * b.z;
}
void main() {
#ifdef FAN
  // a sea fan's lattice: radial veins and cross-links, the rest is water
  float fr = length(vO.xy), fa = atan(vO.y, vO.x);
  float veins = abs(fract(fa * 4.5 + fr * 0.6) - 0.5), links = abs(fract(fr * 8.0 + sin(fa * 23.0) * 0.15) - 0.5);
  if (min(veins, links * 1.4) > 0.09 && fr < 0.96) discard;
#endif
#ifdef NET
  vec2 mesh = abs(fract(vec2(vO.z + vO.x * 0.3, vO.y) * 2.6) - 0.5);
  if (min(mesh.x, mesh.y) > 0.06 || texture2D(tNoise, vO.zy * 0.08).a > 0.62) discard;
#endif
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 alb = vC;
  float ao = 1.0;
  vec4 big = tri(vW, n, 0.021), fine = tri(vW, n, 0.17);
#ifdef TERRAIN
  float flt = smoothstep(0.55, 0.85, n.y);
  // sand: ripples across the current, combed by noise
  float rip = sin(vW.x * 1.7 + vW.z * 0.6 + big.r * 9.0) * 0.5 + 0.5;
  vec3 sand = vec3(0.78, 0.7, 0.55) * (0.82 + rip * 0.16 + fine.b * 0.12);
  vec3 rock = mix(vec3(0.3, 0.27, 0.25), vec3(0.46, 0.4, 0.35), big.g) * (0.7 + fine.r * 0.5);
  // banded strata on the wall
  rock *= 0.85 + 0.2 * sin(vW.y * 2.3 + big.r * 6.0);
  float sandy = flt * smoothstep(0.35, 0.6, vC.r + big.a * 0.5 - 0.25);
  alb = mix(rock * vC.g * 1.3, sand, sandy);
  // encrusting life on the rock: green algae on top faces, purple coralline under
  alb = mix(alb, vec3(0.2, 0.32, 0.12), (1.0 - sandy) * smoothstep(0.3, 0.8, n.y) * smoothstep(0.45, 0.7, big.r) * 0.6);
  alb = mix(alb, vec3(0.42, 0.18, 0.34), (1.0 - sandy) * smoothstep(0.55, 0.8, fine.g) * 0.35);
  ao = mix(0.55, 1.0, vC.b);
#endif
#ifdef ROCK
  alb *= 0.65 + big.g * 0.5 + fine.r * 0.25;
  alb = mix(alb, vec3(0.2, 0.31, 0.13), smoothstep(0.35, 0.85, n.y) * smoothstep(0.4, 0.65, big.r) * 0.7);
  alb = mix(alb, vec3(0.45, 0.2, 0.38), smoothstep(0.6, 0.85, fine.g) * 0.3);
#endif
#ifdef CORAL
  // polyps: a fine bumpy grain and paler tips
  alb *= 0.7 + fine.b * 0.45 + 0.25 * smoothstep(0.4, 1.4, vO.y);
#endif
#ifdef WRECK
  // painted planks gone to rust and weed: streaks run down, weed grows on top
  float streak = texture2D(tNoise, vec2(vW.x * 0.35 + vW.z * 0.35, vW.y * 0.04)).g;
  alb *= 0.6 + 0.5 * fine.r;
  alb = mix(alb, vec3(0.36, 0.17, 0.07), smoothstep(0.45, 0.8, streak) * 0.75);
  alb = mix(alb, vec3(0.16, 0.26, 0.1), smoothstep(0.2, 0.8, n.y) * smoothstep(0.4, 0.62, big.r) * 0.85);
  alb *= 0.85 + 0.15 * sin(vO.y * 9.0);
#endif
  vec3 col = litWater(alb, vW, n, ao, 0.25, 1.0);
  gl_FragColor = vec4(waterFog(col, vW, 1.0), length(vW - uCam));
}`;

// The uniforms every water-lit material shares (by reference).
export function makeShared(THREE, tex) {
  const v3 = () => new THREE.Vector3();
  return {
    uTime: { value: 0 },
    uCam: { value: v3() },
    uL: { value: new THREE.Vector3(0.36, 0.8, 0.48).normalize() },
    uSunCol: { value: new THREE.Vector3(1.9, 1.62, 1.15) },
    tCaustic: { value: tex.caustic },
    tNoise: { value: tex.noise },
    tShadow: { value: null },
    uShadowMat: { value: new THREE.Matrix4() },
    uShadowTexel: { value: 1 / 1024 },
    uDim: { value: 0 },
    uFogK: { value: 1 },
    uLampPos: { value: [v3(), v3()] },
    uLampDir: { value: [new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, -1)] },
    uLampCol: { value: [v3(), v3()] },
    uWake: { value: new THREE.Vector4(0, -100, 0, 0) },
  };
}

// Every material this world makes; dispose() frees them all.
export function makeMaterials(THREE, U, lean) {
  const all = [];
  const add = (m) => { all.push(m); return m; };
  // lean: the software-rasteriser build (one shadow tap, one detail tap)
  const shader = (o) => add(new THREE.ShaderMaterial({ ...o, defines: { ...(o.defines || {}), ...(lean ? { LEAN: 1 } : {}) }, uniforms: { ...U, ...(o.uniforms || {}) } }));
  const reef = (define, extra = {}) => shader({ vertexShader: REEF_VERT, fragmentShader: REEF_FRAG, defines: { [define]: 1, ...(extra.defines || {}) }, vertexColors: true, uniforms: { uSway: { value: new THREE.Vector4(extra.sway || 0, 0, 0, 0) } }, side: extra.side || THREE.FrontSide });
  // the software build shares one program between rock, coral and wreck, and leaves out
  // the fans and the net (a dozen fewer shaders to compile on a CPU)
  const rock = reef('ROCK');
  return {
    all,
    add,
    shader,
    lean: !!lean,
    terrain: reef('TERRAIN'),
    rock,
    coral: lean ? rock : reef('CORAL'),
    coralSway: lean ? rock : reef('CORAL', { defines: { SWAY: 1 }, sway: 0.05, side: THREE.DoubleSide }),
    wreck: lean ? rock : reef('WRECK', { side: THREE.DoubleSide }),
    net: lean ? null : reef('WRECK', { defines: { NET: 1 }, side: THREE.DoubleSide }),
    reefFan: lean ? null : reef('CORAL', { defines: { FAN: 1, SWAY: 1 }, sway: 0.08, side: THREE.DoubleSide }),
    dispose() { for (const m of all) m.dispose(); all.length = 0; },
  };
}

// Blending that leaves the distance in alpha alone (post.js reads it).
export function keepAlpha(THREE, m, additive) {
  m.transparent = true;
  m.depthWrite = false;
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.SrcAlphaFactor;
  m.blendDst = additive ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor;
  m.blendEquationAlpha = THREE.AddEquation;
  m.blendSrcAlpha = THREE.ZeroFactor;
  m.blendDstAlpha = THREE.OneFactor;
  return m;
}
