// LIFE FLASH — the script: whose life it is, which memories made the cut, what they were
// shot on, what somebody wrote underneath, and when each one is on screen. Everything
// random is drawn here, once, from ctx.rng.
import { rand, randInt, pick, shuffle, randSign, clamp, hexToRgb } from '../../kit.js';
import { PLAYER_COLORS } from '../../contract.js';
import { SCENES, LOOKS } from './scenes.js';

// No clocks in a transition (both clients must cut the same film): "today" is a constant.
export const NOW = 2026;
export const DURATION = 11, SWAP_AT = 7.8 / DURATION;

export const T = (() => {
  const D = DURATION, swap = SWAP_AT * D; // computed the way the director computes it
  return {
    D, swap,
    mix0: 0.46, push1: 0.86,                 // the push-in dissolves into the face
    shock: 1.18, dilate: 1.68, plunge0: 1.8, plunge1: 2.24,
    leader: 2.24, card0: 2.52, reel0: 3.22, reel1: swap - 0.86,
    jam: swap - 0.66, burn0: swap - 0.6, white: swap - 0.2,
    flash0: swap + 0.14, flash1: swap + 0.85, // the white decays like a flashbulb
    land0: swap + 0.16, land1: swap + 0.74,
    dev0: swap + 0.6, dev1: swap + 2.05, cap0: swap + 1.0, cap1: swap + 1.65,
    push0: swap + 2.2, pushEnd: D - 0.24, fade0: D - 0.21, fade1: D - 0.05,
  };
})();

