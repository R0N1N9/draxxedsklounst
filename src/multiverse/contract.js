// =============================================================================
// MULTIVERSE — module contract (the single source of truth)
// =============================================================================
// Draxxed Sklounst: Multiverse is a 1v1 sniper duel in which EVERY POINT SCORED
// tears the match into a different dimension: new perspective (first person,
// third person, top-down, side-on, isometric, text...), new theme, new map, new
// rules of physics, new loadout — joined by an over-the-top cinematic transition.
// The core fantasy never changes: two snipers, one clean shot wins the point.
//
// This file contains no runtime code that matters; it documents the interfaces
// between the core (director / stage / input / audio / hud) and the two kinds of
// plug-in module:
//
//   DIMENSION   src/multiverse/dimensions/<id>/index.js   a complete mini sniper game
//   TRANSITION  src/multiverse/transitions/<id>.js        a 7-12 s cinematic between two dimensions
//
// Modules are plain ES modules with a default export. No build step, no npm
// dependencies: only `three` (vendor/three.module.js, via the import map) and
// `three/addons/postprocessing/{EffectComposer,RenderPass,ShaderPass,UnrealBloomPass,OutputPass}.js`
// are available. All art is procedural (canvas / geometry / shaders) and all
// sound is synthesized — there are NO asset files.
//
// Tone: stylized and bloodless. Hits are light, ink, sparks, pixels, confetti —
// never gore.
//
// -----------------------------------------------------------------------------
// 1. DIMENSION MODULE
// -----------------------------------------------------------------------------
/**
 * @typedef {Object} DimensionModule
 * @property {string} id            kebab-case, equals the folder name
 * @property {string} name          display name, e.g. 'NEON LATTICE'
 * @property {string} tagline       one short line for the title card
 * @property {string} perspective   e.g. 'TOP-DOWN 2D', 'THIRD PERSON', 'SIDE-ON PIXEL ART'
 * @property {'2d'|'three'} renderer
 *   '2d'    — you draw on ctx.g (CanvasRenderingContext2D) and must paint every pixel each frame.
 *   'three' — you render with the shared ctx.three.renderer; ctx.g is a transparent 2D overlay
 *             canvas on top of it (cleared by the core before each render) for reticles etc.
 * @property {'look'|'pointer'} aim
 *   'look'    — relative aiming (first / third person). Desktop uses pointer lock.
 *   'pointer' — absolute aiming (2D). Desktop shows a cursor; touch / gamepad use an aim stick.
 * @property {{bg:string, fg:string, accent:string}} palette   CSS colours; used by the HUD,
 *             the title card and by transitions to theme themselves around your world.
 * @property {{fire?:string, alt?:string, a1?:string, a2?:string, jump?:string}} controls
 *             Labels for the actions you actually use (omit the rest). `fire` is always the
 *             rifle. `alt` is a held modifier (SCOPE / FOCUS / STEADY). `a1` and `a2` are
 *             abilities — your take on the loadout (dash, decoy, smoke, ping, grapple...).
 * @property {boolean} [altToggle]  on touch, make `alt` a latching toggle instead of a hold
 * @property {number}  [roundTime]  seconds of live play before SUDDEN DEATH (default 60)
 * @property {number}  [overTime]   seconds the kill moment lasts before the transition (default 2.4)
 * @property {string[]} [angleFields] names of network-state fields that are angles in radians
 *             (interpolated along the shortest arc), e.g. ['a'] or ['yaw']
 * @property {boolean} [dev]        true hides the module from the match rotation (examples)
 * @property {(ctx: DimensionContext) => DimensionInstance} create
 */

/**
 * @typedef {Object} DimensionInstance
 * @property {(dt:number) => void} update   advance the simulation. dt is seconds, already
 *             clamped (<= 1/20) and time-scaled (the core slows time during the kill moment).
 *             Called in every phase — see ctx.phase for what you may do in each.
 * @property {() => void} render            draw one frame
 * @property {(w:number, h:number) => void} [resize]   CSS-pixel size changed (update camera aspect)
 * @property {(phase:'intro'|'live'|'over') => void} [onPhase]
 * @property {(msg:Object) => void} [onNet] an event the remote player's instance sent with ctx.net.send
 * @property {() => {x:number, y:number}} [focus]  CSS-pixel screen position of the round's
 *             decisive moment (where the victim is on screen). Transitions use it as the
 *             impact point (the shatter origin, the zoom target...). Default: screen centre.
 * @property {() => void} dispose           free everything you created (see RULES)
 */

