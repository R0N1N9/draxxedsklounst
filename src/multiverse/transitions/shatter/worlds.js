// BROKEN REALITY — the other realities. Behind the broken pane drift fragments of panes
// from elsewhere: each is a window onto some other world where, as everywhere, two snipers
// are settling it with one clean shot. They are painted once, small, into an atlas.
import { makeCanvas, rand, randInt, shuffle, rgba, TAU } from '../../kit.js';
import { PLAYER_COLORS } from '../../contract.js';

export const TILE = 256, COLS = 4, ROWS = 2;

// The duel, as seen from very far away: an amber mark, a cyan mark, one tracer between them.
function duel(g, s, y, rng, ink) {
  const xa = s * rand(rng, 0.14, 0.3), xb = s * rand(rng, 0.7, 0.86), ya = y + s * rand(rng, -0.03, 0.03), yb = y + s * rand(rng, -0.03, 0.03);
  g.strokeStyle = rgba(ink, 0.55);
  g.lineWidth = Math.max(1, s * 0.006);
  g.setLineDash([s * 0.03, s * 0.02]);
  g.beginPath();
  g.moveTo(xa, ya);
  g.lineTo(xb, yb);
  g.stroke();
  g.setLineDash([]);
  for (const [x, yy, c] of [[xa, ya, PLAYER_COLORS[0]], [xb, yb, PLAYER_COLORS[1]]]) {
    g.fillStyle = rgba('#000000', 0.35);
    g.beginPath(); g.arc(x, yy, s * 0.03, 0, TAU); g.fill();
    g.fillStyle = c;
    g.beginPath(); g.arc(x, yy, s * 0.02, 0, TAU); g.fill();
  }
}

const vgrad = (g, s, y0, y1, stops) => {
  const gr = g.createLinearGradient(0, y0 * s, 0, y1 * s);
  stops.forEach(([k, c]) => gr.addColorStop(k, c));
  return gr;
};

