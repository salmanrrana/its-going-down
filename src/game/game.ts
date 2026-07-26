import { clamp, damp } from '../core/math'
import {
  COIN_PICKUP_RADIUS,
  JUMP_CLEARANCE,
  OBSTACLE_HALF_WIDTH,
  PLAYER_HALF_WIDTH,
} from './constants'
import type {
  GameEvent,
  GamePhase,
  GameSnapshot,
  GameSound,
  HudState,
  InputFrame,
  RunStats,
} from './contracts'
import { applySurfaceBounds } from './rules'
import { generateTrack, SEGMENT_LENGTH, type Segment, type Track } from './track'
import type { DifficultyDef, LevelDef } from './types'

export type { GamePhase, GameSnapshot, HudState, InputFrame, RunStats } from './contracts'

export interface GameOptions {
  /** Silent, unscored, auto-steering menu backdrop that loops forever. */
  attract?: boolean
}

const NO_INPUT: InputFrame = { steer: 0, jump: false }

export class Game {
  private track: Track
  private phase: GamePhase = 'countdown'

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
  private events: GameEvent[] = []
  private previousState: GameSnapshot
  private currentState: GameSnapshot

  constructor(
    private readonly level: LevelDef,
    private readonly difficulty: DifficultyDef,
    seed: number,
    private readonly options: GameOptions = {},
  ) {
    this.track = generateTrack(level, difficulty, seed)
    this.maxLives = difficulty.lives
    this.lives = difficulty.lives
    this.topSpeed = level.physics.topSpeed * difficulty.speedScale
    this.currentState = this.captureSnapshot()
    this.previousState = this.currentState
  }

  get currentPhase(): GamePhase {
    return this.phase
  }

  get previousSnapshot(): GameSnapshot {
    return this.previousState
  }

  get currentSnapshot(): GameSnapshot {
    return this.currentState
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

  pause(): GameEvent[] {
    if (this.phase !== 'running' && this.phase !== 'countdown') return []
    this.phase = 'paused'
    this.syncSnapshot()
    this.events.push({ type: 'audio-speed', speed01: 0, active: false })
    this.events.push({ type: 'music', action: 'stop' })
    return this.takeEvents()
  }

  resume(): GameEvent[] {
    if (this.phase !== 'paused') return []
    this.phase = this.countdown > 0 ? 'countdown' : 'running'
    this.syncSnapshot()
    this.events.push({ type: 'music', action: 'start', key: this.level.musicKey })
    return this.takeEvents()
  }

  update(dt: number, input: InputFrame = NO_INPUT): GameEvent[] {
    if (this.phase === 'paused' || this.phase === 'finished' || this.phase === 'failed') {
      return []
    }

    this.previousState = this.currentState
    const attract = this.options.attract === true
    this.time += dt

    if (this.phase === 'countdown') {
      this.countdown -= attract ? 99 : dt
      if (this.countdown <= 0) {
        this.phase = 'running'
        this.emitSound('start')
      }
      this.speed = damp(this.speed, this.topSpeed * 0.18, 1.6, dt)
    }

    const phys = this.level.physics
    const running = this.phase === 'running'
    const throttle = this.crashRecovery > 0 ? 0.35 : 1

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

    const requestedSteer = Number.isFinite(input.steer) ? input.steer : 0
    let steer = running ? clamp(requestedSteer, -1, 1) : 0
    if (attract) {
      this.attractPhase += dt
      steer = Math.sin(this.attractPhase * 0.55) * 0.7
    }

    if (this.difficulty.assist > 0 && running) {
      const assist = this.lookaheadAssist()
      steer = clamp(steer + assist * this.difficulty.assist, -1, 1)
    }

    const authority = 0.35 + speed01 * 0.65
    this.lateralV += steer * phys.steerRate * authority * 1000 * dt
    this.lateralV -= seg.curve * speed01 * speed01 * phys.centrifugal * 90 * dt
    this.lateralV *= Math.exp(-phys.grip * dt)
    this.playerX += this.lateralV * dt

    // playerX is the offset from the road centre, so the shared helper can
    // enforce Easy's soft wall and the outer boundary for other difficulties.
    const unlosable = this.difficulty.lives === 0
    const bounds = applySurfaceBounds(this.playerX, this.lateralV, seg.width, unlosable)
    this.playerX = bounds.playerX
    this.lateralV = bounds.lateralV
    const relX = this.playerX

    if (bounds.offSurface && !unlosable) {
      this.speed -= phys.offSurfaceDrag * 0.55 * dt
      this.shake = Math.max(this.shake, 3.5 * speed01)
      this.emitSpray(6, this.level.palette.spray, 0.5)
    }

    const airborne = this.playerY > 0.5
    if (running && this.difficulty.jumpEnabled && input.jump && !airborne) {
      this.playerVY = phys.jumpImpulse
      this.spinRate = this.lateralV * 0.00035
      this.emitSound('jump')
    }

    if (seg.ramp && !airborne && running) {
      const dxr = Math.abs(relX - seg.ramp.x)
      if (dxr < seg.ramp.width) {
        this.playerVY = phys.jumpImpulse * seg.ramp.power * (0.9 + speed01 * 0.5)
        this.spinRate = this.lateralV * 0.0003
        this.emitSound('ramp')
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
          this.emitSound('land')
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
      if (Math.abs(this.lateralV) > 900 && Math.random() < 0.6) {
        this.emitSpray(2, this.level.palette.spray, 0.6)
      }
    }

    if (running && !attract) {
      this.resolveCollisions(relX)
      if (!this.isActive()) {
        this.pushHud()
        this.events.push({ type: 'run-ended', stats: this.stats })
        this.currentState = this.captureSnapshot()
        this.previousState = this.currentState
        return this.takeEvents()
      }
    }

    if (running) {
      this.score += this.speed * dt * 0.012 * this.difficulty.scoreScale
    }

    if (!attract) this.events.push({ type: 'audio-speed', speed01, active: running })

    let wrapped = false
    if (this.position >= this.track.totalLength - SEGMENT_LENGTH * 4) {
      if (attract) {
        this.position = 0
        this.playerX = 0
        this.lateralV = 0
        wrapped = true
      } else {
        this.finish(true)
      }
    }

    if (!attract) {
      this.pushHud()
      if (!this.isActive()) this.events.push({ type: 'run-ended', stats: this.stats })
    }
    this.currentState = this.captureSnapshot()
    if (wrapped || !this.isActive()) this.previousState = this.currentState
    return this.takeEvents()
  }

  private get progress01(): number {
    return clamp(this.position / this.track.totalLength, 0, 1)
  }

  private isActive(): boolean {
    return this.phase !== 'finished' && this.phase !== 'failed'
  }

  private segmentAt(z: number): Segment {
    const i = Math.floor(z / SEGMENT_LENGTH)
    return this.track.segments[clamp(i, 0, this.track.segments.length - 1)]
  }

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
          this.emitSound('coin')
        }
      }

