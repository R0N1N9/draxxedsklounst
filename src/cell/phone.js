// Sniper Cell — QUICKHACKS (spotter / lone operative). Hold TAB: your left hand brings up
// your phone, the HUD drops into scan mode (time slows when you play solo) and everything
// hackable in view gets tagged. Look at one, pick a hack (mouse wheel or 1/2), click (or E)
// to run it: thumb on the screen, a short upload, done. Release TAB to put the phone away.
//   camera   LOOP CAMERA (its feed goes to the console)    drone   SHORT CIRCUIT (8 s)
//   device   DISTRACT (IoT noise)                          door    OPEN (electronic locks only)
//   light    CUT LIGHT (20 s)                              guard   JAM COMMS · REBOOT OPTICS (blind 6 s)
// Quickhacks bypass the CYBER OPS console, so they still work after ICE knocks it offline.
// Each costs bandwidth.
import * as THREE from 'three';
import { glove } from './nvg.js';

const RANGE = 45;
const OPTS = {
  cam: [{ k: 'cam', name: 'LOOP CAMERA', bw: 6 }],
  drone: [{ k: 'pdrone', name: 'SHORT CIRCUIT', bw: 8 }],
  iot: [{ k: 'iot', name: 'DISTRACT', bw: 6 }],
  door: [{ k: 'door', name: 'OPEN DOOR', bw: 6 }],
  light: [{ k: 'plight', name: 'CUT LIGHT', bw: 4 }],
  guard: [{ k: 'jam', name: 'JAM COMMS', bw: 6 }, { k: 'blind', name: 'REBOOT OPTICS', bw: 10 }],
};
const EXEC = 0.6;

function buildPhone() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.135, 0.009), new THREE.MeshLambertMaterial({ color: '#15171b', emissive: '#15171b', emissiveIntensity: 0.3 }));
  g.add(body);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.122), new THREE.MeshBasicMaterial({ color: '#0e5a52' }));
  scr.position.z = 0.0051;
  g.add(scr);
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.044, 0.008), new THREE.MeshBasicMaterial({ color: '#30ffd0' }));
  bar.position.set(0, -0.035, 0.0056);
  g.add(bar);
  const hand = glove();
  // Gripping it from below: fingers up the back of the phone, wrist dropping out of view.
  hand.position.set(0.006, -0.07, -0.016);
  hand.rotation.set(1.27, 0, -0.1);
  hand.scale.setScalar(0.85);
  g.add(hand);
  g.userData = { scr, bar };
  return g;
}

