// Sandbox tools: teleport, AI control, wind/time of day, god mode, fly, trajectories, hitboxes, slow-mo.
import * as THREE from 'three';
import { PALETTES, applyPalette } from './atmosphere.js';
import { crestAt, DAM_X, DAM_TOP, LIFT_X } from './terrain.js';
import { DIFFICULTY } from './bot.js';

const PANEL_HTML = `
  <div class="sb-head"><span>// SANDBOX TOOLS</span><button class="sb-x" data-sb="close">×</button></div>
  <div class="sb-sec"><h4>Teleport</h4>
    <div class="sb-grid">
      <button data-tp="s">S ridge</button><button data-tp="n">N ridge</button>
      <button data-tp="a">A · town</button><button data-tp="b">B · dam</button><button data-tp="c">C · lift</button>
    </div>
  </div>
  <div class="sb-sec"><h4>AI sniper</h4>
    <div class="sb-row"><label>Behaviour</label><select data-sb="beh"><option value="off">Off</option><option value="passive">Passive (won't shoot)</option><option value="hostile">Hostile</option></select></div>
    <div class="sb-row"><label>Skill</label><select data-sb="diff"></select></div>
    <div class="sb-grid"><button data-sb="bring">Move AI to crosshair</button><button data-sb="respawn">Respawn AI</button></div>
  </div>
  <div class="sb-sec"><h4>Environment</h4>
    <div class="sb-row"><label>Wind toward <em data-v="wdir"></em></label><input type="range" min="0" max="359" step="1" data-sb="wdir"></div>
    <div class="sb-row"><label>Wind speed <em data-v="wspd"></em></label><input type="range" min="0" max="12" step="0.5" data-sb="wspd"></div>
    <div class="sb-row"><label>Time of day</label><select data-sb="tod"><option value="dusk">Dusk</option><option value="golden">Golden hour</option></select></div>
  </div>
  <div class="sb-sec"><h4>Cheats &amp; debug</h4>
    <label class="sb-chk"><input type="checkbox" data-sb="god"> God mode</label>
    <label class="sb-chk"><input type="checkbox" data-sb="ammo"> Infinite ammo</label>
    <label class="sb-chk"><input type="checkbox" data-sb="fly"> Fly (Space up · X down · Shift fast)</label>
    <label class="sb-chk"><input type="checkbox" data-sb="traj"> Show bullet trajectories</label>
    <label class="sb-chk"><input type="checkbox" data-sb="hit"> Show hitboxes</label>
    <label class="sb-chk"><input type="checkbox" data-sb="slow"> Slow motion (¼ speed)</label>
    <div class="sb-grid"><button data-sb="clear">Clear trajectories</button></div>
  </div>
  <p class="sb-foot">B or Esc closes this panel</p>`;

