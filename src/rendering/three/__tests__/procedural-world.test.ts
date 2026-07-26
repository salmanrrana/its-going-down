import { InstancedMesh, Matrix4, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { DIFFICULTIES, LEVELS } from '../../../game/levels'
import { generateTrack, SEGMENT_LENGTH } from '../../../game/track'
import {
  compileTrack3D,
  positionAtLateralOffset,
  sampleCompiledTrack,
} from '../../../game/track/index'
import { ProceduralWorld } from '../procedural-world'
import { QUALITY_PROFILES } from '../quality'

function scenePosition(world: ProceduralWorld, position: { x: number; y: number; z: number }): Vector3 {
  world.root.updateMatrixWorld(true)
  return new Vector3(position.x, position.y, position.z).applyMatrix4(world.root.matrixWorld)
}

function hiddenInstanceCount(world: ProceduralWorld): number {
  const matrix = new Matrix4()
  let hidden = 0
  world.root.traverse((object) => {
    if (!(object instanceof InstancedMesh)) return
    for (let index = 0; index < object.count; index++) {
      object.getMatrixAt(index, matrix)
      if (Math.abs(matrix.determinant()) < 1e-9) hidden++
    }
  })
  return hidden
}

describe('ProceduralWorld compiled track integration', () => {
  it('maps right, normal, and downhill tangent to positive scene axes', () => {
    const level = LEVELS[0]
    const track = generateTrack(level, DIFFICULTIES[1], 2026)
    const compiled = compileTrack3D(track, {
      trackId: 'three:test',
      simulationUnitsPerRenderUnit: 1000,
    })
    const world = new ProceduralWorld(track, compiled, level, QUALITY_PROFILES.low)
    const sourcePosition = SEGMENT_LENGTH * 240.25
    const sample = sampleCompiledTrack(compiled, sourcePosition)
    const playerPosition = positionAtLateralOffset(
      sample,
      320,
      compiled.simulationUnitsPerRenderUnit,
    )
    world.update(sample, 320)

    expect(scenePosition(world, playerPosition).length()).toBeLessThan(1e-8)

    const ahead = sampleCompiledTrack(compiled, sourcePosition + SEGMENT_LENGTH * 4)
    expect(scenePosition(world, ahead.position).z).toBeGreaterThan(0)

    const right = positionAtLateralOffset(
      sample,
      1320,
      compiled.simulationUnitsPerRenderUnit,
    )
    expect(scenePosition(world, right).x).toBeCloseTo(1, 8)

    const above = {
      x: playerPosition.x + sample.frame.normal.x,
      y: playerPosition.y + sample.frame.normal.y,
      z: playerPosition.z + sample.frame.normal.z,
    }
    expect(scenePosition(world, above).y).toBeCloseTo(1, 8)
    world.dispose()
  })

  it('bridges mutable spent state through stable compiled entity IDs', () => {
    const level = LEVELS[1]
    const track = generateTrack(level, DIFFICULTIES[2], 1337)
    const compiled = compileTrack3D(track, {
      trackId: 'three:spent-test',
      simulationUnitsPerRenderUnit: 1000,
    })
    const world = new ProceduralWorld(track, compiled, level, QUALITY_PROFILES.low)
    const obstacle = compiled.obstacles[0]
    const sourceProp = track.segments[obstacle.sourceSegmentIndex]
      .obstacles[obstacle.sourceOrdinal]
    const sample = sampleCompiledTrack(compiled, obstacle.sourceSegmentIndex * SEGMENT_LENGTH)
    world.update(sample, 0)
    const before = hiddenInstanceCount(world)

    sourceProp.spent = true
    world.update(sample, 0)

    expect(hiddenInstanceCount(world)).toBe(before + 1)
    expect('spent' in obstacle).toBe(false)
    world.dispose()
  })
})
