// Loadout tools: spotting drone, recon dart, thermal poncho, suppressor, anti-glint cover,
// UAV jammer, smoke grenades and decoys. Everything here is symmetric between the two
// players; objects are tagged `mine` so the same code renders both sides.
import * as THREE from 'three';
import { BALLISTICS, PLAYER, WEAPON } from './config.js';
import { Avatar, worldCapsules, scopePoint, LENS_COLORS, DEFAULT_LENS, THEMES, HATS, EYEWEAR } from './avatar.js';
import { puffTexture, glowTexture, glintTexture } from './textures.js';
import { screenSprite } from './effects.js';
import { clamp, smoothstep, segSegClosest } from './util.js';
import { sampleHist } from './killcam.js';
import { RIFLES } from './weapons.js';

export const TOOLS = {
  drone: { slot: 'scout', name: 'Spotting drone', short: 'DRONE', charges: 1, desc: 'Fly a thermal quadcopter for 25 s, up to 500 m out. Loud, and it can be shot down. Your body stays put while you fly.' },
  hunter: { slot: 'scout', name: 'Hunter drone', short: 'HUNTER', charges: 1, desc: 'Fixed-wing loitering drone. Flies where you aim (up to ~450 m), circles, and locks onto the enemy when it sees them — marking them for you every second. 40 s. Audible, visible, shootable; smoke breaks its lock. Against a thermal poncho it has to get close and only gives rough marks every 3 s.' },
  dart: { slot: 'scout', name: 'Recon dart', short: 'DART', charges: 2, desc: 'Fire a sensor up to ~400 m. For 40 s it pings any enemy moving within 45 m. It blinks and beeps, and can be shot out.' },
  poncho: { slot: 'stealth', name: 'Thermal poncho', short: 'PONCHO', desc: 'Invisible to thermal drones; the hunter drone has to get close and only gets rough fixes. You move 20% slower and can\'t sprint.' },
  suppressor: { slot: 'stealth', name: 'Suppressor', short: 'SUPPRESSOR', desc: 'No muzzle flash or dust, much quieter report. Bullets 12% slower: more drop and wind drift.' },
  killflash: { slot: 'stealth', name: 'Anti-glint cover', short: 'ANTI-GLINT', desc: 'Your scope never glints. The scope view is narrower and darker.' },
  jammer: { slot: 'stealth', name: 'UAV jammer', short: 'JAMMER', desc: 'Hides you from the next UAV sweep (one use per round). The enemy sees "jammed".' },
  smoke: { slot: 'tactical', name: 'Smoke grenades', short: 'SMOKE', charges: 2, desc: 'Throw ~35 m for a 25 s screen. Blocks sight and glint, not bullets.' },
  decoy: { slot: 'tactical', name: 'Decoy', short: 'DECOY', charges: 1, desc: 'A fake prone sniper with a fake glint, placed where you aim (up to 60 m). When it\'s shot, you see where the shot came from.' },
};
export const SLOTS = [
  { key: 'scout', label: 'Scout', keyHint: 'T' },
  { key: 'stealth', label: 'Stealth', keyHint: 'passive' },
  { key: 'tactical', label: 'Tactical', keyHint: 'G' },
];
export const DEFAULT_LOADOUT = { rifle: 'mk22', scout: 'hunter', stealth: 'poncho', tactical: 'smoke' };

export function validLoadout(lo) {
  const out = { ...DEFAULT_LOADOUT };
  if (lo && RIFLES.includes(lo.rifle)) out.rifle = lo.rifle;
  out.bolt = lo && lo.bolt === 'straight' ? 'straight' : 'standard';
  out.outfit = lo && lo.outfit === 'ghillie' ? 'ghillie' : 'wraith';
  out.lens = lo && /^#[0-9a-f]{6}$/i.test(lo.lens || '') ? lo.lens.toLowerCase() : DEFAULT_LENS;
  out.theme = lo && THEMES[lo.theme] ? lo.theme : '';
  out.hat = lo && HATS[lo.hat] ? lo.hat : '';
  out.vest = lo && lo.vest === 'rig' ? 'rig' : 'plate';
  out.eyes = lo && EYEWEAR[lo.eyes] ? lo.eyes : '';
  if (lo) for (const s of SLOTS) if (TOOLS[lo[s.key]] && TOOLS[lo[s.key]].slot === s.key) out[s.key] = lo[s.key];
  return out;
}

export function randomLoadout() {
  const pick = (slot) => {
    const keys = Object.keys(TOOLS).filter((k) => TOOLS[k].slot === slot);
    return keys[Math.floor(Math.random() * keys.length)];
  };
  const any = (o) => (Math.random() < 0.5 ? '' : Object.keys(o)[Math.floor(Math.random() * Object.keys(o).length)]);
  return { vest: Math.random() < 0.5 ? 'rig' : 'plate', hat: any(HATS), eyes: any(EYEWEAR), theme: Math.random() < 0.4 ? '' : Object.keys(THEMES)[Math.floor(Math.random() * Object.keys(THEMES).length)], lens: LENS_COLORS[Math.floor(Math.random() * (LENS_COLORS.length - 1))], outfit: Math.random() < 0.5 ? 'wraith' : 'ghillie', rifle: RIFLES[Math.floor(Math.random() * RIFLES.length)], scout: pick('scout'), stealth: pick('stealth'), tactical: pick('tactical') };
}

