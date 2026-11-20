// TOY BOX — the 2D layer: the reticle, and words. Everything written on screen is a strip
// of embossed label-maker tape, stuck to the thing it describes.
import { clamp, roundRect, TAU } from '../../kit.js';

const PAPER = '#f4ecd8', INK = '#211c17';
const FONT = '"Arial Rounded MT Bold", Futura, "Trebuchet MS", Rajdhani, sans-serif';
export const PROMPTS = {
  kbm: [['CLICK', 'to shoot'], ['hold RIGHT MOUSE', 'to brace: steady aim']],
  touch: [['DRAG here to aim', 'let go to shoot'], ['BRACE', 'kneel: steady aim']],
  gamepad: [['RIGHT STICK aims', 'RT shoots'], ['hold LT', 'to brace: steady aim']],
};

// A strip of tape centred on (x, y): bold word, optional quiet words after it. Returns its width.
function tape(g, x, y, bold, rest, color, px, alpha = 1, ink = '#fff') {
  if (alpha <= 0.01) return 0;
  g.font = `800 ${px}px ${FONT}`;
  const wb = g.measureText(bold).width;
  g.font = `600 ${px * 0.86}px ${FONT}`;
  const wr = rest ? g.measureText(rest).width + px * 0.45 : 0, w = wb + wr + px * 1.3, h = px * 1.75;
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(g, x - w / 2 + 1, y - h / 2 + 2.5, w, h, 3); g.fill();
  g.fillStyle = color;
  roundRect(g, x - w / 2, y - h / 2, w, h, 3); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x - w / 2 + 2, y - h / 2 + 1.5, w - 4, 1.5);
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x - w / 2 + 2, y + h / 2 - 3, w - 4, 1.5);
  g.textBaseline = 'middle'; g.textAlign = 'left';
  // embossed: a dark lip under each letter
  g.font = `800 ${px}px ${FONT}`;
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillText(bold, x - w / 2 + px * 0.65, y + 1.8);
  g.fillStyle = ink; g.fillText(bold, x - w / 2 + px * 0.65, y + 0.6);
  if (rest) {
    g.font = `600 ${px * 0.86}px ${FONT}`;
    g.globalAlpha = alpha * 0.88;
    g.fillText(rest, x - w / 2 + px * 0.65 + wb + px * 0.45, y + 0.8);
  }
  g.restore();
  return w;
}

// Keep a label of width w at (x, y) on screen and out from under the thumbs.
function clear(S, x, y, w) {
  const m = 8;
  let lo = m + w / 2, hi = S.w - m - w / 2;
  if (y > S.h - S.safe.bottom - 16) { lo = Math.max(lo, S.safe.left + m + w / 2); hi = Math.min(hi, S.w - S.safe.right - m - w / 2); }
  return hi < lo ? S.w / 2 : clamp(x, lo, hi);
}