/**
 * @typedef {Object} DimensionContext
 *
 * -- drawing ------------------------------------------------------------------
 * @property {number} width   stage width in CSS pixels (live getter)
 * @property {number} height  stage height in CSS pixels (live getter)
 * @property {number} dpr     device pixel ratio in use (<= 2)
 * @property {HTMLCanvasElement} canvas   the 2D canvas
 * @property {CanvasRenderingContext2D} g The core sets the transform so that 1 unit = 1 CSS
 *             pixel before every render(). Draw in a [0,width] x [0,height] space.
 * @property {{THREE: Object, renderer: Object}} [three]  only when renderer === 'three'.
 *             The WebGLRenderer is SHARED and persistent: the core sizes it and resets its
 *             state (tone mapping, clear colour, shadow map, render target, viewport) before
 *             create(). Never dispose it, never resize it, never replace its canvas.
 *
 * -- who is playing -----------------------------------------------------------
 * @property {0|1} me         index of the local player
 * @property {PlayerInfo[]} players  [player 0, player 1]
 * @property {'bot'|'remote'} opponent
 * @property {number} botSkill   0..1 (0.25 recruit, 0.55 veteran, 0.9 elite)
 * @property {boolean} autopilot when true, ALSO drive the local player with your bot AI.
 *             The automated tests rely on this to play whole rounds bot-vs-bot.
 *
 * -- match state (live getters) -----------------------------------------------
 * @property {'intro'|'live'|'over'} phase
 *             'intro' — title card and 3-2-1 countdown. The world is visible, both players
 *                       stand at their spawns. Animate the world, but NO movement, NO firing.
 *             'live'  — the duel.
 *             'over'  — somebody was hit (ctx.result is set). Keep simulating and rendering:
 *                       this is your kill moment (death animation, slow-motion bullet,
 *                       confetti...). Further kills are ignored.
 * @property {number} time     seconds of live play this round (0 during intro). In online play
 *             both clients agree on it to within ~0.1 s — drive every moving piece of the
 *             world (platforms, shrinking zones, day/night) as a PURE FUNCTION of ctx.time.
 * @property {boolean} sudden  true once roundTime has elapsed: SUDDEN DEATH. From then on you
 *             MUST make each player's position obvious to the other (beacon, outline, marker)
 *             and SHOULD escalate (shrink the arena, remove cover). 40 s later the core calls
 *             the round a draw and moves on without a point.
 * @property {{winner:number, victim:number, how:string}|null} result   set in phase 'over'
 * @property {number} round    1-based round number of the match
 * @property {number[]} score  [player 0, player 1]
 * @property {number} target   points needed to win the match
 *
 * -- services -----------------------------------------------------------------
 * @property {InputState} input
 * @property {AudioKit} audio
 * @property {HudApi} hud
 * @property {DuelNet} net
 * @property {number} seed     integer; identical on both clients for this round
 * @property {() => number} rng seeded PRNG in [0,1), identical sequence on both clients.
 *             Use it ONLY inside create() to generate the world, so both clients build the
 *             same map. Use Math.random() for cosmetic runtime randomness.
 * @property {(victim:0|1, info?:{how?:string}) => void} kill
 *             Report that player `victim` has been taken out; their opponent scores.
 *             `how` is a short label for the kill banner ('HEADSHOT', 'RICOCHET', '412 M').
 *             Ignored unless phase === 'live'. WHO MAY CALL IT:
 *               offline (opponent === 'bot'):  you simulate both players — call it for any death.
 *               online  (opponent === 'remote'): call it ONLY when (a) a shot fired by the
 *                 LOCAL player hits the remote player's puppet → kill(1 - me), or (b) the LOCAL
 *                 player dies to the environment → kill(me). Never judge the remote player's
 *                 shots: their client does that and you will be told through phase 'over'.
 */

