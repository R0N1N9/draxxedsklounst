// Unified input for every Multiverse dimension. Keyboard + mouse, touch and gamepad are
// folded into one InputState (contract.js §3): the director calls poll() before a
// dimension's update and endFrame() after it. All styles live in input.css.

const SLOTS = ['fire', 'alt', 'a1', 'a2', 'jump'];
const KEY_SLOT = { Space: 'jump', ShiftLeft: 'a1', ShiftRight: 'a1', KeyQ: 'a1', KeyE: 'a2', KeyF: 'a2' };
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);
const BLOCKED = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);
const PAD_BTN = { fire: 7, alt: 6, a1: 4, a2: 5, jump: 0 }; // standard mapping: RT, LT, LB, RB, A
const GLYPH = { fire: '◉', alt: '⊕', a1: '◆', a2: '◇', jump: '⤒' };
// Right-thumb arc around FIRE, degrees counter-clockwise from "right". A slot keeps its
// place whatever the dimension shows, so thumbs learn the layout once.
const ARC = { alt: 186, a1: 144, a2: 102, jump: 60 };
const DEADZONE = 0.18;
const STICK_R = 56;      // px of thumb travel for full deflection (× layout scale)
const AIM_FIRE = 0.35;   // aim stick: released beyond this deflection = a shot
const AIM_ZONE = 0.45;   // the aim stick may start anywhere right of this fraction of the width
const TOUCH_LOOK = 2.2;  // touch px → mouse px, as in the valley
const PAD_LOOK = 900;    // mouse px per second at full right-stick deflection
const GHOST_MS = 800;    // mouse events this soon after a touch are the browser's emulation

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v, d) => (v == null || v === '' || !isFinite(+v) ? d : +v);
const padDown = (b) => !!b && (typeof b === 'number' ? b > 0.5 : b.pressed || b.value > 0.5);
const typing = (t) => !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''));
function buzz() {
  try { if (navigator.vibrate) navigator.vibrate(8); } catch { /* not allowed here */ }
}

