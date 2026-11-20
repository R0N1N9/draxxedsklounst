// LIFE FLASH — what the memories were shot on. Each painter fills the whole w x h frame
// with one framing device (a Super-8 strip, an instant photo, a camcorder tape, an album
// page) and paints the memory's scene inside it; plus the leader, the title card and the
// last frame of the reel, which is the round that just ended.
import { seg, ease, clamp01, TAU, rgba, shade, mixHex, roundRect, drawCover, fitText } from '../../kit.js';
import { dateWords, dateShort, dateStamp, dateTape, timeTape } from './script.js';

export const HAND = `'Marker Felt', 'Bradley Hand', 'Comic Sans MS', cursive`;
export const PEN = `'Bradley Hand', 'Noteworthy', 'Marker Felt', 'Comic Sans MS', cursive`;
export const OSD = `'JetBrains Mono', 'Menlo', 'Courier New', monospace`;
export const SANS = `'Rajdhani', 'Futura', 'Helvetica Neue', sans-serif`;
export const BLACK = '#0c0806'; // the pupil, the leader and the title card share one black: the cuts between them are invisible

const spaced = (s) => s.split('').join(' ');

/** Break `text` into at most `maxLines` lines of font `${px}px tail`, shrinking until it fits. Cached on `host` per size. */
export function layoutText(g, host, key, text, maxW, px, tail, maxLines = 2) {
  const k = `${key}|${Math.round(maxW)}|${Math.round(px * 10)}`;
  if (host._lay && host._lay.k === k) { g.font = host._lay.font; return host._lay; }
  const words = text.split(' ');
  let lines = [text], size = px;
  for (let i = 0; i < 16; i++) {
    g.font = `${size}px ${tail}`;
    lines = [];
    let cur = '';
    for (const wd of words) {
      const t = cur ? cur + ' ' + wd : wd;
      if (cur && g.measureText(t).width > maxW) { lines.push(cur); cur = wd; } else cur = t;
    }
    lines.push(cur);
    let fits = lines.length <= maxLines;
    for (const l of lines) if (g.measureText(l).width > maxW) fits = false;
    if (fits) break;
    size *= 0.92;
  }
  // balance two lines so the second is not a lonely word
  if (lines.length === 2 && words.length > 2) {
    let best = lines, bestD = Math.abs(g.measureText(lines[0]).width - g.measureText(lines[1]).width);
    for (let cut = 1; cut < words.length; cut++) {
      const a = words.slice(0, cut).join(' '), b = words.slice(cut).join(' ');
      const wa = g.measureText(a).width, wb = g.measureText(b).width;
      if (wa <= maxW && wb <= maxW && Math.abs(wa - wb) < bestD) { best = [a, b]; bestD = Math.abs(wa - wb); }
    }
    lines = best;
  }
  host._lay = { k, lines, px: size, font: `${size}px ${tail}` };
  return host._lay;
}

function lines(g, lay, x, y, lh, fill, shadow, so = 0) {
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const y0 = y - ((lay.lines.length - 1) * lh) / 2;
  for (let i = 0; i < lay.lines.length; i++) {
    if (shadow) { g.fillStyle = shadow; g.fillText(lay.lines[i], x + so, y0 + i * lh + so); }
    g.fillStyle = fill;
    g.fillText(lay.lines[i], x, y0 + i * lh);
  }
}

function scene(g, x, y, pw, ph, r, c, u, tt) {
  g.save();
  roundRect(g, x, y, pw, ph, r);
  g.clip();
  g.translate(x, y);
  c.paint(g, pw, ph, u, tt, c.m);
  g.restore();
}

function softShadow(g, x, y, w, h, r, d, a) {
  for (let i = 3; i >= 1; i--) {
    g.fillStyle = `rgba(0,0,0,${a / 3})`;
    roundRect(g, x - i * d * 0.3 + d * 0.5, y - i * d * 0.3 + d, w + i * d * 0.6, h + i * d * 0.6, r + i * d * 0.3);
    g.fill();
  }
}

