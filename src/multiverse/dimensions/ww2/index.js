// IRON AUTUMN — third person, over the shoulder, autumn 1944.
//
// THE FANTASY  Two snipers at either end of a bombed-out town square at dusk: a ruined
//   church with a bell tower, a dry fountain, burnt-out armour, sandbags, craters and a
//   trench. About 105 m between the barricades; the low sun rakes in from the west.
// THE RULES    One hit wins the point. Bolt-action rifle, five rounds: bullets fly at 250 m/s
//   and drop, so a runner at range needs lead and a long shot needs hold-over. From the
//   shoulder the rifle is only honest inside ~25 m; through the scope it is exact but it
//   sways with your breathing (kneel, keep still and wait for the lull), you crawl, you see
//   almost nothing else — and your lens glints at whoever you point it at.
//   Kneeling hides you behind sandbags and in craters; kneeling AND scoping lifts just your
//   head over the top. Being seen is what marks you: running upright, firing (unless the
//   church bell is tolling — it drowns the shot), or standing under a parachute flare.
// THE WORLD    An artillery barrage walks through the places snipers like to sit (whistle
//   and ground ring first; only the ring is lethal). Flares drift down and mark whoever
//   they light. The bell tolls. Late in the round the wall across the west lanes collapses
//   and opens the long sightline. All of it runs off ctx.time: both clients see the same.
// CONTROLS     move · look · FIRE · alt SCOPE · a1 SMOKE (2, blocks sight for bots and
//   people) · a2 DECOY (a helmet on a stick: if it draws a shot the shooter is marked for
//   you) · jump CROUCH (toggle).
// THE BOT      holds a post, glasses the square in bursts, hops post to post towards your
//   last known position, stops to shoot when it sees you, runs from shells, smokes when
//   pinned, plants decoys. Skill scales notice time, settle time, lead and drop judgement.
// THE KILL     slow motion: the helmet rings and spins away, the body folds, dust comes
//   down from the rafters, the bell tolls once, the camera orbits low with the sun behind.
// SUDDEN DEATH both snipers are marked for good, a flare hangs over the fountain and the
//   barrage closes on it from both ends; anyone outside the line gets a shell of their own,
//   and at the very end the last shell finds whoever is further from the fountain.
import { clamp, lerp, damp, gauss, disposeTree, hexToRgb } from '../../kit.js';
import { buildMap, SPAWN, hit, FLARE_RADIUS } from './map.js';
import { makeTextures } from './tex.js';
import { makeFogPatch, SUN } from './kitbash.js';
import { buildTown } from './build.js';
import { buildProps } from './props.js';
import { buildAtmosphere } from './atmos.js';
import { buildFx } from './fx.js';
import { makePost } from './post.js';
import { makeSoldierKit, shapeOf, headY, headFwd } from './soldier.js';
import { makeSfx } from './sfx.js';
import { makeEvents } from './events.js';
import { makeBot } from './bot.js';
import { makeView } from './view.js';

const LOOK = 0.0022;
const V = 250, GRAV = 7, ZERO = (0.5 * GRAV * (60 / V) ** 2) / 60; // the rifle is zeroed at 60 m
const BOLT = 1.25, RELOAD = 2.7, MAG = 5, RUN = 5.6, CREEP = 2.4;
const SMOKE_CD = 5, SMOKE_LIFE = 11, DECOY_CD = 16, DECOY_LIFE = 16;
const FOG_D = 0.0066;

