// PLUNGE — the two divers: who they are, where they sink, how they move, and the beach
// gear that trades itself for diving gear on the way down. Every function of time here is
// pure: the same t draws the same figure.
import { seg, ease, lerp, clamp01, angLerp, mixHex, rgba, rand, TAU } from '../../kit.js';

// Bone lengths and widths in diver heights. Limb angles are measured from the feet-ward
// axis toward the diver's front: 0 hangs toward the feet, PI/2 points ahead, PI reaches past the head.
const B = { torso: 0.31, neck: 0.115, head: 0.078, ua: 0.16, fa: 0.15, th: 0.235, sh: 0.225 };
const W = { hips: 0.13, chest: 0.165, arm: 0.068, fore: 0.058, thigh: 0.1, shin: 0.076 };
const DEEP = '#05121c';

function poseTumble(t, ph, o) {
  o.fa1 = 1.85 + 0.55 * Math.sin(t * 1.7 + ph);
  o.fa2 = o.fa1 + 0.55 + 0.3 * Math.sin(t * 2.1 + ph);
  o.ba1 = 2.55 + 0.45 * Math.sin(t * 1.3 + ph * 2);
  o.ba2 = o.ba1 + 0.45;
  o.fl1 = 0.45 + 0.3 * Math.sin(t * 1.1 + ph);
  o.fl2 = o.fl1 - 0.75;
  o.bl1 = -0.25 + 0.25 * Math.sin(t * 0.9 + ph * 3);
  o.bl2 = o.bl1 - 0.4;
}
function poseArrow(t, ph, o) {
  // streamlined: arms locked past the head, legs together, a small dolphin kick
  o.fa1 = Math.PI - 0.05; o.fa2 = Math.PI - 0.01;
  o.ba1 = Math.PI + 0.05; o.ba2 = Math.PI + 0.02;
  const k = 0.07 * Math.sin(t * 9 + ph);
  o.fl1 = k; o.fl2 = k * 1.7; o.bl1 = k - 0.03; o.bl2 = k * 1.7 - 0.03;
}
function poseSwim(t, ph, o) {
  // gun held out ahead past the head, free arm trailing, an easy flutter kick
  o.fa1 = 2.55; o.fa2 = 2.9;
  o.ba1 = 0.32; o.ba2 = 0.22;
  const s = Math.sin(t * 6.2 + ph), k = 0.26 * s;
  o.fl1 = 0.1 + k; o.fl2 = o.fl1 - 0.22 - 0.18 * Math.max(0, s);
  o.bl1 = 0.1 - k; o.bl2 = o.bl1 - 0.22 - 0.18 * Math.max(0, -s);
}
const P0 = {}, P1 = {};
function blendPose(a, b, k, o) { for (const key in a) o[key] = lerp(a[key], b[key], k); }

/** Decide both divers once, from ctx.rng. */
export function makeCast(ctx, rng, PLAYER_COLORS) {
  const sL = rng() < 0.5 ? -1 : 1; // the side the one who was shot starts and leaves on
  const draw = !ctx.winner;
  const mk = (role, info, fallbackCol, side) => {
    const col = info ? info.color : fallbackCol;
    return {
      role, side, name: info ? String(info.name).toUpperCase() : '', col,
      body: mixHex(col, DEEP, 0.72), back: mixHex(col, DEEP, 0.84), rim: mixHex(col, '#ffffff', 0.45),
      shortsBack: mixHex(col, DEEP, 0.4), fin: mixHex(col, '#ffffff', 0.08), finEdge: mixHex(col, DEEP, 0.45),
      f: side, ph: rand(rng, 0, TAU), spin: (rng() < 0.5 ? -1 : 1) * rand(rng, 2.0, 2.9), rot0: rand(rng, 0, TAU),
      x0: rand(rng, 0.3, 0.4), y0: rand(rng, 0.26, 0.34), near: 1,
      exit0: 0, J: {}, pose: {}, x: 0, y: 0, L: 0, rot: 0, alpha: 0, swap: [0, 0, 0],
    };
  };
  const loser = mk('tumble', ctx.loser, PLAYER_COLORS[0], sL);
  const winner = mk(draw ? 'tumble' : 'arrow', ctx.winner, PLAYER_COLORS[1], -sL);
  winner.x0 = rand(rng, 0.14, 0.24);
  // which of the two passes nearer the lens
  const nearW = rng() < 0.5;
  winner.near = nearW ? rand(rng, 1.05, 1.15) : rand(rng, 0.84, 0.94);
  loser.near = nearW ? rand(rng, 0.86, 0.96) : rand(rng, 1.02, 1.1);
  loser.exit0 = rand(rng, 3.28, 3.45);
  winner.exit0 = rand(rng, 3.32, 3.5);
  return { loser, winner, list: nearW ? [loser, winner] : [winner, loser], draw };
}

