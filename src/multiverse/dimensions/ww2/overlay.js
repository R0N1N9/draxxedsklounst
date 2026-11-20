// IRON AUTUMN — what is drawn on the glass: the scope and its three-post reticle, the
// open-sight crosshair, the clip, markers, warnings. Stencilled paper-and-ember, nothing
// that would look out of place chalked on an ammunition crate.
import { clamp, rgba, TAU } from '../../kit.js';

const PAPER = '#e9dfc8', EMBER = '#e8853a', RED = '#e2472f', MONO = "'JetBrains Mono', Menlo, monospace";

let minPx = 8.5; // the smallest label: raised on a phone, where it is read at arm's length on a small glass
function label(g, text, x, y, size, color, align = 'center', alpha = 1) {
  g.font = `600 ${Math.max(minPx, size)}px ${MONO}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = `rgba(0,0,0,${0.7 * alpha})`;
  g.fillText(text, x + 1, y + 1);
  g.fillStyle = rgba(color, alpha);
  g.fillText(text, x, y);
}

function chevron(g, x, y, s, color, alpha, hollow) {
  g.beginPath();
  g.moveTo(x - s, y - s * 1.1);
  g.lineTo(x, y);
  g.lineTo(x + s, y - s * 1.1);
  g.lineTo(x, y - s * 0.55);
  g.closePath();
  g.lineWidth = 3;
  g.strokeStyle = `rgba(0,0,0,${0.75 * alpha})`;
  g.stroke();
  if (hollow) { g.lineWidth = 1.5; g.strokeStyle = rgba(color, alpha); g.stroke(); }
  else { g.fillStyle = rgba(color, alpha); g.fill(); }
}

// S: the frame's view state, assembled by the game (see index.js → hudState).
export function drawOverlay(g, S) {
  const { w, h } = S, cx = w / 2, cy = h / 2, u = clamp(Math.min(w, h) / 720, 0.62, 1.35); // UI scale
  minPx = h < 480 ? 11 : 8.5;
  g.lineCap = 'butt';
  g.lineJoin = 'miter';

  // ---- markers in the world ----
  for (let i = 0; i < S.marks.length; i++) {
    const m = S.marks[i];
    if (m.a <= 0.02) continue;
    if (m.on) {
      if (m.kind === 'ping') {
        const s = 6 * u;
        g.beginPath(); g.moveTo(m.x, m.y - s); g.lineTo(m.x + s, m.y); g.lineTo(m.x, m.y + s); g.lineTo(m.x - s, m.y); g.closePath();
        g.lineWidth = 3; g.strokeStyle = `rgba(0,0,0,${0.7 * m.a})`; g.stroke();
        g.lineWidth = 1.5; g.strokeStyle = rgba(m.color, m.a); g.stroke();
        label(g, 'MUZZLE FLASH', m.x, m.y - 14 * u, 9 * u, m.color, 'center', m.a);
      } else {
        chevron(g, m.x, m.y - 4 * u, 7 * u, m.color, m.a, m.hollow);
        if (m.text) label(g, m.text, m.x, m.y - 20 * u, 10 * u, m.color, 'center', m.a);
        if (m.ring) { g.beginPath(); g.arc(m.x, m.y + 12 * u, (10 + 6 * Math.sin(S.t * 6)) * u, 0, TAU); g.lineWidth = 1.5; g.strokeStyle = rgba(m.color, m.a * 0.7); g.stroke(); }
      }
    } else if (m.kind !== 'ping') {
      // Off screen: an arrow on an ellipse inside the frame, clear of the corners' controls.
      const rx = w * 0.4, ry = h * 0.34, ax = cx + Math.sin(m.ang) * rx;
      let ay = cy - Math.cos(m.ang) * ry;
      // ...and, on a phone, above the thumbs' buttons (S.sl / S.sr / S.sb: ctx.safe, 0 elsewhere).
      if (S.sb > 0 && ay > h - S.sb - 14 && (ax < S.sl + 12 || ax > w - S.sr - 12)) ay = h - S.sb - 14;
      g.save();
      g.translate(ax, ay);
      g.rotate(m.ang);
      chevron(g, 0, -4 * u, 8 * u, m.color, m.a, m.hollow);
      g.restore();
    }
  }

  // ---- the scope ----
  if (S.scope > 0.01) {
    const R = Math.min(w, h) * (0.47 + (1 - S.scope) * 0.5), a = Math.min(1, S.scope * 1.4);
    g.fillStyle = `rgba(0,0,0,${0.96 * a})`;
    g.beginPath();
    g.rect(0, 0, w, h);
    g.arc(cx, cy, R, 0, TAU, true);
    g.fill();
    const grad = g.createRadialGradient(cx, cy, R * 0.72, cx, cy, R);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${0.75 * a})`);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cy, R, 0, TAU);
    g.fill();
    if (S.scope > 0.6) {
      // Three posts: the tip of the lower one is the point of aim.
      const k = (S.scope - 0.6) / 0.4, t = Math.max(2.5, R * 0.016), gap = R * 0.085;
      g.fillStyle = `rgba(6,6,6,${0.95 * k})`;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + t, cy + t * 3.2);
      g.lineTo(cx + t, cy + R);
      g.lineTo(cx - t, cy + R);
      g.lineTo(cx - t, cy + t * 3.2);
      g.closePath();
      g.fill();
      g.fillRect(cx - R, cy - t * 0.8, R - gap, t * 1.6);
      g.fillRect(cx + gap, cy - t * 0.8, R - gap, t * 1.6);
      g.strokeStyle = `rgba(6,6,6,${0.5 * k})`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(cx - gap, cy); g.lineTo(cx - 3, cy); g.moveTo(cx + 3, cy); g.lineTo(cx + gap, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy - gap);
      g.stroke();
      if (S.cycling) label(g, S.reloading ? 'RELOADING' : 'BOLT', cx, cy + R * 0.42, 11 * u, PAPER, 'center', 0.8 * k);
    }
  } else if (S.live && S.alive) {
    // Open sights: four ticks that spread with the rifle's wobble.
    const r = Math.max(5, S.spreadPx);
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 3.5;
    for (let pass = 0; pass < 2; pass++) {
      g.beginPath();
      g.moveTo(cx - r - 7 * u, cy); g.lineTo(cx - r, cy); g.moveTo(cx + r, cy); g.lineTo(cx + r + 7 * u, cy);
      g.moveTo(cx, cy - r - 7 * u); g.lineTo(cx, cy - r); g.moveTo(cx, cy + r); g.lineTo(cx, cy + r + 7 * u);
      g.stroke();
      g.strokeStyle = S.cycling ? rgba(PAPER, 0.45) : PAPER;
      g.lineWidth = 1.5;
    }
    g.fillStyle = PAPER;
    g.fillRect(cx - 1, cy - 1, 2, 2);
    if (S.blocked) { g.strokeStyle = RED; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - 5, cy - 5); g.lineTo(cx + 5, cy + 5); g.moveTo(cx + 5, cy - 5); g.lineTo(cx - 5, cy + 5); g.stroke(); }
  }

  // ---- incoming fire: where it came from ----
  for (let i = 0; i < S.hits.length; i++) {
    const t = S.hits[i];
    if (t.a <= 0.02) continue;
    const r = Math.min(w, h) * 0.3;
    g.beginPath();
    g.arc(cx, cy, r, t.ang - Math.PI / 2 - 0.22, t.ang - Math.PI / 2 + 0.22);
    g.lineWidth = 5 * u;
    g.strokeStyle = rgba(t.near ? RED : EMBER, t.a * 0.85);
    g.stroke();
  }

  // ---- cinema bars for the arrival and the kill ----
  if (S.bars > 0.005) {
    const b = h * 0.09 * S.bars;
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, b);
    g.fillRect(0, h - b, w, b);
  }
  if (!S.live) return;

  // ---- the clip: five rounds, bottom centre, clear of both thumbs ----
  const by = h - 30 * u - S.pad, bw = 7 * u, bh = 20 * u, sp = 12 * u, x0 = cx - (sp * 4 + bw) / 2;
  for (let i = 0; i < S.mag; i++) {
    const x = x0 + i * sp, on = i < S.ammo;
    g.beginPath();
    g.moveTo(x, by + bh); g.lineTo(x, by + bh * 0.38); g.lineTo(x + bw / 2, by); g.lineTo(x + bw, by + bh * 0.38); g.lineTo(x + bw, by + bh);
    g.closePath();
    g.fillStyle = on ? '#c9a24a' : 'rgba(0,0,0,0.45)';
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = on ? 'rgba(0,0,0,0.7)' : rgba(PAPER, 0.4);
    g.stroke();
    if (on) { g.fillStyle = '#8a5a2a'; g.fillRect(x, by + bh * 0.84, bw, bh * 0.16); }
  }
  if (S.cycling) {
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(x0, by + bh + 5 * u, sp * 4 + bw, 3 * u);
    g.fillStyle = S.reloading ? EMBER : PAPER;
    g.fillRect(x0, by + bh + 5 * u, (sp * 4 + bw) * (1 - S.cycle), 3 * u);
  }
  label(g, S.crouch ? 'KNEELING' : 'STANDING', x0 - 10 * u, by + bh * 0.55, 9 * u, S.crouch ? EMBER : PAPER, 'right', 0.85);
  if (S.bell > 0) label(g, 'BELL · SHOT MASKED', x0 + sp * 4 + bw + 10 * u, by + bh * 0.55, 9 * u, EMBER, 'left', S.bell);

  // ---- warnings ----
  let wy = h * 0.72;
  if (S.shell > 0) {
    const blink = 0.55 + 0.45 * Math.sin(S.t * 18);
    label(g, 'INCOMING', cx, wy, 22 * u, RED, 'center', blink);
    label(g, 'GET OUT OF THE RING', cx, wy + 19 * u, 10 * u, PAPER, 'center', 0.9);
    const grad = g.createRadialGradient(cx, cy, Math.min(w, h) * 0.35, cx, cy, Math.hypot(w, h) * 0.55);
    grad.addColorStop(0, 'rgba(226,71,47,0)');
    grad.addColorStop(1, `rgba(226,71,47,${0.3 * S.shell * blink})`);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    wy -= 40 * u;
  }
  if (S.exposed) label(g, S.exposed, cx, wy, 11 * u, EMBER, 'center', 0.65 + 0.35 * Math.sin(S.t * 7));
  if (S.zone) label(g, S.zone, cx, h * 0.2 + 34 * u, 11 * u, S.zoneBad ? RED : PAPER, 'center', 0.9);
  if (S.note && S.noteA > 0) label(g, S.note, cx, h * 0.64, 12 * u, PAPER, 'center', Math.min(1, S.noteA));
}
