// DEV-APP — "DO YOU WANT TO DEVELOP AN APP?"  ·  THE REVEAL
//
// Reserved for the FIRST point of a match: until now the players believe they are in an
// ordinary long-range valley duel. The mode's innocent name comes back at them as a system
// dialog, the answer is Yes whether they like it or not, and the game is hijacked by its
// own making: the old world is dragged into the preview pane of an app-builder, the next
// world is typed, built and run in front of them, and the "app" launches full-screen.
// The comedy is contrast — one quiet, deadpan second after a tense duel, then relentless
// escalation — so the fake software has to be immaculate: it is a parody of polish.
//
// BEAT SHEET (11 s, swap at 7.7 s)
//   0.00  FREEZE     the old world, untouched, silent. Nothing happens. That is the joke.
//   0.50  SCRIM      it softens and dims like the backdrop of a modal…
//   0.72  DIALOG     …and a cheerful alert pops dead centre with a chime: "Do you want to
//                    develop an app?"  A pointer wanders in on its own and goes for [No].
//   1.0-3.0  THE GAG one of five (see GAGS in dev-app/dialog.js) — the answer is Yes.
//   3.0   "GREAT CHOICE!"  the icon hops, confetti, "Developing your app…".
//   3.5   TAKEOVER   the pointer grabs the corner of the WORLD and resizes it like a layer,
//                    down into the preview pane of an IDE that assembles around it. An
//                    inspector tag stays pinned to the impact point, naming the loser.
//   4.2-6.8  CODE    the next world's source types itself: new Dimension("<name>"),
//                    perspective, palette (real colour chips), players, the score, and
//                    comments that mock the kill by name.
//   4.5-7.0  BUILD   comically specific steps; the preview is scanned into a wireframe of
//                    itself in the next world's colours, crunched into placeholder tiles,
//                    cleared to an empty scene with two placeholder snipers. Sometimes an
//                    error that fixes itself. A needy pop-up rates itself five stars.
//                    BUILD SUCCEEDED.
//   7.30  RUN        the pointer presses Run; the preview blooms to white.
//   7.70  THE SWAP   on full white.
//   7.8   LAUNCH     the white clears on the app's splash screen in the pane — the new
//                    world's palette, its name landing as the title — then the splash irises
//                    open on the new world itself, running small inside the IDE.
//   8.95  ARRIVAL    the pane grows to fill the screen while the IDE's panels are thrown
//                    off it; a toast: "App launched: <name>". The overlay ends fully clear.
//
// DIFFERENT EVERY TIME (all drawn from ctx.rng in create(), see dev-app/script.js)
//   1. the dialog gag: dodge / relabel / remind-me-later / countdown / the button falls off
//   2. the software's look: dark, light or retro-beige theme × brand colour × product name
//   3. the layout: preview pane on the left or the right (and so which corner is dragged)
//   4. the code: three source styles, header / mocking / TODO comments, filler properties
//   5. the build: step list, whether an error happens, which one, at which step
//   6. the pop-up that interrupts the build (stars / cookies / upgrade / tip of the day)
//   7. the pointer's entrance and arcs, the preview's scan direction and tile size
//   8. how the panels fly apart (direction, spin, order), the splash kicker, the toast
//
// CONTEXT
//   fromImage  the frozen world; blurred behind the dialog; resized into the pane; turned
//              into its own wireframe and placeholder tiles by the shader below
//   focus      the inspector tag and the loser's placeholder sit on the impact point
//   winner / loser / how   named in the dialog copy, the code, the comments, the build
//              steps, the inspector, the console, the toast — each in its identity colour
//   score / matchPoint     const SCORE = [a, b] and its comment
//   from       "Removing the valley…", the project name, the files that get deleted
//   to         name, perspective, tagline, and palette: chips in the editor, the preview's
//              wireframe and tiles, the build bar's gradient, the splash, the status bar
import { seg, ease, clamp, lerp, hexToRgb, roundRect, canvasTexture, makeCanvas, fullscreenPass, COVER_UV_GLSL, GLSL_NOISE } from '../kit.js';
import { makePlan, slug } from './dev-app/script.js';
import { makeTheme, drawPointer, drawRipple, softShadow } from './dev-app/ui.js';
import { GAGS, T_POP, T_OUT, dialogLayout, gagKeys, drawGag } from './dev-app/dialog.js';
import { ideLayout, drawIdeBack, drawIdeFront, lerpRect } from './dev-app/ide.js';
import { drawHandles, drawInspector, drawScaffold, drawReady, drawSplash, drawToast, drawNag } from './dev-app/launch.js';

const DUR = 11, SWAP_AT = 0.7, SWAP = DUR * SWAP_AT;
const T = {
  scrim: 0.5,
  grab: 3.5, drag0: 3.56, drag1: 4.36,    // the pointer takes the world by a corner and shrinks it
  type0: 4.22, type1: 6.82,
  build0: 4.52, build1: 7.0,
  nag0: 5.5, nag1: 6.86,                  // a pop-up nobody needed, in the middle of the build
  run: 7.3, white: SWAP - 0.22,           // opaque white from here until the new world exists
  iris0: SWAP + 0.7, iris1: SWAP + 1.0,   // splash → the world, still inside the pane
  exp0: SWAP + 1.25, exp1: SWAP + 2.15,   // the pane takes the screen
  fade1: SWAP + 2.5,
  toast0: SWAP + 1.6, toast1: DUR - 0.46,
};

