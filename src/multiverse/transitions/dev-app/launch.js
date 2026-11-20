// DEV-APP — everything drawn ON the preview pane and at the launch: the resize handles the
// pointer drags the old world by, the inspector tag pinned to the impact point, the
// placeholder snipers of the half-built scene, the app's splash screen, and the toast.
import { clamp, lerp, ease, rgba, mixHex, roundRect, contrastOn, TAU } from '../../kit.js';
import { MONO, DISPLAY, appIcon, dropShadow, softShadow, drawButton, fit, trunc, icoPlay } from './ui.js';

/** Selection outline + eight handles + a live size read-out: the old world as a layer being resized. */
export function drawHandles(g, th, R, S, a, corner, w, h) {
  if (a <= 0.01) return;
  g.save();
  g.globalAlpha = a;
  g.strokeStyle = th.brand;
  g.lineWidth = Math.max(1.5, 2 * S);
  const i = g.lineWidth / 2;
  g.strokeRect(R.x + i, R.y + i, R.w - i * 2, R.h - i * 2);
  const hs = Math.max(6, 8 * S);
  g.lineWidth = Math.max(1, 1.5 * S);
  for (let ix = 0; ix < 3; ix++) {
    for (let iy = 0; iy < 3; iy++) {
      if (ix === 1 && iy === 1) continue;
      const hx = clamp(R.x + (R.w * ix) / 2, hs / 2 + 1, w - hs / 2 - 1), hy = clamp(R.y + (R.h * iy) / 2, hs / 2 + 1, h - hs / 2 - 1);
      g.fillStyle = '#fff';
      g.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
      g.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
    }
  }
  // Size chip rides just inside the corner being dragged.
  const label = `${Math.round(R.w)} × ${Math.round(R.h)}`;
  g.font = `600 ${Math.max(9, 11.5 * S)}px ${MONO}`;
  const tw = g.measureText(label).width, cw = tw + 14 * S, ch = Math.max(16, 20 * S);
  const cx = clamp(corner.x + (corner.sx > 0 ? 22 * S : -22 * S - cw), 4, w - cw - 4), cy = clamp(corner.y - 30 * S - ch, 4, h - ch - 4);
  roundRect(g, cx, cy, cw, ch, th.hard ? 0 : 4 * S);
  g.fillStyle = th.brand;
  g.fill();
  g.fillStyle = th.brandText;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, cx + cw / 2, cy + ch / 2 + 0.5);
  g.restore();
}

/** Dev-tools style tag pinned to the impact point: what the build has to say about the loser. */
export function drawInspector(g, R, fx, fy, plan, color, k, del, gone, sc) {
  if (k <= 0.01 || gone >= 0.99) return;
  const x = R.x + fx * R.w, y = R.y + fy * R.h;
  const e = ease.outBack(clamp(k, 0, 1)), a = clamp(k * 2, 0, 1) * (1 - gone);
  const bw = 58 * sc * e, bh = 78 * sc * e;
  g.save();
  g.globalAlpha = a;
  // Marching-ants box around whoever was standing there.
  g.fillStyle = rgba(color, 0.13);
  g.fillRect(x - bw / 2, y - bh / 2, bw, bh);
  g.strokeStyle = color;
  g.lineWidth = Math.max(1, 1.6 * sc);
  g.setLineDash([5 * sc, 4 * sc]);
  g.strokeRect(x - bw / 2, y - bh / 2, bw, bh);
  g.setLineDash([]);
  // Tag
  const fs = Math.max(7.5, 12 * sc);
  const l1 = plan.L ? `sniper.${plan.L}` : 'round.result';
  const l2 = del ? 'deleted' : plan.L ? `eliminated${plan.how ? ' · ' + plan.how : ''}` : 'draw · nobody scored';
  g.font = `600 ${fs}px ${MONO}`;
  const w1 = g.measureText(l1).width;
  g.font = `400 ${fs * 0.88}px ${MONO}`;
  const w2 = g.measureText(l2).width;
  const tw = Math.max(w1, w2) + fs * 1.5, tH = fs * 3.25;
  const tx = clamp(x - tw / 2, R.x + 4, Math.max(R.x + 4, R.x + R.w - tw - 4));
  const above = y - bh / 2 - tH - 8 * sc > R.y + 2;
  const ty = above ? y - bh / 2 - tH - 8 * sc : y + bh / 2 + 8 * sc;
  softShadow(g, tx, ty, tw, tH, 4 * sc, 10 * sc, 0.3);
  roundRect(g, tx, ty, tw, tH, 4 * sc);
  g.fillStyle = '#12141b';
  g.fill();
  g.strokeStyle = color;
  g.lineWidth = Math.max(1, 1.3 * sc);
  g.stroke();
  // Notch pointing back at the box.
  g.beginPath();
  const nx = clamp(x, tx + 8 * sc, tx + tw - 8 * sc), ny = above ? ty + tH : ty;
  g.moveTo(nx - 5 * sc, ny);
  g.lineTo(nx, ny + (above ? 6 : -6) * sc);
  g.lineTo(nx + 5 * sc, ny);
  g.closePath();
  g.fillStyle = color;
  g.fill();
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.font = `600 ${fs}px ${MONO}`;
  g.fillStyle = color;
  g.fillText(l1, tx + fs * 0.75, ty + tH * 0.32);
  g.font = `400 ${fs * 0.88}px ${MONO}`;
  g.fillStyle = del ? '#ff6170' : '#c9cfdd';
  g.fillText(l2, tx + fs * 0.75, ty + tH * 0.7);
  g.restore();
}

