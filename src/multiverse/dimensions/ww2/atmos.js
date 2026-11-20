// IRON AUTUMN — the air above the square: dusk sky with a smoke-lit cloud deck, searchlights
// feeling along its underside, a bomber stream going over, and the ash, embers and leaves
// that never stop coming down. All of it is decoration and runs on the local clock.
import { mulberry32 } from '../../kit.js';
import { Batch, SUN } from './kitbash.js';

const SKY_VERT = 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const SKY_FRAG = `
precision highp float;
varying vec3 vDir;
uniform sampler2D uCloud;
uniform float uTime;
uniform vec3 uSun, uFog, uSunFog;
uniform vec4 uSpot[3];
uniform vec4 uFlak;
void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  float sa = max(dot(d, uSun), 0.0);
  float az = max(dot(normalize(d.xz + vec2(1e-5)), normalize(uSun.xz)), 0.0);
  // At the horizon the sky IS the fog colour, so the distant ruins melt into it.
  vec3 hor = mix(uFog, uSunFog, sa * sa * sa);
  vec3 zen = mix(vec3(0.03, 0.05, 0.095), vec3(0.13, 0.11, 0.15), az * 0.7);
  vec3 col = mix(hor, zen, smoothstep(0.0, 0.5, h));
  col += vec3(1.3, 0.5, 0.14) * pow(az, 4.0) * exp(-h * 6.0) * 0.4;
  // Cloud deck: a plane overhead, two layers sliding over each other.
  vec2 uv = d.xz / (h + 0.17);
  vec2 w1 = vec2(uTime * 0.0035, uTime * 0.0012), w2 = vec2(-uTime * 0.006, uTime * 0.0027);
  float n2 = texture2D(uCloud, uv * 0.29 + w2).g;
  float dens = texture2D(uCloud, uv * 0.1 + w1).r * 0.72 + n2 * 0.28;
  float cov = smoothstep(0.4, 0.66, dens) * smoothstep(0.0, 0.2, h);
  // Lit from below and from the west: where the deck thins towards the sun it catches fire.
  float densS = texture2D(uCloud, (uv + normalize(uSun.xz) * 0.5) * 0.1 + w1).r * 0.72 + n2 * 0.28;
  float lit = clamp((dens - densS) * 5.0 + 0.45, 0.0, 1.0);
  vec3 warm = mix(vec3(0.2, 0.17, 0.2), vec3(2.3, 0.82, 0.24), pow(az, 1.6));
  vec3 cc = mix(vec3(0.04, 0.042, 0.06), warm, lit * (0.3 + 0.7 * (1.0 - smoothstep(0.4, 0.75, dens))));
  col = mix(col, cc, cov * 0.94);
  float clear = 1.0 - cov * 0.85;
  col += vec3(1.0, 0.5, 0.16) * (smoothstep(0.99955, 0.9998, dot(d, uSun)) * 40.0 + pow(sa, 90.0) * 2.5 + pow(sa, 10.0) * 0.35) * clear;
  for (int i = 0; i < 3; i++) {
    float s = smoothstep(0.9968, 0.9995, dot(d, uSpot[i].xyz));
    col += vec3(0.75, 0.86, 1.0) * s * uSpot[i].w * (0.25 + cov * 1.2);
  }
  col += vec3(1.0, 0.75, 0.45) * pow(max(dot(d, uFlak.xyz), 0.0), 30.0) * uFlak.w * (0.4 + cov);
  gl_FragColor = vec4(col, 0.0); // alpha 0 marks sky for the light-shaft pass
}`;

const BEAM_VERT = 'varying vec3 vN, vP; varying float vY; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vP = mv.xyz; vN = normalMatrix * normal; vY = uv.y; gl_Position = projectionMatrix * mv; }';
const BEAM_FRAG = `
precision highp float;
varying vec3 vN, vP; varying float vY;
uniform float uGain;
void main() {
  float f = abs(dot(normalize(vN), normalize(vP)));
  // Dense in the middle of the cone, gone at its silhouette; fades as it climbs.
  float a = f * f * (1.0 - 0.8 * vY) * smoothstep(0.0, 0.06, 1.0 - vY) * uGain;
  gl_FragColor = vec4(vec3(0.55, 0.66, 0.85) * a, 1.0);
}`;

