/**
 * Offscreen sprite painting.
 *
 * Every prop, character and mountain range in the game is painted once into its
 * own canvas at a generous resolution, then blitted per frame. Doing the work up
 * front buys real illustration — layered facets, snow caps, ambient occlusion,
 * rim light — at the cost of a single `drawImage` while the game is running.
 */

export interface Sprite {
  readonly image: HTMLCanvasElement
  readonly width: number
  readonly height: number
  /** Horizontal pixel that lands on the prop's world x. */
  readonly anchorX: number
  /** Vertical pixel that sits on the ground line. */
  readonly anchorY: number
}

export type Painter = (ctx: CanvasRenderingContext2D, width: number, height: number) => void

export interface Anchor {
  /** 0..1 across the sprite. */
  readonly x: number
  /** 0..1 down the sprite. */
  readonly y: number
}

/** Ground-standing props anchor at bottom-centre. */
export const GROUND_ANCHOR: Anchor = { x: 0.5, y: 1 }

export function paintSprite(
  width: number,
  height: number,
  anchor: Anchor,
  painter: Painter,
): Sprite {
  const image = document.createElement('canvas')
  image.width = Math.max(1, Math.round(width))
  image.height = Math.max(1, Math.round(height))
  const ctx = image.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is not available in this browser.')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  painter(ctx, image.width, image.height)
  return {
    image,
    width: image.width,
    height: image.height,
    anchorX: image.width * anchor.x,
    anchorY: image.height * anchor.y,
  }
}

export type Point = readonly [number, number]

export function tracePoly(ctx: CanvasRenderingContext2D, points: readonly Point[]): void {
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1])
  ctx.closePath()
}

export function fillPoly(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  style: string | CanvasGradient,
): void {
  tracePoly(ctx, points)
  ctx.fillStyle = style
  ctx.fill()
}

export function verticalGradient(
  ctx: CanvasRenderingContext2D,
  top: number,
  bottom: number,
  stops: readonly (readonly [number, string])[],
): CanvasGradient {
  const gradient = ctx.createLinearGradient(0, top, 0, bottom)
  for (const [offset, color] of stops) gradient.addColorStop(offset, color)
  return gradient
}

export function diagonalGradient(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stops: readonly (readonly [number, string])[],
): CanvasGradient {
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1)
  for (const [offset, color] of stops) gradient.addColorStop(offset, color)
  return gradient
}

export function ellipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  style: string | CanvasGradient,
): void {
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  ctx.fillStyle = style
  ctx.fill()
}

/**
 * Contact shadow. Props that lack one look pasted onto the surface rather than
 * standing on it, which is the single loudest tell of amateur 2D scenery.
 */
export function contactShadow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  strength = 0.3,
): void {
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry))
  gradient.addColorStop(0, `rgba(28,44,74,${strength})`)
  gradient.addColorStop(0.6, `rgba(28,44,74,${strength * 0.45})`)
  gradient.addColorStop(1, 'rgba(28,44,74,0)')
  ellipse(ctx, cx, cy, rx, ry, gradient)
}

/**
 * A downward-bulging scalloped edge, traced right to left. Snow settling on a
 * branch, a roof or a rock reads as soft lobes rather than a straight cut.
 */
export function scallopedEdge(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  toX: number,
  y: number,
  lobes: number,
  depth: number,
): void {
  const step = (toX - fromX) / lobes
  for (let i = 0; i < lobes; i++) {
    const control = fromX + step * (i + 0.5)
    ctx.quadraticCurveTo(control, y + depth, fromX + step * (i + 1), y)
  }
}

export function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

export function fillRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  style: string | CanvasGradient,
): void {
  roundedRect(ctx, x, y, width, height, radius)
  ctx.fillStyle = style
  ctx.fill()
}

/** Mixes two `#rrggbb` colours. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseHex(a)
  const pb = parseHex(b)
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t)
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t)
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t)
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`
}

export function shade(color: string, amount: number): string {
  return amount < 0 ? mixHex(color, '#0d1a30', -amount) : mixHex(color, '#ffffff', amount)
}

function parseHex(value: string): [number, number, number] {
  const hex = value.replace('#', '')
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ]
}

function toHex(value: number): string {
  return Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0')
}
