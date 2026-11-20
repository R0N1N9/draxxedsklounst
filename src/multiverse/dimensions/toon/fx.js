// Cartoon juice: inked smoke puffs, stars, wood chips, speed lines, expanding rings and the big hand-lettered
// BONK! pops. One pooled field, nothing allocated after construction.
import { C, blob, blobPath, starPath, letters, wline, jit } from './ink.js';

const K = { puff: 0, dot: 1, star: 2, spark: 3, ring: 4, text: 5, chip: 6, feather: 7, note: 8 };

export function makeFx(max = 240) {
  const P = [];
  for (let i = 0; i < max; i++) P.push({ k: 0, x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0, life: 0, age: 0, s: 1, s1: 1, rot: 0, spin: 0, col: '#fff', col2: C.ink, txt: '', live: false, id: i });
  let next = 0;
  const f = {
    emit(k, x, y, vx, vy, life, s, o) {
      const p = P[next];
      next = (next + 1) % max;
      p.k = K[k]; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.age = 0; p.s = s; p.s1 = s;
      p.g = 0; p.drag = 0; p.rot = 0; p.spin = 0; p.col = C.paper; p.col2 = C.ink; p.txt = '';
      if (o) for (const key in o) p[key] = o[key];
      p.live = true;
      return p;
    },
    /** A round ink-outlined smoke puff that swells and thins. */
    puff(x, y, vx, vy, s, life = 0.7, col = C.paper) { return f.emit('puff', x, y, vx, vy, life, s, { s1: s * 1.9, col, drag: 2, g: -30 }); },
    /** Dust: a few puffs along the ground. */
    dust(x, y, n, dir = 0, s = 9) { for (let i = 0; i < n; i++) f.puff(x + (Math.random() - 0.5) * 16, y - 2, dir * (30 + Math.random() * 40) + (Math.random() - 0.5) * 60, -10 - Math.random() * 25, s * (0.6 + Math.random() * 0.6), 0.45 + Math.random() * 0.2, C.paper2); },
    star(x, y, vx, vy, s, life = 0.8, col = C.paper) { return f.emit('star', x, y, vx, vy, life, s, { col, g: 500, spin: (Math.random() - 0.5) * 12, rot: Math.random() * 6 }); },
    /** Radiating speed lines / a starburst of sparks. */
    burst(x, y, n, speed, life = 0.35, col = C.ink) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.283 + Math.random() * 0.3, sp = speed * (0.6 + Math.random() * 0.6);
        f.emit('spark', x, y, Math.cos(a) * sp, Math.sin(a) * sp, life, 7 + Math.random() * 6, { col, drag: 5 });
      }
    },
    ring(x, y, r0, r1, life = 0.35, col = C.ink) { return f.emit('ring', x, y, 0, 0, life, r0, { s1: r1, col }); },
    chips(x, y, n, speed, col = C.g3) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.283, sp = speed * (0.3 + Math.random() * 0.8);
        f.emit('chip', x, y, Math.cos(a) * sp, Math.sin(a) * sp - speed * 0.4, 0.8 + Math.random() * 0.5, 5 + Math.random() * 6, { g: 1400, spin: (Math.random() - 0.5) * 20, rot: Math.random() * 6, col });
      }
    },
    feathers(x, y, n) { for (let i = 0; i < n; i++) f.emit('feather', x, y, (Math.random() - 0.5) * 220, -80 - Math.random() * 120, 1.1 + Math.random() * 0.6, 7 + Math.random() * 3, { g: 260, drag: 1.6, spin: (Math.random() - 0.5) * 6, col: C.g4 }); },
    note(x, y, col) { f.emit('note', x, y, (Math.random() - 0.5) * 30, -40 - Math.random() * 20, 1.2, 11, { col, rot: (Math.random() - 0.5) * 0.4 }); },
    /** A hand-lettered pop: BONK!, WHAP!, BOING! */
    text(txt, x, y, s = 34, col = C.paper, life = 0.95, rot = (Math.random() - 0.5) * 0.4) { return f.emit('text', x, y, 0, -28, life, s, { txt, col, rot, drag: 1.2 }); },
    update(dt) {
      for (let i = 0; i < max; i++) {
        const p = P[i];
        if (!p.live) continue;
        p.age += dt;
        if (p.age >= p.life) { p.live = false; continue; }
        if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; }
        p.vy += p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.rot += p.spin * dt;
      }
    },
    draw(g) {
      for (let i = 0; i < max; i++) {
        const p = P[i];
        if (!p.live) continue;
        const u = p.age / p.life, s = p.s + (p.s1 - p.s) * u;
        switch (p.k) {
          case 0: // puff
            g.globalAlpha = 1 - u * u;
            blob(g, p.x, p.y, s, s * 0.9, p.id * 3.7, p.col, Math.max(1.6, 3 - u * 2), 1.4, 9);
            g.globalAlpha = 1;
            break;
          case 1:
            g.fillStyle = p.col; g.globalAlpha = 1 - u;
            g.beginPath(); g.arc(p.x, p.y, s, 0, 6.283); g.fill();
            g.globalAlpha = 1;
            break;
          case 2: { // star
            g.globalAlpha = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
            starPath(g, p.x, p.y, s, p.rot);
            g.fillStyle = p.col; g.fill();
            g.lineWidth = 2.2; g.lineJoin = 'round'; g.strokeStyle = C.ink; g.stroke();
            g.globalAlpha = 1;
            break;
          }
          case 3: { // spark line along the velocity
            const sp = Math.hypot(p.vx, p.vy) || 1, ux = p.vx / sp, uy = p.vy / sp;
            g.globalAlpha = 1 - u;
            g.strokeStyle = p.col; g.lineWidth = 3; g.lineCap = 'round';
            g.beginPath(); g.moveTo(p.x - ux * s * 0.2, p.y - uy * s * 0.2); g.lineTo(p.x + ux * s, p.y + uy * s); g.stroke();
            g.globalAlpha = 1;
            break;
          }
          case 4: { // ring
            g.globalAlpha = 1 - u;
            g.strokeStyle = p.col; g.lineWidth = 4 * (1 - u) + 1.5;
            blobPath(g, p.x, p.y, s, s, p.id, 1.2, 14);
            g.stroke();
            g.globalAlpha = 1;
            break;
          }
          case 5: { // text
            const pop = u < 0.14 ? u / 0.14 : 1;
            const sc = 0.4 + 0.6 * (1 + 2.2 * Math.pow(pop - 1, 3) + 1.2 * Math.pow(pop - 1, 2)) + (u > 0.75 ? (u - 0.75) * 0.8 : 0);
            g.globalAlpha = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
            letters(g, p.txt, p.x, p.y, s * sc, p.rot + Math.sin(p.age * 30) * 0.03, p.col);
            g.globalAlpha = 1;
            break;
          }
          case 6: // wood chip
            g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = 1 - u * u;
            g.fillStyle = p.col; g.strokeStyle = C.ink; g.lineWidth = 2;
            g.fillRect(-s / 2, -s / 3, s, s * 0.66); g.strokeRect(-s / 2, -s / 3, s, s * 0.66);
            g.restore(); g.globalAlpha = 1;
            break;
          case 7: // feather
            g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = 1 - u;
            blob(g, 0, 0, s, s * 0.32, p.id, p.col, 1.8, 0.5, 8);
            g.restore(); g.globalAlpha = 1;
            break;
          default: { // note
            g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = 1 - u * u;
            g.fillStyle = p.col; g.strokeStyle = C.ink; g.lineWidth = 2;
            g.beginPath(); g.ellipse(0, 0, s * 0.42, s * 0.3, -0.4, 0, 6.283); g.fill(); g.stroke();
            g.beginPath(); g.moveTo(s * 0.36, -s * 0.12); g.lineTo(s * 0.36, -s * 1.1); g.lineTo(s * 0.8, -s * 0.7); g.stroke();
            g.restore(); g.globalAlpha = 1;
          }
        }
      }
    },
    clear() { for (const p of P) p.live = false; },
  };
  return f;
}

export { wline, jit };
