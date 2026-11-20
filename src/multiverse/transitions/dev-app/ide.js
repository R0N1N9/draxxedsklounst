// DEV-APP — Act 2: the IDE. A complete (fake) app-builder window: title bar with a Run
// button, file tree, tabbed editor with syntax colouring, a preview pane the old world is
// shrunk into, a build bar and a console. It is laid out for any screen from a phone to a
// 16:10 desktop, and every panel can be slid in and thrown out on its own transform.
import { clamp, lerp, rgba, mixHex, roundRect, contrastOn, TAU } from '../../kit.js';
import { appIcon, dropShadow, trunc, fit, icoPlay, icoStop, icoCheck, icoCross, icoSpin, icoChevron, icoBranch } from './ui.js';

export function ideLayout(w, h, plan) {
  const S = clamp(Math.min(w / 1280, h / 760), 0.5, 1.45);
  const px = (n) => Math.round(n * S);
  const fz = (n) => Math.max(7, n * S); // type never drops below 7 px, whatever the screen
  const titleH = px(40), statusH = px(24), tabsH = px(32);
  const mainY = titleH, mainH = h - titleH - statusH;
  const hasTree = w >= 900;
  const treeW = hasTree ? px(186) : 0;
  const colW = Math.round(w * (hasTree ? 0.44 : 0.47));
  const left = plan.side === 'left'; // the preview column can sit on either side
  const colX = left ? 0 : w - colW, treeX = left ? w - treeW : 0, edX = left ? colW : treeW;
  const pad = px(10), headH = px(30);
  const scrW = colW - pad * 2, scrH = Math.round((scrW * h) / w); // the preview keeps the screen's shape
  const scr = { x: colX + pad, y: mainY + headH, w: scrW, h: scrH };
  const buildH = px(56), buildY = scr.y + scrH + px(6);
  const conY = buildY + buildH;
  const runW = px(78), runH = px(26);
  return {
    S, px, fz, w, h, left, tabsH, pad,
    title: { x: 0, y: 0, w, h: titleH },
    status: { x: 0, y: h - statusH, w, h: statusH },
    tree: hasTree ? { x: treeX, y: mainY, w: treeW, h: mainH } : null,
    editor: { x: edX, y: mainY, w: w - treeW - colW, h: mainH },
    col: { x: colX, y: mainY, w: colW, h: mainH },
    head: { x: colX, y: mainY, w: colW, h: headH },
    scr,
    build: { x: colX + pad, y: buildY, w: scrW, h: buildH },
    con: { x: colX, y: conY, w: colW, h: Math.max(0, mainY + mainH - conY) },
    run: { x: w - px(12) - runW, y: Math.round((titleH - runH) / 2), w: runW, h: runH },
    menus: w / S >= 1150,
  };
}

const hair = (g, th, x1, y1, x2, y2) => {
  g.strokeStyle = th.line;
  g.lineWidth = th.hard ? 1.5 : 1;
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
};

