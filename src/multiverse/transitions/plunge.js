// PLUNGE — the linking dive from the surf world into the underwater one.
//
// CONCEPT
//   The surf world ends its kill with the lens crossing the waterline behind the winner's
//   dive; the underwater world opens just under the surface with both divers on the way
//   down. This is the few seconds in between, played as ONE continuous dive: the lens keeps
//   sinking, the bubble plume of the entry thickens into a churning white curtain that
//   swallows the old world (the swap hides under the thickest of it), the roar of the surf
//   drops to an underwater hush and one deep breath, and as the bubbles rise away the two
//   divers sink through the light — the one who was shot slowly tumbling, the one who dived
//   in after them arrow-straight — trading their beach kit for diving kit on the way down.
//   A shoal parts around the lens, something enormous stirs far below, the two peel away
//   toward opposite ends of the reef, and the last bubbles leave the new world clear.
//   Calm and brief: the breath before the next duel.
//
// BEAT SHEET (4.6 s, swap at 1.61 s)
//   0.00         the surf world's last frame, untouched (the cut in is invisible)
//   0.00 → 1.25  the lens sinks on: the waterline slides off the top, the picture runs on
//                down into the surf world's own water column; refraction builds; golden
//                shafts; the plume of the entry thickens round the impact point
//   0.15 → 1.50  the plume boils up into a curtain of foam that swallows the picture; the
//                surf's roar sinks into a low churn, bubbles chatter
//   1.40 → 1.78  the curtain, white and churning (the overlay is opaque throughout)
//   1.61         THE SWAP, under the thickest bubbles: a deep, soft whump; the hush
//   1.63 → 2.62  the curtain drains upward and away, lowest bubbles first; the new world
//                shows through, hazed, swimming and a touch too close; one deep breath
//   1.66 → 3.30  the one who was shot tumbles slowly into view and rights itself
//   1.92 → 2.78  the one who dived comes down arrow-straight through the foam, bubble trail
//                streaming, and slows beside them; names in their colours
//   2.32 / 2.72 / 3.10   the gear trades itself, one beat each, a glint and a puff of
//                bubbles: sunglasses → mask · board leash → fins · rifle → speargun
//   1.8  → 4.25  sunlight shafts, blue-green now, sweep through
//   2.50 → 3.62  a shoal crosses and parts around the lens
//   3.15 → 3.95  something enormous moves far below (one arm, two far-off arms or a shadow)
//   3.12 → 4.12  the new world's name, quietly, with a line about who went in after whom
//   3.3  → 4.3   the divers peel off toward their own ends of the reef, into the blue
//   4.30         the haze, the swim and the zoom are gone: the new world's first frame
//   4.32 → 4.57  the overlay fades onto the live world; the last frame is clear
//
// AXES OF VARIATION (all drawn once from ctx.rng in create())
//   1. the cast's staging: which side each diver sinks and leaves on, where they start,
//      the tumble's direction, speed and attitude, which of the two passes nearer the lens
//   2. the order of the three gear beats, and which diver changes first in each
//   3. the shoal: its size (46-79), heading (six directions), depth band, curve and the
//      colour of its stripe (or none)
//   4. the light: where the five shafts fall, their widths, slant and sweep direction
//   5. the thing below: one arm, a far-off pair or a passing shadow; its side, timing, curl
//   6. the line under the title (four phrasings) and every bubble of the plume and curtain
//
// CONTEXT
//   ctx.loser / ctx.winner   the tumbling diver and the arrow-straight one: identity colours on
//                            their glow, boardshorts, fins and mask rims; names beside them and
//                            in the line under the title. A drawn round: two divers, no names.
//   ctx.how                  one of the lines under the title
//   ctx.focus                where the plume rises (the entry point) and where the lens leans in
//   ctx.from                 'surf' with a scorer: the waterline is already in the picture, 22 %
//                            from the top (checked on the picture itself); anything else: a
//                            waterline of our own rises over the lens
//   ctx.to                   name in the title; palette fg for the title and the foam's
//                            highlights, accent for the speargun bands, the eye below and match
//                            point, bg for the deep; the new world's own first frame is
//                            averaged once for the haze it clears out of
//   matchPoint               the title says so, and a slow heartbeat sits under the hush
import { seg, ease, lerp, clamp, clamp01, pulse, rand, pick, shuffle, mixHex, rgba, hexToRgb, fitText, canvasTexture, fullscreenPass, makeCanvas } from '../kit.js';
import { PLAYER_COLORS } from '../contract.js';
import { WATER_FRAG } from './plunge/shaders.js';
import { makeCast, stepDiver, drawDiver, toScreen } from './plunge/cast.js';
import { makeSprites, makeBubbles, drawBubbles, drawPuff, makeShoal, drawShoal, makeKraken, drawKraken } from './plunge/life.js';

