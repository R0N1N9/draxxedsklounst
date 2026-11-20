// CONTINUE? — the arcade game-over screen.
//
// CONCEPT
//   Every point ends with the old world's cabinet going dark. The frozen last frame drains to
//   greyscale and crunches down into fat pixels behind a curving CRT; a target ring pins the
//   impact point ("<loser> DOWN"); then huge lettering — GAME OVER — falls in letter by letter and
//   lands. The classic taunt follows: CONTINUE? and a heartbeat countdown, a high-score table
//   with the REAL match score and both snipers' names, a bonus tally for the round just played
//   rattling up in the winner's colour, and a glowing coin slot. At the last moment a coin spins
//   through the air in slow motion — and something goes wrong, or nearly — before it drops in:
//   CREDIT 1, PLAYER <loser> CONTINUES. A stage card in the NEW world's palette — STAGE n, its name
//   and perspective over a hyperspace starfield or a rolling checkerboard — wipes across, READY?
//   flashes (that flash is the swap), and the new world arrives through an arcade wipe.
//   If the round was a draw: DRAW GAME, BOTH PLAYERS CONTINUE, two coins, two slots.
//
// BEAT SHEET (12.0 s, swap at 9.0 s)
//   0.00         the old world, untouched (the cut in is invisible)
//   0.00 → 0.74  ACT 1 · the kill: impact flash, the picture drains and crunches in seven rungs
//                (pixels ×0 … ×8), the tube curves in, tearing and a chromatic kick
//   0.10 → 1.60  the target ring locks on the impact point: "<loser> DOWN" and how
//   0.52 → 1.60  GAME OVER drops in letter by letter over the crunched world and lands
//   0.90 → 2.00  the cabinet's backdrop closes over the old world
//   1.62 → 2.20  the headline climbs to the top; the panels slide in; CONTINUE? flickers on
//   1.95 → 4.37  the count, 9 … 2, quickening like a pulse; tally rows rattle up, the table fills
//   3.87 → 6.3   "1" and the coin. It is tossed at 3.87; from 4.25 the camera DIVES at the slot (the
//                close-up, up to 2.35x) and the gag plays out in it: rim hop | glove fumble | freeze;
//                a beam of light out of the slit, motes, a contact shadow, a lens streak, a vignette
//   5.9 → 6.7    the coin drops in (the camera pulls back): bing-ding, CREDIT 1, PLAYER <loser> CONTINUES
//   7.00 → 7.40  the cabinet powers down: picture to a line, line to a dot
//   7.40 → 7.95  ACT 2 · the stage card's bands open on black (the card's dressing only)
//   7.86 → 8.7   STAGE n slams in, the name slides, perspective and tagline fade up
//   8.20 → 9.00  READY? flashes and the screen whites out;  9.00  THE SWAP, held on white
//   9.10 → 9.30  the flash decays on the card, which now says GO!
//   9.33 → 10.95 ACT 3 · the arcade wipe (pixel dissolve | venetian blinds | diamonds) opens the
//                live new world, rim-lit in its accent
//   11.0 → 11.9  the phosphor glass fades off the picture; the overlay ends fully clear
//
// COST: the screen layer is one canvas of ~1.5 M texels re-uploaded per frame; hero lettering is
// struck once per (style, glyph, size) and blitted; the crunched world is baked once into a tiny
// texture so the shader reads it with one tap; the chromatic kick only splits the screen layer.
//
// AXES OF VARIATION (all drawn once from ctx.rng, see continue/script.js)
//   1. the cabinet's era: 80s vector (neon strokes, phosphor colour) | 90s chrome (extruded
//      lettering, gold panels, sunburst) | 2000s gloss (jelly letters, glass panels, bokeh) —
//      backdrop, panels, lettering, the old world's grade and the glass all change
//   2. the coin gag: it hits the rim and hops in | a glove fumbles it | the count freezes at 1
//      while it hangs — and the coin's metal (gold, silver, copper, or a token in the loser's colour),
//      its side of entry, spin and tilt
//   3. the wipe: pixel dissolve | venetian blinds | diamonds (grid, direction, stagger)
//   4. the stage card: hyperspace starfield | checkerboard floor with a sun; bands | columns reveal
//   5. the words: taunt, READY? line, STAGE | LEVEL, which bonus lines are tallied (comeback,
//      opening shot, match point, a quip), the table's ghost names, the letters' fall order/spin
//
// CONTEXT
//   ctx.loser / winner  names and colours everywhere: the target tag, GAME OVER's name line, the
//                       blinking name, the digit's tint, the slot's neon, the glove; the tally
//                       and the table in the winner's colour
//   ctx.how / score / matchPoint / round   STYLE line, DISTANCE when the label is a range, the high
//                       score table, MATCH POINT bonus, ROUND n CLEARED, STAGE n+1
//   ctx.focus           the target ring and the tag
//   ctx.fromImage       crunched, drained, tinted and dimmed behind the dressing
//   ctx.to              palette (starfield / floor / lettering / flash / wipe rim), name,
//                       perspective, tagline on the stage card; the destination also bleeds in
//   a draw              DRAW GAME, no loser: both snipers' names, two slots, two coins
import { seg, ease, clamp, lerp, hexToRgb, mixHex, shade, rgba, makeCanvas, fullscreenPass, TAU } from '../kit.js';
import { heroLayout, drawBits } from './continue/font.js';
import { makeLook, drawHero, setHeroRes, clearHeroSprites } from './continue/looks.js';
import { drawCoin, drawHand, drawSlot, drawRing, drawBurst, drawShock, drawBeam, drawStreak } from './continue/props.js';
import { buildGag } from './continue/gags.js';
import { drawSpace, drawCard, cardReveal } from './continue/stagecard.js';
import { makePlan, T, DURATION, SWAP_AT, SWAP } from './continue/script.js';
import { FRAG } from './continue/shader.js';

const rgb01 = (hex) => { const c = hexToRgb(hex); return [c.r / 255, c.g / 255, c.b / 255]; };
const RUNGS = [0, 0.12, 0.25, 0.4, 0.6, 0.8, 1];
const WIPE_ID = { pixel: 1, blinds: 2, diamond: 3 };
const SLOT_Y = 48.4;

