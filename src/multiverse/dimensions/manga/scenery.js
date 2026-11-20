// Everything that stands still: the far skyline, the mid-distance blocks, the shopfront wall behind the
// street and the pieces of cover. Each is drawn once into a Sheet (see ink.js) and replayed per frame.
// Nearer layers are LIGHTER: the dark figures read against pale shopfronts, the way a manga page
// separates its cast from a night street with a field of tone.
import { makeRng, rand } from '../../kit.js';
import { Sheet } from './ink.js';
import { WX, XING } from './world.js';

const pick = (r, a) => a[Math.floor(r() * a.length)];

// ---------------------------------------------------------------------------
// shared bits
// ---------------------------------------------------------------------------
function windows(sh, r, x0, y0, cols, rows, cw, ch, gx, gy, lit, style = 'M') {
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = x0 + i * (cw + gx), y = y0 + j * (ch + gy), on = r() < lit;
      sh.rect(on ? 'w' : 'k', x, y, cw, ch);
      if (on) {
        if (r() < 0.5) sh.rect('d2', x, y, cw, ch * 0.5);
        sh.line('sF', x + cw / 2, y, x + cw / 2, y + ch);
      } else sh.line('wF', x + cw * 0.2, y + ch * 0.8, x + cw * 0.55, y + ch * 0.18);
      sh.ruled('s' + style, x, y, x + cw, y + ch, 0.07);
    }
  }
}

function balcony(sh, r, x, y, w) {
  sh.rect('k', x - 0.1, y, w + 0.2, 0.22);
  for (let k = 0.3; k < w; k += 0.42) sh.line('sF', x + k, y, x + k, y - 0.95);
  sh.line('sM', x, y - 0.95, x + w, y - 0.95);
  if (r() < 0.6) { // laundry
    const ly = y - 2.6;
    sh.line('sF', x - 0.2, ly, x + w + 0.2, ly);
    for (let k = 0.5; k < w - 0.4; k += 0.95) { const hh = 0.9 + r() * 0.8; sh.rect(r() < 0.5 ? 'p' : 'd2', x + k, ly, 0.62, hh); sh.ruled('sF', x + k, ly, x + k + 0.62, ly + hh, 0.02); }
  }
}

function acUnit(sh, x, y) {
  sh.rect('p', x, y, 1.3, 0.9);
  sh.ruled('sM', x, y, x + 1.3, y + 0.9, 0.04);
  sh.circ('k', x + 0.65, y + 0.45, 0.3);
  sh.line('wF', x + 0.45, y + 0.4, x + 0.85, y + 0.5);
}

function roofKit(sh, r, w, top) {
  const k = r();
  if (k < 0.34) { // water tank on stilts
    const x = rand(r, 1.2, w - 3.4);
    sh.rect('k', x, top - 2.2, 2.2, 1.7);
    sh.line('wF', x + 0.35, top - 2.0, x + 0.35, top - 0.8);
    sh.rect('k', x + 0.3, top - 0.5, 0.18, 0.5).rect('k', x + 1.7, top - 0.5, 0.18, 0.5);
    sh.rect('k', x - 0.15, top - 2.5, 2.5, 0.35);
  } else if (k < 0.7) { // antennas
    const x = rand(r, 1, w - 2);
    sh.line('sH', x, top, x, top - 3.2);
    sh.line('sM', x - 0.9, top - 2.6, x + 0.9, top - 2.6);
    sh.line('sM', x - 0.6, top - 1.8, x + 0.6, top - 1.8);
    sh.line('sM', x + 0.3, top, x + 1.9, top - 0.9);
  } else { // a roof sign
    const x = rand(r, 0.8, w - 4.2);
    sh.rect('k', x, top - 2.5, 3.4, 1.7);
    sh.rect('w', x + 0.25, top - 2.25, 2.9, 1.2);
    sh.glyphs('k', pick(r, ['ホテル', 'ラーメン', 'タバコ']).slice(0, 3), x + 0.45, top - 1.65, 0.95, 0.15);
    sh.rect('k', x + 0.5, top - 0.8, 0.14, 0.8).rect('k', x + 2.7, top - 0.8, 0.14, 0.8);
  }
}

