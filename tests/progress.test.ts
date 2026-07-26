import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DIFFICULTIES, LEVELS } from '../src/game/levels'
import {
  loadProgress,
  Modal,
  PROGRESS_STORAGE_KEY,
  resolvePersistenceIssue,
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

class FakeElement {
  className = ''
  hidden = false
  innerHTML = ''

  constructor(private card: FakeElement | null = null) {}

  querySelector(selector: string): FakeElement | null {
    return selector === '[data-role="card"]' ? this.card : null
  }

  addEventListener(): void {}
  focus(): void {}
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

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
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

    expect(saveProgress(progress)).toEqual({ ok: true })

    expect(localStorage.getItem(PROGRESS_STORAGE_KEY)).toBe(JSON.stringify(progress))
    expect(loadProgress()).toEqual({ progress, issue: null })
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
      progress: {
        ...defaults,
        bestScores: { 'snowboard:easy': 900 },
        cleared: ['snowboard:easy'],
      },
      issue: null,
    })
  })

  it.each(['{bad json', ''])('reports malformed stored data %j while falling back safely', (stored) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem(PROGRESS_STORAGE_KEY, stored)

    const result = loadProgress()

    expect(result.progress).toEqual(defaults)
    expect(result.issue).toMatchObject({ kind: 'malformed-data' })
    expect(result.issue?.error).toBeInstanceOf(SyntaxError)
    expect(warn).toHaveBeenCalledWith(
      '[progress:malformed-data] Saved progress is malformed; using defaults.',
      expect.objectContaining({
        storageKey: PROGRESS_STORAGE_KEY,
        error: result.issue?.error,
      }),
    )
  })

  it('reports unavailable storage separately and returns an explicit save failure', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const loadError = new Error('read blocked')
    const saveError = new Error('write blocked')
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw loadError
      },
      setItem: () => {
        throw saveError
      },
    })

    const loaded = loadProgress()
    const saved = saveProgress(defaults)

    expect(loaded).toEqual({
      progress: defaults,
      issue: expect.objectContaining({
        kind: 'storage-unavailable',
        error: loadError,
      }),
    })
    expect(saved).toEqual({
      ok: false,
      issue: expect.objectContaining({
        kind: 'save-failed',
        error: saveError,
      }),
    })
    if (saved.ok) throw new Error('Expected save failure')
    expect(resolvePersistenceIssue(saved.issue, { ok: true })).toBeNull()
    expect(resolvePersistenceIssue(loaded.issue, { ok: true })).toBe(loaded.issue)
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('shows persistence failures as a non-blocking results warning', () => {
    const card = new FakeElement()
    const root = new FakeElement(card)
    vi.stubGlobal('document', { createElement: () => root })
    const modal = new Modal({
      onResume: () => {},
      onRestart: () => {},
      onQuit: () => {},
    })

    modal.showResults(
      {
        score: 500,
        coins: 3,
        hits: 1,
        bestAir: 0.5,
        timeSeconds: 30,
        progress01: 1,
        completed: true,
      },
      'Snowboard',
      'slope',
      true,
      500,
      'Progress could not be saved on this device.',
    )

    expect(card.innerHTML).toContain('class="modal__warning"')
    expect(card.innerHTML).toContain('Progress could not be saved on this device.')
    expect(root.hidden).toBe(false)
  })
})
