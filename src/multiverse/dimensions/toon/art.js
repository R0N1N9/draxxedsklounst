// The painted stage, baked once into off-screen canvases (sky furniture and every moving thing is drawn live;
// only rock, wall and far mesas are static). The ink outlines of the terrain are NOT baked into the picture:
// they are three pre-jittered Path2D variants that the renderer cycles ~12 times a second, so the rock itself
// boils like a cel while its (costly) hatching stays in the bitmap.
import { clamp, makeCanvas, makeRng, rand, noise2 } from '../../kit.js';
import { C, hash1 } from './ink.js';
import { W, GY, FLOOR, PIV, LIP } from './world.js';

export const BOUNDS = { x0: -450, y0: -260, x1: 2050, y1: 1180 };
export const ARCH = [{ x: 520, y: FLOOR }, { x: 1080, y: FLOOR }]; // painted tunnel mouths on the canyon floor
const FACE = [[0, 0], [4, 24], [-6, 62], [12, 98], [12, 122], [-2, 160], [-10, 232], [2, 280], [2, 302], [-12, 362], [-6, 420], [0, FLOOR - GY]];

function layer(x0, y0, x1, y1, ppu) {
  const { canvas, g } = makeCanvas((x1 - x0) * ppu, (y1 - y0) * ppu);
  g.setTransform(ppu, 0, 0, ppu, -x0 * ppu, -y0 * ppu);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  return { canvas, g, x0, y0, w: x1 - x0, h: y1 - y0, ppu };
}

/** The cliff polyline of one mesa (side 0 = left), from the lip at the top to the canyon floor. */
function faceLine(side) {
  return FACE.map(([dx, dy]) => [side ? W - (LIP[0] + dx) : LIP[0] + dx, GY + dy]);
}

function hatch(g, x0, y0, x1, y1, gap, alpha, lw = 1.6, slope = 1) {
  g.save();
  g.strokeStyle = `rgba(27,22,18,${alpha})`;
  g.lineWidth = lw;
  g.beginPath();
  for (let x = x0 - (y1 - y0) * slope; x < x1; x += gap) { g.moveTo(x, y0); g.lineTo(x + (y1 - y0) * slope, y1); }
  g.stroke();
  g.restore();
}

function speckle(g, rng, x0, y0, x1, y1, n, col, rmax = 2) {
  g.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const x = rand(rng, x0, x1), y = rand(rng, y0, y1), r = 0.6 + rng() * rmax;
    g.beginPath();
    g.arc(x, y, r, 0, 6.283);
    g.fill();
  }
}

