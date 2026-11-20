// IRON AUTUMN — everything short-lived: smoke, dust and fire (lit billboards), sparks and
// clods (points), tracers, glows and glints, shell markers, scorch marks, flash lights.
// All pools are fixed-size; nothing here allocates after buildFx() returns.
//
// Two kinds of API: particles with a life of their own (smoke / spark / clod / flash /
// scorch), and "immediate" sprites that the game re-submits every frame between begin()
// and update() (glow / star / tracer / marker) — a glint or a bullet has no state here.
import { SUN } from './kitbash.js';

const SMOKE_VERT = `
attribute vec3 iPos; attribute vec4 iParam; attribute vec3 iCol;
uniform float uFogD; uniform vec3 uSunView;
varying vec2 vUv, vL; varying vec3 vCol; varying float vAlpha, vHeat, vFog, vSunAmt, vLit;
void main() {
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  float c = cos(iParam.y), s = sin(iParam.y);
  vec2 q = position.xy * iParam.x;
  mv.xy += vec2(q.x * c - q.y * s, q.x * s + q.y * c);
  gl_Position = projectionMatrix * mv;
  vUv = uv; vCol = iCol; vHeat = iParam.w;
  float depth = -mv.z;
  vAlpha = iParam.z * smoothstep(0.3, 2.2, depth); // never a hard quad in the lens
  vFog = 1.0 - exp(-uFogD * uFogD * depth * depth);
  vSunAmt = pow(max(dot(normalize(mv.xyz), uSunView), 0.0), 3.0);
  // The sun's direction in this quad's own (rotated) frame: one side of every billow is lit.
  vec2 l = normalize(uSunView.xy + vec2(1e-4, 0.0));
  vL = vec2(l.x * c + l.y * s, -l.x * s + l.y * c);
  // Below the long shadow of the west frontage nothing gets direct sun.
  float hs = 10.0 - (iPos.x + 30.0) * 0.3;
  vLit = smoothstep(hs - 3.0, hs + 3.0, iPos.y);
}`;
const SMOKE_FRAG = `
precision highp float;
uniform sampler2D uTex; uniform vec3 uSunCol, uAmb, uFog, uSunFog;
varying vec2 vUv, vL; varying vec3 vCol; varying float vAlpha, vHeat, vFog, vSunAmt, vLit;
void main() {
  float t = texture2D(uTex, vUv).a, a = min(1.0, t * 1.7) * vAlpha;
  if (a < 0.004) discard;
  float side = clamp(dot(vUv - 0.5, vL) * 1.9 + 0.5, 0.0, 1.0);
  vec3 col = vCol * (uAmb + uSunCol * side * vLit);
  col += vec3(5.0, 1.6, 0.3) * vHeat * t * t * 2.0;
  col = mix(col, mix(uFog, uSunFog, vSunAmt), vFog);
  gl_FragColor = vec4(col, a);
}`;
const GLOW_VERT = `
attribute vec3 iPos; attribute vec2 iParam; attribute vec3 iCol;
varying vec2 vUv; varying vec3 vCol;
void main() {
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  float c = cos(iParam.y), s = sin(iParam.y);
  vec2 q = position.xy * iParam.x;
  mv.xy += vec2(q.x * c - q.y * s, q.x * s + q.y * c);
  gl_Position = projectionMatrix * mv;
  vUv = uv; vCol = iCol;
}`;
const GLOW_FRAG = 'precision highp float; uniform sampler2D uTex; varying vec2 vUv; varying vec3 vCol; void main() { gl_FragColor = vec4(vCol * texture2D(uTex, vUv).a, 1.0); }';
const POINT_VERT = `
attribute vec4 aCol; attribute float aSize;
uniform float uScale; varying vec4 vCol;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.3), 1.0, 48.0);
  vCol = aCol;
}`;
const POINT_FRAG = `
precision highp float; varying vec4 vCol;
void main() {
  float a = 1.0 - smoothstep(0.45, 1.0, length(gl_PointCoord - 0.5) * 2.0);
  gl_FragColor = ADD;
}`;
const TRACER_VERT = `
attribute vec3 iA, iB; attribute vec4 iCol;
uniform float uMin; varying vec3 vCol; varying vec2 vQ;
void main() {
  vec3 a = (viewMatrix * vec4(iA, 1.0)).xyz, b = (viewMatrix * vec4(iB, 1.0)).xyz;
  vec3 p = mix(a, b, position.x);
  vec3 side = normalize(cross(b - a, p) + vec3(1e-5, 0.0, 0.0));
  // Never thinner than a couple of pixels, however far away: a bullet must stay visible.
  p += side * position.y * max(iCol.w, -p.z * uMin);
  gl_Position = projectionMatrix * vec4(p, 1.0);
  vCol = iCol.rgb; vQ = position.xy;
}`;
const TRACER_FRAG = `
precision highp float; varying vec3 vCol; varying vec2 vQ;
void main() {
  float across = 1.0 - abs(vQ.y) * 2.0;
  gl_FragColor = vec4(vCol * across * across * (0.15 + 0.85 * vQ.x * vQ.x), 1.0);
}`;
const MARK_VERT = `
attribute vec3 iPos; attribute vec3 iParam;
varying vec2 vP; varying vec2 vK;
void main() {
  vP = position.xz;
  vK = iParam.yz;
  gl_Position = projectionMatrix * viewMatrix * vec4(iPos + position * iParam.x * 1.7, 1.0);
}`;
// The telegraph for an incoming shell: the lethal circle, a ring that closes on it as the
// whistle rises, and a hatched core that strobes faster towards the end.
const MARK_FRAG = `
precision highp float; varying vec2 vP; varying vec2 vK; uniform float uTime;
void main() {
  float r = length(vP) * 3.4, k = vK.x;
  float ring = 1.0 - smoothstep(0.0, 0.07, abs(r - 1.0));
  float closing = (1.0 - smoothstep(0.0, 0.05, abs(r - mix(1.65, 1.0, k)))) * (1.0 - k * 0.3);
  float ang = atan(vP.y, vP.x);
  float ticks = step(0.9, cos(ang * 4.0)) * smoothstep(0.75, 0.8, r) * (1.0 - smoothstep(1.2, 1.25, r));
  float strobe = 0.5 + 0.5 * sin(uTime * (6.0 + 26.0 * k * k));
  float fill = step(r, 1.0) * (0.1 + 0.22 * strobe) * (0.6 + 0.4 * step(0.5, fract((vP.x + vP.y) * 12.0 + uTime * 0.6)));
  float a = (ring + closing + ticks * 0.8 + fill) * vK.y;
  gl_FragColor = vec4(vec3(3.2, 0.62, 0.16) * a, 1.0);
}`;
const SCORCH_VERT = `
attribute vec3 iPos; attribute vec3 iParam;
varying vec2 vUv; varying float vA;
void main() {
  float c = cos(iParam.y), s = sin(iParam.y);
  vec3 p = vec3(position.x * c - position.z * s, 0.0, position.x * s + position.z * c) * iParam.x;
  vUv = uv; vA = iParam.z;
  gl_Position = projectionMatrix * viewMatrix * vec4(iPos + p, 1.0);
}`;
const SCORCH_FRAG = 'precision highp float; uniform sampler2D uTex; varying vec2 vUv; varying float vA; void main() { gl_FragColor = vec4(vec3(0.012, 0.01, 0.009), texture2D(uTex, vUv).a * vA); }';