// ---------------------------------------------------------------------------
// far skyline: black silhouettes against the haze
// ---------------------------------------------------------------------------
function farBuilding(r, w, h) {
  const sh = new Sheet();
  sh.rect('k', 0, -h, w, h);
  if (r() < 0.55) sh.rect('k', w * 0.2, -h - rand(r, 1.2, 3), w * 0.45, 3.5);
  if (r() < 0.5) { const x = rand(r, 0.4, w - 0.4); sh.line('sM', x, -h, x, -h - rand(r, 2, 5)); }
  for (let y = -h + 1.2; y < -1.2; y += 1.7) for (let x = 0.8; x < w - 1; x += 1.5) if (r() < 0.3) sh.rect('w', x, y, 0.55, 0.7);
  sh.line('wF', 0.12, -h + 0.2, 0.12, -0.5); // gouache edge light
  return sh;
}

// the pagoda on the hill: a stack of curved roofs
function pagoda() {
  const sh = new Sheet();
  sh.rect('k', -4, -3, 8, 3);
  let y = -3, hw = 3.4;
  for (let i = 0; i < 5; i++) {
    sh.poly('k', [-hw - 1.4, y, -hw, y - 0.6, hw, y - 0.6, hw + 1.4, y, hw + 0.6, y + 0.25, -hw - 0.6, y + 0.25]);
    sh.rect('k', -hw * 0.6, y - 1.9, hw * 1.2, 1.4);
    sh.rect('w', -0.3, y - 1.5, 0.6, 0.8);
    y -= 1.9; hw *= 0.8;
  }
  sh.line('sH', 0, y, 0, y - 3);
  return sh;
}

// ---------------------------------------------------------------------------
// mid blocks: dense tone, window grids, vertical shop signs
// ---------------------------------------------------------------------------
function midBuilding(r, w, h) {
  const sh = new Sheet();
  sh.rect('d4', 0, -h, w, h);
  sh.rect('k', 0, -h, w, 0.7);
  sh.ruled('sH', 0, -h, w, 0, 0.1);
  const cols = Math.max(2, Math.floor((w - 1) / 2.1)), rows = Math.floor((h - 3) / 2.6);
  windows(sh, r, 0.7, -h + 1.4, cols, rows, 1.1, 1.4, (w - 1.4 - cols * 1.1) / Math.max(1, cols - 1), 1.2, 0.35, 'F');
  sh.hatch('sF', w * 0.72, -h + 0.7, w, 0, 0.7, 1);
  if (r() < 0.8) { // a tall vertical sign
    const x = r() < 0.5 ? -0.6 : w - 1.1, sy = -h * rand(r, 0.35, 0.6), len = 4.4;
    sh.rect('k', x, sy, 1.7, len);
    sh.rect('w', x + 0.18, sy + 0.18, 1.34, len - 0.36);
    const t = pick(r, ['ラーメン', 'スナック', 'ホテル', 'コンビニ']);
    sh.glyphs('k', t.slice(0, 3), x + 0.85, sy + 0.95, 0.95, 0.13, true);
  }
  if (r() < 0.55) roofKit(sh, r, w, -h);
  return sh;
}

