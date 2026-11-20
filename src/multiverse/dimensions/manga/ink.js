// The pen, the screentone and the lettering: everything that makes this world look inked.
//  - Tones: pre-rendered screentone patterns (dots at 45 degrees, hatching) that keep their dot size
//    on screen however far the camera zooms, like a printed tone sheet.
//  - Sheet: a static drawing recorded once into ordered Path2D ops (ink, paper, tone, strokes of three
//    weights) and replayed cheaply every frame.
//  - Glyphs: a brush-stroke katakana set drawn as tapered polygons, so the sound effects are real
//    lettering on every device instead of whatever font happens to be installed.
import { clamp, TAU } from '../../kit.js';

export const C = { paper: '#f3ead8', paper2: '#e3d7bd', ink: '#16120f', white: '#fffdf6' };

// ---------------------------------------------------------------------------
// Screentone
// ---------------------------------------------------------------------------
// p = lattice period in CSS px, r = dot radius in CSS px (two dots per tile: a 45 degree lattice).
const TONE_DEF = {
  d1: { p: 7, r: 0.95 }, d2: { p: 6.5, r: 1.45 }, d3: { p: 5.5, r: 1.6 }, d4: { p: 4.6, r: 1.62 },
  v1: { p: 7, r: 0.95, white: true }, v2: { p: 6, r: 1.25, white: true }, v3: { p: 5, r: 1.45, white: true },
  h1: { p: 5.5, hatch: 0.9 }, h2: { p: 3.6, hatch: 1 },
};

export class Tones {
  constructor() {
    this.dpr = 0;
    this.pat = {};
    this.grads = new Map();
    this.m = typeof DOMMatrix !== 'undefined' ? new DOMMatrix() : null;
  }