/** One placeholder asset: dashed box, a cross, a name plate. */
function placeholder(g, R, x, y, name, color, k, fill) {
  if (k <= 0.01) return;
  const e = ease.outBack(clamp(k, 0, 1));
  const bw = R.w * 0.085 * e, bh = R.h * 0.3 * e, u = R.w / 560;
  const px = clamp(x, R.x + bw / 2 + 4, R.x + R.w - bw / 2 - 4), py = clamp(y, R.y + bh / 2 + 4, R.y + R.h - bh / 2 - 16 * u);
  g.fillStyle = rgba(color, 0.1 + 0.3 * fill);
  g.fillRect(px - bw / 2, py - bh / 2, bw, bh);
  g.strokeStyle = color;
  g.lineWidth = Math.max(1, 1.6 * u);
  g.setLineDash(fill > 0.5 ? [] : [5 * u, 3.5 * u]);
  g.strokeRect(px - bw / 2, py - bh / 2, bw, bh);
  g.setLineDash([]);
  g.globalAlpha = (1 - fill) * 0.8;
  g.lineWidth = Math.max(0.75, u);
  g.beginPath();
  g.moveTo(px - bw / 2, py - bh / 2); g.lineTo(px + bw / 2, py + bh / 2);
  g.moveTo(px + bw / 2, py - bh / 2); g.lineTo(px - bw / 2, py + bh / 2);
  g.stroke();
  g.globalAlpha = 1;
  const fs = Math.max(6.5, 10.5 * u);
  g.font = `600 ${fs}px ${MONO}`;
  const label = name, tw = g.measureText(label).width + fs, th2 = fs * 1.6;
  const lx = clamp(px - tw / 2, R.x + 2, R.x + R.w - tw - 2), ly = py + bh / 2 + 3 * u;
  g.fillStyle = color;
  g.fillRect(lx, ly, tw, th2);
  g.fillStyle = contrastOn(color);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, lx + tw / 2, ly + th2 / 2 + 0.5);
}

