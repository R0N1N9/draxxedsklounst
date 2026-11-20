// =============================================================================
// SNIPER CELL: INFILTRATION
// =============================================================================
// A night stealth mission for two: the SHOOTER (default callsign Ra) works a suppressed
// bolt-action rifle and active camo from the high ground; the SPOTTER (default callsign
// Rōnin) carries only a pistol, a recon quadcopter and the CYBER OPS tablet — the
// top-down console that hacks cameras and doors, scans, tags, cuts lights and drops
// supplies. Together they break into the Kestrel Ridge data center, upload malware to the
// cold-archive server, pull its drive and carry it out to the landing zone.
//
// Solo: pick a role and the AI plays the other one (Ra holds a perch and takes the shots
// you tag; Rōnin runs the console for you). Co-op: the host picks a role, the guest gets
// the other. The host runs SENTINEL (guards, drones, cameras, alarm, objectives); each
// client simulates its own operator and judges its own shots, exactly like the duel.
// Mission rules are adapted from Cold Archive (see sentinel.js / ops.js).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { hazeUniforms } from '../atmosphere.js';
import { LocalPlayer } from '../player.js';
import { Avatar } from '../avatar.js';
import { ViewModel } from '../viewmodel.js';
import { Effects } from '../effects.js';
import { Input } from '../input.js';
import { WEAPON, PLAYER } from '../config.js';
import { RULES, applyRules } from '../rules.js';
import { clamp, segSegClosest } from '../util.js';
import { Facility, SPOTS, FENCE, BUILDING, terrainHeight, lam, glowMat } from './facility.js';
import { Sentinel, DIFFS, guardCapsules, buildDrone, angDiff } from './sentinel.js';
import { Ops, AiSpotter, PAYLOAD, HACK } from './ops.js';
import { Tablet } from './tablet.js';

export const ROLES = {
  shooter: { name: 'SHOOTER', call: 'Ra', color: '#f2b35b', desc: 'Suppressed KR-50 bolt-action, active camo, P-9 sidearm. The cell’s firepower.' },
  spotter: { name: 'SPOTTER', call: 'Rōnin', color: '#40d8e8', desc: 'P-9 and two magazines. CYBER OPS tablet, recon quadcopter, hacks, scans and supply drops.' },
};

// Weapons for this mode. Halo-style ballistics: hitscan, dead straight, no wind or sway.
const KR50 = {
  key: 'kr50', name: 'KR-50 NIGHTJAR', short: 'KR-50', caliber: '.50 subsonic', slot: 'rifle', kind: 'bolt',
  mag: 4, spareMags: 4, muzzle: 900, damage: { head: 400, torso: 260, legs: 130 }, cycle: 1.0, reload: 2.8, reloadEmpty: 3.4,
  zooms: [2, 8], scope: true, glint: 0, recoil: 0.034, sway: 0, fixedZero: 100,
};
const P9 = {
  key: 'm18', name: 'P-9', short: 'P-9', caliber: '9 mm', slot: 'pistol', kind: 'semi',
  mag: 12, spareMags: 2, muzzle: 380, damage: { head: 150, torso: 50, legs: 35 }, cycle: 0.24, reload: 1.4, reloadEmpty: 1.8,
  zooms: [1], scope: false, adsFov: 46, fixedZero: 25, glint: 0, recoil: 0.03, sway: 0,
};

export const OBJECTIVES = [
  { k: 'perimeter', title: 'BREACH THE PERIMETER', hint: 'Get inside the fence — the cut on the west side or the south gate.' },
  { k: 'relay', title: 'TAP THE NETWORK', hint: 'Plant a relay in the Electrical Room (SE corner). Opens the data floor to Overwatch.' },
  { k: 'badge', title: 'LIFT THE SITE CHIEF’S BADGE', hint: 'Drop the Site Chief (violet visor) and take the badge off him.' },
  { k: 'vault', title: 'BREACH THE COLD VAULT', hint: 'Badge-holder at the vault door; Overwatch holds CRACK on the tablet.' },
  { k: 'upload', title: 'UPLOAD THE MALWARE', hint: 'Hold the vault console while it uploads. Overwatch fights SENTINEL’s trace.' },
  { k: 'drive', title: 'PULL THE DRIVE', hint: 'Pull the archive drive (hold E). The whole facility locks down.' },
  { k: 'exfil', title: 'EXFILTRATE', hint: 'Carry the drive out the loading dock to the LZ east of the fence.' },
];

const BLEED = 16;

// ---------------------------------------------------------------------------
// Post: night vision (goggles / scope / quad feed), active-camo shimmer, damage, grain.
// ---------------------------------------------------------------------------
const CellShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
    uNV: { value: 0 }, uMode: { value: 0 }, uCloak: { value: 0 }, uDamage: { value: 0 }, uDown: { value: 0 }, uStatic: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uNV, uMode, uCloak, uDamage, uDown, uStatic; uniform vec2 uRes; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      vec2 d = uv - 0.5; d.x *= uRes.x / uRes.y; float r = length(d);
      // Active camo: the edges of your view ripple like heat over glass.
      if (uCloak > 0.0) uv += vec2(sin(uv.y * 40.0 + uTime * 6.0), cos(uv.x * 36.0 + uTime * 5.0)) * 0.0022 * uCloak * smoothstep(0.25, 0.75, r);
      vec3 c = texture2D(tDiffuse, uv).rgb;
      float g = hash(uv * uRes + fract(uTime) * 91.7) - 0.5;
      if (uNV > 0.0) {
        float l = dot(c, vec3(0.3, 0.59, 0.11));
        float amp = uMode > 1.5 ? 7.0 : 9.0;
        float v = 1.0 - exp(-l * amp);
        vec3 tint = uMode > 1.5 ? vec3(0.85, 0.95, 1.0) : uMode > 0.5 ? vec3(0.35, 1.0, 0.75) : vec3(0.3, 1.0, 0.38);
        vec3 nv = tint * (v * 0.95 + 0.03) + g * 0.07;
        nv *= 0.92 + 0.08 * sin(uv.y * uRes.y * 1.4);
        nv += tint * smoothstep(0.6, 3.0, l) * 0.25; // lamps bloom out
        nv *= mix(1.0, smoothstep(0.95, 0.35, r), 0.55);
        nv += uStatic * (hash(vec2(floor(uv.y * uRes.y / 3.0), floor(uTime * 24.0))) - 0.5) * 0.25;
        c = mix(c, nv, uNV);
      } else {
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c *= mix(vec3(0.86, 0.95, 1.18), vec3(1.05, 1.0, 0.92), smoothstep(0.02, 0.5, l));
        c += g * 0.012 * (0.3 + l);
      }
      if (uCloak > 0.0) c = mix(c, c * vec3(0.8, 0.95, 1.15), 0.4 * uCloak);
      float vig = smoothstep(1.0, 0.25, r);
      c *= mix(0.72, 1.0, vig);
      c = mix(c, vec3(0.45, 0.02, 0.04), uDamage * (1.0 - vig) * 0.9);
      c = mix(c, vec3(dot(c, vec3(0.33))) * vec3(0.9, 0.35, 0.35), uDown * 0.7);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

// Shimmering active-camo material for an operator seen from outside.
function cloakMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFlick: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vW; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uTime, uFlick; varying vec3 vN; varying vec3 vV; varying vec3 vW; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.5); float band = 0.5 + 0.5 * sin(vW.y * 18.0 - uTime * 7.0 + vW.x * 3.0); vec3 c = vec3(0.55, 0.75, 1.0) * (f * (0.22 + 0.25 * band) + uFlick * 0.25); gl_FragColor = vec4(c, 0.08 + f * 0.35 + uFlick * 0.3); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

// The beefy suppressed bolt gun for the first-person view. Same anchor contract as the
// valley's rifles (gripR / gripL / muzzle / bolt / boltKnob / mag / sight).
function buildKR50() {
  const g = new THREE.Group();
  const mat = (hex) => new THREE.MeshLambertMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.14 });
  const M = { body: mat('#2a2d31'), dark: mat('#17181b'), hi: mat('#3a3e44'), olive: mat('#3b3f36'), glow: new THREE.MeshBasicMaterial({ color: '#40ffb0' }) };
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
  const cyl = (r1, r2, len, m, x, y, z, seg = 14) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, seg).rotateX(Math.PI / 2), m); o.position.set(x, y, z); g.add(o); return o; };
  // Thick slab receiver and a long boxy shroud, Halo-scale bulk.
  box(0.075, 0.085, 0.42, M.body, 0, 0.01, -0.12);
  box(0.08, 0.03, 0.42, M.hi, 0, 0.06, -0.12);
  box(0.07, 0.075, 0.62, M.body, 0, 0.0, -0.62);
  box(0.074, 0.02, 0.6, M.dark, 0, 0.045, -0.62);
  for (let i = 0; i < 7; i++) for (const s of [-1, 1]) box(0.004, 0.03, 0.05, M.dark, s * 0.038, 0.0, -0.4 - i * 0.075);
  // Fat integral suppressor.
  cyl(0.042, 0.042, 0.38, M.dark, 0, 0.0, -1.12, 16);
  cyl(0.044, 0.044, 0.02, M.hi, 0, 0.0, -0.94, 16);
  cyl(0.044, 0.044, 0.02, M.hi, 0, 0.0, -1.3, 16);
  // Grip, trigger guard, mag well, thumbhole stock.
  const grip = box(0.04, 0.12, 0.055, M.olive, 0, -0.08, 0.02);
  grip.rotation.x = 0.3;
  box(0.01, 0.01, 0.08, M.dark, 0, -0.045, -0.04);
  const magG = new THREE.Group();
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.11, 0.1), M.dark);
  mag.position.y = -0.05;
  magG.add(mag);
  magG.position.set(0, -0.03, -0.12);
  g.add(magG);
  box(0.06, 0.09, 0.3, M.olive, 0, -0.01, 0.2);
  box(0.06, 0.15, 0.04, M.dark, 0, -0.03, 0.36);
  box(0.05, 0.04, 0.12, M.olive, 0, 0.055, 0.16);
  // Bolt with a big ball knob.
  const bolt = new THREE.Group();
  bolt.add(new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.12, 10).rotateX(Math.PI / 2), M.hi));
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.012, 0.014), M.hi);
  arm.position.set(0.03, 0, 0.03);
  bolt.add(arm);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), M.dark);
  knob.position.set(0.06, 0, 0.03);
  bolt.add(knob);
  bolt.position.set(0, 0.035, -0.02);
  g.add(bolt);
  // Night-vision scope: big objective, glowing battery tell.
  const sy = 0.115;
  cyl(0.024, 0.024, 0.34, M.dark, 0, sy, -0.18, 14);
  cyl(0.04, 0.026, 0.1, M.dark, 0, sy, -0.39, 16);
  cyl(0.028, 0.03, 0.08, M.dark, 0, sy, 0.02, 14);
  box(0.05, 0.03, 0.06, M.hi, 0.03, sy, -0.16);
  box(0.012, 0.012, 0.012, M.glow, 0.056, sy + 0.005, -0.16);
  for (const z of [-0.08, -0.28]) box(0.03, 0.06, 0.03, M.dark, 0, 0.075, z);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.024, 16), new THREE.MeshBasicMaterial({ color: '#07160e' }));
  lens.position.set(0, sy, 0.062);
  g.add(lens);
  const anchor = (x, y, z) => { const a = new THREE.Object3D(); a.position.set(x, y, z); g.add(a); return a; };
  g.userData = {
    gripR: anchor(0, -0.09, 0.03), gripL: anchor(-0.005, -0.04, -0.5), muzzle: anchor(0, 0, -1.33),
    bolt, boltKnob: anchor(0.06, 0.035, 0.01), mag: magG, magHome: magG.position.clone(), sight: sy,
  };
  return g;
}

function buildHeli() {
  const g = new THREE.Group();
  const m = (geo, col, x, y, z) => { const o = new THREE.Mesh(geo, lam(col)); o.position.set(x, y, z); g.add(o); return o; };
  m(new THREE.BoxGeometry(2.6, 2.2, 7), '#2b2e33', 0, 0, 0);
  m(new THREE.BoxGeometry(2.2, 1.6, 2), '#1d2024', 0, 0.1, -4.2);
  m(new THREE.BoxGeometry(0.6, 0.6, 6), '#2b2e33', 0, 0.5, 6);
  m(new THREE.BoxGeometry(0.2, 2, 1.2), '#2b2e33', 0, 1.4, 8.8);
  const rotor = m(new THREE.BoxGeometry(14, 0.06, 0.4), '#111', 0, 1.6, 0);
  const rotor2 = m(new THREE.BoxGeometry(0.4, 0.06, 14), '#111', 0, 1.6, 0);
  for (const s of [-1, 1]) m(new THREE.BoxGeometry(0.15, 0.15, 5), '#18191c', s * 1.1, -1.6, 0);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff3030' }));
  light.position.set(0, 1.2, 8.9);
  g.add(light);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(4, 14, 18, 1, true).translate(0, -7, 0), glowMat('#e8f4ff', 0.06));
  beam.position.set(0, -1, -3);
  g.add(beam);
  g.userData = { rotor, rotor2, light };
  return g;
}

function buildCrate() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.6), lam('#3b4a35'));
  b.position.y = 0.3;
  g.add(b);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.08, 0.62), new THREE.MeshBasicMaterial({ color: '#40ffb0' }));
  strip.position.y = 0.45;
  g.add(strip);
  const chute = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), lam('#5a5a4a', { side: THREE.DoubleSide }));
  chute.position.y = 3.2;
  g.add(chute);
  g.userData = { chute };
  return g;
}

