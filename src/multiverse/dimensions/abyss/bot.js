// THE DEEP — the bot. It believes only what a diver could know: what it can see through
// the water (range, rock, kelp, ink and the kraken all get in the way), the bubbles a
// diver breathes out (they rise above any cover and give a position away at range), the
// bubble trail of a spear back to whoever fired it, and a sonar ping. A decoy fools it at
// range like it fools you; its own sonar shows it the truth.
//
// Its plan: open from the spawn, scanning; ping when it knows nothing; work from post to
// post (preferring cover) towards where it last had you, holding a range that shrinks as
// the round goes on; when it sees you, stop, hold its breath for the long shot, lead you,
// hold over for the drop, and fire once the aim has settled; then move while it reloads.
// It kicks out of the way of a spear it sees coming. Skill scales notice time, settle
// time, aim and lead error, patience and how often it uses its tools.
import { clamp, lerp, angDiff, gauss } from '../../kit.js';
import { rayWorld, kelpAlong, heightAt, ARENA } from './world.js';

export function makeBot(ctx, W, G) {
  const skill = clamp(ctx.botSkill, 0, 1);
  const tmp = { x: 0, y: 0, z: 0 };

  function create(p) {
    return {
      p, know: null, // { x, y, z, vx, vy, vz, t (when), seen (bool), decoy }
      seenT: 0, settle: 0, notice: 0, err: { y: 0, p: 0 }, post: null, replan: 1 + Math.random() * 2,
      opening: 2 + Math.random() * 3 * (1 - skill), lastSeen: -99, dodge: 0, dodgeX: 0, dodgeY: 0, dodgeZ: 0, hold: false,
      wantDecoy: 0, strafe: Math.random() < 0.5 ? -1 : 1, strafeT: 2, prevEx: 0, prevEy: 0, prevEz: 0, estV: [0, 0, 0],
    };
  }

  // Can p see the point (x,y,z)? Returns the visibility 0..1.
  function sight(p, x, y, z, glow) {
    const ex = G.eye(p, tmp);
    const ax = ex.x, ay = ex.y, az = ex.z;
    const dx = x - ax, dy = y - ay, dz = z - az, d = Math.hypot(dx, dy, dz);
    if (d < 0.5) return 1;
    const range = G.sightRange() * (glow ? 1.25 : 1);
    if (d > range) return 0;
    if (rayWorld(W, ax, ay, az, dx / d, dy / d, dz / d, d - 0.6) < d - 0.7) return 0;
    if (G.krakenBlocks(ax, ay, az, x, y, z)) return 0;
    const kelp = kelpAlong(W, ax, ay, az, x, y, z), ink = G.inkAlong(ax, ay, az, x, y, z);
    const v = (1 - d / range) * 1.6 - kelp - ink * 2;
    return clamp(v, 0, 1);
  }

  function setKnow(b, x, y, z, vx, vy, vz, seen, decoy) {
    b.know ||= { x, y, z, vx: 0, vy: 0, vz: 0, t: 0, seen: false, decoy: -1 };
    const k = b.know;
    k.x = x; k.y = y; k.z = z; k.vx = vx; k.vy = vy; k.vz = vz; k.t = G.time(); k.seen = seen; k.decoy = decoy;
  }

  function perceive(b, e, dt) {
    const p = b.p, T = G.time();
    let saw = false;
    if (e.alive) {
      // sonar: the truth, wherever it is
      if (G.revealed(e)) { setKnow(b, e.x, e.y, e.z, e.vx, e.vy, e.vz, true, -1); saw = true; }
      const v = sight(p, e.x, e.y + 0.1, e.z, true);
      if (v > 0.12) {
        b.seenT += dt * (0.5 + v);
        if (b.seenT > b.notice) { setKnow(b, e.x, e.y, e.z, e.vx, e.vy, e.vz, true, -1); saw = true; }
      } else b.seenT = Math.max(0, b.seenT - dt * 2);
      // bubbles (and a spear's trail) give a rough fix from a long way off
      const tell = G.tellOf(e);
      if (!saw && tell && T - tell.t < 0.6 && Math.hypot(tell.x - p.x, tell.z - p.z) < 75) {
        const n = 3.5 * (1 - skill * 0.6);
        setKnow(b, tell.x + gauss(Math.random) * n, tell.y + gauss(Math.random) * n * 0.5, tell.z + gauss(Math.random) * n, 0, 0, 0, false, -1);
      }
    }
    // decoys: a glow and a stream of bubbles, at range indistinguishable from a diver
    for (const d of G.decoys()) {
      if (!d.alive || d.owner === p.i) continue;
      const dist = Math.hypot(d.x - p.x, d.y - p.y, d.z - p.z);
      if (dist < 16 + skill * 8 || (b.know && b.know.seen && b.know.decoy < 0 && T - b.know.t < 1)) continue;
      if (sight(p, d.x, d.y, d.z, true) > 0.15 && (!b.know || T - b.know.t > 0.8)) setKnow(b, d.x, d.y, d.z, d.vx, d.vy, d.vz, true, d.slot);
    }
    if (saw) b.lastSeen = T;
  }

  // Aim at a point moving with velocity v: lead and hold over for the spear's drag and drop.
  function solve(p, x, y, z, vx, vy, vz, out) {
    const e = G.eye(p, tmp);
    let ax = x, ay = y, az = z, t = 0;
    const k = G.DRAG, V = G.V0, g = G.GRAV;
    for (let it = 0; it < 3; it++) {
      const d = Math.hypot(ax - e.x, ay - e.y, az - e.z);
      const f = Math.min(0.95, (d * k) / V);
      t = -Math.log(1 - f) / k;
      const lead = lerp(0.35, 1, skill);
      ax = x + vx * t * lead; az = z + vz * t * lead;
      const drop = (g / k) * t - (g / (k * k)) * (1 - Math.exp(-k * t));
      ay = y + vy * t * lead + drop * lerp(0.75, 1, skill);
    }
    const dx = ax - e.x, dy = ay - e.y, dz = az - e.z;
    out.yaw = Math.atan2(-dx, -dz);
    out.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    out.t = t;
    return out;
  }
  const sol = { yaw: 0, pitch: 0, t: 0 };

  function pickPost(b, tx, ty, tz) {
    const p = b.p, T = G.time();
    const want = lerp(40, 14, clamp(T / 40, 0, 1)) - skill * 4;
    let best = null, bestS = -1e9;
    for (const q of W.posts) {
      const dMe = Math.hypot(q.x - p.x, q.z - p.z);
      if (dMe > 26 || dMe < 4) continue;
      const dT = Math.hypot(q.x - tx, q.y - ty, q.z - tz);
      const s = -Math.abs(dT - want) * 1.1 + q.cover * (1.2 + skill) - dMe * 0.15 + Math.random() * 4 + (G.inCage(q.x, q.z) ? 0 : -60);
      if (s > bestS) { bestS = s; best = q; }
    }
    return best;
  }

  function think(p, e, dt, cmd) {
    const b = p.bot, T = G.time();
    cmd.fire = cmd.a1 = cmd.a2 = cmd.jump = false;
    cmd.wish = cmd.wish || { x: 0, y: 0, z: 0 };
    b.notice = lerp(1.0, 0.3, skill);
    perceive(b, e, dt);
    const k = b.know, fresh = k && T - k.t < 1.2 && k.seen;
    // the opening: hold near the spawn and look down the reef
    let tx = -p.x * 0, ty = p.y, tz = -p.z;
    if (k) { tx = k.x; ty = k.y; tz = k.z; }
    // sonar when it knows nothing for long enough
    if (p.pingCd <= 0 && (!k || T - k.t > lerp(9, 4, skill)) && T > b.opening * 0.5 && Math.random() < dt * (0.4 + skill)) cmd.a1 = true;
    // a decoy when it is about to cross open water, now and then
    if (p.decoyCd <= 0 && T > 6 && Math.random() < dt * 0.05 * (0.3 + skill)) cmd.a2 = true;

    // dodge: a spear it can see heading its way
    const threat = G.incoming(p);
    if (threat && b.dodge <= 0 && Math.random() < 0.4 + skill * 0.5) {
      b.dodge = 0.7;
      // across the spear's line, and up
      const sx = threat.vz, sz = -threat.vx, sl = Math.hypot(sx, sz) || 1, side = Math.random() < 0.5 ? -1 : 1;
      b.dodgeX = (sx / sl) * side; b.dodgeZ = (sz / sl) * side; b.dodgeY = 0.4;
      cmd.jump = skill > 0.4;
    }
    b.dodge -= dt;

    // move
    b.replan -= dt;
    if (!b.post || b.replan <= 0 || Math.hypot(b.post.x - p.x, b.post.y - p.y, b.post.z - p.z) < 2) {
      b.replan = lerp(6, 3, skill) + Math.random() * 2;
      if (T > b.opening) b.post = pickPost(b, tx, ty, tz);
    }
    let wx = 0, wy = 0, wz = 0;
    const engaging = fresh && e.alive && (k.decoy < 0 ? true : true);
    if (b.dodge > 0) { wx = b.dodgeX; wy = b.dodgeY; wz = b.dodgeZ; }
    else if (b.post && !(engaging && b.settle > 0.15)) {
      wx = b.post.x - p.x; wy = b.post.y - p.y; wz = b.post.z - p.z;
      const l = Math.hypot(wx, wy, wz) || 1;
      wx /= l; wy /= l; wz /= l;
      // over obstacles rather than into them
      const ex = G.eye(p, tmp);
      if (rayWorld(W, ex.x, ex.y, ex.z, wx, wy, wz, 4) < 3.5) wy += 0.9;
      if (heightAt(p.x + wx * 2, p.z + wz * 2) > p.y - 1.6) wy += 0.7;
    } else if (engaging) {
      // side-step while reloading
      b.strafeT -= dt;
      if (b.strafeT <= 0) { b.strafeT = 1.2 + Math.random() * 2; b.strafe *= -1; }
      const dx = tx - p.x, dz = tz - p.z, l = Math.hypot(dx, dz) || 1;
      const k2 = p.loaded ? 0.15 : 0.7;
      wx = (dz / l) * b.strafe * k2; wz = (-dx / l) * b.strafe * k2;
    }
    // stay out of the kraken's arms
    const kp = G.krakenNear(p);
    if (kp) { wx += kp.x * 1.5; wy += kp.y * 1.5; wz += kp.z * 1.5; }
    if (!G.inCage(p.x, p.z)) { wx -= (p.x - G.CAGE.x) * 0.2; wz -= (p.z - G.CAGE.z) * 0.2; }
    if (p.y < ARENA.y0 + 3) wy += 0.6;
    cmd.wish.x = wx; cmd.wish.y = wy; cmd.wish.z = wz;

    // aim
    let wantYaw, wantPitch;
    if (fresh && e.alive) {
      const vx = k.decoy >= 0 ? k.vx : e.vx, vy = k.decoy >= 0 ? k.vy : e.vy, vz = k.decoy >= 0 ? k.vz : e.vz; // (it reads your motion while it sees you)
      solve(p, k.x, k.y + 0.05, k.z, vx, vy, vz, sol);
      wantYaw = sol.yaw + b.err.y; wantPitch = sol.pitch + b.err.p;
      b.settle += dt;
    } else {
      // look where it expects you
      const ex = G.eye(p, tmp), dx = tx - ex.x, dy = ty - ex.y, dz = tz - ex.z;
      wantYaw = Math.atan2(-dx, -dz) + Math.sin(T * 0.6 + p.i) * 0.25;
      wantPitch = Math.atan2(dy, Math.hypot(dx, dz)) * 0.8;
      b.settle = 0;
      b.err.y = gauss(Math.random) * lerp(0.05, 0.012, skill);
      b.err.p = gauss(Math.random) * lerp(0.03, 0.008, skill);
    }
    const turn = 1 - Math.exp(-dt * lerp(3, 8, skill));
    cmd.yaw = p.yaw + angDiff(p.yaw, wantYaw) * turn;
    cmd.pitch = clamp(p.pitch + (wantPitch - p.pitch) * turn, -1.3, 1.3);
    // the error closes as it holds steady on you
    b.err.y *= Math.exp(-dt * lerp(0.6, 1.8, skill));
    b.err.p *= Math.exp(-dt * lerp(0.6, 1.8, skill));
    // breath: hold it for anything but a close shot
    const dist = k ? Math.hypot(k.x - p.x, k.y - p.y, k.z - p.z) : 99;
    const wantHold = fresh && p.loaded && dist > 14 && p.air > 0.2 && b.settle > 0.2;
    cmd.alt = wantHold;
    // fire when the aim has settled on the solution
    const settled = Math.abs(angDiff(cmd.yaw, wantYaw)) < 0.01 + 0.004 * (1 - skill) && Math.abs(cmd.pitch - wantPitch) < 0.012;
    const patience = lerp(0.9, 0.45, skill) + (dist > 30 ? lerp(0.6, 0.2, skill) : 0) + (T < 8 ? 0.3 : 0);
    if (fresh && p.loaded && settled && b.settle > patience && (p.holding || dist < 16 || p.air < 0.2)) {
      cmd.fire = true;
      b.settle = 0;
      b.err.y = gauss(Math.random) * lerp(0.035, 0.008, skill);
      b.err.p = gauss(Math.random) * lerp(0.025, 0.006, skill);
      b.replan = Math.min(b.replan, 0.5);
    }
    cmd.mx = 0; cmd.my = 0;
    return cmd;
  }

  return { create, think };
}
