// Pollo Hermano (easter egg). With the chicken-suit poncho skin your rifle flings yellow
// chickens instead of bullets. They fly exactly like bullets under the current sniping style;
// a chicken that lands gets up and goes after the enemy (pecking), or brawls with enemy
// chickens. Shoot them (the pistol is ideal). Each player simulates their own chickens and
// sends their positions in the state message; damage goes through the normal hit message.
import * as THREE from 'three';
import { withHaze } from './atmosphere.js';
import { sampleHist } from './killcam.js';
import { NET } from './config.js';

export const CHICK = {
  speed: 5.2, // m/s on the ground
  hp: 30,
  life: 45, // seconds before it wanders off
  max: 8, // live chickens per player
  peckEvery: 0.6,
  peckDmg: 4,
  fightDps: 14, // vs an enemy chicken
  aggro: 18, // m: goes for enemy chickens this close
};

const COL = { body: '#f2c81e', wing: '#e3b414', beak: '#f08a1c', comb: '#d8282a', eye: '#141414', leg: '#f08a1c', tail: '#fbe27a' };

// A chicken, about 0.5 m long, facing -Z, feet at y = 0. opts.plain: unlit-haze materials (first person).
export function buildChicken(opts = {}) {
  const cache = opts.plain ? (buildChicken._plain ||= {}) : (buildChicken._hazed ||= {});
  const m = (hex) => (cache[hex] ||= opts.plain
    ? new THREE.MeshLambertMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.18 })
    : withHaze(new THREE.MeshLambertMaterial({ color: hex }), { key: 'chick' }));
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.27;
  g.add(body);
  const add = (parent, geo, hex, x, y, z) => { const o = new THREE.Mesh(geo, m(hex)); o.position.set(x, y, z); parent.add(o); return o; };
  add(body, new THREE.SphereGeometry(0.15, 14, 10).scale(0.85, 0.85, 1.18), COL.body, 0, 0, 0);
  add(body, new THREE.SphereGeometry(0.11, 12, 8), COL.body, 0, -0.03, -0.1);
  const head = new THREE.Group();
  head.position.set(0, 0.15, -0.15);
  body.add(head);
  add(head, new THREE.SphereGeometry(0.075, 12, 10), COL.body, 0, 0, 0);
  add(head, new THREE.ConeGeometry(0.022, 0.06, 8).rotateX(-Math.PI / 2), COL.beak, 0, -0.01, -0.09);
  for (let i = 0; i < 3; i++) add(head, new THREE.SphereGeometry(0.02 - i * 0.003, 6, 5), COL.comb, 0, 0.075 - i * 0.008, -0.03 + i * 0.03);
  add(head, new THREE.SphereGeometry(0.016, 6, 5).scale(0.8, 1.3, 0.8), COL.comb, 0, -0.045, -0.07);
  for (const s of [-1, 1]) add(head, new THREE.SphereGeometry(0.012, 6, 5), COL.eye, s * 0.05, 0.02, -0.05);
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(s * 0.12, 0.03, 0.0);
    add(w, new THREE.SphereGeometry(0.1, 10, 8).scale(0.28, 0.65, 1.1), COL.wing, s * 0.02, 0, 0.02);
    body.add(w);
    wings.push(w);
  }
  for (let i = -1; i <= 1; i++) {
    const t = add(body, new THREE.ConeGeometry(0.03, 0.14, 6), COL.tail, i * 0.035, 0.1, 0.17);
    t.rotation.x = 0.7;
    t.rotation.z = i * 0.25;
  }
  const legs = [];
  for (const s of [-1, 1]) {
    const L = new THREE.Group();
    L.position.set(s * 0.05, 0.16, 0.02);
    add(L, new THREE.CylinderGeometry(0.009, 0.009, 0.15, 5), COL.leg, 0, -0.075, 0);
    for (const a of [-0.5, 0, 0.5]) {
      const toe = add(L, new THREE.BoxGeometry(0.012, 0.008, 0.06), COL.leg, Math.sin(a) * 0.02, -0.155, -0.025);
      toe.rotation.y = a;
    }
    g.add(L);
    legs.push(L);
  }
  g.userData = { body, head, wings, legs };
  g.traverse((o) => { if (o.isMesh) o.castShadow = !opts.plain; });
  return g;
}

