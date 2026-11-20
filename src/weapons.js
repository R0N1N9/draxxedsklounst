// Weapon definitions. Damage is per hit location; players have 100 HP.
export const WEAPONS = {
  mk22: {
    key: 'mk22',
    name: 'Mk22 MRAD',
    short: 'MK22',
    caliber: '.300 PRC',
    slot: 'rifle',
    kind: 'bolt',
    mag: 7,
    spareMags: 3,
    muzzle: 720,
    damage: { head: 200, torso: 110, legs: 50 }, // body shot kills unless plated (110 × 0.65 = 72); 2 leg hits kill
    cycle: 1.35, // bolt throw
    reload: 3.0,
    reloadEmpty: 3.8,
    zooms: [4, 8, 12, 16, 20],
    scope: true,
    glint: 1,
    recoil: 0.024,
    sway: 1,
    desc: 'Bolt-action .300 PRC, 7+1. One-shot headshots and body shots (two body shots on plates). Slow bolt throw. 4–20× scope.',
  },
  dmr: {
    key: 'dmr',
    name: 'M110A1 DMR',
    short: 'M110A1',
    caliber: '7.62 NATO',
    slot: 'rifle',
    kind: 'semi',
    mag: 20,
    spareMags: 2,
    muzzle: 690,
    damage: { head: 110, torso: 40, legs: 24 },
    cycle: 0.33,
    reload: 2.6,
    reloadEmpty: 3.2,
    zooms: [4, 8, 10],
    scope: true,
    glint: 0.7,
    recoil: 0.017,
    sway: 1.15,
    desc: 'Semi-auto 7.62, 20+1, about 3 shots a second. Headshots still kill; three body shots. Smaller 4–10× scope glints less.',
  },
  m18: {
    key: 'm18',
    name: 'M18',
    short: 'M18',
    caliber: '9 mm',
    slot: 'pistol',
    kind: 'semi',
    mag: 17,
    spareMags: 1,
    muzzle: 380,
    damage: { head: 60, torso: 24, legs: 15 },
    cycle: 0.16,
    reload: 1.6,
    reloadEmpty: 2.0,
    zooms: [1],
    scope: false,
    adsFov: 46,
    fixedZero: 25,
    glint: 0,
    recoil: 0.03,
    sway: 1.7,
    desc: 'Sidearm for close range. 17+1 and one spare magazine.',
  },
};

export const RIFLES = ['mk22', 'dmr'];
export const SUPPRESSOR_FACTOR = 0.88;

// Mk22 long-range scope attachment: 5–40×, glints harder, a little more sway.
export const SCOPE40 = { zooms: [5, 10, 20, 30, 40], sway: 1.15 }; // glint comes from the zoom level (30×/40× glint hardest)
