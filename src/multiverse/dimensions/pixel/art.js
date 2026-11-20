// Baked art for CARTRIDGE CANYON: dusk sky with a striped sun, three ridges of haze, the
// chasm's distant spires, the cliffs themselves, and the props that get redrawn each frame.
import { clamp, hexToRgb, noise2, fbm, makeCanvas } from '../../kit.js';
import { PAL, FW, FH, bayer, hash } from './palette.js';
import { disc, line, box } from './px.js';
import { C } from './world.js';

const RGB = {};
for (const k in PAL) RGB[PAL[k]] = hexToRgb(PAL[k]);
const SKY = [PAL.ink, PAL.night, PAL.plum, PAL.orchid, PAL.rose, PAL.coral, PAL.peach, PAL.cream];

function put(img, x, y, col) {
  if (x < 0 || y < 0 || x >= FW || y >= FH) return;
  const c = RGB[col], i = (y * FW + x) * 4;
  img.data[i] = c.r; img.data[i + 1] = c.g; img.data[i + 2] = c.b; img.data[i + 3] = 255;
}

/** The static backdrop (sky, sun, ridges, chasm haze) plus the clouds and stars that move over it. */
export function bakeBackdrop(seed) {
  const { canvas, g } = makeCanvas(FW, FH);
  const img = g.createImageData(FW, FH);
  const s = (seed % 997) * 0.37;
  // sky: a dithered ramp, hottest at the horizon
  for (let y = 0; y < FH; y++) {
    const v = Math.min(7, 0.35 + 6.2 * Math.pow(Math.min(1, y / 116), 1.55));
    const i0 = Math.floor(v), fr = v - i0;
    for (let x = 0; x < FW; x++) put(img, x, y, bayer(x, y) / 16 < fr ? SKY[Math.min(7, i0 + 1)] : SKY[i0]);
  }
  // the sun: a banded disc with synthwave gaps, and a dithered halo
  const sx = 160, sy = 98, sr = 27;
  for (let y = sy - 46; y <= sy + 46; y++) for (let x = sx - 60; x <= sx + 60; x++) {
    const dx = x - sx, dy = y - sy, d = Math.hypot(dx, dy);
    if (d > sr) {
      const lvl = 7 * (1 - (d - sr) / 36);
      if (lvl > 0 && bayer(x, y) < lvl) put(img, x, y, d < sr + 10 ? PAL.peach : PAL.coral);
      continue;
    }
    if (dy > -2 && ((dy + 40) % 7) < Math.min(5, (dy + 2) * 0.28 + 1)) continue; // gaps widen downwards
    put(img, x, y, dy < -12 ? PAL.cream : dy < 4 ? PAL.peach : dy < 14 ? PAL.coral : PAL.rose);
  }
  // far ridge, mesas, and the haze that turns into the chasm's depth
  const top = new Int16Array(FW), mes = new Int16Array(FW);
  for (let x = 0; x < FW; x++) {
    top[x] = Math.round(96 - 15 * (0.5 + 0.5 * fbm(x * 0.017 + s, 3.1)) + 5 * Math.sin(x * 0.05 + s));
    const q = Math.floor((0.5 + 0.5 * fbm(x * 0.011 + s + 40, 9.7)) * 5);
    mes[x] = 112 - q * 5 - (x % 37 < 2 ? 2 : 0);
  }
  for (let x = 0; x < FW; x++) {
    const near = Math.abs(x - 160) < 70;
    for (let y = top[x]; y < FH; y++) {
      const d = y - top[x];
      put(img, x, y, d < 1 ? (near ? PAL.coral : PAL.rose) : d > 10 && bayer(x, y) < (d - 10) * 0.9 ? PAL.rose : PAL.orchid);
    }
    for (let y = mes[x]; y < FH; y++) {
      const d = y - mes[x];
      put(img, x, y, d < 1 ? PAL.orchid : d > 12 && bayer(x, y) < (d - 12) * 0.7 ? PAL.orchid : PAL.plum);
    }
  }
  // the abyss: fade everything below the plateau line into night
  for (let y = 112; y < FH; y++) {
    const k = Math.min(1, (y - 112) / 62) * 16;
    for (let x = 0; x < FW; x++) if (bayer(x, y) < k) put(img, x, y, k > 11 && bayer(x + 2, y + 1) < k - 9 ? PAL.ink : PAL.night);
  }
  // spires in the chasm
  for (const [cx, w, ty] of [[134, 12, 128], [160, 16, 119], [190, 11, 132]]) {
    for (let y = ty; y < FH - 6; y++) for (let x = cx - w / 2; x < cx + w / 2; x++) {
      const dd = y - ty, lit = x < cx - w / 2 + 2;
      const col = dd < 2 ? PAL.orchid : lit ? PAL.plum : PAL.night;
      if (dd > 24 && bayer(x, y) < (dd - 24) * 0.45) put(img, Math.round(x), y, PAL.ink);
      else put(img, Math.round(x), y, col);
    }
  }
  g.putImageData(img, 0, 0);
  const stars = [];
  for (let i = 0; i < 46; i++) stars.push({ x: Math.floor(hash(i, 1, seed) * FW), y: Math.floor(hash(i, 2, seed) * 52), ph: hash(i, 3, seed) * 6.28, c: hash(i, 4, seed) > 0.7 ? PAL.peach : PAL.cream });
  return { canvas, stars, clouds: makeClouds(seed) };
}

