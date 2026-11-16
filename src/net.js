import { NET } from './config.js';

// Thin transport layer: PeerJS (WebRTC data channel, internet) or BroadcastChannel
// (two tabs on one machine, for testing). Messages are small JSON objects {t: type, ...}.
export class Net {
  constructor() {
    this.handlers = {};
    this.conn = null;
    this.peer = null;
    this.bc = null;
    this.isHost = false;
    this.open = false;
    this.rtt = 0;
    this._pingT = 0;
  }

  on(type, fn) {
    this.handlers[type] = fn;
    // Deliver anything that arrived before a handler existed (e.g. while the world was loading).
    if (this.queue && this.queue.length) {
      const pending = this.queue.filter((m) => m.t === type);
      this.queue = this.queue.filter((m) => m.t !== type);
      for (const m of pending) fn(m);
    }
  }

  _emit(type, data) {
    const h = this.handlers[type];
    if (h) h(data);
    else if (data && type !== 'open' && type !== 'close') {
      (this.queue ||= []).push(data);
      if (this.queue.length > 300) this.queue.shift();
    }
  }

  _recv(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === '_ping') return this.send({ t: '_pong', s: msg.s });
    if (msg.t === '_pong') { this.rtt = performance.now() - msg.s; return; }
    this._emit(msg.t, msg);
  }

  send(msg) {
    if (!this.open) return;
    try {
      if (this.conn) this.conn.send(msg);
      else if (this.bc) this.bc.postMessage(msg);
    } catch (e) {
      console.warn('send failed', e);
    }
  }

  tick(dt) {
    this._pingT -= dt;
    if (this.open && this._pingT <= 0) {
      this._pingT = 2;
      this.send({ t: '_ping', s: performance.now() });
    }
  }

  _ready() {
    this.open = true;
    this._emit('open');
  }

  _closed() {
    if (!this.open) return;
    this.open = false;
    this._emit('close');
  }

  host(code, { local = false } = {}) {
    this.isHost = true;
    return local ? this._local(code, true) : this._peerHost(code);
  }

  join(code, { local = false } = {}) {
    this.isHost = false;
    return local ? this._local(code, false) : this._peerJoin(code);
  }

  _local(code, host) {
    return new Promise((resolve) => {
      this.bc = new BroadcastChannel('ridgeline-' + code);
      this.bc.onmessage = (e) => {
        const m = e.data;
        if (m.t === '_hello' && host && !this.open) {
          this.bc.postMessage({ t: '_welcome' });
          this._ready();
        } else if (m.t === '_welcome' && !host && !this.open) {
          this._ready();
        } else if (m.t === '_bye') this._closed();
        else this._recv(m);
      };
      addEventListener('beforeunload', () => this.bc && this.bc.postMessage({ t: '_bye' }));
      if (!host) {
        const hello = () => {
          if (this.open) return;
          this.bc.postMessage({ t: '_hello' });
          setTimeout(hello, 500);
        };
        hello();
      }
      resolve();
    });
  }

  _peerHost(code) {
    return new Promise((resolve, reject) => {
      const Peer = window.Peer;
      if (!Peer) return reject(new Error('Networking library failed to load.'));
      this.peer = new Peer(NET.peerPrefix + code, { debug: 1 });
      this.peer.on('open', () => resolve());
      this.peer.on('error', (err) => {
        if (!this.open) reject(err);
        else console.warn(err);
      });
      this.peer.on('connection', (conn) => {
        if (this.conn) { conn.close(); return; }
        this._attach(conn);
      });
    });
  }

  _peerJoin(code) {
    return new Promise((resolve, reject) => {
      const Peer = window.Peer;
      if (!Peer) return reject(new Error('Networking library failed to load.'));
      this.peer = new Peer({ debug: 1 });
      let done = false;
      const timer = setTimeout(() => {
        if (!done) reject(new Error('Could not reach the host. Check the code and try again.'));
      }, 15000);
      this.peer.on('open', () => {
        const conn = this.peer.connect(NET.peerPrefix + code, { reliable: true, serialization: 'json' });
        this._attach(conn, () => { done = true; clearTimeout(timer); resolve(); });
      });
      this.peer.on('error', (err) => {
        if (!done) { done = true; clearTimeout(timer); reject(err.type === 'peer-unavailable' ? new Error('No game found with that code.') : err); }
      });
    });
  }

  _attach(conn, onOpen) {
    this.conn = conn;
    conn.on('open', () => {
      this._ready();
      onOpen && onOpen();
    });
    conn.on('data', (d) => this._recv(d));
    conn.on('close', () => { this.conn = null; this._closed(); });
    conn.on('error', (e) => console.warn('conn error', e));
  }

  close() {
    try {
      if (this.bc) { this.bc.postMessage({ t: '_bye' }); this.bc.close(); }
      if (this.conn) this.conn.close();
      if (this.peer) this.peer.destroy();
    } catch {}
    this.open = false;
  }
}
