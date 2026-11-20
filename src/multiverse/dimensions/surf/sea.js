// BREAK POINT — the sea itself. One Gerstner surface, written twice: here in plain
// JavaScript (what the boards ride, what bullets skip off, what hides one sniper from the
// other) and as a GLSL chunk (what is drawn). Both read the same numbers, and both are pure
// functions of position and round time, so the two clients of an online duel ride one sea.
import { smoothstep, TAU } from '../../kit.js';

export const ARENA = { rx: 112, rz: 90 }; // the buoy line: an ellipse, metres
export const SHORE_Z = -186;              // where the bay's waterline sits at x = 0
export const shoreZ = (x) => SHORE_Z + 0.00105 * x * x; // the bay curves towards the open sea at its ends

// The set wave: a lone travelling hump, far bigger than the swell, that crosses the bay
// every SET.period seconds. Its crest sits on the packet's centre the whole way in.
export const SET = { period: 30, speed: 15, k: TAU / 124, sigma: 46, amp: 5.4, steep: 0.24, from: -270, ramp: 95, fadeA: 105, fadeB: 185, dx: 0.06, dz: -0.9982 };
const SET_IS2 = 1 / (SET.sigma * SET.sigma), SET_H = SET.steep / (SET.k * SET.amp); // horizontal throw per metre of height

const f = (v) => { const s = String(+v.toFixed(6)); return /[.e]/.test(s) ? s : s + '.0'; };

// Shared by every shader that needs to know where the surface is.
export const SEA_GLSL = `
uniform vec4 uWvA[4]; // dir x, dir z, wavenumber, amplitude
uniform vec4 uWvB[4]; // phase speed, horizontal amplitude, phase, -
uniform vec4 uSea;    // time, calm (swell scale), set-wave centre, set-wave amplitude
const vec2 PK_D = vec2(${f(SET.dx)}, ${f(SET.dz)});
const float PK_K = ${f(SET.k)}, PK_IS2 = ${f(SET_IS2)}, PK_H = ${f(SET_H)};
vec3 seaDisp(vec2 p) {
  vec3 d = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 a = uWvA[i], b = uWvB[i];
    float th = a.z * (dot(a.xy, p) - b.x * uSea.x) + b.z;
    d.y += a.w * sin(th);
    d.xz += a.xy * (b.y * cos(th));
  }
  d *= uSea.y;
  float u = dot(PK_D, p) - uSea.z, E = exp(-u * u * PK_IS2) * uSea.w, ku = PK_K * u;
  d.y += E * cos(ku);
  d.xz -= PK_D * (PK_H * E * sin(ku));
  return d;
}
// Height of the surface over a WORLD point (the waves also move sideways, so invert that first).
float seaHeight(vec2 w) {
  vec2 p = w - seaDisp(w).xz;
  p = w - seaDisp(p).xz;
  return seaDisp(p).y;
}
// Normal, fold (1 = flat, towards 0 = the surface is bunching up into a crest) and height at
// the undisplaced point p; k scales the whole displacement (distance / shore fade).
void seaShape(vec2 p, float k, out vec3 N, out float J, out float h) {
  float mxx = 0.0, mzz = 0.0, mxz = 0.0, hh = 0.0;
  vec2 S = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 a = uWvA[i], b = uWvB[i];
    float th = a.z * (dot(a.xy, p) - b.x * uSea.x) + b.z, s = sin(th), c = cos(th);
    float g = -b.y * a.z * s;
    mxx += g * a.x * a.x; mzz += g * a.y * a.y; mxz += g * a.x * a.y;
    S += a.xy * (a.w * a.z * c);
    hh += a.w * s;
  }
  float u = dot(PK_D, p) - uSea.z, E = exp(-u * u * PK_IS2) * uSea.w, dE = -2.0 * u * PK_IS2 * E, ku = PK_K * u, sk = sin(ku), ck = cos(ku);
  float g = -PK_H * (dE * sk + E * PK_K * ck);
  float c1 = uSea.y * k;
  mxx = 1.0 + (mxx * uSea.y + g * PK_D.x * PK_D.x) * k;
  mzz = 1.0 + (mzz * uSea.y + g * PK_D.y * PK_D.y) * k;
  mxz = (mxz * uSea.y + g * PK_D.x * PK_D.y) * k;
  S = S * c1 + PK_D * ((dE * ck - E * PK_K * sk) * k);
  h = (hh * uSea.y + E * ck) * k;
  J = mxx * mzz - mxz * mxz;
  N = normalize(vec3(S.y * mxz - mzz * S.x, max(J, 0.05), mxz * S.x - S.y * mxx));
}`;

