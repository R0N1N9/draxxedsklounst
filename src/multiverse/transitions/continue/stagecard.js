// CONTINUE? — the stage card: an attract-mode title in the NEW world's palette over a hyperspace
// starfield or a rolling checkerboard. drawSpace() is also what bleeds in, faintly, behind the
// countdown so the destination's colours arrive before it does.
import { seg, ease, clamp01, mixHex, shade, rgba, TAU } from '../../kit.js';
import { heroLayout, drawBits, bitsWidth } from './font.js';
import { drawHero } from './looks.js';
import { T } from './script.js';

/** The backdrop alone. phase advances the scroll; a is its opacity. */
export function drawSpace(g, W, H, U, oy, phase, plan, pal, a, full) {
  if (a <= 0.003) return;
  g.save();
  g.globalAlpha = a;
  const cx = W / 2;
  if (plan.stageBg === 'stars') {
    if (full) {
      const gr = g.createRadialGradient(cx, H / 2, U * 2, cx, H / 2, Math.hypot(W, H) * 0.6);
      gr.addColorStop(0, mixHex(pal.bg, pal.accent, 0.28));
      gr.addColorStop(1, shade(pal.bg, -0.5));
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
    }
    const R = Math.hypot(W, H) * 0.58, cy = H / 2;
    const cols = [pal.fg, pal.accent, '#ffffff'];
    const speed = Math.max(0, phase - Math.floor(phase)); // unused; kept for clarity of the closed form below
    void speed;
    g.lineCap = 'round';
    for (let c = 0; c < 3; c++) {
      g.strokeStyle = cols[c];
      g.beginPath();
      for (let i = c; i < plan.stars.length; i += 3) {
        const s = plan.stars[i];
        const p = (s.p + phase * (0.35 + s.s * 0.3)) % 1;
        const q = p * p * p, r0 = q * R + U, tail = (0.02 + q * 0.2 + Math.min(0.3, phase * 0.05)) * R;
        const ca = Math.cos(s.a), sa = Math.sin(s.a);
        g.moveTo(cx + ca * Math.max(U, r0 - tail), cy + sa * Math.max(U, r0 - tail));
        g.lineTo(cx + ca * r0, cy + sa * r0);
      }
      g.lineWidth = Math.max(1, U * 0.14);
      g.globalAlpha = a * (c === 2 ? 0.95 : 0.8);
      g.stroke();
    }
  } else {
    const hz = oy + U * 27;
    if (full) {
      const sky = g.createLinearGradient(0, 0, 0, hz);
      sky.addColorStop(0, shade(pal.bg, -0.45));
      sky.addColorStop(1, mixHex(pal.bg, pal.accent, 0.55));
      g.fillStyle = sky;
      g.fillRect(0, 0, W, hz + 1);
      g.fillStyle = mixHex(pal.accent, pal.fg, 0.35);
      g.beginPath();
      g.arc(cx, hz, U * 11, Math.PI, TAU);
      g.fill();
      g.fillStyle = mixHex(pal.bg, pal.accent, 0.55);
      for (let i = 0; i < 4; i++) g.fillRect(cx - U * 11, hz - U * (2 + i * 1.9), U * 22, U * (0.3 + i * 0.28));
    }
    const k = W * 0.36, depth = 15, sc = phase * 1.3, fl = Math.floor(sc), fr = sc - fl;
    const A = mixHex(pal.bg, pal.accent, 0.5), B = shade(pal.bg, -0.45);
    const Y = (z) => hz + ((H - hz) * 1.0) / z;
    for (let par = 0; par < 2; par++) {
      g.fillStyle = par ? A : B;
      g.beginPath();
      for (let r = 0; r < depth; r++) {
        const z0 = 1 + r - fr, z1 = z0 + 1;
        if (z1 <= 0.5) continue;
        const za = Math.max(z0, 0.5);
        const y0 = Y(z1), y1 = Y(za);
        for (let i = -12; i < 12; i++) {
          if (((i + r + fl) & 1) !== par) continue;
          g.moveTo(cx + (i * 1.5 * k) / z1, y0);
          g.lineTo(cx + ((i + 1) * 1.5 * k) / z1, y0);
          g.lineTo(cx + ((i + 1) * 1.5 * k) / za, y1);
          g.lineTo(cx + (i * 1.5 * k) / za, y1);
          g.closePath();
        }
      }
      g.fill();
    }
    const fog = g.createLinearGradient(0, hz, 0, hz + (H - hz) * 0.35);
    fog.addColorStop(0, rgba(mixHex(pal.bg, pal.accent, 0.55), 0.95));
    fog.addColorStop(1, rgba(pal.bg, 0));
    g.fillStyle = fog;
    g.fillRect(0, hz, W, (H - hz) * 0.35);
  }
  g.restore();
}

