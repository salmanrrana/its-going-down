import {
  contactShadow,
  ellipse,
  fillPoly,
  fillRoundedRect,
  GROUND_ANCHOR,
  paintSprite,
  roundedRect,
  scallopedEdge,
  shade,
  tracePoly,
  verticalGradient,
  type Point,
  type Sprite,
} from './canvas'

/**
 * Painted obstacles. These are the things that end a run, so they are lit a
 * little hotter than the scenery and always carry a hard contact shadow: a
 * five-year-old has to read them as solid and in the way, instantly.
 */

export interface ObstacleArtOptions {
  readonly snowy: boolean
}

function paintBoulder(seedScale: number, snowy: boolean): Sprite {
  return paintSprite(300, 260, GROUND_ANCHOR, (ctx, w, h) => {
    const groundY = h - 12
    const cx = w * 0.5
    const spread = w * (0.38 + seedScale * 0.06)
    const top = h * (0.14 + (1 - seedScale) * 0.08)

    contactShadow(ctx, cx + 12, groundY, spread * 1.2, h * 0.07, 0.42)

    const body: Point[] = [
      [cx - spread, groundY],
      [cx - spread * 0.94, groundY - h * 0.4],
      [cx - spread * 0.42, top + h * 0.05],
      [cx + spread * 0.16, top],
      [cx + spread * 0.86, groundY - h * 0.36],
      [cx + spread, groundY],
    ]
    fillPoly(
      ctx,
      body,
      verticalGradient(ctx, top, groundY, [
        [0, '#8d97a6'],
        [0.6, '#6c7685'],
        [1, '#4c5563'],
      ]),
    )

    // Two big facets so the silhouette reads as carved stone, not a blob.
    fillPoly(
      ctx,
      [
        [cx - spread * 0.94, groundY - h * 0.4],
        [cx - spread * 0.42, top + h * 0.05],
        [cx + spread * 0.16, top],
        [cx - spread * 0.1, groundY - h * 0.24],
      ],
      'rgba(255,255,255,0.26)',
    )
    fillPoly(
      ctx,
      [
        [cx + spread * 0.16, top],
        [cx + spread * 0.86, groundY - h * 0.36],
        [cx + spread, groundY],
        [cx + spread * 0.1, groundY],
      ],
      'rgba(20,32,54,0.32)',
    )

    if (snowy) {
      ctx.save()
      tracePoly(ctx, body)
      ctx.clip()
      ctx.beginPath()
      ctx.moveTo(cx - spread, groundY - h * 0.3)
      ctx.quadraticCurveTo(cx - spread * 0.4, top - h * 0.03, cx + spread * 0.2, top + h * 0.02)
      ctx.quadraticCurveTo(cx + spread * 0.7, groundY - h * 0.44, cx + spread, groundY - h * 0.22)
      scallopedEdge(ctx, cx + spread, cx - spread, groundY - h * 0.26, 5, h * 0.1)
      ctx.closePath()
      ctx.fillStyle = verticalGradient(ctx, top, groundY, [
        [0, '#ffffff'],
        [1, '#d3e5f7'],
      ])
      ctx.fill()
      ctx.restore()
    }
  })
}