/**
 * @typedef {Object} PlayerInfo
 * @property {0|1} index
 * @property {string} name     callsign (already sanitised, <= 16 chars)
 * @property {string} color    identity colour: player 0 '#f2b35b' (amber), player 1 '#40d8e8' (cyan).
 *             Use these (or themed equivalents that stay clearly warm vs. cool) so a player
 *             can always tell which sniper is theirs.
 * @property {boolean} isLocal
 * @property {boolean} isBot
 */

// -----------------------------------------------------------------------------
// 2. HOW A DIMENSION IS STRUCTURED (netcode + bot in one pattern)
// -----------------------------------------------------------------------------
// Keep two symmetric player entities and drive each from a small COMMAND object
// every frame:
//
//     cmd = { mx, my, aim..., fire, alt, a1, a2, jump }
//
//   - the local human:   cmd built from ctx.input
//   - a bot:             cmd built by YOUR botThink(self, enemy, dt) — used for the opponent
//                        when ctx.opponent === 'bot', and for the local player too when
//                        ctx.autopilot is true
//   - the remote human:  NO cmd. That entity is a puppet: copy position / aim / flags from
//                        ctx.net.remote (already interpolated) every frame.
//
// Online, each client simulates only its own player and its own shots:
//
//     ctx.net.sendState({ x, y, a, ... })      every frame (the core throttles to 20 Hz)
//     ctx.net.send({ k: 'shot', ... })         one-off events → the peer's onNet(msg), used
//                                              to draw the tracer / ability on their screen
//     my shot hits the puppet  →  ctx.kill(1 - ctx.me, { how })
//
// Player 0 always takes spawn A and player 1 spawn B, so both clients agree.
// The bot must be fair and beatable: reaction delay, aim error and hesitation
// that scale with ctx.botSkill; it must move, use cover and use its abilities.
// A dimension must be fun against the bot — that is how most rounds are played.
//
// SCALE: this is a sniper duel. Spawns are far apart for the world's scale, but
// each player must be able to locate the other within a few seconds — either
// both are on screen, or there is a sightline / scope / indicator that gets you
// there. Rounds should usually resolve in 15-60 s.
//
// ONE SHOT: a clean hit wins the point. (Armour, shields and near-miss
// mechanics are fine as flavour; long health bars are not.)

/**
 * @typedef {Object} DuelNet
 * @property {boolean} online
 * @property {(state:Object) => void} sendState   flat object of numbers / booleans / short
 *             strings describing your local player. Call it every frame; no-op offline.
 * @property {Object|null} remote   the remote player's state, interpolated ~100 ms in the past
 *             (numbers lerp; fields listed in module.angleFields take the shortest arc;
 *             everything else snaps). null until the first snapshot arrives, and offline.
 * @property {(msg:Object) => void} send   reliable one-off event to the peer's instance.onNet.
 *             Only delivered to an instance of the same round. No-op offline.
 */

