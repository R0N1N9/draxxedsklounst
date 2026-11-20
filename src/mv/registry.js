// Every dimension and transition the multiverse can use. Static import() strings so the
// single-file build can bundle them.

export const DIMENSIONS = {
  neon: () => import('./dims/neon.js'),
  pixel: () => import('./dims/pixel.js'),
  comic: () => import('./dims/comic.js'),
  blueprint: () => import('./dims/blueprint.js'),
  noir: () => import('./dims/noir.js'),
  ascii: () => import('./dims/ascii.js'),
};

// Causes play first and depend on how the point was scored; bridges carry you into the next dimension.
export const TRANSITIONS = {
  // cause
  synapse: () => import('./transitions/synapse.js'),
  memory: () => import('./transitions/memory.js'),
  flatline: () => import('./transitions/flatline.js'),
  tear: () => import('./transitions/tear.js'),
  // bridge
  wormhole: () => import('./transitions/wormhole.js'),
  channel: () => import('./transitions/channel.js'),
  shatter: () => import('./transitions/shatter.js'),
  bitcrush: () => import('./transitions/bitcrush.js'),
  inkbloom: () => import('./transitions/inkbloom.js'),
  origami: () => import('./transitions/origami.js'),
  scopedive: () => import('./transitions/scopedive.js'),
  pageturn: () => import('./transitions/pageturn.js'),
};

// Which cause fits which kind of point.
export const CAUSES = {
  headshot: ['synapse'],
  kill: ['memory', 'flatline'],
  time: ['tear'],
};

export const BRIDGES = ['wormhole', 'channel', 'shatter', 'bitcrush', 'inkbloom', 'origami', 'scopedive', 'pageturn'];

// Dimension metadata loaded lazily; this static list lets menus show names without importing.
export const DIM_INFO = {
  valley: { name: 'VARGA VALLEY', tagline: 'Where it started' },
  neon: { name: 'NEON GRID', tagline: 'Top-down · laser-lit arena' },
  pixel: { name: '8-BIT FRONTIER', tagline: 'Side-scrolling pixel duel' },
  comic: { name: 'INK & PANEL', tagline: 'Third-person comic rooftops' },
  blueprint: { name: 'BLUEPRINT', tagline: 'Isometric technical drawing' },
  noir: { name: 'NOIR', tagline: 'Rain-soaked city in black & white' },
  ascii: { name: 'PHOSPHOR', tagline: 'Text-mode terminal duel' },
};
