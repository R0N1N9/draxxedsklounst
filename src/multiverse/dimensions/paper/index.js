// FLAT OUT — first person, but the world is paper. A shipping-container yard between two low concourse buildings,
// drawn as a graphic-novel panel: flat colour fills, thick ink on every edge, a flat outlined rifle in the corner.
//
// FANTASY   Two paper cut-out snipers 74 m apart across a container yard, a gantry crane carrying a steel box across
//           the middle on a timetable, forklifts, gulls, windsocks. The whole world is a printed page.
// RULES     One hit wins. A round flies at 175 m/s and drops, the wind (windsocks, the strip beside the compass)
//           pushes it sideways, so you lead a walker and hold off for the gusts. Steel (containers, the crane's
//           box, forklifts) stops everything. PAPER (cardboard barricades, posters, mascot cut-outs) stops sight
//           but not a round: it punches a neat round hole that stays for the round and that both snipers can look
//           and shoot through. Every shot leaves a dashed line hanging in the air back to the shooter.
// HOOK      You are paper. Facing your rival you are a full-size target; turn EDGE-ON and you are a ruled line a few
//           centimetres wide, nearly impossible to hit — but you cannot shoot while thin.
// CONTROLS  move · look · SHOOT (a bolt-action, four rounds) · alt SCOPE (held; latching on touch; narrow view,
//           slow turn, lead ruler on the lens, a little breathing sway) · a1 EDGE-ON (1.8 s, then a pause) ·
//           a2 STANDEE (prop up a cardboard cut-out of yourself: the decoy; two charges). In-world tags teach each
//           in turn during the first seconds of play.
// BOT       Feels the other sniper out around its own end, then holds a lane behind the scope or flanks through the
//           containers; leads, holds off for drop and wind, dodges edge-on when it sees a round coming, and can be
//           fooled by standees. Skill scales reaction, aim error, lead, dodging and decoy sense.
// KILL      The victim crumples into a paper ball, bounces once and unfolds flat on the ground in a flutter of
//           scraps; the camera does a slow flat push-in (or, for the victim, the page folds up around the view).
// SUDDEN    Both snipers get a tall beacon, edge-on and standees are off, and the page closes in: two paper
//           curtains slide in from the ends until the yard is a short stage.
import { clamp, angDiff, gauss, resolveCircleRects, disposeTree } from '../../kit.js';
import { setThree, ID } from './style.js';
import { makeLineMats } from './lines.js';
import { buildWorld } from './world.js';
import { makeSet } from './set.js';
import { makeFigureKit, poseFigure, crumpleFigure, sheetHit } from './figures.js';
import { makeFx, shotAt, V0, G, ZERO } from './fx.js';
import { planFlight, sheetSeg, segBoxT, panelCross, cross } from './ballistics.js';
import { makeOverlay } from './overlay.js';
import { makeSound } from './sound.js';
import { makeBot } from './bot.js';
import { drawFlash } from './art.js';
import { EYE, RADIUS, SPAWN_Z, YARD_X, windAt, craneAt, yardLimit } from './layout.js';

const LOOK = 0.0022, RUN = 5.4, SCOPE_RUN = 2.2, EDGE_RUN = 3.6;
const MAG = 4, CYCLE = 1.05, CYCLE_SD = 0.7, RELOAD = 2.0;
const EDGE_MAX = 1.8, EDGE_CD = 5.0, STAND_LIFE = 16, STAND_RE = 13, WIND_K = 5.5;
const ROUND = 42, FOV_SCOPE = 15, OVER_SLOW = 0.35;
const TH0 = (G * ZERO) / (2 * V0 * V0); // the rifle is zeroed at ZERO metres: it points this far above the sight line
const ease = (u) => u * u * (3 - 2 * u);

const PROMPTS = {
  kbm: [['LMB', 'CLICK TO SHOOT · ROUNDS PUNCH THROUGH PAPER'], ['RMB', 'HOLD TO SCOPE: STEADY AND ZOOMED'], ['SHIFT', 'EDGE-ON: DODGE, BUT NO SHOOTING'], ['E', 'STANDEE: A CARDBOARD DECOY']],
  touch: [['FIRE', 'TAP TO SHOOT · ROUNDS PUNCH THROUGH PAPER'], ['SCOPE', 'TAP TO SCOPE IN'], ['EDGE-ON', 'TURN PAPER-THIN TO DODGE'], ['STANDEE', 'PROP UP A CARDBOARD DECOY']],
  gamepad: [['RT', 'SQUEEZE TO SHOOT · ROUNDS PUNCH THROUGH PAPER'], ['LT', 'HOLD TO SCOPE'], ['LB', 'EDGE-ON: DODGE, NO SHOOTING'], ['RB', 'STANDEE: A CARDBOARD DECOY']],
};
const SPOT = { kbm: ['A D', 'STEP OUT SIDEWAYS TO SPOT THE OTHER SNIPER'], touch: ['STICK', 'STEP OUT SIDEWAYS TO SPOT THEM'], gamepad: ['L STICK', 'STEP OUT SIDEWAYS TO SPOT THEM'] };

