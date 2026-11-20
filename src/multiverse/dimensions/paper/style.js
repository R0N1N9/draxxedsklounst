// FLAT OUT — the look: one palette, one ink, and the fat-line material that draws every edge.
// Colours are plain hex strings; lin() turns them into the linear floats the shaders expect so that
// what lands on screen is exactly the hex written here (no lighting, no tone mapping).

export const INK = '#17151d';
export const PAPER = '#f7f1e3';
export const KRAFT = '#cf9b62';
export const ID = ['#ffab1f', '#17c3dc']; // identity colours: warm amber vs cool cyan
export const ID_DARK = ['#d27a00', '#0b8fa8'];
export const CONT = ['#e2603a', '#3f78b5', '#c8403f', '#e7b43c', '#4e9a7e', '#ece3cf', '#7a6cb0'];
export const SKY = ['#8fcbe6', '#b4dcee', '#d9eef3'];
export const GROUND = '#c9cbd1';
export const GROUND_SHADE = '#9fa3b0';
export const YARD_OUT = '#a3a8b3';
export const WALL = '#6f8497';
export const TRIM = '#efe7d2';

const cache = new Map();
let Col = null;
/** Hex → {r, g, b} linear floats (cached). Needs THREE once, via setThree(). */
export function setThree(THREE) { Col = THREE.Color; }
export function lin(hex) {
  let c = cache.get(hex);
  if (!c) {
    const t = new Col(hex);
    c = { r: t.r, g: t.g, b: t.b };
    cache.set(hex, c);
  }
  return c;
}

const mix = (a, b, t) => {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const f = (s) => Math.round(((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t);
  return '#' + ((1 << 24) | (f(16) << 16) | (f(8) << 8) | f(0)).toString(16).slice(1);
};
export const darker = (hex, t) => mix(hex, '#101018', t);
export const lighter = (hex, t) => mix(hex, '#ffffff', t);
/** Flat tone of a box face by its normal: the sun sits over +x, so +x faces are lit, -x faces in shade. */
export function faceTone(hex, nx, ny, nz) {
  if (ny > 0.5) return lighter(hex, 0.18);
  if (nx > 0.5) return hex;
  if (nx < -0.5) return darker(hex, 0.3);
  return darker(hex, 0.13);
}