function buildSky(scene) {
  const geo = new THREE.SphereGeometry(1800, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uMoon: { value: new THREE.Vector3(-0.35, 0.42, -0.84).normalize() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uMoon; varying vec3 vD;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
      void main(){
        float y = max(vD.y, 0.0);
        vec3 c = mix(vec3(0.035,0.05,0.09), vec3(0.008,0.012,0.03), pow(y, 0.5));
        float m = max(dot(vD, uMoon), 0.0);
        c += vec3(0.18,0.24,0.36) * pow(m, 18.0) * 0.6 + vec3(0.5,0.6,0.8) * pow(m, 900.0) * 3.0;
        vec3 q = floor(vD * 420.0);
        float s = step(0.9975, h(q)) * smoothstep(0.02, 0.25, y);
        c += vec3(0.8, 0.85, 1.0) * s * (0.4 + 0.6 * h(q + 1.0));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.renderOrder = -10;
  scene.add(sky);
  // The moon itself.
  const moon = new THREE.Mesh(new THREE.CircleGeometry(38, 32), new THREE.MeshBasicMaterial({ color: '#dfe8ff', fog: false }));
  const md = new THREE.Vector3(-0.35, 0.42, -0.84).normalize().multiplyScalar(1600);
  moon.position.copy(md);
  moon.lookAt(0, 0, 0);
  scene.add(moon);
  return { sky, moon };
}

// ---------------------------------------------------------------------------
export class CellGame {
  constructor({ mode, net, role, diff = 'operative', seed = 7, quality = 'medium', settings, audio, name, partnerName }) {
    this.mode = mode; // 'solo' | 'host' | 'guest'
    this.isHost = mode !== 'guest';
    this.solo = mode === 'solo';
    this.net = net || null;
    this.role = role;
    this.partnerRole = role === 'shooter' ? 'spotter' : 'shooter';
    this.name = name || ROLES[role].call;
    this.partnerName = partnerName || ROLES[this.partnerRole].call;
    this.diff = diff;
    this.D = DIFFS[diff] || DIFFS.operative;
    this.quality = quality;
    this.settings = settings || {};
    this.audio = audio;
    this.t = 0;
    this.paused = false;
    this.ended = null;

    // Halo-style ballistics for this mode: instant, straight, no sway.
    applyRules({ preset: 'halo' });
    RULES.zooms = null;
    RULES.hitbox = 1.15;

    this._initRenderer();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(WEAPON.baseFov, innerWidth / innerHeight, 0.05, 4000);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this._lights();
    buildSky(this.scene);
    this.fac = new Facility(this.scene, quality);
    this.sentinel = new Sentinel(this, { diff, seed, sim: this.isHost });
    this.effects = new Effects(this.scene);
    this.input = new Input(this.renderer.domElement, document.getElementById('touch'));
    this.input.sensitivity = this.settings.sensitivity || 1;
    this.input.invertY = !!this.settings.invertY;
    this.input.scopeToggle = !!this.settings.scopeToggle;
    for (const k of ['touchSensR', 'touchSensL', 'gyroMode', 'gyroSens', 'gyroInvertY']) if (this.settings[k] !== undefined) this.input[k] = this.settings[k];

    // Mission state (host-authoritative; mirrored on the guest).
    this.obj = { perimeter: false, relay: false, badge: null, vault: false, upload: 0, uploading: false, trace: 0, traced: false, drive: null, driveAt: null, exfil: false, access: 1, drops: this.D.drops, canCrack: false, crack: 0, step: 0 };
    this.crates = [];
    this.crateId = 1;
    this.prompts = {}; // role -> { label, p }
    this.holdT = {}; // role -> { key, t }
    this.revive = {};
    this.medevac = null;
    this.trails = [];
    this.pins = []; // waypoints / requests { x, z, label, by, t }
    this.commsLog = [];
    this.stats = { shots: 0, hits: 0, heads: 0, longest: 0, t0: 0 };

    this._setupPlayer();
    this._setupPartner();
    this.ops = this.role === 'spotter' ? new Ops(this) : this.solo ? new Ops(this) : null;
    this.aiSpot = this.solo && this.role === 'shooter' ? new AiSpotter(this, this.ops) : null;
    this.aiShoot = this.solo && this.role === 'spotter' ? { perch: 0, cool: 3, aim: null, aimT: 0, moveT: 0, sayT: 0 } : null;
    this.quad = null;
    this.quadCd = 0;
    this._buildHud();
    this.tablet = new Tablet(this);
    if (this.net) this._setupNet();

    this._resize();
    addEventListener('resize', () => this._resize());
    this.clock = new THREE.Clock();
    this.comms(this.role === 'shooter' ? 'Ra in position. Kestrel Ridge below — lights in the yard, towers manned.' : 'Rōnin on the wire. CYBER OPS console synced (TAB).', ROLES[this.role].color, this.name);
    this.comms(this.solo ? (this.role === 'shooter' ? 'Rōnin (AI) runs the console for you. TAB for the map and requests.' : 'Ra (AI) holds the cliff. Tag targets (F, or tap them on the tablet) and Ra takes the shot.') : `${this.partnerName} is the ${ROLES[this.partnerRole].name.toLowerCase()}.`, 'dim');
    this.renderer.setAnimationLoop(() => this._frame());
  }

  // ---- setup ---------------------------------------------------------------------
  _initRenderer() {
    const canvas = document.getElementById('game');
    const q = this.quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: q === 'low', powerPreference: 'high-performance', stencil: false });
    this.pr = q === 'high' ? Math.min(devicePixelRatio, 2) : q === 'medium' ? Math.min(devicePixelRatio, 1.5) : Math.min(devicePixelRatio, 1);
    this.renderer.setPixelRatio(this.pr);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
  }

  _lights() {
    this.hemi = new THREE.HemisphereLight('#5a70a0', '#141821', 2.1);
    this.moonLight = new THREE.DirectionalLight('#9fb6ff', 1.1);
    this.moonLight.position.set(-350, 420, -840);
    this.scene.add(this.hemi, this.moonLight);
    // Night haze: low ground mist that the cliff sits above.
    hazeUniforms.uHazeColor.value.set('#0b1220');
    hazeUniforms.uHazeSunColor.value.set('#22324e');
    hazeUniforms.uSunDir.value.set(-0.35, 0.42, -0.84).normalize();
    hazeUniforms.uHazeDensity.value = 0.0042;
    hazeUniforms.uHazeFloor.value = 0.22;
    hazeUniforms.uHazeFalloff.value = 22;
    hazeUniforms.uHazeBase.value = 0;
    this.renderer.setClearColor('#050810');
    // A fixed set of point lights (counts never change, so shaders compile once).
    this.points = [];
    const add = (x, y, z, col, I, d, zone) => { const L = new THREE.PointLight(col, I, d, 1.6); L.position.set(x, y, z); this.scene.add(L); this.points.push({ L, I, zone }); };
    for (const t of [[-73, -53], [73, -53], [-73, 53], [73, 53]]) add(t[0] * 0.95, 8, t[1] * 0.95, '#ffe2b0', 60, 40, 'yard');
    add(11, 4, 54, '#ffcf8a', 25, 20, 'yard');
    add(0, 4, 3, '#ffd9a0', 22, 18, 'yard');
    add(0, 6, -12, '#d8e4ff', 26, 22, 'floor');
    add(-18, 6, -30, '#d8e4ff', 22, 24, 'floor');
    add(24, 6, -31, '#b8d0ff', 22, 20, 'core');
  }

  _initComposer() {
    if (this.composer) return;
    const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: this.quality === 'high' ? 4 : 0 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (this.quality !== 'low') this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.7, 0.5, 0.85));
    this.post = new ShaderPass(CellShader);
    this.composer.addPass(this.post);
    this.composer.addPass(new OutputPass());
  }

  _resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight, false);
    this._initComposer();
    this.composer.setPixelRatio(this.pr);
    this.composer.setSize(innerWidth, innerHeight);
    this.post.uniforms.uRes.value.set(innerWidth, innerHeight);
    const c = this.overlay;
    if (c) { c.width = innerWidth * Math.min(devicePixelRatio, 2); c.height = innerHeight * Math.min(devicePixelRatio, 2); }
  }

  _setupPlayer() {
    const P = (this.player = new LocalPlayer());
    const i = this.role === 'shooter' ? 0 : 1;
    const sp = this.role === 'shooter' ? SPOTS.perches[0] : SPOTS.insert[1];
    const sx = this.role === 'shooter' ? sp.x : SPOTS.insert[1].x, sz = this.role === 'shooter' ? sp.z + 3 : SPOTS.insert[1].z;
    P.vest = this.role === 'shooter' ? 'rig' : 'plate';
    P.reset(new THREE.Vector3(sx, terrainHeight(sx, sz), sz), 0);
    this._arm();
    P.autoBipod = false;
    P.autoCycle = false;
    P.straightPull = true; // Halo-feel: the bolt runs while you stay on the glass
    P.hp = this.D.hp;
    this.hp = this.D.hp;
    this.maxHp = this.D.hp;
    this.downed = false;
    this.kia = false;
    this.bleed = BLEED;
    this.cloak = { on: false, bat: 100, flick: 0, regenT: 0 };
    this.nv = false;
    this.pistolSup = true;
    this.viewmodel = new ViewModel(this.camera);
    const kr = buildKR50();
    kr.visible = false;
    this.viewmodel.models.kr50 = kr;
    this.viewmodel.holder.add(kr);
    // Suppressor on the P-9 (toggle with B).
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.13, 12).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#1a1b1e', emissive: '#1a1b1e', emissiveIntensity: 0.14 }));
    const pm = this.viewmodel.models.m18;
    can.position.set(0, 0.022, -0.225);
    pm.add(can);
    this.pistolCan = can;
    this.viewmodel.root.traverse((o) => { o.renderOrder = 10; o.frustumCulled = false; });
    this.viewmodel.setLook({ outfit: 'wraith', poncho: this.role === 'shooter', theme: 'mcblack' });
    this.i = i;
  }

  _arm() {
    const P = this.player;
    const mk = (d) => ({ def: d, mag: d.mag, chamber: 1, reserve: d.mag * P._spare(d), zoomIdx: 0, zero: d.fixedZero || 100 });
    P.arms = this.role === 'shooter' ? [mk(KR50), mk(P9)] : [mk(P9)];
    P.slot = 0;
  }

  _look(role) {
    // Both operators wear the multicam-black kit. The shooter adds a chest rig and the
    // urban-digital poncho; the spotter wears the plate carrier with a quad on the pack.
    return role === 'shooter'
      ? { outfit: 'wraith', theme: 'mcblack', vest: 'rig', poncho: true, ponchoTheme: 'urban', hat: 'none', eyes: 'goggles', kit: { stealth: 'suppressor' } }
      : { outfit: 'wraith', theme: 'mcblack', vest: 'plate', poncho: false, hat: 'helmet', eyes: 'goggles', kit: { scout: 'drone' } };
  }

  _setupPartner() {
    const r = this.partnerRole;
    const av = new Avatar(ROLES[r].color, r === 'shooter' ? 7 : 11);
    av.setLook(this._look(r));
    this.scene.add(av.root);
    this.cloakMat = cloakMaterial();
    const ai = this.solo;
    const p = r === 'shooter' ? SPOTS.perches[0] : { x: SPOTS.insert[1].x + 3, z: SPOTS.insert[1].z - 3 };
    this.partner = {
      role: r, name: this.partnerName, ai, avatar: av, pos: new THREE.Vector3(p.x, terrainHeight(p.x, p.z), p.z), tpos: null,
      yaw: 0, pitch: -0.05, st: ai ? (r === 'shooter' ? 2 : 1) : 0, w: r === 'spotter', moving: false, sprinting: false, cloak: false, cloakFlicker: false,
      hp: 100, downed: false, kia: false, alive: true, tablet: false, e: false, quad: null, seen: ai, ammo: 1, lastT: 0,
    };
    // Your own (local) operator model, used when you are down and the camera pulls out.
    this.selfAvatar = new Avatar(ROLES[this.role].color, 3);
    this.selfAvatar.setLook(this._look(this.role));
    this.selfAvatar.setVisible(false);
    this.scene.add(this.selfAvatar.root);
    this.quadObj = buildDrone();
    this.quadObj.userData.beam.visible = false;
    this.quadObj.scale.setScalar(0.6);
    this.quadObj.visible = false;
    this.scene.add(this.quadObj);
    this.medObj = buildDrone();
    this.medObj.userData.beam.visible = false;
    this.medObj.visible = false;
    this.scene.add(this.medObj);
    this.heli = buildHeli();
    this.heli.visible = false;
    this.scene.add(this.heli);
    this.crateObjs = new Map();
  }

  // ---- networking --------------------------------------------------------------
  _setupNet() {
    const n = this.net;
    n.on('cp', (m) => this._onPartnerState(m));
    n.on('cw', (m) => { if (!this.isHost) this._applyWorld(m); });
    n.on('shot', (m) => this._onRemoteShot(m));
    n.on('eshot', (m) => { if (!this.isHost) this._onEshot(m); });
    n.on('hit', (m) => { if (this.isHost) this._applyHit(m.id, m.dmg, m.how, m.from, this.partnerRole, m.head, m.dist); });
    n.on('ab', (m) => { if (this.isHost) this._execPayload(m.k, m.target, this.partnerRole); });
    n.on('toast', (m) => { if (!this.isHost) this.comms(m.m, m.c, m.who); });
    n.on('ev', (m) => this._onEvent(m));
    n.on('end', (m) => { if (!this.isHost) this._end(m.win, m.info); });
    n.on('pin', (m) => this._addPin(m, false));
    n.on('cname', (m) => { const nm = String(m.name || '').replace(/[<>&"]/g, '').slice(0, 16); if (nm) { this.partner.name = this.partnerName = nm; } });
    n.send({ t: 'cname', name: this.name });
    n.on('close', () => { this.comms(`${this.partnerName} lost the link.`, 'red'); this.partner.alive = false; this.partner.seen = false; });
    n.on('hello', () => {
      // A guest that raced the hello asks again: re-send it.
      if (this.isHost && this.hello) n.send(this.hello);
    });
  }

  send(m) {
    if (this.net && this.net.open) this.net.send(m);
  }

  _onPartnerState(m) {
    const P = this.partner;
    P.tpos = new THREE.Vector3(m.p[0], m.p[1], m.p[2]);
    if (!P.seen) P.pos.copy(P.tpos);
    P.seen = true;
    P.tyaw = m.y; P.pitch = m.pi; P.st = m.st; P.w = !!m.w; P.moving = !!m.mv; P.sprinting = !!m.sp;
    P.cloak = !!m.ck; P.cloakFlicker = !!m.cf; P.hp = m.hp; P.downed = !!m.dn; P.kia = !!m.kia; P.alive = !m.kia;
    P.tablet = !!m.tb; P.e = !!m.e; P.quad = m.q || null; P.scoped = !!m.sc; P.ammo = m.am; P.lastT = this.t;
    P.nv = !!m.nv;
  }

  _sendState() {
    const P = this.player, r = (v) => Math.round(v * 100) / 100;
    const q = this.quad && this.quad.active ? [r(this.quad.x), r(this.quad.y), r(this.quad.z), r(this.quad.yaw), r(this.quad.pitch)] : 0;
    const total = P.arms.reduce((s, w) => s + w.mag + w.reserve + w.chamber, 0), full = P.arms.reduce((s, w) => s + w.def.mag * (1 + P._spare(w.def)), 0);
    this.send({
      t: 'cp', p: [r(P.pos.x), r(P.pos.y), r(P.pos.z)], y: r(P.yaw), pi: r(P.pitch), st: P.stance, w: P.def.slot === 'pistol' ? 1 : 0,
      mv: P.moving ? 1 : 0, sp: P.sprinting ? 1 : 0, ck: this.cloak.on ? 1 : 0, cf: this.cloak.flick > 0 ? 1 : 0, hp: Math.round(this.hp),
      dn: this.downed ? 1 : 0, kia: this.kia ? 1 : 0, tb: this.tablet.visible ? 1 : 0, e: this._eHeld ? 1 : 0, q, sc: P.scoped ? 1 : 0, am: r(total / full), nv: this.nv ? 1 : 0,
    });
  }

  _worldMsg() {
    const doors = Object.values(this.fac.doors).map((d) => [d.id, (d.open ? 1 : 0) | (d.sealed ? 2 : 0) | (d.unlocked ? 4 : 0) | (d.hackT > 0 ? 8 : 0) | (d.perm ? 16 : 0)]);
    return {
      t: 'cw', s: this.sentinel.snap(), o: this.obj, dr: doors, cr: this.crates.map((c) => [c.id, Math.round(c.x * 10) / 10, Math.round(c.y * 10) / 10, Math.round(c.z * 10) / 10, c.landed ? 1 : 0]),
      ia: this.prompts, lt: { ...this.fac.lightsOn }, md: this.medevac ? [this.medevac.x, this.medevac.y, this.medevac.z] : null,
      ai: this.aiShoot ? this.aiShoot.perch : -1, pins: this.pins.filter((p) => p.by === 'host-ai').length,
    };
  }

  _applyWorld(m) {
    this.sentinel.applySnap(m.s);
    const prevStep = this.obj.step;
    Object.assign(this.obj, m.o);
    if (this.obj.step !== prevStep) this._stepChanged(prevStep);
    for (const [id, fl] of m.dr) {
      const d = this.fac.doors[id];
      if (!d) continue;
      this.fac.setDoor(id, !!(fl & 1));
      d.sealed = !!(fl & 2); d.unlocked = !!(fl & 4); d.hackT = fl & 8 ? 1 : 0; d.perm = !!(fl & 16);
    }
    this.crates = m.cr.map(([id, x, y, z, l]) => ({ id, x, y, z, landed: !!l }));
    this.prompts = m.ia || {};
    for (const z of ['yard', 'floor', 'core']) if (m.lt[z] !== this.fac.lightsOn[z]) this.fac.setLights(z, m.lt[z]);
    this.medevac = m.md ? { x: m.md[0], y: m.md[1], z: m.md[2] } : null;
    this.fac.relayPlanted = this.obj.relay;
  }

  _broadcast(ev) {
    this.send({ t: 'ev', ...ev });
  }

  _onEvent(m) {
    switch (m.k) {
      case 'resupply': if (m.role === this.role) this._resupply(); break;
      case 'revive': if (m.role === this.role) this._revived(m.hp || 55); break;
      case 'kill': this._onKillEvent(m); break;
      case 'takedown': if (m.role === this.role) { this.audio.hitConfirm(true); this.hud.flash('TAKEDOWN'); } break;
      case 'lockdown': this._lockdownFx(); break;
      case 'trace': this.hud.flash('TRACED', 'red'); break;
      case 'decoy': this.audio.beep(new THREE.Vector3(m.x, 1, m.z), true); break;
      case 'quadhit': if (this.quad && this.quad.active) this._quadDamage(m.dmg); break;
      case 'noise': if (this.isHost) this.sentinel.noise({ x: m.x, y: m.y, z: m.z }, m.r, !!m.loud); break;
      case 'fx': this._fx(m); break;
    }
  }

  // ---- helpers used by ops / tablet ------------------------------------------------
  localAgent() {
    const P = this.player;
    return { role: this.role, pos: P.pos, stance: this.downed ? 2 : P.stance, moving: P.moving, sprinting: P.sprinting, cloak: this.cloak.on, cloakFlicker: this.cloak.flick > 0, alive: !this.kia, downed: this.downed };
  }
  partnerAgent() {
    const Q = this.partner;
    if (Q.ai || !Q.seen) return null;
    return { role: Q.role, pos: Q.pos, stance: Q.downed ? 2 : Q.st, moving: Q.moving, sprinting: Q.sprinting, cloak: Q.cloak, cloakFlicker: Q.cloakFlicker, alive: Q.alive && !Q.kia, downed: Q.downed };
  }
  agents() {
    return [this.localAgent(), this.partnerAgent()].filter(Boolean);
  }
  agentPos(role) {
    if (role === this.role) return this.player.pos;
    return this.partner.pos;
  }
  downedAgent() {
    if (this.downed && !this.kia) return this.role;
    if (!this.partner.ai && this.partner.downed && !this.partner.kia) return this.partnerRole;
    return null;
  }
  canQuad() {
    return this.role === 'spotter' && !this.downed && !this.kia && this.quadCd <= 0 && !(this.quad && this.quad.active);
  }
  // Extra intel sources for the console: the recon quad, and enemies close to an agent.
  get extraReveal() {
    return (e) => {
      const ex = e.x, ez = e.z, ey = (e.y || 0) + 1.2;
      const qs = [];
      if (this.quad && this.quad.active) qs.push(this.quad);
      if (this.partner.quad) qs.push({ x: this.partner.quad[0], y: this.partner.quad[1], z: this.partner.quad[2], yaw: this.partner.quad[3] });
      for (const q of qs) {
        const d = Math.hypot(ex - q.x, ez - q.z);
        if (d < 45 && Math.abs(angDiff(Math.atan2(-(ex - q.x), -(ez - q.z)), q.yaw)) < 0.8 && this.fac.los(q, { x: ex, y: ey, z: ez })) return true;
      }
      for (const a of this.agents()) {
        if (!a.alive) continue;
        if (Math.hypot(a.pos.x - ex, a.pos.z - ez) < 25 && this.fac.los({ x: a.pos.x, y: a.pos.y + 1.5, z: a.pos.z }, { x: ex, y: ey, z: ez })) return true;
      }
      return false;
    };
  }

  comms(m, c = 'dim', who = null) {
    this.commsLog.push({ m, c, who, t: this.t });
    if (this.commsLog.length > 40) this.commsLog.shift();
    if (this.hud) this.hud.comms(m, c, who);
    if (this.tablet) this.tablet.dirty = true;
  }

  _toast(m, c = 'dim', who = null) {
    this.comms(m, c, who);
    if (this.isHost) this.send({ t: 'toast', m, c, who });
  }

  // A payload fired from the console (or the AI spotter). Host executes; guest forwards.
  payload(k, target) {
    if (this.isHost) this._execPayload(k, target, this.role === 'spotter' ? this.role : 'spotter');
    else if (k === 'crack' || k === 'fight') {
      // Held actions: batch them into ~10 messages a second.
      this._held = this._held || {};
      this._held[k] = (this._held[k] || 0) + target.dt;
      if (this._held[k] >= 0.1) { this.send({ t: 'ab', k, target: { dt: this._held[k] } }); this._held[k] = 0; }
    } else this.send({ t: 'ab', k, target });
    if (k === 'quad') this._startQuad();
  }

  _execPayload(k, target, by) {
    const S = this.sentinel, ob = this.obj;
    switch (k) {
      case 'scan': S.scanT = 4; for (const g of S.guards) if (g.state !== 'dead') g.scanT = 4; for (const d of S.drones) d.scanT = 4; this._toast('Pulse scan — every contact on the network for 4 s.', 'cyan'); break;
      case 'jam': S.jams.push({ x: target.x, z: target.z, r: PAYLOAD.jam.r, t: 5 }); this._toast('Earpieces jammed for 5 s.', 'cyan'); break;
      case 'emp':
        for (const d of S.drones) if (Math.hypot(d.x - target.x, d.z - target.z) < PAYLOAD.emp.r + 6) d.empT = 7;
        for (const c of S.cams) if (Math.hypot(c.x - target.x, c.z - target.z) < PAYLOAD.emp.r) c.empT = 7;
        this._toast('EMP — drones and cameras in the area dark for 7 s.', 'cyan');
        this._broadcastFx({ k: 'emp', x: target.x, z: target.z });
        break;
      case 'supply':
        if (ob.drops <= 0) break;
        ob.drops--;
        this.crates.push({ id: this.crateId++, x: target.x, z: target.z, y: terrainHeight(target.x, target.z) + 28, landed: false, vy: 5.5 });
        this._toast(`Supply drop inbound (${ob.drops} left).`, 'cyan');
        break;
      case 'lights': {
        const zone = this.fac.zoneAt(target.x, target.z);
        const z = zone === 'out' ? 'yard' : zone;
        this.fac.setLights(z, false);
        this.fac.darkT[z] = 12;
        this._toast(`Lights cut: ${z === 'yard' ? 'the yard' : z === 'core' ? 'the vault' : 'the data floor'} for 12 s.`, 'cyan');
        break;
      }
      case 'spoof': S.spoofT = 10; this._toast('Cameras looped for 10 s.', 'cyan'); break;
      case 'decoy': this.decoys = (this.decoys || []).concat([{ x: target.x, z: target.z, t: 2.4, tick: 0 }]); this._broadcast({ k: 'decoy', x: target.x, z: target.z }); this.audio.beep(new THREE.Vector3(target.x, 1, target.z), true); break;
      case 'medevac': {
        const role = target && target.role;
        if (!role) break;
        const from = SPOTS.insert[0];
        this.medevac = { x: from.x, y: terrainHeight(from.x, from.z) + 18, z: from.z, role };
        this._toast('Medevac drone launched.', 'cyan');
        break;
      }
      case 'quad': break;
      case 'door': {
        const d = this.fac.doors[target.id];
        if (!d) break;
        if (d.kind === 'dock' && ob.drive) { d.perm = true; d.sealed = false; this._toast('Loading dock forced open. Get to the LZ!', 'cyan'); }
        else if (!d.sealed) { d.hackOpen = HACK.doorOpen; this._toast(`Door hacked open for ${HACK.doorOpen} s.`, 'cyan'); }
        break;
      }
      case 'cam': {
        const c = S.cams.find((q) => q.id === target.id);
        if (!c) break;
        c.hacked = true;
        c.loopT = HACK.camLoop;
        this._toast('Camera hacked: looped 9 s, feeding the console.', 'cyan');
        break;
      }
      case 'crack':
        if (ob.canCrack && !ob.vault) {
          ob.crack = Math.min(1, ob.crack + HACK.crackRate * (target.dt || 0.1));
          if (ob.crack >= 1) this._openVault();
        }
        break;
      case 'fight':
        if (ob.uploading) ob.trace = Math.max(0, ob.trace - HACK.fightRate * (target.dt || 0.1) * 2);
        break;
      case 'tag': {
        const e = S.byId(target.id);
        if (e && e.hp > 0) { e.tagT = HACK.tag; }
        break;
      }
      case 'perch':
        if (this.aiShoot && target.i !== this.aiShoot.perch) { this.aiShoot.moveTo = target.i; this.aiShoot.moveT = 9; this._toast(`Ra: relocating to ${SPOTS.perches[target.i].name}.`, 'amber', this.partnerName); }
        break;
    }
    void by;
  }

  _broadcastFx(ev) {
    this._fx(ev);
    this._broadcast({ k: 'fx', ...ev });
  }
  _fx(ev) {
    if (ev.k === 'emp') {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 1, 40).rotateX(-Math.PI / 2), glowMat('#60c0ff', 0.6));
      ring.position.set(ev.x, terrainHeight(ev.x, ev.z) + 0.5, ev.z);
      this.scene.add(ring);
      this.trails.push({ mesh: ring, t: 0, life: 0.8, ring: PAYLOAD.emp.r });
    }
  }

  _addPin(m, local = true) {
    this.pins.push({ x: m.x, z: m.z, label: m.label || 'PING', by: m.by, t: 12 });
    if (this.pins.length > 6) this.pins.shift();
    if (!local) this.comms(`${this.partnerName}: ${m.label === 'PING' ? 'look here.' : 'requests ' + m.label + '.'}`, ROLES[this.partnerRole].color, this.partnerName);
    this.audio.ping && this.audio.ping();
  }

  // Shooter's requests (solo: the AI spotter answers; co-op: a pin on the spotter's console).
  request(kind) {
    const P = this.player.pos;
    const label = kind.toUpperCase();
    if (this.solo && this.ops) {
      const k = { scan: 'scan', supply: 'supply', lights: 'lights', decoy: 'decoy', jam: 'jam', emp: 'emp', spoof: 'spoof' }[kind];
      if (kind === 'door') {
        const d = Object.values(this.fac.doors).filter((q) => q.kind === 'elec' || q.kind === 'dock').sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
        const why = d ? this.ops.hack('door', d.id) : 'NO DOOR';
        this.comms(why ? `Rōnin: can’t — ${why.toLowerCase()}.` : 'Rōnin: on the door.', 'cyan', this.partnerName);
        return;
      }
      const aim = this._aimPoint();
      const why = this.ops.use(k, PAYLOAD[k].aim ? (kind === 'supply' ? { x: P.x + 1.5, z: P.z + 1 } : aim) : null);
      this.comms(why ? `Rōnin: can’t — ${why.toLowerCase()}.` : `Rōnin: ${PAYLOAD[k].name.toLowerCase()}, on it.`, 'cyan', this.partnerName);
      return;
    }
    const at = kind === 'supply' || kind === 'door' ? { x: P.x, z: P.z } : this._aimPoint();
    const pin = { x: at.x, z: at.z, label, by: this.role };
    this._addPin(pin);
    this.send({ t: 'pin', ...pin });
    this.comms(`Requested ${label.toLowerCase()}.`, ROLES[this.role].color, this.name);
  }

  _aimPoint() {
    const o = this.player.eyePos(new THREE.Vector3());
    const dir = this.player.aimDir(new THREE.Vector3());
    const h = this.fac.ray(o, o.clone().addScaledVector(dir, 400), 'shot');
    const p = h ? h.point : o.clone().addScaledVector(dir, 120);
    return { x: p.x, z: p.z };
  }

  // ---- frame -----------------------------------------------------------------------
  _frame() {
    let dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.t += dt;
    hazeUniforms.uTime.value = this.t;
    const a = this.input.actions;
    if (this.net) this.net.tick(dt);
    if (!this.ended) {
      this._updateLocal(dt, a);
      if (this.isHost) this._hostTick(dt);
      this._netTick(dt);
    } else this.input.endFrame();
    this._updatePartner(dt);
    this.sentinel.draw(dt, this.camera.position);
    this.fac.update(dt);
    this._visuals(dt);
    this.effects.update(dt, this.camera);
    this.audio.setListener(this.camera);
    this._render(dt);
    this.hud.update(dt);
    this.tablet.update(dt);
  }

  _netTick(dt) {
    if (!this.net) return;
    this._stT = (this._stT || 0) - dt;
    if (this._stT <= 0) { this._stT = 0.05; this._sendState(); }
    if (this.isHost) {
      this._wT = (this._wT || 0) - dt;
      if (this._wT <= 0) { this._wT = 0.1; this.send(this._worldMsg()); }
    }
  }

  _updateLocal(dt, a) {
    const P = this.player, I = this.input;
    const tab = this.tablet.visible;
    const quad = this.quad && this.quad.active;
    // Keys for this mode.
    if (I.pressed('Tab') || I.pressed('cell-tab')) this.tablet.toggle();
    if (I.pressed('KeyN') || I.pressed('cell-nv')) { this.nv = !this.nv; this.audio.click(); }
    if ((I.pressed('KeyB') || I.pressed('cell-sup')) && !tab) { this.pistolSup = !this.pistolSup; this.hud.flash(this.pistolSup ? 'SUPPRESSOR ON' : 'SUPPRESSOR OFF'); this.audio.click(); }
    if (this.role === 'shooter' && (I.pressed('KeyG') || I.pressed('cell-ability')) && !this.downed) this._toggleCloak();
    if (this.role === 'spotter' && (I.pressed('KeyQ') || I.pressed('cell-ability')) && !tab) { if (quad) this._endQuad(); else { const why = this.ops.use('quad'); if (why) this.hud.flash(why, 'red'); } }
    if (this.role === 'shooter' && I.pressed('KeyV') && !tab) this.request('supply');
    if (I.pressed('KeyF') || I.pressed('cell-tag')) this._tagAtCrosshair();
    this._eHeld = (I.held('KeyE') || I.held('T:cell-use')) && !tab;
    if (this.ops) this.ops.update(dt);
    if (this.aiSpot) this.aiSpot.update(dt);
    this.quadCd = Math.max(0, this.quadCd - dt);

    // Cloak battery (Cold Archive: drain 14/s, regen 7 × camo/s).
    const C = this.cloak;
    C.flick = Math.max(0, C.flick - dt);
    if (C.on) {
      C.bat -= (P.moving ? 14 : 9) * dt;
      if (C.bat <= 0) { C.bat = 0; C.on = false; this.hud.flash('CAMO DEPLETED', 'red'); this.audio.click(); }
      C.regenT = 2;
    } else {
      C.regenT -= dt;
      if (C.regenT <= 0) C.bat = Math.min(100, C.bat + 7 * this.D.camo * dt);
    }

    // Downed: bleed out unless your partner (or a medevac) gets you up.
    if (this.downed && !this.kia) {
      this.bleed -= dt;
      if (this.bleed <= 0) { this.kia = true; this.comms(`${this.name} is KIA.`, 'red'); this._dropDriveIfCarrying(); }
    }

    const live = !this.downed && !this.kia;
    const act = { ...a };
    if (!live || tab || quad) {
      act.fire = false; act.fireHeld = false; act.scope = false; act.reload = act.reload && live && !quad;
      act.lookX = tab || !live ? 0 : act.lookX; act.lookY = tab || !live ? 0 : act.lookY;
      act.crouch = act.prone = act.jump = false;
      act.zoomIn = act.zoomOut = false;
      act.slot1 = act.slot2 = act.swap = false;
    }
    if (quad) { act.mx = 0; act.my = 0; act.sprint = false; act.lookX = 0; act.lookY = 0; }
    if (this.role === 'spotter') { act.slot1 = act.slot2 = act.swap = false; if (!P.scoped) act.zoomIn = act.zoomOut = false; }
    act.zeroUp = act.zeroDown = false;
    act.breath = false;
    P.noSprint = !!this.obj.drive && this.obj.drive === this.role;
    P.speedMul = tab ? 0.55 : 1;
    if (this.downed) { P.stance = 2; }
    P.update(dt, act, this.fac, { canMove: live && !quad });
    if (this.downed) { P.vel.x *= 0.2; P.vel.z *= 0.2; }
    if (P.def.kind === 'bolt' && P.boltEvent) { P.boltEvent = false; this.audio.bolt(0.05); }
    if (quad) this._updateQuad(dt, a);

    // Fire.
    if (act.fire && live) {
      if (P.canFire()) this._fire();
      else if (P.w.chamber === 0 && P.w.mag === 0) { this.audio.click(); if (P.w.reserve > 0) P.startReload(); }
    }
    // Footsteps make noise (running only, cloak halves it).
    if (P.moving && P.onGround && live) {
      this._stepT = (this._stepT || 0) - dt * (P.sprinting ? 1.6 : 1);
      if (this._stepT <= 0) {
        this._stepT = 0.46;
        if (P.sprinting) this._noise(P.pos, C.on ? 4 : 8, false);
      }
    }
    // Camera.
    if (quad) {
      const q = this.quad;
      this.camera.position.set(q.x, q.y, q.z);
      this.camera.rotation.set(q.pitch, q.yaw, 0);
      this.camera.fov = 70;
    } else if (this.kia || this.downed) {
      // Third person over your own body (or your partner's, once you are KIA).
      const tgt = this.kia && this.partner.seen ? this.partner.pos : P.pos;
      const yaw = this.kia ? (this.partner.yaw || 0) + Math.sin(this.t * 0.15) * 0.6 : P.yaw;
      const back = new THREE.Vector3(Math.sin(yaw) * 4.5, 2.6, Math.cos(yaw) * 4.5);
      this.camera.position.copy(tgt).add(back);
      this.camera.lookAt(tgt.x, tgt.y + 0.6, tgt.z);
      this.camera.fov = WEAPON.baseFov;
    } else {
      P.eyePos(this.camera.position);
      this.camera.rotation.set(P.pitch, P.yaw, 0);
      this.camera.fov = P.fov();
    }
    this.camera.updateProjectionMatrix();
    // First-person weapon.
    const scopedRifle = P.def.scope && P.scopeT > 0.6;
    this.viewmodel.visible = live && !scopedRifle && !quad && !tab;
    this.pistolCan.visible = this.pistolSup;
    this.viewmodel.update(dt, {
      def: P.def, scopeT: P.scopeT, speed: P.speed, sprint: P.sprinting, bobPhase: P.bobPhase, cycleT: P.cycleT,
      reloadT: P.reloadT, reloadDur: P.reloadDur, reloadEmpty: P.reloadEmpty, switchT: P.switchT, bipodT: 0, bipodState: 'stowed', bipodU: 0,
      empty: P.w.chamber === 0 && P.def.kind === 'semi', boltPending: false,
    });
    this._cloakViewmodel(C.on);
    this.input.isScoped = P.scoped;
    this.input.endFrame();
  }

  _toggleCloak() {
    const C = this.cloak;
    if (!C.on && C.bat < 10) { this.hud.flash('CAMO RECHARGING', 'red'); return; }
    C.on = !C.on;
    this.audio.click();
    this.hud.flash(C.on ? 'ACTIVE CAMO' : 'CAMO OFF', C.on ? 'cyan' : 'dim');
  }

  _cloakViewmodel(on) {
    if (this._vmCloak === on) return;
    this._vmCloak = on;
    this.viewmodel.root.traverse((o) => {
      if (!o.isMesh) return;
      if (on) { o.userData._m = o.userData._m || o.material; o.material = this.cloakMat; }
      else if (o.userData._m) o.material = o.userData._m;
    });
  }

  // ---- shooting ----------------------------------------------------------------------
  _fire() {
    const P = this.player, def = P.def;
    const rifle = def.slot === 'rifle';
    const sup = rifle || this.pistolSup;
    const o = P.eyePos(new THREE.Vector3());
    const dir = P.aimDir(new THREE.Vector3());
    // Hipfire spread on the pistol; the rifle is dead-on (Halo).
    if (!rifle && P.scopeT < 0.5) { dir.x += (Math.random() - 0.5) * 0.03; dir.y += (Math.random() - 0.5) * 0.03; dir.normalize(); }
    if (rifle && P.scopeT < 0.5) { dir.x += (Math.random() - 0.5) * 0.02; dir.y += (Math.random() - 0.5) * 0.02; dir.normalize(); }
    P.fireKick();
    this.viewmodel.fired();
    this.audio.shotLocal(sup, !rifle);
    this.stats.shots++;
    if (!sup) this.effects.muzzle(this.viewmodel.muzzleWorld(), dir);
    // Firing breaks the camo for a moment (it shimmers into view).
    if (this.cloak.on) this.cloak.flick = 1.0;
    const end = o.clone().addScaledVector(dir, 900);
    const res = this._hitscan(o, end);
    const hitP = res ? res.point : end;
    const from = P.scopeT > 0.5 ? o.clone().add(new THREE.Vector3(0, -0.12, 0).applyEuler(this.camera.rotation)) : this.viewmodel.muzzleWorld(new THREE.Vector3());
    if (rifle) this._trail(from, hitP, true);
    else this._tracer(from, hitP, '#ffe0a0', 0.05);
    this.send({ t: 'shot', a: from.toArray().map((v) => Math.round(v * 100) / 100), b: hitP.toArray().map((v) => Math.round(v * 100) / 100), r: rifle ? 1 : 0, s: sup ? 1 : 0 });
    // Noise: a suppressed shot carries ~10 m, an unsuppressed pistol 70 m and it's loud.
    this._noise(P.pos, rifle ? 10 : sup ? 8 : 70, !sup);
    if (!sup) this.sentinel.stats.loudShots = (this.sentinel.stats.loudShots || 0) + 1, this._loud = true;
    if (res && res.enemy) {
      const e = res.enemy;
      const dmg = def.damage[res.part] || def.damage.torso;
      const dist = o.distanceTo(hitP);
      this.audio.hitConfirm(res.part === 'head');
      this.hud.hitMarker(res.part === 'head');
      this.stats.hits++;
      if (res.part === 'head') this.stats.heads++;
      this.effects.puff(hitP, e.kind === 'd' ? 'metal' : 'dust', 0.9, 0.7);
      if (this.isHost) this._applyHit(e.id, dmg, rifle ? 'rifle' : 'pistol', { x: P.pos.x, z: P.pos.z }, this.role, res.part === 'head', dist);
      else this.send({ t: 'hit', id: e.id, dmg, how: rifle ? 'rifle' : 'pistol', from: { x: P.pos.x, z: P.pos.z }, head: res.part === 'head', dist });
    } else if (res) {
      const mat = res.terrain ? 'dirt' : res.box && res.box.kind === 'door' ? 'metal' : 'concrete';
      this.effects.impact(hitP, res.normal, mat);
      this.audio.impact(hitP, mat === 'metal' ? 'metal' : 'dirt', o.distanceTo(hitP) / 343);
      this._noise(hitP, 7, false);
    }
    if (res && res.quadHit) this._quadDamage(100);
  }

  // Instant hit: world boxes + terrain, every guard's capsules, drones.
  _hitscan(o, end) {
    const wh = this.fac.ray(o, end, 'shot');
    const L = o.distanceTo(end);
    let bestT = wh ? wh.t : 1, best = wh ? { ...wh } : null;
    const S = this.sentinel;
    for (const g of S.guards) {
      if (g.hp <= 0 && g.state === 'dead') continue;
      if (Math.hypot(g.x - o.x, g.z - o.z) > L * bestT + 3) continue;
      for (const c of guardCapsules(g)) {
        const r = segSegClosest(o, end, c.a, c.b);
        const rad = c.r * (RULES.hitbox || 1);
        if (r.d2 < rad * rad && r.s < bestT) {
          bestT = r.s;
          best = { t: r.s, point: o.clone().lerp(end, r.s), enemy: g, part: c.part };
        }
      }
    }
    for (const d of S.drones) {
      if (d.state === 'dead') continue;
      const r = segSegClosest(o, end, { x: d.x - 0.5, y: d.y, z: d.z }, { x: d.x + 0.5, y: d.y, z: d.z });
      if (r.d2 < 0.75 * 0.75 && r.s < bestT) { bestT = r.s; best = { t: r.s, point: o.clone().lerp(end, r.s), enemy: d, part: 'torso' }; }
    }
    return best;
  }

  _applyHit(id, dmg, how, from, by, head, dist) {
    const S = this.sentinel;
    const e = S.byId(id);
    if (!e) return;
    const killed = S.damage(id, dmg, how, from);
    if (killed && e.kind === 'g') {
      this._killFeed(e, how, by, head, dist);
      if (e.chief) this._toast('Site Chief is down. Take his badge.', 'amber');
    } else if (killed && e.kind === 'd') this._toast(`${by === this.role ? this.name : this.partnerName} shot down a patrol drone.`, 'dim');
  }

  _killFeed(e, how, by, head, dist) {
    const name = by === this.role ? this.name : by === 'ai' ? this.partnerName : this.partnerName;
    const what = how === 'takedown' ? 'TAKEDOWN' : head ? 'HEADSHOT' : 'KILL';
    const ev = { k: 'kill', by, what, dist: Math.round(dist || 0), chief: e.chief, name };
    this._onKillEvent(ev);
    this._broadcast(ev);
  }

  _onKillEvent(m) {
    if (m.by === this.role && m.dist) this.stats.longest = Math.max(this.stats.longest, m.dist);
    this.hud.feed(`${m.name} ▸ ${m.what}${m.dist > 30 ? ' · ' + m.dist + ' m' : ''}${m.chief ? ' · SITE CHIEF' : ''}`, m.by === this.role ? ROLES[this.role].color : ROLES[this.partnerRole].color);
  }

  _onRemoteShot(m) {
    const a = new THREE.Vector3(...m.a), b = new THREE.Vector3(...m.b);
    if (m.r) this._trail(a, b, false); else this._tracer(a, b, '#ffe0a0', 0.05);
    const d = this.camera.position.distanceTo(a);
    this.audio.shotDistant(a, d / 343, !!m.s);
    if (this.isHost) this._noise(a, m.r ? 10 : m.s ? 8 : 70, !m.s);
  }

  _noise(pos, r, loud) {
    if (this.isHost) this.sentinel.noise(pos, r, loud);
    else if (r >= 6) this.send({ t: 'ev', k: 'noise', x: pos.x, y: pos.y, z: pos.z, r, loud });
  }

  // The shooter's signature: a long white vapor trail that hangs in the night air.
  _trail(a, b, mine) {
    const len = a.distanceTo(b);
    const geo = new THREE.CylinderGeometry(0.018, 0.018, len, 6, 1, true).translate(0, len / 2, 0).rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: '#cfe6ff', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(a);
    m.lookAt(b);
    this.scene.add(m);
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, len, 6, 1, true).translate(0, len / 2, 0).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#7aa6ff', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.add(glow);
    this.trails.push({ mesh: m, t: 0, life: mine ? 2.2 : 2.6, grow: true });
  }

  _tracer(a, b, color, life) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(line);
    this.trails.push({ mesh: line, t: 0, life });
  }

  // Enemy fire reaching a client.
  _onEshot(m) {
    const a = new THREE.Vector3(...m.a), b = new THREE.Vector3(...m.b);
    const miss = m.hit ? b : b.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.5, (Math.random() - 0.3) * 1.5, (Math.random() - 0.5) * 2.5));
    this._tracer(a, miss, m.zap ? '#ff4060' : '#ffb060', m.zap ? 0.12 : 0.07);
    const d = this.camera.position.distanceTo(a);
    if (!m.zap) this.audio.shotDistant(a, d / 343, false); else this.audio.beep(a, true);
    if (m.role === 'quad') {
      if (m.hit) { if (this.role === 'spotter' && this.quad && this.quad.active) this._quadDamage(m.dmg); else if (this.isHost) this._broadcast({ k: 'quadhit', dmg: m.dmg }); }
      return;
    }
    if (m.role !== this.role || this.downed || this.kia) return;
    if (!m.hit) { this.audio.crack(miss, 0, 0.6); return; }
    const plate = this.role === 'spotter' ? 0.8 : 1; // the plate carrier soaks a little
    this._damage(m.dmg * plate, a);
  }

  _damage(dmg, from) {
    this.hp -= dmg;
    this.hud.damage(Math.atan2(from.x - this.player.pos.x, from.z - this.player.pos.z) - this.player.yaw);
    this.dmgFx = 1;
    if (this.hp <= 0) {
      this.hp = 0;
      this.downed = true;
      this.bleed = BLEED;
      this.cloak.on = false;
      if (this.tablet.visible) this.tablet.close();
      if (this.quad && this.quad.active) this._endQuad();
      this.player.scoped = false;
      this.comms(`${this.name} is DOWN — ${BLEED} s to bleed out.`, 'red');
      this._dropDriveIfCarrying();
    }
  }

  _revived(hp) {
    if (!this.downed || this.kia) return;
    this.downed = false;
    this.hp = Math.round(this.maxHp * 0.55) || hp;
    this.player.stance = 1;
    this.comms(`${this.name} is back up.`, 'cyan');
  }

  _resupply() {
    this.player.refill();
    this.hp = Math.min(this.maxHp, this.hp + 35);
    this.audio.click();
    this.hud.flash('RESUPPLIED +35 HP', 'cyan');
  }

  _dropDriveIfCarrying() {
    if (this.isHost && this.obj.drive === this.role) {
      this.obj.drive = 'ground';
      this.obj.driveAt = { x: this.player.pos.x, z: this.player.pos.z };
      this._toast('The drive is on the ground!', 'red');
    }
  }

  // F: tag the contact under the crosshair (spotting). Works through the quad too.
  _tagAtCrosshair() {
    const cam = this.camera;
    const o = cam.position.clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    let best = null, bs = 0.035 * (WEAPON.baseFov / cam.fov);
    const S = this.sentinel;
    for (const e of [...S.guards, ...S.drones]) {
      if (e.hp <= 0 || e.state === 'dead') continue;
      const p = new THREE.Vector3(e.x, (e.y || 0) + (e.kind === 'g' ? 1.3 : 0), e.z);
      const v = p.clone().sub(o);
      const d = v.length();
      if (d > 320) continue;
      const ang = v.normalize().angleTo(dir);
      if (ang < bs && this.fac.los(o, p)) { bs = ang; best = e; }
    }
    if (best) {
      this.payload('tag', { id: best.id });
      if (this.isHost) best.tagT = HACK.tag;
      this.audio.ping && this.audio.ping();
      this.hud.flash(best.kind === 'd' ? 'DRONE TAGGED' : best.chief ? 'SITE CHIEF TAGGED' : 'TAGGED');
      if (this.aiShoot) this.comms('Ra: I see him.', 'amber', this.partnerName);
    } else {
      // Nothing there: drop a ping on the spot instead.
      const at = this._aimPoint();
      const pin = { x: at.x, z: at.z, label: 'PING', by: this.role };
      this._addPin(pin);
      this.send({ t: 'pin', ...pin });
    }
  }

  // ---- recon quad (spotter) ----------------------------------------------------------
  _startQuad() {
    if (this.role !== 'spotter') return;
    const P = this.player;
    if (this.tablet.visible) this.tablet.close();
    this.quad = { active: true, x: P.pos.x, y: P.pos.y + 2.2, z: P.pos.z, yaw: P.yaw, pitch: -0.2, bat: 40, hp: 30, vy: 0 };
    this.audio.startLoop('quad', this.camera.position, 'drone', 0.25);
    this.comms('Quad up. WASD fly, SPACE/C climb/descend, F tag, Q to land.', 'cyan', this.name);
  }
  _updateQuad(dt, a) {
    const q = this.quad;
    q.bat -= dt;
    const sens = 0.0022;
    q.yaw -= a.lookX * sens;
    q.pitch = clamp(q.pitch - a.lookY * sens, -1.4, 0.6);
    const sn = Math.sin(q.yaw), cs = Math.cos(q.yaw);
    const mx = a.mx, my = a.my;
    const sp = a.sprint ? 14 : 8;
    const up = (this.input.held('Space') || this.input.held('T:jump') ? 1 : 0) - (this.input.held('KeyC') || this.input.held('ControlLeft') || this.input.held('T:crouch') ? 1 : 0);
    const p = { x: q.x + (mx * cs + my * sn) * sp * dt, y: q.y + up * 5 * dt, z: q.z + (-mx * sn + my * cs) * sp * dt };
    this.fac.resolveHorizontal(p, 0.4, 0.5, 0);
    const g = this.fac.groundAt(p.x, p.z, p.y, 0.5);
    p.y = clamp(p.y, g + 0.6, Math.min(terrainHeight(p.x, p.z) + 60, this.fac.insideBuilding(p.x, p.z) ? BUILDING.h - 0.4 : 999));
    // Keep it on a leash (~260 m of signal).
    const d = Math.hypot(p.x - this.player.pos.x, p.z - this.player.pos.z);
    if (d > 260) { p.x = q.x; p.z = q.z; }
    q.x = p.x; q.y = p.y; q.z = p.z;
    this.audio.updateLoop('quad', new THREE.Vector3(q.x, q.y, q.z));
    if (q.bat <= 0) { this.comms('Quad battery dead — it’s coming home.', 'cyan', this.name); this._endQuad(); }
    if (this.isHost) this.sentinel.quad = { alive: true, x: q.x, y: q.y, z: q.z };
  }
  _quadDamage(dmg) {
    if (!this.quad || !this.quad.active) return;
    this.quad.hp -= dmg;
    this.post.uniforms.uStatic.value = 1;
    if (this.quad.hp <= 0) { this.comms('Quad shot down.', 'red', this.name); this._endQuad(true); }
  }
  _endQuad(lost = false) {
    if (!this.quad) return;
    this.quad.active = false;
    this.quadCd = lost ? 40 : 12;
    if (this.ops) this.ops.cd.quad = this.quadCd;
    this.audio.stopLoop('quad');
    if (this.isHost) this.sentinel.quad = null;
    this.quad = null;
  }

  // ---- host: objectives, interactions, doors, crates, AI shooter --------------------
  _hostTick(dt) {
    const S = this.sentinel, ob = this.obj;
    // Remote quad position feeds SENTINEL (guards shoot support drones).
    if (!this.solo && this.partner.quad) { const q = this.partner.quad; S.quad = { alive: true, x: q[0], y: q[1], z: q[2] }; }
    else if (!(this.quad && this.quad.active)) S.quad = null;
    S.update(dt, this.agents());
    for (const ev of S.events) this._sentinelEvent(ev);
    S.events.length = 0;
    // Revealed flags (console intel) for the snapshot.
    for (const e of [...S.guards, ...S.drones]) e.rev = S.revealed(e, ob.access, this.extraReveal);
    // Decoys keep pinging.
    if (this.decoys) for (const d of this.decoys) { d.t -= dt; d.tick -= dt; if (d.tick <= 0) { d.tick = 0.6; S.noise({ x: d.x, y: 1, z: d.z }, 25, true); } }
    if (this.decoys) this.decoys = this.decoys.filter((d) => d.t > 0);
    // Lights come back on.
    for (const z of ['yard', 'floor', 'core']) if (this.fac.darkT[z] > 0) { this.fac.darkT[z] -= dt; if (this.fac.darkT[z] <= 0) this.fac.setLights(z, true); }
    this._doors(dt);
    this._crates(dt);
    this._medevacTick(dt);
    if (this.aiShoot) this._aiShooter(dt);
    this._objectives(dt);
  }

  _sentinelEvent(ev) {
    if (ev.t === 'eshot') { this._onEshot(ev); this.send({ t: 'eshot', ...ev }); }
    else if (ev.t === 'toast') this._toast(ev.m, ev.c);
    else if (ev.t === 'spotted') { /* surfaced through the guard's state */ }
  }

  _doors(dt) {
    const agents = this.agents();
    for (const d of Object.values(this.fac.doors)) {
      d.hackOpen = Math.max(0, (d.hackOpen || 0) - dt);
      d.guardT = Math.max(0, (d.guardT || 0) - dt);
      d.hackT = 0;
      const near = agents.some((a) => a.alive && Math.hypot(a.pos.x - d.x, a.pos.z - d.z) < 2.8);
      let open = false;
      if (d.perm) open = true;
      else if (d.sealed) open = false;
      else open = d.hackOpen > 0 || d.guardT > 0 || (d.unlocked && near);
      // Never slam a door shut on top of somebody.
      if (!open && d.open && agents.some((a) => Math.hypot(a.pos.x - d.x, a.pos.z - d.z) < 1.2)) open = true;
      this.fac.setDoor(d.id, open);
    }
    if (this.ops) for (const c of this.ops.casts) if (c.k === 'door' && this.fac.doors[c.id]) this.fac.doors[c.id].hackT = 1;
  }

  _crates(dt) {
    for (const c of this.crates) {
      if (!c.landed) {
        c.y -= c.vy * dt * 3;
        const g = this.fac.groundAt(c.x, c.z, c.y, 0.5);
        if (c.y <= g) { c.y = g; c.landed = true; c.life = 90; }
        continue;
      }
      c.life -= dt;
      for (const a of this.agents()) {
        if (!a.alive || a.downed) continue;
        if (Math.hypot(a.pos.x - c.x, a.pos.z - c.z) < 1.6) {
          c.taken = true;
          if (a.role === this.role) this._resupply(); else this._broadcast({ k: 'resupply', role: a.role });
          break;
        }
      }
    }
    this.crates = this.crates.filter((c) => !c.taken && (!c.landed || c.life > 0));
  }

  _medevacTick(dt) {
    const m = this.medevac;
    if (!m) return;
    const tgt = this.agentPos(m.role);
    const goal = { x: tgt.x, y: Math.max(tgt.y + 1.2, this.fac.insideBuilding(tgt.x, tgt.z) ? 1.6 : tgt.y + 1.2), z: tgt.z };
    const cruise = this.fac.insideBuilding(tgt.x, tgt.z) ? 0 : 14;
    const dx = goal.x - m.x, dz = goal.z - m.z, d = Math.hypot(dx, dz);
    const sp = 18 * dt;
    if (d > 1) { m.x += (dx / d) * Math.min(d, sp); m.z += (dz / d) * Math.min(d, sp); }
    const wantY = d > 12 ? goal.y + cruise : goal.y;
    m.y += (wantY - m.y) * Math.min(1, dt * 2);
    if (d < 1.5 && Math.abs(m.y - goal.y) < 1.5) {
      if (m.role === this.role) this._revived(55); else this._broadcast({ k: 'revive', role: m.role, hp: 55 });
      this.medevac = null;
    }
  }

  // Solo spotter: Ra holds a perch and takes the shots you tag.
  _aiShooter(dt) {
    const A = this.aiShoot, S = this.sentinel, Q = this.partner;
    const perch = SPOTS.perches[A.perch];
    A.cool -= dt;
    A.sayT -= dt;
    if (A.moveT > 0) {
      A.moveT -= dt;
      Q.avatarHidden = true;
      if (A.moveT <= 0) { A.perch = A.moveTo; const p = SPOTS.perches[A.perch]; Q.pos.set(p.x, terrainHeight(p.x, p.z), p.z); Q.yaw = p.yaw; Q.avatarHidden = false; this._toast(`Ra: set at ${p.name}.`, 'amber', this.partnerName); }
      return;
    }
    Q.pos.set(perch.x, terrainHeight(perch.x, perch.z), perch.z);
    const eye = { x: perch.x, y: Q.pos.y + 0.55, z: perch.z };
    // Candidates: anything tagged, anything with eyes on the spotter, drones locked on.
    const me = this.player.pos;
    const cands = [];
    for (const g of S.guards) {
      if (g.state === 'dead') continue;
      const threat = g.state === 'alert' && g.target === this.role && Math.hypot(g.x - me.x, g.z - me.z) < 45;
      if (g.tagT > 0 || threat) cands.push({ e: g, p: { x: g.x, y: g.y + 1.25, z: g.z }, pri: threat ? 2 : 1 });
    }
    for (const d of S.drones) if (d.state !== 'dead' && (d.tagT > 0 || d.aw > 0.6)) cands.push({ e: d, p: { x: d.x, y: d.y, z: d.z }, pri: d.aw > 0.6 ? 3 : 1 });
    cands.sort((a, b) => b.pri - a.pri);
    let pick = null;
    for (const c of cands) {
      if (Math.hypot(c.p.x - eye.x, c.p.z - eye.z) > 340) continue;
      if (this.fac.los(eye, c.p)) { pick = c; break; }
    }
    if (!pick) {
      A.aim = null;
      if (cands.length && A.sayT <= 0) { A.sayT = 9; this._toast('Ra: no line of sight on that one from here. Move me or bring him into the open.', 'amber', this.partnerName); }
      return;
    }
    Q.yaw = Math.atan2(-(pick.p.x - eye.x), -(pick.p.z - eye.z));
    if (A.aim !== pick.e.id) { A.aim = pick.e.id; A.aimT = 1.6 + Math.random() * 1.4; if (A.sayT <= 0) { A.sayT = 4; this._toast('Ra: on him. Sending it.', 'amber', this.partnerName); } }
    A.aimT -= dt;
    if (A.aimT > 0 || A.cool > 0) return;
    A.cool = 2.4;
    A.aim = null;
    const a = new THREE.Vector3(eye.x, eye.y, eye.z), b = new THREE.Vector3(pick.p.x, pick.p.y, pick.p.z);
    this._trail(a, b, false);
    this.send({ t: 'shot', a: a.toArray(), b: b.toArray(), r: 1, s: 1 });
    this.audio.shotDistant(a, this.camera.position.distanceTo(a) / 343, true);
    if (Math.random() < 0.93) {
      const dist = a.distanceTo(b);
      const killed = S.damage(pick.e.id, 999, 'ai', null);
      if (killed && pick.e.kind === 'g') this._killFeed(pick.e, 'rifle', 'ai', Math.random() < 0.6, dist);
      if (killed && pick.e.kind === 'g' && pick.e.chief) this._toast('Site Chief is down. Take his badge.', 'amber');
      this._toast(pick.e.kind === 'd' ? 'Ra: drone down.' : 'Ra: target down.', 'amber', this.partnerName);
    } else this._toast('Ra: missed — cycling.', 'amber', this.partnerName);
    S.noise({ x: b.x, y: b.y, z: b.z }, 7, false);
  }

  _objectives(dt) {
    const ob = this.obj, S = this.sentinel;
    const agents = this.agents();
    const inFence = (p) => Math.abs(p.x) < FENCE.x && Math.abs(p.z) < FENCE.z;
    if (!ob.perimeter && agents.some((a) => a.alive && inFence(a.pos))) { ob.perimeter = true; this._toast('Perimeter breached. Inside the wire.', 'cyan'); }
    // Vault: badge-holder at the door; Overwatch cracks it.
    const vd = this.fac.doors.vault;
    const holder = ob.badge && ob.badge !== 'ground' ? agents.find((a) => a.role === ob.badge && a.alive && !a.downed) : null;
    ob.canCrack = !ob.vault && !!holder && Math.hypot(holder.pos.x - vd.x, holder.pos.z - vd.z) < 4.5;
    if (!ob.canCrack && !ob.vault) ob.crack = Math.max(0, ob.crack - dt * 0.05);
    // Upload: anyone standing at the vault console; SENTINEL traces it.
    const sv = SPOTS.server;
    const atConsole = ob.vault && ob.upload < 1 && agents.some((a) => a.alive && !a.downed && Math.hypot(a.pos.x - sv.x, a.pos.z - sv.z) < 2.8);
    ob.uploading = atConsole;
    if (atConsole) {
      ob.upload = Math.min(1, ob.upload + 0.11 * dt);
      if (!ob.traced) ob.trace = Math.min(1, ob.trace + 0.055 * dt);
      if (ob.upload >= 1) { this._toast('Malware uploaded. Evidence copied. Pull the drive.', 'cyan'); }
      if (ob.trace >= 1 && !ob.traced) {
        ob.traced = true;
        S.raise(1, null);
        this._toast('SENTINEL traced the uplink!', 'red');
        this._broadcast({ k: 'trace' });
        this.hud.flash('TRACED', 'red');
        for (const g of S.guards) if (g.state !== 'dead') S._alert(g, null, { x: sv.x, z: sv.z + 6 });
      }
    } else if (ob.vault && ob.upload < 1) ob.trace = Math.max(0, ob.trace - 0.03 * dt);
    // Per-agent interactions.
    for (const a of agents) this._interact(a, a.role === this.role ? this._eHeld : this.partner.e, dt);
    // A carrier who goes down drops the drive where they fell.
    for (const a of agents) if (ob.drive === a.role && (a.downed || !a.alive)) { ob.drive = 'ground'; ob.driveAt = { x: a.pos.x, z: a.pos.z }; this._toast('The drive is on the ground!', 'red'); }
    if (S.alarm >= 1 && !S.lockdown) this._loudAlarm = true;
    // Exfil.
    if (ob.drive && ob.drive !== 'ground' && ob.drive !== 'server') {
      const c = agents.find((a) => a.role === ob.drive);
      if (c && Math.hypot(c.pos.x - SPOTS.lz.x, c.pos.z - SPOTS.lz.z) < SPOTS.lz.r) {
        ob.exfil = true;
        this._win();
      }
    }
    // Fail: nobody left standing and nobody can be saved.
    const allOut = agents.length && agents.every((a) => !a.alive);
    if (allOut) this._lose();
    const prev = ob.step;
    ob.step = this._step();
    if (ob.step !== prev) this._stepChanged(prev);
  }

  _step() {
    const ob = this.obj;
    if (!ob.perimeter) return 0;
    if (!ob.relay) return 1;
    if (!ob.badge && !ob.vault) return 2;
    if (!ob.vault) return 3;
    if (ob.upload < 1) return 4;
    if (!ob.drive || ob.drive === 'server') return 5;
    return 6;
  }

  _stepChanged() {
    const o = OBJECTIVES[this.obj.step];
    if (o) this.hud.objective(this.obj.step, o, true);
    this.audio.ping && this.audio.ping();
  }

  _interact(a, held, dt) {
    const ob = this.obj, S = this.sentinel, role = a.role, p = a.pos;
    let best = null;
    const opt = (key, label, dur, fn, auto = false) => { if (!best) best = { key, label, dur, fn, auto }; };
    if (!a.alive || a.downed) { this.prompts[role] = a.downed ? { label: 'DOWNED — waiting for a revive', p: 0 } : null; return; }
    // Revive your partner.
    const other = this.agents().find((b) => b.role !== role);
    if (other && other.downed && other.alive && Math.hypot(other.pos.x - p.x, other.pos.z - p.z) < 2.2) opt('revive', `Hold E — revive ${other.role === this.role ? this.name : this.partnerName}`, 3, () => { if (other.role === this.role) this._revived(55); else this._broadcast({ k: 'revive', role: other.role, hp: 55 }); });
    // Silent takedown from behind.
    for (const g of S.guards) {
      if (g.state === 'dead' || g.state === 'alert' || g.tower) continue;
      const d = Math.hypot(g.x - p.x, g.z - p.z);
      if (d > 1.8 || Math.abs(p.y - g.y) > 1) continue;
      const behind = Math.abs(angDiff(Math.atan2(-(p.x - g.x), -(p.z - g.z)), g.yaw + g.look)) > 1.9;
      if (behind || g.state === 'patrol' && d < 1.2) {
        opt('takedown', 'E — silent takedown', 0, () => {
          S.damage(g.id, 999, 'takedown');
          this._killFeed(g, 'takedown', role, false, 0);
          if (role === this.role) { this.audio.hitConfirm(true); this.hud.flash('TAKEDOWN'); } else this._broadcast({ k: 'takedown', role });
          if (g.chief) this._toast('Site Chief is down. Take his badge.', 'amber');
        });
        break;
      }
    }
    // Loot the badge.
    if (!ob.badge) {
      const chief = S.guards.find((g) => g.chief && g.state === 'dead' && g.badge);
      if (chief && Math.hypot(chief.x - p.x, chief.z - p.z) < 2.4) opt('badge', 'Hold E — take the Site Chief’s badge', 1, () => { ob.badge = role; chief.badge = false; this._toast(`${role === this.role ? this.name : this.partnerName} has the badge. Get to the vault door.`, 'cyan'); });
    }
    // Plant the relay.
    const rl = SPOTS.relay;
    if (!ob.relay && Math.hypot(rl.x - p.x, rl.z - p.z) < 2.4) opt('relay', 'Hold E — plant network relay', 2.2, () => { ob.relay = true; ob.access = Math.max(ob.access, 2); this.fac.relayPlanted = true; this._toast('Relay planted. Data floor is on the console: cameras, doors, contacts.', 'cyan'); });
    // Pick the mechanical maintenance door.
    const md = this.fac.doors.maint;
    if (!md.unlocked && !md.sealed && Math.hypot(md.x - p.x, md.z - p.z) < 2.6) opt('pick', 'Hold E — pick the maintenance door', 3, () => { md.unlocked = true; this._toast('Maintenance door picked.', 'dim'); });
    // Badge in at the vault (solo shooter: Rōnin cracks automatically).
    const vd = this.fac.doors.vault;
    if (!ob.vault && Math.hypot(vd.x - p.x, vd.z - p.z) < 4.5) {
      if (ob.badge === role) this.prompts[role] = { label: ob.crack > 0 ? `Cracking the vault… ${Math.round(ob.crack * 100)} %` : 'Badge accepted — Overwatch: hold CRACK on the tablet', p: ob.crack };
      else if (!ob.badge) opt('vaultx', 'Vault locked — needs the Site Chief’s badge', 0, null);
    }
    // Pull the drive.
    const sv = SPOTS.server;
    if (ob.vault && ob.upload >= 1 && (!ob.drive || ob.drive === 'server') && Math.hypot(sv.x - p.x, sv.z - p.z) < 2.6) opt('drive', 'Hold E — pull the archive drive', 1.5, () => { ob.drive = role; this._lockdown(); });
    // Pick up a dropped drive.
    if (ob.drive === 'ground' && ob.driveAt && Math.hypot(ob.driveAt.x - p.x, ob.driveAt.z - p.z) < 2) opt('pickup', 'Hold E — pick up the drive', 0.6, () => { ob.drive = role; this._toast('Drive recovered.', 'cyan'); });
    // Force the sealed dock by hand.
    const dk = this.fac.doors.dock;
    if (ob.drive && !dk.perm && Math.hypot(dk.x - p.x, dk.z - p.z) < 3.5) opt('force', 'Hold E — force the dock door', 8, () => { dk.perm = true; dk.sealed = false; this._toast('Dock forced open.', 'cyan'); this.sentinel.noise({ x: dk.x, y: 1, z: dk.z }, 30, true); });
    if (ob.uploading && Math.hypot(sv.x - p.x, sv.z - p.z) < 2.8 && !best) this.prompts[role] = { label: `UPLOADING ${Math.round(ob.upload * 100)} % · TRACE ${Math.round(ob.trace * 100)} %`, p: ob.upload };
    if (!best) { if (!this.prompts[role] || !(ob.uploading || (ob.badge === role && !ob.vault && Math.hypot(vd.x - p.x, vd.z - p.z) < 4.5))) this.prompts[role] = null; this.holdT[role] = null; return; }
    if (!best.fn) { this.prompts[role] = { label: best.label, p: 0 }; return; }
    let h = this.holdT[role];
    if (!h || h.key !== best.key) h = this.holdT[role] = { key: best.key, t: 0 };
    if (held) h.t += dt; else h.t = 0;
    this.prompts[role] = { label: best.label, p: best.dur ? clamp(h.t / best.dur, 0, 1) : 0 };
    if (held && h.t >= best.dur && !h.done) { h.done = true; best.fn(); }
    if (!held) h.done = false;
    // Lockpicking makes a little noise.
    if (held && best.key === 'pick' && Math.random() < dt * 2) this.sentinel.noise(p, 6, false);
  }

  _openVault() {
    const ob = this.obj;
    ob.vault = true;
    ob.access = 3;
    const v = this.fac.doors.vault;
    v.perm = true;
    this._toast('Vault cracked. The cold archive is on the console.', 'cyan');
  }

  _lockdown() {
    const S = this.sentinel;
    S.lockdown = true;
    S.raise(1, null);
    for (const id of ['front', 'side', 'dock']) { const d = this.fac.doors[id]; d.sealed = true; d.hackOpen = 0; }
    for (const g of S.guards) if (g.state !== 'dead') S._alert(g, null, { x: SPOTS.server.x, z: SPOTS.server.z + 8 }), g.searchT = 20;
    this._toast('SENTINEL: lockdown. The building is sealed.', 'red');
    this._toast('Exfil bird inbound to the LZ. Get the dock open.', 'cyan');
    this._lockdownFx();
    this._broadcast({ k: 'lockdown' });
  }

  _lockdownFx() {
    this.hud.flash('LOCKDOWN', 'red');
    this.heli.visible = true;
    this.heliT = 0;
  }

  // ---- end ------------------------------------------------------------------------------
  _rating(win) {
    const st = this.sentinel.stats;
    if (!win) return 'BURNED';
    if (this.sentinel.alarmPeakPre >= 1 || this._loudAlarm) return 'LOUD';
    if (st.kills > 0) return 'LETHAL';
    if (st.takedowns > 0) return 'SILENT';
    return 'GHOST';
  }

  _win() {
    if (this.ended) return;
    const info = this._endInfo(true);
    this._end(true, info);
    this.send({ t: 'end', win: true, info });
  }
  _lose() {
    if (this.ended) return;
    const info = this._endInfo(false);
    this._end(false, info);
    this.send({ t: 'end', win: false, info });
  }
  _endInfo(win) {
    const st = this.sentinel.stats;
    return { rating: this._rating(win), time: Math.round(this.t), kills: st.kills, takedowns: st.takedowns, drones: st.drones, spotted: st.spotted, alarm: Math.round(this.sentinel.alarmPeak * 100) };
  }

  _end(win, info) {
    if (this.ended) return;
    this.ended = { win, info };
    if (this.tablet.visible) this.tablet.close();
    if (this.quad && this.quad.active) this._endQuad();
    document.exitPointerLock && document.exitPointerLock();
    this.hud.debrief(win, info, this.stats);
  }

  // ---- visuals ------------------------------------------------------------------------
  _updatePartner(dt) {
    const Q = this.partner;
    if (!Q.ai && Q.tpos) {
      if (Q.pos.distanceTo(Q.tpos) > 8) Q.pos.copy(Q.tpos);
      Q.pos.lerp(Q.tpos, Math.min(1, dt * 12));
      Q.yaw += angDiff(Q.tyaw || 0, Q.yaw) * Math.min(1, dt * 12);
    }
    if (Q.ai && Q.role === 'spotter') { Q.yaw = Math.PI * 0.02; }
    const av = Q.avatar;
    av.setVisible(Q.seen && !Q.avatarHidden && !Q.kia);
    if (!Q.seen) return;
    av.update(dt, { p: Q.pos, yaw: Q.yaw, pitch: Q.pitch || 0, st: Q.downed ? 2 : Q.st, moving: Q.moving, w: Q.w });
    // Cloaked shooter: shimmer instead of the kit.
    const ck = Q.cloak;
    if (ck !== Q._ck) {
      Q._ck = ck;
      av.root.traverse((o) => {
        if (!o.isMesh) return;
        if (ck) { o.userData._m = o.userData._m || o.material; o.material = this.cloakMat; }
        else if (o.userData._m) o.material = o.userData._m;
      });
    }
    // Partner's quad.
    if (Q.quad) { this.quadObj.visible = true; this.quadObj.position.set(Q.quad[0], Q.quad[1], Q.quad[2]); this.quadObj.rotation.y = Q.quad[3]; }
    else if (!(this.quad && this.quad.active)) this.quadObj.visible = false;
    // Your own body when down (third person).
    const showSelf = this.downed && !this.kia;
    this.selfAvatar.setVisible(showSelf);
    if (showSelf) this.selfAvatar.update(dt, { p: this.player.pos, yaw: this.player.yaw, pitch: 0, st: 2, moving: false, w: true });
  }

  _visuals(dt) {
    this.cloakMat.uniforms.uTime.value = this.t;
    this.cloakMat.uniforms.uFlick.value = Math.max(this.cloak.flick, this.partner.cloakFlicker ? 1 : 0) * 0.6;
    // Trails fade (and the vapor trail swells a little as it hangs).
    for (const tr of this.trails) {
      tr.t += dt;
      const k = tr.t / tr.life;
      if (tr.ring) { const s = 1 + k * tr.ring; tr.mesh.scale.set(s, 1, s); tr.mesh.material.opacity = 0.6 * (1 - k); }
      else if (tr.grow) { tr.mesh.material.opacity = 0.55 * (1 - k) * (1 - k); tr.mesh.scale.set(1 + k * 3, 1 + k * 3, 1); tr.mesh.children[0].material.opacity = 0.12 * (1 - k); }
      else tr.mesh.material.opacity = 0.9 * (1 - k);
      if (k >= 1) { this.scene.remove(tr.mesh); tr.mesh.geometry.dispose(); }
    }
    this.trails = this.trails.filter((tr) => tr.t < tr.life);
    // Supply crates.
    const seen = new Set();
    for (const c of this.crates) {
      seen.add(c.id);
      let o = this.crateObjs.get(c.id);
      if (!o) { o = buildCrate(); this.scene.add(o); this.crateObjs.set(c.id, o); }
      o.position.set(c.x, c.y, c.z);
      o.userData.chute.visible = !c.landed;
    }
    for (const [id, o] of this.crateObjs) if (!seen.has(id)) { this.scene.remove(o); this.crateObjs.delete(id); }
    // Medevac drone.
    this.medObj.visible = !!this.medevac;
    if (this.medevac) { this.medObj.position.set(this.medevac.x, this.medevac.y, this.medevac.z); for (const r of this.medObj.userData.rotors) r.rotation.y += dt * 40; }
    // Own quad seen from outside isn't needed (you're in it).
    if (this.quad && this.quad.active) this.quadObj.visible = false;
    // Exfil bird.
    if (this.heli.visible) {
      this.heliT = (this.heliT || 0) + dt;
      const lz = SPOTS.lz;
      const k = clamp(this.heliT / 25, 0, 1);
      const e = 1 - (1 - k) * (1 - k);
      const x = lz.x + 220 * (1 - e), y = terrainHeight(lz.x, lz.z) + 6 + 40 * (1 - e) + Math.sin(this.t * 1.3) * 0.3, z = lz.z - 140 * (1 - e);
      this.heli.position.set(x, y, z);
      this.heli.rotation.y = Math.PI / 2 + 0.6 * (1 - e);
      this.heli.userData.rotor.rotation.y += dt * 25;
      this.heli.userData.rotor2.rotation.y += dt * 25;
      this.heli.userData.light.visible = Math.sin(this.t * 6) > 0;
      this.fac.lzRing.material.opacity = 0.35 + Math.sin(this.t * 4) * 0.2;
      if (!this._heliLoop) { this._heliLoop = true; this.audio.startLoop('heli', this.heli.position, 'drone', 0.5); }
      this.audio.updateLoop('heli', this.heli.position);
    }
    // Light toggles drive the point lights too.
    for (const pt of this.points) pt.L.intensity = this.fac.lightsOn[pt.zone] ? pt.I : 0;
    // The drive model leaves the rack once pulled.
    this.fac.driveMesh.visible = !this.obj.drive || this.obj.drive === 'server';
  }

  _render(dt) {
    const u = this.post.uniforms;
    u.uTime.value = this.t;
    const P = this.player;
    const quad = this.quad && this.quad.active;
    const scopeNV = P.def.scope && P.scopeT > 0.6;
    const nv = quad || scopeNV || this.nv;
    u.uNV.value += ((nv ? 1 : 0) - u.uNV.value) * Math.min(1, dt * 10);
    u.uMode.value = quad ? 2 : scopeNV ? 1 : 0;
    u.uCloak.value += ((this.cloak.on && !quad ? 1 : 0) - u.uCloak.value) * Math.min(1, dt * 6);
    this.dmgFx = Math.max(0, (this.dmgFx || 0) - dt * 1.5);
    u.uDamage.value = Math.max(this.dmgFx, this.hp < this.maxHp * 0.3 && !this.downed ? 0.35 + Math.sin(this.t * 4) * 0.1 : 0);
    u.uDown.value = this.downed || this.kia ? 1 : 0;
    u.uStatic.value = Math.max(0, u.uStatic.value - dt * 2) + (quad && this.quad.bat < 8 ? 0.4 : 0);
    this.composer.render();
    // Tablet camera feed: drawn straight into a hole in the console.
    // (rendered into the bottom-left corner of the main canvas, under the tablet, and copied
    // into the console's own canvas ~15 times a second).
    this._feedT = (this._feedT || 0) - dt;
    const f = this.tablet.visible && this._feedT <= 0 && this.tablet.feed();
    if (f) {
      this._feedT = 1 / 15;
      const r = this.renderer;
      const w = Math.round(f.w), h = Math.round(f.h);
      r.autoClear = false;
      r.setScissorTest(true);
      r.setScissor(0, 0, w, h);
      r.setViewport(0, 0, w, h);
      r.clear();
      r.render(this.scene, f.cam);
      r.setScissorTest(false);
      r.setViewport(0, 0, innerWidth, innerHeight);
      r.autoClear = true;
      const pr = r.getPixelRatio(), src = r.domElement;
      f.ctx.drawImage(src, 0, src.height - h * pr, w * pr, h * pr, 0, 0, f.canvas.width, f.canvas.height);
      f.ctx.fillStyle = 'rgba(0,255,224,0.06)';
      for (let y = 0; y < f.canvas.height; y += 3) f.ctx.fillRect(0, y, f.canvas.width, 1);
    }
  }

  // ---- HUD ------------------------------------------------------------------------------
  _buildHud() {
    this.hud = new CellHud(this);
  }

  exit() {
    if (this.net && this.net.close) this.net.close();
    if (location.search) location.replace(location.href.split('?')[0].split('#')[0]);
    else location.reload();
  }
}

