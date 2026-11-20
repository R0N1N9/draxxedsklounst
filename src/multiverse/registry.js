// Every dimension and transition the Multiverse knows about. Modules are imported
// lazily (one literal import() per entry so the single-file build can bundle them),
// which keeps start-up light and means one broken module cannot take down the rest.
//
// `dev: true` keeps an entry out of the match rotation (examples / templates).

export const DIMENSIONS = [
  { id: 'valley', load: () => import('./dimensions/valley/index.js') },
  { id: 'example-2d', dev: true, load: () => import('./dimensions/example-2d/index.js') },
  { id: 'example-3d', dev: true, load: () => import('./dimensions/example-3d/index.js') },
];

export const TRANSITIONS = [
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

export const playableDimensions = () => DIMENSIONS.filter((d) => !d.dev).map((d) => d.id);
export const playableTransitions = () => TRANSITIONS.filter((d) => !d.dev).map((d) => d.id);

export function metaOf(mod) {
  return { id: mod.id, name: mod.name, tagline: mod.tagline || '', perspective: mod.perspective || '', palette: mod.palette };
}
