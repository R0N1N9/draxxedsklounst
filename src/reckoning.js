// Death by chicken (Pollo Hermano): you don't simply die. The ground splits, a kraken rises
// and swallows the town, then a vast AI overlord reaches down out of the sky and flicks you
// off the map. Plays on both screens in place of the killcam (same interface as Replay).
import * as THREE from 'three';
import { TOWN_Y } from './terrain.js';

const DUR = 9.0;
const TOWN = new THREE.Vector3(0, TOWN_Y, 0);
const ease = (t) => t * t * (3 - 2 * t);
const seg = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));

function basic(hex, extra = {}) {
  return new THREE.MeshLambertMaterial({ color: hex, ...extra });
}

// ---- Kraken: tentacles of instanced blobs plus a maw that closes over the town ----------
function buildKraken() {
  const g = new THREE.Group();
  const T = 10, N = 34;
  const blob = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), basic('#ffffff', { emissive: '#2a0a24', emissiveIntensity: 0.6 }), T * N);
  blob.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const c = new THREE.Color();
  for (let i = 0; i < T * N; i++) {
    const s = (i % N) / (N - 1);
    blob.setColorAt(i, c.set('#3a1240').lerp(new THREE.Color('#b8344a'), s * 0.8));
  }
  blob.frustumCulled = false;
  g.add(blob);
  const suck = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 5), basic('#f0c0b0'), T * N);
  suck.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  suck.frustumCulled = false;
  g.add(suck);
  const tents = [];
  for (let i = 0; i < T; i++) {
    const a = (i / T) * Math.PI * 2 + 0.2;
    const r = 120 + (i % 3) * 25;
    tents.push({ base: new THREE.Vector3(Math.cos(a) * r * 1.2, TOWN_Y - 4, Math.sin(a) * r * 0.85), h: 110 + (i % 4) * 25, ph: i * 1.7, delay: (i % 5) * 0.18 });
  }
  // Maw: a lower bowl that rises around the town and an upper jaw that closes over it.
  const maw = new THREE.Group();
  const flesh = basic('#5a1428', { side: THREE.DoubleSide, emissive: '#30040e', emissiveIntensity: 0.7 });
  const R = 175;
  const lower = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), flesh);
  const upper = new THREE.Group();
  const upperShell = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), basic('#3a1240', { side: THREE.DoubleSide, emissive: '#1a0614', emissiveIntensity: 0.5 }));
  upper.add(upperShell);
  const tooth = new THREE.ConeGeometry(7, 30, 6);
  const boneM = basic('#efe6cf', { emissive: '#3a3020', emissiveIntensity: 0.4 });
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * Math.PI * 2;
    const lt = new THREE.Mesh(tooth, boneM);
    lt.position.set(Math.cos(a) * R * 0.97, 12, Math.sin(a) * R * 0.97);
    lower.add(lt);
    const ut = new THREE.Mesh(tooth, boneM);
    ut.rotation.x = Math.PI;
    ut.position.set(Math.cos(a + 0.08) * R * 0.97, -12, Math.sin(a + 0.08) * R * 0.97);
    upper.add(ut);
  }
  const eyeM = new THREE.MeshBasicMaterial({ color: '#ffd23a' });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(18, 14, 10), eyeM);
    eye.position.set(s * 60, R * 0.72, -R * 0.6);
    upper.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(8, 10, 8), new THREE.MeshBasicMaterial({ color: '#120808' }));
    pupil.position.set(s * 60, R * 0.72, -R * 0.6 - 15);
    pupil.scale.set(0.35, 1, 0.5);
    upper.add(pupil);
  }
  maw.add(lower, upper);
  g.add(maw);
  g.userData = { blob, suck, tents, N, maw, upper, lower };
  return g;
}