/** One mesa body (silhouette + strata + shadow side + pebbles). */
function mesa(g, rng, side) {
  const f = faceLine(side), dir = side ? -1 : 1;
  const x0 = side ? LIP[1] : -700, far = side ? 2300 : LIP[0];
  g.save();
  g.beginPath();
  g.moveTo(side ? W + 600 : -600, GY);
  const lx = f[0][0];
  g.lineTo(lx - dir * 26, GY);
  g.quadraticCurveTo(lx + dir * 2, GY, lx + dir * 4, GY + 16);
  for (let i = 1; i < f.length; i++) g.lineTo(f[i][0], f[i][1]);
  g.lineTo(f[f.length - 1][0], BOUNDS.y1);
  g.lineTo(side ? W + 600 : -600, BOUNDS.y1);
  g.closePath();
  g.clip();
  // strata: bands of slightly different warm greys, with wavy edges
  const lit = side === 0; // the sun is upper right: the left mesa's face is lit
  const base = lit ? C.g1 : C.g2;
  g.fillStyle = base;
  g.fillRect(-600, GY, W + 1200, BOUNDS.y1 - GY);
  let y = GY + 14, i = 0;
  while (y < BOUNDS.y1) {
    const hgt = 30 + rng() * 34;
    g.fillStyle = i % 3 === 0 ? (lit ? C.paper2 : C.g1) : i % 3 === 1 ? base : (lit ? C.g2 : C.g3);
    g.beginPath();
    g.moveTo(-600, y);
    for (let x = -600; x <= W + 600; x += 60) g.lineTo(x, y + noise2(x * 0.011 + i * 3.1, i) * 5);
    g.lineTo(W + 600, y + hgt); g.lineTo(-600, y + hgt);
    g.closePath(); g.fill();
    y += hgt; i++;
  }
  // a cap of paler dirt along the top
  g.fillStyle = C.paper2;
  g.fillRect(-600, GY, W + 1200, 14);
  // shade down the cliff face, darker the further down it goes
  const grd = g.createLinearGradient(0, GY, 0, FLOOR + 80);
  grd.addColorStop(0, 'rgba(27,22,18,0)');
  grd.addColorStop(1, 'rgba(27,22,18,0.38)');
  g.fillStyle = grd;
  g.fillRect(-600, GY, W + 1200, BOUNDS.y1 - GY);
  // hatching on the shadow side, thickest at the face
  const fx = f[f.length >> 1][0];
  if (!lit) hatch(g, fx - 3, GY + 20, fx + 160, FLOOR + 30, 8, 0.32, 1.7);
  else hatch(g, fx - 70, GY + 30, fx + 4, FLOOR + 30, 12, 0.16, 1.5);
  // rock texture
  speckle(g, rng, x0, GY + 20, far, FLOOR + 160, 260, 'rgba(27,22,18,0.24)', 1.6);
  speckle(g, rng, x0, GY + 20, far, FLOOR + 160, 120, 'rgba(255,250,235,0.5)', 1.8);
  // cracks
  g.strokeStyle = 'rgba(27,22,18,0.55)';
  g.lineWidth = 2;
  g.beginPath();
  for (let k = 0; k < 7; k++) {
    let cx = lx - dir * (30 + rng() * 150), cy = GY + 60 + rng() * 300;
    g.moveTo(cx, cy);
    for (let j = 0; j < 4; j++) { cx += (rng() - 0.5) * 26; cy += 14 + rng() * 16; g.lineTo(cx, cy); }
  }
  g.stroke();
  g.restore();
}

/** A painted-on tunnel mouth: black arch, ink hatching, a bright rim and rails running into the dark. */
function arch(g, x, y) {
  g.save();
  g.beginPath();
  g.moveTo(x - 82, y);
  g.lineTo(x - 82, y - 78);
  g.quadraticCurveTo(x - 82, y - 168, x, y - 168);
  g.quadraticCurveTo(x + 82, y - 168, x + 82, y - 78);
  g.lineTo(x + 82, y);
  g.closePath();
  g.fillStyle = C.paper2; g.fill();
  g.lineWidth = 11; g.strokeStyle = C.ink; g.stroke();
  g.clip();
  g.fillStyle = C.ink;
  g.fillRect(x - 82, y - 170, 164, 172);
  g.strokeStyle = 'rgba(242,234,216,0.35)';
  g.lineWidth = 1.6;
  for (let k = 1; k <= 5; k++) { g.beginPath(); g.moveTo(x - 82 + k * 12, y); g.lineTo(x - 82 + k * 12 + 8, y - 160); g.stroke(); }
  g.restore();
  // keystone and little brickwork stones around the rim
  g.fillStyle = C.paper;
  g.strokeStyle = C.ink; g.lineWidth = 3;
  for (let k = 0; k < 9; k++) {
    const a = Math.PI + (k / 8) * Math.PI, rx = 92, ry = 176;
    const px = x + Math.cos(a) * rx * (k === 0 || k === 8 ? 0.98 : 1), py = y - 78 + Math.sin(a) * (ry - 78) * 1.02;
    g.save(); g.translate(px, py); g.rotate(a + Math.PI / 2);
    g.fillRect(-9, -9, 18, 18); g.strokeRect(-9, -9, 18, 18);
    g.restore();
  }
}

