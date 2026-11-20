// BROKEN REALITY — the kill shot cracks the world like a pane of glass.
//
// CONCEPT
//   The last frame of the old world turns out to be a sheet of glass, and the round that
//   won the point has gone through it. Cracks race out from the impact, the pane holds
//   for one breath, and then reality shatters into real shards — bevelled slabs carrying
//   pieces of the old picture — that fall away into the space between dimensions: a deep
//   volume lit by the next world's colours, where fragments of other realities drift past.
//   The camera pushes through the falling glass towards a far light; out of it an intact,
//   smoked pane rushes up, catches the light, and its glint is the white of the swap. What
//   comes out of the white is the same accident run backwards: the next world's shards fly
//   in, seal, and the last crack heals with a shimmer.
//
// BEAT SHEET (10.6 s, swap at 6.36 s)
//   0.00         the old world, untouched (drawn pixel for pixel: the cut in is invisible)
//   0.07         IMPACT at ctx.focus — a ping, a point of white; a tag names shot and shooter
//   0.07 → 1.12  cracks run out in three surges, further along some bearings than others, a
//                ring of bent light ahead of them; facets slip; STRUCTURAL INTEGRITY falls from 100 %
//   1.12 → 1.60  the hush: creaks; light from the far side gathers in the cracks
//   1.60         the last cracks close the net — integrity 0 %
//   1.80         SHATTER: a shock wave from the impact releases the shards
//   1.8  → 4.9   the void: the camera pushes through the glass and past other realities,
//                while the next world's colour floods the fog; a caption says what happened,
//                the score lands under it
//   4.94 → 6.16  out of the far light an intact pane rushes up, tilting flat; glass and
//                fragments are blown out of its way
//   5.92 → 6.17  the glint: it catches the light and the screen goes white (opaque)
//   6.36         THE SWAP, held on white
//   6.46 → 6.96  the white draws back into the far light: the next world, in pieces; its title,
//                broken in two, on a ribbon
//   7.1  → 8.65  the rewind: every shard flies home and seals with a spark of light
//   7.81         the title's two halves snap together
//   8.75 → 9.85  the cracks heal back towards one point; the last one closes on a glint
//   10.18→ 10.53 the overlay fades onto the live world
//
// AXES OF VARIATION (all drawn once from ctx.rng in create())
//   1. the fracture — an impact web, cells or long slivers; 45 to 130 shards; which
//      bearings the cracks favour (the old pane and the new one are broken independently)
//   2. the fall — blown TOWARD the lens, SUCKED down a spiral into the far light, SPUN
//      into a helix around the camera's path, or dropped like a CURTAIN
//   3. the camera — dolly with a roll, a banking arc, a corkscrew, or a dive
//   4. the void — nebula, god rays or a ruled lattice corridor; and which other realities
//      drift in it, how many, and laid out as a corridor, a ring, a spiral or a scatter
//   5. the arrival — the shards rewind from an explosion, wind in as a vortex, rain into
//      place row by row, or the frosted pane flips over tile by tile
//   6. the order of sealing — outwards, inwards or swept across — and where the last crack heals
//   7. the words — the impact tag, the integrity label, the caption, the title's overline
//
// CONTEXT
//   ctx.focus is where the pane breaks and where the shock wave starts; the tag on it gives
//   ctx.how and winner ▸ loser in their colours; the gauge names the old world; the caption
//   is about who broke what (a drawn round has its own lines); the score row marks who just
//   scored and flags match point; the old frame is the picture in the shards and a keepsake
//   among the other realities; the old world's accent colours the fog near the break and
//   the next world's bleeds in with depth and lights every edge; the next world's name,
//   perspective and tagline are the title that heals with the glass.
import { seg, ease, clamp, clamp01, lerp, rand, randInt, pick, randSign, shuffle, mixHex, luminance, hexToRgb, canvasTexture, makeCanvas, fullscreenPass, hashSeed, makeRng, TAU } from '../kit.js';
import { PLAYER_COLORS } from '../contract.js';
import * as SH from './shatter/shaders.js';
import { fracture, looseCell, buildShards, PATTERNS } from './shatter/fracture.js';
import { buildAtlas, COLS, ROWS } from './shatter/worlds.js';
import { drawAct1, drawVoid, drawTitle, drawSeal } from './shatter/overlay.js';

const DURATION = 10.6, SWAP_AT = 0.6;
const D0 = 1 / Math.tan((42 * Math.PI) / 360); // camera distance at which a pane of half-height 1 fills a 42° lens
const LEVELS = 4;

function timeline() {
  const D = DURATION, swap = D * SWAP_AT;
  return {
    D, swap, impact: 0.07, crack1: 1.12, crack2: 1.6, shatter: 1.8,
    pane0: swap - 1.42, pane1: swap - 0.2, white0: swap - 0.44, white1: swap - 0.19,
    clear0: swap + 0.1, clear1: swap + 0.6, title: swap + 0.32, land0: swap + 0.74, land1: D - 1.95,
    mend: swap + 1.45, heal0: D - 1.85, heal1: D - 0.75, titleOut: D - 1.4, out0: D - 0.42, out1: D - 0.07,
  };
}

const rgb = (hex, k = 1) => { const c = hexToRgb(hex); return [(c.r / 255) * k, (c.g / 255) * k, (c.b / 255) * k]; };
const fingerOf = (F, a) => 0.62 + 0.38 * Math.sin(a * F[0] + F[1]) * Math.sin(a * F[2] + F[3]); // must match FINGER in shaders.js

