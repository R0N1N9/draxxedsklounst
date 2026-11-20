// The legacy Net (src/net.js) keeps ONE handler per message type. In a Multiverse match
// the director and the valley game both listen on the same connection, so everything
// goes through this multiplexer instead.

export class Mux {
  constructor(net) {
    this.net = net;
    this.listeners = {};
  }

  on(type, fn) {
    const fresh = !this.listeners[type];
    // Register the listener before hooking the Net: Net.on() replays queued messages synchronously.
    (this.listeners[type] ||= []).push(fn);
    if (fresh) {
      this.net.on(type, (m) => {
        for (const f of this.listeners[type].slice()) {
          try { f(m); } catch (e) { console.error('net handler failed', type, e); }
        }
      });
    }
    return () => this.off(type, fn);
  }

  off(type, fn) {
    const l = this.listeners[type];
    if (!l) return;
    const i = l.indexOf(fn);
    if (i >= 0) l.splice(i, 1);
  }

  send(m) { this.net.send(m); }
  tick(dt) { this.net.tick(dt); }
  close() { this.net.close(); }
  get open() { return this.net.open; }
  get isHost() { return this.net.isHost; }
  get rtt() { return this.net.rtt; }

  // What the valley's Game expects of `net`: one handler per type, plus a `handlers` map it pokes directly.
  legacy() {
    const mux = this;
    const offs = {};
    return {
      handlers: {},
      on(type, fn) {
        this.handlers[type] = fn;
        if (offs[type]) offs[type]();
        offs[type] = mux.on(type, (m) => this.handlers[type] === fn && fn(m));
      },
      send: (m) => mux.send(m),
      tick() {}, // the director ticks the real connection
      close: () => mux.close(),
      get open() { return mux.open; },
      get isHost() { return mux.isHost; },
      get rtt() { return mux.rtt; },
    };
  }
}