function makeClouds(seed) {
  const out = [];
  for (const [w, h, k] of [[70, 17, 1], [48, 12, 2], [92, 20, 3], [38, 10, 4]]) {
    const { canvas, g } = makeCanvas(w, h);
    const lobes = [];
    for (let i = 0; i < 6 + k; i++) lobes.push({ x: 8 + hash(i, k, seed) * (w - 16), r: 3 + hash(i, k + 9, seed) * (h * 0.34) });
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let hit = false;
      for (const l of lobes) if (Math.hypot(x - l.x, (y - h * 0.62) * 1.5) < l.r + (y > h * 0.55 ? 3 : 0)) { hit = true; break; }
      if (!hit || y > h - 3 + (hash(x, k, seed) > 0.5 ? 1 : 0)) continue;
      const t = y / h;
      const c = RGB[t < 0.4 ? PAL.cream : t < 0.68 ? (bayer(x, y) < 6 ? PAL.rose : PAL.peach) : bayer(x, y) < 8 ? PAL.orchid : PAL.rose];
      const i = (y * w + x) * 4;
      img.data[i] = c.r; img.data[i + 1] = c.g; img.data[i + 2] = c.b; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    out.push(canvas);
  }
  return out;
}

/** The cliffs as one transparent raster: grass lips, strata, sunlit faces, dark undersides. */
export function bakeTerrain(world, seed) {
  const { canvas, g } = makeCanvas(FW, FH);
  const m = new Uint8Array(FW * FH);
  for (const r of world.bodies) for (let y = Math.max(0, r.y); y < Math.min(FH, r.y + r.h); y++) for (let x = Math.max(0, r.x); x < Math.min(FW, r.x + r.w); x++) m[y * FW + x] = 1;
  const at = (x, y) => (x < 0 || x >= FW ? 1 : y < 0 ? 0 : y >= FH ? 1 : m[y * FW + x]);
  const img = g.createImageData(FW, FH);
  const bands = [PAL.plum, PAL.plum, PAL.orchid, PAL.plum];
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    if (!m[y * FW + x]) continue;
    let up = 0;
    while (up < 5 && at(x, y - 1 - up)) up++;
    const lipY = y - up;
    const plateau = lipY <= world.GY + 1;
    let col;
    const dl = !at(x - 1, y) ? 0 : !at(x - 2, y) ? 1 : !at(x - 3, y) ? 2 : 9;
    const dr = !at(x + 1, y) ? 0 : !at(x + 2, y) ? 1 : !at(x + 3, y) ? 2 : 9;
    const side = Math.min(dl, dr);
    const hv = hash(x, y, seed);
    if (up === 0) col = plateau ? (hv < 0.55 ? PAL.leaf : PAL.forest) : hv < 0.2 ? PAL.cream : PAL.orchid;
    else if (plateau && up === 1) col = hv < 0.5 ? PAL.forest : PAL.leaf;
    else if (plateau && up === 2) col = hv < 0.5 ? PAL.forest : PAL.wood;
    else if (plateau && up === 3) col = hv < 0.35 ? PAL.wood : PAL.plum;
    else if (side === 0 && y > lipY + 1) col = PAL.rose;
    else if (side === 1 && y > lipY + 1) col = hv < 0.6 ? PAL.coral : PAL.rose;
    else if (side === 2 && y > lipY + 1) col = PAL.orchid;
    else if (!at(x, y + 1) && y < FH - 1) col = PAL.night;
    else {
      const band = Math.floor((y + noise2(x * 0.04, y * 0.1 + seed) * 4.5) / 6);
      col = bands[((band % 4) + 4) % 4];
      if (hv < 0.05) col = PAL.night;
      else if (hv > 0.975) col = PAL.rose;
      else if (col === PAL.orchid && bayer(x, y) < 5) col = PAL.plum;
    }
    if (y > 148 && bayer(x, y) < (y - 148) * 0.5) col = y > 166 ? PAL.ink : PAL.night;
    put(img, x, y, col);
  }
  g.putImageData(img, 0, 0);
  // grass tufts, flowers, and a few cacti that stay clear of the firing positions
  const tuft = (x, y) => {
    if (!at(x, y) || at(x, y - 1) || y > world.GY + 1) return;
    const hv = hash(x, y, seed + 7);
    if (hv < 0.32) { g.fillStyle = hv < 0.16 ? PAL.leaf : PAL.forest; g.fillRect(x, y - 1, 1, hv < 0.07 ? 2 : 1); }
    else if (hv > 0.985) { g.fillStyle = hv > 0.993 ? PAL.coral : PAL.cream; g.fillRect(x, y - 2, 1, 1); g.fillStyle = PAL.forest; g.fillRect(x, y - 1, 1, 1); }
  };
  for (let x = 0; x < FW; x++) for (let y = world.GY - 4; y < world.GY + 6; y++) tuft(x, y);
  for (const side of [0, 1]) {
    const mx = (x, w = 0) => (side ? FW - x - w : x);
    cactus(g, mx(11, 3), world.GY, 13, hash(side, 1, seed) > 0.5);
    cactus(g, mx(world.E - 8, 5), world.GY, 8, false);
  }
  return { canvas, g };
}