const DRIFT_VERT = `
attribute vec4 aSeed;
uniform float uTime, uScale, uRise, uSize;
uniform vec3 uCam, uWind, uBox;
varying float vFade, vKind, vTw;
void main() {
  // Each mote lives in a box that follows the camera and wraps: endless, and free.
  float sp = 0.5 + aSeed.w;
  vec3 p = aSeed.xyz * uBox + uWind * uTime * sp;
  p.y += uTime * mix(-0.9, 0.55, step(0.5, aSeed.w)) * uRise;
  p.x += sin(uTime * (0.7 + aSeed.x) + aSeed.z * 40.0) * 0.6;
  p.z += cos(uTime * (0.6 + aSeed.y) + aSeed.x * 40.0) * 0.6;
  p = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  gl_PointSize = clamp(uSize * (0.5 + aSeed.y) * uScale / max(dist, 0.5), 1.0, 24.0);
  vFade = smoothstep(0.6, 2.5, dist) * (1.0 - smoothstep(uBox.x * 0.3, uBox.x * 0.5, dist));
  vKind = aSeed.x;
  vTw = sin(uTime * (3.0 + aSeed.z * 9.0) + aSeed.w * 30.0);
}`;
const DRIFT_FRAG = `
precision highp float;
varying float vFade, vKind, vTw;
uniform float uEmber;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.4, 1.0, r)) * vFade;
  // One fleck in six is a leaf still holding its colour; the rest is ash. Embers glow instead.
  vec3 c = vKind > 0.84 ? vec3(0.62, 0.3, 0.07) : vec3(0.11, 0.105, 0.1) + 0.12 * vTw;
  gl_FragColor = mix(vec4(c, a * 0.75), vec4(vec3(5.0, 1.7, 0.35) * a * (0.55 + 0.45 * vTw), 1.0), uEmber);
}`;

