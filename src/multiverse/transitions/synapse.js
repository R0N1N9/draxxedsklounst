// LAST SYNAPSE — the last thing the loser's brain ever does in this world.
//
// CONCEPT
//   The frozen old world turns out to be a reflection on the loser's eye. The pupil
//   blows open and we fall through it to the microscopic scale: a dark forest of glowing
//   neurons. One cell ignites and its impulse races down a myelinated axon — saltatory
//   jumps of light, node to node — with the camera chasing it through the network while
//   other cells answer in the two snipers' colours. At the last synapse the vesicles
//   burst, the charge crosses the cleft, and that discharge is the white-out that carries
//   both players across. The receiving dendrite then grows through the white as a tree
//   of lightning, and the next world develops along it: outlines first, then the place.
//
// BEAT SHEET (10.4 s, swap at 6.66 s)
//   0.00  the old world, untouched (the cut in is invisible)
//   0.0 → 1.2   ACT 1 · pull back: the picture shrinks onto a cornea; iris, lids and a
//               catchlight arrive around it; an "optic record" types who / what / how
//   1.2 → 1.6   the pupil dilates; the last image collapses like a tube switching off
//   1.55 → 2.3  plunge through the pupil — the scale bar falls from metres to microns
//   2.3 → 2.9   ACT 2 · the forest, at rest: the first cell holds the old world as a memory
//   2.9         ignition
//   2.98 → 5.66 the chase: hops accelerate, relay cells fire, recruited cells light in
//               amber and cyan, the loser's last thought lands a word per node; from 4.4
//               the next world's palette floods the tissue from the far end
//   5.66 → 6.45 the synapse: vesicles driven into the membrane, sparks across the cleft,
//               the spine takes the hit — white-out (opaque white from 6.45)
//   6.66        THE SWAP, held on white
//   6.78        ACT 3 · the title lands in ink on the white
//   7.08 → 10.2 the post-synaptic tree grows through the white; behind its front the new
//               world is line art, then real; the title's island is the last white to go
//   10.4        fully transparent
//
// AXES OF VARIATION (all drawn once from ctx.rng)
//   1. stain — five tissue colour schemes (violet / GFP / crimson / brainbow / silver)
//   2. network — route curvature, 1-3 relay cells, 7-15 hops, forest density and layout
//   3. camera — which flank, start elevation, how far it corkscrews, sway, roll, lens,
//      and the angle of the final tableau at the synapse
//   4. the eye — iris pattern, framing, pupil sizes, which way the picture turns as it
//      recedes, where the catchlight sits
//   5. memories — which three of six images (reticle, score, shooter, kill label, the
//      valley where it began, a flatline) gutter inside the cells beside the old world
//   6. words — the record's header, the loser's last thought, the arrival overline
//   7. the arrival tree — trunks, forks and the order the picture is uncovered in
//
// CONTEXT
//   ctx.focus is the centre of the pull-back (the impact point becomes the pupil);
//   the iris, the impulse and the "last thought" belong to the loser, the recruited
//   pathways alternate winner / loser colours, the record names loser, winner, ctx.how
//   and the old world; the old frame is the memory in the first cell; score, round and
//   match point are in the memories and on the title; the next world's palette floods
//   the tissue, colours the discharge and the growth, and its name, perspective and
//   tagline are the title. A drawn round (no winner) gets its own copy.
import { seg, pulse, ease, clamp, clamp01, lerp, smoothstep, rand, pick, randSign, mixHex, luminance, canvasTexture, fullscreenPass } from '../kit.js';
import { PLAYER_COLORS } from '../contract.js';
import * as SH from './synapse/shaders.js';
import { buildNetwork, buildGrowth, STAINS, rgb } from './synapse/network.js';
import { buildAtlas, drawRecord, drawScale, drawChase, titleLayout, drawTitle, accentPair } from './synapse/overlay.js';

const DURATION = 10.4, SWAP_AT = 0.64;
const LEVELS = 5; // bloom pyramid depth

function timeline() {
  const swap = DURATION * SWAP_AT, D = DURATION;
  return {
    D, swap,
    eyeIn: 0.22, pull1: 1.2, dilate: 1.2, crt: 1.3, plunge0: 1.55, plunge1: 2.3, neuroIn: 1.55,
    ignite: 2.9, chase0: 2.98, chase1: swap - 1.0,
    burst: swap - 0.97, cross: swap - 0.74, white0: swap - 0.62, white1: swap - 0.21,
    flood0: swap - 2.3, flood1: swap - 0.6,
    title: swap + 0.12, reveal0: swap + 0.42, reveal1: D - 0.2,
  };
}

