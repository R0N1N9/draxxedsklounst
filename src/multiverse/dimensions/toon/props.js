// The set dressing that moves: ladders, springboards, the seesaw rock with its crate tower, the handcar, the
// train, anvils, tumbleweeds, the vulture, portable holes, corks, the sun, clouds and the dancing cacti.
import { clamp } from '../../kit.js';
import { C, blob, blobPath, poly, hose, jit, letters } from './ink.js';
import { GY, FLOOR, PIV, PLANK, CRATE, CAR_Y, CAR_W, ladderTop } from './world.js';
import { drawHat } from './figures.js';

const PAPER = '#f7f0de';

export function drawLadder(g, w, l, T) {
  const y0 = ladderTop(w, l), y1 = l.bot, rope = l.k === 'cliff';
  g.save();
  g.lineCap = 'round';
  const sway = (y) => (rope ? Math.sin(T * 1.3 + y * 0.012) * 2.2 : 0);
  for (let pass = 0; pass < 2; pass++) {
    g.strokeStyle = pass ? (rope ? C.g1 : C.paper2) : C.ink;
    const k = pass ? 0.4 : 1;
    g.lineWidth = (rope ? 5.5 : 7) * k + (pass ? 0 : 0.5);
    g.beginPath();
    for (const s of [-1, 1]) {
      g.moveTo(l.x + s * 10 + sway(y0), y0);
      g.lineTo(l.x + s * 10 + sway(y1), y1);
    }
    g.stroke();
    g.lineWidth = 4.8 * k + (pass ? 0 : 0.8);
    g.beginPath();
    for (let y = y0 + 12; y < y1 - 4; y += 16) { const o = sway(y); g.moveTo(l.x - 10 + o, y); g.lineTo(l.x + 10 + o, y); }
    g.stroke();
  }
  g.restore();
}

/** A one-way plank on two poles (the perch). */
export function drawBoard(g, b) {
  g.strokeStyle = C.ink; g.lineWidth = 7; g.lineCap = 'round';
  g.beginPath(); g.moveTo(b.x + 14, b.y + 10); g.lineTo(b.x + 14, GY); g.moveTo(b.x + b.w - 14, b.y + 10); g.lineTo(b.x + b.w - 14, GY); g.stroke();
  g.strokeStyle = C.g2; g.lineWidth = 3;
  g.beginPath(); g.moveTo(b.x + 14, b.y + 10); g.lineTo(b.x + 14, GY); g.moveTo(b.x + b.w - 14, b.y + 10); g.lineTo(b.x + b.w - 14, GY); g.stroke();
  poly(g, [b.x, b.y, b.x + b.w, b.y, b.x + b.w, b.y + b.h, b.x, b.y + b.h], 33 + b.x, '#e3d6b8', 3.6, 0.7, C.ink, 0.5);
  g.strokeStyle = 'rgba(27,22,18,0.35)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(b.x + 10, b.y + 5); g.lineTo(b.x + b.w - 10, b.y + 6); g.stroke();
}

export function drawSpring(g, sp, squash, T, E) {
  const cx = (sp.x0 + sp.x1) / 2, wd = sp.x1 - sp.x0;
  const h = 24 * (1 - 0.62 * squash) * (1 + 0.05 * E.pulse);
  g.save();
  g.translate(cx, sp.y);
  poly(g, [-wd / 2, 0, wd / 2, 0, wd / 2 - 3, -6, -wd / 2 + 3, -6], 3, C.g4, 3, 0.4, C.ink, 0.2);
  g.strokeStyle = C.ink; g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath();
  const n = 4;
  g.moveTo(-12, -6);
  for (let i = 0; i < n; i++) { const y = -6 - ((i + 0.5) / n) * (h - 6); g.lineTo(i % 2 ? -13 : 13, y); }
  g.lineTo(0, -h);
  g.stroke();
  g.strokeStyle = C.g1; g.lineWidth = 1.8;
  g.beginPath();
  g.moveTo(-12, -6);
  for (let i = 0; i < n; i++) { const y = -6 - ((i + 0.5) / n) * (h - 6); g.lineTo(i % 2 ? -13 : 13, y); }
  g.lineTo(0, -h);
  g.stroke();
  const tilt = Math.sin(T * 3 + cx) * 0.03;
  g.translate(0, -h - 3); g.rotate(tilt);
  blob(g, 0, 0, wd / 2 + 4, 6.5, 8, PAPER, 3.2, 0.7, 10);
  g.fillStyle = C.ink; // painted chevrons: this way across
  for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(i * 11 - 3 * sp.dir, -3); g.lineTo(i * 11 + 3 * sp.dir, 0); g.lineTo(i * 11 - 3 * sp.dir, 3); g.lineWidth = 2; g.stroke(); }
  g.restore();
}

