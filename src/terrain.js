import * as THREE from 'three';
import { MAP } from './config.js';
import { clamp, lerp, smoothstep, noise2, fbm } from './util.js';

export const TOWN_Y = 2;
export const DAM_X = -600;
export const DAM_TOP = 42;
export const LIFT_X = 430;

export function townMask(x, z) {
  return 1 - smoothstep(0.85, 1.25, Math.max(Math.abs(x) / 125, Math.abs(z) / 92));
}

export function riverZ(x) {
  return 34 * Math.sin(x / 110) + 12 * Math.sin(x / 37 + 1.3);
}

export function crestAt(x) {
  return 395 + 22 * noise2(x / 260, 3.1);
}

// Analytic height function. Mirrored across z = 0 (with tiny asymmetric detail) so both
// ridgelines are equally good.
export function baseHeight(x, z) {
  const a = Math.abs(z);
  const crestA = crestAt(x);
  const crestH = 112 + 30 * fbm(x / 330, 7.7, 3);
  const rise = smoothstep(85, crestA, a);
  let h = crestH * Math.pow(rise, 1.15);
  h -= 34 * smoothstep(crestA + 20, crestA + 150, a);
  h += 430 * smoothstep(crestA + 170, crestA + 950, a) * (0.75 + 0.35 * fbm(x / 520, a / 520, 3));
  // Valley ends close off with mountains.
  h += 400 * smoothstep(740, 1500, x) * (0.8 + 0.3 * fbm(z / 400, 2.2, 2));
  h += 400 * smoothstep(1080, 1800, -x) * (0.8 + 0.3 * fbm(z / 400, 5.2, 2));
  const slopeMask = smoothstep(60, 210, a);
  h += fbm(x / 150, a / 150, 4) * 24 * slopeMask;
  h += fbm(x / 33, z / 33, 3) * 2.0 * (0.3 + slopeMask);
  h += fbm(x / 95, z / 95, 2) * 1.6;
  // Silted reservoir behind the dam.
  if (x < DAM_X - 2) {
    const m = smoothstep(DAM_X - 4, DAM_X - 40, x);
    h = lerp(h, Math.max(h, 24 + fbm(x / 60, z / 60, 2) * 1.2), m);
  }
  const tm = townMask(x, z);
  // Dry riverbed meandering down the valley.
  const rd = z - riverZ(x);
  h -= 3.2 * Math.exp(-(rd * rd) / 200) * (1 - tm) * (x > DAM_X ? 1 : 0);
  h = lerp(h, TOWN_Y, tm);
  return h;
}

// A uniform grid of heights; triangulated the same way for rendering and collision.
class Grid {
  constructor(x0, z0, cell, nx, nz) {
    this.x0 = x0; this.z0 = z0; this.cell = cell; this.nx = nx; this.nz = nz;
    this.H = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) this.H[j * nx + i] = baseHeight(x0 + i * cell, z0 + j * cell);
  }
  contains(x, z) {
    return x >= this.x0 && z >= this.z0 && x <= this.x0 + (this.nx - 1) * this.cell && z <= this.z0 + (this.nz - 1) * this.cell;
  }
  h(i, j) {
    return this.H[j * this.nx + i];
  }
  sample(x, z) {
    const gx = (x - this.x0) / this.cell, gz = (z - this.z0) / this.cell;
    const i = Math.min(Math.max(Math.floor(gx), 0), this.nx - 2);
    const j = Math.min(Math.max(Math.floor(gz), 0), this.nz - 2);
    const fx = gx - i, fz = gz - j;
    const h00 = this.h(i, j), h10 = this.h(i + 1, j), h01 = this.h(i, j + 1), h11 = this.h(i + 1, j + 1);
    if (fx >= fz) return h00 + (h10 - h00) * fx + (h11 - h10) * fz;
    return h00 + (h11 - h01) * fx + (h01 - h00) * fz;
  }
}

const PAL = {
  meadow: '#6f6e4e',
  grass: '#4f5c3e',
  forest: '#3a4a37',
  rock: '#6a6670',
  rockDark: '#4d4a56',
  snow: '#bdb8cc',
  sand: '#a39275',
  dirt: '#7f6852',
  lakebed: '#8f8270',
  cobble: '#6e6460',
};
const C = {};
for (const k in PAL) C[k] = new THREE.Color(PAL[k]);

export class Terrain {
  constructor(quality) {
    const cell = quality === 'high' ? 5 : quality === 'medium' ? 6.25 : 8;
    const FX = 800, FZ = 600, CC = 40, OUT = 2600;
    this.fine = new Grid(-FX, -FZ, cell, Math.round((2 * FX) / cell) + 1, Math.round((2 * FZ) / cell) + 1);
    this.coarse = new Grid(-OUT, -OUT, CC, Math.round((2 * OUT) / CC) + 1, Math.round((2 * OUT) / CC) + 1);
    this.FX = FX;
    this.FZ = FZ;
    this.mesh = this._buildMesh();
  }

