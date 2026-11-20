// THE DEEP — the HUD, drawn like a dive computer etched on the mask: a thin aqua reticle
// that drifts with your breathing (it is where the spear will go), hold-over marks for the
// drop and an air ring while you hold your breath, the gun's state, a bubble timer that
// teaches you your own tell, sonar contacts, the ping warning, and the first-time prompts.
import { clamp, lerp, rgba, TAU } from '../../kit.js';

const FONT = "'JetBrains Mono', Menlo, monospace";
const HEAD = "'Rajdhani', 'Futura', sans-serif";
const AQUA = '#bff6ee', WARN = '#ff8a6a';
const tmp = { x: 0, y: 0, behind: false };

export function drawOverlay(ctx, H, view, S, camera, project) {
  const g = ctx.g, w = ctx.width, h = ctx.height, phase = ctx.phase, ME = S.ME, FOE = S.FOE;
  const k = clamp(Math.min(w, h) / 720, 0.62, 1.35);
  const phone = h < 480;
  const safe = ctx.safe || { left: 0, right: 0, bottom: 0, top: 0 };
  const cx = w / 2, cy = h / 2;
  const focal = (h / 2) / Math.tan((camera.fov * Math.PI) / 360);
  g.save();
  g.lineCap = 'round';
  g.textBaseline = 'middle';
  const live = phase === 'live';
  const killing = phase === 'over';

  // ---- markers: a sonar contact, the rival during the arrival, sudden death
  const revealed = FOE.alive && (ctx.sudden || ctx.time < FOE.revealT || phase === 'intro');
  if (revealed && !killing) {
    project(FOE.x, FOE.y + 0.3, FOE.z, tmp);
    const dist = Math.hypot(FOE.x - ME.x, FOE.y - ME.y, FOE.z - ME.z);
    const label = phase === 'intro' ? `RIVAL · ${Math.round(dist)} M` : ctx.sudden ? `${Math.round(dist)} M` : `CONTACT · ${Math.round(dist)} M`;
    marker(g, tmp, w, h, FOE.color, label, k, 1, safe, phone);
  }
  // the ping warning: an arrow at the edge towards whoever pinged you
  const pg = H.ping;
  if (pg.a > 0 && !killing) {
    project(pg.x, pg.y, pg.z, tmp);
    const al = clamp(pg.a, 0, 1);
    edgeArrow(g, tmp, w, h, FOE.color, 'SONAR', k, al * (0.6 + 0.4 * Math.sin(pg.a * 18)), safe);
  }

  // ---- the reticle: where the spear will go, drifting with your breath
  if (ME.alive && !killing && !view.shot) {
    const z = view.zoom;
    const rx = cx - ME.swayX * focal, ry = cy - ME.swayY * focal;
    const loaded = ME.loaded && phase !== 'intro';
    const col = loaded ? AQUA : 'rgba(191,246,238,0.45)';
    g.strokeStyle = 'rgba(0,10,14,0.55)';
    g.lineWidth = 3.2 * k;
    ring(g, rx, ry, lerp(15, 9, z) * k, loaded);
    g.strokeStyle = col;
    g.lineWidth = 1.4 * k;
    ring(g, rx, ry, lerp(15, 9, z) * k, loaded);
    g.fillStyle = col;
    g.beginPath(); g.arc(rx, ry, 1.6 * k, 0, TAU); g.fill();
    // hold-over marks: where to put a target at 20 / 40 / 60 m so the spear's sink lands on it
    if (z > 0.05) {
      g.globalAlpha = z;
      g.font = `${Math.round(10 * k)}px ${FONT}`;
      g.textAlign = 'left';
      for (const d of [20, 40, 60]) {
        const t = -Math.log(1 - Math.min(0.95, (d * S.G.DRAG) / S.G.V0)) / S.G.DRAG;
        const drop = (S.G.GRAV / S.G.DRAG) * t - (S.G.GRAV / (S.G.DRAG * S.G.DRAG)) * (1 - Math.exp(-S.G.DRAG * t));
        const y = ry + Math.atan2(drop, d) * focal;
        const hw = (d === 40 ? 9 : 6) * k;
        g.strokeStyle = 'rgba(0,10,14,0.55)'; g.lineWidth = 3 * k;
        g.beginPath(); g.moveTo(rx - hw, y); g.lineTo(rx + hw, y); g.stroke();
        g.strokeStyle = AQUA; g.lineWidth = 1.2 * k;
        g.beginPath(); g.moveTo(rx - hw, y); g.lineTo(rx + hw, y); g.stroke();
        shadowText(g, String(d), rx + hw + 4 * k, y, AQUA);
      }
      g.globalAlpha = 1;
    }
    // the air ring: around the reticle while you hold your breath (or are short of air)
    if (ME.holding || ME.air < 0.99) {
      const r = lerp(30, 22, z) * k, a0 = Math.PI * 0.62, a1 = a0 + Math.PI * 0.76;
      const low = ME.air < 0.3;
      g.lineWidth = 5 * k;
      g.strokeStyle = 'rgba(0,10,14,0.5)';
      g.beginPath(); g.arc(rx, ry, r, a0, a1); g.stroke();
      g.lineWidth = 2.6 * k;
      g.strokeStyle = low ? WARN : ME.holdLock ? 'rgba(255,138,106,0.6)' : AQUA;
      g.beginPath(); g.arc(rx, ry, r, a1 - (a1 - a0) * ME.air, a1); g.stroke();
      g.font = `${Math.round(9 * k)}px ${FONT}`;
      g.textAlign = 'right';
      shadowText(g, ME.holdLock ? 'GASP' : 'AIR', rx - r - 5 * k, ry + r * 0.55, low ? WARN : AQUA);
    }
    // the gun: loaded, or the reload sweeping round on the right
    {
      const r = lerp(30, 22, z) * k, a0 = -Math.PI * 0.38, a1 = Math.PI * 0.38;
      const load = ME.loaded ? 1 : 1 - ME.reload / S.RELOAD;
      g.lineWidth = 5 * k; g.strokeStyle = 'rgba(0,10,14,0.5)';
      g.beginPath(); g.arc(rx, ry, r, a0, a1); g.stroke();
      g.lineWidth = 2.6 * k; g.strokeStyle = ME.loaded ? ME.color : 'rgba(191,246,238,0.8)';
      g.beginPath(); g.arc(rx, ry, r, a1 - (a1 - a0) * load, a1); g.stroke();
      g.font = `${Math.round(9 * k)}px ${FONT}`;
      g.textAlign = 'left';
      if (phase === 'live') shadowText(g, ME.loaded ? 'SPEAR' : 'RELOAD', rx + r + 5 * k, ry + r * 0.55, ME.loaded ? AQUA : 'rgba(191,246,238,0.7)');
    }
    // the bubble timer: three small bubbles that fill as your next breath out comes due
    if (live) {
      const bx = rx, by = ry + lerp(44, 36, z) * k + (z > 0.05 ? 22 * k * z : 0);
      const fill = ME.holding ? 0 : 1 - clamp(ME.exhaleT / 3.3, 0, 1), flash = S.breathed();
      for (let i = 0; i < 3; i++) {
        const x = bx + (i - 1) * 9 * k, on = fill > (i + 1) / 3.2;
        g.beginPath(); g.arc(x, by - (flash > 0 ? (0.9 - flash) * 14 * k * (1 + i * 0.3) : 0), (2.2 + i * 0.5) * k, 0, TAU);
        g.lineWidth = 1.2 * k;
        g.strokeStyle = ME.holding ? 'rgba(191,246,238,0.25)' : flash > 0 ? WARN : 'rgba(191,246,238,0.8)';
        g.stroke();
        if (on || flash > 0) { g.fillStyle = flash > 0 ? rgba(WARN, flash) : 'rgba(191,246,238,0.6)'; g.fill(); }
      }
      if (flash > 0 && !S.firstShot()) {
        g.font = `${Math.round(9 * k)}px ${FONT}`; g.textAlign = 'center';
        shadowText(g, 'YOUR BUBBLES SHOW WHERE YOU ARE', bx, by + 13 * k, rgba(WARN, Math.min(1, flash * 2)));
      }
    }
  }

  // ---- the dive computer: depth and air, low on the left (clear of the touch stick)
  if (!killing && !view.shot) {
    const x = 16 * k;
    const y = safe.bottom > 0 ? Math.min(h * 0.42, h - safe.bottom - 40 * k) : h - 46 * k;
    const depth = Math.max(0, -view.camera.position.y);
    g.textAlign = 'left';
    g.font = `600 ${Math.round(22 * k)}px ${HEAD}`;
    shadowText(g, `${depth.toFixed(1)}`, x, y, AQUA);
    const tw = g.measureText(`${depth.toFixed(1)}`).width;
    g.font = `${Math.round(10 * k)}px ${FONT}`;
    shadowText(g, 'M DEPTH', x + tw + 5 * k, y + 2 * k, 'rgba(191,246,238,0.75)');
    // air bar
    const bw = 86 * k, by = y + 16 * k;
    g.fillStyle = 'rgba(0,10,14,0.5)'; g.fillRect(x, by - 2 * k, bw, 4 * k);
    g.fillStyle = ME.air < 0.3 ? WARN : AQUA; g.fillRect(x, by - 1.5 * k, bw * ME.air, 3 * k);
  }

  // ---- notes and first-time prompts (bottom centre, above the thumbs)
  const baseY = h - Math.max(safe.bottom > 0 && phone ? safe.bottom + 8 : 0, 0) - (phone ? 26 : 64) * k;
  if (H.notes.a > 0 && !killing) {
    g.font = `600 ${Math.round(17 * k)}px ${HEAD}`;
    g.textAlign = 'center';
    shadowText(g, H.notes.text, cx, phone ? h * 0.3 : cy + 96 * k, rgba('#eafffb', Math.min(1, H.notes.a * 2)));
  }
  if (live && !S.firstShot() && ME.alive && !ME.bot) {
    const t = ctx.time, touch = ctx.input.device === 'touch', pad = ctx.input.device === 'gamepad';
    const tips = touch
      ? ['DRAG TO LOOK · SWIM WHERE YOU LOOK', 'TAP HOLD BREATH: STEADY AIM, ZOOM, NO BUBBLES', 'SPEARS SINK — AIM ABOVE A FAR TARGET']
      : pad
        ? ['LEFT STICK SWIMS WHERE YOU LOOK · A KICKS UP', 'HOLD LT — HOLD BREATH: STEADY AIM, NO BUBBLES', 'SPEARS SINK — AIM ABOVE A FAR TARGET']
        : ['WASD SWIMS WHERE YOU LOOK · SPACE KICKS UP', 'HOLD RIGHT MOUSE — HOLD BREATH: STEADY AIM, NO BUBBLES', 'SPEARS SINK — AIM ABOVE A FAR TARGET · SHIFT SONAR · E DECOY'];
    const i = t < 4.5 ? 0 : t < 10 ? 1 : 2;
    const a = Math.min(1, (t - [0, 4.5, 10][i]) * 2) * (i === 2 ? 1 : Math.min(1, ([4.5, 10][i] - t) * 2));
    g.font = `600 ${Math.round((phone ? 12 : 14) * k)}px ${HEAD}`;
    g.textAlign = 'center';
    const tw = g.measureText(tips[i]).width + 26 * k;
    const maxW = w - (safe.left + safe.right) - 20;
    const bx = clamp(cx, safe.left + tw / 2 + 10, w - safe.right - tw / 2 - 10);
    g.fillStyle = `rgba(2,16,22,${0.55 * a})`;
    roundRect(g, (phone ? Math.max(safe.left + 10, Math.min(bx, w - safe.right - 10) - Math.min(tw, maxW) / 2) : cx - tw / 2), baseY - 13 * k, Math.min(tw, phone ? maxW : tw), 26 * k, 13 * k);
    g.fill();
    shadowText(g, tips[i], phone ? Math.max(safe.left + 10 + Math.min(tw, maxW) / 2, Math.min(bx, w - safe.right - 10 - Math.min(tw, maxW) / 2)) : cx, baseY, rgba('#eafffb', a));
  }
  g.restore();
}

