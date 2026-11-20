// The rules: how a sniper runs, climbs, bounces, charges the barrel and pops a cork; where corks fly and what
// they hit; the portable holes, decoys and slapstick hazards. Each client simulates only its own sniper (and,
// offline, the bot's), judges only its own corks, and treats the other sniper as a puppet.
import { clamp, spring, segRect, pointInRect, segCircle } from '../../kit.js';
import {
  GY, FLOOR, W, PW, PH, PHC, SHOULDER, SPAWN, GRAV, RUN, JUMP, CLIMB, SPRING, PIV, PLANK, LIP, ANVIL, TRAIN, WEED, CRATE,
  moveBody, plankY, onPlank, ladderTop, anvilState, trainState, weedState, birdState, refresh, shotParams,
} from './world.js';
import { GUN } from './figures.js';

export const RELOAD = 1.3;
const CORKS = 28;

export function makeSim(ctx, w, S, sound, fx) {
  const online = ctx.opponent === 'remote';
  const P = S.P;
  const sp = { v: 0, g: 0 }, as = { ph: 0, x: 0, y: 0, k: 0, ground: 0 }, ts = { u: 0, on: false, head: 0, tail: 0, warn: 0 }, ws = { on: false, x: 0, y: 0, rot: 0, gx: 0, sx: 0 }, bs = { u: 0, on: false, x: 0, y: 0, dir: 1, low: false };
  const rect = { x: 0, y: 0, w: 0, h: 0 };
  const sh = { x: 0, y: 0 };
  const r1 = (v) => Math.round(v * 10) / 10;
  const corks = S.corks;
  for (let i = 0; i < CORKS; i++) corks.push({ live: false, owner: 0, x: 0, y: 0, vx: 0, vy: 0, g: 0, judge: false, bounces: 0, age: 0, seed: i * 3.1, ox: 0, oy: 0, charge: 0, ricochet: false });
  let cork = 0, holeN = 0, decoyN = 0;
  const reloadT = () => (ctx.sudden ? RELOAD * 0.55 : RELOAD);

  const shoulder = (p, out) => { out.x = p.x + p.face * 7; out.y = p.y - (SHOULDER - 2) * (p.st === 1 ? 0.66 : 1); return out; };
  const muzzleLen = (c) => GUN.base + 9 + c * GUN.sect * GUN.n;

  // ---- the gun ------------------------------------------------------------------------------------------
  function shoot(p, c) {
    shoulder(p, sh);
    const L = muzzleLen(c) - p.recoil * 10;
    let x = sh.x + Math.cos(p.a) * L, y = sh.y + Math.sin(p.a) * L;
    for (const q of w.cr) if (q.h > 0 && pointInRect(x, y, q)) { x = sh.x; y = sh.y; break; } // never start a cork inside rock
    launch(p.i, x, y, p.a, c, true);
    p.rt = reloadT() * (1 + c * 0.55);
    p.rmax = p.rt;
    p.charge = 0;
    p.vx += -Math.cos(p.a) * (50 + 300 * c); // the recoil shoves the sniper back
    p.sq.v += 6 + c * 8;
    S.shots[p.i]++;
    if (p.i === ctx.me) { S.firstShot = true; if (c > 0.3) S.usedAlt = true; }
    if (online && p.i === ctx.me) ctx.net.send({ k: 'shot', x: r1(x), y: r1(y), a: +p.a.toFixed(4), c: +c.toFixed(2) });
  }

  function launch(owner, x, y, a, c, judge) {
    shotParams(c, ctx.sudden, sp);
    let k = null;
    for (let i = 0; i < CORKS; i++) { const q = corks[(cork + i) % CORKS]; if (!q.live) { k = q; cork = (cork + i + 1) % CORKS; break; } }
    if (!k) { k = corks[cork]; cork = (cork + 1) % CORKS; }
    k.live = true; k.owner = owner; k.x = x; k.y = y; k.ox = x; k.oy = y; k.vx = Math.cos(a) * sp.v; k.vy = Math.sin(a) * sp.v; k.g = sp.g;
    k.judge = judge; k.bounces = 0; k.age = 0; k.charge = c; k.ricochet = false;
    const p = P[owner];
    p.recoil = 1; p.flash = 0.11;
    if (p.remote) { p.rt = reloadT() * (1 + c * 0.55); p.rmax = p.rt; p.charge = 0; }
    sound.pop(x, owner === ctx.me, c);
    if (c > 0.35) sound.whistle(x, c);
    fx.puff(x, y, Math.cos(a) * 40, Math.sin(a) * 40 - 10, 9 + c * 8, 0.5);
    fx.burst(x, y, 6, 220 + c * 200, 0.22, P[owner].col);
    S.shake.add(owner === ctx.me ? 0.22 + c * 0.35 : 0.1);
  }

  const segT = (ax, ay, bx, by, r) => {
    if (pointInRect(ax, ay, r)) return 0;
    const h = segRect(ax, ay, bx, by, r);
    return h ? h.t : -1;
  };

  function howLabel(k, foe, hy) {
    if (hy < foe.y - foe.h + 26) return 'NOGGIN BONK';
    if (k.ricochet) return 'TRICK BONK';
    if (!foe.ground) return 'FLYING BONK';
    const d = Math.hypot(foe.x - k.ox, foe.y - k.oy);
    if (d > 950) return 'LONG BONK';
    if (d < 260) return 'POINT-BLANK BONK';
    return 'BONK';
  }

  function stepCorks(dt) {
    const n = Math.max(1, Math.ceil(dt / (1 / 110))), h = dt / n;
    const live = ctx.phase === 'live';
    for (let i = 0; i < CORKS; i++) {
      const k = corks[i];
      if (!k.live) continue;
      k.age += dt;
      for (let s = 0; s < n && k.live; s++) {
        const ax = k.x, ay = k.y;
        k.vy += k.g * h;
        const bx = ax + k.vx * h, by = ay + k.vy * h;
        let tBest = 2, kind = 0, q = null, nx = 0, ny = 0;
        const foe = P[1 - k.owner];
        // the other sniper
        if (k.judge && live && foe.alive && !foe.tele && !foe.remoteHidden) {
          rect.x = foe.x - PW - 6; rect.y = foe.y - foe.h - 6; rect.w = 2 * (PW + 6); rect.h = foe.h + 6;
          const t = segT(ax, ay, bx, by, rect);
          if (t >= 0 && t < tBest) { tBest = t; kind = 1; }
        }
        // decoys of the other sniper
        if (k.judge) {
          for (const d of S.decoys) {
            if (d.owner === k.owner || d.pop > 0) continue;
            rect.x = d.x - 22; rect.y = d.y - 112; rect.w = 44; rect.h = 112;
            const t = segT(ax, ay, bx, by, rect);
            if (t >= 0 && t < tBest) { tBest = t; kind = 2; q = d; }
          }
        }
        // rock, boards, crates, anvils
        for (let j = 0; j < w.cr.length; j++) {
          const r = w.cr[j];
          if (r.h <= 0) continue;
          const hit = segRect(ax, ay, bx, by, r);
          if (hit && hit.t < tBest) { tBest = hit.t; kind = 3; q = r; nx = hit.nx; ny = hit.ny; }
        }
        // tumbleweeds soak up corks
        for (const e of w.ev) {
          if (e.k !== 'weed' || ctx.time < e.t0 || ctx.time > e.t0 + e.dur) continue;
          weedState(e, ctx.time, ws);
          const t = segCircle(ax, ay, bx, by, ws.x, ws.y, WEED.r);
          if (t >= 0 && t < tBest) { tBest = t; kind = 4; }
        }
        const hx = ax + (bx - ax) * Math.min(tBest, 1), hy = ay + (by - ay) * Math.min(tBest, 1);
        if (kind === 0) { k.x = bx; k.y = by; } else if (kind === 1) {
          k.live = false;
          bonk(hx, hy, true);
          ctx.kill(foe.i, { how: howLabel(k, foe, hy) });
          S.hit = { x: hx, y: hy, vx: k.vx, vy: k.vy };
        } else if (kind === 2) {
          k.live = false;
          popDecoy(q, true);
          bonk(hx, hy, false);
        } else if (kind === 4) {
          k.live = false;
          fx.puff(hx, hy, 0, -20, 14, 0.5, '#fff');
          fx.text('FWUP', hx, hy - 20, 22, '#f7f0de', 0.7);
          sound.thunk(hx);
        } else {
          const bounce = k.bounces < 1 && q.k !== 'tower' && q.k !== 'anvil' && Math.hypot(k.vx, k.vy) > 300;
          if (q.k === 'tower') {
            if (k.judge) { crateOut(true); } else { w.tower.wobV += Math.sign(k.vx) * 6; fx.chips(hx, hy, 5, 220, '#e8dcc0'); sound.thunk(hx); }
            k.live = false;
          } else if (bounce) {
            const dot = k.vx * nx + k.vy * ny;
            k.vx = (k.vx - 2 * dot * nx) * 0.55; k.vy = (k.vy - 2 * dot * ny) * 0.55;
            k.x = hx + nx * 1.5; k.y = hy + ny * 1.5;
            k.bounces++; k.ricochet = true;
            fx.burst(hx, hy, 5, 160, 0.2, '#1b1612');
            fx.text('boing', hx, hy - 12, 16, '#f7f0de', 0.5);
            sound.boing(hx, 2.2);
          } else {
            k.live = false;
            fx.puff(hx, hy, nx * 30, ny * 30 - 10, 10, 0.5);
            fx.chips(hx, hy, 3, 140);
            sound.thunk(hx);
          }
        }
        if (k.x < -400 || k.x > W + 400 || k.y > 1250 || k.y < -1100 || k.age > 6) k.live = false;
      }
    }
  }

  function bonk(x, y, big) {
    sound.bonk(x, big);
    fx.ring(x, y, 8, big ? 70 : 40, 0.3, '#1b1612');
    fx.burst(x, y, big ? 12 : 7, big ? 420 : 260, 0.3);
    if (big) { fx.text('BONK!', x, y - 36, 54, '#f7f0de', 1.3, -0.12); S.shake.add(0.6); } else fx.text('bonk', x, y - 26, 22, '#f7f0de', 0.6);
  }

  function crateOut(judge) {
    const tw = w.tower;
    if (tw.n <= 0) return;
    const top = plankY(w, PIV.x) - 4 - CRATE * tw.n + CRATE / 2;
    tw.n--;
    tw.lost.push({ x: PIV.x, y: top, vx: (Math.random() - 0.5) * 360, vy: -420, rot: 0, vr: (Math.random() - 0.5) * 9, age: 0 });
    tw.wobV += (Math.random() - 0.5) * 20;
    fx.chips(PIV.x, top, 10, 300, '#e8dcc0');
    fx.text('CRASH!', PIV.x, top - 40, 34, '#f7f0de', 0.9);
    sound.bonk(PIV.x, true);
    if (judge && online) ctx.net.send({ k: 'crate' });
    refresh(w, ctx.time);
  }

  // ---- decoys -------------------------------------------------------------------------------------------
  function plantDecoy(owner, id, x, y, face) {
    let mine = 0;
    for (const d of S.decoys) if (d.owner === owner && d.pop === 0) { mine++; if (mine >= 2) { popDecoy(d, false); break; } }
    S.decoys.push({ id, owner, x, y, face, age: 0, grow: 0, pop: 0, spin: Math.random() < 0.5 ? 1 : -1 });
    sound.sign(x);
    fx.dust(x, y, 5, 0);
  }
  function popDecoy(d, hit) {
    if (!d || d.pop > 0) return;
    d.pop = 0.001;
    sound.signPop(d.x);
    fx.chips(d.x, d.y - 60, 9, 280, '#d9cfb8');
    fx.text('BONK', d.x, d.y - 130, 24, '#f7f0de', 0.7);
    if (hit && online) ctx.net.send({ k: 'pop', id: d.id });
  }
  function stepDecoys(dt) {
    for (let i = S.decoys.length - 1; i >= 0; i--) {
      const d = S.decoys[i];
      d.grow = Math.min(1, d.grow + dt * 5);
      if (d.pop > 0) { d.pop += dt * 2.2; if (d.pop >= 1) S.decoys.splice(i, 1); continue; }
      d.age += dt;
      const foe = P[1 - d.owner];
      d.face = foe.x > d.x ? 1 : -1;
      if (ctx.phase === 'live' && d.age > 10.5) popDecoy(d, false);
    }
  }

  // ---- portable holes -----------------------------------------------------------------------------------
  function newHole(x, y, n) { return { x, y, n, grow: 0, id: holeN++, arm: [false, false] }; }
  function placeHole(p) {
    let pair = null;
    for (const q of S.holes) if (q.owner === p.i && !q.b) pair = q;
    if (pair) {
      if (Math.abs(pair.a.x - p.x) < 90 && Math.abs(pair.a.y - p.y) < 40) { p.a1msg = 'TOO CLOSE! walk away first'; p.a1msgT = 1.6; return false; }
      pair.b = newHole(p.x, p.y, 1);
      pair.age = 0;
      p.a1cd = 6.5;
      p.a1n = 2;
      if (online && p.i === ctx.me) ctx.net.send({ k: 'hole', n: 1, x: r1(p.x), y: r1(p.y), pid: pair.id });
    } else {
      for (let i = S.holes.length - 1; i >= 0; i--) if (S.holes[i].owner === p.i) S.holes.splice(i, 1);
      pair = { owner: p.i, id: p.i * 100 + holeN, a: newHole(p.x, p.y, 0), b: null, age: 0 };
      S.holes.push(pair);
      p.a1n = 1;
      p.a1lock = 0.4;
      if (online && p.i === ctx.me) ctx.net.send({ k: 'hole', n: 0, x: r1(p.x), y: r1(p.y), pid: pair.id });
    }
    p.sq.v -= 8;
    sound.slap(p.x);
    fx.text('WHAP!', p.x, p.y - 40, 28, '#f7f0de', 0.7);
    fx.dust(p.x, p.y, 6, 0, 10);
    return true;
  }
  function holeEvent(msg) {
    const owner = 1 - ctx.me;
    if (msg.n === 0) {
      for (let i = S.holes.length - 1; i >= 0; i--) if (S.holes[i].owner === owner) S.holes.splice(i, 1);
      S.holes.push({ owner, id: msg.pid, a: newHole(msg.x, msg.y, 0), b: null, age: 0 });
    } else {
      for (const q of S.holes) if (q.owner === owner && !q.b) { q.b = newHole(msg.x, msg.y, 1); q.age = 0; }
    }
    sound.slap(msg.x);
  }
  function stepHoles(dt) {
    for (let i = S.holes.length - 1; i >= 0; i--) {
      const q = S.holes[i];
      q.age += dt;
      q.a.grow = Math.min(1, q.a.grow + dt * 5);
      if (q.b) q.b.grow = Math.min(1, q.b.grow + dt * 5);
      const life = q.b ? 16 : 11;
      if (q.age > life || ctx.sudden && q.age > 4) { fx.dust(q.a.x, q.a.y, 3, 0); if (q.b) fx.dust(q.b.x, q.b.y, 3, 0); S.holes.splice(i, 1); continue; }
    }
  }
  /** Walk into a hole of a complete pair: sink in, come out of its twin. */
  function holeCheck(p, dt) {
    for (const q of S.holes) {
      if (!q.b) continue;
      for (let e = 0; e < 2; e++) {
        const hl = e ? q.b : q.a, other = e ? q.a : q.b;
        const dx = Math.abs(p.x - hl.x), near = dx < 40 && Math.abs(p.y - hl.y) < 14;
        if (!near) { hl.arm[p.i] = true; continue; }
        if (hl.arm[p.i] && dx < 26 && p.ground && p.stun <= 0) {
          p.tele = { t: 0, tx: other.x, ty: other.y, from: hl, to: other };
          hl.arm[p.i] = false; other.arm[p.i] = false;
          p.vx = 0; p.vy = 0; p.charge = 0;
          sound.drop(p.x);
          fx.puff(hl.x, hl.y - 6, 0, -30, 12, 0.5);
          return;
        }
      }
    }
  }

  // ---- hats ---------------------------------------------------------------------------------------------
  function loseHat(p, dx) {
    if (!p.hat) return;
    p.hat = false;
    p.hatBack = 5.5;
    S.hats.push({ x: p.x, y: p.y - 108, vx: dx * 140, vy: -520, rot: 0, vr: dx * 8, style: p.i, col: p.col, mode: 0, owner: p.i, age: 0 });
    sound.stolen(p.x);
    fx.feathers(p.x, p.y - 100, 8);
  }

  function stagger(p, vx, vy, secs) {
    p.vx = vx; p.vy = vy; p.ground = false; p.stun = secs; p.charge = 0; p.lad = null; p.tele = null;
    p.sq.v += 10;
    p.coyote = 0;
    sound.dizzy(p.x);
  }

  // ---- one sniper ---------------------------------------------------------------------------------------
  const topEntry = (p) => {
    for (const l of w.ladders) {
      if (p.x >= l.z0 && p.x <= l.z1 && Math.abs(p.y - ladderTop(w, l)) < 8) return l;
    }
    return null;
  };

  function grabLadder(p, l, fromTop) {
    p.lad = l;
    p.x = l.x; p.vx = 0; p.vy = 0; p.ground = false; p.plat = '';
    if (fromTop) p.y = ladderTop(w, l) + 4;
    p.charge = 0;
    sound.rung(p.x);
  }

  function stepPlayer(p, cmd, dt) {
    const live = ctx.phase === 'live' && p.alive;
    const T = S.T;
    p.recoil = Math.max(0, p.recoil - dt * 4);
    p.flash = Math.max(0, p.flash - dt);
    p.rt = Math.max(0, p.rt - dt);
    p.reload = p.rmax > 0 ? p.rt / p.rmax : 0;
    p.stun = Math.max(0, p.stun - dt);
    p.coyote -= dt; p.hurtCd -= dt; p.spCd -= dt; p.drop = Math.max(0, p.drop - dt);
    p.a1cd = Math.max(0, p.a1cd - dt); p.a2cd = Math.max(0, p.a2cd - dt); p.a1lock = Math.max(0, p.a1lock - dt); p.a1msgT -= dt;
    p.scare = Math.max(0, p.scare - dt);
    spring(p.sq, 0, 330, 14, dt);
    if (p.hatBack > 0 && (p.hatBack -= dt) <= 0) S.hats.push({ x: p.x, y: p.y - 520, vx: 0, vy: 0, rot: 0.3, vr: 0, style: p.i, col: p.col, mode: 2, owner: p.i, age: 0 });
    // the aim, and a little sway on it that grows when moving and goes away when you take aim
    const mv = Math.abs(p.vx) > 25 || !p.ground ? 1 : 0.35;
    const sway = (0.05 * mv + 0.006) * (1 - 0.9 * p.charge) * (p.st === 1 ? 0.6 : 1);
    p.aim = cmd.a;
    p.a = p.aim + sway * (0.6 * Math.sin(T * 5.3 + p.i) + 0.4 * Math.sin(T * 11.1));
    if (Math.abs(Math.cos(p.a)) > 0.12) p.face = Math.cos(p.a) >= 0 ? 1 : -1;
    // inside a hole: sinking, travelling, popping out of the twin
    if (p.tele) {
      const tl = p.tele;
      tl.t += dt;
      if (tl.t < 0.3) { p.sink = tl.t / 0.3; } else if (tl.t < 0.55) {
        if (tl.t - dt < 0.3) { p.x = tl.tx; p.y = tl.ty; fx.puff(tl.tx, tl.ty - 6, 0, -40, 14, 0.5); sound.pop2(tl.tx); }
        p.sink = 1 - (tl.t - 0.3) / 0.25;
      } else {
        p.tele = null; p.sink = 0; p.vy = -520; p.ground = false; p.sq.v += 9; p.holeLock = 0.8;
        fx.text('POP!', p.x, p.y - 60, 28, '#f7f0de', 0.7);
      }
      return;
    }
    p.sink = 0;
    // ladders
    if (p.lad) {
      const l = p.lad, top = ladderTop(w, l);
      p.st = 2; p.h = PH; p.ground = false;
      const dy = live && p.stun <= 0 ? (cmd.my < -0.2 ? -1 : cmd.my > 0.2 ? 1 : 0) : 0;
      p.y += dy * CLIMB * dt;
      p.climb += Math.abs(dy) * dt * 11;
      p.vx = p.vy = 0;
      if (dy && ((p.climb * 1.7) | 0) !== ((p.climbPrev * 1.7) | 0)) sound.rung(p.x);
      p.climbPrev = p.climb;
      if (p.y <= top) { p.y = top; p.lad = null; p.st = 0; p.ground = true; p.plat = 'solid'; if (l.k === 'cliff') p.x += l.x < W / 2 ? -44 : 44; else if (l.k === 'pillar') p.x = l.x; p.vy = 0; }
      else if (p.y >= l.bot) { p.y = l.bot; p.lad = null; p.st = 0; p.ground = true; p.plat = 'solid'; p.vy = 0; }
      else if (live && cmd.jump) { p.lad = null; p.st = 0; p.vy = -JUMP * 0.75; p.vx = clamp(cmd.mx, -1, 1) * RUN * 0.8; p.ground = false; sound.jump(p.x); }
      return;
    }
    const rooted = live && p.stun <= 0 && p.ground && cmd.alt;
    // the barrel telescopes out the longer you hold, and snaps back when you let go
    const c0 = p.charge;
    if (rooted) p.charge = Math.min(1, p.charge + dt / 1.1);
    else p.charge = Math.max(0, p.charge - dt * 4);
    if (rooted && ((p.charge * 12) | 0) !== ((c0 * 12) | 0)) sound.ratchet(p.x, p.charge);
    if (rooted && c0 < 1 && p.charge >= 1) sound.ready(p.x);
    if (rooted && c0 < 0.2 && p.charge >= 0.2 && p.i === ctx.me) S.tookAim = true;
    const wasDuck = p.st === 1;
    p.st = live && p.stun <= 0 && p.ground && cmd.my > 0.6 && !rooted && !topEntry(p) ? 1 : 0;
    p.h = p.st === 1 ? PHC : PH;
    if (p.st === 1 && !wasDuck) sound.duck(p.x);
    // run
    let tx = 0;
    if (live && p.stun <= 0 && !rooted) tx = clamp(cmd.mx, -1, 1) * RUN * (p.st === 1 ? 0.4 : 1);
    const acc = p.stun > 0 ? (p.ground ? 1500 : 0) : p.ground ? (Math.abs(tx) > Math.abs(p.vx) ? 3000 : 4200) : 1900;
    p.vx += clamp(tx - p.vx, -acc * dt, acc * dt);
    // ladders: up on a ladder grabs it, down at the top of one climbs down
    if (live && p.stun <= 0 && !rooted) {
      if (cmd.my < -0.5 && !cmd.jumpBtn) {
        for (const l of w.ladders) if (Math.abs(p.x - l.x) < 22 && p.y > ladderTop(w, l) + 8 && p.y <= l.bot + 2) { grabLadder(p, l, false); return; }
      }
      if (cmd.my > 0.55 && p.ground) {
        const l = topEntry(p);
        if (l) { grabLadder(p, l, true); return; }
      }
    }
    if (p.ground) p.coyote = 0.1;
    if (live && p.stun <= 0 && !rooted && cmd.jump && p.coyote > 0) {
      if (cmd.my > 0.6 && (p.plat === 'board' || p.plat === 'see')) { p.drop = 0.25; p.y += 3; p.ground = false; p.vy = 100; p.coyote = 0; } else {
        p.vy = -JUMP; p.ground = false; p.coyote = 0;
        p.sq.v += 9;
        sound.jump(p.x);
        fx.dust(p.x, p.y, 3, 0, 7);
      }
    }
    // standing on the plank or the handcar carries you along with it
    if (p.ground && p.plat === 'see') p.y = plankY(w, p.x);
    const wasGround = p.ground, vy0 = p.vy;
    moveBody(w, p, dt);
    if (p.ground && !wasGround && vy0 > 380) {
      p.sq.v -= clamp(vy0 / 90, 4, 16);
      sound.land(p.x, vy0 > 700);
      fx.dust(p.x, p.y, 4, 0, 9);
    }
    // springboards
    if (p.ground && p.plat === 'solid' && p.spCd <= 0 && live) {
      for (const s of w.springs) {
        if (p.x >= s.x0 && p.x <= s.x1 && Math.abs(p.y - s.y) < 3) {
          p.vy = -SPRING; p.vx = clamp(p.vx + s.dir * 160, -RUN, RUN); p.ground = false; p.spCd = 0.4; p.coyote = 0;
          p.sq.v += 14; S.springHit[s.dir > 0 ? 0 : 1] = 1;
          sound.boing(p.x);
          if (p.i === ctx.me) fx.text('BOING!', p.x, p.y - 70, 30, '#f7f0de', 0.8);
          break;
        }
      }
    }
    if (p.ground && Math.abs(p.vx) > 25 && p.st === 0) {
      p.run += Math.abs(p.vx) * dt * 0.052;
      if (p.i === ctx.me) sound.step(p.x, dt, Math.abs(p.vx));
      if (Math.random() < dt * 5) fx.dust(p.x - Math.sign(p.vx) * 12, p.y, 1, 0, 6);
    }
    p.holeLock = Math.max(0, (p.holeLock || 0) - dt);
    if (live && p.holeLock <= 0 && p.ground) holeCheck(p, dt);
    if (!live) return;
    // the tools
    if (cmd.a1 && p.a1cd <= 0 && p.a1lock <= 0 && p.stun <= 0 && p.ground && p.plat !== 'car') placeHole(p);
    if (cmd.a2 && p.a2cd <= 0 && p.stun <= 0 && p.ground) {
      p.a2cd = 11;
      const id = p.i * 1000 + ++decoyN;
      plantDecoy(p.i, id, p.x, p.y, p.face);
      if (online && p.i === ctx.me) ctx.net.send({ k: 'decoy', id, x: r1(p.x), y: r1(p.y), f: p.face });
      if (p.i === ctx.me) S.usedDecoy = true;
    }
    if (cmd.fire && p.rt <= 0 && p.stun <= 0 && !p.lad) shoot(p, rooted && p.charge > 0.06 ? p.charge : 0);
  }

  /** The other player's sniper, driven by the network. */
  function puppet(p, dt) {
    const r = ctx.net.remote;
    p.recoil = Math.max(0, p.recoil - dt * 4);
    p.flash = Math.max(0, p.flash - dt);
    p.rt = Math.max(0, p.rt - dt);
    p.reload = p.rmax > 0 ? p.rt / p.rmax : 0;
    p.sq.x = p.sq.x; spring(p.sq, 0, 330, 14, dt);
    p.a1msgT -= dt; p.scare = Math.max(0, p.scare - dt);
    if (!r || !p.alive || !Number.isFinite(r.x) || !Number.isFinite(r.y) || !Number.isFinite(r.a)) return;
    if (dt > 0) { p.vx += ((r.x - p.x) / dt - p.vx) * Math.min(1, dt * 10); p.vy += ((r.y - p.y) / dt - p.vy) * Math.min(1, dt * 10); }
    const wasG = p.ground;
    p.x = r.x; p.y = r.y; p.a = p.aim = r.a;
    p.st = r.s | 0; p.ground = !!r.g; p.charge = (r.c || 0) / 100; p.stun = r.z ? 0.5 : 0; p.hat = !!r.h;
    p.sink = r.t ? 1 : 0;
    p.h = p.st === 1 ? PHC : PH;
    p.remoteHidden = !!r.t;
    if (Math.abs(Math.cos(p.a)) > 0.12) p.face = Math.cos(p.a) >= 0 ? 1 : -1;
    if (p.ground && !wasG && p.vy > 300) p.sq.v -= 8;
    if (p.ground && Math.abs(p.vx) > 25) p.run += Math.abs(p.vx) * dt * 0.052;
    if (p.st === 2) p.climb += Math.abs(p.vy) * dt * 0.058;
    p.stun = r.z ? 0.5 : 0;
  }

  // ---- the slapstick timetable ---------------------------------------------------------------------------
  const local = (p) => !p.remote && p.alive;
  function events(dt) {
    const t = ctx.time;
    if (ctx.phase !== 'live') return;
    for (const e of w.ev) {
      if (t < e.t0 - 0.1) break;
      if (t > e.t0 + e.dur + 0.2) { if (e.k === 'anvil' && !e.gone) { e.gone = true; fx.puff(e.x, anvilState(e, e.t0 + 1, w, as).ground - 30, 0, -20, 30, 0.6); } continue; }
      if (e.k === 'anvil') {
        anvilState(e, t, w, as);
        if (!e.w) { e.w = true; sound.anvilWarn(e.x); }
        if (!e.f && as.ph >= 0 && t >= e.t0 + ANVIL.warn - 0.45) { e.f = true; sound.anvilFall(e.x); }
        if (!e.hit && t >= e.t0 + ANVIL.warn + ANVIL.fall) {
          e.hit = true;
          refresh(w, t);
          sound.anvilLand(e.x);
          fx.ring(e.x, as.ground - 10, 10, 120, 0.4);
          fx.dust(e.x, as.ground, 8, 1, 14);
          fx.dust(e.x, as.ground, 8, -1, 14);
          fx.text('KA-DONG!', e.x, as.ground - 120, 40, '#f7f0de', 1.2);
          S.shake.add(0.55);
          if (e.y === PIV.y) w.tiltV += Math.sign(e.x - PIV.x) * 2.4;
          for (const p of P) {
            if (!local(p) || p.tele) continue;
            if (Math.abs(p.x - e.x) < ANVIL.w / 2 + PW + 14 && p.y > as.ground - 140 && p.y <= as.ground + 6) {
              const side = p.x < e.x ? -1 : 1;
              p.x = e.x + side * (ANVIL.w / 2 + PW + 3);
              stagger(p, side * 300, -380, 1.0);
              fx.star(p.x, p.y - 100, 0, -90, 9, 0.9);
            }
          }
        }
      } else if (e.k === 'train') {
        trainState(e, t, ts);
        if (!e.w) { e.w = true; sound.trainWarn(); }
        if (!e.b && ts.on) { e.b = true; sound.trainBurst(); S.shake.add(0.5); }
        if (ts.on) {
          sound.trainRun(dt, (ts.head + ts.tail) / 2);
          S.shake.add(dt * 0.9);
          for (const p of P) {
            if (!local(p) || p.hurtCd > 0 || p.tele) continue;
            const lo = Math.min(ts.head, ts.tail), hi = Math.max(ts.head, ts.tail);
            if (p.x > lo - 10 && p.x < hi + 10 && p.y > FLOOR - 120 && p.plat !== 'car') {
              p.hurtCd = 1.5;
              stagger(p, e.dir * 380, -720, 1.0);
              fx.text('WHOOSH!', p.x, p.y - 90, 34, '#f7f0de', 0.9);
              fx.star(p.x, p.y - 100, 0, -90, 9, 0.9);
            }
          }
        }
      } else if (e.k === 'weed') {
        weedState(e, t, ws);
        if (!e.w && ws.on) { e.w = true; sound.weed(ws.x); }
        if (ws.on) {
          sound.rattle(dt, ws.x);
          if (Math.random() < dt * 8) fx.dust(ws.x, ws.y + WEED.r, 1, e.side ? 1 : -1, 6);
          for (const p of P) {
            if (!local(p) || p.hurtCd > 0 || p.tele || p.lad) continue;
            if (Math.abs(p.x - ws.x) < WEED.r + PW - 4 && p.y > ws.y - WEED.r && p.y - p.h < ws.y + WEED.r) {
              p.hurtCd = 1.2;
              const dir = e.side ? -1 : 1;
              stagger(p, dir * 340, -420, 0.55);
              fx.text('BONK!', p.x, p.y - 80, 28, '#f7f0de', 0.8);
              sound.bonk(p.x, false);
            }
          }
        }
      } else if (e.k === 'bird') {
        birdState(e, t, bs);
        if (!e.w && bs.on) { e.w = true; sound.squawk(bs.x); }
        e.carry = e.carry || false;
        if (bs.on && bs.low && !e.hit) {
          for (const p of P) {
            if (!local(p) || !p.hat || p.tele || p.lad) continue;
            if (Math.abs(p.x - bs.x) < 46 && p.y - p.h < bs.y + 18 && p.y - 40 > bs.y - 24) {
              e.hit = true; e.carry = p.i + 1;
              p.hurtCd = 1;
              stagger(p, bs.dir * 120, -240, 0.6);
              loseHat(p, bs.dir);
              fx.text('SNATCH!', p.x, p.y - 100, 30, '#f7f0de', 0.9);
              if (online) ctx.net.send({ k: 'hat', who: p.i, e: w.ev.indexOf(e) });
              break;
            }
          }
        }
      }
    }
  }

  function stepHats(dt) {
    for (let i = S.hats.length - 1; i >= 0; i--) {
      const h = S.hats[i];
      h.age += dt;
      if (h.mode === 0 || h.mode === 2) { // free fall, or the replacement dropping onto its owner
        const p = P[h.owner];
        if (h.mode === 2) { h.vy += 2300 * dt; h.x += (p.x - h.x) * Math.min(1, dt * 9); h.rot *= 0.92; } else h.vy += 1500 * dt;
        h.x += h.vx * dt; h.y += h.vy * dt; h.rot += h.vr * dt;
        if (h.mode === 2 && h.y >= p.y - p.h - 6 && h.vy > 0) { p.hat = true; p.sq.v -= 6; sound.plop(p.x); fx.text('plop', p.x, p.y - 130, 18, '#f7f0de', 0.5); S.hats.splice(i, 1); continue; }
        if (h.mode === 0 && h.age > 1.2) S.hats.splice(i, 1);
      }
    }
  }

  function stepWorld(dt) {
    // the seesaw feels whoever stands on it (and whatever has landed there)
    const tw = w.tower;
    let weight = 0;
    for (const p of P) if (p.alive && !p.tele && p.ground && onPlank(p.x) && Math.abs(p.y - plankY(w, p.x)) < 6) weight += (p.x - PIV.x) / PLANK;
    for (const a of w.anvils) if (a.e && a.e.y === PIV.y) weight += 2.4 * Math.sign(a.x - PIV.x);
    const target = clamp(weight * 0.16, -0.3, 0.3);
    w.tiltV += ((target - w.tilt) * 55 - w.tiltV * 5.5) * dt;
    w.tilt += w.tiltV * dt;
    tw.wobV += (-90 * tw.wob - 4.5 * tw.wobV + w.tiltV * 26) * dt;
    tw.wob += tw.wobV * dt;
    for (let i = tw.lost.length - 1; i >= 0; i--) {
      const c = tw.lost[i];
      c.age += dt; c.vy += 1700 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt;
      if (c.age > 1.4) tw.lost.splice(i, 1);
    }
    refresh(w, ctx.time);
    w.car.vx = (w.hand - w.car.lastX) / Math.max(dt, 1e-4);
    w.car.lastX = w.hand;
    if (!(dt > 0)) w.car.vx = 0;
  }

  return { stepPlayer, puppet, stepCorks, stepDecoys, stepHoles, stepHats, stepWorld, events, launch, plantDecoy, popDecoy, holeEvent, crateOut, loseHat, stagger, shoulder, muzzleLen, shoot };
}
