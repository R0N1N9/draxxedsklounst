// INK CITY — everything painted with a brush rather than built: the palette, the hoardings,
// the rooftop signs and the airship's livery. All brands are invented for this city.
import { makeCanvas, canvasTexture } from '../../kit.js';

export const PAL = {
  ink: '#150f24', paper: '#fff4d6',
  walls: ['#c9583c', '#e0914d', '#93486f', '#5d6fae', '#e2ad4f', '#b04a6a'],
  far: ['#7d3d80', '#5c3884', '#8a3f6e', '#463179', '#a04a70'],
  stone: '#f0dcb4', tar: '#4a3f5e', metal: '#a9bcc9', brick: '#b9523c', wood: '#b36a3c', dark: '#2b1f47', glass: '#ffe9a0',
};
const DISPLAY = '"Futura-CondensedExtraBold", "Impact", "Arial Black", "Helvetica Neue", sans-serif';

function dotsFill(g, x, y, w, h, pitch, r, color) {
  g.fillStyle = color;
  for (let j = 0, yy = y; yy < y + h + pitch; yy += pitch * 0.866, j++) for (let xx = x + (j & 1 ? pitch / 2 : 0); xx < x + w + pitch; xx += pitch) {
    g.beginPath(); g.arc(xx, yy, r, 0, 6.283); g.fill();
  }
}
function burst(g, cx, cy, r0, r1, n, color, rot = 0) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = rot + (i / (n * 2)) * 6.283, r = i & 1 ? r0 : r1; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  g.closePath();
  g.fillStyle = color; g.fill();
  g.lineWidth = 6; g.strokeStyle = PAL.ink; g.lineJoin = 'round'; g.stroke();
}
function label(g, text, x, y, px, fill, o = {}) {
  g.save();
  g.translate(x, y);
  g.rotate(o.rot || 0);
  g.transform(1, 0, o.skew || -0.14, 1, 0, 0);
  g.font = `900 ${px}px ${DISPLAY}`;
  g.textAlign = o.align || 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  if (o.maxW) { const w = g.measureText(text).width; if (w > o.maxW) g.scale(o.maxW / w, 1); }
  g.fillStyle = PAL.ink; g.fillText(text, px * 0.07, px * 0.08);
  g.lineWidth = px * 0.16; g.strokeStyle = PAL.ink; g.strokeText(text, 0, 0);
  g.fillStyle = fill; g.fillText(text, 0, 0);
  g.restore();
}

// Four hoardings, each one flat colours and fat lines so the ink pass can redraw it.
const ADS = [
  (g, w, h) => {
    g.fillStyle = '#ffd23f'; g.fillRect(0, 0, w, h);
    dotsFill(g, 0, 0, w, h, 22, 5, '#ffae2b');
    burst(g, w * 0.26, h * 0.5, h * 0.3, h * 0.46, 11, '#e2413a', 0.2);
    label(g, 'ZAP', w * 0.26, h * 0.5, h * 0.36, '#fff4d6');
    label(g, 'COLA', w * 0.7, h * 0.36, h * 0.4, '#e2413a', { maxW: w * 0.5 });
    label(g, "IT'S ELECTRIC!", w * 0.7, h * 0.76, h * 0.17, '#2b1f47', { maxW: w * 0.5, skew: 0 });
  },
  (g, w, h) => {
    g.fillStyle = '#2bb3a3'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1f8f86'; g.beginPath(); g.moveTo(0, h); g.lineTo(w * 0.5, h * 0.2); g.lineTo(w, h); g.fill();
    label(g, 'ROCKET BOOTS', w * 0.5, h * 0.3, h * 0.3, '#ffd23f', { maxW: w * 0.9 });
    label(g, 'HALF OFF!', w * 0.36, h * 0.72, h * 0.3, '#fff4d6', { maxW: w * 0.55, rot: -0.05 });
    burst(g, w * 0.82, h * 0.7, h * 0.15, h * 0.24, 9, '#e2413a');
    label(g, '1 BOOT', w * 0.82, h * 0.7, h * 0.11, '#fff4d6', { skew: 0, maxW: h * 0.34 });
  },
  (g, w, h) => {
    g.fillStyle = '#e2413a'; g.fillRect(0, 0, w, h);
    dotsFill(g, 0, 0, w, h, 26, 7, '#c22f3c');
    g.fillStyle = '#fff4d6'; g.beginPath(); g.ellipse(w * 0.5, h * 0.52, w * 0.44, h * 0.38, 0, 0, 6.283); g.fill();
    g.lineWidth = 7; g.strokeStyle = PAL.ink; g.stroke();
    label(g, 'DR. VOLT', w * 0.5, h * 0.4, h * 0.3, '#5d6fae', { maxW: w * 0.7 });
    label(g, 'MOUSTACHE WAX', w * 0.5, h * 0.7, h * 0.17, '#2b1f47', { maxW: w * 0.68, skew: 0 });
  },
  (g, w, h) => {
    g.fillStyle = '#5d6fae'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(w * 0.8, h * 0.95, h * 0.5, 0, 6.283); g.fill();
    g.lineWidth = 7; g.strokeStyle = PAL.ink; g.stroke();
    label(g, 'VISIT SUNNY', w * 0.4, h * 0.3, h * 0.24, '#fff4d6', { maxW: w * 0.7 });
    label(g, 'NOWHERE', w * 0.42, h * 0.66, h * 0.4, '#ff8a5c', { maxW: w * 0.74 });
  },
];
const SIGNS = [['NOVA', '#ff5fa2'], ['ORBIT', '#7df9ff'], ['LUXE', '#ffe066'], ['ATOMIC', '#ff8a5c']];

export function makeArt(THREE) {
  const texs = [];
  const tex = (canvas) => { const t = canvasTexture(THREE, canvas, { srgb: false }); t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; texs.push(t); return t; };
  const ads = ADS.map((draw) => {
    const { canvas, g } = makeCanvas(512, 256);
    draw(g, 512, 256);
    g.lineWidth = 14; g.strokeStyle = PAL.paper; g.strokeRect(7, 7, 498, 242);
    return tex(canvas);
  });
  // Rooftop signs: fat letters on nothing (the gaps are cut out), glowing.
  const signs = SIGNS.map(([word, color]) => {
    const { canvas, g } = makeCanvas(512, 160);
    g.font = `900 150px ${DISPLAY}`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const w = g.measureText(word).width, k = Math.min(1, 480 / w);
    g.translate(256, 86); g.scale(k, 1);
    g.lineWidth = 22; g.strokeStyle = PAL.ink; g.strokeText(word, 0, 0);
    g.fillStyle = color; g.fillText(word, 0, 0);
    return tex(canvas);
  });
  // The airship: u runs round the hull, v from tail to nose; the name is painted along both flanks.
  const { canvas, g } = makeCanvas(512, 1024);
  g.fillStyle = '#f6e7c1'; g.fillRect(0, 0, 512, 1024);
  g.fillStyle = '#2bb3a3'; g.fillRect(0, 0, 512, 150);
  g.fillStyle = '#e2413a'; g.fillRect(0, 860, 512, 164);
  for (const u of [0.25, 0.75]) {
    g.fillStyle = '#e2413a'; g.fillRect(512 * u + 34, 150, 14, 710);
    label(g, 'GOLLY! GUM', 512 * u - 14, 512, 96, '#e2413a', { rot: u < 0.5 ? Math.PI / 2 : -Math.PI / 2, skew: 0, maxW: 600 });
  }
  const livery = tex(canvas);
  return { ads, signs, livery, dispose() { for (const t of texs) t.dispose(); } };
}