export default {
  id: 'shatter',
  name: 'BROKEN REALITY',
  duration: DURATION,
  swapAt: SWAP_AT,

  create(ctx) {
    const { THREE, renderer } = ctx.three;
    // All chance comes from ctx.rng — passed once through a hash, because this film spends its
    // first few draws on its biggest choices and the seeds of one match's rounds sit close together.
    const rng = makeRng(hashSeed(ctx.rng(), ctx.rng(), ctx.seed));
    const T = timeline(), A = ctx.audio;
    // One colour space for screen and targets alike: programs are keyed on it, and every
    // shader here writes display values straight out (the first frame must be the old frame).
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    // --- the cast, decided once --------------------------------------------------------------
    const A0 = clamp(ctx.width / Math.max(1, ctx.height), 0.5, 3.2); // the pane's half-width (its half-height is 1)
    const fall = pick(rng, ['toward', 'sucked', 'spun', 'curtain']);
    const camPath = pick(rng, ['dolly', 'arc', 'cork', 'dive']);
    const voidKind = pick(rng, ['nebula', 'beams', 'lattice']);
    const arrive = pick(rng, ['explode', 'vortex', 'rain', 'flip']);
    const order = pick(rng, ['in', 'out', 'sweep']);
    const layout = pick(rng, ['corridor', 'ring', 'spiral', 'scatter']);
    const travel = { toward: 13, sucked: 17, spun: 15, curtain: 12 }[fall] + rand(rng, -1, 1);
    const cam = {
      side: randSign(rng), sy: randSign(rng), roll: rand(rng, 0.18, 0.5) * randSign(rng), turns: rand(rng, 0.55, 1.05),
      sway: rand(rng, 0.15, 0.4), rollC: rand(rng, 0.03, 0.08) * randSign(rng),
    };
    const swirl = rand(rng, 1.6, 3.6) * randSign(rng), spinDir = randSign(rng), rainDir = randSign(rng), sweepA = rng() * TAU;

    const focus = { x: clamp(ctx.focus.x / Math.max(1, ctx.width), 0.04, 0.96), y: clamp(ctx.focus.y / Math.max(1, ctx.height), 0.04, 0.96) };
    const fxp = (focus.x * 2 - 1) * A0, fyp = 1 - focus.y * 2;
    const heal = { x: rand(rng, 0.3, 0.7), y: rand(rng, 0.28, 0.72) };
    const hxp = (heal.x * 2 - 1) * A0, hyp = 1 - heal.y * 2;
    const farOf = (x, y) => Math.hypot(A0 + Math.abs(x), 1 + Math.abs(y));
    const maxA = farOf(fxp, fyp), maxB = farOf(hxp, hyp);
    const FA = [randInt(rng, 2, 4), rng() * TAU, randInt(rng, 5, 8), rng() * TAU];
    const FB = [randInt(rng, 2, 4), rng() * TAU, randInt(rng, 5, 8), rng() * TAU];

    // Everything a shard needs to know about itself for the rest of the film.
    const cast = (cells, far) => {
      for (const c of cells) {
        const a = c.dist > 1e-3 ? c.ang : rng() * TAU;
        c.ux = Math.cos(a); c.uy = Math.sin(a);
        const z = rand(rng, -1, 1), ph = rng() * TAU, s = Math.sqrt(1 - z * z);
        c.ax = [Math.cos(ph) * s, Math.sin(ph) * s, z];
        c.spin = rand(rng, 2.2, 6.5) * randSign(rng);
        c.r = [rng(), rng(), rng(), rng(), rng()];
        c.ta = rng() * TAU; c.tilt = rand(rng, 0.008, 0.03); c.zoff = rand(rng, -0.008, 0.008); c.ph = rng() * TAU;
        c.far = c.dist / far;
      }
      return cells;
    };
    const cellsA = cast(fracture(rng, pick(rng, PATTERNS), A0, fxp, fyp), maxA);
    const cellsB = cast(fracture(rng, pick(rng, PATTERNS), A0, hxp, hyp), maxB);
    for (const c of cellsA) c.rel = T.shatter + c.far * 0.34 + c.r[4] * 0.05; // the shock wave leaves the impact
    for (const c of cellsB) {
      let o = order === 'in' ? c.far : order === 'out' ? 1 - c.far : ((c.cx * Math.cos(sweepA) + c.cy * Math.sin(sweepA)) / Math.hypot(A0, 1) + 1) / 2;
      if (arrive === 'rain') o = rainDir > 0 ? (c.cy + 1) / 2 : 1 - (c.cy + 1) / 2; // a wall is built from the side it rests on
      c.land = lerp(T.land0, T.land1, clamp01(o * 0.9 + c.r[4] * 0.1));
    }

    // Other realities: loose panes strung along the way in.
    const nC = randInt(rng, 11, 19);
    const tiles = shuffle(rng, [0, 1, 2, 3, 4, 5, 6, 7]);
    const cellsC = [];
    for (let i = 0; i < nC; i++) {
      const c = looseCell(rng, rand(rng, 0.7, 1.55));
      const z = lerp(-2.6, -(travel + 8), (i + rng()) / nC);
      let a, r;
      if (layout === 'corridor') { a = (i & 1 ? Math.PI : 0) + rand(rng, -0.45, 0.45); r = rand(rng, 2.5, 4.2); }
      else if (layout === 'ring') { a = i * 2.39996; r = rand(rng, 2.7, 3.6); }
      else if (layout === 'spiral') { a = i * 0.85 + sweepA; r = 2.5 + i * 0.11; }
      else { a = rng() * TAU; r = rand(rng, 2.4, 5.2); }
      c.px = Math.cos(a) * r; c.py = Math.sin(a) * r * 0.72; c.pz = z;
      c.tile = tiles[i % 8];
      // Turned to face the traveller, more or less.
      const yaw = -Math.atan2(c.px, 6) + rand(rng, -0.5, 0.5), pitch = rand(rng, -0.4, 0.4);
      c.q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, rand(rng, -0.6, 0.6)));
      c.ax = new THREE.Vector3(rand(rng, -1, 1), rand(rng, -1, 1), rand(rng, -0.4, 0.4)).normalize();
      c.w = rand(rng, 0.12, 0.42) * randSign(rng);
      c.v = [rand(rng, -0.12, 0.12), rand(rng, -0.1, 0.1), rand(rng, -0.1, 0.25)];
      cellsC.push(c);
    }
    const cellsD = [{ pts: [[-A0, -1], [A0, -1], [A0, 1], [-A0, 1]], cx: 0, cy: 0, rad: Math.hypot(A0, 1) }];

    // --- colour ------------------------------------------------------------------------------
    const winner = ctx.winner, loser = ctx.loser;
    const pal = ctx.to.palette, palF = ctx.from.palette;
    const accentLight = luminance(pal.accent) < 0.3 ? mixHex(pal.accent, '#ffffff', 0.5) : pal.accent;
    const accentDark = mixHex(pal.accent, '#05040c', luminance(pal.accent) > 0.12 ? 0.62 : 0.2);
    const glowRgb = rgb(accentLight);
    const fromRgb = rgb(luminance(palF.accent) < 0.25 ? mixHex(palF.accent, '#ffffff', 0.45) : palF.accent);
    const hotRgb = rgb(luminance(pal.fg) > 0.4 ? pal.fg : mixHex(accentLight, '#ffffff', 0.6));
    // The void takes its hue from the next world's ground, however pale that is, and stays deep.
    const deepSrc = rgb(mixHex(pal.bg, pal.accent, 0.3)), deepMax = Math.max(deepSrc[0], deepSrc[1], deepSrc[2], 1e-3);
    const deepRgb = deepSrc.map((v) => (v / deepMax) * 0.085 + 0.012);

    // The Act 1 readouts are written on the old picture itself: ink them for how bright it is
    // (one sixteen-pixel-wide read-back, once).
    let paleFrom = luminance(palF.bg) > 0.45;
    try {
      const probe = makeCanvas(16, 9);
      probe.g.drawImage(ctx.fromImage, 0, 0, 16, 9);
      const px = probe.g.getImageData(0, 0, 16, 9).data;
      let sum = 0;
      for (let i = 0; i < px.length; i += 4) sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      paleFrom = sum / (144 * 255) > 0.52;
    } catch { /* keep the palette's word for it */ }
    const onFrom = (col) => (paleFrom ? mixHex(col, '#000000', 0.42) : col);

    // --- words -------------------------------------------------------------------------------
    const up = (s) => String(s || '').toUpperCase();
    const how = up(ctx.how), W = winner ? up(winner.name) : '', L = loser ? up(loser.name) : '';
    let quips;
    if (!winner) quips = ['NOBODY HIT ANYBODY. IT BROKE ANYWAY.', 'A DRAW. REALITY LOST.', 'TIME RAN OUT. SO DID THE WORLD.'];
    else {
      quips = [`${W} BROKE ${up(ctx.from.name)}`, `${L} NEVER SAW THE GLASS`, `SEVEN YEARS OF BAD LUCK, ${L}`, 'ONE SHOT. ONE WORLD LESS.', `${up(ctx.from.name)} WAS LOAD-BEARING`,
        `CLEAN THROUGH ${L} AND THE FOURTH WALL`, `${W} OWES SOMEBODY A WINDOW`];
      if (how) quips.push(`${how}. THE WORLD TOOK IT PERSONALLY.`, `ONE ${how}, ONE REALITY, GONE`);
      if (ctx.matchPoint) quips.push('ONE MORE SHOT ENDS EVERYTHING', `${W} IS ONE PANE FROM THE MATCH`);
    }
    const brk = () => ({ ang: rand(rng, -0.5, 0.5), off: rand(rng, -0.12, 0.12), dx: rand(rng, 0.012, 0.022), dy: rand(rng, 0.008, 0.018) * randSign(rng), rot: rand(rng, 0.025, 0.06) * randSign(rng) });
    const surge = (t) => 0.5 * ease.outExpo(seg(t, T.impact, T.impact + 0.3)) + 0.3 * ease.outExpo(seg(t, T.impact + 0.36, T.impact + 0.64)) + 0.2 * ease.outExpo(seg(t, T.impact + 0.7, T.crack1));
    const net = (t) => ease.outQuad(seg(t, T.crack2, T.crack2 + 0.13));
    const S = {
      T, focus, heal, glint: { x: 0.3, y: 0.2 }, accentLight, accentDark, warnCol: '#ff4d5e', shotCol: winner ? winner.color : '#ffffff',
      ink: paleFrom ? '#0a0a12' : '#ffffff', foot: paleFrom ? '255,255,255' : '4,4,10', warnInk: paleFrom ? '#c8102e' : '#ff4d5e', tagCol: winner ? onFrom(winner.color) : paleFrom ? '#0a0a12' : '#ffffff',
      tagOver: pick(rng, ['POINT OF IMPACT', 'ENTRY POINT', 'CRACK ORIGIN', 'FIRST FRACTURE']),
      tagMain: how || (winner ? 'ONE CLEAN SHOT' : 'STRAY ROUND'),
      tagSub: winner ? [{ text: W, color: onFrom(winner.color) }, { text: '  ▸  ', color: onFrom('#ffffff') }, { text: L, color: onFrom(loser.color) }] : [{ text: 'NO HIT · NO POINT', color: onFrom('#ffffff') }],
      integLabel: `${pick(rng, ['STRUCTURAL INTEGRITY', 'REALITY INTEGRITY', 'PANE INTEGRITY', 'FOURTH WALL'])} · ${up(ctx.from.name)}`,
      integrity: (t) => Math.max(0, Math.round(100 - 61 * surge(t) - 27 * Math.pow(seg(t, T.crack1, T.crack2), 1.4) - 12 * net(t))),
      voidOver: `${pick(rng, ['BETWEEN DIMENSIONS', 'NOWHERE, BRIEFLY', 'THE GAP BETWEEN WORLDS', 'OUTSIDE EVERYTHING', 'BEHIND THE GLASS'])} · AFTER ROUND ${ctx.round}`,
      quip: pick(rng, quips), breakQ: brk(), breakT: brk(),
      flag: ctx.matchPoint ? 'MATCH POINT' : '',
      players: [0, 1].map((i) => {
        const p = winner && winner.index === i ? winner : loser && loser.index === i ? loser : null;
        return { name: p ? up(p.name) : '', color: p ? p.color : PLAYER_COLORS[i], score: (ctx.score && ctx.score[i]) || 0, scored: !!winner && winner.index === i };
      }),
      title: up(ctx.to.name), tagline: ctx.to.tagline || '',
      titleOver: `${pick(rng, ['REALITY RESTORED AS', 'NOW SEALING', 'REASSEMBLING', 'NEW PANE INSTALLED', 'WORLD REPLACED WITH'])} · ${up(ctx.to.perspective) || 'A NEW DIMENSION'}`,
      titleFoot: `ROUND ${ctx.round + 1}${ctx.matchPoint ? '  ·  MATCH POINT' : ''}`,
    };

    // --- GPU ---------------------------------------------------------------------------------
    const texFrom = canvasTexture(THREE, ctx.fromImage, { srgb: false });
    const texAtlas = canvasTexture(THREE, buildAtlas(ctx, rng), { srgb: false });
    let texTo = null;

    const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    const rtOpts = { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false };
    const rtVoid = new THREE.WebGLRenderTarget(4, 4, rtOpts);
    // Multisampled: shard silhouettes are the whole picture. Two samples are enough where the screen is dense.
    const rtScene = new THREE.WebGLRenderTarget(4, 4, { ...rtOpts, depthBuffer: true, samples: ctx.dpr >= 1.5 ? 2 : 4 });
    const rtWarm = new THREE.WebGLRenderTarget(8, 8, { ...rtOpts, depthBuffer: true });
    const down = [], ups = [];
    for (let i = 0; i < LEVELS; i++) { down.push(new THREE.WebGLRenderTarget(4, 4, rtOpts)); if (i < LEVELS - 1) ups.push(new THREE.WebGLRenderTarget(4, 4, rtOpts)); }

    // Uniforms every piece of glass shares (same objects in every material).
    const G = {
      tVoid: { value: rtVoid.texture }, uRes: { value: new THREE.Vector2(1, 1) }, uHasVoid: { value: 0 }, uDirect: { value: 1 },
      uLightDir: { value: new THREE.Vector3(0, 0, -1) }, uLightCol: { value: V3(glowRgb) }, uKeyDir: { value: new THREE.Vector3(0, 0, 1) },
      uAmb: { value: V3(deepRgb.map((v, i) => v * 1.6 + glowRgb[i] * 0.05)) },
    };
    const scene = new THREE.Scene();
    const sets = [];
    function makeSet(cells, tImg, opt, own) {
      const n = Math.max(1, cells.length);
      const data = new Float32Array(n * 16);
      const tex = new THREE.DataTexture(data, 4, n, THREE.RGBAFormat, THREE.FloatType); // vertex texelFetch: no filtering needed
      const geo = buildShards(THREE, cells, opt);
      const mat = new THREE.ShaderMaterial({
        vertexShader: SH.SHARD_VERT, fragmentShader: SH.SHARD_FRAG,
        uniforms: {
          ...G, tPose: { value: tex }, tImg: { value: tImg }, uFocus: { value: new THREE.Vector2(0, 0) }, uFront: { value: 1e3 }, uSoft: { value: 0.05 }, uShimmer: { value: 0 },
          uFinger: { value: new THREE.Vector4(2, 0, 5, 0) }, uKey: { value: 1.3 }, uBroad: { value: 1 }, uGain: { value: 1 }, uMirror: { value: 0 }, uFrost: { value: 0 }, uJolt: { value: 0 }, uEdge: { value: 1 }, uSheen: { value: 0 }, uPar: { value: new THREE.Vector2(0, 0) }, uRipple: { value: new THREE.Vector3(0, 0, 34) },
          uTint: { value: new THREE.Vector3(0.9, 0.95, 1) }, uCrackCol: { value: new THREE.Vector3(1, 1, 1) }, uFrostCol: { value: V3(glowRgb.map((v) => lerp(0.97, v, 0.1))) }, ...own,
        },
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false; // the vertex shader moves everything
      mesh.visible = false;
      scene.add(mesh);
      const set = { n: cells.length, cells, data, tex, geo, mat, mesh, u: mat.uniforms };
      sets.push(set);
      return set;
    }
    const paneUv = (id, x, y, out) => { out[0] = x / (2 * A0) + 0.5; out[1] = y / 2 + 0.5; };
    const slab = { thick: 0.042, bevelW: 0.013, bevelD: 0.011, uvOf: paneUv };
    const tintMix = (k) => V3([lerp(0.92, glowRgb[0], k), lerp(0.96, glowRgb[1], k), lerp(1, glowRgb[2], k)]);
    const setA = makeSet(cellsA, texFrom, slab, { uFocus: { value: new THREE.Vector2(fxp, fyp) }, uFinger: { value: new THREE.Vector4(...FA) }, uJolt: { value: 0.011 }, uTint: { value: tintMix(0.12) } });
    const setB = makeSet(cellsB, texFrom, slab, { uFocus: { value: new THREE.Vector2(hxp, hyp) }, uFinger: { value: new THREE.Vector4(...FB) }, uJolt: { value: 0.011 }, uTint: { value: tintMix(0.12) }, uCrackCol: { value: V3(glowRgb.map((v) => lerp(v, 1, 0.45))) } });
    const setC = makeSet(cellsC, texAtlas, {
      thick: 0.06, bevelW: 0.03, bevelD: 0.02,
      uvOf: (id, x, y, out) => {
        const c = cellsC[id], col = c.tile % COLS, row = Math.floor(c.tile / COLS);
        out[0] = (col + 0.5 + clamp(x / c.rad, -1, 1) * 0.41) / COLS;
        out[1] = 1 - (row + 0.5 - clamp((y / c.rad) * 1.25, -1, 1) * 0.41) / ROWS;
      },
    }, { uGain: { value: 1.06 }, uTint: { value: tintMix(0.3) }, uCrackCol: { value: V3(glowRgb) }, uEdge: { value: 0 }, uSheen: { value: 0.45 }, uPar: { value: new THREE.Vector2(0.055 / COLS, 0.055 / ROWS) } });
    const setD = makeSet(cellsD, texFrom, { thick: 0.07, bevelW: 0.03, bevelD: 0.024, uvOf: paneUv }, {
      uTint: { value: V3(glowRgb.map((v, i) => v * 0.2 + deepRgb[i] * 1.2)) }, uCrackCol: { value: V3(glowRgb) }, uKey: { value: 1.5 }, uMirror: { value: 0.5 }, uEdge: { value: 0 }, uSheen: { value: 1 },
    });
    const camera = new THREE.PerspectiveCamera(42, A0, 0.04, 400);

    const v2 = () => new THREE.Vector2();
    const pCopy = fullscreenPass(THREE, { fragmentShader: SH.COPY_FRAG, uniforms: { tSrc: { value: texFrom } } });
    const pVoid = fullscreenPass(THREE, {
      fragmentShader: SH.VOID_FRAG,
      uniforms: {
        uCam: { value: new THREE.Matrix3() }, uPos: { value: new THREE.Vector3() }, uDeep: { value: V3(deepRgb) }, uGlow: { value: V3(glowRgb) }, uFrom: { value: V3(fromRgb) }, uHot: { value: V3(hotRgb) },
        uBox: { value: new THREE.Vector2(rand(rng, 5, 6.5), rand(rng, 3.2, 4.2)) }, uTan: { value: 1 }, uAspect: { value: 1 }, uTime: { value: 0 }, uTravel: { value: 0 }, uSeed: { value: rand(rng, 0, 40) },
        uLight: { value: 1 }, uBleed: { value: 0 }, uBeams: { value: voidKind === 'beams' ? 1 : 0.12 }, uLattice: { value: voidKind === 'lattice' ? 1 : 0 }, uDust: { value: voidKind === 'lattice' ? 0.5 : 0.9 },
        uCloud: { value: voidKind === 'nebula' ? 0.62 : voidKind === 'beams' ? 0.34 : 0.2 },
      },
    });
    const pDown = fullscreenPass(THREE, { fragmentShader: SH.DOWN_FRAG, uniforms: { tSrc: { value: null }, uTexel: { value: v2() }, uFirst: { value: 0 } } });
    const pUp = fullscreenPass(THREE, { fragmentShader: SH.UP_FRAG, uniforms: { tSrc: { value: null }, tAdd: { value: null }, uTexel: { value: v2() } } });
    const pGrade = fullscreenPass(THREE, {
      fragmentShader: SH.GRADE_FRAG, transparent: false,
      uniforms: {
        tScene: { value: rtScene.texture }, tBloom: { value: ups[0].texture }, uBloom: { value: 1 }, uFlash: { value: 0 }, uAlpha: { value: 1 }, uCA: { value: 0 }, uVig: { value: 0 }, uGrain: { value: 0 },
        uTime: { value: 0 }, uAspect: { value: 1 }, uFlashCol: { value: new THREE.Vector3(1, 1, 1) }, uFlashAt: { value: new THREE.Vector3(0.5, 0.5, 0) },
      },
    });

    const size = v2();
    let rtW = 0, rtH = 0;
    function sizeTargets() {
      renderer.getDrawingBufferSize(size);
      const k = ctx.dpr >= 1.5 ? 0.72 : 1; // everything off-screen is in motion: 1.44x CSS resolution is plenty
      const w = Math.max(16, Math.round(size.x * k)), h = Math.max(16, Math.round(size.y * k));
      if (w === rtW && h === rtH) return;
      rtW = w; rtH = h;
      rtScene.setSize(w, h);
      rtVoid.setSize(Math.max(8, w >> 1), Math.max(8, h >> 1));
      for (let i = 0; i < LEVELS; i++) {
        const lw = Math.max(2, w >> (i + 1)), lh = Math.max(2, h >> (i + 1));
        down[i].setSize(lw, lh);
        if (i < LEVELS - 1) ups[i].setSize(lw, lh);
      }
    }

    // --- poses: pure functions of t, written into each set's texture ---------------------------
    const put = (set, i, x, y, z, s, qx, qy, qz, qw, facet, pic, depth, glow, loose) => {
      const d = set.data, o = i * 16;
      d[o + 12] = loose;
      d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = s;
      d[o + 4] = qx; d[o + 5] = qy; d[o + 6] = qz; d[o + 7] = qw;
      d[o + 8] = facet; d[o + 9] = pic; d[o + 10] = depth; d[o + 11] = glow;
    };
    const q = [0, 0, 0, 1];
    const axisQ = (ax, ay, az, ang) => { const s = Math.sin(ang / 2); q[0] = ax * s; q[1] = ay * s; q[2] = az * s; q[3] = Math.cos(ang / 2); };
    // q = rotZ(th) * q
    const spinZ = (th) => {
      const s = Math.sin(th / 2), c = Math.cos(th / 2), x = q[0], y = q[1], z = q[2], w = q[3];
      q[0] = c * x - s * y; q[1] = c * y + s * x; q[2] = c * z + s * w; q[3] = c * w - s * z;
    };
    const camP = new THREE.Vector3(), camF = new THREE.Vector3(), tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion();
    const P = [0, 0, 0];
    // The incoming pane pushes a bow wave: whatever is still in the way is thrown clear of the camera's axis.
    const wake = (blow) => {
      if (blow <= 0) return;
      const rx = P[0] - camP.x, ry = P[1] - camP.y, rz = P[2] - camP.z, along = rx * camF.x + ry * camF.y + rz * camF.z;
      let lx = rx - camF.x * along, ly = ry - camF.y * along, lz = rz - camF.z * along;
      const len = Math.hypot(lx, ly, lz);
      if (len < 1e-3) { lx = 0; ly = 1; lz = 0; } else { lx /= len; ly /= len; lz /= len; }
      P[0] += lx * blow; P[1] += ly * blow; P[2] += lz * blow;
    };

    const frontA = (t) => maxA * (1.02 * surge(t) + 0.14 * seg(t, T.crack1, T.crack2) + 3.3 * net(t));
    const frontB = (t) => maxB * 4.4 * (1 - ease.inOutSine(seg(t, T.heal0, T.heal1)));
    const cracked = (c, F, front) => clamp01((front * fingerOf(F, c.ang) - (c.dist - c.rad)) / (2 * c.rad + 0.03));

    function poseA(t) {
      const front = frontA(t), trem = seg(t, T.crack2, T.shatter), blow = 7 * ease.inCubic(seg(t, T.pane0 + 0.15, T.pane1 - 0.1));
      const pulse = 1 + 1.6 * ease.inQuad(seg(t, T.crack1, T.shatter)) * (0.75 + 0.25 * Math.sin(t * 21));
      for (let i = 0; i < setA.n; i++) {
        const c = cellsA[i], tau = t - c.rel;
        if (t < T.shatter || tau <= 0) {
          // Still in the pane: cracked facets slip, and tremble just before they go.
          const ck = t < T.shatter ? cracked(c, FA, front) : 1;
          axisQ(Math.cos(c.ta), Math.sin(c.ta), 0, ck * c.tilt + trem * 0.007 * Math.sin(t * 83 + c.ph));
          put(setA, i, c.cx, c.cy, ck * c.zoff, 1, q[0], q[1], q[2], q[3], ck, 1, ck, pulse, 0.15 * ck);
          continue;
        }
        let scale = 1, ang;
        if (fall === 'toward') {
          // Blown at the lens, then hanging in slow motion while the camera drifts through.
          const Wb = 1 - Math.exp(-4.2 * tau), m = Wb + 0.16 * tau, back = c.r[0] < 0.3;
          const zb = back ? -lerp(0.6, 5.5, c.r[1]) : lerp(0.3, 2.4, c.r[1] * c.r[1]), sp = (0.15 + 0.75 * c.r[2]) * (0.35 + c.dist);
          P[0] = c.cx + c.ux * sp * m; P[1] = c.cy + c.uy * sp * m - 0.05 * tau * tau; P[2] = zb * m;
          ang = c.spin * (Wb * 1.2 + 0.28 * tau);
          axisQ(c.ax[0], c.ax[1], c.ax[2], ang);
        } else if (fall === 'sucked') {
          // A pop towards us, then down a spiral into the far light.
          const s = clamp01(tau / (2.3 + 0.9 * c.r[1])), e = s * s * s, pop = 1 - Math.exp(-6 * tau);
          const th = swirl * e * (0.6 + 0.8 * c.r[2]), k = Math.pow(1 - e, 0.7), co = Math.cos(th), si = Math.sin(th);
          P[0] = (c.cx * co - c.cy * si) * k; P[1] = (c.cx * si + c.cy * co) * k; P[2] = 0.3 * pop * (1 - e) - 46 * Math.pow(e, 1.3);
          axisQ(c.ax[0], c.ax[1], c.ax[2], c.spin * (pop * 0.5 + 2.4 * e + 0.2 * tau));
          scale = 1 - clamp01((s - 0.86) / 0.14);
        } else if (fall === 'spun') {
          // The pane becomes a wheel about the impact, and the wheel a helix down the camera's path.
          const Wb = 1 - Math.exp(-3 * tau), m = Wb + 0.22 * tau;
          const th = spinDir * (1.1 + 2.1 / (0.35 + c.dist)) * m, r = c.dist * (1 + 0.35 * m) + 0.25 * Wb, a = Math.atan2(c.uy, c.ux) + th;
          P[0] = fxp * (1 - 0.6 * clamp01(m)) + Math.cos(a) * r; P[1] = fyp * (1 - 0.6 * clamp01(m)) + Math.sin(a) * r; P[2] = lerp(1.5, -10.5, Math.pow(c.r[1], 0.8)) * m;
          axisQ(c.ax[0], c.ax[1], c.ax[2], c.spin * (0.5 * Wb + 0.2 * tau));
          spinZ(th);
        } else {
          // Dropped: a small kick, then gravity.
          const vy = 0.5 * (1 - c.far) * c.r[1];
          P[0] = c.cx + (c.ux * 0.16 + (c.r[2] - 0.5) * 0.3) * tau; P[1] = c.cy + vy * tau - 1.3 * tau * tau; P[2] = (c.r[3] * 1.7 - 0.55) * 0.6 * tau;
          axisQ(c.ax[0] * 0.5 + 0.8, c.ax[1] * 0.5, c.ax[2] * 0.5, c.spin * 0.45 * tau * (1 + tau)); // not unit: fixed below
          const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
          q[0] /= len; q[1] /= len; q[2] /= len; q[3] /= len;
        }
        wake(blow);
        put(setA, i, P[0], P[1], P[2], scale, q[0], q[1], q[2], q[3], 1, 1 - 0.4 * seg(tau, 0.4, 2.6), 1, 0.3 + 1.4 * Math.exp(-tau * 3), Math.min(1, 0.15 + tau * 3));
      }
      setA.tex.needsUpdate = true;
    }

    function poseC(t) {
      const dt = t - T.shatter, blow = 9 * ease.inCubic(seg(t, T.pane0 + 0.1, T.pane1 - 0.1));
      for (let i = 0; i < setC.n; i++) {
        const c = cellsC[i];
        P[0] = c.px + c.v[0] * dt; P[1] = c.py + c.v[1] * dt; P[2] = c.pz + c.v[2] * dt;
        wake(blow);
        tmpQ.setFromAxisAngle(c.ax, c.w * dt).premultiply(c.q0);
        put(setC, i, P[0], P[1], P[2], 1, tmpQ.x, tmpQ.y, tmpQ.z, tmpQ.w, 1, 0.94, 1, 0.5, 1);
      }
      setC.tex.needsUpdate = true;
    }

    // The intact pane, posed in the camera's own frame: out of the far light, onto the lens.
    const keyOff = [-0.3, 0.31];
    function poseD(t, tanY, aspect) {
      const k = seg(t, T.pane0, T.pane1), fit = Math.min(1, A0 / aspect) / tanY;
      const dist = fit + 85 * Math.pow(1 - k, 2.3);
      tmpV.set(0, 0, -1).transformDirection(camera.matrixWorldInverse); // where the far light is, seen from here
      const kc = Math.pow(1 - k, 1.4);
      P[0] = (tmpV.x / Math.max(0.2, -tmpV.z)) * dist * kc; P[1] = (tmpV.y / Math.max(0.2, -tmpV.z)) * dist * kc; P[2] = -dist;
      tmpV.set(P[0], P[1], P[2]).applyMatrix4(camera.matrixWorld);
      // It turns its face through the key light on the way to flat: that is the glint.
      const kl = Math.hypot(keyOff[0], keyOff[1]), tilt = 1.15 * Math.pow(1 - ease.outCubic(k), 1.2);
      tmpQ.setFromAxisAngle(camF.set(-keyOff[1] / kl, keyOff[0] / kl, 0), tilt);
      tmpQ2.setFromAxisAngle(camF.set(0, 0, 1), cam.side * 0.9 * (1 - ease.outCubic(k)));
      tmpQ.multiply(tmpQ2).premultiply(camera.quaternion);
      put(setD, 0, tmpV.x, tmpV.y, tmpV.z, 1, tmpQ.x, tmpQ.y, tmpQ.z, tmpQ.w, 1, 0, 1, 0.9, 1);
      setD.tex.needsUpdate = true;
      camera.getWorldDirection(camF); // restore: wake() reads it
    }

    function poseB(t) {
      const front = frontB(t);
      for (let i = 0; i < setB.n; i++) {
        const c = cellsB[i], tau = c.land - t, ck = cracked(c, FB, front);
        if (arrive === 'flip') {
          // Already in the pane, frosted side out; each tile turns over as the wave reaches it.
          // A flipped tile is its own mirror image and would not fit its hole, so this is a
          // split-flap: tip up to edge-on, change faces there, come down the other side.
          const e = ease.inOutCubic(seg(t, c.land - 0.62, c.land)), sig = Math.max(0, -tau), done = e >= 1;
          const fa = order === 'sweep' ? sweepA + Math.PI / 2 : c.ang + Math.PI / 2;
          const set = 0.15 + 0.85 * Math.exp(-sig * 6);
          axisQ(Math.cos(fa), Math.sin(fa), 0, (e < 0.5 ? Math.PI * e : Math.PI * (e - 1)) + (done ? ck * c.tilt : 0));
          put(setB, i, c.cx, c.cy, 0.32 * Math.sin(Math.PI * e) + (done ? ck * c.zoff : 0), 1, q[0], q[1], q[2], q[3],
            done ? ck * set : e > 0 ? 1 : 0.3, e < 0.5 ? 0 : 1, done ? ck * set : 1, done ? ck * (0.45 + 3 * Math.exp(-sig * 5)) : 0.6, done ? 0.1 * ck * set : e > 0 ? 1 : 0.1);
          continue;
        }
        if (tau <= 0) {
          // Home: pressed in, ringing, its seams lit for a moment.
          const sig = -tau, wob = Math.exp(-9 * sig), set = 0.15 + 0.85 * Math.exp(-sig * 6);
          axisQ(Math.cos(c.ta), Math.sin(c.ta), 0, ck * c.tilt);
          put(setB, i, c.cx, c.cy, ck * c.zoff - 0.02 * wob * Math.cos(24 * sig), 1, q[0], q[1], q[2], q[3], ck * set, 1, ck * set, ck * (0.45 + 3 * Math.exp(-sig * 5)), 0.1 * ck * set);
          continue;
        }
        // The fall, run backwards: tau is the time left until this shard is home.
        if (arrive === 'explode') {
          const Wb = 1 - Math.exp(-4.2 * tau), m = Wb + 0.2 * tau, back = c.r[0] < 0.26;
          const zb = back ? -lerp(0.5, 4, c.r[1]) : lerp(0.3, 2.6, c.r[1] * c.r[1]), sp = (0.2 + 0.8 * c.r[2]) * (0.4 + c.dist);
          P[0] = c.cx + c.ux * sp * m; P[1] = c.cy + c.uy * sp * m; P[2] = zb * m;
          axisQ(c.ax[0], c.ax[1], c.ax[2], c.spin * (Wb * 1.2 + 0.3 * tau));
        } else if (arrive === 'vortex') {
          const Wb = 1 - Math.exp(-3.2 * tau), m = Wb + 0.24 * tau;
          const th = spinDir * (0.9 + 1.5 / (0.4 + c.dist)) * m, r = c.dist * (1 + 0.4 * m) + 0.25 * Wb, a = Math.atan2(c.uy, c.ux) + th;
          P[0] = hxp + Math.cos(a) * r; P[1] = hyp + Math.sin(a) * r; P[2] = lerp(1.6, -7, Math.pow(c.r[1], 0.8)) * m;
          axisQ(c.ax[0], c.ax[1], c.ax[2], c.spin * (0.5 * Wb + 0.2 * tau));
          spinZ(th);
        } else {
          P[0] = c.cx + (c.r[2] - 0.5) * 0.45 * tau; P[1] = c.cy + rainDir * (1.3 * tau + 1.9 * tau * tau); P[2] = (c.r[3] - 0.3) * 0.9 * tau;
          axisQ(c.ax[0], c.ax[1], c.ax[2], c.spin * 0.4 * tau * (1 + tau));
        }
        put(setB, i, P[0], P[1], P[2], 1, q[0], q[1], q[2], q[3], 1, 1, 1, 0.35, 1);
      }
      setB.tex.needsUpdate = true;
    }

    // --- camera: a pure function of t --------------------------------------------------------
    let tanY = 1;
    function setCam(t) {
      const aspect = ctx.width / Math.max(1, ctx.height);
      const tan0 = Math.min(1, A0 / aspect) / D0; // the pane covers the screen whatever shape it is now
      let px = 0, py = 0, pz = D0, roll = 0, pitch = 0, lx = 0, ly = 0, lz = -1e4, wide = 1;
      if (t >= T.shatter && t < T.clear0) {
        const x = seg(t, T.shatter, T.white1), b = Math.sin(Math.PI * x), e = ease.inOutSine(x);
        pz = D0 - travel * (0.2 * x + 0.8 * Math.pow(x, 2.7));
        wide = 1 + 0.42 * ease.inOutSine(seg(x, 0, 0.45));
        if (camPath === 'dolly') {
          px = cam.sway * cam.side * Math.sin(Math.PI * x * 1.5); py = 0.5 * cam.sway * cam.sy * b; roll = cam.roll * e;
        } else if (camPath === 'arc') {
          px = cam.side * 1.2 * b; py = 0.3 * cam.sy * b; lz = pz - 7; roll = -cam.side * 0.3 * b;
        } else if (camPath === 'cork') {
          roll = cam.side * Math.PI * cam.turns * ease.inOutCubic(x); px = 0.45 * Math.sin(roll) * b; py = 0.3 * (1 - Math.cos(roll)) * b;
        } else {
          const dv = Math.sin(Math.PI * clamp01(x * 1.45));
          pitch = -0.4 * dv * dv; py = -0.8 * dv * dv; roll = cam.roll * 0.5 * e;
        }
        if (fall === 'curtain') { const gl = Math.sin(Math.PI * seg(x, 0.02, 0.5)); pitch -= 0.3 * gl * gl; } // watch it drop
      } else if (t >= T.clear0) {
        const e = 1 - ease.outCubic(seg(t, T.clear0, T.land1));
        pz = D0 + 0.5 * e; roll = cam.rollC * e;
      }
      tanY = tan0 * wide;
      camera.fov = (Math.atan(tanY) * 360) / Math.PI;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      camera.position.set(px, py, pz);
      camera.up.set(0, 1, 0);
      camera.lookAt(lx, ly, lz);
      camera.rotateZ(roll);
      camera.rotateX(pitch);
      camera.updateMatrixWorld(true);
      camP.copy(camera.position);
      camera.getWorldDirection(camF);
      // The key light sits behind the lens, up and to one side.
      G.uKeyDir.value.set(keyOff[0], keyOff[1], 1).normalize().transformDirection(camera.matrixWorld);
      return aspect;
    }

    // --- one frame of the off-screen film ----------------------------------------------------
    const only = (...on) => { for (const s of sets) s.mesh.visible = on.includes(s); };
    function film(t, aspect, bg, o) {
      const vu = pVoid.uniforms;
      vu.uCam.value.setFromMatrix4(camera.matrixWorld);
      vu.uPos.value.copy(camP);
      vu.uTan.value = tanY; vu.uAspect.value = aspect; vu.uTime.value = t; vu.uTravel.value = o.travel; vu.uLight.value = o.light; vu.uBleed.value = o.bleed;
      if (!o.still) { // once the pane is whole again nothing behind it can be seen: keep the last one
        renderer.setRenderTarget(rtVoid);
        pVoid.render(renderer);
      }

      G.uRes.value.set(rtW, rtH); G.uHasVoid.value = 1; G.uDirect.value = 0;
      pCopy.uniforms.tSrc.value = bg || rtVoid.texture;
      renderer.setRenderTarget(rtScene);
      pCopy.render(renderer); // clears colour and depth on the way
      renderer.autoClear = false;
      renderer.render(scene, camera);
      renderer.autoClear = true;

      let src = rtScene;
      for (let i = 0; i < LEVELS; i++) {
        pDown.uniforms.tSrc.value = src.texture;
        pDown.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
        pDown.uniforms.uFirst.value = i ? 0 : 1;
        renderer.setRenderTarget(down[i]);
        pDown.render(renderer);
        src = down[i];
      }
      for (let i = LEVELS - 2; i >= 0; i--) {
        pUp.uniforms.tSrc.value = src.texture;
        pUp.uniforms.uTexel.value.set(0.5 / src.width, 0.5 / src.height);
        pUp.uniforms.tAdd.value = down[i].texture;
        renderer.setRenderTarget(ups[i]);
        pUp.render(renderer);
        src = ups[i];
      }
      grade(t, o);
    }
    function grade(t, o) {
      const gu = pGrade.uniforms;
      gu.uAspect.value = ctx.width / Math.max(1, ctx.height);
      gu.uBloom.value = o.bloom; gu.uFlash.value = o.flash; gu.uAlpha.value = o.alpha; gu.uCA.value = o.ca; gu.uVig.value = o.vig; gu.uGrain.value = o.grain; gu.uTime.value = t;
      renderer.setRenderTarget(null);
      pGrade.render(renderer);
    }
    const look = { travel: 0, light: 1, bleed: 0, bloom: 1, flash: 0, alpha: 1, ca: 0, vig: 0, grain: 0, still: false };
    const WHITE = { bloom: 0, flash: 1, alpha: 1, ca: 0, vig: 0, grain: 0 };

    // Compile and upload what the void needs one piece per frame while the pane is still
    // whole, rather than all at once on the frame it breaks.
    const warmTo = (fn) => () => { renderer.setRenderTarget(rtWarm); fn(); renderer.setRenderTarget(null); };
    const warm = [
      warmTo(() => pVoid.render(renderer)),
      warmTo(() => { only(setC); renderer.render(scene, camera); }),
      warmTo(() => { only(setD); renderer.render(scene, camera); }),
      warmTo(() => { pDown.uniforms.tSrc.value = texFrom; pDown.render(renderer); }),
      warmTo(() => { pUp.uniforms.tSrc.value = pUp.uniforms.tAdd.value = texFrom; pUp.render(renderer); }),
      warmTo(() => pGrade.render(renderer)),
      warmTo(() => { only(setB); renderer.render(scene, camera); }),
    ];
    poseC(T.shatter);
    put(setD, 0, 0, 0, -50, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1);
    for (let i = 0; i < setB.n; i++) put(setB, i, cellsB[i].cx, cellsB[i].cy, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0);
    for (const s of sets) s.tex.needsUpdate = true;

    // --- sound: one-shots keyed to the timeline ------------------------------------------------
    const cues = [];
    const cue = (t, fn) => cues.push({ t, fn });
    const tickle = (gain, pan) => {
      A.noise({ filter: 'bandpass', freq: 3200 + pan * 900 + gain * 9000, q: 7, dur: 0.022, gain, attack: 0.001, pan });
      A.tone({ type: 'triangle', freq: 2100 + gain * 6000, dur: 0.03, gain: gain * 0.25, attack: 0.001, pan });
    };
    cue(T.impact, () => {
      A.tone({ freq: 3340, freqEnd: 2480, dur: 0.6, gain: 0.15, attack: 0.001 });
      A.tone({ freq: 5210, dur: 0.24, gain: 0.06, attack: 0.001 });
      A.noise({ filter: 'highpass', freq: 6200, dur: 0.05, gain: 0.32, attack: 0.001 });
      A.sfx('click', { gain: 0.9 });
    });
    // The cracks tick as they run: three flurries, each slowing as its surge spends itself.
    [0.02, 0.38, 0.72].forEach((s, n) => {
      for (let j = 0; j < 6 - n; j++) {
        const pan = rand(rng, -0.7, 0.7), gain = (0.2 - n * 0.04) * (1 - j * 0.1);
        cue(T.impact + s + 0.028 * j * Math.pow(1.32, j), () => tickle(gain, pan));
      }
    });
    cue(T.crack1 + 0.14, () => A.noise({ filter: 'bandpass', freq: 820, freqEnd: 1500, q: 14, dur: 0.2, gain: 0.12, attack: 0.03, pan: -0.3 }));
    cue(T.crack1 + 0.33, () => A.noise({ filter: 'bandpass', freq: 1300, freqEnd: 900, q: 14, dur: 0.14, gain: 0.08, attack: 0.02, pan: 0.4 }));
    cue(T.crack2, () => { A.sfx('tick', { gain: 0.8, pitch: 1.5 }); tickle(0.26, 0); A.noise({ filter: 'highpass', freq: 7000, dur: 0.09, gain: 0.2, attack: 0.001 }); });
    cue(T.shatter, () => {
      A.sfx('shatter', { gain: 1 });
      A.sfx('boom', { gain: 0.75 });
      A.noise({ filter: 'highpass', freq: 5200, freqEnd: 2400, q: 0.6, dur: 1.5, gain: 0.11, attack: 0.01 });
      // The room behind the glass: a low fifth that sits under the whole crossing.
      A.tone({ freq: 55, dur: 4.2, gain: 0.15, attack: 0.7 });
      A.tone({ freq: 82.4, dur: 3.9, gain: 0.07, attack: 1.1 });
      A.noise({ filter: 'bandpass', freq: 380, q: 0.6, dur: 3.8, gain: 0.05, attack: 1.2 });
    });
    for (let i = 0; i < 9; i++) {
      const f = rand(rng, 2300, 6600), pan = rand(rng, -0.8, 0.8), d = rand(rng, 0.12, 0.3);
      cue(T.shatter + 0.16 + i * 0.15 + rand(rng, 0, 0.1), () => A.tone({ freq: f, dur: d, gain: 0.034, attack: 0.001, pan }));
    }
    cue(T.shatter + 0.5, () => A.sfx('tick', { gain: 0.25, pitch: 0.7 }));
    cue(T.shatter + 1.25, () => A.sfx('blip', { gain: 0.35 }));
    cue(T.shatter + 1.3, () => A.sfx('swoosh', { gain: 0.3, pan: -0.6 * cam.side }));
    cue(T.shatter + 2.2, () => A.sfx('swoosh', { gain: 0.32, pan: 0.6 * cam.side, pitch: 1.2 }));
    cue(T.pane0 - 0.4, () => A.sfx('riser', { gain: 0.85 }));
    cue(T.pane0 + 0.2, () => A.sfx('whoosh', { gain: 0.8 }));
    cue(T.white0 - 0.05, () => { A.tone({ freq: 4186, dur: 0.7, gain: 0.07, attack: 0.002 }); A.tone({ freq: 6272, dur: 0.5, gain: 0.04, attack: 0.002 }); });
    cue(T.white1 - 0.04, () => { A.sfx('boom', { gain: 1 }); A.sfx('shatter', { gain: 0.45, pitch: 0.7, delay: 0.04 }); A.tone({ freq: 2637, dur: 1.1, gain: 0.02, attack: 0.05 }); });
    cue(T.title, () => A.sfx('thud', { gain: 0.6 }));
    // Glass going home: clinks that climb as the picture fills in.
    for (let i = 0; i < 12; i++) {
      const pan = i & 1 ? 0.55 : -0.55, f = 880 * Math.pow(2, (i * 1.5) / 12);
      cue(lerp(T.land0, T.land1, (i + 0.5) / 12) + (arrive === 'flip' ? 0 : -0.03), () => {
        A.tone({ type: 'triangle', freq: f, dur: 0.1, gain: 0.075, attack: 0.001, pan });
        A.noise({ filter: 'bandpass', freq: 5200, q: 5, dur: 0.016, gain: 0.12, attack: 0.001, pan });
      });
    }
    cue(T.mend + 0.12, () => A.sfx('click', { gain: 0.8 }));
    cue(T.land1, () => A.sfx('thud', { gain: 0.5, pitch: 1.3 }));
    cue(T.heal0, () => {
      A.noise({ filter: 'bandpass', freq: 2400, freqEnd: 9000, q: 3, dur: 1.1, gain: 0.07, attack: 0.5 });
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => A.tone({ type: i < 2 ? 'triangle' : 'sine', freq: f, dur: 1.4 - i * 0.15, gain: 0.06, delay: i * 0.2, pan: (i - 1.5) * 0.3, attack: 0.02 }));
    });
    cue(T.heal1 - 0.2, () => A.sfx('chime', { gain: 0.6 }));
    cues.sort((a, b) => a.t - b.t);
    let cueAt = 0;

    const crackCol = setA.u.uCrackCol.value, flashAt = pGrade.uniforms.uFlashAt.value, rip = setA.u.uRipple.value;

    return {
      update(dt, t) {
        while (cueAt < cues.length && t >= cues[cueAt].t) cues[cueAt++].fn();
      },

      render(t) {
        const g = ctx.g, w = ctx.width, h = ctx.height;
        sizeTargets();
        const aspect = setCam(t);

        if (t < T.shatter) {
          // ACT 1, drawn straight to the screen at full resolution: at t = 0 this is the old frame.
          if (warm.length && t > 0) warm.shift()();
          only(setA);
          poseA(t);
          const hush = ease.inQuad(seg(t, T.crack1, T.shatter));
          crackCol.set(lerp(1, lerp(glowRgb[0], 1, 0.35), hush), lerp(1, lerp(glowRgb[1], 1, 0.35), hush), lerp(1, lerp(glowRgb[2], 1, 0.35), hush));
          setA.u.uFront.value = frontA(t);
          setA.u.uShimmer.value = 0.7 * (1 - seg(t, T.crack2 + 0.1, T.shatter));
          setA.u.uKey.value = 0.16; setA.u.uBroad.value = 0;
          // Two rings: the impact, and the jolt when the last cracks join up.
          const r1 = t - T.impact, r2 = t - T.crack2;
          if (r2 > 0) rip.set(r2 * 5.5, 0.006 * (1 - seg(r2, 0, 0.2)), 34);
          else rip.set(Math.max(0, r1) * 3.4, r1 > 0 ? 0.0075 * (1 - ease.inQuad(seg(r1, 0, 0.95))) : 0, 34);
          renderer.getDrawingBufferSize(size);
          G.uRes.value.copy(size); G.uHasVoid.value = 0; G.uDirect.value = 1;
          pCopy.uniforms.tSrc.value = texFrom;
          renderer.setRenderTarget(null);
          pCopy.render(renderer); // under the shards, so a hairline gap between two of them can only ever show the picture
          renderer.autoClear = false;
          renderer.render(scene, camera);
          renderer.autoClear = true;
          drawAct1(g, w, h, t, S);
          return;
        }

        const to = ctx.toImage;
        if (t < T.white1) {
          // ACT 2: the void.
          only(setA, setC, t >= T.pane0 ? setD : null);
          setA.u.uFront.value = 1e3; setA.u.uShimmer.value = 0; setA.u.uKey.value = 1.3; setA.u.uBroad.value = 1; rip.set(0, 0, 34);
          poseA(t);
          poseC(t);
          if (t >= T.pane0) poseD(t, tanY, aspect);
          const since = t - T.shatter, bleed = ease.inOutSine(seg(t, T.shatter + 0.2, T.pane0));
          look.travel = D0 - camP.z;
          look.light = lerp(0.5, 1.2, ease.inQuad(seg(t, T.shatter, T.pane1)));
          look.bleed = bleed;
          look.bloom = 1.1;
          // Two flashes, each leaving a point: the break (from the impact) and the glint on the
          // incoming pane (from where the key light finds it), which grows into the white of the swap.
          const glint = ease.inQuad(seg(t, T.white0, T.white1)), burst = 0.55 * Math.exp(-since * 6);
          S.glint.x = 0.5 + (0.5 * keyOff[0]) / (tanY * aspect); S.glint.y = 0.5 - (0.5 * keyOff[1]) / tanY;
          if (glint > 0) flashAt.set(clamp01(S.glint.x), 1 - clamp01(S.glint.y), 1);
          else flashAt.set(focus.x, 1 - focus.y, 0.9);
          look.flash = Math.max(burst, glint);
          look.alpha = 1;
          look.ca = 0.004 + 0.03 * Math.exp(-since * 4) + 0.02 * seg(t, T.pane0, T.white1);
          look.vig = 0.55 * seg(since, 0, 0.5);
          look.grain = 0.045;
          look.still = false;
          film(t, aspect, null, look);
          drawAct1(g, w, h, t, S);
          drawVoid(g, w, h, t, S);
          return;
        }

        if (to && !texTo) {
          texTo = canvasTexture(THREE, to, { srgb: false });
          setB.u.tImg.value = texTo;
        }
        if (!to || t < T.clear0) {
          grade(t, WHITE); // held white: opaque, and nothing to hitch
          return;
        }

        // ACT 3: the same accident, backwards.
        only(setB);
        const healed = ease.inOutSine(seg(t, T.heal0, T.heal1)), calm = 1 - seg(t, T.heal0, T.heal1 - 0.1);
        setB.u.uFront.value = frontB(t);
        setB.u.uShimmer.value = t >= T.heal0 ? 1 : 0;
        setB.u.uKey.value = 1.3 * calm;
        setB.u.uFrost.value = arrive === 'flip' ? 1 : 0;
        poseB(t);
        look.travel = travel + (t - T.swap) * 0.9;
        look.light = lerp(1.0, 0.6, seg(t, T.clear0, T.land1));
        look.bleed = 1;
        look.bloom = 1.0 * (1 - healed);
        look.flash = 1 - ease.outCubic(seg(t, T.clear0, T.clear1));
        flashAt.set(0.5, 0.5, 0.8); // the white draws back into the far light
        look.alpha = 1 - ease.inOutSine(seg(t, T.out0, T.out1));
        look.ca = 0.004 * calm;
        look.vig = 0.5 * calm;
        look.grain = 0.04 * calm;
        look.still = t >= T.heal0 + 0.1;
        // Once every shard is home the picture itself goes underneath, so the seams cannot leak the void.
        film(t, aspect, t >= T.heal0 ? texTo : null, look);
        drawTitle(g, w, h, t, S);
        drawSeal(g, w, h, t, S);
      },

      dispose() {
        for (const s of sets) { s.geo.dispose(); s.mat.dispose(); s.tex.dispose(); }
        for (const o of [texFrom, texAtlas, texTo, rtVoid, rtScene, rtWarm, ...down, ...ups, pCopy, pVoid, pDown, pUp, pGrade]) if (o) o.dispose();
        renderer.setRenderTarget(null);
        renderer.autoClear = true;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
      },
    };
  },
};
