// Multiverse shared kit: input, synth sounds, canvas helpers and small math utilities.
// Dimensions import from here. Do not modify from a dimension; copy what you need instead.
import { mulberry32, clamp, lerp, smoothstep } from '../util.js';

export { mulberry32, clamp, lerp, smoothstep };

export const TAU = Math.PI * 2;

export const ease = {
  linear: (t) => t,
  in2: (t) => t * t,
  out2: (t) => 1 - (1 - t) * (1 - t),
  inOut2: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  in3: (t) => t * t * t,
  out3: (t) => 1 - Math.pow(1 - t, 3),
  inOut3: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  outElastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1),
};

// ---------------------------------------------------------------------------
// Canvas helper. Creates a full-viewport canvas inside `root`.
//  - default: DPR-scaled; draw in CSS pixels (w, h).
//  - fixedSize: [w, h] low-res buffer (pixel art), letterboxed with object-fit: contain.
// ---------------------------------------------------------------------------
export function createCanvas(root, { pixelated = false, scale = 1, fixedSize = null, z = 0, alpha = false } = {}) {
  const c = document.createElement('canvas');
  c.style.cssText = `position:absolute;inset:0;width:100%;height:100%;display:block;z-index:${z};` + (pixelated ? 'image-rendering:pixelated;image-rendering:crisp-edges;' : '') + (fixedSize ? 'object-fit:contain;background:#000;' : '');
  root.appendChild(c);
  const g = c.getContext('2d', { alpha });
  const api = {
    canvas: c,
    g,
    w: 0,
    h: 0,
    dpr: 1,
    resize() {
      if (fixedSize) {
        c.width = fixedSize[0];
        c.height = fixedSize[1];
        api.w = fixedSize[0];
        api.h = fixedSize[1];
        api.dpr = 1;
        g.imageSmoothingEnabled = !pixelated;
      } else {
        const dpr = Math.min(devicePixelRatio || 1, 2) * scale;
        c.width = Math.max(1, Math.round(innerWidth * dpr));
        c.height = Math.max(1, Math.round(innerHeight * dpr));
        api.w = innerWidth;
        api.h = innerHeight;
        api.dpr = dpr;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    },
    // Copy of the current pixels (for transitions).
    snapshot() {
      const s = document.createElement('canvas');
      s.width = c.width;
      s.height = c.height;
      s.getContext('2d').drawImage(c, 0, 0);
      return s;
    },
  };
  api.resize();
  return api;
}

// Map a viewport-space point (CSS px) into a fixedSize canvas' pixel space, accounting for letterboxing.
export function viewportToFixed(px, py, fw, fh) {
  const s = Math.min(innerWidth / fw, innerHeight / fh);
  const ox = (innerWidth - fw * s) / 2, oy = (innerHeight - fh * s) / 2;
  return { x: (px - ox) / s, y: (py - oy) / s, scale: s, ox, oy };
}

// ---------------------------------------------------------------------------
// Geometry helpers (2D).
// ---------------------------------------------------------------------------
// Segment (ax,ay)-(bx,by) vs axis-aligned rect {x,y,w,h}. Returns entry fraction t in [0,1] or -1.
export function segRect(ax, ay, bx, by, r) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay;
  const p = [-dx, dx, -dy, dy];
  const q = [ax - r.x, r.x + r.w - ax, ay - r.y, r.y + r.h - ay];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return -1;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return -1; if (t > t0) t0 = t; }
      else { if (t < t0) return -1; if (t < t1) t1 = t; }
    }
  }
  return t0;
}