export function buildFx(THREE, tex, map, fogShared, fogColor, fogDensity) {
  const group = new THREE.Group();
  const disposables = [];
  const own = (x) => { disposables.push(x); return x; };
  const quad = own(new THREE.PlaneGeometry(1, 1));
  const inst = (cap, attrs, base = quad) => {
    const g = own(new THREE.InstancedBufferGeometry());
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    g.setAttribute('uv', base.attributes.uv);
    const arr = {};
    for (const [name, size] of attrs) {
      arr[name] = new Float32Array(cap * size);
      const a = new THREE.InstancedBufferAttribute(arr[name], size);
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, a);
    }
    g.instanceCount = 0;
    return { g, arr, touch() { for (const [name] of attrs) g.attributes[name].needsUpdate = true; } };
  };
  const mesh = (geo, material, order = 0) => {
    const m = new THREE.Mesh(geo, own(material));
    m.frustumCulled = false;
    m.renderOrder = order;
    group.add(m);
    return m;
  };
  const sunCol = new THREE.Color(1.0, 0.55, 0.26).multiplyScalar(2.6), amb = new THREE.Color(0.36, 0.39, 0.46);

  // ---- smoke / dust / fire -------------------------------------------------------------
  const SN = 300;
  const sm = inst(SN, [['iPos', 3], ['iParam', 4], ['iCol', 3]]);
  const sv = new Float32Array(SN * 8); // vx vy vz life max size growth alpha
  const sx = new Float32Array(SN * 4); // spin drag rise heatFade
  let sCount = 0;
  mesh(sm.g, new THREE.ShaderMaterial({
    vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG, transparent: true, depthWrite: false,
    uniforms: { uTex: { value: tex.puff }, uSunCol: { value: sunCol }, uAmb: { value: amb }, uFog: { value: fogColor }, uSunFog: fogShared.uSunFog, uSunView: fogShared.uSunView, uFogD: { value: fogDensity } },
  }), 5);
  // o: { x y z, vx vy vz, size, grow (m/s), life, alpha, r g b, heat, spin, drag, rise }
  function smoke(x, y, z, vx, vy, vz, size, grow, life, alpha, r, g, b, heat = 0, spin = 0.3, drag = 0.8, rise = 0.4) {
    let i = sCount;
    if (i >= SN) i = (Math.random() * SN) | 0; // full: overwrite a random one rather than drop the new
    else sCount++;
    const p = sm.arr.iPos, q = sm.arr.iParam, c = sm.arr.iCol;
    p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z;
    q[i * 4] = size; q[i * 4 + 1] = Math.random() * 6.28; q[i * 4 + 2] = 0; q[i * 4 + 3] = heat;
    c[i * 3] = r; c[i * 3 + 1] = g; c[i * 3 + 2] = b;
    sv[i * 8] = vx; sv[i * 8 + 1] = vy; sv[i * 8 + 2] = vz; sv[i * 8 + 3] = 0; sv[i * 8 + 4] = life; sv[i * 8 + 5] = size; sv[i * 8 + 6] = grow; sv[i * 8 + 7] = alpha;
    sx[i * 4] = (Math.random() - 0.5) * 2 * spin; sx[i * 4 + 1] = drag; sx[i * 4 + 2] = rise; sx[i * 4 + 3] = heat;
  }
  function stepSmoke(dt) {
    const p = sm.arr.iPos, q = sm.arr.iParam, c = sm.arr.iCol;
    for (let i = 0; i < sCount; i++) {
      const a = i * 8, b = i * 4;
      sv[a + 3] += dt;
      const k = sv[a + 3] / sv[a + 4];
      if (k >= 1) {
        // Swap-remove keeps the live ones packed at the front.
        const l = --sCount;
        if (l !== i) {
          for (let j = 0; j < 8; j++) sv[a + j] = sv[l * 8 + j];
          for (let j = 0; j < 4; j++) { sx[b + j] = sx[l * 4 + j]; q[b + j] = q[l * 4 + j]; }
          for (let j = 0; j < 3; j++) { p[i * 3 + j] = p[l * 3 + j]; c[i * 3 + j] = c[l * 3 + j]; }
        }
        i--;
        continue;
      }
      const dr = Math.exp(-sx[b + 1] * dt);
      sv[a] *= dr; sv[a + 1] = sv[a + 1] * dr + sx[b + 2] * dt; sv[a + 2] *= dr;
      p[i * 3] += (sv[a] + 0.5) * dt; p[i * 3 + 1] += sv[a + 1] * dt; p[i * 3 + 2] += (sv[a + 2] + 0.18) * dt; // the wind takes it east
      q[b] = sv[a + 5] + sv[a + 6] * sv[a + 3];
      q[b + 1] += sx[b] * dt;
      q[b + 2] = sv[a + 7] * Math.min(1, k * 8) * (1 - k) * (1 - k * k);
      q[b + 3] = sx[b + 3] * Math.max(0, 1 - k * 3.5);
    }
    sm.g.instanceCount = sCount;
    sm.touch();
  }

  // ---- sparks (additive) and clods (opaque): ballistic points that bounce once ----------
  function points(cap, additive) {
    const pos = new Float32Array(cap * 3), col = new Float32Array(cap * 4), size = new Float32Array(cap), st = new Float32Array(cap * 7); // vx vy vz life max size grav
    const g = own(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    const u = { uScale: { value: 600 } };
    const m = new THREE.Points(g, own(new THREE.ShaderMaterial({
      vertexShader: POINT_VERT, uniforms: u, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fragmentShader: POINT_FRAG.replace('ADD', additive ? 'vec4(vCol.rgb * a * vCol.a, 1.0)' : 'vec4(vCol.rgb, a * vCol.a)'),
    })));
    m.frustumCulled = false;
    m.renderOrder = 6;
    group.add(m);
    let n = 0;
    return {
      u,
      emit(x, y, z, vx, vy, vz, life, sz, r, gg, b, grav = 9.8) {
        let i = n;
        if (i >= cap) i = (Math.random() * cap) | 0; else n++;
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
        col[i * 4] = r; col[i * 4 + 1] = gg; col[i * 4 + 2] = b; col[i * 4 + 3] = 1;
        size[i] = sz;
        st[i * 7] = vx; st[i * 7 + 1] = vy; st[i * 7 + 2] = vz; st[i * 7 + 3] = 0; st[i * 7 + 4] = life; st[i * 7 + 5] = sz; st[i * 7 + 6] = grav;
      },
      step(dt) {
        for (let i = 0; i < n; i++) {
          const a = i * 7;
          st[a + 3] += dt;
          const k = st[a + 3] / st[a + 4];
          if (k >= 1) {
            const l = --n;
            if (l !== i) {
              for (let j = 0; j < 7; j++) st[a + j] = st[l * 7 + j];
              for (let j = 0; j < 3; j++) pos[i * 3 + j] = pos[l * 3 + j];
              for (let j = 0; j < 4; j++) col[i * 4 + j] = col[l * 4 + j];
            }
            i--;
            continue;
          }
          st[a + 1] -= st[a + 6] * dt;
          pos[i * 3] += st[a] * dt; pos[i * 3 + 1] += st[a + 1] * dt; pos[i * 3 + 2] += st[a + 2] * dt;
          if (st[a + 1] < 0 && pos[i * 3 + 1] < 3) {
            const h = map.height(pos[i * 3], pos[i * 3 + 2]) + 0.03;
            if (pos[i * 3 + 1] < h) { pos[i * 3 + 1] = h; st[a + 1] *= -0.3; st[a] *= 0.45; st[a + 2] *= 0.45; }
          }
          col[i * 4 + 3] = additive ? 1 - k * k : Math.min(1, (1 - k) * 4);
          size[i] = st[a + 5] * (additive ? 1 - k * 0.6 : 1);
        }
        g.setDrawRange(0, n);
        g.attributes.position.needsUpdate = g.attributes.aCol.needsUpdate = g.attributes.aSize.needsUpdate = true;
      },
    };
  }
  const sparks = points(360, true), clods = points(300, false);

  // ---- immediate sprites ---------------------------------------------------------------
  function sprites(cap, texture, order) {
    const s = inst(cap, [['iPos', 3], ['iParam', 2], ['iCol', 3]]);
    mesh(s.g, new THREE.ShaderMaterial({ vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, uniforms: { uTex: { value: texture } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), order);
    let n = 0;
    return {
      reset() { n = 0; },
      push(x, y, z, size, r, g, b, rot = 0) {
        if (n >= cap) return;
        s.arr.iPos[n * 3] = x; s.arr.iPos[n * 3 + 1] = y; s.arr.iPos[n * 3 + 2] = z;
        s.arr.iParam[n * 2] = size; s.arr.iParam[n * 2 + 1] = rot;
        s.arr.iCol[n * 3] = r; s.arr.iCol[n * 3 + 1] = g; s.arr.iCol[n * 3 + 2] = b;
        n++;
      },
      flush() { s.g.instanceCount = n; s.touch(); },
    };
  }
  const glows = sprites(64, tex.glow, 8), stars = sprites(24, tex.star, 9);

  const strip = own(new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0)); // x 0..1 along, y across
  const tr = inst(32, [['iA', 3], ['iB', 3], ['iCol', 4]], strip);
  const trU = { uMin: { value: 0.0016 } };
  mesh(tr.g, new THREE.ShaderMaterial({ vertexShader: TRACER_VERT, fragmentShader: TRACER_FRAG, uniforms: trU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), 7);
  let trN = 0;
  // A streak from tail (ax..) to head (bx..); the head is the bright end.
  function tracer(ax, ay, az, bx, by, bz, r, g, b, width = 0.05) {
    if (trN >= 32) return;
    const A = tr.arr.iA, B = tr.arr.iB, C = tr.arr.iCol;
    A[trN * 3] = ax; A[trN * 3 + 1] = ay; A[trN * 3 + 2] = az;
    B[trN * 3] = bx; B[trN * 3 + 1] = by; B[trN * 3 + 2] = bz;
    C[trN * 4] = r; C[trN * 4 + 1] = g; C[trN * 4 + 2] = b; C[trN * 4 + 3] = width;
    trN++;
  }

  const flat = own(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  const mk = inst(24, [['iPos', 3], ['iParam', 3]], flat);
  const mkU = { uTime: { value: 0 } };
  mesh(mk.g, new THREE.ShaderMaterial({ vertexShader: MARK_VERT, fragmentShader: MARK_FRAG, uniforms: mkU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), 4);
  let mkN = 0;
  // radius: lethal radius. k: 0 when the warning starts → 1 at impact. gain: brightness.
  function marker(x, y, z, radius, k, gain = 1) {
    if (mkN >= 24) return;
    mk.arr.iPos[mkN * 3] = x; mk.arr.iPos[mkN * 3 + 1] = y; mk.arr.iPos[mkN * 3 + 2] = z;
    mk.arr.iParam[mkN * 3] = radius * 2; mk.arr.iParam[mkN * 3 + 1] = k; mk.arr.iParam[mkN * 3 + 2] = gain;
    mkN++;
  }

  // ---- scorch marks: a ring buffer, they stay for the round ------------------------------
  const sc = inst(24, [['iPos', 3], ['iParam', 3]], flat);
  mesh(sc.g, new THREE.ShaderMaterial({ vertexShader: SCORCH_VERT, fragmentShader: SCORCH_FRAG, uniforms: { uTex: { value: tex.scorch } }, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 1);
  let scN = 0;
  function scorch(x, y, z, size) {
    const i = scN % 24;
    sc.arr.iPos[i * 3] = x; sc.arr.iPos[i * 3 + 1] = y + 0.04; sc.arr.iPos[i * 3 + 2] = z;
    sc.arr.iParam[i * 3] = size; sc.arr.iParam[i * 3 + 1] = Math.random() * 6.28; sc.arr.iParam[i * 3 + 2] = 0.85;
    scN++;
    sc.g.instanceCount = Math.min(24, scN);
    sc.touch();
  }

  // ---- flashes: a glow, and the one point light they share --------------------------------
  const flashLight = new THREE.PointLight('#ffb060', 0, 45, 2);
  group.add(flashLight);
  const FL = 10, fl = new Float32Array(FL * 9); // x y z r g b size life max
  let flN = 0;
  function flash(x, y, z, r, g, b, size, life) {
    const i = flN < FL ? flN++ : 0, a = i * 9;
    fl[a] = x; fl[a + 1] = y; fl[a + 2] = z; fl[a + 3] = r; fl[a + 4] = g; fl[a + 5] = b; fl[a + 6] = size; fl[a + 7] = 0; fl[a + 8] = life;
  }
  function stepFlashes(dt) {
    let best = 0;
    flashLight.intensity = 0;
    for (let i = 0; i < flN; i++) {
      const a = i * 9;
      fl[a + 7] += dt;
      const k = fl[a + 7] / fl[a + 8];
      if (k >= 1) {
        const l = --flN;
        if (l !== i) for (let j = 0; j < 9; j++) fl[a + j] = fl[l * 9 + j];
        i--;
        continue;
      }
      const e = (1 - k) * (1 - k), s = fl[a + 6] * (0.7 + 0.6 * k);
      glows.push(fl[a], fl[a + 1], fl[a + 2], s, fl[a + 3] * e, fl[a + 4] * e, fl[a + 5] * e);
      const power = fl[a + 6] * fl[a + 6] * e;
      if (power > best) {
        best = power;
        flashLight.position.set(fl[a], fl[a + 1] + 0.3, fl[a + 2]);
        flashLight.color.setRGB(fl[a + 3], fl[a + 4], fl[a + 5]);
        flashLight.intensity = 26 * power;
      }
    }
  }

  // Two parachute flares can burn at once; the lights always exist so shaders never recompile.
  const flareLights = [0, 1].map(() => { const l = new THREE.PointLight('#fff0d2', 0, 75, 2); group.add(l); return l; });

  return {
    group, smoke, sparks, clods, tracer, marker, scorch, flash, flareLights,
    glow: glows.push, star: stars.push,
    // Start of a frame's worth of immediate sprites.
    begin() { glows.reset(); stars.reset(); trN = 0; mkN = 0; },
    // End of frame: advance the particles and upload everything.
    update(dt, wt, scale) {
      stepSmoke(dt);
      sparks.u.uScale.value = clods.u.uScale.value = scale;
      sparks.step(dt);
      clods.step(dt);
      stepFlashes(dt);
      glows.flush();
      stars.flush();
      tr.g.instanceCount = trN; tr.touch();
      mk.g.instanceCount = mkN; mk.touch();
      mkU.uTime.value = wt;
      trU.uMin.value = 1.1 / scale;
    },
    dispose() { for (const d of disposables) d.dispose(); },
    sunWorld: SUN,
  };
}
