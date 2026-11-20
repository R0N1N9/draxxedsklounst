// The bot: sees only what a player sees (smoke hides, decoys fool), solves the same
// ballistic arc the preview shows, and plays a plan: dig in behind crates, take the nest,
// hold the edge, cross the bridge, or raid through the chasm. Skill scales its reaction,
// its aim error, how well it reads the thermals, and how it dodges.
import { clamp, angDiff, angDamp, gauss } from '../../kit.js';
import { C, BODY, solidAt, traceBullet } from './world.js';

const PLANS = ['cover', 'edge', 'nest', 'bridge', 'raid'];
const WEIGHTS = [[0.3, 0.2, 0.1, 0.3, 0.1], [0.25, 0.15, 0.2, 0.2, 0.2], [0.2, 0.15, 0.25, 0.15, 0.25]];

export function makeBot(ctx, world, S, p) {
  const skill = ctx.botSkill, W = world.W, E = world.E;
  const fwd = p.i === 0 ? 1 : -1, ex = (dx) => (p.i ? W - dx : dx);
  const cmd = { mx: 0, crouch: false, a: p.aim, fire: false, alt: false, jump: false, jet: false, a1: false, a2: false };
  const b = {
    plan: '', planT: 0, step: 0, aim: p.aim, err: 0, seenT: 0, react: 0.9 - 0.65 * skill, stuckT: 0, lastX: p.x,
    peek: 0, peekDur: 1.5, hold: 0, duckT: 0, dodgeAt: 0, dodgeBullet: null, decoyLock: null, lockUntil: 0, fvx: 0, fvy: 0, fx: -1, fy: -1,
    smokeRoll: 0, think0: 0, goalX: p.x, goalY: p.y, tw: Math.random(),
  };
  const sigma = 0.034 - 0.027 * skill;
  const rate = 3.5 + 10 * skill;
  const gs = () => (ctx.sudden ? 0.45 : 1);

  // Where I would stand for a plan, in world coordinates.
  const nearCrate = () => {
    let best = null;
    for (const c of world.crates) if (c.alive && Math.abs(c.y + c.h - world.GY) < 2 && (p.i ? c.x > W / 2 + 30 : c.x < W / 2 - 30)) { const d = Math.abs(c.x + c.w / 2 - p.x); if (!best || d < best.d) best = { c, d }; }
    return best ? best.c : null;
  };
  function choose() {
    const w = WEIGHTS[skill < 0.4 ? 0 : skill < 0.75 ? 1 : 2].slice();
    for (let i = 0; i < w.length; i++) {
      if (PLANS[i] === b.plan) w[i] *= 0.15;
      if (ctx.sudden && (PLANS[i] === 'edge' || PLANS[i] === 'cover')) w[i] *= 0.25;
    }
    let r = Math.random() * w.reduce((s, v) => s + v, 0), k = 0;
    while (k < w.length - 1 && (r -= w[k]) > 0) k++;
    b.plan = PLANS[k];
    b.step = 0;
    b.planT = (ctx.sudden ? 5 : 7) + Math.random() * 9 - skill * 2;
    b.stuckT = 0;
  }

  // The goal point of the current plan step.
  function goal() {
    const nest = world.nests[p.i];
    switch (b.plan) {
      case 'cover': { const c = nearCrate(); return c ? [c.x + c.w / 2 - fwd * 9, world.GY] : [ex(30), world.GY]; }
      case 'edge': return [ex(E - 5), world.GY];
      case 'nest': return [nest.x + nest.w / 2, nest.y];
      case 'bridge': return [W / 2 - fwd * 11, world.bridgeY(W / 2 - fwd * 11)];
      default: // raid
        if (b.step === 0) return [ex(E - 6), world.GY];
        if (b.step === 1) return [ex(E + 32), world.PF];
        if (b.step === 2) return [ex(W - E - 32), world.PF];
        return [p.i ? E - 6 : W - E + 6, world.GY];
    }
  }

  function drive(gx, gy) {
    const dx = gx - p.x, adx = Math.abs(dx), dir = adx > 2.5 ? Math.sign(dx) : 0;
    cmd.mx = dir * Math.min(1, adx / 9);
    let blocked = false;
    if (dir) {
      const ax = p.x + dir * 5;
      blocked = solidAt(world, ax, p.y - 3) || solidAt(world, ax, p.y - 9);
      const ledge = p.ground && world.floorY(p.x + dir * 7, p.y - 2) > p.y + 6;
      if (blocked && p.ground) cmd.jump = true;
      if (blocked && !p.ground && p.y > gy - 4) cmd.jet = true;
      if (ledge && gy <= p.y - 2) { cmd.jump = true; cmd.jet = true; }
    }
    if (gy < p.y - 6) {
      if (p.ground && (adx < 8 || blocked)) cmd.jump = true;
      if (!p.ground && p.y > gy + 3) cmd.jet = true;
    } else if (!p.ground && gy <= p.y + 2 && p.y > gy + 14 && p.vy > 0 && adx > 8) cmd.jet = true; // crossing a gap: stay up
    return adx;
  }

  // The aim that lands on (tx, ty): ballistic drop and the thermals as far as this bot can read them.
  const lift = { k: 0 };
  function solve(sx, sy, tx, ty) {
    const known = skill * (0.5 + 0.5 * skill);
    let ang = Math.atan2(ty - sy, tx - sx);
    const dist = Math.hypot(tx - sx, ty - sy) || 1;
    for (let i = 0; i < 3; i++) {
      let x = sx, y = sy, vx = Math.cos(ang) * C.BULLET_V, vy = Math.sin(ang) * C.BULLET_V, t = 0;
      const h = 1 / 60;
      while ((x - tx) * fwd < 0 && t < 1.6) {
        vy += (C.BULLET_G * gs() - world.lift(x) * known * (ctx.sudden ? 0 : 1)) * h;
        x += vx * h; y += vy * h; t += h;
      }
      lift.k = t;
      ang += ((ty - y) / dist) * 0.95;
    }
    return ang;
  }

  function stateOf(q) { return BODY[q.st || 0]; }

  function think(dt) {
    const foe = S.P[1 - p.i];
    cmd.mx = 0; cmd.crouch = false; cmd.fire = false; cmd.alt = false; cmd.jump = false; cmd.jet = false; cmd.a1 = false; cmd.a2 = false;
    if (ctx.phase !== 'live' || !p.alive) { cmd.a = p.aim; return cmd; }
    if (!b.plan) { choose(); b.planT = 0.5 + Math.random() * 1.5; }
    b.planT -= dt;
    if (b.planT <= 0) choose();

    // --- perception: velocity of the foe, smoke, decoys ---
    if (b.fx >= 0 && dt > 0) { b.fvx += ((foe.x - b.fx) / dt - b.fvx) * Math.min(1, dt * 8); b.fvy += ((foe.y - b.fy) / dt - b.fvy) * Math.min(1, dt * 8); }
    b.fx = foe.x; b.fy = foe.y;
    const hidden = S.hides(foe.x, foe.y - 8);
    let tx = foe.x, ty = foe.y - stateOf(foe).h * 0.55, tvx = b.fvx, tvy = b.fvy, tgt = foe, real = true;
    for (const d of S.decoys) {
      if (!d.alive || d.owner === p.i) continue;
      if (b.decoyLock !== d) {
        if (b.lockUntil < S.t && Math.random() < 0.8 - 0.6 * skill && !d.seenBy) { b.decoyLock = d; b.lockUntil = S.t + 2.5 + Math.random() * 2; }
        d.seenBy = true;
      }
    }
    if (b.decoyLock && (!b.decoyLock.alive || b.lockUntil < S.t)) b.decoyLock = null;
    if (b.decoyLock) { const d = b.decoyLock; tx = d.x; ty = d.y - 8; tvx = d.dir * (d.moving ? C.DECOY_V : 0); tvy = 0; tgt = d; real = false; }
    const sees = foe.alive && (!hidden || !real);
    const dist = Math.abs(tx - p.x);
    const sh = BODY[p.st];
    const sx = p.x + fwd, sy = p.y - sh.sh;
    if (sees) b.seenT += dt; else b.seenT = 0;

    // --- movement by plan ---
    let [gx, gy] = goal();
    if (b.plan === 'raid') {
      const d = Math.hypot(gx - p.x, gy - p.y);
      if (d < 9 && b.step < 3) b.step++;
      else if (b.step === 3 && d < 8) b.planT = Math.min(b.planT, 2);
      [gx, gy] = goal();
    }
    const adx = drive(gx, gy);
    const arrived = adx < 4 && Math.abs(gy - p.y) < 8;
    b.stuckT = Math.abs(p.x - b.lastX) < 0.3 * dt * 60 && !arrived && p.ground ? b.stuckT + dt : 0;
    b.lastX = p.x;
    if (b.stuckT > 2.2) { choose(); b.stuckT = 0; }

    // --- stance: peek from cover, prone for the long shot, duck from the bird and from bullets ---
    const eta = world.birdEta(p.x);
    const birdWise = skill > 0.25 || Math.random() < 0.003;
    if (eta < 1.7 && eta > -0.8 && birdWise && p.ground) b.duckT = Math.max(b.duckT, 0.3);
    let danger = false;
    for (const bl of S.bullets) {
      if (bl.owner === p.i || !bl.live) continue;
      const toward = (p.x - bl.x) * Math.sign(bl.vx || 1) > 0 && Math.abs(p.x - bl.x) < 240;
      if (!toward) continue;
      if (bl !== b.dodgeBullet) {
        b.dodgeBullet = bl;
        b.dodgeAt = S.t + 0.1 + 0.22 * (1 - skill) + Math.random() * 0.1;
      }
      const T = Math.abs(p.x - bl.x) / Math.abs(bl.vx || 1), yAt = bl.y + bl.vy * T + 0.5 * C.BULLET_G * T * T;
      if (Math.abs(yAt - (p.y - 8)) < 14 && Math.random() < 0.02 + skill * 0.9) danger = true;
    }
    if (danger && S.t >= b.dodgeAt && p.ground && p.st < 2 && !arrived) b.duckT = Math.max(b.duckT, 0.5);
    if (b.duckT > 0) { b.duckT -= dt; cmd.crouch = true; if (b.duckT > 0.2 && p.ground) cmd.mx *= 0.2; }

    let want = 0;
    const holding = arrived && (b.plan === 'edge' || b.plan === 'nest' || b.plan === 'cover' || b.plan === 'bridge');
    if (holding) {
      if (b.plan === 'cover') {
        b.peek -= dt;
        if (b.peek <= 0) { b.hold = b.hold ? 0 : 1; b.peek = b.hold ? 0.9 + Math.random() * 0.7 : (1.4 - skill * 0.8) + Math.random() * 1.6; }
        want = b.hold ? 0 : 1; // stand to peek, crouch to hide
        if (!b.hold && sees && skill > 0.35 && dist > 110 && b.peek < 0.5) want = 1;
      } else if (b.plan === 'bridge') want = 1;
      else want = dist > 90 && skill > 0.3 ? 2 : 1;
      if (b.plan === 'cover' && want === 1) cmd.crouch = true;
      if (want === 2 && p.ground && b.duckT <= 0) cmd.alt = true;
      if (b.plan === 'edge' || b.plan === 'nest') { if (want === 1) cmd.crouch = Math.random() < 0.5 && skill < 0.5; }
    } else if (sees && p.ground && dist > 120 && skill > 0.5 && Math.abs(cmd.mx) < 0.01 && b.duckT <= 0) cmd.alt = true;
    if (cmd.alt) cmd.mx = 0;

    // --- aim and fire ---
    let ang = b.aim;
    if (sees || b.seenT > 0) {
      const T0 = dist / C.BULLET_V + 0.02;
      const lead = (0.35 + 0.65 * skill) * T0;
      let ax = tx + tvx * lead, ay = ty + tvy * lead * 0.5;
      ang = solve(sx, sy, ax, ay);
      const T1 = lift.k;
      ax = tx + tvx * T1 * (0.35 + 0.65 * skill); ay = ty + tvy * T1 * 0.4 * skill;
      ang = solve(sx, sy, ax, ay) + b.err;
    } else if (!holding) ang = Math.atan2(gy - p.y - 8, gx - p.x) * 0.2 + b.aim * 0.8;
    else ang = fwd > 0 ? -0.04 : Math.PI + 0.04;
    b.aim = angDamp(b.aim, ang, cmd.alt ? rate * 0.8 : rate, dt);
    cmd.a = b.aim;
    const aligned = Math.abs(angDiff(b.aim, ang)) < 0.012 + 0.012 * (1 - skill);
    if (sees && p.reload <= 0 && aligned && b.seenT > b.react) {
      // a clear arc, or cover worth breaking
      const hit = traceBullet(world, sx, sy, b.aim, Math.min(1.4, dist / C.BULLET_V + 0.25), gs(), ctx.sudden ? 0 : skill * 0.6, null);
      const beyond = hit.hit === 0 || (hit.x - tx) * fwd > -4;
      const crateBreak = hit.hit === 2 && skill > 0.4 && Math.random() < 0.025;
      const stationaryOK = skill < 0.5 || Math.abs(p.vx) < 30 || p.st > 0 || dist < 120;
      if ((beyond || crateBreak) && stationaryOK) {
        cmd.fire = true;
        b.err = gauss(Math.random) * sigma * (cmd.alt ? 0.45 : 1) * (1 + Math.min(1, Math.abs(p.vx) / 60) * 0.6);
        if (b.plan === 'cover') { b.hold = 1; b.peek = 0.6 + Math.random() * 0.6; }
      }
    } else if (p.reload <= 0 && !sees) b.err = gauss(Math.random) * sigma;

    // --- abilities ---
    if (sees && p.ground) {
      if (p.decoyCd <= 0 && dist > 70 && Math.random() < dt * (0.1 + skill * 0.25)) cmd.a2 = true;
      if (p.smokeCd <= 0 && real && dist < 200 && (b.plan === 'bridge' || b.plan === 'raid' || b.plan === 'nest') && !arrived && Math.random() < dt * (0.15 + skill * 0.7)) {
        cmd.a1 = true;
        cmd.a = fwd > 0 ? -0.75 : Math.PI + 0.75; // lob it ahead
      }
    }
    // low skill: fidgets and wanders instead of holding
    if (skill < 0.4 && arrived && Math.random() < dt * 0.6) cmd.jump = true;
    return cmd;
  }
  return { think, cmd };
}
export { clamp };