function ring(g, x, y, r, full) {
  // four arcs with gaps: a reticle that reads as a lens, not a target
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    g.beginPath(); g.arc(x, y, r, a - (full ? 0.55 : 0.3), a + (full ? 0.55 : 0.3)); g.stroke();
  }
}

function shadowText(g, s, x, y, col) {
  g.fillStyle = 'rgba(0,8,12,0.65)';
  g.fillText(s, x + 1, y + 1);
  g.fillStyle = col;
  g.fillText(s, x, y);
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// a bracket round an on-screen contact, or an arrow at the edge pointing to it
function marker(g, p, w, h, color, label, k, a, safe, phone) {
  const m = 30 * k;
  const on = !p.behind && p.x > m && p.x < w - m && p.y > m && p.y < h - m;
  g.globalAlpha = a;
  if (on) {
    const s = 14 * k;
    g.strokeStyle = 'rgba(0,10,14,0.6)'; g.lineWidth = 3.5 * k;
    brackets(g, p.x, p.y, s);
    g.strokeStyle = color; g.lineWidth = 1.8 * k;
    brackets(g, p.x, p.y, s);
    g.font = `600 ${Math.round(12 * k)}px ${HEAD}`;
    g.textAlign = 'center';
    shadowText(g, label, p.x, p.y - s - 10 * k, color);
  } else edgeArrow(g, p, w, h, color, label, k, a, safe);
  g.globalAlpha = 1;
}
function brackets(g, x, y, s) {
  const l = s * 0.55;
  g.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    g.moveTo(x + sx * s, y + sy * (s - l)); g.lineTo(x + sx * s, y + sy * s); g.lineTo(x + sx * (s - l), y + sy * s);
  }
  g.stroke();
}
function edgeArrow(g, p, w, h, color, label, k, a, safe) {
  let dx = p.x - w / 2, dy = p.y - h / 2;
  if (p.behind) { dx = -dx; dy = -dy; if (Math.abs(dx) + Math.abs(dy) < 1) dy = 1; }
  const ang = Math.atan2(dy, dx);
  const mx = w / 2 - 46 * k - (dx < 0 ? safe.left * 0.3 : safe.right * 0.3), my = h / 2 - 50 * k;
  const s = Math.min(mx / Math.max(1e-3, Math.abs(Math.cos(ang))), my / Math.max(1e-3, Math.abs(Math.sin(ang))));
  const x = w / 2 + Math.cos(ang) * s, y = h / 2 + Math.sin(ang) * s;
  g.save();
  g.globalAlpha = a;
  g.translate(x, y);
  g.rotate(ang);
  g.fillStyle = color;
  g.strokeStyle = 'rgba(0,10,14,0.6)';
  g.lineWidth = 3 * k;
  g.beginPath(); g.moveTo(12 * k, 0); g.lineTo(-6 * k, -8 * k); g.lineTo(-2 * k, 0); g.lineTo(-6 * k, 8 * k); g.closePath();
  g.stroke(); g.fill();
  g.restore();
  g.save();
  g.globalAlpha = a;
  g.font = `600 ${Math.round(11 * k)}px ${HEAD}`;
  g.textAlign = 'center';
  shadowText(g, label, x - Math.cos(ang) * 24 * k, y - Math.sin(ang) * 20 * k, color);
  g.restore();
}
