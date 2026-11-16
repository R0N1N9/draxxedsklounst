import * as THREE from 'three';
import { MAP, UPLINK } from './config.js';
import { Terrain, TOWN_Y, DAM_X, DAM_TOP, LIFT_X, townMask, crestAt, riverZ } from './terrain.js';
import { withHaze, makeSky, hazeUniforms } from './atmosphere.js';
import { mulberry32, clamp, segBox, noise2 } from './util.js';
import { glowTexture, dotTexture, puffTexture } from './textures.js';

// ---------------------------------------------------------------------------
// Geometry batching: thousands of boxes merged into a couple of draw calls.
// ---------------------------------------------------------------------------
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
const UB_P = UNIT_BOX.attributes.position.array;
const UB_N = UNIT_BOX.attributes.normal.array;

function prismGeometry() {
  // Gable roof: x in [-.5,.5], y in [0,1], z in [-.5,.5], ridge along x.
  const v = [
    // slope +z
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0, -0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0,
    // slope -z
    0.5, 0, -0.5, -0.5, 0, -0.5, -0.5, 1, 0, 0.5, 0, -0.5, -0.5, 1, 0, 0.5, 1, 0,
    // gable ends
    -0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0,
    0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 1, 0,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}
const PRISM = prismGeometry();

class Batch {
  constructor() {
    this.p = [];
    this.n = [];
    this.c = [];
  }
  box(cx, cy, cz, sx, sy, sz, color) {
    const col = color instanceof THREE.Color ? color : new THREE.Color(color);
    for (let i = 0; i < UB_P.length; i += 3) {
      this.p.push(cx + UB_P[i] * sx, cy + UB_P[i + 1] * sy, cz + UB_P[i + 2] * sz);
      this.n.push(UB_N[i], UB_N[i + 1], UB_N[i + 2]);
      this.c.push(col.r, col.g, col.b);
    }
  }
  geo(geometry, matrix, color) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const P = g.attributes.position.array;
    const N = g.attributes.normal ? g.attributes.normal.array : null;
    const vc = g.attributes.color ? g.attributes.color.array : null;
    const col = color ? (color instanceof THREE.Color ? color : new THREE.Color(color)) : null;
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const v = new THREE.Vector3();
    for (let i = 0; i < P.length; i += 3) {
      v.set(P[i], P[i + 1], P[i + 2]).applyMatrix4(matrix);
      this.p.push(v.x, v.y, v.z);
      if (N) {
        v.set(N[i], N[i + 1], N[i + 2]).applyMatrix3(nm).normalize();
        this.n.push(v.x, v.y, v.z);
      } else this.n.push(0, 1, 0);
      if (vc) this.c.push(vc[i] * (col ? col.r : 1), vc[i + 1] * (col ? col.g : 1), vc[i + 2] * (col ? col.b : 1));
      else this.c.push(col.r, col.g, col.b);
    }
  }
  build(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return new THREE.Mesh(g, material);
  }
}

const STUCCO = ['#b49c88', '#9d8b7f', '#8b8089', '#a68b6b', '#c0aa90', '#8e7a6c', '#a3a097'];
const ROOFS = ['#7b4a3f', '#4d4a5b', '#6a3f3a', '#5a5560'];

export class World {
  constructor(scene, quality, palette) {
    this.scene = scene;
    this.quality = quality;
    this.windowGlow = palette.windowGlow;
    this.boxes = []; // { min:[x,y,z], max:[x,y,z], mat }
    this.spheres = []; // { x,y,z,r, mat }
    this.flags = [];
    this.blinkers = [];
    this.uplinks = [];
    this.rng = mulberry32(1337);

    this.terrain = new Terrain(quality);
    const shadows = quality === 'high';
    this.lambert = withHaze(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    // Terrain gets faint topographic contour lines (5 m minor, 25 m major) near the viewer.
    const terrainMat = withHaze(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), {
      key: 'terrain',
      fragment: /* glsl */ `
      {
        float cdist = length(vHazeWorld - cameraPosition);
        float cy = vHazeWorld.y;
        float fm = fwidth(cy / 5.0) + 1e-4;
        float fM = fwidth(cy / 25.0) + 1e-4;
        float lm = 1.0 - clamp(abs(fract(cy / 5.0 + 0.5) - 0.5) / fm, 0.0, 1.0);
        float lM = 1.0 - clamp(abs(fract(cy / 25.0 + 0.5) - 0.5) / (fM * 1.4), 0.0, 1.0);
        float cf = 1.0 - smoothstep(40.0, 420.0, cdist);
        gl_FragColor.rgb *= 1.0 - (lm * 0.10 + lM * 0.22) * cf;
      }`,
    });
    const tmesh = new THREE.Mesh(this.terrain.mesh, terrainMat);
    tmesh.receiveShadow = shadows;
    scene.add(tmesh);
    this.terrainMesh = tmesh;

    this.sky = makeSky();
    scene.add(this.sky);

    this.solid = new Batch();
    this.glow = new Batch();
    this._buildTown();
    this._buildDam();
    this._buildLift();
    this._buildRidges();
    this._buildUplinks();

    const solidMesh = this.solid.build(this.lambert);
    solidMesh.castShadow = shadows;
    solidMesh.receiveShadow = shadows;
    scene.add(solidMesh);
    const glowMat = withHaze(new THREE.MeshBasicMaterial({ vertexColors: true }), { key: 'glow' });
    scene.add(this.glow.build(glowMat));

    this._buildRocks();
    this._buildTrees();
    this._buildGrass();
    this._buildMotes();
    this._buildSmoke(8, TOWN_Y, 9);
  }

  heightAt(x, z) {
    return this.terrain.heightAt(x, z);
  }

  // -------------------------------------------------------------------------
  // Colliders
  // -------------------------------------------------------------------------
  addBox(cx, cy, cz, sx, sy, sz, color, mat = 'concrete', collide = true) {
    this.solid.box(cx, cy, cz, sx, sy, sz, color);
    if (collide)
      this.boxes.push({
        min: [cx - sx / 2, cy - sy / 2, cz - sz / 2],
        max: [cx + sx / 2, cy + sy / 2, cz + sz / 2],
        mat,
      });
  }