// -----------------------------------------------------------------------------
// 3. INPUT
// -----------------------------------------------------------------------------
/**
 * One object, refreshed by the core before every update(). Device differences
 * (keyboard+mouse, touch, gamepad) are already folded in.
 *
 * @typedef {Object} InputState
 * @property {number} moveX   -1..1 (A/D, arrows, left stick)
 * @property {number} moveY   -1..1, NEGATIVE = up / forward (W, stick up)
 * @property {number} lookX   relative aim delta accumulated this frame, in mouse-pixel
 *             equivalents (sensitivity applied). 'look' dimensions: yaw -= lookX * 0.0022
 * @property {number} lookY   positive = down (invert-Y already applied). pitch -= lookY * 0.0022
 * @property {number} pointerX  mouse position in CSS pixels ('pointer' dimensions, desktop)
 * @property {number} pointerY
 * @property {number} stickX  aim stick (right touch stick / gamepad right stick), -1..1
 * @property {number} stickY  positive = down
 * @property {(fromX:number, fromY:number, fallback:number) => number} aimAngle
 *             For 'pointer' dimensions: the angle (radians, atan2(dy, dx), y down) at which
 *             a player drawn at screen position (fromX, fromY) is aiming. Mouse → towards
 *             the cursor. Touch / gamepad → the aim-stick direction, or `fallback` (pass your
 *             current angle) while the stick is at rest.
 * @property {boolean} fire  @property {boolean} firePressed  @property {boolean} fireReleased
 * @property {boolean} alt   @property {boolean} altPressed   @property {boolean} altReleased
 * @property {boolean} a1    @property {boolean} a1Pressed
 * @property {boolean} a2    @property {boolean} a2Pressed
 * @property {boolean} jump  @property {boolean} jumpPressed
 * @property {'kbm'|'touch'|'gamepad'} device   most recently used device
 *
 * Bindings (for your own hint text): move WASD / arrows · fire LMB · alt RMB ·
 * a1 Shift or Q · a2 E or F · jump Space. Gamepad: sticks, RT fire, LT alt,
 * LB a1, RB a2, A jump. Touch: the core draws a stick, FIRE and one button per
 * entry in module.controls, labelled with your labels.
 *
 * `firePressed` is a discrete trigger pull — shoot on it. On touch in 'pointer'
 * dimensions it also fires when the aim stick is released while deflected
 * (drag to aim, let go to shoot), so do NOT build charge-and-release mechanics
 * on fire; use `alt` (held) for focus / steady / scope.
 */

// -----------------------------------------------------------------------------
// 4. AUDIO
// -----------------------------------------------------------------------------
/**
 * Everything is synthesized with WebAudio. All methods are safe no-ops before
 * the audio context is unlocked.
 *
 * @typedef {Object} AudioKit
 * @property {AudioContext|null} ctx
 * @property {AudioNode|null} out     connect custom nodes here (goes through the master bus)
 * @property {number} now             ctx.currentTime (0 when locked)
 * @property {(o:{freq:number, freqEnd?:number, type?:OscillatorType, dur?:number, gain?:number,
 *             attack?:number, delay?:number, pan?:number, detune?:number}) => void} tone
 *             one enveloped oscillator note; freqEnd gives an exponential pitch sweep
 * @property {(o:{dur?:number, gain?:number, filter?:BiquadFilterType, freq?:number,
 *             freqEnd?:number, q?:number, attack?:number, delay?:number, pan?:number}) => void} noise
 *             one filtered noise burst; freqEnd sweeps the filter
 * @property {(name:string, o?:{gain?:number, pitch?:number, delay?:number, pan?:number}) => void} sfx
 *             presets: 'shot' 'shotHeavy' 'laser' 'zap' 'thud' 'boom' 'hit' 'kill' 'whoosh'
 *             'swoosh' 'riser' 'drop' 'glitch' 'blip' 'click' 'chime' 'powerup' 'error'
 *             'bell' 'shatter' 'tick' 'heartbeat'
 * @property {(spec:MusicSpec) => void} music   start a looping step-sequencer pattern
 *             (replaces any current one with a short crossfade)
 * @property {(fade?:number) => void} stopMusic
 */
/**
 * @typedef {Object} MusicSpec
 * @property {number} bpm
 * @property {number} [steps]     steps per bar (default 16); each step is a 16th note
 * @property {number} [gain]      overall level (default 0.5)
 * @property {Array<{type:'sine'|'square'|'sawtooth'|'triangle'|'noise'|'kick'|'snare'|'hat',
 *             notes:Array<number|null>, gain?:number, decay?:number, cutoff?:number}>} tracks
 *             notes are MIDI numbers (60 = middle C) or null for a rest, one per step, looped;
 *             for 'noise' / 'kick' / 'snare' / 'hat' any non-null value is a hit.
 */

// -----------------------------------------------------------------------------
// 5. HUD
// -----------------------------------------------------------------------------
/**
 * The core draws the shared chrome for every dimension: score, names, round
 * clock, sudden-death warning, ability chips, kill banner, title card. It is
 * themed from module.palette. Draw anything else (reticle, ammo, in-world
 * markers) yourself.
 *
 * @typedef {Object} HudApi
 * @property {(text:string, sub?:string, dur?:number) => void} message   centre-screen callout
 * @property {(slot:'fire'|'alt'|'a1'|'a2'|'jump', frac:number) => void} cooldown
 *             frac 1 = just used, 0 = ready. Drives the chip / touch-button sweep.
 * @property {(slot:'fire'|'alt'|'a1'|'a2'|'jump', n:number|null) => void} charges
 *             optional count badge (ammo, uses left); null hides it
 */