// The old world, wherever the pointer has dragged it, and whatever the build is doing to it.
const FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tFrom, tSoft;
  uniform vec4 uRect;              // where the world sits: x0, y0, x1, y1 in screen uv (y up)
  uniform vec2 uPx;                // one device pixel, in pane uv
  uniform float uSA, uIA;          // screen / image aspect
  uniform float uBlur, uDim;       // the modal backdrop
  uniform float uFront;            // scan line that turns the picture into its wireframe
  uniform vec2 uDir;
  uniform float uBlock, uCells, uBlank, uTick, uGlitch, uErr;
  uniform vec3 uBg, uFg, uAc;      // the NEXT world's palette
  ${COVER_UV_GLSL}
  ${GLSL_NOISE}
  float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
  vec3 src(vec2 p) { return texture2D(tFrom, coverUv(clamp(p, 0.0, 1.0), uSA, uIA)).rgb; }
  void main() {
    vec2 p = (vUv - uRect.xy) / (uRect.zw - uRect.xy);
    // One pixel of bleed under the 2D layer's anti-aliased hole, so no seam can show.
    if (p.x < -uPx.x || p.x > 1.0 + uPx.x || p.y < -uPx.y || p.y > 1.0 + uPx.y) discard;
    p = clamp(p, 0.0, 1.0);
    vec2 q = p;
    float band = floor(p.y * 22.0);
    if (uGlitch > 0.0) {
      // Hot reload: rows of the picture slip sideways for a few frames.
      float on = step(0.55, hash21(vec2(band, uTick)));
      q.x = clamp(q.x + (hash21(vec2(uTick, band)) - 0.5) * 0.16 * uGlitch * on, 0.0, 1.0);
    }
    vec3 c = src(q);
    if (uBlur > 0.0) {
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 14; i++) {
        float a = float(i) * 2.39996, r = sqrt((float(i) + 0.5) / 14.0);
        acc += texture2D(tSoft, coverUv(q + vec2(cos(a), sin(a) * uSA) * r * 0.014 * uBlur, uSA, uIA)).rgb;
      }
      acc /= 14.0;
      c = mix(c, acc, smoothstep(0.0, 0.3, uBlur));
      c = mix(c, vec3(luma(c)), 0.22 * uBlur) * (1.0 - uDim);
    }
    if (uFront > -0.5) {
      // Sobel on the old frame: the world drawn as its own blueprint, in the next palette.
      float s = dot(p - 0.5, uDir) + 0.5;
      float perp = dot(p - 0.5, vec2(-uDir.y, uDir.x));
      float jag = (hash21(vec2(floor(perp * 46.0), uTick)) - 0.5) * 0.03;
      float conv = step(s + jag, uFront);
      vec2 e = uPx * 1.25;
      float tl = luma(src(q + e * vec2(-1.0, 1.0))), tc = luma(src(q + e * vec2(0.0, 1.0))), tr = luma(src(q + e));
      float ml = luma(src(q + e * vec2(-1.0, 0.0))), mr = luma(src(q + e * vec2(1.0, 0.0)));
      float bl = luma(src(q - e)), bc = luma(src(q + e * vec2(0.0, -1.0))), br = luma(src(q + e * vec2(1.0, -1.0)));
      float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl), gy = (tl + 2.0 * tc + tr) - (bl + 2.0 * bc + br);
      float edge = smoothstep(0.035, 0.22, length(vec2(gx, gy)));
      vec2 gp = p / uPx;
      float cell = (1.0 / uPx.x) / 18.0;
      vec2 gd = abs(fract(gp / cell + 0.5) - 0.5) * cell;
      float grid = 1.0 - smoothstep(0.5, 1.6, min(gd.x, gd.y));
      vec3 wire = uBg + uFg * grid * 0.07 + uAc * luma(c) * 0.16;
      wire = mix(wire, mix(uAc, uFg, 0.3), edge);
      c = mix(c, wire, conv);
      float glow = exp(-abs(s + jag - uFront) * 60.0) * step(-0.07, uFront) * step(uFront, 1.07);
      c += (uAc * 0.8 + 0.4) * glow;
    }
    vec2 n = vec2(uCells, max(2.0, floor(uCells * uPx.x / uPx.y + 0.5)));
    vec2 id = floor(p * n), f = fract(p * n);
    float h1 = hash21(id + 3.7);
    if (uBlock > 0.0) {
      // Placeholder tiles: the picture posterised to three tones of the next palette, some
      // tiles still unresolved (an outline and a cross) and re-rolled on every reload.
      float show = step(h1, uBlock * 1.12);
      float lum = luma(src((id + 0.5) / n));
      float lv = floor(clamp(lum * 3.4 + h1 * 0.7, 0.0, 2.99));
      vec3 tone = lv < 0.5 ? mix(uBg, uFg, 0.12) : (lv < 1.5 ? mix(uBg, uAc, 0.5) : uAc);
      float d = max(abs(f.x - 0.5), abs(f.y - 0.5));
      float box = 1.0 - smoothstep(0.4, 0.44, d);
      float ph = step(0.86, hash21(id + vec2(uTick, 9.1)));
      float mark = max(smoothstep(0.31, 0.35, d), 1.0 - smoothstep(0.03, 0.07, min(abs(f.x - f.y), abs(f.x + f.y - 1.0))));
      vec3 tile = mix(tone, mix(uBg, uFg, 0.75 * mark), ph);
      c = mix(c, mix(uBg, tile, box), show);
    }
    if (uBlank > 0.0) {
      // The empty scene: a horizon and a floor grid receding to it.
      float hz = 0.44, gyv = (hz - p.y) / hz;
      vec3 b = uBg + uAc * 0.07 * smoothstep(1.0, hz, p.y);
      if (p.y < hz) {
        float z = 1.0 / max(gyv, 0.03);
        float fx = (p.x - 0.5) * z * 5.0, fz = z * 1.7;
        float wx = z * 5.0 * uPx.x, wz = 1.7 * z * z / hz * uPx.y;
        float lx = 1.0 - smoothstep(wx * 0.6, wx * 1.8, abs(fract(fx + 0.5) - 0.5));
        float lz = 1.0 - smoothstep(wz * 0.6, wz * 1.8, abs(fract(fz + 0.5) - 0.5));
        b += uAc * max(lx, lz) * 0.55 * pow(gyv, 0.8);
      }
      b += uFg * 0.45 * exp(-abs(p.y - hz) * 160.0);
      c = mix(c, b, step(hash21(id + 1.3), uBlank * 1.12));
    }
    c = mix(c, vec3(0.95, 0.2, 0.26), uErr * (0.25 + 0.2 * step(0.5, hash21(vec2(band, uTick + 2.0)))));
    gl_FragColor = vec4(c, 1.0);
  }`;

const pressed = (t, t0) => (t < t0 ? 0 : t < t0 + 0.05 ? (t - t0) / 0.05 : Math.max(0, 1 - (t - t0 - 0.05) / 0.16));
const rgb01 = (hex) => { const c = hexToRgb(hex); return [c.r / 255, c.g / 255, c.b / 255]; };

// A small, smoothed copy of the frame: the blur taps read this, so 14 of them are enough.
function softCopy(img) {
  const w1 = Math.max(32, Math.round(img.width / 3)), h1 = Math.max(18, Math.round(img.height / 3));
  const a = makeCanvas(w1, h1);
  a.g.drawImage(img, 0, 0, w1, h1);
  const b = makeCanvas(Math.max(16, w1 / 2.5), Math.max(9, h1 / 2.5));
  b.g.drawImage(a.canvas, 0, 0, b.canvas.width, b.canvas.height);
  a.canvas.width = a.canvas.height = 1;
  return b.canvas;
}

export default {
  id: 'dev-app',
  name: 'DO YOU WANT TO DEVELOP AN APP?',
  duration: DUR,
  swapAt: SWAP_AT,

  create(ctx) {
    const { THREE, renderer } = ctx.three;
    const A = ctx.audio;
    // Palettes are "CSS colours"; everything here (shader uniforms, chips, mixes) wants #rrggbb.
    const hex = (c, fallback) => {
      if (/^#[0-9a-f]{6}$/i.test(c)) return c;
      const g = ctx.g, prev = g.fillStyle;
      g.fillStyle = fallback;
      g.fillStyle = String(c);
      const v = g.fillStyle;
      g.fillStyle = prev;
      return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
    };
    const tp = ctx.to.palette || {};
    const to = Object.assign({}, ctx.to, { name: String(ctx.to.name || 'UNTITLED'), palette: { bg: hex(tp.bg, '#10131c'), fg: hex(tp.fg, '#e8e6f0'), accent: hex(tp.accent, '#f2b35b') } });
    // Every random decision is taken here, once: the film is then a function of t alone.
    const plan = makePlan(ctx, to);
    plan.toSlug = slug(to.name);
    const th = makeTheme(plan);
    plan.loseInk = ctx.loser && ctx.loser.index === 0 ? th.p0 : th.p1;
    const G = GAGS[plan.gag];
    const confetti = [plan.brand, to.palette.accent, '#f2b35b', '#40d8e8', '#ffffff', to.palette.accent];
    const code = plan.code, nLines = code.lines.length;

    // -- GL: the old world -------------------------------------------------------
    // srgb: false — texels go straight back out, so frame 0 is exactly the gameplay frame.
    const tex = canvasTexture(THREE, ctx.fromImage, { srgb: false });
    const softTex = canvasTexture(THREE, softCopy(ctx.fromImage), { srgb: false });
    const pass = fullscreenPass(THREE, {
      fragmentShader: FRAG,
      uniforms: {
        tFrom: { value: tex }, tSoft: { value: softTex },
        uRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uPx: { value: new THREE.Vector2(0.001, 0.001) },
        uSA: { value: 1 }, uIA: { value: ctx.fromImage.width / Math.max(1, ctx.fromImage.height) },
        uBlur: { value: 0 }, uDim: { value: 0 }, uFront: { value: -1 }, uDir: { value: new THREE.Vector2(plan.scan[0], plan.scan[1]) },
        uBlock: { value: 0 }, uCells: { value: plan.cells }, uBlank: { value: 0 }, uTick: { value: 0 }, uGlitch: { value: 0 }, uErr: { value: 0 },
        uBg: { value: new THREE.Vector3(...rgb01(to.palette.bg)) }, uFg: { value: new THREE.Vector3(...rgb01(to.palette.fg)) }, uAc: { value: new THREE.Vector3(...rgb01(to.palette.accent)) },
      },
    });
    const U = pass.uniforms;

    // -- schedules -----------------------------------------------------------------
    // Typing: each line has its own pace and a breath after it, fitted to the window.
    const lineT0 = [], lineT1 = [];
    {
      let total = 0;
      for (let i = 0; i < nLines; i++) total += code.lines[i].len * code.pace[i] + code.rest[i];
      const k = (T.type1 - T.type0) / Math.max(1, total);
      let at = T.type0;
      for (let i = 0; i < nLines; i++) {
        lineT0[i] = at;
        at += code.lines[i].len * code.pace[i] * k;
        lineT1[i] = at;
        at += code.rest[i] * k;
      }
    }
    // Build: equal steps, plus a stall in the middle of one if this build hits its error.
    const nSteps = plan.steps.length, b = [T.build0];
    let errAt = -1, errEnd = -1;
    {
      const pause = plan.error ? 0.5 : 0, d = (T.build1 - T.build0 - pause) / nSteps;
      for (let i = 0; i < nSteps; i++) {
        let end = b[i] + d;
        if (plan.error && plan.error.step === i) { errAt = b[i] + d * 0.5; errEnd = errAt + pause; end += pause; }
        b.push(end);
      }
    }
    const fixAt = errEnd - 0.17;
    const con = [{ t: T.drag1 + 0.04, s: `$ develop --app "${to.name}" --yes`, kind: 'cmd', type: 0.32 }];
    plan.steps.forEach((s, i) => con.push({ t: b[i], s, kind: 'step', doneAt: b[i + 1], doneStr: `${plan.ms[i]} ms` }));
    if (plan.error) {
      con.push({ t: errAt, s: `error: ${plan.error.msg}`, kind: 'err' });
      con.push({ t: fixAt, s: `auto-fix: ${plan.error.fix}`, kind: 'fix' });
    }
    con.push({ t: T.build1, s: `BUILD SUCCEEDED · 0 errors · ${plan.casualties}`, kind: 'ok' });
    con.push({ t: T.run + 0.03, s: `Launching ${to.name}…`, kind: 'step' });
    con.push({ t: SWAP + 0.4, s: `App launched: ${to.name}`, kind: 'ok' });
    con.sort((p, q) => p.t - q.t);

    // -- per-size layout (re-made whenever the stage changes shape) ------------------
    const FULL = { x: 0, y: 0, w: 1, h: 1 }, R = { x: 0, y: 0, w: 1, h: 1 }, cur = { x: 0, y: 0, kind: 'arrow', ang: 0, press: 0 };
    const typed = new Array(nLines).fill(0), conNow = [];
    const st = {
      t: 0, typed, caretLine: 0, caretCol: 0, caretOn: false, typing: false, mockK: 0, todoK: 0, pal: 0, zoom: 1, badge: 'LIVE', errCount: 0,
      ready: 0, runPress: 0, live: false, con: conNow, treeDel: [0, 0, 0], treeAdd: [0, 0, 0, 0],
      build: { state: 'idle', k: 0, label: '', shake: 0 },
      xf: { title: [0, 0, 0, 0], tree: [0, 0, 0, 0], editor: [0, 0, 0, 0], col: [0, 0, 0, 0], status: [0, 0, 0, 0] },
    };
    let sizeKey = '', L = null, D = null, keysA = null, keysB = null, CS = 1, ripples = null;
    const corner = { x: 0, y: 0, sx: 1 };
    const cornerOf = (r, w, h) => {
      // The corner the pointer holds: the bottom one farthest from where the pane will sit.
      const m = 13 * CS;
      corner.sx = L.left ? -1 : 1;
      corner.x = clamp(L.left ? r.x + r.w : r.x, m, w - m);
      corner.y = clamp(r.y + r.h, m, h - m);
      return corner;
    };
    const walk = (keys, t, out) => {
      let i = 0;
      while (i < keys.length - 2 && t >= keys[i + 1].t) i++;
      const a = keys[i], c = keys[Math.min(i + 1, keys.length - 1)];
      const u = ease.inOutCubic(seg(t, a.t, c.t));
      const dx = c.x - a.x, dy = c.y - a.y, bow = (c.bow || 0) * Math.sin(Math.PI * u); // legs arc like a wrist, not a ruler
      out.x = a.x + dx * u - dy * bow;
      out.y = a.y + dy * u + dx * bow;
      return out;
    };
    const worldRect = (t) => lerpRect(FULL, L.scr, ease.inOutCubic(seg(t, T.drag0, T.drag1)), R);
    const pointer = (t, w, h, out) => {
      out.kind = 'arrow';
      if (t <= T.grab) walk(keysA, t, out);
      else if (t < T.drag1 + 0.1) {
        const c = cornerOf(worldRect(t), w, h);
        out.x = c.x;
        out.y = c.y;
      } else walk(keysB, t, out);
      if (t > T.grab - 0.05 && t < T.drag1 + 0.1) { out.kind = 'resize'; out.ang = L.left ? Math.PI / 4 : -Math.PI / 4; }
      let p = t >= T.grab && t < T.drag1 ? 1 : pressed(t, T.run);
      for (const c of G.clicks) p = Math.max(p, pressed(t, c[0]));
      out.press = p;
      return out;
    };
    const sync = (w, h) => {
      const key = w + 'x' + h;
      if (key === sizeKey) return;
      sizeKey = key;
      FULL.w = w;
      FULL.h = h;
      L = ideLayout(w, h, plan);
      D = dialogLayout(w, h, th);
      CS = clamp(L.S * 1.5, 1, 2.1);
      keysA = gagKeys(plan.gag, D, w, h, plan);
      const last = keysA[keysA.length - 1];
      const c0 = cornerOf(FULL, w, h);
      keysA.push({ t: Math.max(G.acc + 0.2, last.t + 0.2), x: last.x, y: last.y, bow: 0 });
      keysA.push({ t: T.grab, x: c0.x, y: c0.y, bow: -plan.bow * 0.5 });
      const c1 = cornerOf(L.scr, w, h), ed = L.editor, run = L.run;
      const rest = { x: ed.x + ed.w * 0.3, y: ed.y + ed.h * 0.84 };
      keysB = [
        { t: T.drag1 + 0.1, x: c1.x, y: c1.y },
        { t: T.drag1 + 0.6, x: rest.x, y: rest.y, bow: plan.bow },
        { t: T.run - 0.56, x: rest.x, y: rest.y },
        { t: T.run - 0.1, x: run.x + run.w * 0.6, y: run.y + run.h * 0.62, bow: -plan.bow * 0.8 },
        { t: DUR, x: run.x + run.w * 0.6, y: run.y + run.h * 0.62 },
      ];
      // Where each click lands, for its ripple.
      ripples = [];
      for (const c of G.clicks) { const p = pointer(c[0], w, h, {}); ripples.push({ t: c[0], x: p.x, y: p.y, ok: c[1] }); }
      const pr = pointer(T.run, w, h, {});
      ripples.push({ t: T.run, x: pr.x, y: pr.y, ok: 1 });
    };

    // Everything the IDE shows at time t.
    const state = (t) => {
      st.t = t;
      let line = 0, col = 0;
      for (let i = 0; i < nLines; i++) {
        const n = Math.floor(code.lines[i].len * seg(t, lineT0[i], lineT1[i]) + 1e-6);
        typed[i] = n;
        if (t >= lineT0[i]) { line = i; col = n; }
      }
      st.caretLine = line;
      st.caretCol = col;
      st.typing = t >= T.type0;
      st.caretOn = t >= T.type0 - 0.25 && (t < T.type1 || Math.floor(t * 2.6) % 2 === 0);
      const hot = (i) => seg(t, lineT0[i], lineT0[i] + 0.1) * (0.3 + 0.7 * (1 - seg(t, lineT1[i], lineT1[i] + 1.3)));
      st.mockK = hot(code.mockLine);
      st.todoK = hot(code.todoLine);
      st.pal = seg(t, lineT1[code.palLine], lineT1[code.palLine] + 0.5);
      const bs = st.build;
      bs.shake = 0;
      if (t < b[0]) {
        bs.state = 'idle';
        bs.k = 0;
        bs.label = 'Waiting for changes…';
      } else if (t >= T.build1) {
        bs.state = 'ok';
        bs.k = 1;
        bs.label = 'BUILD SUCCEEDED';
      } else {
        let i = 0;
        while (i < nSteps - 1 && t >= b[i + 1]) i++;
        let f = ease.outCubic(seg(t, b[i], b[i + 1])); // each step lunges, then drags its feet
        bs.state = 'run';
        bs.label = plan.steps[i];
        if (plan.error && plan.error.step === i) {
          if (t < errAt) f = 0.5 * ease.outCubic(seg(t, b[i], errAt));
          else if (t < errEnd) {
            f = 0.5 - 0.16 * ease.outCubic(seg(t, errAt, errAt + 0.18)) + 0.16 * ease.inOutCubic(seg(t, fixAt, errEnd));
            if (t < fixAt) {
              bs.state = 'err';
              bs.label = `error: ${plan.error.msg}`;
              bs.shake = 1 - seg(t, errAt, errAt + 0.3);
            } else {
              bs.state = 'fix';
              bs.label = `auto-fix: ${plan.error.fix}`;
            }
          } else f = 0.5 + 0.5 * ease.outCubic(seg(t, errEnd, b[i + 1]));
        }
        bs.k = (i + f) / nSteps;
      }
      st.errCount = bs.state === 'err' ? 1 : 0;
      st.badge = t > SWAP ? 'RUNNING' : t >= T.build1 ? 'READY' : bs.state === 'err' ? 'ERROR' : t >= b[0] ? 'REBUILDING' : t >= T.drag1 ? 'STOPPED' : 'LIVE';
      for (let i = 0; i < 3; i++) st.treeDel[i] = seg(t, b[0] + 0.06 + i * 0.13, b[0] + 0.3 + i * 0.13);
      st.treeAdd[1] = ease.outCubic(seg(t, b[1] + 0.05, b[1] + 0.3));
      st.treeAdd[2] = ease.outCubic(seg(t, lineT1[code.palLine], lineT1[code.palLine] + 0.25));
      st.treeAdd[3] = ease.outCubic(seg(t, b[3] + 0.05, b[3] + 0.3));
      st.ready = seg(t, T.build1, T.build1 + 0.25);
      st.runPress = t >= T.run ? Math.min(1, (t - T.run) / 0.05) * (t > SWAP ? 0 : 1) : 0;
      st.live = t > SWAP;
      conNow.length = 0;
      for (const c of con) {
        if (t < c.t) break;
        c.k = c.type ? seg(t, c.t, c.t + c.type) : 1;
        c.done = c.doneAt !== undefined && t >= c.doneAt && !(plan.error && c.doneAt === b[plan.error.step + 1] && t < errEnd) ? c.doneStr : '';
        conNow.push(c);
      }
    };
    // Panels sliding into place around the shrinking world.
    const ASM = { col: 0, title: 0.06, status: 0.2, editor: 0.2, tree: 0.3 };
    const assemble = (t, w, h) => {
      const k = (n) => 1 - ease.outCubic(seg(t, T.drag0 + ASM[n], T.drag0 + ASM[n] + 0.55));
      const x = st.xf, side = L.left ? -1 : 1;
      x.col[0] = side * L.col.w * 1.04 * k('col'); x.col[1] = 0; x.col[2] = 0; x.col[3] = 0;
      x.title[0] = 0; x.title[1] = -L.title.h * 1.3 * k('title'); x.title[2] = 0; x.title[3] = 0;
      x.status[0] = 0; x.status[1] = L.status.h * 1.5 * k('status'); x.status[2] = 0; x.status[3] = 0;
      x.editor[0] = 0; x.editor[1] = h * 1.02 * k('editor'); x.editor[2] = 0; x.editor[3] = 0;
      x.tree[0] = L.tree ? -side * L.tree.w * 1.1 * k('tree') : 0; x.tree[1] = 0; x.tree[2] = 0; x.tree[3] = 0;
    };
    // …and thrown off the screen as the app takes it over: lift, then go.
    const scatter = (t, w, h) => {
      const far = Math.max(w, h) * 1.2, side = L.left ? -1 : 1;
      const dirs = { title: [0.25, -1], status: [-0.2, 1], col: [side, 0.25], editor: [-side * 0.9, 0.45], tree: [-side, -0.2] };
      for (const n in dirs) {
        const f = plan.fly[n], x = st.xf[n], t0 = T.exp0 - 0.06 + f.lag;
        const k = ease.inCubic(seg(t, t0, t0 + 0.72));
        x[0] = (dirs[n][0] + (n === 'title' || n === 'status' ? f.drift : 0)) * far * k;
        x[1] = (dirs[n][1] + (n === 'title' || n === 'status' ? 0 : f.drift)) * far * k;
        x[2] = f.rot * k * 1.4;
        x[3] = seg(t, t0 - 0.16, t0 + 0.1);
        if (x[3] > 0 && !x[0] && !x[1]) x[1] = -0.01; // lifted but not yet moving: still wants its shadow
      }
    };

    // -- sound: one cue list, fired in order as t passes each time -------------------
    const cues = [];
    const cue = (t, fn) => cues.push({ t, fn });
    const ding = (f, gain = 0.15) => {
      A.tone({ freq: f, dur: 0.6, gain });
      A.tone({ type: 'triangle', freq: f * 2, dur: 0.25, gain: gain * 0.3 });
      A.tone({ freq: f * 1.5, dur: 0.9, gain, delay: 0.1 });
      A.tone({ type: 'triangle', freq: f * 3, dur: 0.3, gain: gain * 0.25, delay: 0.1 });
    };
    const special = {
      chime2: () => ding(830),
      dead: () => A.tone({ type: 'square', freq: 150, dur: 0.12, gain: 0.07 }),
      creak: () => {
        A.tone({ type: 'sawtooth', freq: 240, freqEnd: 130, dur: 0.34, gain: 0.07 });
        A.noise({ filter: 'bandpass', freq: 900, freqEnd: 500, q: 6, dur: 0.3, gain: 0.25 });
      },
    };
    cue(T_POP, () => ding(660)); // the soft, slightly-too-friendly system chime
    for (const [t, name, o] of G.cues) cue(t, special[name] || (() => A.sfx(name, o)));
    // "Great choice!" — a pleased little flourish as the confetti goes up.
    cue(G.acc + 0.09, () => {
      for (let i = 0; i < 4; i++) A.tone({ type: 'triangle', freq: 1175 * Math.pow(1.26, i), dur: 0.16, gain: 0.07, delay: i * 0.045 });
      A.noise({ filter: 'highpass', freq: 6000, dur: 0.18, gain: 0.05, attack: 0.02 });
    });
    cue(T.grab, () => A.sfx('click', { gain: 0.7, pitch: 0.8 }));
    cue(T.drag0, () => { A.sfx('whoosh', { gain: 0.5 }); A.tone({ freq: 560, freqEnd: 170, dur: 0.8, gain: 0.07 }); });
    for (const n in ASM) cue(T.drag0 + ASM[n] + 0.5, () => A.sfx('thud', { gain: 0.16, pitch: 1.5 + ASM[n] * 2 }));
    cue(T.drag1, () => A.sfx('click', { gain: 0.6, pitch: 1.25 }));
    // The build jingle: relentlessly upbeat tutorial music under the whole takeover.
    let music = false;
    cue(T.drag1 - 0.15, () => {
      music = true;
      A.music({
        bpm: 168, gain: 0.34,
        tracks: [
          { type: 'triangle', notes: [72, null, 76, null, 79, null, 76, 79, 84, null, 79, null, 76, 79, 72, null, 74, null, 77, null, 81, null, 77, 81, 86, null, 83, null, 79, 83, 86, 88], gain: 0.2, decay: 0.16 },
          { type: 'square', notes: [48, null, null, 48, null, null, 55, null, 48, null, null, 48, null, 55, null, null, 53, null, null, 53, null, null, 55, null, 55, null, null, 55, null, 59, null, null], gain: 0.07, decay: 0.2, cutoff: 700 },
          { type: 'hat', notes: [1, null, 1, null, 1, null, 1, 1], gain: 0.05 },
          { type: 'kick', notes: [1, null, null, null, 1, null, null, null], gain: 0.3 },
        ],
      });
    });
    // Keys: a steady clatter with a human wobble, and a lower thock at each line's end.
    for (let i = 0, at = T.type0; at < T.type1; i++) {
      const r = plan.keySeeds[i % plan.keySeeds.length];
      cue(at, () => {
        A.noise({ filter: 'bandpass', freq: 2300 + r * 2200, q: 3, dur: 0.022, gain: 0.2, attack: 0.001, pan: r * 0.5 - 0.25 });
        A.tone({ type: 'triangle', freq: 300 + r * 160, freqEnd: 170, dur: 0.02, gain: 0.045, attack: 0.001 });
      });
      at += 0.048 + r * 0.04;
    }
    for (let i = 0; i < nLines; i++) if (code.lines[i].len) cue(lineT1[i], () => A.tone({ type: 'triangle', freq: 190, freqEnd: 120, dur: 0.05, gain: 0.09, attack: 0.001 }));
    for (let i = 0; i < nSteps; i++) cue(b[i], () => A.sfx('blip', { gain: 0.32, pitch: 0.7 + i * 0.09 }));
    if (plan.error) {
      cue(errAt, () => A.sfx('error', { gain: 0.75 }));
      cue(fixAt, () => A.sfx('blip', { gain: 0.5, pitch: 1.7 }));
    }
    cue(T.nag0, () => A.sfx('blip', { gain: 0.4, pitch: 1.35 }));
    if (plan.nag.kind === 'stars') for (let i = 0; i < 5; i++) cue(T.nag0 + 0.44 + i * 0.104, () => A.tone({ type: 'triangle', freq: 880 * Math.pow(1.122, i), dur: 0.12, gain: 0.1 }));
    else if (plan.nag.kind === 'button') cue(T.nag0 + 0.78, () => A.sfx('click', { gain: 0.6, pitch: 1.1 }));
    cue(T.run - 1.5, () => A.sfx('riser', { gain: 0.6 }));
    cue(T.build1, () => A.sfx('chime', { gain: 0.8 }));
    cue(T.run, () => { A.sfx('click', { gain: 1 }); A.stopMusic(0.12); music = false; A.sfx('drop', { gain: 0.5 }); });
    cue(T.white - 0.04, () => A.sfx('boom', { gain: 0.55 }));
    cue(SWAP + 0.16, () => A.sfx('powerup', { gain: 0.7 }));
    cue(T.iris0, () => A.sfx('swoosh', { gain: 0.4, pitch: 1.3 }));
    cue(T.exp0, () => A.sfx('whoosh', { gain: 0.75, pitch: 0.8 }));
    cue(T.exp1 - 0.05, () => A.sfx('thud', { gain: 0.3 }));
    cue(T.toast0, () => ding(990, 0.12));
    cues.sort((p, q) => p.t - q.t);
    let cueAt = 0;

    const pane = { x: 0, y: 0, w: 1, h: 1 };
    const pulseAt = (t, t0, d) => (t < t0 ? 0 : Math.max(0, 1 - (t - t0) / d));

    return {
      update(dt, t) {
        while (cueAt < cues.length && t >= cues[cueAt].t) cues[cueAt++].fn();
      },

      render(t) {
        const g = ctx.g, w = ctx.width, h = ctx.height;
        sync(w, h);
        const S = L.S, dpr = ctx.dpr || 1;
        pointer(t, w, h, cur);

        // ---- the launch: white, then the IDE with the app running in it, then just the app ----
        if (t >= T.white) {
          renderer.clear(); // everything from here on is the 2D layer
          const img = ctx.toImage;
          if (t <= SWAP || !img) {
            g.fillStyle = '#fff';
            g.fillRect(0, 0, w, h);
            return;
          }
          const e = ease.inOutCubic(seg(t, T.exp0, T.exp1));
          lerpRect(L.scr, FULL, e, pane);
          const rad = (th.hard ? 0 : 8 * S) * (1 - e);
          if (e < 1) {
            state(t);
            st.zoom = pane.w / w;
            scatter(t, w, h);
            drawIdeBack(g, th, L, plan, st, to);
            if (e > 0) softShadow(g, pane.x, pane.y, pane.w, pane.h, rad, 70 * S * Math.sin(Math.PI * e), 0.4);
            const k = ease.inOutCubic(seg(t, T.iris0, T.iris1));
            if (k < 1) drawSplash(g, pane, to, plan, t - SWAP, rad);
            if (k > 0) {
              // The splash irises open on the app itself.
              g.save();
              roundRect(g, pane.x, pane.y, pane.w, pane.h, rad);
              g.clip();
              if (k < 1) {
                g.beginPath();
                g.arc(pane.x + pane.w / 2, pane.y + pane.h / 2, k * Math.hypot(pane.w, pane.h) * 0.52, 0, Math.PI * 2);
                g.clip();
              }
              g.drawImage(img, pane.x, pane.y, pane.w, pane.h);
              g.restore();
            }
            if (e === 0 && !th.hard) {
              g.strokeStyle = 'rgba(128,134,150,0.35)';
              g.lineWidth = 1;
              roundRect(g, pane.x + 0.5, pane.y + 0.5, pane.w - 1, pane.h - 1, rad);
              g.stroke();
            }
            drawIdeFront(g, th, L, plan, st);
            const ca = 1 - seg(t, T.exp0 - 0.05, T.exp0 + 0.2);
            if (ca > 0) {
              g.globalAlpha = ca;
              drawPointer(g, cur.x, cur.y, CS, 'arrow', 0, 0);
              g.globalAlpha = 1;
            }
          } else {
            // Full-screen: let go of the still frame and hand over to the live world beneath.
            const a = 1 - ease.inOutQuad(seg(t, T.exp1, T.fade1));
            if (a > 0) {
              g.globalAlpha = a;
              g.drawImage(img, 0, 0, w, h);
              g.globalAlpha = 1;
            }
          }
          drawToast(g, th, w, h, plan, to, seg(t, T.toast0, T.toast0 + 0.45), seg(t, T.toast1, T.toast1 + 0.3), t);
          const fa = 1 - ease.outCubic(seg(t, SWAP + 0.1, SWAP + 0.62));
          if (fa > 0) {
            g.fillStyle = `rgba(255,255,255,${fa})`;
            g.fillRect(0, 0, w, h);
          }
          return;
        }

        // ---- GL: the old world, wherever it is and whatever is being done to it ----
        worldRect(t);
        const blur = ease.outCubic(seg(t, T.scrim, T.scrim + 0.5)) * (1 - ease.inOutCubic(seg(t, T_OUT - 0.04, T_OUT + 0.26)));
        U.uRect.value.set(R.x / w, 1 - (R.y + R.h) / h, (R.x + R.w) / w, 1 - R.y / h);
        U.uPx.value.set(1 / (R.w * dpr), 1 / (R.h * dpr));
        U.uSA.value = w / h;
        U.uBlur.value = blur;
        U.uDim.value = blur * 0.3;
        U.uFront.value = t < b[0] ? -1 : lerp(-0.08, 1.08, ease.inOutQuad(seg(t, b[0] + 0.03, b[1] - 0.05)));
        U.uBlock.value = seg(t, b[1], b[1] + 0.4);
        U.uCells.value = t < b[2] ? plan.cells : plan.cells * 2;
        U.uBlank.value = ease.inOutQuad(seg(t, b[3], b[3] + 0.42));
        U.uTick.value = Math.floor(t * 14);
        const inErr = plan.error && t >= errAt && t < fixAt;
        let gl = inErr ? 0.9 : 0;
        for (let i = 1; i < nSteps; i++) gl = Math.max(gl, pulseAt(t, b[i], 0.17));
        U.uGlitch.value = gl;
        U.uErr.value = inErr ? 1 : 0;
        pass.render(renderer);

        const tagK = seg(t, T_OUT + 0.2, T_OUT + 0.46), tagGone = seg(t, b[0] + 0.62, b[0] + 0.92), tagDel = t > b[0] + 0.26;
        const fx = clamp(ctx.focus.x / w, 0.06, 0.94), fy = clamp(ctx.focus.y / h, 0.12, 0.9);
        const tagScale = clamp(R.w / w, 0.5, 1) * clamp(D.s, 0.7, 1.2);
        const ha = Math.min(seg(t, T.grab, T.grab + 0.08), 1 - seg(t, T.drag1 + 0.12, T.drag1 + 0.4));

        if (t < T.drag0) {
          // ---- Act 1: the dialog over the frozen world ----
          drawGag(g, th, D, plan, plan.gag, t, cur, confetti);
          drawInspector(g, R, fx, fy, plan, plan.loseColor, tagK, false, 0, tagScale);
          drawHandles(g, th, R, S, ha, cornerOf(R, w, h), w, h);
        } else {
          // ---- Act 2: the IDE, with a hole where the GL layer shows the world ----
          state(t);
          st.zoom = R.w / w;
          assemble(t, w, h);
          drawIdeBack(g, th, L, plan, st, to);
          drawIdeFront(g, th, L, plan, st);
          drawNag(g, th, L, plan, seg(t, T.nag0, T.nag0 + 0.4), seg(t, T.nag1, T.nag1 + 0.28), seg(t, T.nag0 + 0.42, T.nag0 + 1.0), t);
          const e = seg(t, T.drag0, T.drag1), rad = th.hard ? 0 : 8 * S * ease.inOutCubic(e);
          softShadow(g, R.x, R.y, R.w, R.h, rad, 80 * S * Math.sin(Math.PI * e), 0.42);
          g.globalCompositeOperation = 'destination-out';
          roundRect(g, R.x, R.y, R.w, R.h, rad);
          g.fillStyle = '#000';
          g.fill();
          g.globalCompositeOperation = 'source-over';
          if (th.hard || e >= 1) {
            g.strokeStyle = th.hard ? th.line : 'rgba(128,134,150,0.35)';
            g.lineWidth = th.hard ? 1.5 : 1;
            roundRect(g, R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, rad);
            g.stroke();
          }
          drawInspector(g, R, fx, fy, plan, plan.loseColor, tagK, tagDel, tagGone, tagScale);
          drawScaffold(g, R, plan, to, fx, fy, seg(t, b[3] + 0.12, b[3] + 0.4), seg(t, b[3] + 0.26, b[3] + 0.54), ease.outCubic(seg(t, b[4] + 0.1, b[4] + 0.4)), seg(t, b[3] + 0.05, b[3] + 0.35));
          drawReady(g, R, to, seg(t, T.build1 + 0.02, T.build1 + 0.3), t);
          drawHandles(g, th, R, S, ha, cornerOf(R, w, h), w, h);
        }
        // Clicks and the pointer sit above everything.
        for (const r of ripples) drawRipple(g, r.x, r.y, CS, (t - r.t) / 0.4, r.ok ? '#ffffff' : '#ff6170');
        drawPointer(g, cur.x, cur.y, CS, cur.kind, cur.ang, cur.press);
        // Run is pressed: the preview blooms to white and takes the screen with it.
        if (t > T.run + 0.03) {
          const k = seg(t, T.run + 0.03, T.white), cx = R.x + R.w / 2, cy = R.y + R.h / 2;
          g.fillStyle = `rgba(255,255,255,${Math.min(1, k * 2.4)})`;
          roundRect(g, R.x, R.y, R.w, R.h, th.hard ? 0 : 8 * S);
          g.fill();
          const gr = g.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(w, h) * (0.12 + 1.25 * k * k));
          gr.addColorStop(0, `rgba(255,255,255,${Math.min(1, k * 1.7)})`);
          gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gr;
          g.fillRect(0, 0, w, h);
          g.fillStyle = `rgba(255,255,255,${k * k * k})`;
          g.fillRect(0, 0, w, h);
        }
      },

      dispose() {
        if (music) A.stopMusic(0.05);
        tex.dispose();
        softTex.dispose();
        pass.dispose();
      },
    };
  },
};
