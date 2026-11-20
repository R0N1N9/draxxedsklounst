// TTY DUEL — the whole game rendered as text on a phosphor CRT.
//
// FANTASY   Two '@' in a roguelike facility of box-drawing corridors. Fog of war: you see only
//           what you have a line to, and an enemy who stands still beyond 24 columns is not seen
//           at all. Everything that gives you away is light: a shot lights its whole ray, a ping
//           lights you up, running is noise. Patience wins: be the one who is not found.
// RULES     One bolt-action round, 1.5 s to cycle. Rounds fly at 100 units/s (lead a runner) and
//           bounce off walls ONCE. The barrel wobbles: the line you see is where the round goes,
//           so time the click. A hit kills; nothing else does.
// CONTROLS  move (WASD / stick) · aim (mouse / right stick) · fire
//           alt  BREATH  hold: the wobble settles, a long rangefinder line (bounce included) is
//                         drawn, you creep at a third of the speed and the line is visible to
//                         whoever can see its cells. Breath lasts 2.6 s, then you gasp.
//           a1   PING    a sonar sweep: you see the enemy for 2 s ... and they see YOU (home dimension's UAV).
//           a2   FORK    spawns a decoy '@' that walks off along your aim (the home dimension's decoy).
// WORLD     Four blast doors slam shut on a clock (warning '!' first), two garbage-collector
//           sweepers trundle the lanes as moving cover, bits flicker in the dark. All from ctx.time.
// BOT       Believes only what a player could know. Opens to a vantage with sight lines, holds and
//           peeks, scopes long shots with lead, pings when blind, forks when pushed, breaks line of
//           sight to cycle the bolt, sidesteps rounds that are coming. Reaction, aim error and nerve scale with skill.
// KILL      The victim's '@' tears into characters and settles as 'x', the picture tears,
//           SEGMENTATION FAULT (core dumped) types itself across the glass.
// SUDDEN    The fog lifts, both snipers wear a beacon, `rm -rf` deletes cover in waves and the
//           border closes in on a small box.
import { clamp, damp, lerp, ease, segCircle, Shake } from '../../kit.js';
import { W, H, COLS, ROWS, R_BODY, SEE_R, mkPath, buildWorld } from './world.js';
import { makePalette } from './look.js';
import { makeTerm } from './term.js';
import { makeView, BULLET_SPEED, LINGER, PING_SPEED, PING_LIFE } from './draw.js';
import { makeParts, rayCells } from './fx.js';
import { makeSound } from './sound.js';
import { makeBot } from './bot.js';

const SPEED = 11.5, HOLD_SPEED = 4.3, RELOAD = 1.5, PING_CD = 11, FORK_CD = 14;
// Hip fire wanders enough that a close duel is a matter of timing the click, not of who clicks first: steadying costs speed.
const BREATH_T = 2.6, BREATH_REGEN = 3.2, HIP = 0.075, RUN_SWAY = 0.05, SCOPE = 0.005;
const R_HIT = 1.05, ROUND_TIME = 40, SHRINK_T = 22;
const DECOY_SPEED = 8.5, DECOY_LIFE = 7;
const DIRS = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'];
const compass = (dx, dy) => DIRS[((Math.round((Math.atan2(-dy, dx) / (Math.PI / 4))) % 8) + 8) % 8];
const wobble = (ph) => 0.62 * Math.sin(ph) + 0.38 * Math.sin(ph * 2.37 + 1.3);
const IDLE = ['cron: job 4 done', 'cpu0: 71C', 'gc: sweeping lane', 'swap: 3% used', 'sshd: 2 failed logins', 'fsck: / clean', 'ntp: drift +0.002s', 'daemon[417]: restarted'];
const r2 = (v) => Math.round(v * 100) / 100;

