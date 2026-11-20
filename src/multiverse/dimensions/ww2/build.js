// IRON AUTUMN — the town itself: ground, the ruined frontages, the church and its tower,
// the skyline beyond. Everything static is merged per material (see kitbash.js); the few
// things that move (the bell, the wall that falls) are returned as handles.
import { clamp, lerp, smoothstep, fbm, mulberry32 } from '../../kit.js';
import { Batch, ruinWall, SUN } from './kitbash.js';
import { TERRACE_Y } from './map.js';

const PLASTER = ['#cdbd9e', '#b9a78c', '#a9a69c', '#c4a78c', '#9da6a2', '#c6b592', '#b3ac98', '#bfa07e'];
const STONE = '#b9b09c', STONE_DARK = '#8f887a', CHAR = '#2a2622', SLATE = '#3a3d44';

export function buildTown(THREE, map, tex, seed, fog) {
  const rnd = mulberry32(seed ^ 0x7a11);
  const R = (a, b) => a + rnd() * (b - a);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const group = new THREE.Group();
  const masonry = new Batch(THREE, 0.42), stone = new Batch(THREE, 0.09), wood = new Batch(THREE, 1.0), plain = new Batch(THREE, 1);
  const far = new Batch(THREE, 0.2, null);
  const M = new THREE.Matrix4(), U = new THREE.Vector3(), V = new THREE.Vector3(0, 1, 0), W = new THREE.Vector3();
  // Wall space → world: u runs from A to B, the thickness goes to the left of that.
  const wallM = (ax, az, bx, bz, y = 0) => {
    U.set(bx - ax, 0, bz - az).normalize();
    W.set(-U.z, 0, U.x);
    return M.makeBasis(U, V, W).setPosition(ax, y, az);
  };

  // ---- ground --------------------------------------------------------------------------
  {
    const { HNX, HNZ, HF, HX0, HZ0, hf } = map;
    const n = HNX * HNZ, pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3), mix = new Float32Array(n * 2);
    for (let j = 0; j < HNZ; j++) for (let i = 0; i < HNX; i++) {
      const k = j * HNX + i, x = HX0 + i * HF, z = HZ0 + j * HF, h = hf[k];
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      uv[k * 2] = x * 0.25; uv[k * 2 + 1] = z * 0.25;
      let mud = clamp(smoothstep(0.2, 0.55, h) + smoothstep(-0.12, -0.45, h), 0, 1), wet = smoothstep(-0.75, -1.05, h) * 0.9;
      for (const c of map.craters) {
        const q = Math.hypot(x - c.x, z - c.z) / c.r;
        if (q < 1.7) mud = Math.max(mud, 1 - smoothstep(1.0, 1.7, q));
      }
      const damp = fbm(x * 0.09 + 31, z * 0.09 - 17, 3);
      mud = Math.max(mud, smoothstep(0.2, 0.42, fbm(x * 0.17 - 40, z * 0.17 + 3, 3)) * 0.85);
      wet = Math.max(wet, smoothstep(0.08, 0.3, damp) * 0.75 * (1 - mud * 0.6));
      const tone = 0.8 + fbm(x * 0.3, z * 0.3, 2) * 0.35;
      // Soot where the wrecks burned.
      const burn = Math.min(Math.hypot(x - 11, z - 17), Math.hypot(x - 11, z + 17));
      const soot = 1 - 0.6 * (1 - smoothstep(2.5, 7.5, burn));
      col[k * 3] = tone * soot; col[k * 3 + 1] = tone * soot * 0.98; col[k * 3 + 2] = tone * soot * 0.95;
      mix[k * 2] = mud; mix[k * 2 + 1] = wet;
    }
    const idx = new Uint32Array((HNX - 1) * (HNZ - 1) * 6);
    let q = 0;
    for (let j = 0; j < HNZ - 1; j++) for (let i = 0; i < HNX - 1; i++) {
      const a = j * HNX + i, b = a + 1, c = a + HNX, d = c + 1;
      idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aMix', new THREE.BufferAttribute(mix, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    const mat = fog.patch(new THREE.MeshStandardMaterial({ map: tex.cobble, normalMap: tex.cobbleN, normalScale: new THREE.Vector2(1.1, 1.1), vertexColors: true, roughness: 0.86, metalness: 0 }), 'ground', (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aMix;\nvarying vec2 vMix;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvMix = aMix;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vMix;')
        // Mud swallows the setts; standing water darkens them and turns them into a mirror for the low sun.
        .replace('#include <color_fragment>', '#include <color_fragment>\nfloat stoneL = dot( diffuseColor.rgb, vec3( 0.333 ) );\ndiffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.2, 0.155, 0.11 ) * ( 0.5 + stoneL * 2.2 ), vMix.x );\ndiffuseColor.rgb *= mix( 1.0, 0.5, vMix.y );')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, 0.1, vMix.y );')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize( mix( normal, nonPerturbedNormal, max( vMix.x * 0.65, vMix.y * 0.88 ) ) );');
    });
    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = true;
    group.add(ground);
    // Beyond the heightfield: coarse rubble out to the fog. Never walked on, barely seen.
    const X0 = HX0, X1 = HX0 + (HNX - 1) * HF, Z0 = HZ0, Z1 = HZ0 + (HNZ - 1) * HF, S = 3;
    const op = [], oc = [], ou = [];
    const quad = (x0, z0, x1, z1) => {
      for (const [x, z] of [[x0, z0], [x0, z1], [x1, z0], [x1, z0], [x0, z1], [x1, z1]]) {
        const inside = x >= X0 && x <= X1 && z >= Z0 && z <= Z1;
        op.push(x, inside ? map.height(x, z) : map.rawHeight(x, z) - 0.03, z);
        ou.push(x * 0.25, z * 0.25);
        const t = 0.5 + fbm(x * 0.3, z * 0.3, 2) * 0.3;
        oc.push(t, t * 0.95, t * 0.88);
      }
    };
    for (let x = -130; x < 130; x += S) for (let z = -190; z < 190; z += S) {
      const x1 = x + S, z1 = z + S;
      if (x >= X0 && x1 <= X1 && z >= Z0 && z1 <= Z1) continue;
      // Finer strips where the two meshes meet, so the seam is a line, not a staircase.
      if (x1 > X0 && x < X1 && z1 > Z0 && z < Z1) {
        for (let xx = x; xx < x1; xx += HF) for (let zz = z; zz < z1; zz += HF) {
          if (xx >= X0 && xx + HF <= X1 && zz >= Z0 && zz + HF <= Z1) continue;
          quad(xx, zz, xx + HF, zz + HF);
        }
      } else quad(x, z, x1, z1);
    }
    const og = new THREE.BufferGeometry();
    og.setAttribute('position', new THREE.Float32BufferAttribute(op, 3));
    og.setAttribute('uv', new THREE.Float32BufferAttribute(ou, 2));
    og.setAttribute('color', new THREE.Float32BufferAttribute(oc, 3));
    og.computeVertexNormals();
    const outer = new THREE.Mesh(og, fog.patch(new THREE.MeshLambertMaterial({ map: tex.cobble, vertexColors: true, color: '#8a7460' })));
    outer.receiveShadow = true;
    group.add(outer);
  }

  // ---- a ruined house: front wall with real window holes, party walls, the odd joist ----
  // A → B is the street front; the house stands to the left of that direction.
  function house(ax, az, bx, bz, o) {
    const len = Math.hypot(bx - ax, bz - az), floors = o.floors, full = floors * 3.3 + 0.7, depth = o.depth || 9;
    const colour = o.colour || pick(PLASTER), soot = o.soot ?? (rnd() < 0.45 ? R(0.25, 0.6) : 0), style = o.style;
    const ux = (bx - ax) / len, uz = (bz - az) / len, wx = -uz, wz = ux;
    const ph = R(0, 100), cut = R(0.25, 0.75) * len, dirn = rnd() < 0.5 ? 1 : -1;
    const tops = (u) => {
      const n = fbm(u * 0.22 + ph, ph * 0.7, 3);
      if (style === 'stump') return Math.max(0.6, 1.4 + n * 5 + (Math.abs(u - cut) < 1.1 ? full * 0.55 : 0));
      if (style === 'gutted') return clamp(full * (0.5 + dirn * (u - cut) / len * 1.3) + n * 4, 1.5, full);
      return clamp(full - Math.max(0, n * 9 - 1.2), 2.2, full);
    };
    const wins = [], bays = Math.max(2, Math.round(len / 2.7)), bw = len / bays;
    for (let f = 1; f < floors; f++) for (let b = 0; b < bays; b++) wins.push({ u: (b + 0.5) * bw - 0.55, v: f * 3.3 + 0.95, w: 1.1, h: 1.75 });
    const front = ruinWall(THREE, len, 0.55, tops, wins);
    masonry.add(front.geo, wallM(ax, az, bx, bz), colour, soot);
    const at = (u, d) => [ax + ux * u + wx * d, az + uz * u + wz * d];
    const ry = Math.atan2(-uz, ux); // rotation that lays a box's x axis along the wall
    const topAt = (u) => front.top[clamp(Math.floor(u / front.du), 0, front.top.length - 1)];
    // Dressings on the street face: sills, a string course, the cornice where it survives.
    for (const w of front.holes) {
      const [x, z] = at(w.u + w.w / 2, -0.08);
      stone.box(x, w.v - 0.07, z, w.w + 0.3, 0.14, 0.3, STONE, ry);
      if (rnd() < 0.3) { // a shutter hanging on by one hinge
        const [sx, sz] = at(w.u - 0.28, -0.1);
        wood.box(sx, w.v + w.h * 0.5 - 0.1, sz, 0.5, w.h, 0.05, '#55604f', ry + R(-0.5, 0.5), 0, R(-0.25, 0.25));
      }
    }
    for (let u = 0.6; u < len - 0.6; u += 1.2) {
      const t = Math.min(topAt(u - 0.5), topAt(u + 0.5));
      const [x, z] = at(u, -0.06);
      if (t > 3.6) stone.box(x, 3.3, z, 1.22, 0.2, 0.2, STONE_DARK, ry);
      if (t >= full - 0.1) stone.box(x, full - 0.12, z, 1.22, 0.3, 0.42, STONE, ry);
    }
    // Ground floor: doors and shop fronts, boarded or dark — nobody is getting in.
    for (let b = 0; b < bays; b++) {
      const u = (b + 0.5) * bw, shop = o.shops && b % 2 === 0, w = shop ? Math.min(2.3, bw - 0.6) : 1.15, h = shop ? 2.1 : 2.35;
      if (topAt(u) < h + 0.6 || (!shop && rnd() < 0.45)) continue;
      const [x, z] = at(u, -0.03), y0 = shop ? 0.75 : 0.15;
      plain.box(x, y0 + h / 2, z, w, h, 0.12, '#14110f', ry);
      stone.box(x, y0 + h + 0.1, z, w + 0.35, 0.22, 0.24, STONE_DARK, ry);
      const [px, pz] = at(u, -0.11);
      for (let k = 0; k < 3; k++) if (rnd() < 0.75) wood.box(px + R(-0.1, 0.1), y0 + h * (0.2 + k * 0.3), pz, w + 0.2, 0.16, 0.04, '#5b4a37', ry, 0, R(-0.12, 0.12));
      if (shop && rnd() < 0.7) wood.box(px, y0 + h + 0.5, pz, w + 0.5, 0.5, 0.06, pick(['#4c5a52', '#6a4a3a', '#55504a']), ry, 0, R(-0.05, 0.05));
    }
    // Party walls step down towards the back; the back wall is mostly gone.
    for (const u of o.noParty ? [] : [0, len]) {
      const [x0, z0] = at(u, 0.5), [x1, z1] = at(u, depth), h0 = Math.min(topAt(u === 0 ? 0.3 : len - 0.3) + 0.6, full);
      const side = ruinWall(THREE, depth - 0.5, 0.5, (s) => clamp(h0 * (1 - s / depth * (o.low ? 1.25 : 0.7)) + fbm(s * 0.3 + ph + u, 4, 2) * 5, 0.8, full), []);
      masonry.add(side.geo, wallM(x0, z0, x1, z1), colour, soot + 0.15);
    }
    if (!o.low) {
      const [x0, z0] = at(len, depth), [x1, z1] = at(0, depth);
      const back = ruinWall(THREE, len, 0.5, (s) => clamp(full * 0.5 + fbm(s * 0.25 + ph * 3, 1, 3) * full * 1.6, 0.5, full), wins.filter(() => rnd() < 0.6));
      masonry.add(back.geo, wallM(x0, z0, x1, z1), colour, soot + 0.2);
    }
    // A chimney breast that outlived its house, joists, a fallen roof beam.
    if (rnd() < 0.6) {
      const u = R(0.2, 0.8) * len, [x, z] = at(u, depth * R(0.35, 0.8)), h = full * R(0.75, 1.25);
      masonry.box(x, h / 2, z, 1.0, h, 0.8, colour, ry, 0, 0, 0.5);
      masonry.box(x, h + 0.25, z, 1.2, 0.5, 1.0, '#8a6a58', ry);
    }
    for (let f = 1; f < floors; f++) for (let k = 0; k < 3; k++) {
      if (rnd() < 0.5) continue;
      const u = R(0.8, len - 0.8);
      if (topAt(u) < f * 3.3 + 0.4) continue;
      const l = R(2, depth * 0.8), [x, z] = at(u, 0.4 + l / 2), sag = rnd() < 0.4 ? R(0.15, 0.5) : 0;
      wood.box(x, f * 3.3 - sag * l * 0.5, z, 0.16, 0.22, l, CHAR, ry, sag);
    }
    return { topAt, at, len, full };
  }

  const styleFor = (side, sunny) => { const r = rnd(); return sunny ? (r < 0.6 ? 'standing' : r < 0.9 ? 'gutted' : 'stump') : (r < 0.3 ? 'standing' : r < 0.72 ? 'gutted' : 'stump'); };
  for (const p of map.pieces) {
    if (p.type === 'row') {
      const za = p.m > 0 ? p.z0 : -p.z1, zb = p.m > 0 ? p.z1 : -p.z0, X = p.side > 0 ? 30.6 : -30;
      let z = za;
      while (z < zb - 0.5) {
        let w = R(7, 11);
        if (zb - z - w < 5) w = zb - z;
        // East houses stand to the left of north-going fronts; west houses of south-going ones.
        const o = { floors: 2 + Math.floor(rnd() * 2.4), style: styleFor(p.side, p.side > 0), shops: rnd() < 0.6, low: p.side < 0 };
        if (p.side > 0) house(X, z + w, X, z, o);
        else house(X, z, X, z + w, o);
        z += w;
      }
    } else if (p.type === 'end') {
      // South end (m = 1): fronts run east along z = 60; north end the other way.
      for (const [x0, x1] of [[-44, -7], [7, 44]]) {
        let x = x0;
        while (x < x1 - 0.5) {
          let w = R(8, 12);
          if (x1 - x - w < 5) w = x1 - x;
          const o = { floors: 3 + Math.floor(rnd() * 1.6), style: rnd() < 0.55 ? 'standing' : 'gutted', shops: true };
          if (p.m > 0) house(x, 60, x + w, 60, o);
          else house(x + w, -60, x, -60, o);
          x += w;
        }
      }
      // The street out of town: choked with what fell into it, more ruin either side.
      for (let k = 0; k < 4; k++) {
        const z = p.m * (72 + k * 20);
        for (const s of [-1, 1]) {
          const o = { floors: 3 + Math.floor(rnd() * 2), style: rnd() < 0.5 ? 'standing' : 'gutted', depth: 10, soot: 0.3 };
          if (s * p.m > 0) house(s * 7.5, z + p.m * 18, s * 7.5, z, o);
          else house(s * 7.5, z, s * 7.5, z + p.m * 18, o);
        }
      }
    }
  }

  // ---- the church ----------------------------------------------------------------------
  {
    const T = TERRACE_Y;
    stone.box(27.5, T / 2, 0, 7, T, 38, STONE);
    stone.box(27.4, T + 0.02, 0, 7.3, 0.14, 38.3, '#c8bfaa');
    for (let z = -17.5; z <= 17.6; z += 5) if (Math.abs(z) > 4.5) stone.box(23.85, T / 2, z, 0.5, T, 1.0, STONE_DARK);
    for (let i = 0; i < 6; i++) stone.box((19.2 + 0.8 * i + 24) / 2, (T / 6) * (i + 0.5), 0, 24 - 19.2 - 0.8 * i, T / 6, 8, i & 1 ? '#c2b9a4' : STONE);
    for (const s of [-1, 1]) stone.box(21.6, 0.75, s * 4.25, 4.9, 1.5, 0.5, STONE_DARK, 0, 0, 0); // cheek walls
    for (const p of map.pieces) {
      if (p.type !== 'parapet') continue;
      const za = p.m > 0 ? p.z0 : -p.z1, zb = p.m > 0 ? p.z1 : -p.z0;
      stone.box(24.22, T + 0.45, (za + zb) / 2, 0.42, 0.9, zb - za, STONE);
      stone.box(24.22, T + 0.96, (za + zb) / 2, 0.6, 0.12, zb - za + 0.1, '#c8bfaa');
      for (const e of [za, zb]) stone.box(24.22, T + 0.3, e + (e === za ? -0.25 : 0.25), 0.42, 0.55, 0.5, STONE_DARK, 0, 0, R(-0.2, 0.2));
    }
    for (const m of [-1, 1]) stone.box(24.5, T + 0.5, m * 18.8, 1.0, 1.0, 0.4, STONE);
    // West front: two wings with lancets, the tower between them.
    const lancet = (u) => ({ u: u - 0.8, v: 2.4, w: 1.6, h: 5.4, arch: true });
    const wing = (za, zb, ph) => {
      const w = ruinWall(THREE, 15, 1.1, (u) => { const zz = Math.abs(lerp(za, zb, u / 15)); return clamp(8.5 + (19 - zz) * 0.42 - Math.max(0, fbm(u * 0.25 + ph, 2, 3) * 12 - 1.5), 3.5, 16); }, [lancet(4.5), lancet(10.5)]);
      stone.add(w.geo, wallM(31, za, 31, zb, T), STONE, 0.25);
    };
    wing(19, 4, 3.1);
    wing(-4, -19, 8.4);
    for (const z of [-19, -11.5, 11.5, 19]) { // buttresses, stepped
      stone.box(30.55, T + 3, z, 1.0, 6, 1.1, STONE_DARK);
      stone.box(30.75, T + 7, z, 0.6, 2.4, 0.9, STONE_DARK);
    }
    const TH = 25.5, bite = (u, k) => TH - (k ? Math.max(0, 5.5 - u * 1.1) + Math.max(0, fbm(u * 0.5, k, 2) * 3) : Math.max(0, fbm(u * 0.5, 3, 2) * 2.5));
    const belfry = { u: 2.7, v: 17.6, w: 2.6, h: 4.8, arch: true }, slit = { u: 3.6, v: 9.5, w: 0.8, h: 2.4, arch: true };
    const tw = (ax, az, bx, bz, wins, k) => stone.add(ruinWall(THREE, 8, 1.0, (u) => bite(u, k), wins).geo, wallM(ax, az, bx, bz), STONE, 0.2);
    tw(31, 4, 31, -4, [{ u: 2.3, v: T, w: 3.4, h: 5.8, arch: true }, { u: 2.4, v: 11.2, w: 3.2, h: 3.2, round: true }, belfry], 0);
    tw(31, -4, 39, -4, [slit, belfry], 1);
    tw(39, -4, 39, 4, [belfry], 2);
    tw(39, 4, 31, 4, [slit, belfry], 0);
    for (const y of [10.2, 17, 24.6]) for (const [x, z, w, d] of [[30.9, 0, 0.25, 8.3], [35, 4.1, 8.3, 0.25], [35, -4.1, 8.3, 0.25]]) stone.box(x, y, z, w, 0.35, d, '#c8bfaa');
    for (const s of [-1, 1]) { stone.box(30.6, 5, s * 4.2, 1.3, 10, 1.3, STONE_DARK); stone.box(30.8, 12.5, s * 4.2, 0.9, 5, 1.0, STONE_DARK); }
    // Portal: a dark throat and what is left of the doors.
    plain.box(32.3, T + 2.9, 0, 0.2, 5.8, 3.4, '#0c0a09');
    wood.box(31.7, T + 2.2, -1.0, 0.12, 4.4, 1.5, '#4a3524', 0.5);
    wood.box(31.5, T + 1.4, 1.1, 0.12, 4.4, 1.5, '#4a3524', -0.2, 0, 0.5);
    // Rose window: the stone spokes survived the glass.
    for (let k = 0; k < 6; k++) stone.box(31.45, 12.8, 0, 0.3, 3.1, 0.14, '#c8bfaa', 0, (k / 6) * Math.PI);
    stone.add(new THREE.TorusGeometry(0.55, 0.09, 6, 14), stone.mat(31.45, 12.8, 0, Math.PI / 2), '#c8bfaa');
    // Broken spire: two faces of slate and the ribs of the rest.
    plain.add(new THREE.ConeGeometry(5.66, 8.5, 2, 1, true, Math.PI * 0.25, Math.PI), plain.mat(35, TH + 4.25, 0), SLATE);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const len = Math.hypot(4, 8.5, 4);
      wood.box(35 + sx * 2, TH + 4.25, sz * 2, 0.2, len, 0.2, CHAR, Math.atan2(sx, sz), Math.atan2(Math.hypot(4, 4), 8.5) * -1);
    }
    wood.box(35, 21.9, 0, 0.35, 0.35, 6.4, '#3a2c20');
    // The nave behind: roofless, a few trusses against the sky.
    for (const s of [-1, 1]) {
      const w = ruinWall(THREE, 26, 0.9, (u) => clamp(13 - Math.max(0, fbm(u * 0.2 + s * 9, 5, 3) * 16 - 1), 3, 13.5), [4, 9.5, 15, 20.5].map((u) => ({ u, v: 3, w: 1.5, h: 6, arch: true })));
      if (s > 0) stone.add(w.geo, wallM(32, 19, 58, 19), STONE, 0.3);
      else stone.add(w.geo, wallM(58, -19, 32, -19), STONE, 0.3);
    }
    for (const x of [38, 45, 52]) if (rnd() < 0.8) for (const s of [-1, 1]) wood.box(x, 15.2 + R(-0.4, 0.4), s * 9.5, 0.3, 0.3, 21, CHAR, 0, s * 0.56 + R(-0.05, 0.05));
    stone.box(58.5, 6, 0, 1, 12, 39, STONE_DARK, 0, 0, 0, 0.3);
    // Fallen ashlar on the terrace.
    for (let i = 0; i < 9; i++) stone.box(R(28.5, 30.5), T + 0.2, R(-17, 17), R(0.4, 0.8), R(0.3, 0.45), R(0.4, 0.7), STONE, R(0, 3), 0, R(-0.2, 0.2));
  }
  // The bell swings about the headstock; its handle goes back to the game.
  const bell = new THREE.Group();
  bell.position.set(35, 21.7, 0);
  {
    const prof = [[0.0, 0], [0.34, 0], [0.42, -0.12], [0.5, -0.5], [0.62, -0.95], [0.86, -1.3], [0.92, -1.42], [0.8, -1.42], [0.0, -1.3]].map(([r, y]) => new THREE.Vector2(r, y));
    const m = fog.patch(new THREE.MeshStandardMaterial({ color: '#8a6f35', roughness: 0.45, metalness: 0.85, side: THREE.DoubleSide }));
    const b = new THREE.Mesh(new THREE.LatheGeometry(prof, 18), m);
    b.castShadow = true;
    const clapper = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.11, 1.3, 6), m);
    clapper.position.y = -0.85;
    bell.add(b, clapper);
    bell.userData.clapper = clapper;
    group.add(bell);
  }

  // ---- the wall that falls ---------------------------------------------------------------
  // Built from separate blocks so it can come apart; before then they tile into one face.
  const fw = map.fallWall, fall = [];
  {
    const cols = 6, rows = 5, cw = (fw.x1 - fw.x0) / cols, ch = fw.h / rows;
    const g = new THREE.Group();
    const mat = fog.patch(new THREE.MeshLambertMaterial({ map: tex.masonry, normalMap: tex.masonryN, vertexColors: true }));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const n = fbm(c * 0.9 + 3, r * 0.7, 2);
      if (r === rows - 1 && n > 0.02) continue; // ragged top
      if (r >= 2 && r <= 3 && (c === 1 || c === 4)) continue; // two blind windows
      const b = new Batch(THREE, 0.42), x = fw.x0 + (c + 0.5) * cw, y = (r + 0.5) * ch;
      b.box(x, y, 0, cw + 0.01, ch + 0.01, 0.8, PLASTER[2], 0, 0, 0, 0.35);
      const geo = b.build();
      geo.translate(-x, -y, 0);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, 0);
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
      // Each block topples outwards, the upper rows first and furthest.
      const dir = rnd() < 0.5 ? -1 : 1;
      fall.push({ mesh, x, y, delay: (rows - 1 - r) * 0.16 + rnd() * 0.14, dir, vz: dir * (0.2 + r * 0.16 + rnd() * 0.15), vx: (rnd() - 0.5) * 1.2, spin: (rnd() - 0.5) * 5, rest: 0.25 + rnd() * 0.3, rx: R(-0.5, 0.5), ry: R(-0.6, 0.6) });
    }
    group.add(g);
  }

  // ---- skyline -----------------------------------------------------------------------------
  // Flat cut-outs out in the fog: more ruin, a couple of factory stacks, a gasometer frame.
  {
    const ring = (dist, h, seedOff) => {
      for (const [ax, az, bx, bz] of [[-dist, -170, -dist, 170], [dist, 170, dist, -170], [-150, -(dist + 90), 150, -(dist + 90)], [150, dist + 90, -150, dist + 90]]) {
        const len = Math.hypot(bx - ax, bz - az);
        const w = ruinWall(THREE, len, 0.6, (u) => { const n = fbm(u * 0.035 + seedOff, seedOff * 0.3, 4); return clamp(h * (0.45 + n * 2.2) + (fbm(u * 0.4, seedOff, 2) > 0.3 ? h * 0.5 : 0), 1.5, h * 2.3); }, []);
        far.add(w.geo, wallM(ax, az, bx, bz), '#2c2a2c');
      }
    };
    ring(62, 11, 3);
    ring(96, 15, 11);
    for (const [x, z, h] of [[-85, -40, 46], [-104, 58, 38], [78, 92, 42], [-70, 120, 34]]) far.cyl(x, h / 2, z, 1.4, 2.4, h, '#232224', 8);
    for (let k = 0; k < 10; k++) { const a = (k / 10) * 6.283; far.cyl(-92 + Math.cos(a) * 11, 13, -118 + Math.sin(a) * 11, 0.25, 0.25, 26, '#232224', 5); }
    for (const y of [9, 18, 25.5]) far.add(new THREE.TorusGeometry(11, 0.22, 4, 20), far.mat(-92, y, -118, 0, Math.PI / 2), '#232224');
  }

  const meshOf = (batch, material, shadow = true) => {
    const m = new THREE.Mesh(batch.build(), material);
    m.castShadow = shadow;
    m.receiveShadow = shadow;
    group.add(m);
    return m;
  };
  const mats = {
    masonry: fog.patch(new THREE.MeshLambertMaterial({ map: tex.masonry, normalMap: tex.masonryN, vertexColors: true })),
    stone: fog.patch(new THREE.MeshLambertMaterial({ map: tex.cobble, normalMap: tex.cobbleN, normalScale: new THREE.Vector2(0.7, 0.7), vertexColors: true })),
    wood: fog.patch(new THREE.MeshLambertMaterial({ map: tex.wood, normalMap: tex.woodN, vertexColors: true })),
    plain: fog.patch(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })),
    far: fog.patch(new THREE.MeshLambertMaterial({ vertexColors: true })),
  };
  return {
    group, bell, mats, batches: { masonry, stone, wood, plain },
    finish() {
      meshOf(masonry, mats.masonry);
      meshOf(stone, mats.stone);
      meshOf(wood, mats.wood);
      meshOf(plain, mats.plain);
      meshOf(far, mats.far, false);
    },
    // Pure function of the round clock, so both clients watch the same wall come down.
    setCollapse(time) {
      const t = time - fw.t;
      for (const b of fall) {
        const m = b.mesh, k = t - b.delay;
        if (k <= 0) {
          // The warning: the wall shudders before it goes.
          const sh = t > -fw.warn ? (1 + t / fw.warn) * 0.035 : 0;
          m.position.set(b.x + Math.sin(time * 31 + b.y * 3) * sh, b.y, Math.sin(time * 27 + b.x) * sh);
          m.rotation.set(0, 0, 0);
          continue;
        }
        const fallT = Math.sqrt((2 * Math.max(0.05, b.y - b.rest)) / 9.8), u = Math.min(1, k / fallT);
        const y = b.y - (b.y - b.rest) * u * u, travel = Math.min(k, fallT + 0.25);
        m.position.set(b.x + b.vx * travel, y, b.vz * travel);
        m.rotation.set(u * (b.dir * 1.3 + b.rx), u * b.ry, b.spin * 0.25 * u);
      }
    },
  };
}
