import * as THREE from 'three';
import { withHaze } from './atmosphere.js';

// Stance: 0 stand, 1 crouch (kneeling), 2 prone.
// Local space: feet at origin, facing -Z.
const CAPS = [
  {
    head: [[0, 1.6, -0.02], [0, 1.6, -0.02], 0.15],
    torso: [[0, 0.98, 0], [0, 1.4, 0], 0.24],
    legs: [[0, 0.12, 0], [0, 0.9, 0], 0.19],
  },
  {
    head: [[0, 1.12, -0.18], [0, 1.12, -0.18], 0.15],
    torso: [[0, 0.62, 0.05], [0, 0.98, -0.1], 0.25],
    legs: [[0, 0.12, -0.35], [0, 0.55, 0.05], 0.2],
  },
  {
    head: [[0, 0.3, -0.82], [0, 0.3, -0.82], 0.15],
    torso: [[0, 0.22, -0.6], [0, 0.22, 0.05], 0.23],
    legs: [[0, 0.16, 0.1], [0, 0.14, 1.0], 0.17],
  },
];

export const AIM_POS = [
  [0.0, 1.42, -0.08],
  [0.0, 0.98, -0.2],
  [0.0, 0.28, -0.72],
];

export function worldCapsules(pos, yaw, stance, out = []) {
  const c = CAPS[stance] || CAPS[0];
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const tf = (l) => new THREE.Vector3(pos.x + l[0] * cs + l[2] * sn, pos.y + l[1], pos.z - l[0] * sn + l[2] * cs);
  out.length = 0;
  for (const part of ['head', 'torso', 'legs']) {
    const [a, b, r] = c[part];
    out.push({ part, a: tf(a), b: tf(b), r });
  }
  return out;
}

// World position of the scope's objective lens (for glint).
export function scopePoint(pos, yaw, pitch, stance, out = new THREE.Vector3()) {
  const a = AIM_POS[stance] || AIM_POS[0];
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const fx = -sn * Math.cos(pitch), fy = Math.sin(pitch), fz = -cs * Math.cos(pitch);
  return out.set(pos.x + a[2] * sn + fx * 0.35, pos.y + a[1] + 0.1 + fy * 0.35, pos.z + a[2] * cs + fz * 0.35);
}

// ---------------------------------------------------------------------------
// Materials & geometry helpers
// ---------------------------------------------------------------------------
const PAL = {
  fatigue: '#4b4e3a',
  fatigueDark: '#3e4131',
  vest: '#57553f',
  pouch: '#4a4936',
  glove: '#2e2c27',
  boot: '#2a2623',
  face: '#5a4c40',
  paint: '#363b2b',
  hat: '#5b5b40',
  steel: '#25262a',
  furniture: '#4c4a3a',
  lens: '#1a1f2e',
};
const GHILLIE = ['#4c5434', '#57603a', '#3c452e', '#646044', '#474530', '#5b6640', '#41492f'];

const matCache = new Map();
function mat(hex, flat = false) {
  const key = hex + flat;
  if (!matCache.has(key)) {
    matCache.set(key, withHaze(new THREE.MeshLambertMaterial({ color: hex, flatShading: flat }), { key: flat ? 'avatarF' : 'avatar' }));
  }
  return matCache.get(key);
}
let ghillieMat = null;
function ghillieMaterial() {
  return (ghillieMat ||= withHaze(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }), { key: 'ghillie' }));
}

function mesh(geo, hex, flat = false) {
  const m = new THREE.Mesh(geo, mat(hex, flat));
  m.castShadow = true;
  return m;
}

// Capsule spanning two points (in the parent's space), optionally tapered.
const UP = new THREE.Vector3(0, 1, 0);
function limb(a, b, r, hex, r2 = r) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = Math.max(A.distanceTo(B), 0.001);
  const geo = r2 === r ? new THREE.CapsuleGeometry(r, len, 4, 10) : taper(r, r2, len);
  const m = mesh(geo, hex);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, B.clone().sub(A).normalize());
  return m;
}

