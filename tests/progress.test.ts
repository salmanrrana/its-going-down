import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DIFFICULTIES, LEVELS } from '../src/game/levels'
import {
  loadProgress,
  PROGRESS_STORAGE_KEY,
  runKey,
  saveProgress,
  type Progress,
} from '../src/ui/screens'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

const defaults: Progress = {
  bestScores: {},
  cleared: [],
  lastLevel: 'snowboard',
  lastDifficulty: 'easy',
  muted: false,
}

describe('progress persistence', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage())
  })

  it('creates a unique score key for every level and difficulty', () => {
    const keys = LEVELS.flatMap((level) =>
      DIFFICULTIES.map((difficulty) => runKey(level.id, difficulty.id)),
    )

    expect(keys).toHaveLength(21)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toContain('snowboard:easy')
    expect(keys).toContain('car:hard')
  })

  it('round-trips valid progress through the versioned storage key', () => {
    const progress: Progress = {
      bestScores: { [runKey('surf', 'hard')]: 12345 },
      cleared: [runKey('surf', 'hard')],
      lastLevel: 'surf',
      lastDifficulty: 'hard',
      muted: true,
    }

    saveProgress(progress)

    expect(localStorage.getItem(PROGRESS_STORAGE_KEY)).toBe(JSON.stringify(progress))
    expect(loadProgress()).toEqual(progress)
  })

  it('rejects malformed IDs, score values, score keys, and cleared keys', () => {
    localStorage.setItem(
      PROGRESS_STORAGE_KEY,
      JSON.stringify({
        bestScores: {
          'snowboard:easy': 900,
          'skateboard:easy': '800',
          'rollerblade:easy': null,
          'gokart:easy': false,
          'boat:easy': [],
          'snowboard:nightmare': 500,
          'missing:easy': 400,
          'car:hard': -1,
          'surf:medium': Number.NaN,
          'surf:hard': 1.5,
          'car:medium': Number.MAX_SAFE_INTEGER + 1,
        },
        cleared: ['snowboard:easy', 'snowboard:easy', 'missing:easy', 42],
        lastLevel: 'missing',
        lastDifficulty: 'nightmare',
        muted: 'yes',
      }),
    )

    expect(loadProgress()).toEqual({
      ...defaults,
      bestScores: { 'snowboard:easy': 900 },
      cleared: ['snowboard:easy'],
    })
  })

  it('falls back safely for corrupted or unavailable storage', () => {
    localStorage.setItem(PROGRESS_STORAGE_KEY, '{bad json')
    expect(loadProgress()).toEqual(defaults)

    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(loadProgress()).toEqual(defaults)
    expect(() => saveProgress(defaults)).not.toThrow()
  })
})