function hole(g, x, y, w, h) {
  g.fillStyle = 'rgba(255,214,140,0.16)';
  roundRect(g, x - w * 0.25, y - h * 0.15, w * 1.5, h * 1.3, w * 0.4);
  g.fill();
  g.fillStyle = '#fff6dc';
  roundRect(g, x, y, w, h, w * 0.22);
  g.fill();
}

// ---- Super-8 ------------------------------------------------------------------------------------
function s8(g, w, h, c, u, tt, plan) {
  g.fillStyle = '#050302';
  g.fillRect(0, 0, w, h);
  let ph = h * 0.86, pw = (ph * 4) / 3;
  if (pw > w * 0.8) { pw = w * 0.8; ph = (pw * 3) / 4; }
  const x0 = (w - pw) / 2 + pw * 0.045, y0 = (h - ph) / 2, gap = h * 0.02;
  g.fillStyle = '#170e08';
  g.fillRect(x0 - pw * 0.17, 0, pw * 1.215, h);
  g.fillStyle = 'rgba(255,190,110,0.07)';
  g.fillRect(x0 - pw * 0.17, 0, pw * 0.006, h);
  g.fillRect(x0 + pw * 1.039, 0, pw * 0.006, h);
  // neighbours on the strip, and one perforation per frame
  g.fillStyle = '#2b1a10';
  roundRect(g, x0, y0 - gap - ph, pw, ph, ph * 0.035); g.fill();
  roundRect(g, x0, y0 + ph + gap, pw, ph, ph * 0.035); g.fill();
  const hw = pw * 0.062, hh = ph * 0.105;
  for (let i = -1; i <= 1; i++) hole(g, x0 - pw * 0.115, h / 2 - hh / 2 + i * (ph + gap), hw, hh);
  scene(g, x0, y0, pw, ph, ph * 0.035, c, u, tt);
  // the lens was never clean and the corners never lit
  g.save();
  roundRect(g, x0, y0, pw, ph, ph * 0.035);
  g.clip();
  const vg = g.createRadialGradient(x0 + pw / 2, y0 + ph / 2, ph * 0.45, x0 + pw / 2, y0 + ph / 2, ph * 0.95);
  vg.addColorStop(0, 'rgba(30,12,4,0)');
  vg.addColorStop(1, 'rgba(30,12,4,0.6)');
  g.fillStyle = vg;
  g.fillRect(x0, y0, pw, ph);
  const bg = g.createLinearGradient(0, y0 + ph * 0.66, 0, y0 + ph);
  bg.addColorStop(0, 'rgba(20,9,4,0)');
  bg.addColorStop(1, 'rgba(20,9,4,0.72)');
  g.fillStyle = bg;
  g.fillRect(x0, y0 + ph * 0.66, pw, ph * 0.34);
  g.restore();
  const lay = layoutText(g, c, 's8', c.caption, pw * 0.9, ph * 0.082, HAND);
  lines(g, lay, x0 + pw / 2, y0 + ph - ph * 0.075 - (lay.lines.length - 1) * lay.px * 0.55, lay.px * 1.12, '#fff4d8', 'rgba(20,9,4,0.8)', ph * 0.006);
  g.font = `${ph * 0.048}px ${HAND}`;
  g.textAlign = 'left';
  g.fillStyle = 'rgba(20,9,4,0.7)';
  g.fillText(`${plan.town}, ${dateWords(c)}`, x0 + pw * 0.04 + ph * 0.004, y0 + ph * 0.075 + ph * 0.004);
  g.fillStyle = 'rgba(255,244,216,0.92)';
  g.fillText(`${plan.town}, ${dateWords(c)}`, x0 + pw * 0.04, y0 + ph * 0.075);
  // edge print
  g.save();
  g.translate(x0 + pw * 1.022, h / 2);
  g.rotate(Math.PI / 2);
  g.font = `600 ${pw * 0.017}px ${SANS}`;
  g.textAlign = 'center';
  g.fillStyle = 'rgba(214,150,70,0.75)';
  g.fillText(spaced(`SAFETY FILM  ▲  ${c.year}  ▲  SUNDAY 8  ▲  SAFETY FILM  ▲  ${c.year}`), 0, 0);
  g.restore();
}

