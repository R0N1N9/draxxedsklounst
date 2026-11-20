// Sniper Cell — more systems on CellGame's prototype:
//   lights you can shoot out · suppressors and fire modes · the knife · IR strobes, lasers
//   and night-vision layers · the dropped drive · radio voices · hunt ghosts (last known
//   position) · SYNC shots (both rifles on marked heads → the light goes green).
import * as THREE from 'three';
import { ROOMS, BUILDING } from './facility.js';
import { guardCapsules } from './sentinel.js';
import { addStrobes, blinkStrobes, IRLaser, ghostAvatar, tickGhosts, IR_LAYER } from './irfx.js';

export const Kit2 = {
  // A payload target ({x,z,y?}) inside the building → its room (floor from y, else the
  // tablet's floor, else the operator's).
  _roomFor(t) {
    if (!t || !this.fac.insideBuilding(t.x, t.z)) return null;
    const y = t.y ?? (this.tablet && this.tablet.visible ? this.tablet.floor * BUILDING.f1 : this.player.pos.y);
    return this.fac.roomAt(t.x, t.z, y + 0.5);
  },

  // Host: a lamp or panel shot out — glass, sparks, and someone may come and look.
  _shootLight(id, at) {
    if (!this.fac.breakLight(id)) return;
    this.sentinel.noise({ x: at.x, y: at.y, z: at.z }, 12, false);
    this._broadcastFx({ k: 'glass', x: at.x, y: at.y, z: at.z });
    this.atmos.syncLamps();
  },

  _toggleSup() {
    const w = this.player.w;
    if (w.def.slot === 'rifle') { this.hud.flash('RIFLE SUPPRESSOR IS INTEGRAL', 'dim'); return; }
    w.sup = !w.sup;
    this.hud.flash(w.sup ? 'SUPPRESSOR ON' : 'SUPPRESSOR OFF — LOUD', w.sup ? 'cyan' : 'red');
    this.audio.click();
  },
  _cycleMode() {
    const w = this.player.w, M = w.def.modes;
    w.mode = M[(M.indexOf(w.mode) + 1) % M.length];
    this.hud.flash(w.mode.toUpperCase(), 'cyan', 0.7);
    this.audio.click();
  },

  // Knife takedown: a quick stab from low right.
  _knife() {
    this.knifeT = 0.55;
    this.knife.visible = true;
    this.sfx.blade(this.camera.position);
    this.audio.hitConfirm(true);
    this.hud.flash('TAKEDOWN', 'cyan', 0.7);
  },
  _knifeTick(dt) {
    if (!(this.knifeT > 0)) { this.knife.visible = false; return; }
    this.knifeT -= dt;
    const u = 1 - this.knifeT / 0.55;
    const thrust = Math.sin(Math.min(1, u * 1.6) * Math.PI);
    this.knife.position.set(0.12 - 0.08 * thrust, -0.16 + 0.06 * thrust, -0.25 - 0.18 * thrust);
    this.knife.rotation.set(-0.2 + 0.3 * thrust, 0.3, -0.5 * thrust);
    if (this.knifeT <= 0) this.knife.visible = false;
  },

  // ---- IR: strobes, lasers, ghosts --------------------------------------------------
  _irInit() {
    this.strobes = { partner: addStrobes(this.partner.avatar), self: addStrobes(this.selfAvatar) };
    this.irLasers = { me: new IRLaser(this.scene), partner: new IRLaser(this.scene) };
    this.ghosts = {};
    for (const r of ['shooter', 'spotter']) this.ghosts[r] = ghostAvatar(this._look(r), this.scene);
    // Partner's drive, strapped to their back.
    this.partnerDrive = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.3), new THREE.MeshBasicMaterial({ color: '#ff9a20' }));
    this.partnerDrive.position.set(0.15, 0.35, 0.2);
    if (this.partner.avatar.spine) this.partner.avatar.spine.add(this.partnerDrive);
    this.groundDriveMesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.4), new THREE.MeshBasicMaterial({ color: '#ff9a20' }));
    this.groundDriveMesh.visible = false;
    this.scene.add(this.groundDriveMesh);
  },

  // Whether the view you're looking through sees IR (night vision, scope NV, quad, ISR IR).
  _irView() {
    const P = this.player;
    if (this.isr.active) return this.isr.mode === 'IR';
    return this.nv || !!(this.quad && this.quad.active) || (P.def.scope && P.scopeT > 0.6);
  },

  _irTick(dt) {
    const t = this.t;
    blinkStrobes(this.strobes.partner, t, 0.5);
    blinkStrobes(this.strobes.self, t, 0);
    tickGhosts(t);
    const ir = this._irView();
    if (ir) this.camera.layers.enable(IR_LAYER); else this.camera.layers.disable(IR_LAYER);
    // Lasers: from your weapon along your aim, and from your partner's.
    const P = this.player;
    const o = P.eyePos(new THREE.Vector3());
    const live = !this.downed && !this.kia && !this.isr.active && !(this.quad && this.quad.active);
    if (live) {
      const dir = P.aimDir(new THREE.Vector3());
      const from = o.clone().add(new THREE.Vector3(0.12, -0.14, 0).applyEuler(this.camera.rotation));
      const end = o.clone().addScaledVector(dir, 220);
      const h = this.fac.ray(o, end, 'shot');
      this.irLasers.me.set(from, h ? h.point : end, true);
    } else this.irLasers.me.set(o, o, false);
    const Q = this.partner;
    if (Q.seen && !Q.kia && !Q.downed && !Q.seated && !(Q.ai && Q.avatarHidden)) {
      const eye = Q.st === 2 ? 0.45 : Q.st === 1 ? 1.1 : 1.5;
      const a = new THREE.Vector3(Q.pos.x, Q.pos.y + eye, Q.pos.z);
      const yaw = Q.yaw || 0, pitch = Q.pitch || 0;
      const d = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      const end = a.clone().addScaledVector(d, 220);
      const h = this.fac.ray(a.clone().addScaledVector(d, 0.6), end, 'shot');
      this.irLasers.partner.set(a.clone().addScaledVector(d, 0.5), h ? h.point : end, true);
    } else this.irLasers.partner.set(o, o, false);
    // Hunt ghosts: where SENTINEL last saw each operator, while they hunt.
    for (const role of ['shooter', 'spotter']) {
      const G = this.ghosts[role], H = this._huntInfo(role);
      const show = H && H.state === 'hunted' && H.lkp && this.agentPos(role).distanceTo(new THREE.Vector3(H.lkp.x, H.lkp.y, H.lkp.z)) > 2.5 && !(this.solo && role !== this.role && !this.aiPartner);
      G.setVisible(!!show);
      if (show) G.update(dt, { p: new THREE.Vector3(H.lkp.x, H.lkp.y, H.lkp.z), yaw: H.lkp.yaw, pitch: 0, st: H.lkp.st, moving: false, w: role === 'spotter' });
    }
    this.partnerDrive.visible = this.obj.drive === this.partnerRole;
    this._syncTick(dt);
    this._wlTick();
  },

  _groundDrive() {
    const ob = this.obj, D = this.groundDriveMesh;
    D.visible = ob.drive === 'ground' && !!ob.driveAt;
    if (D.visible) { D.position.set(ob.driveAt.x, (ob.driveAt.y || 0) + 0.06, ob.driveAt.z); D.rotation.y = this.t; }
  },

  // Map the scene's fixed point lights onto the nearest light source, so they die with it.
  _mapPoints() {
    for (const pt of this.points) {
      let best = null, bd = 1e9;
      for (const L of this.fac.lightSources) {
        const d = Math.hypot(L.x - pt.L.position.x, (L.y - pt.L.position.y) * 2, L.z - pt.L.position.z);
        if (d < bd) { bd = d; best = L; }
      }
      pt.src = bd < 12 ? best : null;
    }
  },

  // Host: authoritative hunt info; guest: from the snapshot.
  _huntInfo(role) {
    const S = this.sentinel;
    if (this.isHost) { const H = S.hunt[role]; return H && H.lkp ? { state: S.huntState(role), lkp: H.lkp, since: S.t - H.seen } : null; }
    const h = S.huntSnap && S.huntSnap[role];
    return h ? { state: h[0], lkp: { x: h[1], y: h[2], z: h[3], yaw: h[4], st: h[5] }, since: h[6] } : null;
  },

  // ---- radio voices ------------------------------------------------------------------
  // who: 'shooter' | 'spotter' | 'isr' (or 'partner' / 'me'). Plays locally.
  _voice(who, text) {
    if (!this.radio) return;
    if (who === 'me') who = this.role;
    if (who === 'partner') who = this.partnerRole;
    this.radio.say(who, text);
  },

  // ---- SYNC shots -----------------------------------------------------------------------
  // Each rifle "holds" a sync-marked head under its crosshair; when both do, the light goes
  // green and a shot from either fires both (the AI shooter takes its shot with yours).
  _syncAimFrom(o, dir, fovDeg, exclude) {
    let best = 0, bs = 0.012 * (62 / fovDeg);
    for (const g of this.sentinel.guards) {
      if (!g.sync || g.state === 'dead' || g.id === exclude) continue;
      const h = guardCapsules(g)[0].a;
      const v = h.clone().sub(o);
      if (v.length() > 400) continue;
      const ang = v.normalize().angleTo(dir);
      if (ang < bs && this.fac.los(o, h)) { bs = ang; best = g.id; }
    }
    return best;
  },
  _syncTick() {
    const P = this.player;
    const marks = this.sentinel.guards.filter((g) => g.sync && g.state !== 'dead').length;
    this.syncMarks = marks;
    if (!marks) { this.syncAim = 0; this.syncPartner = 0; return; }
    const o = P.eyePos(new THREE.Vector3());
    const live = !this.downed && !this.kia && !this.isr.active && !(this.quad && this.quad.active);
    this.syncAim = live && P.def.slot === 'rifle' || (live && P.scopeT > 0.4) ? this._syncAimFrom(o, P.aimDir(new THREE.Vector3()), this.camera.fov, 0) : 0;
    if (this.aiShoot) {
      // Ra: any other sync target in view from the perch.
      const perch = this.partner.pos;
      const eye = new THREE.Vector3(perch.x, perch.y + 0.55, perch.z);
      let pick = 0;
      for (const g of this.sentinel.guards) {
        if (!g.sync || g.state === 'dead' || (g.id === this.syncAim && marks > 1)) continue;
        const h = guardCapsules(g)[0].a;
        if (eye.distanceTo(h) < 340 && this.fac.los(eye, h)) { pick = g.id; break; }
      }
      this.syncPartner = this.aiShoot.moveT > 0 || this.partner.seated ? 0 : pick;
    } else this.syncPartner = this.partner.sy || 0;
  },
  get syncReady() {
    return !!(this.syncAim && this.syncPartner && (this.syncAim !== this.syncPartner || this.syncMarks === 1));
  },
  // Called when you fire: the AI shooter fires with you on a green light.
  _syncFire() {
    if (!this.syncReady || !this.aiShoot) return;
    const g = this.sentinel.byId(this.syncPartner);
    if (!g || g.state === 'dead') return;
    const perch = this.partner.pos;
    const a = new THREE.Vector3(perch.x, perch.y + 0.55, perch.z);
    const h = guardCapsules(g)[0].a;
    this._trail(a, h, false);
    this.audio.shotDistant(a, this.camera.position.distanceTo(a) / 343, true);
    if (this.isHost) this._applyHit(g.id, 999, 'ai', null, 'ai', true, a.distanceTo(h));
    this.hud.flash('SYNC SHOT', 'cyan', 1);
    this._voice('partner', 'Sync shot. Both down.');
  },
};