function crate(g, x, y, rot, s, seed, top) {
  g.save();
  g.translate(x, y); g.rotate(rot);
  const h = s / 2;
  poly(g, [-h, -h, h, -h, h, h, -h, h], seed, '#e8dcc0', 3.4, 0.8, C.ink, 0.6);
  poly(g, [-h + 7, -h + 7, h - 7, -h + 7, h - 7, h - 7, -h + 7, h - 7], seed + 5, null, 2.2, 0.6, C.ink, 0.5);
  g.strokeStyle = C.ink; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-h + 7, -h + 7); g.lineTo(h - 7, h - 7); g.moveTo(h - 7, -h + 7); g.lineTo(-h + 7, h - 7); g.stroke();
  g.fillStyle = C.ink;
  for (const [nx, ny] of [[-h + 4, -h + 4], [h - 4, -h + 4], [-h + 4, h - 4], [h - 4, h - 4]]) { g.beginPath(); g.arc(nx, ny, 1.8, 0, 6.283); g.fill(); }
  if (top) letters(g, '?', 0, 1, 20, 0, '#fff');
  g.restore();
}
export { crate };

export function drawSeesaw(g, w, T, E) {
  const tw = w.tower;
  g.save();
  g.translate(PIV.x, PIV.y);
  g.rotate(w.tilt);
  // the plank
  poly(g, [-PLANK, 0, PLANK, 0, PLANK, 12, -PLANK, 12], 21, '#e3d6b8', 3.6, 0.8, C.ink, 0.6);
  g.strokeStyle = 'rgba(27,22,18,0.35)'; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(-PLANK + 12, 5); g.lineTo(-30, 6); g.moveTo(30, 6); g.lineTo(PLANK - 12, 5); g.stroke();
  g.fillStyle = C.ink;
  for (const bx of [-PLANK + 12, PLANK - 12]) { g.beginPath(); g.arc(bx, 5.5, 2.3, 0, 6.283); g.fill(); }
  // fulcrum wedge under the middle
  g.save(); g.rotate(-w.tilt); g.restore();
  // the tower of crates: each one sways a little more than the one below it
  const wob = tw.wob;
  for (let k = 0; k < tw.n; k++) {
    const sw = wob * (k + 1) * (k + 1) * 0.55 + Math.sin(T * 2.1 + k) * 0.6 * (k + 1) * 0.4;
    crate(g, sw + 0, -CRATE / 2 - k * CRATE + 0.5 - E.pulse * (k ? 1.4 : 0), wob * 0.012 * (k + 1) + Math.sin(T * 1.7 + k * 0.8) * 0.012, CRATE, 100 + k * 7, k === tw.n - 1);
  }
  g.restore();
}

