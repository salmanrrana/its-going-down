import { clamp, lerp } from '../core/math'
import { ArtLibrary, selectLeanFrame, STRIP_WIDTH, type Sprite } from '../art'
import type { GameSnapshot, GameView, SprayEffect } from './contracts'
import { interpolateRenderState, type RenderState } from './render-state'
import { DRAW_DISTANCE, SEGMENT_LENGTH, type Segment } from './track'
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
 * blitted here. Per-frame drawing is limited to the ribbon itself, which is what
 * lets the scene be genuinely illustrated without costing anything on a phone.
 */

const CAMERA_DEPTH = 0.84
const CAMERA_HEIGHT = 1500
/**
 * Near plane. Without this, segments approaching the camera divide by a tiny
 * dz and explode to many screen-widths across, swamping the frame.
 */
const NEAR_Z = SEGMENT_LENGTH * 1.5

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

/** Levels whose surface is groomed and shows longitudinal corduroy. */
const CORDUROY: ReadonlySet<LevelId> = new Set<LevelId>(['snowboard'])

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

export class Renderer implements GameView {
  private ctx: CanvasRenderingContext2D
  private width = 0
  private height = 0
  private dpr = 1
  private particles: Particle[] = []
  private art: ArtLibrary | null = null
  private artLevel: LevelId | null = null

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
    const baseY = this.height * 0.83 - (effect.playerY / 1000) * this.height * 0.16
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
    }
    return this.art
  }

  render(previous: GameSnapshot, current: GameSnapshot, alpha: number): void {
    const s = interpolateRenderState(previous, current, alpha)
    const track = current.track
    const level = current.level
    const art = this.artFor(level)
    const ctx = this.ctx
    const { width, height } = this
    const pal = level.palette

    ctx.save()
    if (s.shake > 0.1) {
      // Deterministic-ish shake driven by time, so it reads as a rumble.
      ctx.translate(
        Math.sin(s.time * 71) * s.shake,
        Math.cos(s.time * 63) * s.shake * 0.6,
      )
    }

    const baseSegment = Math.floor(s.position / SEGMENT_LENGTH) % track.segments.length
    const segments = track.segments
    const camZ = s.position
    const currentSegment = segments[baseSegment]
    const next = segments[Math.min(baseSegment + 1, segments.length - 1)]
    const segT = (s.position % SEGMENT_LENGTH) / SEGMENT_LENGTH
    const groundY = lerp(currentSegment.y, next.y, segT)
    const camY = groundY + CAMERA_HEIGHT + s.playerY * 0.7
    // Camera trails the player laterally, which makes turns read as turns.
    const camX = s.playerX * 0.72

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

    // Road: near to far. `maxY` is the highest point on screen already covered;
    // a farther segment is only visible if it projects above that, which is
    // exactly what hides segments tucked behind an intervening hill.
    const groomed = CORDUROY.has(level.id)
    let maxY = height
    for (let i = 0; i < count; i++) {
      const seg = segments[baseSegment + i]
      const p1 = projA[i]
      const p2 = projA[i + 1]
      if (!p2) continue
      if (p2.screenY >= maxY) continue
      this.drawSegment(seg, p1, p2, pal, level, s, groomed)
      maxY = p2.screenY
    }

    // Atmospheric depth in one pass rather than per-quad: the far end of the
    // ribbon and the verges fade into the same haze the mountains sit in.
    this.drawHaze(pal, horizon)

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

    this.drawSpeedLines(s, horizon)
    if (s.hurt > 0.01) {
      ctx.fillStyle = `rgba(255,60,60,${s.hurt * 0.35})`
      ctx.fillRect(0, 0, width, height)
    }
    this.drawVignette()
  }

  private drawSky(pal: Palette, horizon: number, s: RenderState, art: ArtLibrary): void {
    const ctx = this.ctx
    const g = ctx.createLinearGradient(0, 0, 0, horizon)
    g.addColorStop(0, pal.skyTop)
    g.addColorStop(0.62, lerpHex(pal.skyTop, pal.skyBottom, 0.7))
    g.addColorStop(1, pal.skyBottom)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, this.width, horizon + 1)

    // Sun with a soft bloom, parked slightly off-centre.
    const sunX = this.width * 0.68
    const sunY = horizon - this.height * 0.2
    const r = Math.min(this.width, this.height) * 0.062
    const glow = ctx.createRadialGradient(sunX, sunY, r * 0.3, sunX, sunY, r * 5)
    glow.addColorStop(0, pal.sunGlow)
    glow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, this.width, horizon + 1)
    ctx.fillStyle = pal.sun
    ctx.beginPath()
    ctx.arc(sunX, sunY, r, 0, Math.PI * 2)
    ctx.fill()

    // Painted clouds, drifting at their own rates.
    ctx.globalAlpha = 0.9
    art.backdrop.clouds.forEach((cloud, i) => {
      const drawH = this.height * (0.055 + i * 0.012)
      const drawW = drawH * (cloud.width / cloud.height)
      const span = this.width + drawW * 2
      const cx = ((s.time * (9 + i * 6) + i * 640) % span) - drawW
      const cy = horizon - this.height * (0.3 + i * 0.075)
      ctx.drawImage(cloud.image, cx, cy - drawH / 2, drawW, drawH)
    })
    ctx.globalAlpha = 1
  }

  /** Painted mountain ranges, tiled and parallaxed against the horizon. */
  private drawBackdrop(
    art: ArtLibrary,
    horizon: number,
    camX: number,
    s: RenderState,
  ): void {
    const ctx = this.ctx
    art.backdrop.layers.forEach((layer, index) => {
      // Far ranges are drawn tallest: they are the ones that should feel like a
      // wall of alps behind the run, with nearer ridges stepping down in front.
      const drawH = this.height * (0.46 - index * 0.09)
      const drawW = drawH * (STRIP_WIDTH / layer.sprite.height)
      const shift = -camX * layer.rate - s.position * layer.rate * 0.014
      // Modulo into the strip so the tiling never accumulates float error.
      let startX = shift % drawW
      if (startX > 0) startX -= drawW
      const top = horizon + 2 - drawH
      for (let px = startX; px < this.width; px += drawW) {
        ctx.drawImage(layer.sprite.image, px, top, drawW + 1, drawH)
      }
    })
  }

  private drawGroundBase(pal: Palette, horizon: number): void {
    const ctx = this.ctx
    const g = ctx.createLinearGradient(0, horizon, 0, this.height)
    g.addColorStop(0, pal.fog)
    g.addColorStop(0.22, pal.groundA)
    g.addColorStop(1, pal.groundB)
    ctx.fillStyle = g
    ctx.fillRect(0, horizon, this.width, this.height - horizon)
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
    ctx.fillRect(0, top, this.width, band)
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

  private drawSegment(
    seg: Segment,
    p1: Projected,
    p2: Projected,
    pal: Palette,
    level: LevelDef,
    s: RenderState,
    groomed: boolean,
  ): void {
    const ctx = this.ctx
    // Water levels shimmer by phase-shifting the band pattern over time.
    const dark = level.water
      ? Math.floor(seg.index / 3 + s.time * 3.2) % 2 === 0
      : seg.dark

    const lane = dark ? pal.laneA : pal.laneB
    const ground = dark ? pal.groundA : pal.groundB
    const rumble = dark ? pal.rumbleA : pal.rumbleB

    // Verges: full-width bands behind the surface.
    this.quad(this.width / 2, p1.screenY, this.width * 2, this.width / 2, p2.screenY, this.width * 2, ground)

    // A soft shadow pooled against the run's edge seats the piste into the
    // terrain instead of leaving it floating on a flat field of colour.
    const shoulder1 = p1.screenW * 1.42
    const shoulder2 = p2.screenW * 1.42
    if (p1.screenW > 3) {
      this.quad(
        p1.screenX,
        p1.screenY,
        shoulder1,
        p2.screenX,
        p2.screenY,
        shoulder2,
        'rgba(52,96,152,0.16)',
      )
    }

    // Rumble strip is a slightly wider quad under the lane.
    this.quad(p1.screenX, p1.screenY, p1.screenW * 1.1, p2.screenX, p2.screenY, p2.screenW * 1.1, rumble)
    this.quad(p1.screenX, p1.screenY, p1.screenW, p2.screenX, p2.screenY, p2.screenW, lane)

    if (groomed && p1.screenW > 26) {
      // Corduroy: fine longitudinal grooming, the signature of a pisted run.
      // Faint and dense — on real snow it is a texture, not a set of lane lines.
      ctx.strokeStyle = 'rgba(158,192,226,0.34)'
      const lines = 30
      for (let i = 1; i < lines; i++) {
        const t = i / lines - 0.5
        ctx.lineWidth = Math.max(p1.screenW * 0.006, 0.7)
        ctx.beginPath()
        ctx.moveTo(p1.screenX + t * p1.screenW * 2, p1.screenY)
        ctx.lineTo(p2.screenX + t * p2.screenW * 2, p2.screenY)
        ctx.stroke()
      }
    }

    if (pal.centerLine && dark && p1.screenW > 6) {
      const w1 = Math.max(p1.screenW * 0.012, 0.6)
      const w2 = Math.max(p2.screenW * 0.012, 0.4)
      this.quad(p1.screenX, p1.screenY, w1, p2.screenX, p2.screenY, w2, pal.centerLine)
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
    // would blanket the frame, so stop drawing it once we're basically on it.
    if (p.screenW > this.width * 1.2) return
    const cx = p.screenX + (ramp.x / seg.width) * p.screenW
    const drawW = (ramp.width / seg.width) * p.screenW * 2
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
    const baseY = height * 0.83
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

  /** Radial speed streaks at the screen edges — the classic "going fast" tell. */
  private drawSpeedLines(s: RenderState, horizon: number): void {
    if (s.speed01 < 0.55) return
    const ctx = this.ctx
    const intensity = (s.speed01 - 0.55) / 0.45
    const cx = this.width / 2
    const cy = horizon
    ctx.strokeStyle = `rgba(255,255,255,${0.1 * intensity})`
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
    this.art = null
    this.artLevel = null
  }

  private drawVignette(): void {
    const ctx = this.ctx
    const g = ctx.createRadialGradient(
      this.width / 2,
      this.height / 2,
      Math.min(this.width, this.height) * 0.42,
      this.width / 2,
      this.height / 2,
      Math.max(this.width, this.height) * 0.78,
    )
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(12,24,46,0.34)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, this.width, this.height)
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