function cactus(g, x, y, h, arms) {
  const rows = (cx, cy, w, hh, c) => { g.fillStyle = c; g.fillRect(cx, cy, w, hh); };
  rows(x - 1, y - h - 1, 5, h + 1, PAL.ink);
  rows(x, y - h, 3, h, PAL.forest);
  rows(x, y - h, 1, h, PAL.leaf);
  if (arms) { rows(x - 4, y - h + 3, 5, 4, PAL.ink); rows(x - 3, y - h + 4, 3, 2, PAL.forest); rows(x - 3, y - h + 1, 3, 4, PAL.forest); rows(x - 3, y - h + 1, 1, 3, PAL.leaf); }
  g.fillStyle = PAL.coral;
  g.fillRect(x + 1, y - h - 1, 1, 1);
}

/** Scrub, rocks and a pit-floor sprinkle of rubble are in the raster; this adds a mark where a round struck. */
export function scar(tg, x, y) {
  tg.fillStyle = PAL.night;
  tg.fillRect(Math.round(x) - 1, Math.round(y), 3, 1);
  tg.fillRect(Math.round(x), Math.round(y) - 1, 1, 3);
  tg.fillStyle = PAL.ink;
  tg.fillRect(Math.round(x), Math.round(y), 1, 1);
}

// ---------------------------------------------------------------------------
// Props redrawn every frame
// ---------------------------------------------------------------------------
export function drawCrate(g, x, y, hit = 0) {
  x = Math.round(x); y = Math.round(y);
  const s = C.CRATE;
  g.fillStyle = PAL.ink; g.fillRect(x, y, s, s);
  g.fillStyle = PAL.wood; g.fillRect(x + 1, y + 1, s - 2, s - 2);
  g.fillStyle = PAL.coral; g.fillRect(x + 1, y + 1, s - 2, 1);
  g.fillStyle = PAL.night;
  g.fillRect(x + 1, y + 4, s - 2, 1); g.fillRect(x + 1, y + 7, s - 2, 1);
  for (let i = 1; i < s - 1; i++) { g.fillRect(x + i, y + i, 1, 1); g.fillRect(x + s - 1 - i, y + i, 1, 1); }
  g.fillStyle = PAL.plum; g.fillRect(x + 1, y + s - 2, s - 2, 1);
  if (hit > 0) { g.fillStyle = PAL.cream; g.fillRect(x + 1, y + 1, s - 2, s - 2); }
}

