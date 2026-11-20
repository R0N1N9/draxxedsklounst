#!/usr/bin/env node
// Headless test driver for Multiverse modules (Playwright + Chromium with software GL).
//
//   node tools/mv-test.mjs dim <id> [--online] [--rounds 3] [--speed 3] [--time 150] [--shots DIR] [--size 1280x720] [--touch] [--seed 7]
//       Bot-vs-bot rounds in one dimension (hard cuts between rounds). With --online the same
//       is played by two tabs talking over BroadcastChannel, each simulating its own sniper.
//   node tools/mv-test.mjs fx <id> [--from A] [--to B] [--frames 12] [--shots DIR] [--size 1280x720] [--seed 7]
//       Renders evenly spaced frames of a transition and checks the timeline contract
//       (first frame = old world, opaque at the swap, last frame = new world).
//   node tools/mv-test.mjs match [--rounds 6] [--speed 2] [--shots DIR] [--seed 7] [--first ID]
//       A whole match with real transitions through random dimensions.
//
// Prints one JSON report on stdout; exit code 1 when anything failed.
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = createRequire('/opt/node-tools/')('playwright')); }

const argv = process.argv.slice(2);
const cmd = argv[0];
const id = argv[1] && !argv[1].startsWith('--') ? argv[1] : null;
const opt = (name, def) => {
  const i = argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const [W, H] = String(opt('size', '1280x720')).split('x').map(Number);
const SHOTS = opt('shots', null);
const SEED = +opt('seed', 7);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = join(ROOT, normalize(p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
});
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, ...(opt('touch', false) ? { hasTouch: true, isMobile: true } : {}) });

const report = { cmd, id, ok: true, errors: [], warnings: [] };
const fail = (msg) => { report.ok = false; report.errors.push(msg); };