/** The half-built scene: both snipers as labelled placeholders, a camera chip naming the new perspective. */
export function drawScaffold(g, R, plan, to, fx, fy, kL, kW, fill, kCam) {
  g.save();
  g.beginPath();
  g.rect(R.x, R.y, R.w, R.h);
  g.clip();
  const u = R.w / 560;
  const wx = fx < 0.5 ? fx + 0.34 : fx - 0.34, wy = clamp(fy + 0.03, 0.3, 0.7);
  const ly = clamp(fy, 0.3, 0.7);
  placeholder(g, R, R.x + wx * R.w, R.y + wy * R.h, plan.W || 'PLAYER_1', plan.winColor, kW, fill);
  placeholder(g, R, R.x + fx * R.w, R.y + ly * R.h, plan.L || 'PLAYER_2', plan.loseColor, kL, fill);
  if (kCam > 0.01) {
    const e = ease.outCubic(clamp(kCam, 0, 1));
    const fs = Math.max(6.5, 10 * u);
    g.font = `600 ${fs}px ${MONO}`;
    const label = trunc(g, `camera: ${to.perspective || 'unknown'}`, R.w * 0.7);
    const tw = g.measureText(label).width + fs * 1.4, h = fs * 1.9;
    const x = R.x + 7 * u - (1 - e) * 20 * u, y = R.y + 7 * u;
    g.globalAlpha = e;
    roundRect(g, x, y, tw, h, 3 * u);
    g.fillStyle = rgba(to.palette.fg, 0.12);
    g.fill();
    g.strokeStyle = rgba(to.palette.fg, 0.4);
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = to.palette.fg;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(label, x + fs * 0.7, y + h / 2 + 0.5);
    g.globalAlpha = 1;
  }
  g.restore();
}

/** Build passed: a play mark breathing in the middle of the pane, in the new world's accent. */
export function drawReady(g, R, to, k, t) {
  if (k <= 0.01) return;
  const cx = R.x + R.w / 2, cy = R.y + R.h / 2, r = R.h * 0.13 * ease.outBack(clamp(k, 0, 1));
  const ac = to.palette.accent;
  for (let i = 0; i < 2; i++) {
    const p = (t * 1.6 + i * 0.5) % 1;
    g.strokeStyle = rgba(ac, (1 - p) * 0.5 * k);
    g.lineWidth = Math.max(1, R.h * 0.008);
    g.beginPath();
    g.arc(cx, cy, r * (1 + p * 1.3), 0, TAU);
    g.stroke();
  }
  g.fillStyle = rgba(to.palette.bg, 0.82 * k);
  g.beginPath();
  g.arc(cx, cy, r, 0, TAU);
  g.fill();
  g.strokeStyle = ac;
  g.lineWidth = Math.max(1.5, R.h * 0.012);
  g.stroke();
  g.fillStyle = ac;
  icoPlay(g, cx + r * 0.06, cy, r * 0.9);
}