// ---- instant photo ---------------------------------------------------------------------------------
function pola(g, w, h, c, u, tt, plan) {
  const felt = plan.felt;
  const bgG = g.createRadialGradient(w * 0.5, h * 0.45, h * 0.1, w * 0.5, h * 0.5, Math.hypot(w, h) * 0.6);
  bgG.addColorStop(0, shade(felt, 0.14));
  bgG.addColorStop(1, shade(felt, -0.45));
  g.fillStyle = bgG;
  g.fillRect(0, 0, w, h);
  // other pictures in the pile
  for (const s of [-1, 1]) {
    g.save();
    g.translate(w * (0.5 + s * 0.47), h * (0.5 + s * 0.36 * (c.tilt > 0 ? 1 : -1)));
    g.rotate(s * 0.35 + c.tilt * 3);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(-h * 0.19, -h * 0.21, h * 0.4, h * 0.46);
    g.fillStyle = shade('#efe8d8', -0.22);
    g.fillRect(-h * 0.2, -h * 0.23, h * 0.4, h * 0.46);
    g.fillStyle = shade(felt, 0.3);
    g.fillRect(-h * 0.175, -h * 0.205, h * 0.35, h * 0.32);
    g.restore();
  }
  let pw = Math.min(w * 0.52, (h * 0.6 * 4) / 3);
  const ph = (pw * 3) / 4, b = ph * 0.075, bot = ph * 0.3;
  const k = ease.outCubic(seg(u, 0, 0.22));
  g.save();
  g.translate(w / 2, h * 0.5);
  g.rotate(c.tilt + (1 - k) * 0.04 * Math.sign(c.tilt));
  const sc = 1 + (1 - k) * 0.06;
  g.scale(sc, sc);
  const bx = -pw / 2 - b, by = -(ph + b + bot) / 2;
  softShadow(g, bx, by, pw + 2 * b, ph + b + bot, ph * 0.012, ph * (0.03 + 0.05 * (1 - k)), 0.45);
  g.fillStyle = '#f4efe2';
  roundRect(g, bx, by, pw + 2 * b, ph + b + bot, ph * 0.012);
  g.fill();
  const sh = g.createLinearGradient(0, by + ph + b, 0, by + ph + b + bot);
  sh.addColorStop(0, 'rgba(120,100,70,0)');
  sh.addColorStop(1, 'rgba(120,100,70,0.14)');
  g.fillStyle = sh;
  g.fillRect(bx, by + ph + b, pw + 2 * b, bot);
  scene(g, -pw / 2, by + b, pw, ph, ph * 0.006, c, u, tt);
  g.strokeStyle = 'rgba(40,30,20,0.25)';
  g.lineWidth = Math.max(1, ph * 0.004);
  g.strokeRect(-pw / 2, by + b, pw, ph);
  const lay = layoutText(g, c, 'pola', c.caption, pw * 0.96, bot * 0.3, HAND);
  lines(g, lay, 0, by + b + ph + bot * 0.44, lay.px * 1.1, '#27324f');
  g.font = `${bot * 0.16}px ${PEN}`;
  g.textAlign = 'right';
  g.fillStyle = 'rgba(70,74,90,0.85)';
  g.fillText(dateShort(c), pw / 2 - b * 0.2, by + b + ph + bot * 0.88);
  // a strip of tape
  g.translate((c.tape - 0.5) * pw * 0.3, by);
  g.rotate((c.tape - 0.5) * 0.35);
  g.fillStyle = rgba(c.tape < 0.5 ? '#e0a63a' : '#7fb3a8', 0.78);
  g.fillRect(-pw * 0.11, -b * 0.75, pw * 0.22, b * 1.5);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(-pw * 0.11, -b * 0.75, pw * 0.22, b * 0.3);
  g.restore();
}