export function drawOverlay(g, S) {
  const t = S.t, me = S.me, foe = S.foe, px = clamp(S.w / 78, 11, 17), small = px * 0.82;
  g.lineCap = 'round';

  // ---- reticle (mouse): the ring is how far the barrel wanders at that range, the pip is where it points right now ----
  const c = S.cursor;
  if (c.on) {
    const r = clamp(c.r, 5, 80), a = c.ready ? 1 : 0.45;
    g.globalAlpha = a;
    for (const [col, lw] of [['rgba(0,0,0,0.55)', 3.4], ['#fff', 1.5]]) {
      g.strokeStyle = col; g.lineWidth = lw;
      g.beginPath(); g.arc(c.x, c.y, r, 0, TAU);
      for (let i = 0; i < 4; i++) { const cx = Math.cos(i * TAU / 4), sy = Math.sin(i * TAU / 4); g.moveTo(c.x + cx * (r + 3), c.y + sy * (r + 3)); g.lineTo(c.x + cx * (r + 9), c.y + sy * (r + 9)); }
      g.stroke();
    }
    g.globalAlpha = 1;
    if (!c.ready) { g.strokeStyle = me.color; g.lineWidth = 3; g.beginPath(); g.arc(c.x, c.y, r + 6, -Math.PI / 2, -Math.PI / 2 + TAU * c.fill); g.stroke(); }
    // the pip
    g.fillStyle = me.color; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(c.px, c.py - 5); g.lineTo(c.px + 5, c.py); g.lineTo(c.px, c.py + 5); g.lineTo(c.px - 5, c.py); g.closePath(); g.stroke(); g.fill();
    if (c.cm) {
      g.font = `600 ${small * 0.9}px "JetBrains Mono", Menlo, monospace`; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText(c.cm, c.x + r + 14, c.y + 1.5);
      g.fillStyle = '#fff'; g.fillText(c.cm, c.x + r + 13, c.y + 0.5);
    }
  }

  // ---- who is who, while the title card is up ----
  if (S.intro > 0.01) {
    const bob = Math.sin(t * 5) * 3;
    for (const [p, word] of [[me, 'YOU'], [foe, 'RIVAL']]) {
      const y = p.hy - px * 2.4 + bob;
      tape(g, clear(S, p.hx, y, 60), y, word, '', p.color, px * 1.1, S.intro, '#1a1410');
      g.globalAlpha = S.intro; g.fillStyle = p.color;
      g.beginPath(); g.moveTo(p.hx - 6, y + px * 0.95); g.lineTo(p.hx + 6, y + px * 0.95); g.lineTo(p.hx, y + px * 0.95 + 8); g.fill();
      g.globalAlpha = 1;
    }
  }

  // ---- the first shots are taught on the rug itself ----
  if (S.prompt > 0.01 && me.alive) {
    const lines = PROMPTS[S.device] || PROMPTS.kbm, first = S.step === 0, L = first ? lines[0] : lines[1];
    let x = me.hx, y = me.hy - px * (2.6 + 2.2 * S.intro);
    if (S.device === 'touch' && first) { x = S.w * 0.74; y = Math.min(S.h * 0.42, S.h - S.safe.bottom - px * 3); } // where the thumb should go
    if (y < S.top + px * 2) y = me.y + px * 2.4;
    g.font = `800 ${px}px ${FONT}`;
    const w = g.measureText(L[0] + L[1]).width + px * 2.4;
    tape(g, clear(S, x, y, w), y, L[0], L[1], PAPER, px * 1.08, S.prompt * (0.88 + 0.12 * Math.sin(t * 4)), INK);
    if (S.device === 'touch' && first) {
      // a thumb-sized ring that slides and lets go
      const u = (t * 0.7) % 1, ax = x - 26 + Math.min(1, u * 1.6) * 52, ay = y + px * 3.4, al = S.prompt * (u > 0.75 ? 1 - (u - 0.75) * 4 : 1);
      g.globalAlpha = al * 0.9; g.strokeStyle = '#fff'; g.lineWidth = 2.5;
      g.beginPath(); g.arc(ax, ay, 15, 0, TAU); g.stroke();
      g.globalAlpha = al * 0.4; g.setLineDash([4, 6]); g.beginPath(); g.moveTo(x - 26, ay); g.lineTo(ax - 15, ay); g.stroke(); g.setLineDash([]);
      g.globalAlpha = 1;
    }
  }

  // ---- things said about a soldier ----
  if (me.alive && S.live) {
    const y = me.y + px * 1.9;
    if (S.spotted > 0.01) tape(g, clear(S, me.x, y, 110), y, 'SPOTTED', 'you are lit up', '#c22f2f', small, S.spotted * (0.7 + 0.3 * Math.sin(t * 14)));
    else if (S.litTag > 0.01) tape(g, clear(S, me.x, y, 120), y, 'IN THE LIGHT', 'easy target', '#b8791c', small, S.litTag);
    else if (S.stuck > 0.01) tape(g, clear(S, me.x, y, 130), y, S.device === 'touch' ? 'TAP BRACE' : 'LET GO OF BRACE', 'to move', PAPER, small, S.stuck, INK);
  }
  if (foe.alive && S.live && S.foeLit > 0.01) {
    const y = foe.hy - px * 1.8, w = tape(g, clear(S, foe.hx, y, 90), y, 'LIT UP', '', '#e8eef5', small, Math.min(1, S.foeLit * 3), '#1a2230');
    g.fillStyle = '#1a2230'; g.globalAlpha = Math.min(1, S.foeLit * 3) * 0.8;
    g.fillRect(clear(S, foe.hx, y, 90) - w / 2 + 4, y + small * 0.62, (w - 8) * clamp(S.foeLit, 0, 1), 2);
    g.globalAlpha = 1;
  }
  if (S.note.a > 0.01) { const y = S.note.y - px * 2.2; tape(g, clear(S, S.note.x, y, 150), y, S.note.bold, S.note.rest, S.note.color, small, Math.min(1, S.note.a * 2.5), INK); }

  // ---- sudden death: nobody can be missed ----
  if (S.sudden && S.live) {
    for (const p of [me, foe]) {
      if (!p.alive) continue;
      const y = p.hy - px * 1.6 - Math.abs(Math.sin(t * 6)) * 6;
      g.fillStyle = p.color; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(p.hx - 13, y - 17); g.lineTo(p.hx + 13, y - 17); g.lineTo(p.hx, y); g.closePath(); g.stroke(); g.fill();
    }
  }
}
