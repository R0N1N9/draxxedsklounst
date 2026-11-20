// TOY BOX — the other child. It plays the way a careful person does: get behind something,
// lean out, kneel, wait for the laser to settle on you, shoot, duck back, come a little closer.
// Skill sets how soon it notices, how well it leads, how tight a moment it waits for, and
// how often it gets out of the way of a pellet it can see coming.
// Every round it also picks a temper, so no two rounds play out alike:
//   HOLD   a marksman: stays far back, kneels long, waits for you to cross its line;
//   STALK  goes round through the dark, rarely shows itself, takes you from close;
//   PUSH   comes straight at you from cover to cover and fires early and often.
import { clamp, lerp, angDiff, gauss, TAU } from '../../kit.js';
import { hit, BODY_R } from './world.js';

const PELLET = 62;

export function makeBot(ctx, W, G) {
  const skill = clamp(ctx.botSkill, 0, 1);
  const R = Math.random;

  // far, near: the range it wants at the start and at the end of its approach; t0, t1: when
  // the approach starts and how long it takes. open: until then its shots are only ranging fire.
  // dark: how much it hates the light; hidden: how much it likes a post they cannot see.
  const TEMPERS = {
    hold: { far: 28, near: 14, t0: 12, t1: 30, open: [7, 5], dark: 1.4, hidden: 1.2, patience: [7, 4.6], rest: [0.4, 1.0], range: 0.45 },
    stalk: { far: 24, near: 7, t0: 4, t1: 24, open: [8, 6], dark: 3.6, hidden: 4.5, patience: [3.2, 2.2], rest: [0.8, 1.6], range: 1 },
    push: { far: 18, near: 6, t0: 1, t1: 14, open: [6, 4], dark: 1.2, hidden: 2.2, patience: [3.6, 2.4], rest: [0.1, 0.5], range: 0.8 },
  };

  function create(p) {
    const r = R(), style = r < 0.4 ? 'hold' : r < 0.76 ? 'stalk' : 'push', K = TEMPERS[style];
    return {
      style, K, mode: 'hide', gx: p.x, gz: p.z, post: null, wait: 0.8 + R() * 1.6, aimT: 0, seen: 0, lost: 0, err: 0, errTo: 0, errT: 0, nx: 0, nz: 0, shaken: false, off: R() < 0.5 ? 1 : -1,
      threat: 0, lastX: p.x, lastZ: p.z, stuckT: 0, still: 0, strafe: R() < 0.5 ? 1 : -1, strafeT: 0, pel: -1, pelT: 0, pelGo: false, open: K.open[0] + R() * K.open[1], nerve: 0.75 + R() * 0.5, tx: 0, tz: 0, snap: 0, cop: 4 + R() * 12,
    };
  }

  // Somewhere to be: behind something, about as far from them as its temper and the round's age say.
  function pickPost(p, e, b, T) {
    const K = b.K, sudden = W.suddenAt >= 0, want = sudden ? 7 : lerp(K.far, K.near, clamp((T - K.t0) / K.t1, 0, 1)) * b.nerve;
    let best = null, bs = -1e9;
    for (let i = 0; i < W.posts.length; i++) {
      const q = W.posts[i];
      if (q.o && !q.o.on) continue;
      if (!W.onRug(q.x, q.z, 0.8)) continue;
      const d = Math.hypot(q.x - e.x, q.z - e.z), travel = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < 5) continue;
      let s = -Math.abs(d - want) * 0.3 - travel * 0.13 - W.light(q.x, q.z) * K.dark + R() * 1.4;
      if (!W.los(q.x, q.z, e.x, e.z)) s += K.hidden;
      if (q === b.post) s -= T < 10 ? -1.5 : 1.2;
      if (s > bs) { bs = s; best = q; }
    }
    b.post = best;
    if (best) { b.gx = best.x; b.gz = best.z; } else { b.gx = clamp(p.x * 0.6, -W.lim, W.lim); b.gz = p.z * 0.6; }
  }

  // The nearest spot beside the post from which the other sniper can be seen.
  function pickPeek(p, e, b) {
    let best = -1, bd = 1e9;
    const k0 = Math.floor(R() * 16); // (no favourite side: in the dark, every spot ties)
    for (let j = 0; j < 16; j++) {
      const k = (j + k0) & 15, a = (k / 16) * TAU, r = k & 1 ? 1.5 : 2.6, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (!W.onRug(x, z, 0.8) || W.inside(x, z, BODY_R + 0.15) || !W.los(p.x, p.z, x, z, 0.3)) continue;
      if (!W.los(x, z, e.x, e.z, 0.12)) continue;
      const d = r + W.light(x, z) * 1.5;
      if (d < bd) { bd = d; best = k; }
    }
    if (best < 0) return false;
    const a = (best / 16) * TAU, r = best & 1 ? 1.5 : 2.6;
    b.gx = p.x + Math.cos(a) * r; b.gz = p.z + Math.sin(a) * r;
    return true;
  }

  // Walk towards (gx, gz), going round whatever is in the way.
  function steer(p, b, cmd) {
    let dx = b.gx - p.x, dz = b.gz - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.25) { cmd.mx = cmd.mz = 0; return true; }
    dx /= d; dz /= d;
    if (W.cast(p.x, p.z, dx, dz, Math.min(d, 6), BODY_R + 0.1) < Math.min(d, 6) - 0.05 && hit.s) {
      // Round the corner of it that costs least.
      const o = hit.s;
      let bx = 0, bz = 0, bc = 1e9;
      for (let k = 0; k < 4; k++) {
        const lx = (k & 1 ? 1 : -1) * (o.hw + 1.1), lz = (k & 2 ? 1 : -1) * (o.hd + 1.1), x = o.x + lx * o.c - lz * o.s, z = o.z + lx * o.s + lz * o.c;
        if (!W.onRug(x, z, 0.5)) continue;
        const c = Math.hypot(x - p.x, z - p.z) + Math.hypot(x - b.gx, z - b.gz) + (W.los(p.x, p.z, x, z, BODY_R) ? 0 : 6);
        if (c < bc) { bc = c; bx = x; bz = z; }
      }
      if (bc < 1e9) { dx = bx - p.x; dz = bz - p.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; }
    }
    cmd.mx = dx; cmd.mz = dz;
    return false;
  }

  function think(p, e, dt, cmd) {
    const b = p.bot, T = G.time(), sudden = W.suddenAt >= 0;
    cmd.fire = cmd.a1 = cmd.a2 = false;
    cmd.alt = false; cmd.mx = cmd.mz = 0;
    const dx = e.x - p.x, dz = e.z - p.z, dist = Math.hypot(dx, dz) || 1;
    const sees = e.alive && W.los(p.x, p.z, e.x, e.z);
    if (sees) { b.seen += dt; b.lost = 0; } else { b.lost += dt; if (b.lost > 0.5) b.seen = 0; }

    // ---- where to point: lead them by the pellet's flight, less well when less skilled ----
    // The first exchange is ranging fire: close enough to make them duck, never on them — it
    // lands a stride BEHIND a moving target, so nobody walks into it.
    const ranging = T < b.open && !sudden;
    const lead = ranging ? 0 : (dist / PELLET) * (0.35 + 0.65 * skill);
    let tx = e.x + e.vx * lead, tz = e.z + e.vz * lead;
    if (ranging) {
      const lat = (e.vx * -dz + e.vz * dx) / dist;
      if (Math.abs(lat) > 0.8) b.off = lat > 0 ? -1 : 1;
      tx += (-dz / dist) * b.off * 2.4; tz += (dx / dist) * b.off * 2.4;
    }
    b.errT -= dt;
    if (b.errT <= 0) {
      b.errT = 0.45 + R() * 0.5; b.errTo = gauss(R) * lerp(0.05, 0.009, skill) * (ranging ? 0.4 : 1);
      // How well it can make them out: a plastic man in the dark on the far side of the rug is a
      // guess. The guess is off by more the further away they are, and by less when they are lit.
      const blur = lerp(0.034, 0.009, skill);
      b.nx = gauss(R) * blur; b.nz = gauss(R) * blur;
    }
    if (!ranging) { const k = dist * (1 - 0.6 * e.lit); tx += b.nx * k; tz += b.nz * k; }
    b.tx = tx; b.tz = tz;
    b.err += (b.errTo - b.err) * Math.min(1, dt * 3);
    const want = Math.atan2(tz - p.z, tx - p.x) + b.err;
    cmd.a = p.a + angDiff(p.a, want) * (1 - Math.exp(-dt * (4 + 9 * skill)));

    // ---- is their laser on me? ----
    const onMe = e.alive && e.k > 0.6 && e.reload <= 0 && sees && Math.abs(Math.sin(angDiff(e.shotA, Math.atan2(-dz, -dx))) * dist) < 1.0;
    b.threat = onMe ? b.threat + dt : Math.max(0, b.threat - dt * 2);
    // ---- a pellet in the air, coming my way: notice it, and after a beat get out from under it ----
    let dodge = false;
    for (const q of G.pellets) {
      if (!q.on || q.owner === p.i) continue;
      if (b.pel !== q.id) {
        b.pel = q.id; b.pelT = lerp(0.3, 0.13, skill) * (0.8 + R() * 0.5);
        b.pelGo = R() < lerp(0.12, 0.62, skill);
      }
      b.pelT -= dt;
      if (!b.pelGo || b.pelT > 0) continue;
      const rx = p.x - q.x, rz = p.z - q.z, along = (rx * q.vx + rz * q.vz) / q.sp, off = Math.abs(rx * q.vz - rz * q.vx) / q.sp;
      if (along > 0 && off < 1.1) dodge = true;
    }
    const flee = b.threat > lerp(0.75, 0.3, skill) && p.reload > 0.2;
    // They have just fired at me and missed: whoever is not about to fire back gets moving.
    const fired = e.reload > e.reloadMax - 0.1;
    if (!fired) b.shaken = false;
    else if (!b.shaken && b.mode !== 'duel') {
      b.shaken = true;
      if ((b.mode === 'aim' && (p.reload > 0 || R() < (b.style === 'hold' ? 0.3 : 0.6))) || (b.mode === 'hide' && R() < 0.4)) { b.mode = 'hide'; pickPost(p, e, b, T); b.wait = 0.2 + R() * 0.6; }
    }

    // ---- the plan ----
    b.wait -= dt;
    if (sudden && b.mode !== 'duel') { b.mode = 'duel'; b.wait = 0; }
    if (b.mode === 'hide') {
      const there = steer(p, b, cmd);
      if (b.post && b.post.o && !b.post.o.on) { pickPost(p, e, b, T); }
      if (there && b.wait <= 0) {
        if (pickPeek(p, e, b)) { b.mode = 'peek'; b.aimT = 0; }
        else { pickPost(p, e, b, T); b.wait = 0.3 + R() * 0.6; }
      } else if (!there && b.wait < -6) { pickPost(p, e, b, T); b.wait = 0.5; }
    } else if (b.mode === 'peek') {
      const there = steer(p, b, cmd);
      if (there || (sees && Math.hypot(b.gx - p.x, b.gz - p.z) < 0.9)) { b.mode = 'aim'; b.aimT = 0; }
      else if (b.wait < -4) { b.mode = 'hide'; pickPost(p, e, b, T); b.wait = 0.4; }
    } else if (b.mode === 'aim') {
      cmd.alt = true;
      b.aimT += dt;
      const patience = lerp(b.K.patience[0], b.K.patience[1], skill) * b.nerve;
      if (flee || b.lost > 1.1 || b.aimT > patience || (p.reload > 0 && p.reload < p.reloadMax - 0.15)) {
        // Shot taken, or it is getting hot: back behind something, usually somewhere new.
        b.mode = 'hide'; cmd.alt = false;
        if (R() < 0.75 || flee) pickPost(p, e, b, T); else if (b.post) { b.gx = b.post.x; b.gz = b.post.z; }
        b.wait = (ranging ? 0.5 : lerp(1.3, 0.35, skill)) * (0.6 + R() * 0.9) + b.K.rest[0] + R() * b.K.rest[1];
      }
    } else {
      // Sudden death: nothing left to hide behind. Jink across their line, stop, kneel, shoot.
      b.strafeT -= dt;
      if (b.strafeT <= 0) { b.strafeT = 0.5 + R() * 0.9; b.strafe = -b.strafe; b.still = R() < 0.6 ? 0.5 + R() * 0.5 : 0; }
      if (b.still > 0 && p.reload <= 0) { b.still -= dt; cmd.alt = true; }
      else { const k = dist > 9 ? 0.5 : -0.2; cmd.mx = (-dz / dist) * b.strafe + (dx / dist) * k; cmd.mz = (dx / dist) * b.strafe + (dz / dist) * k; }
    }
    // Close in, there is no time to kneel: stop dead for a snap shot.
    if (b.mode !== 'aim' && sees && p.reload <= 0 && !ranging && (dist < 13 || (e.lit > 0.6 && dist < 19))) {
      b.snap += dt;
      if (b.snap > 0.25 && b.snap < 1.5) { cmd.mx *= 0.15; cmd.mz *= 0.15; }
      if (b.snap > 2.4) b.snap = 0;
    } else b.snap = 0;

    // ---- the trigger: only when the wandering laser is actually on the mark ----
    if (p.reload <= 0 && sees && p.roll < 0) {
      const sa = p.shotA, cx = Math.cos(sa), sz = Math.sin(sa), rx = tx - p.x, rz = tz - p.z;
      const along = rx * cx + rz * sz, miss = Math.abs(rx * sz - rz * cx);
      // Far off, a target that is neither kneeling nor lit is a poor bet: it waits for a better one.
      const poor = !ranging && dist > 20 && e.k < 0.5 && e.lit < 0.5 ? clamp(1.3 - (dist - 20) * 0.05 / b.K.range, 0.45, 1) : 1;
      const tol = (ranging ? 0.5 : 0.24 + (1 - skill) * 0.42) * (p.k > 0.8 ? 1 : 0.8) * poor;
      // (across the rug it takes a moment longer to be sure — long enough for them to see the laser and go)
      const ready = b.seen > lerp(0.85, 0.3, skill) * (dist > 16 ? 1.6 : 1) && (p.k > 0.9 ? b.aimT > lerp(0.8, 0.3, skill) : b.snap > 0.35 || dist < 7);
      if (ready && along > 0 && miss < tol && W.cast(p.x, p.z, cx, sz, along) >= along - 0.7) cmd.fire = true;
    }

    // ---- the tools ----
    if (p.rollCd <= 0 && p.roll < 0 && (dodge || (flee && !sudden && R() < dt * 4))) {
      // Tumble sideways off their line, towards whichever side has more room.
      const s = W.onRug(p.x - (dz / dist) * 4.5, p.z + (dx / dist) * 4.5, 1) && !W.inside(p.x - (dz / dist) * 3, p.z + (dx / dist) * 3, 0.5) ? 1 : -1;
      cmd.mx = (-dz / dist) * s * b.strafe; cmd.mz = (dx / dist) * s * b.strafe;
      if (!W.onRug(p.x + cmd.mx * 4.5, p.z + cmd.mz * 4.5, 1)) { cmd.mx = -cmd.mx; cmd.mz = -cmd.mz; }
      cmd.a1 = true; cmd.alt = false;
      if (b.mode === 'aim') { b.mode = 'hide'; pickPost(p, e, b, T); b.wait = 0.4 + R() * 0.5; }
    }
    b.cop -= dt;
    if (p.copCd <= 0 && b.cop <= 0 && T > (b.style === 'push' ? 8 : 12) && e.alive && e.lit < 0.35 && dist > 9 && !sudden) { cmd.a2 = true; b.cop = 4 + R() * 6; }

    // ---- not getting anywhere? go somewhere else ----
    b.stuckT += dt;
    if (b.stuckT > 0.8) {
      const moved = Math.hypot(p.x - b.lastX, p.z - b.lastZ), trying = Math.hypot(cmd.mx, cmd.mz) > 0.5;
      if (trying && moved < 0.35 && b.mode !== 'duel') { b.mode = 'hide'; pickPost(p, e, b, T); b.wait = 0.3; }
      b.lastX = p.x; b.lastZ = p.z; b.stuckT = 0;
    }
    return cmd;
  }

  return { create, think };
}
