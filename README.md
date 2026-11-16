# Draxxed Sklounst

A 1v1 long-range sniper duel that runs in the browser on desktop, phones and tablets. No install, no server: one player hosts, the other opens the invite link, and the two connect peer-to-peer over WebRTC.

## Play

1. Serve this folder over HTTP(S) (see **Hosting** below) and open it.
2. **Host a match** shows a 5-letter code. Tap **Share invite link** and send it to your friend.
3. Your friend opens the link, enters a callsign, and taps **Join**. The match starts automatically.

**Vs AI** is a full match against an AI sniper (Recruit, Veteran or Elite), with the same rounds, uplinks, UAV sweeps and killcams as an online match. The AI spots you from movement, stance, scope glint and muzzle flash, leads moving targets, partly corrects for wind, relocates after shooting, and goes for uplinks when it's losing on time.

**Sandbox** is a free-play testing mode. Press **B** (or **TOOLS** on touch) to open the tools panel, which has:

- teleports to the ridges and each uplink;
- AI controls: off, passive or hostile, skill level, and a button that moves the AI to wherever you're aiming;
- wind direction and speed, and time of day;
- god mode, infinite ammo and fly mode;
- bullet-trajectory traces that label each impact with its drop;
- hitbox wireframes and quarter-speed slow motion.

**Practice range** is a solo mode with steel targets from 150 to 850 m and a moving target. Use it to learn drop, wind and zeroing.

### Rules

- Both players start on opposite ridgelines, about 800 m apart. Spawns are random among three points per ridge, and sides swap every round.
- You get one life per round. First to 4 rounds wins.
- **UAV sweep**: every 60 s of live play, both players see the other's position for a few seconds.
- **Uplinks A / B / C** are in the town, on the dam and at the ski-lift station. Stand in the ring for 8 s to capture one. A capture pings your enemy's position three times. If time runs out, whoever holds the most uplinks wins the round.
- Every kill plays a **killcam** (through the shooter's scope) and then a slow-motion **bullet-cam**.

### Ballistics

- Projectiles are simulated with gravity, quadratic drag and wind. Muzzle velocity is 720 m/s, so a 700 m shot takes about 1.2 s.
- **Zeroing** runs from 100 to 1000 m. The scope uses a true mil reticle, so holdover is correct at every zoom level.
- **Wind** varies per round and gusts over time. Read it from the flags, the smoke column in town, drifting embers and the swaying grass and trees. It never appears on the HUD.
- **Scope glint** appears when an opponent is scoped in and pointed at you. It is stronger at higher zoom (12× most, 4× least) and stronger with the sun behind you.
- **Sound**: a near miss gives a supersonic *crack*, followed by the muzzle *boom* travelling at about 343 m/s. The gap between them tells you the range.
- Trees conceal you but don't stop bullets. Rocks, walls and buildings do.

### Controls

| Action | Keyboard / mouse | Touch |
|---|---|---|
| Move / sprint | WASD / Shift | Left stick / RUN |
| Fire / scope | LMB / RMB (hold, or toggle in settings) | FIRE / SCOPE |
| Zoom 4·8·12× | Mouse wheel | + / − |
| Hold breath | Shift while scoped | HOLD BREATH |
| Zero − / + | Q / E | Z− / Z+ |
| Crouch / prone / jump | C / Z / Space | CRCH / PRN / JMP |
| Rangefinder / reload | F / R | RNG / R |
| Pause menu | Esc | II |
| Sandbox tools | B | TOOLS |

## Single-file version

`dist/draxxed-sklounst.html` is the whole game in one file. Double-click it to play, or send it to a friend; it needs an internet connection only to find the other player. Since a file has no web address, the host shares the 5-letter code rather than a link. Rebuild it after code changes with `npm install && npm run build:single`.

## Hosting

The game is a static site with all dependencies vendored in `vendor/`, so there's no build step.

- **GitHub Pages**: Settings → Pages → deploy from branch, root folder.
- **Any static host** (Netlify, Cloudflare Pages, Vercel) works too.
- **Locally**: `python3 -m http.server 8080`, then open `http://<your-ip>:8080` on each device on the same Wi-Fi.

Matchmaking uses the free public PeerJS broker only to exchange connection details. Gameplay traffic goes directly between the two devices, with a TURN relay as fallback on restrictive networks.

**Testing on one machine:** add `?local=1` to the URL and open two tabs. The tabs then talk over `BroadcastChannel` instead of WebRTC.

## Graphics presets

**Auto** picks a preset based on the GPU:

- **High**: Apple Silicon and discrete GPUs. Shadows, MSAA, bloom, ink outlines and the full grade.
- **Medium**: phones and mid-range GPUs.
- **Low**: older integrated GPUs such as Intel HD 4000. No post-processing, fewer trees, no grass.

Resolution also scales dynamically to hold the frame rate. You can override the preset under Settings in the menu.

## Code map

| File | Contents |
|---|---|
| `src/main.js` | Menu, settings, host/join flow |
| `src/game.js` | Game loop, host-authoritative rounds, shooting, hit registration, uplinks, post-processing |
| `src/world.js`, `src/terrain.js` | The valley: terrain, town, dam, ski lift, ridges, vegetation, flags |
| `src/atmosphere.js` | Dusk and golden-hour palettes, height-based haze, sky |
| `src/ballistics.js` | Projectile integration, wind, zero tables |
| `src/bot.js` | AI opponent (plugs in where the network peer would) |
| `src/sandbox.js` | Sandbox tools panel |
| `src/killcam.js` | Replay histories, killcam and bullet-cam |
| `src/hud.js`, `style.css` | HUD, scope reticle, compass |
| `src/briefmap.js` | Topographic briefing map drawn from the real terrain |
| `src/net.js` | PeerJS / BroadcastChannel transport |
| `src/config.js` | Gameplay tuning |