// Fixed-wing loitering drone flight + search, shared by players and the AI.
export class HunterFlight {
  constructor(world, pos, heading, dist) {
    this.w = world;
    this.pos = pos.clone();
    this.heading = heading;
    this.dist = dist;
    this.travel = 0;
    this.phase = 'cruise';
    this.center = null;
    this.ang = 0;
    this.life = 40;
    this.locked = false;
    this.lostT = 0;
    this.searchT = 0;
    this.target = null;
    this.speed = 34;
    this.bank = 0;
  }

  // seek(pos) returns the enemy's position if the drone can see them right now, else null.
  update(dt, seek) {
    this.life -= dt;
    const R = 60;
    const prevHeading = this.heading;
    if (this.phase === 'cruise') {
      const dx = -Math.sin(this.heading), dz = -Math.cos(this.heading);
      this.pos.x += dx * this.speed * dt;
      this.pos.z += dz * this.speed * dt;
      this.travel += this.speed * dt;
      if (this.travel >= this.dist || Math.abs(this.pos.x) > 900 || Math.abs(this.pos.z) > 650) {
        this.phase = 'loiter';
        // Circle centre sits off the left wing so the turn starts smoothly.
        this.center = new THREE.Vector3(this.pos.x - Math.cos(this.heading) * R, 0, this.pos.z + Math.sin(this.heading) * R);
        this.ang = Math.atan2(this.pos.z - this.center.z, this.pos.x - this.center.x);
      }
    } else {
      if (this.locked && this.target) this.center.lerp(new THREE.Vector3(this.target.x, 0, this.target.z), Math.min(1, dt * 0.9));
      this.center.x = clamp(this.center.x, -900, 900);
      this.center.z = clamp(this.center.z, -650, 650);
      this.ang += (this.speed / R) * dt;
      const tx = this.center.x + Math.cos(this.ang) * R, tz = this.center.z + Math.sin(this.ang) * R;
      this.heading = Math.atan2(-(tx - this.pos.x), -(tz - this.pos.z));
      this.pos.x += (tx - this.pos.x) * Math.min(1, dt * 3);
      this.pos.z += (tz - this.pos.z) * Math.min(1, dt * 3);
    }
    const alt = this.w.heightAt(this.pos.x, this.pos.z) + 70;
    this.pos.y += (alt - this.pos.y) * Math.min(1, dt * 0.8);
    let dh = this.heading - prevHeading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.bank += (clamp(dh / Math.max(dt, 1e-3) * 0.6, -0.7, 0.7) - this.bank) * Math.min(1, dt * 4);
    this.searchT -= dt;
    let event = null;
    if (this.searchT <= 0) {
      this.searchT = 0.4;
      const t = seek(this.pos);
      if (t) {
        if (!this.locked) event = 'lock';
        this.locked = true;
        this.lostT = 0;
        this.target = t.clone();
        if (this.phase === 'cruise') {
          this.phase = 'loiter';
          this.center = new THREE.Vector3(t.x, 0, t.z);
          this.ang = Math.atan2(this.pos.z - t.z, this.pos.x - t.x);
        }
      } else if (this.locked) {
        this.lostT += 0.4;
        if (this.lostT > 4) { this.locked = false; event = 'lost'; }
      }
    }
    return event;
  }
}

// Visual model (fixed wing, pusher prop) for either side.
export function buildHunterModel(accent) {
  const g = new THREE.Group();
  const m = new THREE.MeshLambertMaterial({ color: 0x3a3c40 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 1.7, 8).rotateX(Math.PI / 2), m);
  g.add(body);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), m);
  nose.position.z = -0.85;
  g.add(nose);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.04, 0.32), m);
  wing.position.set(0, 0.05, -0.1);
  g.add(wing);
  for (const s of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.03, 0.22), m);
    tail.position.set(s * 0.22, 0.14, 0.72);
    tail.rotation.z = s * 0.6;
    g.add(tail);
  }
  const prop = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.01, 14).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x777780, transparent: true, opacity: 0.35 }));
  prop.position.z = 0.9;
  g.add(prop);
  const lights = [];
  for (const [c, x] of [[0xff3020, -1.4], [0x30ff60, 1.4], [accent, 0]]) {
    const l = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    l.position.set(x, 0.05, x ? -0.1 : 0.3);
    l.scale.setScalar(1.2);
    g.add(l);
    lights.push(l);
  }
  g.rotation.order = 'YXZ';
  g.userData.lights = lights;
  g.visible = false;
  return g;
}

export const SUPPRESSED_MUZZLE = Math.round(BALLISTICS.muzzle * 0.88);
const DRONE = { battery: 25, range: 500, speed: 16, fast: 32 };
const DART = { speed: 190, radius: 45, life: 40, pingEvery: 1.5 };
const SMOKE = { life: 25, radius: 8.5 };
// Hunter drone vs the thermal poncho: optics only, so it must be close and the fix is rough.
export const HUNTER_PONCHO = { range: 70, rangeMoving: 110, markEvery: 3, jitter: 8 };
export function hunterRange(poncho, moving) {
  return poncho ? (moving ? HUNTER_PONCHO.rangeMoving : HUNTER_PONCHO.range) : 160;
}

const hotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(6, 5, 4) });
export function setThermal(root, on) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (on) {
      if (!o.userData.coolMat) o.userData.coolMat = o.material;
      o.material = hotMat;
    } else if (o.userData.coolMat) {
      o.material = o.userData.coolMat;
    }
  });
}

