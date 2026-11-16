// AI opponent. It plugs into the game exactly where the network peer would: the game
// sends it the same messages it would send a human, and it answers with the same
// messages (state, shots, hits, deaths, uplink captures). That keeps the AI honest and
// means vs-AI matches exercise the real multiplayer code paths.
import * as THREE from 'three';
import { BALLISTICS, DAMAGE, PLAYER, UPLINK, WEAPON } from './config.js';
import { stepProjectile } from './ballistics.js';
import { worldCapsules } from './avatar.js';
import { segSegClosest, clamp } from './util.js';
import { crestAt, DAM_X } from './terrain.js';

export const DIFFICULTY = {
  easy: { name: 'RECRUIT', err: 3.0e-3, react: 3.0, settle: 2.6, detect: 0.45, lead: 0.5, wind: 0.3, prone: false },
  normal: { name: 'VETERAN', err: 1.4e-3, react: 1.8, settle: 1.8, detect: 0.85, lead: 0.85, wind: 0.7, prone: true },
  hard: { name: 'ELITE', err: 0.6e-3, react: 1.1, settle: 1.2, detect: 1.3, lead: 1.0, wind: 0.95, prone: true },
};
const EYE = [PLAYER.eyeStand, PLAYER.eyeCrouch, PLAYER.eyeProne];
const BODY_H = [1.8, 1.25, 0.55];
const ZOOM_GLINT = { 4: 0.35, 8: 0.7, 12: 1 };
const CALM = { at: (t, out) => out.set(0, 0) };

function gauss() {
  return Math.sqrt(-2 * Math.log(Math.random() + 1e-9)) * Math.cos(2 * Math.PI * Math.random());
}

