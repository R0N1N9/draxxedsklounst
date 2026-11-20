// THE DEEP — the two spearfishers and the speargun in your hands. Built from primitives
// with vertex colours; a negative red channel flags a part for the shader: -1 the diver's
// identity colour (it glows a little, so it reads through the murk), -2 mask glass,
// -3 the lamp.
import { clamp, lerp } from '../../kit.js';
import { WATER_GLSL, VERT_COMMON } from './shaders.js';

const GEAR_VERT = VERT_COMMON + `
varying vec3 vC;
void main() {
  vC = color;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const GEAR_FRAG = `
precision highp float;
varying vec3 vW;
varying vec3 vN;
varying vec3 vC;
uniform vec3 uTeam;
uniform float uGhost, uGlow, uFade;
${WATER_GLSL}
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(uCam - vW);
  float d = length(vW - uCam);
  vec3 alb = vC, emit = vec3(0.0);
  float spec = 0.15;
  if (vC.r < -2.5) { alb = vec3(0.9); emit = mix(uTeam, vec3(1.0), 0.6) * 3.0; }
  else if (vC.r < -1.5) { alb = vec3(0.02, 0.03, 0.04); spec = 1.6; }
  else if (vC.r < -0.5) { alb = uTeam; emit = uTeam * 0.22 * uGlow; spec = 0.4; }
  vec3 col = litWater(alb, vW, n, 1.0, 0.4, 0.7);
  vec3 h = normalize(uL + v);
  col += sunAt(vW.y) * pow(max(dot(n, h), 0.0), 40.0) * spec * sunShadow(vW, 0.002);
  // a rim of the diver's own colour: the shape reads against dark water
  float fr = pow(1.0 - max(dot(n, v), 0.0), 2.5);
  col += uTeam * fr * 0.12 * uGlow;
  if (vC.r < -1.5 && vC.r > -2.5) col += waterBg(reflect(-v, n), vW.y) * 1.2 * (0.3 + fr);
  col = waterFog(col, vW, 0.9);
  col += emit * exp(-d * 0.02);
  // sonar: the whole diver outlined in their colour, through the murk
  col += uTeam * (0.25 + fr * 2.2) * uGhost;
  gl_FragColor = vec4(col * uFade, d);
}`;
// Drawn over everything (no depth test) while a diver is pinged: their silhouette through rock.
const GHOST_FRAG = `
precision highp float;
varying vec3 vW;
varying vec3 vN;
varying vec3 vC;
uniform vec3 uTeam;
uniform float uGhost;
${WATER_GLSL}
void main() {
  vec3 n = normalize(vN), v = normalize(uCam - vW);
  float fr = pow(1.0 - abs(dot(n, v)), 1.6);
  float scan = 0.7 + 0.3 * sin(vW.y * 14.0 - uTime * 9.0);
  gl_FragColor = vec4(uTeam * (0.15 + fr * 1.2) * scan * uGhost, 0.6 * uGhost);
}`;

function colored(THREE, g, r, gg, b) {
  const n = g.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = r; c[i * 3 + 1] = gg; c[i * 3 + 2] = b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
function mergeInto(THREE, list) {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    if (!g.attributes.normal) g.computeVertexNormals();
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3);
    o += c;
  }
  for (const g of list) g.dispose();
  for (const g of parts) g.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
const SUIT = [0.06, 0.07, 0.085], SUIT2 = [0.12, 0.13, 0.15], STEEL = [0.6, 0.62, 0.64], TEAM = [-1, -1, -1], GLASS = [-2, -2, -2], LAMP = [-3, -3, -3];

// A capsule between two points (local), radius r.
function limb(THREE, a, b, r, c, seg = 8) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const g = new THREE.CapsuleGeometry(r, Math.max(0.01, len), 3, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize()));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return colored(THREE, g, ...c);
}
function box(THREE, sx, sy, sz, x, y, z, c) { const g = new THREE.BoxGeometry(sx, sy, sz); g.translate(x, y, z); return colored(THREE, g, ...c); }
function cyl(THREE, r0, r1, len, x, y, z, c, rotX = Math.PI / 2, seg = 10) { const g = new THREE.CylinderGeometry(r0, r1, len, seg); g.rotateX(rotX); g.translate(x, y, z); return colored(THREE, g, ...c); }

// Geometry shared by both divers (the colour comes from a uniform).
export function makeDiverKit(THREE, mats) {
  const geos = [];
  const keep = (g) => { geos.push(g); return g; };
  // Body in local space: forward is -z, up +y; the origin is the chest.
  const body = keep(mergeInto(THREE, [
    limb(THREE, [0, 0, -0.32], [0, -0.02, 0.36], 0.2, SUIT, 12),
    box(THREE, 0.06, 0.08, 0.55, 0.19, 0.02, 0.0, TEAM), box(THREE, 0.06, 0.08, 0.55, -0.19, 0.02, 0.0, TEAM), // flank stripes
    box(THREE, 0.42, 0.06, 0.1, 0, -0.08, 0.3, [0.25, 0.25, 0.22]), // weight belt
    cyl(THREE, 0.1, 0.1, 0.62, 0, 0.24, 0.05, TEAM, Math.PI / 2, 14), // tank
    cyl(THREE, 0.102, 0.102, 0.06, 0, 0.24, -0.12, [0.85, 0.85, 0.8]), cyl(THREE, 0.102, 0.102, 0.06, 0, 0.24, 0.22, [0.85, 0.85, 0.8]),
    cyl(THREE, 0.035, 0.05, 0.08, 0, 0.24, -0.3, STEEL),
    // head, hood, mask, snorkel, lamp
    limb(THREE, [0, 0.06, -0.46], [0, 0.08, -0.6], 0.125, SUIT2, 10),
    cyl(THREE, 0.018, 0.018, 0.34, -0.14, 0.22, -0.58, TEAM, 0.25, 6),
    cyl(THREE, 0.035, 0.03, 0.08, 0.12, 0.2, -0.64, [0.2, 0.2, 0.2]),
    cyl(THREE, 0.025, 0.025, 0.02, 0.12, 0.2, -0.685, LAMP),
    // regulator and hose
    cyl(THREE, 0.04, 0.04, 0.05, 0, 0.0, -0.74, [0.15, 0.15, 0.15]),
    limb(THREE, [0, 0.02, -0.72], [0.0, 0.24, -0.3], 0.018, [0.1, 0.1, 0.1], 5),
  ]));
  const mask = keep(mergeInto(THREE, [
    box(THREE, 0.2, 0.09, 0.05, 0, 0.1, -0.73, GLASS),
    box(THREE, 0.24, 0.12, 0.04, 0, 0.1, -0.705, [0.1, 0.1, 0.1]),
    box(THREE, 0.27, 0.03, 0.16, 0, 0.1, -0.62, TEAM), // the strap
  ]));
  const upperArm = keep(limb(THREE, [0, 0, 0], [0, 0, -0.3], 0.06, SUIT));
  const foreArm = keep(mergeInto(THREE, [limb(THREE, [0, 0, 0], [0, 0, -0.28], 0.05, SUIT), limb(THREE, [0, 0, -0.3], [0, 0, -0.34], 0.055, SUIT2)]));
  const thigh = keep(limb(THREE, [0, 0, 0], [0, 0, 0.42], 0.085, SUIT));
  const calf = keep(mergeInto(THREE, [limb(THREE, [0, 0, 0], [0, 0, 0.4], 0.065, SUIT), box(THREE, 0.1, 0.06, 0.2, 0, -0.02, 0.45, [0.1, 0.1, 0.1])]));
  // a long freediving blade
  const finBlade = (() => {
    const g = new THREE.PlaneGeometry(0.2, 0.78, 1, 6);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), u = y / 0.78 + 0.5;
      p.setX(i, p.getX(i) * (0.75 + 0.5 * u));
      p.setZ(i, -u * u * 0.06);
    }
    g.rotateX(-Math.PI / 2);
    g.translate(0, -0.03, 0.39);
    g.computeVertexNormals();
    return keep(mergeInto(THREE, [colored(THREE, g, ...TEAM), box(THREE, 0.04, 0.03, 0.78, 0.1, -0.03, 0.39, [0.08, 0.08, 0.08]), box(THREE, 0.04, 0.03, 0.78, -0.1, -0.03, 0.39, [0.08, 0.08, 0.08])]));
  })();
  const gun = keep(mergeInto(THREE, [
    cyl(THREE, 0.019, 0.019, 1.02, 0, 0, -0.5, [0.1, 0.11, 0.12], Math.PI / 2, 10),    // anodised barrel
    box(THREE, 0.012, 0.008, 0.7, 0, 0.02, -0.45, TEAM),                               // a stripe of your colour
    box(THREE, 0.026, 0.03, 0.9, 0, 0.022, -0.52, [0.16, 0.16, 0.17]),                 // the spear rail
    box(THREE, 0.034, 0.13, 0.045, 0, -0.085, 0.03, [0.07, 0.07, 0.08]),              // grip
    box(THREE, 0.006, 0.05, 0.08, 0, -0.045, -0.04, [0.3, 0.3, 0.32]),                // trigger guard
    cyl(THREE, 0.034, 0.03, 0.08, 0, 0.004, -1.03, TEAM, Math.PI / 2, 10),             // the muzzle head
    cyl(THREE, 0.024, 0.024, 0.16, 0, 0, 0.06, [0.08, 0.08, 0.09], Math.PI / 2, 10),   // butt
  ]));
  const spear = keep(mergeInto(THREE, [
    cyl(THREE, 0.0055, 0.0055, 1.25, 0, 0.042, -0.58, STEEL, Math.PI / 2, 5),
    (() => { const c = new THREE.ConeGeometry(0.011, 0.08, 6); c.rotateX(-Math.PI / 2); c.translate(0, 0.042, -1.24); return colored(THREE, c, 0.95, 0.95, 0.95); })(),
  ]));
  const band = keep(cyl(THREE, 0.0065, 0.0065, 1, 0, 0, -0.5, [0.05, 0.05, 0.055], Math.PI / 2, 5)); // a unit rubber, scaled into place
  const glove = keep(mergeInto(THREE, [
    (() => { const g = new THREE.SphereGeometry(0.05, 10, 8); g.scale(1, 0.75, 1.35); return colored(THREE, g, ...SUIT2); })(),
    box(THREE, 0.07, 0.035, 0.07, 0, 0.02, -0.06, SUIT2),
    box(THREE, 0.06, 0.025, 0.05, 0, 0.03, 0.03, TEAM),
  ]));
  const shader = (frag, o = {}) => mats.shader({ vertexShader: GEAR_VERT, fragmentShader: frag, vertexColors: true, uniforms: { uTeam: { value: new THREE.Color() }, uGhost: { value: 0 }, uGlow: { value: 1 }, uFade: { value: 1 } }, side: THREE.DoubleSide, ...o });
  return { geos, body, mask, upperArm, foreArm, thigh, calf, finBlade, gun, spear, band, glove, shader, dispose() { for (const g of geos) g.dispose(); } };
}

export function makeDiver(THREE, kit, color) {
  const mat = kit.shader(GEAR_FRAG);
  mat.uniforms.uTeam.value.set(color);
  const ghostMat = kit.shader(GHOST_FRAG, { depthTest: false, depthWrite: false, transparent: true });
  ghostMat.blending = THREE.CustomBlending;
  ghostMat.blendSrc = THREE.SrcAlphaFactor; ghostMat.blendDst = THREE.OneFactor;
  ghostMat.blendSrcAlpha = THREE.ZeroFactor; ghostMat.blendDstAlpha = THREE.OneFactor;
  ghostMat.uniforms.uTeam = mat.uniforms.uTeam;
  ghostMat.uniforms.uGhost = mat.uniforms.uGhost;
  const root = new THREE.Group();
  const pivot = new THREE.Group(); // pitch / roll of the body
  root.add(pivot);
  const parts = [];
  const mesh = (geo, parent, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.layers.enable(1);
    parent.add(m);
    parts.push(m);
    return m;
  };
  const body = mesh(kit.body, pivot);
  const mask = mesh(kit.mask, pivot);
  const arms = [-1, 1].map((s) => {
    const sh = new THREE.Group(); sh.position.set(s * 0.17, 0.03, -0.3); pivot.add(sh);
    const up = mesh(kit.upperArm, sh);
    const el = new THREE.Group(); el.position.set(0, 0, -0.3); sh.add(el);
    mesh(kit.foreArm, el);
    return { sh, el };
  });
  const gunG = new THREE.Group(); gunG.position.set(0.02, -0.04, -0.86); pivot.add(gunG);
  mesh(kit.gun, gunG);
  const loaded = mesh(kit.spear, gunG);
  const legs = [-1, 1].map((s) => {
    const hip = new THREE.Group(); hip.position.set(s * 0.1, -0.03, 0.34); pivot.add(hip);
    mesh(kit.thigh, hip);
    const knee = new THREE.Group(); knee.position.set(0, 0, 0.42); hip.add(knee);
    mesh(kit.calf, knee);
    const ankle = new THREE.Group(); ankle.position.set(0, -0.01, 0.42); knee.add(ankle);
    const fin = mesh(kit.finBlade, ankle);
    return { hip, knee, ankle, fin };
  });
  // the ghost: the same body drawn through the world while pinged
  const ghost = new THREE.Group();
  for (const p of parts) {
    const g = new THREE.Mesh(p.geometry, ghostMat);
    g.renderOrder = 5;
    g.frustumCulled = false;
    ghost.add(g);
  }
  ghost.visible = false;
  let kick = 0;
  return {
    root, pivot, mat, ghost, legs, arms, gunG, loaded, parts, mask, body,
    // s: { x, y, z, yaw, pitch, speed (0..1), kickRate, loaded, dead (s, -1 alive), aim (0..1) }
    pose(s, dt) {
      root.position.set(s.x, s.y, s.z);
      root.rotation.set(0, s.yaw, 0);
      const swim = clamp(s.speed, 0, 1);
      kick += dt * (2.2 + swim * 5.5 + (s.dead >= 0 ? -1.5 : 0));
      if (s.dead >= 0) {
        // the tumble: limp, rolling over as the body rises
        pivot.rotation.set(s.pitch * 0.3 - s.dead * 0.9, 0, s.dead * 0.6);
        for (const l of legs) { l.hip.rotation.x = 0.4 + Math.sin(kick * 0.5) * 0.1; l.knee.rotation.x = -0.6; }
        for (const a of arms) { a.sh.rotation.set(-0.6 - s.dead * 0.3, 0, 0); a.el.rotation.x = 0.8; }
        gunG.rotation.x = s.dead * 1.4;
      } else {
        // horizontal when swimming, more upright when hovering to aim
        const level = lerp(0.85, 0.15, swim) * (1 - s.aim * 0.4);
        pivot.rotation.set(s.pitch * lerp(1, 0.75, level) + level * 0.55 * (1 - Math.abs(s.pitch)), 0, Math.sin(kick * 0.5) * 0.04 * swim);
        for (let i = 0; i < 2; i++) {
          const l = legs[i], ph = kick + i * Math.PI, amp = 0.12 + swim * 0.32;
          l.hip.rotation.x = Math.sin(ph) * amp - level * 0.9;
          l.knee.rotation.x = -0.15 - Math.max(0, Math.sin(ph - 0.6)) * amp * 0.8 + level * 0.5;
          l.ankle.rotation.x = Math.sin(ph - 1.2) * 0.35 * (0.4 + swim) + 0.2;
        }
        // both hands on the gun, pointing where the diver looks
        for (const [i, a] of arms.entries()) {
          a.sh.rotation.set(-0.12 - level * 0.55, i ? -0.18 : 0.18, 0);
          a.el.rotation.set(0.2, i ? 0.12 : -0.12, 0);
        }
        gunG.rotation.set(-level * 0.55 + (s.recoil || 0) * 0.25, 0, 0);
      }
      loaded.visible = !!s.loaded;
      ghost.position.copy(root.position);
      ghost.quaternion.copy(root.quaternion);
    },
    // refresh the ghost's transforms from the real parts (call after pose, before render)
    syncGhost() {
      if (!ghost.visible) return;
      root.updateMatrixWorld(true);
      for (let i = 0; i < parts.length; i++) {
        const g = ghost.children[i];
        g.matrixAutoUpdate = false;
        g.matrix.copy(parts[i].matrixWorld);
        g.matrixWorld.copy(parts[i].matrixWorld);
      }
    },
  };
}

// The gun in your hands: barrel, bands, the spear, two gloves.
export function makeViewModel(THREE, kit, color) {
  const mat = kit.shader(GEAR_FRAG);
  mat.uniforms.uTeam.value.set(color);
  mat.uniforms.uGlow.value = 0.5;
  const root = new THREE.Group();
  const rig = new THREE.Group(); // recoil / sway / reload offsets
  root.add(rig);
  const gun = new THREE.Mesh(kit.gun, mat);
  const spear = new THREE.Mesh(kit.spear, mat);
  const bands = [-1, 1].map(() => { const b = new THREE.Mesh(kit.band, mat); rig.add(b); return b; });
  const gR = new THREE.Mesh(kit.glove, mat), gL = new THREE.Mesh(kit.glove, mat);
  rig.add(gun, spear, gR, gL);
  gun.position.set(0, 0, 0);
  for (const m of [gun, spear, gR, gL, ...bands]) { m.frustumCulled = false; m.renderOrder = 10; }
  const v = new THREE.Vector3();
  return {
    root, mat,
    // st: { load (0 empty .. 1 loaded, the reload's progress), kick (0..1), sway {x,y}, bob, aim (0..1 hold breath) }
    pose(st) {
      // resting low on the right; raised and centred while you hold your breath
      const a = st.aim;
      rig.position.set(lerp(0.2, 0.06, a) + st.sway.x * 0.6, lerp(-0.23, -0.135, a) + st.sway.y * 0.6 + st.bob * 0.01 - st.drop * 0.18, lerp(-0.2, -0.2, a) + st.kick * 0.12);
      rig.rotation.set(lerp(0.035, 0.004, a) + st.kick * 0.18 - st.drop * 0.5, lerp(0.075, 0.018, a), lerp(-0.1, -0.02, a) - st.drop * 0.3);
      gR.position.set(0, -0.075, 0.03);
      gR.rotation.set(0.2, 0, 0);
      // the reload: the left hand slides a spear home, then hauls each band back to its notch
      const L = clamp(st.load, 0, 1);
      const slide = clamp(L / 0.4, 0, 1), haul = clamp((L - 0.4) / 0.6, 0, 1);
      spear.visible = L > 0.02;
      spear.position.set(0, 0, (1 - slide) * 0.75);
      const handZ = L < 1 ? (L < 0.4 ? lerp(-0.2, -0.95, 1 - slide) : lerp(-1.0, -0.35, (haul * 2) % 1)) : -0.62;
      gL.position.set(-0.04, L < 1 ? -0.02 + Math.sin(haul * 6.28) * 0.04 : -0.05, handZ);
      gL.rotation.set(0.1, 0, 0.3);
      for (let i = 0; i < 2; i++) {
        const done = st.load >= 1 || haul > (i + 1) * 0.5;
        const s = i ? 1 : -1;
        // a band runs from the muzzle to the notch on the spear when drawn, slack when not
        const zEnd = done ? -0.32 : -0.92, y = done ? 0.05 : -0.025;
        bands[i].position.set(s * 0.024, y, -1.02);
        v.set(0, 0, zEnd + 1.02);
        bands[i].scale.set(1, 1, v.length());
        bands[i].position.z = -1.02;
        bands[i].rotation.set(0, s * (done ? 0.04 : 0.02), 0);
        // the unit band runs from z 0 to -1: point it back along the barrel
        bands[i].scale.z = -(zEnd + 1.02);
      }
    },
  };
}