const heading = (side) => side * (Math.PI / 2 + 0.33); // head toward its own side, a little nose-down

/** Place and pose one diver at time t (screen pixels). */
export function stepDiver(d, t, w, h) {
  const U = Math.min(w, h * 1.78);
  let fx, fy, rot, kR, alpha, depth = 1;
  if (d.role === 'tumble') {
    const tau = Math.max(0, t - 1.5);
    const spun = d.rot0 + (d.spin * (1 - Math.exp(-tau * 1.05))) / 1.05;
    kR = ease.inOutCubic(seg(t, 2.85, 3.55));
    rot = angLerp(spun, heading(d.side), kR);
    fx = d.side * (d.x0 - 0.06 * ease.inOutSine(seg(t, 1.6, 3.2)));
    fy = d.y0 + 0.2 * ease.outSine(seg(t, 1.5, 3.3));
    alpha = ease.outSine(seg(t, 1.66, 2.05));
    poseTumble(t, d.ph, P0);
  } else {
    // arrow-straight down out of the foam, slowing as the water takes the speed off
    const kD = ease.outCubic(seg(t, 1.92, 2.78));
    kR = ease.inOutCubic(seg(t, 2.72, 3.3));
    rot = angLerp(Math.PI + 0.06 * d.side, heading(d.side), kR);
    fx = d.side * (d.x0 + 0.05 * kR);
    fy = lerp(-0.6, 0.3, kD) + 0.04 * ease.inOutSine(seg(t, 2.8, 3.5));
    alpha = 1;
    poseArrow(t, d.ph, P0);
  }
  poseSwim(t, d.ph, P1);
  blendPose(P0, P1, kR, d.pose);
  // and off they go: each toward their own end of the reef, into the blue
  const kE = ease.inCubic(seg(t, d.exit0, d.exit0 + 0.85));
  fx += d.side * 0.62 * kE;
  fy += 0.1 * kE;
  depth = 1 - 0.55 * kE;
  alpha *= 1 - ease.inSine(seg(t, d.exit0 + 0.35, d.exit0 + 0.8));
  d.x = w / 2 + fx * U * 0.5;
  d.y = h * fy;
  d.L = h * 0.3 * d.near * depth;
  d.rot = rot;
  d.alpha = clamp01(alpha);
  joints(d);
}

const dx = (a) => Math.sin(a), dy = (a) => Math.cos(a);
function joints(d) {
  const p = d.pose, J = d.J;
  J.sx = 0; J.sy = -B.torso;
  J.hx = 0.012; J.hy = -B.torso - B.neck;
  J.efx = J.sx + dx(p.fa1) * B.ua; J.efy = J.sy + dy(p.fa1) * B.ua;
  J.hfx = J.efx + dx(p.fa2) * B.fa; J.hfy = J.efy + dy(p.fa2) * B.fa;
  J.ebx = J.sx + dx(p.ba1) * B.ua; J.eby = J.sy + dy(p.ba1) * B.ua;
  J.hbx = J.ebx + dx(p.ba2) * B.fa; J.hby = J.eby + dy(p.ba2) * B.fa;
  J.kfx = dx(p.fl1) * B.th; J.kfy = dy(p.fl1) * B.th;
  J.afx = J.kfx + dx(p.fl2) * B.sh; J.afy = J.kfy + dy(p.fl2) * B.sh;
  J.kbx = dx(p.bl1) * B.th; J.kby = dy(p.bl1) * B.th;
  J.abx = J.kbx + dx(p.bl2) * B.sh; J.aby = J.kby + dy(p.bl2) * B.sh;
}

/** A point in the diver's own frame (diver heights) → screen pixels. */
export function toScreen(d, lx, ly, out) {
  const c = Math.cos(d.rot), s = Math.sin(d.rot), x = lx * d.f * d.L, y = ly * d.L;
  out.x = d.x + x * c - y * s;
  out.y = d.y + x * s + y * c;
  return out;
}

function limb(g, ax, ay, bx, by, cx, cy, width) {
  g.lineWidth = width;
  g.beginPath();
  g.moveTo(ax, ay);
  g.lineTo(bx, by);
  g.lineTo(cx, cy);
  g.stroke();
}

