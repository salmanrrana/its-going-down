import { describe, expect, it } from 'vitest'
import { DIFFICULTIES, LEVELS } from '../../../game/levels'
import { generateTrack } from '../../../game/track'
import { compileTrack3D } from '../../../game/track/index'
import { ProceduralWorld } from '../procedural-world'
import { QUALITY_PROFILES } from '../quality'
import {
  createSnowTreePlacements,
  SnowWorldBuilder,
  snowMaterialSpec,
} from '../snow-world-builder'
import { createWorldBuilder } from '../world-builder'

function compile(levelIndex: number, seed = 2026) {
  const level = LEVELS[levelIndex]
  const track = generateTrack(level, DIFFICULTIES[1], seed)
  const compiled = compileTrack3D(track, {
    trackId: `snow-world-test:${level.id}`,
    simulationUnitsPerRenderUnit: 1000,
  })
  return { level, track, compiled }
}

describe('snow world deterministic helpers', () => {
  it('places repeatable tree clusters safely outside the visible piste corridor', () => {
    const { compiled } = compile(0)
    const first = createSnowTreePlacements(compiled, 0.7)
    const second = createSnowTreePlacements(compiled, 0.7)

    expect(first).toEqual(second)
    expect(first.length).toBeGreaterThan(80)
    for (const tree of first) {
      const sample = compiled.samples[tree.sampleIndex]
      expect(Math.abs(tree.lateral)).toBeGreaterThan(sample.halfWidth * 1.45 + 2)
      expect(tree.variant).toBeGreaterThanOrEqual(0)
      expect(tree.variant).toBeLessThan(3)
    }
  })

  it('keeps mobile density adaptive without stripping the alpine composition bare', () => {
    const { compiled } = compile(0)
    const low = createSnowTreePlacements(compiled, QUALITY_PROFILES.low.sceneryDensity)
    const high = createSnowTreePlacements(compiled, QUALITY_PROFILES.high.sceneryDensity)

    expect(low.length).toBeGreaterThan(50)
    expect(low.length).toBeLessThan(high.length)
  })

  it('returns stable snow material roles with matte, non-metallic response', () => {
    expect(snowMaterialSpec('powder')).toMatchObject({ roughness: 0.92, metalness: 0 })
    expect(snowMaterialSpec('pineDark').flatShading).toBe(true)
  })
})

describe('world builder selection', () => {
  it('selects the dedicated snow builder only for snowboard', () => {
    const snow = compile(0)
    const snowWorld = createWorldBuilder(
      snow.track,
      snow.compiled,
      snow.level,
      QUALITY_PROFILES.low,
    )
    expect(snowWorld).toBeInstanceOf(SnowWorldBuilder)
    expect(
      QUALITY_PROFILES.low.drawDistance * snowWorld.visualProfile.cameraFarScale
        + snowWorld.visualProfile.cameraFarPadding,
    ).toBeGreaterThan(74)
    snowWorld.dispose()

    const street = compile(1)
    const streetWorld = createWorldBuilder(
      street.track,
      street.compiled,
      street.level,
      QUALITY_PROFILES.low,
    )
    expect(streetWorld).toBeInstanceOf(ProceduralWorld)
    streetWorld.dispose()
  })
})
