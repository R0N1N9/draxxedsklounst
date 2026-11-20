// The paper people: a sniper is a printed card on a thin core — a full target face-on, a ruled line edge-on.
// Standees are the same card in cardboard. The mascots dotted round the yard are plain scenery cut-outs.
import { drawSniper, drawMascot, drawGlint, dieCut } from './art.js';
import { ID, ID_DARK, INK, PAPER, GROUND_SHADE, lighter } from './style.js';
import { LineSet } from './lines.js';

const TAU = Math.PI * 2;
export const FIG_H = 1.96;
export const HOLD = 0.06; // card offset from the core, so the face never fights the edge for depth

/** Is the point (lx, ly) — metres across the card from its centre, up from its feet — inside the cut-out? */
export function sheetHit(lx, ly) {
  if (ly < 0 || ly > FIG_H) return false;
  const hx = lx, hy = ly - 1.516;
  if (hx * hx + hy * hy < 0.215 * 0.215) return true; // head
  if (ly > 1.56) return Math.abs(lx) < 0.25 - (ly - 1.56) * 0.28; // hat
  if (ly > 0.64) return Math.abs(lx) < 0.33; // torso and arms
  return Math.abs(lx) < 0.28; // legs
}

export function makeFigureKit(THREE, mats) {
  const texs = [], geos = [], matl = [];
  const canvasTex = (draw, w, h) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    texs.push(t);
    return t;
  };
  const quad = new THREE.PlaneGeometry(1, FIG_H).translate(0, FIG_H / 2, 0);
  const slabGeo = new THREE.BoxGeometry(0.34, 1.94, 0.05).translate(0, 0.97, 0);
  const shadowGeo = new THREE.CircleGeometry(0.6, 20).rotateX(-Math.PI / 2);
  geos.push(quad, slabGeo, shadowGeo);
  const cardMat = (tex) => {
    const m = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide }); // double-sided so every card, sign and cloud shares one shader program
    matl.push(m);
    return m;
  };
  const tex = {
    live: [0, 1].map((i) => canvasTex((g) => { drawSniper(g, ID[i], ID_DARK[i], 'live'); dieCut(g, 256, 512, 7, '#fffdf5'); }, 256, 512)),
    standee: [0, 1].map((i) => canvasTex((g) => { drawSniper(g, ID[i], ID_DARK[i], 'standee'); dieCut(g, 256, 512, 7, '#e8c48e'); }, 256, 512)),
    mascot: canvasTex((g) => { drawMascot(g); dieCut(g, 256, 512, 7, '#fffdf5'); }, 256, 512),
  };
  const mLive = tex.live.map(cardMat), mStand = tex.standee.map(cardMat), mMascot = cardMat(tex.mascot);
  const coreMats = ID.map((c) => { const m = new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }); matl.push(m); return m; });
  const standCore = new THREE.MeshBasicMaterial({ color: '#b98a55', side: THREE.DoubleSide });
  const shadowMat = new THREE.MeshBasicMaterial({ color: GROUND_SHADE, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  matl.push(standCore, shadowMat);

  // crumpled paper ball, shared by every figure that dies (one geometry, one set of edge lines per ball)
  const ballGeo = new THREE.IcosahedronGeometry(0.4, 1); // already non-indexed: one flat face colour per triangle
  geos.push(ballGeo);
  {
    const p = ballGeo.attributes.position, jit = new Map();
    for (let i = 0; i < p.count; i++) {
      const key = `${p.getX(i).toFixed(3)}${p.getY(i).toFixed(3)}${p.getZ(i).toFixed(3)}`;
      let k = jit.get(key);
      if (!k) { k = 0.86 + ((Math.sin(i * 12.9898 + key.length * 4.1) * 43758.5453) % 1 + 1) % 1 * 0.3; jit.set(key, k); }
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
    }
    ballGeo.computeVertexNormals();
  }

  function build(kind, i) {
    const root = new THREE.Group();
    const pivot = new THREE.Group(), tilt = new THREE.Group();
    root.add(pivot);
    pivot.add(tilt);
    const front = new THREE.Mesh(quad, kind === 'standee' ? mStand[i] : kind === 'mascot' ? mMascot : mLive[i]);
    front.position.z = HOLD;
    const back = new THREE.Mesh(quad, front.material);
    back.rotation.y = Math.PI;
    back.position.z = -HOLD;
    const core = new THREE.Mesh(slabGeo, kind === 'standee' || kind === 'mascot' ? standCore : coreMats[i]);
    tilt.add(core, front, back);
    // ruled edge of the core: visible as a thin black line from the side, hidden behind the card from the front
    const ls = new LineSet(THREE, 12, mats.fig);
    const hw = 0.17, h = 1.94, d = 0.025;
    for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0]]) {
      const xs = [-hw, hw, hw, -hw], zs = [-d, -d, d, d];
      ls.add(xs[a], 0, zs[a], xs[b], 0, zs[b], INK, 0.8);
      ls.add(xs[a], h, zs[a], xs[b], h, zs[b], INK, 0.8);
      ls.add(xs[a], 0, zs[a], xs[a], h, zs[a], INK, 0.8);
    }
    ls.flush();
    tilt.add(ls.mesh);
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.position.y = 0.012;
    shadow.scale.set(1, 1, 0.55);
    root.add(shadow);
    const ball = new THREE.Group();
    ball.visible = false;
    const bp = ballGeo.attributes.position;
    const col = new Float32Array(bp.count * 3);
    const palette = [PAPER, '#ebe3cf', lighter(ID[i], 0.1), '#ddd3bb', PAPER];
    const tmp = new THREE.Color();
    for (let f = 0; f < bp.count / 3; f++) {
      tmp.set(palette[(f * 7 + (f >> 2)) % palette.length]);
      for (let k = 0; k < 3; k++) { col[(f * 3 + k) * 3] = tmp.r; col[(f * 3 + k) * 3 + 1] = tmp.g; col[(f * 3 + k) * 3 + 2] = tmp.b; }
    }
    const bg = ballGeo.clone();
    bg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const bm = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const bmesh = new THREE.Mesh(bg, bm);
    const bl = new LineSet(THREE, bp.count, mats.ink);
    for (let f = 0; f < bp.count / 3; f++) {
      for (let k = 0; k < 3; k++) {
        const a = f * 3 + k, b = f * 3 + ((k + 1) % 3);
        bl.add(bp.getX(a), bp.getY(a), bp.getZ(a), bp.getX(b), bp.getY(b), bp.getZ(b), INK, 0.7);
      }
    }
    bl.flush();
    ball.add(bmesh, bl.mesh);
    root.add(ball);
    // creases that show once the sheet has been unfolded again
    const cr = new LineSet(THREE, 7, mats.ink);
    const cz = [[-0.36, 1.42, 0.3, 1.4], [-0.3, 0.95, 0.36, 1.0], [-0.2, 0.5, 0.25, 0.46], [0.0, 0.1, 0.02, 1.9], [-0.33, 1.7, 0.2, 1.16], [0.3, 1.8, -0.1, 0.9], [-0.1, 1.3, 0.35, 0.3]];
    cz.forEach((c, k) => cr.add(c[0], c[1], HOLD + 0.004, c[2], c[3], HOLD + 0.004, INK, k < 4 ? 0.45 : 0.3, 0.55));
    cr.flush();
    cr.mesh.visible = false;
    tilt.add(cr.mesh);
    const flash = new THREE.Sprite(flashMat);
    flash.visible = false;
    const glint = new THREE.Sprite(glintMat);
    glint.visible = false;
    root.add(flash, glint);
    const f = {
      root, pivot, tilt, ball, flash, glint, shadow, kind, creases: cr.mesh,
      dispose() { ls.dispose(); bl.dispose(); cr.dispose(); bg.dispose(); bm.dispose(); },
    };
    return f;
  }
  const flashMat = new THREE.SpriteMaterial({ map: null, depthWrite: false, transparent: true, alphaTest: 0.01 });
  const glintMat = new THREE.SpriteMaterial({ map: canvasTex((g) => drawGlint(g, 128), 128, 128), depthWrite: false, transparent: true, alphaTest: 0.01 });
  matl.push(flashMat, glintMat);
  return {
    sniper: (i) => build('live', i),
    standee: (i) => build('standee', i),
    mascot: () => build('mascot', 0),
    setFlash(canvas) {
      const t = new THREE.CanvasTexture(canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      texs.push(t);
      flashMat.map = t;
      flashMat.needsUpdate = true;
    },
    dispose() { for (const t of texs) t.dispose(); for (const g of geos) g.dispose(); for (const m of matl) m.dispose(); },
  };
}

