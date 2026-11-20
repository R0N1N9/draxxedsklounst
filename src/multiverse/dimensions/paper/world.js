// The static yard: ground, containers, concourse buildings, paper panels, skyline. Everything is built once into
// a handful of merged meshes (one fill mesh, one line set) so the whole drawn world costs a few draw calls.
import { INK, PAPER, KRAFT, CONT, SKY, GROUND, GROUND_SHADE, YARD_OUT, WALL, TRIM, ID, faceTone, darker, lighter, lin } from './style.js';
import { FillBuf, LineBuf, LineSet } from './lines.js';
import { drawSheet, drawMascot, drawBerthSign, drawCloud } from './art.js';
import { CW, CH, STEEL, PAPER as PAPERS, SPAWN_Z, BUILD_Z, YARD_X, GANTRY_X, makeNav } from './layout.js';

export const HOLES = 12, RING = 12, HOLE_R = 0.17;

const PANEL_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const PANEL_FS = `
precision highp float;
uniform sampler2D uMap; uniform vec2 uSize; uniform vec3 uHoles[${HOLES}];
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uMap, vec2(gl_FrontFacing ? vUv.x : 1.0 - vUv.x, vUv.y)); // printed on both sides, never mirrored
  if (c.a < 0.04) discard;
  vec2 p = (vUv - vec2(0.5, 0.0)) * uSize;
  for (int i = 0; i < ${HOLES}; i++) { vec3 h = uHoles[i]; if (h.z > 0.0 && length(p - h.xy) < h.z) discard; }
  gl_FragColor = vec4(c.rgb, c.a);
  #include <colorspace_fragment>
}`;

function hull(pts) { // convex hull (monotone chain) of [x, z] points
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length > 1 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop();
  return lo.concat(up);
}

