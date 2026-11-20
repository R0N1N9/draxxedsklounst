// The cast: two egg-headed rubber-hose snipers (noodle limbs, big gloves, a telescoping cork pop-gun), the
// decoy cut-out and a hat. Everything is ink + one tint, drawn live so the lines can boil and the bodies
// can squash and stretch.
import { clamp, mixHex } from '../../kit.js';
import { C, blob, blobPath, poly, hose, starPath, jit } from './ink.js';
import { SHOULDER } from './world.js';

const FACE_COL = '#f7f0de';
export const GUN = { base: 56, sect: 26, n: 3 };

/** A hat in its own coordinates: (x, y) is the middle of the brim's underside. */
export function drawHat(g, style, col, x, y, rot, s = 1, seed = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.scale(s, s);
  if (style === 0) { // boater: a flat straw crown with a tinted band and a wide brim
    blob(g, 0, 0, 29, 6.5, seed, FACE_COL, 3, 0.8, 10);
    poly(g, [-17, 0, -17, -19, 17, -19, 17, 0], seed + 3, FACE_COL, 3, 0.7, C.ink, 0.5);
    poly(g, [-17, -6, -17, -12, 17, -12, 17, -6], seed + 7, col, 2.4, 0.5, C.ink, 0.4);
    blob(g, 0, -19, 17, 4.5, seed + 11, C.paper2, 2.6, 0.6, 9);
    g.fillStyle = C.ink; g.beginPath(); g.arc(-6, -19, 1.3, 0, 6.283); g.arc(6, -19, 1.3, 0, 6.283); g.fill();
  } else { // bowler: a black dome, a thin brim, a tinted band and a feather
    blob(g, 0, 0, 26, 5.5, seed, C.ink, 3, 0.8, 10);
    blobPath(g, 0, -4, 19, 19, seed + 2, 0.9, 12);
    g.save(); g.clip();
    g.fillStyle = C.ink; g.fillRect(-22, -26, 44, 26);
    g.fillStyle = col; g.fillRect(-22, -9, 44, 6);
    g.restore();
    blobPath(g, 0, -4, 19, 19, seed + 2, 0.9, 12);
    g.strokeStyle = C.ink; g.lineWidth = 3; g.stroke();
    g.strokeStyle = 'rgba(247,240,222,0.8)'; g.lineWidth = 2.4;
    g.beginPath(); g.arc(-4, -9, 12, Math.PI * 1.1, Math.PI * 1.45); g.stroke();
    g.strokeStyle = C.ink; g.lineWidth = 2.4; g.fillStyle = FACE_COL;
    g.beginPath(); g.moveTo(10, -10); g.quadraticCurveTo(22, -26, 30, -20); g.quadraticCurveTo(22, -14, 12, -9); g.closePath(); g.fill(); g.stroke();
  }
  g.restore();
}

function glove(g, x, y, rot, seed) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  blob(g, 0, 0, 9, 8, seed, FACE_COL, 3, 0.7, 9);
  g.strokeStyle = C.ink; g.lineWidth = 1.8; g.lineCap = 'round';
  g.beginPath();
  g.moveTo(1, -7); g.lineTo(4, -1); g.moveTo(5, -4); g.lineTo(7, 1); // knuckle lines
  g.stroke();
  blob(g, -9, 3, 3.6, 2.8, seed + 5, FACE_COL, 2.4, 0.4, 6); // cuff
  g.restore();
}

function shoe(g, x, y, seed) {
  blob(g, x + 4, y - 2, 14, 7, seed, C.ink, 2.6, 0.7, 9);
  g.fillStyle = 'rgba(247,240,222,0.9)';
  g.beginPath(); g.ellipse(x + 11, y - 3, 4, 2.4, -0.2, 0, 6.283); g.fill();
}

