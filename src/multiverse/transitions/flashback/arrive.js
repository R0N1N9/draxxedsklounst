// LIFE FLASH — the arrival. The white was a flashbulb: an instant photo lands on a table
// in the next world's colours, among the prints of the life we have just watched, and
// develops into the next world. Its caption is the world's name. Then we fall into it.
//
// The table is drawn here on the 2D layer with a hole where the picture is; the picture
// itself (ARRIVE_FRAG) is on the GL layer underneath.
import { seg, ease, lerp, TAU, rgba, shade, mixHex, luminance, contrastOn, roundRect, makeCanvas, fitText } from '../../kit.js';
import { PLAYER_COLORS } from '../../contract.js';
import { T } from './script.js';
import { HAND, PEN, OSD, layoutText } from './media.js';

/** When (after the white-out) the loose end of the film slaps round: shared with the sound cues. */
export const TAIL = [0.06, 0.2, 0.37, 0.58, 0.84];

export function makeArrival(ctx, plan) {
  const A = plan.arrive, pal = ctx.to.palette;
  const dark = luminance(pal.bg) < 0.25;
  // The table: the next world's ground, pulled a little towards its ink so prints sit on it.
  const table = dark ? mixHex(pal.bg, pal.fg, 0.07) : mixHex(pal.bg, '#000000', 0.08);
  const accentInk = luminance(pal.accent) > 0.5 ? shade(pal.accent, -0.55) : shade(pal.accent, -0.15);
  const score = [0, 1].map((i) => {
    const p = ctx.winner && ctx.winner.index === i ? ctx.winner : ctx.loser && ctx.loser.index === i ? ctx.loser : null;
    return { name: p ? p.name : ['AMBER', 'CYAN'][i], col: p ? p.color : PLAYER_COLORS[i], n: ctx.score[i] || 0 };
  });
  const labels = [
    { text: `ROUND ${String(ctx.round + 1).padStart(2, '0')} · ${ctx.to.perspective || 'A NEW DIMENSION'}`, bg: pal.accent, fg: contrastOn(pal.accent) },
    { score: true, bg: '#17181d', fg: '#f3efe4' },
  ];
  if (ctx.matchPoint) labels.push({ text: 'MATCH POINT', bg: '#d8402f', fg: '#fff6e8' });

  let thumbs = null;
  function ensureThumbs() {
    // The life we just watched, as prints: painted once, while the screen is still white.
    if (thumbs) return;
    thumbs = plan.cards.map((c) => {
      const { canvas, g } = makeCanvas(240, 180);
      try { c.paint(g, 240, 180, 0.8, 1.1, c.m); } catch { g.fillStyle = '#b9a98c'; g.fillRect(0, 0, 240, 180); }
      g.fillStyle = rgba(table, 0.42); // faded towards the table: they are the past now
      g.fillRect(0, 0, 240, 180);
      return canvas;
    });
  }

  /** Where the photo's picture is at time t: centre, picture height, rotation (CSS px, radians). */
  function pose(t, w, h, out) {
    const s0 = h * 0.46;
    const cx0 = w * (0.5 + A.ox), cy0 = h * 0.42;
    const kl = seg(t, T.land0, T.land1), drop = 1 - ease.outCubic(kl);
    const wob = Math.sin(kl * 9) * Math.exp(-kl * 5) * 0.06;
    const k = ease.inOutCubic(seg(t, T.push0, T.pushEnd));
    const s = s0 * Math.pow(h / s0, k), kc = (s - s0) / (h - s0);
    out.camX = lerp(cx0, w / 2, kc); out.camY = lerp(cy0, h / 2, kc); out.camRot = -A.rot * k; // the camera, without the photo's own fall
    out.cx = out.camX + drop * w * 0.04 * Math.sign(A.rot);
    out.cy = out.camY - drop * h * 0.95;
    out.s = s * (1 + drop * 0.45);
    out.rot = (A.rot + drop * A.spin + wob) * (1 - k);
    out.s0 = s0; out.cx0 = cx0; out.cy0 = cy0; out.k = k; out.drop = drop; out.cam = s / s0;
    return out;
  }

  function label(g, L, x, y, rot, px, k, w) {
    if (k <= 0) return;
    g.save();
    g.translate(x, y);
    g.rotate(rot + (1 - k) * 0.25);
    g.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k);
    g.globalAlpha = Math.min(1, k * 2);
    g.textBaseline = 'middle';
    let tw;
    if (L.score) {
      fitText(g, `${score[0].name}  ${score[0].n} – ${score[1].n}  ${score[1].name}`, w * 0.66, px, OSD);
      g.font = '700 ' + g.font;
      tw = g.measureText(`${score[0].name}  ${score[0].n} – ${score[1].n}  ${score[1].name}`).width;
    } else {
      fitText(g, L.text, w * 0.42, px, OSD);
      g.font = '700 ' + g.font;
      tw = g.measureText(L.text).width;
    }
    const bw = tw + px * 1.6, bh = px * 1.9;
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(-bw / 2 + px * 0.12, -bh / 2 + px * 0.16, bw, bh);
    g.fillStyle = L.bg;
    g.fillRect(-bw / 2, -bh / 2, bw, bh);
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.fillRect(-bw / 2, -bh / 2, bw, bh * 0.16);
    g.fillStyle = 'rgba(0,0,0,0.16)';
    g.fillRect(-bw / 2, bh * 0.36, bw, bh * 0.14);
    if (L.score) {
      // embossed tape: the names in their own colours either side of the count
      let x0 = -tw / 2;
      const parts = [[score[0].name + '  ', score[0].col], [`${score[0].n} – ${score[1].n}`, L.fg], ['  ' + score[1].name, score[1].col]];
      g.textAlign = 'left';
      for (const [s, c] of parts) { g.fillStyle = c; g.fillText(s, x0, px * 0.06); x0 += g.measureText(s).width; }
    } else {
      g.textAlign = 'center';
      g.fillStyle = L.fg;
      g.fillText(L.text, 0, px * 0.06);
    }
    g.restore();
  }

  const P = {};
  return {
    table, pose, ensureThumbs,
    raw: mixHex(mixHex(pal.bg, pal.accent, 0.3), '#8a8f8c', 0.45),          // undeveloped emulsion
    lo: mixHex(pal.bg, '#000000', dark ? 0.35 : 0.7), hi: mixHex(mixHex(pal.fg, pal.accent, 0.35), '#ffffff', 0.25),

    /** The 2D layer of act 3 at time t (t >= T.white). hasTo: the next world's picture exists. */
    draw(g, w, h, t, hasTo) {
      ensureThumbs();
      const aspect = w / h;
      pose(t, w, h, P);
      const pw = P.s * aspect, ph = P.s;
      if (P.k < 1) {
        // ---- the table -------------------------------------------------------------------------
        g.fillStyle = table;
        g.fillRect(0, 0, w, h);
        const pool = g.createRadialGradient(w * 0.5, h * 0.42, h * 0.1, w * 0.5, h * 0.5, Math.hypot(w, h) * 0.62);
        pool.addColorStop(0, rgba(mixHex(table, pal.accent, 0.22), 0.55));
        pool.addColorStop(0.5, rgba(table, 0));
        pool.addColorStop(1, rgba('#000000', dark ? 0.5 : 0.3));
        g.fillStyle = pool;
        g.fillRect(0, 0, w, h);
        // everything on it moves with the camera as we fall into the picture
        g.save();
        g.translate(P.camX, P.camY);
        g.rotate(P.camRot);
        g.scale(P.cam, P.cam);
        g.translate(-P.cx0, -P.cy0);
        const n = thumbs.length;
        for (let i = 0; i < n; i++) {
          const q = A.prints[i], a = A.ring + (i / n) * TAU + q.j;
          const kin = ease.outCubic(seg(t, T.flash0 - 0.25 + i * 0.05, T.flash0 + 0.5 + i * 0.05));
          const rx = w * 0.47 * q.r * (1 + (1 - kin) * 0.5), ry = h * 0.47 * q.r * (1 + (1 - kin) * 0.5);
          const x = w / 2 + Math.cos(a) * rx, y = h / 2 + Math.sin(a) * ry, s = h * q.s;
          g.save();
          g.translate(x, y);
          g.rotate(q.rot + (1 - kin) * 0.6 * (i & 1 ? 1 : -1));
          g.fillStyle = 'rgba(0,0,0,0.3)';
          g.fillRect(-s * 0.72 + s * 0.03, -s * 0.56 + s * 0.05, s * 1.44, s * 1.12);
          g.fillStyle = mixHex('#f1ebdc', table, 0.25);
          g.fillRect(-s * 0.72, -s * 0.56, s * 1.44, s * 1.12);
          g.drawImage(thumbs[i], -s * 0.66, -s * 0.5, s * 1.32, s * 0.99);
          g.restore();
        }
        // a note in the margin, and the labels
        const pwr = P.s0 * aspect, phr = P.s0, b = phr * 0.06;
        const nk = ease.outBack(seg(t, T.cap0 - 0.4, T.cap0 - 0.05));
        if (nk > 0) {
          // on a scrap of paper, so it reads on any table
          g.save();
          g.translate(P.cx0 - pwr * 0.26, P.cy0 - phr / 2 - b - h * 0.03);
          g.rotate(A.rot * 1.6 - 0.06);
          g.scale(nk, nk);
          const npx = fitText(g, A.note, pwr * 0.6, Math.max(12, h * 0.046), PEN);
          const tw = g.measureText(A.note).width, sw2 = tw + npx * 2.6, sh2 = npx * 1.9;
          g.fillStyle = 'rgba(0,0,0,0.3)';
          g.fillRect(-sw2 / 2 + npx * 0.12, -sh2 / 2 + npx * 0.16, sw2, sh2);
          g.fillStyle = '#efe6cf';
          g.beginPath();
          g.moveTo(-sw2 / 2, -sh2 / 2); g.lineTo(sw2 / 2, -sh2 / 2 + npx * 0.08);
          for (let i = 0; i <= 6; i++) g.lineTo(sw2 / 2 - (i & 1 ? npx * 0.12 : 0), -sh2 / 2 + (sh2 * i) / 6); // torn edge
          g.lineTo(-sw2 / 2 + npx * 0.05, sh2 / 2);
          g.closePath(); g.fill();
          g.textAlign = 'left'; g.textBaseline = 'middle';
          g.fillStyle = '#27324f';
          g.fillText(A.note, -sw2 / 2 + npx * 0.6, 0);
          const ax = -sw2 / 2 + npx * 0.9 + tw;
          g.strokeStyle = '#27324f'; g.lineWidth = Math.max(1.5, npx * 0.09); g.lineCap = 'round';
          g.beginPath(); g.moveTo(ax, -npx * 0.1); g.quadraticCurveTo(ax + npx * 0.7, -npx * 0.2, ax + npx * 0.9, npx * 0.45);
          g.moveTo(ax + npx * 0.9, npx * 0.45); g.lineTo(ax + npx * 0.55, npx * 0.2); g.moveTo(ax + npx * 0.9, npx * 0.45); g.lineTo(ax + npx * 1.15, npx * 0.1); g.stroke();
          g.restore();
        }
        g.restore();
      }

      // ---- the photo ----------------------------------------------------------------------------
      const b = ph * 0.06, bot = ph * 0.3;
      g.save();
      g.translate(P.cx, P.cy);
      g.rotate(P.rot);
      const bx = -pw / 2 - b, by = -ph / 2 - b, bw = pw + 2 * b, bh = ph + b + bot;
      if (P.k < 1) {
        const lift = P.drop * h * 0.2 + ph * 0.025;
        for (let i = 3; i >= 1; i--) {
          g.fillStyle = `rgba(0,0,0,${0.14 * (1 - P.drop * 0.6)})`;
          roundRect(g, bx + lift * 0.4 - i * lift * 0.2, by + lift - i * lift * 0.2, bw + i * lift * 0.4, bh + i * lift * 0.4, ph * 0.012 + i * lift * 0.2);
          g.fill();
        }
        g.fillStyle = '#f5f1e6';
        roundRect(g, bx, by, bw, bh, ph * 0.012);
        g.fill();
        const sh = g.createLinearGradient(0, ph / 2, 0, ph / 2 + bot);
        sh.addColorStop(0, 'rgba(110,100,80,0)'); sh.addColorStop(1, 'rgba(110,100,80,0.16)');
        g.fillStyle = sh;
        g.fillRect(bx, ph / 2, bw, bot);
        // the window onto the GL layer
        g.globalCompositeOperation = 'destination-out';
        g.fillStyle = '#000';
        g.fillRect(-pw / 2, -ph / 2, pw, ph);
        g.globalCompositeOperation = 'source-over';
        g.strokeStyle = 'rgba(30,26,20,0.3)'; g.lineWidth = Math.max(1, ph * 0.004);
        g.strokeRect(-pw / 2, -ph / 2, pw, ph);
        // the caption: the next world's name, written while the picture comes up
        const ck = seg(t, T.cap0, T.cap1);
        if (ck > 0 && hasTo) {
          const lay = layoutText(g, P, 'cap', ctx.to.name, pw * 0.94, bot * 0.52, HAND, 1);
          const tw = g.measureText(lay.lines[0]).width, cy = ph / 2 + bot * 0.42;
          g.save();
          g.beginPath(); g.rect(-tw / 2 - lay.px, cy - lay.px, (tw + lay.px * 2) * ease.inOutSine(ck), lay.px * 2); g.clip();
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillStyle = '#1d2233';
          g.fillText(lay.lines[0], 0, cy);
          g.restore();
          const sk = seg(t, T.cap1 - 0.15, T.cap1 + 0.25);
          if (sk > 0) {
            g.globalAlpha = sk;
            g.textBaseline = 'middle';
            const tag = ctx.to.tagline || '';
            if (tag) {
              fitText(g, tag, pw * 0.7, bot * 0.17, PEN);
              g.textAlign = 'left';
              g.fillStyle = 'rgba(60,64,80,0.9)';
              g.fillText(tag, -pw / 2 + b * 0.1, ph / 2 + bot * 0.82);
            }
            g.font = `${bot * 0.17}px ${PEN}`;
            g.textAlign = 'right';
            g.fillStyle = accentInk;
            g.fillText(A.when, pw / 2 - b * 0.1, ph / 2 + bot * 0.82);
            g.globalAlpha = 1;
          }
        }
        // tape in the next world's accent
        const tk = ease.outBack(seg(t, T.land1 + 0.05, T.land1 + 0.3));
        if (tk > 0) {
          g.save();
          g.translate(pw * 0.18 * -A.labelSide, by);
          g.rotate(-0.12 * A.labelSide);
          g.scale(tk, 1);
          g.fillStyle = rgba(pal.accent, 0.82);
          g.fillRect(-pw * 0.1, -b * 0.8, pw * 0.2, b * 1.6);
          g.fillStyle = 'rgba(255,255,255,0.2)';
          g.fillRect(-pw * 0.1, -b * 0.8, pw * 0.2, b * 0.35);
          g.restore();
        }
      }
      g.restore();

      // ---- label tape, stuck down over everything --------------------------------------------------
      if (P.k < 1 && t > T.cap1 - 0.1) {
        const pwr = P.s0 * aspect, phr = P.s0, b0 = phr * 0.06, bot0 = phr * 0.3;
        g.save();
        g.translate(P.camX, P.camY);
        g.rotate(P.camRot);
        g.scale(P.cam, P.cam);
        g.translate(-P.cx0, -P.cy0);
        const lpx = Math.max(9, Math.min(h * 0.03, w * 0.02));
        const ly = P.cy0 + phr / 2 + bot0 + h * 0.045;
        label(g, labels[0], P.cx0 - A.labelSide * pwr * 0.2, ly, A.labelRot[0], lpx, ease.outBack(seg(t, T.cap1 - 0.1, T.cap1 + 0.2)), w);
        label(g, labels[1], lerp(P.cx0, w / 2, 0.5) + A.labelSide * pwr * 0.08, ly + lpx * 2.1, A.labelRot[1], lpx, ease.outBack(seg(t, T.cap1 + 0.08, T.cap1 + 0.38)), w);
        // match point goes on the corner the note left free
        if (labels[2]) label(g, labels[2], P.cx0 + pwr / 2 + b0 * 0.2, P.cy0 - phr / 2 - b0 * 0.6, 0.16 + A.labelRot[2], lpx * 1.15, ease.outBack(seg(t, T.cap1 + 0.22, T.cap1 + 0.5)), w);
        g.restore();
      }

      // ---- the flash, decaying --------------------------------------------------------------------
      const fa = hasTo ? 1 - ease.outCubic(seg(t, T.flash0, T.flash1)) : 1;
      if (fa > 0.002) {
        g.fillStyle = rgba(mixHex('#ffffff', pal.accent, 0.5 * (1 - fa)), fa);
        g.fillRect(0, 0, w, h);
        // the tail of the film slaps through the empty gate: a shadow crosses the bare lamp
        for (let i = 0; i < TAIL.length; i++) {
          const k = (t - T.white - TAIL[i]) / 0.085;
          if (k <= 0 || k >= 1) continue;
          const y = lerp(-h * 0.3, h, k), sg = g.createLinearGradient(0, y, 0, y + h * 0.3);
          sg.addColorStop(0, 'rgba(60,40,20,0)'); sg.addColorStop(0.5, `rgba(60,40,20,${0.22 * fa * (1 - 0.15 * i)})`); sg.addColorStop(1, 'rgba(60,40,20,0)');
          g.fillStyle = sg;
          g.fillRect(0, y, w, h * 0.3);
        }
      }
    },
  };
}
