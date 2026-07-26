# It's Going Down

A downhill arcade game for kids. Seven sports, seven places around the world,
one direction: **down**.

Pick a ride, pick a difficulty, and go. The whole game is one screen away —
the home screen *is* the level select.

## The rides

| Level | Sport | Where |
| --- | --- | --- |
| 1 | Snowboard | Niseko, Japan |
| 2 | Skateboard | San Francisco, USA |
| 3 | Rollerblades | Barcelona, Spain |
| 4 | Go-Kart | Monza, Italy |
| 5 | Speedboat | Amazon River, Brazil |
| 6 | Surfboard | Nazaré, Portugal |
| 7 | Rally Car | Atlas Mountains, Morocco |

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

| Mode | What changes |
| --- | --- |
| **Easy** | Steering only — no jump button to worry about. You cannot fall off the run and you cannot lose. Built for 5-and-under. |
| **Medium** | Faster, more obstacles, jump unlocked, three lives. |
| **Hard** | Full speed, packed course, two lives, no steering assist. |

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
npm run build    # typecheck + production build into dist/
npm run preview  # serve the production build locally
```

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

No framework, no runtime dependencies, no image or audio assets. The production
bundle is about **18 KB gzipped** and loads instantly.

- **Rendering** — Canvas 2D in the classic pseudo-3D segment-projection style
  (the technique behind arcade racers of the 80s). The track is a ribbon of
  projected quads drawn near-to-far with a running depth clip, so hills occlude
  correctly. Everything is flat fills and gradients, which stays pin-sharp at any
  device pixel ratio and costs very little on phone GPUs.
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
  game/      level definitions, track generation, physics, renderer
  ui/        menu, HUD, modals, design-system CSS
  main.ts    app shell and game loop
```

Progress (best scores per level and difficulty, last selection, mute) persists
in `localStorage`.
