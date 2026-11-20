// CONTINUE? — the one full-screen pass. It is the cabinet's monitor:
//   1. the OLD WORLD (tFrom), crunched into fat pixels, drained to greyscale, tinted into the
//      cabinet's phosphor / duotone, dimmed;
//   2. the SCREEN (tScr): everything the 2D painter drew (premultiplied, with mipmaps for bloom)
//      laid over it;
//   3. the glass: barrel curvature with a black bezel, bloom, scanlines, an aperture mask,
//      chromatic kick on every thump, tearing, flicker, grain;
//   4. the flash, and the arcade WIPE that opens transparent holes onto the live new world.
// At t = 0 every effect is zero and the output is texel-for-texel the old frame.
import { GLSL_NOISE } from '../../kit.js';

export const FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tFrom, tScr, tBake;
  uniform vec2 uRes, uShake;
  uniform float uDpr, uTime;
  uniform float uCell, uBaked, uDesat, uDim, uTintAmt, uLevels, uWorldOn;
  uniform vec3 uLo, uHi;
  uniform float uCrt, uCurve, uScan, uBloom, uMask, uKick, uGlitch, uFlash;
  uniform vec3 uFlashCol, uRim;
  uniform float uWipe, uWipeType, uWipeSeed, uWipeDir, uWipeGrid, uTail;
  ${GLSL_NOISE}

  vec3 world(vec2 uv) {
    vec3 c;
    if (uBaked > 0.5) {
      c = texture2D(tBake, uv).rgb; // one texel per fat pixel, read nearest
    } else if (uCell > 1.01) {
      vec2 cell = floor(uv * uRes / uCell);
      vec2 c0 = (cell + 0.5) * uCell / uRes;
      vec2 o = vec2(0.25 * uCell) / uRes;
      c = (texture2D(tFrom, c0 + vec2(-o.x, -o.y)).rgb + texture2D(tFrom, c0 + vec2(o.x, -o.y)).rgb
         + texture2D(tFrom, c0 + vec2(-o.x, o.y)).rgb + texture2D(tFrom, c0 + vec2(o.x, o.y)).rgb) * 0.25;
    } else {
      c = texture2D(tFrom, uv).rgb;
    }
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    vec3 g = mix(c, vec3(l), uDesat);
    if (uLevels > 1.5) {
      float q = floor(pow(l, 0.85) * uLevels + 0.5) / uLevels;
      g = mix(g, mix(uLo, uHi, q), uTintAmt);
    }
    return g * uDim;
  }

  // premultiplied screen layer over the world; rgb only (the output is opaque here).
  // dk splits the screen layer's red and blue apart for the chromatic kick; the world is read once.
  vec3 compose(vec2 uv, float dk) {
    vec4 s = texture2D(tScr, uv);
    vec3 w = uWorldOn > 0.5 ? world(uv) : vec3(0.0);
    vec3 col = s.rgb + w * (1.0 - s.a);
    if (dk > 0.0) {
      vec4 sr = texture2D(tScr, uv + vec2(dk, 0.0)), sb = texture2D(tScr, uv - vec2(dk, 0.0));
      col.r = sr.r + w.r * (1.0 - sr.a);
      col.b = sb.b + w.b * (1.0 - sb.a);
    }
    return col;
  }

  // Wipe: returns x = hole (1 = see through), y = rim glow, z = shade (slats turning edge-on)
  vec3 wipe(vec2 uv) {
    float p = uWipe;
    float asp = uRes.x / uRes.y;
    vec2 ctr = uv - 0.5;
    float dirT = dot(ctr, vec2(cos(uWipeDir), sin(uWipeDir))) / (0.5 * (abs(cos(uWipeDir)) + abs(sin(uWipeDir)))) * 0.5 + 0.5;
    if (uWipeType < 1.5) {
      vec2 cell = floor(uv * vec2(uWipeGrid * asp, uWipeGrid) * 1.7);
      float r = hash21(cell + uWipeSeed);
      float th = mix(r, dirT, 0.5);
      float thr = p * 1.2 - 0.1;
      return vec3(step(th, thr), (1.0 - step(th, thr - 0.04)) * step(th, thr), 0.0);
    } else if (uWipeType < 2.5) {
      float n = uWipeGrid;
      float a = uWipeDir > 3.14159 ? uv.x : uv.y;
      float idx = floor(a * n) / n;
      float s = fract(a * n);
      float q = p * 1.5 - mix(idx, 1.0 - idx, step(1.5, mod(uWipeSeed, 3.0))) * 0.45;
      float e = abs(s - 0.5) * 2.0;
      return vec3(step(e, q), step(q - 0.06, e) * step(e, q), smoothstep(q - 0.55, q, e) * step(e, q + 0.0) + step(q, e) * 0.0);
    } else {
      vec2 g = uv * vec2(uWipeGrid * asp, uWipeGrid) * 0.8;
      vec2 f = fract(g) - 0.5;
      float d = abs(f.x) + abs(f.y);
      float q = (p * 1.55 - dirT * 0.5) * 1.02;
      return vec3(step(d, q), step(q - 0.08, d) * step(d, q), 0.0);
    }
  }

  void main() {
    vec2 uv = vUv + uShake;
    // Barrel curvature: the picture lives on a bulging tube, the corners fall into the bezel.
    vec2 c = uv * 2.0 - 1.0;
    float bez = 1.0;
    if (uCurve * uCrt > 0.0005) {
      float k = uCurve * uCrt;
      c *= (1.0 + k * dot(c, c)) / (1.0 + k);
      uv = c * 0.5 + 0.5;
      bez = smoothstep(0.0, 0.01, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
    }
    if (uGlitch > 0.001) {
      float row = floor(uv.y * 48.0), fr = floor(uTime * 20.0);
      float r = hash21(vec2(row, fr));
      uv.x += (r - 0.5) * 0.16 * uGlitch * step(0.82, r);
    }
    vec3 col = compose(uv, uKick > 0.02 ? uKick / uRes.x : 0.0);
    if (uBloom > 0.001) {
      vec3 b = textureLod(tScr, uv, 3.0).rgb * 0.6 + textureLod(tScr, uv, 5.0).rgb * 0.7;
      col += b * uBloom;
    }
    // The glass.
    if (uCrt > 0.001) {
      float per = 2.0 * uDpr;
      float sl = 0.5 - 0.5 * cos(6.2831853 * gl_FragCoord.y / per);
      col *= 1.0 - uScan * uCrt * sl + uScan * uCrt * 0.16;
      float xm = mod(gl_FragCoord.x, 3.0);
      vec3 tri = vec3(xm < 1.0 ? 1.0 : 0.62, (xm >= 1.0 && xm < 2.0) ? 1.0 : 0.62, xm >= 2.0 ? 1.0 : 0.62);
      col *= mix(vec3(1.0), tri, uMask * uCrt);
      vec2 cc = uv * 2.0 - 1.0;
      col *= 1.0 - 0.32 * uCrt * dot(cc, cc) * 0.55;
      col *= 1.0 + 0.012 * uCrt * sin(uTime * 61.0);
      col += (hash21(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * 0.05 * uCrt;
    }
    col *= bez;
    col = mix(col, uFlashCol, uFlash);
    float a = 1.0;
    if (uWipeType > 0.5 && uWipe > 0.0001) {
      if (uWipe >= 0.9995) {
        float sl = 0.5 - 0.5 * cos(6.2831853 * gl_FragCoord.y / (2.0 * uDpr));
        vec2 cc = vUv * 2.0 - 1.0;
        a = uTail * (0.1 + 0.34 * sl + 0.2 * dot(cc, cc));
        gl_FragColor = vec4(vec3(0.0), clamp(a, 0.0, 1.0));
        return;
      }
      vec3 w = wipe(vUv);
      col *= 1.0 - 0.6 * w.z;
      col += uRim * w.y * 1.1;
      a = max(1.0 - w.x, w.y);
    }
    col = clamp(col, 0.0, 1.0);
    gl_FragColor = vec4(col * a, a);
  }`;
