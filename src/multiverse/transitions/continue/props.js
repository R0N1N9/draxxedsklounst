// CONTINUE? — props drawn in code: the coin, the glove, the coin slot, the countdown ring,
// bursts of arcade confetti. Everything is a pure function of its arguments (no state).
import { clamp01, mixHex, shade, rgba, roundRect, TAU } from '../../kit.js';

export const METALS = {
  gold: { face: '#ffc93a', face2: '#c47c0c', rim: '#fff0a0', edge: '#8e5a08', edge2: '#573404', glint: '#fff7cc' },
  silver: { face: '#cfd9e6', face2: '#7b89a0', rim: '#f2f7ff', edge: '#5b677a', edge2: '#363f4e', glint: '#ffffff' },
  copper: { face: '#f0985f', face2: '#b4562a', rim: '#ffd2b2', edge: '#7a3716', edge2: '#481f0a', glint: '#ffeede' },
};
export function tokenMetal(col) {
  return { face: mixHex(col, '#ffffff', 0.35), face2: col, rim: mixHex(col, '#ffffff', 0.7), edge: shade(col, -0.35), edge2: shade(col, -0.6), glint: '#ffffff' };
}

function starPath(g, r, n = 5, inner = 0.45) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n, rr = i & 1 ? r * inner : r;
    g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
}

/**
 * A coin spinning about its vertical axis (phi), tilted in the picture plane (tilt). Seen edge-on
 * it is a thin reeded strip — the way it slides into a slot. `shine` 0..1 sweeps a glint.
 */
export function drawCoin(g, x, y, r, phi, tilt, m, shine = 0, a = 1) {
  const cs = Math.cos(phi), sn = Math.sin(phi);
  const rx = Math.max(r * Math.abs(cs), r * 0.035), th = r * 0.26;
  const off = sn * th * 0.5;
  g.save();
  g.globalAlpha *= a;
  g.translate(x, y);
  g.rotate(tilt);
  // The edge: two ends and the reeded band between them.
  const e = g.createLinearGradient(-th, 0, th, 0);
  e.addColorStop(0, m.edge2);
  e.addColorStop(0.5, m.edge);
  e.addColorStop(1, m.edge2);
  g.fillStyle = e;
  g.beginPath();
  g.ellipse(-off, 0, rx, r, 0, 0, TAU);
  g.ellipse(off, 0, rx, r, 0, 0, TAU);
  g.fill();
  g.fillRect(Math.min(-off, off), -r, Math.abs(off * 2), r * 2);
  g.strokeStyle = rgba(m.edge2, 0.9);
  g.lineWidth = Math.max(0.6, r * 0.04);
  g.beginPath();
  for (let i = -3; i <= 3; i++) {
    const yy = (i / 3.4) * r;
    g.moveTo(-Math.abs(off), yy);
    g.lineTo(Math.abs(off), yy);
  }
  g.stroke();
  // The face that points at us.
  g.translate(cs >= 0 ? off : -off, 0);
  const gr = g.createRadialGradient(-rx * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.05);
  gr.addColorStop(0, m.rim);
  gr.addColorStop(0.18, m.face);
  gr.addColorStop(1, m.face2);
  g.fillStyle = gr;
  g.beginPath();
  g.ellipse(0, 0, rx, r, 0, 0, TAU);
  g.fill();
  g.strokeStyle = m.edge2;
  g.lineWidth = Math.max(1, r * 0.1);
  g.stroke();
  g.strokeStyle = rgba(m.edge, 0.85);
  g.lineWidth = Math.max(0.8, r * 0.07);
  g.beginPath();
  g.ellipse(0, 0, rx * 0.76, r * 0.76, 0, 0, TAU);
  g.stroke();
  if (rx > r * 0.12) {
    g.save();
    g.scale(Math.abs(cs), 1);
    if (cs >= 0) {
      starPath(g, r * 0.5);
      g.fillStyle = m.edge;
      g.fill();
      starPath(g, r * 0.4);
      g.fillStyle = m.rim;
      g.fill();
    } else {
      g.fillStyle = m.edge;
      g.fillRect(-r * 0.09, -r * 0.5, r * 0.18, r);
      g.fillRect(-r * 0.5, -r * 0.09, r, r * 0.18);
    }
    g.restore();
  }
  if (shine > 0 && shine < 1) {
    // A diagonal glint clipped to the face.
    g.save();
    g.beginPath();
    g.ellipse(0, 0, rx, r, 0, 0, TAU);
    g.clip();
    const p = -r * 1.6 + shine * r * 3.2;
    g.fillStyle = rgba(m.glint, 0.85);
    g.beginPath();
    g.moveTo(p - r * 0.28, -r);
    g.lineTo(p + r * 0.1, -r);
    g.lineTo(p + r * 0.5, r);
    g.lineTo(p + r * 0.12, r);
    g.closePath();
    g.fill();
    g.restore();
  }
  g.restore();
}