// ---------------------------------------------------------------------------
// the shopfront wall (the plane just behind the street). Local x from the left edge, y up is negative.
// ---------------------------------------------------------------------------
function shopfront(sh, r, kind, x, w, lamps) {
  const gf = 5.4;
  switch (kind) {
    case 'ramen': {
      sh.rect('k', x, -gf, w, gf);
      sh.rect('p', x + 1, -gf + 1.9, w - 2, gf - 2.2);
      for (let i = 1; i < 6; i++) sh.line('sF', x + 1 + ((w - 2) * i) / 6, -gf + 1.9, x + 1 + ((w - 2) * i) / 6, -0.3);
      sh.line('sF', x + 1, -gf + 3.8, x + w - 1, -gf + 3.8);
      sh.ruled('sM', x + 1, -gf + 1.9, x + w - 1, -0.3, 0.1);
      const gl = ['ラ', 'ー', 'メ', 'ン'];
      for (let i = 0; i < 4; i++) { // noren curtains
        const nx = x + 1.6 + i * ((w - 3.2) / 4);
        sh.rect('k', nx, -gf + 1.7, (w - 3.2) / 4 - 0.25, 2.5);
        sh.glyphs('w', gl[i], nx + ((w - 3.2) / 8 - 0.12), -gf + 2.95, 1.1, 0.16);
        sh.line('wF', nx + 0.16, -gf + 1.95, nx + 0.16, -gf + 4);
      }
      sh.rect('k', x - 0.2, -gf - 0.1, w + 0.4, 0.55);
      sh.circ('w', x + 0.9, -gf + 0.8, 0.62).circ('sM', x + 0.9, -gf + 0.8, 0.62);
      sh.glyphs('k', 'ラ', x + 0.9, -gf + 0.82, 0.72, 0.1);
      lamps.push({ x: x + 0.9, y: gf - 0.8, r: 3.2 }, { x: x + w / 2, y: 2.2, r: 5 });
      break;
    }
    case 'conv': {
      sh.rect('k', x, -gf, w, gf);
      sh.rect('w', x + 0.5, -gf + 1.3, w - 1, gf - 1.3);
      sh.rect('k', x + 0.5, -gf + 0.2, w - 1, 1.15);
      for (let i = 0; i < 3; i++) sh.rect('w', x + 0.7 + i * 0.5, -gf + 0.28, 0.2, 0.99);
      sh.glyphs('w', 'コンビニ', x + w * 0.5 - 1.6, -gf + 0.78, 0.82, 0.12);
      for (let i = 0; i < 3; i++) { // shelves
        const sx = x + 1 + i * ((w - 2) / 3);
        sh.rect('d2', sx, -gf + 1.9, (w - 2) / 3 - 0.5, 0.8).rect('d1', sx, -gf + 3.1, (w - 2) / 3 - 0.5, 0.8);
        sh.line('sM', sx, -gf + 2.8, sx + (w - 2) / 3 - 0.5, -gf + 2.8).line('sM', sx, -gf + 4, sx + (w - 2) / 3 - 0.5, -gf + 4);
      }
      sh.rect('q', x + w / 2 - 1.2, -gf + 1.6, 2.4, gf - 1.6).ruled('sM', x + w / 2 - 1.2, -gf + 1.6, x + w / 2 + 1.2, -0.05, 0.08);
      sh.line('sF', x + w / 2, -gf + 1.6, x + w / 2, 0);
      sh.ruled('sH', x + 0.5, -gf + 0.2, x + w - 0.5, 0, 0.1);
      lamps.push({ x: x + w / 2, y: 3, r: 9 });
      break;
    }
    case 'shutter': {
      sh.rect('d2', x, -gf, w, gf);
      for (let y = -gf + 0.4; y < 0; y += 0.38) sh.line('sF', x + 0.2, y, x + w - 0.2, y);
      sh.rect('k', x, -gf, w, 0.5);
      sh.ruled('sH', x, -gf, x + w, 0, 0.1);
      const gx = x + w * 0.5, gy = -gf * 0.5; // graffiti: a scribbled spiral and a crown
      const sp = [];
      for (let a = 0; a < 15; a += 0.4) sp.push(gx + Math.cos(a) * (0.2 + a * 0.09), gy + Math.sin(a) * (0.2 + a * 0.07));
      sh.open('sM', sp);
      sh.taper('k', [x + 1.2, -0.8, x + 1.6, -2.4, x + 2.3, -1.4, x + 2.8, -2.6, x + 3.2, -0.8], 0.26, 0.1);
      sh.rect('k', x + w - 2.6, -2.5, 1.8, 2.5).rect('w', x + w - 2.4, -2.3, 1.4, 1.1).line('sM', x + w - 2.4, -0.9, x + w - 1, -0.9);
      break;
    }
    case 'snack': {
      sh.rect('k', x, -gf, w, gf);
      sh.rect('k', x + 0.6, -gf + 0.5, w - 1.2, 1.6).rect('w', x + 0.8, -gf + 0.7, w - 1.6, 1.2);
      sh.glyphs('k', 'スナック', x + 1.2, -gf + 1.28, 0.8, 0.12);
      sh.rect('d3', x + 1, -gf + 2.7, 2.2, 2.7).ruled('sM', x + 1, -gf + 2.7, x + 3.2, -0.05, 0.08);
      sh.circ('w', x + 2.1, -gf + 3.8, 0.55).circ('sM', x + 2.1, -gf + 3.8, 0.55);
      sh.rect('p', x + 4.4, -gf + 2.7, w - 5.6, 2.1).ruled('sM', x + 4.4, -gf + 2.7, x + w - 1.2, -gf + 4.8, 0.08);
      for (let i = 0; i < 4; i++) sh.rect('k', x + 4.8 + i * 1.3, -gf + 3.3, 0.5, 1.5);
      sh.rect('q', x + 1, -0.9, 1.1, 0.9).circ('d3', x + 1.55, -1.3, 0.4);
      lamps.push({ x: x + w / 2, y: gf - 1.2, r: 4 });
      break;
    }
    case 'garage': {
      sh.rect('k', x, -gf, w, gf);
      sh.rect('d4', x + 1, -gf + 1.1, w - 2, gf - 1.1);
      sh.hatch('wF', x + 1, -gf + 1.1, x + w - 1, 0, 1.3, -1);
      sh.ruled('sH', x + 1, -gf + 1.1, x + w - 1, 0, 0.1);
      sh.circ('sM', x + 3, -1, 0.75).circ('sM', x + 5.6, -1, 0.75);
      sh.open('sM', [x + 3, -1, x + 3.5, -2.1, x + 4.8, -2.2, x + 5.6, -1]);
      sh.rect('w', x + w - 2.8, -gf + 0.2, 1.7, 0.7);
      break;
    }
    default: { // alley mouth
      sh.rect('k', x, -gf - 4, w, gf + 4);
      for (let i = 0; i < 18; i++) { const lx = x + 0.4 + r() * (w - 0.8); sh.line('wF', lx, -gf - 3.5 + r() * 6, lx - 0.3, -gf - 1.5 + r() * 7); }
      sh.rect('d4', x, -gf + 2.5, w, gf - 2.5);
      sh.rect('w', x + w * 0.62, -3.5, 0.5, 0.45).rect('w', x + w * 0.62 + 0.9, -3.5, 0.5, 0.45); // two eyes in the dark
      sh.ruled('sH', x, -gf - 4, x + w, 0, 0.1);
    }
  }
}

