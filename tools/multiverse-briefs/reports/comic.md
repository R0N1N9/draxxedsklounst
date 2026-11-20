FIRST ENGINEER'S REPORT — dimension "comic" (INK CITY). Claims to verify, not facts. The first engineer was stopped early: the world loads and plays bot-vs-bot rounds without exceptions, but NONE of the four test commands has returned ok. Online, iPad and phone were never run; real input was never sent.

DESIGN
1. Third-person over-the-shoulder duel between two pulp vigilantes on mirrored, seeded rooftop terraces across a street canyon: about 100 m perch to perch, 25 m ledge to ledge.
2. The picture is printed: materials output flat colour plus sunlight; one post pass adds ink outlines, Ben-Day dots, a painted sunset sky, paper grain, the tilted scope panel and the kill burst. Sound effects are lettered into the world on the 2D layer.
3. Four-round bolt rifle, 165 m/s bullets that drop (lead and hold-over). SCOPE is exact but breathes, slows you and glints. Hip fire honest to about 25 m. Only a sniper's bullet scores.
4. LEAP (rocket boots) flies you to the roof under the crosshair (dashed arc and ring). SMOKE is a POOF! cloud at your feet that blocks eyes and bots. An airship crosses the sightline on ctx.time and stops bullets.
5. Bot fires ranging shots that cannot kill for its first 10.2–13.4 s, then duels from cover and leaps a terrace closer. Kill is a freeze-frame splash page. Sudden death erases all props to blue pencil, then forces a face-to-face final panel 14 s later.

FILES (src/multiverse/dimensions/comic/, 2895 lines): index.js 564, view.js 351, post.js 292, world.js 283, fx.js 253, overlay.js 252, build.js 214, mats.js 194, bot.js 174, hero.js 124, art.js 109, sound.js 85.

TESTS
- solo --rounds 3: not ok; 2 of 3 rounds finished in 150 s (17.5 s, 21.7 s), no exceptions. Final 1-round check: round played (17.3 s) but the wall clock ran out during the kill moment.
- online, iPad, phone: NEVER RUN.
- No-draw bot harness: skill 0.25 mean 22.4 s (12–36.7), 0.55 mean 19.6 s (12.4–35.5), 0.9 mean 20.8 s (13.1–50.1); wins 21:16 over 37 rounds.

HALF-DONE (written, never seen or verified)
- Real input: no real keyboard, mouse or touch events ever sent (only ctx.input fields written by script).
- Online: puppet(), onNet and the 's' / 'l' / 'm' / 'k' messages in index.js have never run between two clients.
- Sudden death: the eraser (city.setErase, uErase in mats.js) and the showdown block in frame() in index.js never seen; risk that prop stripes get inked into a mess by the edge pass.
- Intro camera (view.update intro branch): stills rendered, never looked at.
- Unseen last edits: scarf wind and darker boots (hero.js), hoarding battens (build.js), higher-detail puff spheres and real-time flash ageing (fx.js), decor added after the last city still (fire escapes, aerials, vent caps, street lamps in build.js).
- Sound and music never heard.

NOT STARTED: the look-and-feel passes the brief asks for (only the first partly done); FXAA softness check (software path renders at 0.8 scale, Q.scale in create()); hold the kill burst longer (uSplash fade in view.update); use or delete unused HUP / CHAK / FLAP sprites in overlay.js WORDS; remove the unused `add` blending option in mats.make; pass colour arrays instead of hex strings to fx.puff on hot paths (startLeap, leap trail, touchDown); tests at skill 0.25 and 0.9 and at 1728x1117.

KNOWN ISSUES
- With no GPU the 3D picture updates as a slideshow by design (a GL fence gives backpressure, scene drawn about one seventh of the time); the duel runs true.
- The leap marker is on the 2D layer, so it shows through parapets when the target roof is hidden.
- A bot's ranging shot is flagged so it can never kill; in a rare fluke it could visibly pass through a sniper.
- The GPU leak check never armed (every mount reported 0 geometries / 0 textures; no run reached three mounts): dispose() is unverified.
- index.js exposes inst.view, P, Q, G, W, post and scene for test scripts.
Scratch: /tmp/claude-0/-home-user-draxxedsklounst/3b2c914c-25e2-5b47-9063-4bb17e5ad913/scratchpad/comic/tools/ (stills.mjs, stats.mjs, jsprof.mjs, perf2.mjs); stills in comic/look/ and comic/look-phone/.
