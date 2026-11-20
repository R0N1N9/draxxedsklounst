// LIFE FLASH — the close-up. The push-in on the impact point lands on the loser's face,
// printed like a pulp poster in their identity colour: a marksman's squint, the glint of
// the shot that got them, the shock, and the pupil that opens until it is the whole frame.
import { seg, ease, lerp, clamp01, TAU, rgba, shade, mixHex, makeCanvas, fitText } from '../../kit.js';
import { T } from './script.js';
import { BLACK, HAND, PEN, OSD } from './media.js';
import { hash } from './scenes.js';

const TONE = 1.8; // the halftone sheet overhangs the frame, so the push-in never shows its edge
function halftone(w0, h0) {
  // Dots that grow towards the edges of the face: drawn once, they are the print's shadows.
  const w = Math.min(4096, Math.round(w0 * TONE)), h = Math.min(4096, Math.round(h0 * TONE));
  const { canvas, g } = makeCanvas(w, h);
  const sp = Math.max(7, h0 * 0.02) * (w / (w0 * TONE)), ca = Math.cos(0.5), sa = Math.sin(0.5);
  g.fillStyle = BLACK;
  const n = Math.ceil(Math.hypot(w, h) / sp / 2) + 1;
  for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
    const x = w / 2 + (i * ca - j * sa) * sp, y = h / 2 + (i * sa + j * ca) * sp;
    if (x < -sp || y < -sp || x > w + sp || y > h + sp) continue;
    const dx = ((x - w / 2) / (w * 0.5)) * TONE, dy = ((y - h * 0.5) / (h * 0.5)) * TONE;
    const d = Math.max(Math.abs(dx) * 0.95, Math.pow(Math.abs(dy), 1.4) * 1.05);
    const r = sp * 0.56 * clamp01((d - 0.42) / 0.5);
    if (r < 0.4) continue;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  return canvas;
}