export function drawSpring(g, x, y, squash) {
  x = Math.round(x); y = Math.round(y);
  const h = 5 - Math.round(squash * 2);
  g.fillStyle = PAL.ink; g.fillRect(x - 9, y - 2, 18, 2); g.fillRect(x - 7, y - h - 1, 14, 2);
  g.fillStyle = PAL.coral; g.fillRect(x - 8, y - h, 16, 1);
  g.fillStyle = PAL.steel; g.fillRect(x - 8, y - 1, 16, 1);
  g.fillStyle = PAL.cream;
  for (let i = -6; i <= 6; i += 4) g.fillRect(x + i, y - h + 1, 1, h - 2);
}

/** The crossing bird: a big glider with a hooked beak. dir +1 flies to the right. */
export function drawBird(g, x, y, dir, flap) {
  x = Math.round(x); y = Math.round(y);
  const f = dir, up = Math.sin(flap) > 0;
  const R = (px, py, w, h, c) => { g.fillStyle = c; g.fillRect(f > 0 ? x + px : x - px - w, y + py, w, h); };
  const wy = up ? -8 : 2;
  // wing (behind): two feathered fingers
  R(-10, wy < 0 ? -9 : -1, 12, 3, PAL.ink); R(-9, wy < 0 ? -8 : 0, 10, 1, PAL.coral); R(-12, wy < 0 ? -12 : 1, 6, 2, PAL.ink); R(-11, wy < 0 ? -11 : 2, 4, 1, PAL.rose);
  R(-10, -4, 22, 8, PAL.ink); R(-9, -3, 19, 6, PAL.rose); R(-9, -3, 19, 2, PAL.coral); R(-9, 1, 19, 2, PAL.orchid);
  R(-16, -2, 8, 3, PAL.ink); R(-15, -1, 7, 1, PAL.orchid); // tail
  R(9, -6, 8, 6, PAL.ink); R(10, -5, 6, 4, PAL.peach); R(14, -4, 1, 1, PAL.ink); // head
  R(15, -3, 8, 3, PAL.ink); R(16, -2, 6, 1, PAL.amber); R(20, -1, 3, 2, PAL.ink); // beak
  R(5, -9, 3, 4, PAL.ink); R(6, -8, 1, 3, PAL.coral); // crest
  R(wy < 0 ? -3 : 2, wy < 0 ? -13 : -2, 8, 3, PAL.ink); R(wy < 0 ? -2 : 3, wy < 0 ? -12 : -1, 6, 1, PAL.coral); // near wing
}

export function drawBalloon(g, b, t) {
  const cx = Math.round(b.x), cy = Math.round(b.y), r = b.r;
  const cols = [PAL.rose, PAL.cream, PAL.coral, PAL.cream];
  // ropes and basket first
  const by = cy + r + 4;
  g.fillStyle = PAL.ink;
  line(g, cx - 8, cy + r - 5, cx - 4, by, PAL.ink); line(g, cx + 8, cy + r - 5, cx + 4, by, PAL.ink);
  g.fillStyle = PAL.ink; g.fillRect(cx - 5, by, 10, 8);
  g.fillStyle = PAL.wood; g.fillRect(cx - 4, by + 1, 8, 6);
  g.fillStyle = PAL.coral; g.fillRect(cx - 4, by + 1, 8, 1);
  g.fillStyle = PAL.night; g.fillRect(cx - 4, by + 4, 8, 1);
  // the pilot: a round creature in goggles, waving
  g.fillStyle = PAL.ink; g.fillRect(cx - 2, by - 3, 5, 4);
  g.fillStyle = PAL.cream; g.fillRect(cx - 1, by - 2, 3, 3);
  g.fillStyle = PAL.ink; g.fillRect(cx - 1, by - 2, 3, 1);
  g.fillStyle = PAL.cyan; g.fillRect(cx, by - 2, 1, 1);
  const wv = Math.round(Math.sin(t * 6) * 1.5);
  g.fillStyle = PAL.cream; g.fillRect(cx + 3, by - 4 + wv, 1, 3);
  // envelope: stripes of a pixel disc
  for (let y = -r; y <= r; y++) {
    const hw = Math.round(Math.sqrt(Math.max(0, r * r + 0.5 - y * y)));
    for (let x = -hw; x <= hw; x++) {
      const stripe = Math.floor((x + hw * 0.0 + 40) / 5) % 4;
      const edge = x === -hw || x === hw || y === -r || y === r;
      g.fillStyle = edge ? PAL.ink : y > r * 0.55 && (x + y) % 2 === 0 ? PAL.orchid : x < -hw * 0.45 && y < 0 && stripe % 2 === 1 ? PAL.cream : cols[stripe];
      g.fillRect(cx + x, cy + y, 1, 1);
    }
  }
  g.fillStyle = PAL.cream; g.fillRect(cx - 6, cy - r + 3, 2, 1); g.fillRect(cx - 7, cy - r + 4, 1, 2);
  g.fillStyle = PAL.ink; g.fillRect(cx - 3, cy + r, 7, 2);
}