/** The launched app's splash screen: the new world's own colours, and its name landing as the title. */
export function drawSplash(g, P, to, plan, ts, rad) {
  const pal = to.palette, cx = P.x + P.w / 2;
  g.save();
  roundRect(g, P.x, P.y, P.w, P.h, rad);
  g.clip();
  g.fillStyle = pal.bg;
  g.fillRect(P.x, P.y, P.w, P.h);
  const glow = g.createRadialGradient(cx, P.y + P.h * 0.5, 0, cx, P.y + P.h * 0.5, P.w * 0.6);
  glow.addColorStop(0, rgba(pal.accent, 0.34));
  glow.addColorStop(0.55, rgba(pal.accent, 0.08));
  glow.addColorStop(1, rgba(pal.accent, 0));
  g.fillStyle = glow;
  g.fillRect(P.x, P.y, P.w, P.h);
  // A scope's rings, faintly: whatever the app is, it is still about one clean shot.
  g.strokeStyle = rgba(pal.fg, 0.07);
  g.lineWidth = Math.max(1, P.w * 0.0018);
  const spin = ts * 0.25;
  for (let i = 1; i <= 3; i++) {
    g.beginPath();
    g.arc(cx, P.y + P.h * 0.5, P.h * (0.2 + i * 0.17) * (1 + 0.04 * Math.sin(ts * 2 + i)), spin * i, spin * i + TAU * 0.86);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(P.x + P.w * 0.06, P.y + P.h * 0.5); g.lineTo(P.x + P.w * 0.94, P.y + P.h * 0.5);
  g.moveTo(cx, P.y + P.h * 0.06); g.lineTo(cx, P.y + P.h * 0.94);
  g.stroke();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // Kicker
  const ka = ease.outCubic(clamp((ts - 0.1) / 0.3, 0, 1));
  const kick = `${plan.verb}  ·  ${to.perspective || ''}`.replace(/\s+·\s+$/, '');
  fit(g, kick, P.w * 0.8, Math.max(6, P.w * 0.024), (px) => `600 ${px}px ${MONO}`);
  g.fillStyle = rgba(pal.accent, ka);
  g.fillText(kick, cx, P.y + P.h * 0.3 - (1 - ka) * P.h * 0.02);
  // Name: drops in oversized and settles, with an accent echo behind it.
  const na = clamp(ts / 0.22, 0, 1), ns = lerp(1.22, 1, ease.outCubic(clamp(ts / 0.5, 0, 1)));
  const size = fit(g, to.name, P.w * 0.84, P.h * 0.24, (px) => `700 ${px}px ${DISPLAY}`);
  g.save();
  g.translate(cx, P.y + P.h * 0.485);
  g.scale(ns, ns);
  g.fillStyle = rgba(pal.accent, na * 0.9);
  g.fillText(to.name, size * 0.035, size * 0.045);
  g.fillStyle = rgba(pal.fg, na);
  g.fillText(to.name, 0, 0);
  g.restore();
  // Tagline
  if (to.tagline) {
    const ta = ease.outCubic(clamp((ts - 0.25) / 0.35, 0, 1));
    fit(g, to.tagline, P.w * 0.8, Math.max(6.5, P.w * 0.027), (px) => `500 ${px}px ${DISPLAY}`);
    g.fillStyle = rgba(pal.fg, 0.78 * ta);
    g.fillText(to.tagline, cx, P.y + P.h * 0.655);
  }
  // Launch bar
  const bw = P.w * 0.28, bh = Math.max(2, P.h * 0.012), bx = cx - bw / 2, by = P.y + P.h * 0.8;
  g.fillStyle = rgba(pal.fg, 0.16);
  g.fillRect(bx, by, bw, bh);
  g.fillStyle = pal.accent;
  g.fillRect(bx, by, bw * ease.inOutCubic(clamp((ts - 0.05) / 0.72, 0, 1)), bh);
  g.font = `400 ${Math.max(5.5, P.w * 0.017)}px ${MONO}`;
  g.fillStyle = rgba(pal.fg, 0.5);
  g.fillText('v0.0.1  ·  build 1', cx, by + bh + P.h * 0.045);
  g.restore();
}

/** "App launched: <name>" — slides down over the live world and leaves before the cut back. */
export function drawToast(g, th, w, h, plan, to, kin, kout, t) {
  if (kin <= 0 || kout >= 1) return;
  const s = clamp(Math.min(w / 1000, h / 600), 0.62, 1.3);
  const title = `${plan.toast.title}: ${to.name}`, ic = 40 * s;
  g.font = th.ui(15 * s, 700);
  // Wide enough for the name where the screen allows; fit() shrinks whatever is left over.
  const tw = Math.min(Math.max(360 * s, g.measureText(title).width + ic + 54 * s), w * 0.86), tH = Math.round(66 * s), m = 18 * s;
  const x = plan.toastSide === 'right' ? w - tw - m : (w - tw) / 2;
  const y = lerp(-tH - 30 * s, m, ease.outBack(clamp(kin, 0, 1))) - ease.inCubic(kout) * (tH + m + 30 * s);
  const r = th.hard ? 2 : 14 * s;
  g.save();
  g.globalAlpha = clamp(kin * 3, 0, 1) * (1 - ease.inQuad(kout));
  dropShadow(g, th, x, y, tw, tH, r, 30 * s, 0.34);
  roundRect(g, x, y, tw, tH, r);
  g.fillStyle = th.card;
  g.fill();
  g.strokeStyle = th.cardLine;
  g.lineWidth = th.hard ? Math.max(1.5, 2 * s) : 1;
  g.stroke();
  appIcon(g, th, x + 13 * s, y + (tH - ic) / 2, ic, t);
  const tx = x + 13 * s + ic + 12 * s, room = x + tw - tx - 14 * s;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  fit(g, title, room, 15 * s, (px) => th.ui(px, 700));
  g.fillStyle = th.cardText;
  g.fillText(title, tx, y + tH * 0.36);
  fit(g, plan.toast.sub, room, 12 * s, (px) => th.ui(px, 400));
  g.fillStyle = th.cardDim;
  g.fillText(plan.toast.sub, tx, y + tH * 0.66);
  // A hairline of the new world's accent along the foot.
  g.save();
  roundRect(g, x, y, tw, tH, r);
  g.clip();
  g.fillStyle = mixHex(to.palette.accent, th.card, 0.1);
  g.fillRect(x, y + tH - Math.max(2, 3 * s), tw, Math.max(2, 3 * s));
  g.restore();
  g.restore();
}

function star(g, cx, cy, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2, rr = i % 2 ? r * 0.46 : r;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
}

/**
 * The nag: a needy little card that slides up in the corner of the editor mid-build and
 * answers itself. kin / kout = 0..1 entrance and exit, act = 0..1 the widget doing its thing.
 */
export function drawNag(g, th, L, plan, kin, kout, act, t) {
  if (kin <= 0 || kout >= 1) return;
  const nag = plan.nag, ed = L.editor, s = Math.max(L.S, 0.6);
  const w = Math.min(268 * s, ed.w - 20 * s), h = Math.round((nag.kind === 'tip' ? 62 : 86) * s), m = 14 * s;
  const x = L.left ? ed.x + ed.w - w - m - (ed.w > 360 ? L.px(52) : 0) : ed.x + ed.w - w - m - (ed.w > 360 ? L.px(52) : 0);
  const y = ed.y + ed.h - h - m + (1 - ease.outBack(clamp(kin, 0, 1))) * (h + m * 2) + ease.inCubic(kout) * (h + m * 2);
  const r = th.hard ? 2 : 12 * s, done = act >= 1;
  g.save();
  g.beginPath();
  g.rect(ed.x, ed.y, ed.w, ed.h); // it lives inside the editor panel, and leaves through its floor
  g.clip();
  dropShadow(g, th, x, y, w, h, r, 26 * s, 0.3);
  roundRect(g, x, y, w, h, r);
  g.fillStyle = th.card;
  g.fill();
  g.strokeStyle = th.cardLine;
  g.lineWidth = th.hard ? Math.max(1.5, 2 * s) : 1;
  g.stroke();
  const ic = 28 * s, px = x + 12 * s;
  appIcon(g, th, px, y + 12 * s, ic, t);
  const tx = px + ic + 10 * s, room = x + w - tx - 12 * s;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  fit(g, nag.title, room, 13.5 * s, (p) => th.ui(p, 700));
  g.fillStyle = th.cardText;
  g.fillText(nag.title, tx, y + 19 * s);
  const sub = done && nag.done ? nag.done : nag.sub;
  fit(g, sub, room, 11.5 * s, (p) => th.ui(p, 400));
  g.fillStyle = done && nag.done ? (th.key === 'dark' ? th.ok : mixHex(th.ok, '#000000', 0.15)) : th.cardDim;
  g.fillText(sub, tx, y + 36 * s);
  if (nag.kind === 'stars') {
    // Five stars, awarded by nobody.
    for (let i = 0; i < 5; i++) {
      const k = clamp(act * 5.6 - i, 0, 1), pop = k > 0 && k < 1 ? 1 + 0.5 * Math.sin(k * Math.PI) : 1;
      star(g, tx + 9 * s + i * 22 * s, y + 62 * s, 8.5 * s * pop);
      if (k > 0) { g.fillStyle = '#ffb300'; g.fill(); } else { g.strokeStyle = th.cardDim; g.lineWidth = Math.max(1, 1.2 * s); g.stroke(); }
    }
  } else if (nag.kind === 'button') {
    const bw = Math.min(room, 104 * s), press = act > 0.55 && act < 1 ? Math.sin(((act - 0.55) / 0.45) * Math.PI) : 0;
    drawButton(g, th, tx, y + 50 * s, bw, 24 * s, { label: act >= 0.8 ? nag.labelB : nag.label, kind: 1, press, px: 11.5, s, dead: done ? 0.6 : 0 });
  }
  g.restore();
}
