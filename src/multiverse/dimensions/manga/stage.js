// The set, drawn behind and around the cast: the toned night sky and moon, two parallax layers of skyline,
// the shopfront wall, the wet street with its lamp-pools and the level crossing, the train itself, the canal
// wall in front, and the ink rain. Nearer layers are lighter so the dark figures always stand out.
import { clamp, mulberry32 } from '../../kit.js';
import { C, drawSheet } from './ink.js';
import { WX, WZ, DY, XING, TRAIN } from './world.js';

const TAU = Math.PI * 2;
const FAR = { par: 0.26, k: 0.46, up: 5.2 }, MID = { par: 0.58, k: 0.74, up: 2.0 };

export function makeSet(seed) {
  const r = mulberry32(seed ^ 0x9e37), clouds = [], streaks = [], drops = new Float32Array(150 * 4);
  for (let i = 0; i < 7; i++) clouds.push({ x: r() * 900, y: 0.1 + r() * 0.34, w: 140 + r() * 260, h: 12 + r() * 20, sp: 4 + r() * 8 });
  for (let i = 0; i < 40; i++) streaks.push({ x: r() * WX, z: 2.6 + r() * 15.5, l: 6 + r() * 26 });
  for (let i = 0; i < 150; i++) { drops[i * 4] = r(); drops[i * 4 + 1] = r(); drops[i * 4 + 2] = 0.6 + r() * 0.8; drops[i * 4 + 3] = r(); }
  return { clouds, streaks, drops, wob: 0 };
}

// ---------------------------------------------------------------------------
// The sky (ink, a gradation tone glowing up from the rooftops, the moon and its stippled rings) never changes
// for a given page size, so it is painted once into an off-screen canvas and blitted.
const skyCache = { c: null, key: '' };
function drawSky(g, v, tones) {
  const { px, py, pw, ph } = v, k = Math.min(1, 4000 / ((pw + 28) * v.dpr)), key = `${pw}|${ph}|${v.dpr}`;
  if (skyCache.key !== key) {
    const c = skyCache.c || (skyCache.c = document.createElement('canvas'));
    c.width = Math.max(2, Math.round((pw + 28) * v.dpr * k));
    c.height = Math.max(2, Math.round((ph + 28) * v.dpr * k));
    const q = c.getContext('2d');
    q.setTransform(v.dpr * k, 0, 0, v.dpr * k, 14 * v.dpr * k, 14 * v.dpr * k);
    q.fillStyle = C.ink;
    q.fillRect(-14, -14, pw + 28, ph + 28);
    // the haze: white dots swelling toward the horizon (anchored to the page, so the pattern origin is 0, 0)
    const yH = ph * 0.62;
    const pat = tones.grad(g, yH, true, 2.9);
    if (tones.m && pat.setTransform) { tones.m.a = tones.m.d = 1 / v.dpr; tones.m.e = 0; tones.m.f = 0; pat.setTransform(tones.m); }
    q.fillStyle = pat;
    q.fillRect(-14, -14, pw + 28, yH + 14);
    const mx = pw * 0.8, my = ph * 0.19, mr = Math.max(26, ph * 0.07);
    for (const [kk, tn] of [[2.6, 'v1'], [1.9, 'v2'], [1.45, 'v3']]) {
      const p = tones.pat[tn];
      if (tones.m && p.setTransform) { tones.m.a = tones.m.d = 1 / v.dpr; tones.m.e = tones.m.f = 0; p.setTransform(tones.m); }
      q.fillStyle = p;
      q.beginPath(); q.arc(mx, my, mr * kk, 0, TAU); q.fill();
    }
    q.fillStyle = C.white;
    q.beginPath(); q.arc(mx, my, mr, 0, TAU); q.fill();
    q.strokeStyle = C.ink;
    q.lineWidth = 1.2;
    q.beginPath(); q.arc(mx - mr * 0.25, my + mr * 0.1, mr * 0.28, 0.5, 4); q.moveTo(mx + mr * 0.5, my - mr * 0.3); q.arc(mx + mr * 0.35, my - mr * 0.3, mr * 0.15, 0, 5); q.stroke();
    skyCache.key = key;
  }
  g.drawImage(skyCache.c, px - 14, py - 14, pw + 28, ph + 28);
}