function backWall(r, lamps) {
  const out = [];
  let x = -14;
  const gaps = [[XING.x - 5.2, XING.x + 5.2]];
  while (x < WX + 14) {
    const w = rand(r, 11, 17);
    if (gaps.some((g) => x < g[1] && x + w > g[0])) { x += 4; continue; }
    const H = rand(r, 15, 21), sh = new Sheet();
    const kind = pick(r, ['ramen', 'conv', 'shutter', 'snack', 'garage', 'ramen', 'conv', 'shutter', 'snack']);
    const lp = [];
    sh.rect('d3', 0, -H, w, H);
    sh.rect('k', -0.3, -H - 0.4, w + 0.6, 0.9);
    sh.rect('k', -0.3, -5.9, w + 0.6, 0.55); // the awning band between shop and flats
    sh.hatch('sF', 0, -5.35, w, -5.9, 0.6, 1);
    // flats above
    const fl = Math.floor((H - 6.5) / 4.4);
    for (let f = 0; f < fl; f++) {
      const y = -6.9 - f * 4.4, cols = Math.max(2, Math.floor((w - 1) / 3.6));
      windows(sh, r, 1.2, y - 2.1, cols, 1, 2.2, 2.1, (w - 2.4 - cols * 2.2) / Math.max(1, cols - 1), 0, 0.45, 'M');
      for (let c = 0; c < cols; c++) if (r() < 0.55) balcony(sh, r, 1.0 + c * ((w - 2.4) / cols + 0.2), y + 0.05, 2.7);
      if (r() < 0.5) acUnit(sh, rand(r, 1, w - 3), y - 3.6);
    }
    sh.hatch('sF', w * 0.78, -H + 0.8, w, -5.9, 0.8, 1);
    roofKit(sh, r, w, -H - 0.4);
    shopfront(sh, r, kind, 0, w, lp);
    sh.ruled('sH', 0, -H - 0.4, w, 0, 0.12);
    out.push({ sh, x, w });
    for (const l of lp) lamps.push({ x: x + l.x, y: l.y, r: l.r });
    x += w + 0.2;
  }
  return out;
}

