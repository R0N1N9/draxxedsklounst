// BROKEN REALITY — the 2D layer: the forensic tag on the impact, the pane's failing
// integrity, the caption and score in the void, and the title of the next world, whose
// type arrives broken and heals with the glass. Everything is a function of (script, t).
import { seg, pulse, ease, clamp, clamp01, lerp, rgba, mixHex, fitText, TAU } from '../../kit.js';

export const MONO = `'JetBrains Mono', 'Menlo', 'Courier New', monospace`;
export const SANS = `'Rajdhani', 'Avenir Next Condensed', 'Futura', 'Helvetica Neue', sans-serif`;

// Letter-spaced text (canvas letterSpacing is not in Safari 16). Widths are measured once per string.
const widths = new Map();
function tracked(g, text, x, y, track, align = 'left') {
  const key = g.font + '|' + text;
  let ws = widths.get(key);
  if (!ws) {
    if (widths.size > 200) widths.clear();
    ws = Array.from(text, (ch) => g.measureText(ch).width);
    widths.set(key, ws);
  }
  let total = -track;
  for (const cw of ws) total += cw + track;
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const prev = g.textAlign;
  g.textAlign = 'left';
  let i = 0;
  for (const ch of text) { g.fillText(ch, cx, y); cx += ws[i++] + track; }
  g.textAlign = prev;
  return total;
}

// Draw something as two halves of a broken pane: split along a slanted line through
// (x + off, y), each half slid and turned away from the other by `amt`.
function broken(g, x, y, amt, br, draw) {
  if (amt < 0.004) { draw(); return; }
  const nx = Math.cos(br.ang), ny = Math.sin(br.ang), tx = -ny, ty = nx, L = 6000;
  for (const side of [-1, 1]) {
    g.save();
    g.translate(x + side * br.dx * amt, y + side * br.dy * amt);
    g.rotate(side * br.rot * amt);
    g.translate(-x, -y);
    const px = x + br.off, py = y;
    g.beginPath();
    g.moveTo(px - tx * L, py - ty * L);
    g.lineTo(px + tx * L, py + ty * L);
    g.lineTo(px + tx * L + nx * side * L, py + ty * L + ny * side * L);
    g.lineTo(px - tx * L + nx * side * L, py - ty * L + ny * side * L);
    g.closePath();
    g.clip();
    draw();
    g.restore();
  }
}

// Text that stays legible on anything: a soft dark footing, then the fill.
function inked(g, text, x, y, fill, a, track) {
  g.fillStyle = `rgba(4,4,10,${0.6 * a})`;
  const o = Math.max(1, parseFloat(g.font) * 0.045 || 1);
  if (track) tracked(g, text, x + o, y + o, track, g.textAlign); else g.fillText(text, x + o, y + o);
  g.fillStyle = rgba(fill, a);
  if (track) tracked(g, text, x, y, track, g.textAlign); else g.fillText(text, x, y);
}

