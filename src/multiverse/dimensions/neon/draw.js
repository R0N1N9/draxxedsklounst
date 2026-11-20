// Everything you see. The draw order is the lighting model: the glass floor and whatever
// the dark may hide go down first, then the shadow volumes, then every source of light
// (cover, tiles, lasers, rails, the local sniper) on top of the dark.
import { TAU, clamp, clamp01, lerp, makeCanvas, makeRng, hashSeed, ease, angDiff } from '../../kit.js';
import { W, H, R, MID, GANTRY, CH_TOP, CH_BOT, BEAT, PULSE_EVERY, SPAWNS, SHUTTER, DRONE, RELOAD, BEAM_FADE } from './world.js';
import { makeActors } from './actors.js';
import { VOID, INK, VIOLET, EDGE, PINK, HOT, HAZARD, font } from './style.js';

const MARGIN = 70; // baked around the arena so halos are not cut off
const MASK = 4;    // the shadow mask is a quarter-size sheet: the upscale is its soft edge
const EYE = [9, 0, -4.5, 7.8, -4.5, -7.8]; // three eye points: a penumbra, not a knife edge
const VP = { x: W / 2, y: H / 2 + 10 }, LIFT = 1.024; // pillar tops lean away from here

function polyPath(path, pts, lift) {
  for (let i = 0; i < pts.length; i += 2) {
    let x = pts[i], y = pts[i + 1];
    if (lift) { x = VP.x + (x - VP.x) * LIFT; y = VP.y + (y - VP.y) * LIFT; }
    if (i) path.lineTo(x, y);
    else path.moveTo(x, y);
  }
  path.closePath();
  return path;
}

