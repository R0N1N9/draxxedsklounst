// DEV-APP — the design system of the fake software: three themes, type, shadows, icons and
// the pointer. Everything is vector (glyphs such as "play" or "check" are drawn, not typed:
// iOS would swap some of those characters for emoji).
import { roundRect, rgba, mixHex, contrastOn, clamp, TAU } from '../../kit.js';

const UI = `-apple-system, 'SF Pro Text', 'Inter', system-ui, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`;
const RETRO = `'Geneva', 'Verdana', 'Inter', 'DejaVu Sans', sans-serif`;
export const MONO = `'JetBrains Mono', 'SF Mono', Menlo, 'DejaVu Sans Mono', monospace`;
export const DISPLAY = `'Rajdhani', 'Avenir Next Condensed', 'Inter', sans-serif`;

const THEMES = {
  dark: {
    bg: '#0c0e13', chrome: '#181b23', panel: '#14171e', editor: '#101219', well: '#06070a', line: '#272b38', text: '#dfe3ee', dim: '#8088a0', faint: '#4a5167', hl: '#191d28',
    kw: '#c594f0', str: '#9bd67f', num: '#f6a469', com: '#5f6a86', fn: '#7db6ff', prop: '#72d5cb', type: '#ffd27a', cst: '#ffd27a', pun: '#8791ad', id: '#dfe3ee',
    card: '#272b35', cardLine: 'rgba(255,255,255,0.10)', cardText: '#f4f6fb', cardDim: '#a7aec0', btn: '#3b4050', btnText: '#f4f6fb',
    ok: '#3ddc97', err: '#ff6170', warn: '#ffc857', r: 1, hard: false,
  },
  light: {
    bg: '#e6e8ee', chrome: '#f5f6f8', panel: '#fafbfc', editor: '#ffffff', well: '#d9dce4', line: '#dcdfe6', text: '#1d2230', dim: '#6f7689', faint: '#b3b9c7', hl: '#f1f4fa',
    kw: '#8a3ffc', str: '#18794e', num: '#c2540a', com: '#98a0b3', fn: '#1c5fd4', prop: '#0b7285', type: '#a15c00', cst: '#a15c00', pun: '#5d6579', id: '#1d2230',
    card: '#ffffff', cardLine: 'rgba(0,0,0,0.08)', cardText: '#151923', cardDim: '#636b7d', btn: '#e8eaf0', btnText: '#1d2230',
    ok: '#12a56b', err: '#e23d4f', warn: '#c98a00', r: 1, hard: false,
  },
  // Beige box: square corners, ink outlines, hard offset shadows.
  retro: {
    bg: '#b7af98', chrome: '#d6cfba', panel: '#ddd7c4', editor: '#f4efe1', well: '#9f9781', line: '#2e2a22', text: '#27231c', dim: '#6b6453', faint: '#a39b85', hl: '#e9e3cf',
    kw: '#1c4fa8', str: '#9c3a1c', num: '#7a4a00', com: '#7b8765', fn: '#0b6b5e', prop: '#5a3a8c', type: '#8a5a00', cst: '#8a5a00', pun: '#4b4537', id: '#27231c',
    card: '#e4decb', cardLine: '#2e2a22', cardText: '#1f1c16', cardDim: '#5d5748', btn: '#d0c8b1', btnText: '#1f1c16',
    ok: '#1f7a3f', err: '#b3261e', warn: '#8a5a00', r: 0.2, hard: true,
  },
};

export function makeTheme(plan) {
  const th = Object.assign({ key: plan.theme }, THEMES[plan.theme] || THEMES.dark);
  th.brand = plan.brand;
  th.brandText = contrastOn(plan.brand);
  th.brandDark = mixHex(plan.brand, '#000000', 0.22);
  th.brandLight = mixHex(plan.brand, '#ffffff', 0.18);
  th.p0 = plan.p0;
  th.p1 = plan.p1;
  const fam = th.key === 'retro' ? RETRO : UI;
  th.fam = fam;
  th.ui = (px, weight = 400) => `${weight} ${px}px ${fam}`;
  th.mono = (px, weight = 400) => `${weight} ${px}px ${MONO}`;
  return th;
}

