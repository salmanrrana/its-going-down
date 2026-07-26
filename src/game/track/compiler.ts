import { lerp } from '../../core/math'
import type { DifficultyDef, LevelDef, ObstacleKind, SceneryKind } from '../types'
import { generateTrack, SEGMENT_LENGTH, type Track } from '../track'
import type {
  CompiledBounds,
  CompiledCoin,
  CompiledEntity,
  CompiledObstacle,
  CompiledRamp,
  CompiledScenery,
  CompiledSourceRun,
  CompiledTrack3D,
  CompiledTrackChunk,
  CompiledTrackSample,
  CompiledTransform,
  GeneratedTrackCompilationOptions,
  SampledTrackPoint,
  TrackCompilationOptions,
  TrackFrame,
  Vec3,
} from './types'
import {
  add,
  cross,
  distance,
  dot,
  isFiniteVector,
  negate,
  normalize,
  scale,
  subtract,
  vector,
} from './vector'

/** 100 simulation units become one renderer-neutral render unit. */
export const DEFAULT_SIMULATION_UNITS_PER_RENDER_UNIT = 100
/** 128 segments = 25,600 simulation units, or 256 default render units. */
export const DEFAULT_CHUNK_SEGMENT_COUNT = 128

const WORLD_UP = vector(0, 1, 0)
const WORLD_RIGHT = vector(1, 0, 0)
const WORLD_FORWARD = vector(0, 0, 1)

const OBSTACLE_KINDS: readonly ObstacleKind[] = [
  'rock',
  'tree',
  'cone',
  'barrel',
  'log',
  'car',
  'hydrant',
  'crate',
]
const SCENERY_KINDS: readonly SceneryKind[] = [
  'pine',
  'palm',
  'building',
  'streetlight',
  'rock',
  'buoy',
  'cactus',
  'flag',
  'reed',
]

function freezeArray<T>(values: T[]): readonly T[] {
  return Object.freeze(values)
}

function requireFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`)
}

function requirePositiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive number`)
  }
  return value
}

function isObstacleKind(kind: ObstacleKind | SceneryKind): kind is ObstacleKind {
  return OBSTACLE_KINDS.includes(kind as ObstacleKind)
}

function isSceneryKind(kind: ObstacleKind | SceneryKind): kind is SceneryKind {
  return SCENERY_KINDS.includes(kind as SceneryKind)
}

function validateOptions(options: TrackCompilationOptions): {
  simulationUnitsPerRenderUnit: number
  chunkSegmentCount: number
} {
  if (options.trackId.trim().length === 0) throw new Error('trackId must not be empty')

  const simulationUnitsPerRenderUnit = requirePositiveFinite(
    options.simulationUnitsPerRenderUnit ?? DEFAULT_SIMULATION_UNITS_PER_RENDER_UNIT,
    'simulationUnitsPerRenderUnit',
  )
  requirePositiveFinite(1 / simulationUnitsPerRenderUnit, 'render scale factor')
  const chunkSegmentCount = options.chunkSegmentCount ?? DEFAULT_CHUNK_SEGMENT_COUNT
  if (!Number.isInteger(chunkSegmentCount) || chunkSegmentCount < 2) {
    throw new Error('chunkSegmentCount must be an integer of at least 2')
  }

  return { simulationUnitsPerRenderUnit, chunkSegmentCount }
}

function calculateTangents(positions: readonly Vec3[]): readonly Vec3[] {
  return freezeArray(
    positions.map((position, index) => {
      const previous = positions[Math.max(0, index - 1)]
      const next = positions[Math.min(positions.length - 1, index + 1)]
      const forwardDifference = subtract(next, position)
      const fallbackTangent = normalize(forwardDifference, WORLD_FORWARD)
      const centeredDifference = subtract(next, previous)
      return normalize(centeredDifference, fallbackTangent)
    }),
  )
}

/**
 * Rotation-minimizing frame transport. Projecting the previous right vector onto
 * the next tangent plane avoids Frenet-frame flips at flat/inflection points.
 */