function eye(g, x, y, look, mood, blink, seed, big = 1) {
  if (blink || mood === 'squint') {
    g.strokeStyle = C.ink; g.lineWidth = 2.8; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x - 5, y + (mood === 'squint' ? 0 : 1)); g.quadraticCurveTo(x, y + 3, x + 5, y + (mood === 'squint' ? -1 : 1)); g.stroke();
    return;
  }
  if (mood === 'dizzy') {
    g.strokeStyle = C.ink; g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i < 26; i++) { const a = i * 0.7, r = 0.5 + i * 0.26; g.lineTo(x + Math.cos(a + jit(seed, 3)) * r, y + Math.sin(a) * r); }
    g.stroke();
    return;
  }
  blob(g, x, y, 5 * big, 7.2 * big, seed, mood === 'scorch' ? C.paper : '#fff', 2.5, 0.5, 9);
  g.fillStyle = C.ink;
  const px = x + look[0] * 2.4, py = y + look[1] * 3;
  g.beginPath(); g.ellipse(px, py, mood === 'scared' ? 1.6 : 3.1, mood === 'scared' ? 1.6 : 4, 0, 0, 6.283); g.fill();
  if (mood !== 'scorch') { g.fillStyle = '#fff'; g.beginPath(); g.arc(px - 0.9, py - 1.6, 1, 0, 6.283); g.fill(); }
}

/** Head, with every expression the story needs. look = [-1..1, -1..1] */
function head(g, p, E, mood, look, hat) {
  const scorch = mood === 'scorch';
  const blink = scorch ? (E.T * 1.3 + p.i * 0.5) % 1 < 0.2 : (E.T + p.i * 1.7) % 3.3 < 0.12;
  // tufts of hair
  if (!hat) {
    g.strokeStyle = C.ink; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath();
    const up = scorch ? 1.7 : 1;
    g.moveTo(-6, -102); g.quadraticCurveTo(-10, -114 * up, -2, -113 * up);
    g.moveTo(1, -104); g.quadraticCurveTo(0, -118 * up, 8, -116 * up);
    g.moveTo(8, -102); g.quadraticCurveTo(12, -112 * up, 17, -108 * up);
    g.stroke();
  }
  blob(g, -15, -80, 5, 7, p.i + 90, FACE_COL, 2.8, 0.5, 8); // ear
  blob(g, 0, -80, 23, 24.5, p.i + 5, scorch ? C.g4 : FACE_COL, 3.6, 1.1, 14);
  if (scorch) {
    g.fillStyle = C.ink; g.globalAlpha = 0.4;
    blobPath(g, 2, -78, 20, 21, 7, 1.4, 12); g.fill();
    g.globalAlpha = 1;
  } else { // a soft cheek of shadow on the back of the head
    g.fillStyle = 'rgba(27,22,18,0.08)';
    g.beginPath(); g.ellipse(-12, -76, 10, 17, 0, 0, 6.283); g.fill();
    g.fillStyle = mixHex(p.col, '#f7f0de', 0.45); g.globalAlpha = 0.55; // blush in the identity tint
    g.beginPath(); g.ellipse(9, -70, 5, 3.2, 0, 0, 6.283); g.fill(); g.globalAlpha = 1;
  }
  const m = mood === 'aim' ? 'squint' : mood;
  eye(g, 1, -85, look, mood === 'aim' ? 'ok' : m, blink, p.i + 11, 1);
  eye(g, 13.5, -85, look, m, blink, p.i + 17, 1);
  // brows
  g.strokeStyle = scorch ? C.paper : C.ink; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath();
  const bt = mood === 'scared' ? -3 : mood === 'aim' ? 3 : mood === 'dizzy' ? 0 : -1;
  g.moveTo(-3, -95 - bt * 0.3); g.lineTo(5, -94 - bt);
  g.moveTo(10, -94 - bt); g.lineTo(18, -95 - bt * 0.3 + (mood === 'aim' ? 3 : 0));
  g.stroke();
  // nose: a round bulb that sticks out of the front of the egg
  blob(g, 23.5, -77, 5.2, 4.8, p.i + 23, scorch ? C.g4 : C.paper2, 2.8, 0.5, 8);
  // mouth
  g.strokeStyle = scorch ? C.paper : C.ink; g.lineWidth = 2.8;
  g.beginPath();
  if (mood === 'scorch') { g.moveTo(8, -66); g.lineTo(11, -68); g.lineTo(14, -65); g.lineTo(17, -68); g.lineTo(20, -66); } else if (mood === 'dizzy') { g.moveTo(8, -66); g.quadraticCurveTo(14, -73, 21, -66); } else if (mood === 'scared') { g.ellipse(14, -65, 4, 5, 0, 0, 6.283); } else if (mood === 'win') { g.moveTo(7, -69); g.quadraticCurveTo(15, -56, 22, -70); } else { g.moveTo(8, -68); g.quadraticCurveTo(15, -62, 22, -69); }
  g.stroke();
  if (mood === 'win') { g.fillStyle = '#c0605a'; g.globalAlpha = 0.9; g.beginPath(); g.ellipse(14.5, -64, 4, 2.6, 0, 0, 6.283); g.fill(); g.globalAlpha = 1; }
  if (mood === 'aim') { g.fillStyle = '#d98d8d'; g.strokeStyle = C.ink; g.lineWidth = 2; g.beginPath(); g.ellipse(21, -64, 4, 2.6, 0.5, 0, 6.283); g.fill(); g.stroke(); } // tongue out in concentration
  if (hat) drawHat(g, p.i, p.col, 0 + E.hatLean, -100 - E.pulse * 1.5 + (p.hatDrop || 0), E.hatTilt, 1, p.i + 40);
}

