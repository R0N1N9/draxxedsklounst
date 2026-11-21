// Sniper Cell — directional audio cues, made for headphones (HRTF panning on every source):
//   guard footsteps     nearby walkers, heavier for juggernauts and titans; muffled through walls
//   radio chatter       squelch bursts from alerted / searching guards
//   patrol-drone rotors a soft rotor whoosh on the two nearest drones, quieter behind cover
//   partner footsteps   so you can hear your buddy coming up beside you
import * as THREE from 'three';

const HEAVY = new Set(['jugg', 'titan', 'overseer']);

export const Spatial = {
  _spatialInit() {
    this._sp = { steps: new Map(), radio: new Map(), loops: new Set(), los: new Map(), losT: 0, partnerT: 0, partnerPrev: null };
  },

  _spatialTick(dt) {
    const A = this.audio;
    if (!A || !A.ctx) return;
    const sp = this._sp, S = this.sentinel;
    const ear = this.camera.getWorldPosition(new THREE.Vector3());
    const off = this.ended || (this.cine && this.cine.active);
    // Occlusion is checked a few times a second, not every frame.
    sp.losT -= dt;
    const recheck = sp.losT <= 0;
    if (recheck) sp.losT = 0.25;
    const heard = (e, y) => {
      if (recheck || !sp.los.has(e.id)) sp.los.set(e.id, this.fac.los(ear, { x: e.x, y, z: e.z }));
      return sp.los.get(e.id);
    };
    // Footsteps and radios from the nearest guards.
    const near = off ? [] : S.guards
      .filter((g) => g.state !== 'dead')
      .map((g) => ({ g, d: Math.hypot(g.x - ear.x, (g.y || 0) - ear.y, g.z - ear.z) }))
      .filter((o) => o.d < 26)
      .sort((a, b) => a.d - b.d)
      .slice(0, 6);
    for (const { g, d } of near) {
      const y = (g.y || 0) + 1.2;
      if (g.moving) {
        const fast = g.state === 'alert' || g.state === 'berserk' || g.state === 'flee';
        let t = (sp.steps.get(g.id) ?? Math.random() * 0.4) - dt;
        if (t <= 0) {
          t = fast ? 0.32 : HEAVY.has(g.type) ? 0.62 : 0.5;
          const vis = heard(g, y);
          A.stepAt({ x: g.x, y: (g.y || 0) + 0.1, z: g.z }, HEAVY.has(g.type), !vis, d < 6 ? 1 : 0.8);
        }
        sp.steps.set(g.id, t);
      }
      if ((g.state === 'alert' || g.state === 'search' || g.radioT > 0) && d < 18) {
        let r = (sp.radio.get(g.id) ?? 3 + Math.random() * 6) - dt;
        if (r <= 0) { r = 12 + Math.random() * 14; if (this.t - (sp.lastRadio || -99) > 6) { sp.lastRadio = this.t; A.radioAt({ x: g.x, y, z: g.z }, !heard(g, y)); } }
        sp.radio.set(g.id, r);
      }
    }
    // Patrol-drone hum: the three nearest drones within earshot.
    const want = new Set();
    if (!off) {
      const ds = S.drones.filter((d) => d.state !== 'dead').map((d) => ({ d, r: Math.hypot(d.x - ear.x, d.y - ear.y, d.z - ear.z) })).filter((o) => o.r < 45).sort((a, b) => a.r - b.r).slice(0, 2);
      for (const { d } of ds) {
        const key = 'pd' + d.id;
        want.add(key);
        if (!sp.loops.has(key)) { A.startLoop(key, { x: d.x, y: d.y, z: d.z }, 'rotor', 0.1); sp.loops.add(key); }
        A.updateLoop(key, { x: d.x, y: d.y, z: d.z });
        A.loopGain(key, heard(d, d.y) ? 0.1 : 0.035);
      }
    }
    for (const key of [...sp.loops]) if (!want.has(key)) { A.stopLoop(key); sp.loops.delete(key); }
    // Your partner's footsteps.
    const Q = this.partner;
    if (!off && Q && Q.pos && !Q.avatarHidden && !Q.ai && !Q.seated) {
      const prev = sp.partnerPrev;
      const moved = prev ? Math.hypot(Q.pos.x - prev.x, Q.pos.z - prev.z) / Math.max(dt, 1e-3) : 0;
      sp.partnerPrev = { x: Q.pos.x, z: Q.pos.z };
      const d = Math.hypot(Q.pos.x - ear.x, Q.pos.z - ear.z);
      if (moved > 0.8 && d < 20) {
        sp.partnerT -= dt;
        if (sp.partnerT <= 0) { sp.partnerT = moved > 4 ? 0.33 : 0.5; A.stepAt({ x: Q.pos.x, y: Q.pos.y + 0.1, z: Q.pos.z }, false, false, 0.55); }
      }
    }
  },
};

export function installSpatial(Cls) {
  for (const k of Object.keys(Spatial)) Cls.prototype[k] = Spatial[k];
}