export function drawHandcar(g, car, x, T, E) {
  g.save();
  g.translate(x, 0);
  const bob = E.pulse * 1.6;
  const wy = FLOOR - 13, spin = x * 0.07;
  // handle: a rocking pump beam with a T-grip
  const ang = Math.sin(T * 4.2) * 0.35;
  g.save(); g.translate(0, CAR_Y - 22 - bob);
  poly(g, [-5, 22, 5, 22, 3, 0, -3, 0], 51, C.g3, 2.8, 0.4, C.ink, 0.2);
  g.rotate(ang);
  poly(g, [-44, -4, 44, -4, 44, 3, -44, 3], 53, C.g1, 3, 0.4, C.ink, 0.2);
  blob(g, -45, -1, 4, 6, 54, C.ink, 0, 0.3, 6);
  blob(g, 45, -1, 4, 6, 55, C.ink, 0, 0.3, 6);
  g.restore();
  // chassis and deck
  poly(g, [-CAR_W / 2, CAR_Y - bob, CAR_W / 2, CAR_Y - bob, CAR_W / 2 - 4, CAR_Y + 14 - bob, -CAR_W / 2 + 4, CAR_Y + 14 - bob], 61, PAPER, 3.6, 0.7, C.ink, 0.5);
  g.fillStyle = C.ink;
  for (let i = -2; i <= 2; i++) g.fillRect(i * 22 - 5, CAR_Y + 2 - bob, 10, 8);
  poly(g, [-CAR_W / 2 + 12, CAR_Y + 14 - bob, CAR_W / 2 - 12, CAR_Y + 14 - bob, CAR_W / 2 - 22, wy - 4, -CAR_W / 2 + 22, wy - 4], 63, C.g2, 3, 0.5, C.ink, 0.3);
  for (const wx of [-42, 42]) {
    blob(g, wx, wy, 14, 14, 70 + wx, PAPER, 3.4, 0.6, 10);
    g.strokeStyle = C.ink; g.lineWidth = 2.4; g.lineCap = 'round';
    g.beginPath();
    for (let k = 0; k < 3; k++) { const a = spin + (k * Math.PI) / 3; g.moveTo(wx - Math.cos(a) * 12, wy - Math.sin(a) * 12); g.lineTo(wx + Math.cos(a) * 12, wy + Math.sin(a) * 12); }
    g.stroke();
  }
  g.restore();
}

