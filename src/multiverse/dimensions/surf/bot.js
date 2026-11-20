// BREAK POINT — the other surfer's head. A bot plays through the same command object as a
// person: it carves, it braces, it waits for the sea to open and it misses.
//
// THE PLAN  Feel the swell out for the first seconds (no shooting, then a ranging shot or
//   two that skips past). After that it either HOLDS the range — weaving along the swell,
//   bracing when a window opens, relocating after it fires — or CLOSES, zig-zagging in
//   through the troughs for the easier shot. It dives when it is being lined up or has just
//   been missed, throws spray when caught reloading, steers round the fin, and late in the
//   round it always closes, so the duel ends before the sea goes flat.
import { clamp, lerp, damp, angDiff, angLerp, gauss } from '../../kit.js';
import { ARENA } from './sea.js';

// Nobody is hit by a bot before this (and often a little after): the opening is for a person to
// read the sea. With no person in the duel (autopilot: a demo, or the tests) it is only a breath.
export const GRACE = 10.2, GRACE_AUTO = 3;

export function makeBot(ctx, sea, world, G) {
  const R = G.R, rnd = Math.random;

  function create(p) {
    const skill = clamp(ctx.botSkill + (p.i === ctx.me ? 0 : 0), 0, 1);
    return {
      skill, t: 0, plan: 'open', planT: 0, openT: 3.6 + (1 - skill) * 1.6 + rnd() * 1.2, weave: rnd() < 0.5 ? 1 : -1, weaveT: 1.5 + rnd() * 2,
      seen: 0, lost: 9, braceT: 0, wantBrace: false, relocate: 0, settle: 1, eY: 0, eP: 0, tY: 0, tP: 0, errT: 0, underFire: 0, wasFire: 0,
      lx: 0, lz: 0, side: rnd() < 0.5 ? 1 : -1, pref: 74 + rnd() * 26, near: 44 + rnd() * 14, closer: rnd() < 0.56 - 0.24 * skill, lead: 1, shots: 0, follow: false, grace: (ctx.autopilot ? GRACE_AUTO : GRACE) + rnd() * 3.5,
    };
  }

  function think(p, e, dt, cmd) {
    const b = p.bot, skill = b.skill, T = G.T, live = ctx.phase === 'live';
    cmd.fire = cmd.a1 = cmd.a2 = false;
    if (!live) { cmd.mx = cmd.my = 0; cmd.alt = false; cmd.yaw = p.yaw; cmd.pitch = p.pitch; return cmd; }
    b.t += dt;
    const dx = e.x - p.x, dz = e.z - p.z, dist = Math.hypot(dx, dz) || 1, ux = dx / dist, uz = dz / dist;
    const see = G.sees(p.i) && e.alive;
    if (see) { b.seen += dt; b.lost = 0; b.lx = e.x; b.lz = e.z; } else { b.lost += dt; b.seen = Math.max(0, b.seen - dt * 2.5); }
    b.relocate = Math.max(0, b.relocate - dt);
    b.underFire = Math.max(0, b.underFire - dt);
    const shotAt = b.underFire > b.wasFire + 0.5; // a round just went past
    b.wasFire = b.underFire;

    // ---- where to point ----
    const ey = G.eyeY(p);
    let tx = b.lx || e.x, tz = b.lz || e.z, ty = sea.height(tx, tz) + 1;
    if (see) {
      const flight = dist / R.bulletV, evx = -Math.sin(e.hd) * e.v, evz = -Math.cos(e.hd) * e.v;
      tx = e.x + evx * flight * b.lead; tz = e.z + evz * flight * b.lead;
      ty = (G.los.see[p.i].body ? e.y + 0.95 : G.topY(e) - 0.3) + (e.air ? 0 : clamp(e.vy, -3, 3) * flight * b.lead);
    }
    const hd = Math.hypot(tx - p.x, tz - p.z) || 1;
    let wantYaw = Math.atan2(-(tx - p.x), -(tz - p.z)), wantPitch = Math.atan2(ty - ey, hd);
    // Aim error: a slow drift that tightens the longer the bot has been down on one knee.
    b.errT -= dt;
    if (b.errT <= 0) {
      const sig = lerp(0.023, 0.0075, skill) * (0.45 + 0.55 * Math.exp(-b.braceT / 1.3)) * (p.brace < 0.5 ? 2.4 : 1) * (1 + p.flinch);
      b.tY = gauss(rnd) * sig; b.tP = gauss(rnd) * sig * 0.55;
      b.errT = 0.35 + rnd() * 0.5;
      b.lead = see ? clamp(1 + gauss(rnd) * lerp(0.6, 0.22, skill), 0.2, 1.8) : b.lead;
    }
    b.eY = damp(b.eY, b.tY, 5, dt); b.eP = damp(b.eP, b.tP, 5, dt);
    const comp = 0.2 + 0.65 * skill; // how much of the board's wobble it rides out
    wantYaw += b.eY - p.swayX * comp;
    wantPitch += b.eP - p.swayY * comp;
    if (T < b.grace) { wantYaw += (b.side * 4.2) / dist; wantPitch -= 1.1 / dist; } // ranging shots: wide, low, and they skip
    const k = 1 - Math.exp(-dt * (see ? 4 + 8 * skill : 2.2));
    cmd.yaw = angLerp(p.yaw, wantYaw, k);
    cmd.pitch = clamp(p.pitch + (wantPitch - p.pitch) * k, -0.6, 0.5);

    // ---- plan ----
    if (b.plan === 'open' && b.t > b.openT) { b.plan = b.closer ? 'close' : 'hold'; b.planT = 9 + rnd() * 6; }
    if (b.plan !== 'open') {
      b.planT -= dt;
      if (b.planT <= 0) { b.plan = b.plan === 'hold' && (rnd() < 0.6 || T > 22) ? 'close' : rnd() < 0.5 ? 'hold' : 'close'; b.planT = 8 + rnd() * 6; }
      if (T > 31 || ctx.sudden) b.plan = 'close';
    }

    // ---- brace and fire ----
    const canShoot = p.bolt <= 0 && p.reload <= 0 && p.ammo > 0 && p.wet <= 0 && p.dive <= 0;
    const hip = dist < 20;
    const react = lerp(0.55, 0.28, skill);
    if (b.plan !== 'open' && see && b.seen > react && b.relocate <= 0 && !hip && !b.wantBrace) { b.wantBrace = true; b.settle = lerp(0.7, 0.42, skill) + rnd() * 0.5 * (1.2 - skill); }
    if (b.wantBrace && (b.lost > 2.4 || hip || b.relocate > 0 || p.reload > 0)) b.wantBrace = false; // (it holds its knee through a passing crest)
    // White water shakes the rifle: a bot that knows the sea rides out of it before it shoots.
    const churn = p.white > 0.55 && skill > 0.3;
    if (churn) b.wantBrace = false;
    cmd.alt = b.wantBrace;
    b.braceT = p.brace > 0.85 ? b.braceT + dt : 0;
    const onAim = Math.abs(angDiff(cmd.yaw, wantYaw)) < 0.004 + 0.012 * (1 - p.brace) && Math.abs(cmd.pitch - wantPitch) < 0.006;
    if (b.plan !== 'open' && see && canShoot && onAim && !churn && b.seen > react * (p.brace > 0.9 ? 0.5 : 1)) {
      if ((p.brace > 0.9 && b.braceT > b.settle) || (hip && b.seen > react + 0.25)) {
        cmd.fire = true;
        b.shots++;
        b.errT = 0; // the next shot is a new guess
        b.follow = rnd() < 0.3 + 0.35 * skill && p.ammo > 1;
        if (b.follow) b.settle = b.braceT + R.bolt + 0.25 + rnd() * 0.5;
        else { b.relocate = 1.2 + rnd() * 1.8; b.weave = -b.weave; }
      }
    }

    // ---- where to go ----
    b.weaveT -= dt;
    if (b.weaveT <= 0 || shotAt) { b.weave = -b.weave; b.weaveT = (b.plan === 'close' ? 1.4 : 2.4) + rnd() * 2.4; }
    let wx = -uz * b.weave, wz = ux * b.weave;
    if (b.plan === 'open') { wx += ux * 0.15; wz += uz * 0.15; }
    else if (b.plan === 'hold') { const r = clamp((dist - b.pref) / 25, -1, 1) * 0.7; wx += ux * r; wz += uz * r; }
    else { const r = clamp((dist - (ctx.sudden || T > 36 ? 24 : b.near)) / 14, -0.8, 1.1); wx = wx * 0.62 + ux * r; wz = wz * 0.62 + uz * r; }
    // Out of the white water: across the line the breaking crest is moving along (it pushes, so
    // the bot carves away from it sideways rather than fighting it).
    if (p.white > 0.3) { const fl = sea.flow(p.x, p.z), bl = Math.hypot(fl.bx, fl.bz) || 1, sx = -fl.bz / bl, sz = fl.bx / bl, sd = sx * wx + sz * wz >= 0 ? 1 : -1; wx += sx * sd * 2 * p.white; wz += sz * sd * 2 * p.white; }
    // Not into the fin, not out through the buoys.
    const fin = world.fin, fd = Math.hypot(p.x - fin.x, p.z - fin.z);
    if (fin.up && fd < 13) { wx += ((p.x - fin.x) / fd) * 1.6; wz += ((p.z - fin.z) / fd) * 1.6; }
    const ring = world.ring, ex = p.x / (ARENA.rx * ring), ez = p.z / (ARENA.rz * ring), el = Math.hypot(ex, ez);
    if (el > 0.8) { const kk = (el - 0.8) * 7; wx -= (ex / el) * kk; wz -= (ez / el) * kk; }
    const wl = Math.hypot(wx, wz) || 1, sy = Math.sin(cmd.yaw), cy = Math.cos(cmd.yaw);
    wx /= wl; wz /= wl;
    cmd.my = -(wx * -sy + wz * -cy);
    cmd.mx = wx * cy + wz * -sy;

    // ---- the tricks ----
    if (p.diveCd <= 0 && !p.air && b.plan !== 'open') {
      const linedUp = e.brace > 0.8 && G.sees(e.i) && Math.abs(angDiff(e.yaw, Math.atan2(dx, dz))) < 0.05;
      if ((shotAt && rnd() < 0.2 + 0.5 * skill) || (linedUp && !p.braced && rnd() < dt * (0.25 + 0.9 * skill))) { cmd.a1 = true; b.wantBrace = false; }
    }
    if (p.sprayCd <= 0 && p.dive <= 0 && see && b.plan !== 'open') {
      if ((p.reload > 0.6 && dist < 95 && rnd() < dt * 2.5) || (shotAt && rnd() < 0.3) || (b.plan === 'close' && dist < 60 && dist > 28 && e.brace > 0.7 && rnd() < dt * 0.8)) cmd.a2 = true;
    }
    return cmd;
  }

  return { create, think, GRACE };
}
