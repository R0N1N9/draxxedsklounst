// Baked plates: the street's static layers (mid blocks, shopfront wall, pavement and canal wall) are inked once
// into off-screen tiles and blitted every frame, so the per-frame cost no longer depends on how much is drawn.
//
// A plate is a flat strip in "layer space" (CSS px at the scale it was baked at). Its position on screen is a pure
// translation of the camera, which is what lets a tile be reused while the camera pans. The camera zooms in
// discrete levels (index.js), so tiles are baked at exactly the scale they are shown at and blitted 1:1, rounded
// to whole device pixels: the ink stays razor sharp and the screentone never shimmers. While the camera eases to
// a new level the old tiles are drawn slightly scaled and the new set is baked a couple of tiles per frame behind
// them; it replaces the old one as soon as it covers the page.
import { WZ, DY } from './world.js';

const TW = 512;          // tile width, CSS px
const BLEED = 3;         // each tile also holds this much of its neighbours, so a scaled blit never shows a seam
const PER_FRAME = 2;     // tiles baked per frame once a picture is up

class PlateSet {
  constructor(Sq) {
    this.Sq = Sq;
    this.tiles = new Map(); // col -> tile
  }
}

export class Plates {
  constructor() {
    this.sets = new Map();  // plate name -> { cur, nxt }
    this.pool = [];
    this.sig = '';
    this.left = PER_FRAME;
    this.baked = 0;         // tiles baked so far (for tests)
  }


  // once per frame, before any plate is drawn
  begin(v) {
    this.left = PER_FRAME;
    const sig = `${v.pw}|${v.ph}|${v.dpr}|${Math.round(v.baseY)}`;
    if (sig !== this.sig) { this.sig = sig; this.clear(); } // the page changed size: every tile is stale
  }

  dispose() {
    this.clear();
    for (const cv of this.pool) cv.width = cv.height = 0;
    this.pool.length = 0;
  }

  clear() {
    for (const s of this.sets.values()) { this.free(s.cur); this.free(s.nxt); }
    this.sets.clear();
  }

  free(set) {
    if (!set) return;
    for (const t of set.tiles.values()) if (t) this.release(t);
    set.tiles.clear();
  }

  release(t) {
    if (this.pool.length < 10) this.pool.push(t.cv);
    else t.cv.width = t.cv.height = 0; // give the memory back
  }

  // P: a plate descriptor (stage.js); lv: the zoom level in world units across the page; env: what paint needs
  draw(g, v, P, lv, env) {
    const Sq = Math.round((v.pw / lv) * 1000) / 1000;
    let s = this.sets.get(P.name);
    if (!s) { s = { cur: null, nxt: null }; this.sets.set(P.name, s); }
    if (!s.cur) s.cur = new PlateSet(Sq);
    if (s.nxt && s.nxt.Sq !== Sq) { this.free(s.nxt); s.nxt = null; }
    if (s.cur.Sq !== Sq && !s.nxt) s.nxt = new PlateSet(Sq);
    const cols = (set) => {
      const k = v.S / set.Sq, shift = P.shift(v), [xa, xb] = P.xr(set.Sq, env);
      return [Math.max(Math.floor((v.px - shift) / k / TW), Math.floor(xa / TW)), Math.min(Math.floor((v.px + v.pw - shift) / k / TW), Math.floor(xb / TW)), k, shift];
    };
    // build the new set behind the old one, a few tiles per frame, and swap when it covers the page
    if (s.nxt) {
      const [c0, c1] = cols(s.nxt);
      let done = true;
      for (let c = c0; c <= c1; c++) {
        if (s.nxt.tiles.has(c)) continue;
        if (this.left > 0) { this.left--; this.bake(s.nxt, P, c, v, env); } else done = false;
      }
      if (done) { this.free(s.cur); s.cur = s.nxt; s.nxt = null; }
    }
    const set = s.cur, [c0, c1, k, shift] = cols(set), dpr = v.dpr;
    for (let c = c0; c <= c1; c++) {
      let t = set.tiles.get(c);
      if (t === undefined) t = this.bake(set, P, c, v, env); // a column that scrolled into view: it cannot wait
      if (!t) continue;
      const x = Math.round((shift + (c * TW - BLEED) * k) * dpr) / dpr, y = Math.round((v.y0 + t.ytop * k) * dpr) / dpr;
      g.drawImage(t.cv, x, y, (t.cv.width / dpr) * k, (t.cv.height / dpr) * k);
    }
  }

