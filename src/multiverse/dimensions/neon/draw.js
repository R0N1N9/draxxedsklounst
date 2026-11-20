// Everything you see. The draw order is the lighting model: the glass floor and whatever
// the dark may hide go down first, then the shadow volumes, then every source of light
// (cover, tiles, lasers, rails, the local sniper) on top of the dark.
import { TAU, clamp, clamp01, lerp, makeCanvas, makeRng, hashSeed, hexToRgb, ease } from '../../kit.js';
import { W, H, R, MID, GANTRY, CH_TOP, CH_BOT, BEAT, PULSE_EVERY, SPAWNS, BEAM_FADE } from './world.js';
import { makeActors } from './actors.js';
import { makeProps } from './props.js';
import { MARGIN, bakeFloor, bakeHalo } from './floor.js';
import { VIOLET, EDGE, PINK, HOT, HAZARD, font } from './style.js';

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
  let haze = null, hazeW = 0, hazeH = 0, hazeY = 0, touched = false;
  const fonts = new Map();

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
  // Chunky pieces get a second, inner line: glass with some thickness to it.
  const insetPath = new Path2D();
  for (const pc of world.pieces) {
    if (pc.type === 'slab') continue;
    const s = pc.solid, n = pc.pts.length / 2, pts = [];
    let rad = 0;
    for (let i = 0; i < n; i++) rad += Math.hypot(pc.pts[i * 2] - s.cx, pc.pts[i * 2 + 1] - s.cy) / n;
    const f = 1 - 11 / rad;
    for (let i = 0; i < n; i++) pts.push(s.cx + (pc.pts[i * 2] - s.cx) * f, s.cy + (pc.pts[i * 2 + 1] - s.cy) * f);
    polyPath(insetPath, pts);
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
      const q = hexToRgb(col), rgb = `${q.r},${q.g},${q.b}`;
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
  /** A neon tube: bloom, tube, white-hot core. path = a Path2D, or null for the current path. bloom scales the halo. */
  function neon(path, col, wide, alpha, bloom = 1) {
    g.lineJoin = 'round';
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = col;
    g.globalAlpha = Math.min(1, alpha * 0.17 * bloom);
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
    const size = px * textBoost / view.k;
    if (alpha <= 0.01) return;
    const fs = Math.round(size * 2) / 2;
    let f = fonts.get(fs); // one string per size, not one per label per frame
    if (!f) {
      if (fonts.size > 48) fonts.clear();
      fonts.set(fs, (f = font(fs)));
    }
    g.font = f;
    g.textAlign = align || 'center';
    g.textBaseline = 'middle';
    g.globalAlpha = alpha;
    g.fillStyle = col;
    g.fillText(text, x, y);
    g.globalAlpha = 1;
  }

  let textBoost = 1; // small in-world labels grow on a phone, where 8-10 px is hard to read
  function fit() {
    // Once thumbs have been on the glass the layout stays put (a pad may take over later).
    if (ctx.input.device === 'touch') touched = true;
    const w = ctx.width, h = ctx.height, touch = touched;
    textBoost = h < 480 ? 1.25 : 1;
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
  const art = { outlinePath, gridMinor, gridMajor, piecesPath, shutters: world.shutters, serial };
  function bake(L) {
    bakedL = L;
    floor = bakeFloor(floor, L, art);
    halo = bakeHalo(halo, L, art);
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

  const A = makeActors({ ctx, g, S, world, view, cols, glow, line, label, toScreen });
  const props = makeProps({ ctx, g, S, world, view, rnd, glow, line, neon, label });

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
    const clock = live ? ctx.time : t; // the music's clock while there is music
    const beat = clock / BEAT, bp = beat % 1, thump = Math.exp(-bp * 5);
    const sh = S.shakeOut;
    const cover = 1 - st.dissolve;

    // ---- backdrop: one opaque fill (haze behind the glass, darker to the corners) ----
    if (w !== hazeW || h !== hazeH || view.cy !== hazeY) {
      hazeW = w;
      hazeH = h;
      hazeY = view.cy;
      haze = g.createRadialGradient(view.cx, view.cy, 0, view.cx, view.cy, Math.hypot(w, h) * 0.6);
      haze.addColorStop(0, '#170f45');
      haze.addColorStop(0.5, '#0b0724');
      haze.addColorStop(1, '#030208');
    }
    g.fillStyle = haze;
    g.fillRect(0, 0, w, h);

    g.save();
    g.translate(view.cx + sh.x, view.cy + sh.y);
    g.rotate(cam.roll + sh.rot);
    g.scale(k, k);
    g.translate(-cam.x, -cam.y);

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
      g.globalAlpha = dark * 0.87;
      g.drawImage(mask.canvas, 0, 0, W, H);
      g.globalAlpha = 1;
    }

    // ---- architecture: light, so it shows in the dark ----
    props.watchers(px);
    g.fillStyle = '#0a0826';
    g.fill(gantryPath);
    drawGantry(px, beat);
    neon(outlinePath, EDGE, wide * 1.1, 1, 1 + 0.9 * thump); // every tube in the room keeps time
    if (S.pulse.soon > 0) { // the pulse is coming: light runs down both sides of the rim and meets at the bottom
      g.setLineDash([rimLen * S.pulse.soon, rimLen * 2]);
      neon(rimR, PINK, wide * 1.7, 0.95);
      neon(rimL, PINK, wide * 1.7, 0.95);
      g.setLineDash([]);
    }
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
      g.strokeStyle = VIOLET;
      g.globalAlpha = cover * 0.45;
      g.stroke(insetPath);
      neon(piecesPath, VIOLET, wide, cover * flick, 1 + 0.9 * thump);
      g.fillStyle = HOT;
      g.globalAlpha = cover * 0.9;
      g.fill(nodesPath);
      g.globalAlpha = 1;
      props.machines(px, wide, cover * flick);
    }
    if (st.crushK >= 0) drawCrush(wide, t);
    props.inspector(px);

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
      // The glass under them gives.
      const grow = clamp01(kt / 0.14) * 5;
      g.lineJoin = 'miter';
      g.lineCap = 'round';
      g.beginPath();
      for (const c of S.kill.cracks) {
        g.moveTo(c[0], c[1]);
        for (let i = 1; i <= 5 && i - 1 < grow; i++) {
          const f = Math.min(1, grow - (i - 1));
          g.lineTo(lerp(c[i * 2 - 2], c[i * 2], f), lerp(c[i * 2 - 1], c[i * 2 + 1], f));
        }
      }
      g.save();
      g.clip(outlinePath); // glass cracks; the void beyond it does not
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = vc;
      g.globalAlpha = 0.3;
      g.lineWidth = 8;
      g.stroke();
      g.strokeStyle = HOT;
      g.globalAlpha = 0.55 + 0.45 * a;
      g.lineWidth = Math.max(1.5, 1.1 * px);
      g.stroke();
      g.restore();
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

    // ---- the four-bar pulse: a white wave through every line of the lattice ----
    if (S.pulse.flash > 0.03) {
      g.save();
      g.clip(outlinePath);
      latticeRing(MID.x, MID.y, 60 + S.pulse.age * 2600, 220, HOT, Math.min(1, S.pulse.flash * 1.3));
      g.restore();
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

  return {
    fit,
    toScreen,
    render,
    frame: view, // read-only: s = CSS px per world unit at zoom 1, (cx, cy) = where the camera centre lands
    dispose() {
      for (const c of [floor, halo, mask]) if (c) c.canvas.width = c.canvas.height = 0;
      for (const c of sprites.values()) c.canvas.width = c.canvas.height = 0;
      sprites.clear();
      fonts.clear();
      floor = halo = null;
    },
  };
}
