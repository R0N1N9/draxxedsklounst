import * as THREE from 'three';
import { stepProjectile } from './ballistics.js';
import { WEAPON, PLAYER } from './config.js';
import { clamp } from './util.js';
import { buildChicken, animateChicken } from './chicken.js';

const EYE = [PLAYER.eyeStand, PLAYER.eyeCrouch, PLAYER.eyeProne];

export function sampleHist(hist, t, out = {}) {
  if (!hist.length) return null;
  let i = hist.length - 1;
  while (i > 0 && hist[i].t > t) i--;
  const a = hist[i], b = hist[Math.min(i + 1, hist.length - 1)];
  const span = b.t - a.t;
  const k = span > 1e-6 ? clamp((t - a.t) / span, 0, 1) : 0;
  out.p = (out.p || new THREE.Vector3()).copy(a.p).lerp(b.p, k);
  let dy = b.yaw - a.yaw;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  out.yaw = a.yaw + dy * k;
  out.pitch = a.pitch + (b.pitch - a.pitch) * k;
  out.st = k < 0.5 ? a.st : b.st;
  out.sc = k < 0.5 ? a.sc : b.sc;
  out.z = a.z;
  out.moving = a.moving;
  return out;
}

export function pushHist(hist, sample, maxAge = 8) {
  hist.push(sample);
  const cut = sample.t - maxAge;
  while (hist.length > 2 && hist[0].t < cut) hist.shift();
}

export class Replay {
  constructor({ scene, camera, effects, ghostA, ghostB, wind }) {
    this.scene = scene;
    this.camera = camera;
    this.effects = effects;
    this.ghostShooter = ghostA;
    this.ghostVictim = ghostB;
    this.wind = wind;
    this.active = false;
    this.scopeView = false;
    // Brass-jacketed boat-tail spitzer, tip pointing +Z.
    const prof = [[0, 0], [0.022, 0], [0.028, 0.025], [0.028, 0.085], [0.022, 0.12], [0.012, 0.15], [0.002, 0.17], [0, 0.171]].map(([r, y]) => new THREE.Vector2(r, y));
    const bgeo = new THREE.LatheGeometry(prof, 16).rotateX(Math.PI / 2).scale(1.1, 1.1, 1.1);
    this.bullet = new THREE.Mesh(bgeo, new THREE.MeshStandardMaterial({ color: 0xd8a35a, metalness: 0.35, roughness: 0.25, emissive: 0x4a2c12 }));
    this.bullet.visible = false;
    scene.add(this.bullet);
    this.scene = scene;
    this.chick = null; // Pollo Hermano: built on first use
    const N = 90;
    this.trailPos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = 1 - i / N;
      col[i * 3] = 0.9 * a; col[i * 3 + 1] = 0.85 * a; col[i * 3 + 2] = 1.0 * a;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.trail = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.trail.frustumCulled = false;
    this.trail.visible = false;
    scene.add(this.trail);
    this.N = N;
  }

  // opts: { mode: 'victim'|'killer'|'practice', shooterHist, victimHist, shot:{o,v,t0,windT0}, impact:Vector3, label, onDone, victimObject }
  start(opts) {
    this.o = opts;
    if (opts.shot.ch && !this.chick) {
      this.chick = new THREE.Group();
      const c = buildChicken();
      c.rotation.y = Math.PI;
      c.position.y = -0.27;
      this.chick.add(c);
      this.chick.userData.c = c;
      this.chick.visible = false;
      this.scene.add(this.chick);
    }
    this.active = true;
    this.t = 0;
    // Precompute the bullet path up to the impact point.
    const p = opts.shot.o.clone(), v = opts.shot.v.clone();
    const path = [{ p: p.clone(), t: 0 }];
    let t = 0, best = Infinity;
    // Small steps (≤ 2 m) so very fast rounds (Halo-style instant hits) still trace cleanly.
    const dt = Math.min(1 / 240, 2 / Math.max(1, v.length()));
    let n = 0;
    while (t < 5 && n++ < 20000) {
      stepProjectile(p, v, dt, this.wind, opts.shot.windT0 + t);
      t += dt;
      path.push({ p: p.clone(), t });
      const d = p.distanceTo(opts.impact);
      if (d > best + 0.01 && (best < 3 || path.length > 4)) break;
      best = Math.min(best, d);
    }
    path[path.length - 1].p.copy(opts.impact);
    this.path = path;
    this.flight = t;
    this.kDur = opts.mode === 'victim' ? clamp(opts.shot.t0 - (opts.shooterHist[0]?.t ?? opts.shot.t0), 0, 2.6) : 0;
    this.bDur = clamp(this.flight * 2.6, 1.7, 3.3);
    this.iDur = 1.5;
    this.total = this.kDur + this.bDur + this.iDur;
    this.impactDone = false;
    this.fall = 0;
  }

  stop() {
    this.active = false;
    this.bullet.visible = false;
    if (this.chick) this.chick.visible = false;
    this.trail.visible = false;
    this.ghostShooter.setVisible(false);
    this.ghostVictim.setVisible(false);
    this.scopeView = false;
  }

