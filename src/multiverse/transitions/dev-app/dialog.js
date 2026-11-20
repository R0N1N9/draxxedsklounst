// DEV-APP — Act 1: the dialog. A perfectly ordinary system alert asks the mode's own
// name back at the players, a pointer drifts in and reaches for [No], and one of five gags
// makes sure the answer is Yes. Each gag is a pure function of time: where the buttons are,
// what they say, where the pointer goes, when it clicks.
import { seg, ease, lerp, clamp, rgba, mixHex, roundRect } from '../../kit.js';
import { appIcon, dropShadow, drawButton, fit } from './ui.js';

export const T_POP = 0.72; // the first 0.7 s is the frozen world and nothing else: the deadpan beat
export const T_OUT = 3.6;  // every gag has said "Great choice!" — and been read — by here

/** When each gag says Yes (`acc`), its clicks ([time, lands?]) and its sounds. */
export const GAGS = {
  // [No] and [Yes] swap places as the pointer arrives; it chases No across; they swap back.
  dodge: {
    acc: 3.0, clicks: [[3.0, 1]],
    cues: [[1.72, 'swoosh', { gain: 0.35, pitch: 1.5 }], [2.36, 'tick', { gain: 0.3, pitch: 0.7 }], [2.64, 'swoosh', { gain: 0.4, pitch: 1.8 }], [3.0, 'click', { gain: 0.9 }]],
  },
  // Hovering [No] rolls its label over to Yes; then the question quietly becomes a statement.
  relabel: {
    acc: 2.98, clicks: [[2.98, 1]],
    cues: [[1.94, 'blip', { gain: 0.5, pitch: 0.8 }], [2.4, 'tick', { gain: 0.35, pitch: 0.6 }], [2.98, 'click', { gain: 0.9 }]],
  },
  // [Remind me later] works. For half a second. "It is now later."
  later: {
    acc: 3.02, clicks: [[1.84, 1]],
    cues: [[1.84, 'click', { gain: 0.9 }], [1.92, 'swoosh', { gain: 0.3 }], [2.36, 'chime2'], [2.6, 'tick', { gain: 0.3 }], [2.74, 'tick', { gain: 0.3, pitch: 1.12 }], [2.88, 'tick', { gain: 0.3, pitch: 1.26 }], [3.02, 'click', { gain: 0.9, pitch: 0.9 }]],
  },
  // [Yes (3)] counts itself down while the pointer dawdles; No is greyed out when it gets there.
  countdown: {
    acc: 2.6, clicks: [[2.76, 0]],
    cues: [[1.46, 'tick', { gain: 0.5 }], [2.02, 'tick', { gain: 0.55, pitch: 1.2 }], [2.58, 'tick', { gain: 0.6, pitch: 1.5 }], [2.6, 'click', { gain: 0.9, pitch: 0.9 }], [2.76, 'click', { gain: 0.5, pitch: 1.3 }], [2.78, 'dead']],
  },
  // Clicking [No] breaks it: it swings from one screw and drops off the dialog. Yes fills the gap.
  fall: {
    acc: 3.02, clicks: [[1.94, 1], [3.02, 1]],
    cues: [[1.94, 'click', { gain: 0.9 }], [1.97, 'creak'], [2.46, 'swoosh', { gain: 0.35, pitch: 0.8 }], [2.9, 'thud', { gain: 0.5 }], [3.02, 'click', { gain: 0.9 }]],
  },
};

