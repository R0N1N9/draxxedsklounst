// INK CITY — the other sniper's head. One brain drives the bot and, under autopilot, the
// local player too.
//   the opening   it settles at a spot with a view, finds you in the scope and sends one or
//                 two ranging shots wide on purpose: nobody is killed in the first six and a half seconds
//   the duel      peek, steady, fire, step back behind something for the bolt; its aim starts
//                 loose on every new sight of you and tightens with time — faster with skill —
//                 and it leads a runner and holds over for the drop about as well as it is skilled
//   the push      when the long shots are not landing it leaps a terrace nearer, and in the end
//                 across the street; near misses make it throw smoke and move; a long round
//                 steadies its hands
import { clamp, lerp, angDiff, angDamp, gauss } from '../../kit.js';
import { LEAP_MAX, LEAP_MIN, LEAP_UP } from './world.js';
import { EYE } from './hero.js';

const LETHAL_AT = 6.5; // seconds of live play before a bot's rounds can kill (each bot adds up to three of its own)

export function makeBot(ctx, W, G) {
  const skill = clamp(ctx.botSkill, 0, 1);
  const roofs = W.roofs;
  const seesFrom = (x, y, z, e, T) => W.los(x, y + EYE, z, e.x, e.y + 1.5, e.z, T) || W.los(x, y + EYE, z, e.x, e.y + 0.9, e.z, T);

  function create(p) {
    const s = W.spawn[1 - p.i];
    return {
      goal: { x: p.x, z: p.z }, peek: null, hide: null, planT: 0.4 + Math.random() * 0.6, sees: false, seenT: 0, lostT: 0, settle: 0, need: 1,
      last: { x: s.x, y: roofs[s.roof].h, z: s.z }, ey: 0, ep: 0, offY: 0, offP: 0, ph: Math.random() * 9, ranging: 0, rangeAt: 3.4 + Math.random() * 3,
      fireAt: 0, under: 0, pushAt: lerp(27, 16, Math.random()) - skill * 3, crossAt: 36 + Math.random() * 12, lethalAt: LETHAL_AT + Math.random() * 3.2, lostMax: 5 + Math.random() * 6, sy: 0, sp: 0, stuck: 0, px: p.x, pz: p.z, shots: 0, leapTo: { x: 0, z: 0, roof: 0 }, wantLeap: false, moved: 0,
    };
  }

  // No two trigger pulls are the same: each shot carries its own small error, drawn when the last one left.
  // A long round sharpens it: from ~16 s on its hands are steadier and its pulls cleaner.
  const late = () => clamp((G.time() - 16) / 16, 0, 1) * 0.5;
  const newPull = (b) => { const s = lerp(0.0068, 0.0021, skill) * (1 - late()); b.sy = gauss(Math.random) * s; b.sp = gauss(Math.random) * s * 0.6; };

  // A place on roof r to shoot from, and (if there is one) a place beside it to hide.
  function plan(p, b, e, r, T) {
    let best = null, bs = -1e9;
    const n = r.spots.length;
    for (let k = 0; k < 9 && n; k++) {
      const s = r.spots[(Math.random() * n) | 0];
      const los = W.los(s.x, r.h + EYE, s.z, b.last.x, b.last.y + 1.3, b.last.z, T);
      // prefer a view, the street side of the roof, and not too long a walk
      const sc = (los ? 6 : 0) - Math.hypot(s.x - p.x, s.z - p.z) * (p.roof === r.i ? 0.25 : 0) - Math.abs(s.z) * 0.06 + Math.random() * 2 - (Math.hypot(s.x - p.x, s.z - p.z) < 2 && b.under > 0 ? 5 : 0);
      if (sc > bs) { bs = sc; best = s; }
    }
    b.peek = best;
    b.hide = null;
    if (best && skill > 0.2) for (let k = 0; k < 8; k++) {
      const s = r.spots[(Math.random() * n) | 0], d = Math.hypot(s.x - best.x, s.z - best.z);
      if (d > 5 || d < 1 || W.los(s.x, r.h + EYE, s.z, b.last.x, b.last.y + 1.3, b.last.z, T)) continue;
      b.hide = s;
      break;
    }
    b.planT = 2.5 + Math.random() * 3;
  }

  // The next roof towards the enemy that a leap can reach, or null.
  function advance(p, b, e, cross) {
    const cur = roofs[p.roof];
    let best = null, bs = 1e9;
    for (const r of roofs) {
      if (r === cur || !r.spots.length) continue;
      const mine = r.side === cur.side;
      if (!cross && !mine) continue;
      if (mine && r.row >= cur.row && cur.side === p.i) continue; // forwards only, on our own side
      if (r.h - p.y > LEAP_UP) continue;
      const s = r.spots[(Math.random() * r.spots.length) | 0], d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d > LEAP_MAX - 1 || d < LEAP_MIN + 1) continue;
      const sc = Math.hypot(s.x - e.x, s.z - e.z) + Math.random() * 14 + (mine ? 0 : cross ? -6 : 30) + (Math.hypot(s.x - e.x, s.z - e.z) < 14 ? 40 : 0) + (mine && cur.row - r.row > 1 ? 16 : 0); // (one terrace at a time, mostly)
      if (sc < bs) { bs = sc; best = s; }
    }
    return best;
  }

  function think(p, e, dt, cmd) {
    const b = p.bot, T = G.time(), ts = G.suddenT();
    cmd.fire = cmd.a1 = cmd.a2 = false;
    cmd.leapTo = null;
    b.under = Math.max(0, b.under - dt);
    if (p.leap.on) { cmd.mx = cmd.my = 0; cmd.alt = false; b.settle = 0; b.planT = 0; return cmd; }
    // ---- what it knows ----
    const sees = e.alive && seesFrom(p.x, p.y, p.z, e, T);
    if (sees) {
      if (!b.sees) { b.ey = gauss(Math.random) * lerp(0.03, 0.012, skill); b.ep = gauss(Math.random) * lerp(0.02, 0.008, skill); b.settle = 0; b.need = lerp(2.0, 0.75, skill) * (0.7 + Math.random() * 0.6); newPull(b); }
      b.seenT += dt; b.lostT = 0;
      b.last.x = e.x; b.last.y = e.y; b.last.z = e.z;
    } else {
      b.seenT = 0; b.lostT += dt;
      if (T - e.pingT < 0.3) { b.last.x = e.x; b.last.y = e.y; b.last.z = e.z; } // a muzzle flash gives the place away
    }
    b.sees = sees;
    const dx = b.last.x - p.x, dz = b.last.z - p.z, dist = Math.hypot(dx, dz) || 1;
    const close = dist < 16;

    // ---- where to stand ----
    b.planT -= dt;
    const showdown = ts >= G.SHOWDOWN;
    if (!showdown) {
      const wantPush = T > b.pushAt && p.leapCd <= 0 && ts < 0;
      if ((wantPush || (b.lostT > b.lostMax && p.leapCd <= 0 && T > 8)) && !close) {
        const s = advance(p, b, e, T > b.crossAt || roofs[p.roof].row === 0 && T > b.pushAt + 4);
        b.pushAt = T + 8 + Math.random() * 9; b.lostMax = 5 + Math.random() * 6;
        if (s) { cmd.a1 = true; b.leapTo.x = s.x; b.leapTo.z = s.z; b.leapTo.roof = s.roof; cmd.leapTo = b.leapTo; b.planT = 0; b.lostT = 0; }
      }
      if (b.planT <= 0 || !b.peek || b.peek.roof !== p.roof) plan(p, b, e, roofs[p.roof], T);
      // stuck against a prop: think again
      b.moved += Math.hypot(p.x - b.px, p.z - b.pz); b.px = p.x; b.pz = p.z;
      b.stuck += dt;
      if (b.stuck > 0.8) { if (b.moved < 0.25 && Math.hypot(b.goal.x - p.x, b.goal.z - p.z) > 1) b.planT = 0; b.stuck = 0; b.moved = 0; }
    }
    const busy = p.reload > 0 || p.bolt > 0.3;
    const wantHide = b.hide && !close && ts < 0 && (busy || (b.under > 0 && skill > 0.3));
    const g = showdown ? W.showdown[p.i] : wantHide ? b.hide : b.peek || p;
    b.goal.x = g.x; b.goal.z = g.z;
    let gx = b.goal.x - p.x, gz = b.goal.z - p.z;
    const gd = Math.hypot(gx, gz);
    // smoke: when the rounds are passing close and there is somewhere to go
    if (b.under > 1.6 && p.smokes > 0 && p.smokeCd <= 0 && T > 6 && ts < 0 && Math.random() < dt * (0.3 + 0.5 * skill)) { cmd.a2 = true; b.planT = 0; b.under = 1; }

    // ---- aim ----
    const tof = dist / G.V, k = 1 - Math.exp(-dt / lerp(1.3, 0.5, skill));
    const floor = lerp(0.0052, 0.0011, skill) * (1 + e.speed * 0.22) * (1 - late());
    b.ph += dt;
    b.ey += (Math.sin(b.ph * 1.7) * floor - b.ey) * k;
    b.ep += (Math.cos(b.ph * 1.3) * floor * 0.7 - b.ep) * k;
    const leadK = sees ? clamp(0.5 + 0.5 * skill + Math.sin(b.ph * 0.7) * 0.25 * (1 - skill), 0, 1.1) : 0;
    const tx = b.last.x + e.mvx * tof * leadK, tz = b.last.z + e.mvz * tof * leadK;
    const ty = b.last.y + 1.12 + (0.5 * G.GRAV * tof * tof - G.ZERO * dist) * lerp(0.5, 1, skill);
    const ax = tx - p.x, az = tz - p.z, ad = Math.hypot(ax, az) || 1;
    // until then it shoots to scare: wide of you, on the side you are not running to
    const ranging = T < b.lethalAt;
    if (ranging && b.offY === 0) { const side = (e.mvx * az - e.mvz * ax > 0 ? 1 : -1) * (Math.random() < 0.8 ? 1 : -1); b.offY = side * (1.7 + Math.random() * 1.4); b.offP = 0.5 + Math.random() * 0.8; }
    const oy = ranging ? b.offY / ad : 0, op = ranging ? b.offP / ad : 0;
    const wantYaw = Math.atan2(-ax, -az) + b.ey + b.sy + oy, wantPitch = Math.atan2(ty - (p.y + EYE), ad) + b.ep + b.sp + op;
    const turn = 4 + 8 * skill;
    cmd.yaw = angDamp(p.yaw, wantYaw, sees ? turn : 3, dt);
    cmd.pitch = clamp(p.pitch + (wantPitch - p.pitch) * (1 - Math.exp(-turn * dt)), -1.2, 1.2);
    const onAim = Math.abs(angDiff(cmd.yaw, wantYaw)) < 0.0035 && Math.abs(cmd.pitch - wantPitch) < 0.0035;
    const still = gd < 0.7 || (sees && !wantHide && b.seenT > 0.25 && !showdown);
    if (sees && still) b.settle += dt;
    cmd.alt = sees && dist > 13 && b.seenT > 0.2 && !wantHide && (still || showdown);

    // ---- the trigger ----
    if (sees && p.bolt <= 0 && p.reload <= 0 && p.ammo > 0 && T >= b.fireAt) {
      const notice = lerp(0.9, 0.3, skill);
      if (ranging) {
        if (T > b.rangeAt && b.ranging < 2 && p.scope > 0.9 && onAim && b.seenT > notice) { cmd.fire = true; b.ranging++; b.rangeAt = T + 2.2 + Math.random() * 1.5; b.offY = 0; }
      } else if (dist < 13) {
        if (Math.abs(angDiff(cmd.yaw, wantYaw)) < 0.03 && b.seenT > notice * 0.6) cmd.fire = true;
      } else if (p.scope > 0.9 && b.seenT > notice && onAim) {
        const lull = Math.hypot(p.swayX, p.swayY) * dist < lerp(0.8, 0.28, skill);
        if ((b.settle > b.need && lull) || b.settle > b.need + 1.6) cmd.fire = true;
      }
      if (cmd.fire) {
        b.shots++;
        b.fireAt = T + 0.3;
        b.settle *= 0.35;
        b.need = lerp(1.8, 0.65, skill) * (0.7 + Math.random() * 0.6);
        newPull(b);
        b.ey += gauss(Math.random) * lerp(0.012, 0.004, skill); b.ep += gauss(Math.random) * lerp(0.008, 0.003, skill);
        if (!b.hide && !showdown) b.planT = Math.min(b.planT, 0.25 + Math.random() * 0.5); // nowhere to hide: at least do not stand where the flash was
      }
    }

    // ---- legs ----
    const walk = gd > 0.45 && !(cmd.alt && still && !wantHide);
    if (walk) {
      gx /= gd; gz /= gd;
      const f = -Math.sin(cmd.yaw) * gx - Math.cos(cmd.yaw) * gz, s = Math.cos(cmd.yaw) * gx - Math.sin(cmd.yaw) * gz;
      cmd.mx = s; cmd.my = -f;
    } else cmd.mx = cmd.my = 0;
    return cmd;
  }

  return { create, think, underFire(p) { if (p.bot) p.bot.under = 2.6; } };
}
