// Sniping style: how bullets behave and how forgiving aiming is. The host's rules apply
// to both players (sent in the hello message).
import { BALLISTICS } from './config.js';
import { clearZeroCache } from './ballistics.js';

const BASE = { gravity: BALLISTICS.gravity, drag: BALLISTICS.drag, windScale: BALLISTICS.windScale };

// gravity / drag / wind / sway / hitbox are multipliers; speed multiplies muzzle velocity
// (40 = effectively instant, i.e. hitscan).
export const PRESETS = {
  sim: {
    name: 'Simulation',
    short: 'SIM',
    feel: 'Sniper Elite / ARMA',
    desc: 'Heavier drag and strong wind. Every long shot needs a range and a wind call.',
    gravity: 1, drag: 1.35, wind: 1.6, speed: 1, sway: 1.2, hitbox: 1, zooms: null, range: 'extreme',
  },
  bf: {
    name: 'Battlefield',
    short: 'BF',
    feel: 'Battlefield',
    desc: 'The default: real bullet drop and travel time, moderate wind.',
    gravity: 1, drag: 1, wind: 1, speed: 1, sway: 1, hitbox: 1, zooms: null, range: 'long',
  },
  cod: {
    name: 'Call of Duty',
    short: 'COD',
    feel: 'Call of Duty',
    desc: 'Fast bullets with light drop and no wind. Lead a little, hold over a little.',
    gravity: 0.35, drag: 0.5, wind: 0, speed: 1.6, sway: 1, hitbox: 1.15, zooms: null, range: 'medium',
  },
  halo: {
    name: 'Halo',
    short: 'HALO',
    feel: 'Halo',
    desc: 'Instant hit, dead straight, no wind and no scope sway. 5× / 10× / 20× zoom. Pure reflex.',
    gravity: 0, drag: 0, wind: 0, speed: 40, sway: 0, hitbox: 1.25, zooms: [5, 10, 20], range: 'close',
  },
};

export const DEFAULT_RULES = { preset: 'bf', ...PRESETS.bf, autoZero: true };

// The live rules everything reads.
export const RULES = { ...DEFAULT_RULES };

export function normalizeRules(r) {
  const p = PRESETS[r && r.preset];
  const base = p ? { preset: r.preset, ...p } : { ...DEFAULT_RULES, preset: 'custom' };
  const out = { ...base, autoZero: r && r.autoZero !== undefined ? !!r.autoZero : true };
  // Distance is independent of the physics: 'auto' follows the style, or pick one to mix and match.
  // Long is the default; 'auto' (follow the style) is opt-in.
  out.range = r && ['auto', 'close', 'medium', 'long', 'extreme'].includes(r.range) ? r.range : 'long';
  out.styleRange = (p && p.range) || 'long';
  if (r && r.preset === 'custom') {
    const num = (v, d, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
    out.preset = 'custom';
    out.name = 'Custom';
    out.gravity = num(r.gravity, 1, 0, 1.5);
    out.drag = num(r.drag, 1, 0, 2);
    out.wind = num(r.wind, 1, 0, 2);
    out.speed = num(r.speed, 1, 0.75, 40);
    out.sway = num(r.sway, 1, 0, 1.5);
    out.hitbox = num(r.hitbox, 1, 1, 1.5);
    out.zooms = Array.isArray(r.zooms) ? r.zooms : null;
  }
  return out;
}

export function applyRules(r) {
  const n = normalizeRules(r);
  Object.assign(RULES, n);
  BALLISTICS.gravity = BASE.gravity * n.gravity;
  BALLISTICS.drag = BASE.drag * n.drag;
  BALLISTICS.windScale = BASE.windScale * n.wind;
  clearZeroCache();
  return n;
}

export function rulesLabel(r = RULES) {
  const style = r.preset === 'custom' ? 'CUSTOM' : (PRESETS[r.preset] ? PRESETS[r.preset].name.toUpperCase() : 'CUSTOM');
  const rg = ['close', 'medium', 'long', 'extreme'].includes(r.range) ? r.range : r.styleRange || (PRESETS[r.preset] && PRESETS[r.preset].range) || 'long';
  return `${style} · ${rg.toUpperCase()}`;
}
