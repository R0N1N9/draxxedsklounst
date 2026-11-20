// INK CITY — the camera and everything that hangs off it: the over-the-shoulder rig and the
// punch-in of the scope, the establishing shot that opens a round, the low hero angle of the
// splash page, the sound effects pinned to places in the world, and the state of the 2D layer.
import { clamp, lerp, damp, smoothstep, noise2 } from '../../kit.js';
import { EYE } from './hero.js';
import { drawOverlay } from './overlay.js';

const FOV = 55, ZOOM = 4.6, BOOM = 3.6, ARC_N = 14;
const ZERO_SAFE = { left: 0, right: 0, top: 0, bottom: 0 };

export function makeView(ctx, THREE, renderer, X) {
  const { scene, W, fx, post, P, G, letters, Q } = X;
  const camera = new THREE.PerspectiveCamera(FOV, ctx.width / Math.max(1, ctx.height), 0.3, 900);
  camera.rotation.order = 'YXZ';
  const me = P[ctx.me], foe = P[1 - ctx.me];
  const E = new THREE.Vector3(), F = new THREE.Vector3(), Rt = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), aimPt = new THREE.Vector3(), look = new THREE.Vector3();
  const mkArc = () => ({ a: 0, n: 0, pts: new Float32Array(ARC_N * 2), color: '#fff' });
  const S = {
    w: 1, h: 1, t: 0, ui: 1, touch: false, safeL: 0, safeR: 0, safeB: 0, live: false, alive: true, scope: 0, spreadPx: 10, blocked: false,
    ammo: 4, mag: 4, cycle: 0, reload: 0, range: 0, holds: [{ px: 0, label: '80' }, { px: 0, label: '100' }, { px: 0, label: '120' }],
    leap: { a: 0, n: 0, ready: false, seen: false, pts: new Float32Array(ARC_N * 2), x: 0, y: 0, ry: 1, tag: '' }, arcs: [mkArc(), mkArc()],
    marks: [], pops: [], prompt: '', note: '', noteA: 0, splash: { a: 0, t: 0, word: 'KAPOW', x: 0, y: 0, side: 1, caption: '' },
  };
  for (let i = 0; i < 5; i++) S.marks.push({ on: false, x: 0, y: 0, ang: 0, a: 0, kind: '', color: '#fff', hollow: false, text: '' });
  for (let i = 0; i < 14; i++) S.pops.push({ on: false, word: 'BLAM', wx: 0, wy: 0, wz: 0, t: 0, dur: 1, rot: 0, size: 1, rise: 1, x: 0, y: 0, px: 10, pin: false });
  let wt = 0, boom = BOOM, trauma = 0, kickV = 0, kickA = 0, introT = -1, kc = null, scopeAmt = 0, pointScale = 600, aimOk = false, flashA = 0, speedA = 0, suddenA = 0, popN = 0;
  let frames = 0, fresh = false, held = false, shadowDirty = true, glintT = 0, drawAfter = 0, since = 0;
  const lt = { ok: false, x: 0, z: 0, roof: 0 };
  const api = { camera, lt, S };

  const dirOf = (yaw, pitch, out) => out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  // The sniper's place on the page: left of centre, and on a phone clear of the left thumb's cluster.
  function shoulder() {
    const w = ctx.width, h = Math.max(1, ctx.height), safe = ctx.safe || ZERO_SAFE;
    const f = h < 480 && safe.left > 0 ? clamp((safe.left + w * 0.05) / w, 0.38, 0.46) : 0.38;
    return (0.5 - f) * 2 * BOOM * Math.tan((FOV * Math.PI) / 360) * (w / h);
  }

  const play = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, fov: FOV };
  function rig(p, dt, out) {
    const ss = p.scope * p.scope * (3 - 2 * p.scope);
    const yaw = p.yaw + p.swayX * ss, pitch = clamp(p.pitch + p.swayY * ss + kickA, -1.3, 1.3);
    dirOf(yaw, pitch, F);
    Rt.set(Math.cos(yaw), 0, -Math.sin(yaw));
    const sh = Math.min(0.85, shoulder()), px = p.x + Rt.x * sh, py = p.y + 1.74, pz = p.z + Rt.z * sh;
    tmp.set(-F.x * BOOM, 0.42 - F.y * BOOM, -F.z * BOOM);
    const want = tmp.length();
    tmp.multiplyScalar(1 / want);
    // the boom shortens when there is a wall behind
    const free = Math.max(0.5, W.ray(px, py, pz, tmp.x, tmp.y, tmp.z, want + 0.4, G.time()) - 0.4);
    boom = free < boom ? free : damp(boom, Math.min(want, free), 5, dt);
    out.pos.set(px + tmp.x * boom, py + tmp.y * boom, pz + tmp.z * boom);
    out.pos.lerp(tmp2.set(p.x + F.x * 0.35, p.y + EYE + F.y * 0.35, p.z + F.z * 0.35), ss);
    out.yaw = yaw; out.pitch = pitch;
    // a leap opens the lens out as you fly and snaps it back as you land
    const L = p.leap, lu = L.on && !L.mini ? Math.sin(Math.PI * clamp(L.t / L.dur, 0, 1)) : 0;
    out.fov = (2 * Math.atan(Math.tan((FOV * Math.PI) / 360) / lerp(1, ZOOM, ss)) * 180) / Math.PI + lu * 9;
    return out;
  }
  function project(x, y, z, m) {
    tmp.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    m.ang = Math.atan2(tmp.x, -tmp.z);
    m.front = tmp.z <= -0.3;
    if (!m.front) { m.on = false; return m; }
    tmp.applyMatrix4(camera.projectionMatrix);
    m.x = (tmp.x * 0.5 + 0.5) * ctx.width; m.y = (-tmp.y * 0.5 + 0.5) * ctx.height;
    m.on = Math.abs(tmp.x) < 0.97 && Math.abs(tmp.y) < 0.93;
    return m;
  }
  // Sample a leap's arc into screen points; returns how many landed in front of the lens.
  // clip: stop where the city hides the rest of the arc from the lens.
  const pm = { on: false, front: false, x: 0, y: 0, ang: 0 };
  function arcPts(L, u0, u1, pts, clip) {
    let n = 0;
    const cp = camera.position, T = G.time();
    for (let i = 0; i < ARC_N; i++) {
      const u = lerp(u0, u1, i / (ARC_N - 1)), x = lerp(L.x0, L.x1, u), y = lerp(L.y0, L.y1, u) + L.H * 4 * u * (1 - u) + 0.3, z = lerp(L.z0, L.z1, u);
      project(x, y, z, pm);
      if (!pm.front) { if (n) break; continue; }
      if (clip && n > 1 && !W.los(cp.x, cp.y, cp.z, x, y, z, T, true)) break;
      pts[n * 2] = pm.x; pts[n * 2 + 1] = pm.y; n++;
    }
    return n;
  }
  // The landing ring is built into the world, so parapets and walls hide it as they should.
  function ring(x, y, z, d, ready, a) {
    const r = Math.max(0.95, d * 0.024) * (1 + Math.sin(wt * 6) * 0.07), w = Math.max(0.09, d * 0.0042), n = 20;
    const c0 = ready ? 1 : 0.95, c1 = ready ? 0.86 : 0.93, c2 = ready ? 0.25 : 0.82;
    for (const k of [1, 0.42]) {
      const rr = r * k * (0.6 + 0.4 * a);
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * 6.2832, a1 = ((i + 1) / n) * 6.2832;
        fx.beam(x + Math.cos(a0) * rr, y + 0.07, z + Math.sin(a0) * rr, x + Math.cos(a1) * rr, y + 0.07, z + Math.sin(a1) * rr, w, c0, c1, c2);
      }
    }
  }
  const nearer = (sx, sy, sz, x, y, z, t) => {
    const cx = x - sx, cy = y - sy, cz = z - sz, tc = cx * F.x + cy * F.y + cz * F.z;
    return tc > 0.5 && tc < t && (cx - F.x * tc) ** 2 + (cy - F.y * tc) ** 2 + (cz - F.z * tc) ** 2 < 2.2 ? tc : t;
  };

  Object.assign(api, {
    shake(k) { trauma = Math.min(1, trauma + k); },
    kick(k) { kickV += 0.3 * k; trauma = Math.min(1, trauma + 0.2 * k); },
    flash(k) { flashA = Math.max(flashA, k); },
    shadows() { shadowDirty = true; },
    beginIntro() { introT = 0; drawAfter = 0; since = 99; },
    poke() { drawAfter = 0; since = 99; }, // whatever the pacing says, draw the next frame
    /** A sound effect, lettered into the world at (x, y, z). pin: keep it on the page even if the place is off it. */
    pop(word, x, y, z, size = 1, dur = 0.9, pin = false) {
      const p = S.pops[popN]; popN = (popN + 1) % S.pops.length;
      p.on = true; p.word = word; p.wx = x; p.wy = y; p.wz = z; p.t = 0; p.dur = dur; p.size = size; p.rot = (Math.random() - 0.5) * 0.36; p.rise = 0.5 + Math.random(); p.pin = pin;
    },
    /** Direction from the muzzle to whatever the open-sight crosshair is on. */
    aim(eye, out) { if (!aimOk) return false; out.subVectors(aimPt, eye).normalize(); return true; },
    killCam(v, dx, dz, word, text) {
      trauma = Math.min(1, trauma + 0.6);
      const l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, T = G.time();
      let cx = v.x, cy = v.y + 3.2, cz = v.z, found = false;
      // a low angle off to one side, looking back along the shot: the first that has a clear view
      for (const d of [4.2, 3.2, 2.4]) for (const sd of [1, -1]) for (const bk of [0.7, 0, 1.4]) {
        if (found) break;
        const x = v.x + -uz * sd * d - ux * d * bk, z = v.z + ux * sd * d - uz * d * bk, r = W.roofAt(x, z, null), y = (r ? Math.max(r.h, v.y) : v.y) + 0.75;
        if ((r && r.h > v.y + 1.2) || !W.los(v.x, v.y + 1.2, v.z, x, y, z, T, true)) continue;
        cx = x; cy = y; cz = z; found = true;
      }
      kc = { v, t: 0, x: cx, y: cy, z: cz, roll: (Math.random() < 0.5 ? -1 : 1) * 0.13, depth: Math.hypot(cx - v.x, cy - v.y - 1, cz - v.z) + 1.3 };
      look.set(v.x, v.y + 1.1, v.z);
      S.splash.word = word; S.splash.caption = text; S.splash.t = 0; S.splash.a = 1; S.splash.side = kc.roll > 0 ? 1 : -1;
      for (const p of S.pops) p.on = false;
      S.leap.a = 0; S.arcs[0].a = S.arcs[1].a = 0;
      drawAfter = 0; since = 99;
    },
    focus() {
      const r = ctx.result, v = P[r && r.victim >= 0 ? r.victim : 1 - ctx.me], m = project(v.x, v.y + 1, v.z, S.marks[4]);
      return m.on ? { x: m.x, y: m.y } : { x: ctx.width / 2, y: ctx.height / 2 };
    },
    dispose() {},
    resize(w, h) {
      if (!(w > 0 && h > 0)) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      post.resize();
    },

    update(dt, rdt) {
      const phase = ctx.phase, T = G.time(), human = !me.bot;
      // Clocks run every frame...
      wt += rdt;
      kickV -= kickA * 70 * dt; kickV *= Math.exp(-10 * dt); kickA = Math.max(-0.02, kickA + kickV * dt);
      trauma = Math.max(0, trauma - rdt * 1.6);
      flashA = Math.max(0, flashA - rdt * 7);
      if (phase === 'intro' && introT >= 0) introT += rdt;
      if (phase === 'over' && kc) kc.t += rdt;
      for (const p of S.pops) if (p.on && (p.t += rdt) >= p.dur) p.on = false;
      // ...but with no GPU the page is redrawn only now and then (see render), and between
      // draws the lens and the 2D layer hold still with it, so what is on screen stays one picture.
      if (!fresh) held = !Q.rich && frames > 3 && (performance.now() < drawAfter || since < 3); // (the staged first pages go straight out)
      fresh = true;
      if (held) return;
      rig(me, dt, play);
      scopeAmt = me.alive ? me.scope : 0;
      if (phase === 'intro' || introT < 0) {
        // The establishing shot: start across the street on the other sniper's roof, crane up
        // over the canyon and come down behind your own shoulder as the count ends.
        const u = clamp(introT / 3.3, 0, 1), e = u * u * (3 - 2 * u), s = Math.sign(me.z) || 1, drift = Math.sin(wt * 0.3) * 1.5;
        const ax = foe.x - 7 + drift, ay = foe.y + 4.2, az = foe.z + s * 9, bx = -26, by = me.y + 24, bz = s * 20;
        const q0 = (1 - e) * (1 - e), q1 = 2 * e * (1 - e), q2 = e * e;
        camera.position.set(q0 * ax + q1 * bx + q2 * play.pos.x, q0 * ay + q1 * by + q2 * play.pos.y, q0 * az + q1 * bz + q2 * play.pos.z);
        dirOf(play.yaw, play.pitch, F);
        tmp.set(q0 * foe.x + q1 * 0 + q2 * (play.pos.x + F.x * 50), q0 * (foe.y + 1.2) + q1 * 30 + q2 * (play.pos.y + F.y * 50), q0 * foe.z + q1 * 0 + q2 * (play.pos.z + F.z * 50));
        camera.up.set(0, 1, 0);
        camera.lookAt(tmp);
        camera.fov = lerp(44, FOV, e);
        scopeAmt = 0;
      } else if (phase === 'over' && kc) {
        const v = kc.v, k = 1 - Math.exp(-Math.min(0.1, rdt) * 3.2);
        look.x += (v.x - look.x) * k; look.y += (v.y + 1 - look.y) * k; look.z += (v.z - look.z) * k;
        camera.position.set(kc.x, kc.y + kc.t * 0.12, kc.z);
        camera.up.set(Math.sin(kc.roll), Math.cos(kc.roll), 0);
        camera.lookAt(look);
        camera.fov = lerp(46, 58, smoothstep(1, 2.3, kc.t));
        scopeAmt = 0;
      } else {
        camera.position.copy(play.pos);
        camera.rotation.set(play.pitch, play.yaw, 0);
        camera.fov = play.fov;
      }
      if (trauma > 0) {
        const k = trauma * trauma * (1 - scopeAmt * 0.6);
        camera.rotation.x += noise2(wt * 31, 3.1) * k * 0.04;
        camera.rotation.y += noise2(5.7, wt * 29) * k * 0.04;
        camera.rotation.z += noise2(wt * 27, 9.9) * k * 0.06;
      }
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
      fx.setCamera(camera);
      const fovT = Math.tan((camera.fov * Math.PI) / 360);
      pointScale = ctx.height / (2 * fovT);

      // Open sights: what the crosshair is on, at the depth of whoever it is covering.
      aimOk = false;
      S.blocked = false;
      S.range = 0;
      const safe = ctx.safe || ZERO_SAFE;
      if (phase === 'live' && me.alive && human) {
        dirOf(play.yaw, play.pitch, F);
        const skipD = scopeAmt < 0.6 ? boom + 0.5 : 0, sx = camera.position.x + F.x * skipD, sy = camera.position.y + F.y * skipD, sz = camera.position.z + F.z * skipD;
        let t = W.ray(sx, sy, sz, F.x, F.y, F.z, 400, T);
        if (foe.alive) t = nearer(sx, sy, sz, foe.x, foe.y + 1, foe.z, t);
        if (t < 399) S.range = Math.round(t + skipD);
        if (scopeAmt < 0.6) {
          aimPt.set(sx + F.x * t, sy + F.y * t, sz + F.z * t);
          aimOk = true;
          // is something right in front of the muzzle that the crosshair cannot see?
          E.set(me.x, me.y + EYE, me.z);
          tmp.subVectors(aimPt, E);
          const d = tmp.length();
          tmp.multiplyScalar(1 / d);
          S.blocked = d > 3 && W.ray(E.x, E.y, E.z, tmp.x, tmp.y, tmp.z, 2.4, T) < 2.4;
        }
        // where LEAP would go
        if (!me.leap.on && G.suddenT() < G.SHOWDOWN) {
          const r = W.leapTarget(me, me.x, me.y + EYE, me.z, F.x, F.y, F.z);
          lt.ok = r.ok; lt.x = r.x; lt.z = r.z; lt.roof = r.roof;
        } else lt.ok = false;
      } else lt.ok = false;
      const lp = S.leap;
      lp.a = phase === 'live' ? damp(lp.a, lt.ok && scopeAmt < 0.3 ? 1 : 0, 12, rdt) : 0;
      if (lt.ok) {
        const L = G.arcOf(me, lt.x, lt.z, lt.roof), cp = camera.position;
        lp.n = arcPts(L, 0.12, 1, lp.pts, true);
        project(L.x1, L.y1 + 0.05, L.z1, pm);
        const d = Math.hypot(L.x1 - cp.x, L.y1 - cp.y, L.z1 - cp.z) || 1;
        lp.x = pm.x; lp.y = pm.y; lp.ry = clamp((pointScale * 1.2) / d, 7, 90) * clamp((cp.y - L.y1) / d + 0.12, 0.16, 0.9);
        lp.seen = pm.on && W.los(cp.x, cp.y, cp.z, L.x1, L.y1 + 0.35, L.z1, T, true);
        lp.ready = me.leapCd <= 0;
        lp.tag = G.taught.leap ? '' : ctx.input.device === 'touch' ? 'TAP LEAP' : ctx.input.device === 'gamepad' ? 'LB: LEAP' : 'SHIFT: LEAP';
        if (lp.a > 0.05) ring(L.x1, L.y1, L.z1, d, lp.ready, lp.a);
      } else lp.n = 0;
      // leaps in flight draw their own line
      for (let i = 0; i < 2; i++) {
        const p = P[i], a = S.arcs[i];
        if (p.leap.on && !p.leap.mini) { a.n = arcPts(p.leap, 0, clamp(p.leap.t / p.leap.dur, 0.02, 1), a.pts); a.a = 1; a.color = i === ctx.me ? '#fff4d6' : p.color; }
        else a.a = Math.max(0, a.a - rdt * 2.2);
      }

      // The ear follows the lens.
      const ear = X.sfx.ear;
      ear.x = camera.position.x; ear.y = camera.position.y; ear.z = camera.position.z; ear.rx = camera.matrixWorld.elements[0]; ear.rz = camera.matrixWorld.elements[2];

      // A scope pointed your way catches the sunset.
      glintT -= rdt;
      if (glintT <= 0) {
        glintT = 0.42;
        for (const p of P) {
          if (!p.alive || p.scope < 0.7 || (p === me && phase !== 'over')) continue;
          dirOf(p.yaw, p.pitch, F);
          tmp.set(camera.position.x - p.x, camera.position.y - p.y - EYE, camera.position.z - p.z);
          const d = tmp.length();
          if (d < 6 || tmp.dot(F) / d < 0.94) continue;
          fx.flash(p.x + F.x * 0.7, p.y + EYE + 0.05 + F.y * 0.7, p.z + F.z * 0.7, clamp(d * 0.0065, 0.14, 0.62), 0.26, GLINT);
          if (p !== me && human && phase === 'live' && Math.random() < 0.5) X.sfx.glint();
        }
      }

      // ---- the press ----
      const ts = G.suddenT(), u = post.u;
      speedA = damp(speedA, me.alive && me.leap.on && !me.leap.mini && phase === 'live' ? 0.85 : 0, 9, rdt);
      suddenA = damp(suddenA, ts >= 0 && phase === 'live' ? 1 : 0, 3, rdt);
      u.uTime.value = wt;
      u.uScope.value = scopeAmt;
      u.uSpeed.value = speedA;
      u.uFlash.value = flashA;
      u.uSudden.value = suddenA * (0.6 + 0.4 * Math.sin(wt * 5));
      const spl = S.splash;
      if (phase === 'over' && kc) {
        spl.t = kc.t;
        project(kc.v.x, kc.v.y + 1.1, kc.v.z, pm);
        if (kc.t < 0.05) { spl.x = pm.x; spl.y = pm.y; }
        // the burst holds while the page is read, then the city comes back behind the tumble
        const k = kc.t < 1.4 ? 1 : Math.max(0, 1 - (kc.t - 1.4) / 0.5);
        u.uSplash.value.set(spl.x / ctx.width, 1 - spl.y / ctx.height, k, kc.depth);
        spl.a = kc.t < 2.2 ? 1 : Math.max(0, 1 - (kc.t - 2.2) / 0.4);
      } else { u.uSplash.value.z = 0; spl.a = 0; }

      // ---- 2D layer state ----
      const w = ctx.width, h = ctx.height;
      S.w = w; S.h = h; S.t = wt;
      S.ui = clamp(Math.min(w / 1280, h / 720), 0.62, 1.5);
      S.touch = ctx.input.device === 'touch';
      S.safeL = h < 480 ? safe.left : 0; S.safeR = h < 480 ? safe.right : 0; S.safeB = safe.bottom;
      S.live = phase === 'live'; S.alive = me.alive; S.scope = scopeAmt;
      S.spreadPx = G.hipSpread(me) * pointScale;
      S.ammo = me.ammo; S.cycle = me.bolt > 0 ? me.bolt / G.BOLT : 0; S.reload = me.reload > 0 ? me.reload / G.RELOAD : 0;
      for (let i = 0; i < 3; i++) { const D = 80 + i * 20; S.holds[i].px = ((0.5 * G.GRAV * (D / G.V) ** 2) / D - G.ZERO) * pointScale; }
      S.note = G.notes.text; S.noteA = G.notes.a;
      S.prompt = G.prompt();
      // pops: pinned to their place in the world, sized by distance
      for (const p of S.pops) {
        if (!p.on) continue;
        project(p.wx, p.wy, p.wz, pm);
        const d = Math.hypot(p.wx - camera.position.x, p.wy - camera.position.y, p.wz - camera.position.z) || 1;
        p.px = clamp((pointScale * 1.3 * p.size) / d, h * 0.045 * p.size, h * 0.15 * p.size);
        if (!pm.front) { if (!p.pin) { p.x = -9999; continue; } pm.x = w * (0.5 + Math.sin(pm.ang) * 0.4); pm.y = h * 0.5; }
        p.x = p.pin ? clamp(pm.x, w * 0.14, w * 0.86) : pm.x; p.y = p.pin ? clamp(pm.y, h * 0.2, h * 0.8) : pm.y;
      }
      // the other sniper: marked once you have had eyes on them for a moment, or they give themselves away
      const m0 = S.marks[0];
      m0.a = 0;
      if (foe.alive && phase !== 'over') {
        const los = W.los(me.x, me.y + EYE, me.z, foe.x, foe.y + 1.5, foe.z, T) || W.los(me.x, me.y + EYE, me.z, foe.x, foe.y + 0.8, foe.z, T);
        project(foe.x, foe.y + 2.25, foe.z, m0);
        const loud = T - foe.shotT < 2.5 || foe.leap.on || foe.speed > 4 || foe.scope > 0.7;
        const always = phase === 'intro' || ts >= 0;
        foe.vis = always ? 1 : damp(foe.vis, los ? 1 : 0, los ? (loud ? 7 : 1.1) : 3.5, rdt);
        m0.a = foe.vis > 0.5 || always ? clamp(foe.vis * 2 - 1, 0, 1) * (phase === 'intro' ? smoothstep(0.1, 0.5, introT) * (1 - smoothstep(2.6, 3.2, introT)) : 1) : 0;
        m0.kind = 'foe'; m0.color = foe.color; m0.hollow = ts >= 0 && !los;
        m0.text = phase === 'intro' ? ctx.players[foe.i].name : `${Math.round(Math.hypot(foe.x - me.x, foe.z - me.z))} M`;
        if (!m0.on && !(always || T - foe.shotT < 2.5)) m0.a = 0; // off the page, only a shot or sudden death points the way
      }
      // where the last shot at you came from
      const m1 = S.marks[1], age = T - foe.pingT;
      m1.a = foe.alive && phase === 'live' && age < 2.6 && m0.a < 0.5 ? 1 - age / 2.6 : 0;
      if (m1.a > 0) { project(foe.pingX, foe.pingY + 0.6, foe.pingZ, m1); m1.kind = 'tell'; m1.color = foe.color; m1.hollow = false; m1.text = ''; }
      const m2 = S.marks[2];
      m2.a = phase === 'intro' && introT >= 0 ? smoothstep(2.0, 2.5, introT) * (1 - smoothstep(3.2, 3.5, introT)) : 0;
      if (m2.a > 0) { project(me.x, me.y + 2.25, me.z, m2); m2.kind = 'me'; m2.color = me.color; m2.hollow = false; m2.text = 'YOU'; }
    },

    render() {
      // A machine with no GPU cannot draw this page sixty times a second. It draws one, waits
      // for the rasteriser to really finish it (left to queue, a software GPU falls further
      // behind with every page and the whole browser stalls), rests seven times as long as the
      // page took (half a second at least), and keeps the duel and the 2D layer running true in
      // between. A render with no update before it is the core photographing the world for a
      // transition: always drawn.
      const inBand = fresh;
      fresh = false;
      const draw = Q.rich || !inBand || !held;
      since = draw ? 0 : since + 1;
      drawOverlay(ctx.g, S, letters);
      if (!draw) return;
      frames++;
      renderer.shadowMap.needsUpdate = Q.rich || shadowDirty;
      shadowDirty = false;
      if (!Q.rich && frames <= 4) X.stage(frames - 1);
      const t0 = performance.now();
      post.render(scene, camera, !Q.rich);
      if (!Q.rich) {
        const cost = performance.now() - t0;
        drawAfter = performance.now() + clamp(cost * 7, 600, 6000);
      }
    },
  });
  return api;
}
const GLINT = [1, 1, 0.92];
