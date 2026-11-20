// Sniper Cell — PHONE HACKS: the spotter's line-of-sight hacking. Look at something
// hackable within 45 m and hold H (HACK on touch):
//   camera   loop it and pipe its feed to the console      drone    short it out for 8 s
//   device   make an IoT device go haywire (distraction)   door     pop an electronic door
//   light    kill one lamp / panel for 20 s                 guard    jam his earpiece
// Phone hacks bypass the CYBER OPS console, so they still work when SENTINEL's ICE has
// knocked the console offline. Each costs a little bandwidth.
import * as THREE from 'three';

const RANGE = 45, HOLD = 0.7, COST = 6;

export const Phone = {
  _phoneInit() {
    this.phone = { target: null, t: 0, scanT: 0, cd: 0 };
  },

  _phoneCan() {
    return (this.role === 'spotter' || this.operative) && !this.downed && !this.kia && !this.tablet.visible && !this.isr.active && !(this.quad && this.quad.active) && !this.ended;
  },

  // What's hackable under the crosshair (refreshed a few times a second).
  _phoneScan() {
    const cam = this.camera, o = cam.getWorldPosition(new THREE.Vector3()), dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const S = this.sentinel, F = this.fac;
    const lim = 0.06 * (62 / cam.fov);
    let best = null, bs = lim;
    const consider = (kind, id, x, y, z, name) => {
      const v = new THREE.Vector3(x, y, z).sub(o), d = v.length();
      if (d > RANGE) return;
      const a = v.normalize().angleTo(dir);
      if (a >= bs) return;
      // Check sight to a point just in front of it (wall-mounted kit sits inside its wall).
      const n = new THREE.Vector3(x, y, z).sub(o).normalize();
      if (!F.los(o, { x: x - n.x * 0.45, y: y - n.y * 0.45, z: z - n.z * 0.45 })) return;
      bs = a;
      best = { kind, id, x, y, z, name, d };
    };
    for (const c of S.cams) if (!c.hacked) consider('cam', c.id, c.x, c.y, c.z, 'CAMERA');
    for (const d of S.drones) if (d.state !== 'dead' && !(d.empT > 0)) consider('drone', d.id, d.x, d.y, d.z, 'PATROL DRONE');
    for (const D of F.devices) consider('iot', D.id, D.x, D.y, D.z, D.kind.toUpperCase());
    for (const d of Object.values(F.doors)) if ((d.kind === 'elec' || d.kind === 'dock') && !d.open && !d.sealed) consider('door', d.id, d.x, (d.y || 0) + 1.2, d.z, 'DOOR LOCK');
    for (const L of F.lightSources || []) if (!L.broken && !(L.offT > 0)) consider('light', L.id, L.x, L.y, L.z, L.kind === 'panel' ? 'CEILING PANEL' : 'LAMP');
    for (const g of S.guards) if (g.state !== 'dead' && !(g.jamT > 0)) consider('guard', g.id, g.x, (g.y || 0) + 1.5, g.z, 'EARPIECE');
    return best;
  },

  _phoneTick(dt, I) {
    const P = this.phone;
    P.cd = Math.max(0, P.cd - dt);
    if (!this._phoneCan()) { P.target = null; P.t = 0; return; }
    P.scanT -= dt;
    if (P.scanT <= 0 && P.t <= 0) { P.scanT = 0.2; P.target = this._phoneScan(); }
    const held = (I.held('KeyH') || I.held('T:cell-hack')) && P.target;
    if (held) {
      P.t += dt;
      if (P.t >= HOLD && P.cd <= 0) { this._phoneHack(P.target); P.t = 0; P.cd = 0.8; P.target = null; P.scanT = 0; }
    } else P.t = 0;
  },

  _phoneHack(tg) {
    const O = this.ops;
    if (O && O.bw < COST) { this.hud.flash('NOT ENOUGH BANDWIDTH', 'red'); return; }
    if (O) O.bw -= COST;
    this.sfx.ui(true);
    switch (tg.kind) {
      case 'cam': this.payload('cam', { id: tg.id }); break;
      case 'iot': this.payload('iot', { id: tg.id }); break;
      case 'door': this.payload('door', { id: tg.id, phone: true }); break;
      case 'drone': this.payload('pdrone', { id: tg.id }); break;
      case 'light': this.payload('plight', { id: tg.id }); break;
      case 'guard': this.payload('jam', { x: tg.x, z: tg.z }); break;
    }
    this.hud.flash(`PHONE HACK · ${tg.name}`, 'cyan', 0.9);
  },

  // HUD: a tag on the hackable under your crosshair and the phone's progress while you hold H.
  _phoneHud(c, proj, W, H) {
    const P = this.phone;
    if (!P || !P.target || !this._phoneCan()) return;
    const tg = P.target;
    const p = proj(tg.x, tg.y, tg.z);
    if (p.behind) return;
    c.save();
    c.strokeStyle = 'rgba(48,255,208,0.9)';
    c.lineWidth = 1.5;
    c.beginPath();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; const x = p.x + Math.cos(a) * 12, y = p.y + Math.sin(a) * 12; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
    c.closePath(); c.stroke();
    c.fillStyle = 'rgba(48,255,208,0.95)';
    c.font = '600 11px JetBrains Mono, monospace';
    c.textAlign = 'left';
    c.fillText(`${tg.name} · ${Math.round(tg.d)} m · HOLD H`, p.x + 18, p.y + 4);
    if (P.t > 0) {
      // The phone, low centre.
      const w = 210, h = 58, x = W / 2 - w / 2, y = H - 190;
      c.fillStyle = 'rgba(4,14,18,0.85)';
      c.fillRect(x, y, w, h);
      c.strokeRect(x, y, w, h);
      c.fillStyle = 'rgba(48,255,208,0.95)';
      c.fillText(`> breach ${tg.kind}_${tg.id} ...`, x + 10, y + 18);
      const k = Math.min(1, P.t / HOLD);
      c.fillRect(x + 10, y + 30, (w - 20) * k, 6);
      c.strokeRect(x + 10, y + 30, w - 20, 6);
      c.fillText(Math.random() < 0.5 ? '0x' + Math.floor(Math.random() * 0xffffff).toString(16) : 'handshake', x + 10, y + 50);
    }
    c.restore();
  },
};

export function installPhone(Cls) {
  for (const k of Object.keys(Phone)) Cls.prototype[k] = Phone[k];
}
