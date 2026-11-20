// CONTINUE? — the timeline and the plan. Everything random is drawn here, once, from ctx.rng, in a
// fixed order; the film is afterwards a pure function of (plan, t).
import { rand, randInt, pick, shuffle, chance, randSign, TAU, mixHex } from '../../kit.js';
import { ERA_IDS, PHOSPHORS } from './looks.js';
import { METALS, tokenMetal } from './props.js';

export const DURATION = 11.0;
export const SWAP_AT = 0.75;
export const SWAP = SWAP_AT * DURATION; // computed the way the director computes it, so both agree to the bit

// The count: 9 .. 2 quicken like a pulse under stress; "1" is the long, slow-motion one.
const GAPS = [0.42, 0.39, 0.36, 0.33, 0.31, 0.29, 0.27, 0.25];
const DIG0 = 2.1;
const digitT = [];
{ let a = DIG0; for (const d of GAPS) { digitT.push(a); a += d; } }

export const T = {
  crunch: 0.74,         // the old world drains and crunches down
  over0: 0.52,          // first letter of GAME OVER leaves the top of the screen
  shift0: 1.62, shift1: 2.2, // …and the headline climbs out of the way
  dig0: DIG0, digitT, digitGap: GAPS,
  one: DIG0 + GAPS.reduce((a, b) => a + b, 0), // 4.72
  gag0: 4.2,            // the coin is tossed
  cardIn0: 7.2, cardIn1: 7.85,
  ready0: 7.52,
  flash0: 7.98, swap: SWAP,
  wipe0: 8.58, wipe1: 10.2,
  tail1: DURATION - 0.12,
};

const GHOSTS = ['ROOK', 'NIMBUS', 'COYOTE', 'MOTH', 'ZIPPER', 'LOTUS', 'KESTREL', 'TUNDRA', 'BISCUIT', 'HALO', 'ORBIT', 'FERN', 'PEPPER', 'ATLAS', 'QUILL'];
const TAUNTS = ['NEVER GIVE UP!', 'ONE MORE TRY?', 'THE WORLD IS WAITING', 'DO NOT LET THEM WIN', 'YOUR LEGEND IS NOT OVER', 'CAN YOU TAKE IT BACK?', 'DESTINY HAS A COIN SLOT'];
const WELCOME = ['WELCOME BACK!', "LET'S GO!", 'ROUND TWO MINUTES LATER', 'NEW WORLD LOADING', 'NO REGRETS!', 'ONE MORE SHOT!'];
const READY = ['READY?', 'GET READY!', 'READY...?', 'ARE YOU READY?'];
const QUIPS = ['STEADY HANDS', 'COLD NERVES', 'ZERO REGRETS', 'SMOOTH TRIGGER', 'NO BLINKING', 'WIND READ'];

export const up = (s) => String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();

function burst(rng, n, cols, spread = 1) {
  const l = [];
  for (let i = 0; i < n; i++) l.push({ a: rand(rng, 0, TAU), v: rand(rng, 6, 26) * spread, gr: rand(rng, 18, 46), s: rand(rng, 0.35, 0.8), c: pick(rng, cols), spin: rand(rng, -14, 14), long: chance(rng, 0.25) });
  return l;
}

