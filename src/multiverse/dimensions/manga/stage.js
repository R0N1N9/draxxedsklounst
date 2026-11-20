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
export function disposeStage() { if (skyCache.c) skyCache.c.width = skyCache.c.height = 0; skyCache.c = null; skyCache.key = ''; }
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
  // below the far kerb the street plates cover everything, so only the upper part of the sky is blitted
  const keep = clamp((v.y0 + 6 - (py - 14)) / (ph + 28), 0.2, 1), sch = skyCache.c.height * keep;
  g.drawImage(skyCache.c, 0, 0, skyCache.c.width, sch, px - 14, py - 14, pw + 28, (ph + 28) * keep);
}

// Bake what the first frame needs (done while the world is being built, in the window the transition hides).
export function primePlates(v, env, plates, lv) {
  const nul = { drawImage() {} };
  plates.draw(nul, v, MID_PLATE, lv, env);
  plates.draw(nul, v, WALL_PLATE, lv, env);
  plates.draw(nul, v, GROUND_PLATE, lv, env);
}

export function drawBackdrop(g, v, env, st, plates, lv) {
  const { px, py, pw, ph, S } = v, t = st.t, { tones, sc, set } = env;
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
  // the far skyline is a handful of plain silhouettes: cheaper to draw than to bake
  layer(g, v, tones, sc.far, FAR);
  plates.draw(g, v, MID_PLATE, lv, env);
  plates.draw(g, v, WALL_PLATE, lv, env);
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
// plates (see plates.js): the mid blocks, the shopfront wall with its lamp glows, and the street itself.
// Each paints a strip of "layer space": x = layer unit * the scale it is baked at, y = relative to the far kerb.
// ---------------------------------------------------------------------------
const unlit = (env, fn) => { const t = env.tones, was = t.lite; t.lite = false; fn(); t.lite = was; }; // a bake always keeps the tone

// extent of a list of sheets in layer units, remembered on the array
function extent(items, wOf) {
  if (items.ext) return items.ext;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const it of items) {
    x0 = Math.min(x0, it.x + it.sh.x0); x1 = Math.max(x1, it.x + it.sh.x1);
    y0 = Math.min(y0, it.sh.y0); y1 = Math.max(y1, it.sh.y1);
  }
  return (items.ext = { x0, x1, y0, y1 });
}

const MID_PLATE = {
  name: 'mid',
  shift: (v) => v.px + v.pw / 2 - v.cx * MID.par * v.S * MID.k,
  xr(Sq, env) { const e = extent(env.sc.mid), s = Sq * MID.k; return [e.x0 * s - 24, e.x1 * s + 24]; },
  band(Sq, env) { const e = extent(env.sc.mid), s = Sq * MID.k, base = -MID.up * Sq; return [base + e.y0 * s - 4, base + e.y1 * s + 6]; },
  paint(q, Sq, x0, x1, env) {
    unlit(env, () => {
      const s = Sq * MID.k, base = -MID.up * Sq;
      for (const it of env.sc.mid) {
        if (it.x * s + it.sh.x1 * s + 20 < x0 || it.x * s + it.sh.x0 * s - 20 > x1) continue;
        q.save();
        q.translate(it.x * s, base);
        q.scale(s, s);
        drawSheet(q, it.sh, env.tones, s);
        q.restore();
      }
    });
  },
};