// ---------------------------------------------------------------------------
function drawTitle(g, th, L, plan, st) {
  const r = L.title, S = L.S, cy = r.y + r.h / 2;
  g.fillStyle = th.chrome;
  g.fillRect(r.x, r.y, r.w, r.h);
  if (th.hard) {
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(r.x, r.y, r.w, 1.5);
  }
  hair(g, th, r.x, r.y + r.h - 0.5, r.x + r.w, r.y + r.h - 0.5);
  const ic = L.px(22);
  let x = r.x + L.px(12);
  appIcon(g, th, x, cy - ic / 2, ic, 0);
  x += ic + L.px(9);
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.font = th.ui(L.fz(13), 700);
  g.fillStyle = th.text;
  g.fillText(plan.app, x, cy + 0.5);
  x += g.measureText(plan.app).width + L.px(20);
  if (L.menus) {
    g.font = th.ui(L.fz(12.5), 400);
    g.fillStyle = th.dim;
    for (const m of ['File', 'Edit', 'View', 'Build', 'Help']) {
      g.fillText(m, x, cy + 0.5);
      x += g.measureText(m).width + L.px(16);
    }
  }
  // Run / Stop
  const b = L.run, live = st.live, ready = st.ready, press = st.runPress;
  const rr = th.hard ? 2 : b.h * 0.3;
  if (ready > 0 && !live && !th.hard) {
    // An eager halo once the build has passed: the button wants to be pressed.
    const pulse = 0.5 + 0.5 * Math.sin(st.t * 9);
    roundRect(g, b.x - 3 * S - pulse * 2 * S, b.y - 3 * S - pulse * 2 * S, b.w + 6 * S + pulse * 4 * S, b.h + 6 * S + pulse * 4 * S, rr + 4 * S);
    g.fillStyle = rgba(th.brand, 0.28 * ready * (0.6 + 0.4 * pulse));
    g.fill();
  }
  if (th.hard) { g.fillStyle = th.line; g.fillRect(b.x + 2.5 * S, b.y + 2.5 * S, b.w, b.h); }
  const off = press * (th.hard ? 2 : 1) * S;
  let fill = live ? th.hl : mixHex(mixHex(th.btn, th.brand, 0.35), th.brand, ready);
  fill = mixHex(fill, '#000000', 0.22 * press);
  roundRect(g, b.x + (th.hard ? off : 0), b.y + off, b.w, b.h, rr);
  g.fillStyle = fill;
  g.fill();
  if (th.hard) { g.strokeStyle = th.line; g.lineWidth = 1.5; g.stroke(); }
  const ink = live ? th.dim : mixHex(th.text, th.brandText, 0.4 + 0.6 * ready);
  g.fillStyle = ink;
  g.font = th.ui(L.fz(12.5), 700);
  const label = live ? 'Stop' : 'Run';
  const lw = g.measureText(label).width, isz = L.fz(9.5), tot = isz + 6 * S + lw;
  const bx = b.x + (b.w - tot) / 2 + (th.hard ? off : 0), by = b.y + b.h / 2 + off;
  if (live) icoStop(g, bx + isz / 2, by, isz); else icoPlay(g, bx + isz / 2, by, isz);
  g.fillText(label, bx + isz + 6 * S, by + 0.5);
  // Status pill, left of the button
  const bs = st.build;
  let text = 'Idle', col = th.dim, kind = 'dot';
  if (live) { text = 'Running'; col = th.ok; }
  else if (bs.state === 'run') { text = `Building ${Math.round(bs.k * 100)}%`; col = th.brand; kind = 'spin'; }
  else if (bs.state === 'err') { text = '1 error'; col = th.err; kind = 'cross'; }
  else if (bs.state === 'fix') { text = 'Auto-fixed'; col = th.ok; kind = 'check'; }
  else if (bs.state === 'ok') { text = 'Build succeeded'; col = th.ok; kind = 'check'; }
  else if (st.typing) text = 'Editing';
  g.font = th.ui(L.fz(11.5), 600);
  const fu = L.fz(11.5) / 11.5; // spacing inside chips follows the type, which has a floor on small screens
  const tw = g.measureText(text).width, ph = Math.max(L.px(22), 15), pw = tw + 30 * fu, pxr = b.x - L.px(10), pxl = pxr - pw;
  roundRect(g, pxl, cy - ph / 2, pw, ph, th.hard ? 1 : ph / 2);
  g.fillStyle = rgba(col, th.key === 'dark' ? 0.16 : 0.13);
  g.fill();
  g.fillStyle = g.strokeStyle = th.key === 'dark' ? col : mixHex(col, '#000000', 0.15);
  const ix = pxl + 12 * fu, isz2 = L.fz(9);
  if (kind === 'spin') icoSpin(g, ix, cy, isz2 * 1.25, st.t * 1.6);
  else if (kind === 'check') icoCheck(g, ix, cy, isz2);
  else if (kind === 'cross') icoCross(g, ix, cy, isz2);
  else { g.beginPath(); g.arc(ix, cy, isz2 * 0.36, 0, TAU); g.fill(); }
  g.fillText(text, pxl + 21 * fu, cy + 0.5);
  // Breadcrumb in whatever room is left in the middle
  const room = pxl - L.px(18) - x;
  if (room > L.px(90)) {
    g.font = th.ui(L.fz(12), 500);
    g.fillStyle = th.dim;
    g.textAlign = 'center';
    const crumb = trunc(g, `${plan.project}  /  ${plan.code.file}`, room);
    g.fillText(crumb, x + room / 2, cy + 0.5);
  }
}

