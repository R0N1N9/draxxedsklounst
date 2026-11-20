// Hand lettering. Every word in this world (BONK!, the signs, the speech bubbles) is drawn from a small
// stroke alphabet rather than a system font, so the 1930s title-card look is the same on every device
// and nothing hangs on a typeface only one platform ships. Glyphs are single-line strokes on a cap
// height of 100 units; a fat ink stroke under a thinner coloured one makes the classic outlined
// balloon letter, a lone ink stroke makes the lettering in the bubbles.
import { hash1 } from './ink.js';

// SVG path data, cap height 100, y down, x from 0; [path, advance]
const SRC = {
  A: ['M4 100 L32 0 L60 100 M15 64 L49 64', 64],
  B: ['M8 100 L8 0 L32 0 Q56 0 56 24 Q56 48 30 48 L8 48 M30 48 Q62 48 62 74 Q62 100 34 100 L8 100', 68],
  C: ['M60 18 Q52 0 34 0 Q4 0 4 50 Q4 100 34 100 Q52 100 60 82', 64],
  D: ['M8 0 L8 100 L28 100 Q62 100 62 50 Q62 0 28 0 Z', 68],
  E: ['M56 0 L8 0 L8 100 L56 100 M8 50 L44 50', 60],
  F: ['M56 0 L8 0 L8 100 M8 50 L44 50', 58],
  G: ['M60 16 Q50 0 34 0 Q4 0 4 50 Q4 100 34 100 Q62 100 62 62 L62 56 L38 56', 68],
  H: ['M8 0 L8 100 M60 0 L60 100 M8 50 L60 50', 68],
  I: ['M4 0 L32 0 M18 0 L18 100 M4 100 L32 100', 36],
  J: ['M50 0 L50 70 Q50 100 26 100 Q6 100 4 78', 58],
  K: ['M8 0 L8 100 M58 0 L8 62 M24 46 L60 100', 64],
  L: ['M8 0 L8 100 L54 100', 58],
  M: ['M6 100 L10 0 L38 66 L66 0 L70 100', 76],
  N: ['M8 100 L8 0 L58 100 L58 0', 66],
  O: ['M34 0 Q4 0 4 50 Q4 100 34 100 Q64 100 64 50 Q64 0 34 0 Z', 68],
  P: ['M8 100 L8 0 L34 0 Q60 0 60 27 Q60 54 34 54 L8 54', 64],
  Q: ['M34 0 Q4 0 4 50 Q4 100 34 100 Q64 100 64 50 Q64 0 34 0 Z M38 68 L66 104', 70],
  R: ['M8 100 L8 0 L34 0 Q60 0 60 27 Q60 54 34 54 L8 54 M30 54 L60 100', 66],
  S: ['M58 14 Q50 0 32 0 Q6 0 6 25 Q6 46 32 50 Q60 54 60 76 Q60 100 32 100 Q12 100 4 84', 64],
  T: ['M2 0 L62 0 M32 0 L32 100', 64],
  U: ['M8 0 L8 66 Q8 100 34 100 Q60 100 60 66 L60 0', 68],
  V: ['M2 0 L32 100 L62 0', 64],
  W: ['M2 0 L18 100 L38 34 L58 100 L74 0', 76],
  X: ['M4 0 L60 100 M60 0 L4 100', 64],
  Y: ['M2 0 L32 50 L62 0 M32 50 L32 100', 64],
  Z: ['M6 0 L58 0 L6 100 L60 100', 64],
  0: ['M32 0 Q6 0 6 50 Q6 100 32 100 Q58 100 58 50 Q58 0 32 0 Z', 64],
  1: ['M14 18 L34 0 L34 100 M16 100 L52 100', 60],
  2: ['M8 22 Q12 0 32 0 Q56 0 56 26 Q56 48 8 100 L58 100', 64],
  3: ['M8 12 Q18 0 32 0 Q56 0 56 24 Q56 48 30 48 Q58 48 58 74 Q58 100 32 100 Q14 100 6 88', 64],
  4: ['M44 100 L44 0 L4 70 L60 70', 64],
  5: ['M56 0 L12 0 L8 44 Q16 38 30 38 Q58 38 58 68 Q58 100 30 100 Q12 100 4 88', 64],
  6: ['M52 6 Q44 0 34 0 Q6 0 6 56 Q6 100 32 100 Q58 100 58 70 Q58 42 32 42 Q12 42 6 60', 64],
  7: ['M4 0 L58 0 L22 100', 62],
  8: ['M32 48 Q8 46 8 24 Q8 0 32 0 Q56 0 56 24 Q56 46 32 48 Q4 50 4 75 Q4 100 32 100 Q60 100 60 75 Q60 50 32 48 Z', 64],
  9: ['M56 44 Q50 60 30 60 Q6 60 6 30 Q6 0 32 0 Q58 0 58 40 Q58 100 28 100 Q16 100 8 94', 64],
  '!': ['M14 0 L12 64 M12 96 L12 97', 26],
  '?': ['M6 20 Q10 0 30 0 Q54 0 54 24 Q54 40 32 50 L30 64 M30 96 L30 97', 60],
  '-': ['M8 54 L40 54', 48],
  ',': ['M14 92 L8 112', 24],
  '.': ['M12 96 L12 97', 24],
  ':': ['M12 36 L12 37 M12 94 L12 95', 24],
  '&': ['M62 100 L18 42 Q4 24 18 8 Q30 -2 42 8 Q52 22 36 38 L14 56 Q2 72 10 86 Q22 104 42 94 Q54 86 62 64', 68],
  "'": ['M12 0 L10 26', 22],
  '·': ['M12 50 L12 51', 24],
  ' ': ['', 30],
};
const GAP = 18; // between glyphs: room for the ink outline
let paths = null;
function glyphs() {
  if (paths) return paths;
  paths = {};
  for (const k in SRC) paths[k] = { p: SRC[k][0] ? new Path2D(SRC[k][0]) : null, a: SRC[k][1] };
  return paths;
}
const glyph = (ch) => glyphs()[ch] || glyphs()['?'];

