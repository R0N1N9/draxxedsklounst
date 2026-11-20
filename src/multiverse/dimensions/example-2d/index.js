// EXAMPLE 2D — the smallest complete dimension, kept as a template and a test fixture
// (dev: true keeps it out of the match rotation). Copy this folder to start a new one.
//
// It shows the whole pattern from contract.js section 2:
//   - a world generated from ctx.rng so both online clients build the same map
//   - two symmetric player entities driven by a per-frame command (human / bot / remote puppet)
//   - the shooter judges their own shots and reports the hit with ctx.kill
//   - sudden death that exposes both players and forces an ending
import { clamp, angLerp, angDiff, dist, rand, gauss, raycastRects, lineOfSight, resolveCircleRects, segCircle, rgba, glowLine, Particles2D, Shake } from '../../kit.js';

const W = 1600, H = 900; // world units, scaled to fit any screen
const R = 16; // player radius
const SPEED = 230, DASH_SPEED = 900, DASH_TIME = 0.14, DASH_CD = 3;
const BULLET_SPEED = 2400, RELOAD = 1.1;

export default {
  id: 'example-2d',
  name: 'TEST RANGE',
  tagline: 'The smallest complete dimension.',
  perspective: 'TOP-DOWN 2D',
  renderer: '2d',
  aim: 'pointer',
  dev: true,
  palette: { bg: '#10131c', fg: '#dfe6f5', accent: '#7cf0c0' },
  controls: { fire: 'FIRE', a1: 'DASH' },
  hint: 'Walls stop bullets. One hit wins.',
  angleFields: ['a'],

  create(ctx) {
    // ---- world: seeded and mirrored through the centre, so neither spawn is favoured ----
    const walls = [];
    for (let i = 0; i < 7; i++) {
      const w = rand(ctx.rng, 60, 190), h = rand(ctx.rng, 60, 190);
      const x = rand(ctx.rng, 260, W / 2 - w - 30), y = rand(ctx.rng, 50, H - h - 50);
      walls.push({ x, y, w, h }, { x: W - x - w, y: H - y - h, w, h });
    }
    const bounds = [{ x: -60, y: -60, w: W + 120, h: 60 }, { x: -60, y: H, w: W + 120, h: 60 }, { x: -60, y: 0, w: 60, h: H }, { x: W, y: 0, w: 60, h: H }];
    const solid = walls.concat(bounds);
    const spawns = [{ x: 110, y: H / 2 }, { x: W - 110, y: H / 2 }];

    // ---- players: 0 always takes spawn A, 1 spawn B ----
    const P = [0, 1].map((i) => ({
      i, x: spawns[i].x, y: spawns[i].y, a: i ? Math.PI : 0, alive: true, reload: 0, dashT: 0, dashCd: 0, dvx: 0, dvy: 0,
      remote: ctx.opponent === 'remote' && i !== ctx.me, // a puppet fed by the network
      bot: null,
    }));
    for (const p of P) {
      if (!p.remote && (p.i !== ctx.me || ctx.autopilot)) p.bot = { wx: p.x, wy: p.y, wander: 0, seen: 0, err: 0 };
    }
    const bullets = [];
    const sparks = new Particles2D(300);
    const shake = new Shake(10);
    const view = { s: 1, ox: 0, oy: 0 };
    let t = 0, deadAt = null;

    const cover = () => (ctx.sudden ? bounds : solid); // sudden death: the walls phase out

    // ---- commands ----
    function humanCmd(p) {
      const inp = ctx.input;
      return { mx: inp.moveX, my: inp.moveY, a: inp.aimAngle(view.ox + p.x * view.s, view.oy + p.y * view.s, p.a), fire: inp.firePressed, a1: inp.a1Pressed };
    }

    function botCmd(p, e, dt) {
      const b = p.bot, skill = ctx.botSkill;
      b.wander -= dt;
      if (b.wander <= 0 || dist(p.x, p.y, b.wx, b.wy) < 30) {
        b.wander = 1.2 + Math.random() * 2;
        b.wx = clamp(p.x + (Math.random() - 0.5) * 700, 70, W - 70);
        b.wy = clamp(p.y + (Math.random() - 0.5) * 700, 70, H - 70);
      }
      const dx = b.wx - p.x, dy = b.wy - p.y, d = Math.hypot(dx, dy) || 1;
      const sees = e.alive && lineOfSight(p.x, p.y, e.x, e.y, cover());
      if (sees) b.seen += dt;
      else { b.seen = 0; b.err = gauss(Math.random) * (0.13 - 0.1 * skill); }
      // Reaction delay and aim error both shrink with skill.
      const want = sees ? Math.atan2(e.y - p.y, e.x - p.x) + b.err : Math.atan2(dy, dx);
      const a = angLerp(p.a, want, 1 - Math.exp(-dt * (4 + 8 * skill)));
      let fire = false;
      if (sees && b.seen > 0.95 - 0.6 * skill && p.reload <= 0 && Math.abs(angDiff(a, want)) < 0.05) {
        fire = true;
        b.err = gauss(Math.random) * (0.13 - 0.1 * skill);
      }
      // Sidestep incoming rounds now and then.
      let a1 = false;
      for (const bl of bullets) if (bl.owner !== p.i && dist(bl.x, bl.y, p.x, p.y) < 260 && Math.random() < skill * 0.2) a1 = true;
      return { mx: dx / d, my: dy / d, a, fire, a1 };
    }

    // ---- simulation of a locally controlled player ----
    function step(p, cmd, dt) {
      p.a = cmd.a;
      if (ctx.phase !== 'live' || !p.alive) return; // intro: look, don't move
      p.reload = Math.max(0, p.reload - dt);
      p.dashCd = Math.max(0, p.dashCd - dt);
      let vx = cmd.mx * SPEED, vy = cmd.my * SPEED;
      const len = Math.hypot(cmd.mx, cmd.my);
      if (cmd.a1 && p.dashCd <= 0 && len > 0.1) {
        p.dashCd = DASH_CD;
        p.dashT = DASH_TIME;
        p.dvx = (cmd.mx / len) * DASH_SPEED;
        p.dvy = (cmd.my / len) * DASH_SPEED;
        ctx.audio.sfx('swoosh', { gain: 0.6 });
      }
      if (p.dashT > 0) { p.dashT -= dt; vx = p.dvx; vy = p.dvy; }
      p.x += vx * dt;
      p.y += vy * dt;
      resolveCircleRects(p, R, cover());
      if (cmd.fire && p.reload <= 0) {
        p.reload = RELOAD;
        // From the centre, which collision keeps outside every wall — a muzzle point further
        // out could already be inside the wall you are hugging, and the shot would pass through it.
        const x = p.x, y = p.y;
        shoot(p.i, x, y, p.a, true);
        ctx.net.send({ k: 'shot', x: Math.round(x), y: Math.round(y), a: +p.a.toFixed(3) }); // so the peer can draw it
      }
    }

    // judge = this client decides whether the bullet hits (true for everything it simulates).
    function shoot(owner, x, y, a, judge) {
      bullets.push({ owner, x, y, vx: Math.cos(a) * BULLET_SPEED, vy: Math.sin(a) * BULLET_SPEED, life: 1.2, judge, ox: x, oy: y });
      ctx.audio.sfx('shot', { pan: clamp((x / W) * 2 - 1, -1, 1) * 0.6, gain: owner === ctx.me ? 1 : 0.7 });
      shake.add(owner === ctx.me ? 0.35 : 0.15);
    }

    function stepBullets(dt) {
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        const travel = BULLET_SPEED * dt;
        const wall = raycastRects(b.x, b.y, b.vx, b.vy, travel, cover());
        const reach = wall ? wall.dist : travel;
        const ex = b.x + (b.vx / BULLET_SPEED) * reach, ey = b.y + (b.vy / BULLET_SPEED) * reach;
        const e = P[1 - b.owner];
        if (b.judge && ctx.phase === 'live' && e.alive && segCircle(b.x, b.y, ex, ey, e.x, e.y, R) >= 0) {
          ctx.kill(e.i, { how: `${Math.round(dist(b.ox, b.oy, e.x, e.y) / 10)} M` });
          bullets.splice(i, 1);
          continue;
        }
        b.life -= dt;
        if (wall || b.life <= 0) {
          if (wall) sparks.burst(8, () => ({ x: ex, y: ey, vx: (Math.random() - 0.5) * 300, vy: (Math.random() - 0.5) * 300, life: 0.3, size: 2, color: '#ffe9a8', shape: 'spark', additive: true }));
          bullets.splice(i, 1);
          continue;
        }
        b.x = ex;
        b.y = ey;
      }
    }

    function drawPlayer(g, p) {
      const col = ctx.players[p.i].color;
      if (!p.alive) return;
      g.save();
      g.translate(p.x, p.y);
      if (ctx.sudden) {
        g.strokeStyle = rgba(col, 0.5 + 0.4 * Math.sin(t * 8));
        g.lineWidth = 3;
        g.beginPath();
        g.arc(0, 0, R + 14 + 6 * Math.sin(t * 8), 0, Math.PI * 2);
        g.stroke();
      }
      g.rotate(p.a);
      g.fillStyle = '#0a0d14';
      g.strokeStyle = col;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(0, 0, R, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = col;
      g.fillRect(R * 0.2, -3, R * 1.5, 6);
      g.restore();
    }

    return {
      update(dt) {
        t += dt;
        for (const p of P) {
          if (p.remote) {
            const r = ctx.net.remote;
            if (r) { p.x = r.x; p.y = r.y; p.a = r.a; }
          } else step(p, p.bot ? botCmd(p, P[1 - p.i], dt) : humanCmd(p), dt);
        }
        const me = P[ctx.me];
        ctx.net.sendState({ x: Math.round(me.x), y: Math.round(me.y), a: +me.a.toFixed(3) });
        stepBullets(dt);
        sparks.update(dt);
        ctx.hud.cooldown('fire', me.reload / RELOAD);
        ctx.hud.cooldown('a1', me.dashCd / DASH_CD);
      },

      render() {
        const g = ctx.g, w = ctx.width, h = ctx.height;
        view.s = Math.min(w / W, h / H) * 0.96;
        view.ox = (w - W * view.s) / 2;
        view.oy = (h - H * view.s) / 2;
        const sh = shake.update(1 / 60);
        g.fillStyle = '#080a10';
        g.fillRect(0, 0, w, h);
        g.save();
        g.translate(view.ox + sh.x, view.oy + sh.y);
        g.scale(view.s, view.s);
        g.fillStyle = '#10131c';
        g.fillRect(0, 0, W, H);
        g.strokeStyle = 'rgba(124,240,192,0.07)';
        g.lineWidth = 1;
        g.beginPath();
        for (let x = 0; x <= W; x += 80) { g.moveTo(x, 0); g.lineTo(x, H); }
        for (let y = 0; y <= H; y += 80) { g.moveTo(0, y); g.lineTo(W, y); }
        g.stroke();
        g.globalAlpha = ctx.sudden ? 0.18 : 1;
        g.fillStyle = '#26304a';
        g.strokeStyle = '#7cf0c0';
        g.lineWidth = 2;
        for (const r of walls) { g.fillRect(r.x, r.y, r.w, r.h); g.strokeRect(r.x, r.y, r.w, r.h); }
        g.globalAlpha = 1;
        // The local player's sight line stops at the first wall.
        const me = P[ctx.me];
        if (me.alive && ctx.phase !== 'over') {
          const hit = raycastRects(me.x, me.y, Math.cos(me.a), Math.sin(me.a), 2400, cover());
          const d = hit ? hit.dist : 2400;
          g.strokeStyle = rgba(ctx.players[ctx.me].color, 0.28);
          g.lineWidth = 1.5;
          g.setLineDash([10, 10]);
          g.beginPath();
          g.moveTo(me.x, me.y);
          g.lineTo(me.x + Math.cos(me.a) * d, me.y + Math.sin(me.a) * d);
          g.stroke();
          g.setLineDash([]);
        }
        for (const p of P) drawPlayer(g, p);
        for (const b of bullets) glowLine(g, b.x - b.vx * 0.02, b.y - b.vy * 0.02, b.x, b.y, ctx.players[b.owner].color, 3, 12);
        sparks.draw(g);
        g.restore();
      },

      onPhase(phase) {
        if (phase !== 'over' || !ctx.result || ctx.result.victim < 0) return;
        const v = P[ctx.result.victim];
        v.alive = false;
        deadAt = { x: v.x, y: v.y };
        const col = ctx.players[v.i].color;
        sparks.burst(60, () => {
          const a = Math.random() * Math.PI * 2, s = 80 + Math.random() * 520;
          return { x: v.x, y: v.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.7, size: 3 + Math.random() * 4, color: col, drag: 2, additive: true };
        });
        shake.add(0.9);
        ctx.audio.sfx('boom', { gain: 0.7 });
      },

      onNet(msg) {
        if (msg.k === 'shot') shoot(1 - ctx.me, msg.x, msg.y, msg.a, false);
      },

      focus() {
        const p = deadAt || P[1 - ctx.me];
        return { x: view.ox + p.x * view.s, y: view.oy + p.y * view.s };
      },

      dispose() {
        bullets.length = 0;
        sparks.clear();
      },
    };
  },
};