export class MvInput {
  constructor({ stageEl, settings } = {}) {
    this.stageEl = stageEl;
    this.settings = settings || {};
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.onPause = null;
    this._enabled = false;
    this._aim = 'look';
    this._altToggle = false;
    this._altLatch = false;
    // Held actions are sets of sources (key codes, 'M0'/'M2', 'T<touch id>'); _pend latches
    // presses between polls so a tap shorter than a frame still yields one Pressed edge.
    this._keys = new Set();
    this._src = {};
    this._pend = {};
    for (const k of SLOTS) { this._src[k] = new Set(); this._pend[k] = 0; }
    this._lookX = 0;
    this._lookY = 0;
    this._locked = false;
    this._fakeLock = false;
    this._mx = 0;
    this._my = 0;
    this._mouseSeen = false;
    this._rect = { x: 0, y: 0, w: 0, h: 0 };
    this._touchT = -1e9;
    this._pauseT = -1e9;
    // Touches, by identifier.
    this._moveId = null;
    this._tmx = 0;
    this._tmy = 0;
    this._aimId = null;
    this._aimOX = 0;
    this._aimOY = 0;
    this._aimX = 0;
    this._aimY = 0;
    this._aimShot = false; // the stick was let go deflected: hold its direction for the firing poll
    this._aimUsed = false;
    this._looks = new Map(); // id -> { x, y, left }
    this._held = new Map(); // id -> button
    this._pauseId = null;
    this._live = new Set();
    this._geo = { w: 0, h: 0, s: 1, sx: 0, sy: 0, reach: 0, R: STICK_R, slop: 10 };
    this._pad = { mx: 0, my: 0, sx: 0, sy: 0, lx: 0, ly: 0, fire: false, alt: false, a1: false, a2: false, jump: false, pause: false };
    this._padLive = false;
    this._padScan = 0;
    this._padStart = false;
    this._subs = [];
    this._raf = 0;
    this._timer = 0;
    const s = (this.state = {
      moveX: 0, moveY: 0, lookX: 0, lookY: 0, pointerX: 0, pointerY: 0, stickX: 0, stickY: 0,
      device: this.touch ? 'touch' : 'kbm',
      aimAngle: (fromX, fromY, fallback) => {
        if (this._enabled && s.device === 'kbm') return Math.atan2(s.pointerY - fromY, s.pointerX - fromX);
        if (Math.hypot(s.stickX, s.stickY) > 0.25) return Math.atan2(s.stickY, s.stickX);
        return typeof fallback === 'number' ? fallback : 0;
      },
    });
    for (const k of SLOTS) s[k] = s[k + 'Pressed'] = s[k + 'Released'] = false;
    this._build();
    this._bind();
    this.configure({ aim: 'look', controls: {} });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  configure(mod) {
    mod = mod || {};
    const controls = mod.controls || {};
    this._aim = mod.aim === 'pointer' ? 'pointer' : 'look';
    this._altToggle = !!mod.altToggle;
    this._drop(); // fingers in flight belong to the previous layout
    if (this._aim !== 'look') this._unlock();
    for (const slot of SLOTS) {
      const ui = this._ui[slot];
      // FIRE is always there (every dimension has a rifle); the rest only when the dimension uses them.
      const label = controls[slot] || (slot === 'fire' ? 'FIRE' : '');
      ui.on = !!label;
      for (const b of ui.btns) this._label(b, label);
      ui.cd = -1;
      ui.n = undefined;
      this.setCooldown(slot, 0);
      this.setCharges(slot, null);
      for (const b of ui.btns) b.el.classList.remove('mv-tc-ready');
    }
    this.root.classList.toggle('mv-tc-look', this._aim === 'look');
    this.root.classList.toggle('mv-tc-pointer', this._aim === 'pointer');
    this._hint.classList.toggle('mv-tc-done', this._aimUsed);
    this._cursor();
    this._layout();
    this._measure();
  }

  setEnabled(on) {
    on = !!on;
    if (on !== this._enabled) {
      this._enabled = on;
      this._drop(); // nothing held carries over, either way
      if (on) this._padStart = true; // a Start still held from the pause menu must not pause again
      else {
        this._unlock();
        this._zero();
      }
    }
    this.root.classList.toggle('mv-tc-on', on && this.touch);
    this._cursor();
    if (on) {
      this._layout();
      this._measure();
    }
  }

  requestLock() {
    const el = this.stageEl;
    if (this.touch || !this._enabled || this._aim !== 'look' || this._locked || !el || !el.requestPointerLock) return;
    const plain = () => {
      try {
        const p = el.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      } catch { /* refused: the next click asks again */ }
    };
    try {
      // Raw mouse deltas where the engine offers them; older ones reject the option.
      const p = el.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(plain);
    } catch {
      plain();
    }
  }

  poll(dt) {
    const s = this.state;
    if (!this._enabled) return this._zero();
    dt = dt > 0 ? Math.min(dt, 0.1) : 0;
    const pad = this._pad, st = this.settings || {};
    this._pollPad(dt);

    let mx = this._tmx + pad.mx, my = this._tmy + pad.my;
    const k = this._keys;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) my -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my += 1;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    s.moveX = mx;
    s.moveY = my;

    // One sensitivity and one invert setting for every way of looking, as in the valley.
    if (this._aim === 'look') {
      const sens = num(st.sensitivity, 1);
      s.lookX = (this._lookX + pad.lx) * sens;
      s.lookY = (this._lookY + pad.ly) * sens * (st.invertY ? -1 : 1);
    } else s.lookX = s.lookY = 0;
    this._lookX = this._lookY = 0;

    const r = this._rect;
    if (!r.w) this._measure(); // the stage was hidden when we last looked
    s.pointerX = this._mouseSeen ? this._mx - r.x : r.w / 2;
    s.pointerY = this._mouseSeen ? this._my - r.y : r.h / 2;

    if (this._aimShot) { s.stickX = this._aimX; s.stickY = this._aimY; this._aimShot = false; this._aimX = this._aimY = 0; }
    else if (this._aimId !== null) { s.stickX = this._aimX; s.stickY = this._aimY; }
    else { s.stickX = pad.sx; s.stickY = pad.sy; }

    for (const slot of SLOTS) {
      const pend = this._pend[slot];
      this._pend[slot] = 0;
      const was = s[slot];
      const cur = pend > 0 || this._src[slot].size > 0 || pad[slot] || (slot === 'alt' && this._altLatch);
      s[slot] = cur;
      s[slot + 'Pressed'] = pend > 0 || (cur && !was);
      s[slot + 'Released'] = was && !cur;
    }
    if (pad.pause) this._pause();
  }