function paintObstacleTree(snowy: boolean): Sprite {
  return paintSprite(300, 470, GROUND_ANCHOR, (ctx, w, h) => {
    const cx = w * 0.5
    const groundY = h - 14
    const trunkTop = groundY - h * 0.16

    contactShadow(ctx, cx + 16, groundY, w * 0.42, h * 0.038, 0.44)

    fillPoly(
      ctx,
      [
        [cx - w * 0.08, groundY],
        [cx - w * 0.05, trunkTop],
        [cx + w * 0.05, trunkTop],
        [cx + w * 0.08, groundY],
      ],
      '#6a4527',
    )
    fillPoly(
      ctx,
      [
        [cx - w * 0.08, groundY],
        [cx - w * 0.05, trunkTop],
        [cx - w * 0.012, trunkTop],
        [cx - w * 0.03, groundY],
      ],
      '#8a5f38',
    )

    // Dense, wide canopy — obstacle trees are chunkier than scenery pines so the
    // player never mistakes one for background.
    for (let i = 2; i >= 0; i--) {
      const t = i / 2
      const baseY = trunkTop - (trunkTop - h * 0.1) * (t * 0.82)
      const spread = w * 0.5 * (1 - t * 0.44)
      const drop = h * 0.14 * (1 - t * 0.24)

      ctx.beginPath()
      ctx.moveTo(cx, baseY - drop * 1.9)
      ctx.quadraticCurveTo(cx + spread * 0.6, baseY - drop * 0.3, cx + spread, baseY)
      ctx.quadraticCurveTo(cx + spread * 0.45, baseY + drop * 0.36, cx, baseY + drop * 0.16)
      ctx.quadraticCurveTo(cx - spread * 0.45, baseY + drop * 0.36, cx - spread, baseY)
      ctx.quadraticCurveTo(cx - spread * 0.6, baseY - drop * 0.3, cx, baseY - drop * 1.9)
      ctx.closePath()
      ctx.fillStyle = verticalGradient(ctx, baseY - drop * 1.9, baseY + drop * 0.2, [
        [0, '#3d8a55'],
        [1, '#17492f'],
      ])
      ctx.fill()
      ctx.save()
      ctx.clip()
      ctx.fillStyle = 'rgba(10,40,38,0.3)'
      ctx.fillRect(cx + spread * 0.05, baseY - drop * 2.2, spread, drop * 3)
      ctx.restore()

      if (snowy) {
        ctx.beginPath()
        ctx.moveTo(cx - spread * 0.9, baseY - drop * 0.1)
        ctx.quadraticCurveTo(cx - spread * 0.45, baseY - drop * 1.6, cx, baseY - drop * 1.82)
        ctx.quadraticCurveTo(cx + spread * 0.45, baseY - drop * 1.6, cx + spread * 0.9, baseY - drop * 0.1)
        scallopedEdge(ctx, cx + spread * 0.9, cx - spread * 0.9, baseY - drop * 0.1, 5, drop * 0.46)
        ctx.closePath()
        ctx.fillStyle = verticalGradient(ctx, baseY - drop * 1.85, baseY + drop * 0.4, [
          [0, '#ffffff'],
          [1, '#d6e7f8'],
        ])
        ctx.fill()
      }
    }
  })
}

function paintCone(): Sprite {
  return paintSprite(220, 260, GROUND_ANCHOR, (ctx, w, h) => {
    const cx = w * 0.5
    const groundY = h - 12
    const apex = h * 0.14

    contactShadow(ctx, cx + 10, groundY, w * 0.42, h * 0.05, 0.44)

    // Base plate.
    fillRoundedRect(ctx, cx - w * 0.38, groundY - h * 0.09, w * 0.76, h * 0.09, 6, '#d4531a')
    ellipse(ctx, cx, groundY - h * 0.09, w * 0.38, h * 0.03, '#ff6a1f')

    const cone: Point[] = [
      [cx, apex],
      [cx + w * 0.29, groundY - h * 0.07],
      [cx - w * 0.29, groundY - h * 0.07],
    ]
    fillPoly(
      ctx,
      cone,
      verticalGradient(ctx, apex, groundY, [
        [0, '#ff8a45'],
        [1, '#e0501a'],
      ]),
    )
    // Reflective bands, following the taper.
    ctx.save()
    tracePoly(ctx, cone)
    ctx.clip()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, h * 0.4, w, h * 0.11)
    ctx.fillStyle = 'rgba(255,255,255,0.82)'
    ctx.fillRect(0, h * 0.62, w, h * 0.08)
    ctx.fillStyle = 'rgba(30,20,10,0.28)'
    ctx.fillRect(cx + w * 0.06, 0, w, h)
    ctx.restore()

    // Rim light down the lit edge.
    ctx.strokeStyle = 'rgba(255,220,180,0.75)'
    ctx.lineWidth = w * 0.022
    ctx.beginPath()
    ctx.moveTo(cx - w * 0.02, apex + h * 0.02)
    ctx.lineTo(cx - w * 0.26, groundY - h * 0.09)
    ctx.stroke()
  })
}