// ---------------------------------------------------------------------------
function drawTree(g, th, L, plan, st) {
  const r = L.tree, S = L.S;
  g.fillStyle = th.panel;
  g.fillRect(r.x, r.y, r.w, r.h);
  const edge = L.left ? r.x + 0.5 : r.x + r.w - 0.5;
  hair(g, th, edge, r.y, edge, r.y + r.h);
  g.save();
  g.beginPath();
  g.rect(r.x, r.y, r.w, r.h);
  g.clip();
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.font = th.ui(L.fz(10.5), 700);
  g.fillStyle = th.dim;
  g.fillText('E X P L O R E R', r.x + L.px(14), r.y + L.px(17));
  const rh = L.px(25);
  let y = r.y + L.px(34);
  for (const row of plan.tree) {
    // Rows the build adds grow into place; rows it deletes are struck through and fade.
    const add = row.add === undefined || row.add < 0 ? 1 : st.treeAdd[row.add] || 0;
    const del = row.del === undefined ? 0 : st.treeDel[row.del] || 0;
    if (add <= 0) continue;
    const hgt = rh * add, cy = y + hgt / 2, x = r.x + L.px(12) + row.d * L.px(13);
    g.globalAlpha = add * (1 - del * 0.62);
    if (row.active) {
      g.fillStyle = rgba(th.brand, th.key === 'dark' ? 0.2 : 0.14);
      g.fillRect(r.x, y, r.w, hgt);
      g.fillStyle = th.brand;
      g.fillRect(L.left ? r.x + r.w - 2.5 * S : r.x, y, 2.5 * S, hgt);
    }
    if (row.dir) {
      g.fillStyle = th.dim;
      icoChevron(g, x + 4 * S, cy, L.fz(8), !row.closed);
    } else {
      g.fillStyle = row.ext || th.dim;
      g.beginPath();
      g.arc(x + 4 * S, cy, Math.max(2, 3.2 * S), 0, TAU);
      g.fill();
    }
    g.font = th.ui(L.fz(12.5), row.dir || row.active ? 600 : 400);
    const fresh = row.add !== undefined && row.add >= 0;
    g.fillStyle = del > 0 ? mixHex(th.text, th.err, del) : fresh ? mixHex(th.ok, th.text, 0.25) : row.dir ? th.text : mixHex(th.text, th.dim, 0.25);
    const tx = x + L.px(14), room = r.x + r.w - tx - L.px(26);
    const name = trunc(g, row.name, room);
    g.fillText(name, tx, cy + 0.5);
    if (del > 0) {
      const tw = g.measureText(name).width;
      g.fillRect(tx - 2, cy, (tw + 4) * del, Math.max(1, 1.2 * S));
    }
    const badge = del > 0.5 ? 'D' : fresh ? 'A' : row.mod || (row.active && st.typing) ? 'M' : row.note || '';
    if (badge) {
      g.font = th.mono(L.fz(10.5), 600);
      g.fillStyle = badge === 'D' ? th.err : badge === 'A' ? th.ok : badge === 'M' ? th.warn : th.dim;
      g.textAlign = 'right';
      g.fillText(badge, r.x + r.w - L.px(12), cy + 0.5);
      g.textAlign = 'left';
    }
    g.globalAlpha = 1;
    y += hgt;
  }
  g.restore();
}

