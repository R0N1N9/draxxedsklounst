import * as THREE from 'three';
import { withHaze } from './atmosphere.js';

// Stance: 0 stand, 1 crouch, 2 prone.
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

const AIM_POS = [
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

// World position of the scope lens (for glint) and muzzle.
export function scopePoint(pos, yaw, pitch, stance, out = new THREE.Vector3()) {
  const a = AIM_POS[stance] || AIM_POS[0];
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const fx = -sn * Math.cos(pitch), fy = Math.sin(pitch), fz = -cs * Math.cos(pitch);
  return out.set(pos.x + a[2] * sn + fx * 0.35, pos.y + a[1] + 0.1 + fy * 0.35, pos.z + a[2] * cs + fz * 0.35);
}

const matCache = new Map();
function colored(hex) {
  if (!matCache.has(hex)) matCache.set(hex, withHaze(new THREE.MeshLambertMaterial({ color: hex, flatShading: true }), { key: 'avatar' }));
  return matCache.get(hex);
}

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), colored(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export class Avatar {
  constructor(accent = '#d89a3a') {
    this.root = new THREE.Group();
    this.root.rotation.order = 'YXZ';
    this.body = new THREE.Group();
    this.root.add(this.body);
    const ghillie = '#4e5236', ghillie2 = '#5d5a3a', pants = '#3d3b2d', dark = '#2a2822';

    this.hips = new THREE.Group();
    this.body.add(this.hips);
    this.legL = new THREE.Group();
    this.legR = new THREE.Group();
    this.legL.add(box(0.18, 0.88, 0.22, pants, 0, -0.44, 0));
    this.legR.add(box(0.18, 0.88, 0.22, pants, 0, -0.44, 0));
    this.legL.add(box(0.2, 0.14, 0.3, dark, 0, -0.85, -0.05));
    this.legR.add(box(0.2, 0.14, 0.3, dark, 0, -0.85, -0.05));
    this.legL.position.set(-0.12, 0, 0);
    this.legR.position.set(0.12, 0, 0);
    this.hips.add(this.legL, this.legR);

    this.torso = new THREE.Group();
    this.torso.add(box(0.46, 0.62, 0.28, ghillie, 0, 0.31, 0));
    // Ghillie tufts on shoulders/back break the silhouette.
    for (let i = 0; i < 7; i++) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.09 + Math.random() * 0.05, 0.35, 4), colored(i % 2 ? ghillie : ghillie2));
      t.position.set((Math.random() - 0.5) * 0.5, 0.45 + Math.random() * 0.25, 0.1 + Math.random() * 0.08);
      t.rotation.set(0.6 + Math.random() * 0.6, Math.random() * 3, (Math.random() - 0.5) * 1.2);
      this.torso.add(t);
    }
    this.torso.add(box(0.48, 0.07, 0.3, accent, 0, 0.04, 0)); // belt accent (team colour)
    this.hips.add(this.torso);

    this.head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), colored('#3b382f'));
    this.head.add(skull);
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.28, 5), colored(ghillie2));
    hood.position.set(0, 0.07, 0.03);
    this.head.add(hood);
    this.root.add(this.head);

    // Rifle + arms rotate with pitch.
    this.aim = new THREE.Group();
    const rifle = new THREE.Group();
    rifle.add(box(0.07, 0.1, 1.15, '#2b2a2e', 0.0, 0, -0.45));
    rifle.add(box(0.08, 0.16, 0.42, '#5a4a3c', 0.0, -0.05, 0.05)); // stock
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.38, 6).rotateX(Math.PI / 2), colored('#1d1c20'));
    scope.position.set(0, 0.09, -0.3);
    rifle.add(scope);
    rifle.position.set(0.12, -0.05, 0);
    this.aim.add(rifle);
    const armL = box(0.12, 0.12, 0.55, ghillie, -0.12, -0.08, -0.32);
    armL.rotation.y = -0.3;
    const armR = box(0.12, 0.12, 0.4, ghillie, 0.2, -0.1, -0.05);
    this.aim.add(armL, armR);
    this.root.add(this.aim);

    this.walkPhase = 0;
    this.stanceBlend = 0;
  }

  setVisible(v) {
    this.root.visible = v;
  }

  update(dt, s) {
    // s: { p, yaw, pitch, st, moving }
    this.root.position.copy(s.p);
    this.root.rotation.y = s.yaw;
    const st = s.st | 0;
    if (s.moving) this.walkPhase += dt * (st === 2 ? 3 : st === 1 ? 6 : 8.5);
    const swing = s.moving ? Math.sin(this.walkPhase) : 0;
    const ap = AIM_POS[st];
    this.aim.position.set(ap[0], ap[1], ap[2]);
    this.aim.rotation.x = s.pitch;
    if (st === 0) {
      this.body.rotation.x = 0;
      this.body.position.set(0, 0, 0);
      this.hips.position.set(0, 0.92, 0);
      this.legL.rotation.x = swing * 0.55;
      this.legR.rotation.x = -swing * 0.55;
      this.torso.rotation.x = -0.05;
      this.head.position.set(0, 1.6, -0.02);
    } else if (st === 1) {
      this.body.rotation.x = 0;
      this.body.position.set(0, 0, 0);
      this.hips.position.set(0, 0.55, 0.05);
      this.legL.rotation.x = -1.05 + swing * 0.2;
      this.legR.rotation.x = -0.6 - swing * 0.2;
      this.torso.rotation.x = -0.25;
      this.head.position.set(0, 1.12, -0.18);
    } else {
      this.body.rotation.x = -Math.PI / 2;
      this.body.position.set(0, 0.2, 0.0);
      this.hips.position.set(0, 0, 0);
      this.legL.rotation.x = swing * 0.15;
      this.legR.rotation.x = -swing * 0.15;
      this.torso.rotation.x = 0;
      this.head.position.set(0, 0.3, -0.82);
    }
    this.head.rotation.x = s.pitch * 0.5;
  }
}
