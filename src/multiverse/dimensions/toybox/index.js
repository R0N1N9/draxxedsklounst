// TOY BOX — an isometric diorama: a child's bedroom floor at dusk, seen from above through
// a tilt-shift lens. Real 3D under an orthographic camera.
//
// THE FANTASY  Two plastic riflemen — one amber, one teal, moulded bases and all — duel across
//   a braided rug: alphabet blocks, a stack of picture books, rows of dominoes, a wooden train
//   going round its loop, and one desk lamp throwing a warm pool of light into the dusk.
// THE RULES    One pellet, one hit. Pellets take a moment to arrive (lead a hopping target),
//   tock off wood ONCE (blocks and the train: bank shots are real), die in books, and knock
//   dominoes down in a chain — cover you can take away. Your laser shows where the barrel is
//   really pointing, and it wanders: a lot on the move, less standing, hardly at all when
//   braced. And it wanders far less at a target that is LIT — so the lamp's pool in the middle
//   is the killing ground and the dark flanks are the way round. Time the swing, or get close.
// THE WORLD    The train is moving cover (and shoves anyone on the track). The lamp sways on
//   its neck, so the pool drifts. Headlights from the street sweep through the blind and light
//   up whoever they cross. All of it is a pure function of the round clock. Nothing but a
//   rival's pellet ever takes a soldier out.
// CONTROLS     move · aim (mouse on the floor / right stick through the camera) · SHOOT ·
//   alt BRACE (kneel: steady, the laser runs its whole length and shows its bounce — but you
//   cannot move) · a1 ROLL (a tumble; pellets pass over you mid-roll) · a2 COPTER (a wind-up
//   helicopter that hunts the rival and holds a spotlight on them for five seconds: the home
//   dimension's spotting drone, here it makes them the easy target wherever they hide).
// THE BOT      hides behind something, leans out, kneels, waits for its laser to cross you,
//   shoots, ducks back and comes closer as the round ages. Its first exchange is ranging fire
//   (never on target before ~9 s). It rolls away from pellets it sees coming, sends the copter
//   when you sit in the dark, and takes snap shots up close.
// THE KILL     the figure bursts into its moulded parts — helmet, rifle, legs, base — which
//   clatter across the floorboards in slow motion while the lens pushes in and swings round.
// SUDDEN DEATH "tidy-up time": the big light comes on (everyone is lit), every toy is put
//   away from the ends inwards, then the rug rolls itself up from both ends and pushes the
//   two of them together on a bare, bright strip.
//
// FILES  world.js (layout, collision, light, the timetable) · geo.js / tex.js / toys.js
//   (modelling) · build.js (the room, lighting, the shared shader patch) · actors.js (soldiers,
//   pellets, lasers, copters, particles) · post.js (tilt-shift, bloom, grade) · view.js (camera,
//   screen <-> floor) · overlay.js (2D) · sound.js · bot.js.
import { clamp, lerp, damp, smoothstep, angDiff, angDamp, segCircle, disposeTree } from '../../kit.js';
import { buildWorld, hit, SPAWN, BODY_R, SPOT_R, MUZZLE, gunY } from './world.js';
import { makeGeo } from './geo.js';
import { makeTextures } from './tex.js';
import { makeToys } from './toys.js';
import { buildRoom } from './build.js';
import { buildActors } from './actors.js';
import { makePost } from './post.js';
import { makeView } from './view.js';
import { makeSfx } from './sound.js';
import { makeBot } from './bot.js';

const SPEED = 5.2, RELOAD = 1.15, PELLET = 62, ROLL_T = 0.36, ROLL_D = 4.6, ROLL_CD = 2.8, COP_CD = 15, COP_LIFE = 5.5, INTRO = 3.6;
const DEG = Math.PI / 180, CM = 3; // a soldier is two inches tall: one unit is about 3 cm
const PLASTIC = ['#f29a14', '#14bdd2']; // the identity colours, as injection-moulded plastic

