// GLSL for LAST SYNAPSE. Display-space maths throughout: nothing here includes three's
// colour-space chunks, so texels go out exactly as they came in (the first frame must
// be the old world, bit for bit).
import { GLSL_NOISE } from '../../kit.js';

// Circle of confusion shared by everything in the tissue: blur radius, as a fraction of
// the viewport height, of a point at view depth z. One lens for ribbons, cells and motes.
const DOF = `
uniform float uFocus, uAperture, uCocMax;
float cocAt(float z) { return min(uAperture * abs(1.0 / max(z, 0.5) - 1.0 / uFocus), uCocMax); }`;

// The impulse: every vertex carries the time the light reaches it (aTim.x), how fast
// its flash decays (y) and what it settles to (z). All animation is uTime against those.
const LIGHT = `
float litAt(vec4 tim, float t) { float dt = t - tim.x; return dt > 0.0 ? tim.z + (1.0 - tim.z) * exp(-dt * tim.y) : 0.0; }
float frontAt(vec4 tim, float t, float k) { float dt = t - tim.x; return dt > 0.0 ? exp(-dt * k) : 0.0; }`;

// ---------------------------------------------------------------------------
// Ribbons: dendrites, axons, myelin sheaths and the arcs that jump them. Camera-facing
// strips widened by the lens blur, so a fibre out of focus is a soft wide smear.
// ---------------------------------------------------------------------------
export const RIBBON_VERT = `
attribute vec4 aGeo;   // tangent.xyz, side * radius
attribute vec3 aCol;   // resting colour
attribute vec3 aLit;   // colour of the impulse
attribute vec4 aTim;   // on-time, decay, sustain, flood order
attribute vec2 aKA;    // kind (0 fibre, 1 sheath, 2 arc), arc length
uniform float uTime, uTan, uInvH, uFog, uFlood, uGain;
uniform vec3 uFloodCol;
${DOF}
${LIGHT}
varying vec3 vCol;
varying vec4 vP;       // across (-1..1), blur (0..1), kind, arc
void main() {
  vec3 p = position;
  vec3 toCam = cameraPosition - p;
  float z = length(toCam);
  toCam /= max(z, 1e-4);
  vec3 side = cross(aGeo.xyz, toCam);
  float sl = length(side);
  side = sl > 1e-4 ? side / sl : vec3(0.0, 1.0, 0.0);
  float rad = abs(aGeo.w);
  float sgn = aGeo.w < 0.0 ? -1.0 : 1.0;
  float zc = max(z, 0.5);
  float minW = 0.8 * zc * uTan * uInvH;          // never thinner than a pixel: fade instead
  float coc = cocAt(z) * zc * uTan;
  float core = max(rad, minW);
  float w = core + coc;
  p += side * sgn * w;
  float lit = litAt(aTim, uTime), front = frontAt(aTim, uTime, 14.0);
  float idle = 0.7 + 0.3 * sin(aKA.y * 0.45 - uTime * 1.6 + aTim.w * 6.2832);
  float fl = smoothstep(aTim.w * 0.7, aTim.w * 0.7 + 0.3, uFlood);
  vec3 base = mix(aCol, uFloodCol * (dot(aCol, vec3(0.34)) * 1.7 + 0.03), fl);
  float wide = aKA.x > 0.5 && aKA.x < 1.5 ? 0.4 : 1.0;   // a sheath is a surface, not a line: light it gently
  vec3 c = base * idle + (aLit * lit * 2.4 + mix(aLit, vec3(1.0), 0.6) * front * 2.2) * wide;
  if (aKA.x > 1.5) c *= 0.45 + 0.55 * step(0.35, fract(uTime * 43.0 + aTim.w * 7.0));
  float energy = min(1.0, rad / minW) * pow(core / w, 0.8);
  vCol = c * energy * exp(-z * uFog) * smoothstep(1.0, 4.0, z) * uGain;
  vP = vec4(sgn, coc / w, aKA.x, aKA.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

export const RIBBON_FRAG = `
precision highp float;
varying vec3 vCol;
varying vec4 vP;
void main() {
  float v = abs(vP.x);
  float edge = smoothstep(1.0, 0.7, v);
  float tube = (0.3 + 0.7 * v * v) * edge;                          // rim-lit: reads as a translucent tube
  if (vP.z > 0.5) tube = (0.14 + 0.86 * v * v * v) * edge * (0.92 + 0.08 * sin(vP.w * 18.0)) + 0.22 * exp(-v * v * 40.0); // sheath: glassy, faint lamellae, the axon showing through
  if (vP.z > 1.5) tube = pow(max(1.0 - v, 0.0), 1.5) * 1.7;         // arc: a hot filament
  float soft = exp(-v * v * 3.5) * 0.62;
  gl_FragColor = vec4(vCol * mix(tube, soft, smoothstep(0.0, 0.7, vP.y)), 1.0);
}`;

// ---------------------------------------------------------------------------
// Cell bodies: billboards shaded as translucent spheres, each with a memory inside.
// ---------------------------------------------------------------------------
export const SOMA_VERT = `
attribute vec2 aCorner;
attribute vec4 aSom;   // radius, memory tile, memory strength, flood order
attribute vec3 aCol;
attribute vec3 aLit;
attribute vec4 aTim;
uniform float uTime, uTan, uFog, uFlood, uGain;
uniform vec3 uFloodCol;
${DOF}
${LIGHT}
varying vec2 vUv;      // in cell radii
varying vec3 vCol;
varying vec3 vLit;
varying vec4 vS;       // blur (radii), lit, front, rnd
varying vec3 vMem;     // tile, strength, fog
void main() {
  vec4 mv = viewMatrix * vec4(position, 1.0);
  float z = max(-mv.z, 0.5);
  float rad = aSom.x * (1.0 + 0.035 * sin(uTime * 1.4 + aSom.w * 40.0));
  float coc = cocAt(z) * z * uTan;
  float ext = 1.5 + coc / rad;                   // room for the halo and the blur
  mv.xy += aCorner * rad * ext;
  vUv = aCorner * ext;
  float fl = smoothstep(aSom.w * 0.7, aSom.w * 0.7 + 0.3, uFlood);
  float fog = exp(-z * uFog) * smoothstep(1.0, 1.6, z / aSom.x) * uGain;
  vCol = mix(aCol, uFloodCol * (dot(aCol, vec3(0.34)) * 1.5 + 0.05), fl) * fog;
  vLit = aLit * fog;
  vS = vec4(coc / rad, litAt(aTim, uTime), frontAt(aTim, uTime, 7.0), aSom.w);
  vMem = vec3(aSom.y, aSom.z, fog);
  gl_Position = projectionMatrix * mv;
}`;

export const SOMA_FRAG = `
precision highp float;
uniform sampler2D tMem;
uniform float uTime, uTiles;
varying vec2 vUv;
varying vec3 vCol;
varying vec3 vLit;
varying vec4 vS;
varying vec3 vMem;
${GLSL_NOISE}
void main() {
  float d = length(vUv);
  float blur = vS.x;
  float e = 0.03 + blur;
  float sharp = 1.0 / (1.0 + 5.0 * blur);
  float body = smoothstep(1.0 + e, 1.0 - min(e, 0.9), d) / (1.0 + blur * 1.2);
  float rim = pow(clamp(d, 0.0, 1.0), 3.0);
  vec2 no = vec2(cos(vS.w * 40.0), sin(vS.w * 40.0)) * 0.22;
  float nuc = smoothstep(0.46 + e, 0.46 - e, length(vUv - no));
  float nol = smoothstep(0.13 + e, 0.13 - e, length(vUv - no * 1.5));
  float gran = noise(vUv * 7.0 + vS.w * 50.0);
  float halo = exp(-max(d - 1.0, 0.0) * 5.0) * (1.0 - body) * 0.32 * smoothstep(1.5, 1.15, d);
  vec3 c = vCol * body * (0.5 + 0.7 * rim + 0.25 * gran * sharp);
  c *= 1.0 - 0.4 * nuc * sharp;
  c += vCol * (nol * sharp * 0.6 + halo);
  // A memory, magnified by the cell like a lens; it gutters like a bad tube.
  vec2 m = vUv * 0.7;
  m *= 1.0 + 0.3 * dot(m, m);
  vec2 tuv = vec2((vMem.x + clamp(m.x * 0.5 + 0.5, 0.004, 0.996)) / uTiles, clamp(m.y * 0.5 + 0.5, 0.0, 1.0));
  vec4 mem = texture2D(tMem, tuv);
  float flick = 0.35 + 0.65 * noise(vec2(uTime * 6.0 + vS.w * 31.0, vS.w * 17.0));
  float scan = 0.85 + 0.15 * sin(vUv.y * 60.0 + uTime * 9.0);
  float mm = smoothstep(0.9, 0.5, d) * vMem.y * flick * scan * sharp * (1.0 + 1.6 * vS.y) * mem.a;
  c = c * (1.0 - 0.6 * min(mm, 1.0)) + mem.rgb * mm * vMem.z;
  // Firing: the body fills with the impulse's colour, white-hot for an instant.
  c += vLit * vS.y * (body * (0.5 + 0.6 * rim) + halo * 2.5) + mix(vLit, vec3(vMem.z), 0.5) * vS.z * (body * (0.4 + 0.6 * rim) + halo * 2.0) * 1.5;
  gl_FragColor = vec4(c, 1.0);
}`;

// ---------------------------------------------------------------------------
// Sprites: neurotransmitter motes (bokeh), sparks, vesicles, shock rings, receptors.
// Built in clip space as capsules stretched along their motion relative to the camera,
// which is what turns a field of dots into speed.
// ---------------------------------------------------------------------------
export const SPRITE_VERT = `
attribute vec2 aCorner;
attribute vec3 aVel;   // mote: drift amplitude · spark: velocity · vesicle: displacement
attribute vec4 aTim;   // start, life, world radius, rnd
attribute vec3 aCol;
attribute float aKind; // 0 mote, 1 spark, 2 vesicle, 3 ring, 4 receptor
uniform float uTime, uTan, uInvH, uFog, uFlood, uGain, uShutter, uAspect;
uniform vec3 uCamVel, uFloodCol;
${DOF}
varying vec2 vQ;
varying vec4 vC;
varying vec2 vS;       // streak / radius, blur / radius
void main() {
  float tau = uTime - aTim.x, life = aTim.y, rnd = aTim.w;
  float k = clamp(tau / life, 0.0, 1.0);
  vec3 p = position, vel = vec3(0.0), col = aCol;
  float size = aTim.z, a = 1.0;
  if (aKind < 0.5) {
    float ph = uTime * (0.25 + rnd * 0.5) + rnd * 40.0;
    p += aVel * vec3(sin(ph), sin(ph * 1.31 + 1.7), cos(ph * 0.83));
    a = 0.55 + 0.45 * sin(uTime * (1.0 + rnd * 2.0) + rnd * 20.0);
    col = mix(col, uFloodCol * 0.5, smoothstep(rnd * 0.7, rnd * 0.7 + 0.3, uFlood));
  } else if (aKind < 1.5) {
    if (tau < 0.0 || tau > life) a = 0.0;
    float drag = exp(-k * 2.5);
    p += aVel * life * (1.0 - drag) / 2.5;
    vel = aVel * drag;
    a *= pow(1.0 - k, 1.5);
  } else if (aKind < 2.5) {
    if (tau > life) a = 0.0;
    p += aVel * k * k * k + 0.05 * vec3(sin(uTime * 9.0 + rnd * 50.0), cos(uTime * 7.0 + rnd * 30.0), sin(uTime * 8.0 + rnd * 70.0));
    a *= 1.0 + 3.0 * k * k;
  } else if (aKind < 3.5) {
    if (tau < 0.0 || tau > life) a = 0.0;
    size *= 0.2 + 1.8 * (1.0 - pow(1.0 - k, 3.0));
    a *= (1.0 - k) * (1.0 - k);
  } else {
    a = tau > 0.0 ? 1.0 + 3.0 * exp(-tau * 6.0) : 0.12;
  }
  vec3 rel = (vel - uCamVel) * uShutter;
  vec4 c0 = projectionMatrix * viewMatrix * vec4(p - rel * 0.5, 1.0);
  vec4 c1 = projectionMatrix * viewMatrix * vec4(p + rel * 0.5, 1.0);
  vQ = vec2(0.0);
  vC = vec4(0.0);
  vS = vec2(0.0);
  if (c0.w < 0.6 || c1.w < 0.6 || a <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 s0 = c0.xy / c0.w, s1 = c1.xy / c1.w;
  vec2 ax = (s1 - s0) * vec2(uAspect, 1.0) * 0.5;
  float len = length(ax);
  vec2 dir = len > 1e-5 ? ax / len : vec2(1.0, 0.0);
  len = min(len, 0.3);
  float z = 0.5 * (c0.w + c1.w);
  float coc = cocAt(z) * 2.0;                    // NDC is two units tall
  float r = size / (z * uTan) * 2.0;
  float rmin = 1.7 * uInvH;
  float rr = max(r, rmin) + coc;
  vec2 off = dir * aCorner.x * (rr + len) + vec2(-dir.y, dir.x) * aCorner.y * rr;
  off.x /= uAspect;
  float energy = min(1.0, r / rmin) * pow(max(r, rmin) / rr, 1.25) * pow(rr / (rr + len), 0.55);
  vQ = vec2(aCorner.x * (rr + len) / rr, aCorner.y);
  vS = vec2(len / rr, coc / rr);
  vC = vec4(col * a * energy * exp(-z * uFog) * smoothstep(0.8, 3.0, z) * uGain, aKind);
  gl_Position = vec4((s0 + s1) * 0.5 + off, 0.0, 1.0);
}`;

export const SPRITE_FRAG = `
precision highp float;
varying vec2 vQ;
varying vec4 vC;
varying vec2 vS;
void main() {
  float d = length(vec2(max(abs(vQ.x) - vS.x, 0.0), vQ.y));
  float disc = smoothstep(1.0, 0.86, d);
  float k = vC.a, i;
  if (k < 0.5) i = mix(exp(-d * d * 4.5), disc * (0.5 + 0.5 * smoothstep(0.45, 0.95, d)), smoothstep(0.15, 0.55, vS.y)); // a point, or a bokeh disc with a bright rim
  else if (k < 1.5) i = exp(-d * d * 5.0) + 0.5 * exp(-d * 10.0);
  else if (k < 2.5) i = disc * (0.18 + 0.82 * d * d * d);           // a bubble
  else if (k < 3.5) i = disc * smoothstep(0.5, 0.92, d);
  else i = exp(-d * d * 4.0);
  gl_FragColor = vec4(vC.rgb * i, 1.0);
}`;

// The head of the impulse (and the discharge at the cleft): a star with a hard core.
export const FLARE_VERT = `
uniform vec3 uPos;
uniform float uSize;
varying vec2 vQ;
void main() {
  vec4 mv = viewMatrix * vec4(uPos, 1.0);
  mv.xy += position.xy * uSize;
  vQ = position.xy;
  gl_Position = projectionMatrix * mv;
}`;

export const FLARE_FRAG = `
precision highp float;
uniform vec3 uCol;
uniform float uI, uRot;
varying vec2 vQ;
void main() {
  float d = length(vQ);
  float c = cos(uRot), s = sin(uRot);
  vec2 q = mat2(c, -s, s, c) * vQ;
  float fall = smoothstep(1.0, 0.25, d);
  float core = exp(-d * d * 110.0) * 3.0;
  float glow = exp(-d * 7.5) * 0.9;
  float rays = exp(-abs(q.y) * 70.0) * exp(-abs(q.x) * 2.8) + 0.55 * exp(-abs(q.x) * 95.0) * exp(-abs(q.y) * 5.5);
  gl_FragColor = vec4((uCol * (glow + rays) + vec3(core)) * uI * fall, 1.0);
}`;

// ---------------------------------------------------------------------------
// Bloom: a dual-filter pyramid (cheap, wide, stable). Down, then up adding each level.
// ---------------------------------------------------------------------------
export const DOWN_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uTexel;   // one source texel
uniform float uClamp;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  gl_FragColor = vec4(min(c * 0.125, vec3(uClamp)), 1.0);
}`;

export const UP_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc, tAdd;
uniform vec2 uTexel;   // half a source texel
uniform float uAdd;
void main() {
  vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-2.0, 0.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(2.0, 0.0)).rgb
         + texture2D(tSrc, vUv + uTexel * vec2(0.0, -2.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.0, 2.0)).rgb;
  c += 2.0 * (texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb
            + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb);
  gl_FragColor = vec4(c / 12.0 + texture2D(tAdd, vUv).rgb * uAdd, 1.0);
}`;

// ---------------------------------------------------------------------------
// Grade: tissue + bloom → picture. Radial colour fringing that grows with speed, a soft
// shoulder, haze so the black is never flat, grain, and the discharge that whites it out.
// ---------------------------------------------------------------------------
export const GRADE_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tScene, tBloom;
uniform float uTime, uAspect, uExposure, uBloom, uWarp, uFlash, uFlood, uIn;
uniform vec2 uCentre, uFlashPos;
uniform vec3 uBg, uBg2, uFlashCol, uTint;
${GLSL_NOISE}
void main() {
  vec2 asp = vec2(uAspect, 1.0);
  vec2 q = vUv - uCentre;
  float r2 = dot(q * asp, q * asp);
  vec2 w = q * uWarp * (0.25 + r2);
  vec3 c = vec3(texture2D(tScene, vUv - w * 1.6).r, texture2D(tScene, vUv - w * 0.8).g, texture2D(tScene, vUv).b);
  vec3 bl = vec3(texture2D(tBloom, vUv - w * 1.6).r, texture2D(tBloom, vUv - w * 0.8).g, texture2D(tBloom, vUv).b);
  c += bl * uBloom;
  vec2 hp = (vUv - 0.5) * asp;
  float hz = fbm(hp * 2.3 + vec2(uTime * 0.07, uTime * 0.03));
  vec3 bg = mix(uBg, uBg2, uFlood) * (0.35 + 1.3 * hz) * (1.0 - 0.55 * dot(hp, hp));
  c = (c + bg) * uIn;
  c = 1.0 - exp(-c * uExposure);
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.35);
  c *= mix(vec3(1.0), uTint, 0.5 * uFlood);
  c *= 1.0 - 0.42 * smoothstep(0.25, 1.25, dot(hp, hp));
  float fd = length((vUv - uFlashPos) * asp);
  float f = clamp(uFlash * 3.4 - fd * (1.0 - uFlash) * 1.7, 0.0, 1.0);
  f = f * f * (3.0 - 2.0 * f);
  c += uTint * 0.5 * smoothstep(0.0, 0.5, uFlash) * (1.0 - f) * exp(-fd * 2.2);
  c += (fract(sin(dot(gl_FragCoord.xy + floor(uTime * 30.0) * 17.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.035 * (1.0 - f);
  gl_FragColor = vec4(mix(c, uFlashCol, f), 1.0);
}`;

