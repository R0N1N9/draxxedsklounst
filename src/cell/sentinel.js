// Sniper Cell: Infiltration — SENTINEL, the facility's security: guards, patrol drones and
// cameras, the alarm and reinforcements. The host runs the simulation (update); the guest
// only applies snapshots (applySnap) and draws the same models.
//
// Rules carried over from Cold Archive, rescaled from its top-down pixels to metres:
//   guard vision ~30 m in a ±0.62 rad cone (anything inside 2.5 m), awareness fills at
//   2.4 × rate × visibility per second and drains at 0.4/s; full = alert after a 0.3–0.6 s
//   reaction; an alert guard radios the alarm (+0.5) 1.5 s later unless he's dropped first;
//   lost sight → search the last known position for ~8 s. Cloak ×0.28 visibility, darkness
//   ×0.4, standing still ×0.8; low visibility shrinks the sight range to 55 %.
//   Alarm 0..1 (QUIET / ALERT / ALARM / LOCKDOWN), decays only after 4 s without a raise.
// New for this mode: guards respawn OUTSIDE the building (barracks door and the south gate)
// and patrol drones relaunch from the barracks pad.
import * as THREE from 'three';
import { lam, glowMat, FENCE, SPOTS } from './facility.js';
import { clamp, mulberry32 } from '../util.js';

export const DIFFS = {
  recruit: { name: 'Recruit', guardDmg: 0.7, guardAcc: 0.46, rate: 0.6, alarmDecay: 2.2, count: 0.65, drops: 5, hp: 120, camo: 1.4 },
  operative: { name: 'Operative', guardDmg: 1.05, guardAcc: 0.6, rate: 0.9, alarmDecay: 1.4, count: 0.9, drops: 3, hp: 100, camo: 1.0 },
  ghost: { name: 'Ghost', guardDmg: 1.35, guardAcc: 0.7, rate: 1.15, alarmDecay: 0.9, count: 1.0, drops: 2, hp: 85, camo: 0.8 },
};

const STATES = ['patrol', 'post', 'sus', 'alert', 'search', 'dead'];
const GUARD_HP = 125;
const DRONE_HP = 40;
const EYE = 1.62;

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------
function iconTexture(ch, color) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  g.font = '700 54px Rajdhani, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(0,0,0,0.8)';
  g.strokeText(ch, 32, 34);
  g.fillStyle = color;
  g.fillText(ch, 32, 34);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const ICONS = {};
function icon(kind) {
  if (!ICONS[kind]) ICONS[kind] = new THREE.SpriteMaterial({ map: iconTexture(kind === 'sus' ? '?' : '!', kind === 'sus' ? '#ffd040' : '#ff3048'), depthTest: false, transparent: true });
  return ICONS[kind];
}

const BEAM = new THREE.ConeGeometry(2.6, 12, 16, 1, true).translate(0, -6, 0).rotateX(Math.PI / 2); // apex at the light, opening down -Z
function beamMat() {
  return new THREE.ShaderMaterial({
    uniforms: { uC: { value: new THREE.Color('#fff2c8') }, uA: { value: 1 } },
    // Soft volumetric look: fades along the beam, toward its silhouette, and right in front of the camera.
    vertexShader: 'varying float vD; varying float vC; varying vec3 vN; varying vec3 vV; void main(){ vD = clamp(length(position) / 12.0, 0.0, 1.0); vec4 mv = modelViewMatrix * vec4(position, 1.0); vC = length(mv.xyz); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uC; uniform float uA; varying float vD; varying float vC; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.0); gl_FragColor = vec4(uC * (1.0 - vD) * (1.0 - vD) * 0.06 * f * uA * smoothstep(2.0, 9.0, vC), 1.0); }',
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
}

export function buildGuard(chief = false) {
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const body = new THREE.Group();
  root.add(body);
  const C = { suit: chief ? '#2a2633' : '#30343a', armor: chief ? '#3a3448' : '#42474e', skin: '#2a2420', boot: '#151618', gun: '#1b1c1f' };
  const mk = (geo, col, x, y, z, parent = body, opts) => { const m = new THREE.Mesh(geo, lam(col, opts)); m.position.set(x, y, z); parent.add(m); return m; };
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.11, 0.92, 0);
    body.add(hip);
    mk(new THREE.BoxGeometry(0.17, 0.5, 0.2), C.suit, 0, -0.25, 0, hip);
    mk(new THREE.BoxGeometry(0.15, 0.42, 0.17), C.suit, 0, -0.68, 0.01, hip);
    mk(new THREE.BoxGeometry(0.16, 0.1, 0.28), C.boot, 0, -0.88, -0.04, hip);
    legs.push(hip);
  }
  mk(new THREE.BoxGeometry(0.42, 0.56, 0.26), C.suit, 0, 1.2, 0);
  mk(new THREE.BoxGeometry(0.46, 0.44, 0.32), C.armor, 0, 1.24, -0.01);
  mk(new THREE.BoxGeometry(0.4, 0.12, 0.08), '#33373d', 0, 1.18, -0.18);
  mk(new THREE.BoxGeometry(0.2, 0.22, 0.22), C.skin, 0, 1.6, 0);
  mk(new THREE.SphereGeometry(0.15, 10, 7, 0, Math.PI * 2, 0, Math.PI / 1.8), chief ? '#4b3f63' : '#3b4046', 0, 1.66, 0.01);
  // Visor glow: red for the troops, violet for the Site Chief.
  mk(new THREE.BoxGeometry(0.2, 0.05, 0.03), chief ? '#c070ff' : '#ff4050', 0, 1.62, -0.115, body, { emissive: chief ? '#c070ff' : '#ff4050', emissiveIntensity: 1.6 });
  // Arms + rifle at low ready.
  const gun = new THREE.Group();
  gun.position.set(0.05, 1.18, -0.28);
  body.add(gun);
  mk(new THREE.BoxGeometry(0.06, 0.09, 0.7), C.gun, 0, 0, -0.1, gun);
  mk(new THREE.BoxGeometry(0.05, 0.14, 0.06), C.gun, 0, -0.1, 0.05, gun);
  for (const s of [-1, 1]) {
    const a = mk(new THREE.BoxGeometry(0.11, 0.11, 0.42), C.suit, s * 0.22, 1.28, -0.16);
    a.rotation.y = -s * 0.35;
  }
  // Weapon light + beam.
  mk(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 8).rotateX(Math.PI / 2), '#fff6d0', 0.04, 0.03, -0.46, gun, { emissive: '#fff6d0', emissiveIntensity: 2 });
  const beam = new THREE.Mesh(BEAM, beamMat());
  beam.position.set(0.04, 0.03, -0.5);
  beam.rotation.x = -0.12;
  gun.add(beam);
  if (chief) mk(new THREE.BoxGeometry(0.1, 0.13, 0.02), '#d0a0ff', -0.12, 1.32, -0.18, body, { emissive: '#b080ff', emissiveIntensity: 1.2 });
  const tag = new THREE.Sprite(icon('sus'));
  tag.scale.set(0.5, 0.5, 1);
  tag.position.set(0, 2.15, 0);
  tag.visible = false;
  root.add(tag);
  root.userData = { body, legs, gun, beam, tag, phase: Math.random() * 6 };
  return root;
}

