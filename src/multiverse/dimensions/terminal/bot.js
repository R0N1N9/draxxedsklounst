// TTY DUEL — the bot. It knows only what a player could: what it can see (line of sight, and the
// 24-column rule for anyone standing still), what is lit (rays, pings, muzzle flashes) and a
// rough bearing for footsteps. Skill scales its reaction, its aim, its lead and its nerve.
//
// PLAN  feel out the map from vantage points that see far and sit beside cover, hold and peek;
//       when blind for a while, ping (and move at once: a ping tells the enemy too); when it has a
//       contact, hold breath for the long shot or strafe for the short one; after a shot, break
//       line of sight to cycle the bolt; sidestep rounds that are on the way; fork when pushed.
import { clamp, angDiff, angLerp, lerp, gauss } from '../../kit.js';
import { R_BODY, SEE_R, W, H } from './world.js';

const BULLET = 100, RELOAD = 1.5;

export function makeBot(ctx, world, S, p) {
  const skill = clamp(ctx.botSkill, 0, 1);
  const cmd = { mx: 0, my: 0, a: p.aim, fire: false, alt: false, a1: false, a2: false };
  const wp = new Float32Array(400);
  let wpN = 0, wpI = 0, t = 0;
  const goal = { x: p.x, y: p.y, kind: '' };
  let holdT = 1 + Math.random() * 2, replanT = 0, stuckT = 0, lastX = p.x, lastY = p.y, lastSeen = -99, err = 0, errT = 0;
  let strafe = 1, strafeT = 0, retreatUntil = 0, dodgeUntil = 0, dodgeX = 0, dodgeY = 0, pingedAt = -99, fireDelay = 0;
  let nextSup = 8 + Math.random() * 6, fooled = null;

  const react = lerp(0.85, 0.15, skill), aimSd = lerp(0.05, 0.005, skill), leadK = lerp(0.25, 0.95, skill);
  const turn = 5 + 14 * skill, dodgeP = skill * 0.85, patience = lerp(11, 5, skill);

  const enemy = () => S.P[1 - p.i];
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

  // ---- picking where to be ----
  function pickSpot(kind, tx, ty, ideal, aggr = 0) {
    let best = null, bs = -1e9;
    const spots = world.spots;
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      const dme = dist(s.x, s.y, p.x, p.y);
      let sc = Math.random() * 5;
      if (kind === 'cover') {
        if (dme > 40 || world.los(s.x, s.y, tx, ty)) continue;
        sc += -dme * 0.6 + (s.wall < 3 ? 4 : 0) - Math.max(0, 28 - dist(s.x, s.y, tx, ty)) * 0.5;
      } else if (kind === 'hunt') {
        const d = dist(s.x, s.y, tx, ty);
        if (d < 12 || d > 70 || !world.los(s.x, s.y, tx, ty)) continue;
        sc += -Math.abs(d - ideal) * 0.5 - dme * 0.25 + (s.wall < 3.2 ? 6 : 0);
      } else {
        // vantage: see far, sit by a wall, lean toward where the enemy is likely to be
        const d = dist(s.x, s.y, tx, ty);
        sc += (1 - aggr) * (s.sight * 0.22 + (s.wall < 3.2 ? 5 : 0)) - Math.abs(d - ideal) * (0.3 + 0.9 * aggr) - dme * 0.1;
      }
      if (sc > bs) { bs = sc; best = s; }
    }
    return best;
  }
  function setGoal(s, kind) {
    if (!s) return false;
    goal.x = s.x; goal.y = s.y; goal.kind = kind;
    return plan();
  }
  function plan() {
    wpN = world.path(p.x, p.y, goal.x, goal.y, wp);
    wpI = 0;
    replanT = 9;
    return wpN > 0;
  }

  // Walk the planned path; returns true while there is still somewhere to go.
  function follow() {
    if (wpI >= wpN) return false;
    // a door shut on the route: think again
    const c = world.cellAt(wp[wpI * 2], wp[wpI * 2 + 1]);
    if (world.occ[c] && !world.grid[c]) { plan(); if (wpI >= wpN) return false; }
    while (wpI < wpN && dist(p.x, p.y, wp[wpI * 2], wp[wpI * 2 + 1]) < 1.05) wpI++;
    if (wpI >= wpN) return false;
    const dx = wp[wpI * 2] - p.x, dy = wp[wpI * 2 + 1] - p.y, d = Math.hypot(dx, dy) || 1;
    cmd.mx = dx / d; cmd.my = dy / d;
    return true;
  }

  // ---- what is coming at me ----
  function incoming() {
    for (const b of S.bullets) {
      if (b.owner === p.i || b.done || b.botSeen === p.i) continue;
      b.botSeen = p.i;
      if (Math.random() > dodgeP) continue;
      const pa = b.path, legs = pa.bounce ? 2 : 1;
      for (let k = 0; k < legs; k++) {
        const ax = k ? pa.x1 : pa.x0, ay = k ? pa.y1 : pa.y0, bx = k ? pa.x2 : pa.x1, by = k ? pa.y2 : pa.y1;
        const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey || 1;
        const q = clamp(((p.x - ax) * ex + (p.y - ay) * ey) / l2, 0, 1);
        const cx = ax + ex * q, cy = ay + ey * q, d = dist(p.x, p.y, cx, cy);
        if (d < 5.5 && q > 0) {
          const l = Math.sqrt(l2), side = ((p.x - cx) * -ey + (p.y - cy) * ex) >= 0 ? 1 : -1;
          dodgeX = (-ey / l) * side; dodgeY = (ex / l) * side;
          dodgeUntil = t + 0.3 + (5.5 - d) * 0.05;
          return;
        }
      }
    }
  }

  // ---- shooting ----
  function lead(tx, ty, vx, vy) {
    const d = dist(p.x, p.y, tx, ty), T = d / BULLET;
    return { x: tx + vx * T * leadK, y: ty + vy * T * leadK };
  }

  function think(dt) {
    t += dt;
    cmd.mx = cmd.my = 0; cmd.fire = cmd.alt = cmd.a1 = cmd.a2 = false;
    const foe = enemy(), k = S.know[p.i];
    if (ctx.phase !== 'live' || !p.alive) { cmd.a = angLerp(p.aim, Math.atan2(foe.y - p.y, foe.x - p.x), 1 - Math.exp(-dt * 4)); return cmd; }

    // a decoy in plain sight is as good as a sniper, to a bot that has not learned better
    let tx = 0, ty = 0, tvx = 0, tvy = 0, contact = false, decoy = false;
    if (k.vis && foe.alive && k.kind === 'seen') { tx = foe.x; ty = foe.y; tvx = foe.vx; tvy = foe.vy; contact = k.seenT > 0; }
    if (!contact) {
      for (const d of S.decoys) {
        if (d.owner === p.i || !d.alive) continue;
        if (world.sees(p.x, p.y, d.x, d.y) && (dist(p.x, p.y, d.x, d.y) <= SEE_R || d.moving) && Math.random() < 0.02 + (1 - skill * 0.6) * 0.1) fooled = d;
      }
      if (fooled && fooled.alive && world.sees(p.x, p.y, fooled.x, fooled.y) && t - lastSeen > 0) { tx = fooled.x; ty = fooled.y; tvx = fooled.dx * 8.5; tvy = fooled.dy * 8.5; contact = true; decoy = true; } else fooled = null;
    }
    if (contact) lastSeen = t;
    incoming();

    errT -= dt;
    if (errT <= 0) { errT = 0.35; err = gauss(Math.random) * aimSd; }
    strafeT -= dt;
    if (strafeT <= 0) { strafeT = 0.6 + Math.random() * 0.9; strafe = Math.random() < 0.5 ? -1 : 1; }

    let moving = true;
    if (contact) {
      // ---------------- engage ----------------
      const d = dist(p.x, p.y, tx, ty);
      const pr = lead(tx, ty, tvx, tvy);
      const want = Math.atan2(pr.y - p.y, pr.x - p.x) + err * (1 + d / 50);
      cmd.a = angLerp(p.aim, want, 1 - Math.exp(-dt * turn));
      const scoped = skill > 0.3 && d > 26 && p.breath > 0.3 && p.winded <= 0 && t > retreatUntil;
      if (t < retreatUntil) {
        // cycling the bolt behind cover
        moving = followRetreat();
      } else if (scoped) {
        cmd.alt = true;
        moving = false; // plant it
      } else {
        // close work: keep moving across the line of fire, edge in when nerve allows
        const px = -(ty - p.y) / (d || 1), py = (tx - p.x) / (d || 1);
        const adv = d > 18 ? 0.45 : d < 9 ? -0.3 : 0;
        const ax = (tx - p.x) / (d || 1), ay = (ty - p.y) / (d || 1);
        cmd.mx = px * strafe + ax * adv; cmd.my = py * strafe + ay * adv;
        if (!world.free(p.x + cmd.mx * 2.2, p.y + cmd.my * 2.2, R_BODY + 0.1)) strafe = -strafe;
      }
      // the opening is a feeling-out: nobody pulls the trigger in the first few seconds unless it is close
      const need = (k.seenT || (decoy ? 1 : 0)) >= react * (0.6 + d / 90) + fireDelay && (ctx.time > 6 + 3 * (1 - skill) || d < 12);
      const tol = d < 16 ? 1.5 : lerp(1.2, 0.8, skill);
      const off = Math.abs(angDiff(p.a, Math.atan2(pr.y - p.y, pr.x - p.x))) * d;
      const steady = !cmd.alt || p.sway < 0.012;
      if (need && p.reload <= 0 && off < tol && steady && t > retreatUntil) {
        cmd.fire = true;
        retreatUntil = t + RELOAD + 0.35;
        fireDelay = Math.random() * 0.25 * (1 - skill);
        if (decoy) fooled = null;
        // then get out of sight of where it was fired at
        const cv = pickSpot('cover', tx, ty);
        if (cv) { goal.arrived = false; setGoal(cv, 'cover'); }
      }
      // forking: when a duel is on and a decoy would help
      if (!decoy && p.forkCd <= 0 && Math.random() < dt * (0.15 + skill * 0.5) && d > 14) cmd.a2 = true;
    } else {
      // ---------------- blind ----------------
      fooled = null;
      const known = k.t > -90, since = S.t - k.t; // seconds since I last knew anything at all
      const fresh = known && since < 6;
      holdT -= dt;
      replanT -= dt;
      const aggr = clamp((ctx.time - 6) / 18, 0, 1);
      const fs = world.spawns[1 - p.i], hot = known && since < 30;
      const zx = lerp(W / 2, hot ? k.x : fs.x, 0.3 + 0.7 * aggr), zy = lerp(H / 2, hot ? k.y : fs.y, 0.3 + 0.7 * aggr);
      const kind = fresh ? 'hunt' : 'explore';
      let walking = false;
      if (t < retreatUntil && wpI < wpN) walking = follow();
      else if (wpI < wpN && goal.kind === kind && replanT > 0) {
        walking = follow();
        if (!walking) { goal.arrived = true; holdT = 0.8 + Math.random() * (2.2 - skill * 1.2); }
      }
      if (walking) {
        moving = true;
        if (wpI < wpN) cmd.a = angLerp(p.aim, Math.atan2(wp[wpI * 2 + 1] - p.y, wp[wpI * 2] - p.x), 1 - Math.exp(-dt * 6));
      } else if (goal.arrived && goal.kind === kind && holdT > 0) {
        // holding a vantage: eyes on where the enemy was (or the way ahead), a slow sweep
        moving = false;
        const ax = fresh ? k.x : zx, ay = fresh ? k.y : zy;
        cmd.a = angLerp(p.aim, Math.atan2(ay - p.y, ax - p.x) + Math.sin(t * 0.9) * 0.12, 1 - Math.exp(-dt * 3));
      } else {
        let spot = null;
        if (kind === 'hunt') spot = pickSpot('hunt', k.x, k.y, lerp(40, 16, aggr * (1 - skill * 0.4)));
        if (!spot) spot = pickSpot('explore', zx, zy, lerp(46, 10, aggr), aggr);
        goal.arrived = false;
        goal.kind = kind;
        if (spot) { goal.x = spot.x; goal.y = spot.y; plan(); replanT = 9; } else { wpN = wpI = 0; holdT = 0.5; goal.arrived = true; }
      }
      // blind for too long: ping, then do not stay where the ping found me
      if (t - Math.max(lastSeen, pingedAt) > patience && p.pingCd <= 0 && ctx.time > patience) {
        cmd.a1 = true;
        pingedAt = t;
        retreatUntil = t;
        goal.kind = '';
      }
      // a suppressing round down the last known line keeps a hider honest (and gives me away)
      if (known && since < 3 && t > nextSup && p.reload <= 0 && skill > 0.4 && world.los(p.x, p.y, k.x, k.y) && dist(p.x, p.y, k.x, k.y) < 60) {
        nextSup = t + 7 + Math.random() * 5;
        if (Math.abs(angDiff(p.a, Math.atan2(k.y - p.y, k.x - p.x))) * dist(p.x, p.y, k.x, k.y) < 2) { cmd.fire = true; retreatUntil = t + RELOAD; }
      }
    }

    // ---- locomotion: dodge overrides, stuck detection, and a bot never stands in a shut door ----
    if (t < dodgeUntil) { cmd.mx = dodgeX; cmd.my = dodgeY; }
    else if (!moving && !cmd.alt) { cmd.mx = cmd.my = 0; }
    if (cmd.alt) { cmd.mx *= 0.2; cmd.my *= 0.2; }
    const moved = dist(p.x, p.y, lastX, lastY);
    if (Math.hypot(cmd.mx, cmd.my) > 0.3 && moved < 0.25 * dt * 13) stuckT += dt; else stuckT = Math.max(0, stuckT - dt);
    lastX = p.x; lastY = p.y;
    if (stuckT > 0.9) { stuckT = 0; goal.kind = ''; holdT = 0; wpN = wpI = 0; strafe = -strafe; }
    return cmd;
  }

  function followRetreat() {
    if (wpI < wpN) return follow();
    return false;
  }

  return { think, skill, goal };
}
