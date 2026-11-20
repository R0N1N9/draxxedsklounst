// The bot. It plays the same game a person does: it solves the cork's arc (with a lead that gets better with
// skill), feels the other sniper out for the first seconds, then commits to a plan — hold the mesa, hide behind
// the rock, snipe from the perch, work up to the lip, spring across to the island or climb down and up the
// pillar. It ducks and jumps corks it has noticed, steps out of anvil shadows, drops decoys and portable holes,
// and can be fooled by a decoy. Skill scales its reaction time, aim error, lead and nerve.
import { clamp, angLerp, gauss, damp } from '../../kit.js';
import { GY, FLOOR, W, PW, PH, PHC, SHOULDER, PIV, SPAWN, RUN, JUMP, LIP, ANVIL, shotParams, traceCork, anvilState, weedState, birdState, plankY, onPlank } from './world.js';
import { GUN } from './figures.js';

const PLANS = ['hold', 'rock', 'perch', 'lip', 'launch', 'descend'];
const WEIGHT = [[0.4, 0.3, 0.12, 0.12, 0.04, 0.02], [0.25, 0.22, 0.2, 0.15, 0.1, 0.08], [0.14, 0.16, 0.26, 0.18, 0.14, 0.12]];

export function makeBot(ctx, w, S, p) {
  const skill = ctx.botSkill;
  const me = p.i, mir = me ? -1 : 1;
  const X = (x) => (me ? W - x : x); // a coordinate written for the left side, mirrored for the right
  const cmd = { mx: 0, my: 0, jump: false, jumpBtn: false, a: p.aim, fire: false, alt: false, a1: false, a2: false };
  const b = {
    plan: '', planT: 0, stage: 0, goalX: p.x, wait: 0, readyAt: 9.5 + Math.random() * 5 + (1 - skill) * 4, fired: 0, held: 0, chargeGoal: 0, seen: 0,
    err: 0, errT: 0, target: null, lockT: 0, dodgeT: 0, dodgeKind: 0, spotted: 0, react: 0.62 - 0.46 * skill, jumpT: 0, side: 0, sideT: 0, strafeT: 1,
    noOk: 0, leadK: 1, charging: false, stuck: 0, lastX: p.x, lastY: p.y, decoyT: 4 + Math.random() * 8, holeStage: 0, holeT: 14 + Math.random() * 10, desired: p.aim, fireWait: 0, spot: [0, 0],
    pose: 0,
  };
  const sp = { v: 0, g: 0 };
  const tr = new Float32Array(80);
  const sol = { a: 0, t: 0, ok: false };

  function enemy() { return S.P[1 - me]; }

  /** Solve the arc from (sx, sy) to (tx, ty) with charge c; high = take the lob. Writes sol. */
  function solve(sx, sy, tx, ty, c, high) {
    shotParams(c, ctx.sudden, sp);
    const dx = tx - sx, dy = ty - sy, adx = Math.abs(dx) || 1e-3, dir = dx >= 0 ? 1 : -1;
    const A = (sp.g * adx * adx) / (2 * sp.v * sp.v);
    const disc = adx * adx - 4 * A * (A - dy);
    sol.ok = false;
    if (disc < 0) return sol;
    const sq = Math.sqrt(disc);
    const u = high ? (adx + sq) / (2 * A) : (adx - sq) / (2 * A);
    sol.a = Math.atan2(-u, dir);
    sol.t = adx / (sp.v * Math.cos(Math.atan(u)));
    sol.ok = true;
    return sol;
  }

  const shoulderY = () => p.y - (SHOULDER - 2) * (p.st === 1 ? 0.66 : 1);

  function pickPlan() {
    const wt = WEIGHT[skill < 0.4 ? 0 : skill < 0.75 ? 1 : 2].slice();
    const e = enemy();
    for (let i = 0; i < wt.length; i++) {
      if (PLANS[i] === b.plan) wt[i] *= 0.2;
      if ((PLANS[i] === 'launch' || PLANS[i] === 'descend') && (S.tl < 6 || (e.y > GY + 40))) wt[i] *= 0.15;
      if (ctx.sudden && (PLANS[i] === 'hold' || PLANS[i] === 'rock')) wt[i] *= 0.3;
    }
    let r = Math.random() * wt.reduce((s, v) => s + v, 0), k = 0;
    while (k < wt.length - 1 && (r -= wt[k]) > 0) k++;
    b.plan = PLANS[k];
    b.stage = 0;
    b.planT = (ctx.sudden ? 5 : 8) + Math.random() * 8 - skill * 2;
    b.stuck = 0;
  }

  const walk = (tx, tol = 10) => {
    const d = tx - p.x;
    if (Math.abs(d) <= tol) return true;
    cmd.mx = Math.sign(d) * (Math.abs(d) < 24 ? 0.5 : 1);
    return false;
  };

  /** Where am I going and how do I get there: the plan's current step. */
  function navigate(dt) {
    const onTop = p.ground && Math.abs(p.y - GY) < 6;
    const perchTop = 205;
    switch (b.plan) {
      case 'hold': {
        if (!onTop && p.ground && p.y > GY + 20) { b.plan = 'descend'; break; }
        if (p.ground && p.y < GY - 30) { break; } // up on the perch: stay put
        if (b.stage === 0) { b.goalX = X(130 + Math.random() * 120); b.stage = 1; }
        if (b.stage === 1 && onTop && walk(b.goalX, 12)) { b.stage = 2; b.wait = 0.8 + Math.random() * 1.6; }
        if (b.stage === 2) { b.wait -= dt; if (b.wait <= 0) { b.goalX = X(80 + Math.random() * 200); b.stage = 1; } }
        break;
      }
      case 'rock': {
        const gx = X(262);
        if (b.stage === 0) { if (walk(gx, 8)) b.stage = 1; } else {
          // crouch behind the rock when the other sniper is taking aim, pop up to shoot otherwise
          const e = enemy();
          cmd.my = e.charge > 0.3 || b.dodgeT > 0 || (b.stage === 1 && p.rt > 0.2) ? 1 : 0;
        }
        break;
      }
      case 'perch': {
        const lx = X(264);
        if (b.stage === 0) { if (!onTop) { b.plan = 'hold'; break; } if (walk(lx, 6)) b.stage = 1; } else if (b.stage === 1) {
          cmd.my = -1;
          if (p.lad) b.stage = 2; else if (Math.abs(p.x - lx) > 14) b.stage = 0;
        } else if (b.stage === 2) { cmd.my = -1; if (!p.lad && Math.abs(p.y - perchTop) < 8) { b.stage = 3; b.goalX = X(300 + Math.random() * 90); } } else if (b.stage === 3) { walk(b.goalX, 10); }
        break;
      }
      case 'lip': {
        if (!onTop) { b.plan = 'hold'; break; }
        walk(X(392), 12);
        break;
      }
      case 'launch': {
        if (b.stage === 0) { if (!onTop && p.y < GY - 30) { b.plan = 'hold'; break; } if (walk(X(350), 12)) b.stage = 1; } else if (b.stage === 1) {
          cmd.mx = mir; // run at the springboard
          if (!p.ground && p.vy < -400) { b.stage = 2; }
          if (!p.ground && p.y > GY + 20) b.stage = 2;
        } else if (b.stage === 2) {
          // steer in the air onto our half of the plank, a little short of the tower
          const land = X(700);
          cmd.mx = Math.abs(land - p.x) < 24 ? 0 : Math.sign(land - p.x);
          if (p.ground) { b.stage = 3; b.plan = 'island'; b.stage = 0; b.planT = 12; }
        }
        break;
      }
      case 'island': {
        const gx = X(690 + Math.random() * 0);
        if (p.ground && onPlank(p.x) && Math.abs(p.x - gx) > 14 && p.y > GY + 40) walk(gx, 14);
        else if (p.ground && p.y > GY + 40 && !onPlank(p.x)) b.plan = 'descend';
        if (b.planT < 2 && Math.random() < dt * 0.2) b.planT += 3;
        break;
      }
      case 'descend': {
        // down the cliff ladder, across the floor, up the pillar ladder
        const cx = X(436), lx = X(472), px = X(718);
        if (p.y < GY + 10 && p.ground && b.stage === 0) { if (walk(cx, 8)) { cmd.my = 1; if (p.lad) b.stage = 1; } } else if (b.stage === 0) b.stage = 1;
        if (b.stage === 1) { cmd.my = 1; if (!p.lad && p.y > FLOOR - 8) b.stage = 2; }
        if (b.stage === 2) { if (walk(px, 8)) { b.stage = 3; } }
        if (b.stage === 3) { cmd.my = -1; if (p.lad) b.stage = 4; }
        if (b.stage === 4) { cmd.my = -1; if (!p.lad && p.y < PIV.y + 40) { b.plan = 'island'; b.stage = 0; b.planT = 10; } }
        break;
      }
      default: b.plan = 'hold';
    }
    if (p.lad) {
      // on a ladder: whatever the plan said, keep going the way it wants
      if (b.plan === 'island' || b.plan === 'hold') cmd.my = p.y > GY + 100 ? -1 : 0;
    }
  }

  /** Corks in the air that will reach me: how soon, and where on my body. */
  function threat() {
    let best = null;
    for (const c of S.corks) {
      if (!c.live || c.owner === me) continue;
      for (let t = 0.05; t < 1.5; t += 0.05) {
        const x = c.x + c.vx * t, y = c.y + c.vy * t + 0.5 * c.g * t * t;
        if (Math.abs(x - p.x) < PW + 12 && y > p.y - p.h - 12 && y < p.y + 4) {
          if (!best || t < best.t) best = { t, y: y - p.y, c };
          break;
        }
      }
    }
    return best;
  }

  /** The other sniper (or the decoy it hides among) that I believe is real. */
  function pickTarget(e) {
    if (b.target && b.lockT > 0) {
      if (b.target.decoy ? b.target.d.pop === 0 : true) return b.target;
    }
    let best = { x: e.x, y: e.y, h: e.h, vx: e.vx, decoy: false, d: null };
    const fool = 0.75 * (1 - skill) + 0.08;
    for (const d of S.decoys) {
      if (d.owner === me || d.pop > 0) continue;
      if (Math.abs(d.x - e.x) < 20 && Math.abs(d.y - e.y) < 20) continue;
      if (Math.random() < fool || Math.abs(d.x - p.x) < Math.abs(best.x - p.x) * 0.5 && Math.random() < fool * 0.6) best = { x: d.x, y: d.y, h: PH, vx: 0, decoy: true, d };
    }
    b.target = best;
    b.lockT = 1.2 + Math.random();
    return best;
  }

  function think(dt) {
    cmd.mx = 0; cmd.my = 0; cmd.jump = false; cmd.jumpBtn = false; cmd.fire = false; cmd.alt = false; cmd.a1 = false; cmd.a2 = false;
    const live = ctx.phase === 'live' && p.alive;
    const e = enemy();
    const dxe = e.x - p.x;
    b.lockT -= dt; b.dodgeT -= dt; b.planT -= dt; b.jumpT -= dt; b.sideT -= dt; b.decoyT -= dt; b.holeT -= dt; b.errT -= dt;
    if (!live) { cmd.a = angLerp(p.aim, dxe > 0 ? -0.2 : Math.PI + 0.2, 1 - Math.exp(-dt * 3)); return cmd; }
    if (!b.plan || b.planT <= 0) pickPlan();
    // stuck: nothing moved for a while although we wanted to
    if (Math.abs(p.x - b.lastX) + Math.abs(p.y - b.lastY) < 3 && (b.plan === 'launch' || b.plan === 'descend' || b.plan === 'perch')) b.stuck += dt; else b.stuck = 0;
    b.lastX = p.x; b.lastY = p.y;
    if (b.stuck > 2.5) { b.plan = 'hold'; b.stage = 0; b.planT = 4; b.stuck = 0; }

    navigate(dt);

    // ---- shadows and weeds: step out of the way ----
    let danger = 0;
    for (const a of w.ev) {
      if (a.k !== 'anvil' || ctx.time < a.t0 - 0.1 || ctx.time > a.t0 + ANVIL.warn + ANVIL.fall + 0.1) continue;
      if (Math.abs(a.x - p.x) < 80 && Math.abs(a.y - p.y) < 90) danger = Math.sign(p.x - a.x) || 1;
    }
    if (danger && !p.lad && p.ground && Math.random() < 0.3 + skill) { cmd.mx = danger; }
    // ---- incoming corks ----
    const th = p.lad ? null : threat();
    if (th) {
      if (!b.spotted) b.spotted = ctx.time;
      if (ctx.time - b.spotted > b.react && b.dodgeT <= 0 && Math.random() < 0.1 + 0.85 * skill) {
        b.dodgeT = 0.5;
        b.dodgeKind = th.y > -42 && p.ground ? 1 : th.y < -62 ? 2 : 0; // low: jump it; high: duck; mid: move or jump
        if (b.dodgeKind === 0) b.dodgeKind = Math.random() < 0.5 ? 1 : 3;
        p.scare = 0.6;
      }
    } else b.spotted = 0;
    if (b.dodgeT > 0 && !p.lad) {
      if (b.dodgeKind === 1 && p.ground && b.jumpT <= 0) { cmd.jump = true; b.jumpT = 0.7; } else if (b.dodgeKind === 2) cmd.my = 1; else if (b.dodgeKind === 3) cmd.mx = (p.x < 400 || p.x > 1200) ? mir * -1 : Math.sign(Math.random() - 0.5) || 1;
    }
    // ---- sidestep around, now and then, so the other bot has to lead ----
    if (!p.lad && p.ground && b.sideT <= 0 && (b.plan === 'hold' || b.plan === 'lip' || b.plan === 'island') && b.dodgeT <= 0) {
      b.sideT = 0.5 + Math.random() * 1.2;
      b.side = Math.random() < 0.55 ? 0 : Math.random() < 0.5 ? -1 : 1;
    }
    if (!p.lad && p.ground && b.side && cmd.mx === 0 && b.plan !== 'rock' && !b.charging) {
      const lim = b.plan === 'island' ? [600, 740] : b.plan === 'lip' ? [320, 430] : [60, 330];
      const nx = p.x + b.side * 60;
      const x0 = me ? W - lim[1] : lim[0], x1 = me ? W - lim[0] : lim[1];
      if (nx > x0 && nx < x1) cmd.mx = b.side * (skill > 0.6 ? 0.8 : 0.5);
    }

    // ---- tools ----
    if (!p.lad && p.ground && p.stun <= 0) {
      if (p.a2cd <= 0 && b.decoyT <= 0 && S.tl > 2.5 && (e.charge > 0.25 || Math.random() < dt * 0.08)) { cmd.a2 = true; b.decoyT = 3 + Math.random() * 6; b.side = Math.random() < 0.5 ? 1 : -1; b.sideT = 1.2; }
      let pair = null;
      for (const q of S.holes) if (q.owner === me) pair = q;
      if (skill > 0.3 && p.a1cd <= 0 && p.a1lock <= 0) {
        if (!pair && b.holeT <= 0 && (b.plan === 'hold' || b.plan === 'lip' || b.plan === 'perch') && b.stage >= 1 && Math.random() < dt * 0.4) { cmd.a1 = true; b.holeStage = 1; b.holeT = 12 + Math.random() * 12; b.hx = p.x; }
        else if (pair && !pair.b && Math.abs(p.x - pair.a.x) > 140 && Math.abs(p.y - pair.a.y) < 30 || pair && !pair.b && Math.abs(p.y - pair.a.y) > 60) cmd.a1 = true;
      }
      // step into a hole of mine when somebody is shooting at me and it is near
      if (pair && pair.b && !b.charging && p.holeLock <= 0 && (th || (e.charge > 0.5 && Math.abs(dxe) > 500)) && b.dodgeT > 0) {
        const hl = Math.abs(p.x - pair.a.x) < Math.abs(p.x - pair.b.x) ? pair.a : pair.b;
        if (Math.abs(hl.y - p.y) < 20 && Math.abs(hl.x - p.x) < 220) cmd.mx = Math.sign(hl.x - p.x);
      }
    }

    // ---- aim and fire ----
    const tg = pickTarget(e);
    shotParams(0, ctx.sudden, sp);
    const sx = p.x + p.face * 7, sy = shoulderY();
    const dist = Math.hypot(tg.x - sx, tg.y - sy);
    // far shots are worth charging for, if this bot is good enough to bother and the line is clear of rock
    const wantsCharge = dist > 560 && skill > 0.3 && p.ground && !p.lad && (e.charge < 0.6 || skill > 0.7) && b.plan !== 'rock' && b.noOk < 0.6;
    if (!b.charging && wantsCharge && p.rt < 0.5 && S.tl > b.readyAt - 2.5 && b.dodgeT <= 0 && !th && p.stun <= 0) { b.charging = true; b.chargeGoal = clamp(0.4 + 0.6 * Math.min(1, dist / 1100), 0.35, 1) * (0.75 + 0.25 * skill); }
    if (b.charging && (!wantsCharge || b.dodgeT > 0 || p.stun > 0 || b.noOk > 0.7)) b.charging = false;
    cmd.alt = b.charging;
    const c = p.charge;
    // predicted target position: lead by the flight time, with skill deciding how well it is judged
    let tx = tg.x, ty = tg.y - tg.h * 0.45;
    if (b.errT <= 0) { b.errT = 0.6 + Math.random() * 0.8; b.err = gauss(Math.random) * (0.06 - 0.047 * skill) * (1 - 0.5 * c) * (1 + 1.5 * Math.max(0, 1 - b.fired / 3)); b.leadK = 0.3 + 0.7 * skill + gauss(Math.random) * 0.15 * (1 - skill); }
    let ok = false;
    for (let pass = 0; pass < 2 && !ok; pass++) {
      const high = pass === 1;
      let ex = tx, ey = ty;
      solve(sx, sy, ex, ey, c, high);
      for (let it = 0; it < 2 && sol.ok; it++) { ex = tg.x + tg.vx * sol.t * b.leadK; ey = ty; solve(sx, sy, ex, ey, c, high); }
      if (!sol.ok || sol.t > 1.9) continue;
      // is the arc clear all the way?
      const L = GUN.base + 9 + c * GUN.sect * GUN.n;
      shotParams(c, ctx.sudden, sp);
      const n = traceCork(w, sx + Math.cos(sol.a) * L, sy + Math.sin(sol.a) * L, Math.cos(sol.a) * sp.v, Math.sin(sol.a) * sp.v, sp.g, sol.t + 0.1, 0.05, tr);
      const hx = tr[(n - 1) * 2], hy = tr[(n - 1) * 2 + 1];
      ok = Math.hypot(hx - ex, hy - ey) < 80 || n * 0.05 > sol.t + 0.02;
      if (ok) { tx = ex; ty = ey; }
    }
    b.noOk = ok ? 0 : b.noOk + dt;
    // no clear shot for a while: go and find one
    if (b.noOk > 2.2 && !p.lad && live) { b.noOk = 0; b.plan = Math.random() < 0.5 ? 'lip' : 'perch'; b.stage = 0; b.planT = 6; b.charging = false; }
    const want = ok ? sol.a + b.err : dxe > 0 ? -0.35 : Math.PI + 0.35;
    b.desired = want;
    cmd.a = angLerp(p.aim, want, 1 - Math.exp(-dt * (5 + 11 * skill)));
    // fire: after the opening feel-out, once the aim has settled and the reaction time has passed
    b.seen = ok ? b.seen + dt : 0;
    const settled = Math.abs(((cmd.a - want + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.014 + 0.02 * (1 - skill);
    const nerve = ctx.sudden ? 0.15 : 1;
    if (live && ok && S.tl >= b.readyAt * nerve && p.rt <= 0 && p.stun <= 0 && !p.lad && settled && b.seen > b.react * 0.6 + 0.1) {
      if (b.charging) { if (c >= b.chargeGoal) { cmd.fire = true; b.charging = false; } } else if (!wantsCharge) cmd.fire = true;
    }
    if (cmd.fire) { b.seen = 0; b.fired++; b.errT = 0; }
    return cmd;
  }

  return { think, cmd, b };
}
