// IRON AUTUMN — set dressing that the map's pieces call for: sandbags, walls, wrecks,
// carts, tank traps, the fountain, trees, rubble, leaves. Adds to the batches made in build.js.
import { clamp, lerp, fbm, mulberry32 } from '../../kit.js';
import { ruinWall } from './kitbash.js';
import { TERRACE_Y } from './map.js';

const RUST = ['#4a3f36', '#3a332d', '#5a4030', '#2a2623', '#463c34'];
const BRICK = ['#7a4a38', '#8a5a44', '#b0a590', '#8a8478', '#3a3430', '#9a8a78', '#6a4636'];
const LEAF = ['#b8651e', '#c98a2a', '#8a4a1a', '#a8741c', '#6e4a22'];

export function buildProps(THREE, map, tex, seed, fog, town) {
  const rnd = mulberry32(seed ^ 0x9e07);
  const R = (a, b) => a + rnd() * (b - a);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const { masonry, stone, wood, plain } = town.batches;
  const group = town.group;
  const M = new THREE.Matrix4(), U = new THREE.Vector3(), V = new THREE.Vector3(0, 1, 0), W = new THREE.Vector3();
  const wallM = (ax, az, bx, bz, y = 0) => { U.set(bx - ax, 0, bz - az).normalize(); W.set(-U.z, 0, U.x); return M.makeBasis(U, V, W).setPosition(ax, y, az); };
  const zr = (p) => (p.m > 0 ? [p.z0, p.z1] : [-p.z1, -p.z0]);
  const dummy = new THREE.Object3D(), colour = new THREE.Color();

  // Instanced scatter: collect transforms, build one mesh at the end.
  function scatter(geo, material, cast) {
    const items = [];
    return {
      add(x, y, z, sx, sy, sz, ry, rx, rz, col) { items.push([x, y, z, sx, sy, sz, ry, rx, rz, col]); },
      build() {
        const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, items.length));
        items.forEach((it, i) => {
          dummy.position.set(it[0], it[1], it[2]);
          dummy.scale.set(it[3], it[4], it[5]);
          dummy.rotation.set(it[7], it[6], it[8], 'YXZ');
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
          mesh.setColorAt(i, colour.set(it[9]));
        });
        mesh.count = items.length;
        mesh.castShadow = !!cast;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false; // one bounding sphere for the whole town is no use
        group.add(mesh);
        return mesh;
      },
    };
  }
  const bags = scatter(new THREE.SphereGeometry(0.5, 7, 5), fog.patch(new THREE.MeshLambertMaterial({ map: tex.sack, normalMap: tex.sackN })), true);
  const rubbleMat = fog.patch(new THREE.MeshLambertMaterial({ flatShading: true }));
  const bricks = scatter(new THREE.BoxGeometry(0.26, 0.11, 0.13), rubbleMat), rocks = scatter(new THREE.IcosahedronGeometry(0.26, 0), rubbleMat);
  const leaves = scatter(new THREE.CircleGeometry(0.09, 5).rotateX(-Math.PI / 2), fog.patch(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide })));
  const debris = (x, z, y = map.height(x, z), big = 1) => {
    if (rnd() < 0.55) bricks.add(x, y + 0.04 * big, z, R(0.8, 2.6) * big, R(0.8, 2.4) * big, R(0.8, 2.6) * big, R(0, 6.3), R(-0.5, 0.5), R(-0.5, 0.5), pick(BRICK));
    else rocks.add(x, y + 0.03, z, R(0.5, 1.9) * big, R(0.35, 1.1) * big, R(0.5, 1.9) * big, R(0, 6.3), R(-0.4, 0.4), 0, pick(BRICK));
  };

  function crate(x, y, z, w, h, d, ry) {
    const c = pick(['#8a7250', '#7a6646', '#6e6a4c']);
    wood.box(x, y + h / 2, z, w, h, d, c, ry);
    for (const sy of [0.08, h - 0.08]) wood.box(x, y + sy, z, w + 0.04, 0.1, d + 0.04, '#5e4c34', ry);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const cx = x + Math.cos(ry) * sx * (w / 2 - 0.04) + Math.sin(ry) * sz * (d / 2 - 0.04), cz = z - Math.sin(ry) * sx * (w / 2 - 0.04) + Math.cos(ry) * sz * (d / 2 - 0.04);
      wood.box(cx, y + h / 2, cz, 0.1, h, 0.1, '#5e4c34', ry);
    }
  }

  function wheel(x, y, z, r, ry, rz = 0) {
    plain.add(new THREE.CylinderGeometry(r, r, 0.22, 12), plain.mat(x, y, z, ry, Math.PI / 2, rz), '#1f1c1a');
    plain.add(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.26, 8), plain.mat(x, y, z, ry, Math.PI / 2, rz), pick(RUST));
  }

  for (const p of map.pieces) {
    if (p.type === 'sandbags') {
      const [z0, z1] = zr(p), alongX = p.x1 - p.x0 >= z1 - z0, len = alongX ? p.x1 - p.x0 : z1 - z0, deep = alongX ? z1 - z0 : p.x1 - p.x0;
      const rows = Math.round(p.h / 0.2), n = Math.max(1, Math.round(len / 0.62)), bl = len / n;
      for (let r = 0; r < rows; r++) for (let i = 0; i < n + (r & 1); i++) {
        let u = (i + 0.5 - (r & 1) * 0.5) * bl;
        const short = u < bl * 0.3 || u > len - bl * 0.3; // half bags finish the odd rows
        u = clamp(u, bl * 0.27, len - bl * 0.27);
        const x = alongX ? p.x0 + u : (p.x0 + p.x1) / 2, z = alongX ? (z0 + z1) / 2 : z0 + u, t = 0.7 + rnd() * 0.4;
        bags.add(x + R(-0.03, 0.03), p.y + 0.11 + r * (p.h - 0.04) / rows, z + R(-0.03, 0.03), short ? 0.36 : 0.68, 0.27, deep * 1.06,
          (alongX ? 0 : Math.PI / 2) + R(-0.08, 0.08), 0, R(-0.05, 0.05), colour.setRGB(0.62 * t, 0.56 * t, 0.44 * t).getHex());
      }
      for (let k = 0; k < 4; k++) debris(lerp(p.x0, p.x1, rnd()) + R(-0.8, 0.8), lerp(z0, z1, rnd()) + R(-0.9, 0.9), p.y || undefined, 0.6);
    } else if (p.type === 'wall') {
      const [z0, z1] = zr(p), ew = p.x1 - p.x0 > z1 - z0, len = ew ? p.x1 - p.x0 : z1 - z0, thick = ew ? z1 - z0 : p.x1 - p.x0, ph = R(0, 50);
      const w = ruinWall(THREE, len, thick, (u) => p.h + 0.12 - Math.max(0, fbm(u * 0.5 + ph, ph, 2)) * 0.9 + (p.h > 2 ? Math.max(0, fbm(u * 0.3 + ph, 7, 2)) * 2.5 : 0), p.h > 2.4 ? [{ u: len * 0.5 - 0.5, v: 1.3, w: 1.0, h: 1.0 + (p.h - 2.4) }] : []);
      masonry.add(w.geo, ew ? wallM(p.x0, z0, p.x1, z0) : wallM(p.x1, z0, p.x1, z1), pick(['#b9a78c', '#a9a69c', '#c4a78c']), 0.3);
      for (let k = 0; k < 10; k++) debris(lerp(p.x0, p.x1, rnd()) + R(-1.2, 1.2), lerp(z0, z1, rnd()) + R(-1.2, 1.2));
    } else if (p.type === 'crates') {
      const [z0, z1] = zr(p), cx = (p.x0 + p.x1) / 2, cz = (z0 + z1) / 2, w = p.x1 - p.x0, d = z1 - z0;
      if (w > 1.8) {
        crate(cx - w / 4, p.y, cz, w / 2 - 0.06, p.h, d - 0.1, R(-0.05, 0.05));
        crate(cx + w / 4, p.y, cz + 0.05, w / 2 - 0.06, p.h * 0.94, d - 0.2, R(-0.06, 0.06));
        if (p.top) crate(cx - 0.25, p.y + p.h, cz, 1.05, 0.85, 1.05, 0.15);
      } else crate(cx, p.y, cz, w - 0.1, p.h, d - 0.1, 0.04);
      plain.cyl(cx + w / 2 + 0.5, p.y + 0.45, cz + R(-0.3, 0.3), 0.3, 0.3, 0.9, pick(RUST), 10); // a fuel drum (dressing only)
    } else if (p.type === 'cart') {
      const x = p.x, z = p.m * p.z, ry = p.rot * p.m;
      wood.box(x, 1.0, z, 2.7, 0.12, 1.35, '#6e5a40', ry, 0, 0.1);
      for (const s of [-1, 1]) wood.box(x - Math.sin(ry) * s * 0.66, 1.2, z - Math.cos(ry) * s * 0.66 * 1, 2.7, 0.4, 0.06, '#5e4c34', ry, 0, 0.1);
      wood.box(x + 1.9 * Math.cos(ry), 0.72, z - 1.9 * Math.sin(ry), 1.6, 0.08, 0.08, '#4e3e2c', ry, 0, 0.32);
      wheel(x - 0.3, 0.6, z + 0.78, 0.6, ry);
      wheel(x - 0.5, 0.2, z - 1.05, 0.6, ry, 1.2); // the other one has come off
      crate(x - 0.5, 1.06, z, 0.8, 0.5, 0.8, ry + 0.3);
    } else if (p.type === 'hedgehog') {
      const y = map.height(p.x, p.z) + 0.55, a = R(0, 6.3);
      for (let k = 0; k < 3; k++) plain.box(p.x, y, p.z, 0.13, 1.9, 0.13, pick(RUST), a + k * 2.094, 0.96, 0);
    } else if (p.type === 'column') {
      stone.cyl(p.x, 0.2, p.z, 0.86, 0.9, 0.4, '#8f887a', 14);
      plain.cyl(p.x, 1.75, p.z, 0.75, 0.75, 2.7, '#8c8674', 16);
      plain.cyl(p.x, 3.35, p.z, 0.2, 0.9, 0.5, '#3a3d44', 16);
      // What is left of the bills pasted on it: pale scraps, nothing legible.
      for (let k = 0; k < 7; k++) {
        const a = R(0, 6.3), h = R(0.4, 0.9);
        plain.add(new THREE.CylinderGeometry(0.762, 0.762, h, 5, 1, true, a, R(0.35, 0.8)), plain.mat(p.x, R(0.9, 2.6), p.z), pick(['#c9c0a8', '#a9a08a', '#b98a6a', '#9aa6a0', '#d2c8a8']));
      }
    } else if (p.type === 'tree') {
      const branch = (x, y, z, len, rad, yaw, pitch, depth) => {
        const dx = Math.sin(pitch) * Math.sin(yaw), dy = Math.cos(pitch), dz = Math.sin(pitch) * Math.cos(yaw);
        wood.add(new THREE.CylinderGeometry(rad * 0.68, rad, len, depth > 1 ? 6 : 4), wood.mat(x + dx * len / 2, y + dy * len / 2, z + dz * len / 2, yaw, pitch), '#3a3028');
        if (depth <= 0) return;
        const n = depth > 2 ? 3 : 2;
        for (let i = 0; i < n; i++) branch(x + dx * len * R(0.75, 1), y + dy * len * R(0.75, 1), z + dz * len * R(0.75, 1), len * R(0.58, 0.75), rad * 0.62, yaw + R(-1.3, 1.3) + i * 2.1, clamp(pitch + R(0.3, 0.75), 0, 1.35), depth - 1);
      };
      branch(p.x, map.height(p.x, p.z) - 0.1, p.z, R(3.2, 4), 0.3, R(0, 6.3), R(0.02, 0.1), 4);
      for (let k = 0; k < 90; k++) { const a = R(0, 6.3), d = R(0.3, 6.5) * Math.sqrt(rnd()), x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d; leaves.add(x, map.height(x, z) + 0.03, z, R(0.7, 1.5), 1, R(0.6, 1.2), R(0, 6.3), R(-0.3, 0.3), 0, pick(LEAF)); }
    } else if (p.type === 'lamp') {
      const lean = R(-0.12, 0.12), lz = R(-0.2, 0.2), y = map.height(p.x, p.z);
      plain.cyl(p.x, y + 2.3, p.z, 0.05, 0.085, 4.6, '#2a2c2b', 6, 0, lean, lz);
      plain.cyl(p.x, y + 0.35, p.z, 0.13, 0.16, 0.7, '#2a2c2b', 8);
      plain.box(p.x + 0.35, y + 4.5, p.z, 0.8, 0.06, 0.06, '#2a2c2b', 0, lean, lz);
      plain.box(p.x + 0.7, y + 4.3, p.z, 0.26, 0.36, 0.26, '#3c3a30', 0, lean, lz);
    } else if (p.type === 'fountain') {
      const prof = (pts) => pts.map(([r, y]) => new THREE.Vector2(r, y));
      stone.add(new THREE.LatheGeometry(prof([[3.1, 0], [3.16, 0.55], [3.3, 0.62], [3.3, 0.78], [2.8, 0.78], [2.72, 0.36], [0.6, 0.3]]), 28), null, '#aaa390');
      stone.add(new THREE.LatheGeometry(prof([[0.95, 0.3], [0.8, 0.55], [0.62, 1.7], [0.5, 1.9], [1.5, 2.25], [1.6, 2.4], [1.45, 2.42], [0.42, 2.3], [0.3, 3.1], [0.42, 3.25], [0.2, 3.4], [0, 3.42]]), 20), null, '#b5ad98');
      stone.box(1.9, 0.5, -1.2, 0.5, 0.42, 1.1, '#aaa390', 0.6, 0.3, 0.2); // part of whatever stood on top
      for (let k = 0; k < 60; k++) { const a = R(0, 6.3), d = R(0.9, 2.6); leaves.add(Math.cos(a) * d, 0.34, Math.sin(a) * d, R(0.7, 1.6), 1, R(0.6, 1.3), R(0, 6.3), 0, 0, pick(LEAF)); }
    } else if (p.type === 'ramp') {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0); shape.lineTo(6.9, 0); shape.lineTo(0.9, TERRACE_Y); shape.lineTo(0, TERRACE_Y);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 5.6, bevelEnabled: false });
      masonry.add(geo, p.m > 0 ? wallM(30.6, 19, 30.6, 26) : wallM(25, -19, 25, -26), '#84735f', 0.2);
      for (let k = 0; k < 110; k++) {
        const u = R(0, 6.8), x = R(25, 30.6), y = clamp(TERRACE_Y * (1 - (u - 0.9) / 6), 0, TERRACE_Y);
        debris(x, p.m * (19 + u), y, R(0.9, 1.7));
      }
    } else if (p.type === 'tank' || p.type === 'halftrack') {
      const ox = p.x, oz = p.z, ry = p.type === 'tank' ? 0.05 : -0.04, c = Math.cos(ry), s = Math.sin(ry);
      const L = (x, z) => [ox + x * c + z * s, oz - x * s + z * c];
      const part = (x, y, z, w, h, d, col = pick(RUST), r2 = 0, rx = 0, rz = 0) => { const [wx, wz] = L(x, z); plain.box(wx, y, wz, w, h, d, col, ry + r2, rx, rz); };
      const drum = (x, y, z, r, len, col, r2 = 0, rx = Math.PI / 2, rz = 0) => { const [wx, wz] = L(x, z); plain.add(new THREE.CylinderGeometry(r, r, len, 12), plain.mat(wx, y, wz, ry + r2, rx, rz), col); };
      if (p.type === 'tank') {
        for (const sz of [-1, 1]) {
          part(0, 0.4, sz * 1.18, 5.0, 0.62, 0.62, '#231f1c');
          for (const ex of [-2.5, 2.5]) drum(ex, 0.42, sz * 1.18, 0.36, 0.62, '#231f1c');
          for (let k = 0; k < 5; k++) drum(-2 + k, 0.36, sz * 1.5, 0.3, 0.1, pick(RUST));
          part(0, 0.86, sz * 1.18, 5.3, 0.08, 0.72, RUST[1]);
        }
        part(0, 1.1, 0, 5.2, 0.72, 2.3, RUST[0]);
        part(-2.75, 0.95, 0, 0.9, 0.7, 2.28, RUST[4], 0, 0, 0.75);
        part(2.3, 1.5, 0, 1.4, 0.1, 1.8, '#1c1a18');
        for (let k = 0; k < 4; k++) part(1.8 + k * 0.3, 1.56, 0, 0.08, 0.06, 1.6, RUST[3]);
        const tr = 0.42; // turret slewed off-axis, gun down: it died mid-traverse
        { const [wx, wz] = L(-0.25, 0); plain.add(new THREE.CylinderGeometry(1.08, 1.2, 0.78, 10), plain.mat(wx, 1.86, wz, ry + tr), RUST[0]); plain.cyl(wx + 0.3, 2.33, wz - 0.35, 0.36, 0.38, 0.2, RUST[1], 10); plain.add(new THREE.CylinderGeometry(0.33, 0.33, 0.05, 10), plain.mat(wx + 0.75, 2.55, wz - 0.35, 0, 0, 1.2), RUST[2]); }
        const gx = -0.25 - Math.cos(tr) * 2.5, gz = Math.sin(tr) * 2.5;
        drum(gx, 1.74, gz, 0.085, 3.2, '#2a2623', tr, 0, Math.PI / 2 + 0.09);
        drum(-0.25 - Math.cos(tr) * 4.0, 1.61, Math.sin(tr) * 4.0, 0.13, 0.4, '#1c1a18', tr, 0, Math.PI / 2 + 0.09);
        part(-0.25 - Math.cos(tr) * 1.1, 1.84, Math.sin(tr) * 1.1, 0.5, 0.6, 0.9, RUST[1], tr);
        part(-0.6, 0.06, 2.6, 3.0, 0.07, 0.6, '#231f1c', 0.3); // the thrown track
      } else {
        part(-2.0, 1.0, 0, 1.7, 0.75, 1.5, RUST[0]);
        part(-2.9, 0.95, 0, 0.12, 0.65, 1.3, '#1c1a18');
        for (const sz of [-1, 1]) {
          const [wx, wz] = L(-2.1, sz * 1.0);
          wheel(wx, 0.45, wz, 0.45, ry);
          part(-2.1, 0.98, sz * 1.02, 1.3, 0.06, 0.5, RUST[1], 0, 0, 0);
          part(1.2, 0.36, sz * 0.98, 3.1, 0.55, 0.5, '#231f1c');
          for (let k = 0; k < 4; k++) drum(0.0 + k * 0.8, 0.34, sz * 1.26, 0.28, 0.08, pick(RUST));
          part(1.25, 1.22, sz * 1.08, 3.2, 0.95, 0.07, RUST[sz > 0 ? 0 : 4], 0, sz * 0.2);
          part(1.25, 0.72, sz * 1.0, 3.2, 0.4, 0.07, RUST[1], 0, -sz * 0.35);
        }
        part(-0.55, 1.25, 0, 1.25, 1.15, 2.0, RUST[4]);
        part(-1.2, 1.5, 0, 0.06, 0.45, 1.5, '#0e0d0c');
        part(1.3, 0.62, 0, 3.2, 0.1, 1.9, '#2a2623');
        part(2.88, 1.15, 0, 0.07, 1.0, 2.1, RUST[2]);
        for (const hx of [0.3, 1.15, 2.0]) { // tilt hoops, canvas long gone
          for (const sz of [-1, 1]) part(hx, 2.02, sz * 1.02, 0.05, 0.8, 0.05, '#2a2623');
          part(hx, 2.42, 0, 0.05, 0.05, 2.1, '#2a2623');
        }
      }
      for (let k = 0; k < 14; k++) { const [wx, wz] = L(R(-4, 4), R(-2.6, 2.6)); debris(wx, wz, undefined, 0.7); }
    }
  }

  // ---- trench furniture: duckboards, posts, a plank or two of revetment ----
  for (const s of map.trench) {
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az), ux = (s.bx - s.ax) / len, uz = (s.bz - s.az) / len, ry = Math.atan2(-uz, ux);
    for (let u = 0.3; u < len; u += 0.5) {
      const d = lerp(s.da, s.db, u / len), x = s.ax + ux * u, z = s.az + uz * u;
      if (d < 0.4) continue;
      if (rnd() < 0.9) wood.box(x, map.height(x, z) + 0.05, z, 0.34, 0.05, 1.05, '#6a5a44', ry + R(-0.06, 0.06), R(-0.03, 0.03), R(-0.03, 0.03));
      if (d > 1.2 && Math.round(u * 2) % 4 === 0) for (const sd of [-1, 1]) {
        const px = x - uz * sd * 0.78, pz = z + ux * sd * 0.78;
        wood.box(px, map.height(x, z) + 0.72, pz, 0.12, 1.5, 0.12, '#4e4032', ry, R(-0.05, 0.05), R(-0.05, 0.05));
        if (rnd() < 0.7) wood.box(px - uz * sd * 0.08 + ux * 1.0, map.height(x, z) + R(0.5, 1.2), pz + ux * sd * 0.08 + uz * 1.0, 2.05, 0.2, 0.04, '#5e4c38', ry, 0, R(-0.03, 0.03));
      }
    }
  }

  // ---- rubble where masonry came down, leaves where the wind left them ----
  for (let k = 0; k < 520; k++) {
    const sgn = rnd() < 0.5 ? -1 : 1, x = sgn * R(23.5, 30.2), z = R(-59, 59);
    if (x > 18 && Math.abs(z) < 26) continue;
    debris(x, z, undefined, R(0.8, 1.6));
  }
  for (let k = 0; k < 160; k++) { const z = (rnd() < 0.5 ? -1 : 1) * R(54.5, 59.6); debris(R(-29, 29), z, undefined, R(0.8, 1.7)); }
  for (const c of map.craters) for (let k = 0; k < 9; k++) { const a = R(0, 6.3), d = c.r * R(0.95, 1.5); debris(c.x + Math.cos(a) * d, c.z + Math.sin(a) * d, undefined, 0.75); }
  for (let k = 0; k < 220; k++) debris(R(-22, 22), R(-52, 52), undefined, 0.55);
  for (let k = 0; k < 700; k++) {
    // Leaves gather against kerbs and in hollows: bias them to the edges and the pits.
    const x = R(-29, 29) * (rnd() < 0.5 ? 1 : Math.sqrt(rnd())), z = R(-58, 58), h = map.height(x, z);
    if (x > 23.5 && Math.abs(z) < 19.5) continue;
    leaves.add(x, h + 0.03, z, R(0.6, 1.5), 1, R(0.6, 1.3), R(0, 6.3), R(-0.25, 0.25), R(-0.25, 0.25), pick(LEAF));
  }
  // What the wall leaves behind: shown only once it is down.
  const after = scatter(new THREE.BoxGeometry(0.3, 0.16, 0.2), rubbleMat);
  const fw = map.fallWall;
  for (let k = 0; k < 150; k++) after.add(R(fw.x0 - 0.5, fw.x1 + 0.5), R(0.05, 0.75) * (1 - Math.abs(R(-1, 1))), R(-2.6, 2.6) * rnd(), R(0.8, 2.8), R(0.8, 2.5), R(0.8, 2.8), R(0, 6.3), R(-0.6, 0.6), R(-0.6, 0.6), pick(BRICK));

  bags.build();
  bricks.build();
  rocks.build();
  leaves.build();
  const afterMesh = after.build();
  afterMesh.visible = false;
  return { afterMesh };
}