export class BotPeer {
  constructor(game, { difficulty = 'normal', behaviour = 'hostile' } = {}) {
    this.g = game;
    this.isBot = true;
    this.handlers = {};
    this.open = true;
    this.rtt = 0;
    this.outbox = [];
    this.setDifficulty(difficulty);
    this.behaviour = behaviour; // 'hostile' | 'passive' | 'off'
    this.pos = new THREE.Vector3(0, -50, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.stance = 0;
    this.hp = 100;
    this.alive = false;
    this.side = 1;
    this.phase = 'wait';
    this.state = 'idle';
    this.player = null;
    this.playerVel = new THREE.Vector3();
    this.awareness = 0;
    this.known = null; // last known player position
    this.lastSeen = -1e9;
    this.bullets = [];
    this.shotId = 0;
    this.stateT = 0;
    this.percT = 0;
    this.t = 0;
    this.boltT = 0;
    this.shotsHere = 0;
    this.hack = -1;
    this.hackT = 0;
    this.moving = false;
    this.respawnT = -1;
    this.scoped = false;
    this.zoom = 8;
  }

  setDifficulty(key) {
    this.diffKey = DIFFICULTY[key] ? key : 'normal';
    this.d = DIFFICULTY[this.diffKey];
    this.name = `${this.d.name} AI`;
  }

  // ---- Net-like interface -------------------------------------------------
  on(type, fn) {
    this.handlers[type] = fn;
  }
  close() {
    this.open = false;
  }
  _emit(msg) {
    this.outbox.push(msg);
  }

  send(m) {
    switch (m.t) {
      case 'hello':
        this._emit({ t: 'hello', name: this.name });
        break;
      case 's':
        this._onPlayerState(m);
        break;
      case 'round':
        this._onRound(m);
        break;
      case 'sync':
        break;
      case 'shot':
        this._onPlayerShot(m);
        break;
      case 'hit':
        this._onHit(m);
        break;
      case 'died':
        this.state = 'idle';
        this.scoped = false;
        break;
      case 'uav':
        if (this.player && this.player.al && this.behaviour === 'hostile') this._learn(this.player.p, 0.7);
        break;
      case 'reveal':
        if (m.who === 1 && this.player) this._learn(this.player.p, 0.9);
        else if (m.who === 0) this._relocate(true);
        break;
    }
  }

  tick(dt) {
    // Deliver queued messages to the game (one frame of "latency" avoids re-entrancy).
    const out = this.outbox;
    this.outbox = [];
    for (const m of out) {
      const h = this.handlers[m.t];
      if (h) h(m);
    }
    this.t += dt;
    this._update(dt);
    this.stateT -= dt;
    if (this.stateT <= 0) {
      this.stateT = 0.05;
      this._sendState();
    }
  }

  // ---- Game events ---------------------------------------------------------
  _onRound(m) {
    this.phase = m.phase;
    if (m.fresh) {
      this.side = m.sides[1];
      const sp = this.g.world.spawns[String(this.side)][m.spawns[1]];
      this._spawnAt(sp);
    }
    if (m.phase === 'end' || m.phase === 'match') {
      this.state = 'idle';
      this.scoped = false;
    }
  }

  _spawnAt(p) {
    this.pos.copy(p);
    this.hp = 100;
    this.alive = this.behaviour !== 'off';
    this.awareness = 0;
    this.known = null;
    this.lastSeen = -1e9;
    this.bullets.length = 0;
    this.boltT = 0;
    this.shotsHere = 0;
    this.hack = -1;
    this.hackT = 0;
    this.yaw = this.side < 0 ? Math.PI : 0;
    this.pitch = -0.04;
    this.stance = 0;
    this.scoped = false;
    this.wounded = false;
    this._pickNest();
    this.state = 'toNest';
  }

  // Sandbox: (re)spawn on a ridge without a round message.
  sandboxSpawn(side = 1, at = null) {
    this.side = side;
    this.phase = 'sandbox';
    const x = (Math.random() - 0.5) * 900;
    const z = side * (crestAt(x) - 8);
    const p = at || new THREE.Vector3(x, this.g.world.groundAt(x, z, 1e4, 0), z);
    this._spawnAt(p);
    if (at) {
      this.nest = p.clone();
      this.state = 'overwatch';
    }
    this._emit({ t: 'respawn' });
  }

  _onPlayerState(m) {
    const p = new THREE.Vector3(m.p[0], m.p[1], m.p[2]);
    if (this.player) {
      const dtp = Math.max(this.t - this.player.t, 1e-3);
      this.playerVel.lerp(p.clone().sub(this.player.p).divideScalar(dtp), 0.3);
    }
    this.player = { p, yaw: m.y, pitch: m.pi, st: m.st, sc: m.sc, z: m.z, al: m.al, mv: m.mv, t: this.t };
  }

  _onPlayerShot(m) {
    if (!this.alive || this.behaviour !== 'hostile') return;
    const o = new THREE.Vector3(...m.o);
    const eye = this._eye();
    // Muzzle flash: if we can see the shooter, we know exactly where they are.
    const los = this.g.world.raycast(eye, o, true);
    if (!los || los.t > 0.97) this._learn(o, 0.55 + this.d.detect * 0.3);
    // A round cracking past us: we know roughly where it came from.
    const v = new THREE.Vector3(...m.v).normalize();
    const toMe = eye.clone().sub(o);
    const along = toMe.dot(v);
    const miss = toMe.clone().addScaledVector(v, -along).length();
    if (along > 0 && miss < 25) {
      const guess = o.clone().add(new THREE.Vector3((Math.random() - 0.5) * 60, 0, (Math.random() - 0.5) * 60));
      this._learn(guess, 0.35);
      if (Math.random() < 0.35) this.reactRelocate = this.t + this.d.react;
    }
  }

  _onHit(m) {
    if (!this.alive) return;
    this.hp -= m.dmg;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.scoped = false;
      this.state = 'dead';
      this._emit({ t: 'died', id: m.id, part: m.part, dist: m.dist, ip: m.ip });
      this._sendState();
      if (this.phase === 'sandbox') this.respawnT = this.t + 4;
    } else {
      this.wounded = true;
      this._relocate(true);
    }
  }