  ensure(g, dpr) {
    if (this.dpr === dpr) return;
    this.dpr = dpr;
    this.grads.clear();
    for (const k in TONE_DEF) {
      const d = TONE_DEF[k], n = Math.max(4, Math.round(d.p * dpr));
      const cv = document.createElement('canvas');
      cv.width = cv.height = n;
      const c = cv.getContext('2d');
      if (d.hatch) {
        c.strokeStyle = C.ink;
        c.lineWidth = d.hatch * dpr;
        c.beginPath();
        for (const o of [-n, 0, n]) { c.moveTo(o, n); c.lineTo(o + n, 0); }
        c.stroke();
      } else {
        c.fillStyle = d.white ? C.white : C.ink;
        const r = d.r * dpr;
        for (const [x, y] of [[0, 0], [n, 0], [0, n], [n, n], [n / 2, n / 2]]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
      }
      this.pat[k] = g.createPattern(cv, 'repeat');
    }
  }

  // Fill style for a tone whose lattice is anchored to the local origin of a context scaled by s.
  use(g, name, s) {
    const p = this.pat[name];
    if (this.m && p && p.setTransform) { this.m.a = this.m.d = 1 / (s * this.dpr); this.m.e = this.m.f = 0; p.setTransform(this.m); }
    g.fillStyle = p;
  }

  // A tone sheet whose dots swell from nothing to `rMax` (CSS px) over h px: the soft sky gradient.
  grad(g, h, white, rMax = 2.6) {
    const key = (white ? 'w' : 'b') + Math.round(h);
    let p = this.grads.get(key);
    if (!p) {
      const dpr = this.dpr, per = 6, n = Math.round(per * dpr), hh = Math.max(8, Math.round(h * dpr));
      const cv = document.createElement('canvas');
      cv.width = n;
      cv.height = hh;
      const c = cv.getContext('2d');
      c.fillStyle = white ? C.white : C.ink;
      for (let y = 0, row = 0; y < hh + n; y += n / 2, row++) {
        const r = Math.max(0, (y / hh) * rMax * dpr * (white ? 1 : 1));
        if (r < 0.35 * dpr) continue;
        for (const x of row & 1 ? [n / 2] : [0, n]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
      }
      p = g.createPattern(cv, 'repeat-x');
      this.grads.set(key, p);
    }
    return p;
  }

  // Fill a screen-space rectangle with a gradient tone whose top edge sits at y0.
  fillGrad(g, x, y0, w, h, white, rMax) {
    const p = this.grad(g, h, white, rMax);
    if (this.m && p.setTransform) { this.m.a = this.m.d = 1 / this.dpr; this.m.e = 0; this.m.f = y0; p.setTransform(this.m); }
    g.fillStyle = p;
    g.fillRect(x, y0, w, h);
  }
}

// ---------------------------------------------------------------------------
// Sheet: a drawing recorded once
// ---------------------------------------------------------------------------
// Styles. Fills: k ink, p paper, q shaded paper, w white gouache, d1-d4 black dots, v1-v3 white dots,
// h1-h2 hatching. Strokes: sH sM sF (ink: heavy / medium / fine), wH wM wF (white).
const STROKE_W = { H: 2.9, M: 1.7, F: 0.95 };

export class Sheet {
  constructor() {
    this.ops = [];
    this.cur = null;
    this.x0 = 1e9; this.y0 = 1e9; this.x1 = -1e9; this.y1 = -1e9;
  }

  _p(style) {
    if (!this.cur || this.cur.s !== style) {
      this.cur = { s: style, p: new Path2D(), stroke: style[0] === 's' || style[0] === 'w' && style.length === 2 };
      this.ops.push(this.cur);
    }
    return this.cur.p;
  }

  _b(x, y) {
    if (x < this.x0) this.x0 = x;
    if (x > this.x1) this.x1 = x;
    if (y < this.y0) this.y0 = y;
    if (y > this.y1) this.y1 = y;
  }

  rect(s, x, y, w, h) { this._p(s).rect(x, y, w, h); this._b(x, y); this._b(x + w, y + h); return this; }

  poly(s, pts) {
    const p = this._p(s);
    p.moveTo(pts[0], pts[1]);
    this._b(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) { p.lineTo(pts[i], pts[i + 1]); this._b(pts[i], pts[i + 1]); }
    p.closePath();
    return this;
  }

  open(s, pts) {
    const p = this._p(s);
    p.moveTo(pts[0], pts[1]);
    this._b(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) { p.lineTo(pts[i], pts[i + 1]); this._b(pts[i], pts[i + 1]); }
    return this;
  }

  line(s, x1, y1, x2, y2) { const p = this._p(s); p.moveTo(x1, y1); p.lineTo(x2, y2); this._b(x1, y1); this._b(x2, y2); return this; }

  circ(s, x, y, r) { const p = this._p(s); p.moveTo(x + r, y); p.arc(x, y, r, 0, TAU); this._b(x - r, y - r); this._b(x + r, y + r); return this; }

  ell(s, x, y, rx, ry, rot = 0) { const p = this._p(s); p.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot)); p.ellipse(x, y, rx, ry, rot, 0, TAU); this._b(x - rx, y - ry); this._b(x + rx, y + ry); return this; }

  // Ruler-drawn rectangle: every side runs a little past the corner, the way inkers do it.
  ruled(s, x0, y0, x1, y1, over = 0.14) {
    this.line(s, x0 - over, y0, x1 + over, y0).line(s, x1, y0 - over, x1, y1 + over).line(s, x1 + over, y1, x0 - over, y1).line(s, x0, y1 + over, x0, y0 - over);
    return this;
  }

  // Diagonal hatching clipped to a rectangle: lines x + y = c (dir 1) or x - y = c (dir -1).
  hatch(s, x0, y0, x1, y1, gap, dir = 1) {
    const p = this._p(s), w = x1 - x0, h = y1 - y0;
    for (let c = gap; c < w + h; c += gap) {
      let ax, ay, bx, by;
      if (dir > 0) { ax = x0 + Math.min(c, w); ay = y0 + c - (ax - x0); bx = x0 + Math.max(0, c - h); by = y0 + c - (bx - x0); }
      else { ax = x0 + Math.max(0, w - c); ay = y0 + Math.max(0, c - w); bx = x0 + Math.min(w, w + h - c); by = y0 + Math.min(h, c); }
      p.moveTo(ax, ay);
      p.lineTo(bx, by);
    }
    this._b(x0, y0); this._b(x1, y1);
    return this;
  }

