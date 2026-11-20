// RUBBER HOSE RIDGE — a 1930s rubber-hose cartoon come to life, played as a side-on two-mesa sniper duel.
//
// FANTASY   Two egg-headed noodle-limbed gunslingers on facing mesas, a canyon of slapstick machinery between
//           them, a ragtime piano that everything — cacti, sun, mesas, snipers, crates — dances to, and an old
//           print's grain, gate weave and boiling ink lines over all of it. Black, white and warm grey; each
//           sniper's identity colour is the only tint.
// RULES     One bonk wins. The rifle is a cork pop-gun: the cork is a visible projectile that ARCS (it drops, so
//           aim above a far target and lead a moving one) and bounces once off rock. TAKE AIM (alt) telescopes
//           the barrel: the longer you hold, the flatter and faster the shot and the more of its path you can
//           see — but you are rooted, the barrel glints for everyone to see, and the kick shoves you back.
//           Anvils, a train, tumbleweeds and a hat-stealing vulture only stun or shove; they never score.
// ROUTES    Hold your mesa (rock to crouch behind, a perch up a ladder), run to the lip, or spring across the
//           canyon to the seesaw island (a crate tower splits it; a cork knocks the top crate off), or climb down
//           the cliff ladder, ride the handcar / cross the floor and climb the pillar.
// CONTROLS  move A/D or stick · up = jump (or climb, at a ladder) · down = duck (or climb down) · aim mouse /
//           aim stick · fire = pop a cork · alt TAKE AIM · a1 PORTABLE HOLE (slap one, then its twin; walk into
//           either to come out of the other — anyone can) · a2 DECOY (a waving cut-out of you).
// BOT       Feels the other sniper out for the first seconds, then plays a plan (hold, rock, perch, lip, spring,
//           descend), solves the arc with a lead that improves with skill, charges for long shots, ducks and
//           jumps corks, drops decoys and holes, and can be fooled by a decoy.
// ONLINE    Each client simulates its own sniper and judges its own corks; the other is a puppet. Shots, decoys,
//           holes, crates and stolen hats are events; every hazard is a pure function of ctx.time and the seed.
// KILL      A white flash and a BONK; the victim is scorched, blinking, with stars and birds circling, the hat
//           lands last — and an iris closes on them. SUDDEN DEATH: the house lights drop, spotlights find both
//           snipers, the crates burst, corks fly flat and fast and anvils rain on the mesas.
import { clamp, damp, ease, shade, Shake, mixHex } from '../../kit.js';
import { C, boil, FONT } from './ink.js';
import {
  W, H, GY, FLOOR, PIV, PW, PH, SPAWN, SHOULDER, LIP, CAR_Y, CAR_W, TRAIN, ANVIL, WEED, CRATE,
  buildWorld, refresh, plankY, anvilState, trainState, weedState, birdState, moveBody, traceCork, shotParams, ladderTop,
} from './world.js';
import { bakeStage, ARCH, BOUNDS } from './art.js';
import { makeFx } from './fx.js';
import { makeFilm, drawIris, drawSpots, bubble, drawReticle, drawArc, drawTag } from './post.js';
import { makeSound, BPM, BPM_HOT } from './sound.js';
import { makeSim, RELOAD } from './sim.js';
import { makeBot } from './bot.js';
import { drawSniper, drawDecoy, drawHat, drawDizzy, drawBirdie, GUN } from './figures.js';
import { drawLadder, drawSpring, drawSeesaw, crate, drawHandcar, drawTrainBody, drawAnvil, drawAnvilShadow, drawWeed, drawVulture, drawHole, drawCork, drawSun, drawCloud, drawCactus } from './props.js';

const ROUND = 45;
const r1 = (v) => Math.round(v * 10) / 10;
const OVER_SLOW = 0.35;

const CLOUDS = [[200, 120, 1.0, 9], [760, 210, 0.8, 7], [1280, 90, 1.25, 11], [1750, 190, 0.9, 5], [-300, 230, 1.1, 14]];

