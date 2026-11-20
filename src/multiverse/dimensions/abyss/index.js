// THE DEEP — first person, under water, over a reef wall that drops into the abyss.
//
// THE FANTASY  Two rival spearfishers hunt each other over a sunlit reef: a kelp forest on
//   the shelf, coral heads and rock arches, a sunken trawler on a ledge halfway down the
//   wall, and below it all a blue-black deep where something enormous is moving.
// THE RULES    One spear wins the point. Spears are slow (52 m/s, losing speed to drag)
//   and sink, so a long shot needs lead on a swimming diver and hold-over for the drop;
//   up close it is point and shoot. One spear loaded at a time; the reload is a real one
//   (2.3 s, two bands hauled back by hand). You breathe out every few seconds and the
//   bubbles rise above any cover: that is how divers find each other. HOLD BREATH (alt)
//   zooms, stills the sway and stops your bubbles — but it slows you, your air runs out,
//   and letting go blows one big tell.
// CONTROLS     SWIM where you look (move) · aim · SHOOT · alt HOLD BREATH · a1 SONAR (a
//   pulse outlines the other diver through rock and murk for two seconds; they hear it and
//   see where it came from) · a2 DECOY (a glow-stick that drifts away breathing bubbles in
//   your colour) · jump KICK UP.
// THE WORLD    Shoals mill and part, a turtle, a manta, a curious shark, jellyfish and
//   anglers glowing in the deep. The kraken (kraken.js) patrols below on a timetable both
//   clients share: it reaches two tentacles up through the open water as moving walls, and
//   twice a round it rises and glides over the arena, its shadow cutting the light and its
//   arms dragging through the fight. Arms shove and spin you; a spear in it jets ink. It
//   never kills.
// THE BOT      bot.js: knows what a diver could know (sight through murk, kelp and ink;
//   bubbles; sonar), works from post to post, holds its breath for the long shot, leads
//   and holds over, dodges spears it sees, pings and drops decoys.
// THE KILL     slow motion: the spear's bubble trail hangs in the water, the victim's mask
//   and fins drift off as they tumble up through the light in a column of bubbles, the
//   fish burst away and the kraken's eye rolls round to watch.
// SUDDEN DEATH both divers glow through everything, and the kraken settles under the
//   wreck and raises all eight arms round the arena in a ring that closes to 12 m.
//
// FILES  world.js (layout, colliders, queries) · kraken.js (the animal: motion, collision,
//   meshes) · build.js (reef meshes) · life.js · diver.js · fx.js · shaders.js (the water) ·
//   textures.js · post.js (HDR, shadow map, light shafts, bloom, lens) · view.js (camera,
//   intro, kill cam, quality) · overlay.js (HUD) · bot.js · sound.js.
import { clamp, lerp, damp, angDiff, gauss, disposeTree, hexToRgb } from '../../kit.js';
import { buildWorld, SPAWN, ARENA, RADIUS, rayWorld, hit, collide, boundsPush, kelpAlong, heightAt } from './world.js';
import { makeKrakenSim, buildKraken, ROUND, CAGE_C } from './kraken.js';
import { makeTextures } from './textures.js';
import { makeShared, makeMaterials } from './shaders.js';
import { buildReef } from './build.js';
import { buildLife } from './life.js';
import { makeDiverKit, makeDiver, makeViewModel } from './diver.js';
import { Cloud, makeSnow, Ribbon, makeShell, spearGeometry } from './fx.js';
import { makeView } from './view.js';
import { makeBot } from './bot.js';
import { makeSound } from './sound.js';

const LOOK = 0.0022;
const V0 = 52, DRAG = 0.42, GRAV = 2.4, SPEAR_LIFE = 3.4, RELOAD = 2.3;
const SWIM = 4.3, ACCEL = 7.5, WATER_DRAG = 1.55, SINK = 0.32, KICK = 3.4, KICK_CD = 0.8;
const AIR_USE = 0.15, AIR_BACK = 0.24, EXHALE = 3.3;
const PING_CD = 11, PING_SPEED = 70, PING_RANGE = 100, REVEAL = 2.4;
const DECOY_CD = 15, DECOY_LIFE = 14;
const HIT_R = 0.42;

