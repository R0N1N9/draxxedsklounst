// Baked art for CARTRIDGE CANYON: dusk sky with a striped sun, three ridges of haze, the
// chasm's distant spires, the cliffs themselves, and the props that get redrawn each frame.
import { clamp, hexToRgb, noise2, fbm, makeCanvas } from '../../kit.js';
import { PAL, FW, FH, bayer, hash, dither } from './palette.js';
import { disc, line, tri } from './px.js';
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
    const i0 = Math.floor(v), fr = clamp((v - i0 - 0.7) * 3.3, 0, 1); // flat bands, dithered only where they meet
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
      put(img, x, y, d < 1 ? (near ? PAL.coral : PAL.rose) : d > 22 ? PAL.rose : d > 14 && bayer(x, y) < (d - 14) * 2 ? PAL.rose : PAL.orchid);
    }
    for (let y = mes[x]; y < FH; y++) {
      const d = y - mes[x];
      put(img, x, y, d < 1 ? PAL.orchid : d > 20 ? PAL.orchid : d > 13 && bayer(x, y) < (d - 13) * 2.2 ? PAL.orchid : PAL.plum);
    }
  }
  // the abyss: fade everything below the plateau line into night
  for (let y = 112; y < FH; y++) {
    const t = (y - 112) / 68;
    for (let x = 0; x < FW; x++) {
      if (t < 0.3) continue;
      if (t < 0.45) { if (bayer(x, y) < ((t - 0.3) / 0.15) * 16) put(img, x, y, PAL.night); }
      else if (t < 0.72) put(img, x, y, PAL.night);
      else if (t < 0.86) put(img, x, y, bayer(x, y) < ((t - 0.72) / 0.14) * 16 ? PAL.ink : PAL.night);
      else put(img, x, y, PAL.ink);
    }
  }
  // spires in the chasm
  for (const [cx, w, ty] of [[134, 12, 128], [160, 16, 119], [190, 11, 132]]) {
    for (let y = ty; y < FH - 6; y++) for (let x = cx - w / 2; x < cx + w / 2; x++) {
      const dd = y - ty, lit = x < cx - w / 2 + 2;
      const col = dd < 2 ? PAL.orchid : lit ? PAL.plum : PAL.night;
      put(img, Math.round(x), y, dd > 30 ? (bayer(x, y) < (dd - 30) * 1.2 ? PAL.ink : col) : col);
    }
  }
  g.putImageData(img, 0, 0);
  const stars = [];
  for (let i = 0; i < 34; i++) stars.push({ x: Math.floor(hash(i, 1, seed) * FW), y: Math.floor(hash(i, 2, seed) * 52), ph: hash(i, 3, seed) * 6.28, c: hash(i, 4, seed) > 0.7 ? PAL.peach : PAL.cream });
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
  // rough up the faces that look into the chasm so the cliffs are rock, not rulers
  for (let y = world.GY + 2; y < FH - 12; y++) {
    const jl = Math.round(noise2(y * 0.33, seed * 0.1) * 2.2), jr = Math.round(noise2(y * 0.29 + 50, seed * 0.1) * 2.2);
    let xl = -1, xr = FW;
    for (let x = 0; x < FW / 2 && m[y * FW + x]; x++) xl = x;
    for (let x = FW - 1; x >= FW / 2 && m[y * FW + x]; x--) xr = x;
    if (xl >= 0 && xl < FW / 2 - 6) { if (jl > 0) for (let x = xl + 1; x <= xl + jl; x++) m[y * FW + x] = 1; else for (let x = xl; x > xl + jl; x--) m[y * FW + x] = 0; }
    if (xr < FW && xr > FW / 2 + 6) { if (jr > 0) for (let x = xr - 1; x >= xr - jr; x--) m[y * FW + x] = 1; else for (let x = xr; x < xr - jr; x++) m[y * FW + x] = 0; }
  }
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
    else if (side === 0 && y > lipY + 1) col = hv < 0.75 ? PAL.rose : PAL.orchid;
    else if (side === 1 && y > lipY + 1) col = hv < 0.3 ? PAL.rose : PAL.orchid;
    else if (!at(x, y + 1) && y < FH - 1) col = PAL.night;
    else {
      const by = y + Math.round(noise2(x * 0.035, seed * 0.3) * 4);
      const band = Math.floor(by / 9);
      col = band % 3 === 1 ? PAL.orchid : PAL.plum;
      if (by % 9 === 0 && noise2(x * 0.23, y * 0.7 + seed) > -0.25) col = PAL.night; // a stratum line, broken
      else if (hv < 0.018) col = PAL.night;
      else if (col === PAL.orchid && by % 9 === 1) col = PAL.rose;
    }
    if (y > 150 && !(plateau && up < 4)) col = y > 166 ? (bayer(x, y) < (y - 166) * 1.6 ? PAL.ink : PAL.night) : bayer(x, y) < (y - 150) * 1.0 ? PAL.night : col;
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
  // a mine door cut into each cliff
  for (const side of [0, 1]) {
    const dx = side ? FW - 36 : 24, dy = world.GY + 22;
    mineDoor(g, dx, dy);
  }
  return { canvas, g };
}