// =============================================================================
// HUD
// =============================================================================
class CellHud {
  constructor(game) {
    this.g = game;
    const root = (this.root = document.createElement('div'));
    root.id = 'cell-hud';
    root.className = 'role-' + game.role;
    root.innerHTML = `
      <canvas id="cell-overlay"></canvas>
      <div class="c-obj"><div class="c-obj-n"></div><div class="c-obj-t"></div><div class="c-obj-h"></div></div>
      <div class="c-alarm"><span class="c-al-l">SENTINEL</span><b class="c-al-s">QUIET</b><i><em></em></i></div>
      <div class="c-partner"></div>
      <div class="c-feed"></div>
      <div class="c-comms"></div>
      <div class="c-vitals"><div class="c-hp"><span>HP</span><i><em></em></i></div><div class="c-camo"><span>CAMO</span><i><em></em></i></div><div class="c-chips"></div></div>
      <div class="c-ammo"><b class="c-am-n"></b><span class="c-am-r"></span><div class="c-am-w"></div><div class="c-am-s"></div></div>
      <div class="c-prompt"><span></span><i><em></em></i></div>
      <div class="c-flash"></div>
      <div class="c-keys"></div>
      <div class="c-dmg"></div>
      <div class="c-pause"><div class="c-card"><h2>PAUSED</h2><p class="c-pnote"></p><button class="primary c-resume">Resume</button><button class="ghost c-exit">Abort mission</button></div></div>
      <div class="c-debrief"></div>`;
    document.body.appendChild(root);
    document.body.classList.add('cell-mode', 'cell-' + game.role);
    const $ = (s) => root.querySelector(s);
    this.el = {
      overlay: $('#cell-overlay'), objN: $('.c-obj-n'), objT: $('.c-obj-t'), objH: $('.c-obj-h'), alS: $('.c-al-s'), alBar: $('.c-alarm em'), alarm: $('.c-alarm'),
      partner: $('.c-partner'), feed: $('.c-feed'), comms: $('.c-comms'), hp: $('.c-hp em'), camo: $('.c-camo em'), camoBox: $('.c-camo'), chips: $('.c-chips'),
      amN: $('.c-am-n'), amR: $('.c-am-r'), amW: $('.c-am-w'), amS: $('.c-am-s'), prompt: $('.c-prompt'), promptT: $('.c-prompt span'), promptB: $('.c-prompt em'),
      flash: $('.c-flash'), keys: $('.c-keys'), dmg: $('.c-dmg'), pause: $('.c-pause'), debrief: $('.c-debrief'),
    };
    game.overlay = this.el.overlay;
    this.ctx = this.el.overlay.getContext('2d');
    this.el.camoBox.style.display = game.role === 'shooter' ? '' : 'none';
    this.el.keys.innerHTML = game.role === 'shooter'
      ? '<b>G</b> camo <b>F</b> tag <b>E</b> use <b>1/2</b> rifle/pistol <b>B</b> suppressor <b>N</b> NV <b>V</b> request supply <b>TAB</b> map'
      : '<b>TAB</b> CYBER OPS <b>Q</b> quad <b>F</b> tag <b>E</b> use <b>B</b> suppressor <b>N</b> NV';
    this.objective(0, OBJECTIVES[0], false);
    this.hits = [];
    // Pause: losing pointer lock (Esc) opens it, except while the tablet has the mouse.
    document.addEventListener('pointerlockchange', () => {
      if (game.input.touch && !game.input.mouseMode) return;
      const locked = document.pointerLockElement === game.renderer.domElement;
      this.setPause(!locked && !game.tablet.visible && !game.ended && !game.tablet.justClosed);
    });
    $('.c-resume').onclick = () => { this.setPause(false); game.input.requestLock(); };
    $('.c-exit').onclick = () => game.exit();
    $('.c-pnote').textContent = game.solo ? 'Solo: the world keeps moving — find cover first.' : 'Co-op: the mission keeps running while you are in this menu.';
    this._touch();
  }