// ---------------------------------------------------------------------------
// Shadows. Built from gradients — four edges and four corners — so the penumbra is smooth
// at any size with no shadowBlur (slow at these radii on Safari) and no banding.
// The retro theme gets a hard offset block instead.
// ---------------------------------------------------------------------------
const FALL = [[0, 1], [0.18, 0.62], [0.4, 0.3], [0.65, 0.1], [1, 0]]; // roughly gaussian
const ramp = (grad, alpha, from) => {
  for (const [p, a] of FALL) grad.addColorStop(from + (1 - from) * p, `rgba(0,0,0,${alpha * a})`);
  return grad;
};
export function softShadow(g, x, y, w, h, r, size, alpha, dy = size * 0.28) {
  if (!(size > 0.5) || !(alpha > 0.003)) return;
  y += dy;
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  const s = size, x1 = x + w, y1 = y + h;
  g.fillStyle = `rgba(0,0,0,${alpha})`;
  g.fillRect(x + r, y, w - r * 2, h);
  g.fillRect(x, y + r, r, h - r * 2);
  g.fillRect(x1 - r, y + r, r, h - r * 2);
  g.fillStyle = ramp(g.createLinearGradient(0, y, 0, y - s), alpha, 0);
  g.fillRect(x + r, y - s, w - r * 2, s);
  g.fillStyle = ramp(g.createLinearGradient(0, y1, 0, y1 + s), alpha, 0);
  g.fillRect(x + r, y1, w - r * 2, s);
  g.fillStyle = ramp(g.createLinearGradient(x, 0, x - s, 0), alpha, 0);
  g.fillRect(x - s, y + r, s, h - r * 2);
  g.fillStyle = ramp(g.createLinearGradient(x1, 0, x1 + s, 0), alpha, 0);
  g.fillRect(x1, y + r, s, h - r * 2);
  const from = r / (r + s);
  for (let i = 0; i < 4; i++) {
    const cx = i % 2 ? x1 - r : x + r, cy = i < 2 ? y + r : y1 - r;
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r + s);
    grad.addColorStop(0, `rgba(0,0,0,${alpha})`);
    g.fillStyle = ramp(grad, alpha, from);
    g.fillRect(i % 2 ? cx : cx - r - s, i < 2 ? cy - r - s : cy, r + s, r + s);
  }
}

export function dropShadow(g, th, x, y, w, h, r, size, alpha) {
  if (th.hard) {
    const o = Math.max(3, size * 0.22);
    g.fillStyle = `rgba(20,16,8,${Math.min(0.55, alpha * 1.6)})`;
    g.fillRect(x + o, y + o, w, h);
  } else softShadow(g, x, y, w, h, r, size, alpha);
}

/** Set g.font = mk(px), shrunk so `text` fits maxW (kit.fitText cannot carry a weight). Returns the size used. */
export function fit(g, text, maxW, px, mk) {
  g.font = mk(px);
  const w = g.measureText(text).width;
  if (w > maxW && w > 0) {
    px = Math.max(5, (px * maxW) / w);
    g.font = mk(px);
  }
  return px;
}

/** Text clipped to maxW with an ellipsis. Expects g.font to be set. */
export function trunc(g, s, maxW) {
  if (g.measureText(s).width <= maxW) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (g.measureText(s.slice(0, mid) + '…').width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? s.slice(0, lo) + '…' : '';
}

// ---------------------------------------------------------------------------
// Icons (all centred on cx, cy; s = nominal size)
// ---------------------------------------------------------------------------
export function icoPlay(g, cx, cy, s) {
  g.beginPath();
  g.moveTo(cx - s * 0.36, cy - s * 0.48);
  g.lineTo(cx + s * 0.5, cy);
  g.lineTo(cx - s * 0.36, cy + s * 0.48);
  g.closePath();
  g.fill();
}
export function icoStop(g, cx, cy, s) {
  roundRect(g, cx - s * 0.4, cy - s * 0.4, s * 0.8, s * 0.8, s * 0.12);
  g.fill();
}
export function icoCheck(g, cx, cy, s) {
  g.lineWidth = Math.max(1, s * 0.2);
  g.lineCap = g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(cx - s * 0.42, cy + s * 0.02);
  g.lineTo(cx - s * 0.1, cy + s * 0.34);
  g.lineTo(cx + s * 0.46, cy - s * 0.32);
  g.stroke();
}
export function icoCross(g, cx, cy, s) {
  g.lineWidth = Math.max(1, s * 0.2);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx - s * 0.34, cy - s * 0.34);
  g.lineTo(cx + s * 0.34, cy + s * 0.34);
  g.moveTo(cx + s * 0.34, cy - s * 0.34);
  g.lineTo(cx - s * 0.34, cy + s * 0.34);
  g.stroke();
}
export function icoSpin(g, cx, cy, s, turn) {
  g.lineWidth = Math.max(1, s * 0.18);
  g.lineCap = 'round';
  g.beginPath();
  g.arc(cx, cy, s * 0.4, turn * TAU, turn * TAU + TAU * 0.7);
  g.stroke();
}
export function icoChevron(g, cx, cy, s, open) {
  g.beginPath();
  if (open) {
    g.moveTo(cx - s * 0.4, cy - s * 0.2);
    g.lineTo(cx + s * 0.4, cy - s * 0.2);
    g.lineTo(cx, cy + s * 0.3);
  } else {
    g.moveTo(cx - s * 0.2, cy - s * 0.4);
    g.lineTo(cx + s * 0.3, cy);
    g.lineTo(cx - s * 0.2, cy + s * 0.4);
  }
  g.closePath();
  g.fill();
}
/** A little source-control branch mark. */
export function icoBranch(g, cx, cy, s) {
  g.lineWidth = Math.max(1, s * 0.13);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx - s * 0.25, cy - s * 0.28);
  g.lineTo(cx - s * 0.25, cy + s * 0.3);
  g.moveTo(cx - s * 0.25, cy + s * 0.05);
  g.quadraticCurveTo(cx + s * 0.28, cy + s * 0.05, cx + s * 0.28, cy - s * 0.26);
  g.stroke();
  for (const [dx, dy] of [[-0.25, -0.36], [-0.25, 0.38], [0.28, -0.36]]) {
    g.beginPath();
    g.arc(cx + s * dx, cy + s * dy, s * 0.13, 0, TAU);
    g.fill();
  }
}