function segSphere(a, b, c, r) {
  const r2 = segSegClosest(a, b, c, c);
  return r2.d2 <= r * r;
}

export class ToolSystem {
  constructor(game) {
    this.g = game;
    this.scene = game.scene;
    this.smokes = [];
    this.decoys = [];
    this.darts = [];
    this.flying = []; // grenades / darts in flight (mine)
    this.drone = null; // my drone
    this.remote = { kf: 0, tp: 0, lk: 0, jm: 0, dr: null, hd: null };
    this.nextId = 1;
    this.loadout = validLoadout(game.settings && game.settings.loadout);
    game.player.rifleKey = this.loadout.rifle;
    game.player.vest = this.loadout.vest;
    game.player.equip();
    game.player.straightPull = this.loadout.bolt === 'straight';
    this._buildRemoteDrone();
    this._buildPredator();
    this.hunterMesh = buildHunterModel(0x62d9e8);
    this.remoteHunterMesh = buildHunterModel(0xff5d55);
    this.scene.add(this.hunterMesh, this.remoteHunterMesh);
    this.hunter = null;
    this.feedWindow = 0;
    this.feed = 0;
    this.reset();
  }

  // ---- Loadout ------------------------------------------------------------
  setLoadout(lo) {
    this.loadout = validLoadout(lo);
    this.g.player.rifleKey = this.loadout.rifle;
    this.g.player.vest = this.loadout.vest;
    this.g.player.equip();
    this.g.player.straightPull = this.loadout.bolt === 'straight';
    this.resetMine();
  }

  // Outfit + poncho, as Avatar.setLook wants them.
  myLook() {
    const lo = this.loadout;
    return { outfit: lo.outfit, poncho: this.has('poncho'), lens: lo.lens, theme: lo.theme, hat: lo.hat, eyes: lo.eyes, vest: lo.vest, kit: { scout: lo.scout, stealth: lo.stealth, tactical: lo.tactical } };
  }

  remoteLook() {
    const r = this.remote;
    return { outfit: r.lk ? 'wraith' : 'ghillie', poncho: !!r.tp, lens: r.lc, theme: r.th, hat: r.hw, eyes: r.ew, vest: r.vs, kit: r.kit || { stealth: r.tp ? 'poncho' : '' } };
  }

  has(tool) {
    return this.loadout.scout === tool || this.loadout.stealth === tool || this.loadout.tactical === tool;
  }

  resetMine() {
    this.charges = {};
    for (const s of SLOTS) {
      const t = this.loadout[s.key];
      this.charges[t] = TOOLS[t].charges ?? 1;
    }
    this.jammer = this.has('jammer');
    if (this.drone) this.endDrone('');
    if (this.hunter) this.endHunter('');
    this._applyPlayerMods();
  }

  reset() {
    for (const s of this.smokes) s.sprites.forEach((sp) => this.scene.remove(sp));
    for (const d of this.decoys) this._removeDecoy(d);
    for (const d of this.darts) this.scene.remove(d.group);
    this.smokes.length = 0;
    this.decoys.length = 0;
    this.darts.length = 0;
    this.flying.length = 0;
    this.resetMine();
  }

  _applyPlayerMods() {
    const P = this.g.player;
    P.suppressed = this.has('suppressor');
    P.speedMul = this.has('poncho') ? 0.8 : 1;
    P.noSprint = this.has('poncho');
    P.killflash = this.has('killflash');
  }

  get muzzle() {
    return this.has('suppressor') ? SUPPRESSED_MUZZLE : BALLISTICS.muzzle;
  }

  // Fields merged into every state message.
  stateFields() {
    const d = this.drone;
    return {
      kf: this.has('killflash') ? 1 : 0,
      tp: this.has('poncho') ? 1 : 0,
      lk: this.loadout.outfit === 'wraith' ? 1 : 0,
      lc: this.loadout.lens,
      th: this.loadout.theme,
      hw: this.loadout.hat,
      vs: this.loadout.vest,
      ew: this.loadout.eyes,
      ko: `${this.loadout.scout},${this.loadout.stealth},${this.loadout.tactical}`,
      jm: this.jammer ? 1 : 0,
      dr: d ? [Math.round(d.pos.x * 10) / 10, Math.round(d.pos.y * 10) / 10, Math.round(d.pos.z * 10) / 10] : 0,
      hd: this.hunter ? [Math.round(this.hunter.pos.x * 10) / 10, Math.round(this.hunter.pos.y * 10) / 10, Math.round(this.hunter.pos.z * 10) / 10, Math.round(this.hunter.heading * 100) / 100, this.hunter.locked ? 1 : 0, Math.round(this.hunter.bank * 100) / 100] : 0,
    };
  }