  _learn(pos, amount) {
    this.awareness = Math.min(1.2, this.awareness + amount);
    this.known = pos.clone();
    this.knownT = this.t;
    if (this.awareness >= 1) this.lastSeen = this.t;
  }

  // ---- Helpers --------------------------------------------------------------
  _eye(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + EYE[this.stance], this.pos.z);
  }

  _pickNest() {
    const forward = Math.random() < 0.3;
    for (let tries = 0; tries < 12; tries++) {
      const x = clamp(this.pos.x + (Math.random() - 0.5) * 500, -620, 620);
      const z = this.side * (crestAt(x) - (forward ? 40 + Math.random() * 40 : 6 + Math.random() * 8));
      const n = this.g.world.terrain.normalAt(x, z);
      if (n.y < 0.8) continue;
      this.nest = new THREE.Vector3(x, this.g.world.heightAt(x, z), z);
      return;
    }
    const x = this.pos.x, z = this.side * (crestAt(x) - 8);
    this.nest = new THREE.Vector3(x, this.g.world.heightAt(x, z), z);
  }

  _relocate(urgent) {
    if (!this.alive) return;
    this._pickNest();
    this.state = 'toNest';
    this.shotsHere = 0;
    this.urgent = urgent;
  }

  // Walk toward a point. Returns true when arrived.
  _walk(target, speed, dt) {
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.8) { this.moving = false; return true; }
    this.moving = true;
    const want = Math.atan2(-dx, -dz);
    this.moveYaw = want;
    const step = Math.min(d, speed * dt);
    const before = this.pos.clone();
    this.pos.x += (dx / d) * step;
    this.pos.z += (dz / d) * step;
    this.g.world.resolveHorizontal(this.pos, PLAYER.radius, BODY_H[this.stance], PLAYER.step);
    this.pos.y = this.g.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6, PLAYER.step);
    // Stuck? Side-step around the obstacle.
    this.progress = (this.progress || 0) * 0.95 + before.distanceTo(this.pos) * 0.05;
    if (this.progress < speed * dt * 0.15) {
      this.stuckT = (this.stuckT || 0) + dt;
      if (this.stuckT > 1.2) {
        this.stuckT = 0;
        const side = Math.random() < 0.5 ? 1 : -1;
        this.detour = this.pos.clone().add(new THREE.Vector3(-dz / d * side * 10, 0, dx / d * side * 10));
      }
    } else this.stuckT = 0;
    return false;
  }

  _turnTo(yaw, pitch, rate, dt) {
    let dy = yaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const step = rate * dt;
    this.yaw += clamp(dy, -step, step);
    this.pitch += clamp(pitch - this.pitch, -step, step);
    return Math.abs(dy) + Math.abs(pitch - this.pitch);
  }

  // Firing solution: solve exactly (drop, lead, wind), then blend in only part of the
  // wind correction depending on skill.
  _solveWith(target, vel, wind) {
    const eye = this._eye();
    const aim = target.clone();
    const p = new THREE.Vector3(), v = new THREE.Vector3();
    for (let iter = 0; iter < 4; iter++) {
      v.copy(aim).sub(eye).normalize().multiplyScalar(BALLISTICS.muzzle);
      p.copy(eye);
      const horiz = Math.hypot(target.x - eye.x, target.z - eye.z);
      let t = 0;
      while (t < 4 && Math.hypot(p.x - eye.x, p.z - eye.z) < horiz) {
        stepProjectile(p, v, 1 / 120, wind, this.g.roundTime + t);
        t += 1 / 120;
      }
      const predicted = target.clone().addScaledVector(vel, t * this.d.lead);
      aim.add(predicted.sub(p));
    }
    const dir = aim.sub(eye).normalize();
    return { yaw: Math.atan2(-dir.x, -dir.z), pitch: Math.asin(clamp(dir.y, -1, 1)) };
  }

  _solve(target, vel) {
    const exact = this._solveWith(target, vel, this.g.wind);
    const calm = this._solveWith(target, vel, CALM);
    let dy = exact.yaw - calm.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    return { yaw: calm.yaw + dy * this.d.wind, pitch: exact.pitch };
  }

  _fire() {
    const eye = this._eye();
    let yaw = this.yaw, pitch = this.pitch;
    const spread = this.d.err * (this.wounded ? 1.6 : 1) * (this.player && this.player.mv ? 1.3 : 1) * (this.stance === 2 ? 1 : 1.4);
    yaw += gauss() * spread;
    pitch += gauss() * spread;
    const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const v = dir.multiplyScalar(BALLISTICS.muzzle);
    const id = ++this.shotId * 2 + 1;
    const wt = this.g.roundTime;
    this.bullets.push({ p: eye.clone(), v: v.clone(), prev: eye.clone(), age: 0, id, wt, o: eye.clone() });
    this._emit({ t: 'shot', id, o: eye.toArray(), v: v.toArray(), wt });
    this.boltT = WEAPON.boltTime + 0.3 + Math.random() * 0.6;
    this.shotsHere++;
  }

  _updateBullets(dt) {
    const P = this.player;
    const caps = P && P.al ? worldCapsules(P.p, P.yaw, P.st) : [];
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      let dead = false, rem = dt;
      while (rem > 1e-6 && !dead) {
        const h = Math.min(BALLISTICS.substep * 2, rem);
        rem -= h;
        b.prev.copy(b.p);
        stepProjectile(b.p, b.v, h, this.g.wind, b.wt + b.age);
        b.age += h;
        let hit = null;
        for (const c of caps) {
          const r = segSegClosest(b.prev, b.p, c.a, c.b);
          if (r.d2 <= c.r * c.r && (!hit || r.s < hit.s)) hit = { s: r.s, c };
        }
        const wh = this.g.world.raycast(b.prev, b.p);
        if (hit && (!wh || hit.s <= wh.t)) {
          const ip = b.prev.clone().lerp(b.p, hit.s);
          const part = hit.c.part;
          const dmg = DAMAGE[part === 'legs' ? 'limb' : part];
          this._emit({ t: 'hit', id: b.id, part, dmg, dist: Math.round(b.o.distanceTo(ip)), ip: ip.toArray() });
          dead = true;
        } else if (wh) dead = true;
        if (b.age > BALLISTICS.maxLife) dead = true;
      }
      if (dead) {
        this.bullets.splice(i, 1);
        (this.impacts ||= []).push(b.p.clone());
        if (this.impacts.length > 10) this.impacts.shift();
      }
    }
  }

  // ---- Perception ----------------------------------------------------------
  _perceive(step) {
    const P = this.player;
    if (!P || !P.al) return;
    const eye = this._eye();
    const head = P.p.clone();
    head.y += BODY_H[P.st] * 0.75;
    const dist = eye.distanceTo(head);
    const los = this.g.world.raycast(eye, head, true);
    const visible = !los || los.t > 0.985;
    if (!visible) {
      this.awareness = Math.max(0, this.awareness - step * 0.08);
      return;
    }
    const look = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const to = head.clone().sub(eye).setY(0).normalize();
    const inView = look.dot(to) > Math.cos(THREE.MathUtils.degToRad(this.scoped ? 35 : 60));
    let rate = 0.35 * this.d.detect;
    rate *= [1, 0.6, 0.28][P.st];
    if (P.mv) rate *= 2.2;
    rate *= clamp(260 / dist, 0.18, 3);
    // Their scope glint, if they're glassing us.
    if (P.sc) {
      const aim = new THREE.Vector3(-Math.sin(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch), -Math.cos(P.yaw) * Math.cos(P.pitch));
      const toBot = eye.clone().sub(head).normalize();
      const facing = Math.pow(Math.max(0, aim.dot(toBot)), 70);
      rate += facing * (ZOOM_GLINT[P.z] || 0.5) * 1.6 * this.d.detect;
    }
    if (!inView) rate *= 0.2;
    this.awareness = Math.min(1.2, this.awareness + rate * step);
    if (this.awareness >= 1) {
      this.known = P.p.clone();
      this.knownT = this.lastSeen = this.t;
    }
  }

  // ---- Brain ---------------------------------------------------------------
  _update(dt) {
    if (this.respawnT > 0 && this.t > this.respawnT) {
      this.respawnT = -1;
      if (this.behaviour !== 'off') this.sandboxSpawn(this.side);
    }
    this._updateBullets(dt);
    this.boltT = Math.max(0, this.boltT - dt);
    if (!this.alive) { this.moving = false; return; }
    const live = this.phase === 'live' || this.phase === 'sandbox';
    const hostile = this.behaviour === 'hostile' && live && (!this.player || this.player.al);
    this.percT -= dt;
    if (hostile && this.percT <= 0) {
      this.percT = 0.2;
      this._perceive(0.2);
    }
    if (this.reactRelocate && this.t > this.reactRelocate) {
      this.reactRelocate = 0;
      this._relocate(true);
    }
    const engaged = hostile && this.awareness >= 1 && this.t - this.lastSeen < 2.5;
    if (engaged && this.state !== 'engage' && this.state !== 'toNest') {
      this.state = 'engage';
      this.settleT = this.d.settle + this.d.react * 0.5;
    }
    // Uplink decisions.
    if (live && this.phase !== 'sandbox' && hostile && (this.state === 'overwatch' || this.state === 'toNest') && !this.urgent) {
      const ownMe = this.g.uplinkState.filter((u) => u.owner === 1).length;
      const ownThem = this.g.uplinkState.filter((u) => u.owner === 0).length;
      const late = this.g.phaseT < 70 && ownThem >= ownMe;
      const bored = this.t - this.lastSeen > 55 && Math.random() < dt * 0.02;
      if (late || bored) {
        const i = this._pickUplink();
        if (i >= 0) { this.hack = i; this.state = 'toUplink'; this.waypoint = this._uplinkWaypoint(i); }
      }
    }
    switch (this.state) {
      case 'toNest': {
        const target = this.detour || this.nest;
        this.stance = this.urgent ? 1 : 0;
        if (this.urgent && this.wounded) this.stance = 1;
        this.scoped = false;
        const arrived = this._walk(target, this.urgent ? PLAYER.crouch * 1.6 : PLAYER.walk, dt);
        if (this.detour && arrived) this.detour = null;
        else if (arrived) {
          this.state = 'overwatch';
          this.urgent = false;
          this.scanBase = this.side < 0 ? Math.PI : 0;
          this.scanPhase = Math.random() * 10;
        }
        this._turnTo(this.moveYaw ?? this.yaw, -0.03, 3, dt);
        break;
      }
      case 'overwatch': {
        this.moving = false;
        this.stance = this.d.prone ? 2 : 1;
        this.scoped = this.behaviour !== 'off';
        this.zoom = 8;
        // Sweep the far ridge and valley; favour the last known position.
        let yaw = this.scanBase + Math.sin(this.t * 0.18 + this.scanPhase) * 0.85;
        let pitch = -0.08 + Math.sin(this.t * 0.11 + this.scanPhase) * 0.05;
        if (this.known && this.t - Math.max(this.lastSeen, this.knownT || -1e9) < 25 && hostile) {
          const e = this._eye();
          const d = this.known.clone().sub(e);
          yaw = Math.atan2(-d.x, -d.z) + Math.sin(this.t * 0.6) * 0.12;
          pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
        }
        this._turnTo(yaw, pitch, 0.6, dt);
        if (this.behaviour === 'passive' && Math.random() < dt * 0.02) this._relocate(false);
        break;
      }
      case 'engage': {
        this.moving = false;
        this.stance = this.d.prone ? 2 : 1;
        this.scoped = true;
        this.zoom = 12;
        if (!engaged) {
          if (this.t - this.lastSeen > 6) this.state = 'overwatch';
          break;
        }
        const P = this.player;
        const target = P.p.clone();
        target.y += BODY_H[P.st] * (P.st === 2 ? 0.4 : 0.62);
        const sol = this._solve(target, this.playerVel);
        const err = this._turnTo(sol.yaw, sol.pitch, 1.4, dt);
        this.settleT -= dt;
        if (err < 0.004 && this.settleT <= 0 && this.boltT <= 0) {
          // Never fire into the dirt in front of us: if the line is blocked, move.
          const blocked = this.g.world.raycast(this._eye(), target, true);
          if (blocked && blocked.t < 0.97) {
            this.awareness = 0.6;
            this._relocate(true);
            break;
          }
          this._fire();
          this.settleT = 0.5 + Math.random() * 0.8;
          if (this.shotsHere >= 2 + Math.floor(Math.random() * 2)) this.reactRelocate = this.t + 1.2;
        }
        break;
      }
      case 'toUplink': {
        const u = this.g.world.uplinks[this.hack];
        if (this.g.uplinkState[this.hack].owner === 1) { this.hack = -1; this._relocate(false); break; }
        this.scoped = false;
        this.stance = 0;
        const target = this.detour || this.waypoint || u.pos;
        const arrived = this._walk(target, PLAYER.sprint * 0.85, dt);
        this._turnTo(this.moveYaw ?? this.yaw, -0.05, 3, dt);
        if (arrived) {
          if (this.detour) this.detour = null;
          else if (this.waypoint) this.waypoint = null;
          else { this.state = 'hacking'; this.hackT = 0; }
        }
        break;
      }
      case 'hacking': {
        this.moving = false;
        this.stance = 1;
        this.scoped = false;
        this.hackT += dt;
        this._turnTo(this.side < 0 ? 0 : Math.PI, 0, 1, dt);
        if (this.hackT >= UPLINK.hackTime) {
          this._emit({ t: 'cap', i: this.hack });
          this.hack = -1;
          this._relocate(true);
        }
        break;
      }
      default:
        this.moving = false;
    }
  }

  _pickUplink() {
    let best = -1, bd = Infinity;
    this.g.world.uplinks.forEach((u, i) => {
      if (this.g.uplinkState[i].owner === 1) return;
      const d = u.pos.distanceTo(this.pos);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  _uplinkWaypoint(i) {
    // The dam uplink is reached from the dam's end on our own side.
    if (i === 1) return new THREE.Vector3(DAM_X, 42, this.side * 222);
    return null;
  }

  _sendState() {
    const hk = this.state === 'hacking' ? this.hack : -1;
    this._emitState({
      t: 's',
      p: [this.pos.x, this.pos.y, this.pos.z],
      y: this.yaw,
      pi: this.pitch,
      st: this.stance,
      sc: this.scoped && this.alive ? 1 : 0,
      z: this.zoom,
      hk,
      hp: Math.max(0, Math.round(this.hp)),
      al: this.alive ? 1 : 0,
      mv: this.moving ? 1 : 0,
    });
  }

  _emitState(m) {
    const h = this.handlers.s;
    if (h) h(m);
  }

  setBehaviour(b) {
    this.behaviour = b;
    if (b === 'off') {
      this.alive = false;
      this.scoped = false;
      this._sendState();
    } else if (!this.alive) {
      this.sandboxSpawn(this.side);
    } else if (b === 'passive') {
      this.awareness = 0;
      if (this.state === 'engage') this.state = 'overwatch';
    }
  }
}
