// TTY DUEL — the shell on the bottom edge: a log that types itself out, and a prompt that
// echoes whatever you just did as a command.
import { clamp } from '../../kit.js';
import { FONT } from './look.js';

const CPS = 70;      // characters typed per second
const MAX = 40;

export function makeTerm(pal) {
  const lines = [];
  const T = { lines, cmd: '', cmdT: 0, cmdAge: 99, tickCb: null, blink: 0, typing: 0 };
  let head = 0;       // first line that is not fully typed
  let clock = 0;

  /** Add a line to the log. kind: info | sys | warn | me | foe */
  T.say = (txt, kind = 'info') => {
    lines.push({ txt, kind, n: 0, age: 0 });
    if (lines.length > MAX) { lines.shift(); head = Math.max(0, head - 1); }
  };
  /** The prompt line echoes a command, typed fast. */
  T.run = (cmd) => { T.cmd = cmd; T.cmdT = 0; T.cmdAge = 0; };
  T.clear = () => { lines.length = 0; head = 0; T.cmd = ''; };

  T.update = (dt) => {
    clock += dt;
    T.blink += dt;
    T.cmdAge += dt;
    if (T.cmdT < T.cmd.length) T.cmdT += dt * 90;
    if (T.cmdAge > 2.6 && T.cmd) T.cmd = '';
    for (const l of lines) l.age += dt;
    // The log types in order; a backlog speeds it up so it never falls behind the action.
    const backlog = lines.length - head;
    let budget = dt * CPS * (1 + Math.max(0, backlog - 1) * 0.7);
    T.typing = 0;
    while (head < lines.length && budget > 0) {
      const l = lines[head];
      const need = l.txt.length - l.n;
      if (need <= 0) { head++; continue; }
      const take = Math.min(need, budget);
      const before = Math.floor(l.n / 3);
      l.n += take;
      budget -= take;
      T.typing = 1;
      if (T.tickCb && Math.floor(l.n / 3) !== before) T.tickCb();
    }
  };

  const colour = (k, my, foe) => (k === 'me' ? my : k === 'foe' ? foe : k === 'warn' ? pal.warn : k === 'sys' ? pal.lo : pal.mid);

  /** Draw the newest lines bottom-up inside [x0, x1] x [y0, y1]. */
  T.draw = (g, L, my, foe, over) => {
    const fs = L.cf, lh = L.lineH, x0 = L.cx0, y1 = L.cy1;
    const maxCh = Math.max(12, Math.floor((L.cx1 - L.cx0) / (fs * 0.6)));
    g.font = `500 ${fs}px ${FONT}`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    if (over) { // a phone: the log floats over the map, so it gets a veil behind it
      const veil = g.createLinearGradient(0, L.cy0 - 8, 0, y1);
      veil.addColorStop(0, 'rgba(0,0,0,0)');
      veil.addColorStop(1, 'rgba(0,0,0,0.62)');
      g.fillStyle = veil;
      g.fillRect(L.cx0 - 10, L.cy0 - 8, L.cx1 - L.cx0 + 20, y1 - L.cy0 + 10);
    }
    // prompt
    const py = y1 - lh / 2;
    g.globalAlpha = 1;
    g.fillStyle = pal.hi;
    const label = 'tty0:~$ ';
    g.fillText(label, x0, py);
    const lw = label.length * fs * 0.6;
    const cmd = T.cmd.slice(0, Math.floor(T.cmdT));
    g.fillStyle = pal.mid;
    g.fillText(cmd, x0 + lw, py);
    const cx = x0 + lw + cmd.length * fs * 0.6;
    if ((T.blink % 1.05) < 0.62 || T.typing || T.cmdT < T.cmd.length) {
      g.fillStyle = pal.hi;
      g.fillRect(cx + 1, py - fs * 0.62, fs * 0.58, fs * 1.18);
    }
    // log
    const rows = L.lines - 1;
    let row = 0;
    for (let i = Math.min(lines.length, head + 1) - 1; i >= 0 && row < rows; i--, row++) {
      const l = lines[i];
      const txt = l.txt.length > maxCh ? l.txt.slice(0, maxCh - 1) + '…' : l.txt;
      const shown = txt.slice(0, Math.floor(l.n));
      if (!shown) continue;
      const fade = over ? clamp(1 - (l.age - 5) / 3, 0, 1) : clamp(1 - (l.age - 12) / 10, 0.35, 1);
      if (fade <= 0.02) continue;
      g.globalAlpha = fade * (row === 0 ? 1 : 0.82);
      g.fillStyle = colour(l.kind, my, foe);
      g.fillText('> ' + shown.replace(/^> /, ''), x0, y1 - lh * (row + 1.5));
    }
    g.globalAlpha = 1;
  };
  return T;
}