function billboard(g, rng, x, y, text, rot = 0) {
  g.save();
  g.translate(x, y); g.rotate(rot);
  g.fillStyle = C.ink; g.fillRect(-4, 0, 8, 56); // post
  g.fillStyle = C.paper;
  g.strokeStyle = C.ink; g.lineWidth = 4;
  g.beginPath(); g.rect(-62, -44, 124, 52); g.fill(); g.stroke();
  g.fillStyle = C.ink;
  g.font = '900 15px "Marker Felt","Chalkboard SE",Impact,"Rajdhani",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const lines = text.split('\n');
  lines.forEach((l, i) => g.fillText(l, 0, -18 + i * 17 - (lines.length - 1) * 6 + 8));
  g.restore();
}

/** Far mesas: two ranges of flat-topped buttes, paler the further away. */
function farRange(g, rng, col, col2, top, bot, count, wmin, wmax, alpha) {
  let x = -380 + rng() * 60;
  while (x < BOUNDS.x1 + 80) {
    const w = rand(rng, wmin, wmax), t = top + rng() * 70, tw = w * rand(rng, 0.62, 0.86);
    const x0 = x, x1 = x + w, cx = x + w / 2;
    g.beginPath();
    g.moveTo(x0, bot);
    g.lineTo(x0 + (w - tw) * 0.2, t + 60);
    g.lineTo(cx - tw / 2, t + 8);
    g.quadraticCurveTo(cx - tw / 2 + 4, t, cx - tw / 2 + 14, t);
    g.lineTo(cx + tw / 2 - 14, t);
    g.quadraticCurveTo(cx + tw / 2 - 4, t, cx + tw / 2, t + 8);
    g.lineTo(x1 - (w - tw) * 0.2, t + 60);
    g.lineTo(x1, bot);
    g.closePath();
    g.save();
    g.fillStyle = col; g.fill();
    g.clip();
    for (let y = t + 26, i = 0; y < bot; y += 22 + rng() * 14, i++) { g.fillStyle = i % 2 ? col2 : col; g.fillRect(x0, y, w, 10 + rng() * 6); }
    hatch(g, cx, t, x1 + 30, bot, 9, alpha * 1.6, 1.4);
    g.restore();
    g.lineWidth = 2.6; g.strokeStyle = `rgba(27,22,18,${alpha * 3.2})`; g.stroke();
    x += w * rand(rng, 0.55, 0.95);
  }
}

