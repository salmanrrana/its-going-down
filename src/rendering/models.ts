import * as THREE from 'three'
import { OBSTACLE_HALF_WIDTH } from '../game/constants'
import { WORLD_SCALE } from './course'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type {
  LevelDef,
  LevelId,
  ObstacleKind,
  SceneryKind,
} from '../game/types'

type Triple = [number, number, number]
export type ModelKind =
  | SceneryKind
  | ObstacleKind
  | 'coin'
  | 'ramp'
  | 'gate'
  | 'mountain'
  | 'cloud'
  | 'bridge'
  | 'chalet'
  | 'grandstand'
  | 'sail'
  | 'wake'

/** Authored, vertex-painted meshes: no downloads, textures, or per-prop lights. */
class Model {
  private parts: THREE.BufferGeometry[] = []
  add(
    geometry: THREE.BufferGeometry,
    color: string,
    position: Triple,
    scale: Triple = [1, 1, 1],
    rotation: Triple = [0, 0, 0],
  ): void {
    const transform = new THREE.Object3D()
    transform.position.set(...position)
    transform.scale.set(...scale)
    transform.rotation.set(...rotation)
    transform.updateMatrix()
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone()
    geometry.dispose()
    g.deleteAttribute('uv')
    g.applyMatrix4(transform.matrix)
    const c = new THREE.Color(color)
    const colors = new Float32Array(g.getAttribute('position').count * 3)
    for (let i = 0; i < colors.length; i += 3) c.toArray(colors, i)
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    this.parts.push(g)
  }
  box(color: string, p: Triple, s: Triple, r: Triple = [0, 0, 0]): void {
    this.add(new THREE.BoxGeometry(), color, p, s, r)
  }
  cone(color: string, p: Triple, s: Triple, sides = 5): void {
    this.add(new THREE.ConeGeometry(1, 1, sides), color, p, s)
  }
  rock(color: string, p: Triple, s: Triple): void {
    this.add(new THREE.IcosahedronGeometry(1, 0), color, p, s)
  }
  finish(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.parts)
    this.parts.forEach((part) => part.dispose())
    return merged
  }
}

const COLLIDABLE: ReadonlySet<ModelKind> = new Set([
  'rock',
  'tree',
  'cone',
  'barrel',
  'log',
  'car',
  'hydrant',
  'crate',
])

const INK = '#202540'
const WHITE = '#fff5de'
const RED = '#f54e36'
const GOLD = '#ffd75a'

function pine(m: Model, snow: boolean): void {
  m.box('#654653', [0, 2, 0], [0.65, 4, 0.65])
  for (let i = 0; i < 3; i++) {
    const size = 3 - i * 0.7
    m.cone(
      i % 2 ? '#264f61' : '#286872',
      [0, 3.1 + i * 1.8, 0],
      [size, 4, size],
    )
    if (snow)
      m.cone('#edf3ff', [0, 3.9 + i * 1.8, 0], [size * 0.85, 2.5, size * 0.85])
  }
}

function vehicle(m: Model, kart = false, color = RED): void {
  const length = kart ? 3.3 : 5.4
  m.box(INK, [0, 0.6, 0], [2.9, 0.4, length])
  m.box(color, [0, 1.1, 0], [2.8, 0.75, length])
  m.box(WHITE, [0, 1.5, -length * 0.3], [0.45, 0.08, length * 0.35])
  for (const x of [-1.55, 1.55])
    for (const z of [-length * 0.32, length * 0.32]) {
      m.add(
        new THREE.CylinderGeometry(0.58, 0.58, 0.5, 8),
        INK,
        [x, 0.65, z],
        [1, 1, 1],
        [0, 0, Math.PI / 2],
      )
      m.box('#a8bdc5', [x * 1.13, 0.65, z], [0.04, 0.32, 0.32])
    }
  if (kart) {
    m.box(INK, [0, 1.6, 0.8], [1.25, 1.5, 0.3])
    m.box(color, [0, 1.9, 0.2], [0.9, 0.9, 0.7])
    m.rock(GOLD, [0, 2.65, 0.1], [0.6, 0.6, 0.6])
    m.box(INK, [0, 2.65, -0.42], [0.85, 0.23, 0.15])
    m.box(WHITE, [0, 1.4, 1.6], [3.7, 0.15, 0.5])
  } else {
    m.box('#92c4cf', [0, 1.95, 0.25], [2.3, 1.2, 2.55], [-0.08, 0, 0])
    m.box(color, [0, 2.55, 0.35], [2.45, 0.15, 2.1])
    m.box(color, [0, 1.95, 0.4], [2.4, 1.3, 0.17])
    m.box(INK, [0, 1.38, length * 0.48], [2.75, 0.2, 0.12])
    for (const x of [-1, 1]) {
      m.box(GOLD, [x, 1.2, -length / 2 - 0.02], [0.6, 0.3, 0.1])
      m.box('#ff9275', [x, 1.25, length / 2 + 0.02], [0.6, 0.24, 0.1])
    }
    m.box(WHITE, [0, 1.08, length / 2 + 0.05], [0.7, 0.25, 0.08])
  }
}

