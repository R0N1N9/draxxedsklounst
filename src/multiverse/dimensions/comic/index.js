// INK CITY — third person, over the shoulder, inside a living comic book.
//
// THE FANTASY  Two pulp vigilantes on facing clusters of rooftops at a lurid sunset: water
//   towers, hoardings, stair heads, a street canyon with an el train far below and an
//   advertising airship that drifts through the sightline. About 100 m perch to perch,
//   25 m ledge to ledge. The whole picture is printed: flat colour, Ben-Day dots in the
//   half-light, fat ink outlines, paper grain, a panel border — and every sound is lettered
//   into the world (BLAM! KRAK! WHIFF! THUD! POOF!).
// THE RULES    One hit wins the point; only a sniper's bullet scores (nothing in the city
//   can kill). The rifle holds four rounds; they fly at 165 m/s and drop, so a runner needs
//   lead and the long shot a hold-over (the scope has rungs for it). From the shoulder the
//   rifle is honest to ~25 m; SCOPE punches the view into its own panel — exact, but it
//   breathes, you crawl, you see nothing else, and your lens glints at whoever it points at.
//   Roofs that touch can be walked between (down any drop, up a low step); an alley can be
//   run at and hopped; everything else is a LEAP.
// CONTROLS     move · look · FIRE · alt SCOPE · a1 LEAP (rocket boots: fly to the roof under
//   the crosshair — the dashed arc shows where; you can be shot out of the air) · a2 SMOKE
//   (two bombs: a hand-drawn POOF! at your feet that eyes and bots cannot see through —
//   the home dimension's smoke).
// THE WORLD    The airship crosses the canyon on a timetable (ctx.time) and stops bullets and
//   sightlines while it does. Pigeons burst from wherever a round lands or a sniper touches
//   down; the el rattles through; newspapers ride the wind. Decoration runs on its own clock.
// THE BOT      settles in, sends a ranging shot or two wide on purpose (nothing it fires in
//   the first ten seconds can kill), then duels from cover — peek, steady, fire, hide for the
//   bolt — and when the long shots fail it leaps a terrace closer, and finally across the
//   street. Near misses make it smoke and move. Skill scales notice, settle, lead and drop.
// THE KILL     a freeze-frame splash page: everything behind the victim becomes a halftone
//   burst in the winner's colour, giant lettering lands, then the victim is knocked out of
//   the panel in a spray of ink stars while a caption box has the last word.
// SUDDEN DEATH the artist reaches for the eraser: every prop turns to blue pencil and stops
//   nothing, both snipers are marked for good; fourteen seconds later the FINAL PANEL throws
//   them onto facing ledges, 25 m apart, with nowhere to go.
//
// FILES  world.js (roofs, colliders, walking, leaping, the airship's timetable) · mats.js
//   (colour + sunlight out) · post.js (ink, dots, sky, paper) · build.js / art.js (the city,
//   its hoardings) · fx.js (instanced effects and city life) · hero.js · bot.js · view.js
//   (cameras, the 2D layer's state) · overlay.js (lettering, captions, reticle) · sound.js.
import { clamp, lerp, damp, gauss, disposeTree, pick } from '../../kit.js';
import { buildWorld, hit, LEAP_MAX } from './world.js';
import { makeMats, rgb } from './mats.js';
import { makeArt } from './art.js';
import { buildCity } from './build.js';
import { buildFx } from './fx.js';
import { makePost } from './post.js';
import { makeHeroKit, EYE, HEAD } from './hero.js';
import { makeBot } from './bot.js';
import { makeView } from './view.js';
import { makeLetters } from './overlay.js';
import { makeSfx } from './sound.js';

const LOOK = 0.0022;
const V = 165, GRAV = 6, ZERO = (0.5 * GRAV * (60 / V) ** 2) / 60; // zeroed at 60 m
const BOLT = 1.05, RELOAD = 2.3, MAG = 4, RUN = 6.4;
const LEAP_CD = 4.5, SMOKES = 2, SMOKE_CD = 3, SMOKE_LIFE = 8.5, SMOKE_R = 5.2, SHOWDOWN = 14;
const WORD = { brick: 'KRAK', metal: 'PING', wood: 'THUNK', paper: 'THUNK', glass: 'KRAK', blimp: 'BOINK' };
const CHIP = { brick: rgb('#c9583c'), metal: rgb('#a9bcc9'), wood: rgb('#b36a3c'), paper: rgb('#fff4d6'), glass: rgb('#ffe9a0'), blimp: rgb('#f6e7c1') };
const STAR = [rgb('#ffe066'), rgb('#fff4d6'), rgb('#ff5e62')];
const SMOKE = rgb('#f1e8ff'), CREAM = rgb('#fff3e6'), FLAME = rgb('#ffd9a0'), DUST = rgb('#efe2cf'), CANVAS = rgb('#f6e7c1');