  bake(set, P, c, v, env) {
    const Sq = set.Sq, dpr = v.dpr, x0 = c * TW - BLEED, w = TW + 2 * BLEED;
    // vertical extent: the plate's own band, trimmed to what the page can show (plus a margin for the zoom ease)
    const y0q = v.baseY - (WZ / 2) * DY * Sq, pad = v.ph * 0.14;
    let [ya, yb] = P.band(Sq, env);
    ya = Math.max(ya, v.py - y0q - pad);
    yb = Math.min(yb, v.py + v.ph - y0q + pad);
    if (yb - ya < 2) { set.tiles.set(c, null); return null; }
    const ytop = Math.floor(ya * dpr) / dpr, h = Math.ceil((yb - ytop) * dpr) / dpr;
    const cw = Math.min(4096, Math.ceil(w * dpr)), ch = Math.min(4096, Math.ceil(h * dpr));
    let cv = this.pool.pop();
    if (!cv) cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch; // (also clears it)
    const q = cv.getContext('2d');
    q.setTransform(dpr, 0, 0, dpr, -x0 * dpr, -ytop * dpr);
    q.save();
    q.beginPath();
    q.rect(x0, ytop, w, h);
    q.clip();
    P.paint(q, Sq, x0, x0 + w, env);
    q.restore();
    const t = { cv, ytop };
    set.tiles.set(c, t);
    this.baked++;
    return t;
  }
}

// Sprites: small static drawings (a vending machine, a lantern) inked once at the camera's zoom level and stamped
// every frame. Same idea as the plates: baked at exactly the scale they are shown at, scaled only while the zoom eases.
const PAD = 4; // CSS px around the drawing, for the width of the ink line
export class Sprites {
  constructor() {
    this.map = new Map();
    this.left = 0;
  }

  begin() { this.left = 5; }

  // bounds: { x0, y0, x1, y1 } of the drawing in CSS px at scale Sq, relative to its anchor.
  // paint(q, Sq): draws it with the anchor at the origin of q.
  // Returns { cv, ox, oy, Sq }: the canvas and where its top-left sits relative to the anchor, at its own scale.
  get(key, Sq, dpr, bounds, paint) {
    let s = this.map.get(key);
    if (s && (s.Sq === Sq && s.dpr === dpr)) return s;
    if (s && this.left <= 0) return s; // stale for now: a few per frame are brought up to date
    this.left--;
    const w = bounds.x1 - bounds.x0 + 2 * PAD, h = bounds.y1 - bounds.y0 + 2 * PAD;
    if (!s) s = { cv: document.createElement('canvas'), ox: 0, oy: 0, Sq: 0, dpr: 0 };
    s.cv.width = Math.max(1, Math.min(4096, Math.ceil(w * dpr)));
    s.cv.height = Math.max(1, Math.min(4096, Math.ceil(h * dpr)));
    s.ox = Math.floor((bounds.x0 - PAD) * dpr) / dpr;
    s.oy = Math.floor((bounds.y0 - PAD) * dpr) / dpr;
    const q = s.cv.getContext('2d');
    q.setTransform(dpr, 0, 0, dpr, -s.ox * dpr, -s.oy * dpr);
    paint(q, Sq);
    s.Sq = Sq; s.dpr = dpr;
    this.map.set(key, s);
    return s;
  }

  dispose() {
    for (const s of this.map.values()) s.cv.width = s.cv.height = 0;
    this.map.clear();
  }
}
