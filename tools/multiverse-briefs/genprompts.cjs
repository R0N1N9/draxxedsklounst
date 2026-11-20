// Writes the builder and second-engineer prompts for every brief in briefs.json:
//   node tools/multiverse-briefs/genprompts.cjs <scratch-dir>
// -> <scratch-dir>/prompts/build-<id>.md and harden-<id>.md. Give a builder agent the build
// prompt; give a second engineer the harden prompt plus the first engineer's report
// (reports/<id>.md here holds the reports of worlds that still need that second pass).
const SCRATCH = require('path').resolve(process.argv[2] || '.')
const B = JSON.parse(require('fs').readFileSync(__dirname + '/briefs.json', 'utf8'))
const A = { items: [...B.dims.map((d) => ({ kind: 'dim', ...d })), ...B.fx.map((f) => ({ kind: 'fx', ...f }))] }
const items = A.items || []
const pairs = A.pairs || [['example-2d', 'example-3d'], ['example-3d', 'example-2d']]
const pairText = pairs.map((p) => '--from ' + p[0] + ' --to ' + p[1]).join('   |   ')

const SHARED = `
PROJECT
You are working in the git repository at /home/user/draxxedsklounst: DRAXXED SKLOUNST, a browser 1v1 sniper duel (vanilla ES modules, three.js vendored in vendor/, no build step, no assets — all art procedural, all sound synthesized). The existing game is a serious long-range duel in a mountain valley. We are building a secret inside it: a mode with the innocent name "Do you want to develop an app?" that starts as that ordinary valley duel and then, the moment the first point is scored, goes completely off the rails — every point from then on tears the match into a different DIMENSION (new perspective: first person, third person, top-down, side-on platformer, side-on brawler, isometric, text...; new setting, sensible or absurd; new map; new rules of physics; new loadout), carried there by an over-the-top cinematic TRANSITION that is different every time. The owner is going to spring this on a friend who has only ever seen the valley. The core fantasy never changes — two snipers, one clean shot — but each arrival should make the player say "wait, WHAT?" and then grin. Internally this is the "multiverse" (src/multiverse). Target hardware: M1 Mac (Safari/Chrome, keyboard + mouse or gamepad) and M1 iPad (Safari, touch). 60 fps at devicePixelRatio 2.

Tone: stylized and bloodless. Hits are light, ink, sparks, pixels, confetti, plastic bits — never gore.
Originality: a world may be inspired by an era, a genre or a school of art (a 1930s cartoon, a manga page, a 1990s arcade cabinet, a war film) but is never a copy of a specific work: no existing game's, film's or studio's characters, names, logos, levels, music or signature designs, and no real-world insignia or symbols. Invent everything.
The range of looks is deliberate: some worlds push the hardware as far as it goes, others are simple by design — but every one of them must be stylish, and nothing may ever look cheap or like programmer art.

HARD RULES
- You own ONLY the files named under "FILES YOU OWN". Other engineers are editing this same working tree right now: do not create, edit, move or delete anything else in the repository (the registry entry for your module already exists).
- Never run a state-changing git command (add, commit, stash, checkout, switch, reset, restore, clean, rebase). Read-only git is fine.
- No new dependencies, no asset files, no network requests, no build step. Plain modern ES modules that run unmodified in Safari 16+ and Chrome. 2-space indent, single quotes, semicolons; comments explain WHY, tersely (match the existing src/*.js).
- Every scratch file (scripts, screenshots) goes under YOUR scratch directory given below — never into the repository.
- Browser automation: Playwright + headless Chromium are preinstalled (do not install anything). From a .cjs script anywhere: const { chromium } = require('playwright'). In .mjs: import { createRequire } from 'node:module'; const { chromium } = createRequire('/home/user/draxxedsklounst/')('playwright'). Launch args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']. tools/mv-test.mjs already does all of this and serves the repo itself — read its header; copy its server/launch code when you need a custom script. Software GL is slow (10-30 fps): that is the test machine, not your module — but anything that drops it to a crawl here will not hold 60 fps on an iPad either. Always close browsers and servers you start.
- Images: look at your screenshots with the Read tool. Judging the picture with your own eyes is part of the job, not optional.
- Your final message is consumed by a program, not shown to a person: return exactly what the RETURN section asks for.
`