const TOWNS = ['Little Wobbling', 'Port Marrow', 'Upper Quill', 'Saltby-on-Sea', 'Dunmere', 'Ostvik', 'Three Chimneys', 'Fennel Bay', 'Mossgate',
  'Calder Ridge', 'San Brisco', 'Nettle Cross', 'Hollowell', 'Vantry', 'Greywater', 'Pine Halt', 'Lower Thimble', 'Kettleford'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// The pool. ages: when in a life it can happen; months: when in a year (null = the birthday).
const POOL = [
  { id: 'steps', ages: [1, 1], months: [0, 11], caps: ['First steps. {N} went straight for cover.', '{N} walks! Mostly sideways.', 'Day one on two feet. Low profile even then.'] },
  { id: 'cake', ages: [3, 7], months: null, caps: ['{N} turns {A}. One breath, every candle.', 'Happy {O}, {N}! Wished for a scope.', '{A} today. {N} did not share the cake.'] },
  { id: 'bike', ages: [5, 8], months: [3, 5], caps: ['No stabilisers! {N} lasted nine metres.', '{N} rides! Braking came later.', 'Look, no hands. Briefly.'] },
  { id: 'school', ages: [5, 6], months: [8, 8], caps: ['First day of school. {N} took the back row.', '{N}, first day. The bag weighed more.', 'Big school! {N} picked the seat with a view.'] },
  { id: 'hide', ages: [6, 10], months: [4, 8], caps: ['Hide-and-seek. {N} was found on Tuesday.', '{N}: undefeated at hide-and-seek.', 'We gave up looking. {N} won again.'] },
  { id: 'play', ages: [7, 10], months: [11, 11], caps: ['School play. {N} was Tree No. 2.', '{N} as "a tree". Nobody noticed. Perfect.', 'Did not move for two acts. Standing ovation.'] },
  { id: 'fair', ages: [8, 12], months: [6, 8], caps: ['{T} funfair. {N} won the big bear.', 'One cork, one bear. The stall closed early.', '{N} at the fair. Banned from the stall since.'] },
  { id: 'cans', ages: [9, 13], months: [5, 7], caps: ['Six cans, six stones. Sorry about the fence.', '{N} v. the cans. The cans lost.', 'Summer of the slingshot. {T} remembers.'] },
  { id: 'scope', ages: [10, 14], months: [9, 11], caps: ['First scope. {N} found the Moon.', '{N} and the telescope. Up all night.', 'Could name every crater by {A}.'] },
  { id: 'camera', ages: [11, 15], months: [11, 11], caps: ["{N}'s first shot. Everybody blinked.", 'Family portrait by {N}. The dog helped.', 'New camera. {N} shot the whole family.'] },
  { id: 'fish', ages: [12, 16], months: [5, 8], caps: ['Waited six hours. Caught a boot.', '{N} learns patience. Also footwear.', 'Biggest catch of the summer (size 9).'] },
  { id: 'car', ages: [17, 19], months: [0, 11], caps: ['Driving test. Every cone. On purpose?', '{N} passed. The cones did not.', 'Six cones, six hits. Examiner unwell.'] },
  { id: 'grad', ages: [18, 23], months: [5, 6], caps: ['Graduation. {N} threw the hat furthest.', 'Class of {Y}. The hat never came down.', '{N} graduates. Top of the class, hat-wise.'] },
  { id: 'range', ages: [16, 25], months: [2, 9], caps: ['First rifle, {T} range. 400 m, dead centre.', '{N} at the range. They framed the target.', 'First lesson. The instructor went very quiet.'] },
  { id: 'wedding', ages: [23, 38], months: [4, 8], caps: ['The big day. {N} did not miss it.', '{N} said yes. Kept the hat on.', 'Best day ever. The hat stayed on.'] },
];
const SHAKE_CAPS = ['This morning. {N} shook hands with {W}.', 'Before the duel. {W} seemed nice.', 'Good luck, {W}! (Meant it, too.)'];
const SHAKE_DUO = ['This morning. Handshakes all round.', 'Before the duel. May the best one win.', 'Good luck! (Both meant it.)'];

const STOCKS = [
  { lo: [0.1, 0.055, 0.03], hi: [1.0, 0.95, 0.84], leak: [1.0, 0.42, 0.12] },   // amber sunday film
  { lo: [0.1, 0.04, 0.075], hi: [1.0, 0.93, 0.9], leak: [1.0, 0.3, 0.36] },     // rose, a little magenta in the shadows
  { lo: [0.03, 0.07, 0.09], hi: [0.95, 1.0, 0.9], leak: [1.0, 0.62, 0.16] },    // sea-green, stored somewhere damp
];
// What each medium does to the projector: [grain, flicker, weave, tape, scratches, softness, vignette]
export const LOOK = {
  eye: [0.07, 0.0, 0.0, 0, 0, 0.25, 0.35],
  title: [0.14, 0.12, 1.0, 0, 1, 0.5, 0.6],
  s8: [0.15, 0.1, 1.0, 0, 1, 0.6, 0.55],
  pola: [0.06, 0.025, 0.2, 0, 0.15, 0.3, 0.4],
  vhs: [0.05, 0.0, 0.0, 1, 0, 0.25, 0.3],
  album: [0.06, 0.025, 0.2, 0, 0.15, 0.25, 0.4],
  kill: [0.12, 0.05, 0.6, 0, 0.8, 0.35, 0.45],
};

const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const fillIn = (s, v) => s.replace(/\{(\w)\}/g, (_, k) => (v[k] !== undefined ? v[k] : ''));
const isCool = (hex) => { const c = hexToRgb(hex); return c.b > c.r; };

function mediaFor(year, fav) {
  const m = ['album'];
  if (year <= 1985) m.push('s8', 's8');
  if (year >= 1975) m.push('pola');
  if (year >= 1983 && year <= 2007) m.push('vhs', 'vhs');
  if (m.includes(fav)) m.push(fav);
  return m;
}

export function makePlan(ctx, rng) {
  const duo = !ctx.loser || !ctx.winner;
  const mk = (p, i) => ({ name: p ? p.name : ['Amber', 'Cyan'][i], col: p ? p.color : PLAYER_COLORS[i] });
  const looks = shuffle(rng, [0, 1, 2, 3, 4]), hairs = shuffle(rng, [0, 1, 2, 3, 5]);
  const cast = (duo ? [mk(null, 0), mk(null, 1)] : [mk(ctx.loser, 0), mk(ctx.winner, 1)]).map((c, i) => ({
    ...c, cool: isCool(c.col), skin: LOOKS.SKINS[looks[i]], hair: LOOKS.HAIRS[hairs[i]],
  }));
  const hero = cast[0], rival = cast[1];
  const age = randInt(rng, 27, 61), birth = NOW - age, town = pick(rng, TOWNS), bMonth = randInt(rng, 0, 11);
  const fav = pick(rng, ['s8', 'pola', 'vhs', 'album']);
  const stock = pick(rng, STOCKS), fade = rand(rng, 0.42, 0.62);

  // --- the cut: five or six memories from the pool, then this morning's handshake ------------
  const n = randInt(rng, 5, 6);
  const chosen = shuffle(rng, POOL).slice(0, n).map((p) => ({ p, age: randInt(rng, p.ages[0], Math.min(p.ages[1], age - 1)) }));
  chosen.sort((a, b) => a.age - b.age || POOL.indexOf(a.p) - POOL.indexOf(b.p));
  let prevMedium = '';
  const cards = chosen.map((c, i) => {
    const who = duo ? cast[i % 2] : hero;
    const year = birth + c.age;
    const opts = mediaFor(year, fav).filter((x) => x !== prevMedium);
    const medium = pick(rng, opts.length ? opts : ['album']);
    prevMedium = medium;
    const month = c.p.months ? randInt(rng, c.p.months[0], c.p.months[1]) : bMonth;
    return {
      kind: 'mem', id: c.p.id, paint: SCENES[c.p.id], medium, year, age: c.age, month, day: randInt(rng, 1, 28), hour: randInt(rng, 9, 19), min: randInt(rng, 0, 59),
      caption: fillIn(pick(rng, c.p.caps), { N: who.name, T: town, A: c.age, O: ordinal(c.age), Y: year, W: rival.name }),
      tilt: rand(rng, 0.02, 0.07) * randSign(rng), tape: rng(), sticker: rng(),
      m: { ...who, age: c.age, n: randInt(rng, 0, 999) },
    };
  });
  const wp = ctx.from.palette;
  cards.push({
    kind: 'mem', id: 'shake', paint: SCENES.shake, medium: pick(rng, ['pola', 'album'].filter((x) => x !== prevMedium)), year: NOW, age, month: 0, day: 1, hour: 9, min: 0, today: true,
    caption: fillIn(pick(rng, duo ? SHAKE_DUO : SHAKE_CAPS), { N: hero.name, W: rival.name }),
    tilt: rand(rng, 0.02, 0.06) * randSign(rng), tape: rng(), sticker: rng(),
    m: { ...hero, age, n: randInt(rng, 0, 999), other: rival, world: { bg: wp.bg, fg: wp.fg, accent: wp.accent } },
  });

  // --- timing: every memory gets a little less time than the one before ----------------------
  const ratio = 0.84, span = T.reel1 - T.reel0, N = cards.length;
  let d = (span * (1 - ratio)) / (1 - Math.pow(ratio, N)), at = T.reel0;
  for (const c of cards) {
    c.t0 = at;
    c.dur = d;
    c.slip = clamp(d * 0.24, 0.085, 0.18);
    at += d;
    d *= ratio;
  }
  const how = ctx.how || '';
  let killCaps;
  if (duo) killCaps = ['Today. Nobody hit anything.', 'Just now: a draw. How embarrassing.', '…and then nothing happened. Twice.'];
  else {
    killCaps = ['…and then {W} happened.', 'Today. Never even saw {W}.', 'Just now. {W} says hello.'];
    if (how) killCaps.push('Today: {H}. Thanks, {W}.', 'Just now — {H}, courtesy of {W}.');
    if (ctx.matchPoint) killCaps.push('Today. Match point. Oh no.');
  }
  const title = { kind: 'title', medium: 'title', t0: T.card0, dur: T.reel0 - T.card0, slip: 0, year: birth, age: 0 };
  const kill = { kind: 'kill', medium: 'kill', t0: T.reel1, dur: T.white - T.reel1, slip: 0.1, year: NOW, age, caption: fillIn(pick(rng, killCaps), { W: rival.name, H: how }) };

  return {
    duo, cast, hero, rival, age, birth, town, stock, fade, cards, title, kill,
    all: [title, ...cards, kill],
    dir: randSign(rng),                                   // which way the reel runs
    page: pick(rng, [['#1f1b1a', '#f1e6cf', '#d9b45a'], ['#e9dcc1', '#33261f', '#2a1b17'], ['#b8956a', '#2a1b17', '#f6ead0']]), // album paper, pencil, corners
    felt: pick(rng, ['#2c1f1a', '#1f2a2c', '#2a2030']), // what the instant photos lie on
    seed: rand(rng, 0, 40),
    titleCard: {
      over: pick(rng, duo
        ? ['THE COLLECTED MEMORIES OF', 'A SHORT FILM ABOUT', 'HOME MOVIES · THE BEST OF']
        : ['THE COLLECTED MEMORIES OF', 'PREVIOUSLY, IN THE LIFE OF', 'A SHORT FILM ABOUT', 'HOME MOVIES · THE BEST OF', 'IN LOVING MEMORY OF THE LAST 30 SECONDS OF']),
      name: duo ? 'BOTH SNIPERS' : hero.name,
      sub: duo ? `b. ${birth}, ${town} and elsewhere` : `b. ${MONTHS[bMonth]} ${birth}, ${town}`,
      foot: pick(rng, ['REEL 1 OF 1', 'RUNNING TIME: FOUR SECONDS', 'DO NOT PROJECT NEAR OPEN FLAME', 'PLEASE REWIND AFTER USE']),
    },
    eye: {
      dive: randSign(rng), aim: randSign(rng), tilt: rand(rng, -0.05, 0.05), spread: rand(rng, 0.215, 0.245), y: rand(rng, 0.46, 0.52),
      brow: rand(rng, 0.7, 1.25), spokes: randInt(rng, 22, 34), lash: rng() < 0.5, freckles: rng() < 0.4, scar: rng() < 0.3,
      line: duo
        ? pick(rng, ['have just worked out that nobody won.', 'both blinked. Typical.', 'are about to remember everything.'])
        : fillIn(pick(rng, ['has just worked it out.', 'saw the glint. Too late.', 'is about to remember everything.', 'would like a word with {W}.', 'blinked. That was the mistake.']), { W: rival.name }),
      tag: duo ? 'STALEMATE · NO SHOT LANDED' : `${how || 'ONE CLEAN SHOT'} · ${rival.name}`,
    },
    burn: { ox: rand(rng, 0.25, 0.5) * randSign(rng), oy: rand(rng, 0.15, 0.35) * randSign(rng) },
    arrive: {
      ox: rand(rng, -0.05, 0.05), rot: rand(rng, 0.025, 0.07) * randSign(rng), spin: rand(rng, 0.25, 0.5) * randSign(rng),
      note: pick(rng, ['not dead. just here:', 'a new memory:', 'meanwhile, elsewhere:', 'next picture:', 'and then, somehow:']),
      when: pick(rng, ['today', 'right now', 'just now', 'day one']),
      ring: rand(rng, 0, 6.28), prints: cards.map(() => ({ r: rand(rng, 0.9, 1.08), rot: rand(rng, -0.5, 0.5), s: rand(rng, 0.26, 0.33), j: rand(rng, -0.25, 0.25) })),
      labelSide: randSign(rng), labelRot: [rand(rng, -0.06, 0.06), rand(rng, -0.05, 0.05), rand(rng, -0.08, 0.08)], seed: rand(rng, 0, 30),
    },
  };
}

export const dateWords = (c) => (c.today ? 'this morning' : `${MONTHS[c.month]} ${c.year}`);
export const dateShort = (c) => (c.today ? 'today' : `${MONTHS[c.month].slice(0, 3).toLowerCase()} '${String(c.year % 100).padStart(2, '0')}`);
export const dateStamp = (c) => `'${String(c.year % 100).padStart(2, '0')} ${String(c.month + 1).padStart(2, ' ')} ${String(c.day).padStart(2, ' ')}`;
export const dateTape = (c) => `${MONTHS[c.month].slice(0, 3).toUpperCase()}. ${String(c.day).padStart(2, '0')} ${c.year}`;
export const timeTape = (c) => `${c.hour >= 12 ? 'PM' : 'AM'} ${((c.hour + 11) % 12) + 1}:${String(c.min).padStart(2, '0')}`;