export function makeRenderer(ctx, world, S) {
  const g = ctx.g, P = S.P;
  const cols = [ctx.players[0].color, ctx.players[1].color];
  const view = { s: 1, k: 1, cx: 0, cy: 0 }; // k = world → CSS pixels, camera zoom included
  const scr = { x: 0, y: 0 };
  const mask = makeCanvas(W / MASK, H / MASK);
  const sprites = new Map();
  let floor = null, halo = null, bakedL = 0;
  let haze = null, hazeKey = '';

  // ---- static vector art, built once ----
  const outlinePath = polyPath(new Path2D(), world.outline);
  const piecesPath = new Path2D(), topsPath = new Path2D(), postsPath = new Path2D(), nodesPath = new Path2D();
  for (const pc of world.pieces) {
    polyPath(piecesPath, pc.pts);
    polyPath(topsPath, pc.pts, true);
    for (let i = 0; i < pc.pts.length; i += 2) {
      const x = pc.pts[i], y = pc.pts[i + 1];
      postsPath.moveTo(x, y);
      postsPath.lineTo(VP.x + (x - VP.x) * LIFT, VP.y + (y - VP.y) * LIFT);
      nodesPath.rect(x - 1.6, y - 1.6, 3.2, 3.2);
    }
  }
  const gantryPath = polyPath(new Path2D(), [GANTRY.x0, 0, GANTRY.x1, 0, GANTRY.x1 - GANTRY.inset, GANTRY.d, GANTRY.x0 + GANTRY.inset, GANTRY.d]);
  const gridMinor = new Path2D(), gridMajor = new Path2D();
  for (let x = 50; x < W; x += 50) { const p = x % 100 ? gridMinor : gridMajor; p.moveTo(x, 0); p.lineTo(x, H); }
  for (let y = 50; y < H; y += 50) { const p = y % 100 ? gridMinor : gridMajor; p.moveTo(0, y); p.lineTo(W, y); }
  // The rim, as two runs from the scoreboard down to the bottom centre: the pulse counts in along them.
  const rimPts = [MID.x, GANTRY.d, GANTRY.x1 - GANTRY.inset, GANTRY.d, GANTRY.x1, 0, W - CH_TOP, 0, W, CH_TOP, W, H - CH_BOT, W - CH_BOT, H, MID.x, H];
  const rimR = new Path2D(), rimL = new Path2D();
  let rimLen = 0;
  for (let i = 0; i < rimPts.length; i += 2) {
    if (i) { rimR.lineTo(rimPts[i], rimPts[i + 1]); rimL.lineTo(W - rimPts[i], rimPts[i + 1]); rimLen += Math.hypot(rimPts[i] - rimPts[i - 2], rimPts[i + 1] - rimPts[i - 1]); }
    else { rimR.moveTo(rimPts[i], rimPts[i + 1]); rimL.moveTo(W - rimPts[i], rimPts[i + 1]); }
  }

  // ---- decoration with a life of its own (cosmetic: seeded so it is stable, not synced) ----
  const rnd = makeRng(hashSeed(ctx.seed, 'neon-decor'));
  const watchers = [];
  for (const [x, y] of [[40, 870], [98, 858], [46, 796], [152, 882], [28, 738], [30, 30], [78, 24], [-34, 300], [-34, 540], [240, -30], [520, H + 32]]) {
    for (const m of [0, 1]) watchers.push({ x: m ? W - x : x, y, a: m ? Math.PI : 0, ph: rnd() * TAU, size: 7 + rnd() * 4, cue: rnd() });
  }
  watchers.push({ x: MID.x, y: H + 34, a: -Math.PI / 2, ph: rnd() * TAU, size: 10, cue: rnd() });
  const couriers = [];
  for (let i = 0; i < 9; i++) couriers.push({ v: rnd() < 0.5, at: (1 + Math.floor(rnd() * (i % 2 ? 8 : 15))) * 100, speed: (90 + rnd() * 160) * (rnd() < 0.5 ? -1 : 1), off: rnd() * 2000, pink: rnd() < 0.4 });
  const motes = [];
  for (let i = 0; i < 44; i++) motes.push({ x: rnd() * W, y: rnd() * H, vx: (rnd() - 0.5) * 14, vy: (rnd() - 0.5) * 10, ph: rnd() * TAU });
  const serial = `LATTICE ${(ctx.seed >>> 8).toString(16).toUpperCase().padStart(6, '0')} · ONE ROUND · ONE BOUNCE`;

  // ---- helpers ----
  function sprite(col) {
    let c = sprites.get(col);
    if (!c) {
      c = makeCanvas(96, 96);
      const gr = c.g.createRadialGradient(48, 48, 0, 48, 48, 48);
      const n = parseInt(col.slice(1), 16), rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
      gr.addColorStop(0, `rgba(${rgb},1)`);
      gr.addColorStop(0.22, `rgba(${rgb},0.55)`);
      gr.addColorStop(0.55, `rgba(${rgb},0.15)`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
      c.g.fillStyle = gr;
      c.g.fillRect(0, 0, 96, 96);
      sprites.set(col, c);
    }
    return c.canvas;
  }
  /** A soft additive bloom. The caller sets the composite mode. */
  function glow(x, y, r, col, a) {
    if (a <= 0.004 || r <= 0) return;
    g.globalAlpha = a > 1 ? 1 : a;
    g.drawImage(sprite(col), x - r, y - r, r * 2, r * 2);
  }
  function line(x0, y0, x1, y1) {
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  }
  /** A neon tube: bloom, tube, white-hot core. path = a Path2D, or null for the current path. */
  function neon(path, col, wide, alpha) {
    g.lineJoin = 'round';
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = col;
    g.globalAlpha = alpha * 0.17;
    g.lineWidth = wide * 4.4;
    if (path) g.stroke(path); else g.stroke();
    g.globalAlpha = alpha * 0.92;
    g.lineWidth = wide;
    if (path) g.stroke(path); else g.stroke();
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = HOT;
    g.globalAlpha = alpha * 0.8;
    g.lineWidth = wide * 0.36;
    if (path) g.stroke(path); else g.stroke();
    g.globalAlpha = 1;
  }
  /** Text of a fixed size on screen, anchored in the world. */
  function label(text, x, y, px, col, alpha, align) {
    const size = px / view.k;
    if (alpha <= 0.01) return;
    g.font = font(Math.round(size * 10) / 10);
    g.textAlign = align || 'center';
    g.textBaseline = 'middle';
    g.globalAlpha = alpha;
    g.fillStyle = col;
    g.fillText(text, x, y);
    g.globalAlpha = 1;
  }

  function fit() {
    const w = ctx.width, h = ctx.height, touch = ctx.input.device === 'touch';
    // Leave the floor clear of the thumbs (touch) or of the ability chips (desktop), and let
    // the score strip sit on the scoreboard housing rather than on the playfield.
    const below = touch ? clamp((h - 300) * 0.4, 12, 205) : 52;
    const s = Math.max(0.05, Math.min((w - 20) / W, (h - 60 - below) / (H - GANTRY.d)));
    const top = Math.max(8, 60 - GANTRY.d * s);
    const spare = Math.max(0, h - top - below - H * s);
    view.s = s;
    view.cx = w / 2;
    view.cy = top + spare * (touch ? 0.12 : 0.5) + (H * s) / 2;
    view.k = s * S.cam.z;
  }
  function toScreen(x, y, out) {
    out.x = view.cx + (x - S.cam.x) * view.k;
    out.y = view.cy + (y - S.cam.y) * view.k;
    return out;
  }

  // ---- the baked sheets: the glass floor, and the halos under the cover ----
  function bake(L) {
    bakedL = L;
    const bw = Math.round((W + 2 * MARGIN) * L), bh = Math.round((H + 2 * MARGIN) * L);
    if (!floor) floor = makeCanvas(bw, bh);
    else { floor.canvas.width = bw; floor.canvas.height = bh; }
    const f = floor.g, hair = 1 / L;
    f.setTransform(L, 0, 0, L, MARGIN * L, MARGIN * L);

    // Corner housings: hatched, so the chamfers read as structure rather than as nothing.
    f.save();
    f.beginPath();
    f.rect(0, 0, W, H);
    f.clip();
    f.strokeStyle = 'rgba(127,139,255,0.10)';
    f.lineWidth = hair * 1.2;
    f.beginPath();
    for (let d = 20; d < 480; d += 16) {
      f.moveTo(0, H - d); f.lineTo(d, H);
      f.moveTo(W, H - d); f.lineTo(W - d, H);
      if (d < 200) { f.moveTo(0, d); f.lineTo(d, 0); f.moveTo(W, d); f.lineTo(W - d, 0); }
    }
    f.stroke();
    f.restore();

    f.save();
    f.clip(outlinePath);
    f.fillStyle = VOID;
    f.fillRect(0, 0, W, H);
    const gr = f.createRadialGradient(MID.x, MID.y + 10, 80, MID.x, MID.y + 10, 1000);
    gr.addColorStop(0, '#1b134c');
    gr.addColorStop(0.5, '#0f0b31');
    gr.addColorStop(1, '#09071d');
    f.fillStyle = gr;
    f.fillRect(0, 0, W, H);
    // Sheen: two soft diagonal bands, a skylight caught in the glass.
    for (const [x, wd, al] of [[330, 250, 0.06], [1010, 430, 0.04]]) {
      const lg = f.createLinearGradient(x, 0, x + 0.764 * wd, 0.425 * wd);
      lg.addColorStop(0, 'rgba(190,170,255,0)');
      lg.addColorStop(0.5, `rgba(190,170,255,${al})`);
      lg.addColorStop(1, 'rgba(190,170,255,0)');
      f.fillStyle = lg;
      f.fillRect(0, 0, W, H);
    }
    f.lineWidth = hair;
    f.strokeStyle = 'rgba(140,112,255,0.085)';
    f.stroke(gridMinor);
    f.lineWidth = hair * 1.3;
    f.strokeStyle = 'rgba(150,124,255,0.19)';
    f.stroke(gridMajor);
    f.fillStyle = 'rgba(214,200,255,0.5)';
    for (let x = 100; x < W; x += 100) for (let y = 100; y < H; y += 100) f.fillRect(x - 1.3, y - 1.3, 2.6, 2.6);

    // A reticle set into the floor under the centre.
    f.strokeStyle = 'rgba(160,136,255,0.16)';
    f.lineWidth = hair * 1.4;
    for (const r of [150, 245]) { f.beginPath(); f.arc(MID.x, MID.y, r, 0, TAU); f.stroke(); }
    f.setLineDash([3, 9]);
    f.beginPath(); f.arc(MID.x, MID.y, 197, 0, TAU); f.stroke();
    f.setLineDash([]);
    f.beginPath();
    for (let i = 0; i < 4; i++) {
      const c = Math.cos((i * TAU) / 4), s = Math.sin((i * TAU) / 4);
      f.moveTo(MID.x + c * 245, MID.y + s * 245); f.lineTo(MID.x + c * 285, MID.y + s * 285);
      f.moveTo(MID.x + c * 120, MID.y + s * 120); f.lineTo(MID.x + c * 150, MID.y + s * 150);
    }
    f.stroke();

    // Rails for the shutters, a lane for the polisher.
    f.strokeStyle = 'rgba(255,79,176,0.26)';
    f.lineWidth = hair * 1.3;
    const y0 = MID.y - SHUTTER.amp - SHUTTER.len / 2 - 8, y1 = MID.y + SHUTTER.amp + SHUTTER.len / 2 + 8;
    f.beginPath();
    for (const sh of world.shutters) {
      for (const o of [-5, 5]) { f.moveTo(sh.x + o, y0); f.lineTo(sh.x + o, y1); }
      for (const y of [y0, y1]) { f.moveTo(sh.x - 12, y); f.lineTo(sh.x + 12, y); }
      for (let y = y0 + 25; y < y1; y += 25) { f.moveTo(sh.x - 5, y); f.lineTo(sh.x + 5, y); }
    }
    f.stroke();
    f.strokeStyle = 'rgba(255,79,176,0.2)';
    f.setLineDash([10, 8]);
    f.beginPath();
    f.moveTo(MID.x - DRONE.amp - 26, DRONE.y);
    f.lineTo(MID.x + DRONE.amp + 26, DRONE.y);
    f.stroke();
    f.setLineDash([]);

    // Lattice coordinates along the walls, and the arena's serial.
    f.font = font(10, 500);
    f.textBaseline = 'middle';
    f.textAlign = 'center';
    f.fillStyle = 'rgba(190,176,255,0.3)';
    for (let i = 0; i < 16; i++) { const x = i * 100 + 50; if (x > CH_BOT + 20 && x < W - CH_BOT - 20) f.fillText(String(i + 1).padStart(2, '0'), x, H - 13); }
    for (let j = 1; j < 6; j++) { const y = j * 100 + 50; f.fillText('ABCDEFGHI'[j], 13, y); f.fillText('ABCDEFGHI'[j], W - 13, y); }
    f.font = font(9, 500);
    f.fillStyle = 'rgba(190,176,255,0.22)';
    f.fillText(serial.split('').join(' '), MID.x, H - 30);
    f.restore();

    // The outer wall's halo (it never dissolves, so it lives on the floor sheet).
    f.save();
    f.shadowColor = EDGE;
    f.shadowBlur = 30 * L;
    f.strokeStyle = 'rgba(127,139,255,0.5)';
    f.lineWidth = 4;
    f.lineJoin = 'round';
    f.stroke(outlinePath);
    f.restore();

    // Halos under the cover, at half size (they are blur anyway). Faded out in sudden death.
    const Lh = L * 0.5, hw = Math.round((W + 2 * MARGIN) * Lh), hh = Math.round((H + 2 * MARGIN) * Lh);
    if (!halo) halo = makeCanvas(hw, hh);
    else { halo.canvas.width = hw; halo.canvas.height = hh; }
    const hg = halo.g;
    hg.setTransform(Lh, 0, 0, Lh, MARGIN * Lh, MARGIN * Lh);
    hg.shadowColor = VIOLET;
    hg.shadowBlur = 30 * Lh;
    hg.strokeStyle = 'rgba(154,120,255,0.75)';
    hg.lineWidth = 5;
    hg.lineJoin = 'round';
    hg.stroke(piecesPath);
    hg.stroke(piecesPath);
  }

  // ---- the dark: shadow volumes from the local sniper's eye, with light punched through ----
  function shade(me) {
    const m = mask.g;
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.globalCompositeOperation = 'source-over';
    m.globalAlpha = 1;
    m.clearRect(0, 0, mask.canvas.width, mask.canvas.height);
    m.setTransform(1 / MASK, 0, 0, 1 / MASK, 0, 0);
    m.globalCompositeOperation = 'lighter';
    m.fillStyle = 'rgba(3,2,12,0.34)';
    for (let i = 0; i < 6; i += 2) {
      m.beginPath();
      world.solids.shadow(m, me.x + EYE[i], me.y + EYE[i + 1], 2600);
      m.fill();
    }
    // A rail lights the corridor it travels down; a flash lights the room around it.
    m.globalCompositeOperation = 'destination-out';
    m.lineCap = 'round';
    m.lineJoin = 'round';
    m.strokeStyle = '#000';
    for (let i = 0; i < S.bullets.length; i++) {
      const b = S.bullets[i], k = b.done ? 1 - b.fade / BEAM_FADE : 1;
      if (k <= 0) continue;
      m.beginPath();
      beamPath(m, b, 0);
      m.globalAlpha = 0.45 * k;
      m.lineWidth = 200;
      m.stroke();
      m.lineWidth = 90;
      m.stroke();
    }
    for (let i = 0; i < S.flashes.length; i++) {
      const fl = S.flashes[i];
      if (!fl.live) continue;
      const k = 1 - fl.age / fl.life, r = fl.size * 1.9;
      m.globalAlpha = k;
      m.drawImage(sprite(HOT), fl.x - r, fl.y - r, r * 2, r * 2);
    }
    m.globalAlpha = 1;
  }

  // Trace a rail from `from` world units along its path up to its head.
  function beamPath(c, b, from) {
    const p = b.path, s = b.s;
    let x, y;
    if (from <= 0) { x = p.x0; y = p.y0; }
    else if (from < p.l1 || p.n < 3) { const u = Math.min(1, from / (p.l1 || 1)); x = lerp(p.x0, p.x1, u); y = lerp(p.y0, p.y1, u); }
    else { const u = Math.min(1, (from - p.l1) / (p.l2 || 1)); x = lerp(p.x1, p.x2, u); y = lerp(p.y1, p.y2, u); }
    c.moveTo(x, y);
    if (s <= p.l1 || p.n < 3) {
      const u = Math.min(1, s / (p.l1 || 1));
      c.lineTo(lerp(p.x0, p.x1, u), lerp(p.y0, p.y1, u));
    } else {
      if (from < p.l1) c.lineTo(p.x1, p.y1);
      const u = Math.min(1, (s - p.l1) / (p.l2 || 1));
      c.lineTo(lerp(p.x1, p.x2, u), lerp(p.y1, p.y2, u));
    }
  }
  function beamHead(b, out) {
    const p = b.path, s = b.s;
    if (s <= p.l1 || p.n < 3) { const u = Math.min(1, s / (p.l1 || 1)); out.x = lerp(p.x0, p.x1, u); out.y = lerp(p.y0, p.y1, u); }
    else { const u = Math.min(1, (s - p.l1) / (p.l2 || 1)); out.x = lerp(p.x1, p.x2, u); out.y = lerp(p.y1, p.y2, u); }
    return out;
  }

  const A = makeActors({ ctx, g, S, world, view, cols, glow, line, neon, label, toScreen });

  // Grid lines lit inside a ring: how the lattice carries a beat, a shot, a shockwave.
  function latticeRing(x, y, r, band, col, alpha) {
    if (alpha <= 0.01 || r <= 0) return;
    g.save();
    g.beginPath();
    g.arc(x, y, r + band / 2, 0, TAU);
    g.arc(x, y, Math.max(0.1, r - band / 2), 0, TAU, true);
    g.clip();
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = col;
    g.lineWidth = Math.max(1.1, 1 / view.k);
    g.globalAlpha = alpha * 0.55;
    g.stroke(gridMinor);
    g.globalAlpha = alpha;
    g.stroke(gridMajor);
    g.restore();
  }

  function render() {
    fit();
    const w = ctx.width, h = ctx.height, cam = S.cam, st = world.state;
    const L = Math.round(clamp(view.s * ctx.dpr, 0.5, 1.7) * 20) / 20;
    if (!floor || L !== bakedL) bake(L);
    const k = view.k, px = 1 / k, wide = Math.max(2.5, 1.7 * px);
    const me = P[ctx.me], foe = P[1 - ctx.me];
    const live = ctx.phase === 'live', t = S.t;
    const clock = live || ctx.phase === 'over' ? ctx.time : t;
    const beat = clock / BEAT, bp = beat % 1, thump = Math.exp(-bp * 5);
    const sh = S.shakeOut;
    const cover = 1 - st.dissolve;

    // ---- backdrop ----
    g.fillStyle = VOID;
    g.fillRect(0, 0, w, h);
    const hk = `${w}|${h}|${view.cx | 0}|${view.cy | 0}`;
    if (hk !== hazeKey) {
      hazeKey = hk;
      haze = g.createRadialGradient(view.cx, view.cy, 0, view.cx, view.cy, Math.max(w, h) * 0.72);
      haze.addColorStop(0, 'rgba(78,48,190,0.26)');
      haze.addColorStop(0.55, 'rgba(42,22,120,0.1)');
      haze.addColorStop(1, 'rgba(0,0,0,0)');
    }
    g.fillStyle = haze;
    g.fillRect(0, 0, w, h);

    g.save();
    g.translate(view.cx + sh.x, view.cy + sh.y);
    g.rotate(cam.roll + sh.rot);
    g.scale(k, k);
    g.translate(-cam.x, -cam.y);

    drawWatchers(px);
    g.drawImage(floor.canvas, -MARGIN, -MARGIN, W + 2 * MARGIN, H + 2 * MARGIN);

    // ---- on the floor ----
    g.save();
    g.clip(outlinePath);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) { // city light drifting far below the glass
      glow(MID.x + 640 * Math.sin(t * 0.021 * (i + 2) + i * 2.1), 470 + 330 * Math.sin(t * 0.017 * (i + 3) + i), 190 + 40 * (i % 3), i % 3 === 0 ? PINK : i % 3 === 1 ? VIOLET : EDGE, 0.055);
    }
    // The lattice keeps time: every line breathes on the beat, a ring runs out on the bar.
    g.strokeStyle = VIOLET;
    g.lineWidth = Math.max(1, px);
    g.globalAlpha = 0.16 * thump;
    g.stroke(gridMajor);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    const barPh = (beat / 4) % 1;
    latticeRing(MID.x, MID.y, 30 + barPh * 1100, 90, VIOLET, 0.5 * Math.pow(1 - barPh, 1.4));
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    for (let i = 0; i < couriers.length; i++) { // packets of light running the grid
      const c = couriers[i], span = (c.v ? H : W) + 300;
      const at = ((((c.off + t * c.speed) % span) + span) % span) - 150, tail = c.speed > 0 ? -34 : 34;
      const x0 = c.v ? c.at : at, y0 = c.v ? at : c.at;
      g.strokeStyle = c.pink ? PINK : EDGE;
      g.globalAlpha = 0.55;
      g.lineWidth = Math.max(1.6, 1.2 * px);
      line(x0, y0, c.v ? x0 : x0 + tail, c.v ? y0 + tail : y0);
      glow(x0, y0, 9, c.pink ? PINK : EDGE, 0.8);
    }
    for (let i = 0; i < 2; i++) { // spawn pads
      g.strokeStyle = cols[i];
      g.globalAlpha = 0.3;
      g.lineWidth = Math.max(1.2, px);
      g.setLineDash([7, 6]);
      g.beginPath();
      g.arc(SPAWNS[i].x, SPAWNS[i].y, 38, 0, TAU);
      g.stroke();
      g.setLineDash([]);
    }
    if (cover > 0.01) {
      g.globalAlpha = cover;
      g.drawImage(halo.canvas, -MARGIN, -MARGIN, W + 2 * MARGIN, H + 2 * MARGIN);
      for (const s of world.shutters) glow(s.x, s.y, 120, PINK, 0.13 * cover);
      glow(world.drone.x, world.drone.y, 70, PINK, 0.16 * cover);
    }
    // Light the snipers throw on the floor.
    if (me.alive) glow(me.x, me.y, 135, cols[me.i], 0.2);
    if (foe.alive) glow(foe.x, foe.y, 135, cols[foe.i], 0.2 * S.vis);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#cfc4ff';
    for (let i = 0; i < motes.length; i++) { // dust in the light
      const m = motes[i];
      g.globalAlpha = 0.14 + 0.14 * Math.sin(t * 1.3 + m.ph);
      g.fillRect((((m.x + t * m.vx) % W) + W) % W, (((m.y + t * m.vy) % H) + H) % H, 1.8, 1.8);
    }
    g.globalAlpha = 1;
    g.restore();

    // ---- what the dark may hide ----
    A.hidden();

    // ---- the dark ----
    const dark = S.dark * (1 - 0.88 * clamp01(S.pulse.flash * 1.4));
    if (dark > 0.01 && me.alive) {
      shade(me);
      g.globalAlpha = dark * 0.92;
      g.drawImage(mask.canvas, 0, 0, W, H);
      g.globalAlpha = 1;
    }

    // ---- architecture: light, so it shows in the dark ----
    g.fillStyle = '#0a0826';
    g.fill(gantryPath);
    drawGantry(px, beat);
    neon(outlinePath, EDGE, wide * 1.1, 1);
    if (cover > 0.01) {
      const flick = st.dissolve > 0 ? 0.55 + 0.45 * Math.sin(t * 70) : 1; // sudden death: the cover gutters out
      g.globalAlpha = cover;
      g.fillStyle = 'rgba(128,98,255,0.15)';
      g.fill(piecesPath);
      g.fillStyle = 'rgba(196,178,255,0.05)';
      g.fill(topsPath);
      g.strokeStyle = 'rgba(206,192,255,0.3)';
      g.lineWidth = Math.max(1, px);
      g.stroke(topsPath);
      g.globalAlpha = cover * 0.6;
      g.stroke(postsPath);
      neon(piecesPath, VIOLET, wide, cover * flick);
      g.fillStyle = HOT;
      g.globalAlpha = cover * 0.9;
      g.fill(nodesPath);
      g.globalAlpha = 1;
      drawMachines(px, wide, cover * flick);
    }
    if (st.crushK >= 0) drawCrush(wide, t);

    // ---- light on the floor: tiles, rings, scars ----
    g.globalCompositeOperation = 'lighter';
    g.lineWidth = Math.max(1.2, px);
    for (let i = 0; i < S.tiles.length; i++) {
      const o = S.tiles[i];
      if (!o.live) continue;
      const a = Math.pow(1 - o.age / o.life, 1.3), pop = Math.max(0, 1 - o.age * 5);
      g.fillStyle = g.strokeStyle = cols[o.owner];
      g.globalAlpha = a * 0.2 + pop * 0.25;
      g.fillRect(o.x + 2, o.y + 2, 46, 46);
      g.globalAlpha = a * 0.75;
      g.strokeRect(o.x + 2.5, o.y + 2.5, 45, 45);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < S.rings.length; i++) {
      const o = S.rings[i];
      if (!o.live) continue;
      const u = o.age / o.life, r = 12 + o.size * ease.outCubic(u), a = Math.pow(1 - u, 1.6);
      latticeRing(o.x, o.y, r, 44, cols[o.owner], a * 0.75);
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = cols[o.owner];
      g.globalAlpha = a * 0.8;
      g.lineWidth = Math.max(1.6, 1.3 * px);
      g.beginPath();
      g.arc(o.x, o.y, r, 0, TAU);
      g.stroke();
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    for (let i = 0; i < S.scars.length; i++) { // where a rail bit the wall
      const o = S.scars[i];
      if (!o.live) continue;
      const a = Math.pow(1 - o.age / o.life, 2), base = Math.atan2(o.ny, o.nx);
      g.strokeStyle = cols[o.owner];
      g.globalAlpha = a * 0.8;
      g.lineWidth = Math.max(1.4, px);
      g.beginPath();
      for (let j = -2; j <= 2; j++) {
        const aa = base + j * 0.55, len = j % 2 ? 9 : 15;
        g.moveTo(o.x + Math.cos(aa) * 3, o.y + Math.sin(aa) * 3);
        g.lineTo(o.x + Math.cos(aa) * len, o.y + Math.sin(aa) * len);
      }
      g.stroke();
      glow(o.x, o.y, 16, HOT, a * a);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';

    A.ghost();

    // ---- lasers, rails, flashes, sparks ----
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 2; i++) if (P[i].laserOn) A.laser(P[i].laser, cols[i], i === ctx.me && S.lock);
    for (let i = 0; i < S.decoys.length; i++) { const d = S.decoys[i]; if (d.alive && d.laserOn) A.laser(d.laser, cols[d.owner], false); }
    for (let i = 0; i < S.bullets.length; i++) {
      const b = S.bullets[i], col = cols[b.owner];
      let a = b.done ? 1 - b.fade / BEAM_FADE : 1;
      if (a <= 0) continue;
      if (b.kill) a = 0.75 + 0.25 * Math.sin(t * 30); // the decisive rail hangs in the air, humming
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.strokeStyle = col;
      g.beginPath();
      beamPath(g, b, R * 2.3);
      g.globalAlpha = 0.07 * a; g.lineWidth = 34; g.stroke();
      g.globalAlpha = 0.2 * a; g.lineWidth = 11; g.stroke();
      g.globalAlpha = 0.8 * a; g.lineWidth = Math.max(3, 2 * px); g.stroke();
      g.strokeStyle = HOT;
      g.globalAlpha = a; g.lineWidth = Math.max(1.3, 0.9 * px); g.stroke();
      if (b.path.n === 3 && b.s > b.path.l1) glow(b.path.x1, b.path.y1, 26, HOT, a);
      if (!b.done) {
        beamHead(b, scr);
        g.beginPath();
        beamPath(g, b, Math.max(R * 2.3, b.s - 230));
        g.globalAlpha = 1; g.lineWidth = Math.max(5, 3 * px); g.stroke();
        glow(scr.x, scr.y, 60, col, 1);
        glow(scr.x, scr.y, 24, HOT, 1);
      }
    }
    for (let i = 0; i < S.flashes.length; i++) {
      const fl = S.flashes[i];
      if (!fl.live) continue;
      const u = fl.age / fl.life, a = (1 - u) * (1 - u), col = fl.owner < 0 ? HOT : cols[fl.owner];
      glow(fl.x, fl.y, fl.size * (0.7 + 0.5 * u), col, a);
      glow(fl.x, fl.y, fl.size * 0.3, HOT, a);
      if (fl.star) { // muzzle: a hard four-point star, long along the barrel
        const c = Math.cos(fl.a), s = Math.sin(fl.a), len = fl.size * 0.55 * (1 - u * 0.5);
        g.strokeStyle = HOT;
        g.globalAlpha = a;
        g.lineWidth = Math.max(2, 1.4 * px);
        line(fl.x - c * len * 0.3, fl.y - s * len * 0.3, fl.x + c * len, fl.y + s * len);
        line(fl.x + s * len * 0.45, fl.y - c * len * 0.45, fl.x - s * len * 0.45, fl.y + c * len * 0.45);
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    S.parts.draw(g);

    // ---- the kill: a shockwave through the grid ----
    if (S.kill) {
      const kt = S.kill.t, vc = cols[S.kill.victim];
      const r = 20 + kt * 1500, a = clamp01(1 - kt / 0.95);
      latticeRing(S.kill.x, S.kill.y, r, 110, HOT, a);
      latticeRing(S.kill.x, S.kill.y, r * 0.72, 70, vc, a * 0.9);
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = vc;
      g.globalAlpha = a;
      g.lineWidth = Math.max(2.5, 2 * px);
      g.beginPath();
      g.arc(S.kill.x, S.kill.y, r, 0, TAU);
      g.stroke();
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }

    // ---- what is always seen: the local sniper and what belongs to it ----
    A.shown(wide);
    g.restore();

    // ---- screen space ----
    A.reticle();
    const pf = S.pulse.flash;
    if (pf > 0.02) { // the pulse: the whole room blinks
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = 'rgba(190,170,255,1)';
      g.globalAlpha = pf * pf * 0.16;
      g.fillRect(0, 0, w, h);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    if (S.kill && S.kill.t < 0.3) {
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = HOT;
      g.globalAlpha = 0.4 * Math.exp(-S.kill.t * 16);
      g.fillRect(0, 0, w, h);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    // Vignette: two soft bars are cheaper than a full-screen radial, and frame a wide arena better.
    g.fillStyle = 'rgba(2,1,8,0.5)';
    const edge = Math.max(0, view.cx - (W * view.s) / 2 - 8);
    if (edge > 2) { g.fillRect(0, 0, edge, h); g.fillRect(w - edge, 0, edge, h); }
  }

  // The scoreboard housing. Its wings carry the pulse meter: sixteen beats, then the room blinks.
  function drawGantry(px, beat) {
    const live = ctx.phase === 'live', sudden = ctx.sudden;
    const cyc = live && !sudden ? (ctx.time % PULSE_EVERY) / BEAT : -1;
    g.strokeStyle = 'rgba(127,139,255,0.25)';
    g.lineWidth = Math.max(1, px);
    line(GANTRY.x0 + 22, 11, GANTRY.x1 - 22, 11);
    line(GANTRY.x0 + 44, GANTRY.d - 11, GANTRY.x1 - 44, GANTRY.d - 11);
    for (let i = 0; i < 16; i++) {
      const lit = cyc >= 0 && i < Math.floor(cyc), now = cyc >= 0 && i === Math.floor(cyc), hot = i >= 12;
      g.fillStyle = sudden ? HAZARD : hot ? PINK : EDGE;
      g.globalAlpha = sudden ? 0.35 + 0.5 * (Math.sin(S.t * 9) > 0 ? 1 : 0) : now ? 1 : lit ? 0.75 : 0.2;
      const x = 414 + i * 7.2, hgt = now ? 22 : 16;
      g.fillRect(x, 31 - hgt / 2, 4.2, hgt);
      g.fillRect(W - x - 4.2, 31 - hgt / 2, 4.2, hgt);
    }
    g.globalAlpha = 1;
  }

  // Shutters on their rails, and the floor polisher doing its rounds whatever happens.
  function drawMachines(px, wide, alpha) {
    for (const s of world.shutters) {
      const x = s.x - SHUTTER.thick / 2, y = s.y - SHUTTER.len / 2;
      g.fillStyle = 'rgba(255,79,176,0.2)';
      g.globalAlpha = alpha;
      g.fillRect(x, y, SHUTTER.thick, SHUTTER.len);
      g.beginPath();
      g.rect(x, y, SHUTTER.thick, SHUTTER.len);
      neon(null, PINK, wide, alpha);
      g.strokeStyle = HOT;
      g.globalAlpha = alpha * 0.7;
      g.lineWidth = Math.max(1, px);
      for (let i = -2; i <= 2; i++) line(s.x - 4, s.y + i * 24 + 4, s.x + 4, s.y + i * 24 - 4);
      g.globalAlpha = 1;
    }
    const d = world.drone, hs = DRONE.size / 2, mad = S.droneHit > 0;
    // The strip it has just polished.
    const back = d.x - (MID.x + DRONE.amp * Math.sin(((ctx.time - 1.6) / DRONE.period) * TAU));
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = PINK;
    g.globalAlpha = 0.1 * alpha;
    g.lineWidth = DRONE.size - 6;
    g.lineCap = 'butt';
    line(d.x, d.y, d.x - back, d.y);
    g.globalCompositeOperation = 'source-over';
    g.save();
    g.translate(d.x, d.y);
    if (mad) g.translate(Math.sin(S.t * 90) * 2, 0);
    g.fillStyle = INK;
    g.globalAlpha = alpha;
    g.fillRect(-hs, -hs, DRONE.size, DRONE.size);
    g.beginPath();
    g.rect(-hs, -hs, DRONE.size, DRONE.size);
    neon(null, mad ? HAZARD : PINK, wide * 0.9, alpha);
    g.strokeStyle = HOT;
    g.globalAlpha = alpha * 0.8;
    g.lineWidth = Math.max(1.2, px);
    const spin = S.t * 7;
    g.beginPath();
    g.arc(0, 0, hs * 0.55, spin, spin + 1.9);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, hs * 0.55, spin + Math.PI, spin + Math.PI + 1.9);
    g.stroke();
    g.globalAlpha = alpha * (Math.sin(S.t * 5) > 0.2 ? 1 : 0.25);
    g.fillStyle = mad ? HAZARD : HOT;
    g.fillRect(hs - 7, -hs + 3, 4, 4);
    g.restore();
    label(mad ? '!!' : 'MOP-3', d.x, d.y - hs - 11, 8, mad ? HAZARD : PINK, alpha * (view.k > 0.5 ? 0.8 : 0), 'center');
    g.globalAlpha = 1;
  }

  // Sudden death: the walls close in, and what is outside them is gone.
  function drawCrush(wide, t) {
    const f = world.state.safe;
    g.save();
    g.clip(outlinePath);
    g.fillStyle = 'rgba(255,61,110,0.11)';
    g.beginPath();
    g.rect(0, 0, W, H);
    g.rect(f.x0, f.y0, f.x1 - f.x0, f.y1 - f.y0);
    g.fill('evenodd');
    g.strokeStyle = 'rgba(255,61,110,0.3)';
    g.lineWidth = 1.5;
    g.setLineDash([14, 12]);
    g.lineDashOffset = -t * 40;
    for (let i = 1; i <= 3; i++) g.strokeRect(f.x0 - i * 26, f.y0 - i * 26, f.x1 - f.x0 + i * 52, f.y1 - f.y0 + i * 52);
    g.setLineDash([]);
    g.beginPath();
    g.rect(f.x0, f.y0, f.x1 - f.x0, f.y1 - f.y0);
    neon(null, HAZARD, wide * 1.2, 0.8 + 0.2 * Math.sin(t * 12));
    g.restore();
  }

  // Watcher drones crowd the glass: they follow the shooting, and their cameras flash on a kill.
  function drawWatchers(px) {
    const wt = S.watch, t = S.t;
    for (let i = 0; i < watchers.length; i++) {
      const o = watchers[i];
      const y = o.y + Math.sin(t * 1.1 + o.ph) * 4, x = o.x + Math.cos(t * 0.7 + o.ph) * 3;
      o.a += angDiff(o.a, Math.atan2(wt.y - y, wt.x - x)) * 0.07;
      const s = o.size * (1 + 0.35 * wt.jolt * (0.5 + o.cue));
      const c = Math.cos(o.a), sn = Math.sin(o.a);
      g.strokeStyle = EDGE;
      g.globalAlpha = 0.6;
      g.lineWidth = Math.max(1.2, px);
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(x + c * s * 1.3, y + sn * s * 1.3);
      g.lineTo(x - c * s * 0.8 - sn * s * 0.85, y - sn * s * 0.8 + c * s * 0.85);
      g.lineTo(x - c * s * 0.35, y - sn * s * 0.35);
      g.lineTo(x - c * s * 0.8 + sn * s * 0.85, y - sn * s * 0.8 - c * s * 0.85);
      g.closePath();
      g.stroke();
      g.fillStyle = HOT;
      g.globalAlpha = 0.85;
      g.fillRect(x + c * s * 0.45 - 1.2, y + sn * s * 0.45 - 1.2, 2.4, 2.4);
      if (S.kill) { // flashbulbs
        const dt = S.kill.t - o.cue * 0.55;
        if (dt > 0 && dt < 0.25) {
          g.globalCompositeOperation = 'lighter';
          glow(x + c * s, y + sn * s, 46, HOT, 1 - dt / 0.25);
          g.globalCompositeOperation = 'source-over';
        }
      }
    }
    g.globalAlpha = 1;
  }

  return {
    fit,
    toScreen,
    render,
    dispose() {
      for (const c of [floor, halo, mask]) if (c) c.canvas.width = c.canvas.height = 0;
      for (const c of sprites.values()) c.canvas.width = c.canvas.height = 0;
      sprites.clear();
      floor = halo = null;
    },
  };
}
