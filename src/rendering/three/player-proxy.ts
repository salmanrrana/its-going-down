import {
  BoxGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three'
import type { LevelDef } from '../../game/types'
import { ResourceTracker } from './resources'
import { WORLD_SCALE } from './track-compiler'

function boardColorFor(level: LevelDef): string {
  if (level.id === 'snowboard') return '#27bde8'
  if (level.id === 'surf') return '#fff8dc'
  return '#8a5a32'
}

function vehicleColorFor(level: LevelDef): string {
  if (level.id === 'gokart') return '#ffd23f'
  if (level.id === 'boat') return '#f3f6fb'
  return '#ff7628'
}

function addMesh(
  group: Group,
  tracker: ResourceTracker,
  geometry: BoxGeometry | CapsuleGeometry | CylinderGeometry | SphereGeometry,
  color: string,
): Mesh {
  const material = tracker.trackMaterial(
    new MeshStandardMaterial({ color: new Color(color), roughness: 0.72, flatShading: true }),
  )
  const mesh = new Mesh(tracker.track(geometry), material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)
  return mesh
}

export class PlayerProxy {
  readonly root = new Group()
  private readonly tracker = new ResourceTracker()
  private readonly body = new Group()

  constructor(level: LevelDef) {
    this.root.add(this.body)
    if (level.id === 'gokart' || level.id === 'car' || level.id === 'boat') {
      this.buildVehicle(level)
    } else {
      this.buildRider(level)
    }
  }

  private buildRider(level: LevelDef): void {
    if (level.id === 'rollerblade') {
      for (const x of [-0.27, 0.27]) {
        const skate = addMesh(
          this.body,
          this.tracker,
          new BoxGeometry(0.2, 0.12, 0.72),
          '#d9f4ff',
        )
        skate.position.set(x, 0.13, 0)
      }
    } else {
      const boardLengthwise = level.id !== 'snowboard'
      const board = addMesh(
        this.body,
        this.tracker,
        new BoxGeometry(boardLengthwise ? 0.3 : 1.45, 0.09, boardLengthwise ? 1.45 : 0.3),
        boardColorFor(level),
      )
      board.position.y = 0.12
    }

    const legs = addMesh(this.body, this.tracker, new BoxGeometry(0.48, 0.62, 0.34), '#243653')
    legs.position.y = 0.48
    legs.rotation.z = -0.1

    const torso = addMesh(this.body, this.tracker, new CapsuleGeometry(0.28, 0.48, 4, 8), '#f04f68')
    torso.position.y = 1.02
    torso.rotation.z = 0.1

    const head = addMesh(this.body, this.tracker, new SphereGeometry(0.25, 12, 8), '#ffb23e')
    head.position.set(0.02, 1.55, 0)

    const goggles = addMesh(this.body, this.tracker, new BoxGeometry(0.3, 0.11, 0.08), '#82dcff')
    goggles.position.set(0.03, 1.57, -0.21)
  }

  private buildVehicle(level: LevelDef): void {
    const hull = addMesh(
      this.body,
      this.tracker,
      new BoxGeometry(1.35, 0.48, 1.65),
      vehicleColorFor(level),
    )
    hull.position.y = 0.42
    if (level.id === 'boat') hull.rotation.x = -0.06

    const cab = addMesh(this.body, this.tracker, new BoxGeometry(0.75, 0.48, 0.72), '#31547a')
    cab.position.set(0, 0.78, 0.16)

    if (level.id !== 'boat') {
      for (const x of [-0.72, 0.72]) {
        for (const z of [-0.5, 0.5]) {
          const wheel = addMesh(this.body, this.tracker, new CylinderGeometry(0.24, 0.24, 0.18, 10), '#202126')
          wheel.position.set(x, 0.25, z)
          wheel.rotation.z = Math.PI / 2
        }
      }
    }
  }

  update(playerY: number, lean: number, spin: number, time: number, speed01: number): void {
    this.root.position.set(0, 0.1 + playerY * WORLD_SCALE, 0)
    this.body.rotation.z = -(lean + spin)
    this.body.rotation.x = Math.sin(time * 6) * speed01 * 0.025
  }

  dispose(): void {
    this.root.removeFromParent()
    this.tracker.dispose()
  }
}
