// Old film on top of everything (grain, scratches, dust, flicker, vignette, cue marks) and the world's
// own interface: the reticle, the dotted arc, speech-bubble prompts, name tags, the iris and the spotlights.
import { clamp, makeCanvas } from '../../kit.js';
import { C, FONT, boil, hash1, blobPath } from './ink.js';

export function makeFilm() {
  const tiles = [];
  for (let k = 0; k < 3; k++) {
    const { canvas, g } = makeCanvas(160, 160);
    const im = g.createImageData(160, 160), d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = Math.random();
      const v = r < 0.5 ? 255 : 10;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = Math.random() < 0.5 ? 0 : (r < 0.5 ? 70 : 90) * Math.random();
    }
    g.putImageData(im, 0, 0);
    tiles.push(canvas);
  }
  const vig = makeCanvas(160, 90);
  {
    const g = vig.g;
    const gr = g.createRadialGradient(80, 45, 28, 80, 45, 100);
    gr.addColorStop(0, 'rgba(27,22,18,0)');
    gr.addColorStop(0.55, 'rgba(27,22,18,0.12)');
    gr.addColorStop(1, 'rgba(27,22,18,0.62)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 160, 90);
  }
  let pats = null, patOf = null;
  return {
    draw(g, w, h, T, strength = 1) {
      const f = boil.f;
      if (patOf !== g) { patOf = g; pats = tiles.map((t) => g.createPattern(t, 'repeat')); }
      // grain: a different tile at a random offset every frame
      g.save();
      g.globalAlpha = 0.5 * strength;
      g.translate(Math.floor(Math.random() * 160), Math.floor(Math.random() * 160));
      g.fillStyle = pats[f % 3] || pats[0];
      if (g.fillStyle) g.fillRect(-160, -160, w + 320, h + 320);
      g.restore();
      // vignette + flicker
      g.globalAlpha = clamp(0.88 + (hash1(f * 1.9) - 0.5) * 0.3 + Math.sin(T * 7.3) * 0.05, 0.6, 1); // the lamp flickers
      g.drawImage(vig.canvas, 0, 0, w, h);
      g.globalAlpha = 1;
      // scratches: a couple of long vertical hairlines that jump about
      g.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        if (hash1(f * 2.3 + k * 17.1) > 0.3) continue;
        const x = hash1(f * 5.1 + k * 3.3) * w, y0 = hash1(f * 1.1 + k) * h * 0.6, len = h * (0.3 + hash1(f * 8.8 + k) * 0.7);
        g.strokeStyle = k === 1 ? 'rgba(27,22,18,0.35)' : 'rgba(255,250,235,0.45)';
        g.lineWidth = 1 + hash1(k + f) * 0.8;
        g.beginPath(); g.moveTo(x, y0); g.lineTo(x + (hash1(f + k * 4) - 0.5) * 8, y0 + len); g.stroke();
      }
      // dust and a stray hair
      g.fillStyle = 'rgba(27,22,18,0.55)';
      for (let k = 0; k < 4; k++) {
        if (hash1(f * 3.7 + k * 9.1) > 0.45) continue;
        g.beginPath(); g.arc(hash1(f * 6.1 + k) * w, hash1(f * 2.9 + k * 5) * h, 0.8 + hash1(f + k * 2) * 2, 0, 6.283); g.fill();
      }
      if (hash1(f * 0.77) > 0.93) {
        const x = hash1(f * 0.31) * w, y = hash1(f * 0.57) * h;
        g.strokeStyle = 'rgba(27,22,18,0.5)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 18, y - 14, x + 30, y + 10, x + 52, y + 2); g.stroke();
      }
      // reel-change cue marks, top right, now and then
      if ((T % 11.3) < 0.18) {
        g.fillStyle = 'rgba(255,250,235,0.8)'; g.strokeStyle = 'rgba(27,22,18,0.6)'; g.lineWidth = 1.5;
        g.beginPath(); g.arc(w - 30, 34, 7, 0, 6.283); g.fill(); g.stroke();
      }
    },
  };
}