export function drawBackdrop(g, v, tones, sc, set, st) {
  const { px, py, pw, ph, S } = v, t = st.t;
  drawSky(g, v, tones);
  // ink clouds sliding across
  g.lineCap = 'round';
  for (const c of set.clouds) {
    const span = pw + c.w * 2, x = px + (((c.x + t * c.sp - v.cx * 0.1 * S) % span) + span) % span - c.w, y = py + ph * c.y, w = c.w * (S / 14), h = c.h * (S / 14);
    g.beginPath();
    g.moveTo(x - w / 2, y);
    g.quadraticCurveTo(x - w * 0.1, y - h * 1.6, x + w / 2, y + h * 0.1);
    g.quadraticCurveTo(x, y + h * 0.7, x - w / 2, y);
    g.fillStyle = C.ink;
    g.fill();
    g.strokeStyle = C.white;
    g.lineWidth = 1.3;
    g.beginPath();
    g.moveTo(x - w * 0.42, y + h * 0.1);
    g.quadraticCurveTo(x, y + h * 0.6, x + w * 0.46, y + h * 0.05);
    g.stroke();
  }
  // layers
  layer(g, v, tones, sc.far, FAR);
  layer(g, v, tones, sc.mid, MID);
  // haze between the skyline and the wall: a gradation tone growing darker toward the street
  // the shopfront wall, in the plane of the street
  const zk = DY * S;
  for (const it of sc.back) {
    const x0 = v.sx(it.x);
    if (x0 > px + pw || x0 + (it.w + 1) * S < px) continue;
    g.save();
    g.translate(x0, v.y0 - 0.3 * zk);
    g.scale(S, S);
    drawSheet(g, it.sh, tones, S);
    g.restore();
  }
  // lamps and windows spill light: stippled glows on the wall
  if (!tones.lite) for (const l of sc.lamps) {
    const x = v.sx(l.x), y = v.y0 - l.y * S;
    if (x < px - 100 || x > px + pw + 100) continue;
    const fl = 1 - 0.1 * Math.sin(t * 9 + l.x * 3) * (st.flick || 0);
    for (const [k, tn] of [[1.0, 'v1'], [0.7, 'v2'], [0.42, 'v3']]) { tones.use(g, tn, 1); g.beginPath(); g.arc(x, y, l.r * 0.55 * S * k * fl, 0, TAU); g.fill(); }
  }
}

function layer(g, v, tones, items, L) {
  const { px, pw, S } = v, s = S * L.k, base = v.y0 - L.up * S, cx = px + pw / 2 - v.cx * L.par * s;
  for (const it of items) {
    const x = cx + it.x * s;
    const w = (it.sh.x1 - it.sh.x0) * s;
    if (x + w + 20 < px || x - 20 > px + pw) continue;
    g.save();
    g.translate(x, base + (it.hill ? 2.5 * S : 0));
    g.scale(s, s);
    drawSheet(g, it.sh, tones, s);
    g.restore();
  }
}

