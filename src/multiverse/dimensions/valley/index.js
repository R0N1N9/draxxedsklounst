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
    ROUND.winsToMatch = ctx.target; // the valley HUD draws one pip per point needed
    ROUND.insert = 7;
    const game = await ctx.valley.build({
      mode: ctx.mode,
      net: ctx.transport,
      difficulty: ctx.difficulty,
      oppName: ctx.players[1 - ctx.me].name,
      mv: {
        roundOver(winner, r) {
          const how = r.reason === 'kill' ? `${PART[r.part] || 'KILL'}${r.dist ? ` · ${Math.round(r.dist)} M` : ''}` : r.reason === 'time' && winner >= 0 ? 'UPLINKS' : '';
          cur.roundOver(winner, { how });
        },
      },
    });
    game.mvFreeze(); // built under a transition (or the loading screen): no HUD or input until begin()
    return {
      game,
      begin() { game.mvBegin(cur.score, cur.round); },
      freeze() { game.mvFreeze(); },
      suspend() { game.mvSuspend(); },
      resume(next) { cur = next; game.mvResume(); },
      capture(g, w, h) { game.mvCapture(g, w, h); },
      dispose() { game.mvSuspend(); },
    };
  },
};