export function buildDrone() {
  const g = new THREE.Group();
  const dark = '#24272c';
  const mk = (geo, col, x, y, z, opts) => { const m = new THREE.Mesh(geo, lam(col, opts)); m.position.set(x, y, z); g.add(m); return m; };
  mk(new THREE.BoxGeometry(0.7, 0.22, 0.9), dark, 0, 0, 0);
  mk(new THREE.SphereGeometry(0.16, 10, 8), '#111', 0, -0.16, -0.32);
  const rotors = [];
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
    mk(new THREE.BoxGeometry(0.08, 0.06, 0.8), dark, x / 2, 0.02, z / 2).lookAt(new THREE.Vector3(x * 2, 0.02, z * 2));
    const r = mk(new THREE.CylinderGeometry(0.34, 0.34, 0.02, 14), '#556', x, 0.12, z, { transparent: true, opacity: 0.4 });
    rotors.push(r);
    mk(new THREE.BoxGeometry(0.06, 0.06, 0.06), '#ff2030', x, -0.04, z, { emissive: '#ff2030', emissiveIntensity: 2 });
  }
  const beam = new THREE.Mesh(new THREE.ConeGeometry(5, 11, 18, 1, true).translate(0, -5.5, 0), beamMat());
  beam.material.uniforms.uC.value.set('#ffe4f0');
  beam.rotation.x = 0.35;
  g.add(beam);
  g.userData = { rotors, beam };
  return g;
}

export function buildCamera() {
  const g = new THREE.Group();
  const head = new THREE.Group();
  g.add(head);
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.45), lam('#c9ccd0'));
  b.position.z = -0.15;
  head.add(b);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.07, 12), new THREE.MeshBasicMaterial({ color: '#ff2030' }));
  lens.position.set(0, 0, -0.38);
  lens.rotation.y = Math.PI;
  head.add(lens);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(4.5, 14, 16, 1, true).translate(0, -7, 0).rotateX(-Math.PI / 2), glowMat('#ff3040', 0.035));
  head.add(cone);
  g.userData = { head, lens, cone };
  return g;
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------
export class Sentinel {
  constructor(game, { diff = 'operative', seed = 1, sim = true } = {}) {
    this.game = game;
    this.fac = game.fac;
    this.scene = game.scene;
    this.D = DIFFS[diff] || DIFFS.operative;
    this.sim = sim;
    this.rng = mulberry32(seed);
    this.guards = [];
    this.drones = [];
    this.cams = [];
    this.alarm = 0;
    this.alarmPeak = 0;
    this.lastRaise = -99;
    this.lockdown = false;
    this.t = 0;
    this.nextId = 1;
    this.respawnT = 40;
    this.events = [];
    this.lkp = null; // last known position of an agent, shown while they hunt
    this.lkpT = 0;
    this.jams = []; // { x, z, r, t }
    this.spoofT = 0;
    this.scanT = 0;
    this.stats = { kills: 0, takedowns: 0, drones: 0, spotted: 0, loudShots: 0 };
    this._populate();
  }

  // ---- placement -------------------------------------------------------------
  _populate() {
    const R = this.rng, keep = (p) => R() < this.D.count || p;
    const routes = {
      yardS: [[-60, 46], [-20, 52], [22, 50], [60, 44], [22, 50], [-20, 52]],
      yardN: [[-66, -52], [-20, -52], [40, -52], [66, -52], [40, -52], [-20, -52]],
      yardW: [[-68, 32], [-70, -24], [-44, -36], [-44, 10]],
      yardE: [[68, 40], [72, 6], [74, -23], [44, -36], [42, -20], [44, -10]],
      chief: [[0, 28], [0, 6], [0, -9], [0, -20], [3, -23.6], [3, -31], [3, -23.6], [15, -20], [15, -9], [15, -16.5], [-12, -20], [-12, -24], [-21, -31], [-20.7, -23.6], [0, -20], [0, -9], [0, 6], [-30, 18]],
      corridor: [[-33, -20], [34, -20]],
      datahall: [[-30, -24], [-21, -31], [-12, -24], [-8, -29.7], [-29, -26]],
      staging: [[-30, -9], [-14, -8], [-22, -14]],
      security: [[11, -10], [19, -6], [15, -15]],
      lobby: [[-5, -5], [5, -5], [0, -12]],
    };
    const P = (pts) => pts.map(([x, z]) => ({ x, z }));
    for (const k of ['yardS', 'yardN', 'yardW', 'yardE']) this.spawnGuard({ route: P(routes[k]), start: routes[k][0] });
    if (keep()) this.spawnGuard({ route: P(routes.yardS).reverse(), start: [22, 50] });
    this.spawnGuard({ route: P(routes.chief), start: routes.chief[0], chief: true });
    // Tower posts, the gate and the barracks door.
    for (const t of this.fac.towers) if (keep(t.z < 0)) this.spawnGuard({ post: { x: t.x, z: t.z, y: t.y, face: t.face, sweep: 1.2 }, tower: true });
    this.spawnGuard({ post: { x: -3, z: 56, face: Math.PI, sweep: 0.7 } });
    if (keep()) this.spawnGuard({ post: { x: 4, z: 57, face: Math.PI + 0.4, sweep: 0.5 } });
    if (keep()) this.spawnGuard({ post: { x: 42, z: 24, face: -Math.PI / 2, sweep: 0.6 } });
    // Inside.
    this.spawnGuard({ route: P(routes.lobby), start: [-5, -5] });
    if (keep()) this.spawnGuard({ route: P(routes.staging), start: [-30, -9] });
    this.spawnGuard({ route: P(routes.security), start: [11, -10] });
    this.spawnGuard({ post: { x: 27, z: -12, face: Math.PI / 2, sweep: 0.8 } });
    this.spawnGuard({ route: P(routes.corridor), start: [-33, -20] });
    this.spawnGuard({ route: P(routes.datahall), start: [-30, -24] });
    if (keep()) this.spawnGuard({ post: { x: -15, z: -38.5, face: 0, sweep: 0.9 } });
    this.spawnGuard({ post: { x: 6, z: -28, face: Math.PI / 2 + 0.3, sweep: 0.7 } });
    this.spawnGuard({ post: { x: 26, z: -26, face: -0.2, sweep: 0.9 } });
    if (keep()) this.spawnGuard({ post: { x: 34, z: -33, face: -Math.PI / 2, sweep: 0.8 } });
    this.garrison = this.guards.length;
    // Patrol drones over the yard.
    const loops = [
      [[-60, -40], [60, -40], [60, 40], [-60, 40]],
      [[0, 45], [70, 0], [0, -48], [-70, 0]],
      [[-40, 20], [40, 20], [40, -50], [-40, -50]],
    ];
    const nd = this.D.count >= 0.9 ? 3 : 2;
    for (let i = 0; i < nd; i++) this.spawnDrone(loops[i].map(([x, z]) => ({ x, z })), i);
    this.droneCap = nd;
    // Cameras: exterior corners, gate, lobby, corridor, data hall, core, vault.
    const cams = [
      [-36.5, 4.5, 0.6, Math.PI * 0.75, 1, 32], [36.5, 4.5, 0.6, -Math.PI * 0.75, 1, 32], [-36.5, 4.5, -40.6, Math.PI * 0.25, 1, 32], [36.5, 4.5, -40.6, -Math.PI * 0.25, 1, 32],
      [8, 3.8, 56.5, Math.PI + 0.3, 1, 30],
      [7.5, 3, -0.6, Math.PI / 2 + 0.6, 2, 18], [-35.5, 3, -21.5, -Math.PI / 2, 2, 30], [-6.5, 3, -39.5, Math.PI * 0.2 + Math.PI, 2, 22],
      [11.5, 3, -39.5, Math.PI + 0.6, 3, 18], [35.5, 3, -22.5, -Math.PI * 0.75, 3, 22],
    ];
    for (const [x, y, z, yaw, tier, range] of cams) this.spawnCam({ x, y, z, yaw, tier, range });
  }

