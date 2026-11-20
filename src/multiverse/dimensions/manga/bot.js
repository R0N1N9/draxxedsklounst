// The opponent's brain (also drives the local player under ctx.autopilot). It plays a plan, like a person:
// a feeling-out phase of cover-to-cover moves, then either a SNIPER (peek from cover, focus, one clean
// shot, back behind the wall) or a HUNTER (zig-zag in, hip-fire inside 25 m, use the blink and the decoy).
// Skill scales reaction time, aim error, how well it leads a moving target, how often it dodges.
import { clamp, angDiff, gauss } from '../../kit.js';
import { WX, WZ, DY, R_BODY, BULLET_V, lineClear, aimAngleOf, trainPhase, XING } from './world.js';

const RND = Math.random;
const dist = Math.hypot;

export function makeBot(ctx, world, env) {
  const s = ctx.botSkill;
  const b = {
    t: 0, mode: RND() < 0.5 ? 'sniper' : 'hunter', stage: 'feel', feel: 10 + (1 - s) * 6 + RND() * 4,
    gx: 0, gz: 0, goalT: 0, seen: 0, lost: 0, err: 0, errT: 0, aim: null, react: 0, hesitate: 0, peek: 0, hideT: 0,
    evx: 0, evz: 0, ex: 0, ez: 0, ts: -1, side: RND() < 0.5 ? 1 : -1, stuck: 0, lx: 0, lz: 0, dodgeT: 0, dodgeDir: 1, dodged: new Set(),
    focusHold: 0, cmd: { mx: 0, mz: 0, a: 0, fire: false, alt: false, a1: false, a2: false },
  };

  const free = (x, z) => { for (const r of world.walk) if (x > r.x - 1.3 && x < r.x + r.w + 1.3 && z > r.y - 1.3 && z < r.y + r.h + 1.3) return false; return true; };

  // A hiding spot: just behind a tall piece of cover, as seen from the enemy.
  function coverSpot(p, e, near) {
    let best = null, bd = 1e9;
    const dir = e.x >= p.x ? 1 : -1;
    for (const c of world.cover) {
      if (!c.tall || c.kind === 'pole' || c.kind === 'pillar') continue;
      const cx = c.x + c.w / 2, cz = c.z + c.d / 2;
      const sx = cx - dir * (c.w / 2 + 1.6), sz = clamp(cz, 2, WZ - 2);
      if (sx < 4 || sx > WX - 4 || !free(sx, sz)) continue;
      if (Math.abs(cx - XING.x) < XING.w) continue;
      const d = dist(sx - (near ? p.x : p.x + dir * 24), sz - (near ? p.z : 10)) + RND() * 6;
      if (d < bd) { bd = d; best = { x: sx, z: sz }; }
    }
    return best || { x: clamp(p.x + dir * 12, 6, WX - 6), z: 4 + RND() * 12 };
  }

  function pickGoal(p, e) {
    const dir = e.x >= p.x ? 1 : -1, d = Math.abs(e.x - p.x);
    if (b.stage === 'feel') {
      const g = coverSpot(p, e, false);
      b.gx = g.x; b.gz = g.z;
    } else if (b.mode === 'sniper') {
      const g = coverSpot(p, e, true);
      b.gx = g.x; b.gz = g.z;
    } else { // hunter: a zig-zag step toward the enemy, preferring to land behind something
      const step = clamp(10 + RND() * 8, 6, d);
      const g = coverSpot({ x: p.x + dir * step, z: p.z }, e, true);
      b.gx = RND() < 0.6 ? g.x : clamp(p.x + dir * step, 4, WX - 4);
      b.gz = RND() < 0.6 ? g.z : clamp(p.z + b.side * (4 + RND() * 5), 2, WZ - 2);
      b.side = -b.side;
    }
    b.goalT = 1.5 + RND() * 2.5;
  }

  return function think(p, e, dt) {
    const c = b.cmd, V = BULLET_V;
    c.fire = c.alt = c.a1 = c.a2 = false;
    if (ctx.phase !== 'live') { c.mx = c.mz = 0; c.a = p.aim; return c; } // the countdown is not part of the plan
    b.t += dt;
    b.goalT -= dt;
    b.errT -= dt;
    b.hideT -= dt;
    b.dodgeT -= dt;

    // who am I shooting at: the enemy, or a decoy they left standing
    let tx = e.x, tz = e.z, tev = true;
    const hiddenE = env.hiddenFrom(e, p);
    let see = !hiddenE && lineClear(world, p.x, p.z, e.x, e.z);
    for (const d of env.decoys) {
      if (d.owner === p.i || !d.alive || d.age < 0.5) continue;
      if (!lineClear(world, p.x, p.z, d.x, d.z)) continue;
      if (hiddenE || RND() < 0.004 * (1 - s)) { tx = d.x; tz = d.z; tev = false; see = true; break; }
    }
    if (tev && b.ts >= 0) { // enemy velocity, smoothed from what I can see
      const k = Math.min(1, dt * 6);
      b.evx += ((e.x - b.ex) / Math.max(dt, 1e-3) - b.evx) * k;
      b.evz += ((e.z - b.ez) / Math.max(dt, 1e-3) - b.evz) * k;
    }
    b.ex = e.x; b.ez = e.z; b.ts = 1;
    if (!tev) { b.evx = b.evz = 0; }
    if (see) { b.seen += dt; b.lost = 0; } else { b.seen = 0; b.lost += dt; }
    const dx = tx - p.x, dz = tz - p.z, d = dist(dx, dz) || 1;
    // the feeling-out phase ends on a timer (or when shot at / the enemy walks into the open)
    if (b.stage === 'feel' && (b.t > b.feel || (env.sudden))) { b.stage = 'play'; b.goalT = 0; }
    if (env.sudden) b.mode = 'hunter';
    if (b.stage === 'play' && b.mode === 'sniper' && b.t > b.feel + 16 + RND() * 4) b.mode = 'hunter'; // patience runs out

    // ---- incoming fire: bullets whose path will pass close to me ----
    let threat = 0, tgap = 9;
    for (const bl of env.bullets) {
      if (!bl.live || bl.owner === p.i) continue;
      const rx = p.x - bl.x, rz = p.z - bl.z, along = rx * bl.ux + rz * bl.uz;
      if (along < -1 || along > 60) continue;
      const px = rx - bl.ux * along, pz = rz - bl.uz * along, perp = dist(px, pz), ttc = Math.max(0, along) / V;
      if (perp < 2.4 && ttc < 0.8 && bl.age > 0.1 + (1 - s) * 0.3) {
        if (!b.dodged.has(bl.id)) {
          b.dodged.add(bl.id);
          if (RND() < 0.12 + s * 0.8) {
            b.dodgeT = 0.5; threat = 1; tgap = ttc;
            const sg = px * -bl.uz + pz * bl.ux; // which side of the path I am on
            b.dodgeDir = sg >= 0 ? 1 : -1;
            b.dodgeX = -bl.uz * b.dodgeDir; b.dodgeZ = bl.ux * b.dodgeDir;
            if (ttc < 0.34 && s > 0.45 && p.flashCd <= 0 && RND() < s) c.a1 = true;
          }
        }
      }
    }

    // am I in the enemy's sights? (their aim ray passes through me, and they are concentrating)
    let sighted = false;
    if (see && tev && e.fz > 0.35) {
      const ea = e.aim, ux = Math.cos(ea), uz = Math.sin(ea) / DY, ul = Math.hypot(ux, uz);
      const rx = p.x - e.x, rz = p.z - e.z, al = (rx * ux + rz * uz) / ul;
      if (al > 0 && dist(rx - (ux / ul) * al, rz - (uz / ul) * al) < 3.2) sighted = true;
    }

    // ---- where to go ----
    if (b.goalT <= 0 || dist(b.gx - p.x, b.gz - p.z) < 1.2) pickGoal(p, e);
    let gx = b.gx, gz = b.gz, still = false;
    const range = Math.abs(e.x - p.x);
    if (b.stage === 'play' && b.mode === 'sniper') {
      // peek: when I have not seen them for a while I step out to a lane that sees them; after shooting I duck back
      if (b.hideT > 0) { b.peek = 0; /* stay at the cover spot */ }
      else if (!see) { gx = p.x + (e.x > p.x ? 3 : -3); gz = clamp(e.z, 3, WZ - 3); }
      else { still = true; b.peek += dt; if (b.peek > 1.6 + RND() * 1.4 && b.hideT <= 0) { b.hideT = 1.6 + RND() * 1.2; b.peek = 0; } }
    } else if (b.stage === 'play' && range < 24 && see) still = RND() < 0.02;
    // the train: leave the crossing while the bell rings, and never wait on the tracks
    const trainD = trainPhase(world, ctx.time);
    if (trainD !== 0 && trainD < 0.5 && Math.abs(p.x - XING.x) < XING.w / 2 + 3) { gx = XING.x + (p.x < XING.x ? -9 : 9); still = false; b.goalT = 0.5; }
    if (b.dodgeT > 0) { gx = p.x + b.dodgeX * 8; gz = clamp(p.z + b.dodgeZ * 8, 1.5, WZ - 1.5); still = false; }
    else if (sighted && RND() < 0.03 + s * 0.06) { b.dodgeT = 0.7; b.dodgeX = RND() < 0.5 ? -0.3 : 0.3; b.dodgeZ = RND() < 0.5 ? -1 : 1; }
    // keep inside the closing page
    gx = clamp(gx, env.lim.x0 + 2, env.lim.x1 - 2);
    let mx = gx - p.x, mz = gz - p.z;
    const ml = dist(mx, mz);
    if (ml < 0.6 || still) { mx = mz = 0; } else { mx /= ml; mz /= ml; }
    // not getting stuck on a crate: slide along z when blocked
    if (ml > 0.6 && !still) {
      if (dist(p.x - b.lx, p.z - b.lz) < 0.15 * dt * 6) b.stuck += dt; else b.stuck = 0;
      if (b.stuck > 0.4) { mz = b.side; mx *= 0.3; if (b.stuck > 1.4) { b.stuck = 0; b.side = -b.side; b.goalT = 0; } }
    }
    b.lx = p.x; b.lz = p.z;

    // ---- aiming ----
    if (b.errT <= 0) { b.errT = 0.25 + RND() * 0.35; b.err = gauss(RND) * (0.06 - 0.052 * s) * (1 - 0.82 * p.fz); }
    let want = aimAngleOf(dx, dz);
    if (see) {
      // lead the target by its flight time; better bots estimate it better
      const lead = 0.45 + 0.5 * s;
      let t = d / V, px = tx + b.evx * t * lead, pz = tz + b.evz * t * lead;
      t = dist(px - p.x, pz - p.z) / V;
      px = tx + b.evx * t * lead; pz = tz + b.evz * t * lead;
      want = aimAngleOf(clamp(px, 1, WX - 1) - p.x, clamp(pz, 0.5, WZ - 0.5) - p.z);
    }
    const track = 1 - Math.exp(-dt * (3.5 + 11 * s));
    const cur = c.a || p.aim;
    c.a = cur + angDiff(cur, want + (see ? b.err : 0)) * track;
    c.mx = mx; c.mz = mz;

    // ---- trigger discipline ----
    const wantFocus = see && d > 22 && !threat && (b.mode === 'sniper' || d > 34) && (b.stage === 'play' || b.seen > 0.8);
    if (wantFocus) { c.alt = true; c.mx *= 0.3; c.mz *= 0.3; }
    const react = 0.75 - 0.55 * s;
    const tol = Math.max(0.012, Math.atan2(R_BODY * (0.55 + 0.25 * s), d) * (d < 20 ? 1.15 : 1));
    const need = d > 22 ? 0.55 + (1 - s) * 0.3 : 0; // how settled the aim must be before a long shot
    // nobody opens fire in the first seconds: both snipers size the street up (close range excepted)
    const settled = b.t > 5.5 + (1 - s) * 3 + RND() * 0.001 && (b.stage === 'play' || d < 30);
    if (settled && see && b.seen > react && p.reload <= 0 && p.stun <= 0 && p.fz >= need && Math.abs(angDiff(p.a, want)) < tol * 1.1) {
      b.hesitate -= dt;
      if (b.hesitate <= 0) {
        c.fire = true;
        b.hesitate = (0.25 + RND() * 0.4) * (1.1 - s);
        if (b.mode === 'sniper') b.hideT = 1.4 + RND() * 1.4;
      }
    } else b.hesitate = Math.max(0, b.hesitate - dt * 0.5);
    if (b.stage === 'play' && b.hideT > 0 && b.mode === 'sniper') { c.alt = false; }

    // ---- tools ----
    if (!c.a1 && p.flashCd <= 0 && b.stage === 'play' && RND() < dt * (0.1 + 0.3 * s)) {
      if (b.mode === 'hunter' && range > 32 && (!tev || e.fz < 0.4)) c.a1 = true; // close the gap
      else if (sighted && s > 0.35) c.a1 = true; // get out of the crosshair
    }
    if (p.subCd <= 0 && b.stage === 'play' && see && RND() < dt * (0.15 + 0.5 * s) && (sighted || (b.mode === 'hunter' && range > 20 && range < 50))) c.a2 = true;
    if (c.a1 && mx === 0 && mz === 0) { c.mx = (e.x > p.x ? 1 : -1) * 0.7; c.mz = b.side * 0.5; }
    return c;
  };
}
