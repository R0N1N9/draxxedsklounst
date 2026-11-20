// Sniper Cell — text and voice chat between the two operators.
//   Text:  Enter (laptop) or the CHAT button (iPad) opens a line; Enter sends, Esc cancels.
//          Messages ride the existing game connection.
//   Voice: online co-op only. The MIC button / M cycles OFF → PUSH-TO-TALK (hold K, or hold
//          TALK on touch) → OPEN MIC. Audio goes peer-to-peer as a PeerJS media call over the
//          same WebRTC link as the game; each side calls the other with its own microphone
//          and answers incoming calls receive-only, so either player can switch on first.
//          A speaker icon lights up while your partner is talking.
const MODES = ['off', 'ptt', 'open'];
const MODE_LABEL = { off: 'MIC OFF', ptt: 'PUSH-TO-TALK (K)', open: 'OPEN MIC' };

export class Chat {
  constructor(game) {
    this.g = game;
    this.mode = 'off';
    this.stream = null;
    this.calls = [];
    const el = (this.el = document.createElement('div'));
    el.id = 'cell-chat';
    el.innerHTML = '<div class="ch-log"></div><form class="ch-form"><input class="ch-in" maxlength="140" autocomplete="off" placeholder="Say something — Enter to send, Esc to cancel" /></form><div class="ch-voice"><span class="ch-me"></span><span class="ch-them"></span></div>';
    document.body.appendChild(el);
    this.log = el.querySelector('.ch-log');
    this.form = el.querySelector('.ch-form');
    this.inp = el.querySelector('.ch-in');
    this.me = el.querySelector('.ch-me');
    this.them = el.querySelector('.ch-them');
    this.form.addEventListener('submit', (e) => { e.preventDefault(); this._send(); });
    this.inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Escape') { e.preventDefault(); this.close(); }
    });
    this.inp.addEventListener('blur', () => setTimeout(() => this.isOpen && this.close(), 80));
    addEventListener('keydown', (e) => {
      if (this.isOpen || !this.g.input.enabled || this.g.cine.active || this.g.tablet.visible) return;
      if (e.code === 'Enter') { e.preventDefault(); this.openBox(); }
      if (e.code === 'KeyM') this.cycle();
    });
    const net = game.net;
    if (net) {
      net.on('chat', (m) => this._line(String(m.m || '').slice(0, 140), game.partnerName, false));
      if (net.peer) net.peer.on('call', (call) => { call.answer(); this._listen(call); });
    }
    this._render();
  }

  get online() {
    const n = this.g.net;
    return !!(n && n.peer && n.conn && n.open);
  }

  // ---- text ----
  openBox() {
    this.isOpen = true;
    this.el.classList.add('typing');
    this.g.input.enabled = false;
    this.g.input.keys.clear();
    document.exitPointerLock && document.exitPointerLock();
    this.inp.value = '';
    setTimeout(() => this.inp.focus(), 0);
  }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.remove('typing');
    this.inp.blur();
    this.g.input.enabled = true;
    this.g.hud._chatClosed = performance.now();
    this.g.input.requestLock();
  }
  _send() {
    const m = this.inp.value.trim();
    if (m) {
      if (this.g.net && this.g.net.open) this.g.net.send({ t: 'chat', m });
      this._line(m, this.g.name, true);
      if (!this.g.net || !this.g.net.open) this._line(this.g.solo ? '(solo — nobody on the other end)' : '(link down — not delivered)', null, false, true);
    }
    this.close();
  }
  _line(text, who, mine, sys = false) {
    const d = document.createElement('div');
    d.className = 'ch-line' + (mine ? ' mine' : '') + (sys ? ' sys' : '');
    const b = document.createElement('b');
    b.textContent = who ? who + ': ' : '';
    d.appendChild(b);
    d.appendChild(document.createTextNode(text));
    this.log.appendChild(d);
    while (this.log.children.length > 7) this.log.firstChild.remove();
    setTimeout(() => d.classList.add('old'), 12000);
    if (!mine && !sys) this.g.sfx.ui(true);
  }

  // ---- voice ----
  async cycle() {
    const next = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
    if (next !== 'off' && !this.stream) {
      if (!this.online) { this._line(this.g.net ? 'Voice needs an online co-op match (not the two-tab test link).' : 'Voice chat is for online co-op.', null, false, true); return; }
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      } catch (e) {
        this._line('Microphone blocked — allow it in the browser to talk (needs the https page).', null, false, true);
        return;
      }
      const call = this.g.net.peer.call(this.g.net.conn.peer, this.stream);
      if (call) this.calls.push(call);
      this._meter(this.stream, 'me');
    }
    this.mode = next;
    this._apply(false);
    this._render();
    this._line(MODE_LABEL[this.mode], null, false, true);
  }
  _listen(call) {
    this.calls.push(call);
    call.on('stream', (s) => {
      if (this.audioEl) this.audioEl.srcObject = s;
      else {
        const a = (this.audioEl = document.createElement('audio'));
        a.autoplay = true;
        a.playsInline = true;
        a.srcObject = s;
        document.body.appendChild(a);
      }
      this.audioEl.play().catch(() => {});
      this._meter(s, 'them');
      this._line(`${this.g.partnerName} is on voice.`, null, false, true);
    });
  }
  // A small level meter so you can see who's talking.
  _meter(stream, who) {
    const A = this.g.audio;
    if (!A || !A.ctx) return;
    try {
      const src = A.ctx.createMediaStreamSource(stream);
      const an = A.ctx.createAnalyser();
      an.fftSize = 256;
      src.connect(an);
      this[who + 'An'] = an;
      this[who + 'Buf'] = new Uint8Array(an.fftSize);
    } catch {}
  }
  _level(who) {
    const an = this[who + 'An'], buf = this[who + 'Buf'];
    if (!an) return 0;
    an.getByteTimeDomainData(buf);
    let s = 0;
    for (const v of buf) s += (v - 128) * (v - 128);
    return Math.sqrt(s / buf.length) / 128;
  }
  _apply(talk) {
    if (!this.stream) return;
    const on = this.mode === 'open' || (this.mode === 'ptt' && talk);
    for (const t of this.stream.getAudioTracks()) t.enabled = on;
    this.talking = on;
  }
  _render() {
    this.el.classList.toggle('voice', this.mode !== 'off' || !!this.audioEl);
    this.me.textContent = this.mode === 'off' ? '' : (this.talking ? '● ' : '○ ') + MODE_LABEL[this.mode];
  }

  update() {
    const I = this.g.input;
    if (this.mode === 'ptt') {
      const talk = !this.isOpen && (I.held('KeyK') || I.held('T:cell-talk'));
      if (talk !== this.talking) { this._apply(talk); this._render(); }
    }
    if (I.pressed('cell-mic')) this.cycle();
    if (I.pressed('cell-chat')) this.openBox();
    const lv = this._level('them');
    this.them.textContent = this.audioEl ? (lv > 0.04 ? `🔊 ${this.g.partnerName}` : `🔈 ${this.g.partnerName}`) : '';
    this.them.classList.toggle('on', lv > 0.04);
    if (this.talking && this._level('me') > 0.04) this.me.classList.add('on'); else this.me.classList.remove('on');
  }
}