const DURATION = 4.6;
const SWAP_AT = 0.35;
const T = {
  swap: DURATION * SWAP_AT, // 1.61
  full: 1.5, clear0: 1.63, clear1: 2.62,
  beats: [2.32, 2.72, 3.1],
  shoal0: 2.5, shoal1: 3.62,
  kraken0: 3.15,
  cap0: 3.12, cap1: 4.12,
  last: 4.3, fade0: 4.32, fade1: 4.57,
};
// Does the old world's last frame already sit under the waterline (bright aqua a quarter of
// the way down, deep blue at the bottom)? Looked at once, at a few pixels' size. If not —
// the kill moment was cut short, or this is a preview between other worlds — the lens sinks
// through a waterline of its own instead.
function underwater(img) {
  try {
    const p = makeCanvas(8, 16);
    p.g.drawImage(img, 0, 0, 8, 16);
    const d = p.g.getImageData(0, 0, 8, 16).data;
    p.canvas.width = p.canvas.height = 1;
    const row = (y) => { let r = 0, g = 0, b = 0; for (let x = 0; x < 8; x++) { const i = (y * 8 + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; } return [r / 8, g / 8, b / 8]; };
    const a = row(4), z = row(15);
    return a[1] > a[0] + 20 && a[1] > 140 && z[2] > z[0] + 30;
  } catch { return true; }
}
const rgb01 = (hex) => { const c = hexToRgb(hex); return [c.r / 255, c.g / 255, c.b / 255]; };

export default {
  id: 'plunge',
  name: 'PLUNGE',
  duration: DURATION,
  swapAt: SWAP_AT,

  create(ctx) {
    const { THREE, renderer } = ctx.three;
    const A = ctx.audio, rng = ctx.rng;
    const pal = ctx.to.palette;
    // The surf world leaves its waterline in the picture; from anywhere else we sink through one.
    const surfLike = ctx.from.id === 'surf' && !!ctx.winner && underwater(ctx.fromImage);
    const plumeX = clamp(ctx.focus.x / Math.max(1, ctx.width), 0.3, 0.7);

    // --- decided once ---------------------------------------------------------------------
    const cast = makeCast(ctx, rng, PLAYER_COLORS);
    const order = shuffle(rng, [0, 1, 2]); // which gear goes at which beat
    const firstW = rng() < 0.5;
    const shaftDir = rng() < 0.5 ? -1 : 1, tilt = rand(rng, 0.18, 0.42) * (rng() < 0.7 ? 1 : -1);
    const stripe = pick(rng, ['#ffd166', '#7fe7ff', '#ff9a7a', '#c9f27a', null]);
    const shoal = makeShoal(rng, T);
    const kraken = makeKraken(rng, T);
    const bubbles = makeBubbles(rng, plumeX, T);
    const foamSeed = rand(rng, 0, 40);
    const W = ctx.winner ? String(ctx.winner.name).toUpperCase() : '', L = ctx.loser ? String(ctx.loser.name).toUpperCase() : '';
    const lines = ctx.winner
      ? [`${L} WENT UNDER · ${W} WENT IN AFTER`, `${W} FOLLOWS ${L} DOWN`, `MAN OVERBOARD · ${W} DIVES IN`, ctx.how ? `${ctx.how} · AND DOWN THEY BOTH GO` : `${L} SINKS · ${W} DIVES`]
      : ['NOBODY SCORED · THE SEA TAKES THEM BOTH'];
    const subLine = pick(rng, lines);
    const title = String(ctx.to.name || '').toUpperCase().split('').join(' ');
    // a few bubble blips for the churn, ever thicker toward the swap
    const blips = [];
    for (let i = 0; i < 30; i++) blips.push({ t: 0.08 + (T.swap - 0.1) * Math.sqrt(rng()), f: rand(rng, 320, 950), pan: rand(rng, -0.7, 0.7), g: rand(rng, 0.025, 0.06) });
    for (let i = 0; i < 8; i++) blips.push({ t: rand(rng, 3.75, 4.3), f: rand(rng, 600, 1300), pan: rand(rng, -0.5, 0.5), g: rand(rng, 0.015, 0.03) });
    const sprites = makeSprites(stripe);

    // --- GPU --------------------------------------------------------------------------------
    // srgb: false — the pass hands texels straight back, so frame 0 is the old world to the bit.
    const texFrom = canvasTexture(THREE, ctx.fromImage, { srgb: false });
    let texTo = null;
    const V2 = (x, y) => new THREE.Vector2(x, y), V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    const hazeCol = V3(rgb01(mixHex(pal.bg, '#0f4a55', 0.6)));
    const pass = fullscreenPass(THREE, {
      fragmentShader: WATER_FRAG,
      uniforms: {
        tFrom: { value: texFrom }, tTo: { value: texFrom },
        uT: { value: 0 }, uAspect: { value: 1 }, uSeed: { value: foamSeed }, uSide: { value: 0 },
        uZoom: { value: 1 }, uZoomC: { value: V2(plumeX, 0.5) },
        uScroll: { value: 0 }, uSeam: { value: surfLike ? 0.78 : -0.03 }, uSeamLine: { value: 0 }, uUnder: { value: 0 }, uWob: { value: 0 },
        uFoam: { value: 0 }, uClear: { value: 1 }, uPlume: { value: V2(plumeX, 0.1) }, uFoamHi: { value: V3(rgb01(mixHex('#f4fdff', pal.fg, 0.25))) },
        uShaft: { value: 0 }, uSweep: { value: 0 }, uTilt: { value: tilt }, uShaftCol: { value: V3([1, 0.86, 0.6]) },
        uHaze: { value: 0 }, uHazeCol: { value: hazeCol },
        uVig: { value: 0 }, uAlpha: { value: 1 },
      },
    });
    try { renderer.compile(pass.scene, pass.camera); } catch { /* compiled on first use instead */ }
    let deep = mixHex(pal.bg, '#02101a', 0.3);

    // The new world's first frame, once: its texture, and its average colour for the haze.
    function adoptTo(img) {
      texTo = canvasTexture(THREE, img, { srgb: false });
      pass.uniforms.tTo.value = texTo;
      try {
        const p = makeCanvas(4, 4);
        p.g.drawImage(img, 0, 0, 4, 4);
        const d = p.g.getImageData(0, 0, 4, 4).data;
        let r = 0, gg = 0, b = 0;
        for (let i = 0; i < 64; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
        const avg = [r / 16 / 255, gg / 16 / 255, b / 16 / 255];
        const tint = rgb01(mixHex(pal.bg, '#0f4a55', 0.5));
        hazeCol.set(lerp(avg[0], tint[0], 0.35) * 1.15, lerp(avg[1], tint[1], 0.35) * 1.15, lerp(avg[2], tint[2], 0.35) * 1.15);
        deep = mixHex('#' + avg.map((v) => Math.round(v * 255 * 0.35).toString(16).padStart(2, '0')).join(''), '#02080e', 0.3);
        p.canvas.width = p.canvas.height = 1;
      } catch { /* keep the palette's haze */ }
    }

    // --- sound: one-shots keyed to the timeline ------------------------------------------------
    const cues = [];
    const cue = (t, fn) => cues.push({ t, fn });
    const note = (f, gain, pan = 0, dur = 1.2, delay = 0) => {
      A.tone({ type: 'sine', freq: f, dur, gain, attack: 0.01, pan, delay });
      A.tone({ type: 'triangle', freq: f * 2.003, dur: dur * 0.35, gain: gain * 0.25, attack: 0.005, pan, delay });
    };
    cue(0, () => {
      // the surf's roar, muffled as the lens goes under
      A.noise({ filter: 'lowpass', freq: 5200, freqEnd: 320, q: 0.6, dur: 1.5, gain: 0.5, attack: 0.01 });
      A.noise({ filter: 'bandpass', freq: 900, freqEnd: 240, q: 0.7, dur: 1.6, gain: 0.22, attack: 0.05 });
      A.tone({ freq: 60, freqEnd: 44, dur: 1.4, gain: 0.12, attack: 0.05 });
    });
    for (const b of blips) cue(b.t, () => A.tone({ type: 'sine', freq: b.f, freqEnd: b.f * 2.4, dur: 0.06, gain: b.g, attack: 0.004, pan: b.pan }));
    cue(0.62, () => A.sfx('whoosh', { gain: 0.35, pitch: 0.55 }));
    cue(0.95, () => A.noise({ filter: 'bandpass', freq: 220, freqEnd: 1500, q: 1.4, dur: 0.7, gain: 0.26, attack: 0.62 })); // the curtain boiling up
    cue(T.swap - 0.03, () => {
      A.tone({ freq: 74, freqEnd: 33, dur: 1.5, gain: 0.42, attack: 0.006 });
      A.noise({ filter: 'lowpass', freq: 420, freqEnd: 80, q: 0.8, dur: 1.3, gain: 0.5, attack: 0.004 });
      A.sfx('thud', { gain: 0.45, pitch: 0.55 });
    });
    cue(T.swap + 0.06, () => {
      // the hush: low water and a calm open fifth under everything that follows
      A.noise({ filter: 'lowpass', freq: 340, freqEnd: 200, q: 0.5, dur: 2.9, gain: 0.2, attack: 0.5 });
      A.tone({ freq: 110, dur: 2.8, gain: 0.05, attack: 0.7 });
      A.tone({ freq: 164.81, dur: 2.6, gain: 0.032, attack: 0.9 });
    });
    cue(1.92, () => {
      // one deep breath
      A.noise({ filter: 'bandpass', freq: 650, freqEnd: 1500, q: 0.9, dur: 0.85, gain: 0.2, attack: 0.65 });
      A.noise({ filter: 'highpass', freq: 2600, dur: 0.8, gain: 0.045, attack: 0.6 });
    });
    if (!cast.draw) cue(1.98, () => { A.sfx('swoosh', { gain: 0.3, pitch: 0.6, pan: cast.winner.side * 0.2 }); A.noise({ filter: 'bandpass', freq: 520, freqEnd: 240, q: 1.1, dur: 0.8, gain: 0.14, attack: 0.05 }); });
    const scale = [587.33, 739.99, 880, 987.77];
    T.beats.forEach((bt, i) => {
      cue(bt, () => {
        note(scale[i], 0.055, i % 2 ? 0.3 : -0.3, 1.3);
        A.tone({ type: 'sine', freq: 520 + i * 90, freqEnd: 1300 + i * 200, dur: 0.07, gain: 0.04, attack: 0.003 });
        if (order[i] === 2) A.sfx('click', { gain: 0.45, pitch: 0.8 });
        if (order[i] === 0) A.tone({ type: 'sine', freq: 1900, freqEnd: 2300, dur: 0.08, gain: 0.015, attack: 0.01, delay: 0.05 });
      });
    });
    cue(2.15, () => { A.tone({ freq: 1318.5, dur: 1.8, gain: 0.016, attack: 0.7 }); A.tone({ freq: 1975.5, dur: 1.5, gain: 0.009, attack: 0.8 }); });
    cue(T.shoal0 + 0.15, () => A.noise({ filter: 'bandpass', freq: 2600, freqEnd: 1100, q: 2, dur: 1.0, gain: 0.07, attack: 0.4, pan: Math.cos(shoal.ang) > 0 ? -0.4 : 0.4 }));
    cue(kraken.t0 - 0.05, () => {
      A.tone({ freq: 41, freqEnd: 31, dur: 1.6, gain: 0.34, attack: 0.25 });
      A.tone({ type: 'sawtooth', freq: 55, freqEnd: 49, dur: 1.0, gain: 0.016, attack: 0.35 });
      A.noise({ filter: 'lowpass', freq: 170, dur: 1.3, gain: 0.18, attack: 0.3 });
    });
    cue(T.cap0 + 0.1, () => note(659.25, 0.035, 0, 1.5));
    if (ctx.matchPoint) [2.45, 3.25].forEach((t) => cue(t, () => A.sfx('heartbeat', { gain: 0.45, pitch: 0.8 })));
    cues.sort((a, b) => a.t - b.t);
    let cueAt = 0;

    // --- the drawn layer --------------------------------------------------------------------
    const PT = { x: 0, y: 0 };
    const beatOf = (i, who) => T.beats[order.indexOf(i)] + (who === (firstW ? 0 : 1) ? 0 : 0.12);
    // where each gear beat glints, in the diver's own frame
    const partAt = (d, i, out) => {
      const J = d.J;
      if (i === 0) return toScreen(d, J.hx + 0.06, J.hy - 0.01, out);
      if (i === 1) return toScreen(d, (J.afx + J.abx) / 2, (J.afy + J.aby) / 2, out);
      return toScreen(d, J.hfx + Math.sin(d.pose.fa2) * 0.25, J.hfy + Math.cos(d.pose.fa2) * 0.25, out);
    };
    function spark(g, x, y, s, a, col) {
      if (a <= 0.01) return;
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = a;
      const gr = g.createRadialGradient(x, y, 0, x, y, s);
      gr.addColorStop(0, rgba('#ffffff', 0.9));
      gr.addColorStop(0.3, rgba(col, 0.4));
      gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr;
      g.fillRect(x - s, y - s, s * 2, s * 2);
      g.fillStyle = '#ffffff';
      g.beginPath();
      for (let k = 0; k < 4; k++) {
        const an = (k * Math.PI) / 2 + 0.3, r = k % 2 ? s * 0.7 : s * 1.1;
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(an - 0.09) * s * 0.12, y + Math.sin(an - 0.09) * s * 0.12);
        g.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r);
        g.lineTo(x + Math.cos(an + 0.09) * s * 0.12, y + Math.sin(an + 0.09) * s * 0.12);
      }
      g.fill();
      g.restore();
    }

    // How clear the water is at height y (0 top, 1 bottom): the curtain drains from the
    // bottom up, and nothing behind it may show through before it has.
    function seen(t, y) {
      const thr = -0.25 + ease.outQuad(seg(t, T.clear0, T.clear1)) * 1.5;
      const f = (1 - y) * 0.55 + 0.2;
      const k = clamp01((f - thr) / 0.24);
      return 1 - k * k * (3 - 2 * k);
    }

    function drawLayer(g, t, w, h) {
      // far below first, then the divers, then what passes close to the lens
      drawKraken(g, kraken, t, w, h, deep);
      const divers = cast.list;
      for (const d of divers) {
        const who = d === cast.winner ? 0 : 1;
        for (let i = 0; i < 3; i++) d.swap[i] = seg(t, beatOf(i, who), beatOf(i, who) + 0.38);
        stepDiver(d, t, w, h);
        d.alpha *= seen(t, d.y / h - 0.1);
      }
      // the arrow-straight dive streams bubbles from its heels
      const wd = cast.winner;
      if (!cast.draw && t > 1.9 && t < 3.4) {
        for (let k = 0; k < 16; k++) {
          const te = t - k * 0.045;
          if (te < 1.92) break;
          const age = t - te, a = (1 - k / 16) * (1 - seg(t, 2.9, 3.4)) * 0.85 * seen(t, wd.y / h - 0.3);
          const s = Math.sin(k * 91.7) * 43758.5, u = s - Math.floor(s);
          const r = h * (0.004 + 0.008 * u);
          const x = wd.x + (u - 0.5) * wd.L * 0.18 + Math.sin(age * 9 + k) * h * 0.004;
          const y = wd.y - wd.L * 0.42 * Math.max(0, -Math.cos(wd.rot)) - h * 0.1 * age * (1 + 2 * age) + (k * h * 0.012);
          g.globalAlpha = a;
          g.drawImage(sprites.bubble, x - r, y - r, r * 2, r * 2);
        }
        g.globalAlpha = 1;
      }
      for (const d of divers) drawDiver(g, d, t, pal.accent);
      // each gear beat: a glint where the kit changes, and a puff of bubbles
      for (const d of divers) {
        if (d.alpha < 0.05) continue;
        const who = d === cast.winner ? 0 : 1;
        for (let i = 0; i < 3; i++) {
          const t0 = beatOf(i, who), u = t - t0;
          if (u < -0.05 || u > 1.1) continue;
          partAt(d, i, PT);
          spark(g, PT.x, PT.y, d.L * 0.22 * (0.6 + 0.6 * ease.outCubic(seg(u, 0, 0.25))), d.alpha * pulse(t, t0 - 0.02, t0 + 0.42, 0.12), d.col);
          drawPuff(g, sprites.bubble, PT.x, PT.y, t, t0, h, i * 7 + who * 3 + 1, 6);
        }
      }
      drawShoal(g, shoal, sprites, t, w, h);
      // names in their colours, while the two are close enough to tell apart
      if (!cast.draw) {
        const fs = clamp(h * 0.022, 10, 17);
        g.font = `600 ${fs}px 'JetBrains Mono', 'Menlo', monospace`;
        g.textBaseline = 'middle';
        for (const d of divers) {
          const a = d.alpha * pulse(t, d === cast.winner ? 2.42 : 2.05, 3.45, 0.25);
          if (a <= 0.01 || !d.name) continue;
          toScreen(d, d.J.hx, d.J.hy, PT);
          const side = d.side, x = clamp(PT.x + side * d.L * 0.3, fs, w - fs), y = clamp(PT.y - d.L * 0.12, fs, h - fs);
          g.textAlign = side > 0 ? 'left' : 'right';
          g.globalAlpha = a;
          g.fillStyle = 'rgba(2,12,18,0.55)';
          g.fillText(d.name, x + 1, y + 1);
          g.fillStyle = mixHex(d.col, '#ffffff', 0.25);
          g.fillText(d.name, x, y);
          g.strokeStyle = rgba(d.col, 0.7);
          g.lineWidth = 1;
          const tw = g.measureText(d.name).width;
          g.beginPath();
          g.moveTo(x - (side > 0 ? 0 : tw), y + fs * 0.75);
          g.lineTo(x + (side > 0 ? tw : 0), y + fs * 0.75);
          g.stroke();
        }
        g.globalAlpha = 1;
      }
    }

    function caption(g, t, w, h) {
      const a = ease.outSine(seg(t, T.cap0, T.cap0 + 0.45)) * (1 - ease.inSine(seg(t, T.cap1 - 0.4, T.cap1)));
      if (a <= 0.01) return;
      const rise = (1 - ease.outCubic(seg(t, T.cap0, T.cap0 + 0.7))) * h * 0.015;
      const y = h * 0.79 + rise;
      g.save();
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.globalAlpha = a;
      const big = fitText(g, title, w * 0.7, clamp(h * 0.062, 22, 64), `'Rajdhani', 'Futura', sans-serif`);
      g.font = `600 ${big}px 'Rajdhani', 'Futura', sans-serif`;
      g.shadowColor = rgba('#000000', 0.45);
      g.shadowBlur = 10;
      g.fillStyle = pal.fg;
      g.fillText(title, w / 2, y);
      g.shadowBlur = 0;
      const fs = fitText(g, subLine, w * 0.84, clamp(h * 0.019, 9, 15), `'JetBrains Mono', 'Menlo', monospace`);
      g.font = `500 ${fs}px 'JetBrains Mono', 'Menlo', monospace`;
      g.fillStyle = rgba(pal.fg, 0.78);
      g.fillText(subLine, w / 2, y - big * 0.62 - fs * 0.4);
      const lw = Math.min(w * 0.18, big * 3) * ease.outCubic(seg(t, T.cap0 + 0.1, T.cap0 + 0.8));
      g.strokeStyle = rgba(pal.fg, 0.5);
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(w / 2 - lw, y + big * 0.62);
      g.lineTo(w / 2 + lw, y + big * 0.62);
      g.stroke();
      if (ctx.matchPoint) {
        g.font = `700 ${fs}px 'JetBrains Mono', 'Menlo', monospace`;
        g.fillStyle = pal.accent;
        g.fillText('MATCH POINT', w / 2, y + big * 0.62 + fs * 1.3);
      }
      g.restore();
    }

    return {
      update(dt, t) {
        while (cueAt < cues.length && t >= cues[cueAt].t) cues[cueAt++].fn();
      },

      render(t) {
        const g = ctx.g, w = ctx.width, h = ctx.height, u = pass.uniforms;
        renderer.setRenderTarget(null);
        const to = ctx.toImage;
        if (to && !texTo) adoptTo(to);
        u.uT.value = t;
        u.uAspect.value = w / h;
        if (t < T.swap || !texTo) {
          // ===== ACT 1: down through the old world into the curtain ===========================
          const k = seg(t, 0, 1.25);
          u.uSide.value = 0;
          u.uScroll.value = (surfLike ? 0.32 : 1.1) * ease.inOutSine(k);
          u.uSeamLine.value = surfLike ? 0 : seg(t, 0.02, 0.2);
          u.uUnder.value = surfLike ? 0.3 * ease.inQuad(k) : 0;
          u.uZoom.value = 1 + 0.1 * ease.inQuad(seg(t, 0.05, T.swap));
          u.uZoomC.value.set(plumeX, 0.45);
          u.uWob.value = 1.6 * ease.inQuad(seg(t, 0.04, 1.2));
          u.uFoam.value = t >= T.swap ? 1 : ease.inQuad(seg(t, 0.15, T.full));
          u.uClear.value = t >= T.swap ? 0 : 1;
          u.uPlume.value.set(plumeX, 0.08 + 0.3 * seg(t, 0, T.full));
          u.uShaft.value = 0.32 * seg(t, 0.08, 0.7);
          u.uShaftCol.value.set(1, 0.86, 0.6);
          u.uSweep.value = shaftDir * t * 0.05;
          u.uHaze.value = 0;
          u.uVig.value = 0.25 * ease.inQuad(seg(t, 0.1, 1.2));
          u.uAlpha.value = 1;
        } else {
          // ===== ACT 2: the curtain drains away from the new world ============================
          u.uSide.value = 1;
          u.uFoam.value = 0;
          u.uClear.value = ease.outQuad(seg(t, T.clear0, T.clear1));
          const settle = ease.inOutCubic(seg(t, T.swap, T.last));
          u.uZoom.value = 1 + 0.12 * (1 - settle);
          u.uZoomC.value.set(0.5, 0.75);
          u.uWob.value = 1.3 * (1 - ease.inOutSine(seg(t, T.swap, T.last - 0.05)));
          u.uHaze.value = 0.55 * (1 - ease.inOutSine(seg(t, 1.72, T.last)));
          u.uShaft.value = 0.42 * pulse(t, 1.8, T.last - 0.05, 0.6);
          u.uShaftCol.value.set(0.62, 0.95, 0.88);
          u.uSweep.value = shaftDir * (0.08 + (t - T.swap) * 0.14);
          u.uVig.value = 0.3 * (1 - ease.inOutSine(seg(t, 3.4, T.last)));
          u.uAlpha.value = 1 - ease.inOutSine(seg(t, T.fade0, T.fade1));
        }
        pass.render(renderer);

        // ===== the drawn layer =================================================================
        if (t <= 0) return; // frame 0 is the old world, nothing on top
        const gain = t < T.swap ? seg(t, 0.03, 0.4) : 1;
        if (t >= T.swap && texTo) drawLayer(g, t, w, h);
        const ceil = t < T.swap ? (1 - u.uSeam.value - u.uScroll.value) * h : 0;
        drawBubbles(g, bubbles, sprites.bubble, t, w, h, T, gain, ceil);
        caption(g, t, w, h);
      },

      dispose() {
        for (const o of [texFrom, texTo, pass]) if (o) o.dispose();
        sprites.dispose();
        renderer.setRenderTarget(null);
      },
    };
  },
};
