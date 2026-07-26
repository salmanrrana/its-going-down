import type { Vec3 } from './types'

export function vector(x: number, y: number, z: number): Vec3 {
  return Object.freeze({ x, y, z })
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return vector(a.x + b.x, a.y + b.y, a.z + b.z)
}

export function subtract(a: Vec3, b: Vec3): Vec3 {
  return vector(a.x - b.x, a.y - b.y, a.z - b.z)
}

export function scale(value: Vec3, factor: number): Vec3 {
  return vector(value.x * factor, value.y * factor, value.z * factor)
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return vector(
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x,
  )
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

export function normalize(value: Vec3, fallback: Vec3): Vec3 {
  const magnitude = Math.hypot(value.x, value.y, value.z)
  const inverseMagnitude = 1 / magnitude
  if (
    magnitude === 0 ||
    !Number.isFinite(magnitude) ||
    !Number.isFinite(inverseMagnitude)
  ) {
    return fallback
  }
  return scale(value, inverseMagnitude)
}

export function negate(value: Vec3): Vec3 {
  return scale(value, -1)
}

export function isFiniteVector(value: Vec3): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z)
}