export default {
  id: 'ww2',
  name: 'IRON AUTUMN',
  tagline: 'One square, one bell, and the guns are walking your way.',
  perspective: 'THIRD PERSON 3D',
  renderer: 'three',
  aim: 'look',
  palette: { bg: '#1b1a17', fg: '#e9dfc8', accent: '#e8853a' },
  controls: { fire: 'FIRE', alt: 'SCOPE', a1: 'SMOKE', a2: 'DECOY', jump: 'CROUCH' },
  altToggle: true,
  roundTime: 60,
  overTime: 3,
  angleFields: ['yaw', 'pitch'],

  create(ctx) {
    const { THREE, renderer } = ctx.three;
    const map = buildMap(ctx.rng);
    const scene = new THREE.Scene();
    const fogColor = new THREE.Color(0.066, 0.078, 0.105);
    scene.fog = new THREE.FogExp2(fogColor, FOG_D);
    const fog = makeFogPatch(THREE);
    fog.shared.uSunFog.value.setRGB(1.25, 0.56, 0.2);
    // Two builds of the same picture. A software rasteriser (no GPU, or a blocked one) pays
    // per texture fetch, so there the materials shed normal maps, PBR and soft shadow
    // filtering, and the scene is drawn at reduced resolution under full-resolution grain.
    const Q = { rich: true, scale: 1 };
    try {
      const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext && /swiftshader|llvmpipe|software|basic render/i.test(String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)))) { Q.rich = false; Q.scale = 0.85; }
    } catch { /* masked: assume a real GPU */ }
    const tex = makeTextures(THREE, renderer, ctx.seed, Q.rich ? 8 : 1, Q.rich);
    const town = buildTown(THREE, map, tex, ctx.seed, fog, Q);
    const props = buildProps(THREE, map, tex, ctx.seed, fog, town, Q);
    town.finish();
    const atmos = buildAtmosphere(THREE, tex, ctx.seed, fog.shared, fogColor);
    const fx = buildFx(THREE, tex, map, fog.shared, fogColor, FOG_D, Q);
    const post = makePost(THREE, renderer, { msaa: Q.rich, scale: Q.scale, lens: Q.rich });
    const sfx = makeSfx(ctx);
    scene.add(town.group, atmos.group, fx.group);

    // Light: a cold sky and one low, warm sun whose shadows cross the whole square.
    scene.add(new THREE.HemisphereLight(new THREE.Color(0.4, 0.5, 0.72), new THREE.Color(0.26, 0.19, 0.14), 4.4));
    const sun = new THREE.DirectionalLight(new THREE.Color(1, 0.5, 0.2), 21);
    sun.position.set(SUN.x * 150, SUN.y * 150, SUN.z * 150);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 1024);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.07;
    {
      // Fit the shadow frustum to the town as the sun sees it.
      const sc = sun.shadow.camera, v = new THREE.Vector3();
      sc.position.copy(sun.position);
      sc.lookAt(0, 0, 0);
      sc.updateMatrixWorld();
      const inv = sc.matrixWorld.clone().invert();
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const x of [-42, 34]) for (const y of [-2, 29]) for (const z of [-64, 64]) {
        v.set(x, y, z).applyMatrix4(inv);
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z);
      }
      sc.left = x0; sc.right = x1; sc.bottom = y0; sc.top = y1; sc.near = -z1 - 4; sc.far = -z0 + 4;
      sc.updateProjectionMatrix();
    }
    scene.add(sun, sun.target);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = Q.rich ? THREE.PCFSoftShadowMap : THREE.BasicShadowMap;
    renderer.shadowMap.autoUpdate = false; // the view asks for an update when it renders

    // ---- the two snipers. Player 0 always holds the south barricade. ----
    const kit = makeSoldierKit(THREE, fog);
    const P = [0, 1].map((i) => {
      const s = SPAWN[i], c = hexToRgb(ctx.players[i].color), model = kit.soldier(ctx.players[i].color);
      scene.add(model.root);
      if (!Q.rich) model.root.traverse((o) => { o.castShadow = false; }); // the software build bakes its shadows once
      return {
        i, x: s.x, y: map.floorAt(s.x, s.z, 0.5, 0), z: s.z, vy: 0, yaw: s.yaw, pitch: 0, crouch: true, k: 0, scoped: false, scope: 0, alive: true, dead: -1, fx: 0, fz: 1,
        ammo: MAG, bolt: 0, boltStep: 0, reload: 0, recoil: 0, fatigue: 0, speed: 0, mvx: 0, mvz: 0, stepT: 0, swayX: 0, swayY: 0, swayT: i * 4.1, breathUp: false, hipFire: false,
        smokes: 2, smokeCd: 0, decoyCd: 0, decoyN: 0, markT: -1, pingT: -9, pingX: 0, pingY: 0, pingZ: 0, shotT: -9, vis: 0, shield: 0,
        remote: ctx.opponent === 'remote' && i !== ctx.me, bot: null, model, r: c.r / 255, g: c.g / 255, b: c.b / 255, color: ctx.players[i].color,
        cmd: { mx: 0, my: 0, yaw: s.yaw, pitch: 0, fire: false, alt: false, a1: false, a2: false, crouch: true },
      };
    });
    const me = P[ctx.me];
    let T = 0, suddenAt = -1, flinch = 0, killInfo = null, tollT = -1, dustT = 0, emitAcc = 0;
    const E = new THREE.Vector3(), D = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3();
    const sh = {}, hits = [], notes = { text: '', a: 0 };
    for (let i = 0; i < 4; i++) hits.push({ ang: 0, a: 0, near: false, x: 0, z: 0 });
    const note = (text, dur = 2.5) => { notes.text = text; notes.a = dur; };

    const eyeOf = (p, out) => {
      const hf = headFwd(p.k);
      out.x = p.x - Math.sin(p.yaw) * hf; out.y = p.y + headY(p.k) + 0.02; out.z = p.z - Math.cos(p.yaw) * hf;
      return out;
    };
    const hipSpread = (p) => lerp(0.0075, 0.012, p.k) + (p.speed / RUN) * 0.03 + p.fatigue * 0.008;
    const local = (p) => !p.remote; // simulated on this client (human or bot)

    // ---- interface the bot, the events and the view share ----
    const G = {
      V, GRAV, ZERO, P, time: () => T, suddenT: () => (suddenAt >= 0 ? T - suddenAt : -1), eye: eyeOf, hipSpread,
      dangers: () => events.dangers, decoys: () => decoys, hits, notes, flinch: () => flinch,
      shake(level, x, z) { view.shake(level); if (level > 0.5 && Math.hypot(x - me.x, z - me.z) < 14) flinch = Math.max(flinch, 0.7); },
      eachLocal(fn) { for (const p of P) if (local(p) && p.alive) fn(p); },
      // The environment got someone this client simulates.
      env(p, how, x, y, z) {
        if (ctx.phase !== 'live' || !p.alive) return;
        killInfo = { v: p.i, dx: p.x - x, dy: 0.5, dz: p.z - z, head: false, env: true };
        ctx.net.send({ k: 'k', v: p.i, d: [+(p.x - x).toFixed(2), 0.5, +(p.z - z).toFixed(2)], h: 0, e: 1 });
        ctx.kill(p.i, { how });
      },
      blast(x, y, z, r, how) { for (const p of P) if (local(p) && p.alive && Math.hypot(p.x - x, p.z - z) < r && Math.abs(p.y - y) < 3.5) G.env(p, how, x, y, z); },
      lastShell() {
        const d0 = Math.hypot(P[0].x, P[0].z), d1 = Math.hypot(P[1].x, P[1].z), far = d0 > d1 ? P[0] : P[1];
        if (local(far)) { fx.flash(far.x, far.y + 1, far.z, 1, 0.6, 0.3, 9, 0.25); sfx.shell(far.x, far.y, far.z); G.env(far, 'THE LAST SHELL', far.x + 0.5, far.y, far.z + 0.5); }
      },
    };
    const events = makeEvents(ctx, map, fx, sfx, town, props.afterMesh, atmos, G, Q);
    const brain = makeBot(ctx, map, G);
    for (const p of P) if (!p.remote && (p.i !== ctx.me || ctx.autopilot)) p.bot = brain.create(p);

    // ---- pooled things that fly: bullets, smoke cans, helmets; and the decoys ----
    const bullets = [];
    for (let i = 0; i < 10; i++) bullets.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ox: 0, oy: 0, oz: 0, owner: 0, judge: false, age: 0, near: false, hip: false, masked: false });
    const canGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.13, 8);
    const cans = [];
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(canGeo, kit.mats.steel);
      mesh.visible = false;
      scene.add(mesh);
      cans.push({ on: false, age: 0, n: 0, path: new Float32Array(100 * 3), mesh });
    }
    const helmets = [];
    for (let i = 0; i < 4; i++) {
      const mesh = kit.helmet(P[i & 1].model.id); // 0-1: shot off a head; 2-3: shot off a stick
      mesh.visible = false;
      scene.add(mesh);
      helmets.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, ax: 1, az: 0, n: 0, mesh });
    }
    const stickGeo = new THREE.CylinderGeometry(0.016, 0.02, 1.4, 6);
    const decoys = [];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group(), stick = new THREE.Mesh(stickGeo, kit.mats.wood), helm = kit.helmet(P[i >> 1].model.id);
      stick.position.y = 0.7;
      helm.position.y = 1.4;
      stick.castShadow = true;
      g.add(stick, helm);
      g.visible = false;
      scene.add(g);
      decoys.push({ alive: false, owner: i >> 1, x: 0, y: 0, z: 0, yaw: 0, t0: 0, g, helm });
    }

    function flyHelmet(slot, x, y, z, dx, dy, dz) {
      const h = helmets[slot], l = Math.hypot(dx, dy, dz) || 1;
      h.on = true; h.n = 0; h.x = x; h.y = y; h.z = z;
      h.vx = (dx / l) * 4.5 + (Math.random() - 0.5) * 1.5; h.vy = 4.6 + Math.random() * 1.5; h.vz = (dz / l) * 4.5 + (Math.random() - 0.5) * 1.5;
      h.spin = 14 + Math.random() * 8; h.ax = Math.random() - 0.5; h.az = Math.random() - 0.5;
      h.mesh.visible = true;
      for (let i = 0; i < 12; i++) fx.sparks.emit(x, y, z, (Math.random() - 0.5) * 7 - (dx / l) * 2, Math.random() * 5, (Math.random() - 0.5) * 7 - (dz / l) * 2, 0.3 + Math.random() * 0.4, 0.05, 6, 3.6, 1.4, 12);
    }

    // ---- shooting ----
    function muzzleFx(x, y, z, dx, dy, dz, mine) {
      fx.flash(x + dx * 0.4, y + dy * 0.4, z + dz * 0.4, 1, 0.74, 0.4, mine ? 1.6 : 2.4, 0.07);
      fx.star(x + dx * 0.4, y + dy * 0.4, z + dz * 0.4, 1.4, 5, 3.6, 1.8, Math.random() * 3);
      for (let i = 0; i < 3; i++) fx.smoke(x + dx * (0.5 + i * 0.4), y + dy * (0.5 + i * 0.4), z + dz * (0.5 + i * 0.4), dx * (2 - i * 0.5), 0.3, dz * (2 - i * 0.5), 0.25, 0.9, 1.3 + i * 0.4, 0.35, 0.7, 0.68, 0.64, 0, 0.5, 2.2, 0.3);
    }
    function spawnBullet(owner, ox, oy, oz, dx, dy, dz, judge, hip, masked) {
      const b = bullets.find((q) => !q.on) || bullets[0];
      b.on = true; b.owner = owner; b.judge = judge; b.age = 0; b.near = false; b.hip = hip; b.masked = masked;
      b.x = b.ox = ox; b.y = b.oy = oy; b.z = b.oz = oz;
      b.vx = dx * V; b.vy = dy * V; b.vz = dz * V;
    }
    // Somebody fired from (x, y, z): the report, the flash, and — unless the bell covered it — the tell.
    function report(p, x, y, z, dx, dy, dz, masked) {
      muzzleFx(x, y, z, dx, dy, dz, p === me);
      sfx.shot(x, y, z, p === me);
      p.shotT = T;
      p.recoil = 1;
      if (!masked) { p.pingT = T; p.pingX = x; p.pingY = y; p.pingZ = z; }
      if (p !== me && !masked && me.alive) { const t = hits[0].a < hits[1].a ? hits[0] : hits[1]; t.a = 1.6; t.near = false; t.x = x; t.z = z; }
    }
    function shoot(p) {
      eyeOf(p, E);
      const scoped = p.scope > 0.6, human = p === me && !p.bot;
      let yaw = p.yaw, pitch = p.pitch;
      if (scoped) { yaw += p.swayX; pitch += p.swayY; }
      if (human && !scoped && view.aim(E, D)) { yaw = Math.atan2(-D.x, -D.z); pitch = Math.asin(clamp(D.y, -1, 1)); } // converge on what the crosshair covers
      if (!scoped) { const s = hipSpread(p); yaw += gauss(Math.random) * s; pitch += gauss(Math.random) * s * 0.8; }
      pitch += ZERO;
      const cp = Math.cos(pitch), dx = -Math.sin(yaw) * cp, dy = Math.sin(pitch), dz = -Math.cos(yaw) * cp;
      const ox = E.x + dx * 0.7, oy = E.y + dy * 0.7 - 0.03, oz = E.z + dz * 0.7, masked = map.bellMasked(T);
      spawnBullet(p.i, ox, oy, oz, dx, dy, dz, true, !scoped, masked);
      report(p, ox, oy, oz, dx, dy, dz, masked);
      p.ammo--;
      if (p.ammo > 0) { p.bolt = BOLT; p.boltStep = 0; } else { p.reload = RELOAD; if (p === me) sfx.clip(); }
      if (p === me) { view.kick(scoped ? 1 : 0.6); if (masked) note('THE BELL COVERED YOUR SHOT', 1.6); }
      ctx.net.send({ k: 's', o: [+ox.toFixed(2), +oy.toFixed(2), +oz.toFixed(2)], d: [+dx.toFixed(4), +dy.toFixed(4), +dz.toFixed(4)], m: masked ? 1 : 0 });
    }

    function impact(x, y, z, surf, nx, ny, nz) {
      const stone = surf === 'stone', metal = surf === 'metal', c = surf === 'dirt' ? 0.3 : surf === 'sand' ? 0.5 : surf === 'wood' ? 0.4 : 0.55;
      for (let i = 0; i < 3; i++) fx.smoke(x + nx * 0.15, y + ny * 0.15, z + nz * 0.15, nx * (1 + i) + (Math.random() - 0.5), ny * (1 + i) + 0.6, nz * (1 + i) + (Math.random() - 0.5), 0.3, 1.1, 1 + Math.random() * 0.8, 0.5, c, c * 0.92, c * 0.82, 0, 0.5, 2, 0.2);
      const n = metal ? 12 : stone ? 6 : 2;
      for (let i = 0; i < n; i++) fx.sparks.emit(x, y, z, nx * 4 + (Math.random() - 0.5) * 7, ny * 4 + Math.random() * 4, nz * 4 + (Math.random() - 0.5) * 7, 0.2 + Math.random() * 0.35, 0.045, 6, 3.4, 1.2, 12);
      for (let i = 0; i < (metal ? 0 : 6); i++) fx.clods.emit(x, y, z, nx * 3 + (Math.random() - 0.5) * 4, ny * 3 + Math.random() * 4, nz * 3 + (Math.random() - 0.5) * 4, 0.8, 0.04 + Math.random() * 0.04, c * 0.5, c * 0.45, c * 0.4, 12);
      sfx.impact(x, y, z, surf);
    }

    // Closest approach of segment o→o+d*len (d unit) to point c: returns distance², sets segT.
    let segT = 0;
    const segPoint = (ox, oy, oz, dx, dy, dz, len, cx, cy, cz) => {
      segT = clamp((cx - ox) * dx + (cy - oy) * dy + (cz - oz) * dz, 0, len);
      const x = ox + dx * segT - cx, y = oy + dy * segT - cy, z = oz + dz * segT - cz;
      return x * x + y * y + z * z;
    };
    // Where along the segment it comes within r of the capsule a→b, or -1. (Sampled: the capsule is short.)
    function segCapsule(ox, oy, oz, dx, dy, dz, len, s, r) {
      let best = -1;
      for (let i = 0; i <= 4; i++) {
        const u = i / 4, d2 = segPoint(ox, oy, oz, dx, dy, dz, len, lerp(s.ax, s.bx, u), lerp(s.ay, s.by, u), lerp(s.az, s.bz, u));
        if (d2 < r * r && (best < 0 || segT < best)) best = Math.max(0, segT - Math.sqrt(r * r - d2));
      }
      return best;
    }

    function stepBullets(dt) {
      for (const b of bullets) {
        if (!b.on) continue;
        let rem = dt;
        while (rem > 1e-5 && b.on) {
          const sp = Math.hypot(b.vx, b.vy, b.vz), h = Math.min(rem, 3.2 / sp);
          const mx = b.vx * h, my = b.vy * h - 0.5 * GRAV * h * h, mz = b.vz * h, len = Math.hypot(mx, my, mz), dx = mx / len, dy = my / len, dz = mz / len;
          let tEnv = map.ray(b.x, b.y, b.z, dx, dy, dz, len, T, false);
          const kind = hit.kind, surf = hit.surf, nx = hit.nx, ny = hit.ny, nz = hit.nz, foe = P[1 - b.owner];
          let tHit = -1, head = false, decoy = -1;
          if (b.judge && foe.alive && ctx.phase === 'live') {
            shapeOf(foe.x, foe.y, foe.z, foe.yaw, foe.k, sh);
            const d2 = segPoint(b.x, b.y, b.z, dx, dy, dz, len, sh.hx, sh.hy, sh.hz);
            if (d2 < 0.04) { tHit = Math.max(0, segT - Math.sqrt(0.04 - d2)); head = true; }
            const tb = segCapsule(b.x, b.y, b.z, dx, dy, dz, len, sh, 0.27);
            if (tb >= 0 && (tHit < 0 || tb < tHit)) { tHit = tb; head = false; }
          }
          if (b.judge) for (let i = 0; i < 4; i++) {
            const dc = decoys[i];
            if (!dc.alive || dc.owner === b.owner) continue;
            const d2 = segPoint(b.x, b.y, b.z, dx, dy, dz, len, dc.x, dc.y + 1.38, dc.z);
            if (d2 < 0.045 && (tHit < 0 || segT < tHit)) { tHit = segT; decoy = i; }
          }
          // A round that passes close is felt, whoever is judging it.
          if (!b.near && foe.alive && b.age > 0.02) {
            const d2 = segPoint(b.x, b.y, b.z, dx, dy, dz, len, foe.x, foe.y + 1.2, foe.z);
            if (d2 < 6.5 && segT < len - 0.01 && segT > 0.01) {
              b.near = true;
              if (foe.bot) foe.bot.underFire = 2.6;
              if (foe === me && !me.bot) {
                flinch = 1;
                sfx.crack(clamp((b.vx * Math.cos(me.yaw) - b.vz * Math.sin(me.yaw)) / V, -1, 1));
                const t = hits[2].a < hits[3].a ? hits[2] : hits[3];
                t.a = 1.4; t.near = true; t.x = b.ox; t.z = b.oz;
              }
            }
          }
          if (tHit >= 0 && tHit <= tEnv) {
            b.on = false;
            const hx = b.x + dx * tHit, hy = b.y + dy * tHit, hz = b.z + dz * tHit;
            if (decoy >= 0) { hitDecoy(decoy, b.owner); ctx.net.send({ k: 'dh', n: decoy }); }
            else {
              const range = Math.round(Math.hypot(hx - b.ox, hy - b.oy, hz - b.oz));
              const how = b.masked ? `UNDER THE BELL · ${range} M` : b.hip && range > 25 ? `FROM THE HIP · ${range} M` : head ? `HEADSHOT · ${range} M` : `${range} M`;
              killInfo = { v: foe.i, dx, dy, dz, head, env: false };
              ctx.net.send({ k: 'k', v: foe.i, d: [+dx.toFixed(3), +dy.toFixed(3), +dz.toFixed(3)], h: head ? 1 : 0, e: 0 });
              ctx.kill(foe.i, { how });
            }
          } else if (kind) {
            b.on = false;
            impact(b.x + dx * tEnv, b.y + dy * tEnv, b.z + dz * tEnv, surf, nx, ny, nz);
          } else {
            b.x += mx; b.y += my; b.z += mz;
            b.vy -= GRAV * h;
            b.age += h;
            rem -= h;
            if (b.age > 1.7) b.on = false;
          }
        }
        if (b.on) {
          // Draw it: a streak in the shooter's colour with a white-hot head.
          const sp = Math.hypot(b.vx, b.vy, b.vz), tail = Math.min(11, b.age * sp) / sp, q = P[b.owner];
          fx.tracer(b.x - b.vx * tail, b.y - b.vy * tail, b.z - b.vz * tail, b.x, b.y, b.z, 3 + q.r * 5, 2.4 + q.g * 4, 1.6 + q.b * 4, 0.045);
        }
      }
    }

    // ---- abilities ----
    // A smoke can's flight is worked out in full at the throw, in fixed steps, so both clients land it in the same place.
    function throwSmoke(owner, ox, oy, oz, vx, vy, vz) {
      const c = cans.find((q) => !q.on) || cans[0];
      let x = ox, y = oy, z = oz, n = 0, rest = 0;
      const h = 1 / 60;
      for (; n < 100 && rest < 12; n++) {
        c.path[n * 3] = x; c.path[n * 3 + 1] = y; c.path[n * 3 + 2] = z;
        vy -= 15 * h;
        const sp = Math.hypot(vx, vy, vz) || 1e-6, step = sp * h;
        if (map.ray(x, y, z, vx / sp, vy / sp, vz / sp, step + 0.05, T, false) < step + 0.05) {
          if (hit.kind === 3 || hit.ny > 0.5) { vy = Math.abs(vy) * 0.3; vx *= 0.55; vz *= 0.55; if (Math.abs(vy) < 0.8) { vy = 0; rest++; } }
          else { vx *= -0.25; vz *= -0.25; }
          continue;
        }
        x += vx * h; y += vy * h; z += vz * h;
      }
      c.on = true; c.age = 0; c.n = n; c.owner = owner;
      c.mesh.visible = true;
    }
    function popSmoke(x, y, z) {
      map.smokes.push({ x, y: y + 1.6, z, r: 5.4, t0: T, t1: T + SMOKE_LIFE });
      sfx.smokePop(x, y, z);
      for (let i = 0; i < 10; i++) { const a = Math.random() * 6.28; fx.smoke(x, y + 0.3, z, Math.cos(a) * 4, 1 + Math.random() * 2, Math.sin(a) * 4, 1.4, 1.6, 3, 0.6, 0.74, 0.73, 0.7, 0, 0.4, 1.4, 0.3); }
    }
    function plantDecoy(slot, x, y, z, yaw) {
      const d = decoys[slot];
      d.alive = true; d.x = x; d.y = y; d.z = z; d.yaw = yaw; d.t0 = T;
      d.g.visible = d.helm.visible = true;
      d.g.scale.y = 0.45;
      d.g.position.set(x, y, z);
    }
    function hitDecoy(slot, shooter) {
      const d = decoys[slot];
      if (!d.alive) return;
      d.alive = false;
      d.helm.visible = false;
      const s = P[shooter];
      flyHelmet(2 + d.owner, d.x, d.y + 1.4, d.z, d.x - s.x, 0, d.z - s.z);
      sfx.ring(d.x, d.y + 1.4, d.z, 3.4);
      s.markT = Math.max(s.markT, T + 6);
      if (d.owner === ctx.me) { ctx.hud.message('DECOY HIT', 'the shooter is marked', 2.2); sfx.marked(); }
      else if (shooter === ctx.me) note('THAT WAS A HELMET ON A STICK — YOU ARE MARKED', 3);
    }

    // ---- one sniper, one frame ----
    function humanCmd(p) {
      const inp = ctx.input, c = p.cmd, k = LOOK * lerp(1, 0.24, p.scope);
      c.mx = inp.moveX; c.my = inp.moveY;
      c.yaw = p.yaw - inp.lookX * k;
      c.pitch = clamp(p.pitch - inp.lookY * k, -1.15, 1.15);
      c.fire = inp.firePressed; c.alt = inp.alt; c.a1 = inp.a1Pressed; c.a2 = inp.a2Pressed;
      if (inp.jumpPressed && ctx.phase === 'live') c.crouch = !c.crouch;
      return c;
    }

    function step(p, cmd, dt) {
      p.yaw = cmd.yaw;
      p.pitch = cmd.pitch;
      p.recoil = Math.max(0, p.recoil - dt * 5);
      if (!p.alive) return;
      const live = ctx.phase === 'live';
      p.crouch = cmd.crouch;
      p.scoped = live && cmd.alt && p.reload <= 0;
      p.scope = damp(p.scope, p.scoped ? 1 : 0, 13, dt);
      const kT = p.crouch ? (p.scoped ? 0.45 : 0) : 1;
      p.k += clamp(kT - p.k, -dt * 4.2, dt * 4.2);
      // Breathing: the sway swells and dies on a 3.6 s cycle; kneeling and stillness tame it.
      p.swayT += dt;
      const t = p.swayT, lull = 0.28 + 0.72 * Math.abs(Math.sin((t * Math.PI) / 3.6));
      const amp = 0.0034 * lerp(0.42, 1, p.k) * lull * (1 + 2.4 * p.fatigue) * (p.speed > 0.3 ? 2.3 : 1) * (p.bolt > 0 ? 3.2 : 1);
      p.swayX = amp * (Math.sin(t * 1.13 + p.i) + 0.5 * Math.sin(t * 2.71 + 1.3));
      p.swayY = amp * (0.9 * Math.cos(t * 0.87 + 2 * p.i) + 0.45 * Math.sin(t * 2.23));
      if (p === me && !p.bot && p.scope > 0.8) { const up = Math.sin((t * Math.PI) / 1.8) > 0; if (up !== p.breathUp) { p.breathUp = up; sfx.breath(up); } }
      if (!live) { p.speed = p.mvx = p.mvz = 0; return; }
      const sp = (p.crouch ? CREEP : RUN) * (p.scoped ? 0.32 : 1) * (p.reload > 0 ? 0.8 : 1);
      let f = -cmd.my, s = cmd.mx;
      const m = Math.hypot(f, s);
      if (m > 1) { f /= m; s /= m; }
      const ox = p.x, oz = p.z, sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
      map.walk(p, (-sy * f + cy * s) * sp * dt, (-cy * f - sy * s) * sp * dt, dt, T);
      if (dt > 0) { p.mvx = (p.x - ox) / dt; p.mvz = (p.z - oz) / dt; }
      p.speed = Math.hypot(p.mvx, p.mvz);
      p.fatigue = clamp(p.fatigue + (p.speed > 3.5 ? dt * 0.7 : -dt * 0.5), 0, 1);
      if (p === me) { p.stepT += p.speed * dt; if (p.stepT > 2.1) { p.stepT = 0; sfx.step(p.crouch); } }
      // Working the bolt: four sounds, and no shooting until it is home.
      if (p.bolt > 0) {
        p.bolt -= dt;
        const ph = 1 - p.bolt / BOLT;
        if (p === me && p.boltStep < 4 && ph > [0.12, 0.34, 0.6, 0.82][p.boltStep]) {
          sfx.bolt(p.boltStep++);
          if (p.boltStep === 2) { eyeOf(p, E); fx.clods.emit(E.x + cy * 0.25, E.y - 0.1, E.z - sy * 0.25, cy * 2.2 + (Math.random() - 0.5), 2.2, -sy * 2.2 + (Math.random() - 0.5), 1.4, 0.035, 0.8, 0.62, 0.25, 12); } // the spent case
        }
      }
      if (p.reload > 0) { p.reload -= dt; if (p.reload <= 0) p.ammo = MAG; }
      p.smokeCd = Math.max(0, p.smokeCd - dt);
      p.decoyCd = Math.max(0, p.decoyCd - dt);
      if (cmd.fire) { if (p.bolt <= 0 && p.reload <= 0 && p.ammo > 0) shoot(p); else if (p === me && !p.bot) sfx.dry(); }
      if (cmd.a1 && p.smokes > 0 && p.smokeCd <= 0) {
        p.smokes--; p.smokeCd = SMOKE_CD;
        eyeOf(p, E);
        const pt = p.pitch + 0.2, cp = Math.cos(pt), vx = -sy * cp * 17, vy = Math.sin(pt) * 17 + 1.5, vz = -cy * cp * 17;
        throwSmoke(p.i, E.x - sy * 0.4, E.y - 0.1, E.z - cy * 0.4, vx, vy, vz);
        if (p === me) sfx.throwIt();
        ctx.net.send({ k: 'm', o: [+(E.x - sy * 0.4).toFixed(2), +(E.y - 0.1).toFixed(2), +(E.z - cy * 0.4).toFixed(2)], v: [+vx.toFixed(2), +vy.toFixed(2), +vz.toFixed(2)] });
      }
      if (cmd.a2 && p.decoyCd <= 0) {
        const slot = p.i * 2 + (p.decoyN++ & 1);
        p.decoyCd = DECOY_CD;
        plantDecoy(slot, p.x, p.y, p.z, p.yaw);
        if (p === me) { sfx.decoy(); note('DECOY UP — NOW GET AWAY FROM IT', 2.2); }
        ctx.net.send({ k: 'd', n: slot, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), yaw: +p.yaw.toFixed(2) });
      }
    }

    function puppet(p, dt) {
      const r = ctx.net.remote;
      if (!r) return;
      p.x = r.x; p.y = r.y; p.z = r.z; p.yaw = r.yaw; p.pitch = r.pitch; p.k = r.k;
      p.scoped = !!r.sc; p.scope = damp(p.scope, r.sc ? 1 : 0, 13, dt);
      p.crouch = !!r.cr; p.mvx = r.vx; p.mvz = r.vz; p.speed = Math.hypot(r.vx, r.vz); p.bolt = r.bo; p.ammo = r.am;
      p.recoil = Math.max(0, p.recoil - dt * 5);
    }

    const view = makeView(ctx, THREE, renderer, { scene, map, fx, post, atmos, fog, P, G, events, decoys, sfx, Q });
    const pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, k: 0, aim: 0, speed: 0, mvx: 0, mvz: 0, bolt: -1, recoil: 0, dead: -1, fx: 0, fz: 1 };

    function fell(v) {
      // The decisive round: which way the body goes, and the helmet with it.
      const ki = killInfo && killInfo.v === v.i ? killInfo : null, w = P[1 - v.i];
      let dx = ki ? ki.dx : v.x - w.x, dz = ki ? ki.dz : v.z - w.z;
      const l = Math.hypot(dx, dz) || 1;
      v.alive = false; v.dead = 0; v.fx = dx / l; v.fz = dz / l; v.scoped = false;
      v.model.helmet.visible = false;
      const hy = v.y + headY(v.k) + 0.05;
      flyHelmet(v.i, v.x, hy, v.z, dx, 0, dz);
      sfx.ring(v.x, hy, v.z, ki && ki.env ? 2.2 : 3);
      for (let i = 0; i < 5; i++) fx.smoke(v.x, hy - 0.3 * i, v.z, v.fx * 2 + (Math.random() - 0.5), 0.5, v.fz * 2 + (Math.random() - 0.5), 0.3, 0.9, 1.2, 0.4, 0.55, 0.52, 0.47, 0, 0.5, 1.6, 0.2);
      tollT = 0.09; // the bell answers, once
      dustT = 1.2;
      view.killCam(v);
    }

    const inst = {
      update(dt) {
        const phase = ctx.phase;
        T = phase === 'over' ? T + dt : ctx.time;
        if (ctx.sudden && suddenAt < 0) { suddenAt = T; note('THE BARRAGE IS CLOSING ON THE FOUNTAIN', 4); }
        fx.begin();
        for (const p of P) {
          if (p.remote) puppet(p, dt);
          else step(p, !p.bot ? humanCmd(p) : p.alive ? brain.think(p, P[1 - p.i], dt, p.cmd) : p.cmd, dt);
          if (p.dead >= 0) p.dead += dt;
        }
        if (phase !== 'intro') stepBullets(dt);
        // Who is lit, who is marked.
        for (const p of P) {
          if (!p.alive) continue;
          if (suddenAt >= 0) p.markT = T + 1;
          for (const f of events.flareNow) {
            if (f.on < 0.35 || Math.hypot(p.x - f.x, p.z - f.z) > FLARE_RADIUS) continue;
            if (map.los(f.x, f.y, f.z, p.x, p.y + headY(p.k), p.z, T)) p.markT = Math.max(p.markT, T + 0.9);
          }
        }
        // Cans in the air, smoke on the ground, decoys, helmets.
        for (const c of cans) {
          if (!c.on) continue;
          c.age += dt;
          const i = Math.min(c.n - 1, Math.floor(c.age * 60));
          c.mesh.position.set(c.path[i * 3], c.path[i * 3 + 1] + 0.05, c.path[i * 3 + 2]);
          c.mesh.rotation.set(c.age * 9, 0, c.age * 7);
          if (c.age * 60 >= c.n + 18) { c.on = false; c.mesh.visible = false; popSmoke(c.path[i * 3], c.path[i * 3 + 1], c.path[i * 3 + 2]); }
        }
        emitAcc += dt * 12;
        for (let n = emitAcc | 0; n > 0; n--, emitAcc -= 1) {
          for (const s of map.smokes) {
            const r = map.smokeR(s, T);
            if (r < 0.6 || T > s.t1 - 1) continue;
            const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * r * 0.72;
            fx.smoke(s.x + Math.cos(a) * d, s.y - 1.4 + Math.random() * 2.6, s.z + Math.sin(a) * d, 0, 0.2, 0, 2.3, 0.9, 3.3, 0.6, 0.74, 0.73, 0.7, 0, 0.3, 0.5, 0.2);
          }
        }
        for (let i = map.smokes.length - 1; i >= 0; i--) if (T > map.smokes[i].t1) map.smokes.splice(i, 1);
        for (const d of decoys) {
          if (!d.g.visible) continue;
          const age = T - d.t0;
          if (d.alive && age > DECOY_LIFE) d.alive = false;
          // Up over the cover, then the small unsteady movements of a man trying to keep still.
          if (d.alive) d.g.scale.y = Math.min(1, 0.45 + age * 1.6);
          else if ((d.g.scale.y -= dt * 2) < 0.06) { d.g.visible = false; continue; }
          d.g.rotation.set(Math.sin(age * 1.7) * 0.05, d.yaw + Math.sin(age * 0.6) * 0.3, Math.sin(age * 2.3 + 1) * 0.04);
        }
        for (const h of helmets) {
          if (!h.on) continue;
          h.vy -= 13 * dt;
          h.x += h.vx * dt; h.y += h.vy * dt; h.z += h.vz * dt;
          const f = map.floorAt(h.x, h.z, h.y + 0.3, T) + 0.1;
          if (h.y < f) {
            h.y = f;
            if (h.n++ < 4 && Math.abs(h.vy) > 1) { sfx.clink(h.x, h.y, h.z, 1 - h.n * 0.18); h.vy = -h.vy * 0.42; h.vx *= 0.6; h.vz *= 0.6; h.spin *= 0.6; }
            else { h.vy = 0; h.vx *= 0.8; h.vz *= 0.8; h.spin *= 0.8; }
          }
          h.mesh.position.set(h.x, h.y, h.z);
          h.mesh.rotateOnAxis(A.set(h.ax, 0.4, h.az).normalize(), h.spin * dt);
        }
        // The kill moment's extras.
        if (tollT > 0 && (tollT -= dt) <= 0) sfx.bell(1.1, 0.5);
        if (dustT > 0) {
          dustT -= dt;
          const v = P[ctx.result && ctx.result.victim >= 0 ? ctx.result.victim : 0];
          for (let i = 0; i < 2; i++) fx.smoke(v.x + (Math.random() - 0.5) * 9, v.y + 4 + Math.random() * 3, v.z + (Math.random() - 0.5) * 9, 0, -2.2, 0, 0.3, 0.5, 1.5, 0.3, 0.6, 0.56, 0.5, 0, 0.3, 0.2, -1.8);
        }
        flinch = Math.max(0, flinch - dt * 1.3);
        notes.a = Math.max(0, notes.a - dt);
        for (const t of hits) t.a = Math.max(0, t.a - dt);

        view.update(dt, T);
        events.update(dt, T, view.wt, view.camera);
        // Bodies: after the camera, so a scoped sniper never sees the inside of their own head.
        for (const p of P) {
          const s = pose;
          s.x = p.x; s.y = p.y; s.z = p.z; s.yaw = p.yaw; s.pitch = p.pitch + (p.scope > 0.5 ? p.swayY : 0); s.k = p.k;
          s.aim = p.scope > 0.3 ? 1 : lerp(0.85, 0.12, clamp(p.speed / RUN, 0, 1)) * (p.reload > 0 ? 0.5 : 1);
          s.speed = p.speed; s.mvx = p.mvx; s.mvz = p.mvz; s.bolt = p.bolt > 0 ? 1 - p.bolt / BOLT : p.reload > 0 ? (p.reload * 1.3) % 1 : -1;
          s.recoil = p.recoil; s.dead = p.dead; s.fx = p.fx; s.fz = p.fz;
          p.model.update(dt, s);
          p.model.root.visible = !(p === me && view.scopeAmount > 0.55 && p.alive);
        }
        fx.update(dt, view.wt, view.pointScale);

        const m = me;
        ctx.net.sendState({
          x: +m.x.toFixed(2), y: +m.y.toFixed(2), z: +m.z.toFixed(2), yaw: +m.yaw.toFixed(3), pitch: +m.pitch.toFixed(3), k: +m.k.toFixed(2),
          sc: m.scoped ? 1 : 0, cr: m.crouch ? 1 : 0, vx: +m.mvx.toFixed(1), vz: +m.mvz.toFixed(1), bo: +Math.max(0, m.bolt).toFixed(2), am: m.ammo,
        });
        ctx.hud.cooldown('fire', m.reload > 0 ? m.reload / RELOAD : Math.max(0, m.bolt) / BOLT);
        ctx.hud.charges('fire', m.ammo);
        ctx.hud.cooldown('a1', m.smokes > 0 ? m.smokeCd / SMOKE_CD : 1);
        ctx.hud.charges('a1', m.smokes);
        ctx.hud.cooldown('a2', m.decoyCd / DECOY_CD);
      },

      render() { view.render(); },
      resize(w, h) { view.resize(w, h); },

      onPhase(phase) {
        if (phase === 'intro') view.beginIntro();
        else if (phase === 'live') sfx.music();
        else if (phase === 'over') {
          const r = ctx.result;
          if (r && r.victim >= 0) fell(P[r.victim]);
        }
      },

      onNet(msg) {
        const foe = P[1 - ctx.me];
        if (msg.k === 's') {
          spawnBullet(foe.i, msg.o[0], msg.o[1], msg.o[2], msg.d[0], msg.d[1], msg.d[2], false, false, !!msg.m);
          report(foe, msg.o[0], msg.o[1], msg.o[2], msg.d[0], msg.d[1], msg.d[2], !!msg.m);
        } else if (msg.k === 'm') throwSmoke(foe.i, msg.o[0], msg.o[1], msg.o[2], msg.v[0], msg.v[1], msg.v[2]);
        else if (msg.k === 'd') plantDecoy(msg.n & 3, msg.x, msg.y, msg.z, msg.yaw);
        else if (msg.k === 'dh') hitDecoy(msg.n & 3, foe.i);
        else if (msg.k === 'ps') events.remoteShell(msg.x, msg.z, msg.t);
        else if (msg.k === 'k') {
          killInfo = { v: msg.v & 1, dx: msg.d[0], dy: msg.d[1], dz: msg.d[2], head: !!msg.h, env: !!msg.e };
          // The point may have landed before the detail did: turn the fall the right way.
          const v = P[killInfo.v], l = Math.hypot(killInfo.dx, killInfo.dz) || 1;
          if (!v.alive && v.dead < 0.25) { v.fx = killInfo.dx / l; v.fz = killInfo.dz / l; }
        }
      },

      focus() { return view.focus(); },

      dispose() {
        ctx.audio.stopMusic(0.3);
        renderer.setRenderTarget(null);
        renderer.shadowMap.autoUpdate = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.shadowMap.enabled = false;
        post.dispose();
        fx.dispose();
        kit.dispose();
        canGeo.dispose();
        stickGeo.dispose();
        disposeTree(scene);
        tex.dispose();
      },
    };
    inst.view = view; // for the test scripts: view.shot = { x, y, z, tx, ty, tz, fov }
    inst.dbg = { scene, post, sun, town, fx, atmos, P, map };
    post.resize();
    return inst;
  },
};
