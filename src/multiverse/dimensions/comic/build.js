// INK CITY — the city as geometry. Nearly all of it is three instanced shapes (box,
// cylinder, cone) in a handful of draw calls; the props that sudden death rubs out live in
// batches of their own so one uniform can turn them to blue pencil.
import { makeRng, rand, pick } from '../../kit.js';
import { PAL } from './art.js';
import { rgb } from './mats.js';
import { HALF_X, STREET, BLIMP } from './world.js';

// Collects instances, then builds one InstancedMesh of exactly that size.
function batch(THREE, geo, mat) {
  const rows = [];
  return {
    add(x, y, z, sx, sy, sz, hex, kind = 0, ry = 0, rx = 0, rz = 0) { rows.push([x, y, z, sx, sy, sz, hex, kind, ry, rx, rz]); },
    build(cast, receive) {
      const n = Math.max(1, rows.length), g = geo.clone();
      const col = new Float32Array(n * 3), kind = new Float32Array(n);
      const mesh = new THREE.InstancedMesh(g, mat, n), o = new THREE.Object3D();
      rows.forEach((r, i) => {
        o.position.set(r[0], r[1], r[2]); o.scale.set(r[3], r[4], r[5]); o.rotation.set(r[9], r[8], r[10], 'YXZ');
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
        col.set(rgb(r[6]), i * 3);
        kind[i] = r[7];
      });
      if (!rows.length) { o.scale.set(0, 0, 0); o.updateMatrix(); mesh.setMatrixAt(0, o.matrix); }
      g.setAttribute('aCol', new THREE.InstancedBufferAttribute(col, 3));
      g.setAttribute('aKind', new THREE.InstancedBufferAttribute(kind, 1));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = cast; mesh.receiveShadow = receive;
      mesh.frustumCulled = false;
      return mesh;
    },
  };
}