// Tapered capsule: r1 at the start (bottom, -Y), r2 at the end (+Y).
function taper(r1, r2, len) {
  const g = new THREE.CylinderGeometry(r2, r1, len, 10, 1, true);
  const top = new THREE.SphereGeometry(r2, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, len / 2, 0);
  const bot = new THREE.SphereGeometry(r1, 10, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(0, -len / 2, 0);
  return merge([g, top, bot]);
}

function merge(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
  const hasCol = parts.every((g) => g.attributes.color);
  const col = hasCol ? new Float32Array(total * 3) : null;
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (col) col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

// A clump of jute strands hanging from an anchor box. area = [cx,cy,cz, sx,sy,sz].
function strands(rng, count, area, lenRange, droop) {
  const geos = [];
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const len = lenRange[0] + rng() * (lenRange[1] - lenRange[0]);
    const g = new THREE.ConeGeometry(0.012 + rng() * 0.016, len, 3, 1).toNonIndexed();
    g.rotateX(Math.PI); // point down
    g.translate(0, -len / 2, 0); // hang from the root
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(area[0] + (rng() - 0.5) * area[3], area[1] + (rng() - 0.5) * area[4], area[2] + (rng() - 0.5) * area[5]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(droop[0] + (rng() - 0.5) * 0.45, 0, droop[1] + (rng() - 0.5) * 0.45, 'YXZ')),
      new THREE.Vector3(1, 1, 1),
    );
    g.applyMatrix4(m);
    c.set(GHILLIE[Math.floor(rng() * GHILLIE.length)]).multiplyScalar(0.85 + rng() * 0.3);
    const n = g.attributes.position.count;
    const cols = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) { cols[k * 3] = c.r; cols[k * 3 + 1] = c.g; cols[k * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geos.push(g);
  }
  return merge(geos);
}

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildRifle() {
  const r = new THREE.Group();
  const P = PAL;
  const stock = mesh(new THREE.BoxGeometry(0.05, 0.11, 0.3), P.furniture);
  stock.position.set(0, -0.03, 0.06);
  r.add(stock);
  const riser = mesh(new THREE.CapsuleGeometry(0.022, 0.14, 3, 8).rotateX(Math.PI / 2), P.furniture);
  riser.position.set(0, 0.035, 0.06);
  r.add(riser);
  const butt = mesh(new THREE.BoxGeometry(0.055, 0.13, 0.025), P.glove);
  butt.position.set(0, -0.035, 0.22);
  r.add(butt);
  const grip = mesh(new THREE.CapsuleGeometry(0.018, 0.07, 3, 8), P.steel);
  grip.position.set(0, -0.08, -0.06);
  grip.rotation.x = 0.35;
  r.add(grip);
  const recv = mesh(new THREE.BoxGeometry(0.05, 0.065, 0.28), P.steel);
  recv.position.set(0, 0, -0.18);
  r.add(recv);
  const guard = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.36, 8).rotateX(Math.PI / 2), P.furniture);
  guard.position.set(0, -0.005, -0.48);
  r.add(guard);
  const mag = mesh(new THREE.BoxGeometry(0.035, 0.08, 0.07), P.steel);
  mag.position.set(0, -0.065, -0.2);
  r.add(mag);
  const barrel = mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.42, 8).rotateX(Math.PI / 2), P.steel);
  barrel.position.set(0, 0, -0.86);
  r.add(barrel);
  const brake = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.07, 8).rotateX(Math.PI / 2), P.steel);
  brake.position.set(0, 0, -1.09);
  r.add(brake);
  const tube = mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.24, 12).rotateX(Math.PI / 2), P.steel);
  tube.position.set(0, 0.075, -0.2);
  r.add(tube);
  const obj = mesh(new THREE.CylinderGeometry(0.03, 0.019, 0.1, 12).rotateX(Math.PI / 2), P.steel);
  obj.position.set(0, 0.075, -0.35);
  r.add(obj);
  const eye = mesh(new THREE.CylinderGeometry(0.019, 0.025, 0.07, 12).rotateX(Math.PI / 2), P.steel);
  eye.position.set(0, 0.075, -0.05);
  r.add(eye);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.027, 14), new THREE.MeshBasicMaterial({ color: P.lens }));
  lens.position.set(0, 0.075, -0.401);
  lens.rotation.y = Math.PI;
  r.add(lens);
  const turret = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 8), P.steel);
  turret.position.set(0, 0.105, -0.2);
  r.add(turret);
  const turret2 = turret.clone();
  turret2.rotation.z = Math.PI / 2;
  turret2.position.set(0.03, 0.075, -0.2);
  r.add(turret2);
  for (const z of [-0.12, -0.27]) {
    const ring = mesh(new THREE.BoxGeometry(0.03, 0.05, 0.02), P.steel);
    ring.position.set(0, 0.045, z);
    r.add(ring);
  }
  const bipod = new THREE.Group();
  for (const s of [-1, 1]) {
    const leg = mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.22, 6), P.steel);
    leg.position.set(s * 0.025, -0.11, 0);
    leg.rotation.z = s * 0.18;
    bipod.add(leg);
  }
  bipod.position.set(0, -0.02, -0.62);
  r.add(bipod);
  r.userData.bipod = bipod;
  return r;
}

