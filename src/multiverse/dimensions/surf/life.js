// BREAK POINT — the cast. world.js says where everything in the bay is at any moment; this
// file gives it a body: four dolphins, the fin, the beach ball, a flock of gulls (one
// instanced draw, flapping in the vertex shader), the banner plane, the cruise ship with
// its lights on, and the buoy line.
import { mulberry32, canvasTexture, makeCanvas, TAU } from '../../kit.js';
import { N_DOLPHIN, N_BUOY } from './world.js';
import { merger } from './shore.js';
import { HAZE_GLSL } from './sky.js';

const BANNERS = ['DO YOU WANT TO DEVELOP AN APP?', 'NO SNIPING IN THE SWIM ZONE', 'LEARN TO SURF!  (NOT LIKE THIS)', 'HAPPY HOUR 5 TO 7  ·  THE SALTY GULL', 'LOST: ONE DIGNITY. LAST SEEN ON A WAVE', 'MARRY ME, DOLORES'];
const N_GULL = 22;

const GULL_V = `
attribute vec4 iOff; // radius, height, phase, speed
uniform vec3 uFlock, uSunDir;
uniform float uT;
varying vec3 vCol;
${HAZE_GLSL}
void main() {
  float a = iOff.z * 6.2832 + uT * iOff.w, r = iOff.x * (1.0 + 0.2 * sin(uT * 0.4 + iOff.z * 20.0));
  vec3 c = uFlock + vec3(cos(a) * r, iOff.y + sin(uT * 0.7 + iOff.z * 9.0) * 1.3, sin(a) * r);
  float flap = sin(uT * (5.0 + iOff.z * 3.0) + iOff.z * 40.0) * step(0.35, fract(uT * 0.11 + iOff.z)); // they glide a third of the time
  vec3 p = position;
  p.y += abs(p.x) * (0.25 + flap * 0.55);
  float h = a + 1.5708 * sign(iOff.w), cs = cos(h), sn = sin(h);
  vec3 w = c + vec3(p.x * cs - p.z * sn, p.y, p.x * sn + p.z * cs) * 1.15;
  vec3 vd = normalize(w - cameraPosition);
  vCol = mix(vec3(1.5, 1.15, 0.9) * (1.0 - abs(position.x) * 0.45), hazeColor(vd, uSunDir), 1.0 - exp(-length(w - cameraPosition) * 0.00045));
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

export function buildLife(THREE, haze, world, sea, seed, fx, sfx) {
  const rng = mulberry32((seed ^ 0xb1ad) >>> 0), group = new THREE.Group();
  const lit = (o, rim) => haze.patch(new THREE.MeshLambertMaterial({ vertexColors: true, ...o }), rim);
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d), cyl = (r0, r1, h, n = 10) => new THREE.CylinderGeometry(r0, r1, h, n), cone = (r, h, n = 8) => new THREE.ConeGeometry(r, h, n), ball = (r, a = 12, b = 8) => new THREE.SphereGeometry(r, a, b);
  const owned = [];
  const keep = (x) => { owned.push(x); return x; };

  // ---- dolphins ----
  const dGeo = (() => {
    const M = merger(THREE), BLUE = '#56788f', PALE = '#dfe7ea', DARK = '#3f596b';
    M.add(ball(1, 14, 10), [0, 0, 0], BLUE, null, [0.33, 0.36, 1.25]);
    M.add(ball(1, 12, 8), [0, -0.1, -0.05], PALE, null, [0.29, 0.28, 1.1]);
    M.add(cone(0.14, 0.55, 8), [0, -0.05, -1.4], BLUE, [-Math.PI / 2, 0, 0]);
    M.add(cone(0.24, 0.5, 4), [0, 0.5, 0.1], DARK, [-0.5, 0, 0], [0.22, 1, 1]);
    M.add(cone(0.22, 0.9, 8), [0, 0, 1.45], BLUE, [Math.PI / 2, 0, 0]);
    M.add(box(0.95, 0.05, 0.32), [0, 0, 1.9], DARK);
    for (const s of [-1, 1]) M.add(box(0.5, 0.05, 0.22), [s * 0.42, -0.2, -0.45], DARK, [0, s * 0.5, s * -0.6]);
    return keep(M.build());
  })();
  const dMat = keep(lit({}, '#7a5a3a'));
  const dolphins = [];
  for (let j = 0; j < N_DOLPHIN; j++) { const m = new THREE.Mesh(dGeo, dMat); group.add(m); dolphins.push({ m, up: false, spin: 0 }); }

  // ---- the fin ----
  const finGeo = (() => { const M = merger(THREE); M.add(cone(0.55, 1.25, 4), [0, 0.55, 0.15], '#3a4048', [-0.45, 0, 0], [0.16, 1, 1]); M.add(cone(0.25, 0.5, 4), [0, 0.15, 1.9], '#3a4048', [-0.7, 0, 0], [0.16, 1, 1]); return keep(M.build()); })();
  const fin = new THREE.Mesh(finGeo, keep(lit({}, '#5a3a22')));
  group.add(fin);
  let finT = 0;

  // ---- the beach ball ----
  const ballGeo = keep(ball(0.95, 18, 12));
  {
    const p = ballGeo.attributes.position, c = new Float32Array(p.count * 3), pal = [[0.88, 0.32, 0.23], [0.96, 0.92, 0.85], [0.18, 0.56, 0.54], [0.96, 0.92, 0.85], [0.95, 0.72, 0.23], [0.96, 0.92, 0.85]];
    for (let i = 0; i < p.count; i++) { const k = pal[Math.min(5, Math.max(0, Math.floor(((Math.atan2(p.getZ(i), p.getX(i)) + Math.PI) / TAU) * 6)))]; c[i * 3] = k[0]; c[i * 3 + 1] = k[1]; c[i * 3 + 2] = k[2]; }
    ballGeo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  const bMesh = new THREE.Mesh(ballGeo, keep(lit({}, '#6a4a2a')));
  group.add(bMesh);
  let punt = 0, ballLow = false;

  // ---- gulls ----
  const gGeo = keep(new THREE.InstancedBufferGeometry());
  gGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, -0.28, -1, 0, 0.05, 0, 0, 0.22, 0, 0, -0.28, 0, 0, 0.22, 1, 0, 0.05]), 3));
  {
    const off = new Float32Array(N_GULL * 4);
    for (let i = 0; i < N_GULL; i++) { off[i * 4] = 4 + rng() * 15; off[i * 4 + 1] = rng() * 7 - 2; off[i * 4 + 2] = rng(); off[i * 4 + 3] = (0.35 + rng() * 0.4) * (rng() < 0.5 ? 1 : -1); }
    gGeo.setAttribute('iOff', new THREE.InstancedBufferAttribute(off, 4));
    gGeo.instanceCount = N_GULL;
  }
  const gU = { uFlock: { value: new THREE.Vector3() }, uSunDir: { value: new THREE.Vector3() }, uT: { value: 0 } };
  const gulls = new THREE.Mesh(gGeo, keep(new THREE.ShaderMaterial({ uniforms: gU, vertexShader: GULL_V, fragmentShader: 'precision highp float; varying vec3 vCol; void main() { gl_FragColor = vec4(vCol, 1.0); }', side: THREE.DoubleSide })));
  gulls.frustumCulled = false;
  group.add(gulls);

  // ---- the banner plane ----
  const plane = new THREE.Group();
  {
    const M = merger(THREE);
    M.add(cyl(0.55, 0.3, 5.2, 10), [0, 0, 0.3], '#f4ead8', [Math.PI / 2, 0, 0]);
    M.add(cone(0.55, 1.1, 10), [0, 0, -2.85], '#e0513a', [-Math.PI / 2, 0, 0]);
    M.add(box(9.5, 0.14, 1.5), [0, 0.5, -0.9], '#e0513a');
    M.add(box(3.2, 0.1, 0.9), [0, 0.1, 2.6], '#e0513a');
    M.add(box(0.1, 1.1, 0.9), [0, 0.6, 2.6], '#f4ead8');
    M.add(box(0.05, 0.05, 14), [0, 0, 10], '#2a2a30'); // the tow line
    const body = new THREE.Mesh(keep(M.build()), keep(lit({}, '#6a3a1a')));
    body.rotation.y = -Math.PI / 2; // nose towards +x
    plane.add(body);
  }
  const { canvas: bc, g: bg } = makeCanvas(1024, 112);
  const text = BANNERS[rng() < 0.4 ? 0 : 1 + Math.floor(rng() * (BANNERS.length - 1))];
  bg.fillStyle = '#f4ead8'; bg.fillRect(0, 0, 1024, 112);
  bg.fillStyle = '#e0513a'; bg.fillRect(0, 0, 1024, 9); bg.fillRect(0, 103, 1024, 9);
  bg.fillStyle = '#12303c'; bg.textAlign = 'center'; bg.textBaseline = 'middle';
  let px = 74;
  do { bg.font = `700 ${px}px 'Rajdhani', 'Futura', 'Impact', sans-serif`; px -= 3; } while (bg.measureText(text).width > 960 && px > 20);
  bg.fillText(text, 512, 60);
  const bTex = keep(canvasTexture(THREE, bc));
  const bannerGeo = keep(new THREE.PlaneGeometry(34, 3.7, 24, 1));
  const banner = new THREE.Mesh(bannerGeo, keep(haze.patch(new THREE.MeshLambertMaterial({ map: bTex, side: THREE.DoubleSide, emissive: '#fff0d8', emissiveMap: bTex, emissiveIntensity: 0.35 }))));
  banner.position.set(-34, 0, 0);
  banner.frustumCulled = false;
  plane.add(banner);
  const bBase = bannerGeo.attributes.position.array.slice();
  group.add(plane);

  // ---- the cruise ship ----
  const ship = new THREE.Group();
  {
    const M = merger(THREE), G = merger(THREE);
    M.add(box(250, 16, 34), [0, 4, 0], '#141c2a');
    M.add(box(40, 16, 30), [-135, 5, 0], '#141c2a', [0, 0, 0.16]);
    M.add(box(236, 5, 33), [0, 14.5, 0], '#efe6d6');
    for (let i = 0; i < 4; i++) M.add(box(200 - i * 26, 5.2, 30 - i * 3), [8 + i * 6, 19.6 + i * 5.2, 0], '#efe6d6');
    for (const x of [20, 62]) { M.add(cyl(5, 6, 16, 12), [x, 46, 0], '#e0513a', [0, 0, -0.12]); M.add(cyl(5.1, 5.1, 3, 12), [x - 1, 53.5, 0], '#141c2a', [0, 0, -0.12]); }
    for (let r = 0; r < 5; r++) for (let i = 0; i < 34 - r * 4; i++) if (rng() < 0.82) G.add(box(2.6, 1.5, 0.3), [-88 + r * 12 + i * 5.6, 14.6 + r * 5.2, -17.2 + r * 1.5 + (r === 0 ? 0.6 : 0)], '#ffffff');
    ship.add(new THREE.Mesh(keep(M.build()), keep(lit({}, '#5a2a12'))), new THREE.Mesh(keep(G.build()), keep(haze.patch(new THREE.MeshLambertMaterial({ color: '#000000', emissive: new THREE.Color(1, 0.7, 0.32), emissiveIntensity: 9 })))));
  }
  group.add(ship);

  // ---- buoys ----
  const buoyGeo = (() => {
    const M = merger(THREE);
    M.add(cyl(0.8, 0.7, 0.55, 12), [0, 0.1, 0], '#e0513a');
    M.add(cyl(0.2, 0.55, 0.8, 10), [0, 0.75, 0], '#f4ead8');
    M.add(cyl(0.12, 0.2, 0.7, 10), [0, 1.5, 0], '#e0513a');
    M.add(ball(0.16, 8, 6), [0, 1.95, 0], '#f4ead8');
    return keep(M.build());
  })();
  const buoys = new THREE.InstancedMesh(buoyGeo, keep(lit({}, '#6a3a1a')), N_BUOY);
  buoys.frustumCulled = false;
  group.add(buoys);
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), v4 = new THREE.Vector3(), s4 = new THREE.Vector3(1, 1, 1);

  return {
    group,
    spin(i) { if (dolphins[i]) dolphins[i].spin = 1; },
    punt() { punt = 1; },
    update(dt, T, camera) {
      const wt = T;
      for (let j = 0; j < N_DOLPHIN; j++) {
        const d = world.dolphins[j], o = dolphins[j];
        o.spin = Math.max(0, o.spin - dt * 1.7);
        o.m.position.set(d.x, d.y, d.z);
        o.m.rotation.set(d.pitch, d.yaw, o.spin * TAU, 'YXZ');
        o.m.visible = d.up || d.y > -3;
        // out through the surface, and back in through it
        if (d.up !== o.up) { o.up = d.up; const hs = sea.height(d.x, d.z); fx.splash(d.x, hs, d.z, 1.1, 5, d.up ? 6 : 4); }
      }
      const f = world.fin;
      fin.position.set(f.x, f.y, f.z);
      fin.rotation.y = f.yaw;
      finT -= dt;
      if (f.up && finT <= 0) { finT = 0.3; fx.ring(f.x, f.y + 0.3, f.z, 0.6, 3.4, 1.4, 0.5); }
      const b = world.ball;
      punt = Math.max(0, punt - dt * 1.2);
      bMesh.position.set(b.x, b.y + Math.sin(punt * Math.PI) * 4, b.z);
      bMesh.rotation.set(b.spin, b.spin * 0.6 + punt * 12, 0);
      const low = b.y - sea.height(b.x, b.z) < 1.0;
      if (low && !ballLow) fx.ring(b.x, sea.height(b.x, b.z), b.z, 0.5, 3, 0.8, 0.7);
      ballLow = low;
      gU.uFlock.value.set(world.gulls.x, world.gulls.y, world.gulls.z);
      gU.uT.value = wt;
      const p = world.plane;
      plane.position.set(p.x, p.y + Math.sin(wt * 0.5) * 0.8, p.z);
      const arr = bannerGeo.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) { const u = (17 - bBase[i]) / 34; arr[i + 2] = Math.sin(bBase[i] * 0.5 + wt * 7) * 0.5 * u; arr[i + 1] = bBase[i + 1] + Math.sin(bBase[i] * 0.33 + wt * 5) * 0.25 * u; }
      bannerGeo.attributes.position.needsUpdate = true;
      ship.position.set(world.ship.x, 0, 980);
      for (let i = 0; i < N_BUOY; i++) {
        const bu = world.buoys[i], y = sea.height(bu.x, bu.z);
        bu.y = y;
        e4.set(Math.sin(wt * 1.3 + i * 2.1) * 0.12, i, Math.cos(wt * 1.1 + i * 1.7) * 0.12);
        m4.compose(v4.set(bu.x, y, bu.z), q4.setFromEuler(e4), s4);
        buoys.setMatrixAt(i, m4);
        if (Math.sin(wt * 2.4 + i * 0.8) > 0.6) fx.star(bu.x, y + 2.0, bu.z, 0.9 + Math.hypot(bu.x - camera.position.x, bu.z - camera.position.z) * 0.012, 6, 2.2, 1, 0.03);
      }
      buoys.instanceMatrix.needsUpdate = true;
    },
    setSun(v) { gU.uSunDir.value.copy(v); },
    dispose() { for (const o of owned) o.dispose(); },
  };
}
