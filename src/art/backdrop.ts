import { makeRng } from '../core/math'
import { fillPoly, mixHex, paintSprite, shade, type Point, type Sprite } from './canvas'
import type { Palette } from '../game/types'

/**
 * Painted horizon.
 *
 * The reference's depth comes from layered mountain ranges that are *shaped*,
 * not noise-wiggled: each massif has a defined summit, a sunlit face, a shadow
 * face and a snowline. We paint the ranges once into wide tiling strips and
 * scroll them at different rates, then seat a treeline strip in front so the
 * ranges grow out of a forest rather than ending in a hard line.
 */

export interface BackdropLayer {
  readonly sprite: Sprite
  /** Parallax rate relative to camera lateral movement. */
  readonly rate: number
  /** Drawn height as a fraction of the viewport height. */
  readonly height: number
}

export interface Backdrop {
  /** Far to near. */
  readonly layers: readonly BackdropLayer[]
  readonly clouds: readonly Sprite[]
}

const STRIP_WIDTH = 1600

interface RangeStyle {
  readonly base: string
  readonly lit: string
  readonly shadow: string
  readonly snow: string | null
  readonly snowShade: string | null
  readonly peaks: number
  /** 0..1 how jagged versus rolling the massifs are. */
  readonly sharpness: number
  /** 0..1 how much of the strip's height the tallest summit may reach. */
  readonly relief: number
}

/**
 * What the land does at this level's horizon. A surf break has rolling coastal
 * headlands, not snow-capped alps, and a desert pass has bare rock.
 */
export type TerrainProfile = 'alpine' | 'rocky' | 'coastal'

/**
 * One tiling mountain strip. The profile is built as a sequence of massifs with
 * explicit summits so the silhouette has intent; positions come from a seeded
 * rng but every face is a clean plane — the crispness of the reference comes
 * from flat facets meeting at definite ridge lines, not from soft gradients.
 */
function paintRange(style: RangeStyle, seed: number, height: number): Sprite {
  return paintSprite(STRIP_WIDTH, height, { x: 0, y: 1 }, (ctx, w, h) => {
    const rng = makeRng(seed)
    const baseY = h
    const summits: { x: number; y: number; halfWidth: number }[] = []
    const slot = w / style.peaks
    for (let i = 0; i < style.peaks; i++) {
      summits.push({
        x: slot * (i + 0.5) + (rng() - 0.5) * slot * 0.32,
        // `relief` sets how high summits may climb: alps nearly fill the strip,
        // coastal headlands only creep above the waterline.
        y: h * (1 - style.relief * (0.58 + rng() * 0.42)),
        halfWidth: slot * (0.62 + rng() * 0.4),
      })
    }

    // Draw back-to-front by summit height so taller massifs sit behind.
    const ordered = [...summits].sort((a, b) => a.y - b.y)
    for (const peak of ordered) {
      const shoulder = peak.halfWidth * (1 - style.sharpness * 0.35)
      const leftX = peak.x - peak.halfWidth
      const rightX = peak.x + peak.halfWidth
      // A sub-summit either side keeps the flanks from being straight lines
      // and gives the snowline gullies to finger down into.
      const breakY = peak.y + (baseY - peak.y) * (0.42 + style.sharpness * 0.2)
      const subL = { x: peak.x - shoulder * 0.55, y: breakY }
      const subR = { x: peak.x + shoulder * 0.5, y: breakY - (baseY - peak.y) * 0.06 }

      const body: Point[] = [
        [leftX, baseY],
        [subL.x, subL.y],
        [peak.x, peak.y],
        [subR.x, subR.y],
        [rightX, baseY],
      ]
      fillPoly(ctx, body, style.base)

      // Sunlit left face — one flat plane from summit to base.
      fillPoly(
        ctx,
        [
          [subL.x, subL.y],
          [peak.x, peak.y],
          [peak.x + shoulder * 0.06, breakY + (baseY - peak.y) * 0.12],
          [peak.x - shoulder * 0.34, baseY],
          [leftX + shoulder * 0.2, baseY],
        ],
        style.lit,
      )
      // Shadow face.
      fillPoly(
        ctx,
        [
          [peak.x, peak.y],
          [subR.x, subR.y],
          [rightX, baseY],
          [peak.x + shoulder * 0.14, baseY],
        ],
        style.shadow,
      )

      if (style.snow) {
        // Snowline: a cap whose lower edge fingers down the gullies. The cap
        // is split at the ridge so the shadow side of the snow reads cooler —
        // this two-tone cap is what makes the reference's peaks look crisp.
        const capBottom = peak.y + (baseY - peak.y) * 0.38
        const capHalf = peak.halfWidth * 0.46
        // Lit snow, left of the ridge.
        ctx.beginPath()
        ctx.moveTo(peak.x, peak.y)
        ctx.lineTo(peak.x - capHalf * 0.42, peak.y + (capBottom - peak.y) * 0.36)
        ctx.lineTo(peak.x - capHalf * 0.62, capBottom - (capBottom - peak.y) * 0.18)
        ctx.lineTo(peak.x - capHalf, capBottom)
        ctx.lineTo(peak.x - capHalf * 0.55, capBottom + (baseY - capBottom) * 0.12)
        ctx.lineTo(peak.x - capHalf * 0.16, capBottom - (capBottom - peak.y) * 0.2)
        ctx.lineTo(peak.x, capBottom + (baseY - capBottom) * 0.05)
        ctx.closePath()
        ctx.fillStyle = style.snow
        ctx.fill()
        // Shaded snow, right of the ridge.
        ctx.beginPath()
        ctx.moveTo(peak.x, peak.y)
        ctx.lineTo(peak.x + capHalf * 0.46, peak.y + (capBottom - peak.y) * 0.44)
        ctx.lineTo(peak.x + capHalf, capBottom * 0.98)
        ctx.lineTo(peak.x + capHalf * 0.6, capBottom - (capBottom - peak.y) * 0.28)
        ctx.lineTo(peak.x + capHalf * 0.26, capBottom + (baseY - capBottom) * 0.14)
        ctx.lineTo(peak.x, capBottom + (baseY - capBottom) * 0.05)
        ctx.closePath()
        ctx.fillStyle = style.snowShade ?? style.snow
        ctx.fill()
        // Ridge line catching the light.
        ctx.beginPath()
        ctx.moveTo(peak.x, peak.y)
        ctx.lineTo(peak.x - capHalf * 0.42, peak.y + (capBottom - peak.y) * 0.36)
        ctx.lineTo(peak.x - capHalf, capBottom)
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'
        ctx.lineWidth = h * 0.006
        ctx.stroke()
      }
    }
  })
}

