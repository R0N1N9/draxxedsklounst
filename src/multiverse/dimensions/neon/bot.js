// The lattice hunter: one brain for the opponent and, on autopilot, for the local sniper.
// It believes only what a player could know: what it has a clear line to, the tiles a
// runner lights, muzzle flashes, lasers, and the four-bar pulse. Reaction time, aim error
// and hesitation all shrink with ctx.botSkill; its nerve (range it likes to fight at) is
// rolled per round, and rises with the clock so that duels close.
import { clamp, lerp, angDiff, angDamp, gauss, dist } from '../../kit.js';
import { W, R, MID, RAIL_SPEED } from './world.js';
import { pointSeg } from './geom.js';

const LEASH = 560, LEASH_T = 5; // how deep a bot may go in the opening, and for how long

export function makeBot(ctx, world, S, self) {
  const skill = clamp(ctx.botSkill, 0, 1);
  const foe = S.P[1 - self.i];
  const solids = world.solids;
  const cmd = { mx: 0, my: 0, a: self.aim, fire: false, alt: false, a1: false, a2: false, da: undefined };
  const react = (0.16 + 0.5 * (1 - skill)) * (0.8 + Math.random() * 0.5); // no two snipers are equally quick
  const nerve = Math.random() * 0.55;
  // Everyone knows where the other spawn is.
  const bel = { x: foe.x, y: foe.y, age: 0, on: true };
  const path = [];
  const fooled = new Map(); // decoy id → did we fall for it
  let pathN = 0, pathI = 0, repath = 0, hasGoal = false, gx = 0, gy = 0, goalBx = 0, goalBy = 0, goalAge = 0;
  let mode = 'seek', modeT = 0; // seek | bank | cover
  let seen = 0, err = 0, errT = 0, hes = Math.random() * 0.3, sighting = false, duel = true, lostT = 0;
  let strafe = Math.random() < 0.5 ? 1 : -1, strafeT = 0;
  let bankA = 0, bankT = 1.5 + Math.random() * 2;
  let painted = 0, dodgeT = 0, dodgeX = 0, dodgeY = 0, laserT = 0;
  let stuck = 0, wait = 0, holdFocus = false, patrolI = -1;
  let decoyT = 3 + Math.random() * 5, blinkT = 3 + Math.random() * 3;
  const patience = 3.5 + Math.random() * 2.5; // nobody duels at range before they have found their feet

  const aggression = () => clamp(nerve * 0.6 + ctx.time / 45, 0, 1);
  // The opening is a long-range affair: for the first seconds nobody leaves their own third
  // (so nobody is rushed while still reading the room), then the leash pays out until the
  // whole floor is fair game.
  const reach = () => (ctx.time < LEASH_T ? LEASH : LEASH + (ctx.time - LEASH_T) * 130);
  const depthOf = (x) => (self.i ? W - x : x);

  function setGoal(x, y) {
    gx = x;
    gy = y;
    pathN = world.findPath(self.x, self.y, x, y, path);
    pathI = 0;
    repath = 1 + Math.random();
    hasGoal = pathN > 0;
    goalBx = bel.x;
    goalBy = bel.y;
    goalAge = 0;
  }

  // Steer for the farthest waypoint we can walk straight to. False once there (or lost).
  function follow(dt) {
    if (!hasGoal) return false;
    repath -= dt;
    if (repath <= 0) setGoal(gx, gy);
    if (!hasGoal) return false;
    let i = Math.min(pathI, pathN - 1);
    while (i + 1 < pathN && world.walk(self.x, self.y, path[(i + 1) * 2], path[(i + 1) * 2 + 1])) i++;
    pathI = i;
    const dx = path[i * 2] - self.x, dy = path[i * 2 + 1] - self.y, d = Math.hypot(dx, dy);
    if (d < 12) {
      if (i >= pathN - 1) { hasGoal = false; return false; }
      pathI = i + 1;
      return true;
    }
    cmd.mx = dx / d;
    cmd.my = dy / d;
    return true;
  }

  // A spot with a clear line to where we think they are, at the range our nerve likes.
  function pickPeek() {
    const cells = world.freeCells, pref = lerp(780, 300, aggression()), early = clamp(1 - ctx.time / 12, 0, 1), lim = reach();
    let best = -1, bs = Infinity, lane = -1, ls = Infinity;
    for (let k = 0; k < 40; k++) {
      const c = cells[(Math.random() * cells.length) | 0];
      const x = world.cellX(c), y = world.cellY(c);
      if (depthOf(x) > lim) continue;
      const far = dist(x, y, self.x, self.y);
      if (!solids.los(x, y, bel.x, bel.y)) {
        // No line to them from here. A long look down a lane is the next best thing.
        if (best < 0 && solids.los(x, y, W - x, y)) {
          const s = far + Math.random() * 160;
          if (s < ls) { ls = s; lane = c; }
        }
        continue;
      }
      // Early on, set up on our own side.
      const depth = Math.max(0, depthOf(x) - LEASH) * 1.5 * early;
      const s = Math.abs(dist(x, y, bel.x, bel.y) - pref) + far * 0.7 + depth + Math.random() * 60;
      if (s < bs) { bs = s; best = c; }
    }
    if (best < 0) best = lane;
    if (best >= 0) setGoal(world.cellX(best), world.cellY(best));
    else setGoal(self.i ? Math.max(bel.x, W - lim) : Math.min(bel.x, lim), bel.y);
  }

  // Somewhere close that they cannot see.
  function pickCover() {
    const cells = world.freeCells;
    let best = -1, bs = Infinity;
    for (let k = 0; k < 30; k++) {
      const c = cells[(Math.random() * cells.length) | 0];
      const x = world.cellX(c), y = world.cellY(c), d = dist(x, y, self.x, self.y);
      if (d < 90 || d > 480 || depthOf(x) > reach() + 50 || solids.los(x, y, bel.x, bel.y)) continue;
      const s = d + Math.random() * 90;
      if (s < bs) { bs = s; best = c; }
    }
    if (best >= 0) setGoal(world.cellX(best), world.cellY(best));
    else hasGoal = false;
  }

  // No idea where they are: sweep the lanes, leaning toward their side of the arena.
  function patrolNext() {
    const pts = world.patrol;
    if (!pts.length) return;
    const lim = reach() + 30;
    let best = 0, bs = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      if (i === patrolI || depthOf(pts[i].x) > lim) continue;
      const toward = self.i === 0 ? pts[i].x : W - pts[i].x;
      const s = toward * 0.4 * aggression() + Math.random() * 500 - dist(pts[i].x, pts[i].y, self.x, self.y) * 0.25;
      if (s > bs) { bs = s; best = i; }
    }
    patrolI = best;
    setGoal(pts[best].x, pts[best].y);
  }

  const beamDist = (l) => {
    const d = pointSeg(self.x, self.y, l.x0, l.y0, l.x1, l.y1);
    return l.n === 3 ? Math.min(d, pointSeg(self.x, self.y, l.x1, l.y1, l.x2, l.y2)) : d;
  };

  function lookAt(x, y, rate, dt) {
    cmd.a = angDamp(self.aim, Math.atan2(y - self.y, x - self.x), rate, dt);
  }

  function engage(tgt, dt) {
    bel.x = tgt.x;
    bel.y = tgt.y;
    bel.age = 0;
    bel.on = true;
    if (!sighting) {
      // A fresh sighting: stand and duel, or duck back and come at them from another angle?
      sighting = true;
      duel = ctx.time > patience && Math.random() < 0.25 + 0.55 * aggression();
    }
    lostT = 0;
    seen += dt;
    if (mode === 'bank') mode = 'seek';
    const dx = tgt.x - self.x, dy = tgt.y - self.y, d = Math.hypot(dx, dy) || 1;
    const tof = d / RAIL_SPEED, lead = 0.3 + 0.7 * skill;
    errT -= dt;
    if (errT <= 0) {
      errT = 0.3 + Math.random() * 0.45;
      err = gauss(Math.random) * (0.06 - 0.042 * skill);
    }
    const want = Math.atan2(dy + (tgt.vy || 0) * tof * lead, dx + (tgt.vx || 0) * tof * lead) + err;
    cmd.a = angDamp(self.aim, want, 6 + 10 * skill, dt);

    if (self.reload > 0.35 && !ctx.sudden) {
      // Empty: break the line of sight rather than stand in it.
      if (mode !== 'cover') { mode = 'cover'; modeT = 0; pickCover(); }
      follow(dt);
      return;
    }
    const close = d < 330 + 140 * (1 - skill) || (ctx.sudden && d < 620);
    if (!close && !duel && !ctx.sudden) {
      if (mode !== 'cover') { mode = 'cover'; modeT = 0; pickCover(); }
      if (!follow(dt) || modeT > 2.2) duel = true; // nowhere to go: fight after all
      return;
    }
    if (close) {
      // Hip fire on the move.
      strafeT -= dt;
      if (strafeT <= 0) { strafeT = 0.5 + Math.random() * 0.8; strafe = -strafe; }
      cmd.mx = (-dy / d) * strafe;
      cmd.my = (dx / d) * strafe;
      if (ctx.sudden) { cmd.mx += (MID.x - self.x) / 400; cmd.my += (MID.y - self.y) / 400; }
    } else cmd.alt = true; // plant and focus: the long shot
    const tol = Math.max(0.006, (R * 0.55) / d);
    const steady = close || self.sway < 0.004 + 0.012 * (1 - skill);
    // Nobody is at their sharpest in the first seconds after the lights go out.
    if (seen > react * (ctx.time < 8 ? 1.8 : 1) && steady && self.reload <= 0 && Math.abs(angDiff(self.aim, want)) < tol) {
      hes -= dt;
      if (hes <= 0) {
        cmd.fire = true;
        hes = Math.random() * (0.45 - 0.35 * skill);
      }
    }
  }

  function search(dt) {
    seen = Math.max(0, seen - dt * 2);
    lostT += dt;
    if (lostT > 0.6) sighting = false;
    if (mode === 'bank') {
      // A camper behind cover: hold still, line up the ricochet, send it.
      cmd.alt = true;
      cmd.a = angDamp(self.aim, bankA, 9, dt);
      if (self.reload <= 0 && modeT > react + 0.45 && self.sway < 0.006 && Math.abs(angDiff(self.aim, bankA)) < 0.004) {
        cmd.fire = true;
        mode = 'cover';
        modeT = 0;
        pickCover();
      } else if (modeT > 2.6) mode = 'seek';
      return;
    }
    if (mode === 'cover') {
      if (!follow(dt) || modeT > 2.2) { mode = 'seek'; hasGoal = false; }
      lookAt(bel.x, bel.y, 5, dt);
      return;
    }
    if (bel.on && bel.age < 7) {
      bankT -= dt;
      if (bankT <= 0) {
        bankT = 1 + Math.random() * 1.6;
        if (ctx.time > 6 && self.reload <= 0.2 && bel.age < 1.2 && Math.random() < 0.2 + 0.55 * skill) {
          const a = world.bank(self.x, self.y, bel.x, bel.y);
          if (a !== null) {
            mode = 'bank';
            modeT = 0;
            bankA = a + gauss(Math.random) * 0.012 * (1 - skill);
            hasGoal = false;
            return;
          }
        }
      }
      goalAge += dt;
      // They moved a long way since we chose this spot: think again.
      if (hasGoal && goalAge > 0.8 && dist(bel.x, bel.y, goalBx, goalBy) > 220) hasGoal = false;
      if (!hasGoal) {
        if (wait > 0) {
          wait -= dt;
          cmd.alt = holdFocus;
          if (wait <= 0 && bel.age > 2.5) bel.on = false; // nobody home
        } else pickPeek();
      }
      const had = hasGoal;
      follow(dt);
      // In position: go dark and hold the angle for a while. Patience is the job.
      if (had && !hasGoal) { wait = (1.2 + Math.random() * 3) * (1 - 0.5 * aggression()); holdFocus = Math.random() < 0.5; }
      lookAt(bel.x, bel.y, 5, dt);
    } else {
      if (!hasGoal) patrolNext();
      follow(dt);
      if (cmd.mx || cmd.my) cmd.a = angDamp(self.aim, Math.atan2(cmd.my, cmd.mx), 4, dt);
    }
  }

  /** Something gave them away. q: 1 = seen for certain, lower = a lit tile, a flash. */
  function notice(x, y, q) {
    if (seen > 0.1 && q < 1) return; // eyes beat ears
    const n = (1 - q) * 80 * (1.25 - skill);
    bel.x = x + gauss(Math.random) * n;
    bel.y = y + gauss(Math.random) * n;
    bel.age = 0;
    bel.on = true;
  }

  return {
    notice,

    think(dt) {
      cmd.mx = cmd.my = 0;
      cmd.fire = cmd.alt = cmd.a1 = cmd.a2 = false;
      cmd.da = undefined;
      if (ctx.phase !== 'live' || !self.alive) {
        // Before the lights go out: eye the far spawn.
        cmd.a = angDamp(self.aim, Math.atan2(foe.y - self.y, foe.x - self.x) + Math.sin(S.t * 0.9 + self.i * 2) * 0.22, 3, dt);
        return cmd;
      }
      bel.age += dt;
      modeT += dt;

      // ---- what is in sight? A decoy looks exactly like the real thing. ----
      const open = ctx.sudden;
      let tgt = null;
      if (foe.alive && (open || solids.los(self.x, self.y, foe.x, foe.y))) tgt = foe;
      let paint = foe.laserOn ? beamDist(foe.laser) : Infinity, px = foe.x, py = foe.y;
      laserT -= dt;
      if (foe.laserOn && laserT <= 0) { laserT = 0.5; notice(foe.x, foe.y, 0.9); } // a laser points both ways
      for (let i = 0; i < S.decoys.length; i++) {
        const d = S.decoys[i];
        if (!d.alive || d.owner === self.i) continue;
        let f = fooled.get(d.id);
        if (f === undefined) { f = Math.random() < 0.92 - 0.6 * skill; fooled.set(d.id, f); }
        if (!f) continue;
        if ((open || solids.los(self.x, self.y, d.x, d.y)) && (!tgt || dist(self.x, self.y, d.x, d.y) < dist(self.x, self.y, tgt.x, tgt.y))) tgt = d;
        if (d.laserOn) {
          const bd = beamDist(d.laser);
          if (bd < paint) { paint = bd; px = d.x; py = d.y; }
          if (!tgt && laserT <= 0) { laserT = 0.5; notice(d.x, d.y, 0.9); }
        }
      }

      if (tgt) engage(tgt, dt);
      else search(dt);

      // ---- painted by a laser: get off the line ----
      painted = paint < 30 ? painted + dt : Math.max(0, painted - dt * 2);
      if (painted > 0.1 + 0.5 * (1 - skill) && dodgeT <= 0 && !ctx.sudden) {
        painted = 0;
        const dx = self.x - px, dy = self.y - py, d = Math.hypot(dx, dy) || 1;
        let side = Math.random() < 0.5 ? 1 : -1;
        if (!solids.free(self.x + (-dy / d) * side * 70, self.y + (dx / d) * side * 70, R)) side = -side;
        dodgeX = (-dy / d) * side;
        dodgeY = (dx / d) * side;
        dodgeT = 0.35 + Math.random() * 0.25;
        if (self.blinkCd <= 0 && Math.random() < 0.25 + 0.6 * skill) cmd.a1 = true;
      }
      if (dodgeT > 0) {
        dodgeT -= dt;
        cmd.mx = dodgeX;
        cmd.my = dodgeY;
        cmd.alt = false;
      }

      // ---- abilities ----
      if (ctx.time > LEASH_T && hasGoal && self.blinkCd <= 0 && !cmd.alt && (cmd.mx || cmd.my) && dist(self.x, self.y, gx, gy) > 280) {
        blinkT -= dt;
        if (blinkT <= 0) { blinkT = (2 + Math.random() * 4) / (0.5 + skill); cmd.a1 = true; }
      }
      if (self.decoyCd <= 0 && bel.on && !tgt && !ctx.sudden) {
        decoyT -= dt;
        if (decoyT <= 0) {
          decoyT = 5 + Math.random() * 9;
          cmd.a2 = true; // send it wide of where we are really going
          cmd.da = Math.atan2(bel.y - self.y, bel.x - self.x) + (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.6);
        }
      }

      // ---- wedged against something that moves (a shutter, the drone, another idea) ----
      const pushing = (cmd.mx || cmd.my) && !cmd.alt;
      stuck = pushing && Math.hypot(self.vx, self.vy) < 25 ? stuck + dt : 0;
      if (stuck > 0.6) {
        stuck = 0;
        hasGoal = false;
        wait = 0;
        if (mode === 'cover') mode = 'seek';
        const a = Math.random() * Math.PI * 2;
        dodgeX = Math.cos(a);
        dodgeY = Math.sin(a);
        dodgeT = 0.4;
      }
      return cmd;
    },
  };
}
