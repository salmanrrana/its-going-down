import { Color, DirectionalLight, HemisphereLight, Object3D, Scene } from 'three'
import type { QualityProfile } from './quality'

export function addLighting(scene: Scene, quality: QualityProfile): void {
  const hemisphere = new HemisphereLight(new Color('#dcefff'), new Color('#55708a'), 1.75)
  scene.add(hemisphere)

  const target = new Object3D()
  target.position.set(0, 0, -8)
  scene.add(target)

  const sun = new DirectionalLight(new Color('#fff4d6'), 3.25)
  sun.position.set(-7, 11, 6)
  sun.target = target
  sun.castShadow = quality.shadows
  sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize)
  sun.shadow.camera.left = -8
  sun.shadow.camera.right = 8
  sun.shadow.camera.top = 7
  sun.shadow.camera.bottom = -3
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 28
  sun.shadow.bias = -0.00035
  sun.shadow.normalBias = 0.025
  scene.add(sun)
}
