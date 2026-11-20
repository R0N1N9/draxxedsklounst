// IRON AUTUMN — the camera and everything that depends on it: the over-the-shoulder rig
// and the scope, the crane shot that opens a round, the low orbit that closes it, what the
// HUD needs projected to the screen, and the per-frame uniforms of the sky, fog and post.
import { clamp, lerp, damp, smoothstep, noise2 } from '../../kit.js';
import { headY } from './soldier.js';
import { SUN } from './kitbash.js';
import { SHELL_LETHAL } from './map.js';
import { drawOverlay } from './overlay.js';

const FOV = 58, ZOOM = 4.6;

export function makeView(ctx, THREE, renderer, W) {
  const { scene, map, fx, post, atmos, fog, P, G, events, decoys, Q } = W;
  const camera = new THREE.PerspectiveCamera(FOV, ctx.width / ctx.height, 0.07, 1500);
  camera.rotation.order = 'YXZ';
  const me = P[ctx.me], foe = P[1 - ctx.me];
  const E = new THREE.Vector3(), F = new THREE.Vector3(), Rt = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), aimPt = new THREE.Vector3();
  const sunDir = new THREE.Vector3(SUN.x, SUN.y, SUN.z), sunCol = new THREE.Color(1.0, 0.56, 0.24);
  const size = new THREE.Vector2();
  const S = { // HUD state, refilled every frame
    w: 1, h: 1, t: 0, scope: 0, live: false, alive: true, spreadPx: 8, blocked: false, ammo: 5, mag: 5, cycling: false, reloading: false, cycle: 0, crouch: false, bell: 0,
    shell: 0, exposed: '', zone: '', zoneBad: false, note: '', noteA: 0, bars: 0, pad: 0, marks: [], hits: [],
  };
  for (let i = 0; i < 5; i++) S.marks.push({ on: false, x: 0, y: 0, ang: 0, a: 0, kind: '', color: '#fff', hollow: false, text: '', ring: false });
  for (let i = 0; i < 4; i++) S.hits.push({ ang: 0, a: 0, near: false });
  let wt = 0, boom = 2.8, trauma = 0, kickV = 0, kickA = 0, introT = -1, kc = null, scopeAmt = 0, pointScale = 600, aimOk = false, blocked = false, bellA = 0, raysK = 0;
  let frames = 0, tPrev = 0, worst = 0, worstPrev = 0, cost = 0, skipLeft = 0, fresh = false, wasFallen = false;
  const api = { camera, shot: null, force: 0, wt: 0, scopeAmount: 0, pointScale: 600 };

  const dirOf = (yaw, pitch, out) => out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));

  // The play camera for sniper p: over the right shoulder, or down the scope.
  function rig(p, dt, out) {
    G.eye(p, E);
    const s = p.scope, ss = s * s * (3 - 2 * s);
    const yaw = p.yaw + p.swayX * ss, pitch = clamp(p.pitch + p.swayY * ss + kickA, -1.3, 1.3);
    dirOf(yaw, pitch, F);
    Rt.set(Math.cos(yaw), 0, -Math.sin(yaw));
    // Pivot at the shoulder; the boom shortens when there is a wall behind.
    const px = p.x + Rt.x * 0.38, py = p.y + headY(p.k) + 0.2, pz = p.z + Rt.z * 0.38;
    tmp.set(Rt.x * 0.62 - F.x * 3.0, 0.28 - F.y * 3.0, Rt.z * 0.62 - F.z * 3.0);
    const want = tmp.length();
    tmp.multiplyScalar(1 / want);
    const free = Math.max(0.3, map.ray(px, py, pz, tmp.x, tmp.y, tmp.z, want + 0.3, G.time(), false) - 0.3);
    boom = free < boom ? free : damp(boom, Math.min(want, free), 5, dt);
    out.pos.set(px + tmp.x * boom, py + tmp.y * boom, pz + tmp.z * boom);
    out.pos.y = Math.max(out.pos.y, map.height(out.pos.x, out.pos.z) + 0.25);
    out.pos.lerp(tmp2.set(E.x + F.x * 0.1, E.y + F.y * 0.1, E.z + F.z * 0.1), ss);
    out.yaw = yaw; out.pitch = pitch;
    out.fov = (2 * Math.atan(Math.tan((FOV * Math.PI) / 360) / lerp(1, ZOOM, ss)) * 180) / Math.PI;
    return out;
  }
  const play = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, fov: FOV };

  function project(x, y, z, m) {
    tmp.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    m.ang = Math.atan2(tmp.x, -tmp.z);
    if (tmp.z > -0.1) { m.on = false; return m; }
    tmp.applyMatrix4(camera.projectionMatrix);
    m.x = (tmp.x * 0.5 + 0.5) * ctx.width; m.y = (-tmp.y * 0.5 + 0.5) * ctx.height;
    m.on = Math.abs(tmp.x) < 0.96 && Math.abs(tmp.y) < 0.9;
    return m;
  }

  Object.assign(api, {
    shake(level) { trauma = Math.min(1, trauma + level); },
    kick(k) { kickV += 0.34 * k; trauma = Math.min(1, trauma + 0.18 * k); },
    beginIntro() { introT = 0; },
    // Direction from the eye to whatever the open-sight crosshair is on (false in the scope).
    aim(eye, out) { if (!aimOk) return false; out.subVectors(aimPt, eye).normalize(); return true; },
    killCam(v) {
      // Prefer looking west past the victim, so the low sun is behind them; take the first clear angle.
      const T = G.time();
      for (const ang of [0, 0.7, -0.7, 1.4, -1.4, 2.3, -2.3, 3.14]) for (const dist of [4.6, 3.3, 2.3]) {
        const x = v.x + Math.cos(ang) * dist, z = v.z + Math.sin(ang) * dist, y = Math.max(map.floorAt(x, z, v.y + 1, T) + 0.55, v.y + 0.75);
        if (Math.abs(x) > 29 || Math.abs(z) > 59 || !map.los(v.x, v.y + 1.1, v.z, x, y, z, T, true)) continue;
        kc = { v, ang, dist, t: 0, y };
        return;
      }
      kc = { v, ang: 0, dist: 1.6, t: 0, y: v.y + 2.2 };
    },
    focus() {
      const r = ctx.result, v = P[r && r.victim >= 0 ? r.victim : 1 - ctx.me], m = project(v.x, v.y + 0.5, v.z, S.marks[4]);
      return m.on ? { x: m.x, y: m.y } : { x: ctx.width / 2, y: ctx.height / 2 };
    },
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      post.resize();
    },

    update(dt, T) {
      fresh = true;
      wt += dt;
      api.wt = wt;
      const phase = ctx.phase;
      kickV -= kickA * 60 * dt; kickV *= Math.exp(-9 * dt); kickA = Math.max(-0.02, kickA + kickV * dt);
      trauma = Math.max(0, trauma - dt * 1.5);
      rig(me, dt, play);
      scopeAmt = me.alive ? me.scope : 0;
      if (phase === 'intro' || introT < 0) {
        // The arrival: high over the west side looking at the far barricade, then a crane down
        // and back to settle behind your own shoulder as the count ends.
        if (introT >= 0) introT += dt;
        const u = clamp(introT / 3.3, 0, 1), e = u * u * (3 - 2 * u), s = Math.sign(me.z) || 1, drift = Math.sin(wt * 0.25) * 2;
        const ax = -17 + drift, ay = 15, az = -s * 20, bx = -8, by = 24, bz = s * 16;
        const q0 = (1 - e) * (1 - e), q1 = 2 * e * (1 - e), q2 = e * e;
        camera.position.set(q0 * ax + q1 * bx + q2 * play.pos.x, q0 * ay + q1 * by + q2 * play.pos.y, q0 * az + q1 * bz + q2 * play.pos.z);
        dirOf(play.yaw, play.pitch, F);
        tmp.set(q0 * foe.x + q1 * 6 + q2 * (play.pos.x + F.x * 40), q0 * (foe.y + 1) + q1 * 0 + q2 * (play.pos.y + F.y * 40), q0 * foe.z + q1 * -s * 12 + q2 * (play.pos.z + F.z * 40));
        camera.lookAt(tmp);
        camera.fov = lerp(40, FOV, e);
        scopeAmt = 0;
      } else if (phase === 'over' && kc) {
        kc.t += dt;
        const v = kc.v, a = kc.ang + kc.t * 0.42, d = Math.max(1.4, kc.dist - kc.t * 0.55);
        camera.position.set(v.x + Math.cos(a) * d, kc.y + kc.t * 0.12, v.z + Math.sin(a) * d);
        camera.position.y = Math.max(camera.position.y, map.height(camera.position.x, camera.position.z) + 0.4);
        camera.lookAt(v.x + v.fx * 0.35 * Math.min(1, kc.t), v.y + lerp(1.15, 0.55, Math.min(1, kc.t / 0.9)), v.z + v.fz * 0.35 * Math.min(1, kc.t));
        camera.fov = 44;
        scopeAmt = 0;
      } else {
        camera.position.copy(play.pos);
        camera.rotation.set(play.pitch, play.yaw, 0);
        camera.fov = play.fov;
      }
      if (trauma > 0) {
        const k = trauma * trauma * (1 - scopeAmt * 0.5);
        camera.rotation.x += noise2(wt * 31, 3.1) * k * 0.035;
        camera.rotation.y += noise2(5.7, wt * 29) * k * 0.035;
        camera.rotation.z += noise2(wt * 27, 9.9) * k * 0.05;
      }
      if (api.shot) { const o = api.shot; camera.position.set(o.x, o.y, o.z); camera.lookAt(o.tx, o.ty, o.tz); camera.fov = o.fov || FOV; scopeAmt = 0; }
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
      api.scopeAmount = scopeAmt;
      renderer.getDrawingBufferSize(size);
      pointScale = api.pointScale = (size.y * post.scale) / (2 * Math.tan((camera.fov * Math.PI) / 360));

      // Open sights: what the crosshair is actually on, and whether the muzzle can see it too.
      aimOk = false;
      blocked = false;
      if (phase === 'live' && me.alive && scopeAmt < 0.6 && !me.bot) {
        dirOf(play.yaw, play.pitch, F);
        const skip = boom + 0.4, sx = play.pos.x + F.x * skip, sy = play.pos.y + F.y * skip, sz = play.pos.z + F.z * skip;
        const t = map.ray(sx, sy, sz, F.x, F.y, F.z, 320, T, false);
        aimPt.set(sx + F.x * t, sy + F.y * t, sz + F.z * t);
        aimOk = true;
        G.eye(me, E);
        tmp.subVectors(aimPt, E);
        const d = tmp.length();
        tmp.multiplyScalar(1 / d);
        blocked = d > 3 && map.ray(E.x, E.y, E.z, tmp.x, tmp.y, tmp.z, 2.6, T, false) < 2.6;
      }

      // The ear follows the lens.
      const ear = W.sfx ? W.sfx.ear : null;
      if (ear) { ear.x = camera.position.x; ear.y = camera.position.y; ear.z = camera.position.z; ear.rx = camera.matrixWorld.elements[0]; ear.rz = camera.matrixWorld.elements[2]; }

      // Lens glints: a scope pointed your way catches the sun. Decoys fake one.
      for (const p of P) {
        if (!p.alive || p.scope < 0.7 || (p === me && !kc)) continue;
        G.eye(p, E);
        dirOf(p.yaw + p.swayX, p.pitch + p.swayY, F);
        tmp.subVectors(camera.position, E);
        const d = tmp.length(), al = tmp.dot(F) / d;
        if (al < 0.93 || d < 4) continue;
        const k = smoothstep(0.93, 0.998, al) * (0.75 + 0.25 * Math.sin(wt * 23 + p.i));
        fx.star(E.x + F.x * 0.45, E.y + F.y * 0.45 + 0.04, E.z + F.z * 0.45, d * 0.02 * (0.5 + k), 5 * k, 4.6 * k, 3.8 * k, wt * 0.7);
      }
      for (const dc of decoys) {
        if (!dc.alive || dc.owner === ctx.me) continue;
        tmp.set(camera.position.x - dc.x, 0, camera.position.z - dc.z);
        const d = tmp.length(), al = (-Math.sin(dc.yaw) * tmp.x - Math.cos(dc.yaw) * tmp.z) / (d || 1);
        if (al > 0.9 && d > 8) { const k = (0.5 + 0.5 * Math.sin(wt * 3.1 + dc.x)) * smoothstep(0.9, 0.99, al); fx.star(dc.x - Math.sin(dc.yaw) * 0.3, dc.y + 1.33, dc.z - Math.cos(dc.yaw) * 0.3, d * 0.017 * k, 4 * k, 3.7 * k, 3 * k, wt); }
      }
      // Sudden death: the safe line, drawn in fire across the square.
      const ts = G.suddenT();
      if (ts >= 0) { const z = map.safeZ(ts), g = 1.6 + Math.sin(wt * 9) * 0.5; for (const s of [-1, 1]) fx.tracer(-29, 0.25, s * z, 29, 0.25, s * z, 3 * g, 0.7 * g, 0.15 * g, 0.12); }

      // Atmosphere and post follow the lens.
      atmos.update(wt, camera, pointScale);
      fog.shared.uSunView.value.copy(sunDir).transformDirection(camera.matrixWorldInverse);
      tmp.copy(sunDir).multiplyScalar(1000).add(camera.position).applyMatrix4(camera.matrixWorldInverse);
      const ahead = tmp.z < 0;
      tmp.applyMatrix4(camera.projectionMatrix);
      post.sun.set(tmp.x * 0.5 + 0.5, tmp.y * 0.5 + 0.5);
      const off = Math.max(Math.abs(tmp.x), Math.abs(tmp.y));
      raysK = ahead ? 1 - smoothstep(1.0, 2.2, off) : 0;
      const u = post.u;
      u.uTime.value = wt;
      u.uRays.value = raysK * 0.9;
      u.uSunCol.value.copy(sunCol);
      u.uExposure.value = 1.0;
      u.uFlinch.value = G.flinch();
      u.uScope.value = scopeAmt;
      u.uFade.value = 1;

      // ---- HUD state ----
      S.t = wt;
      S.scope = scopeAmt;
      S.live = phase === 'live';
      S.alive = me.alive;
      S.spreadPx = (G.hipSpread(me) * ctx.height) / (2 * Math.tan((camera.fov * Math.PI) / 360));
      S.blocked = blocked;
      S.ammo = me.ammo; S.cycling = me.bolt > 0 || me.reload > 0; S.reloading = me.reload > 0;
      S.cycle = me.reload > 0 ? me.reload / 2.7 : Math.max(0, me.bolt) / 1.25;
      S.crouch = me.crouch;
      bellA = damp(bellA, map.bellMasked(T) ? 1 : 0, 10, dt);
      S.bell = bellA;
      S.bars = damp(S.bars, phase === 'live' ? 0 : 1, phase === 'live' ? 5 : 3, dt);
      S.pad = ctx.input.device === 'touch' ? 6 : 42; // on desktop the core's chips own the bottom edge
      S.note = G.notes.text; S.noteA = G.notes.a;
      // Shell warning: how deep inside a telegraphed ring are we?
      let shell = 0;
      for (const d of events.dangers) { const k = 1 - (Math.hypot(me.x - d.x, me.z - d.z) - (d.r > 1 ? d.r : SHELL_LETHAL)) / 2.5; if (k > shell) shell = k; }
      S.shell = me.alive ? clamp(shell, 0, 1) : 0;
      const marked = me.markT > T && me.alive;
      S.exposed = ts >= 0 ? '' : marked ? 'YOU ARE MARKED' : '';
      S.zone = ts >= 0 && me.alive ? (Math.abs(me.z) > map.safeZ(ts) ? 'OUTSIDE THE LINE — MOVE TO THE FOUNTAIN' : `SAFE LINE ${Math.round(map.safeZ(ts))} M FROM THE FOUNTAIN`) : '';
      S.zoneBad = ts >= 0 && Math.abs(me.z) > map.safeZ(ts);
      // The enemy: a chevron when they have given themselves away, hollow if only a mark shows them.
      const m0 = S.marks[0];
      m0.a = 0;
      if (foe.alive && (phase !== 'over')) {
        G.eye(me, E);
        const hy = foe.y + headY(foe.k), d = Math.hypot(foe.x - me.x, foe.z - me.z);
        const los = map.los(E.x, E.y, E.z, foe.x, hy, foe.z, T) || map.los(E.x, E.y, E.z, foe.x, foe.y + 0.9, foe.z, T);
        const mk = foe.markT > T || phase === 'intro';
        const expo = clamp((foe.speed / 5.6) * (0.35 + 0.65 * foe.k) + (T - foe.shotT < 2.5 && foe.pingT === foe.shotT ? 1 : 0) + (d < 26 ? 1 : 0) + (foe.scope > 0.7 ? 0.5 : 0) + (foe.k > 0.8 ? 0.2 : 0), 0, 1);
        foe.vis = damp(foe.vis, mk ? 1 : los ? expo : 0, mk || los ? 7 : 2.5, dt);
        project(foe.x, hy + 0.32, foe.z, m0);
        m0.a = foe.vis; m0.kind = 'foe'; m0.color = foe.color; m0.hollow = !los; m0.ring = foe.markT > T && ts < 0;
        m0.text = phase === 'intro' ? ctx.players[foe.i].name : `${Math.round(d)} M`;
      }
      // Their last muzzle flash, if the bell did not cover it.
      const m1 = S.marks[1], age = T - foe.pingT;
      m1.a = foe.alive && age < 3 && foe.vis < 0.5 ? 1 - age / 3 : 0;
      if (m1.a > 0) { project(foe.pingX, foe.pingY, foe.pingZ, m1); m1.kind = 'ping'; m1.color = foe.color; }
      // You, during the arrival.
      const m2 = S.marks[2];
      m2.a = phase === 'intro' && introT >= 0 ? 1 - smoothstep(2.2, 3.1, introT) : 0;
      if (m2.a > 0) { project(me.x, me.y + headY(me.k) + 0.3, me.z, m2); m2.kind = 'me'; m2.color = me.color; m2.hollow = false; m2.ring = false; m2.text = 'YOU'; }
      for (let i = 0; i < 4; i++) {
        const src = G.hits[i], dst = S.hits[i];
        dst.a = phase === 'live' ? Math.min(1, src.a) : 0; dst.near = src.near;
        if (src.a > 0) { tmp.set(src.x, me.y + 1, src.z).applyMatrix4(camera.matrixWorldInverse); dst.ang = Math.atan2(tmp.x, -tmp.z); }
      }
    },

    render() {
      S.w = ctx.width; S.h = ctx.height;
      drawOverlay(ctx.g, S);
      // The core clamps a frame's time step, so a machine that needs 300 ms to draw the
      // square would play the duel in slow motion (and drift out of step with its opponent).
      // When drawing is that slow, draw the scene less often: the canvas keeps its last
      // picture, the frames in between cost almost nothing, and the clock stays honest.
      const now = performance.now(), iv = tPrev ? now - tPrev : 0, inBand = fresh;
      tPrev = now;
      fresh = false;
      if (iv > worst) worst = iv;
      // A render with no update before it is the core photographing the world for a
      // transition: the canvas must hold a picture, so put the last graded frame back.
      if (api.force > 0) api.force--; // (test scripts: draw now)
      else if (!inBand && frames > 3) { post.present(); return; }
      else if (++frames > 3 && skipLeft > 0) { skipLeft--; return; }
      // The longest gap since the last real draw is what that draw cost. Two slow draws in a
      // row before anything is skipped: one hitch is not a slow machine.
      cost = Math.min(worst, worstPrev || worst);
      worstPrev = worst;
      worst = 0;
      skipLeft = cost > 75 ? Math.min(240, Math.round((cost - 50) / 12)) : 0;
      // Shadows: every frame on a GPU. In software the map is static — drawn at the start and
      // again once the wall is down — and the snipers do not cast into it.
      const fallen = G.time() > map.fallWall.t + 1.6;
      renderer.shadowMap.needsUpdate = Q.rich || frames < 4 || fallen !== wasFallen;
      wasFallen = fallen;
      post.render(scene, camera, raysK > 0.01);
      renderer.setRenderTarget(null);
    },
  });
  return api;
}
