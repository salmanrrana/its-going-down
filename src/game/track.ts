import { makeRng } from '../core/math'
import type { DifficultyDef, LevelDef, ObstacleKind, SceneryKind } from './types'

export const SEGMENT_LENGTH = 200
/** How many segments ahead we project. Tuned for depth without wasted fill. */
export const DRAW_DISTANCE = 240

export interface Prop {
  /** Lateral offset from centre, in world units. Player half-width is ~260. */
  x: number
  /** Visual scale multiplier. */
  scale: number
  kind: ObstacleKind | SceneryKind
  /** Set once the player has passed/collected it, so it stops colliding. */
  spent: boolean
}

export interface Segment {
  index: number
  /** World-space z at the start of this segment. */
  z: number
  /** Curve delta applied per segment — accumulates into the road's x offset. */
  curve: number
  /** World height at this segment. */
  y: number
  /** Half-width of the drivable surface here. */
  width: number
  obstacles: Prop[]
  scenery: Prop[]
  /** Coins to collect, or null. */
  coins: Prop[]
  /** A launch ramp lives on the segment when set; x is its lateral centre. */
  ramp: { x: number; width: number; power: number } | null
  /** True for every Nth segment, used to alternate surface banding. */
  dark: boolean
}

export interface Track {
  segments: Segment[]
  totalLength: number
}

/**
 * Smooth 1-D value noise, used for both curve and hills.
 *
 * The tables are explicitly zero-meaned. Curve is double-integrated to get the
 * road's lateral position, so even a small DC bias would accumulate
 * quadratically and sweep the whole run off-screen over a long track.
 */
function makeNoise(rng: () => number, octaves: number): (t: number) => number {
  const tables = Array.from({ length: octaves }, () => {
    const table = Array.from({ length: 256 }, () => rng() * 2 - 1)
    const mean = table.reduce((a, b) => a + b, 0) / table.length
    return table.map((v) => v - mean)
  })
  return (t: number): number => {
    let sum = 0
    let amp = 1
    let norm = 0
    for (let o = 0; o < octaves; o++) {
      const table = tables[o]
      const freq = Math.pow(2, o)
      const p = t * freq
      const i = Math.floor(p)
      const f = p - i
      // Smoothstep interpolation keeps the road free of visible kinks.
      const s = f * f * (3 - 2 * f)
      const a = table[((i % 256) + 256) % 256]
      const b = table[(((i + 1) % 256) + 256) % 256]
      sum += (a + (b - a) * s) * amp
      norm += amp
      amp *= 0.5
    }
    return sum / norm
  }
}