/** The cork gun, from the shoulder, pointing along +x of the current transform. */
function gun(g, p, E) {
  const ext = p.charge * GUN.sect * GUN.n;
  const rec = p.recoil * 10;
  g.save();
  g.translate(-rec, 0);
  // stock (shaped like a mallet handle) and chamber
  poly(g, [-20, -5, -4, -4, -4, 5, -20, 7], p.i + 61, C.g4, 3, 0.5, C.ink, 0.5);
  blob(g, 14, 0, 16, 7.5, p.i + 62, C.g1, 3, 0.6, 10);
  g.fillStyle = p.col; g.fillRect(8, -7.5, 5, 15); // tinted collar
  g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(8, -7.5, 5, 15);
  // the pump slide under the chamber, drawn back while re-corking
  const pump = p.reload > 0 ? Math.sin(Math.min(1, (1 - p.reload) * 4) * Math.PI) * 8 : 0;
  poly(g, [16 - pump, 6, 30 - pump, 6, 30 - pump, 11, 16 - pump, 11], p.i + 64, C.g3, 2.4, 0.4, C.ink, 0.3);
  // barrel: a fixed tube then telescoping sections, each a little narrower
  let x = 28;
  poly(g, [x, -4.6, x + GUN.base - 28, -4.6, x + GUN.base - 28, 4.6, x, 4.6], p.i + 66, C.paper, 3, 0.4, C.ink, 0.4);
  x = GUN.base;
  for (let k = 0; k < GUN.n; k++) {
    const len = clamp(ext - k * GUN.sect, 0, GUN.sect);
    if (len <= 0.5) break;
    const hh = 4 - k * 0.7;
    poly(g, [x - 4, -hh, x + len, -hh, x + len, hh, x - 4, hh], p.i + 70 + k, k % 2 ? C.paper : C.paper2, 2.6, 0.3, C.ink, 0.3);
    g.strokeStyle = C.ink; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x + len, -hh - 1.2); g.lineTo(x + len, hh + 1.2); g.stroke();
    x += len;
  }
  // the flared muzzle
  poly(g, [x, -3.4, x + 9, -7, x + 9, 7, x, 3.4], p.i + 80, C.g1, 2.6, 0.3, C.ink, 0.3);
  if (p.charge > 0.04) { // a ruler's worth of ticks along the barrel shows how far it is out
    g.strokeStyle = 'rgba(27,22,18,0.6)'; g.lineWidth = 1.4;
    g.beginPath();
    for (let tx = GUN.base + 8; tx < x - 3; tx += 8) { g.moveTo(tx, -3); g.lineTo(tx, 0); }
    g.stroke();
  }
  p.muzzle = x + 9;
  // the cork: shown loaded, rising into the muzzle in the last of the reload
  const loaded = p.reload <= 0 ? 1 : clamp(1 - (p.reload - 0.0) * 3.2, 0, 1) * (p.reload < 0.32 ? 1 : 0);
  if (loaded > 0) {
    const rise = p.reload <= 0 ? 0 : (1 - loaded) * 10;
    g.save(); g.translate(x + 9.5, -rise); g.scale(0.5 + loaded * 0.5, 0.5 + loaded * 0.5);
    blob(g, 0, 0, 5.8, 5, p.i + 90, '#fff', 2.6, 0.4, 8);
    g.strokeStyle = p.col; g.lineWidth = 2.6; g.beginPath(); g.arc(0, 0, 3.4, -1, 1); g.stroke();
    g.restore();
  }
  if (p.flash > 0) { // the muzzle flash: a spiky white star
    g.save(); g.translate(x + 14, 0);
    starPath(g, 0, 0, 14 + p.flash * 46, p.flash * 3, 0.42);
    g.fillStyle = '#fff'; g.fill(); g.strokeStyle = C.ink; g.lineWidth = 3; g.stroke();
    g.restore();
  }
  if (p.charge > 0.94 && p.alive !== false) { // full: the glint everyone on the ridge can see
    const k = 0.65 + 0.35 * Math.sin(E.T * 18);
    g.save(); g.translate(x + 4, -3); g.rotate(E.T * 2);
    g.fillStyle = '#fff'; g.strokeStyle = C.ink; g.lineWidth = 2.6;
    starPath(g, 0, 0, 22 * k + 6, 0, 0.16); g.fill(); g.stroke();
    g.rotate(0.78);
    starPath(g, 0, 0, 13 * k + 4, 0, 0.2); g.fill(); g.stroke();
    g.restore();
  }
  g.restore();
}

