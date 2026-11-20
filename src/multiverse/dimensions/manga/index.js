// INK DUEL — a living manga page: a rain-lashed back street at night, drawn in black ink and screentone on warm
// paper, played as a side-on belt-scroll plane (walk left/right AND in/out of depth).
//
// FANTASY   Two umbrella-backed snipers, each carrying one spot of colour, a long street with a level crossing
//           and twin shrine gates between them. The page itself joins in: cut-in panels slide over the art for
//           the big beats and sound effects are lettered in brush katakana.
// RULES     One hit wins. A shot flies along the aim line over the ground plane at chest height (so it crosses
//           lanes: aim at the figure you see). Tall cover stops it, low cover does not. The bullet takes about a
//           second to cross the street: lead moving targets, and mind the sway of your aim, which grows when you
//           move and in the gusts (the lanterns swing a moment before one hits). The train through the crossing is
//           a moving wall: it blocks the sightline, and shoves you aside (stunned, never killed) if you stand on it.
// CONTROLS  move WASD / stick (up and down walk into the street's depth) · aim mouse / aim stick · fire = rifle
//           (a bolt-action: 1.5 s to work the bolt) · alt FOCUS (held; latching on touch): you creep, the aim
//           steadies and the sight line grows long, concentration lines close in and a cut-in of your eyes slides
//           over the page; the other sniper can see the tell · a1 FLASH STEP (a blink through the street leaving
//           afterimages) · a2 DECOY (vanish in a puff a few paces away, leaving a paper double in the smoke that
//           takes the shot: the cloud hides whoever is inside it).
// BOT       A feeling-out phase of cover-to-cover moves, then a sniper (peek, focus, shoot, duck) or a hunter
//           (zig-zag in, hip-fire close up). Skill scales reaction, aim error, lead, dodging; it uses both tools.
// ONLINE    Each client simulates its own sniper and judges its own shots; the other is a puppet. Shots, blinks
//           and decoys travel as events; the train, gusts and the closing page are pure functions of ctx.time.
// KILL      The world stops dead and a splash page slams in: a black impact burst with white speed lines, both
//           snipers frozen in silhouette, one enormous sound effect and an umbrella tumbling away.
// SUDDEN    Both snipers get a beacon, the bolt cycles faster, trains run every ~8 s and the page's panels
//           close in from both ends until the street is a few paces wide.
import { clamp, lerp, ease, damp, Shake, segCircle, raycastRects, rgba, TAU } from '../../kit.js';
import { C, Tones, drawSheet } from './ink.js';
import { WX, WZ, DY, R_BODY, R_WALK, V_X, V_Z, BULLET_V, CHEST, XING, TRAIN, SPAWN, buildWorld, trainHead, syncTrain, gustAt, aimDir, pushOut, pushOutTall, limits, makeView } from './world.js';
import { buildScenery } from './scenery.js';
import { makeSet, drawBackdrop, drawGround, drawGates, drawTrain, drawRain, hasDifference, primePlates, disposeStage } from './stage.js';
import { Plates, Sprites } from './plates.js';
import { drawSniper, drawShadow } from './figures.js';
import { Panels, drawFrame, drawSplash, drawSight, drawReticle, drawReload, drawCaption, drawPointer } from './panels.js';
import { SfxPool, Ripples, makeParticles, inkBurst, chips } from './fx.js';
import { makeSound } from './sound.js';
import { makeBot } from './bot.js';
import { drawSteam, drawBullet, drawSmoke, drawTrails, drawWalls, drawFront, drawFocusLines } from './draw.js';
import { makeLife, updateLife, startleCats, drawLanterns, drawCats, drawCrows, drawWalkers, strayAt, drawStray } from './life.js';

const QUALITY_AUTO = true; // step the tones down to flat greys if the device cannot hold the frame rate
// the first shots are taught in the world itself: [all, without the depth hint, only the first line]
const capSet = (a, b, c) => ({ all: [a, b, c], noDepth: [a, c], one: [a] });
const CAPS = {
  touch: capSet('DRAG TO AIM · LET GO TO FIRE', 'stick up / down: walk into the street', 'tap FOCUS to steady the line'),
  gamepad: capSet('RIGHT STICK AIMS · RT FIRES', 'stick up / down: walk into the street', 'hold LT to FOCUS'),
  kbm: capSet('CLICK TO FIRE', 'W / S: walk into the street', 'hold RIGHT-CLICK to FOCUS'),
};
const OPENING = 2.6; // both rifles start the round with the bolt open: the cut-in of the hand working it is the starting gun
const RELOAD = 1.5, RELOAD_SD = 1.0, FLASH_CD = 5, FLASH_DIST = 13, SUB_CD = 8.5, SUB_LIFE = 7, SMOKE_LIFE = 3.4, SMOKE_R = 4.4;
const ROUND = 45;
// the camera frames the duel in a few fixed zoom levels, so the baked street (plates.js) can be shown 1:1
const VIS_MAX = 82, VIS_SMALL = 80, VIS_MIN = 38;
const LEVELS = new Map();
function levelsFor(top) {
  let a = LEVELS.get(top);
  if (!a) { a = []; for (let x = top; x > VIS_MIN + 1; x *= 0.9) a.push(Math.round(x * 10) / 10); a.push(VIS_MIN); LEVELS.set(top, a); }
  return a;
}
const r1 = (v) => Math.round(v * 10) / 10;
const wobble = (ph) => 0.62 * Math.sin(ph) + 0.38 * Math.sin(ph * 2.31 + 1.3);