interface TreelineStyle {
  readonly dark: string
  readonly light: string
  readonly snow: string | null
}

/**
 * A dense band of tiny conifers at the foot of the ranges — the reference's
 * forests. Two overlapping rows, back row darker, front row lit, each tree a
 * simple two-triangle silhouette with an optional snow fleck. At the scale it
 * is drawn nothing finer would survive, and the repetition is what reads as
 * "forest" rather than "row of trees".
 */
function paintTreeline(style: TreelineStyle, seed: number, height: number): Sprite {
  return paintSprite(STRIP_WIDTH, height, { x: 0, y: 1 }, (ctx, w, h) => {
    const rng = makeRng(seed)
    const rows: { y: number; color: string; scale: number }[] = [
      { y: h * 0.66, color: style.dark, scale: 0.8 },
      { y: h * 0.86, color: style.light, scale: 1 },
    ]
    for (const row of rows) {
      // Soft ground band under the row seats the trunks.
      ctx.fillStyle = row.color
      ctx.fillRect(0, row.y, w, h - row.y)
      let x = rng() * 20
      while (x < w) {
        const treeH = h * (0.32 + rng() * 0.3) * row.scale
        const treeW = treeH * (0.44 + rng() * 0.14)
        const baseY = row.y + rng() * h * 0.08
        // Two stacked triangles: canopy and crown.
        ctx.fillStyle = row.color
        ctx.beginPath()
        ctx.moveTo(x, baseY)
        ctx.lineTo(x + treeW / 2, baseY - treeH * 0.62)
        ctx.lineTo(x + treeW, baseY)
        ctx.closePath()
        ctx.fill()
        ctx.beginPath()
        ctx.moveTo(x + treeW * 0.14, baseY - treeH * 0.42)
        ctx.lineTo(x + treeW / 2, baseY - treeH)
        ctx.lineTo(x + treeW * 0.86, baseY - treeH * 0.42)
        ctx.closePath()
        ctx.fill()
        if (style.snow && rng() > 0.35) {
          // A fleck of snow on the crown's left shoulder.
          ctx.fillStyle = style.snow
          ctx.beginPath()
          ctx.moveTo(x + treeW * 0.28, baseY - treeH * 0.62)
          ctx.lineTo(x + treeW / 2, baseY - treeH)
          ctx.lineTo(x + treeW * 0.62, baseY - treeH * 0.68)
          ctx.lineTo(x + treeW * 0.42, baseY - treeH * 0.58)
          ctx.closePath()
          ctx.fill()
        }
        x += treeW * (0.55 + rng() * 0.5)
      }
    }
  })
}

