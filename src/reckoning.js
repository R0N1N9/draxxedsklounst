// Death by chicken (Pollo Hermano): you don't simply die. The valley floods, a kraken rises
// through the town and drags it into the deep, then a vast AI overlord reaches down out of the sky and flicks you
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

// ---- Kraken: a colossal octopus that rises out of a flooded valley -------------------------
// Value noise for skin mottling and lumps.
function h3(x, y, z) {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return n - Math.floor(n);
}
function vn(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const f = (t) => t * t * (3 - 2 * t);
  const fx = f(x - xi), fy = f(y - yi), fz = f(z - zi);
  const L = (a, b, k) => a + (b - a) * k;
  const c = (a, b, d) => h3(xi + a, yi + b, zi + d);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), fx), L(c(0, 1, 0), c(1, 1, 0), fx), fy), L(L(c(0, 0, 1), c(1, 0, 1), fx), L(c(0, 1, 1), c(1, 1, 1), fx), fy), fz);
}
const SKIN = { base: new THREE.Color('#7a2230'), dark: new THREE.Color('#3a0d18'), pale: new THREE.Color('#c9705e'), spot: new THREE.Color('#2a0812') };
function skinMat() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.08, emissive: '#1a0308', emissiveIntensity: 0.35 });
}

// A tapered tube whose vertices are rewritten every frame from a centerline.
const NS = 56, NR = 12;
function makeTube(mat) {
  const pos = new Float32Array((NS + 1) * (NR + 1) * 3);
  const col = new Float32Array((NS + 1) * (NR + 1) * 3);
  const idx = [];
  for (let i = 0; i < NS; i++) for (let j = 0; j < NR; j++) {
    const a = i * (NR + 1) + j, b = a + NR + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  // Colours: dark back, pale underside, blotches.
  const c = new THREE.Color();
  for (let i = 0; i <= NS; i++) for (let j = 0; j <= NR; j++) {
    const under = Math.max(0, Math.cos((j / NR) * Math.PI * 2)); // j=0 faces the sucker side
    c.copy(SKIN.base).lerp(SKIN.pale, under * 0.85);
    if (vn(i * 0.35, j * 0.9, 3.1) > 0.68 && under < 0.3) c.lerp(SKIN.spot, 0.7);
    c.lerp(SKIN.dark, (i / NS) * 0.25);
    c.toArray(col, (i * (NR + 1) + j) * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.castShadow = true;
  return m;
}
const _t = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3(), _v = new THREE.Vector3();
// pts: NS+1 centerline points; r(s): radius; side: preferred direction for the sucker side.
function fillTube(mesh, pts, r, side) {
  const pos = mesh.geometry.attributes.position.array;
  const frames = [];
  for (let i = 0; i <= NS; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(NS, i + 1)];
    _t.subVectors(b, a).normalize();
    _n.copy(side).addScaledVector(_t, -side.dot(_t));
    if (_n.lengthSq() < 1e-6) _n.set(0, 1, 0).addScaledVector(_t, -_t.y);
    _n.normalize();
    _b.crossVectors(_t, _n);
    const rad = r(i / NS);
    for (let j = 0; j <= NR; j++) {
      const ang = (j / NR) * Math.PI * 2;
      _v.copy(pts[i]).addScaledVector(_n, Math.cos(ang) * rad).addScaledVector(_b, Math.sin(ang) * rad);
      _v.toArray(pos, (i * (NR + 1) + j) * 3);
    }
    frames.push({ n: _n.clone(), b: _b.clone(), rad });
  }
  mesh.geometry.attributes.position.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingSphere();
  return frames;
}

function buildKraken() {
  const g = new THREE.Group();
  // The flood: a lake that wells up through the town (terrain shapes its shoreline).
  const waterGeo = new THREE.RingGeometry(0.5, 340, 72, 18).rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({ color: '#0f3442', roughness: 0.12, metalness: 0.35, transparent: true, opacity: 0.93 }));
  water.userData.base = waterGeo.attributes.position.array.slice();
  g.add(water);
  const foamM = new THREE.MeshBasicMaterial({ color: '#dff4f2', transparent: true, opacity: 0.7, depthWrite: false });
  const foam = new THREE.Mesh(new THREE.TorusGeometry(88, 5, 6, 48).rotateX(Math.PI / 2), foamM);
  g.add(foam);
  // Body: a lumpy, glossy mantle (lathe) on a short neck; eyes low on either side.
  const body = new THREE.Group();
  const prof = [];
  for (let k = 0; k <= 24; k++) {
    const u = k / 24;
    const y = -40 + u * 270;
    // Bulbous octopus head: a neck at the waterline swelling into a rounded dome.
    const r = 104 * Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * u)), 0.55);
    prof.push(new THREE.Vector2(Math.max(0.5, r), y));
  }
  const mantleGeo = new THREE.LatheGeometry(prof, 48);
  const mp = mantleGeo.attributes.position, mcol = new Float32Array(mp.count * 3), c = new THREE.Color();
  for (let i = 0; i < mp.count; i++) {
    const x = mp.getX(i), y = mp.getY(i), z = mp.getZ(i);
    const bump = 1 + 0.07 * (vn(x / 22, y / 22, z / 22) - 0.5) + 0.03 * (vn(x / 8, y / 8, z / 8) - 0.5);
    mp.setXYZ(i, x * bump, y, z * bump);
    const front = Math.max(0, -z / 95);
    c.copy(SKIN.base).lerp(SKIN.dark, Math.min(1, Math.max(0, (y - 60) / 200)) * 0.7);
    c.lerp(SKIN.pale, front * Math.max(0, 1 - Math.abs(y - 10) / 70) * 0.5);
    if (vn(x / 14, y / 14, z / 14) > 0.66) c.lerp(SKIN.spot, 0.75);
    c.toArray(mcol, i * 3);
  }
  mantleGeo.setAttribute('color', new THREE.BufferAttribute(mcol, 3));
  mantleGeo.computeVertexNormals();
  const mantle = new THREE.Mesh(mantleGeo, skinMat());
  mantle.rotation.x = 0.32; // leans back, the way an octopus carries its mantle
  mantle.castShadow = true;
  body.add(mantle);
  const eyes = [];
  const scleraM = new THREE.MeshStandardMaterial({ color: '#f3b236', emissive: '#ff8a10', emissiveIntensity: 0.55, roughness: 0.2 });
  const pupilM = new THREE.MeshBasicMaterial({ color: '#0a0405' });
  const lidM = new THREE.MeshStandardMaterial({ color: '#5a1622', roughness: 0.4, side: THREE.DoubleSide });
  for (const sx of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(sx * 64, 26, -66);
    e.rotation.y = sx * 0.75;
    e.add(new THREE.Mesh(new THREE.SphereGeometry(22, 20, 14), scleraM));
    const pupil = new THREE.Mesh(new THREE.BoxGeometry(26, 5.5, 3), pupilM);
    pupil.position.z = -21.5;
    e.add(pupil);
    // Heavy upper and lower lids (they close to slits when it attacks).
    const upper = new THREE.Mesh(new THREE.SphereGeometry(24.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), lidM);
    const lower = new THREE.Mesh(new THREE.SphereGeometry(24.5, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), lidM);
    e.add(upper, lower);
    const brow = new THREE.Mesh(new THREE.TorusGeometry(25, 6, 8, 24, Math.PI), new THREE.MeshStandardMaterial({ color: '#4a111c', roughness: 0.5 }));
    brow.rotation.set(0, 0, 0);
    brow.position.set(0, 4, -4);
    e.add(brow);
    body.add(e);
    eyes.push({ e, upper, lower });
  }
  g.add(body);
  // Eight arms, rooted round the base of the body.
  const armMat = skinMat();
  const arms = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    const mesh = makeTube(armMat);
    g.add(mesh);
    arms.push({ mesh, a, len: 300 + (i % 3) * 45, r0: 15 + (i % 2) * 2, ph: i * 1.37, delay: (i % 4) * 0.16, pts: Array.from({ length: NS + 1 }, () => new THREE.Vector3()) });
  }
  // Suckers: two rows of pale discs along each arm's underside.
  const SPA = 22;
  const suck = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 0.8, 0.6, 12), new THREE.MeshStandardMaterial({ color: '#e7b3a3', roughness: 0.5 }), 8 * SPA * 2);
  suck.frustumCulled = false;
  g.add(suck);
  g.userData = { water, foam, body, mantle, eyes, arms, suck, SPA };
  return g;
}