/** Everything static. ppu = pixels per world unit for the sharp terrain layer. */
export function bakeStage(seed, ppu) {
  const rng = makeRng(seed ^ 0x51ed);
  const p = clamp(Math.round(ppu * 10) / 10, 0.8, 1.3);

  // far mesas (soft, low resolution: they are the distance)
  const far = layer(BOUNDS.x0, 140, BOUNDS.x1, 560, Math.min(0.8, p));
  farRange(far.g, rng, '#e9e0cb', '#e0d6c0', 300, 560, 6, 200, 360, 0.05);
  const near = layer(BOUNDS.x0, 140, BOUNDS.x1, 560, Math.min(0.8, p));
  farRange(near.g, rng, '#d3c9b1', '#cabfa7', 380, 560, 8, 150, 300, 0.08);

  // the back wall of the canyon, with the painted tunnel mouths and the warning boards
  const wall = layer(330, 330, 1270, FLOOR + 6, Math.min(1, p));
  {
    const g = wall.g;
    g.beginPath();
    g.moveTo(300, FLOOR + 10); g.lineTo(300, 520);
    for (let x = 300; x <= 1300; x += 30) g.lineTo(x, 470 - Math.abs(noise2(x * 0.006, 1.7)) * 110 + (x > 640 && x < 960 ? -30 : 0));
    g.lineTo(1300, FLOOR + 10);
    g.closePath();
    g.save(); g.clip();
    g.fillStyle = '#ada28c'; g.fillRect(300, 330, 1000, FLOOR - 320);
    for (let y = 400, i = 0; y < FLOOR; y += 34 + rng() * 26, i++) { g.fillStyle = i % 2 ? '#a0957f' : '#b8ad97'; g.fillRect(300, y, 1000, 14 + rng() * 14); }
    const grd = g.createLinearGradient(0, 420, 0, FLOOR);
    grd.addColorStop(0, 'rgba(27,22,18,0)'); grd.addColorStop(1, 'rgba(27,22,18,0.42)');
    g.fillStyle = grd; g.fillRect(300, 330, 1000, FLOOR - 320);
    hatch(g, 300, 430, 1300, FLOOR, 13, 0.1, 1.5);
    speckle(g, rng, 300, 400, 1300, FLOOR, 160, 'rgba(27,22,18,0.22)', 1.4);
    g.restore();
    g.lineWidth = 4; g.strokeStyle = C.ink; g.stroke();
    for (const a of ARCH) arch(g, a.x, a.y);
    // a rail of two stripes leads from each arch to the floor
    billboard(g, rng, 545, 440, 'MIND THE\nANVILS', -0.05);
    billboard(g, rng, 1058, 440, 'LOOK LEFT\nLOOK RIGHT', 0.04);
  }

  // terrain: both mesas, the floor, the pillar, the boulders, rail ties
  const t = layer(BOUNDS.x0, GY - 80, BOUNDS.x1, BOUNDS.y1, p);
  {
    const g = t.g;
    // the pillar under the seesaw
    g.save();
    g.beginPath();
    g.moveTo(722, FLOOR + 6); g.lineTo(738, PIV.y + 40); g.quadraticCurveTo(730, PIV.y + 2, 760, PIV.y + 2);
    g.lineTo(840, PIV.y + 2); g.quadraticCurveTo(870, PIV.y + 2, 862, PIV.y + 40); g.lineTo(878, FLOOR + 6);
    g.closePath(); g.clip();
    g.fillStyle = '#e9dfc8'; g.fillRect(700, PIV.y, 200, FLOOR - PIV.y + 10);
    for (let y = PIV.y + 20, i = 0; y < FLOOR; y += 24 + rng() * 14, i++) { g.fillStyle = i % 2 ? '#d9cfb8' : '#f1e8d3'; g.fillRect(700, y, 200, 8 + rng() * 6); g.fillStyle = 'rgba(27,22,18,0.35)'; g.fillRect(700, y + 8, 200, 2); }
    const side = g.createLinearGradient(722, 0, 878, 0);
    side.addColorStop(0, 'rgba(27,22,18,0)'); side.addColorStop(0.55, 'rgba(27,22,18,0.1)'); side.addColorStop(1, 'rgba(27,22,18,0.5)');
    g.fillStyle = side; g.fillRect(700, PIV.y, 200, FLOOR - PIV.y + 10);
    hatch(g, 800, PIV.y, 900, FLOOR, 7, 0.45, 1.7);
    const gr = g.createLinearGradient(0, PIV.y, 0, FLOOR);
    gr.addColorStop(0, 'rgba(27,22,18,0)'); gr.addColorStop(1, 'rgba(27,22,18,0.4)');
    g.fillStyle = gr; g.fillRect(700, PIV.y, 200, FLOOR - PIV.y);
    speckle(g, rng, 700, PIV.y, 900, FLOOR, 70, 'rgba(27,22,18,0.28)', 1.4);
    g.restore();
    mesa(g, rng, 0);
    mesa(g, rng, 1);
    // the floor of the canyon
    g.save();
    g.beginPath(); g.rect(LIP[0] - 20, FLOOR, LIP[1] - LIP[0] + 40, 500); g.clip();
    g.fillStyle = C.g2; g.fillRect(LIP[0] - 20, FLOOR, 800, 500);
    g.fillStyle = C.paper2; g.fillRect(LIP[0] - 20, FLOOR, 800, 12);
    hatch(g, LIP[0], FLOOR, LIP[1], FLOOR + 300, 9, 0.25, 1.6);
    speckle(g, rng, LIP[0], FLOOR + 8, LIP[1], FLOOR + 300, 120, 'rgba(27,22,18,0.3)', 1.6);
    const fg = g.createLinearGradient(0, FLOOR, 0, FLOOR + 170);
    fg.addColorStop(0, 'rgba(27,22,18,0.05)'); fg.addColorStop(1, 'rgba(27,22,18,0.72)');
    g.fillStyle = fg; g.fillRect(LIP[0] - 20, FLOOR, 800, 500);
    g.restore();
    for (let i = 0; i < 16; i++) {
      const x = rand(rng, LIP[0] + 20, LIP[1] - 20), y = FLOOR + 14 + rng() * 60;
      g.fillStyle = C.g2; g.strokeStyle = C.ink; g.lineWidth = 2;
      g.beginPath(); g.ellipse(x, y, 4 + rng() * 7, 2.5 + rng() * 3, 0, 0, 6.283); g.fill(); g.stroke();
    }
    // rail ties along the floor
    g.fillStyle = C.g5;
    for (let x = LIP[0] + 6; x < LIP[1]; x += 26) g.fillRect(x, FLOOR - 4, 14, 8);
    g.fillStyle = C.ink; g.fillRect(LIP[0], FLOOR - 8, LIP[1] - LIP[0], 3);
    // pebbles and tufts on the mesa tops
    for (const side of [0, 1]) {
      for (let i = 0; i < 9; i++) {
        const x = side ? W - rand(rng, 30, 440) : rand(rng, 30, 440), y = GY + 3 + rng() * 8;
        g.fillStyle = C.g2; g.strokeStyle = C.ink; g.lineWidth = 1.6;
        g.beginPath(); g.ellipse(x, y, 3 + rng() * 4, 2 + rng() * 2, 0, 0, 6.283); g.fill(); g.stroke();
      }
    }
  }
  return { far, near, wall, terr: t, paths: outlines(rng) };
}

