// The 2D layer of LAST SYNAPSE: an instrument's readouts over the eye and the tissue,
// the loser's last thought, the title of the next world — and the atlas of memories the
// cell bodies are lit with. Everything here is a function of (context, t).
import { clamp, seg, pulse, ease, rgba, shade, luminance, fitText, makeCanvas, fbm, shuffle, TAU } from '../../kit.js';

export const MONO = `'JetBrains Mono', 'Menlo', 'Courier New', monospace`;
export const SANS = `'Rajdhani', 'Avenir Next Condensed', 'Futura', 'Helvetica Neue', sans-serif`;
const INK = '#06050c';

// ---------------------------------------------------------------------------
// Memory atlas: four square tiles side by side. Tile 0 is always the last thing seen.
// ---------------------------------------------------------------------------
const TILE = 320;
const PAINT = {
  // The old world, cropped to where the shot landed.
  frame(g, s, ctx) {
    const img = ctx.fromImage, iw = img.width || 1, ih = img.height || 1;
    const side = Math.min(iw, ih) * 0.62;
    const fx = clamp((ctx.focus.x / Math.max(1, ctx.width)) * iw, side / 2, iw - side / 2);
    const fy = clamp((ctx.focus.y / Math.max(1, ctx.height)) * ih, side / 2, ih - side / 2);
    g.drawImage(img, fx - side / 2, fy - side / 2, side, side, 0, 0, s, s);
  },
  // The reticle that found them.
  reticle(g, s, ctx, col) {
    const c = s / 2;
    g.strokeStyle = col;
    g.lineWidth = s * 0.022;
    g.beginPath();
    g.arc(c, c, s * 0.27, 0, TAU);
    g.stroke();
    g.lineWidth = s * 0.014;
    g.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      g.moveTo(c + dx * s * 0.07, c + dy * s * 0.07);
      g.lineTo(c + dx * s * 0.34, c + dy * s * 0.34);
    }
    g.stroke();
    g.fillStyle = '#fff';
    for (let i = 1; i <= 3; i++) for (const d of [-1, 1]) g.fillRect(c + d * i * s * 0.065 - s * 0.007, c + s * 0.012, s * 0.014, s * 0.028);
    g.beginPath();
    g.arc(c, c, s * 0.018, 0, TAU);
    g.fill();
  },
  score(g, s, ctx, col) {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.font = `700 ${s * 0.34}px ${SANS}`;
    g.fillText(`${ctx.score[0]}:${ctx.score[1]}`, s / 2, s * 0.47);
    g.fillStyle = col;
    g.font = `600 ${s * 0.075}px ${MONO}`;
    g.fillText(`ROUND ${ctx.round}`, s / 2, s * 0.7);
  },
  // Whoever did this.
  name(g, s, ctx, col) {
    const who = ctx.winner ? ctx.winner.name : 'NOBODY';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.font = `600 ${s * 0.07}px ${MONO}`;
    g.fillText('IT WAS', s / 2, s * 0.36);
    const px = fitText(g, who, s * 0.58, s * 0.22, SANS);
    g.font = `700 ${px * 0.92}px ${SANS}`;
    g.fillStyle = col;
    g.fillText(who, s / 2, s * 0.53);
  },
  how(g, s, ctx, col) {
    const txt = ctx.how || 'ONE SHOT';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const px = fitText(g, txt, s * 0.58, s * 0.2, SANS);
    g.font = `700 ${px * 0.92}px ${SANS}`;
    g.fillStyle = '#fff';
    g.fillText(txt, s / 2, s * 0.5);
    g.fillStyle = col;
    g.fillRect(s * 0.26, s * 0.63, s * 0.48, s * 0.016);
  },
  // Where it all started: a mountain valley, three ridges and a low sun.
  valley(g, s, ctx, col, seed) {
    const sky = g.createLinearGradient(0, 0, 0, s);
    sky.addColorStop(0, '#16324a');
    sky.addColorStop(0.6, '#c9a27a');
    sky.addColorStop(1, '#f3d9a8');
    g.fillStyle = sky;
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#fff3d0';
    g.beginPath();
    g.arc(s * 0.64, s * 0.5, s * 0.07, 0, TAU);
    g.fill();
    const ridge = ['#5f7f93', '#35526a', '#152838'];
    for (let l = 0; l < 3; l++) {
      g.fillStyle = ridge[l];
      g.beginPath();
      g.moveTo(0, s);
      for (let x = 0; x <= s; x += 8) {
        const v = Math.abs(x / s - 0.5) * 2; // high shoulders, low middle: a valley
        g.lineTo(x, s * (0.5 + l * 0.14) - (0.1 + 0.3 * v * v) * s * (1 - l * 0.22) - fbm((x / s) * (3 + l * 2), seed + l * 9.1, 4) * s * 0.11);
      }
      g.lineTo(s, s);
      g.fill();
    }
  },
  // The trace, going flat.
  flatline(g, s, ctx, col) {
    g.strokeStyle = col;
    g.lineWidth = s * 0.02;
    g.lineJoin = 'round';
    g.beginPath();
    const y = s * 0.52, beat = [0, 0, -0.04, 0.03, -0.24, 0.18, -0.03, 0, 0];
    g.moveTo(s * 0.2, y);
    let x = s * 0.22;
    for (let b = 0; b < 2; b++) for (const v of beat) { g.lineTo(x, y + v * s); x += s * 0.016; }
    g.lineTo(s * 0.8, y);
    g.stroke();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(s * 0.8, y, s * 0.024, 0, TAU);
    g.fill();
  },
};

