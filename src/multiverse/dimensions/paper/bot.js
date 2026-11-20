// The bot: feels the other sniper out from cover at its own end, then holds a lane behind the scope or flanks through
// the containers, ducking out of sight after each shot. Skill scales reaction, aim error, lead, wind/drop judgement,
// dodging and decoy sense. It fills the same command object the human does, so autopilot and the opponent share a brain.
import { clamp, angDiff, gauss } from '../../kit.js';
import { V0 } from './fx.js';
import { EYE, YARD_X, YARD_Z } from './layout.js';

const rnd = Math.random;

export function makeBot(ctx, env) {
  const skill = () => ctx.botSkill;
  const cmd = { mx: 0, my: 0, yaw: 0, pitch: 0, fire: false, alt: false, a1: false, a2: false };
  const tmp = { x: 0, z: 0 };

  function init(p) {
    p.bot = {
      mode: 'feel', modeT: 0, feelT: 7.5 - 5 * skill() + rnd() * 3, goal: { x: p.x, z: p.z }, goalT: 99,
      seen: 0, lost: 0, ey: 0, ep: 0, errT: 0, lead: 1, wig: 0, wigT: 0, still: 0, fireDelay: 0, hideT: 0,
      last: { x: 0, z: 0, t: -99 }, decoyId: -1, ignore: new Set(), dodged: new Set(), standT: 5 + rnd() * 6,
    };
  }

  /** A reachable spot, drawn from random tries, that satisfies `ok` (falls back to the last try). */
  function spot(x0, z0, spread, ok) {
    let x = x0, z = z0;
    for (let k = 0; k < 10; k++) {
      x = clamp(x0 + (rnd() - 0.5) * spread, -YARD_X + 2.5, YARD_X - 2.5);
      z = clamp(z0 + (rnd() - 0.5) * spread, -YARD_Z + 3, YARD_Z - 3);
      if (env.nav.free(x, z) && (!ok || ok(x, z))) break;
    }
    return [x, z];
  }

  function pickGoal(p, foe, b) {
    const side = p.z > 0 ? 1 : -1;
    const hidden = (x, z) => !env.sees(foe.x, EYE, foe.z, x, 1.2, z);
    const lane = (x, z) => env.sees(x, EYE, z, foe.x, 1.2, foe.z);
    let g;
    if (b.hideT > 0) g = spot(p.x, p.z, 14, hidden);
    else if (b.mode === 'feel') g = spot(p.x, side * (SPAWN_Z - 6), 24, hidden);
    else if (b.mode === 'snipe') g = spot(rnd() < 0.5 ? p.x : 0, side * (8 + rnd() * 24), 30, lane);
    else if (b.mode === 'rush') g = [clamp(foe.x + (rnd() - 0.5) * 6, -YARD_X + 3, YARD_X - 3), foe.z + side * (5 + rnd() * 6)];
    else g = spot(foe.x * 0.5, foe.z + side * (14 + rnd() * 12), 22, hidden); // flank: out of the other sniper's sight, 14-26 m short of them
    b.goal.x = g[0]; b.goal.z = g[1]; b.goalT = 0;
    env.nav.field(g[0], g[1]);
  }
  const SPAWN_Z = 37;

  function think(p, foe, dt) {
    const b = p.bot, sk = skill(), t = env.time();
    cmd.fire = cmd.alt = cmd.a1 = cmd.a2 = false;
    b.modeT += dt; b.goalT += dt; b.errT -= dt; b.wigT -= dt; b.standT -= dt; b.fireDelay -= dt; b.hideT -= dt;
    const sudden = ctx.sudden;

    // ---- perception: the other sniper, or a cardboard one that lower skill may fall for ----
    let seeReal = foe.alive && env.sees(p.x, EYE, p.z, foe.x, 1.15, foe.z);
    let seeing = seeReal, tx = foe.x, tz = foe.z, decoy = null;
    if (seeReal) { b.last.x = foe.x; b.last.z = foe.z; b.last.t = t; }
    for (const s of env.standees(foe.i)) {
      if (b.ignore.has(s.id) || !env.sees(p.x, EYE, p.z, s.x, 1.15, s.z)) continue;
      if (b.decoyId === s.id || (!seeReal && rnd() < 0.9) || (seeReal && rnd() < 0.5 * (1 - sk) * dt * 4)) { decoy = s; b.decoyId = s.id; seeing = true; tx = s.x; tz = s.z; break; }
    }
    if (seeing) { b.seen += dt; b.lost = 0; } else { b.lost += dt; if (b.lost > 0.4) b.seen = 0; }
    const dx = tx - p.x, dz = tz - p.z, dist = Math.hypot(dx, dz);

    // ---- mode ----
    if (sudden && b.mode !== 'rush') { b.mode = 'rush'; b.goalT = 99; }
    else if (b.mode === 'feel' && b.modeT > b.feelT) { b.mode = rnd() < 0.4 + 0.3 * sk ? 'snipe' : 'flank'; b.modeT = 0; b.goalT = 99; }
    else if (b.mode === 'snipe' || b.mode === 'flank') {
      if (b.modeT > 6 + rnd() * 6 || (b.mode === 'flank' && seeing && dist < 30)) { b.mode = b.mode === 'flank' && seeing ? 'snipe' : rnd() < 0.5 ? 'snipe' : 'flank'; b.modeT = 0; b.goalT = 99; }
    }
    const goalD = Math.hypot(b.goal.x - p.x, b.goal.z - p.z);
    if (b.goalT > (b.mode === 'feel' ? 2.4 : 7) || (b.goalT > 1.2 && goalD < 1.6)) pickGoal(p, foe, b);

    // ---- aim: where the target will be when the round arrives, with error that shrinks with skill ----
    const react = 0.5 - 0.38 * sk;
    let wantYaw, wantPitch;
    if (seeing) {
      const tau = dist / V0, leadK = clamp(0.25 + 0.8 * sk, 0, 1) * b.lead;
      const px = tx + (decoy ? 0 : foe.vx * tau * leadK) - (sk > 0.65 ? env.windAcc(t) * 0.5 * tau * tau : 0);
      const pz = tz + (decoy ? 0 : foe.vz * tau * leadK);
      const dd = Math.hypot(px - p.x, pz - p.z);
      if (b.errT <= 0) {
        b.errT = 0.7 + rnd() * 0.5;
        const sig = (0.012 * (1 - sk) * (1 - sk) + 0.0006) * (p.scope > 0.5 ? 0.7 : 1.6);
        b.ey = gauss(rnd) * sig; b.ep = gauss(rnd) * sig * 0.7;
        b.lead = clamp(1 + gauss(rnd) * 0.3 * (1 - sk), 0.3, 1.6);
      }
      wantYaw = Math.atan2(-(px - p.x), -(pz - p.z)) + b.ey;
      wantPitch = Math.atan2(1.15 - EYE, dd) + (sk > 0.45 ? env.drop(dist) : 0) + b.ep;
    } else {
      const ls = t - b.last.t < 6 ? b.last : null;
      wantYaw = Math.atan2(-((ls ? ls.x : 0) - p.x), -((ls ? ls.z : p.z > 0 ? -20 : 20) - p.z)) + Math.sin(t * 0.7 + p.i) * 0.12;
      wantPitch = 0;
    }
    const k = 1 - Math.exp(-dt * (seeing && b.seen > react ? 2.4 + 8 * sk : 1.5));
    cmd.yaw = p.yaw + angDiff(p.yaw, wantYaw) * k;
    cmd.pitch = p.pitch + (wantPitch - p.pitch) * k;

    // ---- fire: only when lined up, settled, and the other sniper is face-on ----
    const tol = Math.atan2(0.2 + 0.1 * (1 - sk), Math.max(8, dist));
    const aimed = seeing && Math.abs(angDiff(p.yaw, wantYaw)) < tol && Math.abs(p.pitch - wantPitch) < tol * 1.3;
    const moving = Math.hypot(p.vx, p.vz) > 1.2;
    const open = b.mode !== 'feel' || dist < 32;
    if (aimed && open && b.seen > react + 0.15 && foe.e < 0.3 && p.cycle <= 0 && p.reload <= 0 && p.ammo > 0 && p.e < 0.1 && (!moving || sk > 0.5 || dist < 22)) {
      b.still += dt;
      if (b.still > (dist > 30 ? 0.22 - 0.16 * sk : 0.05) && b.fireDelay <= 0 && (p.scope > 0.85 || dist < 28)) {
        cmd.fire = true;
        b.fireDelay = 0.4 + rnd() * 1.4 * (1 - sk);
        b.errT = 0;
        if (decoy) { b.ignore.add(decoy.id); b.decoyId = -1; }
        if (b.mode === 'snipe' || b.mode === 'feel') { b.hideT = 1.4 + rnd() * 1.6; b.goalT = 99; } // duck out of sight while the bolt works
      }
    } else b.still = 0;
    cmd.alt = seeing && dist > 24 && b.seen > 0.1 && b.hideT <= 0;

    // ---- movement ----
    let gx = 0, gz = 0, go = !(b.mode === 'snipe' && seeing && dist > 30 && b.hideT <= 0 && b.wig === 0 && sk > 0.3);
    if (goalD < 1.2) go = false;
    if (go && env.nav.step(p.x, p.z, tmp)) { gx = tmp.x - p.x; gz = tmp.z - p.z; }
    else if (go) { gx = b.goal.x - p.x; gz = b.goal.z - p.z; }
    let gl = Math.hypot(gx, gz) || 1;
    gx /= gl; gz /= gl;
    if (seeing && dist > 12 && b.mode !== 'rush' && b.hideT <= 0) { // strafing makes a worse shot to take
      if (b.wigT <= 0) { b.wigT = 0.8 + rnd() * 1.4; b.wig = rnd() < 0.35 ? 0 : rnd() < 0.5 ? -1 : 1; }
      const a = b.wig * (0.5 + sk * 0.5);
      gx += (dz / dist) * a; gz += (-dx / dist) * a;
      gl = Math.hypot(gx, gz) || 1; gx /= gl; gz /= gl;
      if (!go && !b.wig) gx = gz = 0;
    }
    const f = -Math.sin(p.yaw) * gx - Math.cos(p.yaw) * gz, s = Math.cos(p.yaw) * gx - Math.sin(p.yaw) * gz;
    cmd.mx = s; cmd.my = -f;
    if (b.mode === 'feel' && !seeing) { cmd.mx *= 0.55; cmd.my *= 0.55; }

    // ---- abilities ----
    const thr = env.threat(p);
    if (thr && !b.dodged.has(thr.id) && p.edgeCd <= 0 && !sudden) {
      if (thr.age >= react * (0.6 + rnd() * 0.5) && thr.eta > 0.13 && thr.eta < 0.5) {
        b.dodged.add(thr.id);
        if (rnd() < 0.1 + 0.8 * sk * sk) cmd.a1 = true;
      } else if (thr.eta <= 0.13) b.dodged.add(thr.id);
    }
    if (!cmd.a1 && !sudden && p.standCharges > 0 && p.standCd <= 0 && b.standT <= 0 && (b.mode === 'snipe' || b.mode === 'feel') && rnd() < 0.03) {
      cmd.a2 = true;
      b.standT = 9 + rnd() * 8;
    }
    return cmd;
  }
  return { init, think, cmd };
}