  onRemoteState(m) {
    this.remote.kf = m.kf | 0;
    this.remote.tp = m.tp | 0;
    this.remote.lk = m.lk | 0;
    if (typeof m.lc === 'string') this.remote.lc = m.lc;
    if (typeof m.th === 'string') this.remote.th = m.th;
    if (typeof m.hw === 'string') this.remote.hw = m.hw;
    if (typeof m.vs === 'string') this.remote.vs = m.vs;
    if (typeof m.ew === 'string') this.remote.ew = m.ew;
    if (typeof m.ko === 'string') {
      const [scout, stealth, tactical] = m.ko.split(',');
      this.remote.kit = { scout, stealth, tactical };
    }
    this.remote.jm = m.jm | 0;
    this.remote.dr = Array.isArray(m.dr) ? new THREE.Vector3(m.dr[0], m.dr[1], m.dr[2]) : null;
    this.remote.hd = Array.isArray(m.hd) ? { pos: new THREE.Vector3(m.hd[0], m.hd[1], m.hd[2]), heading: m.hd[3], locked: !!m.hd[4], bank: m.hd[5] || 0 } : null;
  }

  // ---- Activation -----------------------------------------------------------
  useScout() {
    const t = this.loadout.scout;
    if (t === 'drone') {
      if (this.drone) return this.endDrone('DRONE RECALLED');
      if (!this.charges.drone) return this._empty('No drone left this round');
      this.charges.drone--;
      this._startDrone();
    } else if (t === 'hunter') {
      if (this.hunter) return this._empty('Hunter already airborne');
      if (!this.charges.hunter) return this._empty('No hunter drone left');
      this.charges.hunter--;
      const P = this.g.player;
      const o = P.eyePos(new THREE.Vector3());
      const d = P.aimDir(new THREE.Vector3());
      const hit = this.g.world.raycast(o, o.clone().addScaledVector(d, 600), true);
      const dist = clamp(hit ? hit.t * 600 : 450, 250, 450);
      this.hunter = new HunterFlight(this.g.world, o.add(new THREE.Vector3(0, 2, 0)), P.yaw, dist);
      this.markT = 0;
      this.g.audio.startLoop('myhunter', this.hunter.pos, 'drone', 0.18);
      this.g.hud.message('HUNTER LAUNCHED', `Flying ${Math.round(dist)} m out, then hunting`, 2.2);
    } else if (t === 'dart') {
      if (!this.charges.dart) return this._empty('No darts left');
      this.charges.dart--;
      const P = this.g.player;
      const o = P.eyePos(new THREE.Vector3());
      const v = P.aimDir(new THREE.Vector3()).multiplyScalar(DART.speed);
      this.flying.push({ kind: 'dart', p: o, v, prev: o.clone(), age: 0 });
      this.g.audio.click();
      this.g.hud.message('', 'Recon dart away', 1.2);
    }
  }

  useTactical() {
    const t = this.loadout.tactical;
    const P = this.g.player;
    if (t === 'smoke') {
      if (!this.charges.smoke) return this._empty('No smoke left');
      this.charges.smoke--;
      const o = P.eyePos(new THREE.Vector3());
      const dir = P.aimDir(new THREE.Vector3());
      const v = dir.multiplyScalar(19).add(new THREE.Vector3(0, 5, 0));
      this.flying.push({ kind: 'smoke', p: o, v, prev: o.clone(), age: 0 });
      this.g.audio.click();
    } else if (t === 'decoy') {
      if (!this.charges.decoy) return this._empty('No decoy left');
      const o = P.eyePos(new THREE.Vector3());
      const d = P.aimDir(new THREE.Vector3());
      const hit = this.g.world.raycast(o, o.clone().addScaledVector(d, 60), true);
      let p;
      if (hit && hit.normal.y > 0.6) p = hit.point.clone();
      else p = P.pos.clone().add(new THREE.Vector3(-Math.sin(P.yaw) * 2, 0, -Math.cos(P.yaw) * 2));
      p.y = this.g.world.groundAt(p.x, p.z, p.y + 1, 0.6);
      this.charges.decoy--;
      const id = this._id();
      this._spawnDecoy({ id, p, yaw: P.yaw, mine: true });
      this.g.net && this.g.net.send({ t: 'decoy', id, p: p.toArray(), yaw: P.yaw });
      this.g.hud.message('', 'Decoy placed', 1.2);
    }
  }

  _empty(msg) {
    this.g.audio.click();
    this.g.hud.message('', msg, 1.2);
  }

  _id() {
    return this.nextId++ * 2 + this.g.me;
  }

  // ---- Network messages -------------------------------------------------------
  bindNet(n) {
    n.on('smoke', (m) => this._spawnSmoke(new THREE.Vector3(...m.p), false));
    n.on('decoy', (m) => this._spawnDecoy({ id: m.id, p: new THREE.Vector3(...m.p), yaw: m.yaw, mine: false }));
    n.on('dart', (m) => this._spawnDart({ id: m.id, p: new THREE.Vector3(...m.p), mine: false }));
    n.on('decoyhit', (m) => {
      const d = this.decoys.find((x) => x.id === m.id);
      if (!d) return;
      this._removeDecoy(d);
      if (d.mine) {
        const o = new THREE.Vector3(...m.o);
        this.g.hud.message('DECOY HIT', 'The shot came from the marked position', 3);
        this.g.hud.addMarker(o.clone().add(new THREE.Vector3(0, 1, 0)), 'SHOT FROM', 'enemy', 8);
        this.g.audio.ping();
      }
    });
    n.on('darthit', (m) => {
      const d = this.darts.find((x) => x.id === m.id);
      if (d) this._removeDart(d, d.mine ? 'Your recon dart was shot out' : '');
    });
    n.on('dronehit', () => this.endDrone('DRONE SHOT DOWN'));
    n.on('hunterhit', () => this.endHunter('HUNTER SHOT DOWN'));
  }