  // A brush stroke: a polygon swelling from w0 to w1 along the polyline.
  taper(s, pts, w0, w1) { taperInto(this._p(s), pts, pts.length >> 1, w0, w1); for (let i = 0; i < pts.length; i += 2) this._b(pts[i] - w1, pts[i + 1] - w1); this._b(pts[pts.length - 2] + w1, pts[pts.length - 1] + w1); return this; }

  glyphs(s, text, x, y, size, w, vertical = false) {
    const p = this._p(s);
    const ext = textInto(p, text, x, y, size, 0, w, vertical, true);
    this._b(x - ext, y - ext); this._b(x + ext, y + ext);
    return this;
  }
}

// Replay a sheet. The context must already be translated / scaled by the camera scale s.
export function drawSheet(g, sh, tones, s) {
  const zk = clamp(Math.sqrt(s / 16), 0.85, 1.5);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (let i = 0; i < sh.ops.length; i++) {
    const o = sh.ops[i], st = o.s;
    if (o.stroke) {
      g.strokeStyle = st[0] === 's' ? C.ink : C.white;
      g.lineWidth = (STROKE_W[st[1]] * zk) / s;
      g.stroke(o.p);
    } else {
      if (st === 'k') g.fillStyle = C.ink;
      else if (st === 'p') g.fillStyle = C.paper;
      else if (st === 'q') g.fillStyle = C.paper2;
      else if (st === 'w') g.fillStyle = C.white;
      else tones.use(g, st, s);
      g.fill(o.p);
    }
  }
}

// ---------------------------------------------------------------------------
// Brush polygons
// ---------------------------------------------------------------------------
// A closed polygon around the polyline `pts` (flat x,y; n points), half-width easing from w0 to w1.
export function taperInto(p, pts, n, w0, w1) {
  if (n < 2) return;
  for (let side = 0; side < 2; side++) {
    for (let k = 0; k < n; k++) {
      const i = side ? n - 1 - k : k, a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let tx = pts[b * 2] - pts[a * 2], ty = pts[b * 2 + 1] - pts[a * 2 + 1];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l; ty /= l;
      const t = i / (n - 1), hw = (w0 + (w1 - w0) * t) * 0.5 * (side ? -1 : 1);
      const x = pts[i * 2] - ty * hw, y = pts[i * 2 + 1] + tx * hw;
      if (!side && k === 0) p.moveTo(x, y); else p.lineTo(x, y);
    }
  }
  p.closePath();
}

// Concentration / speed lines: thin wedges radiating from (cx, cy) between radii r0 and r1.
export function radialLines(g, cx, cy, r0, r1, n, wedge, seed, jitter = 0.5, phase = 0) {
  let s = (seed * 9301 + 49297) | 0;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (rnd() - 0.5) * (TAU / n) * jitter + phase;
    const a0 = rnd(), ri = r0 + (r1 - r0) * 0.3 * a0, ro = r1 * (0.8 + rnd() * 0.35), wd = wedge * (0.4 + rnd());
    const c = Math.cos(a), sn = Math.sin(a);
    g.moveTo(cx + c * ri - sn * wd * 0.15, cy + sn * ri + c * wd * 0.15);
    g.lineTo(cx + c * ro, cy + sn * ro);
    g.lineTo(cx + c * ri + sn * wd * 0.15, cy + sn * ri - c * wd * 0.15);
    g.closePath();
  }
}

