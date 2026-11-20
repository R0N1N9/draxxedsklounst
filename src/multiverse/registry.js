// Every dimension and transition the Multiverse knows about. Modules are imported
// lazily (one literal import() per entry so the single-file build can bundle them),
// which keeps start-up light and means one broken module cannot take down the rest.
//
// `dev: true` keeps an entry out of the match rotation (examples / templates).
// `wip: true` does the same for a module that is still being built: it can be loaded by id
// (?dim=, ?fxlab=, the lab) but matches do not visit it until the flag is removed.
// `first: true` marks the transition reserved for the FIRST point of a match — the moment
// the mode shows its hand — which never comes round again in the rotation.

export const DIMENSIONS = [
  { id: 'valley', load: () => import('./dimensions/valley/index.js') },
  { id: 'neon', load: () => import('./dimensions/neon/index.js') },
  { id: 'comic', wip: true, load: () => import('./dimensions/comic/index.js') },
  { id: 'pixel', load: () => import('./dimensions/pixel/index.js') },
  { id: 'ww2', load: () => import('./dimensions/ww2/index.js') },
  { id: 'surf', wip: true, load: () => import('./dimensions/surf/index.js') },
  { id: 'abyss', wip: true, load: () => import('./dimensions/abyss/index.js') },
  { id: 'orbit', wip: true, load: () => import('./dimensions/orbit/index.js') },
  { id: 'arcade', wip: true, load: () => import('./dimensions/arcade/index.js') },
  { id: 'toon', wip: true, load: () => import('./dimensions/toon/index.js') },
  { id: 'manga', load: () => import('./dimensions/manga/index.js') },
  { id: 'noir', wip: true, load: () => import('./dimensions/noir/index.js') },
  { id: 'terminal', load: () => import('./dimensions/terminal/index.js') },
  { id: 'toybox', wip: true, load: () => import('./dimensions/toybox/index.js') },
  { id: 'tapestry', wip: true, load: () => import('./dimensions/tapestry/index.js') },
  { id: 'petri', wip: true, load: () => import('./dimensions/petri/index.js') },
  { id: 'paper', wip: true, load: () => import('./dimensions/paper/index.js') },
  { id: 'snow', wip: true, load: () => import('./dimensions/snow/index.js') },
  { id: 'example-2d', dev: true, load: () => import('./dimensions/example-2d/index.js') },
  { id: 'example-3d', dev: true, load: () => import('./dimensions/example-3d/index.js') },
];

export const TRANSITIONS = [
  { id: 'dev-app', first: true, load: () => import('./transitions/dev-app.js') },
  { id: 'synapse', load: () => import('./transitions/synapse.js') },
  { id: 'flashback', load: () => import('./transitions/flashback.js') },
  { id: 'shatter', load: () => import('./transitions/shatter.js') },
  { id: 'wormhole', wip: true, load: () => import('./transitions/wormhole.js') },
  { id: 'channel-surf', wip: true, load: () => import('./transitions/channel-surf.js') },
  { id: 'cosmic-zoom', wip: true, load: () => import('./transitions/cosmic-zoom.js') },
  { id: 'reboot', wip: true, load: () => import('./transitions/reboot.js') },
  { id: 'storybook', wip: true, load: () => import('./transitions/storybook.js') },
  { id: 'slot-machine', wip: true, load: () => import('./transitions/slot-machine.js') },
  { id: 'bullet-hole', wip: true, load: () => import('./transitions/bullet-hole.js') },
  { id: 'evolution', wip: true, load: () => import('./transitions/evolution.js') },
  { id: 'elevator', wip: true, load: () => import('./transitions/elevator.js') },
  { id: 'continue', load: () => import('./transitions/continue.js') },
  { id: 'example', dev: true, load: () => import('./transitions/example.js') },
];

const cache = new Map();

function fail(kind, id, why) {
  throw new Error(`${kind} "${id}": ${why}`);
}

async function load(list, kind, id, check) {
  const key = kind + ':' + id;
  if (cache.has(key)) return cache.get(key);
  const entry = list.find((e) => e.id === id);
  if (!entry) fail(kind, id, 'not in the registry');
  const mod = (await entry.load()).default;
  if (!mod || typeof mod.create !== 'function') fail(kind, id, 'no default export with create()');
  if (mod.id !== id) fail(kind, id, `module.id is "${mod.id}"`);
  check(mod);
  cache.set(key, mod);
  return mod;
}

export function loadDimension(id) {
  return load(DIMENSIONS, 'dimension', id, (m) => {
    if (m.native) return;
    if (m.renderer !== '2d' && m.renderer !== 'three') fail('dimension', id, 'renderer must be "2d" or "three"');
    if (m.aim !== 'look' && m.aim !== 'pointer') fail('dimension', id, 'aim must be "look" or "pointer"');
    if (!m.palette || !m.palette.bg || !m.palette.fg || !m.palette.accent) fail('dimension', id, 'palette needs bg, fg and accent');
    if (!m.name || !m.controls) fail('dimension', id, 'name and controls are required');
  });
}

export function loadTransition(id) {
  return load(TRANSITIONS, 'transition', id, (m) => {
    if (!(m.duration > 0)) fail('transition', id, 'duration is required');
    if (!(m.swapAt > 0 && m.swapAt < 1)) fail('transition', id, 'swapAt must be in (0,1)');
  });
}

export const playableDimensions = () => DIMENSIONS.filter((d) => !d.dev && !d.wip).map((d) => d.id);
export const playableTransitions = () => TRANSITIONS.filter((d) => !d.dev && !d.wip && !d.first).map((d) => d.id);
export const firstTransition = () => (TRANSITIONS.find((d) => d.first && !d.dev && !d.wip) || {}).id || null;

export function metaOf(mod) {
  return { id: mod.id, name: mod.name, tagline: mod.tagline || '', perspective: mod.perspective || '', palette: mod.palette };
}
