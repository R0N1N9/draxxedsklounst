// PLUNGE — the one full-screen pass. It carries the lens down through the old world's
// water, raises the curtain of foam over the swap, then lets the new world clear out of it.
import { GLSL_NOISE } from '../../kit.js';

export const WATER_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tFrom;
  uniform sampler2D tTo;
  uniform float uT, uAspect, uSeed, uSide;
  uniform float uZoom;
  uniform vec2 uZoomC;
  uniform float uScroll, uSeam, uSeamLine, uUnder, uWob;
  uniform float uFoam, uClear;
  uniform vec2 uPlume;
  uniform vec3 uFoamHi;
  uniform float uShaft, uSweep, uTilt;
  uniform vec3 uShaftCol;
  uniform float uHaze;
  uniform vec3 uHazeCol;
  uniform float uVig, uAlpha;
  ${GLSL_NOISE}

  // The surf world's water column, measured off its last frame (depth below the waterline,
  // in screen heights): what the lens keeps sinking through once the picture runs out.
  vec3 waterCol(float d) {
    vec3 c = mix(vec3(0.733, 0.922, 0.914), vec3(0.522, 0.843, 0.859), smoothstep(0.0, 0.05, d));
    c = mix(c, vec3(0.141, 0.459, 0.592), smoothstep(0.05, 0.28, d));
    c = mix(c, vec3(0.035, 0.239, 0.400), smoothstep(0.28, 0.48, d));
    c = mix(c, vec3(0.012, 0.122, 0.286), smoothstep(0.48, 0.78, d));
    return mix(c, vec3(0.006, 0.065, 0.160), smoothstep(0.78, 1.6, d));
  }

  vec2 hash22(vec2 p) { return vec2(hash21(p), hash21(p + 19.19)); }

  // Distances to the nearest two cell points: their difference is thin where two bubbles
  // press together, which is what foam looks like up close.
  vec2 cells(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float d1 = 8.0, d2 = 8.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 r = o + 0.15 + 0.7 * hash22(i + o) - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    return sqrt(vec2(d1, d2));
  }

  float shafts(vec2 uv) {
    float x = (uv.x - 0.5) * uAspect + (1.0 - uv.y) * uTilt;
    float s = 0.0;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float c = (hash21(vec2(fi, uSeed)) - 0.5) * 1.5 * max(uAspect, 1.0) + uSweep * (0.55 + 0.6 * hash21(vec2(fi + 7.0, uSeed)));
      float w = 0.025 + 0.075 * hash21(vec2(fi + 3.0, uSeed));
      float b = exp(-(x - c) * (x - c) / (w * w));
      b *= 0.5 + 0.5 * noise(vec2(x * 26.0 + fi * 11.0, mod(uT, 50.0) * 0.8));
      s += b * (0.45 + 0.55 * hash21(vec2(fi + 13.0, uSeed)));
    }
    return s * pow(clamp(uv.y, 0.0, 1.0), 1.5);
  }

  void main() {
    float tw = mod(uT, 60.0);
    vec2 uv = (vUv - uZoomC) / uZoom + uZoomC;
    // refraction: everything seen through moving water swims a little
    uv += uWob * 0.0045 * vec2(
      sin(uv.y * 23.0 + tw * 2.7) + 0.6 * sin(uv.y * 41.0 - tw * 3.9 + uv.x * 9.0),
      cos(uv.x * 17.0 * uAspect + tw * 2.1) + 0.5 * sin(uv.x * 31.0 + tw * 3.3));

    vec3 col;
    float below = 1.0;
    if (uSide < 0.5) {
      // The lens sinks: the old picture slides up, and below its bottom edge the water
      // simply goes on getting deeper.
      vec2 cu = vec2(uv.x, uv.y - uScroll);
      float seam = uSeam + 0.007 * uSeamLine * sin(cu.x * 13.0 * uAspect + tw * 2.2);
      float d = seam - cu.y;
      col = texture2D(tFrom, clamp(cu, 0.0, 1.0)).rgb;
      float fill = 1.0 - smoothstep(-0.09, 0.0, cu.y);
      col = mix(col, waterCol(max(d, 0.0)), max(fill, step(0.0, d) * uUnder));
      below = smoothstep(-0.012, 0.012, d);
      col += uSeamLine * vec3(0.85, 1.0, 1.0) * exp(-d * d / 0.00002) * 0.9;
      col = mix(col, col * vec3(0.8, 0.95, 1.05) + vec3(0.0, 0.03, 0.05), uSeamLine * below * 0.6);
    } else {
      col = texture2D(tTo, uv).rgb;
    }

    col += uShaftCol * shafts(vUv) * uShaft * below;
    col = mix(col, uHazeCol * (0.7 + 0.65 * vUv.y), uHaze);

    // The curtain. Before the swap it boils up out of the plume (uFoam 0 -> 1); after it,
    // it drains upward and away (uClear 0 -> 1), lowest bubbles first.
    if (uFoam > 0.001 || uClear < 0.999) {
      vec2 p = vec2(vUv.x * uAspect, vUv.y);
      float n = fbm(p * 2.4 + vec2(uSeed * 0.37, -tw * 0.45));
      float plume = exp(-pow((vUv.x - uPlume.x) * uAspect / uPlume.y, 2.0));
      float thrA = 1.0 - uFoam * 1.4;
      float cA = smoothstep(thrA, thrA + 0.16, plume * 0.6 + n * 0.4);
      float thrB = -0.2 + uClear * 1.4;
      float cB = smoothstep(thrB, thrB + 0.16, vUv.y * 0.55 + n * 0.45);
      float C = max(cA, cB);
      if (C > 0.0) {
        vec2 m1 = cells(p * 7.0 + vec2(uSeed, -tw * 0.8));
        vec2 m2 = cells(p * 19.0 + vec2(3.1, -tw * 1.5));
        float mem = (1.0 - smoothstep(0.0, 0.08, m1.y - m1.x)) * 0.75 + (1.0 - smoothstep(0.0, 0.1, m2.y - m2.x)) * 0.45;
        vec3 foam = mix(vec3(0.42, 0.74, 0.84), uFoamHi, smoothstep(0.2, 0.8, n + 0.3 * vUv.y));
        foam *= 0.86 + 0.14 * smoothstep(0.55, 0.1, m1.x);
        foam = mix(foam, vec3(1.0), clamp(mem, 0.0, 1.0) * 0.6);
        // the thin edge of the curtain catches the light
        foam += vec3(0.12, 0.16, 0.16) * (1.0 - abs(C * 2.0 - 1.0));
        col = mix(col, foam, C);
      }
    }

    vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
    col *= 1.0 - uVig * smoothstep(0.35, 1.15, length(q));
    gl_FragColor = vec4(clamp(col, 0.0, 1.0) * uAlpha, uAlpha);
  }`;
