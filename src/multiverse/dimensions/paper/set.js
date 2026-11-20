// Everything in the yard that moves: the gantry crane and its box, the forklifts, gulls, windsocks, a drifting paper
// plane and — in sudden death — the paper curtains closing in. Anything that touches the fight is a pure function of
// ctx.time (craneAt, forkAt, windAt in layout.js); the rest is dressing on a private clock.
import { INK, PAPER, ID, CONT, faceTone, darker, lighter } from './style.js';
import { FillBuf, LineBuf, LineSet } from './lines.js';
import { craneAt, forkAt, windAt, CH, CW, FORK_X, yardLimit, YARD_Z } from './layout.js';
import { HOLES, RING, HOLE_R } from './world.js';

const TAU = Math.PI * 2;

function boxInto(F, L, x0, y0, z0, x1, y1, z1, hex, w = 1) {
  const t = (nx, ny, nz) => faceTone(hex, nx, ny, nz);
  F.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], t(1, 0, 0));
  F.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], t(-1, 0, 0));
  F.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], t(0, 1, 0));
  F.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], t(0, 0, 1));
  F.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], t(0, 0, -1));
  for (const y of [y0, y1]) { L.add(x0, y, z0, x1, y, z0, INK, w); L.add(x1, y, z0, x1, y, z1, INK, w); L.add(x1, y, z1, x0, y, z1, INK, w); L.add(x0, y, z1, x0, y, z0, INK, w); }
  L.add(x0, y0, z0, x0, y1, z0, INK, w); L.add(x1, y0, z0, x1, y1, z0, INK, w); L.add(x1, y0, z1, x1, y1, z1, INK, w); L.add(x0, y0, z1, x0, y1, z1, INK, w);
}

