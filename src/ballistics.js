import * as THREE from 'three';
import { BALLISTICS } from './config.js';

// Wind is deterministic from (seed, base dir, base speed, round time), so both players
// see the same gusts without streaming it.
export class Wind {
  constructor() {
    this.set(0.6, 3.5, 1);
  }
  set(dir, speed, seed) {
    this.dir = dir;
    this.speed = speed;
    this.seed = seed;
  }
  at(t, out = new THREE.Vector2()) {
    const s = this.seed;
    const gust = 1 + 0.28 * Math.sin(t * 0.23 + s) + 0.16 * Math.sin(t * 0.61 + s * 2.1) + 0.08 * Math.sin(t * 1.7 + s * 3.3);
    const d = this.dir + 0.22 * Math.sin(t * 0.07 + s * 1.7) + 0.08 * Math.sin(t * 0.31 + s);
    const v = Math.max(0, this.speed * gust);
    return out.set(Math.cos(d) * v, Math.sin(d) * v);
  }
}

const tmpW = new THREE.Vector2();

// Advance a projectile state {p, v} by dt with gravity, quadratic drag and wind.
export function stepProjectile(p, v, dt, wind, t) {
  wind.at(t, tmpW);
  const ws = BALLISTICS.windScale;
  const rx = v.x - tmpW.x * ws, ry = v.y, rz = v.z - tmpW.y * ws;
  const sp = Math.sqrt(rx * rx + ry * ry + rz * rz);
  const k = BALLISTICS.drag * sp;
  v.x -= k * rx * dt;
  v.y -= (k * ry + BALLISTICS.gravity) * dt;
  v.z -= k * rz * dt;
  p.x += v.x * dt;
  p.y += v.y * dt;
  p.z += v.z * dt;
}

const calm = { at: (t, out) => out.set(0, 0) };

// Elevation (radians above line of sight) needed to hit at a given distance in calm air.
const zeroCache = new Map();
export function zeroAngle(dist) {
  if (zeroCache.has(dist)) return zeroCache.get(dist);
  let ang = 0;
  const p = new THREE.Vector3(), v = new THREE.Vector3();
  for (let iter = 0; iter < 6; iter++) {
    p.set(0, 0, 0);
    v.set(Math.cos(ang), Math.sin(ang), 0).multiplyScalar(BALLISTICS.muzzle);
    let t = 0;
    while (p.x < dist && t < 6) {
      stepProjectile(p, v, 1 / 240, calm, t);
      t += 1 / 240;
    }
    ang += Math.atan2(-p.y, dist);
  }
  zeroCache.set(dist, ang);
  return ang;
}

export function flightTime(dist) {
  // Analytic flat-fire approximation with quadratic drag.
  const k = BALLISTICS.drag;
  return (Math.exp(k * dist) - 1) / (k * BALLISTICS.muzzle);
}
