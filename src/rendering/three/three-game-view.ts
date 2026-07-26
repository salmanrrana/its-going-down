import {
  Color,
  Fog,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Scene,
  Vector3,
  type WebGLRenderer,
} from 'three'
import { clamp } from '../../core/math'
import type { GameSnapshot, GameView, SprayEffect } from '../../game/contracts'
import { interpolateRenderState } from '../../game/render-state'
import type { Track } from '../../game/track'
import {
  compileTrack3D,
  positionAtLateralOffset,
  sampleCompiledTrack,
  type SampledTrackPoint,
} from '../../game/track/index'
import { ChaseCameraRig } from './camera-rig'
import { addLighting } from './lighting'
import { RenderMetricsCollector, type ThreeRenderMetrics } from './metrics'
import { PlayerProxy } from './player-proxy'
import { ProceduralWorld } from './procedural-world'
import {
  QUALITY_PROFILES,
  detectQualitySignals,
  selectQualityLevel,
  type QualityProfile,
} from './quality'
import { createRenderer, resizeRenderer } from './renderer-config'
import { SurfaceParticlePool } from './surface-particles'

const THREE_SIMULATION_UNITS_PER_RENDER_UNIT = 1000

export interface ThreeGameViewOptions {
  readonly onAvailabilityChange?: (available: boolean) => void
}

