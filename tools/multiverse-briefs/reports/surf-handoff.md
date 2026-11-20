HAND-OFF NOTE from the surf world (BREAK POINT), for the plunge transition and the underwater world (abyss). Written by surf's second engineer after re-shooting the kill moment on both clients.

- overTime is 4.5 s (KILL.end in surf/game.js). The choreography runs on its own real-time clock, game.kill.t (sim dt / 0.35); the sea runs in the core's 0.35x slow motion.
- Timeline, seconds from the hit:
  - 0: the board fires up and the loser comes off arms out.
  - 0–0.42: the lens turns onto the falling rider.
  - 0.05–1.0: the lens travels to a long shot behind and above the winner, holding the rider's size (on the victim's client: a pull-back across the bay arcing up to 12 m).
  - ~1.0–1.3: the loser hits the water (tower of spray, rings); a pastel rainbow fades in about 0.3 s later.
  - 1.35–1.85: two-shot, the winner in the foot of the frame watching.
  - 1.8–2.37: the lens swings to the winner's side. The winner crouches at 1.75–2.25 and springs at 2.25; the header lasts 0.84 s and enters the water at ~2.9–3.1 (column, rings, boil).
  - 2.79–4.0: the lens goes in behind the entry, 0.55 m up.
  - 2.65–3.65: the letterbox fades out.
  - 3.75–4.2: the waterline climbs the frame, then holds to 4.5.
- LAST FRAME (the transition's from-image):
  - Waterline: a wavy white seam about 22 % from the top (uWater.x ≈ 0.78 from the bottom).
  - Above the seam: a sliver of the bay (mist column, sea, hills, sky) under a pale wash, about rgb(205,201,193).
  - Just below the seam: bright aqua, about rgb(187,235,233) → (133,215,219), with churned froth.
  - Mid-frame turquoise about (36,117,151); about (9,61,102) at 70 % down; deep blue about (3,31,73) at the bottom.
  - Light shafts fan down from above; ringed bubbles in three sizes, densest in a centre plume and near the line.
  - No HUD and no letterbox bars.
- focus() returns the projected entry point (screen centre on a draw).
- A render with no update before it (the core's snapshot) runs the choreography to its end first.
- On a DRAWN round none of this happens: the last frame is the ordinary chase view with no waterline, and the director does not chain to the underwater world.

Still open on surf itself: riders are simple capsule-and-ball figures, and spray reads as soft puffs at close range (second engineer scored the picture 7/10); the full-quality build has only been seen at 640x360; nothing has been measured on Safari or a real iPad.