/** Everything outside a growing circle goes black. */
export function drawIris(g, w, h, cx, cy, r) {
  g.save();
  g.fillStyle = C.ink;
  g.beginPath();
  g.rect(-10, -10, w + 20, h + 20);
  if (r > 1) { g.moveTo(cx + r, cy); g.arc(cx, cy, r, 0, 6.283, false); }
  g.fill('evenodd');
  if (r > 1) { g.strokeStyle = 'rgba(242,234,216,0.5)'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, r, 0, 6.283); g.stroke(); }
  g.restore();
}

/** Sudden death: the house lights go down and a spotlight finds each sniper. Coordinates are screen px. */
export function drawSpots(g, w, h, spots, alpha, T) {
  g.save();
  g.fillStyle = `rgba(20,16,12,${alpha})`;
  g.beginPath();
  g.rect(-10, -10, w + 20, h + 20);
  for (const s of spots) { g.moveTo(s.x + s.r, s.y); g.arc(s.x, s.y, s.r, 0, 6.283, false); }
  g.fill('evenodd');
  g.lineWidth = 3;
  for (const s of spots) {
    g.strokeStyle = s.col; g.globalAlpha = 0.7 + 0.3 * Math.sin(T * 9);
    g.beginPath(); g.arc(s.x, s.y, s.r, 0, 6.283); g.stroke();
  }
  g.restore();
}

const widthCache = new Map();
function textW(g, s, px) {
  const key = s + '|' + px;
  let v = widthCache.get(key);
  if (v === undefined) { g.font = `700 ${px}px ${FONT}`; v = g.measureText(s).width; if (widthCache.size > 200) widthCache.clear(); widthCache.set(key, v); }
  return v;
}

