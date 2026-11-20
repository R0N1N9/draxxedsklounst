// The cartridge's 16 colours, a Bayer dither, and a hand-made 5x7 bitmap font.
// Everything in the world is drawn from these; nothing anti-aliased ever reaches the buffer.
import { makeCanvas } from '../../kit.js';

export const FW = 320, FH = 180; // the framebuffer, 16:9

export const PAL = {
  ink: '#140c28', night: '#2b1a55', plum: '#54306e', orchid: '#8a4a8c',
  rose: '#c9607f', coral: '#f0805a', peach: '#ffc27d', cream: '#fff1d0',
  amber: '#f2b35b', amberD: '#b86a2c', cyan: '#40d8e8', cyanD: '#2184b0',
  leaf: '#2fbf8f', forest: '#17705f', wood: '#8a5532', steel: '#7a86b8',
};

// Bayer 4x4: a pixel is on when its cell is below the level (0..16).
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];

const patCache = new Map();
/** A repeating dither pattern of `color` at density level 0..16 (for fillStyle). */
export function dither(g, color, level) {
  level = Math.max(0, Math.min(16, Math.round(level)));
  const key = color + level;
  let p = patCache.get(key);
  if (!p) {
    const { canvas, g: pg } = makeCanvas(4, 4);
    pg.fillStyle = color;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (BAYER[(y << 2) | x] < level) pg.fillRect(x, y, 1, 1);
    p = g.createPattern(canvas, 'repeat');
    patCache.set(key, p);
  }
  return p;
}
export const clearPatterns = () => patCache.clear();

/** Fast integer hash -> 0..1, for texture speckle that must not change frame to frame. */
export function hash(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---- font: 5 columns x 7 rows, rows separated by '/' ----
const GLYPHS = {
  A: '.###./#...#/#...#/#####/#...#/#...#/#...#', B: '####./#...#/#...#/####./#...#/#...#/####.',
  C: '.####/#..../#..../#..../#..../#..../.####', D: '####./#...#/#...#/#...#/#...#/#...#/####.',
  E: '#####/#..../#..../####./#..../#..../#####', F: '#####/#..../#..../####./#..../#..../#....',
  G: '.####/#..../#..../#.###/#...#/#...#/.####', H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
  I: '###/.#./.#./.#./.#./.#./###', J: '..###/...#./...#./...#./...#./#..#./.##..',
  K: '#...#/#..#./#.#../##.../#.#../#..#./#...#', L: '#..../#..../#..../#..../#..../#..../#####',
  M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#', N: '#...#/##..#/#.#.#/#..##/#...#/#...#/#...#',
  O: '.###./#...#/#...#/#...#/#...#/#...#/.###.', P: '####./#...#/#...#/####./#..../#..../#....',
  Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#', R: '####./#...#/#...#/####./#.#../#..#./#...#',
  S: '.####/#..../#..../.###./....#/....#/####.', T: '#####/..#../..#../..#../..#../..#../..#..',
  U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.', V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
  W: '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#', X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#..', Z: '#####/....#/...#./..#../.#.../#..../#####',
  0: '.###./#..##/#.#.#/#.#.#/#.#.#/##..#/.###.', 1: '..#../.##../..#../..#../..#../..#../.###.',
  2: '.###./#...#/....#/...#./..#../.#.../#####', 3: '.###./#...#/....#/..##./....#/#...#/.###.',
  4: '...#./..##./.#.#./#..#./#####/...#./...#.', 5: '#####/#..../####./....#/....#/#...#/.###.',
  6: '.###./#..../####./#...#/#...#/#...#/.###.', 7: '#####/....#/...#./..#../.#.../.#.../.#...',
  8: '.###./#...#/#...#/.###./#...#/#...#/.###.', 9: '.###./#...#/#...#/.####/....#/....#/.###.',
  '!': '#/#/#/#/#/./#', '?': '.###./#...#/....#/...#./..#../...../..#..', '.': './././././.#/.#',
  ',': './././././.#/#.', ':': './#/#/./#/#/.', '-': '...../...../...../#####/...../...../.....',
  "'": '#/#/./././.', '/': '....#/...#./...#./..#../.#.../.#.../#....', '+': '...../..#../..#../#####/..#../..#../.....',
  '%': '##..#/##..#/...#./..#../.#.../#..##/#..##', '*': '...../#.#.#/.###./#####/.###./#.#.#/.....',
  '=': '...../#####/...../#####/...../...../.....', '<': '...#/..#./.#../#.../.#../..#./...#', '>': '#.../.#../..#./...#/..#./.#../#...',
  '^': '..#../.###./#.#.#/..#../..#../..#../..#..', v: '..#../..#../..#../#.#.#/.###./..#../..#..',
  '#': '.#.#./#####/.#.#./.#.#./#####/.#.#./.....', '(': '..#/.#./#../#../#../.#./..#', ')': '#../.#./..#/..#/..#/.#./#..',
  ' ': '..../..../..../..../..../..../....',
};
const GLY = {};
for (const k in GLYPHS) GLY[k] = GLYPHS[k].split('/');

const textCache = new Map();
/** Pre-rendered text (cached): {c: canvas, w, h} at 1 px per font pixel. `outline` adds a 1px ink border. */
export function textSprite(str, color, outline = null) {
  const key = str + '|' + color + '|' + outline;
  let t = textCache.get(key);
  if (t) return t;
  if (textCache.size > 160) textCache.clear();
  const s = String(str).toUpperCase();
  let w = 0;
  for (const ch of s) w += (GLY[ch] || GLY['?'])[0].length + 1;
  w = Math.max(1, w - 1);
  const pad = outline ? 1 : 0;
  const { canvas, g } = makeCanvas(w + pad * 2, 7 + pad * 2);
  const paint = (col, dx, dy) => {
    g.fillStyle = col;
    let x = 0;
    for (const ch of s) {
      const gl = GLY[ch] || GLY['?'];
      for (let r = 0; r < 7; r++) {
        const row = gl[r];
        for (let c = 0; c < row.length; c++) if (row[c] === '#') g.fillRect(pad + x + c + dx, pad + r + dy, 1, 1);
      }
      x += gl[0].length + 1;
    }
  };
  if (outline) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) paint(outline, dx, dy);
  paint(color, 0, 0);
  t = { c: canvas, w: canvas.width, h: canvas.height, pad };
  textCache.set(key, t);
  return t;
}
export const textWidth = (str, scale = 1) => textSprite(str, '#fff').w * scale;

/** Draw text with its top-left at (x, y); `align` 'l' | 'c' | 'r' anchors x. scale may be fractional only on the final canvas. */
export function drawText(g, str, x, y, color, scale = 1, align = 'l', outline = null) {
  const t = textSprite(str, color, outline);
  const w = t.w * scale;
  const px = align === 'c' ? x - w / 2 : align === 'r' ? x - w : x;
  g.drawImage(t.c, Math.round(px) - t.pad * scale, Math.round(y) - t.pad * scale, w, t.h * scale);
}