// Segment vs circle. Returns entry fraction or -1.
export function segCircle(ax, ay, bx, by, cx, cy, r) {
  const dx = bx - ax, dy = by - ay;
  const fx = ax - cx, fy = ay - cy;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  const disc = b * b - 4 * a * c;
  if (disc < 0 || a === 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

export function angleDiff(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

// Gaussian-ish random (for AI aim error).
export function gauss(rng = Math.random) {
  return Math.sqrt(-2 * Math.log(rng() + 1e-9)) * Math.cos(TAU * rng());
}

// ---------------------------------------------------------------------------
// Synth sounds (WebAudio), built on the shared Audio (src/audio.js).
// Every method is safe to call before audio is unlocked (it no-ops).
// ---------------------------------------------------------------------------
export class Sfx {
  constructor(audio) {
    this.audio = audio;
  }
  get ctx() {
    return this.audio && this.audio.ctx;
  }
  _out(pan = 0, gain = 1) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = gain;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p).connect(this.audio.master);
    } else g.connect(this.audio.master);
    return g;
  }
  // Oscillator note with optional pitch slide.
  tone({ freq = 440, freq2 = null, dur = 0.15, type = 'square', gain = 0.15, delay = 0, pan = 0, attack = 0.004 } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freq2) o.frequency.exponentialRampToValueAtTime(Math.max(1, freq2), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this._out(pan));
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  // Filtered noise burst.
  noise({ dur = 0.2, type = 'lowpass', freq = 1200, freq2 = null, q = 0.7, gain = 0.3, delay = 0, pan = 0, attack = 0.003 } = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.audio.noise) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.audio.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freq2) f.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this._out(pan));
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }
  // A rifle shot. kind: 'rifle' | 'pistol' | 'suppressed' | 'laser' | 'chip' (8-bit) | 'soft'.
  shot(kind = 'rifle', { distance = 0, pan = 0 } = {}) {
    const far = clamp(distance / 600, 0, 1);
    const delay = distance / 343;
    const v = 1 - far * 0.6;
    if (kind === 'laser') {
      this.tone({ freq: 1800, freq2: 120, dur: 0.22, type: 'sawtooth', gain: 0.12 * v, delay, pan });
      this.noise({ dur: 0.12, type: 'highpass', freq: 3000, gain: 0.15 * v, delay, pan });
    } else if (kind === 'chip') {
      this.noise({ dur: 0.18, type: 'lowpass', freq: 3000, freq2: 300, gain: 0.35 * v, delay, pan });
      this.tone({ freq: 220, freq2: 55, dur: 0.18, type: 'square', gain: 0.12 * v, delay, pan });
    } else if (kind === 'soft' || kind === 'suppressed') {
      this.noise({ dur: 0.12, type: 'bandpass', freq: 900, gain: 0.25 * v, delay, pan });
    } else {
      const big = kind === 'rifle';
      this.noise({ dur: big ? 0.5 : 0.25, type: 'lowpass', freq: far > 0.3 ? 700 : 2400, gain: (big ? 0.7 : 0.4) * v, delay, pan });
      this.tone({ freq: big ? 110 : 160, freq2: 40, dur: big ? 0.35 : 0.2, type: 'sine', gain: 0.5 * v, delay, pan });
    }
  }
  // Supersonic crack of a near miss.
  crack(closeness = 0.5, pan = 0) {
    this.noise({ dur: 0.05, type: 'highpass', freq: 2800, gain: 0.4 + closeness * 0.6, pan });
  }
  impact(kind = 'dirt', pan = 0) {
    if (kind === 'metal') this.tone({ freq: 1500, dur: 0.4, type: 'triangle', gain: 0.25, pan });
    this.noise({ dur: 0.18, type: 'lowpass', freq: kind === 'dirt' ? 700 : 1600, gain: 0.35, pan });
  }
  hit(head = false) {
    this.tone({ freq: head ? 1650 : 980, dur: head ? 0.3 : 0.12, type: 'square', gain: 0.12 });
  }
  ping() {
    this.tone({ freq: 1320, dur: 0.35, type: 'sine', gain: 0.18 });
    this.tone({ freq: 1760, dur: 0.4, type: 'sine', gain: 0.18, delay: 0.12 });
  }
  beep(high = false) {
    this.tone({ freq: high ? 1320 : 880, dur: 0.1, type: 'square', gain: 0.1 });
  }
  click() {
    this.noise({ dur: 0.04, type: 'bandpass', freq: 4000, q: 4, gain: 0.25 });
  }
  // Transition / cinematic sounds.
  whoosh(dur = 0.8, gain = 0.35) {
    this.noise({ dur, type: 'bandpass', freq: 300, freq2: 3500, q: 1.2, gain, attack: dur * 0.6 });
  }
  riser(dur = 1.5, gain = 0.25) {
    this.tone({ freq: 120, freq2: 1600, dur, type: 'sawtooth', gain: gain * 0.4, attack: dur * 0.8 });
    this.noise({ dur, type: 'highpass', freq: 400, freq2: 6000, gain, attack: dur * 0.85 });
  }
  boom(gain = 0.8) {
    this.tone({ freq: 90, freq2: 30, dur: 1.2, type: 'sine', gain });
    this.noise({ dur: 1.4, type: 'lowpass', freq: 900, freq2: 80, gain: gain * 0.8 });
  }
  zap(gain = 0.3) {
    for (let i = 0; i < 5; i++) this.noise({ dur: 0.05, type: 'bandpass', freq: 2000 + Math.random() * 4000, q: 3, gain, delay: i * 0.03 });
    this.tone({ freq: 3000, freq2: 200, dur: 0.25, type: 'sawtooth', gain: gain * 0.5 });
  }
  heartbeat(delay = 0, gain = 0.6) {
    this.tone({ freq: 60, freq2: 40, dur: 0.18, type: 'sine', gain, delay });
    this.tone({ freq: 55, freq2: 38, dur: 0.16, type: 'sine', gain: gain * 0.7, delay: delay + 0.22 });
  }
  flatline(dur = 2) {
    this.tone({ freq: 1000, dur, type: 'sine', gain: 0.1, attack: 0.01 });
  }
  staticBurst(dur = 0.6, gain = 0.25) {
    this.noise({ dur, type: 'highpass', freq: 800, gain, attack: 0.01 });
  }
  shimmer(dur = 1.2, gain = 0.12) {
    for (let i = 0; i < 6; i++) this.tone({ freq: 880 * Math.pow(1.26, i), dur: dur * 0.6, type: 'sine', gain, delay: i * dur * 0.07 });
  }
  chime(notes = [523, 659, 784, 1047], gap = 0.09, type = 'triangle', gain = 0.12) {
    notes.forEach((f, i) => this.tone({ freq: f, dur: 0.35, type, gain, delay: i * gap }));
  }
}