/**
 * A cartoon work-glove (no brand, no mascot): palm, four fingers and a thumb as ink-outlined
 * capsules, a striped cuff. (x, y) is the palm's centre, s px per palm width, rot tilts it,
 * curl 0..1 closes the fingers.
 */
export function drawHand(g, x, y, s, rot, col, curl = 0, a = 1) {
  g.save();
  g.globalAlpha *= a;
  g.translate(x, y);
  g.rotate(rot);
  g.scale(s, s);
  const ink = shade(col, -0.7), fill = col, lite = mixHex(col, '#ffffff', 0.45), shd = shade(col, -0.25);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const cap = (x0, y0, x1, y1, w, c) => {
    g.strokeStyle = ink; g.lineWidth = w + 0.1; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  };
  // Cuff.
  g.fillStyle = ink;
  g.fillRect(-0.44, 0.38, 0.88, 0.62);
  g.fillStyle = '#f4f4f4';
  g.fillRect(-0.4, 0.42, 0.8, 0.54);
  g.fillStyle = shd;
  g.fillRect(-0.4, 0.62, 0.8, 0.1);
  // Fingers: curl folds them toward the palm.
  const fl = [0.78, 0.98, 0.9, 0.7];
  for (let i = 0; i < 4; i++) {
    const fx = -0.33 + i * 0.22, len = fl[i] * (1 - curl * 0.55), sp = (i - 1.5) * 0.06 * (1 - curl);
    cap(fx, -0.18, fx + sp * len, -0.18 - len, 0.2, fill);
    cap(fx - 0.04, -0.2, fx - 0.04 + sp * len, -0.2 - len * 0.82, 0.05, lite);
  }
  // Palm.
  g.fillStyle = ink;
  roundRect(g, -0.46, -0.28, 0.92, 0.8, 0.2);
  g.fill();
  g.fillStyle = fill;
  roundRect(g, -0.42, -0.24, 0.84, 0.72, 0.17);
  g.fill();
  g.fillStyle = lite;
  roundRect(g, -0.32, -0.18, 0.5, 0.12, 0.06);
  g.fill();
  // Thumb.
  const ta = -0.9 + curl * 0.55;
  cap(0.4, 0.1, 0.4 + Math.cos(ta) * 0.5, 0.1 + Math.sin(ta) * 0.5, 0.21, fill);
  g.restore();
}

/**
 * The coin slot plate (wU units wide): bezel, slit, a neon tube in `col`, chevrons chasing down at
 * the slit. `light` 0..1 glows the slit; `flash` whites it out.
 */