/** The ink on the rock: 3 variants of the same lines, each jittered differently. */
function outlines(rng) {
  const out = [];
  for (let v = 0; v < 3; v++) {
    const edge = new Path2D(), strata = new Path2D();
    const j = (i, a) => (hash1(i * 3.77 + v * 51.3) - 0.5) * 2 * a;
    let n = 0;
    const line = (pts, closed = false, path = edge) => {
      path.moveTo(pts[0][0] + j(n++, 1.8), pts[0][1] + j(n++, 1.8));
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        path.quadraticCurveTo((x0 + x1) / 2 + j(n++, 2.2), (y0 + y1) / 2 + j(n++, 2.2), x1 + j(n++, 1.6), y1 + j(n++, 1.6));
      }
      if (closed) path.closePath();
    };
    for (const side of [0, 1]) {
      const f = faceLine(side), dir = side ? -1 : 1, lx = f[0][0];
      line([[side ? W + 600 : -600, GY], [lx - dir * 28, GY], [lx + dir * 3, GY + 6], [lx + dir * 5, GY + 18]].concat(f.slice(1)));
      // strata edges across the face
      for (let k = 0; k < 6; k++) {
        const y = GY + 70 + k * 78 + hash1(k * 9.1 + side * 3.3) * 20, x = (f[Math.min(f.length - 1, 2 + k * 2)] || f[f.length - 1])[0];
        line([[x, y], [x - dir * 30, y + 3], [x - dir * 62, y - 1], [x - dir * (90 + hash1(k + side) * 40), y + 4]], false, strata);
      }
    }
    // floor lip
    line([[LIP[0] - 10, FLOOR], [620, FLOOR + 2], [800, FLOOR], [980, FLOOR + 2], [LIP[1] + 10, FLOOR]]);
    // pillar
    line([[722, FLOOR], [738, PIV.y + 40], [731, PIV.y + 4], [760, PIV.y + 1]]);
    line([[840, PIV.y + 1], [869, PIV.y + 4], [862, PIV.y + 40], [878, FLOOR]]);
    // boulders

    out.push({ edge, strata });
  }
  return out;
}