export default {
  id: 'terminal',
  name: 'TTY DUEL',
  tagline: 'Everything is text. Somebody is typing your name.',
  perspective: 'TOP-DOWN TEXT',
  renderer: '2d',
  aim: 'pointer',
  palette: { bg: '#010b04', fg: '#c9ffd6', accent: '#58ff72' },
  controls: { move: 'MOVE', aim: 'AIM', fire: 'FIRE', alt: 'STEADY', a1: 'PING', a2: 'DECOY' },
  hint: 'You are the @ in brackets. Find the other @ in the dark and shoot first.',
  altToggle: true,
  roundTime: ROUND_TIME,
  angleFields: ['a'],

  create(ctx) {
    const amber = (ctx.seed & 1) === 1;
    const pal = makePalette(amber, ctx.players[0].color, ctx.players[1].color);
    const world = buildWorld(ctx.rng);
    const online = ctx.opponent === 'remote';
    const me = ctx.me;
    const sound = makeSound(ctx, amber);
    const term = makeTerm(pal);
    term.tickCb = sound.tick;

    const P = [0, 1].map((i) => ({
      i, x: world.spawns[i].x, y: world.spawns[i].y, vx: 0, vy: 0, aim: i ? Math.PI : 0, a: i ? Math.PI : 0,
      sway: HIP, swPh: Math.random() * 9, alive: true, hold: false, lock: false, breath: 1, winded: 0, reload: 0, pingCd: 0, forkCd: 0,
      recoil: 0, flash: 0, moving: false, stepT: 0, decoyN: 0, aimPath: mkPath(),
      remote: online && i !== me, bot: null,
    }));

    const S = {
      t: 0, liveT: 0, P, RELOAD, bullets: [], decoys: [], pings: [], parts: makeParts(260),
      reveal: [0, 0],
      know: [0, 1].map(() => ({ x: 0, y: 0, vx: 0, vy: 0, t: -99, seenT: 0, vis: false, kind: '' })),
      seen: { a: 0, mode: 'none' }, ghost: { on: false, x: 0, y: 0, t: 0 },
      vis: new Uint8Array(COLS * ROWS), fog: 0, kill: null, intro: true, introT: 0,
      cam: { x: W / 2, y: H / 2, z: 1 }, shake: new Shake(9, 0.02), glitch: 0, pingFlash: 0,
      world, ctx, fired: false,
    };
    const view = makeView(ctx, world, S, pal, term);
    for (const p of P) if (!p.remote && (p.i !== me || ctx.autopilot)) p.bot = makeBot(ctx, world, S, p);
    const viewers = online ? [me] : [0, 1];
    const human = { mx: 0, my: 0, a: 0, fire: false, alt: false, a1: false, a2: false };
    const cmds = [null, null], ptr = { x: 0, y: 0 };
    let helped = false, wasSudden = false, decayWave = 0, hearT = [0, 0], doorShut = [false, false, false, false], wasLive = false, glitchT = 8 + Math.random() * 6, idleT = 12;
    const heard = (v) => v === me;

    // ---- commands ----
    function humanCmd(p) {
      const inp = ctx.input;
      let a = p.aim;
      if (inp.device === 'kbm') { view.pointerUnits(ptr); a = Math.atan2(ptr.y - p.y, ptr.x - p.x); } else a = inp.aimAngle(0, 0, p.aim);
      human.mx = inp.moveX; human.my = inp.moveY; human.a = a;
      human.fire = inp.firePressed; human.alt = inp.alt; human.a1 = inp.a1Pressed; human.a2 = inp.a2Pressed;
      return human;
    }

    // ---- a locally simulated sniper ----
    function step(p, cmd, dt) {
      const live = ctx.phase === 'live' && p.alive;
      p.aim = cmd.a;
      p.swPh += dt * 3.1;
      p.recoil = Math.max(0, p.recoil - dt * 5);
      p.flash = Math.max(0, p.flash - dt);
      const spd = Math.hypot(p.vx, p.vy);
      if (!live) { p.vx = damp(p.vx, 0, 12, dt); p.vy = damp(p.vy, 0, 12, dt); p.hold = false; p.a = p.aim + p.sway * wobble(p.swPh); p.moving = false; return; }
      p.reload = Math.max(0, p.reload - dt);
      p.pingCd = Math.max(0, p.pingCd - dt);
      p.forkCd = Math.max(0, p.forkCd - dt);
      // breath
      p.winded = Math.max(0, p.winded - dt);
      if (!cmd.alt) p.lock = false;
      const want = cmd.alt && !p.lock && p.winded <= 0 && p.breath > 0.01; // after a gasp the control must be let go (or tapped off) first
      if (want && !p.hold && p.i === me) sound.inhale();
      if (!want && p.hold && p.i === me) sound.exhale();
      p.hold = want;
      if (p.hold) {
        p.breath -= dt / BREATH_T;
        if (p.breath <= 0) { p.breath = 0; p.hold = false; p.lock = true; p.winded = 1.1; if (p.i === me) { sound.gasp(); term.say('out of breath', 'warn'); } }
      } else p.breath = Math.min(1, p.breath + dt / BREATH_REGEN * (p.winded > 0 ? 0.3 : 1));
      const sw = p.hold ? SCOPE : HIP + RUN_SWAY * Math.min(1, spd / SPEED);
      p.sway = damp(p.sway, sw, p.hold ? 5 : 9, dt);
      p.a = p.aim + p.sway * wobble(p.swPh);
      // movement
      let mx = cmd.mx, my = cmd.my;
      const ml = Math.hypot(mx, my);
      if (ml > 1) { mx /= ml; my /= ml; }
      const top = p.hold ? HOLD_SPEED : SPEED;
      p.vx = damp(p.vx, mx * top, 14, dt);
      p.vy = damp(p.vy, my * top, 14, dt);
      p.x += p.vx * dt; p.y += p.vy * dt;
      world.push(p, R_BODY);
      p.moving = spd > 2.4;
      if (p.moving) { p.stepT -= dt; if (p.stepT <= 0) { p.stepT = 0.28; } }
      if (cmd.fire) {
        if (p.reload <= 0) fire(p);
        else if (p.i === me) { sound.deny(); }
      }
      if (cmd.a1 && p.pingCd <= 0) ping(p);
      if (cmd.a2 && p.forkCd <= 0) fork(p);
    }

    // The remote sniper: copy the interpolated state; work out the rest from how it moves.
    function puppet(p, dt) {
      const r = ctx.net.remote;
      p.recoil = Math.max(0, p.recoil - dt * 5);
      p.flash = Math.max(0, p.flash - dt);
      if (!r || !p.alive || !Number.isFinite(r.x) || !Number.isFinite(r.y)) return;
      const dx = r.x - p.x, dy = r.y - p.y;
      if (dt > 0 && Math.hypot(dx, dy) < 12) { p.vx = damp(p.vx, dx / dt, 10, dt); p.vy = damp(p.vy, dy / dt, 10, dt); }
      p.x = r.x; p.y = r.y;
      if (Number.isFinite(r.a)) p.a = p.aim = r.a;
      p.hold = !!r.f && ctx.phase === 'live';
      p.moving = Math.hypot(p.vx, p.vy) > 2.4 && ctx.phase === 'live';
    }

    // ---- the rifle ----
    function fire(p) {
      const path = world.trace(p.x, p.y, p.a, mkPath());
      launch(p.i, path, !online || p.i === me);
      p.reload = RELOAD;
      p.sway = Math.min(0.12, p.sway + 0.03);
      if (p.i === me) { S.fired = true; term.run(`./rifle --fire ${Math.round(((p.a * 180) / Math.PI + 360) % 360)}`); }
      if (online && p.i === me) ctx.net.send({ k: 'shot', x: r2(p.x), y: r2(p.y), a: +p.a.toFixed(4) });
    }
    function launch(owner, path, judge) {
      const p = P[owner];
      const b = { owner, path, judge, s: 0, total: path.l1 + (path.bounce ? path.l2 : 0), age: 0, done: false, kill: false, stopped: false, bounced: false, cells: rayCells(path), hold: p.hold, lastDist: 99 };
      S.bullets.push(b);
      if (S.bullets.length > 12) S.bullets.shift();
      p.recoil = 1;
      p.flash = 0.9;
      const ux = Math.cos(Math.atan2(path.y1 - path.y0, path.x1 - path.x0)), uy = Math.sin(Math.atan2(path.y1 - path.y0, path.x1 - path.x0));
      S.parts.sparks(path.x0 + ux * 2.4, path.y0 + uy * 2.4, ux, uy, '#ffffff', 7, 60);
      S.shake.add(owner === me ? 0.42 : 0.18);
      S.glitch = Math.max(S.glitch, owner === me ? 0.28 : 0.12);
      sound.shot(p.x, owner === me);
      for (const v of viewers) if (v !== owner) S.reveal[v] = Math.max(S.reveal[v], 0.8); // a muzzle flash shows who fired
      if (owner !== me) {
        const d = Math.hypot(p.x - P[me].x, p.y - P[me].y);
        term.say(`hostile discharge: bearing ${compass(p.x - P[me].x, p.y - P[me].y)} · ${Math.round(d)} cols`, 'foe');
      }
    }

    // ---- ping: the home dimension's UAV, as a sonar sweep that works both ways ----
    function ping(p) {
      p.pingCd = PING_CD;
      spawnPing(p.i, p.x, p.y);
      if (p.i === me) term.run('ping -s *');
      if (online && p.i === me) ctx.net.send({ k: 'ping', x: r2(p.x), y: r2(p.y) });
    }
    function spawnPing(owner, x, y) {
      S.pings.push({ owner, x, y, t0: S.t, rot: Math.random() * 6, got: [false, false] });
      if (S.pings.length > 4) S.pings.shift();
      S.pingFlash = 1;
      sound.ping(x);
      if (owner === me) term.say('ping: sweeping...', 'me');
      else term.say('sonar pulse detected', 'warn');
    }
    function stepPings(dt) {
      S.pingFlash = Math.max(0, S.pingFlash - dt * 2.4);
      for (let i = S.pings.length - 1; i >= 0; i--) {
        const pg = S.pings[i], r = (S.t - pg.t0) * PING_SPEED;
        if (r > 135) { S.pings.splice(i, 1); continue; }
        for (const v of viewers) {
          if (pg.got[v]) continue;
          const tgt = v === pg.owner ? P[1 - v] : P[v];
          if (!tgt.alive) continue;
          const d = Math.hypot(tgt.x - pg.x, tgt.y - pg.y);
          if (r < d) continue;
          pg.got[v] = true;
          S.reveal[v] = PING_LIFE;
          if (v === me) {
            if (v === pg.owner) { term.say(`contact: ${Math.round(d)} cols ${compass(tgt.x - pg.x, tgt.y - pg.y)}`, 'me'); sound.contact(); } else { term.say('you were pinged: position exposed', 'warn'); sound.pinged(); S.shake.add(0.2); }
          }
        }
      }
    }

    // ---- fork: a decoy, spawned on both clients from one event, then a pure function of the clock ----
    function fork(p) {
      p.forkCd = FORK_CD;
      const id = p.i * 1000 + ++p.decoyN, dir = p.aim, t0 = ctx.time;
      spawnDecoy(p.i, id, p.x, p.y, dir, t0);
      if (p.i === me) term.run('fork()');
      if (online && p.i === me) ctx.net.send({ k: 'fork', id, x: r2(p.x), y: r2(p.y), a: +dir.toFixed(3), t: +t0.toFixed(2) });
    }
    function spawnDecoy(owner, id, x, y, dir, t0) {
      for (const d of S.decoys) if (d.owner === owner && d.alive) popDecoy(d, true);
      const dx = Math.cos(dir), dy = Math.sin(dir);
      const h = world.ray(x, y, dx, dy, 70);
      const maxD = Math.max(0, (h ? h.dist : 70) - 1.5);
      S.decoys.push({ i: owner, owner, id, pid: 4000 + (id * 37) % 5000, x, y, ox: x, oy: y, dx, dy, a: dir, aim: dir, t0, maxD, alive: true, vis: 0, blip: false, moving: true, recoil: 0, hold: false, decoy: true, aimPath: mkPath(), fade: 0 });
      sound.fork(x);
      if (owner === me) term.say(`fork(): pid ${4000 + (id * 37) % 5000} running`, 'me');
    }
    function popDecoy(d, quiet) {
      if (!d.alive) return;
      d.alive = false;
      S.parts.debris(d.x, d.y, ctx.players[d.owner].color, 14);
      if (!quiet) { sound.pop(d.x); S.glitch = Math.max(S.glitch, 0.25); }
    }
    function stepDecoys(dt) {
      for (let i = S.decoys.length - 1; i >= 0; i--) {
        const d = S.decoys[i];
        if (!d.alive) { S.decoys.splice(i, 1); continue; }
        if (ctx.phase === 'intro') continue;
        const age = ctx.time - d.t0, dist = Math.min(DECOY_SPEED * Math.max(0, age), d.maxD);
        d.x = d.ox + d.dx * dist; d.y = d.oy + d.dy * dist;
        d.moving = dist < d.maxD - 0.01;
        if (age > DECOY_LIFE || ctx.phase === 'over') { if (age > DECOY_LIFE && d.owner === me) term.say(`kill -9 ${d.pid}: fork() ended`, 'sys'); popDecoy(d); }
      }
    }

    // ---- bullets ----
    let struck = null;
    function strikeLeg(b, ax, ay, bx, by, base, len) {
      let best = -1;
      const foe = P[1 - b.owner];
      if (foe.alive && ctx.phase === 'live') {
        const t = segCircle(ax, ay, bx, by, foe.x, foe.y, R_HIT);
        if (t >= 0) { best = base + t * len; struck = foe; }
      }
      for (const d of S.decoys) {
        if (!d.alive || d.owner === b.owner) continue;
        const t = segCircle(ax, ay, bx, by, d.x, d.y, R_HIT);
        if (t >= 0 && (best < 0 || base + t * len < best)) { best = base + t * len; struck = d; }
      }
      return best;
    }
    function strike(b, s0, s1) {
      const p = b.path;
      struck = null;
      if (s0 < p.l1) {
        const k0 = s0 / p.l1, k1 = Math.min(s1, p.l1) / p.l1;
        const at = strikeLeg(b, lerp(p.x0, p.x1, k0), lerp(p.y0, p.y1, k0), lerp(p.x0, p.x1, k1), lerp(p.y0, p.y1, k1), s0, (k1 - k0) * p.l1);
        if (at >= 0) return at;
      }
      if (p.bounce && s1 > p.l1 && p.l2 > 0) {
        const k0 = Math.max(0, s0 - p.l1) / p.l2, k1 = (s1 - p.l1) / p.l2;
        return strikeLeg(b, lerp(p.x1, p.x2, k0), lerp(p.y1, p.y2, k0), lerp(p.x1, p.x2, k1), lerp(p.y1, p.y2, k1), p.l1 + k0 * p.l2, (k1 - k0) * p.l2);
      }
      return -1;
    }
    function howLabel(b, at, foe) {
      const p = b.path, m = Math.round(Math.hypot(foe.x - p.x0, foe.y - p.y0));
      if (p.bounce && at > p.l1) return `RICOCHET ${m}`;
      if (m < 14) return 'POINT BLANK';
      if (b.hold && m > 40) return `SCOPED ${m}`;
      return m > 60 ? `LONG SHOT ${m}` : `${m} COLS`;
    }
    function impact(x, y, nx, ny, owner, end) {
      S.parts.sparks(x, y, nx, ny, '#ffffff', end ? 10 : 7, 52);
      S.parts.sparks(x, y, nx, ny, ctx.players[owner].color, 5, 34);
      sound[end ? 'impact' : 'ricochet'](x);
      S.glitch = Math.max(S.glitch, 0.06);
    }
    // Two rounds can land in one frame (a trade). The one fired first wins; an exact tie alternates by
    // round, so neither seat is favoured by the order the snipers happen to be processed in.
    let verdict = null;
    function stepBullets(dt) {
      verdict = null;
      for (let j = S.bullets.length - 1; j >= 0; j--) {
        const b = S.bullets[j], p = b.path;
        if (!(b.kill && ctx.phase === 'over')) b.age += dt;
        if (b.done) { if (b.age - b.total / BULLET_SPEED > LINGER + 0.2) S.bullets.splice(j, 1); continue; }
        const s0 = b.s;
        let s1 = Math.min(b.total, s0 + BULLET_SPEED * dt);
        if (b.judge) {
          const at = strike(b, s0, s1);
          if (at >= 0) {
            s1 = b.total = at;
            b.stopped = true;
            if (struck && !struck.decoy) {
              const first = !verdict || b.age > verdict.b.age + 1e-6 || (Math.abs(b.age - verdict.b.age) <= 1e-6 && ((ctx.round + b.owner) & 1) === 0);
              if (first) { if (verdict) verdict.b.kill = false; verdict = { b, victim: struck.i, how: howLabel(b, at, struck) }; b.kill = true; }
            } else if (struck) {
              popDecoy(struck);
              if (online) ctx.net.send({ k: 'pop', id: struck.id });
              if (b.owner === me) term.say(`hit pid ${struck.pid}: it was a fork()`, 'warn');
            }
          }
        }
        if (!b.bounced && p.bounce && s1 >= p.l1 && b.total > p.l1) {
          b.bounced = true;
          impact(p.x1, p.y1, p.n1x, p.n1y, b.owner, false);
          if (b.owner === me) term.say('ricochet x1', 'me');
        }
        b.s = s1;
        // a round passing close to you is heard, felt and logged
        const m = P[me];
        if (b.owner !== me && m.alive && s0 < s1 && ctx.phase === 'live') {
          const l = Math.min(s1, p.l1), q = (s0 < p.l1) ? segDist(m.x, m.y, p.x0, p.y0, p.x1, p.y1) : 99;
          if (q < 5 && b.lastDist >= 5) { sound.whizz(m.x); S.shake.add(0.3); S.glitch = Math.max(S.glitch, 0.3); term.say(`round passed ${Math.max(1, Math.round(q))} cols away`, 'warn'); }
          b.lastDist = Math.min(b.lastDist, q);
          void l;
        }
        if (s1 >= b.total) {
          b.done = true;
          if (!b.stopped) {
            const ex = p.bounce ? p.x2 : p.x1, ey = p.bounce ? p.y2 : p.y1, nx = p.bounce ? p.n2x : p.n1x, ny = p.bounce ? p.n2y : p.n1y;
            impact(ex, ey, nx, ny, b.owner, true);
            if (b.owner === me) term.say(p.bounce ? (p.hit2 ? 'miss (wall)' : 'miss (range)') : (p.hit1 ? 'miss (wall)' : 'miss (range)'), 'me');
          }
        }
      }
      if (verdict) ctx.kill(verdict.victim, { how: verdict.how });
    }
    const segDist = (px, py, ax, ay, bx, by) => {
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
      const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
      return Math.hypot(px - ax - dx * t, py - ay - dy * t);
    };

    // ---- what each sniper can know about the other ----
    function sees(v) {
      const a = P[v], b = P[1 - v];
      if (!b.alive || !a.alive) return 0;
      if (ctx.sudden) return 2;
      if (S.reveal[v] > 0) return world.sees(a.x, a.y, b.x, b.y) ? 2 : 1; // 1 = a blip, 2 = in plain sight
      if (!world.sees(a.x, a.y, b.x, b.y)) return 0;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      return d <= SEE_R || b.moving || b.flash > 0 ? 2 : 0;
    }
    function senses(dt) {
      for (const v of viewers) {
        S.reveal[v] = Math.max(0, S.reveal[v] - dt);
        const k = S.know[v], foe = P[1 - v], me_ = P[v];
        const s = ctx.phase === 'live' ? sees(v) : 0;
        const sv = ctx.phase === 'live' ? s : foe.alive ? 2 : 0; // what the screen shows: both snipers, before and after the duel
        if (s) {
          k.x = foe.x; k.y = foe.y; k.vx = foe.vx; k.vy = foe.vy; k.t = S.t; k.vis = true; k.seenT = s === 2 ? k.seenT + dt : 0; k.kind = s === 2 ? 'seen' : 'ping';
        } else {
          k.vis = false; k.seenT = 0;
          // footsteps carry: a rough bearing, not a position
          if (foe.alive && foe.moving && ctx.phase === 'live') {
            const d = Math.hypot(foe.x - me_.x, foe.y - me_.y);
            if (d < 40 && S.t > hearT[v]) {
              hearT[v] = S.t + 2.6 + Math.random() * 1.6;
              if (heard(v)) { term.say(`you hear footsteps: ${compass(foe.x - me_.x, foe.y - me_.y)}`, 'sys'); sound.step(foe.x); }
              if (S.t - k.t > 1) { k.x = foe.x + (Math.random() - 0.5) * 16; k.y = foe.y + (Math.random() - 0.5) * 8; k.t = S.t - 0.6; k.kind = 'heard'; }
            }
          }
        }
        if (v === me) {
          const tgt = sv ? 1 : 0;
          const was = S.seen.a > 0.5;
          S.seen.a = damp(S.seen.a, tgt, tgt ? 26 : 8, dt);
          S.seen.mode = sv === 2 ? 'los' : sv === 1 ? 'blip' : S.seen.mode;
          if (s === 2 && !was && ctx.phase === 'live' && S.liveT > 0.5 && S.t - S.ghost.t > 0.4) term.say(`contact: hostile in sight · ${Math.round(Math.hypot(foe.x - me_.x, foe.y - me_.y))} cols`, 'sys');
          if (!sv && was && foe.alive) { S.ghost.on = true; S.ghost.x = foe.x; S.ghost.y = foe.y; S.ghost.t = S.t; }
          if (sv) S.ghost.on = false;
        }
      }
      // decoys: seen by the same rules as the sniper they imitate
      const m = P[me];
      for (const d of S.decoys) {
        if (d.owner === me) continue;
        let see = false;
        if (d.alive && ctx.phase !== 'over') see = ctx.sudden || (world.sees(m.x, m.y, d.x, d.y) && (Math.hypot(m.x - d.x, m.y - d.y) <= SEE_R || d.moving)) || S.reveal[me] > 0;
        d.vis = damp(d.vis, see ? 1 : 0, see ? 26 : 8, dt);
      }
    }

    // ---- sudden death: the walls go, the border closes ----
    function suddenStep() {
      const s = Math.max(0, ctx.time - ROUND_TIME);
      world.setShrink(ease.inOutQuad(clamp(s / SHRINK_T, 0, 1)));
      const wave = s < 0.4 ? 0 : Math.min(4, 1 + Math.floor(s / 4));
      if (wave > decayWave) {
        decayWave = wave;
        world.decayTo(wave);
        view.dirty();
        S.shake.add(0.5);
        S.glitch = 1;
        term.say(`rm -rf /facility/walls  (${wave}/4)`, 'warn');
        sound.doorShut(W / 2);
      }
    }

    // ---- camera: a flourish before the round, a push-in on the kill ----
    function camera(dt) {
      const c = S.cam, m = P[me], f = P[1 - me];
      let tx = W / 2, ty = H / 2, tz = 1, rate = 5;
      if (ctx.phase === 'intro') {
        const u = S.introT;
        const ax = lerp(m.x, W / 2, 0.15), bx = lerp(f.x, W / 2, 0.15);
        if (u < 0.7) { const k = ease.inOutCubic(u / 0.7); tz = lerp(1, 1.75, k); tx = lerp(W / 2, ax, k); ty = lerp(H / 2, m.y, k); } else if (u < 1.9) { const k = ease.inOutCubic((u - 0.7) / 1.2); tz = 1.75; tx = lerp(ax, bx, k); ty = lerp(m.y, f.y, k); } else { const k = ease.inOutCubic(clamp((u - 1.9) / 1.2, 0, 1)); tz = lerp(1.75, 1, k); tx = lerp(bx, W / 2, k); ty = lerp(f.y, H / 2, k); }
        c.x = tx; c.y = ty; c.z = tz;
        return;
      }
      if (S.kill) {
        tx = lerp(W / 2, S.kill.x, 0.78); ty = lerp(H / 2, S.kill.y, 0.78); tz = 1.55; rate = 4;
      }
      c.x = damp(c.x, tx, rate, dt); c.y = damp(c.y, ty, rate, dt); c.z = damp(c.z, tz, rate, dt);
    }

    function helpLines() {
      const t = ctx.input.device === 'touch', pad = ctx.input.device === 'gamepad';
      if (t) {
        term.say('left stick: move · right stick: aim, release to fire', 'sys');
        term.say('STEADY: hold breath, long line · PING · DECOY', 'sys');
      } else if (pad) {
        term.say('stick: move/aim · RT fire · LT steady · LB ping · RB decoy', 'sys');
      } else {
        term.say('wasd: move · mouse: aim · click: fire', 'sys');
        term.say('rmb: steady (long line) · q: ping · e: decoy', 'sys');
      }
    }

    return {
      update(dt) {
        const rdt = ctx.phase === 'over' ? dt / 0.35 : dt;
        S.t += dt;
        view.fit();
        const live = ctx.phase === 'live';
        if (live) S.liveT += dt;
        if (ctx.phase === 'intro') S.introT += dt;
        world.sync(ctx.phase === 'intro' ? 0 : ctx.time);
        if (ctx.sudden && live) suddenStep();

        // doors announce themselves
        for (const d of world.doors) {
          const shut = d.e < 0.05;
          if (shut && !doorShut[d.id]) { doorShut[d.id] = true; if (live) sound.doorShut(d.c0 + 2); }
          if (!shut) doorShut[d.id] = false;
          if (d.warn && live && !d.beeped) {
            d.beeped = true;
            sound.doorWarn();
            if (Math.hypot(d.c0 + 2 - P[me].x, d.r * 2 - P[me].y) < 34) term.say(`door ${d.id + 1}: closing`, 'warn');
          } else if (!d.warn) d.beeped = false;
        }

        for (const p of P) if (!p.remote) cmds[p.i] = p.bot ? p.bot.think(dt) : humanCmd(p);
        for (const p of P) {
          if (p.remote) puppet(p, dt);
          else step(p, cmds[p.i], dt);
        }
        stepPings(dt);
        stepDecoys(dt);
        stepBullets(dt);
        senses(dt);

        // fog: off in the intro, on in the duel, lifted again for sudden death and the kill
        const lifted = ctx.phase !== 'live' || ctx.sudden;
        S.fog = damp(S.fog, lifted ? 0 : 1, lifted ? 5 : 2.2, dt);
        S.intro = ctx.phase === 'intro';
        world.fov(P[me].x, P[me].y, S.vis);
        view.fog(dt);

        S.parts.update(dt);
        S.glitch = Math.max(0, S.glitch - dt * 2.6);
        term.update(rdt);
        if (S.kill) {
          S.kill.t += dt;
          S.kill.typed += rdt * 40;
          if (S.kill.t < 0.9) S.glitch = Math.max(S.glitch, 0.7 * (1 - S.kill.t / 0.9));
        }
        if (live && (idleT -= dt) <= 0) { idleT = 11 + Math.random() * 10; term.say(IDLE[(Math.random() * IDLE.length) | 0], 'sys'); }
        glitchT -= dt;
        if (glitchT <= 0 && live) { glitchT = 7 + Math.random() * 9; S.glitch = Math.max(S.glitch, 0.35); } // the monitor is old
        camera(dt);

        if (live && !wasLive) {
          wasLive = true;
          term.run('./duel --live');
          term.say('boot ok · fog engaged', 'sys');
        }
        if (live && !helped && S.liveT > 0.7) {
          helped = true;
          helpLines();
        }
        if (ctx.sudden && !wasSudden) {
          wasSudden = true;
          sound.sudden();
          sound.music('hot');
          term.say('kernel panic: out of memory', 'warn');
          term.say('fog off · everyone is root', 'warn');
        }

        const m = P[me];
        if (online) ctx.net.sendState({ x: r2(m.x), y: r2(m.y), a: +m.a.toFixed(3), f: m.hold ? 1 : 0 });
        ctx.hud.cooldown('fire', m.reload / RELOAD);
        ctx.hud.cooldown('a1', m.pingCd / PING_CD);
        ctx.hud.cooldown('a2', m.forkCd / FORK_CD);
        ctx.hud.cooldown('alt', m.hold ? 0 : 1 - m.breath);
      },

      render() { view.render(); },

      onPhase(phase) {
        if (phase === 'intro') {
          S.introT = 0;
          term.clear();
          term.say(`boot tty0 ... ok  [${amber ? 'amber' : 'green'} phosphor]`, 'sys');
          term.say(`facility ${(ctx.seed >>> 0).toString(16).slice(0, 6)}: ${COLS}x${ROWS} loaded`, 'sys');
          term.say(`hostile signal: ${P[1 - me].x > W / 2 ? 'east' : 'west'}`, 'warn');
          sound.boot();
        } else if (phase === 'live') {
          sound.music('cool');
        } else if (phase === 'over') {
          sound.stop(0.4);
          const res = ctx.result;
          if (!res || res.victim < 0 || res.winner < 0) return;
          const v = P[res.victim], w = P[res.winner];
          v.alive = false;
          v.hold = false;
          for (const d of S.decoys) popDecoy(d, true);
          // the round that did it, as the victim's screen saw it, ends on the body
          let beam = null;
          for (const b of S.bullets) if (b.owner === w.i) beam = b;
          if (beam) {
            beam.kill = true;
            if (!beam.judge) clipBeam(beam, v);
          }
          S.kill = { x: v.x, y: v.y, victim: v.i, winner: w.i, t: 0, typed: 0, seed: (ctx.seed ^ (Math.imul(v.i + 1, 2654435761))) >>> 0 };
          S.parts.debris(v.x, v.y, ctx.players[v.i].color, 60);
          S.parts.sparks(v.x, v.y, 0, -1, '#ffffff', 14, 70);
          S.shake.add(1);
          S.glitch = 1;
          sound.kill(v.x);
          sound.fault();
          term.say(`SIGSEGV: pid ${v.i ? 4417 : 4416} (${ctx.players[v.i].name})`, v.i === me ? 'foe' : 'me');
          term.say('SEGMENTATION FAULT (core dumped)', 'warn');
        }
      },

      onNet(msg) {
        if (!msg) return;
        const them = 1 - me;
        if (msg.k === 'shot') {
          if (![msg.x, msg.y, msg.a].every(Number.isFinite)) return;
          launch(them, world.trace(msg.x, msg.y, msg.a, mkPath()), false);
        } else if (msg.k === 'ping') {
          if ([msg.x, msg.y].every(Number.isFinite)) spawnPing(them, msg.x, msg.y);
        } else if (msg.k === 'fork') {
          if ([msg.x, msg.y, msg.a, msg.t].every(Number.isFinite) && S.decoys.length < 4) spawnDecoy(them, msg.id, msg.x, msg.y, msg.a, msg.t);
        } else if (msg.k === 'pop') {
          for (const d of S.decoys) if (d.id === msg.id) popDecoy(d);
        }
      },

      focus() {
        const o = S.kill || P[1 - me];
        view.fit();
        const out = { x: 0, y: 0 };
        view.screenOf(o.x, o.y, out);
        return out;
      },

      dispose() {
        sound.stop(0.3);
        S.bullets.length = 0;
        S.decoys.length = 0;
        S.pings.length = 0;
        S.parts.clear();
        term.clear();
        view.dispose();
      },
    };

    // The winning round as the loser's client simulated it never judged anything: end it on the body.
    function clipBeam(b, v) {
      const p = b.path;
      let best = Infinity, at = b.total;
      const legs = p.bounce ? 2 : 1;
      for (let k = 0; k < legs; k++) {
        const ax = k ? p.x1 : p.x0, ay = k ? p.y1 : p.y0, bx = k ? p.x2 : p.x1, by = k ? p.y2 : p.y1, len = k ? p.l2 : p.l1;
        const ex = bx - ax, ey = by - ay;
        const t = clamp(((v.x - ax) * ex + (v.y - ay) * ey) / (ex * ex + ey * ey || 1), 0, 1);
        const d = Math.hypot(v.x - ax - ex * t, v.y - ay - ey * t);
        if (d < best) { best = d; at = (k ? p.l1 : 0) + t * len; }
      }
      if (best < R_HIT * 3) { b.total = at; b.s = Math.min(b.s, at); b.stopped = true; if (b.s >= at) b.done = true; }
    }
  },
};