function paintBarrel(): Sprite {
  return paintSprite(230, 290, GROUND_ANCHOR, (ctx, w, h) => {
    const cx = w * 0.5
    const groundY = h - 12
    const top = h * 0.14
    const halfW = w * 0.3

    contactShadow(ctx, cx + 12, groundY, halfW * 1.35, h * 0.045, 0.44)

    // Barrel body with a barrel-shaped silhouette (bulging sides).
    ctx.beginPath()
    ctx.moveTo(cx - halfW * 0.9, top)
    ctx.quadraticCurveTo(cx - halfW * 1.16, h * 0.55, cx - halfW * 0.9, groundY)
    ctx.lineTo(cx + halfW * 0.9, groundY)
    ctx.quadraticCurveTo(cx + halfW * 1.16, h * 0.55, cx + halfW * 0.9, top)
    ctx.closePath()
    ctx.fillStyle = verticalGradient(ctx, top, groundY, [
      [0, '#ff5f5f'],
      [1, '#b32424'],
    ])
    ctx.fill()

    ctx.save()
    ctx.clip()
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fillRect(0, h * 0.34, w, h * 0.1)
    ctx.fillRect(0, h * 0.62, w, h * 0.1)
    // Cylinder shading: dark on the right, a bright specular band left of centre.
    ctx.fillStyle = 'rgba(20,10,20,0.3)'
    ctx.fillRect(cx + halfW * 0.28, 0, w, h)
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    ctx.fillRect(cx - halfW * 0.62, 0, halfW * 0.34, h)
    ctx.restore()

    // Lid.
    ellipse(ctx, cx, top, halfW * 0.9, h * 0.045, '#e04a4a')
    ellipse(ctx, cx, top - h * 0.008, halfW * 0.66, h * 0.03, '#ff8383')
  })
}

function paintLog(snowy: boolean): Sprite {
  return paintSprite(460, 190, GROUND_ANCHOR, (ctx, w, h) => {
    const groundY = h - 10
    const top = h * 0.24
    const left = w * 0.08
    const right = w * 0.92

    contactShadow(ctx, w * 0.52, groundY, w * 0.44, h * 0.09, 0.44)

    ctx.beginPath()
    ctx.moveTo(left, top)
    ctx.lineTo(right, top)
    ctx.quadraticCurveTo(right + w * 0.03, (top + groundY) / 2, right, groundY)
    ctx.lineTo(left, groundY)
    ctx.quadraticCurveTo(left - w * 0.03, (top + groundY) / 2, left, top)
    ctx.closePath()
    ctx.fillStyle = verticalGradient(ctx, top, groundY, [
      [0, '#9a6a3f'],
      [0.55, '#7b5230'],
      [1, '#4f331d'],
    ])
    ctx.fill()

    // Bark grain.
    ctx.strokeStyle = 'rgba(50,30,14,0.4)'
    ctx.lineWidth = 3
    for (const t of [0.3, 0.55, 0.78]) {
      const y = top + (groundY - top) * t
      ctx.beginPath()
      ctx.moveTo(left + w * 0.06, y)
      ctx.bezierCurveTo(w * 0.4, y - h * 0.05, w * 0.6, y + h * 0.05, right - w * 0.06, y)
      ctx.stroke()
    }

    // Cut end with rings — the detail that makes it read as felled timber.
    ellipse(ctx, right, (top + groundY) / 2, w * 0.045, (groundY - top) / 2, '#b98652')
    ellipse(ctx, right, (top + groundY) / 2, w * 0.03, (groundY - top) * 0.34, '#d5a870')
    ellipse(ctx, right, (top + groundY) / 2, w * 0.014, (groundY - top) * 0.16, '#b98652')

    if (snowy) {
      ctx.beginPath()
      ctx.moveTo(left, top + h * 0.02)
      ctx.lineTo(right, top + h * 0.02)
      scallopedEdge(ctx, right, left, top + h * 0.1, 9, h * 0.1)
      ctx.closePath()
      ctx.fillStyle = '#ffffff'
      ctx.fill()
    }
  })
}

