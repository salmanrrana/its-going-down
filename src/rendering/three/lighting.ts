import { Color, DirectionalLight, HemisphereLight, Object3D, Scene } from 'three'
import type { QualityProfile } from './quality'

export function addLighting(scene: Scene, quality: QualityProfile): void {
  const hemisphere = new HemisphereLight(new Color('#cfe8ff'), new Color('#38536b'), 1.38)
  scene.add(hemisphere)

  const target = new Object3D()
  target.position.set(0, 0, -8)
  scene.add(target)

  const sun = new DirectionalLight(new Color('#fff3d2'), 3.7)
  sun.position.set(-9, 13, 4)
  sun.target = target
  sun.castShadow = quality.shadows
  sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize)
  sun.shadow.camera.left = -10
  sun.shadow.camera.right = 10
  sun.shadow.camera.top = 9
  sun.shadow.camera.bottom = -4
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 28
  sun.shadow.bias = -0.00035
  sun.shadow.normalBias = 0.025
  scene.add(sun)
}