export function dialogLayout(w, h, th) {
  const s = clamp(Math.min(w / 880, h / 540), 0.66, 1.7);
  const strip = th.hard ? Math.round(22 * s) : 0;
  const cw = Math.round(392 * s), pad = 24 * s, icon = 56 * s, bh = Math.round(38 * s), gap = 10 * s;
  const ch = Math.round(strip + pad + icon + 14 * s + 26 * s + 4 * s + 38 * s + 20 * s + bh + 22 * s);
  const x = Math.round((w - cw) / 2), y = Math.round((h - ch) / 2 - h * 0.015);
  const bw = (cw - pad * 2 - gap) / 2, by = y + ch - 22 * s - bh;
  const L = { x: x + pad, y: by, w: bw, h: bh }, R = { x: x + pad + bw + gap, y: by, w: bw, h: bh };
  // Where the pointer rests on a button: low and right of the label, so it never hides the word.
  const at = (b) => ({ x: b.x + b.w * 0.66, y: b.y + b.h * 0.6 });
  return { s, x, y, w: cw, h: ch, pad, icon, bh, bw, gap, by, strip, r: th.hard ? 2 : 18 * s, L, R, full: { x: x + pad, y: by, w: cw - pad * 2, h: bh }, no: at(L), yes: at(R) };
}

/** The pointer's waypoints through the gag: [{t, x, y, bow}]. `bow` arcs the leg that ENDS at this key. */
export function gagKeys(key, D, w, h, plan) {
  const e = { x: plan.entry.x * w, y: plan.entry.y * h }, b = plan.bow, s = D.s;
  const no = D.no, yes = D.yes;
  const K = (t, p, dx = 0, dy = 0, bow = 0) => ({ t, x: p.x + dx * s, y: p.y + dy * s, bow });
  switch (key) {
    case 'dodge':
      return [K(1.0, e), K(1.96, no, 0, 0, b), K(2.34, no), K(2.42, no, -7, 1), K(2.5, no, 6, -1), K(2.58, no), K(2.92, yes, 0, 0, -0.12)];
    case 'relabel':
      return [K(1.0, e), K(1.88, no, 0, 0, b), K(2.24, no), K(2.52, no, 14, 58, 0.2), K(2.7, no, 14, 58), K(2.92, no, 0, 0, -0.2)];
    case 'later':
      return [K(1.0, e), K(1.74, no, 0, 0, b), K(1.98, no), K(2.5, no, -86, 74, 0.25), K(2.66, no, -86, 74), K(2.74, no, -90, 66), K(3.0, no, -90, 66)];
    case 'countdown': {
      const mid = { x: lerp(e.x, no.x, 0.4), y: lerp(e.y, no.y, 0.4) };
      return [K(1.1, e), K(2.04, mid, 0, 0, b), K(2.14, mid, -3, -2), K(2.7, no, 0, 0, b * 0.5)];
    }
    default: // fall
      return [K(1.0, e), K(1.84, no, 0, 0, b), K(2.5, no), K(2.72, no, 8, 15), K(2.9, no, 2, 0)];
  }
}

const inside = (p, b) => (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h ? 1 : 0);
const pressed = (t, t0) => (t < t0 ? 0 : t < t0 + 0.05 ? (t - t0) / 0.05 : Math.max(0, 1 - (t - t0 - 0.05) / 0.16));
const inOut = (t, tin, tout) => {
  const leave = ease.inQuad(seg(t, tout, tout + 0.2));
  return { a: ease.outCubic(seg(t, tin, tin + 0.14)) * (1 - leave), sc: (0.84 + 0.16 * ease.outBack(seg(t, tin, tin + 0.36))) * (1 - 0.07 * leave) };
};