// ---------------------------------------------------------------------------
// Input for multiverse dimensions: keyboard/mouse and a touch layer.
//
// Actions (held / pressed-this-frame):
//   fire (LMB, touch FIRE), scope (RMB held or touch SCOPE toggle),
//   zoomIn / zoomOut (wheel, touch +/-), jump (Space), crouch (C / Ctrl),
//   reload (R), ability1 (Q), ability2 (E), sprint (Shift)
// Aiming:
//   aim mode 'pointer': `pointer` = cursor position in viewport CSS px
//                       (touch: drag on the right half moves a virtual cursor).
//   aim mode 'look':    `look` = accumulated {dx, dy} since last frame (pointer-lock
//                       mouse movement, or touch drag) — for first/third-person dims.
// ---------------------------------------------------------------------------
const KEYMAP = {
  Space: 'jump',
  KeyC: 'crouch',
  ControlLeft: 'crouch',
  KeyR: 'reload',
  KeyQ: 'ability1',
  KeyE: 'ability2',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  Equal: 'zoomIn',
  Minus: 'zoomOut',
  KeyF: 'scope',
};
export const ACTIONS = ['fire', 'scope', 'zoomIn', 'zoomOut', 'jump', 'crouch', 'reload', 'ability1', 'ability2', 'sprint'];

export class MvInput {
  constructor({ touch = false, settings = {} } = {}) {
    this.touch = touch;
    this.enabled = true;
    this.aim = 'pointer';
    this.move = { x: 0, y: 0 };
    this.pointer = { x: innerWidth / 2, y: innerHeight / 2 };
    this.look = { dx: 0, dy: 0 };
    this.keys = new Set();
    this._held = new Set();
    this._pressed = new Set();
    this.scopeLatched = false;
    this.mouseSens = settings.sensitivity ?? 1;
    this.touchSensR = settings.touchSensR ?? 1;
    this.touchSensL = settings.touchSensL ?? 1;
    this.invertY = !!settings.invertY;
    this.locked = false;
    this.lockTarget = null;
    this._listeners = [];
    this._bindDesktop();
    if (touch) this._buildTouch();
  }