/** Pose a figure: world position, facing yaw, how edge-on it is (0..1), walking speed and a clock for the idle sway. */
export function poseFigure(f, x, z, yaw, edge, speed, clock, side) {
  f.root.position.set(x, 0, z);
  f.pivot.rotation.y = yaw + edge * (Math.PI / 2) * side;
  const k = Math.min(1, speed / 5);
  const step = clock * 9;
  const idle = Math.sin(clock * 1.7) * 0.012;
  f.tilt.rotation.z = Math.sin(step) * 0.06 * k + Math.sin(clock * 0.9) * 0.01;
  f.tilt.scale.y = 1 + idle + Math.abs(Math.sin(step)) * 0.025 * k;
  f.tilt.position.y = Math.abs(Math.sin(step)) * 0.05 * k;
  f.shadow.scale.x = 1 - edge * 0.78;
  f.shadow.rotation.y = f.pivot.rotation.y;
}

/** The kill: the card crumples into a ball, bounces once and unfolds flat on the ground. t is seconds since the hit. */
export function crumpleFigure(f, t, bounceSeed) {
  const c1 = 0.34, b1 = 0.95, u1 = 1.7;
  f.flash.visible = false; f.glint.visible = false;
  if (t < c1) {
    const k = t / c1, e = k * k * (3 - 2 * k);
    f.tilt.scale.set(1 - e * 0.85, 1 - e * 0.88, 1 - e * 0.85);
    f.tilt.rotation.z = e * 1.2;
    f.tilt.position.y = e * 0.35;
    f.ball.visible = k > 0.5;
    f.ball.scale.setScalar(Math.max(0.01, (k - 0.5) * 1.5));
    f.ball.position.y = 0.4 + e * 0.1;
    return;
  }
  f.tilt.visible = t > b1 + 0.3;
  f.ball.visible = t < b1 + 0.55;
  if (t < b1) {
    const k = (t - c1) / (b1 - c1);
    f.ball.scale.setScalar(1);
    f.ball.position.y = 0.4 + Math.abs(Math.sin(k * Math.PI)) * 0.85 * (1 - k * 0.2);
    f.ball.position.x = k * 0.5 * Math.cos(bounceSeed);
    f.ball.position.z = k * 0.5 * Math.sin(bounceSeed);
    f.ball.rotation.set(k * 5, k * 3, k * 2);
  } else {
    const k = Math.min(1, (t - b1) / (u1 - b1)), e = k * k * (3 - 2 * k);
    f.ball.position.y = 0.4 - 0.2 * e;
    f.ball.scale.setScalar(Math.max(0.01, 1 - e * 1.5));
    f.tilt.rotation.set(-Math.PI / 2 * e, 0, 0);
    f.tilt.scale.set(e, Math.max(0.05, e), 1);
    f.tilt.position.set(0.0, 0.03 + (1 - e) * 0.35, 0);
    f.creases.visible = k > 0.7;
  }
}
