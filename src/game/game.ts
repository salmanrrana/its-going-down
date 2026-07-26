import { audio } from '../core/audio'
import { Input } from '../core/input'
import { clamp, damp } from '../core/math'
import { PLAYER_HALF_WIDTH, Renderer, type RenderState } from './renderer'
import { applySurfaceBounds, OBSTACLE_HALF_WIDTH } from './rules'
import { generateTrack, SEGMENT_LENGTH, type Segment, type Track } from './track'
import type { DifficultyDef, LevelDef } from './types'

export type GamePhase = 'countdown' | 'running' | 'paused' | 'finished' | 'failed'

export interface RunStats {
  score: number
  coins: number
  hits: number
  bestAir: number
  timeSeconds: number
  progress01: number
  completed: boolean
}

export interface GameCallbacks {
  onHudChange: (hud: HudState) => void
  onEnd: (stats: RunStats) => void
}

export interface GameOptions {
  /**
   * Attract mode: the menu backdrop. Silent, unscored, auto-steering, and it
   * loops forever instead of ever finishing.
   */
  attract?: boolean
}

export interface HudState {
  score: number
  coins: number
  lives: number
  maxLives: number
  speedKph: number
  progress01: number
  timeSeconds: number
  countdown: number | null
  airborne: boolean
  combo: number
}

const COIN_PICKUP_RADIUS = 380
/** Clearance needed to fly over a hazard rather than hit it. */
const JUMP_CLEARANCE = 330

export class Game {
  private track: Track
  private phase: GamePhase = 'countdown'

  // Player state, all in world units.
  private playerX = 0
  private playerY = 0
  private playerVY = 0
  private lateralV = 0
  private position = 0
  private speed = 0
  private lean = 0
  private spin = 0
  private spinRate = 0

  private time = 0
  private countdown = 3
  /** Attract mode steers itself with a slow sine weave. */
  private attractPhase = 0
  private hurt = 0
  private shake = 0
  private invulnerable = 0
  private crashRecovery = 0

  private score = 0
  private coins = 0
  private hits = 0
  private combo = 0
  private comboTimer = 0
  private bestAir = 0
  private airTime = 0
  private lives: number
  private readonly maxLives: number

  private lastHud: HudState | null = null
  private topSpeed: number

  constructor(
    private level: LevelDef,
    private difficulty: DifficultyDef,
    private input: Input,
    private renderer: Renderer,
    private callbacks: GameCallbacks,
    seed: number,
    private options: GameOptions = {},
  ) {
    this.track = generateTrack(level, difficulty, seed)
    this.maxLives = difficulty.lives
    this.lives = difficulty.lives
    this.topSpeed = level.physics.topSpeed * difficulty.speedScale
  }

  get currentPhase(): GamePhase {
    return this.phase
  }

  /** Sound effects are suppressed entirely in attract mode. */
  private sfx(name: Parameters<typeof audio.play>[0]): void {
    if (this.options.attract) return
    audio.play(name)
  }

  pause(): void {
    if (this.phase !== 'running' && this.phase !== 'countdown') return
    this.phase = 'paused'
    audio.setSpeed(0, false)
    audio.stopMusic()
  }

  resume(): void {
    if (this.phase !== 'paused') return
    this.phase = this.countdown > 0 ? 'countdown' : 'running'
    this.input.clear()
    audio.startMusic(this.level.musicKey)
  }

  get stats(): RunStats {
    return {
      score: Math.round(this.score),
      coins: this.coins,
      hits: this.hits,
      bestAir: this.bestAir,
      timeSeconds: this.time,
      progress01: this.progress01,
      completed: this.phase === 'finished',
    }
  }

  private get progress01(): number {
    return clamp(this.position / this.track.totalLength, 0, 1)
  }

  private segmentAt(z: number): Segment {
    const i = Math.floor(z / SEGMENT_LENGTH)
    return this.track.segments[clamp(i, 0, this.track.segments.length - 1)]
  }

