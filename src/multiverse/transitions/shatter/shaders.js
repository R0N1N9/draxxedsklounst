// BROKEN REALITY — GLSL. One program draws every piece of glass in the film (the old world's
// shards, the new world's, the drifting panes of other realities and the intact pane that
// arrives); one paints the space between dimensions; three small ones bloom and grade it.
import { GLSL_NOISE } from '../../kit.js';

// The crack front is not a circle: it runs ahead along some bearings and lags along others.
// The same function exists in JS (shatter.js) so that shards and pixels agree on it.
const FINGER = `
uniform vec4 uFinger;
float finger(float a) { return 0.62 + 0.38 * sin(a * uFinger.x + uFinger.y) * sin(a * uFinger.z + uFinger.w); }`;

export const SHARD_VERT = `
uniform sampler2D tPose;   // per shard: [position, scale] [quaternion] [facet, picture, depth, glow] [loose, -, -, -]
attribute vec2 aUv;
attribute vec2 aRest;
attribute vec3 aData;
varying vec2 vUv;
varying vec2 vRest;
varying vec3 vN;
varying vec3 vW;
varying vec4 vAux;
varying vec4 vEFS;
varying vec3 vVl;
vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
void main() {
  int id = int(aData.y + 0.5);
  vec4 p0 = texelFetch(tPose, ivec2(0, id), 0);
  vec4 q = texelFetch(tPose, ivec2(1, id), 0);
  vAux = texelFetch(tPose, ivec2(2, id), 0);
  vec3 l = position;
  l.z *= vAux.z; // depth 0: the slab is a flat piece of the picture
  vec3 w = p0.xyz + qrot(q, l * p0.w);
  vN = qrot(q, normalize(vec3(normal.xy * vAux.z, normal.z) + vec3(0.0, 0.0, 1e-4)));
  vW = w;
  vVl = qrot(vec4(-q.xyz, q.w), cameraPosition - w); // the eye, in the shard's own frame
  vUv = aUv;
  vRest = aRest;
  vEFS = vec4(aData.x, aData.z, fract(aData.y * 0.6180339 + 0.137), texelFetch(tPose, ivec2(3, id), 0).x);
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

export const SHARD_FRAG = `
precision highp float;
uniform sampler2D tImg;    // the picture this glass carries
uniform sampler2D tVoid;   // what is behind it (the space between dimensions)
uniform vec2 uRes, uFocus;
uniform float uHasVoid, uFront, uSoft, uShimmer, uKey, uBroad, uGain, uMirror, uFrost, uJolt, uEdge, uDirect, uSheen;
uniform vec3 uLightDir, uLightCol, uKeyDir, uTint, uCrackCol, uAmb, uFrostCol;
varying vec2 vUv;
varying vec2 vRest;
varying vec3 vN;
varying vec3 vW;
varying vec4 vAux;
varying vec4 vEFS;
varying vec3 vVl;
uniform vec2 uPar;
uniform vec3 uRipple; // radius of the wave front, its strength, its wavelength
${FINGER}
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float ndv = abs(dot(N, V));
  float fres = pow(1.0 - ndv, 4.0);
  vec3 R = reflect(-V, N);
  vec2 nv = (viewMatrix * vec4(N, 0.0)).xy;
  float facet = vAux.x, pic = vAux.y, depth = vAux.z, glow = vAux.w;
  float face = vEFS.y, seed = vEFS.z;
  bool rimFace = face > 0.5 && face < 1.5;

  // How far the cracks have run (or, at the end, how far they have healed back).
  vec2 d = vRest - uFocus;
  float dl = length(d);
  float rr = uFront * finger(atan(d.y, d.x));
  float mask = smoothstep(rr, rr - uSoft, dl);
  float band = exp(-abs(dl - rr) * 14.0) * uShimmer;
  float rim = mask * depth;

  // The picture, read through a facet that no longer sits quite where its neighbours do.
  vec2 uv = vUv + (vec2(seed, fract(seed * 7.13)) - 0.5) * uJolt * facet;
  // The blow travels through the sheet as a ring that bends the picture: this is glass.
  float rp = dl - uRipple.x;
  uv += d / max(dl, 1e-3) * sin(rp * uRipple.z) * exp(-rp * rp * 26.0) * uRipple.y;
  // A pane from another reality is a window: its picture lies behind the glass and slides as we pass.
  uv -= clamp(vVl.xy / max(abs(vVl.z), 0.35), -1.5, 1.5) * uPar;
  float ca = (0.003 + 0.022 * (1.0 - ndv)) * facet;
  vec3 img = vec3(texture2D(tImg, uv + nv * ca).r, texture2D(tImg, uv).g, texture2D(tImg, uv - nv * ca).b) * uGain;

  // Clear glass shows what is behind it, bent by the surface.
  vec2 suv = gl_FragCoord.xy / uRes;
  vec3 behind = mix(texture2D(tImg, vUv + nv * 0.045).rgb * 1.2 + 0.05, texture2D(tVoid, suv + nv * 0.075).rgb, uHasVoid);
  vec3 glass = behind * uTint;

  // Frosted glass (a pane that has not yet turned its picture to us): milky, a little
  // translucent, sand-blasted.
  float sand = fract(sin(dot(floor(vRest * 420.0), vec2(12.9898, 78.233))) * 43758.5453);
  vec3 frost = mix(uFrostCol * (0.6 + 0.4 * ndv) * (0.95 + 0.1 * sand), glass * 1.5 + 0.18, 0.28);
  float fr = uFrost * (1.0 - pic);

  vec3 col;
  if (face < 0.5) col = mix(mix(glass, img, pic), frost, fr);
  else if (face > 1.5) col = mix(mix(glass, img * 0.42, pic * 0.8), frost, fr);
  else col = mix(img, glass * 1.12 + uAmb * 0.3, rim);

  // Light: the far glow of the next reality, a cool ambient, and a hard key behind the lens
  // that turns a whole facet white for the instant it lines up — the glitter of falling glass.
  float lobe = max(dot(R, uLightDir), 0.0);
  vec3 env = uLightCol * (pow(lobe, 28.0) * 2.6 + pow(lobe, 3.0) * 0.32) + uAmb * (0.6 + 0.4 * R.y);
  float kd = max(dot(R, uKeyDir), 0.0);
  float key = (pow(kd, 64.0) + pow(kd, 7.0) * 0.14 * uBroad) * vEFS.w; // only glass that has come loose can turn to the light
  float lit = rimFace ? rim : facet;
  // The key rolls off instead of clipping, so a highlight has a soft shoulder even in eight bits.
  vec3 spec = (env * (0.05 + 0.95 * fres) * (rimFace ? 1.7 : 1.0) + vec3(1.15 * (1.0 - exp(-key * uKey * 1.5)))) * lit + env * uMirror;
  // A big pane also mirrors the room in long diagonal streaks that slide as it turns.
  float streak = sin((vRest.x * 0.9 + vRest.y * 0.5) * 2.6 + N.x * 9.0 + N.y * 5.0);
  spec += (uLightCol * 0.5 + 0.5) * smoothstep(0.55, 1.0, streak) * (0.1 + 0.5 * fres) * uSheen * step(face, 0.5);
  col *= 1.0 + (fract(seed * 3.7) - 0.5) * 0.16 * facet * uEdge;
  col += spec;

  // The crack itself: a hairline of light along the shard's outline, with a soft bleed.
  // Lit from one side, so one lip of every crack catches the light and the other stays in shade.
  vec2 gr = vec2(dFdx(vEFS.x), dFdy(vEFS.x));
  float gl = length(gr);
  float px = vEFS.x / max(gl, 1e-6);
  float lip = 0.2 + 0.8 * pow(max(dot(gr / max(gl, 1e-6), vec2(0.45, -0.89)), 0.0), 1.5);
  float line = (1.0 - smoothstep(0.5, 1.7, px)) * lip + exp(-px * 0.28) * 0.3 * (0.35 + 0.65 * lip);
  // ...and the shaded lip darkens the picture, so a crack still reads on a white world.
  col *= 1.0 - 0.6 * (1.0 - smoothstep(0.4, 2.4, px)) * (1.0 - lip) * mask * min(glow, 1.0) * depth;
  vec3 crack = uCrackCol * line * glow * mask * (rimFace ? 0.4 : 1.0) * (1.0 + band * 4.0);
  col += crack + vec3(band * 0.05 * facet);

  // Off screen, alpha is not coverage: it carries the light that did not fit in eight bits, for
  // the bloom. Drawn straight to the screen (uDirect) it must be 1.
  float over = max(max(spec.r, spec.g), spec.b) + max(max(crack.r, crack.g), crack.b) * 0.6;
  gl_FragColor = vec4(col, max(uDirect, clamp((over - 0.55) * 0.5, 0.0, 1.0)));
}`;

export const VOID_FRAG = `
precision highp float;
varying vec2 vUv;
uniform mat3 uCam;         // camera basis: right, up, back
uniform vec3 uPos, uDeep, uGlow, uFrom, uHot;
uniform vec2 uBox;
uniform float uTan, uAspect, uTime, uTravel, uSeed, uLight, uBleed, uBeams, uLattice, uDust, uCloud;
${GLSL_NOISE}
float fbm3(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * noise(p); p = p * 2.07 + 13.7; a *= 0.5; }
  return s / 0.875;
}
void main() {
  vec3 dir = normalize(uCam * vec3((vUv * 2.0 - 1.0) * vec2(uTan * uAspect, uTan), -1.0));
  float fwd = max(-dir.z, 0.0);
  vec3 tint = mix(uFrom, uGlow, uBleed);
  vec3 col = uDeep * (0.35 + 0.65 * fwd * fwd);

  // Two shells of cloud at different depths: they slide against each other as we travel.
  vec2 q = dir.xy / (0.45 + fwd);
  float c1 = fbm3(q * 1.25 + vec2(uSeed, uSeed * 0.37 + uTravel * 0.028));
  float c2 = fbm3(q * 2.8 + vec2(-uTravel * 0.06, uSeed * 1.3) + c1 * 1.3);
  float cloud = smoothstep(0.34, 0.82, c1) * (0.3 + 0.7 * c2);
  col += tint * cloud * uCloud * (0.3 + 0.7 * fwd);
  col += uHot * pow(c2, 4.0) * cloud * 0.35 * uCloud;

  // The far light: the next reality, a long way off.
  float g = pow(fwd, 5.0) * 0.1 + pow(fwd, 46.0) * 0.5 + pow(fwd, 700.0) * 2.0;
  vec2 ring = normalize(dir.xy + 1e-5);
  float rays = noise(ring * 3.1 + uSeed + uTime * 0.05) * noise(ring * 7.3 - uSeed - uTime * 0.08);
  g += pow(rays, 1.6) * pow(fwd, 3.0) * 2.2 * uBeams;
  col += uGlow * g * uLight + vec3(pow(fwd, 2600.0) * 1.6 * uLight);

  // A lattice: the walls of the corridor between worlds, ruled like a blueprint.
  if (uLattice > 0.0) {
    vec2 sg = vec2(dir.x < 0.0 ? -1.0 : 1.0, dir.y < 0.0 ? -1.0 : 1.0);
    vec2 tw = (uBox - uPos.xy * sg) / max(abs(dir.xy), vec2(1e-4));
    float th = min(tw.x, tw.y);
    vec3 hp = uPos + dir * th;
    vec2 gc = tw.x < tw.y ? vec2(hp.z * 0.5, hp.y * 0.8) : vec2(hp.z * 0.5, hp.x * 0.8);
    vec2 gl = abs(fract(gc) - 0.5);
    float wdt = 0.014 + th * 0.0016;
    float ln = smoothstep(wdt * 2.2, wdt, min(gl.x, gl.y)) + 0.35 * smoothstep(0.1, 0.0, length(gl));
    col += tint * ln * exp(-th * 0.085) * 0.55 * uLattice;
  }

  // Dust that rushes at the lens as we move.
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float z = fract(fi * 0.37 + uSeed - uTravel * 0.04);
    vec2 gq = dir.xy / max(fwd, 0.25) * mix(3.5, 30.0, z) + fi * 17.3;
    vec2 cell = floor(gq), f = fract(gq) - 0.5;
    float hh = hash21(cell + fi * 3.1);
    float pt = smoothstep(0.075, 0.0, length(f - (vec2(hh, fract(hh * 13.7)) - 0.5) * 0.7)) * step(0.7, fract(hh * 7.3));
    col += mix(tint, vec3(1.0), 0.65) * pt * (1.0 - z) * smoothstep(0.0, 0.12, z) * uDust;
  }

  col += (hash21(gl_FragCoord.xy + 3.7) - 0.5) * (2.0 / 255.0); // dither: these gradients band in 8 bits
  gl_FragColor = vec4(col, clamp((max(max(col.r, col.g), col.b) - 1.0) * 0.3, 0.0, 1.0));
}`;

export const COPY_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
void main() { gl_FragColor = texture2D(tSrc, vUv); }`;