// ---------------------------------------------------------------------------
// DIMENSIONS
// ---------------------------------------------------------------------------
const dimTests = (id, dir) => `
      node tools/mv-test.mjs dim ${id} --rounds 3 --shots ${dir}/solo
      node tools/mv-test.mjs dim ${id} --online --rounds 3 --shots ${dir}/online
      node tools/mv-test.mjs dim ${id} --rounds 1 --size 1180x820 --touch --shots ${dir}/ipad
      node tools/mv-test.mjs dim ${id} --rounds 1 --size 667x375 --touch --shots ${dir}/phone`

const dimBuild = (it) => `
You are a senior game developer and art director. Build ONE dimension of the Multiverse, to a finished, shippable standard.
${SHARED}
YOUR DIMENSION: id "${it.id}" — working title "${it.name}"
${it.brief}
The brief fixes the perspective, the fantasy and the mechanical hook. Names, layout, exact abilities, palette and every detail of execution are yours to make excellent — improve on the brief wherever you see a better game in it, as long as it stays a one-shot SNIPER duel and keeps its perspective.

READ FIRST, IN THIS ORDER
 1. src/multiverse/contract.js — the binding interface and rules. All of it applies to you.
 2. src/multiverse/dimensions/${it.example === '3d' ? 'example-3d' : 'example-2d'}/index.js — a complete minimal dimension (also glance at the other example). Follow its STRUCTURE (seeded world, two symmetric entities driven by per-frame commands, bot, remote puppet, shooter-judged hits, sudden death, focus(), dispose()), not its looks: the examples are deliberately plain and far below your bar.
 3. src/multiverse/kit.js — shared helpers (maths, seeded random, colour, 2D raycast/collision, particles, shake, three helpers). Use them rather than re-implementing; also src/util.js (noise2, fbm, segSegClosest, segBox).
 4. Skim src/multiverse/director.js (_tick, _applyPoint, _ctx) if you need to know exactly when you are called, and src/multiverse/hud.js + multiverse.css for where the shared chrome sits.

FILES YOU OWN: everything under src/multiverse/dimensions/${it.id}/ — index.js (default export, module.id === "${it.id}") plus any extra modules you split out (split once index.js passes ~700 lines).
YOUR SCRATCH DIRECTORY: ${SCRATCH}/${it.id}/

FIDELITY TIER: ${it.tier === 'showcase'
    ? 'SHOWCASE. This is one of the worlds that shows what the hardware can do. Push an M1 as far as it goes at 60 fps: real-time shadows, custom shaders, instancing for dense detail, post-processing (three/addons EffectComposer: bloom, grade, grain; write your own passes with ShaderPass), atmosphere, animated everything. The core lowers the 3D resolution automatically when frames run long (see resize() in the contract) — so size your composer / render targets in resize() and keep the cost in pixels, not in draw calls. Screenshots of this world should look like a trailer.'
    : 'GRAPHIC. This world is simple by design — its power is in art direction, not polygon counts: perfection of line, shape, colour, typography and motion; a bold, instantly recognisable style carried through every pixel, including its in-world UI. Simple is not the same as plain: it must look deliberate, rich and finished, and never cheap.'}

WHAT "DONE" MEANS
Gameplay
 - Unmistakably a SNIPER duel: distance, patience, reading the other player, one clean shot. A hit wins the point.
 - Room to play: spawns are far apart for this world's scale with open ground between them. A player can hold the range and make the long shot, or work their way in (cover, routes, movement tools) for an easier shot at greater risk — both must be real, viable choices, for the human and for the bot.
 - Skill: hitting at range takes something — lead on a moving target, drop, sway, wind, timing a window, reading a ricochet — never just putting a cursor on a target. Close up it gets easier, as it should.
 - Either player can locate the other within a few seconds (both on screen, or a sightline / scope / tell that gets you there). Rounds between competent players resolve in roughly 10-45 s.
 - A living world: things happen around the duel — set-pieces, passers-by, weather, machinery, creatures, the odd absurd surprise — and a few of them matter to the fight (moving cover, a blocked sightline, a fairly telegraphed hazard). Anything that affects play is timed from the seed and ctx.time so both clients see the same thing; pure decoration may use Math.random.
 - Controls that fit THIS world and are learnable in three seconds. Every world plays differently, so nobody arrives knowing the scheme: keep it to move, aim, fire, alt and at most two abilities (plus jump where the world needs it), give each a one-or-two-word label a newcomer understands (set controls.move / controls.aim when the stick and mouse do something other than plain MOVE / AIM — CARVE, SWIM, PAN THE SCOPE), and set module.hint to the one sentence a first-time player must know ('Shots bounce once.'). The core shows the whole scheme on the title card for the device in hand; make the first five seconds of play teach the rest (a visible aim line, a reticle that shows what alt does, abilities that explain themselves when used). It must be fully playable by BOTH players, on keyboard + mouse and on touch.
 - A point is scored one way only: one sniper shoots the other. No other win condition; hazards may kill, but the duel is decided by a shot far more often than not.
 - \`alt\` is a held focus / scope / steady modifier with a real trade-off (precision or information versus speed or exposure).
 - Two abilities (a1, a2) on cooldowns or charges that create decisions. At least one re-imagines a tool from the home dimension's loadout (decoy, smoke, recon ping, spotting drone, suppressor, jammer) for this world.
 - A bot that is fun to duel at ctx.botSkill 0.25 / 0.55 / 0.9: reaction delay, aim error and hesitation scale with skill; it moves, uses cover, uses its abilities, and can both win and lose. ctx.autopilot drives the local player with the same brain.
 - Online play exactly as contract section 2 describes: each client simulates only its own sniper and judges only its own shots; the other sniper is a puppet fed by ctx.net.remote; one-off events (shots, abilities) go through ctx.net.send so the peer can draw them; world motion is a pure function of ctx.time. Design every mechanic so this holds (for example: a decoy is spawned on both clients from one event; a destructible is broken by an event).
 - Phase 'intro': frozen at the spawns but alive (idle animation, a camera flourish that shows the map and where the enemy is). Phase 'over': a kill moment worth watching in slow motion — the core keeps calling update at 0.35x speed for about 2.4 s: the decisive shot, the victim's bloodless demise, a camera move. Sudden death (ctx.sudden): both snipers exposed, the arena escalating, an ending forced well inside 40 s.
Look and sound
 - A strong, specific art direction executed with polish: a tight palette built around module.palette, consistent shapes and line weights, lighting or glow, layered backgrounds with depth, ambient motion, and juice (screen shake, recoil, muzzle flash, tracers, impact marks, particles, squash and stretch, hit-stop feel). It must look like a finished indie game someone would screenshot, not a prototype.
 - Both snipers read at a glance in their identity colours (ctx.players[i].color) and the local player is unmistakable. Bullets and anything lethal are always visible.
 - In-world UI in this world's own style for reload / ammo, aim, and ability feedback. The core already draws the score, clock, ability chips (bottom-right on desktop), kill banner and title card (see hud.js): keep the top-centre strip clear and do not duplicate them. Report cooldowns with ctx.hud.cooldown / charges.
 - Sound through ctx.audio: every action has a sound, the rifle feels powerful, and a looping music bed in this world's style (ctx.audio.music, 2-4 tracks) starts when the round goes live.
 - Correct at 667x375 (phone, touch), 1180x820 (iPad, touch), 1280x720 and 1728x1117. On touch the core draws a move stick bottom-left and buttons bottom-right: nothing vital may sit under them.
Engineering
 - Contract rules 1-7. In particular: no listeners, timers or rAF of your own; never cache width/height; no per-frame allocation in hot loops; bounded particle counts; everything you create freed in dispose(); never throw.

HOW TO WORK
 1. Start index.js with a short design header comment: the fantasy, the rules, controls, the two abilities, the bot's plan, the kill moment, how sudden death ends it.
 2. Build it, running it constantly:${dimTests(it.id, SCRATCH + '/' + it.id)}
    Each prints a JSON report that must come back "ok": true with no warnings you cannot justify. Read the screenshots after every significant change and judge them as an art director: composition, contrast, clutter, legibility on a tablet at arm's length, whether the two snipers pop.
 3. The tool plays fast (bot versus bot, 3x). For what it does not show — an ability in use, the kill moment mid-animation, human-speed pacing, real keyboard / mouse / touch input — write short Playwright scripts of your own against the same URL parameters (contract section 8; window.__mv.state reports the phase; ?speed=1 is what people see). Verify with real input events that movement, aim, fire, alt, a1 and a2 each do what the HUD says.
 4. After it first works end to end, do at least THREE look-and-feel passes: screenshot, name the weakest thing on screen, fix it, repeat. Spend real effort here — the difference between "works" and "wow" is the assignment.
 5. Finish with all four commands passing. Stop every server / browser you started.

RETURN (plain text): a five-line design summary; the files you wrote with line counts; the final result of each of the four test commands (ok, rounds with winner / how / seconds, warnings); what is strongest; what you would improve with more time; known issues.`

