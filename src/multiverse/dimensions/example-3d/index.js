// EXAMPLE 3D — the smallest complete three.js dimension, kept as a template and a test
// fixture (dev: true keeps it out of the match rotation).
//
// Shows: the SHARED renderer (never dispose / resize it), 'look' aiming with a scope on
// `alt`, the 2D overlay canvas for the reticle, hitscan judged by the shooter, a bot,
// the remote puppet, sudden death, and freeing every GPU resource in dispose().
import { clamp, angLerp, angDiff, rand, gauss, resolveCircleRects, disposeTree } from '../../kit.js';
import { segSegClosest, segBox } from '../../../util.js';

const SIZE = 42; // arena half extent, metres
const EYE = 1.6, RADIUS = 0.42, SPEED = 6.2, RELOAD = 1.3, RANGE = 220;
const LOOK = 0.0022; // radians per look unit — same feel as the valley

export default {
  id: 'example-3d',
  name: 'TEST CUBE',
  tagline: 'The smallest complete 3D dimension.',
  perspective: 'FIRST PERSON 3D',
  renderer: 'three',
  aim: 'look',
  dev: true,
  palette: { bg: '#1a1626', fg: '#f1ecff', accent: '#ff9d5c' },
  controls: { fire: 'FIRE', alt: 'SCOPE', jump: 'JUMP' },
  hint: 'Low crates hide you; tall ones stop bullets.',
  altToggle: true,
  angleFields: ['yaw', 'pitch'],

  create(ctx) {
    const { THREE, renderer } = ctx.three;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#1a1626');
    scene.fog = new THREE.Fog('#1a1626', 40, 150);
    const camera = new THREE.PerspectiveCamera(70, ctx.width / ctx.height, 0.05, 400);
    camera.rotation.order = 'YXZ';
    scene.add(new THREE.HemisphereLight('#cfc4ff', '#241c33', 1.4));
    const sun = new THREE.DirectionalLight('#ffd9b0', 1.6);
    sun.position.set(30, 60, 20);
    scene.add(sun);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(SIZE * 2, SIZE * 2).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#2a2440' }));
    scene.add(floor, new THREE.GridHelper(SIZE * 2, 21, '#ff9d5c', '#463a66'));

    // ---- cover: seeded, mirrored through the centre ----
    const boxes = []; // { min:[x,y,z], max:[x,y,z], rect (xz footprint for movement), mesh }
    const boxMat = new THREE.MeshLambertMaterial({ color: '#5a4a8a', transparent: true });
    const addBox = (x, z, w, h, d) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boxMat);
      mesh.position.set(x, h / 2, z);
      scene.add(mesh);
      boxes.push({ min: [x - w / 2, 0, z - d / 2], max: [x + w / 2, h, z + d / 2], rect: { x: x - w / 2, y: z - d / 2, w, h: d }, mesh });
    };
    for (let i = 0; i < 9; i++) {
      const w = rand(ctx.rng, 2, 7), d = rand(ctx.rng, 2, 7), h = ctx.rng() < 0.5 ? 1.2 : 3.2;
      const x = rand(ctx.rng, -SIZE + 5, SIZE - 5), z = rand(ctx.rng, 4, SIZE - 9);
      addBox(x, z, w, h, d);
      addBox(-x, -z, w, h, d);
    }
    const walls = [{ x: -SIZE - 5, y: -SIZE - 5, w: SIZE * 2 + 10, h: 5 }, { x: -SIZE - 5, y: SIZE, w: SIZE * 2 + 10, h: 5 }, { x: -SIZE - 5, y: -SIZE, w: 5, h: SIZE * 2 }, { x: SIZE, y: -SIZE, w: 5, h: SIZE * 2 }];
    const rects = boxes.map((b) => b.rect).concat(walls);
    const solid = () => (ctx.sudden ? walls : rects); // sudden death: cover phases out

    // ---- players. Forward for a yaw is (-sin yaw, 0, -cos yaw), as in the valley. ----
    const bodyGeo = new THREE.CapsuleGeometry(RADIUS, 1.0, 4, 10);
    const beaconGeo = new THREE.CylinderGeometry(0.12, 0.12, 60, 6);
    const P = [0, 1].map((i) => {
      const mat = new THREE.MeshLambertMaterial({ color: ctx.players[i].color, emissive: ctx.players[i].color, emissiveIntensity: 0.25 });
      const mesh = new THREE.Mesh(bodyGeo, mat);
      const beacon = new THREE.Mesh(beaconGeo, new THREE.MeshBasicMaterial({ color: ctx.players[i].color, transparent: true, opacity: 0.6, fog: false }));
      beacon.position.y = 31;
      beacon.visible = false;
      mesh.add(beacon);
      scene.add(mesh);
      return {
        i, pos: { x: 0, y: i ? -(SIZE - 4) : SIZE - 4 }, // pos.y is world Z (kit's 2D helpers work on x/y)
        h: 0, vy: 0, yaw: i ? Math.PI : 0, pitch: 0, alive: true, reload: 0, fall: 0, mesh, beacon,
        remote: ctx.opponent === 'remote' && i !== ctx.me, bot: null,
      };
    });
    for (const p of P) {
      if (!p.remote && (p.i !== ctx.me || ctx.autopilot)) p.bot = { wx: p.pos.x, wz: p.pos.y, wander: 0, seen: 0, ey: 0, ep: 0 };
    }
    const tracers = [];
    const tracerMat = new THREE.LineBasicMaterial({ color: '#fff3c4', transparent: true });
    let scope = 0, kick = 0;
    const a3 = new THREE.Vector3(), b3 = new THREE.Vector3(), c3 = new THREE.Vector3(), d3 = new THREE.Vector3();

    const eye = (p, out) => out.set(p.pos.x, p.h + EYE, p.pos.y);
    const aimDir = (yaw, pitch, out) => out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));

    // Fraction (0..1) along from→to at which cover blocks the segment, or 1.
    function coverHit(from, to) {
      if (ctx.sudden) return 1;
      let t = 1;
      for (const b of boxes) {
        const r = segBox(from.x, from.y, from.z, to.x - from.x, to.y - from.y, to.z - from.z, b);
        if (r && r.t < t) t = r.t;
      }
      return t;
    }

    function humanCmd(p) {
      const inp = ctx.input;
      const k = LOOK * (inp.alt ? 0.35 : 1);
      return { mx: inp.moveX, my: inp.moveY, yaw: p.yaw - inp.lookX * k, pitch: clamp(p.pitch - inp.lookY * k, -1.4, 1.4), fire: inp.firePressed, jump: inp.jumpPressed };
    }

    function botCmd(p, e, dt) {
      const b = p.bot, skill = ctx.botSkill;
      b.wander -= dt;
      if (b.wander <= 0 || Math.hypot(b.wx - p.pos.x, b.wz - p.pos.y) < 1.5) {
        b.wander = 1.5 + Math.random() * 2.5;
        b.wx = clamp(p.pos.x + (Math.random() - 0.5) * 30, -SIZE + 2, SIZE - 2);
        b.wz = clamp(p.pos.y + (Math.random() - 0.5) * 30, -SIZE + 2, SIZE - 2);
      }
      eye(p, a3);
      c3.set(e.pos.x, e.h + 1.0, e.pos.y);
      const sees = e.alive && coverHit(a3, c3) >= 1;
      const newErr = () => { b.ey = gauss(Math.random) * (0.03 - 0.022 * skill); b.ep = gauss(Math.random) * (0.02 - 0.014 * skill); };
      if (sees) b.seen += dt;
      else { b.seen = 0; newErr(); }
      let wantYaw, wantPitch = 0;
      if (sees) {
        const dx = c3.x - a3.x, dy = c3.y - a3.y, dz = c3.z - a3.z;
        wantYaw = Math.atan2(-dx, -dz) + b.ey;
        wantPitch = Math.atan2(dy, Math.hypot(dx, dz)) + b.ep;
      } else wantYaw = Math.atan2(-(b.wx - p.pos.x), -(b.wz - p.pos.y));
      const k = 1 - Math.exp(-dt * (3 + 7 * skill));
      const yaw = angLerp(p.yaw, wantYaw, k), pitch = p.pitch + (wantPitch - p.pitch) * k;
      let fire = false;
      if (sees && b.seen > 1.1 - 0.7 * skill && p.reload <= 0 && Math.abs(angDiff(yaw, wantYaw)) < 0.012) { fire = true; newErr(); }
      // Walk towards the waypoint: express the world-space direction in the bot's own frame.
      const wx = b.wx - p.pos.x, wz = b.wz - p.pos.y, wl = Math.hypot(wx, wz) || 1;
      const f = (-Math.sin(yaw) * wx - Math.cos(yaw) * wz) / wl, s = (Math.cos(yaw) * wx - Math.sin(yaw) * wz) / wl;
      return { mx: s, my: -f, yaw, pitch, fire, jump: false };
    }

    function step(p, cmd, dt) {
      p.yaw = cmd.yaw;
      p.pitch = cmd.pitch;
      if (ctx.phase !== 'live' || !p.alive) return; // intro: look around, stay put
      p.reload = Math.max(0, p.reload - dt);
      const f = -cmd.my, s = cmd.mx;
      p.pos.x += (-Math.sin(p.yaw) * f + Math.cos(p.yaw) * s) * SPEED * dt;
      p.pos.y += (-Math.cos(p.yaw) * f - Math.sin(p.yaw) * s) * SPEED * dt;
      resolveCircleRects(p.pos, RADIUS, solid());
      if (cmd.jump && p.h <= 0) p.vy = 5.5;
      p.vy -= 16 * dt;
      p.h = Math.max(0, p.h + p.vy * dt);
      if (p.h <= 0) p.vy = 0;
      if (cmd.fire && p.reload <= 0) {
        p.reload = RELOAD;
        eye(p, a3);
        aimDir(p.yaw, p.pitch, b3).multiplyScalar(RANGE).add(a3);
        // The shooter judges the shot: nearest of cover and the enemy's capsule.
        const wallT = coverHit(a3, b3);
        const e = P[1 - p.i];
        let hit = false, head = false;
        if (e.alive) {
          c3.set(e.pos.x, e.h + 0.3, e.pos.y);
          d3.set(e.pos.x, e.h + 1.62, e.pos.y);
          const r = segSegClosest(a3, b3, c3, d3);
          hit = r.d2 <= 0.4 * 0.4 && r.s <= wallT;
          head = r.t > 0.84;
        }
        const end = b3.clone().sub(a3).multiplyScalar(hit ? segSegClosest(a3, b3, c3, d3).s : wallT).add(a3);
        tracer(a3, end, p.i);
        ctx.net.send({ k: 'shot', o: [+a3.x.toFixed(2), +a3.y.toFixed(2), +a3.z.toFixed(2)], e: [+end.x.toFixed(2), +end.y.toFixed(2), +end.z.toFixed(2)] });
        if (hit) ctx.kill(e.i, { how: head ? 'HEADSHOT' : `${Math.round(a3.distanceTo(end))} M` });
      }
    }

    function tracer(from, to, owner) {
      const geo = new THREE.BufferGeometry().setFromPoints([from.clone().add(new THREE.Vector3(0, -0.12, 0)), to.clone()]);
      const line = new THREE.Line(geo, tracerMat.clone());
      scene.add(line);
      tracers.push({ line, life: 0.25 });
      ctx.audio.sfx('shot', { gain: owner === ctx.me ? 1 : 0.6 });
      if (owner === ctx.me) kick = 1;
    }

    return {
      update(dt) {
        for (const p of P) {
          if (p.remote) {
            const r = ctx.net.remote;
            if (r) { p.pos.x = r.x; p.pos.y = r.z; p.h = r.h; p.yaw = r.yaw; p.pitch = r.pitch; }
          } else step(p, p.bot ? botCmd(p, P[1 - p.i], dt) : humanCmd(p), dt);
          if (!p.alive) p.fall = Math.min(1, p.fall + dt * 2.5);
          p.mesh.position.set(p.pos.x, p.h + 0.92 - p.fall * 0.5, p.pos.y);
          p.mesh.rotation.set(p.fall * 1.5, p.yaw, 0, 'YXZ');
          p.mesh.visible = p.i !== ctx.me || !p.alive;
          p.beacon.visible = ctx.sudden && p.alive;
        }
        const me = P[ctx.me];
        ctx.net.sendState({ x: +me.pos.x.toFixed(2), z: +me.pos.y.toFixed(2), h: +me.h.toFixed(2), yaw: +me.yaw.toFixed(3), pitch: +me.pitch.toFixed(3) });
        for (let i = tracers.length - 1; i >= 0; i--) {
          const tr = tracers[i];
          tr.life -= dt;
          tr.line.material.opacity = Math.max(0, tr.life / 0.25);
          if (tr.life <= 0) { scene.remove(tr.line); tr.line.geometry.dispose(); tr.line.material.dispose(); tracers.splice(i, 1); }
        }
        boxMat.opacity = ctx.sudden ? 0.2 : 1;
        const wantScope = ctx.input.alt && !me.bot && me.alive ? 1 : 0;
        scope += (wantScope - scope) * Math.min(1, dt * 12);
        kick = Math.max(0, kick - dt * 6);
        ctx.hud.cooldown('fire', me.reload / RELOAD);
      },

      render() {
        const me = P[ctx.me];
        eye(me, camera.position);
        if (!me.alive) camera.position.y -= me.fall * 1.1;
        camera.rotation.set(me.pitch + kick * 0.02, me.yaw, me.alive ? 0 : me.fall * 0.5);
        camera.fov = 70 - scope * 50;
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
        // Reticle on the 2D overlay (already cleared, CSS-pixel units).
        const g = ctx.g, w = ctx.width, h = ctx.height, cx = w / 2, cy = h / 2;
        if (scope > 0.02) {
          const r = Math.min(w, h) * 0.42;
          g.fillStyle = `rgba(0,0,0,${0.94 * scope})`;
          g.beginPath();
          g.rect(0, 0, w, h);
          g.arc(cx, cy, r, 0, Math.PI * 2, true);
          g.fill();
          g.strokeStyle = `rgba(0,0,0,${scope})`;
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(cx - r, cy); g.lineTo(cx + r, cy);
          g.moveTo(cx, cy - r); g.lineTo(cx, cy + r);
          g.stroke();
        } else if (me.alive) {
          g.fillStyle = '#fff';
          g.fillRect(cx - 1, cy - 1, 2, 2);
          g.fillRect(cx - 10, cy - 0.5, 6, 1); g.fillRect(cx + 4, cy - 0.5, 6, 1);
          g.fillRect(cx - 0.5, cy - 10, 1, 6); g.fillRect(cx - 0.5, cy + 4, 1, 6);
        }
      },

      resize(w, h) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      },

      onPhase(phase) {
        if (phase !== 'over' || !ctx.result || ctx.result.victim < 0) return;
        P[ctx.result.victim].alive = false;
        ctx.audio.sfx('thud');
      },

      onNet(msg) {
        if (msg.k === 'shot') tracer(new THREE.Vector3(...msg.o), new THREE.Vector3(...msg.e), 1 - ctx.me);
      },

      focus() {
        const v = P[ctx.result && ctx.result.victim >= 0 ? ctx.result.victim : 1 - ctx.me];
        a3.set(v.pos.x, v.h + 1, v.pos.y).project(camera);
        if (a3.z > 1) return { x: ctx.width / 2, y: ctx.height / 2 };
        return { x: (a3.x * 0.5 + 0.5) * ctx.width, y: (-a3.y * 0.5 + 0.5) * ctx.height };
      },

      dispose() {
        for (const tr of tracers) { tr.line.geometry.dispose(); tr.line.material.dispose(); }
        tracers.length = 0;
        tracerMat.dispose();
        disposeTree(scene); // geometries, materials, textures of everything still in the scene
      },
    };
  },
};
