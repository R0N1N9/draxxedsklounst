// Loadout picker: one tool per slot. Used inline in the main menu and as an in-game overlay.
import { TOOLS, SLOTS, validLoadout } from './tools.js';

export function renderLoadout(el, loadout, onChange) {
  let lo = validLoadout(loadout);
  const draw = () => {
    el.innerHTML = SLOTS.map((s) => {
      const opts = Object.entries(TOOLS).filter(([, t]) => t.slot === s.key);
      return `<div class="lo-slot"><div class="lo-head"><span>${s.label}</span><em>${s.keyHint === 'passive' ? 'always on' : 'key ' + s.keyHint}</em></div>
        <div class="lo-opts">${opts.map(([k, t]) => `<button class="lo-opt${lo[s.key] === k ? ' on' : ''}" data-slot="${s.key}" data-tool="${k}">
          <b>${t.name}${t.charges ? ` <i>×${t.charges}</i>` : ''}</b><span>${t.desc}</span></button>`).join('')}</div></div>`;
    }).join('');
  };
  el.onclick = (e) => {
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
    this.view = renderLoadout(wrap.querySelector('.lo-body'), game.tools.loadout, (lo) => {
      game.tools.setLoadout(lo);
      onSave && onSave(lo);
    });
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
      this.view.set(this.g.tools.loadout);
      document.exitPointerLock && document.exitPointerLock();
    } else this.g.input.requestLock();
  }
}