export function generateTrack(
  level: LevelDef,
  difficulty: DifficultyDef,
  seed: number,
): Track {
  const rng = makeRng(seed)
  const curveNoise = makeNoise(rng, 3)
  const hillNoise = makeNoise(rng, 3)
  const segments: Segment[] = []

  const count = level.length
  // Leading run-up with no hazards so the player can find their feet.
  const introSegments = 90
  // Clear final stretch so the finish never feels cheap.
  const outroSegments = 60

  for (let i = 0; i < count; i++) {
    // Ease the curve and hills in from zero so the start is always straight.
    const ramp = Math.min(1, i / introSegments)
    const curve = curveNoise(i / 55) * 7.5 * level.curviness * ramp
    const y = hillNoise(i / 42) * 3400 * level.hilliness * ramp

    const seg: Segment = {
      index: i,
      z: i * SEGMENT_LENGTH,
      curve,
      y,
      width: level.roadWidth,
      obstacles: [],
      scenery: [],
      coins: [],
      ramp: null,
      dark: Math.floor(i / 3) % 2 === 0,
    }
    segments.push(seg)
  }

  // --- Scenery: dense, decorative, never collidable. -----------------------
  for (let i = 0; i < count; i++) {
    const seg = segments[i]
    if (i % 3 !== 0) continue
    const kinds = level.scenery
    for (const side of [-1, 1] as const) {
      if (rng() > 0.72) continue
      const kind = kinds[Math.floor(rng() * kinds.length)]
      // Push scenery out beyond the surface edge, with a varied margin.
      const x = side * (seg.width * (1.25 + rng() * 2.6))
      seg.scenery.push({ x, scale: 0.75 + rng() * 0.9, kind, spent: false })
    }
  }

  // --- Ramps: spaced out, always centred enough to be hittable. ------------
  const rampSpacing = Math.round(150 / Math.max(level.rampRate, 0.2))
  for (let i = introSegments; i < count - outroSegments; i++) {
    if (i % rampSpacing !== 0) continue
    if (rng() > 0.8) continue
    const seg = segments[i]
    seg.ramp = {
      x: (rng() * 2 - 1) * seg.width * 0.5,
      width: seg.width * 0.42,
      power: 0.85 + rng() * 0.5,
    }
    // Keep the landing zone clear so a good jump is always rewarded.
    for (let j = i; j < Math.min(count, i + 26); j++) {
      segments[j].obstacles.length = 0
    }
  }

  // --- Obstacles: the actual game. ----------------------------------------
  // Spacing shrinks with difficulty; we always leave a provably clear gap.
  const baseSpacing = 26
  const spacing = Math.max(
    7,
    Math.round(baseSpacing / Math.max(difficulty.obstacleScale, 0.2)),
  )

  for (let i = introSegments; i < count - outroSegments; i += spacing) {
    const seg = segments[i]
    if (seg.ramp) continue
    // Don't drop obstacles into a ramp's landing zone.
    let nearRamp = false
    for (let j = Math.max(0, i - 30); j < Math.min(count, i + 4); j++) {
      if (segments[j].ramp) {
        nearRamp = true
        break
      }
    }
    if (nearRamp) continue

    const kinds = level.obstacles
    // How many hazards in this cluster. Easy mode stays at one, always.
    const maxCluster = difficulty.id === 'easy' ? 1 : difficulty.id === 'medium' ? 2 : 3
    const cluster = 1 + Math.floor(rng() * maxCluster)

    // Build the cluster inside a lane model so a gap is guaranteed. We slice
    // the surface into N lanes and always leave at least one free.
    const lanes = maxCluster + 2
    const laneWidth = (seg.width * 2) / lanes
    const free = new Set<number>()
    for (let l = 0; l < lanes; l++) free.add(l)

    const placed = Math.min(cluster, lanes - 1)
    for (let c = 0; c < placed; c++) {
      const options = [...free]
      const lane = options[Math.floor(rng() * options.length)]
      free.delete(lane)
      const centre = -seg.width + laneWidth * (lane + 0.5)
      const jitter = (rng() * 2 - 1) * laneWidth * 0.16
      const kind = kinds[Math.floor(rng() * kinds.length)]
      seg.obstacles.push({
        x: centre + jitter,
        scale: 0.85 + rng() * 0.5,
        kind,
        spent: false,
      })
    }

    // If the surviving gap is narrower than the difficulty's floor, thin it out.
    const gapWidth = free.size * laneWidth
    while (gapWidth < difficulty.minGap && seg.obstacles.length > 1) {
      seg.obstacles.pop()
      break
    }
  }

  // --- Coins: reward the racing line, and lure kids across the track. ------
  for (let i = introSegments; i < count - outroSegments; i += 40) {
    if (rng() > 0.72) continue
    const runLength = 6 + Math.floor(rng() * 8)
    const startX = (rng() * 2 - 1) * 0.6
    const endX = (rng() * 2 - 1) * 0.6
    for (let j = 0; j < runLength; j++) {
      const idx = i + j * 2
      if (idx >= count) break
      const seg = segments[idx]
      if (seg.obstacles.length > 0) continue
      const t = j / Math.max(runLength - 1, 1)
      seg.coins.push({
        x: (startX + (endX - startX) * t) * seg.width,
        scale: 1,
        kind: 'crate',
        spent: false,
      })
    }
  }

  return { segments, totalLength: count * SEGMENT_LENGTH }
}
