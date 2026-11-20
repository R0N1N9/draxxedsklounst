// CONTINUE? — the coin gag. A gag is a list of ballistic segments (the coin is one object moving
// through the picture in "design units", 100 wide) plus, for the fumble, a glove choreographed
// around it. Everything is a closed-form function of t.
import { seg, ease, lerp } from '../../kit.js';

const S = (t0, t1, x0, y0, r0, x1, y1, r1, arc, e) => ({ t0, t1, x0, y0, r0, x1, y1, r1, arc, e });

/**
 * kind 'rim' | 'fumble' | 'freeze'; (sx, sy) the slit's centre; t0 the toss. Returns
 * {tIn, pos(t) → {x, y, r, phi, tilt} | null, hits: [{t, x, y, k}], hand(t) → {x, y, rot, curl, a} | null}.
 */
export function buildGag(kind, side, sx, sy, t0, tilt0, flips) {
  const start = [sx + side * 26, 64, 9], apex = [sx - side * 6, 17.5, 5];
  const above = (r) => [sx, sy - 2.1 - r - 0.2, r];
  const inside = (r) => [sx, sy - 2.1 + r + 0.5, r];
  const segs = [S(t0, t0 + 0.63, ...start, ...apex, 0, ease.outQuad)];
  const hits = [];
  let hand = null, tIn;
  if (kind === 'rim') {
    const rim = [sx - side * 3.3, sy - 3.2 - 2.8, 2.8];
    segs.push(S(t0 + 0.63, t0 + 1.36, ...apex, ...rim, 0, ease.inQuad));
    hits.push({ t: t0 + 1.36, x: rim[0], y: rim[1] + 2, k: 'rim' });
    segs.push(S(t0 + 1.36, t0 + 1.76, ...rim, ...above(2.2), 5.5, (u) => u));
    segs.push(S(t0 + 1.76, t0 + 2.0, ...above(2.2), ...inside(2.2), 0, ease.inQuad));
    tIn = t0 + 2.0;
  } else if (kind === 'fumble') {
    const hx = sx + side * 9.5;
    const tip = [hx, sy - 5.9, 3.3];
    segs.push(S(t0 + 0.63, t0 + 1.3, ...apex, ...tip, 0, ease.inQuad));
    hits.push({ t: t0 + 1.3, x: tip[0], y: tip[1] + 2, k: 'tip' });
    const out = [hx + side * 4.5, sy - 10, 3.5];
    segs.push(S(t0 + 1.3, t0 + 1.63, ...tip, ...out, 0, ease.outQuad));
    const palm = [hx + side * 1.5, sy - 4.8, 3.2];
    segs.push(S(t0 + 1.63, t0 + 1.98, ...out, ...palm, 0, ease.inQuad));
    hits.push({ t: t0 + 1.98, x: palm[0], y: palm[1] + 2, k: 'palm' });
    segs.push(S(t0 + 1.98, t0 + 2.22, ...palm, ...above(2.2), 6, (u) => u));
    segs.push(S(t0 + 2.22, t0 + 2.42, ...above(2.2), ...inside(2.2), 0, ease.inQuad));
    tIn = t0 + 2.42;
    hand = (t) => {
      const enter = ease.outCubic(seg(t, t0 + 0.35, t0 + 1.0));
      const leave = ease.inCubic(seg(t, t0 + 2.2, t0 + 2.75));
      const follow = ease.inOutQuad(seg(t, t0 + 1.3, t0 + 1.9));
      const x = hx + side * (14 * (1 - enter) + 4.5 * follow * (1 - seg(t, t0 + 1.9, t0 + 2.1)) + 14 * leave) + Math.sin((t - t0) * 9) * 0.35 * enter * (1 - leave);
      const y = lerp(66, sy + 2.2, enter) - 3.6 * follow * (1 - seg(t, t0 + 2.0, t0 + 2.2)) + 20 * leave;
      const recoil = Math.exp(-Math.max(0, t - (t0 + 1.3)) * 7) * (t > t0 + 1.3 ? 1 : 0);
      return {
        x, y, rot: side * (-0.1 + 0.18 * follow) + Math.sin((t - t0) * 14) * 0.06 * recoil,
        curl: ease.outQuad(seg(t, t0 + 1.98, t0 + 2.12)) * (1 - seg(t, t0 + 2.3, t0 + 2.6)),
        a: t > t0 + 0.3 && t < t0 + 2.85 ? 1 : 0,
      };
    };
  } else {
    segs.push(S(t0 + 0.63, t0 + 1.78, ...apex, ...above(2.2), 0, ease.inQuad));
    segs.push(S(t0 + 1.78, t0 + 2.08, ...above(2.2), ...inside(2.2), 0, ease.inQuad));
    tIn = t0 + 2.08;
  }
  const tSlide = segs[segs.length - 1].t0;
  const pos = (t) => {
    if (t < t0 || t >= tIn) return null;
    let s = segs[0];
    for (let i = segs.length - 1; i >= 0; i--) if (t >= segs[i].t0) { s = segs[i]; break; }
    const u = seg(t, s.t0, s.t1), e = s.e(u);
    const ug = seg(t, t0, tSlide);
    return {
      x: lerp(s.x0, s.x1, e),
      y: lerp(s.y0, s.y1, e) - s.arc * 4 * u * (1 - u),
      r: lerp(s.r0, s.r1, e),
      // Face-on for the hop, then turned edge-on just before it slides into the slit.
      phi: flips * Math.PI * ease.outQuad(ug) + (Math.PI / 2) * ease.inOutQuad(seg(t, tSlide - 0.08, tSlide + 0.1)),
      tilt: tilt0 * (1 - ease.inOutQuad(ug)) + 0.12 * Math.sin(ug * 14) * (1 - ug),
      u: ug,
    };
  };
  return { tIn, tSlide, pos, hits, hand, slitTop: sy - 2.1 };
}