/** A cartoon locomotive and cars, head at x = 0 running toward +x in its own space. */
export function drawTrainBody(g, T, E, dist) {
  const wheel = (x, r, seed) => {
    blob(g, x, -r, r, r, seed, PAPER, 3.4, 0.7, 11);
    g.strokeStyle = C.ink; g.lineWidth = 2.4; g.lineCap = 'round';
    g.beginPath();
    for (let k = 0; k < 4; k++) { const a = dist / r + (k * Math.PI) / 4; g.moveTo(x - Math.cos(a) * (r - 3), -r - Math.sin(a) * (r - 3)); g.lineTo(x + Math.cos(a) * (r - 3), -r + Math.sin(a) * (r - 3)); }
    g.stroke();
    g.fillStyle = C.ink; g.beginPath(); g.arc(x, -r, 3, 0, 6.283); g.fill();
  };
  const b = (i) => Math.abs(Math.sin(T * 9 + i * 1.4)) * 2 + E.pulse * 1.5;
  // couplings
  g.strokeStyle = C.ink; g.lineWidth = 5;
  g.beginPath(); g.moveTo(-290, -18); g.lineTo(-312, -18); g.moveTo(-404, -18); g.lineTo(-418, -18); g.stroke();
  // caboose and boxcar
  for (const [x0, x1, i, fill] of [[-470, -414, 3, C.g1], [-408, -300, 2, C.g2]]) {
    g.save(); g.translate(0, -b(i));
    poly(g, [x0, -88, x1, -88, x1, -14, x0, -14], 200 + i, fill, 3.6, 0.9, C.ink, 0.8);
    g.strokeStyle = C.ink; g.lineWidth = 2.4;
    g.beginPath(); for (let x = x0 + 14; x < x1 - 6; x += 18) { g.moveTo(x, -84); g.lineTo(x, -18); } g.stroke();
    poly(g, [x0 + 10, -76, x1 - 10, -76, x1 - 10, -60, x0 + 10, -60], 210 + i, PAPER, 2.4, 0.4, C.ink, 0.3);
    g.restore();
    wheel(x0 + 22, 11, 240 + i); wheel(x1 - 22, 11, 244 + i);
  }
  // tender with a heap of coal
  g.save(); g.translate(0, -b(1));
  poly(g, [-294, -64, -214, -64, -214, -14, -294, -14], 301, C.g3, 3.6, 0.9, C.ink, 0.6);
  blobPath(g, -254, -64, 38, 20, 303, 1.4, 10); g.fillStyle = C.ink; g.fill();
  g.fillStyle = PAPER; g.fillRect(-286, -42, 64, 10);
  g.restore();
  wheel(-272, 12, 310); wheel(-236, 12, 311);
  // cab
  g.save(); g.translate(0, -b(0));
  poly(g, [-208, -126, -150, -126, -150, -14, -208, -14], 320, C.g2, 3.8, 1, C.ink, 0.8);
  poly(g, [-216, -126, -142, -126, -146, -138, -212, -138], 321, C.ink, 3, 0.6, C.ink, 0.4);
  poly(g, [-196, -112, -162, -112, -162, -78, -196, -78], 322, '#fff', 3, 0.6, C.ink, 0.4);
  // boiler
  poly(g, [-152, -90, -24, -90, -24, -24, -152, -24], 330, C.g1, 4, 1.2, C.ink, 1.2);
  g.strokeStyle = C.ink; g.lineWidth = 2.6;
  g.beginPath(); for (const x of [-120, -86, -52]) { g.moveTo(x, -88); g.lineTo(x, -26); } g.stroke();
  g.fillStyle = 'rgba(247,240,222,0.55)'; g.fillRect(-148, -84, 118, 9);
  // funnel and dome
  poly(g, [-124, -90, -98, -90, -92, -134, -130, -134], 340, C.ink, 3, 0.8, C.ink, 0.5);
  poly(g, [-136, -134, -86, -134, -92, -148, -130, -148], 341, C.ink, 3, 0.6, C.ink, 0.4);
  blob(g, -62, -96, 15, 12, 342, PAPER, 3.4, 0.7, 9);
  // the face on the front plate: one big headlamp eye, a grille full of teeth
  poly(g, [-26, -92, 4, -80, 4, -22, -26, -22], 350, C.g2, 3.8, 1, C.ink, 0.8);
  blob(g, -12, -66, 11, 12.5, 351, '#fff', 3.4, 0.6, 10);
  g.fillStyle = C.ink; g.beginPath(); g.arc(-8, -64, 5.4, 0, 6.283); g.fill();
  g.lineWidth = 4; g.strokeStyle = C.ink; g.beginPath(); g.moveTo(-26, -86); g.lineTo(2, -78); g.stroke(); // brow
  poly(g, [-24, -44, 3, -44, 3, -24, -24, -24], 352, '#fff', 2.8, 0.4, C.ink, 0.3);
  g.strokeStyle = C.ink; g.lineWidth = 2.2;
  g.beginPath(); for (let x = -20; x < 2; x += 5.5) { g.moveTo(x, -44); g.lineTo(x, -24); } g.stroke();
  g.restore();
  // cowcatcher
  poly(g, [4, -24, 30, -2, 4, -2], 360, C.g3, 3.4, 0.5, C.ink, 0.3);
  g.strokeStyle = C.ink; g.lineWidth = 2.2; g.beginPath(); for (let k = 0; k < 4; k++) { g.moveTo(5 + k * 3, -22 + k * 5); g.lineTo(5 + k * 3, -3); } g.stroke();
  // driving wheels and the side rod
  wheel(-60, 21, 370); wheel(-110, 21, 371); wheel(-160, 17, 372);
  const rod = Math.sin(dist / 21) * 12;
  g.strokeStyle = C.ink; g.lineWidth = 5.5; g.beginPath(); g.moveTo(-160 + rod, -20 + rod * 0.5); g.lineTo(-60 + rod, -21 + rod * 0.5); g.stroke();
}

export function drawAnvilShadow(g, x, y, k, T) {
  const r = 14 + k * 46;
  g.save();
  g.translate(x, y + 2);
  g.save();
  g.scale(1, 0.22);
  g.fillStyle = `rgba(27,22,18,${0.34 + 0.4 * k})`;
  blobPath(g, 0, 0, r, r, 5, 1.6, 12); g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 9; g.setLineDash([18, 12]); g.lineDashOffset = -T * 40;
  blobPath(g, 0, 0, r + 10, r + 10, 5, 1.6, 12); g.stroke();
  g.restore();
  // a warning triangle bobbing over it
  const by = -64 - Math.abs(Math.sin(T * 7)) * 10 - k * 8;
  g.translate(0, by);
  const sz = 20 + k * 6;
  poly(g, [0, -sz, sz, sz * 0.7, -sz, sz * 0.7], 91, '#fff', 4, 0.8, C.ink, 0.5);
  letters(g, '!', 0, sz * 0.15, sz * 1.35, 0, C.ink, 0);
  g.restore();
}

