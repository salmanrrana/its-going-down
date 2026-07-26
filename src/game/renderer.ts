import { clamp, lerp } from '../core/math'
import { ArtLibrary, selectLeanFrame, STRIP_WIDTH, type Sprite } from '../art'
import type { GameSnapshot, GameView, SprayEffect } from './contracts'
import { interpolateRenderState, type RenderState } from './render-state'
import { DRAW_DISTANCE, SEGMENT_LENGTH, type Segment, type Track } from './track'
import type { LevelDef, LevelId, ObstacleKind, Palette, SceneryKind } from './types'

// Preserve the established public import while keeping simulation constants renderer-neutral.
export { PLAYER_HALF_WIDTH } from './constants'

/**
 * Pseudo-3D renderer in the classic segment-projection style: the track is a
 * ribbon of quads projected back-to-front, with sprites depth-sorted into the
 * same pass.
 *
 * Everything that is *art* — mountains, trees, the rider, obstacles — is
 * pre-painted into offscreen canvases by `ArtLibrary` when a level loads, and
 * blitted here. Per-frame drawing is limited to the ribbon itself plus a
 * handful of dynamic effects (carve trail, camera roll, weather), which is
 * what lets the scene be genuinely illustrated without costing anything on a
 * phone.
 */

const CAMERA_DEPTH = 0.84
const CAMERA_HEIGHT = 1500
/**
 * Near plane. Without this, segments approaching the camera divide by a tiny
 * dz and explode to many screen-widths across, swamping the frame.
 */
const NEAR_Z = SEGMENT_LENGTH * 1.5

/** Screen height fraction the player's contact point sits at. */
const PLAYER_SCREEN_Y = 0.83
/**
 * World distance from the camera to the player's contact point, derived from
 * inverting the projection at PLAYER_SCREEN_Y over flat ground. The carve
 * trail is laid down at this z so it emerges from under the board.
 */
const PLAYER_Z = (CAMERA_DEPTH * CAMERA_HEIGHT) / (2 * PLAYER_SCREEN_Y - 1)

/**
 * Scenery height as a fraction of the run's projected half-width, so props stay
 * proportionate no matter how wide a level's run is.
 */
const SCENERY_HEIGHT: Record<SceneryKind, number> = {
  pine: 0.66,
  palm: 0.74,
  building: 1.45,
  streetlight: 0.62,
  rock: 0.3,
  buoy: 0.22,
  cactus: 0.52,
  flag: 0.42,
  reed: 0.3,
}

/**
 * Obstacle *width* in world units, so the painted sprite covers roughly the
 * space the collision test uses. Half-width in `constants` is 240.
 */
const OBSTACLE_WIDTH: Record<ObstacleKind, number> = {
  rock: 520,
  tree: 560,
  cone: 400,
  barrel: 420,
  log: 760,
  car: 900,
  hydrant: 360,
  crate: 440,
}

/** Levels whose whole visible field is groomed with longitudinal corduroy. */
const GROOMED: ReadonlySet<LevelId> = new Set<LevelId>(['snowboard'])

/**
 * What the craft leaves behind on the surface. Snow takes a carved groove,
 * water takes a widening foam wake, wheels leave skid marks only while the
 * craft is actually carving hard.
 */
interface TrailStyle {
  readonly fill: string
  readonly core: string | null
  /** Only lay the trail down while |carve| is high (tyres, not runners). */
  readonly skid: boolean
  /** How much the ribbon widens with age — foam wakes spread, grooves don't. */
  readonly widen: number
}

const TRAILS: Partial<Record<LevelId, TrailStyle>> = {
  snowboard: { fill: 'rgba(124,158,206,0.42)', core: 'rgba(88,124,176,0.4)', skid: false, widen: 0.15 },
  surf: { fill: 'rgba(255,255,255,0.5)', core: 'rgba(255,255,255,0.4)', skid: false, widen: 2.4 },
  boat: { fill: 'rgba(255,255,255,0.55)', core: 'rgba(226,248,255,0.45)', skid: false, widen: 3.2 },
  skateboard: { fill: 'rgba(24,24,30,0.24)', core: null, skid: true, widen: 0 },
  gokart: { fill: 'rgba(24,24,30,0.28)', core: null, skid: true, widen: 0 },
  car: { fill: 'rgba(74,50,28,0.34)', core: null, skid: true, widen: 0.6 },
  rollerblade: { fill: 'rgba(40,40,52,0.16)', core: null, skid: true, widen: 0 },
}

/** Ambient falling-particle weather, per level. Only snow needs it so far. */
interface WeatherConfig {
  readonly count: number
  readonly color: string
  readonly fallSpeed: number
}

const WEATHER: Partial<Record<LevelId, WeatherConfig>> = {
  snowboard: { count: 110, color: '255,255,255', fallSpeed: 120 },
}

interface Projected {
  screenX: number
  screenY: number
  screenW: number
  scale: number
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
}

interface Flake {
  x: number
  y: number
  /** 0..1 pseudo-depth: drives size, speed and alpha together. */
  depth: number
  phase: number
}

interface TrailSample {
  z: number
  x: number
  carve: number
  /** True when the craft was airborne — breaks the ribbon. */
  gap: boolean
}

