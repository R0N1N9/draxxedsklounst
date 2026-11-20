<p align="center"><img src="icon.svg" width="120" alt="Draxxed Sklounst logo"></p>

<h1 align="center">Draxxed Sklounst</h1>

<p align="center"><em>One valley. Two rifles. Eight hundred metres.</em></p>

A 1v1 long-range sniper duel that runs in the browser on desktop, phones and tablets. No install, no server: one player hosts, the other opens the invite link, and the two connect peer-to-peer over WebRTC.

![The practice range: looking out over the valley from the ridge with the Mk22 MRAD](docs/screenshots/practice-range.png)

## Screenshots

| Main menu and AO briefing map | Vs AI: round 1 insertion |
| --- | --- |
| ![Main menu with the topographic briefing map of the valley, ridges and uplinks A, B and C](docs/screenshots/main-menu-briefing-map.png) | ![Round 1 insertion against a Veteran AI: HUD with compass, uplink markers, loadout tools and ammo](docs/screenshots/vs-ai-insertion.png) |

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
- **Predator UAV**: a drone circles high over the valley. Every 60 s of live play it pings both players in red on each other's HUD. For 8 s afterwards you can press **U** to tune into its live thermal feed of the enemy. A UAV jammer blocks the ping and the feed.
- **Sniping style** (main menu, host's choice applies to both players):
  - **Simulation** (like Sniper Elite / ARMA): heavier drag and strong wind.
  - **Battlefield** (the default): real drop and travel time, moderate wind.
  - **Call of Duty**: fast bullets, light drop, no wind, slightly bigger hitboxes.
  - **Halo**: instant hit, no drop, wind or sway, 5×/10× zoom.
  - **Custom**: sliders for drop, bullet speed (slow to instant), wind, drag, sway and hitbox size.
  - Option: the rangefinder (F) auto-sets your zero to the measured distance.
- **Bipod**: go prone and hold still, and the bipod drops. The scope stops moving entirely and recoil is reduced.
- **Supply drone** (V, once per round): a cargo hexacopter flies in from behind your ridge and drops a parachute crate where you aim (within 60 m) or at your feet. Walk onto it to refill both weapons. Both players see and hear it, and the AI uses it to find you.
- **No shooting or reloading while sprinting.** Walking and standing are fine, and starting a sprint cancels a reload.
- **Weapons**: pick your rifle in the loadout. Everyone also carries an **M18 pistol** (17+1, one spare magazine) for close range. Every weapon starts with **one in the chamber**: a reload before you're empty keeps it, while a reload from empty is slower because you have to chamber a round.
  - **Mk22 MRAD** (default): bolt-action .300 PRC, 7+1. One-shot headshots, two body shots, slow bolt throw, 4–20× scope. Higher zoom glints more.
  - **M110A1 DMR**: semi-auto 7.62, 20+1, about 3 shots a second. Headshots still kill; three body shots. Its smaller 4–10× scope glints less.
- **Loadout**: before the match (main menu → Loadout) and during each round's insertion (**L**), pick one tool per slot:
  - **Scout (T):** Hunter drone, Spotting drone or Recon dart.
    - **Hunter drone:** a fixed-wing loitering drone. It flies 250–450 m in the direction you aim, then circles and searches about 160 m around itself. When it sees the enemy it locks on, follows them, and marks them on your HUD every second. If it loses sight for 4 s, it goes back to searching. It lasts 40 s. It's audible and visible, the enemy is warned when it locks, and it can be shot down. Smoke and the thermal poncho break the lock.
    - Spotting drone: fly a thermal quadcopter for 25 s; loud and shootable. Recon dart ×2 (fired up to ~400 m; pings enemies moving within 45 m for 40 s; blinks, beeps and is shootable).
  - **Stealth (passive):** Thermal poncho (hidden from thermal; 20% slower, no sprint), Suppressor (no flash, quiet; 12% slower bullets), Anti-glint cover (no glint; narrower, darker scope) or UAV jammer (hides you from one UAV sweep).
  - **Tactical (G):** Smoke grenades ×2 (25 s screen that blocks sight, not bullets) or Decoy (a fake prone sniper with a fake glint; shooting it reveals where you fired from).
- The AI gets a random loadout each round and uses its tools: it flies drones, plants darts, smokes when it relocates, leaves decoys behind, and shoots down drones that come close.
- **Uplinks A / B / C** are in the town, on the dam and at the ski-lift station. Stand in the ring for 8 s to capture one. A capture pings your enemy's position three times. If time runs out, whoever holds the most uplinks wins the round.
- Every kill plays a **killcam** (through the shooter's scope) and then a slow-motion **bullet-cam**.

### Ballistics

- Projectiles are simulated with gravity, quadratic drag and wind. Muzzle velocity is 720 m/s, so a 700 m shot takes about 1.2 s.
- **Zeroing** runs from 100 to 1000 m. The scope uses a true mil reticle, so holdover is correct at every zoom level.
- **Wind** varies per round and gusts over time. Read it from the flags, the smoke column in town, drifting embers and the swaying grass and trees. It never appears on the HUD.
- **Scope glint** appears when an opponent is scoped in and pointed at you. It is stronger at higher zoom (12× most, 4× least) and stronger with the sun behind you.
- **Sound**: a near miss gives a supersonic *crack*, followed by the muzzle *boom* travelling at about 343 m/s. The gap between them tells you the range.
- Trees conceal you but don't stop bullets. Rocks, walls and buildings do.

### Touch controls

- Controls sit in arcs around where each thumb rests, inset from the corners and clear of notches. A fixed joystick sits bottom-left; push it fully forward to sprint. Zero −/+, Range and the weapon swap sit in an outer ring around the right-hand FIRE button. The left thumb also has a second **FIRE** and a **BREATH** toggle, so either thumb can aim while the other fires.
- Drag anywhere that isn't a button to aim. Left and right thumbs each have their own sensitivity in Settings.
- **SCOPE** and **BREATH** are toggles. Breath releases itself when you unscope or run out of air.
- **Gyro aiming** (Settings): Off, When scoped (default on phones) or Always, with its own sensitivity and invert. It needs HTTPS, so it works from the hosted page, not an opened file. iPhones ask for motion permission the first time.
- Pills along the top hold your tools (with charges), kit, the Predator feed and the menu.

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
| Rifle / pistol | 1 / 2 (or wheel when not scoped) | 1 / 2 |
| Scout / tactical tool | T / G | TOOL T / TOOL G |
| Loadout (insertion) | L | KIT |
| Predator feed | U | FEED |
| Supply drone | V | SUPPLY |
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
| `src/weapons.js`, `src/viewmodel.js` | Weapon stats; first-person weapons and arm rig with animations |
| `src/tools.js`, `src/loadout.js` | Loadout tools, Predator UAV, loadout picker |
| `src/sandbox.js` | Sandbox tools panel |
| `src/killcam.js` | Replay histories, killcam and bullet-cam |
| `src/hud.js`, `style.css` | HUD, scope reticle, compass |
| `src/briefmap.js` | Topographic briefing map drawn from the real terrain |
| `src/net.js` | PeerJS / BroadcastChannel transport |
| `src/config.js` | Gameplay tuning |