/**
 * Draw one sniper. p carries pose fields (x, y feet; face; a aim; vx; st 0 stand / 1 duck / 2 climb;
 * ground; run; charge; reload; recoil; flash; stun; hat; col; i; sx, sy squash; dead).
 * E: { T, pulse, sway, hatLean, hatTilt }
 */
export function drawSniper(g, p, E, mood) {
  const climb = p.st === 2, duck = p.st === 1;
  g.save();
  g.translate(p.x, p.y);
  const sy = p.sy * (1 + 0.04 * E.pulse) * (duck ? 0.66 : 1), sx = p.sx * (1 - 0.025 * E.pulse) * (duck ? 1.14 : 1);
  g.scale((p.face || 1) * sx, sy);
  const moving = p.ground && !climb && Math.abs(p.vx) > 25;
  g.rotate(clamp((p.vx * (p.face || 1)) / 285, -1, 1) * 0.12 + (p.dead ? 0 : E.sway * 0.025 * (moving ? 0 : 1)));
  const T = E.T;
  // ---- legs ----
  for (let s = -1; s <= 1; s += 2) {
    let fx = s * 9, fy = 0, bend = s * 5;
    if (climb) { fx = s * 6; fy = -Math.sin(p.climb + (s > 0 ? Math.PI : 0)) * 9 - 3; bend = s * 9; } else if (!p.ground) { fy = -9 - 3 * Math.sin(T * 17 + s * 2); fx = s * 11 + (p.vy < 0 ? s * 3 : -s * 2); bend = s * 12; } else if (moving) {
      const ph = p.run + (s > 0 ? Math.PI : 0);
      fx = Math.sin(ph) * 25; fy = -Math.max(0, Math.cos(ph)) * 19; bend = 12 * s + 7;
    } else if (!p.dead && s > 0) { fy = -E.pulse * 5; } // the front foot taps the beat
    hose(g, s * 6, -30, fx, fy - 4, bend, 8.5, p.i * 7 + s);
    shoe(g, fx, fy, p.i * 11 + s);
  }
  if (!climb && !p.dead) g.translate(0, -E.pulse * (p.ground ? 3.6 : 1) - (moving ? Math.abs(Math.sin(p.run)) * 5 : 0)); // the whole top half hops on the beat, and bounces as it runs
  // ---- back arm (the glove that holds the pump) goes behind the body ----
  const rel = p.face > 0 ? p.a : Math.PI - p.a;
  const sxs = 7, sys = -SHOULDER + 2;
  const c = Math.cos(rel), s2 = Math.sin(rel), rec = p.recoil * 10;
  const free = p.dead || climb || p.stun > 0 || mood === 'win';
  if (!free) {
    const gx = sxs + c * (20 - rec), gy = sys + s2 * (20 - rec);
    hose(g, -8, -SHOULDER + 2, gx, gy, 9, 8, p.i * 5 + 1);
  }
  // ---- torso ----
  g.save();
  g.translate(0, -46);
  blob(g, 0, 0, 17.5, 19, p.i + 31, p.col, 3.6, 0.9, 12);
  g.fillStyle = 'rgba(247,240,222,0.55)';
  g.beginPath(); g.ellipse(-6, -6, 5, 9, 0.25, 0, 6.283); g.fill(); // a shine on the vest
  if (mood === 'scorch') { g.fillStyle = 'rgba(27,22,18,0.45)'; blobPath(g, 0, 0, 16, 18, p.i + 31, 0.9, 12); g.fill(); }
  g.fillStyle = FACE_COL; // shirt front and collar
  poly(g, [-5, -17, 7, -17, 1, -5], p.i + 33, mood === 'scorch' ? C.g4 : FACE_COL, 2.4, 0.4, C.ink, 0.3);
  g.fillStyle = C.ink;
  g.beginPath(); g.arc(3, 1, 2, 0, 6.283); g.arc(3, 9, 2, 0, 6.283); g.fill();
  g.restore();
  // ---- head ----
  g.save();
  const lookX = E.look && E.look[0], lookY = E.look && E.look[1];
  g.translate(0, p.dead ? 0 : -E.pulse * 1.2);
  head(g, p, E, mood, [lookX || 0, lookY || 0], p.hat && !p.dead);
  g.restore();
  // ---- front arm + the gun ----
  if (free) {
    const up = mood === 'win';
    const w = up ? Math.sin(T * 9) * 8 : p.stun > 0 ? Math.sin(T * 16) * 10 : 0;
    for (let s = -1; s <= 1; s += 2) {
      const gx = s * (up ? 22 : 24) + (climb ? s * -6 : 0), gy = up ? -92 + (s > 0 ? w : -w) : p.dead ? -22 : p.stun > 0 ? -82 + s * w : -88 + (s > 0 ? -Math.sin(p.climb + 3) : Math.sin(p.climb + 3)) * 9;
      hose(g, s * 9, -SHOULDER + 2, gx, gy, -s * 8, 8, p.i * 9 + s);
      glove(g, gx, gy, s * 0.5, p.i * 13 + s);
    }
    if (climb || p.dead) { // slung on the back / dangling
      g.save(); g.translate(-8, -52); g.rotate(climb ? -2.1 : 1.35); g.scale(0.75, 0.75); gun(g, p, E); g.restore();
    }
  } else {
    g.save();
    g.translate(sxs, sys);
    g.rotate(rel);
    gun(g, p, E);
    g.restore();
    const g1x = sxs + c * (20 - rec), g1y = sys + s2 * (20 - rec);
    glove(g, g1x, g1y, rel, p.i * 17);
    const g2x = sxs + c * (-6 - rec) - s2 * 1.5, g2y = sys + s2 * (-6 - rec) + c * 1.5;
    hose(g, 9, -SHOULDER + 2, g2x, g2y, 6, 8, p.i * 5 + 3);
    glove(g, g2x, g2y, rel, p.i * 17 + 3);
  }
  g.restore();
}

