// Sniper Cell — the extraction vehicle: a blacked-out electric crossover in the spirit of a
// retro-futurist hatchback (flat clamshell bonnet, sharp creased doors, pixel-grid lamps,
// big aero wheels), kitted for the job with a roof rack, light bar and push bar. No badges.
// Local frame: wheels on the ground at y = 0, nose toward -Z, driver on the left (-X).
import * as THREE from 'three';
import { lam } from './facility.js';

export const SEATS = {
  driver: { x: -0.42, y: 0.78, z: -0.15, door: { x: -1.3, z: -0.35 } },
  passenger: { x: 0.42, y: 0.78, z: -0.15, door: { x: 1.3, z: -0.35 } },
};

export function buildVan() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const paint = '#2a2d32', trim = '#121316', glassC = '#07090c';
  const mk = (geo, col, x, y, z, parent = body, opts) => { const m = new THREE.Mesh(geo, lam(col, opts)); m.position.set(x, y, z); parent.add(m); return m; };
  const glow = (geo, col, x, y, z, parent = body, k = 2) => mk(geo, col, x, y, z, parent, { emissive: col, emissiveIntensity: k });
  // Side profile, extruded across the width: low clamshell bonnet, raked screen, long flat roof, near-vertical hatch.
  const s = new THREE.Shape();
  const prof = [[-2.32, 0.32], [-2.34, 0.84], [-2.1, 0.98], [-0.95, 1.06], [-0.45, 1.56], [1.72, 1.6], [2.28, 1.22], [2.32, 0.32]];
  s.moveTo(prof[0][0], prof[0][1]);
  for (const [x, y] of prof.slice(1)) s.lineTo(x, y);
  const W = 1.86;
  const shell = new THREE.ExtrudeGeometry(s, { depth: W, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 });
  shell.rotateY(-Math.PI / 2).translate(W / 2, 0, 0);
  mk(shell, paint, 0, 0, 0);
  // Glasshouse: screen, side glass, rear glass (dark, faintly reflective).
  const screen = mk(new THREE.PlaneGeometry(1.62, 0.66), glassC, 0, 1.32, -0.7, body, { emissive: '#0c1622', emissiveIntensity: 0.6 });
  screen.rotation.x = -0.86;
  for (const sx of [-1, 1]) {
    const side = mk(new THREE.PlaneGeometry(2.2, 0.4), glassC, sx * (W / 2 + 0.045), 1.33, 0.62, body, { emissive: '#0c1622', emissiveIntensity: 0.5, side: THREE.DoubleSide });
    side.rotation.y = Math.PI / 2;
    // The sharp diagonal crease across the doors.
    const crease = mk(new THREE.BoxGeometry(0.02, 0.03, 2.6), trim, sx * (W / 2 + 0.05), 0.72, 0.2);
    crease.rotation.x = -0.12;
    mk(new THREE.BoxGeometry(0.02, 0.05, 4.4), trim, sx * (W / 2 + 0.045), 0.42, 0);
  }
  const rear = mk(new THREE.PlaneGeometry(1.5, 0.34), glassC, 0, 1.38, 2.0, body, { emissive: '#0c1622', emissiveIntensity: 0.4 });
  rear.rotation.x = 0.6;
  // Pixel-grid lamps: front squares and a full-width rear bar.
  const head = [], tail = [];
  for (const sx of [-1, 1]) for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) head.push(glow(new THREE.BoxGeometry(0.05, 0.05, 0.02), '#e8f4ff', sx * (0.55 + c * 0.075), 0.8 + r * 0.075, -2.37, body, 2.5));
  for (let c = 0; c < 22; c++) tail.push(glow(new THREE.BoxGeometry(0.05, 0.05, 0.02), '#ff2030', -0.78 + c * 0.075, 1.08, 2.36, body, 2));
  glow(new THREE.BoxGeometry(1.5, 0.02, 0.02), '#e8f4ff', 0, 0.98, -2.12, body, 1.2);
  // Tactical kit: push bar, roof rack, light bar, antenna, mud flaps.
  for (const sx of [-1, 1]) mk(new THREE.BoxGeometry(0.06, 0.5, 0.06), trim, sx * 0.55, 0.55, -2.45);
  mk(new THREE.BoxGeometry(1.3, 0.06, 0.06), trim, 0, 0.78, -2.48);
  mk(new THREE.BoxGeometry(1.3, 0.06, 0.06), trim, 0, 0.42, -2.48);
  for (const sx of [-1, 1]) mk(new THREE.BoxGeometry(0.05, 0.05, 2.4), trim, sx * 0.72, 1.66, 0.55);
  for (const z of [-0.4, 0.6, 1.5]) mk(new THREE.BoxGeometry(1.48, 0.04, 0.05), trim, 0, 1.68, z);
  mk(new THREE.BoxGeometry(1.2, 0.09, 0.12), trim, 0, 1.72, -0.48);
  const bar = [];
  for (let c = 0; c < 8; c++) bar.push(glow(new THREE.BoxGeometry(0.11, 0.05, 0.02), '#d8ecff', -0.5 + c * 0.143, 1.72, -0.55, body, 0.2));
  mk(new THREE.CylinderGeometry(0.008, 0.008, 0.9, 4), trim, 0.6, 2.05, 1.7);
  // Wheels: big aero discs with a pixel pattern.
  const wheels = [];
  for (const [sx, z] of [[-1, -1.5], [1, -1.5], [-1, 1.5], [1, 1.5]]) {
    const w = new THREE.Group();
    w.position.set(sx * 0.86, 0.38, z);
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.26, 20).rotateZ(Math.PI / 2), lam('#0e0e10'));
    w.add(tyre);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.27, 16).rotateZ(Math.PI / 2), lam('#3a3d42'));
    w.add(rim);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const sq = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.06), lam('#16171a'));
      sq.position.set(sx * 0.14, Math.sin(a) * 0.17, Math.cos(a) * 0.17);
      w.add(sq);
    }
    g.add(w);
    wheels.push(w);
  }
  // Front doors that swing open on their front hinge.
  const doors = {};
  for (const [key, sx] of [['driver', -1], ['passenger', 1]]) {
    const hinge = new THREE.Group();
    hinge.position.set(sx * (W / 2 + 0.02), 0, -0.9);
    const panel = mk(new THREE.BoxGeometry(0.05, 0.72, 1.12), paint, 0, 0.72, 0.58, hinge);
    mk(new THREE.PlaneGeometry(1.0, 0.36), glassC, sx * 0.03, 1.3, 0.62, hinge, { emissive: '#0c1622', emissiveIntensity: 0.5, side: THREE.DoubleSide }).rotation.y = Math.PI / 2;
    // Flush handle with a light strip.
    glow(new THREE.BoxGeometry(0.02, 0.02, 0.2), '#80c8ff', sx * 0.03, 0.98, 0.95, hinge, 0.8);
    void panel;
    g.add(hinge);
    doors[key] = { hinge, sx, open: 0 };
  }
  // Seats and a dash glow (seen from inside).
  for (const sx of [-1, 1]) {
    mk(new THREE.BoxGeometry(0.5, 0.12, 0.5), '#1b1c1f', sx * 0.42, 0.6, -0.1);
    mk(new THREE.BoxGeometry(0.5, 0.65, 0.12), '#1b1c1f', sx * 0.42, 0.95, 0.18);
  }
  glow(new THREE.BoxGeometry(1.3, 0.12, 0.02), '#30b0ff', 0, 1.0, -0.98, body, 0.8);
  // Headlight beams (only when running).
  const beams = [];
  for (const sx of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(3, 18, 16, 1, true).translate(0, -9, 0).rotateX(Math.PI / 2), new THREE.ShaderMaterial({
      // Soft headlight volume: fades along its length and toward its edges.
      vertexShader: 'varying float vD; varying vec3 vN; varying vec3 vV; void main(){ vD = clamp(length(position) / 18.0, 0.0, 1.0); vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vD; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.5); gl_FragColor = vec4(vec3(0.8, 0.88, 1.0) * (1.0 - vD) * (1.0 - vD) * 0.07 * f, 1.0); }',
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    c.position.set(sx * 0.66, 0.85, -2.4);
    c.rotation.x = -0.06;
    c.visible = false;
    g.add(c);
    beams.push(c);
  }
  g.userData = { body, wheels, doors, head, tail, bar, beams };
  return g;
}

export function setVanLights(van, on, t = 0) {
  const U = van.userData;
  for (const b of U.beams) b.visible = on;
  for (const m of U.bar) m.material.emissiveIntensity = on ? (Math.sin(t * 8) > 0 ? 2.5 : 0.4) : 0.2;
}
