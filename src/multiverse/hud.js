// Shared chrome for every (non-native) dimension: score, clock, ability chips, kill
// banner, title card, countdown, pause and end-of-match cards. Re-themed per
// dimension from module.palette through CSS variables.

const SLOTS = ['fire', 'alt', 'a1', 'a2', 'jump'];
const KEYS = { fire: 'LMB', alt: 'RMB', a1: 'SHIFT', a2: 'E', jump: 'SPACE' };
const PAD = { fire: 'RT', alt: 'LT', a1: 'LB', a2: 'RB', jump: 'A' };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class MvHud {
  constructor(input) {
    this.input = input;
    const root = (this.root = document.createElement('div'));
    root.id = 'mv-hud';
    root.innerHTML = `
      <div class="mv-top">
        <div class="mv-side mv-p0"><span class="mv-name"></span><span class="mv-pips"></span></div>
        <div class="mv-mid"><b class="mv-score"></b><span class="mv-clock"></span></div>
        <div class="mv-side mv-p1"><span class="mv-pips"></span><span class="mv-name"></span></div>
      </div>
      <div class="mv-dim"></div>
      <div class="mv-sudden">SUDDEN DEATH</div>
      <div class="mv-center"><div class="mv-msg"></div><div class="mv-sub"></div></div>
      <div class="mv-kill"></div>
      <div class="mv-chips"></div>
      <div class="mv-title"><div class="mv-t-kicker"></div><div class="mv-t-name"></div><div class="mv-t-tag"></div><div class="mv-t-keys"></div></div>
      <div class="mv-count"></div>
      <div class="mv-lock">CLICK TO AIM</div>`;
    document.body.appendChild(root);
    const q = (s) => root.querySelector(s);
    this.el = {
      names: [q('.mv-p0 .mv-name'), q('.mv-p1 .mv-name')],
      pips: [q('.mv-p0 .mv-pips'), q('.mv-p1 .mv-pips')],
      score: q('.mv-score'), clock: q('.mv-clock'), dim: q('.mv-dim'), sudden: q('.mv-sudden'),
      center: q('.mv-center'), msg: q('.mv-msg'), sub: q('.mv-sub'), kill: q('.mv-kill'),
      chips: q('.mv-chips'), title: q('.mv-title'), tKicker: q('.mv-t-kicker'), tName: q('.mv-t-name'),
      tTag: q('.mv-t-tag'), tKeys: q('.mv-t-keys'), count: q('.mv-count'), lock: q('.mv-lock'),
    };
    this.modal = document.createElement('div');
    this.modal.id = 'mv-modal';
    document.body.appendChild(this.modal);
    this.chips = {};
    this.msgT = 0;
    this.killT = 0;
    this._clock = '';
    this._count = '';
    this.show(false);
  }

  show(on) {
    this.root.classList.toggle('on', !!on);
  }

  setTheme(p) {
    const s = document.documentElement.style;
    s.setProperty('--mv-bg', p.bg);
    s.setProperty('--mv-fg', p.fg);
    s.setProperty('--mv-accent', p.accent);
  }

  setPlayers(players, me) {
    this.players = players;
    players.forEach((p, i) => {
      this.el.names[i].innerHTML = `${esc(p.name)}${i === me ? '<i>YOU</i>' : ''}`;
      this.el.names[i].style.color = p.color;
      this.el.pips[i].style.color = p.color;
    });
  }

  setScore(score, target) {
    this.el.score.textContent = `${score[0]} – ${score[1]}`;
    score.forEach((n, i) => {
      let h = '';
      if (target <= 12) for (let k = 0; k < target; k++) h += `<i class="${k < n ? 'on' : ''}"></i>`; // long (test) matches: number only
      this.el.pips[i].innerHTML = h;
    });
  }

  setDimension(mod, round) {
    this.el.dim.textContent = `${String(round).padStart(2, '0')} · ${mod.name}`;
    this.el.chips.innerHTML = '';
    this.chips = {};
    for (const slot of SLOTS) {
      const label = mod.controls && mod.controls[slot];
      if (!label) continue;
      const c = document.createElement('div');
      c.className = 'mv-chip';
      c.innerHTML = `<kbd>${KEYS[slot]}</kbd><span>${esc(label)}</span><em></em>`;
      this.el.chips.appendChild(c);
      this.chips[slot] = { el: c, kbd: c.querySelector('kbd'), badge: c.querySelector('em'), frac: -1, n: undefined };
    }
    this.el.sudden.classList.remove('on');
    this._clock = '';
    this.el.clock.textContent = '';
    this.el.clock.classList.remove('hot');
    this.message('', '', 0);
    this.el.kill.classList.remove('on');
  }

  // Ability state: forwarded to the touch buttons as well, so a dimension only reports it once.
  cooldown(slot, frac) {
    const c = this.chips[slot];
    frac = frac > 0 ? Math.min(1, frac) : 0;
    // FIRE always has a touch button, labelled or not.
    if (!c) { if (this.input) this.input.setCooldown(slot, frac); return; }
    if (Math.abs(frac - c.frac) < 0.01 && (frac > 0) === (c.frac > 0)) return;
    c.frac = frac;
    c.el.style.setProperty('--cd', frac.toFixed(3));
    c.el.classList.toggle('cooling', frac > 0);
    if (this.input) this.input.setCooldown(slot, frac);
  }

  charges(slot, n) {
    const c = this.chips[slot];
    if (!c) { if (this.input) this.input.setCharges(slot, n === undefined ? null : n); return; }
    if (c.n === n) return;
    c.n = n;
    c.badge.textContent = n === null || n === undefined ? '' : String(n);
    c.el.classList.toggle('empty', n === 0);
    if (this.input) this.input.setCharges(slot, n === undefined ? null : n);
  }

  message(text, sub = '', dur = 2.5) {
    this.el.msg.textContent = text || '';
    this.el.sub.textContent = sub || '';
    this.el.center.classList.toggle('on', !!(text || sub) && dur > 0);
    this.msgT = dur;
  }

  clock(remaining, sudden) {
    const t = Math.max(0, Math.ceil(remaining));
    const s = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    if (s !== this._clock) { this._clock = s; this.el.clock.textContent = s; }
    this.el.sudden.classList.toggle('on', !!sudden);
    this.el.clock.classList.toggle('hot', !!sudden || t <= 10);
  }

  title(mod, round, on) {
    if (!on) { this.el.title.classList.remove('on'); return; }
    this.el.tKicker.textContent = `DIMENSION ${String(round).padStart(2, '0')} · ${mod.perspective || ''}`;
    this.el.tName.textContent = mod.name;
    this.el.tTag.textContent = mod.tagline || '';
    const dev = this.input ? this.input.state.device : 'kbm';
    let keys = '';
    if (dev !== 'touch') {
      const map = dev === 'gamepad' ? PAD : KEYS;
      for (const slot of SLOTS) {
        const label = mod.controls && mod.controls[slot];
        if (label) keys += `<span><kbd>${map[slot]}</kbd>${esc(label)}</span>`;
      }
    }
    this.el.tKeys.innerHTML = keys;
    this.el.title.classList.remove('on');
    void this.el.title.offsetWidth; // restart the entrance animation
    this.el.title.classList.add('on');
  }

  count(text) {
    if (text === this._count) return;
    this._count = text;
    const c = this.el.count;
    c.textContent = text || '';
    c.classList.remove('on');
    if (text) { void c.offsetWidth; c.classList.add('on'); }
  }

  killBanner(winner, loser, how, dur = 2.4) {
    const k = this.el.kill;
    if (!winner) k.innerHTML = `<b>STALEMATE</b><span>reality moves on without a point</span>`;
    else k.innerHTML = `<b style="color:${winner.color}">${esc(winner.name)}</b><i>▸</i><b style="color:${loser.color}">${esc(loser.name)}</b>${how ? `<span>${esc(how)}</span>` : ''}`;
    k.classList.remove('on');
    void k.offsetWidth;
    k.classList.add('on');
    this.killT = dur;
  }

  lockPrompt(on) {
    this.el.lock.classList.toggle('on', !!on);
  }

  update(dt) {
    if (this.msgT > 0) {
      this.msgT -= dt;
      if (this.msgT <= 0) this.el.center.classList.remove('on');
    }
    if (this.killT > 0) {
      this.killT -= dt;
      if (this.killT <= 0) this.el.kill.classList.remove('on');
    }
    // Chip key hints follow the device in use.
    const dev = this.input ? this.input.state.device : 'kbm';
    if (dev !== this._dev) {
      this._dev = dev;
      this.root.classList.toggle('touch', dev === 'touch');
      const map = dev === 'gamepad' ? PAD : KEYS;
      for (const slot in this.chips) this.chips[slot].kbd.textContent = map[slot];
    }
  }

  // ---- modal cards (pause, match over, connection lost) ----------------------
  card(html, buttons = []) {
    const m = this.modal;
    if (!html) { m.classList.remove('on'); m.innerHTML = ''; return; }
    m.innerHTML = `<div class="mv-card">${html}<div class="mv-btns"></div></div>`;
    const row = m.querySelector('.mv-btns');
    for (const b of buttons) {
      const el = document.createElement('button');
      el.textContent = b.label;
      if (b.primary) el.className = 'primary';
      if (b.id) el.id = b.id;
      el.onclick = () => b.onClick(el);
      row.appendChild(el);
    }
    m.classList.add('on');
  }

  pause(on, { online, onResume, onExit } = {}) {
    if (!on) return this.card('');
    this.card(
      `<h2>// PAUSED</h2><p>${online ? 'Online match — the duel keeps running while you are in this menu.' : 'Game paused.'}</p>`,
      [{ label: 'Resume', primary: true, id: 'mv-resume', onClick: onResume }, { label: 'Exit to main menu', onClick: onExit }],
    );
  }

  final({ won, players, score, history, canRematch, onRematch, onExit }) {
    const rows = history.map((h, i) => {
      const w = h.winner >= 0 ? players[h.winner] : null;
      return `<li><em>${String(i + 1).padStart(2, '0')}</em><span>${esc(h.name)}</span><b style="color:${w ? w.color : 'inherit'}">${w ? esc(w.name) : 'draw'}</b></li>`;
    }).join('');
    this.card(
      `<h2 class="${won ? 'win' : 'lose'}">So do you want to develop an app?</h2>
       <p class="mv-final-result">${won ? 'You won' : 'You lost'}</p>
       <div class="mv-final-score"><b style="color:${players[0].color}">${esc(players[0].name)} ${score[0]}</b><i>—</i><b style="color:${players[1].color}">${score[1]} ${esc(players[1].name)}</b></div>
       <ol class="mv-history">${rows}</ol>`,
      [{ label: canRematch ? 'Rematch' : 'Ask for a rematch', primary: true, id: 'mv-rematch', onClick: onRematch }, { label: 'Leave', onClick: onExit }],
    );
  }

  dispose() {
    this.root.remove();
    this.modal.remove();
  }
}
