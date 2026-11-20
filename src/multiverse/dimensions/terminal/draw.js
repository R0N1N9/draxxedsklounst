// TTY DUEL — everything you see: the fogged map, the machinery, rays, snipers, the console
// and the kill, all drawn as flat text on the scene canvas, then handed to the CRT.
import { clamp, roundRect, noise2, makeCanvas, TAU } from '../../kit.js';
import { COLS, ROWS, CH, W, H } from './world.js';
import { FONT, fitLayout, sizeLayer, renderLayer } from './look.js';
import { RAY_CH, AIM_CH, rayChar } from './fx.js';
import { makeCrt } from './crt.js';

export const BULLET_SPEED = 100, LINGER = 1.35, PING_SPEED = 75, PING_LIFE = 2.1;
const fmt = (n) => Math.max(0, Math.round(n));

export function makeView(ctx, world, S, pal, term) {
  const crt = makeCrt(pal);
  const L = fitLayout({}, 1280, 720, false);
  const Y = { canvas: document.createElement('canvas'), masked: document.createElement('canvas'), sc: 1, g: null, mg: null, ver: -1, font: false };
  Y.g = Y.canvas.getContext('2d');
  Y.mg = Y.masked.getContext('2d');
  const mask = makeCanvas(COLS, ROWS), maskImg = mask.g.createImageData(COLS, ROWS);
  const cur = new Float32Array(COLS * ROWS).fill(0.2), mem = new Uint8Array(COLS * ROWS);
  const halos = new Map();
  const tmp = { x: 0, y: 0 }, tmp2 = { x: 0, y: 0 };
  let sizeKey = '', frame = 0, fontCheck = 0, layerDirty = true;
  const myCol = ctx.players[ctx.me].color, foeCol = ctx.players[1 - ctx.me].color;
  const colOf = (i) => ctx.players[i].color;
  const V = { L, crt };
  let mx = 0, my = 0, u = 1;

  const X = (x) => mx + x * u, Yp = (y) => my + y * u;
  V.X = X; V.Y = Yp;

  V.fit = () => {
    const w = ctx.width, h = ctx.height, touch = ctx.input.device === 'touch';
    const key = `${w}x${h}|${ctx.dpr}|${touch}`;
    if (key === sizeKey) return false;
    sizeKey = key;
    fitLayout(L, w, h, touch);
    mx = L.mx; my = L.my; u = L.u;
    crt.size(w, h, ctx.dpr);
    sizeLayer(Y, L, crt.rs);
    layerDirty = true;
    return true;
  };
  V.dirty = () => { layerDirty = true; };

  /** The pointer, in world units (undoing the glass's curve and the layout). */
  V.pointerUnits = (out) => {
    crt.unproject(ctx.input.pointerX, ctx.input.pointerY, tmp2);
    out.x = (tmp2.x - mx) / u; out.y = (tmp2.y - my) / u;
    return out;
  };

  // ---- fog of war: what is lit now, what is remembered, what was only ever a blueprint ----
  V.fog = (dt) => {
    const vis = S.vis, k = Math.min(1, dt * 16), lit = 1 - S.fog;
    const d = maskImg.data;
    for (let i = 0; i < COLS * ROWS; i++) {
      if (vis[i]) mem[i] = 1;
      let t = vis[i] ? 0.55 + 0.45 * (vis[i] / 255) : mem[i] ? 0.4 : 0.2;
      t += (0.92 - t) * lit;
      cur[i] += (t - cur[i]) * k;
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255;
      d[i * 4 + 3] = Math.round(cur[i] * 255);
    }
    mask.g.putImageData(maskImg, 0, 0);
  };

  const halo = (col) => {
    let h = halos.get(col);
    if (!h) {
      h = makeCanvas(64, 64);
      const gr = h.g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, col);
      gr.addColorStop(0.35, col + '55');
      gr.addColorStop(1, col + '00');
      h.g.fillStyle = gr;
      h.g.fillRect(0, 0, 64, 64);
      halos.set(col, h);
    }
    return h.canvas;
  };

  // ---- drawing helpers (g is the scene context in CSS px) ----
  let g = null;
  const font = (px, weight = 500) => { g.font = `${weight} ${px}px ${FONT}`; };
  const txt = (ch, x, y) => g.fillText(ch, x, y);
  const cellText = (ch, c, r) => g.fillText(ch, X(c + 0.5), Yp(r * CH + 1));
  const cellAlpha = (c, r) => (c >= 0 && r >= 0 && c < COLS && r < ROWS ? cur[r * COLS + c] : 0);

  function drawMap() {
    if (layerDirty || Y.ver !== world.gridVersion()) {
      renderLayer(Y, L, world, pal);
      Y.ver = world.gridVersion();
      layerDirty = false;
    }
    const mg = Y.mg, w = Y.masked.width, h = Y.masked.height;
    mg.globalCompositeOperation = 'copy';
    mg.drawImage(Y.canvas, 0, 0);
    mg.globalCompositeOperation = 'destination-in';
    mg.imageSmoothingEnabled = false;
    mg.drawImage(mask.canvas, 0, 0, COLS, ROWS, 0, 0, w, h);
    mg.globalCompositeOperation = 'source-over';
    g.drawImage(Y.masked, mx, my, L.mw, L.mh);
  }

  // Machinery: doors (the gap, the slab, a blinking warning) and the sweepers (moving cover).
  function drawMachinery() {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const fs = u * 1.45;
    for (const d of world.doors) {
      const a = cellAlpha(d.c0, d.r);
      font(fs, 700);
      g.fillStyle = pal.hi;
      g.globalAlpha = Math.max(0.25, a);
      cellText('▌', d.c0 - 0.0, d.r); // the jambs stay put whether the slab is out or in
      cellText('▐', d.c1, d.r);
      if (d.rect.w > 0.15) {
        const warn = d.e < 1;
        g.globalAlpha = Math.max(0.3, a) * (warn ? 0.95 : 1);
        g.fillStyle = pal.warn;
        g.fillRect(X(d.rect.x), Yp(d.rect.y), d.rect.w * u, d.rect.h * u);
        g.globalAlpha *= 0.9;
        g.fillStyle = pal.ink;
        for (let c = d.c0; c < d.c0 + d.rect.w - 0.4; c++) cellText(((c + d.r) & 1) ? '▒' : '░', c, d.r);
      }
      if (d.warn && ((S.t * 6) | 0) % 2 === 0) {
        g.globalAlpha = 1;
        g.fillStyle = pal.warn;
        font(fs * 1.1, 700);
        txt('!', X((d.c0 + d.c1 + 1) / 2), Yp(d.r * CH - 0.8));
      }
    }
    for (const s of world.sweepers) {
      const c0 = Math.floor(s.x), a = cellAlpha(Math.min(COLS - 1, c0 + 2), s.i ? 22 : 1);
      if (a < 0.45) continue;
      const r0 = s.i ? 21 : 1;
      g.globalAlpha = Math.min(1, a);
      g.fillStyle = pal.hi;
      g.fillRect(X(s.x), Yp(s.rect.y), s.rect.w * u, s.rect.h * u);
      g.fillStyle = pal.ink;
      font(fs, 700);
      for (let rr = 0; rr < 2; rr++) for (let c = 0; c < 4; c++) cellText(c === 1 && rr === 0 ? 'G' : c === 2 && rr === 0 ? 'C' : (rr ? ((c + (S.t * 4 | 0)) & 1 ? '▚' : '▞') : '▓'), c0 + c, r0 + rr);
      // the arrows ahead of it are the warning
      g.fillStyle = pal.warn;
      font(fs, 700);
      const lead = s.dir > 0 ? s.x + s.rect.w + 1.2 : s.x - 1.2;
      for (let k = 0; k < 3; k++) {
        g.globalAlpha = Math.min(1, a) * (1 - k * 0.28) * (0.55 + 0.45 * Math.sin(S.t * 9 - k));
        txt(s.dir > 0 ? '›' : '‹', X(lead + s.dir * k * 1.3), Yp(s.rect.y + 2));
      }
    }
    g.globalAlpha = 1;
  }

  function drawShrink() {
    if (world.shrinkAmount() <= 0) return;
    g.fillStyle = pal.warn;
    font(u * 1.4, 600);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const r of world.shrinkRects) {
      g.globalAlpha = 0.16;
      g.fillRect(X(r.x), Yp(r.y), r.w * u, r.h * u);
      g.globalAlpha = 0.7;
      // the edge of the deleted area: a hatched rim
      const horiz = r.w > r.h;
      if (horiz) { const y = r.y < H / 2 ? r.y + r.h : r.y; for (let c = Math.floor(r.x); c < r.x + r.w; c++) txt(((c + (S.t * 5 | 0)) & 1) ? '▒' : '░', X(c + 0.5), Yp(y)); } else { const x = r.x < W / 2 ? r.x + r.w : r.x; for (let rr = 0; rr < ROWS; rr++) txt(((rr + (S.t * 5 | 0)) & 1) ? '▒' : '░', X(x), Yp(rr * CH + 1)); }
    }
    g.globalAlpha = 1;
  }

  function drawPings() {
    for (const pg of S.pings) {
      const r = (S.t - pg.t0) * PING_SPEED;
      if (r > 130) continue;
      const col = colOf(pg.owner), fade = clamp(1 - r / 130, 0, 1);
      g.fillStyle = col;
      font(u * 1.5, 700);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const n = Math.min(150, Math.floor(r * 1.5) + 10);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + pg.rot, x = pg.x + Math.cos(a) * r, y = pg.y + Math.sin(a) * r;
        if (x < 0.5 || y < 0.5 || x > W - 0.5 || y > H - 0.5) continue;
        g.globalAlpha = fade * (k % 3 === 0 ? 0.95 : 0.5);
        txt(k % 3 === 0 ? 'o' : '·', X(Math.floor(x) + 0.5), Yp(Math.floor(y / CH) * CH + 1));
      }
      g.globalAlpha = fade * 0.5;
      g.strokeStyle = col;
      g.lineWidth = 1;
      g.beginPath();
      g.arc(X(pg.x), Yp(pg.y), Math.max(0.1, r * u), 0, TAU);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  // The barrel's line: a stub always, a long rangefinder line while you hold your breath.
  function drawAim(p, col, local) {
    const tr = world.trace(p.x, p.y, p.a, p.aimPath);
    const hold = p.hold;
    const max = hold ? 95 : local ? 11 : 4;
    let lc = -1, lr = -1, dist = 0, tickN = 0;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = col;
    font(u * 1.45, hold ? 700 : 500);
    const legs = tr.bounce && hold ? 2 : 1;
    for (let leg = 0; leg < legs; leg++) {
      const x0 = leg ? tr.x1 + tr.n1x * 0.03 : p.x, y0 = leg ? tr.y1 + tr.n1y * 0.03 : p.y;
      const x1 = leg ? tr.x2 : tr.x1, y1 = leg ? tr.y2 : tr.y1;
      const len = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / (len || 1), uy = (y1 - y0) / (len || 1), k = rayChar(ux, uy);
      for (let d = leg ? 0.4 : 2.3; d <= len && dist + d < max; d += 0.6) {
        const x = x0 + ux * d, y = y0 + uy * d, c = Math.floor(x), r = Math.floor(y / CH);
        if (c === lc && r === lr) continue;
        lc = c; lr = r;
        const t = (dist + d) / max;
        let a = local ? (hold ? 0.95 : 0.55) : hold ? 0.5 : 0.7;
        a *= (leg ? 0.5 : 1) * (1 - t * t * 0.7);
        if (!local && S.fog > 0.5 && cellAlpha(c, r) < 0.55) continue; // the enemy's line shows only where you can see
        g.globalAlpha = a;
        cellText(hold || d < 4 ? AIM_CH[k] : '·', c, r);
        // rangefinder ticks every ten units
        if (hold && local && leg === 0 && Math.floor((dist + d) / 10) > tickN) {
          tickN = Math.floor((dist + d) / 10);
          g.globalAlpha = 0.95;
          g.fillStyle = pal.hi;
          font(u * 1.05, 700);
          const side = Math.abs(uy) > Math.abs(ux) ? 1.4 : 0, up = side ? 0 : -1.6;
          txt(String(tickN * 10), X(x) / 1 + side * u, Yp(y) + up * u);
          g.fillStyle = col;
          font(u * 1.45, 700);
        }
      }
      dist += len;
      if (leg === 0 && tr.hit1 && dist < max) {
        g.globalAlpha = hold ? 1 : 0.7;
        g.fillStyle = pal.hi;
        font(u * 1.7, 700);
        txt('+', X(tr.x1), Yp(tr.y1));
        g.fillStyle = col;
        font(u * 1.45, 700);
      }
    }
    g.globalAlpha = 1;
  }

  function drawBullet(b) {
    const col = colOf(b.owner), cl = b.cells, n = cl.n;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    font(u * 1.75, 700);
    if (b.age < 0.28) { // the instant: the whole route in one pale stroke
      g.globalAlpha = (1 - b.age / 0.28) * 0.5;
      g.strokeStyle = col;
      g.lineWidth = Math.max(1, u * 0.3);
      g.lineCap = 'round';
      const p = b.path, hs = Math.min(b.s, p.l1);
      g.beginPath();
      g.moveTo(X(p.x0), Yp(p.y0));
      g.lineTo(X(p.x0 + (p.x1 - p.x0) * (hs / (p.l1 || 1))), Yp(p.y0 + (p.y1 - p.y0) * (hs / (p.l1 || 1))));
      if (p.bounce && b.s > p.l1) g.lineTo(X(p.x1 + (p.x2 - p.x1) * ((b.s - p.l1) / (p.l2 || 1))), Yp(p.y1 + (p.y2 - p.y1) * ((b.s - p.l1) / (p.l2 || 1))));
      g.stroke();
    }
    for (let i = 0; i < n; i++) {
      if (cl.s[i] > b.s) break;
      const age = b.age - cl.s[i] / BULLET_SPEED;
      let a = 1 - clamp(age / LINGER, 0, 1);
      a *= a;
      if (a < 0.03) continue;
      const hot = b.s - cl.s[i] < 5 && !b.done;
      g.globalAlpha = a;
      g.fillStyle = hot ? '#ffffff' : age < 0.18 ? pal.hi : col;
      cellText(RAY_CH[cl.k[i]], cl.c[i], cl.r[i]);
    }
    const p = b.path;
    if (!b.done) {
      const hx = b.s <= p.l1 ? p.x0 + (p.x1 - p.x0) * (b.s / (p.l1 || 1)) : p.x1 + (p.x2 - p.x1) * ((b.s - p.l1) / (p.l2 || 1));
      const hy = b.s <= p.l1 ? p.y0 + (p.y1 - p.y0) * (b.s / (p.l1 || 1)) : p.y1 + (p.y2 - p.y1) * ((b.s - p.l1) / (p.l2 || 1));
      g.globalAlpha = 1;
      g.fillStyle = '#ffffff';
      font(u * 2.3, 700);
      txt('●', X(hx), Yp(hy));
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.8;
      g.drawImage(halo(col), X(hx) - u * 3, Yp(hy) - u * 3, u * 6, u * 6);
      g.globalCompositeOperation = 'source-over';
    }
    g.globalAlpha = 1;
  }

  // A sniper: a plate of colour with an '@' cut out of it, a barrel of '=' in front.
  function drawSniper(p, a, mode, label) {
    const col = colOf(p.i), x = X(p.x), y = Yp(p.y), ux = Math.cos(p.a), uy = Math.sin(p.a);
    const kick = p.recoil || 0, sq = 1 + kick * 0.16;
    const w = 2.3 * u * sq, h = 2.3 * u / sq;
    const gx = x - ux * kick * u * 0.7, gy = y - uy * kick * u * 0.7;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = a * (0.32 + 0.1 * Math.sin(S.t * 4 + p.i));
    g.drawImage(halo(col), gx - u * 3.6, gy - u * 3.6, u * 7.2, u * 7.2);
    g.globalCompositeOperation = 'source-over';
    // barrel
    g.fillStyle = col;
    font(u * 1.7, 700);
    const k = rayChar(ux, uy);
    for (let i = 0; i < 3; i++) {
      g.globalAlpha = a * (1 - i * 0.22);
      cellText(RAY_CH[k], Math.floor(p.x + ux * (2 + i * 1.05)), Math.floor((p.y + uy * (2 + i * 1.05)) / CH));
    }
    g.globalAlpha = a;
    if (mode === 'blip') {
      // heard, not seen: a hollow plate that breathes
      g.strokeStyle = col;
      g.lineWidth = Math.max(1.2, u * 0.2);
      g.globalAlpha = a * (0.65 + 0.35 * Math.sin(S.t * 14));
      roundRect(g, gx - w / 2, gy - h / 2, w, h, u * 0.35);
      g.stroke();
      g.fillStyle = col;
      font(u * 2.1, 700);
      txt('@', gx, gy + u * 0.1);
    } else {
      g.fillStyle = col;
      roundRect(g, gx - w / 2, gy - h / 2, w, h, u * 0.35);
      g.fill();
      g.fillStyle = pal.ink;
      font(u * 2.15, 800);
      txt('@', gx, gy + u * 0.1);
    }
    g.globalAlpha = a;
    if (p.i === ctx.me && !p.decoy && mode !== 'dead') {
      // you: corner brackets that tick in and out, and a marker over your head
      const pad = u * (1.75 + 0.18 * Math.sin(S.t * 5)), s = u * 0.7;
      g.strokeStyle = pal.hi;
      g.lineWidth = Math.max(1, u * 0.14);
      g.beginPath();
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        g.moveTo(gx + sx * pad, gy + sy * (pad - s));
        g.lineTo(gx + sx * pad, gy + sy * pad);
        g.lineTo(gx + sx * (pad - s), gy + sy * pad);
      }
      g.stroke();
      g.fillStyle = pal.hi;
      font(u * 1.5, 700);
      txt('▾', gx, gy - u * (3 + 0.4 * Math.sin(S.t * 6)));
    }
    if (label) {
      g.fillStyle = col;
      font(Math.max(8, u * 1.1), 700);
      txt(label, gx, gy + u * 3.1);
    }
    g.globalAlpha = 1;
  }

  function drawDead(p, kill) {
    const col = colOf(p.i), x = X(p.x), y = Yp(p.y), t = kill.t;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = col;
    // the plate flickers apart, then settles as a lowercase x
    if (t < 0.45) {
      const j = (S.t * 40 | 0) % 3;
      g.globalAlpha = 0.9;
      font(u * 2.4, 800);
      txt(['@', '#', '%'][j], x + (Math.random() - 0.5) * u * 0.8, y + (Math.random() - 0.5) * u * 0.6);
    }
    g.globalAlpha = 1;
    font(u * 3.2, 800);
    txt('x', x, y);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.5 * (1 - clamp(t / 2, 0, 1));
    g.drawImage(halo(col), x - u * 6, y - u * 6, u * 12, u * 12);
    g.globalCompositeOperation = 'source-over';
    // an expanding ring of dots: the shockwave
    const r = t * 55;
    g.fillStyle = col;
    font(u * 1.4, 600);
    g.globalAlpha = clamp(1 - t * 1.1, 0, 1);
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * TAU;
      txt('·', x + Math.cos(a) * r * u * 0.55, y + Math.sin(a) * r * u * 0.3 * 1.0);
    }
    g.globalAlpha = 1;
  }

  function drawParts() {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const pool = S.parts.pool;
    for (let pass = 0; pass < 2; pass++) {
      font(u * (pass ? 1.9 : 1.2), 700);
      for (let i = 0; i < pool.length; i++) {
        const q = pool[i];
        if (!q.live || q.big !== !!pass) continue;
        g.globalAlpha = 1 - q.age / q.life;
        g.fillStyle = q.col;
        txt(q.ch, X(q.x), Yp(q.y));
      }
    }
    g.globalAlpha = 1;
  }

  // Footprints of whoever was last seen, the lingering '?'.
  function drawGhost() {
    const gh = S.ghost;
    if (!gh.on) return;
    const age = S.t - gh.t, a = clamp(1 - age / 5, 0, 1);
    if (a <= 0) return;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = foeCol;
    font(u * 2, 700);
    g.globalAlpha = a * 0.55 * (0.6 + 0.4 * Math.sin(S.t * 5));
    txt('?', X(gh.x), Yp(gh.y));
    g.globalAlpha = 1;
  }

  // ---- the console row's status line, and the in-world HUD around you ----
  function status() {
    const me = S.P[ctx.me];
    const bar = (f, n) => { let s = ''; const k = Math.round(clamp(f, 0, 1) * n); for (let i = 0; i < n; i++) s += i < k ? '▮' : '▯'; return s; };
    const rl = me.reload > 0 ? 1 - me.reload / S.RELOAD : 1;
    const br = me.breath;
    const ping = me.pingCd > 0 ? `${Math.ceil(me.pingCd)}s` : 'rdy';
    const fork = me.forkCd > 0 ? `${Math.ceil(me.forkCd)}s` : 'rdy';
    const maxCh = Math.floor((L.cx1 - L.cx0) / (L.cf * 0.6)) - 16;
    if (maxCh >= 58) return `rifle ${bar(rl, 5)}  breath ${bar(br, 5)}  ping ${ping}  fork ${fork}`;
    if (maxCh >= 44) return `rifle ${bar(rl, 4)} breath ${bar(br, 4)} p:${ping} f:${fork}`;
    return `${bar(rl, 3)} ${bar(br, 3)} ${ping}`;
  }

  function drawConsole() {
    term.draw(g, L, myCol, foeCol, L.compact);
    const s = status();
    g.font = `600 ${L.cf}px ${FONT}`;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    g.fillStyle = pal.mid;
    g.globalAlpha = 0.9;
    g.fillText(s, L.cx1, L.cy1 - L.lineH / 2);
    g.globalAlpha = 1;
  }

  function drawReticle() {
    if (ctx.input.device !== 'kbm' || ctx.phase !== 'live' || ctx.autopilot) return;
    const me = S.P[ctx.me];
    if (!me.alive) return;
    V.pointerUnits(tmp);
    const px = X(tmp.x), py = Yp(tmp.y), hold = me.hold;
    const s = u * (hold ? 1.35 : 2.4) * (1 + 0.2 * Math.sin(S.t * 8));
    g.strokeStyle = me.reload > 0 ? pal.lo : pal.hi;
    g.lineWidth = Math.max(1, u * 0.16);
    g.globalAlpha = 0.95;
    g.beginPath();
    const q = u * 0.75;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      g.moveTo(px + sx * s, py + sy * (s - q)); g.lineTo(px + sx * s, py + sy * s); g.lineTo(px + sx * (s - q * 1.4), py + sy * s);
    }
    g.stroke();
    const d = Math.hypot(tmp.x - me.x, tmp.y - me.y);
    g.fillStyle = pal.hi;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    font(Math.max(9, u * 1.2), 700);
    g.fillText(String(fmt(d)), px + s + u * 0.8, py - s * 0.2);
    g.globalAlpha = 1;
  }

  function drawKillText() {
    const k = S.kill;
    if (!k) return;
    const w = ctx.width, h = ctx.height;
    const a = 'SEGMENTATION FAULT', b = '(core dumped)';
    const na = clamp(Math.floor(k.typed), 0, a.length), nb = clamp(Math.floor(k.typed - a.length - 3), 0, b.length);
    const fs = Math.min(w * 0.062, 70, (w - 40) / (a.length * 0.62));
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const cy = h * 0.5 + (L.compact ? 6 : 0);
    // a darkened bar behind it so it reads over any picture
    g.globalAlpha = clamp(k.typed / 6, 0, 0.82);
    g.fillStyle = pal.bg;
    g.fillRect(0, cy - fs * 0.95, w, fs * 2.5);
    g.globalAlpha = 1;
    font(fs, 800);
    g.fillStyle = pal.hi;
    const jx = k.t < 1.2 ? (Math.random() - 0.5) * 4 : 0;
    g.fillText(a.slice(0, na), w / 2 + jx, cy);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.45;
    g.fillStyle = colOf(k.victim);
    g.fillText(a.slice(0, na), w / 2 + jx + fs * 0.03, cy + fs * 0.02);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    if (nb > 0) {
      font(fs * 0.45, 600);
      g.fillStyle = pal.mid;
      g.fillText(b.slice(0, nb), w / 2, cy + fs * 0.85);
    }
    // the dump itself, rolling past under the banner
    if (k.typed > 8) {
      font(Math.max(9, fs * 0.2), 500);
      g.fillStyle = pal.lo;
      g.textAlign = 'center';
      for (let i = 0; i < 3; i++) {
        let line = '0x7ffe' + ((k.seed + i * 7919) >>> 0).toString(16).padStart(8, '0').slice(0, 6);
        for (let j = 0; j < 8; j++) line += ' ' + (((k.seed * (j + 3 + i) + (S.t * 20 | 0)) >>> 0) & 255).toString(16).padStart(2, '0');
        g.globalAlpha = 0.6 - i * 0.15;
        g.fillText(line, w / 2, cy + fs * 1.35 + i * fs * 0.3);
      }
      g.globalAlpha = 1;
    }
  }

  function drawMargins() {
    const m = L.mx;
    if (m < 46 || L.compact) return;
    g.fillStyle = pal.lo;
    font(Math.max(8, L.cf * 0.85), 500);
    g.textBaseline = 'middle';
    g.globalAlpha = 0.22;
    const rows = Math.floor((L.mh) / (L.cf * 1.5));
    for (let side = 0; side < 2; side++) {
      g.textAlign = side ? 'left' : 'right';
      const x = side ? L.mx + L.mw + 8 : L.mx - 8;
      for (let i = 0; i < rows; i++) {
        const k = i + Math.floor(S.t * 2.2) * (side ? -1 : 1);
        const h1 = ((k * 2654435761) >>> 0), h2 = ((k * 40503 + 7) >>> 0);
        const s = side ? `${(h1 & 0xffff).toString(16).padStart(4, '0')} ${(h2 & 255).toString(16).padStart(2, '0')}` : `${(h2 & 255).toString(16).padStart(2, '0')} ${(h1 & 0xffff).toString(16).padStart(4, '0')}`;
        g.fillText(s, x, L.my + (i + 0.5) * (L.mh / rows));
      }
    }
    g.globalAlpha = 1;
  }

  // Unlit cells never sit still: stray bits flicker in the dark (pure decoration).
  const bits = [];
  for (let i = 0; i < 26; i++) bits.push({ c: 0, r: 0, ch: '0', t: -1 });
  function drawBits() {
    if (S.fog < 0.2) return;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    font(u * 1.3, 500);
    g.fillStyle = pal.mid;
    for (const b of bits) {
      if (S.t > b.t) {
        b.t = S.t + 0.25 + Math.random() * 1.1;
        b.c = 1 + ((Math.random() * (COLS - 2)) | 0);
        b.r = 1 + ((Math.random() * (ROWS - 2)) | 0);
        b.ch = '01abcdef7#:'[(Math.random() * 11) | 0];
      }
      const i = b.r * COLS + b.c;
      if (world.grid[i] || S.vis[i]) continue;
      g.globalAlpha = 0.16 + 0.12 * Math.sin(S.t * 9 + b.c);
      cellText(b.ch, b.c, b.r);
    }
    g.globalAlpha = 1;
  }

  // The monitor's housekeeping: now and then a band of static crawls down the map (decoration only).
  function drawStatic() {
    const ph = (S.t % 19) / 1.8;
    if (ph >= 1 || S.fog < 0.2) return;
    const row = Math.floor(ph * (ROWS + 4)) - 2;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    font(u * 1.3, 700);
    g.fillStyle = pal.hi;
    for (let r = row; r < row + 2; r++) {
      if (r < 0 || r >= ROWS) continue;
      g.globalAlpha = r === row ? 0.45 : 0.18;
      for (let c = 0; c < COLS; c += 1) if (((c * 7 + r * 13 + (S.t * 30 | 0)) % 5) < 2) cellText('▒░#:.'[(c + r + (S.t * 30 | 0)) % 5], c, r);
    }
    g.globalAlpha = 1;
  }

  V.render = () => {
    if (!crt.ready) return;
    V.fit();
    frame++;
    if (++fontCheck % 40 === 1 && !Y.font) {
      try { if (document.fonts && document.fonts.check('600 12px "JetBrains Mono"')) { Y.font = true; layerDirty = true; } } catch (e) { Y.font = true; }
    }
    g = crt.g;
    crt.begin(S.kill ? 0.4 : 0.34);
    const sh = S.shake.update(1 / 60);
    drawMargins();
    // world, through the camera
    g.save();
    const cam = S.cam, cx = L.mx + L.mw / 2, cy = L.my + L.mh / 2;
    g.translate(cx + sh.x, cy + sh.y);
    g.rotate(sh.rot * 0.6);
    g.scale(cam.z, cam.z);
    g.translate(-X(cam.x), -Yp(cam.y));
    drawMap();
    drawBits();
    drawStatic();
    drawMachinery();
    drawShrink();
    drawGhost();
    drawPings();
    // bullets under the snipers, aim lines under bullets
    const me = S.P[ctx.me], foe = S.P[1 - ctx.me];
    if (ctx.phase !== 'over') {
      if (me.alive && !S.intro) drawAim(me, myCol, true);
      if (foe.alive && S.seen.a > 0.3 && !S.intro && (foe.hold || S.seen.mode === 'los')) drawAim(foe, foeCol, false);
    }
    for (const b of S.bullets) drawBullet(b);
    for (const d of S.decoys) {
      if (!d.alive) continue;
      const a = d.owner === ctx.me ? 1 : d.vis;
      if (a > 0.04) drawSniper(d, a * 0.95, d.blip ? 'blip' : 'solid', d.owner === ctx.me ? 'pid ' + d.pid : '');
    }
    for (const p of S.P) {
      if (!p.alive) { if (S.kill && S.kill.victim === p.i) drawDead(p, S.kill); continue; }
      const mine = p.i === ctx.me;
      const a = mine ? 1 : S.seen.a;
      if (a <= 0.03) continue;
      const name = ctx.sudden || S.intro ? ctx.players[p.i].name : '';
      drawSniper(p, a, mine || S.seen.mode === 'los' ? 'solid' : 'blip', name);
      if (ctx.sudden && ctx.phase === 'live') {
        g.strokeStyle = colOf(p.i);
        g.lineWidth = 1.5;
        g.globalAlpha = 0.5 + 0.4 * Math.sin(S.t * 8);
        g.beginPath();
        g.arc(X(p.x), Yp(p.y), u * (3.2 + (S.t * 6) % 2), 0, TAU);
        g.stroke();
        g.globalAlpha = 1;
      }
    }
    drawParts();
    if (S.pingFlash > 0) { // the sonar's flash lights the whole screen for a moment
      g.fillStyle = pal.hi;
      g.globalAlpha = S.pingFlash * 0.07;
      g.fillRect(L.mx, L.my, L.mw, L.mh);
      g.globalAlpha = 1;
    }
    g.restore();
    // chrome that does not ride the camera
    drawReticle();
    drawConsole();
    drawKillText();
    if (S.glitch > 0.05) crt.tear(S.glitch, S.t * 9 | 0, S.kill ? ctx.height : L.compact ? ctx.height : L.cy0 - 4);
    const fl = 0.975 + 0.025 * noise2(S.t * 31, 3.3) + (S.kill ? 0 : 0.004 * Math.sin(S.t * 120));
    crt.present(ctx.g, S.t, fl, (S.t * 0.09) % 1);
  };

  // Where a world point is on the glass right now (camera, curve and all) — the transition's impact point.
  V.screenOf = (x, y, out) => {
    const cam = S.cam, cx = L.mx + L.mw / 2, cy = L.my + L.mh / 2;
    tmp2.x = cx + (X(x) - X(cam.x)) * cam.z; tmp2.y = cy + (Yp(y) - Yp(cam.y)) * cam.z;
    crt.project(tmp2.x, tmp2.y, out);
    return out;
  };
  V.dispose = () => {
    crt.dispose();
    Y.canvas.width = Y.canvas.height = Y.masked.width = Y.masked.height = 1;
    mask.canvas.width = mask.canvas.height = 1;
    halos.clear();
  };
  return V;
}
