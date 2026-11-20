// LIFE FLASH — the loser's life flashes before their eyes.
//
// CONCEPT
//   The old world freezes and we push in hard on the impact point until it is the loser's
//   face, printed like a pulp poster in their identity colour: a marksman's squint, the
//   glint of the shot in both pupils, the shock. We fall through the pupil into a reel of
//   home movies — a whole invented life, from first steps to this morning's handshake with
//   the winner — each memory a small cut-paper scene on whatever the family was shooting
//   that year (Super-8, instant photos, camcorder tape, an album page), captioned by hand,
//   coming faster and faster while a counter rolls the years. The last frame on the reel is
//   the round that just ended; it jams in the gate, burns through at the impact point and
//   leaves the bare lamp. That white is a flashbulb: one more instant photo drops onto a
//   table among the prints of the life we just watched, and develops in the next world's
//   colours. Its caption is the world's name. We fall into the picture.
//
// BEAT SHEET (11.0 s, swap at 7.8 s)
//   0.00         the old world, untouched (the cut in is invisible)
//   0.0 → 0.86   ACT 1 · freeze: viewfinder brackets snap onto the impact point with the
//                loser's name, the colour drains, and we push in hard (radial smear)
//   0.46 → 1.18  …which dissolves into the close-up: the hat pulled low, one eye squinting
//   1.18         the glint — the winner's colour flares in both pupils and across the face;
//                eyes snap wide, brows go up, a bead of sweat; the name is scrawled across
//                the freeze-frame with how it happened and who did it
//   1.68 → 2.24  the pupils blow; we dive through one of them into black
//   2.24 → 2.52  film leader: 3, 2 (pop), one clear frame
//   2.52 → 3.22  title card: "THE COLLECTED MEMORIES OF <loser>, b. <month year>, <town>"
//   3.22 → 6.94  ACT 2 · the reel: six or seven memories, each 16 % shorter than the last,
//                the film slipping through the gate between them (sprocket holes fly by),
//                the year counter rolling from birth to now, the projector running away;
//                the last is the handshake before this duel, in the old world's palette,
//                both snipers labelled by name
//   6.94 → 7.20  the present catches up: the old world itself is the last frame, captioned
//   7.14         the film jams; 7.20 it burns through from the impact point, the edge
//                glowing in the next world's accent; solid white from 7.60, the loose end
//                of the film slapping across the bare lamp
//   7.80         THE SWAP, held on that white
//   7.94 → 8.65  ACT 3 · the white decays like a flashbulb onto a table in the next world's
//                palette: the memories lie around as fading prints, a new instant photo drops in
//   8.40 → 9.85  it develops — a ghost in the new world's two inks, then the world itself;
//                the caption writes itself: the dimension's name; a note on a paper scrap;
//                label tape: round, perspective, score, match point
//   10.0 → 10.76 we fall into the picture until it is the screen
//   10.79 → 10.95 the still gives way to the live world; the overlay ends fully clear
//
// AXES OF VARIATION (all drawn once from ctx.rng — see flashback/script.js)
//   1. the cut: which five or six of fifteen memories (plus the handshake), at what ages —
//      and so their order within the life
//   2. the life: year of birth (age 27-61), home town, birthday month, every date
//   3. the media: what each memory was shot on (era-appropriate, never twice running, with
//      a family favourite), the film stock's grade and fade, album paper, table felt, tilts,
//      tape and stickers, and which way the reel runs through the gate
//   4. the words: three captions per memory, title card overline and footer, the scrawl on
//      the freeze-frame, the last frame's caption, the note beside the new photo
//   5. the face: which eye squints, which pupil we dive through, brows, lashes, freckles,
//      a scar, tilt and framing; skin and hair of both snipers throughout
//   6. the burn: where the second hole opens, the pattern of the char
//   7. the arrival: where the photo lands and how it spins, where the old prints lie, which
//      side the labels and tape go, the chemistry's blotches
//
// CONTEXT
//   ctx.focus          the push-in target, and where the last frame burns through
//   ctx.loser          the face (iris, hat, skin tint), the hero of every memory, the name in
//                      the title card and captions; ctx.winner: the glint in the eyes, the
//                      other sniper at the handshake, named in captions and on the last frame
//   ctx.how            filed on the freeze-frame and written on the last frame
//   a draw             both snipers share the reel: a split face, alternating heroes
//   ctx.fromImage      pushed in on; then the last frame of the reel, which burns
//   ctx.from           the handshake happens in the old world's palette
//   ctx.to             palette: the burn's glowing edge, the table, the undeveloped film and
//                      its two inks, the tape; name: the caption; tagline, perspective: labels
//   score / round / matchPoint   label tape on the table (and extra heartbeats in the reel)
import { seg, ease, clamp, clamp01, lerp, hexToRgb, mixHex, makeCanvas, canvasTexture, fullscreenPass } from '../kit.js';
import { FILM_FRAG, ARRIVE_FRAG } from './flashback/shaders.js';
import { makePlan, T, LOOK, DURATION, SWAP_AT } from './flashback/script.js';
import { drawCard, drawGap, drawLeader, drawCounter, killRect } from './flashback/media.js';
import { makeEye } from './flashback/eye.js';
import { makeArrival, TAIL } from './flashback/arrive.js';
import { hash } from './flashback/scenes.js';

