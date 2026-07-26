import { clamp, lerp } from '../core/math'
import type { GameSnapshot } from './contracts'

export type RenderState = Pick<
  GameSnapshot,
  | 'playerX'
  | 'playerY'
  | 'position'
  | 'speed'
  | 'speed01'
  | 'lateralVelocity'
  | 'verticalVelocity'
  | 'steer'
  | 'carve'
  | 'landingImpact'
  | 'lean'
  | 'spin'
  | 'time'
  | 'hurt'
  | 'shake'
  | 'airborne'
>

export function interpolateRenderState(
  previous: GameSnapshot,
  current: GameSnapshot,
  alpha: number,
): RenderState {
  const t = clamp(alpha, 0, 1)
  return {
    playerX: lerp(previous.playerX, current.playerX, t),
    playerY: lerp(previous.playerY, current.playerY, t),
    position: lerp(previous.position, current.position, t),
    speed: lerp(previous.speed, current.speed, t),
    speed01: lerp(previous.speed01, current.speed01, t),
    lateralVelocity: lerp(previous.lateralVelocity, current.lateralVelocity, t),
    verticalVelocity: lerp(previous.verticalVelocity, current.verticalVelocity, t),
    steer: lerp(previous.steer, current.steer, t),
    carve: lerp(previous.carve, current.carve, t),
    landingImpact: lerp(previous.landingImpact, current.landingImpact, t),
    lean: lerp(previous.lean, current.lean, t),
    spin: lerp(previous.spin, current.spin, t),
    time: lerp(previous.time, current.time, t),
    hurt: lerp(previous.hurt, current.hurt, t),
    shake: lerp(previous.shake, current.shake, t),
    airborne: current.airborne,
  }
}
