// Ammo resupply by cargo drone. Call it in (V / SUPPLY), a hexacopter flies in from behind
// your ridge, drops a parachute crate where you aimed (or at your feet), and leaves. Walk
// onto your crate to refill both weapons. Both players see and hear the drone, so calling
// one is a tell. The flight is deterministic from the call message, so both screens match.
import * as THREE from 'three';
import { withHaze } from './atmosphere.js';
import { glowTexture } from './textures.js';
import { clamp } from './util.js';

const CRUISE = 45; // m/s
const ALT = 85; // cruise height above the drop point
const RELEASE = 26; // release height above ground
const CHUTE = 5.5; // crate descent speed, m/s
const LIFE = 60; // crate stays this long once landed
export const SUPPLY_COOLDOWN = 90; // seconds between calls

function mat(color) {
  return withHaze(new THREE.MeshLambertMaterial({ color, flatShading: true }), { key: 'supply' });
}

function buildDrone() {
  const g = new THREE.Group();
  const dark = mat('#2d2f35');
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 1.4), dark));
  const rotors = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 1.5), dark);
    arm.position.set(Math.sin(a) * 0.75, 0.1, Math.cos(a) * 0.75);
    arm.rotation.y = a;
    g.add(arm);
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.02, 14), new THREE.MeshBasicMaterial({ color: 0x777780, transparent: true, opacity: 0.35 }));
    rotor.position.set(Math.sin(a) * 1.5, 0.22, Math.cos(a) * 1.5);
    g.add(rotor);
    rotors.push(rotor);
  }
  const light = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffb040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  light.position.y = -0.35;
  light.scale.setScalar(2.2);
  g.add(light);
  g.userData = { rotors, light };
  return g;
}

function buildCrate() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.6, 0.62), mat('#556043'));
  box.position.y = 0.3;
  g.add(box);
  for (const x of [-0.3, 0.3]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, 0.64), mat('#2c2f27'));
    band.position.set(x, 0.3, 0);
    g.add(band);
  }
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.97, 0.08, 0.64), mat('#e0a040'));
  stripe.position.y = 0.48;
  g.add(stripe);
  const chute = new THREE.Group();
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), withHaze(new THREE.MeshLambertMaterial({ color: '#c8b48a', side: THREE.DoubleSide, flatShading: true }), { key: 'chute' }));
  canopy.scale.y = 0.55;
  canopy.position.y = 3.2;
  chute.add(canopy);
  const lines = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.45, 0.6, -0.3), new THREE.Vector3(-1.5, 3.2, -1.5),
    new THREE.Vector3(0.45, 0.6, -0.3), new THREE.Vector3(1.5, 3.2, -1.5),
    new THREE.Vector3(-0.45, 0.6, 0.3), new THREE.Vector3(-1.5, 3.2, 1.5),
    new THREE.Vector3(0.45, 0.6, 0.3), new THREE.Vector3(1.5, 3.2, 1.5),
  ]);
  chute.add(new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: '#2a2a2a' })));
  g.add(chute);
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x50ff90, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  beacon.position.y = 0.75;
  beacon.scale.setScalar(1.3);
  g.add(beacon);
  g.userData = { chute, beacon };
  return g;
}

export class Supply {
  constructor(game) {
    this.g = game;
    this.drops = [];
    this.nextId = 1;
    this.reset();
  }

  reset() {
    for (const d of this.drops) this._remove(d);
    this.drops.length = 0;
    this.cooldown = 0;
  }

  get status() {
    const mine = this.drops.find((d) => d.mine && !d.taken && !(d.landed && d.t - d.landedT > LIFE));
    if (mine) return mine.landed ? 'LANDED' : 'INBOUND';
    return this.cooldown > 0 ? `${Math.ceil(this.cooldown)}S` : 'READY';
  }

  // Call a drop. Lands where you aim (within 60 m on walkable ground) or at your feet.
  call() {
    const g = this.g, P = g.player;
    if (this.status === 'INBOUND') {
      g.hud.message('', 'Supply drone already inbound', 1.4);
      g.audio.click();
      return;
    }
    if (this.cooldown > 0) {
      g.hud.message('', `Next supply drone in ${Math.ceil(this.cooldown)} s`, 1.4);
      g.audio.click();
      return;
    }
    const o = P.eyePos(new THREE.Vector3());
    const d = P.aimDir(new THREE.Vector3());
    const hit = g.world.raycast(o, o.clone().addScaledVector(d, 60), true);
    let p;
    if (hit && hit.normal.y > 0.7) p = hit.point.clone();
    else p = P.pos.clone().add(new THREE.Vector3(-Math.sin(P.yaw) * 3, 0, -Math.cos(P.yaw) * 3));
    p.y = g.world.groundAt(p.x, p.z, p.y + 2, 0.6);
    // Fly in from behind the caller's own ridge.
    const side = P.pos.z < 0 ? -1 : 1;
    const from = new THREE.Vector3(clamp(p.x + (Math.random() - 0.5) * 200, -700, 700), p.y + ALT, side * 620);
    this.cooldown = SUPPLY_COOLDOWN;
    const id = this.nextId++ * 2 + g.me;
    this._spawn({ id, p, from, mine: true });
    if (g.net && g.net.open) g.net.send({ t: 'supply', id, p: p.toArray(), from: from.toArray() });
    g.hud.message('SUPPLY INBOUND', 'Cargo drone en route — it can be seen and heard', 2.5);
    g.audio.beep(null, true);
  }