export default {
  id: 'continue',
  name: 'CONTINUE?',
  duration: DURATION,
  swapAt: SWAP_AT,

  create(ctx) {
    const { THREE, renderer } = ctx.three;
    const A = ctx.audio;
    const plan = makePlan(ctx, ctx.rng);
    const pal = ctx.to.palette;

    // --- GPU ---------------------------------------------------------------------------------------
    const scr = makeCanvas(16, 16);
    const g = scr.g;
    // srgb: false throughout — the shader hands texels straight back, so frame 0 is the old world to the bit.
    const texFrom = new THREE.CanvasTexture(ctx.fromImage);
    texFrom.colorSpace = THREE.NoColorSpace;
    texFrom.generateMipmaps = false;
    texFrom.minFilter = texFrom.magFilter = THREE.LinearFilter;
    const texScr = new THREE.CanvasTexture(scr.canvas);
    texScr.colorSpace = THREE.NoColorSpace;
    texScr.premultiplyAlpha = true; // the canvas is premultiplied already: upload it as it is
    texScr.generateMipmaps = true; // the mips are the bloom
    texScr.minFilter = THREE.LinearMipmapLinearFilter;
    texScr.magFilter = THREE.LinearFilter;
    texScr.wrapS = texScr.wrapT = THREE.ClampToEdgeWrapping;
    // Once the old world has finished crunching it is one fixed picture of fat pixels: it is struck
    // once into a tiny canvas (one texel per fat pixel) and the shader then reads it with a single tap.
    const bake = makeCanvas(2, 2);
    const texBake = new THREE.CanvasTexture(bake.canvas);
    texBake.colorSpace = THREE.NoColorSpace;
    texBake.generateMipmaps = false;
    texBake.minFilter = texBake.magFilter = THREE.NearestFilter;
    texBake.wrapS = texBake.wrapT = THREE.ClampToEdgeWrapping;
    const look = makeLook(g, plan.era, plan);
    const fx = look.fx;
    const V2 = () => new THREE.Vector2(), V3 = (c) => new THREE.Vector3(c[0], c[1], c[2]);
    const accent3 = rgb01(pal.accent);
    const flashCol = V3(rgb01(mixHex(pal.accent, '#ffffff', 0.85)));
    const pass = fullscreenPass(THREE, {
      fragmentShader: FRAG,
      uniforms: {
        tFrom: { value: texFrom }, tScr: { value: texScr }, tBake: { value: texBake },
        uRes: { value: V2() }, uShake: { value: V2() }, uDpr: { value: 1 }, uTime: { value: 0 },
        uCell: { value: 0 }, uBaked: { value: 0 }, uDesat: { value: 0 }, uDim: { value: 1 }, uTintAmt: { value: 0 }, uLevels: { value: fx.levels }, uWorldOn: { value: 1 },
        uLo: { value: V3(rgb01(fx.lo)) }, uHi: { value: V3(rgb01(fx.hi)) },
        uCrt: { value: 0 }, uCurve: { value: fx.curve }, uScan: { value: fx.scan }, uBloom: { value: 0 }, uMask: { value: fx.mask }, uKick: { value: 0 }, uGlitch: { value: 0 }, uFlash: { value: 0 },
        uFlashCol: { value: flashCol }, uRim: { value: V3(accent3) },
        uWipe: { value: 0 }, uWipeType: { value: 0 }, uWipeSeed: { value: plan.wipeSeed }, uWipeDir: { value: 0 }, uWipeGrid: { value: plan.wipeGrid }, uTail: { value: 1 },
      },
    });

    // --- the screen layer -----------------------------------------------------------------------------
    // Design units: 100 wide, 56.25 tall. U is CSS pixels per unit (sizes, widths); on a taller screen
    // (4:3 iPads, 16:10 laptops) the vertical positions stretch by K instead of leaving bars (UY = U * K).
    const F = { W: 1, H: 1, U: 1, K: 1, UY: 1, ox: 0, oy: 0, sc: 1, scY: 1 };
    function layout() {
      const w = Math.max(2, ctx.width), h = Math.max(2, ctx.height);
      // Soft is in character, and the texture is re-uploaded every frame (the costly part on an iPad):
      // a budget of about a million and a half texels, however large the screen.
      const s = Math.min(ctx.dpr, Math.sqrt(1.5e6 / (w * h)));
      const SW = Math.max(2, Math.round(w * s)), SH = Math.max(2, Math.round(h * s));
      if (SW !== scr.canvas.width || SH !== scr.canvas.height) {
        scr.canvas.width = SW;
        scr.canvas.height = SH;
        texScr.dispose(); // its storage was allocated for the old size
      }
      F.W = w; F.H = h; F.sc = SW / w; F.scY = SH / h;
      F.U = Math.min(w / 100, h / 56.25);
      F.K = clamp(h / F.U / 56.25, 1, 1.4);
      F.UY = F.U * F.K;
      F.ox = (w - 100 * F.U) / 2;
      F.oy = (h - 56.25 * F.UY) / 2;
      setHeroRes(F.sc);
    }
    const X = (u) => F.ox + u * F.U, Y = (v) => F.oy + v * F.UY;

    // The crunched world, struck once (see texBake). Same size rule as the shader's last rung.
    let bakedW = 0, bakedH = 0;
    function ensureBake() {
      const cell = Math.max(1.5, F.H / 110);
      const gw = Math.max(2, Math.round(F.W / cell)), gh = Math.max(2, Math.round(F.H / cell));
      if (gw === bakedW && gh === bakedH) return;
      bakedW = gw; bakedH = gh;
      bake.canvas.width = gw;
      bake.canvas.height = gh;
      texBake.dispose();
      bake.g.imageSmoothingEnabled = true;
      bake.g.imageSmoothingQuality = 'high';
      bake.g.drawImage(ctx.fromImage, 0, 0, gw, gh);
      texBake.needsUpdate = true;
    }

    // Dot-matrix text at unit coordinates; cu is the dot size in units. Dots are whole device pixels.
    function bitsPx(str, x, y, cu, color, align = 'l', shadow = true, maxWpx = 0) {
      str = String(str);
      let cell = Math.max(2, Math.floor(cu * F.U * F.sc + 0.25));
      if (maxWpx > 0) cell = Math.max(2, Math.min(cell, Math.floor((maxWpx * F.sc) / Math.max(1, str.length * 6 - 1))));
      return drawBits(g, str, x, y, cell / F.sc, color, align, shadow && look.shadow ? look.shadow : null, F.sc);
    }
    const bits = (str, xu, yu, cu, color, align = 'l', shadow = true, maxWu = 0) => bitsPx(str, X(xu), Y(yu), cu, color, align, shadow, maxWu * F.U);
    const cellFor = (cu) => Math.max(2, Math.floor(cu * F.U * F.sc + 0.25));
    const dotsU = (cell) => cell / (F.U * F.sc); // a device-pixel dot size back in units

    // --- the coin gags -----------------------------------------------------------------------------------
    const gags = [];
    if (plan.draw) {
      gags.push({ ...buildGag(plan.gag, plan.side, 26, SLOT_Y, T.gag0, plan.tilt0, plan.flips), sx: 26, col: plan.slots[0].col, metal: plan.metal });
      gags.push({ ...buildGag(plan.gag === 'freeze' ? 'rim' : 'freeze', -plan.side, 74, SLOT_Y, T.gag0 + 0.18, -plan.tilt0, plan.flips + 1), sx: 74, col: plan.slots[1].col, metal: plan.metalB });
    } else {
      gags.push({ ...buildGag(plan.gag, plan.side, 50, SLOT_Y, T.gag0, plan.tilt0, plan.flips), sx: 50, col: plan.slots[0].col, metal: plan.metal });
    }
    const tIn = Math.max(...gags.map((q) => q.tIn));
    const tInAll = tIn;

    // --- cabinet shake and kicks (closed form, so any t renders the same) ---------------------------------------
    const landT = [];
    const hdText = plan.draw ? 'DRAW GAME' : 'GAME OVER';
    const hdGlyphs = heroLayout(hdText).glyphs.length;
    for (let i = 0; i < hdGlyphs; i++) landT.push(T.over0 + i * 0.07 + plan.letter[i % 12].d + 0.226);
    const shakeEv = [[0.03, 0.55, 8]];
    const kickEv = [[0.03, 9, 10]];
    landT.forEach((lt, i) => { const a = i === hdGlyphs - 1 ? 0.8 : 0.3; shakeEv.push([lt, a, 8]); kickEv.push([lt, i === hdGlyphs - 1 ? 5 : 2.5, 14]); });
    T.digitT.forEach((dt, i) => { shakeEv.push([dt, 0.1 + i * 0.018, 12]); kickEv.push([dt, 1.2 + i * 0.25, 16]); });
    shakeEv.push([T.one, 0.28, 8]);
    kickEv.push([T.one, 4, 8]);
    for (const q of gags) for (const h of q.hits) { shakeEv.push([h.t, 0.3, 10]); kickEv.push([h.t, 3, 14]); }
    shakeEv.push([tInAll, 0.8, 7], [T.swap, 1.2, 6], [T.wipe0, 0.4, 7]);
    kickEv.push([tInAll, 6, 10], [T.swap, 12, 8]);

    // --- time helpers ------------------------------------------------------------------------------------------
    const phaseOf = (t) => 0.45 * t + 0.55 * Math.pow(Math.max(0, t - T.cardIn0), 2);
    const clamp01s = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
    function digitAt(t) {
      if (t < T.dig0 || t >= tIn) return null;
      for (let k = 0; k < T.digitT.length; k++) {
        const gap = T.digitGap[k], tau = t - T.digitT[k];
        if (tau < gap) return { n: 9 - k, tau, ring: 1 - tau / gap };
      }
      const tau = t - T.one;
      let ring;
      if (plan.gag === 'freeze' && !plan.draw) ring = 1 - 0.8 * ease.outQuad(seg(tau, 0, 0.9));
      else ring = 1 - 0.94 * clamp01s(tau / (tIn - T.one));
      return { n: 1, tau, ring, one: true };
    }
    const hash = (n) => { const s = Math.sin(n * 12.9898 + plan.shakeSeed) * 43758.5453; return s - Math.floor(s); };

    // --- the close-up -----------------------------------------------------------------------------------------------
    // While the coin is in the air the camera dives at the slot: the whole picture is drawn through one
    // transform, so the coin, the glove and the plate arrive at three times their size, crisp (all vector).
    // The gag's own geometry is in units relative to the slot, so it keeps its proportions on tall screens.
    const GY = (v) => Y(SLOT_Y) + (v - SLOT_Y) * F.U;
    const CAM = plan.draw ? { z: 1.34, x: 50, y: 41 } : gags[0].cam;
    const camT = (t) => ease.inOutCubic(seg(t, T.gag0 + 0.38, T.gag0 + 1.2)) * (1 - ease.inOutCubic(seg(t, tIn + 0.04, tIn + 0.5)));
    const camK = camT;
    function camZ(t) {
      let punch = 0;
      for (const q of gags) for (const h of q.hits) { const tau = t - h.t; if (tau > 0 && tau < 0.6) punch += Math.exp(-tau * 9) * Math.cos(tau * 22); }
      return 1 + (CAM.z - 1) * camT(t) + 0.08 * punch * camT(t);
    }
    // The point of the picture that the close-up centres on: lerps from where it already is to the screen centre.
    const camFocus = () => [X(CAM.x), GY(CAM.y)];

    // =============================================================================================================
    // PAINT: the dressing (before the card), the card, the reveal
    // =============================================================================================================
    function headline(t, ck = 1) {
      const { U } = F;
      const L0 = heroLayout(hdText);
      const S0 = Math.min(1.5 * U, (80 * U) / (L0.width + 2.4));
      const kS = ease.inOutCubic(seg(t, T.shift0, T.shift1));
      const S = S0 * lerp(1, 0.55, kS);
      const cy = lerp(Y(27.2), Y(6.4), kS);
      const st = look.style('main', null);
      const shine = t > 1.2 ? ((t - 1.25) % 2.4) / 1.1 : 0;
      drawHero(g, st, hdText, F.W / 2, cy, S, {
        alpha: ck, ref: S0,
        shine: shine > 0 && shine < 1 ? shine : undefined,
        glyph: (i) => {
          const pl = plan.letter[i % 12];
          const k = seg(t, T.over0 + i * 0.07 + pl.d, T.over0 + i * 0.07 + pl.d + 0.62);
          const b = ease.outBounce(k);
          const settle = t > T.shift1 ? Math.sin(t * 2.2 + i * 0.7) * 0.02 * U : 0;
          return { dy: -(1 - b) * (cy + 3 * U) + settle, dx: pl.x * (1 - b) * U, rot: pl.r * (1 - b), a: k > 0 ? Math.min(1, k * 10) : 0 };
        },
      });
      // Land sparks at each letter.
      const L = heroLayout(hdText), x0 = F.W / 2 - (L.width * S) / 2;
      for (let i = 0; i < L.glyphs.length; i++) {
        const tau = t - landT[i];
        if (tau > 0 && tau < 0.5) drawBurst(g, plan.sparkLand, x0 + (L.glyphs[i].x + L.glyphs[i].w / 2) * S, cy + 3.6 * S, tau, U * 0.5, 0.5);
      }
      // Under it: who.
      const subY = lerp(Y(37.2), Y(10.0), kS), cu = lerp(0.8, 0.5, kS);
      const k = seg(t, 1.2, 1.7);
      const blink = t < T.dig0 || t >= tIn || ((Math.floor(t * 3.4) & 1) === 0);
      if (k > 0 && blink) {
        const sub = plan.draw ? 'BOTH PLAYERS CONTINUE' : `PLAYER ${plan.loserName}`;
        const n = Math.max(1, Math.floor(k * sub.length * 1.2));
        g.globalAlpha = ck;
        bitsPx(sub.slice(0, n), F.W / 2, subY, cu, plan.draw ? look.hi : plan.loseCol, 'c', true, F.W * 0.7);
        g.globalAlpha = 1;
      }
    }

    function targetTag(t) {
      const fk = seg(t, 0.08, 0.5), fo = 1 - seg(t, 1.05, 1.55);
      if (fk <= 0 || fo <= 0.01) return;
      const { U } = F;
      const fx0 = ctx.focus.x, fy0 = ctx.focus.y;
      const r = lerp(U * 11, U * 2.8, ease.outCubic(fk));
      g.save();
      g.globalAlpha = fo;
      g.strokeStyle = plan.loseCol;
      g.lineWidth = Math.max(1.5, U * 0.24);
      g.beginPath();
      g.arc(fx0, fy0, r, 0, TAU);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + (1 - fk) * 1.6;
        g.moveTo(fx0 + Math.cos(a) * (r - U * 1.2), fy0 + Math.sin(a) * (r - U * 1.2));
        g.lineTo(fx0 + Math.cos(a) * (r + U * 1.8), fy0 + Math.sin(a) * (r + U * 1.8));
      }
      g.stroke();
      if (fk >= 1 && (Math.floor(t * 9) & 1) === 0) { g.fillStyle = plan.loseCol; g.fillRect(fx0 - U * 0.3, fy0 - U * 0.3, U * 0.6, U * 0.6); }
      const right = fx0 < F.W * 0.55;
      const lx = right ? fx0 + r + U * 1.8 : fx0 - r - U * 1.8, al = right ? 'l' : 'r';
      const ly = Math.min(Math.max(fy0 - U * 2.4, F.oy + U * 1), F.H - U * 8);
      const lab = plan.draw ? 'NO CONTEST' : `${plan.loserName} DOWN`;
      if (fk > 0.55) {
        bitsPx(lab, lx, ly, 0.55, plan.loseCol, al, true, F.W * 0.4);
        bitsPx(`${plan.tally[1].value}!`, lx, ly + U * 4.4, 0.42, look.hi, al, true, F.W * 0.4);
      }
      g.restore();
    }

    function panels(t) {
      const { U, UY } = F;
      const dim = 1 - 0.9 * camK(t);
      const kL = ease.outCubic(seg(t, 1.72, 2.3)) - ease.inQuad(seg(t, tIn + 0.05, tIn + 0.4)), kR = ease.outCubic(seg(t, 1.84, 2.42)) - ease.inQuad(seg(t, tIn + 0.1, tIn + 0.45));
      const pw = 35, ph = 23.6, py = 21.2;
      // High scores.
      {
        const x = X(2.0) - (1 - kL) * U * 40, y = Y(py), w = pw * U, h = ph * UY;
        look.panel(g, x, y, w, h, plan.winCol, U, dim * (kL > 0 ? 1 : 0));
        if (kL > 0.6) {
          const innerW = (pw - 3.6) * U, rows = plan.table;
          // One dot size for the whole table, as large as the longest name allows (long names are clipped).
          const nameN = clamp(Math.max(...rows.map((r) => r.name.length)), 6, 10);
          const cs = Math.max(2, Math.min(cellFor(0.4), Math.floor((innerW * F.sc) / ((nameN + 7) * 6))));
          const cu = dotsU(cs), cw = cs / F.sc;
          const names = rows.map((r) => (r.name.length > nameN ? r.name.slice(0, nameN - 1) + '.' : r.name));
          const lx = x + U * 1.8, rx = x + w - U * 1.8;
          bitsPx('HIGH SCORES', x + w / 2, y + UY * 1.3, cu * 1.1, look.hi, 'c', true, innerW);
          const RANK = ['1ST', '2ND', '3RD', '4TH', '5TH'];
          for (let i = 0; i < rows.length; i++) {
            const ka = seg(t, 2.0 + i * 0.1, 2.2 + i * 0.1);
            if (ka <= 0) continue;
            const r = rows[i], yy = y + UY * (4.9 + i * 3.0);
            g.globalAlpha = dim * ka;
            if (r.win) {
              g.fillStyle = rgba(r.col, 0.16 + 0.1 * Math.sin(t * 9));
              g.fillRect(x + U * 0.8, yy - U * 0.5, w - U * 1.6, cw * 7 + U * 1);
            }
            const col = r.real ? r.col : look.dim;
            bitsPx(RANK[i], lx, yy, cu, r.real ? look.hi : look.dim, 'l', true);
            bitsPx(names[i], lx + 4 * 6 * cw, yy, cu, col, 'l', true);
            bitsPx(String(r.pts).padStart(2, '0'), rx, yy, cu, r.real ? look.ink : look.dim, 'r', true);
          }
          g.globalAlpha = dim;
          const foot = ctx.matchPoint && (Math.floor(t * 3) & 1) === 0 ? 'MATCH POINT!' : `FIRST TO ${ctx.target}`;
          bitsPx(foot, x + w / 2, y + UY * (4.9 + 5 * 3.0 + 0.3), cu, ctx.matchPoint ? plan.winCol : look.dim, 'c', true, innerW);
          g.globalAlpha = 1;
        }
      }
      // The round's bonus tally.
      {
        const x = X(100 - 2.0 - pw) + (1 - kR) * U * 40, y = Y(py), w = pw * U, h = ph * UY;
        look.panel(g, x, y, w, h, plan.winCol, U, dim * (kR > 0 ? 1 : 0));
        if (kR > 0.6) {
          const innerW = (pw - 3.6) * U, lines = plan.tally;
          const valueOf = (ln) => ln.value || (ln.pts ? `+${ln.pts}` : '0');
          // The dot size is set by the widest line, so a long label never forces the rest tiny.
          let chars = 14;
          for (const ln of lines) chars = Math.max(chars, ln.label.length + 1 + Math.min(10, valueOf(ln).length));
          const cs = Math.max(2, Math.min(cellFor(0.4), Math.floor((innerW * F.sc) / (Math.min(chars, 24) * 6))));
          const cu = dotsU(cs);
          const lx = x + U * 1.8, rx = x + w - U * 1.8;
          bitsPx(plan.draw ? `ROUND ${ctx.round} DRAWN` : `ROUND ${ctx.round} BONUS`, x + w / 2, y + UY * 1.3, cu * 1.1, look.hi, 'c', true, innerW);
          const t0 = 2.42;
          g.globalAlpha = dim;
          for (let i = 0; i < lines.length; i++) {
            const ts = t0 + i * 0.27, ka = seg(t, ts, ts + 0.12);
            if (ka <= 0) continue;
            const ln = lines[i], yy = y + UY * (4.9 + i * 3.0);
            bitsPx(ln.label, lx, yy, cu, look.ink, 'l', true);
            // The value rattles: random digits until it locks.
            const lock = ts + 0.5;
            let v = valueOf(ln);
            if (ln.label === 'MERCY' && !plan.draw) v = '0';
            if (t < lock && /\d/.test(v)) {
              const fr = Math.floor(t * 34);
              v = v.replace(/\d/g, (d, k) => String(Math.floor(hash(fr * 7 + k + i * 13) * 10)));
            } else if (t < lock) v = v.slice(0, Math.max(1, Math.floor(((t - ts) / 0.5) * v.length)));
            bitsPx(v, rx, yy, cu, plan.winCol, 'r', true, innerW * 0.62);
          }
          // Total, counting up.
          const ts = t0 + lines.length * 0.27 + 0.1, kt = seg(t, ts, ts + 0.9);
          if (kt > 0) {
            const yy = y + UY * (4.9 + 5 * 3.0 + 0.3);
            g.fillStyle = rgba(plan.winCol, 0.7);
            g.fillRect(lx, yy - U * 0.9, rx - lx, Math.max(1, U * 0.14));
            bitsPx(plan.draw ? 'NO BONUS' : 'BONUS', lx, yy, cu * 1.1, look.hi, 'l', true);
            const total = Math.round(plan.tallyTotal * ease.outQuad(kt));
            bitsPx(`+${total}`, rx, yy, cu * 1.1, plan.winCol, 'r', true, innerW * 0.6);
          }
          g.globalAlpha = 1;
        }
      }
    }

    function countdown(t, ck = 1) {
      const { U } = F;
      const kd = Math.min(1.25, F.K); // the dial grows a little on a tall screen
      const cx = X(50);
      const ek = seg(t, tIn, tIn + 0.25);
      // CONTINUE?
      const lk = seg(t, 1.95, 2.2);
      if (lk > 0 && ek < 1) {
        const flick = lk < 1 ? ((Math.floor(t * 30) & 1) ? 1 : 0.25) : 1;
        const S = Math.min(0.5 * U, (30 * U) / (heroLayout('CONTINUE?').width + 2.4));
        drawHero(g, look.style('main', null), 'CONTINUE?', cx, Y(18.2), S, { alpha: flick * (1 - ek) * ck });
      }
      const d = digitAt(t);
      if (!d) return;
      const cy = Y(33.4), R = U * 7.4 * kd;
      const open = ease.outCubic(seg(t, T.dig0 - 0.15, T.dig0 + 0.2));
      let pop, flick = 1, jx = 0, jy = 0;
      if (!d.one) {
        pop = 1 + 0.32 * Math.exp(-d.tau * 9) * Math.cos(d.tau * 14);
        const ts = d.tau;
        drawShock(g, cx, cy, R * (1 + ts * 1.5), 0.55 * Math.exp(-ts * 6) * open, plan.loseCol, U * 0.3);
      } else {
        const ph = d.tau % 0.95;
        pop = 1 + 0.16 * Math.exp(-ph * 5) + 0.3 * Math.exp(-d.tau * 9) * Math.cos(d.tau * 14);
        drawShock(g, cx, cy, R * (1 + ph * 0.5), 0.35 * Math.exp(-ph * 3.5), plan.loseCol, U * 0.26);
        if (plan.gag === 'freeze' && !plan.draw && d.tau > 0.9) {
          // The count has stopped: the ring stutters, the digit trembles.
          jx = (hash(Math.floor(t * 40)) - 0.5) * U * 0.2;
          jy = (hash(Math.floor(t * 40) + 5) - 0.5) * U * 0.2;
          flick = (Math.floor(t * 6) & 1) ? 1 : 0.55;
        }
      }
      const glow = 0.7 + 0.3 * Math.sin(t * 14);
      const S1 = 1.18 * U * kd, ref = S1 * 1.5;
      g.save();
      g.globalAlpha = open * (1 - ek);
      // The digit that just left blows outward like a ghost.
      if (!d.one && d.tau < 0.26 && d.n < 9) {
        const kk = d.tau / 0.26;
        g.globalAlpha = open * (1 - ek) * 0.3 * (1 - kk) * (1 - kk);
        drawHero(g, look.style('main', plan.loseCol), String(d.n + 1), cx, cy, S1 * (1.1 + 0.8 * ease.outCubic(kk)), { ref });
        g.globalAlpha = open * (1 - ek);
      }
      // Each beat lights the dial from behind.
      {
        const beat = d.one ? Math.exp(-(d.tau % 0.95) * 4) * 0.6 : Math.exp(-d.tau * 6);
        const gl2 = g.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.7);
        gl2.addColorStop(0, rgba(plan.loseCol, 0.42 * beat));
        gl2.addColorStop(1, rgba(plan.loseCol, 0));
        g.save();
        g.globalAlpha = open * (1 - ek);
        g.fillStyle = gl2;
        g.fillRect(cx - R * 1.8, cy - R * 1.8, R * 3.6, R * 3.6);
        g.restore();
      }
      drawRing(g, cx + jx, cy + jy, R, d.ring, plan.loseCol, U * 0.5, glow);
      const S = S1 * pop * (1 + 0.3 * ek) * (0.6 + 0.4 * open);
      drawHero(g, look.style('main', plan.loseCol), String(d.n), cx + jx, cy + jy, S, { alpha: flick, ref });
      g.restore();
    }

    function slots(t) {
      const { U } = F;
      const open = ease.outCubic(seg(t, 1.9, 2.4));
      if (open <= 0) return;
      const wU = plan.draw ? 40 : 44, dy = (1 - open) * U * 14;
      for (let i = 0; i < gags.length; i++) {
        const q = gags[i], sx = X(q.sx), sy = Y(SLOT_Y) + dy;
        const since = t - q.tIn;
        const flash = since > 0 ? Math.exp(-since * 5) : 0;
        const light = since > 0 ? 1 : 0.55 + 0.35 * Math.sin(t * 6 + i);
        drawSlot(g, plan.era, sx, sy, U, wU, q.col, t, light, flash, look.ph);
        const done = since > 0;
        const on = done || (Math.floor(t * 2.8) & 1) === 0 || t < T.dig0;
        if (on) {
          const l = done ? 'THANK' : plan.draw ? plan.slots[i].name.slice(0, 7) : 'INSERT', r = done ? 'YOU!' : 'COIN';
          const cu = 0.4;
          bitsPx(l, sx - U * 3.4, sy - cellFor(cu) / F.sc * 3.5, cu, done ? look.hi : q.col, 'r', true, U * (wU / 2 - 5));
          bitsPx(r, sx + U * 3.4, sy - cellFor(cu) / F.sc * 3.5, cu, done ? look.hi : q.col, 'l', true, U * (wU / 2 - 5));
        }
      }
    }

    // What the close-up adds: a beam of light out of the slit, motes drifting through it, the coin's
    // contact shadow on the plate, and (at the peak of its glint) a lens streak.
    function closeFx(t) {
      const k = camT(t);
      if (k < 0.01) return;
      const { U } = F;
      const plateTop = SLOT_Y - 3.2;
      for (let gi = 0; gi < gags.length; gi++) {
        const q = gags[gi];
        const since = t - q.tIn;
        const beat = 0.5 + 0.5 * Math.sin(t * 5.5 + gi);
        let a = k * (0.2 + 0.1 * beat);
        if (since > 0) a += 0.7 * Math.exp(-since * 4);
        drawBeam(g, X(q.sx), GY(plateTop), U * 34, U * 28, q.col, a);
        g.fillStyle = '#ffffff';
        for (let i = 0; i < 20; i++) {
          const h1 = hash(i * 3.17 + gi), h2 = hash(i * 7.31 + 2 + gi), h3 = hash(i * 1.93 + 5);
          const rise = ((h2 * 30 + t * (1.6 + h3 * 2.2)) % 30) / 30;
          const x = q.sx + (h1 - 0.5) * (6 + rise * 30), y = plateTop - rise * 30;
          g.globalAlpha = k * (1 - rise) * (0.25 + 0.5 * Math.abs(Math.sin(t * 6 + i)));
          const s = U * (0.12 + h3 * 0.2);
          g.fillRect(X(x) - s / 2, GY(y) - s / 2, s, s);
        }
        g.globalAlpha = 1;
        const p = q.pos(t);
        if (p && t < q.tSlide) {
          const gap = plateTop - (p.y + p.r);
          if (gap > -1 && gap < 9) {
            const fk = clamp01s(1 - Math.max(0, gap) / 9);
            g.fillStyle = `rgba(0,0,0,${0.4 * fk})`;
            g.beginPath();
            g.ellipse(X(p.x), GY(plateTop) + U * 0.2, p.r * U * (0.5 + 0.6 * fk), p.r * U * 0.16 * (0.5 + 0.5 * fk), 0, 0, TAU);
            g.fill();
          }
        }
      }
    }

    function props(t) {
      const { U } = F;
      const k = camT(t);
      for (let gi = 0; gi < gags.length; gi++) {
        const q = gags[gi];
        if (q.hand) {
          const h = q.hand(t);
          if (h && h.a > 0) drawHand(g, X(h.x), GY(h.y), U * 5.6, h.rot, gi ? plan.slots[1].col : plan.loseCol === '#ffffff' ? '#f2b35b' : plan.loseCol, h.curl, 1);
        }
        for (let kk = 3; kk >= 0; kk--) {
          const tt = t - kk * 0.045, p = q.pos(tt);
          if (!p) continue;
          g.save();
          if (tt >= q.tSlide) {
            g.beginPath();
            g.rect(0, 0, F.W, GY(q.slitTop));
            g.clip();
          }
          const sh = ((tt - T.gag0) * 0.85) % 1.7;
          drawCoin(g, X(p.x), GY(p.y), p.r * U, p.phi, p.tilt, q.metal, sh < 1 ? sh : 0, kk ? 0.14 / kk : 1);
          g.restore();
          if (!kk && sh > 0 && sh < 1 && tt < q.tSlide) {
            // The glint's peak throws a streak and a four-point flare through the coin.
            const pk = Math.sin(Math.PI * sh);
            drawStreak(g, X(p.x), GY(p.y), U * (4 + 14 * k) * p.r / 3.4, 0.5 * pk * (0.4 + 0.6 * k), q.metal.glint);
          }
        }
        for (const h of q.hits) {
          const tau = t - h.t;
          if (tau > 0 && tau < 0.55) {
            drawBurst(g, plan.sparkLand, X(h.x), GY(h.y), tau, U * 0.8, 0.55);
            drawShock(g, X(h.x), GY(h.y), U * (1 + tau * 9), 0.7 * (1 - tau / 0.55), '#ffffff', U * 0.18);
          }
        }
        const since = t - q.tIn;
        if (since > 0) {
          drawBurst(g, plan.burstSlot, X(q.sx), GY(SLOT_Y - 3), since, U, 1.1);
          drawShock(g, X(q.sx), Y(SLOT_Y), U * (2 + since * 30), 0.75 * Math.exp(-since * 4.5), q.col, U * 0.35);
        }
      }
    }

    function footer(t) {
      const k = seg(t, 2.0, 2.4);
      if (k <= 0) return;
      const since = t - tIn;
      const cu = 0.42, yy = 52.6;
      g.save();
      g.globalAlpha = k;
      bits('CREDIT', 3.2, yy, cu, look.ink, 'l', true);
      const credits = since >= 0 ? 1 : 0;
      const pop = since >= 0 ? 1 + 0.9 * Math.exp(-since * 7) : 1;
      const cell = cellFor(cu * pop) / F.sc;
      bitsPx(String(credits), X(3.2) + 8 * 6 * cellFor(cu) / F.sc, Y(yy) - (cell - cellFor(cu) / F.sc) * 3.5, cu * pop, since >= 0 ? look.hi : plan.loseCol, 'l', true);
      bits(`FIRST TO ${ctx.target}`, 96.8, yy, cu, look.dim, 'r', true);
      // The line in the middle: the taunt types itself; after the coin, it is PUSH START.
      const ty = seg(t, 2.5, 3.5);
      if (since < 0) bits(plan.taunt.slice(0, Math.max(1, Math.floor(ty * plan.taunt.length))), 50, yy, cu, look.dim, 'c', true, 28);
      else if ((Math.floor(since * 4) & 1) === 0) bits('PUSH START', 50, yy, cu * 1.1, look.hi, 'c', true, 28);
      g.restore();
    }

    function centreMessage(t) {
      const { U } = F;
      const k = seg(t, tIn + 0.3, tIn + 0.6);
      if (k <= 0) return;
      const cx = X(50), pop = ease.outBack(seg(t, tIn + 0.32, tIn + 0.7));
      g.save();
      g.globalAlpha = k;
      if (plan.draw) {
        const S = Math.min(1.2 * U, (84 * U) / (heroLayout('BOTH PLAYERS').width + 2.4));
        drawHero(g, look.style('main', null), 'BOTH PLAYERS', cx, Y(31.4), S * Math.max(0.01, pop), { ref: S });
      } else {
        bitsPx('PLAYER', cx, Y(21.6), 0.62, look.ink, 'c', true);
        const S = Math.min(1.2 * U, (84 * U) / (heroLayout(plan.loserName).width + 2.4));
        drawHero(g, look.style('main', plan.loseCol), plan.loserName, cx, Y(31.4), S * Math.max(0.01, pop), { ref: S, shine: seg(t, tIn + 0.6, tIn + 1.2) || undefined });
      }
      if ((Math.floor((t - tIn) * 7) & 1) === 0 || t - tIn > 1) bitsPx(plan.draw ? 'CONTINUE!' : 'CONTINUES!', cx, Y(40), 0.75, look.hi, 'c', true);
      g.restore();
    }

    function dress(t) {
      const { W, H, U, UY, oy } = F;
      // The old world stays visible, crunched, behind GAME OVER; the cabinet's backdrop closes over it later.
      look.bg(g, W, H, U, oy, t, ease.outQuad(seg(t, 0.9, 2.0)) * 0.86, UY);
      const bleed = seg(t, T.gag0 + 0.4, T.msgOut - 0.1) * 0.42;
      if (bleed > 0.01) drawSpace(g, W, H, U, oy, phaseOf(t), plan, pal, bleed, false, UY);
      targetTag(t);
      const ck = 1 - 0.85 * camK(t);
      if (t > 0.45) headline(t, ck);
      if (t > 1.7) panels(t);
      if (t > 1.7) countdown(t, ck);
      if (t > 1.7) { slots(t); footer(t); }
      if (t > T.gag0 - 0.05) { closeFx(t); props(t); }
      if (t > tIn + 0.25) centreMessage(t);
    }

    function paintCard(t) {
      drawCard(g, { W: F.W, H: F.H, U: F.U, UY: F.UY, ox: F.ox, oy: F.oy, t, plan, to: ctx.to, look, sc: F.sc, go: t >= SWAP + 0.05, phase: phaseOf(t), score: ctx.score, target: ctx.target });
    }

    function paint(t) {
      g.setTransform(F.sc, 0, 0, F.scY, 0, 0);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, F.W, F.H);
      if (t >= T.cardIn1) { paintCard(t); return; }
      if (t < T.cardIn0) {
        // The camera (the coin's close-up), and the cabinet powering down once the message is read:
        // the picture collapses to a line, the line to a dot, and the dot is what the stage card grows from.
        const cz = camZ(t), k = camT(t);
        const off = ease.inCubic(seg(t, T.msgOut, T.msgOut + 0.22));
        g.save();
        if (off > 0) {
          g.translate(F.W / 2, F.H / 2);
          g.scale(1, Math.max(0.004, 1 - off));
          g.translate(-F.W / 2, -F.H / 2);
        }
        if (cz > 1.0005) {
          const [fx0, fy0] = camFocus();
          const sx0 = lerp(fx0, F.W / 2, k), sy0 = lerp(fy0, F.H / 2, k);
          g.translate(sx0, sy0);
          g.scale(cz, cz);
          g.translate(-fx0, -fy0);
        }
        dress(t);
        g.restore();
        if (k > 0.01) {
          // The glass closes in on the close-up: a dark vignette, deepest while the coin hangs.
          const vg = g.createRadialGradient(F.W / 2, F.H / 2, Math.min(F.W, F.H) * 0.28, F.W / 2, F.H / 2, Math.hypot(F.W, F.H) * 0.58);
          vg.addColorStop(0, 'rgba(0,0,0,0)');
          vg.addColorStop(1, `rgba(0,0,0,${0.66 * k})`);
          g.fillStyle = vg;
          g.fillRect(0, 0, F.W, F.H);
        }
        if (off > 0) {
          const half = (F.W / 2) * (1 - ease.inQuad(seg(t, T.msgOut + 0.22, T.cardIn0 - 0.03)));
          const lh = Math.max(2, F.U * 0.22);
          g.globalAlpha = Math.min(1, off * 1.3);
          g.fillStyle = '#ffffff';
          if (half > 1) g.fillRect(F.W / 2 - half, F.H / 2 - lh / 2, half * 2, lh);
          g.globalAlpha = 1;
          if (half < F.U * 3) {
            const dr = F.U * 2.6, dg = g.createRadialGradient(F.W / 2, F.H / 2, 0, F.W / 2, F.H / 2, dr);
            dg.addColorStop(0, 'rgba(255,255,255,1)');
            dg.addColorStop(1, 'rgba(255,255,255,0)');
            g.globalAlpha = 1 - seg(t, T.cardIn0 - 0.1, T.cardIn0);
            g.fillStyle = dg;
            g.fillRect(F.W / 2 - dr, F.H / 2 - dr, dr * 2, dr * 2);
            g.globalAlpha = 1;
          }
        }
        return;
      }
      const rv = cardReveal(g, F.W, F.H, t, plan, pal, F.U);
      g.save();
      g.beginPath();
      for (const r of rv.rects) g.rect(r[0], r[1], r[2], r[3]);
      g.clip();
      paintCard(t);
      g.restore();
      g.fillStyle = pal.accent;
      for (const e of rv.edges) g.fillRect(e[0], e[1], e[2], e[3]);
    }

    // --- the monitor ------------------------------------------------------------------------------------------------
    function monitor(t) {
      const u = pass.uniforms;
      const { U } = F;
      u.uRes.value.set(F.W, F.H);
      u.uDpr.value = ctx.dpr;
      u.uTime.value = t % 97;
      // The old world crunches in rungs; from the last rung on it is read from the baked texture.
      const rung = Math.min(6, Math.floor(seg(t, 0.05, 0.72) * 7));
      u.uCell.value = rung === 0 ? 0 : Math.max(1.5, (F.H / 110) * RUNGS[rung]);
      u.uBaked.value = t >= 0.66 ? 1 : 0;
      u.uDesat.value = ease.outQuad(seg(t, 0, 0.55));
      u.uTintAmt.value = fx.amt * seg(t, 0.2, 0.7);
      u.uDim.value = lerp(1, fx.dim, seg(t, 0.15, 1.4)) * (1 - seg(t, T.msgOut - 0.7, T.msgOut));
      u.uWorldOn.value = t < T.msgOut ? 1 : 0;
      const crt = ease.inOutQuad(seg(t, 0.04, 0.5));
      u.uCrt.value = crt;
      u.uCurve.value = fx.curve * (1 - ease.inOutCubic(seg(t, SWAP - 0.35, SWAP + 0.1)));
      u.uBloom.value = fx.bloom * 0.55 * crt;
      let sx = 0, sy = 0, kick = 0;
      for (const [t0, a, k] of shakeEv) {
        const tau = t - t0;
        if (tau < 0 || tau > 1.2) continue;
        const e = a * Math.exp(-tau * k);
        sx += Math.sin(t * 61 + t0 * 3) * e;
        sy += Math.cos(t * 53 + t0 * 5) * e;
      }
      for (const [t0, a, k] of kickEv) { const tau = t - t0; if (tau >= 0 && tau < 1) kick += a * Math.exp(-tau * k); }
      u.uShake.value.set((sx * U * 0.5) / F.W, (-sy * U * 0.5) / F.H);
      u.uKick.value = kick * crt;
      u.uGlitch.value = 0.9 * Math.pow(1 - seg(t, 0.05, 0.6), 2) * (t > 0.05 ? 1 : 0) + 0.22 * Math.exp(-Math.abs(t - T.swap) * 9);
      // The flash that is the swap, and the little ones.
      let fl = t < SWAP - 0.02 ? ease.inQuad(seg(t, T.flash0, SWAP - 0.02)) : 1 - ease.outQuad(seg(t, SWAP + 0.12, SWAP + 0.4));
      const ts = t - tIn;
      if (ts > 0 && ts < 0.5) fl = Math.max(fl, 0.35 * Math.exp(-ts * 12));
      if (t > 0.03 && t < 0.4) fl = Math.max(fl, 0.5 * Math.exp(-(t - 0.03) * 14));
      u.uFlash.value = fl;
      // The wipe (only after the swap).
      if (t >= SWAP) {
        u.uWipeType.value = WIPE_ID[plan.wipeType];
        u.uWipe.value = ease.inOutQuad(seg(t, T.wipe0, T.wipe1));
        u.uWipeDir.value = plan.wipeType === 'blinds' ? (plan.wipeVert ? 4.2 : 1.2) : plan.wipeDir;
        u.uWipeGrid.value = plan.wipeType === 'blinds' ? plan.wipeSlats : plan.wipeGrid;
        u.uTail.value = 1 - seg(t, T.wipe1 + 0.1, T.tail1);
      } else u.uWipeType.value = 0;
    }

    // --- sound --------------------------------------------------------------------------------------------------------
    const cues = [];
    const at = (t, fn) => cues.push({ t, fn });
    const thump = (gn = 1, f = 1) => { A.tone({ freq: 150 * f, freqEnd: 46, dur: 0.22, gain: 0.5 * gn, attack: 0.004 }); A.noise({ filter: 'lowpass', freq: 320, dur: 0.08, gain: 0.5 * gn, attack: 0.003 }); };
    at(0.0, () => { A.tone({ freq: 1300, freqEnd: 55, dur: 0.55, gain: 0.2, attack: 0.002 }); A.sfx('hit', { gain: 0.8 }); A.noise({ filter: 'lowpass', freq: 5000, freqEnd: 200, dur: 0.6, gain: 0.35 }); });
    at(0.05, () => A.sfx('glitch', { gain: 0.6 }));
    for (let k = 1; k < 7; k++) at(0.05 + k * 0.1, () => A.tone({ type: 'square', freq: 880 / Math.pow(1.38, k), dur: 0.05, gain: 0.07, attack: 0.001 }));
    landT.forEach((lt, i) => at(lt, () => {
      const last = i === hdGlyphs - 1;
      A.tone({ freq: 190 - i * 6, freqEnd: 50, dur: 0.22, gain: last ? 0.55 : 0.32, attack: 0.003 });
      A.noise({ filter: 'bandpass', freq: 1800, freqEnd: 600, q: 2, dur: 0.1, gain: 0.35, attack: 0.001 });
      A.tone({ type: 'triangle', freq: 1500 + i * 130, dur: 0.18, gain: 0.05 });
      if (last) A.sfx('boom', { gain: 0.6 });
    }));
    [392, 330, 262, 220, 165].forEach((f, i) => at(1.3 + i * 0.13, () => { A.tone({ type: 'square', freq: f, dur: i === 4 ? 0.55 : 0.12, gain: 0.08, attack: 0.002 }); A.tone({ type: 'triangle', freq: f / 2, dur: i === 4 ? 0.6 : 0.14, gain: 0.12 }); }));
    at(1.72, () => A.sfx('swoosh', { gain: 0.6 }));
    at(1.84, () => A.sfx('swoosh', { gain: 0.5, pitch: 1.2 }));
    at(T.dig0, () => { A.tone({ type: 'sawtooth', freq: 55, freqEnd: 330, dur: 2.5, gain: 0.07, attack: 2.3 }); A.tone({ type: 'sawtooth', freq: 55.6, freqEnd: 332, dur: 2.5, gain: 0.05, attack: 2.3, detune: 9 }); });
    plan.tally.forEach((_, i) => {
      const ts = 2.42 + i * 0.27;
      at(ts, () => A.sfx('blip', { gain: 0.5, pitch: 1 + i * 0.08 }));
      for (let j = 0; j < 7; j++) at(ts + 0.05 + j * 0.07, () => A.tone({ type: 'square', freq: 1500 + ((j * 7 + i * 3) % 5) * 180, dur: 0.025, gain: 0.025, attack: 0.001 }));
    });
    {
      const ts = 2.42 + plan.tally.length * 0.27 + 0.1;
      for (let j = 0; j < 12; j++) at(ts + j * 0.07, () => A.tone({ type: 'square', freq: 700 + j * 90, dur: 0.03, gain: 0.04, attack: 0.001 }));
      at(ts + 0.9, () => A.sfx('chime', { gain: 0.5, pitch: 1.2 }));
    }
    T.digitT.forEach((dt, i) => at(dt, () => {
      thump(0.8 + i * 0.05, 1 - i * 0.02);
      A.tone({ type: 'square', freq: 440 * Math.pow(2, i / 8), dur: 0.07, gain: 0.07, attack: 0.001 });
    }));
    at(T.one, () => { A.sfx('heartbeat', { gain: 1.1, pitch: 0.75 }); A.tone({ type: 'sine', freq: 880, freqEnd: 600, dur: 1.4, gain: 0.05, attack: 0.1 }); });
    at(T.one + 0.95, () => A.sfx('heartbeat', { gain: 0.9, pitch: 0.7 }));
    at(T.gag0, () => { A.sfx('whoosh', { gain: 0.5, pitch: 0.6 }); A.tone({ type: 'triangle', freq: 2200, freqEnd: 800, dur: 0.9, gain: 0.04, attack: 0.3 }); });
    // The dive: a low whoosh and a pitch that sags, as if time itself were thickening.
    at(T.gag0 + 0.4, () => { A.sfx('whoosh', { gain: 0.7, pitch: 0.45 }); A.tone({ type: 'sine', freq: 420, freqEnd: 62, dur: 1.4, gain: 0.12, attack: 0.05 }); A.tone({ type: 'triangle', freq: 3300, freqEnd: 1500, dur: 1.2, gain: 0.03, attack: 0.4 }); });
    for (const q of gags) {
      for (const h of q.hits) at(h.t, () => {
        A.tone({ type: 'triangle', freq: 3100, dur: 0.28, gain: 0.12, attack: 0.001 });
        A.tone({ type: 'sine', freq: 4650, dur: 0.2, gain: 0.05, attack: 0.001 });
        A.noise({ filter: 'bandpass', freq: 5200, q: 3, dur: 0.03, gain: 0.4, attack: 0.001 });
        if (h.k !== 'rim') A.sfx('thud', { gain: 0.4, pitch: 1.6 });
      });
      at(q.tIn, () => {
        A.tone({ type: 'square', freq: 988, dur: 0.09, gain: 0.17, attack: 0.002 });
        A.tone({ type: 'square', freq: 1319, dur: 0.6, gain: 0.17, attack: 0.002, delay: 0.09 });
        A.noise({ filter: 'highpass', freq: 5000, dur: 0.04, gain: 0.3, attack: 0.001 });
      });
    }
    at(tIn + 0.02, () => { A.sfx('powerup', { gain: 0.7 }); thump(1.1, 0.9); });
    at(tIn + 0.14, () => A.sfx('chime', { gain: 0.7 }));
    [523, 659, 784, 1047].forEach((f, i) => at(tIn + 0.34 + i * 0.075, () => A.tone({ type: 'square', freq: f, dur: i === 3 ? 0.4 : 0.1, gain: 0.08 })));
    // The cabinet powers down (a falling whine, a click) and the stage card slams in.
    at(T.msgOut, () => { A.tone({ type: 'sine', freq: 2600, freqEnd: 70, dur: 0.3, gain: 0.12, attack: 0.002 }); A.noise({ filter: 'highpass', freq: 4000, freqEnd: 900, dur: 0.3, gain: 0.18 }); });
    at(T.cardIn0 - 0.04, () => { A.tone({ type: 'sine', freq: 110, freqEnd: 50, dur: 0.18, gain: 0.3, attack: 0.002 }); });
    at(SWAP - 1.3, () => A.sfx('riser', { gain: 0.8 }));
    at(T.cardIn0, () => A.sfx('swoosh', { gain: 0.8 }));
    at(T.letter0, () => { thump(1, 0.9); A.sfx('blip', { gain: 0.6, pitch: 0.8 }); });
    at(T.letter0 + 0.1, () => A.sfx('swoosh', { gain: 0.5, pitch: 1.3 }));
    for (let i = 0; i < 3; i++) at(T.ready0 + i * 0.307, () => A.tone({ type: 'square', freq: i % 2 ? 1319 : 880, dur: 0.1, gain: 0.1, attack: 0.002 }));
    at(SWAP - 0.04, () => { A.tone({ type: 'sawtooth', freq: 220, dur: 0.9, gain: 0.12 }); A.tone({ type: 'sawtooth', freq: 330, dur: 0.9, gain: 0.1, detune: 8 }); A.tone({ type: 'square', freq: 660, dur: 0.7, gain: 0.07 }); A.sfx('boom', { gain: 1 }); A.noise({ filter: 'highpass', freq: 2000, dur: 0.5, gain: 0.3 }); });
    at(T.wipe0, () => { A.sfx('swoosh', { gain: 0.9, pitch: 0.8 }); A.tone({ type: 'square', freq: 220, freqEnd: 1760, dur: 0.6, gain: 0.06, attack: 0.2 }); });
    at(T.wipe0 + 0.7, () => A.sfx('whoosh', { gain: 0.5 }));
    cues.sort((a, b) => a.t - b.t);
    let ci = 0;

    // Everything slow happens now, at the cut: shaders compiled, textures resident, glyph paths and styles built.
    layout();
    ensureBake();
    for (const tt of [0.9, 2.8, 5.2, 6.6, 8.2, 9.5]) paint(tt);
    paint(0);
    monitor(0);
    try { renderer.initTexture(texFrom); renderer.initTexture(texScr); renderer.initTexture(texBake); renderer.compile(pass.scene, pass.camera); } catch { /* an older three: the first render compiles instead */ }

    return {
      update(dt, t) {
        while (ci < cues.length && cues[ci].t <= t) { const c = cues[ci++]; c.fn(); }
      },

      render(t) {
        layout();
        if (t >= 0.6) ensureBake();
        paint(t);
        texScr.needsUpdate = true;
        monitor(t);
        pass.render(renderer);
      },

      dispose() {
        texFrom.dispose();
        texScr.dispose();
        texBake.dispose();
        pass.dispose();
        clearHeroSprites();
        scr.canvas.width = scr.canvas.height = 1;
        bake.canvas.width = bake.canvas.height = 1;
      },
    };
  },
};