  spawnGuard({ route = null, post = null, start = null, chief = false, tower = false, x, z, hunt = null }) {
    const g = {
      id: this.nextId++, kind: 'g', chief, tower,
      x: x ?? (start ? start[0] : post ? post.x : 0), z: z ?? (start ? start[1] : post ? post.z : 0), y: post && post.y ? post.y : 0,
      yaw: post ? post.face : 0, look: 0, state: post ? 'post' : 'patrol', hp: GUARD_HP,
      route, ri: 0, wait: 0, post, path: null, pathT: 0, aw: 0, target: null, lkp: null,
      reactT: 0, fireT: 0, radioT: 0, searchT: 0, jamT: 0, seenT: 0, tagT: 0, scanT: 0, revealT: 0, body: false, found: false, fallT: 0, moving: false,
      badge: chief, vx: 0, vz: 0, quadAw: 0,
    };
    if (!post) g.y = this.fac.groundAt(g.x, g.z, 10, 0.6);
    if (hunt) { g.state = 'search'; g.lkp = { ...hunt }; g.searchT = 18; }
    g.obj = buildGuard(chief);
    this.scene.add(g.obj);
    this.guards.push(g);
    return g;
  }

  spawnDrone(route, i) {
    const pad = SPOTS.dronePad;
    const d = { id: this.nextId++, kind: 'd', route, ri: i % route.length, x: pad.x, y: pad.y, z: pad.z, alt: 10 + (i % 2) * 2, yaw: 0, hp: DRONE_HP, state: 'patrol', aw: 0, zapT: 0, empT: 0, huntT: 0, lkp: null, tagT: 0, scanT: 0, revealT: 0, fallV: 0 };
    d.obj = buildDrone();
    this.scene.add(d.obj);
    this.drones.push(d);
    return d;
  }

  spawnCam({ x, y, z, yaw, tier, range }) {
    const c = { id: this.nextId++, kind: 'c', x, y, z, base: yaw, yaw, tier, range, sweep: 0.7, aw: 0, loopT: 0, empT: 0, hacked: false, phase: this.rng() * 6 };
    c.obj = buildCamera();
    c.obj.position.set(x, y, z);
    this.scene.add(c.obj);
    this.cams.push(c);
    return c;
  }

  byId(id) {
    return this.guards.find((g) => g.id === id) || this.drones.find((d) => d.id === id) || this.cams.find((c) => c.id === id);
  }

  emit(ev) {
    this.events.push(ev);
  }

  // ---- alarm -------------------------------------------------------------------
  raise(v, why) {
    if (!this.sim) return;
    const before = this.alarm;
    this.alarm = clamp(this.alarm + v, 0, 1);
    this.lastRaise = this.t;
    this.alarmPeak = Math.max(this.alarmPeak, this.alarm);
    if (before < 1 && this.alarm >= 1) this.emit({ t: 'toast', m: 'SENTINEL: intruder alert. All units respond.', c: 'red' });
    else if (before < 0.3 && this.alarm >= 0.3 && why) this.emit({ t: 'toast', m: why, c: 'amber' });
  }

  get alarmLabel() {
    if (this.lockdown) return 'LOCKDOWN';
    return this.alarm >= 1 ? 'ALARM' : this.alarm > 0.3 ? 'ALERT' : 'QUIET';
  }

  // Sound at a point. Through walls it carries 45 %. Loud and close → alert, else investigate.
  noise(pos, radius, loud = false) {
    if (!this.sim) return;
    for (const g of this.guards) {
      if (g.state === 'dead') continue;
      const ep = { x: g.x, y: g.y + EYE, z: g.z };
      const d = Math.hypot(g.x - pos.x, g.z - pos.z);
      const r = this.fac.los(ep, { x: pos.x, y: (pos.y || 0) + 1, z: pos.z }) ? radius : radius * 0.45;
      if (d > r) continue;
      if (g.state === 'alert') { if (!g.target) g.lkp = { x: pos.x, z: pos.z }; continue; }
      if (loud && d < r * 0.7) this._alert(g, null, { x: pos.x, z: pos.z });
      else this._investigate(g, pos, 5 + this.rng() * 3);
    }
  }

  // ---- damage --------------------------------------------------------------------
  // Returns true if it killed. `how`: 'rifle' | 'pistol' | 'takedown' | 'ai'.
  damage(id, dmg, how, from) {
    const e = this.byId(id);
    if (!e || e.hp <= 0) return false;
    e.hp -= dmg;
    if (e.kind === 'g') {
      if (e.hp <= 0) {
        e.state = 'dead';
        e.hp = 0;
        e.fallT = 0;
        e.body = true;
        e.diedAt = this.t;
        e.target = null;
        if (how === 'takedown') this.stats.takedowns++; else this.stats.kills++;
        this.emit({ t: 'kill', id, how, chief: e.chief });
        return true;
      }
      // Wounded and alive: he knows something is wrong; a pistol at close range gives you away.
      if (from) this._alert(e, null, { x: from.x, z: from.z });
      return false;
    }
    if (e.kind === 'd') {
      if (e.hp <= 0) {
        e.state = 'dead';
        e.hp = 0;
        e.fallV = 0;
        e.respawnT = this.alarm >= 1 ? 25 : 60;
        this.stats.drones++;
        this.emit({ t: 'kill', id, how, drone: true });
        return true;
      }
      e.state = 'hunt';
      e.huntT = 8;
      if (from) e.lkp = { x: from.x, z: from.z };
    }
    return false;
  }