// ---------------------------------------------------------------------------
// ACT 1 — the frozen pane
// ---------------------------------------------------------------------------
export function drawAct1(g, w, h, t, S) {
  const T = S.T, u = Math.min(w, h * 1.7), fx = S.focus.x * w, fy = S.focus.y * h;

  // The round arrives: a point of white, two hairline streaks.
  const k = t - T.impact;
  if (k > 0 && k < 0.6) {
    const a = Math.pow(1 - k / 0.6, 2), r = u * (0.03 + 0.2 * ease.outExpo(k / 0.6));
    g.globalCompositeOperation = 'lighter';
    const gr = g.createRadialGradient(fx, fy, 0, fx, fy, r);
    gr.addColorStop(0, `rgba(255,255,255,${a})`);
    gr.addColorStop(0.25, rgba(S.shotCol, 0.55 * a));
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(fx - r, fy - r, r * 2, r * 2);
    const len = u * 0.75 * a * ease.outCubic(seg(k, 0, 0.12));
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const lg = g.createLinearGradient(fx - dx * len, fy - dy * len, fx + dx * len, fy + dy * len);
      lg.addColorStop(0, 'rgba(255,255,255,0)');
      lg.addColorStop(0.5, `rgba(255,255,255,${0.9 * a})`);
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg;
      g.fillRect(fx - dx * len - dy * 0.75, fy - dy * len - dx * 0.75, dx * len * 2 + dy * 1.5, dy * len * 2 + dx * 1.5);
    }
    g.globalCompositeOperation = 'source-over';
  }

  // Light from the far side gathers at the wound before the pane goes.
  const pre = ease.inQuad(seg(t, T.crack1, T.shatter));
  if (pre > 0) {
    const r = u * (0.08 + 0.2 * pre);
    g.globalCompositeOperation = 'lighter';
    const gr = g.createRadialGradient(fx, fy, 0, fx, fy, r);
    gr.addColorStop(0, rgba(S.accentLight, 0.5 * pre));
    gr.addColorStop(1, rgba(S.accentLight, 0));
    g.fillStyle = gr;
    g.fillRect(fx - r, fy - r, r * 2, r * 2);
    g.globalCompositeOperation = 'source-over';
  }

  const out = 1 - seg(t, T.shatter - 0.1, T.shatter + 0.04);
  if (out <= 0) return;

  // The tag: a leader from the impact to who did this, and how.
  const ka = seg(t, T.impact + 0.16, T.impact + 0.5);
  if (ka > 0) {
    const sx = fx < w * 0.56 ? 1 : -1, sy = fy < h * 0.42 ? 1 : -1;
    const e1 = u * 0.085, e2 = u * 0.05, x1 = fx + sx * e1, y1 = fy + sy * e1, x2 = x1 + sx * e2;
    const kd = ease.outCubic(ka);
    g.lineWidth = Math.max(1, u * 0.0022);
    g.lineCap = 'round';
    for (const pass of [0, 1]) {
      g.strokeStyle = pass ? rgba('#ffffff', 0.95 * out) : `rgba(4,4,10,${0.55 * out})`;
      const o = pass ? 0 : 1.5;
      g.beginPath();
      g.arc(fx + o, fy + o, u * 0.012, 0, TAU);
      const l1 = Math.min(1, kd * 1.6), l2 = clamp01(kd * 1.6 - 1);
      const ux = (sx * Math.SQRT1_2) * u * 0.012, uy = (sy * Math.SQRT1_2) * u * 0.012;
      g.moveTo(fx + ux + o, fy + uy + o);
      g.lineTo(lerp(fx + ux, x1, l1) + o, lerp(fy + uy, y1, l1) + o);
      if (l2 > 0) g.lineTo(lerp(x1, x2, l2) + o, y1 + o);
      g.stroke();
    }
    const tx = x2 + sx * u * 0.012, kt = seg(t, T.impact + 0.38, T.impact + 0.72);
    g.textAlign = sx > 0 ? 'left' : 'right';
    g.textBaseline = 'middle';
    const s1 = Math.max(9, u * 0.0135), s2 = Math.max(15, u * 0.04);
    const room = Math.max(60, (sx > 0 ? w - tx : tx) - u * 0.03);
    g.font = `600 ${s1}px ${MONO}`;
    const over = S.tagOver.slice(0, Math.ceil(S.tagOver.length * kt));
    inked(g, over, tx, y1 - s2 * 0.62, '#ffffff', 0.8 * out, s1 * 0.18);
    fitText(g, S.tagMain, room, s2, SANS);
    g.font = '700 ' + g.font;
    inked(g, S.tagMain, tx, y1 + s2 * 0.08, S.shotCol, out * seg(t, T.impact + 0.42, T.impact + 0.6));
    if (S.tagSub.length) {
      g.font = `600 ${Math.max(10, u * 0.017)}px ${MONO}`;
      let cx = tx;
      const parts = sx > 0 ? S.tagSub : S.tagSub.slice().reverse();
      const a3 = out * seg(t, T.impact + 0.55, T.impact + 0.8);
      for (const p of parts) {
        inked(g, p.text, cx, y1 + s2 * 0.82, p.color, a3);
        cx += sx * g.measureText(p.text).width;
      }
    }
  }

  // Structural integrity, failing. It reaches zero as the last cracks close the net.
  const ki = seg(t, T.impact + 0.1, T.impact + 0.35) * out;
  if (ki > 0) {
    const m = Math.max(14, u * 0.035), left = fx > w * 0.5 || fy < h * 0.55; // keep clear of the tag
    const x = left ? m : w - m, y = h - m, val = S.integrity(t), low = val <= 12;
    const blink = low ? 0.55 + 0.45 * Math.sin(t * 34) : 1;
    const col = low ? S.warnCol : '#ffffff';
    g.textAlign = left ? 'left' : 'right';
    g.textBaseline = 'alphabetic';
    const sN = Math.max(26, u * 0.085), sL = Math.max(9, u * 0.0135);
    g.font = `700 ${sN}px ${SANS}`;
    inked(g, `${val}%`, x, y, col, ki * blink);
    // A segmented gauge, emptying.
    const n = 24, gw = Math.max(90, u * 0.2), sw = gw / n, gy = y - sN * 0.98;
    for (let i = 0; i < n; i++) {
      const on = i < Math.ceil((val / 100) * n);
      g.fillStyle = on ? rgba(col, 0.92 * ki * blink) : `rgba(255,255,255,${0.22 * ki})`;
      const bx = left ? x + i * sw : x - gw + i * sw;
      g.fillRect(bx, gy, Math.max(1, sw - 2), Math.max(2, u * 0.006));
    }
    fitText(g, S.integLabel, w * 0.6, sL, MONO);
    g.font = '600 ' + g.font;
    inked(g, S.integLabel, x, gy - sL * 0.75, '#ffffff', 0.82 * ki, sL * 0.16);
  }
}