export function buildWorld(ctx, THREE, mats) {
  const rng = ctx.rng;
  const root = new THREE.Group();
  const F = new FillBuf(), L = new LineBuf(), GS = new FillBuf(), GM = new FillBuf(), GB = new FillBuf();
  const boxes = [], rects = [], panels = [];
  const texs = [];
  const tex = (draw, w, h, mip = true) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.generateMipmaps = mip;
    t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    texs.push(t);
    return t;
  };

  // ---- primitives ----
  function box(x0, y0, z0, x1, y1, z1, hex, o = {}) {
    const t = (nx, ny, nz) => faceTone(hex, nx, ny, nz);
    F.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], t(1, 0, 0));
    F.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], t(-1, 0, 0));
    if (!o.noTop) F.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], t(0, 1, 0));
    F.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], t(0, 0, 1));
    F.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], t(0, 0, -1));
    if (o.noEdges) return;
    const w = o.w || 1;
    const ys = o.noBottom ? [y1] : [y0, y1];
    for (const y of ys) {
      L.add(x0, y, z0, x1, y, z0, INK, w); L.add(x1, y, z0, x1, y, z1, INK, w);
      L.add(x1, y, z1, x0, y, z1, INK, w); L.add(x0, y, z1, x0, y, z0, INK, w);
    }
    L.add(x0, y0, z0, x0, y1, z0, INK, w); L.add(x1, y0, z0, x1, y1, z0, INK, w);
    L.add(x1, y0, z1, x1, y1, z1, INK, w); L.add(x0, y0, z1, x0, y1, z1, INK, w);
  }
  const solid = (x0, y0, z0, x1, y1, z1) => { boxes.push({ x0, y0, z0, x1, y1, z1 }); rects.push({ x: x0, y: z0, w: x1 - x0, h: z1 - z0 }); };

  // ---- shipping containers ----
  function container(cx, cz, along, len, levels, base) {
    const hx = along === 'x' ? len / 2 : CW / 2, hz = along === 'x' ? CW / 2 : len / 2;
    const x0 = cx - hx, x1 = cx + hx, z0 = cz - hz, z1 = cz + hz;
    solid(x0, 0, z0, x1, levels * CH, z1);
    for (let lv = 0; lv < levels; lv++) {
      const col = lv === 0 ? base : CONT[Math.floor(rng() * CONT.length)];
      const y0 = lv * CH, y1 = y0 + CH;
      box(x0, y0, z0, x1, y1, z1, col, { noTop: lv < levels - 1, noBottom: lv > 0 });
      // darker foot band on every face and ribs on the long sides
      const faces = along === 'x' ? [[z1, 1], [z0, -1]] : [[x1, 1], [x0, -1]];
      const nrib = Math.floor(len / 0.62);
      for (const [pos, s] of faces) {
        const tone = darker(faceTone(col, along === 'x' ? 0 : s, 0, along === 'x' ? s : 0), 0.2);
        for (let k = 1; k < nrib; k++) {
          const u = -len / 2 + (k * len) / nrib;
          if (along === 'x') L.add(cx + u, y0 + 0.14, pos, cx + u, y1 - 0.14, pos, tone, 0.4);
          else L.add(pos, y0 + 0.14, cz + u, pos, y1 - 0.14, cz + u, tone, 0.4);
        }
        // ID plate near one end
        const pu = -len / 2 + 0.9;
        const plate = lighter(col, 0.75);
        if (along === 'x') { const px = cx + pu * s; F.quad([px, y1 - 0.62, pos + 0.01 * s], [px + 1.2, y1 - 0.62, pos + 0.01 * s], [px + 1.2, y1 - 0.3, pos + 0.01 * s], [px, y1 - 0.3, pos + 0.01 * s], plate); }
        else { const pz = cz + pu * s; F.quad([pos + 0.01 * s, y1 - 0.62, pz], [pos + 0.01 * s, y1 - 0.62, pz + 1.2], [pos + 0.01 * s, y1 - 0.3, pz + 1.2], [pos + 0.01 * s, y1 - 0.3, pz], plate); }
      }
      // door end: two leaves with locking bars
      const ends = along === 'x' ? [[x1, 1], [x0, -1]] : [[z1, 1], [z0, -1]];
      for (const [pos, s] of ends) {
        const tone = darker(col, 0.34);
        for (const o of [-0.7, -0.35, 0.35, 0.7]) {
          if (along === 'x') L.add(pos, y0 + 0.12, cz + o, pos, y1 - 0.12, cz + o, tone, 0.45);
          else L.add(cx + o, y0 + 0.12, pos, cx + o, y1 - 0.12, pos, tone, 0.45);
        }
        if (along === 'x') L.add(pos, y0 + 0.12, cz, pos, y1 - 0.12, cz, INK, 0.7);
        else L.add(cx, y0 + 0.12, pos, cx, y1 - 0.12, pos, INK, 0.7);
      }
    }
    // flat cast shadow and a painted yellow bay line
    const h = levels * CH, sx = -0.62 * h, sz = 0.16 * h;
    const pts = [];
    for (const [px, pz] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) { pts.push([px, pz], [px + sx, pz + sz]); }
    GS.ground(hull(pts), 0, GROUND_SHADE);
    const m = 0.7, lw = 0.14, yl = '#f2c230';
    for (const [ax, az, bx, bz] of [[x0 - m, z0 - m, x1 + m, z0 - m + lw], [x0 - m, z1 + m - lw, x1 + m, z1 + m], [x0 - m, z0 - m, x0 - m + lw, z1 + m], [x1 + m - lw, z0 - m, x1 + m, z1 + m]]) GM.ground([[ax, az], [bx, az], [bx, bz], [ax, bz]], 0, yl);
  }
  const addHalf = (flip) => {
    for (const [cx, cz, along, len, lv] of STEEL) container(flip ? -cx : cx, flip ? -cz : cz, along, len, lv, CONT[Math.floor(rng() * CONT.length)]);
  };
  addHalf(false);
  addHalf(true);

  // ---- ground: outer tarmac, paved yard, the two concourse aprons, lane paint ----
  GB.ground([[-400, -400], [400, -400], [400, 400], [-400, 400]], 0, YARD_OUT);
  GB.ground([[-GANTRY_X - 3, -BUILD_Z - 2], [GANTRY_X + 3, -BUILD_Z - 2], [GANTRY_X + 3, BUILD_Z + 2], [-GANTRY_X - 3, BUILD_Z + 2]], 0, GROUND);
  for (const s of [1, -1]) {
    GS.ground([[-32, s * 33.5], [32, s * 33.5], [32, s * BUILD_Z], [-32, s * BUILD_Z]], 0, '#dcd8cb');
    for (let k = -5; k <= 5; k++) GM.ground([[k * 6 - 0.07, s * 33.5], [k * 6 + 0.07, s * 33.5], [k * 6 + 0.07, s * BUILD_Z], [k * 6 - 0.07, s * BUILD_Z]], 0, '#c4bfae');
  }
  for (let z = -38; z < 38; z += 6) GM.ground([[-0.09, z], [0.09, z], [0.09, z + 3], [-0.09, z + 3]], 0, PAPER);
  for (const x of [-3.7, 3.7]) for (let z = -35; z < 35; z += 2.4) GM.ground([[x - 0.06, z], [x + 0.06, z], [x + 0.06, z + 1.2], [x - 0.06, z + 1.2]], 0, '#f2c230');
  for (const s of [1, -1]) { // spawn pads: a ring and a wide stripe in the sniper's colour
    const col = ID[s > 0 ? 0 : 1];
    const ring = [];
    for (let a = 0; a < 24; a++) ring.push(a / 24 * Math.PI * 2);
    for (let a = 0; a < 24; a++) {
      const a0 = ring[a], a1 = ring[(a + 1) % 24], r0 = 1.25, r1 = 1.55;
      GM.ground([[Math.cos(a0) * r0, s * SPAWN_Z + Math.sin(a0) * r0], [Math.cos(a0) * r1, s * SPAWN_Z + Math.sin(a0) * r1], [Math.cos(a1) * r1, s * SPAWN_Z + Math.sin(a1) * r1], [Math.cos(a1) * r0, s * SPAWN_Z + Math.sin(a1) * r0]], 0, col);
    }
    GM.ground([[-5, s * 34.6], [5, s * 34.6], [5, s * 34.95], [-5, s * 34.95]], 0, col);
  }
  // seams in the paving, as thin quads (a fat line would be eaten by the grazing ground)
  for (let x = -30; x <= 30; x += 10) GM.ground([[x - 0.05, -33], [x + 0.05, -33], [x + 0.05, 33], [x - 0.05, 33]], 0, '#b4b7c0');
  for (let z = -30; z <= 30; z += 10) GM.ground([[-31, z - 0.05], [31, z - 0.05], [31, z + 0.05], [-31, z + 0.05]], 0, '#b4b7c0');

  // ---- concourse buildings (player 0 stands in front of the +z one) ----
  const sign = [
    tex((g) => drawBerthSign(g, 'BERTH 12', 'EAST YARD  >>>'), 512, 160),
    tex((g) => drawBerthSign(g, 'BERTH 40', '<<<  WEST YARD'), 512, 160),
  ];
  function concourse(s, which) {
    const z0 = s * BUILD_Z, z1 = s * (BUILD_Z + 15);
    const lo = Math.min(z0, z1), hi = Math.max(z0, z1);
    solid(-38, 0, lo, 38, 7.2, hi);
    box(-38, 0, lo, 38, 6.4, hi, WALL, { noTop: true });
    box(-38.4, 6.4, lo - (s > 0 ? 0.5 : 0), 38.4, 7.2, hi + (s < 0 ? 0.5 : 0), TRIM);
    // plinth, pilasters and windows (real depth, so nothing z-fights from across the yard)
    box(-38.2, 0, s > 0 ? z0 - 0.25 : z0 - 0.05, 38.2, 0.7, s > 0 ? z0 + 0.05 : z0 + 0.25, darker(WALL, 0.3), { w: 0.9 });
    for (let k = -6; k <= 6; k++) {
      const x = k * 6;
      if (Math.abs(k) <= 1) continue;
      const zf = s > 0 ? z0 - 0.14 : z0, zb = s > 0 ? z0 : z0 + 0.14;
      box(x - 1.55, 1.7, zf, x + 1.55, 4.9, zb, '#27324a', { w: 0.8 });
      box(x - 1.55, 4.9, zf, x + 1.55, 5.15, zb, TRIM, { w: 0.7 });
      const zg = s > 0 ? zf - 0.01 : zb + 0.01;
      for (const [ax, bx] of [[-1.2, -0.6], [-0.25, 0.35]]) { // flat glare strips, the glass's only reflection
        F.quad([x + ax, 1.9, zg], [x + ax + 0.3, 1.9, zg], [x + ax + 1.0, 4.6, zg], [x + ax + 0.7, 4.6, zg], '#3d5073');
      }
      box(x - 0.1, 0.7, zf, x + 0.1, 6.4, zb, TRIM, { noEdges: true });
    }
    // entrance: a deep canopy on two posts and a pair of glass doors
    const zc0 = s > 0 ? z0 - 3.6 : z0, zc1 = s > 0 ? z0 : z0 + 3.6;
    box(-7, 3.7, zc0, 7, 4.05, zc1, '#d9d1bb');
    box(-6.8, 4.05, zc0 + (s > 0 ? 0 : 0.1), 6.8, 4.3, zc1 - (s > 0 ? 0.1 : 0), ID[which], { noEdges: false, w: 0.9 });
    for (const px of [-6.5, 6.5]) { const pz = s > 0 ? z0 - 3.3 : z0 + 3.3; box(px - 0.15, 0, pz - 0.15, px + 0.15, 3.7, pz + 0.15, TRIM); }
    const zd = s > 0 ? z0 - 0.1 : z0;
    box(-4, 0.7, zd, 4, 3.5, zd + 0.1, '#1d2740', { w: 0.9 });
    for (const x of [-2, 0, 2]) L.add(x, 0.7, s > 0 ? zd - 0.001 : zd + 0.101, x, 3.5, s > 0 ? zd - 0.001 : zd + 0.101, '#6f87b3', 0.9);
    // the slanted sign
    const g = new THREE.Group();
    const sg = new THREE.PlaneGeometry(9.6, 3.0);
    const sm = new THREE.MeshBasicMaterial({ map: sign[which], side: THREE.DoubleSide });
    const sp = new THREE.Mesh(sg, sm);
    g.add(sp);
    const e = [[-4.8, -1.5], [4.8, -1.5], [4.8, 1.5], [-4.8, 1.5]];
    const ls = new LineSet(THREE, 4, mats.ink);
    for (let k = 0; k < 4; k++) ls.add(e[k][0], e[k][1], 0.02, e[(k + 1) % 4][0], e[(k + 1) % 4][1], 0.02, INK, 1.1);
    ls.flush();
    g.add(ls.mesh);
    g.position.set(s * -9.5, 5.2, s > 0 ? z0 - 0.4 : z0 + 0.4);
    g.rotation.set(0, s > 0 ? Math.PI : 0, -0.13);
    root.add(g);
    // roof clutter: air units and a water tank, flat and boxy
    box(-24, 7.2, hi - 9, -19, 8.7, hi - 5, '#b8c0c9'); box(-14, 7.2, hi - 9, -10, 8.4, hi - 5, '#b8c0c9');
    box(24, 7.2, hi - 8, 29, 9.2, hi - 4, '#8da0b4');
  }
  concourse(1, 0);
  concourse(-1, 1);

  // ---- gantry crane frame (legs and beam; the trolley and its box live in set.js) ----
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * GANTRY_X, z = sz * 2.1;
      box(x - 0.55, 0, z - 0.5, x + 0.55, 10.6, z + 0.5, '#e7b43c', { w: 1.1 });
      L.add(x, 0.3, z - 0.51, x, 10.3, z - 0.51, darker('#e7b43c', 0.35), 0.5);
    }
    const x = sx * GANTRY_X;
    for (let k = 0; k < 4; k++) { const y = 0.8 + k * 2.5; L.add(x, y, -1.6, x, y + 2.5, 1.6, INK, 0.7); L.add(x, y, 1.6, x, y + 2.5, -1.6, INK, 0.7); }
    solid(x - 0.55, 0, -2.6, x + 0.55, 10.6, 2.6);
  }
  box(-GANTRY_X - 1.4, 10.6, -2.7, GANTRY_X + 1.4, 12.1, 2.7, '#e7b43c', { w: 1.2 });
  for (let x = -GANTRY_X; x < GANTRY_X; x += 3) { // black chevrons along the beam's lit side
    F.quad([x, 10.7, 2.71], [x + 1.2, 10.7, 2.71], [x + 1.9, 11.5, 2.71], [x + 0.7, 11.5, 2.71], INK);
    F.quad([x, 10.7, -2.71], [x + 1.2, 10.7, -2.71], [x + 1.9, 11.5, -2.71], [x + 0.7, 11.5, -2.71], INK);
  }

  // ---- lamp posts ----
  for (const [lx, lz] of [[-8, 4], [8, -4], [-5, 36], [5, -36], [24, 28], [-24, -28]]) {
    box(lx - 0.1, 0, lz - 0.1, lx + 0.1, 7.5, lz + 0.1, '#d9d1bb', { w: 0.9 });
    box(lx - 0.1, 7.2, lz - 0.1, lx + 1.4, 7.5, lz + 0.1, '#d9d1bb', { w: 0.9 });
    box(lx + 0.9, 6.95, lz - 0.35, lx + 1.7, 7.2, lz + 0.35, '#fff1b8', { w: 0.9 });
    solid(lx - 0.15, 0, lz - 0.15, lx + 0.15, 1, lz + 0.15);
  }

  // ---- paper panels (cardboard barricades, signs on poles, mascots) ----
  const texCache = new Map();
  let pid = 0;
  const mascotTex = tex((g) => drawMascot(g), 256, 512);
  function panel(kind, cx, cz, w, h, y0, yaw, idCol) {
    const key = `${kind}|${w}|${h}|${idCol || ''}`;
    let t = texCache.get(key);
    if (!t) {
      const px = Math.min(1024, Math.round(w * 150)), py = Math.min(1024, Math.round(h * 150));
      t = kind === 'mascot' ? mascotTex : tex((g, W, H) => drawSheet(g, W, H, kind, idCol), px, py);
      texCache.set(key, t);
    }
    const uniforms = { uMap: { value: t }, uSize: { value: new THREE.Vector2(w, h) }, uHoles: { value: Array.from({ length: HOLES }, () => new THREE.Vector3(0, 0, 0)) } };
    const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: PANEL_VS, fragmentShader: PANEL_FS, side: THREE.DoubleSide, alphaToCoverage: true });
    const geo = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, y0, cz);
    mesh.rotation.y = yaw;
    root.add(mesh);
    const ux = Math.cos(yaw), uz = -Math.sin(yaw);
    if (kind !== 'mascot' || true) { // flat cast shadow: the sheet's four corners thrown along the sun
      const q = [];
      for (const u of [-w / 2, w / 2]) for (const v of [y0, y0 + h]) q.push([cx + ux * u - 0.62 * v, cz + uz * u + 0.16 * v]);
      q.push([cx + ux * (-w / 2), cz + uz * (-w / 2)], [cx + ux * (w / 2), cz + uz * (w / 2)]);
      GS.ground(hull(q), 0, GROUND_SHADE);
    }
    const p = { id: pid++, kind, x: cx, z: cz, w, h, y0, yaw, nx: Math.sin(yaw), nz: Math.cos(yaw), ux, uz, holes: [], hole0: 0, uniforms, fig: kind === 'mascot' };
    panels.push(p);
    const edge = (u, v, u2, v2) => L.add(cx + ux * u, y0 + v, cz + uz * u, cx + ux * u2, y0 + v2, cz + uz * u2, INK, 1);
    if (kind !== 'mascot') {
      edge(-w / 2, 0, w / 2, 0); edge(w / 2, 0, w / 2, h); edge(w / 2, h, -w / 2, h); edge(-w / 2, h, -w / 2, 0);
    } else {
      L.add(cx, 0, cz, cx, 0.01, cz, INK, 0.1);
    }
    // feet: cardboard stands on two little triangular braces; a sign stands on poles
    if (y0 > 0.5) {
      for (const u of [-w / 2 + 0.35, w / 2 - 0.35]) { const px = cx + ux * u, pz = cz + uz * u; box(px - 0.07, 0, pz - 0.07, px + 0.07, y0 + h * 0.15, pz + 0.07, '#d9d1bb', { w: 0.9 }); solid(px - 0.1, 0, pz - 0.1, px + 0.1, 3, pz + 0.1); }
    } else if (kind !== 'mascot') {
      for (const u of [-w / 2 + 0.25, w / 2 - 0.25]) {
        const px = cx + ux * u, pz = cz + uz * u;
        box(px - 0.3, 0, pz - 0.3, px + 0.3, 0.08, pz + 0.3, KRAFT, { w: 0.8 });
      }
    }
    // paper blocks bodies: a chain of small squares along its width keeps walkers out of it
    const n = Math.ceil(w / 0.45);
    if (y0 < 0.5) for (let k = 0; k < n; k++) { const u = -w / 2 + ((k + 0.5) * w) / n, px = cx + ux * u, pz = cz + uz * u; rects.push({ x: px - 0.22, y: pz - 0.22, w: 0.44, h: 0.44 }); }
    return p;
  }
  const paperSet = (flip) => {
    for (const [kind, cx, cz, w, h, y0, yaw] of PAPERS) panel(kind, flip ? -cx : cx, flip ? -cz : cz, w, h, y0, flip ? yaw + Math.PI : yaw, flip ? ID[1] : ID[0]);
  };
  paperSet(false);
  paperSet(true);

  // ---- props: oil drums, pallets, cones ----
  const drum = (x, z, col) => {
    const n = 10, r = 0.34, h = 0.95;
    const pts = [];
    for (let k = 0; k < n; k++) pts.push([x + Math.cos((k / n) * Math.PI * 2) * r, z + Math.sin((k / n) * Math.PI * 2) * r]);
    for (let k = 0; k < n; k++) {
      const a = pts[k], b = pts[(k + 1) % n], mx = Math.cos(((k + 0.5) / n) * Math.PI * 2);
      F.quad([a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], h, b[1]], [a[0], h, a[1]], faceTone(col, mx > 0.4 ? 1 : mx < -0.4 ? -1 : 0, 0, 0));
      L.add(a[0], h, a[1], b[0], h, b[1], INK, 0.9);
      L.add(a[0], 0, a[1], b[0], 0, b[1], INK, 0.9);
      if (k % 2 === 0) L.add(a[0], 0, a[1], a[0], h, a[1], INK, 0.9);
    }
    GS.ground(pts, 0, GROUND_SHADE);
    F.quad([pts[0][0], h, pts[0][1]], [pts[3][0], h, pts[3][1]], [pts[5][0], h, pts[5][1]], [pts[8][0], h, pts[8][1]], lighter(col, 0.2));
    solid(x - 0.3, 0, z - 0.3, x + 0.3, h, z + 0.3);
  };
  for (const [x, z, c] of [[-27, 36, '#3f78b5'], [-26, 37.4, '#e2603a'], [27, -36, '#e7b43c'], [26, -37.4, '#4e9a7e'], [4.5, 22, '#c8403f'], [-4.5, -22, '#3f78b5']]) drum(x, z, c);

  // ---- skyline: flat layers of distant blocks and dock cranes, drawn in a bluer ink ----
  const FAR_INK = '#46566f';
  for (const [R, col, hmax, n, lw] of [[330, '#bcd4e0', 40, 26, 0.5], [230, '#a3c0d1', 62, 22, 0.6], [150, '#8aabc2', 34, 18, 0.7]]) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rng() * 0.2, w = 14 + rng() * 26, h = 6 + rng() * hmax, d = 14 + rng() * 10;
      const cx = Math.sin(a) * R, cz = -Math.cos(a) * R;
      const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
      F.quad([x0, 0, z0], [x1, 0, z0], [x1, h, z0], [x0, h, z0], darker(col, 0.1)); F.quad([x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1], darker(col, 0.1));
      F.quad([x1, 0, z0], [x1, 0, z1], [x1, h, z1], [x1, h, z0], col); F.quad([x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0], darker(col, 0.25));
      F.quad([x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1], lighter(col, 0.2));
      for (const [ax, az, bx, bz] of [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]]) L.add(ax, h, az, bx, h, bz, FAR_INK, lw);
      for (const [px, pz] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) L.add(px, 0, pz, px, h, pz, FAR_INK, lw);
      if (rng() < 0.4) { const wy = h * 0.8; for (let u = 1; u < 4; u++) L.add(x0 + (u * w) / 4, 1, z1, x0 + (u * w) / 4, wy, z1, darker(col, 0.25), 0.3); }
    }
  }
  for (const [ang, R, sc] of [[0.55, 175, 1.0], [2.4, 190, 1.15], [3.7, 168, 0.9], [5.3, 200, 1.2]]) { // ship-to-shore cranes: a lattice drawn as pure line
    const cx = Math.sin(ang) * R, cz = -Math.cos(ang) * R, ca = Math.cos(ang), sa = Math.sin(ang);
    const P = (u, y) => [cx + ca * u * sc, y * sc, cz + sa * u * sc];
    const seg = (u1, y1, u2, y2, w = 0.9) => { const a = P(u1, y1), b = P(u2, y2); L.add(a[0], a[1], a[2], b[0], b[1], b[2], FAR_INK, w); };
    for (const q of [[-14, 0, -11, 44], [14, 0, 11, 44], [-11, 44, 11, 44]]) seg(q[0], q[1], q[2], q[3], 1.2);
    seg(-12.5, 0, 12.5, 0, 1.2);
    for (let y = 6; y < 44; y += 8) { seg(-14 + (y * 3) / 44, y, 14 - (y * 3) / 44, y + 8); seg(14 - (y * 3) / 44, y, -14 + (y * 3) / 44, y + 8); }
    seg(-11, 44, -60, 46, 1.2); seg(11, 44, 24, 46, 1.2); seg(-60, 46, 24, 46, 1.2); seg(-11, 44, -60, 54, 0.8); seg(-60, 54, 24, 54, 0.9); seg(-60, 46, -60, 54); seg(24, 46, 24, 54);
    for (let u = -52; u < 22; u += 6) { seg(u, 46, u + 3, 54, 0.6); seg(u + 3, 54, u + 6, 46, 0.6); }
    seg(-30, 46, -30, 38, 0.7); seg(-30, 38, -26, 36, 0.7);
    const a = P(-14, 0);
    F.quad(a, P(14, 0), P(14, 3), P(-14, 3), darker('#8aabc2', 0.2));
  }

  // ---- freeze the static pieces into meshes ----
  const fillMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const layer = (buf, f, u, order) => {
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: f, polygonOffsetUnits: u });
    const mesh = buf.mesh(THREE, m);
    mesh.renderOrder = order;
    return mesh;
  };
  root.add(layer(GB, 6, 6, -3), layer(GS, 4, 4, -2), layer(GM, 2, 2, -1), F.mesh(THREE, fillMat));
  const lines = L.set(THREE, mats.ink);
  root.add(lines.mesh);

  // ---- sky: three flat bands, a hard-edged sun and nothing else ----
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { a: { value: new THREE.Color(SKY[0]) }, b: { value: new THREE.Color(SKY[1]) }, c: { value: new THREE.Color(SKY[2]) }, sun: { value: new THREE.Vector3(0.45, 0.58, -0.2).normalize() } },
    vertexShader: 'varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: `precision highp float; uniform vec3 a, b, c, sun; varying vec3 vD;
      void main() {
        float y = vD.y;
        vec3 col = y < 0.07 ? c : y < 0.24 ? b : a;
        float d = dot(normalize(vD), sun);
        col = d > 0.99645 ? vec3(1.0, 0.95, 0.72) : (d > 0.9958 ? vec3(0.09, 0.08, 0.11) : col);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(600, 24, 12), skyMat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  root.add(dome);
  // clouds: flat cut-outs on a slow carousel
  const cloudTex = tex((g, W, H) => drawCloud(g, W, H), 512, 256, true);
  const clouds = new THREE.Group();
  const cm = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: false, alphaTest: 0.5, side: THREE.DoubleSide, alphaToCoverage: true });
  const cg = new THREE.PlaneGeometry(1, 0.5);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + rng() * 0.5, R = 380 + rng() * 60, s = 70 + rng() * 70;
    const m = new THREE.Mesh(cg, cm);
    m.position.set(Math.sin(a) * R, 70 + rng() * 80, -Math.cos(a) * R);
    m.scale.set(s, s, 1);
    m.lookAt(0, m.position.y, 0);
    clouds.add(m);
  }
  root.add(clouds);

  const nav = makeNav(rects);
  return {
    root, boxes, rects, panels, nav, clouds, windSeed: rng() * 6, tex, texs,
    dispose() { for (const t of texs) t.dispose(); skyMat.dispose(); cg.dispose(); cm.dispose(); fillMat.dispose(); },
  };
}
