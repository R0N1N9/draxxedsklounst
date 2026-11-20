// TOY BOX — the cast, modelled from primitives: the two riflemen (standing and kneeling,
// in separable parts so that a hit can take them to pieces), the wind-up copter, the train,
// the lamp, and the big soft things that sit around the edge of the rug.
import { TOY } from './tex.js';

// A rifleman facing +x, feet on y = 0. Parts are separate bags: [name, bag].
function rifleman(G, kneel) {
  const B = () => new G.Bag(), parts = [];
  const part = (name, fn) => { const b = B(); fn(b); parts.push([name, b]); };
  const dy = kneel ? -0.24 : 0; // how far the shoulders come down
  part('base', (b) => {
    b.add(G.cyl(0.5, 0.56, 0.09, 22), { p: [0.02, 0.045, 0], s: [1.12, 1, 0.86] });
    b.add(G.ball(0.07, 8, 6), { p: [-0.42, 0.09, 0.2], s: [1, 0.5, 1] }); // the nub where it came off the sprue
  });
  if (!kneel) {
    part('legL', (b) => { b.limb([0, 0.74, -0.1], [0.11, 0.44, -0.13], 0.11, 0.095); b.limb([0.11, 0.44, -0.13], [0.15, 0.16, -0.14], 0.095, 0.08); b.add(G.rbox(0.3, 0.13, 0.17, 0.05, 2), { p: [0.2, 0.14, -0.14] }); });
    part('legR', (b) => { b.limb([-0.02, 0.74, 0.1], [-0.1, 0.44, 0.14], 0.11, 0.095); b.limb([-0.1, 0.44, 0.14], [-0.2, 0.16, 0.15], 0.095, 0.08); b.add(G.rbox(0.3, 0.13, 0.17, 0.05, 2), { p: [-0.15, 0.14, 0.15] }); });
  } else {
    part('legL', (b) => { b.limb([-0.02, 0.5, -0.1], [0.3, 0.52, -0.14], 0.11, 0.095); b.limb([0.3, 0.52, -0.14], [0.3, 0.16, -0.14], 0.095, 0.08); b.add(G.rbox(0.3, 0.13, 0.17, 0.05, 2), { p: [0.35, 0.14, -0.14] }); });
    part('legR', (b) => { b.limb([-0.04, 0.5, 0.1], [0.04, 0.17, 0.15], 0.11, 0.095); b.limb([0.04, 0.17, 0.15], [-0.36, 0.15, 0.17], 0.095, 0.08); b.add(G.rbox(0.14, 0.26, 0.17, 0.05, 2), { p: [-0.4, 0.2, 0.17] }); });
  }
  const ty = kneel ? 0.74 : 0.98;
  part('torso', (b) => {
    b.add(new G.T.CapsuleGeometry(0.18, 0.3, 4, 12), { p: [0.01, ty, 0], r: [0, 0, kneel ? -0.2 : -0.08], s: [0.92, 1, 1.22] });
    b.add(G.rbox(0.4, 0.09, 0.46, 0.04, 2), { p: [0, ty - 0.2, 0] }); // belt
    b.add(G.rbox(0.16, 0.32, 0.32, 0.06, 2), { p: [-0.21, ty + 0.04, 0] }); // pack
    b.add(G.cyl(0.07, 0.07, 0.3, 8), { p: [-0.22, ty + 0.24, 0], r: [Math.PI / 2, 0, 0] }); // bedroll
  });
  const sy = 1.2 + dy, ry = 1.24 + dy; // shoulders, rifle
  part('armR', (b) => { b.limb([0, sy, 0.21], [0.02, sy - 0.22, 0.3], 0.085, 0.07); b.limb([0.02, sy - 0.22, 0.3], [0.26, ry - 0.08, 0.13], 0.07, 0.065); });
  part('armL', (b) => {
    const el = kneel ? [0.3, 0.72, -0.14] : [0.3, sy - 0.18, -0.14];
    b.limb([0.06, sy, -0.21], el, 0.085, 0.07); b.limb(el, [0.56, ry - 0.05, 0.07], 0.07, 0.065);
  });
  part('head', (b) => { b.add(G.ball(0.135, 14, 10), { p: [0.1, sy + 0.22, 0.03] }); b.add(G.cyl(0.07, 0.08, 0.1, 8), { p: [0.06, sy + 0.1, 0.02] }); });
  part('helmet', (b) => {
    b.add(G.dome(0.18, 16, 8), { p: [0.09, sy + 0.24, 0.03], s: [1.08, 0.9, 1] });
    b.add(G.cyl(0.2, 0.215, 0.03, 16), { p: [0.09, sy + 0.24, 0.03], s: [1.08, 1, 1] });
  });
  part('rifle', (b) => {
    const z = 0.1;
    b.add(G.rbox(0.34, 0.13, 0.07, 0.03, 2), { p: [0.03, ry - 0.03, z], r: [0, 0, -0.12] }); // stock
    b.add(G.rbox(0.42, 0.1, 0.075, 0.03, 2), { p: [0.38, ry, z] }); // receiver
    b.add(G.cyl(0.03, 0.03, 0.62, 8), { p: [0.86, ry + 0.01, z], r: [0, 0, Math.PI / 2] }); // barrel
    b.add(G.cyl(0.045, 0.045, 0.09, 8), { p: [1.15, ry + 0.01, z], r: [0, 0, Math.PI / 2] }); // muzzle
    b.add(G.cyl(0.045, 0.045, 0.32, 10), { p: [0.4, ry + 0.1, z], r: [0, 0, Math.PI / 2] }); // scope
    b.add(G.cyl(0.058, 0.045, 0.06, 10), { p: [0.58, ry + 0.1, z], r: [0, 0, Math.PI / 2] });
  });
  return parts;
}

