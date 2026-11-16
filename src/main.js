import { Net } from './net.js';
import { Audio } from './audio.js';
import { randomCode } from './util.js';
import { PALETTES } from './atmosphere.js';
import { drawMap } from './briefmap.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const LOCAL = params.has('local'); // two tabs on one machine (testing)
// Opened as a standalone file (file://): invite links can't point anywhere, so share the code instead.
const FILE_MODE = location.protocol === 'file:';

const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem('draxxed.' + k);
      return v === null ? d : JSON.parse(v);
    } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem('draxxed.' + k, JSON.stringify(v)); } catch {}
  },
};

function detectQuality() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return 'low';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) + '';
    const ua = navigator.userAgent;
    if (/Apple M\d|Apple GPU|Apple/i.test(r) || /iPad|iPhone|Macintosh/.test(ua)) return 'high';
    if (/HD Graphics (2|3|4|5)\d{3}|HD Graphics$|Mesa Intel\(R\) HD|Ivybridge|Sandybridge|Haswell|llvmpipe|SwiftShader/i.test(r)) return 'low';
    if (/Mali|Adreno|PowerVR|Immortalis|Xclipse/i.test(r) || /Android/.test(ua)) return 'medium';
    if (/NVIDIA|GeForce|Radeon|RTX|Iris Xe|Arc/i.test(r)) return 'high';
    return 'medium';
  } catch {
    return 'medium';
  }
}

const settings = {
  name: store.get('name', ''),
  pal: store.get('pal', 'dusk'),
  quality: store.get('quality', 'auto'),
  sensitivity: store.get('sens', 1),
  invertY: store.get('invert', false),
  scopeToggle: store.get('toggle', 'ontouchstart' in window),
};

// ---- Menu wiring ----
$('in-name').value = settings.name;
$('in-pal').value = settings.pal;
$('in-quality').value = settings.quality;
$('in-sens').value = settings.sensitivity;
$('sens-val').textContent = (+settings.sensitivity).toFixed(2);
$('in-invert').checked = settings.invertY;
$('in-toggle').checked = settings.scopeToggle;
$('in-name').oninput = (e) => store.set('name', (settings.name = e.target.value.trim()));
$('in-pal').onchange = (e) => store.set('pal', (settings.pal = e.target.value));
$('in-quality').onchange = (e) => store.set('quality', (settings.quality = e.target.value));
$('in-sens').oninput = (e) => {
  settings.sensitivity = +e.target.value;
  $('sens-val').textContent = settings.sensitivity.toFixed(2);
  store.set('sens', settings.sensitivity);
};
$('in-invert').onchange = (e) => store.set('invert', (settings.invertY = e.target.checked));
$('in-toggle').onchange = (e) => store.set('toggle', (settings.scopeToggle = e.target.checked));

function showPanel(id) {
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('on', p.id === id));
}
document.querySelectorAll('.back').forEach((b) => (b.onclick = () => {
  if (net) { net.close(); net = null; }
  showPanel('panel-main');
}));

const audio = new Audio();
let net = null;
let game = null;

function callsign() {
  return (settings.name || 'Ghost').replace(/[<>&"]/g, '');
}

// Briefing map (drawn from the real terrain).
const mapCanvas = $('map');
const redrawMap = () => { if ($('menu').classList.contains('on')) drawMap(mapCanvas); };
requestAnimationFrame(() => setTimeout(redrawMap, 50));
addEventListener('resize', redrawMap);

function goFullscreen() {
  const el = document.documentElement;
  if ('ontouchstart' in window && el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch {}
}

async function startGame(mode, opts = {}) {
  showPanel('panel-loading');
  $('loading-text').textContent = 'Building the valley…';
  // Let the loading panel paint before the heavy world build.
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
  const quality = settings.quality === 'auto' ? detectQuality() : settings.quality;
  const { Game } = await import('./game.js');
  game = new Game({
    mode,
    net: opts.net || null,
    quality,
    paletteKey: opts.pal || settings.pal,
    name: callsign(),
    settings: { ...settings, audio },
    hostCode: opts.code,
    difficulty: opts.difficulty,
  });
  if (opts.oppName) game.oppName = opts.oppName;
  window.__game = game;
  $('menu').classList.remove('on');
  $('touch').classList.add('active');
  document.body.classList.toggle('touch', game.input.touch);
  game.input.enabled = true;
  game.input.requestLock();
  wirePause();
}

function wirePause() {
  const pause = $('pause');
  const touch = game.input.touch;
  const offline = game.offline || game.mode === 'practice';
  $('pause-note').textContent = offline ? 'Game paused.' : 'Online match — the game keeps running while you are in this menu.';
  const show = (on) => {
    pause.classList.toggle('on', on);
    game.paused = on;
  };
  document.addEventListener('pointerlockchange', () => {
    if (touch) return;
    const locked = document.pointerLockElement === game.renderer.domElement;
    const cardOpen = $('h-card').classList.contains('on') && $('h-card').querySelector('button');
    show(!locked && !cardOpen && !game.toolsOpen);
  });
  $('tb-pause').addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); show(true); }, { passive: false });
  $('btn-resume').onclick = () => {
    show(false);
    game.input.requestLock();
  };
  $('btn-exit').onclick = () => {
    if (game.net && game.net.close) game.net.close();
    location.href = location.pathname;
  };
  $('in-sens2').value = settings.sensitivity;
  $('sens-val2').textContent = (+settings.sensitivity).toFixed(2);
  $('in-sens2').oninput = (e) => {
    settings.sensitivity = +e.target.value;
    game.input.sensitivity = settings.sensitivity;
    $('sens-val2').textContent = settings.sensitivity.toFixed(2);
    store.set('sens', settings.sensitivity);
  };
  $('in-invert2').checked = settings.invertY;
  $('in-invert2').onchange = (e) => {
    store.set('invert', (settings.invertY = e.target.checked));
    game.input.invertY = settings.invertY;
  };
  $('in-toggle2').checked = settings.scopeToggle;
  $('in-toggle2').onchange = (e) => {
    store.set('toggle', (settings.scopeToggle = e.target.checked));
    game.input.scopeToggle = settings.scopeToggle;
  };
}