export function drawSlot(g, era, cx, cy, U, wU, col, t, light, flash, ph) {
  const w = U * wU, h = U * 6.4, x = cx - w / 2, y = cy - h / 2;
  g.save();
  if (era === 'vector') {
    g.fillStyle = 'rgba(0,0,0,0.75)';
    g.fillRect(x, y, w, h);
    g.strokeStyle = rgba(ph, 0.9);
    g.lineWidth = Math.max(1, U * 0.14);
    g.strokeRect(x, y, w, h);
  } else if (era === 'chrome') {
    const mg = g.createLinearGradient(0, y, 0, y + h);
    mg.addColorStop(0, '#f2f2f8');
    mg.addColorStop(0.5, '#767690');
    mg.addColorStop(1, '#2a2a40');
    roundRect(g, x, y, w, h, U * 0.9);
    g.fillStyle = mg;
    g.fill();
    roundRect(g, x + U * 0.5, y + U * 0.5, w - U, h - U, U * 0.6);
    g.fillStyle = '#10102a';
    g.fill();
  } else {
    roundRect(g, x, y, w, h, h / 2);
    g.fillStyle = 'rgba(5,40,65,0.88)';
    g.fill();
    roundRect(g, x, y, w, h, h / 2);
    g.strokeStyle = 'rgba(210,248,255,0.8)';
    g.lineWidth = Math.max(1, U * 0.16);
    g.stroke();
  }
  // Neon tube round the plate, breathing with `light`.
  roundRect(g, x + U * 0.35, y + U * 0.35, w - U * 0.7, h - U * 0.7, era === 'gloss' ? h / 2 - U * 0.3 : U * 0.5);
  g.strokeStyle = rgba(col, 0.3 + 0.55 * light);
  g.lineWidth = Math.max(1.5, U * 0.26);
  g.stroke();
  g.strokeStyle = rgba(mixHex(col, '#ffffff', 0.7), 0.35 + 0.55 * light);
  g.lineWidth = Math.max(0.8, U * 0.09);
  g.stroke();
  // The slit.
  const sw = U * 1.1, sh = U * 4.2;
  const gl = g.createLinearGradient(0, cy - sh / 2, 0, cy + sh / 2);
  gl.addColorStop(0, rgba(col, 0.95 * light));
  gl.addColorStop(1, rgba(col, 0.25 * light));
  g.fillStyle = '#000';
  roundRect(g, cx - sw / 2 - U * 0.3, cy - sh / 2 - U * 0.3, sw + U * 0.6, sh + U * 0.6, U * 0.5);
  g.fill();
  g.fillStyle = gl;
  roundRect(g, cx - sw / 2, cy - sh / 2, sw, sh, sw / 2);
  g.fill();
  if (flash > 0) {
    g.globalAlpha = clamp01(flash);
    g.fillStyle = '#fff';
    roundRect(g, cx - sw / 2, cy - sh / 2, sw, sh, sw / 2);
    g.fill();
    g.globalAlpha = 1;
  }
  // Chevrons above the plate, chasing down into the slit.
  g.fillStyle = col;
  for (let i = 0; i < 3; i++) {
    g.globalAlpha = ((t * 6 + (2 - i)) % 3) < 1 ? 1 : 0.22;
    const py = y - U * (0.9 + i * 1.05), s = U * 0.55;
    g.beginPath();
    g.moveTo(cx - s, py - s * 0.5);
    g.lineTo(cx, py + s * 0.45);
    g.lineTo(cx + s, py - s * 0.5);
    g.lineTo(cx + s, py - s * 1.05);
    g.lineTo(cx, py - s * 0.1);
    g.lineTo(cx - s, py - s * 1.05);
    g.closePath();
    g.fill();
  }
  g.globalAlpha = 1;
  g.restore();
}

/** The countdown dial: a track and a bright arc of `frac` (1 = full) drawn clockwise from 12 o'clock. */
export function drawRing(g, cx, cy, r, frac, col, width, glowA = 1) {
  g.save();
  g.lineCap = 'butt';
  g.lineWidth = width;
  g.strokeStyle = rgba(col, 0.16);
  g.beginPath();
  g.arc(cx, cy, r, 0, TAU);
  g.stroke();
  if (frac > 0.002) {
    g.strokeStyle = rgba(col, 0.55 * glowA);
    g.lineWidth = width * 1.9;
    g.beginPath();
    g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
    g.stroke();
    g.strokeStyle = mixHex(col, '#ffffff', 0.5);
    g.lineWidth = width;
    g.stroke();
    // tick marks at each tenth
  }
  g.lineWidth = Math.max(1, width * 0.3);
  g.strokeStyle = rgba(col, 0.55);
  g.beginPath();
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * TAU - Math.PI / 2, r0 = r + width * 1.2, r1 = r0 + width * (i % 5 === 0 ? 1.6 : 0.8);
    g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
  }
  g.stroke();
  g.restore();
}

/** Closed-form confetti: p = {a, v, gr, s, c, spin} from the plan; tau seconds since the burst. */
export function drawBurst(g, list, x, y, tau, U, life = 0.9) {
  if (tau <= 0 || tau >= life) return;
  const k = tau / life, al = 1 - k * k;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const px = x + Math.cos(p.a) * p.v * U * tau * (1 - 0.35 * k), py = y + Math.sin(p.a) * p.v * U * tau * (1 - 0.35 * k) + p.gr * U * tau * tau;
    const s = p.s * U * (1 - k * 0.5);
    g.globalAlpha = al * 0.95;
    g.fillStyle = p.c;
    g.save();
    g.translate(px, py);
    g.rotate(p.spin * tau);
    g.fillRect(-s / 2, -s / 2, s, s * (p.long ? 2.6 : 1));
    g.restore();
  }
  g.globalAlpha = 1;
}

/** An expanding ring shock (additive look on dark). */
export function drawShock(g, x, y, r, a, col, width) {
  if (a <= 0.01) return;
  g.save();
  g.globalAlpha = a;
  g.strokeStyle = col;
  g.lineWidth = width;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.stroke();
  g.restore();
}
