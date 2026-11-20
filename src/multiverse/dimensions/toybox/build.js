// TOY BOX — the room: floorboards, the rug, everything standing on it, the lamp and its
// light. Also the one shader patch every material shares: the copters' spotlights and the
// headlights that sweep in through the blind are added there, analytically, so they cost
// no shadow maps and no extra light slots.
import { clamp, lerp, makeRng, makeCanvas, rand, TAU } from '../../kit.js';
import { RUG_A, RUG_B, LOOP, SPOT_R, TIDY } from './world.js';
import { TOY } from './tex.js';

export const LAMP_HEAD = { x: -18.4, y: 5.7, z: -8.8 }, LAMP_BASE = { x: -23.6, z: -11.4 };
const LIGHT_POS = { x: -8.5, y: 17.5, z: -11.5 }; // where the light really comes from: higher, for a rounder pool

const PATCH_PARS = `
uniform vec4 uTbHead; uniform vec3 uTbHeadDir; uniform vec3 uTbHeadCol; uniform vec4 uTbSpot[2]; uniform vec3 uTbSpotCol; uniform vec3 uTbUp; uniform float uTbLim;
varying vec3 vTbW;`;
const PATCH_LIGHT = `
#include <lights_fragment_end>
{
  float tbD = vTbW.x * uTbHead.z + vTbW.z * uTbHead.w - uTbHead.x;
  float tbQ = -vTbW.x * uTbHead.w + vTbW.z * uTbHead.z;
  float tbWin = (1.0 - smoothstep(4.8, 7.2, abs(tbD))) * (1.0 - smoothstep(10.0, 16.0, abs(tbQ + 2.0))) * uTbHead.y;
  float tbSlat = smoothstep(0.2, 0.4, abs(fract(tbD * 0.46) - 0.5) * 2.0);
  vec3 tbIrr = uTbHeadCol * tbWin * tbSlat * max(dot(normal, uTbHeadDir), 0.0);
  float tbUp = 0.3 + 0.7 * max(dot(normal, uTbUp), 0.0);
  for (int i = 0; i < 2; i++) tbIrr += uTbSpotCol * uTbSpot[i].z * (1.0 - smoothstep(${(SPOT_R * 0.5).toFixed(2)}, ${SPOT_R.toFixed(2)}, length(vTbW.xz - uTbSpot[i].xy))) * tbUp;
  reflectedLight.directDiffuse += tbIrr * BRDF_Lambert(material.diffuseColor);
}`;

