// PLUNGE — everything else in the water: the ringed bubbles, the shoal that parts around
// the lens, and the thing far below. All positions are pure functions of t.
import { seg, ease, lerp, clamp01, pulse, rand, gauss, pick, rgba, makeCanvas, TAU } from '../../kit.js';

// ---------------------------------------------------------------------------
// Sprites, painted once
// ---------------------------------------------------------------------------
export function makeSprites(stripe) {
  const S = 96;
  const bub = makeCanvas(S, S), b = bub.g, c = S / 2, r = S / 2 - 3;
  // a ringed bubble: clear middle, a bright rim, a window of sky caught at the top left
  const fillG = b.createRadialGradient(c, c, r * 0.2, c, c, r);
  fillG.addColorStop(0, 'rgba(210,245,255,0.04)');
  fillG.addColorStop(0.75, 'rgba(210,245,255,0.12)');
  fillG.addColorStop(1, 'rgba(235,252,255,0.5)');
  b.fillStyle = fillG;
  b.beginPath(); b.arc(c, c, r, 0, TAU); b.fill();
  b.strokeStyle = 'rgba(240,253,255,0.9)';
  b.lineWidth = 3;
  b.beginPath(); b.arc(c, c, r - 1.5, 0, TAU); b.stroke();
  b.strokeStyle = 'rgba(255,255,255,0.95)';
  b.lineWidth = 5;
  b.lineCap = 'round';
  b.beginPath(); b.arc(c, c, r * 0.72, Math.PI * 1.08, Math.PI * 1.42); b.stroke();
  b.fillStyle = 'rgba(255,255,255,0.75)';
  b.beginPath(); b.arc(c + r * 0.42, c + r * 0.45, r * 0.09, 0, TAU); b.fill();

  // a fish in profile, facing +x: dark back, silver flank, a stripe, a forked tail
  const FW = 96, FH = 32;
  const fish = makeCanvas(FW, FH), f = fish.g;
  const body = (gg, light) => {
    gg.beginPath();
    gg.moveTo(FW * 0.95, FH * 0.5);
    gg.bezierCurveTo(FW * 0.82, FH * 0.08, FW * 0.42, FH * 0.08, FW * 0.24, FH * 0.44);
    gg.lineTo(FW * 0.04, FH * 0.12);
    gg.lineTo(FW * 0.1, FH * 0.5);
    gg.lineTo(FW * 0.04, FH * 0.88);
    gg.lineTo(FW * 0.24, FH * 0.56);
    gg.bezierCurveTo(FW * 0.42, FH * 0.92, FW * 0.82, FH * 0.92, FW * 0.95, FH * 0.5);
    gg.closePath();
    if (light) { gg.fillStyle = '#ffffff'; gg.fill(); return; }
    const gr = gg.createLinearGradient(0, FH * 0.1, 0, FH * 0.9);
    gr.addColorStop(0, '#16384a');
    gr.addColorStop(0.45, '#8fb9c6');
    gr.addColorStop(0.62, '#c2e0e6');
    gr.addColorStop(1, '#e4f2f4');
    gg.fillStyle = gr;
    gg.fill();
  };
  body(f, false);
  if (stripe) {
    f.save();
    f.clip();
    f.fillStyle = stripe;
    f.globalAlpha = 0.85;
    f.fillRect(0, FH * 0.38, FW, FH * 0.11);
    f.restore();
  }
  f.fillStyle = '#0a1418';
  f.beginPath(); f.arc(FW * 0.8, FH * 0.44, FH * 0.06, 0, TAU); f.fill();
  const flash = makeCanvas(FW, FH);
  body(flash.g, true);
  return {
    bubble: bub.canvas, fish: fish.canvas, flash: flash.canvas,
    dispose() { for (const cv of [bub.canvas, fish.canvas, flash.canvas]) cv.width = cv.height = 1; },
  };
}