const HARDEN_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['ship', 'ship-with-notes', 'not-ready'] },
    scores: {
      type: 'object',
      description: 'your honest 1-10 scores AFTER your fixes',
      properties: { wow: { type: 'number' }, readability: { type: 'number' }, cohesion: { type: 'number' }, juice: { type: 'number' }, centrepiece: { type: 'number' }, robustness: { type: 'number' } },
      required: ['wow', 'readability', 'cohesion', 'juice', 'centrepiece', 'robustness'],
    },
    found: { type: 'array', items: { type: 'string' }, description: 'each real problem you found (one line each, with how you reproduced it)' },
    fixed: { type: 'array', items: { type: 'string' }, description: 'what you changed' },
    remaining: { type: 'array', items: { type: 'string' }, description: 'known problems you did not fix, and why' },
    tests: { type: 'string', description: 'final result of every test command you ran (ok / failures / warnings)' },
    summary: { type: 'string', description: 'what this module is and how it plays or looks, in 3-4 sentences' },
  },
  required: ['verdict', 'scores', 'found', 'fixed', 'remaining', 'tests', 'summary'],
}

const dimHarden = (it, report) => `
You are the SECOND engineer on a Multiverse dimension. The first engineer has handed it over (their report is at the bottom — treat it as claims to verify, not facts). You own the files now. Your job: try to BREAK it, judge it honestly as a player and as an art director, then FIX what you find. You are the last pair of eyes before players see it.
${SHARED}
THE DIMENSION: id "${it.id}" — "${it.name}"
Original brief: ${it.brief}

READ FIRST: src/multiverse/contract.js (binding), then every file under src/multiverse/dimensions/${it.id}/, then src/multiverse/kit.js as needed.
FILES YOU OWN: everything under src/multiverse/dimensions/${it.id}/
YOUR SCRATCH DIRECTORY: ${SCRATCH}/${it.id}-harden/

A. BREAK IT (automated). Run and read the JSON of:${dimTests(it.id, SCRATCH + '/' + it.id + '-harden')}
      node tools/mv-test.mjs dim ${it.id} --rounds 8 --speed 6 --seed 2
      node tools/mv-test.mjs dim ${it.id} --rounds 6 --speed 4 --seed 3
      node tools/mv-test.mjs dim ${it.id} --online --rounds 6 --seed 4
   Any "ok": false, any warning, a stalemate, rounds that only end in sudden death, rounds over in two seconds, a one-sided online result, or GPU resources that grow between rounds is a bug.
B. PLAY IT (your own Playwright scripts, ?dim=${it.id}&speed=1):
   - Watch bot-versus-bot at human speed (&auto=1), a screenshot every ~1.5 s through intro, live play and the kill moment. Is it a sniper duel? Is the pacing right? Can you always tell where both snipers are, which one is yours, what killed whom?
   - Room to play and skill: is there real open distance between the spawns? Can a player both hold the range for a long shot AND work in closer — and does each have a cost? Does a long shot take skill (lead, drop, sway, timing), or is it point-and-click? Is the world alive — do things happen around the duel, and do a few of them matter?
   - Would a first-time player, dropped in with no warning, be shooting back within five seconds? Read the title card's control legend and hint (module.controls incl. move / aim labels, module.hint) as that player would; fix labels, the hint and the in-world feedback until the answer is yes on both keyboard + mouse and touch.
   - Drive REAL input without autopilot: keys, mouse buttons and movement, and (in a hasTouch context, 1180x820) touch through CDP Input.dispatchTouchEvent. Confirm each control does what its label says, that aiming goes where the player points on every device, that cooldown chips track, that nothing happens during 'intro', that the player can actually hit and be hit. (Pointer lock does not engage in headless Chromium: for 'look' dimensions check how src/multiverse/input.js exposes look deltas for tests.)
   - Bot quality at ?skill=0.25, 0.55 and 0.9: is it beatable and not a pushover? Does it move, take cover, use abilities? Average round length?
   - Abuse: resize the window mid-round (page.setViewportSize) between landscape phone and desktop sizes; spam every button; hold fire through the intro; stand still for a whole round (does sudden death really end it?).
C. READ THE CODE against the contract. Typical faults: Math.random or ctx.rng used the wrong way round (world generation must use only ctx.rng, and only inside create); window/document listeners, timers, rAF; cached width/height; the remote player's shots judged locally, or ctx.kill called for the wrong side online; world state that differs between clients (anything not derived from the seed, ctx.time or an event); bots that cheat or cannot lose; per-frame allocation in hot loops; unbounded arrays; things not freed in dispose (geometries, materials, textures, render targets, audio nodes, music); exceptions on edge cases (zero-size canvas, ctx.net.remote null, result.victim === -1 on a draw); shared renderer state left dirty in a way the next dimension cannot tolerate.
D. JUDGE THE PICTURE (fidelity tier: ${it.tier === 'showcase' ? 'SHOWCASE — it should push an M1: shadows, shaders, post-processing, dense detail; a screenshot should look like a trailer' : 'GRAPHIC — simple by design, so line, shape, colour, type and motion must be impeccable; rich and deliberate, never plain or cheap'}). Is everything an original design (no existing characters, logos, names, real-world insignia)? Look at screenshots at all four sizes. Score 1-10: first-impression wow, readability of both snipers, cohesion of the art direction, juice, kill moment (the "centrepiece" score). Compare against "a finished indie game someone would screenshot". Anything below 8 is yours to raise: rework the weak parts (palette, lighting, layering, animation, typography, effects, sound, music) rather than describing them.
E. FIX everything real that you found, re-run every command in A until all pass, and stop every server / browser you started.

Do not rewrite what already works well, do not change the dimension's id, perspective or core fantasy, and do not weaken a check to make it pass.

RETURN: the structured report. Scores are your honest scores AFTER your fixes.

===== FIRST ENGINEER'S REPORT =====
${report}`

