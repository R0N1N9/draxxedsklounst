// CONTINUE? — the three cabinets. A look owns everything era-specific: the palette, how the
// hero lettering is struck (neon vector / chrome / glass), the backdrop, the panel frames,
// and the grade the old world is crunched into.
import { clamp01, mixHex, shade, rgba, roundRect, TAU } from '../../kit.js';
import { heroLayout } from './font.js';

// A pass is one stroke of every glyph: {w, c (colour or gradient), dx, dy, a}. Units are glyph units.
function gradient(g, stops, y0 = -0.4, y1 = 6.4) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  return gr;
}

// Hollow neon: the glyph is stroked fat in the phosphor, then knocked out with black, leaving two
// thin lines tracing its outline; the bloom in the monitor shader does the glowing.
function vectorStyle(g, col) {
  const core = mixHex(col, '#ffffff', 0.7);
  return {
    join: 'round',
    passes: [
      { w: 2.3, c: col, a: 0.07 }, { w: 1.95, c: col, a: 0.16 },
      { w: 1.66, c: col, a: 1 }, { w: 1.5, c: core, a: 1 }, { w: 1.2, c: '#02050a', a: 1 }, { w: 1.0, c: col, a: 0.2 },
    ],
  };
}

function chromeStyle(g, tint) {
  const sky = tint || '#6f93ff';
  const dark = shade(mixHex('#0b1b55', sky, 0.3), -0.55);
  const body = gradient(g, [
    [0, '#ffffff'], [0.2, mixHex('#e6eeff', sky, 0.3)], [0.44, mixHex('#6f8fe0', sky, 0.5)], [0.495, shade(sky, -0.35)],
    [0.5, dark], [0.54, '#ffe9b0'], [0.74, '#f0a233'], [1, '#fff2cc'],
  ]);
  const passes = [{ w: 2.2, c: '#000', a: 0.35, dx: 0.45, dy: 0.7 }];
  for (let k = 9; k >= 1; k--) passes.push({ w: 2.05, c: k > 4 ? '#0a0f3e' : '#151d6e', dx: k * 0.075, dy: k * 0.1 });
  passes.push({ w: 2.05, c: '#070b30' }, { w: 1.72, c: '#eaf1ff' }, { w: 1.4, c: body }, { w: 0.34, c: '#ffffff', dx: -0.3, dy: -0.28, a: 0.85 });
  return { join: 'miter', shine: true, passes };
}

function glossStyle(g, tint) {
  const hi = tint ? mixHex(tint, '#ffffff', 0.7) : '#c8f8ff';
  const mid = tint ? mixHex(tint, '#ffffff', 0.15) : '#2fd0ff';
  const lo = tint ? shade(tint, -0.4) : '#0a78d8';
  const body = gradient(g, [[0, hi], [0.48, mid], [0.5, lo], [1, mixHex(mid, '#ffffff', 0.3)]]);
  return {
    join: 'round', shine: true,
    passes: [
      { w: 2.3, c: '#001824', a: 0.45, dx: 0, dy: 0.65 }, { w: 2.1, c: shade(lo, -0.6) }, { w: 1.78, c: '#ffffff' },
      { w: 1.46, c: body }, { w: 0.5, c: '#ffffff', dx: 0, dy: -0.34, a: 0.5 },
    ],
  };
}

// The destination's own lettering: flat poster ink in the new world's palette, extruded in its accent.
function cardStyle(g, pal, bold) {
  const passes = [{ w: 2.3, c: '#000', a: 0.4, dx: 0.5, dy: 0.75 }];
  const ext = shade(pal.accent, -0.35);
  for (let k = bold ? 8 : 4; k >= 1; k--) passes.push({ w: 2.0, c: k > 2 ? shade(pal.accent, -0.55) : ext, dx: k * 0.08, dy: k * 0.11 });
  passes.push({ w: 2.0, c: shade(pal.bg, -0.4) }, { w: 1.6, c: pal.accent }, { w: 1.22, c: pal.fg });
  return { join: 'round', shine: false, passes };
}

