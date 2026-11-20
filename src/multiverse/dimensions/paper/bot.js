// The bot: feels the other sniper out, then either holds a lane behind the scope or works its way in through the
// containers. Skill scales its reaction, aim error, lead, wind/drop judgement, dodging and decoy sense. It drives a
// command object exactly like the human's, so autopilot and the opponent share one brain.
import { clamp, angDiff, gauss } from '../../kit.js';
import { V0, G, ZERO } from './fx.js';
import { EYE, SPAWN_Z, YARD_X } from './layout.js';

const holdOver = (r) => (G * (r - ZERO)) / (2 * V0 * V0);
const rnd = Math.random;

export function makeBot(ctx, env) {
  const skill = () => ctx.botSkill;
  const cmd = { mx: 0, my: 0, yaw: 0, pitch: 0, fire: false, alt: false, a1: false, a2: false };
  const tmp = { x: 0, z: 0 };

  function init(p) {
    p.bot = {
      mode: 'feel', modeT: 0, feelT: 6.5 - 5 * skill() + rnd() * 2, goal: { x: p.x, z: p.z }, goalT: 0, seen: 0, lost: 0, ey: 0, ep: 0, errT: 0,
      wig: 0, wigT: 0, still: 0, settle: 0, lastSeen: { x: 0, z: 0, t: -99 }, lead: 0.7, dodged: new Set(), dodgeAt: -1, decoyId: -1, ignore: new Set(), standT: 5 + rnd() * 6, target: 0, pause: 0,
      wantScope: false, fireDelay: 0, burn: 0,
    };
  }

  function pickGoal(p, foe, b) {
    const sk = skill();
    const side = p.z > 0 ? 1 : -1;
    let gx, gz;
    if (b.mode === 'feel') { // shuffle around the own end, never far from home
      gx = clamp(p.x + (rnd() - 0.5) * 20, -YARD_X + 3, YARD_X - 3);
      gz = side * (SPAWN_Z - 2 - rnd() * 9);
    } else if (b.mode === 'snipe') { // a post along the long lanes with a good view down the yard
      const lanes = [-17.5, -6, 0, 6, 17.5];
      gx = lanes[Math.floor(rnd() * lanes.length)] + (rnd() - 0.5) * 3;
      gz = side * (10 + rnd() * 24);
    } else if (b.mode === 'rush') {
      gx = foe.x + (rnd() - 0.5) * 8; gz = foe.z + side * -(6 + rnd() * 8);
    } else { // flank: a flanking lane towards the other end, stopping 20-30 m short of it
      const lanes = [-24, -17.5, -6, 6, 17.5, 24];
      gx = lanes[Math.floor(rnd() * lanes.length)];
      gz = -side * (4 + rnd() * 12) + (side > 0 ? 0 : 0);
      gz = clamp(gz, -YARD_Z + 8, YARD_Z - 8);
    }
    if (!env.nav.free(gx, gz)) { // slide to a free cell
      for (let k = 1; k < 8 && !env.nav.free(gx, gz); k++) { gx += (rnd() - 0.5) * 3 * k; gz += (rnd() - 0.5) * 3 * k; }
    }
    b.goal.x = gx; b.goal.z = gz; b.goalT = 0;
    env.nav.field(gx, gz);
    b.fieldOwner = true;
    void sk;
  }
  const YARD_Z = 41;

  function think(p, foe, dt) {
    const b = p.bot, sk = skill(), t = env.time();
    cmd.fire = cmd.alt = cmd.a1 = cmd.a2 = false;
    b.modeT += dt; b.goalT += dt; b.errT -= dt; b.wigT -= dt; b.standT -= dt; b.fireDelay -= dt;
    const ex = p.x, ey = EYE, ez = p.z;
    const sudden = ctx.sudden;

    // ---- perception ----
    let seeReal = false, tx = foe.x, tz = foe.z, targetStandee = null;
    const cy = 1.15;
    if (foe.alive && env.sees(ex, ey, ez, foe.x, cy, foe.z)) seeReal = true;
    let seeing = seeReal;
    if (seeReal) { b.lastSeen.x = foe.x; b.lastSeen.z = foe.z; b.lastSeen.t = t; }
    // a cardboard cut-out in view may fool the eye: lower skill falls for it more
    for (const s of env.standees(foe.i)) {
      if (b.ignore.has(s.id)) continue;
      if (env.sees(ex, ey, ez, s.x, cy, s.z) && (!seeReal || rnd() < 0.004 * (1 - sk) * 60 * dt + (b.decoyId === s.id ? 1 : 0))) {
        if (!seeReal || b.decoyId === s.id) { targetStandee = s; seeing = true; tx = s.x; tz = s.z; b.decoyId = s.id; }
      }
    }
    if (seeing) { b.seen += dt; b.lost = 0; } else { b.lost += dt; if (b.lost > 0.35) { b.seen = 0; b.settle = 0; } }
    if (!seeing && b.lost > 0.35) b.target = 0;
    const dx = tx - ex, dz = tz - ez, dist = Math.hypot(dx, dz);

    // ---- mode ----
    if (sudden && b.mode !== 'rush') { b.mode = 'rush'; b.goalT = 99; }
    else if (b.mode === 'feel' && b.modeT > b.feelT) { b.mode = rnd() < 0.45 + 0.25 * sk ? 'snipe' : 'flank'; b.modeT = 0; b.goalT = 99; }
    else if (b.mode !== 'feel' && b.mode !== 'rush' && b.modeT > 5 + rnd() * 6) { b.mode = b.mode === 'snipe' ? (rnd() < 0.5 ? 'flank' : 'snipe') : (dist < 26 && seeing ? 'snipe' : 'flank'); b.modeT = 0; b.goalT = 99; }
    if (b.goalT > (b.mode === 'feel' ? 2.2 : b.mode === 'rush' ? 2 : 7) || (b.goalT > 1 && Math.hypot(b.goal.x - p.x, b.goal.z - p.z) < 1.6)) pickGoal(p, foe, b);

    // ---- aim ----
    const react = 0.5 - 0.38 * sk;
    const vx = foe.vx, vz = foe.vz;
    let wantYaw, wantPitch;
    const tcy = targetStandee ? 1.2 : 1.2;
    if (seeing) {
      const sc = env.drop(dist);
      const tau = dist / V0;
      const leadK = clamp(0.25 + 0.8 * sk, 0, 1) * b.lead;
      const px = tx + (targetStandee ? 0 : vx * tau * leadK) - (env.windAcc(t) * 0.5 * tau * tau) * (sk > 0.65 ? 1 : 0);
      const pz = tz + (targetStandee ? 0 : vz * tau * leadK);
      const ddx = px - ex, ddz = pz - ez, dd = Math.hypot(ddx, ddz);
      if (b.errT <= 0) {
        b.errT = 0.7 + rnd() * 0.5;
        const sig = (0.0085 * (1 - sk) * (1 - sk) + 0.0006) * (p.scope > 0.5 ? 0.7 : 1.6);
        b.ey = gauss(rnd) * sig; b.ep = gauss(rnd) * sig * 0.7;
        b.lead = clamp(1 + gauss(rnd) * 0.3 * (1 - sk), 0.3, 1.6);
      }
      wantYaw = Math.atan2(-ddx, -ddz) + b.ey;
      wantPitch = Math.atan2(cy - EYE + 0.05, dd) + (sk > 0.45 ? sc : 0) + b.ep;
      void tcy;
    } else {
      // look where the target last was, else sweep the yard ahead
      const ls = t - b.lastSeen.t < 6 ? b.lastSeen : null;
      const gx = ls ? ls.x : (b.goal.x * 0.3), gz = ls ? ls.z : p.z > 0 ? -20 : 20;
      wantYaw = Math.atan2(-(gx - ex), -(gz - ez)) + Math.sin(t * 0.7 + p.i) * 0.12;
      wantPitch = 0;
    }
    const k = 1 - Math.exp(-dt * (seeing && b.seen > react ? 2.4 + 8 * sk : 1.5));
    cmd.yaw = p.yaw + angDiff(p.yaw, wantYaw) * k;
    cmd.pitch = p.pitch + (wantPitch - p.pitch) * k;

    // ---- fire ----
    const yawErr = Math.abs(angDiff(p.yaw, wantYaw)), pitErr = Math.abs(p.pitch - wantPitch);
    const tol = Math.atan2(0.2 + 0.1 * (1 - sk), Math.max(8, dist));
    const aimed = seeing && yawErr < tol && pitErr < tol * 1.3;
    const moving = Math.hypot(p.vx, p.vz) > 1.2;
    if (aimed && b.seen > react + 0.15 && foe.e < 0.3 && p.cycle <= 0 && p.reload <= 0 && p.ammo > 0 && p.e < 0.1 && (!moving || sk > 0.5 || dist < 22)) {
      b.still += dt;
      const needStill = dist > 30 ? 0.22 - 0.16 * sk : 0.05;
      if (b.still > needStill && b.fireDelay <= 0 && (p.scope > 0.85 || dist < 28) && (b.mode !== 'feel' || b.modeT > b.feelT * 0.4)) {
        cmd.fire = true;
        b.fireDelay = 0.3 + rnd() * 0.8 * (1 - sk);
        b.errT = 0;
        if (targetStandee) { b.ignore.add(targetStandee.id); b.decoyId = -1; }
      }
    } else b.still = 0;

    // ---- scope ----
    cmd.alt = seeing && dist > 24 && b.seen > 0.1;

    // ---- movement ----
    let gx = 0, gz = 0, go = true;
    if (b.mode === 'snipe' && seeing && dist > 30 && !moving && b.wigT > 0 && sk > 0.3) go = false; // stop to take the shot
    const goalD = Math.hypot(b.goal.x - p.x, b.goal.z - p.z);
    if (goalD < 1.2) go = false;
    if (go && env.nav.step(p.x, p.z, tmp)) { gx = tmp.x - p.x; gz = tmp.z - p.z; }
    else if (go) { gx = b.goal.x - p.x; gz = b.goal.z - p.z; }
    let gl = Math.hypot(gx, gz) || 1;
    gx /= gl; gz /= gl;
    // strafing while exposed makes a moving target (and a worse shot), so it is part of the dance
    if (seeing && dist > 12 && (b.mode === 'snipe' || b.mode === 'feel')) {
      if (b.wigT <= 0) { b.wigT = 0.7 + rnd() * 1.4; b.wig = rnd() < 0.3 ? 0 : (rnd() < 0.5 ? -1 : 1); }
      const nx = -gz, nz = gx;
      const sx = Math.cos(p.yaw) * 0 + 1;
      void sx;
      gx += (dz / (dist || 1)) * b.wig * 0.9 * (0.4 + sk * 0.6);
      gz += (-dx / (dist || 1)) * b.wig * 0.9 * (0.4 + sk * 0.6);
      void nx; void nz;
      gl = Math.hypot(gx, gz) || 1; gx /= gl; gz /= gl;
    }
    if (!go && b.wig === 0) { gx = gz = 0; }
    // world-space direction → the bot's own frame (forward is (-sin yaw, -cos yaw))
    const f = -Math.sin(p.yaw) * gx - Math.cos(p.yaw) * gz, s = Math.cos(p.yaw) * gx - Math.sin(p.yaw) * gz;
    cmd.mx = s; cmd.my = -f;
    if (b.mode === 'feel' && !seeing && b.goalT > 1.4) { cmd.mx *= 0.2; cmd.my *= 0.2; }

    // ---- abilities ----
    const thr = env.threat(p);
    if (thr && !b.dodged.has(thr.id) && p.edgeCd <= 0 && !sudden) {
      const pd = 0.1 + 0.75 * sk * sk;
      if (thr.age >= react * (0.5 + rnd() * 0.5) && thr.eta > 0.13 && thr.eta < 0.5) {
        b.dodged.add(thr.id);
        if (rnd() < pd) cmd.a1 = true;
      } else if (thr.eta <= 0.13) b.dodged.add(thr.id);
    }
    if (!cmd.a1 && !sudden && p.standCharges > 0 && p.standCd <= 0 && b.standT <= 0 && (b.mode === 'snipe' || b.mode === 'feel') && rnd() < 0.02 + 0.03 * sk) {
      cmd.a2 = true;
      b.standT = 9 + rnd() * 8;
    }
    return cmd;
  }
  void SPAWN_Z; void YARD_X;
  return { init, think, cmd, holdOver };
}
