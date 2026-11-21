// THE DEEP — the camera and everything that is about the picture rather than the rules:
// the water around you (background and the rippling surface with its window of sky),
// the arrival (just under a surface still boiling from the plunge, sinking to the start
// through the light, mask on, first spear loaded), the first-person view with the gun in
// your hands, the kill camera, the per-frame uniforms, and the quality governor.
import { clamp, lerp, damp, smoothstep, ease } from '../../kit.js';
import { WATER_GLSL, keepAlpha } from './shaders.js';
import { makePost } from './post.js';
import { drawOverlay } from './overlay.js';
import { SPAWN } from './world.js';

const BG_VERT = `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const BG_FRAG = `
precision highp float;
varying vec3 vW;
${WATER_GLSL}
void main() {
  vec3 d = normalize(vW - uCam);
  gl_FragColor = vec4(waterBg(d, uCam.y + d.y * 35.0), 1000.0);
}`;
// The surface from below: Snell's window (the sky squeezed into a 97° cone, the sun burning
// in it), total internal reflection outside it, ripples bending both, foam where the
// divers came in.
const SURF_FRAG = `
precision highp float;
varying vec3 vW;
uniform vec3 uSunAir;
uniform float uBoil;
uniform vec3 uBoilA, uBoilB;
${WATER_GLSL}
float hgt(vec2 q) {
  return texture2D(tNoise, q * 0.021 + uTime * vec2(0.011, 0.007)).r + texture2D(tNoise, q * 0.057 - uTime * vec2(0.009, 0.015)).g * 0.45 + texture2D(tNoise, q * 0.16 + uTime * vec2(0.02, -0.01)).b * 0.12;
}
void main() {
  vec3 v = normalize(vW - uCam);
  float d = length(vW - uCam);
  vec2 q = vW.xz;
  float e = 0.4, h0 = hgt(q);
  vec3 n = normalize(vec3((h0 - hgt(q + vec2(e, 0.0))) * 2.6, 1.0, (h0 - hgt(q + vec2(0.0, e))) * 2.6));
  vec3 R = refract(v, -n, 1.333);
  vec3 col;
  if (dot(R, R) > 0.0) {
    // through the window: a warm low sky, the sun in it
    float s = max(dot(R, uSunAir), 0.0);
    col = mix(vec3(1.25, 0.95, 0.7), vec3(0.55, 0.75, 1.0), smoothstep(0.1, 0.9, R.y)) * 1.7;
    col += uSunCol * (pow(s, 400.0) * 60.0 + pow(s, 24.0) * 3.0 + pow(s, 4.0) * 0.6);
    float edge = smoothstep(0.0, 0.28, R.y);
    col *= mix(1.6, 1.0, edge);
    col = mix(col, waterBg(reflect(v, -n), uCam.y) * 2.0, 1.0 - smoothstep(0.0, 0.08, R.y));
  } else {
    // the mirror: the water below, darker, wrinkled
    col = waterBg(reflect(v, -n), uCam.y) * 1.25 + vec3(0.01, 0.04, 0.045);
  }
  // foam and fresh bubbles where the two of you went in
  float foam = 0.0;
  for (int i = 0; i < 2; i++) {
    vec3 c = i == 0 ? uBoilA : uBoilB;
    float r = length(vW.xz - c.xz);
    foam += (1.0 - smoothstep(0.0, 8.0, r)) * smoothstep(0.42, 0.7, texture2D(tNoise, q * 0.35 + uTime * 0.05 + float(i) * 3.0).b + (1.0 - smoothstep(0.0, 4.0, r)) * 0.3);
  }
  col = mix(col, vec3(1.6, 1.65, 1.6), clamp(foam * uBoil, 0.0, 1.0));
  // distance hazes the surface into the water
  col = mix(col, waterBg(v, uCam.y), 1.0 - exp(-d * 0.028));
  gl_FragColor = vec4(col, d);
}`;

export function makeView(ctx, THREE, renderer, S) {
  const { scene, hands, viewModel, P, ME, FOE, U, Q, sim, kraken, glow, bubbles, sfx, eyeOf, dirOf } = S;
  const camera = new THREE.PerspectiveCamera(72, ctx.width / ctx.height, 0.05, 420);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  const post = makePost(THREE, renderer, U, { scale: Q.scale, tier: Q.tier, shadow: Q.shadow, msaa: Q.msaa, soft: Q.soft });
  // background shell and the surface
  const bg = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.ShaderMaterial({ uniforms: U, vertexShader: BG_VERT, fragmentShader: BG_FRAG, side: THREE.BackSide, depthWrite: false }));
  bg.renderOrder = -10;
  bg.frustumCulled = false;
  scene.add(bg);
  // sun above the water: refract the underwater sun direction back out
  const L = U.uL.value, h = Math.hypot(L.x, L.z), sa = Math.min(0.999, h * 1.333), sunAir = new THREE.Vector3((L.x / h) * sa, Math.sqrt(1 - sa * sa), (L.z / h) * sa);
  const surfU = { ...U, uSunAir: { value: sunAir }, uBoil: { value: 0 }, uBoilA: { value: new THREE.Vector3() }, uBoilB: { value: new THREE.Vector3() } };
  const surfMat = new THREE.ShaderMaterial({ uniforms: surfU, vertexShader: BG_VERT, fragmentShader: SURF_FRAG, side: THREE.DoubleSide });
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(700, 700, 1, 1).rotateX(Math.PI / 2), surfMat);
  surface.frustumCulled = false;
  scene.add(surface);

  // ---- state
  let zoom = 0, kickA = 0, shoveA = 0, hurt = 0, introK = 0, maskA = 0, liveT = 0, wasPhase = '';
  let kill = null; // { v, t, from: {pos, quat}, side }
  const notes = { text: '', a: 0 }, pingedAt = { x: 0, y: 0, z: 0, a: 0 };
  const e3 = { x: 0, y: 0, z: 0 }, d3 = { x: 0, y: 0, z: 0 };
  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  const pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, speed: 0, loaded: true, dead: -1, aim: 0, recoil: 0 };
  const vm = { load: 1, kick: 0, sway: { x: 0, y: 0 }, bob: 0, aim: 0, drop: 0 };
  let bornAt = 0, tPrev = 0, drawAt = 0, cost = 0, worst = 0, measure = false, drawn = 0, fresh = false, drawnPhase = '';
  let bob = 0, loadShown = 1, introLoad = 0, frames = 0, govT = 0, govN = 0, govGood = 0, lastNow = 0, shadowEvery = Q.soft ? 6 : 1;
  const HUD = { reticle: { x: 0, y: 0 }, marks: [], ping: pingedAt, notes };
  const killCamPos = new THREE.Vector3(), killLook = new THREE.Vector3(), kM = new THREE.Matrix4(), kQ = new THREE.Quaternion();
  // loose kit for the kill: a mask and two fins that drift off
  const loose = [];

  function project(x, y, z, out) {
    tmpV.set(x, y, z).project(camera);
    out.x = (tmpV.x * 0.5 + 0.5) * ctx.width;
    out.y = (-tmpV.y * 0.5 + 0.5) * ctx.height;
    out.behind = tmpV.z > 1;
    return out;
  }

  const api = {
    camera, post,
    get zoom() { return zoom; },
    shot: null, // test scripts: pin the camera
    always: false, // test scripts: never skip a draw
    note(text, dur = 2) { notes.text = text; notes.a = dur; },
    kick() { kickA = 1; },
    shove() { shoveA = 1; hurt = 1; api.note('THE KRAKEN SHOVED YOU', 1.6); },
    pinged(x, y, z) { pingedAt.x = x; pingedAt.y = y; pingedAt.z = z; pingedAt.a = 2.6; api.note('PINGED — THEY KNOW WHERE YOU ARE', 2.2); },
    beginIntro() {
      introK = 0; maskA = 1;
      surfU.uBoil.value = 1;
      surfU.uBoilA.value.set(SPAWN[ME.i].x, 0, SPAWN[ME.i].z + 4 * Math.cos(SPAWN[ME.i].yaw));
      surfU.uBoilB.value.set(SPAWN[FOE.i].x, 0, SPAWN[FOE.i].z);
      // the plunge's bubbles, still boiling up round you
      for (let i = 0; i < 220; i++) {
        const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * 3.2;
        bubbles.emit(SPAWN[ME.i].x + Math.cos(a) * r, -1.2 - Math.random() * 3.5, SPAWN[ME.i].z + Math.sin(a) * r + 1.5 * Math.cos(SPAWN[ME.i].yaw), (Math.random() - 0.5) * 0.8, 0.8 + Math.random() * 1.6, (Math.random() - 0.5) * 0.8, 0.04 + Math.random() * 0.12, 0.01, 2 + Math.random() * 3, 1, 1, 1, 1, 0.4, 1.4);
      }
      for (let i = 0; i < 90; i++) bubbles.emit(SPAWN[FOE.i].x + (Math.random() - 0.5) * 3, -1.5 - Math.random() * 6, SPAWN[FOE.i].z + (Math.random() - 0.5) * 3, 0, 1 + Math.random(), 0, 0.06 + Math.random() * 0.1, 0.01, 3 + Math.random() * 3, 1, 1, 1, 1, 0.4, 1.2);
      sfx.splash();
    },
    goLive() { liveT = 0; },
    killCam(v, ki) {
      const w = P[1 - v.i];
      kill = { v, t: 0, from: camera.position.clone(), fromQ: camera.quaternion.clone(), dir: ki ? new THREE.Vector3(ki.dx, ki.dy, ki.dz) : new THREE.Vector3(v.x - w.x, v.y - w.y, v.z - w.z).normalize() };
      // the mask and both fins come away
      const m = v.model;
      for (const l of m.legs) l.fin.visible = false;
      m.mask.visible = false;
      m.root.updateMatrixWorld(true);
      for (const part of [m.mask, m.legs[0].fin, m.legs[1].fin]) {
        const g = new THREE.Mesh(part.geometry, part.material);
        part.getWorldPosition(g.position);
        part.getWorldQuaternion(g.quaternion);
        g.userData.v = new THREE.Vector3((Math.random() - 0.5) * 1.2 + kill.dir.x * 1.5, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 1.2 + kill.dir.z * 1.5);
        g.userData.s = new THREE.Vector3(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        scene.add(g);
        loose.push(g);
      }
    },

    update(dt, T, introT) {
      const phase = ctx.phase, real = phase === 'over' ? dt / 0.35 : dt;
      frames++;
      fresh = true;
      U.uTime.value += dt;
      if (phase === 'live') liveT += dt;
      // the arrival: 3.6 s from just under the surface to the start
      introK = phase === 'intro' ? clamp(introT / 3.4, 0, 1) : 1;
      maskA = phase === 'intro' ? 1 - smoothstep(0.15, 0.95, introT) : damp(maskA, 0, 6, dt);
      surfU.uBoil.value = phase === 'intro' ? 1 - smoothstep(1, 6, introT) * 0.6 : Math.max(0, surfU.uBoil.value - dt * 0.15);
      if (phase === 'intro') {
        introLoad = clamp((introT - 1.5) / 1.5, 0, 1);
        if (introT > 0.25 && wasPhase !== 'mask') { wasPhase = 'mask'; sfx.mask(); }
        if (introT > 1.5 && wasPhase === 'mask') { wasPhase = 'load'; sfx.reload(1.5); }
        if (introT > 3 && wasPhase === 'load') { wasPhase = 'loaded'; sfx.loaded(); }
        // a trickle of bubbles still rising round you
        if (Math.random() < dt * 30) { eyeOf(ME, e3); bubbles.emit(e3.x + (Math.random() - 0.5) * 2, lerp(-1.4, ME.y, ease.inOutCubic(introK)) - 1 - Math.random(), e3.z + (Math.random() - 0.5) * 2, 0, 1.2, 0, 0.05 + Math.random() * 0.05, 0.01, 2, 1, 1, 1, 1, 0.4, 1.3); }
      } else introLoad = 1;
      const wantZoom = ME.holding && ME.alive && phase === 'live' ? 1 : 0;
      zoom = damp(zoom, wantZoom, 9, real);
      kickA = Math.max(0, kickA - real * 4.5);
      shoveA = Math.max(0, shoveA - real * 1.5);
      hurt = Math.max(0, hurt - real * 1.2);
      notes.a = Math.max(0, notes.a - real);
      pingedAt.a = Math.max(0, pingedAt.a - real);
      for (const g of loose) { g.position.addScaledVector(g.userData.v, real * 0.7); g.userData.v.y += real * 0.15; g.rotation.x += g.userData.s.x * real * 0.5; g.rotation.y += g.userData.s.y * real * 0.5; }

      // the divers' bodies
      for (const p of P) {
        const ik = ease.inOutCubic(introK);
        pose.x = p.x; pose.y = phase === 'intro' ? lerp(-1.4, p.y, ik) : p.y; pose.z = p.z;
        pose.yaw = p.yaw; pose.pitch = p.pitch; pose.speed = clamp(p.speed / S.SWIM, 0, 1); pose.loaded = phase === 'intro' ? introLoad > 0.5 : p.loaded;
        pose.aim = p.holding ? 1 : 0; pose.recoil = p.recoil; pose.dead = p.dead;
        if (p.dead >= 0) {
          // up through the light in a column of bubbles
          p.y += real * (0.8 + p.dead * 1.2);
          pose.y = p.y;
          if (Math.random() < real * 40) bubbles.emit(p.x + (Math.random() - 0.5) * 0.6, p.y + (Math.random() - 0.5) * 0.5, p.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.4, 1.5, (Math.random() - 0.5) * 0.4, 0.05 + Math.random() * 0.08, 0.01, 5, 1, 1, 1, 1, 0.5, 1.2);
        }
        p.model.pose(pose, real);
        // your own body shows only once the kill camera has pulled out of it
        p.model.root.visible = p !== ME || (!!kill && camera.position.distanceToSquared(tmpV.set(p.x, p.y, p.z)) > 2.5);
        const reveal = (ctx.sudden || ctx.time < p.revealT || (phase === 'intro' && p !== ME)) && p.alive;
        p.model.ghost.visible = reveal && p !== ME;
        p.model.mat.uniforms.uGhost.value = damp(p.model.mat.uniforms.uGhost.value, p.model.ghost.visible ? 1 : 0, 8, real);
        if (p.model.ghost.visible) p.model.syncGhost();
        // the lamp on the mask strap: a light on the reef, a beam in the water, a glow you can see from far off
        eyeOf(p, e3);
        dirOf(p.yaw + p.swayX, p.pitch + p.swayY, d3);
        const li = p.i;
        U.uLampPos.value[li].set(e3.x + d3.x * 0.15, phase === 'intro' ? lerp(-1.4, e3.y, ik) : e3.y + 0.12, e3.z + d3.z * 0.15);
        U.uLampDir.value[li].set(d3.x, d3.y, d3.z);
        const on = p.alive ? 1 : Math.max(0, 1 - p.dead * 0.5);
        U.uLampCol.value[li].set(p.r * 1.7 * on, p.g * 1.7 * on, p.b * 1.7 * on);
        if (p !== ME || kill) {
          // a small lamp up close, a beacon far off: the glow grows with distance
          // (up close it is a lamp on a diver, not a sun: the diver must show round it)
          const lp = U.uLampPos.value[li], cd = Math.max(1, camera.position.distanceTo(lp)), sc = clamp(cd / 22, 0.35, 2.2), hot = clamp(cd / 30, 0.25, 1);
          glow.put(lp.x, lp.y, lp.z, 0.9 * sc, p.r * 1.6 * on * hot, p.g * 1.6 * on * hot, p.b * 1.6 * on * hot, 0.9);
          glow.put(lp.x, lp.y, lp.z, 3.6 * sc, p.r * 0.2 * on, p.g * 0.2 * on, p.b * 0.2 * on, 0.6 * clamp(cd / 15, 0.12, 1));
        }
      }
      for (const d of S.decoys) {
        if (!d.alive) continue;
        const o = P[d.owner], fl = 0.75 + 0.25 * Math.sin(T * 9 + d.slot);
        glow.put(d.x, d.y, d.z, 1.3, o.r * 1.8 * fl, o.g * 1.8 * fl, o.b * 1.8 * fl, 0.9);
        glow.put(d.x, d.y, d.z, 4.5, o.r * 0.25, o.g * 0.25, o.b * 0.25, 0.7);
      }
      // the kraken: its eye follows whoever is closest — or, at the end, the one who fell
      const KS = sim.S;
      let near = null, nd = 1e9;
      for (const p of P) { const dd = Math.hypot(p.x - KS.pos[0], p.y - KS.pos[1], p.z - KS.pos[2]); if (dd < nd && (p.alive || kill)) { nd = dd; near = p; } }
      if (kill) near = kill.v;
      kraken.update(real, near && (nd < 60 || kill) ? tmpV2.set(near.x, near.y, near.z) : null);
      // its bulk overhead dims the whole sea; its wake bends the kelp
      const camY = camera.position.y;
      const hd = Math.hypot(KS.pos[0] - camera.position.x, KS.pos[2] - camera.position.z);
      // (the arms spread 25 m round the body: the shade does too)
      U.uDim.value = clamp(smoothstep(32, 8, hd) * smoothstep(-1, 6, KS.pos[1] - camY), 0, 1) * 0.72;
      U.uWake.value.set(KS.pos[0], KS.pos[1], KS.pos[2], KS.wake);
      // the gun in your hands
      const load = phase === 'intro' ? introLoad : ME.loaded ? 1 : 1 - ME.reload / S.RELOAD;
      loadShown = load;
      bob += real * (1.4 + ME.speed * 1.5);
      vm.load = load; vm.kick = kickA; vm.aim = zoom; vm.bob = Math.sin(bob) * (0.3 + ME.speed * 0.25);
      vm.sway.x = ME.swayX * 1.2; vm.sway.y = -ME.swayY * 1.2;
      vm.drop = phase === 'intro' ? 1 - smoothstep(0.6, 1.8, introT) : 0;
      viewModel.pose(vm);
      sfx.ear.x = camera.position.x; sfx.ear.y = camera.position.y; sfx.ear.z = camera.position.z;
      sfx.ear.rx = Math.cos(ME.yaw); sfx.ear.rz = -Math.sin(ME.yaw);
      if (kill) kill.t += real;
    },

    render() {
      const phase = ctx.phase;

      // ---- the camera
      if (api.shot) {
        const s = api.shot;
        camera.position.set(s.x, s.y, s.z);
        camera.lookAt(s.tx, s.ty, s.tz);
        camera.fov = s.fov || 60;
      } else if (kill) {
        // slow orbit beside the victim, from below, looking up through the light
        const v = kill.v, k = smoothstep(0, 0.7, kill.t);
        const side = tmpV.set(-kill.dir.z, 0, kill.dir.x).normalize();
        const ang = kill.t * 0.25;
        killCamPos.set(v.x, v.y, v.z).addScaledVector(side, 5 * Math.cos(ang)).addScaledVector(kill.dir, -3.6 + 2.4 * Math.sin(ang)).add(tmpV2.set(0, -2.6, 0));
        camera.position.lerpVectors(kill.from, killCamPos, ease.inOutCubic(k));
        killLook.set(v.x, v.y + 0.4, v.z);
        camera.quaternion.copy(kill.fromQ);
        if (k > 0) {
          kM.lookAt(camera.position, killLook, tmpV.set(0, 1, 0));
          kQ.setFromRotationMatrix(kM);
          camera.quaternion.slerpQuaternions(kill.fromQ, kQ, ease.inOutCubic(k));
        }
        camera.fov = lerp(72 - zoom * 34, 58, k);
      } else {
        eyeOf(ME, e3);
        const ik = ease.inOutCubic(introK);
        let y = e3.y, pitch = ME.pitch;
        if (phase === 'intro') {
          // the arrival: just under the swell, looking down the wall, sinking to the start
          y = lerp(-1.25, e3.y, ik);
          pitch = lerp(-0.46, ME.pitch, ease.inOutCubic(smoothstep(0.35, 1, introK)));
        }
        const sh = shoveA * shoveA;
        camera.position.set(e3.x, y + Math.sin(bob) * 0.015, e3.z);
        camera.rotation.set(pitch + kickA * 0.03 + Math.sin(frames * 0.7) * sh * 0.05, ME.yaw + Math.sin(frames * 0.9) * sh * 0.06, Math.sin(bob * 0.5) * 0.008 + sh * 0.1 * Math.sin(frames * 0.5));
        camera.fov = 72 - zoom * 34;
      }
      camera.aspect = ctx.width / Math.max(1, ctx.height);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      U.uCam.value.copy(camera.position);
      bg.position.copy(camera.position);
      surface.position.set(camera.position.x, 0, camera.position.z);
      for (const sp of S.spears) if (sp.ribbon.mesh.visible) sp.ribbon.build(camera.position.x, camera.position.y, camera.position.z, 0.035);
      viewModel.root.position.copy(camera.position);
      viewModel.root.quaternion.copy(camera.quaternion);
      // A software rasteriser can take a second over one frame: then draw the scene only
      // every few seconds' worth of its cost (the frame after a draw measures it) and let the
      // duel run on in real time. A render with no update before it is the core
      // photographing the world, and a change of phase must show: always draw those.
      const now = performance.now(), iv = tPrev ? now - tPrev : 0;
      tPrev = now;
      if (measure) { cost = iv; measure = false; }
      if (iv > worst) worst = iv; // a GPU running behind shows up as long frames between draws
      let draw = true;
      // software build: the first two seconds behind the title card show plain water, so the
      // page answers while the CPU starts on the shaders
      if (!bornAt) bornAt = now;
      if (Q.soft && now - bornAt < 2000 && !fresh0Photo()) {
        renderer.setRenderTarget(null);
        renderer.setClearColor(0x062a33, 1);
        renderer.clear();
        fresh = false;
        // (not a flat colour: light from above fading into the deep, on the 2D layer, which
        // costs the CPU nothing to build)
        const g = ctx.g, wg = g.createLinearGradient(0, 0, 0, ctx.height);
        wg.addColorStop(0, '#3f8f93'); wg.addColorStop(0.12, '#1d6a72'); wg.addColorStop(0.55, '#0a3a46'); wg.addColorStop(1, '#03141d');
        g.fillStyle = wg;
        g.fillRect(0, 0, ctx.width, ctx.height);
        HUD.w = ctx.width; HUD.h = ctx.height;
        drawOverlay(ctx, HUD, api, S, camera, project);
        return;
      }
      if (api.freeze || Q.soft && !api.always && drawn > 2 && fresh && phase === drawnPhase && now - drawAt < (staged.length ? Math.max(700, cost * 1.2) : Math.min(6000, Math.max(1000, cost * 5, worst * 5)))) draw = false;
      fresh = false;
      if (!draw) {
        if (drawn > 0) post.present();
        HUD.w = ctx.width; HUD.h = ctx.height;
        drawOverlay(ctx, HUD, api, S, camera, project);
        return;
      }
      if (Q.soft && drawn > 0) {
        // let the last frame finish first, and count the wait as part of what a frame costs
        post.sync();
        const waited = performance.now() - now;
        cost = Math.max(cost, waited);
      }
      drawAt = performance.now(); drawn++; measure = true; drawnPhase = phase; worst = 0;
      // software build: bring the world in a piece per draw, so no one frame has to compile
      // every shader at once (a CPU compiles each one in about a second)
      if (staged.length && drawn > 1) for (const o of staged.shift()) o.visible = true;
      // ---- the frame
      const pf = post.u;
      pf.uBreath.value = zoom * 0.75;
      pf.uMask.value = maskA;
      pf.uHurt.value = hurt;
      pf.uInk.value = inkAtCam();
      pf.uFlash.value = kill ? Math.max(0, 0.5 - kill.t * 1.5) : 0;
      pf.uFlashCol.value.setRGB(0.85, 1, 1);
      pf.uSat.value = kill ? lerp(1.12, 1.25, Math.min(1, kill.t)) : 1.12;
      pf.uMaskK.value = kill || api.shot ? 0.25 : 1;
      pf.uExposure.value = lerp(1.34, 1.15, U.uDim.value);
      if (frames % shadowEvery === 0 || frames < 3) post.shadowPass(scene, clamp(camera.position.x, -20, 25), clamp(camera.position.z, -35, 35));
      post.render(scene, camera, !kill && !api.shot && ME.alive ? hands : null);
      renderer.setRenderTarget(null);
      // ---- the HUD
      HUD.w = ctx.width; HUD.h = ctx.height;
      drawOverlay(ctx, HUD, api, S, camera, project);
      govern();
    },

    resize(w, h) {
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      post.resize();
    },

    focus() {
      const v = ctx.result && ctx.result.victim >= 0 ? P[ctx.result.victim] : FOE;
      const o = project(v.x, v.y + 0.3, v.z, { x: 0, y: 0 });
      if (o.behind) return { x: ctx.width / 2, y: ctx.height / 2 };
      return { x: o.x, y: o.y };
    },

    dispose() {
      post.dispose();
      bg.geometry.dispose(); bg.material.dispose();
      surface.geometry.dispose(); surface.material.dispose();
      for (const g of loose) scene.remove(g);
      loose.length = 0;
    },
  };

  // software build: bring the world in one shader program per draw (meshes that share a
  // program arrive together), so no single frame has to build many pipelines at once
  const staged = [];
  if (Q.soft) {
    const groups = new Map();
    const keyOf = (o) => { const m = o.material; return `${m.fragmentShader ? m.fragmentShader.length : 0}|${JSON.stringify(m.defines || {})}|${o.isInstancedMesh ? 1 : 0}|${m.side}`; };
    for (const root of [S.reef.group, kraken.group, S.life.group, ...P.map((p) => p.model.root)]) {
      root.traverse((o) => {
        if (!o.isMesh || !o.visible || !o.material) return;
        const k = keyOf(o);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(o);
      });
    }
    for (const list of groups.values()) { for (const o of list) o.visible = false; staged.push(list); }
  }

  // a render with no update since the last one is the core photographing the world
  function fresh0Photo() { return !fresh; }

  function inkAtCam() {
    let k = 0;
    const c = camera.position;
    for (const ink of S.inks) {
      const r = S.inkR(ink);
      if (r <= 0) continue;
      const d = Math.hypot(c.x - ink.x, c.y - ink.y, c.z - ink.z);
      k = Math.max(k, smoothstep(r, r * 0.4, d));
    }
    return k * 0.92;
  }

  // The governor: on a GPU, step the costly passes down when frames run long, and back up
  // when there is headroom (the core separately lowers the 3D resolution).
  function govern() {
    const now = performance.now(), dt = lastNow ? now - lastNow : 16;
    lastNow = now;
    if (Q.soft || frames < 30 || dt > 250) return;
    govT += dt; govN++;
    if (govN < 90) return;
    const avg = govT / govN;
    govT = govN = 0;
    // tiers: 0 everything · 1 lighter shafts, 1k shadows · 2 fewest shaft steps, 512 shadows
    // every other frame, less snow · 3 the HDR scene itself at 80 % (the core may also lower
    // the canvas's own resolution on top of this)
    if (avg > 20 && Q.tier < 3) {
      Q.tier++;
      post.setTier(Math.min(2, Q.tier));
      if (Q.tier === 1) post.setShadow(1024);
      if (Q.tier === 2) { post.setShadow(512); shadowEvery = 2; S.snow.setCount(1200); }
      if (Q.tier === 3) post.setScale(0.8);
      govGood = 0;
    } else if (avg < 13 && Q.tier > 0) {
      if (++govGood < 5) return;
      govGood = 0;
      Q.tier--;
      post.setTier(Math.min(2, Q.tier));
      post.setScale(1);
      shadowEvery = Q.tier === 2 ? 2 : 1;
      post.setShadow(Q.tier === 0 ? 2048 : Q.tier === 1 ? 1024 : 512);
      S.snow.setCount(Q.tier === 0 ? Q.snow : Q.tier === 1 ? 1800 : 1200);
    }
  }

  return api;
}
