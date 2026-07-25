import { clamp, lerp } from '../core/math'
import { DRAW_DISTANCE, SEGMENT_LENGTH, type Segment, type Track } from './track'
import type { LevelDef, ObstacleKind, Palette, SceneryKind } from './types'

/**
 * Pseudo-3D renderer in the classic segment-projection style: the track is a
 * ribbon of quads projected back-to-front, with sprites depth-sorted into the
 * same pass. It draws in flat fills and gradients, so it stays pin-sharp at any
 * device pixel ratio and costs almost nothing on a phone GPU.
 */

const CAMERA_DEPTH = 0.84
const CAMERA_HEIGHT = 1500
/** Player half-width in world units — the collision footprint. */
export const PLAYER_HALF_WIDTH = 250
/**
 * Near plane. Without this, segments approaching the camera divide by a tiny
 * dz and explode to many screen-widths across, swamping the frame.
 */
const NEAR_Z = SEGMENT_LENGTH * 1.5
/**
 * Sprite sizes are expressed as a fraction of the road's *half-width* in world
 * units, so they stay proportionate no matter how wide a level's run is.
 * A pine is roughly a tenth of the run's half-width at its trunk.
 */
const SCENERY_SIZE = 0.2
const OBSTACLE_SIZE = 0.15

interface Projected {
  screenX: number
  screenY: number
  screenW: number
  scale: number
}

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
}

export interface RenderState {
  /** Player's lateral offset in world units. */
  playerX: number
  /** Player's height above the surface. 0 when grounded. */
  playerY: number
  /** Distance travelled along the track. */
  position: number
  /** Current speed, world units/sec. */
  speed: number
  /** Normalized 0..1 speed, for effects. */
  speed01: number
  /** Lean angle in radians. */
  lean: number
  /** Rotation while airborne, radians. */
  spin: number
  /** Seconds since level start, for animated water and bob. */
  time: number
  /** 0..1 crash flash. */
  hurt: number
  /** Screen shake magnitude in pixels. */
  shake: number
  airborne: boolean
}

export class Renderer {
  private ctx: CanvasRenderingContext2D
  private width = 0
  private height = 0
  private dpr = 1
  particles: Particle[] = []

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

  spawnParticle(p: Particle): void {
    // Hard cap keeps a long run from ever accumulating cost.
    if (this.particles.length > 220) this.particles.shift()
    this.particles.push(p)
  }