  _on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this._listeners.push([target, type, fn, opts]);
  }

  setAimMode(mode, lockTarget = null) {
    this.aim = mode;
    this.lockTarget = lockTarget;
    if (mode !== 'look' && document.pointerLockElement) document.exitPointerLock();
    if (this.touchRoot) this.touchRoot.dataset.aim = mode;
  }

  requestLock() {
    if (this.touch || this.aim !== 'look' || !this.lockTarget) return;
    try {
      const p = this.lockTarget.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { this.lockTarget.requestPointerLock(); } catch {} });
    } catch {
      try { this.lockTarget.requestPointerLock(); } catch {}
    }
  }

  _bindDesktop() {
    this._on(window, 'keydown', (e) => {
      if (!this.enabled) return;
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      const a = KEYMAP[e.code];
      if (!this.keys.has(e.code)) {
        if (a) this._pressed.add(a);
      }
      this.keys.add(e.code);
      if (a && a !== 'scope') this._held.add(a);
      if (e.code === 'KeyF') this.scopeLatched = !this.scopeLatched;
    });
    this._on(window, 'keyup', (e) => {
      this.keys.delete(e.code);
      const a = KEYMAP[e.code];
      if (a && a !== 'scope') {
        // Shift / Ctrl pairs: only release when neither is down.
        if (a === 'sprint' && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'))) return;
        if (a === 'crouch' && (this.keys.has('KeyC') || this.keys.has('ControlLeft'))) return;
        this._held.delete(a);
      }
    });
    this._on(window, 'blur', () => {
      this.keys.clear();
      this._held.clear();
    });
    this._on(window, 'mousemove', (e) => {
      if (!this.enabled || this.touch) return;
      if (this.locked) {
        this.look.dx += e.movementX * this.mouseSens;
        this.look.dy += e.movementY * this.mouseSens * (this.invertY ? -1 : 1);
      } else {
        this.pointer.x = e.clientX;
        this.pointer.y = e.clientY;
      }
    });
    this._on(window, 'mousedown', (e) => {
      if (!this.enabled || this.touch) return;
      if (e.target && e.target.closest && e.target.closest('button, input, select, label, .mv-ui')) return;
      if (this.aim === 'look' && !this.locked) {
        this.requestLock();
        return;
      }
      if (e.button === 0) { this._held.add('fire'); this._pressed.add('fire'); }
      if (e.button === 2) { this._held.add('scope'); this._pressed.add('scope'); }
    });
    this._on(window, 'mouseup', (e) => {
      if (e.button === 0) this._held.delete('fire');
      if (e.button === 2) this._held.delete('scope');
    });
    this._on(window, 'contextmenu', (e) => {
      if (this.enabled) e.preventDefault();
    });
    this._on(window, 'wheel', (e) => {
      if (!this.enabled) return;
      this._pressed.add(e.deltaY < 0 ? 'zoomIn' : 'zoomOut');
    }, { passive: true });
    this._on(document, 'pointerlockchange', () => {
      this.locked = !!document.pointerLockElement && document.pointerLockElement === this.lockTarget;
    });
  }

  _buildTouch() {
    injectStyle('mv-touch-style', TOUCH_CSS);
    const root = document.createElement('div');
    root.className = 'mv-touch';
    root.innerHTML = `
      <div class="mv-stick"><div class="mv-knob"></div></div>
      <div class="mv-tb mv-big mv-fire mv-fire-r" data-a="fire">FIRE</div>
      <div class="mv-tb mv-fire mv-fire-l" data-a="fire">FIRE</div>
      <div class="mv-tb mv-scope" data-a="scope" data-toggle="1">SCOPE</div>
      <div class="mv-tb mv-sm mv-zin" data-a="zoomIn">＋</div>
      <div class="mv-tb mv-sm mv-zout" data-a="zoomOut">－</div>
      <div class="mv-tb mv-sm mv-jump" data-a="jump">JUMP</div>
      <div class="mv-tb mv-sm mv-crouch" data-a="crouch">CROUCH</div>
      <div class="mv-tb mv-sm mv-reload" data-a="reload">RELOAD</div>
      <div class="mv-tb mv-sm mv-a1" data-a="ability1">A1</div>
      <div class="mv-tb mv-sm mv-a2" data-a="ability2">A2</div>`;
    document.body.appendChild(root);
    this.touchRoot = root;
    const stick = root.querySelector('.mv-stick'), knob = root.querySelector('.mv-knob');
    let moveId = null;
    const looks = new Map();
    const R = 56;
    const center = () => {
      const r = stick.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, reach: r.width * 0.8 };
    };
    const setStick = (t) => {
      const c = center();
      let dx = t.clientX - c.x, dy = t.clientY - c.y;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      this.move.x = dx / R;
      this.move.y = dy / R;
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      if (this.move.y < -0.9) this._held.add('sprint');
      else this._held.delete('sprint');
    };
    this._on(root, 'touchstart', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        const b = t.target.closest && t.target.closest('[data-a]');
        if (b) {
          const a = b.dataset.a;
          this._pressed.add(a);
          if (b.dataset.toggle) this.scopeLatched = !this.scopeLatched;
          else this._held.add(a);
          b.classList.add('down');
          b._tid = t.identifier;
          continue;
        }
        const c = center();
        if (moveId === null && Math.hypot(t.clientX - c.x, t.clientY - c.y) < c.reach) {
          moveId = t.identifier;
          setStick(t);
        } else looks.set(t.identifier, { x: t.clientX, y: t.clientY, side: t.clientX < innerWidth / 2 ? 'L' : 'R' });
      }
      e.preventDefault();
    }, { passive: false });
    this._on(root, 'touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === moveId) setStick(t);
        else if (looks.has(t.identifier)) {
          const l = looks.get(t.identifier);
          const k = l.side === 'L' ? this.touchSensL : this.touchSensR;
          const dx = (t.clientX - l.x) * k, dy = (t.clientY - l.y) * k;
          if (this.aim === 'look') {
            this.look.dx += dx * 2.2;
            this.look.dy += dy * 2.2 * (this.invertY ? -1 : 1);
          } else {
            this.pointer.x = clamp(this.pointer.x + dx * 1.6, 0, innerWidth);
            this.pointer.y = clamp(this.pointer.y + dy * 1.6, 0, innerHeight);
          }
          l.x = t.clientX;
          l.y = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === moveId) {
          moveId = null;
          this.move.x = this.move.y = 0;
          this._held.delete('sprint');
          knob.style.transform = 'translate(-50%,-50%)';
        }
        looks.delete(t.identifier);
        root.querySelectorAll('[data-a]').forEach((b) => {
          if (b._tid === t.identifier) {
            b.classList.remove('down');
            if (!b.dataset.toggle) this._held.delete(b.dataset.a);
            b._tid = null;
          }
        });
      }
    };
    this._on(root, 'touchend', end);
    this._on(root, 'touchcancel', end);
  }

  // Touch button labels for the two abilities (and optionally others), e.g. setLabels({ ability1: 'PULSE', ability2: 'SMOKE' }).
  setLabels(map) {
    if (!this.touchRoot) return;
    for (const [a, text] of Object.entries(map)) {
      const b = this.touchRoot.querySelector(`[data-a="${a}"]:not(.mv-fire-l)`);
      if (b) {
        b.textContent = text || '';
        b.style.display = text === null ? 'none' : '';
      }
    }
  }

  // Show or hide the touch layer (hidden during transitions and menus).
  showTouch(on) {
    if (this.touchRoot) this.touchRoot.classList.toggle('on', on);
  }

  held(a) {
    if (a === 'scope') return this._held.has('scope') || this.scopeLatched;
    return this._held.has(a);
  }

  pressed(a) {
    return this._pressed.has(a);
  }

  // Movement vector with keyboard + stick combined, normalized to length <= 1. y < 0 is up/forward.
  moveVector() {
    let x = this.move.x, y = this.move.y;
    const k = (c) => this.keys.has(c);
    if (k('KeyA') || k('ArrowLeft')) x -= 1;
    if (k('KeyD') || k('ArrowRight')) x += 1;
    if (k('KeyW') || k('ArrowUp')) y -= 1;
    if (k('KeyS') || k('ArrowDown')) y += 1;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  // Returns and clears the accumulated look delta.
  takeLook() {
    const l = { dx: this.look.dx, dy: this.look.dy };
    this.look.dx = this.look.dy = 0;
    return l;
  }

  endFrame() {
    this._pressed.clear();
    this.look.dx = this.look.dy = 0;
  }

  resetToggles() {
    this.scopeLatched = false;
    this._held.clear();
  }

  dispose() {
    for (const [t, type, fn, opts] of this._listeners) t.removeEventListener(type, fn, opts);
    this._listeners.length = 0;
    if (this.touchRoot) this.touchRoot.remove();
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

export function injectStyle(id, css) {
  if (document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = css;
  document.head.appendChild(s);
}

const TOUCH_CSS = `
.mv-touch { position: fixed; inset: 0; z-index: 40; display: none; pointer-events: auto; touch-action: none; -webkit-user-select: none; user-select: none; }
.mv-touch.on { display: block; }
.mv-stick { position: absolute; left: max(56px, env(safe-area-inset-left)); bottom: max(40px, env(safe-area-inset-bottom)); width: 128px; height: 128px; border-radius: 50%; border: 1.5px solid rgba(255,255,255,.35); background: rgba(0,0,0,.18); }
.mv-knob { position: absolute; left: 50%; top: 50%; width: 52px; height: 52px; border-radius: 50%; background: rgba(255,255,255,.3); border: 1.5px solid rgba(255,255,255,.6); transform: translate(-50%,-50%); }
.mv-tb { position: absolute; width: 58px; height: 58px; border-radius: 50%; display: grid; place-items: center; text-align: center; font: 700 10px/1.1 ui-monospace, Menlo, monospace; letter-spacing: .08em; color: rgba(255,255,255,.9); background: rgba(0,0,0,.32); border: 1.5px solid rgba(255,255,255,.4); text-shadow: 0 1px 2px #000; }
.mv-tb.mv-sm { width: 48px; height: 48px; font-size: 8px; }
.mv-tb.mv-big { width: 84px; height: 84px; font-size: 12px; }
.mv-tb.mv-fire { border-color: rgba(255,190,90,.9); color: #ffcf7a; }
.mv-tb.down, .mv-tb.on { background: rgba(255,190,90,.5); color: #111; }
.mv-fire-r { right: max(64px, env(safe-area-inset-right)); bottom: max(48px, env(safe-area-inset-bottom)); }
.mv-scope { right: calc(max(64px, env(safe-area-inset-right)) + 100px); bottom: max(36px, env(safe-area-inset-bottom)); }
.mv-zin { right: calc(max(64px, env(safe-area-inset-right)) + 112px); bottom: calc(max(36px, env(safe-area-inset-bottom)) + 76px); }
.mv-zout { right: calc(max(64px, env(safe-area-inset-right)) + 168px); bottom: calc(max(36px, env(safe-area-inset-bottom)) + 40px); }
.mv-reload { right: calc(max(64px, env(safe-area-inset-right)) + 10px); bottom: calc(max(48px, env(safe-area-inset-bottom)) + 100px); }
.mv-jump { right: calc(max(64px, env(safe-area-inset-right)) + 64px); bottom: calc(max(48px, env(safe-area-inset-bottom)) + 128px); }
.mv-a1 { right: calc(max(64px, env(safe-area-inset-right)) + 128px); bottom: calc(max(48px, env(safe-area-inset-bottom)) + 140px); }
.mv-a2 { right: calc(max(64px, env(safe-area-inset-right)) + 188px); bottom: calc(max(48px, env(safe-area-inset-bottom)) + 110px); }
.mv-fire-l { left: calc(max(56px, env(safe-area-inset-left)) + 150px); bottom: max(44px, env(safe-area-inset-bottom)); }
.mv-crouch { left: calc(max(56px, env(safe-area-inset-left)) + 20px); bottom: calc(max(40px, env(safe-area-inset-bottom)) + 150px); }
`;
