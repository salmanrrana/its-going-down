import { lerp } from '../core/math'
import { SEGMENT_LENGTH, type Track } from '../game/track'

export const WORLD_SCALE = 0.008
export const VISIBLE_SEGMENTS = 170
export interface CoursePoint {
  x: number
  y: number
  z: number
  index: number
}

/** Rebase around the collision position each frame to keep long runs precise. */
export function sampleCourse(
  track: Track,
  position: number,
  points: CoursePoint[],
): number {
  const base = Math.min(
    Math.floor(position / SEGMENT_LENGTH),
    track.segments.length - 1,
  )
  const fraction = (position % SEGMENT_LENGTH) / SEGMENT_LENGTH
  const current = track.segments[base]
  const next = track.segments[Math.min(base + 1, track.segments.length - 1)]
  const ground = lerp(current.y, next.y, fraction)
  let x = 0
  let dx = -current.curve * fraction
  for (let i = -20; i <= VISIBLE_SEGMENTS; i++) {
    const index = Math.max(0, Math.min(base + i, track.segments.length - 1))
    const segment = track.segments[index]
    // Extend the course past either endpoint for the chase camera and finish.
    const z = (base + i) * SEGMENT_LENGTH
    if (i > 0) {
      x += dx
      dx += segment.curve
    }
    const point = points[i + 20] ?? { x: 0, y: 0, z: 0, index: 0 }
    point.x = x * WORLD_SCALE
    point.y = (segment.y - ground) * WORLD_SCALE
    point.z = -(z - position) * WORLD_SCALE
    point.index = index
    points[i + 20] = point
  }
  return ground
}