/** The decoy: the same sniper as a painted wooden cut-out on a stake, waving. Close up, the stake and the dotted cut line give it away. */
export function drawDecoy(g, d, E, col, style) {
  const T = E.T, pop = d.pop || 0;
  g.save();
  g.translate(d.x, d.y);
  g.rotate(pop * 0.9 * (d.spin || 1));
  g.translate(0, -pop * 40);
  g.scale(d.face, 1 - pop * 0.3);
  const grow = d.grow < 1 ? 1 - Math.pow(1 - d.grow, 3) : 1;
  g.scale(1, 0.3 + 0.7 * grow);
  const tone = (c) => mixHex(c, '#d9cfb8', 0.2);
  const bob = E.pulse * 2;
  // wooden foot and braces behind the legs
  poly(g, [-24, 0, 24, 0, 24, 5, -24, 5], d.id, C.g3, 2.6, 0.4, C.ink, 0.2);
  g.strokeStyle = C.ink; g.lineWidth = 3.4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-17, 0); g.lineTo(-6, -40); g.moveTo(17, 0); g.lineTo(6, -40); g.stroke();
  // painted legs and shoes, as the real thing stands
  for (const s of [-1, 1]) { hose(g, s * 6, -30, s * 9, -4, s * 5, 8.5, d.id + s); shoe(g, s * 9, 0, d.id + s * 3); }
  g.translate(0, -bob);
  // the board: body shape with a visible cut edge
  blob(g, 0, -46, 17.5, 19, d.id + 3, tone(col), 3.6, 0.9, 12);
  g.strokeStyle = 'rgba(247,240,222,0.8)'; g.lineWidth = 1.5; g.setLineDash([4, 4]);
  blobPath(g, 0, -46, 13.5, 15, d.id + 3, 0.4, 12); g.stroke(); g.setLineDash([]);
  g.fillStyle = C.ink; g.beginPath(); g.arc(3, -45, 2, 0, 6.283); g.arc(3, -37, 2, 0, 6.283); g.fill();
  blob(g, 0, -80, 23, 24.5, d.id + 5, '#efe6cf', 3.6, 0.9, 14);
  g.strokeStyle = C.ink; g.lineWidth = 2.8; g.lineCap = 'round';
  g.beginPath(); g.arc(1, -84, 4, 0.2, 2.9); g.arc(13.5, -84, 4, 0.2, 2.9); g.stroke(); // two painted happy eyes
  g.beginPath(); g.moveTo(8, -68); g.quadraticCurveTo(15, -62, 22, -69); g.stroke();
  blob(g, 23.5, -77, 5.2, 4.8, d.id + 9, C.paper2, 2.8, 0.5, 8);
  drawHat(g, style, col, 0, -100, 0, 1, d.id);
  // one waving arm
  const w = Math.sin(T * 7 + d.id) * 0.5;
  g.save(); g.translate(10, -58); g.rotate(-1.3 + w);
  hose(g, 0, 0, 24, 0, 5, 8, d.id + 2);
  glove(g, 25, 0, 0, d.id + 4);
  g.restore();
  g.restore();
}