// ---------------------------------------------------------------------------
// ACT 2 — in the void: what just happened, and the score it leaves
// ---------------------------------------------------------------------------
export function drawVoid(g, w, h, t, S) {
  const T = S.T, u = Math.min(w, h * 1.7);
  const a1 = pulse(t, T.shatter + 0.5, T.pane0 + 0.25, 0.35);
  if (a1 > 0) {
    const kin = ease.outCubic(seg(t, T.shatter + 0.5, T.shatter + 1.1)), kout = ease.inCubic(seg(t, T.pane0 - 0.25, T.pane0 + 0.25));
    const y = h * 0.69 + (1 - kin) * u * 0.02;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const sO = Math.max(9, u * 0.014);
    g.font = `600 ${sO}px ${MONO}`;
    inked(g, S.voidOver, w / 2, y - u * 0.052, S.accentLight, a1 * 0.95, sO * (0.5 - 0.2 * kin));
    const sQ = fitText(g, S.quip, w * 0.88, Math.max(18, u * 0.066), SANS);
    g.font = '700 ' + g.font;
    // The line leaves the way the world did.
    broken(g, w / 2, y, kout, S.breakQ, () => inked(g, S.quip, w / 2, y, '#ffffff', a1));
    g.fillStyle = rgba(S.accentLight, 0.9 * a1);
    const rw = u * 0.09 * kin;
    g.fillRect(w / 2 - rw, y + sQ * 0.62, rw * 2, Math.max(1, u * 0.002));
  }

  const a2 = pulse(t, T.shatter + 1.25, T.pane0 + 0.4, 0.3);
  if (a2 > 0) {
    const y = h * 0.855, sS = Math.max(20, u * 0.06), sN = Math.max(11, u * 0.022), gap = sS * 1.25;
    const kin = ease.outBack(seg(t, T.shatter + 1.25, T.shatter + 1.7));
    g.textBaseline = 'middle';
    g.font = `700 ${sS}px ${SANS}`;
    g.textAlign = 'center';
    inked(g, '—', w / 2, y - sS * 0.04, '#ffffff', 0.7 * a2);
    for (const i of [0, 1]) {
      const p = S.players[i], sx = i ? 1 : -1;
      g.font = `700 ${sS * (p.scored ? 0.85 + 0.15 * kin : 1)}px ${SANS}`;
      g.textAlign = 'center';
      inked(g, String(p.score), w / 2 + sx * gap * 0.62, y, p.color, a2);
      if (p.name) {
        g.textAlign = i ? 'left' : 'right';
        fitText(g, p.name, w * 0.34, sN, MONO);
        g.font = '600 ' + g.font;
        inked(g, p.name, w / 2 + sx * gap * 1.15, y, p.color, a2 * 0.95, sN * 0.12);
      }
    }
    if (S.flag) {
      g.textAlign = 'center';
      const sF = Math.max(9, u * 0.0145);
      g.font = `700 ${sF}px ${MONO}`;
      inked(g, S.flag, w / 2, y + sS * 0.82, S.warnCol, a2 * (0.65 + 0.35 * Math.sin(t * 9)), sF * 0.4);
    }
  }
}