function mineDoor(g, x, y) {
  g.fillStyle = PAL.ink; g.fillRect(x - 1, y - 1, 15, 19);
  g.fillStyle = PAL.wood; g.fillRect(x, y, 13, 18);
  g.fillStyle = PAL.ink; g.fillRect(x + 2, y + 3, 9, 15);
  g.fillStyle = PAL.night; g.fillRect(x + 3, y + 4, 7, 14);
  g.fillStyle = PAL.coral; g.fillRect(x, y, 13, 1);
  g.fillStyle = PAL.ink; g.fillRect(x + 6, y + 4, 1, 14);
  g.fillStyle = PAL.peach; g.fillRect(x + 11, y + 6, 1, 2); // a lantern glints in the dark
  g.fillStyle = PAL.coral; g.fillRect(x + 11, y + 8, 1, 1);
  g.fillStyle = PAL.wood; g.fillRect(x - 3, y + 17, 19, 2); g.fillStyle = PAL.ink; g.fillRect(x - 3, y + 19, 19, 1); // the sill
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
  const h = 6 - Math.round(squash * 3); // compressed height of the coil
  g.fillStyle = PAL.ink; g.fillRect(x - 8, y - 2, 17, 2); g.fillRect(x - 7, y - h - 3, 15, 3);
  g.fillStyle = PAL.steel; g.fillRect(x - 7, y - 1, 15, 1);
  g.fillStyle = PAL.coral; g.fillRect(x - 6, y - h - 2, 13, 1);
  g.fillStyle = PAL.cream; g.fillRect(x - 6, y - h - 2, 4, 1);
  // zig-zag coil
  for (let i = 0; i < h - 1; i++) {
    const zx = x - 4 + ((i % 2) ? 6 : 0);
    g.fillStyle = PAL.ink; g.fillRect(zx - 1, y - 2 - i, 5, 1);
    g.fillStyle = i % 2 ? PAL.steel : PAL.cream; g.fillRect(zx, y - 2 - i, 3, 1);
  }
}

