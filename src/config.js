// Gameplay tuning lives here so it is easy to tweak.

export const VERSION = 1;

export const MAP = {
  playX: 700, // hard boundary (half extents) of the combat area
  playZ: 520,
  fineX: 800, // fine terrain mesh half extents
  fineZ: 600,
  outer: 2600, // backdrop terrain extent
};

export const BALLISTICS = {
  muzzle: 720, // m/s
  drag: 0.00042, // quadratic drag coefficient (1/m)
  gravity: 9.81,
  windScale: 1.15, // slightly exaggerated for readability
  maxLife: 6, // seconds (long enough for the extreme range)
  substep: 1 / 240,
};

export const ROUND = {
  insert: 10,
  live: 240,
  end: 9.5,
  winsToMatch: 4,
};

export const PLAYER = {
  radius: 0.35,
  eyeStand: 1.62,
  eyeCrouch: 1.1,
  eyeProne: 0.45,
  walk: 4.3,
  sprint: 6.8,
  crouch: 2.3,
  prone: 0.95,
  jump: 4.8,
  gravity: 20,
  step: 0.55,
  hp: 100,
};

export const DAMAGE = { head: 200, torso: 72, limb: 40 };
// Vests: plates soak torso hits; the chest rig carries extra magazines instead.
export const VEST = { plateTorso: 0.65, rigExtraMags: { rifle: 2, pistol: 1 } };

export const WEAPON = {
  mag: 5,
  reserve: 20,
  boltTime: 1.35,
  reloadTime: 3.0,
  zooms: [4, 8, 12],
  baseFov: 62, // vertical degrees when unscoped
  zeroMin: 100,
  zeroMax: 1500,
  zeroStep: 100,
  rangeCooldown: 2.5,
};

export const UPLINK = {
  hackTime: 8,
  radius: 5.5,
  pings: 3,
  pingInterval: 2,
};

export const NET = {
  stateHz: 20,
  interpDelay: 0.11, // seconds
  peerPrefix: 'draxxed-sklounst-v1-',
};
