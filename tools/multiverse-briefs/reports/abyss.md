FIRST ENGINEER'S REPORT — dimension "abyss" (THE DEEP, first-person underwater spearfishing with a giant kraken). Claims to verify, not facts. All four standard test commands passed on the final code. The owner wants this to be the best-looking world in the game.

DESIGN
1. Two rival spearfishers hunt each other over a reef wall: a kelp shelf, rock arches, a sunken trawler you can swim through (hatch to breach) on a ledge, and a blue-black abyss where a giant kraken patrols on a timetable shared by both clients.
2. One spear wins. Spears are slow (52 m/s), lose speed to drag and sink: long shots need lead and hold-over. One spear at a time, 2.3 s two-band reload. Bubbles breathed out every ~3 s rise above cover and give you away.
3. Controls: SWIM where you look, SHOOT, HOLD BREATH (alt: zoom, steady aim, no bubbles, hold-over marks; costs speed and air, letting go blows a big tell), SONAR (outlines the rival through rock for 2.4 s; they are warned and see where it came from), DECOY (drifting glow-stick that breathes in your colour), KICK UP.
4. Kraken: two tentacles reach up through open water as moving walls. Twice a round it glides over the arena, its shadow cutting the light, its arms shoving divers and knocking their aim. A spear in it jets blinding ink. It never kills. In sudden death all eight arms rise in a ring that closes to 12 m and both divers glow through everything.
5. Bot only knows what a diver could (sight through murk, kelp and ink, bubbles, sonar). Kill: slow motion from below, the victim tumbles up toward the light in a column of bubbles, mask and fins drift off, fish burst away, the kraken's eye turns to watch.

FILES (src/multiverse/dimensions/abyss/, 5071 lines): index.js 707, kraken.js 555, build.js 505, life.js 465, view.js 435, world.js 381, fx.js 360, diver.js 322, post.js 321, shaders.js 291, overlay.js 239, bot.js 214, sound.js 188, textures.js 88.

TESTS (final code): solo 3 rounds ok (18.9 / 17.1 / 13.1 s; kills at 4 M, 2 M, 31 M); online 3 rounds ok, guest agrees (24.7 / 24.5 / 38.8 s; kills at 0 M, 0 M, 13 M; one side won 3/3); iPad ok (16.1 s, 3 M); phone 667x375 ok (12.8 s, 4 M). GPU counts flat between rounds. All six actions checked with real keyboard and mouse.

WEAK POINTS / KNOWN ISSUES
- BOT-VS-BOT ROUNDS OFTEN END AT POINT-BLANK RANGE (0–4 m), and online one side sometimes wins 3/3. This is a sniper duel: kills should mostly happen across open water. Teach the bots mid- and long-range play and check the spawn-to-contact pacing.
- The full-quality picture was only judged from stills on software GL; 60 fps on an M1 / iPad is untested. The quality governor is untuned.
- The software-GL build is much plainer: it drops resolution, light shafts, bloom, marine snow, the turtle, manta, shark and jellyfish bells, shows plain water for the first 2 s and reveals the world one shader at a time. globalThis.__abyssRich forces the full build for stills.
- Kraken arms are tubes rather than rigged limbs and the ring of arms is a bit pale; the wreck and diver models could be richer; the rival diver's readability at 40–60 m needs a look.
- Test hooks left in: inst.view (shot, always, freeze), inst.P, inst.sim, and the __abyssRich global.

ARRIVAL (first frame, for the plunge transition)
- Camera at the local spawn (x=2, z=−31 for player 0; player 1 mirrored at z=+31 facing −z), y=−1.25 (1.25 m under the surface), facing down the reef toward the rival, pitched 0.46 rad (~26°) down, 72° vertical field of view. Over the 3.6 s intro it sinks to −12.5 m and levels out.
- Layout: the left half is the drop-off fading to blue-black (#03121c) with violet and cyan jellyfish glowing; the right half is the sunlit shelf (pale caustic-lit sand, olive-gold kelp, a rock arch). The reef wall's lip runs away down the centre into teal haze (#0f4a55), the wreck dim on the ledge left of centre. Warm-white light shafts slant in from upper left and ahead.
- The top ~8 % of the frame is the rippling underside of the surface, bright where the sky shows through, with white foam boiling overhead where both divers went in. About 220 fresh bubbles (4–16 cm) rise around the camera, mostly at the edges and lower half.
- A film of water on the mask distorts the picture and drains top to bottom with a bright line over ~0.9 s. Arrival sound: a splash and a gurgle of bubbles, then the mask strap and the reload clicks.
