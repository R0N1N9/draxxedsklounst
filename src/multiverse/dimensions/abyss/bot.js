// THE DEEP — the bot. It believes only what a diver could know: what it can see through
// the water (range, rock, kelp, ink and the kraken all get in the way), the bubbles a
// diver breathes out (they rise above any cover and give a position away at range), the
// bubble trail of a spear back to whoever fired it, and a sonar ping. A decoy fools it at
// range like it fools you; its own sonar shows it the truth.
//
// It fights the way a spearfisher would hunt: from range. Each round it has a temperament
// (a patient sniper who holds 45-55 m, or a stalker who works in to 25-30 m through the
// kelp, the arches and the wreck), and the range it is happy with shrinks only slowly as
// the round wears on. It opens by taking cover, holds a post with a sightline, holds its
// breath, leads and holds over, fires — and then moves while it reloads, because its spear
// just drew a line of bubbles back to it. It does not swim into your mask: under ~14 m it
// backs off unless sudden death has closed the ring. Skill scales notice time, aim error,
// lead, patience and how often it uses its tools.
import { clamp, lerp, angDiff, gauss } from '../../kit.js';
import { rayWorld, kelpAlong, heightAt, ARENA, SPAWN } from './world.js';

export function makeBot(ctx, W, G) {
  const skill = clamp(ctx.botSkill, 0, 1);
  const tmp = { x: 0, y: 0, z: 0 };

  function create(p) {
    return {
      p, know: null, // { x, y, z, vx, vy, vz, t (when), seen (bool), decoy }
      seenT: 0, settle: 0, notice: 0, err: { y: 0, p: 0 }, post: null, replan: 0,
      // temperament: 0 sniper .. 1 stalker, and when it allows itself the first shot
      style: Math.random(), firstShot: 4 + Math.random() * 2.5, jitter: 1,
      lastSeen: -99, lastLos: -99, postT: 0, dodge: 0, dodgeX: 0, dodgeY: 0, dodgeZ: 0,
      // the opening: dive for cover before anything else
      moveT: 1.2 + Math.random() * 2, firedAt: { x: 0, y: 0, z: 0 }, drift: Math.random() * 6.28,
      resid: { y: gauss(Math.random) * lerp(0.02, 0.0065, skill), p: gauss(Math.random) * lerp(0.0135, 0.0045, skill) },
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
  // a clear line between two points through rock and kelp (for choosing a post)
  function clearLine(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz) || 1;
    if (rayWorld(W, ax, ay, az, dx / d, dy / d, dz / d, d - 1) < d - 1.1) return false;
    return kelpAlong(W, ax, ay, az, bx, by, bz) < 0.5;
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
        b.lastLos = T;
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
      const lead = lerp(0.6, 1, skill);
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

  // The range this diver wants to fight at: its temperament, closing slowly as the round
  // goes on; in sudden death the ring decides.
  function wantRange(b, T) {
    if (ctx.sudden) return 9;
    // a hunt that has gone cold makes it bolder, and so does the clock: past the middle of
    // the round everyone is closing in
    const cold = clamp((T - Math.max(b.lastSeen, 0) - 8) / 12, 0, 1);
    const late = clamp((T - 22) / 12, 0, 1);
    return Math.max(16, lerp(52, 30, b.style) - clamp(T / 50, 0, 1) * 20 - skill * 3 - cold * 12 - late * 14);
  }

  // A post to hold or move to. `sightline`: it wants to see (tx,ty,tz) from there (sniping);
  // otherwise it wants to get there unseen (stalking, or moving off after a shot).
  function pickPost(b, tx, ty, tz, want, sightline, opening) {
    const p = b.p, f = b.firedAt, moving = b.moveT > 0;
    let best = null, bestS = -1e9;
    const cand = [];
    for (const q of W.posts) {
      const dMe = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
      if (dMe > 24 || dMe < 3.5) continue;
      const dT = Math.hypot(q.x - tx, q.y - ty, q.z - tz);
      let s = -Math.abs(dT - want) * 0.9 + q.cover * (sightline ? 0.3 + skill * 0.2 : opening ? 0.5 : 1.4 + skill) - dMe * 0.12 + Math.random() * 3;
      if (dT < 13 && !ctx.sudden) s -= (13 - dT) * 4; // never swim into their mask
      // a sniper's water is the open blue over the drop-off, not the depths of the kelp
      if (sightline) s += q.x > -4 ? 4 : -0.3 * Math.max(0, -8 - q.x);
      if (!G.inCage(q.x, q.z)) s -= 60;
      if (moving) s -= Math.max(0, 7 - Math.hypot(q.x - f.x, q.y - f.y, q.z - f.z)) * 2.5; // off the line its spear drew
      cand.push(q, s);
    }
    // the best few, judged on what they can see
    for (let n = 0; n < 8 && cand.length; n++) {
      let bi = -1;
      for (let i = 1; i < cand.length; i += 2) if (bi < 0 || cand[i] > cand[bi]) bi = i;
      const q = cand[bi - 1];
      let s = cand[bi];
      cand.splice(bi - 1, 2);
      const see = clearLine(q.x, q.y + 0.3, q.z, tx, ty, tz);
      if (sightline) s += see ? 14 : -6;
      else s += see ? -3 : 2;
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
    // where it thinks you are: what it knows, or your spawn
    const home = SPAWN[1 - p.i];
    const tx = k ? k.x : home.x, ty = k ? k.y : home.y, tz = k ? k.z : home.z;
    const dist = Math.hypot(tx - p.x, ty - p.y, tz - p.z);
    const want = wantRange(b, T);
    // sonar when it knows nothing for long enough
    // (bubbles say roughly where; it wants to know exactly)
    if (p.pingCd <= 0 && T - Math.max(b.lastSeen, 0) > (T > 25 ? 2.5 : lerp(11, 5, skill)) && T > 3 && Math.random() < dt * (0.4 + skill)) cmd.a1 = true;
    // a decoy before it moves off, now and then
    if (p.decoyCd <= 0 && T > 6 && b.moveT > 0 && Math.random() < dt * 0.5 * (0.3 + skill)) cmd.a2 = true;

    // dodge: a spear it can see heading its way
    const threat = G.incoming(p);
    if (threat && b.dodge <= -0.6 && Math.random() < dt * (0.5 + skill * 2)) {
      b.dodge = 0.7;
      // across the spear's line, and up
      const sx = threat.vz, sz = -threat.vx, sl = Math.hypot(sx, sz) || 1, side = Math.random() < 0.5 ? -1 : 1;
      b.dodgeX = (sx / sl) * side; b.dodgeZ = (sz / sl) * side; b.dodgeY = 0.4;
      cmd.jump = skill > 0.4;
      b.replan = Math.min(b.replan, 0.8);
    }
    b.dodge -= dt;
    b.moveT -= dt;

    // what to do: engage what it sees at a range it likes, or move (to a post with a
    // sightline, closing through cover, or off the line of its last shot)
    const tooClose = fresh && dist < 14 && !ctx.sudden;
    // (a sonar contact behind rock is a reason to move, not to shoot)
    const engage = fresh && e.alive && b.moveT <= 0 && !tooClose && T - b.lastLos < 0.6;
    b.replan -= dt;
    // a post it has held for a while without a sight of you is the wrong post
    const blind = T - b.lastLos > 5 && T - b.postT > 3.5 && b.post && Math.hypot(b.post.x - p.x, b.post.y - p.y, b.post.z - p.z) < 2.5;
    if (!b.post || b.replan <= 0 || blind) {
      b.replan = lerp(6, 3.5, skill) + Math.random() * 2;
      b.postT = T;
      // it holds a sightline when the range is right (or it is a sniper and has waited);
      // otherwise it works in through cover
      // the opening: cover near its own end of the reef, the duel starts from there
      const opening = T < b.firstShot - 1.5;
      const sightline = !opening && (dist < want + 12 || (b.style < 0.5 && T > 12) || T - b.lastLos > 8 || T > 28);
      b.post = pickPost(b, tx, ty, tz, opening ? 56 : tooClose ? want + 6 : want, sightline, opening);
    }
    let wx = 0, wy = 0, wz = 0;
    if (b.dodge > 0) { wx = b.dodgeX; wy = b.dodgeY; wz = b.dodgeZ; }
    else if (b.post && !(engage && b.settle > 0.15)) {
      wx = b.post.x - p.x; wy = b.post.y - p.y; wz = b.post.z - p.z;
      const l = Math.hypot(wx, wy, wz) || 1;
      // ease in at the post: hover, do not overshoot
      const sp = clamp(l / 3, 0.25, 1);
      wx = (wx / l) * sp; wy = (wy / l) * sp; wz = (wz / l) * sp;
      // over obstacles rather than into them
      const ex = G.eye(p, tmp);
      if (rayWorld(W, ex.x, ex.y, ex.z, wx, wy, wz, 4) < 3.5) wy += 0.9;
      if (heightAt(p.x + wx * 2, p.z + wz * 2) > p.y - 1.6) wy += 0.7;
    } else if (engage) {
      // holding a post: a slow drift so it is never a still target, more while reloading
      b.drift += dt * 0.7;
      const dx = tx - p.x, dz = tz - p.z, l = Math.hypot(dx, dz) || 1;
      const k2 = (p.loaded ? 0.12 : 0.45) * Math.sin(b.drift);
      wx = (dz / l) * k2; wz = (-dx / l) * k2; wy = 0.12 * Math.cos(b.drift * 0.7);
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
      wantYaw = sol.yaw + b.err.y + b.resid.y; wantPitch = sol.pitch + b.err.p + b.resid.p;
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
    // the error closes as it holds steady on you — but never quite to nothing
    b.err.y *= Math.exp(-dt * lerp(0.9, 2.2, skill));
    b.err.p *= Math.exp(-dt * lerp(0.9, 2.2, skill));
    // breath: hold it for anything but a close shot
    const wantHold = fresh && engage && p.loaded && dist > 14 && p.air > 0.2 && b.settle > 0.2;
    cmd.alt = wantHold;
    // fire when the aim has settled on the solution
    const settled = Math.abs(angDiff(cmd.yaw, wantYaw)) < 0.01 + 0.004 * (1 - skill) && Math.abs(cmd.pitch - wantPitch) < 0.012;
    const patience = (lerp(0.65, 0.35, skill) + (dist > 30 ? lerp(0.6, 0.2, skill) : 0) + (dist > 45 ? lerp(1.2, 0.5, skill) : 0)) * b.jitter;
    const close = fresh && dist < 14 && T - b.lastLos < 0.6; // up close it shoots from the hip
    if (fresh && p.loaded && settled && T > b.firstShot && ((engage && b.settle > patience && (p.holding || p.air < 0.2)) || (close && b.settle > patience * 0.6))) {
      cmd.fire = true;
      b.settle = 0;
      b.jitter = 0.75 + Math.random() * 0.7;
      b.err.y = gauss(Math.random) * lerp(0.035, 0.008, skill);
      b.err.p = gauss(Math.random) * lerp(0.025, 0.006, skill);
      // its hands are never perfectly still: a little error that the wait does not remove
      b.resid.y = gauss(Math.random) * lerp(0.02, 0.0065, skill);
      b.resid.p = gauss(Math.random) * lerp(0.0135, 0.0045, skill);
      // and then it moves: its spear just drew a line of bubbles back to it
      if (Math.random() < lerp(0.5, 0.85, skill) || dist < 22) {
        b.moveT = lerp(1.4, 2.4, Math.random());
        b.firedAt.x = p.x; b.firedAt.y = p.y; b.firedAt.z = p.z;
        b.replan = 0;
      }
    }
    cmd.mx = 0; cmd.my = 0;
    return cmd;
  }

  return { create, think };
}