export function buildAtmosphere(THREE, tex, seed, fogShared, fogColor) {
  const rnd = mulberry32(seed ^ 0x51c7);
  const group = new THREE.Group();
  const sun = new THREE.Vector3(SUN.x, SUN.y, SUN.z);

  const skyU = {
    uCloud: { value: tex.cloud }, uTime: { value: rnd() * 500 }, uSun: { value: sun }, uFog: { value: fogColor }, uSunFog: fogShared.uSunFog,
    uSpot: { value: [new THREE.Vector4(0, 1, 0, 0), new THREE.Vector4(0, 1, 0, 0), new THREE.Vector4(0, 1, 0, 0)] }, uFlak: { value: new THREE.Vector4(0, 1, 0, 0) },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: skyU, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false }));
  sky.renderOrder = -100;
  sky.frustumCulled = false;
  group.add(sky);

  // Searchlights: three batteries out beyond the town, each hunting its own patch of cloud.
  const beamMat = new THREE.ShaderMaterial({ vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, uniforms: { uGain: { value: 0.3 } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beamGeo = new THREE.CylinderGeometry(17, 1.2, 760, 14, 1, true).translate(0, 380, 0);
  const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), tmp = new THREE.Vector3();
  const beams = [[190, -210], [-240, 90], [80, 260]].map(([x, z], i) => {
    const mesh = new THREE.Mesh(beamGeo, beamMat);
    mesh.position.set(x, -4, z);
    mesh.frustumCulled = false;
    group.add(mesh);
    const l = Math.hypot(x, z);
    return { mesh, a: 0.11 + i * 0.037, b: 0.083 + i * 0.029, pa: rnd() * 6.3, pb: rnd() * 6.3, tx: (-x / l) * 0.22, tz: (-z / l) * 0.22 };
  });

  // The bomber stream: nine silhouettes in vics, too high to care about the square.
  const bb = new Batch(THREE, 1, null);
  bb.cyl(0, 0, 0, 0.7, 1.3, 21, '#101114', 8, 0, Math.PI / 2);
  bb.box(0, 0.2, -1.5, 31, 0.5, 4.2, '#101114');
  bb.box(0, 0.6, 9.5, 10, 0.3, 2.4, '#101114');
  bb.box(0, 2.0, 9.8, 0.3, 3.2, 2.6, '#101114');
  for (const x of [-8.5, -4.2, 4.2, 8.5]) bb.cyl(x, 0, -3.2, 0.75, 0.6, 3.6, '#101114', 6, 0, Math.PI / 2);
  const bombers = new THREE.InstancedMesh(bb.build(), new THREE.MeshBasicMaterial({ color: '#1b1d24', fog: false }), 9);
  bombers.frustumCulled = false;
  group.add(bombers);
  const slots = [[0, 0], [-26, 22], [26, 22], [-70, 46], [-96, 68], [-44, 68], [70, 60], [44, 82], [96, 82]];
  const heading = 2.5 + rnd() * 0.5, hx = Math.sin(heading), hz = Math.cos(heading), dummy = new THREE.Object3D();
  const period = 46, lead = { x: 0, y: 0, z: 0, over: 0 };

  // Ash and leaves (dark flecks) and embers (bright ones): two point clouds, animated on the GPU.
  const n = 520, seeds = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i++) seeds[i] = rnd();
  const dgeo = new THREE.BufferGeometry();
  dgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  dgeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  const dU = (ember) => ({ uTime: { value: 0 }, uScale: { value: 600 }, uCam: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector3(1.3, 0, 0.45) }, uBox: { value: new THREE.Vector3(46, 18, 46) }, uEmber: { value: ember }, uRise: { value: ember ? 1.3 : 0.5 }, uSize: { value: ember ? 0.035 : 0.05 } });
  const ashU = dU(0), emberU = dU(1);
  const ash = new THREE.Points(dgeo, new THREE.ShaderMaterial({
    vertexShader: DRIFT_VERT, fragmentShader: DRIFT_FRAG, uniforms: ashU, transparent: true, depthWrite: false, fog: false,
  }));
  const emberGeo = dgeo.clone();
  emberGeo.setDrawRange(0, 150);
  const embers = new THREE.Points(emberGeo, new THREE.ShaderMaterial({
    vertexShader: DRIFT_VERT, fragmentShader: DRIFT_FRAG, uniforms: emberU, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
  }));
  emberU.uBox.value.set(40, 14, 40);
  ash.frustumCulled = embers.frustumCulled = false;
  group.add(ash, embers);

  return {
    group, skyU, lead,
    // wt: local world clock. cam: the camera. scale: drawing-buffer pixels per unit at distance 1.
    update(wt, cam, scale) {
      sky.position.copy(cam.position);
      skyU.uTime.value = wt + 100;
      beams.forEach((b, i) => {
        // Lean towards the town, then wander.
        dir.set(b.tx + Math.sin(wt * b.a + b.pa) * 0.34, 1, b.tz + Math.cos(wt * b.b + b.pb) * 0.3).normalize();
        b.mesh.quaternion.setFromUnitVectors(up, dir);
        tmp.copy(dir).multiplyScalar(520 / dir.y).add(b.mesh.position).sub(cam.position).normalize();
        skyU.uSpot.value[i].set(tmp.x, tmp.y, tmp.z, 0.5);
      });
      const ph = ((wt + 14) % period) / period, s = (ph - 0.5) * 1500;
      lead.x = hx * s; lead.y = 330; lead.z = hz * s;
      lead.over = Math.max(0, 1 - Math.abs(ph - 0.5) * 3.2);
      for (let i = 0; i < 9; i++) {
        const [ox, oz] = slots[i];
        dummy.position.set(lead.x + hz * ox - hx * oz, lead.y + (i % 3) * 6, lead.z - hx * ox - hz * oz);
        dummy.rotation.set(0, heading + Math.PI, Math.sin(wt * 0.3 + i) * 0.03);
        dummy.updateMatrix();
        bombers.setMatrixAt(i, dummy.matrix);
      }
      bombers.instanceMatrix.needsUpdate = true;
      for (const u of [ashU, emberU]) { u.uTime.value = wt; u.uCam.value.copy(cam.position); u.uScale.value = scale; }
    },
    flak(x, y, z, cam, gain) { tmp.set(x, y, z).sub(cam.position).normalize(); skyU.uFlak.value.set(tmp.x, tmp.y, tmp.z, gain); },
  };
}