export function makeSet(ctx, THREE, mats, W) {
  const root = new THREE.Group();
  W.root.add(root);
  const geos = [], mls = [], texs = [];
  const fillMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mls.push(fillMat);
  const freeze = (F, L, parent) => {
    const m = F.mesh(THREE, fillMat);
    const ls = L.set(THREE, mats.ink);
    parent.add(m, ls.mesh);
    geos.push(m.geometry, ls.geo);
    return { m, ls };
  };

  // ---- the gantry's box ----
  const crane = new THREE.Group();
  {
    const F = new FillBuf(), L = new LineBuf();
    const hx = 3, hz = CW / 2, col = '#c8403f';
    boxInto(F, L, -hx, 0, -hz, hx, CH, hz, col);
    for (let k = 1; k < 10; k++) for (const z of [-hz - 0.001, hz + 0.001]) L.add(-hx + (k * 2 * hx) / 10, 0.14, z, -hx + (k * 2 * hx) / 10, CH - 0.14, z, darker(col, 0.28), 0.4);
    for (const x of [-hx - 0.001, hx + 0.001]) for (const o of [-0.7, -0.35, 0.35, 0.7]) L.add(x, 0.12, o, x, CH - 0.12, o, darker(col, 0.34), 0.45);
    for (let k = 0; k < 5; k++) F.quad([-hx + k * 1.2, 0.05, hz + 0.005], [-hx + k * 1.2 + 0.5, 0.05, hz + 0.005], [-hx + k * 1.2 + 0.8, 0.3, hz + 0.005], [-hx + k * 1.2 + 0.3, 0.3, hz + 0.005], '#f2c230');
    freeze(F, L, crane);
  }
  const trolley = new THREE.Group();
  const lamps = [];
  {
    const F = new FillBuf(), L = new LineBuf();
    boxInto(F, L, -2.6, 8.6, -2.1, 2.6, 10.6, 2.1, '#d9d1bb', 1.1);
    freeze(F, L, trolley);
    for (const sx of [-1, 1]) {
      const m = new THREE.MeshBasicMaterial({ color: '#4a1410' });
      mls.push(m);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), m);
      geos.push(lamp.geometry);
      lamp.position.set(sx * 2.1, 9.0, 2.3);
      const lamp2 = lamp.clone();
      lamp2.position.z = -2.3;
      trolley.add(lamp, lamp2);
      lamps.push(m);
    }
  }
  const cables = new LineSet(THREE, 8, mats.ink, true);
  root.add(crane, trolley, cables.mesh);
  const cs = { x: 0, y: 0, warn: 0, moving: 0 };

  // ---- forklifts (one per lane, point-mirrored) ----
  function forklift(col) {
    const g = new THREE.Group();
    const F = new FillBuf(), L = new LineBuf();
    boxInto(F, L, -0.65, 0.35, -1.0, 0.65, 1.1, 1.1, col);
    boxInto(F, L, -0.65, 0.35, -1.5, 0.65, 1.0, -1.0, '#3a3a48'); // counterweight
    boxInto(F, L, -0.1, 0.2, 1.1, 0.1, 2.0, 1.25, '#3a3a48'); // mast
    boxInto(F, L, -0.55, 0.12, 1.2, -0.35, 0.22, 2.4, '#3a3a48'); boxInto(F, L, 0.35, 0.12, 1.2, 0.55, 0.22, 2.4, '#3a3a48'); // forks
    boxInto(F, L, -0.6, 0.22, 1.35, 0.6, 0.38, 2.35, '#d9a766'); // pallet
    boxInto(F, L, -0.5, 0.38, 1.45, 0.5, 1.2, 2.25, '#cf9b62'); // load: a carton
    L.add(-0.5, 0.8, 2.251, 0.5, 0.8, 2.251, '#a7743c', 0.5);
    for (const [x, z] of [[-0.45, 0.1], [0.45, 0.1], [-0.45, -0.95], [0.45, -0.95]]) boxInto(F, L, x - 0.12 * Math.sign(x), 0, z - 0.3, x + 0.12 * Math.sign(x), 0.5, z + 0.3, INK, 0.8);
    for (const x of [-0.6, 0.6]) for (const z of [-0.7, 0.5]) L.add(x, 1.1, z, x, 2.15, z, INK, 1);
    boxInto(F, L, -0.7, 2.1, -0.85, 0.7, 2.2, 0.65, col);
    freeze(F, L, g);
    root.add(g);
    return g;
  }
  const forks = [forklift('#4e9a7e'), forklift('#4e9a7e')];
  const fk = { z: 0, dz: 1 };

  // ---- windsocks ----
  const flags = [];
  const flagGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 2.0, 0.1, 0, 0, -0.9, 0]), 3));
  geos.push(flagGeo);
  for (const [x, z, k] of [[6.5, -8, 0], [-6.5, 8, 1], [23, 3, 0], [-23, -3, 1]]) {
    const F = new FillBuf(), L = new LineBuf();
    boxInto(F, L, x - 0.07, 0, z - 0.07, x + 0.07, 5.2, z + 0.07, '#d9d1bb', 0.9);
    freeze(F, L, root);
    const m = new THREE.MeshBasicMaterial({ color: ID[k], side: THREE.DoubleSide });
    mls.push(m);
    const piv = new THREE.Group();
    piv.position.set(x, 5.0, z);
    const mesh = new THREE.Mesh(flagGeo, m);
    const ls = new LineSet(THREE, 3, mats.ink);
    ls.add(0, 0, 0, 2.0, 0.1, 0, INK, 0.9); ls.add(2.0, 0.1, 0, 0, -0.9, 0, INK, 0.9); ls.add(0, -0.9, 0, 0, 0, 0, INK, 0.9);
    ls.flush();
    geos.push(ls.geo);
    const arm = new THREE.Group();
    arm.add(mesh, ls.mesh);
    piv.add(arm);
    root.add(piv);
    flags.push({ piv, arm });
  }

  // ---- gulls: flat cut-outs on a carousel, three wing poses ----
  const gullMats = [];
  for (let f = 0; f < 3; f++) {
    const c = document.createElement('canvas');
    c.width = 192; c.height = 96;
    const g = c.getContext('2d');
    const lift = [-34, 0, 30][f];
    g.lineJoin = 'round'; g.lineCap = 'round';
    const wing = (s) => { g.beginPath(); g.moveTo(96, 52); g.quadraticCurveTo(96 + s * 40, 52 + lift * 0.4 - 22, 96 + s * 84, 52 + lift); g.quadraticCurveTo(96 + s * 50, 52 + lift * 0.3 + 4, 96 + s * 12, 62); g.closePath(); g.fillStyle = PAPER; g.fill(); g.lineWidth = 6; g.strokeStyle = INK; g.stroke(); };
    wing(-1); wing(1);
    g.beginPath(); g.ellipse(96, 56, 22, 10, 0, 0, TAU); g.fillStyle = PAPER; g.fill(); g.stroke();
    g.beginPath(); g.moveTo(116, 52); g.lineTo(134, 54); g.lineTo(116, 58); g.closePath(); g.fillStyle = '#f2c230'; g.fill(); g.lineWidth = 4; g.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    texs.push(t);
    const m = new THREE.SpriteMaterial({ map: t, alphaTest: 0.5 });
    mls.push(m);
    gullMats.push(m);
  }
  const gulls = [];
  for (let k = 0; k < 8; k++) {
    const s = new THREE.Sprite(gullMats[0]);
    s.scale.set(3.2, 1.6, 1);
    root.add(s);
    gulls.push({ s, a: Math.random() * TAU, r: 14 + Math.random() * 42, h: 13 + Math.random() * 14, v: (0.07 + Math.random() * 0.06) * (k % 2 ? 1 : -1), ph: Math.random() * 9 });
  }

  // ---- a paper plane that crosses now and then ----
  const plane = new THREE.Group();
  {
    const F = new FillBuf(), L = new LineBuf();
    F.tri(0, 0, 3, -2.2, 0.5, -1.5, 0, -0.5, -1.5, '#f7f1e3'); F.tri(0, 0, 3, 2.2, 0.5, -1.5, 0, -0.5, -1.5, '#e5dcc6'); F.tri(0, 0, 3, 0, -0.5, -1.5, 0, 0.15, -1.5, '#c9bfa6');
    for (const q of [[0, 0, 3, -2.2, 0.5, -1.5], [-2.2, 0.5, -1.5, 0, -0.5, -1.5], [0, -0.5, -1.5, 2.2, 0.5, -1.5], [2.2, 0.5, -1.5, 0, 0, 3], [0, 0, 3, 0, -0.5, -1.5]]) L.add(q[0], q[1], q[2], q[3], q[4], q[5], INK, 1);
    freeze(F, L, plane);
    plane.visible = false;
    root.add(plane);
  }

  // ---- sudden death: the page closes in from both ends ----
  const curtains = [1, -1].map((s) => {
    const g = new THREE.Group();
    const F = new FillBuf(), L = new LineBuf();
    boxInto(F, L, -37, 0, 0, 37, 9, 0.5 * s, '#efe7d2', 1.2);
    for (let x = -36; x < 36; x += 3) F.quad([x, 0.0, -0.01 * s], [x + 1.4, 0.0, -0.01 * s], [x + 2.2, 1.6, -0.01 * s], [x + 0.8, 1.6, -0.01 * s], INK);
    for (let x = -36; x < 36; x += 3) F.quad([x + 1.4, 0.0, -0.01 * s], [x + 3.0, 0.0, -0.01 * s], [x + 3.8, 1.6, -0.01 * s], [x + 2.2, 1.6, -0.01 * s], '#f2c230');
    for (let x = -36; x < 36; x += 4) L.add(x, 2.4, -0.02 * s, x + 2, 2.4, -0.02 * s, '#9d927a', 0.6);
    L.add(-37, 1.6, -0.02 * s, 37, 1.6, -0.02 * s, INK, 1);
    freeze(F, L, g);
    g.visible = false;
    root.add(g);
    return g;
  });

  // ---- bullet holes: ring outlines on a shared dynamic line set, the cut itself is in the panel shader ----
  const holeLines = new LineSet(THREE, Math.max(1, W.panels.length * HOLES * RING), mats.ink, true);
  for (let i = 0; i < holeLines.cap; i++) holeLines.hide(i);
  holeLines.flush(holeLines.cap);
  root.add(holeLines.mesh);
  geos.push(holeLines.geo);

  function addHole(p, u, v) {
    const k = p.hole0 % HOLES;
    p.hole0++;
    const slot = (p.hole0 - 1) % HOLES;
    p.holes[slot] = { u, v };
    p.uniforms.uHoles.value[slot].set(u, v, HOLE_R);
    const base = (p.id * HOLES + slot) * RING;
    for (let i = 0; i < RING; i++) {
      const a0 = (i / RING) * TAU, a1 = ((i + 1) / RING) * TAU;
      const uu0 = u + Math.cos(a0) * HOLE_R, vv0 = v + Math.sin(a0) * HOLE_R, uu1 = u + Math.cos(a1) * HOLE_R, vv1 = v + Math.sin(a1) * HOLE_R;
      holeLines.set(base + i, p.x + p.ux * uu0, p.y0 + vv0, p.z + p.uz * uu0, p.x + p.ux * uu1, p.y0 + vv1, p.z + p.uz * uu1, INK, 0.8, 1);
    }
    holeLines.flush(holeLines.cap);
    return k;
  }
  /** Is (u, v) on this panel already inside a hole? */
  const inHole = (p, u, v) => {
    for (let i = 0; i < p.holes.length; i++) { const h = p.holes[i]; if (h && (h.u - u) ** 2 + (h.v - v) ** 2 < HOLE_R * HOLE_R) return true; }
    return false;
  };

  // ---- the dynamic solids, for bullets and bodies ----
  const dyn = [{ x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0 }, { x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0 }, { x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0 }];
  const fkA = { z: 0, dz: 1 };
  /** Fill `out` (3 boxes) with the moving steel at time t. */
  function boxesAt(t, out = dyn) {
    craneAt(t, cs);
    let b = out[0];
    b.x0 = cs.x - 3; b.x1 = cs.x + 3; b.z0 = -CW / 2; b.z1 = CW / 2; b.y0 = cs.y; b.y1 = cs.y + CH;
    for (let k = 0; k < 2; k++) {
      forkAt(t, 0, fkA);
      const s = k ? -1 : 1;
      b = out[1 + k];
      b.x0 = s * -FORK_X - 0.75; b.x1 = s * -FORK_X + 0.75; b.y0 = 0; b.y1 = 2.2;
      b.z0 = s * fkA.z - 1.5; b.z1 = s * fkA.z + 1.5;
    }
    return out;
  }
  const rectOf = [{ x: 0, y: 0, w: 6, h: CW }, { x: 0, y: 0, w: 1.5, h: 3 }, { x: 0, y: 0, w: 1.5, h: 3 }];
  /** The moving steel as movement rects (for walking into the crane's box or a forklift). */
  function rectsAt(t) {
    const d = boxesAt(t);
    for (let i = 0; i < 3; i++) { const r = rectOf[i], b = d[i]; r.x = b.x0; r.y = b.z0; r.w = b.x1 - b.x0; r.h = b.z1 - b.z0; }
    return rectOf;
  }

  function update(t, anim, wind, sudT, camera) {
    craneAt(t, cs);
    crane.position.set(cs.x, cs.y, 0);
    crane.rotation.z = cs.moving ? Math.sin(anim * 1.3) * 0.018 : 0;
    trolley.position.set(cs.x, 0, 0);
    const blink = cs.warn && Math.floor(anim * 4) % 2 === 0;
    for (const m of lamps) m.color.set(blink ? '#ff3b30' : '#4a1410');
    const top = cs.y + CH;
    let n = 0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cables.set(n++, cs.x + sx * 2.3, 8.6, sz * 1.0, cs.x + sx * 2.5 + (cs.moving ? Math.sin(anim * 1.3) * 0.1 : 0), top, sz * 1.0, INK, 0.45);
    cables.flush(n);
    for (let k = 0; k < 2; k++) {
      forkAt(t, 0, fk);
      const s = k ? -1 : 1, g = forks[k];
      g.position.set(s * -FORK_X, 0, s * fk.z);
      g.rotation.y = fk.dz * s > 0 ? 0 : Math.PI;
    }
    for (let i = 0; i < flags.length; i++) {
      const f = flags[i];
      const w = wind * (i % 2 ? -1 : 1) * 0.8 + wind * 0.2;
      f.arm.scale.x = w >= 0 ? 1 : -1;
      f.arm.rotation.z = -Math.PI * 0.42 + Math.min(1, Math.abs(w)) * Math.PI * 0.42 + Math.sin(anim * 5 + i) * 0.05 * Math.abs(w);
      f.arm.rotation.y = Math.sin(anim * 0.6 + i) * 0.1;
    }
    for (const g of gulls) {
      g.a += g.v * 0.016;
      const cx = Math.sin(g.a) * g.r, cz = Math.cos(g.a * 0.8) * g.r * 0.6;
      g.s.position.set(cx, g.h + Math.sin(anim * 0.5 + g.ph) * 1.1, cz);
      g.s.material = gullMats[Math.floor(anim * 4.2 + g.ph) % 3 === 0 ? 0 : (Math.floor(anim * 4.2 + g.ph) % 3 === 1 ? 1 : 2)];
      g.s.scale.x = (g.v > 0 ? 1 : -1) * 3.2;
    }
    const cyc = anim % 38;
    plane.visible = cyc < 7;
    if (plane.visible) {
      const u = cyc / 7;
      plane.position.set(-60 + u * 120, 11 + Math.sin(u * 5) * 1.2, -18 + u * 34);
      plane.rotation.set(Math.sin(u * 6) * 0.15, -Math.PI / 2 + 0.25, Math.sin(u * 4) * 0.3);
      plane.scale.setScalar(1.3);
    }
    for (let i = 0; i < 2; i++) {
      const c = curtains[i], on = sudT > 0, s = i ? -1 : 1;
      c.visible = on;
      if (on) { c.position.z = s * (yardLimit(sudT) + 0.0); c.scale.y = Math.min(1, sudT * 1.2); }
    }
    W.clouds.rotation.y = anim * 0.004;
  }

  return {
    update, boxesAt, rectsAt, addHole, inHole, dyn,
    dispose() { for (const g of geos) g.dispose(); for (const m of mls) m.dispose(); for (const t of texs) t.dispose(); },
  };
}
