// IRON AUTUMN — the two snipers. No skeleton: every frame the pose is a handful of joint
// positions in the soldier's own space (feet at the origin, facing -Z), limbs are capsules
// laid between them with two-bone IK, and the long coat, scarf and kit hang off that.
// The same pose maths gives the game its hit shapes (see shapeOf), so what you see is what
// a bullet meets.
import { clamp, lerp } from '../../kit.js';

const UPPER = 0.32, FORE = 0.3, THIGH = 0.46, SHIN = 0.46;
export const RIFLE_LEN = 1.16;

// Standing amount k: 1 upright, 0 kneeling behind cover, ~0.45 risen to aim over it.
export const hipY = (k) => lerp(0.5, 0.93, k);
export const leanOf = (k) => lerp(0.5, 0.1, k);
// Head centre above the feet, and how far forward of them it sits.
export const headY = (k) => hipY(k) + 0.5 * Math.cos(leanOf(k)) + 0.16;
export const headFwd = (k) => 0.5 * Math.sin(leanOf(k)) + 0.03 - lerp(0.08, 0, k);
export const EYE_STAND = headY(1), EYE_CROUCH = headY(0), EYE_PEEK = headY(0.45);

// Hit shapes in world space for a soldier at (x, y, z) facing yaw: out = { hx hy hz (head
// sphere), ax ay az → bx by bz (body capsule) }.
export function shapeOf(x, y, z, yaw, k, out) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), hf = headFwd(k), tf = hf * 0.5, lf = -lerp(0.08, 0, k);
  out.hx = x + fx * hf; out.hy = y + headY(k); out.hz = z + fz * hf;
  out.bx = x + fx * tf; out.by = y + hipY(k) + 0.36; out.bz = z + fz * tf;
  out.ax = x + fx * lf; out.ay = y + lerp(0.24, 0.3, k); out.az = z + fz * lf;
  return out;
}