export function makeSea(THREE, rng, roundTime) {
  // Four swells, longest first: the first is the wall you hide behind, the rest keep it
  // from ever repeating. Directions fan around "towards the beach" (-z).
  const spec = [
    [0.07, 66, 1.5, 5.7, 0.3],
    [-0.36, 39, 0.68, 4.5, 0.2],
    [0.52, 25, 0.36, 3.7, 0.13],
    [-0.95, 15, 0.18, 3.0, 0.08],
  ];
  const W = spec.map(([ang, len, amp, speed, steep]) => {
    const a = ang + (rng() - 0.5) * 0.16, k = TAU / len;
    return { dx: Math.sin(a), dz: -Math.cos(a), k, a: amp * (0.94 + rng() * 0.12), c: speed, h: steep / k, ph: rng() * TAU };
  });
  const setT0 = 1 + rng() * 3.5;
  const uWvA = W.map((w) => new THREE.Vector4(w.dx, w.dz, w.k, w.a)), uWvB = W.map((w) => new THREE.Vector4(w.c, w.h, w.ph, 0));
  const uSea = new THREE.Vector4(0, 1, -1e4, 0);
  let t = 0, calm = 1, pkS = -1e4, pkA = 0;
  const d = { x: 0, y: 0, z: 0 }, fl = { vx: 0, vz: 0, fold: 1, bx: 0, bz: 0 }, sw = { s: 0, amp: 0, z: 0 };

  function disp(x, z) {
    let ox = 0, oy = 0, oz = 0;
    for (let i = 0; i < 4; i++) {
      const w = W[i], th = w.k * (w.dx * x + w.dz * z - w.c * t) + w.ph, c = w.h * Math.cos(th);
      oy += w.a * Math.sin(th);
      ox += w.dx * c; oz += w.dz * c;
    }
    ox *= calm; oy *= calm; oz *= calm;
    if (pkA > 0.001) {
      const u = SET.dx * x + SET.dz * z - pkS, E = Math.exp(-u * u * SET_IS2) * pkA, ku = SET.k * u, hs = SET_H * E * Math.sin(ku);
      oy += E * Math.cos(ku);
      ox -= SET.dx * hs; oz -= SET.dz * hs;
    }
    d.x = ox; d.y = oy; d.z = oz;
    return d;
  }

  const sea = {
    uniforms: { uWvA: { value: uWvA }, uWvB: { value: uWvB }, uSea: { value: uSea } },
    setT0,
    get calm() { return calm; },
    get time() { return t; },
    // Every query below answers for the moment given to the last at().
    at(time) {
      t = time;
      calm = 1 - 0.84 * smoothstep(roundTime, roundTime + 7, time); // sudden death: the swell dies away
      const tau = time - setT0;
      if (tau < 0) { pkS = -1e4; pkA = 0; }
      else {
        pkS = SET.from + SET.speed * (tau % SET.period);
        pkA = SET.amp * smoothstep(SET.from, SET.from + SET.ramp, pkS) * (1 - smoothstep(SET.fadeA, SET.fadeB, pkS)) * calm;
      }
      uSea.set(t, calm, pkS, pkA);
      return sea;
    },
    height(x, z) {
      disp(x, z);
      disp(x - d.x, z - d.z);
      return disp(x - d.x, z - d.z).y;
    },
    // Rise per metre along a heading (dx, dz): what a board feels as "uphill".
    slope(x, z, dx, dz) { return (sea.height(x + dx * 0.8, z + dz * 0.8) - sea.height(x - dx * 0.8, z - dz * 0.8)) / 1.6; },
    // What the water itself is doing under a world point — the part of the sea a board FEELS:
    //   vx, vz  the surface current (water runs forward on a crest and back in a trough)
    //   fold    1 on open water, falling towards 0 where the surface bunches into a breaking crest
    //   bx, bz  the velocity of the wave(s) that crest belongs to (what whitewater shoves you along at)
    flow(x, z) {
      disp(x, z);
      disp(x - d.x, z - d.z);
      const px = x - d.x, pz = z - d.z;
      let vx = 0, vz = 0, mxx = 0, mzz = 0, mxz = 0, bw = 0, bx = 0, bz = 0;
      for (let i = 0; i < 4; i++) {
        const w = W[i], sn = Math.sin(w.k * (w.dx * px + w.dz * pz - w.c * t) + w.ph), g = w.h * w.k * sn * calm;
        vx += w.dx * g * w.c; vz += w.dz * g * w.c;
        mxx -= g * w.dx * w.dx; mzz -= g * w.dz * w.dz; mxz -= g * w.dx * w.dz;
        if (g > 0) { bw += g; bx += g * w.c * w.dx; bz += g * w.c * w.dz; }
      }
      if (pkA > 0.001) {
        const u = SET.dx * px + SET.dz * pz - pkS, E = Math.exp(-u * u * SET_IS2) * pkA, ku = SET.k * u;
        const g = SET_H * (-2 * u * SET_IS2 * E * Math.sin(ku) + E * SET.k * Math.cos(ku));
        vx += SET.dx * g * SET.speed; vz += SET.dz * g * SET.speed;
        mxx -= g * SET.dx * SET.dx; mzz -= g * SET.dz * SET.dz; mxz -= g * SET.dx * SET.dz;
        if (g > 0) { bw += g; bx += g * SET.speed * SET.dx; bz += g * SET.speed * SET.dz; }
      }
      fl.vx = vx; fl.vz = vz; fl.fold = (1 + mxx) * (1 + mzz) - mxz * mxz;
      fl.bx = bw > 1e-4 ? bx / bw : 0; fl.bz = bw > 1e-4 ? bz / bw : 0;
      return fl;
    },
    // Where the set wave's crest is (signed distance along its travel, metres from the arena
    // centre; negative = still out to sea) and how big it stands right now.
    setWave() { sw.s = pkS; sw.amp = pkA; sw.z = -pkS; return sw; }, // (one object, refilled: asked every frame)
    // Seconds until the next set wave's crest reaches the arena centre (always > 0).
    nextSet() {
      const tau = t - setT0, arrive = -SET.from / SET.speed, n = Math.max(0, Math.ceil((tau - arrive) / SET.period));
      return setT0 + n * SET.period + arrive - t;
    },
    // Fraction (0..1) along a→b at which the water first rises above the straight line, or 1.
    sight(ax, ay, az, bx, by, bz, n = 28) {
      for (let i = 1; i < n; i++) {
        const u = i / n;
        if (sea.height(ax + (bx - ax) * u, az + (bz - az) * u) > ay + (by - ay) * u) return u;
      }
      return 1;
    },
  };
  return sea.at(0);
}