function nameLines(name, maxW, Smax) {
  const wu = heroLayout(name).width + 2.4;
  const s1 = Math.min(Smax, maxW / wu);
  const sp = name.indexOf(' ') >= 0;
  if (!sp || s1 > Smax * 0.62) return [{ text: name, S: s1 }];
  const words = name.split(' ');
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    const w = Math.max(heroLayout(a).width, heroLayout(b).width) + 2.4;
    if (!best || w < best.w) best = { a, b, w };
  }
  const s2 = Math.min(Smax * 0.64, maxW / best.w);
  return s2 > s1 * 1.2 ? [{ text: best.a, S: s2 }, { text: best.b, S: s2 }] : [{ text: name, S: s1 }];
}

export const cardCell = (U, sc, u) => Math.max(2, Math.floor(u * U * sc + 0.25));

// Dot-matrix line fitted to maxW px (cell is in device px, snapped).
function bitsFit(g, str, x, y, cell, maxW, sc, color, shadow) {
  const fit = Math.floor((maxW * sc) / Math.max(1, str.length * 6 - 1));
  cell = Math.max(2, Math.min(cell, fit));
  return drawBits(g, str, x, y, cell / sc, color, 'c', { color: shadow, d: 1 }, sc);
}

/** The whole card. t absolute; go: after the swap the READY? flash has become GO!. */
export function drawCard(g, o) {
  const { W, H, U, oy, t, plan, to, look, sc, go } = o;
  const pal = to.palette;
  const tc = t - T.cardIn0;
  drawSpace(g, W, H, U, oy, o.phase, plan, pal, 1, true);
  const Y = (v) => oy + v * U;
  const cx = W / 2;
  // The bold block of colour behind the lettering.
  const band = g.createLinearGradient(0, Y(5), 0, Y(48));
  band.addColorStop(0, rgba(pal.bg, 0));
  band.addColorStop(0.2, rgba(pal.bg, 0.55));
  band.addColorStop(0.8, rgba(pal.bg, 0.55));
  band.addColorStop(1, rgba(pal.bg, 0));
  g.fillStyle = band;
  g.fillRect(0, Y(5), W, Y(48) - Y(5));
  // STAGE n: letters pop in one by one.
  const word = `${plan.stageWord} ${plan.nextRound}`;
  const st = look.style('card', null, pal), st2 = look.style('cardS', null, pal);
  const sw = Math.min(1.0 * U, (W * 0.5) / (heroLayout(word).width + 2.4));
  drawHero(g, st2, word, cx, Y(10.4), sw, {
    glyph: (i, n) => {
      const k = ease.outBack(seg(tc, 0.04 + i * 0.04, 0.36 + i * 0.04));
      return { sy: k, sx: k, a: k > 0.01 ? 1 : 0, dy: (1 - k) * U * 3 };
    },
  });
  // The name: slides in from the side like a marquee, on one line or two.
  const lines = nameLines(String(to.name).toUpperCase(), 90 * U, 1.65 * U);
  const two = lines.length === 2;
  for (let li = 0; li < lines.length; li++) {
    const L = lines[li];
    const k = ease.outCubic(seg(tc, 0.12 + li * 0.08, 0.5 + li * 0.08));
    const dir = li % 2 ? -1 : 1;
    drawHero(g, st, L.text, cx + dir * (1 - k) * W, Y(two ? 20.6 + li * 9.6 : 24.8), L.S, { alpha: 1 });
  }
  // Perspective and tagline.
  const k2 = ease.outQuad(seg(tc, 0.4, 0.7));
  const persp = `\u2605 ${String(to.perspective).toUpperCase()} \u2605`;
  g.globalAlpha = k2;
  bitsFit(g, persp, cx, Y(36.9), cardCell(U, sc, 0.6), W * 0.9, sc, pal.accent, shade(pal.bg, -0.6));
  const tag = String(to.tagline || '').toUpperCase();
  if (tag) bitsFit(g, tag, cx, Y(42.8), cardCell(U, sc, 0.4), W * 0.9, sc, pal.fg, shade(pal.bg, -0.6));
  g.globalAlpha = 1;
  // READY? flashes (and the flash that follows is the swap); GO! after it.
  const ry = Y(49.8);
  if (!go) {
    const on = tc > T.ready0 - T.cardIn0 && (Math.floor((t - T.ready0) * 6.5) & 1) === 0;
    if (on && t < T.swap) drawHero(g, look.style('cardS', null, pal), plan.ready, cx, ry, Math.min(0.62 * U, (W * 0.6) / (heroLayout(plan.ready).width + 2.4)), {});
  } else {
    const k = ease.outBack(seg(t, T.swap + 0.1, T.swap + 0.45));
    drawHero(g, look.style('card', null, pal), 'GO!', cx, ry, 0.74 * U, { glyph: () => ({ sx: k, sy: k }) });
  }
  // Header and footer in the corners, attract-mode style.
  const c3 = cardCell(U, sc, 0.42);
  const sh = { color: shade(pal.bg, -0.6), d: 1 };
  drawBits(g, `ROUND ${plan.nextRound - 1} CLEARED`, o.ox + U * 3.2, Y(2.0), c3 / sc, pal.fg, 'l', sh, sc);
  drawBits(g, `${o.score[0]} - ${o.score[1]}`, o.ox + U * 96.8, Y(2.0), c3 / sc, pal.accent, 'r', sh, sc);
  drawBits(g, `FIRST TO ${o.target}`, o.ox + U * 96.8, Y(52.2), c3 / sc, pal.fg, 'r', sh, sc);
  drawBits(g, 'CREDIT 1', o.ox + U * 3.2, Y(52.2), c3 / sc, pal.fg, 'l', sh, sc);
}