  _alert(g, target, lkp) {
    if (g.state === 'dead') return;
    const was = g.state;
    g.state = 'alert';
    g.aw = 1;
    if (target) g.target = target;
    if (lkp) g.lkp = { ...lkp };
    g.searchT = 8 + this.rng() * 8;
    g.path = null;
    if (was !== 'alert') {
      g.reactT = 0.3 + this.rng() * 0.3;
      if (g.jamT <= 0) g.radioT = 1.5;
    }
  }

  _investigate(g, pos, dur) {
    if (g.state === 'alert' || g.state === 'dead') return;
    g.state = 'sus';
    g.lkp = { x: pos.x, z: pos.z };
    g.searchT = dur;
    g.path = null;
  }

  // ---- sensing -------------------------------------------------------------------
  // How visible an agent is: stance, motion, light, cloak.
  _vis(a, fromDist, flash) {
    let v = a.stance === 2 ? 0.45 : a.stance === 1 ? 0.7 : 1;
    if (!a.moving) v *= 0.8;
    if (a.sprinting) v *= 1.2;
    const light = flash ? 1 : this.fac.lightAt(a.pos.x, a.pos.y + 1, a.pos.z);
    v *= light < 0.35 ? 0.4 + light : 1;
    if (a.cloak) v *= a.cloakFlicker ? 0.6 : 0.28 * 0.5; // active camo (Cold Archive: ×0.28) — this one is tuned for a sniper
    return v;
  }

  _canSee(g, a, rangeMul = 1) {
    const ep = { x: g.x, y: g.y + EYE, z: g.z };
    const tp = { x: a.pos.x, y: a.pos.y + (a.stance === 2 ? 0.35 : a.stance === 1 ? 0.95 : 1.4), z: a.pos.z };
    const dx = tp.x - ep.x, dz = tp.z - ep.z, d = Math.hypot(dx, dz);
    const alert = g.state === 'alert';
    const base = (g.tower ? 58 : 30) * (alert ? 1.5 : 1) * rangeMul;
    const ang = Math.abs(angDiff(Math.atan2(-dx, -dz), g.yaw + g.look));
    const cone = alert ? 1.05 : 0.62;
    const flash = !g.tower && d < 13 && ang < 0.32 && !alert;
    let vis = this._vis(a, d, flash || (g.tower && d < 40));
    const range = base * (vis < 0.5 ? 0.55 : 1);
    if (d > range) return 0;
    if (d > 2.5 && ang > cone) return 0;
    if (a.cloak && !a.cloakFlicker && d > 4 && this.rng() < 0.6) return 0;
    if (!this.fac.los(ep, tp)) return 0;
    return vis * (1 - (d / range) * 0.5);
  }

  // ---- update (host) -------------------------------------------------------------
  update(dt, agents) {
    this.t += dt;
    this.agents = agents;
    if (!this.sim) return;
    // Alarm decay (never during lockdown).
    if (!this.lockdown && this.t - this.lastRaise > 4) this.alarm = Math.max(0, this.alarm - 0.06 * this.D.alarmDecay * dt * (this.alarm >= 1 ? 0.35 : 1));
    if (this.lockdown) this.alarm = 1;
    this.lkpT = Math.max(0, this.lkpT - dt);
    this.spoofT = Math.max(0, this.spoofT - dt);
    this.scanT = Math.max(0, this.scanT - dt);
    for (const j of this.jams) j.t -= dt;
    this.jams = this.jams.filter((j) => j.t > 0);
    this._sense = (this._sense || 0) - dt;
    const senseNow = this._sense <= 0;
    if (senseNow) this._sense = 0.1;
    for (const g of this.guards) this._guard(g, dt, senseNow);
    for (const d of this.drones) this._drone(d, dt, senseNow);
    for (const c of this.cams) this._cam(c, dt, senseNow);
    this._reinforce(dt);
    // Bodies that lie long enough fade away so the yard doesn't fill up.
    this.guards = this.guards.filter((g) => {
      if (g.state === 'dead' && g.found && this.t - g.diedAt > 90) { this.scene.remove(g.obj); return false; }
      return true;
    });
  }

  _reinforce(dt) {
    const alive = this.guards.filter((g) => g.state !== 'dead').length;
    const cap = this.garrison + (this.lockdown ? 6 : this.alarm >= 1 ? 3 : 0);
    const every = this.lockdown ? 9 : this.alarm >= 1 ? 14 : this.alarm > 0.3 ? 28 : 45;
    this.respawnT -= dt;
    if (this.respawnT <= 0) {
      this.respawnT = every;
      if (alive < cap) {
        // Always outside the building: the barracks door or the south gate, whichever no agent stands near.
        const spots = [SPOTS.barracks, SPOTS.gate].filter((s) => !(this.agents || []).some((a) => a.alive && Math.hypot(a.pos.x - s.x, a.pos.z - s.z) < 14));
        const s = spots[Math.floor(this.rng() * spots.length)];
        if (s) {
          const yard = [[-60, 46], [-20, 52], [22, 50], [60, 44], [72, 6], [44, -36], [-44, -36], [-44, 10], [0, 28], [30, 20], [-30, 18]];
          const pick = () => { const p = yard[Math.floor(this.rng() * yard.length)]; return { x: p[0], z: p[1] }; };
          const hunt = this.alarm >= 0.6 && this.lkp ? this.lkp : null;
          this.spawnGuard({ route: [pick(), pick(), pick()], x: s.x + (this.rng() - 0.5) * 2, z: s.z, hunt });
          this.emit({ t: 'toast', m: this.lockdown || this.alarm >= 1 ? 'SENTINEL: reinforcements deployed.' : 'Fresh patrol out of the ' + (s === SPOTS.gate ? 'south gate.' : 'barracks.'), c: 'dim' });
        }
      }
    }
    for (const d of this.drones) {
      if (d.state !== 'dead' || d.respawnT === undefined) continue;
      d.respawnT -= dt;
      if (d.respawnT <= 0) {
        const pad = SPOTS.dronePad;
        Object.assign(d, { x: pad.x, y: pad.y, z: pad.z, hp: DRONE_HP, state: this.alarm >= 1 ? 'hunt' : 'patrol', aw: 0, huntT: 10, respawnT: undefined });
        d.obj.visible = true;
        d.obj.rotation.set(0, 0, 0);
        this.emit({ t: 'toast', m: 'Patrol drone relaunched from the barracks pad.', c: 'dim' });
      }
    }
  }

  _guardSpeed(g) {
    return g.state === 'alert' ? 3.6 : g.state === 'search' ? 2.4 : g.state === 'sus' ? 1.9 : 1.45;
  }