// The silhouette, drawn once as a rim of light and once as the body over it.
function figure(g, d, J, grow, rim) {
  const back = rim ? d.rim : d.back, body = rim ? d.rim : d.body;
  g.strokeStyle = back;
  limb(g, J.sx, J.sy, J.ebx, J.eby, J.hbx, J.hby, W.fore + grow);
  limb(g, 0, 0, J.kbx, J.kby, J.abx, J.aby, W.shin + grow);
  if (!rim) { g.strokeStyle = d.shortsBack; limb(g, 0, -0.02, J.kbx * 0.45, J.kby * 0.45, J.kbx * 0.5, J.kby * 0.5, W.thigh + 0.012); }
  g.strokeStyle = body;
  limb(g, 0, 0.015, 0, -0.08, 0, -0.12, W.hips + grow);
  limb(g, 0.008, -0.13, 0.01, -0.2, J.sx, J.sy + 0.025, W.chest + grow);
  g.fillStyle = body;
  g.beginPath();
  g.arc(J.hx, J.hy, B.head + grow / 2, 0, TAU);
  g.fill();
  limb(g, 0, 0, J.kfx, J.kfy, J.afx, J.afy, W.thigh * 0.85 + grow);
  if (!rim) {
    // boardshorts in their colour: the one piece of beach kit that stays
    g.strokeStyle = d.col;
    g.globalAlpha *= 0.9;
    limb(g, 0, -0.03, J.kfx * 0.45, J.kfy * 0.45, J.kfx * 0.5, J.kfy * 0.5, W.thigh + 0.016);
    g.globalAlpha /= 0.9;
    g.strokeStyle = body;
  }
  limb(g, J.sx, J.sy, J.efx, J.efy, J.hfx, J.hfy, W.arm + grow);
}

function fin(g, ax, ay, ang, k, fill, edge) {
  if (k <= 0.01) return;
  const len = 0.25 * k, ux = dx(ang), uy = dy(ang), px = -uy, py = ux;
  g.fillStyle = fill;
  g.strokeStyle = edge;
  g.lineWidth = 0.008;
  g.beginPath();
  g.moveTo(ax + px * 0.022, ay + py * 0.022);
  g.quadraticCurveTo(ax + ux * len * 0.6 + px * 0.05 * k, ay + uy * len * 0.6 + py * 0.05 * k, ax + ux * len + px * 0.045 * k, ay + uy * len + py * 0.045 * k);
  g.lineTo(ax + ux * len * 0.92, ay + uy * len * 0.92);
  g.lineTo(ax + ux * len - px * 0.04 * k, ay + uy * len - py * 0.04 * k);
  g.quadraticCurveTo(ax + ux * len * 0.5 - px * 0.03 * k, ay + uy * len * 0.5 - py * 0.03 * k, ax - px * 0.02, ay - py * 0.02);
  g.closePath();
  g.fill();
  g.stroke();
}