/** Orbiting stars and little birds for a stunned or flattened sniper. */
export function drawDizzy(g, x, y, T, col) {
  for (let i = 0; i < 3; i++) {
    const a = T * 4 + (i * 6.283) / 3, px = x + Math.cos(a) * 26, py = y + Math.sin(a) * 7;
    starPath(g, px, py, 8 + Math.sin(T * 9 + i) * 1.5, T * 3 + i);
    g.fillStyle = i === 0 ? col : C.paper; g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 2.2; g.lineJoin = 'round'; g.stroke();
  }
}

export function drawBirdie(g, x, y, T, k) {
  const a = T * 3 + k * 3.1, px = x + Math.cos(a) * 34, py = y + Math.sin(a) * 11 - 4;
  const flap = Math.sin(T * 22 + k) * 5;
  g.save(); g.translate(px, py); g.scale(Math.cos(a) > 0 ? 1 : -1, 1);
  g.fillStyle = C.ink; g.strokeStyle = C.ink; g.lineWidth = 2; g.lineCap = 'round';
  g.beginPath(); g.ellipse(0, 0, 6, 4, 0, 0, 6.283); g.fill();
  g.beginPath(); g.moveTo(-1, -1); g.quadraticCurveTo(-3, -8 - flap, -8, -6 - flap); g.moveTo(1, -1); g.quadraticCurveTo(3, -8 + flap, 8, -6 + flap); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(3, -1, 1.3, 0, 6.283); g.fill();
  g.fillStyle = C.paper2; g.beginPath(); g.moveTo(5, 0); g.lineTo(9, 1); g.lineTo(5, 2); g.fill();
  g.restore();
}