// Bloom: a threshold on the way down (the alpha channel holds over-range light), tents on the way up.
export const DOWN_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uFirst;
vec3 tap(vec2 uv) {
  vec4 s = texture2D(tSrc, uv);
  if (uFirst < 0.5) return s.rgb;
  vec3 c = s.rgb * (1.0 + s.a * 5.0);
  return max(c - 0.78, 0.0) * 0.3;
}
void main() {
  vec3 c = tap(vUv) * 4.0 + tap(vUv + uTexel) + tap(vUv - uTexel) + tap(vUv + vec2(uTexel.x, -uTexel.y)) + tap(vUv + vec2(-uTexel.x, uTexel.y));
  gl_FragColor = vec4(c / 8.0, 1.0);
}`;

export const UP_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc, tAdd;
uniform vec2 uTexel;
void main() {
  vec3 c = texture2D(tSrc, vUv + uTexel).rgb + texture2D(tSrc, vUv - uTexel).rgb + texture2D(tSrc, vUv + vec2(uTexel.x, -uTexel.y)).rgb + texture2D(tSrc, vUv + vec2(-uTexel.x, uTexel.y)).rgb;
  gl_FragColor = vec4(c * 0.25 + texture2D(tAdd, vUv).rgb, 1.0);
}`;

// The lens: fringing towards the corners, bloom, vignette, grain, the flash, and the final fade.
export const GRADE_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tScene, tBloom;
uniform float uBloom, uFlash, uAlpha, uCA, uVig, uGrain, uTime, uAspect;
uniform vec3 uFlashCol, uFlashAt; // xy: where the flash starts (uv), z: how tightly it holds to that point
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec2 c = vUv - 0.5;
  float r2 = dot(c, c);
  vec2 off = c * (0.25 + r2 * 3.0) * uCA;
  vec3 col = vec3(texture2D(tScene, vUv - off).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv + off).b);
  col += texture2D(tBloom, vUv).rgb * uBloom;
  col *= 1.0 - uVig * smoothstep(0.1, 0.75, r2 * 1.5);
  col += (hash(gl_FragCoord.xy + fract(uTime * 7.31) * 113.0) - 0.5) * uGrain;
  // The flash is a front that leaves a point; at uFlash = 1 it has passed every corner.
  vec2 fa = vec2(max(uFlashAt.x, 1.0 - uFlashAt.x) * uAspect, max(uFlashAt.y, 1.0 - uFlashAt.y));
  float fl = clamp(uFlash * (1.0 + length(fa) * uFlashAt.z) - length((vUv - uFlashAt.xy) * vec2(uAspect, 1.0)) * uFlashAt.z, 0.0, 1.0);
  col = mix(col, uFlashCol, fl * fl * (3.0 - 2.0 * fl));
  gl_FragColor = vec4(clamp(col, 0.0, 1.0) * uAlpha, uAlpha);
}`;
