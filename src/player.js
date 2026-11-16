import * as THREE from 'three';
import { PLAYER, WEAPON, MAP } from './config.js';
import { clamp, lerp, noise2 } from './util.js';
import { zeroAngle } from './ballistics.js';

const HEIGHTS = [1.8, 1.25, 0.55];
const EYES = [PLAYER.eyeStand, PLAYER.eyeCrouch, PLAYER.eyeProne];
const SWAY = [2.6, 1.6, 0.7]; // milliradians amplitude by stance

export class LocalPlayer {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.stance = 0;
    this.eye = PLAYER.eyeStand;
    this.onGround = true;
    this.reset(new THREE.Vector3(), 0);
  }

  reset(spawn, yaw) {
    this.pos.copy(spawn);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = -0.04;
    this.stance = 0;
    this.eye = PLAYER.eyeStand;
    this.hp = PLAYER.hp;
    this.alive = true;
    this.scoped = false;
    this.scopeT = 0;
    this.zoomIdx = 2;
    this.zero = 300;
    this.ammo = WEAPON.mag;
    this.reserve = WEAPON.reserve;
    this.boltT = 0;
    this.reloadT = 0;
    this.rangeT = 0;
    this.range = null;
    this.rangeShow = 0;
    this.breath = 1; // 1 = full
    this.holding = false;
    this.breathLock = 0;
    this.recoil = 0;
    this.swayT = Math.random() * 100;
    this.moving = false;
    this.speed = 0;
    this.wounded = false;
    this.bob = 0;
  }

  get zoom() {
    return WEAPON.zooms[this.zoomIdx];
  }

  fov() {
    const base = WEAPON.baseFov;
    const z = this.zoom;
    const scoped = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(base / 2)) / z));
    return lerp(base, scoped, this.scopeT);
  }

  eyePos(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + this.eye + this.bob, this.pos.z);
  }

  // Sway offset in radians (yaw, pitch).
  sway(out = { x: 0, y: 0 }) {
    let amp = SWAY[this.stance] * 0.001;
    if (this.moving) amp *= 2.4;
    if (this.wounded) amp *= 1.6;
    if (this.holding) amp *= 0.12;
    else if (this.breathLock > 0) amp *= 2.0;
    amp *= this.scopeT;
    const t = this.swayT;
    out.x = (noise2(t * 0.55, 3.3) * 1.0 + Math.sin(t * 0.9) * 0.45) * amp;
    out.y = (noise2(t * 0.6, 9.1) * 0.8 + Math.sin(t * 1.3 + 1) * 0.35) * amp - this.recoil;
    return out;
  }

  aimDir(out = new THREE.Vector3()) {
    const s = this.sway();
    const yaw = this.yaw + s.x, pitch = this.pitch - s.y;
    return out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  }

  // Direction the bullet leaves the barrel: aim + zero elevation.
  muzzleDir(out = new THREE.Vector3()) {
    const s = this.sway();
    const yaw = this.yaw + s.x, pitch = this.pitch - s.y + zeroAngle(this.zero);
    return out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  }

  canFire() {
    return this.alive && this.boltT <= 0 && this.reloadT <= 0 && this.ammo > 0;
  }

  update(dt, a, world, opts) {
    const { canMove } = opts;
    this.swayT += dt;
    // --- Look
    const fovScale = this.fov() / WEAPON.baseFov;
    const sens = 0.0022 * (0.35 + 0.65 * fovScale);
    this.yaw -= a.lookX * sens;
    this.pitch -= a.lookY * sens;
    this.pitch = clamp(this.pitch, -1.45, 1.45);

    // --- Stance
    if (a.crouch) this.stance = this.stance === 1 ? 0 : 1;
    if (a.prone) this.stance = this.stance === 2 ? 0 : 2;
    if (a.jump && this.stance > 0) {
      this.stance = 0;
      a.jump = false;
    }

    // --- Scope
    const wantScope = a.scope && this.alive && this.reloadT <= 0;
    this.scoped = wantScope;
    this.scopeT = clamp(this.scopeT + (wantScope ? dt / 0.18 : -dt / 0.12), 0, 1);
    if (a.zoomIn && this.scoped) this.zoomIdx = Math.min(this.zoomIdx + 1, WEAPON.zooms.length - 1);
    if (a.zoomOut && this.scoped) this.zoomIdx = Math.max(this.zoomIdx - 1, 0);
    if (a.zeroUp) this.zero = Math.min(this.zero + WEAPON.zeroStep, WEAPON.zeroMax);
    if (a.zeroDown) this.zero = Math.max(this.zero - WEAPON.zeroStep, WEAPON.zeroMin);

    // --- Breath (hold to steady while scoped)
    const wantHold = a.breath && this.scoped && this.breathLock <= 0 && this.breath > 0;
    this.holding = wantHold;
    if (wantHold) {
      this.breath -= dt / 5;
      if (this.breath <= 0) { this.breath = 0; this.breathLock = 2.5; this.holding = false; }
    } else {
      this.breathLock = Math.max(0, this.breathLock - dt);
      this.breath = Math.min(1, this.breath + dt / 4);
    }

    // --- Weapon timers
    this.boltT = Math.max(0, this.boltT - dt);
    this.rangeT = Math.max(0, this.rangeT - dt);
    this.rangeShow = Math.max(0, this.rangeShow - dt);
    this.recoil = Math.max(0, this.recoil - dt * this.recoil * 6 - dt * 0.004);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const need = WEAPON.mag - this.ammo;
        const take = Math.min(need, this.reserve);
        this.ammo += take;
        this.reserve -= take;
      }
    }
    if (a.reload && this.ammo < WEAPON.mag && this.reserve > 0 && this.reloadT <= 0) this.reloadT = WEAPON.reloadTime;

    // --- Movement
    let speed = this.stance === 2 ? PLAYER.prone : this.stance === 1 ? PLAYER.crouch : PLAYER.walk;
    const sprinting = a.sprint && !this.scoped && this.stance === 0 && a.my < -0.3;
    if (sprinting) speed = PLAYER.sprint;
    if (this.scoped) speed *= 0.5;
    if (this.wounded) speed *= 0.75;
    if (!canMove) speed = 0;
    const sn = Math.sin(this.yaw), cs = Math.cos(this.yaw);
    const wx = (a.mx * cs + a.my * sn) * speed;
    const wz = (-a.mx * sn + a.my * cs) * speed;
    const accel = this.onGround ? 14 : 3;
    this.vel.x += (wx - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wz - this.vel.z) * Math.min(1, accel * dt);
    if (a.jump && this.onGround && canMove && this.stance === 0) {
      this.vel.y = PLAYER.jump;
      this.onGround = false;
    }
    this.vel.y -= PLAYER.gravity * dt;

    const height = HEIGHTS[this.stance];
    const oldX = this.pos.x, oldZ = this.pos.z, oldY = this.pos.y;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    // Steep slopes: refuse to climb terrain above ~52 degrees.
    const tNew = world.heightAt(this.pos.x, this.pos.z);
    const tOld = world.heightAt(oldX, oldZ);
    const hd = Math.hypot(this.pos.x - oldX, this.pos.z - oldZ);
    if (hd > 1e-5 && tNew - tOld > hd * 1.3 && tNew > oldY + 0.05) {
      this.pos.x = oldX;
      this.pos.z = oldZ;
    }
    world.resolveHorizontal(this.pos, PLAYER.radius, height, PLAYER.step);
    this.pos.x = clamp(this.pos.x, -MAP.playX, MAP.playX);
    this.pos.z = clamp(this.pos.z, -MAP.playZ, MAP.playZ);

    this.pos.y += this.vel.y * dt;
    const ground = world.groundAt(this.pos.x, this.pos.z, Math.max(this.pos.y, oldY), PLAYER.step);
    if (this.pos.y <= ground) {
      this.pos.y = ground;
      this.vel.y = 0;
      this.onGround = true;
    } else if (this.onGround && this.pos.y - ground < PLAYER.step && this.vel.y <= 0) {
      // Stick to the ground when walking downhill.
      this.pos.y = ground;
      this.vel.y = 0;
    } else {
      this.onGround = false;
    }

    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.moving = this.speed > 0.4;
    const targetEye = EYES[this.stance];
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 10);
    this.bobPhase = (this.bobPhase || 0) + dt * this.speed * 1.9;
    this.bob = this.onGround ? Math.sin(this.bobPhase) * 0.035 * Math.min(this.speed / 4, 1.3) * (1 - this.scopeT) : 0;
  }

  fireKick() {
    this.ammo--;
    this.boltT = WEAPON.boltTime;
    this.recoil = 0.022 * (this.stance === 2 ? 0.6 : 1);
    this.holding = false;
  }
}
