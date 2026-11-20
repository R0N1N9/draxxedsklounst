// TOY BOX — everything that moves on the rug: the two plastic riflemen (they hop, kneel,
// tumble and come apart), their lasers and pellets, the wind-up copters, sparks and splinters.
import { clamp, damp, lerp, TAU } from '../../kit.js';
import { SPOT_R, FIG, MUZZLE, gunY } from './world.js';

const RIBBON_VERT = 'attribute vec2 aUv; varying vec2 vU; void main() { vU = aUv; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }';
const RIBBON_FRAG = `precision highp float; uniform vec3 uCol; uniform float uA; uniform float uFade; varying vec2 vU;
void main() {
  float across = 1.0 - abs(vU.y * 2.0 - 1.0);
  float along = uFade > 0.5 ? vU.x * vU.x : uFade < -0.5 ? 1.0 - vU.x : 1.0;
  float core = smoothstep(0.55, 1.0, across);
  gl_FragColor = vec4((uCol * pow(across, 1.5) + vec3(core) * 1.5) * along * uA, 1.0);
}`;
const RING_FRAG = `precision highp float; uniform vec3 uCol; uniform float uFill, uT, uMe, uLit; varying vec2 vU;
void main() {
  vec2 p = vU * 2.0 - 1.0; float r = length(p), a = atan(p.y, p.x);
  float ring = smoothstep(0.6, 0.63, r) * (1.0 - smoothstep(0.68, 0.71, r));
  float f = fract(a / 6.2832 + 0.25);
  float lit = f < uFill ? 1.0 : 0.18;
  // The local player's ring also has four ticks that turn; the rival's is plain.
  float ticks = uMe * smoothstep(0.76, 0.79, r) * (1.0 - smoothstep(0.9, 0.94, r)) * step(0.86, abs(sin((a + uT * 1.2) * 2.0)));
  float glow = (1.0 - smoothstep(0.0, 0.6, r)) * 0.05 * (uMe + uLit);
  gl_FragColor = vec4(mix(uCol, vec3(1.0, 0.9, 0.7), uLit * 0.6) * (ring * lit * (1.3 + uLit) + ticks * 1.2 + glow), 1.0);
}`;
const POINT_VERT = 'attribute vec4 aCol; attribute float aSize; uniform float uPx; varying vec4 vC; void main() { vC = aCol; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); gl_PointSize = max(1.0, aSize * uPx); }';
const POINT_FRAG = 'precision highp float; uniform float uSoft; varying vec4 vC; void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float a = mix(step(d, 1.0), 1.0 - smoothstep(0.0, 1.0, d), uSoft); if (a < 0.02) discard; gl_FragColor = vec4(vC.rgb, vC.a * a); }';

