// TOY BOX — the camera: an orthographic lens looking down on the rug at three-quarters,
// fitted to whatever screen it finds (lower and flatter on a wide phone, higher on a 4:3
// tablet), plus the crane move that opens a round and the push-in that ends one. It also
// owns the mapping between the screen and the floor, which is how a mouse aims here.
import { clamp, lerp, damp, noise2, ease } from '../../kit.js';
import { RUG_A, RUG_B, SPAWN } from './world.js';
import { drawOverlay } from './overlay.js';

const HEAD = 2.3; // room above the rug's far edge for whoever stands there

export function makeView(ctx, THREE, renderer, o) {
  const { room, post, P, W, Q, S } = o;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 300);
  const me = P[ctx.me];
  // The lens: looking at (tx, 0, tz), which sits at screen (cx, cy); s = CSS px per world unit.
  const L = { tx: 0, tz: 0, cx: 1, cy: 1, s: 20, phi: 0.7, psi: 0, sp: 0, cp: 1, sy: 0, cyw: 1 };
  const fitted = { s: 20, phi: 0.7, cx: 1, cy: 1 };
  let wt = 0, introT = -1, kc = null, trauma = 0, kick = 0, punch = 0, flashA = 0;
  let fresh = false, frames = 0, tPrev = 0, worst = 0, worstPrev = 0, skipLeft = 0;
  const api = { camera, L, force: 0, wt: 0, pxPerUnit: 20 };

  // How big and how steep: fill the width with the rug, then tilt until it fills the height too.
  function fit() {
    const w = ctx.width, h = ctx.height, sf = ctx.safe, phone = h < 480;
    const top = phone ? 30 + sf.top : 56, bottom = phone ? 6 : 14, aw = w - (phone ? 8 : 24), ah = h - top - bottom;
    let s = aw / (2 * RUG_A * 1.02);
    const sin = clamp((ah / s - HEAD * 0.7) / (2 * RUG_B), 0.6, 0.8), phi = Math.asin(sin), cos = Math.cos(phi);
    s = Math.min(s, ah / (2 * RUG_B * sin + HEAD * cos));
    let cy = 0;
    for (let i = 0; i < 12; i++) {
      const used = (2 * RUG_B * sin + HEAD * cos) * s;
      cy = top + HEAD * cos * s + RUG_B * sin * s + (ah - used) * 0.5;
      if (!sf.bottom) break;
      // Both spawns must stand clear of the thumbs: lift the picture, and if that is not enough, shrink it.
      const by = cy + SPAWN[0].z * sin * s + 6, line = h - sf.bottom - 4;
      const clearX = w / 2 + SPAWN[0].x * s > sf.left + 14 && w / 2 + SPAWN[1].x * s < w - sf.right - 14;
      if (by <= line || clearX) break;
      const lift = by - line, room2 = cy - RUG_B * sin * s - HEAD * cos * s - (phone ? 18 : 40);
      if (lift <= room2) { cy -= lift; break; }
      s *= 0.96;
    }
    fitted.s = s; fitted.phi = phi; fitted.cx = w / 2; fitted.cy = cy;
  }

  function toScreen(x, y, z, out) {
    const dx = x - L.tx, dz = z - L.tz;
    out.x = L.cx + L.s * (dx * L.cyw - dz * L.sy);
    out.y = L.cy - L.s * (-L.sp * (dx * L.sy + dz * L.cyw) + L.cp * y);
    return out;
  }
  // The point at height h under screen position (sx, sy).
  function toFloor(sx, sy, h, out) {
    const a = (sx - L.cx) / L.s, b = -(sy - L.cy) / L.s, q = (L.cp * h - b) / L.sp;
    out.x = L.tx + a * L.cyw + q * L.sy;
    out.z = L.tz - a * L.sy + q * L.cyw;
    return out;
  }
  // A direction on screen (x right, y down) as a direction on the floor that LOOKS the same.
  function floorDir(sx, sy, out) {
    const q = sy / L.sp, x = sx * L.cyw + q * L.sy, z = -sx * L.sy + q * L.cyw, l = Math.hypot(x, z) || 1;
    out.x = x / l; out.z = z / l;
    return out;
  }
  // A stick pushed (mx, my): the same heading on the floor, at the stick's own strength.
  function moveDir(mx, my, out) {
    const x = mx * L.cyw + my * L.sy, z = -mx * L.sy + my * L.cyw;
    out.x = x; out.z = z;
    return out;
  }

  Object.assign(api, {
    toScreen, toFloor, floorDir, moveDir,
    shake(k) { trauma = Math.min(1, trauma + k); },
    kick(k) { kick = Math.min(1.2, kick + k); },
    beginIntro() { introT = 0; api.poke(); },
    poke() { skipLeft = 0; },
    killCam(v) { kc = { v, t: 0, side: v.x < 0 ? 1 : -1, x: v.x, z: v.z }; trauma = Math.min(1, trauma + 0.6); punch = 1; flashA = 0.55; api.poke(); },
    focus() { const v = kc ? kc.v : P[1 - ctx.me], q = toScreen(v.x, 0.8, v.z, { x: 0, y: 0 }); return { x: clamp(q.x, 0, ctx.width), y: clamp(q.y, 0, ctx.height) }; },
    resize() { post.resize(); },

    update(dt, slow) {
      fresh = true;
      wt += dt;
      api.wt = wt;
      fit();
      const phase = ctx.phase;
      trauma = Math.max(0, trauma - dt * 1.7);
      kick = Math.max(0, kick - dt * 7);
      punch = Math.max(0, punch - dt * (slow ? 2.4 : 1.2));
      flashA = Math.max(0, flashA - dt * (slow ? 14 : 6));
      // Play: the lens barely moves — it leans a little with you, so tall things show their sides.
      let psi = -0.05 * clamp(me.x / RUG_A, -1, 1) + 0.012 * Math.sin(wt * 0.31), phi = fitted.phi + 0.006 * Math.sin(wt * 0.23), s = fitted.s, tx = 0, tz = 0, cx = fitted.cx, cy = fitted.cy;
      if (phase === 'intro') {
        // The arrival: a slow crane round and down onto the rug.
        if (introT >= 0) introT += dt;
        const e = ease.inOutCubic(clamp(introT / 3.3, 0, 1));
        psi = lerp(-0.5, psi, e); s *= lerp(0.8, 1, e); phi -= (1 - e) * 0.09;
      } else if (phase === 'over' && kc) {
        // The kill: push in on where they stood, drop a little, swing round.
        kc.t += dt * (slow ? 2.86 : 1);
        const e = ease.outCubic(clamp(kc.t / 1.7, 0, 1)), d = clamp(kc.t / 2.8, 0, 1);
        tx = kc.x * 0.8 * e; tz = kc.z * 0.8 * e;
        s *= 1 + 0.72 * e + 0.08 * d; psi += kc.side * (0.2 * e + 0.1 * d); phi -= 0.11 * e;
        cx = lerp(cx, ctx.width / 2, e); cy = lerp(cy, ctx.height * 0.56, e);
      }
      if (trauma > 0) { const k = trauma * trauma; cx += noise2(wt * 33, 1.7) * k * 12; cy += noise2(4.1, wt * 31) * k * 12; psi += noise2(wt * 27, 8.8) * k * 0.012; }
      s *= 1 + kick * 0.012;
      L.tx = tx; L.tz = tz; L.cx = cx; L.cy = cy; L.s = s; L.phi = phi; L.psi = psi;
      L.sp = Math.sin(phi); L.cp = Math.cos(phi); L.sy = Math.sin(psi); L.cyw = Math.cos(psi);
      const w = ctx.width, h = ctx.height;
      camera.left = -cx / s; camera.right = (w - cx) / s; camera.top = cy / s; camera.bottom = -(h - cy) / s;
      camera.position.set(tx + L.sy * L.cp * 110, L.sp * 110, tz + L.cyw * L.cp * 110);
      camera.lookAt(tx, 0, tz);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
      api.pxPerUnit = s;
      // The sharp band of the tilt-shift follows the rug.
      const mid = cy - 0.5 * L.cp * s, half = (RUG_B * L.sp + 1.2) * s;
      post.u.uFocus.value.set(1 - mid / h, Math.min(0.46, (half / h) * (kc ? 1.4 : 1)));
      post.u.uTime.value = wt; post.u.uPunch.value = punch; post.u.uFlash.value = flashA;
    },

    render() {
      // A machine that needs a long time to draw the room (a software rasteriser, mostly)
      // would play the duel in slow motion, because the core clamps a frame's time step. So
      // when drawing is that slow, draw less often: the canvas keeps its last picture, the
      // frames in between cost almost nothing, and the clock stays honest.
      const now = performance.now(), iv = tPrev ? now - tPrev : 0, hadUpdate = fresh;
      tPrev = now;
      fresh = false;
      if (iv > worst) worst = iv;
      let draw = true;
      if (api.force > 0) api.force--;
      else if (!hadUpdate) { /* the core photographing the world for a transition: always a real frame */ }
      else if (++frames > 3 && skipLeft > 0) { skipLeft--; draw = false; }
      if (api.log) api.log.push(Math.round(now) * (draw ? 1 : -1));
      S.w = ctx.width; S.h = ctx.height;
      drawOverlay(ctx.g, S);
      if (!draw) return;
      const cost = Q.rich ? Math.min(worst, worstPrev || worst) : worst; // one hitch is not a slow machine
      worstPrev = worst;
      worst = 0;
      skipLeft = cost < 70 ? 0 : cost < 130 ? 1 : Math.min(120, Math.round(cost / 9));
      api.cost = cost; api.drawn = (api.drawn || 0) + 1;
      post.render(room.scene, camera);
      renderer.setRenderTarget(null);
    },
  });
  // (test scripts) how long n real draws take, GPU work included
  api.bench = (n = 3) => { const gl = renderer.getContext(), t0 = performance.now(); const px = new Uint8Array(4); for (let i = 0; i < n; i++) { if (Q.nopost) { renderer.setRenderTarget(null); renderer.render(room.scene, camera); } else post.render(room.scene, camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } renderer.setRenderTarget(null); return (performance.now() - t0) / n; };
  fit();
  return api;
}