  _moveTo(g, tx, tz, dt, speed) {
    // Repath when the goal moves or every couple of seconds.
    g.pathT -= dt;
    if (!g.path || g.pathT <= 0 || !g.goal || Math.hypot(g.goal.x - tx, g.goal.z - tz) > 3) {
      g.path = this.fac.path(g.x, g.z, tx, tz);
      g.goal = { x: tx, z: tz };
      g.pathT = 2.5;
    }
    let wp = g.path[0];
    while (wp && Math.hypot(wp.x - g.x, wp.z - g.z) < 0.7 && g.path.length > 1) { g.path.shift(); wp = g.path[0]; }
    if (!wp) return true;
    const dx = wp.x - g.x, dz = wp.z - g.z, d = Math.hypot(dx, dz);
    if (d < 0.6 && g.path.length <= 1) { g.moving = false; return true; }
    const want = Math.atan2(-dx, -dz);
    g.yaw += angDiff(want, g.yaw) * Math.min(1, dt * 6);
    const step = Math.min(d, speed * dt);
    const p = { x: g.x + (dx / d) * step, y: g.y, z: g.z + (dz / d) * step };
    this._openDoorsNear(g);
    this.fac.resolveHorizontal(p, 0.32, 1.7, 0.5);
    if (Math.hypot(p.x - g.x, p.z - g.z) < step * 0.2) g.stuck = (g.stuck || 0) + dt; else g.stuck = 0;
    if (g.stuck > 1.5) { g.path = null; g.stuck = 0; }
    g.x = p.x;
    g.z = p.z;
    g.y = this.fac.groundAt(g.x, g.z, g.y + 0.6, 0.6);
    g.moving = true;
    return false;
  }

  // Guards badge through their own doors (unless SENTINEL has sealed them).
  _openDoorsNear(g) {
    for (const d of Object.values(this.fac.doors)) {
      if (d.sealed) continue;
      if (Math.hypot(d.x - g.x, d.z - g.z) < 2.6) d.guardT = 2.5;
    }
  }

  _guard(g, dt, sense) {
    if (g.state === 'dead') return;
    g.jamT = Math.max(0, g.jamT - dt);
    g.tagT = Math.max(0, g.tagT - dt);
    g.scanT = Math.max(0, g.scanT - dt);
    for (const j of this.jams) if (Math.hypot(j.x - g.x, j.z - g.z) < j.r) { if (g.jamT <= 0) g.radioT = 0; g.jamT = Math.max(g.jamT, 0.5); }
    g.moving = false;
    const agents = (this.agents || []).filter((a) => a.alive && !a.downed);
    // Vision.
    if (sense) {
      let best = null, bv = 0;
      for (const a of agents) {
        const v = this._canSee(g, a);
        if (v > bv) { bv = v; best = a; }
      }
      if (best) {
        g.seenT = 0.6;
        g.aw = Math.min(1.2, g.aw + 2.4 * this.D.rate * bv * 0.1 * (g.state === 'alert' ? 3 : 1));
        g.lastSeen = { x: best.pos.x, z: best.pos.z };
        if (g.state === 'alert') { g.target = best.role; g.lkp = { x: best.pos.x, z: best.pos.z }; this.lkp = { ...g.lkp }; this.lkpT = 6; }
        else if (g.aw >= 1) { this.stats.spotted++; this._alert(g, best.role, { x: best.pos.x, z: best.pos.z }); this.lkp = { ...g.lkp }; this.lkpT = 6; this.emit({ t: 'spotted', id: g.id, role: best.role }); }
        else if (g.aw >= 0.35 && g.state !== 'sus' && g.state !== 'search') this._investigate(g, best.pos, 6);
        else if (g.state === 'sus') g.lkp = { x: best.pos.x, z: best.pos.z };
      } else {
        g.seenT = Math.max(0, g.seenT - 0.1);
        if (g.state !== 'alert') g.aw = Math.max(0, g.aw - 0.4 * 0.1);
      }
      // Bodies.
      if (g.state !== 'alert') for (const b of this.guards) {
        if (b.state !== 'dead' || b.found || b === g) continue;
        const d = Math.hypot(b.x - g.x, b.z - g.z);
        if (d > 18) continue;
        const ang = Math.abs(angDiff(Math.atan2(-(b.x - g.x), -(b.z - g.z)), g.yaw + g.look));
        if (ang > 0.9 && d > 3) continue;
        const lit = this.fac.lightAt(b.x, 0.5, b.z) > 0.35 || d < 9;
        if (!lit || !this.fac.los({ x: g.x, y: g.y + EYE, z: g.z }, { x: b.x, y: b.y + 0.3, z: b.z })) continue;
        b.found = true;
        this._alert(g, null, { x: b.x, z: b.z });
        g.searchT = 14;
        this.emit({ t: 'toast', m: b.chief ? 'They found the Site Chief’s body.' : 'A guard found a body.', c: 'amber' });
        break;
      }
      // Overwatch's quadcopter: guards shoot support drones they spot.
      const q = this.quad;
      if (q && q.alive) {
        const d = Math.hypot(q.x - g.x, q.y - g.y - EYE, q.z - g.z);
        const ang = Math.abs(angDiff(Math.atan2(-(q.x - g.x), -(q.z - g.z)), g.yaw + g.look));
        if (d < 28 && (ang < 0.9 || d < 8) && this.fac.los({ x: g.x, y: g.y + EYE, z: g.z }, q)) g.quadAw = Math.min(1, g.quadAw + 0.1 * (d < 10 ? 1.6 : 0.8));
        else g.quadAw = Math.max(0, g.quadAw - 0.03);
      }
    }
    // Radio call: the alarm only goes up if he gets the call off.
    if (g.radioT > 0) {
      g.radioT -= dt;
      if (g.radioT <= 0 && g.jamT <= 0) {
        this.raise(0.5, 'SENTINEL: a guard has radioed a contact.');
        // Nearby guards converge.
        for (const o of this.guards) if (o !== g && o.state !== 'dead' && o.state !== 'alert' && Math.hypot(o.x - g.x, o.z - g.z) < 34) { o.convergeT = 0.4 + this.rng() * 0.7; o.convergeAt = { ...(g.lkp || { x: g.x, z: g.z }) }; }
      }
    }
    if (g.convergeT > 0) { g.convergeT -= dt; if (g.convergeT <= 0) this._alert(g, null, g.convergeAt); }
    g.reactT = Math.max(0, g.reactT - dt);

    // Behaviour.
    if (g.state === 'patrol' && g.route) {
      if (g.wait > 0) {
        g.wait -= dt;
        g.look = Math.sin((g.wait) * 2.2) * 0.9;
      } else {
        g.look *= 0.9;
        const wp = g.route[g.ri % g.route.length];
        if (this._moveTo(g, wp.x, wp.z, dt, this._guardSpeed(g))) {
          g.ri++;
          g.wait = 0.6 + this.rng() * 1.6;
          g.path = null;
        }
      }
    } else if (g.state === 'post') {
      const p = g.post;
      if (Math.hypot(p.x - g.x, p.z - g.z) > 1) this._moveTo(g, p.x, p.z, dt, 1.6);
      else { g.yaw += angDiff(p.face, g.yaw) * Math.min(1, dt * 2); g.look = Math.sin(this.t * 0.35 + g.id) * p.sweep; }
    } else if (g.state === 'sus' || g.state === 'search') {
      g.searchT -= dt;
      if (g.lkp && this._moveTo(g, g.lkp.x, g.lkp.z, dt, this._guardSpeed(g))) {
        g.look = Math.sin(this.t * 1.6 + g.id) * 1.2;
        if (g.state === 'search' && g.searchT > 2) {
          // Sweep around the last known position.
          if (!g.sweepAt || Math.hypot(g.sweepAt.x - g.x, g.sweepAt.z - g.z) < 1) g.sweepAt = { x: g.lkp.x + (this.rng() - 0.5) * 12, z: g.lkp.z + (this.rng() - 0.5) * 12 };
          g.lkp = g.sweepAt;
        }
      }
      if (g.searchT <= 0) { g.state = g.post ? 'post' : 'patrol'; g.aw = 0; g.look = 0; g.path = null; }
    } else if (g.state === 'alert') {
      const tgt = g.target && agents.find((a) => a.role === g.target);
      const sees = tgt && g.seenT > 0 && this._canSee(g, tgt, 1.2) > 0;
      if (sees) {
        const dx = tgt.pos.x - g.x, dz = tgt.pos.z - g.z;
        g.yaw += angDiff(Math.atan2(-dx, -dz), g.yaw) * Math.min(1, dt * 8);
        g.look = 0;
        g.fireT -= dt;
        const d = Math.hypot(dx, dz);
        if (d > 20 && !g.post) this._moveTo(g, tgt.pos.x, tgt.pos.z, dt, 1.4);
        if (g.fireT <= 0 && g.reactT <= 0 && g.jamT <= 0 && d < 75) {
          g.fireT = 0.42 + this.rng() * 0.3;
          let p = this.D.guardAcc * clamp(1.15 - d / 70, 0.15, 1);
          if (tgt.stance === 2) p *= 0.6; else if (tgt.stance === 1) p *= 0.8;
          if (tgt.moving) p *= 0.8;
          if (tgt.cloak) p *= 0.35;
          const hit = this.rng() < p;
          const dmg = Math.round((9 + this.rng() * 6) * this.D.guardDmg);
          this.emit({ t: 'eshot', id: g.id, a: [g.x, g.y + 1.35, g.z], b: [tgt.pos.x, tgt.pos.y + 1.1, tgt.pos.z], role: tgt.role, hit, dmg });
          this.noise({ x: g.x, y: g.y, z: g.z }, 45, true);
        }
      } else if (g.tower) {
        // Tower posts hold the platform and scan toward the last known position.
        if (g.lkp) g.yaw += angDiff(Math.atan2(-(g.lkp.x - g.x), -(g.lkp.z - g.z)), g.yaw) * Math.min(1, dt * 3);
        g.look = Math.sin(this.t * 1.3 + g.id) * 0.5;
        g.searchT -= dt;
        if (g.searchT <= 0) { g.state = 'post'; g.aw = 0; }
      } else if (this.quad && this.quad.alive && g.quadAw >= 1 && g.jamT <= 0) {
        // No agent in sight but the quad is: shoot it.
        const q = this.quad;
        g.yaw += angDiff(Math.atan2(-(q.x - g.x), -(q.z - g.z)), g.yaw) * Math.min(1, dt * 8);
        g.fireT -= dt;
        if (g.fireT <= 0) {
          g.fireT = 0.5 + this.rng() * 0.3;
          const hit = this.rng() < 0.55;
          this.emit({ t: 'eshot', id: g.id, a: [g.x, g.y + 1.35, g.z], b: [q.x, q.y, q.z], role: 'quad', hit, dmg: 8 });
        }
      } else {
        g.searchT -= dt;
        if (g.lkp && this._moveTo(g, g.lkp.x, g.lkp.z, dt, this._guardSpeed(g))) {
          g.state = 'search';
          g.searchT = 8 + this.rng() * 6;
        }
        if (g.searchT <= 0) { g.state = 'search'; g.searchT = 8; }
      }
    }
    if (g.quadAw >= 1 && g.state !== 'alert' && g.state !== 'dead' && this.quad && this.quad.alive) {
      this._alert(g, null, { x: this.quad.x, z: this.quad.z });
      this.raise(0.05);
    }
  }