export default {
  id: 'comic',
  name: 'INK CITY',
  tagline: 'Two rooftops. One panel left.',
  perspective: 'THIRD PERSON COMIC',
  renderer: 'three',
  aim: 'look',
  palette: { bg: '#241541', fg: '#fff4d6', accent: '#ffd23f' },
  controls: { aim: 'LOOK', fire: 'FIRE', alt: 'SCOPE', a1: 'LEAP', a2: 'SMOKE' },
  hint: 'LEAP flies you to the rooftop you are looking at.',
  altToggle: true,
  roundTime: 60,
  overTime: 3,
  angleFields: ['yaw', 'pitch'],

  create(ctx) {
    const { THREE, renderer } = ctx.three;
    // A software rasteriser (no GPU, or a blocked one) pays for every pixel and every shader
    // state it meets: it gets the same page smaller, from as few shaders as will draw it (no
    // cast shadows, glow or smoothing), redrawn only as often as it can.
    const Q = { rich: true, scale: 1, bloom: true, fxaa: true, lite: false, shadows: true };
    try {
      const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext && /swiftshader|llvmpipe|software|basic render/i.test(String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)))) Object.assign(Q, { rich: false, scale: 0.42, bloom: false, fxaa: false, lite: true, shadows: false });
    } catch { /* masked: assume a real GPU */ }
    const W = buildWorld(ctx.rng);
    const scene = new THREE.Scene();
    const sunDir = new THREE.Vector3(-0.86, 0.44, 0.05).normalize();
    const mats = makeMats(THREE, sunDir, Q.rich), art = makeArt(THREE);
    const city = buildCity(THREE, W, mats, art, ctx.seed), fx = buildFx(THREE, mats, W);
    const post = makePost(THREE, renderer, Q), sfx = makeSfx(ctx), letters = makeLetters(), kit = makeHeroKit(THREE, mats);
    scene.add(city.group, fx.group);
    // The sun the sky shows sits lower than the one that lights the roofs: a sunset wants both.
    post.u.uSun.value.set(-0.97, 0.12, 0.2).normalize();
    post.u.uSunR.value.set(0.2, 0, 0.97).normalize();
    post.u.uSunU.value.crossVectors(post.u.uSunR.value, post.u.uSun.value).normalize();

    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.position.copy(sunDir).multiplyScalar(170);
    sun.castShadow = Q.shadows;
    sun.shadow.mapSize.set(Q.rich ? 2048 : 1024, Q.rich ? 2048 : 1024);
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.05;
    {
      // Fit the shadow frustum to the two blocks as the sun sees them.
      const sc = sun.shadow.camera, v = new THREE.Vector3();
      sc.position.copy(sun.position);
      sc.lookAt(0, 0, 0);
      sc.updateMatrixWorld();
      const inv = sc.matrixWorld.clone().invert();
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const x of [-42, 42]) for (const y of [22, 46]) for (const z of [-62, 62]) {
        v.set(x, y, z).applyMatrix4(inv);
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z);
      }
      sc.left = x0; sc.right = x1; sc.bottom = y0; sc.top = y1; sc.near = -z1 - 6; sc.far = -z0 + 6;
      sc.updateProjectionMatrix();
    }
    scene.add(sun, sun.target);
    renderer.shadowMap.enabled = Q.shadows;
    renderer.shadowMap.type = THREE.PCFShadowMap; // plain packed depth: the materials do their own filtering
    renderer.shadowMap.autoUpdate = false; // the view asks for it

    // ---- the two snipers. Player 0 always holds the +z perch. ----
    const mkLeap = () => ({ on: false, t: 0, dur: 1, x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, H: 0, roof: 0, mini: false });
    const P = [0, 1].map((i) => {
      const s = W.spawn[i], model = kit.hero(ctx.players[i].color);
      scene.add(model.root);
      if (!Q.rich) model.root.traverse((o) => { o.castShadow = false; });
      return {
        i, x: s.x, y: W.roofs[s.roof].h, z: s.z, vy: 0, roof: s.roof, yaw: s.yaw, pitch: -0.05, alive: true, ko: -1, kvx: 0, kvy: 0, kvz: 0, starT: 0,
        scoped: false, scope: 0, ammo: MAG, bolt: 0, boltStep: 0, reload: 0, recoil: 0, speed: 0, mvx: 0, mvz: 0, stepT: 0, swayX: 0, swayY: 0, swayT: Math.random() * 7, // (each client breathes for its own sniper only)
       
        leap: mkLeap(), leapCd: 0, land: 0, duel: false, leaps: 0, smokes: SMOKES, smokeCd: 0, shotT: -9, pingT: -9, pingX: 0, pingY: 0, pingZ: 0, vis: 0, airN: 0,
        remote: ctx.opponent === 'remote' && i !== ctx.me, bot: null, model, c: rgb(ctx.players[i].color), color: ctx.players[i].color,
        cmd: { mx: 0, my: 0, yaw: s.yaw, pitch: -0.05, fire: false, alt: false, a1: false, a2: false, leapTo: null },
      };
    });
    const me = P[ctx.me];
    let T = 0, wt = 0, suddenAt = -1, tick = 0, killInfo = null, overT = 0, erased = 0, showdownSaid = false;
    const E = new THREE.Vector3(), D = new THREE.Vector3();
    const notes = { text: '', a: 0 }, taught = { fire: false, scope: false, leap: false, at: 0 };
    const note = (text, dur = 2.6) => { notes.text = text; notes.a = dur; };
    const hipSpread = (p) => 0.011 + (Math.min(p.speed, RUN) / RUN) * 0.022 + (p.leap.on ? 0.035 : 0) + p.land * 0.02;
    const arcTmp = mkLeap();
    function setArc(L, p, tx, tz, roofIdx, mini) {
      L.x0 = p.x; L.y0 = p.y; L.z0 = p.z; L.x1 = tx; L.z1 = tz; L.y1 = W.roofs[roofIdx].h; L.roof = roofIdx; L.mini = !!mini;
      const d = Math.hypot(tx - p.x, tz - p.z);
      L.dur = mini ? 0.36 : clamp(0.55 + d / 42, 0.7, 1.6);
      L.H = mini ? 0.8 : 2 + d * 0.11 + Math.max(0, L.y1 - L.y0) * 0.4;
      return L;
    }

    // ---- what the bot and the view share ----
    const G = {
      V, GRAV, ZERO, BOLT, RELOAD, SHOWDOWN, P, notes, taught, hipSpread,
      time: () => T, suddenT: () => (suddenAt >= 0 ? T - suddenAt : -1),
      arcOf: (p, x, z, roof) => setArc(arcTmp, p, x, z, roof, false),
      // The one thing a newcomer must be told, for the device in their hands, until they have done it.
      prompt() {
        if (me.bot || ctx.phase !== 'live' || !me.alive) return '';
        const dev = ctx.input.device;
        if (!taught.fire) return dev === 'touch' ? 'DRAG TO LOOK · TAP FIRE TO SHOOT' : dev === 'gamepad' ? 'RIGHT TRIGGER: FIRE' : 'CLICK TO FIRE';
        if (!taught.scope && T - taught.at < 16) return dev === 'touch' ? 'TAP SCOPE FOR THE LONG SHOT' : dev === 'gamepad' ? 'HOLD LEFT TRIGGER: SCOPE' : 'HOLD RIGHT-CLICK: SCOPE';
        return '';
      },
    };
    const brain = makeBot(ctx, W, G);
    for (const p of P) if (!p.remote && (p.i !== ctx.me || ctx.autopilot)) p.bot = brain.create(p);

    const bullets = [];
    for (let i = 0; i < 8; i++) bullets.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ox: 0, oy: 0, oz: 0, owner: 0, judge: false, age: 0, near: false, flags: 0 });

    // The renderer's own depth material is shared with every other dimension; ours is private.
    const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    scene.traverse((o) => { if (o.isMesh && o.castShadow) o.customDepthMaterial = depthMat; });

    const view = makeView(ctx, THREE, renderer, { scene, W, fx, post, P, G, letters, Q, sfx });

    // ---- shooting ----
    function spawnBullet(owner, ox, oy, oz, dx, dy, dz, judge, flags) {
      const b = bullets.find((q) => !q.on) || bullets[0];
      b.on = true; b.owner = owner; b.judge = judge; b.age = 0; b.near = false; b.flags = flags;
      b.x = b.ox = ox; b.y = b.oy = oy; b.z = b.oz = oz;
      b.vx = dx * V; b.vy = dy * V; b.vz = dz * V;
    }
    // Somebody fired from (x, y, z): the flash, the report, the lettering — and the tell.
    function report(p, x, y, z, dx, dy, dz) {
      const mine = p === me;
      fx.flash(x + dx * 0.25, y + dy * 0.25, z + dz * 0.25, mine ? 0.75 : 1.5, 0.11, STAR[0]);
      fx.puff(x + dx * 0.5, y + dy * 0.5, z + dz * 0.5, dx * 2, 0.5, dz * 2, 0.12, 0.42, 0.55, SMOKE);
      sfx.shot(x, y, z, mine);
      if (!(mine && p.scope > 0.6)) view.pop('BLAM', x + dx * 1.4, y + (mine ? 0.75 : 1.5), z + dz * 1.4, mine ? 0.62 : 1.2, 0.85);
      p.shotT = p.pingT = T; p.pingX = x; p.pingY = y; p.pingZ = z;
      p.recoil = 1;
      fx.scare(x, y, z, 7);
    }
    function shoot(p) {
      const scoped = p.scope > 0.6, human = p === me && !p.bot, foe = P[1 - p.i];
      let yaw = p.yaw, pitch = p.pitch;
      E.set(p.x, p.y + EYE, p.z);
      if (scoped) { yaw += p.swayX; pitch += p.swayY; }
      else {
        if (human && view.aim(E, D)) { yaw = Math.atan2(-D.x, -D.z); pitch = Math.asin(clamp(D.y, -1, 1)); } // converge on what the crosshair covers
        const s = hipSpread(p);
        yaw += gauss(Math.random) * s; pitch += gauss(Math.random) * s * 0.8;
      }
      pitch += ZERO;
      const cp = Math.cos(pitch), dx = -Math.sin(yaw) * cp, dy = Math.sin(pitch), dz = -Math.cos(yaw) * cp;
      const m = W.ray(E.x, E.y, E.z, dx, dy, dz, 1.1, T) < 1.1 ? 0 : 0.95; // never start a round on the far side of a wall
      const ox = E.x + dx * m, oy = E.y + dy * m - 0.05, oz = E.z + dz * m;
      // 1 from the hip · 2 mid-leap · 4 through smoke · 8 a bot's ranging shot (cannot kill)
      const flags = (scoped ? 0 : 1) | (p.leap.on ? 2 : 0) | (W.smoked(E.x, E.y, E.z, foe.x, foe.y + 1, foe.z, T) ? 4 : 0) | (p.bot && T < p.bot.lethalAt ? 8 : 0);
      spawnBullet(p.i, ox, oy, oz, dx, dy, dz, true, flags);
      report(p, ox, oy, oz, dx, dy, dz);
      p.ammo--;
      if (p.ammo > 0) { p.bolt = BOLT; p.boltStep = 0; } else { p.reload = RELOAD; if (p === me) sfx.reload(); }
      if (p === me) view.kick(scoped ? 1 : 0.7);
      if (human && !taught.fire) { taught.fire = true; taught.at = T; }
      ctx.net.send({ k: 's', o: [+ox.toFixed(2), +oy.toFixed(2), +oz.toFixed(2)], d: [+dx.toFixed(4), +dy.toFixed(4), +dz.toFixed(4)] });
    }

    // Closest approach of segment o→o+d*len (d unit) to point c: distance², sets segT.
    let segT = 0;
    const segPoint = (ox, oy, oz, dx, dy, dz, len, cx, cy, cz) => {
      segT = clamp((cx - ox) * dx + (cy - oy) * dy + (cz - oz) * dz, 0, len);
      const x = ox + dx * segT - cx, y = oy + dy * segT - cy, z = oz + dz * segT - cz;
      return x * x + y * y + z * z;
    };

    function stepBullets(dt) {
      for (let n = 0; n < bullets.length; n++) {
        const b = bullets[tick ? bullets.length - 1 - n : n];
        if (!b.on) continue;
        let rem = dt;
        const q = P[b.owner], foe = P[1 - b.owner];
        while (rem > 1e-5 && b.on) {
          const sp = Math.hypot(b.vx, b.vy, b.vz), h = Math.min(rem, 3 / sp);
          const mx = b.vx * h, my = b.vy * h - 0.5 * GRAV * h * h, mz = b.vz * h, len = Math.hypot(mx, my, mz), dx = mx / len, dy = my / len, dz = mz / len;
          const tEnv = W.ray(b.x, b.y, b.z, dx, dy, dz, len, T);
          const kind = hit.kind, surf = hit.surf, nx = hit.nx, ny = hit.ny, nz = hit.nz;
          let tHit = -1, head = false;
          if (b.judge && !(b.flags & 8) && foe.alive && ctx.phase === 'live') {
            for (let i = 0; i < 4; i++) if (segPoint(b.x, b.y, b.z, dx, dy, dz, len, foe.x, foe.y + 0.36 + i * 0.36, foe.z) < 0.105 && (tHit < 0 || segT < tHit)) tHit = segT;
            if (segPoint(b.x, b.y, b.z, dx, dy, dz, len, foe.x, foe.y + HEAD, foe.z) < 0.052) { tHit = tHit < 0 ? segT : Math.min(tHit, segT); head = true; }
          }
          // A round that passes close is felt — and lettered — whoever is judging it.
          if (!b.near && foe.alive && b.age > 0.03 && tHit < 0) {
            const d2 = segPoint(b.x, b.y, b.z, dx, dy, dz, len, foe.x, foe.y + 1.1, foe.z);
            if (d2 < 6 && segT < len - 0.01 && segT > 0.01 && segT < tEnv) {
              b.near = true;
              brain.underFire(foe);
              view.pop('WHIFF', b.x + dx * segT, b.y + dy * segT + 0.5, b.z + dz * segT, 0.8, 0.7);
              if (foe === me && !me.bot) { sfx.whiff(clamp((b.vx * Math.cos(me.yaw) - b.vz * Math.sin(me.yaw)) / V, -1, 1)); view.shake(0.3); }
            }
          }
          if (tHit >= 0 && tHit <= tEnv) {
            b.on = false;
            const hx = b.x + dx * tHit, hy = b.y + dy * tHit, hz = b.z + dz * tHit;
            const range = Math.round(Math.hypot(hx - b.ox, hy - b.oy, hz - b.oz));
            const how = foe.leap.on && !foe.leap.mini ? `SHOT OUT OF THE AIR · ${range} M` : b.flags & 2 ? `MID-LEAP · ${range} M` : b.flags & 4 ? `THROUGH THE SMOKE · ${range} M` : b.flags & 1 && range > 25 ? `FROM THE HIP · ${range} M` : head ? `HEADSHOT · ${range} M` : `${range} M`;
            killInfo = { v: foe.i, dx, dy, dz, head };
            ctx.net.send({ k: 'k', v: foe.i, d: [+dx.toFixed(3), +dy.toFixed(3), +dz.toFixed(3)], h: head ? 1 : 0 });
            ctx.kill(foe.i, { how });
          } else if (kind) {
            b.on = false;
            const x = b.x + dx * tEnv, y = b.y + dy * tEnv, z = b.z + dz * tEnv;
            fx.impact(x, y, z, nx, ny, nz, CHIP[surf] || CHIP.brick, kind === 4 ? CANVAS : null);
            sfx.impact(x, y, z, surf);
            if (kind !== 3) view.pop(WORD[surf] || 'KRAK', x + nx * 0.6, y + ny * 0.6 + 0.7, z + nz * 0.6, 0.85, 0.75);
          } else {
            b.x += mx; b.y += my; b.z += mz;
            b.vy -= GRAV * h;
            b.age += h;
            rem -= h;
            if (b.age > 2.4) b.on = false;
          }
        }
        if (b.on) {
          // Always visible: a white-hot slug and a streak in the shooter's colour, both inked by the press.
          const sp = Math.hypot(b.vx, b.vy, b.vz), ux = b.vx / sp, uy = b.vy / sp, uz = b.vz / sp, tail = Math.min(11, b.age * sp);
          fx.beam(b.x - ux * 1.6, b.y - uy * 1.6, b.z - uz * 1.6, b.x + ux * 0.5, b.y + uy * 0.5, b.z + uz * 0.5, 0.2, 1, 0.98, 0.86);
          if (tail > 1.7) fx.beam(b.x - ux * tail, b.y - uy * tail, b.z - uz * tail, b.x - ux * 1.6, b.y - uy * 1.6, b.z - uz * 1.6, 0.11, q.c[0], q.c[1], q.c[2]);
        }
      }
    }

    // ---- leaping, landing, smoke ----
    function startLeap(p, tx, tz, roofIdx, mini) {
      setArc(p.leap, p, tx, tz, roofIdx, mini);
      p.leap.on = true; p.leap.t = 0;
      p.scoped = false;
      if (mini) { if (p === me) sfx.hop(); return; }
      for (let i = 0; i < 5; i++) fx.puff(p.x + (Math.random() - 0.5) * 0.8, p.y + 0.2, p.z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 3, 0.4, (Math.random() - 0.5) * 3, 0.2, 0.75, 0.7, i & 1 ? CREAM : FLAME);
      view.pop('FWOOSH', p.x, p.y + 2.6, p.z, p === me ? 0.7 : 1.1, 0.8);
      sfx.leap(p.x, p.y, p.z, p === me);
      fx.scare(p.x, p.y, p.z, 8);
    }
    function touchDown(p, hard) {
      p.land = hard ? 1 : 0.45;
      sfx.land(p.x, p.y, p.z, p === me, hard);
      if (!hard) return;
      for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.283; fx.puff(p.x + Math.cos(a) * 0.4, p.y + 0.15, p.z + Math.sin(a) * 0.4, Math.cos(a) * 3.4, 0.25, Math.sin(a) * 3.4, 0.16, 0.6, 0.6, DUST); }
      view.pop('THUD', p.x, p.y + 0.9, p.z, p === me ? 0.7 : 1, 0.7);
      fx.scare(p.x, p.y, p.z, 10);
      if (p === me) view.shake(0.4);
    }
    function popSmoke(p, x, y, z) {
      W.smokes.push({ x, y: y + 1.5, z, r: SMOKE_R, t0: T, t1: T + SMOKE_LIFE });
      fx.cloud(x, y + 1.7, z, SMOKE_R, SMOKE_LIFE);
      view.pop('POOF', x, y + 3.6, z, p === me ? 0.9 : 1.3, 1.1);
      sfx.poof(x, y, z, p === me);
      fx.scare(x, y, z, 9);
    }

    // ---- one sniper, one frame ----
    // `first`: a frame's look delta and trigger pulls are spent once, however many slices it is cut into.
    function humanCmd(p, first) {
      const inp = ctx.input, c = p.cmd, k = first ? LOOK * lerp(1, 0.26, p.scope) : 0;
      c.mx = inp.moveX; c.my = inp.moveY;
      c.yaw = p.yaw - inp.lookX * k;
      c.pitch = clamp(p.pitch - inp.lookY * k, -1.2, 1.2);
      c.fire = first && inp.firePressed; c.alt = inp.alt; c.a1 = first && inp.a1Pressed; c.a2 = first && inp.a2Pressed;
      c.leapTo = null;
      return c;
    }

    function step(p, cmd, dt) {
      p.yaw = cmd.yaw;
      p.pitch = cmd.pitch;
      p.recoil = Math.max(0, p.recoil - dt * 5);
      p.land = Math.max(0, p.land - dt * 3.2);
      if (!p.alive) return;
      const live = ctx.phase === 'live', ts = G.suddenT(), L = p.leap;
      p.scoped = live && cmd.alt && p.reload <= 0 && !L.on;
      p.scope = damp(p.scope, p.scoped ? 1 : 0, 14, dt);
      if (p === me && !p.bot && p.scope > 0.8) taught.scope = true;
      // Breathing: the scope swells and settles on a 3.4 s cycle; moving and the bolt throw it wide.
      p.swayT += dt;
      const t = p.swayT, lull = 0.26 + 0.74 * Math.abs(Math.sin((t * Math.PI) / 3.4));
      const amp = 0.003 * lull * (p.speed > 0.3 ? 2.2 : 1) * (p.bolt > 0 ? 2.6 : 1) * (1 + p.land * 2) * (ts >= 0 ? 0.45 : 1);
      p.swayX = amp * (Math.sin(t * 1.13 + p.i) + 0.5 * Math.sin(t * 2.71 + 1.3));
      p.swayY = amp * (0.9 * Math.cos(t * 0.87 + 2 * p.i) + 0.45 * Math.sin(t * 2.23));
      if (!live) { p.speed = p.mvx = p.mvz = 0; return; }
      p.leapCd = Math.max(0, p.leapCd - dt);
      p.smokeCd = Math.max(0, p.smokeCd - dt);
      const ox = p.x, oz = p.z;
      if (L.on) {
        L.t += dt;
        const u = Math.min(1, L.t / L.dur);
        p.x = lerp(L.x0, L.x1, u); p.z = lerp(L.z0, L.z1, u); p.y = lerp(L.y0, L.y1, u) + L.H * 4 * u * (1 - u);
        if (u >= 1) { L.on = false; p.roof = L.roof; p.y = L.y1; p.vy = 0; touchDown(p, !L.mini); }
        else if (!L.mini && Math.random() < dt * 30) fx.puff(p.x, p.y + 0.1, p.z, 0, -1.5, 0, 0.14, 0.4, 0.45, FLAME);
      } else {
        const sp = RUN * (p.scoped ? 0.3 : 1) * (p.reload > 0 ? 0.85 : 1) * (1 - p.land * 0.5);
        let f = -cmd.my, s = cmd.mx;
        const m = Math.hypot(f, s);
        if (m > 1) { f /= m; s /= m; }
        const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
        const res = W.walk(p, (-sy * f + cy * s) * sp * dt, (-cy * f - sy * s) * sp * dt);
        if (res === 2 && m > 0.6 && !p.scoped) { startLeap(p, W.lt.x, W.lt.z, W.lt.roof, true); ctx.net.send({ k: 'l', x: +W.lt.x.toFixed(2), z: +W.lt.z.toFixed(2), r: W.lt.roof, m: 1 }); }
        if (p.duel) { const sd = W.showdown[p.i], d = Math.hypot(p.x - sd.x, p.z - sd.z); if (d > 3.2) { p.x = sd.x + ((p.x - sd.x) / d) * 3.2; p.z = sd.z + ((p.z - sd.z) / d) * 3.2; } }
        // gravity: down any drop, up a low step
        const h = W.roofs[p.roof].h;
        if (p.y > h + 0.001) { p.vy -= 28 * dt; p.y += p.vy * dt; if (p.y <= h) { const hard = p.vy < -8; p.y = h; p.vy = 0; if (hard || p === me) touchDown(p, hard); } }
        else if (p.y < h) { p.y = Math.min(h, p.y + 9 * dt); p.vy = 0; }
      }
      if (dt > 0) { p.mvx = clamp((p.x - ox) / dt, -40, 40); p.mvz = clamp((p.z - oz) / dt, -40, 40); }
      p.speed = Math.hypot(p.mvx, p.mvz);
      if (p === me && !L.on) { p.stepT += Math.min(p.speed, RUN) * dt; if (p.stepT > 2.2) { p.stepT = 0; sfx.step(); } }
      // The bolt: two sounds, and no shooting until it is home.
      if (p.bolt > 0) {
        p.bolt -= dt;
        const ph = 1 - p.bolt / BOLT;
        if (p.boltStep < 2 && ph > (p.boltStep ? 0.7 : 0.25)) { if (p === me) sfx.bolt(p.boltStep); if (p.boltStep === 0) fx.chip(p.x + Math.cos(p.yaw) * 0.3, p.y + 1.4, p.z - Math.sin(p.yaw) * 0.3, Math.cos(p.yaw) * 2.2, 2.4, -Math.sin(p.yaw) * 2.2, 0.06, 0.9, STAR[0]); p.boltStep++; }
      }
      if (p.reload > 0) { p.reload -= dt; if (p.reload <= 0) p.ammo = MAG; }
      if (cmd.fire) { if (p.bolt <= 0 && p.reload <= 0 && p.ammo > 0) shoot(p); else if (p === me && !p.bot) sfx.dry(); }
      if (cmd.a1 && !L.on && !p.duel) {
        if (p.leapCd > 0) { if (p === me && !p.bot) sfx.deny(); }
        else {
          const to = cmd.leapTo || view.lt;
          if (to && (cmd.leapTo || to.ok) && Math.hypot(to.x - p.x, to.z - p.z) <= LEAP_MAX + 2) {
            p.leapCd = LEAP_CD;
            p.leaps++;
            startLeap(p, to.x, to.z, to.roof, false);
            if (p === me && !p.bot) taught.leap = true;
            ctx.net.send({ k: 'l', x: +to.x.toFixed(2), z: +to.z.toFixed(2), r: to.roof, m: 0 });
          } else if (p === me && !p.bot) { sfx.deny(); note('NO ROOFTOP THAT WAY — LOOK AT ONE', 2); }
        }
      }
      if (cmd.a2 && ts < 0) {
        if (p.smokes > 0 && p.smokeCd <= 0) {
          p.smokes--; p.smokeCd = SMOKE_CD;
          popSmoke(p, p.x, p.y, p.z);
          ctx.net.send({ k: 'm', x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) });
        } else if (p === me && !p.bot) sfx.deny();
      }
    }

    function puppet(p, dt) {
      const r = ctx.net.remote;
      p.recoil = Math.max(0, p.recoil - dt * 5);
      p.land = Math.max(0, p.land - dt * 3.2);
      if (p.leap.on) { p.leap.t += dt; if (p.leap.t >= p.leap.dur) { p.leap.on = false; if (p.alive) touchDown(p, !p.leap.mini); } }
      if (!r || !p.alive) return;
      p.x = r.x; p.y = r.y; p.z = r.z; p.yaw = r.yaw; p.pitch = r.pitch;
      p.scoped = !!r.sc; p.scope = damp(p.scope, r.sc ? 1 : 0, 14, dt);
      p.mvx = r.vx; p.mvz = r.vz; p.speed = Math.hypot(r.vx, r.vz); p.airN = r.air ? 1 : 0;
      p.ammo = Math.round(r.am); // (numbers arrive interpolated)
    }

    const pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, speed: 0, lvx: 0, lvz: 0, aim: 0, recoil: 0, air: 0, land: 0, ko: -1 };

    function fell(v) {
      const ki = killInfo && killInfo.v === v.i ? killInfo : null, w = P[1 - v.i];
      let dx = ki ? ki.dx : v.x - w.x, dz = ki ? ki.dz : v.z - w.z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      v.alive = false; v.ko = 0; v.scoped = false; v.leap.on = false;
      v.kvx = dx * 9 + (Math.random() - 0.5) * 3; v.kvy = 11.5; v.kvz = dz * 9 + (Math.random() - 0.5) * 3;
      fx.flash(v.x - dx * 0.4, v.y + 1.2, v.z - dz * 0.4, 1.5, 0.42, STAR[0]);
      for (let i = 0; i < 22; i++) { const a = Math.random() * 6.283, s = 3 + Math.random() * 8; fx.star(v.x, v.y + 1.2, v.z, Math.cos(a) * s + dx * 5, 2 + Math.random() * 9, Math.sin(a) * s + dz * 5, 0.18 + Math.random() * 0.3, 1.1 + Math.random() * 0.8, 9, i % 4 === 3 ? w.c : STAR[i % 3]); }
      const wn = ctx.players[w.i].name, ln = ctx.players[v.i].name;
      const word = ki && ki.head ? 'ZOK' : pick(Math.random, ['KAPOW', 'WHAM', 'KAPOW']);
      view.killCam(v, dx, dz, word, pick(Math.random, [`${ln} EXITS, PANEL RIGHT.`, `ONE SHOT. ONE PANEL. ${wn}.`, `MEANWHILE, ${ln} LEARNS TO FLY…`, `AND THAT, DEAR READER, WAS ${ln}.`]));
      post.u.uSplashCol.value.set(w.c[0], w.c[1], w.c[2]);
      sfx.kill();
      view.flash(0.7);
      overT = 0;
    }

    function frame(dt, now, first, rdt) {
      const phase = ctx.phase;
      T = now;
      wt += rdt;
      mats.shared.uTime.value = wt;
      // sudden death: the eraser, then the final panel
      if (ctx.sudden && suddenAt < 0) { suddenAt = T; W.smokes.length = 0; note('THE ARTIST REACHES FOR THE ERASER…', 4); sfx.erase(); view.pop('SKRITCH', me.x, me.y + 3, me.z, 0.9, 1.6, true); }
      const ts = G.suddenT();
      if (ts >= 0) {
        const k = clamp(ts / 2.2, 0, 1);
        if (k !== erased) { erased = k; if (city.setErase(k)) view.shadows(); }
        W.erased = ts > 1.1;
        if (ts >= SHOWDOWN && phase === 'live') {
          if (!showdownSaid) { showdownSaid = true; note('FINAL PANEL: FACE TO FACE', 4); sfx.showdown(); }
          for (const p of P) {
            if (p.remote || !p.alive || p.duel) continue;
            p.duel = true;
            const sd = W.showdown[p.i];
            if (p.roof !== sd.roof || Math.hypot(p.x - sd.x, p.z - sd.z) > 3 || p.leap.on) { startLeap(p, sd.x, sd.z, sd.roof, false); ctx.net.send({ k: 'l', x: sd.x, z: sd.z, r: sd.roof, m: 0 }); }
          }
        }
      }
      fx.update(phase === 'over' ? dt : rdt, T, wt, view.camera, rdt);
      if (fx.trainNow) { sfx.train(); view.pop('RATTLE', 0, 16, 0, 1.5, 1.6); }
      tick ^= 1; // neither sniper always moves first
      for (let n = 0; n < 2; n++) {
        const p = P[n ^ tick];
        if (p.remote) puppet(p, dt);
        else step(p, !p.bot ? humanCmd(p, first) : p.alive && phase === 'live' ? brain.think(p, P[1 - p.i], dt, p.cmd) : p.cmd, dt);
        if (p.ko >= 0) {
          // knocked out of the panel, trailing stars
          p.ko += dt;
          p.kvy -= 15 * dt;
          p.x += p.kvx * dt; p.y += p.kvy * dt; p.z += p.kvz * dt;
          p.starT -= dt;
          if (p.starT <= 0 && p.ko < 1.2) { p.starT = 0.035; fx.star(p.x, p.y + 1, p.z, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.14 + Math.random() * 0.2, 0.8, 5, STAR[(Math.random() * 3) | 0]); }
        }
      }
      if (phase !== 'intro') stepBullets(dt);
      for (let i = W.smokes.length - 1; i >= 0; i--) if (T > W.smokes[i].t1) W.smokes.splice(i, 1);
      notes.a = Math.max(0, notes.a - rdt);

      view.update(dt, rdt);
      city.update(T);
      // Bodies after the camera, so a scoped sniper never sees the inside of their own hat.
      for (const p of P) {
        const s = pose, sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
        s.x = p.x; s.y = p.y; s.z = p.z; s.yaw = p.yaw; s.pitch = p.pitch; s.speed = Math.min(p.speed, RUN * 1.2);
        s.lvx = cy * p.mvx - sy * p.mvz; s.lvz = sy * p.mvx + cy * p.mvz;
        s.aim = p.scope > 0.3 ? 1 : lerp(0.75, 0.1, clamp(p.speed / RUN, 0, 1)) * (p.reload > 0 ? 0.4 : 1);
        s.recoil = p.recoil; s.land = p.land; s.ko = p.ko;
        s.air = p.leap.on ? Math.max(0.02, p.leap.t / p.leap.dur) : p.airN ? 0.5 : 0;
        p.model.update(phase === 'over' ? dt : rdt, s);
        p.model.root.visible = !(p === me && view.S.scope > 0.5 && p.alive) && p.y > -30;
        // sudden death: a column of your colour says where you are
        if (ts >= 0 && p.alive && phase === 'live') fx.beam(p.x, p.y + 2.6, p.z, p.x, p.y + 30, p.z, 0.12 + Math.sin(wt * 8 + p.i) * 0.03, p.c[0], p.c[1], p.c[2]);
      }
      fx.end();

      const m = me;
      ctx.net.sendState({ x: +m.x.toFixed(2), y: +m.y.toFixed(2), z: +m.z.toFixed(2), yaw: +m.yaw.toFixed(3), pitch: +m.pitch.toFixed(3), sc: m.scoped ? 1 : 0, vx: +m.mvx.toFixed(1), vz: +m.mvz.toFixed(1), air: m.leap.on && !m.leap.mini ? 1 : 0, am: m.ammo });
      ctx.hud.cooldown('fire', m.reload > 0 ? m.reload / RELOAD : Math.max(0, m.bolt) / BOLT);
      ctx.hud.charges('fire', m.ammo);
      ctx.hud.cooldown('a1', m.duel ? 1 : m.leapCd / LEAP_CD);
      ctx.hud.cooldown('a2', m.smokes > 0 && ts < 0 ? m.smokeCd / SMOKE_CD : 1);
      ctx.hud.charges('a2', m.smokes);
    }

    const inst = {
      // The core clamps a frame's step but the round clock keeps real time: a client that
      // draws slowly would otherwise play in slow motion and fall behind its own world (and
      // its opponent). A live frame simulates however long the clock says has passed, in
      // slices short enough for the collision code.
      update(dt) {
        if (ctx.phase === 'over') {
          // the splash page holds almost still for a full second (the core is already in slow
          // motion) so it can be read, then lets go
          const rdt = dt / 0.35;
          overT += rdt;
          const sdt = overT < 1 ? dt * 0.04 : dt;
          frame(sdt, T + sdt, true, rdt);
          return;
        }
        if (ctx.phase !== 'live') { frame(dt, ctx.time, true, dt); return; }
        const t0 = T, span = Math.max(0, ctx.time - t0), n = clamp(Math.ceil(span / 0.0505), 1, me.bot ? 60 : 6);
        for (let i = 1; i <= n && (i === 1 || ctx.phase === 'live'); i++) frame(Math.min(span / n, 0.05), t0 + (span * i) / n, i === 1, span / n);
      },

      render() { view.render(); },
      resize(w, h) { view.resize(w, h); },

      onPhase(phase) {
        if (phase === 'intro') view.beginIntro();
        else if (phase === 'live') { sfx.music(); view.poke(); }
        else if (phase === 'over') {
          const r = ctx.result;
          if (r && r.victim >= 0) fell(P[r.victim]);
        }
      },

      onNet(msg) {
        const foe = P[1 - ctx.me];
        if (msg.k === 's') {
          spawnBullet(foe.i, msg.o[0], msg.o[1], msg.o[2], msg.d[0], msg.d[1], msg.d[2], false, 0);
          report(foe, msg.o[0], msg.o[1], msg.o[2], msg.d[0], msg.d[1], msg.d[2]);
        } else if (msg.k === 'l') { if (W.roofs[msg.r]) startLeap(foe, msg.x, msg.z, msg.r, !!msg.m); }
        else if (msg.k === 'm') popSmoke(foe, msg.x, msg.y, msg.z);
        else if (msg.k === 'k') killInfo = { v: msg.v & 1, dx: msg.d[0], dy: msg.d[1], dz: msg.d[2], head: !!msg.h };
      },

      focus() { return view.focus(); },

      dispose() {
        ctx.audio.stopMusic(0.3);
        renderer.setRenderTarget(null);
        renderer.shadowMap.autoUpdate = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.shadowMap.enabled = false;
        view.dispose();
        post.dispose();
        depthMat.dispose();
        fx.dispose();
        kit.dispose();
        city.dispose();
        letters.dispose();
        disposeTree(scene);
        mats.dispose();
        art.dispose();
      },
    };
    inst.view = view; // test scripts only: view.shot = { x, y, z, tx, ty, tz, fov } pins the camera
    inst.P = P; inst.Q = Q; inst.G = G; inst.W = W; inst.post = post; inst.scene = scene;
    post.resize();
    return inst;
  },
};
