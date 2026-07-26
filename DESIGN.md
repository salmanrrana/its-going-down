<!-- SEED: established with the user before implementation; re-run $impeccable document once there's code to capture the actual tokens and components. -->
---
name: It's Going Down
description: A living downhill diorama where seven distinct worlds turn one simple gesture into cinematic arcade motion.
---

# Design System: It's Going Down

## Overview

**Creative North Star: "The Living Downhill Diorama"**

The game feels like entering an exquisitely built animated world at toy scale: bold readable masses, tactile surfaces, authored landmarks, and characters with oversized silhouettes, but with enough spatial depth, light, atmosphere, and motion to feel genuinely immersive. The approved primary gameplay composition is **Cinematic Chase**—a wide third-person camera behind and above the rider that gives the player, upcoming course, nearby hazards, environmental masses, and distant horizon meaningful space in the same frame.

This is not a nostalgia exercise and not a technical 3D demo. Every environment must feel composed, inhabited, and specific to its sport and place. Procedural terrain provides continuity; authored characters, vehicles, vegetation, props, and landmarks provide memory. The menu and HUD operate inside this world without covering it in generic game chrome.

**Key Characteristics:**

- Wide cinematic chase framing with a stable, readable course ahead.
- Chunky stylized geometry with deliberate silhouette and restrained surface detail.
- Real spatial depth: terrain, fog, shadows, occlusion, particles, and camera all agree.
- A distinct topology, landmark grammar, material language, and motion signature for every level.
- Tactile, playful DOM UI that stays legible without becoming a neon console or glass dashboard.

## Colors

The strategy is a **full environmental palette**: each level owns three or four dominant world colors plus shared high-contrast UI ink, snow/light surfaces, and a warm action color. Color belongs to large scene fields—sky, terrain, architecture, water, vegetation—not scattered decorative accents.

Snow establishes the benchmark: luminous white and pale blue terrain, deep alpine greens, atmospheric blue mountains, a saturated cold sky, and a warm rider/action accent. Urban, motor, river, ocean, and desert worlds must derive equally committed palettes from their places rather than recoloring snow.

**The Atmospheric Ladder Rule.** Near objects carry the widest value and saturation range. Distance moves deliberately toward the environment fog color; it never becomes transparent gray clutter.

**The Warm Signal Rule.** Warm color is scarce and purposeful: player readability, primary action, collectibles, and selected state. It must not compete with every prop.

## Typography

Typography is bold, rounded, compact, and immediately readable by children. It should feel like lettering on high-quality outdoor equipment, trail signage, and collectible toy packaging—not a futuristic console, editorial magazine, or esports broadcast.

The exact production family is **to be resolved during implementation** after testing readability, loading cost, and multilingual glyph coverage. Use a strong display face for the title and major results, with a highly legible rounded UI face for controls, counters, and instructions. Numbers must remain stable and clear at speed.

**The One-Glance Rule.** A child must identify the selected sport, difficulty, primary action, score, lives, and progress without reading decorative copy.

## Layout

Gameplay is landscape-led even when the viewport is portrait. The 3D world fills the viewport; DOM UI occupies disciplined edge zones and preserves the central course corridor. The player sits in the lower third, the actionable course occupies the middle, and landmarks/mountains establish the upper depth field.

The Cinematic Chase camera is wide enough to show steering choices before they become emergencies. Mobile layouts may tighten peripheral scenery and HUD spacing, but may not crop away course readability or enlarge the player until the world disappears. Safe areas, touch targets, and orientation changes are first-class constraints.

Menus use the live or authored world as the dominant field. Selection controls are physical, compact, and grouped by task. All seven sports remain visible as a coherent world tour without reducing each location to an interchangeable card grid.

## Elevation & Depth

Depth is structural rather than ornamental. Terrain geometry, perspective, fog, directional sunlight, a cool ambient fill, tight near-field shadows, contact shading, LOD, and world-space effects work as one system. The world should still read with post-processing disabled.

Shadows are soft-edged but directional. The player and nearby major props receive the highest shadow fidelity; distant repeated scenery uses simplified or baked grounding. Fog creates scale and composition, not concealment. Full-screen bloom, SSAO, motion blur, and depth of field are not default ingredients.

**The One Sun Rule.** Within a level, every hero, prop, terrain plane, particle highlight, and cast shadow agrees on one dominant light direction.

**The Geometry Before Post Rule.** If the scene does not read through geometry, materials, light, fog, and composition, post-processing may not be used to disguise it.

## Shapes

Forms are rounded where bodies, snow, foliage, water, tires, and protective equipment carry weight; they become faceted where mountains, rock, architecture, ramps, and machinery need planes and direction. Silhouettes are authored before surface detail.

Characters and vehicles use slightly exaggerated proportions so head, shoulders, board/wheels/hull, steering direction, and airborne state remain readable on phone-sized screens. Repeated props require at least a small family of silhouette variants and deterministic scale/rotation/tint variation.

**The Big-Mass Rule.** Prefer three convincing overlapping masses over thirty tiny details. Detail that disappears at gameplay distance does not earn geometry, texture memory, or draw calls.

## Do's and Don'ts

### Do:

- **Do** make the player, terrain slope, upcoming path, and nearest hazards understandable in one glance.
- **Do** give every level a dedicated world builder, topology, landmark composition, material family, and hero motion profile.
- **Do** use authored GLB assets where silhouette and animation quality determine the emotional ceiling, especially characters and vehicles.
- **Do** use procedural geometry where it must follow the generated course: piste, roads, banks, river corridor, wave face, scatter zones, and ramps.
- **Do** let speed, steering, contact, jumping, landing, camera, particles, and sound reinforce the same motion event.
- **Do** preserve accessible DOM semantics, focus, touch size, contrast, reduced motion, and an unlosable Easy mode.

### Don't:

- **Don't** treat real-time 3D as a technical checkbox while retaining flat course composition, placeholder primitives, or screen-space effects.
- **Don't** create seven palette swaps of one terrain mesh or hide shared topology behind landmarks.
- **Don't** make the camera so close, low, shaky, or wide-angle that young players cannot read hazards.
- **Don't** use generic neon glass, scanlines, sci-fi chrome, or dark translucent dashboards as the product identity.
- **Don't** spend mobile budget on invisible detail, giant shadow maps, many dynamic lights, uncontrolled transparency, or heavyweight post-processing.
- **Don't** allow adaptive quality to change simulation timing, obstacle density, course fairness, or essential UI information.
