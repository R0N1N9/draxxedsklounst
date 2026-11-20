// LIFE FLASH — the two full-screen passes.
//   FILM_FRAG    acts 1 and 2: the push-in on the old world, then whatever the 2D "film"
//                canvas holds, run through a projector (weave, grain, flicker, halation,
//                scratches, tape noise), then burnt through to white.
//   ARRIVE_FRAG  act 3: the next world developing inside the instant photo's window.
import { GLSL_NOISE } from '../../kit.js';

export const FILM_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tFrom, tFilm;
  uniform vec2 uFocus, uWeave, uBurnC, uBurnC2, uPx;
  uniform float uAspect, uT, uFrame, uSeed;
  uniform float uZoom, uBlur, uMix, uFreeze;
  uniform float uGrain, uFlick, uVhs, uScratch, uSoft, uSmear, uVig, uFade, uLeak, uLeakSide;
  uniform vec3 uTintLo, uTintHi, uGlow, uLeakCol;
  uniform float uBurn, uWhite;
  ${GLSL_NOISE}

  vec3 tap(vec2 uv) { return texture2D(tFilm, clamp(uv, 0.0, 1.0)).rgb; }

  vec3 film(vec2 uv) {
    vec2 ca = vec2(0.0);
    if (uVhs > 0.001) {
      // Tape: every line arrives a little late, a tracking band crawls up the picture, the
      // heads switch in the bottom lines, and colour is smeared sideways.
      float line = floor(uv.y * 240.0);
      float jit = (hash21(vec2(line, uFrame)) - 0.5) * 0.0035;
      float by = fract(uv.y + uT * 0.27 + uSeed);
      float band = smoothstep(0.0, 0.015, by) * smoothstep(0.075, 0.02, by);
      jit += band * (noise(vec2(uv.y * 140.0, uFrame * 3.1)) - 0.5) * 0.07;
      jit += smoothstep(0.045, 0.0, uv.y) * (0.03 + 0.03 * hash21(vec2(line, uFrame + 9.0)));
      uv.x += jit * uVhs;
      ca = vec2(0.0045 * uVhs, 0.0);
    }
    vec3 c;
    if (uSmear > 0.0005) {
      // The reel is moving: five taps along the travel.
      c = vec3(0.0);
      for (int i = 0; i < 5; i++) c += tap(uv + vec2(0.0, (float(i) - 2.0) * 0.5 * uSmear));
      c *= 0.2;
    } else if (uVhs > 0.001) {
      c = vec3(tap(uv + ca).r, tap(uv).g, tap(uv - ca).b);
    } else c = tap(uv);
    if (uSoft > 0.001) {
      // Halation: highlights bleed warm into their surroundings; the whole picture softens.
      vec2 d = vec2(1.0 / uAspect, 1.0) * 0.006;
      vec3 h = (tap(uv + d) + tap(uv - d) + tap(uv + vec2(d.x, -d.y)) + tap(uv - vec2(d.x, -d.y))) * 0.25;
      c = mix(c, h, 0.3 * uSoft);
      c += max(h - 0.62, 0.0) * uSoft * vec3(1.0, 0.55, 0.3);
    }
    return c;
  }

  void main() {
    vec2 uv = vUv;
    vec2 pa = vec2(uAspect, 1.0);

    // ---- the film, with the heat of the burn already working on it -------------------------
    vec2 bp = (uv - uBurnC) * pa, bp2 = (uv - uBurnC2) * pa;
    float bn = fbm(bp * 3.1 + uSeed) - 0.5;
    float R = uBurn * 2.5;
    float dist = min(length(bp) + bn * (0.22 + 0.5 * uBurn), length(bp2) + 0.42 + (fbm(bp2 * 4.3 - uSeed) - 0.5) * 0.4);
    float e = R - dist;                         // > 0: burnt through
    float heat = uBurn > 0.0 ? smoothstep(-0.38, 0.0, e) : 0.0;
    vec2 fuv = uv + uWeave;
    fuv += (vec2(noise(uv * pa * 11.0 + uT * 3.0), noise(uv * pa * 11.0 - uT * 3.0 + 7.0)) - 0.5) * 0.045 * heat * heat;
    vec3 c = film(fuv);

    // ---- the old world, pushed in on the impact point --------------------------------------
    if (uMix < 0.999) {
      vec2 d = (uv - uFocus) / uZoom;
      vec3 o;
      if (uBlur > 0.0005) {
        o = vec3(0.0);
        for (int i = 0; i < 9; i++) o += texture2D(tFrom, uFocus + d * (1.0 - uBlur * float(i) / 8.0)).rgb;
        o /= 9.0;
      } else o = texture2D(tFrom, uFocus + d).rgb;
      float l = dot(o, vec3(0.299, 0.587, 0.114));
      o = mix(o, vec3(l) * vec3(1.08, 0.98, 0.84) * 1.08, uFreeze);
      c = mix(o, c, uMix);
    }

    // ---- stock: faded blacks, tinted whites, light leak -------------------------------------
    c = mix(c, uTintLo + c * (uTintHi - uTintLo), uFade);
    float lk = uLeakSide > 0.5 ? 1.0 - uv.x : uv.x;
    c += uLeakCol * uLeak * smoothstep(0.75, 0.0, lk + (noise(vec2(uv.y * 3.0, uFrame)) - 0.5) * 0.4);

    // ---- projector: flicker, vignette, grain, scratches, dust -------------------------------
    c *= 1.0 + (hash21(vec2(uFrame, 3.7)) - 0.5) * uFlick;
    c *= 1.0 - uVig * smoothstep(0.35, 1.05, length((uv - 0.5) * vec2(min(uAspect, 1.9) / 1.5, 1.0)) * 1.25);
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    vec2 gp = floor(gl_FragCoord.xy / uPx);
    c += (hash21(gp + uFrame * 7.13) + hash21(gp * 0.5 + uFrame * 3.31) - 1.0) * uGrain * (1.0 - 0.55 * lum);
    if (uScratch > 0.001) {
      for (int k = 0; k < 2; k++) {
        float fk = float(k);
        float ep = floor(uFrame / (5.0 + 4.0 * fk)) + fk * 31.0;
        float x = hash21(vec2(ep, 1.0 + fk)) + 0.004 * sin(uv.y * 9.0 + uFrame);
        float on = step(0.45, hash21(vec2(ep, 5.0 + fk))) * step(0.3, hash21(vec2(uFrame, fk)));
        c += on * smoothstep(0.0016, 0.0, abs(uv.x - x)) * 0.3 * uScratch;
      }
      vec2 cell = floor(uv * pa * 7.0);
      vec2 sp = fract(uv * pa * 7.0) - vec2(hash21(cell + uFrame), hash21(cell - uFrame));
      float speck = step(0.972, hash21(cell * 1.7 + uFrame * 0.61)) * smoothstep(0.07, 0.02, length(sp * vec2(1.0, 0.6)));
      c *= 1.0 - 0.75 * speck * uScratch;
    }

    // ---- the burn: browned, bubbling film → charred rim → glowing edge → the bare lamp ------
    if (uBurn > 0.0) {
      c *= mix(vec3(1.0), vec3(1.25, 0.72, 0.4), smoothstep(-0.5, -0.05, e));
      c = mix(c, vec3(0.07, 0.03, 0.02), smoothstep(-0.07, -0.012, e));
      vec3 ember = mix(vec3(1.0, 0.45, 0.08), uGlow, 0.55);
      c = mix(c, ember * 1.25, smoothstep(-0.02, 0.012, e));
      c = mix(c, mix(vec3(1.0, 0.93, 0.7), uGlow, 0.25) * 1.15, smoothstep(0.0, 0.09, e));
      c = mix(c, vec3(1.0), smoothstep(0.05, 0.3, e));
      c += ember * 0.5 * exp(-abs(e + 0.03) * 16.0) * (1.0 - smoothstep(0.0, 0.1, e));
    }
    c = mix(c, vec3(1.0), uWhite);
    gl_FragColor = vec4(c, 1.0);
  }`;

export const ARRIVE_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tTo;
  uniform vec2 uC, uHalf;        // the picture: centre (uv) and half size (screen heights)
  uniform float uAspect, uRot, uDev, uAlpha, uSeed, uHasTo, uSheen;
  uniform vec3 uTable, uRaw, uLo, uHi;
  ${GLSL_NOISE}
  void main() {
    vec2 p = (vUv - uC) * vec2(uAspect, 1.0);
    float cs = cos(uRot), sn = sin(uRot);
    vec2 q = vec2(cs * p.x - sn * p.y, sn * p.x + cs * p.y) / uHalf;
    vec3 col = uTable;
    if (abs(q.x) < 1.03 && abs(q.y) < 1.03) {
      vec2 uv = clamp(q * 0.5 + 0.5, 0.0, 1.0);
      vec3 img = uHasTo > 0.5 ? texture2D(tTo, uv).rgb : uRaw;
      // Instant film: the chemistry works outwards in blotches. First a ghost of the picture
      // in two inks, then its real colours. At uDev = 1 this is the texture, untouched.
      float late = clamp(0.62 * fbm(uv * vec2(uAspect, 1.0) * 2.6 + uSeed) + 0.38 * length(q) * 0.7, 0.0, 1.0);
      float d = clamp(uDev * 1.9 - 0.9 * late, 0.0, 1.0);
      float l = dot(img, vec3(0.299, 0.587, 0.114));
      vec3 duo = mix(uLo, uHi, smoothstep(0.02, 0.85, l));
      col = mix(uRaw, duo, smoothstep(0.0, 0.5, d));
      col = mix(col, img, smoothstep(0.42, 1.0, d));
      // The gloss of the print, gone by the time the picture is the world.
      col += uSheen * 0.16 * smoothstep(0.25, 0.0, abs(q.x * 0.6 + q.y - 0.25 + 0.3 * sin(uSeed)));
    }
    gl_FragColor = vec4(col * uAlpha, uAlpha);
  }`;
