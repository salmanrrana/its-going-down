import { describe, expect, it } from 'vitest'
import { DIFFICULTIES, getDifficulty, getLevel, LEVELS } from '../src/game/levels'
import { applySurfaceBounds } from '../src/game/rules'
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

  it('resolves known definitions and rejects unknown IDs', () => {
    for (const id of LEVEL_IDS) expect(getLevel(id)).toBe(LEVELS.find((l) => l.id === id))
    for (const id of DIFFICULTY_IDS) {
      expect(getDifficulty(id)).toBe(DIFFICULTIES.find((d) => d.id === id))
    }

    expect(() => getLevel('missing' as LevelId)).toThrow('Unknown level: missing')
    expect(() => getDifficulty('missing' as DifficultyId)).toThrow(
      'Unknown difficulty: missing',
    )
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

  it('does not apply the unlosable wall to other difficulties', () => {
    expect(applySurfaceBounds(1250, 400, 1000, false)).toEqual({
      playerX: 1250,
      lateralV: 400,
      offSurface: true,
    })
  })
})
