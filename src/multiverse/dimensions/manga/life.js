// The street lives on around the duel: paper lanterns that swing before a gust, cats on the awnings, crows,
// passers-by under their umbrellas, a stray umbrella that cartwheels down the street on every gust.
// Only the lantern sway and the stray umbrella are tied to the clock (they telegraph the gusts the same way
// on both screens); the rest is decoration and may be random.
import { mulberry32 } from '../../kit.js';
import { C } from './ink.js';
import { WX, DY } from './world.js';

const TAU = Math.PI * 2;

export function makeLife(world) {
  const r = mulberry32(world.seed ^ 0xca7);
  const lanterns = [];
  for (let x = -6, i = 0; x < WX + 8; x += 5.2 + r() * 1.6, i++) lanterns.push({ x, ph: r() * 6, big: r() < 0.3, glyph: ['ラ', 'ホ', 'ス', 'カ', 'コ'][Math.floor(r() * 5)] });
  const cats = [{ x: 9 + r() * 6, hop: 0, gone: 0, wag: r() * 6 }, { x: WX / 2 + 14 + r() * 8, hop: 0, gone: 0, wag: r() * 6 }, { x: WX - 12 - r() * 6, hop: 0, gone: 0, wag: r() * 6 }];
  return { lanterns, cats, crows: [], crowT: 8 + Math.random() * 10, walkers: [], walkT: 2, w: 0 };
}

export function updateLife(L, dt, t, hooks) {
  for (const c of L.cats) { c.wag += dt; if (c.gone > 0) c.gone -= dt; if (c.hop > 0) c.hop -= dt * 2.2; }
  // crows cross the sky now and then
  L.crowT -= dt;
  if (L.crowT <= 0) {
    L.crowT = 18 + Math.random() * 22;
    const dir = Math.random() < 0.5 ? 1 : -1, n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) L.crows.push({ x: dir > 0 ? -8 - i * 2.6 : WX + 8 + i * 2.6, y: 15 + Math.random() * 9, dir, sp: 13 + Math.random() * 4, ph: Math.random() * 6 });
    hooks.crow();
  }
  for (let i = L.crows.length - 1; i >= 0; i--) { const c = L.crows[i]; c.x += c.dir * c.sp * dt; c.ph += dt * 11; if (c.x < -30 || c.x > WX + 30) L.crows.splice(i, 1); }
  // people with umbrellas walk the pavement
  L.walkT -= dt;
  if (L.walkT <= 0 && L.walkers.length < 3) {
    L.walkT = 7 + Math.random() * 10;
    const dir = Math.random() < 0.5 ? 1 : -1, bike = Math.random() < 0.3;
    L.walkers.push({ x: dir > 0 ? -6 : WX + 6, z: 0.55 + Math.random() * 0.5, dir, sp: bike ? 9 : 2.6 + Math.random() * 1.2, bike, ph: Math.random() * 6 });
  }
  for (let i = L.walkers.length - 1; i >= 0; i--) { const w = L.walkers[i]; w.x += w.dir * w.sp * dt; w.ph += dt * w.sp * (w.bike ? 1.1 : 2.2); if (w.x < -12 || w.x > WX + 12) L.walkers.splice(i, 1); }
  L.w += dt;
}

// a shot nearby sends the cats off
export function startleCats(L, x) {
  for (const c of L.cats) if (c.gone <= 0 && Math.abs(c.x - x) < 40 && Math.random() < 0.6) { c.gone = 9 + Math.random() * 8; c.hop = 1; }
}

