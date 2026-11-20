// BREAK POINT — the camera and everything that hangs off it. This world is third person
// from the first frame to the last: the chase rig rides behind your board, and when you
// brace it pulls back onto a long lens with you still kneeling in the foot of the frame and
// the sight line lifted above your head. Also here: the crane shot that opens a round, the
// one unbroken move that ends it (over the winner's shoulder as the loser falls, round
// behind the winner as they dive, down through the surface after them), what the HUD needs
// projected to the screen, the per-frame uniforms of sea, haze and lens, and the pacing of
// draws on a machine that has no GPU.
import { clamp, lerp, damp, smoothstep, noise2 } from '../../kit.js';
import { drawOverlay } from './overlay.js';
import { KILL, SLOW } from './game.js';
import { SUN } from './sky.js';

const PROMPTS = {
  kbm: ['CLICK TO FIRE', 'hold RIGHT-CLICK to BRACE: steady, zoomed, no steering', 'HOLD RIGHT-CLICK TO BRACE'],
  touch: ['TAP FIRE TO SHOOT', 'drag to aim · BRACE steadies and zooms', 'TAP BRACE TO STEADY AND ZOOM'],
  gamepad: ['RT TO FIRE', 'hold LT to BRACE: steady, zoomed, no steering', 'HOLD LT TO BRACE'],
};
const AIM_LIFT = 0.066; // braced, the sight line sits this far (radians) above the lens axis: the reticle clears your own head

