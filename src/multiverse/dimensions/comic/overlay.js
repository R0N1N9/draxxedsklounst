// INK CITY — the lettering. Everything on the 2D layer is drawn the way a letterer would:
// sound effects that pop into the world (pre-rendered once, hand-set letter by letter),
// yellow caption boxes for the narration (reload, prompts), ink-and-white marks for the
// reticle, the leap arc and the enemy, and the splash-page type of the kill.
import { clamp, makeCanvas, roundRect, ease, TAU } from '../../kit.js';
import { PAL } from './art.js';

const DISPLAY = '"Futura-CondensedExtraBold", "Impact", "Arial Black", "Helvetica Neue", sans-serif';
const HAND = '"Marker Felt", "Chalkboard SE", "Comic Sans MS", "Trebuchet MS", sans-serif';
const INK = PAL.ink, PAPER = PAL.paper, YEL = '#ffe066';

// word → [text, top colour, bottom colour, burst colour or null]
const WORDS = {
  BLAM: ['BLAM!', '#fff27a', '#ff7a2e', '#e2413a'], KRAK: ['KRAK!', '#ffffff', '#ffd23f', null], PING: ['PING!', '#f2ffff', '#7df9ff', null],
  THUNK: ['THUNK!', '#ffe7b3', '#e0914d', null], BOINK: ['BOINK!', '#fff4d6', '#ff8fb0', null], WHIFF: ['WHIFF!', '#ffffff', '#cfe0ff', null],
  THUD: ['THUD!', '#ffe7b3', '#d9764a', null], POOF: ['POOF!', '#ffffff', '#d9c2ff', '#8e5bd6'], FWOOSH: ['FWOOSH!', '#fff27a', '#ff9d2e', null],
  HUP: ['HUP!', '#ffffff', '#9dffd0', null], CHAK: ['CHK-CHAK!', '#ffffff', '#c9c2e6', null], RATTLE: ['RATTLE RATTLE', '#fff4d6', '#c9c2e6', null],
  KAPOW: ['KA-POW!', '#fff27a', '#ff3d5e', '#ffd23f'], WHAM: ['WHAMMO!', '#fff27a', '#ff3d5e', '#7df9ff'], ZOK: ['ZOK!!', '#ffffff', '#ffd23f', '#e2413a'],
  SKRITCH: ['SKRITCH…', '#dff0ff', '#8fc4ff', null], FLAP: ['FLAP FLAP', '#ffffff', '#e6dcff', null],
};