// Flap, run cycle, peck. k: 0..1 how hard it's flapping.
export function animateChicken(c, t, { flap = 0, run = 0, peck = 0 } = {}) {
  const U = c.userData;
  U.wings.forEach((w, i) => (w.rotation.z = (i ? -1 : 1) * (0.15 + flap * (0.6 + 0.6 * Math.sin(t * 38)))));
  U.legs.forEach((L, i) => (L.rotation.x = run * 0.7 * Math.sin(t * 16 + i * Math.PI)));
  U.body.position.y = 0.27 + run * 0.03 * Math.abs(Math.sin(t * 16));
  U.head.rotation.x = peck * 0.9;
}

export class Chickens {
  constructor(game) {
    this.g = game;
    this.mine = [];
    this.theirs = new Map();
    this.dead = new Set(); // enemy chicken ids we've already shot
    this.nextId = 1;
    this.t = 0;
  }

  reset() {
    for (const c of this.mine) this.g.scene.remove(c.mesh);
    for (const c of this.theirs.values()) this.g.scene.remove(c.mesh);
    this.mine.length = 0;
    this.theirs.clear();
    this.dead.clear();
  }

  // A flung chicken landed at p: it gets up, shakes it off and goes hunting.
  spawn(p) {
    const g = this.g;
    if (this.mine.length >= CHICK.max) this._kill(this.mine[0], false);
    const mesh = buildChicken();
    mesh.position.copy(p);
    g.scene.add(mesh);
    const c = { id: 1000000 + this.nextId++ * 2 + g.me, p: p.clone(), yaw: Math.random() * 6, hp: CHICK.hp, life: CHICK.life, peckT: 0.3, mesh, fight: 0, peck: 0, run: 0 };
    this.mine.push(c);
    g.effects.puff(p.clone().add(new THREE.Vector3(0, 0.3, 0)), 'feather', 1.2, 0.9);
    g.audio.chicken(p, 'squawk');
  }

  _kill(c, poof = true) {
    const i = this.mine.indexOf(c);
    if (i >= 0) this.mine.splice(i, 1);
    this.g.scene.remove(c.mesh);
    if (poof) {
      this.g.effects.puff(c.p.clone().add(new THREE.Vector3(0, 0.3, 0)), 'feather', 1.6, 1.4);
      this.g.audio.chicken(c.p, 'squawk');
    }
  }