export default {
  id: 'abyss',
  name: 'THE DEEP',
  tagline: 'Two spearguns, one reef wall, and something huge below.',
  perspective: 'FIRST PERSON 3D · UNDERWATER',
  renderer: 'three',
  aim: 'look',
  palette: { bg: '#03141d', fg: '#dcf4ee', accent: '#ffc861' },
  controls: { move: 'SWIM', fire: 'SHOOT', alt: 'HOLD BREATH', a1: 'SONAR', a2: 'DECOY', jump: 'KICK UP' },
  hint: 'Spears are slow and sink. Hold your breath to aim steady and hide your bubbles.',
  altToggle: true,
  roundTime: ROUND,
  overTime: 3,
  angleFields: ['yaw', 'pitch'],

  create(ctx) {
    const { THREE, renderer } = ctx.three;
    const W = buildWorld(ctx.rng);
    const sim = makeKrakenSim(ctx.seed);
    // Quality: a software rasteriser gets the lean build; a GPU starts rich and the view's
    // governor steps down if frames run long.
    const Q = { soft: false, tier: 0, scale: 1, shadow: 1024, fish: 260, snow: 2600, msaa: true };
    try {
      const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext && /swiftshader|llvmpipe|software|basic render/i.test(String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)))) Object.assign(Q, { soft: true, tier: 2, scale: 0.32, shadow: 512, fish: 60, snow: 700, msaa: false });
    } catch { /* masked: assume a GPU */ }
    const tex = makeTextures(THREE, renderer, Q.soft);
    const U = makeShared(THREE, tex);
    const mats = makeMaterials(THREE, U, Q.soft);
    const scene = new THREE.Scene();
    const reef = buildReef(THREE, W, mats, U, ctx.seed, Q.soft);
    scene.add(reef.group);
    const life = buildLife(THREE, mats, U, W, Q, heightAt);
    scene.add(life.group);
    const kraken = buildKraken(THREE, mats, U, sim);
    scene.add(kraken.group);
    const sfx = makeSound(ctx);

    // particles
    const bubbles = new Cloud(THREE, mats, Q.soft ? 900 : 1800, 'BUBBLE');
    const glow = new Cloud(THREE, mats, 260, 'GLOW');
    const smoke = new Cloud(THREE, mats, Q.soft ? 160 : 320, 'SMOKE');
    const snow = makeSnow(THREE, mats, Q.snow);
    scene.add(bubbles.mesh, glow.mesh, smoke.mesh, snow.mesh);

    // ---- the two divers. Player 0 always takes spawn A (z < 0).
    const kit = makeDiverKit(THREE, mats);
    const me = ctx.me;
    const P = [0, 1].map((i) => {
      const s = SPAWN[i], color = ctx.players[i].color, c = hexToRgb(color);
      const model = makeDiver(THREE, kit, color);
      scene.add(model.root, model.ghost);
      return {
        i, x: s.x, y: s.y, z: s.z, vx: 0, vy: 0, vz: 0, yaw: s.yaw, pitch: -0.05, alive: true, dead: -1,
        loaded: true, reload: 0, air: 1, holding: false, holdLock: false, exhaleT: 1.2 + i * 1.4 + Math.random(), breaths: 0,
        swayX: 0, swayY: 0, swayT: i * 3.7, kickCd: 0, pingCd: 0, decoyCd: 0, revealT: -9, lastShotT: -9, shoveT: 0, recoil: 0,
        speed: 0, tell: { x: s.x, y: s.y, z: s.z, t: -9 }, model, color, r: c.r / 255, g: c.g / 255, b: c.b / 255,
        remote: ctx.opponent === 'remote' && i !== me, bot: null, introY: -1.2,
        cmd: { mx: 0, my: 0, yaw: s.yaw, pitch: 0, fire: false, alt: false, a1: false, a2: false, jump: false, wish: null },
      };
    });
    const ME = P[me], FOE = P[1 - me];
    const viewModel = makeViewModel(THREE, kit, ME.color);
    const hands = new THREE.Scene();
    hands.add(viewModel.root);

    // ---- spears, decoys, sonar
    const spearGeo = spearGeometry(THREE);
    const spears = [];
    for (let i = 0; i < 6; i++) {
      const owner = i < 3 ? 0 : 1;
      const mesh = new THREE.Mesh(spearGeo, P[owner].model.mat);
      mesh.visible = false;
      mesh.layers.enable(1);
      const ribbon = new Ribbon(THREE, mats, 18, P[owner].color);
      scene.add(mesh, ribbon.mesh);
      spears.push({ on: false, stuck: false, owner, judge: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ox: 0, oy: 0, oz: 0, age: 0, trail: 0, rib: 0, mesh, ribbon, id: 0, near: false });
    }
    let spearSeq = 0;
    const shellGeo = new THREE.SphereGeometry(1, 40, 24);
    const pings = [0, 1].map((i) => ({ on: false, x: 0, y: 0, z: 0, r: 0, owner: i, shell: makeShell(THREE, mats, shellGeo, P[i].color), hitT: -1 }));
    for (const pg of pings) scene.add(pg.shell);
    const stickGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.28, 8);
    const decoys = [];
    for (let i = 0; i < 4; i++) {
      const owner = i >> 1, mesh = new THREE.Mesh(stickGeo, mats.shader({ vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: `precision highp float; uniform vec3 uC; void main(){ gl_FragColor = vec4(uC, 1.0); }`, uniforms: { uC: { value: new THREE.Color(P[owner].color).multiplyScalar(3) } } }));
      mesh.visible = false;
      scene.add(mesh);
      decoys.push({ alive: false, owner, slot: i, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t0: 0, puffT: 0, mesh });
    }
    let decoyN = [0, 0];
    const inks = []; // { x, y, z, t0 }

    let breathedT = 0; // seconds the "you breathed out" ripple shows on the HUD
    let T = 0, clock = 0, introT = 0, suddenAt = -1, killInfo = null, firstShot = false, tick = 0;
    const v3 = new THREE.Vector3(), e3 = { x: 0, y: 0, z: 0 }, push = { x: 0, y: 0, z: 0 }, tch = { x: 0, y: 0, z: 0, d: 0, vx: 0, vy: 0, vz: 0 };
    const extra = [];
    for (let i = 0; i < 6; i++) extra.push([0, 0, 0, 0]);

    // eye: the mask, a little ahead of the chest
    const eyeOf = (p, out) => {
      const cp = Math.cos(p.pitch);
      out.x = p.x - Math.sin(p.yaw) * cp * 0.55; out.y = p.y + 0.12 + Math.sin(p.pitch) * 0.55; out.z = p.z - Math.cos(p.yaw) * cp * 0.55;
      return out;
    };
    const dirOf = (yaw, pitch, out) => { const cp = Math.cos(pitch); out.x = -Math.sin(yaw) * cp; out.y = Math.sin(pitch); out.z = -Math.cos(yaw) * cp; return out; };
    const d3 = { x: 0, y: 0, z: 1 };
    // the hit capsule: head to knees along the body's lie
    const capA = { x: 0, y: 0, z: 0 }, capB = { x: 0, y: 0, z: 0 };
    function capsule(p) {
      const lie = lerp(0.55, 0.12, clamp(p.speed / SWIM, 0, 1)) * (p.holding ? 0.6 : 1);
      const bp = p.pitch * 0.85 + lie * (1 - Math.abs(p.pitch));
      dirOf(p.yaw, bp, d3);
      capA.x = p.x + d3.x * 0.7; capA.y = p.y + d3.y * 0.7 + 0.08; capA.z = p.z + d3.z * 0.7;
      capB.x = p.x - d3.x * 1.05; capB.y = p.y - d3.y * 1.05; capB.z = p.z - d3.z * 1.05;
    }

    const inCage = (x, z) => !ctx.sudden || Math.hypot(x - CAGE_C.x, z - CAGE_C.z) < sim.S.cageR - 2.5;
    const G = {
      V0, DRAG, GRAV, P, CAGE: CAGE_C, time: () => T, eye: eyeOf,
      sightRange: () => (ctx.sudden ? 200 : 52 + 12 * (1 - sim.S.pass)),
      revealed: (p) => T < p.revealT || (ctx.sudden && p.alive),
      tellOf: (p) => p.tell,
      decoys: () => decoys,
      inCage,
      krakenBlocks(ax, ay, az, bx, by, bz) { return sim.ray(ax, ay, az, bx, by, bz, 0).t >= 0; },
      inkAlong(ax, ay, az, bx, by, bz) {
        let acc = 0;
        for (const k of inks) {
          const r = inkR(k);
          if (r <= 0) continue;
          const dx = bx - ax, dy = by - ay, dz = bz - az, l2 = dx * dx + dy * dy + dz * dz || 1;
          const u = clamp(((k.x - ax) * dx + (k.y - ay) * dy + (k.z - az) * dz) / l2, 0, 1);
          const d = Math.hypot(ax + dx * u - k.x, ay + dy * u - k.y, az + dz * u - k.z);
          if (d < r) acc += (1 - d / r) * 1.2;
        }
        return acc;
      },
      incoming(p) {
        for (const s of spears) {
          if (!s.on || s.stuck || s.owner === p.i) continue;
          const dx = p.x - s.x, dy = p.y - s.y, dz = p.z - s.z, sp = Math.hypot(s.vx, s.vy, s.vz) || 1;
          const along = (dx * s.vx + dy * s.vy + dz * s.vz) / sp;
          if (along < 0 || along > 30) continue;
          const miss = Math.hypot(dx - (s.vx / sp) * along, dy - (s.vy / sp) * along, dz - (s.vz / sp) * along);
          if (miss < 2.5) return s;
        }
        return null;
      },
      krakenNear(p) {
        if (sim.distance(p.x, p.y, p.z) > 7) return null;
        if (!sim.touch(p, 4.5, tch)) return null;
        push.x = tch.x; push.y = tch.y; push.z = tch.z;
        return push;
      },
    };
    const inkR = (k) => { const a = T - k.t0; return a < 0 || a > 9 ? 0 : 9 * Math.min(1, a * 1.4) * (a > 7 ? 1 - (a - 7) / 2 : 1); };
    const brain = makeBot(ctx, W, G);
    for (const p of P) if (!p.remote && (p.i !== me || ctx.autopilot)) p.bot = brain.create(p);

    // ---- bubbles
    function puff(x, y, z, n, size, spread) {
      for (let i = 0; i < n; i++) {
        bubbles.emit(x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread, z + (Math.random() - 0.5) * spread,
          (Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 0.6, size * (0.5 + Math.random()), size * 0.03, 9 + Math.random() * 5, 1, 1, 1, 1, 0.6, 1.1 + Math.random() * 0.6);
      }
    }
    function exhale(p, big) {
      eyeOf(p, e3);
      puff(e3.x, e3.y - 0.1, e3.z, big ? 34 : 14, big ? 0.09 : 0.06, big ? 0.35 : 0.15);
      p.tell.x = p.x; p.tell.y = p.y; p.tell.z = p.z; p.tell.t = T;
      sfx.exhale(p.x, p.y, p.z, p === ME, big);
    }

    // ---- shooting
    function spawnSpear(owner, ox, oy, oz, vx, vy, vz, judge, id) {
      const s = spears.find((q) => q.owner === owner && !q.on) || spears.filter((q) => q.owner === owner).sort((a, b) => b.age - a.age)[0];
      s.on = true; s.stuck = false; s.judge = judge; s.age = 0; s.trail = 0; s.rib = 0; s.id = id; s.near = false;
      s.x = s.ox = ox; s.y = s.oy = oy; s.z = s.oz = oz; s.vx = vx; s.vy = vy; s.vz = vz;
      s.mesh.visible = true;
      s.ribbon.reset(ox, oy, oz);
      s.ribbon.mesh.visible = true;
      s.ribbon.mat.uniforms.uAlpha.value = 1;
      const p = P[owner];
      p.lastShotT = T; p.recoil = 1;
      p.tell.x = ox; p.tell.y = oy; p.tell.z = oz; p.tell.t = T;
      // the gun's own burst of bubbles at the muzzle
      puff(ox, oy, oz, 18, 0.05, 0.25);
      sfx.fire(ox, oy, oz, p === ME);
      life.scare(ox, oy, oz, 0.5);
      return s;
    }
    function shoot(p) {
      eyeOf(p, e3);
      const yaw = p.yaw + p.swayX, pitch = p.pitch + p.swayY;
      dirOf(yaw, pitch, d3);
      // from just under the mask, unless that is inside the rock you are hugging
      let ox = e3.x + d3.x * 0.5, oy = e3.y + d3.y * 0.5 - 0.08, oz = e3.z + d3.z * 0.5;
      if (rayWorld(W, e3.x, e3.y, e3.z, d3.x, d3.y, d3.z, 0.6) < 0.6) { ox = e3.x; oy = e3.y; oz = e3.z; }
      const id = ++spearSeq;
      spawnSpear(p.i, ox, oy, oz, d3.x * V0, d3.y * V0, d3.z * V0, true, id);
      p.loaded = false;
      p.reload = RELOAD;
      if (p === ME) { sfx.reload(RELOAD); view.kick(); firstShot = true; }
      ctx.net.send({ k: 'sp', id, o: [+ox.toFixed(2), +oy.toFixed(2), +oz.toFixed(2)], v: [+(d3.x * V0).toFixed(2), +(d3.y * V0).toFixed(2), +(d3.z * V0).toFixed(2)] });
    }

    function stick(s, x, y, z, surf) {
      s.stuck = true; s.x = x; s.y = y; s.z = z;
      sfx.thunk(x, y, z, surf);
      puff(x, y, z, 8, 0.05, 0.3);
      if (surf === 'sand') for (let i = 0; i < 6; i++) smoke.emit(x, y + 0.2, z, (Math.random() - 0.5) * 2, 0.6 + Math.random(), (Math.random() - 0.5) * 2, 0.6, 0.5, 2.5, 0.75, 0.68, 0.55, 0.5, 1.6, 0);
    }
    function inkAt(x, y, z) {
      inks.push({ x, y, z, t0: T });
      if (inks.length > 4) inks.shift();
      for (let i = 0; i < 46; i++) {
        const a = Math.random() * 6.28, b = Math.random() * 3.14, sp = 2 + Math.random() * 6;
        smoke.emit(x, y, z, Math.cos(a) * Math.sin(b) * sp, Math.cos(b) * sp, Math.sin(a) * Math.sin(b) * sp, 2 + Math.random() * 3, 0.9 + Math.random() * 0.6, 7 + Math.random() * 2.5, 0.05, 0.02, 0.08, 0.92, 0.9, 0);
      }
      kraken.flinch();
      sfx.krakenHit(x, y, z);
      life.scare(x, y, z, 1);
    }
    function popDecoy(d) {
      if (!d.alive) return;
      d.alive = false;
      d.mesh.visible = false;
      puff(d.x, d.y, d.z, 30, 0.08, 0.4);
      sfx.pop(d.x, d.y, d.z);
    }

    function stepSpears(dt) {
      for (const s of spears) {
        if (!s.on) continue;
        s.age += dt;
        if (s.stuck) {
          // stays where it struck; the streak fades
          s.ribbon.mat.uniforms.uAlpha.value = Math.max(0, s.ribbon.mat.uniforms.uAlpha.value - dt * 0.8);
          if (s.age > 20) { s.on = false; s.mesh.visible = false; s.ribbon.mesh.visible = false; }
          continue;
        }
        const n = Math.max(1, Math.ceil(dt * 90));
        const h = dt / n, kd = Math.exp(-DRAG * h);
        for (let k = 0; k < n && s.on && !s.stuck; k++) {
          s.vx *= kd; s.vy = s.vy * kd - GRAV * h; s.vz *= kd;
          const mx = s.vx * h, my = s.vy * h, mz = s.vz * h, len = Math.hypot(mx, my, mz) || 1e-6;
          const dx = mx / len, dy = my / len, dz = mz / len;
          let best = rayWorld(W, s.x, s.y, s.z, dx, dy, dz, len), what = hit.surf ? 'world' : '', surf = hit.surf;
          const kr = sim.ray(s.x, s.y, s.z, s.x + mx, s.y + my, s.z + mz, 0.03);
          if (kr.t >= 0 && kr.t * len < best) { best = kr.t * len; what = 'kraken'; }
          const foe = P[1 - s.owner];
          if (s.judge && foe.alive && ctx.phase === 'live') {
            capsule(foe);
            const u = segCap(s.x, s.y, s.z, mx, my, mz, capA, capB, HIT_R);
            if (u >= 0 && u * len < best) { best = u * len; what = capT < 0.25 ? 'head' : 'diver'; }
          }
          for (const d of decoys) {
            if (!d.alive || d.owner === s.owner) continue;
            const u = segCap(s.x, s.y, s.z, mx, my, mz, d, d, 0.4);
            if (u >= 0 && u * len < best) { best = u * len; what = 'decoy'; s.hitDecoy = d; }
          }
          // close enough to be felt by the target
          if (!s.near && foe.alive) {
            const fx = foe.x - s.x, fy = foe.y - s.y, fz = foe.z - s.z, along = fx * dx + fy * dy + fz * dz;
            if (along > 0 && along < len * 4) {
              const miss = Math.hypot(fx - dx * along, fy - dy * along, fz - dz * along);
              if (miss < 3) {
                s.near = true;
                if (foe === ME && !ME.bot) sfx.whizz(clamp((fx * Math.cos(ME.yaw) - fz * Math.sin(ME.yaw)) / 3, -1, 1));
                if (foe.bot) foe.bot.replan = 0;
              }
            }
          }
          const hx = s.x + dx * best, hy = s.y + dy * best, hz = s.z + dz * best;
          if (what === 'diver' || what === 'head') {
            s.stuck = true; s.on = false; s.mesh.visible = false;
            const range = Math.round(Math.hypot(hx - s.ox, hy - s.oy, hz - s.oz));
            killInfo = { v: foe.i, dx, dy, dz, x: hx, y: hy, z: hz };
            ctx.net.send({ k: 'k', v: foe.i, d: [+dx.toFixed(3), +dy.toFixed(3), +dz.toFixed(3)], p: [+hx.toFixed(2), +hy.toFixed(2), +hz.toFixed(2)] });
            ctx.kill(foe.i, { how: what === 'head' ? `THROUGH THE MASK · ${range} M` : `${range} M` });
            s.ribbon.head(hx, hy, hz);
          } else if (what === 'decoy') {
            const d = s.hitDecoy;
            popDecoy(d);
            ctx.net.send({ k: 'dp', n: d.slot });
            stickFree(s, hx, hy, hz);
          } else if (what === 'kraken') {
            stick(s, hx, hy, hz, 'flesh');
            if (s.judge) { inkAt(hx, hy, hz); ctx.net.send({ k: 'ink', p: [+hx.toFixed(2), +hy.toFixed(2), +hz.toFixed(2)], id: s.id }); }
            s.mesh.visible = false;
          } else if (what === 'world') {
            stick(s, hx, hy, hz, surf);
            if (s.judge) ctx.net.send({ k: 'sx', id: s.id, p: [+hx.toFixed(2), +hy.toFixed(2), +hz.toFixed(2)], s: surf });
          } else {
            s.x += mx; s.y += my; s.z += mz;
          }
          // the trail: bubbles strung back along the path to whoever fired it
          s.trail += len;
          while (s.trail > 0.32) {
            s.trail -= 0.32;
            bubbles.emit(s.x - dx * s.trail, s.y - dy * s.trail, s.z - dz * s.trail, (Math.random() - 0.5) * 0.2, 0.05 + Math.random() * 0.15, (Math.random() - 0.5) * 0.2, 0.035 + Math.random() * 0.04, 0.004, 5 + Math.random() * 3, 1, 1, 1, 0.9, 1.5, 0.22);
          }
        }
        s.rib += dt;
        if (s.rib > 0.035) { s.rib = 0; s.ribbon.push(s.x, s.y, s.z); } else s.ribbon.head(s.x, s.y, s.z);
        if (!s.stuck && s.age > SPEAR_LIFE) { s.stuck = true; s.vx = s.vy = s.vz = 0; }
        if (s.mesh.visible) {
          s.mesh.position.set(s.x, s.y, s.z);
          if (!s.stuck) { v3.set(s.x + s.vx, s.y + s.vy, s.z + s.vz); s.mesh.lookAt(v3); }
        }
      }
    }
    function stickFree(s, x, y, z) { s.stuck = true; s.x = x; s.y = y; s.z = z; s.mesh.visible = false; }
    // segment o + m·u against a capsule a–b of radius r: first u in [0,1], or -1
    let capT = 0;
    function segCap(ox, oy, oz, mx, my, mz, a, b, r) {
      let best = -1;
      for (let i = 0; i <= 6; i++) {
        const w = i / 6, cx = lerp(a.x, b.x, w), cy = lerp(a.y, b.y, w), cz = lerp(a.z, b.z, w);
        const l2 = mx * mx + my * my + mz * mz || 1e-9;
        const u = clamp(((cx - ox) * mx + (cy - oy) * my + (cz - oz) * mz) / l2, 0, 1);
        const ex = ox + mx * u - cx, ey = oy + my * u - cy, ez = oz + mz * u - cz, d2 = ex * ex + ey * ey + ez * ez;
        if (d2 < r * r) {
          const back = Math.sqrt((r * r - d2) / l2), uu = Math.max(0, u - back);
          if (best < 0 || uu < best) { best = uu; capT = w; }
        }
      }
      return best;
    }

    // ---- abilities
    function sonar(p) {
      p.pingCd = PING_CD;
      const pg = pings[p.i];
      pg.on = true; pg.x = p.x; pg.y = p.y; pg.z = p.z; pg.r = 0; pg.hitT = -1;
      pg.shell.visible = true;
      sfx.ping(p.x, p.y, p.z, p === ME);
      if (p === ME) view.note('SONAR OUT', 1.2);
      ctx.net.send({ k: 'pg', p: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)] });
    }
    function stepPings(dt) {
      for (const pg of pings) {
        if (!pg.on) continue;
        pg.r += PING_SPEED * dt;
        const foe = P[1 - pg.owner];
        if (pg.hitT < 0 && foe.alive && Math.hypot(foe.x - pg.x, foe.y - pg.y, foe.z - pg.z) < pg.r && pg.r < PING_RANGE) {
          pg.hitT = T;
          foe.revealT = T + REVEAL;
          if (foe === ME) { view.pinged(pg.x, pg.y, pg.z); sfx.pinged(); }
          else if (P[pg.owner] === ME) view.note('CONTACT', 1.4);
        }
        pg.shell.position.set(pg.x, pg.y, pg.z);
        pg.shell.scale.setScalar(Math.max(0.1, pg.r));
        pg.shell.material.uniforms.uAlpha.value = clamp(1 - pg.r / PING_RANGE, 0, 1) * 0.9;
        if (pg.r > PING_RANGE) { pg.on = false; pg.shell.visible = false; }
      }
    }
    function dropDecoy(p) {
      p.decoyCd = DECOY_CD;
      const slot = p.i * 2 + (decoyN[p.i]++ & 1);
      eyeOf(p, e3);
      dirOf(p.yaw, p.pitch, d3);
      const vx = d3.x * 2.4 + p.vx * 0.5, vy = d3.y * 2.4 + 0.2, vz = d3.z * 2.4 + p.vz * 0.5;
      placeDecoy(slot, e3.x + d3.x * 0.6, e3.y, e3.z + d3.z * 0.6, vx, vy, vz);
      if (p === ME) view.note('DECOY OUT — IT BREATHES LIKE YOU', 2);
      ctx.net.send({ k: 'dc', n: slot, p: [+e3.x.toFixed(2), +e3.y.toFixed(2), +e3.z.toFixed(2)], v: [+vx.toFixed(2), +vy.toFixed(2), +vz.toFixed(2)] });
    }
    function placeDecoy(slot, x, y, z, vx, vy, vz) {
      const d = decoys[slot & 3];
      d.alive = true; d.x = x; d.y = y; d.z = z; d.vx = vx; d.vy = vy; d.vz = vz; d.t0 = T; d.puffT = 0.6;
      d.mesh.visible = true;
      sfx.decoy(x, y, z, d.owner === me);
    }
    function stepDecoys(dt) {
      for (const d of decoys) {
        if (!d.alive) continue;
        const k = Math.exp(-0.45 * dt);
        d.vx *= k; d.vy = d.vy * k - 0.05 * dt; d.vz *= k;
        d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
        e3.x = d.x; e3.y = d.y; e3.z = d.z;
        collide(W, e3, 0.2);
        d.x = e3.x; d.y = e3.y; d.z = e3.z;
        d.mesh.position.set(d.x, d.y, d.z);
        d.mesh.rotation.set(T * 0.7 + d.slot, 0, T * 1.1);
        // it breathes like a diver
        if ((d.puffT -= dt) <= 0) { d.puffT = 2.2 + Math.random() * 1.2; puff(d.x, d.y, d.z, 13, 0.06, 0.15); }
        if (T - d.t0 > DECOY_LIFE) popDecoy(d);
      }
    }

    // ---- one diver, one frame
    function humanCmd(p) {
      const inp = ctx.input, c = p.cmd, z = view.zoom, k = LOOK * lerp(1, 0.42, z);
      c.mx = inp.moveX; c.my = inp.moveY;
      c.yaw = p.yaw - inp.lookX * k;
      c.pitch = clamp(p.pitch - inp.lookY * k, -1.35, 1.35);
      c.fire = inp.firePressed; c.alt = inp.alt; c.a1 = inp.a1Pressed; c.a2 = inp.a2Pressed; c.jump = inp.jumpPressed;
      c.wish = null;
      return c;
    }

    function step(p, cmd, dt) {
      const live = ctx.phase === 'live';
      p.yaw = cmd.yaw;
      p.pitch = cmd.pitch;
      p.recoil = Math.max(0, p.recoil - dt * 4);
      if (!p.alive) return;
      p.kickCd = Math.max(0, p.kickCd - dt);
      p.pingCd = Math.max(0, p.pingCd - dt);
      p.decoyCd = Math.max(0, p.decoyCd - dt);
      // breath
      const wantHold = live && cmd.alt && !p.holdLock && p.air > 0.02;
      if (wantHold && !p.holding) { p.holding = true; if (p === ME) sfx.holdIn(); }
      else if (!wantHold && p.holding) { p.holding = false; if (live) exhale(p, true); p.exhaleT = EXHALE; }
      if (p.holding) {
        p.air -= AIR_USE * dt;
        if (p.air <= 0) { p.air = 0; p.holding = false; p.holdLock = true; exhale(p, true); if (p === ME) { sfx.gasp(); view.note('OUT OF AIR', 1.5); } p.exhaleT = EXHALE; }
      } else {
        p.air = Math.min(1, p.air + AIR_BACK * dt);
        if (p.holdLock && p.air > 0.4) p.holdLock = false;
        if (live) {
          p.exhaleT -= dt * (ctx.sudden ? 1.6 : 1);
          if (p.exhaleT <= 0) { p.exhaleT = EXHALE + Math.random() * 0.8; p.breaths++; exhale(p, false); if (p === ME) breathedT = 0.9; }
        }
      }
      // sway: breathing and finning move the gun; holding your breath stills it
      p.swayT += dt;
      const t = p.swayT, moving = clamp(p.speed / SWIM, 0, 1);
      const amp = p.holding ? 0.0016 : 0.009 + moving * 0.016;
      p.swayX = amp * (Math.sin(t * 1.21 + p.i) + 0.55 * Math.sin(t * 2.63 + 1.1)) + p.shoveT * 0.04 * Math.sin(t * 13);
      p.swayY = amp * (0.8 * Math.cos(t * 0.93 + p.i * 2) + 0.5 * Math.sin(t * 2.17)) + p.shoveT * 0.03 * Math.cos(t * 11);
      p.shoveT = Math.max(0, p.shoveT - dt);
      if (!live) { p.vx = p.vy = p.vz = 0; p.speed = 0; return; }
      // swimming: thrust where you look, glide on, sink when still
      const cp = Math.cos(p.pitch), fx = -Math.sin(p.yaw) * cp, fy = Math.sin(p.pitch), fz = -Math.cos(p.yaw) * cp;
      const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      let ax, ay, az;
      if (cmd.wish) {
        const w = cmd.wish, l = Math.hypot(w.x, w.y, w.z);
        const k = l > 1 ? 1 / l : 1;
        ax = w.x * k; ay = w.y * k; az = w.z * k;
      } else {
        let f = -cmd.my, s = cmd.mx;
        const m = Math.hypot(f, s);
        if (m > 1) { f /= m; s /= m; }
        ax = fx * f + rx * s; ay = fy * f; az = fz * f + rz * s;
      }
      const thrust = Math.hypot(ax, ay, az);
      const top = SWIM * (p.holding ? 0.45 : 1) * (p.loaded ? 1 : 0.9);
      p.vx += ax * ACCEL * dt; p.vy += ay * ACCEL * dt; p.vz += az * ACCEL * dt;
      if (thrust < 0.1) p.vy -= SINK * dt;
      if (cmd.jump && p.kickCd <= 0) { p.vy += KICK; p.kickCd = KICK_CD; if (p === ME) sfx.kick(); puff(p.x, p.y - 0.3, p.z + 0, 6, 0.05, 0.4); }
      const drag = Math.exp(-WATER_DRAG * dt);
      p.vx *= drag; p.vy *= drag; p.vz *= drag;
      const sp = Math.hypot(p.vx, p.vz);
      if (sp > top) { p.vx *= top / sp; p.vz *= top / sp; }
      if (Math.abs(p.vy) > top) p.vy = Math.sign(p.vy) * top;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      // the reef, the walls of the arena (a current pushes you back), the cage
      collide(W, p, RADIUS);
      if (boundsPush(p, push) > 0) { p.vx += push.x * 6 * dt; p.vy += push.y * 6 * dt; p.vz += push.z * 6 * dt; p.x += push.x * 0.15; p.y += push.y * 0.3; p.z += push.z * 0.15; if (p.y > ARENA.y1) p.y = ARENA.y1; }
      if (ctx.sudden && !inCage(p.x, p.z)) { const dx = CAGE_C.x - p.x, dz = CAGE_C.z - p.z, l = Math.hypot(dx, dz) || 1; p.vx += (dx / l) * 9 * dt; p.vz += (dz / l) * 9 * dt; }
      // the kraken: a touch shoves you hard and spins your aim
      if (sim.touch(p, RADIUS, tch)) {
        p.x += tch.x * tch.d; p.y += tch.y * tch.d; p.z += tch.z * tch.d;
        if (p.shoveT <= 0.2) {
          const kx = tch.vx * 0.6 + tch.x * 7, ky = tch.vy * 0.6 + tch.y * 7 + 1, kz = tch.vz * 0.6 + tch.z * 7;
          p.vx += kx; p.vy += ky; p.vz += kz;
          p.yaw += gauss(Math.random) * 0.35; p.pitch = clamp(p.pitch + gauss(Math.random) * 0.2, -1.3, 1.3);
          p.cmd.yaw = p.yaw; p.cmd.pitch = p.pitch;
          p.shoveT = 1;
          if (p === ME) { sfx.shove(); view.shove(); }
          puff(p.x, p.y, p.z, 20, 0.07, 0.6);
          if (p.bot) p.bot.replan = 0;
        }
      }
      // the other diver: you bump, you do not pass through
      const o = P[1 - p.i];
      if (o.alive) {
        const dx = p.x - o.x, dy = p.y - o.y, dz = p.z - o.z, d = Math.hypot(dx, dy, dz);
        if (d < 1.1 && d > 1e-3) { const k = (1.1 - d) / d; p.x += dx * k; p.y += dy * k; p.z += dz * k; }
      }
      p.speed = Math.hypot(p.vx, p.vy, p.vz);
      // the gun
      if (!p.loaded) {
        p.reload -= dt * (ctx.sudden ? 1.4 : 1);
        if (p.reload <= 0) { p.loaded = true; p.reload = 0; if (p === ME) sfx.loaded(); }
      }
      if (cmd.fire) { if (p.loaded) shoot(p); else if (p === ME && !p.bot) sfx.dry(); }
      if (cmd.a1 && p.pingCd <= 0) sonar(p);
      if (cmd.a2 && p.decoyCd <= 0) dropDecoy(p);
    }

    function puppet(p, dt) {
      const r = ctx.net.remote;
      if (!r) return;
      const px = p.x, py = p.y, pz = p.z;
      p.x = r.x; p.y = r.y; p.z = r.z; p.yaw = r.yaw; p.pitch = r.pitch;
      if (dt > 0) { p.vx = (p.x - px) / dt; p.vy = (p.y - py) / dt; p.vz = (p.z - pz) / dt; }
      p.speed = r.sp;
      p.loaded = !!r.ld; p.holding = !!r.hb; p.air = r.air;
      // a breath counted on their side: their bubbles here
      if (r.br !== p.breaths) { if (r.br > p.breaths && ctx.phase === 'live') exhale(p, false); p.breaths = r.br; }
      if (r.hb === 0 && p.wasHolding && ctx.phase === 'live') exhale(p, true);
      p.wasHolding = !!r.hb;
      p.recoil = Math.max(0, p.recoil - dt * 4);
    }

    // ---- the kill
    function fell(v) {
      if (!v.alive) return;
      v.alive = false; v.dead = 0; v.holding = false;
      const ki = killInfo && killInfo.v === v.i ? killInfo : null;
      const hx = ki ? ki.x : v.x, hy = ki ? ki.y : v.y, hz = ki ? ki.z : v.z;
      // a burst of light and bubbles where it went in, and every fish for 30 m gone
      puff(hx, hy, hz, 70, 0.09, 0.6);
      for (let i = 0; i < 18; i++) smoke.emit(hx, hy, hz, (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3, 0.4, 0.6, 2.5, v.r * 1.2, v.g * 1.2, v.b * 1.2, 0.35, 1.2, 0.3);
      v.hitX = hx; v.hitY = hy; v.hitZ = hz;
      life.scare(hx, hy, hz, 1.5);
      sfx.hit(hx, hy, hz);
      view.killCam(v, ki);
    }

    function frame(dt) {
      const phase = ctx.phase;
      if (phase === 'intro') introT += dt;
      T = phase === 'live' ? ctx.time : phase === 'over' ? T + dt : 0;
      clock += dt;
      if (ctx.sudden && suddenAt < 0) { suddenAt = T; sfx.sudden(); sfx.music(true); view.note('THE KRAKEN IS CLOSING IN', 3); }
      // the animal: during the intro it is already moving, on its way to time 0
      const kt = phase === 'intro' ? Math.min(0, introT - 3.6) : T;
      const pr = prof.on ? performance : null;
      let t0 = pr ? pr.now() : 0;
      const lap = (k) => { if (pr) { const t = pr.now(); prof[k] = (prof[k] || 0) + t - t0; t0 = t; } };
      sim.snapshot();
      sim.update(kt);
      lap('kraken');
      tick ^= 1;
      for (let n = 0; n < 2; n++) {
        const p = P[n ^ tick];
        if (p.remote) puppet(p, dt);
        else if (p.bot && phase === 'live' && p.alive) step(p, brain.think(p, P[1 - p.i], dt, p.cmd), dt);
        else if (p.bot) step(p, p.cmd, dt);
        else step(p, humanCmd(p), dt);
        if (p.dead >= 0) p.dead += dt;
      }
      lap('divers');
      if (phase !== 'intro') { stepSpears(dt); stepPings(dt); stepDecoys(dt); }
      lap('spears');
      for (let i = inks.length - 1; i >= 0; i--) if (T - inks[i].t0 > 9.5) inks.splice(i, 1);
      breathedT = Math.max(0, breathedT - dt);

      // what the fish flee from: the divers, live spears, the decoys
      let ne = 0;
      for (const s of spears) if (s.on && !s.stuck && ne < 4) { const e = extra[ne++]; e[0] = s.x; e[1] = s.y; e[2] = s.z; e[3] = 7; }
      for (const d of decoys) if (d.alive && ne < 6) { const e = extra[ne++]; e[0] = d.x; e[1] = d.y; e[2] = d.z; e[3] = 2.5; }
      extra.length = 6;
      bubbles.update(dt, clock, true);
      smoke.update(dt, clock, false);
      glow.update(dt, clock, false);
      lap('clouds');
      life.update(dt, clock, { divers: P.filter((p) => p.alive || p.dead < 3), extra: extra.slice(0, ne), glow, kraken: sim.S });

      lap('life');
      view.update(dt, T, introT);
      lap('view');
      sfx.update(dt, sim.distance(ME.x, ME.y, ME.z), sim.S.pass);
      // the network and the HUD
      ctx.net.sendState({
        x: +ME.x.toFixed(2), y: +ME.y.toFixed(2), z: +ME.z.toFixed(2), yaw: +ME.yaw.toFixed(3), pitch: +ME.pitch.toFixed(3),
        sp: +ME.speed.toFixed(1), ld: ME.loaded ? 1 : 0, hb: ME.holding ? 1 : 0, air: +ME.air.toFixed(2), br: ME.breaths,
      });
      ctx.hud.cooldown('fire', ME.loaded ? 0 : ME.reload / RELOAD);
      ctx.hud.cooldown('a1', ME.pingCd / PING_CD);
      ctx.hud.cooldown('a2', ME.decoyCd / DECOY_CD);
      ctx.hud.cooldown('alt', ME.holdLock ? 1 - ME.air / 0.4 : 0);
      ctx.hud.cooldown('jump', ME.kickCd / KICK_CD);
      lap('rest');
    }
    const prof = { on: false }; // test scripts: per-section update timings

    const view = makeView(ctx, THREE, renderer, {
      scene, hands, viewModel, P, ME, FOE, U, Q, W, sim, kraken, life, reef, bubbles, glow, smoke, snow, spears, pings, decoys, inks, inkR, sfx, eyeOf, dirOf,
      puff, G, firstShot: () => firstShot, breathed: () => breathedT, RELOAD, PING_CD, DECOY_CD, AIR_USE, REVEAL, SWIM,
    });

    const inst = {
      update(dt) { frame(dt); },
      render() { view.render(); },
      resize(w, h) { view.resize(w, h); },
      onPhase(phase) {
        if (phase === 'intro') view.beginIntro();
        else if (phase === 'live') { sfx.music(false); view.goLive(); }
        else if (phase === 'over') {
          const r = ctx.result;
          if (r && r.victim >= 0) fell(P[r.victim]);
        }
      },
      onNet(msg) {
        const foe = FOE;
        if (msg.k === 'sp') spawnSpear(foe.i, msg.o[0], msg.o[1], msg.o[2], msg.v[0], msg.v[1], msg.v[2], false, msg.id);
        else if (msg.k === 'sx' || msg.k === 'ink') {
          // where the shooter's spear ended: put ours there too
          const s = spears.find((q) => q.owner === foe.i && q.id === msg.id);
          if (s && !s.stuck) { s.x = msg.p[0]; s.y = msg.p[1]; s.z = msg.p[2]; stick(s, s.x, s.y, s.z, msg.s || 'flesh'); if (msg.k === 'ink') s.mesh.visible = false; s.ribbon.head(s.x, s.y, s.z); }
          if (msg.k === 'ink') inkAt(msg.p[0], msg.p[1], msg.p[2]);
        } else if (msg.k === 'pg') {
          const p = foe;
          const pg = pings[p.i];
          pg.on = true; pg.x = msg.p[0]; pg.y = msg.p[1]; pg.z = msg.p[2]; pg.r = 0; pg.hitT = -1; pg.shell.visible = true;
          sfx.ping(pg.x, pg.y, pg.z, false);
        } else if (msg.k === 'dc') placeDecoy(msg.n, msg.p[0], msg.p[1], msg.p[2], msg.v[0], msg.v[1], msg.v[2]);
        else if (msg.k === 'dp') popDecoy(decoys[msg.n & 3]);
        else if (msg.k === 'k') {
          killInfo = { v: msg.v & 1, dx: msg.d[0], dy: msg.d[1], dz: msg.d[2], x: msg.p[0], y: msg.p[1], z: msg.p[2] };
          // the remote's spear: finish its flight at the body
          const s = spears.find((q) => q.owner === foe.i && q.on && !q.stuck);
          if (s) { s.on = false; s.mesh.visible = false; s.ribbon.head(msg.p[0], msg.p[1], msg.p[2]); }
        }
      },
      focus() { return view.focus(); },
      dispose() {
        ctx.audio.stopMusic(0.4);
        sfx.dispose();
        view.dispose();
        renderer.setRenderTarget(null);
        for (const c of [bubbles, glow, smoke]) c.dispose();
        snow.dispose();
        for (const s of spears) s.ribbon.dispose();
        spearGeo.dispose(); shellGeo.dispose(); stickGeo.dispose();
        reef.dispose(); life.dispose(); kraken.dispose(); kit.dispose();
        disposeTree(hands);
        disposeTree(scene);
        mats.dispose();
        tex.dispose();
      },
    };
    inst.view = view; // test scripts: view.shot = {x,y,z,tx,ty,tz,fov} pins the camera
    inst.P = P; inst.sim = sim; inst.prof = prof;
    view.resize(ctx.width, ctx.height);
    return inst;
  },
};
