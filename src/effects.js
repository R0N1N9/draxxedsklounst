import * as THREE from 'three';
import { puffTexture, glowTexture, glintTexture } from './textures.js';

const PUFF_COLORS = {
  dirt: new THREE.Color('#a48b72'),
  rock: new THREE.Color('#a9a2aa'),
  concrete: new THREE.Color('#c4bcbc'),
  wood: new THREE.Color('#9a7d62'),
  metal: new THREE.Color('#ffcf8a'),
  body: new THREE.Color('#7a2a2a'),
  dust: new THREE.Color('#9e8c78'),
};

// Sprites whose on-screen size stays constant regardless of zoom / distance.
export function screenSprite(sprite, camera, fraction) {
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const d = sprite.position.distanceTo(camera.position);
  sprite.scale.setScalar(fraction * 2 * Math.tan(fov / 2) * d);
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.puffs = [];
    this.flashes = [];
    this.tracers = [];
    const puffMat = new THREE.SpriteMaterial({ map: puffTexture(), transparent: true, depthWrite: false });
    for (let i = 0; i < 48; i++) {
      const s = new THREE.Sprite(puffMat.clone());
      s.visible = false;
      scene.add(s);
      this.puffs.push({ s, age: 1e9, life: 1, size: 1, vel: new THREE.Vector3() });
    }
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffc88a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.visible = false;
      scene.add(s);
      const light = new THREE.PointLight(0xffaa66, 0, 25, 2);
      scene.add(light);
      this.flashes.push({ s, light, age: 1e9 });
    }
    this.glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTexture(), color: 0xfff4e0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.glint.visible = false;
    this.glint.renderOrder = 5;
    scene.add(this.glint);
    this.bulletGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.0, 5).rotateX(Math.PI / 2);
    this.bulletMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(3, 2.2, 1.2) });
  }

  puff(pos, mat, size = 1.5, life = 1.3) {
    let p = this.puffs.find((q) => q.age > q.life);
    if (!p) p = this.puffs[0];
    p.age = 0;
    p.life = life;
    p.size = size;
    p.s.position.copy(pos);
    p.vel.set((Math.random() - 0.5) * 0.6, 0.8 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6);
    p.s.material.color.copy(PUFF_COLORS[mat] || PUFF_COLORS.dirt);
    p.s.material.blending = mat === 'metal' ? THREE.AdditiveBlending : THREE.NormalBlending;
    p.s.material.rotation = Math.random() * 6;
    p.s.visible = true;
  }

  impact(pos, normal, mat) {
    const n = normal || new THREE.Vector3(0, 1, 0);
    const base = pos.clone().addScaledVector(n, 0.2);
    this.puff(base, mat, 1.8, 1.6);
    this.puff(base.clone().addScaledVector(n, 0.6).add(new THREE.Vector3(0, 0.4, 0)), mat, 1.2, 1.1);
    if (mat === 'metal') this.puff(base, 'metal', 0.8, 0.25);
  }

  muzzle(pos, dir) {
    let f = this.flashes.find((q) => q.age > 0.12) || this.flashes[0];
    f.age = 0;
    f.s.position.copy(pos).addScaledVector(dir, 0.9);
    f.light.position.copy(f.s.position);
    f.s.visible = true;
    f.s.material.rotation = Math.random() * 6;
  }

  addTracer(p, v, faint) {
    const mesh = new THREE.Mesh(this.bulletGeo, this.bulletMat);
    mesh.position.copy(p);
    this.scene.add(mesh);
    const N = 24;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) pos.set([p.x, p.y, p.z], i * 3);
    const col = new Float32Array(N * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    line.frustumCulled = false;
    this.scene.add(line);
    const tr = { mesh, line, pos, col, N, head: 0, faint, dead: false, fade: 1, timer: 0 };
    this.tracers.push(tr);
    return tr;
  }

  moveTracer(tr, p, v) {
    tr.mesh.position.copy(p);
    tr.mesh.lookAt(p.x + v.x, p.y + v.y, p.z + v.z);
    tr.timer += 1;
    // Shift trail: newest first.
    tr.pos.copyWithin(3, 0, (tr.N - 1) * 3);
    tr.pos[0] = p.x; tr.pos[1] = p.y; tr.pos[2] = p.z;
    tr.line.geometry.attributes.position.needsUpdate = true;
  }

  killTracer(tr) {
    tr.dead = true;
    tr.mesh.visible = false;
  }

  update(dt, camera) {
    for (const p of this.puffs) {
      if (p.age > p.life) continue;
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) { p.s.visible = false; continue; }
      p.s.position.addScaledVector(p.vel, dt);
      p.s.scale.setScalar(p.size * (0.4 + Math.sqrt(k) * 1.6));
      p.s.material.opacity = (1 - k) * (1 - k) * 0.9;
    }
    for (const f of this.flashes) {
      if (f.age > 0.12) { f.s.visible = false; f.light.intensity = 0; continue; }
      f.age += dt;
      const k = 1 - f.age / 0.12;
      screenSprite(f.s, camera, 0.05 * k + 0.012);
      f.s.material.opacity = k;
      f.light.intensity = 40 * k;
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      const base = tr.faint ? 0.35 : 1.0;
      if (tr.dead) tr.fade -= dt * 2.5;
      const f = Math.max(tr.fade, 0) * base;
      for (let j = 0; j < tr.N; j++) {
        const a = (1 - j / tr.N) * f;
        tr.col[j * 3] = 1.0 * a; tr.col[j * 3 + 1] = 0.75 * a; tr.col[j * 3 + 2] = 0.5 * a;
      }
      tr.line.geometry.attributes.color.needsUpdate = true;
      if (tr.fade <= 0) {
        this.scene.remove(tr.mesh, tr.line);
        tr.line.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }

  setGlint(pos, intensity, camera) {
    if (intensity <= 0.01) { this.glint.visible = false; return; }
    this.glint.visible = true;
    this.glint.position.copy(pos);
    this.glint.material.opacity = Math.min(1, intensity * 1.4);
    this.glint.material.rotation = 0;
    screenSprite(this.glint, camera, 0.02 + 0.06 * intensity);
  }
}