export function createRider(id: LevelId): THREE.BufferGeometry {
  const m = new Model()
  if (id === 'car' || id === 'gokart') {
    vehicle(m, id === 'gokart')
    return m.finish()
  }
  if (id === 'boat') {
    m.rock('#f4e9c8', [0, 0.6, 0], [2.3, 1.1, 4])
    m.box(RED, [0, 0.9, 0.5], [3.3, 0.45, 3.8])
    m.box(INK, [0, 1.2, 0.6], [2, 0.3, 1.8])
    m.box('#88dee2', [0, 1.7, -0.9], [2.7, 0.85, 0.2], [-0.35, 0, 0])
    m.box(RED, [0, 1.6, 0.4], [0.9, 1.1, 0.75])
    m.rock(GOLD, [0, 2.55, 0.3], [0.6, 0.6, 0.6])
    m.box(INK, [0, 0.5, 3], [0.9, 1.3, 0.65])
    return m.finish()
  }
  const snow = id === 'snowboard'
  const surf = id === 'surf'
  const boardRotation: Triple = [0, snow ? -0.32 : 0, 0]
  if (id !== 'rollerblade') {
    m.add(
      new THREE.CylinderGeometry(1, 1, 1, 8),
      surf ? GOLD : '#bfff70',
      [0, 0.19, 0],
      snow ? [2.65, 0.19, 0.6] : [0.65, 0.16, surf ? 2.6 : 1.55],
      boardRotation,
    )
    m.box(INK, [0, 0.3, 0], snow ? [1.1, 0.07, 0.9] : [0.8, 0.07, 1.7])
  }
  for (const side of [-1, 1]) {
    const x = side * (snow ? 0.74 : 0.46)
    m.box(INK, [x, 0.5, side * 0.2], [0.6, 0.5, 0.95])
    m.box('#424c78', [x, 1.1, 0.22], [0.63, 1.05, 0.67], [0.3, 0, -side * 0.15])
    m.box(
      '#313857',
      [side * 0.38, 1.85, 0.05],
      [0.7, 1.03, 0.7],
      [-0.38, 0, side * 0.32],
    )
    if (id === 'rollerblade' || id === 'skateboard') {
      for (const z of [-0.35, 0.35])
        m.rock(GOLD, [x, 0.15, z], [0.18, 0.18, 0.18])
    }
    m.box(
      surf ? '#df986e' : RED,
      [side * 1.08, 2.65, 0],
      [0.58, 1.35, 0.65],
      [0.1, 0, side * 0.8],
    )
    m.box(
      surf ? '#df986e' : '#ffc25d',
      [side * 1.63, 2.35, -0.22],
      [0.54, 0.85, 0.6],
      [-0.65, 0, side * 0.45],
    )
    m.rock(INK, [side * 1.8, 2.05, -0.48], [0.34, 0.35, 0.34])
  }
  m.box(surf ? '#3e8da3' : RED, [0, 2.65, 0], [1.4, 1.65, 0.95], [-0.12, 0, 0])
  m.box(WHITE, [0, 2.9, 0.53], [1.42, 0.3, 0.09])
  if (snow) {
    m.box('#ffbb59', [0, 2.7, 0.7], [0.9, 1.05, 0.42])
    m.box(INK, [0, 2.55, 0.94], [0.65, 0.1, 0.05])
  }
  m.rock('#e8ad86', [0, 3.7, -0.12], [0.65, 0.72, 0.63])
  m.rock(surf ? '#493649' : GOLD, [0, 4, -0.05], [0.77, 0.62, 0.74])
  m.box(INK, [0, 3.78, -0.66], [1.05, 0.29, 0.15])
  m.box('#a6f2df', [0, 3.8, -0.76], [0.78, 0.16, 0.03])
  return m.finish()
}

