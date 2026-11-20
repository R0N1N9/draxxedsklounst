// BREAK POINT — the rules: two boards, two rifles, the rounds in the air, the two tricks,
// and who can see whom. No drawing and no three.js in here (so the duel can be run by
// itself); everything that should be seen or heard goes out through `fx`.
import { clamp, lerp, damp, angDiff, smoothstep } from '../../kit.js';
import { segSegClosest } from '../../../util.js';
import { ARENA, shoreZ } from './sea.js';

export const LOOK = 0.0022;
export const R = {
  bulletV: 280, bulletG: 3, bolt: 1.2, reload: 2.2, mag: 4,
  acc: 6.5, vmax: 9.6, coast: 0.5, grav: 15, turn: 2.3, carry: 1.5, shove: 0.5,
  diveT: 1.05, diveV: 15, diveCd: 7, sprayCd: 13, sprayLife: 7.5, sprayHW: 9, sprayH: 6.5, sprayAhead: 7,
  eye: 1.52, eyeBrace: 1.05, top: 1.85, topBrace: 1.36, hitR: 0.46, spawnZ: 58, zoom: 2.8,
};
const LOS_N = 24;
export const SLOW = 0.35; // the core runs the kill moment at this speed
// The hand-off, in real seconds from the hit: the winner crouches, leaves the board, goes under.
export const KILL = { squat: 1.75, jump: 2.25, flight: 0.84, sink: 3.75, under: 4.2, end: 4.5 };

