# Sniper Cell: every line the radio speaks, by speaker group.
# 'op' lines are recorded for both operators (Ra and Ronin); 'isr' lines for Overwatch.
# Keep in sync with the game: a line not listed here falls back to the browser's voice.
DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']
BANDS = ['close', 'mid range', 'long range']
WHAT = ['an officer', 'a juggernaut', 'a bulwark', 'a titan', 'the Overseer', 'a tango']
REQ = ['supply drop', 'pulse scan', 'emp', 'decoy', 'cut lights', 'drone overwatch']
CARDS = [('red', 'data hall a'), ('orange', 'core network'), ('yellow', 'cold vault'), ('green', 'data hall b'), ('blue', 'server room c'), ('violet', 'archive')]

OP = [
    # Pings and calls.
    'Eyes on my mark.', 'Enemy, marked.', 'Moving to my mark.', 'Hold position.', 'On me.', 'Cover me.',
    'Sync target marked. Get on him.', "I'm down! I need a pickup on my position!", 'Need you set up there. Good sightline on the compound.',
    'Roger.', 'Copy.', 'Copy. On its way.', 'Negative.', "Negative. Can't do that.",
    *[f'Requesting {r}.' for r in REQ], *[f'Copy. {r} inbound.' for r in REQ],
    # AI partners.
    'Holding fire.', 'I see him.', 'Nothing under your mark.', "Can't shoot from inside that building. Pick somewhere with a view.",
    'Copy, moving to your mark.', 'Already here.', 'Got you covered. Anything near you is mine.', 'Eyes on.',
    'Contacts there. Tagged.', 'One contact there. Tagged.', 'Looks clear from here.', 'Marked.', "I don't see anything there.",
    'Medevac drone is already on you. Hang on.', 'Hang on, medevac drone is on the way!', "Medevac's still cycling. Stay with me!",
    # Kills, sync, night vision.
    'X-ray down.', 'X-ray down. Confirmed.', 'Tango down.', 'Your mark is down.', 'Got him. X-ray down.', 'Target down.', "He's down.",
    'On target.', 'On mine. Sync ready.', 'Sync target marked.', 'Going dark.', 'NODs on. Going dark.',
    # Objectives.
    'Found it. Amber beacon, this rack. Jacking in.', 'Got the beacon. Spotter, on me.',
    *[f'Got a keycard. {c} tag, {r}.' for c, r in CARDS],
    "Their radios are dead. Nobody's calling for help now.", 'Drone bay is grounded. No more birds.',
    'Barracks door is locked. That buys us a minute and a half.', 'Cameras are ours. They can see us all day and nobody will hear about it.',
    'Charge set! Six seconds, get clear!', 'Jacking in. Cover me.', 'Pulling the drive. Nice and quiet.', 'Pulling the drive. Watch the doors.',
    # ICE.
    "Damn it. We've been made.", "Copy. So what's it gonna be, quiet or loud?",
    'I say we go quiet. Find a hole and let them walk past.', 'I say we go loud. Punch through and get to the van.',
    'Your call. Quiet it is.', 'Your call. Going loud.', 'No, I want to stay quiet.', 'No. We go loud.',
    'Going quiet. Ra, keep the camo up. Ronin, stay light on your feet.', 'Going loud. Weapons free. Stay on me.',
    "Contact! They've got me! Going loud!",
    'Walked right past me. Camo held.', 'He was close enough to touch. Clear now.',
    "That was way too close. They're moving on.", "Held my breath the whole time. They're gone.",
    'Nice. Keep moving, get to the van.', "We're through the ring. Nobody saw a thing. Moving to the van.", "We're out of the building! Moving to the van!",
    # Opening cut-scene.
    "Link's up. Console's synced.", "Rifle's cold and quiet.", 'Camo check... good.', 'Kestrel Ridge. In and out before sunrise.',
    'Comms check. Rifle, tablet, quad... all on me tonight.', "Camo's good.",
    # Contact callouts.
    'Contact.',
    *[f'Contact, {d}, {b}.' for d in DIRS for b in BANDS],
    *[f'Multiple contacts, {d}, {b}.' for d in DIRS for b in BANDS],
    *[f'Eyes on {w}, {d}.' for w in WHAT for d in DIRS],
]

BRIEF = ("Overwatch to Sniper Cell, ISR is on station. Your objective is the archive server inside the Kestrel Ridge data center. "
         "Two floors, six rack rooms behind keycard doors, and we don't know which one. Plant the relay in the electrical room. "
         "Each rack room takes its own colour-tagged keycard: search the office drawers, or take {chief}'s master badge. "
         "Find the rack with the amber beacon and upload. A clean upload and nobody ever knows. "
         "Botch it and SENTINEL's ICE puts the garrison on the walls. Then pull the drive and get to the van. "
         "The comms room and the CCTV desk can be hacked in person, and there's food and ammo upstairs. {extra} Good hunting.")
ISR = [
    BRIEF.format(chief='the Overseer', extra="SENTINEL's night shift is augmented. Watch the towers."),
    BRIEF.format(chief='the Site Chief', extra=''),
    'Sweep running on your cross.', 'Upload complete. Pull the drive.', "Clean lock. You're invisible to SENTINEL. Hold the rack.",
    "ICE alert. They're putting guards on the walls. Finish the upload, then pick your way out, or fight it.",
    'Intel is out, quiet as you like. Get to the van.', "You're clear. They've lost you.", "You've been spotted. Break line of sight.",
    'Heads up, they called for backup. A fireteam is moving on your position.',
    "Overwatch to Sniper Cell. ICE just tripped. Multiple hostiles are moving to ring the building. You've been made.",
    "Overwatch copies quiet. They're forming up to clear the building, ground floor first. Don't be there.",
    'Overwatch copies loud. Hostiles are stacking on the doors. Make it fast.',
    'No consensus, Sniper Cell. Stay quiet until they make you.', "You're spotted. All units converging. Fight it out, Sniper Cell.",
    'Good copy, Sniper Cell. Clean exit. The van is warm on the east track.', "Copy. Van on the east track. Don't stop.",
]
