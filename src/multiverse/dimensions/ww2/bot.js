// IRON AUTUMN — the bot. It plays by the same rules as a person: the same rifle, the same
// sway, the same cover. What scales with ctx.botSkill is how fast it notices you, how long
// its aim takes to settle and how well it judges lead and drop.
//
// The plan: open from the barricade, trading a round or two down the centre lane; then hop
// post to post (kneeling out of sight, rising to glass the square through the scope) towards
// the enemy's last known position — sooner if it is aggressive, later if it is patient — and
// from inside 55 m with a view of that position, lie in ambush. See the enemy: stop, settle,
// shoot, work the bolt behind cover. Caught moving by incoming fire: run for the next cover.
// Hear a shell coming: run. Under fire in the open: smoke.
import { clamp, angDiff, gauss } from '../../kit.js';
import { shapeOf, EYE_STAND, EYE_PEEK } from './soldier.js';

export function makeBot(ctx, map, G) {
  const skill = clamp(ctx.botSkill, 0, 1);
  const sh = {}, eye = { x: 0, y: 0, z: 0 }, hazard = { x: 0, z: 0 }, cand = [];
  const rnd = Math.random;

  function create(p) {
    return {
      // The opening: glass the far barricade down the centre lane and trade a round or two before moving up.
      state: 'hold', post: null, prev: null, path: null, pi: 0, holdT: 0, holdMax: 3.6 + rnd() * 1.4, peekT: 3.5 + rnd() * 2, peeking: true,
      aggr: 0.3 + rnd() * 0.6, see: 0, knownX: 0, knownZ: 0, knownT: 0, pingSeen: -1, onT: 0, errY: 0, errP: 0, gY: 0, gP: 0, rollT: 0, leadErr: 0,
      react: 0.5 + (1 - skill) * 0.8, underFire: 0, blindT: 0, stuckT: 0, stuckN: 0, lx: p.x, lz: p.z, sweep: rnd() * 6, stand: 0, decoyLook: [0, 0, 0, 0], afterDecoy: false, fooled: -1, init: false, shots: 0,
    };
  }

  // How close a telegraphed shell (or the falling wall) is to (x, z): metres inside its danger ring, or 0.
  function danger(x, z, out) {
    let worst = 0;
    const list = G.dangers();
    for (let i = 0; i < list.length; i++) {
      const s = list[i], d = Math.hypot(x - s.x, z - s.z), inside = s.r + 3.2 - d;
      if (inside > worst) { worst = inside; if (out) { out.x = s.x; out.z = s.z; } }
    }
    return worst;
  }

  function choosePost(p, b, sudden) {
    // (Never right on top of where they were last seen: by the time the bot gets there they are somewhere else, and the two just swap ends.)
    const curDz = Math.abs(p.z - b.knownZ), minRange = sudden >= 0 ? 0 : Math.max(b.knownT > 10 ? 9 : 20, 54 - 26 * b.aggr - G.time() * 1.9);
    const safe = sudden >= 0 ? map.safeZ(sudden + 7) - 2.5 : 1e9;
    cand.length = 0;
    for (const post of map.posts) {
      const need = b.knownZ < post.z ? -1 : 1;
      if (post.dir !== need || post === b.post) continue;
      const dSelf = Math.hypot(post.x - p.x, post.z - p.z), dz = Math.abs(post.z - b.knownZ);
      if (dSelf < 3 || dSelf > (sudden >= 0 ? 70 : 40) || dz < minRange || Math.abs(post.z) > safe) continue;
      if ((post.z - b.knownZ) * (p.z - b.knownZ) < 0) continue; // never a post behind the enemy
      // Early on the bot is content to trade shots down the length of the square; the longer the round runs, the more it wants to close.
      const push = b.afterDecoy ? 0.05 : (0.35 + b.aggr) * clamp((G.time() - 2 + b.aggr * 10) / 11, 0.12, 1);
      let s = -Math.abs(dSelf - 19) * 0.5 + (curDz - dz) * push + rnd() * 7;
      if (post.kind === 'pit') s += 1.5;
      if (post.y > 1) s += 2;
      if (b.prev && Math.hypot(post.x - b.prev.x, post.z - b.prev.z) < 2) s -= 6;
      if (danger(post.x, post.z)) s -= 100;
      if (sudden >= 0) s -= Math.abs(post.z) * 0.6;
      cand.push({ post, s });
    }
    cand.sort((a, c) => c.s - a.s);
    const time = G.time();
    let best = null, bs = -1e9;
    for (let i = 0; i < Math.min(5, cand.length); i++) {
      const c = cand[i], peekY = c.post.y + (c.post.kind === 'low' ? EYE_PEEK : EYE_STAND);
      const s = c.s + (map.los(c.post.px, peekY, c.post.z, b.knownX, map.height(b.knownX, b.knownZ) + 1.2, b.knownZ, time, true) ? 13 : 0);
      if (s > bs) { bs = s; best = c.post; }
    }
    return best;
  }

  function goTo(p, b, post) {
    const path = post && map.path(p.x, p.z, post.x, post.z, null, p.y, post.y);
    if (!path) return false;
    b.prev = b.post;
    b.post = post;
    b.path = path;
    b.pi = 0;
    b.state = 'move';
    b.stuckT = 0;
    b.afterDecoy = false;
    return true;
  }

  // Fill cmd for sniper p against enemy e.
  function think(p, e, dt, cmd) {
    const b = p.bot, time = G.time(), sudden = G.suddenT();
    const grace = 2.3 + (1 - skill); // nobody is shot off the starting line: a moment first to get a head down
    if (!b.init) { b.init = true; b.knownX = e.x; b.knownZ = e.z; let bd = 1e9; for (const q of map.posts) { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd && q.dir === (e.z < p.z ? -1 : 1)) { bd = d; b.post = q; } } }
    cmd.fire = cmd.a1 = cmd.a2 = false;
    cmd.mx = cmd.my = 0;
    G.eye(p, eye);
    shapeOf(e.x, e.y, e.z, e.yaw, e.k, sh);
    const dx = e.x - p.x, dz = e.z - p.z, dist = Math.hypot(dx, dz) || 1;
    const visHead = e.alive && map.los(eye.x, eye.y, eye.z, sh.hx, sh.hy, sh.hz, time);
    const visBody = e.alive && map.los(eye.x, eye.y, eye.z, sh.bx, sh.by, sh.bz, time);
    const vis = visHead || visBody, bearing = Math.atan2(-dx, -dz), off = Math.abs(angDiff(p.yaw, bearing));
    // Noticing: movement, a standing figure, a glinting scope and a muzzle flash all help; a
    // scope narrows what the bot itself can take in.
    const cone = p.scope > 0.5 ? 0.12 : 0.95;
    // (The glint is the same one a person sees: only a scope pointed this way shows it.)
    const glint = e.scope > 0.5 && Math.abs(angDiff(e.yaw, bearing + Math.PI)) < 0.3;
    const rate = (0.45 + 1.6 * skill) * (0.3 + e.speed / 5.6 + (e.k > 0.7 ? 0.3 : 0) + (glint ? 0.7 : 0) + (time - e.shotT < 2 ? 1.2 : 0)) * clamp(55 / dist, 0.5, 3) * (off < cone ? 1 : 0.22);
    b.see = vis ? Math.min(1.6, b.see + rate * dt) : Math.max(0, b.see - dt * 0.7);
    const exposed = e.markT > time || sudden >= 0;
    const spotted = vis && (b.see >= 1 || exposed);
    if (exposed || spotted) { b.knownX = e.x; b.knownZ = e.z; b.knownT = 0; } else b.knownT += dt;
    if (e.pingT > b.pingSeen) { b.pingSeen = e.pingT; b.knownX = e.pingX; b.knownZ = e.pingZ; b.see = Math.min(1.6, b.see + 0.5); b.knownT = 0; }
    b.underFire = Math.max(0, b.underFire - dt);

    // A helmet on a stick is a target until the bot has looked at it long enough to doubt it.
    let tx = sh.bx, ty = sh.by, tz = sh.bz, tvx = e.mvx, tvz = e.mvz, target = spotted;
    if (spotted) { if (!visBody || (skill > 0.65 && dist < 45)) { tx = sh.hx; ty = sh.hy; tz = sh.hz; } b.fooled = -1; }
    else {
      const decoys = G.decoys();
      for (let i = 0; i < decoys.length; i++) {
        const d = decoys[i];
        if (!d.alive || d.owner === p.i) { b.decoyLook[i] = 0; continue; }
        if (b.decoyLook[i] > 0.4 + 4 * (1 - skill)) continue;
        const dy = d.y + 1.38;
        if (Math.abs(angDiff(p.yaw, Math.atan2(-(d.x - p.x), -(d.z - p.z)))) > cone + 0.3 || !map.los(eye.x, eye.y, eye.z, d.x, dy, d.z, time)) continue;
        b.decoyLook[i] += dt;
        tx = d.x; ty = dy; tz = d.z; tvx = tvz = 0; target = true; b.fooled = i;
        break;
      }
    }

    // ---- where to be ----
    const hot = danger(p.x, p.z, hazard);
    const closing = sudden >= 0 && Math.abs(p.z) > map.safeZ(sudden + 3) - 2.5;
    let wx = 0, wz = 0, moving = false, wantCrouch = false, wantScope = false;
    if (hot > 0) {
      // Out of the ring by the shortest way; whatever else was planned can wait.
      const ax = p.x - hazard.x, az = p.z - hazard.z, al = Math.hypot(ax, az);
      if (al > 0.2) { wx = ax / al; wz = az / al; } else { wx = Math.cos(b.sweep); wz = Math.sin(b.sweep); }
      moving = true;
      if (b.state === 'hold') b.holdT = Math.max(b.holdT, b.holdMax - 0.6);
      b.path = null;
      b.state = 'flee';
    } else {
      if (b.state === 'flee') { b.state = 'hold'; if (b.post && !goTo(p, b, danger(b.post.x, b.post.z) ? choosePost(p, b, sudden) : b.post)) b.holdT = 99; }
      if (closing && b.state === 'hold') b.holdT = 99;
      if (b.state === 'hold') {
        // Patience runs out faster as the round goes on, and faster still from a post that
        // turns out to have no view of where the enemy was last seen.
        b.blindT = b.post && !target && !map.los(eye.x, b.post.y + EYE_STAND, eye.z, b.knownX, map.height(b.knownX, b.knownZ) + 1.2, b.knownZ, time, true) ? b.blindT + dt : 0;
        // With a view of it from inside 55 m, though, this is the ambush: stay on the glass and let them come up into it.
        const ambush = b.blindT === 0 && dist < 55 && b.knownT < 8 && b.underFire <= 0;
        b.holdT += dt * (ambush ? 0.3 : (time > 30 ? 2.2 : time > 14 ? 1.5 : 1) * (b.knownT > 9 ? 1.5 : 1) * (b.blindT > 1.2 ? 2.5 : 1));
        // (Trading shots the length of the square settles nothing: patience gone, the bot moves up even with the enemy in view.)
        // (From the opening post it wants to have had its shot first — within reason.)
        if (b.holdT > b.holdMax + (b.prev || b.shots ? 0 : 3.5) && (!target || closing || dist > 55) && p.bolt <= 0) {
          if (!goTo(p, b, choosePost(p, b, sudden))) { b.holdT = b.holdMax - 1.5; b.aggr = Math.min(1, b.aggr + 0.15); }
        }
      }
      if (b.state === 'move' && b.path) {
        // In the open and the enemy is in plain view: stop and take the shot. Rounds coming
        // back change that — then it is the next piece of cover first, unless it is too close to turn away.
        const halt = target && !closing && (b.underFire <= 0 || dist < 30);
        const wp = b.path[b.pi], ddx = wp.x - p.x, ddz = wp.z - p.z, dl = Math.hypot(ddx, ddz);
        if (dl < (b.pi === b.path.length - 1 ? 0.35 : 0.8)) {
          if (++b.pi >= b.path.length) {
            b.state = 'hold'; b.path = null; b.holdT = 0; b.peekT = 0.15 + rnd() * 0.5; b.peeking = false;
            b.holdMax = (5 - 3 * b.aggr) * (0.7 + rnd() * 0.6);
            // Plant the decoy, then leave it to do its work from the next post over.
            if (p.decoyCd <= 0 && b.post.kind !== 'high' && !target && rnd() < 0.5) { cmd.a2 = true; b.holdMax = 1.0 + rnd(); b.afterDecoy = true; }
          }
        } else if (!halt) { wx = ddx / dl; wz = ddz / dl; moving = true; }
        else { wantCrouch = dist > 26; wantScope = dist > 20; }
        if (moving) {
          b.stuckT += dt;
          if (b.stuckT > 0.6) {
            // Sliding along something instead of getting anywhere: plot the route again from
            // here, and if that does not help give up on that post altogether.
            if (Math.hypot(p.x - b.lx, p.z - b.lz) < 1.3 && (++b.stuckN > 1 || !goTo(p, b, b.post))) { b.stuckN = 0; if (!goTo(p, b, choosePost(p, b, sudden))) { b.state = 'hold'; b.holdT = 99; } }
            b.stuckT = 0; b.lx = p.x; b.lz = p.z;
          }
        } else { b.stuckT = 0; b.lx = p.x; b.lz = p.z; }
      }
      if (b.state === 'hold' && b.post) {
        const post = b.post, high = post.kind === 'high';
        // Glass the square for a few seconds, then get your head down for a couple.
        b.peekT -= dt;
        // The longer a round runs the less careful it gets: past a point it stops ducking to
        // work the bolt and barely takes its eye off the glass — which is your opening as much as its own.
        const bold = time > 7 + 5 * (1 - b.aggr);
        if (b.peekT <= 0) { b.peeking = !b.peeking; b.peekT = b.peeking ? 2.4 + rnd() * 2.6 : bold ? 0.3 : 0.5 + rnd() * (1.2 - b.aggr); }
        const up = (target || b.peeking) && (p.bolt <= 0.5 || bold) && p.reload <= 0; // down for the first half of the bolt, back up as it closes
        wantCrouch = post.kind === 'low' || (post.kind === 'pit' && !up) || (!post.kind && dist > 26);
        wantScope = up;
        // Behind tall cover: step out to the corner to look, back in to work the bolt.
        const gx = high && up ? post.px : post.x, ox = gx - p.x, oz = post.z - p.z, ol = Math.hypot(ox, oz);
        if (ol > 0.25) { wx = ox / ol; wz = oz / ol; moving = true; wantScope = wantScope && ol < 0.6; }
      }
    }

    // ---- where to look, and whether to shoot ----
    let wantYaw, wantPitch = 0;
    // Aim only when stopped (or at arm's length): a sniper caught moving runs for cover, rifle down.
    if (target && (hot <= 0 || sudden >= 0) && (!moving || dist < 24 || sudden >= 0)) {
      b.onT += dt;
      if (time < grace) b.onT = 0; // the first shot of a round is a snap shot, however long the title card gave it to stare
      // A remote sniper is drawn a little in the past: lead that much further.
      const ex = tx - eye.x, ez = tz - eye.z, d3 = Math.hypot(ex, ez) || 1, tf = d3 / G.V + (e.remote && b.fooled < 0 ? 0.15 : 0), lead = 0.6 + 0.4 * skill + b.leadErr;
      const ax = ex + tvx * tf * lead, az = ez + tvz * tf * lead, ah = Math.hypot(ax, az) || 1;
      const fall = d3 / G.V, ay = ty - eye.y + 0.5 * G.GRAV * fall * fall * (0.75 + 0.25 * skill) - G.ZERO * ah;
      // Aim error: a wandering offset that tightens the longer the sight picture is held.
      b.rollT -= dt;
      if (b.rollT <= 0) {
        // (A snap shot is a metre out at the far barricade; two seconds on the target and a
        // veteran holds a head's width at mid range, which is what makes peeking twice dangerous.)
        b.rollT = 0.35 + rnd() * 0.25;
        // Past the rifle's zero it is guessing hold-over like anyone else: the error grows faster than the range.
        const sig = ((0.02 - 0.012 * skill) * Math.exp(-b.onT / (0.6 - 0.3 * skill)) + 0.0034 - 0.0027 * skill) * (1 + (d3 / 200) ** 2);
        b.gY = gauss(rnd) * sig; b.gP = gauss(rnd) * sig * 0.7; b.leadErr = gauss(rnd) * 0.3 * (1 - skill);
      }
      const k = Math.min(1, dt * 5);
      b.errY += (b.gY - b.errY) * k; b.errP += (b.gP - b.errP) * k;
      wantYaw = Math.atan2(-ax, -az) + b.errY;
      wantPitch = Math.atan2(ay, ah) + b.errP;
      const needScope = d3 > 20;
      wantScope = needScope || (wantScope && !moving);
      const tol = 0.0015 + 0.004 * (1 - skill);
      const aligned = Math.abs(angDiff(p.yaw, wantYaw)) < tol && Math.abs(p.pitch - wantPitch) < tol;
      // (On the move only at close quarters, or when the barrage leaves no time to stop.)
      if (aligned && b.onT > b.react && (!needScope || p.scope > 0.93 || moving) && p.bolt <= 0 && p.reload <= 0 && p.ammo > 0 && (!moving || d3 < 24 || sudden >= 0)) {
        cmd.fire = true;
        b.shots++;
        // The next one waits for the sight picture to come back, not just for the bolt.
        b.onT = Math.min(b.onT, 0.5);
        b.react = b.onT + 1.1 + rnd() * 0.5 * (1.4 - skill);
        b.rollT = 0;
        // Shoot and scoot: a patient bot stays, most of the time; a shot at a decoy gave the game away.
        if (b.state === 'hold' && rnd() < 0.3) b.holdT = b.holdMax - 0.9;
      }
    } else {
      if (b.onT > 0) { b.onT = 0; b.react = 0.3 + (1 - skill) * 0.75 + rnd() * 0.3; b.rollT = 0; }
      b.sweep += dt * 0.9;
      if (moving && !wantScope) wantYaw = Math.atan2(-wx, -wz);
      else {
        const kb = Math.atan2(-(b.knownX - p.x), -(b.knownZ - p.z));
        wantYaw = kb + Math.sin(b.sweep) * (wantScope ? 0.07 : 0.5); // through the glass: a few metres either side of where they were
        wantPitch = Math.sin(b.sweep * 0.7) * 0.02 - (p.y > 1 ? 0.03 : 0);
      }
      // Under fire with open ground to cross: lay smoke towards them first.
      if (b.underFire > 0 && p.smokes > 0 && p.smokeCd <= 0 && b.state !== 'flee' && dist > 16) {
        wantYaw = bearing; wantPitch = 0.12;
        if (Math.abs(angDiff(p.yaw, bearing)) < 0.35) { cmd.a1 = true; b.underFire = 0; if (b.state === 'hold') b.holdT = Math.max(b.holdT, b.holdMax - 1.2); }
      }
    }
    const maxRate = (p.scope > 0.5 ? 1.0 + 1.9 * skill : 5 + 5 * skill) * dt, lam = 1 - Math.exp(-dt * (5 + 7 * skill));
    cmd.yaw = p.yaw + clamp(angDiff(p.yaw, wantYaw) * lam, -maxRate, maxRate);
    cmd.pitch = clamp(p.pitch + clamp((wantPitch - p.pitch) * lam, -maxRate, maxRate), -1.2, 1.2);
    if (moving) {
      const f = -Math.sin(cmd.yaw) * wx - Math.cos(cmd.yaw) * wz, s = Math.cos(cmd.yaw) * wx - Math.sin(cmd.yaw) * wz;
      cmd.mx = s; cmd.my = -f;
    }
    cmd.alt = wantScope && hot <= 0;
    cmd.crouch = wantCrouch && hot <= 0 && !(moving && b.state === 'move');
    return cmd;
  }

  return { create, think };
}