// ---------------------------------------------------------------------------
// cover
// ---------------------------------------------------------------------------
// Origin = the front-left foot of the footprint; the roof is a rectangle d*0.5 deep above the face.
function box(sh, w, h, d, face, roof) {
  sh.rect(roof, 0, -h - d * 0.5, w, d * 0.5);
  sh.rect(face, 0, -h, w, h);
  sh.ruled('sH', 0, -h - d * 0.5, w, 0, 0.1);
  sh.line('sM', 0, -h, w, -h);
}

function propSheet(c, r) {
  const sh = new Sheet(), { w, h, d, v } = c;
  switch (c.kind) {
    case 'vend': {
      box(sh, w, h, d, 'k', 'q');
      sh.rect('w', 0.22, -h + 0.25, w - 0.44, 0.55); // lit header
      sh.glyphs('k', ['ホ', 'ス', 'カ'][v], 0.36, -h + 0.52, 0.42, 0.07);
      sh.rect('p', 0.25, -h + 1.0, w - 1.1, h * 0.55);
      for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) { const cx = 0.38 + i * 0.36, cy = -h + 1.15 + j * 0.62; sh.rect(j === 1 ? 'k' : 'd3', cx, cy, 0.22, 0.46); sh.line('sF', cx, cy + 0.12, cx + 0.22, cy + 0.12); }
      sh.line('wF', 0.3, -h + 1.05, 0.3 + 0.7, -h + 1.0 + h * 0.5);
      sh.ruled('sM', 0.25, -h + 1.0, w - 0.85, -h + 1.0 + h * 0.55, 0.05);
      for (let i = 0; i < 4; i++) sh.rect('w', w - 0.62, -h + 1.1 + i * 0.5, 0.36, 0.3);
      sh.rect('d2', 0.25, -0.75, w - 0.5, 0.5).line('wF', 0.4, -0.4, w - 0.5, -0.4);
      break;
    }
    case 'crate': {
      box(sh, w, h, d, 'q', 'p');
      for (let k = 1; k < 4; k++) sh.line('sM', 0, -h * (k / 4) , w, -h * (k / 4));
      sh.line('sM', w * 0.5, -h, w * 0.5, 0);
      sh.line('sM', 0, -h, w * 0.5, -h * 0.5).line('sM', w * 0.5, -h * 0.5, w, -h).line('sF', 0, -h * 0.5, w * 0.5, 0).line('sF', w * 0.5, 0, w, -h * 0.5);
      sh.hatch('sF', w * 0.55, -h, w, 0, 0.55, 1);
      sh.rect('w', 0.35, -h + 0.45, 1.1, 0.7).glyphs('k', ['ハ', 'ナ', 'コ'][v], 0.9, -h + 0.8, 0.6, 0.1);
      sh.line('wF', 0.1, -h + 0.1, w - 0.2, -h + 0.1);
      break;
    }
    case 'bins': {
      box(sh, w, h, d, 'd3', 'q');
      sh.rect('k', 0.15, -h - 0.28, w * 0.46, 0.5).rect('k', w * 0.55, -h - 0.28, w * 0.4, 0.5);
      sh.line('sH', w * 0.5, -h + 0.1, w * 0.5, 0);
      sh.line('wM', 0.35, -h + 0.5, 0.35, -0.5).line('wM', w * 0.62, -h + 0.5, w * 0.62, -0.5);
      sh.hatch('sF', 0.1, -h + 0.3, w - 0.1, -0.1, 0.45, -1);
      break;
    }
    case 'cart': {
      sh.rect('k', 0, -h * 0.55, w, h * 0.55);
      sh.rect('d2', 0.2, -h * 0.55 + 0.25, w - 0.4, h * 0.4);
      sh.ruled('sH', 0, -h * 0.55, w, 0, 0.08);
      sh.rect('k', 0, -h - 0.4, w, 0.2); // awning poles and striped cloth
      sh.line('sH', 0.15, -h + 0.15, 0.15, -h * 0.55).line('sH', w - 0.15, -h + 0.15, w - 0.15, -h * 0.55);
      for (let i = 0; i < 7; i++) sh.rect(i & 1 ? 'k' : 'p', (i * w) / 7, -h, w / 7, 0.9);
      sh.ruled('sM', 0, -h, w, -h + 0.9, 0.08);
      sh.circ('p', 0.9, -h * 0.55 - 0.8, 0.55).circ('sM', 0.9, -h * 0.55 - 0.8, 0.55);
      sh.glyphs('k', 'ラ', 0.9, -h * 0.55 - 0.78, 0.55, 0.09);
      sh.circ('k', 0.7, 0.05, 0.45).circ('k', w - 0.7, 0.05, 0.45).circ('w', 0.7, 0.05, 0.12).circ('w', w - 0.7, 0.05, 0.12);
      break;
    }
    case 'scoot': {
      sh.circ('k', 0.55, -0.55, 0.55).circ('k', w - 0.55, -0.55, 0.55).circ('w', 0.55, -0.55, 0.22).circ('w', w - 0.55, -0.55, 0.22);
      sh.poly('k', [0.55, -0.85, 1.3, -1.45, 1.85, -1.1, 2.2, -1.5, w - 0.55, -1.5, w - 0.4, -0.7, w - 0.9, -0.55, 1.3, -0.55]);
      sh.rect('k', 1.2, -1.75, 1.0, 0.38);
      sh.open('sH', [w - 0.8, -1.5, w - 0.7, -2.2, w - 0.35, -2.4]);
      sh.line('wM', 1.5, -1.25, 2.2, -1.3).line('wF', w - 0.9, -1.35, w - 0.55, -1.1);
      sh.ruled('sF', 0, -0.05, w, 0, 0.01);
      break;
    }
    case 'toro': {
      sh.rect('d3', 0.1, -0.5, w - 0.2, 0.5).rect('d2', 0.45, -1.4, w - 0.9, 0.9).rect('k', 0.15, -1.6, w - 0.3, 0.25);
      sh.rect('p', 0.3, -2.7, w - 0.6, 1.1).rect('w', 0.5, -2.55, w - 1.0, 0.8);
      sh.poly('k', [-0.3, -2.7, w * 0.5, -3.5, w + 0.3, -2.7]);
      sh.circ('k', w * 0.5, -3.9, 0.22);
      sh.ruled('sM', 0.1, -0.5, w - 0.1, 0, 0.04).ruled('sM', 0.3, -2.7, w - 0.3, -1.6, 0.04);
      sh.hatch('sF', w * 0.55, -1.4, w - 0.45, -0.5, 0.3, 1);
      break;
    }
    case 'pole': {
      sh.rect('k', 0.2, -h, 0.4, h);
      sh.line('wF', 0.28, -h + 0.5, 0.28, -0.4);
      sh.rect('k', -0.5, -h - 0.1, 1.8, 0.25);
      sh.poly('k', [-0.7, -h + 0.2, 1.5, -h + 0.2, 1.1, -h - 0.6, -0.3, -h - 0.6]);
      sh.rect('k', 0, -0.4, 0.8, 0.4);
      break;
    }
    case 'bench': {
      sh.rect('k', 0, -1.3, w, 0.34).rect('k', 0.2, -0.95, 0.25, 0.95).rect('k', w - 0.45, -0.95, 0.25, 0.95);
      sh.rect('p', 0.15, -1.9, w - 0.3, 0.5).ruled('sM', 0.15, -1.9, w - 0.15, -1.4, 0.03);
      sh.line('wF', 0.3, -1.25, w - 0.3, -1.25);
      break;
    }
    default: { // torii pillar: black shaft with a white edge light, a base ring and the tie beam
      sh.rect('k', 0.12, -h, 0.76, h);
      sh.rect('k', 0, -1.2, 1, 1.2);
      sh.line('wM', 0.3, -h + 0.6, 0.3, -1.5);
      sh.line('wF', 0.7, -h + 1.6, 0.7, -4);
    }
  }
  return sh;
}