export function installKit2(Cls) {
  Object.assign(Cls.prototype, Kit2, WeaponLight);
  Object.defineProperty(Cls.prototype, 'syncReady', Object.getOwnPropertyDescriptor(Kit2, 'syncReady'));
}
void ROOMS;

// ---- Weapon lights (L) ----------------------------------------------------------------
// A white weapon light. It lights your way and makes you far easier to see — but guards who
// catch the spot where it lands walk over to look, so you can paint a wall, send them that
// way, and move. Shine it in someone's face and they know exactly where you are.
export const WeaponLight = {
  _wlInit() {
    this.wl = { on: false };
    const mk = () => {
      const L = new THREE.SpotLight('#eef4ff', 0, 48, 0.3, 0.55, 1.3);
      const t = new THREE.Object3D();
      this.scene.add(L, t);
      L.target = t;
      return L;
    };
    this.wlSpot = mk();
    this.wlPartner = mk();
    // Visible beam for your partner's light.
    this.wlBeam = new THREE.Mesh(new THREE.ConeGeometry(2.2, 16, 14, 1, true).translate(0, -8, 0).rotateX(Math.PI / 2), new THREE.ShaderMaterial({
      vertexShader: 'varying float vD; varying vec3 vN; varying vec3 vV; void main(){ vD = clamp(length(position) / 16.0, 0.0, 1.0); vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vD; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.0); gl_FragColor = vec4(vec3(0.85, 0.92, 1.0) * (1.0 - vD) * (1.0 - vD) * 0.08 * f, 1.0); }',
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.wlBeam.visible = false;
    this.scene.add(this.wlBeam);
  },
  _wlToggle() {
    this.wl.on = !this.wl.on;
    this.audio.click();
    this.hud.flash(this.wl.on ? 'WEAPON LIGHT ON' : 'WEAPON LIGHT OFF', this.wl.on ? 'amber' : 'dim', 0.7);
  },
  // Source, direction and where the beam lands, for a light at eye `o` looking along `d`.
  _wlCast(o, d) {
    const end = o.clone().addScaledVector(d, 45);
    const h = this.fac.ray(o.clone().addScaledVector(d, 0.5), end, 'sight');
    return { x: o.x, y: o.y, z: o.z, dx: d.x, dy: d.y, dz: d.z, hit: h ? h.point.clone().addScaledVector(d, -0.3) : end };
  },
  _wlTick() {
    const P = this.player;
    const live = !this.downed && !this.kia && !this.isr.active && !(this.quad && this.quad.active) && !this._seat();
    // Yours.
    if (this.wl.on && live) {
      const o = P.eyePos(new THREE.Vector3()), d = P.aimDir(new THREE.Vector3());
      this.wlMine = this._wlCast(o, d);
      // Source just past the muzzle, so the beam lights the world, not your own gun.
      this.wlSpot.position.copy(o).addScaledVector(d, 1.1);
      this.wlSpot.target.position.copy(this.wlMine.hit);
      this.wlSpot.intensity = 40;
    } else { this.wlMine = null; this.wlSpot.intensity = 0; }
    // Your partner's.
    const Q = this.partner;
    if (Q.wl && Q.seen && !Q.downed && !Q.kia && !Q.seated) {
      const eye = Q.st === 2 ? 0.45 : Q.st === 1 ? 1.1 : 1.5;
      const o = new THREE.Vector3(Q.pos.x, Q.pos.y + eye, Q.pos.z);
      const yaw = Q.yaw || 0, pitch = Q.pitch || 0;
      const d = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      this.wlTheirs = this._wlCast(o, d);
      this.wlPartner.position.copy(o).addScaledVector(d, 0.5);
      this.wlPartner.target.position.copy(this.wlTheirs.hit);
      this.wlPartner.intensity = 40;
      this.wlBeam.visible = true;
      this.wlBeam.position.copy(this.wlPartner.position);
      this.wlBeam.lookAt(this.wlTheirs.hit);
      this.wlBeam.rotateY(Math.PI);
    } else { this.wlTheirs = null; this.wlPartner.intensity = 0; this.wlBeam.visible = false; }
  },
};