function calculateFrames(positions: readonly Vec3[]): readonly TrackFrame[] {
  const tangents = calculateTangents(positions)
  const frames: TrackFrame[] = []

  for (let index = 0; index < tangents.length; index++) {
    const tangent = tangents[index]
    let right: Vec3
    let normal: Vec3

    if (index === 0) {
      right = normalize(cross(WORLD_UP, tangent), WORLD_RIGHT)
      normal = normalize(cross(tangent, right), WORLD_UP)
      if (dot(normal, WORLD_UP) < 0) {
        right = negate(right)
        normal = negate(normal)
      }
    } else {
      const previous = frames[index - 1]
      const projectedRight = subtract(previous.right, scale(tangent, dot(previous.right, tangent)))
      right = normalize(projectedRight, normalize(cross(previous.normal, tangent), WORLD_RIGHT))
      normal = normalize(cross(tangent, right), previous.normal)

      if (dot(normal, previous.normal) < 0) {
        right = negate(right)
        normal = negate(normal)
      }

      // Rebuild right once more to remove accumulated floating-point skew.
      right = normalize(cross(normal, tangent), right)
    }

    const frame = Object.freeze({ tangent, right, normal })
    if (![frame.tangent, frame.right, frame.normal].every(isFiniteVector)) {
      throw new Error(`Unable to construct a finite frame at sample ${index}`)
    }
    frames.push(frame)
  }

  return freezeArray(frames)
}

function compileSamples(
  track: Track,
  scaleFactor: number,
): readonly CompiledTrackSample[] {
  const positions: Vec3[] = []
  let centerX = 0
  let lateralDelta = 0

  for (let index = 0; index < track.segments.length; index++) {
    const segment = track.segments[index]
    if (segment.index !== index) {
      throw new Error(`Segment ${index} has non-canonical index ${segment.index}`)
    }
    requireFinite(segment.z, `Segment ${index} z`)
    requireFinite(segment.y, `Segment ${index} y`)
    requireFinite(segment.curve, `Segment ${index} curve`)
    requirePositiveFinite(segment.width, `Segment ${index} width`)
    if (segment.z !== index * SEGMENT_LENGTH) {
      throw new Error(`Segment ${index} has non-canonical z ${segment.z}`)
    }

    const position = vector(
      centerX * scaleFactor,
      segment.y * scaleFactor,
      segment.z * scaleFactor,
    )
    if (!isFiniteVector(position)) throw new Error(`Segment ${index} produced a non-finite position`)
    positions.push(position)

    // This is the same curve double-integration order used by the existing
    // renderer: project the current center, then update delta and center.
    lateralDelta += segment.curve
    centerX += lateralDelta
    requireFinite(lateralDelta, `Segment ${index} integrated curve delta`)
    requireFinite(centerX, `Segment ${index} integrated center`)
  }

  const lastSegment = track.segments[track.segments.length - 1]
  const terminalPosition = vector(
    centerX * scaleFactor,
    lastSegment.y * scaleFactor,
    track.totalLength * scaleFactor,
  )
  if (!isFiniteVector(terminalPosition)) throw new Error('Terminal sample is not finite')
  positions.push(terminalPosition)

  const frames = calculateFrames(positions)
  const samples: CompiledTrackSample[] = []
  let cumulativeDistance = 0

  for (let index = 0; index < positions.length; index++) {
    if (index > 0) {
      cumulativeDistance += distance(positions[index - 1], positions[index])
      requireFinite(cumulativeDistance, `Sample ${index} cumulative distance`)
    }
    const terminal = index === track.segments.length
    const segment = terminal ? lastSegment : track.segments[index]
    const halfWidth = segment.width * scaleFactor
    requirePositiveFinite(halfWidth, `Sample ${index} half-width`)
    samples.push(
      Object.freeze({
        index,
        sourceSegmentIndex: terminal ? null : segment.index,
        terminal,
        sourceZ: terminal ? track.totalLength : segment.z,
        position: positions[index],
        frame: frames[index],
        halfWidth,
        elevation: segment.y * scaleFactor,
        cumulativeDistance,
        dark: segment.dark,
      }),
    )
  }

  return freezeArray(samples)
}

function interpolateVector(start: Vec3, end: Vec3, amount: number): Vec3 {
  return vector(
    lerp(start.x, end.x, amount),
    lerp(start.y, end.y, amount),
    lerp(start.z, end.z, amount),
  )
}

function interpolateFrame(start: TrackFrame, end: TrackFrame, amount: number): TrackFrame {
  const tangent = normalize(interpolateVector(start.tangent, end.tangent, amount), start.tangent)
  const blendedRight = interpolateVector(start.right, end.right, amount)
  let right = normalize(
    subtract(blendedRight, scale(tangent, dot(blendedRight, tangent))),
    start.right,
  )
  let normal = normalize(cross(tangent, right), start.normal)
  const expectedNormal = interpolateVector(start.normal, end.normal, amount)
  if (dot(normal, expectedNormal) < 0) {
    right = negate(right)
    normal = negate(normal)
  }
  right = normalize(cross(normal, tangent), right)
  return Object.freeze({ tangent, right, normal })
}

