// TOY BOX — every surface is painted here, once per round, on small canvases: floorboards,
// the braided rug, the faces of the alphabet blocks, book covers, crayon drawings.
import { makeCanvas, makeRng, rand, mixHex, shade, TAU } from '../../kit.js';
import { RUG_A, RUG_B } from './world.js';

export const TOY = { red: '#cf4636', blue: '#2f6db4', green: '#3f9655', yellow: '#e4b233', wood: '#d9b17c', cream: '#efe4c8' };
const ROUND = '"Arial Rounded MT Bold", "Helvetica Neue", "Trebuchet MS", Arial, sans-serif';

export function makeTextures(THREE, renderer, seed, names, rich) {
  const rng = makeRng(seed ^ 0x70b0), all = [];
  const aniso = rich ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;
  const tex = (canvas, { repeat = false, srgb = true, an = 1 } = {}) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.anisotropy = an;
    all.push(t);
    return t;
  };

  // ---- floorboards: honey oak, varnished; the same boards drawn twice (colour, roughness) ----
  const BS = rich ? 1024 : 512, bc = makeCanvas(BS, BS), br = makeCanvas(BS, BS);
  {
    const g = bc.g, r = br.g, rows = 5, ph = BS / rows;
    for (let i = 0; i < rows; i++) {
      // Each row is two or three boards butted end to end.
      let x = -rand(rng, 0, BS * 0.5);
      while (x < BS) {
        const len = rand(rng, BS * 0.45, BS * 0.9), col = mixHex(mixHex('#8c7151', '#9c8160', rng()), '#7a6146', rng() * 0.5);
        for (const ox of [0, BS]) { // (wrap)
          g.fillStyle = col; g.fillRect(x - ox, i * ph, len, ph);
          r.fillStyle = shade('#6a6a6a', rand(rng, -0.1, 0.1)); r.fillRect(x - ox, i * ph, len, ph);
        }
        x += len;
      }
    }
    // Grain: long, slightly wavy lines that wrap.
    for (let k = 0; k < (rich ? 520 : 240); k++) {
      const y0 = rng() * BS, amp = rand(rng, 0.5, 3), per = 1 + Math.floor(rng() * 3), ph0 = rng() * TAU, dark = rng() < 0.6;
      g.strokeStyle = dark ? `rgba(48,30,16,${rand(rng, 0.05, 0.16)})` : `rgba(240,220,190,${rand(rng, 0.04, 0.1)})`;
      g.lineWidth = rand(rng, 0.6, 1.8);
      g.beginPath();
      for (let x = 0; x <= BS; x += 16) { const y = y0 + Math.sin((x / BS) * TAU * per + ph0) * amp; if (x) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
    }
    for (let k = 0; k < 7; k++) { // knots
      const x = rng() * BS, y = rng() * BS, s = rand(rng, 5, 11);
      for (let j = 4; j > 0; j--) { g.strokeStyle = `rgba(60,30,10,${0.08 * j})`; g.lineWidth = 1.5; g.beginPath(); g.ellipse(x, y, s * j * 0.5, s * j * 0.22, 0, 0, TAU); g.stroke(); }
      g.fillStyle = 'rgba(52,26,10,0.6)'; g.beginPath(); g.ellipse(x, y, s * 0.5, s * 0.25, 0, 0, TAU); g.fill();
    }
    // Seams between rows: a dark gap with a worn, lighter lip either side.
    for (let i = 0; i < rows; i++) {
      g.fillStyle = 'rgba(255,230,180,0.10)'; g.fillRect(0, i * ph + 2, BS, 2); g.fillRect(0, i * ph - 4, BS, 2);
      g.fillStyle = 'rgba(30,14,6,0.85)'; g.fillRect(0, i * ph - 1.5, BS, 3);
      r.fillStyle = '#f0f0f0'; r.fillRect(0, i * ph - 2, BS, 4);
    }
  }
  const boards = tex(bc.canvas, { repeat: true, an: aniso }), boardsRough = tex(br.canvas, { repeat: true, srgb: false, an: aniso });
  for (const t of [boards, boardsRough]) { t.repeat.set(1 / 13, 1 / 13); t.rotation = 0.62; }

  // ---- the rug: an oval of braid, coiled outwards from a centre seam ----
  const RW = rich ? 2048 : 1024, RH = Math.round((RW * RUG_B) / RUG_A), rc = makeCanvas(RW, RH);
  {
    const g = rc.g, k = RW / (RUG_A * 2), w = 0.52, rings = Math.floor(RUG_B / w);
    // Brick and rust, banded with navy, denim and oatmeal: warm, but dusty enough that the
    // amber plastic still jumps off it.
    const base = ['#6a3434', '#743d37', '#5e313a', '#78443a', '#6f3a30'];
    const special = { 0: '#232b47', 1: '#2a3454', 2: '#b7a27c', 3: '#232b47', 6: '#3b4a6b', 8: '#a8926c', 11: '#6d6248', 13: '#2a3454', 14: '#a8926c', 17: '#3b4a6b', 20: '#8f7a5a' };
    g.translate(RW / 2, RH / 2);
    for (let i = 0; i < rings; i++) {
      const a = (RUG_A - i * w) * k, b = (RUG_B - i * w) * k, col = special[i] || base[Math.floor(rng() * base.length)];
      g.fillStyle = col;
      g.beginPath(); g.ellipse(0, 0, a, b, 0, 0, TAU); g.fill();
      // The braid: short slanted strands, light then dark, all the way round.
      const n = Math.max(24, Math.floor(((a + b) * Math.PI) / 9)), ww = w * k;
      for (let j = 0; j < n; j++) {
        const t = (j / n) * TAU, x = Math.cos(t) * (a - ww * 0.5), y = Math.sin(t) * (b - ww * 0.5), tan = Math.atan2(b * Math.cos(t), -a * Math.sin(t));
        g.save();
        g.translate(x, y); g.rotate(tan + (j & 1 ? 0.6 : -0.6));
        g.fillStyle = j & 1 ? 'rgba(255,235,210,0.13)' : 'rgba(20,6,10,0.22)';
        g.beginPath(); g.ellipse(0, 0, ww * 0.62, ww * 0.2, 0, 0, TAU); g.fill();
        g.restore();
      }
      g.strokeStyle = 'rgba(20,6,10,0.4)'; g.lineWidth = 1.2;
      g.beginPath(); g.ellipse(0, 0, a, b, 0, 0, TAU); g.stroke();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
  const rug = tex(rc.canvas, { an: aniso });

  // ---- alphabet blocks: 4 x 4 faces. 0/1 the two players' initials, 2 V, 3 S, then letters and pictures ----
  const AS = 128, ac = makeCanvas(AS * 4, AS * 4);
  {
    const g = ac.g, inks = [TOY.red, TOY.blue, TOY.green, '#d9992a'];
    const initial = (n) => ((String(n || '').match(/[A-Za-z0-9]/) || ['?'])[0]).toUpperCase();
    const pool = shuffleStr('ABCDEFGHJKLMNOPQRTUWXYZ', rng);
    const glyphs = [initial(names[0]), initial(names[1]), 'V', 'S', ...pool.slice(0, 8)];
    for (let i = 0; i < 16; i++) {
      const x = (i % 4) * AS, y = Math.floor(i / 4) * AS, ink = i === 0 ? '#e08a1c' : i === 1 ? '#1f9aa6' : i === 2 || i === 3 ? TOY.red : inks[Math.floor(rng() * 4)];
      g.fillStyle = mixHex('#e3bf8c', '#d2a870', rng()); g.fillRect(x, y, AS, AS);
      for (let k = 0; k < 26; k++) { g.strokeStyle = `rgba(120,78,36,${rand(rng, 0.05, 0.14)})`; g.lineWidth = rand(rng, 0.5, 1.6); const yy = y + rng() * AS; g.beginPath(); g.moveTo(x, yy); g.bezierCurveTo(x + AS * 0.3, yy + rand(rng, -4, 4), x + AS * 0.7, yy + rand(rng, -4, 4), x + AS, yy); g.stroke(); }
      g.strokeStyle = ink; g.lineWidth = 9; g.lineJoin = 'round';
      g.strokeRect(x + 15, y + 15, AS - 30, AS - 30);
      g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `900 74px ${ROUND}`;
      const cx = x + AS / 2, cy = y + AS / 2;
      if (i < 12) g.fillText(glyphs[i], cx, cy + 5);
      else if (i === 12) { g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k / 10) * TAU, r = k & 1 ? 14 : 32; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.fill(); } // star
      else if (i === 13) { g.beginPath(); g.moveTo(cx, cy + 28); g.bezierCurveTo(cx - 46, cy - 4, cx - 22, cy - 40, cx, cy - 14); g.bezierCurveTo(cx + 22, cy - 40, cx + 46, cy - 4, cx, cy + 28); g.fill(); } // heart
      else if (i === 14) { g.beginPath(); g.arc(cx - 4, cy, 30, 0.9, TAU - 0.9); g.arc(cx + 14, cy, 24, TAU - 1.25, 1.25, true); g.fill(); } // moon
      else { g.beginPath(); g.arc(cx, cy, 28, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(cx - 9, cy - 9, 8, 0, TAU); g.fill(); } // ball
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, y, AS, 3); g.fillRect(x, y, 3, AS);
      g.fillStyle = 'rgba(60,30,10,0.22)'; g.fillRect(x, y + AS - 3, AS, 3); g.fillRect(x + AS - 3, y, 3, AS);
    }
  }
  const blocks = tex(ac.canvas, { an: Math.min(4, aniso) });

  // ---- picture books: three covers side by side ----
  const cc = makeCanvas(768, 192);
  {
    const g = cc.g, books = [['THE MOON', 'BOAT', '#24365f', '#f3d77a'], ['HOW TO TAME', 'A CLOUD', '#c9573b', '#fff3e0'], ['BUGS BUGS', 'BUGS', '#3d7f58', '#f6e9c9']];
    books.forEach(([l1, l2, bg, fg], i) => {
      const x = i * 256;
      g.fillStyle = bg; g.fillRect(x, 0, 256, 192);
      g.strokeStyle = fg; g.globalAlpha = 0.5; g.lineWidth = 3; g.strokeRect(x + 10, 10, 236, 172); g.globalAlpha = 1;
      g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `900 25px ${ROUND}`; g.fillText(l1, x + 128, 40); g.fillText(l2, x + 128, 68);
      if (i === 0) { g.beginPath(); g.arc(x + 128, 124, 30, 0, TAU); g.fill(); g.fillStyle = bg; g.beginPath(); g.arc(x + 142, 114, 27, 0, TAU); g.fill(); g.fillStyle = '#d8412f'; g.beginPath(); g.moveTo(x + 86, 150); g.lineTo(x + 170, 150); g.lineTo(x + 156, 168); g.lineTo(x + 100, 168); g.fill(); }
      else if (i === 1) { for (const [cx, cy, r] of [[100, 128, 22], [128, 116, 28], [158, 130, 20], [128, 138, 24]]) { g.beginPath(); g.arc(x + cx, cy, r, 0, TAU); g.fill(); } }
      else { g.fillStyle = '#d8412f'; g.beginPath(); g.ellipse(x + 128, 128, 34, 27, 0, 0, TAU); g.fill(); g.fillStyle = '#1c1c1c'; for (const [cx, cy] of [[114, 118], [140, 122], [124, 140], [146, 138]]) { g.beginPath(); g.arc(x + cx, cy, 5, 0, TAU); g.fill(); } g.fillRect(x + 126, 101, 3, 54); }
    });
  }
  const covers = tex(cc.canvas);

  // ---- crayon drawings on scrap paper: 2 x 2 sheets ----
  const pc = makeCanvas(512, 512);
  {
    const g = pc.g;
    g.fillStyle = '#d8d1bf'; g.fillRect(0, 0, 512, 512);
    g.lineCap = g.lineJoin = 'round';
    // A crayon line is several faint passes that do not quite agree.
    const stroke = (pts, col, w = 5) => {
      for (let pass = 0; pass < 4; pass++) {
        g.strokeStyle = col; g.globalAlpha = 0.34; g.lineWidth = w * rand(rng, 0.6, 1.1);
        g.beginPath();
        pts.forEach(([x, y], i) => { const jx = x + rand(rng, -1.6, 1.6), jy = y + rand(rng, -1.6, 1.6); if (i) g.lineTo(jx, jy); else g.moveTo(jx, jy); });
        g.stroke();
      }
      g.globalAlpha = 1;
    };
    const ring = (cx, cy, r, col, w) => stroke(Array.from({ length: 19 }, (_, i) => [cx + Math.cos((i / 18) * TAU) * r, cy + Math.sin((i / 18) * TAU) * r]), col, w);
    const man = (x, y, col) => { ring(x, y - 34, 9, col, 4); stroke([[x, y - 25], [x, y + 5]], col); stroke([[x - 12, y + 24], [x, y + 5], [x + 12, y + 24]], col); stroke([[x - 14, y - 12], [x + 20, y - 16]], col); };
    // 1: the battle plan
    man(60, 150, '#e08a1c'); man(196, 150, '#1f9aa6');
    for (let i = 0; i < 5; i++) stroke([[86 + i * 18, 132], [94 + i * 18, 132]], '#333', 3);
    stroke([[108, 52], [148, 92]], '#d8412f', 6); stroke([[148, 52], [108, 92]], '#d8412f', 6);
    stroke([[20, 200], [236, 204]], '#3c9a52', 7);
    // 2: house and sun
    stroke([[310, 200], [310, 120], [420, 120], [420, 200], [310, 200]], '#2c6fbd', 6); stroke([[300, 122], [365, 62], [430, 122]], '#d8412f', 7);
    stroke([[350, 200], [350, 160], [378, 160], [378, 200]], '#7a4a22'); ring(462, 52, 24, '#eab52c', 8);
    for (let i = 0; i < 6; i++) { const a = i * 0.7 + 1.2; stroke([[462 + Math.cos(a) * 32, 52 + Math.sin(a) * 32], [462 + Math.cos(a) * 46, 52 + Math.sin(a) * 46]], '#eab52c', 5); }
    // 3: rocket
    stroke([[100, 470], [100, 350], [128, 300], [156, 350], [156, 470], [100, 470]], '#2c6fbd', 6); ring(128, 372, 14, '#d8412f', 5);
    stroke([[100, 440], [72, 480], [100, 470]], '#d8412f', 6); stroke([[156, 440], [184, 480], [156, 470]], '#d8412f', 6);
    stroke([[112, 478], [128, 506], [144, 478]], '#eab52c', 7);
    for (const [x, y] of [[40, 300], [210, 320], [200, 420], [36, 400]]) { stroke([[x - 8, y], [x + 8, y]], '#eab52c', 4); stroke([[x, y - 8], [x, y + 8]], '#eab52c', 4); }
    // 4: a cat, probably
    ring(384, 400, 46, '#7a4a22', 6); stroke([[350, 368], [344, 330], [372, 356]], '#7a4a22', 6); stroke([[418, 368], [424, 330], [396, 356]], '#7a4a22', 6);
    ring(366, 392, 5, '#333', 4); ring(402, 392, 5, '#333', 4); stroke([[374, 418], [384, 424], [394, 418]], '#d8412f', 4);
    for (const s of [-1, 1]) for (const dy of [-6, 6]) stroke([[384 + s * 14, 410], [384 + s * 56, 410 + dy]], '#333', 2);
  }
  const paper = tex(pc.canvas);

  // ---- train track: pale beech with two grooves; tiles along its length ----
  const tc = makeCanvas(128, 64);
  {
    const g = tc.g;
    g.fillStyle = '#dcbd8c'; g.fillRect(0, 0, 128, 64);
    for (let k = 0; k < 30; k++) { g.fillStyle = `rgba(130,90,40,${rand(rng, 0.04, 0.12)})`; g.fillRect(0, rng() * 64, 128, rand(rng, 0.6, 1.6)); }
    g.fillStyle = '#7d5a34'; g.fillRect(0, 14, 128, 7); g.fillRect(0, 43, 128, 7);
    g.fillStyle = 'rgba(255,240,210,0.5)'; g.fillRect(0, 21, 128, 1.5); g.fillRect(0, 50, 128, 1.5);
    g.fillStyle = 'rgba(60,36,14,0.55)'; g.fillRect(0, 0, 2, 64);
  }
  const track = tex(tc.canvas, { repeat: true, an: Math.min(4, aniso) });

  // ---- dominoes: four faces in a row ----
  const dc = makeCanvas(256, 128);
  {
    const g = dc.g, pips = [[], [[0.5, 0.5]], [[0.28, 0.28], [0.72, 0.72]], [[0.28, 0.28], [0.5, 0.5], [0.72, 0.72]], [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]], [[0.28, 0.28], [0.72, 0.28], [0.5, 0.5], [0.28, 0.72], [0.72, 0.72]], [[0.28, 0.25], [0.72, 0.25], [0.28, 0.5], [0.72, 0.5], [0.28, 0.75], [0.72, 0.75]]];
    for (let i = 0; i < 4; i++) {
      const x = i * 64;
      g.fillStyle = '#f1ead8'; g.fillRect(x, 0, 64, 128);
      g.fillStyle = '#23201f'; g.fillRect(x + 8, 62, 48, 4);
      for (const half of [0, 1]) for (const [px, py] of pips[1 + Math.floor(rng() * 6)]) { g.beginPath(); g.arc(x + px * 64, half * 64 + py * 64, 6, 0, TAU); g.fill(); }
    }
  }
  const domino = tex(dc.canvas);

  // ---- the rug rolled up: braid along its length, a spiral of rings on each end ----
  const rs = makeCanvas(256, 64), rcap = makeCanvas(128, 128);
  {
    const g = rs.g, cols = ['#232b47', '#6a3434', '#2a3454', '#743d37', '#a8926c'];
    for (let i = 0; i < 8; i++) { g.fillStyle = cols[i % cols.length]; g.fillRect(i * 32, 0, 32, 64); }
    for (let x = 0; x < 256; x += 8) for (let y = 0; y < 64; y += 6) {
      g.fillStyle = (x / 8 + y / 6) & 1 ? 'rgba(255,235,210,0.12)' : 'rgba(20,6,10,0.25)';
      g.beginPath(); g.ellipse(x + 4, y + 3, 4.5, 1.6, (x / 8) & 1 ? 0.6 : -0.6, 0, TAU); g.fill();
    }
    const c = rcap.g;
    c.fillStyle = '#1e1a22'; c.fillRect(0, 0, 128, 128);
    c.lineCap = 'round';
    // An Archimedean spiral, one band per turn, in the rug's own colours.
    for (let k = 0; k < 360; k++) {
      const a0 = (k / 360) * TAU * 6, a1 = ((k + 1.5) / 360) * TAU * 6, r0 = 4 + (a0 / TAU) * 9.6, r1 = 4 + (a1 / TAU) * 9.6;
      c.strokeStyle = cols[Math.floor(a0 / TAU) % cols.length]; c.lineWidth = 8.6;
      c.beginPath(); c.moveTo(64 + Math.cos(a0) * r0, 64 + Math.sin(a0) * r0); c.lineTo(64 + Math.cos(a1) * r1, 64 + Math.sin(a1) * r1); c.stroke();
    }
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1;
    c.beginPath();
    for (let k = 0; k <= 360; k++) { const a = (k / 360) * TAU * 6, r = 8.3 + (a / TAU) * 9.6; c.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
    c.stroke();
  }
  const rollSide = tex(rs.canvas, { repeat: true }), rollCap = tex(rcap.canvas);

  return { boards, boardsRough, rug, blocks, covers, paper, track, domino, rollSide, rollCap, dispose() { for (const t of all) t.dispose(); } };
}

function shuffleStr(s, rng) {
  const a = s.split('');
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