const ERAS = {
  vector: {
    name: 'VECTOR', fx: { lo: '#000000', hi: null, amt: 0.9, sat: 0, levels: 5, dim: 0.5, scan: 0.34, curve: 0.1, bloom: 1.25, mask: 0 },
  },
  chrome: {
    name: 'CHROME', fx: { lo: '#120a46', hi: '#ffeccc', amt: 0.85, sat: 0, levels: 6, dim: 0.62, scan: 0.26, curve: 0.075, bloom: 0.9, mask: 0.08 },
  },
  gloss: {
    name: 'GLOSS', fx: { lo: '#03202e', hi: '#d4f6ff', amt: 0.55, sat: 0.18, levels: 8, dim: 0.66, scan: 0.14, curve: 0.04, bloom: 1.05, mask: 0.04 },
  },
};
export const ERA_IDS = Object.keys(ERAS);
export const PHOSPHORS = ['#46ff9d', '#ffb23d', '#4de6ff', '#ff6fb1'];

export function makeLook(g, era, plan) {
  const E = ERAS[era];
  const ph = plan.phosphor;
  const styles = new Map();
  const style = (kind, tint, pal) => {
    const key = kind + '|' + (tint || '') + '|' + (pal ? pal.bg + pal.accent : '');
    let s = styles.get(key);
    if (!s) {
      s = kind === 'card' ? cardStyle(g, pal, true) : kind === 'cardS' ? cardStyle(g, pal, false)
        : era === 'vector' ? vectorStyle(g, tint || ph) : era === 'chrome' ? chromeStyle(g, tint) : glossStyle(g, tint);
      styles.set(key, s);
    }
    return s;
  };
  const ink = era === 'vector' ? ph : '#ffffff';
  const hi = era === 'vector' ? mixHex(ph, '#ffffff', 0.55) : era === 'chrome' ? '#ffe14a' : '#d9ff5c';
  const dim = era === 'vector' ? rgba(ph, 0.55) : era === 'chrome' ? '#8fa6ff' : '#8fd8ff';
  const shadow = era === 'vector' ? null : { color: era === 'chrome' ? '#050a30' : '#021824', d: 1 };
  const fx = { ...E.fx, hi: E.fx.hi || mixHex(ph, '#ffffff', 0.35), lo: E.fx.lo };
  return { era, name: E.name, fx, ink, hi, dim, shadow, ph, style, bg: (...a) => drawBackdrop(era, plan, ph, ...a), panel: (...a) => drawPanel(era, ph, ...a) };
}

// --- hero lettering ----------------------------------------------------------------------------
/**
 * Strike a line of hero text centred on (cx, cy), S px per glyph unit. `o.glyph(i, n)` may return
 * {dx, dy, rot, sx, sy, a} to throw individual letters about; o.alpha scales everything;
 * o.shine (0..1) sweeps a glint across the line on styles that have one. Returns the width in px.
 */
export function drawHero(g, style, text, cx, cy, S, o = {}) {
  const L = heroLayout(text);
  const x0 = cx - (L.width * S) / 2;
  const n = L.glyphs.length;
  const A = o.alpha === undefined ? 1 : o.alpha;
  if (A <= 0.003) return L.width * S;
  g.lineCap = 'round';
  g.lineJoin = style.join;
  g.miterLimit = 2.2;
  for (let i = 0; i < n; i++) {
    const gl = L.glyphs[i];
    const m = o.glyph ? o.glyph(i, n) : null;
    const ga = m ? (m.a === undefined ? 1 : m.a) : 1;
    if (ga <= 0.003) continue;
    g.save();
    g.translate(x0 + (gl.x + gl.w / 2) * S + (m && m.dx ? m.dx : 0), cy + (m && m.dy ? m.dy : 0));
    if (m && m.rot) g.rotate(m.rot);
    g.scale(S * (m && m.sx ? m.sx : 1), S * (m && m.sy ? m.sy : 1));
    g.translate(-gl.w / 2, -3);
    const base = A * ga;
    for (const p of style.passes) {
      g.globalAlpha = base * (p.a === undefined ? 1 : p.a);
      g.lineWidth = p.w;
      g.strokeStyle = p.c;
      if (p.dx || p.dy) { g.translate(p.dx || 0, p.dy || 0); g.stroke(gl.path); g.translate(-(p.dx || 0), -(p.dy || 0)); } else g.stroke(gl.path);
    }
    if (style.shine && o.shine !== undefined && o.shine > 0 && o.shine < 1) {
      // A glint travelling along the line, tilted: gradient coordinates are glyph-local, so shift by the glyph's place in the line.
      const lineW = L.width + 6;
      const gx = o.shine * lineW * 1.3 - 3 - gl.x;
      const gr = g.createLinearGradient(gx - 2.2, -1, gx + 2.2, 7);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.5, 'rgba(255,255,255,0.95)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.globalAlpha = base;
      g.lineWidth = style.passes[style.passes.length - 2].w;
      g.strokeStyle = gr;
      g.stroke(gl.path);
    }
    g.restore();
  }
  g.globalAlpha = 1;
  return L.width * S;
}

