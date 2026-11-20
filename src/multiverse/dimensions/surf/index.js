// BREAK POINT — third person, golden hour, two snipers on surfboards.
//
// THE FANTASY  A wide tropical bay at the last of the light. Two riders, 116 m apart, on a
//   long rolling swell: one with the beach, the pier and the lighthouse behind them, one
//   with the sun and a cruise ship. One rifle each. One hit wins the point.
// THE RULES    The sea is the cover. The swell runs towards the beach, and every crest that
//   passes BETWEEN you hides you from each other: you can only shoot in the windows when
//   both of you are up on the water, or when you have worked round onto the same line of
//   swell ("down the line"), or closed the range. Rounds fly at 280 m/s — a carving target
//   needs lead — and a round that comes in flat skips off the water in a line of splashes.
//   Your aim rides the board: it wanders with speed and turning and tips with the face under
//   you. The reticle is drawn where the round will really go, so you can see all of that.
// CONTROLS     stick / WASD: CARVE (push where you want to go — relative to where you look —
//   and the board carves round to it) · look: AIM ·
//   FIRE · alt BRACE (one knee: steady, a 2.8x lens — you stay in the foot of the frame —
//   but no steering: the sea takes you where it likes, and your scope glints) · a1 DIVE (duck under for a second:
//   nothing can touch you, and you come up 15 m further on; the dodge) · a2 SPRAY (a hard
//   cutback throws a curtain of spray across your line of sight for seven seconds — the
//   smoke grenade of the sea: it hides, it does not stop rounds).
// THE SEA      moves you, as a pure function of place and time (sea.flow): the surface runs
//   forward on every crest and back in every trough and carries the board with it; a face
//   is a slope (15 m/s² of it: you gain speed dropping in and lose it climbing out); and
//   where a crest is breaking — the white water you can see — it shoves you along at half
//   the wave's own speed, drags at you and shakes your aim. Picking a line matters.
// THE WORLD    All of it runs off the round clock, so both clients see the same bay. A pod
//   of dolphins leaps round the middle (they stop rounds, and are fine), a fin circles and
//   bumps any board it reaches (a nudge, never a bite), a beach ball bounces through on the
//   wind, gulls wheel over whoever fired last, a plane tows a banner along the beach, and
//   every half minute the cruise ship sounds its horn: a SET WAVE three times the size of
//   the swell is coming through, and whoever is on top of it can see everything.
// THE BOT      bot.js: feels the swell out, ranges with a shot or two that skip past, then
//   holds the range and waits for windows or zig-zags in through the troughs; braces to
//   shoot, relocates after, dives when lined up, throws spray when caught reloading.
// THE KILL     One unbroken beat that hands the match to the world below (overTime 4.5 s).
//   The loser's board fires into the sky; they come off it arms out and tumble down the face
//   into a tower of white water with a rainbow in the mist — seen on a long lens over the
//   winner's shoulder. The winner watches them go under, crouches, and dives in after them
//   head first; the camera swings round behind, follows them down, and the last frame is the
//   lens crossing the waterline: foam and bubbles, the bright surface overhead, blue below.
// SUDDEN DEATH The swell dies away to almost nothing — no cover left — both snipers are
//   marked with a beam, and the buoy line closes on the middle of the bay.
//
// FILES  sea.js (the Gerstner surface, twice: JS and GLSL) · world.js (creatures and buoys
//   as functions of time) · game.js (rules) · bot.js · ocean.js (the water shader) · sky.js
//   · shore.js (beach, palms, pier, tower, lighthouse) · life.js (what world.js describes,
//   drawn) · surfer.js (the riders) · fx.js (spray, streaks, wakes, rainbow) · post.js
//   (HDR, bloom, shafts, grade) · view.js + overlay.js (camera, HUD) · sound.js.
import { clamp, lerp, disposeTree, hexToRgb } from '../../kit.js';
import { DEFAULTS } from '../../contract.js';
import { makeSea, SET } from './sea.js';
import { makeWorld } from './world.js';
import { makeGame, LOOK, R, KILL, SLOW } from './game.js';
import { makeBot } from './bot.js';
import { makeSky, SUN, SUN_COLOR } from './sky.js';
import { makeOcean } from './ocean.js';
import { makeFx } from './fx.js';
import { makePost } from './post.js';
import { makeHaze, makeSurferKit } from './surfer.js';
import { buildShore } from './shore.js';
import { buildLife } from './life.js';
import { makeSfx } from './sound.js';
import { makeView } from './view.js';