const PAINT = {
  // A dusk that is all gradient, over a ruled plain.
  dusk(g, s, rng) {
    g.fillStyle = vgrad(g, s, 0, 0.62, [[0, '#160a36'], [0.6, '#a3246e'], [1, '#ff7d55']]);
    g.fillRect(0, 0, s, s);
    const sx = s * rand(rng, 0.38, 0.62), sy = s * 0.5, sr = s * 0.21;
    g.save();
    g.beginPath(); g.arc(sx, sy, sr, 0, TAU); g.clip();
    g.fillStyle = vgrad(g, s, 0.29, 0.71, [[0, '#fff0a0'], [1, '#ff4f86']]);
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#7a1f6a';
    for (let i = 0; i < 5; i++) g.fillRect(0, sy + sr * (0.08 + i * 0.19), s, sr * (0.03 + i * 0.022));
    g.restore();
    g.fillStyle = '#0f0520';
    g.fillRect(0, s * 0.62, s, s);
    g.strokeStyle = '#ff5ea8';
    g.lineWidth = s * 0.006;
    g.beginPath();
    for (let i = 1; i <= 7; i++) { const y = s * (0.62 + 0.38 * Math.pow(i / 7, 2.1)); g.moveTo(0, y); g.lineTo(s, y); }
    for (let i = -8; i <= 8; i++) { g.moveTo(sx + i * s * 0.035, s * 0.62); g.lineTo(sx + i * s * 0.3, s); }
    g.stroke();
    duel(g, s, s * 0.8, rng, '#ffffff');
  },
  // Paper ridges receding into haze under a pale moon.
  ridges(g, s, rng) {
    g.fillStyle = vgrad(g, s, 0, 1, [[0, '#f4ead9'], [1, '#c5d3e6']]);
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#fffaf0';
    g.beginPath(); g.arc(s * rand(rng, 0.25, 0.75), s * 0.24, s * 0.09, 0, TAU); g.fill();
    const cols = ['#b4c2da', '#8b9cc0', '#6071a3', '#3c4a80', '#1d2550'];
    cols.forEach((c, i) => {
      const base = s * (0.42 + i * 0.115), p1 = rng() * TAU, p2 = rng() * TAU, a = s * (0.07 - i * 0.008);
      g.fillStyle = c;
      g.beginPath();
      g.moveTo(0, s);
      for (let x = 0; x <= s; x += s / 32) g.lineTo(x, base - a * (Math.sin((x / s) * 5 + p1) + 0.6 * Math.sin((x / s) * 11 + p2)));
      g.lineTo(s, s);
      g.fill();
    });
    duel(g, s, s * 0.6, rng, '#1d2550');
  },
  // A world that is still only a drawing of itself.
  blueprint(g, s, rng) {
    g.fillStyle = '#123a80';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i <= 16; i++) {
      g.fillStyle = `rgba(255,255,255,${i % 4 ? 0.1 : 0.26})`;
      g.fillRect((i * s) / 16, 0, 1, s);
      g.fillRect(0, (i * s) / 16, s, 1);
    }
    const cx = s * rand(rng, 0.4, 0.6), cy = s * rand(rng, 0.4, 0.6);
    g.strokeStyle = '#eaf2ff';
    g.lineWidth = s * 0.008;
    for (const r of [0.3, 0.19, 0.05]) { g.beginPath(); g.arc(cx, cy, s * r, 0, TAU); g.stroke(); }
    g.lineWidth = s * 0.004;
    g.beginPath();
    g.moveTo(cx - s * 0.4, cy); g.lineTo(cx + s * 0.4, cy); g.moveTo(cx, cy - s * 0.4); g.lineTo(cx, cy + s * 0.4);
    for (let i = -6; i <= 6; i++) { g.moveTo(cx + i * s * 0.05, cy - s * 0.012); g.lineTo(cx + i * s * 0.05, cy + s * 0.012); }
    g.stroke();
    g.save();
    g.translate(cx, cy);
    g.rotate(rand(rng, 0.3, 1.2));
    g.strokeRect(-s * 0.24, -s * 0.13, s * 0.48, s * 0.26);
    g.restore();
    duel(g, s, cy + s * 0.3, rng, '#eaf2ff');
  },
  // Columns of falling glyphs.
  glyphs(g, s, rng) {
    g.fillStyle = '#03130b';
    g.fillRect(0, 0, s, s);
    const n = 14, cw = s / n, ch = s / 18;
    for (let c = 0; c < n; c++) {
      const head = randInt(rng, 3, 20), len = randInt(rng, 4, 13);
      for (let r = 0; r < len; r++) {
        const y = (head - r) * ch;
        if (y < -ch || y > s) continue;
        g.fillStyle = r === 0 ? '#dcffe6' : `rgba(60,${200 + randInt(rng, 0, 55)},110,${(1 - r / len) * 0.85})`;
        const gw = cw * rand(rng, 0.35, 0.7);
        g.fillRect(c * cw + (cw - gw) / 2, y, gw, ch * 0.62);
        if (rng() < 0.4) g.fillRect(c * cw + (cw - gw) / 2, y + ch * 0.2, gw * 0.4, ch * 0.62);
      }
    }
    duel(g, s, s * rand(rng, 0.45, 0.6), rng, '#dcffe6');
  },
  // Four-colour print: a burst, halftone, a fat black hill.
  pop(g, s, rng) {
    g.fillStyle = '#ffd23c';
    g.fillRect(0, 0, s, s);
    const cx = s * rand(rng, 0.35, 0.65), cy = s * 0.56, rot = rng() * TAU;
    g.fillStyle = '#ff8a1f';
    for (let i = 0; i < 9; i++) {
      const a = rot + (i / 9) * TAU;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a) * s * 2, cy + Math.sin(a) * s * 2);
      g.lineTo(cx + Math.cos(a + TAU / 18) * s * 2, cy + Math.sin(a + TAU / 18) * s * 2);
      g.fill();
    }
    g.fillStyle = '#e03a2b';
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const r = (s / 34) * Math.max(0, (x + y) / 30 - 0.22);
      if (r > 0.3) { g.beginPath(); g.arc((x + 0.5 + (y % 2) * 0.5) * (s / 16), (y + 0.5) * (s / 16), r, 0, TAU); g.fill(); }
    }
    g.fillStyle = '#17101a';
    g.beginPath();
    g.moveTo(0, s);
    g.lineTo(0, s * 0.8);
    g.quadraticCurveTo(s * 0.5, s * rand(rng, 0.58, 0.7), s, s * 0.84);
    g.lineTo(s, s);
    g.fill();
    duel(g, s, s * 0.76, rng, '#17101a');
  },
  // A ringed giant in a deep field.
  deep(g, s, rng) {
    g.fillStyle = '#04050e';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 80; i++) {
      g.fillStyle = `rgba(255,255,255,${rand(rng, 0.2, 0.95)})`;
      const r = rng() < 0.12 ? 2 : 1;
      g.fillRect(rng() * s, rng() * s, r, r);
    }
    const cx = s * rand(rng, 0.38, 0.62), cy = s * 0.5, pr = s * 0.2, tilt = rand(rng, -0.5, 0.5);
    const ring = (a0, a1) => {
      g.strokeStyle = '#ffdca6';
      g.lineWidth = s * 0.022;
      g.beginPath(); g.ellipse(cx, cy, pr * 1.75, pr * 0.42, tilt, a0, a1); g.stroke();
      g.strokeStyle = 'rgba(255,220,166,0.4)';
      g.lineWidth = s * 0.012;
      g.beginPath(); g.ellipse(cx, cy, pr * 2.05, pr * 0.5, tilt, a0, a1); g.stroke();
    };
    ring(Math.PI, TAU);
    const gr = g.createRadialGradient(cx - pr * 0.4, cy - pr * 0.4, pr * 0.1, cx, cy, pr);
    gr.addColorStop(0, '#9fb4ff');
    gr.addColorStop(1, '#1a1e5c');
    g.fillStyle = gr;
    g.beginPath(); g.arc(cx, cy, pr, 0, TAU); g.fill();
    ring(0, Math.PI);
    duel(g, s, s * 0.84, rng, '#ffffff');
  },
  // Noon over flat-colour dunes.
  dunes(g, s, rng) {
    g.fillStyle = vgrad(g, s, 0, 0.7, [[0, '#6fcdc6'], [1, '#f7e8bf']]);
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#fff6da';
    g.beginPath(); g.arc(s * rand(rng, 0.25, 0.75), s * 0.36, s * 0.2, 0, TAU); g.fill();
    ['#f2a85c', '#d9713a', '#8c3b28'].forEach((c, i) => {
      const y = s * (0.56 + i * 0.13), k = rand(rng, 0.2, 0.8);
      g.fillStyle = c;
      g.beginPath();
      g.moveTo(0, s);
      g.lineTo(0, y + s * 0.06);
      g.quadraticCurveTo(s * k * 0.6, y - s * 0.1, s * k, y);
      g.quadraticCurveTo(s * (k + 0.2), y + s * 0.09, s, y - s * 0.03);
      g.lineTo(s, s);
      g.fill();
    });
    duel(g, s, s * 0.72, rng, '#5a2416');
  },
  // A moon road on black water.
  ocean(g, s, rng) {
    g.fillStyle = vgrad(g, s, 0, 0.5, [[0, '#060d28'], [1, '#17387a']]);
    g.fillRect(0, 0, s, s);
    const mx = s * rand(rng, 0.3, 0.7);
    g.fillStyle = '#eef5ff';
    g.beginPath(); g.arc(mx, s * 0.26, s * 0.085, 0, TAU); g.fill();
    g.fillStyle = '#050a20';
    g.fillRect(0, s * 0.5, s, s);
    for (let i = 0; i < 16; i++) {
      const y = s * (0.52 + 0.47 * Math.pow(i / 16, 1.3)), wdt = s * (0.05 + 0.3 * (i / 16)) * rand(rng, 0.5, 1);
      g.fillStyle = `rgba(238,245,255,${0.85 - i * 0.04})`;
      g.fillRect(mx - wdt / 2 + rand(rng, -1, 1) * s * 0.03, y, wdt, Math.max(1, s * 0.008));
      g.fillStyle = 'rgba(70,120,220,0.5)';
      g.fillRect(rng() * s, y + s * 0.012, s * rand(rng, 0.06, 0.2), 1);
    }
    duel(g, s, s * 0.5, rng, '#eef5ff');
  },
};

