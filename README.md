# It's Going Down

A downhill arcade game for kids. Seven sports, seven places around the world,
one direction: **down**.

Pick a ride, pick a difficulty, and go. The whole game is one screen away —
the home screen _is_ the level select.

## The rides

| Level | Sport        | Where                    |
| ----- | ------------ | ------------------------ |
| 1     | Snowboard    | Niseko, Japan            |
| 2     | Skateboard   | San Francisco, USA       |
| 3     | Rollerblades | Barcelona, Spain         |
| 4     | Go-Kart      | Monza, Italy             |
| 5     | Speedboat    | Amazon River, Brazil     |
| 6     | Surfboard    | Nazaré, Portugal         |
| 7     | Rally Car    | Atlas Mountains, Morocco |

Each one handles differently on purpose. The kart is twitchy and grippy, the
boat slides and drifts, the surfboard rides the sway of the wave.

## Controls

Deliberately tiny. Two things to learn, and on Easy only one of them.

**Keyboard**

- `←` `→` or `A` `D` — steer
- `Space` / `↑` / `W` — jump (Medium and Hard only)
- `Esc` or `P` — pause

**Touch**

- Hold the left or right side of the screen to steer. Drag your thumb for finer
  control.
- Swipe up, or tap with a second finger, to jump.

## Difficulty

| Mode       | What changes                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Easy**   | Steering only — no jump button to worry about. You cannot fall off the run and you cannot lose. Built for 5-and-under. |
| **Medium** | Faster, more obstacles, jump unlocked, three lives.                                                                    |
| **Hard**   | Full speed, packed course, two lives, no steering assist.                                                              |

Easy mode is genuinely unlosable: the edges of the run are soft walls, there are
no lives, and a gentle auto-assist steers away from obstacles. A small child can
hold one side of the screen and reach the finish.

## Ramps, air, and combos

Every level has launch ramps. Hit one and you go up — clear an obstacle in the
air and you score instead of crashing. Chaining coins, cleared obstacles and
landings builds a combo multiplier.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run typecheck
npm test         # deterministic behavior suite
npm run check:fast # lint, types, and deterministic tests
npm run build    # typecheck + production build into dist/
npm run preview  # serve the production build locally
```

`npm install` configures an executable pre-commit hook. It checks an isolated
snapshot of staged code and configuration with Oxlint and Prettier, then runs
the project typecheck and tests for changes that can affect them. Source
deletions are included, and unstaged edits are left alone.

For browser automation and repeatable debugging, provide a complete run fixture in
its query string, then press **Drop In**:

```text
http://localhost:5173/?level=snowboard&difficulty=easy&seed=1337
```

All three values are required. Level and difficulty must use the IDs defined in
`src/game/levels.ts`; seeds are unsigned 32-bit integers.

## Deploying to Netlify

`netlify.toml` is already configured (build command, publish directory, SPA
redirect, asset caching), so either path works:

**From the dashboard** — connect the repo and accept the detected settings.

**From the CLI**

```bash
npm i -g netlify-cli
netlify deploy --build          # draft URL
netlify deploy --build --prod   # production
```

## How it's built

The game uses TypeScript, Vite, and Three.js. It keeps the deterministic arcade
simulation and adds a deliberately low-resolution, PS1-inspired 3D presentation.
The production JavaScript is approximately **155 KB gzipped**, plus the self-hosted
Bungee font (SIL Open Font License included). There are no model, texture, or audio downloads.

- **Rendering** — low-poly vertex-painted meshes, a perspective chase camera,
  depth fog, and color dithering. The framebuffer fits inside 720 × 480 pixels
  regardless of device pixel density; the menus and HUD stay sharp. Repeated
  props use instancing, and only the visible course is rebuilt. WebGL 2 is required.
- **Worlds** — snow-capped peaks and chalets, a sunset city and suspension bridge,
  coastal buildings and palms, racing grandstands, a jungle river, a raised wave
  face, and a desert rally course. Each sport has an authored rider or vehicle.
- **Recovery** — graphics-context loss pauses an active run and displays a notice.
  Once graphics reconnect, resume from the pause menu. Unsupported browsers show
  a startup message rather than a blank game.
- **Audio** — synthesized live with WebAudio. Music, wind, and every sound
  effect are generated from oscillators and filtered noise, so there is nothing
  to download. The audio context is created on first tap, as mobile requires.
- **Track generation** — seeded, deterministic value noise with zero-meaned
  tables. Obstacles are placed with a lane model that guarantees a clear gap on
  every cluster, so no course is ever impossible.
- **Physics** — per-sport tuning of grip, steering rate, centrifugal pull,
  gravity and jump impulse. Lateral velocity bleeds off exponentially, which is
  what separates the kart's bite from the boat's slide.

### Layout

```
src/
  core/      math, input (keyboard + touch), WebAudio
  game/      level definitions, track generation, physics, WebGL renderer
  rendering/ authored low-poly meshes and course coordinates
  ui/        menu, HUD, modals, design-system CSS
  main.ts    app shell and game loop
```

Progress (best scores per level and difficulty, last selection, mute) persists
in `localStorage`.
