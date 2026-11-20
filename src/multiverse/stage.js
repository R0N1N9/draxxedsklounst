// The stage owns every canvas the Multiverse draws on, and the two shared WebGL
// renderers (one for 3D dimensions, one for transitions). Dimensions come and go;
// these persist, which keeps us at three WebGL contexts for the whole match
// (the valley has its own) — iPadOS drops old contexts if we churn through them.
import * as THREE from 'three';

function mk(tag, id, parent) {
  const e = document.createElement(tag);
  e.id = id;
  parent.appendChild(e);
  return e;
}

export class Stage {
  constructor() {
    this.THREE = THREE;
    this.root = mk('div', 'mv-stage', document.body);
    this.glCanvas = mk('canvas', 'mv-gl', this.root);
    this.canvas = mk('canvas', 'mv-2d', this.root);
    this.g = this.canvas.getContext('2d');
    this.fxRoot = mk('div', 'mv-fx', document.body);
    this.fxGlCanvas = mk('canvas', 'mv-fx-gl', this.fxRoot);
    this.fxCanvas = mk('canvas', 'mv-fx-2d', this.fxRoot);
    this.fxG = this.fxCanvas.getContext('2d');
    this.fromImage = document.createElement('canvas');
    this.toImage = document.createElement('canvas');
    this.renderer = null;
    this.fxRenderer = null;
    this.mode = null;
    this.onResize = null;
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this._resize = () => this.resize();
    addEventListener('resize', this._resize);
    addEventListener('orientationchange', this._resize);
    this.resize();
  }

  resize() {
    const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const changed = w !== this.width || h !== this.height || dpr !== this.dpr;
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    for (const c of [this.canvas, this.fxCanvas]) {
      if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
    }
    for (const r of [this.renderer, this.fxRenderer]) {
      if (!r) continue;
      r.setPixelRatio(dpr);
      r.setSize(w, h, false);
    }
    if (changed && this.onResize) this.onResize(w, h);
  }

  // Which game layers are visible: '2d', 'three' (GL with the 2D canvas as an overlay) or null.
  show(mode) {
    this.mode = mode;
    this.root.style.display = mode ? 'block' : 'none';
    this.glCanvas.style.display = mode === 'three' ? 'block' : 'none';
    if (mode) this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  showFx(on) {
    this.fxRoot.style.display = on ? 'block' : 'none';
    if (!on) {
      this.fxG.setTransform(1, 0, 0, 1, 0, 0);
      this.fxG.clearRect(0, 0, this.fxCanvas.width, this.fxCanvas.height);
      if (this.fxRenderer) { this.fxRenderer.setRenderTarget(null); this.fxRenderer.clear(); }
    }
  }

  three() {
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.glCanvas, antialias: true, powerPreference: 'high-performance' });
    }
    this._reset(this.renderer, false);
    return { THREE, renderer: this.renderer };
  }

  fxThree() {
    if (!this.fxRenderer) {
      this.fxRenderer = new THREE.WebGLRenderer({ canvas: this.fxGlCanvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
    }
    this._reset(this.fxRenderer, true);
    return { THREE, renderer: this.fxRenderer };
  }

  // A module may have left the shared renderer in any state; put it back to a known one.
  _reset(r, fx) {
    r.setRenderTarget(null);
    r.resetState();
    r.setPixelRatio(this.dpr);
    r.setSize(this.width, this.height, false);
    r.setViewport(0, 0, this.width, this.height);
    r.setScissorTest(false);
    r.toneMapping = THREE.NoToneMapping;
    r.toneMappingExposure = 1;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = false;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.shadowMap.needsUpdate = true;
    r.autoClear = true;
    r.autoClearColor = r.autoClearDepth = r.autoClearStencil = true;
    r.sortObjects = true;
    r.localClippingEnabled = false;
    r.clippingPlanes = [];
    r.setClearColor(0x000000, fx ? 0 : 1);
    r.clear();
  }

  // Called before a dimension's render(): CSS-pixel transform; 3D dimensions get a clean overlay.
  begin() {
    const g = this.g;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.filter = 'none';
    if (this.mode === 'three') g.clearRect(0, 0, this.width, this.height);
  }

  beginFx() {
    const g = this.fxG;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.filter = 'none';
    g.clearRect(0, 0, this.width, this.height);
  }

  // Copy what the player currently sees into `target`. Must run in the same task as the
  // render: a WebGL canvas without preserveDrawingBuffer is blank once the frame is presented.
  snapshot(target, capture) {
    const pw = this.canvas.width, ph = this.canvas.height;
    if (target.width !== pw || target.height !== ph) { target.width = pw; target.height = ph; }
    const tg = target.getContext('2d');
    tg.setTransform(1, 0, 0, 1, 0, 0);
    tg.globalAlpha = 1;
    tg.fillStyle = '#000';
    tg.fillRect(0, 0, pw, ph);
    try {
      if (capture) capture(tg, pw, ph);
      else {
        if (this.mode === 'three') tg.drawImage(this.glCanvas, 0, 0, pw, ph);
        tg.drawImage(this.canvas, 0, 0, pw, ph);
      }
    } catch (e) {
      console.warn('snapshot failed', e);
    }
    return target;
  }

  dispose() {
    removeEventListener('resize', this._resize);
    removeEventListener('orientationchange', this._resize);
    for (const r of [this.renderer, this.fxRenderer]) {
      if (r) { r.dispose(); r.forceContextLoss(); }
    }
    this.root.remove();
    this.fxRoot.remove();
  }
}