export class ThreeGameView implements GameView {
  private readonly scene = new Scene()
  private readonly cameraRig = new ChaseCameraRig()
  private readonly quality: QualityProfile
  private readonly metricsCollector: RenderMetricsCollector
  private readonly statusOverlay: HTMLElement
  private readonly metricsOverlay: HTMLOutputElement | null
  private readonly particles: SurfaceParticlePool
  private readonly reducedMotion: boolean
  private readonly damageMaterial = new MeshBasicMaterial({
    color: '#ff304f',
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })
  private readonly damageFlash = new Mesh(new PlaneGeometry(2, 2), this.damageMaterial)
  private renderer: WebGLRenderer | null = null
  private world: ProceduralWorld | null = null
  private player: PlayerProxy | null = null
  private activeTrack: Track | null = null
  private lastTrackSample: SampledTrackPoint | null = null
  private lastPosition = 0
  private lastRenderTime = performance.now()
  private contextLost = false
  private fatalError = false
  private restoreNoticeTimer = 0

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: ThreeGameViewOptions = {},
  ) {
    const signals = detectQualitySignals()
    const qualityLevel = selectQualityLevel(signals)
    this.quality = QUALITY_PROFILES[qualityLevel]
    this.reducedMotion = signals.reducedMotion ?? false
    this.metricsCollector = new RenderMetricsCollector(qualityLevel)
    this.particles = new SurfaceParticlePool(this.quality.maxParticles)
    this.statusOverlay = this.createStatusOverlay()
    this.metricsOverlay = new URLSearchParams(window.location.search).has('metrics')
      ? this.createMetricsOverlay()
      : null
    this.damageFlash.position.z = 0.09
    this.damageFlash.rotation.y = Math.PI
    this.damageFlash.renderOrder = 10_000
    this.damageFlash.frustumCulled = false
    this.cameraRig.camera.add(this.damageFlash)
    this.scene.add(this.cameraRig.camera)

    canvas.addEventListener('webglcontextlost', this.onContextLost)
    canvas.addEventListener('webglcontextrestored', this.onContextRestored)
    canvas.addEventListener('webglcontextcreationerror', this.onContextCreationError)

    try {
      this.renderer = createRenderer(canvas, this.quality)
      addLighting(this.scene, this.quality)
      this.cameraRig.camera.far = this.quality.drawDistance * 0.2 + 12
      this.cameraRig.camera.updateProjectionMatrix()
      window.__THREE_GAME_METRICS__ = () => this.metrics
      this.resize()
      this.options.onAvailabilityChange?.(true)
    } catch (error) {
      // WebGL 2 is the product's required gameplay path; keep the DOM app usable and
      // report the failure rather than silently switching to the archived Canvas view.
      this.showStatus(this.errorMessage(error), true)
      this.options.onAvailabilityChange?.(false)
      console.error('Unable to initialize the Three.js gameplay view.', error)
    }
  }

  private createStatusOverlay(): HTMLElement {
    const overlay = document.createElement('div')
    overlay.className = 'renderer-status'
    overlay.hidden = true
    overlay.setAttribute('role', 'status')
    overlay.setAttribute('aria-live', 'polite')
    this.canvas.insertAdjacentElement('afterend', overlay)
    return overlay
  }

  private createMetricsOverlay(): HTMLOutputElement {
    const overlay = document.createElement('output')
    overlay.className = 'renderer-metrics'
    overlay.setAttribute('aria-label', '3D renderer performance metrics')
    this.canvas.insertAdjacentElement('afterend', overlay)
    return overlay
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'The 3D view could not start. Gameplay controls and menus are still available.'
  }

  private showStatus(message: string, persistent = false): void {
    this.statusOverlay.textContent = message
    this.statusOverlay.hidden = false
    this.statusOverlay.classList.toggle('renderer-status--error', persistent)
  }

  private hideStatus(): void {
    this.statusOverlay.hidden = true
    this.statusOverlay.classList.remove('renderer-status--error')
  }

  private onContextLost = (event: Event): void => {
    event.preventDefault()
    this.contextLost = true
    this.options.onAvailabilityChange?.(false)
    this.showStatus('3D graphics paused while the browser restores the course.')
  }

  private onContextRestored = (): void => {
    this.contextLost = false
    this.fatalError = false
    this.activeTrack = null
    this.lastTrackSample = null
    this.lastRenderTime = performance.now()
    this.options.onAvailabilityChange?.(true)
    this.showStatus('3D graphics restored.')
    this.restoreNoticeTimer = 2
  }

  private onContextCreationError = (event: Event): void => {
    this.options.onAvailabilityChange?.(false)
    const detail = event instanceof WebGLContextEvent ? event.statusMessage : ''
    this.showStatus(
      detail || 'WebGL 2 could not start. Update the browser or enable hardware acceleration.',
      true,
    )
  }

  resize(): void {
    if (!this.renderer) return
    const width = Math.max(1, this.canvas.clientWidth)
    const height = Math.max(1, this.canvas.clientHeight)
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality.maxDpr)
    if (resizeRenderer(this.renderer, width, height, dpr)) this.cameraRig.resize(width, height)
  }

  update(dt: number): void {
    this.particles.update(dt)
    if (this.restoreNoticeTimer > 0) {
      this.restoreNoticeTimer -= dt
      if (this.restoreNoticeTimer <= 0) this.hideStatus()
    }
  }

  private rebuildWorld(snapshot: GameSnapshot): void {
    this.player?.dispose()
    this.world?.dispose()
    this.particles.clear()
    this.lastTrackSample = null

    const compiled = compileTrack3D(snapshot.track, {
      trackId: `three:${snapshot.level.id}`,
      simulationUnitsPerRenderUnit: THREE_SIMULATION_UNITS_PER_RENDER_UNIT,
    })
    this.world = new ProceduralWorld(
      snapshot.track,
      compiled,
      snapshot.level,
      this.quality,
    )
    this.player = new PlayerProxy(snapshot.level)
    this.world.root.add(this.particles.points)
    this.scene.add(this.world.root, this.player.root)
    this.activeTrack = snapshot.track

    const fogNear = this.quality.drawDistance * 0.2 * 0.48
    const fogFar = this.quality.drawDistance * 0.2
    this.scene.background = new Color(snapshot.level.palette.skyBottom)
    this.scene.fog = new Fog(snapshot.level.palette.fog, fogNear, fogFar)
  }

  render(previous: GameSnapshot, current: GameSnapshot, alpha: number): void {
    if (!this.renderer || this.contextLost || this.fatalError) return
    if (this.activeTrack !== current.track || !this.world || !this.player) {
      this.rebuildWorld(current)
    }
    const world = this.world
    const player = this.player
    if (!world || !player) return

    const state = interpolateRenderState(previous, current, alpha)
    const sample = sampleCompiledTrack(world.compiled, state.position)
    const renderScale = 1 / world.compiled.simulationUnitsPerRenderUnit
    this.lastTrackSample = sample
    this.lastPosition = state.position
    world.update(sample, state.playerX)
    player.update(
      state.playerY * renderScale,
      state.lean,
      state.spin,
      state.time,
      state.speed01,
    )
    this.damageMaterial.opacity = clamp(state.hurt * 0.32, 0, 0.32)
    this.damageFlash.visible = this.damageMaterial.opacity > 0.001
    const now = performance.now()
    const cameraDt = clamp((now - this.lastRenderTime) / 1000, 1 / 240, 0.1)
    this.lastRenderTime = now
    this.cameraRig.update(
      {
        speed01: state.speed01,
        lean: state.lean,
        playerHeight: state.playerY * renderScale,
        shake: this.reducedMotion ? 0 : state.shake,
        time: state.time,
      },
      cameraDt,
    )

    try {
      this.renderer.render(this.scene, this.cameraRig.camera)
      const metrics = this.metricsCollector.capture(this.renderer)
      this.updateMetricsOverlay(metrics)
    } catch (error) {
      this.fatalError = true
      this.showStatus('The 3D view hit a rendering error. Reload to try again.', true)
      this.options.onAvailabilityChange?.(false)
      console.error('Three.js frame rendering failed.', error)
    }
  }

  handleEffect(effect: SprayEffect): void {
    if (!this.world) return
    const { compiled } = this.world
    const sample = this.lastTrackSample ?? sampleCompiledTrack(compiled, this.lastPosition)
    const surfacePosition = positionAtLateralOffset(
      sample,
      effect.playerX,
      compiled.simulationUnitsPerRenderUnit,
    )
    const height = effect.playerY / compiled.simulationUnitsPerRenderUnit
    const origin = new Vector3(
      surfacePosition.x + sample.frame.normal.x * height,
      surfacePosition.y + sample.frame.normal.y * height,
      surfacePosition.z + sample.frame.normal.z * height,
    )
    this.particles.emit(effect, origin, sample.frame)
  }

  private updateMetricsOverlay(metrics: ThreeRenderMetrics): void {
    if (!this.metricsOverlay) return
    this.metricsOverlay.value = `${metrics.quality} · ${metrics.fps} fps · ${metrics.frameMs} ms · ${metrics.calls} calls · ${metrics.triangles.toLocaleString()} tris · ${metrics.geometries} geo · ${metrics.textures} tex · ${metrics.dpr}× DPR`
  }

  get metrics(): ThreeRenderMetrics | null {
    return this.renderer ? this.metricsCollector.snapshot : null
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost)
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored)
    this.canvas.removeEventListener('webglcontextcreationerror', this.onContextCreationError)
    this.player?.dispose()
    this.world?.dispose()
    this.particles.dispose()
    this.damageFlash.geometry.dispose()
    this.damageMaterial.dispose()
    this.renderer?.dispose()
    this.renderer = null
    this.statusOverlay.remove()
    this.metricsOverlay?.remove()
    if (window.__THREE_GAME_METRICS__) delete window.__THREE_GAME_METRICS__
  }
}
