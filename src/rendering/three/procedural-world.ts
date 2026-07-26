import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Vector3,
} from 'three'
import type { Prop, Track } from '../../game/track'
import type { LevelDef, ObstacleKind, SceneryKind } from '../../game/types'
import type { QualityProfile } from './quality'
import { ResourceTracker } from './resources'
import { CompiledTrack, WORLD_SCALE, type TrackSample } from './track-compiler'

type WorldKind = ObstacleKind | SceneryKind | 'coin'

interface InstanceRecord {
  readonly object: { spent: boolean }
  readonly matrix: Matrix4
  hidden: boolean
}

interface InstanceBatch {
  readonly mesh: InstancedMesh
  readonly records: InstanceRecord[]
}

interface PropEntry {
  readonly segmentIndex: number
  readonly object: Prop
}

const hiddenMatrix = new Matrix4().makeScale(0, 0, 0)
const transform = new Object3D()
const floatingOrigin = new Vector3()
const worldUp = new Vector3(0, 1, 0)

function makeRibbonGeometry(compiled: CompiledTrack, widthScale: number, yOffset: number): BufferGeometry {
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  compiled.points.forEach((point, index) => {
    const width = Math.max(point.halfWidth * widthScale, widthScale > 2 ? 10 : point.halfWidth)
    const heading = compiled.headingAt(index)
    const sideX = Math.cos(heading) * width
    const sideZ = Math.sin(heading) * width
    positions.push(point.centerX - sideX, point.y + yOffset, point.z - sideZ)
    positions.push(point.centerX + sideX, point.y + yOffset, point.z + sideZ)
    const color = new Color(point.segment.dark ? '#f4f8fc' : '#ffffff')
    colors.push(color.r, color.g, color.b, color.r, color.g, color.b)
  })
  for (let i = 0; i < compiled.points.length - 1; i++) {
    const a = i * 2
    indices.push(a, a + 2, a + 1, a + 2, a + 3, a + 1)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

function geometryFor(kind: WorldKind): BufferGeometry {
  switch (kind) {
    case 'pine':
    case 'tree':
      return new ConeGeometry(0.52, 1.65, 7)
    case 'palm':
    case 'reed':
      return new ConeGeometry(0.38, 1.45, 6)
    case 'building':
    case 'car':
    case 'crate':
      return new BoxGeometry(0.9, 0.8, 0.75)
    case 'streetlight':
    case 'flag':
    case 'buoy':
    case 'hydrant':
      return new CylinderGeometry(0.1, 0.16, 1.25, 7)
    case 'cactus':
      return new CylinderGeometry(0.16, 0.22, 1.25, 7)
    case 'rock':
      return new IcosahedronGeometry(0.52, 0)
    case 'cone':
      return new ConeGeometry(0.28, 0.78, 12)
    case 'barrel':
      return new CylinderGeometry(0.34, 0.38, 0.76, 10)
    case 'log':
      return new CylinderGeometry(0.28, 0.32, 1.4, 9)
    case 'coin':
      return new CylinderGeometry(0.19, 0.19, 0.055, 16)
  }
}

function colorFor(kind: WorldKind, level: LevelDef): string {
  switch (kind) {
    case 'pine':
    case 'tree':
      return '#245b3b'
    case 'palm':
    case 'reed':
      return '#3d8a4f'
    case 'building':
      return '#554f69'
    case 'streetlight':
      return '#33343b'
    case 'rock':
      return level.id === 'car' ? '#8e674d' : '#747b83'
    case 'buoy':
    case 'hydrant':
    case 'barrel':
      return '#db493b'
    case 'cactus':
      return '#487b3f'
    case 'flag':
    case 'cone':
      return level.palette.accent
    case 'log':
    case 'crate':
      return '#82562f'
    case 'car':
      return '#3973bd'
    case 'coin':
      return '#ffc928'
  }
}

function baseHeight(kind: WorldKind): number {
  switch (kind) {
    case 'pine':
    case 'tree':
      return 0.82
    case 'palm':
    case 'reed':
      return 0.72
    case 'building':
      return 0.4
    case 'streetlight':
    case 'flag':
    case 'buoy':
    case 'hydrant':
    case 'cactus':
      return 0.62
    case 'rock':
      return 0.38
    case 'cone':
    case 'barrel':
    case 'crate':
    case 'car':
      return 0.38
    case 'log':
      return 0.3
    case 'coin':
      return 0.72
  }
}

function createMountains(level: LevelDef, tracker: ResourceTracker): Group {
  const group = new Group()
  const farMaterial = tracker.trackMaterial(
    new MeshStandardMaterial({ color: level.palette.ridgeFar, roughness: 1, flatShading: true }),
  )
  const nearMaterial = tracker.trackMaterial(
    new MeshStandardMaterial({ color: level.palette.ridgeNear, roughness: 1, flatShading: true }),
  )
  for (let i = 0; i < 13; i++) {
    const far = new Mesh(tracker.track(new ConeGeometry(4 + (i % 3), 7 + (i % 4), 5)), farMaterial)
    far.position.set((i - 6) * 5.2, 1.4 + (i % 2), -34 - (i % 3) * 4)
    far.rotation.y = i * 0.73
    group.add(far)
  }
  for (let i = 0; i < 8; i++) {
    const near = new Mesh(tracker.track(new ConeGeometry(2.8 + (i % 2), 5.5, 6)), nearMaterial)
    near.position.set((i - 3.5) * 7.3, 0.6, -25 - (i % 2) * 3)
    near.rotation.y = i * 0.41
    group.add(near)
  }
  return group
}

export class ProceduralWorld {
  readonly root = new Group()
  readonly compiled: CompiledTrack
  private readonly tracker = new ResourceTracker()
  private readonly batches: InstanceBatch[] = []
  private readonly mountains: Group
  private readonly groundPatch: Mesh

  constructor(
    track: Track,
    readonly level: LevelDef,
    quality: QualityProfile,
  ) {
    this.compiled = new CompiledTrack(track)

    const terrainGeometry = this.tracker.track(makeRibbonGeometry(this.compiled, 7.5, -0.08))
    const terrainMaterial = this.tracker.trackMaterial(
      new MeshStandardMaterial({
        color: level.palette.groundA,
        roughness: 1,
        metalness: 0,
        side: DoubleSide,
      }),
    )
    const terrain = new Mesh(terrainGeometry, terrainMaterial)
    terrain.receiveShadow = true
    this.root.add(terrain)

    this.groundPatch = new Mesh(
      this.tracker.track(new PlaneGeometry(70, 18)),
      terrainMaterial,
    )
    this.groundPatch.rotation.x = -Math.PI / 2
    this.groundPatch.receiveShadow = true
    this.root.add(this.groundPatch)

    const courseGeometry = this.tracker.track(makeRibbonGeometry(this.compiled, 1, 0))
    const courseMaterial = this.tracker.trackMaterial(
      new MeshStandardMaterial({
        color: level.palette.laneA,
        vertexColors: level.id === 'snowboard',
        roughness: level.water ? 0.34 : 0.88,
        metalness: level.water ? 0.08 : 0,
        side: DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    )
    const course = new Mesh(courseGeometry, courseMaterial)
    course.receiveShadow = true
    this.root.add(course)

    this.addProps(quality)
    this.addRamps()
    this.mountains = createMountains(level, this.tracker)
    this.root.add(this.mountains)
  }

  private addProps(quality: QualityProfile): void {
    const records = new Map<WorldKind, PropEntry[]>()
    function add(kind: WorldKind, segmentIndex: number, object: Prop): void {
      const list = records.get(kind) ?? []
      list.push({ segmentIndex, object })
      records.set(kind, list)
    }

    for (const segment of this.compiled.source.segments) {
      segment.scenery.forEach((prop, index) => {
        const keep = ((segment.index * 31 + index * 17) % 100) / 100 < quality.sceneryDensity
        if (keep) add(prop.kind, segment.index, prop)
      })
      segment.obstacles.forEach((prop) => add(prop.kind, segment.index, prop))
      segment.coins.forEach((prop) => add('coin', segment.index, prop))
    }

    for (const [kind, entries] of records) {
      const geometry = this.tracker.track(geometryFor(kind))
      const material = this.tracker.trackMaterial(
        new MeshStandardMaterial({
          color: colorFor(kind, this.level),
          roughness: kind === 'coin' ? 0.28 : 0.82,
          metalness: kind === 'coin' ? 0.55 : 0,
          flatShading: true,
        }),
      )
      const mesh = new InstancedMesh(geometry, material, entries.length)
      mesh.castShadow = kind !== 'coin'
      mesh.receiveShadow = true
      const batchRecords: InstanceRecord[] = []
      entries.forEach(({ segmentIndex, object }, index) => {
        const point = this.compiled.points[segmentIndex]
        let scale = object.scale * 1.15
        if (kind === 'building') scale = object.scale * 1.8
        else if (kind === 'coin') scale = object.scale
        const heading = this.compiled.headingAt(segmentIndex)
        const lateral = object.x * WORLD_SCALE
        transform.position.set(
          point.centerX + Math.cos(heading) * lateral,
          point.y + baseHeight(kind) * scale,
          point.z + Math.sin(heading) * lateral,
        )
        transform.rotation.set(
          kind === 'coin' ? Math.PI / 2 : 0,
          -heading + ((segmentIndex * 47) % 31) * 0.17,
          kind === 'log' ? Math.PI / 2 : 0,
        )
        transform.scale.setScalar(scale)
        if (kind === 'building') transform.scale.y *= 2.2 + (segmentIndex % 4) * 0.5
        transform.updateMatrix()
        mesh.setMatrixAt(index, object.spent ? hiddenMatrix : transform.matrix)
        batchRecords.push({ object, matrix: transform.matrix.clone(), hidden: object.spent })
      })
      mesh.instanceMatrix.needsUpdate = true
      this.root.add(mesh)
      this.batches.push({ mesh, records: batchRecords })
    }
  }

  private addRamps(): void {
    const geometry = this.tracker.track(new BoxGeometry(1, 0.18, 0.22))
    const material = this.tracker.trackMaterial(
      new MeshStandardMaterial({ color: this.level.palette.accent, roughness: 0.68 }),
    )
    for (const point of this.compiled.points) {
      const ramp = point.segment.ramp
      if (!ramp) continue
      const mesh = new Mesh(geometry, material)
      const heading = this.compiled.headingAt(point.segment.index)
      const lateral = ramp.x * WORLD_SCALE
      const segmentMidpoint = 0.1
      mesh.position.set(
        point.centerX + Math.cos(heading) * lateral + Math.sin(heading) * segmentMidpoint,
        point.y + 0.12,
        point.z + Math.sin(heading) * lateral - Math.cos(heading) * segmentMidpoint,
      )
      mesh.scale.set(ramp.width * WORLD_SCALE * 2, 1, 1)
      mesh.rotation.set(0.16, -heading, 0)
      mesh.castShadow = true
      mesh.receiveShadow = true
      this.root.add(mesh)
    }
  }

  update(sample: TrackSample, playerX: number): void {
    const lateral = playerX * WORLD_SCALE
    const originX = sample.x + Math.cos(sample.heading) * lateral
    const originZ = sample.z + Math.sin(sample.heading) * lateral
    this.root.rotation.y = sample.heading
    floatingOrigin
      .set(originX, sample.y, originZ)
      .applyAxisAngle(worldUp, sample.heading)
      .multiplyScalar(-1)
    this.root.position.copy(floatingOrigin)
    // The generated ribbon already covers the forward view. This patch trails the
    // floating origin to fill the otherwise missing ground before the start line.
    const patchDistance = 9
    this.groundPatch.position.set(
      originX - Math.sin(sample.heading) * patchDistance,
      sample.y - 0.1,
      originZ + Math.cos(sample.heading) * patchDistance,
    )
    this.mountains.position.set(originX, sample.y - 0.2, originZ)

    for (const batch of this.batches) {
      let changed = false
      batch.records.forEach((record, index) => {
        if (record.object.spent === record.hidden) return
        record.hidden = record.object.spent
        batch.mesh.setMatrixAt(index, record.hidden ? hiddenMatrix : record.matrix)
        changed = true
      })
      if (changed) batch.mesh.instanceMatrix.needsUpdate = true
    }
  }

  dispose(): void {
    this.root.removeFromParent()
    this.tracker.dispose()
  }
}