  heightAt(x, z) {
    if (this.fine.contains(x, z)) return this.fine.sample(x, z);
    if (this.coarse.contains(x, z)) return this.coarse.sample(x, z);
    return baseHeight(x, z);
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 1.5;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }

  _color(cx, cy, cz, ny, out) {
    const a = Math.abs(cz);
    const tm = townMask(cx, cz);
    const n = noise2(cx / 9, cz / 9);
    const crest = crestAt(cx);
    let col;
    if (ny < 0.72) col = cy > 60 ? C.rockDark : C.rock;
    else if (cy > 300 && ny > 0.82) col = C.snow;
    else if (ny < 0.83) col = C.rock;
    else if (cx < DAM_X - 6 && cy < 27 && a < 300) col = C.lakebed;
    else if (a < 150 && cy < 9) col = C.meadow;
    else if (a > 160 && a < crest - 15 && n > -0.2) col = C.forest;
    else col = C.grass;
    out.copy(col);
    // Dry riverbed.
    const rd = Math.abs(cz - riverZ(cx));
    if (rd < 9 && tm < 0.5 && cx > DAM_X && a < 120) out.lerp(C.sand, 0.85);
    // Valley road.
    if (Math.abs(cz) < 4.5 && cx > DAM_X && cx < 470 && tm < 0.9) out.lerp(C.dirt, 0.9);
    if (tm > 0.5) out.lerp(C.cobble, 0.85);
    // Crest highlights read as silhouettes against the sky.
    if (Math.abs(a - crest) < 18 && ny > 0.8) out.lerp(C.meadow, 0.35);
    const v = 0.96 + 0.05 * noise2(cx * 0.7, cz * 0.7) + 0.05 * n;
    out.multiplyScalar(v);
    return out;
  }

  _buildMesh() {
    const pos = [];
    const col = [];
    const tmp = new THREE.Color();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3();
    const pushTri = (x0, y0, z0, x1, y1, z1, x2, y2, z2, fixedColor) => {
      a.set(x0, y0, z0); b.set(x1, y1, z1); c.set(x2, y2, z2);
      ab.subVectors(b, a); ac.subVectors(c, a);
      const n = ab.cross(ac).normalize();
      if (fixedColor) tmp.copy(fixedColor);
      else this._color((x0 + x1 + x2) / 3, (y0 + y1 + y2) / 3, (z0 + z1 + z2) / 3, n.y, tmp);
      pos.push(x0, y0, z0, x1, y1, z1, x2, y2, z2);
      for (let k = 0; k < 3; k++) col.push(tmp.r, tmp.g, tmp.b);
    };
    const gridTris = (g, skip) => {
      for (let j = 0; j < g.nz - 1; j++) {
        for (let i = 0; i < g.nx - 1; i++) {
          const x0 = g.x0 + i * g.cell, x1 = x0 + g.cell, z0 = g.z0 + j * g.cell, z1 = z0 + g.cell;
          if (skip && skip(x0, z0, x1, z1)) continue;
          const h00 = g.h(i, j), h10 = g.h(i + 1, j), h01 = g.h(i, j + 1), h11 = g.h(i + 1, j + 1);
          pushTri(x0, h00, z0, x1, h11, z1, x1, h10, z0);
          pushTri(x0, h00, z0, x0, h01, z1, x1, h11, z1);
        }
      }
    };
    const { FX, FZ } = this;
    gridTris(this.fine);
    gridTris(this.coarse, (x0, z0, x1, z1) => x0 >= -FX && x1 <= FX && z0 >= -FZ && z1 <= FZ);
    // Skirt along the fine/coarse seam hides T-junction cracks.
    const g = this.fine;
    const skirt = (xa, za, xb, zb) => {
      const ha = this.heightAt(xa, za), hb = this.heightAt(xb, zb);
      this._color((xa + xb) / 2, (ha + hb) / 2, (za + zb) / 2, 0.5, tmp);
      const sc = tmp.clone();
      pushTri(xa, ha, za, xb, hb - 25, zb, xb, hb, zb, sc);
      pushTri(xa, ha, za, xa, ha - 25, za, xb, hb - 25, zb, sc);
      pushTri(xa, ha, za, xb, hb, zb, xb, hb - 25, zb, sc);
      pushTri(xa, ha, za, xb, hb - 25, zb, xa, ha - 25, za, sc);
    };
    for (let i = 0; i < g.nx - 1; i++) {
      const xa = g.x0 + i * g.cell, xb = xa + g.cell;
      skirt(xa, -FZ, xb, -FZ);
      skirt(xa, FZ, xb, FZ);
    }
    for (let j = 0; j < g.nz - 1; j++) {
      const za = g.z0 + j * g.cell, zb = za + g.cell;
      skirt(-FX, za, -FX, zb);
      skirt(FX, za, FX, zb);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }
}

export function clampToPlay(v, lim) {
  return clamp(v, -lim, lim);
}