// -----------------------------------------------------------------------------
// 6. TRANSITION MODULE
// -----------------------------------------------------------------------------
// A transition is a short, over-the-top cinematic that carries both players from
// the world that just ended into the next one. It plays on its own overlay
// (a WebGL canvas with alpha, with a 2D canvas above it) which sits on top of
// everything. Underneath, the core tears down the old dimension and builds the
// new one at the swap point.
//
// TIMELINE (t in seconds, 0 → duration):
//   t = 0                  your first frame must show ctx.fromImage full-screen, unaltered,
//                          so the cut from gameplay into the transition is invisible.
//   0 → swapAt·duration    Act 1: do something outrageous to the old world.
//   t = swapAt·duration    THE SWAP. From ~0.15 s before this moment until ctx.toImage
//                          becomes non-null, the overlay must be FULLY OPAQUE (every pixel
//                          covered). Put the swap on a flash, a blackout or a hold: building
//                          the next world can hitch for a frame or two.
//   swapAt → 1             Act 2: arrive. ctx.toImage is now the first frame of the new
//                          world. Either use it as a texture, or open transparent holes in
//                          your overlay to reveal the live world underneath.
//   t = duration           your last frame must be ctx.toImage full-screen, or fully
//                          transparent, so the cut back to gameplay is invisible.
//
// A transition must be different every time it plays: draw on ctx.rng to vary its
// cast, order, colours, camera path and text — and USE THE CONTEXT (who won, who
// lost, the names and palettes of the two worlds) so that it makes sense as the
// bridge between THIS kill and THAT world.
//
// Determinism: a transition's picture must be a function of (ctx, t) only — use
// ctx.rng for randomness (never Math.random()) and never read the wall clock.
// Both online clients then see the same film, and the test tool can render any
// frame on demand.
//
// Sound: score the film. Fire each cue once as t passes its time (keep a cue
// index; never trigger sounds from render()). Anything that loops or sustains
// (ctx.audio.music, your own nodes) must be stopped in dispose() — the next
// dimension starts in silence.
/**
 * @typedef {Object} TransitionModule
 * @property {string} id         kebab-case, equals the file name
 * @property {string} name       display name, e.g. 'LAST SYNAPSE'
 * @property {number} duration   seconds, 7..12
 * @property {number} swapAt     0.35..0.75 — fraction of duration at which the swap happens
 * @property {(ctx: TransitionContext) => TransitionInstance} create
 */
/**
 * @typedef {Object} TransitionInstance
 * @property {(dt:number, t:number) => void} update   t = seconds since the start
 * @property {(t:number) => void} render
 * @property {() => void} dispose
 */
/**
 * @typedef {Object} TransitionContext
 * @property {number} width  @property {number} height  @property {number} dpr
 * @property {HTMLCanvasElement} canvas   overlay 2D canvas (top layer)
 * @property {CanvasRenderingContext2D} g cleared, with a CSS-pixel transform, before every render()
 * @property {{THREE:Object, renderer:Object}} three   shared overlay WebGLRenderer (alpha: true,
 *             clear alpha 0, autoClear true), BELOW the 2D canvas. Reset by the core before
 *             create(). Never dispose or resize it.
 * @property {HTMLCanvasElement} fromImage   last frame of the old world (device pixels)
 * @property {HTMLCanvasElement|null} toImage  first frame of the new world; null until the swap (live getter)
 * @property {DimensionMeta} from   @property {DimensionMeta} to
 * @property {PlayerInfo|null} winner   who scored (null if the round was a draw)
 * @property {PlayerInfo|null} loser
 * @property {boolean} localWon     the local player scored
 * @property {string} how           the kill label ('HEADSHOT', ...), may be ''
 * @property {{x:number, y:number}} focus   CSS-pixel impact point in fromImage
 * @property {number[]} score  @property {number} target  @property {number} round
 * @property {boolean} matchPoint   the next point could end the match
 * @property {number} seed  @property {() => number} rng
 * @property {AudioKit} audio
 */
