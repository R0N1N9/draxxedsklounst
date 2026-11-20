FIRST ENGINEER'S REPORT — dimension "toybox" (TOY BOX). Claims to verify, not facts. The first engineer was stopped early; items under HALF-DONE and NOT STARTED are yours.

DESIGN
1. Isometric 3D diorama, orthographic camera: a child's bedroom floor at dusk, two plastic riflemen (amber, teal) across a braided oval rug among alphabet blocks, picture books, domino rows, a wooden train on a loop, a desk lamp throwing a warm pool into blue dusk. Post: tilt-shift, bloom, grade, grain.
2. One pellet, one hit. Pellets have travel time (62 u/s), bounce once off wood (blocks, train), die in books, topple dominoes in a chain. The laser shows the real barrel direction and sways: most when moving, less standing, least braced, about a quarter as much at a rival who is lit. The lamp pool is the killing ground, the dark flanks the way round.
3. Controls: move, aim (mouse projected onto the floor / stick through the camera), SHOOT, alt BRACE (kneel, steady, bounce preview, cannot move; latching on touch), a1 ROLL (i-frames), a2 COPTER (wind-up helicopter spotlights the rival 5.5 s). Label-maker tapes on the rug teach the device in hand until first shot and first brace.
4. Living world from ctx.time: train (moving cover, shoves), lamp sway, headlights through the blind, dust. Bot hides, peeks, kneels, waits, closes in; before ~10 s it only fires ranging shots.
5. Kill: the figure bursts into moulded parts in slow motion, lens pushes in and swings. Sudden death (50 s) "tidy-up time": big light on, toys pop away, the rug rolls up from both ends.

FILES (src/multiverse/dimensions/toybox/, 2674 lines): index.js 478, build.js 391, actors.js 325, world.js 251, tex.js 204, toys.js 201, bot.js 192, view.js 158, post.js 138, overlay.js 132, sound.js 108, geo.js 96.

TESTS: solo 3 rounds on FINAL code ok (16.6 / 11.1 / 15.2 s, no leak). Online, iPad and phone passed on EARLIER code and were NOT re-run after: bot opening gate and pacing, pellet size, bigger rifle and helmet, headlight width, tilt-shift ramp, prompt hiding while the aim stick is held. Online 3 rounds took 149.8 s wall against the tool's 150 s limit. Bot-vs-bot: skill 0.55 → 14.6–25.6 s; 0.25 → 13.6–38 s.

HALF-DONE
- Skill 0.9 never run through stats (scratch: toybox/stats.mjs 0.9).
- Rounds short and uniform (11–26 s): pickPost `want` ramp, patience/wait values in bot.js think — keep the online test under 150 s.
- Phone 874x402 never screenshotted; check fit() in view.js.
- Tilt-shift ramp change (pow(f,1.6) in post.js FINAL; 0.82 band in view.js update) not seen in the full-quality build.
- Latest soldier proportions seen in one full-quality frame only.
- Title card never seen in intro captures.
- Sound never heard.

NOT STARTED: rolling marble as a second moving nuisance; bot bank shots (no RICOCHET kill ever seen); glow sprite at the lamp bulb and spiral end-caps on rug rolls; gamepad; final full-quality art pass at 1728x1117 and iPad.

KNOWN ISSUES
- Full-quality frame rate on a real M1 / iPad unmeasured (software GL: 1.5–2 s per full-quality frame).
- Test screenshots show the auto-selected Lambert build; the full build needs globalThis.__toyboxQ = { rich: true, pbr: true, scale: 1, shadow: 2048 } before load (read in index.js create).
- Test-only hooks left in: inst.debug, view.bench, view.force, view.log, Q.nopost branch in view.js.
- On phones the lower rug corners sit under the touch clusters (a soldier can walk under a thumb).
- A copter over a soldier behind a block can cover the silhouette.
- Sudden death a little pale in the Lambert build.
Scratch scripts: /tmp/claude-0/-home-user-draxxedsklounst/3b2c914c-25e2-5b47-9063-4bb17e5ad913/scratchpad/toybox/
