import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
  Vector3,
} from 'three'
import type { SprayEffect } from '../../game/contracts'
import type { TrackFrame } from '../../game/track/index'
import { ResourceTracker } from './resources'

interface Particle {
  readonly position: Vector3
  readonly velocity: Vector3
  readonly color: Color
  readonly gravity: Vector3
  life: number
}

export class SurfaceParticlePool {
  readonly points: Points
  private readonly tracker = new ResourceTracker()
  private readonly particles: Particle[] = []
  private readonly recycled: Particle[] = []
  private readonly positions: Float32Array
  private readonly colors: Float32Array
  private cursor = 0
  private randomState = 0x9e3779b9

  constructor(readonly capacity: number) {
    this.positions = new Float32Array(capacity * 3)
    this.colors = new Float32Array(capacity * 3)
    const geometry = this.tracker.track(new BufferGeometry())
    geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3))
    geometry.setAttribute('color', new Float32BufferAttribute(this.colors, 3))
    geometry.setDrawRange(0, 0)
    const material = this.tracker.trackMaterial(
      new PointsMaterial({
        size: 0.15,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        vertexColors: true,
      }),
    )
    this.points = new Points(geometry, material)
    this.points.frustumCulled = false
  }

  private random(): number {
    this.randomState = (this.randomState * 1664525 + 1013904223) >>> 0
    return this.randomState / 0x100000000
  }

  emit(
    effect: SprayEffect,
    origin: Vector3,
    frame: TrackFrame,
    countScale = 1,
    forceScale = 1,
  ): void {
    const effectColor = new Color(effect.color)
    const right = new Vector3(frame.right.x, frame.right.y, frame.right.z)
    const normal = new Vector3(frame.normal.x, frame.normal.y, frame.normal.z)
    const tangent = new Vector3(frame.tangent.x, frame.tangent.y, frame.tangent.z)
    const count = Math.min(this.capacity, Math.max(effect.count, Math.round(effect.count * countScale)))

    for (let i = 0; i < count; i++) {
      const angle = effect.burst
        ? this.random() * Math.PI * 2
        : Math.PI * (0.15 + this.random() * 0.7)
      const speed = (effect.burst ? 3.8 : 2.2)
        * effect.force
        * forceScale
        * (0.55 + this.random() * 0.75)
      let particle: Particle
      if (this.particles.length < this.capacity) {
        particle = this.recycled.pop() ?? {
          position: new Vector3(),
          velocity: new Vector3(),
          color: new Color(),
          gravity: new Vector3(),
          life: 0,
        }
        this.particles.push(particle)
      } else {
        particle = this.particles[this.cursor]
        this.cursor = (this.cursor + 1) % this.capacity
      }

      particle.life = 0.35 + this.random() * 0.55
      particle.color.copy(effectColor)
      particle.gravity.copy(normal).multiplyScalar(-5.8)
      particle.position.copy(origin)
        .addScaledVector(right, (this.random() - 0.5) * 0.5)
        .addScaledVector(normal, 0.08 + this.random() * 0.08)
        .addScaledVector(tangent, -0.18)
      particle.velocity.copy(right)
        .multiplyScalar(Math.cos(angle) * speed - effect.lateralVelocity * 0.00025)
        .addScaledVector(normal, 0.9 + this.random() * (effect.burst ? 2.8 : 1.2))
        .addScaledVector(tangent, -(0.8 + Math.sin(angle) * speed))
    }
    this.upload()
  }

  update(dt: number): void {
    let write = 0
    for (const particle of this.particles) {
      particle.life -= dt
      if (particle.life <= 0) {
        this.recycled.push(particle)
        continue
      }
      particle.position.addScaledVector(particle.velocity, dt)
      particle.velocity.addScaledVector(particle.gravity, dt)
      particle.velocity.multiplyScalar(Math.max(0, 1 - dt * 1.4))
      this.particles[write++] = particle
    }
    this.particles.length = write
    this.cursor %= Math.max(1, write)
    this.upload()
  }

  clear(): void {
    this.recycled.push(...this.particles)
    this.particles.length = 0
    this.cursor = 0
    this.upload()
  }

  private upload(): void {
    this.particles.forEach((particle, index) => {
      const offset = index * 3
      this.positions[offset] = particle.position.x
      this.positions[offset + 1] = particle.position.y
      this.positions[offset + 2] = particle.position.z
      this.colors[offset] = particle.color.r
      this.colors[offset + 1] = particle.color.g
      this.colors[offset + 2] = particle.color.b
    })
    const geometry = this.points.geometry
    geometry.setDrawRange(0, this.particles.length)
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.color.needsUpdate = true
  }

  dispose(): void {
    this.points.removeFromParent()
    this.tracker.dispose()
  }
}