// ---------------------------------------------------------------------------
// Bubbles
// ---------------------------------------------------------------------------
// Two crops: the plume that thickens into the curtain before the swap, and what is left of
// the curtain afterwards, thinning out and rising away. Sizes follow the surf world's three.
export function makeBubbles(rng, plumeX, T) {
  const N = 230, B = { n: N, x: new Float32Array(N), y: new Float32Array(N), born: new Float32Array(N), v: new Float32Array(N), r: new Float32Array(N), wa: new Float32Array(N), wf: new Float32Array(N), ph: new Float32Array(N) };
  for (let i = 0; i < N; i++) {
    const before = i < 105, u = rng();
    const sz = Math.pow(rng(), 2.6);
    B.r[i] = 0.004 + sz * 0.036;
    B.v[i] = (0.22 + 0.5 * Math.sqrt(B.r[i] / 0.04) + 0.25 * rng()) * (before ? 1 : 0.85);
    B.wa[i] = rand(rng, 0.003, 0.012);
    B.wf[i] = rand(rng, 2, 6);
    B.ph[i] = rand(rng, 0, TAU);
    if (before) {
      // born ever faster toward the swap, gathered round the plume and widening
      const born = 0.06 + (T.swap - 0.12) * Math.sqrt(u);
      B.born[i] = born;
      B.x[i] = plumeX + gauss(rng) * (0.05 + 0.16 * (born / T.swap));
      B.y[i] = rand(rng, 0.75, 1.08);
    } else {
      // the remains of the curtain: everywhere at first, then fewer, from lower down
      const born = T.swap + (T.last - 0.75 - T.swap) * Math.pow(u, 1.5);
      B.born[i] = born;
      B.x[i] = rng();
      B.y[i] = born < T.swap + 0.25 ? rand(rng, 0.25, 1.1) : rand(rng, 0.8, 1.12);
      B.v[i] *= 1 + (born - T.swap) * 0.25; // the late ones hurry up, so the last leave on time
    }
  }
  return B;
}

export function drawBubbles(g, B, sprite, t, w, h, T, gain, ceil) {
  const U = Math.min(w, h * 1.78);
  const late = 1 - seg(t, T.last - 0.3, T.last);
  for (let i = 0; i < B.n; i++) {
    const age = t - B.born[i];
    if (age < 0) continue;
    const y = (B.y[i] - B.v[i] * age) * h;
    const r = B.r[i] * h;
    if (y < -r * 2) continue;
    let a = seg(age, 0, 0.14) * clamp01((y - ceil) / (h * 0.05) + 0.2) * late * gain; // they burst at the waterline
    if (a <= 0.01) continue;
    const x = B.x[i] * w + (Math.sin(t * B.wf[i] + B.ph[i]) * B.wa[i] + 0) * U;
    g.globalAlpha = a;
    const sq = 1 - 0.12 * Math.min(1, B.r[i] / 0.03); // big ones wobble flat
    g.drawImage(sprite, x - r, y - r * sq, r * 2, r * 2 * sq);
  }
  g.globalAlpha = 1;
}

