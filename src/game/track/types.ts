import type {
  DifficultyId,
  LevelId,
  ObstacleKind,
  SceneryKind,
} from '../types'

/** Renderer-neutral Cartesian vector. All compiled positions use render units. */
export interface Vec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

/**
 * Right-handed local course frame: +tangent is downhill, +right is the positive
 * lateral direction, and +normal points away from the course surface.
 */
export interface TrackFrame {
  readonly tangent: Vec3
  readonly right: Vec3
  readonly normal: Vec3
}

export interface CompiledTrackSample {
  readonly index: number
  /** Null only for the synthetic terminal endpoint after the final segment. */
  readonly sourceSegmentIndex: number | null
  readonly terminal: boolean
  /** Original longitudinal segment coordinate, in simulation units. */
  readonly sourceZ: number
  /** Center of the course surface, in render units. */
  readonly position: Vec3
  readonly frame: TrackFrame
  /** Drivable half-width, in render units. */
  readonly halfWidth: number
  /** Source surface height converted to render units. */
  readonly elevation: number
  /** Arc distance from sample zero, in render units. */
  readonly cumulativeDistance: number
  readonly dark: boolean
}

export type CompiledEntityCategory = 'obstacle' | 'scenery' | 'coin' | 'ramp'

export interface CompiledTransform {
  /** Surface anchor; renderers may add asset-specific vertical offsets. */
  readonly position: Vec3
  readonly frame: TrackFrame
}

interface CompiledEntityBase {
  readonly id: string
  readonly category: CompiledEntityCategory
  readonly sourceSegmentIndex: number
  readonly sourceOrdinal: number
  /** Original lateral offset from the course center, in simulation units. */
  readonly lateralOffset: number
  readonly transform: CompiledTransform
}

export interface CompiledObstacle extends CompiledEntityBase {
  readonly category: 'obstacle'
  readonly kind: ObstacleKind
  readonly visualScale: number
}

export interface CompiledScenery extends CompiledEntityBase {
  readonly category: 'scenery'
  readonly kind: SceneryKind
  readonly visualScale: number
}

export interface CompiledCoin extends CompiledEntityBase {
  readonly category: 'coin'
  readonly kind: 'coin'
  readonly visualScale: number
}

export interface CompiledRamp extends CompiledEntityBase {
  readonly category: 'ramp'
  readonly kind: 'ramp'
  /** Gameplay half-width converted to render units. */
  readonly halfWidth: number
  /** One source segment by convention; geometry can span this distance. */
  readonly length: number
  readonly power: number
}

export type CompiledEntity =
  | CompiledObstacle
  | CompiledScenery
  | CompiledCoin
  | CompiledRamp

export interface CompiledBounds {
  readonly min: Vec3
  readonly max: Vec3
}

/**
 * Chunk ranges are half-open. Geometry ranges include a one-sample halo where
 * available, so independently built neighboring meshes share identical seams.
 */
export interface CompiledTrackChunk {
  readonly id: string
  readonly index: number
  readonly sourceSegmentStart: number
  readonly sourceSegmentEndExclusive: number
  readonly geometrySampleStart: number
  readonly geometrySampleEndExclusive: number
  readonly startSeamSampleIndex: number
  readonly endSeamSampleIndex: number
  readonly startDistance: number
  readonly endDistance: number
  /** Suggested moving-world-root origin for this chunk. */
  readonly origin: Vec3
  readonly bounds: CompiledBounds
  readonly entityIds: readonly string[]
}

export interface CompiledSourceRun {
  readonly levelId: LevelId
  readonly difficultyId: DifficultyId
  readonly seed: number
}

export interface CompiledTrack3D {
  readonly trackId: string
  readonly simulationUnitsPerRenderUnit: number
  readonly sourceRun: CompiledSourceRun | null
  readonly sourceTotalLength: number
  readonly totalDistance: number
  readonly samples: readonly CompiledTrackSample[]
  /** Array index is the source segment index; value is the compiled sample index. */
  readonly sampleBySourceSegment: readonly number[]
  readonly entities: readonly CompiledEntity[]
  readonly obstacles: readonly CompiledObstacle[]
  readonly scenery: readonly CompiledScenery[]
  readonly coins: readonly CompiledCoin[]
  readonly ramps: readonly CompiledRamp[]
  readonly chunks: readonly CompiledTrackChunk[]
}

export interface TrackCompilationOptions {
  /** Stable namespace included in entity and chunk IDs. */
  readonly trackId: string
  /** Defaults to 100 simulation units per render unit. */
  readonly simulationUnitsPerRenderUnit?: number
  /** Defaults to 128 source segments per streamed chunk. */
  readonly chunkSegmentCount?: number
  readonly sourceRun?: CompiledSourceRun
}

export interface GeneratedTrackCompilationOptions {
  readonly simulationUnitsPerRenderUnit?: number
  readonly chunkSegmentCount?: number
  readonly trackId?: string
}