export function buildRoom(THREE, renderer, W, tex, toys, G, Q, players) {
  const HEMI = Q.pbr ? 1.0 : 1.5; // (no reflections in the software build: a little more sky instead)
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0.012, 0.01, 0.02);
  const rng = makeRng(0x7075);
  const U = {
    head: { value: new THREE.Vector4(0, 0, W.head.ca, W.head.sa) }, headDir: { value: new THREE.Vector3(0, 1, 0) }, headCol: { value: new THREE.Color(12, 10.5, 8) },
    spot: { value: [new THREE.Vector4(), new THREE.Vector4()] }, spotCol: { value: new THREE.Color(4.4, 5.0, 6.1) }, up: { value: new THREE.Vector3(0, 1, 0) }, lim: { value: 99 },
  };
  const owned = []; // materials and geometries made here
  const keep = (x) => { owned.push(x); return x; };

  // opt: { clip: discard beyond the rolled-up ends of the rug, cell: per-instance atlas column }
  function patch(material, opt = {}) {
    material.onBeforeCompile = (sh) => {
      sh.uniforms.uTbHead = U.head; sh.uniforms.uTbHeadDir = U.headDir; sh.uniforms.uTbHeadCol = U.headCol;
      sh.uniforms.uTbSpot = U.spot; sh.uniforms.uTbSpotCol = U.spotCol; sh.uniforms.uTbUp = U.up; sh.uniforms.uTbLim = U.lim;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTbW;' + (opt.cell ? '\nattribute float aCell;' : ''))
        .replace('#include <project_vertex>', '#include <project_vertex>\nvec4 tbP = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\ntbP = instanceMatrix * tbP;\n#endif\nvTbW = (modelMatrix * tbP).xyz;');
      if (opt.cell) sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv.x = (uv.x + aCell) * 0.25;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>' + PATCH_PARS)
        .replace('#include <lights_fragment_end>', PATCH_LIGHT);
      if (opt.clip) sh.fragmentShader = sh.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (abs(vTbW.x) > uTbLim) discard;');
    };
    material.customProgramCacheKey = () => 'toybox' + (opt.clip ? 'c' : '') + (opt.cell ? 'i' : '');
    return keep(material);
  }
  // The software build lights everything with Lambert: a fraction of the cost per pixel.
  const std = (o, opt) => {
    if (Q.pbr) return patch(new THREE.MeshStandardMaterial({ metalness: 0, ...o }), opt);
    const { roughness, roughnessMap, envMapIntensity, ...rest } = o;
    return patch(new THREE.MeshLambertMaterial(rest), opt);
  };
  const gloss = (o) => (Q.rich ? patch(new THREE.MeshPhysicalMaterial({ metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.2, ...o })) : std(o));
  const M = {
    floor: std({ map: tex.boards, roughnessMap: tex.boardsRough, roughness: 0.62, envMapIntensity: 0.9 }),
    rug: std({ map: tex.rug, roughness: 0.96, envMapIntensity: 0.15 }, { clip: true }),
    block: std({ map: tex.blocks, roughness: 0.5 }),
    paint: std({ vertexColors: true, roughness: 0.4 }),
    matte: std({ vertexColors: true, roughness: 0.85 }),
    cover: std({ map: tex.covers, roughness: 0.55 }),
    paper: std({ map: tex.paper, roughness: 0.92 }),
    track: std({ map: tex.track, roughness: 0.6 }),
    domino: std({ map: tex.domino, roughness: 0.28 }, { cell: true }),
    glass: gloss({ vertexColors: true, roughness: 0.08 }),
    plush: patch(Q.rich ? new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 1, metalness: 0, sheen: 1, sheenRoughness: 0.55, sheenColor: new THREE.Color('#ffd9a8') }) : Q.pbr ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }) : new THREE.MeshLambertMaterial({ vertexColors: true })),
    roll: std({ map: tex.rollSide, roughness: 0.95 }),
    rollCap: std({ map: tex.rollCap, roughness: 0.95 }),
    glow: keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.82, 0.3), side: THREE.DoubleSide })),
    bulb: keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 10, 5) })),
  };
  const mesh = (geo, mat, cast = true, receive = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = receive; return m; };
  const add = (m) => { scene.add(m); return m; };

  // ---- floor and rug ----
  const floor = add(mesh(keep(new THREE.PlaneGeometry(150, 110).rotateX(-Math.PI / 2)), M.floor, false));
  floor.position.y = -0.16;
  {
    // The boards are mapped in world units so the plank width stays right whatever the plane's size.
    const uv = floor.geometry.attributes.uv, p = floor.geometry.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i), p.getZ(i));
  }
  const rug = add(mesh(keep(new THREE.CircleGeometry(1, 96).rotateX(-Math.PI / 2).scale(RUG_A, 1, RUG_B)), M.rug, false));
  {
    // Its edge: a thin wall down to the boards, in the braid of the outermost ring (and the rug's
    // own material, so it costs no shader of its own).
    const n = 96, pos = [], nor = [], uv = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU, c = Math.cos(a), s = Math.sin(a), nl = Math.hypot(c / RUG_A, s / RUG_B);
      pos.push(c * RUG_A, 0, s * RUG_B, c * (RUG_A + 0.05), -0.16, s * (RUG_B + 0.05));
      nor.push(c / RUG_A / nl, 0.2, s / RUG_B / nl, c / RUG_A / nl, 0.2, s / RUG_B / nl);
      uv.push(0.5 + c * 0.497, 0.5 - s * 0.497, 0.5 + c * 0.493, 0.5 - s * 0.493); // (the rug's disc is laid with its v running to -z)
      if (i < n) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    add(mesh(g, M.rug, false));
  }
  const rollGeo = keep(new THREE.CylinderGeometry(1, 1, 1, 22).rotateX(Math.PI / 2));
  const rolls = [-1, 1].map((s) => { const m = add(mesh(rollGeo, [M.roll, M.rollCap, M.rollCap])); m.visible = false; m.userData.s = s; return m; });

  // ---- the track ----
  {
    const n = 180, hw = 0.82, top = 0.15, pos = [], nor = [], uv = [], idx = [];
    let len = 0, px = LOOP.x + LOOP.a, pz = LOOP.z;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU, c = Math.cos(a), s = Math.sin(a), x = LOOP.x + c * LOOP.a, z = LOOP.z + s * LOOP.b;
      len += Math.hypot(x - px, z - pz); px = x; pz = z;
      const nl = Math.hypot(c / LOOP.a, s / LOOP.b), nx = c / LOOP.a / nl, nz = s / LOOP.b / nl, u = len / 2.4;
      // inner top, outer top, then the two walls
      pos.push(x - nx * hw, top, z - nz * hw, x + nx * hw, top, z + nz * hw, x - nx * hw, top, z - nz * hw, x - nx * hw, 0, z - nz * hw, x + nx * hw, top, z + nz * hw, x + nx * hw, 0, z + nz * hw);
      nor.push(0, 1, 0, 0, 1, 0, -nx, 0, -nz, -nx, 0, -nz, nx, 0, nz, nx, 0, nz);
      uv.push(u, 0, u, 1, u, 0.02, u, 0.02, u, 0.98, u, 0.98);
      if (i < n) { const b = i * 6; idx.push(b, b + 6, b + 1, b + 1, b + 6, b + 7, b + 2, b + 3, b + 8, b + 3, b + 9, b + 8, b + 4, b + 10, b + 5, b + 5, b + 10, b + 11); }
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    W.trackView = add(mesh(g, M.track));
  }

  // ---- what stands on the rug ----
  const blockGeo = (cells) => keep(G.faceCells(G.rbox(2.1, 2.1, 2.1, 0.13, 3), cells, 4, 4));
  const anyCells = () => Array.from({ length: 6 }, () => 4 + Math.floor(rng() * 12));
  const views = []; // { o, obj, y0 } — for the tidy-up
  const dom = { list: [], inst: null };
  for (const o of W.solids) {
    let obj = null;
    if (o.kind === 'block') {
      obj = new THREE.Group();
      const f = o.face;
      if (o.tall) {
        const lo = mesh(blockGeo(Array(6).fill(3)), M.block), hi = mesh(blockGeo(Array(6).fill(2)), M.block);
        lo.position.y = 1.05; hi.position.y = 3.15; hi.rotation.y = 0.4;
        obj.add(lo, hi);
      } else { const m = mesh(blockGeo(f >= 0 ? Array(6).fill(f) : anyCells()), M.block); m.position.y = 1.05; obj.add(m); }
    } else if (o.kind === 'pair') {
      obj = new THREE.Group();
      for (const s of [-1, 1]) { const m = mesh(blockGeo(anyCells()), M.block); m.position.set(s * 1.06, 1.05, 0); m.rotation.y = rand(rng, -0.06, 0.06); obj.add(m); }
    } else if (o.kind === 'books') {
      obj = new THREE.Group();
      const b = new G.Bag(), cols = ['#24365f', '#c9573b', '#3d7f58', '#7a4a8a', '#c9a24a'];
      let y = 0, last = null;
      for (let i = 0; i < 4; i++) {
        const w = 4.3 - i * 0.22 - rng() * 0.2, d = 3.05 - rng() * 0.25, h = rand(rng, 0.45, 0.68), ox = rand(rng, -0.12, 0.12), oz = rand(rng, -0.1, 0.1), r = rand(rng, -0.09, 0.09), col = i === 3 ? ['#24365f', '#c9573b', '#3d7f58'][o.id % 3] : cols[Math.floor(rng() * cols.length)];
        b.add(G.rbox(w - 0.14, h - 0.12, d - 0.1, 0.03, 1), { p: [ox + 0.05, y + h / 2, oz], r: [0, r, 0], color: '#efe6cf' }); // pages
        b.add(G.rbox(w, 0.07, d, 0.03, 1), { p: [ox, y + 0.035, oz], r: [0, r, 0], color: col });
        b.add(G.rbox(w, 0.07, d, 0.03, 1), { p: [ox, y + h - 0.035, oz], r: [0, r, 0], color: col });
        b.add(G.rbox(0.09, h, d, 0.03, 1), { p: [ox - w / 2 + 0.045 * Math.cos(r), y + h / 2, oz + (w / 2) * Math.sin(r)], r: [0, r, 0], color: col }); // spine
        y += h;
        last = { w, d, ox, oz, r };
      }
      o.h = y;
      obj.add(mesh(keep(b.build()), M.matte));
      // The top book has a picture on it.
      const cg = keep(new THREE.PlaneGeometry(last.w - 0.5, last.d - 0.4).rotateX(-Math.PI / 2)), cu = cg.attributes.uv, ci = o.id % 3;
      for (let i = 0; i < cu.count; i++) cu.setX(i, (ci + cu.getX(i)) / 3);
      const c = mesh(cg, M.cover, false);
      c.position.set(last.ox, y + 0.006, last.oz); c.rotation.y = last.r;
      obj.add(c);
    } else if (o.kind === 'row') {
      for (let i = 0; i < o.row.n; i++) dom.list.push({ o, i, cell: Math.floor(rng() * 4) });
    } else if (o.kind === 'car') {
      obj = mesh(toys.cars[o.id - W.cars[0].id], M.paint);
    }
    if (!obj) continue;
    obj.position.set(o.x, 0, o.z);
    obj.rotation.y = -o.rot;
    add(obj);
    views.push({ o, obj });
  }
  // Dominoes: one instanced mesh; each instance picks one of four faces from the atlas.
  if (dom.list.length) {
    const g = keep(G.rbox(0.95, 1.9, 0.24, 0.05, 2)), uv = g.attributes.uv, per = uv.count / 6;
    for (let i = 0; i < uv.count; i++) if (Math.floor(i / per) < 4) uv.setXY(i, 0.06, 0.03); // only the two faces carry pips
    const cells = new Float32Array(dom.list.length);
    dom.list.forEach((d, i) => { cells[i] = d.cell; });
    g.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 1));
    dom.inst = add(new THREE.InstancedMesh(g, M.domino, dom.list.length));
    dom.inst.castShadow = dom.inst.receiveShadow = true;
    dom.inst.frustumCulled = false;
  }

  // ---- the lamp ----
  const ld = new THREE.Vector3(0 - LAMP_HEAD.x, 0 - LAMP_HEAD.y, 0.5 - LAMP_HEAD.z).normalize();
  const lampGeo = toys.lamp(LAMP_BASE, LAMP_HEAD, ld);
  keep(lampGeo.body); keep(lampGeo.glow); keep(lampGeo.bulb);
  add(mesh(lampGeo.body, std({ vertexColors: true, roughness: 0.32 }), false, false)); // (the inside of the shade is the glow)
  add(mesh(lampGeo.glow, M.glow, false, false));
  add(mesh(lampGeo.bulb, M.bulb, false, false));
  // The glow round the bulb and the mouth of the shade: the one hot thing in a dark room, and
  // the light the whole picture is lit by. A soft disc that always faces the lens.
  const glowTex = keep(new THREE.CanvasTexture((() => {
    const c = makeCanvas(128, 128), g = c.g, r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.12, 'rgba(255,255,255,0.7)'); r.addColorStop(0.35, 'rgba(255,255,255,0.18)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    return c.canvas;
  })()));
  [[1.0, 3.2, new THREE.Color(5, 3.2, 1.5)], [2.3, 9.5, new THREE.Color(0.9, 0.52, 0.22)]].forEach(([at, size, color]) => {
    const sp = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false })));
    sp.position.set(LAMP_HEAD.x + ld.x * at, LAMP_HEAD.y + ld.y * at, LAMP_HEAD.z + ld.z * at); sp.scale.setScalar(size); sp.renderOrder = 6;
    add(sp);
  });

  // ---- the big soft things round the edge (they never move: one mesh per material) ----
  {
    const b = new G.Bag();
    toys.stacker(b, -18.4, 15.4);
    toys.chest(b, 13.2, -19.4, -0.1);
    [[1.0, 17.4, 0.4, TOY.red], [6.6, 15.3, -0.9, TOY.blue], [5.6, 17.9, 2.4, TOY.green], [-11.8, -15.4, 1.0, TOY.yellow], [-7.6, -16.9, -0.5, '#e8792c'], [16.5, 16.6, 0.2, '#7a4a8a'], [-13.6, 14.2, 2.0, TOY.blue], [22.6, -6.5, 1.3, TOY.red], [-23.2, 5.8, 0.5, TOY.green]]
      .forEach(([x, z, r, c]) => toys.crayon(b, x, z, r, c));
    add(mesh(keep(b.build()), M.paint));
    const p = new G.Bag();
    toys.bear(p, 20.4, -15.6, 2.45, 1.55);
    add(mesh(keep(p.build()), M.plush));
    const m = new G.Bag();
    [[-6, 15.6, '#2f5fc4'], [-4.6, 16.5, '#2f9a5f'], [-7.4, 16.8, '#c94a3a'], [9.4, 16.0, '#e6dfc8'], [-4.6, -15.2, '#2f5fc4'], [23.4, 3.2, '#c94a3a'], [-22.6, -4.4, '#2f9a5f']]
      .forEach(([x, z, c], i) => m.add(G.ball(0.44, 16, 12), { p: [x, 0.28, z], color: c, s: 1 + (i % 3) * 0.12 }));
    add(mesh(keep(m.build()), M.glass));
    const ball = add(mesh(keep(toys.beachBall(2.5)), M.glass));
    ball.position.set(19.6, 2.34, 14.9); ball.rotation.set(0.5, 0.8, 0.3);
    // Drawings on scrap paper.
    [[3.6, 16.2, 0.22, 0], [-10.2, -16.4, -0.3, 1], [11.8, 16.9, -0.15, 2], [-15.6, 16.6, 0.5, 3]].forEach(([x, z, r, cell]) => {
      const g = keep(new THREE.PlaneGeometry(5, 5).rotateX(-Math.PI / 2)), uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, ((cell & 1) + uv.getX(i)) / 2, 1 - ((cell >> 1) + 1 - uv.getY(i)) / 2);
      const s = add(mesh(g, M.paper, false));
      s.position.set(x, -0.145, z); s.rotation.y = r;
    });
    // Spare blocks nobody put away.
    [[-12.6, -17.6, 0.3, 0], [-10.4, -18.9, -0.5, 0], [-11.6, -18.2, 0.9, 2.1], [14.6, 17.2, 0.7, 0], [-22.4, 10.6, 0.2, 0]].forEach(([x, z, r, y]) => {
      const b2 = add(mesh(blockGeo(anyCells()), M.block));
      b2.position.set(x, 0.89 + y, z); b2.rotation.y = r;
    });
  }

  // ---- light ----
  const hemi = add(new THREE.HemisphereLight(new THREE.Color(0.3, 0.44, 1.0), new THREE.Color(0.15, 0.14, 0.22), HEMI));
  const fill = add(new THREE.DirectionalLight(new THREE.Color(0.4, 0.56, 1), 0.85)); // the last of the dusk, from the window
  fill.position.set(14, 12, 16);
  const LAMP_I = 3900, lamp = new THREE.SpotLight(new THREE.Color(1, 0.8, 0.56), LAMP_I, 0, 0.46, 0.85, 2);
  lamp.position.set(LIGHT_POS.x, LIGHT_POS.y, LIGHT_POS.z);
  lamp.castShadow = Q.shadow > 0;
  lamp.shadow.mapSize.set(Q.shadow, Q.shadow);
  lamp.shadow.camera.near = 6; lamp.shadow.camera.far = 60;
  lamp.shadow.bias = -0.0006; lamp.shadow.normalBias = 0.03;
  lamp.shadow.radius = 2.5;
  add(lamp); add(lamp.target);
  const big = add(new THREE.DirectionalLight(new THREE.Color(1, 0.95, 0.86), 0)); // the big light: sudden death
  big.position.set(-4, 30, 6);

  // What the varnish and the plastic reflect: a dim room with one lamp and one window.
  let envRT = null;
  if (Q.rich) {
    const es = new THREE.Scene(), eg = new THREE.SphereGeometry(40, 24, 12), ep = eg.attributes.position, ec = new Float32Array(ep.count * 3);
    for (let i = 0; i < ep.count; i++) {
      const y = ep.getY(i) / 40, k = clamp(y * 0.5 + 0.5, 0, 1);
      ec[i * 3] = lerp(0.1, 0.05, k); ec[i * 3 + 1] = lerp(0.065, 0.07, k); ec[i * 3 + 2] = lerp(0.045, 0.16, k);
    }
    eg.setAttribute('color', new THREE.BufferAttribute(ec, 3));
    const em = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }), bg = new THREE.BoxGeometry(1, 1, 1);
    const warm = new THREE.MeshBasicMaterial({ color: new THREE.Color(16, 10, 4.5) }), cool = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 1.6, 3.2) });
    es.add(new THREE.Mesh(eg, em));
    const l1 = new THREE.Mesh(bg, warm); l1.position.set(-14, 22, -16); l1.scale.set(9, 1, 9); l1.lookAt(0, 0, 0);
    const l2 = new THREE.Mesh(bg, cool); l2.position.set(26, 12, 20); l2.scale.set(1, 14, 10);
    es.add(l1, l2);
    const pm = new THREE.PMREMGenerator(renderer);
    envRT = pm.fromScene(es, 0.03);
    pm.dispose();
    for (const x of [eg, bg, em, warm, cool]) x.dispose();
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.55;
  }

  // ---- the lamp's beam in the dusty air, and the dust ----
  const beamMat = keep(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uApex: { value: new THREE.Vector3(LAMP_HEAD.x + ld.x * 1.6, LAMP_HEAD.y + ld.y * 1.6, LAMP_HEAD.z + ld.z * 1.6) }, uPool: { value: new THREE.Vector2() }, uA: { value: 0.06 } },
    // A cone of lit air is brightest where you look through most of it: its middle, not its edges.
    vertexShader: 'attribute vec3 aRing; uniform vec3 uApex; uniform vec2 uPool; varying float vT; varying float vE;\nvoid main() { vT = aRing.z; vE = abs(normalize(mat3(viewMatrix) * vec3(aRing.x, 0.0, aRing.y)).z); vec3 p = mix(uApex + vec3(aRing.x, 0.0, aRing.y) * 0.16, vec3(uPool.x + aRing.x, 0.0, uPool.y + aRing.y), aRing.z); gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }',
    fragmentShader: 'precision highp float; uniform float uA; varying float vT; varying float vE;\nvoid main() { float a = pow(1.0 - vT, 1.3) * pow(vE, 1.6); gl_FragColor = vec4(vec3(1.0, 0.72, 0.4) * a * uA, 1.0); }',
  }));
  {
    const n = 48, ring = [], pos = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU, x = Math.cos(a) * 9.2, z = Math.sin(a) * 8.2;
      ring.push(x, z, 0, x, z, 1);
      pos.push(i / n, 0, 0, i / n, 0, 0);
      if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aRing', new THREE.Float32BufferAttribute(ring, 3)); g.setIndex(idx);
    const beam = add(new THREE.Mesh(g, beamMat));
    beam.frustumCulled = false; beam.renderOrder = 5;
  }
  const DUST = Q.rich ? 170 : 90;
  const dustMat = keep(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uPx: { value: 1 }, uPool: { value: new THREE.Vector2() }, uLamp: { value: new THREE.Vector3(LAMP_HEAD.x, LAMP_HEAD.y, LAMP_HEAD.z) } },
    vertexShader: `attribute vec4 aSeed; uniform float uT, uPx; uniform vec2 uPool; uniform vec3 uLamp; varying float vA;
void main() {
  vec3 p = position;
  p.x += sin(uT * 0.21 * aSeed.x + aSeed.y * 6.28) * 1.6; p.z += cos(uT * 0.17 * aSeed.z + aSeed.x * 6.28) * 1.6;
  p.y = mod(p.y - uT * 0.12 * (0.4 + aSeed.w), 9.0);
  // Lit only inside the lamp's cone: a mote drifts in, flares, drifts out.
  vec3 base = vec3(uPool.x, 0.0, uPool.y), ax = normalize(base - uLamp);
  vec3 d = p - uLamp; float h = dot(d, ax), rr = length(d - ax * h);
  float cone = 1.0 - smoothstep(0.38, 0.5, rr / max(h, 0.5));
  vA = cone * (0.35 + 0.65 * abs(sin(uT * (0.8 + aSeed.y) + aSeed.w * 20.0)));
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  gl_PointSize = (1.2 + aSeed.z * 2.2) * uPx;
}`,
    fragmentShader: 'precision highp float; varying float vA;\nvoid main() { vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.05, length(c)) * vA; gl_FragColor = vec4(vec3(1.0, 0.82, 0.55) * a * 0.6, 1.0); }',
  }));
  {
    const pos = new Float32Array(DUST * 3), seed = new Float32Array(DUST * 4);
    for (let i = 0; i < DUST; i++) {
      pos[i * 3] = rand(rng, -15, 13); pos[i * 3 + 1] = rng() * 9; pos[i * 3 + 2] = rand(rng, -13, 11);
      for (let k = 0; k < 4; k++) seed[i * 4 + k] = rng();
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    const dust = add(new THREE.Points(g, dustMat));
    dust.frustumCulled = false; dust.renderOrder = 6;
  }

  const ma = new THREE.Matrix4(), mb = new THREE.Matrix4(), headDirW = new THREE.Vector3(0.5 * W.head.side, 0.42, 0.76).normalize();
  let bigK = 0;

  return {
    scene, U, M, patch, std, keep, lamp,
    // fx: { pop(x, y, z), puff(x, y, z) } — sparkle when a toy is tidied away, steam from the engine
    update(dt, T, wt, camera, pxPerUnit, fx) {
      // Uniforms shared by every patched material.
      U.head.value.x = W.head.p; U.head.value.y = W.head.k;
      U.headDir.value.copy(headDirW).transformDirection(camera.matrixWorldInverse);
      U.up.value.set(0, 1, 0).transformDirection(camera.matrixWorldInverse);
      for (let i = 0; i < 2; i++) U.spot.value[i].set(W.spots[i].x, W.spots[i].z, W.spots[i].on, 0);
      const ts = W.suddenT(T);
      U.lim.value = ts >= TIDY ? W.lim + 0.5 : 99;
      // The lamp sways a little on its neck; the pool, the beam and the dust go with it.
      lamp.target.position.set(W.pool.x, 0, W.pool.z);
      beamMat.uniforms.uPool.value.set(W.pool.x, W.pool.z);
      dustMat.uniforms.uPool.value.set(W.pool.x, W.pool.z);
      dustMat.uniforms.uT.value = wt; dustMat.uniforms.uPx.value = pxPerUnit * 0.045 * renderer.getPixelRatio();
      // Sudden death: somebody turns the big light on.
      bigK += ((ts >= 0 ? 1 : 0) - bigK) * Math.min(1, dt * 5);
      // (the room gets brighter, not whiter: the lamp's pool gives way rather than stacking up)
      big.intensity = bigK * (Q.pbr ? 1.25 : 0.9); hemi.intensity = HEMI + bigK * (Q.pbr ? 0.3 : 0.12); lamp.intensity = LAMP_I * (1 - bigK * 0.45);
      beamMat.uniforms.uA.value = 0.06 * (1 - bigK * 0.7);
      // The train, and whatever is being tidied away.
      for (const v of views) {
        const o = v.o, obj = v.obj;
        if (o.kind === 'car') {
          obj.position.set(o.x, 0.15, o.z); obj.rotation.set(0, -o.rot, Math.sin(wt * 11 + o.id) * 0.012);
          if (o === W.cars[0] && fx && o.on && Math.random() < dt * 5) fx.puff(o.x + Math.cos(o.rot) * 0.9, 2.6, o.z + Math.sin(o.rot) * 0.9);
        }
        if (ts < 0) continue;
        const k = clamp((ts - o.popAt + 0.32) / 0.32, 0, 1);
        if (k >= 1) { if (obj.visible) { obj.visible = false; if (fx) fx.pop(o.x, 1.2, o.z); } continue; }
        if (k > 0) { obj.position.y = (o.kind === 'car' ? 0.15 : 0) + Math.sin(k * Math.PI * 0.5) * 1.6; obj.scale.setScalar(1 - k * k); obj.rotation.y = -o.rot + k * 2.5; }
      }
      if (ts >= 0 && W.trackView.visible && ts > TIDY - 0.9) { W.trackView.visible = false; }
      // Dominoes: standing, falling in turn, or gone.
      if (dom.inst) {
        for (let n = 0; n < dom.list.length; n++) {
          const d = dom.list[n], o = d.o, r = o.row, l = (d.i - (r.n - 1) / 2) * r.gap, c = Math.cos(o.rot), s = Math.sin(o.rot);
          let ang = 0, sc = 1;
          if (r.fall[d.i] >= 0) {
            const u = clamp((T - r.fall[d.i]) / 0.3, 0, 1), last = d.i + r.dir[d.i] < 0 || d.i + r.dir[d.i] >= r.n;
            ang = r.dir[d.i] * (last ? 1.5 : 1.2) * u * u * (1 + 0.12 * Math.sin(u * Math.PI) * (1 - u));
          }
          if (ts >= 0) sc = 1 - clamp((ts - o.popAt + 0.3) / 0.3, 0, 1);
          ma.makeTranslation(r.cx + c * l, 0, r.cz + s * l);
          mb.makeRotationY(Math.PI / 2 - o.rot); ma.multiply(mb);
          mb.makeRotationX(ang); ma.multiply(mb);
          mb.makeTranslation(0, 0.95, 0); ma.multiply(mb);
          mb.makeScale(sc, sc, sc); ma.multiply(mb);
          dom.inst.setMatrixAt(n, ma);
        }
        dom.inst.instanceMatrix.needsUpdate = true;
      }
      // The rug, rolling itself up from both ends.
      for (const m of rolls) {
        m.visible = ts >= TIDY && W.lim < RUG_A - 1;
        if (!m.visible) continue;
        const x = W.lim + 0.5, r = 0.45 + 0.05 * (RUG_A - x), len = 2 * RUG_B * Math.sqrt(Math.max(0.02, 1 - (x * x) / (RUG_A * RUG_A)));
        m.position.set(m.userData.s * (x + r * 0.2), r - 0.1, 0);
        m.scale.set(r, r, len + 0.4);
        m.rotation.z = -m.userData.s * (RUG_A - x) * 1.4;
      }
    },
    dispose() {
      for (const x of owned) x.dispose();
      if (envRT) envRT.dispose();
      if (lamp.shadow.map) lamp.shadow.map.dispose();
      scene.environment = null;
    },
  };
}
