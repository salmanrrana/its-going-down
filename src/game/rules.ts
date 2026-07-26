import { clamp } from '../core/math'

/** Collision half-width for a hazard before its visual scale is applied. */
export const OBSTACLE_HALF_WIDTH = 240

export interface SurfaceBoundsResult {
  playerX: number
  lateralV: number
  offSurface: boolean
}

/** Applies the Easy soft wall or the outer world boundary for other modes. */
export function applySurfaceBounds(
  playerX: number,
  lateralV: number,
  edge: number,
  unlosable: boolean,
): SurfaceBoundsResult {
  const offSurface = Math.abs(playerX) > edge
  if (!offSurface) return { playerX, lateralV, offSurface }

  if (unlosable) {
    return {
      playerX: clamp(playerX, -edge, edge),
      lateralV: lateralV * 0.3,
      offSurface,
    }
  }

  const hardEdge = edge * 1.9
  if (Math.abs(playerX) <= hardEdge) return { playerX, lateralV, offSurface }
  return {
    playerX: clamp(playerX, -hardEdge, hardEdge),
    lateralV: lateralV * -0.2,
    offSurface,
  }
}