export function createProp(
  kind: ModelKind,
  level: LevelDef,
): THREE.BufferGeometry {
  const m = new Model()
  const snow = level.id === 'snowboard'
  switch (kind) {
    case 'pine':
    case 'tree':
      pine(m, snow)
      break
    case 'palm': {
      m.box('#92744f', [0, 4, 0], [0.65, 8, 0.75], [0, 0, 0.1])
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3
        m.add(
          new THREE.ConeGeometry(1, 1, 3),
          i % 2 ? '#4c9d65' : '#24765f',
          [Math.cos(a) * 2, 8, Math.sin(a) * 2],
          [1.25, 4.9, 0.55],
          [Math.cos(a) * 1.1, 0, -Math.sin(a) * 1.1],
        )
      }
      break
    }
    case 'rock':
      m.rock(snow ? '#6c82a6' : '#9d7d73', [0, 1, 0], [2.05, 1.5, 1.5])
      if (snow) m.rock('#eff5ff', [0, 1.55, 0], [1.7, 1, 1.3])
      break
    case 'building': {
      const coastal = level.id === 'rollerblade'
      m.box(coastal ? '#e8b483' : '#bc8f9b', [0, 5, 0], [7, 10, 6])
      m.box(coastal ? '#f6d7a5' : '#e7c9c6', [0, 9.8, 0], [7.5, 0.45, 6.5])
      m.cone('#9e5160', [0, 11, 0], [5.7, 2, 5], 4)
      for (const side of [-1, 1])
        for (let y = 2; y < 9; y += 2.5)
          for (const z of [-1.7, 1.7]) {
            m.box('#35445c', [side * 3.52, y, z], [0.08, 1.4, 1.2])
            m.box(WHITE, [side * 3.6, y - 0.8, z], [0.3, 0.15, 1.5])
          }
      break
    }
    case 'streetlight':
      m.box(INK, [0, 3.4, 0], [0.18, 6.8, 0.18])
      m.box(INK, [0.7, 6.8, 0], [1.6, 0.15, 0.18])
      m.box(GOLD, [1.35, 6.65, 0], [0.7, 0.25, 0.5])
      break
    case 'flag':
      m.box('#505d79', [0, 2.7, 0], [0.14, 5.4, 0.14])
      m.box(RED, [0.75, 4.6, 0], [1.5, 0.85, 0.08])
      m.box(WHITE, [0.75, 4.6, 0.05], [0.35, 0.85, 0.04])
      break
    case 'cactus':
      m.box('#4a8669', [0, 2.6, 0], [0.8, 5.2, 0.8])
      for (const s of [-1, 1]) {
        m.box('#4a8669', [s * 0.8, 2.6 + s * 0.5, 0], [1.4, 0.6, 0.7])
        m.box('#4a8669', [s * 1.35, 3.25 + s * 0.5, 0], [0.6, 1.8, 0.6])
      }
      break
    case 'reed':
      for (let i = 0; i < 5; i++)
        m.cone(
          '#658e51',
          [(i - 2) * 0.35, 1.2, (i % 2) * 0.4],
          [0.25, 2.4 + i * 0.3, 0.25],
          3,
        )
      break
    case 'cone':
    case 'buoy':
      m.box(INK, [0, 0.15, 0], [2.2, 0.3, 2.2])
      m.cone(RED, [0, 1.2, 0], [1, 2.3, 1])
      m.cone(WHITE, [0, 1.65, 0], [0.6, 0.8, 0.6])
      break
    case 'barrel':
    case 'hydrant':
      m.add(new THREE.CylinderGeometry(1, 1, 2, 8), RED, [0, 1, 0])
      for (const y of [0.3, 1.7])
        m.add(new THREE.CylinderGeometry(1.05, 1.05, 0.18, 8), INK, [0, y, 0])
      break
    case 'crate':
      m.box('#b98559', [0, 1.1, 0], [2.2, 2.2, 2.2])
      m.box('#6f514a', [0, 1.1, 1.12], [0.2, 2.7, 0.06], [0, 0, 0.75])
      m.box('#6f514a', [0, 1.1, -1.12], [0.2, 2.7, 0.06], [0, 0, 0.75])
      break
    case 'log':
      m.add(
        new THREE.CylinderGeometry(0.7, 0.8, 5.7, 7),
        '#78534c',
        [0, 0.8, 0],
        [1, 1, 1],
        [0, 0, Math.PI / 2],
      )
      for (const x of [-2.86, 2.86])
        m.add(
          new THREE.CylinderGeometry(0.61, 0.61, 0.04, 7),
          '#deb68a',
          [x, 0.8, 0],
          [1, 1, 1],
          [0, 0, Math.PI / 2],
        )
      break
    case 'car':
      vehicle(m)
      break
    case 'coin':
      m.add(
        new THREE.CylinderGeometry(0.65, 0.65, 0.18, 8),
        GOLD,
        [0, 0, 0],
        [1, 1, 1],
        [Math.PI / 2, 0, 0],
      )
      m.box('#fff2b4', [0, 0, 0.11], [0.15, 0.7, 0.03])
      break
    case 'ramp': {
      const g = new THREE.BufferGeometry()
      g.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          [-1, 0, 2, 1, 0, 2, -1, 1.5, -1, 1, 0, 2, 1, 1.5, -1, -1, 1.5, -1],
          3,
        ),
      )
      g.computeVertexNormals()
      m.add(g, GOLD, [0, 0.04, 0])
      for (const x of [-0.65, 0, 0.65])
        m.box(INK, [x, 0.81, 0.45], [0.11, 0.07, 2.9], [Math.atan(0.5), 0, 0])
      break
    }
    case 'gate':
      for (const x of [-1, 1]) m.box(RED, [x, 4.5, 0], [0.035, 9, 0.5])
      m.box(WHITE, [0, 8.4, 0], [2.06, 1.5, 0.35])
      for (let i = 0; i < 16; i++)
        m.box(
          INK,
          [-0.94 + i * 0.125, 8.4 + (i % 2 ? -0.375 : 0.375), 0.19],
          [0.125, 0.75, 0.04],
        )
      break
    case 'mountain':
      if (snow) {
        m.add(
          new THREE.CylinderGeometry(0.39, 1, 0.61, 5),
          level.palette.ridgeNear,
          [0, -0.195, 0],
        )
        m.cone('#eef0fb', [0, 0.305, 0], [0.39, 0.39, 0.39], 5)
      } else m.cone(level.palette.ridgeNear, [0, 0, 0], [1, 1, 1], 5)
      break
    case 'chalet':
      m.box('#8b5050', [0, 2.2, 0], [6, 4.4, 5])
      m.cone('#ecf2ff', [0, 5.2, 0], [5.1, 3.1, 4.5], 4)
      for (const x of [-1.7, 1.7]) m.box(GOLD, [x, 2.5, 2.53], [1.1, 1.5, 0.1])
      m.box('#463a4b', [0, 1.3, 2.54], [1.2, 2.6, 0.1])
      m.box('#735566', [1.5, 5.7, 0], [0.7, 2.2, 0.7])
      break
    case 'bridge':
      for (const x of [-16, 16]) {
        m.box('#d36050', [x, 18, 0], [1.8, 40, 1.8])
        m.box('#d36050', [x, 27, 0], [7, 1.2, 1.2])
        for (let i = -7; i <= 7; i++) {
          const end = 6 + Math.pow(Math.abs(i) / 7, 2) * 27
          m.box('#d36050', [x + i * 2, (end + 5) / 2, 0], [0.16, end - 5, 0.16])
        }
      }
      m.box('#7e6579', [0, 5, 0], [65, 1.2, 5])
      break
    case 'grandstand':
      for (let i = 0; i < 5; i++) {
        m.box(i % 2 ? '#c7554b' : '#d6d6c5', [0, 0.8 + i, -i], [18, 1.6, 2])
        for (let j = 0; j < 12; j++)
          m.rock(
            j % 2 ? '#ffdc75' : '#468eaf',
            [(j - 5.5) * 1.3, 1.9 + i, -i],
            [0.3, 0.45, 0.3],
          )
      }
      for (const x of [-8.5, 8.5]) m.box(INK, [x, 5, -2], [0.2, 10, 0.2])
      m.box('#e9dcc6', [0, 10, -2], [20, 0.4, 8])
      break
    case 'sail':
      m.rock(WHITE, [0, 0, 0], [2, 0.8, 5])
      m.box(INK, [0, 5, 0], [0.12, 10, 0.12])
      m.add(new THREE.ConeGeometry(1, 1, 3), WHITE, [0, 5.4, 0], [3.4, 8, 0.1])
      break
    case 'wake':
      m.box('#edf9ee', [-1.4, 0, 0], [0.3, 0.04, 1.8], [0, -0.2, 0])
      m.box('#edf9ee', [1.4, 0, 0], [0.3, 0.04, 1.8], [0, 0.2, 0])
      break
    case 'cloud':
      m.rock('#f9eadd', [0, 0, 0], [8, 1.5, 3])
      m.rock('#f9eadd', [-3, 0.9, 0], [4, 2, 2])
      break
  }
  const geometry = m.finish()
  if (COLLIDABLE.has(kind)) {
    // The simulation has one hazard width; paint exactly that hittable footprint.
    geometry.computeBoundingBox()
    const bounds = geometry.boundingBox
    if (bounds)
      geometry.scale(
        (2 * OBSTACLE_HALF_WIDTH * WORLD_SCALE) / (bounds.max.x - bounds.min.x),
        1,
        1,
      )
  }
  return geometry
}