  update(dt: number): void {
    if (this.phase === 'paused' || this.phase === 'finished' || this.phase === 'failed') {
      return
    }

    const attract = this.options.attract === true
    if (!attract) this.input.update()
    this.time += dt

    if (this.phase === 'countdown') {
      // Attract mode skips straight to rolling.
      this.countdown -= attract ? 99 : dt
      if (this.countdown <= 0) {
        this.phase = 'running'
        if (!attract) audio.play('start')
      }
      // Roll forward gently during the countdown so the world is alive.
      this.speed = damp(this.speed, this.topSpeed * 0.18, 1.6, dt)
    }

    const phys = this.level.physics
    const running = this.phase === 'running'
    const throttle = this.crashRecovery > 0 ? 0.35 : 1

    // --- Longitudinal -------------------------------------------------------
    if (running) {
      const target = this.topSpeed * throttle
      const rate = this.speed < target ? phys.accel : phys.offSurfaceDrag
      this.speed += Math.sign(target - this.speed) * rate * dt
      if ((this.speed > target && rate === phys.accel) || this.speed > this.topSpeed) {
        this.speed = Math.min(this.speed, target)
      }
    }
    this.crashRecovery = Math.max(0, this.crashRecovery - dt)
    this.speed = clamp(this.speed, 0, this.topSpeed)
    this.position += this.speed * dt

    const speed01 = this.topSpeed > 0 ? this.speed / this.topSpeed : 0
    const seg = this.segmentAt(this.position)

    // --- Lateral ------------------------------------------------------------
    let steer = running ? this.input.steer : 0
    if (attract) {
      // A lazy weave down the run, so the menu backdrop is always in motion.
      this.attractPhase += dt
      steer = Math.sin(this.attractPhase * 0.55) * 0.7
    }

    // Easy-mode assist: nudge away from the nearest hazard ahead so young kids
    // rarely hit anything even with sloppy input.
    if (this.difficulty.assist > 0 && running) {
      const assist = this.lookaheadAssist()
      steer = clamp(steer + assist * this.difficulty.assist, -1, 1)
    }

    // Steering authority scales with speed: you can't carve while stopped.
    const authority = 0.35 + speed01 * 0.65
    this.lateralV += steer * phys.steerRate * authority * 1000 * dt
    // Centrifugal pull through corners — this is what makes turns feel physical.
    // Scaled to stay well under steering authority so a corner can always be
    // held; it should push you wide, never drive you off on its own.
    this.lateralV -= seg.curve * speed01 * speed01 * phys.centrifugal * 90 * dt
    // Grip bleeds lateral velocity; low-grip levels slide, high-grip levels bite.
    this.lateralV *= Math.exp(-phys.grip * dt)
    this.playerX += this.lateralV * dt

    // --- Surface bounds -----------------------------------------------------
    // playerX IS the offset from the road centre, so no extra bookkeeping.
    const relX = this.playerX
    const edge = seg.width
    const offSurface = Math.abs(relX) > edge
    const easyMode = this.difficulty.id === 'easy'

    if (offSurface && easyMode) {
      const bounds = applySurfaceBounds(relX, this.lateralV, edge, true)
      this.playerX = bounds.playerX
      this.lateralV = bounds.lateralV
    }

    if (offSurface && !easyMode) {
      // Drag and rumble when you stray onto the verge.
      this.speed -= phys.offSurfaceDrag * 0.55 * dt
      this.shake = Math.max(this.shake, 3.5 * speed01)
      this.emitSpray(6, this.level.palette.spray, 0.5)
      // A hard limit further out stops you leaving the world entirely.
      const hardEdge = edge * 1.9
      if (Math.abs(relX) > hardEdge) {
        this.playerX = clamp(relX, -hardEdge, hardEdge)
        this.lateralV *= -0.2
      }
    }

    // --- Vertical: ramps, jumps, gravity ------------------------------------
    const airborne = this.playerY > 0.5
    if (running && this.difficulty.jumpEnabled && this.input.consumeJump() && !airborne) {
      this.playerVY = phys.jumpImpulse
      this.spinRate = this.lateralV * 0.00035
      this.sfx('jump')
    } else if (!this.difficulty.jumpEnabled) {
      this.input.consumeJump()
    }

    // Ramp launch — hitting one always launches you, in every difficulty.
    if (seg.ramp && !airborne && running) {
      const dxr = Math.abs(relX - seg.ramp.x)
      if (dxr < seg.ramp.width) {
        this.playerVY = phys.jumpImpulse * seg.ramp.power * (0.9 + speed01 * 0.5)
        this.spinRate = this.lateralV * 0.0003
        this.sfx('ramp')
        this.addScore(75)
      }
    }

    if (this.playerY > 0 || this.playerVY > 0) {
      this.playerVY -= phys.gravity * dt
      this.playerY += this.playerVY * dt
      this.airTime += dt
      if (this.playerY <= 0) {
        this.playerY = 0
        this.playerVY = 0
        this.spin = 0
        this.spinRate = 0
        if (this.airTime > 0.25) {
          this.bestAir = Math.max(this.bestAir, this.airTime)
          this.addScore(Math.round(this.airTime * 160 * (1 + this.combo * 0.1)))
          this.bumpCombo()
          this.sfx('land')
          this.emitSpray(18, this.level.palette.spray, 1.4)
          this.shake = Math.max(this.shake, 5)
        }
        this.airTime = 0
      }
    } else {
      this.airTime = 0
    }

    this.spin += this.spinRate * dt * 60 * 0.02
    if (this.playerY <= 0) this.spin = damp(this.spin, 0, 12, dt)

    // --- Lean, effects ------------------------------------------------------
    const leanTarget = clamp(this.lateralV / 2600, -1, 1) * phys.lean
    this.lean = damp(this.lean, leanTarget, 9, dt)
    this.hurt = Math.max(0, this.hurt - dt * 2.2)
    this.shake = Math.max(0, this.shake - dt * 22)
    this.invulnerable = Math.max(0, this.invulnerable - dt)
    if (this.comboTimer > 0) {
      this.comboTimer -= dt
      if (this.comboTimer <= 0) this.combo = 0
    }

    if (running && this.playerY <= 0 && speed01 > 0.3) {
      // Continuous trail behind the player when carving hard.
      if (Math.abs(this.lateralV) > 900 && Math.random() < 0.6) {
        this.emitSpray(2, this.level.palette.spray, 0.6)
      }
    }

    // --- Collisions and pickups --------------------------------------------
    // Attract mode ghosts through everything — it's scenery, not a run.
    if (running && !attract) this.resolveCollisions(relX)

    // --- Scoring ------------------------------------------------------------
    if (running) {
      this.score += this.speed * dt * 0.012 * this.difficulty.scoreScale
    }

    if (!attract) audio.setSpeed(speed01, running)

    // --- Finish -------------------------------------------------------------
    if (this.position >= this.track.totalLength - SEGMENT_LENGTH * 4) {
      if (attract) {
        // Loop the flythrough forever rather than ever ending.
        this.position = 0
        this.playerX = 0
        this.lateralV = 0
      } else {
        this.finish(true)
        return
      }
    }

    this.renderer.updateParticles(dt)
    if (!attract) this.pushHud()
  }