  // Extra touch buttons for this mode, added to the existing touch layer.
  _touch() {
    const g = this.g;
    const t = document.getElementById('touch');
    if (!t) return;
    const bar = document.createElement('div');
    bar.className = 'cell-tbar';
    const pills = g.role === 'shooter'
      ? [['cell-ability', 'CAMO'], ['cell-tag', 'TAG'], ['cell-use', 'USE'], ['cell-sup', 'SUPP'], ['cell-nv', 'NV'], ['cell-tab', 'MAP']]
      : [['cell-tab', 'TABLET'], ['cell-ability', 'QUAD'], ['cell-tag', 'TAG'], ['cell-use', 'USE'], ['cell-sup', 'SUPP'], ['cell-nv', 'NV']];
    bar.innerHTML = pills.map(([a, l]) => `<div class="pill" data-act="${a}">${l}</div>`).join('') + '<div class="pill" id="cell-tpause">❚❚</div>';
    t.appendChild(bar);
    bar.querySelector('#cell-tpause').addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.setPause(true); }, { passive: false });
    this.tbar = bar;
  }

  setPause(on) {
    this.el.pause.classList.toggle('on', on);
    this.g.paused = on;
  }

  objective(i, o, announce) {
    this.el.objN.textContent = `OBJECTIVE ${i + 1} / ${OBJECTIVES.length}`;
    this.el.objT.textContent = o.title;
    this.el.objH.textContent = o.hint;
    if (announce) this.flash(o.title, 'cyan', 3);
  }

  comms(m, c, who) {
    const d = document.createElement('div');
    d.className = 'c-line c-' + (c && c[0] === '#' ? 'x' : c);
    if (c && c[0] === '#') d.style.color = c;
    d.innerHTML = (who ? `<b>${esc(who)}</b> ` : '') + esc(m);
    this.el.comms.appendChild(d);
    while (this.el.comms.children.length > 5) this.el.comms.firstChild.remove();
    setTimeout(() => d.classList.add('old'), 9000);
  }

  feed(text, color) {
    const d = document.createElement('div');
    d.textContent = text;
    d.style.color = color;
    this.el.feed.appendChild(d);
    while (this.el.feed.children.length > 4) this.el.feed.firstChild.remove();
    setTimeout(() => d.remove(), 6000);
  }

  flash(text, c = 'dim', dur = 1.6) {
    const f = this.el.flash;
    f.textContent = text;
    f.className = 'c-flash on c-' + c;
    clearTimeout(this._fl);
    this._fl = setTimeout(() => (f.className = 'c-flash'), dur * 1000);
  }

  hitMarker(head) {
    this.hits.push({ t: 0, head });
  }

  damage(ang) {
    const d = document.createElement('i');
    d.style.transform = `rotate(${-ang * 180 / Math.PI + 180}deg)`;
    this.el.dmg.appendChild(d);
    setTimeout(() => d.remove(), 900);
  }

  debrief(win, info, st) {
    const g = this.g;
    const el = this.el.debrief;
    const mm = Math.floor(info.time / 60), ss = String(info.time % 60).padStart(2, '0');
    const RATING = { GHOST: 'Never seen. Nobody hurt.', SILENT: 'Takedowns only. No alarm.', LETHAL: 'Clean but bloody. No full alarm.', LOUD: 'They knew you were there.', BURNED: 'The cell was lost.' };
    el.innerHTML = `<div class="c-card"><div class="kick">SNIPER CELL: INFILTRATION // DEBRIEF</div>
      <h2>${win ? 'INTEL SECURED' : 'MISSION FAILED'}</h2><div class="c-rate c-rate-${info.rating.toLowerCase()}">${info.rating}</div><p>${RATING[info.rating]}</p>
      <table><tr><td>Time</td><td>${mm}:${ss}</td></tr><tr><td>Kills / takedowns</td><td>${info.kills} / ${info.takedowns}</td></tr><tr><td>Drones down</td><td>${info.drones}</td></tr><tr><td>Times spotted</td><td>${info.spotted}</td></tr><tr><td>Peak alarm</td><td>${info.alarm} %</td></tr>
      <tr><td>Your shots / hits / heads</td><td>${st.shots} / ${st.hits} / ${st.heads}</td></tr><tr><td>Longest kill</td><td>${st.longest} m</td></tr></table>
      <button class="primary c-again">Back to menu</button></div>`;
    el.classList.add('on');
    el.querySelector('.c-again').onclick = () => g.exit();
  }

  update(dt) {
    const g = this.g, P = g.player, ob = g.obj, S = g.sentinel;
    // Objective & alarm.
    const lab = S.alarmLabel;
    if (lab !== this._al) { this._al = lab; this.el.alS.textContent = lab; this.el.alarm.dataset.s = lab.toLowerCase(); }
    this.el.alBar.style.width = `${Math.round(S.alarm * 100)}%`;
    if (ob.step !== this._step) { this._step = ob.step; this.objective(ob.step, OBJECTIVES[ob.step], false); }
    // Partner card.
    const Q = g.partner;
    const qd = Q.seen ? Math.round(Q.pos.distanceTo(P.pos)) : 0;
    const qs = Q.kia ? 'KIA' : Q.downed ? 'DOWN' : !Q.seen ? 'NO LINK' : Q.ai ? (g.aiShoot && g.aiShoot.moveT > 0 ? 'RELOCATING' : 'AI') : Q.tablet ? 'ON CONSOLE' : Q.quad ? 'FLYING QUAD' : Q.cloak ? 'CLOAKED' : 'OK';
    const ph = `<b style="color:${ROLES[Q.role].color}">${esc(Q.name)}</b> <span>${ROLES[Q.role].name}</span> <em>${qs}</em> <span>${qd} m</span>`;
    if (ph !== this._ph) { this._ph = ph; this.el.partner.innerHTML = ph; }
    // Vitals & chips.
    this.el.hp.style.width = `${Math.round((g.hp / g.maxHp) * 100)}%`;
    this.el.hp.parentNode.parentNode.classList.toggle('low', g.hp < g.maxHp * 0.3);
    this.el.camo.style.width = `${Math.round(g.cloak.bat)}%`;
    this.el.camoBox.classList.toggle('on', g.cloak.on);
    const chips = [];
    if (g.nv) chips.push('NV');
    if (g.cloak.on) chips.push('CAMO');
    if (ob.badge === g.role) chips.push('BADGE');
    if (ob.drive === g.role) chips.push('DRIVE');
    if (g.role === 'spotter' && g.ops) chips.push(`BW ${Math.round(g.ops.bw)}`);
    if (g.role === 'spotter') chips.push(g.quad && g.quad.active ? `QUAD ${Math.ceil(g.quad.bat)}s` : g.quadCd > 0 ? `QUAD ${Math.ceil(g.quadCd)}s` : 'QUAD READY');
    const ch = chips.map((c) => `<i>${c}</i>`).join('');
    if (ch !== this._ch) { this._ch = ch; this.el.chips.innerHTML = ch; }
    // Ammo.
    const w = P.w;
    this.el.amN.textContent = w.mag + w.chamber;
    this.el.amR.textContent = '/ ' + w.reserve;
    this.el.amW.textContent = P.def.name + (P.def.slot === 'rifle' ? ' · SUPPRESSED' : '');
    this.el.amS.textContent = P.def.slot === 'pistol' ? (g.pistolSup ? 'SUPPRESSOR ON (B)' : 'SUPPRESSOR OFF (B) — LOUD') : P.scoped ? `${P.zoom}× · NIGHT VISION` : '';
    this.el.amS.classList.toggle('loud', P.def.slot === 'pistol' && !g.pistolSup);
    // Prompt.
    let pr = g.prompts[g.role];
    if (g.downed && !g.kia) pr = { label: `BLEEDING OUT ${Math.ceil(g.bleed)} s — ${g.solo ? 'medevac drone is your only way up' : g.partnerName + ' can revive you (hold E)'}`, p: g.bleed / BLEED };
    if (g.kia) pr = { label: `KIA — watching ${g.partnerName}`, p: 0 };
    this.el.prompt.classList.toggle('on', !!pr && !g.tablet.visible);
    if (pr) { this.el.promptT.textContent = pr.label; this.el.promptB.style.width = `${Math.round((pr.p || 0) * 100)}%`; this.el.prompt.classList.toggle('bar', pr.p > 0); }
    this.root.classList.toggle('tablet', g.tablet.visible);
    this._draw(dt);
  }

  // Markers (tags, objectives, partner, pins), the scope and the detection arcs.
  _draw(dt) {
    const g = this.g, c = this.ctx, cv = this.el.overlay, P = g.player, S = g.sentinel, cam = g.camera;
    const k = cv.width / innerWidth;
    c.setTransform(k, 0, 0, k, 0, 0);
    c.clearRect(0, 0, innerWidth, innerHeight);
    if (g.tablet.visible || g.ended) return;
    const W = innerWidth, H = innerHeight;
    const v = new THREE.Vector3();
    const proj = (x, y, z) => {
      v.set(x, y, z).project(cam);
      const behind = v.z > 1;
      return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, behind };
    };
    const camP = cam.position;
    const edge = (p, m = 30) => { if (p.behind) { p.x = clamp(W - p.x, W * 0.3, W * 0.7); p.y = H - 70; } p.x = clamp(p.x, m, W - m); p.y = clamp(p.y, m, H - m); return p; };
    const scoped = P.def.scope && P.scopeT > 0.6 && !(g.quad && g.quad.active);
    // Tagged and scanned contacts: red diamonds through walls.
    c.font = '600 11px JetBrains Mono, monospace';
    c.textAlign = 'center';
    for (const e of [...S.guards, ...S.drones]) {
      if (e.state === 'dead') continue;
      const tag = e.tagT > 0, scan = e.scanT > 0;
      if (!tag && !scan) continue;
      const y = (e.y || 0) + (e.kind === 'g' ? 2.05 : 0.8);
      const p = proj(e.x, y, e.z);
      if (p.behind) continue;
      const d = Math.hypot(e.x - camP.x, e.z - camP.z);
      const s = tag ? 7 : 4;
      c.strokeStyle = e.chief ? '#c070ff' : e.kind === 'd' ? '#ff8040' : '#ff3048';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(p.x, p.y - s); c.lineTo(p.x + s, p.y); c.lineTo(p.x, p.y + s); c.lineTo(p.x - s, p.y); c.closePath();
      c.stroke();
      if (tag) { c.fillStyle = c.strokeStyle; c.fillText(`${e.chief ? 'CHIEF ' : ''}${Math.round(d)}m`, p.x, p.y - 11); }
    }
    // Objective marker.
    const om = this._objPoint();
    if (om && !om.hide) {
      const p = edge(proj(om.x, om.y, om.z));
      const d = Math.hypot(om.x - camP.x, om.z - camP.z);
      c.strokeStyle = '#30ffd0';
      c.fillStyle = '#30ffd0';
      c.lineWidth = 2;
      c.beginPath(); c.arc(p.x, p.y, 7, 0, Math.PI * 2); c.stroke();
      c.fillText(`${om.label} ${Math.round(d)}m`, p.x, p.y - 13);
    }
    // Partner.
    const Q = g.partner;
    if (Q.seen && !Q.kia && !(Q.ai && Q.avatarHidden)) {
      const p = edge(proj(Q.pos.x, Q.pos.y + 2.2, Q.pos.z));
      c.fillStyle = ROLES[Q.role].color;
      c.beginPath(); c.moveTo(p.x, p.y + 6); c.lineTo(p.x - 6, p.y - 4); c.lineTo(p.x + 6, p.y - 4); c.closePath(); c.fill();
      c.fillText(`${Q.name}${Q.downed ? ' — DOWN' : ''}`, p.x, p.y - 9);
    }
    // Pins and the LKP.
    for (const pin of g.pins) {
      pin.t -= dt;
      const p = edge(proj(pin.x, terrainHeight(pin.x, pin.z) + 1.5, pin.z));
      c.strokeStyle = c.fillStyle = pin.by === g.role ? ROLES[g.role].color : ROLES[g.partnerRole].color;
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - 5, p.y - 10); c.lineTo(p.x + 5, p.y - 10); c.closePath(); c.stroke();
      c.fillText(pin.label, p.x, p.y - 14);
    }
    g.pins = g.pins.filter((p) => p.t > 0);
    if (S.lkp && S.lkpT > 0) {
      const p = proj(S.lkp.x, 1, S.lkp.z);
      if (!p.behind) { c.strokeStyle = 'rgba(255,255,255,0.6)'; c.setLineDash([3, 3]); c.strokeRect(p.x - 6, p.y - 14, 12, 28); c.setLineDash([]); c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillText('LAST KNOWN', p.x, p.y - 18); }
    }
    // Supply crates.
    for (const cr of g.crates) { if (!cr.landed) continue; const p = proj(cr.x, cr.y + 1.2, cr.z); if (!p.behind) { c.fillStyle = '#40ffb0'; c.fillText('SUPPLY', p.x, p.y); } }
    // Detection arcs: guards that are noticing you.
    const me = P.pos;
    for (const e of S.guards) {
      if (e.state === 'dead' || e.aw < 0.08) continue;
      const d = Math.hypot(e.x - me.x, e.z - me.z);
      if (d > 70) continue;
      if (!(e.state === 'alert' && e.target === g.role) && e.state !== 'sus' && e.aw < 0.15) continue;
      const ang = Math.atan2(e.x - me.x, e.z - me.z) - P.yaw;
      const rr = Math.min(W, H) * 0.18;
      const a0 = -ang - Math.PI / 2 + Math.PI;
      c.strokeStyle = e.state === 'alert' ? 'rgba(255,48,72,0.9)' : 'rgba(255,208,64,0.85)';
      c.lineWidth = 4;
      c.beginPath();
      c.arc(W / 2, H / 2, rr, a0 - 0.22 * clamp(e.aw, 0.2, 1), a0 + 0.22 * clamp(e.aw, 0.2, 1));
      c.stroke();
    }
    // Hit markers.
    for (const h of this.hits) h.t += dt;
    this.hits = this.hits.filter((h) => h.t < 0.3);
    for (const h of this.hits) {
      c.strokeStyle = h.head ? '#ff4060' : '#ffffff';
      c.lineWidth = 2;
      const s = 6 + h.t * 20, o = 4;
      for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { c.beginPath(); c.moveTo(W / 2 + sx * o, H / 2 + sy * o); c.lineTo(W / 2 + sx * s, H / 2 + sy * s); c.stroke(); }
    }
    // Scope (Halo-style ring with a range readout) or a small crosshair.
    if (scoped) this._scope(c, W, H);
    else if (g.quad && g.quad.active) this._quadHud(c, W, H);
    else if (!g.downed && !g.kia) {
      c.strokeStyle = 'rgba(220,240,255,0.75)';
      c.lineWidth = 1.5;
      const s = P.def.slot === 'pistol' && P.scopeT > 0.5 ? 3 : 6;
      c.beginPath(); c.moveTo(W / 2 - s - 4, H / 2); c.lineTo(W / 2 - 4, H / 2); c.moveTo(W / 2 + 4, H / 2); c.lineTo(W / 2 + s + 4, H / 2); c.moveTo(W / 2, H / 2 + 4); c.lineTo(W / 2, H / 2 + s + 4); c.stroke();
    }
  }

  _objPoint() {
    const g = this.g, ob = g.obj;
    switch (ob.step) {
      case 0: return { x: -80, y: 2, z: 11, label: 'FENCE GAP' };
      case 1: return { x: SPOTS.relay.x, y: 1.5, z: SPOTS.relay.z, label: 'RELAY' };
      case 2: { const c = g.sentinel.guards.find((q) => q.chief); return c ? { x: c.x, y: c.y + 2.4, z: c.z, label: c.state === 'dead' ? 'BADGE' : 'CHIEF', hide: c.state !== 'dead' && !(c.tagT > 0 || c.rev) } : null; }
      case 3: return { x: g.fac.doors.vault.x, y: 2.2, z: g.fac.doors.vault.z + 0.6, label: 'VAULT' };
      case 4: case 5: return { x: SPOTS.server.x, y: 1.6, z: SPOTS.server.z + 1, label: ob.step === 4 ? 'CONSOLE' : 'DRIVE' };
      case 6: return ob.drive === 'ground' && ob.driveAt ? { x: ob.driveAt.x, y: 1, z: ob.driveAt.z, label: 'DRIVE' } : { x: SPOTS.lz.x, y: terrainHeight(SPOTS.lz.x, SPOTS.lz.z) + 2, z: SPOTS.lz.z, label: 'LZ' };
    }
    return null;
  }

  _scope(c, W, H) {
    const g = this.g, P = g.player;
    const R = Math.min(W, H) * 0.44;
    c.fillStyle = '#000';
    c.beginPath();
    c.rect(0, 0, W, H);
    c.arc(W / 2, H / 2, R, 0, Math.PI * 2, true);
    c.fill('evenodd');
    c.strokeStyle = 'rgba(120,255,190,0.85)';
    c.lineWidth = 1.5;
    c.beginPath(); c.arc(W / 2, H / 2, R, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(W / 2, H / 2, R * 0.12, 0, Math.PI * 2); c.stroke();
    c.beginPath();
    c.moveTo(W / 2 - R, H / 2); c.lineTo(W / 2 - R * 0.14, H / 2);
    c.moveTo(W / 2 + R * 0.14, H / 2); c.lineTo(W / 2 + R, H / 2);
    c.moveTo(W / 2, H / 2 + R * 0.14); c.lineTo(W / 2, H / 2 + R);
    c.moveTo(W / 2, H / 2 - R); c.lineTo(W / 2, H / 2 - R * 0.14);
    c.stroke();
    c.fillStyle = 'rgba(120,255,190,0.9)';
    c.fillRect(W / 2 - 1, H / 2 - 1, 2, 2);
    // Range to whatever is under the reticle (refreshed a few times a second).
    this._rT = (this._rT || 0) - 1 / 60;
    if (this._rT <= 0) {
      this._rT = 0.15;
      const o = P.eyePos(new THREE.Vector3());
      const h = g._hitscan(o, o.clone().addScaledVector(P.aimDir(new THREE.Vector3()), 900));
      this._range = h ? o.distanceTo(h.point) : null;
      this._onTarget = !!(h && h.enemy);
    }
    c.font = '600 14px JetBrains Mono, monospace';
    c.textAlign = 'left';
    c.fillText(`${P.zoom}×`, W / 2 + R * 0.72, H / 2 + R * 0.62);
    c.fillText(this._range ? `${this._range.toFixed(1)} m` : '--- m', W / 2 + R * 0.18, H / 2 - R * 0.06);
    c.textAlign = 'center';
    if (this._onTarget) { c.strokeStyle = 'rgba(255,60,80,0.95)'; c.beginPath(); c.arc(W / 2, H / 2, R * 0.12, 0, Math.PI * 2); c.stroke(); }
    c.fillText('NIGHT VISION', W / 2, H / 2 + R * 0.86);
  }

  _quadHud(c, W, H) {
    const q = this.g.quad;
    c.strokeStyle = 'rgba(230,240,255,0.8)';
    c.lineWidth = 1.5;
    const m = 40;
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) { c.beginPath(); c.moveTo(x, y + sy * 30); c.lineTo(x, y); c.lineTo(x + sx * 30, y); c.stroke(); }
    c.beginPath(); c.arc(W / 2, H / 2, 16, 0, Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(230,240,255,0.9)';
    c.font = '600 13px JetBrains Mono, monospace';
    c.fillText(`RECON QUAD · BAT ${Math.ceil(q.bat)} s · HULL ${Math.max(0, q.hp)}`, W / 2, 78);
    c.fillText(`ALT ${(q.y - terrainHeight(q.x, q.z)).toFixed(1)} m · F TAG · Q LAND`, W / 2, 96);
  }
}

function esc(s) {
  return String(s).replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));
}
void PLAYER;
