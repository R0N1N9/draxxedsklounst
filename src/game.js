import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import { BALLISTICS, ROUND, WEAPON, UPLINK, NET, DAMAGE, PLAYER } from './config.js';
import { PALETTES, applyPalette, withHaze, hazeUniforms } from './atmosphere.js';
import { World } from './world.js';
import { Wind, stepProjectile } from './ballistics.js';
import { LocalPlayer } from './player.js';
import { Avatar, worldCapsules, scopePoint } from './avatar.js';
import { Effects } from './effects.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Replay, sampleHist, pushHist } from './killcam.js';
import { segSegClosest, clamp, mulberry32 } from './util.js';
import { crestAt } from './terrain.js';

const ACCENTS = ['#e0a040', '#40c8d8'];
const ZOOM_GLINT = { 4: 0.32, 8: 0.68, 12: 1.0 };
const PART_NAMES = { head: 'HEADSHOT', torso: 'BODY SHOT', legs: 'LEG SHOT' };

// Final look: silhouette ink lines from depth, split-tone grade, vignette, grain, damage tint.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uNear: { value: 0.1 },
    uFar: { value: 7000 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uAmount: { value: 0.35 },
    uDamage: { value: 0 },
    uOutline: { value: 1 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform sampler2D tDepth;
    uniform float uNear, uFar, uTime, uAmount, uDamage, uOutline; uniform vec2 uRes;
    varying vec2 vUv;
    float lin(vec2 uv) {
      float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
      return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
    }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      // Ink outline where a nearer surface sits in front of something much farther.
      vec2 px = 1.0 / uRes;
      float d0 = lin(vUv);
      float dm = 0.0;
      dm = max(dm, lin(vUv + vec2(px.x, 0.0)) - d0);
      dm = max(dm, lin(vUv - vec2(px.x, 0.0)) - d0);
      dm = max(dm, lin(vUv + vec2(0.0, px.y)) - d0);
      dm = max(dm, lin(vUv - vec2(0.0, px.y)) - d0);
      float edge = smoothstep(0.06, 0.22, dm / d0) * (1.0 - smoothstep(350.0, 1400.0, d0)) * uOutline;
      c.rgb = mix(c.rgb, c.rgb * 0.18 + vec3(0.006, 0.005, 0.012), edge * 0.85);
      // Grade: slight desaturation, cool shadows / warm highlights.
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, 0.88);
      vec3 cool = vec3(0.9, 0.96, 1.12), warm = vec3(1.07, 1.0, 0.9);
      c.rgb *= mix(cool, warm, smoothstep(0.03, 0.6, l));
      // Vignette + damage.
      vec2 d = vUv - 0.5;
      d.x *= uRes.x / uRes.y;
      float v = smoothstep(1.0, 0.25, length(d));
      c.rgb *= mix(1.0 - uAmount, 1.0, v);
      c.rgb = mix(c.rgb, vec3(0.5, 0.02, 0.04), uDamage * (1.0 - v) * 0.85);
      // Film grain.
      float g = hash(vUv * uRes + fract(uTime) * 91.7) - 0.5;
      c.rgb += g * 0.018 * (0.25 + l);
      gl_FragColor = c;
    }`,
};

export class Game {
  constructor({ mode, net, quality, paletteKey, name, settings, hostCode }) {
    this.mode = mode; // 'practice' | 'host' | 'guest'
    this.net = net;
    this.quality = quality;
    this.paletteKey = paletteKey;
    this.palette = PALETTES[paletteKey];
    this.name = name || 'You';
    this.oppName = 'Opponent';
    this.hostCode = hostCode;
    this.me = mode === 'guest' ? 1 : 0;
    this.settings = settings;

    this._initRenderer();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(WEAPON.baseFov, innerWidth / innerHeight, 0.1, 7000);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.scene.add(this.sun, this.sun.target);
    if (quality === 'high') {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      const sc = this.sun.shadow.camera;
      sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 900;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.6;
    }

    this.world = new World(this.scene, quality, this.palette);
    this.sunDir = applyPalette(this.palette, { sky: this.world.sky, sunLight: this.sun, hemi: this.hemi, renderer: this.renderer });

    this.effects = new Effects(this.scene);
    this.hud = new Hud();
    this.input = new Input(this.renderer.domElement, document.getElementById('touch'));
    this.input.sensitivity = settings.sensitivity;
    this.input.invertY = settings.invertY;
    this.input.scopeToggle = settings.scopeToggle;
    this.audio = settings.audio;

    this.player = new LocalPlayer();
    this.remote = new Avatar(ACCENTS[1 - this.me]);
    this.scene.add(this.remote.root);
    this.remote.setVisible(false);
    this.ghostA = new Avatar(ACCENTS[0]);
    this.ghostB = new Avatar(ACCENTS[1]);
    this.scene.add(this.ghostA.root, this.ghostB.root);
    this.ghostA.setVisible(false);
    this.ghostB.setVisible(false);
    this.wind = new Wind();
    this.replay = new Replay({ scene: this.scene, camera: this.camera, effects: this.effects, ghostA: this.ghostA, ghostB: this.ghostB, wind: this.wind });
    this._buildViewmodel();

    // Match state
    this.phase = mode === 'practice' ? 'practice' : 'wait';
    this.phaseT = 0;
    this.round = 0;
    this.scores = [0, 0];
    this.sides = [-1, 1];
    this.roundTime = 0;
    this.uplinkState = this.world.uplinks.map(() => ({ owner: -1, progress: 0, enemyHacking: false }));
    this.hacking = -1;
    this.bullets = [];
    this.shotId = 0;
    this.myShots = new Map();
    this.remoteShots = new Map();
    this.selfHist = [];
    this.remoteHist = [];
    this.remoteHp = 100;
    this.remoteAlive = false;
    this.remoteHack = -1;
    this.pings = [];
    this.stateT = 0;
    this.syncT = 0;
    this.now = 0;
    this.result = null;
    this.killShown = null;
    this.beepT = 0;
    this.footT = 0;

    this.targets = [];
    if (mode === 'practice') this._setupPractice();
    else this._setupNet();

    this._spawnFree();
    this.hud.show(true);
    this._resize();
    addEventListener('resize', () => this._resize());
    this.clock = new THREE.Clock();
    this.frameTimes = [];
    this.renderer.setAnimationLoop(() => this._frame());
  }

  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------
  _initRenderer() {
    const canvas = document.getElementById('game');
    const q = this.quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: q === 'low', powerPreference: 'high-performance', stencil: false });
    this.basePR = q === 'high' ? Math.min(devicePixelRatio, 2) : q === 'medium' ? Math.min(devicePixelRatio, 1.5) : Math.min(devicePixelRatio, 1);
    this.pr = this.basePR;
    this.renderer.setPixelRatio(this.pr);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = q === 'high';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.useComposer = q !== 'low';
  }

  _initComposer() {
    if (!this.useComposer || this.composer) return;
    const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, {
      type: THREE.HalfFloatType,
      samples: this.quality === 'high' ? 4 : 0,
      depthTexture: new THREE.DepthTexture(innerWidth, innerHeight),
    });
    this.composer = new EffectComposer(this.renderer, rt);
    // The ping-pong buffer must not share the depth texture we sample in the grade pass.
    this.composer.renderTarget2.depthTexture = new THREE.DepthTexture(innerWidth, innerHeight);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.55, 0.55, 0.92);
    this.composer.addPass(this.bloom);
    this.vignette = new ShaderPass(GradeShader);
    this.composer.addPass(this.vignette);
    this.composer.addPass(new OutputPass());
  }

  _resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight, false);
    this._initComposer();
    if (this.composer) {
      this.composer.setPixelRatio(this.pr);
      this.composer.setSize(innerWidth, innerHeight);
    }
  }

  _buildViewmodel() {
    const g = new THREE.Group();
    const m = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, emissive: c, emissiveIntensity: 0.12 });
    const metal = m('#3a3a42'), wood = m('#4e5040'), glove = m('#3d3a30'), lens = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.15, 0.1, 0.35) });
    const add = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); g.add(o); return o; };
    add(new THREE.BoxGeometry(0.04, 0.055, 0.8), metal, 0, 0, -0.42);
    add(new THREE.CylinderGeometry(0.011, 0.011, 0.55, 8).rotateX(Math.PI / 2), metal, 0, 0.01, -1.05);
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8).rotateX(Math.PI / 2), metal, 0, 0.01, -1.36);
    add(new THREE.BoxGeometry(0.055, 0.1, 0.34), wood, 0, -0.035, 0.08);
    add(new THREE.CylinderGeometry(0.026, 0.034, 0.34, 10).rotateX(Math.PI / 2), metal, 0, 0.075, -0.25);
    add(new THREE.BoxGeometry(0.012, 0.18, 0.012), metal, 0.0, -0.11, -0.62).rotation.x = -0.4;
    this.vmBolt = add(new THREE.BoxGeometry(0.06, 0.02, 0.02), metal, 0.05, 0.03, -0.05);
    add(new THREE.BoxGeometry(0.08, 0.08, 0.14), glove, -0.02, -0.06, -0.55);
    add(new THREE.BoxGeometry(0.08, 0.1, 0.12), glove, 0.03, -0.07, -0.02);
    g.position.set(0.2, -0.19, -0.35);
    g.scale.setScalar(0.62);
    g.traverse((o) => (o.renderOrder = 10));
    this.viewmodel = g;
    this.camera.add(g);
  }

  _spawnFree() {
    // Practice / waiting: on the south crest, facing the valley.
    const x = -20, z = -(crestAt(x) - 8);
    const sp = new THREE.Vector3(x, this.world.groundAt(x, z, 1e4, 0), z);
    this.player.reset(sp, Math.PI);
    this.player.zero = 400;
  }

  _setupPractice() {
    this.wind.set(Math.random() * Math.PI * 2, 2 + Math.random() * 4, Math.random() * 100);
    const steel = withHaze(new THREE.MeshLambertMaterial({ color: '#3e3c44', flatShading: true }), { key: 'steel' });
    const paint = withHaze(new THREE.MeshLambertMaterial({ color: '#d8d0c0', flatShading: true }), { key: 'paint' });
    const spots = [
      [-30, -230], [40, -150], [-10, -60], [60, 40], [-60, 120], [20, 200], [-40, 290], [80, 360], [-120, 395], [-600, -60], [430, 100],
    ];
    const mk = (x, z, mover) => {
      const y = mover ? 2 : this.world.heightAt(x, z);
      const g = new THREE.Group();
      const plate = new THREE.Group();
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.03), paint);
      torso.position.set(0, 1.18, 0);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 10).rotateX(Math.PI / 2), paint);
      head.position.set(0, 1.62, 0);
      const legs = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.85, 0.03), steel);
      legs.position.set(0, 0.45, 0);
      plate.add(torso, head, legs);
      g.add(plate);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.5), steel);
      post.position.y = 0.05;
      g.add(post);
      g.position.set(x, y, z);
      g.rotation.y = 0; // faces -Z? plates are flat; orientation hardly matters
      this.scene.add(g);
      this.targets.push({ g, plate, pos: g.position, yaw: Math.PI, swing: 0, mover, base: x, dir: 1, paint: [torso, head] });
    };
    for (const [x, z] of spots) mk(x, z, false);
    mk(0, 100, true);
    this.hud.el.practice.classList.add('on');
  }

  _setupNet() {
    const n = this.net;
    n.on('open', () => {
      n.send({ t: 'hello', name: this.name, pal: this.paletteKey });
      if (this.mode === 'host') {
        this.hud.message('OPPONENT CONNECTED', 'Match starting…', 2.5);
        setTimeout(() => this._hostStartRound(), 1500);
      }
    });
    n.on('hello', (m) => {
      this.oppName = String(m.name || 'Opponent').replace(/[<>&"]/g, '').slice(0, 16);
    });
    n.on('close', () => {
      this.hud.card(`<h2>CONNECTION LOST</h2><p>${this.oppName} left the game.</p><button onclick="location.href=location.pathname">Back to menu</button>`);
      this.remote.setVisible(false);
      this.remoteAlive = false;
      document.exitPointerLock && document.exitPointerLock();
    });
    n.on('s', (m) => this._onRemoteState(m));
    n.on('shot', (m) => this._onRemoteShot(m));
    n.on('hit', (m) => this._onHitByRemote(m));
    n.on('died', (m) => this._onRemoteDied(m));
    n.on('round', (m) => this._applyRound(m));
    n.on('sync', (m) => {
      if (this.mode !== 'guest') return;
      this.phaseT = m.pt;
      this.roundTime = m.rt;
    });
    n.on('cap', (m) => this.mode === 'host' && this._hostCapture(m.i, 1));
    n.on('reveal', (m) => this._onReveal(m));
    n.on('rematch', () => this.mode === 'host' && this._hostRematch());
    if (n.open) n.handlers.open();
  }

  // -------------------------------------------------------------------------
  // Host-authoritative round flow
  // -------------------------------------------------------------------------
  _roundMsg(extra = {}) {
    return {
      t: 'round',
      round: this.round,
      phase: this.phase,
      pt: this.phaseT,
      scores: this.scores,
      sides: this.sides,
      spawns: this.spawnIdx,
      wind: { d: this.wind.dir, s: this.wind.speed, seed: this.wind.seed },
      up: this.uplinkState.map((u) => u.owner),
      ...extra,
    };
  }

  _broadcastRound(extra) {
    const m = this._roundMsg(extra);
    this.net.send(m);
    this._applyRound(m, true);
  }

  _hostStartRound() {
    this.round++;
    const flip = this.round % 2 === 0;
    this.sides = flip ? [1, -1] : [-1, 1];
    this.spawnIdx = [Math.floor(Math.random() * 3), Math.floor(Math.random() * 3)];
    this.wind.set(Math.random() * Math.PI * 2, 1.5 + Math.random() * 5.5, Math.random() * 1000);
    this.uplinkState.forEach((u) => (u.owner = -1));
    this.phase = 'insert';
    this.phaseT = ROUND.insert;
    this._broadcastRound({ fresh: true });
  }

  _hostEndRound(winner, reason, info = {}) {
    if (this.phase !== 'live' && this.phase !== 'insert') return;
    if (winner >= 0) this.scores[winner]++;
    this.phase = 'end';
    this.phaseT = ROUND.end;
    this._broadcastRound({ result: { winner, reason, ...info } });
  }

  _hostCapture(i, who) {
    if (this.phase !== 'live') return;
    this.uplinkState[i].owner = who;
    this._broadcastRound();
    const m = { t: 'reveal', who, i };
    this.net.send(m);
    this._onReveal(m);
  }

  _hostRematch() {
    if (this.phase !== 'match') return;
    this.scores = [0, 0];
    this.round = 0;
    this._hostStartRound();
  }

  _hostTick(dt) {
    if (this.mode !== 'host' || this.phase === 'wait' || this.phase === 'match') return;
    this.phaseT -= dt;
    this.syncT -= dt;
    if (this.syncT <= 0) {
      this.syncT = 1;
      this.net.send({ t: 'sync', pt: this.phaseT, rt: this.roundTime });
    }
    if (this.phaseT > 0) return;
    if (this.phase === 'insert') {
      this.phase = 'live';
      this.phaseT = ROUND.live;
      this._broadcastRound();
    } else if (this.phase === 'live') {
      const mine = this.uplinkState.filter((u) => u.owner === 0).length;
      const theirs = this.uplinkState.filter((u) => u.owner === 1).length;
      const winner = mine > theirs ? 0 : theirs > mine ? 1 : -1;
      this._hostEndRound(winner, 'time', { up: [mine, theirs] });
    } else if (this.phase === 'end') {
      if (Math.max(...this.scores) >= ROUND.winsToMatch) {
        this.phase = 'match';
        this._broadcastRound();
      } else this._hostStartRound();
    }
  }

  _applyRound(m, local = false) {
    const prevPhase = this.phase;
    if (!local) {
      this.round = m.round;
      this.phase = m.phase;
      this.phaseT = m.pt;
      this.scores = m.scores;
      this.sides = m.sides;
      this.spawnIdx = m.spawns;
      this.wind.set(m.wind.d, m.wind.s, m.wind.seed);
    }
    m.up.forEach((o, i) => (this.uplinkState[i].owner = o));
    if (m.fresh) this._resetForRound();
    if (m.phase === 'live' && prevPhase !== 'live') {
      this.roundTime = 0;
      this.hud.message('WEAPONS HOT', 'Find them before they find you.', 2.5);
      this.audio.beep(null, true);
    }
    if (m.result) this._onRoundResult(m.result);
    if (m.phase === 'match' && prevPhase !== 'match') this._onMatchEnd();
  }

  _resetForRound() {
    const side = this.sides[this.me];
    const sp = this.world.spawns[String(side)][this.spawnIdx[this.me]];
    this.player.reset(sp, side < 0 ? Math.PI : 0);
    this.player.zero = 400;
    this.input.resetScope();
    this.uplinkState.forEach((u) => { u.progress = 0; u.enemyHacking = false; });
    this.hacking = -1;
    this.bullets.forEach((b) => b.tracer && this.effects.killTracer(b.tracer));
    this.bullets.length = 0;
    this.pings.length = 0;
    this.hud.clearMarkers();
    this.hud.card('');
    this.remoteHp = 100;
    this.remoteAlive = true;
    this.remoteDeadLock = false;
    this.remoteHist.length = 0;
    this.selfHist.length = 0;
    this.result = null;
    this.killShown = null;
    if (this.replay.active) this.replay.stop();
    this.roundTime = 0;
    this.hud.message(`ROUND ${this.round}`, `Insertion — weapons cold · ${side < 0 ? 'South' : 'North'} ridge`, 4);
  }

  _onRoundResult(r) {
    this.result = r;
    const won = r.winner === this.me, draw = r.winner < 0;
    let reason = '';
    if (r.reason === 'kill') reason = `${PART_NAMES[r.part] || 'KILL'} · ${Math.round(r.dist)} m`;
    else if (r.reason === 'time') reason = draw ? `Time — uplinks tied ${r.up[0]}–${r.up[1]}` : `Time — uplinks ${Math.max(...r.up)}–${Math.min(...r.up)}`;
    this.pendingCard = `<h2 class="${won ? 'win' : draw ? '' : 'lose'}">${draw ? 'ROUND DRAWN' : won ? 'ROUND WON' : 'ROUND LOST'}</h2><p>${reason}</p><div class="sc"><span class="me">${this.name} ${this.scores[this.me]}</span><span class="dash">—</span><span class="them">${this.scores[1 - this.me]} ${this.oppName}</span></div>`;
    if (!this.replay.active && !(r.reason === 'kill')) this._showPendingCard();
    else if (r.reason === 'kill' && !this.replay.active) setTimeout(() => !this.replay.active && this._showPendingCard(), 400);
  }

  _showPendingCard() {
    if (!this.pendingCard) return;
    this.hud.card(this.pendingCard, ROUND.end);
    this.pendingCard = null;
  }

  _onMatchEnd() {
    const won = this.scores[this.me] > this.scores[1 - this.me];
    this.hud.card(
      `<h2 class="${won ? 'win' : 'lose'}">${won ? 'VICTORY' : 'DEFEAT'}</h2><div class="sc"><span class="me">${this.name} ${this.scores[this.me]}</span><span class="dash">—</span><span class="them">${this.scores[1 - this.me]} ${this.oppName}</span></div>` +
        `<button id="btn-rematch">Rematch</button><button class="ghost" onclick="location.href=location.pathname">Leave</button>`,
    );
    document.exitPointerLock && document.exitPointerLock();
    const b = document.getElementById('btn-rematch');
    if (b)
      b.onclick = () => {
        if (this.mode === 'host') this._hostRematch();
        else { this.net.send({ t: 'rematch' }); b.textContent = 'Waiting for host…'; }
        this.input.requestLock();
      };
  }

  // -------------------------------------------------------------------------
  // Network events
  // -------------------------------------------------------------------------
  _onRemoteState(m) {
    pushHist(this.remoteHist, {
      t: this.now,
      p: new THREE.Vector3(m.p[0], m.p[1], m.p[2]),
      yaw: m.y,
      pitch: m.pi,
      st: m.st,
      sc: m.sc,
      z: m.z,
      moving: !!m.mv,
    });
    this.remoteHp = m.hp;
    if (m.al === 0) this.remoteAlive = false;
    else if (!this.remoteDeadLock && this.phase !== 'end' && this.phase !== 'match') this.remoteAlive = true;
    this.remoteHack = m.hk;
  }

  _onRemoteShot(m) {
    const o = new THREE.Vector3(...m.o), v = new THREE.Vector3(...m.v);
    this.remoteShots.set(m.id, { o: o.clone(), v: v.clone(), t0: this.now, windT0: m.wt });
    this._spawnBullet(o, v, false, m.id, m.wt);
    const dir = v.clone().normalize();
    this.effects.muzzle(o, dir);
    const d = o.distanceTo(this.camera.position);
    this.audio.shotDistant(o, d / 343);
    // Prone shots kick up a dust cloud: another tell.
    const last = this.remoteHist[this.remoteHist.length - 1];
    if (last && last.st === 2) this.effects.puff(o.clone().add(new THREE.Vector3(0, -0.2, 0)), 'dust', 2.2, 2.0);
  }

  _onHitByRemote(m) {
    const P = this.player;
    if (!P.alive) return;
    P.hp -= m.dmg;
    const shot = this.remoteShots.get(m.id);
    if (shot) {
      const dx = shot.o.x - P.pos.x, dz = shot.o.z - P.pos.z;
      const right = dx * Math.cos(P.yaw) - dz * Math.sin(P.yaw);
      const fwd = -dx * Math.sin(P.yaw) - dz * Math.cos(P.yaw);
      this.hud.damage(Math.atan2(right, fwd));
    }
    if (P.hp <= 0) {
      P.alive = false;
      P.hp = 0;
      this.net.send({ t: 'died', id: m.id, part: m.part, dist: m.dist, ip: m.ip });
      this._sendState(true);
      if (this.mode === 'host') this._hostEndRound(1 - this.me, 'kill', { part: m.part, dist: m.dist });
      if (shot) {
        this.replay.start({
          mode: 'victim',
          shooterHist: this.remoteHist.slice(),
          victimHist: this.selfHist.slice(),
          shot,
          impact: new THREE.Vector3(...m.ip),
          onDone: () => this._showPendingCard(),
        });
        this._replayLabel(`KILLED BY ${this.oppName.toUpperCase()}`, `${PART_NAMES[m.part]} · ${Math.round(m.dist)} m`);
      }
    } else {
      P.wounded = true;
      this.hud.message('HIT', `${PART_NAMES[m.part] || ''} — you're wounded. Move!`, 2);
    }
  }

  _onRemoteDied(m) {
    this.remoteAlive = false;
    this.remoteDeadLock = true;
    if (this.mode === 'host') this._hostEndRound(this.me, 'kill', { part: m.part, dist: m.dist });
    if (this.killShown !== m.id) this._startKillerReplay(m.id, new THREE.Vector3(...m.ip), m.part, m.dist);
  }

  _startKillerReplay(id, impact, part, dist) {
    const shot = this.myShots.get(id);
    if (!shot || this.replay.active) return;
    this.killShown = id;
    this.replay.start({
      mode: 'killer',
      shooterHist: this.selfHist.slice(),
      victimHist: this.remoteHist.slice(),
      shot,
      impact,
      onDone: () => this._showPendingCard(),
    });
    this._replayLabel(`${PART_NAMES[part]}`, `${Math.round(dist)} m`);
  }

  _replayLabel(a, b) {
    this.hud.message(a, b, 5);
  }

  _onReveal(m) {
    const u = this.world.uplinks[m.i];
    if (m.who === this.me) {
      this.hud.message(`UPLINK ${u.name} SECURED`, 'Satellite sweep: enemy position pinged', 3);
      for (let k = 0; k < UPLINK.pings; k++) this.pings.push(this.now + k * UPLINK.pingInterval);
    } else {
      this.hud.message(`UPLINK ${u.name} LOST`, "You've been pinged — relocate!", 3.5);
      this.audio.beep(null, false);
    }
  }

  _sendState(force = false) {
    if (!this.net || !this.net.open) return;
    const P = this.player;
    const r = (v) => Math.round(v * 100) / 100;
    this.net.send({
      t: 's',
      p: [r(P.pos.x), r(P.pos.y), r(P.pos.z)],
      y: r(P.yaw),
      pi: Math.round(P.pitch * 1000) / 1000,
      st: P.stance,
      sc: P.scopeT > 0.5 ? 1 : 0,
      z: P.zoom,
      hk: this.hacking,
      hp: Math.max(0, Math.round(P.hp)),
      al: P.alive ? 1 : 0,
      mv: P.moving ? 1 : 0,
    });
  }

  // -------------------------------------------------------------------------
  // Shooting
  // -------------------------------------------------------------------------
  _spawnBullet(o, v, local, id, windT0) {
    const tracer = this.effects.addTracer(o, v, !local);
    this.bullets.push({ p: o.clone(), v: v.clone(), prev: o.clone(), age: 0, local, id, windT0, tracer, crackDone: false });
  }

  _fire() {
    const P = this.player;
    const o = P.eyePos(new THREE.Vector3());
    const dir = P.muzzleDir(new THREE.Vector3());
    const v = dir.clone().multiplyScalar(BALLISTICS.muzzle);
    const id = ++this.shotId * 2 + this.me;
    this.myShots.set(id, { o: o.clone(), v: v.clone(), t0: this.now, windT0: this.roundTime });
    // Start the visible bullet slightly ahead so it doesn't spawn inside the camera.
    this._spawnBullet(o, v, true, id, this.roundTime);
    P.fireKick();
    this.audio.shotLocal();
    if (P.ammo > 0) this.audio.bolt(0.35);
    const vmPos = new THREE.Vector3(0.2, -0.17, -1.4).applyMatrix4(this.camera.matrixWorld);
    if (P.scopeT < 0.5) this.effects.muzzle(vmPos, dir);
    if (this.net && this.net.open) this.net.send({ t: 'shot', id, o: o.toArray().map((x) => Math.round(x * 1000) / 1000), v: v.toArray().map((x) => Math.round(x * 100) / 100), wt: this.roundTime });
    this.vmKick = 1;
  }

  _targetsForHit() {
    // Capsules the local player's bullets can hit right now.
    const list = [];
    if (this.mode === 'practice') {
      for (const t of this.targets) {
        if (t.swing > 0) continue;
        worldCapsules(t.pos, t.yaw, 0).forEach((c) => { c.owner = t; list.push(c); });
      }
    } else if (this.remoteAlive && this.remoteHist.length) {
      const s = sampleHist(this.remoteHist, this.now - NET.interpDelay);
      if (s) worldCapsules(s.p, s.yaw, s.st).forEach((c) => { c.owner = 'remote'; list.push(c); });
    }
    return list;
  }

  _updateBullets(dt) {
    const listener = this.camera.position;
    const targets = this._targetsForHit();
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      let dead = false;
      let rem = dt;
      while (rem > 1e-6 && !dead) {
        const h = Math.min(BALLISTICS.substep * 2, rem);
        rem -= h;
        b.prev.copy(b.p);
        stepProjectile(b.p, b.v, h, this.wind, b.windT0 + b.age);
        b.age += h;
        // Players / targets first (they're in front of the ground they stand on).
        let hit = null;
        if (b.local) {
          for (const c of targets) {
            const r = segSegClosest(b.prev, b.p, c.a, c.b);
            if (r.d2 <= c.r * c.r && (!hit || r.s < hit.s)) hit = { s: r.s, cap: c };
          }
        }
        const wh = this.world.raycast(b.prev, b.p);
        if (hit && (!wh || hit.s <= wh.t)) {
          const ip = b.prev.clone().lerp(b.p, hit.s);
          this._onLocalHit(b, hit.cap, ip);
          dead = true;
        } else if (wh) {
          this.effects.impact(wh.point, wh.normal, wh.mat);
          const d = wh.point.distanceTo(listener);
          this.audio.impact(wh.point, wh.mat, d / 343);
          dead = true;
        }
        // Supersonic crack for enemy rounds passing near you.
        if (!b.local && !b.crackDone && this.player.alive) {
          const r = segSegClosest(b.prev, b.p, listener, listener);
          if (r.d2 < 30 * 30 && r.s < 0.999) {
            b.crackDone = true;
            const d = Math.sqrt(r.d2);
            this.audio.crack(b.prev.clone().lerp(b.p, r.s), d / 343, clamp(1 - d / 30, 0, 1));
            if (d < 6) this.hud.message('', 'Rounds incoming!', 1.2);
          }
        }
        if (b.age > BALLISTICS.maxLife || b.p.y < -200) dead = true;
      }
      this.effects.moveTracer(b.tracer, b.p, b.v);
      if (dead) {
        this.effects.killTracer(b.tracer);
        this.bullets.splice(i, 1);
      }
    }
  }

  _onLocalHit(b, cap, ip) {
    const shot = this.myShots.get(b.id);
    const dist = shot ? shot.o.distanceTo(ip) : 0;
    const head = cap.part === 'head';
    if (this.mode === 'practice') {
      const t = cap.owner;
      t.swing = 0.0001;
      this.audio.plateHit(ip, dist / 343);
      this.hud.hitMarker(head);
      this.hud.addMarker(ip.clone().add(new THREE.Vector3(0, 0.6, 0)), head ? 'HEAD' : cap.part === 'torso' ? 'BODY' : 'LEGS', head ? 'hithead' : 'hitbody', 2.2);
      this.practiceStats = this.practiceStats || { hits: 0, best: 0 };
      this.practiceStats.hits++;
      if (head) this.practiceStats.best = Math.max(this.practiceStats.best, Math.round(dist));
      if (head && dist > 250 && !this.replay.active && shot) {
        this.replay.start({ mode: 'practice', shooterHist: this.selfHist.slice(), victimHist: [], shot, impact: ip, onDone: () => {} });
        this._replayLabel('HEADSHOT', `${Math.round(dist)} m`);
      }
      return;
    }
    const dmg = DAMAGE[cap.part === 'legs' ? 'limb' : cap.part];
    this.net.send({ t: 'hit', id: b.id, part: cap.part, dmg, dist: Math.round(dist), ip: ip.toArray().map((x) => Math.round(x * 100) / 100) });
    this.audio.hitConfirm(head, 0);
    this.hud.hitMarker(head);
    if (this.remoteHp - dmg <= 0) {
      this.remoteAlive = false;
      this.remoteDeadLock = true;
      this._startKillerReplay(b.id, ip, cap.part, dist);
    } else {
      this.remoteHp -= dmg;
      this.hud.message('HIT', `${PART_NAMES[cap.part]} · ${Math.round(dist)} m — they're wounded`, 2);
    }
  }

  _rangefind() {
    const P = this.player;
    if (P.rangeT > 0) return;
    P.rangeT = WEAPON.rangeCooldown;
    const o = P.eyePos(new THREE.Vector3());
    const d = P.aimDir(new THREE.Vector3());
    const end = o.clone().addScaledVector(d, 2000);
    const wh = this.world.raycast(o, end, true);
    let dist = wh ? wh.t * 2000 : null;
    for (const c of this._targetsForHit()) {
      const r = segSegClosest(o, end, c.a, c.b);
      if (r.d2 < (c.r + 0.3) ** 2 && (dist === null || r.s * 2000 < dist)) dist = r.s * 2000;
    }
    P.range = dist;
    P.rangeShow = 5;
    this.audio.click();
  }

  // -------------------------------------------------------------------------
  // Per-frame
  // -------------------------------------------------------------------------
  _frame() {
    let dt = Math.min(this.clock.getDelta(), 0.05);
    this.now += dt;
    this._adaptResolution(dt);
    const a = this.input.actions;
    const P = this.player;
    const live = this.phase === 'live';
    const canMove = this.phase !== 'end' && this.phase !== 'match';
    const canFire = live || this.phase === 'practice' || this.phase === 'wait';
    if (live || this.phase === 'practice' || this.phase === 'wait') this.roundTime += dt;
    if (this.mode === 'guest' && this.phase !== 'match') this.phaseT = Math.max(0, this.phaseT - dt);
    this._hostTick(dt);
    if (this.net) this.net.tick(dt);

    if (this.phase === 'practice' && this.input.pressed('KeyN')) {
      this.wind.set(Math.random() * Math.PI * 2, 1 + Math.random() * 6, Math.random() * 100);
      this.hud.message('NEW WIND', '', 1.2);
    }

    const replaying = this.replay.active;
    if (!replaying && P.alive) {
      P.update(dt, a, this.world, { canMove });
      if (a.fire && canFire) {
        if (P.canFire()) this._fire();
        else if (P.ammo === 0 && P.reloadT <= 0) {
          this.audio.click();
          if (P.reserve > 0) P.reloadT = WEAPON.reloadTime;
        }
      }
      if (a.range) this._rangefind();
    }
    // Self history for replays.
    if (!this._histT || this.now - this._histT > 1 / 30) {
      this._histT = this.now;
      if (P.alive) pushHist(this.selfHist, { t: this.now, p: P.pos.clone(), yaw: P.yaw, pitch: P.pitch, st: P.stance, sc: P.scopeT > 0.5 ? 1 : 0, z: P.zoom, moving: P.moving });
    }
    this._updateUplinks(dt, live);
    this._updateBullets(dt);
    this._updatePractice(dt);
    this._updateRemote(dt);
    this._updatePings();

    // Network state.
    this.stateT -= dt;
    if (this.stateT <= 0) {
      this.stateT = 1 / NET.stateHz;
      this._sendState();
    }

    // Camera
    if (!replaying) {
      P.eyePos(this.camera.position);
      const s = P.sway();
      this.camera.rotation.set(P.pitch - s.y, P.yaw + s.x, 0, 'YXZ');
      this.camera.fov = P.fov();
      this.camera.near = P.scopeT > 0.5 ? 1.0 : 0.1;
      this.camera.updateProjectionMatrix();
    } else {
      this.camera.near = 0.05;
      this.replay.update(dt);
    }
    this._updateViewmodel(dt, replaying);

    const w2 = this.wind.at(this.roundTime);
    this.world.update(dt, this.now, w2, this.camera.position);
    if (this.quality === 'high') {
      this.sun.target.position.copy(this.camera.position);
      this.sun.position.copy(this.camera.position).addScaledVector(this.sunDir, 400);
    } else {
      this.sun.position.copy(this.sunDir).multiplyScalar(400);
    }
    this.effects.update(dt, this.camera);
    this.audio.setListener(this.camera);
    this.audio.setWind(w2.length());

    // HUD
    this.hud.update(dt, this);
    this.hud.scopeInfo(P, P.rangeShow > 0 && P.range ? `${Math.round(P.range)} m` : P.rangeShow > 0 ? '---' : '');
    this.hud.root.classList.toggle('replay', replaying);
    this._updateHints();
    if (this.vignette) {
      const u = this.vignette.uniforms;
      u.uDamage.value = Math.max(0, 1 - P.hp / 100) * (P.alive ? 0.8 : 0.3);
      u.uAmount.value = replaying ? 0.6 : 0.38;
      u.tDepth.value = this.composer.readBuffer.depthTexture;
      u.uNear.value = this.camera.near;
      u.uFar.value = this.camera.far;
      u.uTime.value = this.now;
      u.uRes.value.set(this.renderer.domElement.width, this.renderer.domElement.height);
    }
    this.input.endFrame();
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  _updateViewmodel(dt, replaying) {
    const P = this.player;
    const vm = this.viewmodel;
    vm.visible = !replaying && P.alive && P.scopeT < 0.6;
    this.vmKick = Math.max(0, (this.vmKick || 0) - dt * 5);
    const bob = Math.sin((P.bobPhase || 0)) * 0.012 * Math.min(P.speed / 4, 1.4);
    const reload = P.reloadT > 0 ? Math.sin(clamp(P.reloadT / WEAPON.reloadTime, 0, 1) * Math.PI) : 0;
    const bolt = P.boltT > 0 && P.boltT < WEAPON.boltTime - 0.3 ? Math.sin(((WEAPON.boltTime - 0.3 - P.boltT) / (WEAPON.boltTime - 0.3)) * Math.PI) : 0;
    const s = P.scopeT;
    vm.position.set(0.21 * (1 - s) + bob, -0.2 * (1 - s) - 0.07 * s - reload * 0.2 + Math.abs(bob) * 0.5, -0.28 + this.vmKick * 0.06);
    vm.rotation.set(this.vmKick * 0.12 + reload * 0.6, 0, bolt * 0.25 + reload * 0.4);
    this.vmBolt.position.z = -0.05 + bolt * 0.12;
  }

  _updateRemote(dt) {
    if (this.mode === 'practice' || !this.remoteHist.length) { this.remote.setVisible(false); this.effects.setGlint(null, 0); return; }
    const s = sampleHist(this.remoteHist, this.now - NET.interpDelay);
    const visible = !this.replay.active && (this.remoteAlive || this.phase === 'end');
    this.remote.setVisible(visible && this.remoteAlive);
    if (!s) return;
    this.remote.update(dt, s);
    // Scope glint: bright when they're scoped in and pointing at you.
    let glint = 0;
    const sp = scopePoint(s.p, s.yaw, s.pitch, s.st);
    if (visible && this.remoteAlive && s.sc) {
      const toMe = this.camera.position.clone().sub(sp).normalize();
      const aim = new THREE.Vector3(-Math.sin(s.yaw) * Math.cos(s.pitch), Math.sin(s.pitch), -Math.cos(s.yaw) * Math.cos(s.pitch));
      const facing = Math.max(0, aim.dot(toMe));
      glint = Math.pow(facing, 70) * (ZOOM_GLINT[s.z] || 0.5) * this.palette.glint * (0.82 + 0.18 * Math.sin(this.now * 21));
      // The sun behind the viewer makes it worse.
      glint *= 0.75 + 0.35 * Math.max(0, -toMe.dot(this.sunDir));
      sp.addScaledVector(toMe, 0.45);
    }
    this.effects.setGlint(sp, glint, this.camera);
    // Footsteps within earshot.
    if (s.moving && this.remoteAlive) {
      const d = s.p.distanceTo(this.camera.position);
      this.footT -= dt;
      if (d < 45 && this.footT <= 0) {
        this.footT = s.st === 0 ? 0.42 : 0.7;
        this.audio.footstep(s.p);
      }
    }
  }

  _updateUplinks(dt, live) {
    const P = this.player;
    this.hacking = -1;
    const t = this.now;
    this.world.uplinks.forEach((u, i) => {
      const st = this.uplinkState[i];
      st.enemyHacking = this.remoteHack === i && this.remoteAlive && live;
      const near = P.alive && Math.hypot(P.pos.x - u.pos.x, P.pos.z - u.pos.z) < UPLINK.radius && Math.abs(P.pos.y - u.pos.y) < 3;
      const canHack = (live || this.phase === 'practice') && near && st.owner !== this.me;
      if (canHack) {
        this.hacking = i;
        st.progress += dt;
        this.beepT -= dt;
        if (this.beepT <= 0) { this.beepT = 0.8; this.audio.beep(u.pos, false); }
        if (st.progress >= UPLINK.hackTime) {
          st.progress = 0;
          if (this.mode === 'host') this._hostCapture(i, 0);
          else if (this.mode === 'guest') this.net.send({ t: 'cap', i });
          else { st.owner = this.me; this.hud.message(`UPLINK ${u.name} SECURED`, 'In a match this pings your opponent 3 times.', 3); }
        }
      } else if (!near) {
        // Progress decays slowly when you leave.
        st.progress = Math.max(0, st.progress - dt * 0.5);
      }
      // Visuals: owner colour, blinking when being hacked.
      let col;
      if (st.enemyHacking || this.hacking === i) col = Math.sin(t * 14) > 0 ? new THREE.Color(2.6, 1.4, 0.2) : new THREE.Color(0.3, 0.15, 0.05);
      else if (st.owner === this.me) col = new THREE.Color(0.3, 1.6, 2.4);
      else if (st.owner === 1 - this.me) col = new THREE.Color(2.6, 0.25, 0.2);
      else col = new THREE.Color(1.6, 1.6, 1.8);
      u.screenMat.color.copy(col);
      u.lamp.material.color.setRGB(Math.min(col.r, 1), Math.min(col.g, 1), Math.min(col.b, 1));
      u.ring.material.color.setRGB(Math.min(col.r, 1), Math.min(col.g, 1), Math.min(col.b, 1));
      u.ring.material.opacity = near ? 0.7 : 0.3;
      if (st.enemyHacking) {
        st.beep = (st.beep || 0) - dt;
        if (st.beep <= 0) { st.beep = 0.5; this.audio.beep(u.pos, true); }
      }
    });
  }

  _updatePings() {
    while (this.pings.length && this.pings[0] <= this.now) {
      this.pings.shift();
      if (!this.remoteAlive || !this.remoteHist.length) continue;
      const s = sampleHist(this.remoteHist, this.now - NET.interpDelay);
      this.hud.addMarker(s.p.clone().add(new THREE.Vector3(0, 1.2, 0)), this.oppName.toUpperCase(), 'enemy', UPLINK.pingInterval + 0.8);
      this.audio.ping();
    }
  }

  _updatePractice(dt) {
    for (const t of this.targets) {
      if (t.mover && t.swing === 0) {
        t.pos.x += t.dir * 1.7 * dt;
        if (Math.abs(t.pos.x - t.base) > 45) t.dir *= -1;
        t.pos.y = this.world.heightAt(t.pos.x, t.pos.z);
      }
      if (t.swing > 0) {
        t.swing += dt;
        const k = t.swing;
        t.plate.rotation.x = k < 0.25 ? -(k / 0.25) * 1.1 : -1.1 * Math.max(0, 1 - (k - 1.6) / 0.4);
        if (k > 2.0) { t.swing = 0; t.plate.rotation.x = 0; }
      }
    }
  }

  _updateHints() {
    const P = this.player;
    let h = '';
    if (this.phase === 'wait' && this.mode === 'host') h = `Waiting for your friend… code <b>${this.hostCode}</b> — roam the valley meanwhile`;
    else if (this.phase === 'wait') h = 'Connecting…';
    else if (this.phase === 'insert') h = `Insertion — weapons cold · ${Math.ceil(this.phaseT)}`;
    else if (this.hacking >= 0) h = `HACKING UPLINK ${this.world.uplinks[this.hacking].name}… ${Math.round((this.uplinkState[this.hacking].progress / UPLINK.hackTime) * 100)}%`;
    else if (!P.alive && !this.replay.active) h = 'You are down — next round soon';
    else if (P.ammo === 0 && P.reserve === 0) h = 'Out of ammo';
    const enemyHack = this.uplinkState.findIndex((u) => u.enemyHacking);
    if (enemyHack >= 0 && this.phase === 'live') h = (h ? h + ' · ' : '') + `⚠ ENEMY HACKING UPLINK ${this.world.uplinks[enemyHack].name}`;
    if (h !== this._lastHint) {
      this._lastHint = h;
      this.hud.el.hint.innerHTML = h;
    }
  }

  _adaptResolution(dt) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    let pr = this.pr;
    if (avg > 1 / 40 && pr > this.basePR * 0.55) pr = Math.max(this.basePR * 0.55, pr * 0.85);
    else if (avg < 1 / 58 && pr < this.basePR) pr = Math.min(this.basePR, pr * 1.1);
    if (Math.abs(pr - this.pr) > 0.01) {
      this.pr = pr;
      this.renderer.setPixelRatio(pr);
      this._resize();
    }
  }

  // HUD text helpers
  timerText() {
    if (this.phase === 'practice') return 'RANGE';
    if (this.phase === 'wait') return '--:--';
    if (this.phase === 'match') return 'FINAL';
    const t = Math.max(0, Math.ceil(this.phaseT));
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  }
  roundText() {
    if (this.phase === 'practice') return 'SOLO';
    if (this.phase === 'wait') return 'LOBBY';
    return `RND ${String(this.round).padStart(2, '0')}`;
  }
  phaseText() {
    if (this.phase === 'practice') {
      const s = this.practiceStats;
      return s ? `${s.hits} HITS · BEST ${s.best}M` : 'NO HITS';
    }
    return { wait: 'STANDBY', insert: 'INSERTION', live: 'WEAPONS HOT', end: 'ROUND OVER', match: 'MATCH OVER' }[this.phase] || '';
  }
}