const rgb01 = (hex) => { const c = hexToRgb(hex); return [c.r / 255, c.g / 255, c.b / 255]; };
const FILM_MAX = 1280; // the film canvas is re-uploaded every frame (Safari/iPad: the costly part): soft is in character, and cheap
const FILM_MIN_Q = 0.55; // ...and if frames still run long, the governor in update() thins it out to this fraction

export default {
  id: 'flashback',
  name: 'LIFE FLASH',
  duration: DURATION,
  swapAt: SWAP_AT,

  create(ctx) {
    const { THREE, renderer } = ctx.three;
    const A = ctx.audio;
    const plan = makePlan(ctx, ctx.rng);
    const pal = ctx.to.palette;
    const glint = ctx.winner ? ctx.winner.color : pal.accent;
    const eye = makeEye(plan, glint);
    const arrival = makeArrival(ctx, plan);
    const all = plan.all;

    // --- GPU ------------------------------------------------------------------------------------
    const film = makeCanvas(16, 16);
    let fw = 0, fh = 0, fs = 1, fq = 1, dtAvg = 1 / 60;
    // srgb: false throughout — the shaders hand texels straight back, so frame 0 is the old world to the bit.
    const texFrom = canvasTexture(THREE, ctx.fromImage, { srgb: false });
    const texFilm = canvasTexture(THREE, film.canvas, { srgb: false });
    let texTo = null;
    const V2 = (x = 0, y = 0) => new THREE.Vector2(x, y), V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    const pFilm = fullscreenPass(THREE, {
      fragmentShader: FILM_FRAG,
      uniforms: {
        tFrom: { value: texFrom }, tFilm: { value: texFilm },
        uFocus: { value: V2(0.5, 0.5) }, uWeave: { value: V2() }, uBurnC: { value: V2(0.5, 0.5) }, uBurnC2: { value: V2(0.5, 0.5) }, uPx: { value: V2(1, 1) },
        uAspect: { value: 1 }, uT: { value: 0 }, uFrame: { value: 0 }, uSeed: { value: plan.seed },
        uZoom: { value: 1 }, uBlur: { value: 0 }, uMix: { value: 0 }, uFreeze: { value: 0 },
        uGrain: { value: 0 }, uFlick: { value: 0 }, uVhs: { value: 0 }, uScratch: { value: 0 }, uSoft: { value: 0 }, uSmear: { value: 0 },
        uVig: { value: 0 }, uFade: { value: 0 }, uLeak: { value: 0 }, uLeakSide: { value: 0 },
        uTintLo: { value: V3(plan.stock.lo) }, uTintHi: { value: V3(plan.stock.hi) }, uGlow: { value: V3(rgb01(pal.accent)) }, uLeakCol: { value: V3(plan.stock.leak) },
        uBurn: { value: 0 }, uWhite: { value: 0 },
      },
    });
    const pArr = fullscreenPass(THREE, {
      fragmentShader: ARRIVE_FRAG,
      uniforms: {
        tTo: { value: texFrom }, uC: { value: V2(0.5, 0.5) }, uHalf: { value: V2(0.5, 0.5) },
        uAspect: { value: 1 }, uRot: { value: 0 }, uDev: { value: 0 }, uAlpha: { value: 1 }, uSeed: { value: plan.arrive.seed }, uHasTo: { value: 0 }, uSheen: { value: 0 },
        uTable: { value: V3(rgb01(arrival.table)) }, uRaw: { value: V3(rgb01(arrival.raw)) }, uLo: { value: V3(rgb01(arrival.lo)) }, uHi: { value: V3(rgb01(arrival.hi)) },
      },
    });

    function sizeFilm(w, h) {
      const s = Math.min(Math.max(1, ctx.dpr), FILM_MAX / w, FILM_MAX / h) * fq;
      const W = Math.max(8, Math.round(w * s)), H = Math.max(8, Math.round(h * s));
      if (W === fw && H === fh) return;
      fw = film.canvas.width = W;
      fh = film.canvas.height = H;
      fs = W / w;
      texFilm.dispose(); // its storage was allocated for the old size
    }

    // The slow things happen now, at the cut, not in the middle of the push-in: the eye is painted
    // and both programs compiled (Safari takes its time over the big fragment shaders; the arrival
    // one would otherwise hitch the swap).
    sizeFilm(ctx.width, ctx.height);
    eye.prepare(ctx.width, ctx.height);
    try { renderer.compile(pFilm.scene, pFilm.camera); renderer.compile(pArr.scene, pArr.camera); } catch { /* compiled on first use instead */ }

    // --- the reel ---------------------------------------------------------------------------------
    const cardAt = (t) => { let i = 0; while (i + 1 < all.length && t >= all[i + 1].t0) i++; return i; };
    const slipOf = (i, t) => (i > 0 && all[i].slip > 0 ? ease.inOutCubic(seg(t, all[i].t0, all[i].t0 + all[i].slip)) : 1);
    // Nothing on the reel is ever quite still: the rostrum camera creeps in on every picture.
    function card(g, w, h, c, t) {
      const z = c.kind === 'title' ? 1 : 1 + 0.045 * clamp01((t - c.t0) / c.dur);
      g.translate(w / 2, h / 2);
      g.scale(z, z);
      g.translate(-w / 2, -h / 2);
      drawCard(g, w, h, c, t, plan, ctx.fromImage);
    }
    function paintReel(g, w, h, t) {
      const i = cardAt(t), c = all[i], k = slipOf(i, t);
      if (k >= 1) { g.save(); card(g, w, h, c, t); g.restore(); return; }
      // the film slips through the gate: the last frame leaves, a band of leader, the next arrives
      const gh = h * 0.16, travel = h + gh, d = plan.dir;
      for (let j = 0; j < 2; j++) {
        g.save();
        g.translate(0, j ? d * (1 - k) * travel : -d * k * travel);
        g.beginPath(); g.rect(0, 0, w, h); g.clip(); // a frame's neighbours on the strip must not paint over the other frame
        card(g, w, h, j ? c : all[i - 1], t);
        g.restore();
      }
      drawGap(g, w, d > 0 ? h - k * travel : -gh + k * travel, gh);
    }
    function paintFilm(t, w, h) {
      const g = film.g;
      g.setTransform(fs, 0, 0, fs, 0, 0);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      if (t < T.plunge1) eye.draw(g, w, h, t, ctx.focus);
      else if (t < T.card0) {
        const k = seg(t, T.leader, T.card0);
        if (k > 0.9) { g.fillStyle = '#fff6dc'; g.fillRect(0, 0, w, h); } // one clear frame before the title
        else drawLeader(g, w, h, k / 0.9);
      } else paintReel(g, w, h, t);
      texFilm.needsUpdate = true;
    }
    const look = [0, 0, 0, 0, 0, 0, 0];
    function lookAt(t) {
      let a = LOOK.eye, b = LOOK.eye, k = 1;
      if (t >= T.plunge1 && t < T.card0) a = b = LOOK.title;
      else if (t >= T.card0) { const i = cardAt(t); b = LOOK[all[i].medium]; a = i > 0 ? LOOK[all[i - 1].medium] : b; k = slipOf(i, t); }
      for (let j = 0; j < 7; j++) look[j] = lerp(a[j], b[j], k);
      return look;
    }
    // year and age on the counter: they roll while the film slips
    function yearAt(t) {
      const i = cardAt(t), c = all[i];
      if (i === 0) return c.year;
      return lerp(all[i - 1].year, c.year, ease.inOutCubic(seg(t, c.t0, c.t0 + Math.max(c.slip * 2.2, 0.2))));
    }

    // --- sound: one-shots keyed to the timeline -----------------------------------------------------
    const cues = [];
    const cue = (t, fn) => cues.push({ t, fn });
    const bell = (f, gain = 0.1, pan = 0, dur = 1.1, delay = 0) => { // a music-box tine
      A.tone({ type: 'sine', freq: f, dur, gain, attack: 0.002, pan, delay });
      A.tone({ type: 'triangle', freq: f * 3.01, dur: dur * 0.3, gain: gain * 0.22, attack: 0.001, pan, delay });
    };
    cue(0, () => { A.sfx('heartbeat', { gain: 0.9 }); A.sfx('click', { gain: 0.5 }); A.tone({ freq: 62, freqEnd: 44, dur: 1.2, gain: 0.16, attack: 0.1 }); });
    cue(0.08, () => A.noise({ filter: 'bandpass', freq: 260, freqEnd: 2400, q: 1.1, dur: 0.8, gain: 0.26, attack: 0.5 }));
    cue(0.62, () => A.sfx('heartbeat', { gain: 0.8, pitch: 0.92 }));
    cue(T.shock - 0.02, () => {
      A.noise({ filter: 'highpass', freq: 1800, freqEnd: 6500, q: 0.7, dur: 0.22, gain: 0.2, attack: 0.12 }); // the gasp
      A.tone({ type: 'sawtooth', freq: 1244, dur: 0.5, gain: 0.035, attack: 0.005, pan: -0.4 });
      A.tone({ type: 'sawtooth', freq: 1318, dur: 0.5, gain: 0.035, attack: 0.005, pan: 0.4 });
      A.sfx('tick', { gain: 0.7 });
    });
    cue(T.shock + 0.1, () => { for (let i = 0; i < 5; i++) A.noise({ filter: 'highpass', freq: 3200, dur: 0.035, gain: 0.07, attack: 0.002, delay: i * 0.055 }); }); // the scrawl
    cue(T.dilate - 0.1, () => A.sfx('heartbeat', { gain: 1, pitch: 1.2 }));
    cue(T.plunge0 - 0.04, () => { A.sfx('whoosh', { gain: 0.9 }); A.tone({ type: 'triangle', freq: 900, freqEnd: 70, dur: 0.5, gain: 0.14 }); });
    cue(T.leader, () => A.sfx('click', { gain: 0.8 }));
    cue(lerp(T.leader, T.card0, 0.45), () => A.tone({ type: 'sine', freq: 1000, dur: 0.09, gain: 0.16, attack: 0.002 })); // the 2-pop
    cue(T.card0, () => { A.sfx('thud', { gain: 0.5 }); bell(523.25, 0.1, -0.2); bell(659.25, 0.08, 0.2, 1.1, 0.12); bell(783.99, 0.08, 0, 1.3, 0.24); });
    // The projector: a motor that climbs, and a claw that pulls faster and faster.
    for (let s = T.leader, i = 0; s < T.white; s += 1.1, i++) {
      const f = 52 + i * 5;
      cue(s, () => A.tone({ type: 'sawtooth', freq: f, freqEnd: f + 5, dur: 1.25, gain: 0.028, attack: 0.12 }));
    }
    for (let s = T.leader + 0.05; s < T.jam;) {
      const at = s;
      cue(at, () => A.noise({ filter: 'bandpass', freq: 2100, q: 2.5, dur: 0.02, gain: 0.04, attack: 0.001, pan: 0.25 }));
      s += lerp(1 / 13, 1 / 26, ease.inQuad(seg(s, T.reel0, T.reel1)));
    }
    // Each memory: the film slips, a music box climbs, and one sound from inside the picture.
    const scale = [0, 2, 4, 7, 9];
    const inside = {
      cake: [0.6, () => A.noise({ filter: 'bandpass', freq: 900, freqEnd: 300, q: 0.8, dur: 0.18, gain: 0.14, attack: 0.03 })],
      fair: [0.48, () => A.sfx('bell', { gain: 0.4, pitch: 1.5 })],
      cans: [0.2, () => { for (let i = 0; i < 4; i++) A.sfx('tick', { gain: 0.45, pitch: 1.2 + i * 0.1, delay: i * 0.09 }); }],
      camera: [0.5, () => { A.sfx('click', { gain: 0.7 }); A.noise({ filter: 'highpass', freq: 6000, dur: 0.12, gain: 0.1, attack: 0.001 }); }],
      range: [0.46, () => A.sfx('shot', { gain: 0.3 })],
      car: [0.4, () => A.sfx('thud', { gain: 0.4, pitch: 1.4 })],
      wedding: [0.1, () => { A.sfx('bell', { gain: 0.3, pitch: 1.0 }); A.sfx('bell', { gain: 0.25, pitch: 1.26, delay: 0.14 }); }],
      grad: [0.25, () => A.sfx('swoosh', { gain: 0.35 })],
      fish: [0.55, () => A.noise({ filter: 'lowpass', freq: 1200, freqEnd: 300, dur: 0.2, gain: 0.16, attack: 0.01 })],
      scope: [0.52, () => A.tone({ type: 'sine', freq: 2400, freqEnd: 1200, dur: 0.3, gain: 0.04, attack: 0.02 })],
      shake: [0.2, () => A.sfx('thud', { gain: 0.45, pitch: 0.8 })],
    };
    plan.cards.forEach((c, i) => {
      const n = i + 2, f = 392 * Math.pow(2, (scale[n % 5] + 12 * Math.floor(n / 5)) / 12), pan = i & 1 ? 0.35 : -0.35;
      cue(c.t0, () => {
        A.noise({ filter: 'bandpass', freq: 500, freqEnd: 1900, q: 1.4, dur: c.slip + 0.05, gain: 0.16, attack: c.slip * 0.6, pan }); // the slip
        if (c.medium === 'vhs') A.sfx('glitch', { gain: 0.3 });
      });
      cue(c.t0 + c.slip * 0.8, () => {
        A.sfx('click', { gain: 0.55, pitch: 0.9 + i * 0.04, pan });
        bell(f, 0.11, pan);
        if (c.dur > 0.5) bell(f * 1.5, 0.07, -pan, 0.9, Math.min(0.3, c.dur * 0.42));
      });
      const s = inside[c.id];
      if (s) cue(c.t0 + c.dur * s[0], s[1]);
    });
    if (ctx.matchPoint) [0.3, 0.62, 0.86].forEach((k, i) => cue(lerp(T.reel0, T.reel1, k), () => A.sfx('heartbeat', { gain: 0.7, pitch: 1.1 + i * 0.1 })));
    cue(T.reel1 - 1.35, () => A.sfx('riser', { gain: 0.8 }));
    cue(T.reel1, () => { A.sfx('thud', { gain: 0.8 }); A.noise({ filter: 'bandpass', freq: 500, freqEnd: 1900, q: 1.4, dur: 0.14, gain: 0.18, attack: 0.06 }); });
    cue(T.jam, () => { A.sfx('error', { gain: 0.3, pitch: 0.7 }); for (let i = 0; i < 4; i++) A.noise({ filter: 'bandpass', freq: 1500, q: 2, dur: 0.03, gain: 0.1, attack: 0.001, delay: i * 0.035 }); });
    cue(T.burn0, () => { // the gate burns: a sizzle that opens up
      A.noise({ filter: 'bandpass', freq: 900, freqEnd: 7000, q: 0.9, dur: T.white - T.burn0 + 0.1, gain: 0.3, attack: 0.25 });
      A.tone({ type: 'sawtooth', freq: 90, freqEnd: 360, dur: T.white - T.burn0, gain: 0.07, attack: 0.1 });
    });
    cue(T.white - 0.05, () => A.sfx('boom', { gain: 1 }));
    // the tail of the film slaps round the take-up reel, slower and slower
    TAIL.forEach((d, i) => cue(T.white + d, () => A.noise({ filter: 'bandpass', freq: 1300 - i * 120, q: 1.8, dur: 0.04, gain: 0.13 - i * 0.02, attack: 0.001, pan: i & 1 ? 0.3 : -0.3 })));
    cue(T.land0 - 0.08, () => { // the camera spits out a picture
      A.sfx('click', { gain: 0.8 });
      A.tone({ type: 'sawtooth', freq: 170, freqEnd: 250, dur: 0.42, gain: 0.05, attack: 0.02 });
      A.noise({ filter: 'bandpass', freq: 1200, q: 3, dur: 0.42, gain: 0.07, attack: 0.03 });
    });
    cue(T.land1 - 0.22, () => A.sfx('thud', { gain: 0.6, pitch: 1.3 }));
    cue(T.dev0 + 0.1, () => {
      A.sfx('chime', { gain: 0.5 });
      [261.63, 329.63, 392, 523.25, 659.25].forEach((f, i) => bell(f, 0.07, (i - 2) * 0.25, 1.9 - i * 0.15, 0.1 + i * 0.13));
    });
    cue(T.cap0, () => { for (let i = 0; i < 7; i++) A.noise({ filter: 'highpass', freq: 2800 + (i % 3) * 500, dur: 0.045, gain: 0.07, attack: 0.003, delay: i * 0.085 }); }); // marker on card
    cue(T.cap1 - 0.05, () => A.sfx('tick', { gain: 0.6 }));
    cue(T.cap1 + 0.14, () => A.sfx('tick', { gain: 0.6, pitch: 1.2 }));
    if (ctx.matchPoint) cue(T.cap1 + 0.3, () => { A.sfx('tick', { gain: 0.7, pitch: 0.8 }); A.sfx('heartbeat', { gain: 0.8 }); });
    cue(T.push0, () => { A.sfx('swoosh', { gain: 0.5 }); A.noise({ filter: 'lowpass', freq: 300, freqEnd: 2600, q: 0.8, dur: T.pushEnd - T.push0, gain: 0.14, attack: 0.5 }); });
    cue(T.pushEnd - 0.05, () => bell(1046.5, 0.07, 0, 0.8));
    cues.sort((a, b) => a.t - b.t);
    let cueAt = 0;

    // The moment is framed like a snapshot being taken: brackets snap onto the impact point
    // and ride the push-in. (This picture comes back as the last frame of the reel.)
    const finderCol = plan.duo ? '#fff4d8' : mixHex(plan.hero.col, '#ffffff', 0.2);
    function finder(g, w, h, t) {
      const a = seg(t, 0.03, 0.12) * (1 - seg(t, T.mix0, T.mix0 + 0.22));
      if (a <= 0) return;
      const k = ease.outBack(seg(t, 0.03, 0.42)), z = ease.inCubic(seg(t, 0.2, T.push1));
      const s = lerp(h * 0.62, h * 0.13, k) * (1 + z * 2.2), len = s * 0.3;
      const x = ctx.focus.x, y = ctx.focus.y, lw = Math.max(2, h * 0.005);
      g.save();
      g.globalAlpha = a;
      g.lineCap = 'square';
      for (let pass = 0; pass < 2; pass++) {
        g.strokeStyle = pass ? finderCol : 'rgba(0,0,0,0.55)';
        g.lineWidth = pass ? lw : lw * 2.2;
        g.beginPath();
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
          g.moveTo(x + sx * s, y + sy * (s - len)); g.lineTo(x + sx * s, y + sy * s); g.lineTo(x + sx * (s - len), y + sy * s);
        }
        g.moveTo(x - s * 0.12, y); g.lineTo(x + s * 0.12, y); g.moveTo(x, y - s * 0.12); g.lineTo(x, y + s * 0.12);
        g.stroke();
      }
      const fs = Math.max(10, h * 0.026), name = plan.duo ? 'NOBODY' : plan.hero.name;
      g.font = `700 ${fs}px 'JetBrains Mono', 'Menlo', monospace`;
      g.textBaseline = 'top';
      const right = x + s + fs * 0.5 + g.measureText(name).width > w, below = y + s + fs * 1.8 < h;
      g.textAlign = right ? 'right' : 'left';
      const tx = clamp(right ? x + s : x - s, fs * 0.6, w - fs * 0.6), ty = clamp(below ? y + s + fs * 0.6 : y - s - fs * 1.6, fs * 0.5, h - fs * 1.6);
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText(name, tx + 1.5, ty + 1.5);
      g.fillStyle = finderCol; g.fillText(name, tx, ty);
      g.restore();
    }

    const P = {};
    return {
      update(dt, t) {
        while (cueAt < cues.length && t >= cues[cueAt].t) cues[cueAt++].fn();
        // Frame-time governor: the film is the one thing that scales with the screen. If frames
        // keep running long, re-upload fewer pixels (steps down only, never back up: no flapping).
        // The test lab steps at 1/60, so renders stay exactly reproducible there.
        if (dt > 0.004 && dt < 0.1 && t < T.burn0) {
          dtAvg += (dt - dtAvg) * 0.06;
          if (dtAvg > 1 / 36 && fq > FILM_MIN_Q + 1e-3) { fq = Math.max(FILM_MIN_Q, fq * 0.8); dtAvg = 1 / 60; }
        }
      },

      render(t) {
        const g = ctx.g, w = ctx.width, h = ctx.height, aspect = w / h;
        renderer.setRenderTarget(null);

        // ===== ACT 3: the flashbulb, the table, the photo that develops ======================
        if (t >= T.white) {
          if (fw > 1) { fw = fh = 0; film.canvas.width = film.canvas.height = 1; texFilm.dispose(); } // the reel is done: hand its pixels back before the table
          const to = ctx.toImage, u = pArr.uniforms;
          if (to && !texTo) {
            texTo = canvasTexture(THREE, to, { srgb: false });
            u.tTo.value = texTo;
            u.uHasTo.value = 1;
          }
          arrival.pose(t, w, h, P);
          u.uAspect.value = aspect;
          u.uC.value.set(P.cx / w, 1 - P.cy / h);
          u.uHalf.value.set((P.s * aspect) / 2 / h, P.s / 2 / h);
          u.uRot.value = P.rot;
          u.uDev.value = to ? ease.inOutSine(seg(t, T.dev0, T.dev1)) : 0;
          u.uSheen.value = 1 - P.k;
          u.uAlpha.value = to ? 1 - seg(t, T.fade0, T.fade1) : 1;
          pArr.render(renderer);
          arrival.draw(g, w, h, t, !!to);
          return;
        }

        // ===== ACTS 1 and 2: the film canvas, through the projector ============================
        sizeFilm(w, h);
        if (t >= T.mix0 - 0.14) paintFilm(t, w, h);
        const u = pFilm.uniforms, L = lookAt(t);
        const fxIn = seg(t, 0.12, 0.6);
        const frame = Math.floor(t * 24), f18 = Math.floor(t * 18);
        const jam = seg(t, T.jam, T.jam + 0.08);
        const run = 1 + 1.6 * ease.inQuad(seg(t, T.reel0 + 1.2, T.reel1)); // the projector running away with the reel
        u.uAspect.value = aspect;
        u.uT.value = t;
        u.uFrame.value = frame;
        u.uPx.value.set(Math.max(1, ctx.dpr * 1.25), Math.max(1, ctx.dpr * 1.25));
        u.uFocus.value.set(clamp01(ctx.focus.x / w), clamp01(1 - ctx.focus.y / h));
        u.uZoom.value = 1 + 10 * ease.inCubic(seg(t, 0.04, T.push1));
        u.uBlur.value = 0.55 * ease.inQuad(seg(t, 0.08, T.push1));
        u.uMix.value = ease.inOutSine(seg(t, T.mix0, T.push1));
        u.uFreeze.value = 0.6 * ease.outCubic(seg(t, 0.02, 0.32));
        u.uGrain.value = L[0] * fxIn;
        u.uFlick.value = L[1] * fxIn * (1 - jam) * run;
        const wv = L[2] * fxIn * run;
        u.uWeave.value.set((hash(f18) - 0.5) * 0.0035 * wv, (hash(f18 + 977) - 0.5) * 0.006 * wv + Math.sin(t * 95) * 0.011 * jam * (1 - seg(t, T.burn0, T.white)));
        u.uVhs.value = L[3];
        u.uScratch.value = L[4] * fxIn;
        u.uSoft.value = L[5] * fxIn;
        u.uVig.value = L[6] * fxIn;
        u.uFade.value = plan.fade * seg(t, T.plunge1 - 0.2, T.card0) * (1 - 0.6 * L[3]);
        // the reel in motion: smear while it slips, a light leak as each frame lands
        let smear = 0, leak = 0;
        if (t >= T.card0) {
          const i = cardAt(t), c = all[i], k = slipOf(i, t);
          if (k < 1) smear = Math.sin(k * Math.PI) * 0.05;
          const since = t - c.t0 - c.slip;
          if (since >= 0 && c.medium !== 'vhs') leak = Math.exp(-since / 0.07) * 0.85;
          u.uLeakSide.value = i & 1;
        }
        u.uSmear.value = smear;
        u.uLeak.value = leak;
        // the burn starts at the impact point, where it sits inside the last frame
        const r = killRect(w, h);
        const bx = (r.x + (ctx.focus.x / w) * r.w) / w, by = 1 - (r.y + (ctx.focus.y / h) * r.h) / h;
        u.uBurnC.value.set(clamp(bx, 0.08, 0.92), clamp(by, 0.1, 0.9));
        u.uBurnC2.value.set(clamp(bx + plan.burn.ox, 0.05, 0.95), clamp(by + plan.burn.oy, 0.05, 0.95));
        u.uBurn.value = ease.inQuad(seg(t, T.burn0, T.white + 0.06));
        u.uWhite.value = ease.inQuad(seg(t, T.white - 0.17, T.white - 0.02));
        pFilm.render(renderer);

        // crisp, on the top layer: the viewfinder, the scrawl on the freeze-frame, then the years
        finder(g, w, h, t);
        eye.text(g, w, h, t);
        const ca = seg(t, T.card0 + 0.2, T.card0 + 0.45) * (1 - seg(t, T.burn0, T.burn0 + 0.22));
        if (ca > 0) {
          const s = clamp(h * 0.07, 20, 62), y = yearAt(t);
          drawCounter(g, w - s * 0.55, s * 0.5, s, y, y - plan.birth, ca, mixHex(plan.hero.col, '#3a2a22', plan.duo ? 0.8 : 0.35));
        }
      },

      dispose() {
        for (const o of [texFrom, texFilm, texTo, pFilm, pArr]) if (o) o.dispose();
        film.canvas.width = film.canvas.height = 1; // hand the pixels back now, not at the next GC
        renderer.setRenderTarget(null);
      },
    };
  },
};
