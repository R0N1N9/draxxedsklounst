# Module briefs

How the worlds and transitions under `src/multiverse/` were commissioned, kept so any of
them can be rebuilt or given another polish pass later.

- `briefs.json` — the creative brief for every world (`dims`) and transition (`fx`).
- `wave-template.js` — the builder and second-engineer ("harden") instructions each brief
  is dropped into, including the test commands every module must pass.

## Status

| Module | Kind | Built by | Hardened by |
| --- | --- | --- | --- |
| dev-app | transition (the reveal) | top tier | top tier |
| synapse | transition | top tier | top tier |
| shatter | transition | top tier | standard tier |
| flashback | transition | top tier | standard tier |
| neon | world | top tier | top tier |
| ww2 | world | top tier | standard tier |
| pixel | world | standard tier | standard tier |

Everything from `pixel` on is built on the standard tier to stay inside a usage limit.
To raise one to the top tier's finish later, run its second-engineer brief again on the
stronger model: each module is self-contained (its own folder, the shared contract and
`tools/mv-test.mjs`), so that can be done one module at a time without touching the rest.
