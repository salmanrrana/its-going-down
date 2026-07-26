import type { LevelDef, LevelId, ObstacleKind, SceneryKind } from '../game/types'
import { paintActorFrames, type ActorFrames } from './actors'
import { paintBackdrop, type Backdrop, type TerrainProfile } from './backdrop'
import type { Sprite } from './canvas'
import { paintCoin, paintObstacleVariants, paintRamp } from './obstacles'
import { paintSceneryVariants } from './scenery'

export type { Sprite } from './canvas'
export type { ActorFrames } from './actors'
export type { Backdrop, BackdropLayer } from './backdrop'
export { LEAN_FRAMES, selectLeanFrame } from './actors'
export { STRIP_WIDTH } from './backdrop'

/** The land each place actually sits in. Only real mountains get snow caps. */
const TERRAIN: Record<LevelId, TerrainProfile> = {
  snowboard: 'alpine',
  skateboard: 'rocky',
  rollerblade: 'coastal',
  gokart: 'rocky',
  car: 'rocky',
  boat: 'coastal',
  surf: 'coastal',
}

/**
 * Every sprite a level needs, painted once when the level loads.
 *
 * Painting is the expensive part and it happens off the frame budget; from then
 * on the renderer only blits. A full snow level is a few dozen canvases, well
 * under a megabyte of GPU-backed surface.
 */
export class ArtLibrary {
  readonly backdrop: Backdrop
  readonly actor: ActorFrames
  readonly coin: Sprite
  readonly ramp: Sprite

  private scenery = new Map<SceneryKind, Sprite[]>()
  private obstacles = new Map<ObstacleKind, Sprite[]>()

  constructor(level: LevelDef, seed: number) {
    const snowy = level.id === 'snowboard'
    const seaside = level.id === 'rollerblade' || level.id === 'surf' || level.id === 'boat'

    this.backdrop = paintBackdrop(level.palette, seed, TERRAIN[level.id])
    this.actor = paintActorFrames(level.id)
    // Coins are gold in every level, matching the HUD's counter. A per-level
    // accent made the snow level's coins ice-blue and unreadable as pickups.
    this.coin = paintCoin('#ffc233')
    this.ramp = paintRamp(level.palette.accent, snowy)

    for (const kind of new Set(level.scenery)) {
      this.scenery.set(
        kind,
        paintSceneryVariants(kind, { snowy, seaside, accent: level.palette.accent }),
      )
    }
    for (const kind of new Set(level.obstacles)) {
      this.obstacles.set(kind, paintObstacleVariants(kind, { snowy }))
    }
  }

  /**
   * Picks a variant deterministically from the prop's own scale, so a given
   * prop always paints as the same tree across frames and across replays.
   */
  sceneryFor(kind: SceneryKind, variantKey: number): Sprite | null {
    const list = this.scenery.get(kind)
    if (!list || list.length === 0) return null
    return list[Math.floor(Math.abs(variantKey) * 1000) % list.length]
  }

  obstacleFor(kind: ObstacleKind, variantKey: number): Sprite | null {
    const list = this.obstacles.get(kind)
    if (!list || list.length === 0) return null
    return list[Math.floor(Math.abs(variantKey) * 1000) % list.length]
  }
}