  endFrame() {
    const s = this.state;
    for (const slot of SLOTS) s[slot + 'Pressed'] = s[slot + 'Released'] = false;
    s.lookX = s.lookY = 0;
  }

  setCooldown(slot, frac) {
    const ui = this._ui[slot];
    if (!ui) return;
    frac = frac > 0 ? Math.min(1, +frac) : 0;
    if (frac === ui.cd || (frac > 0 && ui.cd > 0 && Math.abs(frac - ui.cd) < 0.004)) return;
    const done = ui.cd > 0 && frac === 0;
    ui.cd = frac;
    for (const b of ui.btns) {
      b.el.style.setProperty('--mv-cd', frac.toFixed(3));
      b.el.classList.toggle('mv-tc-cooling', frac > 0);
      b.el.classList.toggle('mv-tc-ready', done); // one pulse; cleared again on animationend
    }
  }

  setCharges(slot, n) {
    const ui = this._ui[slot];
    if (!ui) return;
    n = n == null || !isFinite(+n) ? null : +n;
    if (n === ui.n) return;
    ui.n = n;
    for (const b of ui.btns) {
      b.badge.textContent = n === null ? '' : String(n);
      b.badge.classList.toggle('mv-tc-show', n !== null);
      b.el.classList.toggle('mv-tc-empty', n === 0);
    }
  }

  dispose() {
    this._enabled = false;
    this._drop();
    this._unlock();
    this._zero();
    cancelAnimationFrame(this._raf);
    clearTimeout(this._timer);
    for (const [target, type, fn, opts] of this._subs) target.removeEventListener(type, fn, opts);
    this._subs.length = 0;
    if (this.stageEl) this.stageEl.style.cursor = '';
    this.root.remove();
    this.onPause = null;
  }

  // Test hook: headless browsers refuse pointer lock. _forceLock(true) makes the layer behave
  // as if stageEl held it (clicks fire, mousemove's movementX/Y feed lookX/lookY);
  // _forceLock(false) drops it again the way Esc would (→ onPause).
  _forceLock(on) {
    this._fakeLock = !!on;
    this._lockChange();
  }