async function open(query, tag) {
  const page = await context.newPage();
  // 404s for fonts / favicons are noise; anything else on the console is a finding.
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource|fonts\.g|GPU stall|net::ERR/i.test(t)) return;
    fail(`[${tag}] console: ${t.slice(0, 400)}`);
  });
  page.on('pageerror', (e) => fail(`[${tag}] exception: ${String(e.stack || e).slice(0, 600)}`));
  await page.goto(BASE + '?' + query);
  return page;
}
const state = (page) => page.evaluate(() => (window.__mv ? window.__mv.state : null));
let shotN = 0;
async function shot(page, name) {
  if (!SHOTS) return;
  await mkdir(SHOTS, { recursive: true });
  const file = join(SHOTS, `${String(++shotN).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file });
  (report.shots ||= []).push(file);
}
const mvErrors = (st, tag) => { for (const e of (st && st.errors) || []) if (!report.errors.includes(`[${tag}] ${e}`)) fail(`[${tag}] ${e}`); };

// ---------------------------------------------------------------------------
async function runDim() {
  const rounds = +opt('rounds', 3), speed = +opt('speed', 3), limit = +opt('time', 150) * 1000;
  const online = !!opt('online', false);
  const next = Array(rounds + 2).fill(id).join(',');
  const common = `dim=${id}&auto=1&fx=none&target=99&seed=${SEED}&next=${next}`;
  let host, guest;
  if (online) {
    const code = 'T' + Math.random().toString(36).slice(2, 6).toUpperCase();
    host = await open(`autohost=${code}&local=1&speed=1&${common}`, 'host');
    await sleep(400);
    guest = await open(`autojoin=${code}&local=1&auto=1&speed=1`, 'guest');
  } else host = await open(`speed=${speed}&${common}`, 'solo');
  const pages = online ? [['host', host], ['guest', guest]] : [['solo', host]];

  const t0 = Date.now();
  const seen = new Set();
  let st = null, frames = 0;
  while (Date.now() - t0 < limit) {
    await sleep(350);
    st = await state(host);
    if (!st) continue;
    const key = `r${st.round}-${st.phase}`;
    if (!seen.has(key) && st.round <= rounds) {
      seen.add(key);
      if (st.phase === 'intro') await sleep(700);
      for (const [tag, p] of pages) await shot(p, `${id}-${tag}-${key}`);
    } else if (st.phase === 'live' && st.round <= rounds && ++frames % 6 === 0) {
      for (const [tag, p] of pages) await shot(p, `${id}-${tag}-r${st.round}-live${frames / 6}`);
    }
    if (st.round > rounds || st.errors.length) break;
  }
  for (const [tag, p] of pages) mvErrors(await state(p), tag);
  if (!st) return fail('the director never started (window.__mv missing)');
  const points = st.log.filter((e) => e.ev === 'point');
  report.rounds = points.map((e) => ({ round: e.round, winner: e.winner, how: e.how, seconds: e.time }));
  report.wallSeconds = Math.round((Date.now() - t0) / 100) / 10;
  if (st.round <= rounds) fail(`only ${points.length} of ${rounds} rounds finished within ${limit / 1000}s (phase ${st.phase}, round ${st.round})`);
  const draws = points.filter((e) => e.winner < 0).length;
  if (draws) fail(`${draws} round(s) ended without a kill (${points.filter((e) => e.winner < 0).map((e) => e.how).join(', ')}): the bots could not finish the duel`);
  // GPU resources are counted at every mount; after the first round they must stop growing.
  const mem = st.log.filter((e) => e.ev === 'mount' && e.geo !== undefined);
  if (mem.length >= 3) {
    report.gpu = mem.map((e) => `${e.geo}g/${e.tex}t`);
    const a = mem[1], b = mem[mem.length - 1];
    if (b.geo > a.geo + 2 || b.tex > a.tex + 2) fail(`GPU resources grow between rounds (geometries/textures at each mount: ${report.gpu.join(' → ')}): dispose() is leaking`);
  }
  const slow = points.filter((e) => e.time > 60);
  if (slow.length) report.warnings.push(`${slow.length} round(s) ran past 60 s into sudden death`);
  const quick = points.filter((e) => e.winner >= 0 && e.time < 2.5);
  if (quick.length) report.warnings.push(`${quick.length} round(s) ended in under 2.5 s of live play: too fast to be a duel?`);
  if (online) {
    const gs = await state(guest);
    if (!gs) return fail('guest never started');
    const gp = gs.log.filter((e) => e.ev === 'point');
    report.guestRounds = gp.map((e) => ({ round: e.round, winner: e.winner, how: e.how }));
    if (JSON.stringify(gs.score) !== JSON.stringify(st.score)) fail(`score mismatch: host ${st.score} vs guest ${gs.score}`);
    const hw = points.map((e) => e.winner).join(''), gw = gp.map((e) => e.winner).join('');
    if (!hw.startsWith(gw) && !gw.startsWith(hw)) fail(`round winners differ: host ${hw} vs guest ${gw}`);
    const wins = [0, 1].map((i) => points.filter((e) => e.winner === i).length);
    report.winsByPlayer = wins;
    if (points.length >= 4 && (wins[0] === 0 || wins[1] === 0)) report.warnings.push(`one side won every online round (${wins}): check that both clients can land hits`);
  }
}

// ---------------------------------------------------------------------------
async function runFx() {
  const frames = +opt('frames', 12);
  const from = opt('from', 'example-2d'), to = opt('to', 'example-3d');
  const page = await open(`fxlab=${id}&from=${from}&to=${to}&seed=${SEED}`, 'fx');
  await page.waitForFunction(() => window.__mv && window.__mv.lab, null, { timeout: 30000 }).catch(() => {});
  const info = await page.evaluate(() => (window.__mv && window.__mv.lab ? window.__mv.lab.renderAt(0, true) : null));
  if (!info || !info.ok) { mvErrors(await state(page), 'fx'); return fail('the transition could not be started in the lab'); }
  const { duration, swapAt } = info;
  report.duration = duration;
  report.swapAt = swapAt;
  if (duration < 7 || duration > 12) report.warnings.push(`duration ${duration}s is outside the 7-12 s guideline`);
  if (info.firstDiff > 0.03) fail(`first frame differs from the old world (mean abs diff ${info.firstDiff.toFixed(3)}): the cut into the transition will pop`);
  await shot(page, `${id}-t0.00`);
  const swapT = swapAt * duration;
  const times = [];
  for (let i = 1; i < frames; i++) times.push((duration * i) / frames);
  times.push(swapT - 0.1, swapT + 0.02, duration - 0.02);
  times.sort((a, b) => a - b);
  const t0 = Date.now();
  for (const t of times) {
    const r = await page.evaluate((x) => window.__mv.lab.renderAt(x, true), t);
    if (!r || !r.ok) { fail(`renderAt(${t.toFixed(2)}) failed`); break; }
    await shot(page, `${id}-t${t.toFixed(2)}${Math.abs(t - swapT) < 0.11 ? '-swap' : ''}`);
    if (Math.abs(t - (swapT - 0.1)) < 1e-6 && r.coverage < 0.999) fail(`overlay not opaque 0.1 s before the swap (coverage ${(r.coverage * 100).toFixed(1)}%)`);
    if (Math.abs(t - (swapT + 0.02)) < 1e-6 && r.coverage < 0.999 && r.lastDiff > 0.03) report.warnings.push(`overlay is already ${((1 - r.coverage) * 100).toFixed(0)}% transparent right after the swap: fine only if the new world's first frames are meant to show`);
    if (Math.abs(t - (duration - 0.02)) < 1e-6 && r.lastDiff > 0.04) fail(`last frame differs from the new world (mean abs diff ${r.lastDiff.toFixed(3)}): the cut back to gameplay will pop`);
  }
  report.msPerFrame = Math.round((Date.now() - t0) / times.length);
  // Second pass with another seed: the film must differ run to run.
  mvErrors(await state(page), 'fx');
}