/** Returns { canvas, tiles, cast }: tile 0 = the old world, then three memories by seed. */
export function buildAtlas(ctx, rng, col) {
  const pool = shuffle(rng, ['reticle', 'score', 'name', 'how', 'valley', 'flatline']);
  const cast = ['frame', pool[0], pool[1], pool[2]];
  const { canvas, g } = makeCanvas(TILE * cast.length, TILE);
  const seed = rng() * 100;
  cast.forEach((id, i) => {
    g.save();
    g.translate(i * TILE, 0);
    g.beginPath();
    g.rect(0, 0, TILE, TILE);
    g.clip();
    try { PAINT[id](g, TILE, ctx, col, seed); } catch { /* a memory that fails to form is just dark */ }
    g.restore();
  });
  return { canvas, tiles: cast.length, cast };
}

// ---------------------------------------------------------------------------
// Readouts
// ---------------------------------------------------------------------------
const unitOf = (w, h) => Math.min(w, h * 1.7);
const margin = (w) => Math.max(16, w * 0.045);

/** 0.0000042 → '4.2 µm'. */
export function fmtLen(m) {
  for (const [k, u] of [[1, 'm'], [1e-2, 'cm'], [1e-3, 'mm'], [1e-6, 'µm']]) {
    if (m >= k || u === 'µm') { const v = m / k; return `${v >= 10 ? Math.round(v) : v.toFixed(1)} ${u}`; }
  }
  return '';
}

/** Act 1: the optic record. rec = { t0, t1, header, accent, lines: [{ label, parts: [{ text, color }] }] } */
export function drawRecord(g, w, h, t, rec) {
  const a = pulse(t, rec.t0, rec.t1, 0.22);
  if (a <= 0) return;
  const u = unitOf(w, h), x = margin(w);
  const lp = clamp(u * 0.0105, 8.5, 13), vp = clamp(u * 0.03, 15, 36);
  const rowH = vp * 1.18 + lp * 1.7;
  let y = h * 0.95 - rec.lines.length * rowH - lp * 1.5;
  // Scrim: the type never sits on raw picture.
  const R = Math.max(w * 0.62, h);
  const sc = g.createRadialGradient(0, h, 0, 0, h, R);
  sc.addColorStop(0, rgba(INK, 0.85 * a));
  sc.addColorStop(0.55, rgba(INK, 0.5 * a));
  sc.addColorStop(1, rgba(INK, 0));
  g.fillStyle = sc;
  g.fillRect(0, 0, R, h);

  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.font = `600 ${lp}px ${MONO}`;
  g.fillStyle = rgba(rec.accent, a * (Math.floor(t * 3.2) & 1 ? 1 : 0.25));
  g.beginPath();
  g.arc(x + lp * 0.4, y - lp * 0.36, lp * 0.38, 0, TAU);
  g.fill();
  g.fillStyle = rgba('#ffffff', 0.72 * a);
  g.fillText(rec.header, x + lp * 1.4, y);
  g.fillStyle = rgba('#ffffff', 0.3 * a);
  g.fillRect(x, y + lp * 0.75, u * 0.3 * ease.outCubic(seg(t, rec.t0, rec.t0 + 0.5)), 1);
  y += lp * 0.75 + lp * 2.1;
  rec.lines.forEach((ln, i) => {
    const k = seg(t, rec.t0 + 0.1 + i * 0.2, rec.t0 + 0.5 + i * 0.2);
    if (k > 0) {
      g.font = `600 ${lp}px ${MONO}`;
      g.fillStyle = rgba('#ffffff', 0.5 * a);
      g.fillText(ln.label, x, y);
      const full = ln.parts.map((p) => p.text).join('');
      g.font = `700 ${vp}px ${SANS}`;
      const fit = Math.min(1, (w * 0.56) / Math.max(1, g.measureText(full).width));
      g.font = `700 ${vp * fit}px ${SANS}`;
      let left = Math.round(full.length * ease.outCubic(k)), cx = x;
      const yy = y + vp * 1.02;
      for (const p of ln.parts) {
        const txt = p.text.slice(0, Math.max(0, left));
        left -= p.text.length;
        g.fillStyle = rgba(p.color, a);
        g.fillText(txt, cx, yy);
        cx += g.measureText(txt).width;
      }
      if (k < 1) { g.fillStyle = rgba('#ffffff', a); g.fillRect(cx + 2, yy - vp * 0.7, Math.max(1.5, vp * 0.07), vp * 0.74); }
    }
    y += rowH;
  });
}

