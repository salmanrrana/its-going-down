import { describe, expect, it } from 'vitest'
import { QUALITY_PROFILES, selectQualityLevel } from '../quality'

describe('Three renderer quality selection', () => {
  it('uses low quality for memory-constrained mobile devices', () => {
    expect(
      selectQualityLevel({
        width: 390,
        height: 844,
        devicePixelRatio: 3,
        hardwareConcurrency: 4,
        deviceMemory: 4,
        coarsePointer: true,
      }),
    ).toBe('low')
  })

  it('uses medium quality for touch-first or reduced-motion devices', () => {
    expect(
      selectQualityLevel({
        width: 1024,
        height: 768,
        devicePixelRatio: 1,
        hardwareConcurrency: 8,
        coarsePointer: true,
      }),
    ).toBe('medium')
  })

  it('uses high quality for capable desktop viewports', () => {
    expect(
      selectQualityLevel({
        width: 1440,
        height: 900,
        devicePixelRatio: 1,
        hardwareConcurrency: 12,
        deviceMemory: 8,
      }),
    ).toBe('high')
  })

  it('keeps every quality profile bounded', () => {
    expect(QUALITY_PROFILES.low.maxDpr).toBeLessThan(QUALITY_PROFILES.medium.maxDpr)
    expect(QUALITY_PROFILES.medium.maxDpr).toBeLessThan(QUALITY_PROFILES.high.maxDpr)
    expect(QUALITY_PROFILES.low.maxParticles).toBeLessThan(QUALITY_PROFILES.high.maxParticles)
    expect(QUALITY_PROFILES.low.drawDistance).toBeLessThan(QUALITY_PROFILES.high.drawDistance)
  })
})
