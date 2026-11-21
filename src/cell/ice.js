// Sniper Cell — the ICE endgame. A botched upload trips SENTINEL's ICE:
//   1. The ring: guards take posts around the outside walls (Sentinel.iceAlert).
//   2. The report: ISR Overwatch tells the cell they've been made; the operators talk it over.
//   3. The vote: each operator votes QUIET (1) or LOUD (2), or taps the buttons. The AI partner
//      backs your call. Agree and it's settled; at the deadline a split stays quiet (you can
//      always go loud later).
//   4. The sweep: squads peel off the ring and clear the building room by room, ground floor
//      first (Sentinel.sweepStart). Quiet is hide and seek: the shooter has camo, the spotter
//      has to stay nimble. A sweep that passes you by gets a comment; so does getting out.
//   5. The music: tense while they sweep, a full combat score once they've spotted you.
import { Score } from './music.js';

const VOTE_TIME = 20;

export const IceOps = {
  _iceInit() {
    this.score = new Score(this.audio);
    const el = (this.voteEl = document.createElement('div'));
    el.id = 'cell-vote';
    el.innerHTML = `<div class="cv-h">WE'VE BEEN MADE</div><div class="cv-sub">ICE tripped. Guards are ringing the building. Your call:</div>
      <div class="cv-row"><button data-v="quiet"><b>QUIET</b><span>hide, slip the sweep <i>1</i></span></button><button data-v="loud"><b>LOUD</b><span>weapons free, fight out <i>2</i></span></button></div>
      <div class="cv-votes"></div>`;
    document.body.appendChild(el);
    for (const b of el.querySelectorAll('button')) b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this._vote(b.dataset.v); });
    addEventListener('keydown', (e) => {
      if (!this._voteOpen()) return;
      if (e.code === 'Digit1') { e.preventDefault(); e.stopPropagation(); this._vote('quiet'); }
      if (e.code === 'Digit2') { e.preventDefault(); e.stopPropagation(); this._vote('loud'); }
    }, true);
    this._iceLines = [];
    this._close = {};
  },

  _voteOpen() {
    const ob = this.obj;
    return !!(ob && ob.ice && ob.voteT > 0 && !ob.plan && !this.ended);
  },

  // Radio line heard by everyone (host-side; guests get it as a 'radio' event).
  _say2(who, text, delay = 0) {
    this._iceLines.push({ at: this.t + delay, who, text });
  },

  // Host: right after Sentinel.iceAlert.
  _iceStart() {
    const ob = this.obj;
    ob.vote = {};
    ob.plan = null;
    ob.voteT = VOTE_TIME;
    const n = this.sentinel.guards.filter((g) => g.icePost && g.state !== 'dead').length;
    this._say2('isr', 'Overwatch to Sniper Cell. ICE just tripped. Multiple hostiles are moving to ring the building. You\'ve been made.', 0.6);
    void n;
    this._say2('spotter', 'Damn it. We\'ve been made.', 6.2);
    this._say2('shooter', 'Copy. So what\'s it gonna be, quiet or loud?', 8.4);
  },

  // Local operator's vote.
  _vote(v) {
    if (!this._voteOpen()) return;
    this.audio.click && this.audio.click();
    if (this.isHost) this._castVote(this.role, v); else this._broadcast({ k: 'vote', role: this.role, v });
  },

  _castVote(role, v) {
    const ob = this.obj;
    if (!this._voteOpen()) return;
    const changed = ob.vote[role] !== v;
    ob.vote[role] = v;
    if (changed) this._say2(role, v === 'quiet' ? 'I say we go quiet. Find a hole and let them walk past.' : 'I say we go loud. Punch through and get to the van.');
    // Solo: the AI partner backs your call. Lone operative: one vote settles it.
    if (this.solo) {
      if (!this.operative && changed) { ob.vote[this.partnerRole] = v; this._say2(this.partnerRole, v === 'quiet' ? 'Your call. Quiet it is.' : 'Your call. Going loud.', 2.2); }
      this._settle(v, 3.6);
      return;
    }
    const a = ob.vote.shooter, b = ob.vote.spotter;
    if (a && b && a === b) this._settle(a, 2);
    else if (a && b && changed) this._say2(role === 'shooter' ? 'spotter' : 'shooter', a === 'quiet' || b === 'quiet' ? 'No, I want to stay quiet.' : 'No. We go loud.', 1.8);
  },

  _settle(plan, delay = 0) {
    const ob = this.obj;
    if (ob.plan) return;
    ob.plan = plan;
    ob.voteT = 0;
    this.sentinel.sweepStart(plan);
    if (plan === 'quiet') {
      this._say2(this.role === 'spotter' ? 'shooter' : 'spotter', 'Going quiet. Ra, keep the camo up. Ronin, stay light on your feet.', delay);
      this._say2('isr', 'Overwatch copies quiet. They\'re forming up to clear the building, ground floor first. Don\'t be there.', delay + 5);
    } else {
      this.sentinel.raise(1, null);
      this._say2(this.role === 'spotter' ? 'shooter' : 'spotter', 'Going loud. Weapons free. Stay on me.', delay);
      this._say2('isr', 'Overwatch copies loud. Hostiles are stacking on the doors. Make it fast.', delay + 4);
    }
    this._toast(plan === 'quiet' ? 'PLAN: QUIET. Squads will sweep the building room by room. Stay unseen and slip out.' : 'PLAN: LOUD. They\'re coming in. Fight your way to the van.', plan === 'quiet' ? 'cyan' : 'red');
  },

  // Host tick: vote clock, scheduled radio lines, close calls, the clean escape.
  _iceHost(dt) {
    const ob = this.obj, S = this.sentinel;
    for (const L of this._iceLines) if (L.at <= this.t && !L.done) { L.done = true; this._voice(L.who, L.text); this._broadcast({ k: 'radio', who: L.who, text: L.text }); }
    this._iceLines = this._iceLines.filter((L) => !L.done);
    if (!ob.ice) return;
    if (!ob.plan && ob.voteT > 0) {
      ob.voteT = Math.max(0, ob.voteT - dt);
      if (ob.voteT <= 0) {
        const v = Object.values(ob.vote);
        const plan = v.length && v.every((x) => x === 'loud') ? 'loud' : 'quiet';
        if (v.length && !v.every((x) => x === v[0])) this._say2('isr', 'No consensus, Sniper Cell. Stay quiet until they make you.');
        this._settle(plan, 2.5);
      }
    }
    if (!ob.plan) return;
    // Spotted during a quiet sweep: the plan's blown.
    const agents = this.agents().filter((a) => a.alive);
    const spotted = agents.find((a) => S.huntState(a.role) === 'detected');
    if (spotted && ob.plan === 'quiet' && !ob.blown) {
      ob.blown = true;
      this._say2(spotted.role, 'Contact! They\'ve got me! Going loud!');
      this._say2('isr', 'You\'re spotted. All units converging. Fight it out, Sniper Cell.', 2.5);
    }
    // Close calls: a sweeping squad works the room you're hiding in and moves on without seeing you.
    for (const a of agents) {
      if (a.downed) continue;
      const C = (this._close[a.role] = this._close[a.role] || { near: 0, armed: false, cool: 0, away: 0 });
      C.cool = Math.max(0, C.cool - dt);
      const room = this.fac.roomAt(a.pos.x, a.pos.z, a.pos.y);
      const sweeper = room && S.guards.find((g) => g.clear && g.state === 'search' && g.state !== 'dead' && Math.abs(g.y - a.pos.y) < 1.6 && Math.hypot(g.x - a.pos.x, g.z - a.pos.z) < 10);
      if (S.huntState(a.role) === 'detected') { C.armed = false; C.near = 0; continue; }
      if (sweeper) { C.near += dt; C.away = 0; if (C.near > 2.5) C.armed = true; }
      else if (C.armed) {
        C.away += dt;
        if (C.away > 3 && C.cool <= 0) {
          C.armed = false; C.near = 0; C.cool = 25;
          const hid = a.role === 'shooter' ? ['Walked right past me. Camo held.', 'He was close enough to touch. Clear now.'] : ['That was way too close. They\'re moving on.', 'Held my breath the whole time. They\'re gone.'];
          this._say2(a.role, hid[Math.floor(Math.random() * hid.length)]);
          this._say2(a.role === 'shooter' ? 'spotter' : 'shooter', 'Nice. Keep moving, get to the van.', 2.6);
        }
      } else C.near = 0;
    }
    // Out of the building and clear of the ring with the drive: say so once.
    const out = agents.length && agents.every((a) => !this.fac.insideBuilding(a.pos.x, a.pos.z, a.pos.y) && (Math.abs(a.pos.x) > 52 || a.pos.z > 16 || a.pos.z < -56));
    if (out && ob.drive && ob.drive !== 'ground' && !ob.escaped && !agents.some((a) => S.huntState(a.role) === 'detected')) {
      ob.escaped = true;
      if (ob.plan === 'quiet' && !ob.blown) {
        this._say2(ob.drive === 'spotter' ? 'spotter' : 'shooter', 'We\'re through the ring. Nobody saw a thing. Moving to the van.');
        this._say2('isr', 'Good copy, Sniper Cell. Clean exit. The van is warm on the east track.', 3);
      } else {
        this._say2(ob.drive === 'spotter' ? 'spotter' : 'shooter', 'We\'re out of the building! Moving to the van!');
        this._say2('isr', 'Copy. Van on the east track. Don\'t stop.', 2.5);
      }
    }
  },

  // Every client: vote panel and music state.
  _iceClient(dt) {
    const ob = this.obj;
    const open = this._voteOpen();
    this.voteEl.classList.toggle('on', open);
    if (open) {
      const nm = (r) => (r === this.role ? 'YOU' : this.partnerName || 'PARTNER');
      const roles = this.operative ? [this.role] : ['shooter', 'spotter'];
      this.voteEl.querySelector('.cv-votes').textContent = roles.map((r) => `${nm(r)}: ${ob.vote && ob.vote[r] ? ob.vote[r].toUpperCase() : '—'}`).join('  ·  ') + `  ·  ${Math.ceil(ob.voteT)} s`;
      for (const b of this.voteEl.querySelectorAll('button')) b.classList.toggle('sel', !!(ob.vote && ob.vote[this.role] === b.dataset.v));
    }
    // Music: only in the endgame (ICE, trace or a lockdown).
    let st = null;
    const S = this.sentinel;
    if (!this.ended && (ob.ice || S.lockdown || ob.traced)) {
      const hot = ['shooter', 'spotter'].some((r) => { const H = this._huntInfo(r); return H && H.state === 'detected'; }) ||
        S.guards.some((g) => (g.state === 'alert' || g.state === 'berserk') && Math.hypot(g.x - this.player.pos.x, g.z - this.player.pos.z) < 45);
      if (hot) this._combatHold = 9;
      else this._combatHold = Math.max(0, (this._combatHold || 0) - dt);
      st = this._combatHold > 0 ? 'combat' : ob.plan || ob.ice ? 'tension' : null;
    }
    if (this.ended) st = null;
    this.score.set(st);
  },
};

export function installIce(Cls) {
  for (const k of Object.keys(IceOps)) Cls.prototype[k] = IceOps[k];
}
