import { describe, expect, it } from 'vitest'
import { PLAYER_HALF_WIDTH } from '../src/game/renderer'
import { OBSTACLE_HALF_WIDTH } from '../src/game/rules'
import { generateTrack, type Segment } from '../src/game/track'
import { RUN_FIXTURES } from './fixtures/runs'

function widestObstacleGap(segment: Segment): number {
  const blocked = segment.obstacles
    .map((obstacle) => ({
      start: Math.max(-segment.width, obstacle.x - OBSTACLE_HALF_WIDTH * obstacle.scale),
      end: Math.min(segment.width, obstacle.x + OBSTACLE_HALF_WIDTH * obstacle.scale),
    }))
    .sort((a, b) => a.start - b.start)

  let cursor = -segment.width
  let widest = 0
  for (const interval of blocked) {
    widest = Math.max(widest, interval.start - cursor)
    cursor = Math.max(cursor, interval.end)
  }
  return Math.max(widest, segment.width - cursor)
}

const GENERATED_RUNS = RUN_FIXTURES.map((fixture) => ({
  ...fixture,
  track: generateTrack(fixture.level, fixture.difficulty, fixture.seed),
}))

describe('seeded track generation', () => {
  it('reproduces the same complete track for every run fixture', () => {
    for (const { level, difficulty, seed } of RUN_FIXTURES) {
      const first = generateTrack(level, difficulty, seed)
      const second = generateTrack(level, difficulty, seed)

      expect(
        second,
        `${level.id}/${difficulty.id}/${seed}`,
      ).toEqual(first)
    }
  })

  it('changes the generated track when the seed changes', () => {
    const { level, difficulty, seed } = RUN_FIXTURES[0]
    const first = generateTrack(level, difficulty, seed)
    const next = generateTrack(level, difficulty, (seed + 1) >>> 0)

    expect(next).not.toEqual(first)
  })

  it('preserves a collision-safe obstacle gap for every fixture', () => {
    for (const { level, difficulty, seed, track } of GENERATED_RUNS) {
      expect(difficulty.minGap).toBeGreaterThan(PLAYER_HALF_WIDTH * 2)

      for (const segment of track.segments) {
        if (segment.obstacles.length === 0) continue
        const context = `${level.id}/${difficulty.id}/${seed} segment ${segment.index}`

        expect(widestObstacleGap(segment), context).toBeGreaterThanOrEqual(
          difficulty.minGap,
        )
      }
    }
  })

  it('keeps every generated ramp and its landing zone free of obstacles', () => {
    for (const { level, difficulty, seed, track } of GENERATED_RUNS) {
      for (const segment of track.segments) {
        if (!segment.ramp) continue

        const landing = track.segments.slice(segment.index, segment.index + 26)
        expect(
          landing.every((candidate) => candidate.obstacles.length === 0),
          `${level.id}/${difficulty.id}/${seed} ramp at segment ${segment.index}`,
        ).toBe(true)
      }
    }
  })

  it('limits every Easy obstacle cluster to one hazard', () => {
    for (const { difficulty, track } of GENERATED_RUNS) {
      if (difficulty.id !== 'easy') continue
      expect(Math.max(...track.segments.map((segment) => segment.obstacles.length))).toBe(1)
    }
  })
})