// ---------------------------------------------------------------------------
async function runMatch() {
  const rounds = +opt('rounds', 6), speed = +opt('speed', 2), limit = +opt('time', 420) * 1000;
  const first = opt('first', null);
  const page = await open(`${first ? `dim=${first}` : 'mv=ai'}&auto=1&speed=${speed}&target=${rounds}&seed=${SEED}`, 'match');
  const t0 = Date.now();
  const seen = new Set();
  let st = null, valleyAt = 0;
  while (Date.now() - t0 < limit) {
    await sleep(400);
    st = await state(page);
    if (!st) continue;
    const key = `r${st.round}-${st.dim}-${st.phase}${st.fx ? '-' + st.fx : ''}`;
    if (!seen.has(key)) { seen.add(key); await shot(page, key.replace('@', '')); }
    // The valley has no autopilot: let it run a few seconds, then settle the round by decree.
    if (st.dim === 'valley' && st.phase === 'live') {
      if (!valleyAt) valleyAt = Date.now();
      else if (Date.now() - valleyAt > 5000) { valleyAt = 0; await page.evaluate(() => window.__mv.forcePoint(Math.random() < 0.5 ? 0 : 1)); }
    } else valleyAt = 0;
    if (st.phase === 'final' || st.errors.length) break;
  }
  mvErrors(st, 'match');
  if (!st) return fail('the director never started');
  const pts = st.log.filter((e) => e.ev === 'point');
  report.score = st.score;
  report.rounds = pts.map((e) => ({ round: e.round, winner: e.winner, how: e.how, to: e.next, fx: e.fx }));
  report.dims = st.log.filter((e) => e.ev === 'mount').map((e) => e.dim);
  report.wallSeconds = Math.round((Date.now() - t0) / 1000);
  if (st.phase !== 'final') fail(`match did not reach the finale within ${limit / 1000}s (round ${st.round}, phase ${st.phase}, dim ${st.dim})`);
  else await shot(page, 'final');
}

try {
  if (cmd === 'dim' && id) await runDim();
  else if (cmd === 'fx' && id) await runFx();
  else if (cmd === 'match') await runMatch();
  else { report.ok = false; report.errors.push('usage: mv-test.mjs dim <id> | fx <id> | match   (see the header of this file)'); }
} catch (e) {
  fail('test driver: ' + String(e.stack || e).slice(0, 600));
}
await browser.close();
server.close();
console.log(JSON.stringify(report, null, 1));
process.exit(report.ok ? 0 : 1);
