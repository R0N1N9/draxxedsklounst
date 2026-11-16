// Unified keyboard/mouse + touch input. Game code reads `state` and edge-triggered `pressed`.

export class Input {
  constructor(canvas, touchRoot) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressedSet = new Set();
    this.look = { x: 0, y: 0 };
    this.move = { x: 0, y: 0 };
    this.mouseFire = false;
    this.mouseScope = false;
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.enabled = false;
    this.sensitivity = 1;
    this.invertY = false;
    this.scopeToggle = false;
    this.scopeLatched = false;
    this.locked = false;
    this._bindKeyboard();
    if (this.touch) this._bindTouch(touchRoot);
  }

  _bindKeyboard() {
    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.code === 'Tab') e.preventDefault();
      if (!this.keys.has(e.code)) this.pressedSet.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked && !this.touch) {
        this.requestLock();
        return;
      }
      if (e.button === 0) { this.mouseFire = true; this.pressedSet.add('Fire'); }
      if (e.button === 2) {
        this.mouseScope = true;
        this.pressedSet.add('Scope');
      }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseFire = false;
      if (e.button === 2) this.mouseScope = false;
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.enabled || !this.locked) return;
      this.look.x += e.movementX;
      this.look.y += e.movementY;
    });
    addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      this.pressedSet.add(e.deltaY < 0 ? 'ZoomIn' : 'ZoomOut');
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
    });
  }

  requestLock() {
    if (this.touch) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => this.canvas.requestPointerLock());
    } catch {
      this.canvas.requestPointerLock();
    }
  }

  _bindTouch(root) {
    root.classList.add('on');
    const stick = root.querySelector('.stick');
    const knob = root.querySelector('.knob');
    let moveId = null, lookId = null, origin = null, lastLook = null;
    const R = 55;
    const startMove = (t) => {
      moveId = t.identifier;
      origin = { x: t.clientX, y: t.clientY };
      stick.style.left = `${origin.x}px`;
      stick.style.top = `${origin.y}px`;
      stick.classList.add('active');
      knob.style.transform = 'translate(-50%,-50%)';
    };
    root.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        const btn = t.target.closest && t.target.closest('[data-act]');
        if (btn) {
          const act = btn.dataset.act;
          this.pressedSet.add(act);
          this.keys.add('T:' + act);
          btn.classList.add('down');
          btn._tid = t.identifier;
          continue;
        }
        if (t.clientX < innerWidth * 0.4 && moveId === null) startMove(t);
        else if (lookId === null) {
          lookId = t.identifier;
          lastLook = { x: t.clientX, y: t.clientY };
        }
      }
      e.preventDefault();
    }, { passive: false });
    root.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === moveId) {
          let dx = t.clientX - origin.x, dy = t.clientY - origin.y;
          const d = Math.hypot(dx, dy);
          if (d > R) { dx *= R / d; dy *= R / d; }
          this.move.x = dx / R;
          this.move.y = dy / R;
          knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        } else if (t.identifier === lookId) {
          this.look.x += (t.clientX - lastLook.x) * 2.2;
          this.look.y += (t.clientY - lastLook.y) * 2.2;
          lastLook = { x: t.clientX, y: t.clientY };
        }
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === moveId) {
          moveId = null;
          this.move.x = this.move.y = 0;
          stick.classList.remove('active');
        } else if (t.identifier === lookId) lookId = null;
        root.querySelectorAll('[data-act]').forEach((b) => {
          if (b._tid === t.identifier) {
            b.classList.remove('down');
            this.keys.delete('T:' + b.dataset.act);
            b._tid = null;
          }
        });
      }
    };
    root.addEventListener('touchend', end);
    root.addEventListener('touchcancel', end);
  }

  held(code) {
    return this.keys.has(code);
  }
  pressed(code) {
    return this.pressedSet.has(code);
  }

  // Called once per frame after the game consumed the input.
  endFrame() {
    this.pressedSet.clear();
    this.look.x = this.look.y = 0;
  }

  // Aggregated actions.
  get actions() {
    const k = (c) => this.keys.has(c);
    const p = (c) => this.pressedSet.has(c);
    let mx = this.move.x, my = this.move.y;
    if (k('KeyA') || k('ArrowLeft')) mx -= 1;
    if (k('KeyD') || k('ArrowRight')) mx += 1;
    if (k('KeyW') || k('ArrowUp')) my -= 1;
    if (k('KeyS') || k('ArrowDown')) my += 1;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    let scopeHeld;
    if (this.touch) {
      if (p('scope')) this.scopeLatched = !this.scopeLatched;
      scopeHeld = this.scopeLatched;
    } else if (this.scopeToggle) {
      if (p('Scope')) this.scopeLatched = !this.scopeLatched;
      scopeHeld = this.scopeLatched;
    } else scopeHeld = this.mouseScope;
    return {
      mx, my,
      sprint: k('ShiftLeft') || k('ShiftRight') || k('T:sprint'),
      breath: k('ShiftLeft') || k('ShiftRight') || k('T:breath'),
      fire: p('Fire') || p('fire'),
      scope: scopeHeld,
      zoomIn: p('ZoomIn') || p('zoomin') || p('Equal'),
      zoomOut: p('ZoomOut') || p('zoomout') || p('Minus'),
      zeroUp: p('KeyE') || p('PageUp') || p('zeroup'),
      zeroDown: p('KeyQ') || p('PageDown') || p('zerodown'),
      crouch: p('KeyC') || p('ControlLeft') || p('crouch'),
      prone: p('KeyZ') || p('prone'),
      jump: p('Space') || p('jump'),
      reload: p('KeyR') || p('reload'),
      range: p('KeyF') || p('range'),
      scoreboard: k('Tab'),
      lookX: this.look.x * this.sensitivity,
      lookY: this.look.y * this.sensitivity * (this.invertY ? -1 : 1),
    };
  }

  resetScope() {
    this.scopeLatched = false;
  }
}