/** Bottom-right scale bar: the powers-of-ten gauge that sells the plunge. */
export function drawScale(g, w, h, a, metres, note) {
  if (a <= 0) return;
  const u = unitOf(w, h), lp = clamp(u * 0.0105, 8.5, 13);
  const x1 = w - margin(w), x0 = x1 - u * 0.11, y = h * 0.93;
  g.strokeStyle = rgba('#ffffff', 0.78 * a);
  g.lineWidth = 1.25;
  g.beginPath();
  g.moveTo(x0, y - 5);
  g.lineTo(x0, y);
  g.lineTo(x1, y);
  g.lineTo(x1, y - 5);
  g.stroke();
  g.textAlign = 'right';
  g.textBaseline = 'alphabetic';
  g.font = `600 ${lp * 1.15}px ${MONO}`;
  g.fillStyle = rgba('#ffffff', 0.85 * a);
  g.fillText(fmtLen(metres), x1, y - lp * 0.95);
  if (note) {
    g.font = `600 ${lp * 0.9}px ${MONO}`;
    g.fillStyle = rgba('#ffffff', 0.45 * a);
    g.fillText(note, x1, y + lp * 1.7);
  }
}

/**
 * Act 2: the conduction readout (top left) and the last thought (bottom), one word per
 * landing. ch = { a, node, nodes, speed, title, who, words, shown, fresh (0..1, age of
 * the newest word), color }
 */
