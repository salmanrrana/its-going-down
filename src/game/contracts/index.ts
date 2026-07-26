import type { SteeringSource } from '../../core/steering'
import type { Track } from '../track'
import type { LevelDef } from '../types'

export type GamePhase = 'countdown' | 'running' | 'paused' | 'finished' | 'failed'

export interface InputFrame {
  /** Normalized steering request. Game clamps external producers to -1..1. */
  readonly steer: number
  /** Optional producer response profile, applied by the fixed-tick input buffer. */
  readonly steerSource?: SteeringSource
  /** Edge-triggered request consumed by at most one simulation tick. */
  readonly jump: boolean
}

export interface RunStats {
  readonly score: number
  readonly coins: number
  readonly hits: number
  readonly bestAir: number
  readonly timeSeconds: number
  readonly progress01: number
  readonly completed: boolean
}

export interface HudState {
  readonly score: number
  readonly coins: number
  readonly lives: number
  readonly maxLives: number
  readonly speedKph: number
  readonly progress01: number
  readonly timeSeconds: number
  readonly countdown: number | null
  readonly airborne: boolean
  readonly combo: number
}

/**
 * Scalar simulation values for one tick. Track and level intentionally remain
 * shared live references until the rendering boundary needs independently owned
 * world data; consumers must treat them as read-only.
 */
export interface GameSnapshot {
  readonly track: Track
  readonly level: LevelDef
  readonly phase: GamePhase
  readonly playerX: number
  readonly playerY: number
  readonly position: number
  readonly speed: number
  readonly speed01: number
  /** Signed lateral velocity in world units/sec. */
  readonly lateralVelocity: number
  /** Signed vertical velocity in world units/sec. */
  readonly verticalVelocity: number
  /** Final assisted steering request used by the simulation. */
  readonly steer: number
  /** Signed grounded carve intensity, normalized to -1..1. */
  readonly carve: number
  /** Recent landing impulse, normalized to 0..1 and decaying to zero. */
  readonly landingImpact: number
  readonly lean: number
  readonly spin: number
  readonly time: number
  readonly hurt: number
  readonly shake: number
  readonly airborne: boolean
}

export type GameSound =
  | 'start'
  | 'jump'
  | 'land'
  | 'crash'
  | 'coin'
  | 'ramp'
  | 'finish'
  | 'fail'

export interface SprayEffect {
  readonly type: 'spray'
  readonly count: number
  readonly color: string
  readonly force: number
  readonly burst: boolean
  readonly playerX: number
  readonly playerY: number
  readonly lateralVelocity: number
}

export type GameEvent =
  | { readonly type: 'hud-changed'; readonly hud: HudState }
  | { readonly type: 'run-ended'; readonly stats: RunStats }
  | { readonly type: 'sound'; readonly sound: GameSound }
  | { readonly type: 'audio-speed'; readonly speed01: number; readonly active: boolean }
  | { readonly type: 'music'; readonly action: 'start'; readonly key: number }
  | { readonly type: 'music'; readonly action: 'stop' }
  | { readonly type: 'view-effect'; readonly effect: SprayEffect }

export interface GameView {
  resize(): void
  update(dt: number): void
  render(previous: GameSnapshot, current: GameSnapshot, alpha: number): void
  handleEffect(effect: SprayEffect): void
  dispose(): void
}
