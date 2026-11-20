// The two baked sheets: the glass floor (everything on it that never moves) and the halos
// under the cover. Baked once per size; blur lives here so that no frame ever pays for it.
import { TAU, makeCanvas } from '../../kit.js';
import { W, H, MID, CH_BOT, SHUTTER, DRONE } from './world.js';
import { VOID, VIOLET, EDGE, font } from './style.js';

export const MARGIN = 70; // baked around the arena so halos are not cut off

function sheet(old, w, h) {
  if (!old) return makeCanvas(w, h);
  old.canvas.width = w;
  old.canvas.height = h;
  return old;
}

/** art = { outlinePath, gridMinor, gridMajor, piecesPath, shutters, serial }. L = device px per world unit. */
export function bakeFloor(old, L, art) {
  const { outlinePath, gridMinor, gridMajor, serial } = art;
  const floor = sheet(old, Math.round((W + 2 * MARGIN) * L), Math.round((H + 2 * MARGIN) * L));
  const f = floor.g, hair = 1 / L;
  f.setTransform(L, 0, 0, L, MARGIN * L, MARGIN * L);

  // Corner housings: hatched, so the chamfers read as structure rather than as nothing.
  f.save();
  f.beginPath();
  f.rect(0, 0, W, H);
  f.clip();
  f.strokeStyle = 'rgba(127,139,255,0.10)';
  f.lineWidth = hair * 1.2;
  f.beginPath();
  for (let d = 20; d < 480; d += 16) {
    f.moveTo(0, H - d); f.lineTo(d, H);
    f.moveTo(W, H - d); f.lineTo(W - d, H);
    if (d < 200) { f.moveTo(0, d); f.lineTo(d, 0); f.moveTo(W, d); f.lineTo(W - d, 0); }
  }
  f.stroke();
  f.restore();

  f.save();
  f.clip(outlinePath);
  f.fillStyle = VOID;
  f.fillRect(0, 0, W, H);
  const gr = f.createRadialGradient(MID.x, MID.y + 10, 80, MID.x, MID.y + 10, 1000);
  gr.addColorStop(0, '#1b134c');
  gr.addColorStop(0.5, '#0f0b31');
  gr.addColorStop(1, '#09071d');
  f.fillStyle = gr;
  f.fillRect(0, 0, W, H);
  // Sheen: two soft diagonal bands, a skylight caught in the glass.
  for (const [x, wd, al] of [[330, 250, 0.06], [1010, 430, 0.04]]) {
    const lg = f.createLinearGradient(x, 0, x + 0.764 * wd, 0.425 * wd);
    lg.addColorStop(0, 'rgba(190,170,255,0)');
    lg.addColorStop(0.5, `rgba(190,170,255,${al})`);
    lg.addColorStop(1, 'rgba(190,170,255,0)');
    f.fillStyle = lg;
    f.fillRect(0, 0, W, H);
  }
  f.lineWidth = hair;
  f.strokeStyle = 'rgba(140,112,255,0.085)';
  f.stroke(gridMinor);
  f.lineWidth = hair * 1.3;
  f.strokeStyle = 'rgba(150,124,255,0.19)';
  f.stroke(gridMajor);
  f.fillStyle = 'rgba(214,200,255,0.5)';
  for (let x = 100; x < W; x += 100) for (let y = 100; y < H; y += 100) f.fillRect(x - 1.3, y - 1.3, 2.6, 2.6);

  // A reticle set into the floor under the centre.
  f.strokeStyle = 'rgba(160,136,255,0.16)';
  f.lineWidth = hair * 1.4;
  for (const r of [150, 245]) { f.beginPath(); f.arc(MID.x, MID.y, r, 0, TAU); f.stroke(); }
  f.setLineDash([3, 9]);
  f.beginPath(); f.arc(MID.x, MID.y, 197, 0, TAU); f.stroke();
  f.setLineDash([]);
  f.beginPath();
  for (let i = 0; i < 4; i++) {
    const c = Math.cos((i * TAU) / 4), s = Math.sin((i * TAU) / 4);
    f.moveTo(MID.x + c * 245, MID.y + s * 245); f.lineTo(MID.x + c * 285, MID.y + s * 285);
    f.moveTo(MID.x + c * 120, MID.y + s * 120); f.lineTo(MID.x + c * 150, MID.y + s * 150);
  }
  f.stroke();

  // Rails for the shutters, a lane for the polisher.
  f.strokeStyle = 'rgba(255,79,176,0.26)';
  f.lineWidth = hair * 1.3;
  const y0 = MID.y - SHUTTER.amp - SHUTTER.len / 2 - 8, y1 = MID.y + SHUTTER.amp + SHUTTER.len / 2 + 8;
  f.beginPath();
  for (const sh of art.shutters) {
    for (const o of [-5, 5]) { f.moveTo(sh.x + o, y0); f.lineTo(sh.x + o, y1); }
    for (const y of [y0, y1]) { f.moveTo(sh.x - 12, y); f.lineTo(sh.x + 12, y); }
    for (let y = y0 + 25; y < y1; y += 25) { f.moveTo(sh.x - 5, y); f.lineTo(sh.x + 5, y); }
  }
  f.stroke();
  f.strokeStyle = 'rgba(255,79,176,0.2)';
  f.setLineDash([10, 8]);
  f.beginPath();
  f.moveTo(MID.x - DRONE.amp - 26, DRONE.y);
  f.lineTo(MID.x + DRONE.amp + 26, DRONE.y);
  f.stroke();
  f.setLineDash([]);

  // Lattice coordinates along the walls, and the arena's serial.
  f.font = font(10, 500);
  f.textBaseline = 'middle';
  f.textAlign = 'center';
  f.fillStyle = 'rgba(190,176,255,0.3)';
  for (let i = 0; i < 16; i++) { const x = i * 100 + 50; if (x > CH_BOT + 20 && x < W - CH_BOT - 20) f.fillText(String(i + 1).padStart(2, '0'), x, H - 13); }
  for (let j = 1; j < 6; j++) { const y = j * 100 + 50; f.fillText('ABCDEFGHI'[j], 13, y); f.fillText('ABCDEFGHI'[j], W - 13, y); }
  f.font = font(9, 500);
  f.fillStyle = 'rgba(190,176,255,0.22)';
  f.fillText(serial.split('').join('\u200a'), MID.x, H - 30);
  f.restore();

  // The outer wall's halo (it never dissolves, so it lives on the floor sheet).
  f.save();
  f.shadowColor = EDGE;
  f.shadowBlur = 30 * L;
  f.strokeStyle = 'rgba(127,139,255,0.5)';
  f.lineWidth = 4;
  f.lineJoin = 'round';
  f.stroke(outlinePath);
  f.restore();

  return floor;
}

/** Halos under the cover, at half size (they are blur anyway). Faded out in sudden death. */
export function bakeHalo(old, L, art) {
  const Lh = L * 0.5, hw = Math.round((W + 2 * MARGIN) * Lh), hh = Math.round((H + 2 * MARGIN) * Lh);
  const halo = sheet(old, hw, hh);
  const hg = halo.g;
  hg.setTransform(Lh, 0, 0, Lh, MARGIN * Lh, MARGIN * Lh);
  hg.shadowColor = VIOLET;
  hg.shadowBlur = 30 * Lh;
  hg.strokeStyle = 'rgba(154,120,255,0.75)';
  hg.lineWidth = 5;
  hg.lineJoin = 'round';
  hg.stroke(art.piecesPath);
  hg.stroke(art.piecesPath);
  return halo;
}