export function makeToys(THREE, G) {
  G.T = THREE;
  const v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
  const merge = (parts) => { const b = new G.Bag(); for (const [, bag] of parts) { b.pos.push(...bag.pos); b.nor.push(...bag.nor); b.uv.push(...bag.uv); b.col.push(...bag.col); } return b.build(); };

  // Soldier geometry is shared by both players (the colour is the material's).
  const standParts = rifleman(G, false), stand = merge(standParts), kneel = merge(rifleman(G, true));
  // The pieces a soldier comes apart into: each centred on itself, with where it sat.
  const pieces = standParts.map(([name, bag]) => {
    const geo = bag.build();
    geo.computeBoundingBox();
    const c = geo.boundingBox.getCenter(new THREE.Vector3());
    geo.translate(-c.x, -c.y, -c.z);
    geo.computeBoundingSphere();
    return { name, geo, c, r: Math.max(0.06, Math.min(geo.boundingBox.max.y - geo.boundingBox.min.y, geo.boundingBox.max.x - geo.boundingBox.min.x, geo.boundingBox.max.z - geo.boundingBox.min.z) / 2) };
  });
  const shard = new THREE.TetrahedronGeometry(0.11, 0);

  // ---- the wind-up copter (nose to +x; the body is the owner's plastic, shaded in the vertices) ----
  const cb = new G.Bag();
  cb.add(G.ball(0.5, 16, 12), { s: [1.45, 0.95, 0.9] });
  cb.add(G.ball(0.34, 12, 10), { p: [0.34, 0.14, 0], s: [1.2, 0.9, 1], color: '#cfd8dc' }); // canopy
  cb.limb([-0.5, 0.1, 0], [-1.75, 0.3, 0], 0.15, 0.06);
  cb.add(G.rbox(0.34, 0.5, 0.05, 0.02, 1), { p: [-1.72, 0.5, 0], r: [0, 0, 0.3] });
  cb.add(G.cyl(0.3, 0.3, 0.03, 14), { p: [-1.74, 0.32, 0.1], r: [Math.PI / 2, 0, 0], color: '#555' });
  for (const z of [-0.44, 0.44]) {
    cb.limb([-0.55, -0.66, z], [0.7, -0.66, z], 0.05, 0.05, '#888');
    cb.limb([-0.25, -0.3, z * 0.8], [-0.3, -0.66, z], 0.035, 0.035, '#888', false);
    cb.limb([0.3, -0.3, z * 0.8], [0.35, -0.66, z], 0.035, 0.035, '#888', false);
  }
  cb.add(G.cyl(0.07, 0.07, 0.34, 8), { p: [0, 0.6, 0], color: '#888' });
  const copter = cb.build();
  const rb = new G.Bag();
  rb.add(G.rbox(3.0, 0.035, 0.2, 0.015, 1), {}); rb.add(G.rbox(0.2, 0.035, 3.0, 0.015, 1), {});
  rb.add(G.cyl(0.13, 0.13, 0.1, 10), {});
  const rotor = rb.build();
  // The key in its side: a shaft and a butterfly grip.
  const kb = new G.Bag();
  kb.add(G.cyl(0.05, 0.05, 0.36, 8), { p: [0, 0, 0.18], r: [Math.PI / 2, 0, 0] });
  for (const s of [-1, 1]) kb.add(G.torus(0.16, 0.05, 6, 14), { p: [s * 0.17, 0, 0.4] });
  const key = kb.build();

  // ---- the train: bright painted wood, three cars, each about 2.76 long, facing +x ----
  const wheels = (b, xs, hub) => {
    for (const x of xs) for (const z of [-0.68, 0.68]) {
      b.add(G.cyl(0.36, 0.36, 0.2, 18), { p: [x, 0.36, z], r: [Math.PI / 2, 0, 0], color: '#e8cf9f' });
      b.add(G.cyl(0.13, 0.13, 0.24, 10), { p: [x, 0.36, z], r: [Math.PI / 2, 0, 0], color: hub });
    }
  };
  const chassis = (b, color) => { b.add(G.rbox(2.6, 0.3, 1.24, 0.08, 2), { p: [0, 0.52, 0], color }); b.add(G.cyl(0.11, 0.11, 0.3, 8), { p: [1.4, 0.5, 0], r: [0, 0, Math.PI / 2], color: '#555' }); };
  const eb = new G.Bag();
  chassis(eb, TOY.red); wheels(eb, [-0.8, 0.75], TOY.red);
  eb.add(G.cyl(0.52, 0.52, 1.5, 20), { p: [0.5, 1.12, 0], r: [0, 0, Math.PI / 2], color: TOY.blue });
  eb.add(G.cyl(0.54, 0.54, 0.12, 20), { p: [1.26, 1.12, 0], r: [0, 0, Math.PI / 2], color: TOY.yellow });
  eb.add(G.rbox(0.95, 1.25, 1.2, 0.1, 2), { p: [-0.78, 1.28, 0], color: TOY.green });
  eb.add(G.rbox(1.2, 0.16, 1.4, 0.07, 2), { p: [-0.78, 1.98, 0], color: TOY.yellow });
  eb.add(G.cyl(0.26, 0.2, 0.6, 14), { p: [0.9, 1.9, 0], color: TOY.yellow });
  eb.add(G.cyl(0.3, 0.3, 0.1, 14), { p: [0.9, 2.2, 0], color: TOY.red });
  eb.add(G.ball(0.24, 12, 10), { p: [0.3, 1.66, 0], color: TOY.red });
  const engine = eb.build();
  const lb = new G.Bag();
  chassis(lb, TOY.blue); wheels(lb, [-0.8, 0.8], TOY.blue);
  for (const x of [-1.05, 1.05]) for (const z of [-0.5, 0.5]) lb.add(G.cyl(0.07, 0.07, 0.9, 8), { p: [x, 1.1, z], color: TOY.yellow });
  [[-0.3, 0.95, TOY.wood], [0.3, 0.95, TOY.green], [0, 1.44, TOY.red]].forEach(([z, y, c]) => lb.add(G.cyl(0.28, 0.28, 2.0, 14), { p: [0, y, z], r: [0, 0, Math.PI / 2], color: c }));
  const logs = lb.build();
  const tb = new G.Bag();
  chassis(tb, TOY.green); wheels(tb, [-0.8, 0.8], TOY.green);
  for (const z of [-0.56, 0.56]) tb.add(G.rbox(2.4, 0.8, 0.12, 0.05, 2), { p: [0, 1.06, z], color: TOY.yellow });
  for (const x of [-1.14, 1.14]) tb.add(G.rbox(0.12, 0.8, 1.0, 0.05, 2), { p: [x, 1.06, 0], color: TOY.yellow });
  [[-0.7, '#3b6fd0'], [-0.05, '#e8e2d0'], [0.6, '#c93b3b'], [0.25, '#49a36a']].forEach(([x, c], i) => tb.add(G.ball(0.4, 14, 10), { p: [x, 1.2 + (i === 3 ? 0.5 : 0), i === 3 ? 0.1 : (i & 1 ? 0.12 : -0.12)], color: c }));
  const tub = tb.build();

  // ---- the lamp: base at `base`, shade at `head`, pointing along `dir` (unit) ----
  function lamp(base, head, dir) {
    const b = new G.Bag(), enamel = '#d9d2c0', brass = '#c9a24a';
    b.add(G.cyl(1.9, 2.15, 0.34, 30), { p: [base.x, 0.17, base.z], color: enamel });
    const el = [base.x + (head.x - base.x) * 0.2, head.y * 0.72, base.z + (head.z - base.z) * 0.05], neck = [head.x - dir.x * 0.5, head.y - dir.y * 0.5, head.z - dir.z * 0.5];
    b.limb([base.x, 0.3, base.z], el, 0.16, 0.14, enamel, false);
    b.limb(el, neck, 0.13, 0.12, enamel, false);
    b.add(G.ball(0.3, 12, 10), { p: el, color: brass });
    b.add(G.ball(0.26, 12, 10), { p: neck, color: brass });
    q.setFromUnitVectors(up, v.set(dir.x, dir.y, dir.z));
    b.add(G.lathe([[0.3, -0.5], [0.42, 0], [0.75, 0.3], [1.9, 2.3], [1.98, 2.34]], 30), { p: [head.x, head.y, head.z], q: q.clone(), color: enamel });
    const body = b.build();
    // What glows: the inside of the shade and the bulb.
    const g = new G.Bag(), bulb = new G.Bag();
    g.add(G.lathe([[0.4, 0.06], [0.72, 0.34], [1.84, 2.3]], 30), { p: [head.x, head.y, head.z], q: q.clone() });
    bulb.add(G.ball(0.46, 14, 10), { p: [head.x + dir.x * 1.0, head.y + dir.y * 1.0, head.z + dir.z * 1.0] });
    return { body, glow: g.build(), bulb: bulb.build() };
  }

  // ---- a teddy bear sitting with its feet towards the rug (only its lower half is ever in frame) ----
  function bear(b, x, z, rot, s) {
    const fur = '#b9884f', pad = '#e2c596', c = Math.cos(rot), sn = Math.sin(rot);
    const at = (lx, y, lz) => [x + (lx * c - lz * sn) * s, y * s, z + (lx * sn + lz * c) * s];
    b.add(G.ball(1, 20, 16), { p: at(0, 1.25, 0), s: [1.25 * s, 1.35 * s, 1.15 * s], color: fur });
    b.add(G.ball(0.72, 16, 12), { p: at(0.5, 1.2, 0), s: [0.8 * s, 1.1 * s, 1.0 * s], color: pad });
    for (const k of [-1, 1]) {
      b.add(G.ball(0.5, 14, 10), { p: at(1.25, 0.5, k * 0.8), s: [1.5 * s, 1 * s, 1 * s], color: fur });
      b.add(G.ball(0.36, 12, 10), { p: at(1.95, 0.52, k * 0.8), s: [0.35 * s, 1.15 * s, 1.15 * s], color: pad });
      b.add(G.ball(0.42, 12, 10), { p: at(0.5, 1.7, k * 1.25), s: [1.2 * s, 1.3 * s, 0.95 * s], color: fur });
      b.add(G.ball(0.34, 12, 8), { p: at(0.05, 3.9, k * 0.72), s: [0.6 * s, 1 * s, 1 * s], color: fur });
    }
    b.add(G.ball(0.92, 18, 14), { p: at(0.1, 3.05, 0), s, color: fur });
    b.add(G.ball(0.4, 12, 10), { p: at(0.85, 2.85, 0), s: [1 * s, 0.85 * s, 1.1 * s], color: pad });
    b.add(G.ball(0.13, 8, 6), { p: at(1.22, 2.95, 0), s, color: '#33241d' });
  }

  // ---- ring stacker, beach ball, crayons, marbles, the toy chest ----
  function stacker(b, x, z) {
    b.add(G.cyl(1.9, 2.0, 0.36, 26), { p: [x, 0.18, z], color: TOY.wood });
    b.add(G.cyl(0.2, 0.34, 4.2, 12), { p: [x, 2.3, z], color: TOY.wood });
    b.add(G.ball(0.36, 12, 10), { p: [x, 4.5, z], color: TOY.red });
    [[1.5, TOY.red], [1.3, '#e8792c'], [1.1, TOY.yellow], [0.9, TOY.green], [0.72, TOY.blue]].forEach(([r, c], i) => b.add(G.torus(r, 0.4, 12, 28), { p: [x, 0.76 + i * 0.74, z], r: [Math.PI / 2, 0, 0], color: c }));
  }
  function beachBall(r) {
    const g = G.ball(r, 24, 16).toNonIndexed(), p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    const panels = [TOY.red, '#f2ecdc', TOY.blue, '#f2ecdc', TOY.yellow, '#f2ecdc'];
    for (let i = 0; i < p.count; i += 3) {
      const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
      c.set(Math.abs(cy) > r * 0.9 ? '#f2ecdc' : panels[Math.floor(((Math.atan2(cz, cx) + Math.PI) / (Math.PI * 2)) * 6) % 6]);
      for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r; col[(i + k) * 3 + 1] = c.g; col[(i + k) * 3 + 2] = c.b; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }
  function crayon(b, x, z, rot, color) {
    const c = Math.cos(rot), s = Math.sin(rot), at = (l) => [x + c * l, 0.17, z + s * l], r = [0, -rot, Math.PI / 2];
    b.add(G.cyl(0.16, 0.16, 2.0, 10), { p: at(0), r, color });
    b.add(G.cyl(0.175, 0.175, 1.2, 10), { p: at(-0.1), r, color: '#efe9da' });
    b.add(G.cyl(0.178, 0.178, 0.12, 10), { p: at(0.3), r, color });
    b.add(G.cone(0.15, 0.4, 10), { p: at(1.2), r: [0, -rot, -Math.PI / 2], color });
  }
  function chest(b, x, z, rot) {
    const c = Math.cos(rot), s = Math.sin(rot), at = (lx, y, lz) => [x + lx * c - lz * s, y, z + lx * s + lz * c], r = [0, -rot, 0];
    b.add(G.rbox(9, 4.2, 5, 0.14, 2), { p: at(0, 2.1, 0), r, color: '#a9743f' });
    for (const y of [0.9, 2.1, 3.3]) b.add(G.rbox(9.12, 0.95, 5.12, 0.1, 2), { p: at(0, y, 0), r, color: y === 2.1 ? '#b98350' : '#9a6836' });
    for (const lx of [-4.4, 4.4]) b.add(G.rbox(0.5, 4.4, 5.3, 0.08, 2), { p: at(lx, 2.1, 0), r, color: '#2d3142' });
    b.add(G.rbox(9.3, 0.5, 5.3, 0.12, 2), { p: at(0, 5.6, -3.2), r: [-1.1, -rot, 0], color: '#8a5a30' }); // the lid, thrown back
    b.add(G.rbox(1.1, 0.9, 0.2, 0.06, 2), { p: at(0, 3.3, 2.6), r, color: '#c9a24a' }); // the hasp
  }

  return {
    stand, kneel, pieces, shard, copter, rotor, key, cars: [engine, logs, tub], lamp, bear, stacker, beachBall, crayon, chest,
    dispose() { for (const g of [stand, kneel, shard, copter, rotor, key, engine, logs, tub]) g.dispose(); for (const p of pieces) p.geo.dispose(); },
  };
}
