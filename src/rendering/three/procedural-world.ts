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
  Quaternion,
  Vector3,
} from 'three'
import {
  positionAtLateralOffset,
  type CompiledEntity,
  type CompiledTrack3D,
  type SampledTrackPoint,
  type TrackFrame,
  type Vec3,
} from '../../game/track/index'
import type { Prop, Track } from '../../game/track'
import type { LevelDef, ObstacleKind, SceneryKind } from '../../game/types'
import type { QualityProfile } from './quality'
import { ResourceTracker } from './resources'
import type { WorldVisualProfile } from './world-builder'

type WorldKind = ObstacleKind | SceneryKind | 'coin'
type VisibleEntity = Exclude<CompiledEntity, { category: 'ramp' }>

interface InstanceRecord {
  readonly entityId: string
  readonly matrix: Matrix4
  hidden: boolean
}

interface InstanceBatch {
  readonly mesh: InstancedMesh
  readonly records: InstanceRecord[]
}

const hiddenMatrix = new Matrix4().makeScale(0, 0, 0)
const transform = new Object3D()
const frameMatrix = new Matrix4()
const frameQuaternion = new Quaternion()
const frameRight = new Vector3()
const frameNormal = new Vector3()
const frameTangent = new Vector3()
const anchor = new Vector3()
const offset = new Vector3()

function copyVector(target: Vector3, value: Vec3): Vector3 {
  return target.set(value.x, value.y, value.z)
}

function quaternionForFrame(frame: TrackFrame, target: Quaternion): Quaternion {
  frameMatrix.makeBasis(
    copyVector(frameRight, frame.right),
    copyVector(frameNormal, frame.normal),
    copyVector(frameTangent, frame.tangent),
  )
  return target.setFromRotationMatrix(frameMatrix)
}