/** Sample a compiled course using a longitudinal position in simulation units. */
export function sampleCompiledTrack(
  compiled: CompiledTrack3D,
  sourcePosition: number,
): SampledTrackPoint {
  requireFinite(sourcePosition, 'sourcePosition')
  const clampedPosition = Math.min(Math.max(sourcePosition, 0), compiled.sourceTotalLength)
  const segmentCoordinate = clampedPosition / SEGMENT_LENGTH
  const segmentIndex = Math.min(
    Math.floor(segmentCoordinate),
    compiled.samples.length - 2,
  )
  const amount = Math.min(segmentCoordinate - segmentIndex, 1)
  const start = compiled.samples[compiled.sampleBySourceSegment[segmentIndex]]
  const end = compiled.samples[start.index + 1]

  return Object.freeze({
    sourcePosition: clampedPosition,
    sourceSegmentIndex: segmentIndex,
    position: interpolateVector(start.position, end.position, amount),
    frame: interpolateFrame(start.frame, end.frame, amount),
    halfWidth: lerp(start.halfWidth, end.halfWidth, amount),
    elevation: lerp(start.elevation, end.elevation, amount),
    cumulativeDistance: lerp(
      start.cumulativeDistance,
      end.cumulativeDistance,
      amount,
    ),
  })
}

export function positionAtLateralOffset(
  sample: Pick<CompiledTrackSample, 'position' | 'frame'>,
  lateralOffset: number,
  simulationUnitsPerRenderUnit: number,
): Vec3 {
  requireFinite(lateralOffset, 'lateralOffset')
  const unitsPerRenderUnit = requirePositiveFinite(
    simulationUnitsPerRenderUnit,
    'simulationUnitsPerRenderUnit',
  )
  const position = add(
    sample.position,
    scale(sample.frame.right, lateralOffset / unitsPerRenderUnit),
  )
  if (!isFiniteVector(position)) throw new Error('Lateral placement produced a non-finite position')
  return position
}

/** Convert a stable world position to coordinates relative to a moving root. */
export function toFloatingOrigin(position: Vec3, origin: Vec3): Vec3 {
  const relativePosition = subtract(position, origin)
  if (!isFiniteVector(relativePosition)) {
    throw new Error('Floating-origin conversion produced a non-finite position')
  }
  return relativePosition
}

function makeTransform(
  sample: CompiledTrackSample,
  lateralOffset: number,
  simulationUnitsPerRenderUnit: number,
): CompiledTransform {
  return Object.freeze({
    position: positionAtLateralOffset(sample, lateralOffset, simulationUnitsPerRenderUnit),
    frame: sample.frame,
  })
}

function entityId(
  trackId: string,
  category: CompiledEntity['category'],
  segmentIndex: number,
  ordinal: number,
): string {
  return `${trackId}/${category}/${segmentIndex.toString().padStart(4, '0')}/${ordinal}`
}

