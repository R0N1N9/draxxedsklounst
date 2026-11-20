FIRST ENGINEER'S REPORT — dimension "toon" (RUBBER HOSE RIDGE). Claims to verify, not facts.

DESIGN
1. Side-on 1930s rubber-hose cartoon duel. Egg-headed noodle-limbed snipers with big gloves and a telescoping cork pop-gun across a canyon. Black, white and warm grey on halftone paper, each sniper's identity colour the only tint. Ink lines boil 12 times a second; grain, gate weave, scratches, dust, lamp flicker and a vignette on top. Cacti, sun, clouds, mesas, crates, handcar and snipers dance to a ragtime piano loop (120 bpm, 148 in sudden death).
2. The cork is a visible projectile that drops and bounces once off rock. TAKE AIM (alt) telescopes the barrel: the longer held (up to 1.1 s) the flatter and faster the cork and the more of its path the dotted arc shows. You are rooted, the barrel glints for the other player, the shot kicks you backwards. Corks pop decoys, knock crates off the tower, are soaked up by tumbleweeds.
3. Routes: hold your mesa (cover rock to crouch behind, a perch up a ladder, the lip), spring across to the seesaw island (crate tower splits it), or climb down the cliff ladder, cross the floor and climb the pillar. Abilities: a1 HOLE (portable hole, then its twin; walking into one comes out of the other, being inside dodges corks), a2 DECOY (waving wooden cut-out).
4. Slapstick from a timetable built once from the seed, pure function of ctx.time: anvils drop onto a growing shadow then sit as cover; a train bursts out of one painted tunnel into the other; tumbleweeds bowl along the mesas; a vulture steals the hat of anyone standing at its swoop. Hazards only stun or shove; a point comes only from a cork. The seesaw tilts under whoever stands on it.
5. Kill: white flash, hit-stop, BONK, victim flattened, scorched and blinking with stars and birds; the hat lands last and an iris closes. Sudden death: house lights drop, spotlights find both snipers, crates burst, cover rocks walk off, corks fly flat and fast, reload halves, anvils rain.

FILES (src/multiverse/dimensions/toon/, 3,508 lines): index.js 631, sim.js 596, props.js 448, figures.js 328, bot.js 314, art.js 304, world.js 284, post.js 201, sound.js 163, fx.js 129, ink.js 109.

TESTS REPORTED: solo 3 rounds ok (17.5 / 29.1 / 13.7 s); online 3 rounds ok (12.9 / 12.0 / 21.2 s), host and guest agree; iPad 1 round ok 28.8 s; phone 667x375 1 round ok 14.4 s. Bot batches of 8 rounds per skill: 0.25 → 15-21 s, 0.55 → 14-40 s, 0.9 → 12-22 s, shortest 11.7 s, none reached sudden death.

SELF-ASSESSED WEAK POINTS
- Audio never heard, only checked that nothing throws.
- Per-frame cost on a real iPad unknown: film overlay and full-screen layer blits are the main cost.
- Terrain baked at 1.3 px per unit, so the kill push-in is soft.
- Bot does not return from the island, rarely uses the portable hole, never plays the handcar.
- Vulture and tumbleweed are hard to read at phone scale.
- Fonts fall back to Impact / sans-serif off Apple devices (Marker Felt only exists there).
- Gamepad untested.
- Rounds are short (12-29 s): judge whether the duel has enough cat-and-mouse.