  _drone(d, dt, sense) {
    d.tagT = Math.max(0, d.tagT - dt);
    d.scanT = Math.max(0, d.scanT - dt);
    if (d.state === 'dead') {
      if (d.y > this.fac.heightAt(d.x, d.z) + 0.2) { d.fallV += 12 * dt; d.y = Math.max(this.fac.groundAt(d.x, d.z, d.y, 0.3) + 0.15, d.y - d.fallV * dt); }
      return;
    }
    if (d.empT > 0) { d.empT -= dt; d.y = Math.max(this.fac.heightAt(d.x, d.z) + 2, d.y - 2 * dt); return; }
    const agents = (this.agents || []).filter((a) => a.alive && !a.downed);
    if (this.alarm >= 1 && d.state === 'patrol' && this.lkp) { d.state = 'hunt'; d.lkp = { ...this.lkp }; d.huntT = 12; }
    // Fly.
    let tx, tz;
    if (d.state === 'hunt' && d.lkp) { tx = d.lkp.x; tz = d.lkp.z; d.huntT -= dt; if (d.huntT <= 0 && d.aw < 1) d.state = 'patrol'; }
    else { const wp = d.route[d.ri % d.route.length]; tx = wp.x; tz = wp.z; if (Math.hypot(tx - d.x, tz - d.z) < 3) d.ri++; }
    const speed = d.state === 'hunt' ? 10 : 6;
    const dx = tx - d.x, dz = tz - d.z, dist = Math.hypot(dx, dz);
    if (dist > 1.5) {
      d.x += (dx / dist) * Math.min(dist, speed * dt);
      d.z += (dz / dist) * Math.min(dist, speed * dt);
      d.yaw += angDiff(Math.atan2(-dx, -dz), d.yaw) * Math.min(1, dt * 3);
    } else d.yaw += dt * 0.8;
    const floor = Math.max(this.fac.heightAt(d.x, d.z), this.fac.insideBuilding(d.x, d.z) ? 8 : 0);
    d.y += (floor + d.alt - d.y) * Math.min(1, dt * 1.5);
    // Spinning 360° sensor.
    if (sense) {
      let best = null, bv = 0;
      const range = d.state === 'hunt' ? 30 : 22;
      for (const a of agents) {
        const tp = { x: a.pos.x, y: a.pos.y + 1, z: a.pos.z };
        const r = range * (a.cloak && !a.cloakFlicker ? 0.35 : 1);
        const dd = Math.hypot(tp.x - d.x, tp.y - d.y, tp.z - d.z);
        if (dd > r || !this.fac.los(d, tp)) continue;
        const v = 1 - dd / r;
        if (v > bv) { bv = v; best = a; }
      }
      if (best) {
        d.aw = Math.min(1.3, d.aw + 2 * 0.1 * (0.4 + bv));
        d.lkp = { x: best.pos.x, z: best.pos.z };
        if (d.aw >= 1) {
          if (d.state !== 'hunt' || !d.locked) this.emit({ t: 'toast', m: 'Drone has a lock on ' + (best.role === 'shooter' ? 'the shooter' : 'the spotter') + '!', c: 'red' });
          d.state = 'hunt';
          d.locked = true;
          d.huntT = 10;
          this.raise(0.02 * 10 * 0.1);
          this.lkp = { ...d.lkp };
          this.lkpT = 6;
          for (const g of this.guards) if (g.state !== 'dead' && g.state !== 'alert' && Math.hypot(g.x - d.x, g.z - d.z) < 45) this._alert(g, null, d.lkp);
          d.zapT -= 0.1;
          const dd = Math.hypot(best.pos.x - d.x, best.pos.z - d.z);
          if (d.zapT <= 0 && dd < 20) {
            d.zapT = 0.7 + this.rng() * 0.35;
            const hit = this.rng() < (best.cloak ? 0.45 : 0.8);
            this.emit({ t: 'eshot', id: d.id, a: [d.x, d.y - 0.2, d.z], b: [best.pos.x, best.pos.y + 1, best.pos.z], role: best.role, hit, dmg: Math.round((4 + this.rng() * 5) * this.D.guardDmg), zap: true });
          }
        }
      } else {
        d.locked = false;
        d.aw = Math.max(0, d.aw - 0.03);
      }
    }
  }