function compileEntities(
  track: Track,
  samples: readonly CompiledTrackSample[],
  trackId: string,
  simulationUnitsPerRenderUnit: number,
): {
  obstacles: readonly CompiledObstacle[]
  scenery: readonly CompiledScenery[]
  coins: readonly CompiledCoin[]
  ramps: readonly CompiledRamp[]
  entities: readonly CompiledEntity[]
} {
  const obstacles: CompiledObstacle[] = []
  const scenery: CompiledScenery[] = []
  const coins: CompiledCoin[] = []
  const ramps: CompiledRamp[] = []

  for (const segment of track.segments) {
    const sample = samples[segment.index]

    segment.obstacles.forEach((prop, sourceOrdinal) => {
      requireFinite(prop.x, `Obstacle ${segment.index}:${sourceOrdinal} x`)
      requirePositiveFinite(prop.scale, `Obstacle ${segment.index}:${sourceOrdinal} scale`)
      if (!isObstacleKind(prop.kind)) {
        throw new Error(`Obstacle ${segment.index}:${sourceOrdinal} has invalid kind ${prop.kind}`)
      }
      obstacles.push(
        Object.freeze({
          id: entityId(trackId, 'obstacle', segment.index, sourceOrdinal),
          category: 'obstacle',
          kind: prop.kind,
          sourceSegmentIndex: segment.index,
          sourceOrdinal,
          lateralOffset: prop.x,
          visualScale: prop.scale,
          transform: makeTransform(sample, prop.x, simulationUnitsPerRenderUnit),
        }),
      )
    })

    segment.scenery.forEach((prop, sourceOrdinal) => {
      requireFinite(prop.x, `Scenery ${segment.index}:${sourceOrdinal} x`)
      requirePositiveFinite(prop.scale, `Scenery ${segment.index}:${sourceOrdinal} scale`)
      if (!isSceneryKind(prop.kind)) {
        throw new Error(`Scenery ${segment.index}:${sourceOrdinal} has invalid kind ${prop.kind}`)
      }
      scenery.push(
        Object.freeze({
          id: entityId(trackId, 'scenery', segment.index, sourceOrdinal),
          category: 'scenery',
          kind: prop.kind,
          sourceSegmentIndex: segment.index,
          sourceOrdinal,
          lateralOffset: prop.x,
          visualScale: prop.scale,
          transform: makeTransform(sample, prop.x, simulationUnitsPerRenderUnit),
        }),
      )
    })

    segment.coins.forEach((prop, sourceOrdinal) => {
      requireFinite(prop.x, `Coin ${segment.index}:${sourceOrdinal} x`)
      requirePositiveFinite(prop.scale, `Coin ${segment.index}:${sourceOrdinal} scale`)
      coins.push(
        Object.freeze({
          id: entityId(trackId, 'coin', segment.index, sourceOrdinal),
          category: 'coin',
          kind: 'coin',
          sourceSegmentIndex: segment.index,
          sourceOrdinal,
          lateralOffset: prop.x,
          visualScale: prop.scale,
          transform: makeTransform(sample, prop.x, simulationUnitsPerRenderUnit),
        }),
      )
    })

    if (segment.ramp) {
      const ramp = segment.ramp
      requireFinite(ramp.x, `Ramp ${segment.index} x`)
      requirePositiveFinite(ramp.width, `Ramp ${segment.index} width`)
      requirePositiveFinite(ramp.power, `Ramp ${segment.index} power`)
      const halfWidth = requirePositiveFinite(
        ramp.width / simulationUnitsPerRenderUnit,
        `Ramp ${segment.index} compiled half-width`,
      )
      const length = requirePositiveFinite(
        SEGMENT_LENGTH / simulationUnitsPerRenderUnit,
        `Ramp ${segment.index} compiled length`,
      )
      ramps.push(
        Object.freeze({
          id: entityId(trackId, 'ramp', segment.index, 0),
          category: 'ramp',
          kind: 'ramp',
          sourceSegmentIndex: segment.index,
          sourceOrdinal: 0,
          lateralOffset: ramp.x,
          halfWidth,
          length,
          power: ramp.power,
          transform: makeTransform(sample, ramp.x, simulationUnitsPerRenderUnit),
        }),
      )
    }
  }

  const frozenObstacles = freezeArray(obstacles)
  const frozenScenery = freezeArray(scenery)
  const frozenCoins = freezeArray(coins)
  const frozenRamps = freezeArray(ramps)
  return {
    obstacles: frozenObstacles,
    scenery: frozenScenery,
    coins: frozenCoins,
    ramps: frozenRamps,
    entities: freezeArray<CompiledEntity>([
      ...frozenObstacles,
      ...frozenScenery,
      ...frozenCoins,
      ...frozenRamps,
    ]),
  }
}

function boundsForChunk(
  samples: readonly CompiledTrackSample[],
  sampleStart: number,
  sampleEndExclusive: number,
  entities: readonly CompiledEntity[],
): CompiledBounds {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  const include = (point: Vec3): void => {
    if (!isFiniteVector(point)) throw new Error('Chunk bounds received a non-finite point')
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    minZ = Math.min(minZ, point.z)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
    maxZ = Math.max(maxZ, point.z)
  }

  for (let index = sampleStart; index < sampleEndExclusive; index++) {
    const sample = samples[index]
    const lateral = scale(sample.frame.right, sample.halfWidth)
    include(add(sample.position, lateral))
    include(subtract(sample.position, lateral))
  }
  entities.forEach((entity) => include(entity.transform.position))

  return Object.freeze({
    min: vector(minX, minY, minZ),
    max: vector(maxX, maxY, maxZ),
  })
}