/** Width in px of `text` lettered at size px (the size a font would be called). */
export function textWidth(text, px) {
  const k = (px * 0.72) / 100;
  let w = 0;
  for (let i = 0; i < text.length; i++) w += glyph(text[i].toUpperCase()).a + GAP;
  return (w - GAP + 30) * k; // the stroke overhangs both ends
}

/**
 * Letter `text` centred on (x, y). o.fill = letter colour (null = ink-only lettering), o.ink = outline
 * colour, o.weight scales the strokes, o.bounce makes each letter hop and tilt to its own beat (t = time),
 * o.shadow drops an ink shadow, o.align 'left' starts at x instead of centring.
 */
export function inkText(g, text, x, y, px, rot = 0, o = OPT) {
  const k = (px * 0.72) / 100;
  if (!(k > 0.01) || !text) return;
  const up = text.toUpperCase();
  const tw = textWidth(up, px) / k;
  const fill = o.fill === undefined ? '#f7f0de' : o.fill, ink = o.ink || '#1b1612', wt = o.weight || 1;
  const bounce = o.bounce || 0, t = o.t || 0;
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.scale(k, k);
  g.translate(o.align === 'left' ? 15 : 15 - tw / 2, -50);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const passes = fill ? (o.shadow ? 3 : 2) : 1;
  for (let pass = 0; pass < passes; pass++) {
    const shadow = o.shadow && pass === 0, last = pass === passes - 1 && fill;
    g.strokeStyle = last ? fill : ink;
    g.lineWidth = (fill ? (last ? 15 : 31) : 14) * wt;
    let cx = 0;
    for (let i = 0; i < up.length; i++) {
      const gl = glyph(up[i]);
      if (gl.p) {
        g.save();
        const h = hash1(i * 3.1 + up.length);
        const r = bounce * ((h - 0.5) * 0.22 + 0.07 * Math.sin(t * 9 + i * 1.7));
        const dy = bounce * (Math.sin(t * 11 + i * 1.3) * 5 + (h - 0.5) * 8);
        g.translate(cx + gl.a / 2 + (shadow ? 7 : 0), 50 + dy + (shadow ? 8 : 0));
        g.rotate(r);
        g.translate(-gl.a / 2, -50);
        g.stroke(gl.p);
        g.restore();
      }
      cx += gl.a + GAP;
    }
  }
  g.restore();
}
const OPT = {};