export default {
  id: 'synapse',
  name: 'LAST SYNAPSE',
  duration: DURATION,
  swapAt: SWAP_AT,

  create(ctx) {
    const { THREE, renderer } = ctx.three;
    const rng = ctx.rng, T = timeline(), A = ctx.audio;
    // One colour space for screen and targets alike: three keys its programs on it, and a
    // second compile of the grade the first time it draws to the screen would hitch mid-film.
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    // --- who and what this film is about -------------------------------------------------
    const winner = ctx.winner, loser = ctx.loser;
    const colW = winner ? winner.color : PLAYER_COLORS[0], colL = loser ? loser.color : PLAYER_COLORS[1];
    const irisHex = loser ? loser.color : ctx.from.palette.accent;
    const pal = ctx.to.palette;
    const acc = accentPair(pal.accent);
    const accRgb = rgb(acc.light), white = [1, 1, 1];
    const pulseRgb = rgb(mixHex(colL, '#ffffff', 0.22));
    const stain = pick(rng, STAINS);
    const bgTo = rgb(pal.bg), bgMax = Math.max(bgTo[0], bgTo[1], bgTo[2], 1e-3);
    const bg2 = bgTo.map((v, i) => v * Math.min(1, 0.2 / bgMax) + accRgb[i] * 0.03); // the next world's ground, kept dark enough to be haze
    const ink = mixHex('#07070d', luminance(pal.bg) < 0.2 ? pal.bg : '#000000', 0.45);

    const net = buildNetwork(THREE, rng, { T, stain, pulse: pulseRgb, sideCols: [rgb(colW), rgb(colL)], accent: accRgb, fg: luminance(pal.fg) > 0.25 ? rgb(pal.fg) : white });
    const atlas = buildAtlas(ctx, rng, colW);
    const J = net.hops, st = net.stations;

    const eye = {
      seed: rand(rng, 0, 50), ri: rand(rng, 0.44, 0.54), cx: 0.5 + rand(rng, 0.03, 0.1), cy: 0.5 + rand(rng, -0.07, -0.01),
      rot: rand(rng, 0.12, 0.4) * randSign(rng), imgS: rand(rng, 0.17, 0.22), p0: rand(rng, 0.34, 0.42), p1: rand(rng, 0.68, 0.78),
      light: [rand(rng, 0.24, 0.4) * randSign(rng), rand(rng, 0.24, 0.4)],
    };
    const cam = {
      side: randSign(rng), phi0: rand(rng, -0.4, 0.9), spin: rand(rng, 0.6, 2.2) * randSign(rng),
      sway: rand(rng, 0.15, 0.4), swayF: rand(rng, 1, 2.4), rad0: rand(rng, 10, 14), rad1: rand(rng, 8, 11.5),
      ahead: rand(rng, 7, 13), roll: rand(rng, 0.08, 0.3) * randSign(rng), rollF: rand(rng, 0.6, 1.4),
      fov0: rand(rng, 40, 48), fov1: rand(rng, 58, 68),
      endPhi: rand(rng, -0.3, 0.55), endRad: rand(rng, 15, 19), endBack: rand(rng, -3, 2),
    };

    // --- words ----------------------------------------------------------------------------
    const how = ctx.how || '';
    const rec = {
      t0: 0.34, t1: T.plunge0 + 0.3, accent: irisHex,
      header: `${pick(rng, ['OPTIC RECORD', 'RETINAL LOG', 'LAST LIGHT', 'CORNEAL TRACE'])} · ROUND ${String(ctx.round).padStart(2, '0')}`,
      lines: [
        { label: loser ? 'SUBJECT' : 'SUBJECTS', parts: [{ text: loser ? loser.name : 'BOTH SNIPERS', color: loser ? loser.color : '#ffffff' }] },
        { label: 'LAST IMAGE', parts: [{ text: ctx.from.name, color: '#ffffff' }, { text: ctx.from.perspective ? `  ·  ${ctx.from.perspective}` : '', color: '#9a9fb6' }] },
        { label: 'CAUSE', parts: winner ? [{ text: `${how || 'ONE CLEAN SHOT'}  —  `, color: '#ffffff' }, { text: winner.name, color: winner.color }] : [{ text: 'STALEMATE  —  NOBODY', color: '#ffffff' }] },
      ],
    };
    let thoughts;
    if (!loser) thoughts = ['DID ANYBODY HIT ANYTHING?', 'CALL IT A DRAW. NOBODY SAW THAT.', 'TWO SNIPERS. ZERO HITS. HM.'];
    else {
      const W = winner.name.toUpperCase();
      thoughts = ['I HAD THE SHOT. I HAD IT.', `NICE ONE, ${W}.`, 'SHOULD HAVE KEPT MOVING.', 'WAS THAT A GLINT—', 'LAG. DEFINITELY LAG.', 'WHO PUTS A SNIPER THERE?', `HOW DID ${W} SEE ME?`, 'I NEVER EVEN HEARD IT.',
        `SO MUCH FOR ${ctx.from.name}.`, `WAIT. IS THAT ${ctx.to.name}?`];
      if (how) thoughts.push(`${how}? REALLY?`, `OF COURSE. ${how}.`);
      if (ctx.matchPoint) thoughts.push('NOT LIKE THIS. NOT NOW.', 'MATCH POINT. BREATHE.', 'MATCH POINT. BREATHE.');
      if ((ctx.score[loser.index] || 0) === 0 && (ctx.score[winner.index] || 0) >= 2) thoughts.push('STILL ZERO. GREAT.');
    }
    const words = pick(rng, thoughts).split(' ');
    // Word i lands with the hop that carries the thought that far; the last arrives one hop early.
    const wordAt = words.map((_, i) => {
      let j = 1;
      while (j < J - 1 && Math.ceil((j / Math.max(1, J - 1)) * words.length) < i + 1) j++;
      return st[j].land;
    });
    const title = {
      name: ctx.to.name, tagline: ctx.to.tagline || '', round: ctx.round + 1, matchPoint: !!ctx.matchPoint,
      over: `${pick(rng, ['SIGNAL RECEIVED', 'SYNAPSE FIRED', 'IMPULSE DELIVERED', 'NEXT THOUGHT'])}  →  ${ctx.to.perspective || 'A NEW DIMENSION'}`,
      ink, accentDark: acc.dark, accentLight: acc.light,
      players: [0, 1].map((i) => {
        const p = winner && winner.index === i ? winner : loser && loser.index === i ? loser : null;
        return { name: p ? p.name : '', color: p ? p.color : PLAYER_COLORS[i], score: ctx.score[i] || 0 };
      }),
    };

    // --- GPU: textures, the tissue scene, targets, passes -----------------------------------
    const texFrom = canvasTexture(THREE, ctx.fromImage, { srgb: false });
    const texMem = canvasTexture(THREE, atlas.canvas, { srgb: false });
    const texBlack = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    texBlack.needsUpdate = true;
    let texTo = null;

    const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    const U = {
      uTime: { value: 0 }, uTan: { value: 1 }, uInvH: { value: 1 / 720 }, uFog: { value: 0.0105 }, uFlood: { value: 0 }, uGain: { value: 1 },
      uFloodCol: { value: V3(accRgb) }, uFocus: { value: 20 }, uAperture: { value: 0.22 }, uCocMax: { value: 0.032 },
      uShutter: { value: 1 / 70 }, uAspect: { value: 1 }, uCamVel: { value: new THREE.Vector3() },
      tMem: { value: texMem }, uTiles: { value: atlas.tiles },
    };
    const glow = { transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide };
    const mRibbon = new THREE.ShaderMaterial({ uniforms: U, vertexShader: SH.RIBBON_VERT, fragmentShader: SH.RIBBON_FRAG, ...glow });
    const mSoma = new THREE.ShaderMaterial({ uniforms: U, vertexShader: SH.SOMA_VERT, fragmentShader: SH.SOMA_FRAG, ...glow });
    const mSprite = new THREE.ShaderMaterial({ uniforms: U, vertexShader: SH.SPRITE_VERT, fragmentShader: SH.SPRITE_FRAG, ...glow });
    const flareU = () => ({ uPos: { value: new THREE.Vector3() }, uSize: { value: 8 }, uCol: { value: V3(pulseRgb) }, uI: { value: 0 }, uRot: { value: 0 } });
    const mHead = new THREE.ShaderMaterial({ uniforms: flareU(), vertexShader: SH.FLARE_VERT, fragmentShader: SH.FLARE_FRAG, ...glow });
    const mCleft = new THREE.ShaderMaterial({ uniforms: flareU(), vertexShader: SH.FLARE_VERT, fragmentShader: SH.FLARE_FRAG, ...glow });
    mCleft.uniforms.uCol.value.set(lerp(accRgb[0], 1, 0.35), lerp(accRgb[1], 1, 0.35), lerp(accRgb[2], 1, 0.35));
    const quad = new THREE.PlaneGeometry(2, 2);
    const scene = new THREE.Scene();
    const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; scene.add(m); return m; };
    const meshes = [add(net.ribbons, mRibbon), add(net.somas, mSoma), add(net.sprites, mSprite), add(quad, mHead), add(quad, mCleft)];
    const camera = new THREE.PerspectiveCamera(50, ctx.width / ctx.height, 0.3, 700);

    const rtOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false };
    const rt = (o) => new THREE.WebGLRenderTarget(4, 4, { ...rtOpts, ...o });
    const rtScene = rt(), rtGraded = rt({ type: THREE.UnsignedByteType }), rtWarm = rt();
    const down = [], up = [];
    for (let i = 0; i < LEVELS; i++) { down.push(rt()); if (i < LEVELS - 1) up.push(rt()); }
    const aspect0 = ctx.width / ctx.height;
    const rtGrow = new THREE.WebGLRenderTarget(Math.round(400 * clamp(aspect0, 1, 2.4)), 400, { ...rtOpts, type: THREE.UnsignedByteType });

    const v2 = () => new THREE.Vector2();
    const pDown = fullscreenPass(THREE, { fragmentShader: SH.DOWN_FRAG, uniforms: { tSrc: { value: null }, uTexel: { value: v2() }, uClamp: { value: 14 } } });
    const pUp = fullscreenPass(THREE, { fragmentShader: SH.UP_FRAG, uniforms: { tSrc: { value: null }, tAdd: { value: null }, uTexel: { value: v2() }, uAdd: { value: 1 } } });
    const pGrade = fullscreenPass(THREE, {
      fragmentShader: SH.GRADE_FRAG,
      uniforms: {
        tScene: { value: rtScene.texture }, tBloom: { value: up[0].texture }, uTime: { value: 0 }, uAspect: { value: 1 }, uExposure: { value: 1.15 }, uBloom: { value: 0.3 },
        uWarp: { value: 0 }, uFlash: { value: 0 }, uFlood: { value: 0 }, uIn: { value: 1 }, uCentre: { value: v2() }, uFlashPos: { value: new THREE.Vector2(0.5, 0.6) },
        uBg: { value: V3(stain.bg) }, uBg2: { value: V3(bg2) }, uFlashCol: { value: new THREE.Vector3(1, 1, 1) }, uTint: { value: V3(accRgb.map((v) => lerp(v, 1, 0.3))) },
      },
    });
    const focusUv = new THREE.Vector2(clamp01(ctx.focus.x / ctx.width), clamp01(1 - ctx.focus.y / ctx.height));
    const pEye = fullscreenPass(THREE, {
      fragmentShader: SH.EYE_FRAG,
      uniforms: {
        tFrom: { value: texFrom }, tNeuro: { value: texBlack }, uAspect: { value: 1 }, uA: { value: 0 }, uRi: { value: 2.6 }, uP: { value: eye.p0 }, uImgS: { value: 1 },
        uImgRot: { value: 0 }, uBulge: { value: 0 }, uImgGain: { value: 1 }, uNeuro: { value: 0 }, uSeed: { value: eye.seed }, uLid: { value: 1 },
        uFocusUv: { value: focusUv }, uC: { value: focusUv.clone() }, uCrt: { value: new THREE.Vector2(1, 1) }, uLight: { value: new THREE.Vector2(eye.light[0], eye.light[1]) },
        uIris: { value: V3(rgb(irisHex)) },
      },
    });
    const pArrive = fullscreenPass(THREE, {
      fragmentShader: SH.ARRIVE_FRAG,
      uniforms: {
        tGrow: { value: rtGrow.texture }, tTo: { value: texBlack }, uK: { value: 0 }, uAspect: { value: 1 }, uIslT: { value: 1.2 }, uOut: { value: 1 }, uHasTo: { value: 0 },
        uTexel: { value: v2() }, uInk: { value: V3(rgb(ink)) }, uAccent: { value: V3(accRgb) }, uWhite: { value: new THREE.Vector3(1, 1, 1) }, uIsl: { value: new THREE.Vector4(0.9, 0.4, 0.3, 0.12) },
      },
    });

    // --- camera: a pure function of t, so its velocity can be had by asking twice ----------
    const P = { x: 0, y: 0, z: 0 }, Tn = { x: 0, y: 0, z: 0 }, Bn = { x: 0, y: 0, z: 0 }, Nn = { x: 0, y: 0, z: 0 };
    const cs = {}, c0 = {}, c1 = {};
    function camAt(t, o) {
      const sp = net.pulseS(t), sc = net.camS(t);
      const kIn = ease.outQuart(seg(t, T.neuroIn, T.ignite + 0.3));
      const kCh = seg(t, T.ignite - 0.15, T.chase1), kChS = ease.inOutSine(kCh);
      const kEnd = ease.inOutCubic(seg(t, T.chase1 - 1.0, T.chase1 + 0.3)); // swung out to the tableau by the time the charge lands
      const back = lerp(lerp(lerp(88, 21, kIn), 12.5, kChS), cam.endBack, kEnd);
      const rad = lerp(lerp(cam.rad0, cam.rad1, kChS), cam.endRad, kEnd);
      const phi = lerp(cam.phi0 + cam.spin * kChS + cam.sway * Math.sin(kCh * Math.PI * cam.swayF), cam.endPhi, kEnd);
      const sCam = sc - back;
      net.route.at(sCam, P);
      net.route.frame(sCam, Tn, Bn, Nn);
      const ox = Math.cos(phi) * cam.side * rad, oy = Math.sin(phi) * rad;
      o.px = P.x + Bn.x * ox + Nn.x * oy; o.py = P.y + Bn.y * ox + Nn.y * oy; o.pz = P.z + Bn.z * ox + Nn.z * oy;
      net.route.at(lerp(lerp(sc, sp, 0.3) + lerp(4, cam.ahead, kChS), net.cleftS, kEnd), P);
      o.lx = P.x; o.ly = P.y; o.lz = P.z;
      net.route.at(lerp(sp, net.cleftS, seg(t, T.burst, T.cross)), P);
      o.hx = P.x; o.hy = P.y; o.hz = P.z;
      o.roll = cam.roll * Math.sin(kCh * Math.PI * 2 * cam.rollF) * (1 - kEnd);
      o.tilt = 0.2 * kEnd; // look below the cleft: the discharge sits in the upper half, clear of the title
      o.fov = lerp(lerp(cam.fov0, cam.fov1, kChS), 46, kEnd) - 12 * ease.inCubic(seg(t, T.cross, T.white1));
      return o;
    }
    function applyCam(t) {
      camAt(t, cs);
      camera.fov = cs.fov;
      camera.aspect = ctx.width / ctx.height;
      camera.updateProjectionMatrix();
      camera.position.set(cs.px, cs.py, cs.pz);
      camera.up.set(0, 1, 0);
      camera.lookAt(cs.lx, cs.ly, cs.lz);
      camera.rotateZ(cs.roll);
      camera.rotateX(-cs.tilt);
      camera.updateMatrixWorld(true);
    }
    const tmp = new THREE.Vector3();
    const toUv = (x, y, z, out) => { tmp.set(x, y, z).project(camera); return out.set(tmp.x * 0.5 + 0.5, tmp.y * 0.5 + 0.5); };

    // The arrival tree is rooted where the discharge will be on screen.
    applyCam(T.white1);
    const cleft = net.route.at(net.cleftS, { x: 0, y: 0, z: 0 });
    const rootUv = toUv(cleft.x, cleft.y, cleft.z, v2());
    const root = { x: clamp(rootUv.x, 0.3, 0.7) * aspect0, y: clamp(rootUv.y, 0.66, 0.82) };
    const growGeo = buildGrowth(THREE, rng, aspect0, root);
    const mGrow = new THREE.ShaderMaterial({
      uniforms: { uAspect0: { value: aspect0 } }, vertexShader: SH.GROW_VERT, fragmentShader: SH.GROW_FRAG, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      transparent: true, blending: THREE.CustomBlending, blendEquation: THREE.MinEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    const growScene = new THREE.Scene();
    const growMesh = new THREE.Mesh(growGeo, mGrow);
    growMesh.frustumCulled = false;
    growScene.add(growMesh);
    const flatCam = new THREE.Camera();
    let grown = false;
    function ensureGrow() {
      if (grown) return;
      grown = true;
      renderer.setRenderTarget(rtGrow);
      renderer.setClearColor(0xffffff, 1); // "never": MIN blending carves arrival times out of it
      renderer.render(growScene, flatCam);
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(null);
    }

    let rtW = 0, rtH = 0;
    const size = v2();
    function sizeTargets() {
      renderer.getDrawingBufferSize(size);
      const k = ctx.dpr >= 1.5 ? 0.75 : 1; // the tissue is all soft light: 1.5x CSS resolution is plenty
      const W = Math.max(16, Math.round(size.x * k)), H = Math.max(16, Math.round(size.y * k));
      if (W === rtW && H === rtH) return;
      rtW = W; rtH = H;
      rtScene.setSize(W, H);
      rtGraded.setSize(W, H);
      for (let i = 0; i < LEVELS; i++) {
        const w = Math.max(2, W >> (i + 1)), h = Math.max(2, H >> (i + 1));
        down[i].setSize(w, h);
        if (i < LEVELS - 1) up[i].setSize(w, h);
      }
    }

    // --- the tissue, one frame ----------------------------------------------------------------
    const headUv = v2();
    function renderTissue(t, target) {
      const aspect = ctx.width / ctx.height;
      applyCam(t);
      camAt(t - 1 / 120, c0);
      camAt(t + 1 / 120, c1);
      const vx = (c1.px - c0.px) * 60, vy = (c1.py - c0.py) * 60, vz = (c1.pz - c0.pz) * 60;
      const speed = Math.hypot(vx, vy, vz);
      const flood = ease.inOutSine(seg(t, T.flood0, T.flood1));
      U.uTime.value = t;
      U.uTan.value = 2 * Math.tan((cs.fov * Math.PI) / 360);
      U.uInvH.value = 1 / rtH;
      U.uAspect.value = aspect;
      U.uFocus.value = Math.max(3, Math.hypot(cs.hx - cs.px, cs.hy - cs.py, cs.hz - cs.pz));
      U.uCamVel.value.set(vx, vy, vz);
      U.uFlood.value = flood;

      // The head of the impulse flares each time it lands.
      let landed = 0;
      while (landed < J && t >= st[landed + 1].land) landed++;
      const since = t - st[landed].land;
      const hu = mHead.uniforms;
      hu.uPos.value.set(cs.hx, cs.hy, cs.hz);
      hu.uI.value = t < T.ignite ? 0 : (0.5 + 1.6 * Math.exp(-since * 9)) * (1 - seg(t, T.cross, T.cross + 0.2));
      hu.uSize.value = 4.5 + 3 * Math.exp(-since * 7);
      hu.uRot.value = 0.4 + t * 0.7;
      const kd = seg(t, T.burst + 0.12, T.white1);
      const cu = mCleft.uniforms;
      cu.uPos.value.set(cleft.x, cleft.y, cleft.z);
      cu.uI.value = 7 * kd * kd;
      cu.uSize.value = 8 + 44 * kd * kd;
      cu.uRot.value = -t * 1.3;

      renderer.setRenderTarget(rtScene);
      renderer.render(scene, camera);
      let src = rtScene;
      for (let i = 0; i < LEVELS; i++) {
        pDown.uniforms.tSrc.value = src.texture;
        pDown.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
        renderer.setRenderTarget(down[i]);
        pDown.render(renderer);
        src = down[i];
      }
      for (let i = LEVELS - 2; i >= 0; i--) {
        pUp.uniforms.tSrc.value = src.texture;
        pUp.uniforms.uTexel.value.set(0.5 / src.width, 0.5 / src.height);
        pUp.uniforms.tAdd.value = down[i].texture;
        renderer.setRenderTarget(up[i]);
        pUp.render(renderer);
        src = up[i];
      }
      const gu = pGrade.uniforms;
      toUv(cs.hx, cs.hy, cs.hz, headUv);
      gu.uCentre.value.set(lerp(0.5, clamp(headUv.x, 0.2, 0.8), 0.6), lerp(0.5, clamp(headUv.y, 0.2, 0.8), 0.6));
      toUv(cleft.x, cleft.y, cleft.z, gu.uFlashPos.value);
      gu.uTime.value = t;
      gu.uAspect.value = aspect;
      gu.uIn.value = smoothstep(T.neuroIn, T.neuroIn + 0.6, t);
      gu.uWarp.value = 0.0025 + 0.02 * clamp01(speed / 170) + 0.035 * (1 - seg(t, T.neuroIn, T.plunge1 + 0.3));
      gu.uFlood.value = flood;
      gu.uFlash.value = ease.inQuad(seg(t, T.white0, T.white1));
      gu.uExposure.value = 1.15 + 0.5 * kd;
      renderer.setRenderTarget(target);
      pGrade.render(renderer);
      renderer.setRenderTarget(null);
    }

    function eyeAt(t, aspect) {
      const u = pEye.uniforms;
      const kPull = ease.inOutCubic(seg(t, 0, T.pull1));
      const kZoom = ease.inCubic(seg(t, T.plunge0, T.plunge1));
      const Z = Math.exp(4.4 * kZoom);
      u.uAspect.value = aspect;
      u.uA.value = smoothstep(0, T.eyeIn, t);
      u.uRi.value = 2.6 * Math.pow(eye.ri / 2.6, kPull) * Z;
      u.uImgS.value = Math.pow(eye.imgS, kPull) * Z;
      u.uC.value.set(lerp(lerp(focusUv.x, eye.cx, kPull), 0.5, kZoom), lerp(lerp(focusUv.y, eye.cy, kPull), 0.5, kZoom));
      u.uImgRot.value = eye.rot * kPull;
      u.uBulge.value = 0.85 * kPull;
      u.uP.value = lerp(eye.p0, eye.p1, ease.outBack(seg(t, T.dilate, T.dilate + 0.42)));
      // The tube switches off: the picture collapses to a line, the line to a dot, the dot goes out.
      const k1 = ease.inCubic(seg(t, T.crt, T.crt + 0.14)), k2 = ease.inCubic(seg(t, T.crt + 0.12, T.crt + 0.3));
      u.uCrt.value.set(lerp(1, 0.02, k2), lerp(1, 0.012, k1));
      u.uImgGain.value = (1 + 2.6 * k1) * (1 - seg(t, T.crt + 0.27, T.crt + 0.4));
      u.uNeuro.value = smoothstep(T.neuroIn + 0.05, T.neuroIn + 0.45, t);
      u.tNeuro.value = t >= T.neuroIn ? rtGraded.texture : texBlack;
    }

    // Compile the tissue's programs (and upload its buffers) one per frame while the film
    // is still nearly static, instead of all at once on the first frame of the plunge.
    const only = (i) => meshes.forEach((m, k) => { m.visible = i < 0 || k === i; });
    const warmDraw = (fn) => () => { renderer.setRenderTarget(rtWarm); fn(); renderer.setRenderTarget(null); };
    const warm = [0, 1, 2, 3].map((i) => warmDraw(() => { only(i); renderer.render(scene, camera); only(-1); }));
    warm.push(warmDraw(() => { pDown.uniforms.tSrc.value = texBlack; pDown.render(renderer); }));
    warm.push(warmDraw(() => { pUp.uniforms.tSrc.value = pUp.uniforms.tAdd.value = texBlack; pUp.render(renderer); }));
    warm.push(warmDraw(() => pGrade.render(renderer)), warmDraw(() => pArrive.render(renderer)), ensureGrow);

    // --- sound: one-shots keyed to the timeline ------------------------------------------------
    const cues = [];
    const cue = (t, fn) => cues.push({ t, fn });
    cue(0, () => { A.sfx('heartbeat', { gain: 0.9 }); A.tone({ freq: 58, freqEnd: 40, dur: 2.5, gain: 0.16, attack: 0.3 }); });
    cue(0.1, () => A.noise({ filter: 'lowpass', freq: 2200, freqEnd: 160, q: 0.8, dur: 1.3, gain: 0.26, attack: 0.08 }));
    cue(0.74, () => A.sfx('heartbeat', { gain: 0.8, pitch: 0.9 }));
    cue(T.dilate + 0.08, () => { A.sfx('click', { gain: 0.7 }); A.tone({ type: 'triangle', freq: 1500, freqEnd: 70, dur: 0.45, gain: 0.15 }); });
    cue(T.plunge0, () => { A.sfx('whoosh', { gain: 0.9 }); A.noise({ filter: 'bandpass', freq: 180, freqEnd: 2600, q: 1.2, dur: 0.85, gain: 0.3, attack: 0.55 }); });
    [0, 0.22, 0.4].forEach((d, i) => cue(T.plunge1 - 0.05 + d, () => A.tone({ freq: [1318, 988, 1760][i], dur: 0.7, gain: 0.05, pan: [-0.5, 0.4, 0][i], attack: 0.02 })));
    cue(T.ignite, () => { A.sfx('zap', { gain: 0.9 }); A.sfx('thud', { gain: 0.8 }); A.tone({ type: 'sawtooth', freq: 110, freqEnd: 330, dur: 0.5, gain: 0.06, attack: 0.02 }); });
    const scale = [0, 3, 5, 7, 10];
    for (let j = 1; j <= J; j++) {
      const f = 392 * Math.pow(2, (scale[j % 5] + 12 * Math.floor(j / 5)) / 12), pan = j & 1 ? 0.45 : -0.45;
      cue(st[j].land, () => {
        A.tone({ type: 'triangle', freq: f, dur: 0.18, gain: 0.15, pan, attack: 0.002 });
        A.noise({ filter: 'highpass', freq: 5200, dur: 0.035, gain: 0.14, attack: 0.001, pan });
        if (st[j].kind === 'soma') A.sfx('chime', { gain: 0.5, pitch: 0.5 + 0.12 * j });
        if (st[j].kind === 'terminal') A.sfx('thud', { gain: 0.7 });
      });
    }
    if (ctx.matchPoint) [0.25, 0.6].forEach((k) => cue(lerp(T.chase0, T.chase1, k), () => A.sfx('heartbeat', { gain: 0.7, pitch: 1.15 })));
    cue(T.swap - 1.74, () => A.sfx('riser', { gain: 0.85 }));
    cue(T.burst + 0.14, () => A.sfx('shatter', { gain: 0.45 }));
    cue(T.cross, () => { A.sfx('zap', { gain: 0.8, pitch: 1.4 }); A.sfx('laser', { gain: 0.3, pitch: 0.6 }); });
    cue(T.white1 - 0.06, () => A.sfx('boom', { gain: 1 }));
    cue(T.title, () => A.sfx('tick', { gain: 0.5, pitch: 0.6 }));
    cue(T.reveal0, () => {
      A.sfx('chime', { gain: 0.55 });
      [261.63, 392, 523.25, 783.99].forEach((f, i) => A.tone({ type: i < 2 ? 'triangle' : 'sine', freq: f, dur: 1.9 - i * 0.2, gain: 0.07, delay: 0.1 + i * 0.09, pan: (i - 1.5) * 0.3, attack: 0.03 }));
    });
    [0.15, 0.55, 1.0, 1.5].forEach((d, i) => cue(T.reveal0 + d, () => A.noise({ filter: 'bandpass', freq: 5200 + i * 900, q: 4, dur: 0.14, gain: 0.1, attack: 0.002, pan: i & 1 ? 0.6 : -0.6 })));
    cue(T.D - 1.15, () => A.sfx('swoosh', { gain: 0.3 }));
    cues.sort((a, b) => a.t - b.t);
    let cueAt = 0;

    // --- 2D helpers ---------------------------------------------------------------------------
    // The scale bar's length in metres: twenty metres of world, a centimetre of eye, microns.
    const metresAt = (t) => Math.pow(10, lerp(lerp(1.3, -1.92, ease.inOutCubic(seg(t, 0, T.pull1))), -4.7, ease.inOutSine(seg(t, T.plunge0, T.plunge1 + 0.2))));
    const magOf = (m) => `×${String(Math.round(20 / m)).replace(/\B(?=(\d{3})+$)/g, ' ')}`;
    let lay = null, layKey = '';
    const chase = { a: 0, node: 0, nodes: J, speed: 0, title: 'SALTATORY CONDUCTION', who: `LAST THOUGHT · ${loser ? loser.name : 'BOTH OF THEM'}`, words, shown: 0, fresh: 1, color: mixHex(colL, '#ffffff', 0.15) };

    return {
      update(dt, t) {
        while (cueAt < cues.length && t >= cues[cueAt].t) cues[cueAt++].fn();
      },

      render(t) {
        const g = ctx.g, w = ctx.width, h = ctx.height, aspect = w / h;
        sizeTargets();
        if (t < T.plunge1) {
          // ACT 1: the eye (with the tissue already running behind the pupil during the plunge).
          if (t >= T.neuroIn) renderTissue(t, rtGraded);
          else if (warm.length) warm.shift()();
          eyeAt(t, aspect);
          renderer.setRenderTarget(null);
          pEye.render(renderer);
        } else if (t < T.white1) {
          renderTissue(t, null); // ACT 2
        } else {
          // ACT 3: white, then the tree. Until the new world's first frame exists nothing opens.
          ensureGrow();
          const to = ctx.toImage, u = pArrive.uniforms;
          if (to && !texTo) {
            texTo = canvasTexture(THREE, to, { srgb: false });
            u.tTo.value = texTo;
            u.uHasTo.value = 1;
          }
          const key = `${w}x${h}`;
          if (key !== layKey) { layKey = key; lay = titleLayout(g, w, h, title); }
          const k = to ? 1.75 * Math.pow(seg(t, T.reveal0, T.reveal1), 1.1) : 0;
          u.uK.value = k;
          u.uAspect.value = aspect;
          u.uTexel.value.set(1.2 / w, 1.2 / h);
          u.uOut.value = 1 - smoothstep(T.D - 0.3, T.D - 0.05, t);
          u.uIsl.value.set(lay.cx / h, 1 - lay.cy / h, lay.bw / 2 / h, lay.bh / 2 / h);
          renderer.setRenderTarget(null);
          pArrive.render(renderer);
          if (t >= T.title) drawTitle(g, lay, t - T.title, smoothstep(1.16, 1.4, k), title);
        }

        // Instrument readouts over acts 1 and 2.
        if (t < T.white1) {
          drawRecord(g, w, h, t, rec);
          const m = metresAt(t);
          drawScale(g, w, h, pulse(t, 0.34, T.white0 + 0.1, 0.3), m, magOf(m));
          chase.a = pulse(t, T.ignite - 0.3, T.white0 + 0.15, 0.25);
          if (chase.a > 0) {
            let landed = 0;
            while (landed < J && t >= st[landed + 1].land) landed++;
            chase.node = landed;
            chase.speed = ((net.camS(t + 0.05) - net.camS(t - 0.05)) / 0.1) * 0.9;
            let shown = 0;
            while (shown < words.length && t >= wordAt[shown]) shown++;
            chase.shown = shown;
            chase.fresh = shown ? seg(t, wordAt[shown - 1], wordAt[shown - 1] + 0.3) : 1;
            drawChase(g, w, h, chase);
          }
        }
      },

      dispose() {
        for (const o of [texFrom, texMem, texBlack, texTo, net.ribbons, net.somas, net.sprites, quad, growGeo, mRibbon, mSoma, mSprite, mHead, mCleft, mGrow,
          rtScene, rtGraded, rtWarm, rtGrow, ...down, ...up, pDown, pUp, pGrade, pEye, pArrive]) {
          if (o) o.dispose();
        }
        renderer.setRenderTarget(null);
      },
    };
  },
};
