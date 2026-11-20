// INK CITY — everything that moves and is not a sniper. Four instanced batches are
// refilled every frame (boxes, cel puffs, ink stars, spiky flashes); on top of them run
// the pooled effects of the duel (smoke, chips, stars) and the city's own life (traffic,
// the el train, pigeons, newspapers on the wind, chimney steam). Nothing allocates after build.
import { lerp, TAU } from '../../kit.js';
import { rgb } from './mats.js';

function starGeo(THREE, n, inner, wobble) {
  const pos = [0, 0, 0], idx = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * TAU + Math.PI / 2, r = (i & 1 ? inner : 1) * (1 + (wobble ? Math.sin(i * 12.9898) * wobble : 0));
    pos.push(Math.cos(a) * r, Math.sin(a) * r, 0);
  }
  for (let i = 0; i < n * 2; i++) idx.push(0, 1 + i, 1 + ((i + 1) % (n * 2)));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((v, i) => (i % 3 === 2 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

export function buildFx(THREE, mats, W) {
  const group = new THREE.Group();
  const o = new THREE.Object3D(), qa = new THREE.Quaternion(), va = new THREE.Vector3();
  const Z = new THREE.Vector3(0, 0, 1), camQ = new THREE.Quaternion();
  const geos = [], batches = [];

  // An instanced mesh that is refilled from scratch each frame.
  function dyn(geo, cap, opt) {
    geos.push(geo);
    const col = new Float32Array(cap * 3), kind = new Float32Array(cap);
    const aCol = new THREE.InstancedBufferAttribute(col, 3), aKind = new THREE.InstancedBufferAttribute(kind, 1);
    aCol.setUsage(THREE.DynamicDrawUsage); aKind.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aCol', aCol); geo.setAttribute('aKind', aKind);
    const mesh = new THREE.InstancedMesh(geo, mats.make({ inst: true, ...opt }), cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.receiveShadow = !!(opt && opt.shadow);
    group.add(mesh);
    const b = {
      mesh, n: 0,
      put(m, r, g, bl, k) {
        if (b.n >= cap) return;
        m.toArray(mesh.instanceMatrix.array, b.n * 16);
        col[b.n * 3] = r; col[b.n * 3 + 1] = g; col[b.n * 3 + 2] = bl; kind[b.n] = k;
        b.n++;
      },
      end() { mesh.count = b.n; mesh.instanceMatrix.needsUpdate = true; aCol.needsUpdate = true; aKind.needsUpdate = true; },
    };
    batches.push(b);
    return b;
  }
  const boxes = dyn(new THREE.BoxGeometry(1, 1, 1), 260, { shadow: true });
  const puffs = dyn(new THREE.SphereGeometry(1, 12, 9), 150, { shadow: true });
  const stars = dyn(starGeo(THREE, 5, 0.46, 0), 56, { side: THREE.DoubleSide });
  const bursts = dyn(starGeo(THREE, 9, 0.5, 0.16), 24, { side: THREE.DoubleSide });

  function box(x, y, z, sx, sy, sz, ry, rx, rz, r, g, b, k) {
    o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(rx, ry, rz, 'YXZ'); o.updateMatrix();
    boxes.put(o.matrix, r, g, b, k);
  }
  /** An unlit streak from a to b, w thick. */
  function beam(x0, y0, z0, x1, y1, z1, w, r, g, b) {
    va.set(x1 - x0, y1 - y0, z1 - z0);
    const l = va.length();
    if (l < 1e-4) return;
    o.quaternion.setFromUnitVectors(Z, va.multiplyScalar(1 / l));
    o.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); o.scale.set(w, w, l); o.updateMatrix();
    boxes.put(o.matrix, r, g, b, 5);
  }
  function facing(batch, x, y, z, s, spin, r, g, b) {
    o.quaternion.copy(camQ).multiply(qa.setFromAxisAngle(Z, spin));
    o.position.set(x, y, z); o.scale.set(s, s, s); o.updateMatrix();
    batch.put(o.matrix, r, g, b, 5);
  }

  // ---- pools ----
  const mk = (n, f) => { const a = []; for (let i = 0; i < n; i++) a.push(f(i)); return a; };
  const P = mk(120, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r0: 0, r1: 0, age: 0, life: 1, r: 1, g: 1, b: 1 }));
  const S = mk(48, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1, spin: 0, w: 0, age: 0, life: 1, grav: 0, r: 1, g: 1, b: 1 }));
  const F = mk(10, () => ({ on: false, x: 0, y: 0, z: 0, s: 1, age: 0, life: 0.1, spin: 0, r: 1, g: 1, b: 1 }));
  const C = mk(44, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.1, rx: 0, ry: 0, w: 0, age: 0, life: 1, r: 1, g: 1, b: 1 }));
  let pi = 0, si = 0, fi = 0, ci = 0;

  const api = {
    group, box, beam,
    /** A cel cloud ball: grows from r0 to r1 over its life, pops in, shrinks out. */
    puff(x, y, z, vx, vy, vz, r0, r1, life, hex) {
      const p = P[pi]; pi = (pi + 1) % P.length;
      const c = typeof hex === 'string' ? rgb(hex) : hex;
      p.on = true; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.r0 = r0; p.r1 = r1; p.age = 0; p.life = life; p.r = c[0]; p.g = c[1]; p.b = c[2];
    },
    star(x, y, z, vx, vy, vz, s, life, grav, c) {
      const p = S[si]; si = (si + 1) % S.length;
      p.on = true; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.s = s; p.age = 0; p.life = life; p.grav = grav; p.spin = Math.random() * TAU; p.w = (Math.random() - 0.5) * 14; p.r = c[0]; p.g = c[1]; p.b = c[2];
    },
    /** A spiky burst that faces the reader: muzzle flashes, impacts, the glint of a scope. */
    flash(x, y, z, s, life, c) {
      const p = F[fi]; fi = (fi + 1) % F.length;
      p.on = true; p.x = x; p.y = y; p.z = z; p.s = s; p.age = 0; p.life = life; p.spin = Math.random() * TAU; p.r = c[0]; p.g = c[1]; p.b = c[2];
    },
    chip(x, y, z, vx, vy, vz, s, life, c) {
      const p = C[ci]; ci = (ci + 1) % C.length;
      p.on = true; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.s = s; p.age = 0; p.life = life; p.rx = Math.random() * 6; p.ry = Math.random() * 6; p.w = 6 + Math.random() * 10; p.r = c[0]; p.g = c[1]; p.b = c[2];
    },
    /** POOF! A hand-drawn cloud of n balls that holds for `life` seconds. */
    cloud(x, y, z, r, life) {
      for (let i = 0; i < 15; i++) {
        const a = Math.random() * TAU, e = (Math.random() - 0.35) * 1.3, d = r * (0.25 + Math.random() * 0.45), rr = r * (0.34 + Math.random() * 0.2);
        api.puff(x + Math.cos(a) * Math.cos(e) * d, y + Math.sin(e) * d * 0.7, z + Math.sin(a) * Math.cos(e) * d, Math.cos(a) * 0.12, 0.03, Math.sin(a) * 0.12, rr * 0.9, rr * 1.12, life * (0.86 + Math.random() * 0.14), i % 3 ? '#f1e8ff' : '#e3d2f7');
      }
    },
    /** Everything a bullet knocks loose: a burst, chips, a little dust, and the pigeons leave. */
    impact(x, y, z, nx, ny, nz, c, dust) {
      api.flash(x + nx * 0.15, y + ny * 0.15, z + nz * 0.15, 0.7, 0.12, WHITE);
      for (let i = 0; i < 6; i++) api.chip(x, y, z, nx * 3 + (Math.random() - 0.5) * 5, ny * 3 + Math.random() * 4.5, nz * 3 + (Math.random() - 0.5) * 5, 0.07 + Math.random() * 0.1, 0.9, c);
      for (let i = 0; i < 2; i++) api.puff(x + nx * 0.2, y + ny * 0.2, z + nz * 0.2, nx * 1.2 + (Math.random() - 0.5), 0.8 + ny, nz * 1.2 + (Math.random() - 0.5), 0.16, 0.5, 0.5 + Math.random() * 0.2, dust || '#e9dcc8');
      api.scare(x, y, z, 11);
    },
    scare(x, y, z, r) {
      for (const b of birds) if (!b.fly && Math.hypot(b.x - x, b.y - y, b.z - z) < r) takeOff(b);
    },
    setCamera(camera) { camQ.copy(camera.quaternion); },
    dispose() { for (const g of geos) g.dispose(); },
  };
  const WHITE = [1, 0.97, 0.86];

  // ---- the city's own life ----
  const rnd = Math.random;
  const cars = mk(16, (i) => ({ lane: i & 1 ? 1 : -1, x0: rnd() * 300, v: 9 + rnd() * 7, c: rgb(['#ffc93c', '#e2413a', '#2bb3a3', '#f0dcb4', '#ffc93c', '#5d6fae'][i % 6]) }));
  const papers = mk(9, (i) => ({ x0: rnd() * 120, z: (rnd() - 0.5) * 110, y: 27 + rnd() * 15, v: 2.5 + rnd() * 3, ph: rnd() * 9 }));
  const perches = [];
  for (const r of W.roofs) for (let k = 0; k < 2; k++) {
    const onX = rnd() < 0.5, u = rnd();
    perches.push(onX ? { x: lerp(r.x0 + 1, r.x1 - 1, u), y: r.h + 0.5, z: rnd() < 0.5 ? r.z0 + 0.18 : r.z1 - 0.18 } : { x: rnd() < 0.5 ? r.x0 + 0.18 : r.x1 - 0.18, y: r.h + 0.5, z: lerp(r.z0 + 1, r.z1 - 1, u) });
  }
  const birds = mk(Math.min(26, perches.length), (i) => { const p = perches[i]; return { x: p.x, y: p.y, z: p.z, fly: false, t: 0, dur: 1, ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, yaw: rnd() * 6, ph: rnd() * 6 }; });
  function takeOff(b) {
    const p = perches[(rnd() * perches.length) | 0];
    b.fly = true; b.t = 0; b.ax = b.x; b.ay = b.y; b.az = b.z; b.bx = p.x; b.by = p.y; b.bz = p.z;
    b.dur = 2.2 + Math.hypot(p.x - b.x, p.z - b.z) / 14 + rnd();
  }
  const chims = W.props.filter((p) => p.kind === 'chim');
  let steamT = 0, trainSeen = false;
  const TRAIN = { period: 23, speed: 34, cars: 5, len: 13 };
  /** Where the el train's nose is at time T (it passes through the canyon every 23 s), or null. */
  api.train = (T) => { const u = (T + 9) % TRAIN.period, x = -230 + u * TRAIN.speed; return x < 320 ? x : null; };

  api.update = (dt, T, wt, cam) => {
    for (const b of batches) b.n = 0;
    // traffic
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i], x = ((c.x0 + T * c.v) % 300) - 150;
      box(x * c.lane, 0.75, c.lane * 3.4, 4.4, 1.1, 1.9, 0, 0, 0, c.c[0], c.c[1], c.c[2], 0);
      box(x * c.lane - 0.3 * c.lane, 1.55, c.lane * 3.4, 2.3, 0.7, 1.7, 0, 0, 0, 0.16, 0.13, 0.3, 0);
    }
    // the el
    const tx = api.train(T);
    if (tx !== null) for (let i = 0; i < TRAIN.cars; i++) {
      const x = tx - i * (TRAIN.len + 0.8);
      if (x < -150 || x > 150) continue;
      box(x, 13.1, 0, TRAIN.len, 3.1, 3, 0, 0, 0, i ? 0.17 : 0.89, i ? 0.7 : 0.25, i ? 0.64 : 0.23, 0);
      box(x, 13.6, 0, TRAIN.len - 1.6, 0.9, 3.08, 0, 0, 0, 1, 0.91, 0.63, 5);
      box(x, 14.75, 0, TRAIN.len - 0.4, 0.22, 2.6, 0, 0, 0, 0.94, 0.86, 0.7, 0);
    }
    // newspapers on the wind
    for (let i = 0; i < papers.length; i++) {
      const p = papers[i], x = ((p.x0 + wt * p.v) % 120) - 60, a = wt * 2.3 + p.ph;
      box(x, p.y + Math.sin(a * 0.7) * 1.4, p.z + Math.sin(a * 0.4) * 3, 0.5, 0.012, 0.36, a * 0.6, a, a * 0.8, 0.99, 0.95, 0.84, 0);
    }
    // pigeons
    for (let i = 0; i < birds.length; i++) {
      const b = birds[i];
      if (b.fly) {
        b.t += dt;
        const u = Math.min(1, b.t / b.dur), e = u * u * (3 - 2 * u), px = b.x, pz = b.z;
        b.x = lerp(b.ax, b.bx, e) + Math.sin(u * Math.PI) * Math.sin(b.ph) * 6; b.z = lerp(b.az, b.bz, e) + Math.sin(u * Math.PI) * Math.cos(b.ph) * 6;
        b.y = lerp(b.ay, b.by, e) + Math.sin(u * Math.PI) * (5 + (b.ph % 3));
        if (dt > 0) b.yaw = Math.atan2(b.x - px, b.z - pz);
        const f = Math.sin(wt * 26 + b.ph) * 0.9;
        box(b.x, b.y, b.z, 0.2, 0.16, 0.36, b.yaw, 0, 0, 0.8, 0.76, 0.9, 0);
        box(b.x + Math.cos(b.yaw) * 0.22, b.y + 0.04 + f * 0.1, b.z - Math.sin(b.yaw) * 0.22, 0.4, 0.03, 0.22, b.yaw, 0, f, 0.93, 0.9, 1, 0);
        box(b.x - Math.cos(b.yaw) * 0.22, b.y + 0.04 + f * 0.1, b.z + Math.sin(b.yaw) * 0.22, 0.4, 0.03, 0.22, b.yaw, 0, -f, 0.93, 0.9, 1, 0);
        if (u >= 1) { b.fly = false; b.x = b.bx; b.y = b.by; b.z = b.bz; }
      } else {
        const bob = Math.max(0, Math.sin(wt * 3 + b.ph * 7)) > 0.96 ? 0.04 : 0;
        box(b.x, b.y + 0.04, b.z, 0.2, 0.2, 0.34, b.yaw, 0, 0, 0.8, 0.76, 0.9, 0);
        box(b.x + Math.sin(b.yaw) * 0.16, b.y + 0.2 - bob, b.z + Math.cos(b.yaw) * 0.16, 0.12, 0.12, 0.14, b.yaw, 0, 0, 0.62, 0.58, 0.78, 0);
      }
    }
    // chimney steam (only where the reader is looking from)
    steamT -= dt;
    if (steamT <= 0 && chims.length && !W.erased) {
      steamT = 0.22;
      const c = chims[(rnd() * chims.length) | 0];
      if (Math.hypot(c.x - cam.position.x, c.z - cam.position.z) < 75) api.puff(c.x - 0.2 + rnd() * 0.4, c.y + c.h + 0.9, c.z, 0.5 + rnd() * 0.3, 0.9, 0.1, 0.22, 0.6, 2.4, '#fff3e6');
    }
    // pooled effects
    for (let i = 0; i < C.length; i++) {
      const p = C[i];
      if (!p.on) continue;
      p.age += dt;
      if (p.age >= p.life) { p.on = false; continue; }
      p.vy -= 16 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = 1 - p.age / p.life;
      box(p.x, p.y, p.z, p.s, p.s, p.s * 1.6, p.ry + p.age * p.w, p.rx + p.age * p.w * 0.7, 0, p.r, p.g, p.b, 0);
      if (k < 0) p.on = false;
    }
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      if (!p.on) continue;
      p.age += dt;
      if (p.age >= p.life) { p.on = false; continue; }
      const u = p.age / p.life, pop = Math.min(1, p.age / 0.16), back = 1 + 2.2 * Math.pow(pop - 1, 3) + 1.2 * Math.pow(pop - 1, 2);
      const out = u > 0.82 ? 1 - (u - 0.82) / 0.18 : 1, drag = Math.exp(-1.6 * dt);
      p.vx *= drag; p.vz *= drag; p.vy *= Math.exp(-0.5 * dt);
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const s = lerp(p.r0, p.r1, 1 - (1 - u) * (1 - u)) * back * out;
      o.position.set(p.x, p.y, p.z); o.scale.set(s, s * 0.92, s); o.rotation.set(0, 0, 0); o.updateMatrix();
      puffs.put(o.matrix, p.r, p.g, p.b, 0);
    }
    for (let i = 0; i < S.length; i++) {
      const p = S[i];
      if (!p.on) continue;
      p.age += dt;
      if (p.age >= p.life) { p.on = false; continue; }
      p.vy -= p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const u = p.age / p.life, s = p.s * Math.min(1, p.age / 0.06) * (u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1);
      facing(stars, p.x, p.y, p.z, s, p.spin + p.age * p.w, p.r, p.g, p.b);
    }
    for (let i = 0; i < F.length; i++) {
      const p = F[i];
      if (!p.on) continue;
      p.age += dt;
      if (p.age >= p.life) { p.on = false; continue; }
      const u = p.age / p.life, s = p.s * (0.55 + 0.75 * Math.sqrt(u)) * (u > 0.6 ? 1 - (u - 0.6) / 0.4 : 1);
      facing(bursts, p.x, p.y, p.z, s, p.spin, p.r, p.g, p.b);
      // a white heart, a hair nearer the reader so it wins the depth test
      va.set(0, 0, 0.06).applyQuaternion(camQ);
      facing(bursts, p.x + va.x, p.y + va.y, p.z + va.z, s * 0.52, p.spin + 0.35, 1, 1, 0.94);
    }
    // the train announces itself once per pass
    const near = tx !== null && Math.abs(tx - 30) < 60;
    api.trainNow = near && !trainSeen;
    trainSeen = near;
  };
  /** Call after everything that draws through box()/beam() this frame. */
  api.end = () => { for (const b of batches) b.end(); };
  api.trainNow = false;
  return api;
}