// A torii's lintels: drawn once between the two pillars of a gate.
function toriiTop(span) {
  const sh = new Sheet(), top = -8.6;
  sh.poly('k', [-1.8, top - 0.3, span + 1.8 + 1, top - 0.3, span + 1.8 + 1.5, top - 1.4, -2.3, top - 1.4]);
  sh.rect('k', -1, top + 0.9, span + 3, 0.5);
  sh.rect('k', span * 0.5 + 0.2, top + 0.2, 0.6, 0.8);
  sh.line('wM', -1.2, top - 0.5, span + 2.4, top - 0.5);
  sh.line('wF', -1.2, top - 1.2, span + 1.8, top - 1.2);
  sh.glyphs('w', 'ト', span * 0.5 + 0.5, top + 0.62, 0.55, 0.1);
  return sh;
}

// ---------------------------------------------------------------------------
export function buildScenery(world) {
  const r = makeRng(world.seed ^ 0x51ed), lamps = [];
  const far = [], mid = [];
  let x = -120;
  while (x < 160) { const w = rand(r, 6, 12); far.push({ sh: farBuilding(r, w, rand(r, 9, 24)), x }); x += w + rand(r, 0, 1.6); }
  far.push({ sh: pagoda(), x: 34, hill: true }, { sh: pagoda(), x: 98, hill: true });
  x = -60;
  while (x < 150) { const w = rand(r, 7, 13); mid.push({ sh: midBuilding(r, w, rand(r, 11, 19)), x }); x += w + rand(r, 0.2, 1); }
  const back = backWall(r, lamps);
  const props = new Map();
  const torii = [];
  for (const c of world.cover) {
    props.set(c.id, propSheet(c, r));
    if (c.id === 14 || c.id === 115) torii.push({ x: c.x, z: c.z + c.d, sh: toriiTop(world.cover.find((q) => q.id === (c.id === 14 ? 15 : 114)).x - c.x) }); // the left pillar of each gate
  }
  for (const c of world.cover) if (c.kind === 'pole') lamps.push({ x: c.x + 0.4, y: 10.4, r: 7, pole: true });
  return { far, mid, back, props, torii, lamps };
}
