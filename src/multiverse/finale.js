// The place a match ends up: not a duel, just the winner's colours and a slow
// burst of light behind the end-of-match card. It is mounted like a dimension so
// that the last transition has somewhere to arrive.

const TAU = Math.PI * 2;

export default {
  id: '@finale',
  name: 'THE LAST DIMENSION',
  tagline: 'Every other timeline has gone quiet.',
  perspective: 'END OF THE LINE',
  renderer: '2d',
  aim: 'pointer',
  palette: { bg: '#07060d', fg: '#f4f1ff', accent: '#f2b35b' },
  controls: {},
  create(ctx) {
    const win = ctx.final && ctx.final.winner >= 0 ? ctx.players[ctx.final.winner] : null;
    const col = win ? win.color : '#e8e6f0';
    const lose = win ? ctx.players[1 - win.index].color : '#888';
    const motes = [];
    for (let i = 0; i < 140; i++) {
      motes.push({ a: ctx.rng() * TAU, r: 0.05 + ctx.rng() * 1.1, s: 0.02 + ctx.rng() * 0.09, z: 0.6 + ctx.rng() * 2.4, c: ctx.rng() < 0.8 ? col : lose, p: ctx.rng() * TAU });
    }
    let t = 0;
    return {
      update(dt) { t += dt; },
      render() {
        const g = ctx.g, w = ctx.width, h = ctx.height, cx = w / 2, cy = h * 0.46, R = Math.hypot(w, h) * 0.6;
        g.fillStyle = '#07060d';
        g.fillRect(0, 0, w, h);
        // Slow rays in the winner's colour.
        g.save();
        g.translate(cx, cy);
        g.rotate(t * 0.05);
        g.globalAlpha = 0.1;
        g.fillStyle = col;
        for (let i = 0; i < 18; i++) {
          g.rotate(TAU / 18);
          g.beginPath();
          g.moveTo(0, 0);
          g.lineTo(R, -R * 0.045);
          g.lineTo(R, R * 0.045);
          g.fill();
        }
        g.restore();
        const glow = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.7);
        glow.addColorStop(0, col);
        glow.addColorStop(0.18, 'rgba(255,255,255,0.10)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        g.globalAlpha = 0.5 + 0.08 * Math.sin(t * 1.3);
        g.fillStyle = glow;
        g.fillRect(0, 0, w, h);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'lighter';
        for (const m of motes) {
          const a = m.a + t * m.s, r = ((m.r + t * m.s * 0.4) % 1.15) * R * 0.75;
          g.globalAlpha = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2 + m.p));
          g.fillStyle = m.c;
          g.beginPath();
          g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.72, m.z, 0, TAU);
          g.fill();
        }
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
      },
      dispose() {},
    };
  },
};
