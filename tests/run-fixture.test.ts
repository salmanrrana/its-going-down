import { describe, expect, it } from 'vitest'
import {
  parseRunFixture,
  resolveRunSelection,
  RunFixtureError,
} from '../src/game/run-fixture'

const fallback = { level: 'snowboard', difficulty: 'easy' } as const

describe('browser run fixture', () => {
  it('selects a deterministic level, difficulty, and seed from the URL', () => {
    expect(parseRunFixture('?level=boat&difficulty=hard&seed=4294967295')).toEqual({
      level: 'boat',
      difficulty: 'hard',
      seed: 0xffffffff,
    })
  })

  it('distinguishes an ordinary URL with no fixture parameters', () => {
    expect(parseRunFixture('')).toBeNull()
    expect(parseRunFixture('?campaign=summer')).toBeNull()
    expect(resolveRunSelection('?campaign=summer', fallback)).toEqual({
      ...fallback,
      seed: null,
    })
  })

  it('applies the complete URL fixture over persisted run defaults', () => {
    expect(
      resolveRunSelection('?level=boat&difficulty=hard&seed=99', fallback),
    ).toEqual({ level: 'boat', difficulty: 'hard', seed: 99 })
  })

  it.each([
    '?level=boat&difficulty=hard',
    '?level=&difficulty=hard&seed=1',
    '?level=missing&difficulty=hard&seed=1',
    '?level=boat&difficulty=missing&seed=1',
    '?level=boat&difficulty=hard&seed=-1',
    '?level=boat&difficulty=hard&seed=1.5',
    '?level=boat&difficulty=hard&seed=4294967296',
  ])('detects invalid fixture query %s without falling back', (search) => {
    expect(() => parseRunFixture(search)).toThrow(RunFixtureError)
    expect(() => resolveRunSelection(search, fallback)).toThrow(RunFixtureError)
  })
})
