import type { Group } from 'three'
import type { Track } from '../../game/track'
import type { CompiledTrack3D, SampledTrackPoint } from '../../game/track/index'
import type { LevelDef } from '../../game/types'
import { ProceduralWorld } from './procedural-world'
import type { QualityProfile } from './quality'
import { SnowWorldBuilder } from './snow-world-builder'

export interface WorldVisualProfile {
  readonly fogNearScale: number
  readonly fogFarScale: number
  readonly cameraFarScale: number
  readonly cameraFarPadding: number
  readonly sprayCountScale: number
  readonly sprayForceScale: number
}

export interface WorldBuilder {
  readonly root: Group
  readonly compiled: CompiledTrack3D
  readonly visualProfile: WorldVisualProfile
  update(sample: SampledTrackPoint, playerX: number): void
  dispose(): void
}

export function createWorldBuilder(
  track: Track,
  compiled: CompiledTrack3D,
  level: LevelDef,
  quality: QualityProfile,
): WorldBuilder {
  return level.id === 'snowboard'
    ? new SnowWorldBuilder(track, compiled, level, quality)
    : new ProceduralWorld(track, compiled, level, quality)
}
