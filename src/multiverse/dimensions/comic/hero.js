// INK CITY — the two snipers: pulp vigilantes in long coats and wide hats, built from a
// dozen primitives each. The coat is the player's identity colour; goggles and scarf glow
// in a lighter tint of it so the figure reads from a hundred metres. All animation is
// procedural: run, aim, recoil, the leap (tucked, tails and scarf streaming, boots lit),
// the landing squash, and the knock-out tumble.
import { clamp, lerp, damp, mixHex } from '../../kit.js';
import { PAL } from './art.js';

export const EYE = 1.62, HEAD = 1.66;

export function makeHeroKit(THREE, mats) {
  const box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 12), ball = new THREE.SphereGeometry(1, 18, 12);
  const coatG = new THREE.CylinderGeometry(0.33, 0.22, 0.62, 8), cone = new THREE.ConeGeometry(0.5, 1, 8);
  const dark = mats.make({ color: '#3a2b63', minL: 0.5 }), skin = mats.make({ color: '#f6d3ae', minL: 0.55 }), steel = mats.make({ color: '#8a80ad', minL: 0.5 }), flame = mats.make({ color: '#ffb02e', lit: true }), core = mats.make({ color: '#fff3b0', lit: true });

  function hero(color) {
    const coat = mats.make({ color, minL: 0.5 }), light = mats.make({ color: mixHex(color, '#ffffff', 0.55), minL: 0.6 }), glow = mats.make({ color: mixHex(color, '#ffffff', 0.35), lit: true }), deep = mats.make({ color: mixHex(color, PAL.dark, 0.72), minL: 0.5 });
    const root = new THREE.Group(), body = new THREE.Group(), torso = new THREE.Group(), head = new THREE.Group(), rifle = new THREE.Group();
    const mesh = (geo, m, parent, x, y, z, sx, sy, sz) => { const q = new THREE.Mesh(geo, m); q.position.set(x, y, z); q.scale.set(sx, sy, sz); q.castShadow = true; q.receiveShadow = true; parent.add(q); return q; };
    const pivot = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
    root.add(body);
    // legs: long and lean, boots in the coat's colour
    const legs = [-1, 1].map((s) => {
      const p = pivot(body, s * 0.12, 0.95, 0);
      mesh(box, dark, p, 0, -0.44, 0, 0.15, 0.88, 0.17);
      mesh(box, deep, p, 0, -0.88, -0.05, 0.18, 0.13, 0.3);
      return p;
    });
    // torso: broad at the shoulder, belted at the waist
    torso.position.y = 0.95;
    body.add(torso);
    mesh(coatG, coat, torso, 0, 0.32, 0, 1, 1, 0.6);
    mesh(box, dark, torso, 0, 0.03, 0, 0.44, 0.08, 0.3);
    mesh(box, light, torso, 0, 0.03, -0.155, 0.1, 0.1, 0.03);
    for (const s of [-1, 1]) { const c = mesh(box, light, torso, s * 0.11, 0.66, -0.06, 0.16, 0.16, 0.05); c.rotation.set(0.5, s * -0.5, s * 0.3); } // the collar, turned up
    // the skirt of the coat: five flaps hung from the belt that fly when the sniper does
    const tails = [[-0.23, -0.02, 0.2], [0.23, -0.02, -0.2], [-0.15, 0.14, 0.08], [0, 0.17, 0], [0.15, 0.14, -0.08]].map(([x, z, rz]) => { const p = pivot(torso, x, 0, z); mesh(box, coat, p, 0, -0.27, 0, 0.17, 0.56, 0.045); p.rotation.z = rz; p.userData.rz = rz; return p; });
    // arms
    const arms = [-1, 1].map((s) => { const p = pivot(torso, s * 0.33, 0.56, 0); mesh(box, coat, p, 0, -0.24, 0, 0.13, 0.5, 0.14); mesh(box, dark, p, 0, -0.53, 0, 0.12, 0.12, 0.13); mesh(box, coat, p, 0, 0.02, 0, 0.19, 0.12, 0.2); return p; });
    // head: masked to the nose, goggles alight, the hat pulled low
    head.position.y = 0.8;
    torso.add(head);
    mesh(ball, skin, head, 0, 0, 0, 0.15, 0.165, 0.155);
    mesh(box, light, head, 0, -0.07, -0.06, 0.25, 0.11, 0.22);
    mesh(box, glow, head, 0, 0.035, -0.125, 0.25, 0.07, 0.08);
    const hat = pivot(head, 0, 0.115, 0);
    mesh(cyl, dark, hat, 0, 0, 0, 0.74, 0.03, 0.7);
    mesh(cyl, dark, hat, 0, 0.1, 0, 0.33, 0.19, 0.33);
    mesh(cyl, light, hat, 0, 0.04, 0, 0.345, 0.055, 0.345);
    hat.rotation.x = -0.14;
    // scarf: a knot and five streaming lengths
    mesh(box, light, torso, 0, 0.67, 0.02, 0.27, 0.1, 0.26);
    const scarf = [0, 1, 2, 3, 4].map((i) => mesh(box, light, torso, 0, 0.7, 0.2 + i * 0.2, 0.13 - i * 0.016, 0.03, 0.25));
    // rifle: long, with a fat scope
    rifle.position.set(0.17, 0.5, -0.2);
    torso.add(rifle);
    mesh(box, steel, rifle, 0, 0, -0.6, 0.055, 0.06, 1.3);
    mesh(box, dark, rifle, 0, 0, -1.22, 0.085, 0.085, 0.12);
    mesh(box, dark, rifle, 0, -0.05, 0.2, 0.07, 0.16, 0.42);
    mesh(box, dark, rifle, 0, -0.03, -0.2, 0.08, 0.1, 0.52);
    mesh(box, steel, rifle, 0, -0.13, -0.12, 0.05, 0.14, 0.09);
    const scopeM = mesh(cyl, dark, rifle, 0, 0.095, -0.22, 0.1, 0.4, 0.1);
    scopeM.rotation.x = Math.PI / 2;
    const lens = mesh(cyl, glow, rifle, 0, 0.095, -0.425, 0.085, 0.02, 0.085);
    lens.rotation.x = Math.PI / 2;
    // boot rockets
    const jets = legs.map((p) => { const j = pivot(p, 0, -0.95, 0); const a = mesh(cone, flame, j, 0, -0.3, 0, 0.26, 0.6, 0.26); a.rotation.x = Math.PI; const b = mesh(cone, core, j, 0, -0.2, 0, 0.13, 0.4, 0.13); b.rotation.x = Math.PI; a.castShadow = b.castShadow = false; j.visible = false; return j; });

    let phase = 0, sq = 1, tail = 0, tw = Math.random() * 9;
    return {
      root, mats: [coat, light, glow, deep],
      /** s: { x, y, z, yaw, pitch, speed, lvx, lvz (velocity in the hero's own frame), aim 0..1, recoil 0..1, air 0..1 (0 = grounded), land 0..1, ko (seconds since knocked out, or -1), kx, kz } */
      update(dt, s) {
        tw += dt;
        const run = clamp(s.speed / 6.4, 0, 1), ko = s.ko >= 0, air = s.air > 0 && !ko;
        phase += dt * (3.2 + s.speed * 1.55) * (run > 0.05 ? 1 : 0);
        root.position.set(s.x, s.y, s.z);
        // squash and stretch: long on the way up, flat on landing
        const want = air ? lerp(1.22, 0.96, Math.min(1, s.air * 2.2)) : 1 - s.land * 0.32;
        sq = damp(sq, want, 22, dt);
        body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
        if (ko) {
          // knocked clean out of the panel: spinning, arms and legs anywhere
          root.rotation.set(s.ko * 9, s.yaw, s.ko * 5.5, 'YXZ');
          for (let i = 0; i < 2; i++) { const sg = i ? 1 : -1; arms[i].rotation.set(0.4 + Math.sin(s.ko * 17 + i) * 0.5, 0, sg * 2.3); legs[i].rotation.set(sg * 0.7 + Math.sin(s.ko * 13 + i * 2) * 0.4, 0, sg * 0.5); }
          torso.rotation.set(-0.3, 0, 0);
          rifle.visible = false;
          for (const j of jets) j.visible = false;
          for (let i = 0; i < 5; i++) tails[i].rotation.x = -1.2 + Math.sin(s.ko * 20 + i) * 0.4;
        } else {
          root.rotation.set(0, s.yaw, 0, 'YXZ');
          const sw = Math.sin(phase) * 0.95 * run, back = s.lvz > 0.5 ? -1 : 1; // running backwards swings the other way
          legs[0].rotation.set(air ? -0.95 : sw * back, 0, 0);
          legs[1].rotation.set(air ? 0.55 : -sw * back, 0, 0);
          body.position.y = air ? 0 : Math.abs(Math.sin(phase)) * 0.07 * run - s.land * 0.12;
          body.rotation.z = clamp(-s.lvx * 0.03, -0.2, 0.2) * (air ? 0 : 1);
          const aim = s.aim;
          torso.rotation.set(-(0.2 * run + (air ? 0.4 : 0)) * (1 - aim) + s.pitch * 0.35 * aim - s.recoil * 0.1, 0, 0);
          head.rotation.set(s.pitch * 0.6 - torso.rotation.x * 0.5, 0, 0);
          rifle.rotation.set(lerp(-0.5, s.pitch * 0.65, aim) + s.recoil * 0.22, lerp(0.75, 0, aim), 0, 'YXZ');
          rifle.position.z = -0.2 + s.recoil * 0.1;
          rifle.visible = true;
          arms[1].rotation.set(lerp(0.9, 1.35, aim) + s.pitch * 0.5 * aim + sw * 0.15, 0, -0.1);
          arms[0].rotation.set(lerp(0.6, 1.45, aim) + s.pitch * 0.5 * aim - sw * 0.25, 0, lerp(0.5, 0.42, aim));
          tail = damp(tail, air ? 1.25 : run * 0.75, 9, dt);
          for (let i = 0; i < 5; i++) tails[i].rotation.x = -tail * (i < 2 ? 0.55 : 1) - Math.sin(tw * 5 + i * 1.7) * (0.05 + tail * 0.12);
          for (let i = 0; i < 2; i++) { const j = jets[i]; j.visible = air; if (air) { const f = 0.8 + Math.sin(tw * 60 + i * 2) * 0.25; j.scale.set(f, f * (1.1 + Math.sin(tw * 43) * 0.3), f); } }
        }
        // scarf: trails against the motion, droops when still, always alive in the wind
        // (the evening wind blows down the street, towards +x: in the sniper's own frame that turns with them)
        const wx = Math.cos(s.yaw) * 0.85, wz = Math.sin(s.yaw) * 0.85;
        let dx = wx - s.lvx * 0.22 + 0.2 * Math.sin(tw * 0.7), dy = -0.42 + (run + (air ? 1 : 0) + (ko ? 1 : 0)) * 0.4, dz = 0.3 + wz + Math.max(0, -s.lvz) * 0.3 + (air ? 1.2 : 0);
        const l = Math.hypot(dx, dy, dz) || 1;
        dx /= l; dy /= l; dz /= l;
        for (let i = 0; i < 5; i++) {
          const m = scarf[i], d = 0.16 + i * 0.2, wv = Math.sin(tw * 9 - i * 1.15) * 0.035 * (i + 1), wl = Math.sin(tw * 6.3 - i * 0.9) * 0.025 * (i + 1);
          m.position.set(dx * d + wl, 0.7 + dy * d + wv, 0.1 + dz * d);
          m.rotation.set(-Math.asin(clamp(dy + Math.cos(tw * 9 - i * 1.15) * 0.12, -1, 1)), Math.atan2(dx, dz), 0, 'YXZ');
        }
      },
    };
  }
  return { hero, dispose() { for (const g of [box, cyl, ball, coatG, cone]) g.dispose(); } };
}