function paintParkedCar(): Sprite {
  return paintSprite(460, 260, GROUND_ANCHOR, (ctx, w, h) => {
    const groundY = h - 12
    const bodyTop = h * 0.46
    const roofTop = h * 0.14

    contactShadow(ctx, w * 0.52, groundY, w * 0.46, h * 0.07, 0.46)

    // Wheels first so the body overlaps them.
    for (const bx of [0.24, 0.76]) {
      ellipse(ctx, w * bx, groundY - h * 0.06, w * 0.075, h * 0.11, '#15161a')
      ellipse(ctx, w * bx, groundY - h * 0.06, w * 0.036, h * 0.055, '#9aa3b2')
    }

    // Cabin.
    fillPoly(
      ctx,
      [
        [w * 0.3, bodyTop],
        [w * 0.38, roofTop],
        [w * 0.66, roofTop],
        [w * 0.74, bodyTop],
      ],
      '#2456a6',
    )
    // Glass with a diagonal highlight.
    fillPoly(
      ctx,
      [
        [w * 0.335, bodyTop - h * 0.02],
        [w * 0.4, roofTop + h * 0.04],
        [w * 0.63, roofTop + h * 0.04],
        [w * 0.705, bodyTop - h * 0.02],
      ],
      '#a9d6f5',
    )
    fillPoly(
      ctx,
      [
        [w * 0.4, roofTop + h * 0.04],
        [w * 0.55, roofTop + h * 0.04],
        [w * 0.42, bodyTop - h * 0.02],
        [w * 0.335, bodyTop - h * 0.02],
      ],
      'rgba(255,255,255,0.55)',
    )

    // Body shell.
    ctx.beginPath()
    ctx.moveTo(w * 0.1, groundY - h * 0.1)
    ctx.quadraticCurveTo(w * 0.1, bodyTop, w * 0.24, bodyTop - h * 0.02)
    ctx.lineTo(w * 0.78, bodyTop - h * 0.02)
    ctx.quadraticCurveTo(w * 0.92, bodyTop, w * 0.92, groundY - h * 0.1)
    ctx.quadraticCurveTo(w * 0.5, groundY, w * 0.1, groundY - h * 0.1)
    ctx.closePath()
    ctx.fillStyle = verticalGradient(ctx, bodyTop - h * 0.02, groundY, [
      [0, '#3d7ede'],
      [0.5, '#2b62bd'],
      [1, '#1b407f'],
    ])
    ctx.fill()

    // Shoulder highlight along the top of the body — reads as sheet metal.
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = h * 0.018
    ctx.beginPath()
    ctx.moveTo(w * 0.14, bodyTop + h * 0.06)
    ctx.quadraticCurveTo(w * 0.5, bodyTop - h * 0.05, w * 0.88, bodyTop + h * 0.06)
    ctx.stroke()

    // Lights.
    fillRoundedRect(ctx, w * 0.09, groundY - h * 0.3, w * 0.06, h * 0.08, 3, '#ffe9a8')
    fillRoundedRect(ctx, w * 0.85, groundY - h * 0.3, w * 0.06, h * 0.08, 3, '#ff6b5a')
  })
}

