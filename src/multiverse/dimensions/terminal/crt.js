// TTY DUEL — the monitor. The whole game is drawn flat into an off-screen "scene" canvas;
// this turns that into a phosphor tube: persistence trails, bloom, barrel distortion
// (a mesh of tiles — the 2D canvas has no shaders), scanlines, a rolling refresh bar, grain,
// flicker and tearing. No CanvasRenderingContext2D.filter anywhere (Safari has none).
import { makeCanvas, clamp, noise2 } from '../../kit.js';

const K = 0.024;            // barrel strength
const SCALE = 1 / (1 - K);  // grow the picture so the middle of each edge still touches the glass
const GX = 16, GY = 10;     // distortion mesh (the bend is gentle: 160 tiles are indistinguishable from 448 and a third of the draw calls)
const PITCH = 3;            // scanline pitch in CSS px

export function makeCrt(pal) {
  const scene = makeCanvas(2, 2), b1 = makeCanvas(2, 2), b2 = makeCanvas(2, 2), grain = makeCanvas(128, 128), glass = makeCanvas(2, 2);
  const gi = grain.g.createImageData(128, 128);
  for (let i = 0; i < gi.data.length; i += 4) { const v = Math.random() * 255; gi.data[i] = gi.data[i + 1] = gi.data[i + 2] = v; gi.data[i + 3] = 255; }
  grain.g.putImageData(gi, 0, 0);

  const C = { canvas: scene.canvas, g: scene.g, rs: 1, w: 0, h: 0, ready: false };
  const px = new Float32Array((GX + 1) * (GY + 1)), py = new Float32Array((GX + 1) * (GY + 1));
  let grainPat = null, barGrad = null, patG = null, last = '', n = 0;

  const warp = (u, v, out) => {
    const f = (1 - K * (u * u + v * v)) * SCALE;
    out.x = u * f; out.y = v * f;
    return out;
  };
  const tmp = { x: 0, y: 0 };

  /** Resize to the stage; true when anything changed. */
  C.size = (w, h, dpr) => {
    const rs = clamp(Math.min(dpr, Math.sqrt(2.6e6 / (w * h))), 1, 2);
    const key = `${w}x${h}@${rs.toFixed(2)}`;
    if (key === last) return false;
    last = key;
    C.w = w; C.h = h; C.rs = rs; C.dpr = Math.max(1, Math.min(2, dpr));
    barGrad = null;
    scene.canvas.width = Math.round(w * rs); scene.canvas.height = Math.round(h * rs);
    b1.canvas.width = Math.max(2, Math.round(w * rs / 4)); b1.canvas.height = Math.max(2, Math.round(h * rs / 4));
    b2.canvas.width = Math.max(2, Math.round(w * rs / 12)); b2.canvas.height = Math.max(2, Math.round(h * rs / 12));
    for (let j = 0; j <= GY; j++) for (let i = 0; i <= GX; i++) {
      warp((i / GX) * 2 - 1, (j / GY) * 2 - 1, tmp);
      px[j * (GX + 1) + i] = (tmp.x * 0.5 + 0.5) * w;
      py[j * (GX + 1) + i] = (tmp.y * 0.5 + 0.5) * h;
    }
    // The glass, baked once at device resolution: scanlines, soft vignette and the black corners where
    // the barrel pulls the picture in. One draw per frame instead of three full-screen passes.
    const d = C.dpr, gw = Math.round(w * d), gh = Math.round(h * d);
    glass.canvas.width = gw; glass.canvas.height = gh;
    const vg = glass.g;
    vg.setTransform(d, 0, 0, d, 0, 0);
    vg.clearRect(0, 0, w, h);
    for (let y = 0; y < h; y += PITCH) {
      vg.fillStyle = 'rgba(0,0,0,0.22)';
      vg.fillRect(0, y, w, 1);
      vg.fillStyle = 'rgba(0,0,0,0.08)';
      vg.fillRect(0, y + 1, w, 1);
    }
    const gr = vg.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.52);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.62)');
    vg.fillStyle = gr;
    vg.fillRect(0, 0, w, h);
    vg.beginPath();
    vg.rect(0, 0, w, h);
    const N = 48;
    for (let k = 0; k < 4 * N; k++) {
      const s = k / N, e = Math.floor(s), t = s - e;
      let u, v;
      if (e === 0) { u = -1 + 2 * t; v = -1; } else if (e === 1) { u = 1; v = -1 + 2 * t; } else if (e === 2) { u = 1 - 2 * t; v = 1; } else { u = -1; v = 1 - 2 * t; }
      warp(u, v, tmp);
      const x = (tmp.x * 0.5 + 0.5) * w, y = (tmp.y * 0.5 + 0.5) * h;
      if (k === 0) vg.moveTo(x, y); else vg.lineTo(x, y);
    }
    vg.closePath();
    vg.fillStyle = '#000';
    vg.fill('evenodd');
    C.g.setTransform(rs, 0, 0, rs, 0, 0);
    C.g.fillStyle = pal.bg;
    C.g.fillRect(0, 0, w, h);
    C.ready = true;
    return true;
  };

  /** Start a frame: the last one fades instead of vanishing — that is the phosphor's afterglow. */
  C.begin = (persist) => {
    const g = C.g;
    g.setTransform(C.rs, 0, 0, C.rs, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = pal.bg;
    g.globalAlpha = 1 - persist;
    g.fillRect(0, 0, C.w, C.h);
    g.globalAlpha = 1;
  };

  /** Tear the picture: horizontal bands slide sideways (the kill, a shot's kick, the static sweep). */
  C.tear = (amount, seed, maxY) => {
    const g = C.g, rs = C.rs, w = C.w, h = C.h;
    const n = 2 + Math.round(amount * 9);
    g.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < n; i++) {
      const lim = Math.min(h, maxY || h);
      const bh = Math.floor((6 + (noise2(i * 7.3, seed) * 0.5 + 0.5) * 36 * amount) * rs);
      const y = Math.floor((noise2(seed * 1.7 + i * 13.1, 4.2) * 0.5 + 0.5) * Math.max(1, lim * rs - bh));
      const dx = Math.round(noise2(seed + i * 5.9, 9.1) * amount * 70 * rs);
      try { g.drawImage(C.canvas, 0, y, C.canvas.width, bh, dx, y, C.canvas.width, bh); } catch (e) { break; }
    }
    g.setTransform(rs, 0, 0, rs, 0, 0);
  };

  /** Scene CSS px -> glass CSS px (for the pointer). */
  C.project = (x, y, out) => {
    const u = (x / C.w) * 2 - 1, v = (y / C.h) * 2 - 1;
    warp(u, v, tmp);
    out.x = (tmp.x * 0.5 + 0.5) * C.w;
    out.y = (tmp.y * 0.5 + 0.5) * C.h;
    return out;
  };
  /** Glass CSS px -> scene CSS px: where the pointer really is on the flat picture. */
  C.unproject = (x, y, out) => {
    const du = ((x / C.w) * 2 - 1) / SCALE, dv = ((y / C.h) * 2 - 1) / SCALE;
    let u = du, v = dv;
    for (let i = 0; i < 4; i++) { const f = 1 - K * (u * u + v * v); u = du / f; v = dv / f; }
    out.x = (u * 0.5 + 0.5) * C.w;
    out.y = (v * 0.5 + 0.5) * C.h;
    return out;
  };

  /** Put the scene on the glass. */
  C.present = (g, t, flicker, rollY) => {
    const w = C.w, h = C.h, sc = C.canvas, sw = sc.width, sh = sc.height;
    n++;
    // Two blurs from the scene, the wide one folded into the first: the bloom costs one full-screen pass.
    b1.g.globalCompositeOperation = 'copy';
    b1.g.drawImage(sc, 0, 0, b1.canvas.width, b1.canvas.height);
    b2.g.drawImage(b1.canvas, 0, 0, b2.canvas.width, b2.canvas.height);
    b1.g.globalCompositeOperation = 'lighter';
    b1.g.globalAlpha = 1.1;
    b1.g.drawImage(b2.canvas, 0, 0, b1.canvas.width, b1.canvas.height);
    b1.g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.imageSmoothingEnabled = true;
    // The tiles cover the whole curved picture; the glass layer paints the corners black afterwards.
    for (let j = 0; j < GY; j++) {
      for (let i = 0; i < GX; i++) {
        const a = j * (GX + 1) + i, b = a + 1, c = a + GX + 1, d = c + 1;
        // the tile's mean rectangle: neighbours share their edges exactly, so nothing stretches or gaps
        const x0 = (px[a] + px[c]) / 2, x1 = (px[b] + px[d]) / 2, y0 = (py[a] + py[b]) / 2, y1 = (py[c] + py[d]) / 2;
        // Each tile reads a few extra source pixels on every side, or the seams smear the text.
        const tw = sw / GX, th = sh / GY, sx = i * tw, sy = j * th, kx = (x1 - x0) / tw, ky = (y1 - y0) / th;
        const l = i ? 1.5 : 0, tp = j ? 1.5 : 0, r = i < GX - 1 ? 1.5 : 0, bt = j < GY - 1 ? 1.5 : 0;
        g.drawImage(sc, sx - l, sy - tp, tw + l + r, th + tp + bt, x0 - l * kx, y0 - tp * ky, (tw + l + r) * kx, (th + tp + bt) * ky);
      }
    }
    // Bloom, scaled the way the glass magnifies on average.
    const m = (1 - K * 0.6) * SCALE, bw = w * m, bh = h * m, bx = (w - bw) / 2, by = (h - bh) / 2;
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.38 * flicker;
    g.drawImage(b1.canvas, bx, by, bw, bh);
    g.globalCompositeOperation = 'source-over';
    // rolling refresh bar and grain (grain on every other frame: it reads as 30 Hz film noise at half the cost)
    if (patG !== g || !grainPat) { patG = g; barGrad = null; grainPat = g.createPattern(grain.canvas, 'repeat'); }
    g.globalAlpha = 1;
    if (!barGrad) {
      barGrad = g.createLinearGradient(0, -60, 0, 60);
      barGrad.addColorStop(0, 'rgba(255,255,255,0)');
      barGrad.addColorStop(0.5, `rgba(${pal.amber ? '255,190,120' : '150,255,170'},0.045)`);
      barGrad.addColorStop(1, 'rgba(255,255,255,0)');
    }
    g.save();
    g.translate(0, rollY * (h + 120) - 60);
    g.fillStyle = barGrad;
    g.fillRect(0, -60, w, 120);
    g.restore();
    if (grainPat && (n & 1)) {
      g.save();
      g.globalAlpha = 0.09;
      g.translate((Math.random() * 128) | 0, (Math.random() * 128) | 0);
      g.fillStyle = grainPat;
      g.fillRect(-128, -128, w + 256, h + 256);
      g.restore();
    }
    g.drawImage(glass.canvas, 0, 0, w, h);
    if (flicker < 1) { g.fillStyle = `rgba(0,0,0,${(1 - flicker) * 1.6})`; g.fillRect(0, 0, w, h); }
  };

  C.dispose = () => {
    for (const c of [scene, b1, b2, grain, glass]) { c.canvas.width = c.canvas.height = 1; }
    grainPat = null;
  };
  return C;
}
