---
version: 1
slug: src-main-ts
primary_target: src/main.ts
related_targets:
  [
    src/game/renderer.ts,
    src/rendering/models.ts,
    src/ui/screens.ts,
    src/ui/styles.css,
  ]
---

# PS1 downhill game

Mode: Experience for the world, Operate for the controls.

## Direction contract

FORM: The user explicitly chose a PlayStation-one-inspired browser/phone game,
replacing the previous visual world. Concept seed dabff623 was run; the pinned
console direction outranks the unrelated assigned alternatives. This is a code-led
real-time 3D artifact, with no approved raster comp or raster asset requirement.

OWN-WORLD: Low-poly vertex-painted landscapes, a 720 × 480 maximum framebuffer,
color dithering, long depth fog, and chunky riders. Menu colors are ink #20283f,
paper #fff2d6, vermilion #ff6446, and yellow #ffdc75. Bungee lettering reads like
an arcade game sleeve. Every sport retains its location and handling personality.

FIRST VIEWPORT: The selected sport runs immediately behind the menu. A loud
three-line title anchors the left; a compact ride selector and a single Drop in
button frame a readable rider and downhill corridor. All seven rides and the
primary action fit the 390 × 844 portrait viewport.

INTERACTION: Selecting a ride immediately changes the 3D world and rider. Drop in
starts the existing countdown and run. Keyboard or screen-side steering remains
the only required action on Easy, which is unlosable. Medium/Hard retain jumping.

REACH: HUD, countdown, pause, results, mute, focus, and touch hints share the same
palette. Phone portrait and short landscape layouts preserve the route. Reduced
motion suppresses camera roll and spray; the game itself continues to move.

## Verification

Screenshots live in .impeccable/review/ (local review evidence, not shipping art).
Desktop and phone layout checks are browser viewport checks; no physical-device
performance claim is made. Simulation and rendering geometry are tested separately.