  updateParticles(dt: number): void {
    const list = this.particles
    let write = 0
    for (let i = 0; i < list.length; i++) {
      const p = list[i]
      p.life -= dt
      if (p.life <= 0) continue
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 620 * dt
      p.vx *= 1 - 1.6 * dt
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

  render(track: Track, level: LevelDef, s: RenderState): void {
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
    const current = segments[baseSegment]
    const next = segments[Math.min(baseSegment + 1, segments.length - 1)]
    const segT = (s.position % SEGMENT_LENGTH) / SEGMENT_LENGTH
    const groundY = lerp(current.y, next.y, segT)
    const camY = groundY + CAMERA_HEIGHT + s.playerY * 0.7
    // Camera trails the player laterally, which makes turns read as turns.
    const camX = s.playerX * 0.72

    // --- Horizon position drives sky and parallax. --------------------------
    const probe: Projected = { screenX: 0, screenY: 0, screenW: 0, scale: 0 }
    this.project(probe, 0, groundY, camZ + SEGMENT_LENGTH * DRAW_DISTANCE, camX, camY, camZ, 1)
    const horizon = clamp(probe.screenY, height * 0.12, height * 0.72)

    this.drawSky(pal, horizon, s)
    this.drawRidges(pal, horizon, s, camX)
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
    let maxY = height
    for (let i = 0; i < count; i++) {
      const seg = segments[baseSegment + i]
      const p1 = projA[i]
      const p2 = projA[i + 1]
      if (!p2) continue
      if (p2.screenY >= maxY) continue
      this.drawSegment(seg, p1, p2, pal, level, s, horizon)
      maxY = p2.screenY
    }

    // --- Sprites and player, near-last so depth reads correctly. ------------
    maxY = height
    for (let i = count - 1; i >= 0; i--) {
      const seg = segments[baseSegment + i]
      const p = projA[i]
      if (p.screenY < horizon - 2) continue
      const fade = 1 - i / count
      for (const prop of seg.scenery) {
        this.drawScenery(prop.kind as SceneryKind, prop, p, pal, fade)
      }
      if (seg.ramp) this.drawRamp(seg, p, projA[i + 1] ?? p, pal)
      for (const prop of seg.obstacles) {
        if (prop.spent) continue
        this.drawObstacle(prop.kind as ObstacleKind, prop, p, fade)
      }
      for (const coin of seg.coins) {
        if (coin.spent) continue
        this.drawCoin(coin, p, s, pal)
      }
      // The player sits at segment 0 of the projection.
      if (i === 0) this.drawPlayer(level, s)
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

  private drawSky(pal: Palette, horizon: number, s: RenderState): void {
    const ctx = this.ctx
    const g = ctx.createLinearGradient(0, 0, 0, horizon)
    g.addColorStop(0, pal.skyTop)
    g.addColorStop(1, pal.skyBottom)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, this.width, horizon + 1)

    // Sun with a soft bloom, parked slightly off-centre.
    const sunX = this.width * 0.68
    const sunY = horizon - this.height * 0.16
    const r = Math.min(this.width, this.height) * 0.075
    const glow = ctx.createRadialGradient(sunX, sunY, r * 0.3, sunX, sunY, r * 4)
    glow.addColorStop(0, pal.sunGlow)
    glow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, this.width, horizon + 1)
    ctx.fillStyle = pal.sun
    ctx.beginPath()
    ctx.arc(sunX, sunY, r, 0, Math.PI * 2)
    ctx.fill()

    // Drifting cloud bands — cheap, and they sell the sense of motion.
    ctx.fillStyle = 'rgba(255,255,255,0.14)'
    for (let i = 0; i < 4; i++) {
      const y = horizon - this.height * (0.22 + i * 0.07)
      const speed = 12 + i * 7
      const w = this.width * (0.28 + i * 0.08)
      const cx = ((s.time * speed + i * 320) % (this.width + w * 2)) - w
      const h = this.height * 0.018
      ctx.beginPath()
      ctx.ellipse(cx, y, w * 0.5, h, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  private drawRidges(pal: Palette, horizon: number, s: RenderState, camX: number): void {
    const ctx = this.ctx
    // Two silhouette layers at different parallax rates.
    const layers = [
      { color: pal.ridgeFar, amp: 0.10, freq: 0.0016, rate: 0.02, offset: 0 },
      { color: pal.ridgeNear, amp: 0.065, freq: 0.0031, rate: 0.045, offset: 900 },
    ]
    for (const layer of layers) {
      const shift = -camX * layer.rate - s.position * layer.rate * 0.012 + layer.offset
      ctx.fillStyle = layer.color
      ctx.beginPath()
      ctx.moveTo(0, horizon + 2)
      const step = Math.max(8, this.width / 90)
      for (let px = 0; px <= this.width; px += step) {
        const t = (px + shift) * layer.freq
        const h =
          (Math.sin(t) * 0.6 + Math.sin(t * 2.3 + 1.7) * 0.3 + Math.sin(t * 4.1) * 0.1) *
          0.5 +
          0.5
        ctx.lineTo(px, horizon + 2 - h * this.height * layer.amp)
      }
      ctx.lineTo(this.width, horizon + 2)
      ctx.closePath()
      ctx.fill()
    }
  }

  private drawGroundBase(pal: Palette, horizon: number): void {
    const ctx = this.ctx
    const g = ctx.createLinearGradient(0, horizon, 0, this.height)
    g.addColorStop(0, pal.fog)
    g.addColorStop(0.28, pal.groundA)
    g.addColorStop(1, pal.groundB)
    ctx.fillStyle = g
    ctx.fillRect(0, horizon, this.width, this.height - horizon)
  }

  private quad(
    x1: number,
    y1: number,
    w1: number,
    x2: number,
    y2: number,
    w2: number,
    color: string,
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
    horizon: number,
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
    // Rumble strip is a slightly wider quad under the lane.
    const r1 = p1.screenW * 1.12
    const r2 = p2.screenW * 1.12
    this.quad(p1.screenX, p1.screenY, r1, p2.screenX, p2.screenY, r2, rumble)
    this.quad(p1.screenX, p1.screenY, p1.screenW, p2.screenX, p2.screenY, p2.screenW, lane)

    if (pal.centerLine && dark && p1.screenW > 6) {
      const w1 = Math.max(p1.screenW * 0.012, 0.6)
      const w2 = Math.max(p2.screenW * 0.012, 0.4)
      this.quad(p1.screenX, p1.screenY, w1, p2.screenX, p2.screenY, w2, pal.centerLine)
    }

    // Distance fog: fade the far end of the ribbon into the sky colour.
    const depth = (p1.screenY - horizon) / Math.max(this.height - horizon, 1)
    if (depth < 0.45) {
      const alpha = clamp(1 - depth / 0.45, 0, 1) * 0.92
      ctx.globalAlpha = alpha
      this.quad(
        this.width / 2,
        p1.screenY,
        this.width * 2,
        this.width / 2,
        p2.screenY,
        this.width * 2,
        pal.fog,
      )
      ctx.globalAlpha = 1
    }
  }

  private drawRamp(seg: Segment, p1: Projected, p2: Projected, pal: Palette): void {
    const ramp = seg.ramp
    if (!ramp || p1.screenW < 2) return
    // A ramp right under the camera projects to many screen-widths across and
    // would blanket the frame, so stop drawing it once we're basically on it.
    if (p1.screenW > this.width * 1.2) return
    const ctx = this.ctx
    const cx = p1.screenX + (ramp.x / seg.width) * p1.screenW
    const halfW = (ramp.width / seg.width) * p1.screenW
    const rise = Math.min(
      (p1.screenY - p2.screenY) * 3 + p1.screenW * 0.16,
      this.height * 0.3,
    )

    ctx.fillStyle = pal.accent
    ctx.beginPath()
    ctx.moveTo(cx - halfW, p1.screenY)
    ctx.lineTo(cx - halfW * 0.72, p1.screenY - rise)
    ctx.lineTo(cx + halfW * 0.72, p1.screenY - rise)
    ctx.lineTo(cx + halfW, p1.screenY)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = 'rgba(255,255,255,0.65)'
    ctx.fillRect(cx - halfW * 0.72, p1.screenY - rise, halfW * 1.44, Math.max(rise * 0.12, 1))

    // Chevrons pointing up the ramp face.
    ctx.strokeStyle = 'rgba(0,0,0,0.28)'
    ctx.lineWidth = Math.max(halfW * 0.06, 1)
    for (let i = 1; i <= 2; i++) {
      const t = i / 3
      const y = p1.screenY - rise * t
      const w = halfW * (1 - 0.28 * t)
      ctx.beginPath()
      ctx.moveTo(cx - w * 0.7, y + rise * 0.09)
      ctx.lineTo(cx, y - rise * 0.03)
      ctx.lineTo(cx + w * 0.7, y + rise * 0.09)
      ctx.stroke()
    }
  }

  /**
   * Props are positioned in the same world space as the road centre, so their
   * screen x is the segment's projected centre plus their own scaled offset.
   */
  private propX(prop: { x: number }, p: Projected): number {
    return p.screenX + prop.x * p.scale * (this.width / 2)
  }

  private drawScenery(
    kind: SceneryKind,
    prop: { x: number; scale: number },
    p: Projected,
    pal: Palette,
    fade: number,
  ): void {
    const ctx = this.ctx
    if (p.screenW < 0.8) return
    const x = this.propX(prop, p)
    const size = Math.min(p.screenW * SCENERY_SIZE * prop.scale, this.height * 0.5)
    if (size < 1) return
    if (x < -size * 4 || x > this.width + size * 4) return
    const y = p.screenY

    ctx.globalAlpha = clamp(0.35 + fade * 0.9, 0, 1)
    switch (kind) {
      case 'pine': {
        const h = size * 2.6
        ctx.fillStyle = '#6b4a2f'
        ctx.fillRect(x - size * 0.08, y - h * 0.22, size * 0.16, h * 0.22)
        ctx.fillStyle = '#1f5c3a'
        for (let i = 0; i < 3; i++) {
          const t = i / 3
          const ly = y - h * (0.2 + t * 0.72)
          const lw = size * (0.62 - t * 0.16)
          ctx.beginPath()
          ctx.moveTo(x, ly - h * 0.3)
          ctx.lineTo(x - lw, ly)
          ctx.lineTo(x + lw, ly)
          ctx.closePath()
          ctx.fill()
        }
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.beginPath()
        ctx.moveTo(x, y - h * 0.95)
        ctx.lineTo(x - size * 0.2, y - h * 0.76)
        ctx.lineTo(x + size * 0.2, y - h * 0.76)
        ctx.closePath()
        ctx.fill()
        break
      }
      case 'palm': {
        const h = size * 2.9
        ctx.strokeStyle = '#8a6a42'
        ctx.lineWidth = Math.max(size * 0.11, 1)
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.quadraticCurveTo(x + size * 0.24, y - h * 0.55, x + size * 0.1, y - h)
        ctx.stroke()
        ctx.fillStyle = '#2f8f4a'
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI * 0.5 + (i - 2) * 0.55
          ctx.beginPath()
          ctx.moveTo(x + size * 0.1, y - h)
          ctx.quadraticCurveTo(
            x + size * 0.1 + Math.cos(a) * size * 0.9,
            y - h + Math.sin(a) * size * 0.7,
            x + size * 0.1 + Math.cos(a) * size * 1.35,
            y - h + Math.sin(a) * size * 0.35 + size * 0.3,
          )
          ctx.lineWidth = Math.max(size * 0.16, 1)
          ctx.strokeStyle = '#2f8f4a'
          ctx.stroke()
        }
        break
      }
      case 'building': {
        const h = size * (2 + ((prop.scale * 7) % 3))
        ctx.fillStyle = '#3a3550'
        ctx.fillRect(x - size * 0.5, y - h, size, h)
        ctx.fillStyle = 'rgba(255,214,140,0.75)'
        const cols = 3
        const rows = Math.max(2, Math.floor(h / (size * 0.5)))
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if ((r * 7 + c * 3 + Math.floor(prop.scale * 10)) % 3 === 0) continue
            ctx.fillRect(
              x - size * 0.36 + c * size * 0.28,
              y - h + size * 0.22 + r * size * 0.5,
              size * 0.16,
              size * 0.26,
            )
          }
        }
        break
      }
      case 'streetlight': {
        const h = size * 2.4
        ctx.strokeStyle = '#2c2c33'
        ctx.lineWidth = Math.max(size * 0.09, 1)
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x, y - h)
        ctx.lineTo(x + size * 0.42, y - h)
        ctx.stroke()
        ctx.fillStyle = '#ffe9a8'
        ctx.beginPath()
        ctx.arc(x + size * 0.44, y - h + size * 0.06, Math.max(size * 0.15, 1), 0, Math.PI * 2)
        ctx.fill()
        break
      }
      case 'cactus': {
        const h = size * 1.9
        ctx.fillStyle = '#3f7d3f'
        ctx.fillRect(x - size * 0.14, y - h, size * 0.28, h)
        ctx.fillRect(x - size * 0.5, y - h * 0.68, size * 0.36, size * 0.2)
        ctx.fillRect(x - size * 0.5, y - h * 0.68, size * 0.18, size * 0.55)
        ctx.fillRect(x + size * 0.16, y - h * 0.52, size * 0.34, size * 0.2)
        ctx.fillRect(x + size * 0.34, y - h * 0.75, size * 0.16, size * 0.45)
        break
      }
      case 'rock': {
        ctx.fillStyle = '#7a7d85'
        ctx.beginPath()
        ctx.moveTo(x - size * 0.55, y)
        ctx.lineTo(x - size * 0.3, y - size * 0.65)
        ctx.lineTo(x + size * 0.15, y - size * 0.8)
        ctx.lineTo(x + size * 0.55, y - size * 0.25)
        ctx.lineTo(x + size * 0.45, y)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.22)'
        ctx.beginPath()
        ctx.moveTo(x - size * 0.3, y - size * 0.65)
        ctx.lineTo(x + size * 0.15, y - size * 0.8)
        ctx.lineTo(x + size * 0.05, y - size * 0.45)
        ctx.closePath()
        ctx.fill()
        break
      }
      case 'buoy': {
        const h = size * 0.9
        ctx.fillStyle = '#e8452f'
        ctx.beginPath()
        ctx.moveTo(x, y - h)
        ctx.lineTo(x - size * 0.28, y)
        ctx.lineTo(x + size * 0.28, y)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.fillRect(x - size * 0.2, y - h * 0.45, size * 0.4, h * 0.14)
        break
      }
      case 'reed': {
        ctx.strokeStyle = '#4f8f3f'
        ctx.lineWidth = Math.max(size * 0.06, 1)
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath()
          ctx.moveTo(x + i * size * 0.12, y)
          ctx.quadraticCurveTo(
            x + i * size * 0.2,
            y - size * 0.6,
            x + i * size * 0.34,
            y - size * 1.05,
          )
          ctx.stroke()
        }
        break
      }
      case 'flag': {
        const h = size * 1.6
        ctx.strokeStyle = '#cfcfcf'
        ctx.lineWidth = Math.max(size * 0.07, 1)
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x, y - h)
        ctx.stroke()
        ctx.fillStyle = pal.accent
        ctx.beginPath()
        ctx.moveTo(x, y - h)
        ctx.lineTo(x + size * 0.6, y - h * 0.86)
        ctx.lineTo(x, y - h * 0.68)
        ctx.closePath()
        ctx.fill()
        break
      }
    }
    ctx.globalAlpha = 1
  }

  private drawObstacle(
    kind: ObstacleKind,
    prop: { x: number; scale: number },
    p: Projected,
    fade: number,
  ): void {
    const ctx = this.ctx
    const x = this.propX(prop, p)
    const size = Math.min(p.screenW * OBSTACLE_SIZE * prop.scale, this.height * 0.32)
    if (size < 0.9) return
    if (x < -size * 4 || x > this.width + size * 4) return
    const y = p.screenY

    ctx.globalAlpha = clamp(0.4 + fade * 1.1, 0, 1)
    // Contact shadow — cheap, and it glues every sprite to the surface.
    ctx.fillStyle = 'rgba(0,0,0,0.22)'
    ctx.beginPath()
    ctx.ellipse(x, y, size * 0.72, size * 0.2, 0, 0, Math.PI * 2)
    ctx.fill()

    switch (kind) {
      case 'rock': {
        ctx.fillStyle = '#6e727a'
        ctx.beginPath()
        ctx.moveTo(x - size * 0.7, y)
        ctx.lineTo(x - size * 0.45, y - size * 0.85)
        ctx.lineTo(x + size * 0.2, y - size)
        ctx.lineTo(x + size * 0.7, y - size * 0.35)
        ctx.lineTo(x + size * 0.55, y)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.25)'
        ctx.beginPath()
        ctx.moveTo(x - size * 0.45, y - size * 0.85)
        ctx.lineTo(x + size * 0.2, y - size)
        ctx.lineTo(x + size * 0.05, y - size * 0.55)
        ctx.closePath()
        ctx.fill()
        break
      }
      case 'tree': {
        const h = size * 2.4
        ctx.fillStyle = '#5c3f27'
        ctx.fillRect(x - size * 0.12, y - h * 0.25, size * 0.24, h * 0.25)
        ctx.fillStyle = '#1d5233'
        for (let i = 0; i < 3; i++) {
          const t = i / 3
          const ly = y - h * (0.22 + t * 0.7)
          const lw = size * (0.8 - t * 0.2)
          ctx.beginPath()
          ctx.moveTo(x, ly - h * 0.34)
          ctx.lineTo(x - lw, ly)
          ctx.lineTo(x + lw, ly)
          ctx.closePath()
          ctx.fill()
        }
        break
      }
      case 'cone': {
        const h = size * 1.15
        ctx.fillStyle = '#ff6a1f'
        ctx.beginPath()
        ctx.moveTo(x, y - h)
        ctx.lineTo(x - size * 0.5, y)
        ctx.lineTo(x + size * 0.5, y)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.9)'
        ctx.fillRect(x - size * 0.31, y - h * 0.55, size * 0.62, h * 0.16)
        break
      }
      case 'barrel': {
        const h = size * 1.3
        ctx.fillStyle = '#e03b3b'
        ctx.fillRect(x - size * 0.42, y - h, size * 0.84, h)
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.fillRect(x - size * 0.42, y - h * 0.68, size * 0.84, h * 0.16)
        ctx.fillRect(x - size * 0.42, y - h * 0.3, size * 0.84, h * 0.16)
        ctx.fillStyle = 'rgba(0,0,0,0.18)'
        ctx.fillRect(x + size * 0.22, y - h, size * 0.2, h)
        break
      }
      case 'log': {
        const h = size * 0.62
        ctx.fillStyle = '#6b4a2c'
        ctx.fillRect(x - size * 1.05, y - h, size * 2.1, h)
        ctx.fillStyle = '#8a6440'
        ctx.beginPath()
        ctx.ellipse(x + size * 1.05, y - h * 0.5, size * 0.16, h * 0.5, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#a87a4e'
        ctx.beginPath()
        ctx.ellipse(x + size * 1.05, y - h * 0.5, size * 0.08, h * 0.26, 0, 0, Math.PI * 2)
        ctx.fill()
        break
      }
      case 'car': {
        const h = size * 1.1
        ctx.fillStyle = '#2f6fd0'
        ctx.fillRect(x - size * 0.9, y - h * 0.62, size * 1.8, h * 0.62)
        ctx.fillStyle = '#265cae'
        ctx.beginPath()
        ctx.moveTo(x - size * 0.55, y - h * 0.62)
        ctx.lineTo(x - size * 0.34, y - h)
        ctx.lineTo(x + size * 0.34, y - h)
        ctx.lineTo(x + size * 0.55, y - h * 0.62)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = 'rgba(190,225,255,0.9)'
        ctx.fillRect(x - size * 0.3, y - h * 0.94, size * 0.6, h * 0.26)
        ctx.fillStyle = '#1a1a1e'
        ctx.fillRect(x - size * 0.78, y - h * 0.16, size * 0.32, h * 0.16)
        ctx.fillRect(x + size * 0.46, y - h * 0.16, size * 0.32, h * 0.16)
        break
      }
      case 'hydrant': {
        const h = size * 0.95
        ctx.fillStyle = '#d8352a'
        ctx.fillRect(x - size * 0.24, y - h * 0.82, size * 0.48, h * 0.82)
        ctx.beginPath()
        ctx.arc(x, y - h * 0.82, size * 0.24, Math.PI, 0)
        ctx.fill()
        ctx.fillRect(x - size * 0.42, y - h * 0.6, size * 0.84, h * 0.16)
        break
      }
      case 'crate': {
        const h = size * 0.95
        ctx.fillStyle = '#b07a3c'
        ctx.fillRect(x - size * 0.5, y - h, size, h)
        ctx.strokeStyle = 'rgba(90,58,26,0.9)'
        ctx.lineWidth = Math.max(size * 0.08, 1)
        ctx.beginPath()
        ctx.moveTo(x - size * 0.5, y - h)
        ctx.lineTo(x + size * 0.5, y)
        ctx.moveTo(x + size * 0.5, y - h)
        ctx.lineTo(x - size * 0.5, y)
        ctx.stroke()
        ctx.strokeRect(x - size * 0.5, y - h, size, h)
        break
      }
    }
    ctx.globalAlpha = 1
  }

  private drawCoin(
    coin: { x: number; scale: number },
    p: Projected,
    s: RenderState,
    pal: Palette,
  ): void {
    const ctx = this.ctx
    const x = p.screenX + coin.x * p.scale * (this.width / 2)
    // Capped: a coin at the near plane would otherwise fill the screen.
    const size = Math.min(p.screenW * 0.05, this.height * 0.035)
    if (size < 0.8) return
    if (x < -size * 4 || x > this.width + size * 4) return
    const bobY = p.screenY - size * 2.2 + Math.sin(s.time * 4 + coin.x * 0.01) * size * 0.3
    // Spin by squashing the horizontal radius.
    const spin = Math.abs(Math.cos(s.time * 3.4 + coin.x * 0.008))
    ctx.fillStyle = pal.accent
    ctx.beginPath()
    ctx.ellipse(x, bobY, Math.max(size * spin, size * 0.12), size, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.beginPath()
    ctx.ellipse(x, bobY, Math.max(size * spin * 0.45, size * 0.05), size * 0.5, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  private drawPlayer(level: LevelDef, s: RenderState): void {
    const ctx = this.ctx
    const { width, height } = this
    const baseY = height * 0.82
    // Airborne height maps to screen offset; the shadow stays on the ground.
    const lift = (s.playerY / 1000) * height * 0.16
    const cx = width / 2 + s.playerX * 0.06
    const cy = baseY - lift
    const size = Math.min(width, height) * 0.1
    const bob = Math.sin(s.time * 5.5) * s.speed01 * level.physics.bob * size * 0.22

    // Ground shadow shrinks with altitude.
    const shadowScale = clamp(1 - s.playerY / 1400, 0.25, 1)
    ctx.fillStyle = `rgba(0,0,0,${0.3 * shadowScale})`
    ctx.beginPath()
    ctx.ellipse(cx, baseY + size * 0.08, size * 0.75 * shadowScale, size * 0.2 * shadowScale, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.save()
    ctx.translate(cx, cy + bob)
    ctx.rotate(s.lean + s.spin)

    switch (level.id) {
      case 'snowboard':
        this.drawRider(size, '#ff4d6d', '#1c2a4a', 'board', '#28c8ff')
        break
      case 'skateboard':
        this.drawRider(size, '#ffd23f', '#2b2b33', 'deck', '#8b5a2b')
        break
      case 'rollerblade':
        this.drawRider(size, '#ff5f8d', '#204a6e', 'skates', '#f5f5f5')
        break
      case 'surf':
        this.drawRider(size, '#ffb85c', '#1c4a6e', 'board', '#ffffff')
        break
      case 'gokart':
        this.drawVehicle(size, '#ffd23f', '#e03b3b', 0.9)
        break
      case 'car':
        this.drawVehicle(size, '#ff7a29', '#3a2a1c', 1.1)
        break
      case 'boat':
        this.drawBoat(size)
        break
    }
    ctx.restore()
  }

  private drawRider(
    size: number,
    suit: string,
    trouser: string,
    board: 'board' | 'deck' | 'skates',
    boardColor: string,
  ): void {
    const ctx = this.ctx
    // Board / skates first, so the body reads on top.
    if (board === 'skates') {
      ctx.fillStyle = boardColor
      ctx.fillRect(-size * 0.42, size * 0.34, size * 0.34, size * 0.16)
      ctx.fillRect(size * 0.08, size * 0.34, size * 0.34, size * 0.16)
      ctx.fillStyle = '#333'
      for (const bx of [-0.36, -0.16, 0.14, 0.34]) {
        ctx.beginPath()
        ctx.arc(bx * size, size * 0.54, size * 0.06, 0, Math.PI * 2)
        ctx.fill()
      }
    } else {
      ctx.fillStyle = boardColor
      ctx.beginPath()
      ctx.ellipse(0, size * 0.42, size * 0.78, size * 0.11, 0, 0, Math.PI * 2)
      ctx.fill()
      if (board === 'deck') {
        ctx.fillStyle = '#2b2b33'
        for (const bx of [-0.42, 0.42]) {
          ctx.beginPath()
          ctx.arc(bx * size, size * 0.55, size * 0.08, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    // Legs
    ctx.fillStyle = trouser
    ctx.beginPath()
    ctx.moveTo(-size * 0.3, size * 0.36)
    ctx.lineTo(-size * 0.16, -size * 0.02)
    ctx.lineTo(size * 0.2, -size * 0.02)
    ctx.lineTo(size * 0.32, size * 0.36)
    ctx.closePath()
    ctx.fill()

    // Torso
    ctx.fillStyle = suit
    ctx.beginPath()
    ctx.moveTo(-size * 0.22, size * 0.02)
    ctx.lineTo(-size * 0.3, -size * 0.42)
    ctx.lineTo(size * 0.3, -size * 0.42)
    ctx.lineTo(size * 0.24, size * 0.02)
    ctx.closePath()
    ctx.fill()

    // Arms out for balance
    ctx.strokeStyle = suit
    ctx.lineWidth = size * 0.13
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(-size * 0.26, -size * 0.3)
    ctx.lineTo(-size * 0.62, -size * 0.14)
    ctx.moveTo(size * 0.26, -size * 0.3)
    ctx.lineTo(size * 0.6, -size * 0.42)
    ctx.stroke()

    // Helmet
    ctx.fillStyle = '#1c1c22'
    ctx.beginPath()
    ctx.arc(0, -size * 0.58, size * 0.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#7fd8ff'
    ctx.beginPath()
    ctx.ellipse(size * 0.05, -size * 0.6, size * 0.15, size * 0.08, -0.2, 0, Math.PI * 2)
    ctx.fill()
  }

  private drawVehicle(size: number, body: string, trim: string, widthScale: number): void {
    const ctx = this.ctx
    const w = size * widthScale
    ctx.fillStyle = '#1a1a1e'
    for (const bx of [-0.86, 0.86]) {
      ctx.beginPath()
      ctx.ellipse(bx * w, size * 0.34, size * 0.19, size * 0.21, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = body
    ctx.beginPath()
    ctx.moveTo(-w * 0.9, size * 0.36)
    ctx.lineTo(-w * 0.74, -size * 0.06)
    ctx.lineTo(w * 0.74, -size * 0.06)
    ctx.lineTo(w * 0.9, size * 0.36)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = trim
    ctx.beginPath()
    ctx.moveTo(-w * 0.5, -size * 0.06)
    ctx.lineTo(-w * 0.36, -size * 0.46)
    ctx.lineTo(w * 0.36, -size * 0.46)
    ctx.lineTo(w * 0.5, -size * 0.06)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(190,225,255,0.92)'
    ctx.fillRect(-w * 0.3, -size * 0.42, w * 0.6, size * 0.26)
    // Driver's helmet peeking over the top.
    ctx.fillStyle = '#f2f2f2'
    ctx.beginPath()
    ctx.arc(0, -size * 0.52, size * 0.16, 0, Math.PI * 2)
    ctx.fill()
  }

  private drawBoat(size: number): void {
    const ctx = this.ctx
    // Hull
    ctx.fillStyle = '#f2f4f7'
    ctx.beginPath()
    ctx.moveTo(-size * 0.85, size * 0.1)
    ctx.quadraticCurveTo(0, size * 0.62, size * 0.85, size * 0.1)
    ctx.lineTo(size * 0.72, -size * 0.12)
    ctx.lineTo(-size * 0.72, -size * 0.12)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#2f6fd0'
    ctx.fillRect(-size * 0.78, -size * 0.14, size * 1.56, size * 0.12)
    // Windshield + driver
    ctx.fillStyle = 'rgba(190,225,255,0.9)'
    ctx.beginPath()
    ctx.moveTo(-size * 0.3, -size * 0.14)
    ctx.lineTo(-size * 0.2, -size * 0.5)
    ctx.lineTo(size * 0.24, -size * 0.5)
    ctx.lineTo(size * 0.32, -size * 0.14)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#ff4d6d'
    ctx.beginPath()
    ctx.arc(0, -size * 0.42, size * 0.15, 0, Math.PI * 2)
    ctx.fill()
  }

  private drawParticles(): void {
    const ctx = this.ctx
    for (const p of this.particles) {
      const a = clamp(p.life / p.maxLife, 0, 1)
      ctx.globalAlpha = a * 0.9
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, Math.PI * 2)
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

  private drawVignette(): void {
    const ctx = this.ctx
    const g = ctx.createRadialGradient(
      this.width / 2,
      this.height / 2,
      Math.min(this.width, this.height) * 0.35,
      this.width / 2,
      this.height / 2,
      Math.max(this.width, this.height) * 0.75,
    )
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(0,0,0,0.35)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, this.width, this.height)
  }
}