// ---------------------------------------------------------------------------
// TRANSITIONS
// ---------------------------------------------------------------------------
const fxTests = (id, dir) => pairs.map((p, i) => `
      node tools/mv-test.mjs fx ${id} --from ${p[0]} --to ${p[1]} --frames 16 --seed ${7 + i * 4} --shots ${dir}/run${i + 1}`).join('') + `
      node tools/mv-test.mjs fx ${id} --from ${pairs[0][0]} --to ${pairs[0][1]} --frames 8 --seed 23 --size 1180x820 --shots ${dir}/ipad
      node tools/mv-test.mjs fx ${id} --from ${pairs[0][0]} --to ${pairs[0][1]} --frames 8 --seed 31 --size 667x375 --shots ${dir}/phone`

const fxBuild = (it) => `
You are a senior motion designer and graphics programmer. Build ONE transition of the Multiverse — a 8-11 second cinematic that plays every time a sniper scores, carrying both players from the world that just ended into the next one. Transitions are the signature of this game: they must be outrageous, beautiful, and different every time they play, and still make sense as the bridge between THIS kill and THAT world.
${SHARED}
YOUR TRANSITION: id "${it.id}" — working title "${it.name}"
${it.brief}
The brief fixes the concept. Staging, shots, timing, palette, text and every detail of execution are yours to make excellent — improve on the brief wherever you see a better film in it.

READ FIRST, IN THIS ORDER
 1. src/multiverse/contract.js — sections 6 and 7 are your binding interface and rules (timeline, the swap, determinism, sound).
 2. src/multiverse/transitions/example.js — a complete minimal transition showing both layers (a WebGL shader pass over the old frame, then 2D drawing with a transparent hole onto the live new world). Follow its STRUCTURE; it is deliberately plain and far below your bar.
 3. src/multiverse/kit.js — seg / pulse / ease for timelines, seeded random helpers, colour, drawCover, fitText, canvasTexture, fullscreenPass, COVER_UV_GLSL, GLSL_NOISE, disposeTree.
 4. Skim src/multiverse/director.js (_beginFx, _swap, _fxFrame) to see exactly how you are driven.

FILES YOU OWN: src/multiverse/transitions/${it.id}.js (default export, module.id === "${it.id}"); if it grows past ~700 lines you may add helper modules under src/multiverse/transitions/${it.id}/.
YOUR SCRATCH DIRECTORY: ${SCRATCH}/fx-${it.id}/

WHAT "DONE" MEANS
The contract
 - First frame = ctx.fromImage full-screen, unaltered. Fully opaque from 0.15 s before the swap until ctx.toImage exists. Last frame = ctx.toImage full-screen or a fully transparent overlay. The test tool measures all three.
 - Deterministic: the picture is a function of (ctx, t) only. All randomness from ctx.rng, drawn once in create(); no Math.random, no clocks. Rendering time t twice gives identical pixels.
 - Robust: any aspect ratio from 667x375 to 1728x1117 and 4:3 iPad; ctx.winner / ctx.loser may be null (a drawn round), ctx.how may be '', names can be 16 characters; long dimension names must fit (fitText).
 - dispose() frees every texture, geometry, material, render target and stops any sound you left running.
The film
 - A clear three-beat structure: the old world is destroyed or left in an outrageous way; a centrepiece spectacle; the new world is born. The swap sits on a flash, blackout or hold.
 - It uses its context so it could only be about THIS moment: the impact point (ctx.focus), who shot whom and how (winner / loser names and colours, ctx.how), the score and whether it is match point, the names, perspectives and palettes of both worlds (the old world's image is yours to tear, burn, fold, project, shrink onto a prop; the new world's palette should bleed in before the arrival, and its name should land as a title).
 - Different every time: at least FOUR independent axes of variation drawn from ctx.rng (cast, order, layout, camera path, colours, text lines, props...), so two plays with different seeds are visibly different films of the same idea. List the axes in the header comment.
 - Craft: real composition and typography, depth and lighting, motion with easing and overlap (nothing moves linearly, nothing pops), texture (grain, glow, halation, scanlines, paper — whatever suits), and a sound design that sells every beat (ctx.audio.sfx / tone / noise, fired once per cue from update as t passes; a riser into the swap and a hit on it are almost always right).
 - Performance: 60 fps on an M1 at dpr 2. Fragment shaders stay modest (no heavy raymarching at full resolution; render expensive passes at reduced resolution if needed); 2D drawing avoids per-frame getImageData and huge blurred shadows.

HOW TO WORK
 1. Start the file with a header comment: the concept, the beat sheet with timings, the axes of variation, how the context is used.
 2. Build it, rendering frames constantly (test worlds: ${pairText}):${fxTests(it.id, SCRATCH + '/fx-' + it.id)}
    Each prints a JSON report that must come back "ok": true, and writes evenly spaced frames plus the frames around the swap. READ THE FRAMES after every significant change, in order, as a storyboard: does each beat read? Is every frame a good picture on its own? Is the text legible? Do two seeds differ?
 3. For timing and motion between the sampled frames, render denser sequences yourself: open ?fxlab=${it.id}&from=A&to=B&seed=N and call await window.__mv.lab.renderAt(t) for any t, then screenshot (see tools/mv-test.mjs runFx).
 4. After it first works end to end, do at least THREE craft passes: lay the frames out, name the weakest beat, fix it, repeat.
 5. Finish with every command above passing. Stop every server / browser you started.

RETURN (plain text): the concept in three lines; the beat sheet with timings; the axes of variation; how the context is used; the final result of each test command; what is strongest; what you would improve with more time; known issues.`