export default {
  id: 'paper',
  name: 'FLAT OUT',
  tagline: 'Everything here is paper. So are you.',
  perspective: 'FIRST PERSON · FLAT PAPER YARD',
  renderer: 'three',
  aim: 'look',
  palette: { bg: '#17151d', fg: '#f7f1e3', accent: '#ffab1f' },
  controls: { move: 'WALK', aim: 'LOOK', fire: 'SHOOT', alt: 'SCOPE', a1: 'EDGE-ON', a2: 'STANDEE' },
  hint: 'Edge-on, you are a paper-thin line: hard to hit, but you cannot shoot.',
  altToggle: true,
  roundTime: ROUND,
  overTime: 2.6,
  angleFields: ['yaw', 'pitch'],

  create(ctx) {
    const { THREE, renderer } = ctx.three;
    setThree(THREE);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, ctx.width / ctx.height, 0.25, 900);
    camera.rotation.order = 'YXZ';
    const mats = makeLineMats(THREE);
    const W = buildWorld(ctx, THREE, mats);
    scene.add(W.root);
    const set = makeSet(ctx, THREE, mats, W);
    const kit = makeFigureKit(THREE, mats);
    const flashCanvas = document.createElement('canvas');
    flashCanvas.width = flashCanvas.height = 128;
    drawFlash(flashCanvas.getContext('2d'), 128);
    kit.setFlash(flashCanvas);
    const fx = makeFx(THREE, mats);
    scene.add(fx.root);
    const ov = makeOverlay(ctx);
    const snd = makeSound(ctx);
    const S = ov.S;
    const size = new THREE.Vector2();
    const v3 = new THREE.Vector3();

    // ---- the two snipers ----
    const P = [0, 1].map((i) => {
      const fig = kit.sniper(i);
      scene.add(fig.root);
      return {
        i, x: 0, z: i ? -SPAWN_Z : SPAWN_Z, yaw: i ? Math.PI : 0, pitch: 0, vx: 0, vz: 0, e: 0, edgeT: 0, edgeCd: 0, standCd: 0, standCharges: 2, standRe: 0,
        ammo: MAG, cycle: 0, reload: 0, scope: 0, alive: true, fall: 0, walk: i * 3, speed: 0, fireBuf: 0, flash: 0, kick: 0, stepT: 0, bolt: 0,
        remote: ctx.opponent === 'remote' && i !== ctx.me, bot: null, fig, swayT: i * 11.3, hitT: 0,
      };
    });
    const bot = makeBot(ctx, {
      nav: W.nav,
      time: () => ctx.time,
      sees: (ax, ay, az, bx, by, bz) => sees(ax, ay, az, bx, by, bz),
      standees: (owner) => standeeActive(owner),
      drop: (r) => (G * (r - ZERO)) / (2 * V0 * V0),
      windAcc: (t) => windAt(t, W.windSeed) * WIND_K,
      threat: (p) => threatTo(p),
    });
    for (const p of P) if (!p.remote && (p.i !== ctx.me || ctx.autopilot)) bot.init(p);

    // ---- standees: two cardboard decoys per sniper, pooled ----
    const stands = [];
    for (let o = 0; o < 2; o++) for (let k = 0; k < 2; k++) {
      const fig = kit.standee(o);
      fig.root.visible = false;
      scene.add(fig.root);
      stands.push({ slot: o * 2 + k, owner: o, active: false, x: 0, z: 0, yaw: 0, life: 0, fig, w: 1, h: 1.96, y0: 0, nx: 0, nz: 1, ux: 1, uz: 0, id: o * 2 + k, hitT: 0 });
    }
    const standList = [];
    function standeeActive(owner) {
      standList.length = 0;
      for (const s of stands) if (s.active && s.owner === owner) standList.push(s);
      return standList;
    }
    const allStands = [];
    const standeeList = () => { allStands.length = 0; for (const s of stands) if (s.active) allStands.push(s); return allStands; };
    function placeStandee(owner, slot, x, z, yaw) {
      const s = stands[slot];
      s.active = true; s.owner = owner; s.x = x; s.z = z; s.yaw = yaw; s.life = STAND_LIFE; s.hitT = 0;
      s.nx = Math.sin(yaw); s.nz = Math.cos(yaw); s.ux = Math.cos(yaw); s.uz = -Math.sin(yaw);
      s.fig.root.visible = true;
      poseFigure(s.fig, x, z, yaw, 0, 0, 0, 1);
      fx.burst(x, 1.0, z, 14, ['#f7f1e3', '#cf9b62', ID[owner]], 3.2, 0.2, 1.1, 1.5);
      snd.stand(((x - P[ctx.me].x) * Math.cos(P[ctx.me].yaw) - (z - P[ctx.me].z) * Math.sin(P[ctx.me].yaw)) / 20);
    }

    // ---- world queries ----
    function sees(ax, ay, az, bx, by, bz) {
      for (const b of W.boxes) if (segBoxT(ax, ay, az, bx, by, bz, b) >= 0) return false;
      const dyn = set.boxesAt(ctx.time);
      for (let i = 0; i < dyn.length; i++) if (segBoxT(ax, ay, az, bx, by, bz, dyn[i]) >= 0) return false;
      for (const p of W.panels) {
        if (!panelCross(p, ax, ay, az, bx, by, bz)) continue;
        if (p.fig && !sheetHit(cross.u, cross.v)) continue;
        if (!set.inHole(p, cross.u, cross.v)) return false;
      }
      return true;
    }
    const plan = { boxes: W.boxes, panels: W.panels, dynAt: (t) => set.boxesAt(t), inHole: set.inHole, standeeList };

    // ---- shots ----
    const shots = [];
    let shotId = 0;
    function launch(s, own) {
      s.age = 0; s.hi = 0; s.si = 0; s.own = own; s.done = false;
      shots.push(s);
      fx.addShot(s, ID[s.owner]);
      fx.addBullet(s, ID[s.owner]);
      const o = P[s.owner];
      o.flash = 0.12;
      const me = P[ctx.me];
      const rel = Math.atan2(-(s.ox - me.x), -(s.oz - me.z)) - me.yaw;
      snd.shot(s.owner === ctx.me, Math.sin(-rel));
      fx.burst(s.ox, s.oy - 0.15, s.oz, 7, ['#fff6c8', '#ffe27a', '#f7f1e3'], 3.4, 0.16, 0.5, 0.2);
      s.whizAt = -1;
      if (s.owner !== ctx.me) { // a round passing close by: a whiz and a flinch
        let bd = 4.5;
        for (let tau = 0.02; tau < s.tauEnd; tau += 0.03) {
          shotAt(s, tau, A3);
          const d = Math.hypot(A3.x - me.x, A3.z - me.z) + Math.abs(A3.y - EYE) * 0.7;
          if (d < bd) { bd = d; s.whizAt = tau; s.whizNear = d < 2; s.whizPan = Math.max(-1, Math.min(1, ((A3.x - me.x) * Math.cos(me.yaw) - (A3.z - me.z) * Math.sin(me.yaw)) / 3)); }
        }
      }
      if (s.owner !== ctx.me) { S.tells.push({ heading: Math.atan2(s.ox - me.x, -(s.oz - me.z)), a: 1.7, ang: 0 }); if (S.tells.length > 3) S.tells.shift(); known = 1; heading = Math.atan2(s.ox - me.x, -(s.oz - me.z)); knownT = 0; }
    }
    function fire(p) {
      const sw = swayOf(p), sp = Math.hypot(p.vx, p.vz);
      const sig = p.scope > 0.7 ? 0.0003 : 0.006 + 0.004 * Math.min(1, sp / 5);
      const yaw = p.yaw + sw.x + gauss(Math.random) * sig, pitch = p.pitch + sw.y + TH0 + gauss(Math.random) * sig;
      const cp = Math.cos(pitch), dx = -Math.sin(yaw) * cp, dy = Math.sin(pitch), dz = -Math.cos(yaw) * cp;
      const s = {
        id: ++shotId, owner: p.i, ox: p.x + dx * 0.5, oy: EYE - 0.12 + dy * 0.5, oz: p.z + dz * 0.5, vx: dx * V0, vy: dy * V0, vz: dz * V0, aw: windAt(ctx.time, W.windSeed) * WIND_K,
        tauEnd: 0, endKind: 'air', ex: 0, ey: 0, ez: 0, en: null, holes: [], hits: [], age: 0, hi: 0, si: 0, own: true, done: false,
      };
      planFlight(s, plan, ctx.time);
      const r3 = (n) => Math.round(n * 1000) / 1000;
      ctx.net.send({ k: 'shot', o: [r3(s.ox), r3(s.oy), r3(s.oz)], v: [r3(s.vx), r3(s.vy), r3(s.vz)], aw: r3(s.aw), te: r3(s.tauEnd), ek: s.endKind, e: [r3(s.ex), r3(s.ey), r3(s.ez)], en: s.en ? [s.en.x, s.en.y, s.en.z] : 0, h: s.holes.map((h) => h.map(r3)), s: s.hits.map((h) => h.map(r3)) });
      launch(s, true);
      p.cycle = ctx.sudden ? CYCLE_SD : CYCLE;
      p.ammo--;
      p.kick = 1;
      if (p.ammo <= 0) p.reload = RELOAD;
      if (p.i === ctx.me) { fired = true; shakeT = 0.18; }
    }
    function applyHole(s, h) {
      const p = W.panels[h[0]];
      if (!p || set.inHole(p, h[1], h[2])) return;
      set.addHole(p, h[1], h[2]);
      const wx = p.x + p.ux * h[1], wy = p.y0 + h[2], wz = p.z + p.uz * h[1];
      fx.burst(wx, wy, wz, 9, ['#f7f1e3', p.kind === 'fragile' ? '#d6352f' : '#cf9b62', '#f7f1e3'], 2.6, 0.17, 1.4, 0.6);
      const me = P[ctx.me];
      snd.hole(((wx - me.x) * Math.cos(me.yaw) - (wz - me.z) * Math.sin(me.yaw)) / 25);
    }
    function stepShots(dt) {
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        const a0 = s.age, a1 = Math.min(s.tauEnd, a0 + dt);
        s.age += dt;
        if (s.whizAt >= 0 && s.age >= s.whizAt) { s.whizAt = -1; snd.whiz(s.whizPan, s.whizNear); if (s.whizNear) shakeT = 0.2; }
        while (s.hi < s.holes.length && s.holes[s.hi][3] <= s.age) applyHole(s, s.holes[s.hi++]);
        while (s.si < s.hits.length && s.hits[s.si][1] <= s.age) {
          const st = stands[s.hits[s.si++][0]];
          if (st && st.active) { st.hitT = 0.5; fx.burst(st.x, 1.2, st.z, 12, ['#cf9b62', '#f7f1e3', ID[st.owner]], 3, 0.2, 1.2, 1); snd.tear(0); }
        }
        if (s.own && ctx.phase === 'live' && a1 > a0) {
          const v = P[1 - s.owner], o = P[s.owner];
          if (v.alive) {
            shotAt(s, a0, A3); shotAt(s, a1, B3);
            const res = sheetSeg(v.x, v.z, Math.atan2(o.x - v.x, o.z - v.z) + v.e * (Math.PI / 2), A3.x, A3.y, A3.z, B3.x, B3.y, B3.z);
            if (res) {
              const d = Math.round(Math.hypot(o.x - v.x, o.z - v.z));
              ctx.kill(v.i, { how: res === 2 ? 'HEADSHOT' : v.e > 0.5 ? 'RAZOR EDGE' : `${d} M` });
            }
          }
        }
        if (s.age >= s.tauEnd + 0.03) {
          if (s.endKind === 'steel' || s.endKind === 'ground') {
            const n = s.en || { x: 0, y: 1, z: 0 };
            fx.mark(s.ex, s.ey, s.ez, n.x, n.y, n.z, 0.55);
            fx.burst(s.ex + n.x * 0.1, s.ey + n.y * 0.1, s.ez + n.z * 0.1, 8, ['#ffe27a', '#fff6c8', '#f7f1e3'], 4, 0.14, 0.55, 0.5);
            const me = P[ctx.me];
            snd.steel(((s.ex - me.x) * Math.cos(me.yaw) - (s.ez - me.z) * Math.sin(me.yaw)) / 40);
          }
          shots.splice(i, 1);
        }
      }
    }
    const A3 = { x: 0, y: 0, z: 0 }, B3 = { x: 0, y: 0, z: 0 };
    function threatTo(p) {
      let best = null, bd = 1e9;
      for (const s of shots) {
        if (s.owner === p.i) continue;
        for (let tau = s.age + 0.05; tau < s.tauEnd; tau += 0.04) {
          shotAt(s, tau, A3);
          const d = Math.hypot(A3.x - p.x, A3.z - p.z) + Math.abs(A3.y - 1.1) * 0.6;
          if (d < 1.3 && tau - s.age < bd) { bd = tau - s.age; best = s; threat.id = s.id; threat.age = s.age; threat.eta = tau - s.age; break; }
        }
      }
      return best ? threat : null;
    }
    const threat = { id: 0, age: 0, eta: 0 };

    // ---- sway, commands, stepping ----
    const swv = { x: 0, y: 0 };
    function swayOf(p) {
      const amp = p.scope > 0.5 ? 0.0021 + 0.003 * Math.min(1, p.speed / 2.2) : 0.0012;
      const t = p.swayT;
      swv.x = (Math.sin(t * 1.3) + 0.5 * Math.sin(t * 2.9 + 1)) * amp;
      swv.y = (Math.cos(t * 1.1 + 2) + 0.5 * Math.sin(t * 3.3)) * amp * 0.8;
      return swv;
    }
    const cmdH = { mx: 0, my: 0, yaw: 0, pitch: 0, fire: false, alt: false, a1: false, a2: false };
    function humanCmd(p) {
      const inp = ctx.input, zoom = 1 - 0.8 * p.scope * (1 - FOV_SCOPE / 60);
      const k = LOOK * (p.scope > 0.1 ? Math.max(0.22, zoom * 0.45) : 1);
      cmdH.mx = inp.moveX; cmdH.my = inp.moveY;
      cmdH.yaw = p.yaw - inp.lookX * k; cmdH.pitch = clamp(p.pitch - inp.lookY * k, -1.3, 1.3);
      cmdH.fire = inp.firePressed; cmdH.alt = inp.alt; cmdH.a1 = inp.a1Pressed; cmdH.a2 = inp.a2Pressed;
      return cmdH;
    }
    const cmdI = { mx: 0, my: 0, yaw: 0, pitch: 0, fire: false, alt: false, a1: false, a2: false };
    const idle = (p) => { cmdI.yaw = p.yaw; cmdI.pitch = p.pitch; return cmdI; };
    const rpos = { x: 0, y: 0 };
    function step(p, c, dt) {
      const live = ctx.phase === 'live';
      p.yaw = c.yaw;
      p.pitch = clamp(c.pitch, -1.3, 1.3);
      p.scope += ((c.alt && p.alive && live ? 1 : 0) - p.scope) * Math.min(1, dt * 10);
      p.swayT += dt;
      p.flash = Math.max(0, p.flash - dt); p.kick = Math.max(0, p.kick - dt * 5); p.hitT = Math.max(0, p.hitT - dt);
      if (!live || !p.alive) { p.vx = p.vz = 0; p.speed = 0; p.e += (0 - p.e) * Math.min(1, dt * 6) * (p.alive ? 1 : 0); return; }
      const sudden = ctx.sudden;
      p.cycle = Math.max(0, p.cycle - dt); p.fireBuf = Math.max(0, p.fireBuf - dt); p.edgeCd = Math.max(0, p.edgeCd - dt); p.standCd = Math.max(0, p.standCd - dt);
      if (p.reload > 0) { p.reload -= dt; if (p.reload <= 0) { p.ammo = MAG; p.reload = 0; snd.bolt(1); } }
      if (p.standCharges < 2) { p.standRe += dt; if (p.standRe >= STAND_RE) { p.standRe = 0; p.standCharges++; } }
      // edge-on: rotate side-on for a moment; pressing again turns back early
      if (c.a1 && !sudden) {
        if (p.edgeT > 0) { p.edgeT = 0; p.edgeCd = EDGE_CD * 0.6; if (p.i === ctx.me) { edgeUsed = true; } ctx.net.send({ k: 'edge', on: 0 }); snd.edge(false); }
        else if (p.edgeCd <= 0) { p.edgeT = EDGE_MAX; ctx.net.send({ k: 'edge', on: 1 }); snd.edge(true); if (p.i === ctx.me) edgeUsed = true; }
      }
      if (p.edgeT > 0) { p.edgeT -= dt; if (p.edgeT <= 0 || sudden) { p.edgeT = 0; p.edgeCd = EDGE_CD; snd.edge(false); } }
      const want = p.edgeT > 0 ? 1 : 0;
      p.e += clamp(want - p.e, -7 * dt, 7 * dt);
      // walk
      const spd = p.scope > 0.5 ? SCOPE_RUN : p.e > 0.5 ? EDGE_RUN : RUN;
      let f = -c.my, s = c.mx;
      const m = Math.hypot(f, s);
      if (m > 1) { f /= m; s /= m; }
      const wx = -Math.sin(p.yaw) * f + Math.cos(p.yaw) * s, wz = -Math.cos(p.yaw) * f - Math.sin(p.yaw) * s;
      rpos.x = p.x + wx * spd * dt; rpos.y = p.z + wz * spd * dt;
      resolveCircleRects(rpos, RADIUS, W.rects);
      resolveCircleRects(rpos, RADIUS, set.rectsAt(ctx.time));
      const lim = Math.min(yardLimit(sudden ? ctx.time - ROUND : 0), 41.2) - 0.6;
      rpos.x = clamp(rpos.x, -YARD_X + 0.4, YARD_X - 0.4); rpos.y = clamp(rpos.y, -lim, lim);
      p.vx = (rpos.x - p.x) / dt; p.vz = (rpos.y - p.z) / dt;
      p.x = rpos.x; p.z = rpos.y;
      p.speed = Math.hypot(p.vx, p.vz);
      p.walk += p.speed * dt * 0.7;
      p.stepT -= p.speed * dt;
      if (p.stepT <= 0 && p.speed > 0.8) { p.stepT = 1.6; if (p.i === ctx.me) snd.step(1); }
      // standee
      if (c.a2 && !sudden && p.standCharges > 0 && p.standCd <= 0) {
        const o = P[1 - p.i];
        // beside you, a little ahead: a decoy must stand where it is seen, not in front of your own sights
        const fx_ = -Math.sin(p.yaw), fz_ = -Math.cos(p.yaw), rx_ = Math.cos(p.yaw), rz_ = -Math.sin(p.yaw);
        let x = p.x, z = p.z, found = false;
        for (const sd of [1, -1]) {
          for (let d = 3.4; d > 1.4 && !found; d -= 0.6) {
            x = p.x + rx_ * d * sd + fx_ * d * 0.45; z = p.z + rz_ * d * sd + fz_ * d * 0.45;
            if (W.nav.free(x, z)) found = true;
          }
          if (found) break;
        }
        if (!found) { x = p.x + fx_ * 1.6; z = p.z + fz_ * 1.6; }
        const sa = stands[p.i * 2], sb = stands[p.i * 2 + 1];
        const slot = p.i * 2 + (!sa.active ? 0 : !sb.active ? 1 : sa.life < sb.life ? 0 : 1);
        const yaw = Math.atan2(o.x - x, o.z - z);
        placeStandee(p.i, slot, x, z, yaw);
        ctx.net.send({ k: 'st', slot, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, yaw: Math.round(yaw * 1000) / 1000 });
        p.standCharges--; p.standCd = 1.2;
        if (p.i === ctx.me) standUsed = true;
      }
      // shoot
      if (c.fire) p.fireBuf = 0.2;
      if (p.fireBuf > 0) {
        if (p.e > 0.15) { if (c.fire && p.i === ctx.me) { note = 'TURN FACE-ON TO SHOOT'; noteA = 1.3; snd.dry(); } }
        else if (p.cycle <= 0 && p.reload <= 0 && p.ammo > 0) { fire(p); p.fireBuf = 0; p.bolt = 0; }
        else if (c.fire && p.i === ctx.me && p.ammo <= 0) snd.dry();
      }
    }

    // ---- state for the overlay and the camera ----
    let frameDt = 0, anim = 0, introT = 0, overT = 0, wasSudden = false, known = 1, knownT = 0, heading = 0, fired = false, edgeUsed = false, standUsed = false, scopeUsed = false;
    let scopeOn = false, spotted = false, spotT = 0, driftT = 0, promptStage = 0, promptT = 0, note = '', noteA = 0, shakeT = 0, hornPrev = 0, gullT = 6, boltStage = 0, burstT = 0;
    const cs = { x: 0, y: 0, warn: 0, moving: 0 };
    const dbg = globalThis.__PAPER_DBG || null; // DBG
    if (dbg) Object.assign(dbg, { P, camera, W, set, fx, stands, ctx, shots, S, placeStandee, fire }); // DBG
    const rmem = { x: 0, z: 0, has: false };
    const dev = () => ctx.input.device;

    function updatePuppet(p, dt) {
      const r = ctx.net.remote;
      p.swayT += dt;
      p.flash = Math.max(0, p.flash - dt); p.hitT = Math.max(0, p.hitT - dt);
      if (!r || !p.alive) { p.vx = p.vz = 0; p.speed = 0; return; }
      if (rmem.has && dt > 0) { p.vx += ((r.x - rmem.x) / dt - p.vx) * Math.min(1, dt * 8); p.vz += ((r.z - rmem.z) / dt - p.vz) * Math.min(1, dt * 8); }
      rmem.x = r.x; rmem.z = r.z; rmem.has = true;
      p.x = r.x; p.z = r.z; p.yaw = r.yaw; p.pitch = r.pitch; p.e = r.e; p.scope = r.sc; p.speed = r.sp;
      p.walk += p.speed * dt * 0.7;
    }

    function poseAll(dt) {
      for (const p of P) {
        const o = P[1 - p.i];
        const f = p.fig;
        f.root.visible = p.i !== ctx.me || !p.alive;
        if (!p.alive) { crumpleFigure(f, p.fall, p.i * 1.7 + 0.5); f.root.position.set(p.x, 0, p.z); f.pivot.rotation.y = Math.atan2(o.x - p.x, o.z - p.z); f.shadow.visible = p.fall < 1.2; continue; }
        poseFigure(f, p.x, p.z, Math.atan2(o.x - p.x, o.z - p.z), p.e, p.speed, anim + p.i * 2, 1);
        if (p.flash > 0) {
          const c = Math.cos(f.pivot.rotation.y), s = Math.sin(f.pivot.rotation.y);
          f.flash.visible = true;
          f.flash.position.set(p.x + 0.46 * c + 0.1 * s, 1.52, p.z - 0.46 * s + 0.1 * c);
          const k = p.flash / 0.12;
          f.flash.scale.setScalar(0.9 * (0.5 + k));
        } else f.flash.visible = false;
        // a scoped sniper's lens throws a glint: the price of the zoom is being easier to find
        if (p.scope > 0.6 && p.i !== ctx.me) {
          const c = Math.cos(f.pivot.rotation.y), s = Math.sin(f.pivot.rotation.y), a = 0.5 + 0.5 * Math.sin(anim * 9 + p.i);
          f.glint.visible = true;
          f.glint.position.set(p.x + 0.3 * c + 0.12 * s * 0, 1.62, p.z - 0.3 * s + 0.12 * c);
          f.glint.scale.setScalar(0.35 + 0.5 * a);
        } else f.glint.visible = false;
      }
      for (const s of stands) {
        if (!s.active) continue;
        s.life -= dt;
        s.hitT = Math.max(0, s.hitT - dt);
        if (s.life <= 0) { s.active = false; s.fig.root.visible = false; fx.burst(s.x, 1.0, s.z, 10, ['#cf9b62', '#f7f1e3'], 2.4, 0.2, 1.2, 0.8); continue; }
        const j = s.hitT > 0 ? Math.sin(s.hitT * 30) * s.hitT * 0.5 : 0;
        s.fig.tilt.rotation.z = j;
        s.fig.root.visible = s.life > 1.5 || Math.floor(s.life * 8) % 2 === 0;
      }
    }

    function cameraRig(dt) {
      const me = P[ctx.me], foe = P[1 - ctx.me];
      const aspect = ctx.width / ctx.height;
      let base = (2 * Math.atan(Math.tan((86 * Math.PI) / 360) / aspect) * 180) / Math.PI;
      base = clamp(base, 52, 68);
      const sc = ease(clamp(me.scope, 0, 1));
      let fov = base + (FOV_SCOPE - base) * sc;
      const sw = swayOf(me);
      const bobA = Math.min(1, me.speed / 5);
      let x = me.x + Math.cos(me.walk * 3.1) * 0.02 * bobA, y = EYE + Math.abs(Math.sin(me.walk * 3.1)) * 0.045 * bobA, z = me.z;
      let yaw = me.yaw + sw.x * sc, pitch = me.pitch + sw.y * sc + me.kick * 0.03, roll = me.e * 0.05 * Math.sin(anim * 3);
      if (shakeT > 0) { shakeT -= dt; yaw += (Math.random() - 0.5) * 0.004 * (me.scope > 0.5 ? 2 : 1); }
      if (ctx.phase === 'intro') {
        introT += dt;
        const u = ease(clamp(introT / 3.1, 0, 1)), sgn = me.z > 0 ? 1 : -1;
        const sx = -16, sy = 12, sz = me.z + sgn * 9;
        x = sx + (x - sx) * u; y = sy + (y - sy) * u; z = sz + (z - sz) * u;
        const ty = Math.atan2(-(0 - x), -(0 - z) * 1), tp = Math.atan2(2 - y, Math.hypot(x, z));
        yaw = ty + angDiff(ty, yaw) * u; pitch = tp + (pitch - tp) * u;
        fov = base * (1.1 - 0.1 * u);
      } else if (ctx.phase === 'over' && ctx.result && ctx.result.victim >= 0) {
        overT += dt;
        const v = P[ctx.result.victim], u = ease(clamp(overT / 0.7, 0, 1));
        if (v.i !== ctx.me) {
          const ty = Math.atan2(-(v.x - me.x), -(v.z - me.z)), tp = Math.atan2(1.2 - EYE, Math.hypot(v.x - me.x, v.z - me.z));
          yaw = me.yaw + angDiff(me.yaw, ty) * u; pitch = me.pitch + (tp - me.pitch) * u;
          const k = Math.min(overT * 1.4, 5) / Math.max(8, Math.hypot(v.x - me.x, v.z - me.z));
          x += (v.x - me.x) * k; z += (v.z - me.z) * k;
          fov = Math.max(14, fov + (24 - fov) * clamp(overT / 0.9, 0, 1));
        } else {
          y = EYE - 0.9 * u; roll = 0.35 * u; pitch = me.pitch + 0.3 * u; fov = base - 8 * u;
          yaw = me.yaw + angDiff(me.yaw, Math.atan2(-(foe.x - me.x), -(foe.z - me.z))) * 0.4 * u;
        }
      }
      if (dbg && dbg.cam) { x = dbg.cam.x; y = dbg.cam.y; z = dbg.cam.z; yaw = dbg.cam.yaw; pitch = dbg.cam.pitch; fov = dbg.cam.fov || fov; roll = 0; } // DBG
      camera.position.set(x, y, z);
      camera.rotation.set(pitch, yaw, roll);
      if (Math.abs(camera.fov - fov) > 0.001) { camera.fov = fov; }
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      return fov;
    }

    function fillOverlay(fdt) {
      const me = P[ctx.me], foe = P[1 - ctx.me];
      S.t = anim; S.scope = clamp(me.scope, 0, 1); S.fovS = FOV_SCOPE; S.kick = me.kick; S.bolt = me.cycle > 0 ? 1 - me.cycle / (ctx.sudden ? CYCLE_SD : CYCLE) : 1;
      S.ammo = me.ammo; S.mag = MAG; S.reload = me.reload > 0 ? 1 - me.reload / RELOAD : -1;
      S.bob = Math.abs(Math.sin(me.walk * 3.1)) * Math.min(1, me.speed / 5); S.bobS = Math.cos(me.walk * 3.1) * Math.min(1, me.speed / 5);
      S.alive = me.alive; S.live = ctx.phase === 'live'; S.me = ctx.me; S.e = me.e; S.edgeLeft = me.edgeT / EDGE_MAX; S.edgeCd = me.edgeCd / EDGE_CD;
      S.over = ctx.phase === 'over'; S.sudden = ctx.sudden; S.device = dev();
      const sf = ctx.safe || { left: 0, right: 0, bottom: 0 };
      S.safeL = sf.left; S.safeR = sf.right; S.safeB = sf.bottom;
      S.heading = camera.rotation.y;
      S.windR = windAt(ctx.time, W.windSeed) * Math.cos(camera.rotation.y);
      S.spread = 7 + 6 * Math.min(1, me.speed / 5);
      // enemy: visible? where on screen? how far?
      const eyeY = EYE;
      const vis = foe.alive && sees(me.x, eyeY, me.z, foe.x, 1.2, foe.z);
      const dist = Math.hypot(foe.x - me.x, foe.z - me.z);
      v3.set(foe.x, 2.15, foe.z).project(camera);
      S.enemyVis = vis; S.edist = dist; S.ruler = vis ? dist : 60;
      S.enemyOn = v3.z < 1 && Math.abs(v3.x) < 1.1 && Math.abs(v3.y) < 1.1;
      S.ex = (v3.x * 0.5 + 0.5) * ctx.width; S.ey = (-v3.y * 0.5 + 0.5) * ctx.height;
      if (vis) { known = 1; heading = Math.atan2(foe.x - me.x, -(foe.z - me.z)); knownT = 0; }
      else { knownT += fdt; if (knownT > 6) known = Math.max(0.3, known - 0.25 * fdt); }
      S.enemyKnown = known; S.enemyHeading = heading;
      // aim on foe: the sight line passes through the other sniper's silhouette's box
      S.aimOnFoe = 0;
      if (vis) {
        const dx = -Math.sin(camera.rotation.y) * Math.cos(camera.rotation.x), dz = -Math.cos(camera.rotation.y) * Math.cos(camera.rotation.x), dy = Math.sin(camera.rotation.x);
        const t = (foe.x - me.x) * dx + (foe.z - me.z) * dz;
        if (t > 0) { const px = me.x + dx * t - foe.x, pz = me.z + dz * t - foe.z, py = EYE + dy * t; if (Math.hypot(px, pz) < 0.45 && py > 0.1 && py < 2) S.aimOnFoe = 1; }
      }
      for (const t of S.tells) { t.a -= fdt; t.ang = angDiff(0, t.heading + camera.rotation.y); }
      while (S.tells.length && S.tells[0].a <= 0) S.tells.shift();
      noteA = Math.max(0, noteA - fdt); S.note = note; S.noteA = noteA;
      S.burst = burstT > 0 ? burstT / 0.7 : 0;
      S.crumple = ctx.phase === 'over' && ctx.result && ctx.result.victim === ctx.me ? clamp(overT / 1.0, 0, 1) : 0;
      // the how-to-play tag in turn
      const list = PROMPTS[dev()] || PROMPTS.kbm;
      if (ctx.phase === 'live') {
        promptT += fdt;
        if (vis) spotted = true;
        spotT += fdt;
        const sp = SPOT[dev()] || SPOT.kbm;
        if (!spotted && spotT < 12 && !ctx.sudden) { S.spotKey = sp[0]; S.spot = sp[1]; } else { S.spotKey = ''; S.spot = ''; }
        const done = [fired, scopeUsed, edgeUsed, standUsed];
        while (promptStage < 4 && (done[promptStage] || promptT > (promptStage === 0 ? 16 : 8))) { promptStage++; promptT = 0; }
        if (promptStage >= 4 || ctx.sudden) { S.prompt = ''; S.promptKey = ''; }
        else { S.promptKey = list[promptStage][0]; S.prompt = list[promptStage][1]; }
      } else { S.prompt = ''; S.promptKey = ''; S.spot = ''; S.spotKey = ''; }
    }

    return {
      update(dt) {
        anim += dt; frameDt += dt;
        const live = ctx.phase === 'live';
        for (const p of P) {
          if (p.remote) updatePuppet(p, dt);
          else if (ctx.phase === 'over') { p.vx = p.vz = 0; p.speed = 0; p.scope += (0 - p.scope) * Math.min(1, dt * 6); p.kick = Math.max(0, p.kick - dt * 5); p.flash = Math.max(0, p.flash - dt); p.swayT += dt; }
          else step(p, p.bot ? (live ? bot.think(p, P[1 - p.i], dt) : idle(p)) : humanCmd(p), dt);
          if (!p.alive) p.fall += (dt / OVER_SLOW) * 0.75;
        }
        const me = P[ctx.me];
        // scope / alt usage for the teaching tags
        if (me.scope > 0.6) scopeUsed = true;
        if (me.scope > 0.55 && !scopeOn) { scopeOn = true; snd.scope(true); } else if (me.scope < 0.25 && scopeOn) { scopeOn = false; snd.scope(false); }
        if (me.cycle > 0) {
          const cy = me.cycle / (ctx.sudden ? CYCLE_SD : CYCLE);
          if (boltStage < 1 && cy < 0.72) { boltStage = 1; snd.bolt(0); }
          if (boltStage < 2 && cy < 0.3) { boltStage = 2; snd.bolt(1); }
        } else boltStage = 0;
        stepShots(dt);
        poseAll(dt);
        const sudT = ctx.sudden ? ctx.time - ROUND : 0;
        const wind = windAt(ctx.time, W.windSeed);
        set.update(ctx.time, anim, wind, sudT, camera);
        fx.beaconPos[0].on = fx.beaconPos[1].on = ctx.sudden && ctx.phase === 'live';
        for (const p of P) { const b = fx.beaconPos[p.i]; b.x = p.x; b.z = p.z; b.y = 1.6; }
        fx.setWind(wind);
        driftT -= dt;
        if (driftT <= 0 && ctx.phase !== 'over') { // loose pages blow across the yard downwind
          driftT = 0.35 + Math.random() * 0.5;
          fx.scrap(me.x - Math.sign(wind || 1) * (14 + Math.random() * 14) + (Math.random() - 0.5) * 10, 0.6 + Math.random() * 3.2, me.z + (Math.random() - 0.5) * 40, wind * 4, 0.3, 0, 0.32, ['#f7f1e3', '#ebe3cf', '#cf9b62'][Math.floor(Math.random() * 3)], 7, 0.7, 1);
        }
        fx.update(dt, anim);
        burstT = Math.max(0, burstT - dt / OVER_SLOW * 0.5);
        // machinery you can hear
        craneAt(ctx.time, cs);
        if (cs.warn && !hornPrev && live) snd.horn((Math.cos(me.yaw) * (cs.x - me.x) - Math.sin(me.yaw) * (0 - me.z)) / 30, 1);
        hornPrev = cs.warn;
        gullT -= dt;
        if (gullT <= 0) { gullT = 7 + Math.random() * 9; snd.gull(Math.random() * 2 - 1); }
        if (ctx.sudden && !wasSudden) { wasSudden = true; if (live) snd.music(true); }
        // hud
        ctx.hud.cooldown('fire', me.reload > 0 ? me.reload / RELOAD : me.cycle / (ctx.sudden ? CYCLE_SD : CYCLE));
        ctx.hud.charges('fire', me.ammo);
        ctx.hud.cooldown('a1', ctx.sudden ? 1 : me.edgeT > 0 ? 0.0001 : me.edgeCd / EDGE_CD);
        ctx.hud.charges('a2', me.standCharges);
        ctx.hud.cooldown('a2', ctx.sudden ? 1 : me.standCd > 0 ? me.standCd / 1.2 : me.standCharges === 0 ? 1 - me.standRe / STAND_RE : 0);
        // the other player's state goes out every frame
        ctx.net.sendState({ x: +me.x.toFixed(2), z: +me.z.toFixed(2), yaw: +me.yaw.toFixed(3), pitch: +me.pitch.toFixed(3), e: +me.e.toFixed(2), sc: +me.scope.toFixed(2), sp: +me.speed.toFixed(1) });
      },

      render() {
        const fdt = Math.min(frameDt, 0.1);
        frameDt = 0;
        const fov = cameraRig(fdt);
        renderer.getDrawingBufferSize(size);
        mats.set(size.x, size.y, clamp(ctx.height / 235, 1.9, 4.6) * renderer.getPixelRatio(), camera.near);
        renderer.render(scene, camera);
        fillOverlay(fdt);
        ov.draw();
      },

      resize(w, h) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      },

      onPhase(phase) {
        if (phase === 'live') { snd.music(ctx.sudden); promptT = 0; }
        if (phase === 'over') {
          const r = ctx.result;
          overT = 0;
          if (!r || r.victim < 0) return;
          const v = P[r.victim];
          v.alive = false; v.fall = 0; v.e = 0; v.edgeT = 0;
          snd.hit();
          snd.crumple();
          fx.burst(v.x, 1.2, v.z, 40, ['#f7f1e3', '#ebe3cf', ID[v.i], '#cf9b62', '#fffdf5'], 5.5, 0.26, 3.2, 3.2);
          burstT = 0.7; S.winner = r.winner === ctx.me;
          v3.set(v.x, 1.2, v.z).project(camera);
          S.bx = (v3.x * 0.5 + 0.5) * ctx.width; S.by = (-v3.y * 0.5 + 0.5) * ctx.height;
          if (r.victim === ctx.me) { S.bx = ctx.width / 2; S.by = ctx.height * 0.42; }
        }
      },

      onNet(m) {
        if (m.k === 'shot') {
          const s = {
            id: ++shotId, owner: 1 - ctx.me, ox: m.o[0], oy: m.o[1], oz: m.o[2], vx: m.v[0], vy: m.v[1], vz: m.v[2], aw: m.aw, tauEnd: m.te, endKind: m.ek, ex: m.e[0], ey: m.e[1], ez: m.e[2],
            en: m.en ? { x: m.en[0], y: m.en[1], z: m.en[2] } : null, holes: m.h || [], hits: m.s || [], age: 0, hi: 0, si: 0, own: false, done: false,
          };
          launch(s, false);
        } else if (m.k === 'st') placeStandee(1 - ctx.me, m.slot, m.x, m.z, m.yaw);
        else if (m.k === 'edge') snd.edge(!!m.on);
      },

      focus() {
        const v = P[ctx.result && ctx.result.victim >= 0 ? ctx.result.victim : 1 - ctx.me];
        v3.set(v.x, 1.1, v.z).project(camera);
        if (v3.z > 1) return { x: ctx.width / 2, y: ctx.height / 2 };
        return { x: (v3.x * 0.5 + 0.5) * ctx.width, y: (-v3.y * 0.5 + 0.5) * ctx.height };
      },

      dispose() {
        snd.stop();
        fx.dispose();
        set.dispose();
        kit.dispose();
        for (const p of P) p.fig.dispose();
        for (const s of stands) s.fig.dispose();
        W.dispose();
        disposeTree(scene);
        mats.dispose();
      },
    };
  },
};