export function drawAnvil(g, x, y, k, fall, T) {
  g.save();
  g.translate(x, y);
  const sq = fall ? 1 : Math.max(0, 1 - (k * 8)); // when it settles it squashes for a beat
  g.scale(fall ? 0.82 : 1 + 0.1 * sq, fall ? 1.32 : 1 - 0.16 * sq);
  if (fall) { g.strokeStyle = C.ink; g.lineWidth = 3; g.beginPath(); for (let i = -1; i <= 1; i++) { g.moveTo(i * 18, -80); g.lineTo(i * 18, -150 - Math.abs(i) * 14); } g.stroke(); }
  poly(g, [-40, 0, 40, 0, 32, -14, 14, -18, 16, -34, 40, -40, 58, -50, 26, -56, -36, -56, -34, -40, -16, -34, -18, -18, -32, -14], 77, C.ink, 4, 1, C.ink, 0.6);
  g.strokeStyle = 'rgba(247,240,222,0.8)'; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-28, -51); g.lineTo(18, -51); g.moveTo(-24, -5); g.lineTo(18, -5); g.stroke();
  letters(g, '10T', -2, -26, 15, 0, '#fff', 0);
  g.restore();
}

export function drawWeed(g, x, y, rot, r, T) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  blob(g, 0, 0, r, r, 9, 'rgba(231,220,196,0.92)', 0, 1.6, 12);
  g.strokeStyle = C.ink; g.lineWidth = 2; g.lineCap = 'round';
  for (let k = 0; k < 7; k++) {
    g.save(); g.rotate(k * 0.9);
    g.beginPath();
    g.ellipse(jit(k, 1.4), jit(k + 20, 1.4), r * (0.62 + (k % 3) * 0.16), r * (0.34 + (k % 2) * 0.26), 0, 0.3, 5.6);
    g.stroke();
    g.restore();
  }
  g.lineWidth = 3.2;
  blobPath(g, 0, 0, r, r, 12, 1.8, 12); g.stroke();
  g.restore();
}

/** The vulture: gangly, bald, scruffy ruff and big hooked beak. dir = +1 faces right. */
export function drawVulture(g, x, y, dir, T, hat, hatStyle, hatCol, flap = 1) {
  g.save();
  g.translate(x, y);
  g.scale(dir * 1.55, 1.55);
  const f = Math.sin(T * 12) * flap;
  g.lineCap = 'round'; g.lineJoin = 'round';
  // tail
  poly(g, [-14, 2, -34, 6, -32, -2, -34, -8, -14, -4], 401, C.ink, 2.6, 0.6, C.ink, 0.3);
  // far wing
  g.save(); g.translate(-2, -4); g.rotate(-0.9 - f * 0.55);
  poly(g, [0, 0, 6, -10, 34, -26, 46, -22, 30, -10, 44, -6, 24, 0, 34, 6, 10, 8], 402, C.g5, 2.6, 0.8, C.ink, 0.4);
  g.restore();
  // body
  blob(g, 0, 0, 17, 10, 403, C.ink, 3, 0.7, 10);
  // legs and talons
  g.strokeStyle = C.ink; g.lineWidth = 2.8;
  g.beginPath(); g.moveTo(-3, 8); g.lineTo(-5, 17); g.lineTo(-10, 20); g.moveTo(-5, 17); g.lineTo(-1, 21); g.moveTo(4, 8); g.lineTo(3, 17); g.lineTo(-2, 20); g.stroke();
  // near wing
  g.save(); g.translate(2, -4); g.rotate(-0.5 + f * 0.7);
  poly(g, [0, 0, 8, -14, 38, -34, 52, -28, 34, -14, 50, -8, 28, 0, 38, 8, 12, 11], 404, C.ink, 2.6, 0.8, C.ink, 0.4);
  g.strokeStyle = 'rgba(247,240,222,0.55)'; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(12, -4); g.lineTo(38, -22); g.moveTo(12, 0); g.lineTo(40, -9); g.stroke();
  g.restore();
  // ruff, neck and head
  hose(g, 10, -4, 20, -15, -3, 5.5, 405, C.g4);
  for (let i = 0; i < 5; i++) blob(g, 8 + i * 1.6, -2 - i * 2, 6, 4.2, 410 + i, PAPER, 2.2, 0.5, 7);
  blob(g, 25, -19, 7.5, 6.2, 406, C.g2, 2.8, 0.5, 9);
  poly(g, [29, -22, 40, -18, 35, -13, 31, -14], 407, '#e8dcc0', 2.6, 0.4, C.ink, 0.3); // hooked beak
  g.fillStyle = '#fff'; g.beginPath(); g.arc(26, -21, 2.4, 0, 6.283); g.fill();
  g.fillStyle = C.ink; g.beginPath(); g.arc(27, -21, 1.2, 0, 6.283); g.fill();
  g.lineWidth = 2.4; g.beginPath(); g.moveTo(22, -25); g.lineTo(29, -23); g.stroke();
  if (hat) drawHat(g, hatStyle, hatCol, 4, 22, 0.5, 0.55, 420);
  g.restore();
}

