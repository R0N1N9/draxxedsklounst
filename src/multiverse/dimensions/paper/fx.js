// Juice, all of it paper and ink: scraps and confetti, dashed trajectory lines that hang in the air, bullets as
// drawn streaks, ink splats on steel and the sudden-death beacons. Pools are fixed-size: nothing allocates per frame.
import { INK, ID } from './style.js';
import { LineSet } from './lines.js';
import { drawMark } from './art.js';

const TAU = Math.PI * 2;
export const G = 11; // bullet drop, m/s^2 (the rifle is zeroed at ZERO metres)
export const V0 = 175;
export const ZERO = 55;
export const MAXT = 2.4;

/** Position of a shot at time tau after it left the barrel. */
export function shotAt(s, tau, out) {
  out.x = s.ox + s.vx * tau + 0.5 * s.aw * tau * tau;
  out.y = s.oy + s.vy * tau - 0.5 * G * tau * tau;
  out.z = s.oz + s.vz * tau;
  return out;
}

export function makeFx(THREE, mats) {
  const root = new THREE.Group();
  const geos = [], mls = [], texs = [];
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

  // ---- scraps / confetti ----
  const NP = 240;
  const quad = new THREE.PlaneGeometry(1, 1);
  geos.push(quad);
  const fillMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const inkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.DoubleSide });
  mls.push(fillMat, inkMat);
  const fillIM = new THREE.InstancedMesh(quad, fillMat, NP);
  const inkIM = new THREE.InstancedMesh(quad, inkMat, NP);
  fillIM.count = inkIM.count = 0;
  for (const im of [fillIM, inkIM]) { im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(im); }
  const P = [];
  for (let i = 0; i < NP; i++) P.push({ live: false, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, sx: 0, sy: 0, sz: 0, size: 0.1, age: 0, life: 1, g: 6, flut: 0 });
  let pn = 0;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < NP; i++) { fillIM.setMatrixAt(i, zero); inkIM.setMatrixAt(i, zero); fillIM.setColorAt(i, col.set('#ffffff')); } // colour attribute exists up front: no shader recompile on the first burst
  function scrap(x, y, z, vx, vy, vz, size, hex, life, grav = 6, flut = 1) {
    const idx = pn, p = P[idx];
    pn = (pn + 1) % NP;
    p.live = true; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.size = size; p.age = 0; p.life = life; p.g = grav; p.flut = flut;
    p.rx = Math.random() * TAU; p.ry = Math.random() * TAU; p.rz = Math.random() * TAU;
    p.sx = (Math.random() - 0.5) * 12; p.sy = (Math.random() - 0.5) * 12; p.sz = (Math.random() - 0.5) * 12;
    col.set(hex);
    fillIM.setColorAt(idx, col);
  }
  /** A burst of paper bits: kind 'scraps' (the cream card bits of a hit), 'dust' (grey puff) or 'spark' (a flash of yellow). */
  function burst(x, y, z, n, hexes, speed, size, life, up = 2) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, e = Math.random() * 1.4 - 0.3, s = speed * (0.4 + Math.random() * 0.8);
      scrap(x, y, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + up, Math.sin(a) * Math.cos(e) * s, size * (0.6 + Math.random() * 0.8), hexes[i % hexes.length], life * (0.7 + Math.random() * 0.5));
    }
  }

  // ---- ink splats where a round meets steel ----
  const markTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    drawMark(c.getContext('2d'), 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    texs.push(t);
    return t;
  })();
  const NM = 36;
  const markMat = new THREE.MeshBasicMaterial({ map: markTex, alphaTest: 0.5, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  mls.push(markMat);
  const marks = new THREE.InstancedMesh(quad, markMat, NM);
  marks.frustumCulled = false;
  for (let i = 0; i < NM; i++) marks.setMatrixAt(i, zero);
  root.add(marks);
  let mn = 0, markHigh = 0;
  marks.count = 0;
  const qz = new THREE.Vector3(0, 0, 1), nn = new THREE.Vector3();
  function mark(x, y, z, nx, ny, nz, size) {
    nn.set(nx, ny, nz);
    dummy.position.set(x + nx * 0.03, y + ny * 0.03, z + nz * 0.03);
    dummy.quaternion.setFromUnitVectors(qz, nn);
    dummy.rotateZ(Math.random() * TAU);
    dummy.scale.set(size, size, 1);
    dummy.updateMatrix();
    marks.setMatrixAt(mn, dummy.matrix);
    markHigh = Math.max(markHigh, mn + 1);
    marks.count = markHigh;
    mn = (mn + 1) % NM;
    marks.instanceMatrix.needsUpdate = true;
  }

  // ---- dashed trajectories and bullets ----
  const TRAILS = 5, DASHES = 90;
  const trails = [];
  for (let i = 0; i < TRAILS; i++) trails.push({ live: false, s: null, age: 0, hex: '#fff' });
  const lines = new LineSet(THREE, TRAILS * DASHES * 2 + 40, mats.fade, true);
  lines.mesh.renderOrder = 5;
  root.add(lines.mesh);
  geos.push(lines.geo);
  const tmpA = { x: 0, y: 0, z: 0 }, tmpB = { x: 0, y: 0, z: 0 };
  let tn = 0;
  function addShot(s, hex) {
    const t = trails[tn];
    tn = (tn + 1) % TRAILS;
    t.live = true; t.s = s; t.age = 0; t.hex = hex;
  }
  const TRAIL_LIFE = 5, DASH = 2.6, GAP = 2.6;
  function drawTrails(dt) {
    let n = 0;
    for (const t of trails) {
      if (!t.live) continue;
      t.age += dt;
      if (t.age > TRAIL_LIFE) { t.live = false; continue; }
      const s = t.s, fade = Math.min(1, (TRAIL_LIFE - t.age) / 2.2) * 0.95;
      const tauEnd = s.tauEnd;
      const dl = (DASH + GAP) / V0, dd = DASH / V0;
      const march = Math.min(t.age, 1.6) * 40 / V0; // dashes stream away from the muzzle, then settle
      let k = 0;
      for (let tau = -(march % dl); tau < tauEnd && k < DASHES; tau += dl, k++) {
        const a = Math.max(0.02, tau), b = Math.min(tauEnd, tau + dd);
        if (b <= a) continue;
        shotAt(s, a, tmpA); shotAt(s, b, tmpB);
        if (n + 2 > lines.cap - 40) break;
        lines.set(n++, tmpA.x, tmpA.y, tmpA.z, tmpB.x, tmpB.y, tmpB.z, INK, 2.1, fade);
        lines.set(n++, tmpA.x, tmpA.y, tmpA.z, tmpB.x, tmpB.y, tmpB.z, t.hex, 1.0, fade);
      }
    }
    return n;
  }
  const bullets = []; // {s, age}
  function addBullet(s, hex) { bullets.push({ s, age: 0, hex }); }
  let windPush = 0; // drifting paper leans on the wind: the cheapest wind gauge in the world
  const beaconPos = [{ x: 0, y: 0, z: 0, on: false }, { x: 0, y: 0, z: 0, on: false }];

  function update(dt, anim) {
    // scraps (only the live span is drawn: instances cost a fixed overhead each on software rasterisers)
    let hi = -1;
    for (let i = 0; i < NP; i++) {
      const p = P[i];
      if (!p.live) continue;
      p.age += dt;
      if (p.age >= p.life) { p.live = false; fillIM.setMatrixAt(i, zero); inkIM.setMatrixAt(i, zero); continue; }
      hi = i;
      const k = Math.exp(-1.4 * dt);
      p.vx *= k; p.vz *= k; p.vy = p.vy * k - p.g * dt * (p.flut ? 0.55 : 1);
      if (p.flut) { p.vx += Math.sin(p.age * 7 + i) * 2.4 * dt + windPush * 5 * dt; p.vz += Math.cos(p.age * 6 + i * 2) * 2.4 * dt; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.03) { p.y = 0.03; p.vy = 0; p.vx *= 0.6; p.vz *= 0.6; p.sx = p.sy = p.sz = 0; }
      p.rx += p.sx * dt; p.ry += p.sy * dt; p.rz += p.sz * dt;
      const sc = p.size * Math.min(1, (p.life - p.age) * 2.5);
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rx, p.ry, p.rz);
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      fillIM.setMatrixAt(i, dummy.matrix);
      dummy.scale.set(sc * 1.45, sc * 1.45, sc);
      dummy.updateMatrix();
      inkIM.setMatrixAt(i, dummy.matrix);
    }
    fillIM.count = inkIM.count = hi + 1;
    fillIM.instanceMatrix.needsUpdate = true;
    inkIM.instanceMatrix.needsUpdate = true;
    // trails + bullets
    let n = drawTrails(dt);
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.age += dt;
      if (b.age > b.s.tauEnd + 0.02) { bullets.splice(i, 1); continue; }
      const a = Math.max(0, b.age - 0.014), c = Math.min(b.age, b.s.tauEnd);
      shotAt(b.s, a, tmpA); shotAt(b.s, c, tmpB);
      if (n + 3 > lines.cap) break;
      lines.set(n++, tmpA.x, tmpA.y, tmpA.z, tmpB.x, tmpB.y, tmpB.z, INK, 3.4, 1);
      lines.set(n++, tmpA.x, tmpA.y, tmpA.z, tmpB.x, tmpB.y, tmpB.z, b.hex, 2.0, 1);
      lines.set(n++, tmpB.x, tmpB.y, tmpB.z, tmpB.x + (tmpB.x - tmpA.x) * 0.02, tmpB.y + (tmpB.y - tmpA.y) * 0.02, tmpB.z + (tmpB.z - tmpA.z) * 0.02, '#ffffff', 1.0, 1);
    }
    for (let i = 0; i < 2; i++) {
      const b = beaconPos[i];
      if (!b.on || n + 2 > lines.cap) continue;
      const pulse = 0.55 + 0.35 * Math.sin(anim * 5 + i);
      lines.set(n++, b.x, b.y + 1.2, b.z, b.x, b.y + 70, b.z, INK, 5, pulse);
      lines.set(n++, b.x, b.y + 1.2, b.z, b.x, b.y + 70, b.z, ID[i], 2.6, pulse);
    }
    lines.flush(n);
  }

  return {
    root, scrap, burst, mark, addShot, addBullet, update, beaconPos, bullets, setWind(w) { windPush = w; },
    clear() { for (const p of P) p.live = false; for (const t of trails) t.live = false; bullets.length = 0; },
    dispose() { for (const g of geos) g.dispose(); for (const m of mls) m.dispose(); for (const t of texs) t.dispose(); fillIM.dispose(); inkIM.dispose(); marks.dispose(); },
  };
}