  /** Returns a steering nudge in -1..1 that steers around the nearest hazard. */
  private lookaheadAssist(): number {
    const relX = this.playerX
    const startSeg = Math.floor(this.position / SEGMENT_LENGTH)
    const segs = this.track.segments
    for (let i = startSeg; i < Math.min(startSeg + 22, segs.length); i++) {
      const seg = segs[i]
      for (const ob of seg.obstacles) {
        if (ob.spent) continue
        const dx = ob.x - relX
        if (Math.abs(dx) < OBSTACLE_HALF_WIDTH + PLAYER_HALF_WIDTH + 160) {
          // Steer toward whichever side has more room on the surface.
          const away = dx > 0 ? -1 : 1
          const room = away < 0 ? relX + seg.width : seg.width - relX
          return room > 700 ? away : -away
        }
      }
    }
    return 0
  }

  private resolveCollisions(relX: number): void {
    const startSeg = Math.floor(this.position / SEGMENT_LENGTH)
    const segs = this.track.segments
    // Check a small window around the player to avoid tunnelling at speed.
    const span = Math.max(2, Math.ceil((this.speed * (1 / 30)) / SEGMENT_LENGTH) + 1)
    for (let i = startSeg; i < Math.min(startSeg + span, segs.length); i++) {
      const seg = segs[i]

      for (const coin of seg.coins) {
        if (coin.spent) continue
        if (Math.abs(coin.x - relX) < COIN_PICKUP_RADIUS && this.playerY < 700) {
          coin.spent = true
          this.coins++
          this.addScore(50 * (1 + this.combo * 0.15))
          this.bumpCombo()
          this.sfx('coin')
        }
      }

      if (this.invulnerable > 0) continue
      for (const ob of seg.obstacles) {
        if (ob.spent) continue
        const halfW = OBSTACLE_HALF_WIDTH * ob.scale
        if (Math.abs(ob.x - relX) > halfW + PLAYER_HALF_WIDTH) continue
        // Cleared it in the air?
        if (this.playerY > JUMP_CLEARANCE) {
          if (!ob.spent) {
            ob.spent = true
            this.addScore(120)
            this.bumpCombo()
          }
          continue
        }
        ob.spent = true
        this.crash()
        return
      }
    }
  }