      if (this.invulnerable > 0) continue
      for (const ob of seg.obstacles) {
        if (ob.spent) continue
        const halfW = OBSTACLE_HALF_WIDTH * ob.scale
        if (Math.abs(ob.x - relX) > halfW + PLAYER_HALF_WIDTH) continue
        if (this.playerY > JUMP_CLEARANCE) {
          ob.spent = true
          this.addScore(120)
          this.bumpCombo()
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
    this.emitSound('crash')
    this.emitSpray(26, '#ffffff', 2, true)

    if (this.maxLives > 0) {
      this.lives--
      if (this.lives <= 0) this.finish(false)
    }
  }

  private addScore(points: number): void {
    this.score += points * this.difficulty.scoreScale
  }

  private bumpCombo(): void {
    this.combo = Math.min(this.combo + 1, 9)
    this.comboTimer = 3
  }

  private emitSound(sound: GameSound): void {
    if (!this.options.attract) this.events.push({ type: 'sound', sound })
  }

  private emitSpray(count: number, color: string, force: number, burst = false): void {
    this.events.push({
      type: 'view-effect',
      effect: {
        type: 'spray',
        count,
        color,
        force,
        burst,
        playerX: this.playerX,
        playerY: this.playerY,
        lateralVelocity: this.lateralV,
      },
    })
  }

  private finish(completed: boolean): void {
    if (this.phase === 'finished' || this.phase === 'failed') return
    this.phase = completed ? 'finished' : 'failed'
    if (completed) {
      const cleanBonus = Math.max(0, 500 - this.hits * 100)
      this.score += (1000 + cleanBonus) * this.difficulty.scoreScale
      this.emitSound('finish')
    } else {
      this.emitSound('fail')
    }
    this.events.push({ type: 'audio-speed', speed01: 0, active: false })
    this.events.push({ type: 'music', action: 'stop' })
  }

  private pushHud(): void {
    const hud: HudState = {
      score: Math.round(this.score),
      coins: this.coins,
      lives: this.lives,
      maxLives: this.maxLives,
      speedKph: Math.round((this.speed / 1000) * 13),
      progress01: this.progress01,
      timeSeconds: this.time,
      countdown: this.phase === 'countdown' ? Math.max(0, Math.ceil(this.countdown)) : null,
      airborne: this.playerY > 0.5,
      combo: this.combo,
    }
    const prev = this.lastHud
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
      this.events.push({ type: 'hud-changed', hud })
    }
  }

  private captureSnapshot(): GameSnapshot {
    return {
      track: this.track,
      level: this.level,
      phase: this.phase,
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
  }

  private syncSnapshot(): void {
    this.previousState = this.currentState
    this.currentState = this.captureSnapshot()
  }

  private takeEvents(): GameEvent[] {
    const events = this.events
    this.events = []
    return events
  }
}
