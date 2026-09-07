import { describe, expect, it } from 'vitest'
import { OBSTACLE_HALF_WIDTH } from '../src/game/constants'
import { LEVELS, getDifficulty } from '../src/game/levels'
import { generateTrack, SEGMENT_LENGTH } from '../src/game/track'
import {
  sampleCourse,
  WORLD_SCALE,
  type CoursePoint,
} from '../src/rendering/course'
import {
  createProp,
  createRider,
  type ModelKind,
} from '../src/rendering/models'

describe('3D course alignment', () => {
  const track = generateTrack(LEVELS[0], getDifficulty('easy'), 1337)
  it('puts a hazard on the player plane exactly when the simulation reaches it', () => {
    const points: CoursePoint[] = []
    const index = 120
    sampleCourse(track, index * SEGMENT_LENGTH, points)
    expect(points[20].x).toBeCloseTo(0)
    expect(points[20].y).toBeCloseTo(0)
    expect(points[20].index).toBe(index)
    expect(points[20].z).toBeCloseTo(0)
    sampleCourse(track, (index - 1) * SEGMENT_LENGTH, points)
    expect(points[21].index).toBe(index)
    expect(points[21].z).toBe(-SEGMENT_LENGTH * WORLD_SCALE)
  })
  it('interpolates the ground under the player and reuses its bounded buffer', () => {
    const points: CoursePoint[] = []
    const position = 120.5 * SEGMENT_LENGTH
    const ground = sampleCourse(track, position, points)
    expect(ground).toBeCloseTo(
      (track.segments[120].y + track.segments[121].y) / 2,
    )
    expect((points[20].y + points[21].y) / 2).toBeCloseTo(0)
    const first = points[0]
    for (const z of [0, position, track.totalLength - 1, 0]) {
      sampleCourse(track, z, points)
      expect(points).toHaveLength(191)
      expect(points.every((p) => [p.x, p.y, p.z].every(Number.isFinite))).toBe(
        true,
      )
    }
    expect(points[0]).toBe(first)
  })
  it('interpolates the current curve across the player position', () => {
    const curvedTrack = generateTrack(LEVELS[0], getDifficulty('easy'), 1337)
    curvedTrack.segments[120].curve = 10
    curvedTrack.segments[121].curve = 20
    curvedTrack.segments[122].curve = 0
    const points: CoursePoint[] = []

    sampleCourse(curvedTrack, 120 * SEGMENT_LENGTH, points)

    expect(points[20].x).toBeCloseTo(0)
    expect(points[21].x).toBeCloseTo(10 * WORLD_SCALE)
    expect(points[22].x).toBeCloseTo(40 * WORLD_SCALE)

    sampleCourse(curvedTrack, 120.5 * SEGMENT_LENGTH, points)

    expect(points[20].x).toBeCloseTo(-5 * WORLD_SCALE)
    expect(points[21].x).toBeCloseTo(5 * WORLD_SCALE)
  })
})

describe('authored console meshes', () => {
  for (const level of LEVELS) {
    it(`${level.id} has valid mergeable geometry for every rendered object`, () => {
      const kinds = new Set<ModelKind>([
        ...level.scenery,
        ...level.obstacles,
        'coin',
        'ramp',
        'gate',
        'mountain',
        'cloud',
        'flag',
        'chalet',
        'bridge',
        'grandstand',
        'sail',
        'wake',
      ])
      for (const kind of level.obstacles) {
        const obstacle = createProp(kind, level)
        obstacle.computeBoundingBox()
        expect(obstacle.boundingBox?.min.x).toBeCloseTo(
          -OBSTACLE_HALF_WIDTH * WORLD_SCALE,
        )
        expect(obstacle.boundingBox?.max.x).toBeCloseTo(
          OBSTACLE_HALF_WIDTH * WORLD_SCALE,
        )
        obstacle.dispose()
      }
      const geometries = [
        createRider(level.id),
        ...[...kinds].map((kind) => createProp(kind, level)),
      ]
      for (const geometry of geometries) {
        expect(geometry).toBeTruthy()
        const position = geometry.getAttribute('position')
        expect(position.count).toBeGreaterThan(0)
        expect(geometry.getAttribute('color').count).toBe(position.count)
        expect(geometry.getAttribute('normal').count).toBe(position.count)
        expect([...position.array].every(Number.isFinite)).toBe(true)
        geometry.dispose()
      }
    })
  }
})