  _cam(c, dt, sense) {
    c.loopT = Math.max(0, c.loopT - dt);
    c.empT = Math.max(0, c.empT - dt);
    c.yaw = c.base + Math.sin(this.t * 0.4 + c.phase) * c.sweep;
    const blind = c.loopT > 0 || c.empT > 0 || this.spoofT > 0;
    if (!sense || blind) { if (blind) c.aw = Math.max(0, c.aw - 0.05); return; }
    let seen = null;
    for (const a of (this.agents || [])) {
      if (!a.alive || a.downed) continue;
      const tp = { x: a.pos.x, y: a.pos.y + 1, z: a.pos.z };
      const dx = tp.x - c.x, dz = tp.z - c.z, d = Math.hypot(dx, dz);
      let r = c.range * (a.cloak && !a.cloakFlicker ? 0.3 : 1);
      if (this.fac.lightAt(tp.x, tp.y, tp.z) < 0.35) r *= 0.5;
      if (d > r) continue;
      if (Math.abs(angDiff(Math.atan2(-dx, -dz), c.yaw)) > 0.5) continue;
      if (!this.fac.los(c, tp)) continue;
      seen = a;
      break;
    }
    if (seen) {
      c.aw = Math.min(1.5, c.aw + 0.1 / 1.1);
      if (c.aw >= 1) {
        if (!c.confirmed) { c.confirmed = true; this.emit({ t: 'toast', m: 'Camera has eyes on ' + (seen.role === 'shooter' ? 'the shooter' : 'the spotter') + '!', c: 'red' }); }
        this.raise(0.03);
        this.lkp = { x: seen.pos.x, z: seen.pos.z };
        this.lkpT = 6;
        for (const g of this.guards) if (g.state !== 'dead' && g.state !== 'alert' && Math.hypot(g.x - c.x, g.z - c.z) < 34) { g.convergeT = 0.4; g.convergeAt = { ...this.lkp }; }
      }
    } else { c.aw = Math.max(0, c.aw - 0.05); c.confirmed = false; }
  }

  // ---- intel ---------------------------------------------------------------------
  // Contacts Overwatch can see right now (console + through-wall HUD dots).
  revealed(e, access, extra) {
    if (e.state === 'dead' && e.kind === 'g') return true;
    if (e.tagT > 0 || this.scanT > 0) return true;
    const zone = this.fac.zoneAt(e.x, e.z);
    const tier = zone === 'out' ? 0 : zone === 'yard' ? 1 : zone === 'floor' ? 2 : 3;
    if (access >= tier) return true;
    // Hacked cameras relay what they see.
    for (const c of this.cams) {
      if (!c.hacked) continue;
      const dx = e.x - c.x, dz = e.z - c.z, d = Math.hypot(dx, dz);
      if (d < c.range && Math.abs(angDiff(Math.atan2(-dx, -dz), c.yaw)) < 0.55 && this.fac.los(c, { x: e.x, y: (e.y || 0) + 1.2, z: e.z })) return true;
    }
    if (extra && extra(e)) return true;
    return false;
  }

  // ---- networking ----------------------------------------------------------------
  snap() {
    const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
    return {
      g: this.guards.map((g) => [g.id, r1(g.x), r1(g.y), r1(g.z), r2(g.yaw + g.look), STATES.indexOf(g.state), r2(clamp(g.aw, 0, 1)), (g.chief ? 1 : 0) | (g.badge ? 2 : 0) | (g.found ? 4 : 0) | (g.moving ? 8 : 0) | (g.tower ? 16 : 0), Math.ceil(g.tagT), Math.ceil(g.scanT), g.rev ? 1 : 0]),
      d: this.drones.map((d) => [d.id, r1(d.x), r1(d.y), r1(d.z), r2(d.yaw), d.state === 'dead' ? 2 : d.state === 'hunt' ? 1 : 0, r2(clamp(d.aw, 0, 1)), d.empT > 0 ? 1 : 0, Math.ceil(d.tagT), d.rev ? 1 : 0]),
      c: this.cams.map((c) => [c.id, r2(c.yaw), (c.hacked ? 1 : 0) | (c.loopT > 0 ? 2 : 0) | (c.empT > 0 ? 4 : 0), r2(clamp(c.aw, 0, 1))]),
      al: r2(this.alarm), pk: r2(this.alarmPeak), ld: this.lockdown ? 1 : 0, lkp: this.lkpT > 0 && this.lkp ? [r1(this.lkp.x), r1(this.lkp.z)] : null, sp: Math.ceil(this.spoofT), sc: Math.ceil(this.scanT),
      st: this.stats,
    };
  }