export function makeView(ctx, THREE, renderer, W) {
  const { scene, sea, world, game, post, ocean, haze, Q, sfx } = W;
  const R = game.R, P = game.P, me = game.me, foe = P[1 - ctx.me];
  const camera = new THREE.PerspectiveCamera(52, ctx.width / Math.max(1, ctx.height), 0.3, 9000);
  camera.rotation.order = 'YXZ';
  const F = new THREE.Vector3(), Rt = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), sunDir = new THREE.Vector3(SUN.x, SUN.y, SUN.z);
  const pA = new THREE.Vector3(), lA = new THREE.Vector3(), pB = new THREE.Vector3(), lB = new THREE.Vector3(), pC = new THREE.Vector3(), lC = new THREE.Vector3(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
  const play = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, fov: 52, roll: 0, lift: 0 };
  const S = {
    w: 1, h: 1, t: 0, live: false, alive: true, under: false, brace: 0, rx: 0, ry: 0, spreadPx: 10, clear: false, wall: false, ready: true, cycle: 0,
    prompt: '', prompt2: '', promptA: 0, note: '', noteA: 0, noteHot: false, bars: 1, pad: 8, gauge: true, prof: new Float32Array(game.los.n + 1), eyeA: 0, eyeB: 0,
    colA: me.color, colB: foe.color, safe: ctx.safe, touch: false, ammo: 4, mag: R.mag, reloading: false, dist: 0, kmh: 0, push: 0, white: 0, marks: [], hits: [],
  };
  for (let i = 0; i < 3; i++) S.marks.push({ on: false, x: 0, y: 0, ang: 0, a: 0, kind: 'foe', color: '#fff', hollow: false, text: '', sub: '' });
  for (let i = 0; i < 3; i++) S.hits.push({ ang: 0, a: 0, x: 0, z: 0 });
  let wt = 0, trauma = 0, kickV = 0, kickA = 0, introT = -1, kc = null, camY = me.y, lift = 0, flashA = 0, raysK = 0, foeVis = 1, seenX = foe.x, seenZ = foe.z;
  let fired = false, braced = false, promptT = 0, noteT = 0, frames = 0, fresh = false, tPrev = 0, debt = 0, drawAt = -1e9, pushS = 0, stills = 0;
  const api = { camera, shot: null, wt: 0, force: 0, draws: 0 };
  const dirOf = (yaw, pitch, out) => out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  const fov0 = () => (ctx.width / Math.max(1, ctx.height) < 1.45 ? 58 : 52);
  const zoomed = (k) => (2 * Math.atan(Math.tan((fov0() * Math.PI) / 360) / lerp(1, R.zoom, k)) * 180) / Math.PI;

  function rig(p, dt) {
    const k = p.alive ? p.brace : 0, ks = k * k * (3 - 2 * k);
    const yaw = p.yaw, pitch = clamp(p.pitch + kickA * (1 - 0.6 * ks), -0.75, 0.62);
    dirOf(yaw, pitch, F);
    Rt.set(Math.cos(yaw), 0, -Math.sin(yaw));
    camY = damp(camY, p.y, lerp(4.5, 9, ks), dt); // the lens rides the swell, not every ripple
    const back = lerp(9.2, 13, ks), up = lerp(2.3, 1.75, ks), right = lerp(1.15, 0.75, ks);
    play.pos.set(p.x - F.x * back + Rt.x * right, camY + lerp(1.55, 1.22, ks) - F.y * back + up, p.z - F.z * back + Rt.z * right);
    // never under the water: when a crest comes through behind you the lens goes over it
    const need = sea.height(play.pos.x, play.pos.z) + 0.75 - play.pos.y;
    lift = need > lift ? need : damp(lift, Math.max(0, need), 3, dt);
    if (lift > 0) play.pos.y += lift;
    play.yaw = yaw; play.pitch = pitch; play.fov = zoomed(ks);
    // Third person, always: if the lens has been lifted over a crest, or the aim is up, the
    // rider would drop out of the foot of the frame — so the lens tips down onto them and the
    // sight line (drawn as the reticle) stays where it was, higher in the frame.
    const half = (play.fov * Math.PI) / 360;
    const feet = Math.atan2(p.y + 0.15 - play.pos.y, Math.max(1, Math.hypot(p.x - play.pos.x, p.z - play.pos.z)));
    const want = Math.min(half * 0.8, Math.max(AIM_LIFT * ks, pitch - half * 0.8 - feet));
    play.lift = dt > 0 ? damp(play.lift, want, 10, dt) : want;
    const cross = p.air ? 0 : sea.slope(p.x, p.z, Rt.x, Rt.z);
    play.roll = damp(play.roll, (p.lean * 0.22 + cross * 0.3) * (1 - 0.6 * ks), 6, dt);
  }
  function project(x, y, z, m) {
    tmp.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    m.ang = Math.atan2(tmp.x, -tmp.z);
    if (tmp.z > -0.3) { m.on = false; return m; }
    tmp.applyMatrix4(camera.projectionMatrix);
    m.x = (tmp.x * 0.5 + 0.5) * ctx.width; m.y = (-tmp.y * 0.5 + 0.5) * ctx.height;
    m.on = Math.abs(tmp.x) < 0.94 && Math.abs(tmp.y) < 0.86;
    return m;
  }

  // The hand-off: one move, the same on both clients once it has left each one's own lens.
  function killShot(dt) {
    const k = game.kill, t = k.t, w = k.w, h = w.hop, ux = k.ux, uz = k.uz, rx = -uz, rz = ux;
    kc.y = damp(kc.y, w.y, 4, dt);
    const dist = Math.hypot(k.x - w.x, k.z - w.z);
    // A — from above the winner's shoulder, a crash zoom down the line of the shot: the
    // fall, the splash, the bow. (High enough that no crest between hides it.)
    const v = k.v.body, hi = 6 + dist * 0.06;
    pA.set(w.x - ux * 14 + rx * 1.2, kc.y + hi, w.z - uz * 14 + rz * 1.2);
    // (on the choreography's own clock: the sea's slow motion must not leave the lens behind the body)
    if (k.splashed) kc.look.lerp(tmp.set(k.x, k.y + 2.6, k.z), Math.min(1, (dt / SLOW) * 4)); else kc.look.set(v.x, v.y + 0.4, v.z);
    lA.copy(kc.look);
    const fA = clamp((2 * Math.atan(4.6 / (dist + 14)) * 180) / Math.PI, 3.2, 30);
    // B — round to the winner's side as they crouch and go: the header in profile
    const bx = h.on ? h.x : w.x, by = h.on ? Math.max(h.y, kc.y - 0.5) : kc.y + 0.9, bz = h.on ? h.z : w.z;
    pB.set(bx - ux * 5.2 + rx * 5.6, Math.max(by, kc.y) + 1.5, bz - uz * 5.2 + rz * 5.6);
    lB.set(bx + ux * 1.2, by + 0.1, bz + uz * 1.2);
    // C — in behind them to the boil of foam where they went under, and through it
    pC.set(k.ex - ux * 3.4 + rx * 0.6, k.ey + 0.55, k.ez - uz * 3.4 + rz * 0.6);
    lC.set(k.ex + ux * 0.6, k.ey - 0.5, k.ez + uz * 0.6);
    // (A2: before going round, the lens opens out and tips down until the winner is in the foot
    // of the frame watching the water close over the other one — then round to B)
    const a2 = smoothstep(KILL.squat - 0.4, KILL.squat + 0.1, t), ab = smoothstep(KILL.squat + 0.05, KILL.jump + 0.12, t), bc = smoothstep(KILL.jump + KILL.flight - 0.3, KILL.sink + 0.25, t);
    const hA = 2 * pA.distanceTo(lA) * Math.tan((fA * Math.PI) / 360);
    pA.lerp(pB, ab).lerp(pC, bc);
    const floor = sea.height(pA.x, pA.z) + lerp(0.9, 0.3, bc);
    if (pA.y < floor) pA.y = floor;
    // From whichever lens this client had to the A shot in one move that never lets go of the
    // falling rider: the lens turns onto them at once, then travels (up and over, never through
    // the winner) while the zoom holds them at the size they were — a crash zoom on the winner's
    // screen, a pull-back across the bay on the victim's.
    const e = smoothstep(0.05, 1.0, t);
    camera.position.lerpVectors(kc.p0, pA, e);
    camera.position.y += Math.sin(Math.PI * e) * kc.arc;
    const fl2 = sea.height(camera.position.x, camera.position.z) + 0.3;
    if (camera.position.y < fl2) camera.position.y = fl2;
    // the lens pans from subject to subject (turning, not dragging a look-at point across the bay)
    camera.lookAt(lA); q1.copy(camera.quaternion);
    let f2 = 0;
    if (a2 > 0) {
      camera.lookAt(tmp2.set(w.x, kc.y + 1.5, w.z)); q2.copy(camera.quaternion);
      f2 = clamp((q1.angleTo(q2) * 180) / Math.PI * 1.3 + 12, 24, 80);
      q1.slerp(q2, 0.55 * a2);
    }
    if (ab > 0) { camera.lookAt(lB); q2.copy(camera.quaternion); q1.slerp(q2, ab); }
    if (bc > 0) { camera.lookAt(lC); q2.copy(camera.quaternion); q1.slerp(q2, bc); }
    camera.quaternion.copy(kc.q0).slerp(q1, smoothstep(0, 0.42, t));
    const fD = e < 1 ? clamp((2 * Math.atan(lerp(kc.h0, hA, e) / (2 * Math.max(1, camera.position.distanceTo(lA)))) * 180) / Math.PI, 2.5, 70) : fA;
    camera.fov = lerp(lerp(lerp(fD, f2, a2), 46, ab), 60, bc);
    // the lens goes under: the waterline climbs the frame and stops a fifth of the way from the top
    const wl = t < KILL.sink ? -1 : lerp(-0.12, 0.775, smoothstep(KILL.sink, KILL.under, t)) + 0.012 * Math.min(1, Math.max(0, t - KILL.under) * 2);
    post.u.uWater.value.set(wl, 0.05 * Math.sin(t * 2.1), clamp((t - KILL.sink) * 2, 0, 1));
    return 1 - smoothstep(KILL.jump + 0.4, KILL.sink - 0.1, t);
  }

  Object.assign(api, {
    shake(a) { trauma = Math.min(1, trauma + a); },
    kick(k) { kickV += 0.3 * k; trauma = Math.min(1, trauma + 0.2 * k); fired = true; },
    note(text, hot = false, dur = 2.2) { S.note = text; S.noteHot = hot; noteT = dur; },
    hitFrom(x, z) { let t = S.hits[0]; for (const q of S.hits) if (q.a < t.a) t = q; t.a = 1.3; t.x = x; t.z = z; },
    beginIntro() { introT = 0; drawAt = -1e9; },
    poke() { drawAt = -1e9; debt = 0; }, // whatever the pacing says, the next quiet frame is drawn
    killCam() {
      trauma = Math.min(1, trauma + 0.4);
      if (!Q.soft) flashA = 0.4;
      const k = game.kill, look = new THREE.Vector3(k.v.body.x, k.v.body.y + 0.4, k.v.body.z), w = k.w;
      // how tall a slice of the world the lens framed at the victim (held through the move), and
      // how high the move arcs: enough to clear the winner's head on the victim's side of the bay
      const h0 = 2 * camera.position.distanceTo(look) * Math.tan((camera.fov * Math.PI) / 360);
      const arc = clamp(Math.hypot(camera.position.x - w.x, camera.position.z - w.z) * 0.1, 0, 12);
      kc = { p0: camera.position.clone(), q0: camera.quaternion.clone(), f0: camera.fov, h0, arc, y: w.y, look };
      drawAt = -1e9; debt = 0;
    },
    // Where the picture's centre of interest is as the round ends: the spot the winner went in.
    focus() {
      const k = game.kill, m = S.marks[2];
      if (!k.on) return { x: ctx.width / 2, y: ctx.height / 2 };
      project(k.ex, k.ey - 0.5, k.ez, m);
      m.a = 0;
      return m.on ? { x: m.x, y: Math.min(m.y, ctx.height * 0.8) } : { x: ctx.width / 2, y: ctx.height * 0.6 };
    },
    resize(w, h) {
      if (!(w > 0 && h > 0)) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      post.resize();
    },

    update(dt, T) {
      fresh = true;
      wt += dt;
      api.wt = wt;
      const phase = ctx.phase, human = !me.bot;
      kickV -= kickA * 70 * dt; kickV *= Math.exp(-10 * dt); kickA = Math.max(-0.02, kickA + kickV * dt);
      trauma = Math.max(0, trauma - dt * 1.6);
      rig(me, dt);
      // The local sniper aims along the sight line: tell the rules where that ray is.
      const c = game.cam;
      dirOf(play.yaw + me.swayX, play.pitch + me.swayY, F);
      c.on = true; c.x = play.pos.x; c.y = play.pos.y; c.z = play.pos.z; c.dx = F.x; c.dy = F.y; c.dz = F.z;

      let bars = 0;
      post.u.uWater.value.x = -1;
      if (phase === 'intro' || introT < 0) {
        // The arrival: high behind you with the whole bay and the other sniper in the frame,
        // then down the crane to your shoulder as the count runs out.
        if (introT >= 0) introT += dt;
        const u = clamp(introT / 3.4, 0, 1), e = u * u * (3 - 2 * u), dx = foe.x - me.x, dz = foe.z - me.z, dl = Math.hypot(dx, dz) || 1, ux = dx / dl, uz = dz / dl;
        const drift = Math.sin(wt * 0.3) * 3;
        tmp.set(me.x - ux * 30 - uz * (14 + drift), me.y + 17, me.z - uz * 30 + ux * (14 + drift)).lerp(play.pos, e);
        camera.position.copy(tmp);
        dirOf(play.yaw, play.pitch, F);
        tmp2.set(lerp(me.x + ux * 38, play.pos.x + F.x * 60, e), lerp(me.y + 1, play.pos.y + F.y * 60, e), lerp(me.z + uz * 38, play.pos.z + F.z * 60, e));
        camera.lookAt(tmp2);
        camera.rotation.z += play.roll * e;
        camera.fov = lerp(44, play.fov, e);
        bars = 1 - smoothstep(0.75, 1, u);
      } else if (phase === 'over' && kc && game.kill.on) bars = killShot(dt);
      else {
        camera.position.copy(play.pos);
        camera.rotation.set(play.pitch - play.lift, play.yaw, play.roll);
        camera.fov = play.fov;
      }
      if (trauma > 0) {
        const k = trauma * trauma * (1 - me.brace * 0.5) * Math.min(1, camera.fov / 40); // (a long lens magnifies a shake)
        camera.rotation.x += noise2(wt * 31, 3.1) * k * 0.03;
        camera.rotation.y += noise2(5.7, wt * 29) * k * 0.03;
        camera.rotation.z += noise2(wt * 27, 9.9) * k * 0.05;
      }
      if (api.shot) { const o = api.shot; camera.position.set(o.x, o.y, o.z); camera.lookAt(o.tx, o.ty, o.tz); camera.fov = o.fov || 52; }
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
      const pxPerRad = ctx.height / (2 * Math.tan((camera.fov * Math.PI) / 360));

      // The ear follows the lens.
      sfx.ear.x = camera.position.x; sfx.ear.z = camera.position.z; sfx.ear.rx = camera.matrixWorld.elements[0]; sfx.ear.rz = camera.matrixWorld.elements[2];

      // ---- sea, haze, lens ----
      ocean.update(camera);
      for (let i = 0; i < 2; i++) {
        const p = P[i];
        ocean.uniforms.uCast.value[i].set(p.x, p.y, p.z, p.alive && p.dive <= 0 && !p.hop.on ? lerp(1.85, 1.35, p.brace) : 0);
      }
      haze.shared.uSunView.value.copy(sunDir).transformDirection(camera.matrixWorldInverse);
      tmp.copy(sunDir).multiplyScalar(1000).add(camera.position).applyMatrix4(camera.matrixWorldInverse);
      const ahead = tmp.z < 0;
      tmp.applyMatrix4(camera.projectionMatrix);
      post.sun.set(tmp.x * 0.5 + 0.5, tmp.y * 0.5 + 0.5);
      raysK = ahead ? 1 - smoothstep(1.0, 2.0, Math.max(Math.abs(tmp.x), Math.abs(tmp.y))) : 0;
      const pu = post.u, under = me.dive > 0 && me.alive && phase === 'live';
      pu.uTime.value = wt;
      pu.uRays.value = raysK * 0.8;
      pu.uFlinch.value = me.alive && phase === 'live' ? me.flinch * 0.7 : 0;
      pu.uBrace.value = me.alive && phase === 'live' ? me.brace : 0;
      pu.uDive.value = damp(pu.uDive.value, under ? 1 : 0, 14, dt);
      pu.uFlash.value = flashA;
      flashA = Math.max(0, flashA - dt * 8);

      // ---- HUD ----
      S.t = wt;
      S.live = phase === 'live';
      S.alive = me.alive;
      S.under = under;
      S.brace = me.brace;
      S.rx = ctx.width / 2 - Math.tan(me.swayX) * pxPerRad; S.ry = ctx.height / 2 - Math.tan(me.swayY + play.lift) * pxPerRad;
      S.spreadPx = (0.004 + (1 - me.brace) * 0.012) * pxPerRad;
      S.clear = game.sees(ctx.me) && foe.alive;
      S.wall = game.los.wall;
      S.ready = me.bolt <= 0 && me.reload <= 0 && me.ammo > 0 && me.wet <= 0;
      S.cycle = me.reload > 0 ? me.reload / R.reload : Math.max(0, me.bolt) / R.bolt;
      S.ammo = me.ammo; S.reloading = me.reload > 0;
      S.dist = Math.round(game.los.dist);
      S.kmh = Math.round(me.v * 3.6);
      pushS = damp(pushS, me.push - (me.air ? 0 : R.grav * me.slope * 0.35), 5, dt); // what the water is doing to your speed
      S.push = pushS; S.white = me.white;
      S.bars = damp(S.bars, bars, 6, dt);
      S.touch = ctx.input.device === 'touch';
      S.pad = S.touch ? 8 : 14;
      S.gauge = foe.alive && me.alive;
      const hs = game.los.hs, n = game.los.n;
      for (let i = 0; i <= n; i++) S.prof[i] = hs[ctx.me ? n - i : i];
      S.eyeA = game.eyeY(me); S.eyeB = game.topY(foe) - 0.12;
      // teaching: how to shoot on the device in hand, until the first shot; then how to brace, until the first brace
      if (me.brace > 0.8 && human) braced = true;
      const pr = PROMPTS[ctx.input.device] || PROMPTS.kbm, want = S.live && human && (!fired || !braced);
      promptT = damp(promptT, want ? 1 : 0, want ? 4 : 9, dt);
      S.promptA = promptT * (0.8 + 0.2 * Math.sin(wt * 5));
      if (want) { S.prompt = fired ? pr[2] : pr[0]; S.prompt2 = fired ? '' : pr[1]; }
      noteT = Math.max(0, noteT - dt);
      S.noteA = phase === 'over' ? 0 : noteT;

      // the other sniper: a solid diamond while you can see them, a hollow one where they went behind the water
      const m0 = S.marks[0];
      const can = S.clear || phase === 'intro' || ctx.sudden;
      if (can) { seenX = foe.x; seenZ = foe.z; }
      foeVis = damp(foeVis, can ? 1 : 0.5, can ? 10 : 2, dt);
      m0.a = foe.alive && phase !== 'over' ? foeVis : 0;
      if (m0.a > 0) {
        project(seenX, (can ? foe.y : sea.height(seenX, seenZ)) + 2.3, seenZ, m0);
        m0.kind = 'foe'; m0.color = foe.color; m0.hollow = !can;
        m0.text = phase === 'intro' ? ctx.players[foe.i].name : `${S.dist} M`;
        m0.sub = phase === 'intro' ? '' : can ? '' : game.hidden(foe) ? 'UNDER' : game.los.wall ? 'BEHIND SPRAY' : 'BEHIND A CREST';
      }
      const m1 = S.marks[1];
      m1.a = phase === 'intro' && introT >= 0 ? 1 - smoothstep(2.3, 3.1, introT) : 0;
      if (m1.a > 0) { project(me.x, me.y + 2.3, me.z, m1); m1.kind = 'me'; m1.color = me.color; m1.hollow = false; m1.text = 'YOU'; m1.sub = ''; }
      const m2 = S.marks[2], fin = world.fin, fd = Math.hypot(fin.x - me.x, fin.z - me.z);
      m2.a = S.live && me.alive && fin.up && fd < 26 ? 1 - smoothstep(18, 26, fd) : 0;
      if (m2.a > 0) { project(fin.x, fin.y + 1.6, fin.z, m2); m2.kind = 'fin'; if (!m2.on) m2.a = 0; }
      for (const t of S.hits) {
        t.a = Math.max(0, t.a - dt);
        if (t.a > 0) { tmp.set(t.x, me.y + 1, t.z).applyMatrix4(camera.matrixWorldInverse); t.ang = Math.atan2(tmp.x, -tmp.z); }
      }
    },

    render() {
      const now = performance.now(), iv = tPrev ? now - tPrev : 0;
      tPrev = now;
      S.w = ctx.width; S.h = ctx.height;
      drawOverlay(ctx.g, S);
      const inBand = fresh;
      fresh = false;
      frames++;
      if (!inBand && frames > 1) {
        // A render with no update before it is the core photographing the world (the last
        // frame of a round is the next transition's first), or a paused game: the canvas must
        // hold the picture as it is NOW, so the first such call draws; after that the graded
        // frame is simply put back.
        if (stills++ > 0) return post.present();
        if (W.settle) W.settle(); // (a round that ends on a hitch still ends on its last frame)
      } else {
        stills = 0;
        if (api.force > 0) api.force--; // (test scripts: draw now)
        else if (Q.soft && frames > 1) {
          // A software rasteriser pays for a draw over the next several frames, not in one —
          // and for the first one, which builds every shader, most of all. Add up everything
          // it stalled since, do not draw again while it is still catching up, and let no
          // more than a sixth of the time go on drawing: the duel itself runs true.
          if (iv > 40) debt += iv - 17;
          if (iv > 60 || now - drawAt < Math.min(12000, 250 + debt * 5)) return;
          if (debt > 1300) post.setScale(post.scale * 0.86); else if (debt < 320 && api.draws > 2) post.setScale(Math.min(0.5, post.scale * 1.08));
        }
      }
      if (W.stage) W.stage(api.draws);
      drawAt = now;
      debt = api.draws ? 0 : 500;
      api.draws++;
      post.render(scene, camera, raysK > 0.01 && !Q.soft);
    },
  });
  return api;
}