/** A portable hole: a black disc slapped on the ground, with a spiral in the owner's tint. */
export function drawHole(g, h, T, col, armed) {
  const s = h.grow;
  g.save();
  g.translate(h.x, h.y);
  g.scale(s, s * (0.85 + 0.15 * s));
  blob(g, 0, 0, 38, 11, 500 + h.id, PAPER, 3.6, 0.9, 12);
  blob(g, 0, 1, 33, 8.5, 510 + h.id, C.ink, 0, 0.7, 12);
  g.strokeStyle = col; g.lineWidth = 2.2; g.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    const rr = 1 - k * 0.27;
    g.setLineDash([9, 7]); g.lineDashOffset = -T * 28 * (k + 1) * (h.n ? -1 : 1);
    g.beginPath(); g.ellipse(0, 1, 27 * rr, 6.4 * rr, 0, 0, 6.283); g.stroke();
  }
  g.setLineDash([]);
  if (armed) { g.strokeStyle = col; g.globalAlpha = 0.5 + 0.4 * Math.sin(T * 8); g.lineWidth = 3; g.beginPath(); g.ellipse(0, 0, 44, 14, 0, 0, 6.283); g.stroke(); g.globalAlpha = 1; }
  g.restore();
}

export function drawCork(g, c, col, T, u = 1) {
  const sp = Math.hypot(c.vx, c.vy) || 1, ux = c.vx / sp, uy = c.vy / sp;
  const len = clamp(sp * 0.05, 18, 66) * Math.max(1, u * 0.7);
  const k = Math.max(1, u * 0.62); // keep it a clear size on a phone
  g.save();
  // a ribbon of the owner's colour behind it
  g.fillStyle = col; g.globalAlpha = 0.42;
  g.beginPath();
  g.moveTo(c.x + uy * 4.5 * k, c.y - ux * 4.5 * k);
  g.lineTo(c.x - ux * len + uy * 0.6, c.y - uy * len - ux * 0.6);
  g.lineTo(c.x - ux * len - uy * 0.6, c.y - uy * len + ux * 0.6);
  g.lineTo(c.x - uy * 4.5 * k, c.y + ux * 4.5 * k);
  g.fill();
  g.globalAlpha = 1;
  g.strokeStyle = C.ink; g.lineWidth = 2; g.lineCap = 'round';
  g.beginPath();
  for (const o of [-1, 1]) { g.moveTo(c.x - ux * (len * 0.5) + uy * o * 9, c.y - uy * (len * 0.5) - ux * o * 9); g.lineTo(c.x - ux * (len * 1.15) + uy * o * 9, c.y - uy * (len * 1.15) - ux * o * 9); }
  g.stroke();
  g.translate(c.x, c.y);
  g.rotate(T * 14);
  g.scale(k, k);
  blob(g, 0, 0, 7.4, 6.6, c.seed, '#fff', 3.4, 0.5, 8);
  g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 3.5, 0.3, 2.4); g.stroke();
  g.restore();
}