  // ---------------------------------------------------------------------------
  // Shared plumbing
  // ---------------------------------------------------------------------------
  _on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this._subs.push([target, type, fn, opts]);
  }

  _down(slot, src) {
    const set = this._src[slot];
    if (set.size === 0) this._pend[slot]++;
    set.add(src);
  }

  _up(slot, src) {
    this._src[slot].delete(src);
  }

  _device(d) {
    if (this.state.device === d) return;
    this.state.device = d;
    this.root.classList.toggle('mv-tc-dim', d !== 'touch');
  }

  _pause() {
    const now = performance.now();
    if (now - this._pauseT < 250) return; // Esc arrives as a key and as a lost pointer lock: ask once
    this._pauseT = now;
    if (typeof this.onPause === 'function') this.onPause();
  }

  _cursor() {
    if (this.stageEl) this.stageEl.style.cursor = this._enabled && this._aim === 'pointer' ? 'crosshair' : '';
  }

  _measure() {
    if (!this.stageEl) return;
    const b = this.stageEl.getBoundingClientRect(), r = this._rect;
    r.x = b.left; r.y = b.top; r.w = b.width; r.h = b.height;
  }

  _zero() {
    const s = this.state;
    s.moveX = s.moveY = s.lookX = s.lookY = s.pointerX = s.pointerY = s.stickX = s.stickY = 0;
    for (const slot of SLOTS) s[slot] = s[slot + 'Pressed'] = s[slot + 'Released'] = false;
  }

  // Forget everything that is held, on every device.
  _drop() {
    this._keys.clear();
    for (const slot of SLOTS) { this._src[slot].clear(); this._pend[slot] = 0; }
    this._lookX = this._lookY = 0;
    this._altLatch = false;
    this._aimShot = false;
    this._looks.clear();
    for (const b of this._held.values()) { b.n = 0; b.el.classList.remove('mv-tc-down'); }
    this._held.clear();
    this._pauseId = null;
    this._pill.classList.remove('mv-tc-down');
    this._endMove();
    this._endAim();
    for (const b of this._ui.alt.btns) b.el.classList.remove('mv-tc-lit');
  }

  // Keyboard and mouse only: the window lost focus, so their releases will never arrive.
  _dropKbm() {
    this._keys.clear();
    for (const slot of SLOTS) {
      for (const src of this._src[slot]) if (src[0] !== 'T') this._src[slot].delete(src);
    }
  }

  // ---------------------------------------------------------------------------
  // Keyboard + mouse
  // ---------------------------------------------------------------------------
  _bind() {
    const d = document, root = this.root;
    this._on(window, 'keydown', (e) => this._keyDown(e));
    this._on(window, 'keyup', (e) => this._keyUp(e));
    this._on(window, 'blur', () => this._dropKbm());
    this._on(d, 'visibilitychange', () => { if (d.hidden) this._dropKbm(); });
    // The overlay sits above the stage on touch devices; a mouse or trackpad plugged into an
    // iPad lands there instead.
    for (const el of [this.stageEl, root]) {
      if (!el) continue;
      this._on(el, 'mousedown', (e) => this._mouseDown(e));
      this._on(el, 'contextmenu', (e) => e.preventDefault());
    }
    this._on(window, 'mouseup', (e) => this._mouseUp(e));
    this._on(window, 'mousemove', (e) => this._mouseMove(e));
    this._on(d, 'pointerlockchange', () => this._lockChange());
    // Any touch, menus included, time-stamps the emulated-mouse filter.
    const stamp = () => { this._touchT = performance.now(); };
    this._on(window, 'touchstart', stamp, { capture: true, passive: true });
    this._on(window, 'touchend', stamp, { capture: true, passive: true });
    const active = { passive: false };
    this._on(root, 'touchstart', (e) => this._touchStart(e), active);
    this._on(root, 'touchmove', (e) => this._touchMove(e), active);
    this._on(root, 'touchend', (e) => this._touchEnd(e, false), active);
    this._on(root, 'touchcancel', (e) => this._touchEnd(e, true), active);
    this._on(root, 'gesturestart', (e) => e.preventDefault(), active); // Safari pinch
    this._on(root, 'animationend', (e) => { if (e.target.classList) e.target.classList.remove('mv-tc-ready'); });
    const relayout = () => {
      const go = () => { this._layout(); this._measure(); };
      cancelAnimationFrame(this._raf);
      this._raf = requestAnimationFrame(go);
      // iOS settles its safe-area insets a beat after a rotation: lay out once more.
      clearTimeout(this._timer);
      this._timer = setTimeout(go, 350);
    };
    this._on(window, 'resize', relayout);
    this._on(window, 'orientationchange', relayout);
  }

  _keyDown(e) {
    if (!this._enabled) return;
    const c = e.code;
    if (c === 'Escape') {
      if (!e.repeat) this._pause();
      return;
    }
    if (typing(e.target) || e.metaKey) return; // ⌘ shortcuts are the browser's
    if (BLOCKED.has(c)) e.preventDefault();
    const slot = KEY_SLOT[c];
    // A move key held across a disabled spell comes back through its auto-repeat; an action
    // key must be pressed again, or every round would open with a phantom trigger pull.
    if (MOVE_KEYS.has(c)) this._keys.add(c);
    else if (slot && !e.repeat) this._down(slot, c);
    else return;
    // On a touch device the mouse decides 'kbm': a keyboard alone has no pointer to aim with.
    if (!this.touch) this._device('kbm');
  }

  _keyUp(e) {
    const c = e.code;
    // macOS never sends keyup for keys released while ⌘ is down: start clean when it lifts.
    if (c === 'MetaLeft' || c === 'MetaRight') return this._dropKbm();
    this._keys.delete(c);
    if (KEY_SLOT[c]) this._up(KEY_SLOT[c], c);
  }

  _ghost() {
    return performance.now() - this._touchT < GHOST_MS;
  }

  _mouseDown(e) {
    if (!this._enabled || this._ghost()) return;
    if (this._aim === 'look' && !this._locked) return this.requestLock(); // this click only grabs the mouse
    if (!this._locked) { this._mx = e.clientX; this._my = e.clientY; this._mouseSeen = true; }
    this._device('kbm');
    if (e.button === 0) this._down('fire', 'M0');
    else if (e.button === 2) this._down('alt', 'M2');
  }

  _mouseUp(e) {
    if (e.button === 0) this._up('fire', 'M0');
    else if (e.button === 2) this._up('alt', 'M2');
  }

  _mouseMove(e) {
    if (this._ghost()) return;
    if (this._locked) {
      const dx = e.movementX || 0, dy = e.movementY || 0;
      if (!this._enabled || this._aim !== 'look' || (!dx && !dy)) return;
      this._lookX += dx;
      this._lookY += dy;
      this._device('kbm');
      return;
    }
    // Chrome sends mousemove on load and whenever content shifts under a resting cursor:
    // that tells us where the mouse is, but only real travel means somebody is using it.
    const moved = this._mouseSeen && (e.clientX !== this._mx || e.clientY !== this._my);
    this._mx = e.clientX;
    this._my = e.clientY;
    this._mouseSeen = true;
    if (moved && this._enabled) this._device('kbm');
  }

  _lockChange() {
    const was = this._locked;
    this._locked = this._fakeLock || (!!this.stageEl && document.pointerLockElement === this.stageEl);
    if (!was || this._locked) return;
    this._up('fire', 'M0'); // buttons held through the loss would stick
    this._up('alt', 'M2');
    if (this._enabled && this._aim === 'look') this._pause();
  }

  // Our own release (disable, pointer dimension): clear the flag first so the change event
  // that follows is not mistaken for the player asking for the menu.
  _unlock() {
    this._fakeLock = false;
    this._locked = false;
    try {
      if (this.stageEl && document.pointerLockElement === this.stageEl) document.exitPointerLock();
    } catch { /* nothing to release */ }
  }

  // ---------------------------------------------------------------------------
  // Gamepad (standard mapping)
  // ---------------------------------------------------------------------------
  _pollPad(dt) {
    const p = this._pad;
    p.mx = p.my = p.sx = p.sy = p.lx = p.ly = 0;
    p.fire = p.alt = p.a1 = p.a2 = p.jump = p.pause = false;
    if (!navigator.getGamepads) return;
    // getGamepads() allocates: until a pad shows up, look for one only twice a second.
    if (!this._padLive) {
      this._padScan -= dt;
      if (this._padScan > 0) return;
      this._padScan = 0.5;
    }
    let pads = null, gp = null;
    try { pads = navigator.getGamepads(); } catch { /* blocked by permissions policy */ }
    for (let i = 0; pads && i < pads.length; i++) {
      const g = pads[i];
      if (g && g.connected !== false && g.buttons && g.axes && (!gp || (g.mapping === 'standard' && gp.mapping !== 'standard'))) gp = g;
    }
    this._padLive = !!gp;
    if (!gp) return;
    const ax = gp.axes, bt = gp.buttons;
    let used = false;
    // Radial dead zone, rescaled so that deflection starts from zero at its edge.
    let x = ax[0] || 0, y = ax[1] || 0, m = Math.hypot(x, y);
    if (m > DEADZONE) {
      const f = Math.min(1, (m - DEADZONE) / (1 - DEADZONE)) / m;
      p.mx = x * f;
      p.my = y * f;
      used = true;
    }
    if (padDown(bt[14])) { p.mx -= 1; used = true; }
    if (padDown(bt[15])) { p.mx += 1; used = true; }
    if (padDown(bt[12])) { p.my -= 1; used = true; }
    if (padDown(bt[13])) { p.my += 1; used = true; }
    x = ax[2] || 0;
    y = ax[3] || 0;
    m = Math.hypot(x, y);
    if (m > DEADZONE) {
      const n = Math.min(1, (m - DEADZONE) / (1 - DEADZONE));
      p.sx = (x / m) * n;
      p.sy = (y / m) * n;
      // Looking squares the deflection: fine aim near the centre, full speed at the rim.
      const v = n * n * PAD_LOOK * dt;
      p.lx = (x / m) * v;
      p.ly = (y / m) * v;
      used = true;
    }
    for (const slot of SLOTS) {
      if (padDown(bt[PAD_BTN[slot]])) p[slot] = used = true;
    }
    const start = padDown(bt[9]);
    if (start && !this._padStart) p.pause = true;
    this._padStart = start;
    if (used || start) this._device('gamepad');
  }

  // ---------------------------------------------------------------------------
  // Touch
  // ---------------------------------------------------------------------------
  _build() {
    const root = (this.root = document.createElement('div'));
    root.id = 'mv-touch';
    const mk = (tag, cls, parent) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      (parent || root).appendChild(e);
      return e;
    };
    const stick = (cls) => {
      const el = mk('div', `mv-tc-stick ${cls}`);
      mk('div', 'mv-tc-ring', el);
      return el;
    };
    this._moveEl = stick('mv-tc-move');
    this._moveKnob = mk('div', 'mv-tc-knob', this._moveEl);
    this._aimEl = stick('mv-tc-aim');
    this._aimBeam = mk('div', 'mv-tc-beam', this._aimEl);
    this._aimKnob = mk('div', 'mv-tc-knob', this._aimEl);
    this._hint = mk('div', 'mv-tc-hint');
    this._hint.textContent = 'DRAG TO AIM\nRELEASE TO FIRE';
    this._ui = {};
    this._btns = [];
    const btn = (slot, cls, d) => {
      const el = mk('div', `mv-tc-btn mv-tc-${slot} ${cls}`);
      el.dataset.mvSlot = slot;
      mk('i', '', el).textContent = GLYPH[slot];
      const b = { el, slot, d, span: mk('span', '', el), badge: mk('b', '', el), cx: 0, cy: 0, r: 0, n: 0, shown: false };
      el._mvBtn = b;
      this._btns.push(b);
      return b;
    };
    for (const slot of SLOTS) {
      const btns = slot === 'fire' ? [btn(slot, 'mv-tc-big', 84), btn(slot, 'mv-tc-fire2', 68)] : [btn(slot, '', 64)];
      this._ui[slot] = { btns, on: false, cd: -1, n: undefined };
    }
    this._fire2 = this._ui.fire.btns[1];
    this._pill = mk('div', 'mv-tc-pause');
    this._pill.textContent = '❚❚';
    document.body.appendChild(root);
  }

  // Upper-case, at most two lines, and a font size (at scale 1) that fits the disc.
  _label(b, text) {
    let t = String(text || '').toUpperCase().trim();
    const cut = t.length > 7 ? t.lastIndexOf(' ', Math.ceil(t.length / 2)) : -1;
    const at = cut > 0 ? cut : t.length > 7 ? t.indexOf(' ') : -1;
    if (at > 0) t = `${t.slice(0, at)}\n${t.slice(at + 1)}`;
    const longest = Math.max(1, ...t.split('\n').map((l) => l.length));
    const two = at > 0;
    // 0.68em per mono glyph with its letter-spacing; the lower chord of the disc is ~3/4 of it.
    const fs = clamp((b.d * (two ? 0.72 : 0.78)) / (longest * 0.68), 5, b.d > 80 ? 11 : b.d > 64 ? 10 : 9.5);
    b.span.textContent = t;
    b.el.style.setProperty('--mv-fs', fs.toFixed(2));
    b.el.classList.toggle('mv-tc-two', two);
  }

  // Controls sit on arcs around where each thumb rests, inset from the corners and clear of
  // notches and the home bar (the valley's layout, with slots fixed on the arc).
  _layout() {
    const root = this.root, g = this._geo;
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const safeR = parseFloat(cs.paddingRight) || 0, safeB = parseFloat(cs.paddingBottom) || 0, safeL = parseFloat(cs.paddingLeft) || 0;
    probe.remove();
    const W = root.clientWidth || innerWidth, H = root.clientHeight || innerHeight;
    // Rings shrink a little on short or narrow screens and grow a little on tablets.
    const s = clamp(Math.min(H / 390, W / 640), 0.6, 1.15);
    // A tablet is held by its sides, not its bottom corners: raise both clusters.
    const lift = clamp((H - 420) * 0.1, 0, 44);
    root.style.setProperty('--mv-s', s.toFixed(3));
    const place = (el, x, y) => {
      el.style.left = `${x.toFixed(1)}px`;
      el.style.top = `${y.toFixed(1)}px`;
    };
    const put = (b, shown, x, y) => {
      b.shown = shown;
      b.el.classList.toggle('mv-tc-off', !shown);
      b.cx = x;
      b.cy = y;
      b.r = (b.d * s) / 2;
      place(b.el, x, y);
    };
    const arc = (cx, cy, r, deg) => [cx + Math.cos((deg * Math.PI) / 180) * r * s, cy - Math.sin((deg * Math.PI) / 180) * r * s];
    const look = this._aim === 'look';
    // Right thumb: FIRE at rest, the other actions fanned around it.
    const fx = W - safeR - 128 * s, fy = H - safeB - 108 * s - lift;
    put(this._ui.fire.btns[0], true, fx, fy);
    for (const slot in ARC) put(this._ui[slot].btns[0], this._ui[slot].on, ...arc(fx, fy, 102, ARC[slot]));
    // Left thumb: the fixed stick; in 'look' dimensions a second FIRE above-right of it, so
    // either thumb can aim while the other shoots.
    const sx = safeL + 120 * s, sy = H - safeB - 108 * s - lift;
    place(this._moveEl, sx, sy);
    put(this._fire2, look, ...arc(sx, sy, 132, 24));
    // Aim hint: tucked above whatever the right cluster shows, its right edge on FIRE's.
    let top = fy - 42 * s;
    for (const slot in ARC) {
      const b = this._ui[slot].btns[0];
      if (b.shown) top = Math.min(top, b.cy - b.r);
    }
    place(this._hint, fx + 42 * s, top - 14 * s);
    g.w = W; g.h = H; g.s = s; g.sx = sx; g.sy = sy;
    g.R = STICK_R * s;
    g.reach = 136 * s * (look ? 0.75 : 0.95); // nothing else wants the left side in 'pointer' dimensions
    g.slop = 10 * s;
  }

  // The control under a touch: the element it landed on or, failing that, a near miss — a thumb
  // a few px off FIRE must shoot, not drag the view.
  _hit(t) {
    let n = t.target;
    if (n && n.nodeType === 3) n = n.parentNode; // WebKit may target the label's text node
    const el = n && n.closest ? n.closest('.mv-tc-btn, .mv-tc-pause') : null;
    if (el) return el._mvBtn || el;
    const g = this._geo;
    let best = null, bd = g.slop;
    for (const b of this._btns) {
      if (!b.shown) continue;
      const d = Math.hypot(t.clientX - b.cx, t.clientY - b.cy) - b.r;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  _touchStart(e) {
    if (e.cancelable) e.preventDefault();
    if (!this._enabled) return;
    this._reconcile(e.touches);
    const list = e.changedTouches;
    for (let i = 0; i < list.length; i++) this._touchDown(list[i]);
    this._device('touch');
  }

  _touchDown(t) {
    const id = t.identifier, x = t.clientX, y = t.clientY, g = this._geo;
    if (id === this._moveId || id === this._aimId || id === this._pauseId || this._held.has(id) || this._looks.has(id)) return;
    const c = this._hit(t);
    if (c === this._pill) {
      if (this._pauseId === null) { this._pauseId = id; c.classList.add('mv-tc-down'); }
      return;
    }
    if (c) {
      this._held.set(id, c);
      if (c.n++ === 0) c.el.classList.add('mv-tc-down');
      if (c.slot === 'alt' && this._altToggle) {
        this._altLatch = !this._altLatch;
        c.el.classList.toggle('mv-tc-lit', this._altLatch);
      } else this._down(c.slot, 'T' + id);
      if (c.slot === 'fire') buzz();
      return;
    }
    if (this._moveId === null && Math.hypot(x - g.sx, y - g.sy) < g.reach) {
      this._moveId = id;
      this._moveEl.classList.add('mv-tc-active');
      this._setMove(x, y);
    } else if (this._aim === 'look') {
      this._looks.set(id, { x, y, left: x < g.w / 2 });
    } else if (this._aimId === null && x >= g.w * AIM_ZONE) {
      this._aimId = id;
      this._aimOX = x;
      this._aimOY = y;
      this._aimShot = false;
      this._aimEl.style.left = `${x.toFixed(1)}px`;
      this._aimEl.style.top = `${y.toFixed(1)}px`;
      this._aimEl.classList.add('mv-tc-active');
      this._setAim(x, y);
      this._aimUsed = true; // the hint has done its job
      this._hint.classList.add('mv-tc-done');
    }
  }

  _touchMove(e) {
    if (e.cancelable) e.preventDefault();
    if (!this._enabled) return;
    const list = e.changedTouches, st = this.settings || {};
    for (let i = 0; i < list.length; i++) {
      const t = list[i], id = t.identifier;
      if (id === this._moveId) this._setMove(t.clientX, t.clientY);
      else if (id === this._aimId) this._setAim(t.clientX, t.clientY);
      else {
        const l = this._looks.get(id);
        if (!l) continue; // a finger that slid off its button still holds it
        const k = TOUCH_LOOK * num(l.left ? st.touchSensL : st.touchSensR, 1);
        this._lookX += (t.clientX - l.x) * k;
        this._lookY += (t.clientY - l.y) * k;
        l.x = t.clientX;
        l.y = t.clientY;
      }
    }
    this._device('touch');
  }

  _touchEnd(e, cancelled) {
    if (e.cancelable) e.preventDefault();
    const list = e.changedTouches;
    for (let i = 0; i < list.length; i++) this._touchUp(list[i].identifier, list[i], cancelled);
    this._reconcile(e.touches);
  }

  _touchUp(id, t, cancelled) {
    if (id === this._pauseId) {
      this._pauseId = null;
      this._pill.classList.remove('mv-tc-down');
      if (cancelled || !t) return;
      const r = this._pill.getBoundingClientRect(), m = 16; // a tap: it has to end on the pill
      if (t.clientX > r.left - m && t.clientX < r.right + m && t.clientY > r.top - m && t.clientY < r.bottom + m) this._pause();
    } else if (this._held.has(id)) {
      const b = this._held.get(id);
      this._held.delete(id);
      if (--b.n <= 0) { b.n = 0; b.el.classList.remove('mv-tc-down'); }
      this._up(b.slot, 'T' + id);
    } else if (id === this._moveId) this._endMove();
    else if (id === this._aimId) {
      if (t && !cancelled) this._setAim(t.clientX, t.clientY);
      // Drag to aim, release to fire: a deflected release is one trigger pull along the stick.
      const shot = !cancelled && this._enabled && Math.hypot(this._aimX, this._aimY) > AIM_FIRE;
      const ax = this._aimX, ay = this._aimY;
      this._endAim();
      if (shot) {
        this._aimX = ax;
        this._aimY = ay;
        this._aimShot = true;
        this._pend.fire++;
        buzz();
      }
    } else this._looks.delete(id);
  }

  // iOS can swallow a touchend (system gestures, alerts): anything we track that is no longer
  // on the glass is released as if cancelled.
  _reconcile(touches) {
    if (!touches) return;
    const live = this._live;
    live.clear();
    for (let i = 0; i < touches.length; i++) live.add(touches[i].identifier);
    if (this._moveId !== null && !live.has(this._moveId)) this._touchUp(this._moveId, null, true);
    if (this._aimId !== null && !live.has(this._aimId)) this._touchUp(this._aimId, null, true);
    if (this._pauseId !== null && !live.has(this._pauseId)) this._touchUp(this._pauseId, null, true);
    for (const id of this._held.keys()) if (!live.has(id)) this._touchUp(id, null, true);
    for (const id of this._looks.keys()) if (!live.has(id)) this._looks.delete(id);
  }

  _setMove(x, y) {
    const g = this._geo;
    let dx = x - g.sx, dy = y - g.sy;
    const d = Math.hypot(dx, dy);
    if (d > g.R) { dx *= g.R / d; dy *= g.R / d; }
    this._tmx = dx / g.R;
    this._tmy = dy / g.R;
    this._moveKnob.style.transform = `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px))`;
  }

  _endMove() {
    this._moveId = null;
    this._tmx = this._tmy = 0;
    this._moveEl.classList.remove('mv-tc-active');
    this._moveKnob.style.transform = '';
  }

  _setAim(x, y) {
    const R = this._geo.R;
    let dx = x - this._aimOX, dy = y - this._aimOY;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    this._aimX = dx / R;
    this._aimY = dy / R;
    this._aimKnob.style.transform = `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px))`;
    const armed = Math.min(d, R) / R > AIM_FIRE;
    this._aimEl.classList.toggle('mv-tc-armed', armed);
    if (armed) this._aimBeam.style.transform = `rotate(${Math.atan2(dy, dx).toFixed(3)}rad)`;
  }

  _endAim() {
    this._aimId = null;
    this._aimX = this._aimY = 0;
    this._aimEl.classList.remove('mv-tc-active', 'mv-tc-armed');
    this._aimKnob.style.transform = '';
  }
}