export default {
  id: 'manga',
  name: 'INK DUEL',
  tagline: 'One rain-soaked page. One clean shot.',
  perspective: 'SIDE-ON MANGA STREET',
  renderer: '2d',
  aim: 'pointer',
  palette: { bg: '#16120f', fg: '#f3ead8', accent: '#f3ead8' },
  controls: { move: 'WALK IN / OUT', fire: 'SHOOT', alt: 'FOCUS', a1: 'FLASH STEP', a2: 'DECOY' },
  hint: 'Up and down walk you into the street. Your shot flies where you aim.',
  altToggle: true,
  roundTime: ROUND,
  angleFields: ['a'],

  create(ctx) {
    const world = buildWorld(ctx.rng);
    const sc = buildScenery(world);
    const set = makeSet(world.seed);
    const tones = new Tones();
    const v = makeView();
    const online = ctx.opponent === 'remote';
    const cam = { x: WX / 2, vis: ctx.width < 800 ? VIS_SMALL : VIS_MAX };
    const plates = new Plates(), sprites = new Sprites(), art = { tones, sc, set };
    const snd = makeSound(ctx, (x) => (x - cam.x) / (cam.vis * 0.5));
    const parts = makeParticles(), letters = new SfxPool(14), ripples = new Ripples(34), panels = new Panels(), shake = new Shake(9, 0.01);
    const lim = { x0: 2.5, x1: WX - 2.5 };
    const life = makeLife(world), stray = { x: 0, z: 0, h: 0, rot: 0 };

    const P = [0, 1].map((i) => ({
      i, x: SPAWN[i].x, z: SPAWN[i].z, vx: 0, vz: 0, f: i ? -1 : 1, aim: i ? Math.PI : 0, a: i ? Math.PI : 0, sway: 0.01, swPh: Math.random() * 6, kick: 0,
      reload: 0, rmax: RELOAD, fz: 0, wasF: false, ph: Math.random() * 6, spd: 0, recoil: 0, flash: 0, stun: 0, flashCd: 0, subCd: 0, dash: 0, dx: 0, dz: 0, alive: true,
      col: ctx.players[i].color, remote: online && i !== ctx.me, bot: null, pxv: 0, pzv: 0, stepT: 0, hideA: 1, shots: 0,
    }));
    const env = { bullets: [], decoys: [], smokes: [], sudden: false, lim, hiddenFrom: null };
    const bullets = env.bullets, decoys = env.decoys, smokes = env.smokes, ghosts = [], trails = [];
    env.hiddenFrom = (e, viewer) => hidden(e, viewer);
    for (const p of P) if (!p.remote && (p.i !== ctx.me || ctx.autopilot)) p.bot = makeBot(ctx, world, env);

    const human = { mx: 0, mz: 0, a: 0, fire: false, alt: false, a1: false, a2: false };
    const pos = { x: 0, y: 0 }, uv = { x: 0, z: 0 };
    const S = {
      t: 0, introT: 0, overT: 0, kill: null, sd: false, bulletN: 0, decoyN: 0, trainD: 0, lastTrainD: 0, gustIdx: -1, flash: 0, flashT: 12 + Math.random() * 10,
      lvIdx: 0, lv: ctx.width < 800 ? VIS_SMALL : VIS_MAX, firstShot: false, firstFocus: false, lastRender: 0, ft: 16, slow: 0, wind: 0, steam: 0, shotsMine: 0, readyFlash: 0, bellAt: -1,
    };
    const list = [];
    for (let i = 0; i < 90; i++) list.push({ z: 0, k: 0, o: null });
    let nList = 0, music = false;
    ctx.canvas.style.cursor = 'none';

    const reloadT = () => (ctx.sudden ? RELOAD_SD : RELOAD);
    const layout = () => v.layout(ctx.width, ctx.height, ctx.dpr, cam.x, cam.vis, ctx.input.device === 'touch');
    const colOf = (i) => ctx.players[i].color;

    // is a sniper standing inside a mature smoke cloud (invisible to the other one)?
    function hidden(p, viewer) {
      if (viewer && viewer.i === p.i) return false;
      for (const s of smokes) {
        if (s.age < 0.18 || s.age > s.life - 0.5) continue;
        const r = s.r * Math.min(1, 0.35 + s.age * 2) * 0.72;
        if ((p.x - s.x) * (p.x - s.x) + (p.z - s.z) * (p.z - s.z) < r * r) return true;
      }
      return false;
    }

    // ---- commands ----
    function humanCmd(p) {
      const inp = ctx.input;
      layout();
      let a = inp.aimAngle(v.sx(p.x), v.sy(p.z, CHEST), p.aim);
      if (!Number.isFinite(a)) a = p.aim;
      human.a = a;
      human.mx = inp.moveX; human.mz = inp.moveY;
      human.fire = inp.firePressed; human.alt = inp.alt; human.a1 = inp.a1Pressed; human.a2 = inp.a2Pressed;
      return human;
    }

    function solve(p, r, tallOnly) {
      pos.x = p.x; pos.y = p.z;
      const hit = tallOnly ? pushOutTall(world, pos, r) : pushOut(world, pos, r);
      p.x = pos.x; p.z = pos.y;
      return hit;
    }

    // ---- a locally simulated sniper ----
    function step(p, cmd, dt) {
      const live = ctx.phase === 'live' && p.alive, me = p.i === ctx.me;
      if (Number.isFinite(cmd.a)) p.aim = cmd.a;
      if (Math.abs(Math.cos(p.aim)) > 0.14) p.f = Math.cos(p.aim) >= 0 ? 1 : -1;
      p.reload = Math.max(0, p.reload - dt);
      p.stun = Math.max(0, p.stun - dt); p.flashCd = Math.max(0, p.flashCd - dt); p.subCd = Math.max(0, p.subCd - dt);
      p.recoil = Math.max(0, p.recoil - dt * 4.5); p.flash = Math.max(0, p.flash - dt); p.kick = Math.max(0, p.kick - dt * 0.03);
      const wantF = live && cmd.alt && p.stun <= 0 && p.dash <= 0;
      p.fz = clamp(p.fz + (wantF ? dt / 0.38 : -dt / 0.1), 0, 1);
      if (wantF && !p.wasF && me) { snd.focus(true); S.firstFocus = true; letters.add('シン', p.x, p.z, 38, -0.08, 0.9, { h: 4.8, rise: 1.2, shake: 0.2 }); }
      else if (!wantF && p.wasF && me) snd.focus(false);
      p.wasF = wantF;
      if (me) snd.heart(dt, p.fz);

      const gust = gustAt(world, ctx.time), gk = gust ? gust.power : 0;
      const spdN = clamp(p.spd, 0, 1);
      const hip = (0.018 + 0.03 * spdN + (p.stun > 0 ? 0.05 : 0) + p.kick) * (1 + 1.5 * gk), steady = 0.0035 * (1 + 1.1 * gk) + 0.012 * spdN;
      p.sway = lerp(hip, steady, p.fz * p.fz);
      p.swPh += dt * (2.6 + 2.4 * (1 - p.fz));
      p.a = p.aim + p.sway * wobble(p.swPh);

      let mx = clamp(cmd.mx, -1, 1), mz = clamp(cmd.mz, -1, 1);
      const ml = Math.hypot(mx, mz);
      if (ml > 1) { mx /= ml; mz /= ml; }
      const mul = live ? (1 - 0.62 * p.fz) * (p.stun > 0 ? 0 : 1) : 0;
      const ox = p.x, oz = p.z;
      if (p.dash > 0) {
        const n = 4, h = dt / n;
        for (let k = 0; k < n; k++) { p.x += p.dx * h; p.z += p.dz * h; solve(p, R_WALK, true); }
        p.dash = Math.max(0, p.dash - dt);
        if (p.dash <= 0) solve(p, R_WALK); // and never end inside a scooter
        p.vx = p.dx * 0.15; p.vz = p.dz * 0.15;
      } else {
        p.vx += clamp(mx * V_X * mul - p.vx, -80 * dt, 80 * dt);
        p.vz += clamp(mz * V_Z * mul - p.vz, -80 * dt, 80 * dt);
        p.x += p.vx * dt; p.z += p.vz * dt;
        // the train shoves whoever stands in its way aside: a stun and a stumble, never a kill
        const tr = world.trainRect;
        if (live && tr.x > -900 && p.x > tr.x - R_WALK && p.x < tr.x + tr.w + R_WALK && p.z > tr.y - R_WALK && p.z < tr.y + tr.h + R_WALK) {
          const sg = p.x < XING.x ? -1 : 1;
          p.x = XING.x + sg * (TRAIN.w / 2 + R_WALK + 0.2);
          p.vx = sg * 15; p.stun = 0.9;
          if (me) { shake.add(0.6); letters.add('ドン!', p.x, p.z, 46, 0.1, 0.7, { h: 3.6 }); snd.impact(p.x); }
        }
        solve(p, R_WALK);
      }
      p.x = clamp(p.x, lim.x0, lim.x1);
      p.z = clamp(p.z, 0.9, WZ - 0.9);
      const dtt = Math.max(dt, 1e-4), sp = Math.hypot(p.x - ox, (p.z - oz) * 1.3) / dtt;
      p.spd = damp(p.spd, clamp(sp / V_X, 0, 1.2), 14, dt);
      p.ph += sp * dt * 0.62;
      if (live && sp > 2.2 && p.dash <= 0) {
        p.stepT -= dt * sp * 0.12;
        if (p.stepT <= 0) { p.stepT = 1; ripples.add(p.x, p.z + 0.1, 0.9, 0.5); }
        if (me) snd.step(p.x, dt, p.spd);
      }
      if (!live) return;
      if (me && Math.abs(p.z - SPAWN[p.i].z) > 2.2) S.movedZ = true;
      if (cmd.fire && p.reload <= 0 && p.stun <= 0 && p.dash <= 0) fire(p);
      if (cmd.a1 && p.flashCd <= 0 && p.stun <= 0) flashStep(p, mx, mz);
      if (cmd.a2 && p.subCd <= 0 && p.stun <= 0) substitute(p, mx, mz);
    }

    // The other sniper: copy the interpolated state; everything else (walk cycle, stance) is worked out from it.
    function puppet(p, dt) {
      const r = ctx.net.remote;
      p.recoil = Math.max(0, p.recoil - dt * 4.5); p.flash = Math.max(0, p.flash - dt); p.reload = Math.max(0, p.reload - dt);
      p.flashCd = Math.max(0, p.flashCd - dt); p.subCd = Math.max(0, p.subCd - dt);
      if (!r || !p.alive || !Number.isFinite(r.x) || !Number.isFinite(r.z) || !Number.isFinite(r.a)) return;
      const dx = r.x - p.x, dz = r.z - p.z, jump = Math.hypot(dx, dz) > 4;
      if (dt > 0 && !jump) { p.vx += (dx / dt - p.vx) * Math.min(1, dt * 10); p.vz += (dz / dt - p.vz) * Math.min(1, dt * 10); }
      p.x = r.x; p.z = r.z; p.aim = p.a = r.a;
      p.fz = damp(p.fz, r.fz || 0, 20, dt);
      p.stun = r.st ? 0.3 : 0;
      p.f = r.f < 0 ? -1 : 1;
      const sp = Math.hypot(p.vx, p.vz * 1.3);
      p.spd = damp(p.spd, clamp(sp / V_X, 0, 1.2), 12, dt);
      p.ph += sp * dt * 0.62;
      if (sp > 2.2 && ctx.phase === 'live' && Math.random() < dt * 5) ripples.add(p.x, p.z + 0.1, 0.9, 0.5);
    }

    // ---- the rifle ----
    function fire(p) {
      aimDir(p.a, uv);
      const id = p.i * 1000 + ++S.bulletN, norm = Math.hypot(Math.cos(p.a), Math.sin(p.a) / DY);
      spawnBullet(p.i, p.x, p.z, uv.x, uv.z, true, id, 3.1 * norm);
      p.reload = p.rmax = reloadT();
      p.kick += 0.018;
      p.shots++;
      if (p.i === ctx.me) S.firstShot = true;
      if (online && p.i === ctx.me) ctx.net.send({ k: 'shot', x: r1(p.x), z: r1(p.z), a: +p.a.toFixed(4), id });
    }

    function spawnBullet(owner, x, z, ux, uz, judge, id, adv) {
      let b = null;
      for (const q of bullets) if (!q.live && q.age > 0.3) { b = q; break; }
      if (!b) { b = {}; bullets.push(b); }
      Object.assign(b, { live: true, owner, x, z, ux, uz, judge, id, age: 0, adv, ox: x, oz: z, whiz: false, hx: 0, hz: 0, hitT: 0 });
      const p = P[owner], mine = owner === ctx.me;
      p.recoil = 1; p.flash = 0.09;
      if (p.remote) p.reload = reloadT();
      snd.shot(x, mine);
      startleCats(life, x);
      shake.add(mine ? 0.42 : 0.16);
      panels.fire(mine);
      layout();
      const nx = Math.cos(p.a), ny = Math.sin(p.a), mx = v.sx(x) + nx * 3.2 * v.S, my = v.sy(z, CHEST) + ny * 3.2 * v.S;
      letters.add(mine ? 'ドン!' : 'バン!', x + ux * 6, z + uz * 6, mine ? 54 : 44, (owner ? -1 : 1) * 0.12, 0.55, { h: CHEST + 0.4, rise: 0.8 });
      for (let i = 0; i < 7; i++) parts.emit({ x: mx, y: my, vx: nx * (200 + Math.random() * 320) + (Math.random() - 0.5) * 120, vy: ny * (200 + Math.random() * 320) + (Math.random() - 0.5) * 120, life: 0.22 + Math.random() * 0.2, size: 2.4, color: Math.random() < 0.5 ? C.white : C.ink, shape: 'spark', drag: 4 });
    }

    function stepBullets(dt) {
      const me = P[ctx.me], live = ctx.phase === 'live';
      for (let i = 0; i < bullets.length; i++) {
        const b = bullets[i];
        if (!b.live) { b.age += dt; continue; }
        b.age += dt;
        const L = BULLET_V * dt + b.adv;
        b.adv = 0;
        let hit = 1e9, kind = 0, obj = null;
        const sh = raycastRects(b.x, b.z, b.ux, b.uz, L, world.shield);
        if (sh) { hit = sh.dist; kind = 1; }
        const ex = b.x + b.ux * L, ez = b.z + b.uz * L;
        if (b.z + b.uz * L < -0.5) { const t = (-0.5 - b.z) / b.uz; if (t >= 0 && t < hit) { hit = t; kind = 3; } } // the shopfronts
        for (const d of decoys) {
          if (!d.alive || d.owner === b.owner || d.age < 0.3) continue;
          const t = segCircle(b.x, b.z, ex, ez, d.x, d.z, R_BODY);
          if (t >= 0 && t * L < hit) { hit = t * L; kind = 2; obj = d; }
        }
        const foe = P[1 - b.owner];
        if (b.judge && live && foe.alive && !(online && foe.i === ctx.me)) {
          const t = segCircle(b.x, b.z, ex, ez, foe.x, foe.z, R_BODY);
          if (t >= 0 && t * L < hit) { hit = t * L; kind = 4; obj = foe; }
        }
        // a hostile round passing close to me: a whistle and a rattle
        if (!b.whiz && b.owner !== me.i && me.alive) {
          const rx = me.x - b.x, rz = me.z - b.z, al = clamp(rx * b.ux + rz * b.uz, 0, Math.min(L, hit));
          if (Math.hypot(rx - b.ux * al, rz - b.uz * al) < 3.4) {
            b.whiz = true; snd.whiz(me.x); shake.add(0.22);
            letters.add('ヒュン', b.x + b.ux * al, b.z + b.uz * al, 36, 0.2, 0.6, { h: CHEST + 0.6, rise: 0.5, shake: 0.4 });
          }
        }
        if (kind) {
          b.x += b.ux * hit; b.z += b.uz * hit; b.live = false; b.age = 0;
          layout();
          const sx = v.sx(b.x), sy = v.sy(b.z, CHEST);
          if (kind === 4) ctx.kill(obj.i, { how: howLabel(b, obj) });
          else if (kind === 2) { if (b.judge) popDecoy(obj, true); else { snd.pop(b.x); chips(parts, sx, sy, 6, 160, C.white); } }
          else {
            snd.impact(b.x);
            for (let k = 0; k < 7; k++) parts.emit({ x: sx, y: sy, vx: (Math.random() - 0.5) * 380 - b.ux * 120, vy: (Math.random() - 0.7) * 300, life: 0.25 + Math.random() * 0.25, size: 2.6, color: Math.random() < 0.5 ? C.white : C.ink, shape: 'spark', drag: 3, gravity: 300 });
            inkBurst(parts, sx, sy, 4, 130);
            if (kind === 1 && Math.abs(b.x - me.x) < cam.vis * 0.6) letters.add('カッ', b.x, b.z, 30, (Math.random() - 0.5) * 0.5, 0.45, { h: CHEST + 0.2, rise: 0.4, shake: 0.5 });
            if (kind === 3) ripples.add(b.x, 0.5, 0.8, 0.4);
          }
          continue;
        }
        b.x = ex; b.z = ez;
        if (b.x < -6 || b.x > WX + 6 || b.z > WZ + 2 || b.age > 4) { b.live = false; b.age = 0; if (b.z > WZ + 1.5) ripples.add(b.x, WZ + 1, 1.2, 0.6); }
      }
      for (let i = bullets.length - 1; i > 24; i--) if (!bullets[i].live && bullets[i].age > 0.5) bullets.splice(i, 1);
    }

    function howLabel(b, foe) {
      const m = Math.round(Math.hypot(foe.x - b.ox, foe.z - b.oz)), mv = Math.hypot(foe.vx, foe.vz);
      if (m < 10) return 'POINT BLANK';
      if (mv > 3.6 && m > 26) return `LEAD SHOT ${m} M`;
      if (m >= 60) return `SNIPED ${m} M`;
      return `${m} M`;
    }

    // ---- FLASH STEP: a blink that leaves afterimages ----
    function flashStep(p, mx, mz) {
      let dx = mx, dz = mz;
      if (Math.hypot(dx, dz) < 0.2) { dx = p.f; dz = 0; }
      const l = Math.hypot(dx, dz);
      dx /= l; dz /= l;
      const x0 = p.x, z0 = p.z;
      p.dash = 0.13;
      p.dx = (dx * FLASH_DIST) / 0.13; p.dz = (dz * FLASH_DIST * 0.8) / 0.13;
      p.flashCd = FLASH_CD;
      const ex = clamp(x0 + dx * FLASH_DIST, lim.x0, lim.x1), ez = clamp(z0 + dz * FLASH_DIST * 0.8, 1, WZ - 1);
      markDash(p.i, x0, z0, ex, ez, p.f, p.a);
      if (online && p.i === ctx.me) ctx.net.send({ k: 'dash', x0: r1(x0), z0: r1(z0), x1: r1(ex), z1: r1(ez), f: p.f, a: +p.a.toFixed(3) });
    }
    function markDash(i, x0, z0, x1, z1, f, a) {
      for (let k = 0; k < 4; k++) ghosts.push({ x: x0 + ((x1 - x0) * k) / 4, z: z0 + ((z1 - z0) * k) / 4, f, a, age: -k * 0.012, ph: P[i].ph });
      if (ghosts.length > 16) ghosts.splice(0, ghosts.length - 16);
      trails.push({ x0, z0, x1, z1, age: 0, seed: Math.random() * 9 });
      if (trails.length > 4) trails.shift();
      snd.dash(x0);
      letters.add('ザッ', x0, z0, 50, ((x1 - x0) > 0 ? -0.15 : 0.15), 0.6, { h: 2.2, rise: 0.6 });
    }

    // ---- DECOY: vanish in a puff a few paces away, leaving a paper double in the cloud ----
    function substitute(p, mx, mz) {
      let dx = mx, dz = mz;
      if (Math.hypot(dx, dz) < 0.2) { const e = P[1 - p.i]; dx = e.x > p.x ? -0.8 : 0.8; dz = (p.z < WZ / 2 ? 1 : -1) * 0.4; }
      const l = Math.hypot(dx, dz);
      const nx = clamp(p.x + (dx / l) * 6.5, lim.x0, lim.x1), nz = clamp(p.z + (dz / l) * 5, 1, WZ - 1);
      const id = p.i * 1000 + ++S.decoyN, ox = p.x, oz = p.z;
      p.subCd = SUB_CD;
      p.x = nx; p.z = nz;
      solve(p, R_WALK);
      spawnSub(p.i, id, ox, oz, p.x, p.z);
      if (online && p.i === ctx.me) ctx.net.send({ k: 'sub', id, x: r1(ox), z: r1(oz), nx: r1(p.x), nz: r1(p.z) });
    }
    function spawnSub(owner, id, x, z, nx, nz) {
      const q = P[owner];
      decoys.push({ id, owner, x, z, age: 0, life: SUB_LIFE, alive: true, f: q.f, a: q.aim, col: q.col, sway: Math.random() * 6 });
      smokes.push(makeSmoke(x, z, SMOKE_R), makeSmoke(nx, nz, SMOKE_R * 0.62));
      snd.puff(x);
      layout();
      letters.add('ボン!', x, z, 58, -0.1, 0.8, { h: 3.4, rise: 1.4 });
      const sx = v.sx(x), sy = v.sy(z, 1.6);
      chips(parts, sx, sy, 14, 260, C.white);
      if (decoys.length > 6) decoys.splice(0, decoys.length - 6);
    }
    function makeSmoke(x, z, r) {
      const puffs = [];
      for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + Math.random() * 0.4; puffs.push({ dx: Math.cos(a) * r * (0.35 + Math.random() * 0.4), dz: Math.sin(a) * r * 0.45 * (0.3 + Math.random() * 0.5), rr: 0.5 + Math.random() * 0.35 });
      }
      return { x, z, r, age: 0, life: SMOKE_LIFE, puffs };
    }
    function popDecoy(d, judged) {
      if (!d || !d.alive) return;
      d.alive = false;
      layout();
      const sx = v.sx(d.x), sy = v.sy(d.z, 1.8);
      chips(parts, sx, sy, 22, 320, d.col);
      inkBurst(parts, sx, sy, 8, 200);
      snd.pop(d.x);
      shake.add(0.2);
      letters.add('パン!', d.x, d.z, 52, 0.12, 0.7, { h: 3, rise: 1 });
      if (judged && online) ctx.net.send({ k: 'dpop', id: d.id });
    }

    // ---- the world's own clock: trains, gusts, lightning, steam ----
    function worldClock(dt) {
      const d = syncTrain(world, ctx.time);
      S.trainD = d;
      if (ctx.phase === 'live' || ctx.phase === 'over') {
        if (d < 0 && S.lastTrainD >= 0 || (d < 0 && S.lastTrainD < d - 1)) { letters.add('カンカン', XING.x - 8, 2, 40, -0.1, 1.2, { h: 5.5 }); }
        if (d > 0 && S.lastTrainD <= 0) {
          snd.horn();
          shake.add(0.5);
          letters.add('ゴゴゴゴ', XING.x + 9, 11, 120, 0.06, 2.2, { h: 4, vert: true, shake: 1.4 });
          letters.add('ゴゴゴゴ', XING.x - 9, 6, 90, -0.05, 2, { h: 4, vert: true, shake: 1.2 });
        }
        if (d !== 0) snd.crossing(dt, d);
        if (d > 0 && d < 2.2) shake.add(dt * 0.9);
      }
      S.lastTrainD = d;
      const gu = gustAt(world, ctx.time);
      S.wind = gu ? gu.dir * (gu.warn < 1 ? 0.35 * gu.warn : gu.power) : 0;
      const gi = gu ? world.gusts.findIndex((q) => ctx.time >= q.t - 0.36 && ctx.time <= q.t + q.dur) : -1;
      if (gi >= 0 && gi !== S.gustIdx) { S.gustIdx = gi; snd.gust(); letters.add('ヒュー', cam.x - gu.dir * 14, 6, 58, gu.dir * 0.1, 1.5, { h: 7, vert: false, rise: 0 }); }
      S.t += dt;
      S.flash = Math.max(0, S.flash - dt);
      S.flashT -= dt;
      if (S.flashT <= 0 && ctx.phase !== 'intro') { S.flashT = (ctx.sudden ? 7 : 13) + Math.random() * 12; S.flash = 0.09; S.thunder = 0.6 + Math.random() * 0.8; }
      if (S.thunder > 0 && (S.thunder -= dt) <= 0) snd.thunder();
      snd.rain(dt);
      updateLife(life, dt, S.t, { crow: () => { snd.crow(); letters.add('カァ', cam.x + (Math.random() - 0.5) * cam.vis * 0.5, 2, 34, 0.1, 0.9, { h: 17, rise: 1 }); } });
      // random puddle splashes
      if (Math.random() < dt * 14) ripples.add(Math.max(2, cam.x + (Math.random() - 0.5) * cam.vis), 2.5 + Math.random() * 16, 0.7, 0.55);
    }

    // ---- camera ----
    // Zoom moves in discrete levels (wider at once when the frame no longer holds both snipers, tighter only
    // when there is clear room) and the camera eases between them.
    function camera(dt) {
      const me = P[ctx.me], foe = P[1 - ctx.me];
      const top = ctx.width < 800 ? VIS_SMALL : VIS_MAX, lv = levelsFor(top);
      if (ctx.phase === 'intro') {
        S.introT += dt;
        S.lvIdx = 0;
        S.lv = lv[0];
        cam.vis = lv[0];
        cam.x = (me.x + foe.x) / 2;
        return;
      }
      const sep = Math.abs(me.x - foe.x), need = Math.max(sep * 1.08 + 10, ctx.sudden ? lim.x1 - lim.x0 + 12 : 0), tx = ctx.sudden ? (lim.x0 + lim.x1) / 2 : (me.x + foe.x) / 2;
      let i = Math.min(S.lvIdx, lv.length - 1);
      while (i > 0 && need > lv[i]) i--;
      while (i < lv.length - 1 && need < lv[i + 1] - 1) i++;
      S.lvIdx = i;
      S.lv = lv[i];
      cam.vis = damp(cam.vis, lv[i], 3, dt);
      if (Math.abs(cam.vis - lv[i]) < 0.02) cam.vis = lv[i];
      cam.x = damp(cam.x, tx, 3.2, dt);
      if (cam.vis < WX + 14) cam.x = clamp(cam.x, cam.vis / 2 - 6, WX - cam.vis / 2 + 6);
    }

    // ---- the page ----
    function addList(z, k, o) {
      if (nList >= list.length) return;
      const it = list[nList++];
      it.z = z; it.k = k; it.o = o;
    }

    function render() {
      const g = ctx.g, W = ctx.width, H = ctx.height;
      layout();
      g.fillStyle = C.paper;
      g.fillRect(0, 0, W, H);
      if (v.pw < 48 || v.ph < 48) return; // a window squeezed to nothing: just the paper
      tones.ensure(g, ctx.dpr);
      plates.begin(v);
      sprites.begin();
      watchFrameRate();
      const over = ctx.phase === 'over' && S.kill;
      if (over && S.overT >= 0.09) {
        drawSplash(g, v, S.kill);
        parts.draw(g);
        drawFrame(g, v);
        return;
      }
      const S_ = v.S, st = { t: S.t, trainD: S.trainD, wind: S.wind, flick: 1 };
      g.save();
      g.beginPath();
      g.rect(v.px, v.py, v.pw, v.ph);
      g.clip();
      g.translate(shakeOut.x, shakeOut.y);
      drawBackdrop(g, v, art, st, plates, S.lv);
      drawCrows(g, v, life);
      drawLanterns(g, v, life, S.t, S.wind, sprites, v.pw / S.lv);
      drawCats(g, v, life, S.t);
      drawGround(g, v, art, st, plates, S.lv);
      drawWalkers(g, v, life, S.t);
      ripples.draw(g, v);
      drawGates(g, v, st, false);
      drawTrails(g, v, trails);
      drawWalls(g, v, lim, S.t);

      // everything standing on the street, back to front
      nList = 0;
      for (const c of world.cover) { if (c.x + c.w > cam.x - cam.vis * 0.7 && c.x < cam.x + cam.vis * 0.7) addList(c.z + c.d, 1, c); }
      for (const q of sc.torii) addList(q.z, 2, q);
      for (const p of P) addList(p.z, 3, p);
      for (const d of decoys) if (d.alive) addList(d.z, 4, d);
      for (const b of bullets) if (b.live || b.age < 0.25) addList(b.z, 5, b);
      for (const s of smokes) addList(s.z + s.r * 0.55, 6, s);
      for (const q of ghosts) if (q.age >= 0) addList(q.z, 7, q);
      if (world.trainRect.x > -900) addList(trainHead(S.trainD), 8, null);
      if (strayAt(world, ctx.time, stray)) addList(stray.z, 9, stray);
      for (let i = 1; i < nList; i++) { const it = list[i]; let j = i - 1; while (j >= 0 && list[j].z > it.z) { swapList(j, j + 1); j--; } }
      for (let i = 0; i < nList; i++) drawItem(g, list[i]);
      drawGates(g, v, st, true);
      drawFront(g, v);

      drawRain(g, v, set, frameDt, S.wind, tones.lite ? 2 : ctx.sudden ? 1 : 0);
      parts.draw(g);
      if (ctx.phase === 'live' && P[ctx.me].alive) drawFocusLines(g, v, P[ctx.me].fz, S.t);
      if (S.flash > 0.02) { // lightning: the whole picture goes negative for a few frames
        if (set.diff === undefined) set.diff = hasDifference(g);
        if (set.diff) g.globalCompositeOperation = 'difference';
        g.fillStyle = set.diff ? '#fff' : 'rgba(255,253,246,0.5)';
        g.fillRect(v.px - 20, v.py - 20, v.pw + 40, v.ph + 40);
        g.globalCompositeOperation = 'source-over';
      }
      drawUi(g);
      g.restore();
      letters.draw(g, v);
      panels.draw(g, v, colOf(ctx.me), colOf(1 - ctx.me), ctx.input.device === 'touch');
      drawFrame(g, v);
      if (over && S.overT < 0.09) { g.fillStyle = `rgba(255,253,246,${0.9 * (1 - S.overT / 0.09)})`; g.fillRect(v.px, v.py, v.pw, v.ph); }
    }

    function watchFrameRate() {
      if (!QUALITY_AUTO) return;
      const now = performance.now(), d = now - S.lastRender;
      S.lastRender = now;
      if (d > 250 || d <= 0 || ctx.phase === 'intro') return;
      S.ft += (d - S.ft) * 0.06;
      if (S.ft > 24) { if (++S.slow > 150 && !tones.lite) { tones.lite = true; S.slow = 0; } } else S.slow = Math.max(0, S.slow - 2);
    }

    function swapList(a, b) {
      const A = list[a], B = list[b], z = A.z, k = A.k, o = A.o;
      A.z = B.z; A.k = B.k; A.o = B.o;
      B.z = z; B.k = k; B.o = o;
    }

    // a static drawing (cover, a gate) stamped from its baked sprite
    function spriteFor(key, sh) {
      const Sq = v.pw / S.lv;
      return sprites.get(key, Sq, ctx.dpr, { x0: sh.x0 * Sq, y0: sh.y0 * Sq, x1: sh.x1 * Sq, y1: sh.y1 * Sq }, (q, s) => {
        const was = tones.lite;
        tones.lite = false;
        q.scale(s, s);
        drawSheet(q, sh, tones, s);
        tones.lite = was;
      });
    }

    function stamp(g, key, sh, ax, ay) {
      const dpr = ctx.dpr, sp = spriteFor(key, sh), k = v.S / sp.Sq;
      let x = ax + sp.ox * k, y = ay + sp.oy * k;
      if (k > 0.999 && k < 1.001) { x = Math.round(x * dpr) / dpr; y = Math.round(y * dpr) / dpr; }
      g.drawImage(sp.cv, x, y, (sp.cv.width / dpr) * k, (sp.cv.height / dpr) * k);
    }

    function drawItem(g, it) {
      const S_ = v.S;
      switch (it.k) {
        case 1: {
          const c = it.o, sh = sc.props.get(c.id);
          // contact shadow
          g.fillStyle = 'rgba(22,18,15,0.4)';
          g.beginPath(); g.ellipse(v.sx(c.x + c.w / 2), v.sy(c.z + c.d), c.w * 0.62 * S_, c.d * 0.5 * DY * S_ + 2, 0, 0, TAU); g.fill();
          stamp(g, 'p' + c.id, sh, v.sx(c.x), v.sy(c.z + c.d));
          if (c.kind === 'cart') {
            g.save();
            g.translate(v.sx(c.x), v.sy(c.z + c.d));
            g.scale(S_, S_);
            drawSteam(g, v, S.t, c);
            g.restore();
          }
          break;
        }
        case 2: {
          const q = it.o;
          stamp(g, 't' + q.x, q.sh, v.sx(q.x), v.sy(q.z));
          break;
        }
        case 3: drawPlayer(g, it.o); break;
        case 4: drawDecoy(g, it.o); break;
        case 5: drawBullet(g, v, it.o, colOf(it.o.owner)); break;
        case 6: drawSmoke(g, v, tones, S.t, it.o); break;
        case 7: {
          const q = it.o;
          g.globalAlpha = Math.max(0, 0.7 * (1 - q.age / 0.4));
          drawSniper(g, { sx: v.sx(q.x), sy: v.sy(q.z), S: S_, f: q.f, a: q.a, ph: q.ph, spd: 1, focus: 0, recoil: 0, stun: false, col: C.ink, t: S.t, wind: 0, umb: false, ghost: true, x: q.x, z: q.z });
          g.globalAlpha = 1;
          break;
        }
        case 9: drawStray(g, v, it.o); break;
        default: drawTrain(g, v, tones, trainHead(S.trainD), S.t, sc);
      }
    }


    function drawPlayer(g, p) {
      const me = P[ctx.me];
      const hid = p.i !== me.i && hidden(p, me), inside = p.i === me.i && hidden(p, P[1 - me.i]);
      if (hid || (!p.alive && S.kill && S.overT >= 0.09)) return;
      const sx = v.sx(p.x), sy = v.sy(p.z);
      drawShadow(g, sx, sy, v.S, 1);
      if (inside) g.globalAlpha = 0.5;
      drawSniper(g, { sx, sy, S: v.S, f: p.f, a: p.a, ph: p.ph, spd: Math.min(1, p.spd), focus: p.fz, recoil: p.recoil, stun: p.stun > 0, col: p.col, t: S.t, wind: S.wind, umb: true, x: p.x, z: p.z });
      g.globalAlpha = 1;
      if (p.flash > 0) { // muzzle flash: a jagged white star with an ink core
        const mx = sx + Math.cos(p.a) * 3.5 * v.S, my = sy - CHEST * v.S + Math.sin(p.a) * 3.5 * v.S, k = p.flash / 0.09, R = (1.2 + 1.4 * k) * v.S;
        g.save();
        g.translate(mx, my);
        g.rotate(p.a);
        g.beginPath();
        for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, r = (i & 1 ? 0.35 : 1) * R * (i % 4 === 0 ? 1.6 : 1); g.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.7); }
        g.closePath();
        g.fillStyle = C.white;
        g.fill();
        g.strokeStyle = C.ink;
        g.lineWidth = 2;
        g.stroke();
        g.restore();
      }
    }

    function drawDecoy(g, d) {
      const me = P[ctx.me];
      if (d.owner !== me.i && d.age < 0.5 && hidden({ x: d.x, z: d.z, i: d.owner }, me)) return;
      const fade = clamp((SUB_LIFE - d.age) / 0.8, 0, 1), sx = v.sx(d.x), sy = v.sy(d.z);
      g.globalAlpha = fade * (d.age < 0.4 ? d.age / 0.4 : 1);
      drawShadow(g, sx, sy, v.S, 1);
      drawSniper(g, { sx, sy, S: v.S, f: d.f, a: d.a, ph: 0, spd: 0, focus: 0.3, recoil: 0, stun: false, col: d.col, t: 0, wind: S.wind, umb: true, x: d.x, z: d.z });
      g.globalAlpha = 1;
    }




    // the closing page: black masses with torn edges slide in from both ends in sudden death


    // concentration lines close in from the edges of the page while you focus

    function drawUi(g) {
      const me = P[ctx.me], foe = P[1 - ctx.me], inp = ctx.input;
      const live = ctx.phase === 'live' || ctx.phase === 'intro';
      if (me.alive && ctx.phase !== 'over') {
        // sight line: the true flight path, including this moment's sway
        aimDir(me.a, uv);
        const norm = Math.hypot(Math.cos(me.a), Math.sin(me.a) / DY), mx = v.sx(me.x), my = v.sy(me.z, CHEST);
        let L = lerp(11, 78, me.fz * me.fz);
        const sh = raycastRects(me.x, me.z, uv.x, uv.z, L, world.shield);
        if (sh) L = sh.dist;
        const ex = v.sx(me.x + uv.x * L), ey = v.sy(me.z + uv.z * L, CHEST);
        const x0 = mx + Math.cos(me.a) * 3.6 * v.S, y0 = my + Math.sin(me.a) * 3.6 * v.S;
        drawSight(g, x0, y0, ex, ey, me.fz, L, true);
        if (me.fz > 0.4) { // range ticks every 10 m
          g.strokeStyle = C.ink;
          g.fillStyle = C.ink;
          g.lineWidth = 2;
          g.font = `800 ${ctx.height < 480 ? 12 : 10}px "Arial Narrow", Futura, sans-serif`;
          g.textAlign = 'center';
          for (let d = 10; d < L - 2; d += 10) {
            const tx = v.sx(me.x + uv.x * d), ty = v.sy(me.z + uv.z * d, CHEST), nx = -Math.sin(me.a), ny = Math.cos(me.a);
            g.globalAlpha = Math.min(1, (me.fz - 0.4) * 3);
            g.beginPath(); g.moveTo(tx - nx * 5, ty - ny * 5); g.lineTo(tx + nx * 5, ty + ny * 5); g.stroke();
            if (d % 20 === 0) { g.lineWidth = 3; g.strokeStyle = C.paper; g.strokeText(`${d}`, tx + nx * 13, ty + ny * 13 + 3); g.fillText(`${d}`, tx + nx * 13, ty + ny * 13 + 3); g.lineWidth = 2; g.strokeStyle = C.ink; }
          }
          g.globalAlpha = 1;
        }
        if (sh) { // where it will stop
          g.strokeStyle = C.paper; g.lineWidth = 6; g.beginPath(); g.moveTo(ex - 6, ey - 6); g.lineTo(ex + 6, ey + 6); g.moveTo(ex + 6, ey - 6); g.lineTo(ex - 6, ey + 6); g.stroke();
          g.strokeStyle = C.ink; g.lineWidth = 2.6; g.beginPath(); g.moveTo(ex - 6, ey - 6); g.lineTo(ex + 6, ey + 6); g.moveTo(ex + 6, ey - 6); g.lineTo(ex - 6, ey + 6); g.stroke();
        }
        // reticle follows the pointer on a mouse, sits on the line on touch / pad
        const rx = inp.device === 'kbm' ? inp.pointerX : v.sx(me.x + uv.x * Math.min(L, 14)), ry = inp.device === 'kbm' ? inp.pointerY : v.sy(me.z + uv.z * Math.min(L, 14), CHEST);
        const rr = 9 + me.sway * 520 * (1 - me.fz * 0.5);
        const ready = me.reload <= 0;
        drawReticle(g, rx, ry, Math.min(24, rr), me.fz, ready, S.t, me.col);
        if (!ready) drawReload(g, rx, ry, Math.min(24, rr) + 7, clamp(1 - me.reload / me.rmax, 0, 1));
        // the first shots are taught in the world itself
        if (live && ctx.phase === 'live' && !S.firstShot) {
          const dev = inp.device;
          const cap = CAPS[dev] || CAPS.kbm, lines = S.firstFocus ? cap.one : S.movedZ ? cap.noDepth : cap.all;
          const sz = clamp(v.W / 80, 12, 17);
          drawCaption(g, mx, my - 3.4 * v.S, lines, sz, mx, my - 3.2 * v.S, S.t, v.px + 8, v.px + v.pw - 8);
        }
      }
      // sudden death: beacons
      if (ctx.sudden && ctx.phase !== 'over') {
        for (const p of P) {
          if (!p.alive) continue;
          const x = v.sx(p.x), y = v.sy(p.z, 4.4);
          g.strokeStyle = C.ink; g.lineWidth = 3; g.setLineDash([9, 7]); g.lineDashOffset = -S.t * 30;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x, v.py); g.stroke();
          g.setLineDash([]);
          g.fillStyle = p.col; g.lineWidth = 3; g.lineJoin = 'round';
          g.beginPath(); g.moveTo(x - 10, y - 24 - Math.sin(S.t * 7) * 3); g.lineTo(x + 10, y - 24 - Math.sin(S.t * 7) * 3); g.lineTo(x, y - 6); g.closePath(); g.stroke(); g.fill();
        }
      }
      // where is the other one? an arrow on the edge when they are off the page; a marker over their head in the intro
      const fx = v.sx(foe.x), fy = v.sy(foe.z, 2);
      const off = fx < v.px + 8 || fx > v.px + v.pw - 8;
      if (off && foe.alive && ctx.phase !== 'over') drawPointer(g, v, fx, fy, foe.col, `${Math.round(Math.hypot(foe.x - me.x, foe.z - me.z))} M`);
      if (ctx.phase === 'intro' && S.introT > 0.3 && S.introT < 3.3) {
        const a = clamp(Math.min((S.introT - 0.3) * 3, (3.3 - S.introT) * 3), 0, 1);
        g.globalAlpha = a;
        drawCaption(g, fx, v.sy(foe.z, 4.6) - 4, ['RIVAL'], 13, fx, v.sy(foe.z, 4.2), S.t);
        drawCaption(g, v.sx(me.x), v.sy(me.z, 4.6) - 4, ['YOU'], 13, v.sx(me.x), v.sy(me.z, 4.2), S.t);
        g.globalAlpha = 1;
      }
    }

    // The first frame must not hitch: ink the street's plates and the cover while the world is being built.
    try {
      layout();
      tones.ensure(ctx.g, ctx.dpr);
      plates.begin(v);
      primePlates(v, art, plates, S.lv);
      sprites.left = 1e9;
      for (const c of world.cover) spriteFor('p' + c.id, sc.props.get(c.id));
      for (const q of sc.torii) spriteFor('t' + q.x, q.sh);
      sprites.left = 0;
    } catch (e) { /* the first frame will bake what is missing */ }

    // ---- frame loop ----
    let frameDt = 1 / 60;
    const shakeOut = { x: 0, y: 0 };
    return {
      update(dt) {
        frameDt = dt;
        const over = ctx.phase === 'over';
        if (over) { S.overT += dt / 0.35; if (S.kill) S.kill.t = S.overT; if (S.overT < 0.09) dt = 0; } // hit-stop
        const sh = shake.update(dt);
        shakeOut.x = sh.x; shakeOut.y = sh.y;
        env.sudden = ctx.sudden;
        if (ctx.sudden && !S.sd) {
          S.sd = true;
          snd.music(true);
          letters.add('ゴゴゴ', cam.x - cam.vis * 0.32, 8, 110, -0.05, 2.4, { h: 6, vert: true, shake: 1.5 });
          letters.add('ゴゴゴ', cam.x + cam.vis * 0.32, 8, 110, 0.05, 2.4, { h: 6, vert: true, shake: 1.5 });
        }
        limits(ctx.time, ctx.sudden, ROUND, lim);
        S.sdK = lim.x0;
        worldClock(dt);
        for (const p of P) {
          if (p.remote) puppet(p, dt);
          else if (p.alive) step(p, p.bot ? p.bot(p, P[1 - p.i], dt) : humanCmd(p), dt);
          else { p.vx = p.vz = 0; p.recoil = Math.max(0, p.recoil - dt * 4); p.flash = 0; }
        }
        const me = P[ctx.me];
        ctx.net.sendState({ x: r1(me.x), z: r1(me.z), a: +me.a.toFixed(3), fz: +me.fz.toFixed(2), st: me.stun > 0 ? 1 : 0, f: me.f });
        stepBullets(dt);
        for (let i = decoys.length - 1; i >= 0; i--) { const d = decoys[i]; d.age += dt; if (d.age > SUB_LIFE || (!d.alive && (d.dead = (d.dead || 0) + dt) > 0.1)) decoys.splice(i, 1); }
        for (let i = smokes.length - 1; i >= 0; i--) { smokes[i].age += dt; if (smokes[i].age > smokes[i].life) smokes.splice(i, 1); }
        for (let i = ghosts.length - 1; i >= 0; i--) { ghosts[i].age += dt; if (ghosts[i].age > 0.4) ghosts.splice(i, 1); }
        for (let i = trails.length - 1; i >= 0; i--) { trails[i].age += dt; if (trails[i].age > 0.35) trails.splice(i, 1); }
        parts.update(dt);
        letters.update(dt);
        ripples.update(dt);
        panels.update(dt, me.fz, me.reload, me.rmax, ctx.phase === 'live' && me.alive);
        if (S.readyFlash > 0) S.readyFlash -= dt;
        camera(dt);
        ctx.hud.cooldown('fire', clamp(me.reload / me.rmax, 0, 1));
        ctx.hud.cooldown('a1', me.flashCd / FLASH_CD);
        ctx.hud.cooldown('a2', me.subCd / SUB_CD);
        if (ctx.phase === 'live' && P[ctx.me].alive) {
          const was = S.wasReloading;
          S.wasReloading = me.reload > 0;
          if (was && !S.wasReloading) snd.ready();
          if (!was && S.wasReloading) { /* the bolt cycles over the next 1.5 s */ S.boltT = 0; S.bolt1 = false; }
          if (S.wasReloading) { S.boltT = (S.boltT || 0) + dt; if (!S.bolt1 && S.boltT > 0.45) { S.bolt1 = true; snd.bolt(0, me.x); } if (!S.bolt2 && S.boltT > 0.9) { S.bolt2 = true; snd.bolt(1, me.x); } } else S.bolt2 = false;
        }
      },

      render,

      onPhase(phase) {
        if (phase === 'live') {
          for (const p of P) { p.reload = OPENING; p.rmax = OPENING; }
          if (!music) { music = true; snd.music(false); }
        } else if (phase === 'over') {
          const r = ctx.result;
          if (!r || r.victim < 0) return;
          const vic = P[r.victim], sho = P[1 - r.victim];
          vic.alive = false;
          layout();
          const sgn = sho.x < vic.x ? 1 : -1, m = Math.hypot(vic.x - sho.x, vic.z - sho.z);
          S.kill = { t: 0, sgn, a: sgn > 0 ? 0.06 : Math.PI - 0.06, wcol: sho.col, lcol: vic.col, word: m < 10 ? 'ドン!!' : m > 60 ? 'バン!!' : 'ズドン!!', seed: 5 + (ctx.seed % 50), tones, touch: ctx.input.device === 'touch', vx: v.sx(vic.x), vy: v.sy(vic.z, 1.9) };
          S.overT = 0;
          snd.kill();
          shake.add(1);
          snd.stop();
        }
      },

      onNet(msg) {
        if (!msg || online === false) return;
        const q = P[1 - ctx.me];
        if (msg.k === 'shot') {
          if (![msg.x, msg.z, msg.a].every(Number.isFinite)) return;
          q.a = q.aim = msg.a;
          aimDir(msg.a, uv);
          const norm = Math.hypot(Math.cos(msg.a), Math.sin(msg.a) / DY);
          spawnBullet(q.i, msg.x, msg.z, uv.x, uv.z, false, msg.id, 3.1 * norm);
        } else if (msg.k === 'dash') markDash(q.i, msg.x0, msg.z0, msg.x1, msg.z1, msg.f, msg.a);
        else if (msg.k === 'sub') spawnSub(q.i, msg.id, msg.x, msg.z, msg.nx, msg.nz);
        else if (msg.k === 'dpop') popDecoy(decoys.find((d) => d.id === msg.id), false);
      },

      // a read-only snapshot for the automated tests
      debug: () => ({ me: { x: P[ctx.me].x, z: P[ctx.me].z, a: P[ctx.me].a, reload: P[ctx.me].reload, fz: P[ctx.me].fz, flashCd: P[ctx.me].flashCd, subCd: P[ctx.me].subCd, alive: P[ctx.me].alive }, foe: { x: P[1 - ctx.me].x, z: P[1 - ctx.me].z, alive: P[1 - ctx.me].alive }, bullets: bullets.filter((b) => b.live).length, decoys: decoys.length, vis: cam.vis, lv: S.lv, tiles: plates.baked, touch: ctx.input.device }),

      focus() {
        if (S.kill) return { x: v.px + v.pw * 0.5 + S.kill.sgn * v.pw * 0.015, y: v.py + v.ph * 0.6 };
        const p = P[1 - ctx.me];
        return { x: v.sx(p.x), y: v.sy(p.z, 1.7) };
      },

      dispose() {
        ctx.canvas.style.cursor = '';
        snd.stop();
        bullets.length = decoys.length = smokes.length = ghosts.length = trails.length = 0;
        parts.clear();
        letters.clear();
        plates.dispose();
        sprites.dispose();
        disposeStage();
      },
    };
  },
};