export function drawChase(g, w, h, ch) {
  const a = ch.a;
  if (a <= 0) return;
  const u = unitOf(w, h), x = margin(w), lp = clamp(u * 0.0105, 8.5, 13);
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  let y = Math.max(22, h * 0.075);
  g.font = `600 ${lp}px ${MONO}`;
  g.fillStyle = rgba('#ffffff', 0.5 * a);
  g.fillText(ch.title, x, y);
  const np = clamp(u * 0.026, 14, 32);
  y += np * 1.05;
  g.font = `700 ${np}px ${SANS}`;
  g.fillStyle = rgba('#ffffff', 0.92 * a);
  const node = `NODE ${String(ch.node).padStart(2, '0')}`;
  g.fillText(node, x, y);
  const nw = g.measureText(node).width;
  g.fillStyle = rgba('#ffffff', 0.45 * a);
  g.fillText(` / ${String(ch.nodes).padStart(2, '0')}`, x + nw, y);
  // A row of pips, one per station; the lit ones are behind us.
  y += lp * 1.3;
  const pip = Math.max(3, lp * 0.42), gap = pip * 2.1;
  for (let i = 0; i < ch.nodes; i++) {
    g.fillStyle = i < ch.node ? rgba(ch.color, a) : rgba('#ffffff', 0.22 * a);
    g.fillRect(x + i * gap, y, pip, pip);
  }
  y += pip + lp * 1.7;
  g.font = `600 ${lp}px ${MONO}`;
  g.fillStyle = rgba('#ffffff', 0.6 * a);
  g.fillText(`${String(Math.round(ch.speed)).padStart(3, ' ')} m/s`, x, y);

  if (!ch.words.length) return;
  const sc = g.createLinearGradient(0, h * 0.68, 0, h);
  sc.addColorStop(0, rgba(INK, 0));
  sc.addColorStop(1, rgba(INK, 0.7 * a));
  g.fillStyle = sc;
  g.fillRect(0, h * 0.68, w, h * 0.32);
  const qp0 = clamp(u * 0.04, 17, 50);
  const text = ch.words.join(' ');
  g.font = `700 ${qp0}px ${SANS}`;
  const qp = qp0 * Math.min(1, (w * 0.7) / Math.max(1, g.measureText(text).width)); // clear of the scale bar
  g.font = `700 ${qp}px ${SANS}`;
  const full = g.measureText(text).width, space = g.measureText(' ').width;
  const by = h * 0.9;
  g.textAlign = 'center';
  g.font = `600 ${lp}px ${MONO}`;
  g.fillStyle = rgba(ch.color, 0.95 * a);
  g.fillText(ch.who, w / 2, by - qp * 1.12);
  g.textAlign = 'left';
  g.font = `700 ${qp}px ${SANS}`;
  let cx = (w - full) / 2;
  for (let i = 0; i < ch.words.length; i++) {
    const ww = g.measureText(ch.words[i]).width;
    if (i < ch.shown) {
      const newest = i === ch.shown - 1 ? 1 - ch.fresh : 0;
      // The newest word lands a touch low and in the impulse's colour, then settles.
      g.fillStyle = newest > 0 ? rgba(shade(ch.color, 0.25 * (1 - newest)), a) : rgba('#ffffff', 0.96 * a);
      g.fillText(ch.words[i], cx, by + newest * newest * qp * 0.12);
    }
    cx += ww + space;
  }
}

// ---------------------------------------------------------------------------
// Act 3: the title, set in ink on the last island of white.
// ---------------------------------------------------------------------------
/** Measure the title block. info = { name, over, tagline, round, players:[{name,color,score}], matchPoint } */
export function titleLayout(g, w, h, info) {
  const u = unitOf(w, h);
  const maxW = Math.min(w * 0.74, u * 0.86);
  let px = fitText(g, info.name, maxW * 0.92, Math.min(w * 0.115, h * 0.2), SANS);
  g.font = `700 ${px}px ${SANS}`;
  let nw = g.measureText(info.name).width;
  if (nw > maxW) { px *= maxW / nw; g.font = `700 ${px}px ${SANS}`; nw = g.measureText(info.name).width; }
  const op = clamp(u * 0.0125, 9, 15), tp = clamp(u * 0.021, 11.5, 25);
  g.font = `600 ${op}px ${MONO}`;
  const ow = g.measureText(info.over).width;
  const sw = scoreRow(g, 0, 0, op, info, 0);
  let tpx = tp;
  g.font = `600 ${tpx}px ${SANS}`;
  let tw = info.tagline ? g.measureText(info.tagline).width : 0;
  if (tw > maxW) { tpx *= maxW / tw; tw = maxW; }
  const gapO = op * 1.5, gapT = info.tagline ? tpx * 1.5 : 0, gapS = op * 2.6;
  const bh = op + gapO + px * 0.74 + px * 0.2 + gapT + gapS;
  const bw = Math.max(nw, ow, sw, tw);
  const cy = Math.min(h * 0.6, h * 0.95 - bh / 2 - h * 0.06);
  const top = cy - bh / 2;
  return { cx: w / 2, cy, bw, bh, px, op, tp: tpx, nw, yOver: top + op, yName: top + op + gapO + px * 0.74, yRule: top + op + gapO + px * 0.74 + px * 0.13, yTag: top + op + gapO + px * 0.94 + gapT * 0.72, yScore: top + bh };
}

