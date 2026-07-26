import { describe, expect, it } from 'vitest'
import { FIXED_STEP_SECONDS } from '../src/core/fixed-step'
import {
  DIFFICULTIES,
  getDifficulty,
  getLevel,
  isDifficultyId,
  isLevelId,
  LEVELS,
} from '../src/game/levels'
import { JUMP_CLEARANCE } from '../src/game/constants'
import { applySurfaceBounds } from '../src/game/rules'
import { SEGMENT_LENGTH } from '../src/game/track'
import type { DifficultyId, LevelId } from '../src/game/types'

const LEVEL_IDS = [
  'snowboard',
  'skateboard',
  'rollerblade',
  'gokart',
  'boat',
  'surf',
  'car',
] as const

const DIFFICULTY_IDS = ['easy', 'medium', 'hard'] as const

describe('level and difficulty definitions', () => {
  it('ships the seven documented level IDs in menu order', () => {
    expect(LEVELS.map((level) => level.id)).toEqual(LEVEL_IDS)
    expect(new Set(LEVELS.map((level) => level.id)).size).toBe(LEVELS.length)
  })

  it('ships the three documented difficulty IDs in increasing order', () => {
    expect(DIFFICULTIES.map((difficulty) => difficulty.id)).toEqual(DIFFICULTY_IDS)
    expect(DIFFICULTIES.map((difficulty) => difficulty.speedScale)).toEqual(
      [...DIFFICULTIES].map((difficulty) => difficulty.speedScale).sort((a, b) => a - b),
    )
    expect(DIFFICULTIES.map((difficulty) => difficulty.obstacleScale)).toEqual(
      [...DIFFICULTIES]
        .map((difficulty) => difficulty.obstacleScale)
        .sort((a, b) => a - b),
    )
  })

  it('gives all seven sports complete, viable Arcade Fidelity physics', () => {
    for (const level of LEVELS) {
      const physics = level.physics
      expect(physics.steerRate, level.id).toBeGreaterThan(10)
      expect(physics.counterSteer, level.id).toBeGreaterThan(1)
      expect(physics.airControl, level.id).toBeGreaterThan(0.2)
      expect(physics.airControl, level.id).toBeLessThan(0.6)
      expect(physics.offSurfaceSteer, level.id).toBeGreaterThan(physics.airControl)
      expect(physics.offSurfaceGrip, level.id).toBeGreaterThan(physics.grip)
      expect(physics.hillSpeed, level.id).toBeGreaterThan(0)
      expect(physics.hillSpeed, level.id).toBeLessThanOrEqual(0.15)
      expect(physics.topSpeed * 1.08 * FIXED_STEP_SECONDS, level.id).toBeLessThan(
        SEGMENT_LENGTH,
      )
      expect(
        (physics.jumpImpulse * physics.jumpImpulse) / (2 * physics.gravity),
        level.id,
      ).toBeGreaterThan(JUMP_CLEARANCE)
    }
    expect(getLevel('snowboard').physics.lean).toBeGreaterThan(getLevel('gokart').physics.lean)
    expect(getLevel('snowboard').physics.steerRate / getLevel('snowboard').physics.grip).toBeGreaterThan(
      getLevel('gokart').physics.steerRate / getLevel('gokart').physics.grip,
    )
  })

  it('resolves known definitions and rejects unknown IDs', () => {
    for (const id of LEVEL_IDS) expect(getLevel(id)).toBe(LEVELS.find((l) => l.id === id))
    for (const id of DIFFICULTY_IDS) {
      expect(getDifficulty(id)).toBe(DIFFICULTIES.find((d) => d.id === id))
    }

    expect(() => getLevel('missing' as LevelId)).toThrow('Unknown level: missing')
    expect(() => getDifficulty('missing' as DifficultyId)).toThrow(
      'Unknown difficulty: missing',
    )
    expect(isLevelId('surf')).toBe(true)
    expect(isLevelId('missing')).toBe(false)
    expect(isDifficultyId('medium')).toBe(true)
    expect(isDifficultyId('nightmare')).toBe(false)
  })
})

describe('Easy mode invariants', () => {
  const easy = getDifficulty('easy')

  it('has no lives, no required manual jump, and active steering assist', () => {
    expect(easy.lives).toBe(0)
    expect(easy.jumpEnabled).toBe(false)
    expect(easy.assist).toBeGreaterThan(0)
  })

  it('keeps the player on the surface with a soft wall', () => {
    expect(applySurfaceBounds(1250, 400, 1000, true)).toEqual({
      playerX: 1000,
      lateralV: 120,
      offSurface: true,
    })
    expect(applySurfaceBounds(-1250, -400, 1000, true)).toEqual({
      playerX: -1000,
      lateralV: -120,
      offSurface: true,
    })
  })

  it('keeps other difficulties free on the verge but inside the outer boundary', () => {
    expect(applySurfaceBounds(500, 400, 1000, false)).toEqual({
      playerX: 500,
      lateralV: 400,
      offSurface: false,
    })
    expect(applySurfaceBounds(1250, 400, 1000, false)).toEqual({
      playerX: 1250,
      lateralV: 400,
      offSurface: true,
    })
    expect(applySurfaceBounds(2000, 400, 1000, false)).toEqual({
      playerX: 1900,
      lateralV: -80,
      offSurface: true,
    })
    expect(applySurfaceBounds(-2000, -400, 1000, false)).toEqual({
      playerX: -1900,
      lateralV: 80,
      offSurface: true,
    })
  })
})
