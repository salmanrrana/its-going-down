import { clamp, moveTowards } from './math'

export type SteeringSource = 'instant' | 'keyboard' | 'touch' | 'release'

const STEER_DEAD_ZONE = 0.08

/**
 * Removes controller noise while preserving precise small corrections and full lock.
 * The quadratic blend is gentler around centre than a linear map without making the
 * last half of the control range feel flat.
 */
export function steeringCurve(raw: number): number {
  const value = clamp(Number.isFinite(raw) ? raw : 0, -1, 1)
  const magnitude = Math.abs(value)
  if (magnitude <= STEER_DEAD_ZONE) return 0
  const normalized = (magnitude - STEER_DEAD_ZONE) / (1 - STEER_DEAD_ZONE)
  const progressive = normalized * 0.42 + normalized * normalized * 0.58
  return Math.sign(value) * progressive
}

function steeringRampRate(source: SteeringSource, counterSteering: boolean): number {
  if (source === 'instant') return Number.POSITIVE_INFINITY
  if (counterSteering) return source === 'touch' ? 24 : 20
  if (source === 'touch') return 14
  if (source === 'keyboard') return 9
  return 12
}

/** Source-aware fixed-tick slew limiting; reversals are intentionally fastest. */
export class SteeringRamp {
  private value = 0

  update(target: number, source: SteeringSource, dt: number): number {
    if (source === 'instant') {
      this.value = clamp(Number.isFinite(target) ? target : 0, -1, 1)
      return this.value
    }
    const desired = steeringCurve(target)
    const counterSteering =
      this.value !== 0 && desired !== 0 && Math.sign(this.value) !== Math.sign(desired)
    const safeDt = Number.isFinite(dt) ? dt : 0
    const step = steeringRampRate(source, counterSteering) * clamp(safeDt, 0, 0.1)
    this.value = moveTowards(this.value, desired, step)
    if (Math.abs(this.value) < 1e-6) this.value = 0
    return this.value
  }

  reset(): void {
    this.value = 0
  }
}