/** A speech bubble: tail at (x, y), body above it. u = world units per screen pixel. */
export function bubble(g, x, y, lines, u, T, col, alpha = 1, lo = -1e9, hi = 1e9, top = -1e9) {
  const px = Math.round(13 * u * 100) / 100, pad = 8 * u, lh = px * 1.25;
  let wmax = 0;
  for (const l of lines) wmax = Math.max(wmax, textW(g, l, px));
  const bw = wmax + pad * 2, bh = lines.length * lh + pad * 1.6;
  const bx = clamp(x - bw / 2, lo + 6 * u, Math.max(lo + 6 * u, hi - bw - 6 * u)), by = Math.max(top + 54 * u, y - 16 * u - bh) + Math.sin(T * 4) * 1.5 * u;
  g.save();
  g.globalAlpha = alpha;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(bx + 6 * u, by);
  g.lineTo(bx + bw - 6 * u, by); g.quadraticCurveTo(bx + bw, by, bx + bw, by + 6 * u);
  g.lineTo(bx + bw, by + bh - 6 * u); g.quadraticCurveTo(bx + bw, by + bh, bx + bw - 6 * u, by + bh);
  const tx = clamp(x, bx + 14 * u, bx + bw - 14 * u);
  g.lineTo(tx + 7 * u, by + bh); g.lineTo(x, y); g.lineTo(tx - 7 * u, by + bh);
  g.lineTo(bx + 6 * u, by + bh); g.quadraticCurveTo(bx, by + bh, bx, by + bh - 6 * u);
  g.lineTo(bx, by + 6 * u); g.quadraticCurveTo(bx, by, bx + 6 * u, by);
  g.closePath();
  g.fillStyle = '#fbf6e8'; g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 3 * u; g.stroke();
  g.fillStyle = col; g.fillRect(bx + 2 * u, by + bh - 6 * u, bw - 4 * u, 3 * u);
  g.font = `700 ${px}px ${FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = C.ink;
  lines.forEach((l, i) => g.fillText(l, bx + bw / 2, by + pad * 0.8 + lh * (i + 0.5)));
  g.restore();
}

/** The cursor of this world: a hand-drawn bullseye (a daisy in the owner's tint). */
export function drawReticle(g, x, y, u, col, charge, T, ready, reload = 0) {
  const r = (13 + charge * 6) * u;
  g.save();
  g.translate(x, y);
  g.rotate(charge * 1.2);
  g.lineCap = 'round';
  g.strokeStyle = C.ink; g.lineWidth = 5.5 * u;
  blobPath(g, 0, 0, r, r, 3, 0.7 * u, 12); g.stroke();
  g.beginPath(); for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2; g.moveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5); g.lineTo(Math.cos(a) * r * 1.45, Math.sin(a) * r * 1.45); } g.stroke();
  g.strokeStyle = ready ? col : '#f7f0de'; g.lineWidth = 2.6 * u;
  blobPath(g, 0, 0, r, r, 3, 0.7 * u, 12); g.stroke();
  g.beginPath(); for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2; g.moveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5); g.lineTo(Math.cos(a) * r * 1.45, Math.sin(a) * r * 1.45); } g.stroke();
  if (reload > 0.01) { // re-corking: a ring that closes, with a cork rammed in at the end
    g.save(); g.rotate(-charge * 1.2);
    g.strokeStyle = C.ink; g.lineWidth = 7 * u; g.beginPath(); g.arc(0, 0, r * 1.75, -Math.PI / 2, -Math.PI / 2 + (1 - reload) * 6.283); g.stroke();
    g.strokeStyle = '#f7f0de'; g.lineWidth = 3.4 * u; g.beginPath(); g.arc(0, 0, r * 1.75, -Math.PI / 2, -Math.PI / 2 + (1 - reload) * 6.283); g.stroke();
    g.restore();
  }
  if (charge > 0.02) { // the longer you hold, the more of the ring fills
    g.strokeStyle = col; g.lineWidth = 5 * u;
    g.beginPath(); g.arc(0, 0, r * 1.75, -Math.PI / 2, -Math.PI / 2 + charge * 6.283); g.stroke();
  }
  g.restore();
}

/** The predicted arc as ink dots; `n` points in pts (x, y pairs), the first `lit` seconds worth drawn. */
export function drawArc(g, pts, n, u, col, fadeFrom, T = 0) {
  g.save();
  for (let i = 2; i < n; i++) {
    const k = i / n, a = k > fadeFrom ? 1 - (k - fadeFrom) / (1 - fadeFrom) : 1;
    if (a <= 0.02) break;
    const x = pts[i * 2], y = pts[i * 2 + 1];
    const r = (6.4 - k * 2.4) * u;
    g.globalAlpha = a;
    g.fillStyle = C.ink;
    g.beginPath(); g.arc(x, y, r + 1.8 * u, 0, 6.283); g.fill();
    g.fillStyle = i & 1 ? col : '#f7f0de';
    g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
  }
  g.restore();
}

/** A name tag over a sniper: the local one wears a bouncing YOU arrow. */
export function drawTag(g, x, y, name, local, col, u, T) {
  g.save();
  const px = 12 * u;
  if (local) {
    const by = y - 6 * u + Math.sin(T * 6) * 3 * u;
    g.beginPath(); g.moveTo(x, by); g.lineTo(x - 11 * u, by - 14 * u); g.lineTo(x + 11 * u, by - 14 * u); g.closePath();
    g.fillStyle = col; g.fill(); g.strokeStyle = C.ink; g.lineWidth = 3 * u; g.lineJoin = 'round'; g.stroke();
    g.font = `900 ${px}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.lineWidth = 4 * u; g.strokeStyle = C.ink; g.strokeText('YOU', x, by - 18 * u);
    g.fillStyle = '#fff'; g.fillText('YOU', x, by - 18 * u);
  } else {
    g.font = `800 ${px}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.lineWidth = 4 * u; g.strokeStyle = C.ink; g.lineJoin = 'round'; g.strokeText(name, x, y - 8 * u);
    g.fillStyle = col; g.fillText(name, x, y - 8 * u);
  }
  g.restore();
}