export class Avatar {
  constructor(accent = '#d89a3a', seed = 7) {
    const rng = seeded(seed);
    const P = PAL;
    this.root = new THREE.Group();
    this.root.rotation.order = 'YXZ';
    this.body = new THREE.Group();
    this.root.add(this.body);

    // --- Hips & legs (hip joint -> knee joint) ---
    this.hips = new THREE.Group();
    this.body.add(this.hips);
    const pelvis = limb([-0.09, 0.03, 0], [0.09, 0.03, 0], 0.105, P.fatigue);
    pelvis.scale.set(0.9, 1, 1);
    this.hips.add(pelvis);
    const belt = mesh(new THREE.CylinderGeometry(0.165, 0.17, 0.06, 16).scale(1.05, 1, 0.78), P.vest);
    belt.position.set(0, 0.1, 0);
    this.hips.add(belt);
    const mkLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.1, 0, 0);
      hip.add(limb([0, -0.4, 0.01], [0, -0.02, 0], 0.072, P.fatigue, 0.088));
      const pocket = mesh(new THREE.BoxGeometry(0.05, 0.12, 0.1), P.fatigueDark);
      pocket.position.set(side * 0.08, -0.22, 0);
      hip.add(pocket);
      const knee = new THREE.Group();
      knee.position.set(0, -0.42, 0.01);
      const pad = mesh(new THREE.SphereGeometry(0.045, 10, 6).scale(1, 1.2, 0.55), P.vest);
      pad.position.set(0, 0, -0.055);
      knee.add(pad);
      knee.add(limb([0, -0.36, 0.02], [0, 0, 0], 0.055, P.fatigue, 0.068));
      const ankle = mesh(new THREE.CylinderGeometry(0.06, 0.065, 0.1, 10), P.boot);
      ankle.position.set(0, -0.36, 0.01);
      knee.add(ankle);
      const boot = mesh(new THREE.CapsuleGeometry(0.055, 0.13, 3, 8).rotateX(Math.PI / 2).scale(1, 0.8, 1), P.boot);
      boot.position.set(0, -0.43, -0.04);
      knee.add(boot);
      hip.add(knee);
      hip.userData.knee = knee;
      return hip;
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);
    this.hips.add(this.legL, this.legR);

    // --- Spine: torso, plate carrier, pack, ghillie ---
    this.spine = new THREE.Group();
    this.hips.add(this.spine);
    const chest = mesh(new THREE.CapsuleGeometry(0.17, 0.3, 4, 12).scale(1.12, 1, 0.72), P.fatigue);
    chest.position.set(0, 0.3, 0);
    this.spine.add(chest);
    const carrier = mesh(new THREE.CapsuleGeometry(0.175, 0.2, 4, 12).scale(1.1, 1, 0.8), P.vest);
    carrier.position.set(0, 0.33, -0.005);
    this.spine.add(carrier);
    for (let i = -1; i <= 1; i++) {
      const p = mesh(new THREE.BoxGeometry(0.075, 0.1, 0.05), P.pouch);
      p.position.set(i * 0.085, 0.22, -0.145);
      this.spine.add(p);
    }
    const radio = mesh(new THREE.BoxGeometry(0.06, 0.13, 0.04), P.pouch);
    radio.position.set(-0.17, 0.4, 0.06);
    this.spine.add(radio);
    const antenna = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.35, 4), P.glove);
    antenna.position.set(-0.17, 0.62, 0.08);
    antenna.rotation.z = 0.15;
    this.spine.add(antenna);
    const pack = mesh(new THREE.CapsuleGeometry(0.12, 0.16, 4, 10).scale(1.1, 1, 0.65), P.vest);
    pack.position.set(0, 0.32, 0.17);
    this.spine.add(pack);
    for (const s of [-1, 1]) {
      const sh = mesh(new THREE.SphereGeometry(0.078, 10, 8), P.fatigue);
      sh.position.set(s * 0.2, 0.47, 0.01);
      this.spine.add(sh);
    }
    const drape = new THREE.Mesh(
      merge([
        strands(rng, 110, [0, 0.56, 0.1, 0.44, 0.04, 0.2], [0.18, 0.4], [0.18, 0]),
        strands(rng, 70, [0, 0.4, 0.24, 0.34, 0.28, 0.04], [0.16, 0.34], [0.12, 0]),
        strands(rng, 40, [-0.22, 0.5, 0.0, 0.05, 0.05, 0.16], [0.12, 0.26], [0, 0.25]),
        strands(rng, 40, [0.22, 0.5, 0.0, 0.05, 0.05, 0.16], [0.12, 0.26], [0, -0.25]),
      ]),
      ghillieMaterial(),
    );
    drape.castShadow = true;
    this.spine.add(drape);

    // --- Head: painted face, boonie hat, ghillie veil ---
    this.neck = new THREE.Group();
    this.neck.position.set(0, 0.58, -0.01);
    this.spine.add(this.neck);
    this.neck.add(limb([0, 0, 0], [0, 0.07, -0.01], 0.055, P.face));
    const head = new THREE.Group();
    head.position.set(0, 0.15, -0.02);
    head.add(mesh(new THREE.SphereGeometry(0.105, 14, 10).scale(0.92, 1.08, 1), P.face));
    // Camo paint band across the eyes.
    const paint = mesh(new THREE.SphereGeometry(0.107, 14, 10, Math.PI * 0.6, Math.PI * 0.8, Math.PI * 0.36, Math.PI * 0.26).scale(0.92, 1.08, 1), P.paint);
    head.add(paint);
    const nose = mesh(new THREE.ConeGeometry(0.018, 0.04, 5).rotateX(-Math.PI / 2), P.face);
    nose.position.set(0, -0.005, -0.1);
    head.add(nose);
    const brim = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.012, 16), P.hat);
    brim.position.set(0, 0.06, 0);
    head.add(brim);
    const crown = mesh(new THREE.CylinderGeometry(0.095, 0.108, 0.1, 14), P.hat);
    crown.position.set(0, 0.11, 0);
    head.add(crown);
    head.add(new THREE.Mesh(strands(rng, 60, [0, 0.07, 0.05, 0.32, 0.02, 0.26], [0.1, 0.22], [0.12, 0]), ghillieMaterial()));
    this.head = head;
    this.neck.add(head);

    // --- Aim group: rifle and arms (pitches with aim) ---
    this.aim = new THREE.Group();
    const rifle = buildRifle();
    rifle.position.set(0.06, 0.1, 0.06);
    this.rifle = rifle;
    this.aim.add(rifle);
    const arm = (sh, el, ha, side) => {
      this.aim.add(limb(el, sh, 0.052, P.fatigue, 0.062));
      this.aim.add(limb(ha, el, 0.04, P.fatigue, 0.05));
      const glove = mesh(new THREE.SphereGeometry(0.045, 8, 6).scale(1, 0.8, 1.3), P.glove);
      glove.position.set(...ha);
      this.aim.add(glove);
      if (side < 0) {
        const lerpP = (k) => sh.map((v, i) => v + (el[i] - v) * k);
        this.aim.add(limb(lerpP(0.3), lerpP(0.5), 0.066, accent));
      }
    };
    arm([0.19, -0.03, 0.12], [0.27, -0.12, -0.02], [0.07, 0.02, 0.0], 1);
    arm([-0.19, -0.03, 0.12], [-0.17, -0.14, -0.22], [0.05, 0.05, -0.36], -1);
    this.root.add(this.aim);

    this.walkPhase = 0;
  }

  setVisible(v) {
    this.root.visible = v;
  }

  update(dt, s) {
    // s: { p, yaw, pitch, st, moving }
    this.root.position.copy(s.p);
    this.root.rotation.y = s.yaw;
    const st = s.st | 0;
    if (s.moving) this.walkPhase += dt * (st === 2 ? 3 : st === 1 ? 5 : 8);
    const sw = s.moving ? Math.sin(this.walkPhase) : 0;
    const ap = AIM_POS[st];
    this.aim.position.set(ap[0], ap[1], ap[2]);
    this.aim.rotation.x = s.pitch;
    const kL = this.legL.userData.knee, kR = this.legR.userData.knee;
    this.rifle.userData.bipod.rotation.x = st === 2 ? 0.15 : 1.45;
    this.legL.rotation.z = this.legR.rotation.z = 0;
    if (st === 0) {
      this.body.rotation.x = 0;
      this.body.position.set(0, 0, 0);
      this.hips.position.set(0, 0.92, 0.02);
      this.legL.rotation.x = sw * 0.5;
      this.legR.rotation.x = -sw * 0.5;
      kL.rotation.x = -Math.max(0, sw) * 0.7;
      kR.rotation.x = -Math.max(0, -sw) * 0.7;
      this.spine.rotation.x = -0.12;
      this.neck.rotation.x = 0.12 + s.pitch * 0.5;
    } else if (st === 1) {
      // Kneeling: left foot planted forward, right knee on the ground.
      this.body.rotation.x = 0;
      this.body.position.set(0, 0, 0);
      this.hips.position.set(0, 0.52, 0.06);
      this.legL.rotation.x = 1.35 + sw * 0.15;
      kL.rotation.x = -1.4;
      this.legR.rotation.x = -0.15 - sw * 0.15;
      kR.rotation.x = -1.45;
      this.spine.rotation.x = -0.28;
      this.neck.rotation.x = 0.3 + s.pitch * 0.5;
    } else {
      // Prone: body flat, legs spread, head raised to the scope.
      this.body.rotation.x = -Math.PI / 2;
      this.body.position.set(0, 0.17, 0.05);
      this.hips.position.set(0, 0, 0);
      this.legL.rotation.x = sw * 0.12;
      this.legR.rotation.x = -sw * 0.12;
      this.legL.rotation.z = -0.18;
      this.legR.rotation.z = 0.18;
      kL.rotation.x = kR.rotation.x = -0.08;
      this.spine.rotation.x = 0;
      this.neck.rotation.x = 1.25 + s.pitch * 0.4;
    }
  }
}