function card(g, th, D, plan, t, c) {
  if (c.a <= 0.002) return;
  const s = D.s, cx = D.x + D.w / 2, cy = D.y + D.h / 2;
  g.save();
  g.globalAlpha = c.a;
  g.translate(cx, cy);
  g.scale(c.sc, c.sc);
  g.translate(-cx, -cy);
  dropShadow(g, th, D.x, D.y, D.w, D.h, D.r, 60 * s, 0.42);
  roundRect(g, D.x, D.y, D.w, D.h, D.r);
  g.fillStyle = th.card;
  g.fill();
  g.strokeStyle = th.cardLine;
  g.lineWidth = th.hard ? Math.max(1.5, 2 * s) : 1;
  g.stroke();
  if (D.strip) {
    g.fillStyle = th.line;
    g.fillRect(D.x, D.y, D.w, D.strip);
    g.fillStyle = th.card;
    g.font = th.ui(11 * s, 700);
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(plan.app.toUpperCase(), D.x + 9 * s, D.y + D.strip / 2 + 0.5);
    g.fillRect(D.x + D.w - D.strip + 6 * s, D.y + 6 * s, D.strip - 12 * s, D.strip - 12 * s);
  }
  // Accepted (however it happened): the icon hops, the copy turns to praise, confetti.
  const ack = c.ack || 0, since = c.since === undefined ? -1 : c.since;
  let y = D.y + D.strip + D.pad;
  const hop = since > 0 && since < 0.34 ? Math.sin((since / 0.34) * Math.PI) : 0;
  g.save();
  g.translate(cx, y + D.icon / 2 - hop * 9 * s);
  g.scale(1 + hop * 0.1, 1 + hop * 0.1);
  appIcon(g, th, -D.icon / 2, -D.icon / 2, D.icon, t);
  g.restore();
  const iconY = y + D.icon / 2;
  y += D.icon + 14 * s;
  // Title — it can roll into a second one (the question becomes a statement), and then into the verdict.
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const tw = D.w - D.pad * 1.4, ty = y + 13 * s;
  const title = (text, slot) => {
    if (Math.abs(slot) >= 1) return;
    fit(g, text, tw, 19 * s, (px) => th.ui(px, 600));
    g.fillStyle = th.cardText;
    g.fillText(text, cx, ty + slot * 27 * s);
  };
  // Titles change by rolling through a one-line window, like a counter wheel.
  const k = c.tk || 0;
  g.save();
  g.beginPath();
  g.rect(D.x, ty - 13.5 * s, D.w, 27 * s);
  g.clip();
  if (ack > 0) {
    title(c.titleB && k >= 0.5 ? c.titleB : c.title, -ack);
    title('Great choice!', 1 - ack);
  } else {
    title(c.title, -k);
    if (c.titleB) title(c.titleB, 1 - k);
  }
  g.restore();
  y += 26 * s + 4 * s;
  for (let i = 0; i < 2; i++) {
    const line = c.body[i];
    if (!line) continue;
    fit(g, line, tw, 13 * s, (px) => th.ui(px, 400));
    g.fillStyle = rgba(th.cardDim, 1 - Math.min(1, ack * 2));
    g.fillText(line, cx, y + 9.5 * s + i * 19 * s);
  }
  if (ack > 0.5) {
    g.font = th.ui(13 * s, 400);
    g.fillStyle = rgba(th.cardDim, ack * 2 - 1);
    g.fillText('Developing your app…', cx, y + 19 * s);
  }
  // Screw holes left behind by a button that is no longer there.
  if (c.holes) {
    for (const hole of c.holes) {
      g.fillStyle = rgba(th.cardText, 0.28 * hole.a);
      g.beginPath();
      g.arc(hole.x, hole.y, 2.1 * s, 0, Math.PI * 2);
      g.fill();
    }
  }
  for (const b of c.btns) {
    if (b.alpha !== undefined && b.alpha <= 0.01) continue;
    if (ack > 0 && !b.took) b.dead = Math.max(b.dead || 0, ack * 0.75);
    g.save();
    if (b.alpha !== undefined) g.globalAlpha = c.a * b.alpha;
    if (b.rot || b.sc) {
      const px = b.pivot ? b.pivot.x : b.x + b.w / 2, py = b.pivot ? b.pivot.y : b.y + b.h / 2;
      g.translate(px + (b.dx || 0), py + (b.dy || 0));
      if (b.rot) g.rotate(b.rot);
      if (b.sc) g.scale(b.sc, b.sc);
      g.translate(-px, -py);
    } else if (b.dx || b.dy) g.translate(b.dx || 0, b.dy || 0);
    b.s = s;
    drawButton(g, th, b.x, b.y, b.w, b.h, b);
    if (b.screws) {
      g.fillStyle = rgba(mixHex(th.btnText, th.btn, 0.35), 0.9);
      for (const sx of b.screws) {
        g.beginPath();
        g.arc(sx, b.y + b.h / 2, 1.9 * s, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
  }
  if (since > 0.02 && since < 0.9) {
    // Paper confetti off the icon: the software is delighted with itself.
    const cols = c.confetti, seeds = plan.keySeeds, life = since - 0.02;
    g.globalAlpha = c.a * (1 - seg(life, 0.45, 0.85));
    for (let i = 0; i < 18; i++) {
      const r1 = seeds[i], r2 = seeds[i + 20], r3 = seeds[i + 40];
      const ang = -Math.PI / 2 + (r1 - 0.5) * 2.5, sp = (150 + r2 * 210) * s;
      const drag = 1 - Math.exp(-3.2 * life);
      const px = cx + (Math.cos(ang) * sp * drag) / 3.2 * 2.2, py = iconY + (Math.sin(ang) * sp * drag) / 3.2 * 2.2 + 420 * s * life * life;
      g.save();
      g.translate(px, py);
      g.rotate(r3 * 6 + life * (r1 - 0.5) * 22);
      g.fillStyle = cols[i % cols.length];
      g.fillRect(-3.2 * s, -1.6 * s * (0.5 + r2), 6.4 * s, 3.2 * s * (0.5 + r2));
      g.restore();
    }
    g.globalAlpha = c.a;
  }
  g.restore();
}

const TITLE = 'Do you want to develop an app?';

/** Draw the dialog for time t. `cur` is the pointer position (hover states follow it). */
export function drawGag(g, th, D, plan, key, t, cur, confetti) {
  const G = GAGS[key], L = D.L, R = D.R, s = D.s;
  const since = t - G.acc;
  const base = { title: TITLE, body: plan.body, btns: [], ack: ease.inOutCubic(seg(t, G.acc + 0.07, G.acc + 0.24)), since, confetti };
  if (key === 'dodge') {
    const k1 = ease.inOutCubic(seg(t, 1.72, 2.06)), k2 = ease.inOutCubic(seg(t, 2.64, 2.96));
    const m = k1 - k2, arc = Math.sin(Math.PI * (k2 > 0 ? k2 : k1));
    const no = { x: lerp(L.x, R.x, m), y: L.y, w: L.w, h: L.h, label: 'No', kind: 0, sc: 1 - 0.05 * arc, dy: arc * 5 * s };
    const yes = { x: lerp(R.x, L.x, m), y: R.y, w: R.w, h: R.h, label: 'Yes', kind: 1, sc: 1 + 0.05 * arc, dy: -arc * 5 * s, press: pressed(t, G.acc), took: 1 };
    no.hover = inside(cur, no);
    yes.hover = inside(cur, yes);
    card(g, th, D, plan, t, Object.assign(base, inOut(t, T_POP, T_OUT), { btns: [no, yes] }));
  } else if (key === 'relabel') {
    const roll = ease.inOutCubic(seg(t, 1.94, 2.2));
    const no = { x: L.x, y: L.y, w: L.w, h: L.h, label: 'No', labelB: 'Yes', roll, kind: roll, press: pressed(t, G.acc), took: 1 };
    const yes = { x: R.x, y: R.y, w: R.w, h: R.h, label: 'Yes', kind: 1 };
    no.hover = inside(cur, no);
    yes.hover = inside(cur, yes);
    card(g, th, D, plan, t, Object.assign(base, inOut(t, T_POP, T_OUT), { btns: [no, yes], titleB: 'You want to develop an app.', tk: ease.inOutCubic(seg(t, 2.38, 2.64)) }));
  } else if (key === 'later') {
    const later = { x: L.x, y: L.y, w: L.w, h: L.h, label: 'Remind me later', px: 13, kind: 0, press: pressed(t, 1.84) };
    const yes = { x: R.x, y: R.y, w: R.w, h: R.h, label: 'Yes', kind: 1 };
    later.hover = inside(cur, later);
    card(g, th, D, plan, t, Object.assign({}, inOut(t, T_POP, 1.92), { title: TITLE, body: plan.body, btns: [later, yes] }));
    const ok = { x: D.full.x, y: D.full.y, w: D.full.w, h: D.full.h, label: 'OK', kind: 1, fill: seg(t, 2.52, 3.0) * (1 - seg(t, G.acc, G.acc + 0.1)), press: pressed(t, G.acc), took: 1 };
    card(g, th, D, plan, t, Object.assign(base, inOut(t, 2.36, T_OUT), { title: 'It is now later.', body: ['You asked to be reminded.', 'This is the reminder.'], btns: [ok] }));
  } else if (key === 'countdown') {
    const n = clamp(3 - Math.floor((t - 0.9) / 0.56), 0, 3);
    const dead = seg(t, G.acc, G.acc + 0.08);
    const shake = t > 2.76 ? Math.sin((t - 2.76) * 60) * 5 * s * Math.max(0, 1 - (t - 2.76) / 0.22) : 0;
    const beat = t > 1.4 && t < G.acc ? Math.max(0, 1 - Math.abs(((t - 0.9) % 0.56) / 0.12)) : 0;
    const no = { x: L.x, y: L.y, w: L.w, h: L.h, label: 'No', kind: 0, dead, dx: shake };
    const yes = { x: R.x, y: R.y, w: R.w, h: R.h, label: `Yes (${n})`, kind: 1, fill: seg(t, 0.9, G.acc) * (1 - seg(t, G.acc, G.acc + 0.1)), press: pressed(t, G.acc), sc: 1 + 0.04 * beat, took: 1 };
    no.hover = dead ? 0 : inside(cur, no);
    card(g, th, D, plan, t, Object.assign(base, inOut(t, T_POP, T_OUT), { btns: [no, yes] }));
  } else {
    // fall: a damped swing about the right-hand screw, then gravity.
    const t0 = 1.96, tDrop = 2.46;
    const u = Math.max(0, t - t0);
    let rot = t < t0 ? 0 : -1.32 * (1 - Math.exp(-5.5 * u) * Math.cos(11 * u));
    let dy = 0, dx = 0;
    if (t > tDrop) {
      const f = t - tDrop;
      dy = 0.5 * 3400 * s * f * f;
      dx = -40 * s * f;
      rot -= 2.6 * f;
    }
    const grow = ease.outBack(seg(t, 2.5, 2.9));
    const no = { x: L.x, y: L.y, w: L.w, h: L.h, label: 'No', kind: 0, rot, dx, dy, pivot: { x: L.x + L.w - 9 * s, y: L.y + L.h / 2 }, press: pressed(t, 1.94), screws: [L.x + 9 * s, L.x + L.w - 9 * s], took: 1 };
    const yx = lerp(R.x, D.full.x, grow);
    const yes = { x: yx, y: R.y, w: R.x + R.w - yx, h: R.h, label: 'Yes', kind: 1, press: pressed(t, G.acc), took: 1 };
    no.hover = t < t0 ? inside(cur, no) : 0;
    yes.hover = inside(cur, yes);
    const holes = [{ x: L.x + 9 * s, y: L.y + L.h / 2, a: seg(t, t0, t0 + 0.1) * (1 - grow) }, { x: L.x + L.w - 9 * s, y: L.y + L.h / 2, a: seg(t, tDrop, tDrop + 0.05) * (1 - grow) }];
    card(g, th, D, plan, t, Object.assign(base, inOut(t, T_POP, T_OUT), { btns: [yes, no], holes }));
  }
}
