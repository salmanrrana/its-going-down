import { describe, expect, it } from 'vitest'
import { touchSteerFromPosition } from '../input'
import { SteeringRamp, steeringCurve } from '../steering'

describe('steering input shaping', () => {
  it('has a neutral dead zone and a progressive response to full lock', () => {
    expect(steeringCurve(0)).toBe(0)
    expect(steeringCurve(0.08)).toBe(0)
    expect(steeringCurve(-0.08)).toBe(0)
    expect(steeringCurve(0.25)).toBeGreaterThan(0)
    expect(steeringCurve(0.25)).toBeLessThan(0.25)
    expect(steeringCurve(0.65)).toBeGreaterThan(steeringCurve(0.25) * 2)
    expect(steeringCurve(1)).toBe(1)
    expect(steeringCurve(-0.65)).toBeCloseTo(-steeringCurve(0.65))
  })

  it('ramps digital steering smoothly and counter-steers faster than turn-in', () => {
    const ramp = new SteeringRamp()
    const turnIn = ramp.update(1, 'keyboard', 1 / 60)
    expect(turnIn).toBeCloseTo(0.15)

    for (let i = 0; i < 5; i++) ramp.update(1, 'keyboard', 1 / 60)
    const beforeCounter = ramp.update(-1, 'keyboard', 1 / 60)
    expect(beforeCounter).toBeLessThan(0.7)
    expect(ramp.update(-1, 'keyboard', 1 / 60)).toBeLessThan(beforeCounter)
  })

  it('converges to the same held value across render cadences', () => {
    const at30 = new SteeringRamp()
    const at120 = new SteeringRamp()
    for (let i = 0; i < 30; i++) at30.update(0.72, 'touch', 1 / 30)
    for (let i = 0; i < 120; i++) at120.update(0.72, 'touch', 1 / 120)
    expect(at30.update(0.72, 'touch', 0)).toBeCloseTo(at120.update(0.72, 'touch', 0), 10)
  })
})

describe('touch steering geometry', () => {
  it('is neutral at centre without a forced direction', () => {
    expect(touchSteerFromPosition(500, 500, 1000)).toBe(0)
  })

  it('changes continuously across centre and preserves drag intent', () => {
    const left = touchSteerFromPosition(499, 500, 1000)
    const centre = touchSteerFromPosition(500, 500, 1000)
    const right = touchSteerFromPosition(501, 500, 1000)
    expect(left).toBeLessThan(centre)
    expect(right).toBeGreaterThan(centre)
    expect(right - left).toBeLessThan(0.01)
    expect(touchSteerFromPosition(600, 500, 1000)).toBeGreaterThan(right)
  })

  it('clamps large drags and mirrors left/right behavior', () => {
    expect(touchSteerFromPosition(1200, 500, 1000)).toBe(1)
    expect(touchSteerFromPosition(-200, 500, 1000)).toBe(-1)
    expect(touchSteerFromPosition(750, 500, 1000)).toBeCloseTo(
      -touchSteerFromPosition(250, 500, 1000),
    )
  })
})