  private crash(): void {
    this.hits++
    this.combo = 0
    this.comboTimer = 0
    this.hurt = 1
    this.shake = 14
    this.invulnerable = 1.4
    this.crashRecovery = 0.9
    this.speed *= 0.35
    this.lateralV *= -0.35
    this.playerVY = 0
    this.playerY = 0
    this.sfx('crash')
    this.emitSpray(26, '#ffffff', 2, true)

    if (this.maxLives > 0) {
      this.lives--
      if (this.lives <= 0) {
        this.finish(false)
      }
    }
  }

  private addScore(points: number): void {
    this.score += points * this.difficulty.scoreScale
  }

  private bumpCombo(): void {
    this.combo = Math.min(this.combo + 1, 9)
    this.comboTimer = 3
  }

  private emitSpray(count: number, color: string, force: number, burst = false): void {
    const { width, height } = this.renderer.size
    const baseX = width / 2 + this.playerX * 0.06
    const baseY = height * 0.82 - (this.playerY / 1000) * height * 0.16
    for (let i = 0; i < count; i++) {
      const a = burst ? Math.random() * Math.PI * 2 : Math.PI * (0.9 + Math.random() * 0.5)
      const sp = (burst ? 220 : 110) * force * (0.5 + Math.random())
      this.renderer.spawnParticle({
        x: baseX + (Math.random() - 0.5) * width * 0.04,
        y: baseY + (Math.random() - 0.5) * height * 0.01,
        vx: Math.cos(a) * sp - this.lateralV * 0.02,
        vy: Math.sin(a) * sp - 60,
        life: 0.4 + Math.random() * 0.5,
        maxLife: 0.9,
        size: (burst ? 4 : 3) * (0.5 + Math.random()),
        color,
      })
    }
  }

  private finish(completed: boolean): void {
    if (this.phase === 'finished' || this.phase === 'failed') return
    this.phase = completed ? 'finished' : 'failed'
    if (completed) {
      // Completion bonus scales with how clean the run was.
      const cleanBonus = Math.max(0, 500 - this.hits * 100)
      this.score += (1000 + cleanBonus) * this.difficulty.scoreScale
      this.sfx('finish')
    } else {
      this.sfx('fail')
    }
    audio.setSpeed(0, false)
    audio.stopMusic()
    this.callbacks.onEnd(this.stats)
  }

  private pushHud(): void {
    const hud: HudState = {
      score: Math.round(this.score),
      coins: this.coins,
      lives: this.lives,
      maxLives: this.maxLives,
      // Map world units to a believable km/h readout.
      speedKph: Math.round((this.speed / 1000) * 13),
      progress01: this.progress01,
      timeSeconds: this.time,
      countdown: this.phase === 'countdown' ? Math.max(0, Math.ceil(this.countdown)) : null,
      airborne: this.playerY > 0.5,
      combo: this.combo,
    }
    const prev = this.lastHud
    // Only notify the DOM layer when something visible actually changed.
    if (
      !prev ||
      prev.score !== hud.score ||
      prev.coins !== hud.coins ||
      prev.lives !== hud.lives ||
      prev.speedKph !== hud.speedKph ||
      prev.countdown !== hud.countdown ||
      prev.combo !== hud.combo ||
      Math.abs(prev.progress01 - hud.progress01) > 0.002 ||
      Math.floor(prev.timeSeconds * 10) !== Math.floor(hud.timeSeconds * 10)
    ) {
      this.lastHud = hud
      this.callbacks.onHudChange(hud)
    }
  }

  render(): void {
    const state: RenderState = {
      playerX: this.playerX,
      playerY: this.playerY,
      position: this.position,
      speed: this.speed,
      speed01: this.topSpeed > 0 ? this.speed / this.topSpeed : 0,
      lean: this.lean,
      spin: this.spin,
      time: this.time,
      hurt: this.hurt,
      shake: this.shake,
      airborne: this.playerY > 0.5,
    }
    this.renderer.render(this.track, this.level, state)
  }
}
