// CARTRIDGE CANYON — a side-on, 16-colour, 320x180 pixel-art sniper duel on a canyon with a rope bridge.
//
// FANTASY   A 1990s cartridge nobody finished: two chunky snipers on facing cliffs, a rope bridge
//           with a missing-plank gap, a striped dusk sun. The world is drawn into a tiny buffer and
//           blown up with nearest-neighbour scaling inside an arcade bezel (scanlines, rounded tube).
// RULES     One hit wins. Bullets are visible pixels with real DROP (aim high) and, over the chasm,
//           THERMALS that lift or sink them (the LIFT gauge, the drifting motes). Crates stop bullets
//           and break after one. A balloon drifts across the gap as moving cover; a big bird crosses
//           now and then (a flashing sign warns you: crouch or lie down and it passes over).
// ROUTES    The cliff-top (cover, nests above), the bridge (open or crated), the chasm (drop through the
//           gap, ride the spring pads back up), the air (jetpack). Each is a real way to close the range.
// CONTROLS  move A/D (stick) · down = crouch · up / space = hop, hold to fly the JETPACK · down + jump = drop
//           through planks · aim mouse / aim stick · fire = rifle (one round, 1.25 s bolt)
//           alt PRONE (held, a toggle on touch): lie flat, can't move, steadiest aim, and a dotted arc shows
//                where the round will really fall (thermals not included).
//           a1 SMOKE   a lobbed canister; the cloud hides whoever stands in it from the other player.
//           a2 DECOY   a cardboard cut-out of you slides off along the ground, aiming; a hit pops it.
// BOT       Solves the same arc with lead and a thermal estimate that improves with skill, plays a plan
//           (cover peek, nest, edge, bridge, chasm raid), hesitates before it opens fire, ducks bullets and
//           the bird, throws smoke while advancing and decoys while holding, and can be fooled by decoys.
// ONLINE    Each client simulates its own sniper and judges its own shots; the other is a puppet. The view
//           is mirrored for the second sniper so that you always stand on the left of your own screen.
// KILL      Hit-stop, the victim flashes white and ink, then pops into pixel confetti and a starburst; the
//           buffer punches in 2x on them while a dithered K.O. banner slams across the screen.
// SUDDEN    The crates burst, the balloon floats off, thermals die, bullets fly flat and the bolt cycles
//           faster, both snipers get a beacon, and the chasm fills with rising lava.
import { clamp, damp, lerp, ease, shade, segRect, pointInRect, Shake } from '../../kit.js';
import { FW, FH, PAL, clearPatterns } from './palette.js';
import { C, BODY, HW, buildWorld, stepBody, solidAt, bulletStep, firstHit, traceBullet } from './world.js';
import { bakeBackdrop, bakeTerrain, bakeMist, scar } from './art.js';
import { makeFx } from './fx.js';
import { makeSound } from './sound.js';
import { makeBot } from './bot.js';
import { makeView } from './view.js';

const SUB = 1 / 100, BSUB = 1 / 120, ROUND = 45;
const r1 = (v) => Math.round(v * 10) / 10;
const wobble = (ph) => 0.62 * Math.sin(ph) + 0.38 * Math.sin(ph * 2.31 + 1.3);