const WALL_PLATE = {
  name: 'wall',
  shift: (v) => v.ox,
  xr(Sq, env) { const w = env.sc.back; return [(w[0].x - 2) * Sq, (w[w.length - 1].x + w[w.length - 1].w + 2) * Sq]; },
  band(Sq, env) {
    let top = 0;
    for (const it of env.sc.back) top = Math.min(top, it.sh.y0);
    for (const l of env.sc.lamps) top = Math.min(top, -l.y - l.r * 0.55);
    return [top * Sq - 0.3 * DY * Sq - 4, 4];
  },
  paint(q, Sq, x0, x1, env) {
    unlit(env, () => {
      const { sc, tones } = env, zk = DY * Sq;
      for (const it of sc.back) {
        if (it.x * Sq > x1 || (it.x + it.w + 1) * Sq < x0) continue;
        q.save();
        q.translate(it.x * Sq, -0.3 * zk);
        q.scale(Sq, Sq);
        drawSheet(q, it.sh, tones, Sq);
        q.restore();
      }
      // lamps and windows spill light: stippled glows on the wall
      for (const l of sc.lamps) {
        const x = l.x * Sq, y = -l.y * Sq, rr = l.r * 0.55 * Sq;
        if (x + rr < x0 || x - rr > x1) continue;
        for (const [k, tn] of [[1.0, 'v1'], [0.7, 'v2'], [0.42, 'v3']]) { tones.use(q, tn, 1); q.beginPath(); q.arc(x, y, rr * k, 0, TAU); q.fill(); }
      }
    });
  },
};

// ---------------------------------------------------------------------------
// the street
// ---------------------------------------------------------------------------
const wallOf = (S) => Math.max(8, 2.4 * S);

const GROUND_PLATE = {
  name: 'ground',
  shift: (v) => v.ox,
  xr: (Sq) => [-40 * Sq, (WX + 40) * Sq],
  band: (Sq) => [-2, WZ * DY * Sq + wallOf(Sq) + 4],
  paint(q, S, x0, x1, env) {
    unlit(env, () => {
      const { sc, set, tones } = env, zk = DY * S, xa = -40 * S, xb = (WX + 40) * S, L = Math.max(x0, xa), R = Math.min(x1, xb), w = R - L;
      if (w <= 0) return;
      // pavement, road, front kerb
      q.fillStyle = C.paper;
      q.fillRect(L, 0, w, WZ * zk);
      tones.use(q, 'd1', 1); // (the tone lattice is anchored to the origin of layer space: the street's own origin)
      q.fillRect(L, 0, w, 2 * zk);
      q.fillRect(L, 18.4 * zk, w, 1.6 * zk);
      tones.use(q, 'd2', 1);
      q.fillRect(L, 2 * zk, w, 16.4 * zk);
      // the pools of light under the lamps: clean paper, so a black figure standing in one is a strong shape
      for (const l of sc.lamps) {
        if (l.pole && l.y < 5) continue;
        const x = l.x * S, zc = l.pole ? 17.2 : Math.min(9.5, 2.6 + l.r * 0.65), rx = l.r * 1.25 * S, ry = Math.max(rx * 0.22, l.r * 0.5 * zk);
        if (x + rx < x0 || x - rx > x1) continue;
        q.fillStyle = C.paper;
        q.beginPath(); q.ellipse(x, zc * zk, rx, ry, 0, 0, TAU); q.fill();
        q.fillStyle = C.white;
        q.beginPath(); q.ellipse(x, zc * zk, rx * 0.6, ry * 0.6, 0, 0, TAU); q.fill();
        q.strokeStyle = C.ink;
        q.lineWidth = 1;
        q.beginPath();
        for (let i = -3; i <= 3; i++) { const sx = x + i * rx * 0.22; q.moveTo(sx, zc * zk - ry * 0.45 * (1 - Math.abs(i) / 4)); q.lineTo(sx + 0.4, zc * zk + ry * 0.45 * (1 - Math.abs(i) / 4)); }
        q.stroke();
      }
      // kerbs and long asphalt streaks
      q.lineCap = 'round';
      q.strokeStyle = C.ink;
      q.lineWidth = 2.6;
      q.beginPath(); q.moveTo(L, 2 * zk); q.lineTo(R, 2 * zk); q.moveTo(L, WZ * zk); q.lineTo(R, WZ * zk); q.stroke();
      q.lineWidth = 1;
      q.beginPath();
      for (const s of set.streaks) { const x = s.x * S; if (x + s.l * S * 0.5 < x0 || x > x1) continue; q.moveTo(x, s.z * zk); q.lineTo(x + s.l * S * 0.5, s.z * zk); }
      q.moveTo(L, 18.4 * zk); q.lineTo(R, 18.4 * zk);
      q.stroke();
      q.strokeStyle = C.white; // wet kerb highlight
      q.lineWidth = 1.6;
      q.beginPath(); q.moveTo(L, 2 * zk + 3.5); q.lineTo(R, 2 * zk + 3.5); q.stroke();
      // centre line: white dashes on the grey road (the dash phase is anchored to the far end of the street)
      q.lineWidth = Math.max(2, S * 0.16);
      q.setLineDash([S * 3, S * 2.4]);
      q.lineDashOffset = L - xa;
      q.beginPath(); q.moveTo(L, 10.3 * zk); q.lineTo(R, 10.3 * zk); q.stroke();
      q.setLineDash([]);
      q.lineDashOffset = 0;
      paintCrossing(q, S, tones);
      // the canal wall in front of the street
      const wall = wallOf(S), wy = WZ * zk;
      q.fillStyle = C.paper2;
      q.fillRect(L, wy, w, wall);
      tones.use(q, 'd1', 1);
      q.fillRect(L, wy, w, wall);
      q.strokeStyle = C.ink;
      q.lineWidth = 1;
      q.beginPath();
      for (let y = wy + wall * 0.34; y < wy + wall; y += wall * 0.34) { q.moveTo(L, y); q.lineTo(R, y); }
      const bs = 2.2 * S;
      for (let r = 0; r < 3; r++) for (let x = Math.floor(L / bs) * bs - bs + (r & 1 ? bs / 2 : 0); x < R + bs; x += bs) { q.moveTo(x, wy + wall * 0.34 * r); q.lineTo(x, wy + wall * 0.34 * (r + 1)); }
      q.stroke();
      q.fillStyle = C.ink;
      q.fillRect(L, wy - 1, w, 4.4);
    });
  },
};