// lanterns hang on strings along the shopfronts and swing with the wind: they move a beat before a gust bites
export function drawLanterns(g, v, L, t, wind) {
  const S = v.S, zk = DY * S, base = v.y0 - 0.5 * zk, y = base - 6.6 * S;
  g.lineCap = 'round';
  g.strokeStyle = C.ink;
  g.lineWidth = 1.4;
  g.beginPath();
  let first = true;
  for (let i = 0; i < L.lanterns.length; i++) {
    const a = L.lanterns[i], x = v.sx(a.x);
    if (x < v.px - 30 || x > v.px + v.pw + 30) { first = true; continue; }
    const sag = 0.5 * S * (1 + Math.sin(a.ph)) * 0.5;
    if (first) { g.moveTo(x, y); first = false; } else g.quadraticCurveTo((x + v.sx(L.lanterns[i - 1].x)) / 2, y + S * 0.9, x, y);
  }
  g.stroke();
  for (let i = 0; i < L.lanterns.length; i++) {
    const a = L.lanterns[i], x = v.sx(a.x);
    if (x < v.px - 30 || x > v.px + v.pw + 30) continue;
    const ang = 0.05 * Math.sin(t * 1.6 + a.ph) + wind * 0.55 + Math.sin(t * 7 + a.ph) * Math.abs(wind) * 0.06, r = (a.big ? 0.9 : 0.62) * S;
    g.save();
    g.translate(x, y + 0.4 * S);
    g.rotate(ang);
    g.strokeStyle = C.ink;
    g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(0, -0.4 * S); g.lineTo(0, 0.25 * S); g.stroke();
    g.fillStyle = C.white;
    g.beginPath(); g.ellipse(0, 0.25 * S + r, r * 0.82, r, 0, 0, TAU); g.fill();
    g.lineWidth = 2;
    g.stroke();
    g.lineWidth = 1;
    g.beginPath();
    for (const k of [-0.5, 0, 0.5]) { g.moveTo(r * 0.82 * k, 0.25 * S + r - r * Math.sqrt(1 - k * k) * 0.98); g.quadraticCurveTo(r * 0.95 * k * 1.15, 0.25 * S + r, r * 0.82 * k, 0.25 * S + r + r * Math.sqrt(1 - k * k) * 0.98); }
    g.stroke();
    g.fillStyle = C.ink;
    g.fillRect(-r * 0.45, 0.2 * S, r * 0.9, 0.14 * S);
    g.fillRect(-r * 0.45, 0.25 * S + 2 * r - 0.06 * S, r * 0.9, 0.14 * S);
    g.restore();
  }
}

export function drawCats(g, v, L, t, backWall) {
  const S = v.S;
  for (const c of L.cats) {
    if (c.gone > 0 && c.hop <= 0) continue;
    const x = v.sx(c.x), y = v.y0 - 0.3 * DY * S - 5.95 * S;
    if (x < v.px - 40 || x > v.px + v.pw + 40) continue;
    const hop = c.hop > 0 ? Math.sin((1 - c.hop) * Math.PI) * 2.5 * S : 0, run = c.hop > 0 ? (1 - c.hop) * 8 * S : 0;
    g.save();
    g.translate(x + run, y - hop);
    g.scale(S * 0.9, S * 0.9);
    g.fillStyle = C.ink;
    g.strokeStyle = C.white;
    g.lineWidth = 0.1;
    g.lineJoin = 'round';
    g.beginPath(); // body, head, ears
    g.ellipse(0, -0.55, 0.85, 0.55, 0, 0, TAU);
    g.moveTo(0.95, -1.15); g.arc(0.75, -1.15, 0.42, 0, TAU);
    g.moveTo(0.46, -1.45); g.lineTo(0.5, -1.95); g.lineTo(0.8, -1.55);
    g.moveTo(0.95, -1.5); g.lineTo(1.18, -1.92); g.lineTo(1.12, -1.38);
    g.stroke();
    g.fill();
    g.strokeStyle = C.ink;
    g.lineWidth = 0.2;
    g.lineCap = 'round';
    g.beginPath(); // tail swishing
    g.moveTo(-0.8, -0.5);
    g.quadraticCurveTo(-1.5, -0.2 + Math.sin(c.wag * 3) * 0.4, -1.7, -1.3 + Math.sin(c.wag * 2.4) * 0.4);
    g.stroke();
    g.fillStyle = C.white;
    const blink = Math.sin(c.wag * 0.7) > 0.96 ? 0.02 : 0.1;
    g.beginPath(); g.ellipse(0.9, -1.2, 0.09, blink, 0, 0, TAU); g.ellipse(0.62, -1.2, 0.09, blink, 0, 0, TAU); g.fill();
    g.restore();
  }
}

export function drawCrows(g, v, L, sky) {
  if (!L.crows.length) return;
  const S = v.S;
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const c of L.crows) {
    const x = v.sx(c.x) , y = v.y0 - c.y * S * 0.7, f = Math.sin(c.ph), k = S * 0.55;
    g.beginPath();
    g.moveTo(x - c.dir * k * 1.4, y + f * k * 0.3);
    g.quadraticCurveTo(x - c.dir * k * 0.5, y - k * (0.6 + f * 0.9), x, y);
    g.quadraticCurveTo(x + c.dir * k * 0.5, y - k * (0.6 + f * 0.9), x + c.dir * k * 1.4, y + f * k * 0.3);
    g.quadraticCurveTo(x + c.dir * k * 0.5, y + k * 0.25, x, y + k * 0.35);
    g.quadraticCurveTo(x - c.dir * k * 0.5, y + k * 0.25, x - c.dir * k * 1.4, y + f * k * 0.3);
    g.fillStyle = C.ink;
    g.fill();
    g.strokeStyle = C.white;
    g.lineWidth = 1.1;
    g.stroke();
    g.beginPath(); // speed lines
    g.moveTo(x - c.dir * k * 2.2, y); g.lineTo(x - c.dir * k * 4, y);
    g.moveTo(x - c.dir * k * 2.4, y + k * 0.4); g.lineTo(x - c.dir * k * 3.6, y + k * 0.4);
    g.stroke();
  }
  g.restore();
}