const fxHarden = (it, report) => `
You are the SECOND engineer and the art director's eye on a Multiverse transition. The first engineer has handed it over (their report is at the bottom — claims to verify, not facts). You own the file now. Your job: try to BREAK it, judge it honestly frame by frame, then FIX and elevate it. You are the last pair of eyes before players see it.
${SHARED}
THE TRANSITION: id "${it.id}" — "${it.name}"
Original brief: ${it.brief}

READ FIRST: src/multiverse/contract.js sections 6-8 (binding), src/multiverse/transitions/${it.id}.js (and its helper folder if any), then src/multiverse/kit.js and the director's _beginFx / _swap / _fxFrame as needed.
FILES YOU OWN: src/multiverse/transitions/${it.id}.js and src/multiverse/transitions/${it.id}/
YOUR SCRATCH DIRECTORY: ${SCRATCH}/fx-${it.id}-harden/

A. BREAK IT. Run and read the JSON of (test worlds: ${pairText}):${fxTests(it.id, SCRATCH + '/fx-' + it.id + '-harden')}
   Then with your own Playwright script against ?fxlab=${it.id}&from=..&to=..&seed=.. and window.__mv.lab.renderAt(t, true):
   - Determinism: render the same t twice (and after rendering other times in between) and compare screenshots byte for byte.
   - Variation: the same t across five seeds — are they visibly different films?
   - The swap: probe coverage every 0.05 s from 0.3 s before to 0.3 s after the swap. First and last 0.3 s: is the hand-over from / to gameplay invisible?
   - Context extremes: it must not break or look wrong with a draw (no winner), an empty kill label, 16-character names, a long dimension name, match point. (The lab alternates winner and label between legs; to force other cases, patch values from your script via window.__mv before calling renderAt, or read the code paths.)
   - Sizes 667x375, 1180x820, 1728x1117: text fits, composition holds, nothing important is cropped.
   - Live playback (no renderAt): let the lab loop run for three legs; no console errors; watch frame pacing; check the fx renderer's renderer.info.memory (window.__mv.stage.fxRenderer) returns to baseline after dispose.
B. READ THE CODE against the contract: Math.random / Date / performance.now; state mutated in render(); sounds triggered from render() or re-triggered every frame; cues that fire again when t is revisited; anything not freed in dispose (textures made from fromImage / toImage, render targets, canvases are fine but GPU objects are not), music or loops left playing; reading ctx.toImage before it exists; the GL layer left opaque when the 2D layer is meant to show through (renderer.clear()); colour-space double conversion making the first frame darker than gameplay; assumptions about aspect ratio; exceptions when winner / loser are null.
C. JUDGE THE FILM. Lay the frames out as a storyboard at two seeds. Score 1-10: first-impression wow, readability of each beat and of the text, cohesion of style, juice and craft of motion (easing, overlap, texture, sound), centrepiece (is the middle spectacle actually spectacular?). Compare against "a title sequence a studio would be proud of". Anything below 8 is yours to raise — restage, re-time, add depth, light, texture, typography, sound — rather than describe. Does it use the context enough that it could only be about this kill and that world?
D. FIX everything real, raise what is weak, re-run every command in A until all pass, and stop every server / browser you started.

Do not rewrite what already works well, do not change the id or the core concept, and do not weaken a check to make it pass.

RETURN: the structured report. Scores are your honest scores AFTER your fixes ("centrepiece" = the middle spectacle).

===== FIRST ENGINEER'S REPORT =====
${report}`

const build = (it) => (it.kind === 'fx' ? fxBuild(it) : dimBuild(it))
const harden = (it, report) => (it.kind === 'fx' ? fxHarden(it, report) : dimHarden(it, report))


const fs = require('fs');
fs.mkdirSync(SCRATCH, { recursive: true });
process.chdir(SCRATCH);
fs.mkdirSync('prompts', { recursive: true });
for (const it of items) {
  fs.writeFileSync('prompts/build-' + it.id + '.md', build(it));
  fs.writeFileSync('prompts/harden-' + it.id + '.md', harden(it, '(see the report file named in your instructions)'));
}
console.log(items.length, 'prompt pairs');
