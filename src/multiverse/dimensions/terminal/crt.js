// TTY DUEL — the monitor. The whole game is drawn flat into an off-screen "scene" canvas;
// this turns that into a phosphor tube: persistence trails, bloom, barrel distortion
// (a mesh of tiles — the 2D canvas has no shaders), scanlines, a rolling refresh bar, grain,
// flicker and tearing. No CanvasRenderingContext2D.filter anywhere (Safari has none).
import { makeCanvas, clamp, noise2 } from '../../kit.js';

const K = 0.024;            // barrel strength
const SCALE = 1 / (1 - K);  // grow the picture so the middle of each edge still touches the glass
const GX = 28, GY = 16;     // distortion mesh
const PITCH = 3;            // scanline pitch in CSS px

export function makeCrt(pal) {
  const scene = makeCanvas(2, 2), b1 = makeCanvas(2, 2), b2 = makeCanvas(2, 2), scan = makeCanvas(1, PITCH), grain = makeCanvas(128, 128), vig = makeCanvas(2, 2);
  scan.g.fillStyle = 'rgba(0,0,0,0.22)';
  scan.g.fillRect(0, 0, 1, 1);
  scan.g.fillStyle = 'rgba(0,0,0,0.08)';
  scan.g.fillRect(0, 1, 1, 1);
  const gi = grain.g.createImageData(128, 128);
  for (let i = 0; i < gi.data.length; i += 4) { const v = Math.random() * 255; gi.data[i] = gi.data[i + 1] = gi.data[i + 2] = v; gi.data[i + 3] = 255; }
  grain.g.putImageData(gi, 0, 0);

  const C = { canvas: scene.canvas, g: scene.g, rs: 1, w: 0, h: 0, ready: false };
  const px = new Float32Array((GX + 1) * (GY + 1)), py = new Float32Array((GX + 1) * (GY + 1));
  let scanPat = null, grainPat = null, barGrad = null, patG = null, last = '';

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
    C.w = w; C.h = h; C.rs = rs; C.dpr = Math.max(1, dpr);
    scene.canvas.width = Math.round(w * rs); scene.canvas.height = Math.round(h * rs);
    b1.canvas.width = Math.max(2, Math.round(w * rs / 4)); b1.canvas.height = Math.max(2, Math.round(h * rs / 4));
    b2.canvas.width = Math.max(2, Math.round(w * rs / 12)); b2.canvas.height = Math.max(2, Math.round(h * rs / 12));
    for (let j = 0; j <= GY; j++) for (let i = 0; i <= GX; i++) {
      warp((i / GX) * 2 - 1, (j / GY) * 2 - 1, tmp);
      px[j * (GX + 1) + i] = (tmp.x * 0.5 + 0.5) * w;
      py[j * (GX + 1) + i] = (tmp.y * 0.5 + 0.5) * h;
    }
    // The glass: soft vignette plus black corners where the barrel pulls the picture in.
    vig.canvas.width = Math.max(2, Math.round(w / 2)); vig.canvas.height = Math.max(2, Math.round(h / 2));
    const vg = vig.g, vw = vig.canvas.width, vh = vig.canvas.height;
    vg.clearRect(0, 0, vw, vh);
    const gr = vg.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.35, vw / 2, vh / 2, Math.hypot(vw, vh) * 0.52);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.62)');
    vg.fillStyle = gr;
    vg.fillRect(0, 0, vw, vh);
    vg.beginPath();
    vg.rect(0, 0, vw, vh);
    const N = 36;
    for (let k = 0; k < 4 * N; k++) {
      const s = k / N, e = Math.floor(s), t = s - e;
      let u, v;
      if (e === 0) { u = -1 + 2 * t; v = -1; } else if (e === 1) { u = 1; v = -1 + 2 * t; } else if (e === 2) { u = 1 - 2 * t; v = 1; } else { u = -1; v = 1 - 2 * t; }
      warp(u, v, tmp);
      const x = (tmp.x * 0.5 + 0.5) * vw, y = (tmp.y * 0.5 + 0.5) * vh;
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
    b1.g.drawImage(sc, 0, 0, b1.canvas.width, b1.canvas.height);
    b2.g.drawImage(b1.canvas, 0, 0, b2.canvas.width, b2.canvas.height);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    g.imageSmoothingEnabled = true;
    for (let j = 0; j < GY; j++) {
      for (let i = 0; i < GX; i++) {
        const a = j * (GX + 1) + i, b = a + 1, c = a + GX + 1, d = c + 1;
        // the tile's mean rectangle: neighbours share their edges exactly, so nothing stretches or gaps
        const x0 = (px[a] + px[c]) / 2, x1 = (px[b] + px[d]) / 2, y0 = (py[a] + py[b]) / 2, y1 = (py[c] + py[d]) / 2;
        // Each tile reads a few extra source pixels on every side, or the seams smear the text.
        const tw = sw / GX, th = sh / GY, sx = i * tw, sy = j * th, kx = (x1 - x0) / tw, ky = (y1 - y0) / th;
        const l = i ? 1.5 : 0, t = j ? 1.5 : 0, r = i < GX - 1 ? 1.5 : 0, bt = j < GY - 1 ? 1.5 : 0;
        g.drawImage(sc, sx - l, sy - t, tw + l + r, th + t + bt, x0 - l * kx, y0 - t * ky, (tw + l + r) * kx, (th + t + bt) * ky);
      }
    }
    // Bloom: two blurry copies added on top, scaled the way the glass magnifies on average.
    const m = (1 - K * 0.6) * SCALE, bw = w * m, bh = h * m, bx = (w - bw) / 2, by = (h - bh) / 2;
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.36 * flicker;
    g.drawImage(b1.canvas, bx, by, bw, bh);
    g.globalAlpha = 0.4 * flicker;
    g.drawImage(b2.canvas, bx, by, bw, bh);
    g.globalCompositeOperation = 'source-over';
    // scanlines, rolling refresh bar, grain, glass
    if (patG !== g || !scanPat) { patG = g; barGrad = null; scanPat = g.createPattern(scan.canvas, 'repeat'); grainPat = g.createPattern(grain.canvas, 'repeat'); }
    g.globalAlpha = 1;
    if (scanPat) { g.fillStyle = scanPat; g.fillRect(0, 0, w, h); }
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
    if (grainPat) {
      g.save();
      g.globalAlpha = 0.05;
      g.translate((Math.random() * 128) | 0, (Math.random() * 128) | 0);
      g.fillStyle = grainPat;
      g.fillRect(-128, -128, w + 256, h + 256);
      g.restore();
    }
    g.drawImage(vig.canvas, 0, 0, w, h);
    if (flicker < 1) { g.fillStyle = `rgba(0,0,0,${(1 - flicker) * 1.6})`; g.fillRect(0, 0, w, h); }
  };

  C.dispose = () => {
    for (const c of [scene, b1, b2, scan, grain, vig]) { c.canvas.width = c.canvas.height = 1; }
    scanPat = grainPat = null;
  };
  return C;
}