// --- backdrops ------------------------------------------------------------------------------------
function drawBackdrop(era, plan, ph, g, W, H, U, oy, t, a) {
  if (a <= 0.003) return;
  g.save();
  g.globalAlpha = a;
  if (era === 'vector') {
    g.fillStyle = '#010203';
    g.fillRect(0, 0, W, H);
    // A floor of light running toward the viewer, and a frame like a bezel burn.
    const hz = oy + U * 31, cx = W / 2;
    g.strokeStyle = ph;
    g.lineWidth = Math.max(1, U * 0.09);
    g.globalAlpha = a * 0.3;
    g.beginPath();
    for (let i = -14; i <= 14; i++) { g.moveTo(cx + i * U * 1.6, hz); g.lineTo(cx + i * U * 12, H + 4); }
    const sc = (t * 0.55) % 1;
    for (let k = 0; k < 9; k++) {
      const d = (k + sc) / 9, y = hz + Math.pow(d, 2.2) * (H - hz);
      g.moveTo(0, y);
      g.lineTo(W, y);
    }
    g.stroke();
    g.globalAlpha = a * 0.75;
    const m = U * 1.4, c = U * 3;
    g.lineWidth = Math.max(1.5, U * 0.16);
    g.beginPath();
    for (const [x, y, sx, sy] of [[m, oy + m, 1, 1], [W - m, oy + m, -1, 1], [m, H - oy - m, 1, -1], [W - m, H - oy - m, -1, -1]]) {
      g.moveTo(x + sx * c, y);
      g.lineTo(x, y);
      g.lineTo(x, y + sy * c);
    }
    g.stroke();
  } else if (era === 'chrome') {
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#0b0a3c');
    gr.addColorStop(0.55, '#3b1170');
    gr.addColorStop(1, '#0a1356');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    const cx = W / 2, cy = oy + U * 30, R = Math.hypot(W, H);
    const n = 22, rot = t * 0.05 + plan.rayPhase;
    g.fillStyle = 'rgba(160,190,255,0.07)';
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const a0 = rot + (i / n) * TAU, a1 = a0 + (TAU / n) * 0.5;
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R);
      g.lineTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R);
    }
    g.fill();
    const hz = oy + U * 46;
    const fl = g.createLinearGradient(0, hz, 0, H);
    fl.addColorStop(0, 'rgba(255,200,90,0.3)');
    fl.addColorStop(0.08, 'rgba(60,20,120,0.5)');
    fl.addColorStop(1, 'rgba(6,8,50,0.9)');
    g.fillStyle = fl;
    g.fillRect(0, hz, W, H - hz);
    g.fillStyle = '#ffd56a';
    g.fillRect(0, hz, W, Math.max(1.5, U * 0.14));
  } else {
    const gr = g.createRadialGradient(W / 2, oy + U * 26, U * 4, W / 2, oy + U * 26, Math.hypot(W, H) * 0.62);
    gr.addColorStop(0, '#0d5a78');
    gr.addColorStop(0.55, '#06283d');
    gr.addColorStop(1, '#01080f');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    // Soft out-of-focus lights drifting up, and a swoosh of glass across the lower third.
    g.fillStyle = '#7fe8ff';
    for (const b of plan.bokeh) {
      const y = ((b.y - t * b.v) % 1 + 1) % 1;
      g.globalAlpha = a * b.a;
      g.beginPath();
      g.arc(b.x * W, oy + y * U * 56.25, b.r * U, 0, TAU);
      g.fill();
    }
    g.globalAlpha = a * 0.5;
    const sw = g.createLinearGradient(0, 0, W, 0);
    sw.addColorStop(0, 'rgba(60,220,255,0)');
    sw.addColorStop(0.5, 'rgba(120,240,255,0.5)');
    sw.addColorStop(1, 'rgba(60,220,255,0)');
    g.strokeStyle = sw;
    g.lineWidth = U * 0.5;
    g.beginPath();
    g.moveTo(-U, oy + U * 50);
    g.bezierCurveTo(W * 0.3, oy + U * 38, W * 0.65, oy + U * 58, W + U, oy + U * 42);
    g.stroke();
  }
  g.restore();
}

