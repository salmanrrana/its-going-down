import { Material, Texture, WebGLRenderTarget } from 'three'

export interface Disposable {
  dispose(): void
}

function isDisposable(value: unknown): value is Disposable {
  return (
    typeof value === 'object' &&
    value !== null &&
    'dispose' in value &&
    typeof (value as Disposable).dispose === 'function'
  )
}

export class ResourceTracker {
  private readonly resources = new Set<Disposable>()

  track<T>(resource: T): T {
    if (isDisposable(resource)) this.resources.add(resource)
    return resource
  }

  trackMaterial(material: Material): Material {
    this.track(material)
    for (const value of Object.values(material)) {
      if (value instanceof Texture || value instanceof WebGLRenderTarget) this.track(value)
    }
    return material
  }

  dispose(): void {
    for (const resource of this.resources) resource.dispose()
    this.resources.clear()
  }

  get size(): number {
    return this.resources.size
  }
}
