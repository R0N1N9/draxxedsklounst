// BREAK POINT — the frame round the picture: a crescent of sand under a wall of jungle and
// one old volcano, palms along the top of the beach, a pier with its lamps on, a lifeguard
// tower, parasols, a fire, basalt headlands at both ends of the bay and a lighthouse on the
// right-hand one. All of it is static, so it is merged into a handful of meshes and its
// long evening shadows are drawn into the shadow map exactly once.
import { mulberry32, fbm, smoothstep, lerp, TAU } from '../../kit.js';
import { shoreZ } from './sea.js';
import { SUN } from './sky.js';

const sandY = (d) => (d < 0 ? Math.max(-7, d * 0.055) : d < 46 ? d * 0.055 : 2.53 + (1 - Math.exp(-(d - 46) / 30)) * 3.2);

// Collects coloured primitives into one geometry.
export function merger(THREE) {
  const pos = [], nor = [], col = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  return {
    // geo is consumed. at: [x, y, z], rot: [rx, ry, rz] (YXZ), scale: number or [x, y, z]
    add(geo, at, color, rot, scale, flat) {
      const g = geo.index ? geo.toNonIndexed() : geo;
      e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, 'YXZ');
      if (Array.isArray(scale)) s.set(scale[0], scale[1], scale[2]); else s.setScalar(scale || 1);
      g.applyMatrix4(m.compose(v.set(at[0], at[1], at[2]), q.setFromEuler(e), s));
      if (flat) g.computeVertexNormals();
      const p = g.attributes.position.array, n = g.attributes.normal.array;
      c.set(color);
      for (let i = 0; i < p.length; i += 3) { pos.push(p[i], p[i + 1], p[i + 2]); nor.push(n[i], n[i + 1], n[i + 2]); col.push(c.r, c.g, c.b); }
      if (g !== geo) g.dispose();
      geo.dispose();
    },
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      return g;
    },
  };
}