/** Reveal the card with moving bars (bands slide horizontally, columns drop vertically). Returns [x, y, w, h] bars to draw as edges. */
export function cardReveal(g, W, H, t, plan, pal, U) {
  const n = plan.cardIn === 'bands' ? 8 : 12;
  const span = T.cardIn1 - T.cardIn0 - 0.42;
  const rects = [];
  const edges = [];
  const done = t >= T.cardIn1;
  for (let i = 0; i < n; i++) {
    const ord = i;
    const p = ease.inOutCubic(seg(t, T.cardIn0 + (ord / (n - 1)) * span, T.cardIn0 + (ord / (n - 1)) * span + 0.42));
    if (plan.cardIn === 'bands') {
      const h = H / n, y = i * h;
      const dir = i & 1 ? -1 : 1;
      const w = W * p;
      rects.push(dir > 0 ? [0, y, w, h + 0.5] : [W - w, y, w, h + 0.5]);
      if (p > 0 && p < 1) edges.push(dir > 0 ? [w - U * 1.5, y, U * 1.5, h] : [W - w, y, U * 1.5, h]);
    } else {
      const w = W / n, x = i * w;
      const dir = i & 1 ? -1 : 1;
      const hh = H * p;
      rects.push(dir > 0 ? [x, 0, w + 0.5, hh] : [x, H - hh, w + 0.5, hh]);
      if (p > 0 && p < 1) edges.push(dir > 0 ? [x, hh - U * 1.5, w, U * 1.5] : [x, H - hh, w, U * 1.5]);
    }
  }
  return { rects, edges, done };
}
void clamp01;
void bitsWidth;