// The street itself is baked; what moves is drawn over it: the flashing edge of the danger lane, the black
// canal water with its ripples and the lamp reflections sliding across.
export function drawGround(g, v, env, st, plates, lv) {
  const { px, py, pw, ph, S } = v, zk = DY * S, t = st.t;
  plates.draw(g, v, GROUND_PLATE, lv, env);
  g.save();
  g.beginPath();
  g.rect(px, py, pw, ph);
  g.clip();
  drawCrossingEdges(g, v, st);
  const wall = wallOf(S), wy = v.sy(WZ), yEnd = py + ph;
  g.fillStyle = C.ink;
  g.fillRect(px, wy + wall, pw, yEnd - wy - wall);
  g.strokeStyle = C.white;
  g.lineWidth = 1.4;
  g.beginPath();
  for (let i = 0; i < 46; i++) { // ripples and lamp reflections
    const h = (i * 0.6180339 + 0.13) % 1, y = wy + wall + 8 + h * (yEnd - wy - wall - 12), x0 = px + ((i * 97.3 + t * (8 + h * 14)) % (pw + 80)) - 40;
    g.moveTo(x0, y); g.lineTo(x0 + 14 + h * 40, y);
  }
  // the lamps of the shopfronts, smeared across the water
  for (const l of env.sc.lamps) {
    if (l.pole) continue;
    const x = v.sx(l.x);
    if (x < px - 20 || x > px + pw + 20) continue;
    for (let k = 0; k < 6; k++) {
      const y = wy + wall + 10 + k * (yEnd - wy - wall - 14) / 6, w = (6 - k) * 0.55 * S * 0.5 + 4, off = Math.sin(t * 1.7 + k * 1.3 + l.x) * 3;
      g.moveTo(x - w + off, y); g.lineTo(x + w + off, y);
    }
  }
  g.stroke();
  g.restore();
  void zk;
}