// ---------------------------------------------------------------------------
// ACT 3 — the title of the next world
// ---------------------------------------------------------------------------
export function drawTitle(g, w, h, t, S) {
  const T = S.T, u = Math.min(w, h * 1.7);
  const a = seg(t, T.title, T.title + 0.4) * (1 - seg(t, T.titleOut, T.titleOut + 0.5));
  if (a <= 0) return;
  const cy = h * 0.5, kin = ease.outCubic(seg(t, T.title, T.title + 0.7));
  const mend = 1 - ease.outBack(seg(t, T.mend, T.mend + 0.5)); // 1 = broken, 0 = whole

  // A ribbon of shade behind the type: the picture is still flying into place around it.
  const bh = u * 0.3;
  const band = g.createLinearGradient(0, cy - bh / 2, 0, cy + bh / 2);
  band.addColorStop(0, 'rgba(4,4,10,0)');
  band.addColorStop(0.28, `rgba(4,4,10,${0.62 * a})`);
  band.addColorStop(0.72, `rgba(4,4,10,${0.62 * a})`);
  band.addColorStop(1, 'rgba(4,4,10,0)');
  g.fillStyle = band;
  g.fillRect(0, cy - bh / 2, w, bh);

  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const sName = fitText(g, S.title, w * 0.84, Math.min(u * 0.125, h * 0.24), SANS);
  const sO = Math.max(9, u * 0.0145);
  broken(g, w / 2, cy, mend, S.breakT, () => {
    g.font = `700 ${sName}px ${SANS}`;
    const o = Math.max(1.5, sName * 0.035);
    g.fillStyle = rgba(S.accentDark, 0.95 * a);
    g.fillText(S.title, w / 2 + o, cy + o);
    g.fillStyle = rgba('#ffffff', a);
    g.fillText(S.title, w / 2, cy);
    fitText(g, S.titleOver, w * 0.86, sO, MONO);
    g.font = '600 ' + g.font;
    inked(g, S.titleOver, w / 2, cy - sName * 0.66, S.accentLight, a, sO * (0.6 - 0.3 * kin));
    if (S.tagline) {
      fitText(g, S.tagline, w * 0.8, Math.max(10, u * 0.021), SANS);
      g.font = '600 ' + g.font;
      inked(g, S.tagline, w / 2, cy + sName * 0.64, '#ffffff', 0.9 * a);
    }
  });
  // Hairlines that draw out from the centre, top and bottom of the ribbon.
  const rw = w * 0.36 * kin;
  g.fillStyle = rgba(S.accentLight, 0.85 * a);
  for (const s of [-1, 1]) g.fillRect(w / 2 - rw, cy + s * (sName * 0.66 + sO * 1.9), rw * 2, Math.max(1, u * 0.0018));
  g.font = `600 ${sO}px ${MONO}`;
  inked(g, S.titleFoot, w / 2, cy + sName * 0.66 + sO * 3.6, mixHex(S.accentLight, '#ffffff', 0.5), 0.85 * a, sO * 0.3);
}

// The last crack closes: one small four-pointed glint where it was.
export function drawSeal(g, w, h, t, S) {
  const k = seg(t, S.T.heal1 - 0.28, S.T.heal1 + 0.3);
  if (k <= 0 || k >= 1) return;
  const u = Math.min(w, h * 1.7), x = S.heal.x * w, y = S.heal.y * h, a = Math.sin(k * Math.PI), r = u * (0.02 + 0.07 * ease.outCubic(k));
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.translate(x, y);
  g.rotate(0.5 + k * 0.9);
  g.fillStyle = `rgba(255,255,255,${clamp(a, 0, 1) * 0.9})`;
  for (let i = 0; i < 4; i++) {
    g.rotate(Math.PI / 2);
    g.beginPath();
    g.moveTo(0, -r * 0.07);
    g.lineTo(r, 0);
    g.lineTo(0, r * 0.07);
    g.fill();
  }
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.6);
  gr.addColorStop(0, rgba(S.accentLight, 0.7 * a));
  gr.addColorStop(1, rgba(S.accentLight, 0));
  g.fillStyle = gr;
  g.fillRect(-r, -r, r * 2, r * 2);
  g.restore();
}