// --- panels -------------------------------------------------------------------------------------------
/** A framed panel at (x, y, w, h); `accent` lights its rim; `title` is drawn by the caller. */
function drawPanel(era, ph, g, x, y, w, h, accent, U, a = 1) {
  if (a <= 0.003) return;
  g.save();
  g.globalAlpha = a;
  const lw = Math.max(1, U * 0.16);
  if (era === 'vector') {
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(x, y, w, h);
    g.strokeStyle = rgba(ph, 0.85);
    g.lineWidth = lw;
    g.strokeRect(x, y, w, h);
    g.strokeStyle = rgba(ph, 0.35);
    g.strokeRect(x + U * 0.7, y + U * 0.7, w - U * 1.4, h - U * 1.4);
    g.fillStyle = ph;
    g.fillRect(x - lw, y - lw, U * 1.6, lw * 2.4);
    g.fillRect(x + w - U * 1.6 + lw, y + h - lw * 1.4, U * 1.6, lw * 2.4);
  } else if (era === 'chrome') {
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, '#2848c8');
    gr.addColorStop(1, '#0a1670');
    g.fillStyle = '#000';
    g.fillRect(x - lw * 1.5, y - lw * 1.5, w + lw * 3, h + lw * 3);
    const gold = g.createLinearGradient(0, y, 0, y + h);
    gold.addColorStop(0, '#fff2a8');
    gold.addColorStop(0.5, '#d89a20');
    gold.addColorStop(1, '#8a5410');
    g.fillStyle = gold;
    g.fillRect(x - lw, y - lw, w + lw * 2, h + lw * 2);
    g.fillStyle = gr;
    g.fillRect(x + lw * 0.6, y + lw * 0.6, w - lw * 1.2, h - lw * 1.2);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(x + lw * 0.6, y + lw * 0.6, w - lw * 1.2, lw * 0.9);
    g.fillStyle = accent ? rgba(accent, 0.22) : 'rgba(0,0,0,0)';
    g.fillRect(x + lw * 0.6, y + lw * 0.6, w - lw * 1.2, h - lw * 1.2);
  } else {
    const r = U * 1.5;
    roundRect(g, x, y, w, h, r);
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, 'rgba(60,190,240,0.62)');
    gr.addColorStop(1, 'rgba(6,50,90,0.78)');
    g.fillStyle = gr;
    g.fill();
    g.save();
    g.clip();
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.beginPath();
    g.ellipse(x + w * 0.5, y - h * 0.35, w * 0.78, h * 0.85, 0, 0, TAU);
    g.fill();
    g.restore();
    roundRect(g, x, y, w, h, r);
    g.strokeStyle = 'rgba(210,248,255,0.85)';
    g.lineWidth = lw;
    g.stroke();
    if (accent) {
      roundRect(g, x + lw * 1.5, y + lw * 1.5, w - lw * 3, h - lw * 3, r * 0.8);
      g.strokeStyle = rgba(accent, 0.55);
      g.stroke();
    }
  }
  g.restore();
}

/** The grade the old world is crunched into, as shader uniforms (lo/hi are CSS colours). */
export const worldGrade = (look) => look.fx;
export { clamp01 };