export default {
  id: 'toon',
  name: 'RUBBER HOSE RIDGE',
  tagline: 'Hot jazz, hotter corks. One bonk wins.',
  perspective: 'SIDE-ON 1930S CARTOON',
  renderer: '2d',
  aim: 'pointer',
  palette: { bg: '#1b1612', fg: '#f2ead8', accent: '#e9c46a' },
  controls: { move: 'RUN · CLIMB', aim: 'AIM', fire: 'SHOOT', alt: 'TAKE AIM', a1: 'HOLE', a2: 'DECOY', jump: 'JUMP' },
  hint: 'Corks arc, so aim above far targets. Hold TAKE AIM for a longer, flatter shot.',
  altToggle: true,
  roundTime: ROUND,
  angleFields: ['a'],

  create(ctx) {
    const online = ctx.opponent === 'remote';
    const w = buildWorld(ctx.rng);
    const sound = makeSound(ctx);
    const fx = makeFx(240);
    const film = makeFilm();
    const shake = new Shake(14, 0);
    const S = {
      T: 0, tl: 0, P: null, corks: [], decoys: [], holes: [], hats: [], shots: [0, 0], shake, springHit: [0, 0],
      firstShot: false, usedAlt: false, tookAim: false, usedDecoy: false, sd: false, sdA: 0, introT: 0, kill: null, hit: null,
      beat0: 0, flashW: 0, freeze: 0, holeHint: 0, decoyHint: 0,
    };
    const P = [0, 1].map((i) => {
      const col = ctx.players[i].color;
      return {
        i, col, colD: shade(col, -0.35), name: ctx.players[i].name, x: SPAWN[i], y: GY, vx: 0, vy: 0, hw: PW, h: PH, ground: true, plat: 'solid', drop: 0,
        coyote: 0, face: i ? -1 : 1, a: i ? Math.PI - 0.2 : -0.2, aim: i ? Math.PI - 0.2 : -0.2, st: 0, climb: 0, climbPrev: 0, lad: null, run: Math.random() * 6,
        charge: 0, reload: 0, rt: 0, rmax: RELOAD, recoil: 0, flash: 0, stun: 0, hat: true, hatBack: 0, alive: true, dead: false, sq: { x: 0, v: 0 },
        sx: 1, sy: 1, a1cd: 0, a2cd: 0, a1lock: 0, a1n: 2, a1msg: '', a1msgT: 0, holeLock: 0, tele: null, sink: 0, spCd: 0, hurtCd: 0, scare: 0,
        remote: online && i !== ctx.me, bot: null, remoteHidden: false, k: 0,
      };
    });
    S.P = P;
    const sim = makeSim(ctx, w, S, sound, fx);
    for (const p of P) if (!p.remote && (p.i !== ctx.me || ctx.autopilot)) p.bot = makeBot(ctx, w, S, p);
    ctx.canvas.style.cursor = 'none';

    // ---- view ----------------------------------------------------------------------------------------------
    const cam = { x: W / 2, y: H / 2, z: 1 };
    const V = { s0: 1, s: 1, cw: 1, ch: 1, u: 1 };
    const tx = (x) => (x - cam.x) * V.s + V.cw / 2;
    const ty = (y) => (y - cam.y) * V.s + V.ch / 2;
    function layout() {
      V.cw = ctx.width; V.ch = ctx.height;
      V.s0 = Math.max(1e-3, Math.min(V.cw / W, V.ch / H));
      V.s = V.s0 * cam.z;
      V.u = 1 / V.s;
    }
    const homeY = () => { const extra = Math.max(0, V.ch / V.s0 - H); return H / 2 - 0.05 * extra; };
    layout();
    cam.y = homeY();
    let bakedP = 0, art = null;
    const needP = () => clamp(Math.round(V.s0 * ctx.dpr * 12) / 10, 0.8, 1.3);
    const bake = () => {
      bakedP = needP();
      if (art) for (const L of [art.far, art.wall, art.terr]) { L.canvas.width = 1; L.canvas.height = 1; }
      art = bakeStage(ctx.seed, bakedP);
    };
    bake();
    const halftone = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 9;
      const g = c.getContext('2d'); g.fillStyle = 'rgba(27,22,18,0.55)'; g.beginPath(); g.arc(4.5, 4.5, 1.5, 0, 6.283); g.fill();
      return c;
    })();
    let halfPat = null, halfOf = null;
    const E = { T: 0, pulse: 0, sway: 0, hatLean: 0, hatTilt: 0, look: [0, 0] };
    const scr = { x: 0, y: 0 };
    const arcBuf = new Float32Array(160);
    const sp = { v: 0, g: 0 };
    const human = { mx: 0, my: 0, jump: false, jumpBtn: false, a: 0, fire: false, alt: false, a1: false, a2: false };
    let prevUp = false, music = false, lastBoil = -1, hudCharges = -9, as = { ph: 0, x: 0, y: 0, k: 0, ground: 0 }, ts = { u: 0, on: false, head: 0, tail: 0, warn: 0 }, ws = { on: false, x: 0, y: 0, rot: 0, gx: 0 }, bs = { u: 0, on: false, x: 0, y: 0, dir: 1, low: false };

    // ---- the person at the controls -------------------------------------------------------------------------
    function humanCmd(p) {
      const inp = ctx.input;
      layout();
      const a = inp.aimAngle(tx(p.x + p.face * 7), ty(p.y - SHOULDER * (p.st === 1 ? 0.66 : 1)), p.aim);
      human.a = Number.isFinite(a) ? a : p.aim;
      human.mx = inp.moveX; human.my = inp.moveY;
      const up = inp.moveY < -0.55;
      human.jumpBtn = inp.jumpPressed;
      human.jump = inp.jumpPressed || (up && !prevUp);
      prevUp = up;
      human.fire = inp.firePressed; human.alt = inp.alt; human.a1 = inp.a1Pressed; human.a2 = inp.a2Pressed;
      return human;
    }

    // ---- the kill moment -----------------------------------------------------------------------------------
    function startKill() {
      const res = ctx.result;
      if (!res || res.victim < 0 || res.winner < 0) return;
      const v = P[res.victim], wn = P[res.winner];
      const dir = S.hit ? Math.sign(S.hit.vx) || 1 : Math.sign(v.x - wn.x) || 1;
      v.alive = false; v.dead = true; v.lad = null; v.tele = null; v.sink = 0; v.stun = 0; v.charge = 0;
      v.vx = dir * 330; v.vy = -360; v.ground = false; v.sq.v = 16; v.hw = PW;
      v.hat = false;
      const hx = v.x, hy = v.y - 104;
      S.kill = { v, w: wn, t: 0, dir, hat: { x: hx, y: hy, vx: dir * 90, vy: -640, rot: 0, vr: dir * 7, land: false }, smoke: 0, birds: false, x: hx, y: v.y - 60 };
      S.flashW = 1; S.freeze = 0.12;
      shake.add(0.9);
      sound.kill(v.x);
      sound.stop(0.15);
      fx.burst(hx, hy + 24, 16, 700, 0.45);
      fx.ring(hx, hy + 20, 14, 130, 0.45);
      fx.text('BONK!', hx - dir * 10, hy - 58, 70, '#f7f0de', 1.6, -0.1 * dir);
      for (const c of S.corks) if (c.live && c.owner === wn.i) c.live = false;
      for (const d of S.decoys) sim.popDecoy(d, false);
    }

    function updateKill(rd) {
      const k = S.kill;
      if (!k) return;
      const t0 = k.t;
      k.t += rd;
      const v = k.v, wn = k.w;
      v.k = k.t;
      // the victim is flung, lands as a pancake, pops up scorched
      const kd = rd * 0.55;
      if (!v.ground) { moveBody(w, v, kd); } else v.vx *= Math.exp(-6 * kd);
      if (v.ground && !k.landed && t0 > 0.05) { k.landed = true; v.sq.v = -22; fx.dust(v.x, v.y, 6, 0, 12); sound.land(v.x, true); shake.add(0.3); }
      v.sq.x = v.sq.x;
      // the hat: up, over, and — last of all — onto the head
      const h = k.hat;
      if (!h.land) {
        const hd = rd * 0.5;
        h.vy += 1500 * hd; h.x += h.vx * hd; h.y += h.vy * hd; h.rot += h.vr * hd;
        h.x += (v.x - h.x) * Math.min(1, hd * (h.vy > 0 ? 7 : 1.2));
        if (h.vy > 0 && h.y >= v.y - PH - 6 && k.t > 1.0) { h.land = true; v.hat = true; v.sq.v -= 7; sound.plop(v.x); fx.text('plop', v.x, v.y - 140, 22, '#f7f0de', 0.6); }
      }
      if (k.t > 0.35 && (k.smoke -= rd) <= 0) { k.smoke = 0.2; fx.puff(v.x + (Math.random() - 0.5) * 10, v.y - 100, (Math.random() - 0.5) * 20, -40, 7 + Math.random() * 4, 0.9, '#9a9182'); }
      if (!k.birds && k.t > 0.6) { k.birds = true; sound.birds(); sound.dizzy(v.x); }
      // the winner takes a bow
      if (k.t > 0.5 && (k.hop = (k.hop || 0) - rd) <= 0) { k.hop = 0.55; wn.sq.v = 9; if (wn.ground) { wn.vy = -300; wn.ground = false; } fx.star(wn.x + (Math.random() - 0.5) * 30, wn.y - 120, (Math.random() - 0.5) * 80, -120, 8, 0.9, wn.col); }
      if (!wn.ground) moveBody(w, wn, kd); else wn.vx *= Math.exp(-8 * kd);
      wn.recoil = Math.max(0, wn.recoil - rd * 4);
    }

    // ---- update ----------------------------------------------------------------------------------------------
    return {
      update(dt) {
        const over = ctx.phase === 'over';
        const rd = over ? dt / OVER_SLOW : dt; // real-time clock for animation, even in the slow-motion kill moment
        S.T += rd;
        boil.f = Math.floor(S.T * 12);
        layout();
        if (ctx.phase === 'intro') S.introT += dt;
        if (ctx.phase === 'live') S.tl = ctx.time;
        if (S.freeze > 0) S.freeze -= rd;
        const wdt = over ? (S.freeze > 0 ? 0 : rd * 0.5) : dt;
        S.flashW = Math.max(0, S.flashW - rd * 3);
        for (let i = 0; i < 2; i++) S.springHit[i] = Math.max(0, S.springHit[i] - rd * 5);
        if (ctx.sudden && !S.sd) {
          S.sd = true;
          sound.sudden(); sound.music(true); S.beat0 = S.T; S.flashW = 0.5;
          while (w.tower.n > 0) sim.crateOut(false);
          w.carOn = false;
          for (const p of P) if (p.rt > 0.6) p.rt = 0.6;
        }
        if (S.sd) S.sdA = Math.min(0.62, S.sdA + rd * 0.5);

        // who does what
        for (const p of P) {
          if (p.remote) { sim.puppet(p, wdt); continue; }
          if (!p.alive) continue;
          const cmd = p.bot ? p.bot.think(dt) : humanCmd(p);
          if (wdt > 0) sim.stepPlayer(p, cmd, wdt);
        }
        sim.events(wdt);
        sim.stepWorld(wdt);
        sim.stepCorks(wdt);
        sim.stepDecoys(wdt);
        sim.stepHoles(wdt);
        sim.stepHats(wdt);
        fx.update(over ? rd * 0.7 : dt);
        // dust from the train and a lazy trickle of notes from the ragtime
        updateTrainFx(dt);
        updateKill(rd);
        // the world's smaller gags
        const me = P[ctx.me];
        if (ctx.phase === 'live' && !online && !ctx.autopilot) { /* nothing: the human has no automatic duties */ }
        if (online) ctx.net.sendState({ x: r1(me.x), y: r1(me.y), a: +me.a.toFixed(3), s: me.st, g: me.ground ? 1 : 0, c: Math.round(me.charge * 100), z: me.stun > 0 ? 1 : 0, h: me.hat ? 1 : 0, t: me.tele ? 1 : 0 });
        ctx.hud.cooldown('fire', me.reload);
        ctx.hud.cooldown('a1', me.a1cd / 6.5);
        ctx.hud.cooldown('a2', me.a2cd / 11);
        const n1 = me.a1cd > 0 ? null : (S.holes.some((q) => q.owner === ctx.me && !q.b) ? 1 : 2);
        if (n1 !== hudCharges) { hudCharges = n1; ctx.hud.charges('a1', n1); }
        // sudden death makes the very first bell ring a little extra
        camera(dt, rd);
        shake.update(Math.min(rd, 0.05));
      },

      render() {
        draw();
      },

      onPhase(phase) {
        if (phase === 'live') {
          S.beat0 = S.T;
          if (!music) { music = true; sound.music(false); }
        } else if (phase === 'over') startKill();
      },

      onNet(msg) {
        if (!msg) return;
        try {
          const them = 1 - ctx.me;
          if (msg.k === 'shot') {
            if ([msg.x, msg.y, msg.a].every(Number.isFinite)) sim.launch(them, msg.x, msg.y, msg.a, clamp(+msg.c || 0, 0, 1), false);
          } else if (msg.k === 'decoy') {
            if ([msg.x, msg.y].every(Number.isFinite)) sim.plantDecoy(them, msg.id, msg.x, msg.y, msg.f > 0 ? 1 : -1);
          } else if (msg.k === 'pop') {
            for (const d of S.decoys) if (d.id === msg.id) sim.popDecoy(d, false);
          } else if (msg.k === 'hole') {
            if ([msg.x, msg.y].every(Number.isFinite)) sim.holeEvent(msg);
          } else if (msg.k === 'crate') {
            sim.crateOut(false);
          } else if (msg.k === 'hat') {
            const e = w.ev[msg.e | 0], p = P[msg.who === 0 ? 0 : 1];
            if (e && e.k === 'bird') { e.hit = true; e.carry = p.i + 1; sim.loseHat(p, e.side ? -1 : 1); }
          }
        } catch { /* a malformed event from the peer is ignored */ }
      },

      focus() {
        layout();
        const k = S.kill;
        const p = k ? k.v : P[1 - ctx.me];
        return { x: tx(p.x), y: ty(p.y - 70) };
      },

      debug: () => S,

      dispose() {
        sound.stop(0.3);
        fx.clear();
        S.corks.length = 0; S.decoys.length = 0; S.holes.length = 0; S.hats.length = 0;
        if (art) for (const L of [art.far, art.wall, art.terr]) { L.canvas.width = 1; L.canvas.height = 1; }
        art = null;
        ctx.canvas.style.cursor = '';
      },

      resize() { layout(); if (art && needP() !== bakedP) bake(); },
    };

    // ---- camera: a flourish before the round, a push-in on the kill ----------------------------------------
    function camera(dt, rd) {
      const me = P[ctx.me], foe = P[1 - ctx.me];
      let x = W / 2, y = homeY(), z = 1, rate = 4;
      if (ctx.phase === 'intro') {
        const u = S.introT;
        const zz = Math.min(1.6, 1 + 0.35 * Math.max(0, V.cw / V.ch - 1.4)); // wide screens can afford a tighter flourish
        if (u < 1.0) { x = me.x + (me.i ? -140 : 140); y = me.y - 70; z = zz; rate = 14; }
        else if (u < 2.5) { const k = ease.inOutCubic((u - 1.0) / 1.5); x = (me.x + (me.i ? -140 : 140)) * (1 - k) + (foe.x + (foe.i ? -140 : 140)) * k; y = me.y - 70; z = zz; rate = 12; }
        else { rate = 3.5; }
      } else if (S.kill && S.kill.t > 0.12) {
        const k = S.kill, u = clamp((k.t - 0.12) / 1.2, 0, 1);
        x = k.v.x; y = k.v.y - 78; z = 1 + 0.85 * ease.outCubic(u); rate = 7;
      }
      cam.z = damp(cam.z, z, rate, rd);
      cam.x = damp(cam.x, x, rate, rd);
      cam.y = damp(cam.y, y, rate, rd);
    }

    function updateTrainFx(dt) {
      if (ctx.phase !== 'live') return;
      for (const e of w.ev) {
        if (e.k !== 'train' || ctx.time < e.t0 || ctx.time > e.t0 + e.dur) continue;
        trainState(e, ctx.time, ts);
        if (ts.on) {
          if (Math.random() < dt * 14) fx.puff(ts.head - e.dir * 112, FLOOR - 150, -e.dir * 40, -70, 14, 0.9, '#f7f0de');
          if (Math.random() < dt * 10) fx.dust(ts.tail + e.dir * 60, FLOOR, 1, -e.dir, 8);
          if (!e.paper) { e.paper = true; const a = ARCH[e.dir > 0 ? 0 : 1]; fx.chips(a.x, FLOOR - 80, 16, 520, '#f7f0de'); fx.text('RIIIP!', a.x + e.dir * 40, FLOOR - 190, 38, '#f7f0de', 1.1); }
        } else if (ts.warn < 1 && Math.random() < dt * 6) {
          const a = ARCH[e.dir > 0 ? 0 : 1];
          fx.puff(a.x + (Math.random() - 0.5) * 80, FLOOR - 150, 0, -50, 10, 0.8, '#f7f0de');
        }
      }
    }

    // ---- drawing ------------------------------------------------------------------------------------------
    function beat() {
      const bpm = S.sd ? BPM_HOT : BPM;
      const B = Math.max(0, S.T - S.beat0) * bpm / 60;
      const f = B - Math.floor(B);
      E.T = S.T;
      E.pulse = Math.exp(-f * 5);
      E.sway = Math.sin(B * Math.PI);
    }

    function poseOf(p) {
      const air = p.ground || p.lad ? 0 : clamp(-p.vy / 900, -0.25, 0.3);
      const q = clamp(p.sq.x, -0.5, 0.45);
      p.sy = clamp(1 + q + air, 0.45, 1.5);
      p.sx = clamp(1 - q * 0.75 - air * 0.5, 0.7, 1.5);
    }

    function moodOf(p) {
      const k = S.kill;
      if (p.dead) return p.k < 0.45 ? 'scared' : 'scorch';
      if (k && k.w === p && k.t > 0.4) return 'win';
      if (p.stun > 0) return 'dizzy';
      if (p.charge > 0.05 || (p.rt <= 0 && p.aimHeld)) return 'aim';
      if (p.scare > 0) return 'scared';
      return 'ok';
    }

    function drawWorld(g) {
      const T = S.T;
      // sky
      // far mesas bob to the beat
      g.save();
      g.translate(0, 560); g.scale(1, 1 + 0.02 * E.pulse); g.translate(0, -560);
      const F = art.far; g.drawImage(F.canvas, F.x0, F.y0, F.w, F.h);
      g.restore();
      // clouds drift and bounce
      for (let i = 0; i < CLOUDS.length; i++) {
        const [x0, y0, s, seed] = CLOUDS[i];
        const x = ((x0 + 300 + T * (5 + i * 1.6)) % 2600) - 450;
        drawCloud(g, x, y0 + Math.sin(T * 1.9 + i) * 4 - E.pulse * 3, s * (1 + 0.02 * E.pulse), seed);
      }
      const Wl = art.wall; g.drawImage(Wl.canvas, Wl.x0, Wl.y0, Wl.w, Wl.h);
      const Tt = art.terr; g.drawImage(Tt.canvas, Tt.x0, Tt.y0, Tt.w, Tt.h);
    }

    function draw() {
      const g = ctx.g;
      layout();
      if (art && needP() !== bakedP) bake();
      beat();
      const cw = V.cw, ch = V.ch, T = S.T;
      const sh = shake.out;
      const weave = (Math.sin(boil.f * 12.9) * 0.5 + Math.sin(boil.f * 4.1) * 0.4) * 0.9;
      // paper-white sky with a halftone fade at the top
      const grd = g.createLinearGradient(0, 0, 0, ch);
      grd.addColorStop(0, '#d8cdb4'); grd.addColorStop(0.5, '#efe6d0'); grd.addColorStop(1, '#e4d9c0');
      g.fillStyle = grd;
      g.fillRect(0, 0, cw, ch);
      if (halfOf !== g) { halfOf = g; halfPat = g.createPattern(halftone, 'repeat'); }
      if (halfPat) {
        const hg = g.createLinearGradient(0, 0, 0, ch * 0.55);
        hg.addColorStop(0, 'rgba(27,22,18,0.20)'); hg.addColorStop(1, 'rgba(27,22,18,0)');
        g.save(); g.globalAlpha = 0.55; g.fillStyle = halfPat; g.fillRect(0, 0, cw, ch * 0.55);
        g.globalCompositeOperation = 'destination-out';
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, ch * 0.3, cw, ch * 0.25);
        g.restore();
        g.fillStyle = hg; g.fillRect(0, 0, cw, ch * 0.55);
      }
      g.save();
      g.translate(cw / 2 + sh.x + weave, ch / 2 + sh.y + weave * 0.6);
      g.scale(V.s, V.s);
      g.translate(-cam.x, -cam.y);
      g.lineJoin = 'round'; g.lineCap = 'round';
      drawSun(g, 1190, 118 + Math.sin(T * 1.4) * 3, T, E);
      drawWorld(g);
      drawDecor(g, T);
      drawActors(g, T);
      g.restore();
      drawOverlay(g, T);
      film.draw(g, cw, ch, T, 1);
      if (S.flashW > 0) { g.fillStyle = `rgba(255,252,240,${Math.min(1, S.flashW)})`; g.fillRect(0, 0, cw, ch); }
    }

    function drawDecor(g, T) {
      // machinery on the canyon floor sits between the wall and the cliffs
      const cax = w.hand;
      // paper scraps and warning lights at the tunnel mouths
      for (const e of w.ev) {
        if (e.k !== 'train' || ctx.time < e.t0 - 0.05 || ctx.time > e.t0 + e.dur + 0.1) continue;
        trainState(e, ctx.time, ts);
        const a = ARCH[e.dir > 0 ? 0 : 1];
        if (!ts.on && ts.warn < 1) {
          const on = Math.sin(T * 16) > 0;
          g.save();
          g.translate(a.x, FLOOR - 188);
          g.fillStyle = on ? '#fff' : C.ink; g.strokeStyle = C.ink; g.lineWidth = 4;
          g.beginPath(); g.arc(0, 0, 14, 0, 6.283); g.fill(); g.stroke();
          g.fillStyle = on ? C.ink : '#fff'; g.font = `900 20px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 0, 1);
          g.restore();
          g.strokeStyle = C.ink; g.lineWidth = 3;
          for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(a.x + i * 40, FLOOR - 40); g.lineTo(a.x + i * 40 + Math.sin(T * 40 + i) * 3, FLOOR - 120); g.stroke(); }
        }
      }
      // handcar and train
      if (w.carOn) drawHandcar(g, w.car, cax, T, E);
      for (const e of w.ev) {
        if (e.k !== 'train' || ctx.time < e.t0 || ctx.time > e.t0 + e.dur) continue;
        trainState(e, ctx.time, ts);
        if (!ts.on) continue;
        g.save();
        g.beginPath(); g.rect(ARCH[0].x - 40, FLOOR - 220, ARCH[1].x - ARCH[0].x + 80, 232); g.clip();
        g.translate(ts.head, FLOOR);
        g.scale(e.dir, 1);
        drawTrainBody(g, S.T, E, ts.u * TRAIN.speed);
        g.restore();
      }
      // the rock's ink, boiling
      g.save();
      g.strokeStyle = C.ink; g.lineWidth = 5.5;
      g.stroke(art.paths[boil.f % 3]);
      g.restore();
      // ladders, springs, the seesaw rock
      for (const l of w.ladders) drawLadder(g, w, l, T);
      drawSeesaw(g, w, T, E);
      for (const c of w.tower.lost) crate(g, c.x, c.y, c.rot, CRATE, 120, false);
      for (let i = 0; i < 2; i++) drawSpring(g, w.springs[i], S.springHit[i], T, E);
      // cacti: the chorus line
      drawCactus(g, 46, GY + 4, 1.05, T, E, 1);
      drawCactus(g, W - 46, GY + 4, 1.05, T + 0.3, E, 2);
      drawCactus(g, 572, FLOOR + 2, 0.8, T, E, 3);
      drawCactus(g, 1028, FLOOR + 2, 0.8, T + 0.2, E, 4);
    }

    function drawActors(g, T) {
      // anvil shadows first, then holes and decoys, then the snipers
      for (const e of w.ev) {
        if (e.k !== 'anvil' || ctx.time < e.t0 || ctx.time > e.t0 + e.dur) continue;
        anvilState(e, ctx.time, w, as);
        if (as.ph === 0) drawAnvilShadow(g, e.x, as.ground, as.k);
        else if (as.ph === 1) drawAnvilShadow(g, e.x, as.ground, 1);
      }
      for (const q of S.holes) {
        drawHole(g, q.a, T, P[q.owner].col, true);
        if (q.b) drawHole(g, q.b, T, P[q.owner].col, true);
      }
      for (const d of S.decoys) {
        d.x += 0; drawDecoy(g, d, E, P[d.owner].col, d.owner);
      }
      const order = ctx.me === 0 ? [1, 0] : [0, 1];
      for (const i of order) {
        const p = P[i];
        poseOf(p);
        const mood = moodOf(p);
        E.look[0] = Math.abs(Math.cos(p.a)); E.look[1] = Math.sin(p.a);
        E.hatTilt = clamp(-p.vx * 0.0006, -0.2, 0.2) + E.sway * 0.03; E.hatLean = 0;
        g.save();
        if (p.sink > 0) {
          g.beginPath(); g.rect(p.x - 90, p.y - 260, 180, 262); g.clip();
          g.translate(0, p.sink * 130);
        }
        // a soft ink shadow on the ground
        if (!p.lad && p.sink < 0.5) {
          g.fillStyle = 'rgba(27,22,18,0.2)';
          g.beginPath(); g.ellipse(p.x, p.y + 1, 26 * (1 - Math.min(1, (p.vy ? Math.abs(p.y - (p.ground ? p.y : p.y)) : 0))), 5, 0, 0, 6.283); g.fill();
        }
        drawSniper(g, p, E, mood);
        if (p.dead && p.k > 0.55) {
          drawDizzy(g, p.x, p.y - 128, S.T, p.col);
          drawBirdie(g, p.x, p.y - 118, S.T, 0); drawBirdie(g, p.x, p.y - 118, S.T, 2);
        } else if (p.stun > 0) drawDizzy(g, p.x, p.y - 128, S.T, p.col);
        g.restore();
      }
      // hats in flight
      const k = S.kill;
      if (k && !k.hat.land) drawHat(g, k.v.i, k.v.col, k.hat.x, k.hat.y, k.hat.rot, 1, 9);
      for (const h of S.hats) drawHat(g, h.style, h.col, h.x, h.y, h.rot, 1, 3);
      // corks
      for (const c of S.corks) if (c.live) drawCork(g, c, P[c.owner].col, T);
      // slapstick
      for (const e of w.ev) {
        if (ctx.time < e.t0 - 0.2 || ctx.time > e.t0 + e.dur + 0.2) continue;
        if (e.k === 'anvil') {
          anvilState(e, ctx.time, w, as);
          if (as.ph === 1) drawAnvil(g, e.x, as.y, as.k, true, T);
          else if (as.ph === 2) drawAnvil(g, e.x, as.ground, as.k, false, T);
        } else if (e.k === 'weed') {
          weedState(e, ctx.time, ws);
          if (ws.on) drawWeed(g, ws.x, ws.y, ws.rot, WEED.r, T);
        } else if (e.k === 'bird') {
          birdState(e, ctx.time, bs);
          if (bs.on) drawVulture(g, bs.x, bs.y, bs.dir, T, !!e.carry, e.carry ? e.carry - 1 : 0, e.carry ? P[e.carry - 1].col : '#fff');
        }
      }
      fx.draw(g);
      // the in-world UI: the arc, the prompt, the tags
      const me = P[ctx.me];
      const u = V.u;
      if (me.alive && ctx.phase !== 'over') {
        for (const p of P) drawTag(g, p.x, p.y - (p.st === 1 ? 92 : 134) - (p.hat ? 20 : 4), p.name, p.i === ctx.me, p.col, u, T);
        if (!ctx.autopilot && ctx.phase === 'live' && !me.lad && !me.tele) drawPreview(g, me, u);
        if (!ctx.autopilot && ctx.phase === 'live') drawPrompt(g, me, u);
        if (me.a1msgT > 0) bubble(g, me.x, me.y - 150, [me.a1msg], u, T, me.col);
      }
    }

    function drawPreview(g, me, u) {
      shotParams(me.charge, ctx.sudden, sp);
      const L = GUN.base + 9 + me.charge * GUN.sect * GUN.n;
      const sx = me.x + me.face * 7, sy = me.y - (SHOULDER - 2) * (me.st === 1 ? 0.66 : 1);
      const x0 = sx + Math.cos(me.a) * L, y0 = sy + Math.sin(me.a) * L;
      const tmax = 0.28 + 1.0 * me.charge * me.charge + 0.5 * me.charge;
      const n = traceCork(w, x0, y0, Math.cos(me.a) * sp.v, Math.sin(me.a) * sp.v, sp.g, tmax, 0.04, arcBuf);
      drawArc(g, arcBuf, n, u, me.col, 0.5);
      me.aimHeld = true;
    }

    function drawPrompt(g, me, u) {
      const dev = ctx.input.device;
      let lines = null;
      if (!S.firstShot && ctx.time < 22) {
        lines = dev === 'touch' ? ['DRAG to aim,', 'LET GO to shoot'] : dev === 'gamepad' ? ['RIGHT STICK aims', 'RT shoots'] : ['CLICK to shoot', 'corks drop: aim high'];
      } else if (!S.usedAlt && !S.tookAim && S.firstShot && ctx.time < 40 && S.shots[ctx.me] >= 1 && S.shots[ctx.me] < 4) {
        lines = dev === 'touch' ? ['TAP TAKE AIM, then', 'aim: longer & flatter'] : dev === 'gamepad' ? ['HOLD LT: longer,', 'flatter shot'] : ['HOLD RIGHT-CLICK:', 'longer, flatter shot'];
      }
      if (lines && me.alive) bubble(g, me.x + me.face * 4, me.y - (me.hat ? 150 : 134) - 24 * u, lines, u, S.T, me.col);
    }

    function drawOverlay(g, T) {
      const cw = V.cw, ch = V.ch;
      const me = P[ctx.me];
      // sudden death: the house lights drop and a spotlight finds each sniper
      if (S.sdA > 0.01 && ctx.phase !== 'over') {
        const spots = [];
        for (const p of P) spots.push({ x: tx(p.x), y: ty(p.y - 60), r: (170 + Math.sin(T * 5) * 6) * V.s0 * 1.0 + 40, col: p.col });
        drawSpots(g, cw, ch, spots, S.sdA, T);
      }
      // reticle: the cursor of this world
      if (!ctx.autopilot && ctx.phase === 'live' && me.alive) {
        const inp = ctx.input;
        let rx, ry;
        if (inp.device === 'kbm') { rx = inp.pointerX; ry = inp.pointerY; } else {
          const d = Math.min(cw, ch) * 0.28;
          rx = tx(me.x + me.face * 7) + Math.cos(me.a) * d; ry = ty(me.y - SHOULDER) + Math.sin(me.a) * d;
        }
        if (Number.isFinite(rx) && Number.isFinite(ry)) drawReticle(g, rx, ry, 1, me.col, me.charge, T, me.rt <= 0);
      }
      // the iris closes on the victim
      const k = S.kill;
      if (k && k.t > 0.85) {
        const u = clamp((k.t - 0.85) / 1.5, 0, 1);
        const maxR = Math.hypot(cw, ch);
        drawIris(g, cw, ch, tx(k.v.x), ty(k.v.y - 92), maxR * (1 - ease.inOutCubic(u)) + 34 * V.s * (1 - u) + 8);
      }
      // the opening: an iris-in from the local sniper
      if (ctx.phase === 'intro' && S.introT < 0.8) {
        const u = clamp(S.introT / 0.8, 0, 1);
        drawIris(g, cw, ch, tx(me.x), ty(me.y - 70), Math.hypot(cw, ch) * ease.outCubic(u) + 20);
      }
    }
  },
};
