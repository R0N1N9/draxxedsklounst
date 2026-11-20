// Engagement distance. The valley stays the same; what moves is where each side spawns and
// sets up (its "front line"): valley floor, forward slopes, the ridgelines, or opposite ends
// of the valley for a long diagonal. Every sniping style has a default; it can be overridden.
import * as THREE from 'three';
import { crestAt } from './terrain.js';
import { RULES, PRESETS } from './rules.js';

export const RANGES = {
  close: { name: 'Close', dist: '~250 m', desc: 'Both sides start on the valley floor between the town and the meadow. Fast, close fights.' },
  medium: { name: 'Medium', dist: '~500 m', desc: 'Both sides start down on the forward slopes, in the trees.' },
  long: { name: 'Long', dist: '~800 m', desc: 'Ridgeline to ridgeline across the valley.' },
  extreme: { name: 'Extreme', dist: '~1150 m', desc: 'Opposite ridges at opposite ends of the valley: a long diagonal shot.' },
};

// The range in play: the explicit choice, or the style's default.
export function currentRange(r = RULES) {
  if (RANGES[r.range]) return r.range;
  const p = PRESETS[r.preset];
  return (p && p.range) || 'long';
}

// x band each side keeps to (extreme puts the sides at opposite ends of the valley).
export function rangeBand(side, range = currentRange()) {
  if (range === 'extreme') return side < 0 ? [-560, -360] : [330, 560];
  if (range === 'close') return [40, 320]; // town's east edge (cover) to the open meadow
  if (range === 'medium') return [-300, 300];
  return [-620, 620];
}

// Depth (|z|) of a side's firing line at x.
export function frontZ(x, range = currentRange()) {
  if (range === 'close') return 125;
  if (range === 'medium') return crestAt(x) - 150;
  if (range === 'extreme') return crestAt(x) - 45; // a little down the face so the diagonal clears the crests
  return crestAt(x) - 8;
}

// How far forward of the line a nest may be pushed (metres).
export function forwardStep(range = currentRange()) {
  return range === 'close' ? 15 : range === 'medium' ? 30 : 60;
}

// Round spawn point idx (0..2) for a side, in cover behind its line.
export function spawnPoint(world, side, idx, range = currentRange()) {
  // Spread along the valley shrinks with range so the fight stays at the advertised distance.
  let xs = range === 'close' ? [60, 180, 300] : range === 'medium' ? [-200, -20, 180] : [-330, -20, 300];
  if (range === 'extreme') xs = side < 0 ? [-540, -460, -380] : [350, 420, 500];
  const x = xs[idx % 3];
  let depth;
  if (range === 'close') depth = 150; // on the valley floor at the foot of the slope
  else if (range === 'medium') depth = crestAt(x) - 120; // in the trees on the forward slope
  else depth = crestAt(x) + 65; // reverse slope, behind the crest
  const z = side * depth;
  return new THREE.Vector3(x, world.heightAt(x, z), z);
}
