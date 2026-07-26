import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three'
import type { LevelDef } from '../../game/types'
import { ResourceTracker } from './resources'

interface SnowboardRig {
  readonly board: Group
  readonly hips: Group
  readonly torso: Group
  readonly shoulders: Group
  readonly nearUpperArm: Group
  readonly farUpperArm: Group
  readonly nearLowerArm: Group
  readonly farLowerArm: Group
  readonly nearUpperLeg: Group
  readonly farUpperLeg: Group
  readonly nearLowerLeg: Group
  readonly farLowerLeg: Group
}

function boardColorFor(level: LevelDef): string {
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
  geometry: BufferGeometry,
  color: string,
  roughness = 0.72,
): Mesh {
  const material = tracker.trackMaterial(
    new MeshStandardMaterial({ color: new Color(color), roughness, flatShading: true }),
  )
  const mesh = new Mesh(tracker.track(geometry), material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)
  return mesh
}

function addLimb(
  parent: Group,
  tracker: ResourceTracker,
  length: number,
  radius: number,
  color: string,
): Group {
  const pivot = new Group()
  parent.add(pivot)
  const mesh = addMesh(pivot, tracker, new CapsuleGeometry(radius, length, 4, 8), color)
  mesh.position.y = -length * 0.5
  return pivot
}

export class PlayerProxy {
  readonly root = new Group()
  private readonly tracker = new ResourceTracker()
  private readonly body = new Group()
  private readonly contactShadow: Mesh
  private snowboardRig: SnowboardRig | null = null
  private previousAirborne = false
  private landingCompression = 0
  private lastPoseTime: number | null = null

  constructor(level: LevelDef) {
    this.root.rotation.y = Math.PI
    this.root.add(this.body)
    if (level.id === 'gokart' || level.id === 'car' || level.id === 'boat') {
      this.buildVehicle(level)
    } else if (level.id === 'snowboard') {
      this.buildSnowboarder()
      this.root.scale.setScalar(0.86)
    } else {
      this.buildRider(level)
    }
    this.contactShadow = this.addContactShadow()
  }

  private addContactShadow(): Mesh {
    const geometry = this.tracker.track(new CircleGeometry(0.72, 24))
    geometry.rotateX(-Math.PI / 2)
    const material = this.tracker.trackMaterial(new MeshBasicMaterial({
      color: '#25445d',
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      toneMapped: false,
    }))
    const shadow = new Mesh(geometry, material)
    shadow.position.y = 0.014
    shadow.scale.z = 0.42
    shadow.renderOrder = 2
    this.root.add(shadow)
    return shadow
  }

