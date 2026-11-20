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
        roundOver(winner, r) {
          const how = r.reason === 'kill' ? `${PART[r.part] || 'KILL'}${r.dist ? ` · ${Math.round(r.dist)} M` : ''}` : r.reason === 'time' && winner >= 0 ? 'UPLINKS' : '';
          return cur.roundOver(winner, { how });
        },
      },
    });
    game.mvFreeze(); // built under a transition (or the loading screen): no HUD or input until begin()
    return {
      game,
      begin() { game.mvBegin(cur.score, cur.round); },
      freeze() { game.mvFreeze(); },
      suspend() { game.mvSuspend(); },
      resume(next) { cur = next; afterReveal(); game.mvResume(); },
      capture(g, w, h) { game.mvCapture(g, w, h); },
      dispose() { game.mvSuspend(); },
    };
  },
};