/**
 * Paint the atlas. Tile 0 is the world that has just broken (a keepsake); the other seven
 * are drawn from the eight invented realities, in an order the seed picks.
 */
export function buildAtlas(ctx, rng) {
  const { canvas, g } = makeCanvas(TILE * COLS, TILE * ROWS);
  const names = shuffle(rng, Object.keys(PAINT));
  for (let i = 0; i < COLS * ROWS; i++) {
    g.save();
    g.translate((i % COLS) * TILE, Math.floor(i / COLS) * TILE);
    g.beginPath();
    g.rect(0, 0, TILE, TILE);
    g.clip();
    if (i === 0) {
      const img = ctx.fromImage, iw = img.width || 1, ih = img.height || 1, side = Math.min(iw, ih);
      g.drawImage(img, (iw - side) / 2, (ih - side) / 2, side, side, 0, 0, TILE, TILE);
    } else PAINT[names[i - 1]](g, TILE, rng);
    // A little falloff so each window has depth even before the glass shading.
    const v = g.createRadialGradient(TILE / 2, TILE / 2, TILE * 0.3, TILE / 2, TILE / 2, TILE * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.38)');
    g.fillStyle = v;
    g.fillRect(0, 0, TILE, TILE);
    g.restore();
  }
  return canvas;
}
