FIRST ENGINEER'S REPORT — dimension "paper" (FLAT OUT, first person drawn as flat 2D illustration). Claims to verify, not facts. Solo and online 3-round runs have NOT passed on the final code (timeouts and renderer crashes on an overloaded machine); phone and iPad 1-round runs passed.

DESIGN
1. First-person duel in a drawn container yard: two concourse buildings 74 m apart, flat colour fills, thick even ink on every edge (screen-space fat lines), a flat outlined rifle, a paper-tag HUD. The sniper cut-outs always square up to the other sniper.
2. The hook is paper. EDGE-ON (a1) turns you into a ruled line almost no round can hit, but you cannot shoot while thin. Cardboard, posters and mascot cut-outs block sight but not bullets. Every round punches a hole that stays for the round and that both snipers can look and shoot through. Steel stops everything; every shot leaves a dashed trajectory line for 5 s.
3. 175 m/s rounds with drop (zeroed at 55 m) and wind read from windsocks and a compass-strip tag. SCOPE (alt) zooms, slows turning, adds breathing sway and a lead ruler, and glints. A gantry crane carries a steel box across the yard on a 40 s timetable; forklifts shuttle in the side lanes; gulls, loose pages and a paper plane fill the sky.
4. STANDEE (a2) props up a cardboard decoy (2 charges, 16 s). Tags teach step out, shoot, scope, edge-on and standee in turn. Bot feels out for ten seconds, then holds a lane or flanks. Online: each shot is planned once and sent as one event; holes, standees and edge-on are events; crane, forklifts, wind and the closing curtains are pure functions of ctx.time.
5. Kill: the victim crumples into a ball, bounces and unfolds flat in a flutter of scraps; the victim's own view has the page crumpling around them. Sudden death: beacons on both snipers, edge-on and standees off, two paper curtains close in.

FILES (src/multiverse/dimensions/paper/, 3154 lines): index.js 617, overlay.js 442, world.js 415, set.js 334, art.js 244, figures.js 200, fx.js 193, lines.js 156, bot.js 150, layout.js 133, ballistics.js 121, sound.js 104, style.js 45.

TESTS
- phone 667x375 touch, 1 round: ok (passed three times). iPad 1180x820 touch, 1 round: ok.
- solo --rounds 3: NOT ok on final code (30 s screenshot timeouts / renderer crash at load 10-26; a control run of example-3d crashed at the same load). Earlier runs: no errors, 2 of 3 rounds inside 150 s.
- online --rounds 3: NOT ok (timeouts). Best run: 2 of 3 rounds, no console errors, host and guest agreed, no GPU resource growth.
- Bot-vs-bot: skill 0.55 → 11–22 s; 0.9 → 10.6–21.6 s; 0.25 → 36–52 s (one reached sudden death). NOT re-measured after the last tuning (shorter feeling-out and hide time, roundTime 42 → 32 s, overTime 2.6 → 2.4 s, faster curtains closing to 3.5 m).

WEAK POINTS / KNOWN ISSUES
- roundTime 32 s is well below the default 60: check rounds are not being rushed into sudden death just to fit the test's wall clock.
- Layout unchecked at 1728x1117 and 874x402.
- No real touch, gamepad or audio verification; keyboard and mouse verified through state checks only.
- Recruit bot can run a round into sudden death.
- Standees are not reported to the bot as targets unless it sees them, and they take no holes.
- Wanted but not done: a hit-stop on the kill, more set pieces that matter to the fight, a richer music bed, cheaper software-rasteriser cost, real-device profiling.
