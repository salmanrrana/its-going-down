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

  it('ignores negative and non-finite frame times without poisoning the accumulator', () => {
    const clock = new FixedStepClock()
    const tick = vi.fn()
    expect(clock.advance(Number.NaN, tick)).toEqual({ steps: 0, alpha: 0 })
    expect(clock.advance(Number.POSITIVE_INFINITY, tick)).toEqual({ steps: 0, alpha: 0 })
    expect(clock.advance(-1, tick)).toEqual({ steps: 0, alpha: 0 })
    expect(tick).not.toHaveBeenCalled()
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
  it('applies steering response on fixed ticks independent of render cadence', () => {
    const simulate = (fps: number): number => {
      const clock = new FixedStepClock()
      const input = new TickInputBuffer()
      let integratedSteer = 0
      for (let frame = 0; frame < fps; frame++) {
        input.sample({ steer: 1, steerSource: 'keyboard', jump: false })
        clock.advance(1 / fps, (dt) => {
          integratedSteer += input.consume(dt).steer * dt
        })
      }
      return integratedSteer
    }

    expect(simulate(30)).toBeCloseTo(simulate(120), 10)
  })

  it('retains jump until the first fixed tick and consumes it once', () => {
    const input = new TickInputBuffer()

    input.sample({ steer: 0.4, jump: true })
    input.sample({ steer: 0.7, jump: false })

    expect(input.consume()).toEqual({ steer: 0.7, jump: true })
    expect(input.consume()).toEqual({ steer: 0.7, jump: false })
  })
})
