import type { InputFrame } from '../game/contracts'

export const FIXED_STEP_SECONDS = 1 / 60
export const MAX_CATCH_UP_STEPS = 5

export interface FixedStepResult {
  steps: number
  alpha: number
}

/** Holds an edge-triggered jump until a tick can consume it exactly once. */
export class TickInputBuffer {
  private steer = 0
  private jumpPending = false

  sample(input: InputFrame): void {
    this.steer = input.steer
    this.jumpPending ||= input.jump
  }

  consume(): InputFrame {
    const input = { steer: this.steer, jump: this.jumpPending }
    this.jumpPending = false
    return input
  }

  clear(): void {
    this.steer = 0
    this.jumpPending = false
  }
}

/** A bounded accumulator that keeps simulation ticks independent of render cadence. */
export class FixedStepClock {
  private accumulator = 0

  constructor(
    private readonly stepSeconds = FIXED_STEP_SECONDS,
    private readonly maxCatchUpSteps = MAX_CATCH_UP_STEPS,
  ) {}

  advance(elapsedSeconds: number, step: (dt: number) => void): FixedStepResult {
    const boundedElapsed = Math.min(
      Math.max(elapsedSeconds, 0),
      this.stepSeconds * this.maxCatchUpSteps,
    )
    this.accumulator += boundedElapsed

    let steps = 0
    while (this.accumulator + Number.EPSILON >= this.stepSeconds && steps < this.maxCatchUpSteps) {
      step(this.stepSeconds)
      this.accumulator -= this.stepSeconds
      steps++
    }

    if (this.accumulator < 0) this.accumulator = 0
    return { steps, alpha: this.accumulator / this.stepSeconds }
  }

  reset(): void {
    this.accumulator = 0
  }
}