export function makeEye(plan, glintCol) {
  const E = plan.eye;
  let tone = null, toneKey = '';
  const cols = plan.duo ? [plan.cast[0].col, plan.cast[1].col] : [plan.hero.col, plan.hero.col];

  function oneEye(g, side, ex, cy, ew, col, t) {
    const aim = side === E.aim;
    const kS = seg(t, T.shock, T.shock + 0.17), pop = ease.outBack(kS);
    const squint = 1 - 0.1 * Math.sin(t * 5 + side) * (1 - kS);
    const open = lerp((aim ? 0.26 : 0.62) * squint, 1.2, pop);
    const dil = ease.inOutCubic(seg(t, T.dilate - 0.3, T.plunge0 + 0.12));
    const pk = lerp(lerp(0.44, 0.2, ease.outCubic(kS)), 0.93, dil);
    const raise = pop;
    const base = mixHex(col, '#1a0f10', 0.74);
    // socket shadow and brow
    g.fillStyle = shade(base, -0.4);
    g.beginPath(); g.ellipse(ex, cy - ew * 0.38, ew * 1.3, ew * 0.62, 0, 0, TAU); g.fill();
    // the eye itself
    const lx = ex - ew, rx = ex + ew, up = cy - ew * (0.1 + 0.95 * open), dn = cy + ew * (0.08 + 0.6 * open);
    const almond = () => { g.beginPath(); g.moveTo(lx, cy + ew * 0.04); g.quadraticCurveTo(ex, up, rx, cy - ew * 0.02 * side); g.quadraticCurveTo(ex, dn, lx, cy + ew * 0.04); g.closePath(); };
    g.save();
    almond();
    g.fillStyle = '#f4ead6';
    g.fill();
    g.clip();
    const ri = ew * 0.5, gx = ex + side * -0.0 + (1 - kS) * ew * 0.1 * E.dive, gy = cy + ew * 0.02;
    g.fillStyle = shade(col, -0.5);
    g.beginPath(); g.arc(gx, gy, ri, 0, TAU); g.fill();
    g.fillStyle = col;
    g.beginPath(); g.arc(gx, gy, ri * 0.9, 0, TAU); g.fill();
    g.strokeStyle = rgba(shade(col, -0.45), 0.65); g.lineWidth = ri * 0.035; g.lineCap = 'butt';
    g.beginPath();
    for (let i = 0; i < E.spokes; i++) {
      const a = (i / E.spokes) * TAU + hash(i + 7) * 0.12, r0 = ri * (0.3 + 0.2 * hash(i)), r1 = ri * (0.72 + 0.16 * hash(i + 99));
      g.moveTo(gx + Math.cos(a) * r0, gy + Math.sin(a) * r0);
      g.lineTo(gx + Math.cos(a) * r1, gy + Math.sin(a) * r1);
    }
    g.stroke();
    g.fillStyle = rgba(mixHex(col, '#ffffff', 0.5), 0.55);
    g.beginPath(); g.arc(gx, gy, ri * Math.min(0.88, pk + 0.14), 0, TAU); g.fill();
    g.fillStyle = BLACK;
    g.beginPath(); g.arc(gx, gy, ri * pk, 0, TAU); g.fill();
    // the lid's shadow, the window, and the glint of the shot
    const ls = g.createLinearGradient(0, up, 0, up + ew * 0.75);
    ls.addColorStop(0, 'rgba(12,8,6,0.6)'); ls.addColorStop(1, 'rgba(12,8,6,0)');
    g.fillStyle = ls;
    g.fillRect(lx, up - ew * 0.5, ew * 2, ew * 1.25);
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.beginPath(); g.arc(gx - ri * 0.36, gy - ri * 0.36, ri * 0.15, 0, TAU); g.fill();
    g.beginPath(); g.arc(gx + ri * 0.3, gy + ri * 0.34, ri * 0.06, 0, TAU); g.fill();
    const gl = Math.exp(-Math.pow((t - T.shock - 0.04) / 0.13, 2)) + 0.3 * kS * (1 - dil);
    if (gl > 0.01) {
      const sx = gx + ri * 0.16 * -E.dive, sy = gy - ri * 0.04, sr = ri * 0.75 * gl;
      g.fillStyle = rgba(mixHex(glintCol, '#ffffff', 0.25), Math.min(1, gl * 1.4));
      g.beginPath();
      for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4 + 0.2, r = i & 1 ? sr * 0.16 : sr; g.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r); }
      g.closePath(); g.fill();
      g.fillStyle = `rgba(255,255,255,${Math.min(1, gl * 1.6)})`;
      g.beginPath(); g.arc(sx, sy, sr * 0.2, 0, TAU); g.fill();
    }
    g.restore();
    // lids
    g.strokeStyle = BLACK; g.lineCap = 'round'; g.lineJoin = 'round';
    g.lineWidth = ew * 0.115;
    g.beginPath(); g.moveTo(lx - ew * 0.04 * (side < 0 ? 1.5 : 0), cy + ew * 0.05); g.quadraticCurveTo(ex, up, rx + ew * 0.05 * (side > 0 ? 1.5 : 0), cy - ew * 0.03 * side); g.stroke();
    g.lineWidth = ew * 0.035;
    g.globalAlpha = 0.7;
    g.beginPath(); g.moveTo(lx + ew * 0.1, cy + ew * 0.1); g.quadraticCurveTo(ex, dn + ew * 0.01, rx - ew * 0.05, cy + ew * 0.04); g.stroke();
    g.globalAlpha = 1;
    if (E.lash) {
      g.lineWidth = ew * 0.05;
      for (let i = 0; i < 4; i++) {
        const k = 0.62 + i * 0.1, q = side > 0 ? k : 1 - k;
        const px = lerp(lerp(lx, ex, q), lerp(ex, rx, q), q), py = lerp(lerp(cy, up, q), lerp(up, cy, q), q);
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + side * ew * 0.13, py - ew * (0.16 - i * 0.02)); g.stroke();
      }
    }
    // crease and the bag under it
    g.strokeStyle = rgba(BLACK, 0.5); g.lineWidth = ew * 0.04;
    g.beginPath(); g.moveTo(lx + ew * 0.15, cy - ew * 0.2 - ew * 0.3 * open); g.quadraticCurveTo(ex, up - ew * 0.34, rx - ew * 0.1, cy - ew * 0.25 - ew * 0.2 * open); g.stroke();
    g.beginPath(); g.moveTo(lx + ew * 0.35, dn + ew * 0.02); g.quadraticCurveTo(ex, dn + ew * 0.2, rx - ew * 0.3, dn - ew * 0.02); g.stroke();
    // brow: heavy at the nose, worried when raised
    const xi = ex - side * ew * 0.98, xo = ex + side * ew * 1.2;
    const yb = cy - ew * (0.92 + 0.4 * raise) + (aim ? ew * 0.12 * (1 - raise) : 0);
    const inUp = ew * 0.26 * raise - ew * 0.1 * (1 - raise);
    g.fillStyle = BLACK;
    g.beginPath();
    g.moveTo(xi, yb + ew * 0.06 - inUp);
    g.quadraticCurveTo(ex, yb - ew * 0.34 * E.brow, xo, yb + ew * 0.16);
    g.quadraticCurveTo(ex + side * ew * 0.2, yb - ew * 0.06, xi + side * ew * 0.04, yb + ew * 0.36 - inUp);
    g.closePath();
    g.fill();
    if (E.scar && side === E.aim) { g.strokeStyle = base; g.lineWidth = ew * 0.05; g.beginPath(); g.moveTo(ex + side * ew * 0.5, yb - ew * 0.3); g.lineTo(ex + side * ew * 0.62, yb + ew * 0.3); g.stroke(); }
  }

  return {
    /** Paint the face over the whole frame at time t. focus: CSS-pixel impact point. */
    draw(g, w, h, t, focus) {
      const key = `${Math.round(w)}x${Math.round(h)}`;
      if (key !== toneKey) { toneKey = key; tone = halftone(Math.round(w), Math.round(h)); }
      const cy = h * E.y, ew = Math.min(w * 0.13, h * 0.22), spread = Math.max(w * E.spread, ew * 1.55);
      const px = w / 2 + E.dive * spread, py = cy + ew * 0.02;
      const kIn = ease.outCubic(seg(t, T.mix0 - 0.12, T.push1 + 0.3));
      const s0 = lerp(0.6, 1, kIn) * (1 + 0.06 * seg(t, T.push1, T.plunge0));
      const kz = ease.inCubic(seg(t, T.plunge0, T.plunge1)), Z = Math.exp(5.4 * kz);
      if (ew * 0.45 * Z > Math.hypot(w, h)) { g.fillStyle = BLACK; g.fillRect(0, 0, w, h); return; } // inside the pupil
      const kS = seg(t, T.shock, T.shock + 0.5), jolt = Math.sin(kS * 40) * (1 - kS) * (kS > 0 ? 1 : 0) * h * 0.006;
      const cA = plan.duo ? cols : [cols[0], cols[0]];
      const base = (i) => mixHex(cA[i], '#1a0f10', 0.74), mid = (i) => mixHex(cA[i], '#22141a', 0.5);
      g.fillStyle = base(0); g.fillRect(0, 0, w / 2 + 1, h);
      g.fillStyle = base(1); g.fillRect(w / 2, 0, w / 2, h);
      g.save();
      g.translate(lerp(px, w / 2, ease.inOutSine(kz)), lerp(py, h / 2, ease.inOutSine(kz)));
      g.scale(Z, Z);
      g.translate(-px, -py);
      g.translate(lerp(focus.x, w / 2, kIn) + jolt, lerp(focus.y, h / 2, kIn));
      g.rotate(E.tilt * kIn);
      g.scale(s0, s0);
      g.translate(-w / 2, -h / 2);
      // planes of the face
      for (const s of [-1, 1]) {
        const i = s < 0 ? 0 : 1, ex = w / 2 + s * spread;
        g.fillStyle = mid(i);
        g.beginPath(); g.ellipse(ex + s * ew * 0.35, cy + ew * 1.55, ew * 1.7, ew * 0.95, s * -0.12, 0, TAU); g.fill();
        g.beginPath(); g.ellipse(ex + s * ew * 0.2, cy - ew * 1.9, ew * 1.9, ew * 0.5, 0, 0, TAU); g.fill();
        g.save();
        g.beginPath(); g.rect(s < 0 ? -w : w / 2, -h, w * 1.5, h * 3); g.clip();
        // the bridge of the nose: one soft plane, and the shadow that falls off its side
        g.fillStyle = mixHex(mid(i), base(i), 0.35);
        g.beginPath(); g.ellipse(w / 2, cy + ew * 0.7, ew * 0.26, ew * 1.6, 0, 0, TAU); g.fill();
        g.restore();
        g.strokeStyle = rgba(BLACK, 0.4); g.lineWidth = ew * 0.07; g.lineCap = 'round';
        g.beginPath(); g.moveTo(w / 2 + s * ew * 0.3, cy - ew * 0.5); g.quadraticCurveTo(w / 2 + s * ew * 0.22, cy + ew * 0.6, w / 2 + s * ew * 0.5, cy + ew * 1.75); g.stroke();
        if (E.freckles) {
          g.fillStyle = rgba(BLACK, 0.35);
          for (let k = 0; k < 9; k++) { g.beginPath(); g.arc(ex + (hash(k + i * 20) - 0.5) * ew * 1.8, cy + ew * (1.1 + 0.7 * hash(k + 40 + i * 20)), ew * 0.022, 0, TAU); g.fill(); }
        }
      }
      if (Z < 8) g.drawImage(tone, (-w * (TONE - 1)) / 2, (-h * (TONE - 1)) / 2, w * TONE, h * TONE);
      oneEye(g, -1, w / 2 - spread, cy, ew, cA[0], t);
      oneEye(g, 1, w / 2 + spread, cy, ew, cA[1], t);
      // the hat, pulled low
      const hy = cy - ew * 2.35;
      for (const s of [-1, 1]) {
        const col = cA[s < 0 ? 0 : 1];
        g.fillStyle = shade(col, -0.12);
        g.fillRect(s < 0 ? -w : w / 2, hy - h * 2, w * 1.5, h * 2);
        g.fillStyle = col;
        g.fillRect(s < 0 ? -w : w / 2, hy - ew * 0.5, w * 1.5, ew * 0.5);
      }
      g.fillStyle = 'rgba(12,8,6,0.3)';
      for (let x = -w; x < w * 2; x += ew * 0.2) g.fillRect(x, hy - ew * 0.5, ew * 0.07, ew * 0.5);
      const hs = g.createLinearGradient(0, hy, 0, hy + ew * 0.5);
      hs.addColorStop(0, 'rgba(12,8,6,0.6)'); hs.addColorStop(1, 'rgba(12,8,6,0)');
      g.fillStyle = hs;
      g.fillRect(-w, hy, w * 3, ew * 0.5);
      if (plan.duo) { // two snipers, one frame: the panel is split down the middle
        g.fillStyle = BLACK;
        g.beginPath();
        g.moveTo(w / 2 - ew * 0.06, -h);
        for (let i = 0; i <= 8; i++) g.lineTo(w / 2 + (i & 1 ? 1 : -1) * ew * 0.1 + ew * 0.05, -h * 0.2 + (i / 8) * h * 1.4);
        g.lineTo(w / 2 + ew * 0.16, h * 2); g.lineTo(w / 2 - ew * 0.1, h * 2);
        for (let i = 8; i >= 0; i--) g.lineTo(w / 2 + (i & 1 ? 1 : -1) * ew * 0.1 - ew * 0.07, -h * 0.2 + (i / 8) * h * 1.4);
        g.closePath(); g.fill();
      }
      // one bead of sweat
      const sw = seg(t, T.shock + 0.1, T.plunge0);
      if (sw > 0) {
        const sx = w / 2 - E.dive * (spread + ew * 1.3), sy = cy - ew * 0.9 + ease.inQuad(sw) * ew * 1.5, sr = ew * 0.11 * Math.min(1, sw * 5);
        g.fillStyle = 'rgba(214,240,246,0.9)';
        g.beginPath(); g.moveTo(sx, sy - sr * 2.1); g.quadraticCurveTo(sx + sr * 1.3, sy, sx, sy + sr); g.quadraticCurveTo(sx - sr * 1.3, sy, sx, sy - sr * 2.1); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.9)';
        g.beginPath(); g.arc(sx - sr * 0.3, sy, sr * 0.22, 0, TAU); g.fill();
      }
      g.restore();
      // the muzzle flash they saw, on their face
      const fl = Math.exp(-Math.pow((t - T.shock - 0.03) / 0.09, 2));
      if (fl > 0.01) {
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = rgba(mixHex(glintCol, '#ffffff', 0.3), 0.42 * fl);
        g.fillRect(0, 0, w, h);
        g.globalCompositeOperation = 'source-over';
      }
    },

    /** The freeze-frame scrawl over the close-up (crisp, on the top layer). */
    text(g, w, h, t) {
      const a = seg(t, T.shock + 0.08, T.shock + 0.25) * (1 - seg(t, T.plunge0 - 0.05, T.plunge0 + 0.18));
      if (a <= 0) return;
      const ew = Math.min(w * 0.13, h * 0.22), cy = h * E.y;
      const big = Math.min(h * 0.115, w * 0.085);
      const y = Math.min(cy + ew * 1.75, h * 0.965 - big * 1.4), cream = '#fff4d8';
      const name = plan.duo ? 'Both of them' : plan.hero.name;
      g.save();
      g.globalAlpha = a;
      g.translate(w / 2, y);
      g.rotate(-0.025);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const px = fitText(g, name, w * 0.6, big, HAND);
      const tw = g.measureText(name).width;
      const wr = seg(t, T.shock + 0.08, T.shock + 0.4);
      g.save();
      g.beginPath(); g.rect(-tw / 2 - px, -px, (tw + px * 2) * wr, px * 2.2); g.clip(); // written on, left to right
      g.fillStyle = 'rgba(12,8,6,0.75)'; g.fillText(name, px * 0.04, px * 0.05);
      g.fillStyle = plan.duo ? cream : mixHex(plan.hero.col, '#ffffff', 0.35); g.fillText(name, 0, 0);
      g.strokeStyle = cream; g.lineWidth = px * 0.07; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-tw / 2, px * 0.58); g.quadraticCurveTo(0, px * 0.74, tw / 2, px * 0.52); g.stroke();
      g.restore();
      const a2 = seg(t, T.shock + 0.3, T.shock + 0.45);
      g.globalAlpha = a * a2;
      fitText(g, E.line, w * 0.8, big * 0.42, PEN);
      g.fillStyle = 'rgba(12,8,6,0.75)'; g.fillText(E.line, big * 0.03, px * 0.62 + big * 0.5);
      g.fillStyle = cream; g.fillText(E.line, 0, px * 0.62 + big * 0.47);
      g.restore();
      // how it happened, filed top left
      g.save();
      g.globalAlpha = a;
      const fs = Math.max(10, Math.min(h * 0.03, w * 0.02));
      fitText(g, E.tag, w * 0.6, fs, OSD);
      g.font = '700 ' + g.font;
      const tw2 = g.measureText(E.tag).width;
      g.fillStyle = 'rgba(12,8,6,0.8)';
      g.fillRect(w * 0.03, h * 0.045, tw2 + fs * 1.6, fs * 2);
      g.fillStyle = glintCol;
      g.fillRect(w * 0.03, h * 0.045, fs * 0.3, fs * 2);
      g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillStyle = cream;
      g.fillText(E.tag, w * 0.03 + fs * 0.9, h * 0.045 + fs * 1.04);
      g.restore();
    },
  };
}
