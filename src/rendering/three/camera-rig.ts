import { MathUtils, PerspectiveCamera, Vector3 } from 'three'
import { damp } from '../../core/math'

function resolveFieldOfView(aspect: number): number {
  if (aspect < 0.8) return 66
  if (aspect < 1.2) return 62
  return 58
}

export interface CameraFrame {
  readonly speed01: number
  readonly lean: number
  readonly playerHeight: number
  readonly shake: number
  readonly time: number
}

export class ChaseCameraRig {
  readonly camera = new PerspectiveCamera(58, 1, 0.08, 80)
  private readonly target = new Vector3()
  private readonly desired = new Vector3()

  constructor() {
    this.camera.position.set(0, 3.25, -6.7)
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(height, 1)
    this.camera.fov = resolveFieldOfView(this.camera.aspect)
    this.camera.updateProjectionMatrix()
  }

  update(frame: CameraFrame, dt: number): void {
    const speedPullback = frame.speed01 * 0.7
    const lift = frame.playerHeight * 0.2
    const shakeX = Math.sin(frame.time * 71) * frame.shake * 0.012
    const shakeY = Math.cos(frame.time * 63) * frame.shake * 0.008
    this.desired.set(
      -frame.lean * 0.38 + shakeX,
      3.2 + lift + frame.speed01 * 0.18 + shakeY,
      -6.5 - speedPullback,
    )
    const damping = damp(0, 1, 8, Math.max(dt, 1 / 120))
    this.camera.position.lerp(this.desired, damping)
    this.target.set(frame.lean * 0.45, 0.55 + lift * 0.25, 8.5 + frame.speed01 * 4)
    this.camera.lookAt(this.target)
    this.camera.rotation.z += MathUtils.clamp(-frame.lean * 0.08, -0.045, 0.045)
  }
}