export class Renderer implements GameView {
  private ctx: CanvasRenderingContext2D
  private width = 0
  private height = 0
  private dpr = 1
  private particles: Particle[] = []
  private flakes: Flake[] = []
  private weather: WeatherConfig | null = null
  private weatherTime = 0
  private trail: TrailSample[] = []
  private art: ArtLibrary | null = null
  private artLevel: LevelId | null = null
  /** Per-frame segment visibility from the quad pass, reused by the corduroy pass. */
  private visible: boolean[] = []
  /**
   * The vignette only changes with viewport size, but as a full-screen radial
   * gradient it is one of the most expensive fills in the frame. Rendered once
   * per resize into its own layer and composited with a single drawImage.
   */
  private vignette: HTMLCanvasElement | null = null
  /**
   * Sky gradient + sun + bloom are three more full-screen gradient fills that
   * only change when the horizon line moves. The horizon is quantized to 4px
   * and the whole stack is re-rendered into this layer only on bucket change.
   */
  private sky: HTMLCanvasElement | null = null
  private skyKey = ''

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas 2D is not available in this browser.')
    this.ctx = ctx
  }

  resize(): void {
    // Cap DPR at 2: beyond that the fill cost climbs with no visible gain.
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    if (w === this.width && h === this.height && dpr === this.dpr) return
    this.width = w
    this.height = h
    this.dpr = dpr
    this.canvas.width = Math.round(w * dpr)
    this.canvas.height = Math.round(h * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.flakes.length = 0
    this.vignette = null
    this.sky = null
    this.skyKey = ''
  }

  get size(): { width: number; height: number } {
    return { width: this.width, height: this.height }
  }

  private spawnParticle(p: Particle): void {
    // Hard cap keeps a long run from ever accumulating cost.
    if (this.particles.length > 260) this.particles.shift()
    this.particles.push(p)
  }

  handleEffect(effect: SprayEffect): void {
    const baseX = this.width / 2 + effect.playerX * 0.06
    const baseY = this.height * PLAYER_SCREEN_Y - (effect.playerY / 1000) * this.height * 0.16
    for (let i = 0; i < effect.count; i++) {
      const angle = effect.burst
        ? Math.random() * Math.PI * 2
        : Math.PI * (0.9 + Math.random() * 0.5)
      const speed = (effect.burst ? 240 : 120) * effect.force * (0.5 + Math.random())
      this.spawnParticle({
        x: baseX + (Math.random() - 0.5) * this.width * 0.05,
        y: baseY + (Math.random() - 0.5) * this.height * 0.012,
        vx: Math.cos(angle) * speed - effect.lateralVelocity * 0.022,
        vy: Math.sin(angle) * speed - 70,
        life: 0.45 + Math.random() * 0.55,
        maxLife: 1,
        size: (effect.burst ? 5 : 3.4) * (0.5 + Math.random()),
        color: effect.color,
      })
    }
  }

  update(dt: number): void {
    const list = this.particles
    let write = 0
    for (let i = 0; i < list.length; i++) {
      const p = list[i]
      p.life -= dt
      if (p.life <= 0) continue
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 560 * dt
      p.vx *= 1 - 1.7 * dt
      list[write++] = p
    }
    list.length = write

    this.updateWeather(dt)
  }

  private updateWeather(dt: number): void {
    const config = this.weather
    if (!config || this.width === 0) {
      this.flakes.length = 0
      return
    }
    this.weatherTime += dt
    if (this.flakes.length !== config.count) {
      this.flakes.length = 0
      for (let i = 0; i < config.count; i++) {
        // Deterministic scatter — no per-frame randomness, so pausing is stable.
        const g = (i * 2654435761) % 4096
        this.flakes.push({
          x: ((g % 64) / 64) * this.width,
          y: ((Math.floor(g / 64) % 64) / 64) * this.height,
          depth: 0.25 + ((i * 37) % 100) / 133,
          phase: (i * 0.63) % (Math.PI * 2),
        })
      }
    }
    for (const flake of this.flakes) {
      flake.y += config.fallSpeed * (0.4 + flake.depth) * dt
      flake.x += Math.sin(this.weatherTime * 1.3 + flake.phase) * 26 * flake.depth * dt
      if (flake.y > this.height + 4) {
        flake.y -= this.height + 8
        flake.x = (flake.x + this.width * 0.37) % this.width
      }
      if (flake.x > this.width + 4) flake.x -= this.width + 8
      if (flake.x < -4) flake.x += this.width + 8
    }
  }

  private project(
    out: Projected,
    worldX: number,
    worldY: number,
    worldZ: number,
    camX: number,
    camY: number,
    camZ: number,
    roadWidth: number,
  ): void {
    const dz = Math.max(worldZ - camZ, NEAR_Z)
    const scale = CAMERA_DEPTH / dz
    out.scale = scale
    out.screenX = this.width / 2 + (scale * (worldX - camX) * this.width) / 2
    out.screenY = this.height / 2 - (scale * (worldY - camY) * this.height) / 2
    out.screenW = (scale * roadWidth * this.width) / 2
  }

  private artFor(level: LevelDef): ArtLibrary {
    if (!this.art || this.artLevel !== level.id) {
      this.art = new ArtLibrary(level, 20260726)
      this.artLevel = level.id
      this.trail.length = 0
      this.flakes.length = 0
    }
    return this.art
  }

  /** Records where the craft touched the surface, for the carve-trail ribbon. */
  private recordTrail(s: RenderState): void {
    const trail = this.trail
    const z = s.position + PLAYER_Z
    const last = trail.length > 0 ? trail[trail.length - 1] : null
    // A backwards jump means the run restarted or the attract loop wrapped.
    if (last && last.z > z + SEGMENT_LENGTH * 4) trail.length = 0
    trail.push({ z, x: s.playerX, carve: s.carve, gap: s.airborne })
    if (trail.length > 140) trail.shift()
  }

  render(previous: GameSnapshot, current: GameSnapshot, alpha: number): void {
    const s = interpolateRenderState(previous, current, alpha)
    const track = current.track
    const level = current.level
    const art = this.artFor(level)
    const ctx = this.ctx
    const { width, height } = this
    const pal = level.palette

    this.weather = WEATHER[level.id] ?? null
    this.recordTrail(s)

    const baseSegment = Math.floor(s.position / SEGMENT_LENGTH) % track.segments.length
    const segments = track.segments
    const camZ = s.position
    const currentSegment = segments[baseSegment]
    const next = segments[Math.min(baseSegment + 1, segments.length - 1)]
    const segT = (s.position % SEGMENT_LENGTH) / SEGMENT_LENGTH
    const groundY = lerp(currentSegment.y, next.y, segT)
    // Landing compresses the camera toward the snow for a beat; high speed adds
    // a faint rumble bob. Both come free from the interpolated sim state.
    const camH =
      CAMERA_HEIGHT * (1 - s.landingImpact * 0.15) +
      Math.sin(s.time * 19) * 2.4 * s.speed01
    const camY = groundY + camH + s.playerY * 0.7
    // Camera trails the player laterally, which makes turns read as turns.
    const camX = s.playerX * 0.72

    ctx.save()
    if (s.shake > 0.1) {
      // Deterministic-ish shake driven by time, so it reads as a rumble.
      ctx.translate(
        Math.sin(s.time * 71) * s.shake,
        Math.cos(s.time * 63) * s.shake * 0.6,
      )
    }
    // The camera banks into the carve like a chase cam: the horizon tilts
    // against the lean. All world fills below overdraw the viewport edges so
    // the rotation never exposes a corner.
    const roll = clamp(
      -s.lean * 0.3 - currentSegment.curve * s.speed01 * 0.03,
      -0.085,
      0.085,
    )
    if (Math.abs(roll) > 0.002) {
      ctx.translate(width / 2, height / 2)
      ctx.rotate(roll)
      ctx.scale(1.02, 1.02)
      ctx.translate(-width / 2, -height / 2)
    }

    // --- Horizon position drives sky and parallax. --------------------------
    const probe: Projected = { screenX: 0, screenY: 0, screenW: 0, scale: 0 }
    this.project(probe, 0, groundY, camZ + SEGMENT_LENGTH * DRAW_DISTANCE, camX, camY, camZ, 1)
    const horizon = clamp(probe.screenY, height * 0.12, height * 0.72)

    this.drawSky(pal, horizon, s, art)
    this.drawBackdrop(art, horizon, camX, s)
    this.drawGroundBase(pal, horizon)

    // --- Track ribbon, far to near. -----------------------------------------
    // First pass forward to accumulate curve, then draw in reverse so nearer
    // quads paint over farther ones.
    const count = Math.min(DRAW_DISTANCE, segments.length - baseSegment - 1)
    const projA: Projected[] = []
    // `x` is the road centre's offset *relative to the player's segment*, built
    // by integrating curve twice (curve is a per-segment delta of `dx`). It
    // always starts at 0 here, which is what keeps the ribbon under the player
    // no matter how far down the track we are.
    let x = 0
    let dx = 0
    for (let i = 0; i <= count; i++) {
      const seg = segments[baseSegment + i]
      const p: Projected = { screenX: 0, screenY: 0, screenW: 0, scale: 0 }
      this.project(p, x, seg.y, seg.z, camX, camY, camZ, seg.width)
      projA.push(p)
      dx += seg.curve
      x += dx
    }

    // Road visibility: near to far. `maxY` is the highest point on screen
    // already covered; a farther segment is only visible if it projects above
    // that, which is exactly what hides segments tucked behind a hill.
    const visible = this.visible
    visible.length = count
    let maxY = height * 1.3
    for (let i = 0; i < count; i++) {
      const p2 = projA[i + 1]
      if (!p2 || p2.screenY >= maxY) {
        visible[i] = false
        continue
      }
      visible[i] = true
      maxY = p2.screenY
    }

    // The ribbon is drawn in layer passes — all verges, then rumbles, then
    // lanes — rather than segment-by-segment. Per-segment stacks bleed their
    // verge colour one anti-aliased pixel over the lane of the segment in
    // front, ruling a hairline across the road at every boundary; per-layer
    // passes only ever overlap a colour onto itself.
    this.drawRibbonLayer(segments, baseSegment, projA, count, pal, level, s, 'verge')
    this.drawRibbonLayer(segments, baseSegment, projA, count, pal, level, s, 'rumble')
    this.drawRibbonLayer(segments, baseSegment, projA, count, pal, level, s, 'lane')

    if (GROOMED.has(level.id)) {
      this.drawCorduroy(projA, count)
      this.drawPowderDapples(s, horizon)
      this.drawSparkle(s, horizon)
    }
    this.drawSunTint(horizon)

    // Atmospheric depth in one pass rather than per-quad: the far end of the
    // ribbon and the verges fade into the same haze the mountains sit in.
    this.drawHaze(pal, horizon)

    this.drawTrail(track, level.id, s, camX, camY, camZ)

    // --- Sprites and player, near-last so depth reads correctly. ------------
    for (let i = count - 1; i >= 0; i--) {
      const seg = segments[baseSegment + i]
      const p = projA[i]
      if (p.screenY < horizon - 2) continue
      const fade = clamp(1 - i / (count * 0.82), 0, 1)
      for (const prop of seg.scenery) {
        this.drawScenery(art, prop, p, fade)
      }
      if (seg.ramp) this.drawRamp(art, seg, p, fade)
      for (const prop of seg.obstacles) {
        if (prop.spent) continue
        this.drawObstacle(art, prop, p, seg, fade)
      }
      for (const coin of seg.coins) {
        if (coin.spent) continue
        this.drawCoin(art, coin, p, s)
      }
      // The player sits at segment 0 of the projection.
      if (i === 0) this.drawPlayer(art, level, s)
    }

    this.drawParticles()
    ctx.restore()

    this.drawWeather()
    this.drawSpeedLines(s, horizon)
    if (s.hurt > 0.01) {
      ctx.fillStyle = `rgba(255,60,60,${s.hurt * 0.35})`
      ctx.fillRect(0, 0, width, height)
    }
    this.drawVignette()
  }

  private drawSky(pal: Palette, horizon: number, s: RenderState, art: ArtLibrary): void {
    const ctx = this.ctx
    const { width, height } = this
    // The gradient stack (sky, bloom, sun) only depends on the horizon line,
    // which moves smoothly with the hills. Quantized to 4px buckets and cached
    // into an offscreen layer, the per-frame cost collapses to one drawImage —
    // and the 4px steps are invisible behind the mountain silhouettes.
    const bucket = Math.round(horizon / 4) * 4
    const key = `${bucket}:${pal.skyTop}:${width}x${height}`
    if (!this.sky || this.skyKey !== key) {
      const overW = Math.max(Math.round(width * 1.5), 1)
      const overH = Math.max(Math.round(bucket + height * 0.21), 1)
      if (!this.sky || this.sky.width !== overW) {
        this.sky = document.createElement('canvas')
        this.sky.width = overW
      }
      // Tall enough for the deepest horizon bucket; cheap to over-allocate.
      this.sky.height = Math.max(this.sky.height, overH)
      const sctx = this.sky.getContext('2d')
      if (sctx) {
        // Layer x=0 maps to screen -0.25*width; y=0 maps to -0.2*height.
        const g = sctx.createLinearGradient(0, 0, 0, height * 0.2 + bucket)
        g.addColorStop(0, pal.skyTop)
        g.addColorStop(0.62, lerpHex(pal.skyTop, pal.skyBottom, 0.7))
        g.addColorStop(1, pal.skyBottom)
        sctx.fillStyle = g
        sctx.fillRect(0, 0, overW, height * 0.2 + bucket + 1)

        // Sun with a soft bloom, parked slightly off-centre.
        const sunX = width * 0.25 + width * 0.68
        const sunY = height * 0.2 + bucket - height * 0.2
        const r = Math.min(width, height) * 0.062
        const glow = sctx.createRadialGradient(sunX, sunY, r * 0.3, sunX, sunY, r * 5)
        glow.addColorStop(0, pal.sunGlow)
        glow.addColorStop(1, 'rgba(0,0,0,0)')
        sctx.fillStyle = glow
        sctx.fillRect(0, 0, overW, height * 0.2 + bucket + 1)
        sctx.fillStyle = pal.sun
        sctx.beginPath()
        sctx.arc(sunX, sunY, r, 0, Math.PI * 2)
        sctx.fill()
        this.skyKey = key
      }
    }
    const stackH = height * 0.2 + bucket + 1
    ctx.drawImage(
      this.sky,
      0,
      0,
      this.sky.width,
      stackH,
      -width * 0.25,
      -height * 0.2,
      this.sky.width,
      stackH,
    )

    // Painted clouds, drifting at their own rates.
    ctx.globalAlpha = 0.9
    art.backdrop.clouds.forEach((cloud, i) => {
      const drawH = height * (0.055 + i * 0.012)
      const drawW = drawH * (cloud.width / cloud.height)
      const span = width + drawW * 2
      const cx = ((s.time * (9 + i * 6) + i * 640) % span) - drawW
      const cy = horizon - height * (0.3 + i * 0.075)
      ctx.drawImage(cloud.image, cx, cy - drawH / 2, drawW, drawH)
    })
    ctx.globalAlpha = 1
  }

  /** Painted mountain ranges and treeline, tiled and parallaxed at the horizon. */
  private drawBackdrop(
    art: ArtLibrary,
    horizon: number,
    camX: number,
    s: RenderState,
  ): void {
    const ctx = this.ctx
    const { width, height } = this
    for (const layer of art.backdrop.layers) {
      const drawH = height * layer.height
      const drawW = drawH * (STRIP_WIDTH / layer.sprite.height)
      const shift = -camX * layer.rate - s.position * layer.rate * 0.014
      // Modulo into the strip so the tiling never accumulates float error.
      let startX = shift % drawW
      if (startX > 0) startX -= drawW
      const top = horizon + 2 - drawH
      for (let px = startX - drawW; px < width * 1.25; px += drawW) {
        ctx.drawImage(layer.sprite.image, px, top, drawW + 1, drawH)
      }
    }
  }

  private drawGroundBase(pal: Palette, horizon: number): void {
    const ctx = this.ctx
    const { width, height } = this
    const g = ctx.createLinearGradient(0, horizon, 0, height)
    g.addColorStop(0, pal.fog)
    g.addColorStop(0.22, pal.groundA)
    g.addColorStop(1, pal.groundB)
    ctx.fillStyle = g
    ctx.fillRect(-width * 0.25, horizon, width * 1.5, height - horizon + height * 0.25)
  }

  /**
   * One directional light across the whole ground plane: the sun side of the
   * frame runs faintly warm, the far side faintly cool. Sells the One Sun rule
   * for the cost of two translucent rects.
   */
  private drawSunTint(horizon: number): void {
    const ctx = this.ctx
    const { width, height } = this
    const g = ctx.createLinearGradient(-width * 0.25, 0, width * 1.25, 0)
    g.addColorStop(0, 'rgba(64,96,158,0.10)')
    g.addColorStop(0.5, 'rgba(64,96,158,0)')
    g.addColorStop(0.72, 'rgba(255,240,205,0)')
    g.addColorStop(1, 'rgba(255,240,205,0.09)')
    ctx.fillStyle = g
    ctx.fillRect(-width * 0.25, horizon, width * 1.5, height - horizon + height * 0.25)
  }

  /** Single haze band from the horizon down — cheaper and softer than per-quad. */
  private drawHaze(pal: Palette, horizon: number): void {
    const ctx = this.ctx
    const depth = Math.max(this.height - horizon, 1)
    // Straddles the horizon so the ranges dissolve into the same haze the piste
    // fades into — without it, the backdrop's base edge reads as a hard seam.
    const top = horizon - depth * 0.1
    const band = depth * 0.5
    const g = ctx.createLinearGradient(0, top, 0, top + band)
    g.addColorStop(0, withAlpha(pal.fog, 0))
    g.addColorStop(0.2, withAlpha(pal.fog, 0.92))
    g.addColorStop(0.48, withAlpha(pal.fog, 0.5))
    g.addColorStop(1, withAlpha(pal.fog, 0))
    ctx.fillStyle = g
    ctx.fillRect(-this.width * 0.25, top, this.width * 1.5, band)
  }

  private quad(
    x1: number,
    y1: number,
    w1: number,
    x2: number,
    y2: number,
    w2: number,
    color: string | CanvasGradient,
  ): void {
    const ctx = this.ctx
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x1 - w1, y1)
    ctx.lineTo(x2 - w2, y2)
    ctx.lineTo(x2 + w2, y2)
    ctx.lineTo(x1 + w1, y1)
    ctx.closePath()
    ctx.fill()
  }

  private drawRibbonLayer(
    segments: Segment[],
    baseSegment: number,
    projA: Projected[],
    count: number,
    pal: Palette,
    level: LevelDef,
    s: RenderState,
    layer: 'verge' | 'rumble' | 'lane',
  ): void {
    const visible = this.visible
    for (let i = 0; i < count; i++) {
      if (!visible[i]) continue
      const seg = segments[baseSegment + i]
      const p1 = projA[i]
      const p2 = projA[i + 1]
      // Water levels shimmer by phase-shifting the band pattern over time.
      const dark = level.water
        ? Math.floor(seg.index / 3 + s.time * 3.2) % 2 === 0
        : seg.dark
      // Near edge dropped a pixel so quads within a pass overlap; where the
      // colour repeats this hides anti-aliased seams entirely, and where a
      // band alternates the boundary is a hard edge anyway.
      const y1 = p1.screenY + 1

      if (layer === 'verge') {
        const ground = dark ? pal.groundA : pal.groundB
        this.quad(this.width / 2, y1, this.width * 2, this.width / 2, p2.screenY, this.width * 2, ground)
      } else if (layer === 'rumble') {
        const rumble = dark ? pal.rumbleA : pal.rumbleB
        this.quad(p1.screenX, y1, p1.screenW * 1.1, p2.screenX, p2.screenY, p2.screenW * 1.1, rumble)
      } else {
        const lane = dark ? pal.laneA : pal.laneB
        this.quad(p1.screenX, y1, p1.screenW, p2.screenX, p2.screenY, p2.screenW, lane)
        if (pal.centerLine && dark && p1.screenW > 6) {
          const w1 = Math.max(p1.screenW * 0.012, 0.6)
          const w2 = Math.max(p2.screenW * 0.012, 0.4)
          this.quad(p1.screenX, y1, w1, p2.screenX, p2.screenY, w2, pal.centerLine)
        }
      }
    }
  }

  /**
   * Corduroy grooming across the entire visible field, drawn as continuous
   * polylines that follow the projected curve of the run. Continuity is the
   * point: per-segment strokes leave horizontal seams that read as graph paper,
   * while unbroken lines sweeping into a bend read as a groomed mountain. The
   * lines stop where the haze band takes over, exactly like real corduroy
   * dissolving into distance.
   */
  private drawCorduroy(projA: Projected[], count: number): void {
    const ctx = this.ctx
    const visible = this.visible
    // World-space lane offsets in units of the run's half-width. ±1 is the
    // piste edge; the field beyond is groomed too, just like the reference.
    ctx.lineWidth = Math.max(Math.min(projA[0].screenW * 0.003, 1.2), 0.6)
    for (let lane = -22; lane <= 22; lane++) {
      const m = lane * 0.09
      const onPiste = Math.abs(m) <= 1
      ctx.strokeStyle = onPiste ? 'rgba(163,193,227,0.28)' : 'rgba(148,178,214,0.2)'
      ctx.beginPath()
      let drawing = false
      for (let i = 0; i < count; ) {
        const p = projA[i]
        // Fade out where segments get thin — haze owns the far field.
        if (p.screenW < 26) break
        if (!visible[i]) {
          drawing = false
          i++
          continue
        }
        const px = p.screenX + m * p.screenW
        if (drawing) ctx.lineTo(px, p.screenY)
        else ctx.moveTo(px, p.screenY)
        drawing = true
        // The polyline is near-straight in screen space, so distant vertices
        // add cost without adding shape: sample every segment up close, every
        // fourth far away. Roughly quarters the vertex count.
        i += i < 20 ? 1 : i < 60 ? 2 : 4
      }
      ctx.stroke()
    }
  }

  /**
   * Soft wind-blown undulations in the snow either side of the corduroy: wide,
   * very faint ellipses that stream toward the camera with the surface. They
   * break up the mathematical flatness of the ground plane the way drifts do.
   */
  private drawPowderDapples(s: RenderState, horizon: number): void {
    const ctx = this.ctx
    const { width, height } = this
    const band = height - horizon
    for (let i = 0; i < 14; i++) {
      const cell = Math.floor(s.position / 2400) + i * 131
      const g = ((cell * 2654435761) >>> 0) % 100000
      const yT = (((s.position / 2400) % 1) + (g % 977) / 977) % 1
      const y = horizon + band * (0.2 + yT * 0.8)
      const x = width * ((g % 733) / 733)
      const rx = width * (0.02 + yT * 0.1) * (0.7 + (g % 7) / 10)
      const bright = g % 2 === 0
      ctx.fillStyle = bright ? 'rgba(255,255,255,0.32)' : 'rgba(148,178,214,0.14)'
      ctx.globalAlpha = 0.2 + yT * 0.4
      ctx.beginPath()
      ctx.ellipse(x, y, rx, rx * 0.22, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  /**
   * Sun glinting off the groomed surface: a handful of tiny bright points that
   * pop in and out as the world scrolls under them. Positions are hashed from
   * the scroll offset so each sparkle stays glued to "its" patch of snow, and
   * each one twinkles on its own clock.
   */
  private drawSparkle(s: RenderState, horizon: number): void {
    const ctx = this.ctx
    const { width, height } = this
    const band = height - horizon
    ctx.fillStyle = '#ffffff'
    for (let i = 0; i < 26; i++) {
      // A stable id per patch of world the sparkle belongs to.
      const cell = Math.floor(s.position / 900) + i * 61
      const g = ((cell * 2654435761) >>> 0) % 100000
      const tw = 0.5 + 0.5 * Math.sin(s.time * (2 + (g % 5)) + g)
      if (tw < 0.55) continue
      // Screen-space placement: y advances with scroll so glints stream toward
      // the camera like the surface they sit on.
      const yT = (((s.position / 900) % 1) + (g % 977) / 977) % 1
      const y = horizon + band * (0.15 + yT * 0.85)
      const x = width * ((g % 733) / 733)
      const size = (0.5 + yT * 1.6) * (0.6 + tw * 0.5)
      ctx.globalAlpha = (tw - 0.55) * 2 * (0.3 + yT * 0.7)
      ctx.beginPath()
      ctx.arc(x, y, size, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  /**
   * The mark the craft leaves on the surface, rebuilt each frame from the
   * recorded contact history. Only the stretch between the near plane and the
   * player is in front of the camera, which is exactly the short S of carved
   * groove visible under and behind the board.
   */
  private drawTrail(
    track: Track,
    levelId: LevelId,
    s: RenderState,
    camX: number,
    camY: number,
    camZ: number,
  ): void {
    const style = TRAILS[levelId]
    if (!style || this.trail.length < 2) return
    const ctx = this.ctx
    const segments = track.segments
    const halfWorld = 190

    // Project every visible sample once, newest first.
    const pts: { x: number; y: number; half: number; carve: number; gap: boolean }[] = []
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const sample = this.trail[i]
      const dz = sample.z - camZ
      if (dz <= SEGMENT_LENGTH * 1.15) break
      const segIndex = clamp(Math.floor(sample.z / SEGMENT_LENGTH), 0, segments.length - 1)
      const scale = CAMERA_DEPTH / dz
      const worldY = segments[segIndex].y
      const age = pts.length / 24
      pts.push({
        x: this.width / 2 + (scale * (sample.x - camX) * this.width) / 2,
        y: this.height / 2 - (scale * (worldY - camY) * this.height) / 2,
        half: scale * halfWorld * (this.width / 2) * (1 + age * style.widen) * 0.5,
        carve: sample.carve,
        gap: sample.gap,
      })
    }
    if (pts.length < 2) return

    // Anchor the head of the ribbon to where the player is actually drawn, so
    // the groove emerges from under the board rather than beside it.
    if (!s.airborne) {
      pts[0].x = this.width / 2 + s.playerX * 0.06
      pts[0].y = this.height * PLAYER_SCREEN_Y + this.height * 0.005
    }

    ctx.fillStyle = style.fill
    let start = 0
    while (start < pts.length - 1) {
      // Split the ribbon at gaps (airborne) and — for skid styles — wherever
      // the craft wasn't carving hard enough to scrub.
      let end = start
      while (
        end < pts.length - 1 &&
        !pts[end + 1].gap &&
        (!style.skid || Math.abs(pts[end + 1].carve) > 0.32)
      ) {
        end++
      }
      if (end > start) {
        ctx.beginPath()
        ctx.moveTo(pts[start].x - pts[start].half, pts[start].y)
        for (let i = start + 1; i <= end; i++) ctx.lineTo(pts[i].x - pts[i].half, pts[i].y)
        for (let i = end; i >= start; i--) ctx.lineTo(pts[i].x + pts[i].half, pts[i].y)
        ctx.closePath()
        ctx.fill()
        if (style.core) {
          ctx.strokeStyle = style.core
          ctx.lineWidth = Math.max(pts[start].half * 0.5, 1)
          ctx.beginPath()
          ctx.moveTo(pts[start].x, pts[start].y)
          for (let i = start + 1; i <= end; i++) ctx.lineTo(pts[i].x, pts[i].y)
          ctx.stroke()
        }
      }
      start = end + 1
      // Skip past the sample that broke the run.
      while (start < pts.length && (pts[start].gap || (style.skid && Math.abs(pts[start].carve) <= 0.32))) {
        start++
      }
    }
  }

  /**
   * Props are positioned in the same world space as the road centre, so their
   * screen x is the segment's projected centre plus their own scaled offset.
   */
  private propX(prop: { x: number }, p: Projected): number {
    return p.screenX + prop.x * p.scale * (this.width / 2)
  }

  /** Blits a ground-anchored sprite at a given screen height. */
  private blit(sprite: Sprite, x: number, groundY: number, drawH: number, alpha: number): void {
    if (drawH < 1.5) return
    const drawW = drawH * (sprite.width / sprite.height)
    if (x < -drawW || x > this.width + drawW) return
    const ctx = this.ctx
    ctx.globalAlpha = alpha
    ctx.drawImage(
      sprite.image,
      x - drawW * (sprite.anchorX / sprite.width),
      groundY - drawH * (sprite.anchorY / sprite.height),
      drawW,
      drawH,
    )
    ctx.globalAlpha = 1
  }

  private drawScenery(
    art: ArtLibrary,
    prop: { x: number; scale: number; kind: SceneryKind | ObstacleKind },
    p: Projected,
    fade: number,
  ): void {
    if (p.screenW < 0.8) return
    const kind = prop.kind as SceneryKind
    const sprite = art.sceneryFor(kind, prop.scale)
    if (!sprite) return
    const drawH = Math.min(
      p.screenW * SCENERY_HEIGHT[kind] * prop.scale,
      this.height * 0.85,
    )
    this.blit(sprite, this.propX(prop, p), p.screenY, drawH, clamp(0.25 + fade * 1.15, 0, 1))
  }

  private drawObstacle(
    art: ArtLibrary,
    prop: { x: number; scale: number; kind: SceneryKind | ObstacleKind },
    p: Projected,
    seg: Segment,
    fade: number,
  ): void {
    const kind = prop.kind as ObstacleKind
    const sprite = art.obstacleFor(kind, prop.scale)
    if (!sprite) return
    // Sized by world width so the painted hazard matches the collision box.
    // Capped near the camera: the projection is only valid down to the near
    // plane, and past that a cone would grow taller than the mountains.
    const worldWidth = OBSTACLE_WIDTH[kind] * prop.scale
    const drawW = Math.min((worldWidth / seg.width) * p.screenW, this.width * 0.42)
    const drawH = drawW * (sprite.height / sprite.width)
    this.blit(sprite, this.propX(prop, p), p.screenY, drawH, clamp(0.35 + fade * 1.2, 0, 1))
  }

  private drawRamp(art: ArtLibrary, seg: Segment, p: Projected, fade: number): void {
    const ramp = seg.ramp
    if (!ramp || p.screenW < 2) return
    // A ramp right under the camera projects to many screen-widths across and
    // would blanket the frame, so stop drawing it once we're basically on it,
    // and cap its width the same way obstacles are capped near the camera.
    if (p.screenW > this.width * 1.2) return
    const cx = p.screenX + (ramp.x / seg.width) * p.screenW
    const drawW = Math.min((ramp.width / seg.width) * p.screenW * 2, this.width * 0.55)
    const drawH = drawW * (art.ramp.height / art.ramp.width)
    this.blit(art.ramp, cx, p.screenY, drawH, clamp(0.4 + fade * 1.2, 0, 1))
  }

  private drawCoin(
    art: ArtLibrary,
    coin: { x: number; scale: number },
    p: Projected,
    s: RenderState,
  ): void {
    const x = this.propX(coin, p)
    // Capped: a coin at the near plane would otherwise fill the screen.
    const size = Math.min(p.screenW * 0.1, this.height * 0.07)
    if (size < 1.5) return
    const bobY = p.screenY - size * 1.1 + Math.sin(s.time * 4 + coin.x * 0.01) * size * 0.16
    // Spin by squashing the horizontal radius.
    const spin = Math.max(Math.abs(Math.cos(s.time * 3.4 + coin.x * 0.008)), 0.14)
    const ctx = this.ctx
    ctx.drawImage(art.coin.image, x - (size * spin) / 2, bobY - size / 2, size * spin, size)
  }

  private drawPlayer(art: ArtLibrary, level: LevelDef, s: RenderState): void {
    const ctx = this.ctx
    const { width, height } = this
    const baseY = height * PLAYER_SCREEN_Y
    // Airborne height maps to screen offset; the shadow stays on the ground.
    const lift = (s.playerY / 1000) * height * 0.16
    const cx = width / 2 + s.playerX * 0.06
    const cy = baseY - lift
    const drawH = Math.min(width, height) * 0.3
    const bob = Math.sin(s.time * 5.5) * s.speed01 * level.physics.bob * drawH * 0.05

    // Ground shadow shrinks with altitude.
    const shadowScale = clamp(1 - s.playerY / 1400, 0.25, 1)
    const shadow = ctx.createRadialGradient(
      cx,
      baseY,
      0,
      cx,
      baseY,
      drawH * 0.42 * shadowScale,
    )
    shadow.addColorStop(0, `rgba(28,52,92,${0.4 * shadowScale})`)
    shadow.addColorStop(1, 'rgba(28,52,92,0)')
    ctx.fillStyle = shadow
    ctx.beginPath()
    ctx.ellipse(cx, baseY, drawH * 0.42 * shadowScale, drawH * 0.12 * shadowScale, 0, 0, Math.PI * 2)
    ctx.fill()

    const frames = art.actor
    const pose = s.airborne
      ? { sprite: frames.air, residual: 0 }
      : selectLeanFrame(frames, s.lean / Math.max(level.physics.lean, 0.001))
    const sprite = pose.sprite
    const drawW = drawH * (sprite.width / sprite.height)

    ctx.save()
    ctx.translate(cx, cy + bob)
    // Landing squash: the craft compresses into the surface and rebounds.
    if (s.landingImpact > 0.01) {
      ctx.scale(1 + s.landingImpact * 0.12, 1 - s.landingImpact * 0.16)
    }
    // Baked poses carry the lean; only the leftover and any spin get rotated.
    ctx.rotate(pose.residual * level.physics.lean + s.spin)
    ctx.drawImage(
      sprite.image,
      -drawW * (sprite.anchorX / sprite.width),
      -drawH * (sprite.anchorY / sprite.height),
      drawW,
      drawH,
    )
    ctx.restore()
  }

  private drawParticles(): void {
    const ctx = this.ctx
    for (const p of this.particles) {
      const a = clamp(p.life / p.maxLife, 0, 1)
      ctx.globalAlpha = a * 0.85
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size * (0.35 + a * 0.75), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  /** Ambient falling snow, layered by pseudo-depth. Drawn over the world. */
  private drawWeather(): void {
    const config = this.weather
    if (!config || this.flakes.length === 0) return
    const ctx = this.ctx
    for (const flake of this.flakes) {
      ctx.globalAlpha = 0.22 + flake.depth * 0.42
      ctx.fillStyle = `rgb(${config.color})`
      ctx.beginPath()
      ctx.arc(flake.x, flake.y, 0.8 + flake.depth * 2.4, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  /** Radial speed streaks at the screen edges — the classic "going fast" tell. */
  private drawSpeedLines(s: RenderState, horizon: number): void {
    if (s.speed01 < 0.55) return
    const ctx = this.ctx
    const intensity = (s.speed01 - 0.55) / 0.45
    const cx = this.width / 2
    const cy = horizon
    ctx.strokeStyle = `rgba(255,255,255,${0.12 * intensity})`
    ctx.lineWidth = 2
    const count = 14
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + s.time * 0.7
      const inner = this.width * 0.34
      const outer = inner + this.width * (0.12 + intensity * 0.2)
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner * 0.7)
      ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer * 0.7)
      ctx.stroke()
    }
  }

  dispose(): void {
    this.particles.length = 0
    this.flakes.length = 0
    this.trail.length = 0
    this.weather = null
    this.vignette = null
    this.art = null
    this.artLevel = null
  }

  private drawVignette(): void {
    if (!this.vignette) {
      const layer = document.createElement('canvas')
      layer.width = Math.max(this.width, 1)
      layer.height = Math.max(this.height, 1)
      const lctx = layer.getContext('2d')
      if (!lctx) return
      const g = lctx.createRadialGradient(
        this.width / 2,
        this.height / 2,
        Math.min(this.width, this.height) * 0.42,
        this.width / 2,
        this.height / 2,
        Math.max(this.width, this.height) * 0.78,
      )
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(1, 'rgba(12,24,46,0.34)')
      lctx.fillStyle = g
      lctx.fillRect(0, 0, layer.width, layer.height)
      this.vignette = layer
    }
    this.ctx.drawImage(this.vignette, 0, 0, this.width, this.height)
  }
}

/** Local colour helpers — the art module's versions are for painting, not fills. */
function lerpHex(a: string, b: string, t: number): string {
  const pa = hexParts(a)
  const pb = hexParts(b)
  return `rgb(${Math.round(pa[0] + (pb[0] - pa[0]) * t)},${Math.round(
    pa[1] + (pb[1] - pa[1]) * t,
  )},${Math.round(pa[2] + (pb[2] - pa[2]) * t)})`
}

function withAlpha(color: string, alpha: number): string {
  const [r, g, b] = hexParts(color)
  return `rgba(${r},${g},${b},${alpha})`
}

function hexParts(value: string): [number, number, number] {
  const hex = value.replace('#', '')
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ]
}