/** A little puff of bubbles from a point, at time t0 (screen px origin). */
export function drawPuff(g, sprite, x0, y0, t, t0, h, seed, n = 7) {
  const age = t - t0;
  if (age < 0 || age > 1.1) return;
  for (let i = 0; i < n; i++) {
    const s = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453, u = s - Math.floor(s);
    const r = h * (0.004 + 0.009 * u);
    const x = x0 + Math.sin(i * 2.4 + seed) * h * 0.03 * Math.sqrt(age) + Math.sin(age * 7 + i) * h * 0.004;
    const y = y0 - h * (0.06 + 0.12 * u) * age * (1 + age) - h * 0.01 * i * age;
    g.globalAlpha = (1 - seg(age, 0.6, 1.1)) * seg(age, 0, 0.08) * 0.9;
    g.drawImage(sprite, x - r, y - r, r * 2, r * 2);
  }
  g.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// The shoal
// ---------------------------------------------------------------------------
export function makeShoal(rng, T) {
  const n = 46 + Math.floor(rng() * 34);
  const dirs = [0, Math.PI, 0.32, Math.PI - 0.32, -0.28, Math.PI + 0.28];
  const ang = pick(rng, dirs);
  const fish = [];
  for (let i = 0; i < n; i++) {
    fish.push({ lane: gauss(rng) * 0.09, along: gauss(rng) * 0.2, sp: rand(rng, 0.92, 1.1), size: rand(rng, 0.7, 1.25), ph: rand(rng, 0, TAU), wig: rand(rng, 9, 14) });
  }
  return { fish, ang, cy: rand(rng, 0.33, 0.44), t0: T.shoal0, t1: T.shoal1, bend: rand(rng, -0.08, 0.08) };
}

const PT = { x: 0, y: 0, s: 1 };
function fishAt(S, F, t, w, h, out) {
  const U = Math.min(w, h * 1.78) * 0.5;
  const k = (t - S.t0) / (S.t1 - S.t0);
  const ca = Math.cos(S.ang), sa = Math.sin(S.ang);
  const along = lerp(-1.6, 1.6, k * F.sp) + F.along;
  // the school's own frame, centred on the lens: a along the heading, l across it
  const a = along * U;
  let l = (F.lane + S.bend * along * along) * h + (S.cy - 0.5) * h * ca + Math.sin(t * 2 + F.ph) * h * 0.006;
  // like water round a stone: the shoal splits into two streams around the lens and closes behind it
  const R0 = h * 0.17, A = h * 0.42, ga = Math.exp(-(a * a) / (A * A));
  const sg = l >= 0 ? 1 : -1;
  l += sg * R0 * 1.2 * ga * Math.exp(-(l * l) / (2.25 * R0 * R0));
  out.x = w / 2 + ca * a - sa * l;
  out.y = h * 0.5 + sa * a + ca * l;
  out.s = 1 + 1.1 * ga * Math.exp(-(l * l) / (1.7 * R0 * R0));
  return out;
}

export function drawShoal(g, S, sp, t, w, h) {
  const a0 = pulse(t, S.t0, S.t1, 0.25);
  if (a0 <= 0) return;
  const len0 = h * 0.036;
  for (let i = 0; i < S.fish.length; i++) {
    const F = S.fish[i];
    fishAt(S, F, t + 0.03, w, h, PT);
    const nx = PT.x, ny = PT.y;
    fishAt(S, F, t, w, h, PT);
    const ang = Math.atan2(ny - PT.y, nx - PT.x) + Math.sin(t * F.wig + F.ph) * 0.12;
    const len = len0 * F.size * PT.s;
    if (PT.x < -len || PT.x > w + len || PT.y < -len || PT.y > h + len) continue;
    g.save();
    g.translate(PT.x, PT.y);
    g.rotate(ang);
    if (Math.cos(ang) < 0) g.scale(1, -1); // keep the belly down
    g.globalAlpha = a0 * 0.85;
    g.drawImage(sp.fish, -len / 2, -len * 0.17, len, len * 0.34);
    // the whole shoal flickers silver as it turns
    const fl = Math.sin(t * 7 + F.ph * 3);
    if (fl > 0.6) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = a0 * (fl - 0.6) * 1.2;
      g.drawImage(sp.flash, -len / 2, -len * 0.17, len, len * 0.34);
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();
  }
  g.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// The thing below: never shown whole — an arm, two far-off arms, or a shadow passing under
// ---------------------------------------------------------------------------
export function makeKraken(rng, T) {
  return { kind: pick(rng, ['arm', 'pair', 'shadow']), side: rng() < 0.5 ? -1 : 1, t0: T.kraken0 + rand(rng, 0, 0.12), dur: rand(rng, 0.6, 0.75), x: rand(rng, 0.25, 0.55), curl: rand(rng, 0.75, 1.15) };
}

const ARM_N = 24;
const EDGE = new Float32Array((ARM_N + 1) * 4);
// One arm out of the gloom: a tapering curve that rises and rolls its tip over.
function arm(g, bx, by, ang, size, curl, sd, u, a, deep) {
  let x = bx, y = by, an = ang;
  for (let i = 0; i <= ARM_N; i++) {
    const k = i / ARM_N, wd = size * 0.09 * (1 - k * 0.93);
    const px = -Math.sin(an), py = Math.cos(an);
    EDGE[i * 4] = x + px * wd; EDGE[i * 4 + 1] = y + py * wd;
    EDGE[i * 4 + 2] = x - px * wd; EDGE[i * 4 + 3] = y - py * wd;
    const step = size * 0.036 * (1 - k * 0.35);
    x += Math.cos(an) * step;
    y += Math.sin(an) * step;
    an -= sd * (0.015 + k * k * 0.34 * curl * (0.55 + 0.7 * u));
  }
  // twice: a wide faint pass for the haze round it, then the body
  for (let pass = 0; pass < 2; pass++) {
    const grow = pass ? 1 : 1.5;
    g.fillStyle = rgba(deep, (pass ? 0.62 : 0.25) * a);
    g.beginPath();
    for (let i = 0; i <= ARM_N; i++) {
      const cx = (EDGE[i * 4] + EDGE[i * 4 + 2]) / 2, cy = (EDGE[i * 4 + 1] + EDGE[i * 4 + 3]) / 2;
      const ex = cx + (EDGE[i * 4] - cx) * grow, ey = cy + (EDGE[i * 4 + 1] - cy) * grow;
      if (i) g.lineTo(ex, ey); else g.moveTo(ex, ey);
    }
    for (let i = ARM_N; i >= 0; i--) {
      const cx = (EDGE[i * 4] + EDGE[i * 4 + 2]) / 2, cy = (EDGE[i * 4 + 1] + EDGE[i * 4 + 3]) / 2;
      g.lineTo(cx + (EDGE[i * 4 + 2] - cx) * grow, cy + (EDGE[i * 4 + 3] - cy) * grow);
    }
    g.closePath();
    g.fill();
  }
  // a row of suckers along the inside of the curl, barely there
  g.fillStyle = rgba('#bfe0e4', 0.13 * a);
  for (let i = 3; i < ARM_N - 3; i += 2) {
    const sx = lerp(EDGE[i * 4], EDGE[i * 4 + 2], sd > 0 ? 0.78 : 0.22), sy = lerp(EDGE[i * 4 + 1], EDGE[i * 4 + 3], sd > 0 ? 0.78 : 0.22);
    g.beginPath();
    g.arc(sx, sy, size * 0.011 * (1 - i / ARM_N), 0, TAU);
    g.fill();
  }
}

export function drawKraken(g, K, t, w, h, deep) {
  const u = seg(t, K.t0, K.t0 + K.dur);
  if (u <= 0 || u >= 1) return;
  const a = Math.pow(Math.sin(Math.PI * u), 1.5), U = Math.min(w, h * 1.78) * 0.5, sd = K.side;
  g.save();
  if (K.kind === 'arm') {
    arm(g, w / 2 + sd * (K.x + 0.25 - 0.3 * ease.inOutSine(u)) * U, h * (1.14 - 0.1 * u), -Math.PI / 2 - sd * 0.42, h * 1.15, K.curl, sd, u, a, deep);
  } else if (K.kind === 'pair') {
    for (let i = 0; i < 2; i++) {
      const v = clamp01(u * 1.2 - i * 0.2), b = Math.pow(Math.sin(Math.PI * v), 1.5) * 0.8;
      if (b > 0.01) arm(g, w / 2 + sd * (K.x + i * 0.32 - 0.15 * v) * U, h * (1.08 - 0.08 * v), -Math.PI / 2 - sd * (0.25 + i * 0.35), h * (0.85 - i * 0.15), K.curl * 1.1, i ? -sd : sd, v, b, deep);
    }
  } else {
    // something vast passes beneath: the bottom of the frame goes dark and comes back
    const cx = w / 2 + sd * lerp(1.4, -1.4, ease.inOutSine(u)) * U, cy = h * 1.1;
    const rx = U * 1.2, ry = h * 0.32;
    g.translate(cx, cy);
    g.scale(1, ry / rx);
    const sh = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    sh.addColorStop(0, rgba(deep, 0.7 * a));
    sh.addColorStop(0.55, rgba(deep, 0.45 * a));
    sh.addColorStop(1, rgba(deep, 0));
    g.fillStyle = sh;
    g.fillRect(-rx, -rx, rx * 2, rx * 2);
  }
  g.restore();
}