export function buildShore(THREE, haze, seed, Q, sun, renderer) {
  const rng = mulberry32((seed ^ 0x5eaf00d) >>> 0), group = new THREE.Group();
  const R = (a, b) => a + rng() * (b - a);
  const lit = (o) => haze.patch(new THREE.MeshLambertMaterial({ vertexColors: true, ...o }));
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d), cyl = (r0, r1, h, n = 10) => new THREE.CylinderGeometry(r0, r1, h, n), cone = (r, h, n = 8) => new THREE.ConeGeometry(r, h, n);
  const ground = (x, d) => [x, sandY(d), shoreZ(x) - d];

  // ---- sand: wet at the waterline, gold above it, scrub where the palms start ----
  {
    const nx = 150, nd = 46, pos = [], col = [], idx = [], c = new THREE.Color();
    for (let j = 0; j <= nd; j++) for (let i = 0; i <= nx; i++) {
      const x = -640 + (i / nx) * 1280, d = -70 + (j / nd) * 250 + (j > 16 ? 0 : 0), n = fbm(x * 0.03, d * 0.05, 3);
      pos.push(x, sandY(d) + (d > 8 ? n * 0.5 : 0), shoreZ(x) - d);
      const wet = 1 - smoothstep(0.5, 5, d), green = smoothstep(52, 80, d + n * 14);
      c.setRGB(lerp(lerp(0.74, 0.3, wet), 0.14, green), lerp(lerp(0.55, 0.22, wet), 0.22, green), lerp(lerp(0.36, 0.17, wet), 0.08, green));
      col.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < nd; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, cc = a + nx + 1, dd = cc + 1; idx.push(a, b, cc, b, dd, cc); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const sand = new THREE.Mesh(g, lit({}));
    sand.receiveShadow = true;
    group.add(sand);
  }
  // ---- the land behind: jungle ridges and the volcano ----
  {
    const nx = 150, nd = 60, pos = [], col = [], idx = [], c = new THREE.Color();
    for (let j = 0; j <= nd; j++) for (let i = 0; i <= nx; i++) {
      const x = -1500 + (i / nx) * 3000, d = 150 + (j / nd) * 1300 + 0;
      const rise = smoothstep(150, 520, d), n = fbm(x * 0.0042 + 3, d * 0.0042, 4), vx = x + 330, vd = d - 900;
      const h = 5 + rise * (55 + n * 110) + 210 * Math.exp(-(vx * vx + vd * vd) / (2 * 210 * 210)) * (1 - 0.14 * Math.exp(-(vx * vx + vd * vd) / 2200)) + 55 * Math.exp(-((x - 620) * (x - 620) + (d - 520) * (d - 520)) / 60000);
      pos.push(x, h * (1 - smoothstep(1250, 1450, d) * 0.7), shoreZ(Math.max(-700, Math.min(700, x))) - d);
      // jungle below, bare rock high up; gullies in shadow, and the drifting shade of the clouds
      const k = smoothstep(90, 230, h) + n * 0.2, gully = 0.55 + 0.9 * Math.abs(fbm(x * 0.011, d * 0.016, 4)), cloud = 0.62 + 0.38 * smoothstep(-0.25, 0.2, fbm(x * 0.0021 + 9, d * 0.003, 2));
      const dapple = Math.min(1.35, gully) * cloud;
      c.setRGB(lerp(0.085, 0.3, k) * dapple, lerp(0.16, 0.19, k) * dapple, lerp(0.05, 0.13, k) * dapple);
      col.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < nd; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, cc = a + nx + 1, dd = cc + 1; idx.push(a, b, cc, b, dd, cc); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    group.add(new THREE.Mesh(g, lit({})));
  }

  const M = merger(THREE), ROCK = merger(THREE), GLOW = merger(THREE);
  const rock = (x, y, z, r, sy = 0.8) => {
    const g0 = new THREE.IcosahedronGeometry(1, 1), g = g0.index ? g0.toNonIndexed() : g0, p = g.attributes.position.array;
    // nudge every corner by a hash of where it is, so shared corners stay shared
    for (let i = 0; i < p.length; i += 3) { const h = Math.sin(p[i] * 12.9 + p[i + 1] * 78.2 + p[i + 2] * 37.7 + x) * 43758.5; const k = 0.78 + (h - Math.floor(h)) * 0.5; p[i] *= k; p[i + 1] *= k; p[i + 2] *= k; }
    const t = rng();
    ROCK.add(g, [x, y, z], t < 0.5 ? '#4a3d36' : '#3d3638', [R(-0.3, 0.3), R(0, TAU), R(-0.3, 0.3)], [r * R(0.8, 1.25), r * sy * R(0.8, 1.2), r * R(0.8, 1.25)], true);
  };
  // ---- headlands at both ends of the bay, and loose stacks off their points ----
  for (const side of [-1, 1]) {
    const x0 = side * 330, z0 = shoreZ(x0) + 6, x1 = side * 232, z1 = -66;
    for (let i = 0; i <= 15; i++) {
      const u = i / 15, r = lerp(30, 9, u) * R(0.8, 1.15);
      rock(lerp(x0, x1, u) + R(-6, 6), r * 0.18, lerp(z0, z1, u) + R(-6, 6), r, 0.7);
      if (i % 3 === 0) rock(lerp(x0, x1, u) + side * R(8, 22), -1, lerp(z0, z1, u) + R(4, 20), R(3, 7), 0.9);
    }
    for (let i = 0; i < 4; i++) rock(x1 - side * R(-4, 26) + R(-8, 8), -0.8, z1 + R(10, 44), R(2.2, 5.5), R(0.9, 1.7));
  }
  for (let i = 0; i < 5; i++) rock(R(-560, 560), -1, R(1900, 2600), R(60, 150), 0.45); // islets on the horizon

  // ---- the lighthouse, on the point of the right-hand headland ----
  const LH = { x: 236, y: 6.5, z: -70 };
  {
    const { x, y, z } = LH;
    rock(x, 2, z, 12, 0.7);
    M.add(cyl(4.2, 4.8, 1.2, 14), [x, y + 0.6, z], '#8a8078');
    for (let i = 0; i < 5; i++) M.add(cyl(lerp(3.3, 2.3, (i + 1) / 5), lerp(3.3, 2.3, i / 5), 4.6, 14), [x, y + 1.2 + 2.3 + i * 4.6, z], i % 2 ? '#e0513a' : '#f4ead8');
    M.add(cyl(3.1, 3.1, 0.35, 14), [x, y + 24.4, z], '#2a2a30');
    GLOW.add(cyl(1.5, 1.5, 2.2, 10), [x, y + 25.7, z], '#ffffff');
    M.add(cone(2.3, 1.8, 10), [x, y + 27.7, z], '#e0513a');
    M.add(box(4.5, 3, 5), [x - 6, y + 1.5, z + 1], '#f4ead8');
    M.add(cone(4.4, 1.8, 4), [x - 6, y + 3.9, z + 1], '#b8452f', [0, Math.PI / 4, 0]);
    GLOW.add(box(0.1, 0.9, 0.8), [x - 8.3, y + 1.6, z + 1], '#ffffff');
  }
  // ---- the pier ----
  const PIER = { x: -96, z0: shoreZ(-96) - 16, z1: -106, y: 3.5 };
  {
    const { x, z0, z1, y } = PIER, len = z1 - z0, zc = (z0 + z1) / 2;
    M.add(box(5.2, 0.28, len), [x, y, zc], '#8a6a4a');
    for (const sx of [-2.6, 2.6]) { M.add(box(0.12, 0.12, len), [x + sx, y + 1.05, zc], '#d9c8a8'); M.add(box(0.1, 0.1, len), [x + sx, y + 0.6, zc], '#d9c8a8'); }
    for (let z = z0 + 2; z <= z1 - 1; z += 6) {
      const d = shoreZ(x) - z, base = sandY(d) - 1.5;
      for (const sx of [-2.3, 2.3]) M.add(cyl(0.2, 0.24, y - base, 7), [x + sx, (y + base) / 2, z], '#5a4634');
      M.add(box(5, 0.22, 0.22), [x, y - 0.5, z], '#5a4634');
      for (const sx of [-2.6, 2.6]) M.add(box(0.14, 1.1, 0.14), [x + sx, y + 0.55, z + 3], '#d9c8a8');
    }
    for (let z = z0 + 8, i = 0; z < z1 - 8; z += 13, i++) {
      const sx = i % 2 ? 2.4 : -2.4;
      M.add(cyl(0.07, 0.09, 3.4, 6), [x + sx, y + 1.7, z], '#2a2a30');
      GLOW.add(new THREE.SphereGeometry(0.26, 8, 6), [x + sx, y + 3.5, z], '#ffffff');
    }
    for (let z = z0 + 3; z < z1 - 9; z += 2.2) GLOW.add(new THREE.SphereGeometry(0.07, 5, 4), [x + 2.6, y + 1.2 + 0.25 * Math.cos(z * 1.4), z], '#ffffff'); // festoon
    // the bait shack at the end
    M.add(box(9, 0.3, 9), [x, y, z1 - 3.5], '#8a6a4a');
    M.add(box(5, 3, 4.4), [x - 0.6, y + 1.65, z1 - 4], '#2f8f8a');
    M.add(cone(4.6, 1.9, 4), [x - 0.6, y + 4.1, z1 - 4], '#f4ead8', [0, Math.PI / 4, 0]);
    GLOW.add(box(1.6, 1.1, 0.1), [x - 0.6, y + 1.9, z1 - 1.75], '#ffffff');
    GLOW.add(box(0.1, 1.1, 1.4), [x + 1.95, y + 1.9, z1 - 4], '#ffffff');
    for (const sx of [-4, 4]) for (const sz of [-7.5, 0.5]) M.add(cyl(0.24, 0.28, 7, 7), [x + sx, y - 3.5, z1 + sz], '#5a4634');
  }
  // ---- the lifeguard tower ----
  {
    const [x, y, z] = ground(34, 13);
    for (const sx of [-1.3, 1.3]) for (const sz of [-1.3, 1.3]) M.add(cyl(0.11, 0.13, 2.8, 6), [x + sx, y + 1.4, z + sz], '#e9dcc0', [sz * 0.06, 0, -sx * 0.06]);
    M.add(box(3.6, 0.2, 3.6), [x, y + 2.8, z], '#e9dcc0');
    M.add(box(2.6, 2.1, 2.4), [x, y + 3.95, z - 0.4], '#f4ead8');
    M.add(box(2.64, 0.45, 2.44), [x, y + 3.3, z - 0.4], '#e0513a');
    M.add(box(3.6, 0.16, 3.9), [x, y + 5.15, z], '#e0513a', [0.12, 0, 0]);
    M.add(box(1.1, 0.14, 4), [x + 0.9, y + 1.45, z + 3.4], '#e9dcc0', [0.72, 0, 0]);
    M.add(cyl(0.04, 0.04, 2.6, 5), [x - 1.5, y + 6.3, z + 1.5], '#e9dcc0');
    M.add(box(1.1, 0.7, 0.04), [x - 0.93, y + 7.2, z + 1.5], '#f2b93a');
    GLOW.add(box(1.2, 0.8, 0.08), [x, y + 4.1, z + 0.82], '#ffffff');
  }
  // ---- along the beach: parasols, boards stuck in the sand, three huts, a fire ----
  const paint = ['#e0513a', '#f4ead8', '#2f8f8a', '#f2b93a', '#e98b6d', '#3a6ea5'];
  for (let i = 0; i < 16; i++) {
    const [x, y, z] = ground(R(-250, 250), R(9, 30)), c = paint[i % paint.length], tilt = [R(-0.18, 0.18), R(0, TAU), R(-0.18, 0.18)];
    if (Math.abs(x - 34) < 7 || Math.abs(x + 96) < 7) continue;
    M.add(cyl(0.04, 0.04, 2.3, 5), [x, y + 1.15, z], '#e9dcc0', tilt);
    M.add(cone(1.5, 0.6, 10), [x, y + 2.45, z], c, tilt);
    M.add(box(0.7, 0.05, 1.8), [x + R(-1.6, 1.6), y + 0.06, z + R(-1, 1)], paint[(i + 2) % paint.length], [0, R(0, TAU), 0]); // a towel
  }
  for (let i = 0; i < 9; i++) {
    const [x, y, z] = ground(-40 + i * 1.5 + R(-0.3, 0.3), 34 + R(-0.6, 0.6));
    M.add(new THREE.SphereGeometry(1, 10, 6), [x, y + 1.15, z], paint[(i * 5 + 1) % paint.length], [R(-0.25, -0.1), R(-0.3, 0.3), R(-0.08, 0.08)], [0.28, 1.25, 0.05]);
  }
  for (let i = 0; i < 3; i++) {
    const [x, y, z] = ground(96 + i * 11, 40), c = paint[(i * 2) % paint.length];
    M.add(box(5, 3.2, 4.5), [x, y + 1.6, z], c);
    M.add(cone(4.4, 2, 4), [x, y + 4.2, z], '#f4ead8', [0, Math.PI / 4, 0]);
    GLOW.add(box(1.1, 1.3, 0.1), [x, y + 1.6, z + 2.28], '#ffffff');
  }
  const FIRE = ground(-18, 17);
  for (let i = 0; i < 5; i++) M.add(cyl(0.09, 0.11, 1.5, 5), [FIRE[0], FIRE[1] + 0.4, FIRE[2]], '#3a2a1e', [0.9, (i / 5) * TAU, 0]);
  GLOW.add(cone(0.4, 1.1, 6), [FIRE[0], FIRE[1] + 0.75, FIRE[2]], '#ffffff');

  const props = new THREE.Mesh(M.build(), lit({})), rocks = new THREE.Mesh(ROCK.build(), haze.patch(new THREE.MeshLambertMaterial({ vertexColors: true }), '#40261a')); // (faceted by its normals: no second shader)
  const glow = new THREE.Mesh(GLOW.build(), haze.patch(new THREE.MeshLambertMaterial({ color: '#000000', emissive: new THREE.Color(1, 0.62, 0.26), emissiveIntensity: 7 })));
  props.castShadow = props.receiveShadow = rocks.castShadow = rocks.receiveShadow = true;
  group.add(props, rocks, glow);

  // ---- palms: one bent trunk and one frond, instanced ----
  {
    const N = 58, FR = 9, pts = [];
    for (let i = 0; i <= 5; i++) { const u = i / 5; pts.push(new THREE.Vector3(u * u * 1.6, u * 9, 0)); }
    const trunkGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.22, 6);
    const frondGeo = new THREE.PlaneGeometry(4.4, 1.1, 8, 2).translate(2.2, 0, 0).rotateX(-Math.PI / 2);
    {
      const p = frondGeo.attributes.position.array;
      for (let i = 0; i < p.length; i += 3) {
        const u = p[i] / 4.4, w = Math.sin(Math.PI * Math.min(1, u * 1.04)) * (1 - u * 0.35);
        p[i + 2] *= w + 0.05;
        p[i + 1] = -u * u * 2.1 - Math.abs(p[i + 2]) * 0.55 + u * 0.7; // arches up, droops at the tip, V along the spine
      }
      frondGeo.computeVertexNormals();
    }
    const trunkMat = haze.patch(new THREE.MeshLambertMaterial({ color: '#5a4332' }), '#5a2e12');
    const frondMat = haze.patch(new THREE.MeshLambertMaterial({ color: '#1f4a1c', side: THREE.DoubleSide }), '#6a4a14', true);
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, N), fronds = new THREE.InstancedMesh(frondGeo, frondMat, N * FR);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(), top = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const x = -330 + (i / (N - 1)) * 660 + R(-5, 5), d = i % 4 === 0 ? R(26, 34) : R(40, 74), g0 = ground(x, d), sc = R(0.8, 1.35), yaw = R(0, TAU);
      m.compose(v.set(g0[0], g0[1] - 0.3, g0[2]), q.setFromEuler(e.set(0, yaw, 0)), s.setScalar(sc));
      trunks.setMatrixAt(i, m);
      top.set(1.6, 9, 0).applyMatrix4(m);
      for (let k = 0; k < FR; k++) {
        e.set(0, (k / FR) * TAU + R(-0.3, 0.3), R(-0.15, 0.5), 'YXZ');
        m.compose(top, q.setFromEuler(e), s.setScalar(sc * R(0.85, 1.15)));
        fronds.setMatrixAt(i * FR + k, m);
      }
    }
    trunks.castShadow = fronds.castShadow = true;
    trunks.frustumCulled = fronds.frustumCulled = false;
    group.add(trunks, fronds);
  }

  // ---- the lighthouse beam: two cones of light going round ----
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying float vU; void main() { vU = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'precision highp float; varying float vU; void main() { float a = (1.0 - vU) * (1.0 - vU); gl_FragColor = vec4(vec3(1.0, 0.78, 0.45) * a * 0.34, 1.0); }',
  });
  const beamGeo = new THREE.CylinderGeometry(9, 0.6, 1, 16, 1, true).translate(0, 0.5, 0);
  const beam = new THREE.Group();
  for (const s of [1, -1]) { const b = new THREE.Mesh(beamGeo, beamMat); b.scale.set(1, 150, 1); b.rotation.z = s * Math.PI / 2; b.frustumCulled = false; beam.add(b); }
  beam.position.set(LH.x, LH.y + 25.7, LH.z);
  group.add(beam);

  // ---- the evening shadows, once (a software rasteriser goes without: the map costs it a second per mount) ----
  if (!Q.soft) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 1024);
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.5;
    const sc = sun.shadow.camera, inv = new THREE.Matrix4(), v = new THREE.Vector3();
    sun.position.set(SUN.x * 500, SUN.y * 500, SUN.z * 500 - 190);
    sun.target.position.set(0, 0, -190);
    sun.target.updateMatrixWorld();
    sc.position.copy(sun.position);
    sc.lookAt(sun.target.position);
    sc.updateMatrixWorld();
    inv.copy(sc.matrixWorld).invert();
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const x of [-360, 360]) for (const y of [-2, 40]) for (const z of [-330, -60]) {
      v.set(x, y, z).applyMatrix4(inv);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z);
    }
    sc.left = x0; sc.right = x1; sc.bottom = y0; sc.top = y1; sc.near = -z1 - 10; sc.far = -z0 + 10;
    sc.updateProjectionMatrix();
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
  }

  return {
    group, fire: FIRE, lighthouse: LH,
    update(dt, T, wt) {
      beam.rotation.y = wt * 0.55;
      haze.shared.uWt.value = wt;
    },
    dispose() { beamGeo.dispose(); beamMat.dispose(); },
  };
}