export default {
  id: 'toybox',
  name: 'TOY BOX',
  tagline: 'Lights out was an hour ago. The war on the rug goes on.',
  perspective: 'ISOMETRIC 3D DIORAMA',
  renderer: 'three',
  aim: 'pointer',
  palette: { bg: '#1b1524', fg: '#f6ead2', accent: '#ff7a4a' },
  controls: { fire: 'SHOOT', alt: 'BRACE', a1: 'ROLL', a2: 'COPTER' },
  hint: 'Brace to steady your aim. Whoever stands in the light is the easy target.',
  altToggle: true,
  roundTime: 50,
  overTime: 2.8,
  angleFields: ['a', 'sa'],

  create(ctx) {
    const { THREE, renderer } = ctx.three;
    // Two builds of the same picture: a software rasteriser gets no reflections, a smaller
    // shadow map and a smaller scene target (and view.js draws it less often).
    const Q = { rich: true, pbr: true, scale: 1, shadow: 2048 };
    try {
      const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext && /swiftshader|llvmpipe|software|basic render/i.test(String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)))) { Q.rich = false; Q.pbr = false; Q.scale = 0.75; Q.shadow = 1024; }
    } catch { /* masked: assume a real GPU */ }
    if (globalThis.__toyboxQ) Object.assign(Q, globalThis.__toyboxQ); // test scripts: force a build
    const names = ctx.players.map((p) => p.name);
    const W = buildWorld(ctx.rng, names);
    const geo = makeGeo(THREE), tex = makeTextures(THREE, renderer, ctx.seed, names, Q.rich), toys = makeToys(THREE, geo);
    const room = buildRoom(THREE, renderer, W, tex, toys, geo, Q);
    const sfx = makeSfx(ctx);
    const fx = buildActors(THREE, room, toys, PLASTIC, ctx.me, Q, sfx);
    const post = makePost(THREE, renderer, { msaa: Q.rich, scale: Q.scale, cap: Q.rich ? 5.4e6 : 3.5e5 });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = Q.rich ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;

    // ---- the two snipers. Player 0 always starts on the left. ----
    const P = [0, 1].map((i) => ({
      i, x: SPAWN[i].x, z: SPAWN[i].z, vx: 0, vz: 0, a: i ? Math.PI : 0, shotA: i ? Math.PI : 0, sway: 0, amp: 2.6 * DEG, swayT: i * 3.3, k: 0, kWant: 0,
      roll: -1, rdx: 1, rdz: 0, rollCd: 0, copCd: 5, reload: 0, reloadMax: RELOAD, recoil: 0, kickA: 0, hop: 0, wob: 0, lit: 0, alive: true,
      remote: ctx.opponent === 'remote' && i !== ctx.me, bot: null, cmd: { mx: 0, mz: 0, a: i ? Math.PI : 0, fire: false, alt: false, a1: false, a2: false },
    }));
    const me = P[ctx.me], foe = P[1 - ctx.me];
    const pellets = [];
    for (let i = 0; i < 6; i++) pellets.push({ on: false, id: 0, owner: 0, judge: false, x: 0, y: 1, z: 0, vx: 0, vz: 0, sp: PELLET, age: 0, trav: 0, bounced: false, near: false });
    const cop = [0, 1].map(() => ({ on: 0, x: 0, y: 0, z: 0, yaw: 0, t: 0, lit: 0, tilt: 0 }));
    const aims = [0, 1].map(() => ({ on: false, stub: false, full: 0, w: 0.06, len: 0, x1: 0, z1: 0, bx: 0, bz: 0, hasB: false }));
    const clacks = [];
    const flags = { shots: 0, firstShotT: -1, braced: 0, introOn: false };
    let T = -INTRO, introClock = 0, tick = 0, pelId = 0, killInfo = null, chuffT = 0, tootN = 0, carOn = false, sudMsg = -1;

    const mk = () => ({ x: 0, y: 0, hx: 0, hy: 0, color: '#fff', alive: true });
    const S = {
      w: 1, h: 1, t: 0, safe: ctx.safe, top: 56, device: 'kbm', live: false, sudden: false, intro: 0, prompt: 0, step: 0, spotted: 0, litTag: 0, stuck: 0, foeLit: 0,
      me: mk(), foe: mk(), cursor: { on: false, x: 0, y: 0, r: 8, px: 0, py: 0, ready: true, fill: 1, cm: '' }, note: { a: 0, x: 0, y: 0, wx: 0, wz: 0, bold: '', rest: '', color: '#2b2f3a' },
    };
    const view = makeView(ctx, THREE, renderer, { room, post, P, W, Q, S });
    const G = { time: () => T, pellets };
    const brain = makeBot(ctx, W, G);
    for (const p of P) if (!p.remote && (p.i !== ctx.me || ctx.autopilot)) p.bot = brain.create(p);
    const v2 = { x: 0, z: 0 }, s2 = { x: 0, y: 0 };
    const note = (x, z, bold, rest, color, dur = 2.2) => { const n = S.note; n.wx = x; n.wz = z; n.bold = bold; n.rest = rest; n.color = color; n.a = dur; };

    // ---- shooting ----
    function spawnPellet(owner, x, z, y, a, judge) {
      const b = pellets.find((q) => !q.on) || pellets[0];
      b.on = true; b.id = ++pelId; b.owner = owner; b.judge = judge; b.x = x; b.y = y; b.z = z; b.sp = PELLET;
      b.vx = Math.cos(a) * PELLET; b.vz = Math.sin(a) * PELLET; b.age = 0; b.trav = 0; b.bounced = false; b.near = false;
    }
    // Somebody fired: the flash, the report, the kick.
    function report(p, a, y) {
      const dx = Math.cos(a), dz = Math.sin(a);
      fx.muzzle(p.x + dx * (MUZZLE + 0.05), y, p.z + dz * (MUZZLE + 0.05), dx, dz, p.i);
      sfx.shot(p.x, p === me);
      p.recoil = 1; p.kickA = 1;
      if (p === me) { view.kick(1); view.shake(0.24); } else view.shake(0.08);
    }
    function shoot(p) {
      const a = p.shotA, y = gunY(p.k);
      spawnPellet(p.i, p.x, p.z, y, a, true);
      p.reload = p.reloadMax = RELOAD;
      report(p, a, y);
      if (p === me && !flags.shots++) flags.firstShotT = T;
      ctx.net.send({ k: 's', x: +p.x.toFixed(2), z: +p.z.toFixed(2), a: +a.toFixed(4), y: +y.toFixed(2) });
    }
    function topple(row, i, sgn) {
      if (!row || !row.row) return;
      const n0 = row.row.hi - row.row.lo + 1;
      if (!W.topple(row, i, sgn, T)) return;
      const n = n0 - (row.row.hi - row.row.lo + 1);
      for (let k = 0; k < n; k++) clacks.push({ t: T + 0.12 + k * 0.075, x: row.x, k });
    }
    function scored(b, v, dx, dz, th) {
      const cm = Math.round((b.trav + th) * CM);
      const how = b.bounced ? `RICOCHET · ${cm} CM` : cm >= 78 ? `LONG SHOT · ${cm} CM` : cm <= 15 ? 'POINT BLANK' : `${cm} CM`;
      killInfo = { v: v.i, dx, dz };
      ctx.net.send({ k: 'k', v: v.i, dx: +dx.toFixed(3), dz: +dz.toFixed(3) });
      ctx.kill(v.i, { how });
    }

    function stepPellets(dt) {
      for (let n = 0; n < pellets.length; n++) {
        const b = pellets[n];
        if (!b.on) continue;
        b.age += dt;
        let rem = b.sp * dt;
        for (let guard = 0; guard < 4 && rem > 1e-4 && b.on; guard++) {
          const dx = b.vx / b.sp, dz = b.vz / b.sp, tw = W.cast(b.x, b.z, dx, dz, rem, 0.08), s = hit.s, nx = hit.nx, nz = hit.nz, e = P[1 - b.owner];
          if (e.alive && ctx.phase === 'live') {
            // Mid-tumble a soldier is off the ground and out of the way.
            if (b.judge && !(e.roll >= 0.1 && e.roll <= 0.85)) {
              const u = segCircle(b.x, b.z, b.x + dx * tw, b.z + dz * tw, e.x, e.z, (e.k > 0.5 ? 0.54 : 0.6) + 0.1);
              if (u >= 0) { b.on = false; scored(b, e, dx, dz, u * tw); break; }
            }
            if (!b.near && b.trav > 2) {
              const al = clamp((e.x - b.x) * dx + (e.z - b.z) * dz, 0, tw), ox = b.x + dx * al - e.x, oz = b.z + dz * al - e.z;
              if (ox * ox + oz * oz < 2.6 && al > 0 && al < tw) { b.near = true; if (e === me && !me.bot) { sfx.whiz(me.x); view.shake(0.16); } }
            }
          }
          if (!s) { b.x += dx * rem; b.z += dz * rem; b.trav += rem; break; }
          const hx = b.x + dx * tw, hz = b.z + dz * tw;
          b.trav += tw; rem -= tw;
          fx.ping(hx, b.y, hz, nx, nz, s.mat);
          sfx.ping(hx, s.mat);
          if (s.mat === 'wood' && !b.bounced) {
            // One bounce off wood, and it comes off a little slower.
            const d = 2 * (dx * nx + dz * nz);
            b.sp *= 0.85; rem *= 0.85;
            b.vx = (dx - d * nx) * b.sp; b.vz = (dz - d * nz) * b.sp;
            b.x = hx + nx * 0.04; b.z = hz + nz * 0.04; b.bounced = true;
          } else {
            b.on = false;
            if (s.mat === 'domino' && b.judge) {
              const i = W.dominoAt(s, hx, hz), sg = dx * Math.cos(s.rot) + dz * Math.sin(s.rot) >= 0 ? 1 : -1;
              topple(s, i, sg);
              ctx.net.send({ k: 'd', r: s.id, i, s: sg });
            }
          }
        }
        if (b.on && (b.age > 1.3 || Math.abs(b.x) > 36 || b.z < -24 || b.z > 22)) { b.on = false; fx.skid(b.x, b.z); }
      }
    }

    // ---- the copters ----
    function launch(i) {
      const c = cop[i], p = P[i];
      c.on = 1; c.x = p.x; c.z = p.z; c.y = 1.6; c.t = 0; c.lit = 0; c.tilt = 1;
      sfx.copterOut(p.x);
      if (i === ctx.me && !me.bot) note(p.x, p.z, 'COPTER AWAY', 'it will light them up', PLASTIC[i]);
    }
    function stepCopters(dt) {
      for (let i = 0; i < 2; i++) {
        const c = cop[i], e = P[1 - i], sp = W.spots[i];
        if (!c.on) { sp.on = 0; sfx.buzz(i, false); continue; }
        c.t += dt;
        const dx = e.x - c.x, dz = e.z - c.z, d = Math.hypot(dx, dz);
        if (c.on === 1) {
          // out: up and across, nose down
          c.y = Math.min(5.4, c.y + dt * 7);
          const v = Math.min(d, 17 * dt);
          if (d > 1e-3) { c.x += (dx / d) * v; c.z += (dz / d) * v; c.yaw = Math.atan2(dz, dx); }
          c.lit = damp(c.lit, d < 5 ? 1 : 0, 6, dt);
          if (d < 0.6 || c.t > 5) { c.on = 2; c.t = 0; if (e === me && !me.bot) sfx.spotted(); }
        } else if (c.on === 2) {
          // over them: it keeps up with a walk, but a roll gets out from under it for a moment
          const v = Math.min(d, 6.4 * dt);
          if (d > 1e-3) { c.x += (dx / d) * v; c.z += (dz / d) * v; }
          c.yaw += dt * 0.9; c.tilt = damp(c.tilt, 0, 4, dt); c.lit = damp(c.lit, 1, 8, dt);
          if (c.t > COP_LIFE || !e.alive) { c.on = 3; c.t = 0; }
        } else {
          // the spring has run down
          c.lit = damp(c.lit, 0, 7, dt); c.tilt = damp(c.tilt, 0, 4, dt);
          c.y = Math.max(0.72, c.y - dt * 4.4 * Math.min(1, c.t * 1.6));
          c.yaw += dt * Math.max(0, 2.4 - c.t * 2);
          if (c.t > 3) { c.on = 0; fx.pop(c.x, 1, c.z); sfx.pop(c.x); }
        }
        sp.on = c.lit; sp.x = c.x; sp.z = c.z;
        sfx.buzz(i, c.on !== 3 || c.t < 1, c.x, c.on === 3 ? Math.max(0, 1 - c.t) : 1);
      }
    }

    // ---- one sniper, one slice of time ----
    // `first`: trigger pulls are spent once, however many slices a frame is cut into.
    function humanCmd(p, first, dt) {
      const inp = ctx.input, c = p.cmd, y = gunY(p.k);
      view.moveDir(inp.moveX, inp.moveY, v2);
      c.mx = v2.x; c.mz = v2.z;
      if (inp.device === 'kbm') {
        view.toFloor(inp.pointerX, inp.pointerY, y, v2);
        if (Math.hypot(v2.x - p.x, v2.z - p.z) > 0.4) c.a = Math.atan2(v2.z - p.z, v2.x - p.x);
      } else if (Math.hypot(inp.stickX, inp.stickY) > 0.25) {
        view.floorDir(inp.stickX, inp.stickY, v2);
        let a = Math.atan2(v2.z, v2.x);
        // A thumb is not a mouse: within a few degrees of the rival, lean the barrel their way.
        const e = P[1 - p.i], d = angDiff(a, Math.atan2(e.z - p.z, e.x - p.x));
        if (e.alive && Math.abs(d) < 0.16) a += d * 0.6 * (1 - Math.abs(d) / 0.16);
        c.a = angDamp(p.a, a, 20, dt || 0.016);
      }
      c.fire = first && inp.firePressed; c.alt = inp.alt; c.a1 = first && inp.a1Pressed; c.a2 = first && inp.a2Pressed;
      return c;
    }

    function step(p, c, dt) {
      const live = ctx.phase === 'live', e = P[1 - p.i];
      p.recoil = Math.max(0, p.recoil - dt * 5);
      p.kickA = Math.max(0, p.kickA - dt * 2.6);
      p.wob = Math.max(0, p.wob - dt * 2.2);
      if (!p.alive) return;
      p.a = c.a;
      if (live) {
        p.rollCd = Math.max(0, p.rollCd - dt);
        p.copCd = Math.max(0, p.copCd - dt);
        const ox = p.x, oz = p.z;
        if (c.a1 && p.rollCd <= 0 && p.roll < 0) {
          let dx = c.mx, dz = c.mz;
          const l = Math.hypot(dx, dz);
          if (l > 0.3) { dx /= l; dz /= l; } else { dx = Math.cos(p.a); dz = Math.sin(p.a); }
          p.roll = 0; p.rdx = dx; p.rdz = dz; p.rollCd = ROLL_CD;
          sfx.roll(p.x);
        }
        const wantK = c.alt && p.roll < 0 ? 1 : 0;
        if (wantK !== p.kWant) { p.kWant = wantK; sfx.kneel(p.x, !!wantK); }
        p.k = clamp(p.k + (wantK ? dt / 0.2 : -dt / 0.14), 0, 1);
        if (p.roll >= 0) {
          p.k = 0;
          p.roll += dt / ROLL_T;
          p.x += p.rdx * (ROLL_D / ROLL_T) * dt; p.z += p.rdz * (ROLL_D / ROLL_T) * dt;
          if (p.roll >= 1) { p.roll = -1; fx.hop(p.x, p.z); }
        } else if (p.k < 0.3) {
          let mx = c.mx, mz = c.mz;
          const l = Math.hypot(mx, mz), v = SPEED * (1 - (p.k / 0.3) * 0.7);
          if (l > 1) { mx /= l; mz /= l; }
          p.x += mx * v * dt; p.z += mz * v * dt;
        }
        // The train does not stop for anyone: it shoves, and the shove spoils your aim.
        if (W.walk(p, BODY_R) && p.roll < 0) { if (p.wob < 0.3) sfx.shove(p.x); p.wob = 1; p.kickA = Math.max(p.kickA, 0.7); }
        if (dt > 0) { p.vx = (p.x - ox) / dt; p.vz = (p.z - oz) / dt; }
        p.hop += Math.hypot(p.vx, p.vz) * dt * 2.3;
        if (p.reload > 0) {
          const before = p.reload;
          p.reload -= dt;
          if (before > 0.5 && p.reload <= 0.5 && p === me) sfx.cock(p.x);
        }
        if (c.fire) { if (p.reload <= 0 && p.roll < 0) shoot(p); else if (p === me && !p.bot) sfx.dry(); }
        if (c.a2 && p.copCd <= 0) { p.copCd = COP_CD; launch(p.i); ctx.net.send({ k: 'c' }); }
      } else p.vx = p.vz = 0;
      // The barrel wanders: most on the move, least braced — and much less at a rival who is lit.
      const sp = Math.hypot(p.vx, p.vz), stance = p.roll >= 0 ? 7 : sp > 0.8 ? 5.2 : lerp(2.6, 0.9, p.k);
      const want = stance * DEG * lerp(1, 0.28, e.alive ? e.lit : 0) + p.kickA * 3 * DEG;
      p.amp = damp(p.amp, want, want > p.amp ? 14 : 3.6, dt);
      p.swayT += dt;
      p.sway = p.amp * (0.62 * Math.sin(p.swayT * 1.9 + p.i * 2.1) + 0.38 * Math.sin(p.swayT * 3.13 + p.i + 1.3));
      p.shotA = p.a + p.sway;
    }

    function puppet(p, dt) {
      p.recoil = Math.max(0, p.recoil - dt * 5);
      p.wob = Math.max(0, p.wob - dt * 2.2);
      const r = ctx.net.remote;
      if (!r) return;
      p.x = r.x; p.z = r.z; p.a = r.a; p.shotA = r.sa; p.k = r.k; p.roll = r.ro ? r.rp : -1; p.rdx = r.rx; p.rdz = r.rz; p.vx = r.vx; p.vz = r.vz; p.reload = r.rl;
      p.hop += Math.hypot(p.vx, p.vz) * dt * 2.3;
    }

    // Where a soldier's laser goes: to the first thing it meets and, when braced, on off the wood.
    function aimOf(p) {
      const A = aims[p.i], e = P[1 - p.i];
      A.on = p.alive && ctx.phase !== 'over' && (p === me || p.k > 0.5); // a rival's laser shows only when they have knelt to use it
      A.stub = p === me; A.full = smoothstep(0.3, 0.9, p.k); A.w = Math.max(0.055, 1.5 / view.pxPerUnit); A.hasB = false;
      if (!A.on) return A;
      const dx = Math.cos(p.shotA), dz = Math.sin(p.shotA);
      let t = W.cast(p.x, p.z, dx, dz, 46, 0.05), s = hit.s;
      const nx = hit.nx, nz = hit.nz;
      if (e.alive) { const u = segCircle(p.x, p.z, p.x + dx * t, p.z + dz * t, e.x, e.z, 0.6); if (u >= 0) { t *= u; s = null; } }
      A.len = t - MUZZLE; A.x1 = p.x + dx * t; A.z1 = p.z + dz * t;
      if (A.len < 0.3) { A.on = false; return A; }
      if (s && s.mat === 'wood' && A.full > 0.02) {
        const d = 2 * (dx * nx + dz * nz), rx = dx - d * nx, rz = dz - d * nz, ox = A.x1 + nx * 0.03, oz = A.z1 + nz * 0.03;
        let t2 = W.cast(ox, oz, rx, rz, 24, 0.05);
        if (e.alive) { const u = segCircle(ox, oz, ox + rx * t2, oz + rz * t2, e.x, e.z, 0.6); if (u >= 0) t2 *= u; }
        A.bx = ox + rx * t2; A.bz = oz + rz * t2; A.hasB = true;
      }
      return A;
    }

    function fell(v) {
      const w = P[1 - v.i];
      let dx = killInfo && killInfo.v === v.i ? killInfo.dx : v.x - w.x, dz = killInfo && killInfo.v === v.i ? killInfo.dz : v.z - w.z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      v.alive = false;
      fx.burst(v.i, v.x, v.z, v.shotA, dx, dz, v.k > 0.5);
      sfx.burst(v.x);
      view.killCam(v);
    }

    // ---- one slice of the simulation at world time `now` ----
    function frame(dt, now, first) {
      const phase = ctx.phase;
      T = now;
      if (ctx.sudden && W.suddenAt < 0 && phase === 'live') { W.beginSudden(T); sfx.lightsOn(); sfx.music(true); sudMsg = 2.7; view.shake(0.3); }
      W.setTime(T);
      tick ^= 1; // neither sniper always moves first
      for (let n = 0; n < 2; n++) {
        const p = P[n ^ tick];
        if (p.remote) puppet(p, dt);
        else step(p, !p.bot ? humanCmd(p, first, dt) : p.alive && phase === 'live' ? brain.think(p, P[1 - p.i], dt, p.cmd) : p.cmd, dt);
        p.lit = damp(p.lit, W.light(p.x, p.z), 9, dt);
      }
      if (phase !== 'intro') stepPellets(dt);
      stepCopters(dt);
      // What the room sounds like.
      if ((chuffT -= dt) <= 0) { chuffT = 0.44; if (W.cars[0].on) sfx.chuff(W.cars[0].x); }
      if (T > 0 && Math.floor((T + 4) / 12) !== tootN) { tootN = Math.floor((T + 4) / 12); if (W.cars[0].on) sfx.toot(W.cars[0].x); }
      if (W.head.k > 0 && !carOn) { carOn = true; sfx.car(Math.sign(W.head.p) || 1); } else if (W.head.k <= 0) carOn = false;
      for (let i = clacks.length - 1; i >= 0; i--) if (T >= clacks[i].t) { sfx.domino(clacks[i].x, clacks[i].k); clacks.splice(i, 1); }
      if (sudMsg > 0 && (sudMsg -= dt) <= 0) ctx.hud.message('TIDY-UP TIME', 'The big light is on · the rug is rolling up', 3);
    }

    // ---- everything the picture needs, once per update ----
    function present(dt) {
      const phase = ctx.phase, live = phase === 'live';
      view.update(dt, phase === 'over');
      room.update(dt, T, view.wt, view.camera, view.pxPerUnit * post.scale, fx);
      for (const p of P) fx.soldier(p, dt, view.wt, aimOf(p), live);
      for (let i = 0; i < pellets.length; i++) fx.pellet(i, pellets[i]);
      for (let i = 0; i < 2; i++) fx.copter(i, cop[i], dt, view.wt);
      fx.update(dt, view.pxPerUnit * post.scale, renderer.getPixelRatio());

      // HUD state
      const inp = ctx.input, human = !me.bot;
      S.t = view.wt; S.device = inp.device; S.live = live; S.sudden = ctx.sudden; S.top = ctx.height < 480 ? 34 : 60;
      for (const [p, o] of [[me, S.me], [foe, S.foe]]) {
        view.toScreen(p.x, 0, p.z, s2); o.x = s2.x; o.y = s2.y;
        view.toScreen(p.x, lerp(2.55, 2.0, p.k), p.z, s2); o.hx = s2.x; o.hy = s2.y;
        o.color = PLASTIC[p.i]; o.alive = p.alive;
      }
      S.intro = damp(S.intro, phase === 'intro' && flags.introOn ? 1 : 0, 7, dt);
      if (me.k > 0.8 && live) flags.braced += dt;
      const since = T - flags.firstShotT;
      S.step = flags.shots ? 1 : 0;
      const aiming = inp.device !== 'kbm' && Math.hypot(inp.stickX, inp.stickY) > 0.25; // (the thumb is already where the words are)
      S.prompt = damp(S.prompt, human && live && me.alive && !aiming && (!flags.shots || (flags.braced < 0.3 && since > 1.4 && since < 11)) ? 1 : 0, 8, dt);
      const spotted = cop[foe.i].on > 0 && cop[foe.i].lit > 0.4 && Math.hypot(me.x - cop[foe.i].x, me.z - cop[foe.i].z) < SPOT_R + 0.5;
      S.spotted = damp(S.spotted, spotted && human ? 1 : 0, 10, dt);
      S.litTag = damp(S.litTag, human && me.lit > 0.55 && !ctx.sudden && !spotted ? 1 : 0, 6, dt);
      S.stuck = damp(S.stuck, human && me.k > 0.5 && Math.hypot(inp.moveX, inp.moveY) > 0.5 ? 1 : 0, 10, dt);
      S.foeLit = cop[me.i].on === 2 ? 1 - cop[me.i].t / COP_LIFE : 0;
      if (S.note.a > 0) { S.note.a -= dt; view.toScreen(S.note.wx, 2, S.note.wz, s2); S.note.x = s2.x; S.note.y = s2.y; }
      const c = S.cursor;
      c.on = inp.device === 'kbm' && human && me.alive && phase !== 'over';
      if (c.on) {
        const y = gunY(me.k);
        view.toFloor(inp.pointerX, inp.pointerY, y, v2);
        const d = Math.hypot(v2.x - me.x, v2.z - me.z);
        view.toScreen(me.x, y, me.z, s2);
        c.x = inp.pointerX; c.y = inp.pointerY;
        c.r = me.amp * Math.hypot(c.x - s2.x, c.y - s2.y);
        view.toScreen(me.x + Math.cos(me.shotA) * d, y, me.z + Math.sin(me.shotA) * d, s2);
        c.px = s2.x; c.py = s2.y;
        c.ready = me.reload <= 0; c.fill = 1 - me.reload / me.reloadMax;
        c.cm = live ? `${Math.round(d * CM)} CM` : '';
      }
      ctx.hud.cooldown('fire', me.reload > 0 ? me.reload / me.reloadMax : 0);
      ctx.hud.cooldown('a1', me.rollCd / ROLL_CD);
      ctx.hud.cooldown('a2', me.copCd / COP_CD);
      ctx.net.sendState({
        x: +me.x.toFixed(2), z: +me.z.toFixed(2), a: +me.a.toFixed(3), sa: +me.shotA.toFixed(3), k: +me.k.toFixed(2), ro: me.roll >= 0, rp: +Math.max(0, me.roll).toFixed(2),
        rx: +me.rdx.toFixed(2), rz: +me.rdz.toFixed(2), vx: +me.vx.toFixed(1), vz: +me.vz.toFixed(1), rl: +Math.max(0, me.reload).toFixed(2),
      });
    }

    const inst = {
      // The core clamps a frame's step but the round clock keeps real time: a client that draws
      // slowly would fall behind its own world (and its opponent). So a live frame simulates
      // however long the clock says has passed, in slices short enough for the collision code.
      update(dt) {
        const phase = ctx.phase;
        if (phase === 'live') {
          const t0 = Math.max(0, T), span = Math.max(0, ctx.time - t0), n = clamp(Math.ceil(span / 0.034), 1, me.bot ? 80 : 6);
          for (let i = 1; i <= n && (i === 1 || ctx.phase === 'live'); i++) frame(Math.min(span / n, 0.05), t0 + (span * i) / n, i === 1);
        } else if (phase === 'intro') {
          // The world runs up to zero, so the train is already moving when the count ends.
          if (flags.introOn) introClock += dt;
          frame(dt, Math.min(0, introClock - INTRO), true);
        } else frame(dt, T + dt, true);
        present(dt);
      },

      render() { view.render(); },
      resize() { view.resize(); },

      onPhase(phase) {
        if (phase === 'intro') { flags.introOn = true; introClock = 0; view.beginIntro(); }
        else if (phase === 'live') { sfx.music(false); view.poke(); }
        else if (phase === 'over') {
          const r = ctx.result;
          if (r && r.victim >= 0) fell(P[r.victim]);
        }
      },

      onNet(msg) {
        if (msg.k === 's') { spawnPellet(foe.i, msg.x, msg.z, msg.y, msg.a, false); report(foe, msg.a, msg.y); }
        else if (msg.k === 'd') topple(W.solids[msg.r], msg.i, msg.s > 0 ? 1 : -1);
        else if (msg.k === 'c') launch(foe.i);
        else if (msg.k === 'k') killInfo = { v: msg.v & 1, dx: msg.dx, dz: msg.dz };
      },

      focus() { return view.focus(); },

      dispose() {
        sfx.dispose();
        renderer.setRenderTarget(null);
        renderer.shadowMap.enabled = false;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        post.dispose();
        fx.dispose();
        room.dispose();
        toys.dispose();
        tex.dispose();
        disposeTree(room.scene);
      },
    };
    inst.debug = { P, W, cop, pellets, view, flags, S, room, fx, post, Q }; // test scripts only
    post.resize();
    return inst;
  },
};
