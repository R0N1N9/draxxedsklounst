// BREAK POINT — what is drawn on the glass, in surf-shop paint: cream, coral and deep teal.
// The reticle is where the round will actually go (it wanders with the board and tightens
// on one knee); the little cross-section at the bottom is the sea between the two of you
// with your line of sight ruled across it — the whole game in one picture.
import { clamp, rgba, roundRect, TAU } from '../../kit.js';

const CREAM = '#fff1d6', CORAL = '#ff7a4d', INK = '#082430', SEA = '#1fb5a8';
const FONT = "'Rajdhani', 'Avenir Next Condensed', sans-serif", SHOUT = "'Marker Felt', 'Chalkboard SE', 'Rajdhani', sans-serif";

function label(g, text, x, y, px, color, alpha = 1, align = 'center', font = FONT, weight = 700) {
  g.font = `${weight} ${Math.max(9, px)}px ${font}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = Math.max(2.5, px * 0.28);
  g.strokeStyle = rgba(INK, 0.8 * alpha);
  g.strokeText(text, x, y);
  g.fillStyle = rgba(color, alpha);
  g.fillText(text, x, y);
}
function diamond(g, x, y, s, color, alpha, hollow) {
  g.beginPath();
  g.moveTo(x, y - s); g.lineTo(x + s * 0.8, y); g.lineTo(x, y + s); g.lineTo(x - s * 0.8, y);
  g.closePath();
  g.lineWidth = 3.5; g.strokeStyle = rgba(INK, 0.8 * alpha); g.stroke();
  if (hollow) { g.lineWidth = 1.8; g.strokeStyle = rgba(color, alpha); g.stroke(); }
  else { g.fillStyle = rgba(color, alpha); g.fill(); }
}

export function drawOverlay(g, S) {
  const { w, h } = S, cx = w / 2, cy = h / 2, u = clamp(Math.min(w, h) / 720, 0.6, 1.3);
  g.lineCap = 'round';

  // ---- cinema bars for the arrival and the wipe-out ----
  if (S.bars > 0.01) { const b = h * 0.075 * S.bars; g.fillStyle = '#04141b'; g.fillRect(0, 0, w, b); g.fillRect(0, h - b, w, b); }

  // ---- markers in the world ----
  for (const m of S.marks) {
    if (m.a <= 0.02) continue;
    if (m.on) {
      if (m.kind === 'fin') { label(g, '▲ FIN', m.x, m.y, 11 * u, CORAL, m.a); continue; }
      diamond(g, m.x, m.y - 9 * u, 6.5 * u, m.color, m.a, m.hollow);
      if (m.text) label(g, m.text, m.x, m.y - 26 * u, 12 * u, m.color, m.a);
      if (m.sub) label(g, m.sub, m.x, m.y - 39 * u, 9.5 * u, CREAM, m.a * 0.85, 'center', FONT, 600);
    } else if (m.kind === 'foe') {
      // off screen: an arrow on an ellipse that keeps clear of the corners' controls
      const rx = w * 0.3, ry = h * 0.33, ax = cx + Math.sin(m.ang) * rx, ay = cy - Math.cos(m.ang) * ry;
      g.save();
      g.translate(ax, ay);
      g.rotate(m.ang);
      g.beginPath(); g.moveTo(0, -11 * u); g.lineTo(8 * u, 5 * u); g.lineTo(0, 1 * u); g.lineTo(-8 * u, 5 * u); g.closePath();
      g.lineWidth = 3.5; g.strokeStyle = rgba(INK, 0.8 * m.a); g.stroke();
      g.fillStyle = rgba(m.color, m.a); g.fill();
      g.restore();
      if (m.text) label(g, m.text, ax, ay + 18 * u, 11 * u, m.color, m.a);
    }
  }

  // ---- incoming: an arc towards where a near miss came from ----
  for (const t of S.hits) {
    if (t.a <= 0.02) continue;
    const r = Math.min(w, h) * 0.3;
    g.beginPath();
    g.arc(cx, cy, r, t.ang - Math.PI / 2 - 0.2, t.ang - Math.PI / 2 + 0.2);
    g.lineWidth = 5 * u; g.strokeStyle = rgba(CORAL, t.a * 0.85); g.stroke();
  }

  // ---- the reticle ----
  if (S.live && S.alive && !S.under) {
    const x = S.rx, y = S.ry, k = S.brace, col = S.clear ? CREAM : rgba(CREAM, 0.62), r = Math.max(7 * u, S.spreadPx);
    g.lineWidth = 3.4; g.strokeStyle = rgba(INK, 0.55);
    const draw = () => {
      if (k < 0.6) {
        // riding: an open ring that breathes with the board
        g.beginPath();
        for (let i = 0; i < 4; i++) { const a = i * (Math.PI / 2) + Math.PI / 4; g.moveTo(x + Math.cos(a - 0.5) * r, y + Math.sin(a - 0.5) * r); g.arc(x, y, r, a - 0.5, a + 0.5); }
        g.stroke();
      } else {
        // braced: a fine cross with range pips under it
        const gp = 5 * u, L = 26 * u;
        g.beginPath();
        g.moveTo(x - L, y); g.lineTo(x - gp, y); g.moveTo(x + gp, y); g.lineTo(x + L, y);
        g.moveTo(x, y - L); g.lineTo(x, y - gp); g.moveTo(x, y + gp); g.lineTo(x, y + L * 1.6);
        for (let i = 1; i <= 3; i++) { g.moveTo(x - (5 - i) * 1.6 * u, y + gp + i * 9 * u); g.lineTo(x + (5 - i) * 1.6 * u, y + gp + i * 9 * u); }
        g.stroke();
      }
    };
    draw();
    g.lineWidth = 1.6; g.strokeStyle = col;
    draw();
    g.fillStyle = S.ready ? (S.clear ? CORAL : CREAM) : rgba(CREAM, 0.4);
    g.beginPath(); g.arc(x, y, 1.9 * u, 0, TAU); g.fill();
    if (!S.ready && S.cycle > 0) { g.beginPath(); g.arc(x, y, r + 5 * u, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - S.cycle)); g.lineWidth = 2; g.strokeStyle = rgba(CORAL, 0.9); g.stroke(); }
    // the first shot is taught where the eye already is
    if (S.promptA > 0.02) {
      label(g, S.prompt, cx, cy + 62 * u, 17 * u, CREAM, S.promptA);
      if (S.prompt2) label(g, S.prompt2, cx, cy + 82 * u, 12 * u, CREAM, S.promptA * 0.8, 'center', FONT, 600);
    }
  }
  if (S.under) label(g, 'UNDER', cx, cy - 8 * u, 26 * u, CREAM, 0.9, 'center', SHOUT);

  // ---- shouts ----
  if (S.noteA > 0.02) label(g, S.note, cx, h * 0.34, clamp(w / 26, 17, 34), S.noteHot ? CORAL : CREAM, Math.min(1, S.noteA * 2), 'center', SHOUT, 400);

  // ---- bottom centre: the sea between you, and what is in the rifle ----
  if (S.gauge && S.bars < 0.6) {
    const a = 1 - S.bars / 0.6, gw = clamp(w * 0.15, 104, 200), gh = 34 * u, gx = w * 0.585 - gw / 2, gy = h - S.pad - gh - 6, gc = gx + gw / 2;
    g.globalAlpha = a;
    roundRect(g, gx - 6, gy - 6, gw + 12, gh + 12, 8);
    g.fillStyle = rgba(INK, 0.62); g.fill();
    g.save();
    roundRect(g, gx, gy, gw, gh, 5);
    g.clip();
    const n = S.prof.length - 1, sy = gh / 11, base = gy + gh * 0.62, py = (v) => base - v * sy, px = (i) => gx + (i / n) * gw;
    g.beginPath();
    g.moveTo(gx, gy + gh);
    for (let i = 0; i <= n; i++) g.lineTo(px(i), py(S.prof[i]));
    g.lineTo(gx + gw, gy + gh);
    g.closePath();
    g.fillStyle = rgba(SEA, 0.55); g.fill();
    g.beginPath();
    for (let i = 0; i <= n; i++) { if (i) g.lineTo(px(i), py(S.prof[i])); else g.moveTo(px(i), py(S.prof[i])); }
    g.lineWidth = 1.6; g.strokeStyle = rgba(CREAM, 0.9); g.stroke();
    // the sight line
    g.beginPath(); g.moveTo(gx + 3, py(S.eyeA)); g.lineTo(gx + gw - 3, py(S.eyeB));
    g.lineWidth = 1.6; g.setLineDash(S.clear ? [] : [3, 4]); g.strokeStyle = S.clear ? CREAM : rgba(CORAL, 0.95); g.stroke(); g.setLineDash([]);
    g.restore();
    g.fillStyle = S.colA; g.beginPath(); g.arc(gx + 3, py(S.eyeA), 3.6, 0, TAU); g.fill();
    g.fillStyle = S.colB; g.beginPath(); g.arc(gx + gw - 3, py(S.eyeB), 3.6, 0, TAU); g.fill();
    label(g, S.clear ? 'CLEAR SHOT' : S.wall ? 'SPRAY IN THE WAY' : 'CREST IN THE WAY', gc, gy - 15 * u, 11.5 * u, S.clear ? CREAM : CORAL, 1);
    // rounds: four brass shells to the left of the gauge
    const bx = gx - 14 * u, bw = 5 * u, bh = 15 * u;
    for (let i = 0; i < S.mag; i++) {
      const x = bx - i * (bw + 4 * u) - bw, y = gy + gh - bh, on = i < S.ammo;
      roundRect(g, x, y, bw, bh, 2);
      g.fillStyle = on ? '#f3c66a' : rgba(CREAM, 0.16); g.fill();
      if (on) { g.fillStyle = '#ff9a55'; g.fillRect(x, y, bw, 4 * u); }
    }
    if (S.reloading) label(g, 'RELOAD', bx - 2 * (bw + 4 * u), gy + gh - bh - 9 * u, 10 * u, CORAL, 0.6 + 0.4 * Math.sin(S.t * 10));
    // how far apart
    label(g, `${S.dist} M`, gx + gw + 12 * u, gy + gh / 2, 13 * u, CREAM, 0.9, 'left');
    g.globalAlpha = 1;
  }
}
