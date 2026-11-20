// IRON AUTUMN — every texture in the square, painted on canvases at create() and never
// touched again: setts, plaster over brick, planks, smoke, glows, the cloud deck.
import { makeCanvas, mulberry32, roundRect } from '../../kit.js';

// Tileable value noise: lattice hashes wrap at `per`, so textures repeat without a seam.
function hash(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function pnoise(x, y, per, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const x0 = ((ix % per) + per) % per, x1 = (x0 + 1) % per, y0 = ((iy % per) + per) % per, y1 = (y0 + 1) % per;
  const a = hash(x0, y0, seed), b = hash(x1, y0, seed), c = hash(x0, y1, seed), d = hash(x1, y1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function pfbm(x, y, per, seed, oct = 4) {
  let s = 0, amp = 0.5, n = 0;
  for (let i = 0; i < oct; i++) { s += pnoise(x, y, per, seed + i) * amp; n += amp; x *= 2; y *= 2; per *= 2; amp *= 0.5; }
  return s / n;
}

// A soft tileable noise layer: computed small, stretched by the canvas (bilinear), cheap.
function noiseCanvas(size, cells, seed, oct = 4) {
  const { canvas, g } = makeCanvas(size, size), img = g.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = pfbm((x / size) * cells, (y / size) * cells, cells, seed, oct) * 255, k = (y * size + x) * 4;
    d[k] = d[k + 1] = d[k + 2] = v;
    d[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return canvas;
}

// Height (red channel of a canvas) → tangent-space normal map, wrapping at the edges.
function normalFromHeight(src, strength) {
  const w = src.width, h = src.height, s = src.getContext('2d').getImageData(0, 0, w, h).data;
  const { canvas, g } = makeCanvas(w, h), img = g.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) {
    const yu = ((y + h - 1) % h) * w, yd = ((y + 1) % h) * w, yc = y * w;
    for (let x = 0; x < w; x++) {
      const xl = (x + w - 1) % w, xr = (x + 1) % w;
      const dx = (s[(yc + xr) * 4] - s[(yc + xl) * 4]) / 255 * strength, dy = (s[(yd + x) * 4] - s[(yu + x) * 4]) / 255 * strength;
      const il = 1 / Math.sqrt(dx * dx + dy * dy + 1), k = (yc + x) * 4;
      d[k] = (-dx * il * 0.5 + 0.5) * 255;
      d[k + 1] = (dy * il * 0.5 + 0.5) * 255; // canvas y runs down, texture v runs up
      d[k + 2] = (il * 0.5 + 0.5) * 255;
      d[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return canvas;
}

function speckle(g, size, rnd, n, alpha) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${alpha * rnd()})` : `rgba(255,255,255,${alpha * 0.7 * rnd()})`;
    g.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

export function makeTextures(THREE, renderer, seed, maxAniso = 8, normals = true) {
  const rnd = mulberry32(seed ^ 0x51ab);
  const aniso = Math.max(1, Math.min(maxAniso, renderer.capabilities.getMaxAnisotropy()));
  const all = [];
  const tex = (canvas, { srgb = true, repeat = true, mips = true } = {}) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.generateMipmaps = mips;
    t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    t.anisotropy = mips ? aniso : 1;
    all.push(t);
    return t;
  };
  const S = 512;

  // ---- setts: square stones in running bond, worn round, dark joints ----
  const cobH = makeCanvas(S, S), cobA = makeCanvas(S, S);
  cobH.g.fillStyle = '#1c1c1c';
  cobH.g.fillRect(0, 0, S, S);
  cobA.g.fillStyle = '#332d27'; // joints: dark, not black — without a normal map black joints turn the square into polka dots
  cobA.g.fillRect(0, 0, S, S);
  const N = 16, cs = S / N;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const w = cs * (0.86 + rnd() * 0.08), h = cs * (0.84 + rnd() * 0.1), top = 150 + rnd() * 105, tone = 0.82 + rnd() * 0.36, warm = rnd();
    const cx = (c + (r & 1 ? 0.5 : 0)) * cs + cs / 2 + (rnd() - 0.5) * 3, cy = r * cs + cs / 2 + (rnd() - 0.5) * 3;
    for (const ox of [0, -S, S]) for (const oy of [0, -S, S]) {
      const x = cx + ox, y = cy + oy;
      if (x < -cs || x > S + cs || y < -cs || y > S + cs) continue;
      let grad = cobH.g.createRadialGradient(x, y, 1, x, y, cs * 0.62);
      grad.addColorStop(0, `rgb(${top},${top},${top})`);
      grad.addColorStop(0.7, `rgb(${top * 0.86},${top * 0.86},${top * 0.86})`);
      grad.addColorStop(1, 'rgb(60,60,60)');
      cobH.g.fillStyle = grad;
      roundRect(cobH.g, x - w / 2, y - h / 2, w, h, cs * 0.24);
      cobH.g.fill();
      grad = cobA.g.createRadialGradient(x - 2, y - 2, 1, x, y, cs * 0.66);
      const R = (118 + warm * 14) * tone, G = (110 + warm * 6) * tone, B = (100 - warm * 6) * tone;
      grad.addColorStop(0, `rgb(${R},${G},${B})`);
      grad.addColorStop(1, `rgb(${R * 0.7},${G * 0.7},${B * 0.7})`);
      cobA.g.fillStyle = grad;
      roundRect(cobA.g, x - w / 2, y - h / 2, w, h, cs * 0.24);
      cobA.g.fill();
    }
  }
  speckle(cobA.g, S, rnd, 5000, 0.22);
  cobA.g.globalAlpha = 0.3;
  cobA.g.globalCompositeOperation = 'multiply';
  cobA.g.drawImage(noiseCanvas(64, 4, 11), 0, 0, S, S);
  cobA.g.globalAlpha = 1;
  cobA.g.globalCompositeOperation = 'source-over';
  const nrm = (canvas, k) => (normals ? tex(normalFromHeight(canvas, k), { srgb: false }) : null); // not built where they will not be used
  const cobble = tex(cobA.canvas), cobbleN = nrm(cobH.canvas, 3.2);

  // ---- masonry: lime plaster over brick, the brick showing only where it has come away ----
  const masH = makeCanvas(S, S), masA = makeCanvas(S, S);
  const bw = 64, bh = 32;
  masH.g.fillStyle = '#585858';
  masH.g.fillRect(0, 0, S, S);
  masA.g.fillStyle = '#6e6359';
  masA.g.fillRect(0, 0, S, S);
  for (let r = 0; r < S / bh; r++) for (let c = -1; c < S / bw; c++) {
    const x = c * bw + (r & 1 ? bw / 2 : 0) + 2, y = r * bh + 2, t = 0.78 + rnd() * 0.4, hh = 120 + rnd() * 40, w = rnd();
    for (const ox of [0, S]) {
      masH.g.fillStyle = `rgb(${hh},${hh},${hh})`;
      masH.g.fillRect(x + ox, y, bw - 4, bh - 4);
      masA.g.fillStyle = `rgb(${(150 + w * 14) * t},${(114 + w * 4) * t},${(98 - w * 6) * t})`; // a pale, sooty red: against plaster in shade anything darker reads as a hole
      masA.g.fillRect(x + ox, y, bw - 4, bh - 4);
    }
  }
  speckle(masA.g, S, rnd, 3000, 0.2);
  // Where the plaster holds: big ragged sheets with a soft broken edge (a hard-thresholded
  // mask reads as camouflage from across a square).
  const MS = 256, mask = noiseCanvas(MS, 6, 23, 4).getContext('2d').getImageData(0, 0, MS, MS).data;
  const pl = makeCanvas(MS, MS), plImg = pl.g.createImageData(MS, MS);
  // A handful of wounds per tile, each a ragged blob: noise alone tends to open a band right
  // across the tile, and a band repeated up a facade is a stripe.
  const wounds = [];
  for (let i = 0; i < 3; i++) wounds.push([rnd() * MS, rnd() * MS, (i < 1 ? 22 : 8) + rnd() * (i < 1 ? 12 : 8), 0.55 + rnd() * 0.9]);
  for (let y = 0; y < MS; y++) for (let x = 0; x < MS; x++) {
    let q = 9;
    for (const [wx, wy, wr, asp] of wounds) {
      let dx = Math.abs(x - wx), dy = Math.abs(y - wy);
      if (dx > MS / 2) dx = MS - dx;
      if (dy > MS / 2) dy = MS - dy;
      q = Math.min(q, Math.hypot(dx * asp, dy) / wr);
    }
    const i = y * MS + x, v = (q + (mask[i * 4] / 255 - 0.5) * 1.5 - 0.92) / 0.1, a = v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v);
    plImg.data[i * 4] = plImg.data[i * 4 + 1] = plImg.data[i * 4 + 2] = 255;
    plImg.data[i * 4 + 3] = a * 255;
  }
  pl.g.putImageData(plImg, 0, 0);
  const plaster = makeCanvas(S, S);
  plaster.g.imageSmoothingEnabled = true;
  plaster.g.drawImage(pl.canvas, 0, 0, S, S);
  plaster.g.globalCompositeOperation = 'source-in';
  plaster.g.fillStyle = '#c6bdaa';
  plaster.g.fillRect(0, 0, S, S);
  plaster.g.globalCompositeOperation = 'source-atop';
  // Weather: broad damp patches, then finer mottling, both only on the plaster.
  plaster.g.globalAlpha = 0.3;
  plaster.g.drawImage(noiseCanvas(64, 2, 37, 3), 0, 0, S, S);
  plaster.g.globalAlpha = 0.22;
  plaster.g.drawImage(noiseCanvas(128, 8, 31), 0, 0, S, S);
  plaster.g.globalAlpha = 1;
  speckle(plaster.g, S, rnd, 2500, 0.1);
  // Rain streaks and hairline cracks, plaster only (source-atop keeps them off the brick).
  for (let i = 0; i < 46; i++) {
    const x = rnd() * S, y = rnd() * S, len = 40 + rnd() * 150;
    const grad = plaster.g.createLinearGradient(0, y, 0, y + len);
    grad.addColorStop(0, 'rgba(46,40,33,0.15)');
    grad.addColorStop(1, 'rgba(46,40,33,0)');
    plaster.g.fillStyle = grad;
    plaster.g.fillRect(x, y, 1 + rnd() * 3, len);
  }
  plaster.g.strokeStyle = 'rgba(30,26,22,0.4)';
  plaster.g.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    let x = rnd() * S, y = rnd() * S;
    plaster.g.beginPath();
    plaster.g.moveTo(x, y);
    for (let k = 0; k < 8; k++) { x += (rnd() - 0.5) * 30; y += 8 + rnd() * 22; plaster.g.lineTo(x, y); }
    plaster.g.stroke();
  }
  // The sheet has thickness: its broken edge throws a thin shadow onto the brick behind.
  const edge = makeCanvas(S, S);
  edge.g.drawImage(pl.canvas, 0, 0, S, S);
  edge.g.globalCompositeOperation = 'source-in';
  edge.g.fillStyle = '#15110e';
  edge.g.fillRect(0, 0, S, S);
  masA.g.globalAlpha = 0.38;
  for (const [ox, oy] of [[0, 0], [-S, 0], [0, -S], [-S, -S]]) masA.g.drawImage(edge.canvas, ox + 2, oy + 3);
  masA.g.globalAlpha = 1;
  masA.g.drawImage(plaster.canvas, 0, 0);
  const plH = makeCanvas(S, S);
  plH.g.drawImage(pl.canvas, 0, 0, S, S);
  plH.g.globalCompositeOperation = 'source-in';
  plH.g.fillStyle = '#d8d8d8';
  plH.g.fillRect(0, 0, S, S);
  masH.g.drawImage(plH.canvas, 0, 0);
  masH.g.globalAlpha = 0.18;
  masH.g.drawImage(noiseCanvas(128, 16, 41), 0, 0, S, S);
  masH.g.globalAlpha = 1;
  const masonry = tex(masA.canvas), masonryN = nrm(masH.canvas, 2.6);

  // ---- ashlar: the church's dressed limestone, in courses half a metre high ----
  const asA = makeCanvas(S, S), asH = makeCanvas(S, S);
  asA.g.fillStyle = '#4d473e';
  asA.g.fillRect(0, 0, S, S);
  asH.g.fillStyle = '#3c3c3c';
  asH.g.fillRect(0, 0, S, S);
  for (let r = 0; r < 8; r++) {
    let x = Math.floor(rnd() * 96);
    const end = x + S;
    while (x < end) {
      let w = 96 + Math.floor(rnd() * 3) * 32;
      if (end - x - w < 80) w = end - x;
      const t = 0.84 + rnd() * 0.28, warm = rnd(), hh = 150 + rnd() * 45, y = r * 64;
      for (const ox of [0, -S]) {
        asA.g.fillStyle = `rgb(${(186 + warm * 10) * t},${(178 + warm * 3) * t},${(160 - warm * 8) * t})`;
        asA.g.fillRect(x + ox + 2, y + 2, w - 3, 61);
        // Tooling: each block a shade lighter along its top arris, darker at its foot.
        asA.g.fillStyle = 'rgba(255,250,235,0.1)';
        asA.g.fillRect(x + ox + 2, y + 2, w - 3, 4);
        asA.g.fillStyle = 'rgba(20,16,12,0.16)';
        asA.g.fillRect(x + ox + 2, y + 56, w - 3, 7);
        asH.g.fillStyle = `rgb(${hh},${hh},${hh})`;
        asH.g.fillRect(x + ox + 3, y + 3, w - 5, 59);
        if (rnd() < 0.35) { // a spalled arris, or where a splinter struck
          const cx = x + ox + (rnd() < 0.5 ? 2 + rnd() * 8 : w - 2 - rnd() * 8), cy = y + (rnd() < 0.5 ? 2 : 62), cr = 3 + rnd() * 6;
          asA.g.fillStyle = 'rgba(40,34,28,0.5)';
          asA.g.beginPath(); asA.g.arc(cx, cy, cr, 0, 6.283); asA.g.fill();
          asH.g.fillStyle = '#505050';
          asH.g.beginPath(); asH.g.arc(cx, cy, cr, 0, 6.283); asH.g.fill();
        }
      }
      x += w;
    }
  }
  speckle(asA.g, S, rnd, 4500, 0.12);
  asA.g.globalCompositeOperation = 'multiply';
  asA.g.globalAlpha = 0.45;
  asA.g.drawImage(noiseCanvas(128, 3, 57, 4), 0, 0, S, S);
  asA.g.globalAlpha = 1;
  asA.g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 30; i++) { // soot and rain down the face
    const x = rnd() * S, y = rnd() * S, len = 60 + rnd() * 200;
    const grad = asA.g.createLinearGradient(0, y, 0, y + len);
    grad.addColorStop(0, 'rgba(30,26,22,0.17)');
    grad.addColorStop(1, 'rgba(30,26,22,0)');
    asA.g.fillStyle = grad;
    asA.g.fillRect(x, y, 2 + rnd() * 4, len);
  }
  asH.g.globalAlpha = 0.14;
  asH.g.drawImage(noiseCanvas(128, 16, 43), 0, 0, S, S);
  asH.g.globalAlpha = 1;
  const ashlar = tex(asA.canvas), ashlarN = nrm(asH.canvas, 2.2);

  // ---- planks ----
  const wdA = makeCanvas(256, 256), wdH = makeCanvas(256, 256);
  for (let i = 0; i < 4; i++) {
    const t = 0.8 + rnd() * 0.35;
    wdA.g.fillStyle = `rgb(${120 * t},${92 * t},${62 * t})`;
    wdA.g.fillRect(0, i * 64, 256, 64);
    wdH.g.fillStyle = '#b0b0b0';
    wdH.g.fillRect(0, i * 64, 256, 64);
    for (let k = 0; k < 26; k++) {
      const y = i * 64 + 3 + rnd() * 58, a = 0.08 + rnd() * 0.2;
      wdA.g.fillStyle = `rgba(40,26,14,${a})`;
      wdA.g.fillRect(0, y, 256, 1 + rnd() * 1.5);
      wdH.g.fillStyle = `rgba(0,0,0,${a})`;
      wdH.g.fillRect(0, y, 256, 1.5);
    }
    wdA.g.fillStyle = '#1e150d';
    wdA.g.fillRect(0, i * 64, 256, 3);
    wdH.g.fillStyle = '#202020';
    wdH.g.fillRect(0, i * 64, 256, 4);
  }
  const wood = tex(wdA.canvas), woodN = nrm(wdH.canvas, 2);

  // ---- hessian for the sandbags ----
  const sbA = makeCanvas(128, 128), sbH = makeCanvas(128, 128);
  sbA.g.fillStyle = '#9a8a68';
  sbA.g.fillRect(0, 0, 128, 128);
  sbH.g.fillStyle = '#808080';
  sbH.g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 4) {
    sbA.g.fillStyle = `rgba(50,40,24,${0.18 + rnd() * 0.12})`;
    sbA.g.fillRect(i, 0, 1.5, 128);
    sbA.g.fillRect(0, i, 128, 1.5);
    sbH.g.fillStyle = 'rgba(0,0,0,0.35)';
    sbH.g.fillRect(i, 0, 1.5, 128);
    sbH.g.fillRect(0, i, 128, 1.5);
  }
  speckle(sbA.g, 128, rnd, 500, 0.2);
  const sack = tex(sbA.canvas), sackN = nrm(sbH.canvas, 1.5);

  // ---- a billow of smoke: lumpy, soft-edged, alpha only ----
  const sm = makeCanvas(128, 128);
  for (let i = 0; i < 26; i++) {
    const a = rnd() * 6.283, d = rnd() * 28, x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d, r = 16 + rnd() * 20;
    const grad = sm.g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${0.2 + rnd() * 0.2})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    sm.g.fillStyle = grad;
    sm.g.fillRect(0, 0, 128, 128);
  }
  const puff = tex(sm.canvas, { repeat: false });

  // ---- glows ----
  const gl = makeCanvas(64, 64);
  let grad = gl.g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.14)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  gl.g.fillStyle = grad;
  gl.g.fillRect(0, 0, 64, 64);
  const glow = tex(gl.canvas, { repeat: false });
  // A four-point star for muzzle flashes and lens glints.
  const st = makeCanvas(128, 128);
  st.g.translate(64, 64);
  for (let i = 0; i < 4; i++) {
    st.g.rotate(Math.PI / 4);
    const len = i & 1 ? 62 : 34;
    grad = st.g.createLinearGradient(-len, 0, len, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    st.g.fillStyle = grad;
    st.g.beginPath();
    st.g.ellipse(0, 0, len, i & 1 ? 2.2 : 3.5, 0, 0, 6.283);
    st.g.fill();
  }
  grad = st.g.createRadialGradient(0, 0, 0, 0, 0, 26);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  st.g.fillStyle = grad;
  st.g.fillRect(-64, -64, 128, 128);
  const star = tex(st.canvas, { repeat: false });

  // ---- scorch: where a shell came down ----
  const sc = makeCanvas(128, 128);
  for (let i = 0; i < 40; i++) {
    const a = rnd() * 6.283, d = rnd() * rnd() * 46, x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d, r = 8 + rnd() * 22;
    grad = sc.g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(8,6,5,0.5)');
    grad.addColorStop(1, 'rgba(8,6,5,0)');
    sc.g.fillStyle = grad;
    sc.g.fillRect(0, 0, 128, 128);
  }
  const scorch = tex(sc.canvas, { repeat: false });

  // ---- cloud deck: two decorrelated noise fields in R and G ----
  const CS = 128, cl = makeCanvas(CS, CS), a = noiseCanvas(CS, 4, 71, 5).getContext('2d').getImageData(0, 0, CS, CS).data;
  const b = noiseCanvas(CS, 8, 97, 3).getContext('2d').getImageData(0, 0, CS, CS).data, ci = cl.g.createImageData(CS, CS);
  for (let i = 0; i < CS * CS * 4; i += 4) { ci.data[i] = a[i]; ci.data[i + 1] = b[i]; ci.data[i + 2] = 0; ci.data[i + 3] = 255; }
  cl.g.putImageData(ci, 0, 0);
  const cloud = tex(cl.canvas, { srgb: false, mips: false });

  // One white texel: lets untextured surfaces share a shader program with textured ones.
  const wh = makeCanvas(2, 2);
  wh.g.fillStyle = '#fff';
  wh.g.fillRect(0, 0, 2, 2);
  const white = tex(wh.canvas, { mips: false });

  return { white, cobble, cobbleN, masonry, masonryN, ashlar, ashlarN, wood, woodN, sack, sackN, puff, glow, star, scorch, cloud, dispose() { for (const t of all) t.dispose(); } };
}