export class Sandbox {
  constructor(game) {
    this.g = game;
    this.god = false;
    this.infAmmo = false;
    this.fly = false;
    this.traj = false;
    this.hitboxes = false;
    this.lines = [];
    this.paths = new Map();
    this.boxPool = [];
    this.open = false;

    const panel = document.createElement('div');
    panel.id = 'sandbox';
    panel.innerHTML = PANEL_HTML;
    document.body.appendChild(panel);
    this.panel = panel;
    const q = (sel) => panel.querySelector(sel);
    const diff = q('[data-sb="diff"]');
    for (const [k, d] of Object.entries(DIFFICULTY)) diff.insertAdjacentHTML('beforeend', `<option value="${k}">${d.name[0] + d.name.slice(1).toLowerCase()}</option>`);
    diff.value = game.net.diffKey;
    q('[data-sb="beh"]').value = game.net.behaviour;
    q('[data-sb="tod"]').value = game.paletteKey;
    this._syncWindUI();

    panel.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.tp) this.teleport(b.dataset.tp);
      const act = b.dataset.sb;
      if (act === 'close') this.toggle(false);
      if (act === 'bring') this.bringAI();
      if (act === 'respawn') game.net.sandboxSpawn(game.net.side);
      if (act === 'clear') this.clearLines();
    });
    panel.addEventListener('input', (e) => {
      const el = e.target, k = el.dataset.sb;
      if (k === 'wdir' || k === 'wspd') this._applyWind();
      if (k === 'god') this.god = el.checked;
      if (k === 'ammo') this.infAmmo = el.checked;
      if (k === 'fly') this.fly = el.checked;
      if (k === 'traj') this.traj = el.checked;
      if (k === 'hit') this.hitboxes = el.checked;
      if (k === 'slow') game.timeScale = el.checked ? 0.25 : 1;
      if (k === 'beh') game.net.setBehaviour(el.value);
      if (k === 'diff') game.net.setDifficulty(el.value);
      if (k === 'tod') this.setTimeOfDay(el.value);
    });
    // Touch: a TOOLS button since there's no B key.
    if (game.input.touch) {
      const t = document.createElement('div');
      t.className = 'tb tools';
      t.textContent = 'TOOLS';
      t.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.toggle(); }, { passive: false });
      document.getElementById('touch').appendChild(t);
    }
  }

  toggle(force) {
    this.open = force ?? !this.open;
    this.panel.classList.toggle('on', this.open);
    this.g.toolsOpen = this.open;
    if (this.open) document.exitPointerLock && document.exitPointerLock();
    else this.g.input.requestLock();
  }

  _syncWindUI() {
    // Wind vector is (cos d, sin d) in x/z; bearing 0 = +Z (north), 90 = +X (east).
    const w = this.g.wind;
    const bearing = Math.round(((Math.atan2(Math.cos(w.dir), Math.sin(w.dir)) * 180) / Math.PI + 360) % 360);
    this.panel.querySelector('[data-sb="wdir"]').value = bearing;
    this.panel.querySelector('[data-sb="wspd"]').value = w.speed;
    this._labelWind();
  }

  _labelWind() {
    const d = this.panel.querySelector('[data-sb="wdir"]').value;
    const s = this.panel.querySelector('[data-sb="wspd"]').value;
    this.panel.querySelector('[data-v="wdir"]').textContent = `${String(d).padStart(3, '0')}°`;
    this.panel.querySelector('[data-v="wspd"]').textContent = `${(+s).toFixed(1)} m/s`;
  }

  _applyWind() {
    const bearing = (+this.panel.querySelector('[data-sb="wdir"]').value * Math.PI) / 180;
    const speed = +this.panel.querySelector('[data-sb="wspd"]').value;
    // Bearing B points toward x = sin B, z = cos B; Wind uses (cos d, sin d).
    const dir = Math.atan2(Math.cos(bearing), Math.sin(bearing));
    this.g.wind.set(dir, speed, this.g.wind.seed);
    this._labelWind();
  }

  setTimeOfDay(key) {
    const g = this.g;
    g.palette = PALETTES[key];
    g.paletteKey = key;
    g.sunDir = applyPalette(g.palette, { sky: g.world.sky, sunLight: g.sun, hemi: g.hemi, renderer: g.renderer });
  }

  teleport(where) {
    const g = this.g, w = g.world;
    let x, z, y = null, yaw = 0;
    if (where === 's') { x = -20; z = -(crestAt(x) - 8); yaw = Math.PI; }
    else if (where === 'n') { x = -20; z = crestAt(x) - 8; yaw = 0; }
    else if (where === 'a') { x = 0; z = -12; yaw = Math.PI; }
    else if (where === 'b') { x = DAM_X; z = -20; y = DAM_TOP; yaw = Math.PI; }
    else { x = LIFT_X - 11; z = -10; yaw = Math.PI; }
    const P = g.player;
    P.pos.set(x, y ?? w.groundAt(x, z, 1e4, 0), z);
    P.vel.set(0, 0, 0);
    P.yaw = yaw;
    if (!P.alive) g._spawnFree(), P.pos.set(x, y ?? w.groundAt(x, z, 1e4, 0), z);
    this.toggle(false);
  }

  bringAI() {
    const g = this.g;
    const o = g.player.eyePos(new THREE.Vector3());
    const d = g.player.aimDir(new THREE.Vector3());
    const hit = g.world.raycast(o, o.clone().addScaledVector(d, 1500), true);
    if (!hit) { g.hud.message('', 'Aim at the ground first', 1.5); return; }
    const p = hit.point.clone();
    p.y = g.world.groundAt(p.x, p.z, p.y + 1, 0.6);
    if (g.net.behaviour === 'off') {
      g.net.behaviour = 'passive';
      this.panel.querySelector('[data-sb="beh"]').value = 'passive';
    }
    g.net.sandboxSpawn(p.z > 0 ? 1 : -1, p);
    // Face the player.
    const e = g.player.pos;
    g.net.yaw = Math.atan2(-(e.x - p.x), -(e.z - p.z));
    g.hud.message('AI MOVED', `${Math.round(o.distanceTo(p))} m away`, 2);
    this.toggle(false);
  }

  preUpdate(dt, a) {
    this.a = a;
    if (this.g.input.pressed('KeyB')) this.toggle();
    else if (this.open && this.g.input.pressed('Escape')) this.toggle(false);
  }

  // Called after the player update: replace physics movement with free flight.
  flyMove(dt, from) {
    const g = this.g, P = g.player, a = this.a;
    const fast = g.input.held('ShiftLeft') || g.input.held('ShiftRight');
    const speed = fast ? 90 : 25;
    const f = new THREE.Vector3(-Math.sin(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch), -Math.cos(P.yaw) * Math.cos(P.pitch));
    const r = new THREE.Vector3(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
    P.pos.copy(from).addScaledVector(f, -a.my * speed * dt).addScaledVector(r, a.mx * speed * dt);
    if (g.input.held('Space') || g.input.held('T:jump')) P.pos.y += speed * dt;
    if (g.input.held('KeyX') || g.input.held('T:crouch')) P.pos.y -= speed * dt;
    const ground = g.world.heightAt(P.pos.x, P.pos.z);
    if (P.pos.y < ground) P.pos.y = ground;
    P.vel.set(0, 0, 0);
    P.stance = 0;
    P.onGround = false;
  }

  trace(b, dead) {
    if (!this.traj) return;
    let path = this.paths.get(b);
    if (!path) { path = [b.prev.clone()]; this.paths.set(b, path); }
    path.push(b.p.clone());
    if (dead) {
      this.paths.delete(b);
      const shot = this.g.myShots.get(b.id);
      const geo = new THREE.BufferGeometry().setFromPoints(path);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xf2b35b, transparent: true, opacity: 0.85, depthTest: false }));
      line.renderOrder = 20;
      line.frustumCulled = false;
      this.g.scene.add(line);
      this.lines.push(line);
      if (this.lines.length > 12) {
        const old = this.lines.shift();
        this.g.scene.remove(old);
        old.geometry.dispose();
      }
      if (shot) {
        const end = path[path.length - 1];
        const drop = this._dropAt(shot, end);
        this.g.hud.addMarker(end.clone().add(new THREE.Vector3(0, 0.5, 0)), drop, 'hitbody', 6);
      }
    }
  }

  // How far below the original line of fire the bullet ended up.
  _dropAt(shot, end) {
    const dir = shot.v.clone().normalize();
    const along = end.clone().sub(shot.o).dot(dir);
    const onLine = shot.o.clone().addScaledVector(dir, along);
    return `DROP ${(onLine.y - end.y).toFixed(1)}M`;
  }

  clearLines() {
    for (const l of this.lines) { this.g.scene.remove(l); l.geometry.dispose(); }
    this.lines.length = 0;
  }

  update() {
    // Hitbox wireframes.
    const caps = this.hitboxes ? this.g._targetsForHit() : [];
    while (this.boxPool.length < caps.length) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, depthTest: false }));
      m.renderOrder = 21;
      this.g.scene.add(m);
      this.boxPool.push(m);
    }
    const up = new THREE.Vector3(0, 1, 0);
    this.boxPool.forEach((m, i) => {
      const c = caps[i];
      m.visible = !!c;
      if (!c) return;
      const axis = c.b.clone().sub(c.a);
      const len = axis.length();
      m.position.copy(c.a).add(c.b).multiplyScalar(0.5);
      if (len > 1e-4) m.quaternion.setFromUnitVectors(up, axis.normalize());
      else m.quaternion.identity();
      m.scale.set(c.r, len + c.r * 2, c.r);
      m.material.color.set(c.part === 'head' ? 0xff5d55 : c.part === 'torso' ? 0xf2b35b : 0x62d9e8);
    });
  }
}