export default {
  id: 'pixel',
  name: 'CARTRIDGE CANYON',
  tagline: 'Sixteen colours. One bullet. Aim high.',
  hint: 'Bullets drop: aim above your target.',
  perspective: 'SIDE-ON PIXEL ART',
  renderer: '2d',
  aim: 'pointer',
  palette: { bg: PAL.night, fg: PAL.cream, accent: PAL.coral },
  controls: { move: 'RUN · DUCK', aim: 'AIM', fire: 'SHOOT', alt: 'LIE DOWN', a1: 'SMOKE', a2: 'DECOY', jump: 'HOP/FLY' },
  altToggle: true, // the aim thumb is busy: on touch PRONE latches
  roundTime: ROUND,
  angleFields: ['a'],

  create(ctx) {
    const world = buildWorld(ctx.rng);
    const online = ctx.opponent === 'remote';
    const terr = bakeTerrain(world, ctx.seed);
    const art = { bg: bakeBackdrop(ctx.seed), terrain: terr.canvas, mist: bakeMist(ctx.seed) };
    const sound = makeSound(ctx);
    const fx = makeFx(300);
    const shake = new Shake(3, 0);

    const P = [0, 1].map((i) => ({
      i, col: ctx.players[i].color, colD: shade(ctx.players[i].color, -0.42),
      x: world.spawns[i].x, y: world.GY, vx: 0, vy: 0, ground: true, wasGround: true, wall: false, bounce: false, face: i ? -1 : 1, st: 0, run: 0, airT: 0, fuel: 1, jet: false,
      aim: i ? Math.PI + 0.03 : -0.03, a: i ? Math.PI + 0.03 : -0.03, sway: 0.012, swPh: Math.random() * 9,
      reload: 0, recoil: 0, flash: 0, alive: true, smokeCd: 0, decoyCd: 0, casing: -1, dipY: 0, stun: 0, birdCd: 0, hotCd: 0, landT: 0,
      remote: online && i !== ctx.me, bot: null,
    }));
    const S = {
      t: 0, P, bullets: [], smokes: [], grenades: [], decoys: [], motes: [], fx, world,
      padSquash: [0, 0], cam: { x: FW / 2, y: FH / 2, z: 1 }, kill: null, introT: -1, liveT: 0, readyT: 0, flashW: 0, sdOn: false,
      arc: Object.assign(new Float32Array(260), { n: 0 }), arcHit: { x: -1, y: -1 }, arcFull: false,
      hides: null, shots: [0, 0], pops: [], firstShot: -1,
    };
    // Smoke hides anything whose centre is inside a mature cloud.
    S.hides = (x, y) => {
      for (const c of S.smokes) {
        const age = S.t - c.t0;
        if (age < 0.25 || age > C.SMOKE_LIFE - 0.8) continue;
        const r = C.SMOKE_R * (0.35 + 0.65 * Math.min(1, age / 0.5)) * 0.78;
        if (Math.hypot(x - c.x, (y - c.y) * 1.15) < r) return true;
      }
      return false;
    };
    for (let i = 0; i < 34; i++) S.motes.push({ x: world.E + 6 + Math.random() * (FW - 2 * world.E - 12), y: 108 + Math.random() * 58, c: Math.random() < 0.5 ? PAL.cream : Math.random() < 0.5 ? PAL.peach : PAL.steel, long: Math.random() < 0.3 });
    const view = makeView(ctx, world, S, art);
    ctx.canvas.style.cursor = 'none'; // the pixel reticle is the cursor (restored in dispose)
    for (const p of P) if (!p.remote && (p.i !== ctx.me || ctx.autopilot)) p.bot = makeBot(ctx, world, S, p);

    const human = { mx: 0, crouch: false, a: 0, fire: false, alt: false, jump: false, jet: false, a1: false, a2: false };
    const scr = { x: 0, y: 0 }, rect = { x: 0, y: 0, w: 0, h: 0 }, cmds = [null, null];
    let prevUp = false, decoyN = 0, grenN = 0, music = '', frame = 0, birdWarned = false, birdOn = false, lavaSnd = false;
    const gs = () => (ctx.sudden ? 0.45 : 1);
    const reloadT = () => (ctx.sudden ? C.SD_RELOAD : C.RELOAD);
    const shoulder = (p, out) => { out.x = p.x + p.face * (p.st === 2 ? 3 : 1); out.y = p.y - BODY[p.st].sh; return out; };
    const sh = { x: 0, y: 0 };

    // ---- commands ----
    // Standing on planks or a nest: pressing down + jump lets you through.
    function onOneWay(p) {
      if (world.bridgeY(p.x) >= 0 && Math.abs(p.y - world.bridgeY(p.x)) < 2) return true;
      for (const n of world.nests) if (p.x > n.x && p.x < n.x + n.w && Math.abs(p.y - n.y) < 2) return true;
      return false;
    }

    function humanCmd(p) {
      const inp = ctx.input;
      view.layout();
      shoulder(p, sh);
      view.toCss(sh.x, sh.y, scr);
      const up = inp.moveY < -0.55;
      const flip = ctx.me === 1; // the view is mirrored for the second sniper
      human.mx = flip ? -inp.moveX : inp.moveX;
      human.crouch = inp.moveY > 0.55;
      const sa = inp.aimAngle(scr.x, scr.y, flip ? Math.PI - p.aim : p.aim);
      human.a = Number.isFinite(sa) ? (flip ? Math.PI - sa : sa) : p.aim; // a collapsed stage gives NaN: keep the old aim
      human.fire = inp.firePressed;
      human.alt = inp.alt;
      human.jump = inp.jumpPressed || (up && !prevUp);
      human.jet = inp.jump || up;
      human.a1 = inp.a1Pressed;
      human.a2 = inp.a2Pressed;
      prevUp = up;
      return human;
    }

    // ---- a locally simulated sniper ----
    function step(p, cmd, dt) {
      const live = ctx.phase === 'live' && p.alive;
      p.aim = cmd.a;
      if (Math.abs(Math.cos(p.aim)) > 0.1) p.face = Math.cos(p.aim) >= 0 ? 1 : -1;
      const prevSt = p.st, prone = live && cmd.alt && p.ground;
      p.st = prone ? 2 : live && cmd.crouch && p.ground ? 1 : ctx.phase === 'over' ? p.st : 0; // after a kill everyone holds their pose
      if (p.st === 2 && prevSt !== 2) { if (p.i === ctx.me) sound.prone(p.x); fx.emit(p.x - p.face * 5, p.y - 1, -p.face * 12, -18, 0.3, PAL.cream, 1, 40, 0, 2); }
      const spd = Math.abs(p.vx);
      const wantSway = p.stun > 0 ? 0.06 : p.st === 2 ? 0.0022 : p.st === 1 ? 0.0075 : !p.ground ? 0.03 : spd > 10 ? 0.021 : 0.012;
      p.sway = damp(p.sway, wantSway, p.sway > wantSway ? 4 : 9, dt);
      p.swPh += dt * (p.st === 2 ? 1.5 : 3.1);
      p.a = p.aim + p.sway * wobble(p.swPh);
      p.recoil = Math.max(0, p.recoil - dt * 5);
      p.flash = Math.max(0, p.flash - dt);
      p.stun = Math.max(0, p.stun - dt); p.birdCd = Math.max(0, p.birdCd - dt); p.hotCd = Math.max(0, p.hotCd - dt); p.landT = Math.max(0, p.landT - dt);
      if (p.casing > 0 && (p.casing -= dt) <= 0) eject(p);
      p.dipY = 0;
      const before = p.reload;
      if (live) p.reload = Math.max(0, p.reload - dt);
      if (before > 0 && p.reload === 0 && p.i === ctx.me && live) { sound.bolt(); S.readyT = 0.25; }
      if (live) { p.smokeCd = Math.max(0, p.smokeCd - dt); p.decoyCd = Math.max(0, p.decoyCd - dt); }

      // run, jump, jet
      let mx = clamp(cmd.mx, -1, 1);
      if (!live || p.st === 2) mx = 0;
      const top = p.st === 1 ? C.CROUCH_RUN : C.RUN;
      const acc = p.ground ? C.ACC_G : C.ACC_A;
      const tv = mx * top;
      p.vx += clamp(tv - p.vx, -acc * dt, acc * dt);
      if (live && cmd.jump && cmd.crouch && p.ground && onOneWay(p)) { p.drop = 0.22; p.vy = 30; p.ground = false; p.airT = 0; if (p.i === ctx.me) sound.land(p.x); }
      else if (live && cmd.jump && p.ground && p.st !== 2) { p.vy = -C.JUMP_V; p.ground = false; p.airT = 0; if (p.i === ctx.me) sound.jump(p.x); }
      p.jet = live && cmd.jet && !p.ground && p.airT > C.JET_DELAY && p.fuel > 0.02 && p.st !== 2;
      if (p.ground) p.fuel = Math.min(1, p.fuel + C.JET_REGEN * dt);
      else p.airT += dt;
      if (p.jet) p.fuel = Math.max(0, p.fuel - C.JET_BURN * dt);
      const n = Math.max(1, Math.ceil(dt / SUB)), h = dt / n, hh = BODY[p.st].h;
      let bounce = false;
      const landV = p.vy;
      for (let k = 0; k < n; k++) {
        p.vy += C.GRAV * h;
        if (p.jet) p.vy = Math.max(p.vy - C.JET_ACC * h, -C.JET_CAP);
        if (p.vy > 340) p.vy = 340;
        stepBody(world, p, h, HW, hh);
        if (p.bounce) bounce = true;
      }
      p.x = clamp(p.x, 4, FW - 4);
      if (p.ground && !p.wasGround && landV > 110) p.landT = 0.14;
      if (p.ground && !p.wasGround && landV > 110 && p.i === ctx.me) { sound.land(p.x); fx.sparks(p.x, p.y, -Math.PI / 2, 2.4, 4, 50, [PAL.cream, PAL.peach]); }
      p.wasGround = p.ground;
      if (bounce) { sound.spring(p.x); S.padSquash[p.x < FW / 2 ? 0 : 1] = 1; fx.sparks(p.x, p.y, -Math.PI / 2, 1.6, 6, 70, [PAL.coral, PAL.cream]); }
      if (p.ground && p.st === 0 && Math.abs(p.vx) > 14 && p.i === ctx.me) sound.step(p.x, dt);
      if (p.jet) { if (p.i === ctx.me) sound.jet(p.x, dt); if (Math.random() < dt * 40) fx.emit(p.x - p.face * 5, p.y - 2, (Math.random() - 0.5) * 20, 50 + Math.random() * 40, 0.3, Math.random() < 0.5 ? PAL.coral : PAL.peach, 1, 0, 0, 1); }
      if (Math.abs(p.vx) > 6 && p.ground) { p.run += Math.abs(p.vx) * dt * 0.2; dust(p, dt); }
      if (!live) return;
      if (cmd.fire && p.reload <= 0 && p.stun < 0.3) fire(p);
      if (cmd.a1 && p.smokeCd <= 0) throwSmoke(p);
      if (cmd.a2 && p.decoyCd <= 0) plantDecoy(p);
    }

    // The remote sniper: copy the interpolated state, work the rest out from how it moves.
    function puppet(p, dt) {
      const r = ctx.net.remote;
      p.recoil = Math.max(0, p.recoil - dt * 5);
      p.flash = Math.max(0, p.flash - dt);
      p.reload = Math.max(0, p.reload - dt);
      if (p.casing > 0 && (p.casing -= dt) <= 0) eject(p);
      if (!r || !p.alive || !Number.isFinite(r.x) || !Number.isFinite(r.y) || !Number.isFinite(r.a)) return;
      if (dt > 0) { p.vx += ((r.x - p.x) / dt - p.vx) * Math.min(1, dt * 12); p.vy += ((r.y - p.y) / dt - p.vy) * Math.min(1, dt * 12); }
      p.x = r.x; p.y = r.y;
      p.a = p.aim = r.a;
      p.st = ctx.phase === 'live' ? r.s | 0 : 0;
      p.jet = !!r.j && ctx.phase === 'live';
      p.ground = !!r.g;
      p.face = Math.cos(p.a) >= 0 ? 1 : -1;
      if (Math.abs(p.vx) > 6 && p.ground) { p.run += Math.abs(p.vx) * dt * 0.2; dust(p, dt); }
      if (p.jet && Math.random() < dt * 40) fx.emit(p.x - p.face * 5, p.y - 2, (Math.random() - 0.5) * 20, 50 + Math.random() * 40, 0.3, PAL.coral, 1, 0, 0, 1);
    }

    // little puffs kicked up by running boots
    function dust(p, dt) {
      if (p.st === 0 && Math.abs(p.vx) > 20 && Math.random() < dt * 9) fx.emit(p.x - Math.sign(p.vx) * 3, p.y - 1, -p.vx * 0.2, -8 - Math.random() * 8, 0.28, Math.random() < 0.5 ? PAL.cream : PAL.peach, 1, 20, 0, 3);
    }

    function eject(p) {
      p.casing = -1;
      shoulder(p, sh);
      fx.emit(sh.x, sh.y, -p.face * (20 + Math.random() * 20), -60 - Math.random() * 30, 0.9, PAL.amber, 1, 340, 0.4);
    }

    // ---- the rifle ----
    function fire(p) {
      shoulder(p, sh);
      launch(p.i, sh.x, sh.y, p.a, true);
      p.reload = reloadT();
      p.sway = Math.min(0.05, p.sway + 0.008);
      if (online && p.i === ctx.me) ctx.net.send({ k: 'shot', x: r1(sh.x), y: r1(sh.y), a: +p.a.toFixed(4) });
    }
    function launch(owner, x, y, a, judge) {
      const b = { owner, x, y, vx: Math.cos(a) * C.BULLET_V, vy: Math.sin(a) * C.BULLET_V, judge, live: true, age: 0, ox: x, oy: y, tx: new Float32Array(8), ty: new Float32Array(8), ti: 0, tn: 0, whiz: false };
      S.bullets.push(b);
      S.shots[owner]++;
      if (owner === ctx.me && S.firstShot < 0) S.firstShot = S.liveT;
      const p = P[owner];
      p.recoil = 1; p.flash = 0.09; p.casing = 0.5;
      if (p.remote) p.reload = reloadT();
      const mx = x + Math.cos(a) * 11, my = y + Math.sin(a) * 11;
      fx.sparks(mx, my, a, 0.7, 5, 160, [PAL.cream, PAL.peach, PAL.coral]);
      fx.emit(mx, my, Math.cos(a) * 20, Math.sin(a) * 20 - 8, 0.5, PAL.steel, 2, -20, 0, 1.5); // a puff of smoke
      shake.add(owner === ctx.me ? 0.4 : 0.16);
      sound.shot(x, owner === ctx.me);
    }
    function bodyRect(q) {
      const bd = BODY[q.st];
      rect.x = q.x - bd.w / 2; rect.y = q.y - bd.h; rect.w = bd.w; rect.h = bd.h;
      return rect;
    }
    const nearest = (ax, ay, bx, by, r) => {
      if (pointInRect(ax, ay, r)) return 0;
      const q = segRect(ax, ay, bx, by, r);
      return q ? q.t : -1;
    };
    const dRect = { x: 0, y: 0, w: 6, h: 16 };
    function howLabel(b, foe, hy, hx) {
      const bd = BODY[foe.st], m = Math.round(Math.hypot(foe.x - b.ox, foe.y - b.oy) * C.METRE);
      const head = foe.st === 2 ? (hx - foe.x) * foe.face > 5.2 && hy < foe.y - bd.h + 2.5 : hy < foe.y - bd.h + (foe.st === 1 ? 4 : 3); // the cap only: a real headshot is a small target
      if (head) return 'HEADSHOT';
      if (!foe.ground) return m > 150 ? 'AIR SHOT' : 'SKY HIGH';
      if (m < 70) return 'POINT BLANK';
      if (m >= 330) return `SNIPED ${m} M`;
      return Math.abs(foe.vx) > 30 && m > 110 ? 'LEAD SHOT' : `${m} M`;
    }
    function stepBullets(dt) {
      const n = Math.max(1, Math.ceil(dt / BSUB)), h = dt / n, flip = (frame++ & 1) === 1, nb = S.bullets.length;
      const live = ctx.phase === 'live', ls = ctx.sudden ? 0 : 1;
      for (let j = 0; j < nb; j++) {
        const b = S.bullets[flip ? nb - 1 - j : j];
        if (!b.live) continue;
        b.age += dt;
        for (let k = 0; k < n && b.live; k++) {
          const ax = b.x, ay = b.y;
          bulletStep(world, b, h, gs(), ls);
          let tBest = 2, kind = 0, idx = -1;
          const hit = firstHit(world, ax, ay, b.x, b.y);
          if (hit) { tBest = hit.t; kind = hit.kind; idx = hit.idx; }
          const foe = P[1 - b.owner];
          if (b.judge && live && foe.alive) {
            const t = nearest(ax, ay, b.x, b.y, bodyRect(foe));
            if (t >= 0 && t < tBest) { tBest = t; kind = 10; }
          }
          if (b.judge) for (const d of S.decoys) {
            if (!d.alive || d.owner === b.owner) continue;
            dRect.x = d.x - 3; dRect.y = d.y - 18; dRect.h = 18;
            const t = nearest(ax, ay, b.x, b.y, dRect);
            if (t >= 0 && t < tBest) { tBest = t; kind = 11; idx = d.id; }
          }
          if (kind) {
            const hx = ax + (b.x - ax) * tBest, hy = ay + (b.y - ay) * tBest;
            b.x = hx; b.y = hy; b.live = false;
            if (kind === 10) ctx.kill(foe.i, { how: howLabel(b, foe, hy, hx) });
            else if (kind === 11) { popDecoy(S.decoys.find((d) => d.id === idx), true); }
            else if (kind === 2) {
              const c = world.crates[idx];
              if (b.judge && c && c.alive) { breakCrate(c); if (online) ctx.net.send({ k: 'crate', id: c.id }); }
              else { sound.impact(hx); fx.sparks(hx, hy, Math.atan2(-b.vy, -b.vx), 1.4, 5, 120, [PAL.wood, PAL.peach]); }
            } else if (kind === 3) { sound.bonk(hx); fx.sparks(hx, hy, Math.atan2(-b.vy, -b.vx), 1.6, 6, 110, [PAL.cream, PAL.rose, PAL.coral]); world.balloon.hit = 1; }
            else {
              sound.impact(hx);
              fx.sparks(hx, hy, Math.atan2(-b.vy, -b.vx), 1.5, 7, 150, [PAL.cream, PAL.peach, PAL.coral]);
              fx.emit(hx, hy, 0, -6, 0.5, PAL.steel, 2, -10, 0, 2);
              scar(terr.g, hx, hy);
            }
            break;
          }
          if (b.x < -10 || b.x > FW + 10 || b.y > FH + 10 || b.y < -90) b.live = false;
        }
        // trail
        b.tx[b.ti] = b.x; b.ty[b.ti] = b.y; b.ti = (b.ti + 1) % 8; b.tn = Math.min(8, b.tn + 1);
        if (b.age > 3) b.live = false;
        // a near miss rattles the local sniper
        const me = P[ctx.me];
        if (b.live && !b.whiz && b.owner !== ctx.me && me.alive && Math.hypot(b.x - me.x, b.y - me.y + 8) < 16) { b.whiz = true; sound.whizz(); shake.add(0.3); }
      }
      for (let i = S.bullets.length - 1; i >= 0; i--) if (!S.bullets[i].live && S.bullets[i].age > 0.25) S.bullets.splice(i, 1);
    }
    function breakCrate(c) {
      c.alive = false;
      world.rebuild();
      sound.crate(c.x);
      fx.confetti(c.x + 5, c.y + 5, 12, 90, [PAL.wood, PAL.coral, PAL.night, PAL.peach]);
    }

    // ---- SMOKE: a lobbed canister that blooms where it lands ----
    function throwSmoke(p) {
      p.smokeCd = C.SMOKE_CD;
      shoulder(p, sh);
      const id = p.i * 1000 + ++grenN, a = p.aim;
      spawnGrenade(id, sh.x, sh.y, Math.cos(a) * 185 + p.vx * 0.4, Math.sin(a) * 185, p.i);
      if (online && p.i === ctx.me) ctx.net.send({ k: 'smoke', id, x: r1(sh.x), y: r1(sh.y), vx: r1(Math.cos(a) * 185 + p.vx * 0.4), vy: r1(Math.sin(a) * 185) });
    }
    function spawnGrenade(id, x, y, vx, vy, owner) {
      S.grenades.push({ id, x, y, vx, vy, age: 0, still: 0, owner });
      sound.throwSmoke(x);
    }
    function stepGrenades(dt) {
      for (let i = S.grenades.length - 1; i >= 0; i--) {
        const g = S.grenades[i];
        g.age += dt;
        const n = Math.ceil(dt / (1 / 120)), h = dt / n;
        for (let k = 0; k < n; k++) {
          g.vy += 480 * h;
          const nx = g.x + g.vx * h, ny = g.y + g.vy * h;
          if (solidAt(world, nx, g.y)) g.vx *= -0.35; else g.x = nx;
          if (solidAt(world, g.x, ny) || (world.bridgeY(g.x) >= 0 && g.vy > 0 && ny >= world.bridgeY(g.x) && g.y < world.bridgeY(g.x) + 2)) { if (Math.abs(g.vy) > 60) g.still = 0; g.vy *= -0.3; g.vx *= 0.8; g.still += h * 4; } else g.y = ny;
          if (g.still > 0.4 || g.age > 1.8 || g.y > FH - 3) { bloom(g); S.grenades.splice(i, 1); break; }
        }
      }
    }
    function bloom(g) {
      S.smokes.push({ x: g.x, y: g.y - 6, t0: S.t, seed: g.id * 1.7, owner: g.owner });
      if (S.smokes.length > 4) S.smokes.shift();
      sound.smoke(g.x);
      shake.add(0.12);
      fx.ring(g.x, g.y - 2, 2, 20, 0.4, PAL.cream);
    }

    // ---- DECOY: spawned on both clients from one event, then a pure function of the clock ----
    function plantDecoy(p) {
      p.decoyCd = C.DECOY_CD;
      const id = p.i * 1000 + ++decoyN, dir = p.face;
      spawnDecoy(p.i, id, p.x, p.y, dir, ctx.time, true);
      if (online && p.i === ctx.me) ctx.net.send({ k: 'decoy', id, x: r1(p.x), y: r1(p.y), dir, t: +ctx.time.toFixed(2) });
    }
    function spawnDecoy(owner, id, x, y, dir, t0) {
      let reach = 0;
      for (; reach < 70; reach += 2) {
        const x2 = x + dir * (reach + 4);
        if (solidAt(world, x2, y - 4) || world.floorY(x2, y - 2) > y + 3) break;
      }
      let mine = 0;
      for (const d of S.decoys) if (d.owner === owner && d.alive) { mine++; if (mine >= 2) { popDecoy(d, false); break; } }
      S.decoys.push({ id, owner, x0: x, y0: y, x, y, dir, face: dir, t0, reach, alive: true, moving: true, run: 0, aim: dir > 0 ? 0 : Math.PI });
      sound.decoy(x);
      fx.ring(x, y - 8, 2, 12, 0.3, P[owner].col);
    }
    function popDecoy(d, hit) {
      if (!d || !d.alive) return;
      d.alive = false;
      fx.confetti(d.x, d.y - 8, 26, 100, [P[d.owner].col, P[d.owner].colD, PAL.cream, PAL.wood]);
      fx.ring(d.x, d.y - 8, 2, 14, 0.3, PAL.cream);
      sound.pop(d.x);
      if (hit && online) ctx.net.send({ k: 'pop', id: d.id });
    }
    function stepDecoys(dt) {
      for (let i = S.decoys.length - 1; i >= 0; i--) {
        const d = S.decoys[i];
        if (!d.alive) { S.decoys.splice(i, 1); continue; }
        const age = Math.max(0, ctx.time - d.t0);
        if (ctx.phase === 'live' && age > C.DECOY_LIFE) { popDecoy(d, false); continue; }
        const run = Math.min(d.reach, C.DECOY_V * age);
        d.moving = run < d.reach - 0.5 && ctx.phase === 'live';
        d.x = d.x0 + d.dir * run;
        const fy = world.floorY(d.x, d.y0 - 3);
        d.y = fy < 1e5 ? fy : d.y0;
        if (d.moving) d.run += C.DECOY_V * dt * 0.2;
        const foe = P[1 - d.owner];
        const want = Math.atan2(foe.y - 10 - (d.y - 12), foe.x - d.x);
        d.aim = Math.abs(Math.cos(want)) > 0.1 ? want + Math.sin(S.t * 1.7 + d.id) * 0.012 : d.aim;
        d.face = Math.cos(d.aim) >= 0 ? 1 : -1;
      }
    }

    // ---- hazards: nuisances, never executioners. A point has to come from the other sniper's rifle. ----
    // The bird shoves you and rattles your aim; the lava (sudden death) spits you back out of the chasm.
    function stagger(p, vx, vy, secs) {
      p.stun = secs; p.vx = vx; p.vy = vy; p.ground = false; p.airT = 0; p.fuel = Math.max(0, p.fuel - 0.35);
      p.reload = Math.max(p.reload, 0.8);
    }
    function hazards() {
      if (ctx.phase !== 'live') return;
      const bd = world.bird;
      for (const p of P) {
        if (p.remote || !p.alive) continue;
        if (bd.on && p.birdCd <= 0) {
          const bx = bd.x - 11, by = bd.y - 7; // 22 wide, 13 high
          const r = bodyRect(p);
          if (r.x < bx + 22 && r.x + r.w > bx && r.y < by + 13 && r.y + r.h > by) {
            p.birdCd = 2.2;
            stagger(p, bd.dir * 95, -135, 0.8);
            fx.confetti(p.x, p.y - 12, 14, 70, [PAL.rose, PAL.coral, PAL.peach, PAL.cream]);
            fx.ring(p.x, p.y - 12, 2, 13, 0.3, PAL.cream);
            shake.add(0.45);
            if (p.i === ctx.me) { sound.squawk(p.x); S.pops.push({ x: p.x, y: p.y - 30, t: 0, s: 'SQUAWK!' }); }
          }
        }
        if (p.y > world.lavaY + 1 && p.hotCd <= 0) {
          p.hotCd = 0.9;
          stagger(p, (FW / 2 - p.x) * 0.3, -C.SPRING_V * 0.9, 0.6);
          fx.sparks(p.x, p.y, -Math.PI / 2, 1.6, 12, 120, [PAL.cream, PAL.peach, PAL.coral]);
          if (p.i === ctx.me) { sound.spring(p.x); S.pops.push({ x: p.x, y: p.y - 24, t: 0, s: 'HOT!' }); }
        }
      }
    }

    // ---- camera: a flourish before the round, a punch-in on the kill ----
    function camera(dt) {
      const c = S.cam, me = P[ctx.me], foe = P[1 - ctx.me];
      let tx = FW / 2, ty = FH / 2, tz = 1, rate = 6;
      if (ctx.phase === 'intro' && S.introT >= 0) {
        const u = S.introT;
        if (u < 0.9) { tz = 2; tx = me.x; ty = me.y - 14; rate = 20; }
        else if (u < 2.3) { const k = ease.inOutCubic((u - 0.9) / 1.4); tz = 2; tx = lerp(me.x, foe.x, k); ty = lerp(me.y, foe.y, k) - 14; rate = 20; }
        else { tz = 1; tx = FW / 2; ty = FH / 2; rate = 5; }
      } else if (S.kill) {
        const k = S.kill;
        if (k.t > 0.1) { tz = 2; tx = k.x; ty = k.y - 12; rate = 9; }
      }
      // zoom only ever takes whole steps: a half-way crop would give uneven pixels. The punch-ins are hard cuts with a flash.
      if (tz !== c.z) { c.z = tz; if (c.z === 1) S.flashW = Math.max(S.flashW, 0.22); }
      c.x = damp(c.x, tx, rate, dt); c.y = damp(c.y, ty, rate, dt);
    }

    function atmos(dt) {
      for (const m of S.motes) {
        const prof = world.lift(m.x) / 60;
        const sd = ctx.sudden;
        m.y -= (sd ? 16 : prof * 20) * dt;
        m.x += Math.sin(S.t * 0.8 + m.y * 0.1) * 3 * dt;
        if (m.y < 104 || m.y > 168) { m.y = sd ? 168 : prof > 0 ? 166 : 106; m.x = world.E + 6 + Math.random() * (FW - 2 * world.E - 12); }
      }
      for (let i = 0; i < 2; i++) S.padSquash[i] = Math.max(0, S.padSquash[i] - dt * 6);
      S.readyT = Math.max(0, S.readyT - dt);
      S.flashW = Math.max(0, S.flashW - dt * 3);
      if (world.balloon.hit) world.balloon.hit = Math.max(0, world.balloon.hit - dt * 4);
      for (const c of world.crates) if (c.hit) c.hit = 0;
    }

    function setMusic(kind) {
      if (music === kind) return;
      music = kind;
      sound.music(kind);
    }

    function updateArc() {
      const me = P[ctx.me];
      S.arcFull = me.st === 2;
      S.arcHit.x = -1;
      if (!me.alive || ctx.phase !== 'live') return;
      shoulder(me, sh);
      const r = traceBullet(world, sh.x, sh.y, me.a, 1.25, gs(), 0, S.arc);
      if (r.hit) { S.arcHit.x = r.x; S.arcHit.y = r.y; }
    }

    return {
      update(dt) {
        S.t += dt;
        const live = ctx.phase === 'live';
        if (ctx.phase === 'intro') { if (S.introT < 0) S.introT = 0; S.introT += dt; }
        if (live) S.liveT += dt;
        const sd = ctx.sudden ? Math.max(0, ctx.time - ROUND) : -1;
        world.sync(ctx.time, sd);
        if (ctx.sudden && !S.sdOn) {
          S.sdOn = true;
          sound.sudden();
          setMusic('hot');
          for (const c of world.crates) if (c.alive) breakCrate(c);
          S.flashW = 0.35;
        }
        if (sd > 0.5 && !lavaSnd) { lavaSnd = true; sound.lava(); }
        const bd = world.bird;
        if (bd.warn > 0 && !bd.on && !birdWarned) { birdWarned = true; sound.birdWarn(); }
        if (bd.warn === 0 && !bd.on) birdWarned = false;
        if (bd.on && !birdOn) { birdOn = true; sound.bird(bd.x); }
        if (!bd.on) birdOn = false;

        for (const p of P) if (!p.remote) cmds[p.i] = p.bot ? p.bot.think(dt) : humanCmd(p);
        for (const p of P) { if (p.remote) puppet(p, dt); else step(p, cmds[p.i], dt); }
        // someone standing on the bridge presses it down: the snipers draw at the dipped height
        const wdt = S.kill && S.kill.t < 0.1 ? dt * 0.1 : dt; // hit-stop: the world hangs for a beat when the shot lands
        stepGrenades(wdt);
        stepDecoys(wdt);
        stepBullets(wdt);
        hazards();
        fx.update(wdt, world);
        atmos(dt);
        for (let i = S.pops.length - 1; i >= 0; i--) { const q = S.pops[i]; q.t += dt; if (q.t > 1.1) S.pops.splice(i, 1); }
        if (S.kill) {
          const k = S.kill;
          const t0 = k.t;
          k.t += dt;
          if (k.t < 0.34) { const v = P[k.victim]; k.x = v.x; k.y = v.y; } else if (k.t > 0.5) { // the winner dances: little stars
            const w = P[k.winner];
            if ((k.spark -= dt) <= 0) { k.spark = 0.07; fx.emit(w.x + (Math.random() - 0.5) * 14, w.y - 26 - Math.random() * 6, (Math.random() - 0.5) * 30, -26, 0.5, Math.random() < 0.5 ? PAL.cream : w.col, 1, 60, 0, 1); }
          }
          if (t0 < 0.34 && k.t >= 0.34) {
            fx.confetti(k.x, k.y - 8, 70, 150, [k.vcol, k.vcolD, PAL.cream, PAL.peach, PAL.coral, PAL.cream]);
            fx.ring(k.x, k.y - 10, 3, 22, 0.5, PAL.cream);
            fx.ring(k.x, k.y - 10, 1, 14, 0.35, k.vcol);
            shake.add(0.8);
            sound.kill(k.x);
          }
        }
        camera(dt);
        updateArc();
        const me = P[ctx.me];
        if (online) ctx.net.sendState({ x: r1(me.x), y: r1(me.y), a: +me.a.toFixed(4), s: me.st, j: me.jet ? 1 : 0, g: me.ground ? 1 : 0 });
        ctx.hud.cooldown('fire', me.reload / reloadT());
        ctx.hud.cooldown('a1', me.smokeCd / C.SMOKE_CD);
        ctx.hud.cooldown('a2', me.decoyCd / C.DECOY_CD);
        ctx.hud.cooldown('jump', me.fuel < 0.995 ? 1 - me.fuel : 0);
        const sk = shake.update(dt);
        view.L.shx = Math.round(sk.x); view.L.shy = Math.round(sk.y);
      },

      render() {
        view.render();
      },

      onPhase(phase) {
        if (phase === 'live') setMusic('calm');
        else if (phase === 'over') {
          sound.stop(1.2);
          const res = ctx.result;
          if (!res || res.victim < 0 || res.winner < 0) return;
          const v = P[res.victim], w = P[res.winner];
          const how = res.how || '';
          S.kill = { victim: v.i, winner: w.i, x: v.x, y: v.y, t: 0, col: w.col, vcol: v.col, vcolD: v.colD, label: 'K.O.!', dir: w.x < v.x ? 1 : -1, spark: 0 };
          S.flashW = 0.55;
          shake.add(0.7);
          sound.impact(v.x);
          fx.sparks(v.x, v.y - 8, Math.PI * (w.x < v.x ? 0 : 1), 2.4, 16, 200, [PAL.cream, PAL.peach, PAL.coral]);
          fx.sparks(v.x, v.y - 12, Math.PI * (w.x < v.x ? 1 : 0), 1.2, 8, 110, [PAL.cream, PAL.cream, PAL.peach]); // the exit side
          v.vx = S.kill.dir * 70; v.vy = -95; v.ground = false; // the hit lifts them off their feet
          for (const b of S.bullets) if (b.live && b.owner === w.i) b.live = false;
          for (const d of S.decoys) if (d.alive) popDecoy(d, false);
        }
      },

      onNet(msg) {
        if (!msg) return;
        try {
          const them = 1 - ctx.me;
          if (msg.k === 'shot') {
            if ([msg.x, msg.y, msg.a].every(Number.isFinite) && S.bullets.length < 40) launch(them, msg.x, msg.y, msg.a, false);
          } else if (msg.k === 'smoke') {
            if ([msg.x, msg.y, msg.vx, msg.vy].every(Number.isFinite) && S.grenades.length < 6) spawnGrenade(msg.id, msg.x, msg.y, msg.vx, msg.vy, them);
          } else if (msg.k === 'decoy') {
            if ([msg.x, msg.y, msg.dir, msg.t].every(Number.isFinite) && S.decoys.length < 6) spawnDecoy(them, msg.id, msg.x, msg.y, msg.dir > 0 ? 1 : -1, msg.t);
          } else if (msg.k === 'pop') {
            for (const d of S.decoys) if (d.id === msg.id) popDecoy(d, false);
          } else if (msg.k === 'crate') {
            const c = world.crates[msg.id];
            if (c && c.alive) breakCrate(c);
          }
        } catch { /* a malformed event from the peer is ignored */ }
      },

      focus() {
        view.layout();
        const o = S.kill ? S.kill : P[1 - ctx.me];
        return { x: view.toCssX(o.x), y: view.toCssY(o.y - 8) };
      },

      debug: () => S,

      dispose() {
        sound.stop(0.3);
        S.bullets.length = 0; S.smokes.length = 0; S.decoys.length = 0; S.grenades.length = 0;
        fx.clear();
        view.dispose();
        ctx.canvas.style.cursor = '';
        clearPatterns();
      },
    };
  },
};
