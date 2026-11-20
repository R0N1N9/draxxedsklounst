FIRST ENGINEER'S REPORT — dimension "surf" (BREAK POINT). Claims to verify, not facts. The first engineer was stopped early: only a 1-round solo run has passed. The 3-round solo run never passed; online, iPad and phone were never run.

DESIGN
1. Third-person 3D, golden hour. Two snipers on surfboards 116 m apart on a Gerstner swell; one has the beach, pier and lighthouse behind them, the other the sun and a cruise ship.
2. The sea is the cover: crests between the riders block the shot. A sight-line gauge in the HUD draws the water between you with your line of fire ("CLEAR SHOT" / "CREST IN THE WAY").
3. Controls: CARVE (camera-relative stick, the board carves round to it), AIM, FIRE, alt BRACE (one knee, steady, 2.8x lens, no steering), a1 DIVE (1 s untargetable, 15 m on), a2 SPRAY (7.5 s curtain that blocks sight, not rounds).
4. Rounds fly at 280 m/s and skip off flat water. World from ctx.time: dolphins, fin, beach ball and buoys stop rounds; the fin bumps boards (never kills); gulls go to the last shooter; a set wave 3x the swell every 30 s after the ship's horn.
5. Sudden death at 55 s: swell dies to 16 %, both riders get a beam, the buoy ring closes to 30 %.

FILES (src/multiverse/dimensions/surf/, 3220 lines): index.js 366, game.js 452, view.js 298, fx.js 303, shore.js 272, surfer.js 199, post.js 199, ocean.js 195, life.js 193, sea.js 175, overlay.js 146, bot.js 124, sound.js 103, sky.js 99, world.js 96.

TESTS
- solo --rounds 3: NOT passed ("page.screenshot: Timeout 30000ms exceeded" every time, no module exceptions; machine at load 11-21).
- solo --rounds 1: ok, winner 0, "18 M", 45.9 s.
- online, iPad, phone: NOT RUN. Touch input never checked (script written, never run). Keyboard and mouse checked with real events.
- Headless rules sim (scratch sim.mjs, 120 bot-vs-bot rounds per skill): min 11.0 s, medians 20 / 26 / 26 s for skill 0.9 / 0.55 / 0.25, 1-16 of 120 rounds over 45 s.

THE OWNER'S THREE REQUIREMENTS (all must be verified; they are the reason this world exists in its current form)
1. Waves affect movement — implemented, sim-tested, never felt by a human. sea.flow(x,z) in sea.js returns surface current, fold and crest velocity (pure function of position and ctx.time). step() in game.js applies it: current x1.5 carries the board; whitewater (smoothstep(0.8, 0.46, fold)) shoves at 0.5x crest velocity, drags speed, wobbles heading and aim; slope gives 15 m/s² along heading. HUD shows km/h with ▲/▼ and "WHITE WATER". Bot is only carried by it. NOT DONE: `white` is not in the net state, so a remote puppet does not wobble.
2. Strictly third person — implemented; rig() in view.js: braced camera 13 m back, 1.75 m up, AIM_LIFT 0.066 rad. step() clamps braced pitch to [-0.3, 0.12] so the rider stays in frame: added after the only braced screenshot, UNVERIFIED. During DIVE the rider is under opaque water for 1 s.
3. Hand-off kill (fall in, winner dives after, lens crosses the waterline) — implemented, captured frame by frame once; later timing tweaks unverified. Code: fell(), stepDead(), stepKill() and the KILL table in game.js; header pose in update() of surfer.js (p.hop); camera in killShot() of view.js; waterline in the GRADE shader of post.js (uWater); hooks wipeout, splashDown, spring, header in index.js. A draw skips all of it. Changed after the last capture and not re-shot: crash-zoom window, faster fall, rainbow fade, near-water reflection blur, foam core. NOT CHECKED: the victim's own client (blend from their lens flies across the bay in 0.85 s), online, the real plunge transition.

HAND-OFF NOTE (for the plunge transition and the underwater world)
- overTime 4.5 s (KILL.end). The choreography runs on its own real-time clock game.kill.t (dt / 0.35); the sea keeps the core's 0.35x.
- Timeline from the hit: 0 board fires up, loser comes off arms out; ~1.2 loser hits the water, spray tower and rainbow on a crash zoom over the winner's shoulder; 1.75-2.25 winner crouches; 2.25 winner jumps, 0.84 s header in profile; ~3.1 winner enters the water; 3.75-4.2 waterline climbs the frame, then holds.
- Last frame: wavy white waterline seam about 22 % from the top (uWater.x ≈ 0.78-0.79 from the bottom); above it a sliver of dusk sea and sky with a pale wash; just below bright aqua about rgb(115,237,224), fading through turquoise (0,84,133) to deep blue (3,26,69) at the bottom; white ring bubbles in three sizes, densest in the centre column and near the line; froth under the seam. Letterbox and HUD gone by then.
- focus() returns the projected entry point (kill.ex/ey/ez). On the snapshot render (render with no update before it) view.js calls settle() to run the choreography to the end, then draws a full frame.

SELF-ASSESSED WEAK POINTS
- The down-sun view reads too purple; hills are plain; the spray wall is sparse puffs.
- Software-GL path: start scale 0.52, half the mist, no shadow map, draws rationed by a stall "debt"; screenshots often show a stale 3D frame under a live HUD.
- The rich build (MSAA, static shore shadow map, light shafts, lens colour) has NEVER been executed; globalThis.__surfRich forces it.
- Bot: kills cluster at 45-80 m; late rounds end close in.

KNOWN ISSUES
- The SECOND mount of the world was about 10x slower than the first in software GL (40-55 s of stalls); cause not found, resource counts normal (27 geometries, 10 textures, 18 programs). Probably why 3-round runs time out. Find it.
- Reversed-edge smoothstep in shaders (undefined GLSL, unverified on Safari/Metal): replace with a safe form.
- Shore and life InstancedMesh objects are freed through disposeTree only; no leak check has run.
- NEVER run pkill on chrome: other engineers share the machine.
Scratch scripts: /tmp/claude-0/-home-user-draxxedsklounst/3b2c914c-25e2-5b47-9063-4bb17e5ad913/scratchpad/surf/ (peek.mjs + plan-kill.mjs steps the hand-off; plan-input.mjs, plan-touch.mjs, plan-look.mjs, sim.mjs).
