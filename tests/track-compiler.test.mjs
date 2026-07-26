import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { createServer } from 'vite'

let server
let compiler
let levelsModule
let trackModule

before(async () => {
  server = await createServer({
    configFile: false,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  })
  const modules = await Promise.all([
    server.ssrLoadModule('/src/game/track/index.ts'),
    server.ssrLoadModule('/src/game/levels.ts'),
    server.ssrLoadModule('/src/game/track.ts'),
  ])
  compiler = modules[0]
  levelsModule = modules[1]
  trackModule = modules[2]
})

after(async () => {
  await server.close()
})

const EPSILON = 1e-10
const VECTOR_AXES = ['x', 'y', 'z']

function magnitude(vector) {
  return Math.hypot(vector.x, vector.y, vector.z)
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

function assertVectorClose(actual, expected, epsilon = EPSILON) {
  for (const axis of VECTOR_AXES) {
    assert.ok(
      Math.abs(actual[axis] - expected[axis]) <= epsilon,
      `${actual[axis]} != ${expected[axis]}`,
    )
  }
}

function assertFiniteTree(value, path = 'root') {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${path} is not finite`)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertFiniteTree(entry, `${path}[${index}]`))
    return
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      assertFiniteTree(value[key], `${path}.${key}`)
    }
  }
}

function assertOrthonormalFrame(frame, message) {
  const { tangent, right, normal } = frame
  assert.ok(Math.abs(magnitude(tangent) - 1) < EPSILON, message)
  assert.ok(Math.abs(magnitude(right) - 1) < EPSILON, message)
  assert.ok(Math.abs(magnitude(normal) - 1) < EPSILON, message)
  assert.ok(Math.abs(dot(tangent, right)) < EPSILON, message)
  assert.ok(Math.abs(dot(tangent, normal)) < EPSILON, message)
  assert.ok(Math.abs(dot(right, normal)) < EPSILON, message)
  assert.ok(dot(cross(tangent, right), normal) > 1 - EPSILON, message)
}

function widestObstacleGap(segment) {
  const intervals = segment.obstacles
    .map((obstacle) => [
      Math.max(-segment.width, obstacle.x - 240 * obstacle.scale),
      Math.min(segment.width, obstacle.x + 240 * obstacle.scale),
    ])
    .sort((a, b) => a[0] - b[0])

  let widest = 0
  let cursor = -segment.width
  for (const [start, end] of intervals) {
    widest = Math.max(widest, start - cursor)
    cursor = Math.max(cursor, end)
  }
  return Math.max(widest, segment.width - cursor)
}

function countSegmentItems(segments, collectionName) {
  return segments.reduce((total, segment) => total + segment[collectionName].length, 0)
}

describe('deterministic 3D track compiler', () => {
  it('produces byte-for-byte stable compiled definitions for identical inputs', () => {
    const level = levelsModule.LEVELS[0]
    const difficulty = levelsModule.DIFFICULTIES[1]
    const first = compiler.generateCompiledTrack3D(level, difficulty, 0x12345678)
    const second = compiler.generateCompiledTrack3D(level, difficulty, 0x12345678)

    assert.deepStrictEqual(first, second)
    assert.notDeepStrictEqual(
      first,
      compiler.generateCompiledTrack3D(level, difficulty, 0x12345679),
    )
  })

  it('does not mutate generated tracks or depend on mutable Prop.spent state', () => {
    const track = trackModule.generateTrack(
      levelsModule.LEVELS[1],
      levelsModule.DIFFICULTIES[1],
      1337,
    )
    const before = JSON.stringify(track)
    const compiledBefore = compiler.compileTrack3D(track, { trackId: 'spent-invariance' })

    assert.equal(JSON.stringify(track), before)
    for (const segment of track.segments) {
      for (const collection of [segment.obstacles, segment.scenery, segment.coins]) {
        for (const prop of collection) {
          prop.spent = !prop.spent
        }
      }
    }

    const compiledAfter = compiler.compileTrack3D(track, { trackId: 'spent-invariance' })
    assert.deepStrictEqual(compiledAfter, compiledBefore)
    assert.equal(compiledAfter.entities.some((entity) => 'spent' in entity), false)
  })

  it('returns immutable arrays, samples, frames, transforms, entities, and chunks', () => {
    const compiled = compiler.generateCompiledTrack3D(
      levelsModule.LEVELS[2],
      levelsModule.DIFFICULTIES[0],
      42,
    )

    for (const value of [
      compiled,
      compiled.samples,
      compiled.samples[0],
      compiled.samples[0].frame,
      compiled.entities,
      compiled.entities[0],
      compiled.entities[0].transform,
      compiled.chunks,
      compiled.chunks[0],
      compiled.chunks[0].entityIds,
    ]) {
      assert.equal(Object.isFrozen(value), true)
    }
    assert.throws(() => compiled.samples.push(compiled.samples[0]), TypeError)
  })

  it('rejects source or scale values that could create invalid geometry', () => {
    const track = trackModule.generateTrack(
      levelsModule.LEVELS[0],
      levelsModule.DIFFICULTIES[0],
      1,
    )
    assert.throws(
      () =>
        compiler.compileTrack3D(track, {
          trackId: 'underflow-scale',
          simulationUnitsPerRenderUnit: Number.MIN_VALUE,
        }),
      /render scale factor/,
    )

    const overflowingTrack = structuredClone(track)
    overflowingTrack.segments[0].curve = Number.MAX_VALUE
    overflowingTrack.segments[1].curve = Number.MAX_VALUE
    assert.throws(
      () => compiler.compileTrack3D(overflowingTrack, { trackId: 'overflowing-curve' }),
      /must be finite/,
    )

    const segment = (index) => ({
      index,
      z: index * trackModule.SEGMENT_LENGTH,
      y: 0,
      curve: 0,
      width: 1e-150,
      obstacles: [],
      scenery: [],
      coins: [],
      ramp: index === 0 ? { x: 0, width: Number.MAX_VALUE, power: 1 } : null,
      dark: false,
    })
    assert.throws(
      () =>
        compiler.compileTrack3D(
          { segments: [segment(0), segment(1)], totalLength: 400 },
          {
            trackId: 'overflowing-ramp',
            simulationUnitsPerRenderUnit: 1e-150,
          },
        ),
      /compiled half-width/,
    )
  })

  it('keeps distances and frame orientation stable at extreme valid scales', () => {
    const segment = (index) => ({
      index,
      z: index * trackModule.SEGMENT_LENGTH,
      y: 0,
      curve: index === 0 ? 100 : 0,
      width: 1000,
      obstacles: [],
      scenery: [],
      coins: [],
      ramp: null,
      dark: false,
    })
    const track = { segments: [segment(0), segment(1)], totalLength: 400 }

    for (const simulationUnitsPerRenderUnit of [1e-150, Number.MAX_VALUE]) {
      const compiled = compiler.compileTrack3D(track, {
        trackId: `extreme-scale:${simulationUnitsPerRenderUnit}`,
        simulationUnitsPerRenderUnit,
      })
      assertFiniteTree(compiled)
      assert.ok(compiled.samples[1].cumulativeDistance > 0)
      assert.ok(compiled.samples[2].cumulativeDistance > compiled.samples[1].cumulativeDistance)
      assert.ok(compiled.samples[0].frame.tangent.x > 0.4)
      assertOrthonormalFrame(compiled.samples[0].frame, String(simulationUnitsPerRenderUnit))
    }
  })
})

describe('centerline samples and transported frames', () => {
  it('uses the legacy curve integration order and the documented default scale', () => {
    const level = levelsModule.LEVELS[3]
    const track = trackModule.generateTrack(level, levelsModule.DIFFICULTIES[1], 7)
    const compiled = compiler.compileTrack3D(track, { trackId: 'integration' })
    let x = 0
    let dx = 0

    assert.equal(compiled.simulationUnitsPerRenderUnit, 100)
    assert.equal(compiled.samples.length, track.segments.length + 1)
    assert.equal(compiled.samples[1].position.z - compiled.samples[0].position.z, 2)
    assert.equal(compiled.samples[0].halfWidth, level.roadWidth / 100)

    for (let index = 0; index < track.segments.length; index++) {
      const sample = compiled.samples[index]
      assert.ok(Math.abs(sample.position.x - x / 100) <= EPSILON)
      assert.ok(Math.abs(sample.position.y - track.segments[index].y / 100) <= EPSILON)
      assert.equal(sample.sourceSegmentIndex, index)
      assert.equal(compiled.sampleBySourceSegment[index], index)
      assert.equal(sample.terminal, false)
      dx += track.segments[index].curve
      x += dx
    }

    const terminal = compiled.samples[track.segments.length]
    assert.equal(terminal.terminal, true)
    assert.equal(terminal.sourceSegmentIndex, null)
    assert.equal(terminal.sourceZ, track.totalLength)
    assert.ok(Math.abs(terminal.position.x - x / 100) <= EPSILON)
    assert.equal(terminal.position.z, track.totalLength / 100)
  })

  it('keeps every frame finite, orthonormal, right-handed, and flip-free on all levels', () => {
    for (const level of levelsModule.LEVELS) {
      const compiled = compiler.generateCompiledTrack3D(
        level,
        levelsModule.DIFFICULTIES[1],
        0xffffffff,
      )
      assertFiniteTree(compiled)

      let previousNormal = null
      for (const sample of compiled.samples) {
        const { normal } = sample.frame
        assertOrthonormalFrame(sample.frame, level.id)
        if (previousNormal) assert.ok(dot(previousNormal, normal) >= -EPSILON, level.id)
        previousNormal = normal
      }
    }
  })

  it('keeps positions and cumulative arc distance continuous and monotonic', () => {
    const compiled = compiler.generateCompiledTrack3D(
      levelsModule.LEVELS[6],
      levelsModule.DIFFICULTIES[2],
      1337,
    )

    for (let index = 1; index < compiled.samples.length; index++) {
      const previous = compiled.samples[index - 1]
      const current = compiled.samples[index]
      const step = magnitude(subtract(current.position, previous.position))
      assert.ok(step > 0)
      assert.ok(current.cumulativeDistance > previous.cumulativeDistance)
      assert.ok(
        Math.abs(current.cumulativeDistance - previous.cumulativeDistance - step) < EPSILON,
      )
    }
    assert.equal(
      compiled.totalDistance,
      compiled.samples[compiled.samples.length - 1].cumulativeDistance,
    )
  })

  it('samples arbitrary simulation positions with stable transported frames', () => {
    const compiled = compiler.generateCompiledTrack3D(
      levelsModule.LEVELS[0],
      levelsModule.DIFFICULTIES[1],
      2026,
      { simulationUnitsPerRenderUnit: 1000 },
    )
    const sourcePosition = trackModule.SEGMENT_LENGTH * 137.375
    const sampled = compiler.sampleCompiledTrack(compiled, sourcePosition)
    const start = compiled.samples[137]
    const end = compiled.samples[138]

    assert.equal(sampled.sourcePosition, sourcePosition)
    assert.equal(sampled.sourceSegmentIndex, 137)
    assertVectorClose(sampled.position, {
      x: start.position.x + (end.position.x - start.position.x) * 0.375,
      y: start.position.y + (end.position.y - start.position.y) * 0.375,
      z: start.position.z + (end.position.z - start.position.z) * 0.375,
    })
    assertOrthonormalFrame(sampled.frame, 'interpolated frame')
    assert.equal(Object.isFrozen(sampled), true)
    assert.equal(Object.isFrozen(sampled.frame), true)

    const terminal = compiler.sampleCompiledTrack(compiled, Number.MAX_VALUE)
    assert.equal(terminal.sourcePosition, compiled.sourceTotalLength)
    assertVectorClose(terminal.position, compiled.samples.at(-1).position)
    assertOrthonormalFrame(terminal.frame, 'terminal frame')
  })
})

describe('compiled entity placement', () => {
  it('maps every source collection to stable unique IDs and surface anchors', () => {
    for (const level of levelsModule.LEVELS) {
      const track = trackModule.generateTrack(level, levelsModule.DIFFICULTIES[1], 1337)
      const compiled = compiler.compileTrack3D(track, { trackId: `entities:${level.id}` })
      for (const collectionName of ['obstacles', 'scenery', 'coins']) {
        assert.equal(
          compiled[collectionName].length,
          countSegmentItems(track.segments, collectionName),
        )
      }
      assert.equal(
        compiled.ramps.length,
        track.segments.filter((segment) => segment.ramp).length,
      )
      assert.equal(
        new Set(compiled.entities.map((entity) => entity.id)).size,
        compiled.entities.length,
      )

      for (const entity of compiled.entities) {
        const sample = compiled.samples[entity.sourceSegmentIndex]
        const expected = compiler.positionAtLateralOffset(
          sample,
          entity.lateralOffset,
          compiled.simulationUnitsPerRenderUnit,
        )
        assertVectorClose(entity.transform.position, expected)
        assert.equal(entity.transform.frame, sample.frame)
      }
      assert.equal(compiled.coins.every((coin) => coin.kind === 'coin'), true)
      assert.equal(
        compiled.ramps.every((ramp) => ramp.length === trackModule.SEGMENT_LENGTH / 100),
        true,
      )
    }
  })
})

describe('streaming chunks and floating origins', () => {
  it('creates contiguous core ranges with shared seam samples and one-sample halos', () => {
    const compiled = compiler.generateCompiledTrack3D(
      levelsModule.LEVELS[4],
      levelsModule.DIFFICULTIES[2],
      99,
      { chunkSegmentCount: 64 },
    )
    const assignedEntityIds = []

    for (let index = 0; index < compiled.chunks.length; index++) {
      const chunk = compiled.chunks[index]
      assert.equal(chunk.index, index)
      assert.equal(chunk.sourceSegmentEndExclusive - chunk.sourceSegmentStart <= 64, true)
      assert.equal(chunk.geometrySampleStart, Math.max(0, chunk.sourceSegmentStart - 1))
      assert.equal(
        chunk.geometrySampleEndExclusive,
        Math.min(compiled.samples.length, chunk.sourceSegmentEndExclusive + 1),
      )
      assertVectorClose(chunk.origin, compiled.samples[chunk.sourceSegmentStart].position)
      assignedEntityIds.push(...chunk.entityIds)

      if (index > 0) {
        const previous = compiled.chunks[index - 1]
        assert.equal(previous.sourceSegmentEndExclusive, chunk.sourceSegmentStart)
        assert.equal(previous.endSeamSampleIndex, chunk.startSeamSampleIndex)
        assert.deepStrictEqual(
          compiled.samples[previous.endSeamSampleIndex],
          compiled.samples[chunk.startSeamSampleIndex],
        )
      }
    }

    assert.deepStrictEqual(
      assignedEntityIds.slice().sort(),
      compiled.entities.map((entity) => entity.id).sort(),
    )
    const finalChunk = compiled.chunks[compiled.chunks.length - 1]
    assert.equal(finalChunk.sourceSegmentEndExclusive, compiled.samples.length - 1)
    assert.equal(finalChunk.endSeamSampleIndex, compiled.samples.length - 1)
    assert.equal(compiled.samples[finalChunk.endSeamSampleIndex].terminal, true)
    assert.ok(finalChunk.geometrySampleEndExclusive > finalChunk.sourceSegmentEndExclusive)
  })

  it('preserves relative geometry under any moving-world-root origin', () => {
    const compiled = compiler.generateCompiledTrack3D(
      levelsModule.LEVELS[5],
      levelsModule.DIFFICULTIES[1],
      2026,
    )
    const first = compiled.samples[300].position
    const second = compiled.entities.find((entity) => entity.sourceSegmentIndex >= 300).transform
      .position
    const origins = [compiled.chunks[0].origin, compiled.chunks[2].origin, compiled.samples[1700].position]
    const worldDelta = subtract(second, first)

    for (const origin of origins) {
      const localFirst = compiler.toFloatingOrigin(first, origin)
      const localSecond = compiler.toFloatingOrigin(second, origin)
      assertVectorClose(subtract(localSecond, localFirst), worldDelta, 1e-9)
      assertVectorClose(
        {
          x: localFirst.x + origin.x,
          y: localFirst.y + origin.y,
          z: localFirst.z + origin.z,
        },
        first,
        1e-9,
      )
    }
  })
})

describe('generation fairness remains intact', () => {
  it('preserves hazard-free starts/finishes, landing zones, and minimum gaps for all levels', () => {
    for (const level of levelsModule.LEVELS) {
      for (const difficulty of levelsModule.DIFFICULTIES) {
        const track = trackModule.generateTrack(level, difficulty, 0x12345678)
        compiler.compileTrack3D(track, { trackId: `fair:${level.id}:${difficulty.id}` })

        for (let index = 0; index < track.segments.length; index++) {
          const segment = track.segments[index]
          if (index < 90 || index >= track.segments.length - 60) {
            assert.equal(segment.obstacles.length, 0, `${level.id}/${difficulty.id}/${index}`)
            assert.equal(segment.ramp, null, `${level.id}/${difficulty.id}/${index}`)
          }
          if (index < 90) {
            assert.equal(segment.coins.length, 0, `${level.id}/${difficulty.id}/${index}`)
          }
          if (segment.obstacles.length > 0) {
            assert.ok(
              widestObstacleGap(segment) >= difficulty.minGap,
              `${level.id}/${difficulty.id}/${index}`,
            )
          }
          if (segment.ramp) {
            const landingSegments = trackModule.rampLandingClearanceSegments(level, difficulty)
            for (
              let landing = index;
              landing < Math.min(index + landingSegments, track.segments.length);
              landing++
            ) {
              assert.equal(
                track.segments[landing].obstacles.length,
                0,
                `${level.id}/${difficulty.id}/ramp-${index}/landing-${landing}`,
              )
            }
          }
        }
      }
    }
  })
})
