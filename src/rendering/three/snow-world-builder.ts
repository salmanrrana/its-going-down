/*
 * THESIS: Niseko is a broad living alpine diorama, not a white road bordered by primitives.
 * OWN-WORLD: Luminous groomed snow, deep evergreen masses, warm timber landmarks, and faceted blue atmospheric ridges.
 * STORY: The rider reads a generous center corridor while authored clusters, signage, lodge, and horizon establish place and speed.
 * FIRST VIEWPORT: Small articulated rider in the lower third; corduroy piste through the middle; asymmetric trees and lodge framing a large three-layer mountain field.
 * FORM: Cinematic Chase, using compiled track frames for every surface, placement, and motion cue while adaptive density preserves the composition on mobile.
 */
import {
  BackSide,
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
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three'
import type { Prop, Track } from '../../game/track'
import {
  type CompiledEntity,
  type CompiledTrack3D,
  type SampledTrackPoint,
  type TrackFrame,
  type Vec3,
} from '../../game/track/index'
import type { LevelDef } from '../../game/types'
import type { QualityProfile } from './quality'
import { ResourceTracker } from './resources'
import type { WorldVisualProfile } from './world-builder'

export const SNOW_WORLD_COLORS = Object.freeze({
  powder: '#f9fcff',
  pisteBlue: '#e8f4ff',
  groove: '#a9cae5',
  bankShadow: '#8fb8da',
  pineDark: '#173d36',
  pineMid: '#205448',
  pineLight: '#2f6c5a',
  snowCap: '#eef8ff',
  trunk: '#594334',
  lodgeWood: '#7b3f2a',
  lodgeTrim: '#f5ead7',
  warmSignal: '#f4a33b',
  hazard: '#e95b3f',
})

export type SnowMaterialRole = keyof typeof SNOW_WORLD_COLORS

export function snowMaterialSpec(role: SnowMaterialRole): Readonly<{
  color: string
  roughness: number
  metalness: number
  flatShading: boolean
}> {
  const snow = role === 'powder' || role === 'pisteBlue' || role === 'snowCap' || role === 'groove'
  return Object.freeze({
    color: SNOW_WORLD_COLORS[role],
    roughness: snow ? 0.92 : 0.82,
    metalness: 0,
    flatShading: role !== 'powder' && role !== 'pisteBlue' && role !== 'groove',
  })
}

export interface SnowTreePlacement {
  readonly sampleIndex: number
  readonly lateral: number
  readonly scale: number
  readonly variant: number
  readonly yaw: number
}

function hash01(a: number, b: number, c = 0): number {
  let value = Math.imul(a + 0x9e3779b9, 0x85ebca6b)
  value ^= Math.imul(b + 0xc2b2ae35, 0x27d4eb2f)
  value ^= Math.imul(c + 0x165667b1, 0x9e3779b1)
  value ^= value >>> 15
  return (value >>> 0) / 0x100000000
}

export function createSnowTreePlacements(
  compiled: CompiledTrack3D,
  density: number,
): readonly SnowTreePlacement[] {
  const placements: SnowTreePlacement[] = []
  const clusterSpacing = 72
  const maxSample = compiled.samples.length - 10
  const clampedDensity = Math.max(0.35, Math.min(1, density))

  for (let cluster = 0, anchor = 28; anchor < maxSample; cluster++, anchor += clusterSpacing) {
    const side = cluster % 3 === 1 ? 1 : -1
    const oppositeSide = cluster % 4 === 3
    const count = Math.max(3, Math.round((4 + (cluster % 3)) * clampedDensity))
    for (let index = 0; index < count; index++) {
      const sampleIndex = Math.min(
        maxSample,
        Math.max(4, anchor + Math.round((hash01(cluster, index, 1) - 0.5) * 28)),
      )
      const sample = compiled.samples[sampleIndex]
      const resolvedSide = oppositeSide && index === count - 1 ? -side : side
      const setback = 3 + hash01(cluster, index, 2) * 5.4
      placements.push({
        sampleIndex,
        lateral: resolvedSide * (sample.halfWidth * 1.45 + setback),
        scale: 0.74 + hash01(cluster, index, 3) * 0.48,
        variant: Math.floor(hash01(cluster, index, 4) * 3),
        yaw: (hash01(cluster, index, 5) - 0.5) * 0.8,
      })
    }
  }

  return placements.sort((a, b) => a.sampleIndex - b.sampleIndex || a.lateral - b.lateral)
}

type VisibleEntity = Exclude<CompiledEntity, { category: 'ramp' }>

interface InstanceRecord {
  readonly entityId: string
  readonly instanceIndex: number
  readonly matrices: readonly Matrix4[]
  hidden: boolean
}

interface InstanceBatch {
  readonly meshes: readonly InstancedMesh[]
  readonly records: InstanceRecord[]
}

interface ResolvedTree {
  readonly position: Vec3
  readonly frame: TrackFrame
  readonly scale: number
  readonly variant: number
  readonly yaw: number
  readonly entityId: string | null
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
const color = new Color()

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

function offsetPosition(position: Vec3, frame: TrackFrame, lateral: number, normal = 0): Vec3 {
  return {
    x: position.x + frame.right.x * lateral + frame.normal.x * normal,
    y: position.y + frame.right.y * lateral + frame.normal.y * normal,
    z: position.z + frame.right.z * lateral + frame.normal.z * normal,
  }
}

function makeCrossSectionGeometry(compiled: CompiledTrack3D): BufferGeometry {
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const cross = [-10, -1.9, -1.42, 1.42, 1.9, 10]
  const heights = [-0.28, 0.1, 0.035, 0.035, 0.1, -0.28]
  const tones = ['#a5c7e3', '#c6def1', '#f0f8ff', '#f0f8ff', '#c6def1', '#a5c7e3']

  compiled.samples.forEach((sample) => {
    cross.forEach((factor, crossIndex) => {
      const lateral = sample.halfWidth * factor
      const height = heights[crossIndex]
      positions.push(
        sample.position.x + sample.frame.right.x * lateral + sample.frame.normal.x * height,
        sample.position.y + sample.frame.right.y * lateral + sample.frame.normal.y * height,
        sample.position.z + sample.frame.right.z * lateral + sample.frame.normal.z * height,
      )
      color.set(tones[crossIndex])
      colors.push(color.r, color.g, color.b)
    })
  })

  const row = cross.length
  for (let sampleIndex = 0; sampleIndex < compiled.samples.length - 1; sampleIndex++) {
    for (let crossIndex = 0; crossIndex < row - 1; crossIndex++) {
      const start = sampleIndex * row + crossIndex
      indices.push(start, start + row, start + 1, start + row, start + row + 1, start + 1)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

function makePisteGeometry(compiled: CompiledTrack3D, widthScale = 1): BufferGeometry {
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []

  compiled.samples.forEach((sample, sampleIndex) => {
    const width = sample.halfWidth * widthScale
    const edgeTone = sampleIndex % 18 < 9 ? '#eaf5ff' : '#f5fbff'
    for (const side of [-1, 1]) {
      positions.push(
        sample.position.x + sample.frame.right.x * width * side + sample.frame.normal.x * 0.045,
        sample.position.y + sample.frame.right.y * width * side + sample.frame.normal.y * 0.045,
        sample.position.z + sample.frame.right.z * width * side + sample.frame.normal.z * 0.045,
      )
      color.set(edgeTone)
      colors.push(color.r, color.g, color.b)
    }
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

function makeCorduroyGeometry(
  compiled: CompiledTrack3D,
  grooveCount: number,
  sampleStep: number,
): BufferGeometry {
  const positions: number[] = []
  const indices: number[] = []
  let vertex = 0

  for (let groove = 0; groove < grooveCount; groove++) {
    const normalized = grooveCount === 1 ? 0 : groove / (grooveCount - 1)
    const lateralFactor = -0.92 + normalized * 1.84
    const halfGrooveWidth = 0.012
    const startVertex = vertex
    for (let sampleIndex = 0; sampleIndex < compiled.samples.length; sampleIndex += sampleStep) {
      const sample = compiled.samples[sampleIndex]
      const lateral = sample.halfWidth * lateralFactor
      for (const side of [-1, 1]) {
        const grooveOffset = lateral + side * halfGrooveWidth
        positions.push(
          sample.position.x + sample.frame.right.x * grooveOffset + sample.frame.normal.x * 0.052,
          sample.position.y + sample.frame.right.y * grooveOffset + sample.frame.normal.y * 0.052,
          sample.position.z + sample.frame.right.z * grooveOffset + sample.frame.normal.z * 0.052,
        )
        vertex++
      }
    }
    const rows = (vertex - startVertex) / 2
    for (let row = 0; row < rows - 1; row++) {
      const start = startVertex + row * 2
      indices.push(start, start + 2, start + 1, start + 2, start + 3, start + 1)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

function addTriangle(
  positions: number[],
  colors: number[],
  a: readonly number[],
  b: readonly number[],
  c: readonly number[],
  tone: string,
): void {
  positions.push(...a, ...b, ...c)
  color.set(tone)
  for (let index = 0; index < 3; index++) colors.push(color.r, color.g, color.b)
}

function makeMountainMassGeometry(width: number, height: number, depth: number, seed: number): BufferGeometry {
  const positions: number[] = []
  const colors: number[] = []
  const peakShift = (hash01(seed, 1) - 0.5) * width * 0.22
  const peak: readonly number[] = [peakShift, height, depth * 0.08]
  const left: readonly number[] = [-width * 0.55, 0, 0]
  const right: readonly number[] = [width * 0.55, 0, 0]
  const front: readonly number[] = [0, -height * 0.08, -depth * 0.24]
  const back: readonly number[] = [peakShift * 0.25, height * 0.08, depth]
  const shoulderLeft: readonly number[] = [-width * 0.22, height * 0.38, depth * 0.02]
  const shoulderRight: readonly number[] = [width * 0.28, height * 0.31, depth * 0.06]

  addTriangle(positions, colors, left, shoulderLeft, front, '#395777')
  addTriangle(positions, colors, shoulderLeft, peak, front, '#52749a')
  addTriangle(positions, colors, peak, shoulderRight, front, '#6888aa')
  addTriangle(positions, colors, shoulderRight, right, front, '#304e70')
  addTriangle(positions, colors, left, back, shoulderLeft, '#294765')
  addTriangle(positions, colors, shoulderLeft, back, peak, '#345879')
  addTriangle(positions, colors, peak, back, shoulderRight, '#284865')
  addTriangle(positions, colors, shoulderRight, back, right, '#223f5d')

  const snowLeft: readonly number[] = [peakShift - width * 0.16, height * 0.63, depth * 0.025]
  const snowRight: readonly number[] = [peakShift + width * 0.18, height * 0.59, depth * 0.04]
  const snowFront: readonly number[] = [peakShift + width * 0.02, height * 0.48, -depth * 0.08]
  addTriangle(positions, colors, peak, snowLeft, snowFront, '#dbe9f4')
  addTriangle(positions, colors, peak, snowFront, snowRight, '#eef6fb')
  addTriangle(positions, colors, peak, snowRight, back, '#b8cfdf')

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
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

function createMaterial(tracker: ResourceTracker, role: SnowMaterialRole): MeshStandardMaterial {
  const material = new MeshStandardMaterial(snowMaterialSpec(role))
  tracker.trackMaterial(material)
  return material
}

function setInstanceTransform(
  mesh: InstancedMesh,
  index: number,
  position: Vec3,
  frame: TrackFrame,
  localPosition: readonly [number, number, number],
  localScale: readonly [number, number, number],
  yaw: number,
  retainMatrix = false,
): Matrix4 | null {
  transform.position.set(position.x, position.y, position.z)
  transform.quaternion.copy(quaternionForFrame(frame, frameQuaternion))
  transform.rotateY(yaw)
  transform.translateX(localPosition[0])
  transform.translateY(localPosition[1])
  transform.translateZ(localPosition[2])
  transform.scale.set(localScale[0], localScale[1], localScale[2])
  transform.updateMatrix()
  mesh.setMatrixAt(index, transform.matrix)
  return retainMatrix ? transform.matrix.clone() : null
}

export class SnowWorldBuilder {
  readonly root = new Group()
  readonly visualProfile: WorldVisualProfile = {
    fogNearScale: 0.1,
    fogFarScale: 0.4,
    cameraFarScale: 0.4,
    cameraFarPadding: 40,
    sprayCountScale: 1.7,
    sprayForceScale: 1.08,
  }
  private readonly tracker = new ResourceTracker()
  private readonly sourcePropsByEntityId: ReadonlyMap<string, Prop>
  private readonly dynamicBatches: InstanceBatch[] = []
  private readonly horizon = new Group()
  private readonly sky: Mesh
  private readonly groundPatch: Mesh

  constructor(
    track: Track,
    readonly compiled: CompiledTrack3D,
    level: LevelDef,
    quality: QualityProfile,
  ) {
    this.sourcePropsByEntityId = mapSourceProps(track, compiled)

    const terrain = new Mesh(
      this.tracker.track(makeCrossSectionGeometry(compiled)),
      this.tracker.trackMaterial(new MeshStandardMaterial({
        color: '#ffffff',
        vertexColors: true,
        roughness: 0.96,
        metalness: 0,
        side: DoubleSide,
      })),
    )
    terrain.receiveShadow = true
    this.root.add(terrain)

    const piste = new Mesh(
      this.tracker.track(makePisteGeometry(compiled)),
      this.tracker.trackMaterial(new MeshStandardMaterial({
        color: '#ffffff',
        vertexColors: true,
        roughness: 0.88,
        metalness: 0,
        side: DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      })),
    )
    piste.receiveShadow = true
    this.root.add(piste)

    const grooveCount = quality.sceneryDensity > 0.8 ? 11 : quality.sceneryDensity > 0.5 ? 9 : 7
    const grooves = new Mesh(
      this.tracker.track(makeCorduroyGeometry(compiled, grooveCount, quality.sceneryDensity < 0.5 ? 3 : 2)),
      this.tracker.trackMaterial(new MeshStandardMaterial({
        color: SNOW_WORLD_COLORS.groove,
        roughness: 1,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        side: DoubleSide,
      })),
    )
    grooves.receiveShadow = false
    this.root.add(grooves)

    const patchGeometry = this.tracker.track(new PlaneGeometry(70, 30))
    patchGeometry.rotateX(-Math.PI / 2)
    this.groundPatch = new Mesh(patchGeometry, createMaterial(this.tracker, 'pisteBlue'))
    this.groundPatch.receiveShadow = true
    this.root.add(this.groundPatch)

    this.addTrees(quality)
    this.addHazardsAndCollectibles()
    this.addRamps()
    this.addLandmarks()
    this.addMountains(quality)
    this.root.add(this.horizon)

    const skyGeometry = this.tracker.track(new SphereGeometry(62, 24, 12))
    const skyPositions = skyGeometry.getAttribute('position')
    const skyColors: number[] = []
    const top = new Color(level.palette.skyTop)
    const bottom = new Color(level.palette.skyBottom)
    for (let index = 0; index < skyPositions.count; index++) {
      const mix = Math.max(0, Math.min(1, skyPositions.getY(index) / 42 + 0.42))
      color.copy(bottom).lerp(top, mix)
      skyColors.push(color.r, color.g, color.b)
    }
    skyGeometry.setAttribute('color', new Float32BufferAttribute(skyColors, 3))
    this.sky = new Mesh(
      skyGeometry,
      this.tracker.trackMaterial(new MeshBasicMaterial({
        vertexColors: true,
        side: BackSide,
        fog: false,
        depthWrite: false,
      })),
    )
    this.sky.renderOrder = -100
    this.root.add(this.sky)
  }

  private addTrees(quality: QualityProfile): void {
    const resolved: ResolvedTree[] = createSnowTreePlacements(this.compiled, quality.sceneryDensity)
      .map((placement) => {
        const sample = this.compiled.samples[placement.sampleIndex]
        return {
          position: offsetPosition(sample.position, sample.frame, placement.lateral),
          frame: sample.frame,
          scale: placement.scale,
          variant: placement.variant,
          yaw: placement.yaw,
          entityId: null,
        }
      })

    for (const entity of this.compiled.obstacles) {
      if (entity.kind !== 'tree') continue
      resolved.push({
        position: entity.transform.position,
        frame: entity.transform.frame,
        scale: Math.max(0.8, entity.visualScale * 1.15),
        variant: (entity.sourceSegmentIndex + entity.sourceOrdinal) % 3,
        yaw: hash01(entity.sourceSegmentIndex, entity.sourceOrdinal) * Math.PI,
        entityId: entity.id,
      })
    }

    if (resolved.length === 0) return
    const trunk = new InstancedMesh(
      this.tracker.track(new CylinderGeometry(0.11, 0.16, 1, 7)),
      createMaterial(this.tracker, 'trunk'),
      resolved.length,
    )
    const lower = new InstancedMesh(
      this.tracker.track(new IcosahedronGeometry(0.72, 0)),
      createMaterial(this.tracker, 'pineDark'),
      resolved.length,
    )
    const middle = new InstancedMesh(
      this.tracker.track(new IcosahedronGeometry(0.62, 0)),
      createMaterial(this.tracker, 'pineMid'),
      resolved.length,
    )
    const upper = new InstancedMesh(
      this.tracker.track(new IcosahedronGeometry(0.52, 0)),
      createMaterial(this.tracker, 'pineLight'),
      resolved.length,
    )
    const lowerSnow = new InstancedMesh(
      this.tracker.track(new IcosahedronGeometry(0.66, 0)),
      createMaterial(this.tracker, 'snowCap'),
      resolved.length,
    )
    const middleSnow = new InstancedMesh(
      this.tracker.track(new IcosahedronGeometry(0.55, 0)),
      createMaterial(this.tracker, 'snowCap'),
      resolved.length,
    )
    const upperSnow = new InstancedMesh(
      this.tracker.track(new IcosahedronGeometry(0.43, 0)),
      createMaterial(this.tracker, 'snowCap'),
      resolved.length,
    )
    const meshes = [trunk, lower, middle, upper, lowerSnow, middleSnow, upperSnow]
    meshes.forEach((mesh) => {
      mesh.castShadow = quality.shadows
      mesh.receiveShadow = true
      this.root.add(mesh)
    })

    const records: InstanceRecord[] = []
    resolved.forEach((tree, index) => {
      const s = tree.scale
      const variantWidth = 1 + (tree.variant - 1) * 0.08
      const retain = tree.entityId !== null
      const matrices = [
        setInstanceTransform(trunk, index, tree.position, tree.frame, [0, 0.48 * s, 0], [s, s, s], tree.yaw, retain),
        setInstanceTransform(lower, index, tree.position, tree.frame, [0, 1.0 * s, 0], [variantWidth * s, 0.56 * s, variantWidth * s], tree.yaw, retain),
        setInstanceTransform(middle, index, tree.position, tree.frame, [0.08 * s, 1.48 * s, 0], [0.86 * s, 0.53 * s, 0.86 * s], tree.yaw + 0.3, retain),
        setInstanceTransform(upper, index, tree.position, tree.frame, [-0.04 * s, 1.88 * s, 0], [0.7 * s, 0.55 * s, 0.7 * s], tree.yaw - 0.2, retain),
        setInstanceTransform(lowerSnow, index, tree.position, tree.frame, [-0.03 * s, 1.24 * s, -0.02 * s], [1.02 * s, 0.18 * s, 1.02 * s], tree.yaw, retain),
        setInstanceTransform(middleSnow, index, tree.position, tree.frame, [0.06 * s, 1.7 * s, 0], [0.86 * s, 0.17 * s, 0.86 * s], tree.yaw + 0.3, retain),
        setInstanceTransform(upperSnow, index, tree.position, tree.frame, [-0.04 * s, 2.08 * s, 0], [0.7 * s, 0.16 * s, 0.7 * s], tree.yaw - 0.2, retain),
      ].filter((matrix): matrix is Matrix4 => matrix !== null)
      if (!tree.entityId) return
      const hidden = this.sourcePropsByEntityId.get(tree.entityId)?.spent ?? false
      if (hidden) meshes.forEach((mesh) => mesh.setMatrixAt(index, hiddenMatrix))
      records.push({ entityId: tree.entityId, instanceIndex: index, matrices, hidden })
    })
    meshes.forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true })
    this.dynamicBatches.push({ meshes, records })
  }

  private addHazardsAndCollectibles(): void {
    const records = new Map<'rock' | 'log' | 'coin', VisibleEntity[]>()
    const add = (kind: 'rock' | 'log' | 'coin', entity: VisibleEntity): void => {
      const list = records.get(kind) ?? []
      list.push(entity)
      records.set(kind, list)
    }
    for (const obstacle of this.compiled.obstacles) {
      if (obstacle.kind === 'rock' || obstacle.kind === 'log') add(obstacle.kind, obstacle)
    }
    this.compiled.coins.forEach((coinEntity) => add('coin', coinEntity))

    for (const [kind, entities] of records) {
      const geometry = kind === 'rock'
        ? new IcosahedronGeometry(0.48, 1)
        : kind === 'log'
          ? new CylinderGeometry(0.24, 0.3, 1.25, 9)
          : new CylinderGeometry(0.2, 0.2, 0.06, 18)
      const material = this.tracker.trackMaterial(new MeshStandardMaterial({
        color: kind === 'rock' ? '#526575' : kind === 'log' ? '#765038' : '#ffd34d',
        roughness: kind === 'coin' ? 0.28 : 0.84,
        metalness: kind === 'coin' ? 0.5 : 0,
        flatShading: true,
      }))
      const mesh = new InstancedMesh(this.tracker.track(geometry), material, entities.length)
      mesh.castShadow = kind !== 'coin'
      mesh.receiveShadow = true
      const batchRecords: InstanceRecord[] = []
      entities.forEach((entity, index) => {
        const scale = entity.visualScale * (kind === 'rock' ? 0.9 : 1)
        const normalHeight = kind === 'coin' ? 0.72 : kind === 'rock' ? 0.36 : 0.3
        transform.position.set(
          entity.transform.position.x + entity.transform.frame.normal.x * normalHeight * scale,
          entity.transform.position.y + entity.transform.frame.normal.y * normalHeight * scale,
          entity.transform.position.z + entity.transform.frame.normal.z * normalHeight * scale,
        )
        transform.quaternion.copy(quaternionForFrame(entity.transform.frame, frameQuaternion))
        transform.rotateY(hash01(entity.sourceSegmentIndex, entity.sourceOrdinal) * Math.PI)
        if (kind === 'coin') transform.rotateX(Math.PI / 2)
        if (kind === 'log') transform.rotateZ(Math.PI / 2)
        transform.scale.setScalar(scale)
        transform.updateMatrix()
        const hidden = this.sourcePropsByEntityId.get(entity.id)?.spent ?? false
        mesh.setMatrixAt(index, hidden ? hiddenMatrix : transform.matrix)
        batchRecords.push({
          entityId: entity.id,
          instanceIndex: index,
          matrices: [transform.matrix.clone()],
          hidden,
        })
      })
      mesh.instanceMatrix.needsUpdate = true
      this.root.add(mesh)
      this.dynamicBatches.push({ meshes: [mesh], records: batchRecords })
    }
  }

  private addRamps(): void {
    if (this.compiled.ramps.length === 0) return
    const mesh = new InstancedMesh(
      this.tracker.track(new BoxGeometry(1, 0.16, 0.24)),
      this.tracker.trackMaterial(new MeshStandardMaterial({
        color: '#dbefff',
        roughness: 0.8,
        flatShading: true,
      })),
      this.compiled.ramps.length,
    )
    this.compiled.ramps.forEach((ramp, index) => {
      const midpoint = ramp.length * 0.5
      transform.position.set(
        ramp.transform.position.x + ramp.transform.frame.tangent.x * midpoint + ramp.transform.frame.normal.x * 0.11,
        ramp.transform.position.y + ramp.transform.frame.tangent.y * midpoint + ramp.transform.frame.normal.y * 0.11,
        ramp.transform.position.z + ramp.transform.frame.tangent.z * midpoint + ramp.transform.frame.normal.z * 0.11,
      )
      transform.quaternion.copy(quaternionForFrame(ramp.transform.frame, frameQuaternion))
      transform.rotateX(-0.16)
      transform.scale.set(ramp.halfWidth * 2, 1, ramp.length / 0.24)
      transform.updateMatrix()
      mesh.setMatrixAt(index, transform.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.castShadow = true
    mesh.receiveShadow = true
    this.root.add(mesh)
  }

  private sampleAtProgress(progress: number): CompiledTrack3D['samples'][number] {
    const sourceSegment = Math.round(
      Math.max(0, Math.min(1, progress)) * (this.compiled.sampleBySourceSegment.length - 1),
    )
    return this.compiled.samples[this.compiled.sampleBySourceSegment[sourceSegment]]
  }

  private placeGroup(group: Group, progress: number, lateral: number, normal = 0): void {
    const sample = this.sampleAtProgress(progress)
    const position = offsetPosition(sample.position, sample.frame, lateral, normal)
    group.position.set(position.x, position.y, position.z)
    group.quaternion.copy(quaternionForFrame(sample.frame, frameQuaternion))
    this.root.add(group)
  }

  private addLandmarks(): void {
    const lodge = new Group()
    const wood = createMaterial(this.tracker, 'lodgeWood')
    const trim = createMaterial(this.tracker, 'lodgeTrim')
    const roofMaterial = this.tracker.trackMaterial(new MeshStandardMaterial({ color: '#284758', roughness: 0.9, flatShading: true }))
    const windowMaterial = this.tracker.trackMaterial(new MeshStandardMaterial({
      color: SNOW_WORLD_COLORS.warmSignal,
      emissive: '#8f3f12',
      emissiveIntensity: 0.55,
      roughness: 0.5,
    }))
    const body = new Mesh(this.tracker.track(new BoxGeometry(3.2, 1.65, 2.1)), wood)
    body.position.y = 0.85
    const roof = new Mesh(this.tracker.track(new ConeGeometry(2.45, 1.2, 4)), roofMaterial)
    roof.position.y = 2.0
    roof.rotation.y = Math.PI * 0.25
    roof.scale.z = 0.72
    const snowRoof = new Mesh(this.tracker.track(new ConeGeometry(2.54, 0.34, 4)), trim)
    snowRoof.position.y = 2.52
    snowRoof.rotation.y = Math.PI * 0.25
    snowRoof.scale.z = 0.72
    const chimney = new Mesh(this.tracker.track(new BoxGeometry(0.3, 0.9, 0.34)), roofMaterial)
    chimney.position.set(0.7, 2.5, 0.15)
    lodge.add(body, roof, snowRoof, chimney)
    for (const x of [-0.85, 0, 0.85]) {
      const window = new Mesh(this.tracker.track(new BoxGeometry(0.42, 0.48, 0.06)), windowMaterial)
      window.position.set(x, 1.03, -1.07)
      lodge.add(window)
    }
    lodge.traverse((object) => {
      if (!(object instanceof Mesh)) return
      object.castShadow = true
      object.receiveShadow = true
    })
    this.placeGroup(lodge, 0.03, -5.2)

    const poleGeometry = this.tracker.track(new CylinderGeometry(0.035, 0.045, 1.25, 6))
    const poleMaterial = this.tracker.trackMaterial(new MeshStandardMaterial({ color: '#4b392f', roughness: 0.88 }))
    const pennantGeometry = this.tracker.track(new BufferGeometry())
    pennantGeometry.setAttribute('position', new Float32BufferAttribute([
      0, 0, 0,
      0.58, -0.17, 0,
      0, -0.34, 0,
    ], 3))
    pennantGeometry.computeVertexNormals()
    const flagMaterial = this.tracker.trackMaterial(new MeshStandardMaterial({ color: SNOW_WORLD_COLORS.hazard, side: DoubleSide, roughness: 0.75 }))
    const signMaterial = this.tracker.trackMaterial(new MeshStandardMaterial({ color: '#245d72', roughness: 0.82, flatShading: true }))

    for (const [index, progress] of [0.015, 0.07, 0.14, 0.24, 0.35].entries()) {
      const side = index % 2 === 0 ? 1 : -1
      const marker = new Group()
      const pole = new Mesh(poleGeometry, poleMaterial)
      pole.position.y = 0.62
      const pennant = new Mesh(pennantGeometry, flagMaterial)
      pennant.position.set(0, 1.12, 0)
      pennant.rotation.y = side > 0 ? Math.PI : 0
      const sign = new Mesh(this.tracker.track(new BoxGeometry(0.72, 0.34, 0.1)), signMaterial)
      sign.position.set(0, 0.83, 0)
      marker.add(pole, pennant, sign)
      marker.traverse((object) => {
        if (object instanceof Mesh) object.castShadow = true
      })
      const sample = this.sampleAtProgress(progress)
      this.placeGroup(marker, progress, side * (sample.halfWidth * 1.5 + 0.65))
    }
  }

  private addMountains(quality: QualityProfile): void {
    const material = this.tracker.trackMaterial(new MeshStandardMaterial({
      color: '#ffffff',
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      flatShading: true,
      fog: true,
    }))
    const layers = [
      { z: 24, count: quality.sceneryDensity < 0.5 ? 3 : 4, width: 14, height: 9, scale: 1 },
      { z: 37, count: quality.sceneryDensity < 0.5 ? 3 : 4, width: 18, height: 12, scale: 1.05 },
      { z: 51, count: quality.sceneryDensity < 0.5 ? 2 : 3, width: 23, height: 15, scale: 1.1 },
    ]
    layers.forEach((layer, layerIndex) => {
      for (let index = 0; index < layer.count; index++) {
        const mass = new Mesh(
          this.tracker.track(makeMountainMassGeometry(
            layer.width * (0.82 + hash01(layerIndex, index, 7) * 0.4),
            layer.height * (0.75 + hash01(layerIndex, index, 8) * 0.48),
            5 + layerIndex * 2,
            layerIndex * 17 + index,
          )),
          material,
        )
        const spread = layer.width * 0.78
        mass.position.set(
          (index - (layer.count - 1) * 0.5) * spread + (layerIndex % 2 ? -4 : 3),
          -1.2 - layerIndex * 0.7,
          layer.z + (index % 2) * 2.8,
        )
        mass.scale.setScalar(layer.scale)
        mass.castShadow = false
        mass.receiveShadow = false
        this.horizon.add(mass)
      }
    })
  }

  update(sample: SampledTrackPoint, playerX: number): void {
    const playerPosition = offsetPosition(
      sample.position,
      sample.frame,
      playerX / this.compiled.simulationUnitsPerRenderUnit,
    )
    copyVector(anchor, playerPosition)

    quaternionForFrame(sample.frame, frameQuaternion)
    this.root.quaternion.copy(frameQuaternion).invert()
    this.root.position.copy(anchor).applyQuaternion(this.root.quaternion).multiplyScalar(-1)

    copyVector(this.groundPatch.position, playerPosition)
    copyVector(offset, sample.frame.tangent).multiplyScalar(-10)
    this.groundPatch.position.add(offset)
    copyVector(offset, sample.frame.normal).multiplyScalar(-0.3)
    this.groundPatch.position.add(offset)
    this.groundPatch.quaternion.copy(frameQuaternion)

    copyVector(this.horizon.position, playerPosition)
    copyVector(offset, sample.frame.normal).multiplyScalar(-0.25)
    this.horizon.position.add(offset)
    this.horizon.quaternion.copy(frameQuaternion)

    copyVector(this.sky.position, playerPosition)
    this.sky.quaternion.copy(frameQuaternion)

    for (const batch of this.dynamicBatches) {
      let changed = false
      batch.records.forEach((record) => {
        const hidden = this.sourcePropsByEntityId.get(record.entityId)?.spent ?? false
        if (hidden === record.hidden) return
        record.hidden = hidden
        batch.meshes.forEach((mesh, meshIndex) => {
          mesh.setMatrixAt(
            record.instanceIndex,
            hidden ? hiddenMatrix : record.matrices[meshIndex],
          )
        })
        changed = true
      })
      if (changed) batch.meshes.forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true })
    }
  }

  dispose(): void {
    this.root.removeFromParent()
    this.tracker.dispose()
  }
}