// ---- Overlord: a vast eye in the sky and a mechanical hand on a long arm -----------------
function buildOverlord() {
  const g = new THREE.Group();
  const metal = basic('#2a2d38', { emissive: '#0c1020', emissiveIntensity: 0.6 });
  const glow = new THREE.MeshBasicMaterial({ color: '#59f0ff' });
  const red = new THREE.MeshBasicMaterial({ color: '#ff3048' });
  // Sky eye.
  const eye = new THREE.Group();
  eye.add(new THREE.Mesh(new THREE.TorusGeometry(160, 14, 10, 48), glow));
  eye.add(new THREE.Mesh(new THREE.TorusGeometry(110, 6, 8, 48), glow));
  eye.add(new THREE.Mesh(new THREE.CircleGeometry(70, 32), red));
  eye.add(new THREE.Mesh(new THREE.CircleGeometry(150, 40), basic('#0a0b12', { side: THREE.DoubleSide })));
  eye.children[3].position.z = -2;
  g.add(eye);
  // Arm + hand (built pointing down -Y from the shoulder at the group origin).
  const arm = new THREE.Group();
  const segs = 8;
  for (let i = 0; i < segs; i++) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(9 - i * 0.6, 10 - i * 0.6, 70, 10), metal);
    s.position.y = -35 - i * 72;
    arm.add(s);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(10.5 - i * 0.6, 1.2, 6, 16), glow);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -70 - i * 72;
    arm.add(ring);
  }
  const hand = new THREE.Group();
  hand.position.y = -segs * 72 - 8;
  const palm = new THREE.Mesh(new THREE.BoxGeometry(22, 8, 26), metal);
  hand.add(palm);
  const seam = new THREE.Mesh(new THREE.BoxGeometry(23, 1, 1), glow);
  seam.position.y = -4.2;
  hand.add(seam);
  const fingers = [];
  for (let f = 0; f < 4; f++) {
    const fg = new THREE.Group();
    fg.position.set(-8.5 + f * 5.7, 0, -13);
    let parent = fg;
    for (let k = 0; k < 3; k++) {
      const j = new THREE.Group();
      j.position.z = k ? -7.5 : 0;
      const bone = new THREE.Mesh(new THREE.CapsuleGeometry(2.2, 5, 4, 8).rotateX(Math.PI / 2), metal);
      bone.position.z = -3.5;
      j.add(bone);
      parent.add(j);
      parent = j;
    }
    hand.add(fg);
    fingers.push(fg);
  }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(2.6, 9, 4, 8), metal);
  thumb.position.set(13, 0, -6);
  thumb.rotation.z = -0.9;
  hand.add(thumb);
  arm.add(hand);
  g.add(arm);
  g.userData = { eye, arm, hand, fingers };
  return g;
}

export class Reckoning {
  constructor(game) {
    this.g = game;
    this.active = false;
    this.scopeView = false;
  }

  // opts: { victimPos, victimLook, ghost (Avatar), onDone }
  start(opts) {
    const g = this.g;
    this.o = opts;
    this.t = 0;
    this.active = true;
    this.kraken = buildKraken();
    this.overlord = buildOverlord();
    this.overlord.visible = false;
    g.scene.add(this.kraken, this.overlord);
    this.ghost = opts.ghost;
    this.ghost.setLook(opts.victimLook || {});
    this.vp = opts.victimPos.clone();
    this.side = this.vp.z < 0 ? -1 : 1;
    this.fly = null;
    this.flags = {};
    g.hud.message('THE RECKONING', 'Death by chicken has consequences', 3);
    g.audio.rumble && g.audio.rumble(4.2);
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    if (this.o.onStop) this.o.onStop();
    this.g.scene.remove(this.kraken, this.overlord);
    this.ghost.setVisible(false);
    this.ghost.root.rotation.set(0, 0, 0);
  }