// ---- camcorder tape ---------------------------------------------------------------------------------
function vhs(g, w, h, c, u, tt) {
  g.fillStyle = '#030305';
  g.fillRect(0, 0, w, h);
  const ph = h, pw = Math.min(w, (h * 4) / 3), x0 = (w - pw) / 2;
  scene(g, x0, 0, pw, ph, 0, c, u, tt);
  g.fillStyle = 'rgba(30,50,90,0.14)'; // tape never held a black, or a red
  g.fillRect(x0, 0, pw, ph);
  const px = ph * 0.052, so = ph * 0.005;
  const osd = (text, x, y, align) => {
    g.textAlign = align;
    g.fillStyle = 'rgba(0,0,0,0.85)';
    g.fillText(text, x + so, y + so);
    g.fillStyle = '#f4f4ea';
    g.fillText(text, x, y);
  };
  g.font = `700 ${px}px ${OSD}`;
  g.textBaseline = 'middle';
  osd('PLAY ►', x0 + pw * 0.06, ph * 0.09, 'left');
  osd('SP', x0 + pw * 0.06, ph * 0.16, 'left');
  const secs = Math.floor(c.min * 7 + tt * 1.0);
  osd(`0:${String(Math.floor(secs / 60) % 60).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`, x0 + pw * 0.94, ph * 0.9, 'right');
  osd(timeTape(c), x0 + pw * 0.06, ph * 0.83, 'left');
  osd(dateTape(c), x0 + pw * 0.06, ph * 0.9, 'left');
  // the titler: somebody typed this with four buttons
  if (!c._up) c._up = c.caption.toUpperCase();
  const lay = layoutText(g, c, 'vhs', c._up, pw * 0.84, ph * 0.06, OSD);
  g.font = `700 ${lay.font}`;
  const lh = lay.px * 1.3, y0 = ph * 0.7 - ((lay.lines.length - 1) * lh) / 2;
  g.textAlign = 'center';
  for (let i = 0; i < lay.lines.length; i++) {
    const tw = g.measureText(lay.lines[i]).width;
    g.fillStyle = 'rgba(16,20,150,0.82)';
    g.fillRect(w / 2 - tw / 2 - lay.px * 0.4, y0 + i * lh - lh * 0.5, tw + lay.px * 0.8, lh);
    g.fillStyle = '#f7f36a';
    g.fillText(lay.lines[i], w / 2, y0 + i * lh);
  }
}

