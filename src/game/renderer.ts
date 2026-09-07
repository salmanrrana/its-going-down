import * as THREE from 'three'
import { clamp } from '../core/math'
import type { GameSnapshot, GameView, SprayEffect } from './contracts'
import { interpolateRenderState } from './render-state'
import type { LevelDef } from './types'
import { createProp, createRider, type ModelKind } from '../rendering/models'
import {
  sampleCourse,
  WORLD_SCALE,
  VISIBLE_SEGMENTS,
  type CoursePoint,
} from '../rendering/course'
export { PLAYER_HALF_WIDTH } from './constants'

const CROSS_SECTION = [
  -14, -5, -2, -1.07, -1, -0.5, -0.015, 0.015, 0.5, 1, 1.07, 2, 5, 14,
]
const ROWS = VISIBLE_SEGMENTS + 20
const TERRAIN_VERTICES = ROWS * (CROSS_SECTION.length - 1) * 6
const PROP_CAPACITY = 180
interface Particle {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  life: number
  size: number
}

/** One deliberately crunchy framebuffer; readable DOM controls keep native resolution. */
export class Renderer implements GameView {
  private readonly gpu: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(62, 1, 0.5, 1000)
  private readonly material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
  })
  private readonly distantMaterial = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    fog: false,
  })
  private readonly terrainGeometry = new THREE.BufferGeometry()
  private readonly positions = new Float32Array(TERRAIN_VERTICES * 3)
  private readonly colors = new Float32Array(TERRAIN_VERTICES * 3)
  private readonly road: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshBasicMaterial
  >
  private readonly pools = new Map<ModelKind, THREE.InstancedMesh>()
  private readonly points: CoursePoint[] = []
  private readonly transform = new THREE.Object3D()
  private readonly color = new THREE.Color()
  private readonly sun = new THREE.Mesh(
    new THREE.IcosahedronGeometry(19, 1),
    new THREE.MeshBasicMaterial({ color: '#ffe6b2', fog: false }),
  )
  private readonly shadow = new THREE.InstancedMesh(
    new THREE.CircleGeometry(1, 8),
    new THREE.MeshBasicMaterial({
      color: '#25365d',
      transparent: true,
      opacity: 0.19,
      depthWrite: false,
    }),
    180,
  )
  private readonly spray = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    150,
  )
  private readonly particles: Particle[] = []
  private rider: THREE.Mesh | null = null
  private level: LevelDef | null = null
  private snapshot: GameSnapshot | null = null
  private ground = 0
  private width = 0
  private height = 0
  private readonly reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  )
  private contextLost = false
  private readonly notice = document.createElement('div')

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.gpu = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'low-power',
    })
    this.gpu.setPixelRatio(1)
    this.gpu.outputColorSpace = THREE.SRGBColorSpace
    this.scene.add(new THREE.HemisphereLight('#daeaff', '#67738c', 2.2))
    const sunlight = new THREE.DirectionalLight('#fff0d5', 2.6)
    sunlight.position.set(-60, 90, 40)
    this.scene.add(sunlight)
    this.terrainGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.positions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    )
    this.terrainGeometry.setAttribute(
      'color',
      new THREE.BufferAttribute(this.colors, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    )
    this.road = new THREE.Mesh(
      this.terrainGeometry,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
      }),
    )
    this.road.frustumCulled = false
    this.scene.add(this.road, this.sun, this.shadow, this.spray)
    this.shadow.frustumCulled = false
    this.spray.frustumCulled = false
    this.spray.count = 0
    this.shadow.count = 0
    this.material.onBeforeCompile = (shader) => {
      // A small screen-space dither evokes 15-bit console color without obscuring hazards.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `
        float threshold = mod(gl_FragCoord.x, 2.0) * 2.0 + mod(gl_FragCoord.y, 2.0);
        gl_FragColor.rgb = floor(gl_FragColor.rgb * 31.0 + threshold / 4.0) / 31.0;
      `,
      )
    }
    this.notice.className = 'graphics-notice'
    this.notice.hidden = true
    this.notice.setAttribute('role', 'alert')
    this.notice.textContent = 'Graphics paused. Reconnecting…'
    this.canvas.after(this.notice)
    canvas.addEventListener('webglcontextlost', this.onContextLost)
    canvas.addEventListener('webglcontextrestored', this.onContextRestored)
  }

  private onContextLost = (event: Event): void => {
    event.preventDefault()
    this.contextLost = true
    this.notice.hidden = false
    // The app owns pause/resume, including its timing reset and accessible dialog.
    window.dispatchEvent(new Event('game-graphics-lost'))
  }
  private onContextRestored = (): void => {
    this.contextLost = false
    this.notice.hidden = true
  }

  resize(): void {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    if (!w || !h || (w === this.width && h === this.height)) return
    this.width = w
    this.height = h
    // Cap both axes; DPR never multiplies the cost on a high-density phone.
    const scale = Math.min(1, 720 / w, 480 / h)
    this.gpu.setSize(Math.round(w * scale), Math.round(h * scale), false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private loadLevel(level: LevelDef): void {
    this.pools.forEach((pool) => {
      this.scene.remove(pool)
      pool.geometry.dispose()
      pool.dispose()
    })
    this.pools.clear()
    if (this.rider) {
      this.scene.remove(this.rider)
      this.rider.geometry.dispose()
    }
    this.particles.length = 0
    this.level = level
    this.scene.background = new THREE.Color(
      level.id === 'snowboard' ? '#729fce' : level.palette.skyBottom,
    )
    this.scene.fog = new THREE.Fog(level.palette.fog, 100, 265)
    this.rider = new THREE.Mesh(createRider(level.id), this.material)
    this.scene.add(this.rider)
    this.spray.material.color.set(level.palette.spray)
    const kinds = new Set<ModelKind>([
      ...level.scenery,
      ...level.obstacles,
      'flag',
      'coin',
      'ramp',
      'gate',
      'mountain',
      'cloud',
      'chalet',
      'bridge',
      'grandstand',
      'sail',
      'wake',
    ])
    for (const kind of kinds) {
      const distant = kind === 'mountain' || kind === 'cloud'
      const pool = new THREE.InstancedMesh(
        createProp(kind, level),
        distant ? this.distantMaterial : this.material,
        PROP_CAPACITY,
      )
      pool.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      pool.frustumCulled = false
      pool.count = 0
      this.pools.set(kind, pool)
      this.scene.add(pool)
    }
  }

  private place(
    kind: ModelKind,
    x: number,
    y: number,
    z: number,
    sx = 1,
    sy = sx,
    sz = sx,
    yaw = 0,
  ): void {
    const pool = this.pools.get(kind)
    if (!pool || pool.count >= PROP_CAPACITY) return
    this.transform.position.set(x, y, z)
    this.transform.rotation.set(0, yaw, 0)
    this.transform.scale.set(sx, sy, sz)
    this.transform.updateMatrix()
    pool.setMatrixAt(pool.count++, this.transform.matrix)
  }

  private placeShadow(
    x: number,
    y: number,
    z: number,
    sx: number,
    sz: number,
  ): void {
    if (this.shadow.count >= 180) return
    this.transform.position.set(x + 0.7, y + 0.035, z + 0.6)
    this.transform.rotation.set(-Math.PI / 2, 0, -0.3)
    this.transform.scale.set(sx, sz, 1)
    this.transform.updateMatrix()
    this.shadow.setMatrixAt(this.shadow.count++, this.transform.matrix)
  }

  private terrain(level: LevelDef, time: number): void {
    let offset = 0
    const snow = level.id === 'snowboard'
    const water = level.water
    for (let row = 0; row < ROWS; row++) {
      const a = this.points[row]
      const b = this.points[row + 1]
      const width = level.roadWidth * WORLD_SCALE
      for (let col = 0; col < CROSS_SECTION.length - 1; col++) {
        const left = CROSS_SECTION[col]
        const right = CROSS_SECTION[col + 1]
        const lane = left >= -1 && right <= 1
        const edge = !lane && left >= -1.07 && right <= 1.07
        const band = Math.floor(a.index / 3) % 2
        const tint = lane
          ? band === 0
            ? level.palette.laneA
            : level.palette.laneB
          : edge
            ? band === 0
              ? level.palette.rumbleA
              : level.palette.rumbleB
            : band === 0
              ? level.palette.groundA
              : level.palette.groundB
        this.color.set(tint)
        const noise = Math.sin(a.index * 0.67 + col * 2.4) * 0.016
        this.color.multiplyScalar(
          lane
            ? 0.97 + noise + band * 0.025
            : 0.86 + noise * 2 + (col % 2) * 0.09,
        )
        if (
          lane &&
          !snow &&
          !water &&
          left === -0.015 &&
          band === 0 &&
          level.palette.centerLine
        ) {
          this.color.set(level.palette.centerLine)
        }
        for (let vertex = 0; vertex < 6; vertex++) {
          const point = vertex === 1 || vertex > 3 ? b : a
          const u = vertex === 0 || vertex === 1 || vertex === 4 ? left : right
          const side = Math.abs(u)
          const bank =
            side > 1.07 ? (side - 1.07) * (snow ? 2.1 : water ? 0.9 : 0.18) : 0
          const facets =
            side > 1.07
              ? Math.sin(point.index * 0.24 + u) *
                Math.min(side - 1, 2) *
                (snow ? 1.7 : 0.45)
              : 0
          const waveFace =
            level.id === 'surf' && u < -1
              ? Math.pow(Math.max(0, -u - 1), 1.3) * 3
              : 0
          const ripple = water
            ? Math.sin(point.index * 0.35 + time * 2 + u * 2) *
              0.14 *
              Math.max(0, 1 - Math.abs(u))
            : 0
          this.positions[offset] = point.x + u * width
          this.positions[offset + 1] =
            point.y + bank + facets + ripple + waveFace
          this.positions[offset + 2] = point.z
          this.color.toArray(this.colors, offset)
          offset += 3
        }
      }
    }
    this.terrainGeometry.getAttribute('position').needsUpdate = true
    this.terrainGeometry.getAttribute('color').needsUpdate = true
  }

  handleEffect(effect: SprayEffect): void {
    if (!this.snapshot || this.reducedMotion.matches) return
    for (let i = 0; i < Math.min(effect.count, 12); i++) {
      if (this.particles.length >= 150) break
      this.particles.push({
        x: effect.playerX * WORLD_SCALE + (Math.random() - 0.5) * 1.8,
        y: (this.ground + effect.playerY) * WORLD_SCALE + 0.3,
        z: this.snapshot.position * WORLD_SCALE,
        vx:
          (Math.random() - 0.5) * effect.force * 8 -
          effect.lateralVelocity * 0.002,
        vy: (2 + Math.random() * 4) * effect.force,
        life: 0.3 + Math.random() * 0.45,
        size: (0.08 + Math.random() * 0.15) * (effect.burst ? 2 : 1),
      })
    }
  }

  update(dt: number): void {
    let write = 0
    for (const p of this.particles) {
      p.life -= dt
      if (p.life <= 0) continue
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy -= dt * 13
      this.particles[write++] = p
    }
    this.particles.length = write
  }

  render(previous: GameSnapshot, current: GameSnapshot, alpha: number): void {
    if (this.contextLost || !this.width) return
    if (current.level !== this.level) this.loadLevel(current.level)
    if (
      current.track !== this.snapshot?.track ||
      current.position < (this.snapshot?.position ?? 0)
    )
      this.particles.length = 0
    this.snapshot = current
    const s = interpolateRenderState(previous, current, alpha)
    const level = current.level
    const snow = level.id === 'snowboard'
    this.ground = sampleCourse(current.track, s.position, this.points)
    this.terrain(level, s.time)
    this.pools.forEach((pool) => {
      pool.count = 0
    })
    this.shadow.count = 0
    const width = level.roadWidth * WORLD_SCALE
    for (let i = 16; i < this.points.length; i++) {
      const p = this.points[i]
      const seg = current.track.segments[p.index]
      if (p.z > 8 || p.z < -255) continue
      for (const prop of seg.scenery) {
        // A fixed draw budget and distance thinning keep phones predictable.
        if (p.z < -140 && p.index % 2) continue
        const x = p.x + prop.x * WORLD_SCALE
        const bank =
          Math.max(0, Math.abs((prop.x * WORLD_SCALE) / width) - 1.07) *
          (snow ? 2.1 : level.water ? 0.9 : 0.18)
        this.place(
          prop.kind,
          x,
          p.y + bank,
          p.z,
          prop.scale,
          prop.scale,
          prop.scale,
          prop.kind === 'building' ? 0 : p.index * 0.27,
        )
        if (p.z > -65)
          this.placeShadow(x, p.y + bank, p.z, prop.scale * 2, prop.scale * 1.2)
      }
      for (const prop of seg.obstacles) {
        if (prop.spent) continue
        this.place(prop.kind, p.x + prop.x * WORLD_SCALE, p.y, p.z, prop.scale)
        if (p.z > -70)
          this.placeShadow(p.x + prop.x * WORLD_SCALE, p.y, p.z, 2.1, 1.4)
      }
      for (const coin of seg.coins)
        if (!coin.spent) {
          this.place(
            'coin',
            p.x + coin.x * WORLD_SCALE,
            p.y + 1.65 + Math.sin(s.time * 4 + p.index) * 0.18,
            p.z,
            1,
            1,
            1,
            s.time * 2.5,
          )
        }
      if (p.index % 90 === 30) {
        if (snow) this.place('chalet', p.x - width * 1.9, p.y + 1.7, p.z, 1.4)
        if (level.id === 'gokart')
          this.place(
            'grandstand',
            p.x + width * 1.8,
            p.y,
            p.z,
            1,
            1,
            1,
            -Math.PI / 2,
          )
        if (level.id === 'rollerblade' || level.id === 'surf')
          this.place('sail', p.x + width * 3.5, p.y, p.z, 1.1)
      }
      if (level.water && p.z > 0 && p.z < 7)
        this.place(
          'wake',
          s.playerX * WORLD_SCALE,
          p.y + 0.2,
          p.z,
          1 + p.z * 0.1,
        )
      if (seg.ramp)
        this.place(
          'ramp',
          p.x + seg.ramp.x * WORLD_SCALE,
          p.y,
          p.z,
          seg.ramp.width * WORLD_SCALE,
          1,
          1,
        )
      // Paired trail markers define the safe run without pretending to be hazards.
      if (p.index % 18 === 0)
        for (const side of [-1, 1]) {
          this.place('flag', p.x + side * width * 1.08, p.y, p.z, 0.48)
        }
      if (p.index === current.track.segments.length - 12)
        this.place('gate', p.x, p.y, p.z, width * 1.04, 1, 1)
    }
    // Layered low-poly peaks remain beyond the fog; the road dissolves into them.
    for (let i = 0; i < 13; i++) {
      const x = (i - 6) * 63 - s.playerX * WORLD_SCALE * 0.18
      const peakHeight =
        (snow ? 115 : level.id === 'car' ? 95 : 48) + Math.sin(i * 4.7) * 28
      this.place(
        'mountain',
        x,
        peakHeight * 0.19 - 4,
        -335 - (i % 3) * 36,
        70 + (i % 3) * 12,
        peakHeight,
        60,
        i * 0.8,
      )
    }
    for (let i = 0; i < 6; i++)
      this.place(
        'cloud',
        (i - 2.5) * 76,
        74 + (i % 3) * 13,
        -340,
        2 + (i % 2),
        2,
        2,
      )
    if (level.id === 'skateboard') this.place('bridge', 92, 14, -240, 2.2)
    this.sun.position.set(116, 110, -380)
    if (this.rider) {
      const bob = Math.sin(s.time * 5) * level.physics.bob * 0.15
      this.rider.position.set(
        s.playerX * WORLD_SCALE,
        s.playerY * WORLD_SCALE + bob,
        0,
      )
      this.rider.rotation.set(
        -s.landingImpact * 0.15,
        -s.steer * 0.3 + s.spin,
        -s.lean * 0.65,
      )
      this.rider.visible = !(s.hurt > 0 && Math.floor(s.time * 12) % 2)
      this.placeShadow(
        s.playerX * WORLD_SCALE,
        0,
        0,
        2.2,
        level.water ? 3.5 : 1.6,
      )
    }
    this.spray.count = 0
    for (const p of this.particles) {
      this.transform.position.set(
        p.x,
        p.y - this.ground * WORLD_SCALE,
        s.position * WORLD_SCALE - p.z,
      )
      this.transform.rotation.set(p.life * 2, p.life * 3, 0)
      this.transform.scale.setScalar(p.size * Math.min(1, p.life * 5))
      this.transform.updateMatrix()
      this.spray.setMatrixAt(this.spray.count++, this.transform.matrix)
    }
    const portrait = this.camera.aspect < 1
    const distance = portrait ? 37 : 24
    if (this.canvas.dataset.mode === 'menu') {
      this.camera.setViewOffset(
        this.width,
        this.height,
        portrait ? 0 : -this.width * 0.12,
        portrait ? this.height * 0.17 : 0,
        this.width,
        this.height,
      )
    } else this.camera.clearViewOffset()
    this.camera.position.set(
      s.playerX * WORLD_SCALE * 0.72,
      (portrait ? 17 : 12) + s.playerY * WORLD_SCALE * 0.22,
      distance,
    )
    this.camera.lookAt(s.playerX * WORLD_SCALE * 0.36, 1.4, -29)
    if (!this.reducedMotion.matches)
      this.camera.rotateZ(clamp(s.lean * 0.035, -0.025, 0.025))
    this.pools.forEach((pool) => {
      pool.instanceMatrix.needsUpdate = true
    })
    this.shadow.instanceMatrix.needsUpdate = true
    this.spray.instanceMatrix.needsUpdate = true
    this.gpu.render(this.scene, this.camera)
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost)
    this.canvas.removeEventListener(
      'webglcontextrestored',
      this.onContextRestored,
    )
    this.notice.remove()
    this.pools.forEach((pool) => {
      pool.geometry.dispose()
      pool.dispose()
    })
    this.rider?.geometry.dispose()
    this.terrainGeometry.dispose()
    this.road.material.dispose()
    this.material.dispose()
    this.distantMaterial.dispose()
    this.sun.geometry.dispose()
    this.sun.material.dispose()
    this.shadow.geometry.dispose()
    this.shadow.material.dispose()
    this.shadow.dispose()
    this.spray.geometry.dispose()
    this.spray.material.dispose()
    this.spray.dispose()
    this.gpu.dispose()
  }
}
