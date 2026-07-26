import { DIFFICULTIES, LEVELS } from './levels'
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

function isLevelId(value: string): value is LevelId {
  return LEVELS.some((level) => level.id === value)
}

function isDifficultyId(value: string): value is DifficultyId {
  return DIFFICULTIES.some((difficulty) => difficulty.id === value)
}

/**
 * Reads a deterministic run from `?level=...&difficulty=...&seed=...`.
 * All three values are required so ordinary links never partially override a run.
 */
export function parseRunFixture(search: string): RunFixture | null {
  const params = new URLSearchParams(search)
  const level = params.get('level')
  const difficulty = params.get('difficulty')
  const seedText = params.get('seed')

  if (!level || !difficulty || !seedText) return null
  if (!isLevelId(level) || !isDifficultyId(difficulty)) return null
  if (!/^\d+$/.test(seedText)) return null

  const seed = Number(seedText)
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) return null

  return { level, difficulty, seed }
}

export function resolveRunSelection(
  search: string,
  fallback: Pick<RunSelection, 'level' | 'difficulty'>,
): RunSelection {
  const fixture = parseRunFixture(search)
  return fixture ?? { ...fallback, seed: null }
}