// ---- album page ---------------------------------------------------------------------------------------
function album(g, w, h, c, u, tt, plan) {
  const [paper, pencil, corner] = plan.page;
  g.fillStyle = paper;
  g.fillRect(0, 0, w, h);
  const pg = g.createLinearGradient(0, 0, w, 0);
  pg.addColorStop(0, 'rgba(0,0,0,0.38)');
  pg.addColorStop(0.07, 'rgba(0,0,0,0.05)');
  pg.addColorStop(0.75, 'rgba(0,0,0,0)');
  pg.addColorStop(1, 'rgba(0,0,0,0.2)');
  g.fillStyle = pg;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9; i++) { // the binding
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.beginPath(); g.arc(w * 0.035, h * (0.08 + i * 0.105), h * 0.016, 0, TAU); g.fill();
    g.strokeStyle = rgba('#c9c2b4', 0.8); g.lineWidth = h * 0.007; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-h * 0.01, h * (0.075 + i * 0.105)); g.lineTo(w * 0.035, h * (0.08 + i * 0.105)); g.stroke();
  }
  let pw = Math.min(w * 0.56, h * 0.6 * 1.5);
  const ph = pw / 1.5, b = pw * 0.028, cx = w * 0.52, cy = h * 0.42;
  const k = ease.outCubic(seg(u, 0, 0.2));
  g.save();
  g.translate(cx, cy);
  g.rotate(c.tilt * 0.7);
  softShadow(g, -pw / 2 - b, -ph / 2 - b, pw + 2 * b, ph + 2 * b, 2, ph * 0.02, 0.3);
  g.fillStyle = '#f6f1e6';
  g.fillRect(-pw / 2 - b, -ph / 2 - b, pw + 2 * b, ph + 2 * b);
  scene(g, -pw / 2, -ph / 2, pw, ph, 0, c, u, tt);
  if (c.year >= 1986) {
    g.font = `700 ${ph * 0.055}px ${OSD}`;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,120,30,0.45)';
    g.fillText(dateStamp(c), pw / 2 - pw * 0.03 + 1.5, ph / 2 - ph * 0.07);
    g.fillStyle = '#ffb04a';
    g.fillText(dateStamp(c), pw / 2 - pw * 0.035, ph / 2 - ph * 0.07);
  }
  const cs = pw * 0.07; // photo corners
  g.fillStyle = corner;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const x = sx * (pw / 2 + b * 1.3), y = sy * (ph / 2 + b * 1.3);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x - sx * cs, y); g.lineTo(x, y - sy * cs); g.closePath(); g.fill();
  }
  g.restore();
  // a sticker somebody was proud of
  g.save();
  g.translate(cx + (c.sticker < 0.5 ? -1 : 1) * (pw / 2 + pw * 0.06), cy - ph / 2 + ph * (0.05 + 0.2 * c.sticker));
  g.rotate(c.sticker * 2 + (1 - k) * 0.6);
  g.scale(k, k);
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5, r = h * (i & 1 ? 0.024 : 0.052); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.closePath();
  g.fillStyle = c.m.col;
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = h * 0.004; g.stroke();
  g.restore();
  g.save();
  g.translate(cx, cy + ph / 2 + b + h * 0.115);
  g.rotate(-c.tilt * 0.35);
  const lay = layoutText(g, c, 'album', c.caption, w * 0.74, h * 0.062, HAND);
  lines(g, lay, 0, 0, lay.px * 1.12, pencil);
  g.font = `${h * 0.036}px ${PEN}`;
  g.fillStyle = rgba(pencil, 0.7);
  g.textAlign = 'center';
  g.fillText(`— ${plan.town}, ${dateWords(c)}`, 0, (lay.lines.length * lay.px * 1.12) / 2 + h * 0.035);
  g.restore();
}

// ---- the last frame on the reel: the round that just ended -------------------------------------------------
/** Where the old world sits inside its frame: {x, y, w, h} in CSS pixels. */
export const killRect = (w, h) => ({ x: w * 0.052, y: h * 0.022, w: w * 0.934, h: h * 0.956 });
function kill(g, w, h, c, u, tt, plan, fromImage) {
  g.fillStyle = '#170e08';
  g.fillRect(0, 0, w, h);
  const r = killRect(w, h);
  g.fillStyle = '#2b1a10';
  roundRect(g, r.x, r.y - h * 1.0, r.w, r.h, h * 0.03); g.fill();
  roundRect(g, r.x, r.y + h * 1.0, r.w, r.h, h * 0.03); g.fill();
  const hw = w * 0.022, hh = h * 0.1;
  for (let i = -1; i <= 1; i++) hole(g, w * 0.015, h / 2 - hh / 2 + i * h * 0.5, hw, hh);
  g.save();
  roundRect(g, r.x, r.y, r.w, r.h, h * 0.03);
  g.clip();
  g.translate(r.x, r.y);
  drawCover(g, fromImage, r.w, r.h);
  const bg = g.createLinearGradient(0, r.h * 0.6, 0, r.h);
  bg.addColorStop(0, 'rgba(20,9,4,0)');
  bg.addColorStop(1, 'rgba(20,9,4,0.8)');
  g.fillStyle = bg;
  g.fillRect(0, r.h * 0.6, r.w, r.h * 0.4);
  g.restore();
  const lay = layoutText(g, c, 'kill', c.caption, r.w * 0.86, h * 0.09, HAND);
  const a = seg(u, 0.1, 0.3);
  g.globalAlpha = a;
  lines(g, lay, r.x + r.w / 2, r.y + r.h * 0.86 - (lay.lines.length - 1) * lay.px * 0.5, lay.px * 1.12, '#fff4d8', 'rgba(20,9,4,0.85)', h * 0.005);
  g.globalAlpha = 1;
}