export function buildActors(THREE, room, toys, colors, me, Q, sfx) {
  const scene = room.scene, own = [];
  const keep = (x) => { own.push(x); return x; };
  const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), ax = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);
  const hdr = (hex, k) => new THREE.Color(hex).multiplyScalar(k);

  // ---- ribbons: flat strips of light lying in the air (lasers, tracers) ----
  function ribbon(color, fade) {
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    g.setAttribute('aUv', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 1, 0, 1, 1]), 2));
    g.setIndex([0, 2, 1, 1, 2, 3]);
    const mat = keep(new THREE.ShaderMaterial({ vertexShader: RIBBON_VERT, fragmentShader: RIBBON_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uCol: { value: color }, uA: { value: 1 }, uFade: { value: fade } } }));
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false; m.visible = false; m.renderOrder = 8;
    scene.add(m);
    const p = g.attributes.position;
    return {
      m, mat,
      set(x0, y0, z0, x1, y1, z1, w, a) {
        if (!(x0 + y0 + z0 + x1 + z1 + w === x0 + y0 + z0 + x1 + z1 + w)) { m.visible = false; return; } // never hand the GPU a NaN
        const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1, nx = (-dz / l) * w, nz = (dx / l) * w;
        p.setXYZ(0, x0 - nx, y0, z0 - nz); p.setXYZ(1, x0 + nx, y0, z0 + nz); p.setXYZ(2, x1 - nx, y1, z1 - nz); p.setXYZ(3, x1 + nx, y1, z1 + nz);
        p.needsUpdate = true;
        mat.uniforms.uA.value = a;
        m.visible = a > 0.005;
      },
      hide() { m.visible = false; },
    };
  }

  // ---- the riflemen ----
  const ringGeo = keep(new THREE.PlaneGeometry(3.3, 3.3).rotateX(-Math.PI / 2));
  const dotGeo = keep(new THREE.SphereGeometry(0.13, 10, 8));
  const men = [0, 1].map((i) => {
    const col = new THREE.Color(colors[i]);
    const plastic = room.patch(Q.rich
      ? new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.4, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.25, emissive: col.clone().multiplyScalar(0.05) })
      : Q.pbr ? new THREE.MeshStandardMaterial({ color: col, roughness: 0.36, metalness: 0, emissive: col.clone().multiplyScalar(0.07) })
        : new THREE.MeshLambertMaterial({ color: col, vertexColors: true, emissive: col.clone().multiplyScalar(0.1) })); // (white vertex colours: it shares the toys' shader)
    // A soldier behind a block still shows, as a flat silhouette. The stencil keeps that
    // silhouette off the soldier's own body (its far arm is "behind" its chest too).
    plastic.stencilWrite = true; plastic.stencilRef = 1; plastic.stencilFunc = THREE.AlwaysStencilFunc; plastic.stencilZPass = THREE.ReplaceStencilOp;
    const ghost = keep(new THREE.MeshBasicMaterial({ color: col.clone().lerp(new THREE.Color('#ffffff'), 0.2), transparent: true, opacity: 0.55, depthFunc: THREE.GreaterDepth, depthWrite: false, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc }));
    const root = new THREE.Group(), pivot = new THREE.Group(), poses = [toys.stand, toys.kneel].map((geo) => {
      const m = new THREE.Mesh(geo, plastic), x = new THREE.Mesh(geo, ghost);
      m.castShadow = true; m.receiveShadow = true; m.position.y = x.position.y = -0.85; x.renderOrder = 4;
      pivot.add(m, x);
      return { m, x };
    });
    pivot.position.y = 0.85;
    root.add(pivot);
    scene.add(root);
    const ringMat = keep(new THREE.ShaderMaterial({ vertexShader: 'varying vec2 vU; void main() { vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: RING_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uCol: { value: hdr(colors[i], 1.0) }, uFill: { value: 1 }, uT: { value: 0 }, uMe: { value: i === me ? 1 : 0 }, uLit: { value: 0 } } }));
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.renderOrder = 2;
    scene.add(ring);
    const beam = ribbon(hdr(colors[i], 2.2), 0), stub = ribbon(hdr(colors[i], 2.2), -1), bounce = ribbon(hdr(colors[i], 1.5), -1);
    const dot = new THREE.Mesh(dotGeo, keep(new THREE.MeshBasicMaterial({ color: hdr(colors[i], 5).lerp(new THREE.Color(5, 5, 5), 0.35) })));
    dot.visible = false; scene.add(dot);
    // The pieces it comes apart into.
    const bits = toys.pieces.map((pc) => { const m = new THREE.Mesh(pc.geo, plastic); m.castShadow = true; m.visible = false; scene.add(m); return { m, r: pc.r, c: pc.c, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, rest: false }; });
    for (let k = 0; k < (Q.rich ? 16 : 8); k++) { const m = new THREE.Mesh(toys.shard, plastic); m.castShadow = true; m.visible = false; scene.add(m); bits.push({ m, r: 0.06, c: null, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, rest: false }); }
    // The hit's shock ring: a flat wave of the victim's colour that runs out across the floor.
    const wave = new THREE.Mesh(ringGeo, keep(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uCol: { value: hdr(colors[i], 2.4) }, uT: { value: 0 } },
      vertexShader: 'varying vec2 vU; void main() { vU = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'precision highp float; uniform vec3 uCol; uniform float uT; varying vec2 vU;\nvoid main() { float r = length(vU), w = mix(0.1, 0.03, uT); float band = smoothstep(1.0 - w * 2.0, 1.0 - w, r) * (1.0 - smoothstep(1.0 - w, 1.0, r)); gl_FragColor = vec4(uCol * band * pow(1.0 - uT, 1.5), 1.0); }',
    })));
    wave.visible = false; wave.renderOrder = 3; scene.add(wave);
    return { i, plastic, root, pivot, poses, ring, ringMat, beam, stub, bounce, dot, bits, wave, waveT: 0, burst: false, squash: 0, land: 0 };
  });

  // ---- pellets: a hot bead, its streak, and its own little shadow ----
  const pelGeo = keep(new THREE.SphereGeometry(0.2, 10, 8));
  const pellets = [];
  for (let k = 0; k < 6; k++) {
    const m = new THREE.Mesh(pelGeo, keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4, 4) })));
    m.castShadow = true; m.visible = false; scene.add(m);
    pellets.push({ m, tail: ribbon(new THREE.Color(1, 1, 1), 1) });
  }

  // ---- copters ----
  const coneGeo = keep(new THREE.ConeGeometry(SPOT_R, 1, 28, 1, true).translate(0, -0.5, 0));
  const discGeo = keep(new THREE.CircleGeometry(1.55, 24).rotateX(-Math.PI / 2));
  const copters = [0, 1].map((i) => {
    const g = new THREE.Group(), body = new THREE.Mesh(toys.copter, room.std({ color: new THREE.Color(colors[i]), vertexColors: true, roughness: 0.35, emissive: new THREE.Color(colors[i]).multiplyScalar(0.25) }));
    const rotor = new THREE.Mesh(toys.rotor, room.M.paint), key = new THREE.Mesh(toys.key, room.M.paint);
    // A spinning rotor is a blur, not a cross: two soft smears that turn, and a faint rim.
    const disc = new THREE.Mesh(discGeo, keep(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uSpin: { value: 0 }, uA: { value: 1 } },
      vertexShader: 'varying vec2 vU; void main() { vU = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `precision highp float; uniform float uSpin, uA; varying vec2 vU;
void main() {
  float r = length(vU), a = atan(vU.y, vU.x) - uSpin;
  float smear = pow(abs(cos(a)), 6.0) * 0.5 + pow(abs(cos(a + 1.5708)), 6.0) * 0.5;
  float rim = smoothstep(0.84, 0.95, r) * (1.0 - smoothstep(0.95, 1.0, r));
  float alpha = (smear * 0.32 * smoothstep(0.1, 0.3, r) + rim * 0.22 + 0.05) * (1.0 - smoothstep(0.97, 1.0, r)) * uA;
  gl_FragColor = vec4(vec3(0.86, 0.9, 0.95), alpha);
}`,
    })));
    const lens = new THREE.Mesh(dotGeo, keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 10, 12) })));
    body.castShadow = rotor.castShadow = true;
    rotor.position.y = 0.78; disc.position.y = 0.8; key.position.set(-0.1, 0, 0.42); lens.position.set(0.25, -0.5, 0); lens.scale.setScalar(1.6);
    g.add(body, rotor, key, disc, lens);
    g.visible = false;
    scene.add(g);
    const cone = new THREE.Mesh(coneGeo, keep(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uA: { value: 0 } },
      vertexShader: 'varying float vY; void main() { vY = -position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'precision highp float; uniform float uA; varying float vY; void main() { gl_FragColor = vec4(vec3(0.75, 0.86, 1.0) * uA * (0.045 + 0.17 * pow(1.0 - vY, 2.0)), 1.0); }',
    })));
    cone.visible = false; cone.renderOrder = 7; scene.add(cone);
    return { g, rotor, key, cone, disc };
  });

  // ---- particles: sparks (additive), chips (opaque flecks that bounce), puffs (soft) ----
  function points(max, soft, blending) {
    const pos = new Float32Array(max * 3), col = new Float32Array(max * 4), size = new Float32Array(max);
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 4)); g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    const mat = keep(new THREE.ShaderMaterial({ vertexShader: POINT_VERT, fragmentShader: POINT_FRAG, transparent: true, depthWrite: false, blending, uniforms: { uPx: { value: 1 }, uSoft: { value: soft } } }));
    const m = new THREE.Points(g, mat);
    m.frustumCulled = false; m.renderOrder = 9;
    scene.add(m);
    const P = [];
    for (let i = 0; i < max; i++) P.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, age: 0, s0: 0, s1: 0, r: 1, g: 1, b: 1, a: 1, grav: 0, drag: 0, bounce: false });
    let next = 0;
    return {
      mat,
      emit(x, y, z, vx, vy, vz, life, s0, s1, r, g2, b, a, grav, drag, bounce) {
        const p = P[next];
        next = (next + 1) % max;
        p.on = true; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = life; p.age = 0; p.s0 = s0; p.s1 = s1; p.r = r; p.g = g2; p.b = b; p.a = a; p.grav = grav; p.drag = drag; p.bounce = !!bounce;
      },
      update(dt) {
        for (let i = 0; i < max; i++) {
          const p = P[i];
          if (p.on) {
            p.age += dt;
            if (p.age >= p.life) p.on = false;
            else {
              const k = Math.exp(-p.drag * dt);
              p.vx *= k; p.vz *= k; p.vy = p.vy * k - p.grav * dt;
              p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
              if (p.bounce && p.y < 0.05) { p.y = 0.05; p.vy = Math.abs(p.vy) * 0.4; p.vx *= 0.7; p.vz *= 0.7; }
            }
          }
          const u = p.on ? p.age / p.life : 1;
          pos[i * 3] = p.x; pos[i * 3 + 1] = p.on ? p.y : -99; pos[i * 3 + 2] = p.z;
          col[i * 4] = p.r; col[i * 4 + 1] = p.g; col[i * 4 + 2] = p.b; col[i * 4 + 3] = p.on ? p.a * (1 - u * u) : 0;
          size[i] = lerp(p.s0, p.s1, u);
        }
        g.attributes.position.needsUpdate = g.attributes.aCol.needsUpdate = g.attributes.aSize.needsUpdate = true;
      },
    };
  }
  const sparks = points(Q.rich ? 220 : 120, 1, THREE.AdditiveBlending), chips = points(Q.rich ? 160 : 90, 0, THREE.NormalBlending), puffs = points(48, 1, THREE.NormalBlending);
  const flash = new THREE.PointLight(new THREE.Color(1, 0.8, 0.5), 0, 12, 2);
  scene.add(flash);
  const R = Math.random, S = () => R() - 0.5;
  const rgb = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
  const pc = colors.map(rgb);

  const fx = {
    muzzle(x, y, z, dx, dz, owner) {
      flash.position.set(x + dx * 0.3, y + 0.5, z + dz * 0.3); flash.intensity = 16;
      sparks.emit(x, y, z, dx * 2, 0, dz * 2, 0.09, 1.9, 0.4, 3.5, 2.6, 1.4, 1, 0, 0);
      for (let k = 0; k < 7; k++) sparks.emit(x, y, z, dx * (6 + R() * 9) + S() * 5, 1 + R() * 3, dz * (6 + R() * 9) + S() * 5, 0.12 + R() * 0.16, 0.2, 0.05, 3 + pc[owner][0] * 2, 2 + pc[owner][1] * 2, 1 + pc[owner][2] * 2, 1, 8, 3);
      puffs.emit(x + dx * 0.3, y, z + dz * 0.3, dx * 1.6, 0.6, dz * 1.6, 0.5, 0.4, 1.3, 0.9, 0.88, 0.82, 0.3, -0.4, 2.5);
    },
    // A pellet met something: wood splinters and rings, books puff, plastic sparks.
    ping(x, y, z, nx, nz, mat) {
      const wood = mat === 'wood';
      for (let k = 0; k < (wood ? 7 : 3); k++) sparks.emit(x, y, z, nx * (2 + R() * 5) + S() * 6, R() * 5, nz * (2 + R() * 5) + S() * 6, 0.14 + R() * 0.2, 0.2, 0.04, 3.6, 2.8, 1.5, 1, 12, 2);
      const c = wood ? [0.82, 0.62, 0.36] : mat === 'soft' ? [0.9, 0.86, 0.74] : [0.93, 0.9, 0.82];
      for (let k = 0; k < 9; k++) chips.emit(x, y, z, nx * (1 + R() * 4) + S() * 4, 2 + R() * 5, nz * (1 + R() * 4) + S() * 4, 0.5 + R() * 0.5, 0.11 + R() * 0.1, 0.06, c[0] * (0.7 + R() * 0.4), c[1] * (0.7 + R() * 0.4), c[2] * (0.7 + R() * 0.4), 1, 22, 0.6, true);
      puffs.emit(x + nx * 0.2, y, z + nz * 0.2, nx * 1.2, 0.8, nz * 1.2, 0.55, 0.5, 1.6, c[0], c[1], c[2], 0.32, -0.3, 2.2);
      sparks.emit(x, y, z, 0, 0, 0, 0.08, 1.6, 0.2, 3, 2.6, 2, 1, 0, 0);
    },
    skid(x, z) { for (let k = 0; k < 3; k++) chips.emit(x, 0.1, z, S() * 3, 1 + R() * 2, S() * 3, 0.4, 0.09, 0.05, 0.8, 0.6, 0.35, 1, 20, 0.6, true); },
    hop(x, z) { puffs.emit(x, 0.08, z, S() * 0.6, 0.3, S() * 0.6, 0.35, 0.25, 0.7, 0.85, 0.7, 0.62, 0.16, -0.2, 2); },
    pop(x, y, z) {
      const toy = [[0.95, 0.3, 0.2], [0.2, 0.5, 0.9], [0.95, 0.75, 0.2], [0.3, 0.75, 0.4]];
      for (let k = 0; k < 12; k++) { const c = toy[k & 3], a = R() * TAU; sparks.emit(x, y, z, Math.cos(a) * (2 + R() * 4), 2 + R() * 5, Math.sin(a) * (2 + R() * 4), 0.4 + R() * 0.4, 0.3, 0.05, c[0] * 3, c[1] * 3, c[2] * 3, 1, 9, 1.5); }
      puffs.emit(x, y, z, 0, 0.6, 0, 0.5, 1.2, 2.6, 1, 0.97, 0.9, 0.3, 0, 1);
    },
    puff(x, y, z) { puffs.emit(x, y, z, S() * 0.3, 1.5 + R() * 0.5, S() * 0.3, 1.1, 0.35, 1.2, 0.95, 0.95, 0.97, 0.26, 0, 0.8); },
    glint(x, y, z) { sparks.emit(x, y, z, 0, 0, 0, 0.16, 1.0, 0.1, 3, 3, 3, 1, 0, 0); },

    // The hit: the figure is gone and its pieces are in the air, thrown along the shot.
    burst(i, x, z, yaw, dx, dz, kneel) {
      const s = men[i], cy = Math.cos(-yaw), sy = Math.sin(-yaw);
      if (s.burst) return;
      s.burst = true;
      s.root.visible = false;
      for (const b of s.bits) {
        const m = b.m, c = b.c;
        // three's Ry(t): x' = x cos t + z sin t, z' = -x sin t + z cos t
        if (c) m.position.set(x + (c.x * cy + c.z * sy) * FIG, Math.max(b.r, (c.y - (kneel ? 0.2 : 0)) * FIG), z + (-c.x * sy + c.z * cy) * FIG);
        else m.position.set(x + S() * 0.5, 0.4 + R() * 1.0, z + S() * 0.5);
        m.rotation.set(0, -yaw, 0);
        if (!c) { m.rotation.set(R() * 6, R() * 6, R() * 6); m.scale.set(0.6 + R() * 1.4, 0.5 + R() * 1.2, 0.5 + R()); } else m.scale.setScalar(FIG);
        m.visible = true;
        const up = c ? c.y : 0.8, sp = 5 + R() * 6;
        b.vx = dx * sp + S() * 7; b.vz = dz * sp + S() * 7; b.vy = 4 + R() * 5 + up * 3;
        b.wx = S() * 26; b.wy = S() * 18; b.wz = S() * 26; b.rest = false;
      }
      for (let k = 0; k < 26; k++) chips.emit(x, 0.5 + R() * 1.1, z, dx * (2 + R() * 8) + S() * 9, 2 + R() * 8, dz * (2 + R() * 8) + S() * 9, 0.7 + R() * 0.7, 0.16, 0.07, pc[i][0], pc[i][1], pc[i][2], 1, 24, 0.5, true);
      for (let k = 0; k < 16; k++) sparks.emit(x, 0.9, z, S() * 22, R() * 12, S() * 22, 0.2 + R() * 0.25, 0.26, 0.04, 3 + pc[i][0] * 3, 3 + pc[i][1] * 3, 3 + pc[i][2] * 3, 1, 14, 2);
      // flakes of the same plastic, and a few bright ones that catch the light
      for (let k = 0; k < 22; k++) { const a = R() * TAU, v = 3 + R() * 9, w = k < 6 ? 1.8 : 1; chips.emit(x, 0.8 + R() * 0.8, z, Math.cos(a) * v + dx * 4, 4 + R() * 9, Math.sin(a) * v + dz * 4, 0.9 + R() * 0.8, 0.24, 0.12, pc[i][0] * w, pc[i][1] * w, pc[i][2] * w, 1, 26, 0.4, true); }
      sparks.emit(x, 1, z, 0, 0, 0, 0.12, 3, 0.6, 2.2, 2, 1.7, 1, 0, 0);
      flash.position.set(x, 2, z); flash.intensity = 20;
      s.wave.position.set(x, 0.05, z); s.wave.visible = true; s.waveT = 0;
    },

    // p: the simulation's soldier. aim: { on, x1, z1, bx, bz, hasB, full } — where its laser goes.
    soldier(p, dt, wt, aim, live) {
      const s = men[p.i];
      if (s.burst) { s.ring.visible = false; s.beam.hide(); s.stub.hide(); s.bounce.hide(); s.dot.visible = false; return; }
      const sp = Math.hypot(p.vx, p.vz), run = clamp(sp / 5, 0, 1), k = p.k;
      // Plastic men do not walk: they hop and rock, like a hand is moving them.
      const hop = Math.abs(Math.sin(p.hop)) * 0.2 * run, rolling = p.roll >= 0;
      const air = rolling ? Math.sin(p.roll * Math.PI) * 0.95 : hop;
      if (!rolling && s.land > 0.06 && air < 0.03 && run > 0.2) { s.squash = 1; if (p.i === me || Math.random() < 0.5) sfx.hop(p.x, p.i === me); }
      s.land = air;
      s.squash = Math.max(0, s.squash - dt * 9);
      const kneelSq = Math.sin(clamp(k, 0, 1) * Math.PI) * 0.2, sq = 1 - s.squash * 0.14 - kneelSq - p.recoil * 0.05;
      s.root.position.set(p.x, air, p.z);
      s.root.scale.set(FIG * (1 + (1 - sq) * 0.5), FIG * sq, FIG * (1 + (1 - sq) * 0.5));
      q1.setFromAxisAngle(yAxis, -p.shotA);
      if (rolling) { ax.set(p.rdz, 0, -p.rdx); q2.setFromAxisAngle(ax, p.roll * TAU); q1.premultiply(q2); }
      else {
        // rock from side to side with each hop, lean back with the recoil, wobble when shoved
        ax.set(Math.cos(p.a), 0, Math.sin(p.a));
        q2.setFromAxisAngle(ax, Math.sin(p.hop) * 0.14 * run + Math.sin(wt * 21) * p.wob * 0.2 + Math.sin(wt * 1.7 + p.i * 2) * 0.012);
        q1.premultiply(q2);
        ax.set(Math.sin(p.a), 0, -Math.cos(p.a));
        q2.setFromAxisAngle(ax, p.recoil * 0.22 - run * 0.08);
        q1.premultiply(q2);
      }
      s.pivot.quaternion.copy(q1);
      s.poses[0].m.visible = s.poses[0].x.visible = k < 0.5;
      s.poses[1].m.visible = s.poses[1].x.visible = k >= 0.5;
      s.ring.visible = true;
      s.ring.position.set(p.x, 0.03, p.z);
      const u = s.ringMat.uniforms;
      u.uT.value = wt; u.uFill.value = p.reload > 0 ? 1 - p.reload / p.reloadMax : 1; u.uLit.value = p.lit;
      // The laser: a stub from the hip, the whole line (and its bounce) when braced.
      const y = gunY(k), mx = p.x + Math.cos(p.shotA) * MUZZLE, mz = p.z + Math.sin(p.shotA) * MUZZLE;
      const a = aim.on && !rolling ? (p.reload > 0 ? 0.25 : 1) * (0.82 + 0.18 * Math.sin(wt * 40 + p.i)) : 0, w = aim.w;
      if (a > 0 && aim.full > 0.02) {
        s.beam.set(mx, y, mz, aim.x1, y, aim.z1, w, a * aim.full * 0.75);
        if (aim.hasB) s.bounce.set(aim.x1, y, aim.z1, aim.bx, y, aim.bz, w, a * aim.full * 0.5); else s.bounce.hide();
        s.dot.visible = true;
        s.dot.position.set(aim.hasB ? aim.bx : aim.x1, y, aim.hasB ? aim.bz : aim.z1);
        s.dot.scale.setScalar((0.8 + 0.3 * Math.sin(wt * 30)) * aim.full * Math.max(1, w * 9));
      } else { s.beam.hide(); s.bounce.hide(); s.dot.visible = false; }
      if (a > 0 && aim.full < 0.98 && aim.stub) {
        const l = Math.min(aim.len, 7.5);
        s.stub.set(mx, y, mz, mx + Math.cos(p.shotA) * l, y, mz + Math.sin(p.shotA) * l, w, a * (1 - aim.full) * 0.8);
      } else s.stub.hide();
    },

    pellet(k, b) {
      const v = pellets[k];
      if (!b.on) { v.m.visible = false; v.tail.hide(); return; }
      v.m.visible = true;
      v.m.position.set(b.x, b.y, b.z);
      const c = pc[b.owner], l = Math.min(3.2, b.age * b.sp), sp = b.sp || 1;
      v.tail.mat.uniforms.uCol.value.setRGB(1.5 + c[0] * 3, 1.5 + c[1] * 3, 1.5 + c[2] * 3);
      v.tail.set(b.x - (b.vx / sp) * l, b.y, b.z - (b.vz / sp) * l, b.x, b.y, b.z, 0.26, 1);
    },

    // c: { on (0 idle, 1 out, 2 over them, 3 running down), x, y, z, yaw, t, lit }
    copter(i, c, dt, wt) {
      const v = copters[i];
      v.g.visible = c.on > 0;
      v.cone.visible = c.on > 0 && c.lit > 0.02;
      if (!v.g.visible) return;
      const spin = c.on === 3 ? clamp(1 - c.t / 1.2, 0, 1) : 1;
      v.g.position.set(c.x, c.y + Math.sin(wt * 7 + i) * 0.08 * spin, c.z);
      v.g.rotation.set(Math.sin(wt * 5) * 0.05, -c.yaw, c.tilt * 0.3 + (1 - spin) * 0.5);
      v.rotor.rotation.y += dt * 46 * spin;
      v.key.rotation.z -= dt * 3 * spin;
      // Flat out, the blades are only a blur; winding down, they come back as the blur fades.
      v.rotor.visible = spin < 0.6;
      v.disc.visible = spin > 0.15;
      v.disc.material.uniforms.uSpin.value = wt * 9;
      v.disc.material.uniforms.uA.value = clamp((spin - 0.15) / 0.45, 0, 1);
      if (v.cone.visible) { v.cone.position.set(c.x, c.y - 0.5, c.z); v.cone.scale.set(1, c.y - 0.5, 1); v.cone.material.uniforms.uA.value = c.lit; }
    },

    update(dt, pxPerUnit, pixelRatio) {
      flash.intensity = Math.max(0, flash.intensity - dt * 220);
      const px = pxPerUnit * pixelRatio;
      sparks.mat.uniforms.uPx.value = chips.mat.uniforms.uPx.value = puffs.mat.uniforms.uPx.value = px;
      sparks.update(dt); chips.update(dt); puffs.update(dt);
      // Plastic in flight: gravity, a floor, and less spin with every bounce.
      for (const s of men) {
        if (!s.burst) continue;
        if (s.wave.visible) {
          s.waveT += dt / 0.75;
          s.wave.visible = s.waveT < 1;
          s.wave.scale.setScalar(0.4 + Math.sqrt(s.waveT) * 4.6);
          s.wave.material.uniforms.uT.value = Math.min(1, s.waveT);
        }
        for (const b of s.bits) {
          if (b.rest) continue;
          const m = b.m;
          b.vy -= 30 * dt;
          m.position.x += b.vx * dt; m.position.y += b.vy * dt; m.position.z += b.vz * dt;
          if (m.position.y < b.r) {
            m.position.y = b.r;
            if (b.vy < -2.2) { sfx.clatter(m.position.x, Math.min(1, -b.vy / 12)); if (Math.random() < 0.5) fx.skid(m.position.x, m.position.z); }
            b.vy = -b.vy * 0.42; b.vx *= 0.68; b.vz *= 0.68; b.wx *= 0.6; b.wy *= 0.7; b.wz *= 0.6;
            if (Math.abs(b.vy) < 0.9 && Math.hypot(b.vx, b.vz) < 0.5) { b.rest = true; continue; }
          }
          const w = Math.hypot(b.wx, b.wy, b.wz);
          if (w > 0.01) { q2.setFromAxisAngle(ax.set(b.wx / w, b.wy / w, b.wz / w), w * dt); m.quaternion.premultiply(q2); }
        }
      }
    },
    // Put a soldier back together (never needed in a round, but the kill may be un-called online).
    men, copters,
    dispose() { for (const x of own) x.dispose(); },
  };
  return fx;
}