// ---------------------------------------------------------------------------
// the street
// ---------------------------------------------------------------------------
export function drawGround(g, v, tones, sc, set, world, st) {
  const { px, py, pw, ph, S } = v, zk = DY * S, t = st.t;
  const xa = v.sx(-40), xb = v.sx(WX + 40), ya = v.y0, yb = v.sy(WZ), yEnd = py + ph;
  g.save();
  g.beginPath();
  g.rect(px, py, pw, ph);
  g.clip();
  // pavement, road, front kerb
  g.fillStyle = C.paper;
  g.fillRect(xa, ya, xb - xa, yb - ya);
  g.save();
  g.translate(v.ox, v.oy);
  tones.use(g, 'd1', 1);
  g.fillRect(xa - v.ox, 0, xb - xa, 2 * zk);
  g.fillRect(xa - v.ox, 18.4 * zk, xb - xa, 1.6 * zk);
  tones.use(g, 'd2', 1);
  g.fillRect(xa - v.ox, 2 * zk, xb - xa, 16.4 * zk);
  g.restore();
  // the pools of light under the lamps: clean paper, so a black figure standing in one is a strong shape
  for (const l of sc.lamps) {
    if (l.pole && l.y < 5) continue;
    const x = v.sx(l.x);
    if (x < px - 200 || x > px + pw + 200) continue;
    const zc = l.pole ? 17.2 : Math.min(9.5, 2.6 + l.r * 0.65), rx = l.r * 1.25 * S, ry = Math.max(rx * 0.22, l.r * 0.5 * zk);
    g.fillStyle = C.paper;
    g.beginPath(); g.ellipse(x, v.sy(zc), rx, ry, 0, 0, TAU); g.fill();
    g.fillStyle = C.white;
    g.beginPath(); g.ellipse(x, v.sy(zc), rx * 0.6, ry * 0.6, 0, 0, TAU); g.fill();
    g.strokeStyle = C.ink;
    g.lineWidth = 1;
    g.beginPath();
    for (let i = -3; i <= 3; i++) { const sx = x + i * rx * 0.22; g.moveTo(sx, v.sy(zc) - ry * 0.45 * (1 - Math.abs(i) / 4)); g.lineTo(sx + 0.4, v.sy(zc) + ry * 0.45 * (1 - Math.abs(i) / 4)); }
    g.stroke();
  }
  // kerbs and long asphalt streaks
  g.lineCap = 'round';
  g.strokeStyle = C.ink;
  g.lineWidth = 2.6;
  g.beginPath(); g.moveTo(xa, v.sy(2)); g.lineTo(xb, v.sy(2)); g.moveTo(xa, yb); g.lineTo(xb, yb); g.stroke();
  g.lineWidth = 1;
  g.beginPath();
  for (const s of set.streaks) { const x = v.sx(s.x), y = v.sy(s.z); g.moveTo(x, y); g.lineTo(x + s.l * S * 0.5, y); }
  g.moveTo(xa, v.sy(18.4)); g.lineTo(xb, v.sy(18.4));
  g.stroke();
  g.strokeStyle = C.white; // wet kerb highlight
  g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(xa, v.sy(2) + 3.5); g.lineTo(xb, v.sy(2) + 3.5); g.stroke();
  // centre line: white dashes on the grey road
  g.lineWidth = Math.max(2, S * 0.16);
  g.setLineDash([S * 3, S * 2.4]);
  g.beginPath(); g.moveTo(xa, v.sy(10.3)); g.lineTo(xb, v.sy(10.3)); g.stroke();
  g.setLineDash([]);
  drawCrossing(g, v, tones, st);
  // the canal wall and water in front of the street
  const wall = Math.max(8, 2.4 * S), wy = yb;
  g.fillStyle = C.paper2;
  g.fillRect(px, wy, pw, wall);
  tones.use(g, 'd1', 1);
  g.fillRect(px, wy, pw, wall);
  g.strokeStyle = C.ink;
  g.lineWidth = 1;
  g.beginPath();
  for (let y = wy + wall * 0.34; y < wy + wall; y += wall * 0.34) { g.moveTo(px, y); g.lineTo(px + pw, y); }
  const bs = 2.2 * S;
  for (let r = 0; r < 3; r++) for (let x = (v.ox % bs) + (r & 1 ? bs / 2 : 0); x < px + pw + bs; x += bs) { g.moveTo(x, wy + wall * 0.34 * r); g.lineTo(x, wy + wall * 0.34 * (r + 1)); }
  g.stroke();
  g.fillStyle = C.ink;
  g.fillRect(px, wy + wall, pw, yEnd - wy - wall);
  g.fillRect(px, wy - 1, pw, 4.4);
  g.strokeStyle = C.white;
  g.lineWidth = 1.4;
  g.beginPath();
  for (let i = 0; i < 46; i++) { // ripples and lamp reflections
    const h = (i * 0.6180339 + 0.13) % 1, y = wy + wall + 8 + h * (yEnd - wy - wall - 12), x0 = px + ((i * 97.3 + t * (8 + h * 14)) % (pw + 80)) - 40;
    g.moveTo(x0, y); g.lineTo(x0 + 14 + h * 40, y);
  }
  g.stroke();
  g.restore();
}

