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
// BEAT SHEET (11.0 s, swap at 8.25 s)
//   0.00         the old world, untouched (the cut in is invisible)
//   0.00 → 0.74  ACT 1 · the kill: impact flash, the picture drains and crunches in seven rungs
//                (pixels ×0 … ×8), the tube curves in, tearing and a chromatic kick
//   0.10 → 1.60  the target ring locks on the impact point: "<loser> DOWN" and how
//   0.52 → 1.60  GAME OVER drops in letter by letter and lands (each landing shakes the cabinet)
//   1.62 → 2.20  the headline climbs to the top; the panels slide in; CONTINUE? flickers on
//   2.10 → 4.88  the count, 9 … 2, quickening like a pulse; tally rows rattle up, the table fills
//   4.88 → 6.8   "1" — slow motion. A coin is tossed (4.42) and the gag plays out; the destination's
//                starfield / floor bleeds in behind the dressing
//   6.4 → 7.3    the coin drops in: bing-ding, CREDIT 1, PLAYER <loser> CONTINUES, confetti
//   7.30 → 8.00  ACT 2 · the stage card wipes in (bands or columns, edge-lit in the new accent)
//   7.60 → 8.25  READY? flashes and the screen whites out;  8.25  THE SWAP, held on white
//   8.4 → 8.58   the flash decays on the card, which now says GO!
//   8.58 → 10.2  ACT 3 · the arcade wipe (pixel dissolve | venetian blinds | diamonds) opens the
//                live new world, rim-lit in its accent
//   10.2 → 10.9  the phosphor glass fades off the picture; the overlay ends fully clear
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
import { makeLook, drawHero } from './continue/looks.js';
import { drawCoin, drawHand, drawSlot, drawRing, drawBurst, drawShock } from './continue/props.js';
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
    const look = makeLook(g, plan.era, plan);
    const fx = look.fx;
    const V2 = () => new THREE.Vector2(), V3 = (c) => new THREE.Vector3(c[0], c[1], c[2]);
    const accent3 = rgb01(pal.accent), white3 = [1, 1, 1];
    const flashCol = V3(rgb01(mixHex(pal.accent, '#ffffff', 0.85)));
    const pass = fullscreenPass(THREE, {
      fragmentShader: FRAG,
      uniforms: {
        tFrom: { value: texFrom }, tScr: { value: texScr },
        uRes: { value: V2() }, uShake: { value: V2() }, uDpr: { value: 1 }, uTime: { value: 0 },
        uCell: { value: 0 }, uDesat: { value: 0 }, uDim: { value: 1 }, uTintAmt: { value: 0 }, uLevels: { value: fx.levels }, uWorldOn: { value: 1 },
        uLo: { value: V3(rgb01(fx.lo)) }, uHi: { value: V3(rgb01(fx.hi)) },
        uCrt: { value: 0 }, uCurve: { value: fx.curve }, uScan: { value: fx.scan }, uBloom: { value: 0 }, uMask: { value: fx.mask }, uKick: { value: 0 }, uGlitch: { value: 0 }, uFlash: { value: 0 },
        uFlashCol: { value: flashCol }, uRim: { value: V3(accent3) },
        uWipe: { value: 0 }, uWipeType: { value: 0 }, uWipeSeed: { value: plan.wipeSeed }, uWipeDir: { value: 0 }, uWipeGrid: { value: plan.wipeGrid }, uTail: { value: 1 },
      },
    });
    void white3;

    // --- the screen layer -----------------------------------------------------------------------------
    const F = { W: 1, H: 1, U: 1, ox: 0, oy: 0, sc: 1 };
    function layout() {
      const w = Math.max(2, ctx.width), h = Math.max(2, ctx.height);
      // Soft is in character, and the texture is re-uploaded every frame (the costly part on an iPad).
      const s = Math.min(ctx.dpr, 1600 / w, 1100 / h);
      const SW = Math.max(2, Math.round(w * s)), SH = Math.max(2, Math.round(h * s));
      if (SW !== scr.canvas.width || SH !== scr.canvas.height) {
        scr.canvas.width = SW;
        scr.canvas.height = SH;
        texScr.dispose(); // its storage was allocated for the old size
      }
      F.W = w; F.H = h; F.sc = SW / w; F.scY = SH / h;
      F.U = Math.min(w / 100, h / 56.25);
      F.ox = (w - 100 * F.U) / 2;
      F.oy = (h - 56.25 * F.U) / 2;
    }
    const X = (u) => F.ox + u * F.U, Y = (v) => F.oy + v * F.U;

    // Dot-matrix text at unit coordinates; cu is the dot size in units. Dots are whole device pixels.
    function bitsPx(str, x, y, cu, color, align = 'l', shadow = true, maxWpx = 0) {
      str = String(str);
      let cell = Math.max(2, Math.floor(cu * F.U * F.sc + 0.25));
      if (maxWpx > 0) cell = Math.max(2, Math.min(cell, Math.floor((maxWpx * F.sc) / Math.max(1, str.length * 6 - 1))));
      return drawBits(g, str, x, y, cell / F.sc, color, align, shadow && look.shadow ? look.shadow : null, F.sc);
    }
    const bits = (str, xu, yu, cu, color, align = 'l', shadow = true, maxWu = 0) => bitsPx(str, X(xu), Y(yu), cu, color, align, shadow, maxWu * F.U);
    const cellFor = (cu) => Math.max(2, Math.floor(cu * F.U * F.sc + 0.25));

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
    const clamp01s = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
    const hash = (n) => { const s = Math.sin(n * 12.9898 + plan.shakeSeed) * 43758.5453; return s - Math.floor(s); };

    const camX = plan.draw ? 50 : 50 + plan.side * 2;
    const zMax = plan.draw ? 1.12 : plan.gag === 'freeze' ? 1.5 : plan.gag === 'fumble' ? 1.42 : 1.36;
    const camK = (t) => clamp((camZ(t) - 1) / (zMax - 1), 0, 1);
    const camZ = (t) => 1 + (zMax - 1) * ease.inOutCubic(seg(t, T.gag0 + 0.75, T.gag0 + 1.45)) * (1 - ease.inOutCubic(seg(t, tIn + 0.02, tIn + 0.42)));

    // =============================================================================================================
    // PAINT: the dressing (before the card), the card, the reveal
    // =============================================================================================================
    function headline(t, ck = 1) {
      const { U } = F;
      const L0 = heroLayout(hdText);
      const S0 = Math.min(1.5 * U, (80 * U) / (L0.width + 2.4));
      const kS = ease.inOutCubic(seg(t, T.shift0, T.shift1));
      const S = S0 * lerp(1, 0.55, kS);
      const cy = lerp(Y(27.2), Y(6.8), kS);
      const st = look.style('main', null);
      const shine = t > 1.2 ? ((t - 1.25) % 2.4) / 1.1 : 0;
      drawHero(g, st, hdText, F.W / 2, cy, S, {
        alpha: ck,
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
      const L = heroLayout(hdText), x0 = F.W / 2 - (L.width * S0 * lerp(1, 0.55, kS)) / 2;
      for (let i = 0; i < L.glyphs.length; i++) {
        const tau = t - landT[i];
        if (tau > 0 && tau < 0.5) drawBurst(g, plan.sparkLand, x0 + (L.glyphs[i].x + L.glyphs[i].w / 2) * S, cy + 3.6 * S, tau, U * 0.5, 0.5);
      }
      // Under it: who.
      const subY = lerp(Y(37.2), Y(10.5), kS), cu = lerp(0.8, 0.48, kS);
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
      const { U } = F;
      const dim = 1 - 0.9 * camK(t);
      const kL = ease.outCubic(seg(t, 1.72, 2.3)) - ease.inQuad(seg(t, tIn + 0.05, tIn + 0.4)), kR = ease.outCubic(seg(t, 1.84, 2.42)) - ease.inQuad(seg(t, tIn + 0.1, tIn + 0.45));
      const pw = 33, ph = 24, py = 20.8;
      // High scores.
      {
        const x = X(2.6) - (1 - kL) * U * 40, y = Y(py), w = pw * U, h = ph * U;
        look.panel(g, x, y, w, h, plan.winCol, U, dim * (kL > 0 ? 1 : 0));
        if (kL > 0.6) {
          const innerW = (pw - 3.6) * U, rows = plan.table;
          // One dot size for the whole table; long names are clipped to what fits.
          const nameMax = Math.min(12, Math.max(...rows.map((r) => r.name.length)));
          let cs = cellFor(0.4);
          while (cs > 2 && Math.floor((innerW * F.sc) / (cs * 6)) - 8 < nameMax) cs--;
          const maxChars = Math.max(5, Math.floor((innerW * F.sc) / (cs * 6)) - 8);
          const names = rows.map((r) => (r.name.length > maxChars ? r.name.slice(0, maxChars - 1) + '.' : r.name));
          const cu = cs / (F.U * F.sc);
          const lx = x + U * 1.8, rx = x + w - U * 1.8;
          bitsPx('HIGH SCORES', x + w / 2, y + U * 1.5, Math.min(0.5, cu * 1.3), look.hi, 'c', true, innerW);
          const RANK = ['1ST', '2ND', '3RD', '4TH', '5TH'];
          for (let i = 0; i < rows.length; i++) {
            const ka = seg(t, 2.0 + i * 0.1, 2.2 + i * 0.1);
            if (ka <= 0) continue;
            const r = rows[i], yy = y + U * (4.4 + i * 3.2);
            g.globalAlpha = dim * ka;
            if (r.win) {
              g.fillStyle = rgba(r.col, 0.16 + 0.1 * Math.sin(t * 9));
              g.fillRect(x + U * 0.8, yy - U * 0.5, w - U * 1.6, cellFor(cu) / F.sc * 7 + U * 1);
            }
            const col = r.real ? r.col : look.dim;
            bitsPx(RANK[i], lx, yy, cu, r.real ? look.hi : look.dim, 'l', true);
            bitsPx(names[i], lx + 4 * 6 * cs / F.sc, yy, cu, col, 'l', true);
            bitsPx(String(r.pts).padStart(2, '0'), rx, yy, cu, r.real ? look.ink : look.dim, 'r', true);
          }
          g.globalAlpha = dim;
          const foot = ctx.matchPoint && (Math.floor(t * 3) & 1) === 0 ? 'MATCH POINT!' : `FIRST TO ${ctx.target}`;
          bitsPx(foot, x + w / 2, y + U * (4.4 + 5 * 3.2 + 0.2), cu, ctx.matchPoint ? plan.winCol : look.dim, 'c', true, innerW);
          g.globalAlpha = 1;
        }
      }
      // The round's bonus tally.
      {
        const x = X(100 - 2.6 - pw) + (1 - kR) * U * 40, y = Y(py), w = pw * U, h = ph * U;
        look.panel(g, x, y, w, h, plan.winCol, U, dim * (kR > 0 ? 1 : 0));
        if (kR > 0.6) {
          const innerW = (pw - 3.6) * U, lines = plan.tally;
          let cu = Math.min(0.4, (innerW / F.U) / (22 * 6));
          cu = Math.max(cu, 2 / (F.U * F.sc));
          const lx = x + U * 1.8, rx = x + w - U * 1.8;
          bitsPx(plan.draw ? `ROUND ${ctx.round} DRAWN` : `ROUND ${ctx.round} BONUS`, x + w / 2, y + U * 1.5, Math.min(0.5, cu * 1.25), look.hi, 'c', true, innerW);
          const t0 = 2.42;
          g.globalAlpha = dim;
          for (let i = 0; i < lines.length; i++) {
            const ts = t0 + i * 0.27, ka = seg(t, ts, ts + 0.12);
            if (ka <= 0) continue;
            const ln = lines[i], yy = y + U * (4.4 + i * 3.2);
            bitsPx(ln.label, lx, yy, cu, look.ink, 'l', true);
            // The value rattles: random digits until it locks.
            const lock = ts + 0.5;
            let v = ln.value || (ln.pts ? `+${ln.pts}` : '0');
            if (ln.label === 'MERCY' && !plan.draw) v = '0';
            if (t < lock && /\d/.test(v)) {
              const fr = Math.floor(t * 34);
              v = v.replace(/\d/g, (d, k) => String(Math.floor(hash(fr * 7 + k + i * 13) * 10)));
            } else if (t < lock) v = v.slice(0, Math.max(1, Math.floor(((t - ts) / 0.5) * v.length)));
            bitsPx(v, rx, yy, cu, plan.winCol, 'r', true, innerW * 0.55);
          }
          // Total, counting up.
          const ts = t0 + lines.length * 0.27 + 0.1, kt = seg(t, ts, ts + 0.9);
          if (kt > 0) {
            const yy = y + U * (4.4 + 5 * 3.2 + 0.2);
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
      const cx = X(50);
      const ek = seg(t, tIn, tIn + 0.25);
      // CONTINUE?
      const lk = seg(t, 1.95, 2.2);
      if (lk > 0 && ek < 1) {
        const flick = lk < 1 ? ((Math.floor(t * 30) & 1) ? 1 : 0.25) : 1;
        const S = Math.min(0.5 * U, (30 * U) / (heroLayout('CONTINUE?').width + 2.4));
        drawHero(g, look.style('main', null), 'CONTINUE?', cx, Y(17.2), S, { alpha: flick * (1 - ek) * ck });
      }
      const d = digitAt(t);
      if (!d) return;
      const cy = Y(32.8), R = U * 7.4;
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
      g.save();
      g.globalAlpha = open * (1 - ek);
      // The digit that just left blows outward like an echo.
      if (!d.one && d.tau < 0.26 && d.n < 9) {
        const kk = d.tau / 0.26;
        g.globalAlpha = open * (1 - ek) * 0.32 * (1 - kk) * (1 - kk);
        drawHero(g, look.style('main', plan.loseCol), String(d.n + 1), cx, cy, 1.18 * U * (1.25 + 0.9 * ease.outCubic(kk)), {});
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
      const S = 1.18 * U * pop * (1 + 0.3 * ek) * (0.6 + 0.4 * open);
      drawHero(g, look.style('main', plan.loseCol), String(d.n), cx + jx, cy + jy, S, { alpha: flick });
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

    function props(t) {
      const { U } = F;
      for (let gi = 0; gi < gags.length; gi++) {
        const q = gags[gi];
        if (q.hand) {
          const h = q.hand(t);
          if (h && h.a > 0) drawHand(g, X(h.x), Y(h.y), U * 5.2, h.rot, gi ? plan.slots[1].col : plan.loseCol === '#ffffff' ? '#f2b35b' : plan.loseCol, h.curl, 1);
        }
        for (let k = 3; k >= 0; k--) {
          const tt = t - k * 0.055, p = q.pos(tt);
          if (!p) continue;
          g.save();
          if (tt >= q.tSlide) {
            g.beginPath();
            g.rect(0, 0, F.W, Y(q.slitTop));
            g.clip();
          }
          const sh = ((tt - T.gag0) * 0.85) % 1.7;
          drawCoin(g, X(p.x), Y(p.y), p.r * U, p.phi, p.tilt, q.metal, sh < 1 ? sh : 0, k ? 0.16 / k : 1);
          g.restore();
        }
        for (const h of q.hits) {
          const tau = t - h.t;
          if (tau > 0 && tau < 0.55) {
            drawBurst(g, plan.sparkLand, X(h.x), Y(h.y), tau, U * 0.8, 0.55);
            drawShock(g, X(h.x), Y(h.y), U * (1 + tau * 9), 0.7 * (1 - tau / 0.55), '#ffffff', U * 0.18);
          }
        }
        const since = t - q.tIn;
        if (since > 0) {
          drawBurst(g, plan.burstSlot, X(q.sx), Y(SLOT_Y - 3), since, U, 1.1);
          drawShock(g, X(q.sx), Y(SLOT_Y), U * (2 + since * 30), 0.75 * Math.exp(-since * 4.5), q.col, U * 0.35);
        }
      }
    }

    function footer(t) {
      const { U } = F;
      const k = seg(t, 2.0, 2.4);
      if (k <= 0) return;
      const since = t - tIn;
      const cu = 0.42, yy = 52.2;
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
        drawHero(g, look.style('main', null), 'BOTH PLAYERS', cx, Y(31), S * Math.max(0.01, pop), {});
      } else {
        bitsPx('PLAYER', cx, Y(21.6), 0.62, look.ink, 'c', true);
        const S = Math.min(1.2 * U, (84 * U) / (heroLayout(plan.loserName).width + 2.4));
        drawHero(g, look.style('main', plan.loseCol), plan.loserName, cx, Y(31), S * Math.max(0.01, pop), { shine: seg(t, tIn + 0.6, tIn + 1.2) || undefined });
      }
      if ((Math.floor((t - tIn) * 7) & 1) === 0 || t - tIn > 1) bitsPx(plan.draw ? 'CONTINUE!' : 'CONTINUES!', cx, Y(39.6), 0.75, look.hi, 'c', true);
      g.restore();
    }

    function dress(t) {
      const { W, H, U, oy } = F;
      look.bg(g, W, H, U, oy, t, ease.outQuad(seg(t, 0.5, 1.45)) * 0.86);
      const bleed = seg(t, 4.3, 6.9) * 0.42;
      if (bleed > 0.01) drawSpace(g, W, H, U, oy, phaseOf(t), plan, pal, bleed, false);
      targetTag(t);
      const ck = 1 - 0.85 * camK(t);
      if (t > 0.45) headline(t, ck);
      if (t > 1.7) panels(t);
      if (t > 1.7) countdown(t, ck);
      if (t > 1.7) { slots(t); footer(t); }
      if (t > T.gag0 - 0.05) props(t);
      if (t > tIn + 0.25) centreMessage(t);
    }

    function paintCard(t) {
      drawCard(g, { W: F.W, H: F.H, U: F.U, ox: F.ox, oy: F.oy, t, plan, to: ctx.to, look, sc: F.sc, go: t >= SWAP + 0.05, phase: phaseOf(t), score: ctx.score, target: ctx.target });
    }

    function paint(t) {
      g.setTransform(F.sc, 0, 0, F.scY, 0, 0);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, F.W, F.H);
      if (t >= T.cardIn1) { paintCard(t); return; }
      // The slow-motion push-in on the slot while the coin is in the air.
      const cz = camZ(t);
      g.save();
      if (cz > 1.0005) {
        const cx = X(camX), cy = Y(40);
        g.translate(cx, cy);
        g.scale(cz, cz);
        g.translate(-cx, -cy);
      }
      dress(t);
      g.restore();
      if (t >= T.cardIn0) {
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
    }

    // --- the monitor ------------------------------------------------------------------------------------------------
    function monitor(t) {
      const u = pass.uniforms;
      const { U } = F;
      u.uRes.value.set(F.W, F.H);
      u.uDpr.value = ctx.dpr;
      u.uTime.value = t % 97;
      // The old world crunches in rungs.
      const rung = Math.min(6, Math.floor(seg(t, 0.05, 0.72) * 7));
      u.uCell.value = rung === 0 ? 0 : Math.max(1.5, (F.H / 110) * RUNGS[rung]);
      u.uDesat.value = ease.outQuad(seg(t, 0, 0.55));
      u.uTintAmt.value = fx.amt * seg(t, 0.2, 0.7);
      u.uDim.value = lerp(1, fx.dim, seg(t, 0.15, 1.4));
      u.uWorldOn.value = t < T.cardIn1 ? 1 : 0;
      const crt = ease.inOutQuad(seg(t, 0.04, 0.5));
      u.uCrt.value = crt;
      u.uCurve.value = fx.curve * (1 - ease.inOutCubic(seg(t, 7.9, 8.35)));
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
    at(2.05, () => { A.tone({ type: 'sawtooth', freq: 55, freqEnd: 330, dur: 2.9, gain: 0.07, attack: 2.6 }); A.tone({ type: 'sawtooth', freq: 55.6, freqEnd: 332, dur: 2.9, gain: 0.05, attack: 2.6, detune: 9 }); });
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
    at(SWAP - 1.55, () => A.sfx('riser', { gain: 0.8 }));
    at(T.cardIn0, () => A.sfx('swoosh', { gain: 0.8 }));
    for (let i = 0; i < 5; i++) at(T.ready0 + i * 0.307, () => A.tone({ type: 'square', freq: i % 2 ? 1319 : 880, dur: 0.1, gain: 0.1, attack: 0.002 }));
    at(SWAP - 0.04, () => { A.tone({ type: 'sawtooth', freq: 220, dur: 0.9, gain: 0.12 }); A.tone({ type: 'sawtooth', freq: 330, dur: 0.9, gain: 0.1, detune: 8 }); A.tone({ type: 'square', freq: 660, dur: 0.7, gain: 0.07 }); A.sfx('boom', { gain: 1 }); A.noise({ filter: 'highpass', freq: 2000, dur: 0.5, gain: 0.3 }); });
    at(T.wipe0, () => { A.sfx('swoosh', { gain: 0.9, pitch: 0.8 }); A.tone({ type: 'square', freq: 220, freqEnd: 1760, dur: 0.6, gain: 0.06, attack: 0.2 }); });
    at(T.wipe0 + 0.7, () => A.sfx('whoosh', { gain: 0.5 }));
    cues.sort((a, b) => a.t - b.t);
    let ci = 0;

    // Everything slow happens now, at the cut: shaders compiled, textures resident, glyph paths and styles built.
    layout();
    for (const tt of [0.9, 3, 5.6, 6.9, 7.8, 9]) paint(tt);
    paint(0);
    monitor(0);
    try { renderer.initTexture(texFrom); renderer.initTexture(texScr); renderer.compile(pass.scene, pass.camera); } catch { /* an older three: the first render compiles instead */ }

    return {
      update(dt, t) {
        while (ci < cues.length && cues[ci].t <= t) { const c = cues[ci++]; c.fn(); }
      },

      render(t) {
        layout();
        paint(t);
        texScr.needsUpdate = true;
        monitor(t);
        pass.render(renderer);
      },

      dispose() {
        texFrom.dispose();
        texScr.dispose();
        pass.dispose();
        scr.canvas.width = scr.canvas.height = 1;
      },
    };
  },
};