const ROUND = 55;

export default {
  id: 'surf',
  name: 'BREAK POINT',
  tagline: 'Two rifles, one swell — and the sea keeps getting in the way.',
  perspective: 'THIRD PERSON 3D',
  renderer: 'three',
  aim: 'look',
  palette: { bg: '#0b2c3a', fg: '#fff1d6', accent: '#ff7a4d' },
  controls: { move: 'CARVE', aim: 'AIM', fire: 'FIRE', alt: 'BRACE', a1: 'DIVE', a2: 'SPRAY' },
  hint: 'The swell hides you both — shoot when they ride up into view.',
  altToggle: true,
  roundTime: ROUND,
  overTime: KILL.end,
  angleFields: ['hd', 'yaw', 'pitch'],

  create(ctx) {
    const { THREE, renderer } = ctx.three;
    // Two builds of one picture: a software rasteriser draws the same sea at a lower
    // resolution, without multisampling or lens colour, under full-resolution grain.
    const Q = { soft: false, scale: 1 };
    try {
      const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext && /swiftshader|llvmpipe|software|basic render/i.test(String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)))) { Q.soft = true; Q.scale = 0.36; }
    } catch { /* masked: assume a real GPU */ }
    if (globalThis.__surfRich) { Q.soft = false; Q.scale = 1; } // test scripts: the full build, whatever draws it

    const sea = makeSea(THREE, ctx.rng, ROUND), world = makeWorld(ctx.rng, sea, ROUND);
    const scene = new THREE.Scene();
    const sky = makeSky(THREE, renderer, Q), haze = makeHaze(THREE);
    const tints = ctx.players.map((pl) => { const c = new THREE.Color(pl.color); return new THREE.Vector3(c.r, c.g, c.b); });
    const ocean = makeOcean(THREE, sea, sky, ctx.seed, tints, Q);
    const fx = makeFx(THREE, sky, ocean.uniforms.tDetail.value, SUN_COLOR, Q);
    scene.add(sky.dome, ocean.mesh, fx.group);
    scene.add(new THREE.HemisphereLight(new THREE.Color(0.46, 0.55, 0.74), new THREE.Color(0.24, 0.3, 0.26), 1.7));
    const sun = new THREE.DirectionalLight(new THREE.Color(...SUN_COLOR), 5.5);
    sun.position.set(SUN.x * 400, SUN.y * 400, SUN.z * 400);
    scene.add(sun, sun.target);
    const shore = buildShore(THREE, haze, ctx.seed, Q, sun, renderer);
    const sfx = makeSfx(ctx);
    const life = buildLife(THREE, haze, world, sea, ctx.seed, fx, sfx);
    life.setSun(sky.sun);
    scene.add(shore.group, life.group);
    const kit = makeSurferKit(THREE, haze);
    const models = ctx.players.map((pl) => { const m = kit.surfer(pl.color); scene.add(m.root); return m; });
    const rgb = ctx.players.map((pl) => { const c = hexToRgb(pl.color); return [c.r / 255, c.g / 255, c.b / 255]; });
    const rnd = (a = 1) => (Math.random() - 0.5) * 2 * a;
    let view = null, game = null, carveT = 0;

    // ---- what the rules want seen and heard ----
    const hooks = {
      shot(p, ox, oy, oz, dx, dy, dz) {
        const mine = p === game.me, c = rgb[p.i];
        fx.star(ox + dx * 0.5, oy + dy * 0.5, oz + dz * 0.5, mine ? 2.2 : 5, 9, 6, 3, 0.06);
        for (let i = 0; i < 6; i++) fx.spark(ox + dx * 0.6, oy, oz + dz * 0.6, dx * 14 + rnd(5), dy * 14 + rnd(5) + 2, dz * 14 + rnd(5), 0.15 + Math.random() * 0.2, 0.09, 8 + c[0] * 4, 5 + c[1] * 4, 2 + c[2] * 4);
        for (let i = 0; i < 3; i++) fx.mist(ox + dx * (0.6 + i * 0.5), oy, oz + dz * (0.6 + i * 0.5), dx * (3 - i), 0.5, dz * (3 - i), 0.5 + i * 0.15, 0.3, 1.2 + i * 0.3, 0.22, -0.4, 2);
        sfx.shot(ox, oz, mine);
        if (mine && !p.bot) { view.kick(p.brace > 0.5 ? 1 : 0.7); if (p.ammo > 1) sfx.bolt(); else sfx.reload(); }
        else if (mine) view.kick(0.4);
      },
      skip(x, y, z, dx, dz, n) {
        fx.ring(x, y, z, 0.5, 3.2, 0.7, 0.9);
        for (let i = 0; i < 7; i++) fx.drop(x, y + 0.1, z, dx * (3 + Math.random() * 5) + rnd(1.5), 2.5 + Math.random() * 3.5, dz * (3 + Math.random() * 5) + rnd(1.5), 0.5 + Math.random() * 0.4, 0.09);
        for (let i = 0; i < 3; i++) fx.mist(x, y + 0.2, z, dx * 3 + rnd(1), 2.5 + Math.random() * 2, dz * 3 + rnd(1), 0.6, 0.5, 1.8, 0.5, 5, 1);
        sfx.skip(x, z, n);
      },
      plunge(x, y, z) { fx.splash(x, y, z, 1.1, 5, 7); sfx.plunge(x, z); },
      sand(x, y, z) { for (let i = 0; i < 4; i++) fx.emit(0, x, Math.max(y, 0.3), z, rnd(2), 2 + Math.random() * 2, rnd(2), 0.9, 0.6, 2.2, 0.8, 0.62, 0.4, 0.4, 3, 1.5, 0, rnd(0.5)); },
      boop(kind, i, x, y, z, owner) {
        if (kind === 'dolphin') { for (let k = 0; k < 10; k++) fx.spark(x, y, z, rnd(6), 2 + Math.random() * 5, rnd(6), 0.5, 0.12, 4, 7, 8); fx.star(x, y, z, 3, 3, 6, 7, 0.1); sfx.dolphin(x, z); life.spin(i); if (owner === ctx.me) view.note('BOOP!', false, 1.2); }
        else if (kind === 'ball') { fx.confetti(x, y, z, 26, [[3, 0.8, 0.5], [3, 2.4, 0.8], [0.4, 2.4, 2.6], [3, 3, 3]]); sfx.ball(x, z); life.punt(); }
        else if (kind === 'buoy') { for (let k = 0; k < 8; k++) fx.spark(x, y, z, rnd(7), Math.random() * 6, rnd(7), 0.3, 0.09, 9, 6, 3); sfx.buoy(x, z); }
        else { fx.splash(x, y - 0.3, z, 0.8, 3, 4); sfx.fin(x, z); }
      },
      near(foe, b) {
        if (foe !== game.me || foe.bot) return;
        const side = clamp((b.vx * Math.cos(foe.yaw) - b.vz * Math.sin(foe.yaw)) / R.bulletV, -1, 1);
        sfx.crack(side);
        view.hitFrom(b.ox, b.oz);
        view.shake(0.3);
      },
      dive(p, up) {
        fx.splash(p.x, p.y, p.z, up ? 1.8 : 1.4, up ? 9 : 6, up ? 8 : 5);
        if (up) sfx.diveOut(p.x, p.z); else sfx.diveIn(p.x, p.z);
      },
      spray(w) {
        // The throw: a fan of white water along the wall, then fx keeps it standing.
        const tx = -w.nz, tz = w.nx, base = sea.height(w.x, w.z);
        for (let i = 0; i < 46; i++) { const u = rnd(R.sprayHW); fx.mist(w.x + tx * u, base + 0.3, w.z + tz * u, w.nx * 2 + rnd(1.5), 7 + Math.random() * 9, w.nz * 2 + rnd(1.5), 1 + Math.random() * 0.9, 1.2, 4.2, 0.6, 9, 0.9); }
        for (let i = 0; i < 40; i++) { const u = rnd(R.sprayHW); fx.drop(w.x + tx * u, base + 0.3, w.z + tz * u, w.nx * 4 + rnd(3), 8 + Math.random() * 9, w.nz * 4 + rnd(3), 0.9 + Math.random() * 0.7, 0.1); }
        sfx.spray(w.x, w.z);
      },
      bump(p) {
        fx.splash(p.x, p.y, p.z, 1.6, 8, 7);
        if (p === game.me) { sfx.bump(); view.shake(0.7); if (!p.bot) view.note('SHARK BUMP!', true, 1.6); }
      },
      land(p, v) { if (v > 2.5) { fx.splash(p.x, p.y, p.z, 0.8 + v * 0.1, 5, 3 + v * 0.4); sfx.land(p.x, p.z, clamp(v / 8, 0.2, 1)); if (p === game.me) view.shake(Math.min(0.4, v * 0.04)); } },
      launch() {},
      reloaded(p) { if (p === game.me && !p.bot) sfx.reloaded(); },
      dry(p) { if (p === game.me) sfx.dry(); },
      horn() { sfx.horn(); sfx.setWave(); view.note('SET WAVE COMING THROUGH', true, 3.2); },
      // The hit: the board leaves, the rider starts to fall. (The water comes later.)
      wipeout(v) {
        const c = rgb[1 - v.i];
        const cd = Math.hypot(v.x - view.camera.position.x, v.z - view.camera.position.z);
        fx.star(v.x, v.y + 1, v.z, 2 + Math.min(6, cd * 0.06), 6 + c[0] * 6, 6 + c[1] * 6, 6 + c[2] * 6, 0.12); // (a flare, not a white-out, when it is your own board)
        fx.confetti(v.x, v.y + 1, v.z, 26, [[2 + c[0] * 5, 2 + c[1] * 5, 2 + c[2] * 5], [3, 3, 3]]);
        fx.splash(v.x, v.y, v.z, 1.6, 9, 9);
        for (let i = 0; i < 16; i++) fx.drop(v.x, v.y + 0.3, v.z, rnd(3), 9 + Math.random() * 12, rnd(3), 1 + Math.random(), 0.1); // what the board took up with it
        fx.warm(0.06);
        sfx.wipeout(v.x, v.z);
      },
      // Something fell in: the board, or (big) the rider — a tower of white water, and a bow in its mist.
      splashDown(x, y, z, size, body) {
        fx.splash(x, y, z, 1.6 * size, 8, 8 * size);
        sfx.splashDown(x, z, size);
        if (!body) return;
        const k = game.kill;
        for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28, r = Math.random() * 1.8, up = 8 + Math.random() * 13; fx.mist(x + Math.cos(a) * r, y + 0.3, z + Math.sin(a) * r, Math.cos(a) * (1 + r), up, Math.sin(a) * (1 + r), 1.4 + Math.random() * 1.2, 1.4, 4.5 + Math.random() * 2, 0.7, 9, 0.5); }
        for (let i = 0; i < 60; i++) { const a = Math.random() * 6.28, s = 2 + Math.random() * 7; fx.drop(x, y + 0.3, z, Math.cos(a) * s, 7 + Math.random() * 15, Math.sin(a) * s, 1 + Math.random() * 1.2, 0.08 + Math.random() * 0.1); }
        for (let i = 0; i < 3; i++) fx.ring(x, y, z, 1 + i, 9 + i * 4, 1.4 + i * 0.3, 0.9);
        for (let i = 0; i < 24; i++) fx.mist(x + rnd(8) + k.ux * 5, y + 1 + Math.random() * 7, z + rnd(8) + k.uz * 5, rnd(0.6), 0.6 + Math.random(), rnd(0.6), 3, 3, 7, 0.15, 0.2, 0.5); // a veil for the bow to hang in
        fx.rainbow(x + k.ux * 7, y + 1.5, z + k.uz * 7);
      },
      // The winner leaves their board...
      spring(w) { fx.splash(w.x, w.y, w.z, 0.9, 4, 3); ctx.audio.sfx('whoosh', { gain: 0.5 }); },
      // ...and goes in clean: a tight column, a ring, and the sound closing over.
      header(x, y, z) {
        for (let i = 0; i < 14; i++) fx.mist(x + rnd(0.4), y + 0.2, z + rnd(0.4), rnd(1.2), 4 + Math.random() * 6, rnd(1.2), 0.9 + Math.random() * 0.6, 0.7, 2.6, 0.65, 9, 0.6);
        for (let i = 0; i < 26; i++) fx.drop(x, y + 0.2, z, rnd(2.5), 5 + Math.random() * 8, rnd(2.5), 0.7 + Math.random() * 0.6, 0.08);
        fx.ring(x, y, z, 0.6, 5, 1.1, 0.9); fx.ring(x, y, z, 0.3, 8, 1.6, 0.6);
        sfx.header(x, z);
      },
    };
    game = makeGame(ctx, sea, world, hooks);
    const P = game.P, me = game.me, foe = P[1 - ctx.me];
    const brain = makeBot(ctx, sea, world, game);
    for (const p of P) if (!p.remote && (p.i !== ctx.me || ctx.autopilot)) p.bot = brain.create(p);
    const post = makePost(THREE, renderer, { msaa: !Q.soft, scale: Q.scale, lens: !Q.soft });
    // A software rasteriser builds its shaders as it first draws with them: the cast and the
    // spray join the picture one draw after the sea, the riders and the shore.
    const stage = (draws) => { life.group.visible = fx.group.visible = !Q.soft || draws > 0; };
    // If the clock ran ahead of the frames (a hitch), run the hand-off out before the round's last picture is taken.
    const settle = () => { for (let i = 0; i < 200 && ctx.phase === 'over' && game.kill.on && game.kill.t < KILL.end - 0.02; i++) frame(0.05 * SLOW, T + 0.05 * SLOW, true); };
    view = makeView(ctx, THREE, renderer, { scene, sea, world, game, post, ocean, haze, Q, sfx, settle, stage });

    let T = -4.6, introRate = 1, introOn = false, suddenSeen = false, sprayAcc = [0, 0], wallAcc = 0, driftAcc = 0, wasTurn = 0, boilAcc = 0;
    const bp = game.bullets.map(() => ({ on: false, x: 0, y: 0, z: 0 }));
    const riders = [{ x: 0, z: 0, v: 0, on: false }, { x: 0, z: 0, v: 0, on: false }];

    function humanCmd(p, first) {
      const inp = ctx.input, c = p.cmd, live = ctx.phase === 'live', k = first && live ? LOOK * lerp(1, 0.42, p.brace) : 0;
      c.mx = inp.moveX; c.my = inp.moveY;
      c.yaw = p.yaw - inp.lookX * k;
      c.pitch = clamp(p.pitch - inp.lookY * k, -0.6, 0.5);
      c.fire = first && inp.firePressed; c.alt = inp.alt; c.a1 = first && inp.a1Pressed; c.a2 = first && inp.a2Pressed;
      return c;
    }

    // Spray, streaks and glints that follow from the state of the round rather than from one event.
    function ambience(dt) {
      const live = ctx.phase !== 'intro';
      for (const p of P) {
        const rd = riders[p.i], onWater = p.alive && p.dive <= 0 && !p.air;
      // under the surface you are still on screen: a boil of bubbles and a pale shape track you
      if (p.alive && p.dive > 0 && Math.random() < dt * 22) { const h = sea.height(p.x, p.z); fx.ring(p.x + rnd(0.4), h, p.z + rnd(0.4), 0.3, 1.6, 0.6, 0.8); fx.mist(p.x, h + 0.1, p.z, rnd(0.5), 0.6 + Math.random(), rnd(0.5), 0.45, 0.5, 1.4, 0.45, 2, 1); }
        rd.x = p.x; rd.z = p.z; rd.v = p.v; rd.on = onWater && p.v > 1.2;
        if (!onWater || p.v < 2) continue;
        const fxh = -Math.sin(p.hd), fzh = -Math.cos(p.hd), carve = Math.abs(p.turn);
        sprayAcc[p.i] += dt * (p.v * 1.6 + carve * p.v * 2.2 + p.white * 30);
        for (; sprayAcc[p.i] >= 1; sprayAcc[p.i] -= 1) {
          const side = p.turn > 0 ? -1 : 1, sx = Math.cos(p.hd) * side, sz = -Math.sin(p.hd) * side, hard = Math.min(1, carve / 1.8);
          fx.mist(p.x - fxh * 1.1 + rnd(0.3), p.y + 0.15, p.z - fzh * 1.1 + rnd(0.3), -fxh * p.v * 0.25 + sx * hard * 4 + rnd(0.7), 1.2 + hard * 3.5 + Math.random() * 1.5, -fzh * p.v * 0.25 + sz * hard * 4 + rnd(0.7), 0.6 + Math.random() * 0.5, 0.45, 1.5 + hard * 1.4, 0.34, 5, 1.2);
          if (hard > 0.5) fx.drop(p.x - fxh, p.y + 0.2, p.z - fzh, sx * 5 + rnd(2), 3 + Math.random() * 4, sz * 5 + rnd(2), 0.6, 0.07);
        }
      }
      if (!me.bot && live) { const tr = Math.abs(me.turn); carveT -= dt; if (tr > 1.5 && wasTurn <= 1.5 && carveT <= 0) { sfx.carve(1); carveT = 0.5; } wasTurn = tr; }
      // the walls of spray: a curtain kept standing as tall and as wide as what it hides
      wallAcc += dt * 110;
      for (; wallAcc >= 1; wallAcc -= 1) for (const w of game.walls) {
        if (!w.on) continue;
        const left = w.t1 - game.T, k = clamp(left / 1.5, 0, 1), u = rnd(R.sprayHW * 1.05), tx = -w.nz, tz = w.nx, x = w.x + tx * u, z = w.z + tz * u;
        if (Math.random() > k) continue;
        const up = Math.random(), edge = 1 - Math.abs(u) / (R.sprayHW * 1.05);
        fx.mist(x + rnd(0.8), sea.height(x, z) + up * up * R.sprayH * (0.6 + 0.4 * edge), z + rnd(0.8), rnd(0.6) + w.nx * 0.4, 1.4 + Math.random() * 2.2, rnd(0.6) + w.nz * 0.4, 1.6 + Math.random() * 0.8, 2.6, 5.4, 0.42 + 0.2 * edge, 0.9, 0.7);
        if (Math.random() < 0.35) fx.drop(x, sea.height(x, z) + 0.2 + up * 4, z, rnd(1.5), 2 + Math.random() * 4, rnd(1.5), 0.7 + Math.random() * 0.5, 0.08);
      }
      // spindrift: the wind takes the tops off the crests (and a plume off the set wave)
      driftAcc += dt * 26;
      const cam = view.camera, sw = sea.setWave();
      for (; driftAcc >= 1; driftAcc -= 1) {
        const a = Math.random() * 6.28, r = 12 + Math.random() * 70, x = cam.position.x + Math.cos(a) * r, z = cam.position.z + Math.sin(a) * r, h = sea.height(x, z);
        if (h > 1.55 * sea.calm + (sw.amp > 1 ? 0.6 : 0)) fx.mist(x, h + 0.2, z, 2.5 + rnd(1), 0.8 + Math.random(), -3.5 + rnd(1), 0.9 + Math.random() * 0.6, 0.5, 2.4 + h * 0.4, 0.22 + Math.min(0.2, h * 0.04), 0.6, 0.4);
        if (sw.amp > 2.2) { const sx2 = rnd(125), sz2 = sw.z + rnd(2); fx.mist(sx2, sea.height(sx2, sz2) + 0.3, sz2, 2 + rnd(1), 2 + Math.random() * 2, 5 + rnd(1), 1.2 + Math.random(), 1.2, 5, 0.3, 0.8, 0.4); }
      }
      // rounds in the air
      for (let i = 0; i < bp.length; i++) {
        const b = game.bullets[i], q = bp[i];
        if (b.on) {
          const c = rgb[b.owner];
          if (!q.on) { q.x = b.ox; q.y = b.oy; q.z = b.oz; }
          fx.streak(q.x, q.y, q.z, b.x, b.y, b.z, 2.5 + c[0] * 5, 2.2 + c[1] * 5, 1.8 + c[2] * 5, 1, 0.07, 0.5);
          fx.star(b.x, b.y, b.z, 1.2 + Math.hypot(b.x - cam.position.x, b.z - cam.position.z) * 0.012, 8, 7, 5, 0.035);
          q.x = b.x; q.y = b.y; q.z = b.z;
        }
        q.on = b.on;
      }
      // a braced rifle pointed your way catches the sun
      if (foe.alive && foe.brace > 0.8 && live && game.sees(ctx.me)) {
        const d = game.los.dist, al = -Math.sin(foe.yaw) * (me.x - foe.x) / d - Math.cos(foe.yaw) * (me.z - foe.z) / d;
        if (al > 0.985) { const s = models[foe.i].st.scope, k = (al - 0.985) / 0.015; fx.star(s.x, s.y, s.z, d * 0.022 * (0.6 + k), 7 * k, 6.5 * k, 5 * k, 0.04); }
      }
      // where the winner went in: the water keeps boiling
      const kl = game.kill;
      if (kl.on && kl.w.hop.wet) {
        boilAcc += dt / SLOW * 30;
        for (; boilAcc >= 1; boilAcc -= 1) {
          const a = Math.random() * 6.28, r = Math.random() * 1.3;
          fx.mist(kl.ex + Math.cos(a) * r, kl.ey + 0.15, kl.ez + Math.sin(a) * r, rnd(0.8), 0.8 + Math.random() * 1.6, rnd(0.8), 0.5 + Math.random() * 0.4, 0.5, 1.5, 0.6, 3, 1);
          if (Math.random() < 0.3) fx.ring(kl.ex + Math.cos(a) * r, kl.ey, kl.ez + Math.sin(a) * r, 0.3, 2.2, 0.7, 0.7);
          fx.drop(kl.ex + Math.cos(a) * r * 0.6, kl.ey + 0.1, kl.ez + Math.sin(a) * r * 0.6, rnd(1), 1.5 + Math.random() * 2.5, rnd(1), 0.5, 0.07);
        }
      }
      // sudden death: a beam over each sniper
      if (ctx.sudden) for (const p of P) if (p.alive) { const c = rgb[p.i]; fx.streak(p.x, p.y + 2.6, p.z, p.x, p.y + 30, p.z, c[0] * 3, c[1] * 3, c[2] * 3, 0.6, 0.16, 0.06); }
      if (Math.random() < dt * 0.22) sfx.gull(world.gulls.x, world.gulls.z);
      // the fire on the beach and the lamp of the lighthouse
      const fr = shore.fire, lh = shore.lighthouse;
      fx.star(fr[0], fr[1] + 1.1, fr[2], 2.4 + Math.random() * 1.2, 7, 3, 0.8, 0.05);
      fx.star(lh.x, lh.y + 25.7, lh.z, 14 + 5 * Math.sin(view.wt * 1.1), 6, 4.2, 2, 0.05);
    }

    function frame(dt, now, first) {
      T = now;
      game.frame(dt, now, (p) => (p.bot ? brain.think(p, P[1 - p.i], dt, p.cmd) : humanCmd(p, first)));
      if (ctx.sudden && !suddenSeen) { suddenSeen = true; sfx.sudden(); view.note('THE SWELL DIES — NOWHERE LEFT TO HIDE', true, 4); }
      view.update(dt, T);
      for (const p of P) models[p.i].update(p, sea, T);
      life.update(dt, T, view.camera);
      shore.update(dt, T, view.wt);
      ambience(dt);
      fx.update(dt, view.camera, sea, riders);
      const m = me;
      ctx.net.sendState({
        x: +m.x.toFixed(2), z: +m.z.toFixed(2), y: +m.y.toFixed(2), hd: +m.hd.toFixed(3), yaw: +m.yaw.toFixed(3), pitch: +m.pitch.toFixed(3), v: +m.v.toFixed(1), ln: +m.lean.toFixed(2),
        br: m.braced ? 1 : 0, dv: m.dive > 0 ? 1 : 0, ai: m.air ? 1 : 0, am: m.ammo, rl: m.reload > 0 ? 1 : 0, wh: +m.white.toFixed(2),
      });
      ctx.hud.cooldown('fire', m.reload > 0 ? m.reload / R.reload : Math.max(0, m.bolt) / R.bolt);
      ctx.hud.charges('fire', m.ammo);
      ctx.hud.cooldown('a1', m.diveCd / R.diveCd);
      ctx.hud.cooldown('a2', m.sprayCd / R.sprayCd);
    }

    const inst = {
      update(dt) {
        const phase = ctx.phase;
        if (phase === 'live') {
          // The round clock is the truth (it keeps real time when frames run long): simulate up
          // to it in slices short enough for the rules. A person gets at most a fifth of a
          // second made up — nobody should carve on blind through a hitch — a bot all of it.
          const t0 = Math.max(T, 0), span = Math.max(0, ctx.time - t0), n = clamp(Math.ceil(span / 0.034), 1, me.bot ? 60 : 6);
          for (let i = 1; i <= n && (i === 1 || ctx.phase === 'live'); i++) frame(Math.min(span / n, 0.05), t0 + (span * i) / n, i === 1);
        } else if (phase === 'over') frame(dt, T + dt, true);
        else {
          // Before the round the sea already runs, timed to arrive at t = 0 as the count ends.
          const rate = introOn ? introRate : T < -DEFAULTS.introTime - 0.6 ? 1 : 0.25;
          frame(dt, Math.min(T + dt * rate, -0.001), true);
        }
      },
      render() { view.render(); },
      resize(w, h) { view.resize(w, h); },
      onPhase(phase) {
        if (phase === 'intro') { introOn = true; introRate = clamp(-T / DEFAULTS.introTime, 0.2, 2.5); view.beginIntro(); }
        else if (phase === 'live') { sfx.music(); view.poke(); }
        else if (phase === 'over') {
          const r = ctx.result;
          if (r && r.victim >= 0 && r.winner >= 0) { game.fell(P[r.victim]); view.killCam(); }
        }
      },
      onNet(msg) {
        if (msg.k === 's') game.remoteShot(msg.o, msg.d);
        else if (msg.k === 'dv') { foe.x = msg.x; foe.z = msg.z; hooks.dive(foe, 0); }
        else if (msg.k === 'sp') game.addWall(foe.i, msg.x, msg.z, msg.nx, msg.nz);
        else if (msg.k === 'k') game.killInfo = { v: msg.v & 1, dx: msg.d[0], dy: msg.d[1], dz: msg.d[2] };
      },
      focus() { return view.focus(); },
      dispose() {
        ctx.audio.stopMusic(0.3);
        sfx.dispose();
        renderer.setRenderTarget(null);
        renderer.shadowMap.autoUpdate = true;
        renderer.shadowMap.enabled = false;
        post.dispose();
        fx.dispose();
        kit.dispose();
        life.dispose();
        shore.dispose();
        ocean.dispose();
        sky.dispose();
        scene.traverse((o) => { if (o.isInstancedMesh) o.dispose(); }); // (their instance buffers: disposeTree frees only geometry and material)
        disposeTree(scene);
      },
    };
    inst.dbg = { game, view, sea, world, fx, Q, SET, post, sky, ocean }; // test scripts only
    post.resize();
    return inst;
  },
};