function drawCrossing(g, v, tones, st) {
  const S = v.S, zk = DY * S, xl = v.sx(XING.x - XING.w / 2), xr = v.sx(XING.x + XING.w / 2), y0 = v.sy(2), y1 = v.sy(18.4);
  g.fillStyle = C.paper;
  g.fillRect(xl, y0, xr - xl, y1 - y0);
  g.save();
  g.translate(v.ox, v.oy);
  tones.use(g, 'h1', 1);
  g.fillRect(xl - v.ox, 2 * zk, xr - xl, 16.4 * zk);
  g.restore();
  // rails and sleepers
  g.strokeStyle = C.ink;
  g.lineCap = 'butt';
  g.lineWidth = 1.2;
  g.beginPath();
  for (let z = 2.2; z < 18.4; z += 0.9) { g.moveTo(v.sx(XING.rails[0] - 0.9), v.sy(z)); g.lineTo(v.sx(XING.rails[1] + 0.9), v.sy(z)); }
  g.stroke();
  g.lineWidth = Math.max(2.2, S * 0.22);
  g.beginPath();
  for (const rx of XING.rails) { g.moveTo(v.sx(rx), y0); g.lineTo(v.sx(rx), y1); }
  g.stroke();
  g.strokeStyle = C.white;
  g.lineWidth = 1.1;
  g.beginPath();
  for (const rx of XING.rails) { g.moveTo(v.sx(rx) - 1.2, y0); g.lineTo(v.sx(rx) - 1.2, y1); }
  g.stroke();
  // the edges of the danger lane: bold ink, flashing while the bell rings
  const warn = st.trainD < 0 || st.trainD > 0;
  g.lineWidth = Math.max(3, S * 0.3);
  g.strokeStyle = C.ink;
  g.setLineDash([S * 1.1, S * 1.1]);
  g.lineDashOffset = warn ? (Math.floor(st.t * 5) & 1 ? S * 1.1 : 0) : 0;
  g.beginPath(); g.moveTo(xl, y0); g.lineTo(xl, y1); g.moveTo(xr, y0); g.lineTo(xr, y1); g.stroke();
  g.setLineDash([]);
  g.lineDashOffset = 0;
}