  update(dt) {
    const g = this.g, cam = g.camera, t = (this.t += dt);
    const K = this.kraken.userData;
    // ---------------- Act 1: the kraken (0 – 4.6 s) ----------------
    const rise = ease(seg(t, 0.2, 2.6));
    const close = ease(seg(t, 2.9, 3.7));
    const sink = ease(seg(t, 3.9, 4.7));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    K.tents.forEach((T, ti) => {
      const h = T.h * ease(seg(t, 0.2 + T.delay, 2.2 + T.delay)) * (1 - sink);
      for (let i = 0; i < K.N; i++) {
        const s = i / (K.N - 1);
        // Rise, wave, then curl in over the town as the jaws close.
        const toTown = TOWN.clone().sub(T.base).setY(0).normalize();
        p.copy(T.base).addScaledVector(new THREE.Vector3(0, 1, 0), s * h);
        p.x += Math.sin(s * 4 + t * 2.4 + T.ph) * s * 14;
        p.z += Math.cos(s * 3 + t * 2 + T.ph) * s * 14;
        p.addScaledVector(toTown, s * s * h * (0.25 + 0.6 * close));
        const r = (9 - s * 7.5) * (h > 1 ? 1 : 0);
        m.compose(p, q, sc.setScalar(Math.max(0.01, r)));
        K.blob.setMatrixAt(ti * K.N + i, m);
        const sp = p.clone().addScaledVector(toTown, r * 0.85);
        m.compose(sp, q, sc.setScalar(Math.max(0.01, r * 0.35)));
        K.suck.setMatrixAt(ti * K.N + i, m);
      }
    });
    K.blob.instanceMatrix.needsUpdate = true;
    K.suck.instanceMatrix.needsUpdate = true;
    K.maw.position.set(0, TOWN_Y - 175 + (175 - 8) * ease(seg(t, 0.8, 2.8)) - 240 * sink, 0);
    // Upper jaw rises with the maw (gaping), then bites down over the town.
    K.upper.position.y = (150 * (1 - close) + 4) * ease(seg(t, 0.8, 2.8));
    K.upper.rotation.x = -0.45 * (1 - close);
    if (t > 0.3 && !this.flags.dust) {
      this.flags.dust = true;
      for (const T of K.tents) g.effects.puff(T.base.clone().add(new THREE.Vector3(0, 6, 0)), 'dirt', 40, 3);
    }
    if (t > 3.6 && !this.flags.gulp) {
      this.flags.gulp = true;
      g.audio.rumble && g.audio.rumble(2);
      g.hud.message('', 'The kraken has eaten the town', 2);
      for (let i = 0; i < 8; i++) g.effects.puff(new THREE.Vector3((Math.random() - 0.5) * 300, 20, (Math.random() - 0.5) * 220), 'dirt', 60, 2.5);
    }
    if (t < 4.6) {
      const shake = (1 - sink) * rise * 2.2;
      const a = 0.6 + t * 0.12;
      cam.position.set(Math.sin(a) * 520, 190 + Math.sin(t * 31) * shake, -this.side * Math.cos(a) * 420);
      cam.lookAt(TOWN.x + Math.sin(t * 27) * shake, 60, TOWN.z);
      cam.fov = 55;
      cam.updateProjectionMatrix();
      this.ghost.setVisible(false);
      return this._end(t);
    }
    // ---------------- Act 2: the overlord (4.6 – 9 s) ----------------
    this.kraken.visible = false;
    const O = this.overlord.userData;
    this.overlord.visible = true;
    const vp = this.vp;
    const away = new THREE.Vector3(0, 0, this.side).normalize(); // off the back of their ridge
    // Sky eye high above, facing down at the victim.
    O.eye.position.set(vp.x, vp.y + 650, vp.z - away.z * 380);
    O.eye.scale.setScalar(1.8);
    O.eye.lookAt(vp);
    // Arm comes down from the eye; the hand ends beside the victim, fingertip behind them.
    const reach = ease(seg(t, 4.8, 6.6));
    const shoulder = O.eye.position.clone();
    const handTarget = vp.clone().add(new THREE.Vector3(0, 9, 0)).addScaledVector(away, -24);
    const armLen = 8 * 72 + 8;
    const hp = shoulder.clone().lerp(handTarget, reach);
    const dir = hp.clone().sub(shoulder).normalize();
    this.overlord.position.copy(hp).addScaledVector(dir, -armLen);
    O.arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.lengthSq() > 0 ? dir : new THREE.Vector3(0, -1, 0));
    O.arm.position.set(0, 0, 0);
    this.overlord.updateMatrixWorld(true);
    // Fingers: curl the index finger, then flick at 7 s.
    const curl = ease(seg(t, 6.0, 6.9)) * (1 - ease(seg(t, 7.0, 7.12)));
    O.fingers.forEach((f, i) => {
      // Joints are nested; curl each knuckle (index finger loads up for the flick).
      for (let j = f.children.find((c) => c.isGroup); j; j = j.children.find((c) => c.isGroup)) j.rotation.x = i === 1 ? curl * 1.25 : 0.3;
    });
    // Victim: stands there, then gets flicked into orbit.
    this.ghost.setVisible(true);
    if (t >= 7.05 && !this.fly) {
      this.fly = { p: vp.clone(), v: away.clone().multiplyScalar(160).add(new THREE.Vector3((Math.random() - 0.5) * 30, 120, 0)), spin: 0 };
      g.audio.flick && g.audio.flick();
      g.hud.message('FLICKED', 'Off the map', 2);
    }
    if (this.fly) {
      const F = this.fly;
      F.v.y -= 9.81 * dt;
      F.p.addScaledVector(F.v, dt);
      F.spin += dt * 14;
      this.ghost.update(dt, { p: F.p, yaw: F.spin, pitch: 0, st: 0, moving: false });
      this.ghost.root.rotation.x = F.spin * 0.7;
    } else {
      this.ghost.update(dt, { p: vp, yaw: this.side < 0 ? 0 : Math.PI, pitch: 0.5, st: 0, moving: false });
    }
    // Camera: look up at the eye; then wide on the victim as the hand comes down; then
    // stay put and zoom to follow them sailing off the map.
    const camBase = vp.clone().add(new THREE.Vector3(70, 22, away.z * 30));
    if (t < 5.7) {
      if (!this.flags.eye) { this.flags.eye = true; g.hud.message('', 'Something is looking down at you', 1.6); g.audio.rumble && g.audio.rumble(1.5); }
      cam.position.copy(vp).add(new THREE.Vector3(0, 2, 0));
      cam.lookAt(O.eye.position);
      cam.fov = 65;
    } else if (!this.fly) {
      cam.position.copy(camBase);
      cam.lookAt(vp.clone().add(new THREE.Vector3(0, 8 + 40 * (1 - reach), 0)).lerp(hp, 0.25));
      cam.fov = 58;
    } else {
      const F = this.fly;
      cam.position.copy(camBase);
      cam.lookAt(F.p);
      const d = cam.position.distanceTo(F.p);
      cam.fov = Math.min(72, Math.max(4, THREE.MathUtils.radToDeg(2 * Math.atan(9 / d))));
    }
    cam.updateProjectionMatrix();
    return this._end(t);
  }

  _end(t) {
    if (t < DUR) return;
    this.stop();
    if (this.o.onDone) this.o.onDone();
  }
}
