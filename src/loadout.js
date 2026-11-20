// Loadout picker: one tool per slot. Used inline in the main menu and as an in-game overlay.
import { TOOLS, SLOTS, validLoadout } from './tools.js';
import { WEAPONS, RIFLES } from './weapons.js';
import { OUTFITS, LENS_COLORS } from './avatar.js';
import { showPreview } from './preview.js';

export function renderLoadout(el, loadout, onChange) {
  let lo = validLoadout(loadout);
  el.innerHTML = `<div class="lo-op"><div class="lo-prev"><div class="lo-cap"></div></div><div class="lo-side"><div class="lo-slot lo-outfits"></div>
    <div class="lo-slot"><div class="lo-head"><span>Lenses</span><em>goggles &amp; glasses</em></div>
    <div class="lo-lens">${LENS_COLORS.map((c) => `<button class="lo-sw" data-lens="${c}" style="--c:${c}" title="${c}"></button>`).join('')}
    <label class="lo-sw lo-custom" title="Any colour"><input type="color" /></label></div></div></div></div><div class="lo-list"></div>`;
  const list = el.querySelector('.lo-list'), prev = el.querySelector('.lo-prev'), outfits = el.querySelector('.lo-outfits');
  const picker = el.querySelector('.lo-custom input');
  const look = () => ({ outfit: lo.outfit, poncho: lo.stealth === 'poncho', lens: lo.lens, kit: { scout: lo.scout, stealth: lo.stealth, tactical: lo.tactical } });
  const markLens = () => {
    let preset = false;
    el.querySelectorAll('.lo-sw[data-lens]').forEach((b) => { const on = b.dataset.lens === lo.lens; b.classList.toggle('on', on); preset ||= on; });
    picker.parentNode.classList.toggle('on', !preset);
    picker.parentNode.style.setProperty('--c', lo.lens);
    picker.value = lo.lens;
  };
  picker.addEventListener('input', () => {
    lo = { ...lo, lens: picker.value };
    markLens();
    showPreview(prev, look());
  });
  picker.addEventListener('change', () => onChange(lo));
  const draw = () => {
    const poncho = lo.stealth === 'poncho';
    markLens();
    outfits.innerHTML = `<div class="lo-head"><span>Operator</span><em>drag to turn</em></div><div class="lo-opts">${Object.entries(OUTFITS).map(([k, o]) => `<button class="lo-opt${lo.outfit === k ? ' on' : ''}" data-slot="outfit" data-tool="${k}"><b>${o.name}</b><span>${o.desc}</span></button>`).join('')}</div>`;
    prev.querySelector('.lo-cap').innerHTML = `${OUTFITS[lo.outfit].name.toUpperCase()}${poncho ? ' <i>+ THERMAL PONCHO</i>' : ''}`;
    showPreview(prev, look());
    const rifles = `<div class="lo-slot"><div class="lo-head"><span>Rifle</span><em>+ M18 pistol (key 2)</em></div>
      <div class="lo-opts">${RIFLES.map((k) => { const w = WEAPONS[k]; return `<button class="lo-opt${lo.rifle === k ? ' on' : ''}" data-slot="rifle" data-tool="${k}">
        <b>${w.name} <i>${w.caliber} · ${w.mag}+1</i></b><span>${w.desc}</span></button>`; }).join('')}</div>
      ${lo.rifle === 'mk22' ? `<div class="lo-head" style="margin-top:6px"><span>Bolt</span><em>Mk22 attachment</em></div>
      <div class="lo-opts">
        <button class="lo-opt${lo.bolt !== 'straight' ? ' on' : ''}" data-slot="bolt" data-tool="standard"><b>Standard bolt</b><span>Fire scoped, then come off the scope to work the bolt before the next shot.</span></button>
        <button class="lo-opt${lo.bolt === 'straight' ? ' on' : ''}" data-slot="bolt" data-tool="straight"><b>Straight-pull bolt</b><span>Cycles while you stay scoped, and a little faster. Slightly more muzzle climb.</span></button>
      </div>` : ''}</div>`;
    list.innerHTML = rifles + SLOTS.map((s) => {
      const opts = Object.entries(TOOLS).filter(([, t]) => t.slot === s.key);
      return `<div class="lo-slot"><div class="lo-head"><span>${s.label}</span><em>${s.keyHint === 'passive' ? 'always on' : 'key ' + s.keyHint}</em></div>
        <div class="lo-opts">${opts.map(([k, t]) => `<button class="lo-opt${lo[s.key] === k ? ' on' : ''}" data-slot="${s.key}" data-tool="${k}">
          <b>${t.name}${t.charges ? ` <i>×${t.charges}</i>` : ''}</b><span>${t.desc}</span></button>`).join('')}</div></div>`;
    }).join('');
  };
  el.onclick = (e) => {
    const sw = e.target.closest('.lo-sw[data-lens]');
    if (sw) {
      lo = { ...lo, lens: sw.dataset.lens };
      draw();
      onChange(lo);
      return;
    }
    const b = e.target.closest('.lo-opt');
    if (!b) return;
    lo = { ...lo, [b.dataset.slot]: b.dataset.tool };
    draw();
    onChange(lo);
  };
  draw();
  return { set: (l) => { lo = validLoadout(l); draw(); } };
}

export class LoadoutPanel {
  constructor(game, onSave) {
    this.g = game;
    this.open = false;
    const wrap = document.createElement('div');
    wrap.id = 'loadout';
    wrap.innerHTML = `<div class="lo-card"><div class="sb-head"><span>// LOADOUT — pick one per slot</span><button class="sb-x">×</button></div>
      <div class="lo-body"></div><p class="sb-foot">Changes apply now and reset this round's tool charges. L or Esc closes.</p></div>`;
    document.body.appendChild(wrap);
    this.wrap = wrap;
    this.view = null; // built the first time it's opened
    this.onSave = onSave;
    wrap.querySelector('.sb-x').onclick = () => this.toggle(false);
    addEventListener('keydown', (e) => {
      if (this.open && e.code === 'Escape') this.toggle(false);
    });
  }

  toggle(force) {
    this.open = force ?? !this.open;
    this.wrap.classList.toggle('on', this.open);
    this.g.toolsOpen = this.open || (this.g.sandbox && this.g.sandbox.open);
    if (this.open) {
      if (!this.view) {
        this.view = renderLoadout(this.wrap.querySelector('.lo-body'), this.g.tools.loadout, (lo) => {
          this.g.tools.setLoadout(lo);
          this.onSave && this.onSave(lo);
        });
      } else this.view.set(this.g.tools.loadout);
      document.exitPointerLock && document.exitPointerLock();
    } else this.g.input.requestLock();
  }
}
