// IRON AUTUMN — the world's interference, run off the round clock so both clients see the
// same thing: the walking barrage, parachute flares, the bell, the wall that comes down,
// and (in sudden death) the barrage closing on the fountain. Plus the war in the background,
// which is only decoration and may be as random as it likes.
import { clamp } from '../../kit.js';
import { SHELL_WARN, SHELL_LETHAL, FLARE_BURN, HALF_L } from './map.js';

const hash = (n, s) => { let h = Math.imul(n + 1, 374761393) ^ Math.imul(s | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export function makeEvents(ctx, map, fx, sfx, town, afterMesh, atmos, G, Q) {
  const shells = map.shells, flares = map.flares, strokes = map.bellStrokes, fw = map.fallWall;
  const pending = [], dangers = [], flareNow = [{ x: 0, y: 0, z: 0, on: 0 }, { x: 0, y: 0, z: 0, on: 0 }];
  const wallRings = [-15.6, -12.6, -9.6, -7.2].map((x) => ({ x, z: 0, r: 1.3 }));
  // Houses still burning behind the frontages: their glow comes through the windows.
  const fires = [[-34, 4.5, -24], [-35, 5.5, 36], [34.5, 6, 46], [35, 5, -47]].map(([x, y, z], i) => ({ x: x + hash(i, ctx.seed) * 3 - 1.5, y, z: z + hash(i + 9, ctx.seed) * 8 - 4 }));
  let warnI = 0, bellI = 0, flareI = 0, lastStroke = -99, collapsed = false, creakT = 0, sudN = 0, persT = 0, lastShell = false;
  let trail = 0, ambT = 0, fireT = 0, flakT = 2, droneT = 0, warT = 1.5, flakGlow = 0, flakX = 0, flakY = 300, flakZ = 0;

  function explode(s) {
    const { x, y, z } = s;
    fx.flash(x, y + 0.8, z, 1, 0.6, 0.28, 10, 0.24);
    for (let i = 0; i < 6; i++) { const a = Math.random() * 6.28, v = 1 + Math.random() * 3; fx.smoke(x, y + 0.6, z, Math.cos(a) * v, 3 + Math.random() * 5, Math.sin(a) * v, 1.6, 2.6, 1.1 + Math.random() * 0.6, 0.9, 0.2, 0.17, 0.14, 1, 1, 1.6, 0.5); }
    for (let i = 0; i < 9; i++) { const a = Math.random() * 6.28, v = Math.random() * 2.2; fx.smoke(x, y + 0.5, z, Math.cos(a) * v, 6 + Math.random() * 9, Math.sin(a) * v, 1.3, 2.2, 2.2 + Math.random() * 1.6, 0.8, 0.16, 0.13, 0.1, 0, 0.6, 1.5, -1.2); }
    for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.28, v = 7 + Math.random() * 4; fx.smoke(x, y + 0.4, z, Math.cos(a) * v, 0.6, Math.sin(a) * v, 1.2, 2.8, 1.6 + Math.random(), 0.5, 0.42, 0.37, 0.3, 0, 0.5, 2.6, 0.3); }
    for (let i = 0; i < 4; i++) fx.smoke(x + Math.random() - 0.5, y + 1, z + Math.random() - 0.5, 0, 1.2, 0, 2.2, 0.7, 6 + Math.random() * 3, 0.42, 0.12, 0.11, 0.1, 0, 0.3, 0.4, 0.5);
    for (let i = 0; i < 30; i++) { const a = Math.random() * 6.28, v = 2 + Math.random() * 9; fx.clods.emit(x, y + 0.3, z, Math.cos(a) * v, 5 + Math.random() * 11, Math.sin(a) * v, 1.6 + Math.random() * 1.2, 0.07 + Math.random() * 0.1, 0.12, 0.1, 0.08, 14); }
    for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28, v = 4 + Math.random() * 12; fx.sparks.emit(x, y + 0.4, z, Math.cos(a) * v, 3 + Math.random() * 12, Math.sin(a) * v, 0.5 + Math.random() * 0.7, 0.07, 6, 2.4, 0.6, 12); }
    fx.scorch(x, y, z, 6.5 + Math.random() * 2);
    G.shake(sfx.shell(x, y, z), x, z);
    G.blast(x, y, z, s.r || SHELL_LETHAL, s.how || 'ARTILLERY');
  }

  // A shell that is on its way: marker on the ground, whistle in the air.
  function incoming(s, warn) {
    s.warn = warn;
    pending.push(s);
    sfx.whistle(s.x, s.z, Math.max(0.3, s.t - G.time()));
  }

  return {
    dangers, flareNow, pending,
    // A shell called down on the remote sniper (their client told us): draw it, never judge it.
    remoteShell(x, z, t) { incoming({ t, x, z, y: map.floorAt(x, z, 3, G.time()), r: 0.01 }, 1); },
    update(dt, time, wt, cam) {
      // ---- the timetable: scheduled salvos ----
      while (warnI < shells.length && shells[warnI].t - SHELL_WARN <= time) incoming(shells[warnI++], SHELL_WARN);
      // ---- sudden death: the barrage closes in from both ends ----
      const ts = G.suddenT();
      if (ts >= 0) {
        for (; sudN < 400; sudN++) {
          const at = 1.4 + sudN * 0.3;
          if (at - 1.3 > ts) break;
          const edge = map.safeZ(at), side = sudN & 1 ? 1 : -1;
          const z = side * clamp(edge + 1.6 + hash(sudN, ctx.seed) * 13, 0, HALF_L - 1), x = -28 + hash(sudN + 977, ctx.seed) * 57;
          incoming({ t: time + (at - ts), x, z, y: map.floorAt(x, z, 3, time), how: 'THE BARRAGE' }, 1.3);
        }
        // Anyone still outside gets a shell with their name on it.
        persT -= dt;
        if (persT <= 0) {
          persT = 1.0;
          const edge = map.safeZ(ts) + 1.5;
          G.eachLocal((p) => {
            if (Math.abs(p.z) < edge && ts < 27) return;
            const x = p.x + p.mvx * 0.5, z = p.z + p.mvz * 0.5;
            incoming({ t: time + 0.95, x, z, y: map.floorAt(x, z, p.y + 0.5, time), how: 'THE BARRAGE' }, 0.95);
            ctx.net.send({ k: 'ps', x: +x.toFixed(1), z: +z.toFixed(1), t: +(time + 0.95).toFixed(2) });
          });
        }
        if (ts > 31 && !lastShell) { lastShell = true; G.lastShell(); }
      }
      dangers.length = 0;
      for (let i = pending.length - 1; i >= 0; i--) {
        const s = pending[i];
        if (time >= s.t) { explode(s); pending.splice(i, 1); continue; }
        const k = clamp(1 - (s.t - time) / s.warn, 0, 1);
        if (!s.r) s.r = SHELL_LETHAL;
        fx.marker(s.x, s.y + 0.12, s.z, Math.max(SHELL_LETHAL, s.r), k, 0.75 + 0.25 * k);
        fx.tracer(s.x, s.y + 22 * (1 - k) + 0.5, s.z, s.x, s.y, s.z, 2.6 * (0.3 + k), 0.5 * (0.3 + k), 0.12, 0.07); // a thread of light down to the spot
        dangers.push(s);
      }
      // ---- the wall ----
      town.setCollapse(time);
      const tw = time - fw.t;
      if (tw > -fw.warn && tw < 0) {
        for (const r of wallRings) dangers.push(r);
        creakT -= dt;
        if (creakT <= 0) { creakT = 0.5 + Math.random() * 0.5; sfx.creak(); }
        if (Math.random() < dt * 30) { const x = fw.x0 + Math.random() * (fw.x1 - fw.x0); fx.smoke(x, fw.h * (0.5 + Math.random() * 0.5), (Math.random() - 0.5) * 0.8, 0, -1.5, 0, 0.5, 0.8, 1.6, 0.4, 0.5, 0.46, 0.4, 0, 0.3, 0.3, -2.5); }
      } else if (tw >= 0 && !collapsed) {
        collapsed = true;
        sfx.collapse();
        for (let i = 0; i < 30; i++) { const x = fw.x0 + Math.random() * (fw.x1 - fw.x0), sz = Math.random() < 0.5 ? -1 : 1; fx.smoke(x, 0.5 + Math.random() * 3, sz * Math.random(), (Math.random() - 0.5) * 2, 0.8 + Math.random() * 1.5, sz * (1 + Math.random() * 3), 2, 1.6, 4 + Math.random() * 4, 0.6, 0.5, 0.46, 0.4, 0, 0.3, 1.1, 0.25); }
        for (let i = 0; i < 24; i++) fx.clods.emit(fw.x0 + Math.random() * (fw.x1 - fw.x0), 1 + Math.random() * 5, 0, (Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 7, 1.5, 0.12, 0.3, 0.24, 0.2, 12);
        // The dust hangs for a few seconds: nobody sees through it, bot or human.
        for (const x of [-15, -11.5, -8]) map.smokes.push({ x, y: 2, z: 0, r: 4.2, t0: fw.t, t1: fw.t + 7 });
        G.shake(0.5, -11.5, 0);
        G.eachLocal((p) => { if (p.x > fw.x0 - 0.7 && p.x < fw.x1 + 0.7 && Math.abs(p.z) < 2.3 && p.y < 3) G.env(p, 'BURIED', p.x, 3, 0); });
      }
      afterMesh.visible = tw > 0.9;
      // ---- flares ----
      while (flareI < flares.length && flares[flareI].t <= time) { sfx.flare(flares[flareI].x, flares[flareI].z); flareI++; }
      flareNow[0].on = flareNow[1].on = 0;
      for (let i = Math.max(0, flareI - 4); i < flareI; i++) {
        const f = flares[i], u = time - f.t - 0.9;
        if (u < 0 || u > FLARE_BURN) continue;
        const n = flareNow[i & 1];
        n.x = f.x + Math.sin(u * 0.7 + f.sw) * 1.6; n.y = 36 - 2.8 * u; n.z = f.z + Math.cos(u * 0.55 + f.sw) * 1.6;
        n.on = Math.min(1, u / 0.3) * Math.min(1, (FLARE_BURN - u) / 1.4);
      }
      if (ts >= 0 && !flareNow[0].on) { const n = flareNow[0]; n.x = Math.sin(wt * 0.4) * 2; n.y = 24 + Math.sin(wt * 0.7); n.z = Math.cos(wt * 0.3) * 2; n.on = Math.min(1, ts / 1.5); }
      trail -= dt;
      for (let i = 0; i < 2; i++) {
        const n = flareNow[i], l = fx.flareLights[i], fl = 0.82 + 0.18 * Math.sin(wt * 37 + i * 2) * Math.sin(wt * 23.3);
        l.intensity = n.on * 2600 * fl;
        if (!n.on) continue;
        l.position.set(n.x, n.y, n.z);
        fx.glow(n.x, n.y, n.z, 7 * fl, 7 * n.on, 6.2 * n.on, 4.6 * n.on);
        fx.star(n.x, n.y, n.z, 13 * fl, 3 * n.on, 2.7 * n.on, 2.1 * n.on, wt * 0.2);
        if (!Q.rich) fx.glow(n.x, 1.5, n.z, 46, 0.42 * n.on * fl, 0.38 * n.on * fl, 0.28 * n.on * fl); // no light to cast: a pool of glow on the ground instead
        if (trail <= 0) fx.smoke(n.x, n.y + 0.6, n.z, 0, 1.6, 0, 0.6, 0.7, 3.2, 0.3, 0.85, 0.82, 0.74, 0.25, 0.4, 0.3, 0.4);
      }
      if (trail <= 0) trail = 0.14;
      // ---- the bell ----
      while (bellI < strokes.length && strokes[bellI] <= time) { lastStroke = strokes[bellI++]; sfx.bell(); }
      const bt = time - lastStroke, swing = bt < 14 ? 0.5 * Math.sin(bt * 3.6) * Math.exp(-bt * 0.42) : 0;
      town.bell.rotation.x = swing;
      town.bell.userData.clapper.rotation.x = -swing * 1.7;

      // ---- decoration: fires, the wrecks smouldering, flak, the war over the hill ----
      ambT -= dt;
      if (ambT <= 0) {
        ambT = 0.45;
        for (const z of [-17, 17]) fx.smoke(11 + Math.random() - 0.5, 2.2, z + Math.random() - 0.5, 0.2, 1.3, 0, 1.0, 0.55, 8, 0.4, 0.1, 0.095, 0.09, 0, 0.25, 0.25, 0.25);
        for (const f of fires) fx.smoke(f.x + Math.random() * 2 - 1, f.y + 1, f.z + Math.random() * 2 - 1, 0.3, 2.2, 0, 1.6, 0.8, 9, 0.5, 0.13, 0.11, 0.1, 0.5, 0.25, 0.2, 0.35);
      }
      fireT += dt;
      for (let i = 0; i < fires.length; i++) {
        const f = fires[i], fl = 0.7 + 0.3 * Math.sin(fireT * 11 + i * 3) * Math.sin(fireT * 7.3 + i);
        fx.glow(f.x, f.y, f.z, 5.5 * fl, 3.2 * fl, 1.15 * fl, 0.25 * fl);
        if (Math.random() < dt * 5) fx.sparks.emit(f.x + Math.random() - 0.5, f.y, f.z + Math.random() - 0.5, 0.8 + Math.random(), 2 + Math.random() * 3, (Math.random() - 0.5) * 2, 1.5 + Math.random() * 2, 0.045, 5, 1.8, 0.4, -0.8);
      }
      flakT -= dt;
      if (flakT <= 0) {
        const over = atmos.lead.over;
        flakT = over > 0.05 ? 0.25 + Math.random() * 0.5 : 2.5 + Math.random() * 4;
        flakX = (over > 0.05 ? atmos.lead.x : (Math.random() - 0.5) * 500) + (Math.random() - 0.5) * 160;
        flakZ = (over > 0.05 ? atmos.lead.z : (Math.random() - 0.5) * 500) + (Math.random() - 0.5) * 160;
        flakY = 270 + Math.random() * 70;
        flakGlow = 1;
        fx.smoke(flakX, flakY, flakZ, 0, 0, 0, 7, 3, 7, 0.75, 0.05, 0.05, 0.06, 0, 0.1, 0.1, 0);
        sfx.flak(0.4 + over * 0.6);
      }
      if (flakGlow > 0) {
        flakGlow = Math.max(0, flakGlow - dt * 5);
        fx.glow(flakX, flakY, flakZ, 26 * flakGlow, 9 * flakGlow, 6 * flakGlow, 3 * flakGlow);
        atmos.flak(flakX, flakY, flakZ, cam, flakGlow * 1.6);
      }
      droneT -= dt;
      if (droneT <= 0) { droneT = 2.4; if (atmos.lead.over > 0.05) sfx.drone(atmos.lead.over); }
      warT -= dt;
      if (warT <= 0) { warT = 1.2 + Math.random() * 3.2; sfx.distant(Math.random() < 0.45 ? 0 : Math.random() < 0.6 ? 1 : 2); }
    },
  };
}
