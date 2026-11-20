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

  // One crop of bubbles: at most one per cell, each with a bright rim and a window of
  // light at its top left, rising at its own speed. rim in .x, glint in .y, inside in .z.
  vec3 bubbleLayer(vec2 p, float cellsPerH, float rise, float fill, float salt) {
    // rise in screen space, then lay the cells on a slanted grid so no rows or columns show
    p.y -= mod(uT, 60.0) * rise;
    vec2 q = mat2(0.866, 0.5, -0.5, 0.866) * p * cellsPerH + salt;
    vec2 i = floor(q), f = fract(q);
    float h = hash21(i + salt);
    if (h > fill) return vec3(0.0);
    float r = 0.08 + 0.3 * pow(hash21(i + salt + 4.7), 1.6);
    vec2 c = 0.5 + (vec2(hash21(i + 9.1), hash21(i + 2.3)) - 0.5) * (0.96 - 2.0 * r);
    c.x += 0.04 * sin(mod(uT, 60.0) * (2.0 + 3.0 * h) + h * 40.0) * (1.0 - r * 2.0);
    float d = length(f - c);
    float rim = smoothstep(r - 0.06, r - 0.015, d) * (1.0 - smoothstep(r - 0.012, r + 0.012, d));
    float glint = 1.0 - smoothstep(0.0, r * 0.22, length(f - c - vec2(-0.38, 0.38) * r));
    return vec3(rim, glint, 1.0 - smoothstep(r - 0.02, r, d));
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
      float fill = (1.0 - smoothstep(-0.03, 0.14, cu.y)) * clamp(uScroll * 12.0, 0.0, 1.0) * smoothstep(-0.004, 0.004, d);
      col = mix(col, waterCol(max(d, 0.0)), max(fill, step(0.0, d) * uUnder));
      if (fill > 0.001) {
        // the water the lens sinks into has its own bubbles, so the picture's do not end at a line
        vec2 sp = vec2(vUv.x * uAspect, vUv.y);
        vec3 b1 = bubbleLayer(sp, 9.0, 0.3, 0.45, 11.0 + uSeed);
        vec3 b2 = bubbleLayer(sp, 21.0, 0.22, 0.6, 17.0 + uSeed);
        col = mix(col, vec3(0.8, 0.95, 1.0), max(b1.x, b2.x * 0.8) * 0.5 * fill) + vec3(0.9) * b1.y * 0.35 * fill;
      }
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
      // churn: billows of white water that fold over themselves as they rise
      vec2 drift = vec2(0.0, -tw * 0.32);
      vec2 warp = vec2(fbm(p * 1.4 + drift + uSeed), fbm(p * 1.4 + drift * 1.3 + uSeed + 5.2)) - 0.5;
      float n = fbm(p * 2.3 + warp * 1.6 + drift * 1.4 + uSeed * 0.37);
      // the column spreads and wanders as it rises
      float plume = exp(-pow((vUv.x - uPlume.x + warp.x * 0.45) * uAspect / (uPlume.y * (0.55 + 0.9 * vUv.y)), 2.0));
      float thrA = 1.0 - uFoam * 1.45;
      float cA = below * smoothstep(thrA, thrA + 0.24, plume * 0.5 + n * 0.5 + 0.08 * (1.0 - vUv.y)); // never above the waterline
      float thrB = -0.25 + uClear * 1.5;
      float cB = smoothstep(thrB, thrB + 0.24, vUv.y * 0.55 + n * 0.45);
      float C = max(cA, cB);
      if (C > 0.0) {
        vec3 b1 = bubbleLayer(p, 5.0, 0.5, 0.42, 1.3 + uSeed);
        vec3 b2 = bubbleLayer(p, 11.0, 0.38, 0.5, 7.9 + uSeed);
        vec3 b3 = bubbleLayer(p, 25.0, 0.28, 0.6, 3.3 + uSeed);
        float bil = smoothstep(0.22, 0.66, n) * (0.75 + 0.25 * max(uFoam, 1.0 - uClear));
        vec3 foam = mix(vec3(0.46, 0.79, 0.9), uFoamHi, bil);
        foam = mix(foam, foam * vec3(0.78, 0.9, 0.95), (b1.z * 0.5 + b2.z * 0.3) * (1.0 - bil * 0.6));
        float rim = max(max(b1.x, b2.x * 0.7), b3.x * 0.5);
        foam = mix(foam, vec3(1.0), rim * 0.75);
        foam += vec3(1.0) * max(b1.y, b2.y * 0.8) * 0.6;
        foam *= 0.92 + 0.12 * vUv.y; // lit from above
        col = mix(col, clamp(foam, 0.0, 1.0), C);
      }
    }

    vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
    col *= 1.0 - uVig * smoothstep(0.35, 1.15, length(q));
    gl_FragColor = vec4(clamp(col, 0.0, 1.0) * uAlpha, uAlpha);
  }`;
