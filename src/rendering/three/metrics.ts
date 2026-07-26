import type { WebGLRenderer } from 'three'
import type { QualityLevel } from './quality'

export interface ThreeRenderMetrics {
  readonly quality: QualityLevel
  readonly fps: number
  readonly frameMs: number
  readonly calls: number
  readonly triangles: number
  readonly geometries: number
  readonly textures: number
  readonly dpr: number
}

export class RenderMetricsCollector {
  private smoothedFrameMs = 16.67
  private lastFrameTime = 0
  private snapshotValue: ThreeRenderMetrics

  constructor(private readonly quality: QualityLevel) {
    this.snapshotValue = {
      quality,
      fps: 60,
      frameMs: 16.67,
      calls: 0,
      triangles: 0,
      geometries: 0,
      textures: 0,
      dpr: 1,
    }
  }

  capture(renderer: WebGLRenderer, now = performance.now()): ThreeRenderMetrics {
    if (this.lastFrameTime > 0) {
      const frameMs = Math.min(250, Math.max(0.1, now - this.lastFrameTime))
      this.smoothedFrameMs += (frameMs - this.smoothedFrameMs) * 0.08
    }
    this.lastFrameTime = now
    const info = renderer.info
    this.snapshotValue = {
      quality: this.quality,
      fps: Math.round(1000 / this.smoothedFrameMs),
      frameMs: Number(this.smoothedFrameMs.toFixed(2)),
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      dpr: renderer.getPixelRatio(),
    }
    return this.snapshotValue
  }

  get snapshot(): ThreeRenderMetrics {
    return this.snapshotValue
  }
}

declare global {
  interface Window {
    __THREE_GAME_METRICS__?: () => ThreeRenderMetrics | null
  }
}
