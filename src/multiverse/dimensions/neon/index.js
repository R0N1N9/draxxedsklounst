// NEON LATTICE — a top-down twin-stick sniper duel in a dark glass arena.
//
// FANTASY   Two snipers on a floor of light. When the round goes live the lights go out:
//           you only see what you have a clear line to. Everything else is shadow.
// RULES     One rail hit wins. A rail crosses the arena in a quarter of a second (lead a
//           runner at range) and RICOCHETS exactly once. From the hip the barrel wanders:
//           the pip in the reticle is where the round will really go.
// TELLS     Running lights the floor tiles under your feet, and they show through the
//           dark. Muzzle flashes, lasers and blinks are light too, and a rail lights
//           whatever it passes. Every four bars the lattice PULSES and shows everyone for
//           a heartbeat (the rim counts it in). Stand still, or crawl, to stay unseen.
// CONTROLS  move · aim (mouse / stick) · fire RAIL
//           alt FOCUS (held)  crawl; the sway settles to nothing and a laser sight, bounce
//                             included, is projected across the arena — for both players.
//           a1 BLINK          short teleport through cover; leaves an afterimage.
//           a2 DECOY          a hologram runs off along your aim, lighting tiles as you
//                             would, then kneels and paints a fake laser (the home
//                             dimension's decoy, reborn).
// WORLD     Shutters slide across the lanes, a floor-polishing drone trundles along the
//           south alley as moving cover, watcher drones crowd the glass, and now and then
//           somebody's cursor wanders in to inspect a pillar. All timed from ctx.time.
// BOT       Believes only what a player could know (sight, lit tiles, flashes, lasers, the
//           pulse). Picks a peek spot at a range set by its nerve, plants and focuses for
//           the long shot, hip-fires up close, breaks sight to recharge, banks ricochets
//           at campers, side-steps lasers, throws decoys. See bot.js.
// KILL      The victim shatters into light and the glass cracks under them; a shockwave
//           runs through the grid, the shadows lift, the decisive rail hangs in the air,
//           the watchers' flashbulbs go off and the camera pushes in.
// SUDDEN    The cover dissolves, the shadows lift, and the walls close to a small box.
import { clamp, damp, angDamp, lerp, ease, segCircle } from '../../kit.js';
import { W, H, R, SPAWNS, MID, ROUND_TIME, PULSE_EVERY, BEAT, RAIL_SPEED, SPEED, CRAWL, RELOAD, BEAM_FADE, buildWorld, mkPath } from './world.js';
import { pointSeg } from './geom.js';
import { makeBot } from './bot.js';
import { makeRenderer } from './draw.js';
import { makeSound } from './sound.js';
import { fxState, makeFx } from './fx.js';

const SWAY_HIP = 0.032, SWAY_RUN = 0.036, SWAY_MIN = 0.0012;
const BLINK_DIST = 235, BLINK_CD = 5.5, BLINK_SLIP = 40;
const DECOY_CD = 12, DECOY_LIFE = 6.5, DECOY_RUN = 2.7, DECOY_SPEED = 235, DECOY_STEP = 1 / 60;
const STEP_EVERY = 0.2, STEP_SPEED = 135; // slower than this and the tiles stay dark
// The kill frame, in CSS px: margin round the shooter, room round the victim's shatter, clearance under the banner.
const KILL_PAD = 64, KILL_ROOM = 130, KILL_TOP = 64;

// The barrel's wander: slow enough to read and time, never a plain sine.
const wobble = (ph) => 0.62 * Math.sin(ph) + 0.38 * Math.sin(ph * 2.37 + 1.3);
const r1 = (v) => Math.round(v * 10) / 10;

