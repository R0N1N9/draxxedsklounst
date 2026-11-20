// Pixel-exact primitives: every call lands on whole pixels, nothing is anti-aliased.

/** Bresenham line of 1x1 (or `t` x `t`) pixels. */
export function line(g, x0, y0, x1, y1, color, t = 1) {
  g.fillStyle = color;
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let n = 0; n < 600; n++) {
    g.fillRect(x0, y0, t, t);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Filled pixel disc by scanlines. */
export function disc(g, cx, cy, r, color) {
  g.fillStyle = color;
  cx = Math.round(cx); cy = Math.round(cy);
  for (let y = -r; y <= r; y++) {
    const hw = Math.round(Math.sqrt(Math.max(0, r * r + 0.5 - y * y)));
    g.fillRect(cx - hw, cy + y, hw * 2 + 1, 1);
  }
}

/** One-pixel ring. */
export function ring(g, cx, cy, r, color) {
  g.fillStyle = color;
  cx = Math.round(cx); cy = Math.round(cy);
  let x = r, y = 0, err = 1 - r;
  while (x >= y) {
    g.fillRect(cx + x, cy + y, 1, 1); g.fillRect(cx - x, cy + y, 1, 1); g.fillRect(cx + x, cy - y, 1, 1); g.fillRect(cx - x, cy - y, 1, 1);
    g.fillRect(cx + y, cy + x, 1, 1); g.fillRect(cx - y, cy + x, 1, 1); g.fillRect(cx + y, cy - x, 1, 1); g.fillRect(cx - y, cy - x, 1, 1);
    y++;
    if (err < 0) err += 2 * y + 1;
    else { x--; err += 2 * (y - x) + 1; }
  }
}

/** Rectangle with a 1px outline. */
export function box(g, x, y, w, h, fill, edge) {
  x = Math.round(x); y = Math.round(y);
  g.fillStyle = edge;
  g.fillRect(x, y, w, h);
  g.fillStyle = fill;
  g.fillRect(x + 1, y + 1, w - 2, h - 2);
}

/** Draw a tiny pixel-art string sprite: rows of chars looked up in `map` ('.' is clear). */
export function stamp(g, rows, x, y, map, flip = false) {
  x = Math.round(x); y = Math.round(y);
  const w = rows[0].length;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < w; c++) {
      const col = map[row[c]];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x + (flip ? w - 1 - c : c), y + r, 1, 1);
    }
  }
}
