import { clamp } from '../core/math'

/** Collision half-width for a hazard before its visual scale is applied. */
export const OBSTACLE_HALF_WIDTH = 240

export interface SurfaceBoundsResult {
  playerX: number
  lateralV: number
  offSurface: boolean
}

/** Applies the Easy-mode soft wall while leaving other modes free to use verge drag. */
export function applySurfaceBounds(
  playerX: number,
  lateralV: number,
  edge: number,
  unlosable: boolean,
): SurfaceBoundsResult {
  const offSurface = Math.abs(playerX) > edge
  if (!offSurface || !unlosable) return { playerX, lateralV, offSurface }

  return {
    playerX: clamp(playerX, -edge, edge),
    lateralV: lateralV * 0.3,
    offSurface,
  }
}
