// Sniper Cell: Infiltration — the CYBER OPS tablet.
// The spotter pulls it out (TAB) for a top-down neon wireframe of the whole facility:
// rooms tinted by security tier, doors, cameras with their cones, every contact the
// network can see, both operators, pins, crates, the objective. Click a contact to tag it,
// a camera or a door to hack it, pick a payload and click the map to drop it; hold CRACK
// at the vault and FIGHT TRACE during the upload. A live feed (your partner's bodycam or a
// hacked camera) is rendered straight into the console.
// The shooter gets the same map read-only, with a REQUEST panel.
import * as THREE from 'three';
import { ROOMS, FENCE, BUILDING, SPOTS } from './facility.js';
import { PAYLOADS, PAYLOAD } from './ops.js';
import { OBJECTIVES } from './cell.js';

const TIER_COL = ['rgba(0,255,224,0.05)', 'rgba(0,255,224,0.07)', 'rgba(64,140,255,0.08)', 'rgba(170,90,255,0.11)'];
const REQUESTS = [['scan', 'SCAN'], ['supply', 'SUPPLY'], ['door', 'DOOR'], ['lights', 'LIGHTS'], ['decoy', 'DECOY'], ['jam', 'JAM'], ['emp', 'EMP'], ['spoof', 'SPOOF CAMS']];