  onRemote(m) {
    if (this.drops.some((d) => d.id === m.id)) return;
    this._spawn({ id: m.id, p: new THREE.Vector3(...m.p), from: new THREE.Vector3(...m.from), mine: false });
  }

  onRemoteTaken(m) {
    const d = this.drops.find((x) => x.id === m.id);
    if (d) {
      d.taken = true;
      d.crate.visible = false;
    }
  }

  _spawn({ id, p, from, mine }) {
    const drone = buildDrone();
    const crate = buildCrate();
    crate.visible = false;
    this.g.scene.add(drone, crate);
    const over = p.clone().add(new THREE.Vector3(0, RELEASE + 4, 0));
    const tIn = from.distanceTo(over) / CRUISE;
    const exit = over.clone().add(over.clone().sub(from).setY(0).normalize().multiplyScalar(500)).add(new THREE.Vector3(0, 60, 0));
    this.drops.push({ id, p, from, over, exit, tIn, mine, t: 0, drone, crate, landed: false, taken: false, released: false, loop: `supply${id}` });
    this.g.audio.startLoop(`supply${id}`, from, 'drone', mine ? 0.3 : 0.55);
  }

  _remove(d) {
    this.g.scene.remove(d.drone, d.crate);
    this.g.audio.stopLoop(d.loop);
    if (d.marker) d.marker.age = d.marker.life;
  }

  update(dt) {
    const g = this.g, P = g.player;
    if (this.cooldown > 0) {
      this.cooldown = Math.max(0, this.cooldown - dt);
      if (this.cooldown === 0) g.hud.message('', 'Supply drone ready (V)', 1.6);
    }
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t += dt;
      // Drone: fly in, hover and release, then climb away.
      const hover = 1.5;
      let pos;
      if (d.t < d.tIn) pos = d.from.clone().lerp(d.over, d.t / d.tIn);
      else if (d.t < d.tIn + hover) pos = d.over.clone();
      else {
        const u = Math.min(1, (d.t - d.tIn - hover) / 12);
        pos = d.over.clone().lerp(d.exit, u * u);
      }
      d.drone.position.copy(pos);
      const look = d.t < d.tIn ? d.over : d.exit;
      d.drone.rotation.y = Math.atan2(look.x - pos.x, look.z - pos.z);
      d.drone.userData.rotors.forEach((r) => (r.rotation.y += dt * 40));
      d.drone.userData.light.material.opacity = (g.now * 2) % 1 < 0.3 ? 1 : 0.2;
      d.drone.visible = d.t < d.tIn + hover + 12;
      if (d.drone.visible) g.audio.updateLoop(d.loop, pos);
      else g.audio.stopLoop(d.loop);
      // Crate: released over the drop point, drifts down under the chute.
      if (!d.released && d.t >= d.tIn + 0.4) {
        d.released = true;
        d.crate.visible = !d.taken;
        d.crate.position.copy(d.p).add(new THREE.Vector3(0, RELEASE, 0));
        g.audio.click();
      }
      if (d.released && !d.landed) {
        d.crate.position.y -= CHUTE * dt;
        d.crate.rotation.y += dt * 0.4;
        if (d.crate.position.y <= d.p.y) {
          d.crate.position.y = d.p.y;
          d.landed = true;
          d.landedT = d.t;
          d.crate.userData.chute.visible = false;
          if (d.mine && !d.taken) {
            g.hud.message('SUPPLY LANDED', 'Walk onto the crate to restock ammo', 2.2);
            g.hud.addMarker(d.p.clone().add(new THREE.Vector3(0, 1.2, 0)), 'SUPPLY', 'hitbody', LIFE);
            d.marker = g.hud.markers[g.hud.markers.length - 1];
          }
        }
      }
      if (d.crate.visible) d.crate.userData.beacon.material.opacity = (g.now * 1.6) % 1 < 0.25 ? 1 : 0.25;
      // Pick-up (your own crate only).
      if (d.landed && d.mine && !d.taken && P.alive && Math.hypot(P.pos.x - d.p.x, P.pos.z - d.p.z) < 2.6 && Math.abs(P.pos.y - d.p.y) < 2.5) {
        d.taken = true;
        d.crate.visible = false;
        if (d.marker) d.marker.age = d.marker.life;
        P.refill();
        g.hud.message('RESTOCKED', 'Both weapons full', 1.8);
        g.audio.beep(null, true);
        g.audio.bolt(0.05);
        if (g.net && g.net.open) g.net.send({ t: 'supplytaken', id: d.id });
      }
      const expired = d.landed && d.t - d.landedT > LIFE;
      if ((d.taken || expired) && !d.drone.visible) {
        this._remove(d);
        this.drops.splice(i, 1);
      } else if (expired) d.crate.visible = false;
    }
  }
}
