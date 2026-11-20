// The flat 2D layer on top of the 3D yard: the drawn rifle, scope ring, compass strip, paper ammo tag, range
// callouts, shot arrows, the in-world "how to play" tags and the crumple-up of a kill. Same inked, hard-shadowed
// paper-sticker language as the world: fills, thick round-joined outlines, no gradients, no blur.
import { INK, PAPER, KRAFT, ID, ID_DARK, darker, lighter } from './style.js';

const TAU = Math.PI * 2;
const FONT = (px, w = 800) => `${w} ${px}px Rajdhani, "Arial Narrow", "Helvetica Neue", sans-serif`;
const MONO = (px) => `700 ${px}px "JetBrains Mono", Menlo, "Courier New", monospace`;
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; else if (d <= -Math.PI) d += TAU; return d; };

function rrect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function makeOverlay(ctx) {
  const g = ctx.g;
  const S = { // refreshed by index.js every frame
    t: 0, scope: 0, fovS: 16, kick: 0, bolt: 1, ammo: 0, mag: 4, reload: -1, bob: 0, bobS: 0, alive: true, live: false, me: 0,
    e: 0, edgeLeft: 0, edgeCd: 0, standCharges: 2, windR: 0, heading: 0, enemyHeading: 0, enemyKnown: 0, enemyVis: false, enemyOn: false, ex: 0, ey: 0, edist: 0,
    tells: [], prompt: '', promptKey: '', note: '', noteA: 0, burst: 0, bx: 0, by: 0, crumple: 0, victim: false, sudden: false, ruler: 60, aimOnFoe: 0, device: 'kbm', over: false, winner: false,
    safeL: 0, safeR: 0, safeB: 0, spread: 8,
  };
  const idc = (i) => ID[i];

  // ---- sticker helpers ----
  function sticker(x, y, w, h, fill, r = 5, off = 3) {
    g.fillStyle = INK;
    rrect(g, x + off, y + off, w, h, r); g.fill();
    rrect(g, x, y, w, h, r);
    g.fillStyle = fill; g.fill();
    g.lineWidth = 2.5; g.strokeStyle = INK; g.lineJoin = 'round'; g.stroke();
  }
  function label(text, x, y, px, fill = INK, align = 'center', w = 800) {
    g.font = FONT(px, w); g.textAlign = align; g.textBaseline = 'middle'; g.fillStyle = fill;
    g.fillText(text, x, y);
  }
  function tag(text, cx, cy, px, fill, ink = INK, pad = 9) {
    g.font = FONT(px);
    const tw = g.measureText(text).width, w = tw + pad * 2, h = px + 9;
    sticker(cx - w / 2, cy - h / 2, w, h, fill);
    label(text, cx, cy + 1, px, ink);
    return w;
  }

  // ---- the rifle: a flat outlined drawing ----
  function rifle(sc, a) {
    const w = ctx.width, h = ctx.height;
    const s = Math.max(0.5, Math.min(1.35, h / 700));
    const scopeDown = S.scope;
    const kick = S.kick;
    const bx = w * 0.88 + (S.bobS * 5 + 40 * scopeDown) * s, by = h * 1.0 + (S.bob * 7 + 360 * scopeDown) * s;
    g.save();
    g.globalAlpha = 1 - Math.min(1, scopeDown * 1.4);
    g.translate(bx + kick * 22 * s, by + kick * 14 * s);
    g.scale(-s, s);
    g.rotate(0.3 - kick * 0.06);
    const line = (lw) => { g.lineWidth = lw; g.strokeStyle = INK; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); };
    const fill = (c, lw = 7) => { g.fillStyle = c; g.fill(); line(lw); };
    const id = idc(S.me), idd = ID_DARK[S.me];
    // sleeve and arm run off the corner
    g.beginPath(); g.moveTo(-40, 150); g.lineTo(60, 40); g.lineTo(150, 80); g.lineTo(80, 260); g.closePath(); fill(darker(id, 0.15), 8);
    // stock
    g.beginPath(); g.moveTo(-170, 44); g.lineTo(-20, -4); g.lineTo(-10, 66); g.lineTo(-96, 138); g.lineTo(-176, 96); g.closePath(); fill('#cf9b62', 8);
    g.beginPath(); g.moveTo(-160, 62); g.lineTo(-30, 22); g.lineWidth = 3; g.strokeStyle = '#a8733b'; g.stroke();
    // receiver
    rrect(g, -14, -18, 230, 70, 14); fill('#2d3447', 8);
    rrect(g, 20, -4, 120, 24, 6); g.fillStyle = '#4b5671'; g.fill();
    // barrel and muzzle brake
    rrect(g, 200, -4, 330, 26, 8); fill('#59627a', 7);
    rrect(g, 505, -12, 56, 42, 8); fill('#1f2230', 7);
    g.fillStyle = '#3b4258'; for (const x of [516, 532, 548]) g.fillRect(x, -6, 5, 30);
    // scope
    rrect(g, 40, -76, 250, 44, 18); fill('#262a39', 8);
    rrect(g, 255, -88, 64, 68, 12); fill('#1b1e2b', 8);
    g.beginPath(); g.arc(319, -54, 26, 0, TAU); fill('#9fe8f4', 6);
    g.fillStyle = '#fff'; g.fillRect(308, -66, 9, 9);
    for (const x of [86, 230]) { rrect(g, x, -34, 22, 24, 4); fill('#59627a', 5); }
    // bolt handle works back and forth during the cycle
    const bolt = Math.sin(Math.min(1, (1 - S.bolt) * 1.0) * Math.PI);
    g.beginPath(); g.moveTo(150 + bolt * 26, 2); g.lineTo(172 + bolt * 26, -38); g.lineWidth = 11; g.strokeStyle = INK; g.stroke();
    g.beginPath(); g.moveTo(150 + bolt * 26, 2); g.lineTo(172 + bolt * 26, -38); g.lineWidth = 5; g.strokeStyle = '#cf9b62'; g.stroke();
    g.beginPath(); g.arc(176 + bolt * 26, -44, 12, 0, TAU); fill(id, 5);
    // hands in identity-coloured gloves
    rrect(g, 252, 14, 124, 70, 28); fill(id, 8);
    g.lineWidth = 4; g.strokeStyle = INK; for (const x of [284, 318, 350]) { g.beginPath(); g.moveTo(x, 22); g.lineTo(x - 6, 76); g.stroke(); }
    rrect(g, -4, 48, 96, 92, 30); fill(id, 8);
    g.strokeStyle = idd; g.lineWidth = 5; g.beginPath(); g.moveTo(8, 58); g.lineTo(80, 58); g.stroke();
    g.restore();
  }

  // ---- crosshair ----
  function cross(cx, cy) {
    const r = Math.max(5, S.spread) * (1 - S.scope);
    const a = 1 - S.scope;
    if (a <= 0.01) return;
    g.globalAlpha = a;
    g.lineCap = 'round';
    for (const [col, lw] of [[INK, 6], ['#fffdf5', 2.4]]) {
      g.strokeStyle = col; g.lineWidth = lw;
      g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
      g.beginPath();
      g.moveTo(cx - r - 9, cy); g.lineTo(cx - r + 2, cy); g.moveTo(cx + r - 2, cy); g.lineTo(cx + r + 9, cy);
      g.moveTo(cx, cy - r - 9); g.lineTo(cx, cy - r + 2); g.moveTo(cx, cy + r - 2); g.lineTo(cx, cy + r + 9);
      g.stroke();
    }
    g.fillStyle = S.aimOnFoe > 0.5 ? idc(1 - S.me) : '#fffdf5';
    g.beginPath(); g.arc(cx, cy, 2.6, 0, TAU); g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
    g.globalAlpha = 1;
  }

  // ---- scope ----
  function scope(cx, cy) {
    const a = S.scope;
    if (a < 0.02) return;
    const w = ctx.width, h = ctx.height, R = Math.min(w, h) * 0.46 * (1.12 - 0.12 * a);
    g.globalAlpha = Math.min(1, a * 1.6);
    g.fillStyle = '#1c1a24';
    g.beginPath(); g.rect(0, 0, w, h); g.arc(cx, cy, R, 0, TAU, true); g.fill();
    // flat hatching in the dark: paper-cut shadow lines
    g.save();
    g.beginPath(); g.rect(0, 0, w, h); g.arc(cx, cy, R, 0, TAU, true); g.clip();
    g.strokeStyle = '#2b2835'; g.lineWidth = 3;
    for (let x = -h; x < w + h; x += 26) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + h, h); g.stroke(); }
    g.restore();
    g.lineWidth = 12; g.strokeStyle = INK; g.beginPath(); g.arc(cx, cy, R + 3, 0, TAU); g.stroke();
    g.lineWidth = 5; g.strokeStyle = PAPER; g.beginPath(); g.arc(cx, cy, R - 4, 0, TAU); g.stroke();
    g.lineWidth = 3; g.strokeStyle = INK; g.beginPath(); g.arc(cx, cy, R - 8, 0, TAU); g.stroke();
    // reticle
    const px = (h / 2) / Math.tan((S.fovS * Math.PI) / 360); // pixels per radian
    g.lineCap = 'butt';
    for (const [col, lw] of [['#fffdf5', 5], [INK, 2]]) {
      g.strokeStyle = col; g.lineWidth = lw;
      g.beginPath();
      g.moveTo(cx - R + 14, cy); g.lineTo(cx - 14, cy); g.moveTo(cx + 14, cy); g.lineTo(cx + R - 14, cy);
      g.moveTo(cx, cy + 14); g.lineTo(cx, cy + R - 14); g.moveTo(cx, cy - R + 14); g.lineTo(cx, cy - 14);
      g.stroke();
    }
    // lead ruler: one tick per metre at the enemy's range, so "two ticks ahead of a walker" means two metres
    const tick = (1 / Math.max(10, S.ruler)) * px;
    g.fillStyle = INK;
    g.font = FONT(11, 800); g.textAlign = 'center'; g.textBaseline = 'top';
    for (let k = -6; k <= 6; k++) {
      if (!k) continue;
      const x = cx + k * tick;
      if (Math.abs(x - cx) > R - 24) continue;
      const big = k % 2 === 0;
      for (const [col, lw] of [['#fffdf5', 4], [INK, 1.6]]) { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(x, cy - (big ? 9 : 5)); g.lineTo(x, cy + (big ? 9 : 5)); g.stroke(); }
      if (big && Math.abs(k) <= 4) { g.fillStyle = '#fffdf5'; g.fillText(String(Math.abs(k)), x, cy + 13); }
    }
    g.fillStyle = INK; g.beginPath(); g.arc(cx, cy, 3.4, 0, TAU); g.fill();
    g.fillStyle = '#fffdf5'; g.beginPath(); g.arc(cx, cy, 1.6, 0, TAU); g.fill();
    // range readout under the lens
    const rt = S.enemyVis ? `${Math.round(S.edist)} M` : '-- M';
    tag(rt, cx, cy + R - 30, 15, '#fffdf5');
    label('1 TICK = 1 M', cx, cy - R + 24, 11, '#fffdf5', 'center', 700);
    g.globalAlpha = 1;
  }

  // ---- compass strip + wind ----
  function compass(cx, top) {
    const w = Math.min(430, ctx.width * 0.5), h = 25, x0 = cx - w / 2;
    const half = 62; // degrees either side
    const ppd = w / (half * 2);
    sticker(x0, top, w, h, '#f7f1e3', 4, 3);
    g.save();
    rrect(g, x0, top, w, h, 4); g.clip();
    const hd = ((-S.heading * 180) / Math.PI + 720) % 360;
    g.strokeStyle = INK; g.fillStyle = INK; g.lineWidth = 2;
    const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let d = Math.floor((hd - half) / 5) * 5; d <= hd + half; d += 5) {
      const x = cx + (d - hd) * ppd, dd = ((d % 360) + 360) % 360;
      const major = dd % 15 === 0;
      g.beginPath(); g.moveTo(x, top + h); g.lineTo(x, top + h - (dd % 45 === 0 ? 9 : major ? 7 : 4)); g.stroke();
      if (names[dd]) label(names[dd], x, top + 9, 13, INK, 'center', 800);
      else if (dd % 30 === 0) label(String(dd), x, top + 9, 10, '#6b6577', 'center', 700);
    }
    g.restore();
    // enemy marker on the strip: where the other sniper last was seen or heard
    if (S.enemyKnown > 0.02) {
      const dd = angDiff((hd * Math.PI) / 180, S.enemyHeading) * (180 / Math.PI);
      const x = cx + Math.max(-half + 3, Math.min(half - 3, dd)) * ppd;
      g.globalAlpha = Math.min(1, S.enemyKnown * 1.5);
      g.beginPath(); g.moveTo(x, top + h + 11); g.lineTo(x - 7, top + h + 1); g.lineTo(x + 7, top + h + 1); g.closePath();
      g.fillStyle = idc(1 - S.me); g.fill(); g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke();
      g.globalAlpha = 1;
    }
    // centre pointer
    g.beginPath(); g.moveTo(cx, top - 1); g.lineTo(cx - 5, top - 8); g.lineTo(cx + 5, top - 8); g.closePath(); g.fillStyle = INK; g.fill();
    // wind tag on the right of the strip: an arrow whose length is how hard the wind pushes across your aim
    const wx = x0 + w + 10, ww = 74;
    if (wx + ww < ctx.width - 6) {
      sticker(wx, top, ww, h, '#f7f1e3', 4, 3);
      label('WIND', wx + 21, top + h / 2 + 1, 11, INK, 'center', 800);
      const L = S.windR * 15, ax = wx + 54;
      g.lineWidth = 3; g.strokeStyle = INK; g.lineCap = 'round';
      g.beginPath(); g.moveTo(ax - L, top + h / 2); g.lineTo(ax + L, top + h / 2);
      if (Math.abs(L) > 2) { const s = Math.sign(L); g.moveTo(ax + L, top + h / 2); g.lineTo(ax + L - s * 5, top + h / 2 - 4); g.moveTo(ax + L, top + h / 2); g.lineTo(ax + L - s * 5, top + h / 2 + 4); }
      g.stroke();
    }
  }

  // ---- ammo tag + cooldown pips ----
  function ammoTag(cx, bottom) {
    const mag = S.mag, w = 26 + mag * 24 + 52, h = 36;
    const x = cx - w / 2, y = bottom - h;
    sticker(x, y, w, h, '#f7f1e3', 6, 3);
    for (let i = 0; i < mag; i++) {
      const bx = x + 18 + i * 24, loaded = i < S.ammo;
      rrect(g, bx, y + 7, 14, 22, 6);
      g.fillStyle = loaded ? idc(S.me) : '#d9d3c2'; g.fill();
      g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke();
      if (loaded) { g.fillStyle = '#fffdf5'; g.fillRect(bx + 3, y + 10, 3, 9); }
    }
    // bolt cycle or reload as a little paper bar
    const bx = x + 18 + mag * 24 + 2, bw = 34;
    const f = S.reload >= 0 ? S.reload : S.bolt;
    g.fillStyle = '#d9d3c2'; g.fillRect(bx, y + 14, bw, 8);
    g.fillStyle = S.reload >= 0 ? '#e2603a' : idc(S.me); g.fillRect(bx, y + 14, bw * f, 8);
    g.lineWidth = 2.5; g.strokeStyle = INK; g.strokeRect(bx, y + 14, bw, 8);
    if (S.reload >= 0) label('RELOAD', cx, y - 9, 12, INK, 'center', 800);
  }

  // ---- ability chips (drawn in-world as folded labels above the ammo tag): edge-on and standee state ----
  function abilities(cx, y) {
    const items = [['EDGE-ON', S.e > 0.5 ? 1 : 0, S.edgeCd, S.edgeLeft > 0], ['STANDEE', 0, S.standCd, false]];
    void items;
  }

  // ---- range callout on the enemy ----
  function callout() {
    if (!S.enemyOn || !S.enemyVis || S.scope > 0.3) return;
    const x = S.ex, y = S.ey;
    const txt = `${Math.round(S.edist)} M`;
    const col = idc(1 - S.me);
    g.save();
    // hollow diamond, like a drawn marker pin
    const d = 8;
    g.beginPath(); g.moveTo(x, y - d - 4); g.lineTo(x + d, y - 4); g.lineTo(x, y + d - 4); g.lineTo(x - d, y - 4); g.closePath();
    g.lineWidth = 6; g.strokeStyle = INK; g.stroke(); g.lineWidth = 2.6; g.strokeStyle = col; g.stroke();
    g.font = FONT(14); const tw = g.measureText(txt).width + 14;
    sticker(x - tw / 2, y - d - 4 - 32, tw, 22, '#f7f1e3', 4, 2);
    label(txt, x, y - d - 4 - 21, 14, INK);
    g.restore();
  }

  // ---- arrows to wherever a shot came from ----
  function tells() {
    const w = ctx.width, h = ctx.height;
    for (const t of S.tells) {
      if (t.a <= 0.02) continue;
      const r = Math.min(w, h) * 0.34;
      const a = t.ang - Math.PI / 2; // 0 rad = dead ahead = up the screen
      const x = w / 2 + Math.cos(a) * r, y = h / 2 + Math.sin(a) * r * 0.8;
      g.save();
      g.globalAlpha = Math.min(1, t.a * 1.5);
      g.translate(x, y); g.rotate(a);
      g.beginPath(); g.moveTo(26, 0); g.lineTo(-6, -17); g.lineTo(-6, 17); g.closePath();
      g.fillStyle = idc(1 - S.me); g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.lineJoin = 'round'; g.stroke();
      g.restore();
    }
  }

  // ---- prompts that teach as you play ----
  function prompt(cx, y) {
    if (!S.prompt || !S.live || !S.alive) return;
    const pulse = 0.5 + 0.5 * Math.sin(S.t * 5);
    g.font = FONT(17);
    const keyW = S.promptKey ? g.measureText(S.promptKey).width + 18 : 0;
    const tw = g.measureText(S.prompt).width, w = tw + 26 + keyW, h = 32;
    const x = cx - w / 2;
    sticker(x, y - h, w, h, '#fffdf5', 7, 3);
    let tx = x + 13;
    if (S.promptKey) {
      sticker(tx, y - h + 5, keyW, h - 10, idc(S.me), 5, 2);
      label(S.promptKey, tx + keyW / 2, y - h / 2 + 1, 15, INK);
      tx += keyW + 8;
    }
    label(S.prompt, tx, y - h / 2 + 1, 17, INK, 'left');
    g.lineWidth = 2; g.strokeStyle = idc(S.me); g.globalAlpha = pulse * 0.7;
    rrect(g, x - 5, y - h - 5, w + 10, h + 10, 10); g.stroke();
    g.globalAlpha = 1;
  }

  // ---- edge-on: the screen thins to a slit and says why you cannot shoot ----
  function edge(w, h) {
    const e = S.e;
    if (e < 0.02) return;
    const bw = w * 0.16 * e;
    g.fillStyle = INK;
    g.fillRect(0, 0, bw, h); g.fillRect(w - bw, 0, bw, h);
    g.fillStyle = idc(S.me);
    g.fillRect(bw, 0, 6 * e, h); g.fillRect(w - bw - 6 * e, 0, 6 * e, h);
    g.strokeStyle = '#2b2835'; g.lineWidth = 3;
    g.save(); g.beginPath(); g.rect(0, 0, bw, h); g.rect(w - bw, 0, bw, h); g.clip();
    for (let y = -w; y < h + w; y += 22) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + w * 0.5); g.stroke(); }
    g.restore();
    if (e > 0.6) {
      const cx = w / 2, y = h * 0.62;
      tag('EDGE-ON · PAPER-THIN · NO SHOOTING', cx, y, 16, idc(S.me));
      g.fillStyle = INK; g.fillRect(cx - 80, y + 18, 160, 8);
      g.fillStyle = '#fffdf5'; g.fillRect(cx - 78, y + 20, 156 * Math.max(0, S.edgeLeft), 4);
    }
  }

  // ---- kill: the page crumples over the victim; a starburst sticker over the shooter's hit ----
  function crumple(w, h) {
    const c = S.crumple;
    if (c <= 0) return;
    const e = c * c * (3 - 2 * c);
    const cx = w / 2, cy = h / 2;
    g.save();
    // the sheet's edge folds in from every side as faceted flat polygons
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU, jig = 0.82 + 0.18 * Math.sin(i * 12.9);
      const r0 = Math.hypot(w, h) * 0.62, r1 = r0 * (1 - 0.8 * e * jig);
      const x0 = cx + Math.cos(a0) * r0, y0 = cy + Math.sin(a0) * r0, x1 = cx + Math.cos(a1) * r0, y1 = cy + Math.sin(a1) * r0;
      const ix0 = cx + Math.cos(a0) * r1, iy0 = cy + Math.sin(a0) * r1, ix1 = cx + Math.cos(a1) * r1, iy1 = cy + Math.sin(a1) * r1;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(ix1, iy1); g.lineTo(ix0, iy0); g.closePath();
      g.fillStyle = i % 3 === 0 ? '#e9e1cc' : i % 3 === 1 ? '#f7f1e3' : '#d8cfb8'; g.fill();
      g.lineWidth = 4; g.strokeStyle = INK; g.lineJoin = 'round'; g.stroke();
    }
    g.restore();
  }
  function burst(w, h) {
    if (S.burst <= 0) return;
    const k = S.burst, x = S.bx, y = S.by, s = (1 - k) * 0.6 + 0.7;
    g.save();
    g.translate(x, y); g.rotate(-0.12); g.scale(s, s);
    const R = Math.min(w, h) * 0.17;
    g.beginPath();
    for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU, r = R * (i % 2 ? 0.62 : 1); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.closePath(); g.fillStyle = '#ffe27a'; g.fill(); g.lineWidth = 6; g.strokeStyle = INK; g.lineJoin = 'round'; g.stroke();
    label(S.winner ? 'SNIP!' : 'POOF', 0, 2, R * 0.55, INK);
    g.restore();
  }

  function draw() {
    const w = ctx.width, h = ctx.height, cx = w / 2, cy = h / 2;
    g.save();
    if (!S.over) {
      if (S.alive) rifle();
      if (S.alive) cross(cx, cy);
      scope(cx, cy);
      edge(w, h);
      tells();
      callout();
      const top = h < 480 ? 46 : 60;
      compass(cx, top);
      // bottom-centre stack, kept between the thumbs' clusters
      const left = Math.max(S.safeL, 0), right = Math.max(S.safeR, 0);
      const mid = (left + (w - right)) / 2;
      const bottom = h - 12 - (S.safeB > 0 && w - left - right < 300 ? S.safeB * 0.6 : 0);
      ammoTag(Math.max(mid, 110), bottom);
      prompt(Math.max(mid, 140), bottom - 50);
      if (S.noteA > 0.02 && S.note) { g.globalAlpha = Math.min(1, S.noteA * 2); tag(S.note, cx, cy + h * 0.2, 17, '#ff8e6b'); g.globalAlpha = 1; }
    } else {
      callout();
      compass(cx, h < 480 ? 46 : 60);
    }
    crumple(w, h);
    burst(w, h);
    g.restore();
  }
  return { S, draw };
}
