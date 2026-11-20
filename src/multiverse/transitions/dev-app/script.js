// DEV-APP — the script: everything the film SAYS. The dialog copy, which gag plays, the
// source file that types itself, the build steps, the console and the toast are all
// decided here, once, from ctx.rng and the round's context. No drawing, no clocks.
import { pick, shuffle, chance, rand, randInt, clamp, mixHex, luminance } from '../../kit.js';

export const titleCase = (s) => String(s || '').toLowerCase().replace(/(^|[\s\-_:·./])([a-z])/g, (m, a, b) => a + b.toUpperCase());
export const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'app';
const str = (s) => '"' + String(s == null ? '' : s).replace(/["\\]/g, '') + '"';

// ---------------------------------------------------------------------------
// Syntax colouring. One pass per line at create(); the renderer only walks the tokens.
// ---------------------------------------------------------------------------
const KEYWORDS = new Set(['import', 'from', 'export', 'default', 'new', 'const', 'let', 'class', 'extends', 'return', 'static']);
const LITERALS = new Set(['true', 'false', 'null', 'undefined']);
const TOKEN = /(\/\/.*$)|("(?:[^"\\]|\\.)*")|(\d+(?:\.\d+)?)|([A-Za-z_$@][\w$]*)|(\s+)|(.)/g;

/** line → [{s, c, k, color?}] with c = start column and k = token kind. names = [[text, kind], ...] to pick out. */
export function tokenize(line, names) {
  const out = [];
  let m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(line))) {
    const c = m.index, s = m[0];
    if (m[5]) continue;
    let k = 'pun', color;
    if (m[1]) k = 'com';
    else if (m[2]) {
      k = 'str';
      if (/^"#[0-9a-fA-F]{3,8}"$/.test(s)) { k = 'hex'; color = s.slice(1, -1); }
    } else if (m[3]) k = 'num';
    else if (m[4]) {
      const next = line.slice(c + s.length).replace(/^\s+/, '')[0];
      const prev = line[c - 1];
      if (KEYWORDS.has(s)) k = 'kw';
      else if (LITERALS.has(s)) k = 'num';
      else if (next === '(' && !/^[A-Z]/.test(s)) k = 'fn';
      else if (/^[A-Z][A-Z0-9_]+$/.test(s)) k = 'cst';
      else if (/^[A-Z]/.test(s)) k = 'type';
      else if (next === ':' || prev === '.') k = 'prop';
      else k = 'id';
    }
    // Player callsigns keep their identity colour wherever they appear, so each player
    // finds their own name in the wall of code at a glance.
    if ((k === 'str' || k === 'com') && names) {
      let rest = s, col = c;
      for (let guard = 0; guard < 6 && rest; guard++) {
        let at = -1, hit = null;
        for (const n of names) {
          const i = n[0] ? rest.indexOf(n[0]) : -1;
          if (i >= 0 && (at < 0 || i < at)) { at = i; hit = n; }
        }
        if (!hit) break;
        if (at > 0) out.push({ s: rest.slice(0, at), c: col, k });
        out.push({ s: hit[0], c: col + at, k: hit[1] });
        col += at + hit[0].length;
        rest = rest.slice(at + hit[0].length);
      }
      if (rest) out.push({ s: rest, c: col, k });
      continue;
    }
    out.push({ s, c, k, color });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------
const GAGS = ['dodge', 'relabel', 'later', 'countdown', 'fall'];
const THEMES = ['dark', 'light', 'retro'];
const BRANDS = { dark: ['#7a6cff', '#19c28a', '#ff7a4d', '#3d95ff', '#f0569f'], light: ['#5b4be6', '#0c9f6f', '#e8552a', '#1d6fe0', '#d63384'], retro: ['#1f6f6b', '#b5482f', '#3a4f9c'] };
const APPS = ['Develop-O-Matic', 'App Builder Deluxe', 'Appsolutely Studio', 'My First App Pro', 'Apps For Everyone'];

export function makePlan(ctx, to = ctx.to) {
  const rng = ctx.rng;
  const from = ctx.from;
  const W = ctx.winner ? ctx.winner.name : null, L = ctx.loser ? ctx.loser.name : null;
  const how = String(ctx.how || '').trim();
  const isValley = from.id === 'valley';
  const fromTitle = titleCase(from.name) || 'This world';
  const oldThing = isValley ? 'the valley' : fromTitle;
  const oldFile = isValley ? 'valley' : slug(from.name);
  const s0 = ctx.score ? ctx.score[0] | 0 : 0, s1 = ctx.score ? ctx.score[1] | 0 : 0;

  // -- the four big axes -------------------------------------------------------
  const gag = pick(rng, GAGS);
  const theme = pick(rng, THEMES);
  const brand = pick(rng, BRANDS[theme]);
  const side = chance(rng, 0.5) ? 'right' : 'left';
  const style = pick(rng, ['config', 'imperative', 'chain']);
  const app = pick(rng, APPS);

  // -- dialog ------------------------------------------------------------------
  const bodies = [
    [`“${fromTitle}” will be closed.`, 'Unsaved snipers will be lost.'],
    ['This will replace your current reality.', 'It only takes a moment.'],
    ['Your duel has been saved as a draft.', 'You can always come back. (You can’t.)'],
    [`“${fromTitle}” is not responding.`, 'This seems like a good time.'],
  ];
  if (W) bodies.push([`${W} just scored a point.`, 'This seems like a good time.']);
  if (L) bodies.push([`${L} has already agreed.`, 'It only takes a moment.']);
  const body = pick(rng, bodies);
  // Where the pointer wanders in from (fractions of the screen, just past an edge).
  const entry = pick(rng, [{ x: 1.04, y: 0.78 }, { x: -0.04, y: 0.7 }, { x: 0.78, y: 1.06 }, { x: 0.16, y: 1.06 }, { x: 1.04, y: 0.3 }, { x: -0.04, y: 0.34 }]);
  const bow = rand(rng, 0.1, 0.24) * (chance(rng, 0.5) ? 1 : -1);

  // -- the file that types itself ------------------------------------------------
  const pal = [to.palette.bg, to.palette.fg, to.palette.accent];
  const hexes = pal.map((c) => '  ' + str(c)); // two columns of room for the colour chip
  const players = W ? [W, L] : ['PLAYER_1', 'PLAYER_2'];
  const lead = s0 === s1 ? 'all square' : `${W || 'somebody'} leads`;
  const scoreNote = ctx.matchPoint ? 'match point. no pressure.' : lead;
  const headers = W
    ? ['generated 0.3 s ago. do not edit.', 'you clicked Yes. this is on you.', `auto-generated because ${W} scored`, 'nobody asked for this file', 'do not edit. (you cannot.)']
    : ['generated 0.3 s ago. do not edit.', 'you clicked Yes. this is on you.', 'nobody asked for this file'];
  const mocks = L
    ? [`${L} did not see that coming`, `${L} was last seen in ${oldThing}`, `${how ? how + '. ' : ''}${L} did not see that coming`, `nice shot, ${W}. this is your fault.`, `${L}: status "eliminated"${how ? ', cause "' + how + '"' : ''}`]
    : ['nobody hit anything. remarkable.', 'a draw. the build proceeds anyway.'];
  const todos = L
    ? [`TODO: teach ${L} about cover`, `TODO: apologise to ${L}`, `TODO: ask ${L} if they are okay`, `FIXME: ${L} keeps standing still`, `TODO: stop ${W} doing that again`]
    : ['TODO: teach both of them to aim', 'FIXME: nobody is winning'];
  const header = pick(rng, headers), mock = pick(rng, mocks), todo = pick(rng, todos);
  const fillers = shuffle(rng, [['physics', '"negotiable"'], ['gravity', '"optional"'], ['refunds', 'false'], ['cover', '"recommended"'], ['mercy', 'null'], ['wind', '"deprecated"'], ['realism', '0.02'], ['seriousness', '0']]);
  const gone = [isValley ? 'valley' : 'oldWorld', 'false'];
  const f1 = gone, f2 = fillers[0];
  const name = str(to.name), persp = str(to.perspective || 'UNKNOWN');
  let file, src;
  if (style === 'config') {
    file = 'multiverse.config.js';
    src = [
      `// ${header}`,
      'import { Dimension } from "@multiverse/core";',
      '',
      `const SCORE = [${s0}, ${s1}]; // ${scoreNote}`,
      '',
      `export default new Dimension(${name}, {`,
      `  perspective: ${persp},`,
      `  palette: [${hexes.join(',')}],`,
      `  players: [${players.map(str).join(', ')}],`,
      `  // ${mock}`,
      `  ${f1[0]}: ${f1[1]},`,
      `  ${f2[0]}: ${f2[1]},`,
      `  // ${todo}`,
      '});',
    ];
  } else if (style === 'imperative') {
    file = 'main.js';
    src = [
      `// ${header}`,
      'import { Dimension } from "@multiverse/core";',
      '',
      `const SCORE = [${s0}, ${s1}]; // ${scoreNote}`,
      `const app = new Dimension(${name});`,
      '',
      `app.perspective = ${persp};`,
      `app.palette = [${hexes.join(',')}];`,
      `app.players = [${players.map(str).join(', ')}];`,
      `// ${mock}`,
      `app.${f1[0]} = ${f1[1]};`,
      `app.${f2[0]} = ${f2[1]};`,
      `// ${todo}`,
      'app.launch(SCORE);',
    ];
  } else {
    file = 'app.js';
    src = [
      `// ${header}`,
      'import { Dimension } from "@multiverse/core";',
      '',
      `const SCORE = [${s0}, ${s1}]; // ${scoreNote}`,
      '',
      `new Dimension(${name})`,
      `  .perspective(${persp})`,
      `  .palette(${hexes.join(',')})`,
      `  .players(${players.map(str).join(', ')})`,
      `  // ${mock}`,
      `  .${f1[0]}(${f1[1]})`,
      `  .${f2[0]}(${f2[1]})`,
      `  // ${todo}`,
      '  .launch(SCORE);',
    ];
  }
  const names = W ? [[W, ctx.winner.index === 0 ? 'p0' : 'p1'], [L, ctx.loser.index === 0 ? 'p0' : 'p1']] : null;
  const lines = src.map((text) => ({ text, tokens: tokenize(text, names), len: text.length }));
  const find = (needle) => Math.max(0, src.findIndex((l) => l.includes(needle)));
  const code = {
    file, lines,
    maxCols: Math.max(...src.map((l) => l.length)),
    nameLine: find('new Dimension('), palLine: find(hexes[0]), mockLine: find('// ' + mock), todoLine: find('// ' + todo),
    // Typing rhythm: every line gets its own speed and a breath after it (normalised later).
    pace: src.map((l) => (l.startsWith('//') || l.includes(' // ') || /^\s*\/\//.test(l) ? rand(rng, 1.2, 1.5) : rand(rng, 0.8, 1.1))),
    rest: src.map((l) => (l ? rand(rng, 4, 12) : 3)),
  };

  // -- the build ---------------------------------------------------------------
  const core = shuffle(rng, ['Compiling shaders…', 'Linking snipers…', 'Bundling physics…']);
  const extra = shuffle(rng, [
    'Calibrating crosshairs…', 'Inflating the skybox…', 'Negotiating with gravity…', 'Teaching bots to flinch…', 'Converting metres to vibes…',
    'Polishing scopes…', 'Installing 1,402 dependencies…', 'Uninstalling the wind…', 'Rehoming stray bullets…',
    `Painting it ${to.palette.accent}…`, L ? `Minifying ${L}…` : 'Minifying both snipers…',
    isValley ? 'Tree-shaking the pine trees…' : 'Tree-shaking the scenery…',
    to.perspective ? `Rotating camera to ${titleCase(to.perspective)}…` : 'Rotating the camera…',
  ]);
  const steps = [`Removing ${oldThing}…`, core[0], extra[0], chance(rng, 0.5) ? core[1] : extra[1], pick(rng, ['Bundling a new reality…', 'Skipping the other tests…', 'Shipping it anyway…', 'Almost there, probably…'])];
  const errors = [
    ['sniper is not defined', 'defined sniper'],
    [`cannot find module '${oldFile}'`, 'that is the idea. continuing'],
    [`${L || 'someone'} is still in the old build`, `evicted ${L || 'them'}`],
    ['unexpected token: bullet', 'expected it this time'],
    ['gravity returned undefined', 'works on my machine'],
    ['too many snipers (2)', 'allowed it'],
  ];
  const err = chance(rng, 0.4) ? pick(rng, errors) : null;
  const error = err ? { step: randInt(rng, 2, 3), msg: err[0], fix: err[1] } : null;
  const ms = steps.map(() => randInt(rng, 9, 480));
  const casualties = L ? '1 casualty' : '0 casualties';

  // -- furniture -----------------------------------------------------------------
  const project = slug(from.name);
  const tree = [
    { d: 0, name: project, dir: true },
    { d: 1, name: 'src', dir: true },
    { d: 2, name: oldFile + '.js', del: 0, ext: '#e8b84a' },
    { d: 2, name: isValley ? 'mountains.obj' : 'scenery.obj', del: 1, ext: '#9aa3b5' },
    { d: 2, name: isValley ? 'wind.cfg' : 'rules.cfg', del: 2, ext: '#9aa3b5' },
    { d: 2, name: 'snipers.js', mod: true, ext: '#e8b84a' },
    { d: 2, name: file, active: true, add: -1, ext: '#e8b84a' },
    { d: 2, name: slug(to.name) + '.world', add: 1, ext: to.palette.accent },
    { d: 2, name: 'palette.css', add: 2, ext: '#5aa9ff' },
    { d: 2, name: 'physics.wasm', add: 3, ext: '#b58cff' },
    { d: 1, name: 'node_modules', dir: true, closed: true, note: '∞' },
    { d: 1, name: 'package.json', ext: '#7fcf7a' },
    { d: 1, name: 'TODO.md', ext: '#9aa3b5' },
  ];
  const toast = pick(rng, [
    { title: 'App launched', sub: 'Thanks for developing with us.' },
    { title: 'App launched', sub: L ? `Good luck, ${L}.` : 'Good luck, both of you.' },
    { title: 'App launched', sub: 'Shipped to production. No refunds.' },
    { title: 'App launched', sub: `Build 1 of ∞ · ${casualties}` },
    { title: 'App launched', sub: W ? `Developed by ${W}. Allegedly.` : 'Developed by nobody in particular.' },
  ]);
  const verb = pick(rng, ['NOW RUNNING', 'LAUNCHING', 'APP READY', 'BUILD 1 OF ∞']);
  // The pop-up that interrupts the build: a different piece of needy software every time.
  const nag = pick(rng, [
    { kind: 'stars', title: `Enjoying ${app}?`, sub: 'Rate your experience', done: 'Thanks for the 5 stars!' },
    { kind: 'button', title: 'This build uses cookies', sub: 'Manage your preferences', done: 'You accepted all of them.', label: 'Accept all', labelB: 'Accepted' },
    { kind: 'button', title: `${app} Pro`, sub: 'Upgrade to cancel this build', done: 'Upgrade unavailable during builds.', label: 'Upgrade', labelB: 'Nope' },
    { kind: 'tip', title: 'Tip of the day', sub: pick(rng, ['You cannot undo this.', 'Snipers load faster if you believe in them.', L ? `${L} can see this too.` : 'Both of you can see this.']) },
  ]);

  // -- small visual dice -----------------------------------------------------------
  const fly = {};
  for (const k of ['title', 'tree', 'editor', 'col', 'status']) fly[k] = { rot: rand(rng, 0.12, 0.42) * (chance(rng, 0.5) ? 1 : -1), drift: rand(rng, -0.35, 0.35), lag: rand(rng, 0, 0.14) };
  const scan = pick(rng, [[0, -1], [1, 0], [-1, 0], [0, 1]]);
  const keySeeds = [];
  for (let i = 0; i < 64; i++) keySeeds.push(rng());
  // Light UI needs darker player colours to stay legible on paper.
  const ink = (c) => (theme === 'dark' ? c : mixHex(c, '#000000', luminance(c) > 0.35 ? 0.42 : 0.1));

  return {
    gag, theme, brand, side, style, app, body, entry, bow, code, steps, error, ms, casualties, project, tree, toast, verb, nag, fly, scan, keySeeds,
    W, L, how, fromTitle, oldThing, oldFile,
    p0: ink('#f2b35b'), p1: ink('#40d8e8'),
    winColor: ctx.winner ? ctx.winner.color : '#f2b35b', loseColor: ctx.loser ? ctx.loser.color : '#40d8e8',
    cells: randInt(rng, 11, 15), toastSide: chance(rng, 0.5) ? 'right' : 'centre',
    clampCols: clamp(code.maxCols, 40, 96),
  };
}
