// BREAK POINT — everything else that lives in the bay, as pure functions of round time:
// the dolphin pod, the circling fin, the beach ball, the gulls, the banner plane, the
// cruise ship and the buoy line. No drawing here (life.js does that): this is the part both
// clients must agree on, because rounds stop on these things and one of them bumps boards.
import { smoothstep, TAU } from '../../kit.js';
import { ARENA } from './sea.js';

export const N_DOLPHIN = 4, N_BUOY = 16, LEAP = 2.5, LEAP_AIR = 0.46;

export function makeWorld(rng, sea, roundTime) {
  const dir = rng() < 0.5 ? 1 : -1;
  const pod = { cx: (rng() - 0.5) * 16, cz: (rng() - 0.5) * 10, a: 54, b: 25, w: 0.2 * dir, th0: rng() * TAU, ph: rng() };
  const dolphins = [];
  for (let j = 0; j < N_DOLPHIN; j++) dolphins.push({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, up: false, u: 0, r: 0.95 });
  const sh = { a: rng() * TAU, b: rng() * TAU, c: rng() * TAU, dir: -dir };
  const fin = { x: 0, y: 0, z: 0, yaw: 0, up: false, k: 0, r: 0.7 };
  const bl = { off: rng() * 300, c: rng() * TAU };
  const ball = { x: 0, y: 0, z: 0, spin: 0, r: 0.95, up: true };
  const gl = { a: rng() * TAU, b: rng() * TAU, px: 0, pz: 0, pt: -99 };
  const gulls = { x: 0, y: 18, z: 0, pull: 0 };
  const plane = { x: 0, y: 36, z: -122, off: rng() * 30 };
  const ship = { x: 0, z: 1500, off: rng() * 500 - 150 };
  const buoys = [];
  for (let i = 0; i < N_BUOY; i++) { const a = ((i + 0.5) / N_BUOY) * TAU; buoys.push({ a, ux: Math.cos(a), uz: Math.sin(a), x: 0, z: 0, y: 0, r: 0.75 }); }
  const hit = { t: 0, kind: '', x: 0, y: 0, z: 0, i: 0 };
  let ring = 1;

  const W = {
    dolphins, fin, ball, gulls, plane, ship, buoys, hit,
    get ring() { return ring; },
    // Sudden death: the buoy line closes on the middle of the bay.
    ringAt: (t) => 1 - 0.7 * smoothstep(roundTime + 1, roundTime + 24, t),
    // A shot calls the gulls over the shooter for a few seconds.
    ping(x, z, t) { gl.px = x; gl.pz = z; gl.pt = t; },
    at(t) {
      ring = W.ringAt(t);
      for (let j = 0; j < N_DOLPHIN; j++) {
        const d = dolphins[j], th = pod.th0 + pod.w * t - j * 0.12 * dir;
        d.x = pod.cx + Math.cos(th) * pod.a * ring; d.z = pod.cz + Math.sin(th) * pod.b * ring;
        d.yaw = Math.atan2(Math.sin(th) * pod.a * dir, -Math.cos(th) * pod.b * dir); // forward = (-sin yaw, -cos yaw)
        const q = (((t / LEAP + pod.ph + j * 0.27) % 1) + 1) % 1, hs = sea.height(d.x, d.z);
        d.up = q < LEAP_AIR;
        d.u = q / LEAP_AIR;
        if (d.up) { d.y = hs - 0.4 + 3.0 * 4 * d.u * (1 - d.u); d.pitch = Math.atan2(3.0 * 4 * (1 - 2 * d.u) / (LEAP_AIR * LEAP), 9); }
        else { d.y = hs - 1.5; d.pitch = 0; }
      }
      {
        const cx = 42 * Math.sin(0.05 * t + sh.a) * ring, cz = 26 * Math.sin(0.07 * t + sh.b) * ring, th = sh.c + 0.42 * sh.dir * t;
        fin.x = cx + Math.cos(th) * 17; fin.z = cz + Math.sin(th) * 17;
        fin.yaw = Math.atan2(Math.sin(th) * sh.dir, -Math.cos(th) * sh.dir);
        fin.k = smoothstep(-0.5, -0.2, Math.sin(0.23 * t + sh.a * 2));
        fin.up = fin.k > 0.6;
        fin.y = sea.height(fin.x, fin.z) - 1.05 + fin.k * 1.0;
      }
      {
        ball.x = -150 + ((((t * 5.2 + bl.off) % 300) + 300) % 300);
        ball.z = 34 * Math.sin(t * 0.11 + bl.c) + 8 * Math.sin(t * 0.37);
        ball.y = sea.height(ball.x, ball.z) + 0.75 + 3.4 * Math.abs(Math.sin(t * 1.7 + bl.c));
        ball.spin = t * 2.2;
      }
      {
        const age = t - gl.pt, pull = smoothstep(0, 1.1, age) * (1 - smoothstep(4.5, 7.5, age));
        const bx = 34 * Math.cos(0.12 * t + gl.a) + 12, bz = 30 * Math.sin(0.17 * t + gl.b) - 8;
        gulls.pull = pull;
        gulls.x = bx + (gl.px - bx) * pull; gulls.z = bz + (gl.pz - bz) * pull;
        gulls.y = 17 - 7 * pull + 2 * Math.sin(t * 0.3);
      }
      plane.x = -820 + ((((t + plane.off) * 36) % 1640) + 1640) % 1640;
      ship.x = -1500 + ((((t * 5 + 1500 + ship.off) % 3000) + 3000) % 3000);
      for (let i = 0; i < N_BUOY; i++) { const b = buoys[i]; b.x = b.ux * ARENA.rx * ring * 1.04; b.z = b.uz * ARENA.rz * ring * 1.04; }
      return W;
    },
    // First thing in the bay that the segment o + d·[0, len] strikes (d unit), or null.
    // Buoy heights are looked up only for a round that is actually passing one.
    strike(ox, oy, oz, dx, dy, dz, len) {
      let best = null;
      const test = (kind, i, s, cy) => {
        const cx = s.x - ox, cz = s.z - oz, t = Math.max(0, Math.min(len, cx * dx + (cy - oy) * dy + cz * dz));
        const ex = ox + dx * t - s.x, ey = oy + dy * t - cy, ez = oz + dz * t - s.z;
        if (ex * ex + ey * ey + ez * ez > s.r * s.r || (best && t >= hit.t)) return;
        best = hit; hit.t = t; hit.kind = kind; hit.i = i; hit.x = s.x; hit.y = cy; hit.z = s.z;
      };
      for (let j = 0; j < N_DOLPHIN; j++) if (dolphins[j].up) test('dolphin', j, dolphins[j], dolphins[j].y);
      if (fin.up) test('fin', 0, fin, fin.y + 0.2);
      test('ball', 0, ball, ball.y);
      const mx = ox + dx * len * 0.5, mz = oz + dz * len * 0.5, reach = len * 0.5 + 1.5;
      for (let i = 0; i < N_BUOY; i++) {
        const b = buoys[i];
        if (Math.abs(b.x - mx) > reach || Math.abs(b.z - mz) > reach) continue;
        test('buoy', i, b, sea.height(b.x, b.z) + 0.9);
      }
      return best;
    },
  };
  return W.at(0);
}