export class Tablet {
  constructor(game) {
    this.g = game;
    this.visible = false;
    this.view = { x: 20, z: 25, s: 3.2 };
    this.feedSrc = 'partner';
    this.feedCam = new THREE.PerspectiveCamera(60, 16 / 10, 0.1, 1200);
    this.feedCam.rotation.order = 'YXZ';
    this.hover = null;
    this.dirty = true;
    const el = (this.el = document.createElement('div'));
    el.id = 'cell-tablet';
    const spot = game.role === 'spotter';
    el.innerHTML = `
      <div class="ct-bezel">
        <div class="ct-top"><b>CYBER OPS // CS-7</b><span class="ct-link"></span><span class="ct-clock"></span><button class="ct-x" title="Close (TAB)">✕</button></div>
        <div class="ct-body">
          <div class="ct-mapwrap"><canvas class="ct-map"></canvas><div class="ct-mapbtns"><button data-z="1">＋</button><button data-z="-1">－</button><button data-z="0">◎</button></div><div class="ct-hint"></div></div>
          <div class="ct-side">
            <div class="ct-sec ct-obj"></div>
            <div class="ct-sec ct-bw"></div>
            <div class="ct-sec ct-pay"></div>
            <div class="ct-sec ct-hold"></div>
            <div class="ct-feedbox"><div class="ct-feedlbl"></div><canvas class="ct-feed"></canvas></div>
            <div class="ct-sec ct-log"></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    const $ = (s) => el.querySelector(s);
    this.canvas = $('.ct-map');
    this.ctx = this.canvas.getContext('2d');
    this.parts = { obj: $('.ct-obj'), bw: $('.ct-bw'), pay: $('.ct-pay'), hold: $('.ct-hold'), feed: $('.ct-feed'), feedLbl: $('.ct-feedlbl'), log: $('.ct-log'), clock: $('.ct-clock'), link: $('.ct-link'), hint: $('.ct-hint') };
    $('.ct-x').onclick = () => this.close();
    el.querySelectorAll('[data-z]').forEach((b) => (b.onclick = () => {
      const z = +b.dataset.z;
      if (z === 0) this._centre();
      else this.view.s = Math.min(14, Math.max(1.2, this.view.s * (z > 0 ? 1.3 : 1 / 1.3)));
    }));
    // Payload / request buttons.
    if (spot) {
      this.parts.pay.innerHTML = '<div class="ct-h">PAYLOADS</div>' + PAYLOADS.map((p) => `<button data-k="${p.k}" title="${p.desc}"><i>${p.key}</i><b>${p.name}</b><em class="c"></em><em class="w">${p.bw ? p.bw + ' BW' : ''}</em></button>`).join('');
      this.parts.pay.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) this._pick(b.dataset.k); });
      this.parts.hold.innerHTML = '<button class="ct-crack">HOLD — CRACK VAULT</button><button class="ct-fight">HOLD — FIGHT TRACE</button><div class="ct-perch"></div>';
      const hold = (sel, key) => {
        const b = $(sel);
        const on = (v) => (e) => { e.preventDefault(); this.g.ops[key] = v; b.classList.toggle('down', v); };
        b.addEventListener('pointerdown', on(true));
        for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, on(false));
      };
      hold('.ct-crack', 'cracking');
      hold('.ct-fight', 'fighting');
    } else {
      this.parts.pay.innerHTML = `<div class="ct-h">REQUEST FROM ${esc(game.partnerName)}</div>` + REQUESTS.map(([k, l]) => `<button data-r="${k}"><b>${l}</b></button>`).join('');
      this.parts.pay.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (b) this.g.request(b.dataset.r); });
      this.parts.hold.style.display = 'none';
    }
    // Map input.
    const cv = this.canvas;
    let drag = null;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vz: this.view.z, moved: false, btn: e.button, t: performance.now() };
    });
    cv.addEventListener('pointermove', (e) => {
      const r = cv.getBoundingClientRect();
      this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 6) drag.moved = true;
      if (drag.moved) { this.view.x = drag.vx - dx / this.view.s; this.view.z = drag.vz - dy / this.view.s; }
    });
    cv.addEventListener('pointerup', (e) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (d.moved) return;
      const r = cv.getBoundingClientRect();
      const p = this._toWorld(e.clientX - r.left, e.clientY - r.top);
      const long = performance.now() - d.t > 550;
      if (d.btn === 2 || long) this._ping(p); else this._click(p, e.clientX - r.left, e.clientY - r.top);
    });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.view.s = Math.min(14, Math.max(1.2, this.view.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); }, { passive: false });
    addEventListener('keydown', (e) => {
      if (!this.visible) return;
      if (e.code === 'Escape') { this.close(); return; }
      if (spot && /^Digit[1-9]$/.test(e.code)) { const p = PAYLOADS[+e.code.slice(5) - 1]; if (p) this._pick(p.k); }
      if (spot && e.code === 'KeyC') { this.g.ops.cracking = true; }
      if (spot && e.code === 'KeyX') { this.g.ops.fighting = true; }
    });
    addEventListener('keyup', (e) => {
      if (!spot) return;
      if (e.code === 'KeyC') this.g.ops.cracking = false;
      if (e.code === 'KeyX') this.g.ops.fighting = false;
    });
    this._centre();
  }

  _centre() {
    const P = this.g.player.pos;
    this.view.x = Math.max(-90, Math.min(140, P.x * 0.4 + 0 * 0.6));
    this.view.z = Math.max(-70, Math.min(120, P.z * 0.35));
    this.view.s = 3.6;
  }

  toggle() {
    if (this.visible) this.close(); else this.open();
  }
  open() {
    if (this.g.downed || this.g.kia || this.g.ended) return;
    this.visible = true;
    this.el.classList.add('on');
    this.g.audio.click();
    document.exitPointerLock && document.exitPointerLock();
    this._size();
  }
  close() {
    if (!this.visible) return;
    this.visible = false;
    this.el.classList.remove('on');
    this.selected = null;
    if (this.g.ops) { this.g.ops.cracking = false; this.g.ops.fighting = false; }
    this.justClosed = true;
    setTimeout(() => (this.justClosed = false), 400);
    this.g.input.requestLock();
  }

  _size() {
    const r = this.canvas.parentNode.getBoundingClientRect();
    const k = Math.min(devicePixelRatio, 2);
    this.canvas.width = Math.max(10, r.width * k);
    this.canvas.height = Math.max(10, r.height * k);
    this.cw = r.width;
    this.ch = r.height;
  }

  _toScreen(x, z) {
    return { x: (x - this.view.x) * this.view.s + this.cw / 2, y: (z - this.view.z) * this.view.s + this.ch / 2 };
  }
  _toWorld(px, py) {
    return { x: (px - this.cw / 2) / this.view.s + this.view.x, z: (py - this.ch / 2) / this.view.s + this.view.z };
  }

  _pick(k) {
    const g = this.g, p = PAYLOAD[k];
    if (!p) return;
    if (p.aim) { this.selected = this.selected === k ? null : k; return; }
    const why = g.ops.use(k);
    this._say(why ? `${p.name}: ${why}` : `UPLOADING · ${p.name}`, !why);
    if (k === 'quad' && !why) this.close();
  }

  _say(m, ok) {
    this.parts.hint.textContent = m;
    this.parts.hint.className = 'ct-hint on ' + (ok ? 'ok' : 'bad');
    clearTimeout(this._ht);
    this._ht = setTimeout(() => (this.parts.hint.className = 'ct-hint'), 2200);
  }

  _ping(p) {
    const g = this.g;
    const pin = { x: p.x, z: p.z, label: 'PING', by: g.role };
    g._addPin(pin);
    g.send({ t: 'pin', ...pin });
  }

  // What's under a screen point (contacts, cameras, doors, perches).
  _hit(px, py) {
    const g = this.g, S = g.sentinel;
    const near = (x, z, r = 11) => { const s = this._toScreen(x, z); return Math.hypot(s.x - px, s.y - py) < r; };
    for (const e of [...S.guards, ...S.drones]) if (e.state !== 'dead' && e.rev && near(e.x, e.z)) return { kind: e.kind === 'g' ? 'guard' : 'drone', e };
    for (const c of S.cams) if (near(c.x, c.z, 12)) return { kind: 'cam', e: c };
    for (const d of Object.values(g.fac.doors)) if (near(d.x, d.z, 12)) return { kind: 'door', e: d };
    if (g.aiShoot) SPOTS.perches.forEach((p, i) => { if (!this._ph && near(p.x, p.z, 14)) this._ph = { kind: 'perch', i }; });
    const ph = this._ph;
    this._ph = null;
    return ph || null;
  }

  _click(p, px, py) {
    const g = this.g, spot = g.role === 'spotter';
    if (spot && this.selected) {
      const k = this.selected;
      const why = g.ops.use(k, p);
      this._say(why ? `${PAYLOAD[k].name}: ${why}` : `UPLOADING · ${PAYLOAD[k].name}`, !why);
      if (!why) this.selected = null;
      return;
    }
    const h = this._hit(px, py);
    if (!h) return;
    if (h.kind === 'guard' || h.kind === 'drone') {
      g.payload('tag', { id: h.e.id });
      if (g.isHost) h.e.tagT = 12;
      this._say(h.e.chief ? 'SITE CHIEF TAGGED' : 'CONTACT TAGGED', true);
      if (g.aiShoot) g.comms('Ra: tracking.', 'amber', g.partnerName);
      return;
    }
    if (!spot) { if (h.kind === 'cam' && h.e.hacked) this.feedSrc = h.e.id; return; }
    if (h.kind === 'cam') {
      if (h.e.hacked && this.feedSrc !== h.e.id) { this.feedSrc = h.e.id; this._say(`FEED · CAM-${h.e.id}`, true); return; }
      const why = g.ops.hack('cam', h.e.id);
      this._say(why ? `CAMERA: ${why}` : 'UPLOADING · CAMERA HACK', !why);
      if (!why) this.feedSrc = h.e.id;
    } else if (h.kind === 'door') {
      const why = g.ops.hack('door', h.e.id);
      this._say(why ? `DOOR: ${why}` : 'UPLOADING · DOOR HACK', !why);
    } else if (h.kind === 'perch') {
      g.payload('perch', { i: h.i });
      this._say(`RA → ${SPOTS.perches[h.i].name}`, true);
    }
  }

  // Rect (CSS px, top-left origin) and camera for the live feed, or null.
  feed() {
    if (!this.visible) return null;
    const g = this.g, r = this.parts.feed.getBoundingClientRect();
    if (r.width < 20 || r.height < 20) return null;
    const cam = this.feedCam;
    cam.aspect = r.width / r.height;
    let label;
    const c = typeof this.feedSrc === 'number' && g.sentinel.cams.find((q) => q.id === this.feedSrc);
    if (c && c.hacked) {
      cam.position.set(c.x, c.y - 0.2, c.z);
      cam.rotation.set(-0.35, c.yaw, 0);
      cam.fov = 62;
      label = `CAM-${c.id} // ${c.tier >= 3 ? 'CORE' : c.tier >= 2 ? 'DATA FLOOR' : 'PERIMETER'}`;
    } else {
      const Q = g.partner;
      if (!Q.seen || Q.kia) { this.parts.feedLbl.textContent = 'NO SIGNAL'; return null; }
      if (Q.quad) { cam.position.set(Q.quad[0], Q.quad[1], Q.quad[2]); cam.rotation.set(Q.quad[4] || -0.2, Q.quad[3], 0); }
      else {
        const eye = Q.st === 2 ? 0.5 : Q.st === 1 ? 1.1 : 1.62;
        cam.position.set(Q.pos.x, Q.pos.y + eye + 0.1, Q.pos.z);
        cam.rotation.set(Q.pitch || 0, Q.yaw || 0, 0);
        // Step forward out of the partner's own head.
        cam.translateZ(-0.4);
      }
      cam.fov = Q.scoped && Q.role === 'shooter' ? 22 : 60;
      label = `BODYCAM // ${Q.name}`;
    }
    cam.updateProjectionMatrix();
    this.parts.feedLbl.textContent = label;
    const fc = this.parts.feed;
    if (fc.width !== Math.round(r.width) || fc.height !== Math.round(r.height)) { fc.width = Math.round(r.width); fc.height = Math.round(r.height); }
    this._fctx = this._fctx || fc.getContext('2d');
    return { x: r.left, y: r.top, w: r.width, h: r.height, cam, canvas: fc, ctx: this._fctx };
  }

  update(dt) {
    if (!this.visible) return;
    if (this.canvas.width < 20 || this._lw !== innerWidth || this._lh !== innerHeight) { this._lw = innerWidth; this._lh = innerHeight; this._size(); }
    this._sideT = (this._sideT || 0) - dt;
    if (this._sideT <= 0 || this.dirty) { this._sideT = 0.2; this.dirty = false; this._side(); }
    this._draw();
  }

  _side() {
    const g = this.g, ob = g.obj, S = g.sentinel, spot = g.role === 'spotter', P = this.parts;
    const o = OBJECTIVES[ob.step];
    const sec = S.alarmLabel;
    const mm = Math.floor(g.t / 60), ss = String(Math.floor(g.t % 60)).padStart(2, '0');
    P.clock.textContent = `T+${mm}:${ss}`;
    P.link.textContent = g.solo ? (spot ? 'RA: AI OVERWATCH' : 'RŌNIN: AI CONSOLE') : g.partner.seen ? `LINK: ${g.partnerName}` : 'LINK: —';
    const net = ob.access >= 3 ? 'SECURE CORE' : ob.access >= 2 ? 'DATA FLOOR' : 'PERIMETER';
    P.obj.innerHTML = `<div class="ct-h">OBJ ${ob.step + 1}/${OBJECTIVES.length}</div><b>${o ? o.title : ''}</b><p>${o ? o.hint : ''}</p>
      <div class="ct-row"><span>SEC</span><em class="sec-${sec.toLowerCase()}">${sec}</em><span>NET</span><em>${net}</em></div>
      ${ob.vault ? `<div class="ct-row"><span>EVIDENCE COPY</span><em>${Math.round(ob.upload * 100)}%</em><span>SENTINEL SWEEP</span><em class="${ob.trace > 0.6 ? 'sec-alarm' : ''}">${Math.round(ob.trace * 100)}%</em></div>` : ''}
      <div class="ct-row"><span>DROPS</span><em>${ob.drops}</em><span>BADGE</span><em>${ob.badge ? (ob.badge === g.role ? 'YOU' : ob.badge === 'ground' ? 'ON BODY' : g.partnerName) : 'CHIEF'}</em></div>`;
    if (spot) {
      const O = g.ops;
      P.bw.innerHTML = `<div class="ct-h">BANDWIDTH</div><i class="ct-bar"><em style="width:${Math.round(O.bw)}%"></em></i>${O.casts.map((c) => `<div class="ct-cast">UPLOADING · ${c.name} <i class="ct-bar"><em style="width:${Math.round((c.t / c.dur) * 100)}%"></em></i></div>`).join('')}`;
      for (const b of P.pay.querySelectorAll('[data-k]')) {
        const k = b.dataset.k, cd = O.cd[k] || 0, p = PAYLOAD[k];
        b.classList.toggle('sel', this.selected === k);
        b.classList.toggle('off', cd > 0 || O.bw < p.bw || (k === 'supply' && ob.drops <= 0) || (k === 'quad' && !g.canQuad()) || (k === 'medevac' && !g.downedAgent()));
        b.querySelector('.c').textContent = cd > 0 ? Math.ceil(cd) + 's' : '';
      }
      const cr = P.hold.querySelector('.ct-crack'), fi = P.hold.querySelector('.ct-fight');
      cr.classList.toggle('off', !ob.canCrack);
      cr.textContent = ob.vault ? 'VAULT OPEN' : ob.canCrack ? `HOLD — CRACK VAULT ${Math.round(ob.crack * 100)}% (C)` : 'CRACK VAULT — badge-holder at the door';
      fi.classList.toggle('off', !ob.uploading);
      fi.textContent = ob.uploading ? `HOLD — FIGHT TRACE ${Math.round(ob.trace * 100)}% (X)` : 'FIGHT TRACE — during the upload';
      const ph = P.hold.querySelector('.ct-perch');
      ph.innerHTML = g.aiShoot ? `<div class="ct-h">RA — PERCH</div><p>Click a perch on the map to move Ra. Now: <b>${SPOTS.perches[g.aiShoot.perch].name}</b>${g.aiShoot.moveT > 0 ? ' (relocating)' : ''}</p>` : '';
    } else {
      P.bw.innerHTML = `<div class="ct-h">OVERWATCH</div><p>${g.solo ? 'Rōnin answers requests and runs payloads on his own.' : 'Requests drop a pin on ' + esc(g.partnerName) + '’s console.'} Click a contact to tag it. Right-click / long-press to ping.</p>`;
    }
    P.log.innerHTML = '<div class="ct-h">COMMS</div>' + g.commsLog.slice(-7).map((l) => `<div class="c-${l.c && l.c[0] === '#' ? 'x' : l.c}">${l.who ? '<b>' + esc(l.who) + '</b> ' : ''}${esc(l.m)}</div>`).join('');
  }

  _draw() {
    const g = this.g, c = this.ctx, S = g.sentinel, ob = g.obj, fac = g.fac;
    const k = this.canvas.width / this.cw;
    c.setTransform(k, 0, 0, k, 0, 0);
    const W = this.cw, H = this.ch;
    c.fillStyle = '#02070b';
    c.fillRect(0, 0, W, H);
    const s = this.view.s;
    const T = (x, z) => this._toScreen(x, z);
    const accent = '#00ffe0';
    // Grid.
    c.strokeStyle = 'rgba(0,255,224,0.05)';
    c.lineWidth = 1;
    const step = 10;
    const w0 = this._toWorld(0, 0), w1 = this._toWorld(W, H);
    c.beginPath();
    for (let x = Math.floor(w0.x / step) * step; x < w1.x; x += step) { const p = T(x, 0); c.moveTo(p.x, 0); c.lineTo(p.x, H); }
    for (let z = Math.floor(w0.z / step) * step; z < w1.z; z += step) { const p = T(0, z); c.moveTo(0, p.y); c.lineTo(W, p.y); }
    c.stroke();
    // Cliff edge and knolls (terrain cues).
    c.strokeStyle = 'rgba(0,255,224,0.18)';
    c.setLineDash([4, 6]);
    c.beginPath(); let p = T(-84, 102); c.moveTo(p.x, p.y); p = T(175, 102); c.lineTo(p.x, p.y); c.stroke();
    c.setLineDash([]);
    c.fillStyle = 'rgba(0,255,224,0.35)';
    c.font = '600 10px JetBrains Mono, monospace';
    c.textAlign = 'center';
    p = T(40, 108); c.fillText('CLIFF', p.x, p.y);
    // Fence.
    c.strokeStyle = 'rgba(0,255,224,0.5)';
    c.setLineDash([2, 3]);
    const f0 = T(-FENCE.x, -FENCE.z), f1 = T(FENCE.x, FENCE.z);
    c.strokeRect(f0.x, f0.y, f1.x - f0.x, f1.y - f0.y);
    c.setLineDash([]);
    // Rooms.
    for (const r of ROOMS) {
      const a = T(r.x0, r.z0), b = T(r.x1, r.z1);
      const locked = r.tier + 1 > ob.access && r.id !== 'barracks';
      c.fillStyle = r.solid ? 'rgba(0,255,224,0.06)' : TIER_COL[r.tier + 1] || TIER_COL[1];
      if (!fac.lightsOn[r.tier >= 2 ? 'core' : 'floor'] && !r.solid) c.fillStyle = 'rgba(0,0,0,0.5)';
      c.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      if (locked) {
        c.save(); c.beginPath(); c.rect(a.x, a.y, b.x - a.x, b.y - a.y); c.clip();
        c.strokeStyle = 'rgba(255,42,109,0.12)';
        for (let i = -H; i < W + H; i += 9) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + H, H); c.stroke(); }
        c.restore();
      }
      if (s > 1.8 && r.id !== 'corridor') {
        c.fillStyle = locked ? 'rgba(255,42,109,0.6)' : 'rgba(0,255,224,0.55)';
        c.font = `600 ${Math.max(8, Math.min(11, s * 1.6))}px JetBrains Mono, monospace`;
        const name = c.measureText(r.name).width < b.x - a.x - 4 ? r.name : r.name.split(/[ /]/)[0];
        c.fillText(name, (a.x + b.x) / 2, (a.y + b.y) / 2 + 3);
      }
    }
    // Walls and solid cover.
    c.fillStyle = 'rgba(0,255,224,0.55)';
    for (const b of fac.boxes) {
      if (b.door || !b.sight || b.max[1] < 1.6 || b.min[1] > 1.6) continue;
      const a = T(b.min[0], b.min[2]), e = T(b.max[0], b.max[2]);
      const w = Math.max(1, e.x - a.x), h = Math.max(1, e.y - a.y);
      if (w * h > 60 * s * s * 12) continue; // skip the big terrain-sized boxes
      c.fillRect(a.x, a.y, w, h);
    }
    // Doors.
    for (const d of Object.values(fac.doors)) {
      const a = T(d.x, d.z);
      c.fillStyle = d.sealed ? '#ff2a6d' : d.open ? '#30ff90' : d.unlocked ? '#30c0ff' : d.hackT > 0 ? '#ffb020' : '#ff5070';
      c.fillRect(a.x - 4, a.y - 4, 8, 8);
      if (s > 3) { c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillText(d.kind === 'mech' ? 'MECH' : d.kind === 'vault' ? 'VAULT' : d.kind === 'dock' ? 'DOCK' : 'ELEC', a.x, a.y - 7); }
    }
    // Objective ring, relay, server, LZ, perches.
    const ring = (x, z, r, col, lbl) => { const a = T(x, z); c.strokeStyle = col; c.lineWidth = 1.5; c.beginPath(); c.arc(a.x, a.y, r, 0, Math.PI * 2); c.stroke(); if (lbl) { c.fillStyle = col; c.fillText(lbl, a.x, a.y - r - 4); } };
    ring(SPOTS.relay.x, SPOTS.relay.z, 6, ob.relay ? '#30ff90' : '#ffb020', ob.relay ? 'RELAY ✓' : 'RELAY');
    ring(SPOTS.server.x, SPOTS.server.z, 7, '#30ffd0', 'ARCHIVE');
    if (ob.uploading || (ob.upload > 0 && ob.upload < 1)) { const a = T(SPOTS.server.x, SPOTS.server.z); c.strokeStyle = '#30ffd0'; c.lineWidth = 3; c.beginPath(); c.arc(a.x, a.y, 11, -Math.PI / 2, -Math.PI / 2 + ob.upload * Math.PI * 2); c.stroke(); c.lineWidth = 1; }
    ring(SPOTS.lz.x, SPOTS.lz.z, SPOTS.lz.r * s, ob.drive ? '#30ff90' : 'rgba(48,255,144,0.4)', 'LZ');
    SPOTS.perches.forEach((pp, i) => { const a = T(pp.x, pp.z); c.fillStyle = g.aiShoot && g.aiShoot.perch === i ? '#f2b35b' : 'rgba(242,179,91,0.45)'; c.beginPath(); c.moveTo(a.x, a.y - 6); c.lineTo(a.x + 5, a.y + 4); c.lineTo(a.x - 5, a.y + 4); c.closePath(); c.fill(); if (s > 2) c.fillText(pp.name, a.x, a.y + 14); });
    const om = g.hud._objPoint();
    if (om && !om.hide) { const a = T(om.x, om.z); c.strokeStyle = accent; c.lineWidth = 2; const r = 10 + Math.sin(g.t * 4) * 2; c.beginPath(); c.arc(a.x, a.y, r, 0, Math.PI * 2); c.stroke(); c.lineWidth = 1; }
    // Cameras.
    for (const cm of S.cams) {
      const a = T(cm.x, cm.z);
      const blind = cm.loopT > 0 || cm.empT > 0 || S.spoofT > 0;
      const col = cm.hacked ? 'rgba(48,255,208,' : blind ? 'rgba(140,140,140,' : cm.aw > 0.2 ? 'rgba(255,48,72,' : 'rgba(255,90,110,';
      c.fillStyle = col + '0.12)';
      c.beginPath(); c.moveTo(a.x, a.y);
      const ang = -cm.yaw - Math.PI / 2;
      c.arc(a.x, a.y, cm.range * s, ang - 0.5, ang + 0.5);
      c.closePath(); c.fill();
      c.fillStyle = col + '1)';
      c.fillRect(a.x - 3, a.y - 3, 6, 6);
      if (this.feedSrc === cm.id) { c.strokeStyle = '#30ffd0'; c.strokeRect(a.x - 6, a.y - 6, 12, 12); }
    }
    // Crates and pins.
    for (const cr of g.crates) { const a = T(cr.x, cr.z); c.fillStyle = '#40ffb0'; c.fillRect(a.x - 3, a.y - 3, 6, 6); }
    for (const pin of g.pins) { const a = T(pin.x, pin.z); c.strokeStyle = c.fillStyle = pin.by === g.role ? '#ffffff' : '#ffd040'; c.beginPath(); c.arc(a.x, a.y, 6 + Math.sin(g.t * 6) * 1.5, 0, Math.PI * 2); c.stroke(); c.fillText(pin.label, a.x, a.y - 10); }
    if (ob.drive === 'ground' && ob.driveAt) { const a = T(ob.driveAt.x, ob.driveAt.z); c.fillStyle = '#ff9a20'; c.fillRect(a.x - 4, a.y - 4, 8, 8); c.fillText('DRIVE', a.x, a.y - 8); }
    // LKP silhouette.
    if (S.lkp && S.lkpT > 0) { const a = T(S.lkp.x, S.lkp.z); c.strokeStyle = 'rgba(255,255,255,0.7)'; c.setLineDash([2, 2]); c.beginPath(); c.arc(a.x, a.y, 6, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillText('LKP', a.x, a.y + 15); }
    // Contacts the network can see.
    let hov = null;
    for (const e of S.guards) {
      if (!e.rev) continue;
      const a = T(e.x, e.z);
      if (e.state === 'dead') { c.strokeStyle = 'rgba(160,160,160,0.6)'; c.beginPath(); c.moveTo(a.x - 3, a.y - 3); c.lineTo(a.x + 3, a.y + 3); c.moveTo(a.x + 3, a.y - 3); c.lineTo(a.x - 3, a.y + 3); c.stroke(); continue; }
      const col = e.chief ? '#c070ff' : e.state === 'alert' || e.state === 'search' ? '#ff3048' : e.state === 'sus' ? '#ffd040' : '#4aa8ff';
      // View cone.
      c.fillStyle = col + '22';
      c.beginPath(); c.moveTo(a.x, a.y);
      const ang = -(e.yaw + (e.look || 0)) - Math.PI / 2;
      c.arc(a.x, a.y, (e.tower ? 58 : 30) * s * 0.5, ang - 0.62, ang + 0.62);
      c.closePath(); c.fill();
      c.fillStyle = col;
      c.beginPath(); c.arc(a.x, a.y, 4, 0, Math.PI * 2); c.fill();
      if (e.tagT > 0) { c.strokeStyle = '#ff3048'; c.strokeRect(a.x - 7, a.y - 7, 14, 14); }
      if (e.chief) { c.fillText('CHIEF', a.x, a.y - 9); }
      if (this.mouse && Math.hypot(this.mouse.x - a.x, this.mouse.y - a.y) < 10) hov = e;
    }
    for (const d of S.drones) {
      if (!d.rev || d.state === 'dead') continue;
      const a = T(d.x, d.z);
      c.strokeStyle = d.state === 'hunt' ? '#ff3048' : '#ff9040';
      c.lineWidth = 1.5;
      c.beginPath(); c.arc(a.x, a.y, 5, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(a.x - 7, a.y); c.lineTo(a.x + 7, a.y); c.moveTo(a.x, a.y - 7); c.lineTo(a.x, a.y + 7); c.stroke();
      c.strokeStyle = 'rgba(255,144,64,0.15)';
      c.beginPath(); c.arc(a.x, a.y, (d.state === 'hunt' ? 30 : 22) * s, 0, Math.PI * 2); c.stroke();
      c.lineWidth = 1;
      if (d.tagT > 0) { c.strokeStyle = '#ff3048'; c.strokeRect(a.x - 8, a.y - 8, 16, 16); }
      if (this.mouse && Math.hypot(this.mouse.x - a.x, this.mouse.y - a.y) < 10) hov = d;
    }
    // Agents.
    const agent = (pos, yaw, col, name, down) => {
      const a = T(pos.x, pos.z);
      c.fillStyle = col + '30';
      c.beginPath(); c.moveTo(a.x, a.y);
      const ang = -yaw - Math.PI / 2;
      c.arc(a.x, a.y, 14 * s, ang - 0.5, ang + 0.5); c.closePath(); c.fill();
      c.fillStyle = col;
      c.save(); c.translate(a.x, a.y); c.rotate(-yaw);
      c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 5); c.lineTo(-5, 5); c.closePath(); c.fill();
      c.restore();
      c.fillText(name + (down ? ' — DOWN' : ''), a.x, a.y + 16);
    };
    const Q = g.partner;
    if (Q.seen && !Q.kia && !(Q.ai && Q.avatarHidden)) agent(Q.pos, Q.yaw || 0, Q.role === 'shooter' ? '#f2b35b' : '#40d8e8', Q.name, Q.downed);
    agent(g.player.pos, g.player.yaw, g.role === 'shooter' ? '#f2b35b' : '#40d8e8', g.name + ' (YOU)', g.downed);
    const qd = g.quad && g.quad.active ? g.quad : Q.quad ? { x: Q.quad[0], z: Q.quad[2], yaw: Q.quad[3] } : null;
    if (qd) { const a = T(qd.x, qd.z); c.strokeStyle = '#40d8e8'; c.strokeRect(a.x - 4, a.y - 4, 8, 8); c.fillStyle = '#40d8e8'; c.fillText('QUAD', a.x, a.y - 8); }
    if (g.medevac) { const a = T(g.medevac.x, g.medevac.z); c.fillStyle = '#40ffb0'; c.fillText('+MEDEVAC', a.x, a.y); }
    // Aimed payload preview.
    if (this.selected && this.mouse) {
      const p0 = PAYLOAD[this.selected];
      c.strokeStyle = '#00ffe0';
      c.setLineDash([4, 4]);
      c.beginPath(); c.arc(this.mouse.x, this.mouse.y, (p0.r || 3) * s, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
      c.fillStyle = '#00ffe0';
      c.fillText(p0.name + ' — click to drop', this.mouse.x, this.mouse.y - (p0.r || 3) * s - 6);
    }
    if (hov) {
      c.fillStyle = 'rgba(0,10,14,0.85)';
      const a = T(hov.x, hov.z);
      const txt = hov.kind === 'd' ? `DRONE · ${hov.state.toUpperCase()}` : `${hov.chief ? 'SITE CHIEF' : 'GUARD'} · ${hov.state.toUpperCase()} · AWARE ${Math.round((hov.aw || 0) * 100)}%`;
      c.fillRect(a.x + 10, a.y - 20, c.measureText(txt).width + 10, 16);
      c.fillStyle = '#00ffe0';
      c.textAlign = 'left';
      c.fillText(txt, a.x + 15, a.y - 8);
      c.textAlign = 'center';
    }
    // Scan sweep.
    if (S.scanT > 0) { c.strokeStyle = `rgba(0,255,224,${0.4 * (S.scanT / 4)})`; c.lineWidth = 2; const a = T(g.player.pos.x, g.player.pos.z); c.beginPath(); c.arc(a.x, a.y, (4 - S.scanT) * 120 * s * 0.25, 0, Math.PI * 2); c.stroke(); c.lineWidth = 1; }
    void BUILDING;
  }
}

function esc(s) {
  return String(s).replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));
}