// One word, set by hand: every letter a little off its neighbours, fat ink round a two-tone fill.
function setWord([text, top, bottom, burstCol]) {
  const px = 110, pad = burstCol ? 90 : 46;
  const probe = makeCanvas(8, 8).g;
  probe.font = `900 ${px}px ${DISPLAY}`;
  const widths = [...text].map((ch) => probe.measureText(ch).width * 0.96 + 3);
  const tw = widths.reduce((a, b) => a + b, 0), w = Math.min(2000, Math.ceil(tw + pad * 2)), h = px + pad * 2 + 20;
  const { canvas, g } = makeCanvas(w, h), fill = makeCanvas(w, h);
  if (burstCol) {
    g.beginPath();
    const n = 13;
    for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * TAU, r = (i & 1 ? 0.7 : 1) * (0.9 + 0.1 * Math.sin(i * 7.3)); g.lineTo(w / 2 + Math.cos(a) * (w / 2 - 8) * r, h / 2 + Math.sin(a) * (h / 2 - 8) * r); }
    g.closePath();
    g.fillStyle = burstCol; g.fill();
    g.lineWidth = 9; g.lineJoin = 'round'; g.strokeStyle = INK; g.stroke();
  }
  const each = (ctx, fn) => {
    let x = (w - tw) / 2;
    [...text].forEach((ch, i) => {
      ctx.save();
      ctx.translate(x + widths[i] / 2, h / 2 + Math.sin(i * 2.4 + text.length) * 9);
      ctx.rotate(Math.sin(i * 1.7 + 0.6) * 0.09 - 0.05);
      ctx.transform(1, 0, -0.16, 1 + Math.cos(i * 3.1) * 0.06, 0, 0);
      fn(ch);
      ctx.restore();
      x += widths[i];
    });
  };
  for (const ctx of [g, fill.g]) { ctx.font = `900 ${px}px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; }
  each(g, (ch) => { g.fillStyle = INK; g.fillText(ch, 9, 10); g.lineWidth = 24; g.strokeStyle = INK; g.strokeText(ch, 9, 10); g.strokeText(ch, 0, 0); });
  // the fill on its own sheet, so the dots can be cut to the letters
  const grad = fill.g.createLinearGradient(0, h / 2 - px * 0.45, 0, h / 2 + px * 0.45);
  grad.addColorStop(0, top); grad.addColorStop(0.55, top); grad.addColorStop(1, bottom);
  each(fill.g, (ch) => { fill.g.fillStyle = grad; fill.g.fillText(ch, 0, 0); });
  fill.g.globalCompositeOperation = 'source-atop';
  fill.g.fillStyle = bottom;
  for (let j = 0, y = h / 2 - 4; y < h; y += 9, j++) for (let x = (j & 1) * 5; x < w; x += 10) { fill.g.beginPath(); fill.g.arc(x, y, Math.min(4.4, 1 + j * 0.5), 0, TAU); fill.g.fill(); }
  g.drawImage(fill.canvas, 0, 0);
  fill.canvas.width = fill.canvas.height = 1; // hand the sheet back
  return { canvas, w, h };
}

export function makeLetters() {
  const sprites = {};
  for (const k in WORDS) sprites[k] = setWord(WORDS[k]);
  return { sprites, dispose() { for (const k in sprites) sprites[k].canvas.width = sprites[k].canvas.height = 1; } };
}

function caption(g, text, x, y, px, o = {}) {
  g.font = `italic 700 ${px}px ${HAND}`;
  const padX = px * 0.7, w = Math.min(o.maxW || 1e9, g.measureText(text).width + padX * 2), h = px * 1.75;
  const x0 = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
  g.fillStyle = INK; g.fillRect(x0 + px * 0.22, y + px * 0.22, w, h);
  g.fillStyle = o.fill || YEL; g.fillRect(x0, y, w, h);
  g.lineWidth = Math.max(1.5, px * 0.14); g.strokeStyle = INK; g.strokeRect(x0, y, w, h);
  g.fillStyle = o.color || INK; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, x0 + w / 2, y + h * 0.54, w - padX * 1.2);
  return w;
}
function inked(g, text, x, y, px, fill, align = 'center') {
  g.font = `900 ${px}px ${DISPLAY}`;
  g.textAlign = align; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.lineWidth = Math.max(3, px * 0.3); g.strokeStyle = INK; g.strokeText(text, x, y);
  g.fillStyle = fill; g.fillText(text, x, y);
}
function tick(g, x0, y0, x1, y1, wd) {
  g.lineCap = 'round';
  g.strokeStyle = INK; g.lineWidth = wd + 3; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  g.strokeStyle = PAPER; g.lineWidth = wd; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
}
function path(g, pts, n) {
  g.beginPath();
  for (let i = 0; i < n; i++) { if (i) g.lineTo(pts[i * 2], pts[i * 2 + 1]); else g.moveTo(pts[0], pts[1]); }
}

export function drawOverlay(g, S, L) {
  const w = S.w, h = S.h, ui = S.ui, cx = w / 2, cy = h / 2;
  g.save();
  g.lineJoin = 'round';

  // ---- motion arcs: a leap in flight leaves its line on the page ----
  for (const a of S.arcs) {
    if (a.a <= 0.01 || a.n < 2) continue;
    g.globalAlpha = Math.min(1, a.a);
    g.setLineDash([]);
    g.lineCap = 'round';
    path(g, a.pts, a.n); g.strokeStyle = INK; g.lineWidth = 9 * ui; g.stroke();
    path(g, a.pts, a.n); g.strokeStyle = a.color; g.lineWidth = 4.5 * ui; g.stroke();
  }
  g.globalAlpha = 1;
  // ---- where LEAP would take you (the ring itself is drawn into the world) ----
  const lp = S.leap;
  if (lp.a > 0.01 && lp.n >= 2) {
    g.globalAlpha = lp.a * (lp.ready ? 1 : 0.4);
    g.setLineDash([12 * ui, 8 * ui]);
    g.lineDashOffset = -S.t * 40 * ui;
    g.lineCap = 'butt';
    path(g, lp.pts, lp.n); g.strokeStyle = INK; g.lineWidth = 7.5 * ui; g.stroke();
    path(g, lp.pts, lp.n); g.strokeStyle = lp.ready ? YEL : PAPER; g.lineWidth = 3.5 * ui; g.stroke();
    g.setLineDash([]);
    if (lp.tag && lp.seen) inked(g, lp.tag, lp.x, lp.y - lp.ry - 16 * ui, Math.max(12, 16 * ui), YEL);
    g.globalAlpha = 1;
  }

  // ---- the other sniper, the tells, the name tags ----
  for (const m of S.marks) {
    if (m.a <= 0.02) continue;
    g.globalAlpha = Math.min(1, m.a);
    if (!m.on) {
      // off the page: an arrow on the border, pointing the way
      const r = Math.min(w, h) * 0.4, ax = cx + Math.sin(m.ang) * r * (w / h) * 0.8, ay = cy - Math.cos(m.ang) * r * 0.82;
      g.save(); g.translate(clamp(ax, 40, w - 40), clamp(ay, 70, h - 60)); g.rotate(m.ang);
      g.beginPath(); g.moveTo(0, -16 * ui); g.lineTo(12 * ui, 8 * ui); g.lineTo(0, 2 * ui); g.lineTo(-12 * ui, 8 * ui); g.closePath();
      g.fillStyle = m.color; g.fill(); g.lineWidth = 3 * ui; g.strokeStyle = INK; g.stroke();
      g.restore();
      continue;
    }
    const s = (m.kind === 'tell' ? 7 : 9) * ui, y = m.y - 6 * ui + (m.kind === 'foe' ? Math.sin(S.t * 5) * 2 * ui : 0);
    g.beginPath(); g.moveTo(m.x, y); g.lineTo(m.x - s, y - s * 1.5); g.lineTo(m.x + s, y - s * 1.5); g.closePath();
    g.fillStyle = m.hollow ? PAPER : m.color; g.fill(); g.lineWidth = 3 * ui; g.strokeStyle = INK; g.stroke();
    if (m.text) inked(g, m.text, m.x, y - s * 1.5 - 11 * ui, Math.max(11, 14 * ui), m.kind === 'me' ? YEL : PAPER);
  }
  g.globalAlpha = 1;

  // ---- sound effects ----
  for (const p of S.pops) {
    if (!p.on) continue;
    const sp = L.sprites[p.word];
    const u = p.t / p.dur, k = u < 0.16 ? ease.outBack(u / 0.16) : 1 + (u - 0.16) * 0.12, a = u > 0.72 ? 1 - (u - 0.72) / 0.28 : 1;
    const sc = (p.px / 150) * k;
    g.globalAlpha = a;
    g.save(); g.translate(p.x, p.y - (u * 18 * ui * p.rise)); g.rotate(p.rot + Math.sin(u * 30) * 0.02 * (1 - u));
    g.drawImage(sp.canvas, -sp.w * sc / 2, -sp.h * sc / 2, sp.w * sc, sp.h * sc);
    g.restore();
  }
  g.globalAlpha = 1;

  // ---- the reticle ----
  if (S.live && S.alive && S.splash.a <= 0) {
    if (S.scope > 0.5) {
      const a = (S.scope - 0.5) * 2, R = Math.min(w, h) * 0.36;
      g.globalAlpha = a;
      g.strokeStyle = INK; g.lineCap = 'butt';
      g.lineWidth = 2 * ui;
      g.beginPath();
      g.moveTo(cx - R, cy); g.lineTo(cx - 14 * ui, cy); g.moveTo(cx + 14 * ui, cy); g.lineTo(cx + R, cy);
      g.moveTo(cx, cy - R * 0.8); g.lineTo(cx, cy - 14 * ui); g.moveTo(cx, cy + 14 * ui); g.lineTo(cx, cy + R * 0.8);
      g.stroke();
      g.lineWidth = 4 * ui;
      g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx - R * 0.55, cy); g.moveTo(cx + R * 0.55, cy); g.lineTo(cx + R, cy); g.stroke();
      // hold-over rungs: how far the round has dropped by then
      for (const hd of S.holds) {
        const y = cy + hd.px;
        if (y > cy + R * 0.78) continue;
        g.lineWidth = 2 * ui;
        g.beginPath(); g.moveTo(cx - 12 * ui, y); g.lineTo(cx + 12 * ui, y); g.stroke();
        g.font = `700 ${Math.max(9, 11 * ui)}px ${HAND}`; g.fillStyle = INK; g.textBaseline = 'middle';
        const left = hd.label === '100'; // staggered: the rungs sit closer than the type is tall
        g.textAlign = left ? 'right' : 'left';
        g.fillText(hd.label, cx + (left ? -16 : 16) * ui, y);
      }
      g.fillStyle = '#e2413a'; g.beginPath(); g.arc(cx, cy, 2.4 * ui, 0, TAU); g.fill();
      g.lineWidth = 1.5; g.strokeStyle = INK; g.stroke();
      if (S.range > 0) caption(g, `${S.range} M`, cx + R * 0.56, cy + 12 * ui, Math.max(10, 13 * ui), { fill: PAPER });
      g.globalAlpha = 1;
    } else {
      const gap = clamp(S.spreadPx, 7 * ui, h * 0.2), len = 9 * ui, a = 1 - S.scope * 2;
      g.globalAlpha = a;
      tick(g, cx - gap - len, cy, cx - gap, cy, 2.5 * ui); tick(g, cx + gap, cy, cx + gap + len, cy, 2.5 * ui);
      tick(g, cx, cy - gap - len, cx, cy - gap, 2.5 * ui); tick(g, cx, cy + gap, cx, cy + gap + len, 2.5 * ui);
      g.fillStyle = INK; g.beginPath(); g.arc(cx, cy, 2.6 * ui, 0, TAU); g.fill();
      g.fillStyle = S.blocked ? '#e2413a' : PAPER; g.beginPath(); g.arc(cx, cy, 1.5 * ui, 0, TAU); g.fill();
      g.globalAlpha = 1;
    }
  }

  // ---- narration: ammunition, the reload, the things a newcomer must be told ----
  const cpx = Math.max(11, 16 * ui), midX = S.safeL + (w - S.safeL - S.safeR) / 2, lowY = h - 12 * ui - cpx * 1.75 - (S.touch ? 0 : 4);
  if (S.live && S.alive) {
    if (S.reload > 0) {
      const bw = caption(g, 'MEANWHILE… RELOADING', midX, lowY, cpx, { align: 'center', maxW: w - S.safeL - S.safeR - 16 });
      g.fillStyle = '#e2413a'; g.fillRect(midX - bw / 2 + 3, lowY + cpx * 1.75 - 5 * ui, (bw - 6) * (1 - S.reload), 3.5 * ui);
    } else {
      // rounds as drawn cartridges; the one being chambered rides up into place
      const n = S.mag, bw = 9 * ui, gp = 6 * ui, tw = n * bw + (n - 1) * gp + 22 * ui, x0 = midX - tw / 2, bh = cpx * 1.75;
      g.fillStyle = INK; g.fillRect(x0 + 3 * ui, lowY + 3 * ui, tw, bh);
      g.fillStyle = YEL; g.fillRect(x0, lowY, tw, bh);
      g.lineWidth = Math.max(1.5, cpx * 0.14); g.strokeStyle = INK; g.strokeRect(x0, lowY, tw, bh);
      for (let i = 0; i < n; i++) {
        const bx = x0 + 11 * ui + i * (bw + gp), have = i < S.ammo, top = lowY + bh * 0.2 + (have && i === S.ammo - 1 ? S.cycle * bh * 0.3 : 0);
        roundRect(g, bx, top, bw, bh * 0.6, bw * 0.45);
        g.fillStyle = have ? '#e2413a' : 'rgba(21,15,36,0.16)'; g.fill();
        if (have) { g.lineWidth = 1.5 * ui; g.strokeStyle = INK; g.stroke(); }
      }
    }
    if (S.prompt) caption(g, S.prompt, midX, lowY - cpx * 2.2, cpx, { align: 'center', fill: PAPER, maxW: w - S.safeL - S.safeR - 16 });
  }
  if (S.noteA > 0.01 && S.note) {
    g.globalAlpha = Math.min(1, S.noteA * 2);
    caption(g, S.note, S.touch ? 14 : 18, S.touch ? 50 : 58, cpx, { maxW: w * 0.6 });
    g.globalAlpha = 1;
  }

  // ---- the splash page ----
  const sp = S.splash;
  if (sp.a > 0) {
    // The word lands beside the victim, never on them: the reader must see who took the hit.
    const word = L.sprites[sp.word], u = clamp(sp.t / 0.22, 0, 1), k = ease.outBack(u) * (1 + Math.max(0, sp.t - 0.22) * 0.04);
    const tw = Math.min(w * 0.5, h * 0.9), sc = (tw / word.w) * k;
    const wx = clamp(sp.x + sp.side * w * 0.2, w * 0.3, w * 0.7), wy = clamp(sp.y - h * 0.24, h * 0.24, h * 0.42);
    g.globalAlpha = sp.a;
    g.save(); g.translate(wx, wy); g.rotate(-0.1 * sp.side + Math.sin(sp.t * 40) * 0.012 * Math.max(0, 1 - sp.t * 2));
    g.drawImage(word.canvas, -word.w * sc / 2, -word.h * sc / 2, word.w * sc, word.h * sc);
    g.restore();
    if (sp.t > 0.6 && sp.caption) {
      const cu = ease.outCubic(clamp((sp.t - 0.6) / 0.3, 0, 1)), px = Math.max(12, 19 * ui);
      g.globalAlpha = sp.a * cu;
      caption(g, sp.caption, midX - (1 - cu) * 40, Math.min(h - S.safeB - px * 2.2, h * 0.76), px, { align: 'center', maxW: w * 0.9 });
    }
    g.globalAlpha = 1;
  }

  // ---- the panel border: paper gutter, ink rule ----
  const m = Math.max(3, 5 * ui), bw = Math.max(2, 3 * ui);
  g.fillStyle = PAPER;
  g.fillRect(0, 0, w, m); g.fillRect(0, h - m, w, m); g.fillRect(0, 0, m, h); g.fillRect(w - m, 0, m, h);
  g.lineWidth = bw; g.strokeStyle = INK; g.strokeRect(m + bw / 2, m + bw / 2, w - 2 * m - bw, h - 2 * m - bw);
  g.restore();
}