  // ---- Smoke ------------------------------------------------------------------
  _spawnSmoke(p, mine) {
    const sprites = [], offs = [];
    for (let i = 0; i < 16; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture(), color: 0x8c8796, transparent: true, depthWrite: false, opacity: 0 }));
      const a = Math.random() * Math.PI * 2, r = Math.random() * 6.5;
      offs.push(new THREE.Vector3(Math.cos(a) * r, 1 + Math.random() * 6, Math.sin(a) * r));
      sp.scale.setScalar(8 + Math.random() * 6);
      sp.material.rotation = Math.random() * 6;
      sp.position.copy(p);
      this.scene.add(sp);
      sprites.push(sp);
    }
    this.smokes.push({ p: p.clone(), age: 0, sprites, offs, alpha: 0, drift: new THREE.Vector3() });
    if (mine) this.g.net && this.g.net.send({ t: 'smoke', p: p.toArray() });
    this.g.audio.impact(p, 'dirt', p.distanceTo(this.g.camera.position) / 343);
  }

  // True if the segment a-b passes through an active smoke screen.
  smokeBlocks(a, b) {
    for (const s of this.smokes) {
      if (s.alpha < 0.5) continue;
      const c = s.p.clone().add(s.drift).add(new THREE.Vector3(0, 4, 0));
      if (segSphere(a, b, c, SMOKE.radius)) return true;
    }
    return false;
  }

  // ---- Decoys -------------------------------------------------------------------
  _spawnDecoy({ id, p, yaw, mine }) {
    const accent = mine ? (this.g.me === 0 ? '#e0a040' : '#40c8d8') : this.g.me === 0 ? '#40c8d8' : '#e0a040';
    const av = new Avatar(accent, 31 + id);
    av.setLook(mine ? this.myLook() : this.remoteLook());
    av.update(0, { p, yaw, pitch: -0.03, st: 2, moving: false });
    this.scene.add(av.root);
    const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTexture(), color: 0xfff4e0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    glint.visible = false;
    this.scene.add(glint);
    this.decoys.push({ id, p: p.clone(), yaw, mine, av, glint, phase: Math.random() * 6 });
  }

  _removeDecoy(d) {
    this.scene.remove(d.av.root, d.glint);
    const i = this.decoys.indexOf(d);
    if (i >= 0) this.decoys.splice(i, 1);
  }

  decoyCapsules(d) {
    return worldCapsules(d.p, d.yaw, 2);
  }

  // ---- Darts ------------------------------------------------------------------------
  _spawnDart({ id, p, mine }) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 6), new THREE.MeshLambertMaterial({ color: 0x2a2a30 }));
    body.position.y = 0.2;
    group.add(body);
    const light = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff3a30, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    light.position.y = 0.46;
    light.scale.setScalar(1.6);
    group.add(light);
    group.position.copy(p);
    this.scene.add(group);
    this.darts.push({ id, p: p.clone(), mine, group, light, age: 0, pingT: 0, beepT: 0 });
  }

  _removeDart(d, msg) {
    this.scene.remove(d.group);
    const i = this.darts.indexOf(d);
    if (i >= 0) this.darts.splice(i, 1);
    if (msg) this.g.hud.message('', msg, 2);
  }

  // ---- Drone ----------------------------------------------------------------------
  _startDrone() {
    const P = this.g.player;
    const pos = P.eyePos(new THREE.Vector3()).add(new THREE.Vector3(0, 3, 0));
    this.drone = { pos, yaw: P.yaw, pitch: -0.35, battery: DRONE.battery, zoom: 1 };
    this.g.input.resetScope();
    this.g.hud.message('DRONE UP', 'Thermal view · WASD fly · Space/X altitude · T return', 2.5);
    this.g.audio.startLoop('mydrone', pos, 'drone', 0.25);
  }

  endHunter(msg) {
    if (!this.hunter) return;
    this.hunter = null;
    this.hunterMesh.visible = false;
    this.g.audio.stopLoop('myhunter');
    if (msg) this.g.hud.message(msg, '', 2);
  }

  endDrone(msg) {
    if (!this.drone) return;
    this.drone = null;
    this.g.audio.stopLoop('mydrone');
    if (msg) this.g.hud.message(msg, '', 2);
  }

  updateDrone(dt, a) {
    const d = this.drone, g = this.g;
    const fovScale = d.zoom > 1 ? 0.35 : 1;
    const sens = 0.0022 * fovScale;
    d.yaw -= a.lookX * sens;
    d.pitch = clamp(d.pitch - a.lookY * sens, -1.4, 0.6);
    d.zoom = a.scope ? 3 : 1;
    const fast = g.input.held('ShiftLeft') || g.input.held('ShiftRight') || g.input.held('T:sprint');
    const sp = fast ? DRONE.fast : DRONE.speed;
    const sn = Math.sin(d.yaw), cs = Math.cos(d.yaw);
    d.pos.x += (a.mx * cs + a.my * sn) * sp * dt;
    d.pos.z += (-a.mx * sn + a.my * cs) * sp * dt;
    if (g.input.held('Space') || g.input.held('T:jump')) d.pos.y += sp * 0.6 * dt;
    if (g.input.held('KeyX') || g.input.held('T:crouch')) d.pos.y -= sp * 0.6 * dt;
    // Tether to the operator.
    const P = g.player.pos;
    const off = new THREE.Vector2(d.pos.x - P.x, d.pos.z - P.z);
    if (off.length() > DRONE.range) {
      off.setLength(DRONE.range);
      d.pos.x = P.x + off.x;
      d.pos.z = P.z + off.y;
    }
    const ground = g.world.groundAt(d.pos.x, d.pos.z, d.pos.y, 0);
    d.pos.y = clamp(d.pos.y, ground + 2, g.world.heightAt(d.pos.x, d.pos.z) + 160);
    d.battery -= dt;
    g.audio.updateLoop('mydrone', d.pos);
    if (a.fire) {
      // Mark the spot under the crosshair for yourself.
      const dir = new THREE.Vector3(-Math.sin(d.yaw) * Math.cos(d.pitch), Math.sin(d.pitch), -Math.cos(d.yaw) * Math.cos(d.pitch));
      const hit = g.world.raycast(d.pos, d.pos.clone().addScaledVector(dir, 1500), true);
      if (hit) g.hud.addMarker(hit.point.clone().add(new THREE.Vector3(0, 1, 0)), 'MARK', 'hitbody', 15);
    }
    if (d.battery <= 0) this.endDrone('DRONE BATTERY EMPTY');
  }

  applyDroneCamera(cam) {
    const d = this.drone;
    cam.position.copy(d.pos);
    cam.rotation.set(d.pitch, d.yaw, 0, 'YXZ');
    cam.fov = d.zoom > 1 ? 22 : 66;
    cam.near = 0.3;
    cam.updateProjectionMatrix();
  }

  _buildRemoteDrone() {
    const g = new THREE.Group();
    const m = new THREE.MeshLambertMaterial({ color: 0x2b2b31 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.32), m);
    g.add(body);
    for (const [x, z] of [[-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28]]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.4), m);
      arm.position.set(x / 2, 0, z / 2);
      arm.rotation.y = Math.atan2(x, z);
      g.add(arm);
      const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.01, 12), new THREE.MeshBasicMaterial({ color: 0x555560, transparent: true, opacity: 0.5 }));
      rotor.position.set(x, 0.06, z);
      g.add(rotor);
    }
    const lights = [];
    for (const [c, x] of [[0xff3020, -0.18], [0x30ff60, 0.18]]) {
      const l = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      l.position.set(x, -0.04, 0.16);
      l.scale.setScalar(0.9);
      g.add(l);
      lights.push(l);
    }
    g.visible = false;
    this.scene.add(g);
    this.remoteDrone = { group: g, lights };
  }

  // ---- Hit-testing hooks ------------------------------------------------------------
  // Capsules for enemy-owned tool objects my bullets can hit.
  hitCapsules(list) {
    for (const d of this.decoys) {
      if (d.mine) continue;
      this.decoyCapsules(d).forEach((c) => { c.owner = 'decoy'; c.ref = d; list.push(c); });
    }
    for (const d of this.darts) {
      if (d.mine) continue;
      const c = d.p.clone().add(new THREE.Vector3(0, 0.25, 0));
      list.push({ part: 'dart', a: c, b: c.clone(), r: 0.35, owner: 'dart', ref: d });
    }
    if (this.remote.hd) list.push({ part: 'hunter', a: this.remote.hd.pos.clone(), b: this.remote.hd.pos.clone(), r: 0.9, owner: 'hunter' });
    if (this.remote.dr) list.push({ part: 'drone', a: this.remote.dr.clone(), b: this.remote.dr.clone(), r: 0.5, owner: 'drone' });
    return list;
  }

  onToolHit(cap, shotOrigin) {
    const g = this.g;
    g.hud.hitMarker(false);
    if (cap.owner === 'decoy') {
      this._removeDecoy(cap.ref);
      g.net.send({ t: 'decoyhit', id: cap.ref.id, o: shotOrigin.toArray() });
      g.hud.addMarker(cap.ref.p.clone().add(new THREE.Vector3(0, 1, 0)), 'DECOY', 'hitbody', 3);
      g.hud.message('DECOY', 'That was a fake — and they know where you shot from', 2.5);
    } else if (cap.owner === 'dart') {
      this._removeDart(cap.ref, '');
      g.net.send({ t: 'darthit', id: cap.ref.id });
      g.hud.message('', 'Recon dart destroyed', 1.5);
    } else if (cap.owner === 'hunter') {
      g.net.send({ t: 'hunterhit' });
      this.remote.hd = null;
      g.hud.message('', 'Enemy hunter drone shot down', 1.8);
    } else if (cap.owner === 'drone') {
      g.net.send({ t: 'dronehit' });
      this.remote.dr = null;
      g.hud.message('', 'Enemy drone shot down', 1.8);
    }
  }

  // ---- Per frame ----------------------------------------------------------------------
  update(dt) {
    const g = this.g, cam = g.camera;
    // Projectiles in flight.
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.prev.copy(f.p);
      f.v.y -= BALLISTICS.gravity * dt;
      f.p.addScaledVector(f.v, dt);
      f.age += dt;
      const hit = g.world.raycast(f.prev, f.p);
      if (hit || f.age > 7) {
        this.flying.splice(i, 1);
        const p = hit ? hit.point.clone() : f.p.clone();
        if (f.kind === 'smoke') this._spawnSmoke(p, true);
        else {
          const id = this._id();
          this._spawnDart({ id, p, mine: true });
          g.net && g.net.send({ t: 'dart', id, p: p.toArray() });
          g.hud.message('', `Recon dart planted · ${Math.round(p.distanceTo(g.player.pos))} m`, 1.8);
        }
      }
    }
    // Smoke clouds.
    const w = g.wind.at(g.roundTime);
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.age += dt;
      s.alpha = smoothstep(0, 2, s.age) * (1 - smoothstep(SMOKE.life - 4, SMOKE.life, s.age));
      s.drift.x += w.x * 0.08 * dt;
      s.drift.z += w.y * 0.08 * dt;
      s.sprites.forEach((sp, k) => {
        sp.position.copy(s.p).add(s.offs[k]).add(s.drift);
        sp.position.y += s.age * 0.06;
        sp.material.opacity = s.alpha * 0.82;
      });
      if (s.age > SMOKE.life) {
        s.sprites.forEach((sp) => this.scene.remove(sp));
        this.smokes.splice(i, 1);
      }
    }
    // Decoy glints (only the enemy's decoys glint at me).
    for (const d of this.decoys) {
      if (d.mine) { d.glint.visible = false; continue; }
      const sp = scopePoint(d.p, d.yaw, -0.03, 2);
      const toMe = cam.position.clone().sub(sp).normalize();
      const aim = new THREE.Vector3(-Math.sin(d.yaw), 0, -Math.cos(d.yaw));
      let k = Math.pow(Math.max(0, aim.dot(toMe)), 18) * (0.55 + 0.45 * Math.sin(g.now * 2.2 + d.phase)) * g.palette.glint;
      if (this.smokeBlocks(cam.position, sp)) k = 0;
      d.glint.visible = k > 0.02;
      if (d.glint.visible) {
        d.glint.position.copy(sp).addScaledVector(toMe, 0.45);
        d.glint.material.opacity = Math.min(1, k * 1.3);
        screenSprite(d.glint, cam, 0.02 + 0.05 * k);
      }
    }
    // Darts: blink, ping enemies moving nearby (mine), beep at me (theirs).
    const remoteS = g.remoteAlive && g.remoteHist.length ? sampleHist(g.remoteHist, g.now - 0.11) : null;
    for (let i = this.darts.length - 1; i >= 0; i--) {
      const d = this.darts[i];
      d.age += dt;
      d.light.material.opacity = (g.now * 1.4 + d.id) % 1 < 0.2 ? 1 : 0.15;
      if (d.mine && remoteS) {
        d.pingT -= dt;
        if (d.pingT <= 0 && remoteS.moving && remoteS.p.distanceTo(d.p) < DART.radius) {
          d.pingT = DART.pingEvery;
          g.hud.addMarker(remoteS.p.clone().add(new THREE.Vector3(0, 1.2, 0)), 'SENSOR', 'enemy', 1.8);
          g.audio.beep(null, true);
        }
      }
      if (!d.mine && g.player.alive && g.player.pos.distanceTo(d.p) < DART.radius) {
        d.beepT -= dt;
        if (d.beepT <= 0) {
          d.beepT = DART.pingEvery;
          g.audio.beep(d.p, false);
          if (g.player.moving) g.hud.message('', 'Enemy sensor nearby — you\'re moving in its field', 1.4);
        }
      }
      if (d.age > DART.life) this._removeDart(d, '');
    }
    // Hunter drones (mine flies here; the enemy's follows their state).
    if (this.hunter) {
      const h = this.hunter;
      const ev = h.update(dt, (pos) => {
        if (!g.remoteAlive || !g.remoteHist.length) return null;
        const s = sampleHist(g.remoteHist, g.now - 0.11);
        if (Math.hypot(s.p.x - pos.x, s.p.z - pos.z) > hunterRange(this.remote.tp, s.moving)) return null;
        const head = s.p.clone().add(new THREE.Vector3(0, 1, 0));
        if (g.world.raycast(pos, head, true) || this.smokeBlocks(pos, head)) return null;
        return s.p;
      });
      if (ev === 'lock') {
        if (this.remote.tp) g.hud.message('HUNTER — WEAK LOCK', 'Thermal poncho: optics only, rough marks every few seconds', 2.4);
        else g.hud.message('HUNTER LOCKED', 'Enemy marked while it keeps eyes on them', 2.2);
        g.audio.ping();
      }
      if (ev === 'lost') g.hud.message('', 'Hunter lost the target — searching', 1.8);
      if (h.locked) {
        this.markT -= dt;
        if (this.markT <= 0 && g.remoteHist.length) {
          const s = sampleHist(g.remoteHist, g.now - 0.11);
          const mark = s.p.clone().add(new THREE.Vector3(0, 1.2, 0));
          if (this.remote.tp) {
            // Poncho: no thermal signature, so the optics only give a rough, slow fix.
            this.markT = HUNTER_PONCHO.markEvery;
            const a = Math.random() * Math.PI * 2, r = Math.random() * HUNTER_PONCHO.jitter;
            mark.x += Math.cos(a) * r;
            mark.z += Math.sin(a) * r;
            g.hud.addMarker(mark, 'HUNTER ~', 'enemy', 2);
          } else {
            this.markT = 1;
            g.hud.addMarker(mark, 'HUNTER', 'enemy', 1.3);
          }
        }
      }
      this.hunterMesh.visible = true;
      this.hunterMesh.position.copy(h.pos);
      this.hunterMesh.rotation.set(0, h.heading, h.bank);
      g.audio.updateLoop('myhunter', h.pos);
      if (h.life <= 0) this.endHunter('HUNTER OUT OF FUEL');
    }
    const rh = this.remote.hd;
    this.remoteHunterMesh.visible = !!rh;
    if (rh) {
      const mesh = this.remoteHunterMesh;
      mesh.position.lerp(rh.pos, mesh.userData.seen ? Math.min(1, dt * 6) : 1);
      mesh.userData.seen = true;
      mesh.rotation.set(0, rh.heading, rh.bank);
      g.audio.startLoop('enemyhunter', rh.pos, 'drone', 0.35);
      g.audio.updateLoop('enemyhunter', mesh.position);
      this.warnT = (this.warnT || 0) - dt;
      if (rh.locked && g.player.alive && this.warnT <= 0) {
        this.warnT = 3;
        g.hud.message('', '⚠ Enemy hunter drone is tracking you — break line of sight or shoot it down', 2.5);
      }
    } else {
      this.remoteHunterMesh.userData.seen = false;
      g.audio.stopLoop('enemyhunter');
    }
    for (const mesh of [this.hunterMesh, this.remoteHunterMesh]) {
      if (!mesh.visible) continue;
      mesh.userData.lights.forEach((l, k) => (l.material.opacity = (g.now * 1.5 + k * 0.33) % 1 < 0.25 ? 1 : 0.15));
      screenSprite(mesh.userData.lights[2], cam, 0.006);
    }
    // Predator orbit.
    const pr = this.predator;
    const pp = this.predatorPos(g.roundTime);
    const ahead = this.predatorPos(g.roundTime + 0.5);
    pr.group.position.copy(pp);
    pr.group.lookAt(ahead);
    pr.group.rotateY(Math.PI);
    pr.group.rotateZ(0.25);
    pr.light.material.opacity = (g.now % 1.3) < 0.15 ? 1 : 0.1;
    screenSprite(pr.light, cam, 0.006);
    this.feedWindow = Math.max(0, this.feedWindow - dt);
    if (this.feed > 0) {
      this.feed -= dt;
      if (this.feed <= 0) this.endFeed();
    }
    // Enemy drone.
    const rd = this.remote.dr;
    this.remoteDrone.group.visible = !!rd;
    if (rd) {
      const grp = this.remoteDrone.group;
      grp.position.lerp(rd, grp.userData.seen ? Math.min(1, dt * 8) : 1);
      grp.userData.seen = true;
      grp.rotation.y += dt * 0.3;
      this.remoteDrone.lights.forEach((l, k) => (l.material.opacity = (g.now * 2 + k * 0.5) % 1 < 0.3 ? 1 : 0.2));
      g.audio.startLoop('enemydrone', rd, 'drone', 0.5);
      g.audio.updateLoop('enemydrone', grp.position);
    } else {
      this.remoteDrone.group.userData.seen = false;
      g.audio.stopLoop('enemydrone');
    }
  }

  // ---- Predator UAV: orbits for everyone; its feed opens briefly after each sweep ----
  _buildPredator() {
    const g = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: 0x1a1824 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.35, 11, 8).rotateX(Math.PI / 2), m);
    g.add(body);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(20, 0.2, 1.6), m);
    wing.position.z = 0.5;
    g.add(wing);
    for (const s of [-1, 1]) {
      const tail = new THREE.Mesh(new THREE.BoxGeometry(3, 0.15, 1), m);
      tail.position.set(s * 1.1, 0.8, 5);
      tail.rotation.z = s * 0.7;
      g.add(tail);
    }
    const light = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff4030, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    light.position.y = -0.6;
    g.add(light);
    this.scene.add(g);
    this.predator = { group: g, light };
  }

  predatorPos(t, out = new THREE.Vector3()) {
    const a = (t / 95) * Math.PI * 2;
    return out.set(Math.cos(a) * 720, 950, Math.sin(a) * 720);
  }

  // Called when a UAV sweep lands (and the enemy isn't jammed).
  openFeed() {
    this.feedWindow = 8;
  }

  startFeed() {
    if (this.feedWindow <= 0 || this.drone) return false;
    this.feedWindow = 0;
    this.feed = 6;
    this.g.input.resetScope();
    this.g.audio.click();
    return true;
  }

  endFeed() {
    this.feed = 0;
  }

  applyFeedCamera(cam) {
    const g = this.g;
    const pos = this.predatorPos(g.roundTime);
    let target = this.feedTarget;
    if (g.remoteAlive && g.remoteHist.length) {
      const s = sampleHist(g.remoteHist, g.now - 0.11);
      target = this.feedTarget = s.p.clone().add(new THREE.Vector3(0, 0.6, 0));
    }
    if (!target) target = new THREE.Vector3();
    // A slow hand on the joystick: the feed wanders a little around the target.
    const jit = new THREE.Vector3(Math.sin(g.now * 0.7) * 2, 0, Math.cos(g.now * 0.53) * 2);
    cam.position.copy(pos);
    cam.near = 5;
    cam.lookAt(target.clone().add(jit));
    cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(15 / pos.distanceTo(target)));
    cam.updateProjectionMatrix();
  }

  // Thermal view (drone or Predator feed): the enemy glows unless ponchoed; decoys stay cold.
  thermalActive() {
    return !!this.drone || this.feed > 0;
  }
}
