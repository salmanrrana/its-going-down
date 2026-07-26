import { isDifficultyId, isLevelId } from './levels'
import type { DifficultyId, LevelId } from './types'

export interface RunFixture {
  level: LevelId
  difficulty: DifficultyId
  seed: number
}

export interface RunSelection {
  level: LevelId
  difficulty: DifficultyId
  seed: number | null
}

export class RunFixtureError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RunFixtureError'
  }
}

/**
 * Reads a deterministic run from `?level=...&difficulty=...&seed=...`.
 * Returns null only when no fixture fields were requested; invalid requests throw.
 */
export function parseRunFixture(search: string): RunFixture | null {
  const params = new URLSearchParams(search)
  const level = params.get('level')
  const difficulty = params.get('difficulty')
  const seedText = params.get('seed')
  if (level === null && difficulty === null && seedText === null) return null

  if (!level || !difficulty || !seedText) {
    throw new RunFixtureError('Run fixture requires level, difficulty, and seed.')
  }
  if (!isLevelId(level)) throw new RunFixtureError(`Unknown fixture level: ${level}`)
  if (!isDifficultyId(difficulty)) {
    throw new RunFixtureError(`Unknown fixture difficulty: ${difficulty}`)
  }
  if (!/^\d+$/.test(seedText)) throw new RunFixtureError(`Invalid fixture seed: ${seedText}`)

  const seed = Number(seedText)
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RunFixtureError(`Invalid fixture seed: ${seedText}`)
  }

  return { level, difficulty, seed }
}

export function resolveRunSelection(
  search: string,
  fallback: Pick<RunSelection, 'level' | 'difficulty'>,
): RunSelection {
  return parseRunFixture(search) ?? { ...fallback, seed: null }
}