export default {
  id: 'neon',
  name: 'NEON LATTICE',
  tagline: 'Lights out. Line of sight is everything.',
  perspective: 'TOP-DOWN 2D',
  renderer: '2d',
  aim: 'pointer',
  palette: { bg: '#07061a', fg: '#ece8ff', accent: '#ff4fb0' },
  controls: { fire: 'RAIL', alt: 'FOCUS', a1: 'BLINK', a2: 'DECOY' },
  altToggle: true, // three fingers are one too many: on touch FOCUS latches
  roundTime: ROUND_TIME,
  angleFields: ['a'],

  create(ctx) {
    const world = buildWorld(ctx.rng);
    const solids = world.solids;
    const online = ctx.opponent === 'remote';

    // ---- the two snipers: 0 always takes the left spawn ----
    const P = [0, 1].map((i) => ({
      i, x: SPAWNS[i].x, y: SPAWNS[i].y, vx: 0, vy: 0,
      aim: i ? Math.PI : 0, a: i ? Math.PI : 0, // intent, and where the barrel really points (aim + sway)
      sway: SWAY_HIP, swPh: Math.random() * 9,
      alive: true, focus: false, reload: 0, blinkCd: 0, decoyCd: 0, recoil: 0, stepT: 0,
      laser: mkPath(), laserOn: false,
      remote: online && i !== ctx.me, // a puppet fed by the network
      bot: null,
    }));

    // Everything the renderer and the bot read.
    const S = {
      t: 0, P, bullets: [], decoys: [],
      ...fxState(),
      dark: 0,                                 // 0 = house lights, 1 = only your sight lines
      vis: 1,                                  // how visible the enemy is to the local player
      ghost: { on: false, x: 0, y: 0, a: 0, t: 0 }, // where they were last seen
      seeing: true,
      pulse: { flash: 0, soon: 0, age: 0 },      // the four-bar reveal: its flash, its count-in, seconds since
      painted: 0,                              // an enemy laser is on the local player
      lock: false,                             // the local laser is on the enemy
      introT: -1, liveT: 0,
      kill: null,
      cam: { x: W / 2, y: H / 2, z: 1, roll: 0 },
      watch: { x: MID.x, y: MID.y, jolt: 0 },  // what the watcher drones are looking at
      droneHit: 0,
      note: { x: 0, y: 0, t: -9 },             // the local rail just burst a hologram here
    };
    const sound = makeSound(ctx);
    const view = makeRenderer(ctx, world, S);
    for (const p of P) if (!p.remote && (p.i !== ctx.me || ctx.autopilot)) p.bot = makeBot(ctx, world, S, p);

    const human = { mx: 0, my: 0, a: 0, fire: false, alt: false, a1: false, a2: false, da: undefined };
    const scr = { x: 0, y: 0 }, spot = { x: 0, y: 0 }, cmds = [null, null];
    let decoyN = 0, pulseN = 0, countN = -1, wasSudden = false, hinted = false, paintT = 0, music = '', frame = 0;

    const tell = (i, x, y, q) => { if (P[i].bot) P[i].bot.notice(x, y, q); };

    // Everything a sniper does in the open is light, and light shows through the dark: the
    // other side's bot hears about it exactly as a player would see it.
    const fx = makeFx(ctx, S);
    function tile(x, y, owner) {
      fx.tile(x, y, owner);
      tell(1 - owner, x, y, 0.55);
    }

    // ---- commands ----
    function humanCmd(p) {
      const inp = ctx.input;
      view.toScreen(p.x, p.y, scr);
      human.mx = inp.moveX;
      human.my = inp.moveY;
      human.a = inp.aimAngle(scr.x, scr.y, p.aim);
      human.fire = inp.firePressed;
      human.alt = inp.alt;
      human.a1 = inp.a1Pressed;
      human.a2 = inp.a2Pressed;
      return human;
    }

    // ---- a locally simulated sniper ----
    function step(p, cmd, dt) {
      const live = ctx.phase === 'live' && p.alive;
      p.aim = cmd.a;
      p.swPh += dt * 4.6;
      p.focus = live && cmd.alt;
      const speed = Math.hypot(p.vx, p.vy);
      const want = p.focus ? SWAY_MIN : SWAY_HIP + SWAY_RUN * Math.min(1, speed / SPEED);
      p.sway = damp(p.sway, want, p.sway > want ? (p.focus ? 3.6 : 5) : 10, dt);
      p.a = p.aim + p.sway * wobble(p.swPh);
      p.recoil = Math.max(0, p.recoil - dt * 5);
      if (!live) { p.vx = damp(p.vx, 0, 12, dt); p.vy = damp(p.vy, 0, 12, dt); return; }

      const before = p.reload;
      p.reload = Math.max(0, p.reload - dt);
      if (before > 0 && p.reload === 0 && p.i === ctx.me) sound.ready();
      p.blinkCd = Math.max(0, p.blinkCd - dt);
      p.decoyCd = Math.max(0, p.decoyCd - dt);

      let mx = cmd.mx, my = cmd.my;
      const ml = Math.hypot(mx, my);
      if (ml > 1) { mx /= ml; my /= ml; }
      const top = p.focus ? CRAWL : SPEED;
      p.vx = damp(p.vx, mx * top, 15, dt);
      p.vy = damp(p.vy, my * top, 15, dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      solids.push(p, R);
      footsteps(p, speed, dt);

      if (cmd.a1 && p.blinkCd <= 0) blink(p, ml > 0.2 ? Math.atan2(my, mx) : p.aim);
      if (cmd.a2 && p.decoyCd <= 0) {
        p.decoyCd = DECOY_CD;
        const id = p.i * 1000 + ++decoyN, dir = cmd.da !== undefined ? cmd.da : p.aim;
        spawnDecoy(p.i, id, p.x, p.y, dir, ctx.time);
        if (online) ctx.net.send({ k: 'decoy', id, x: r1(p.x), y: r1(p.y), a: +dir.toFixed(3), t: +ctx.time.toFixed(2) });
      }
      if (cmd.fire && p.reload <= 0) fire(p);
    }

    function footsteps(p, speed, dt) {
      if (speed < STEP_SPEED) { p.stepT = Math.min(p.stepT, 0.08); return; }
      p.stepT -= dt;
      if (p.stepT <= 0) { p.stepT = STEP_EVERY; tile(p.x, p.y, p.i); }
    }

    // The remote sniper: copy the interpolated state, and work out the rest from how it moves.
    function puppet(p, dt) {
      const r = ctx.net.remote;
      p.recoil = Math.max(0, p.recoil - dt * 5);
      p.reload = Math.max(0, p.reload - dt);
      if (!r || !p.alive || !Number.isFinite(r.x) || !Number.isFinite(r.y) || !Number.isFinite(r.a)) return;
      const dx = r.x - p.x, dy = r.y - p.y;
      p.x = r.x;
      p.y = r.y;
      p.a = p.aim = r.a;
      p.focus = !!r.f && ctx.phase === 'live';
      if (dt > 0 && Math.hypot(dx, dy) < 60) { // a bigger jump is a blink, not a sprint
        p.vx = damp(p.vx, dx / dt, 12, dt);
        p.vy = damp(p.vy, dy / dt, 12, dt);
      }
      if (ctx.phase === 'live') footsteps(p, Math.hypot(p.vx, p.vy), dt);
      else p.vx = p.vy = 0;
    }

    // ---- BLINK ----
    function blink(p, dir) {
      const dx = Math.cos(dir), dy = Math.sin(dir);
      // As far as there is free floor: cover thinner than the jump is simply skipped.
      for (let d = BLINK_DIST; d >= 60; d -= 12) {
        let x = p.x + dx * d, y = p.y + dy * d;
        if (!solids.free(x, y, R + 1)) {
          // Grazing a wall (hugging it, aiming a touch inward): land beside it, do not refuse.
          spot.x = x;
          spot.y = y;
          solids.push(spot, R + 2);
          if (Math.hypot(spot.x - x, spot.y - y) > BLINK_SLIP || !solids.free(spot.x, spot.y, R + 1)) continue;
          x = spot.x;
          y = spot.y;
        }
        if (online) ctx.net.send({ k: 'blink', x0: r1(p.x), y0: r1(p.y), x1: r1(x), y1: r1(y), a: +p.a.toFixed(2) });
        blinkFx(p.i, p.x, p.y, x, y, p.a);
        p.x = x;
        p.y = y;
        p.blinkCd = BLINK_CD;
        p.stepT = STEP_EVERY;
        return;
      }
      p.blinkCd = 0.35;
      if (p.i === ctx.me) sound.deny();
    }
    function blinkFx(owner, x0, y0, x1, y1, a) {
      fx.echo(x0, y0, a, owner);
      fx.flash(x0, y0, owner, 70, 0.3);
      fx.flash(x1, y1, owner, 110, 0.4);
      fx.ring(x1, y1, owner, 110, 0.7);
      fx.streak(x0, y0, x1, y1, owner);
      tell(1 - owner, x1, y1, 0.8);
      sound.blink(x1);
    }

    // ---- DECOY: spawned on both clients from one event, then a pure function of the clock ----
    function spawnDecoy(owner, id, x, y, dir, t0) {
      S.decoys.push({
        id, owner, x, y, vx: 0, vy: 0, dir, a: dir, t0, simT: 0, alive: true, mode: 'run', stall: 0, stepT: 0.1,
        focus: false, reload: 0, recoil: 0, laser: mkPath(), laserOn: false, vis: owner === ctx.me ? 1 : 0, fade: 0, born: S.t,
      });
      if (owner === ctx.me) sound.decoy(x);
    }
    function decoyTick(d) {
      if (d.mode !== 'run') return;
      const px = d.x, py = d.y;
      d.x += Math.cos(d.dir) * DECOY_SPEED * DECOY_STEP;
      d.y += Math.sin(d.dir) * DECOY_SPEED * DECOY_STEP;
      solids.push(d, R);
      d.vx = (d.x - px) / DECOY_STEP;
      d.vy = (d.y - py) / DECOY_STEP;
      const sp = Math.hypot(d.vx, d.vy);
      if (sp > 40) d.a = Math.atan2(d.vy, d.vx);
      d.stall = sp < DECOY_SPEED * 0.3 ? d.stall + DECOY_STEP : 0;
      d.stepT -= DECOY_STEP;
      if (d.stepT <= 0 && sp > STEP_SPEED) { d.stepT = STEP_EVERY; tile(d.x, d.y, d.owner); }
      // Out of road, or far enough: kneel and paint.
      if (d.stall > 0.25 || d.simT > DECOY_RUN) { d.mode = 'paint'; d.vx = d.vy = 0; d.focus = true; }
    }
    function popDecoy(d) {
      if (!d.alive) return;
      d.alive = false;
      d.laserOn = false;
      fx.pixels(d.x, d.y, d.owner);
      fx.flash(d.x, d.y, d.owner, 80, 0.3);
      sound.pop(d.x);
    }
    function stepDecoys(dt) {
      for (let i = S.decoys.length - 1; i >= 0; i--) {
        const d = S.decoys[i];
        if (!d.alive) {
          d.fade += dt;
          if (d.fade > 0.4) S.decoys.splice(i, 1);
          continue;
        }
        if (ctx.phase !== 'live') continue;
        const age = ctx.time - d.t0;
        for (let n = 0; n < 12 && d.simT + DECOY_STEP <= age; n++) { d.simT += DECOY_STEP; decoyTick(d); }
        if (age > DECOY_LIFE) { popDecoy(d); continue; }
        d.laserOn = d.mode === 'paint';
        if (d.laserOn) {
          const e = P[1 - d.owner];
          d.a = angDamp(d.a, Math.atan2(e.y - d.y, e.x - d.x) + 0.16 * Math.sin(S.t * 0.9 + d.id), 2.2, dt);
          world.trace(d.x, d.y, d.a, d.laser);
        }
      }
    }

    // ---- the rail ----
    function fire(p) {
      const path = world.trace(p.x, p.y, p.a, mkPath());
      launch(p.i, path, !online || p.i === ctx.me);
      p.reload = RELOAD;
      p.recoil = 1;
      p.sway = Math.min(0.09, p.sway + 0.03);
      if (online && p.i === ctx.me) ctx.net.send({ k: 'shot', n: path.n, x0: r1(path.x0), y0: r1(path.y0), x1: r1(path.x1), y1: r1(path.y1), x2: r1(path.x2), y2: r1(path.y2) });
    }
    // judge = this client decides what the round hits (true for everything it simulates).
    function launch(owner, path, judge) {
      S.bullets.push({ owner, path, judge, s: 0, total: path.l1 + path.l2, age: 0, done: false, fade: 0, bounced: false, kill: false, stopped: false, focus: P[owner].focus });
      P[owner].recoil = 1;
      if (P[owner].remote) P[owner].reload = RELOAD; // a puppet's capacitor, as far as we can tell
      const a = Math.atan2(path.y1 - path.y0, path.x1 - path.x0);
      const mx = path.x0 + Math.cos(a) * R * 2.3, my = path.y0 + Math.sin(a) * R * 2.3;
      fx.flash(mx, my, owner, 150, 0.22, true, a);
      fx.ring(path.x0, path.y0, owner, 150, 0.8);
      fx.sparks(mx, my, Math.cos(a), Math.sin(a), owner, 8, 420);
      S.shake.add(owner === ctx.me ? 0.42 : 0.2);
      S.watch.x = path.x0; S.watch.y = path.y0; S.watch.jolt = 1;
      tell(1 - owner, path.x0, path.y0, 0.9);
      sound.rail(path.x0, owner === ctx.me);
    }

    // Does the stretch [s0, s1] of bullet b's path strike something? Returns the distance, or -1.
    let struck = null;
    function strikeLeg(b, ax, ay, bx, by, base, len) {
      let best = -1;
      const foe = P[1 - b.owner];
      if (foe.alive && ctx.phase === 'live') {
        const t = segCircle(ax, ay, bx, by, foe.x, foe.y, R + 2);
        if (t >= 0) { best = base + t * len; struck = foe; }
      }
      for (let i = 0; i < S.decoys.length; i++) {
        const d = S.decoys[i];
        if (!d.alive || d.owner === b.owner) continue;
        const t = segCircle(ax, ay, bx, by, d.x, d.y, R + 2);
        if (t >= 0 && (best < 0 || base + t * len < best)) { best = base + t * len; struck = d; }
      }
      return best;
    }
    function strike(b, s0, s1) {
      const p = b.path;
      struck = null;
      if (s0 < p.l1) {
        const u0 = s0 / p.l1, u1 = Math.min(s1, p.l1) / p.l1;
        const at = strikeLeg(b, lerp(p.x0, p.x1, u0), lerp(p.y0, p.y1, u0), lerp(p.x0, p.x1, u1), lerp(p.y0, p.y1, u1), s0, (u1 - u0) * p.l1);
        if (at >= 0) return at;
      }
      if (p.n === 3 && s1 > p.l1 && p.l2 > 0) {
        const u0 = Math.max(0, s0 - p.l1) / p.l2, u1 = (s1 - p.l1) / p.l2;
        return strikeLeg(b, lerp(p.x1, p.x2, u0), lerp(p.y1, p.y2, u0), lerp(p.x1, p.x2, u1), lerp(p.y1, p.y2, u1), p.l1 + u0 * p.l2, (u1 - u0) * p.l2);
      }
      return -1;
    }
    // The kill banner's label (the core keeps 16 characters).
    function howLabel(b, at, foe) {
      const p = b.path, m = Math.round(Math.hypot(foe.x - p.x0, foe.y - p.y0) / 10);
      if (at > p.l1 && p.n === 3) return `RICOCHET · ${m} M`;
      if (m < 22) return 'POINT BLANK';
      if (!b.focus && m > 60) return `HIP SHOT · ${m} M`;
      return m > 95 ? `LONG RAIL ${m} M` : `${m} M`;
    }
    function stepBullets(dt) {
      // Alternate the order from frame to frame: two rails that land on the same frame must
      // not always favour the same sniper.
      const n = S.bullets.length, flip = (frame++ & 1) === 1;
      for (let j = 0; j < n; j++) {
        const b = S.bullets[flip ? n - 1 - j : j], p = b.path;
        b.age += dt;
        if (b.done) {
          if (!(b.kill && ctx.phase === 'over')) b.fade += dt; // the decisive rail hangs in the air
          continue;
        }
        const s0 = b.s;
        let s1 = Math.min(b.total, s0 + RAIL_SPEED * dt);
        if (b.judge) {
          const at = strike(b, s0, s1);
          if (at >= 0) {
            s1 = b.total = at;
            b.stopped = true;
            if (struck === P[1 - b.owner]) ctx.kill(struck.i, { how: howLabel(b, at, struck) });
            else {
              popDecoy(struck);
              if (online) ctx.net.send({ k: 'pop', id: struck.id });
              if (b.owner === ctx.me) { S.note.x = struck.x; S.note.y = struck.y; S.note.t = S.t; } // fooled: say so
            }
          }
        }
        if (!b.bounced && p.n === 3 && s1 >= p.l1 && b.total > p.l1) {
          b.bounced = true;
          fx.flash(p.x1, p.y1, b.owner, 90, 0.25);
          fx.sparks(p.x1, p.y1, p.n1x, p.n1y, b.owner, 12, 380);
          fx.scar(p.x1, p.y1, p.n1x, p.n1y, b.owner);
          sound.ricochet(p.x1);
        }
        b.s = s1;
        if (s1 >= b.total) {
          b.done = true;
          if (!b.stopped) {
            const ex = p.n === 3 ? p.x2 : p.x1, ey = p.n === 3 ? p.y2 : p.y1;
            const nx = p.n === 3 ? p.n2x : p.n1x, ny = p.n === 3 ? p.n2y : p.n1y;
            fx.flash(ex, ey, b.owner, 70, 0.3);
            fx.sparks(ex, ey, nx, ny, b.owner, 10, 300);
            fx.scar(ex, ey, nx, ny, b.owner);
            sound.impact(ex);
            if (Math.abs(ex - world.drone.x) < 22 && Math.abs(ey - world.drone.y) < 22) S.droneHit = 1.2; // it takes it personally
            const me = P[ctx.me];
            if (b.owner !== ctx.me && me.alive && beamDist(p, me) < 60) { sound.whizz(); S.shake.add(0.35); } // that was close
          }
        }
      }
      for (let i = S.bullets.length - 1; i >= 0; i--) if (S.bullets[i].fade > BEAM_FADE) S.bullets.splice(i, 1);
    }
    // ---- what the local player can see ----
    function canSee(m, o) {
      if (solids.los(m.x, m.y, o.x, o.y)) return true;
      const dx = o.x - m.x, dy = o.y - m.y, d = Math.hypot(dx, dy) || 1;
      const sx = (-dy / d) * R * 0.85, sy = (dx / d) * R * 0.85; // either shoulder will do
      return solids.los(m.x, m.y, o.x + sx, o.y + sy) || solids.los(m.x, m.y, o.x - sx, o.y - sy);
    }
    // A rail lights whatever it passes: a near miss in the dark shows you what you missed.
    function beamLit(o) {
      for (let i = 0; i < S.bullets.length; i++) {
        const b = S.bullets[i], p = b.path;
        if (b.age > 0.3) continue;
        if (pointSeg(o.x, o.y, p.x0, p.y0, p.x1, p.y1) < 95) return true;
        if (p.n === 3 && b.s > p.l1 && pointSeg(o.x, o.y, p.x1, p.y1, p.x2, p.y2) < 95) return true;
      }
      return false;
    }
    function beamDist(l, o) {
      const d = pointSeg(o.x, o.y, l.x0, l.y0, l.x1, l.y1);
      return l.n === 3 ? Math.min(d, pointSeg(o.x, o.y, l.x1, l.y1, l.x2, l.y2)) : d;
    }
    function sight(dt) {
      const me = P[ctx.me], foe = P[1 - ctx.me];
      const lifted = ctx.phase !== 'live' || ctx.sudden;
      S.dark = damp(S.dark, lifted ? 0 : 1, lifted ? (ctx.phase === 'over' ? 12 : 2.4) : 4, dt);
      const open = lifted || S.pulse.flash > 0.3;
      const see = foe.alive && (open || canSee(me, foe) || beamLit(foe));
      S.vis = damp(S.vis, see ? 1 : 0, see ? 24 : 8, dt);
      if (S.seeing && !see && foe.alive) {
        const gh = S.ghost;
        gh.on = true; gh.x = foe.x; gh.y = foe.y; gh.a = foe.a; gh.t = S.t;
      }
      if (see || lifted) S.ghost.on = false;
      S.seeing = see;
      let paint = foe.alive && foe.laserOn && beamDist(foe.laser, me) < 32;
      for (let i = 0; i < S.decoys.length; i++) {
        const d = S.decoys[i];
        if (d.owner === ctx.me) continue;
        const sd = d.alive && (open || canSee(me, d) || beamLit(d));
        d.vis = damp(d.vis, sd ? 1 : 0, sd ? 24 : 8, dt);
        if (d.alive && d.laserOn && beamDist(d.laser, me) < 32) paint = true;
      }
      S.painted = damp(S.painted, paint && me.alive && ctx.phase === 'live' ? 1 : 0, 10, dt);
      paintT -= dt;
      if (S.painted > 0.5 && paintT <= 0) { paintT = 0.26; sound.painted(); }
      S.lock = me.laserOn && foe.alive && S.vis > 0.5 && beamDist(me.laser, foe) < R;
    }

    // ---- camera: a flourish before the round, a push-in on the kill ----
    function camera(dt) {
      const c = S.cam;
      let tx = W / 2, ty = H / 2, tz = 1, roll = 0, rate = 5;
      if (ctx.phase === 'intro' && S.introT >= 0) {
        const u = S.introT, me = P[ctx.me], foe = P[1 - ctx.me];
        // Lean the close-ups toward the middle so the frame is arena, not void.
        const ax = lerp(me.x, MID.x, 0.22), bx = lerp(foe.x, MID.x, 0.22);
        if (u < 0.7) { const k = ease.inOutCubic(u / 0.7); tz = lerp(1, 1.7, k); tx = lerp(W / 2, ax, k); ty = lerp(H / 2, me.y, k); }
        else if (u < 2.0) { const k = ease.inOutCubic((u - 0.7) / 1.3); tz = 1.7; tx = lerp(ax, bx, k); ty = lerp(me.y, foe.y, k); }
        else if (u < 3.2) { const k = ease.inOutCubic((u - 2.0) / 1.2); tz = lerp(1.7, 1, k); tx = lerp(bx, W / 2, k); ty = lerp(foe.y, H / 2, k); }
        c.x = tx; c.y = ty; c.z = tz; c.roll = 0;
        return;
      }
      if (S.kill) {
        // Push in on the victim, as far as still tells the whole story: the shooter stays
        // in the picture, the victim stays out from under the core's kill banner (a fifth
        // of the way down the screen), and the frame never fills with void.
        const kl = S.kill, w = P[kl.winner], f = view.frame;
        const sw = ctx.width, sh = ctx.height, top = sh * 0.19 + KILL_TOP;
        const dx = Math.abs(w.x - kl.x), below = w.y - kl.y;
        const roomY = below >= 0 ? sh - KILL_PAD - top : sh - KILL_ROOM - KILL_PAD - 12;
        tz = clamp(Math.min((sw - KILL_ROOM - KILL_PAD) / (dx || 1), roomY / (Math.abs(below) || 1)) / f.s, 1, 1.32);
        const k = f.s * tz, hw = Math.min(W / 2, sw / (2 * k)), hh = H / (2 * tz);
        tx = clamp(lerp(W / 2, kl.x, 0.6), hw, W - hw);
        ty = clamp(lerp(H / 2, kl.y, 0.6), hh, H - hh);
        // Where the camera may sit for the victim (v*) and for the shooter (w*) to be in frame.
        const vx = (sw / 2 - KILL_ROOM) / k, wx = (sw / 2 - KILL_PAD) / k;
        const vLo = kl.y - (sh - KILL_ROOM - f.cy) / k, vHi = kl.y - (top - f.cy) / k;
        const wLo = w.y - (sh - KILL_PAD - f.cy) / k, wHi = w.y - (KILL_PAD + 12 - f.cy) / k;
        const lox = Math.max(kl.x - vx, w.x - wx), hix = Math.min(kl.x + vx, w.x + wx);
        const loy = Math.max(vLo, wLo), hiy = Math.min(vHi, wHi);
        // Cannot have both: the victim wins.
        tx = lox <= hix ? clamp(tx, lox, hix) : clamp(tx, kl.x - vx, kl.x + vx);
        ty = loy <= hiy ? clamp(ty, loy, hiy) : clamp(ty, vLo, vHi);
        roll = kl.x < W / 2 ? -0.016 : 0.016;
        rate = 6.5; // dt is already slowed by the core here
      }
      c.x = damp(c.x, tx, rate, dt);
      c.y = damp(c.y, ty, rate, dt);
      c.z = damp(c.z, tz, rate, dt);
      c.roll = damp(c.roll, roll, rate, dt);
    }

    // The winner's shot as the victim's client saw it never judged anything: end it on the body.
    function clipBeam(b, v) {
      const p = b.path;
      let best = Infinity, at = b.total;
      const legs = p.n === 3 ? 2 : 1;
      for (let k = 0; k < legs; k++) {
        const ax = k ? p.x1 : p.x0, ay = k ? p.y1 : p.y0, bx = k ? p.x2 : p.x1, by = k ? p.y2 : p.y1, len = k ? p.l2 : p.l1;
        const ex = bx - ax, ey = by - ay;
        const t = clamp(((v.x - ax) * ex + (v.y - ay) * ey) / (ex * ex + ey * ey || 1), 0, 1);
        const d = Math.hypot(v.x - ax - ex * t, v.y - ay - ey * t);
        if (d < best) { best = d; at = (k ? p.l1 : 0) + t * len; }
      }
      if (best < R * 3) { b.total = at; b.s = Math.min(b.s, at); b.stopped = true; if (b.s >= at) b.done = true; }
    }

    function setMusic(kind) {
      if (music === kind) return;
      music = kind;
      sound.music(kind);
    }

    return {
      update(dt) {
        S.t += dt;
        view.fit();
        const live = ctx.phase === 'live', time = ctx.time;
        if (ctx.phase === 'intro' && S.introT >= 0) S.introT += dt;
        if (live) S.liveT += dt;
        if (live && !hinted && S.liveT > 0.8) {
          hinted = true; // once the countdown has cleared: the two things nobody guesses on their own
          ctx.hud.message('LIGHTS OUT', ctx.input.device === 'touch' ? 'Running lights the floor · FOCUS steadies the rail' : 'Running lights the floor · hold FOCUS to steady the rail', 3.2);
        }
        world.sync(time);

        // The four-bar pulse: counted in on the rim, then everyone is shown for a heartbeat.
        const pu = S.pulse;
        if (live && !ctx.sudden) {
          const n = Math.floor(time / PULSE_EVERY), since = time - n * PULSE_EVERY;
          pu.flash = n >= 1 ? Math.exp(-since * 3) : 0;
          pu.age = since;
          pu.soon = clamp((since - (PULSE_EVERY - 4 * BEAT)) / (4 * BEAT), 0, 1);
          const beat = pu.soon > 0 ? Math.floor(pu.soon * 4) : -1;
          if (beat !== countN) { countN = beat; if (beat >= 0) sound.count(beat); }
          if (n > pulseN) {
            pulseN = n;
            sound.pulse();
            S.shake.add(0.25);
            tell(0, P[1].x, P[1].y, 1);
            tell(1, P[0].x, P[0].y, 1);
          }
        } else {
          pu.flash = damp(pu.flash, 0, 6, dt);
          pu.soon = 0;
        }
        if (ctx.sudden && !wasSudden) {
          wasSudden = true;
          sound.sudden();
          setMusic('hot');
        }

        // Both snipers decide on the same snapshot of the world before either one moves:
        // otherwise whoever is stepped second is always a frame fresher.
        for (const p of P) if (!p.remote) cmds[p.i] = p.bot ? p.bot.think(dt) : humanCmd(p);
        for (const p of P) {
          if (p.remote) puppet(p, dt);
          else step(p, cmds[p.i], dt);
          p.laserOn = p.alive && p.focus;
          if (p.laserOn) world.trace(p.x, p.y, p.a, p.laser);
        }
        stepDecoys(dt);
        stepBullets(dt);
        sight(dt);

        fx.update(dt);
        S.watch.jolt = Math.max(0, S.watch.jolt - dt * 2.5);
        S.droneHit = Math.max(0, S.droneHit - dt);
        if (S.kill) S.kill.t += dt;
        camera(dt);

        const me = P[ctx.me];
        if (online) ctx.net.sendState({ x: r1(me.x), y: r1(me.y), a: +me.a.toFixed(3), f: me.focus ? 1 : 0 });
        ctx.hud.cooldown('fire', me.reload / RELOAD);
        ctx.hud.cooldown('a1', me.blinkCd / BLINK_CD);
        ctx.hud.cooldown('a2', me.decoyCd / DECOY_CD);
      },

      render() {
        view.render();
      },

      onPhase(phase) {
        if (phase === 'intro') S.introT = 0;
        else if (phase === 'live') {
          sound.lightsOut();
          setMusic('cool');
        } else if (phase === 'over') {
          sound.stop();
          const res = ctx.result;
          if (!res || res.victim < 0 || res.winner < 0) return;
          const v = P[res.victim], w = P[res.winner];
          v.alive = false;
          v.laserOn = false;
          // Every hologram goes out with the round: nothing sniper-shaped is left standing
          // to muddle who shot whom.
          for (const d of S.decoys) popDecoy(d);
          let beam = null;
          for (const b of S.bullets) if (b.owner === w.i) beam = b; // the latest one
          let dx = v.x - w.x, dy = v.y - w.y;
          if (beam) {
            beam.kill = true;
            if (!beam.judge) clipBeam(beam, v);
            const p = beam.path, late = p.n === 3 && beam.total > p.l1;
            dx = late ? p.x2 - p.x1 : p.x1 - p.x0;
            dy = late ? p.y2 - p.y1 : p.y1 - p.y0;
          }
          const dl = Math.hypot(dx, dy) || 1;
          dx /= dl; dy /= dl;
          S.kill = { x: v.x, y: v.y, a: v.a, victim: v.i, winner: w.i, t: 0, dx, dy, cracks: fx.shatter(v, dx, dy) };
          S.watch.x = v.x; S.watch.y = v.y; S.watch.jolt = 1;
          sound.kill(v.x);
        }
      },

      onNet(msg) {
        if (!msg) return;
        const them = 1 - ctx.me;
        if (msg.k === 'shot') {
          const p = mkPath();
          p.n = msg.n === 3 ? 3 : 2;
          p.x0 = msg.x0; p.y0 = msg.y0; p.x1 = msg.x1; p.y1 = msg.y1;
          p.x2 = p.n === 3 ? msg.x2 : msg.x1;
          p.y2 = p.n === 3 ? msg.y2 : msg.y1;
          p.l1 = Math.hypot(p.x1 - p.x0, p.y1 - p.y0);
          p.l2 = Math.hypot(p.x2 - p.x1, p.y2 - p.y1);
          // Sparks need normals; rebuild them from the way the rail turned.
          const ix = (p.x1 - p.x0) / (p.l1 || 1), iy = (p.y1 - p.y0) / (p.l1 || 1);
          const ox = (p.x2 - p.x1) / (p.l2 || 1), oy = (p.y2 - p.y1) / (p.l2 || 1);
          const nl = Math.hypot(ox - ix, oy - iy);
          if (p.n === 3 && nl > 1e-3) { p.n1x = (ox - ix) / nl; p.n1y = (oy - iy) / nl; p.n2x = -ox; p.n2y = -oy; }
          else { p.n1x = -ix; p.n1y = -iy; }
          if ([p.x0, p.y0, p.l1, p.l2].every(Number.isFinite)) launch(them, p, false);
        } else if (msg.k === 'blink') {
          if ([msg.x0, msg.y0, msg.x1, msg.y1].every(Number.isFinite)) blinkFx(them, msg.x0, msg.y0, msg.x1, msg.y1, +msg.a || 0);
        } else if (msg.k === 'decoy') {
          if ([msg.x, msg.y, msg.a, msg.t].every(Number.isFinite) && S.decoys.length < 4) spawnDecoy(them, msg.id, msg.x, msg.y, msg.a, msg.t);
        } else if (msg.k === 'pop') {
          for (const d of S.decoys) if (d.id === msg.id) popDecoy(d);
        }
      },

      focus() {
        const o = S.kill || P[1 - ctx.me];
        view.fit();
        view.toScreen(o.x, o.y, scr);
        return { x: scr.x, y: scr.y };
      },

      /** For tests and tuning only: the live simulation state. */
      debug: () => S,

      dispose() {
        S.bullets.length = 0;
        S.decoys.length = 0;
        S.parts.clear();
        view.dispose();
      },
    };
  },
};