function disposeAll(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });
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
    disposeAll(this.kraken);
    disposeAll(this.overlord);
    this.ghost.setVisible(false);
    this.ghost.root.rotation.set(0, 0, 0);
  }

  update(dt) {
    const g = this.g, cam = g.camera, t = (this.t += dt);
    const K = this.kraken.userData;
    // ---------------- Act 1: the kraken (0 – 4.6 s) ----------------
    // The valley floods, the kraken rises through the town, slams its arms down across it
    // and drags the whole lot under as the water climbs over the rooftops.
    const flood = ease(seg(t, 0.05, 0.9));
    const rise = ease(seg(t, 0.5, 2.3));
    const slam = ease(seg(t, 2.3, 2.9));
    const drag = ease(seg(t, 3.25, 4.4));
    const wl = TOWN_Y - 30 + 32.5 * flood + 34 * drag; // water level
    if (t < 4.6) {
      // Water: gentle chop plus rings spreading from the monster.
      const W = K.water, wp = W.geometry.attributes.position, base = W.userData.base;
      for (let i = 0; i < wp.count; i++) {
        const x = base[i * 3], z = base[i * 3 + 2], r = Math.hypot(x, z);
        const y = Math.sin(x * 0.05 + t * 1.7) * 0.8 + Math.cos(z * 0.06 + t * 1.3) * 0.8 + Math.sin(r * 0.08 - t * 6) * 3 * Math.exp(-r / 160) * (rise + slam);
        wp.setY(i, y);
      }
      wp.needsUpdate = true;
      W.geometry.computeVertexNormals();
      W.position.y = wl;
      K.foam.position.y = wl + 0.5;
      K.foam.scale.setScalar(1 + 0.06 * Math.sin(t * 9));
      K.foam.material.opacity = 0.75 * rise * (1 - drag * 0.6);
      // Body: faces the camera, rises out of the water, sinks again at the end.
      const bodyY = wl - 260 + 292 * rise - 330 * drag; // eyes clear the water at full height
      K.body.position.set(0, bodyY, 0);
      K.body.rotation.y = Math.atan2(cam.position.x, cam.position.z) + Math.PI;
      K.body.rotation.z = Math.sin(t * 1.3) * 0.04;
      K.mantle.scale.set(1 + 0.03 * Math.sin(t * 2.2), 1 + 0.02 * Math.sin(t * 2.2 + 1), 1 + 0.03 * Math.sin(t * 2.2));
      // Eyes: lids pulled back wide as it surfaces, narrowed to slits as it strikes.
      const open = 1.3 - 0.75 * slam * (1 - drag * 0.5);
      for (const E of K.eyes) {
        E.upper.rotation.x = open;
        E.lower.rotation.x = -open;
      }
      // Arms.
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
      let si = 0;
      const up = new THREE.Vector3(0, 1, 0);
      K.arms.forEach((A, ai) => {
        const grow = ease(seg(t, 0.6 + A.delay, 2.0 + A.delay));
        const out = new THREE.Vector3(Math.cos(A.a), 0, Math.sin(A.a));
        const lat = new THREE.Vector3(-out.z, 0, out.x);
        const root = new THREE.Vector3(out.x * 55, Math.min(bodyY + 40, wl + 6), out.z * 55); // arms come up out of the water
        const land = 95 + (ai % 3) * 35; // where it hits the town
        for (let i = 0; i <= NS; i++) {
          const s = i / NS;
          const L = A.len * (0.35 + 0.65 * grow);
          // Raised: out and up in an S, tip curling.
          const raised = new THREE.Vector3()
            .addScaledVector(out, s * L * 0.42)
            .addScaledVector(up, Math.sin(s * Math.PI * 0.85) * L * 0.62 * grow - (1 - grow) * 40)
            .addScaledVector(lat, Math.sin(s * 4.2 + t * 2.3 + A.ph) * s * 28);
          if (s > 0.72) {
            const k = (s - 0.72) / 0.28, ang = k * 3.2 + t * 1.5 + A.ph;
            raised.addScaledVector(out, Math.cos(ang) * k * 22).addScaledVector(up, Math.sin(ang) * k * 22);
          }
          // Slammed: arcs out and down onto the town, tip pressing into the street.
          const reach = land * (1 - 0.55 * drag);
          const slammed = new THREE.Vector3()
            .addScaledVector(out, s * reach + Math.sin(s * Math.PI) * 30)
            .addScaledVector(up, Math.sin(s * Math.PI) * (70 - 50 * drag) - s * (root.y - (TOWN_Y + 4)) - 60 * drag * s)
            .addScaledVector(lat, Math.sin(s * 6 + t * 3 + A.ph) * 6);
          A.pts[i].copy(root).add(raised.lerp(slammed, slam));
        }
        const frames = fillTube(A.mesh, A.pts, (s) => A.r0 * Math.pow(1 - s, 0.85) * (0.55 + 0.45 * grow) + 1.2, out.clone().negate().add(new THREE.Vector3(0, -0.6, 0)).normalize());
        // Suckers along the underside (the frame normal side).
        for (let k = 0; k < K.SPA; k++) {
          const i = Math.round(4 + (k / K.SPA) * (NS - 8));
          const F = frames[i];
          for (const side of [-0.5, 0.5]) {
            const p = A.pts[i].clone().addScaledVector(F.n, F.rad * 0.92 * Math.cos(side)).addScaledVector(F.b, F.rad * 0.92 * Math.sin(side));
            q.setFromUnitVectors(up, F.n);
            const sr = F.rad * 0.32;
            m.compose(p, q, sc.set(sr, sr, sr));
            K.suck.setMatrixAt(si++, m);
          }
        }
      });
      K.suck.instanceMatrix.needsUpdate = true;
    }
    if (t > 0.15 && !this.flags.burst) {
      this.flags.burst = true;
      for (let i = 0; i < 10; i++) { const a = i * 0.63; g.effects.puff(new THREE.Vector3(Math.cos(a) * 120, TOWN_Y + 6, Math.sin(a) * 90), 'water', 45, 2.4); }
    }
    if (t > 1.0 && !this.flags.surface) {
      this.flags.surface = true;
      for (let i = 0; i < 8; i++) { const a = i * 0.8; g.effects.puff(new THREE.Vector3(Math.cos(a) * 75, wl + 10, Math.sin(a) * 75), 'water', 60, 2.6); }
    }
    if (t > 2.75 && !this.flags.slam) {
      this.flags.slam = true;
      g.audio.rumble && g.audio.rumble(1.4);
      for (const A of K.arms) g.effects.puff(A.pts[NS].clone().add(new THREE.Vector3(0, 8, 0)), 'water', 55, 2.2);
    }
    if (t > 3.4 && !this.flags.gulp) {
      this.flags.gulp = true;
      g.audio.rumble && g.audio.rumble(2);
      g.hud.message('', 'The kraken has dragged the town into the deep', 2);
      for (let i = 0; i < 10; i++) g.effects.puff(new THREE.Vector3((Math.random() - 0.5) * 300, wl + 15, (Math.random() - 0.5) * 220), 'water', 70, 2.5);
    }
    if (t < 4.6) {
      const shake = (rise * 0.8 + slam * 2.2) * (1 - drag) + flood * 0.6;
      const a = 0.55 + t * 0.1;
      cam.position.set(Math.sin(a) * 430, 115 + Math.sin(t * 31) * shake, -this.side * Math.cos(a) * 360);
      cam.lookAt(TOWN.x + Math.sin(t * 27) * shake, 95 - 40 * drag, TOWN.z);
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
      g.hud.message('FLICKED OFF THE MAP', 'The AI Overlords have deemed this one unworthy.', 2.4);
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