// ---------------------------------------------------------------------------
// Brush katakana. Strokes live in a 0..100 box (y down); `Q` samples a quadratic.
// ---------------------------------------------------------------------------
const SPEC = {
  'ト': ['M36 6 L36 94', 'M36 38 L80 62'],
  'ン': ['M22 24 L38 38', 'M20 80 Q60 66 84 22'],
  'ッ': ['M20 22 L28 44', 'M42 16 L50 40', 'M86 22 Q76 70 18 88'],
  'ー': ['M6 52 L94 48'],
  'ハ': ['M46 24 Q36 60 14 86', 'M60 36 Q70 62 88 84'],
  'サ': ['M10 42 L90 42', 'M34 10 L34 58', 'M64 8 L64 46 Q60 76 28 92'],
  'コ': ['M16 24 L82 24 L82 84', 'M16 84 L82 84'],
  'ス': ['M16 26 L80 26 Q66 62 14 90', 'M48 58 L86 86'],
  'ホ': ['M10 40 L90 40', 'M50 8 L50 94', 'M32 56 Q28 72 16 86', 'M68 56 Q74 72 86 86'],
  'カ': ['M14 38 L74 38 Q80 40 78 70 Q76 86 58 90', 'M44 8 Q44 60 20 90'],
  'シ': ['M20 20 L34 32', 'M14 46 L28 58', 'M28 90 Q76 76 88 24'],
  'ヒ': ['M24 38 L78 30', 'M28 10 L28 78 Q28 90 82 86'],
  'ュ': ['M22 30 L72 30 L66 62', 'M12 68 L90 68'],
  'ァ': ['M14 26 L84 26 Q76 60 36 88', 'M54 48 L26 84'],
  'ニ': ['M22 30 L78 30', 'M10 80 L90 80'],
  'ラ': ['M26 20 L74 20', 'M14 48 L86 48 Q82 78 28 92'],
  'メ': ['M72 10 Q56 60 20 90', 'M22 40 L84 80'],
  'ナ': ['M10 40 L90 40', 'M46 8 Q46 66 14 90'],
  'ク': ['M44 10 Q22 36 12 52', 'M36 26 L82 26 Q78 68 22 92'],
  'テ': ['M26 16 L74 16', 'M12 46 L88 46', 'M52 46 Q52 80 24 92'],
  'ル': ['M30 14 L30 66 Q30 82 14 88', 'M60 14 L60 74 Q62 86 74 84 Q86 80 90 44'],
  'タ': ['M44 10 Q22 36 12 52', 'M36 26 L82 26 Q78 68 22 92', 'M26 60 L64 54'],
  '!': ['M50 2 Q52 40 50 66', 'M50 84 L50 92'],
};
const DAKU = ['M72 6 L80 22', 'M86 2 L94 18'];
const COMP = { 'ド': ['ト', 1], 'バ': ['ハ', 1], 'ザ': ['サ', 1], 'ゴ': ['コ', 1], 'ズ': ['ス', 1], 'ボ': ['ホ', 1], 'ビ': ['ヒ', 1], 'ポ': ['ホ', 2], 'パ': ['ハ', 2] };
const SMALL = new Set(['ッ', 'ュ', 'ァ']);
const G = {};

function parse(spec) {
  const t = spec.replace(/([MLQ])/g, ' $1 ').trim().split(/\s+/), out = [];
  let cx = 0, cy = 0;
  for (let i = 0; i < t.length;) {
    const c = t[i++];
    if (c === 'M' || c === 'L') { cx = +t[i++]; cy = +t[i++]; out.push(cx, cy); }
    else if (c === 'Q') {
      const qx = +t[i++], qy = +t[i++], x = +t[i++], y = +t[i++];
      for (let k = 1; k <= 8; k++) { const u = k / 8, v = 1 - u; out.push(v * v * cx + 2 * v * u * qx + u * u * x, v * v * cy + 2 * v * u * qy + u * u * y); }
      cx = x; cy = y;
    }
    // straight runs get intermediate points so that the width profile has something to work on
    if (c === 'L' && out.length >= 4) {
      const n = out.length, px = out[n - 4], py = out[n - 3], x = out[n - 2], y = out[n - 1];
      out.length = n - 2;
      for (let k = 1; k <= 6; k++) out.push(px + ((x - px) * k) / 6, py + ((y - py) * k) / 6);
    }
  }
  return Float32Array.from(out);
}
for (const k in SPEC) G[k] = SPEC[k].map(parse);
const DAKU_S = DAKU.map(parse);
const HANDAKU = (() => { const a = []; for (let i = 0; i <= 12; i++) a.push(82 + Math.cos((i / 12) * TAU) * 9, 15 + Math.sin((i / 12) * TAU) * 9); return Float32Array.from(a); })();