function makeRibbonGeometry(
  compiled: CompiledTrack3D,
  widthScale: number,
  normalOffset: number,
): BufferGeometry {
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []

  compiled.samples.forEach((sample) => {
    const width = Math.max(
      sample.halfWidth * widthScale,
      widthScale > 2 ? 10 : sample.halfWidth,
    )
    const { position, frame } = sample
    const normalX = frame.normal.x * normalOffset
    const normalY = frame.normal.y * normalOffset
    const normalZ = frame.normal.z * normalOffset
    const sideX = frame.right.x * width
    const sideY = frame.right.y * width
    const sideZ = frame.right.z * width
    positions.push(
      position.x - sideX + normalX,
      position.y - sideY + normalY,
      position.z - sideZ + normalZ,
      position.x + sideX + normalX,
      position.y + sideY + normalY,
      position.z + sideZ + normalZ,
    )
    const color = new Color(sample.dark ? '#f4f8fc' : '#ffffff')
    colors.push(color.r, color.g, color.b, color.r, color.g, color.b)
  })

  for (let index = 0; index < compiled.samples.length - 1; index++) {
    const start = index * 2
    indices.push(start, start + 2, start + 1, start + 2, start + 3, start + 1)
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
  for (let index = 0; index < 13; index++) {
    const far = new Mesh(
      tracker.track(new ConeGeometry(4 + (index % 3), 7 + (index % 4), 5)),
      farMaterial,
    )
    far.position.set((index - 6) * 5.2, 1.4 + (index % 2), 34 + (index % 3) * 4)
    far.rotation.y = index * 0.73
    group.add(far)
  }
  for (let index = 0; index < 8; index++) {
    const near = new Mesh(
      tracker.track(new ConeGeometry(2.8 + (index % 2), 5.5, 6)),
      nearMaterial,
    )
    near.position.set((index - 3.5) * 7.3, 0.6, 25 + (index % 2) * 3)
    near.rotation.y = index * 0.41
    group.add(near)
  }
  return group
}

function mapSourceProps(track: Track, compiled: CompiledTrack3D): ReadonlyMap<string, Prop> {
  const props = new Map<string, Prop>()
  for (const entity of compiled.entities) {
    if (entity.category === 'ramp') continue
    const segment = track.segments[entity.sourceSegmentIndex]
    const source = entity.category === 'obstacle'
      ? segment.obstacles[entity.sourceOrdinal]
      : entity.category === 'scenery'
        ? segment.scenery[entity.sourceOrdinal]
        : segment.coins[entity.sourceOrdinal]
    props.set(entity.id, source)
  }
  return props
}

export class ProceduralWorld {
  readonly root = new Group()
  readonly visualProfile: WorldVisualProfile = {
    fogNearScale: 0.096,
    fogFarScale: 0.2,
    cameraFarScale: 0.2,
    cameraFarPadding: 12,
    sprayCountScale: 1,
    sprayForceScale: 1,
  }
  private readonly tracker = new ResourceTracker()
  private readonly batches: InstanceBatch[] = []
  private readonly sourcePropsByEntityId: ReadonlyMap<string, Prop>
  private readonly mountains: Group
  private readonly groundPatch: Mesh

  constructor(
    track: Track,
    readonly compiled: CompiledTrack3D,
    readonly level: LevelDef,
    quality: QualityProfile,
  ) {
    this.sourcePropsByEntityId = mapSourceProps(track, compiled)

    const terrainGeometry = this.tracker.track(makeRibbonGeometry(compiled, 7.5, -0.08))
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

    const patchGeometry = this.tracker.track(new PlaneGeometry(70, 18))
    patchGeometry.rotateX(-Math.PI / 2)
    this.groundPatch = new Mesh(patchGeometry, terrainMaterial)
    this.groundPatch.receiveShadow = true
    this.root.add(this.groundPatch)

    const courseGeometry = this.tracker.track(makeRibbonGeometry(compiled, 1, 0))
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
    const records = new Map<WorldKind, VisibleEntity[]>()
    const add = (kind: WorldKind, entity: VisibleEntity): void => {
      const list = records.get(kind) ?? []
      list.push(entity)
      records.set(kind, list)
    }

    for (const entity of this.compiled.scenery) {
      const keep = ((entity.sourceSegmentIndex * 31 + entity.sourceOrdinal * 17) % 100) / 100
        < quality.sceneryDensity
      if (keep) add(entity.kind, entity)
    }
    this.compiled.obstacles.forEach((entity) => add(entity.kind, entity))
    this.compiled.coins.forEach((entity) => add('coin', entity))

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

      entries.forEach((entity, index) => {
        let visualScale = entity.visualScale * 1.15
        if (kind === 'building') visualScale = entity.visualScale * 1.8
        else if (kind === 'coin') visualScale = entity.visualScale

        const { position, frame } = entity.transform
        transform.position.set(
          position.x + frame.normal.x * baseHeight(kind) * visualScale,
          position.y + frame.normal.y * baseHeight(kind) * visualScale,
          position.z + frame.normal.z * baseHeight(kind) * visualScale,
        )
        transform.quaternion.copy(quaternionForFrame(frame, frameQuaternion))
        transform.rotateY(((entity.sourceSegmentIndex * 47) % 31) * 0.17)
        if (kind === 'coin') transform.rotateX(Math.PI / 2)
        if (kind === 'log') transform.rotateZ(Math.PI / 2)
        transform.scale.setScalar(visualScale)
        if (kind === 'building') {
          transform.scale.y *= 2.2 + (entity.sourceSegmentIndex % 4) * 0.5
        }
        transform.updateMatrix()

        const hidden = this.sourcePropsByEntityId.get(entity.id)?.spent ?? false
        mesh.setMatrixAt(index, hidden ? hiddenMatrix : transform.matrix)
        batchRecords.push({ entityId: entity.id, matrix: transform.matrix.clone(), hidden })
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
    for (const ramp of this.compiled.ramps) {
      const mesh = new Mesh(geometry, material)
      const { position, frame } = ramp.transform
      const midpoint = ramp.length * 0.5
      mesh.position.set(
        position.x + frame.tangent.x * midpoint + frame.normal.x * 0.12,
        position.y + frame.tangent.y * midpoint + frame.normal.y * 0.12,
        position.z + frame.tangent.z * midpoint + frame.normal.z * 0.12,
      )
      mesh.quaternion.copy(quaternionForFrame(frame, frameQuaternion))
      mesh.rotateX(-0.16)
      mesh.scale.set(ramp.halfWidth * 2, 1, ramp.length / 0.22)
      mesh.castShadow = true
      mesh.receiveShadow = true
      this.root.add(mesh)
    }
  }

  update(sample: SampledTrackPoint, playerX: number): void {
    const playerPosition = positionAtLateralOffset(
      sample,
      playerX,
      this.compiled.simulationUnitsPerRenderUnit,
    )
    copyVector(anchor, playerPosition)

    quaternionForFrame(sample.frame, frameQuaternion)
    this.root.quaternion.copy(frameQuaternion).invert()
    this.root.position.copy(anchor).applyQuaternion(this.root.quaternion).multiplyScalar(-1)

    copyVector(this.groundPatch.position, playerPosition)
    copyVector(offset, sample.frame.tangent).multiplyScalar(-9)
    this.groundPatch.position.add(offset)
    copyVector(offset, sample.frame.normal).multiplyScalar(-0.1)
    this.groundPatch.position.add(offset)
    this.groundPatch.quaternion.copy(frameQuaternion)

    copyVector(this.mountains.position, playerPosition)
    copyVector(offset, sample.frame.normal).multiplyScalar(-0.2)
    this.mountains.position.add(offset)
    this.mountains.quaternion.copy(frameQuaternion)

    for (const batch of this.batches) {
      let changed = false
      batch.records.forEach((record, index) => {
        const hidden = this.sourcePropsByEntityId.get(record.entityId)?.spent ?? false
        if (hidden === record.hidden) return
        record.hidden = hidden
        batch.mesh.setMatrixAt(index, hidden ? hiddenMatrix : record.matrix)
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