export function makeGame(ctx, sea, world, fx) {
  const flip = ctx.seed & 1, sx = 10 + (ctx.seed % 23);
  const P = [0, 1].map((i) => {
    const side = i ^ flip ? -1 : 1; // +1 = out to sea, -1 = the beach behind you
    return {
      i, side, x: side * sx, z: side * R.spawnZ, y: 0, vy: 0, air: false, hd: 0, v: 0, turn: 0, lean: 0, slope: 0, yaw: 0, pitch: 0,
      braced: false, brace: 0, dive: 0, diveCd: 0, wet: 0, sprayCd: 0, cut: 0, cutDir: 1, ammo: R.mag, bolt: 0, reload: 0,
      alive: true, dead: -1, swayX: 0, swayY: 0, swayT: i * 3.7, recoil: 0, flinch: 0, bumpCd: 0, shotT: -9, wake: 0, white: 0, push: 0, squat: 0,
      hop: { on: false, wet: false, t: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, phi: 0, k: 0 },
      remote: ctx.opponent === 'remote' && i !== ctx.me, bot: null, color: ctx.players[i].color,
      body: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rot: 0, spin: 0, wet: false }, brd: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rot: 0, spin: 0, wet: false },
      cmd: { mx: 0, my: 0, yaw: 0, pitch: 0, fire: false, alt: false, a1: false, a2: false },
    };
  });
  for (const p of P) {
    const e = P[1 - p.i];
    p.yaw = p.cmd.yaw = Math.atan2(-(e.x - p.x), -(e.z - p.z));
    p.hd = p.yaw + (Math.PI / 2) * p.side; // boards start side-on to each other, pointing opposite ways along the swell
    p.y = sea.height(p.x, p.z);
  }
  const me = P[ctx.me];
  const bullets = [];
  for (let i = 0; i < 8; i++) bullets.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ox: 0, oy: 0, oz: 0, owner: 0, judge: false, age: 0, skips: 0, near: false, run: 0, hip: false });
  const walls = [];
  for (let i = 0; i < 4; i++) walls.push({ on: false, x: 0, z: 0, nx: 0, nz: 1, t0: 0, t1: 0, owner: 0 });
  // What lies between the two snipers this frame: the surface along the line from one to the
  // other, and whether each can see the other's head / body over it.
  const los = { n: LOS_N, hs: new Float32Array(LOS_N + 1), see: [{ head: false, body: false }, { head: false, body: false }], wall: false, dist: 100, any: false, clearT: 0 };
  let T = 0, tick = 0, nextSetPrev = 99, killInfo = null;
  const cam = { on: false, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: -1 }; // the local human aims along the camera's ray (set by the view)
  const A = { x: 0, y: 0, z: 0 }, B = { x: 0, y: 0, z: 0 }, C = { x: 0, y: 0, z: 0 }, D = { x: 0, y: 0, z: 0 }, dir = { x: 0, y: 0, z: 0 };

  const eyeY = (p) => p.y + lerp(R.eye, R.eyeBrace, p.brace);
  const topY = (p) => p.y + lerp(R.top, R.topBrace, p.brace);
  const hidden = (p) => p.dive > 0; // under the surface: nothing can touch them
  const local = (p) => !p.remote;
  function aimDir(p, out) {
    const yaw = p.yaw + p.swayX, pitch = p.pitch + p.swayY, cp = Math.cos(pitch);
    out.x = -Math.sin(yaw) * cp; out.y = Math.sin(pitch); out.z = -Math.cos(yaw) * cp;
    return out;
  }
  // Distance along a ray to the water (bisected), or max.
  function rayWater(ox, oy, oz, dx, dy, dz, max) {
    let t0 = 0, t = 0;
    while (t < max) {
      t0 = t;
      t += t < 60 ? 3 : 7;
      if (oy + dy * t < sea.height(ox + dx * t, oz + dz * t)) {
        let a = t0, b = t;
        for (let i = 0; i < 5; i++) { const m = (a + b) / 2; if (oy + dy * m < sea.height(ox + dx * m, oz + dz * m)) b = m; else a = m; }
        return (a + b) / 2;
      }
    }
    return max;
  }
  // Does a spray wall stand between two points?
  function wallBlocks(ax, ay, az, bx, by, bz) {
    for (const w of walls) {
      if (!w.on || T > w.t1 - 0.8 || T < w.t0 + 0.25) continue;
      const da = (ax - w.x) * w.nx + (az - w.z) * w.nz, db = (bx - w.x) * w.nx + (bz - w.z) * w.nz;
      if (da * db >= 0) continue;
      const u = da / (da - db), px = ax + (bx - ax) * u, pz = az + (bz - az) * u, py = ay + (by - ay) * u;
      if (Math.abs((px - w.x) * -w.nz + (pz - w.z) * w.nx) < R.sprayHW && py < sea.height(w.x, w.z) + R.sprayH) return true;
    }
    return false;
  }

  function updateLos() {
    const a = P[0], b = P[1], n = LOS_N;
    for (let k = 0; k <= n; k++) { const u = k / n; los.hs[k] = sea.height(a.x + (b.x - a.x) * u, a.z + (b.z - a.z) * u); }
    const line = (y0, y1) => { for (let k = 1; k < n; k++) if (los.hs[k] > y0 + (y1 - y0) * (k / n)) return false; return true; };
    const e0 = eyeY(a), e1 = eyeY(b);
    los.see[0].head = line(e0, topY(b) - 0.12); los.see[0].body = line(e0, b.y + 0.75);
    los.see[1].head = line(topY(a) - 0.12, e1); los.see[1].body = line(a.y + 0.75, e1);
    los.wall = wallBlocks(a.x, e0, a.z, b.x, e1, b.z);
    los.dist = Math.hypot(b.x - a.x, b.z - a.z);
    los.any = !los.wall && !hidden(a) && !hidden(b) && (los.see[0].head || los.see[1].head);
  }
  // Can sniper i see the other one right now?
  const sees = (i) => !los.wall && !hidden(P[1 - i]) && !hidden(P[i]) && (los.see[i].head || los.see[i].body);

  // ---- shooting ----
  function spawnBullet(owner, ox, oy, oz, dx, dy, dz, judge) {
    const b = bullets.find((q) => !q.on) || bullets[0];
    b.on = true; b.owner = owner; b.judge = judge; b.age = 0; b.skips = 0; b.near = false; b.run = 0; b.hip = P[owner].brace < 0.5;
    b.x = b.ox = ox; b.y = b.oy = oy; b.z = b.oz = oz;
    b.vx = dx * R.bulletV; b.vy = dy * R.bulletV; b.vz = dz * R.bulletV;
    const p = P[owner];
    p.shotT = T;
    p.recoil = 1;
    world.ping(p.x, p.z, T);
    fx.shot(p, ox, oy, oz, dx, dy, dz);
  }
  function shoot(p) {
    const foe = P[1 - p.i], ey = eyeY(p), human = p === me && !p.bot && cam.on;
    let ox = p.x, oy = ey, oz = p.z;
    if (human) { ox = cam.x; oy = cam.y; oz = cam.z; dir.x = cam.dx; dir.y = cam.dy; dir.z = cam.dz; }
    else aimDir(p, dir);
    // The round leaves the muzzle, not the lens: send it to whatever the sight line lands on.
    let t = rayWater(ox, oy, oz, dir.x, dir.y, dir.z, 420);
    if (foe.alive && !hidden(foe)) {
      const cx = foe.x - ox, cy = foe.y + 0.9 - oy, cz = foe.z - oz, tc = cx * dir.x + cy * dir.y + cz * dir.z;
      if (tc > 3 && tc < t && (cx - dir.x * tc) ** 2 + (cy - dir.y * tc) ** 2 + (cz - dir.z * tc) ** 2 < 12) t = tc;
    }
    const tx = ox + dir.x * t, ty = oy + dir.y * t, tz = oz + dir.z * t;
    let dx = tx - p.x, dy = ty - ey, dz = tz - p.z;
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    dy += (R.bulletG * l) / (2 * R.bulletV * R.bulletV); // (the sight is honest: hold-over for the drop is built in)
    const mx = p.x + dx * 0.9, my = ey + dy * 0.9 - 0.05, mz = p.z + dz * 0.9;
    spawnBullet(p.i, mx, my, mz, dx, dy, dz, true);
    p.ammo--;
    if (p.ammo > 0) p.bolt = R.bolt; else p.reload = R.reload;
    ctx.net.send({ k: 's', o: [+mx.toFixed(2), +my.toFixed(2), +mz.toFixed(2)], d: [+dx.toFixed(4), +dy.toFixed(4), +dz.toFixed(4)] });
  }

  function stepBullets(dt) {
    for (let n = 0; n < bullets.length; n++) {
      const b = bullets[tick ? bullets.length - 1 - n : n];
      if (!b.on) continue;
      let rem = dt, guard = 0;
      while (rem > 1e-5 && b.on && guard++ < 40) {
        const sp = Math.hypot(b.vx, b.vy, b.vz), h = Math.min(rem, 3.4 / sp);
        const mx = b.vx * h, my = b.vy * h - 0.5 * R.bulletG * h * h, mz = b.vz * h, len = Math.hypot(mx, my, mz), dx = mx / len, dy = my / len, dz = mz / len;
        const foe = P[1 - b.owner];
        // water
        let tW = Infinity;
        if (b.y + my < sea.height(b.x + mx, b.z + mz)) {
          let lo = 0, hi = 1;
          for (let i = 0; i < 4; i++) { const m = (lo + hi) / 2; if (b.y + my * m < sea.height(b.x + mx * m, b.z + mz * m)) hi = m; else lo = m; }
          tW = lo * len;
        }
        // creatures and buoys
        const st = world.strike(b.x, b.y, b.z, dx, dy, dz, len), tC = st ? st.t : Infinity;
        // the other sniper (only the shooter's own client judges)
        let tH = Infinity;
        if (foe.alive && !hidden(foe)) {
          A.x = b.x; A.y = b.y; A.z = b.z; B.x = b.x + mx; B.y = b.y + my; B.z = b.z + mz;
          C.x = D.x = foe.x; C.z = D.z = foe.z; C.y = foe.y + 0.3; D.y = topY(foe) - R.hitR * 0.7;
          const r = segSegClosest(A, B, C, D);
          if (b.judge && ctx.phase === 'live' && r.d2 < R.hitR * R.hitR && !(P[b.owner].bot && T < 10)) tH = Math.max(0, r.s * len - Math.sqrt(R.hitR * R.hitR - r.d2));
          else if (!b.near && r.d2 < 9 && b.run > 6) { b.near = true; foe.flinch = Math.max(foe.flinch, 0.7); if (foe.bot) foe.bot.underFire = 2.4; fx.near(foe, b); }
        }
        const first = Math.min(tW, tC, tH);
        if (tH <= first && tH < Infinity) {
          b.on = false;
          const range = Math.round(Math.hypot(foe.x - b.ox, foe.z - b.oz));
          const how = b.skips > 0 ? `SKIPPED IN · ${range} M` : foe.air ? `MID-AIR · ${range} M` : P[b.owner].air ? `AIRBORNE · ${range} M` : b.hip && range > 40 ? `OFF THE BOARD · ${range} M` : `${range} M`;
          killInfo = { v: foe.i, dx, dy, dz };
          ctx.net.send({ k: 'k', v: foe.i, d: [+dx.toFixed(3), +dy.toFixed(3), +dz.toFixed(3)] });
          ctx.kill(foe.i, { how });
        } else if (tC <= first && tC < Infinity) {
          b.on = false;
          fx.boop(st.kind, st.i, b.x + dx * tC, b.y + dy * tC, b.z + dz * tC, b.owner);
        } else if (tW < Infinity) {
          const ix = b.x + dx * tW, iz = b.z + dz * tW, iy = sea.height(ix, iz);
          const sxl = sea.slope(ix, iz, 1, 0), szl = sea.slope(ix, iz, 0, 1), nl = Math.hypot(sxl, 1, szl), nx = -sxl / nl, ny = 1 / nl, nz = -szl / nl;
          const sinG = -(dx * nx + dy * ny + dz * nz);
          if (sinG < 0.2 && b.skips < 4 && sp > 110 && ix * ix + iz * iz < 250000) {
            // A flat round skips: off the face at the angle it came in, a little slower each time.
            const k = 2 * (dx * nx + dy * ny + dz * nz), v = sp * 0.84;
            b.vx = (dx - k * nx) * v; b.vy = (dy - k * ny) * v + 1.5; b.vz = (dz - k * nz) * v;
            b.x = ix + nx * 0.05; b.y = iy + 0.05; b.z = iz + nz * 0.05;
            b.skips++;
            fx.skip(ix, iy, iz, dx, dz, b.skips, b.owner);
            rem -= h * (tW / len);
          } else { b.on = false; fx.plunge(ix, iy, iz, b.owner); }
        } else {
          b.x += mx; b.y += my; b.z += mz;
          b.vy -= R.bulletG * h;
          b.age += h; b.run += len;
          rem -= h;
          if (b.age > 2.3 || b.z < shoreZ(b.x) - 4) { b.on = false; if (b.z < shoreZ(b.x)) fx.sand(b.x, b.y, b.z); }
        }
      }
    }
  }

  // ---- one sniper, one slice of time ----
  function step(p, cmd, dt) {
    p.yaw = cmd.yaw;
    p.pitch = cmd.pitch;
    p.recoil = Math.max(0, p.recoil - dt * 4.5);
    p.flinch = Math.max(0, p.flinch - dt * 1.3);
    if (!p.alive) return;
    const live = ctx.phase === 'live';
    p.braced = live && cmd.alt && p.dive <= 0 && !p.air && p.wet <= 0;
    p.brace = damp(p.brace, p.braced ? 1 : 0, 11, dt);
    const fxh = -Math.sin(p.hd), fzh = -Math.cos(p.hd);
    p.slope = sea.slope(p.x, p.z, fxh, fzh);
    // The aim rides the board: it wanders with speed and turning, and tips with the face under you.
    p.swayT += dt;
    const t = p.swayT, br = p.brace, ride = Math.min(1, p.v / 10), yawRel = p.yaw - p.hd;
    const rough = (1 - br) * (0.006 + 0.012 * ride + 0.02 * Math.min(1, Math.abs(p.turn) / 2)) + br * 0.0016 + (p.air ? 0.04 : 0) + p.flinch * 0.02 + (p.wet > 0 ? 0.03 : 0) + (p.bolt > 0 ? 0.006 : 0);
    const tip = -p.slope * Math.cos(yawRel) * lerp(0.1, 0.022, br);
    p.swayX = rough * (Math.sin(t * 1.7 + p.i) + 0.55 * Math.sin(t * 3.9 + 2 * p.i));
    p.swayY = rough * (0.85 * Math.cos(t * 2.1 + 2 * p.i) + 0.5 * Math.sin(t * 4.7)) + tip;
    if (!live) { p.v = 0; p.turn = 0; p.y = sea.height(p.x, p.z); p.lean = damp(p.lean, 0, 6, dt); return; }

    p.diveCd = Math.max(0, p.diveCd - dt);
    p.sprayCd = Math.max(0, p.sprayCd - dt);
    p.bumpCd = Math.max(0, p.bumpCd - dt);
    p.wet = Math.max(0, p.wet - dt);
    if (p.bolt > 0) p.bolt -= dt;
    if (p.reload > 0) { p.reload -= dt; if (p.reload <= 0) { p.ammo = R.mag; fx.reloaded(p); } }

    // Steering: the stick says where you want to go (relative to where you are looking);
    // the board carves round to it.
    let f = -cmd.my, s = cmd.mx, mag = Math.hypot(f, s);
    if (mag > 1) { f /= mag; s /= mag; mag = 1; }
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    let want = p.hd, rate = R.turn * (p.dive > 0 ? 0.55 : 1);
    if (p.cut > 0) { p.cut -= dt; want = p.yaw + (Math.PI / 2) * p.cutDir; rate = 7; mag = Math.max(mag, 0.4); }
    else if (mag > 0.15 && !p.braced) want = Math.atan2(-(-sy * f + cy * s), -(-cy * f - sy * s));
    const turn = p.air ? 0 : clamp(angDiff(p.hd, want), -rate * dt, rate * dt);
    p.hd += turn;
    p.turn = damp(p.turn, dt > 0 ? turn / dt : 0, 14, dt);
    p.lean = damp(p.lean, clamp(p.turn * 0.3, -0.75, 0.75), 9, dt);

    if (p.dive > 0) {
      p.dive -= dt;
      p.v = R.diveV;
      if (p.dive <= 0) { p.dive = 0; p.wet = 0.5; p.v = 8.5; p.air = true; p.y = sea.height(p.x, p.z); p.vy = 4.2; fx.dive(p, 1); }
    } else {
      const thrust = p.braced ? 0 : mag > 0.15 ? mag : 0;
      const a = thrust * R.acc - (R.acc / (R.vmax * R.vmax)) * p.v * p.v - R.coast * p.v * (1 - thrust) - (p.braced ? 1.6 * p.v : 0) - (p.air ? 0 : R.grav * p.slope) - Math.abs(p.turn) * p.v * 0.1;
      p.v = clamp(p.v + a * dt, 0, 17);
    }
    // The sea moves you. The surface runs forward on every crest and back in every trough,
    // and where a crest is breaking (the white water you can see) it takes the board with it,
    // drags at it and shakes it. All of it is a function of place and time: read it, pick a line.
    const fx2 = -Math.sin(p.hd), fz2 = -Math.cos(p.hd);
    p.x += fx2 * p.v * dt; p.z += fz2 * p.v * dt;
    if (p.dive <= 0 && !p.air) {
      const fl = sea.flow(p.x, p.z), white = smoothstep(0.72, 0.36, fl.fold);
      p.white = damp(p.white, white, 9, dt);
      const cx = fl.vx * R.carry + fl.bx * p.white * R.shove, cz = fl.vz * R.carry + fl.bz * p.white * R.shove;
      p.x += cx * dt; p.z += cz * dt;
      p.push = cx * fx2 + cz * fz2; // how hard the water is helping (+) or fighting (-) your line
      if (p.white > 0.05) {
        p.v *= Math.exp(-1.1 * p.white * dt);
        p.hd += Math.sin(T * 7.3 + p.i * 2.1) * 0.9 * p.white * dt;
        p.flinch = Math.max(p.flinch, p.white * 0.55);
      }
    } else { p.white = damp(p.white, 0, 9, dt); p.push = 0; }
    // The buoy line: the rip takes you back in. (It closes in sudden death.)
    const ring = world.ring, e = Math.hypot(p.x / (ARENA.rx * ring), p.z / (ARENA.rz * ring));
    if (e > 1) { const k = (1 - 1 / e) * Math.min(1, dt * (ctx.sudden ? 3.2 : 2.2)); p.x -= p.x * k; p.z -= p.z * k; if (e > 1.12) p.v *= Math.max(0, 1 - dt * 1.5); }
    // Keep the two boards from riding through each other.
    const o = P[1 - p.i], ddx = p.x - o.x, ddz = p.z - o.z, dd = Math.hypot(ddx, ddz);
    if (dd < 3 && dd > 0.01 && o.alive) { p.x += (ddx / dd) * (3 - dd) * 0.5; p.z += (ddz / dd) * (3 - dd) * 0.5; }

    // Riding the surface — or leaving it, off a sharp crest at speed.
    const hs = sea.height(p.x, p.z);
    if (p.dive > 0) { p.y = hs; p.vy = 0; p.air = false; }
    else if (p.air) {
      p.vy -= 13 * dt;
      p.y += p.vy * dt;
      if (p.y <= hs) { const hitV = -p.vy; p.y = hs; p.air = false; p.vy = 0; fx.land(p, hitV); p.flinch = Math.max(p.flinch, Math.min(0.8, hitV * 0.08)); }
    } else {
      const vs = dt > 0 ? (hs - p.y) / dt : 0;
      // The face fell away faster than a board can follow: you are flying.
      if (vs < p.vy - 8 * dt - 0.35 && p.vy > 1.4 && p.v > 7.5 && !p.braced) {
        p.y += p.vy * dt;
        if (p.y > hs + 0.02) { p.air = true; fx.launch(p); } else { p.y = hs; p.vy = vs; }
      } else { p.y = hs; p.vy = vs; }
    }
    p.wake += p.v * dt;

    // The tricks.
    if (cmd.a1 && p.diveCd <= 0 && p.dive <= 0 && !p.air) {
      p.dive = R.diveT; p.diveCd = R.diveCd; p.braced = false;
      fx.dive(p, 0);
      ctx.net.send({ k: 'dv', x: +p.x.toFixed(1), z: +p.z.toFixed(1) });
    }
    if (cmd.a2 && p.sprayCd <= 0 && p.dive <= 0) {
      p.sprayCd = R.sprayCd;
      // A hard cutback across your own line of sight throws the curtain up in front of you.
      const rel = angDiff(p.yaw, p.hd);
      p.cutDir = rel >= 0 ? 1 : -1;
      p.cut = 0.38;
      p.v = Math.max(p.v * 0.7, 5);
      const nx = -sy, nz = -cy, x = p.x + nx * R.sprayAhead, z = p.z + nz * R.sprayAhead;
      addWall(p.i, x, z, nx, nz);
      ctx.net.send({ k: 'sp', x: +x.toFixed(1), z: +z.toFixed(1), nx: +nx.toFixed(3), nz: +nz.toFixed(3) });
    }
    if (cmd.fire) {
      if (p.bolt <= 0 && p.reload <= 0 && p.ammo > 0 && p.dive <= 0 && p.wet <= 0) shoot(p);
      else if (p === me && !p.bot) fx.dry(p);
    }
  }
  function addWall(owner, x, z, nx, nz) {
    let w = walls.find((q) => !q.on);
    if (!w) { w = walls[0]; for (const q of walls) if (q.t0 < w.t0) w = q; }
    w.on = true; w.owner = owner; w.x = x; w.z = z; w.nx = nx; w.nz = nz; w.t0 = T; w.t1 = T + R.sprayLife;
    fx.spray(w);
  }

  function puppet(p, dt) {
    const r = ctx.net.remote;
    p.recoil = Math.max(0, p.recoil - dt * 4.5);
    if (!r || !p.alive) return;
    const px = p.x, pz = p.z;
    p.x = r.x; p.z = r.z; p.y = r.y; p.hd = r.hd; p.yaw = r.yaw; p.pitch = r.pitch; p.v = r.v; p.lean = r.ln;
    p.turn = r.ln / 0.3;
    p.braced = !!r.br; p.brace = damp(p.brace, r.br ? 1 : 0, 11, dt);
    p.air = !!r.ai;
    const was = p.dive > 0;
    p.dive = r.dv ? 0.5 : 0;
    if (was && !p.dive) fx.dive(p, 1);
    p.ammo = Math.round(r.am); p.reload = r.rl ? 1 : 0;
    p.wake += Math.hypot(p.x - px, p.z - pz);
    p.slope = p.air || p.dive ? 0 : sea.slope(p.x, p.z, -Math.sin(p.hd), -Math.cos(p.hd));
  }

  // ---- the kill, and the hand-off ----
  // One continuous beat on its own clock (real seconds; the sea keeps running in slow motion):
  // the board fires into the sky and the loser tumbles down the face into the water; the
  // winner watches them go under, crouches, and dives in after them head first.
  const kill = { on: false, t: 0, v: null, w: null, ux: 0, uz: 1, x: 0, y: 0, z: 0, splashed: false, ex: 0, ey: 0, ez: 0 };
  function fell(v) {
    const w = P[1 - v.i], ki = killInfo && killInfo.v === v.i ? killInfo : null;
    let dx = v.x - w.x, dz = v.z - w.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    if (ki) { const kl = Math.hypot(ki.dx, ki.dz) || 1; if (kl > 0.2) { dx = ki.dx / kl; dz = ki.dz / kl; } }
    v.alive = false; v.dead = 0; v.braced = false; v.dive = 0; v.air = false;
    w.braced = false; w.dive = 0; w.v = 0;
    const b = v.body, s = v.brd;
    // knocked off the back of the board, down the face of whatever they were riding
    const fl = sea.flow(v.x, v.z), sxl = sea.slope(v.x, v.z, 1, 0), szl = sea.slope(v.x, v.z, 0, 1);
    b.x = v.x; b.y = v.y + 0.95; b.z = v.z; b.vx = dx * 3.2 - sxl * 9 + fl.vx; b.vy = 4.6; b.vz = dz * 3.2 - szl * 9 + fl.vz; b.rot = 0; b.spin = 7.5; b.wet = false;
    s.x = v.x; s.y = v.y + 0.2; s.z = v.z; s.vx = -dx * 2.2 + dz * 1.5; s.vy = 25; s.vz = -dz * 2.2 - dx * 1.5; s.rot = 0; s.spin = 17; s.wet = false;
    kill.on = true; kill.t = 0; kill.v = v; kill.w = w; kill.splashed = false;
    kill.ux = (v.x - w.x) / l; kill.uz = (v.z - w.z) / l;
    kill.x = v.x; kill.y = v.y; kill.z = v.z;
    kill.ex = w.x + kill.ux * 4.4; kill.ez = w.z + kill.uz * 4.4; kill.ey = sea.height(kill.ex, kill.ez); // (refined when the winner lands)
    stepDead(v, 0.07); // the first frame of it already has everything in the air
    fx.wipeout(v, dx, dz);
  }
  function stepDead(p, dt) {
    p.dead += dt;
    for (const o of [p.body, p.brd]) {
      if (o.wet) continue;
      o.vy -= (o === p.brd ? 15 : 13) * dt;
      o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
      o.rot += o.spin * dt;
      const hs = sea.height(o.x, o.z);
      if (o.vy < 0 && o.y < hs - 0.25) {
        o.wet = true;
        if (o === p.body) { kill.splashed = true; kill.x = o.x; kill.y = hs; kill.z = o.z; }
        fx.splashDown(o.x, hs, o.z, o === p.body ? 1 : 0.6, o === p.body);
      }
    }
  }
  // dt here is real time: the choreography does not run in the core's slow motion.
  function stepKill(dt) {
    const k = kill, w = k.w, v = k.v, t = (k.t += dt);
    stepDead(v, dt * lerp(0.42, 1, smoothstep(0.7, 1.4, t)));
    w.recoil = Math.max(0, w.recoil - dt * 4.5);
    w.brace = damp(w.brace, 0, 8, dt);
    w.lean = damp(w.lean, 0, 6, dt);
    w.squat = smoothstep(KILL.squat, KILL.jump, t) * (1 - smoothstep(KILL.jump, KILL.jump + 0.12, t));
    w.yaw += angDiff(w.yaw, Math.atan2(-k.ux, -k.uz)) * Math.min(1, dt * 5);
    w.pitch = damp(w.pitch, -0.05, 4, dt);
    w.swayX = w.swayY = 0;
    const h = w.hop;
    if (!h.on) {
      w.y = sea.height(w.x, w.z);
      w.slope = sea.slope(w.x, w.z, -Math.sin(w.hd), -Math.cos(w.hd));
      if (t >= KILL.jump) {
        h.on = true; h.wet = false; h.t = 0; h.x = w.x; h.y = w.y + 0.8; h.z = w.z; h.yaw = Math.atan2(-k.ux, -k.uz);
        h.vx = k.ux * 5.4; h.vy = 4.9; h.vz = k.uz * 5.4;
        fx.spring(w);
      }
      return;
    }
    h.t += dt;
    h.k = Math.min(1, h.t / 0.22);
    h.phi = Math.min(2.45, 2.3 * (h.t / KILL.flight) ** 1.6); // over the top and in head first
    if (!h.wet) {
      h.vy -= 13.5 * dt;
      const hs = sea.height(h.x, h.z);
      if (h.vy < 0 && h.y < hs + 0.35) { h.wet = true; k.ex = h.x; k.ey = hs; k.ez = h.z; fx.header(h.x, hs, h.z); }
    } else { const d = Math.exp(-2.2 * dt); h.vx *= d; h.vy = Math.max(h.vy * d, -4.5); h.vz *= d; }
    h.x += h.vx * dt; h.y += h.vy * dt; h.z += h.vz * dt;
    // the board they left behind just rides the swell
    w.y = sea.height(w.x, w.z);
    w.slope = sea.slope(w.x, w.z, -Math.sin(w.hd), -Math.cos(w.hd));
  }

  const G = {
    P, me, bullets, walls, los, cam, R, kill,
    get T() { return T; },
    eyeY, topY, hidden, sees, aimDir, rayWater, wallBlocks, addWall, fell,
    set killInfo(v) { killInfo = v; },
    get killInfo() { return killInfo; },
    remoteShot(o, d) { spawnBullet(1 - ctx.me, o[0], o[1], o[2], d[0], d[1], d[2], false); },
    // One slice of the round. `cmdFor(p, dt)` supplies each locally simulated sniper's command.
    frame(dt, now, cmdFor) {
      T = now;
      sea.at(T);
      world.at(T);
      tick ^= 1; // neither sniper always moves first
      if (kill.on) stepKill(Math.min(0.1, dt / SLOW));
      else for (let n = 0; n < 2; n++) {
        const p = P[n ^ tick];
        if (p.remote) puppet(p, dt); else step(p, cmdFor(p, dt), dt);
      }
      if (ctx.phase !== 'intro') stepBullets(dt);
      updateLos();
      los.clearT = los.any ? los.clearT + dt : 0;
      for (const w of walls) if (w.on && T > w.t1) w.on = false;
      if (ctx.phase === 'live') {
        // The ship sounds its horn when a set wave is on its way in.
        const ns = sea.nextSet();
        if (nextSetPrev > 9 && ns <= 9 && sea.calm > 0.6) fx.horn();
        nextSetPrev = ns;
        // The fin: a nudge, never a bite.
        const fin = world.fin;
        if (fin.up) for (const p of P) {
          if (!local(p) || !p.alive || p.bumpCd > 0 || p.dive > 0 || p.air) continue;
          if (Math.hypot(p.x - fin.x, p.z - fin.z) < 2.7) {
            p.bumpCd = 5; p.air = true; p.vy = 6.2; p.v *= 0.45; p.hd += (p.i ? 0.9 : -0.9); p.flinch = 1;
            fx.bump(p);
          }
        }
      }
    },
  };
  updateLos();
  return G;
}
