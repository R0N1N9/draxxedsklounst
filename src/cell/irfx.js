// Sniper Cell — things only night vision / IR can see (render layer 1), and the ghosts of
// where SENTINEL last saw you.
//   strobes  blinking IR strobes on each operator's helmet and shoulders
//   lasers   IR aiming lasers from both operators' weapons
//   ghosts   white silhouettes at your last known position while they hunt you
import * as THREE from 'three';
import { glowTexture } from '../textures.js';
import { Avatar } from '../avatar.js';

export const IR_LAYER = 1;
let stroMat;
function strobeMat() {
  if (!stroMat) stroMat = new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true });
  return stroMat;
}

// Strobes on an operator model: one on the helmet, one on each shoulder.
export function addStrobes(av) {
  const list = [];
  const put = (parent, x, y, z, s) => {
    const sp = new THREE.Sprite(strobeMat());
    sp.position.set(x, y, z);
    sp.scale.setScalar(s);
    sp.layers.set(IR_LAYER);
    parent.add(sp);
    list.push(sp);
  };
  if (av.head) put(av.head, 0, 0.2, 0.04, 0.32);
  if (av.spine) { put(av.spine, -0.2, 0.5, 0.06, 0.24); put(av.spine, 0.2, 0.5, 0.06, 0.24); }
  return list;
}
export function blinkStrobes(list, t, phase = 0) {
  const on = ((t + phase) * 1.1) % 1 < 0.1;
  for (const s of list) s.visible = on;
}

// An IR laser: a thin bright line plus a dot where it lands.
export class IRLaser {
  constructor(scene) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
    this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.line.frustumCulled = false;
    this.line.layers.set(IR_LAYER);
    this.dot = new THREE.Sprite(strobeMat());
    this.dot.scale.setScalar(0.18);
    this.dot.layers.set(IR_LAYER);
    scene.add(this.line, this.dot);
  }
  set(a, b, on = true) {
    this.line.visible = this.dot.visible = on;
    if (!on) return;
    const arr = this.line.geometry.attributes.position.array;
    arr[0] = a.x; arr[1] = a.y; arr[2] = a.z; arr[3] = b.x; arr[4] = b.y; arr[5] = b.z;
    this.line.geometry.attributes.position.needsUpdate = true;
    this.dot.position.copy(b);
  }
}

// A white, see-through silhouette of an operator (last known position).
let ghostMat;
export function ghostAvatar(look, scene) {
  if (!ghostMat) ghostMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uT; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 1.6); float p = 0.75 + 0.25 * sin(uT * 4.0); gl_FragColor = vec4(vec3(0.95, 0.97, 1.0) * (0.06 + f * 0.75) * p, 1.0); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const av = new Avatar('#ffffff', 31);
  av.setLook(look);
  av.root.traverse((o) => { if (o.isMesh) o.material = ghostMat; });
  av.setVisible(false);
  scene.add(av.root);
  return av;
}
export function tickGhosts(t) {
  if (ghostMat) ghostMat.uniforms.uT.value = t;
}