// Vs AI
const AI_DESC = {
  easy: 'Slow to spot you, loose aim, ignores most wind.',
  normal: 'Reads glint and muzzle flash, leads moving targets, decent wind calls.',
  hard: 'Fast, precise, punishes glint and careless movement. Relocates after shooting.',
};
let aiDiff = store.get('aidiff', 'normal');
const syncDiff = () => {
  document.querySelectorAll('#ai-diff button').forEach((b) => b.classList.toggle('on', b.dataset.d === aiDiff));
  $('ai-desc').textContent = AI_DESC[aiDiff];
};
document.querySelectorAll('#ai-diff button').forEach((b) => (b.onclick = () => { aiDiff = b.dataset.d; store.set('aidiff', aiDiff); syncDiff(); }));
syncDiff();
$('btn-ai-open').onclick = () => showPanel('panel-ai');
$('btn-ai').onclick = () => {
  audio.unlock();
  goFullscreen();
  startGame('ai', { difficulty: aiDiff });
};

// Sandbox
$('btn-sandbox').onclick = () => {
  audio.unlock();
  goFullscreen();
  startGame('sandbox', { difficulty: aiDiff });
};

// Practice
$('btn-practice').onclick = () => {
  audio.unlock();
  goFullscreen();
  startGame('practice');
};

// Host
let hostCode = null;
$('btn-host').onclick = async () => {
  audio.unlock();
  showPanel('panel-host');
  net = new Net();
  $('host-status').textContent = 'Setting up…';
  for (let attempt = 0; attempt < 4; attempt++) {
    hostCode = randomCode(5);
    $('host-code').textContent = hostCode;
    try {
      await net.host(hostCode, { local: LOCAL });
      break;
    } catch (e) {
      console.warn(e);
      if (attempt === 3) {
        $('host-status').textContent = 'Could not reach the matchmaking server. Check your connection and try again.';
        return;
      }
      net.close();
      net = new Net();
    }
  }
  $('host-status').textContent = 'Waiting for your friend to join…';
  net.on('open', () => {
    if (!game) {
      $('host-status').textContent = 'Friend connected!';
      enterAsHost();
    }
  });
};

function inviteLink() {
  const u = new URL(location.href);
  u.search = '';
  u.searchParams.set('join', hostCode);
  if (LOCAL) u.searchParams.set('local', '1');
  return u.toString();
}

$('btn-share').onclick = async () => {
  const link = inviteLink();
  if (FILE_MODE && !navigator.share) return copy(`Join my Draxxed Sklounst match — code ${hostCode}`);
  if (navigator.share) {
    const text = `Join my Draxxed Sklounst match — code ${hostCode}`;
    try { await navigator.share(FILE_MODE ? { title: 'Draxxed Sklounst', text } : { title: 'Draxxed Sklounst', text, url: link }); return; } catch {}
  }
  copy(link);
};
$('btn-copy').onclick = () => copy(FILE_MODE ? hostCode : inviteLink());
function copy(text) {
  (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(
    () => ($('host-status').textContent = 'Copied to clipboard!'),
    () => prompt('Copy this link:', text),
  );
}

function enterAsHost() {
  goFullscreen();
  startGame('host', { net, code: hostCode, pal: settings.pal });
}
$('btn-host-go').onclick = () => {
  audio.unlock();
  enterAsHost();
};

// Join
$('btn-join-open').onclick = () => {
  showPanel('panel-join');
  $('in-code').focus();
};
$('btn-join').onclick = async () => {
  audio.unlock();
  const code = $('in-code').value.trim().toUpperCase();
  if (code.length < 4) { $('join-status').textContent = 'Enter the 5-letter code.'; return; }
  $('join-status').textContent = 'Connecting…';
  if (net) net.close();
  net = new Net();
  let gotHello = false;
  net.on('hello', (m) => {
    if (gotHello) return;
    gotHello = true;
    $('join-status').textContent = 'Connected!';
    goFullscreen();
    startGame('guest', { net, pal: PALETTES[m.pal] ? m.pal : 'dusk', oppName: String(m.name || 'Opponent').replace(/[<>&"]/g, '').slice(0, 16) });
  });
  net.on('open', () => {
    $('join-status').textContent = 'Connected — waiting for host…';
    // Host greets on open; nudge in case we raced it.
    net.send({ t: 'hello', name: callsign(), pal: settings.pal });
  });
  try {
    await net.join(code, { local: LOCAL });
  } catch (e) {
    $('join-status').textContent = e.message || 'Could not connect.';
  }
};

if (params.get('join')) {
  showPanel('panel-join');
  $('in-code').value = params.get('join').toUpperCase().slice(0, 5);
  $('join-status').textContent = 'Tap Join to enter the match.';
}