// beach → diving gear; k = 0 is all beach, 1 all diving
function gear(g, d, J, t, accent) {
  const [kMask, kFins, kGun] = d.swap;
  // the leash: a coil of cord trailing off the back ankle, reeled in as the fins arrive
  const lk = 1 - clamp01(kFins * 1.4);
  if (lk > 0.01) {
    const n = 22, len = 0.38 * lk, tx = -0.36, ty = 0.93;
    g.strokeStyle = 'rgba(235,248,255,0.75)';
    g.lineWidth = 0.01;
    g.beginPath();
    g.moveTo(J.abx, J.aby);
    for (let i = 1; i <= n; i++) {
      const s = (i / n) * len, c = 0.022 * Math.sin(s * 60 + t * 4 + d.ph) * Math.min(1, s * 12);
      g.lineTo(J.abx + tx * s - ty * c, J.aby + ty * s + tx * c);
    }
    g.stroke();
    g.fillStyle = '#eaf6ff';
    g.beginPath();
    g.arc(J.abx, J.aby, 0.02, 0, TAU);
    g.fill();
  }
  fin(g, J.abx, J.aby, d.pose.bl2 - 0.25, ease.outBack(kFins), d.finEdge, d.finEdge);
  fin(g, J.afx, J.afy, d.pose.fl2 - 0.25, ease.outBack(kFins), d.fin, d.finEdge);

  // sunglasses → mask
  const hx = J.hx + 0.045, hy = J.hy - 0.012;
  const gk = 1 - clamp01(kMask * 1.6);
  if (gk > 0.01) {
    g.fillStyle = '#05080c';
    g.fillRect(hx - 0.012, hy - 0.012 * gk, 0.05, 0.024 * gk);
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.fillRect(hx + 0.018, hy - 0.009 * gk, 0.012, 0.005 * gk);
  }
  const mk = ease.outBack(kMask);
  if (mk > 0.01) {
    g.strokeStyle = '#0b1820';
    g.lineWidth = 0.014 * mk;
    g.beginPath();
    g.arc(J.hx, J.hy, B.head * 1.03, -0.5, Math.PI * 0.75); // strap round the back of the head
    g.stroke();
    const mw = 0.05 * mk, mh = 0.064 * mk, mx = hx + 0.012, my = hy - 0.004;
    g.fillStyle = 'rgba(200,245,255,0.92)';
    g.strokeStyle = d.col;
    g.lineWidth = 0.012 * mk;
    g.beginPath();
    g.ellipse(mx, my, mw / 2, mh / 2, 0, 0, TAU);
    g.fill();
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    g.ellipse(mx + mw * 0.12, my - mh * 0.18, mw * 0.12, mh * 0.2, 0.4, 0, TAU);
    g.fill();
  }

  // rifle → speargun, along the front forearm
  const a = d.pose.fa2, ux = dx(a), uy = dy(a), px = -uy, py = ux, x = J.hfx, y = J.hfy;
  const gk2 = ease.inOutCubic(kGun), bk = ease.outBack(clamp01(kGun * 1.25 - 0.2));
  const back = lerp(0.13, 0.07, gk2), front = lerp(0.46, 0.6, gk2), wid = lerp(0.036, 0.024, gk2);
  g.lineCap = 'round';
  g.strokeStyle = gk2 < 0.5 ? '#0a1016' : mixHex('#0a1016', '#6f8792', (gk2 - 0.5) * 2);
  g.lineWidth = wid;
  g.beginPath();
  g.moveTo(x - ux * back, y - uy * back);
  g.lineTo(x + ux * front, y + uy * front);
  g.stroke();
  if (gk2 < 0.5) { // the stock
    g.lineWidth = 0.05 * (1 - gk2 * 2);
    g.beginPath();
    g.moveTo(x - ux * back, y - uy * back);
    g.lineTo(x - ux * 0.02, y - uy * 0.02);
    g.stroke();
  }
  const sk = 1 - clamp01(kGun * 1.8); // the scope floats away
  if (sk > 0.01) {
    const so = 0.035 + (1 - sk) * 0.05;
    g.strokeStyle = '#0a1016';
    g.lineWidth = 0.028 * sk;
    g.beginPath();
    g.moveTo(x + ux * 0.06 + px * so, y + uy * 0.06 + py * so);
    g.lineTo(x + ux * 0.2 + px * so, y + uy * 0.2 + py * so);
    g.stroke();
  }
  if (bk > 0.01) {
    // the spear, its tip, and two rubber bands in the new world's accent
    const tip = front + 0.2 * bk;
    g.strokeStyle = '#dfeef2';
    g.lineWidth = 0.008;
    g.beginPath();
    g.moveTo(x + ux * (front - 0.1), y + uy * (front - 0.1));
    g.lineTo(x + ux * tip, y + uy * tip);
    g.stroke();
    g.fillStyle = '#f4fbff';
    g.beginPath();
    g.moveTo(x + ux * (tip + 0.045 * bk), y + uy * (tip + 0.045 * bk));
    g.lineTo(x + ux * tip + px * 0.016, y + uy * tip + py * 0.016);
    g.lineTo(x + ux * tip - px * 0.016, y + uy * tip - py * 0.016);
    g.closePath();
    g.fill();
    g.strokeStyle = accent;
    g.lineWidth = 0.009;
    for (let i = 0; i < 2; i++) {
      const at = front - 0.04 - i * 0.07, s = 0.03 * bk;
      g.beginPath();
      g.moveTo(x + ux * at + px * s, y + uy * at + py * s);
      g.quadraticCurveTo(x + ux * (at - 0.14) + px * s * 1.6, y + uy * (at - 0.14) + py * s * 1.6, x + ux * 0.02 + px * 0.012, y + uy * 0.02 + py * 0.012);
      g.stroke();
    }
  }
}

/** Draw one diver: a soft glow in their colour, a rim of surface light, the body, the gear. */
export function drawDiver(g, d, t, accent) {
  if (d.alpha <= 0.003 || d.L < 2) return;
  const J = d.J, L = d.L;
  g.save();
  g.globalAlpha = d.alpha;
  // the glow that tells a player which diver is theirs
  const cx = d.x - Math.sin(d.rot) * -0.16 * L, cy = d.y + Math.cos(d.rot) * -0.16 * L;
  const halo = g.createRadialGradient(cx, cy, 0, cx, cy, L * 0.62);
  halo.addColorStop(0, rgba(d.col, 0.3));
  halo.addColorStop(1, rgba(d.col, 0));
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = halo;
  g.fillRect(cx - L, cy - L, 2 * L, 2 * L);
  g.globalCompositeOperation = 'source-over';
  g.lineCap = g.lineJoin = 'round';
  const o = Math.max(1.5, L * 0.015);
  for (let pass = 0; pass < 2; pass++) {
    g.save();
    g.translate(d.x, d.y - (pass ? 0 : o));
    g.rotate(d.rot);
    g.scale(d.f * L, L);
    figure(g, d, J, pass ? 0 : 0.026, !pass);
    if (pass) gear(g, d, J, t, accent);
    g.restore();
  }
  g.restore();
}