/** The crossing bird: a big glider with a hooked beak and flapping wings. dir +1 flies to the right. */
export function drawBird(g, x, y, dir, flap) {
  x = Math.round(x); y = Math.round(y);
  const f = dir, ph = Math.floor((((flap / 6.2832) % 1) + 1) % 1 * 4);
  const R = (px, py, w, h, c) => { g.fillStyle = c; g.fillRect(f > 0 ? x + px : x - px - w, y + py, w, h); };
  const T = (ax, ay, bx, by, cx, cy, c) => tri(g, x + f * ax, y + ay, x + f * bx, y + by, x + f * cx, y + cy, c);
  const tip = ph === 0 ? [-14, -15] : ph === 2 ? [-13, 9] : [-17, -3]; // up, mid, down, mid
  // far wing, then body, then near wing over it
  T(2, -3, tip[0] + 2, tip[1] + (ph === 2 ? -1 : 1), -9, -3, PAL.ink); T(1, -3, tip[0] + 3, tip[1] + (ph === 2 ? -2 : 2), -7, -3, PAL.orchid);
  R(-12, -4, 3, 3, PAL.ink); R(-11, -3, 3, 1, PAL.orchid); R(-16, -3, 5, 2, PAL.ink); R(-15, -2, 4, 1, PAL.rose); // tail feathers
  R(-10, -5, 22, 9, PAL.ink); R(-9, -4, 20, 7, PAL.rose); R(-9, -4, 20, 2, PAL.coral); R(-9, 1, 20, 2, PAL.orchid);
  R(9, -8, 9, 7, PAL.ink); R(10, -7, 7, 5, PAL.peach); R(14, -6, 2, 2, PAL.cream); R(15, -5, 1, 1, PAL.ink); // head and eye
  R(17, -5, 8, 4, PAL.ink); R(18, -4, 7, 2, PAL.amber); R(23, -2, 3, 3, PAL.ink); R(24, -1, 1, 1, PAL.amberD); // hooked beak
  R(6, -11, 4, 4, PAL.ink); R(7, -10, 2, 3, PAL.coral); // crest
  T(4, -3, tip[0] - 2, tip[1], -6, -3, PAL.ink); T(3, -3, tip[0] - 1, tip[1] + (ph === 2 ? -1 : 1), -5, -3, PAL.coral);
  T(2, -3, tip[0] + 1, tip[1] + (ph === 2 ? -2 : 2), -2, -3, PAL.peach);
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

const SM = { c: null, g: null };
/** A lumpy cartoon cloud of stacked pixel discs, outlined, shaded, and dissolving by dither: hides whatever stands inside it. */
export function drawSmoke(g, cx, cy, r, age, life, seed) {
  if (!SM.c) { const m = makeCanvas(72, 64); SM.c = m.canvas; SM.g = m.g; }
  const t = SM.g, k = Math.min(1, age / 0.45), rad = r * (0.4 + 0.6 * k);
  t.clearRect(0, 0, 72, 64);
  const ox = 36, oy = 38, n = 9;
  const puff = (pass) => {
    for (let i = 0; i < n; i++) {
      const a = i * 2.39 + seed, d = rad * 0.55 * (0.25 + 0.75 * hash(i, seed | 0, 3));
      const px = ox + Math.cos(a + age * 0.2) * d, py = oy + Math.sin(a + age * 0.2) * d * 0.8 - age * 0.5 - (i % 3) * 2;
      const rr = Math.max(3, Math.round(rad * (0.34 + 0.2 * hash(i, 5, seed | 0))));
      if (pass === 0) disc(t, px, py, rr + 1, PAL.night);
      else if (pass === 1) { disc(t, px, py, rr, PAL.steel); disc(t, px - 1, py - 1, rr - 1, PAL.cream); disc(t, px + 1, py + 2, Math.max(1, rr - 3), PAL.steel); disc(t, px - 1, py - 1, Math.max(1, rr - 3), PAL.cream); }
    }
  };
  puff(0); puff(1);
  const fade = Math.min(1, (life - age) / 1.4);
  if (fade < 1) { t.globalCompositeOperation = 'destination-out'; t.fillStyle = dither(t, '#000', 16 - fade * 16); t.fillRect(0, 0, 72, 64); t.globalCompositeOperation = 'source-over'; }
  g.drawImage(SM.c, Math.round(cx) - ox, Math.round(cy) - oy);
}

export function drawGrenade(g, x, y, t) {
  x = Math.round(x); y = Math.round(y);
  g.fillStyle = PAL.ink; g.fillRect(x - 2, y - 2, 5, 5);
  g.fillStyle = PAL.steel; g.fillRect(x - 1, y - 1, 3, 3);
  g.fillStyle = Math.sin(t * 30) > 0 ? PAL.coral : PAL.cream; g.fillRect(x, y - 2, 1, 1);
}

/** Soft fog banks for the chasm: wide strips with wavy tops, dithered, tiled horizontally while they drift. */
export function bakeMist(seed) {
  const out = [];
  for (const [i, h, lvl, col, y, sp] of [[0, 16, 5, PAL.orchid, 126, 3], [1, 18, 7, PAL.rose, 140, 5], [2, 18, 9, PAL.plum, 154, 7]]) {
    const w = 320;
    const { canvas, g } = makeCanvas(w, h);
    const img = g.createImageData(w, h);
    for (let x = 0; x < w; x++) {
      const top = Math.round(3 + 3.5 * Math.sin((x / w) * 6.2832 * 2 + i) + 2 * Math.sin((x / w) * 6.2832 * 5 + i * 2.1));
      for (let yy = Math.max(0, top); yy < h; yy++) {
        const d = yy - top;
        if (bayer(x, yy) >= (d < 2 ? lvl * 0.6 : lvl + d * 0.5)) continue;
        const c = RGB[col], k = (yy * w + x) * 4;
        img.data[k] = c.r; img.data[k + 1] = c.g; img.data[k + 2] = c.b; img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    out.push({ canvas, y, sp });
  }
  return out;
}