export function drawFlag(g, x, y, col, colD, t) {
  x = Math.round(x); y = Math.round(y);
  g.fillStyle = PAL.ink; g.fillRect(x - 1, y - 36, 3, 36);
  g.fillStyle = PAL.steel; g.fillRect(x, y - 35, 1, 35);
  g.fillStyle = PAL.cream; g.fillRect(x - 1, y - 38, 3, 3);
  const dir = x < FW / 2 ? 1 : -1;
  for (let i = 0; i < 12; i++) {
    const wy = Math.round(Math.sin(t * 5 - i * 0.7) * (0.6 + i * 0.12));
    const px = dir > 0 ? x + 1 + i : x - 1 - i;
    const w = 7 - Math.floor(i / 4);
    g.fillStyle = PAL.ink; g.fillRect(px, y - 35 + wy - 1, 1, w + 2);
    g.fillStyle = i % 4 < 2 ? col : colD; g.fillRect(px, y - 35 + wy, 1, w);
  }
}

export function drawLamp(g, x, y, t) {
  x = Math.round(x); y = Math.round(y);
  g.fillStyle = PAL.ink; g.fillRect(x - 1, y - 20, 3, 20); g.fillRect(x - 3, y - 25, 7, 6);
  g.fillStyle = PAL.wood; g.fillRect(x, y - 19, 1, 19);
  const fl = Math.sin(t * 13) > 0.6 ? PAL.cream : PAL.peach;
  g.fillStyle = PAL.coral; g.fillRect(x - 2, y - 24, 5, 4);
  g.fillStyle = fl; g.fillRect(x - 1, y - 23, 3, 2);
}

/** A dithered smoke puff made of stacked pixel discs: hides whatever stands inside it. */
export function drawSmoke(g, cx, cy, r, age, life, seed) {
  const k = Math.min(1, age / 0.5), fade = Math.min(1, (life - age) / 1.6);
  const rad = r * (0.35 + 0.65 * k);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = i * 2.4 + seed, d = rad * 0.5 * (0.4 + 0.6 * hash(i, seed | 0, 3));
    const px = cx + Math.cos(a + age * 0.35) * d, py = cy + Math.sin(a + age * 0.35) * d * 0.85 - age * 0.7 - rad * 0.2;
    const rr = Math.round(rad * (0.5 + 0.22 * hash(i, 5, seed | 0)));
    const lvl = fade * 16;
    for (let y = -rr; y <= rr; y++) {
      const hw = Math.round(Math.sqrt(Math.max(0, rr * rr - y * y)));
      for (let x = -hw; x <= hw; x += 1) {
        const X = Math.round(px + x), Y = Math.round(py + y);
        const edge = Math.abs(x) > hw - 2 || y < -rr + 2;
        if (bayer(X, Y) >= (edge ? lvl * 0.7 : lvl)) continue;
        g.fillStyle = edge ? PAL.cream : y > rr * 0.3 ? PAL.steel : bayer(X + 1, Y) < 7 ? PAL.cream : PAL.steel;
        g.fillRect(X, Y, 1, 1);
      }
    }
  }
}

export function drawGrenade(g, x, y, t) {
  x = Math.round(x); y = Math.round(y);
  g.fillStyle = PAL.ink; g.fillRect(x - 2, y - 2, 5, 5);
  g.fillStyle = PAL.steel; g.fillRect(x - 1, y - 1, 3, 3);
  g.fillStyle = Math.sin(t * 30) > 0 ? PAL.coral : PAL.cream; g.fillRect(x, y - 2, 1, 1);
}
export { clamp, box, disc };