export function makePlan(ctx, rng) {
  const draw = !ctx.winner || !ctx.loser;
  const W = ctx.winner, L = ctx.loser;
  const P0 = { index: 0, name: 'PLAYER 1', color: '#f2b35b' }, P1 = { index: 1, name: 'PLAYER 2', color: '#40d8e8' };
  const players = draw ? [P0, P1] : [];
  if (!draw) players[W.index] = W, players[L.index] = L;
  const pn = (p) => up(p.name).slice(0, 16) || 'PLAYER';
  const score = ctx.score.slice();

  const era = pick(rng, ERA_IDS);
  const phosphor = pick(rng, PHOSPHORS);
  const gag = pick(rng, ['rim', 'fumble', 'freeze']);
  const side = randSign(rng);
  const metalKind = pick(rng, ['gold', 'gold', 'silver', 'copper', 'token']);
  const wipeType = pick(rng, ['pixel', 'blinds', 'diamond']);
  const stageBg = pick(rng, ['stars', 'checker']);
  const cardIn = pick(rng, ['bands', 'cols']);
  const plan = {
    draw, era, phosphor, gag, side, wipeType, stageBg, cardIn,
    rayPhase: rand(rng, 0, TAU),
    bokeh: Array.from({ length: 14 }, () => ({ x: rand(rng, 0, 1), y: rand(rng, 0, 1), r: rand(rng, 1.5, 6), a: rand(rng, 0.03, 0.1), v: rand(rng, 0.01, 0.045) })),
    flips: randInt(rng, 2, 4),
    tilt0: rand(rng, -0.5, 0.5),
    wipeSeed: rand(rng, 0, 100),
    wipeDir: rand(rng, 0, TAU),
    wipeGrid: randInt(rng, 9, 15),
    wipeSlats: randInt(rng, 9, 16),
    wipeVert: chance(rng, 0.5),
    cardTilt: rand(rng, -0.025, 0.025),
    starSeed: rand(rng, 0, 1000),
    taunt: pick(rng, TAUNTS), welcome: pick(rng, WELCOME), ready: pick(rng, READY),
    stageWord: pick(rng, ['STAGE', 'STAGE', 'STAGE', 'LEVEL']),
    letter: Array.from({ length: 12 }, () => ({ d: rand(rng, 0, 0.09), r: rand(rng, -0.5, 0.5), x: rand(rng, -1.2, 1.2), b: rand(rng, 0.8, 1.15) })),
    ghostNames: shuffle(rng, GHOSTS),
    shakeSeed: rand(rng, 0, 99),
    names: draw ? [pn(P0), pn(P1)] : [],
  };
  const loseCol = draw ? null : L.color;
  plan.metal = metalKind === 'token' ? tokenMetal(loseCol || '#40d8e8') : METALS[metalKind];
  plan.metalB = METALS.silver;

  // --- who is who -----------------------------------------------------------------------------
  plan.winCol = draw ? '#ffe14a' : W.color;
  plan.loseCol = draw ? '#ffffff' : L.color;
  plan.slots = draw ? [{ col: P0.color, name: pn(P0) }, { col: P1.color, name: pn(P1) }] : [{ col: L.color, name: pn(L) }];
  plan.loserName = draw ? 'BOTH PLAYERS' : pn(L);
  plan.winnerName = draw ? '' : pn(W);

  // --- the high-score table: the real match score, then ghosts of other matches -------------------
  const rows = draw ? [P0, P1] : [W, L];
  const real = rows.map((p) => ({ name: pn(p), col: p.color, pts: score[p.index], real: true, win: !draw && p === W, idx: p.index }));
  real.sort((a, b) => b.pts - a.pts || (a.win ? -1 : 1));
  const low = real.length ? real[real.length - 1].pts : 0;
  const ghosts = [];
  for (let i = 0; i < 3; i++) ghosts.push({ name: plan.ghostNames[i], col: null, pts: Math.max(0, low - randInt(rng, 0, 1) - (i > 1 ? 1 : 0)), real: false });
  plan.table = real.concat(ghosts);

  // --- the bonus tally for the round just played -------------------------------------------------
  const m = /(\d{2,4})\s*(?:m\b|meter|metre)/i.exec(ctx.how || '');
  const dist = m ? +m[1] : randInt(rng, 96, 468);
  const how = up(ctx.how);
  const prev = draw ? [0, 0] : score.map((s, i) => (i === W.index ? s - 1 : s));
  const lines = [];
  lines.push({ label: draw ? 'ROUND' : 'DISTANCE', value: draw ? 'DRAWN' : dist + ' M', pts: draw ? 0 : dist * 10 });
  lines.push({ label: 'STYLE', value: (m ? 'LONG SHOT' : how) || (draw ? 'STALEMATE' : 'CLEAN SHOT'), pts: draw ? 0 : randInt(rng, 12, 45) * 100 });
  if (draw) lines.push({ label: 'KILLS', value: '0', pts: 0 });
  const extras = [];
  if (!draw && prev[W.index] < prev[L.index]) extras.push({ label: 'COMEBACK', value: 'BONUS', pts: randInt(rng, 20, 60) * 100 });
  if (!draw && prev[0] + prev[1] === 0) extras.push({ label: 'OPENING SHOT', value: 'BONUS', pts: 5000 });
  if (ctx.matchPoint) extras.push({ label: 'MATCH POINT', value: 'BONUS', pts: 9000 });
  extras.push({ label: pick(rng, QUIPS), value: '', pts: randInt(rng, 5, 30) * 100 });
  const take = shuffle(rng, extras).slice(0, randInt(rng, 1, 2));
  if (!draw) lines.push(...take);
  lines.push({ label: 'MERCY', value: draw ? 'BOTH' : '', pts: 0 });
  plan.tally = lines;
  plan.tallyTotal = lines.reduce((a, l) => a + l.pts, 0);

  // --- bursts -------------------------------------------------------------------------------------
  const wc = plan.winCol;
  plan.sparkLand = burst(rng, 10, [wc, '#ffffff', '#ffe14a'], 0.7);
  plan.burstSlot = burst(rng, 40, [plan.metal.rim, '#ffffff', wc, plan.loseCol, '#ffe14a']);
  plan.burstPay = burst(rng, 18, [wc, '#ffffff'], 0.55);
  plan.stars = Array.from({ length: 160 }, () => ({ a: rand(rng, 0, TAU), p: rand(rng, 0, 1), s: rand(rng, 0.5, 1.5), c: rand(rng, 0, 1) }));
  plan.matchPoint = ctx.matchPoint;
  plan.nextRound = ctx.round + 1;
  return plan;
}

export { mixHex };