function strokeInto(p, pts, ox, oy, sc, cs, sn, w, flat) {
  const n = pts.length >> 1;
  for (let side = 0; side < 2; side++) {
    for (let k = 0; k < n; k++) {
      const i = side ? n - 1 - k : k, a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let tx = pts[b * 2] - pts[a * 2], ty = pts[b * 2 + 1] - pts[a * 2 + 1];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l; ty /= l;
      const t = i / (n - 1);
      // blunt start, tapering flick at the end: the weight of a loaded brush
      const hw = w * 0.5 * (flat ? 1 : (0.8 + 0.2 * Math.min(1, t / 0.1)) * (1.1 - 0.72 * t * t)) * (side ? -1 : 1);
      const gx = pts[i * 2] - 50 - ty * hw / sc, gy = pts[i * 2 + 1] - 50 + tx * hw / sc;
      const x = ox + (gx * cs - gy * sn) * sc, y = oy + (gx * sn + gy * cs) * sc;
      if (!side && k === 0) p.moveTo(x, y); else p.lineTo(x, y);
    }
  }
  p.closePath();
}

function glyphInto(p, ch, cx, cy, size, rot, w) {
  const comp = COMP[ch], base = comp ? comp[0] : ch, st = G[base];
  if (!st) return;
  const small = SMALL.has(ch), sc = (small ? 0.62 : 1) * (size / 100), ox = cx + (small ? size * 0.14 : 0), oy = cy + (small ? size * 0.2 : 0);
  const cs = Math.cos(rot), sn = Math.sin(rot);
  for (let i = 0; i < st.length; i++) strokeInto(p, st[i], ox, oy, sc, cs, sn, small ? w * 1.15 : w, base === '!' && false);
  if (comp) {
    if (comp[1] === 1) for (let i = 0; i < DAKU_S.length; i++) strokeInto(p, DAKU_S[i], ox, oy, sc, cs, sn, w * 0.9, false);
    else strokeInto(p, HANDAKU, ox, oy, sc, cs, sn, w * 0.8, true);
  }
}

// Lay out `text` centred on (cx, cy) as brush lettering. Returns the half-extent.
export function textInto(p, text, cx, cy, size, rot, w, vertical = false, left = false) {
  const n = text.length, adv = size * (vertical ? 0.94 : 0.88), total = adv * (n - 1), cs = Math.cos(rot), sn = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const o = left ? i * adv : i * adv - total / 2;
    const dx = vertical ? 0 : o, dy = vertical ? o : 0;
    glyphInto(p, text[i], cx + dx * cs - dy * sn, cy + dx * sn + dy * cs, size, rot, w);
  }
  return Math.max(total, 0) + size * 0.6;
}

// Draw a sound effect: white keyline, offset shadow, ink face. o = { w, fill, line, lineW, shadow, vertical }
export function drawSfx(g, text, cx, cy, size, rot, o) {
  const w = (o && o.w) || size * 0.17, vertical = !!(o && o.vertical);
  const fill = (o && o.fill) || C.ink;
  if (o && o.shadow) {
    g.beginPath();
    textInto(g, text, cx + o.shadow, cy + o.shadow, size, rot, w, vertical);
    g.fillStyle = C.ink;
    g.fill();
  }
  g.beginPath();
  textInto(g, text, cx, cy, size, rot, w, vertical);
  if (!o || o.line !== false) {
    g.lineJoin = 'round';
    g.lineWidth = (o && o.lineW) || Math.max(3, size * 0.1);
    g.strokeStyle = (o && o.line) || C.white;
    g.stroke();
  }
  g.fillStyle = fill;
  g.fill();
}

// A hand-ruled panel border: four strokes that overshoot a little, heavier on the shadow side.
export function inkFrame(g, x, y, w, h, lw, over = 0) {
  g.lineCap = 'butt';
  g.strokeStyle = C.ink;
  g.lineWidth = lw;
  g.beginPath();
  g.moveTo(x - over, y); g.lineTo(x + w + over, y);
  g.moveTo(x + w, y - over); g.lineTo(x + w, y + h + over);
  g.moveTo(x + w + over, y + h); g.lineTo(x - over, y + h);
  g.moveTo(x, y + h + over); g.lineTo(x, y - over);
  g.stroke();
}
