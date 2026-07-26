import { describe, expect, it, vi } from 'vitest'
import { FIXED_STEP_SECONDS, FixedStepClock, TickInputBuffer } from '../fixed-step'

describe('FixedStepClock', () => {
  it('runs fixed 60Hz ticks and reports interpolation alpha', () => {
    const clock = new FixedStepClock()
    const tick = vi.fn()

    const result = clock.advance(FIXED_STEP_SECONDS * 2.5, tick)
    expect(result.steps).toBe(2)
    expect(result.alpha).toBeCloseTo(0.5)
    expect(tick).toHaveBeenCalledTimes(2)
    expect(tick).toHaveBeenNthCalledWith(1, FIXED_STEP_SECONDS)
  })

  it('caps catch-up work after a long frame', () => {
    const clock = new FixedStepClock()
    const tick = vi.fn()

    const result = clock.advance(10, tick)

    expect(result.steps).toBe(5)
    expect(result.alpha).toBeCloseTo(0)
    expect(tick).toHaveBeenCalledTimes(5)
  })

  it('drops accumulated time when reset across lifecycle transitions', () => {
    const clock = new FixedStepClock()
    clock.advance(FIXED_STEP_SECONDS * 0.75, () => {})
    clock.reset()

    expect(clock.advance(FIXED_STEP_SECONDS * 0.5, () => {})).toEqual({
      steps: 0,
      alpha: 0.5,
    })
  })
})

describe('TickInputBuffer', () => {
  it('retains jump until the first fixed tick and consumes it once', () => {
    const input = new TickInputBuffer()

    input.sample({ steer: 0.4, jump: true })
    input.sample({ steer: 0.7, jump: false })

    expect(input.consume()).toEqual({ steer: 0.7, jump: true })
    expect(input.consume()).toEqual({ steer: 0.7, jump: false })
  })
})