function paintHydrant(): Sprite {
  return paintSprite(200, 260, GROUND_ANCHOR, (ctx, w, h) => {
    const cx = w * 0.5
    const groundY = h - 10
    const bodyTop = h * 0.3

    contactShadow(ctx, cx + 10, groundY, w * 0.34, h * 0.04, 0.42)

    fillRoundedRect(ctx, cx - w * 0.24, groundY - h * 0.08, w * 0.48, h * 0.08, 4, '#8f1f18')
    fillRoundedRect(ctx, cx - w * 0.18, bodyTop, w * 0.36, groundY - bodyTop - h * 0.05, 10, '#d8352a')
    // Dome cap.
    ctx.beginPath()
    ctx.arc(cx, bodyTop + w * 0.02, w * 0.18, Math.PI, 0)
    ctx.fillStyle = '#e8483c'
    ctx.fill()
    fillRoundedRect(ctx, cx - w * 0.07, h * 0.2, w * 0.14, h * 0.09, 4, '#b6271e')
    // Side nozzles and collar.
    fillRoundedRect(ctx, cx - w * 0.34, h * 0.44, w * 0.14, h * 0.1, 4, '#b6271e')
    fillRoundedRect(ctx, cx + w * 0.2, h * 0.44, w * 0.14, h * 0.1, 4, '#b6271e')
    fillRoundedRect(ctx, cx - w * 0.26, h * 0.62, w * 0.52, h * 0.06, 4, '#a8231b')
    // Highlight down the lit side.
    ctx.fillStyle = 'rgba(255,255,255,0.28)'
    ctx.fillRect(cx - w * 0.14, bodyTop + h * 0.04, w * 0.06, groundY - bodyTop - h * 0.14)
  })
}

function paintCrate(): Sprite {
  return paintSprite(240, 250, GROUND_ANCHOR, (ctx, w, h) => {
    const groundY = h - 10
    const top = h * 0.22
    const left = w * 0.16
    const right = w * 0.78
    const depth = w * 0.12

    contactShadow(ctx, w * 0.52, groundY, w * 0.4, h * 0.05, 0.42)

    // Side face.
    fillPoly(
      ctx,
      [
        [right, top + depth * 0.6],
        [right + depth, top],
        [right + depth, groundY - depth * 0.6],
        [right, groundY],
      ],
      '#7e5326',
    )
    // Top face.
    fillPoly(
      ctx,
      [
        [left, top + depth * 0.6],
        [left + depth, top],
        [right + depth, top],
        [right, top + depth * 0.6],
      ],
      '#c98f4c',
    )
    // Front face with plank grain and a diagonal brace.
    ctx.fillStyle = verticalGradient(ctx, top, groundY, [
      [0, '#b8813f'],
      [1, '#8e6130'],
    ])
    ctx.fillRect(left, top + depth * 0.6, right - left, groundY - top - depth * 0.6)
    ctx.strokeStyle = 'rgba(72,44,18,0.7)'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(left, top + depth * 0.6)
    ctx.lineTo(right, groundY)
    ctx.moveTo(right, top + depth * 0.6)
    ctx.lineTo(left, groundY)
    ctx.stroke()
    ctx.strokeRect(left, top + depth * 0.6, right - left, groundY - top - depth * 0.6)
    ctx.fillStyle = 'rgba(255,255,255,0.16)'
    ctx.fillRect(left, top + depth * 0.6, (right - left) * 0.16, groundY - top - depth * 0.6)
  })
}

export type ObstacleArtKind =
  | 'rock'
  | 'tree'
  | 'cone'
  | 'barrel'
  | 'log'
  | 'car'
  | 'hydrant'
  | 'crate'