export const Phone = {
  _phoneInit() {
    this.qh = { on: false, k: 0, target: null, list: [], opt: 0, exec: null, scanT: 0, press: 0 };
    this.phoneObj = buildPhone();
    this.phoneObj.visible = false;
    this.phoneObj.traverse((o) => { o.renderOrder = 12; o.frustumCulled = false; });
    this.camera.add(this.phoneObj);
    addEventListener('wheel', (e) => { if (this.qh.on) this._qhWheel = Math.sign(e.deltaY); }, { passive: true });
    addEventListener('mousedown', (e) => { if (this.qh.on && e.button === 0) this._qhClick = true; });
  },

  _qhCan() {
    return (this.role === 'spotter' || this.operative) && !this.downed && !this.kia && !this.tablet.visible && !this.isr.active && !(this.quad && this.quad.active) && !this.ended;
  },
  _qhEnter() {
    if (!this._qhCan()) return;
    const Q = this.qh;
    Q.on = true;
    Q.scanT = 0;
    Q.opt = 0;
    this._qhClick = false;
    this.sfx.ui(true);
    this.hud.root.classList.add('qh');
  },
  _qhExit() {
    const Q = this.qh;
    if (!Q.on) return;
    Q.on = false;
    Q.target = null;
    Q.list = [];
    this.hud.root.classList.remove('qh');
    this.sfx.ui(false);
  },

  _qhScan() {
    const cam = this.camera, o = cam.getWorldPosition(new THREE.Vector3()), dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const S = this.sentinel, F = this.fac;
    const half = THREE.MathUtils.degToRad(cam.fov * 0.6);
    const lim = 0.07 * (62 / cam.fov);
    const list = [];
    let best = null, bs = lim;
    const consider = (kind, id, x, y, z, name) => {
      const v = new THREE.Vector3(x, y, z).sub(o), d = v.length();
      if (d > RANGE) return;
      const n = v.clone().normalize();
      const a = n.angleTo(dir);
      if (a > half) return;
      // Sight to a point just in front of it (wall-mounted kit sits inside its wall).
      if (!F.los(o, { x: x - n.x * 0.45, y: y - n.y * 0.45, z: z - n.z * 0.45 })) return;
      const e = { kind, id, x, y, z, name, d };
      list.push(e);
      if (a < bs) { bs = a; best = e; }
    };
    for (const c of S.cams) if (!c.hacked) consider('cam', c.id, c.x, c.y, c.z, 'CAMERA');
    for (const d of S.drones) if (d.state !== 'dead' && !(d.empT > 0)) consider('drone', d.id, d.x, d.y, d.z, 'PATROL DRONE');
    for (const D of F.devices) consider('iot', D.id, D.x, D.y, D.z, D.kind.toUpperCase());
    for (const d of Object.values(F.doors)) if ((d.kind === 'elec' || d.kind === 'dock') && !d.open && !d.sealed && !d.unlocked) consider('door', d.id, d.x, (d.y || 0) + 1.2, d.z, 'E-LOCK DOOR');
    for (const L of F.lightSources || []) if (!L.broken && !(L.offT > 0)) consider('light', L.id, L.x, L.y, L.z, L.kind === 'panel' ? 'CEILING PANEL' : 'LAMP');
    for (const g of S.guards) if (g.state !== 'dead') consider('guard', g.id, g.x, (g.y || 0) + 1.5, g.z, ({ scav: 'SCAV', jugg: 'JUGGERNAUT', bulwark: 'BULWARK', titan: 'TITAN', overseer: 'OVERSEER' }[g.type] || 'GUARD'));
    return { list, best };
  },

  // Per frame (local). act is consumed while the phone is up (no shooting).
  _qhTick(dt, I, act) {
    const Q = this.qh;
    if (Q.on && !this._qhCan()) this._qhExit();
    Q.k += ((Q.on ? 1 : 0) - Q.k) * Math.min(1, dt * 9);
    Q.press = Math.max(0, Q.press - dt * 5);
    // The phone in your left hand.
    const ph = this.phoneObj;
    ph.visible = Q.k > 0.02;
    if (ph.visible) {
      const k = Q.k;
      ph.position.set(-0.3 + 0.17 * k, -0.48 + 0.35 * k - Q.press * 0.012, -0.38 + 0.03 * k - Q.press * 0.01);
      ph.rotation.set(0.75 - 0.4 * k, 0.55 - 0.15 * k, 0.12);
      const U = ph.userData;
      U.scr.material.color.set(Q.press > 0.3 ? '#bffff2' : Q.exec ? '#1aa08c' : '#0e5a52');
      U.bar.scale.x = Q.exec ? Math.max(0.05, Q.exec.t / EXEC) : 0.3 + 0.2 * Math.sin(this.t * 4);
    }
    if (!Q.on) { Q.exec = null; return; }
    const fired = act.fire;
    act.fire = act.fireHeld = act.scope = false; act.reload = false; act.slot1 = act.slot2 = act.swap = false; act.zoomIn = act.zoomOut = false;
    // Running hack.
    if (Q.exec) {
      Q.exec.t += dt;
      if (Q.exec.t >= EXEC) { const e = Q.exec; Q.exec = null; this._qhRun(e.tg, e.opt); Q.scanT = 0; }
      this._qhClick = false;
      return;
    }
    Q.scanT -= dt;
    if (Q.scanT <= 0) {
      Q.scanT = 0.15;
      const r = this._qhScan();
      Q.list = r.list;
      if (!Q.target || !r.best || Q.target.kind !== r.best.kind || Q.target.id !== r.best.id) Q.opt = 0;
      Q.target = r.best;
    }
    const opts = Q.target ? OPTS[Q.target.kind] : null;
    if (opts) {
      if (I.pressed('Digit1')) Q.opt = 0;
      if (I.pressed('Digit2') && opts.length > 1) Q.opt = 1;
      if (this._qhWheel) { Q.opt = (Q.opt + (this._qhWheel > 0 ? 1 : opts.length - 1)) % opts.length; this._qhWheel = 0; }
      const go = fired || this._qhClick || I.pressed('KeyE') || I.pressed('cell-use');
      this._qhClick = false;
      if (go) {
        const o = opts[Q.opt];
        if (this.ops && this.ops.bw < o.bw) { this.hud.flash('NOT ENOUGH BANDWIDTH', 'red'); return; }
        Q.exec = { t: 0, tg: Q.target, opt: o };
        Q.press = 1;
        this.audio.click();
      }
    } else this._qhClick = false;
  },

  _qhRun(tg, o) {
    if (this.ops) this.ops.bw = Math.max(0, this.ops.bw - o.bw);
    this.sfx.ui(true);
    if (o.k === 'jam') this.payload('jam', { x: tg.x, z: tg.z });
    else this.payload(o.k, { id: tg.id });
    this.hud.flash(`QUICKHACK · ${o.name}`, 'cyan', 0.9);
  },

  // HUD: scan tint, tags on everything hackable in view, and the hack menu on your target.
  _qhHud(c, proj, W, H) {
    const Q = this.qh;
    if (!Q || Q.k < 0.05) return;
    c.save();
    c.globalAlpha = Q.k;
    c.fillStyle = 'rgba(0,30,34,0.28)';
    c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(48,255,208,0.05)';
    for (let y = (this.t * 60) % 4; y < H; y += 4) c.fillRect(0, y, W, 1);
    const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,20,24,0.55)');
    c.fillStyle = vg;
    c.fillRect(0, 0, W, H);
    c.textAlign = 'center';
    c.font = '700 14px JetBrains Mono, monospace';
    c.fillStyle = 'rgba(48,255,208,0.95)';
    c.fillText(`QUICKHACK${this.solo ? ' · TIME SLOWED' : ''}  ·  BW ${this.ops ? Math.round(this.ops.bw) : '--'}`, W / 2, 88);
    if (!Q.on) { c.restore(); return; }
    c.font = '600 10px JetBrains Mono, monospace';
    for (const e of Q.list) {
      const p = proj(e.x, e.y, e.z);
      if (p.behind) continue;
      const sel = Q.target && e.kind === Q.target.kind && e.id === Q.target.id;
      c.strokeStyle = sel ? 'rgba(255,255,255,0.95)' : e.kind === 'guard' ? 'rgba(255,90,110,0.85)' : 'rgba(48,255,208,0.8)';
      c.lineWidth = sel ? 2 : 1;
      const r = sel ? 14 : 8;
      c.beginPath();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
      c.closePath(); c.stroke();
      if (!sel) { c.fillStyle = c.strokeStyle; c.fillText(e.name, p.x, p.y - r - 4); }
    }
    const tg = Q.target;
    if (tg) {
      const p = proj(tg.x, tg.y, tg.z);
      if (!p.behind) {
        const opts = OPTS[tg.kind];
        const x = Math.min(W - 230, p.x + 26), y = Math.max(110, p.y - 30);
        c.textAlign = 'left';
        c.fillStyle = 'rgba(2,12,14,0.86)';
        c.fillRect(x, y, 210, 34 + opts.length * 22);
        c.strokeStyle = 'rgba(48,255,208,0.9)';
        c.lineWidth = 1;
        c.strokeRect(x, y, 210, 34 + opts.length * 22);
        c.fillStyle = '#e8fffb';
        c.font = '700 12px JetBrains Mono, monospace';
        c.fillText(`${tg.name} · ${Math.round(tg.d)} m`, x + 10, y + 18);
        opts.forEach((o, i) => {
          const yy = y + 30 + i * 22;
          const on = i === Q.opt;
          if (on) { c.fillStyle = 'rgba(48,255,208,0.25)'; c.fillRect(x + 4, yy, 202, 19); }
          c.fillStyle = on ? '#30ffd0' : 'rgba(200,240,235,0.75)';
          c.font = `${on ? 700 : 600} 11px JetBrains Mono, monospace`;
          c.fillText(`${i + 1}  ${o.name}`, x + 10, yy + 14);
          c.textAlign = 'right';
          c.fillText(`${o.bw} BW`, x + 200, yy + 14);
          c.textAlign = 'left';
        });
        if (Q.exec) {
          c.fillStyle = '#30ffd0';
          c.fillRect(x, y + 34 + opts.length * 22 + 4, 210 * Math.min(1, Q.exec.t / EXEC), 4);
        }
      }
    }
    c.textAlign = 'center';
    c.font = '600 12px JetBrains Mono, monospace';
    c.fillStyle = 'rgba(200,240,235,0.85)';
    c.fillText(tg ? 'CLICK / E — EXECUTE  ·  WHEEL / 1-2 — CHOOSE HACK  ·  RELEASE TAB — PUT AWAY' : 'LOOK AT SOMETHING TO HACK  ·  RELEASE TAB — PUT AWAY', W / 2, H - 140);
    c.restore();
  },
};

export function installPhone(Cls) {
  for (const k of Object.keys(Phone)) Cls.prototype[k] = Phone[k];
}