// ---- leader and title card ------------------------------------------------------------------------------
export function drawLeader(g, w, h, k) {
  g.fillStyle = BLACK;
  g.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, R = h * 0.4, n = k < 0.5 ? 3 : 2, kk = (k * 2) % 1;
  g.fillStyle = '#2a211c';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#4a3d34';
  g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, Math.hypot(w, h), -Math.PI / 2, -Math.PI / 2 + kk * TAU); g.closePath(); g.fill();
  g.strokeStyle = '#e9dcc0'; g.lineWidth = h * 0.006;
  g.beginPath(); g.moveTo(0, cy); g.lineTo(w, cy); g.moveTo(cx, 0); g.lineTo(cx, h); g.stroke();
  g.lineWidth = h * 0.012;
  g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
  g.beginPath(); g.arc(cx, cy, R * 0.82, 0, TAU); g.stroke();
  g.fillStyle = '#f3e7cc';
  g.font = `700 ${h * 0.5}px ${SANS}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(n), cx, cy + h * 0.03);
}

export function drawTitle(g, w, h, t, plan) {
  const tc = plan.titleCard, cream = '#f3e7cc', cx = w / 2;
  g.fillStyle = BLACK;
  g.fillRect(0, 0, w, h);
  const m = h * 0.07;
  g.strokeStyle = rgba(cream, 0.75); g.lineWidth = Math.max(1, h * 0.004);
  g.strokeRect(m, m, w - 2 * m, h - 2 * m);
  g.lineWidth = Math.max(1, h * 0.0015);
  g.strokeRect(m + h * 0.014, m + h * 0.014, w - 2 * m - h * 0.028, h - 2 * m - h * 0.028);
  // a reticle for an ornament: it is that family
  g.lineWidth = Math.max(1, h * 0.003);
  g.beginPath(); g.arc(cx, h * 0.2, h * 0.032, 0, TAU);
  g.moveTo(cx - h * 0.05, h * 0.2); g.lineTo(cx + h * 0.05, h * 0.2); g.moveTo(cx, h * 0.15); g.lineTo(cx, h * 0.25); g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = rgba(cream, 0.9);
  fitText(g, spaced(tc.over), w * 0.78, h * 0.04, SANS);
  g.font = '600 ' + g.font;
  g.fillText(spaced(tc.over), cx, h * 0.33);
  const k = ease.outBack(seg(t, 0.02, 0.3));
  const px = fitText(g, tc.name, w * 0.74, h * 0.21, HAND);
  g.save();
  g.translate(cx, h * 0.52);
  g.rotate(-0.03);
  g.scale(0.9 + 0.1 * k, 0.9 + 0.1 * k);
  g.fillStyle = plan.duo ? cream : mixHex(plan.hero.col, '#ffffff', 0.12);
  if (plan.duo) {
    // both colours, one name: the lettering is cut down the middle
    const tw = g.measureText(tc.name).width;
    for (const s of [0, 1]) {
      g.save(); g.beginPath(); g.rect(s ? 0 : -tw, -px, tw, px * 2); g.clip();
      g.fillStyle = mixHex(plan.cast[s].col, '#ffffff', 0.12); g.fillText(tc.name, 0, 0); g.restore();
    }
  } else g.fillText(tc.name, 0, 0);
  const tw2 = Math.min(w * 0.74, g.measureText(tc.name).width), uk = seg(t, 0.18, 0.5);
  g.strokeStyle = cream; g.lineWidth = h * 0.008; g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-tw2 * 0.5, px * 0.62);
  g.quadraticCurveTo(-tw2 * 0.5 + tw2 * uk * 0.5, px * 0.62 + h * 0.03, -tw2 * 0.5 + tw2 * uk, px * 0.6);
  g.stroke();
  g.restore();
  g.fillStyle = rgba(cream, 0.9 * seg(t, 0.08, 0.22));
  fitText(g, tc.sub, w * 0.7, h * 0.058, PEN);
  g.fillText(tc.sub, cx, h * 0.72);
  g.fillStyle = rgba(cream, 0.5);
  fitText(g, spaced(tc.foot), w * 0.7, h * 0.026, SANS);
  g.font = '600 ' + g.font;
  g.fillText(spaced(tc.foot), cx, h * 0.86);
}

const FRAMES = { s8, pola, vhs, album, kill };
/** Paint one card of the reel (title, memory or the last frame) over the whole frame. */
export function drawCard(g, w, h, c, t, plan, fromImage) {
  if (c.kind === 'title') return drawTitle(g, w, h, t - c.t0, plan);
  const u = clamp01((t - c.t0) / c.dur), tt = Math.max(0, t - c.t0);
  FRAMES[c.medium](g, w, h, c, u, tt, plan, fromImage);
}

/** The band of leader that flies through the gate between two frames. */
export function drawGap(g, w, y, gh) {
  g.fillStyle = '#050302';
  g.fillRect(0, y, w, gh);
  const hw = gh * 0.42, n = Math.ceil(w / (hw * 3.4));
  for (let i = 0; i <= n; i++) hole(g, i * hw * 3.4 + hw * 0.6, y + gh * 0.24, hw * 1.5, gh * 0.52);
}

/** The year, on a mechanical counter. `year` is fractional while the digits roll. */
export function drawCounter(g, x, y, s, year, age, a, tint) {
  if (a <= 0) return;
  const dw = s * 0.62, wBox = dw * 4 + s * 0.36, hBox = s * 1.24;
  g.save();
  g.globalAlpha = a;
  g.fillStyle = 'rgba(0,0,0,0.3)';
  roundRect(g, x - wBox + s * 0.05, y + s * 0.07, wBox, hBox, s * 0.16); g.fill();
  g.fillStyle = '#16110e';
  roundRect(g, x - wBox, y, wBox, hBox, s * 0.16); g.fill();
  g.strokeStyle = rgba(tint, 0.9); g.lineWidth = Math.max(1, s * 0.035);
  roundRect(g, x - wBox, y, wBox, hBox, s * 0.16); g.stroke();
  g.font = `700 ${s}px ${SANS}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.beginPath(); g.rect(x - wBox + s * 0.1, y + s * 0.1, wBox - s * 0.2, hBox - s * 0.2); g.clip();
  for (let k = 0; k < 4; k++) {
    const p = Math.pow(10, k), v = year / p, f = v - Math.floor(v);
    const roll = k === 0 ? f : Math.max(0, f * p - (p - 1)); // a wheel turns only while the one to its right passes 9
    const d = Math.floor(v) % 10, cxk = x - s * 0.18 - dw * (k + 0.5), cyk = y + hBox * 0.54;
    g.fillStyle = '#231b16';
    g.fillRect(cxk - dw * 0.46, y + s * 0.1, dw * 0.92, hBox - s * 0.2);
    g.fillStyle = '#f3e7cc';
    g.fillText(String(d), cxk, cyk - roll * hBox * 0.92);
    g.fillText(String((d + 1) % 10), cxk, cyk + (1 - roll) * hBox * 0.92);
  }
  const sh = g.createLinearGradient(0, y, 0, y + hBox);
  sh.addColorStop(0, 'rgba(0,0,0,0.6)'); sh.addColorStop(0.3, 'rgba(0,0,0,0)'); sh.addColorStop(0.7, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.fillStyle = sh;
  g.fillRect(x - wBox, y, wBox, hBox);
  g.restore();
  g.save();
  g.globalAlpha = a;
  g.font = `700 ${s * 0.36}px ${OSD}`;
  g.textAlign = 'right'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.fillText(`AGE ${String(Math.max(0, Math.round(age))).padStart(2, '0')}`, x - s * 0.04 + 1, y + hBox + s * 0.36 + 1);
  g.fillStyle = '#f3e7cc';
  g.fillText(`AGE ${String(Math.max(0, Math.round(age))).padStart(2, '0')}`, x - s * 0.05, y + hBox + s * 0.36);
  g.restore();
}