export function drawSun(g, x, y, T, E) {
  const r = 58 * (1 + 0.05 * E.pulse);
  g.save();
  g.translate(x, y);
  for (let k = 1; k <= 2; k++) { g.strokeStyle = `rgba(27,22,18,${0.16 / k})`; g.lineWidth = 3; blobPath(g, 0, 0, r + 22 * k + E.pulse * 3, r + 22 * k + E.pulse * 3, 600 + k, 1.4, 16); g.stroke(); }
  // rays
  g.save(); g.rotate(T * 0.12);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * 6.283, l = (i & 1 ? 26 : 40) + Math.sin(T * 5 + i) * 4 + E.pulse * 6;
    g.save(); g.rotate(a);
    poly(g, [r - 2, -8, r + l, 0, r - 2, 8], 620 + i, PAPER, 3, 0.8, C.ink, 0.4);
    g.restore();
  }
  g.restore();
  blob(g, 0, 0, r, r, 640, PAPER, 4.4, 1.4, 16);
  // a face in bliss: closed happy eyes, rosy cheeks, a grin
  g.strokeStyle = C.ink; g.lineWidth = 4.2; g.lineCap = 'round';
  g.beginPath(); g.arc(-20, -8, 9, 3.4, 6.0); g.arc(20, -8, 9, 3.4, 6.0); g.stroke();
  g.fillStyle = 'rgba(27,22,18,0.14)';
  g.beginPath(); g.ellipse(-31, 8, 9, 5.5, 0, 0, 6.283); g.ellipse(31, 8, 9, 5.5, 0, 0, 6.283); g.fill();
  g.beginPath(); g.moveTo(-23, 12); g.quadraticCurveTo(0, 12 + 22 + E.pulse * 5, 23, 12); g.closePath();
  g.fillStyle = C.ink; g.fill();
  g.fillStyle = PAPER; g.fillRect(-12, 14, 24, 5);
  g.restore();
}

export function drawCloud(g, x, y, s, seed, idx = 1) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  const cs = [[-46, 8, 20], [-22, -8, 28], [10, -14, 32], [42, -2, 25], [66, 10, 17], [14, 10, 26], [-12, 12, 22]];
  g.fillStyle = PAPER; g.strokeStyle = C.ink; g.lineWidth = 7; g.lineJoin = 'round';
  for (const [cx, cy, r] of cs) { blobPath(g, cx, cy, r, r, seed + cx, 1.6, 12); g.stroke(); }
  for (const [cx, cy, r] of cs) { blobPath(g, cx, cy, r, r, seed + cx, 1.6, 12); g.fill(); }
  g.strokeStyle = 'rgba(27,22,18,0.16)'; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.arc(14, -4, 18, 0.6, 1.9); g.arc(-18, 6, 14, 0.7, 1.9); g.stroke();
  if (idx % 2 === 0) { // a sleepy face: closed eyes, a tiny smile
    g.strokeStyle = C.ink; g.lineWidth = 3.2;
    g.beginPath(); g.arc(-2, 2, 5, 0.2, 2.9); g.arc(22, 2, 5, 0.2, 2.9); g.moveTo(5, 12); g.quadraticCurveTo(11, 17, 17, 12); g.stroke();
    g.fillStyle = 'rgba(27,22,18,0.12)'; g.beginPath(); g.ellipse(-8, 12, 6, 3.6, 0, 0, 6.283); g.ellipse(30, 12, 6, 3.6, 0, 0, 6.283); g.fill();
  }
  g.restore();
}

/** A cover rock: a lumpy inked boulder with hatching and a crack, drawn live so it can boil — and get up and leave. */
export function drawRock(g, cx, by, lit, seed, hop = 0) {
  g.save();
  g.translate(cx, by - hop);
  const pts = [-47, 0, -53, -20, -36, -46, -8, -62, 24, -57, 48, -32, 51, 0];
  g.beginPath();
  poly(g, pts, seed, lit ? C.g1 : C.g2, 0, 1.2, C.ink, 1.4);
  g.save();
  poly(g, pts, seed, null, 0, 0, C.ink, 0.1);
  g.clip();
  g.fillStyle = lit ? C.paper2 : C.g1;
  g.beginPath(); g.ellipse(-12, -40, 30, 17, -0.3, 0, 6.283); g.fill();
  g.strokeStyle = `rgba(27,22,18,${lit ? 0.16 : 0.32})`; g.lineWidth = 1.6;
  g.beginPath(); for (let x = -70; x < 60; x += 9) { g.moveTo(x, -70); g.lineTo(x + 70, 4); } g.stroke();
  g.restore();
  poly(g, pts, seed, null, 4.2, 1.4, C.ink, 1.4);
  g.strokeStyle = 'rgba(27,22,18,0.6)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(26, -52); g.lineTo(18, -30); g.lineTo(26, -16); g.stroke();
  g.restore();
}