  private buildSnowboarder(): void {
    const navy = '#18344f'
    const coral = '#e95645'
    const coralShadow = '#b93735'
    const glove = '#172b3d'
    const helmet = '#f2a63b'
    const goggle = '#9be1f5'

    const board = new Group()
    this.body.add(board)
    const deck = addMesh(board, this.tracker, new BoxGeometry(1.52, 0.075, 0.3), '#173f66', 0.48)
    deck.position.y = 0.08
    for (const x of [-0.72, 0.72]) {
      const tip = addMesh(board, this.tracker, new SphereGeometry(0.17, 10, 6), '#286f9b', 0.45)
      tip.position.set(x, 0.11, 0)
      tip.scale.set(0.72, 0.34, 0.9)
    }

    const hips = new Group()
    hips.position.y = 0.77
    this.body.add(hips)
    const pelvis = addMesh(hips, this.tracker, new CapsuleGeometry(0.2, 0.25, 4, 8), navy)
    pelvis.rotation.z = Math.PI / 2
    pelvis.scale.z = 0.78

    const nearUpperLeg = addLimb(hips, this.tracker, 0.46, 0.105, navy)
    nearUpperLeg.position.set(-0.22, -0.05, -0.04)
    nearUpperLeg.rotation.z = -0.48
    nearUpperLeg.rotation.x = -0.18
    const nearLowerLeg = addLimb(nearUpperLeg, this.tracker, 0.43, 0.095, coralShadow)
    nearLowerLeg.position.y = -0.46
    nearLowerLeg.rotation.z = 0.82
    nearLowerLeg.rotation.x = 0.2

    const farUpperLeg = addLimb(hips, this.tracker, 0.46, 0.105, navy)
    farUpperLeg.position.set(0.22, -0.05, 0.04)
    farUpperLeg.rotation.z = 0.48
    farUpperLeg.rotation.x = 0.12
    const farLowerLeg = addLimb(farUpperLeg, this.tracker, 0.43, 0.095, coralShadow)
    farLowerLeg.position.y = -0.46
    farLowerLeg.rotation.z = -0.82
    farLowerLeg.rotation.x = -0.16

    for (const x of [-0.48, 0.48]) {
      const boot = addMesh(board, this.tracker, new BoxGeometry(0.34, 0.16, 0.24), glove)
      boot.position.set(x, 0.19, 0)
      boot.rotation.y = x < 0 ? -0.16 : 0.16
    }

    const torso = new Group()
    torso.position.set(0, 0.93, 0)
    this.body.add(torso)
    const jacket = addMesh(torso, this.tracker, new CapsuleGeometry(0.3, 0.5, 5, 10), coral)
    jacket.scale.set(1.03, 1, 0.72)
    jacket.rotation.z = -0.04

    const shoulders = new Group()
    shoulders.position.set(0, 0.27, 0)
    torso.add(shoulders)
    const shoulderBar = addMesh(shoulders, this.tracker, new CapsuleGeometry(0.12, 0.5, 4, 8), coralShadow)
    shoulderBar.rotation.z = Math.PI / 2
    shoulderBar.scale.z = 0.72

    const nearUpperArm = addLimb(shoulders, this.tracker, 0.42, 0.08, coral)
    nearUpperArm.position.set(-0.3, 0, -0.02)
    nearUpperArm.rotation.z = 1.02
    nearUpperArm.rotation.x = -0.38
    const nearLowerArm = addLimb(nearUpperArm, this.tracker, 0.38, 0.072, navy)
    nearLowerArm.position.y = -0.42
    nearLowerArm.rotation.z = -0.58
    const nearGlove = addMesh(nearLowerArm, this.tracker, new IcosahedronGeometry(0.1, 1), glove)
    nearGlove.position.y = -0.39

    const farUpperArm = addLimb(shoulders, this.tracker, 0.42, 0.08, coral)
    farUpperArm.position.set(0.3, 0, 0.02)
    farUpperArm.rotation.z = -1.02
    farUpperArm.rotation.x = 0.28
    const farLowerArm = addLimb(farUpperArm, this.tracker, 0.38, 0.072, navy)
    farLowerArm.position.y = -0.42
    farLowerArm.rotation.z = 0.58
    const farGlove = addMesh(farLowerArm, this.tracker, new IcosahedronGeometry(0.1, 1), glove)
    farGlove.position.y = -0.39

    const neck = addMesh(torso, this.tracker, new CylinderGeometry(0.1, 0.12, 0.18, 8), '#d48b57')
    neck.position.y = 0.48
    const head = addMesh(torso, this.tracker, new SphereGeometry(0.245, 14, 9), '#d99463')
    head.position.set(0.02, 0.68, -0.01)
    const helmetShell = addMesh(torso, this.tracker, new SphereGeometry(0.27, 14, 9), helmet, 0.52)
    helmetShell.position.set(0.02, 0.75, 0.015)
    helmetShell.scale.y = 0.82
    const helmetBrim = addMesh(torso, this.tracker, new BoxGeometry(0.34, 0.07, 0.16), helmet, 0.5)
    helmetBrim.position.set(0.02, 0.72, -0.2)
    const goggles = addMesh(torso, this.tracker, new BoxGeometry(0.34, 0.12, 0.075), goggle, 0.24)
    goggles.position.set(0.02, 0.69, -0.235)
    goggles.rotation.x = -0.08

    this.snowboardRig = {
      board,
      hips,
      torso,
      shoulders,
      nearUpperArm,
      farUpperArm,
      nearLowerArm,
      farLowerArm,
      nearUpperLeg,
      farUpperLeg,
      nearLowerLeg,
      farLowerLeg,
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
      const board = addMesh(
        this.body,
        this.tracker,
        new BoxGeometry(0.3, 0.09, 1.45),
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

  private updateSnowboarder(
    rig: SnowboardRig,
    lean: number,
    spin: number,
    time: number,
    speed01: number,
    airborne: boolean,
  ): void {
    const poseDt = this.lastPoseTime === null
      ? 0
      : MathUtils.clamp(time - this.lastPoseTime, 0, 0.1)
    this.lastPoseTime = time
    if (this.previousAirborne && !airborne) this.landingCompression = 1
    this.previousAirborne = airborne
    this.landingCompression *= Math.exp(-10.5 * poseDt)

    const carve = MathUtils.clamp(lean, -1, 1)
    const turnEnergy = Math.abs(carve)
    const compression = (airborne ? -0.06 : 0.08 + turnEnergy * 0.08) + this.landingCompression * 0.2
    const bounce = Math.sin(time * 7.2) * speed01 * 0.012

    rig.board.rotation.y = -carve * 0.3 + spin * 0.55
    rig.board.rotation.z = carve * 0.1
    rig.board.rotation.x = airborne ? -0.07 : bounce
    rig.hips.position.y = 0.77 - compression
    rig.hips.rotation.y = -carve * 0.2
    rig.hips.rotation.z = -carve * 0.16
    rig.torso.position.y = 0.93 - compression * 0.48
    rig.torso.rotation.y = carve * 0.28
    rig.torso.rotation.z = -carve * 0.2
    rig.shoulders.rotation.y = carve * 0.34
    rig.shoulders.rotation.z = carve * 0.1

    rig.nearUpperLeg.rotation.z = -0.48 - compression * 0.72 + carve * 0.08
    rig.farUpperLeg.rotation.z = 0.48 + compression * 0.72 + carve * 0.08
    rig.nearLowerLeg.rotation.z = 0.82 + compression * 0.82
    rig.farLowerLeg.rotation.z = -0.82 - compression * 0.82

    rig.nearUpperArm.rotation.z = 1.02 + carve * 0.28
    rig.farUpperArm.rotation.z = -1.02 + carve * 0.28
    rig.nearLowerArm.rotation.z = -0.58 - carve * 0.22
    rig.farLowerArm.rotation.z = 0.58 - carve * 0.22
  }

  update(
    playerHeight: number,
    lean: number,
    spin: number,
    time: number,
    speed01: number,
    airborne = false,
  ): void {
    this.root.position.set(0, 0.08 + playerHeight, 0)
    const visibleSurfaceHeight = this.snowboardRig ? 0.055 : 0.015
    this.contactShadow.position.y = (visibleSurfaceHeight - this.root.position.y) / this.root.scale.y
    const shadowScale = MathUtils.clamp(1 - playerHeight * 0.22, 0.55, 1)
    this.contactShadow.scale.set(0.72 * shadowScale, 0.72 * shadowScale, 0.42 * shadowScale)
    if (this.snowboardRig) {
      this.body.rotation.z = -(lean + spin) * 0.52
      this.body.rotation.x = Math.sin(time * 6) * speed01 * 0.018
      this.updateSnowboarder(this.snowboardRig, lean, spin, time, speed01, airborne)
      return
    }
    this.body.rotation.z = -(lean + spin)
    this.body.rotation.x = Math.sin(time * 6) * speed01 * 0.025
  }

  dispose(): void {
    this.root.removeFromParent()
    this.tracker.dispose()
  }
}
