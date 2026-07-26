import { describe, expect, it } from 'vitest'
import { parseRunFixture, resolveRunSelection } from '../src/game/run-fixture'

describe('browser run fixture', () => {
  it('selects a deterministic level, difficulty, and seed from the URL', () => {
    expect(parseRunFixture('?level=boat&difficulty=hard&seed=4294967295')).toEqual({
      level: 'boat',
      difficulty: 'hard',
      seed: 0xffffffff,
    })
  })

  it('applies the complete URL fixture over persisted run defaults', () => {
    expect(
      resolveRunSelection('?level=boat&difficulty=hard&seed=99', {
        level: 'snowboard',
        difficulty: 'easy',
      }),
    ).toEqual({ level: 'boat', difficulty: 'hard', seed: 99 })

    expect(
      resolveRunSelection('?level=boat&difficulty=hard', {
        level: 'snowboard',
        difficulty: 'easy',
      }),
    ).toEqual({ level: 'snowboard', difficulty: 'easy', seed: null })
  })

  it.each([
    '',
    '?level=boat&difficulty=hard',
    '?level=missing&difficulty=hard&seed=1',
    '?level=boat&difficulty=missing&seed=1',
    '?level=boat&difficulty=hard&seed=-1',
    '?level=boat&difficulty=hard&seed=1.5',
    '?level=boat&difficulty=hard&seed=4294967296',
  ])('ignores incomplete or invalid fixture query %s', (search) => {
    expect(parseRunFixture(search)).toBeNull()
  })
})