export function makeSoldierKit(THREE, fog) {
  const lam = (color, o) => fog.patch(new THREE.MeshLambertMaterial({ color, ...o }));
  const mats = {
    coat: lam('#5b5847'), coatDark: lam('#4a4839', { side: THREE.DoubleSide }), trousers: lam('#45433a'), boot: lam('#1d1a18'), leather: lam('#4a3523'),
    skin: lam('#b89074'), steel: lam('#414a3f'), wood: lam('#6a4528'), gun: lam('#23272b'), canvas: lam('#77705a'),
  };
  const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 3, 8);
  const geos = {
    upper: cap(0.062, UPPER - 0.06), fore: cap(0.052, FORE - 0.05), thigh: cap(0.088, THIGH - 0.1), shin: cap(0.066, SHIN - 0.08),
    torso: new THREE.CylinderGeometry(0.2, 0.165, 0.52, 10), pelvis: new THREE.SphereGeometry(0.175, 10, 8),
    skirt: new THREE.CylinderGeometry(0.19, 0.33, 0.62, 12, 1, true), head: new THREE.SphereGeometry(0.105, 12, 10),
    hand: new THREE.SphereGeometry(0.052, 8, 6), boot: new THREE.BoxGeometry(0.11, 0.1, 0.27), box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 10), collar: new THREE.TorusGeometry(0.105, 0.05, 6, 12), band: new THREE.TorusGeometry(0.068, 0.016, 5, 10),
    dome: new THREE.SphereGeometry(0.142, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.56), brim: new THREE.CylinderGeometry(0.139, 0.175, 0.05, 14, 1, true),
    hband: new THREE.TorusGeometry(0.142, 0.012, 4, 16),
  };
  const idMat = (color) => fog.patch(new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.75 }));

  // A helmet on its own: worn, shot off, or raised on a stick. Origin at the crown's centre.
  function helmet(id) {
    const g = new THREE.Group();
    const dome = new THREE.Mesh(geos.dome, mats.steel), brim = new THREE.Mesh(geos.brim, mats.steel), band = new THREE.Mesh(geos.hband, id);
    dome.scale.set(1, 0.92, 1.1);
    brim.position.y = -0.035;
    brim.scale.set(1, 1, 1.12);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.012;
    band.scale.set(1, 1.1, 1);
    for (const m of [dome, brim, band]) m.castShadow = true;
    g.add(dome, brim, band);
    return g;
  }

  function soldier(color) {
    const id = idMat(color);
    const root = new THREE.Group();
    const mk = (geo, mat, parent = root) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; parent.add(m); return m; };
    const part = (mat, sx, sy, sz, parent, x = 0, y = 0, z = 0, geo = geos.box) => { const m = mk(geo, mat, parent); m.scale.set(sx, sy, sz); m.position.set(x, y, z); return m; };
    const b = {
      thighL: mk(geos.thigh, mats.trousers), thighR: mk(geos.thigh, mats.trousers), shinL: mk(geos.shin, mats.trousers), shinR: mk(geos.shin, mats.trousers),
      bootL: mk(geos.boot, mats.boot), bootR: mk(geos.boot, mats.boot), pelvis: mk(geos.pelvis, mats.coat), torso: mk(geos.torso, mats.coat), skirt: mk(geos.skirt, mats.coatDark),
      upperL: mk(geos.upper, mats.coat), upperR: mk(geos.upper, mats.coat), foreL: mk(geos.fore, mats.coat), foreR: mk(geos.fore, mats.coat),
      handL: mk(geos.hand, mats.leather), handR: mk(geos.hand, mats.leather), head: mk(geos.head, mats.skin), collar: mk(geos.collar, id),
      tail1: mk(geos.box, id), tail2: mk(geos.box, id), helmet: helmet(id), rifle: new THREE.Group(),
    };
    b.torso.scale.set(1.18, 1, 0.82);
    b.pelvis.scale.set(1.08, 0.8, 0.86);
    b.tail1.scale.set(0.085, 0.02, 0.36);
    b.tail2.scale.set(0.07, 0.02, 0.28);
    root.add(b.helmet, b.rifle);
    // Kit rides on the torso: belt, pouches, pack and bedroll, canteen.
    part(mats.leather, 0.215, 0.05, 0.215, b.torso, 0, -0.2, 0, geos.cyl);
    for (const s of [-1, 1]) part(mats.leather, 0.09, 0.1, 0.06, b.torso, s * 0.11, -0.19, -0.2);
    part(mats.canvas, 0.3, 0.34, 0.15, b.torso, 0, 0.02, 0.24);
    part(mats.canvas, 0.085, 0.4, 0.085, b.torso, 0, 0.23, 0.25, geos.cyl).rotation.z = Math.PI / 2;
    part(mats.steel, 0.06, 0.15, 0.06, b.torso, 0.2, -0.22, 0.12, geos.cyl);
    for (const s of [-1, 1]) part(mats.leather, 0.035, 0.5, 0.02, b.torso, s * 0.12, 0.02, -0.17).rotation.z = s * 0.12;
    // Armband in the identity colour, high on the left sleeve; cuff on the right.
    const arm = mk(geos.band, id, b.upperL);
    arm.rotation.x = Math.PI / 2;
    arm.position.y = 0.05;
    arm.scale.set(1.08, 1.08, 2.6);
    // The rifle: long, wooden, bolt-action, scope low over the receiver. Built along -Z from the butt.
    const r = b.rifle;
    part(mats.wood, 0.05, 0.12, 0.3, r, 0, -0.035, -0.15);
    part(mats.wood, 0.045, 0.065, 0.56, r, 0, -0.01, -0.56);
    part(mats.gun, 0.04, 0.05, 0.22, r, 0, 0.03, -0.42);
    part(mats.gun, 0.013, RIFLE_LEN - 0.5, 0.013, r, 0, 0.035, -(0.5 + (RIFLE_LEN - 0.5) / 2), geos.cyl).rotation.x = Math.PI / 2;
    part(mats.gun, 0.023, 0.27, 0.023, r, 0, 0.095, -0.44, geos.cyl).rotation.x = Math.PI / 2;
    part(mats.gun, 0.03, 0.05, 0.03, r, 0, 0.095, -0.56, geos.cyl).rotation.x = Math.PI / 2;
    for (const z of [-0.36, -0.5]) part(mats.gun, 0.012, 0.05, 0.012, r, 0, 0.065, z);
    const bolt = part(mats.gun, 0.014, 0.014, 0.07, r, 0.045, 0.04, -0.36);
    const knob = part(mats.gun, 0.02, 0.02, 0.02, r, 0.075, 0.03, -0.33, geos.hand);
    knob.scale.setScalar(0.42);
    part(mats.leather, 0.012, 0.012, 0.7, r, -0.03, -0.05, -0.5).rotation.x = 0.05; // sling

    // ---- pose scratch ----
    const J = {}; // joints
    for (const n of ['hips', 'neck', 'head', 'shL', 'shR', 'haL', 'haR', 'elL', 'elR', 'hipL', 'hipR', 'ftL', 'ftR', 'knL', 'knR', 'butt', 'dir', 'tmp', 'tmp2', 'pole']) J[n] = new THREE.Vector3();
    const Y = new THREE.Vector3(0, 1, 0), NZ = new THREE.Vector3(0, 0, -1), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), ax = new THREE.Vector3();
    const st = { phase: Math.random() * 6, aim: 0.6, t: Math.random() * 10, mv: 0, fall: null };
    const seg = (m, a, c) => { m.position.addVectors(a, c).multiplyScalar(0.5); J.tmp.subVectors(c, a).normalize(); m.quaternion.setFromUnitVectors(Y, J.tmp); };
    // Two-bone IK: joint between a and target, bent towards pole.
    function ik(a, target, l1, l2, pole, out) {
      J.tmp.subVectors(target, a);
      let d = J.tmp.length();
      const max = l1 + l2 - 0.005;
      if (d > max) { target.copy(a).addScaledVector(J.tmp, max / d); d = max; }
      d = Math.max(d, Math.abs(l1 - l2) + 0.01);
      J.tmp.normalize();
      const ca = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1), sa = Math.sqrt(1 - ca * ca);
      J.tmp2.copy(pole).addScaledVector(J.tmp, -pole.dot(J.tmp));
      if (J.tmp2.lengthSq() < 1e-6) J.tmp2.set(0, 0, -1);
      J.tmp2.normalize();
      out.copy(a).addScaledVector(J.tmp, l1 * ca).addScaledVector(J.tmp2, l1 * sa);
    }
    const fallen = (v, th, fxl, fzl) => { // rotate a joint about the feet, towards (fxl, fzl)
      const h = v.x * fxl + v.z * fzl, c = Math.cos(th), s = Math.sin(th), nh = h * c + v.y * s, ny = Math.max(0.07, -h * s + v.y * c);
      v.x += fxl * (nh - h); v.z += fzl * (nh - h); v.y = ny;
    };

    return {
      root, helmet: b.helmet, id,
      // s: { x y z yaw pitch k aim speed mvx mvz (world velocity) bolt (0..1 or -1) recoil dead (seconds, or -1) fx fz (fall direction, world) }
      update(dt, s) {
        root.position.set(s.x, s.y, s.z);
        root.rotation.y = s.yaw;
        st.t += dt;
        const sp = Math.min(1, s.speed / 5.6), k = s.k, kneel = clamp(1 - k * 1.5, 0, 1);
        st.mv += (sp - st.mv) * Math.min(1, dt * 10);
        const m = st.mv;
        st.phase += dt * (5.2 + 6.5 * sp) * (sp > 0.03 ? 1 : 0);
        st.aim += (s.aim - st.aim) * Math.min(1, dt * 10);
        const a = st.aim, ph = st.phase, dead = s.dead >= 0, breath = Math.sin(st.t * 1.6) * 0.006;
        // Velocity in the soldier's own frame: the stride follows where the feet are going.
        const cy = Math.cos(s.yaw), sy = Math.sin(s.yaw);
        let lx = s.mvx * cy - s.mvz * sy, lz = s.mvx * sy + s.mvz * cy;
        const ll = Math.hypot(lx, lz) || 1;
        lx /= ll; lz /= ll;
        const bob = Math.abs(Math.sin(ph)) * 0.045 * m;
        let hy = hipY(k) - bob + breath, lean = leanOf(k) + 0.16 * m * k - 0.04 * a;
        let buckle = 0, th = 0, fxl = 0, fzl = 1;
        if (dead) {
          // Knees go first, then the whole body tips over the feet along the bullet's path.
          const t = s.dead;
          buckle = clamp(t / 0.35, 0, 1);
          const u = clamp((t - 0.08) / 0.85, 0, 1);
          th = (Math.PI / 2 - 0.06) * (u * u) + (t > 0.93 ? Math.sin((t - 0.93) * 16) * 0.05 * Math.exp(-(t - 0.93) * 7) : 0);
          fxl = s.fx * cy - s.fz * sy; fzl = s.fx * sy + s.fz * cy;
          hy -= buckle * 0.22;
          lean = lean * (1 - buckle) - 0.1 * buckle;
        }
        J.hips.set(0, hy, lerp(0.08, 0, k));
        J.neck.set(0, hy + 0.5 * Math.cos(lean), J.hips.z - 0.5 * Math.sin(lean));
        J.head.set(0, J.neck.y + 0.16, J.neck.z - 0.03);
        const twist = a * 0.11;
        J.shL.set(-0.195 + twist * 0.4, J.neck.y - 0.05, J.neck.z - twist);
        J.shR.set(0.195, J.neck.y - 0.05, J.neck.z + twist * 0.7);
        // Rifle: shouldered along the line of sight when aiming, across the body when running.
        const p = clamp(s.pitch, -1.2, 1.2), kick = s.recoil;
        J.dir.set(-0.5 * (1 - a), Math.sin(p) * a + 0.3 * (1 - a) + kick * 0.05, -Math.cos(p) * a - 0.75 * (1 - a)).normalize();
        J.butt.set(lerp(0.2, J.shR.x - 0.05, a), lerp(hy + 0.22, J.shR.y - 0.01, a), lerp(-0.02, J.shR.z - 0.07 + kick * 0.05, a));
        const cyc = s.bolt >= 0 ? Math.sin(Math.PI * clamp(s.bolt * 1.15, 0, 1)) : 0, back = s.bolt >= 0 ? clamp(Math.sin(Math.PI * clamp((s.bolt - 0.2) / 0.6, 0, 1)), 0, 1) : 0;
        J.haR.copy(J.butt).addScaledVector(J.dir, 0.33 + cyc * 0.08 - back * 0.07);
        J.haR.y += -0.055 + cyc * 0.11;
        J.haR.x += cyc * 0.05;
        J.haL.copy(J.butt).addScaledVector(J.dir, 0.6);
        J.haL.y -= 0.045;
        if (dead) { // the rifle goes; the arms have nothing to hold
          J.haR.lerp(J.tmp.set(0.42, J.neck.y - 0.25 + buckle * 0.3, 0.12), buckle);
          J.haL.lerp(J.tmp.set(-0.45, J.neck.y - 0.2 + buckle * 0.35, 0.05), buckle);
        }
        ik(J.shR, J.haR, UPPER, FORE, J.pole.set(0.6, -0.75, 0.25), J.elR);
        ik(J.shL, J.haL, UPPER, FORE, J.pole.set(-0.35, -0.9, 0.15), J.elL);
        // Legs: stride when moving, one knee down when kneeling.
        J.hipL.set(-0.1, hy - 0.03, J.hips.z);
        J.hipR.set(0.1, hy - 0.03, J.hips.z);
        const stride = (0.4 * k + 0.16) * m, lift = (0.15 * k + 0.05) * m, c1 = Math.cos(ph), s1 = Math.sin(ph);
        J.ftL.set(lerp(-0.13, -0.15, kneel) + lx * stride * c1, 0.07 + Math.max(0, s1) * lift + kneel * 0.03, lerp(0.03, 0.44, kneel) + lz * stride * c1);
        J.ftR.set(lerp(0.13, 0.15, kneel) - lx * stride * c1, 0.07 + Math.max(0, -s1) * lift, lerp(-0.05, -0.2, kneel) - lz * stride * c1);
        ik(J.hipL, J.ftL, THIGH, SHIN, J.pole.set(-0.1, -0.55 * kneel, -1), J.knL);
        ik(J.hipR, J.ftR, THIGH, SHIN, J.pole.set(0.12, 0.45 * kneel, -1), J.knR);
        if (dead && th > 0) for (const n of ['hips', 'neck', 'head', 'shL', 'shR', 'haL', 'haR', 'elL', 'elR', 'hipL', 'hipR', 'knL', 'knR', 'ftL', 'ftR']) fallen(J[n], th * (n === 'ftL' || n === 'ftR' ? 0.5 : 1), fxl, fzl);

        seg(b.thighL, J.hipL, J.knL); seg(b.shinL, J.knL, J.ftL);
        seg(b.thighR, J.hipR, J.knR); seg(b.shinR, J.knR, J.ftR);
        b.bootL.position.set(J.ftL.x, J.ftL.y - 0.02, J.ftL.z - 0.07);
        b.bootR.position.set(J.ftR.x, J.ftR.y - 0.02, J.ftR.z - 0.07);
        b.bootL.rotation.x = kneel * 0.9 + th;
        b.bootR.rotation.x = th;
        seg(b.torso, J.hips, J.neck);
        b.pelvis.position.copy(J.hips);
        // The coat hangs from the hips, drags behind a run, bunches on the ground when kneeling.
        J.tmp2.set(0, -1, 0.1 + 0.32 * m + 0.25 * kneel).normalize();
        if (dead) fallen(J.tmp2.multiplyScalar(-1), th, fxl, fzl), J.tmp2.multiplyScalar(-1).normalize();
        const sl = lerp(0.34, 0.62, k) / 0.62;
        b.skirt.scale.set(1 + 0.12 * kneel, sl, 1 + 0.25 * kneel);
        b.skirt.position.copy(J.hips).addScaledVector(J.tmp2, 0.31 * sl - 0.02);
        b.skirt.quaternion.setFromUnitVectors(Y, J.tmp.copy(J.tmp2).multiplyScalar(-1));
        seg(b.upperL, J.shL, J.elL); seg(b.foreL, J.elL, J.haL);
        seg(b.upperR, J.shR, J.elR); seg(b.foreR, J.elR, J.haR);
        b.handL.position.copy(J.haL);
        b.handR.position.copy(J.haR);
        b.head.position.copy(J.head);
        b.collar.position.set(J.neck.x, J.neck.y + 0.03, J.neck.z);
        b.collar.rotation.set(Math.PI / 2 - lean - th * fzl, 0, 0);
        b.helmet.position.set(J.head.x, J.head.y + 0.045, J.head.z);
        b.helmet.rotation.set(-0.12 - th * fzl, 0, th * fxl);
        // Scarf ends: down the back at rest, streaming when there is speed.
        const fl = Math.sin(st.t * 9) * (0.1 + 0.3 * m), up = 0.25 + 1.0 * m;
        b.tail1.position.set(J.neck.x + 0.05, J.neck.y - 0.02 - 0.15 * Math.cos(up), J.neck.z + 0.1 + 0.15 * Math.sin(up));
        b.tail1.rotation.set(Math.PI / 2 - up, fl, 0);
        b.tail2.position.set(J.neck.x - 0.04, J.neck.y - 0.03 - 0.12 * Math.cos(up * 0.8), J.neck.z + 0.1 + 0.12 * Math.sin(up * 0.8));
        b.tail2.rotation.set(Math.PI / 2 - up * 0.8, -fl * 1.3, 0);
        b.tail1.visible = b.tail2.visible = !dead || s.dead < 0.3;
        // Rifle and bolt.
        if (dead) {
          const t = s.dead, u = Math.min(1, t / 0.7);
          r.position.set(lerp(J.butt.x, 0.55, u), Math.max(0.05, J.butt.y - 2.2 * t * t), lerp(J.butt.z, -0.2, u));
          r.rotation.set(-u * 0.2, 0.6 * u, 1.45 * u);
        } else {
          r.position.copy(J.butt);
          r.quaternion.setFromUnitVectors(NZ, J.dir);
          if (cyc > 0) r.quaternion.multiply(q.setFromAxisAngle(ax.set(0, 0, 1), -0.3 * cyc));
        }
        bolt.position.z = -0.36 + back * 0.08;
        bolt.rotation.z = cyc * 1.0;
        knob.position.set(0.075 - cyc * 0.02, 0.03 + cyc * 0.04, -0.33 + back * 0.08);
      },
      // World position of the muzzle and of the scope's front lens (for flash and glint).
      muzzle(out, lens) {
        root.updateMatrixWorld();
        r.updateMatrixWorld();
        out.set(0, 0.035, -RIFLE_LEN).applyMatrix4(r.matrixWorld);
        if (lens) lens.set(0, 0.095, -0.58).applyMatrix4(r.matrixWorld);
        return out;
      },
      headWorld(out) { return out.copy(b.head.position).applyMatrix4(root.matrixWorld); },
    };
  }

  return {
    soldier, helmet, idMat, mats, geos,
    dispose() {
      for (const g of Object.values(geos)) g.dispose();
      for (const m of Object.values(mats)) m.dispose();
    },
  };
}