  update(dt) {
    const g = this.g;
    this.t += dt;
    // Where's the enemy?
    let enemy = null;
    if (g.mode !== 'practice' && g.remoteAlive && g.remoteHist.length) {
      const s = sampleHist(g.remoteHist, g.now - NET.interpDelay);
      if (s) enemy = s.p;
    }
    for (const c of [...this.mine]) {
      c.life -= dt;
      // Target: the nearest enemy chicken close by, else the enemy themselves.
      let tgt = null, td = Infinity, vsChick = false;
      for (const e of this.theirs.values()) {
        if (e.gone) continue;
        const d = Math.hypot(e.p.x - c.p.x, e.p.z - c.p.z);
        if (d < CHICK.aggro && d < td) { td = d; tgt = e.p; vsChick = true; }
      }
      if (!tgt && enemy) { tgt = enemy; td = Math.hypot(enemy.x - c.p.x, enemy.z - c.p.z); }
      c.fight = 0;
      c.run = 0;
      if (tgt) {
        const reach = vsChick ? 0.55 : 0.9;
        if (td > reach) {
          const k = Math.min(1, (CHICK.speed * dt) / td);
          c.p.x += (tgt.x - c.p.x) * k;
          c.p.z += (tgt.z - c.p.z) * k;
          c.run = 1;
        }
        c.yaw = Math.atan2(-(tgt.x - c.p.x), -(tgt.z - c.p.z));
        if (td <= reach + 0.15) {
          if (vsChick) {
            c.fight = 1;
            c.hp -= CHICK.fightDps * dt; // both owners apply this to their own chicken
            if (Math.random() < dt * 3) g.audio.chicken(c.p, 'squawk');
          } else {
            c.peckT -= dt;
            if (c.peckT <= 0) {
              c.peckT = CHICK.peckEvery;
              c.peck = 1;
              g.audio.chicken(c.p, 'peck');
              if (g.net && g.net.open) g.net.send({ t: 'hit', id: c.id, part: 'legs', dmg: CHICK.peckDmg, dist: 0, ip: c.p.toArray().map((x) => Math.round(x * 100) / 100), peck: 1 });
            }
          }
        }
      } else if (Math.random() < dt * 0.2) g.audio.chicken(c.p, 'cluck');
      c.p.y = g.world.groundAt(c.p.x, c.p.z, c.p.y + 1.5, 0.6);
      c.peck = Math.max(0, c.peck - dt * 5);
      c.mesh.position.copy(c.p);
      c.mesh.rotation.y = c.yaw;
      animateChicken(c.mesh, this.t + c.id, { flap: c.fight || (c.life > CHICK.life - 0.6 ? 1 : 0), run: c.run, peck: Math.sin(c.peck * Math.PI) });
      if (c.hp <= 0 || c.life <= 0) this._kill(c, c.hp <= 0);
    }
    // Enemy chickens: follow their owner's updates.
    for (const [id, e] of this.theirs) {
      if (e.gone || this.g.now - e.seen > 0.6) {
        this.g.scene.remove(e.mesh);
        if (!e.gone) this.g.effects.puff(e.p.clone().add(new THREE.Vector3(0, 0.3, 0)), 'feather', 1.4, 1.2);
        this.theirs.delete(id);
        continue;
      }
      e.mesh.position.lerp(e.p, Math.min(1, dt * 10));
      e.mesh.rotation.y = e.yaw;
      const moving = e.mesh.position.distanceTo(e.p) > 0.05;
      animateChicken(e.mesh, this.t + id, { flap: e.fight, run: moving ? 1 : 0, peck: e.fight ? 0 : 0.3 * Math.max(0, Math.sin(this.t * 10 + id)) });
    }
  }

  // Compact state for the 's' message.
  stateField() {
    if (!this.mine.length) return 0;
    const r1 = (x) => Math.round(x * 10) / 10;
    return this.mine.map((c) => [c.id, r1(c.p.x), r1(c.p.y), r1(c.p.z), Math.round(c.yaw * 100) / 100, c.fight ? 1 : 0]);
  }

  onRemote(ck) {
    if (!Array.isArray(ck)) return;
    const now = this.g.now;
    for (const [id, x, y, z, yaw, fight] of ck) {
      if (this.dead.has(id)) continue;
      let e = this.theirs.get(id);
      if (!e) {
        const mesh = buildChicken();
        mesh.position.set(x, y, z);
        this.g.scene.add(mesh);
        e = { id, p: new THREE.Vector3(x, y, z), mesh, yaw, fight: 0, seen: now };
        this.theirs.set(id, e);
      }
      e.p.set(x, y, z);
      e.yaw = yaw;
      e.fight = fight;
      e.seen = now;
    }
  }

  // Enemy chickens are shootable.
  hitCapsules(list) {
    for (const e of this.theirs.values()) {
      if (e.gone) continue;
      const a = e.p.clone().add(new THREE.Vector3(0, 0.28, 0));
      list.push({ part: 'chicken', a, b: a.clone(), r: 0.28, owner: 'chicken', ref: e.id });
    }
  }

  // I shot an enemy chicken.
  shot(id) {
    const e = this.theirs.get(id);
    if (e) e.gone = true;
    this.dead.add(id);
    this.g.audio.chicken(e ? e.p : null, 'squawk');
    if (this.g.net && this.g.net.open) this.g.net.send({ t: 'chickhit', id });
  }

  // The enemy shot one of mine.
  onRemoteHit(m) {
    const c = this.mine.find((x) => x.id === m.id);
    if (c) this._kill(c, true);
  }
}
