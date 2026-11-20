// The cast that is not fighting: shutters on their rails, the floor polisher, the watcher
// drones outside the glass — and, now and then, whoever is still building this place.
import { TAU, clamp01, lerp, ease, angDiff } from '../../kit.js';
import { W, H, MID, SHUTTER, DRONE, ROUND_TIME } from './world.js';
import { INK, EDGE, PINK, HOT, HAZARD } from './style.js';

export function makeProps({ ctx, g, S, world, view, rnd, glow, line, neon, label }) {
  const drones = [];
  for (const [x, y] of [[40, 870], [98, 858], [46, 796], [152, 882], [28, 738], [30, 30], [78, 24], [-34, 300], [-34, 540], [240, -30], [520, H + 32]]) {
    for (const m of [0, 1]) drones.push({ x: m ? W - x : x, y, a: m ? Math.PI : 0, ph: rnd() * TAU, size: 7 + rnd() * 4, cue: rnd() });
  }
  drones.push({ x: MID.x, y: H + 34, a: -Math.PI / 2, ph: rnd() * TAU, size: 10, cue: rnd() });

  // Shutters on their rails, and the floor polisher doing its rounds whatever happens.
  function machines(px, wide, alpha) {
    for (const s of world.shutters) {
      const x = s.x - SHUTTER.thick / 2, y = s.y - SHUTTER.len / 2;
      g.fillStyle = 'rgba(255,79,176,0.2)';
      g.globalAlpha = alpha;
      g.fillRect(x, y, SHUTTER.thick, SHUTTER.len);
      g.beginPath();
      g.rect(x, y, SHUTTER.thick, SHUTTER.len);
      neon(null, PINK, wide, alpha);
      g.strokeStyle = HOT;
      g.globalAlpha = alpha * 0.7;
      g.lineWidth = Math.max(1, px);
      for (let i = -2; i <= 2; i++) line(s.x - 4, s.y + i * 24 + 4, s.x + 4, s.y + i * 24 - 4);
      g.globalAlpha = 1;
    }
    const d = world.drone, hs = DRONE.size / 2, mad = S.droneHit > 0;
    // The strip it has just polished.
    const back = d.x - (MID.x + DRONE.amp * Math.sin(((ctx.time - 1.6) / DRONE.period) * TAU));
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = PINK;
    g.globalAlpha = 0.1 * alpha;
    g.lineWidth = DRONE.size - 6;
    g.lineCap = 'butt';
    line(d.x, d.y, d.x - back, d.y);
    g.globalCompositeOperation = 'source-over';
    g.save();
    g.translate(d.x, d.y);
    if (mad) g.translate(Math.sin(S.t * 90) * 2, 0);
    g.fillStyle = INK;
    g.globalAlpha = alpha;
    g.fillRect(-hs, -hs, DRONE.size, DRONE.size);
    g.beginPath();
    g.rect(-hs, -hs, DRONE.size, DRONE.size);
    neon(null, mad ? HAZARD : PINK, wide * 0.9, alpha);
    g.strokeStyle = HOT;
    g.globalAlpha = alpha * 0.8;
    g.lineWidth = Math.max(1.2, px);
    const spin = S.t * 7;
    g.beginPath();
    g.arc(0, 0, hs * 0.55, spin, spin + 1.9);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, hs * 0.55, spin + Math.PI, spin + Math.PI + 1.9);
    g.stroke();
    g.globalAlpha = alpha * (Math.sin(S.t * 5) > 0.2 ? 1 : 0.25);
    g.fillStyle = mad ? HAZARD : HOT;
    g.fillRect(hs - 7, -hs + 3, 4, 4);
    g.restore();
    label(mad ? '!!' : 'MOP-3', d.x, d.y - hs - 11, 8, mad ? HAZARD : PINK, alpha * (view.k > 0.5 ? 0.8 : 0), 'center');
    g.globalAlpha = 1;
  }

  // Watcher drones crowd the glass: they follow the shooting, and their cameras flash on a kill.
  function watchers(px) {
    const wt = S.watch, t = S.t;
    for (let i = 0; i < drones.length; i++) {
      const o = drones[i];
      const y = o.y + Math.sin(t * 1.1 + o.ph) * 4, x = o.x + Math.cos(t * 0.7 + o.ph) * 3;
      o.a += angDiff(o.a, Math.atan2(wt.y - y, wt.x - x)) * 0.07;
      const s = o.size * (1 + 0.35 * wt.jolt * (0.5 + o.cue));
      const c = Math.cos(o.a), sn = Math.sin(o.a);
      g.strokeStyle = EDGE;
      g.globalAlpha = 0.6;
      g.lineWidth = Math.max(1.2, px);
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(x + c * s * 1.3, y + sn * s * 1.3);
      g.lineTo(x - c * s * 0.8 - sn * s * 0.85, y - sn * s * 0.8 + c * s * 0.85);
      g.lineTo(x - c * s * 0.35, y - sn * s * 0.35);
      g.lineTo(x - c * s * 0.8 + sn * s * 0.85, y - sn * s * 0.8 - c * s * 0.85);
      g.closePath();
      g.stroke();
      g.fillStyle = HOT;
      g.globalAlpha = 0.85;
      g.fillRect(x + c * s * 0.45 - 1.2, y + sn * s * 0.45 - 1.2, 2.4, 2.4);
      if (S.kill) { // flashbulbs
        const dt = S.kill.t - o.cue * 0.55;
        if (dt > 0 && dt < 0.25) {
          g.globalCompositeOperation = 'lighter';
          glow(x + c * s, y + sn * s, 46, HOT, 1 - dt / 0.25);
          g.globalCompositeOperation = 'source-over';
        }
      }
    }
    g.globalAlpha = 1;
  }

  // Somebody is still working on this arena. Every so often their cursor wanders in, selects
  // a piece of cover, reads its numbers and wanders off. Timed from the round clock, so both
  // players see the same visit; it changes nothing.
  const VISIT = { first: 9, every: 23, arrive: 1.7, stay: 4, leave: 1.6 };
  const tip = { text: '', size: '', n: -1 };
  function inspector(px) {
    const time = ctx.time, pcs = world.pieces;
    if (ctx.phase !== 'live' || time < VISIT.first || time > ROUND_TIME - 1 || !pcs.length) return;
    const n = Math.floor((time - VISIT.first) / VISIT.every), u = time - VISIT.first - n * VISIT.every;
    if (u > VISIT.arrive + VISIT.stay + VISIT.leave) return;
    const idx = (n * 7 + (ctx.seed & 7)) % pcs.length, pc = pcs[idx], b = pc.solid;
    const tx = b.maxX - 6, ty = b.maxY - 6;                    // where the arrow comes to rest
    const side = n & 1 ? -1 : 1, ex = MID.x + side * (W / 2 + 80), ey = -70;
    let x = tx, y = ty, sel = 0;
    if (u < VISIT.arrive) {
      const k = ease.inOutCubic(u / VISIT.arrive);
      x = lerp(ex, tx, k) + Math.sin(k * Math.PI) * 90 * side;
      y = lerp(ey, ty, k);
    } else if (u < VISIT.arrive + VISIT.stay) {
      sel = clamp01((u - VISIT.arrive) * 8) * clamp01((VISIT.arrive + VISIT.stay - u) * 8);
      x += Math.sin(u * 2.3) * 2;
      y += Math.cos(u * 1.9) * 2;
    } else {
      const k = ease.inCubic((u - VISIT.arrive - VISIT.stay) / VISIT.leave);
      x = lerp(tx, MID.x - side * (W / 2 + 80), k);
      y = lerp(ty, H + 90, k) - Math.sin(k * Math.PI) * 60;
    }
    if (sel > 0.01) {
      // A selection box, the way every editor draws one: hairline, eight handles, a size tag.
      const m = 7, x0 = b.minX - m, y0 = b.minY - m, bw = b.maxX - b.minX + 2 * m, bh = b.maxY - b.minY + 2 * m;
      g.strokeStyle = PINK;
      g.globalAlpha = sel;
      g.lineWidth = Math.max(1, px);
      g.strokeRect(x0, y0, bw, bh);
      const hs = Math.max(2.5, 2.5 * px);
      for (let i = 0; i < 9; i++) {
        if (i === 4) continue;
        const hx = x0 + ((i % 3) * bw) / 2, hy = y0 + (((i / 3) | 0) * bh) / 2;
        g.fillStyle = HOT;
        g.fillRect(hx - hs, hy - hs, hs * 2, hs * 2);
        g.strokeRect(hx - hs, hy - hs, hs * 2, hs * 2);
      }
      if (tip.n !== n) {
        tip.n = n;
        tip.size = `${Math.round(b.maxX - b.minX)} × ${Math.round(b.maxY - b.minY)}`;
        tip.text = `${pc.type}_${String(idx + 1).padStart(2, '0')} · shadow: real`;
      }
      if (view.k > 0.5) {
        const tw = 62 * px, th = 15 * px, cx = x0 + bw / 2, cy = y0 + bh + 13 * px;
        g.fillStyle = PINK;
        g.fillRect(cx - tw / 2, cy - th / 2, tw, th);
        label(tip.size, cx, cy + 0.5 * px, 9, INK, sel);
        g.globalAlpha = sel * 0.92;
        const lw = 168 * px, lx = x + 16 * px, ly = y + 22 * px;
        g.fillStyle = INK;
        g.fillRect(lx, ly, lw, 19 * px);
        g.strokeStyle = PINK;
        g.strokeRect(lx, ly, lw, 19 * px);
        label(tip.text, lx + 8 * px, ly + 10 * px, 9, HOT, sel, 'left');
      }
      g.globalAlpha = 1;
    }
    // The arrow itself: a plain pointer, drawn at a fixed size on screen.
    const s = 1.5 * px, press = u > VISIT.arrive && u < VISIT.arrive + 0.14 ? 0.86 : 1;
    g.save();
    g.translate(x, y);
    g.scale(s * press, s * press);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, 17);
    g.lineTo(4.4, 13.2);
    g.lineTo(7.6, 20);
    g.lineTo(10.4, 18.7);
    g.lineTo(7.3, 12);
    g.lineTo(12.6, 12);
    g.closePath();
    g.fillStyle = INK;
    g.globalAlpha = 0.95;
    g.fill();
    g.strokeStyle = HOT;
    g.lineWidth = 1.3;
    g.lineJoin = 'round';
    g.stroke();
    g.restore();
    g.globalAlpha = 1;
  }

  return { machines, watchers, inspector };
}