  applySnap(s) {
    const seenG = new Set();
    for (const a of s.g) {
      const [id, x, y, z, yaw, st, aw, fl, tag, scan, rev] = a;
      seenG.add(id);
      let g = this.guards.find((q) => q.id === id);
      if (!g) {
        g = { id, kind: 'g', x, y, z, yaw, look: 0, state: STATES[st], hp: 1, chief: !!(fl & 1), obj: buildGuard(!!(fl & 1)), fallT: 0 };
        this.scene.add(g.obj);
        this.guards.push(g);
      }
      g.tx = x; g.ty = y; g.tz = z; g.tyaw = yaw;
      const ns = STATES[st];
      if (ns === 'dead' && g.state !== 'dead') g.fallT = 0;
      g.state = ns; g.aw = aw; g.chief = !!(fl & 1); g.badge = !!(fl & 2); g.found = !!(fl & 4); g.moving = !!(fl & 8); g.tower = !!(fl & 16);
      g.tagT = tag; g.scanT = scan; g.rev = !!rev; g.hp = ns === 'dead' ? 0 : 1;
    }
    this.guards = this.guards.filter((g) => { if (seenG.has(g.id)) return true; this.scene.remove(g.obj); return false; });
    for (const a of s.d) {
      const [id, x, y, z, yaw, st, aw, emp, tag, rev] = a;
      let d = this.drones.find((q) => q.id === id);
      if (!d) { d = { id, kind: 'd', x, y, z, yaw, obj: buildDrone() }; this.scene.add(d.obj); this.drones.push(d); }
      d.tx = x; d.ty = y; d.tz = z; d.tyaw = yaw;
      d.state = st === 2 ? 'dead' : st === 1 ? 'hunt' : 'patrol'; d.aw = aw; d.empT = emp; d.tagT = tag; d.rev = !!rev; d.hp = st === 2 ? 0 : 1;
    }
    for (const a of s.c) {
      const c = this.cams.find((q) => q.id === a[0]);
      if (!c) continue;
      c.yaw = a[1]; c.hacked = !!(a[2] & 1); c.loopT = a[2] & 2 ? 1 : 0; c.empT = a[2] & 4 ? 1 : 0; c.aw = a[3];
    }
    this.alarm = s.al; this.alarmPeak = s.pk; this.lockdown = !!s.ld; this.lkp = s.lkp ? { x: s.lkp[0], z: s.lkp[1] } : null; this.lkpT = s.lkp ? 1 : 0;
    this.spoofT = s.sp; this.scanT = s.sc; this.stats = s.st;
  }

  // ---- visuals (both sides) ------------------------------------------------------
  draw(dt, camPos) {
    const k = Math.min(1, dt * 12);
    for (const g of this.guards) {
      if (!this.sim && g.tx !== undefined) {
        if (Math.hypot(g.tx - g.x, g.tz - g.z) > 6) { g.x = g.tx; g.z = g.tz; }
        g.x += (g.tx - g.x) * k; g.y += (g.ty - g.y) * k; g.z += (g.tz - g.z) * k;
        g.yaw += angDiff(g.tyaw, g.yaw) * k;
        g.look = 0;
      }
      const o = g.obj, U = o.userData;
      o.position.set(g.x, g.y, g.z);
      o.rotation.y = g.yaw + (g.look || 0);
      const dead = g.state === 'dead';
      if (dead) {
        g.fallT = Math.min(1, (g.fallT || 0) + dt * 2.2);
        U.body.rotation.x = -Math.PI / 2 * easeOut(g.fallT);
        U.body.position.y = 0.12 * g.fallT;
        U.beam.visible = false;
        U.tag.visible = false;
        for (const L of U.legs) L.rotation.x = 0;
        continue;
      }
      U.body.rotation.x = 0;
      U.body.position.y = 0;
      U.beam.visible = !g.tower;
      if (g.moving) U.phase += dt * (g.state === 'alert' ? 11 : 7);
      const sw = g.moving ? Math.sin(U.phase) * 0.55 : 0;
      U.legs[0].rotation.x = sw;
      U.legs[1].rotation.x = -sw;
      U.gun.rotation.x = g.state === 'alert' ? 0 : -0.35;
      const showTag = g.state === 'alert' || g.state === 'sus' || g.state === 'search' || (g.aw > 0.15);
      U.tag.visible = showTag && Math.hypot(camPos.x - g.x, camPos.z - g.z) < 120;
      if (showTag) {
        const red = g.state === 'alert' || g.state === 'search';
        U.tag.material = icon(red ? 'alert' : 'sus');
        const s = 0.35 + 0.25 * clamp(g.aw, 0, 1);
        U.tag.scale.set(s, s, 1);
      }
    }
    for (const d of this.drones) {
      if (!this.sim && d.tx !== undefined) {
        d.x += (d.tx - d.x) * k; d.y += (d.ty - d.y) * k; d.z += (d.tz - d.z) * k; d.yaw += angDiff(d.tyaw, d.yaw) * k;
      }
      const o = d.obj;
      o.position.set(d.x, d.y, d.z);
      o.rotation.y = d.yaw;
      const dead = d.state === 'dead';
      if (dead) { o.rotation.z = 1.2; o.userData.beam.visible = false; if (this.sim && d.respawnT !== undefined && d.respawnT < 50) o.visible = d.y > 0.2 || d.respawnT > 30; continue; }
      o.visible = true;
      o.rotation.z = Math.sin(this.t * 2 + d.id) * 0.04;
      for (const r of o.userData.rotors) r.rotation.y += dt * 40;
      o.userData.beam.visible = !(d.empT > 0);
      o.userData.beam.rotation.y = this.t * 1.4;
      o.userData.beam.material.uniforms.uC.value.set(d.state === 'hunt' ? '#ff5060' : '#e8f0ff');
    }
    for (const c of this.cams) {
      const U = c.obj.userData;
      U.head.rotation.set(-0.35, c.yaw, 0, 'YXZ');
      const blind = c.loopT > 0 || c.empT > 0 || this.spoofT > 0;
      const col = c.hacked ? '#30ffd0' : blind ? '#404040' : c.aw > 0.2 ? '#ff2030' : '#ff6070';
      U.lens.material.color.set(col);
      U.cone.material.color.set(c.hacked ? '#30ffd0' : '#ff3040');
      U.cone.material.opacity = blind && !c.hacked ? 0.005 : c.aw > 0.2 ? 0.06 : 0.018;
      U.cone.visible = Math.hypot(camPos.x - c.x, camPos.z - c.z) < 70;
    }
  }

  dispose() {
    for (const g of this.guards) this.scene.remove(g.obj);
    for (const d of this.drones) this.scene.remove(d.obj);
    for (const c of this.cams) this.scene.remove(c.obj);
  }
}

export function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function easeOut(t) {
  return 1 - (1 - t) * (1 - t);
}

// Hit capsules for a standing guard (feet at x,y,z). Dead guards lie flat.
export function guardCapsules(g) {
  const cs = Math.cos(g.yaw), sn = Math.sin(g.yaw);
  const P = (lx, ly, lz) => new THREE.Vector3(g.x + lx * cs + lz * sn, g.y + ly, g.z - lx * sn + lz * cs);
  if (g.state === 'dead') return [{ part: 'torso', a: P(0, 0.25, 0.2), b: P(0, 0.25, 1.6), r: 0.3 }];
  return [
    { part: 'head', a: P(0, 1.6, 0), b: P(0, 1.68, 0), r: 0.17 },
    { part: 'torso', a: P(0, 0.95, 0), b: P(0, 1.42, 0), r: 0.3 },
    { part: 'legs', a: P(0, 0.08, 0), b: P(0, 0.9, 0), r: 0.21 },
  ];
}
void FENCE;
