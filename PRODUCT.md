# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary audience is kids and families. Easy mode must be usable by children five and under with one simple steering action, while Medium and Hard provide enough speed, jumping, obstacle density, and scoring depth for older players.

## Product Purpose

It's Going Down is an immediate downhill arcade game: choose one of seven sports, choose a difficulty, and descend a short deterministic course. Success means the player can understand the controls instantly, feel a distinct handling personality for every ride, enjoy an immersive sense of speed and place, and complete or replay a run without navigating a complex game shell.

## Positioning

Seven globally distinct downhill experiences share the same tiny control vocabulary and fair deterministic course system while handling intentionally differently. Snowboard, skateboard, rollerblades, go-kart, speedboat, surfboard, and rally car are not cosmetic skins; each combines a recognizable location, surface, motion profile, hazards, character or vehicle presentation, and environmental identity.

## Operating Context

Players use keyboard or touch in a full-viewport browser experience. The home screen is the level and difficulty selector. A run flows through countdown, gameplay, pause if needed, finish or failure, results, and replay or return. Progress, best scores, last selection, and mute preference persist locally.

## Capabilities and Constraints

- Seven sports and locations: Snowboard/Niseko, Skateboard/San Francisco, Rollerblades/Barcelona, Go-Kart/Monza, Speedboat/Amazon River, Surfboard/Nazaré, and Rally Car/Atlas Mountains.
- Keyboard and touch steering; jumping is available on Medium and Hard.
- Easy, Medium, and Hard difficulties.
- Easy mode is genuinely unlosable: no lives, no required jump input, soft course boundaries, and steering assistance.
- Deterministic course generation must preserve clear obstacle gaps, protected ramp landing zones, reproducible seeds, and fair start/end sections.
- Ramps, airborne obstacle clears, coins, combos, scores, lives, and run statistics remain part of the game.
- The primary gameplay renderer is immersive real-time Three.js/WebGL with geometry, perspective cameras, lighting, shadows, fog, world-space effects, and optimized authored assets.
- The DOM remains responsible for accessible menus, HUD, pause, loading, settings, and results.
- Mobile frame pacing, adaptive graphics quality, lazy environment loading, bounded asset size, and explicit GPU-resource cleanup are release requirements.
- A general-purpose rigid-body physics engine is not required initially; tuned deterministic arcade simulation remains authoritative.
- All seven sports are committed scope for this rebuild.

## Brand Commitments

- Product name: It's Going Down.
- Voice: direct, playful, energetic, and easy for children to understand.
- The experience must remain chunky, inviting, readable, and child-friendly rather than realistic, aggressive, or simulation-heavy.
- `docs/reference/ui-design-target.jpg` is a binding quality and style reference for immersive scale, groomed snow, volumetric scenery, atmospheric mountains, readable character silhouette, and surface spray. It is not a requirement to copy the exact composition.

## Evidence on Hand

- Existing product behavior and wording: `README.md`.
- Existing deterministic gameplay, levels, input, audio, persistence, and UI: `src/`.
- Binding visual reference: `docs/reference/ui-design-target.jpg`.
- Historical Canvas visual-overhaul brief: `plans/prd.json`; it is superseded as the implementation architecture and must not be treated as the active plan.
- No licensed production 3D asset library is currently present. New authored, generated, or sourced assets must record provenance and usage rights.

## Product Principles

1. One gesture gets a child moving; depth is earned through handling, timing, route choice, and replay.
2. Every sport and place must feel mechanically and visually specific, never like a palette swap.
3. Fair deterministic courses outrank spectacle that makes obstacles unreadable or outcomes arbitrary.
4. The player, terrain, camera, effects, and sound must tell the same motion story.
5. Visual ambition must survive real mobile budgets through authored priorities, quality tiers, lazy loading, and disciplined reuse.

## Accessibility & Inclusion

- Preserve semantic DOM controls, keyboard navigation, visible focus, large touch targets, safe-area handling, pause behavior, and reduced-motion support.
- Critical gameplay information must remain readable over every environment and quality tier.
- Easy mode must remain a reliable low-complexity path for very young players and players who benefit from reduced failure pressure.
