// VARGA VALLEY — the original Draxxed Sklounst duel, as a dimension.
//
// This is the one NATIVE dimension: the existing Game (src/game.js) keeps its own render
// loop, HUD, input, bot and netcode. It is built once, then suspended and resumed as the
// match passes through; the director only starts each round and is told how it ended.
import { ROUND } from '../../../config.js';

const PART = { head: 'HEADSHOT', torso: 'BODY SHOT', legs: 'LEG SHOT' };

export default {
  id: 'valley',
  name: 'VARGA VALLEY',
  tagline: 'One valley. Two rifles. Eight hundred metres.',
  perspective: 'FIRST PERSON · LONG-RANGE SIM',
  native: true,
  palette: { bg: '#120f2e', fg: '#e8e6f0', accent: '#f2b35b' },
  controls: {},

  async create(ctx) {
    let cur = ctx;
    // Built for round one, the valley must be indistinguishable from the classic game (the
    // mode keeps its secret until the first point), so its HUD and timings stay untouched.
    // Coming back later, it shows the real target and gets going a little quicker.
    const afterReveal = () => {
      ROUND.winsToMatch = cur.target; // one pip per point needed
      ROUND.insert = 7;
    };
    if (ctx.round > 1) afterReveal();
    const game = await ctx.valley.build({
      mode: ctx.mode,
      net: ctx.transport,
      difficulty: ctx.difficulty,
      oppName: ctx.players[1 - ctx.me].name,
      mv: {
        secret: () => cur.secret(),
        roundOver(winner, r) {
          const how = r.reason === 'kill' ? `${PART[r.part] || 'KILL'}${r.dist ? ` · ${Math.round(r.dist)} M` : ''}` : r.reason === 'time' && winner >= 0 ? 'UPLINKS' : '';
          return cur.roundOver(winner, { how, kill: r.reason === 'kill' });
        },
      },
    });
    // Built for round one it idles like the classic lobby; built under a transition it
    // stays frozen (no HUD or input) until begin().
    const opening = ctx.round === 1;
    if (opening) game.mvLobby();
    else game.mvFreeze();
    // Sides alternate by round and the spawn points come from the round's seed, so both
    // clients know where the round will start before it does.
    const pre = (c) => ({ sides: c.round % 2 === 0 ? [1, -1] : [-1, 1], spawns: [c.seed % 3, (c.seed >>> 3) % 3] });
    return {
      game,
      begin() { game.mvBegin(cur.score, cur.round, opening && cur.round === 1); },
      freeze() { game.mvFreeze(); },
      suspend() { game.mvSuspend(); },
      resume(next) { cur = next; afterReveal(); game.mvResume(pre(next)); },
      capture(g, w, h) { game.mvCapture(g, w, h); },
      dispose() { game.mvSuspend(); },
    };
  },
};
