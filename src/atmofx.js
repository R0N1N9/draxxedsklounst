// Atmospheric particles, shared by the valley duel and Sniper Cell:
//   motes    dust / pollen drifting with the wind around the camera (catch the light up close)
//   mist     low, slow banks of ground fog
//   flies    fireflies blinking near the ground (night only)
//   moths    little swarms circling each lamp (Sniper Cell; they scatter when a lamp dies)
// Everything wraps around the camera, so it costs the same wherever you are.
import * as THREE from 'three';

function softTex() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const MOTE_VS = `
  uniform float uTime, uSize; uniform vec3 uCam, uBox, uDrift; attribute float aSeed; varying float vA; varying float vS;
  void main(){
    vec3 p = position + uDrift * uTime * (0.6 + aSeed * 0.8);
    p += vec3(sin(uTime * 0.7 + aSeed * 40.0), sin(uTime * 0.5 + aSeed * 13.0) * 0.6, cos(uTime * 0.6 + aSeed * 27.0)) * 0.6;
    p = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float d = -mv.z;
    vA = smoothstep(0.5, 3.0, d) * (1.0 - smoothstep(uBox.x * 0.25, uBox.x * 0.5, d));
    vS = aSeed;
    gl_PointSize = uSize * (0.5 + aSeed) * 18.0 / max(d, 0.5);
    gl_Position = projectionMatrix * mv;
  }`;
const MOTE_FS = `
  uniform sampler2D uTex; uniform vec3 uColor; uniform float uBright, uTime; varying float vA; varying float vS;
  void main(){
    vec4 t = texture2D(uTex, gl_PointCoord);
    float tw = 0.65 + 0.35 * sin(uTime * (1.0 + vS * 3.0) + vS * 50.0);
    gl_FragColor = vec4(uColor * uBright * tw * t.a * vA, 1.0);
  }`;

export class AtmosFX {
  // opts: { quality, night, color, mistColor, bright, lamps: [{x,y,z,on}] }
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.opts = opts;
    this.t = 0;
    const q = opts.quality || 'medium';
    const k = q === 'low' ? 0.35 : q === 'medium' ? 0.7 : 1;
    this.tex = softTex();
    this.group = new THREE.Group();
    scene.add(this.group);
    // Dust motes.
    this.motes = this._points(Math.round(1400 * k), new THREE.Vector3(60, 22, 60), opts.color || '#c8d4ff', opts.bright ?? 0.5, 1.0, new THREE.Vector3(0.6, 0.05, 0.25));
    // Fireflies (night): fewer, brighter, warmer, slower, lower.
    if (opts.night) this.flies = this._points(Math.round(140 * k), new THREE.Vector3(120, 4, 120), '#d8ff70', 1.6, 2.6, new THREE.Vector3(0.1, 0.02, 0.08), 1.0);
    // Ground mist: big soft sprites drifting near the ground.
    this.mist = [];
    const mm = new THREE.SpriteMaterial({ map: this.tex, color: opts.mistColor || '#7d8cb0', transparent: true, opacity: opts.mistOpacity ?? 0.06, depthWrite: false, fog: false });
    for (let i = 0; i < Math.round(46 * k); i++) {
      const s = new THREE.Sprite(mm);
      const sc = 18 + Math.random() * 30;
      s.scale.set(sc * 1.8, sc * 0.45, 1);
      s.userData = { ox: (Math.random() - 0.5) * 300, oz: (Math.random() - 0.5) * 300, oy: 0.6 + Math.random() * 2.5, sp: 0.4 + Math.random() * 0.8 };
      this.group.add(s);
      this.mist.push(s);
    }
    // Moths around lamps.
    if (opts.lamps && opts.lamps.length) this._moths(opts.lamps, Math.round(12 * Math.max(k, 0.5)));
  }

  _points(n, box, color, bright, size, drift, floor = 0) {
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = Math.random() * box.x;
      pos[i * 3 + 1] = Math.random() * box.y + floor;
      pos[i * 3 + 2] = Math.random() * box.z;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSize: { value: size }, uCam: { value: new THREE.Vector3() }, uBox: { value: box }, uDrift: { value: drift }, uTex: { value: this.tex }, uColor: { value: new THREE.Color(color) }, uBright: { value: bright } },
      vertexShader: MOTE_VS, fragmentShader: MOTE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const p = new THREE.Points(geo, mat);
    p.frustumCulled = false;
    this.group.add(p);
    return p;
  }

  _moths(lamps, per) {
    const n = lamps.length * per;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n), ctr = new Float32Array(n * 3);
    lamps.forEach((L, li) => {
      for (let j = 0; j < per; j++) {
        const i = li * per + j;
        ctr.set([L.x, L.y - 0.2, L.z], i * 3);
        seed[i] = Math.random();
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.setAttribute('aCtr', new THREE.BufferAttribute(ctr, 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uTex: { value: this.tex } },
      vertexShader: `uniform float uTime; attribute float aSeed; attribute vec3 aCtr; varying float vA;
        void main(){
          float a = uTime * (2.0 + aSeed * 4.0) + aSeed * 60.0;
          vec3 p = aCtr + vec3(cos(a) * (0.4 + aSeed * 0.9), sin(a * 1.7) * 0.4 - 0.3, sin(a * 1.3) * (0.4 + aSeed * 0.9));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vA = aCtr.y > -100.0 ? 1.0 : 0.0;
          gl_PointSize = 22.0 / max(-mv.z, 0.5);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform sampler2D uTex; varying float vA; void main(){ float a = texture2D(uTex, gl_PointCoord).a; gl_FragColor = vec4(vec3(1.0, 0.92, 0.75) * a * 0.9 * vA, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.mothPts = new THREE.Points(geo, mat);
    this.mothPts.frustumCulled = false;
    this.mothLamps = lamps;
    this.mothPer = per;
    this.group.add(this.mothPts);
  }

  // Lamps that went dark lose their moths.
  syncLamps() {
    if (!this.mothPts) return;
    const ctr = this.mothPts.geometry.attributes.aCtr;
    this.mothLamps.forEach((L, li) => {
      for (let j = 0; j < this.mothPer; j++) ctr.array[(li * this.mothPer + j) * 3 + 1] = L.on === false ? -999 : L.y - 0.2;
    });
    ctr.needsUpdate = true;
  }

  // wind: THREE.Vector2 (x, z m/s) — drifts the motes and the mist.
  update(dt, camera, wind, groundAt) {
    this.t += dt;
    const c = camera.position;
    const w = wind || { x: 0.6, y: 0.25 };
    for (const P of [this.motes, this.flies]) {
      if (!P) continue;
      const u = P.material.uniforms;
      u.uTime.value = this.t;
      u.uCam.value.copy(c);
      if (P === this.motes) u.uDrift.value.set(w.x * 0.6, 0.04, w.y * 0.6);
    }
    if (this.flies) this.flies.material.uniforms.uCam.value.set(c.x, (groundAt ? groundAt(c.x, c.z) : 0) + 2, c.z);
    for (const s of this.mist) {
      const U = s.userData;
      U.ox += w.x * dt * U.sp * 0.4;
      U.oz += w.y * dt * U.sp * 0.4;
      const wrap = (v) => ((((v + 150) % 300) + 300) % 300) - 150;
      const x = c.x + wrap(U.ox - c.x), z = c.z + wrap(U.oz - c.z);
      U.ox = x; U.oz = z;
      s.position.set(x, (groundAt ? groundAt(x, z) : 0) + U.oy, z);
    }
    if (this.mothPts) this.mothPts.material.uniforms.uTime.value = this.t;
  }
}