  // Highest walkable surface at (x,z) that is at or below feetY + step.
  groundAt(x, z, feetY, step) {
    let g = this.terrain.heightAt(x, z);
    const lim = feetY + step;
    for (const b of this.boxes) {
      if (x < b.min[0] || x > b.max[0] || z < b.min[2] || z > b.max[2]) continue;
      if (b.max[1] <= lim && b.max[1] > g) g = b.max[1];
    }
    for (const s of this.spheres) {
      const dx = x - s.x, dz = z - s.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > s.r * s.r) continue;
      const top = s.y + Math.sqrt(s.r * s.r - d2);
      if (top <= lim && top > g) g = top;
    }
    return g;
  }

  // Push a vertical cylinder out of boxes / spheres. Mutates pos (feet position).
  resolveHorizontal(pos, radius, height, step) {
    const lo = pos.y + step, hi = pos.y + height;
    for (const b of this.boxes) {
      if (b.max[1] <= lo || b.min[1] >= hi) continue;
      const cx = clamp(pos.x, b.min[0], b.max[0]);
      const cz = clamp(pos.z, b.min[2], b.max[2]);
      let dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        // Inside the box: push out along the shallowest axis.
        const px = Math.min(pos.x - b.min[0], b.max[0] - pos.x);
        const pz = Math.min(pos.z - b.min[2], b.max[2] - pos.z);
        if (px < pz) pos.x = pos.x - b.min[0] < b.max[0] - pos.x ? b.min[0] - radius : b.max[0] + radius;
        else pos.z = pos.z - b.min[2] < b.max[2] - pos.z ? b.min[2] - radius : b.max[2] + radius;
      }
    }
    for (const s of this.spheres) {
      const top = s.y + s.r;
      if (top <= lo || s.y - s.r >= hi) continue;
      const dx = pos.x - s.x, dz = pos.z - s.z;
      // Radius of the sphere's slice at the player's mid height.
      const yy = clamp((lo + hi) / 2, s.y - s.r, s.y + s.r) - s.y;
      const sr = Math.sqrt(Math.max(s.r * s.r - yy * yy, 0)) + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= sr * sr || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      pos.x = s.x + (dx / d) * sr;
      pos.z = s.z + (dz / d) * sr;
    }
  }

  // Segment raycast against terrain, boxes and rocks. Returns nearest hit or null.
  raycast(from, to, coarse = false) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    let best = null;
    // Boxes
    for (const b of this.boxes) {
      const h = segBox(from.x, from.y, from.z, dx, dy, dz, b);
      if (h && (!best || h.t < best.t)) {
        const n = [0, 0, 0];
        n[h.axis] = h.sign;
        best = { t: h.t, normal: new THREE.Vector3(n[0], n[1], n[2]), mat: b.mat };
      }
    }
    // Spheres
    for (const s of this.spheres) {
      const ox = from.x - s.x, oy = from.y - s.y, oz = from.z - s.z;
      const a = dx * dx + dy * dy + dz * dz;
      const bb = 2 * (ox * dx + oy * dy + oz * dz);
      const c = ox * ox + oy * oy + oz * oz - s.r * s.r;
      const disc = bb * bb - 4 * a * c;
      if (disc < 0) continue;
      const t = (-bb - Math.sqrt(disc)) / (2 * a);
      if (t >= 0 && t <= 1 && (!best || t < best.t)) {
        const p = new THREE.Vector3(from.x + dx * t - s.x, from.y + dy * t - s.y, from.z + dz * t - s.z).normalize();
        best = { t, normal: p, mat: 'rock' };
      }
    }
    // Terrain: march then bisect.
    const maxT = best ? best.t : 1;
    const stepLen = coarse ? 4 : 1.5;
    const steps = Math.max(1, Math.ceil((len * maxT) / stepLen));
    let prevT = 0;
    let prevAbove = from.y - this.terrain.heightAt(from.x, from.z);
    if (prevAbove < 0) return { t: 0, point: from.clone(), normal: new THREE.Vector3(0, 1, 0), mat: 'dirt' };
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * maxT;
      const x = from.x + dx * t, y = from.y + dy * t, z = from.z + dz * t;
      const above = y - this.terrain.heightAt(x, z);
      if (above < 0) {
        let lo = prevT, hi = t;
        for (let k = 0; k < 10; k++) {
          const m = (lo + hi) / 2;
          const ab = from.y + dy * m - this.terrain.heightAt(from.x + dx * m, from.z + dz * m);
          if (ab < 0) hi = m; else lo = m;
        }
        const px = from.x + dx * hi, pz = from.z + dz * hi;
        best = { t: hi, normal: this.terrain.normalAt(px, pz), mat: 'dirt' };
        break;
      }
      prevT = t;
      prevAbove = above;
    }
    if (best) best.point = new THREE.Vector3(from.x + dx * best.t, from.y + dy * best.t, from.z + dz * best.t);
    return best;
  }

  // -------------------------------------------------------------------------
  // Structures
  // -------------------------------------------------------------------------
  _windowsOnFace(cx, cz, w, d, baseY, floors, face, litChance) {
    // face: 0:+x 1:-x 2:+z 3:-z
    const along = face < 2 ? d : w;
    const n = Math.max(1, Math.floor((along - 1.5) / 2.6));
    const spacing = along / n;
    const dark = new THREE.Color('#231d2c');
    for (let f = 0; f < floors; f++) {
      const y = baseY + f * 3.2 + 1.9;
      for (let i = 0; i < n; i++) {
        const o = -along / 2 + spacing * (i + 0.5);
        let x, z, sx, sz;
        if (face === 0) { x = cx + w / 2 + 0.06; z = cz + o; sx = 0.12; sz = 1.0; }
        else if (face === 1) { x = cx - w / 2 - 0.06; z = cz + o; sx = 0.12; sz = 1.0; }
        else if (face === 2) { x = cx + o; z = cz + d / 2 + 0.06; sx = 1.0; sz = 0.12; }
        else { x = cx + o; z = cz - d / 2 - 0.06; sx = 1.0; sz = 0.12; }
        if (this.rng() < litChance) {
          const warm = new THREE.Color().setRGB(2.4, 1.35, 0.55).multiplyScalar(0.7 + this.rng() * 0.6);
          this.glow.box(x, y, z, sx, 1.35, sz, warm);
        } else {
          this.solid.box(x, y, z, sx, 1.35, sz, dark);
        }
      }
    }
  }

  _building(cx, cz, w, d, floors, opts = {}) {
    const rng = this.rng;
    const baseY = opts.y ?? TOWN_Y;
    const wall = new THREE.Color(opts.color || STUCCO[Math.floor(rng() * STUCCO.length)]);
    const h = floors * 3.2 + 0.4;
    if (opts.ruin) {
      // Broken shell: lower storey intact, upper storey jagged.
      const lowH = Math.max(3.4, h - 3.2);
      this.addBox(cx, baseY + lowH / 2, cz, w, lowH, d, wall);
      const chunks = 3 + Math.floor(rng() * 3);
      for (let i = 0; i < chunks; i++) {
        const cw = 1 + rng() * (w * 0.35), chH = 0.8 + rng() * 3;
        const side = rng() < 0.5;
        const ox = side ? (rng() - 0.5) * (w - cw) : (rng() < 0.5 ? -1 : 1) * (w / 2 - 0.35);
        const oz = side ? (rng() < 0.5 ? -1 : 1) * (d / 2 - 0.35) : (rng() - 0.5) * (d - cw);
        this.addBox(cx + ox, baseY + lowH + chH / 2, cz + oz, side ? cw : 0.7, chH, side ? 0.7 : cw, wall);
      }
      for (let i = 0; i < 5; i++) {
        const s = 0.6 + rng() * 1.4;
        this.addBox(cx + (rng() - 0.5) * (w + 6), baseY + s * 0.3, cz + (rng() - 0.5) * (d + 6), s * 1.4, s * 0.6, s, wall.clone().multiplyScalar(0.8), 'concrete');
      }
      for (let f = 0; f < 4; f++) this._windowsOnFace(cx, cz, w, d, baseY, 1, f, 0);
      return;
    }
    this.addBox(cx, baseY + h / 2, cz, w, h, d, wall);
    // Trim band at the base.
    this.solid.box(cx, baseY + 0.4, cz, w + 0.15, 0.8, d + 0.15, wall.clone().multiplyScalar(0.7));
    const lit = (opts.lit ?? 0.18) * this.windowGlow;
    for (let f = 0; f < 4; f++) this._windowsOnFace(cx, cz, w, d, baseY, floors, f, lit);
    if (opts.gable) {
      const roof = new THREE.Color(ROOFS[Math.floor(rng() * ROOFS.length)]);
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(cx, baseY + h, cz),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), w >= d ? 0 : Math.PI / 2),
        new THREE.Vector3((w >= d ? w : d) + 0.8, 2.6, (w >= d ? d : w) + 0.8),
      );
      this.solid.geo(PRISM, m, roof);
      // Roof is walkable-ish: approximate with a low box so bullets stop.
      this.boxes.push({ min: [cx - w / 2, baseY + h, cz - d / 2], max: [cx + w / 2, baseY + h + 1.3, cz + d / 2], mat: 'wood' });
    } else {
      // Flat roof with parapet (cover when crouched).
      const pc = wall.clone().multiplyScalar(0.85);
      const ph = 1.0, top = baseY + h;
      this.addBox(cx, top + ph / 2, cz + d / 2 - 0.2, w, ph, 0.4, pc);
      this.addBox(cx, top + ph / 2, cz - d / 2 + 0.2, w, ph, 0.4, pc);
      this.addBox(cx + w / 2 - 0.2, top + ph / 2, cz, 0.4, ph, d - 0.8, pc);
      this.addBox(cx - w / 2 + 0.2, top + ph / 2, cz, 0.4, ph, d - 0.8, pc);
      if (rng() < 0.5) this.addBox(cx + w * 0.2, top + 0.9, cz - d * 0.15, 2, 1.8, 2, '#5d5a63', 'metal'); // AC/water unit
    }
    if (opts.stairs) this._stairs(cx, cz, w, d, baseY, h, opts.stairs, wall.clone().multiplyScalar(0.75));
  }

  // External stair block climbing to the roof. side: 'px' | 'nx' (run along z).
  _stairs(cx, cz, w, d, baseY, h, side, color) {
    const rise = 0.45, run = 0.62;
    const n = Math.ceil(h / rise);
    const x = side === 'px' ? cx + w / 2 + 0.75 : cx - w / 2 - 0.75;
    const startZ = cz + d / 2 - 0.3;
    for (let i = 1; i <= n; i++) {
      const top = Math.min(i * rise, h);
      const z = startZ - (i - 0.5) * run;
      this.addBox(x, baseY + top / 2, z, 1.5, top, run, color);
    }
  }

  _streetLamp(x, z, y) {
    this.addBox(x, y + 2.3, z, 0.18, 4.6, 0.18, '#3a3640', 'metal');
    this.solid.box(x, y + 4.6, z + 0.35, 0.18, 0.12, 0.8, '#3a3640');
    this.glow.box(x, y + 4.5, z + 0.7, 0.35, 0.12, 0.35, new THREE.Color().setRGB(3, 1.9, 0.9));
    this._sprite(x, y + 4.4, z + 0.7, 3.2, 0xffb070, 0.55);
  }

  _sprite(x, y, z, size, color, opacity = 1, blink = null) {
    const mat = new THREE.SpriteMaterial({
      map: glowTexture(),
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const s = new THREE.Sprite(mat);
    s.position.set(x, y, z);
    s.scale.setScalar(size);
    this.scene.add(s);
    if (blink) this.blinkers.push({ sprite: s, base: opacity, ...blink });
    return s;
  }

  _car(x, z, y, rot, color) {
    const c = new THREE.Color(color);
    const along = rot ? [1.9, 4.3] : [4.3, 1.9];
    this.addBox(x, y + 0.75, z, along[0], 0.9, along[1], c, 'metal');
    this.addBox(x + (rot ? 0 : -0.3), y + 1.5, z + (rot ? -0.3 : 0), rot ? 1.7 : 2.2, 0.65, rot ? 2.2 : 1.7, c.clone().multiplyScalar(0.8), 'metal');
  }

  _buildTown() {
    const Y = TOWN_Y;
    // Mirrored across z so both ridges face an equivalent town.
    const north = [
      [-28, 24, 14, 12, 3, { stairs: 'nx' }],
      [-47, 27, 10, 14, 2, { gable: true }],
      [-88, 30, 16, 12, 2, { gable: true }],
      [-63, 54, 12, 10, 2, { ruin: true }],
      [-31, 54, 12, 12, 2, { gable: true }],
      [15, 26, 12, 12, 4, { stairs: 'px', lit: 0.25 }],
      [36, 27, 12, 12, 2, { gable: true }],
      [59, 29, 14, 12, 2, { ruin: true }],
      [90, 27, 12, 12, 2, { gable: true }],
      [18, 55, 14, 10, 2, { gable: true }],
      [50, 57, 12, 12, 3, {}],
      [86, 57, 10, 12, 1, { ruin: true }],
      [-96, 60, 10, 10, 1, { gable: true }],
      [-6, 74, 12, 8, 1, { gable: true }],
    ];
    for (const [x, z, w, d, f, o] of north) {
      this._building(x, z, w, d, f, o);
      this._building(x, -z, w, d, f, o);
    }
    // Church on the valley axis: the landmark everyone calls out.
    const cc = new THREE.Color('#a8988c');
    this.addBox(44, Y + 5.5, 0, 24, 11, 14, cc);
    const roofM = new THREE.Matrix4().compose(new THREE.Vector3(44, Y + 11, 0), new THREE.Quaternion(), new THREE.Vector3(25, 5, 15));
    this.solid.geo(PRISM, roofM, '#4b4658');
    this.boxes.push({ min: [32, Y + 11, -7], max: [56, Y + 13.5, 7], mat: 'wood' });
    this.addBox(60, Y + 13, 0, 7, 26, 7, cc.clone().multiplyScalar(0.92));
    const spire = new THREE.Matrix4().compose(new THREE.Vector3(60, Y + 26, 0), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    this.solid.geo(new THREE.ConeGeometry(5.2, 9, 4).translate(0, 4.5, 0).rotateY(Math.PI / 4), spire, '#3e3a4a');
    this.glow.box(56.4, Y + 20, 0, 0.12, 2.2, 1.4, new THREE.Color().setRGB(2.2, 1.2, 0.5));
    this.glow.box(63.6, Y + 20, 0, 0.12, 2.2, 1.4, new THREE.Color().setRGB(2.2, 1.2, 0.5));
    this._windowsOnFace(44, 0, 24, 14, Y, 2, 2, 0.4);
    this._windowsOnFace(44, 0, 24, 14, Y, 2, 3, 0.4);
    // Water tower on the west side of town.
    for (const [ox, oz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) this.addBox(-72 + ox, Y + 6, oz, 0.35, 12, 0.35, '#4a4450', 'metal');
    const tank = new THREE.Matrix4().compose(new THREE.Vector3(-72, Y + 14.5, 0), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    this.solid.geo(new THREE.CylinderGeometry(3.4, 3.4, 5, 10), tank, '#6c5f66');
    this.boxes.push({ min: [-75, Y + 12, -3], max: [-69, Y + 17, 3], mat: 'metal' });
    const tankTop = new THREE.Matrix4().compose(new THREE.Vector3(-72, Y + 17, 0), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    this.solid.geo(new THREE.ConeGeometry(3.7, 1.8, 10).translate(0, 0.9, 0), tankTop, '#4c4450');
    // Plaza: cover around the uplink.
    this._car(-13, 3, Y, false, '#6b4a3a');
    this._car(13, -3, Y, false, '#3e5560');
    this._car(-20, -18, Y, true, '#5d5a4b');
    this._car(22, 18, Y, true, '#5a3d45');
    for (const s of [-1, 1]) {
      this.addBox(0, Y + 0.5, s * 7.5, 6, 1.0, 0.9, '#7b7058'); // sandbag lines
      this.addBox(-30, Y + 0.6, s * 13, 0.6, 1.2, 8, '#8a7f74'); // low walls
      this.addBox(30, Y + 0.6, s * 13, 0.6, 1.2, 8, '#8a7f74');
    }
    for (const [x, z] of [[-18, 9], [18, -9], [-18, -9], [18, 9], [-60, 14], [70, -14], [-60, -14], [70, 14]]) this._streetLamp(x, z, Y);
    // Burning barrel (smoke column reads wind).
    this.addBox(8, Y + 0.5, 9, 0.7, 1.0, 0.7, '#4d3a32', 'metal');
    this.glow.box(8, Y + 1.02, 9, 0.6, 0.05, 0.6, new THREE.Color().setRGB(4, 1.6, 0.4));
    this._sprite(8, Y + 1.4, 9, 2.5, 0xff8040, 0.8, { kind: 'flicker' });
  }

  _buildDam() {
    const x = DAM_X, top = DAM_TOP;
    const concrete = new THREE.Color('#8b8690');
    this.addBox(x, top / 2 - 6, 0, 12, top + 12, 560, concrete);
    // Parapets (crouch behind them).
    this.addBox(x - 5.6, top + 0.55, 0, 0.8, 1.1, 560, concrete.clone().multiplyScalar(0.9));
    this.addBox(x + 5.6, top + 0.55, 0, 0.8, 1.1, 560, concrete.clone().multiplyScalar(0.9));
    // Buttress ribs on the valley face.
    for (let z = -240; z <= 240; z += 30) {
      const h0 = Math.max(this.heightAt(x + 8, z), -6);
      const hh = top - h0;
      if (hh > 2) this.addBox(x + 7, h0 + hh / 2, z, 2.2, hh, 2.4, concrete.clone().multiplyScalar(0.82));
    }
    // Spillway notch stain + intake towers on the reservoir side.
    this.solid.box(x + 6.05, top / 2, 0, 0.1, top * 0.9, 18, new THREE.Color('#5f5a66'));
    for (const s of [-1, 1]) {
      this.addBox(x - 13, 25 + 13, s * 60, 8, 26, 8, concrete.clone().multiplyScalar(0.95));
      this.addBox(x - 7.5, top - 0.3, s * 60, 5, 0.6, 3, concrete, 'concrete');
      this.glow.box(x - 9, top + 6, s * 60, 0.1, 1.2, 1.0, new THREE.Color().setRGB(2.6, 1.5, 0.6));
    }
    for (let z = -200; z <= 200; z += 40) {
      this.glow.box(x - 5.6, top + 1.2, z, 0.3, 0.15, 0.3, new THREE.Color().setRGB(3, 2, 1));
      this._sprite(x - 5.6, top + 1.3, z, 2.4, 0xffc080, 0.45);
    }
  }

  _buildLift() {
    const x = LIFT_X;
    const steel = new THREE.Color('#4b4652');
    const towers = [];
    const zs = [-385, -295, -195, -97, 0, 97, 195, 295, 385];
    for (const z of zs) {
      const g = this.heightAt(x, z);
      const h = Math.abs(z) > 380 ? 6 : 13;
      if (Math.abs(z) > 380) {
        // Top station shed with a roof you can climb.
        this._building(x, z + Math.sign(z) * 7, 12, 9, 1, { y: g - 0.3, color: '#7f7676', stairs: 'px', lit: 0.5 });
        towers.push(new THREE.Vector3(x, g + 6.5, z));
      } else if (z === 0) {
        // Valley station: roof on pillars (uplink C sits beside it).
        for (const [ox, oz] of [[-7, -5], [7, -5], [-7, 5], [7, 5]]) this.addBox(x + ox, g + 2.5, oz, 0.7, 5, 0.7, '#6f6a70');
        this.addBox(x, g + 5.25, 0, 16, 0.5, 12, '#5a5462');
        this.addBox(x, g + 0.6, -6.2, 10, 1.2, 0.5, '#7a7470');
        this.addBox(x, g + 0.6, 6.2, 10, 1.2, 0.5, '#7a7470');
        const wheel = new THREE.Matrix4().compose(new THREE.Vector3(x, g + 6.2, 0), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
        this.solid.geo(new THREE.CylinderGeometry(3, 3, 0.4, 12), wheel, steel);
        towers.push(new THREE.Vector3(x, g + 6.2, 0));
        this.glow.box(x, g + 4.95, 0, 1.2, 0.1, 0.4, new THREE.Color().setRGB(2.5, 2.2, 1.6));
      } else {
        this.addBox(x, g + h / 2, z, 0.8, h, 0.8, steel, 'metal');
        this.solid.box(x, g + h, z, 6.2, 0.4, 0.5, steel);
        towers.push(new THREE.Vector3(x, g + h - 0.3, z));
      }
    }
    // Cables with sag + a few chairs.
    const cablePts = [];
    const chairMat = new THREE.Color('#3b3742');
    for (const side of [-2.6, 2.6]) {
      for (let i = 0; i < towers.length - 1; i++) {
        const a = towers[i], b = towers[i + 1];
        const segs = 10;
        let prev = null;
        for (let k = 0; k <= segs; k++) {
          const t = k / segs;
          const p = new THREE.Vector3(x + side, a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * 2.2, a.z + (b.z - a.z) * t);
          if (prev) cablePts.push(prev, p);
          prev = p;
          if (k === 5 && (i + (side > 0 ? 1 : 0)) % 2 === 0) {
            this.solid.box(p.x, p.y - 1.1, p.z, 0.08, 2.2, 0.08, chairMat);
            this.solid.box(p.x, p.y - 2.2, p.z, 1.6, 0.12, 0.7, chairMat);
            this.solid.box(p.x, p.y - 1.8, p.z + 0.35 * Math.sign(side), 1.6, 0.7, 0.08, chairMat);
          }
        }
      }
    }
    const lg = new THREE.BufferGeometry().setFromPoints(cablePts);
    const lm = withHaze(new THREE.LineBasicMaterial({ color: '#1e1a24' }), { key: 'line' });
    this.scene.add(new THREE.LineSegments(lg, lm));
  }

  _ridgeOutpost(s) {
    const crest = (x) => crestAt(x) * s;
    // Radio mast with blinking aviation light.
    {
      const x = -260, z = crest(x) + s * 10;
      const g = this.heightAt(x, z);
      const steel = '#4a4552';
      this.addBox(x, g + 1, z, 3, 2, 3, '#77707a');
      this.solid.box(x, g + 9, z, 1.2, 16, 1.2, new THREE.Color(steel));
      this.solid.box(x, g + 25, z, 0.7, 16, 0.7, new THREE.Color(steel));
      this.solid.box(x, g + 37, z, 0.35, 8, 0.35, new THREE.Color(steel));
      this.boxes.push({ min: [x - 0.6, g, z - 0.6], max: [x + 0.6, g + 41, z + 0.6], mat: 'metal' });
      this.glow.box(x, g + 41.2, z, 0.4, 0.4, 0.4, new THREE.Color().setRGB(4, 0.3, 0.2));
      this._sprite(x, g + 41.2, z, 7, 0xff3020, 1, { kind: 'blink', period: 1.6, phase: s > 0 ? 0 : 0.8 });
      this._sprite(x, g + 25, z, 4, 0xff3020, 0.7, { kind: 'blink', period: 1.6, phase: s > 0 ? 0.2 : 1.0 });
    }
    // Concrete bunker near the centre spawn.
    {
      const x = -40, z = crest(x) + s * 6;
      const g = this.heightAt(x, z);
      this.addBox(x, g + 1.2, z, 10, 3.4, 6, '#7e7881');
      for (let i = -2; i <= 2; i++) this.addBox(x + i * 2.2, g + 0.45, z - s * 5, 2, 0.9, 1.1, '#76694f');
    }
    // Ruined hut.
    {
      const x = 205, z = crest(x) - s * 18;
      const g = this.heightAt(x, z);
      this.addBox(x, g + 1.4, z + s * 3, 7, 2.8, 0.6, '#806e5f', 'wood');
      this.addBox(x - 3.2, g + 1.0, z, 0.6, 2.0, 6, '#806e5f', 'wood');
      this.addBox(x + 3.2, g + 1.6, z, 0.6, 3.2, 6, '#806e5f', 'wood');
      this.addBox(x + 1, g + 0.4, z - s * 3, 3, 0.8, 0.6, '#806e5f', 'wood');
    }
    // Sandbag nests spread along the crest.
    for (const x of [-520, -150, 90, 330, 560]) {
      const z = crest(x) - s * 12;
      const g = this.heightAt(x, z);
      this.addBox(x, g + 0.45, z - s * 1.2, 3.2, 0.9, 1, '#76694f');
      this.addBox(x - 1.8, g + 0.45, z, 1, 0.9, 2.4, '#76694f');
    }
    // Flags on the ridge.
    for (const x of [-260, 205]) {
      const z = crest(x) - s * 4;
      this._flag(x + 4, this.heightAt(x + 4, z), z, '#c0403a');
    }
  }

  _buildRidges() {
    this._ridgeOutpost(1);
    this._ridgeOutpost(-1);
    // Spawn points on the reverse slopes.
    this.spawns = { '-1': [], '1': [] };
    for (const s of [-1, 1]) {
      for (const x of [-330, -20, 300]) {
        const z = s * (crestAt(x) + 65);
        this.spawns[s].push(new THREE.Vector3(x, this.heightAt(x, z), z));
      }
    }
    // Dam flags and town flag.
    this._flag(DAM_X - 3, DAM_TOP, 230, '#d0a040');
    this._flag(DAM_X - 3, DAM_TOP, -230, '#d0a040');
  }

  _flag(x, y, z, color) {
    const poleH = 7;
    this.addBox(x, y + poleH / 2, z, 0.12, poleH, 0.12, '#38343e', 'metal', false);
    const geo = new THREE.PlaneGeometry(2.4, 1.4, 12, 5).translate(1.2, -0.7, 0);
    const uniforms = { uFlag: { value: 0.5 }, uPhase: { value: this.rng() * 10 } };
    const mat = withHaze(new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }), {
      key: 'flag',
      uniforms,
      parsVertex: 'uniform float uFlag; uniform float uPhase;',
      vertex: /* glsl */ `
        float fu = position.x / 2.4;
        float fw = uFlag;
        transformed.z += sin(position.x * 2.4 - uTime * (3.0 + 7.0 * fw) + uPhase) * 0.22 * fu * (0.3 + fw);
        transformed.z += sin(position.y * 3.0 - uTime * 5.0 + uPhase) * 0.05 * fu * fw;
        float droop = (1.0 - fw) * 1.3;
        float fx = transformed.x;
        transformed.x = fx * cos(droop);
        transformed.y -= fx * sin(droop);`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y + poleH - 0.05, z);
    m.userData.uniforms = uniforms;
    this.scene.add(m);
    this.flags.push(m);
  }

  _buildUplinks() {
    const defs = [
      { name: 'A', label: 'TOWN', x: 0, z: 0 },
      { name: 'B', label: 'DAM', x: DAM_X, z: 0, y: DAM_TOP },
      { name: 'C', label: 'LIFT', x: LIFT_X - 11, z: 0 },
    ];
    for (const d of defs) {
      const y = d.y ?? this.heightAt(d.x, d.z);
      this.addBox(d.x, y + 0.55, d.z, 1.3, 1.1, 0.9, '#2f2c35', 'metal');
      this.addBox(d.x, y + 1.6, d.z - 0.2, 0.14, 1.0, 0.14, '#2f2c35', 'metal', false);
      this.addBox(d.x + 0.8, y + 2.2, d.z, 0.1, 4.4, 0.1, '#2f2c35', 'metal', false);
      const screenMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.6, 2.2) });
      const screen = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 0.06), withHaze(screenMat, { key: 'screen' }));
      screen.position.set(d.x, y + 1.0, d.z + 0.47);
      this.scene.add(screen);
      const screen2 = screen.clone();
      screen2.position.z = d.z - 0.47;
      this.scene.add(screen2);
      const lamp = this._sprite(d.x + 0.8, y + 4.5, d.z, 4, 0x55ddff, 0.9);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(UPLINK.radius - 0.25, UPLINK.radius, 48).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x55ddff, transparent: true, opacity: 0.35, depthWrite: false }),
      );
      ring.position.set(d.x, y + 0.08, d.z);
      this.scene.add(ring);
      this._flag(d.x - 2.2, y, d.z + 2.2, '#c8c0b0');
      this.uplinks.push({ ...d, pos: new THREE.Vector3(d.x, y, d.z), screenMat, lamp, ring });
    }
  }

  // -------------------------------------------------------------------------
  // Scatter
  // -------------------------------------------------------------------------
  _nearStructure(x, z, pad) {
    if (townMask(x, z) > 0.01) return true;
    if (Math.abs(x - DAM_X) < 40 && Math.abs(z) < 300) return true;
    if (Math.abs(x - LIFT_X) < 12 && Math.abs(z) < 420) return true;
    if (x < DAM_X && Math.abs(z) < 290 && x > -1100) return true;
    if (Math.abs(z) < 6 && x > DAM_X && x < 470) return true;
    for (const u of this.uplinks) if (Math.hypot(x - u.x, z - u.z) < 14 + pad) return true;
    for (const b of this.boxes) {
      if (x > b.min[0] - pad && x < b.max[0] + pad && z > b.min[2] - pad && z < b.max[2] + pad) return true;
    }
    return false;
  }

  _buildRocks() {
    const rng = mulberry32(42);
    const count = this.quality === 'low' ? 260 : 420;
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mat = withHaze(new THREE.MeshLambertMaterial({ flatShading: true }), { key: 'rock' });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const col = new THREE.Color();
    let n = 0;
    for (let tries = 0; tries < count * 6 && n < count; tries++) {
      const x = (rng() * 2 - 1) * (MAP.playX + 60);
      const z = (rng() * 2 - 1) * (MAP.playZ + 40);
      const a = Math.abs(z);
      if (a < 100 && rng() < 0.75) continue;
      if (this._nearStructure(x, z, 3)) continue;
      const big = rng() < 0.35;
      const r = big ? 1.6 + rng() * 2.8 : 0.4 + rng() * 1.0;
      const y = this.heightAt(x, z);
      const sx = r * (0.9 + rng() * 0.5), sy = r * (0.6 + rng() * 0.4), sz = r * (0.9 + rng() * 0.5);
      e.set(rng() * 0.6, rng() * Math.PI * 2, rng() * 0.6);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, y + sy * 0.25, z), q, new THREE.Vector3(sx, sy, sz));
      mesh.setMatrixAt(n, m);
      const g = 0.33 + rng() * 0.12;
      col.setRGB(g, g * 0.95, g * 1.07);
      mesh.setColorAt(n, col);
      if (big) this.spheres.push({ x, y: y + sy * 0.25, z, r: Math.min(sx, sy, sz) * 0.92 });
      n++;
    }
    mesh.count = n;
    mesh.castShadow = this.quality === 'high';
    mesh.receiveShadow = this.quality === 'high';
    this.scene.add(mesh);
  }

  _buildTrees() {
    const rng = mulberry32(7);
    const count = this.quality === 'high' ? 3600 : this.quality === 'medium' ? 2400 : 1300;
    // Merge trunk + three foliage tiers into one geometry with vertex colours.
    const b = new Batch();
    const I = new THREE.Matrix4();
    b.geo(new THREE.CylinderGeometry(0.18, 0.28, 2.2, 5).translate(0, 1.1, 0), I, '#4a3a33');
    b.geo(new THREE.ConeGeometry(2.3, 4.2, 7).translate(0, 3.6, 0), I, '#2f4636');
    b.geo(new THREE.ConeGeometry(1.8, 3.6, 7).translate(0, 5.6, 0), I, '#34503b');
    b.geo(new THREE.ConeGeometry(1.2, 3.0, 7).translate(0, 7.5, 0), I, '#3a5841');
    const geo = b.build().geometry;
    const mat = withHaze(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), {
      key: 'tree',
      vertex: /* glsl */ `
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float sw = max(position.y - 2.0, 0.0) * 0.018 * length(uWind);
        vec2 wd = uWind / max(length(uWind), 0.001);
        transformed.xz += wd * sw * (0.65 + 0.35 * sin(uTime * 1.6 + ip.x * 0.13 + ip.z * 0.21));`,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    const nrm = new THREE.Vector3();
    let n = 0;
    for (let tries = 0; tries < count * 8 && n < count; tries++) {
      const far = rng() < 0.25;
      const x = (rng() * 2 - 1) * (far ? 1500 : MAP.playX + 80);
      const z = (rng() * 2 - 1) * (far ? 1300 : MAP.playZ + 100);
      const a = Math.abs(z);
      const crest = crestAt(x);
      let p;
      if (a < 110) p = 0.12;
      else if (a < crest - 20) p = 0.95;
      else if (a < crest + 15) p = 0.25;
      else p = 0.75;
      // Clumpy forests rather than uniform scatter.
      p *= 0.45 + 0.55 * (noise2(x / 70, z / 70) * 0.5 + 0.5) * 1.6;
      if (rng() > p) continue;
      const y = this.heightAt(x, z);
      if (y > 235) continue;
      this.terrain.normalAt(x, z, nrm);
      if (nrm.y < 0.8) continue;
      if (this._nearStructure(x, z, 4)) continue;
      if (Math.abs(z - riverZ(x)) < 7 && a < 120) continue;
      const s = 0.75 + rng() * 0.75;
      m.makeScale(s, s * (0.85 + rng() * 0.4), s);
      m.setPosition(x, y - 0.2, z);
      mesh.setMatrixAt(n, m);
      const v = 0.8 + rng() * 0.4;
      col.setRGB(v * (0.92 + rng() * 0.1), v, v * (0.9 + rng() * 0.15));
      mesh.setColorAt(n, col);
      n++;
    }
    mesh.count = n;
    mesh.castShadow = this.quality === 'high';
    this.scene.add(mesh);
    this.trees = mesh;
  }

  _buildGrass() {
    this.grass = null;
    if (this.quality === 'low') return;
    const count = this.quality === 'high' ? 7000 : 3500;
    const tile = 80;
    const b = new Batch();
    const blade = new THREE.BufferGeometry();
    blade.setAttribute('position', new THREE.Float32BufferAttribute([-0.03, 0, 0, 0.03, 0, 0, 0, 1, 0], 3));
    blade.setAttribute('color', new THREE.Float32BufferAttribute([0.36, 0.4, 0.32, 0.36, 0.4, 0.32, 0.52, 0.55, 0.44], 3));
    blade.computeVertexNormals();
    const rng = mulberry32(99);
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3((rng() - 0.5) * 0.5, 0, (rng() - 0.5) * 0.5),
        new THREE.Quaternion().setFromEuler(new THREE.Euler((rng() - 0.5) * 0.5, rng() * Math.PI, (rng() - 0.5) * 0.5)),
        new THREE.Vector3(0.7, 0.18 + rng() * 0.22, 0.7),
      );
      b.geo(blade, m, new THREE.Color('#5d6450'));
    }
    const geo = b.build().geometry;
    const mat = withHaze(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), {
      key: 'grass',
      vertex: /* glsl */ `
        vec3 gp = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float gw = length(uWind);
        vec2 gd = uWind / max(gw, 0.001);
        float wave = sin(uTime * 2.2 - dot(gp.xz, gd) * 0.35) * 0.5 + 0.5;
        transformed.xz += gd * position.y * position.y * (0.04 * gw * (0.5 + wave));`,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.frustumCulled = false;
    const base = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      base[i * 2] = rng() * tile;
      base[i * 2 + 1] = rng() * tile;
    }
    const cellX = new Float32Array(count).fill(1e9);
    const cellZ = new Float32Array(count).fill(1e9);
    this.grass = { mesh, base, tile, cellX, cellZ, count, m: new THREE.Matrix4() };
    this.scene.add(mesh);
  }

  _updateGrass(cam) {
    const G = this.grass;
    if (!G) return;
    const { base, tile, count, cellX, cellZ, m, mesh } = G;
    let dirty = false;
    for (let i = 0; i < count; i++) {
      const wx = cam.x + ((((base[i * 2] - cam.x) % tile) + tile) % tile) - tile / 2;
      const wz = cam.z + ((((base[i * 2 + 1] - cam.z) % tile) + tile) % tile) - tile / 2;
      if (Math.abs(wx - cellX[i]) < 0.01 && Math.abs(wz - cellZ[i]) < 0.01) continue;
      cellX[i] = wx;
      cellZ[i] = wz;
      const y = this.heightAt(wx, wz);
      const hide = townMask(wx, wz) > 0.3 || Math.abs(wx) > MAP.fineX || Math.abs(wz) > MAP.fineZ || (Math.abs(wz) < 5 && wx > DAM_X && wx < 470) || y > 200 || (wx < DAM_X && Math.abs(wz) < 290);
      const s = hide ? 0 : 0.8 + ((i * 7919) % 100) / 160;
      m.makeScale(s, s, s);
      m.setPosition(wx, y - 0.05, wz);
      mesh.setMatrixAt(i, m);
      dirty = true;
    }
    if (dirty) mesh.instanceMatrix.needsUpdate = true;
  }

  _buildMotes() {
    // Drifting pollen / embers near the camera: shows wind at close range.
    const count = this.quality === 'low' ? 160 : 380;
    const pos = new Float32Array(count * 3);
    const rng = mulberry32(5);
    for (let i = 0; i < count * 3; i++) pos[i] = (rng() - 0.5) * 60;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.09,
      map: dotTexture(),
      color: 0xffd0a0,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.motes = { pts, pos, count, box: 60, origin: new THREE.Vector3() };
  }

  _updateMotes(dt, cam, wind, t) {
    const M = this.motes;
    const { pos, count, box } = M;
    for (let i = 0; i < count; i++) {
      const k = i * 3;
      pos[k] += (wind.x * 0.9 + Math.sin(t * 0.7 + i) * 0.2) * dt;
      pos[k + 1] += Math.sin(t * 0.5 + i * 1.7) * 0.15 * dt;
      pos[k + 2] += (wind.y * 0.9 + Math.cos(t * 0.6 + i) * 0.2) * dt;
    }
    M.pts.position.set(0, 0, 0);
    // Wrap around the camera.
    for (let i = 0; i < count; i++) {
      const k = i * 3;
      for (let a = 0; a < 3; a++) {
        const c = a === 0 ? cam.x : a === 1 ? cam.y : cam.z;
        let d = pos[k + a] - c;
        const half = a === 1 ? box / 4 : box / 2;
        if (d > half) pos[k + a] -= half * 2;
        else if (d < -half) pos[k + a] += half * 2;
      }
    }
    M.pts.geometry.attributes.position.needsUpdate = true;
  }

  _buildSmoke(x, y, z) {
    const count = 70;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const age = new Float32Array(count);
    for (let i = 0; i < count; i++) age[i] = (i / count) * 9;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 4.5,
      map: puffTexture(),
      color: 0x6c6070,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.smoke = { pts, pos, age, count, origin: new THREE.Vector3(x, y + 1.3, z) };
  }

  _updateSmoke(dt, wind) {
    const S = this.smoke;
    const life = 9;
    for (let i = 0; i < S.count; i++) {
      S.age[i] += dt;
      if (S.age[i] > life) S.age[i] -= life;
      const a = S.age[i];
      const k = i * 3;
      const wobble = Math.sin(i * 12.9) * 0.6;
      S.pos[k] = S.origin.x + wind.x * a * 0.85 + wobble * a * 0.2;
      S.pos[k + 1] = S.origin.y + a * 2.4;
      S.pos[k + 2] = S.origin.z + wind.y * a * 0.85 + Math.cos(i * 7.1) * 0.6 * a * 0.2;
    }
    S.pts.geometry.attributes.position.needsUpdate = true;
  }

  update(dt, t, wind2, camPos) {
    hazeUniforms.uTime.value = t;
    hazeUniforms.uWind.value.copy(wind2);
    const speed = wind2.length();
    const strength = clamp(speed / 7, 0.05, 1);
    const yaw = Math.atan2(-wind2.y, wind2.x);
    for (const f of this.flags) {
      f.rotation.y = yaw;
      f.userData.uniforms.uFlag.value = strength;
    }
    for (const b of this.blinkers) {
      if (b.kind === 'blink') {
        const ph = ((t + b.phase) % b.period) / b.period;
        b.sprite.material.opacity = ph < 0.18 ? b.base : 0.05;
      } else {
        b.sprite.material.opacity = b.base * (0.7 + 0.3 * Math.sin(t * 13) * Math.sin(t * 7.3));
      }
    }
    this.sky.position.copy(camPos);
    this._updateGrass(camPos);
    this._updateMotes(dt, camPos, wind2, t);
    this._updateSmoke(dt, wind2);
  }
}
