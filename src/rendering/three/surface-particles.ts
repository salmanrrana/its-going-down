import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
  Vector3,
} from 'three'
import type { SprayEffect } from '../../game/contracts'
import { ResourceTracker } from './resources'

interface Particle {
  readonly position: Vector3
  readonly velocity: Vector3
  readonly color: Color
  life: number
}

export class SurfaceParticlePool {
  readonly points: Points
  private readonly tracker = new ResourceTracker()
  private readonly particles: Particle[] = []
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
        size: 0.11,
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

  emit(effect: SprayEffect, origin: Vector3): void {
    const color = new Color(effect.color)
    for (let i = 0; i < effect.count; i++) {
      const angle = effect.burst
        ? this.random() * Math.PI * 2
        : Math.PI * (0.15 + this.random() * 0.7)
      const speed = (effect.burst ? 3.8 : 2.2) * effect.force * (0.55 + this.random() * 0.75)
      const life = 0.35 + this.random() * 0.55
      const position = origin.clone()
      position.x += (this.random() - 0.5) * 0.5
      position.y += 0.08 + this.random() * 0.08
      position.z += 0.18
      const particle: Particle = {
        position,
        velocity: new Vector3(
          Math.cos(angle) * speed - effect.lateralVelocity * 0.00025,
          0.9 + this.random() * (effect.burst ? 2.8 : 1.2),
          0.8 + Math.sin(angle) * speed,
        ),
        color,
        life,
      }
      if (this.particles.length < this.capacity) this.particles.push(particle)
      else {
        this.particles[this.cursor] = particle
        this.cursor = (this.cursor + 1) % this.capacity
      }
    }
    this.upload()
  }

  update(dt: number): void {
    let write = 0
    for (const particle of this.particles) {
      particle.life -= dt
      if (particle.life <= 0) continue
      particle.position.addScaledVector(particle.velocity, dt)
      particle.velocity.y -= 5.8 * dt
      particle.velocity.multiplyScalar(Math.max(0, 1 - dt * 1.4))
      this.particles[write++] = particle
    }
    this.particles.length = write
    this.cursor %= Math.max(1, write)
    this.upload()
  }

  clear(): void {
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