  _pathAt(time, out) {
    const path = this.path;
    let i = 0;
    while (i < path.length - 2 && path[i + 1].t < time) i++;
    const a = path[i], b = path[i + 1] || a;
    const k = b.t > a.t ? clamp((time - a.t) / (b.t - a.t), 0, 1) : 0;
    return out.copy(a.p).lerp(b.p, k);
  }

  _poseGhost(ghost, hist, t, dt) {
    if (!hist || !hist.length) { ghost.setVisible(false); return null; }
    const s = sampleHist(hist, t);
    ghost.setVisible(true);
    ghost.update(dt, s);
    return s;
  }

  update(dt) {
    if (!this.active) return false;
    const o = this.o;
    this.t += dt;
    const cam = this.camera;
    const t0 = o.shot.t0;
    const showVictimGhost = o.mode !== 'practice';
    if (this.t < this.kDur) {
      // Phase 1: through the shooter's eyes, leading up to the trigger pull.
      const ht = t0 - this.kDur + this.t;
      const s = sampleHist(o.shooterHist, ht);
      this.ghostShooter.setVisible(false);
      if (showVictimGhost) this._poseGhost(this.ghostVictim, o.victimHist, ht, dt);
      if (s) {
        cam.position.set(s.p.x, s.p.y + EYE[s.st], s.p.z);
        cam.rotation.set(s.pitch, s.yaw, 0, 'YXZ');
        const zoom = s.sc ? s.z || 12 : 1;
        cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(WEAPON.baseFov / 2)) / zoom));
        this.scopeView = !!s.sc;
      }
      this.phase = 'killcam';
    } else if (this.t < this.kDur + this.bDur) {
      // Phase 2: bullet cam, easing into slow motion near the target.
      this.scopeView = false;
      const u = (this.t - this.kDur) / this.bDur;
      const eased = 1 - Math.pow(1 - u, 1.8);
      const ft = eased * this.flight;
      const bp = this._pathAt(ft, new THREE.Vector3());
      const ahead = this._pathAt(Math.min(ft + 0.01, this.flight), new THREE.Vector3());
      const dir = ahead.sub(bp);
      if (dir.lengthSq() < 1e-8) dir.copy(o.shot.v);
      dir.normalize();
      const proj = o.shot.ch ? this.chick : this.bullet;
      this.bullet.visible = !o.shot.ch;
      proj.visible = true;
      proj.position.copy(bp);
      proj.lookAt(bp.clone().add(dir));
      if (o.shot.ch) animateChicken(this.chick.userData.c, this.t * 0.6, { flap: 1 });
      // Trail
      for (let i = 0; i < this.N; i++) {
        const tt = Math.max(0, ft - i * 0.004);
        const q = this._pathAt(tt, new THREE.Vector3());
        this.trailPos.set([q.x, q.y, q.z], i * 3);
      }
      this.trail.geometry.attributes.position.needsUpdate = true;
      this.trail.visible = true;
      const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      const orbit = Math.sin(u * Math.PI) * 0.5;
      cam.position.copy(bp).addScaledVector(dir, -0.85 + u * 0.25).addScaledVector(side, 0.5 + orbit * 0.4).add(new THREE.Vector3(0, 0.14, 0));
      cam.lookAt(bp.clone().addScaledVector(dir, 2.2));
      cam.fov = 48 - u * 10;
      const st = this._poseGhost(this.ghostShooter, o.shooterHist, t0, dt);
      if (showVictimGhost) this._poseGhost(this.ghostVictim, o.victimHist, t0 + this.flight, dt);
      this.phase = 'bullet';
    } else {
      // Phase 3: impact, slow orbit.
      const u = (this.t - this.kDur - this.bDur) / this.iDur;
      this.bullet.visible = false;
      if (this.chick) this.chick.visible = false;
      if (!this.impactDone) {
        this.impactDone = true;
        this.effects.puff(o.impact.clone(), o.shot.ch ? 'feather' : o.mode === 'practice' ? 'metal' : 'body', o.shot.ch ? 1.6 : 0.8, 0.9);
        this.effects.puff(o.impact.clone(), 'dust', 1.2, 1.4);
        if (o.onImpact) o.onImpact();
      }
      const ang = u * 0.9 + 0.4;
      const center = o.impact;
      const d0 = this.path[Math.max(0, this.path.length - 30)].p.clone().sub(center).setY(0).normalize();
      const side = new THREE.Vector3(-d0.z, 0, d0.x);
      cam.position.copy(center).addScaledVector(d0, 3.2 * Math.cos(ang)).addScaledVector(side, 3.2 * Math.sin(ang)).add(new THREE.Vector3(0, 0.9, 0));
      cam.lookAt(center);
      cam.fov = 45;
      if (showVictimGhost) {
        const s = this._poseGhost(this.ghostVictim, o.victimHist, t0 + this.flight, dt);
        this.fall = Math.min(1, this.fall + dt * 2.2);
        if (s && s.st !== 2) this.ghostVictim.root.rotation.x = -this.fall * this.fall * 1.45;
      }
      this.phase = 'impact';
    }
    cam.updateProjectionMatrix();
    if (this.t >= this.total) {
      this.ghostVictim.root.rotation.x = 0;
      this.stop();
      o.onDone && o.onDone();
      return false;
    }
    return true;
  }
}
