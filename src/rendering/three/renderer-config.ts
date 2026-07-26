import {
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
} from 'three'
import type { QualityProfile } from './quality'

export const RENDERER_EXPOSURE = 1.08

const rendererSize = new Vector2()

export function createRenderer(
  canvas: HTMLCanvasElement,
  quality: QualityProfile,
): WebGLRenderer {
  const rendererOptions = {
    alpha: false,
    antialias: quality.antialias,
    powerPreference: 'high-performance' as const,
    stencil: false,
  }
  const attributes: WebGLContextAttributes = {
    ...rendererOptions,
    depth: true,
    failIfMajorPerformanceCaveat: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
  }
  const context = canvas.getContext('webgl2', attributes)
  if (!context) throw new Error('WebGL 2 is required to draw the 3D course.')

  const renderer = new WebGLRenderer({
    ...rendererOptions,
    canvas,
    context,
  })
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = RENDERER_EXPOSURE
  renderer.shadowMap.enabled = quality.shadows
  renderer.shadowMap.type = PCFSoftShadowMap
  renderer.info.autoReset = true
  renderer.setClearAlpha(1)
  return renderer
}

export function resizeRenderer(
  renderer: WebGLRenderer,
  width: number,
  height: number,
  dpr: number,
): boolean {
  const nextWidth = Math.max(1, Math.floor(width))
  const nextHeight = Math.max(1, Math.floor(height))
  const current = renderer.getSize(rendererSize)
  if (
    current.x === nextWidth &&
    current.y === nextHeight &&
    renderer.getPixelRatio() === dpr
  ) {
    return false
  }
  renderer.setPixelRatio(dpr)
  renderer.setSize(nextWidth, nextHeight, false)
  return true
}