/**
 * @typedef {Object} DimensionMeta
 * @property {string} id @property {string} name @property {string} tagline
 * @property {string} perspective @property {{bg:string, fg:string, accent:string}} palette
 */

// -----------------------------------------------------------------------------
// 7. RULES FOR EVERY MODULE
// -----------------------------------------------------------------------------
//  1. Own nothing global. No listeners on window/document (input comes from ctx.input),
//     no timers that outlive dispose(), no rAF loops (the core calls update/render), no
//     DOM outside the canvases you are given, no CSS, no localStorage.
//  2. dispose() frees every geometry, material, texture, render target and audio node you
//     created (kit3d.disposeTree(root) helps). The shared renderers and canvases stay.
//  3. Handle any size. Phones in landscape (667x375) up to 16:10 desktops (1728x1117) and
//     4:3 iPads (1180x820). Re-read ctx.width / ctx.height every frame; never cache them.
//  4. Budget: 60 fps on an M1 at devicePixelRatio 2. No per-frame allocations in hot loops,
//     no per-frame getImageData, no unbounded particle counts.
//  5. Never throw. A module that throws in create/update/render is ejected mid-match.
//  6. Readability first: both players, the bullets and whatever can kill you must always
//     read clearly against the background, on a 11" tablet at arm's length.
//  7. Fonts: 'Rajdhani' and 'JetBrains Mono' are loaded. Apple system fonts with a generic
//     fallback are fair game for flavour ('Marker Felt', 'Chalkduster', 'Futura',
//     'American Typewriter', 'Copperplate', 'Didot', 'Courier New', 'Menlo', 'Impact').

// -----------------------------------------------------------------------------
// 8. DEV / TEST HARNESS
// -----------------------------------------------------------------------------
// URL parameters (all optional, combine freely):
//   ?dim=<id>         skip the menu: offline match vs the bot, starting in that dimension
//   ?auto=1           autopilot (bot plays the local player too)
//   ?speed=<1..8>     simulation steps per frame (fast-forward for tests)
//   ?skill=<0..1>     bot skill
//   ?seed=<int>       fixed match seed
//   ?target=<n>       points to win (default 7)
//   ?next=<id,id,..>  forced order of the following dimensions
//   ?fx=<id>|none     force every transition to be <id>; 'none' = hard cut
//   ?fxlab=<id>&from=<dimId>&to=<dimId>   transition lab: no gameplay, loops the transition
//   ?autohost=<CODE>&local=1 / ?autojoin=<CODE>&local=1   online match over BroadcastChannel
//                     between two tabs of one browser (add dim/auto/etc. on the host)
//
// window.__mv (the director) exposes for tests:
//   __mv.state  → { phase:'idle'|'loading'|'intro'|'live'|'over'|'transition'|'final',
//                   round, score:[a,b], target, dim, fx, online, me, errors:[string], log:[{t,ev,...}] }
//   __mv.forcePoint(winner)   award a point right now (offline or host)
//   __mv.lab.renderAt(t)      (transition lab) deterministically render the frame at time t
//
// Command line (Playwright, headless Chromium, software GL):
//   node tools/mv-test.mjs dim <id> [--online] [--rounds N] [--shots DIR] [--speed N] [--time S]
//   node tools/mv-test.mjs fx <id> [--from A --to B] [--frames N] [--shots DIR]
//   node tools/mv-test.mjs match [--rounds N] [--shots DIR]
// Prints a JSON report and writes PNG screenshots to DIR. `dim` fails on any exception,
// on rounds the bots cannot finish, on GPU resources that grow from round to round and,
// with --online, on the two clients disagreeing. `fx` fails if the first frame is not the
// old world, the overlay is not opaque at the swap, or the last frame is not the new world.

export const PLAYER_COLORS = ['#f2b35b', '#40d8e8'];
export const DEFAULTS = { roundTime: 60, suddenTime: 40, overTime: 2.4, target: 7, introTime: 3.6 };
export const BOT_SKILL = { easy: 0.25, normal: 0.55, hard: 0.9 };