// ---------------------------------------------------------------------------
function drawEditor(g, th, L, plan, st) {
  const r = L.editor, S = L.S, code = plan.code;
  g.fillStyle = th.editor;
  g.fillRect(r.x, r.y, r.w, r.h);
  // Tabs
  g.fillStyle = th.chrome;
  g.fillRect(r.x, r.y, r.w, L.tabsH);
  hair(g, th, r.x, r.y + L.tabsH - 0.5, r.x + r.w, r.y + L.tabsH - 0.5);
  g.save();
  g.beginPath();
  g.rect(r.x, r.y, r.w, r.h);
  g.clip();
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  const tabs = [[code.file, 1, 0], [plan.oldFile + '.js', 0, st.treeDel[0] || 0], ['snipers.js', 0, 0]];
  let tx = r.x;
  for (const [name, active, del] of tabs) {
    g.font = th.ui(L.fz(12), active ? 600 : 400);
    const tw = g.measureText(name).width + L.px(44);
    if (active) {
      g.fillStyle = th.editor;
      g.fillRect(tx, r.y, tw, L.tabsH);
      g.fillStyle = th.brand;
      g.fillRect(tx, r.y, tw, Math.max(2, 2.2 * S));
    }
    if (active) hair(g, th, tx + tw - 0.5, r.y, tx + tw - 0.5, r.y + L.tabsH);
    g.globalAlpha = 1 - del * 0.55;
    g.fillStyle = '#e8b84a';
    g.beginPath();
    g.arc(tx + L.px(14), r.y + L.tabsH / 2, Math.max(2, 3 * S), 0, TAU);
    g.fill();
    g.fillStyle = active ? th.text : del > 0 ? mixHex(th.dim, th.err, del) : th.dim;
    const lx = tx + L.px(24);
    g.fillText(name, lx, r.y + L.tabsH / 2 + 0.5);
    if (del > 0) g.fillRect(lx - 2, r.y + L.tabsH / 2, (g.measureText(name).width + 4) * del, Math.max(1, 1.2 * S));
    // The unsaved dot on the file being written.
    if (active && st.typing) {
      g.fillStyle = th.dim;
      g.beginPath();
      g.arc(tx + tw - L.px(13), r.y + L.tabsH / 2, Math.max(1.8, 2.6 * S), 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
    tx += tw;
  }
  // Code. One monospace grid: column × charW, so tokens never need measuring.
  const mmW = r.w > 360 ? L.px(52) : 0;
  const gutter = 4, avail = r.w - mmW - L.px(18);
  const fs = clamp(avail / ((plan.clampCols + gutter + 1) * 0.602), 6, clamp(15.5 * S, 9, 19));
  g.font = th.mono(fs, 400);
  const cw = g.measureText('MMMMMMMMMM').width / 10;
  const lh = Math.round(fs * 1.68);
  const top = r.y + L.tabsH + L.px(10);
  const x0 = r.x + L.px(8) + gutter * cw + L.px(8);
  const room = r.y + r.h - top - L.px(6);
  const scroll = Math.max(0, (st.caretLine + 2) * lh - room);
  g.beginPath();
  g.rect(r.x, r.y + L.tabsH, r.w, r.h - L.tabsH);
  g.clip();
  for (let i = 0; i < code.lines.length; i++) {
    const n = st.typed[i], y = top + i * lh - scroll, cy = y + lh / 2;
    if (y > r.y + r.h || y + lh < r.y + L.tabsH) continue;
    if (i === st.caretLine) {
      g.fillStyle = th.hl;
      g.fillRect(r.x, y, r.w - mmW, lh);
    }
    // The lines that talk about the players light up as they land, in the loser's colour.
    const glow = i === code.mockLine ? st.mockK : i === code.todoLine ? st.todoK : 0;
    if (glow > 0) {
      g.fillStyle = rgba(plan.loseInk, 0.07 + 0.2 * glow);
      g.fillRect(r.x, y, r.w - mmW, lh);
      g.fillStyle = plan.loseInk;
      g.fillRect(r.x, y, Math.max(2, 2.5 * S), lh);
    }
    if (i > st.caretLine) continue;
    g.font = th.mono(fs, 400);
    g.textAlign = 'right';
    g.fillStyle = i === st.caretLine ? th.text : th.faint;
    g.fillText(String(i + 1), x0 - L.px(10), cy + 0.5);
    g.textAlign = 'left';
    const line = code.lines[i];
    for (const tk of line.tokens) {
      if (tk.c >= n) break;
      const whole = tk.c + tk.s.length <= n;
      g.fillStyle = th[tk.k] || th.id;
      if (tk.k === 'p0' || tk.k === 'p1') g.font = th.mono(fs, 600);
      g.fillText(whole ? tk.s : tk.s.slice(0, n - tk.c), x0 + tk.c * cw, cy + 0.5);
      if (tk.k === 'p0' || tk.k === 'p1') g.font = th.mono(fs, 400);
      if (tk.k === 'hex' && whole) {
        // The editor's colour chip: the next world's real palette, shown the moment it is typed.
        const sz = fs * 0.86, sx = x0 + (tk.c - 1.72) * cw, sy = cy - sz / 2;
        roundRect(g, sx, sy, sz, sz, th.hard ? 0 : sz * 0.22);
        g.fillStyle = tk.color;
        g.fill();
        g.strokeStyle = rgba(th.text, 0.45);
        g.lineWidth = 1;
        g.stroke();
      }
    }
  }
  // Caret: solid while typing, blinking when the file is done.
  if (st.caretOn) {
    const y = top + st.caretLine * lh - scroll;
    g.fillStyle = th.brand;
    g.fillRect(x0 + st.caretCol * cw + 1, y + lh * 0.14, Math.max(1.5, 2 * S), lh * 0.72);
  }
  // Minimap
  if (mmW) {
    const mx = r.x + r.w - mmW;
    hair(g, th, mx + 0.5, r.y + L.tabsH, mx + 0.5, r.y + r.h);
    const step = Math.max(2.6, 3.4 * S), my = r.y + L.tabsH + L.px(10);
    g.fillStyle = rgba(th.text, 0.06);
    g.fillRect(mx + 1, my - L.px(4), mmW - 1, step * code.lines.length + L.px(8));
    for (let i = 0; i <= st.caretLine && i < code.lines.length; i++) {
      const n = st.typed[i];
      if (!n) continue;
      const text = code.lines[i].text, ind = text.length - text.trimStart().length;
      g.fillStyle = rgba(/^\s*\/\//.test(text) ? th.com : i === code.nameLine ? th.type : th.dim, 0.8);
      g.fillRect(mx + L.px(6) + ind * 0.7 * S, my + i * step, Math.min(mmW - L.px(12), Math.max(0, n - ind) * 0.7 * S), Math.max(1.2, 1.7 * S));
    }
  }
  g.restore();
  const edge = L.left ? r.x + 0.5 : r.x + r.w - 0.5;
  hair(g, th, edge, r.y, edge, r.y + r.h);
}

// ---------------------------------------------------------------------------
function drawColumn(g, th, L, plan, st, to) {
  const r = L.col, S = L.S;
  g.fillStyle = th.panel;
  g.fillRect(r.x, r.y, r.w, r.h);
  g.save();
  g.beginPath();
  g.rect(r.x, r.y, r.w, r.h);
  g.clip();
  g.textBaseline = 'middle';
  // Header: label, the palette as it is typed, zoom, state badge.
  const h = L.head, hy = h.y + h.h / 2;
  g.textAlign = 'left';
  g.font = th.ui(L.fz(10.5), 700);
  g.fillStyle = th.dim;
  g.fillText('P R E V I E W', h.x + L.pad + 2 * S, hy + 0.5);
  let sx = h.x + L.pad + g.measureText('P R E V I E W').width + L.px(14);
  const pal = [to.palette.bg, to.palette.fg, to.palette.accent];
  for (let i = 0; i < 3; i++) {
    const k = clamp(st.pal * 3 - i, 0, 1);
    if (k <= 0) continue;
    const e = 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2); // outBack
    const sz = L.px(12) * e;
    roundRect(g, sx + L.px(6) - sz / 2, hy - sz / 2, sz, sz, th.hard ? 0 : sz * 0.28);
    g.fillStyle = pal[i];
    g.fill();
    g.strokeStyle = rgba(th.text, 0.4);
    g.lineWidth = 1;
    g.stroke();
    sx += L.px(17);
  }
  // Badge (right)
  const B = { LIVE: [th.err, 'dot'], STOPPED: [th.dim, 'stop'], REBUILDING: [th.brand, 'spin'], READY: [th.ok, 'check'], RUNNING: [th.ok, 'dot'], ERROR: [th.err, 'cross'] }[st.badge] || [th.dim, 'dot'];
  g.font = th.ui(L.fz(10.5), 700);
  const fu = L.fz(10.5) / 10.5;
  const bw = g.measureText(st.badge).width + 27 * fu, bh = Math.max(L.px(18), 12), bx = h.x + h.w - L.pad - bw;
  roundRect(g, bx, hy - bh / 2, bw, bh, th.hard ? 1 : bh / 2);
  g.fillStyle = rgba(B[0], th.key === 'dark' ? 0.18 : 0.14);
  g.fill();
  const bcol = th.key === 'dark' ? B[0] : mixHex(B[0], '#000000', 0.12);
  g.fillStyle = g.strokeStyle = bcol;
  const ix = bx + 10 * fu, isz = L.fz(8);
  if (B[1] === 'spin') icoSpin(g, ix, hy, isz * 1.2, st.t * 1.6);
  else if (B[1] === 'check') icoCheck(g, ix, hy, isz);
  else if (B[1] === 'cross') icoCross(g, ix, hy, isz);
  else if (B[1] === 'stop') icoStop(g, ix, hy, isz);
  else {
    g.globalAlpha = st.badge === 'LIVE' ? 0.55 + 0.45 * Math.sin(st.t * 7) : 1;
    g.beginPath();
    g.arc(ix, hy, isz * 0.42, 0, TAU);
    g.fill();
    g.globalAlpha = 1;
  }
  g.fillText(st.badge, bx + 19 * fu, hy + 0.5);
  g.font = th.mono(L.fz(10.5), 400);
  g.fillStyle = th.dim;
  g.textAlign = 'right';
  g.fillText(`${Math.round(st.zoom * 100)}%`, bx - L.px(10), hy + 0.5);
  // The well the world drops into.
  const s = L.scr;
  roundRect(g, s.x - 1, s.y - 1, s.w + 2, s.h + 2, th.hard ? 0 : 8 * S + 1);
  g.fillStyle = th.well;
  g.fill();
  if (th.hard) { g.strokeStyle = th.line; g.lineWidth = 1.5; g.stroke(); }
  // Build bar
  const b = L.build, bs = st.build;
  const shake = bs.state === 'err' ? Math.sin(st.t * 70) * 3 * S * bs.shake : 0;
  g.save();
  g.translate(shake, 0);
  const col = bs.state === 'err' ? th.err : bs.state === 'ok' || bs.state === 'fix' ? th.ok : th.brand;
  const ly = b.y + b.h * 0.34, barY = b.y + b.h * 0.64, barH = Math.max(4, 7 * S);
  g.textAlign = 'right';
  g.font = th.mono(L.fz(12), 600);
  g.fillStyle = bs.state === 'idle' ? th.faint : th.key === 'dark' ? col : mixHex(col, '#000000', 0.15);
  const pct = bs.state === 'ok' ? plan.casualties : `${Math.round(bs.k * 100)}%`;
  const pw = g.measureText(pct).width;
  g.fillText(pct, b.x + b.w, ly + 0.5);
  g.textAlign = 'left';
  let lx = b.x;
  if (bs.state !== 'idle') {
    const isz3 = L.fz(11);
    g.strokeStyle = g.fillStyle;
    if (bs.state === 'run') icoSpin(g, lx + isz3 / 2, ly, isz3 * 1.15, st.t * 1.6);
    else if (bs.state === 'err') icoCross(g, lx + isz3 / 2, ly, isz3 * 0.9);
    else icoCheck(g, lx + isz3 / 2, ly, isz3 * 0.9);
    lx += isz3 + L.px(8);
  }
  g.fillStyle = bs.state === 'idle' ? th.dim : bs.state === 'run' ? th.text : g.fillStyle;
  const label = bs.label;
  fit(g, label, b.x + b.w - lx - pw - L.px(12), L.fz(bs.state === 'ok' ? 14 : 13.5), (p) => th.ui(p, bs.state === 'ok' ? 800 : 600));
  g.fillText(label, lx, ly + 0.5);
  roundRect(g, b.x, barY, b.w, barH, th.hard ? 0 : barH / 2);
  g.fillStyle = th.key === 'dark' ? th.well : th.well;
  g.fill();
  if (th.hard) { g.strokeStyle = th.line; g.lineWidth = 1.2; g.stroke(); }
  if (bs.k > 0.004) {
    g.save();
    roundRect(g, b.x, barY, b.w, barH, th.hard ? 0 : barH / 2);
    g.clip();
    // The bar runs from the IDE's brand colour into the next world's accent: its palette
    // is already leaking into the tooling.
    const grad = g.createLinearGradient(b.x, 0, b.x + b.w, 0);
    grad.addColorStop(0, bs.state === 'err' ? th.err : bs.state === 'ok' ? th.ok : th.brand);
    grad.addColorStop(1, bs.state === 'err' ? th.err : bs.state === 'ok' ? th.ok : to.palette.accent);
    g.fillStyle = grad;
    g.fillRect(b.x, barY, b.w * bs.k, barH);
    if (bs.state === 'run') {
      // Barber-pole shimmer so the bar is alive even between steps.
      g.fillStyle = 'rgba(255,255,255,0.22)';
      const sp = barH * 2.6, o = (st.t * 60 * S) % sp;
      for (let x = b.x - sp + o; x < b.x + b.w * bs.k; x += sp) {
        g.beginPath();
        g.moveTo(x, barY + barH); g.lineTo(x + barH, barY); g.lineTo(x + barH + sp * 0.4, barY); g.lineTo(x + sp * 0.4, barY + barH);
        g.closePath();
        g.fill();
      }
    }
    g.restore();
  }
  g.restore();
  // Console
  const c = L.con;
  if (c.h > L.px(30)) {
    hair(g, th, c.x, c.y + 0.5, c.x + c.w, c.y + 0.5);
    const chH = L.px(26);
    g.textAlign = 'left';
    g.font = th.ui(L.fz(10.5), 700);
    g.fillStyle = th.text;
    g.fillText('C O N S O L E', c.x + L.pad + 2 * S, c.y + chH / 2 + 1);
    const cwid = g.measureText('C O N S O L E').width;
    g.fillStyle = th.brand;
    g.fillRect(c.x + L.pad + 2 * S, c.y + chH - 2 * S, cwid, Math.max(1.5, 2 * S));
    g.fillStyle = th.dim;
    g.fillText('P R O B L E M S', c.x + L.pad + cwid + L.px(22), c.y + chH / 2 + 1);
    if (st.errCount) {
      const ex = c.x + L.pad + cwid + L.px(22) + g.measureText('P R O B L E M S').width + L.px(12);
      g.fillStyle = th.err;
      g.beginPath();
      g.arc(ex, c.y + chH / 2, L.px(7), 0, TAU);
      g.fill();
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.font = th.mono(L.fz(9.5), 600);
      g.fillText('1', ex, c.y + chH / 2 + 0.5);
      g.textAlign = 'left';
    }
    const fs = L.fz(11.5), lh = Math.round(fs * 1.62), top = c.y + chH + L.px(4);
    const rows = Math.max(1, Math.floor((c.y + c.h - top - L.px(4)) / lh));
    const lines = st.con, first = Math.max(0, lines.length - rows);
    g.font = th.mono(fs, 400);
    const cwm = g.measureText('MMMMMMMMMM').width / 10, maxCh = Math.max(8, Math.floor((c.w - L.pad * 2 - 4 * S) / cwm));
    for (let i = first; i < lines.length; i++) {
      const ln = lines[i], y = top + (i - first) * lh + lh / 2;
      const colr = ln.kind === 'err' ? th.err : ln.kind === 'ok' || ln.kind === 'fix' ? th.ok : ln.kind === 'cmd' ? th.text : th.dim;
      let s = ln.s.length > maxCh ? ln.s.slice(0, maxCh - 1) + '…' : ln.s;
      if (ln.k < 1) s = s.slice(0, Math.ceil(s.length * ln.k));
      g.font = th.mono(fs, ln.kind === 'ok' || ln.kind === 'cmd' ? 600 : 400);
      g.fillStyle = th.key === 'dark' || ln.kind === 'step' || ln.kind === 'cmd' ? colr : mixHex(colr, '#000000', 0.12);
      const xx = c.x + L.pad + 2 * S;
      if (ln.kind === 'cmd') {
        g.fillStyle = th.brand;
        g.fillText('$', xx, y);
        g.fillStyle = th.text;
        g.fillText(s.slice(2), xx + 2 * cwm, y);
      } else g.fillText(s, xx, y);
      if (ln.done) {
        g.fillStyle = th.key === 'dark' ? th.ok : mixHex(th.ok, '#000000', 0.12);
        g.textAlign = 'right';
        g.fillText(ln.done, c.x + c.w - L.pad - 2 * S, y);
        g.textAlign = 'left';
      }
    }
  }
  g.restore();
  const edge = L.left ? r.x + r.w - 0.5 : r.x + 0.5;
  hair(g, th, edge, r.y, edge, r.y + r.h);
}

// ---------------------------------------------------------------------------
function drawStatus(g, th, L, plan, st, to) {
  const r = L.status, S = L.S, cy = r.y + r.h / 2;
  // Once the app is running the bar takes the new world's accent: the IDE now belongs to it.
  const bg = st.live ? to.palette.accent : th.hard ? th.chrome : th.brand;
  const ink = st.live ? contrastOn(to.palette.accent) : th.hard ? th.text : th.brandText;
  g.fillStyle = bg;
  g.fillRect(r.x, r.y, r.w, r.h);
  if (th.hard) hair(g, th, r.x, r.y + 0.5, r.x + r.w, r.y + 0.5);
  g.fillStyle = g.strokeStyle = ink;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.font = th.ui(L.fz(11), 600);
  let x = r.x + L.px(12);
  icoBranch(g, x + 4 * S, cy, L.fz(11));
  x += L.px(14);
  const branch = st.live ? `reality/${plan.toSlug}` : 'reality/main';
  g.fillText(branch, x, cy + 0.5);
  x += g.measureText(branch).width + L.px(18);
  const msg = st.live ? `Running ${to.name}` : st.build.state === 'ok' ? 'Build succeeded' : st.build.state === 'idle' ? (st.typing ? 'Writing…' : 'Ready') : 'Building…';
  g.font = th.ui(L.fz(11), 400);
  g.fillText(trunc(g, msg, r.w * 0.3), x, cy + 0.5);
  g.textAlign = 'right';
  let rx = r.x + r.w - L.px(12);
  const right = [`Ln ${st.caretLine + 1}, Col ${st.caretCol + 1}`, 'Spaces: 2', 'UTF-8', 'JavaScript'];
  for (let i = right.length - 1; i >= 0; i--) {
    if (rx < r.x + r.w * 0.5) break;
    g.fillText(right[i], rx, cy + 0.5);
    rx -= g.measureText(right[i]).width + L.px(18);
  }
}

// ---------------------------------------------------------------------------
/** xf = [dx, dy, rot, lift]: where the panel is relative to its docked place. */
function panel(g, th, L, r, xf, fn) {
  if (!r) return;
  if (!xf || (!xf[0] && !xf[1] && !xf[2])) return fn();
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  g.save();
  g.translate(cx + xf[0], cy + xf[1]);
  if (xf[2]) g.rotate(xf[2]);
  g.translate(-cx, -cy);
  if (xf[3] > 0) dropShadow(g, th, r.x, r.y, r.w, r.h, 0, 46 * L.S * xf[3], 0.34 * xf[3]);
  fn();
  g.restore();
}

/** Panels under the preview pane (the column the pane sits in, the status bar). */
export function drawIdeBack(g, th, L, plan, st, to) {
  g.fillStyle = th.bg;
  g.fillRect(0, 0, L.w, L.h);
  if (st.dusk > 0) {
    // As the window flies apart the desk behind it goes to the new world's own dark, so the
    // last sliver around the growing pane is never a bright frame.
    g.fillStyle = rgba(mixHex(to.palette.bg, '#000000', 0.35), st.dusk);
    g.fillRect(0, 0, L.w, L.h);
  }
  panel(g, th, L, L.col, st.xf.col, () => drawColumn(g, th, L, plan, st, to));
  panel(g, th, L, L.status, st.xf.status, () => drawStatus(g, th, L, plan, st, to));
}

/** Panels that pass over the preview pane when the window flies apart. */
export function drawIdeFront(g, th, L, plan, st) {
  panel(g, th, L, L.tree, st.xf.tree, () => drawTree(g, th, L, plan, st));
  panel(g, th, L, L.editor, st.xf.editor, () => drawEditor(g, th, L, plan, st));
  panel(g, th, L, L.title, st.xf.title, () => drawTitle(g, th, L, plan, st));
}

export const lerpRect = (a, b, k, out) => {
  out.x = lerp(a.x, b.x, k);
  out.y = lerp(a.y, b.y, k);
  out.w = lerp(a.w, b.w, k);
  out.h = lerp(a.h, b.h, k);
  return out;
};
