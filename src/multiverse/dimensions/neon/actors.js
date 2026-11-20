// The cast: snipers, their holograms and afterimages, the laser sight, and the in-world UI
// that hangs off the local sniper (capacitor ring, ability pips, reticle, warnings).
// World space throughout, except reticle().
import { TAU, clamp, clamp01, lerp, ease } from '../../kit.js';
import { R, RELOAD } from './world.js';
import { HOT, INK, PINK } from './style.js';

export function makeActors({ ctx, g, S, world, view, cols, glow, line, label, toScreen }) {
  const P = S.P;
  const scr = { x: 0, y: 0 };
  const names = [ctx.players[0].name, ctx.players[1].name];
  let lostN = -1, lostText = '', rangeText = '';
  let readyAt = -9, wasEmpty = false;

  const circle = (x, y, r) => {
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.stroke();
  };

  // One sniper, seen from above: round where the arena is angular, a long rail out front
  // and a cloak of light streaming out behind. reloadK: 1 = just fired … 0 = charged.
  // holo = a hologram (your own decoy, an afterimage).
  function sniper(x, y, a, col, alpha, vx, vy, recoil, reloadK, holo) {
    const px = 1 / view.k, kick = recoil * 6;
    const sp = Math.hypot(vx, vy), run = Math.min(1, sp / 255);
    // The cloak trails away from the run (from the aim when standing), and flutters.
    let tx = -Math.cos(a), ty = -Math.sin(a);
    if (sp > 40) {
      tx = lerp(tx, -vx / sp, 0.8 * run);
      ty = lerp(ty, -vy / sp, 0.8 * run);
      const n = Math.hypot(tx, ty) || 1;
      tx /= n;
      ty /= n;
    }
    const nx = -ty, ny = tx, len = R * (1.75 + 1.1 * run);
    const wob = Math.sin(S.t * (5 + 7 * run) + x * 0.031 + y * 0.017) * R * (0.14 + 0.3 * run);
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(x + nx * R * 0.9, y + ny * R * 0.9);
    g.quadraticCurveTo(x + tx * len * 0.6 + nx * (R * 0.62 + wob), y + ty * len * 0.6 + ny * (R * 0.62 + wob), x + tx * len + nx * wob * 1.7, y + ty * len + ny * wob * 1.7);
    g.quadraticCurveTo(x + tx * len * 0.6 - nx * (R * 0.62 - wob), y + ty * len * 0.6 - ny * (R * 0.62 - wob), x - nx * R * 0.9, y - ny * R * 0.9);
    g.closePath();
    g.fillStyle = g.strokeStyle = col;
    if (holo) g.setLineDash([4, 3.5]);
    else { g.globalAlpha = alpha * 0.3; g.fill(); }
    g.globalAlpha = alpha * 0.85;
    g.lineWidth = Math.max(1.6, 1.2 * px);
    g.stroke();

    g.save();
    g.translate(x, y);
    if (sp > 40) { // lean into the run
      const va = Math.atan2(vy, vx), st = 1 + 0.14 * run;
      g.rotate(va);
      g.scale(st, 1 / st);
      g.rotate(-va);
    }
    g.rotate(a);
    g.lineCap = 'round';
    g.globalAlpha = alpha;
    g.strokeStyle = col;
    g.lineWidth = Math.max(4.6, 2.7 * px);
    line(R * 0.3 - kick, 0, R * 2.35 - kick, 0);
    g.strokeStyle = HOT; // the rail glows white while there is a charge behind it
    g.globalAlpha = alpha * (reloadK > 0 ? 0.22 : 0.95);
    g.lineWidth = Math.max(1.6, px);
    line(R - kick, 0, R * 2.35 - kick, 0);
    g.globalAlpha = alpha;
    g.strokeStyle = col;
    g.lineWidth = Math.max(2.4, 1.5 * px);
    line(R * 2.35 - kick, -5, R * 2.35 - kick, 5);
    const bx = -kick * 0.4;
    if (!holo) {
      g.fillStyle = INK;
      g.beginPath();
      g.arc(bx, 0, R, 0, TAU);
      g.fill();
      g.fillStyle = col;
      g.globalAlpha = alpha * 0.5;
      g.fill();
      g.globalAlpha = alpha;
    }
    g.lineWidth = Math.max(3, 2 * px);
    circle(bx, 0, R - 1.4);
    g.strokeStyle = HOT; // visor
    g.lineWidth = Math.max(2.8, 1.6 * px);
    g.beginPath();
    g.arc(bx, 0, R * 0.5, -0.85, 0.85);
    g.stroke();
    g.strokeStyle = col; // three capacitor cells on the back refill as the rail recharges
    g.lineWidth = Math.max(2.4, 1.5 * px);
    for (let i = 0; i < 3; i++) {
      const aa = Math.PI + (i - 1) * 0.62;
      g.globalAlpha = alpha * ((1 - reloadK) * 3 > i + 0.5 ? 1 : 0.25);
      g.beginPath();
      g.arc(bx, 0, R * 0.55, aa - 0.2, aa + 0.2);
      g.stroke();
    }
    g.restore();
    g.setLineDash([]); // after the restore: the dash was set before the save
    g.globalAlpha = 1;
  }

  function lit(x, y, col, a) {
    g.globalCompositeOperation = 'lighter';
    glow(x, y, R * 3.6, col, a);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  // Four corner ticks around something worth pointing at.
  function bracket(x, y, half, col, alpha) {
    const px = 1 / view.k, n = half * 0.38;
    g.strokeStyle = col;
    g.globalAlpha = alpha;
    g.lineWidth = Math.max(1.6, 1.2 * px);
    g.lineCap = 'butt';
    g.beginPath();
    for (let i = 0; i < 4; i++) {
      const sx = i & 1 ? 1 : -1, sy = i & 2 ? 1 : -1;
      g.moveTo(x + sx * half, y + sy * (half - n));
      g.lineTo(x + sx * half, y + sy * half);
      g.lineTo(x + sx * (half - n), y + sy * half);
    }
    g.stroke();
    g.globalAlpha = 1;
  }

  // Sudden death: nobody hides.
  function beacon(p, col) {
    const px = 1 / view.k, r = R + 15 + 5 * Math.sin(S.t * 8);
    g.strokeStyle = col;
    g.globalAlpha = 0.75;
    g.lineWidth = Math.max(2, 1.5 * px);
    circle(p.x, p.y, r);
    g.globalAlpha = 0.3;
    circle(p.x, p.y, r + 9);
    g.globalAlpha = 1;
  }

  /** The enemy and everything of theirs that needs a line of sight: drawn UNDER the dark. */
  function hidden() {
    const me = P[ctx.me], foe = P[1 - ctx.me], col = cols[foe.i];
    const lifted = ctx.phase !== 'live' || ctx.sudden;
    for (let i = 0; i < S.echoes.length; i++) {
      const e = S.echoes[i];
      if (!e.live || e.owner === ctx.me) continue;
      if (!lifted && !world.solids.los(me.x, me.y, e.x, e.y)) continue;
      const a = Math.pow(1 - e.age / e.life, 1.5);
      lit(e.x, e.y, col, 0.35 * a);
      sniper(e.x, e.y, e.a, col, 0.75 * a, 0, 0, 0, 0, true);
    }
    for (let i = 0; i < S.decoys.length; i++) {
      const d = S.decoys[i];
      if (d.owner === ctx.me) continue;
      const a = d.vis * (d.alive ? 1 : 1 - d.fade / 0.4);
      if (a < 0.02) continue;
      lit(d.x, d.y, col, 0.5 * a); // to the enemy, a decoy is a sniper
      sniper(d.x, d.y, d.a, col, a, d.vx, d.vy, 0, 0, false);
      if (ctx.sudden) beacon(d, col);
    }
    if (foe.alive && S.vis > 0.02) {
      lit(foe.x, foe.y, col, 0.5 * S.vis);
      sniper(foe.x, foe.y, foe.a, col, S.vis, foe.vx, foe.vy, foe.recoil, foe.reload > 0 ? foe.reload / RELOAD : 0, false);
      if (ctx.sudden) beacon(foe, col);
    }
  }

  /** Where they were last seen, and how long ago. Drawn on top of the dark. */
  function ghost() {
    const gh = S.ghost;
    if (!gh.on) return;
    const age = S.t - gh.t;
    if (age > 4) return;
    const a = 1 - age / 4, col = cols[1 - ctx.me], px = 1 / view.k;
    g.strokeStyle = col;
    g.lineWidth = Math.max(1.4, px);
    g.globalAlpha = 0.7 * a;
    g.setLineDash([4, 4]);
    circle(gh.x, gh.y, R);
    line(gh.x + Math.cos(gh.a) * R, gh.y + Math.sin(gh.a) * R, gh.x + Math.cos(gh.a) * R * 2.3, gh.y + Math.sin(gh.a) * R * 2.3);
    g.setLineDash([]);
    bracket(gh.x, gh.y, R + 9 + 10 * Math.max(0, 1 - age * 4), col, 0.8 * a);
    const n = Math.floor(age * 10);
    if (n !== lostN) { lostN = n; lostText = `LOST ${(n / 10).toFixed(1)}`; }
    label(lostText, gh.x, gh.y + R + 22, 9, col, 0.85 * a);
  }

  /** A laser sight, bounce included. The caller sets the additive composite mode. */
  function laser(l, col, locked) {
    if (l.l1 < R * 2.5) return;
    const px = 1 / view.k, a = Math.atan2(l.y1 - l.y0, l.x1 - l.x0);
    g.lineCap = 'butt';
    g.lineJoin = 'round';
    g.strokeStyle = col;
    g.beginPath();
    g.moveTo(l.x0 + Math.cos(a) * R * 2.4, l.y0 + Math.sin(a) * R * 2.4);
    g.lineTo(l.x1, l.y1);
    if (l.n === 3) g.lineTo(l.x2, l.y2);
    g.globalAlpha = 0.15;
    g.lineWidth = Math.max(8, 5 * px);
    g.stroke();
    g.globalAlpha = 0.45;
    g.lineWidth = Math.max(1.3, px);
    g.stroke();
    g.setLineDash([18, 10]);
    g.lineDashOffset = -S.t * 160;
    g.globalAlpha = 0.95;
    g.lineWidth = Math.max(1.9, 1.3 * px);
    g.stroke();
    g.setLineDash([]);
    if (l.n === 3) glow(l.x1, l.y1, 16, col, 0.9);
    const ex = l.n === 3 ? l.x2 : l.x1, ey = l.n === 3 ? l.y2 : l.y1;
    glow(ex, ey, locked ? 34 : 20, col, 1);
    glow(ex, ey, locked ? 14 : 8, HOT, 1);
    g.globalAlpha = 1;
  }

  // The local sniper's own instruments: capacitor ring, ability pips.
  function instruments(me, col) {
    const px = 1 / view.k, rr = R + 9;
    if (me.reload > 0) wasEmpty = true;
    else if (wasEmpty) { wasEmpty = false; readyAt = S.t; }
    g.strokeStyle = col;
    g.lineCap = 'butt';
    if (me.reload > 0) {
      g.globalAlpha = 0.22;
      g.lineWidth = Math.max(1.2, px);
      circle(me.x, me.y, rr);
      g.globalAlpha = 0.95;
      g.lineWidth = Math.max(2.6, 1.7 * px);
      g.beginPath();
      g.arc(me.x, me.y, rr, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - me.reload / RELOAD));
      g.stroke();
    } else {
      const pop = clamp01(1 - (S.t - readyAt) / 0.3);
      g.globalAlpha = 0.5 + 0.5 * pop;
      g.lineWidth = Math.max(1.3, px) * (1 + pop);
      g.setLineDash([7, 5]);
      g.lineDashOffset = -S.t * 12;
      circle(me.x, me.y, rr + pop * 7 - (me.focus ? 2.5 : 0));
      g.setLineDash([]);
    }
    // BLINK (diamond) and DECOY (ring): lit when they are yours to use.
    const py = me.y + rr + 10;
    for (let i = 0; i < 2; i++) {
      const x = me.x + (i ? 9 : -9), ready = (i ? me.decoyCd : me.blinkCd) <= 0;
      g.strokeStyle = g.fillStyle = PINK;
      g.globalAlpha = ready ? 1 : 0.3;
      g.lineWidth = Math.max(1.2, px);
      g.beginPath();
      if (i) g.arc(x, py, 3.4, 0, TAU);
      else { g.moveTo(x, py - 4.4); g.lineTo(x + 4.4, py); g.lineTo(x, py + 4.4); g.lineTo(x - 4.4, py); g.closePath(); }
      if (ready) g.fill();
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  // From the hip: where the barrel points right now, and a bracket for how far it wanders.
  function hipAim(me, col) {
    const px = 1 / view.k, m0 = R * 2.8, c = Math.cos(me.a), s = Math.sin(me.a), far = 230;
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = col;
    g.lineCap = 'round';
    g.lineWidth = Math.max(1.7, 1.2 * px);
    for (let i = 0; i < 4; i++) {
      g.globalAlpha = 0.62 - i * 0.14;
      line(me.x + c * (m0 + i * 46), me.y + s * (m0 + i * 46), me.x + c * (m0 + i * 46 + 30), me.y + s * (m0 + i * 46 + 30));
    }
    g.lineCap = 'butt';
    g.lineWidth = Math.max(1.3, px);
    g.globalAlpha = 0.6;
    g.beginPath();
    g.arc(me.x, me.y, far, me.aim - me.sway, me.aim + me.sway);
    g.stroke();
    for (let k = -1; k <= 1; k += 2) {
      const aa = me.aim + k * me.sway;
      line(me.x + Math.cos(aa) * (far - 7), me.y + Math.sin(aa) * (far - 7), me.x + Math.cos(aa) * (far + 7), me.y + Math.sin(aa) * (far + 7));
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  function tag(p, text, col, alpha) {
    if (alpha <= 0.01) return;
    bracket(p.x, p.y, R + 14, col, alpha);
    label(text, p.x, p.y + R + 34, 11, col, alpha);
  }

  /** The local sniper and everything that is always seen. Drawn on top of the dark. */
  function shown() {
    const me = P[ctx.me], foe = P[1 - ctx.me], col = cols[me.i], px = 1 / view.k;
    const live = ctx.phase === 'live', t = S.t;

    for (let i = 0; i < S.echoes.length; i++) {
      const e = S.echoes[i];
      if (!e.live || e.owner !== ctx.me) continue;
      sniper(e.x, e.y, e.a, col, 0.7 * Math.pow(1 - e.age / e.life, 1.5), 0, 0, 0, 0, true);
    }
    for (let i = 0; i < S.decoys.length; i++) { // your own decoy reads as a hologram: you are not fooled
      const d = S.decoys[i];
      if (d.owner !== ctx.me) continue;
      const a = (d.alive ? 1 : 1 - d.fade / 0.4) * (0.6 + 0.25 * Math.sin(t * 31 + d.id));
      lit(d.x, d.y, col, 0.25 * a);
      sniper(d.x, d.y, d.a, col, a, d.vx, d.vy, 0, 0, true);
      label('DECOY', d.x, d.y - R - 14, 8, col, a * 0.9 * clamp01((t - d.born - 0.35) * 4));
    }

    if (S.kill) { // what is left of the loser, and a halo for the winner
      const kl = S.kill, kt = kl.t, vc = cols[kl.victim], w = P[kl.winner];
      const a = clamp01(1 - kt / 0.8);
      g.strokeStyle = vc;
      g.lineWidth = Math.max(1.6, 1.2 * px);
      g.globalAlpha = a;
      g.setLineDash([3, 5]);
      circle(kl.x, kl.y, R + kt * 70);
      g.setLineDash([]);
      g.strokeStyle = HOT;
      g.globalAlpha = clamp01(1.4 - kt);
      line(kl.x - 7, kl.y - 7, kl.x + 7, kl.y + 7);
      line(kl.x - 7, kl.y + 7, kl.x + 7, kl.y - 7);
      g.globalCompositeOperation = 'lighter';
      glow(w.x, w.y, 80 + 30 * Math.sin(kt * 14), cols[w.i], 0.5);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      bracket(w.x, w.y, R + 12 + 4 * Math.sin(kt * 14), cols[w.i], 0.9);
    }

    if (me.alive) {
      if (live && !me.focus) hipAim(me, col);
      lit(me.x, me.y, col, 0.6);
      sniper(me.x, me.y, me.a, col, 1, me.vx, me.vy, me.recoil, me.reload / RELOAD, false);
      if (ctx.phase !== 'over') instruments(me, col);
      if (ctx.sudden) beacon(me, col);
      if (S.painted > 0.02) { // their laser is on you
        const pa = S.painted, fc = cols[foe.i];
        g.strokeStyle = fc;
        g.lineWidth = Math.max(2.2, 1.6 * px);
        g.globalAlpha = pa * (0.55 + 0.45 * Math.sin(t * 22));
        for (let i = 0; i < 2; i++) {
          g.beginPath();
          g.arc(me.x, me.y, R + 17, t * 7 + i * Math.PI, t * 7 + i * Math.PI + 1.5);
          g.stroke();
        }
        label('PAINTED', me.x, me.y - R - 27, 9, fc, pa);
      }
    }
    if (S.lock && foe.alive) bracket(foe.x, foe.y, R + 8, HOT, 0.9); // your laser is on them
    const na = t - S.note.t;
    if (na < 1.2) { // that was not them
      const a = clamp01(na * 9) * clamp01((1.2 - na) * 2.5);
      bracket(S.note.x, S.note.y, R + 8 + na * 14, cols[foe.i], a * 0.8);
      label('HOLOGRAM', S.note.x, S.note.y - R - 16 - na * 14, 10, cols[foe.i], a);
    }

    // Introductions: who is who, and how far apart.
    if (ctx.phase === 'intro' && S.introT >= 0) {
      const u = S.introT, a = clamp01(u / 0.4);
      tag(me, 'YOU', col, a);
      tag(foe, names[foe.i], cols[foe.i], a);
      const k = ease.inOutCubic(clamp01((u - 0.7) / 1.3));
      if (k > 0) {
        g.strokeStyle = HOT;
        g.globalAlpha = 0.4;
        g.lineWidth = Math.max(1.2, px);
        g.setLineDash([3, 9]);
        line(me.x, me.y - 60, lerp(me.x, foe.x, k), lerp(me.y, foe.y, k) - 60);
        g.setLineDash([]);
        line(me.x, me.y - 68, me.x, me.y - 52);
        if (k >= 1) {
          line(foe.x, foe.y - 68, foe.x, foe.y - 52);
          if (!rangeText) rangeText = `RANGE ${Math.round(Math.hypot(foe.x - me.x, foe.y - me.y) / 10)} M`;
          label(rangeText, (me.x + foe.x) / 2, (me.y + foe.y) / 2 - 76, 10, HOT, 0.8);
        }
        g.globalAlpha = 1;
      }
    } else if (live && me.alive && S.liveT < 2.6) tag(me, 'YOU', col, clamp01(2.6 - S.liveT));
  }

  /**
   * Desktop reticle, in screen space: the ring is how far the barrel can wander at that
   * range, the pip is where the round would cross it right now. Put the pip on them.
   */
  function reticle() {
    const me = P[ctx.me], inp = ctx.input;
    if (inp.device !== 'kbm' || !me.alive || ctx.phase === 'over' || (ctx.phase === 'intro' && S.introT < 0)) return;
    const mx = inp.pointerX, my = inp.pointerY;
    toScreen(me.x, me.y, scr);
    const d = Math.hypot(mx - scr.x, my - scr.y), rr = clamp(d * me.sway, 4, 90);
    const dim = me.reload > 0 ? 0.4 : 1;
    g.strokeStyle = HOT;
    g.lineWidth = 1.2;
    g.globalAlpha = 0.6 * dim;
    g.beginPath();
    g.arc(mx, my, rr, 0, TAU);
    g.stroke();
    g.beginPath();
    for (let i = 0; i < 4; i++) {
      const c = Math.cos(i * TAU / 4), s = Math.sin(i * TAU / 4);
      g.moveTo(mx + c * (rr + 4), my + s * (rr + 4));
      g.lineTo(mx + c * (rr + 11), my + s * (rr + 11));
    }
    g.stroke();
    const ax = scr.x + Math.cos(me.a) * d, ay = scr.y + Math.sin(me.a) * d;
    g.fillStyle = cols[me.i];
    g.globalAlpha = dim;
    g.beginPath();
    g.moveTo(ax, ay - 4.5);
    g.lineTo(ax + 4.5, ay);
    g.lineTo(ax, ay + 4.5);
    g.lineTo(ax - 4.5, ay);
    g.closePath();
    g.fill();
    g.strokeStyle = HOT;
    g.lineWidth = 1;
    g.stroke();
    g.globalAlpha = 1;
  }

  return { hidden, ghost, laser, shown, reticle };
}