// ---------------------------------------------------------------------------
// Act 1 — the eye. At uA = 0 this is exactly the old world; as the camera pulls back the
// picture turns out to be a reflection on the loser's cornea, and the pupil opens onto
// the tissue behind it.
// ---------------------------------------------------------------------------
export const EYE_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tFrom, tNeuro;
uniform float uAspect, uA, uRi, uP, uImgS, uImgRot, uBulge, uImgGain, uNeuro, uSeed, uLid;
uniform vec2 uFocusUv, uC, uCrt, uLight;
uniform vec3 uIris;
${GLSL_NOISE}
float pane(vec2 q, vec2 b, float r) {
  vec2 d = abs(q) - b;
  return smoothstep(r, -r, length(max(d, 0.0)) + min(max(d.x, d.y), 0.0));
}
void main() {
  vec2 asp = vec2(uAspect, 1.0);
  vec3 direct = texture2D(tFrom, vUv).rgb;
  vec2 p = (vUv - uC) * asp;
  float r = length(p), rn = r / uRi;
  vec2 dv = r > 1e-5 ? p / r : vec2(1.0, 0.0);
  vec2 e2 = p / uRi;

  // The last image, riding the cornea. A convex mirror: its edges race away.
  float cr = cos(uImgRot), sr = sin(uImgRot);
  vec2 q = mat2(cr, -sr, sr, cr) * p / uImgS;
  q *= 1.0 + uBulge * dot(q, q);
  q /= uCrt;
  vec2 iuv = uFocusUv + q / asp;
  vec3 img = texture2D(tFrom, iuv).rgb;
  vec2 em = smoothstep(vec2(0.0), vec2(0.03), iuv) * smoothstep(vec2(1.0), vec2(0.97), iuv);
  float inImg = em.x * em.y;

  // Iris. Noise sampled round a circle has no seam at the back of the eye.
  float pn = (rn - uP) / (1.0 - uP);
  vec2 sd = vec2(uSeed, uSeed * 1.618);
  float f1 = noise(dv * 30.0 + sd + pn * 1.9);
  float f2 = noise(dv * 8.0 + sd.yx - pn * 0.7);
  float f3 = noise(dv * 85.0 + sd * 0.37 + pn * 3.3);
  float fib = f1 * 0.5 + f2 * 0.32 + f3 * 0.18;
  float coll = 0.27 + 0.1 * (noise(dv * 5.0 + sd) - 0.5);
  vec3 inner = mix(uIris, vec3(1.0, 0.9, 0.72), 0.4);
  vec3 outer = uIris * vec3(0.55, 0.6, 0.7);
  vec3 iris = mix(inner, outer, smoothstep(coll - 0.1, coll + 0.3, pn)) * (0.3 + 1.25 * fib);
  iris += inner * 0.32 * exp(-pow((pn - coll) / 0.045, 2.0));
  iris *= 1.0 - 0.6 * smoothstep(0.6, 0.82, noise(dv * 4.0 + sd * 3.0 + pn * 3.0)) * smoothstep(coll, coll + 0.25, pn);
  iris *= 1.0 - 0.82 * smoothstep(0.78, 1.0, pn);
  iris *= 0.55 + 0.45 * smoothstep(0.0, 0.08, pn);

  // Sclera, with a few vessels out towards the lids.
  vec3 scl = vec3(0.84, 0.82, 0.85) * (1.0 - 0.6 * smoothstep(1.0, 2.6, rn)) * (0.68 + 0.32 * smoothstep(1.0, 1.16, rn));
  float vein = 1.0 - abs(2.0 * fbm(e2 * 3.0 + sd) - 1.0);
  scl -= vec3(0.02, 0.2, 0.16) * smoothstep(0.86, 0.99, vein) * smoothstep(1.05, 1.6, rn) * 0.7;
  vec3 eye = mix(iris, scl, smoothstep(0.98, 1.02, rn));
  eye *= 1.0 - 0.3 * smoothstep(0.0, 2.0, length(e2 - uLight * 1.5));

  // Pupil: a ragged margin, and behind it the dark (then the tissue).
  float pm = uP * (1.0 + 0.035 * (noise(dv * 6.0 + sd.yx * 2.0) - 0.5));
  float inP = smoothstep(pm + 0.014, pm - 0.014, rn);
  vec3 deep = mix(vec3(0.008, 0.008, 0.016), texture2D(tNeuro, vUv).rgb, uNeuro);
  eye = mix(eye, deep, inP);

  float cornea = smoothstep(1.04, 0.94, rn);
  float refl = inImg * cornea * uImgGain * mix(0.42, 1.0, inP);
  eye = mix(eye, img, clamp(refl, 0.0, 1.0)) + img * max(refl - 1.0, 0.0);

  // Catchlight: a soft box wrapped on the cornea, its ghost across the pupil, and the
  // wet line where the globe meets the lower lid.
  vec2 h = e2 - uLight;
  h = vec2(h.x * 0.94 - h.y * 0.34, h.x * 0.34 + h.y * 0.94);
  h.y += 0.9 * h.x * h.x;
  float box = pane(h, vec2(0.12, 0.06), 0.05);
  eye += vec3(1.0, 0.98, 0.94) * box * (0.45 + 0.4 * smoothstep(-0.08, 0.08, h.y)) * cornea * (1.0 - uNeuro);
  vec2 h2 = e2 + uLight * 0.8;
  eye += vec3(0.6, 0.72, 1.0) * exp(-dot(h2, h2) * 260.0) * 0.4 * cornea * (1.0 - uNeuro);

  // Lids: the upper one cuts the top of the iris and drops a shadow on the globe; lashes
  // are strokes of the same dark, a wet highlight runs along each margin.
  float arch = e2.y + 0.22 * e2.x * e2.x;
  float low = -e2.y + 0.15 * e2.x * e2.x;
  float lash = 0.07 * smoothstep(0.35, 0.8, noise(vec2(e2.x * 46.0 + arch * 9.0, 3.0 + uSeed)));
  float lidU = smoothstep(0.80 - lash, 0.87 - lash * 0.6, arch), lidL = smoothstep(1.1, 1.17, low);
  eye *= 1.0 - 0.6 * smoothstep(0.3, 0.86, arch) * uLid;
  eye *= 1.0 - 0.3 * smoothstep(0.75, 1.12, low) * uLid;
  vec3 skin = vec3(0.085, 0.052, 0.05) * (0.35 + 0.65 * exp(-max(max(arch - 0.86, low - 1.16), 0.0) * 2.2));
  skin += vec3(0.5, 0.36, 0.33) * (exp(-pow((arch - 0.9) / 0.022, 2.0)) + exp(-pow((low - 1.185) / 0.02, 2.0))) * 0.28;
  eye = mix(eye, skin, max(lidU, lidL) * uLid);

  gl_FragColor = vec4(mix(direct, eye, uA), 1.0);
}`;

// ---------------------------------------------------------------------------
// Act 3 — the arrival. A dendritic tree grows through the white; where its front has
// passed, the new world shows first as line art, then for real (alpha → 0).
// ---------------------------------------------------------------------------
// The growth field, drawn once with MIN blending: R = when the front arrives (0..1),
// G = distance to the nearest branch. One quad per branch segment.
export const GROW_VERT = `
attribute vec4 aSeg;   // A.xy, B.xy in field space (x: 0..aspect, y: 0..1)
attribute vec3 aTT;    // time at A, time at B, seconds-per-unit sideways
uniform float uAspect0;
varying vec2 vP;
varying vec4 vSeg;
varying vec3 vTT;
void main() {
  vP = position.xy;
  vSeg = aSeg;
  vTT = aTT;
  gl_Position = vec4(position.x / uAspect0 * 2.0 - 1.0, position.y * 2.0 - 1.0, 0.0, 1.0);
}`;

export const GROW_FRAG = `
precision highp float;
varying vec2 vP;
varying vec4 vSeg;
varying vec3 vTT;
void main() {
  vec2 pa = vP - vSeg.xy, ba = vSeg.zw - vSeg.xy;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  float d = length(pa - ba * h);
  gl_FragColor = vec4(mix(vTT.x, vTT.y, h) + d * vTT.z, d * 6.0, 1.0, 1.0);
}`;

export const ARRIVE_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tGrow, tTo;
uniform float uK, uAspect, uIslT, uOut, uHasTo;
uniform vec2 uTexel;
uniform vec3 uInk, uAccent, uWhite;
uniform vec4 uIsl;     // the title's island: centre.xy, half extents (field space)
${GLSL_NOISE}
float lum(vec2 uv) { return dot(texture2D(tTo, uv).rgb, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec2 fp = vUv * vec2(uAspect, 1.0);
  vec4 f = texture2D(tGrow, vUv);
  float n = fbm(fp * 7.0 + 3.1) - 0.5;
  float T = f.r + n * 0.11 * smoothstep(0.0, 0.1, f.r);
  // The title's island: the last white to go, eaten from its shore inward.
  vec2 dq = abs(fp - uIsl.xy) - uIsl.zw;
  float sd = length(max(dq, 0.0)) + min(max(dq.x, dq.y), 0.0) - 0.07 + n * 0.07;
  float isl = smoothstep(0.035, -0.045, sd);
  T = mix(T, uIslT + clamp(-sd, 0.0, 0.25) * 0.8, isl);
  float tau = uK - T;

  float a = 1.0 - smoothstep(0.1, 0.25, tau);
  float sk = smoothstep(0.0, 0.03, tau);
  // The new world as the nervous system first draws it: outlines on the dark.
  vec3 to = texture2D(tTo, vUv).rgb;
  float gx = lum(vUv + vec2(uTexel.x, 0.0)) - lum(vUv - vec2(uTexel.x, 0.0));
  float gy = lum(vUv + vec2(0.0, uTexel.y)) - lum(vUv - vec2(0.0, uTexel.y));
  float edge = smoothstep(0.02, 0.2, length(vec2(gx, gy)) * 2.0) * uHasTo;
  vec3 sketch = mix(uInk * 0.9, to, 0.3 * uHasTo) + uAccent * edge * 1.2;
  sketch = mix(sketch, to, smoothstep(0.05, 0.2, tau) * uHasTo);
  // The shore: the next palette bleeding into the white ahead of the front.
  float shore = smoothstep(-0.12, 0.0, tau) * (1.0 - sk) * smoothstep(0.0, 0.06, uK);
  vec3 white = mix(uWhite, mix(uAccent, vec3(1.0), 0.3), shore * 0.9);
  vec3 c = mix(white, sketch, sk);
  c += vec3(1.0) * exp(-max(tau, 0.0) * 60.0) * sk * 0.7;
  // Lightning: the tree's core burns on a moment after the front has gone by.
  float age = uK - f.r;
  float core = (smoothstep(0.07, 0.012, f.g) + 0.3 * exp(-f.g * 9.0)) * step(0.0, age) * exp(-age * 3.6) * (1.0 - isl);
  core = clamp(core * 1.3, 0.0, 1.0);
  c = mix(c, mix(uAccent, vec3(1.0), 0.65), core);
  a = max(a, core) * uOut;
  gl_FragColor = vec4(c * a, a);
}`;