/** The cover rocks have faces and watch the duel: eyes follow (lx, ly) and blink. */
export function drawRockFace(g, cx, cy, lx, ly, T, seed, alarmed) {
  const blink = (T * 0.7 + seed) % 3.1 < 0.13;
  g.save();
  g.translate(cx, cy);
  for (const ex of [-13, 13]) {
    if (blink) { g.strokeStyle = C.ink; g.lineWidth = 3; g.beginPath(); g.moveTo(ex - 6, 0); g.lineTo(ex + 6, 0); g.stroke(); continue; }
    blob(g, ex, 0, 7.5, alarmed ? 10 : 8.5, seed + ex, '#fff', 2.8, 0.5, 9);
    g.fillStyle = C.ink; g.beginPath(); g.arc(ex + lx * 3.4, ly * 3.2, alarmed ? 1.8 : 3.2, 0, 6.283); g.fill();
  }
  g.strokeStyle = C.ink; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-21, -11); g.lineTo(-6, alarmed ? -14 : -8); g.moveTo(21, -11); g.lineTo(6, alarmed ? -14 : -8); g.stroke();
  g.beginPath();
  if (alarmed) g.ellipse(0, 19, 5, 6.5, 0, 0, 6.283); else { g.moveTo(-8, 18); g.quadraticCurveTo(0, 14 + Math.sin(T * 2 + seed) * 2, 8, 18); }
  g.stroke();
  g.restore();
}

/** A dancing cactus: trunk sways and squashes on the beat, arms flap, a small face grins. */
export function drawCactus(g, x, y, s, T, E, seed, face = true) {
  g.save();
  g.translate(x, y);
  const beat = E.sway;
  g.rotate(beat * 0.05 + Math.sin(T * 1.7 + seed) * 0.015);
  g.scale(s * (1 - 0.04 * E.pulse), s * (1 + 0.07 * E.pulse));
  const arm = (dir, h, lift) => {
    g.save(); g.translate(dir * 12, -h);
    const a = lift;
    g.strokeStyle = C.ink; g.lineWidth = 26; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(dir * 20, 0); g.lineTo(dir * 20 + dir * Math.sin(a) * 6, -22 - 18 * lift); g.stroke();
    g.strokeStyle = '#c8bfa9'; g.lineWidth = 19;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(dir * 20, 0); g.lineTo(dir * 20 + dir * Math.sin(a) * 6, -22 - 18 * lift); g.stroke();
    g.restore();
  };
  const l1 = 0.5 + 0.5 * Math.sin(T * 4 + seed), l2 = 0.5 + 0.5 * Math.cos(T * 4 + seed);
  arm(-1, 56, E.pulse * 0.5 + l1 * 0.5);
  arm(1, 70, E.pulse * 0.5 + l2 * 0.5);
  blob(g, 0, -56, 19, 58, 700 + seed, '#c8bfa9', 3.8, 1.2, 14);
  g.strokeStyle = 'rgba(27,22,18,0.3)'; g.lineWidth = 2;
  g.beginPath(); for (const o of [-9, 0, 9]) { g.moveTo(o, -104); g.quadraticCurveTo(o * 1.2, -56, o, -6); } g.stroke();
  g.fillStyle = 'rgba(247,240,222,0.55)'; g.beginPath(); g.ellipse(-8, -62, 3.5, 30, 0, 0, 6.283); g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 2; g.beginPath();
  for (let i = 0; i < 9; i++) { const cy = -14 - i * 11, cx = i % 2 ? 14 : -14; g.moveTo(cx, cy); g.lineTo(cx + (i % 2 ? 6 : -6), cy - 2); }
  g.stroke();
  if (face) {
    g.fillStyle = C.ink;
    g.beginPath(); g.arc(-6, -82, 2.6, 0, 6.283); g.arc(6, -82, 2.6, 0, 6.283); g.fill();
    g.lineWidth = 2.4; g.beginPath(); g.arc(0, -78, 6, 0.3, 2.8); g.stroke();
  }
  g.restore();
}