// Crossing gates: two arms per side that swing down from the masts while the bell rings; back masts first.
export function drawGates(g, v, st, front) {
  const S = v.S, d = st.trainD;
  const k = d < 0 ? clamp((d + 3.4) / 0.9, 0, 1) : d > 0 && d < 3.5 ? 1 : 0;
  const z = front ? 19.3 : 1.2;
  for (const sd of [-1, 1]) {
    const x = XING.x + sd * (XING.w / 2 + 0.3), sx = v.sx(x);
    g.fillStyle = C.ink;
    g.fillRect(sx - 0.3 * S * 0.5, v.sy(z, 4.6), 0.3 * S, 4.6 * S);
    // lamp pair: one lit, one dark, swapping at 2.5 Hz
    const on = (Math.floor(st.t * 5) & 1) === (sd > 0 ? 1 : 0);
    for (const o of [-1, 1]) {
      const lx = sx + o * 0.6 * S, ly = v.sy(z, 4.3);
      g.fillStyle = C.ink;
      g.beginPath(); g.arc(lx, ly, 0.42 * S, 0, TAU); g.fill();
      if (k > 0 && (on === (o > 0))) {
        g.fillStyle = C.white;
        g.beginPath(); g.arc(lx, ly, 0.3 * S, 0, TAU); g.fill();
        g.strokeStyle = C.ink;
        g.lineWidth = 1.5;
        g.beginPath();
        for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + st.t; g.moveTo(lx + Math.cos(a) * 0.55 * S, ly + Math.sin(a) * 0.55 * S); g.lineTo(lx + Math.cos(a) * 0.95 * S, ly + Math.sin(a) * 0.95 * S); }
        g.stroke();
      } else { g.strokeStyle = C.white; g.lineWidth = 1.2; g.beginPath(); g.arc(lx, ly, 0.42 * S, 0, TAU); g.stroke(); }
    }
    // the arm: a striped bar growing from the mast toward the middle of the road
    if (k > 0) {
      const z1 = front ? 19.3 - k * 8.4 : 1.2 + k * 8.4, y0 = v.sy(z, 1.5), y1 = v.sy(z1, 1.5);
      g.lineCap = 'butt';
      g.lineWidth = 0.5 * S;
      g.strokeStyle = C.ink;
      g.beginPath(); g.moveTo(sx, y0); g.lineTo(sx, y1); g.stroke();
      g.strokeStyle = C.white;
      g.setLineDash([0.8 * S, 0.8 * S]);
      g.beginPath(); g.moveTo(sx, y0); g.lineTo(sx, y1); g.stroke();
      g.setLineDash([]);
    }
  }
}