// walkers share a pavement behind the duel: a coat, a head and a pale paper umbrella
export function drawWalkers(g, v, L, t) {
  const S = v.S;
  for (const w of L.walkers) {
    const x = v.sx(w.x), y = v.sy(w.z);
    if (x < v.px - 60 || x > v.px + v.pw + 60) continue;
    g.save();
    g.translate(x, y);
    g.scale(w.dir * S, S);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    const bob = Math.abs(Math.sin(w.ph)) * 0.06, sw = Math.sin(w.ph) * 0.5;
    g.strokeStyle = C.ink;
    if (w.bike) {
      g.lineWidth = 0.14;
      g.beginPath(); g.arc(-1.1, -0.65, 0.65, 0, TAU); g.moveTo(1.75, -0.65); g.arc(1.1, -0.65, 0.65, 0, TAU);
      g.moveTo(-1.1, -0.65); g.lineTo(0, -0.7); g.lineTo(0.8, -1.5); g.moveTo(0, -0.7); g.lineTo(-0.2, -1.55); g.moveTo(1.1, -0.65); g.lineTo(0.8, -1.5); g.lineTo(1.05, -1.7);
      g.stroke();
    } else {
      g.lineWidth = 0.28;
      g.beginPath(); g.moveTo(-0.05, -1.2); g.lineTo(sw * 0.8, 0); g.moveTo(0.05, -1.2); g.lineTo(-sw * 0.8, 0); g.stroke();
    }
    g.fillStyle = C.ink;
    g.beginPath(); g.moveTo(-0.42, -2.3 - bob); g.lineTo(0.42, -2.3 - bob); g.lineTo(0.55, -1.0); g.lineTo(-0.6, -1.0); g.closePath(); g.fill();
    g.beginPath(); g.arc(0.05, -2.62 - bob, 0.28, 0, TAU); g.fillStyle = C.paper; g.fill(); g.lineWidth = 0.08; g.stroke();
    g.beginPath(); // the umbrella: pale canopy, black rim
    g.moveTo(-1.3, -2.9 - bob); g.quadraticCurveTo(0.1, -4.1, 1.5, -2.9 - bob); g.closePath();
    g.fillStyle = C.white;
    g.fill();
    g.lineWidth = 0.12;
    g.stroke();
    g.beginPath(); g.moveTo(0.1, -3.5 - bob); g.lineTo(0.1, -2.2); g.moveTo(0.1, -3.65 - bob); g.lineTo(-0.7, -2.95 - bob); g.moveTo(0.1, -3.65 - bob); g.lineTo(0.9, -2.95 - bob); g.lineWidth = 0.07; g.stroke();
    g.restore();
  }
}

// The stray umbrella that cartwheels along the street with every gust: a pure function of the clock.
export function strayAt(world, t, out) {
  for (const gs of world.gusts) {
    const u = t - gs.t;
    if (u >= -0.1 && u < gs.dur + 2.4) {
      const x0 = gs.dir > 0 ? -5 : WX + 5, k = (u + 0.1) * 24;
      out.x = x0 + gs.dir * k;
      out.z = 15 + Math.sin(u * 1.3 + gs.t) * 3.2;
      out.h = 0.9 + Math.abs(Math.sin(u * 3.1)) * 1.6;
      out.rot = u * 9 * gs.dir;
      return out.x > -8 && out.x < WX + 8;
    }
    if (u < -0.1) break;
  }
  return false;
}

export function drawStray(g, v, s) {
  const S = v.S;
  g.save();
  g.translate(v.sx(s.x), v.sy(s.z, s.h));
  g.rotate(s.rot);
  g.scale(S * 0.8, S * 0.8);
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(-1.3, 0); g.quadraticCurveTo(0, -1.9, 1.3, 0);
  g.arc(0.65, 0, 0.65, 0, Math.PI); g.arc(-0.65, 0, 0.65, 0, Math.PI);
  g.closePath();
  g.fillStyle = C.white;
  g.fill();
  g.strokeStyle = C.ink;
  g.lineWidth = 0.1;
  g.stroke();
  g.lineWidth = 0.06;
  g.beginPath();
  for (const k of [-0.8, -0.3, 0.3, 0.8]) { g.moveTo(0, -1.2); g.lineTo(k * 1.3, -0.1); }
  g.moveTo(0, -1.2); g.lineTo(0, 1.6); g.lineTo(0.35, 1.9);
  g.stroke();
  g.restore();
}
