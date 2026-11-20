// Rendering: the world is painted into a 320x180 buffer (and a second one for screen-space
// HUD), then blitted with nearest-neighbour scaling inside themed letterbox bars, with
// optional scanlines, a vignette and softly rounded corners. Camera zooms are crops of the
// buffer, so every pixel stays a chunky square.
import { clamp, makeCanvas, ease, lerp } from '../../kit.js';
import { PAL, FW, FH, bayer, dither, drawText, textWidth } from './palette.js';
import { line, ring } from './px.js';
import { drawSniper, drawMarker, muzzle } from './sprites.js';
import { drawCrate, drawSpring, drawBird, drawBalloon, drawFlag, drawLamp, drawSmoke, drawGrenade } from './art.js';
import { drawFlash } from './fx.js';
import { C, BODY } from './world.js';

export function makeView(ctx, world, S, art) {
  const fb = makeCanvas(FW, FH), ov = makeCanvas(FW, FH);
  const fg = fb.g, og = ov.g;
  const L = { s: 1, ox: 0, oy: 0, k: 1, cx: 0, cy: 0, cw: FW, ch: FH, shx: 0, shy: 0 };
  const o = { x: 0, y: 0, face: 1, st: 0, run: 0, moving: false, air: false, vy: 0, aim: 0, recoil: 0, col: '', colD: '', t: 0, jet: false, tint: '', decoy: false };
  const mz = { x: 0, y: 0, sx: 0, sy: 0 };
  let vig = null, barKey = '', barPat = null;

  function layout() {
    const w = ctx.width, h = ctx.height, dpr = ctx.dpr || 1;
    const raw = Math.min(w / FW, h / FH);
    let s = Math.floor(raw * dpr + 1e-6) / dpr;
    if (s * dpr < 1) s = raw;
    L.s = s;
    L.ox = Math.round(((w - FW * s) / 2) * dpr) / dpr;
    L.oy = Math.round(((h - FH * s) / 2) * dpr) / dpr;
    // camera crop
    const c = S.cam, z = Math.max(1, c.z);
    L.cw = FW / z; L.ch = FH / z;
    L.cx = clamp(c.x - L.cw / 2, 0, FW - L.cw);
    L.cy = clamp(c.y - L.ch / 2, 0, FH - L.ch);
    L.k = s * z;
  }
  const toCssX = (x) => L.ox + (x - L.cx + L.shx) * L.k;
  const toCssY = (y) => L.oy + (y - L.cy + L.shy) * L.k;

  const dipAt = (x) => {
    let d = 0;
    for (const p of S.P) if (p.alive && p.ground && world.bridgeY(p.x) >= 0 && Math.abs(p.y - world.bridgeY(p.x)) < 3) d += 2 * Math.exp(-Math.pow((x - p.x) / 9, 2));
    return d;
  };
  function drawBridge(g, t) {
    const E = world.E, W = world.W, GY = world.GY, a = E, b = W - E;
    const ropeY = (x) => GY - 12 + 5 * Math.sin((Math.PI * (x - a)) / (b - a));
    // rope handrail (behind the snipers)
    for (let x = a; x <= b; x += 1) {
      g.fillStyle = PAL.ink; g.fillRect(x, Math.round(ropeY(x)) - 1, 1, 3);
    }
    for (let x = a; x <= b; x += 1) { g.fillStyle = x % 6 < 3 ? PAL.wood : PAL.peach; g.fillRect(x, Math.round(ropeY(x)), 1, 1); }
    for (let x = a + 8; x < b; x += 16) {
      const yy = Math.round(ropeY(x)), py = Math.round(world.bridgeY(x) + dipAt(x));
      g.fillStyle = PAL.ink; g.fillRect(x - 1, yy, 3, py - yy);
      g.fillStyle = PAL.wood; g.fillRect(x, yy + 1, 1, py - yy - 1);
    }
    // planks
    for (let x = a; x < b; x += 4) {
      const y = Math.round(world.bridgeY(x + 2) + dipAt(x + 2) + Math.sin(t * 2 + x * 0.08) * 0.45);
      g.fillStyle = PAL.ink; g.fillRect(x, y, 4, 4);
      g.fillStyle = (x >> 2) % 2 ? PAL.wood : PAL.amberD; g.fillRect(x, y, 3, 2);
      g.fillStyle = PAL.coral; g.fillRect(x, y, 3, 1);
      g.fillStyle = PAL.night; g.fillRect(x, y + 2, 3, 1);
    }
    // front rope under the planks
    for (let x = a; x <= b; x += 1) { g.fillStyle = PAL.ink; g.fillRect(x, Math.round(world.bridgeY(x) + dipAt(x)) + 4, 1, 1); }
  }

  function playerOpts(p, tint) {
    o.x = p.x; o.y = p.y + (p.ground ? dipAt(p.x) * 0 : 0); o.face = p.face; o.st = p.st; o.run = p.run; o.moving = Math.abs(p.vx) > 6 && p.ground; o.air = !p.ground; o.vy = p.vy;
    o.aim = p.a; o.recoil = p.recoil; o.col = p.col; o.colD = p.colD; o.t = S.t + p.i * 0.37; o.jet = p.jet; o.tint = tint || ''; o.decoy = false;
    return o;
  }
  function drawPlayer(g, p) {
    if (!p.alive) return;
    const k = S.kill;
    let tint = '';
    if (k && k.victim === p.i) { if (k.t > 0.34) return; tint = Math.floor(k.t * 22) % 2 ? PAL.cream : PAL.ink; if (k.t < 0.08) tint = PAL.cream; }
    const hid = p.i !== ctx.me && S.hides(p.x, p.y - 8);
    if (hid) return;
    const own = p.i === ctx.me, ghost = own && S.hides(p.x, p.y - 8);
    if (ghost) g.globalAlpha = 0.5;
    playerOpts(p, tint);
    if (p.dipY) o.y += p.dipY;
    drawSniper(g, o);
    g.globalAlpha = 1;
    if (p.flash > 0) { muzzle(o, mz); drawFlash(g, mz.x, mz.y, p.a, p.flash / 0.09); }
  }

  function drawDecoy(g, d) {
    if (!d.alive || S.hides(d.x, d.y - 8)) return;
    const own = d.owner === ctx.me;
    g.fillStyle = PAL.ink; g.fillRect(Math.round(d.x) - 5, Math.round(d.y), 11, 2);
    g.fillStyle = PAL.wood; g.fillRect(Math.round(d.x) - 4, Math.round(d.y), 9, 1);
    const pl = S.P[d.owner];
    o.x = d.x; o.y = d.y; o.face = d.face; o.st = 0; o.run = d.run; o.moving = d.moving; o.air = false; o.vy = 0; o.aim = d.aim; o.recoil = 0; o.col = pl.col; o.colD = pl.colD; o.t = 0; o.jet = false; o.tint = ''; o.decoy = true;
    drawSniper(g, o);
    if (own && ((S.t * 2) | 0) % 2 === 0) { g.fillStyle = PAL.cream; g.fillRect(Math.round(d.x) - 1, Math.round(d.y) - 22, 3, 1); g.fillRect(Math.round(d.x), Math.round(d.y) - 23, 1, 3); }
  }

  function drawBullets(g) {
    for (const b of S.bullets) {
      if (!b.live) continue;
      const col = S.P[b.owner].col;
      for (let i = 0; i < 7; i++) {
        const j = (b.ti - 1 - i + 16) % 8;
        if (i >= b.tn) break;
        g.fillStyle = i < 2 ? PAL.cream : i < 4 ? PAL.peach : col;
        g.fillRect(Math.round(b.tx[j]), Math.round(b.ty[j]), 1, 1);
      }
      const a = Math.atan2(b.vy, b.vx), c = Math.cos(a), s = Math.sin(a), x = Math.round(b.x), y = Math.round(b.y);
      g.fillStyle = PAL.ink; g.fillRect(x - 2, y - 1, 5, 3);
      line(g, x - c * 3, y - s * 3, x + c * 1, y + s * 1, PAL.cream, 1);
      g.fillStyle = col; g.fillRect(x, y, 1, 1);
    }
  }

  function drawLava(g) {
    const y = Math.round(world.lavaY), t = S.t;
    if (y >= FH + 2) return;
    for (let x = 0; x < FW; x++) {
      const w = Math.round(Math.sin(x * 0.19 + t * 3) * 1.4 + Math.sin(x * 0.07 - t * 2) * 1.5);
      const top = y + w;
      g.fillStyle = PAL.ink; g.fillRect(x, top - 1, 1, 1);
      g.fillStyle = PAL.cream; g.fillRect(x, top, 1, 1);
      g.fillStyle = PAL.peach; g.fillRect(x, top + 1, 1, 2);
      g.fillStyle = PAL.coral; g.fillRect(x, top + 3, 1, FH - top);
    }
    g.fillStyle = dither(g, PAL.rose, 8); g.fillRect(0, y + 6, FW, FH - y);
    g.fillStyle = dither(g, PAL.peach, 5); g.fillRect(0, y + 3, FW, 8);
    for (let i = 0; i < 18; i++) { // bubbles
      const bx = (i * 53 + ((t * (8 + i % 5)) | 0) * 0) % FW, ph = (t * 0.7 + i * 0.37) % 1;
      g.fillStyle = PAL.cream; g.fillRect((bx + i * 17) % FW, y + 6 + Math.round((1 - ph) * 12), 1, 1);
    }
    for (let i = 0; i < 6; i++) { // sparks above the surface
      const ph = (t * 0.9 + i * 0.41) % 1;
      g.fillStyle = PAL.peach; g.fillRect((i * 61 + 13) % FW, y - Math.round(ph * 16), 1, 1);
    }
  }

  function drawWorld() {
    const g = fg, t = S.t;
    const sd = ctx.sudden;
    g.drawImage(art.bg.canvas, 0, 0);
    // stars blink
    for (const s of art.bg.stars) if (Math.sin(t * 2 + s.ph) > -0.35) { g.fillStyle = s.c; g.fillRect(s.x, s.y, 1, 1); }
    // clouds drift at three speeds
    let ci = 0;
    for (const c of art.bg.clouds) {
      const sp = 2.2 + ci * 1.7, y = [26, 46, 14, 62][ci];
      const x = ((ci * 97 + t * sp + 400) % (FW + c.width + 20)) - c.width - 10;
      g.drawImage(c, Math.round(x), y);
      ci++;
    }
    // mist in the chasm
    const E = world.E;
    for (let i = 0; i < 4; i++) {
      g.save();
      g.beginPath(); g.rect(E + 6, 120, FW - 2 * E - 12, 60); g.clip();
      g.fillStyle = dither(g, i % 2 ? PAL.orchid : PAL.rose, 3 + i);
      g.translate(Math.round(t * (2 + i)) % 4 - 4, 0);
      g.fillRect(0, 136 + i * 9, FW + 8, 4);
      g.restore();
    }
    // thermals: motes riding the lift
    for (const m of S.motes) {
      g.fillStyle = m.c;
      g.fillRect(Math.round(m.x), Math.round(m.y), 1, m.long ? 2 : 1);
    }
    if (world.balloon.on) drawBalloon(g, world.balloon, t);
    g.drawImage(art.terrain, 0, 0);
    // team flags and lamps
    drawFlag(g, 7, world.GY, S.P[0].col, S.P[0].colD, t);
    drawFlag(g, FW - 7, world.GY, S.P[1].col, S.P[1].colD, t + 1);
    drawLamp(g, E - 3, world.GY, t);
    drawLamp(g, FW - E + 3, world.GY, t + 2);
    drawBridge(g, t);
    // nests
    for (const n of world.nests) {
      g.fillStyle = PAL.ink; g.fillRect(n.x - 1, n.y, n.w + 2, 5);
      g.fillStyle = PAL.wood; g.fillRect(n.x, n.y, n.w, 3);
      g.fillStyle = PAL.coral; g.fillRect(n.x, n.y, n.w, 1);
      g.fillStyle = PAL.ink; for (let x = n.x + 3; x < n.x + n.w - 2; x += 8) g.fillRect(x, n.y + 5, 2, world.GY - n.y - 5);
      g.fillStyle = PAL.wood; for (let x = n.x + 3; x < n.x + n.w - 2; x += 8) g.fillRect(x, n.y + 5, 1, world.GY - n.y - 5);
    }
    for (const c of world.crates) if (c.alive) drawCrate(g, c.x, c.y, c.hit);
    for (let i = 0; i < world.pads.length; i++) drawSpring(g, world.pads[i].x, world.PF, S.padSquash[i]);
    for (const d of S.decoys) drawDecoy(g, d);
    for (const gr of S.grenades) drawGrenade(g, gr.x, gr.y, t);
    // snipers: the far one first, the local one on top
    drawPlayer(g, S.P[1 - ctx.me]);
    drawPlayer(g, S.P[ctx.me]);
    drawLava(g);
    for (const c of S.smokes) drawSmoke(g, c.x, c.y, C.SMOKE_R, S.t - c.t0, C.SMOKE_LIFE, c.seed);
    if (world.bird.on) drawBird(g, world.bird.x, world.bird.y, world.bird.dir, world.bird.flap);
    drawBullets(g);
    S.fx.draw(g);
    // local aim arc and fuel
    const me = S.P[ctx.me];
    if (me.alive && ctx.phase === 'live') {
      const p = S.arc, n = p.n, lim = S.arcFull ? n : Math.min(n, 3 * 2);
      for (let i = 2; i < lim; i += 2) {
        if ((i >> 1) % 2) continue;
        g.fillStyle = i < 8 ? PAL.cream : (i >> 1) % 4 === 0 ? PAL.peach : PAL.coral;
        g.fillRect(Math.round(p[i]), Math.round(p[i + 1]), 1, 1);
      }
      if (S.arcFull && S.arcHit.x >= 0) { const x = Math.round(S.arcHit.x), y = Math.round(S.arcHit.y); g.fillStyle = PAL.coral; g.fillRect(x - 2, y - 2, 1, 1); g.fillRect(x + 2, y - 2, 1, 1); g.fillRect(x - 1, y - 1, 3, 3); g.fillRect(x - 2, y + 2, 1, 1); g.fillRect(x + 2, y + 2, 1, 1); g.fillStyle = PAL.cream; g.fillRect(x, y, 1, 1); }
      if (me.fuel < 0.995) {
        const bx = Math.round(me.x) - 11, by = Math.round(me.y) - 16, hh = Math.round(14 * me.fuel);
        g.fillStyle = PAL.ink; g.fillRect(bx - 1, by - 1, 4, 16);
        g.fillStyle = PAL.night; g.fillRect(bx, by, 2, 14);
        g.fillStyle = me.fuel < 0.25 ? PAL.coral : PAL.leaf; g.fillRect(bx, by + 14 - hh, 2, hh);
      }
      if (ctx.phase === 'live' && S.liveT < 6) drawMarker(g, playerOpts(me, ''), t);
    } else if (ctx.phase === 'intro' && S.introT >= 0 && me.alive) drawMarker(g, playerOpts(me, ''), t);
    if (sd && ctx.phase === 'live') {
      const foe = S.P[1 - ctx.me];
      if (foe.alive && ((t * 3) | 0) % 2 === 0) { playerOpts(foe, ''); o.col = PAL.coral; drawMarker(g, o, t); }
    }
    // bird warning: a flashing sign on the edge it will enter from
    const bd = world.bird;
    if (bd.warn > 0 && !bd.on && ((t * 6) | 0) % 2 === 0) {
      const x = bd.dir > 0 ? 6 : FW - 14, y = C.BIRD_Y - 22;
      g.fillStyle = PAL.ink; g.fillRect(x - 1, y - 1, 11, 13);
      g.fillStyle = PAL.coral; g.fillRect(x, y, 9, 11);
      g.fillStyle = PAL.cream; g.fillRect(x + 4, y + 2, 1, 5); g.fillRect(x + 4, y + 8, 1, 1);
    }
    if (sd) { g.fillStyle = dither(g, PAL.coral, 1 + Math.round(Math.sin(t * 5) * 0.5 + 0.5)); g.fillRect(0, 0, FW, 3); g.fillRect(0, FH - 3, FW, 3); }
  }

  function drawOverlay() {
    const g = og;
    g.clearRect(0, 0, FW, FH);
    const k = S.kill;
    // thermal gauge
    const u = clamp(world.U / 92, -1, 1), x0 = 112, y0 = 170;
    g.fillStyle = PAL.ink; g.fillRect(x0, y0, 96, 9);
    g.fillStyle = PAL.night; g.fillRect(x0 + 1, y0 + 1, 94, 7);
    drawText(g, 'LIFT', x0 + 4, y0 + 1, PAL.peach);
    const bx = x0 + 52, bw = 40;
    g.fillStyle = PAL.ink; g.fillRect(bx, y0 + 2, bw, 5);
    g.fillStyle = PAL.plum; g.fillRect(bx + 1, y0 + 3, bw - 2, 3);
    const half = (bw - 2) / 2, len = Math.round(Math.abs(u) * half);
    g.fillStyle = ctx.sudden ? PAL.plum : u >= 0 ? PAL.leaf : PAL.coral;
    if (u >= 0) g.fillRect(bx + 1 + half, y0 + 3, len, 3); else g.fillRect(bx + 1 + half - len, y0 + 3, len, 3);
    g.fillStyle = PAL.cream; g.fillRect(bx + 1 + half, y0 + 2, 1, 5);
    g.fillStyle = u >= 0 ? PAL.leaf : PAL.coral;
    drawText(g, u >= 0 ? '^' : 'v', x0 + 36, y0 + 1, g.fillStyle);
    // first-seconds tips
    if (ctx.phase === 'live' && S.liveT > 0.6 && S.liveT < 9.5) {
      const touch = ctx.input.device === 'touch';
      const msg = S.liveT < 4.6 ? 'SHOTS DROP: AIM HIGH' : touch ? 'TAP PRONE FOR A STEADY ARC' : 'HOLD RMB: PRONE + ARC';
      const w = textWidth(msg) + 8, x = Math.round((FW - w) / 2), y = 156;
      g.fillStyle = PAL.ink; g.fillRect(x, y, w, 11);
      g.fillStyle = PAL.night; g.fillRect(x + 1, y + 1, w - 2, 9);
      drawText(g, msg, FW / 2, y + 2, PAL.cream, 1, 'c');
    }
    // reticle
    const me = S.P[ctx.me];
    if (me.alive && ctx.phase === 'live') {
      let rx, ry;
      if (ctx.input.device === 'kbm') { rx = (ctx.input.pointerX - L.ox) / L.s; ry = (ctx.input.pointerY - L.oy) / L.s; }
      else { muzzle(playerOpts(me, ''), mz); rx = mz.sx + Math.cos(me.aim) * 56; ry = mz.sy + Math.sin(me.aim) * 56; }
      rx = Math.round(clamp(rx, 2, FW - 3)); ry = Math.round(clamp(ry, 2, FH - 3));
      const gap = me.st === 2 ? 2 : 4 + Math.round(me.sway * 220);
      const col = me.reload > 0 ? PAL.steel : PAL.cream;
      g.fillStyle = PAL.ink;
      g.fillRect(rx - gap - 4, ry - 1, 5, 3); g.fillRect(rx + gap, ry - 1, 5, 3); g.fillRect(rx - 1, ry - gap - 4, 3, 5); g.fillRect(rx - 1, ry + gap, 3, 5);
      g.fillStyle = col;
      g.fillRect(rx - gap - 3, ry, 3, 1); g.fillRect(rx + gap + 1, ry, 3, 1); g.fillRect(rx, ry - gap - 3, 1, 3); g.fillRect(rx, ry + gap + 1, 1, 3);
      g.fillStyle = me.st === 2 ? PAL.coral : PAL.ink; g.fillRect(rx, ry, 1, 1);
      if (me.reload > 0) { // the bolt cycles: a ring of dots fills
        const f = 1 - me.reload / (ctx.sudden ? C.SD_RELOAD : C.RELOAD), nd = 12;
        for (let i = 0; i < nd; i++) {
          const a = -Math.PI / 2 + (i / nd) * Math.PI * 2;
          g.fillStyle = i / nd < f ? PAL.coral : PAL.ink;
          g.fillRect(Math.round(rx + Math.cos(a) * 10), Math.round(ry + Math.sin(a) * 10), 1, 1);
        }
      } else if (S.readyT > 0) { ring(g, rx, ry, 9 - Math.round(S.readyT * 20), PAL.cream); }
    }
    // the kill banner: a dithered band slams in
    if (k && k.t > 0.1) {
      const u = Math.min(1, (k.t - 0.1) / 0.16), y = 50, h = 34;
      const slide = Math.round((1 - ease.outCubic(u)) * -FW);
      g.save();
      g.translate(slide, 0);
      g.fillStyle = dither(g, PAL.ink, 8); g.fillRect(0, y - 6, FW, 6); g.fillRect(0, y + h, FW, 6);
      g.fillStyle = dither(g, PAL.ink, 13); g.fillRect(0, y - 3, FW, 3); g.fillRect(0, y + h, FW, 3);
      g.fillStyle = PAL.ink; g.fillRect(0, y, FW, h);
      g.fillStyle = k.col; g.fillRect(0, y + 1, FW, 1); g.fillRect(0, y + h - 2, FW, 1);
      const sc = u < 1 ? 5 : 4, label = k.label, wd = textWidth(label, sc), ty = y + Math.round((h - 7 * sc) / 2);
      drawText(g, label, FW / 2 + 2, ty + 2, PAL.plum, sc, 'c');
      drawText(g, label, FW / 2, ty, PAL.cream, sc, 'c');
      g.restore();
    }
  }

  function bars(g, w, h) {
    g.fillStyle = PAL.ink; g.fillRect(0, 0, w, h);
    const ox = L.ox, oy = L.oy, dw = FW * L.s, dh = FH * L.s;
    if (ox < 3 && oy < 3) return;
    const cell = Math.max(2, Math.round(L.s));
    const key = cell + ':' + ((ctx.sudden ? 1 : 0));
    if (key !== barKey) {
      barKey = key;
      const { canvas, g: pg } = makeCanvas(cell * 4, cell * 4);
      pg.fillStyle = ctx.sudden ? PAL.rose : PAL.plum;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (bayer(x, y) < 4) pg.fillRect(x * cell, y * cell, cell, cell);
      barPat = g.createPattern(canvas, 'repeat');
    }
    g.fillStyle = PAL.night;
    g.fillRect(0, 0, w, h);
    g.fillStyle = barPat;
    g.save();
    g.beginPath(); g.rect(0, 0, w, h); g.rect(ox, oy, dw, dh);
    g.clip('evenodd');
    g.fillRect(0, 0, w, h);
    g.restore();
    // bezel rules
    g.fillStyle = PAL.rose;
    const e = Math.max(1, Math.round(L.s / 2));
    if (oy >= 3) { g.fillRect(ox, oy - e * 2, dw, e); g.fillRect(ox, oy + dh + e, dw, e); }
    if (ox >= 3) { g.fillRect(ox - e * 2, oy, e, dh); g.fillRect(ox + dw + e, oy, e, dh); }
    // marquee text in a tall bottom bar
    if (oy > 16 * L.s * 0.5 && oy > 28) {
      const k = Math.max(1, Math.floor(oy / 18));
      const y = oy + dh + (oy - 7 * k) / 2;
      drawText(g, 'CARTRIDGE CANYON', w / 2, y, PAL.peach, k, 'c', PAL.ink);
      drawText(g, '1P', ox + 6, y, S.P[0].col, k, 'l', PAL.ink);
      drawText(g, '2P', ox + dw - 6, y, S.P[1].col, k, 'r', PAL.ink);
    }
  }

  function composite() {
    const g = ctx.g, w = ctx.width, h = ctx.height;
    g.imageSmoothingEnabled = false;
    bars(g, w, h);
    const sx = L.cx - L.shx, sy = L.cy - L.shy;
    g.save();
    g.beginPath(); g.rect(L.ox, L.oy, FW * L.s, FH * L.s); g.clip();
    g.drawImage(fb.canvas, sx, sy, L.cw, L.ch, L.ox, L.oy, FW * L.s, FH * L.s);
    g.drawImage(ov.canvas, 0, 0, FW, FH, L.ox, L.oy, FW * L.s, FH * L.s);
    // scanlines (only where a pixel is big enough to carry them) and a faint phosphor stripe
    if (L.s >= 2.5) {
      g.fillStyle = 'rgba(20,12,40,0.17)';
      g.beginPath();
      for (let r = 0; r < FH; r++) g.rect(L.ox, L.oy + r * L.s + L.s * 0.7, FW * L.s, L.s * 0.3);
      g.fill();
    }
    if (!vig) {
      vig = makeCanvas(64, 36);
      const gr = vig.g.createRadialGradient(32, 18, 14, 32, 18, 40);
      gr.addColorStop(0, 'rgba(20,12,40,0)');
      gr.addColorStop(1, 'rgba(20,12,40,0.5)');
      vig.g.fillStyle = gr;
      vig.g.fillRect(0, 0, 64, 36);
    }
    g.imageSmoothingEnabled = true;
    g.drawImage(vig.canvas, L.ox, L.oy, FW * L.s, FH * L.s);
    g.imageSmoothingEnabled = false;
    if (S.flashW > 0) { g.fillStyle = `rgba(255,241,208,${S.flashW})`; g.fillRect(L.ox, L.oy, FW * L.s, FH * L.s); }
    g.restore();
    // rounded tube corners
    const r = 6 * L.s, x = L.ox, y = L.oy, ww = FW * L.s, hh = FH * L.s;
    g.fillStyle = PAL.ink;
    g.beginPath();
    g.rect(x - 1, y - 1, ww + 2, hh + 2);
    g.moveTo(x + r, y);
    g.arcTo(x, y, x, y + r, r); g.lineTo(x, y + hh - r); g.arcTo(x, y + hh, x + r, y + hh, r); g.lineTo(x + ww - r, y + hh);
    g.arcTo(x + ww, y + hh, x + ww, y + hh - r, r); g.lineTo(x + ww, y + r); g.arcTo(x + ww, y, x + ww - r, y, r); g.closePath();
    g.fill('evenodd');
  }

  return {
    layout, toCssX, toCssY, L,
    render() {
      layout();
      drawWorld();
      drawOverlay();
      composite();
    },
    /** CSS position of an arena point (for aiming and for the core's focus point). */
    toCss(x, y, out) { out.x = toCssX(x); out.y = toCssY(y); return out; },
    dispose() { vig = null; barPat = null; },
  };
}
export { lerp };
