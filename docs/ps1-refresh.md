# PS1 graphics refresh

The September 2026 refresh starts from `origin/main` at `3ebcef9` and replaces
the Canvas illustration renderer with a low-poly Three.js chase view. The
simulation, seven sports, difficulty rules, progress storage, and audio remain.

All meshes are authored in `src/rendering/models.ts`. Bungee is distributed under
the SIL Open Font License in `public/fonts/OFL-Bungee.txt`; its source is
[Google Fonts](https://github.com/google/fonts/tree/main/ofl/bungee). There are no
external model, texture, or music downloads.

The world renders inside 720 × 480 pixels, independent of device pixel density.
Instanced scenery and a fixed visible-course window bound draw and geometry cost.
Menus and HUD remain native-resolution DOM. WebGL 2 is required.

## Verification

- `npm run check:fast`: lint, TypeScript, and all 68 tests pass.
- `npm run build`: passes; JavaScript is about 155 KB gzipped. Vite reports its
  default 500 KB minified-chunk advisory for the bundled Three.js runtime.
- Browser inspection covers all seven worlds, 1440 × 900 desktop, 390 × 844
  portrait, and 844 × 390 landscape gameplay, menu, and results.
- An actual browser Easy run completed in 1:32, collecting 127 coins and taking
  ramps automatically; results and saved best score appeared correctly.
- Geometry tests check collision-plane alignment, finite meshes, and visual
  hazard widths against the authoritative simulation bounds.
- Independent review fixes: continuous water-edge vertices and hazard widths
  aligned with their collision areas. Both were scored resolved.

Viewport checks do not establish physical-phone frame rate. Graphics context
recovery and the unsupported-WebGL startup message are implemented; context-loss
recovery has not been exercised on physical hardware.
