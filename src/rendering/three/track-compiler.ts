import { MathUtils } from 'three'
import { SEGMENT_LENGTH, type Segment, type Track } from '../../game/track'

export const WORLD_SCALE = 0.001

export interface CompiledPoint {
  readonly segment: Segment
  readonly centerX: number
  readonly y: number
  readonly z: number
  readonly halfWidth: number
}

export interface TrackSample {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly halfWidth: number
  readonly heading: number
  readonly segmentIndex: number
}

export class CompiledTrack {
  readonly points: CompiledPoint[]

  constructor(readonly source: Track) {
    let centerX = 0
    let dx = 0
    this.points = source.segments.map((segment) => {
      const point = {
        segment,
        centerX: centerX * WORLD_SCALE,
        y: segment.y * WORLD_SCALE,
        z: -segment.z * WORLD_SCALE,
        halfWidth: segment.width * WORLD_SCALE,
      }
      dx += segment.curve
      centerX += dx
      return point
    })
  }

  headingAt(index: number): number {
    const a = this.points[Math.max(0, index - 1)]
    const b = this.points[Math.min(this.points.length - 1, index + 1)]
    return Math.atan2(b.centerX - a.centerX, -(b.z - a.z))
  }

  sample(position: number): TrackSample {
    const maxIndex = Math.max(0, this.points.length - 2)
    const scaledIndex = MathUtils.clamp(position / SEGMENT_LENGTH, 0, maxIndex + 0.999)
    const index = Math.min(Math.floor(scaledIndex), maxIndex)
    const t = scaledIndex - index
    const a = this.points[index]
    const b = this.points[Math.min(index + 1, this.points.length - 1)]
    const headingA = this.headingAt(index)
    const headingB = this.headingAt(Math.min(index + 1, this.points.length - 1))
    const headingDelta = Math.atan2(Math.sin(headingB - headingA), Math.cos(headingB - headingA))
    return {
      x: MathUtils.lerp(a.centerX, b.centerX, t),
      y: MathUtils.lerp(a.y, b.y, t),
      z: MathUtils.lerp(a.z, b.z, t),
      halfWidth: MathUtils.lerp(a.halfWidth, b.halfWidth, t),
      heading: headingA + headingDelta * t,
      segmentIndex: index,
    }
  }
}