export function buildCity(THREE, W, mats, art, seed) {
  const rng = makeRng(seed ^ 0x51ed), group = new THREE.Group();
  const boxG = new THREE.BoxGeometry(1, 1, 1), cylG = new THREE.CylinderGeometry(0.5, 0.5, 1, 12), coneG = new THREE.ConeGeometry(0.5, 1, 12);
  const mStatic = mats.make({ inst: true }), mFar = mats.make({ inst: true }), mProp = mats.make({ inst: true });
  const erasable = [mProp], owned = [boxG, cylG, coneG];
  const B = batch(THREE, boxG, mStatic), C = batch(THREE, cylG, mStatic), K = batch(THREE, coneG, mStatic), F = batch(THREE, boxG, mFar), FK = batch(THREE, coneG, mFar);
  const PB = batch(THREE, boxG, mProp), PC = batch(THREE, cylG, mProp), PK = batch(THREE, coneG, mProp);

  // ---- the two terraces of rooftops ----
  for (const r of W.roofs) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0, wall = PAL.walls[r.tint];
    B.add(r.cx, r.h / 2 - 1, r.cz, w, r.h + 2, d, wall, 1);
    // parapet: a stone lip the ink pass will draw twice over
    const ph = 0.42, pw = 0.36;
    B.add(r.cx, r.h + ph / 2, r.z0 + pw / 2, w, ph, pw, PAL.stone);
    B.add(r.cx, r.h + ph / 2, r.z1 - pw / 2, w, ph, pw, PAL.stone);
    B.add(r.x0 + pw / 2, r.h + ph / 2, r.cz, pw, ph, d - pw * 2, PAL.stone);
    B.add(r.x1 - pw / 2, r.h + ph / 2, r.cz, pw, ph, d - pw * 2, PAL.stone);
    // string courses down the facade
    for (const dy of [4.6, 11.2, 17.8]) if (r.h - dy > 3) B.add(r.cx, r.h - dy, r.cz, w + 0.5, 0.34, d + 0.5, PAL.stone);
  }
  // ---- cover ----
  const boards = [];
  for (const p of W.props) {
    const y = p.y, s = p.side ? -1 : 1; // s: which way the street is NOT
    if (p.kind === 'bulk') {
      PB.add(p.x, y + p.h / 2, p.z, p.w, p.h, p.d, PAL.brick);
      PB.add(p.x, y + p.h + 0.09, p.z, p.w + 0.4, 0.18, p.d + 0.4, PAL.stone);
      PB.add(p.x + 0.5, y + 1.05, p.z + s * (p.d / 2 + 0.03), 1.0, 2.1, 0.08, PAL.dark);
      PB.add(p.x + 0.82, y + 1.05, p.z + s * (p.d / 2 + 0.08), 0.1, 0.1, 0.06, '#ffd23f', 5);
    } else if (p.kind === 'ac') {
      PB.add(p.x, y + p.h / 2 + 0.08, p.z, p.w, p.h - 0.16, p.d, PAL.metal, 4);
      PB.add(p.x, y + 0.08, p.z, p.w - 0.3, 0.16, p.d - 0.3, PAL.dark);
      PC.add(p.x + p.w / 2 + 0.25, y + 0.3, p.z, 0.16, 0.9, 0.16, PAL.metal, 0, 0, 0, Math.PI / 2);
    } else if (p.kind === 'chim') {
      PB.add(p.x, y + p.h / 2, p.z, p.w, p.h, p.d, PAL.brick);
      PB.add(p.x, y + p.h + 0.08, p.z, p.w + 0.26, 0.16, p.d + 0.26, PAL.stone);
      PC.add(p.x - 0.2, y + p.h + 0.45, p.z, 0.3, 0.6, 0.3, '#d9764a');
      PC.add(p.x + 0.22, y + p.h + 0.36, p.z + 0.1, 0.26, 0.42, 0.26, '#d9764a');
    } else if (p.kind === 'sky') {
      PB.add(p.x, y + 0.2, p.z, p.w, 0.4, p.d, PAL.dark);
      PB.add(p.x, y + 0.45, p.z, p.w - 0.3, 0.3, p.d - 0.3, PAL.glass, 5);
      PB.add(p.x, y + 0.53, p.z, 0.1, 0.2, p.d - 0.2, PAL.dark);
      PB.add(p.x, y + 0.53, p.z, p.w - 0.2, 0.2, 0.1, PAL.dark);
    } else if (p.kind === 'bill' || p.kind === 'sign') {
      const lo = p.kind === 'bill' ? 1.3 : 1.7, hi = p.h;
      for (const k of [-0.38, 0, 0.38]) {
        PB.add(p.x + k * p.w, y + hi / 2, p.z + s * 0.32, 0.2, hi, 0.2, PAL.dark);
        PB.add(p.x + k * p.w, y + lo * 0.9, p.z + s * 0.95, 0.12, 2.9, 0.12, PAL.dark, 0, 0, -s * 0.5);
      }
      if (p.kind === 'bill') {
        PB.add(p.x, y + (lo + hi) / 2, p.z + s * 0.06, p.w, hi - lo, 0.14, PAL.dark);
        PB.add(p.x, y + lo - 0.1, p.z - s * 0.2, p.w + 0.3, 0.14, 0.7, PAL.stone); // the bill-poster's walkway
      } else for (const yy of [lo + 0.1, hi - 0.1]) PB.add(p.x, y + yy, p.z + s * 0.1, p.w, 0.12, 0.12, PAL.dark);
      boards.push(p);
    } else if (p.kind === 'tank') {
      for (const ax of [-1, 1]) for (const az of [-1, 1]) PB.add(p.x + ax * 1.05, y + 1.15, p.z + az * 1.05, 0.2, 2.3, 0.2, PAL.dark);
      for (const ax of [-1, 1]) { PB.add(p.x + ax * 1.05, y + 1.2, p.z, 0.1, 0.1, 2.9, PAL.dark, 0, 0, 0.66 * ax); PB.add(p.x, y + 1.2, p.z + ax * 1.05, 2.9, 0.1, 0.1, PAL.dark, 0, 0, 0, 0.66 * ax); }
      PB.add(p.x, y + 2.32, p.z, 3.1, 0.16, 3.1, PAL.stone);
      PC.add(p.x, y + 3.75, p.z, 2.8, 2.7, 2.8, PAL.wood, 6);
      PK.add(p.x, y + 5.65, p.z, 3.2, 1.1, 3.2, '#7d4a52');
    }
  }
  // Hoardings and signs carry painted faces, towards the street.
  const quad = new THREE.PlaneGeometry(1, 1);
  owned.push(quad);
  boards.forEach((p, i) => {
    const sgn = p.kind === 'sign', s = p.side ? -1 : 1;
    const m = mats.make({ map: sgn ? art.signs[(i + (p.seed * 4 | 0)) % art.signs.length] : art.ads[(i + (p.seed * 4 | 0)) % art.ads.length], lit: sgn, side: sgn ? THREE.DoubleSide : THREE.FrontSide });
    erasable.push(m);
    const mesh = new THREE.Mesh(quad, m);
    mesh.scale.set(p.w - (sgn ? 0.4 : 0.3), sgn ? 2.7 : 4.0, 1);
    mesh.position.set(p.x, p.y + (sgn ? 3.05 : 3.45), p.z - s * (sgn ? 0 : 0.02));
    mesh.rotation.y = s > 0 ? Math.PI : 0;
    mesh.castShadow = !sgn; mesh.receiveShadow = !sgn;
    group.add(mesh);
  });

  // ---- the street, the el, and the rest of town ----
  B.add(0, -0.1, 0, 700, 0.2, 700, '#3b3357', 3);
  for (const s of [-1, 1]) B.add(0, 0.12, s * 8.4, 280, 0.24, 3.2, '#8d7f9c');
  B.add(0, 11, 0, 280, 0.7, 5.2, '#4b3b6b');
  for (const s of [-1, 1]) B.add(0, 11.6, s * 2.5, 280, 0.5, 0.2, '#6d5c8f');
  for (let x = -130; x <= 130; x += 20) for (const s of [-1, 1]) B.add(x, 5.3, s * 2.1, 0.7, 10.7, 0.7, '#4b3b6b');
  const tower = (x, z, w, d, h, hex) => {
    F.add(x, h / 2, z, w, h, d, hex, 1);
    if (rng() < 0.5 && h > 45) { const k = rand(rng, 0.5, 0.75); F.add(x, h + 4, z, w * k, 8, d * k, hex, 1); if (rng() < 0.6) FK.add(x, h + 8 + 6, z, w * k * 0.5, 12, d * k * 0.5, PAL.far[3]); }
    else if (rng() < 0.35) { F.add(x + w * 0.2, h + 1.6, z, 3.2, 3.2, 3.2, PAL.far[1]); }
  };
  // the canyon walls beyond the two blocks, and whatever closes its ends
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
    let x = HALF_X + 3;
    while (x < 122) {
      const w = rand(rng, 14, 24);
      for (const row of [0, 1, 2]) tower(sx * (x + w / 2), sz * (STREET + 8.5 + row * 17), w, 17, rand(rng, 22, 34) + row * rand(rng, 4, 12), pick(rng, PAL.walls));
      x += w + (rng() < 0.4 ? 2.6 : 0);
    }
  }
  for (const sx of [-1, 1]) { tower(sx * 142, 0, 26, 44, rand(rng, 74, 96), PAL.far[0]); tower(sx * 150, sx * 34, 30, 30, rand(rng, 50, 70), PAL.far[2]); tower(sx * 152, -sx * 30, 24, 28, rand(rng, 60, 110), PAL.far[1]); }
  // the skyline behind each sniper: taller the farther back
  for (const sz of [-1, 1]) for (let ring = 0; ring < 3; ring++) {
    let x = -190 + rng() * 10;
    while (x < 190) {
      const w = rand(rng, 16, 30), d = rand(rng, 16, 28), h = rand(rng, 40, 62) + ring * rand(rng, 12, 34);
      tower(x + w / 2, sz * (74 + ring * 34 + rng() * 10), w, d, h, PAL.far[(ring + (rng() * 3 | 0)) % PAL.far.length]);
      x += w + rand(rng, 1, 9);
    }
  }
  const meshes = [B.build(true, true), C.build(true, true), K.build(true, true), F.build(false, false), FK.build(false, false), PB.build(true, true), PC.build(true, true), PK.build(true, true)];
  const propMeshes = meshes.slice(5);
  group.add(...meshes);

  // ---- the airship ----
  const blimp = new THREE.Group();
  const hullG = new THREE.SphereGeometry(1, 28, 18).rotateZ(Math.PI / 2); // poles fore and aft: u runs round the hull
  owned.push(hullG);
  const hull = new THREE.Mesh(hullG, mats.make({ map: art.livery }));
  hull.scale.set(BLIMP.rx, BLIMP.ry, BLIMP.rz);
  const dark = mats.make({ color: '#3a2d5c' }), teal = mats.make({ color: '#2bb3a3' }), lamp = mats.make({ color: '#ffe9a0', lit: true });
  const part = (geo, m, x, y, z, sx, sy, sz, rx = 0, rz = 0) => { const q = new THREE.Mesh(geo, m); q.position.set(x, y, z); q.scale.set(sx, sy, sz); q.rotation.set(rx, 0, rz); blimp.add(q); return q; };
  part(boxG, dark, 1, -BLIMP.ry - 0.5, 0, 5.2, 1.5, 1.9);
  part(boxG, lamp, 1, -BLIMP.ry - 0.35, 0, 4.4, 0.5, 1.96);
  for (const a of [0, 1, 2, 3]) part(boxG, teal, -BLIMP.rx * 0.82, Math.cos(a * 1.5708) * 3.1, Math.sin(a * 1.5708) * 3.1, 5, a % 2 ? 0.25 : 3.6, a % 2 ? 3.6 : 0.25);
  for (const s of [-1, 1]) part(cylG, dark, -2, -BLIMP.ry * 0.72, s * 3.3, 0.9, 2.2, 0.9, 0, Math.PI / 2);
  blimp.add(hull);
  blimp.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  group.add(blimp);

  let erase = 0;
  return {
    group, blimp,
    update(T) {
      const b = W.blimp(T);
      blimp.position.set(b.x, b.y, b.z);
      blimp.rotation.y = b.dir > 0 ? 0 : Math.PI; // nose first, the teal tail trailing
      blimp.rotation.z = Math.sin(T * 0.4) * 0.02;
    },
    /** k 0..1: how far the props are rubbed out. Returns true when the shadow map must be redrawn. */
    setErase(k) {
      if (k === erase) return false;
      const was = erase > 0.5;
      erase = k;
      for (const m of erasable) m.uniforms.uErase.value = k;
      for (const m of propMeshes) m.castShadow = k < 0.5;
      return was !== k > 0.5;
    },
    dispose() { for (const g of owned) g.dispose(); for (const m of meshes) m.geometry.dispose(); },
  };
}
