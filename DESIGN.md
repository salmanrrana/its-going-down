---
name: It's Going Down
description: Seven downhill rides in a chunky PS1-inspired world with crisp arcade controls.
colors:
  ink: '#20283f'
  paper: '#fff2d6'
  orange: '#ff6446'
  yellow: '#ffdc75'
typography:
  display:
    fontFamily: 'Bungee, sans-serif'
    fontSize: 'clamp(3.1rem, 6vw, 5.4rem)'
    fontWeight: 400
    lineHeight: 0.99
  body:
    fontFamily: "'Trebuchet MS', sans-serif"
  headline:
    fontFamily: 'Bungee, sans-serif'
    fontSize: '2rem'
    fontWeight: 400
    lineHeight: 1.1
rounded:
  control: '3px'
  button: '4px'
  modal: '5px'
components:
  button-primary:
    backgroundColor: '{colors.orange}'
    textColor: '#1d2335'
    rounded: '{rounded.button}'
    padding: '12px 20px'
  button-primary-hover:
    backgroundColor: '{colors.yellow}'
  ride-selected:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
---

# Design System: It's Going Down

## Overview

**Creative North Star: "The Arcade Game Sleeve"**

A playful PS1-inspired downhill world pairs faceted scenery and chunky riders with loud, crisp lettering. Seven sports share the same small control vocabulary while their terrain, landmarks, riders, and motion establish distinct places. This implemented direction replaces the earlier living-diorama seed.

The 3D scene is intentionally pixelated; menus and HUD remain full-resolution DOM elements. Source truth lives in `src/ui/styles.css`, `src/ui/screens.ts`, `src/game/renderer.ts`, and `src/rendering/models.ts`; the first-screen contract lives in `.impeccable/surfaces/src-main-ts.md`.

## Colors

Orange carries the primary action and progress. Yellow accents the title, coins, countdown, combo feedback, and hover states. Ink and warm paper establish readable controls: unselected rides and difficulties use ink surfaces; selected choices reverse to paper.

World palettes belong to their locations: pale snow and blue mountain shadows, warm urban buildings, trackside racing colors, green riverbanks, blue ocean, and desert rock. Keep hazards and the rider distinct from the surrounding terrain.

## Typography

Bungee is self-hosted from `public/fonts/bungee.ttf` with its bundled SIL Open Font License. It supplies titles, action labels, HUD values, countdown, and results. Trebuchet MS supplies instructions, ride labels, and supporting information.

The main title uses three lines, a small opening line, a yellow final line, and a slight counterclockwise tilt. Supporting labels use bold weights and compact sizes; HUD numbers use tabular figures. Preserve the clear difference between display lettering and reading text.

## Layout

The world fills the viewport. Desktop menus put the title and launcher on the left, the selected location at upper right, and all seven ride buttons along the bottom. The middle remains open to the rider and course.

Portrait menus use one column, a four-column ride selector, then difficulty and Drop in. All seven rides and the action fit the reviewed 390 × 844 viewport. Short landscape places the launcher at the right and retains the seven-ride bottom row; 844 × 390 is reviewed. These are browser viewport checks, not physical-device performance measurements.

HUD information occupies the top edge. Portrait moves progress below the scoreboard and pause control. Dialogs center over the world, scroll when necessary, and widen in short landscape; results use two statistic columns normally and four in short landscape. Safe-area offsets protect the main portrait and desktop controls.

## Elevation & Depth

World depth comes from perspective, angular terrain, a directional light and hemisphere fill on meshes, long depth fog, layered peaks, and simple translucent contact-shadow discs. Vertex-painted meshes use flat shading; a subtle shader dither reduces their color precision. The framebuffer preserves aspect ratio and caps its axes at 720 × 480, with pixelated CSS enlargement and no antialiasing.

UI surfaces are mostly flat. Offset ink text shadows keep display lettering readable over scenery; menu gradients and the tinted modal backdrop separate controls from the course. Controls use short hover lifts rather than decorative surface shadows.

## Shapes

Riders and props combine boxes, low-sided cylinders and cones, and faceted rocks into recognizable silhouettes. Repeated props are instanced; geometry is authored in source and shares materials. UI controls are compact rectangles with small corner radii, simple solid fills, and clear icon silhouettes.

## Components

- **Primary and secondary actions:** Bungee labels, generous horizontal padding, and at least 52px base height. Drop in is larger on desktop and adapts in compact layouts. Primary orange and muted secondary surfaces turn yellow on hover; press moves buttons downward.
- **Ride and difficulty selectors:** solid segmented choices with `aria-pressed` selection. Rides pair an icon and name; location labels hide at compact widths. Selected paper surfaces make the current choice obvious, and changing a ride updates the scene immediately.
- **HUD and countdown:** an ink scoreboard groups score, coins, and speed; a thin orange progress bar and separate pause button preserve the view. Large yellow countdown numbers share the title's offset shadow.
- **Pause and results:** a warm-paper dialog with ink text, compact statistic blocks, and stacked actions that become a row in short landscape. Replay remains the primary action.
- **Focus and motion:** controls use an orange 3px focus outline with 4px offset. Reduced motion shortens CSS transitions and suppresses camera roll and spray; gameplay continues to move.

## Do's and Don'ts

- **Do** preserve the visible course corridor, recognizable rider silhouettes, and clear gaps between hazards.
- **Do** keep visible obstacle widths aligned with collision widths and water boundaries continuous.
- **Do** keep UI text crisp while the world remains deliberately low-resolution.
- **Do** preserve keyboard controls, readable touch hints, and the simple unlosable Easy path.
- **Don't** restore the superseded diorama direction or add glossy realism, glass panels, or ornamental HUD clutter.
- **Don't** document downloaded models, adaptive quality, lazy loading, or physical-device frame rates as implemented features. The current renderer uses source-authored meshes and a fixed rendering budget.