export function paintObstacleVariants(
  kind: ObstacleArtKind,
  options: ObstacleArtOptions,
): Sprite[] {
  switch (kind) {
    case 'rock':
      return [0.2, 0.55, 0.9].map((seed) => paintBoulder(seed, options.snowy))
    case 'tree':
      return [paintObstacleTree(options.snowy)]
    case 'cone':
      return [paintCone()]
    case 'barrel':
      return [paintBarrel()]
    case 'log':
      return [paintLog(options.snowy)]
    case 'car':
      return [paintParkedCar()]
    case 'hydrant':
      return [paintHydrant()]
    case 'crate':
      return [paintCrate()]
  }
}

/** Collectible token, painted as a faceted coin so the spin frames read cleanly. */
export function paintCoin(accent: string): Sprite {
  const size = 160
  return paintSprite(size, size, { x: 0.5, y: 0.5 }, (ctx, w, h) => {
    const cx = w / 2
    const cy = h / 2
    const r = w * 0.42

    const glow = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.18)
    glow.addColorStop(0, 'rgba(255,255,255,0.35)')
    glow.addColorStop(1, 'rgba(255,255,255,0)')
    ellipse(ctx, cx, cy, r * 1.18, r * 1.18, glow)

    ellipse(
      ctx,
      cx,
      cy,
      r,
      r,
      verticalGradient(ctx, cy - r, cy + r, [
        [0, shade(accent, 0.55)],
        [0.5, accent],
        [1, shade(accent, -0.35)],
      ]),
    )
    ellipse(ctx, cx, cy, r * 0.74, r * 0.74, shade(accent, 0.3))
    ellipse(ctx, cx, cy, r * 0.62, r * 0.62, shade(accent, -0.1))
    // Star face.
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const radius = i % 2 === 0 ? r * 0.46 : r * 0.2
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      const px = cx + Math.cos(a) * radius
      const py = cy + Math.sin(a) * radius
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.fillStyle = shade(accent, 0.7)
    ctx.fill()
    // Specular crescent.
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.86, Math.PI * 1.05, Math.PI * 1.45)
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.lineWidth = w * 0.05
    ctx.stroke()
  })
}

/** Launch ramp, painted head-on so it can be scaled straight onto the surface. */
export function paintRamp(accent: string, snowy: boolean): Sprite {
  return paintSprite(520, 300, GROUND_ANCHOR, (ctx, w, h) => {
    const groundY = h - 8
    const crest = h * 0.2
    const left = w * 0.06
    const right = w * 0.94
    const crestInset = w * 0.2

    contactShadow(ctx, w * 0.52, groundY, w * 0.46, h * 0.06, 0.4)

    const face: Point[] = [
      [left, groundY],
      [left + crestInset, crest],
      [right - crestInset, crest],
      [right, groundY],
    ]
    fillPoly(
      ctx,
      face,
      verticalGradient(ctx, crest, groundY, [
        [0, snowy ? '#ffffff' : shade(accent, 0.4)],
        [1, snowy ? '#a9cdec' : shade(accent, -0.28)],
      ]),
    )

    // Chevrons up the face, clipped so they follow the taper.
    ctx.save()
    tracePoly(ctx, face)
    ctx.clip()
    ctx.strokeStyle = snowy ? 'rgba(40,90,150,0.5)' : 'rgba(20,20,30,0.35)'
    ctx.lineWidth = h * 0.05
    for (let i = 0; i < 3; i++) {
      const y = groundY - (groundY - crest) * (0.22 + i * 0.26)
      ctx.beginPath()
      ctx.moveTo(w * 0.1, y + h * 0.09)
      ctx.lineTo(w * 0.5, y - h * 0.05)
      ctx.lineTo(w * 0.9, y + h * 0.09)
      ctx.stroke()
    }
    ctx.restore()

    // Lip: the bright edge that tells you exactly where you leave the ground.
    roundedRect(ctx, left + crestInset, crest - h * 0.05, right - left - crestInset * 2, h * 0.075, h * 0.03)
    ctx.fillStyle = snowy ? '#ffffff' : accent
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = h * 0.012
    ctx.stroke()
  })
}