function paintCrossing(q, S, tones) {
  const zk = DY * S, xl = (XING.x - XING.w / 2) * S, xr = (XING.x + XING.w / 2) * S, y0 = 2 * zk, y1 = 18.4 * zk;
  q.fillStyle = C.paper;
  q.fillRect(xl, y0, xr - xl, y1 - y0);
  tones.use(q, 'h1', 1);
  q.fillRect(xl, y0, xr - xl, y1 - y0);
  // rails and sleepers
  q.strokeStyle = C.ink;
  q.lineCap = 'butt';
  q.lineWidth = 1.2;
  q.beginPath();
  for (let z = 2.2; z < 18.4; z += 0.9) { q.moveTo((XING.rails[0] - 0.9) * S, z * zk); q.lineTo((XING.rails[1] + 0.9) * S, z * zk); }
  q.stroke();
  q.lineWidth = Math.max(2.2, S * 0.22);
  q.beginPath();
  for (const rx of XING.rails) { q.moveTo(rx * S, y0); q.lineTo(rx * S, y1); }
  q.stroke();
  q.strokeStyle = C.white;
  q.lineWidth = 1.1;
  q.beginPath();
  for (const rx of XING.rails) { q.moveTo(rx * S - 1.2, y0); q.lineTo(rx * S - 1.2, y1); }
  q.stroke();
}

// the edges of the danger lane: bold ink, flashing while the bell rings
function drawCrossingEdges(g, v, st) {
  const S = v.S, xl = v.sx(XING.x - XING.w / 2), xr = v.sx(XING.x + XING.w / 2), y0 = v.sy(2), y1 = v.sy(18.4);
  const warn = st.trainD < 0 || st.trainD > 0;
  g.lineWidth = Math.max(3, S * 0.3);
  g.strokeStyle = C.ink;
  g.lineCap = 'butt';
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
// rain: strokes drawn with 'difference', so they are black on the pale street and white on the dark sky.
// Each drop is its own tiny path: a blend mode only touches the pixels a path covers, and one path holding every
// drop would cover the whole page. A browser without 'difference' gets ink strokes with a white core instead.
// ---------------------------------------------------------------------------
export function hasDifference(g) {
  const was = g.globalCompositeOperation;
  g.globalCompositeOperation = 'difference';
  const ok = g.globalCompositeOperation === 'difference';
  g.globalCompositeOperation = was;
  return ok;
}

export function drawRain(g, v, set, dt, wind, heavy) {
  const d = set.drops, n = d.length / 4, { px, py, pw, ph } = v, slant = 0.16 + wind * 0.55;
  if (set.diff === undefined) set.diff = hasDifference(g);
  g.save();
  g.beginPath(); g.rect(px, py, pw, ph); g.clip();
  g.lineCap = 'round';
  if (set.diff) { g.globalCompositeOperation = 'difference'; g.strokeStyle = '#fff'; }
  for (let i = 0; i < n; i++) {
    if (heavy === 2 && (i & 1)) continue;
    const o = i * 4, sp = d[o + 2], pass = i & 1;
    d[o + 1] += dt * (1.3 + sp * 1.1) * (heavy === 1 ? 1.2 : 1);
    d[o] += dt * slant * 1.3;
    if (d[o + 1] > 1.05) { d[o + 1] -= 1.15; d[o] = Math.random(); }
    if (d[o] > 1.1) d[o] -= 1.2;
    if (d[o] < -0.1) d[o] += 1.2;
    const x = px + d[o] * pw, y = py + d[o + 1] * ph, l = (pass ? 30 : 20) * (0.7 + sp * 0.6) * (ph / 720 + 0.4);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + slant * l, y + l);
    if (set.diff) { g.lineWidth = pass ? 1.8 : 1; g.stroke(); }
    else {
      g.strokeStyle = C.ink; g.lineWidth = pass ? 3.2 : 2.4; g.stroke();
      g.strokeStyle = C.white; g.lineWidth = pass ? 1.2 : 0.8; g.stroke();
    }
  }
  g.restore();
}