function compileChunks(
  samples: readonly CompiledTrackSample[],
  sourceSegmentCount: number,
  entities: readonly CompiledEntity[],
  trackId: string,
  chunkSegmentCount: number,
): readonly CompiledTrackChunk[] {
  const chunks: CompiledTrackChunk[] = []
  const chunkCount = Math.ceil(sourceSegmentCount / chunkSegmentCount)
  const entitiesByChunk = Array.from(
    { length: chunkCount },
    (): CompiledEntity[] => [],
  )
  for (const entity of entities) {
    const chunkIndex = Math.floor(entity.sourceSegmentIndex / chunkSegmentCount)
    entitiesByChunk[chunkIndex].push(entity)
  }

  for (let start = 0; start < sourceSegmentCount; start += chunkSegmentCount) {
    const chunkIndex = start / chunkSegmentCount
    const endExclusive = Math.min(sourceSegmentCount, start + chunkSegmentCount)
    const geometrySampleStart = Math.max(0, start - 1)
    const geometrySampleEndExclusive = Math.min(samples.length, endExclusive + 1)
    const chunkEntities = entitiesByChunk[chunkIndex]
    const endSeamSampleIndex = endExclusive

    chunks.push(
      Object.freeze({
        id: `${trackId}/chunk/${chunkIndex.toString().padStart(4, '0')}`,
        index: chunkIndex,
        sourceSegmentStart: start,
        sourceSegmentEndExclusive: endExclusive,
        geometrySampleStart,
        geometrySampleEndExclusive,
        startSeamSampleIndex: start,
        endSeamSampleIndex,
        startDistance: samples[start].cumulativeDistance,
        endDistance: samples[endSeamSampleIndex].cumulativeDistance,
        origin: samples[start].position,
        bounds: boundsForChunk(
          samples,
          geometrySampleStart,
          geometrySampleEndExclusive,
          chunkEntities,
        ),
        entityIds: freezeArray(chunkEntities.map((entity) => entity.id)),
      }),
    )
  }

  return freezeArray(chunks)
}

function freezeSourceRun(sourceRun: CompiledSourceRun | undefined): CompiledSourceRun | null {
  if (!sourceRun) return null

  return Object.freeze({
    levelId: sourceRun.levelId,
    difficultyId: sourceRun.difficultyId,
    seed: sourceRun.seed >>> 0,
  })
}

/**
 * Compile existing simulation track data without changing it. The result is
 * renderer-neutral, deeply immutable at every public object/array boundary,
 * and contains no Three.js types or dependencies.
 */
export function compileTrack3D(
  track: Track,
  options: TrackCompilationOptions,
): CompiledTrack3D {
  if (track.segments.length < 2) throw new Error('A compiled track needs at least two segments')
  const expectedTotalLength = track.segments.length * SEGMENT_LENGTH
  if (track.totalLength !== expectedTotalLength) {
    throw new Error(`track.totalLength must equal ${expectedTotalLength}`)
  }

  const { simulationUnitsPerRenderUnit, chunkSegmentCount } = validateOptions(options)
  const scaleFactor = 1 / simulationUnitsPerRenderUnit
  const samples = compileSamples(track, scaleFactor)
  const compiledEntities = compileEntities(
    track,
    samples,
    options.trackId,
    simulationUnitsPerRenderUnit,
  )
  const chunks = compileChunks(
    samples,
    track.segments.length,
    compiledEntities.entities,
    options.trackId,
    chunkSegmentCount,
  )

  return Object.freeze({
    trackId: options.trackId,
    simulationUnitsPerRenderUnit,
    sourceRun: freezeSourceRun(options.sourceRun),
    sourceTotalLength: track.totalLength,
    totalDistance: samples[samples.length - 1].cumulativeDistance,
    samples,
    sampleBySourceSegment: freezeArray(
      track.segments.map((segment) => samples[segment.index].index),
    ),
    ...compiledEntities,
    chunks,
  })
}

export function generateCompiledTrack3D(
  level: LevelDef,
  difficulty: DifficultyDef,
  seed: number,
  options: GeneratedTrackCompilationOptions = {},
): CompiledTrack3D {
  const canonicalSeed = seed >>> 0
  const trackId = options.trackId ?? `${level.id}:${difficulty.id}:${canonicalSeed}`
  return compileTrack3D(generateTrack(level, difficulty, canonicalSeed), {
    trackId,
    simulationUnitsPerRenderUnit: options.simulationUnitsPerRenderUnit,
    chunkSegmentCount: options.chunkSegmentCount,
    sourceRun: { levelId: level.id, difficultyId: difficulty.id, seed: canonicalSeed },
  })
}