/**
 * The app's icon: a cheerful face made of braces on a squircle, with a sparkle that
 * twinkles. Original mark — the one constant across all three themes.
 */
export function appIcon(g, th, x, y, size, t = 0) {
  const r = th.hard ? size * 0.08 : size * 0.26;
  const grad = g.createLinearGradient(x, y, x + size * 0.4, y + size);
  grad.addColorStop(0, th.brandLight);
  grad.addColorStop(1, th.brandDark);
  if (th.hard) { g.fillStyle = th.line; g.fillRect(x + size * 0.06, y + size * 0.06, size, size); }
  roundRect(g, x, y, size, size, r);
  g.fillStyle = grad;
  g.fill();
  if (th.hard) { g.strokeStyle = th.line; g.lineWidth = Math.max(1, size * 0.035); g.stroke(); } else {
    // A soft top light, so the icon reads as a moulded object and not a flat swatch.
    const hi = g.createLinearGradient(x, y, x, y + size * 0.55);
    hi.addColorStop(0, 'rgba(255,255,255,0.28)');
    hi.addColorStop(1, 'rgba(255,255,255,0)');
    roundRect(g, x, y, size, size, r);
    g.fillStyle = hi;
    g.fill();
  }
  const cx = x + size / 2, cy = y + size / 2, ink = th.brandText;
  g.fillStyle = g.strokeStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${size * 0.5}px ${MONO}`;
  g.fillText('{', cx - size * 0.29, cy + size * 0.01);
  g.fillText('}', cx + size * 0.29, cy + size * 0.01);
  g.beginPath();
  g.arc(cx - size * 0.09, cy - size * 0.07, size * 0.036, 0, TAU);
  g.arc(cx + size * 0.09, cy - size * 0.07, size * 0.036, 0, TAU);
  g.fill();
  g.lineWidth = size * 0.045;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(cx, cy - size * 0.01, size * 0.14, Math.PI * 0.18, Math.PI * 0.82);
  g.stroke();
  if (size >= 30) {
    const sx = x + size * 0.86, sy = y + size * 0.13, sr = size * 0.13 * (0.75 + 0.25 * Math.sin(t * 5.2));
    g.fillStyle = '#fff';
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU - Math.PI / 2, rr = i % 2 ? sr * 0.3 : sr;
      g.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  }
}

// ---------------------------------------------------------------------------
// The pointer
// ---------------------------------------------------------------------------
const ARROW = [0, 0, 0, 17, 4.2, 13.2, 7.1, 19.8, 9.9, 18.6, 7.1, 12.2, 12.6, 12.2];

/** kind 'arrow' (tip at x, y) or 'resize' (double arrow centred on x, y, lying along `angle`). */
export function drawPointer(g, x, y, s, kind = 'arrow', angle = 0, press = 0) {
  g.save();
  g.translate(x, y);
  const k = s * (1 - press * 0.1);
  g.scale(k, k);
  g.lineJoin = 'round';
  if (kind === 'resize') {
    g.rotate(angle);
    const path = () => {
      g.beginPath();
      g.moveTo(-10, 0); g.lineTo(-5, -4.6); g.lineTo(-5, -1.6); g.lineTo(5, -1.6); g.lineTo(5, -4.6);
      g.lineTo(10, 0); g.lineTo(5, 4.6); g.lineTo(5, 1.6); g.lineTo(-5, 1.6); g.lineTo(-5, 4.6);
      g.closePath();
    };
    g.save();
    g.translate(1, 1.8);
    path();
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fill();
    g.restore();
    path();
    g.fillStyle = '#fff';
    g.strokeStyle = '#111318';
    g.lineWidth = 1.5;
    g.stroke();
    g.fill();
  } else {
    const path = () => {
      g.beginPath();
      g.moveTo(ARROW[0], ARROW[1]);
      for (let i = 2; i < ARROW.length; i += 2) g.lineTo(ARROW[i], ARROW[i + 1]);
      g.closePath();
    };
    g.save();
    g.translate(1.2, 2.4);
    path();
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fill();
    g.restore();
    path();
    g.fillStyle = '#fff';
    g.strokeStyle = '#111318';
    g.lineWidth = 1.5;
    g.stroke();
    g.fill();
  }
  g.restore();
}

/** The ring a click leaves behind; k = 0..1 over its life. */
export function drawRipple(g, x, y, s, k, color) {
  if (k <= 0 || k >= 1) return;
  const e = 1 - (1 - k) * (1 - k);
  g.strokeStyle = rgba(color, (1 - k) * 0.75);
  g.lineWidth = Math.max(1, 2.2 * s * (1 - k * 0.6));
  g.beginPath();
  g.arc(x, y, (4 + e * 20) * s, 0, TAU);
  g.stroke();
}

/** A push button in the house style. kind 0 = secondary … 1 = primary (fractions blend). */
export function drawButton(g, th, x, y, w, h, o) {
  const kind = o.kind || 0, press = o.press || 0, hover = o.hover || 0, s = o.s || 1;
  const r = Math.min(h / 2, 9 * s * th.r + (th.hard ? 1 : 0));
  let fill = mixHex(th.btn, th.brand, kind);
  if (hover) fill = mixHex(fill, th.key === 'dark' || kind > 0.5 ? '#ffffff' : '#000000', 0.07 * hover);
  if (press) fill = mixHex(fill, '#000000', 0.2 * press);
  if (o.dead) fill = mixHex(fill, th.card, 0.6 * o.dead);
  const push = th.hard ? press * 2 * s : press * 1 * s;
  if (th.hard) {
    g.fillStyle = th.line;
    g.fillRect(x + 3 * s, y + 3 * s, w, h);
  }
  roundRect(g, x + (th.hard ? push : 0), y + push, w, h, r);
  g.fillStyle = fill;
  g.fill();
  if (o.fill > 0) {
    // A progress wash sweeping across the button (the auto-accept countdown).
    g.save();
    g.clip();
    g.fillStyle = rgba('#ffffff', 0.22);
    g.fillRect(x, y, w * clamp(o.fill, 0, 1), h + 4);
    g.restore();
    roundRect(g, x + (th.hard ? push : 0), y + push, w, h, r);
  }
  if (th.hard) {
    g.strokeStyle = th.line;
    g.lineWidth = Math.max(1, 1.5 * s);
    g.stroke();
  } else if (kind < 0.5) {
    g.strokeStyle = th.cardLine;
    g.lineWidth = 1;
    g.stroke();
  } else {
    // Primary buttons get a hairline of light along the top edge.
    g.save();
    g.clip();
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.fillRect(x, y + push, w, Math.max(1, 1.2 * s));
    g.restore();
  }
  const ink = mixHex(th.btnText, th.brandText, kind);
  g.fillStyle = o.dead ? rgba(ink, 1 - 0.55 * o.dead) : ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const px = (o.px || 14) * s;
  g.font = th.ui(px, 600);
  const cx = x + w / 2 + (th.hard ? push : 0), cy = y + h / 2 + push + px * 0.04;
  if (o.labelB && o.roll > 0) {
    // The label rolls over like a counter wheel.
    g.save();
    roundRect(g, x, y + push, w, h, r);
    g.clip();
    g.fillText(o.label, cx, cy - o.roll * h);
    g.fillStyle = mixHex(th.btnText, th.brandText, kind);
    g.fillText(o.labelB, cx, cy + (1 - o.roll) * h);
    g.restore();
  } else g.fillText(trunc(g, o.label, w - 10 * s), cx, cy);
}