function paintCloud(seed: number, tint: string): Sprite {
  const rng = makeRng(seed)
  const width = 520
  const height = 200
  return paintSprite(width, height, { x: 0.5, y: 0.5 }, (ctx, w, h) => {
    const lobes = 5 + Math.floor(rng() * 3)
    const cy = h * 0.62
    // Underside first, in the cooler shadow tint.
    for (let i = 0; i < lobes; i++) {
      const t = i / (lobes - 1)
      const x = w * (0.14 + t * 0.72)
      const r = w * (0.1 + Math.sin(t * Math.PI) * 0.11) * (0.8 + rng() * 0.4)
      ctx.beginPath()
      ctx.ellipse(x, cy, r, r * 0.72, 0, 0, Math.PI * 2)
      ctx.fillStyle = mixHex(tint, '#ffffff', 0.35)
      ctx.fill()
    }
    // Sunlit crowns sit slightly higher and brighter.
    for (let i = 0; i < lobes; i++) {
      const t = i / (lobes - 1)
      const x = w * (0.16 + t * 0.7)
      const r = w * (0.085 + Math.sin(t * Math.PI) * 0.1) * (0.8 + rng() * 0.4)
      ctx.beginPath()
      ctx.ellipse(x, cy - r * 0.42, r, r * 0.66, 0, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
    }
    // Flat base.
    ctx.beginPath()
    ctx.ellipse(w * 0.5, cy + h * 0.06, w * 0.36, h * 0.07, 0, 0, Math.PI * 2)
    ctx.fillStyle = mixHex(tint, '#ffffff', 0.55)
    ctx.fill()
  })
}

export function paintBackdrop(
  palette: Palette,
  seed: number,
  profile: TerrainProfile = 'alpine',
): Backdrop {
  // Snow caps belong to alpine horizons only. Rocky passes and coastal
  // headlands get a lit crest instead, so an ocean level never grows alps.
  const capped = profile === 'alpine'
  const relief = profile === 'coastal' ? 0.44 : profile === 'rocky' ? 0.76 : 1
  const jagged = profile === 'coastal' ? 0.45 : 1

  const far: RangeStyle = {
    base: palette.ridgeFar,
    lit: shade(palette.ridgeFar, 0.18),
    shadow: shade(palette.ridgeFar, -0.16),
    snow: capped ? mixHex(palette.ridgeFar, '#ffffff', 0.8) : null,
    snowShade: capped ? mixHex(palette.ridgeFar, '#ffffff', 0.52) : null,
    peaks: 5,
    sharpness: 0.35 * jagged,
    relief,
  }
  const midBase = mixHex(palette.ridgeFar, palette.ridgeNear, 0.55)
  const mid: RangeStyle = {
    base: midBase,
    lit: shade(midBase, 0.22),
    shadow: shade(midBase, -0.2),
    snow: capped ? mixHex(palette.ridgeNear, '#ffffff', 0.85) : null,
    snowShade: capped ? mixHex(palette.ridgeNear, '#ffffff', 0.55) : null,
    peaks: 4,
    sharpness: 0.6 * jagged,
    relief: relief * 0.92,
  }
  const near: RangeStyle = {
    base: palette.ridgeNear,
    lit: shade(palette.ridgeNear, 0.26),
    shadow: shade(palette.ridgeNear, -0.24),
    snow: capped ? mixHex(palette.ridgeNear, '#ffffff', 0.9) : null,
    snowShade: capped ? mixHex(palette.ridgeNear, '#ffffff', 0.6) : null,
    peaks: 3,
    sharpness: 0.8 * jagged,
    relief: relief * 0.84,
  }

  // The treeline picks up the terrain: alpine gets snowy conifers, coastal a
  // warm scrub band, rocky a dusty one. Colours derive from the palette so the
  // band always sits naturally against its own fog.
  const treeline: TreelineStyle =
    profile === 'alpine'
      ? {
          dark: mixHex(palette.ridgeNear, '#0d2418', 0.55),
          light: mixHex(palette.ridgeNear, '#1c4a30', 0.62),
          snow: 'rgba(240,250,255,0.85)',
        }
      : {
          dark: shade(palette.ridgeNear, -0.3),
          light: shade(palette.ridgeNear, -0.14),
          snow: null,
        }

  return {
    layers: [
      { sprite: paintRange(far, seed, 360), rate: 0.012, height: 0.46 },
      { sprite: paintRange(mid, seed + 977, 320), rate: 0.03, height: 0.37 },
      { sprite: paintRange(near, seed + 4211, 260), rate: 0.062, height: 0.28 },
      { sprite: paintTreeline(treeline, seed + 8887, 120), rate: 0.11, height: 0.075 },
    ],
    clouds: [
      paintCloud(seed + 31, palette.fog),
      paintCloud(seed + 618, palette.fog),
      paintCloud(seed + 1201, palette.fog),
    ],
  }
}

export { STRIP_WIDTH }
