// Topographic briefing map of the real valley, drawn from the same height function as the game.
import { baseHeight, crestAt, riverZ, DAM_X, LIFT_X } from './terrain.js';

const X0 = -760, X1 = 760, Z0 = -560, Z1 = 560;
const STEP = 5;
let cache = null;

function heights() {
  if (cache) return cache;
  const nx = Math.round((X1 - X0) / STEP) + 1, nz = Math.round((Z1 - Z0) / STEP) + 1;
  const H = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) H[j * nx + i] = baseHeight(X0 + i * STEP, Z0 + j * STEP);
  return (cache = { H, nx, nz });
}

export function drawMap(canvas) {
  const wrap = canvas.parentElement;
  const W = wrap.clientWidth, Hh = wrap.clientHeight;
  if (!W || !Hh) return;
  const dpr = Math.min(devicePixelRatio, 2);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(Hh * dpr);
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const { H, nx, nz } = heights();
  // Fit world rect into canvas (north = +Z up).
  const s = Math.min(W / (X1 - X0), Hh / (Z1 - Z0));
  const ox = (W - (X1 - X0) * s) / 2, oy = (Hh - (Z1 - Z0) * s) / 2;
  const mx = (x) => ox + (x - X0) * s;
  const my = (z) => oy + (Z1 - z) * s;

  // Hillshaded relief.
  const img = c.createImageData(nx, nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const h = H[j * nx + i];
      const hx = H[j * nx + Math.min(i + 1, nx - 1)] - H[j * nx + Math.max(i - 1, 0)];
      const hz = H[Math.min(j + 1, nz - 1) * nx + i] - H[Math.max(j - 1, 0) * nx + i];
      // Light from the north-west.
      const shade = Math.max(0, Math.min(1, 0.55 + (-hx * 0.6 + hz * 0.6) * 0.06));
      const e = Math.min(1, Math.max(0, h / 160));
      const row = nz - 1 - j; // flip so +Z is up
      const k = (row * nx + i) * 4;
      img.data[k] = 14 + e * 22 + shade * 26;
      img.data[k + 1] = 15 + e * 20 + shade * 24;
      img.data[k + 2] = 24 + e * 26 + shade * 30;
      img.data[k + 3] = 255;
    }
  }
  const off = document.createElement('canvas');
  off.width = nx;
  off.height = nz;
  off.getContext('2d').putImageData(img, 0, 0);
  c.imageSmoothingEnabled = true;
  c.drawImage(off, mx(X0), my(Z1), (X1 - X0) * s, (Z1 - Z0) * s);

  // Contours via marching squares.
  const levels = [];
  for (let L = 5; L < 420; L += 10) levels.push(L);
  for (const L of levels) {
    const major = L % 50 === 5;
    c.strokeStyle = major ? 'rgba(200,205,235,0.32)' : 'rgba(200,205,235,0.11)';
    c.lineWidth = major ? 1 : 0.7;
    c.beginPath();
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = H[j * nx + i], b = H[j * nx + i + 1], d = H[(j + 1) * nx + i], e = H[(j + 1) * nx + i + 1];
        const cs = (a > L ? 1 : 0) | (b > L ? 2 : 0) | (e > L ? 4 : 0) | (d > L ? 8 : 0);
        if (cs === 0 || cs === 15) continue;
        const x = X0 + i * STEP, z = Z0 + j * STEP;
        const pt = (h1, h2, x1, z1, x2, z2) => {
          const t = (L - h1) / (h2 - h1);
          return [mx(x1 + (x2 - x1) * t), my(z1 + (z2 - z1) * t)];
        };
        const eB = () => pt(a, b, x, z, x + STEP, z); // bottom edge (a-b)
        const eR = () => pt(b, e, x + STEP, z, x + STEP, z + STEP);
        const eT = () => pt(d, e, x, z + STEP, x + STEP, z + STEP);
        const eL = () => pt(a, d, x, z, x, z + STEP);
        const seg = (p, q) => { c.moveTo(p[0], p[1]); c.lineTo(q[0], q[1]); };
        switch (cs) {
          case 1: case 14: seg(eL(), eB()); break;
          case 2: case 13: seg(eB(), eR()); break;
          case 3: case 12: seg(eL(), eR()); break;
          case 4: case 11: seg(eR(), eT()); break;
          case 5: seg(eL(), eT()); seg(eB(), eR()); break;
          case 6: case 9: seg(eB(), eT()); break;
          case 7: case 8: seg(eL(), eT()); break;
          case 10: seg(eL(), eB()); seg(eR(), eT()); break;
        }
      }
    }
    c.stroke();
  }

  // Grid.
  c.strokeStyle = 'rgba(242,179,91,0.07)';
  c.lineWidth = 1;
  c.beginPath();
  for (let x = -700; x <= 700; x += 100) { c.moveTo(mx(x), my(Z1)); c.lineTo(mx(x), my(Z0)); }
  for (let z = -500; z <= 500; z += 100) { c.moveTo(mx(X0), my(z)); c.lineTo(mx(X1), my(z)); }
  c.stroke();
  const mono = (sz, w = 500) => `${w} ${sz}px 'JetBrains Mono', ui-monospace, monospace`;
  c.fillStyle = 'rgba(242,179,91,0.45)';
  c.font = mono(8);
  c.textAlign = 'center';
  for (let x = -600; x <= 600; x += 200) c.fillText(String((x + 800) / 100).padStart(2, '0'), mx(x), my(Z1) + 10);

  // Combat boundary.
  c.setLineDash([4, 4]);
  c.strokeStyle = 'rgba(255,93,85,0.35)';
  c.strokeRect(mx(-700), my(520), 1400 * s, 1040 * s);
  c.setLineDash([]);

  // Ridge spawn bands.
  for (const side of [-1, 1]) {
    c.strokeStyle = side < 0 ? 'rgba(98,217,232,0.55)' : 'rgba(255,93,85,0.55)';
    c.lineWidth = 1.5;
    c.beginPath();
    for (let x = -680; x <= 680; x += 10) {
      const z = side * crestAt(x);
      if (x === -680) c.moveTo(mx(x), my(z)); else c.lineTo(mx(x), my(z));
    }
    c.stroke();
    c.fillStyle = side < 0 ? 'rgba(98,217,232,0.85)' : 'rgba(255,93,85,0.85)';
    c.font = mono(9, 600);
    c.textAlign = 'left';
    c.fillText(side < 0 ? 'S RIDGE' : 'N RIDGE', mx(-690), my(side * crestAt(-690)) + (side < 0 ? 14 : -7));
  }
  // Dry river.
  c.strokeStyle = 'rgba(150,170,210,0.35)';
  c.setLineDash([2, 3]);
  c.beginPath();
  for (let x = DAM_X + 8; x <= 700; x += 6) {
    if (Math.abs(x) < 125) continue;
    const y = my(riverZ(x));
    if (x === DAM_X + 8 || Math.abs(x - 125) < 6) c.moveTo(mx(x), y); else c.lineTo(mx(x), y);
  }
  c.stroke();
  c.setLineDash([]);
  // Town blocks.
  c.fillStyle = 'rgba(232,230,240,0.22)';
  const blocks = [[-28, 24, 14, 12], [-47, 27, 10, 14], [-88, 30, 16, 12], [-63, 54, 12, 10], [-31, 54, 12, 12], [15, 26, 12, 12], [36, 27, 12, 12], [59, 29, 14, 12], [90, 27, 12, 12], [18, 55, 14, 10], [50, 57, 12, 12], [86, 57, 10, 12], [-96, 60, 10, 10], [-6, 74, 12, 8]];
  for (const [x, z, w, d] of blocks) for (const zz of [z, -z]) c.fillRect(mx(x - w / 2), my(zz + d / 2), w * s, d * s);
  c.fillRect(mx(32), my(7), 31 * s, 14 * s);
  // Dam and lift.
  c.strokeStyle = 'rgba(232,230,240,0.7)';
  c.lineWidth = 3;
  c.beginPath(); c.moveTo(mx(DAM_X), my(-230)); c.lineTo(mx(DAM_X), my(230)); c.stroke();
  c.lineWidth = 1;
  c.setLineDash([6, 3]);
  c.beginPath(); c.moveTo(mx(LIFT_X), my(-390)); c.lineTo(mx(LIFT_X), my(390)); c.stroke();
  c.setLineDash([]);

  // Range line ridge to ridge.
  const rx = -330;
  c.strokeStyle = 'rgba(242,179,91,0.6)';
  c.beginPath();
  c.moveTo(mx(rx), my(-crestAt(rx))); c.lineTo(mx(rx), my(crestAt(rx)));
  for (const z of [-crestAt(rx), crestAt(rx)]) { c.moveTo(mx(rx) - 4, my(z)); c.lineTo(mx(rx) + 4, my(z)); }
  c.stroke();
  c.save();
  c.translate(mx(rx) - 6, my(0));
  c.rotate(-Math.PI / 2);
  c.fillStyle = 'rgba(242,179,91,0.9)';
  c.font = mono(9, 600);
  c.textAlign = 'center';
  c.fillText(`${Math.round(crestAt(rx) * 2)} M`, 0, 0);
  c.restore();

  // Uplinks.
  const ups = [['A', 'TOWN', 0, 0], ['B', 'DAM', DAM_X, 0], ['C', 'LIFT', LIFT_X - 11, 0]];
  for (const [n, label, x, z] of ups) {
    const px = mx(x), py = my(z);
    c.save();
    c.translate(px, py);
    c.rotate(Math.PI / 4);
    c.fillStyle = 'rgba(10,10,16,0.9)';
    c.fillRect(-7, -7, 14, 14);
    c.strokeStyle = '#f2b35b';
    c.lineWidth = 1.5;
    c.strokeRect(-7, -7, 14, 14);
    c.restore();
    c.fillStyle = '#f2b35b';
    c.font = mono(10, 700);
    c.textAlign = 'center';
    c.fillText(n, px, py + 3.5);
    c.font = mono(8, 600);
    c.fillStyle = 'rgba(242,179,91,0.8)';
    c.fillText(label, px, py + 22);
  }

  // North arrow + scale bar.
  c.fillStyle = 'rgba(232,230,240,0.8)';
  c.strokeStyle = 'rgba(232,230,240,0.8)';
  const nxp = W - 26, nyp = 34;
  c.beginPath(); c.moveTo(nxp, nyp - 16); c.lineTo(nxp - 6, nyp); c.lineTo(nxp, nyp - 4); c.lineTo(nxp + 6, nyp); c.closePath(); c.fill();
  c.font = mono(9, 700);
  c.textAlign = 'center';
  c.fillText('N', nxp, nyp + 12);
  const sb = 200 * s, sx = W - 20 - sb, sy = Hh - 18;
  c.lineWidth = 1;
  c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + sb, sy); c.moveTo(sx, sy - 4); c.lineTo(sx, sy + 2); c.moveTo(sx + sb, sy - 4); c.lineTo(sx + sb, sy + 2); c.moveTo(sx + sb / 2, sy - 2); c.lineTo(sx + sb / 2, sy + 1); c.stroke();
  c.font = mono(8);
  c.fillText('200 M', sx + sb / 2, sy - 6);
}