// One row: ROUND n · ■ NAME 2 — 1 NAME ■ (· MATCH POINT). a = 0 only measures. Returns its width.
function scoreRow(g, cx, y, op, info, a) {
  g.font = `600 ${op}px ${MONO}`;
  const chip = op * 0.82, sp = g.measureText(' ').width;
  const [p0, p1] = info.players;
  const parts = [
    { t: `ROUND ${info.round}`, c: 0.55 }, { gap: sp * 3 },
    { chip: p0.color }, { gap: sp }, { t: p0.name, c: 0.9 }, { gap: sp }, { t: String(p0.score), c: 1, b: 1 },
    { t: ' — ', c: 0.5 },
    { t: String(p1.score), c: 1, b: 1 }, { gap: sp }, { t: p1.name, c: 0.9 }, { gap: sp }, { chip: p1.color },
  ];
  if (info.matchPoint) parts.push({ gap: sp * 3 }, { t: 'MATCH POINT', c: 1, b: 1, hi: 1 });
  let total = 0;
  for (const p of parts) total += p.gap || (p.chip ? chip : g.measureText(p.t).width);
  if (a <= 0) return total;
  let x = cx - total / 2;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  for (const p of parts) {
    if (p.gap) { x += p.gap; continue; }
    if (p.chip) {
      g.fillStyle = rgba(p.chip, a);
      g.fillRect(x, y - chip * 0.92, chip, chip);
      g.strokeStyle = rgba(info.ink, 0.85 * a);
      g.lineWidth = 1;
      g.strokeRect(x + 0.5, y - chip * 0.92 + 0.5, chip - 1, chip - 1);
      x += chip;
      continue;
    }
    const tw = g.measureText(p.t).width;
    if (p.hi) {
      g.fillStyle = rgba(info.ink, a);
      g.fillRect(x - op * 0.5, y - op * 1.05, tw + op, op * 1.5);
      g.fillStyle = rgba(info.accentLight, a);
    } else g.fillStyle = rgba(info.ink, p.c * a);
    g.fillText(p.t, x, y);
    x += tw;
  }
  return total;
}

/** tl = seconds since the title came in; out = 0..1 as the island dissolves under it. */
export function drawTitle(g, lay, tl, out, info) {
  const a = 1 - out;
  if (a <= 0 || tl <= 0) return;
  const { cx, px, op } = lay;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  // Overline: typed.
  const ko = seg(tl, 0.0, 0.4);
  g.font = `600 ${op}px ${MONO}`;
  g.fillStyle = rgba(info.ink, 0.62 * a);
  const over = info.over.slice(0, Math.round(info.over.length * ko));
  g.textAlign = 'left';
  const ow = g.measureText(info.over).width;
  g.fillText(over, cx - ow / 2, lay.yOver);
  // Name: rises from behind its own baseline.
  const kn = ease.outQuart(seg(tl, 0.06, 0.62));
  g.save();
  g.beginPath();
  g.rect(cx - lay.nw / 2 - px * 0.2, lay.yName - px * 0.9, lay.nw + px * 0.4, px * 1.04);
  g.clip();
  g.textAlign = 'center';
  g.font = `700 ${px}px ${SANS}`;
  const dy = (1 - kn) * px * 1.05 + out * px * 0.1;
  g.fillStyle = rgba(info.accentDark, 0.9 * a);
  g.fillText(info.name, cx + px * 0.028, lay.yName + dy + px * 0.028);
  g.fillStyle = rgba(info.ink, a);
  g.fillText(info.name, cx, lay.yName + dy);
  g.restore();
  // Rule: drawn from the middle, a bead of the next world's colour running its length.
  const kr = ease.outCubic(seg(tl, 0.3, 0.8));
  const rw = lay.nw * kr;
  g.fillStyle = rgba(info.ink, 0.85 * a);
  g.fillRect(cx - rw / 2, lay.yRule, rw, Math.max(1.5, px * 0.022));
  g.fillStyle = rgba(info.accentDark, a);
  const bead = Math.max(4, px * 0.07);
  g.fillRect(cx - rw / 2 + (rw - bead) * (0.5 + 0.5 * Math.sin(tl * 2.2)), lay.yRule - bead * 0.3, bead, Math.max(1.5, px * 0.022) + bead * 0.6);
  if (info.tagline) {
    g.textAlign = 'center';
    g.font = `600 ${lay.tp}px ${SANS}`;
    g.fillStyle = rgba(info.ink, 0.78 * a * seg(tl, 0.42, 0.75));
    g.fillText(info.tagline, cx, lay.yTag);
  }
  scoreRow(g, cx, lay.yScore, op, info, a * seg(tl, 0.55, 0.9));
}

/** Darker / lighter readings of a world's accent, for type on white and on ink. */
export function accentPair(accent) {
  const l = luminance(accent);
  return { dark: l > 0.3 ? shade(accent, -0.5) : accent, light: l < 0.35 ? shade(accent, 0.45) : accent };
}

