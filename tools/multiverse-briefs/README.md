# Module briefs

How the worlds and transitions under `src/multiverse/` were commissioned, kept so any of
them can be rebuilt or given another polish pass later.

- `briefs.json` — the creative brief for every world (`dims`) and transition (`fx`).
- `wave-template.js` — the builder and second-engineer ("harden") instructions each brief
  is dropped into, including the test commands every module must pass.

- `genprompts.cjs` — writes the two prompts for every brief:
  `node tools/multiverse-briefs/genprompts.cjs <scratch-dir>`.
- `reports/` — the first engineer's report for each world that has been built but has not
  yet had (or finished) its second-engineer pass. The second engineer reads it as claims
  to verify.

## How a module gets into matches

1. A builder agent is given `prompts/build-<id>.md` and returns a report.
2. A second engineer (ideally a different model) is given `prompts/harden-<id>.md` and
   that report, breaks the module, fixes it and scores it.
3. Someone looks at fresh screenshots (`node tools/mv-test.mjs dim <id> --shots <dir>`,
   desktop and phone sizes) and checks a transition into and out of it.
4. Only then is `wip: true` removed from its entry in `src/multiverse/registry.js`, the
   single file rebuilt (`npm run build:single`) and the change merged.

Modules flagged `wip` are never visited by a match and are left out of the single-file
build, so unfinished work can sit in the tree safely.

## Status

Work was paused on 20 November 2026 to fit a usage limit. In matches now: eight worlds
and five transitions.

| Module | Kind | State |
| --- | --- | --- |
| dev-app | transition (the first-kill reveal) | in matches |
| synapse, flashback, shatter, continue | transitions | in matches |
| valley | world (the original game; always opens the match) | in matches |
| neon, ww2, pixel, terminal, manga, toon, toybox | worlds | in matches |
| surf | world | built, stopped early; second-engineer pass in progress when work paused |
| comic | world | built, stopped early, never fully tested; second-engineer pass in progress when work paused |
| abyss | world (underwater; the owner's showpiece) | first build in progress when work paused |
| paper | world (flat-drawn first person) | first build done (report in `reports/`); second-engineer pass not started |
| plunge | linking transition, surf → abyss | brief only; build once both worlds are finished |
| snow, orbit, heli, worm, arcade, noir, tapestry, petri | worlds | brief only |
| radar, telescope, wormhole, bullet-hole, channel-surf and the rest | transitions | brief only |

Check `git log` and the registry for what happened after this table was written: a module
without `wip` is in matches.

## Picking the work back up

In the owner's order of priority:

1. **abyss** — finish the build if needed, second-engineer pass, then a polish pass on
   the strongest model available: the owner wants it to be the best-looking world.
2. **surf** — finish its second-engineer pass. The owner asked for three things by name:
   waves that push the surfers around, strictly third person, and a kill moment where the
   loser falls into the sea and the winner dives in after them, ending on the lens
   crossing the waterline.
3. **plunge** — the transition that carries that dive into abyss. The registry already
   chains surf → abyss through it (`then` / `via`); the chain wakes up when all three lose
   their `wip` flag.
4. **comic**, **paper** — second-engineer passes.
5. New worlds the owner asked for: **snow** (top-down 3D), **orbit** with the
   **telescope** transition (space; telescope replaces cosmic-zoom unless the owner wants
   both), **heli** with **radar**, **worm**.
6. At most two or three more transitions; the owner prefers few and excellent.

Never yet checked on real hardware: sound, frame rate on an M1 Mac and M1 iPad, Safari,
and a two-device match over the internet.