// ---------------------------------------------------------------------------
// the train: head-on, a black column with headlights, hurtling toward the camera
// ---------------------------------------------------------------------------
export function drawTrain(g, v, tones, head, t, sc) {
  const S = v.S, x = v.sx(XING.x), hy = v.sy(head), w = (TRAIN.w + 0.8) * S, h = 5.4 * S, roof = TRAIN.len * DY * S;
  const top = hy - h - roof;
  g.save();
  g.beginPath(); g.rect(v.px, v.py, v.pw, v.ph); g.clip();
  // the glare of its lamps washing down the street ahead of it
  g.fillStyle = C.paper;
  g.beginPath(); g.ellipse(x, hy + 1.2 * S, w * 1.25, 2.8 * S, 0, 0, TAU); g.fill();
  g.fillStyle = C.white;
  g.beginPath(); g.ellipse(x, hy + 0.9 * S, w * 0.8, 1.7 * S, 0, 0, TAU); g.fill();
  // roof: a long black strip seen from above, with ribs, vents and a pantograph
  g.fillStyle = C.ink;
  g.fillRect(x - w / 2, top, w, roof + 2);
  g.strokeStyle = C.white;
  g.lineWidth = 1.6;
  g.beginPath();
  for (let y = hy - h - 0.9 * S; y > top; y -= 1.3 * S) { g.moveTo(x - w / 2 + 0.5 * S, y); g.lineTo(x + w / 2 - 0.5 * S, y); }
  g.moveTo(x - w * 0.3, top); g.lineTo(x - w * 0.3, hy - h);
  g.moveTo(x + w * 0.3, top); g.lineTo(x + w * 0.3, hy - h);
  g.stroke();
  g.fillStyle = C.white;
  for (let y = hy - h - 4 * S; y > top; y -= 6.5 * S) g.fillRect(x - 0.9 * S, y, 1.8 * S, 1.1 * S);
  g.strokeStyle = C.ink;
  g.lineWidth = 2;
  for (let y = hy - h - 6 * S; y > top; y -= 13 * S) { g.beginPath(); g.moveTo(x - w * 0.36, y); g.lineTo(x + w * 0.36, y - 1.6 * S); g.moveTo(x + w * 0.36, y); g.lineTo(x - w * 0.36, y - 1.6 * S); g.stroke(); }
  // the front: windscreen, wipers, headlights, destination board, a fat white keyline
  g.fillStyle = C.ink;
  g.fillRect(x - w / 2, hy - h, w, h);
  g.fillStyle = C.paper;
  g.fillRect(x - w * 0.42, hy - h + 0.5 * S, w * 0.84, h * 0.4);
  g.strokeStyle = C.ink;
  g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(x, hy - h + 0.5 * S); g.lineTo(x, hy - h + 0.5 * S + h * 0.4); g.stroke();
  g.fillStyle = C.ink;
  g.fillRect(x - w * 0.42, hy - h + 0.5 * S, w * 0.84, 0.6 * S);
  g.fillStyle = C.white;
  g.fillRect(x - w * 0.12, hy - h + 0.62 * S, w * 0.24, 0.36 * S);
  g.strokeStyle = C.white;
  g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(x - w * 0.3, hy - h * 0.62); g.lineTo(x - w * 0.12, hy - h * 0.48); g.moveTo(x + w * 0.3, hy - h * 0.62); g.lineTo(x + w * 0.12, hy - h * 0.48); g.stroke();
  for (const o of [-1, 1]) {
    const lx = x + o * w * 0.32, ly = hy - h * 0.2;
    g.fillStyle = C.white;
    g.beginPath(); g.arc(lx, ly, 0.62 * S, 0, TAU); g.fill();
    g.strokeStyle = C.white;
    g.lineWidth = 2.2;
    g.beginPath();
    for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU + t * 3, l0 = 0.85 * S, l1 = (1.7 + (i & 1) * 1.6) * S; g.moveTo(lx + Math.cos(a) * l0, ly + Math.sin(a) * l0); g.lineTo(lx + Math.cos(a) * l1, ly + Math.sin(a) * l1); }
    g.stroke();
  }
  g.strokeStyle = C.white;
  g.lineWidth = 3;
  g.strokeRect(x - w / 2 + 1.5, hy - h + 1.5, w - 3, h - 3);
  // speed lines streaming off the sides, running up the page
  g.strokeStyle = C.ink;
  g.lineWidth = 1.8;
  g.beginPath();
  for (let i = 0; i < 30; i++) {
    const side = i & 1 ? 1 : -1, o = (0.5 + ((i * 7919) % 13) * 0.45) * S, y = hy - ((i * 131 + t * 1100) % (roof + h)), l = (2.5 + (i % 5) * 1.3) * S;
    g.moveTo(x + side * (w / 2 + o), y); g.lineTo(x + side * (w / 2 + o), y - l);
  }
  g.stroke();
  g.restore();
}

// ---------------------------------------------------------------------------
// rain: strokes drawn with 'difference', so they are black on the pale street and white on the dark sky
// ---------------------------------------------------------------------------
export function drawRain(g, v, set, dt, wind, heavy) {
  const d = set.drops, n = d.length / 4, { px, py, pw, ph } = v, slant = 0.16 + wind * 0.55;
  g.save();
  g.beginPath(); g.rect(px, py, pw, ph); g.clip();
  g.globalCompositeOperation = 'difference';
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  for (let pass = 0; pass < (heavy === 2 ? 1 : 2); pass++) {
    g.lineWidth = pass ? 1.8 : 1;
    g.beginPath();
    for (let i = pass; i < n; i += 2) {
      const o = i * 4, sp = d[o + 2];
      d[o + 1] += dt * (1.3 + sp * 1.1) * (heavy === 1 ? 1.2 : 1);
      d[o] += dt * slant * 1.3;
      if (d[o + 1] > 1.05) { d[o + 1] -= 1.15; d[o] = Math.random(); }
      if (d[o] > 1.1) d[o] -= 1.2;
      if (d[o] < -0.1) d[o] += 1.2;
      const x = px + d[o] * pw, y = py + d[o + 1] * ph, l = (pass ? 30 : 20) * (0.7 + sp * 0.6) * (ph / 720 + 0.4);
      g.moveTo(x, y);
      g.lineTo(x + slant * l, y + l);
    }
    g.stroke();
  }
  g.restore();
}
