import {
  contactShadow,
  ellipse,
  fillPoly,
  fillRoundedRect,
  GROUND_ANCHOR,
  mixHex,
  paintSprite,
  scallopedEdge,
  shade,
  tracePoly,
  verticalGradient,
  type Point,
  type Sprite,
} from './canvas'

/**
 * Painted scenery. Each prop is illustrated once at high resolution with a
 * consistent light direction (upper-left key, cool bounce from the snow) and a
 * grounded contact shadow, so a hillside of them reads as one lit scene rather
 * than a scatter of shapes.
 */

export interface ConiferStyle {
  readonly needleLight: string
  readonly needleDark: string
  readonly snow: string
  readonly snowShade: string
  readonly trunk: string
  /** 0 = bare summer conifer, 1 = fully laden with powder. */
  readonly snowLoad: number
}

export const SNOW_CONIFER: ConiferStyle = {
  needleLight: '#3f8f5c',
  needleDark: '#1e5c3c',
  snow: '#ffffff',
  snowShade: '#cfe2f6',
  trunk: '#7a5333',
  snowLoad: 1,
}

export const BARE_CONIFER: ConiferStyle = {
  needleLight: '#4f9b58',
  needleDark: '#255c37',
  snow: '#e9f4ff',
  snowShade: '#c3d8ef',
  trunk: '#6f4c30',
  snowLoad: 0,
}

/**
 * Layered conifer, drawn as stacked skirts rather than plain triangles: each
 * tier gets a lit left face, a shaded right face, a drooping needle edge, and —
 * when laden — a scalloped cap of powder that overhangs the tier below.
 */
export function paintConifer(style: ConiferStyle, seedScale: number): Sprite {
  const width = 260
  const height = 460
  return paintSprite(width, height, GROUND_ANCHOR, (ctx, w, h) => {
    const cx = w / 2
    const groundY = h - 14
    const tiers = 5
    const topY = h * 0.08
    const trunkTop = groundY - h * 0.1

    contactShadow(ctx, cx + 14, groundY, w * 0.42, h * 0.035, 0.34)

    // Trunk, tapering and slightly lit on the left.
    fillPoly(
      ctx,
      [
        [cx - w * 0.052, groundY],
        [cx - w * 0.036, trunkTop],
        [cx + w * 0.036, trunkTop],
        [cx + w * 0.052, groundY],
      ],
      style.trunk,
    )
    fillPoly(
      ctx,
      [
        [cx - w * 0.052, groundY],
        [cx - w * 0.036, trunkTop],
        [cx - w * 0.004, trunkTop],
        [cx - w * 0.014, groundY],
      ],
      shade(style.trunk, 0.16),
    )

    for (let i = tiers - 1; i >= 0; i--) {
      const t = i / (tiers - 1)
      // Skirts widen toward the ground and each one sits a little lower.
      const baseY = trunkTop - (trunkTop - topY) * (t * 0.86)
      const spread = (w * 0.46) * (1 - t * 0.62) * (0.94 + seedScale * 0.12)
      const drop = h * 0.115 * (1 - t * 0.3)

      // Needle skirt: a soft bell with drooping tips.
      ctx.beginPath()
      ctx.moveTo(cx, baseY - drop * 1.75)
      ctx.quadraticCurveTo(cx + spread * 0.55, baseY - drop * 0.35, cx + spread, baseY)
      ctx.quadraticCurveTo(cx + spread * 0.5, baseY + drop * 0.34, cx + spread * 0.16, baseY + drop * 0.1)
      ctx.lineTo(cx - spread * 0.16, baseY + drop * 0.1)
      ctx.quadraticCurveTo(cx - spread * 0.5, baseY + drop * 0.34, cx - spread, baseY)
      ctx.quadraticCurveTo(cx - spread * 0.55, baseY - drop * 0.35, cx, baseY - drop * 1.75)
      ctx.closePath()
      ctx.fillStyle = verticalGradient(ctx, baseY - drop * 1.75, baseY + drop * 0.2, [
        [0, style.needleLight],
        [1, style.needleDark],
      ])
      ctx.fill()

      // Shaded right half, clipped to the skirt we just traced.
      ctx.save()
      ctx.clip()
      fillPoly(
        ctx,
        [
          [cx + spread * 0.06, baseY - drop * 2],
          [cx + spread * 1.1, baseY - drop * 2],
          [cx + spread * 1.1, baseY + drop],
          [cx + spread * 0.06, baseY + drop],
        ],
        `rgba(12,44,42,${0.24 + t * 0.06})`,
      )
      ctx.restore()

      if (style.snowLoad > 0) {
        // Powder cap: lobed underside so it reads as settled snow, not a lid.
        const capSpread = spread * 0.92
        const capY = baseY - drop * 0.12
        ctx.beginPath()
        ctx.moveTo(cx - capSpread, capY)
        ctx.quadraticCurveTo(cx - capSpread * 0.5, capY - drop * 1.5, cx, baseY - drop * 1.68)
        ctx.quadraticCurveTo(cx + capSpread * 0.5, capY - drop * 1.5, cx + capSpread, capY)
        scallopedEdge(ctx, cx + capSpread, cx - capSpread, capY, 4 + i, drop * 0.5)
        ctx.closePath()
        ctx.fillStyle = verticalGradient(ctx, baseY - drop * 1.7, capY + drop * 0.5, [
          [0, style.snow],
          [0.65, style.snow],
          [1, style.snowShade],
        ])
        ctx.globalAlpha = 0.62 + style.snowLoad * 0.38
        ctx.fill()
        ctx.globalAlpha = 1

        // Sunlit crest along the upper-left of the cap.
        ctx.beginPath()
        ctx.moveTo(cx - capSpread * 0.86, capY - drop * 0.12)
        ctx.quadraticCurveTo(cx - capSpread * 0.42, capY - drop * 1.34, cx - w * 0.01, baseY - drop * 1.6)
        ctx.lineWidth = h * 0.012
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'
        ctx.stroke()
      }
    }
  })
}

function paintPalm(seedScale: number): Sprite {
  return paintSprite(300, 460, GROUND_ANCHOR, (ctx, w, h) => {
    const baseX = w * 0.42
    const groundY = h - 12
    const topX = w * 0.52 + seedScale * w * 0.06
    const topY = h * 0.2

    contactShadow(ctx, baseX + 20, groundY, w * 0.36, h * 0.03, 0.3)

    // Trunk with segment banding.
    ctx.beginPath()
    ctx.moveTo(baseX - w * 0.045, groundY)
    ctx.quadraticCurveTo(baseX + w * 0.04, h * 0.55, topX - w * 0.03, topY)
    ctx.lineTo(topX + w * 0.03, topY)
    ctx.quadraticCurveTo(baseX + w * 0.11, h * 0.55, baseX + w * 0.055, groundY)
    ctx.closePath()
    ctx.fillStyle = verticalGradient(ctx, topY, groundY, [
      [0, '#a8825a'],
      [1, '#6f4f30'],
    ])
    ctx.fill()
    ctx.strokeStyle = 'rgba(60,38,20,0.35)'
    ctx.lineWidth = 3
    for (let i = 1; i < 9; i++) {
      const t = i / 9
      const y = groundY + (topY - groundY) * t
      const x = baseX + (topX - baseX) * (t * t) + w * 0.02
      ctx.beginPath()
      ctx.moveTo(x - w * 0.05, y)
      ctx.quadraticCurveTo(x, y + h * 0.012, x + w * 0.05, y)
      ctx.stroke()
    }

    // Fronds, each a tapered leaf with a lit upper edge.
    const fronds = 7
    for (let i = 0; i < fronds; i++) {
      const angle = -Math.PI * 0.5 + (i - (fronds - 1) / 2) * 0.52
      const len = w * (0.52 + (i % 2) * 0.08)
      const tipX = topX + Math.cos(angle) * len
      const tipY = topY + Math.sin(angle) * len * 0.72 + h * 0.1
      const midX = topX + Math.cos(angle) * len * 0.55
      const midY = topY + Math.sin(angle) * len * 0.62 - h * 0.02
      ctx.beginPath()
      ctx.moveTo(topX, topY)
      ctx.quadraticCurveTo(midX, midY - h * 0.05, tipX, tipY)
      ctx.quadraticCurveTo(midX, midY + h * 0.05, topX, topY + h * 0.02)
      ctx.closePath()
      ctx.fillStyle = i % 2 === 0 ? '#2f8f4a' : '#25763d'
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(topX, topY)
      ctx.quadraticCurveTo(midX, midY - h * 0.03, tipX, tipY)
      ctx.strokeStyle = 'rgba(190,255,190,0.5)'
      ctx.lineWidth = 3
      ctx.stroke()
    }

    // Coconut cluster.
    for (const [dx, dy] of [
      [-0.02, 0.03],
      [0.03, 0.045],
      [0.005, 0.06],
    ] as const) {
      ellipse(ctx, topX + w * dx, topY + h * dy, w * 0.03, w * 0.03, '#5b3d22')
    }
  })
}

function paintBuilding(seedScale: number, palette: BuildingPalette): Sprite {
  const floors = 4 + Math.floor(seedScale * 4)
  const height = 300 + floors * 62
  return paintSprite(300, height, GROUND_ANCHOR, (ctx, w, h) => {
    const groundY = h - 10
    const left = w * 0.14
    const right = w * 0.8
    const top = h * 0.06
    const depth = w * 0.14

    contactShadow(ctx, w * 0.5, groundY, w * 0.44, h * 0.014, 0.32)

    // Side wall in shadow, drawn first so the facade overlaps it cleanly.
    fillPoly(
      ctx,
      [
        [right, top + depth * 0.5],
        [right + depth, top],
        [right + depth, groundY - depth * 0.4],
        [right, groundY],
      ],
      shade(palette.wall, -0.34),
    )
    // Roof cap.
    fillPoly(
      ctx,
      [
        [left, top + depth * 0.5],
        [left + depth, top],
        [right + depth, top],
        [right, top + depth * 0.5],
      ],
      shade(palette.wall, -0.12),
    )
    // Facade.
    ctx.fillStyle = verticalGradient(ctx, top, groundY, [
      [0, shade(palette.wall, 0.1)],
      [1, shade(palette.wall, -0.12)],
    ])
    ctx.fillRect(left, top + depth * 0.5, right - left, groundY - top - depth * 0.5)

    // Windows: warm interiors, a few dark, with a glass highlight.
    const cols = 3
    const colWidth = (right - left) / (cols + 0.6)
    const rowHeight = (groundY - top - depth * 0.5) / (floors + 0.8)
    for (let r = 0; r < floors; r++) {
      for (let c = 0; c < cols; c++) {
        const lit = (r * 7 + c * 5 + Math.floor(seedScale * 11)) % 4 !== 0
        const x = left + colWidth * (c + 0.45)
        const y = top + depth * 0.5 + rowHeight * (r + 0.6)
        fillRoundedRect(
          ctx,
          x,
          y,
          colWidth * 0.62,
          rowHeight * 0.58,
          4,
          lit ? palette.windowLit : palette.windowDark,
        )
        ctx.globalAlpha = 0.32
        fillPoly(
          ctx,
          [
            [x, y + rowHeight * 0.58],
            [x + colWidth * 0.3, y],
            [x + colWidth * 0.62, y],
            [x + colWidth * 0.62, y + rowHeight * 0.2],
            [x + colWidth * 0.22, y + rowHeight * 0.58],
          ],
          '#ffffff',
        )
        ctx.globalAlpha = 1
      }
    }

    // Ground-floor shopfront grounds the building on the street.
    fillRoundedRect(
      ctx,
      left + colWidth * 0.3,
      groundY - rowHeight * 1.05,
      (right - left) - colWidth * 0.6,
      rowHeight * 0.95,
      6,
      palette.storefront,
    )
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    ctx.fillRect(left + colWidth * 0.3, groundY - rowHeight * 1.05, (right - left) - colWidth * 0.6, rowHeight * 0.16)
  })
}

interface BuildingPalette {
  readonly wall: string
  readonly windowLit: string
  readonly windowDark: string
  readonly storefront: string
}

const CITY_BUILDING: BuildingPalette = {
  wall: '#6d6484',
  windowLit: '#ffd48a',
  windowDark: '#2f2b41',
  storefront: '#3c3552',
}

const SEASIDE_BUILDING: BuildingPalette = {
  wall: '#e8d3b0',
  windowLit: '#fff0c4',
  windowDark: '#5b6f80',
  storefront: '#c25b4a',
}

function paintChalet(): Sprite {
  return paintSprite(340, 300, GROUND_ANCHOR, (ctx, w, h) => {
    const groundY = h - 12
    const left = w * 0.16
    const right = w * 0.84
    const eaves = h * 0.42
    const ridge = h * 0.1

    contactShadow(ctx, w * 0.54, groundY, w * 0.42, h * 0.05, 0.34)

    // Timber walls.
    ctx.fillStyle = verticalGradient(ctx, eaves, groundY, [
      [0, '#c07a4a'],
      [1, '#8a5230'],
    ])
    ctx.fillRect(left, eaves, right - left, groundY - eaves)
    ctx.strokeStyle = 'rgba(70,38,18,0.3)'
    ctx.lineWidth = 2.5
    for (let i = 1; i < 5; i++) {
      const y = eaves + ((groundY - eaves) / 5) * i
      ctx.beginPath()
      ctx.moveTo(left, y)
      ctx.lineTo(right, y)
      ctx.stroke()
    }

    // Warm windows and a door.
    fillRoundedRect(ctx, left + w * 0.08, eaves + h * 0.08, w * 0.16, h * 0.14, 4, '#ffd48a')
    fillRoundedRect(ctx, right - w * 0.24, eaves + h * 0.08, w * 0.16, h * 0.14, 4, '#ffd48a')
    fillRoundedRect(ctx, w * 0.44, groundY - h * 0.22, w * 0.14, h * 0.22, 4, '#5c3a22')

    // Deep overhanging roof with a heavy snow load.
    const roof: Point[] = [
      [left - w * 0.1, eaves + h * 0.04],
      [w * 0.5, ridge],
      [right + w * 0.1, eaves + h * 0.04],
      [right + w * 0.06, eaves + h * 0.1],
      [left - w * 0.06, eaves + h * 0.1],
    ]
    fillPoly(ctx, roof, '#8c3b30')
    ctx.beginPath()
    ctx.moveTo(left - w * 0.1, eaves + h * 0.04)
    ctx.lineTo(w * 0.5, ridge)
    ctx.lineTo(right + w * 0.1, eaves + h * 0.04)
    scallopedEdge(ctx, right + w * 0.1, left - w * 0.1, eaves + h * 0.04, 7, h * 0.05)
    ctx.closePath()
    ctx.fillStyle = verticalGradient(ctx, ridge, eaves + h * 0.1, [
      [0, '#ffffff'],
      [1, '#d8e8f8'],
    ])
    ctx.fill()

    // Chimney with its own cap.
    ctx.fillStyle = '#6f4433'
    ctx.fillRect(w * 0.66, ridge + h * 0.02, w * 0.09, h * 0.16)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(w * 0.645, ridge + h * 0.02, w * 0.12, h * 0.035)
  })
}

function paintRock(seedScale: number, snowy: boolean): Sprite {
  return paintSprite(280, 220, GROUND_ANCHOR, (ctx, w, h) => {
    const groundY = h - 10
    const spread = w * (0.36 + seedScale * 0.08)
    const peak = h * (0.2 + (1 - seedScale) * 0.1)

    contactShadow(ctx, w * 0.54, groundY, spread * 1.15, h * 0.06, 0.34)

    const body: Point[] = [
      [w * 0.5 - spread, groundY],
      [w * 0.5 - spread * 0.82, groundY - h * 0.34],
      [w * 0.5 - spread * 0.3, peak],
      [w * 0.5 + spread * 0.28, peak + h * 0.06],
      [w * 0.5 + spread * 0.9, groundY - h * 0.28],
      [w * 0.5 + spread, groundY],
    ]
    fillPoly(ctx, body, verticalGradient(ctx, peak, groundY, [
      [0, '#9aa3b0'],
      [1, '#5f6875'],
    ]))

    // Facets: one lit plane catching the key light, one deep in shade.
    fillPoly(
      ctx,
      [
        [w * 0.5 - spread * 0.82, groundY - h * 0.34],
        [w * 0.5 - spread * 0.3, peak],
        [w * 0.5 - spread * 0.02, groundY - h * 0.2],
        [w * 0.5 - spread * 0.55, groundY - h * 0.05],
      ],
      'rgba(255,255,255,0.24)',
    )
    fillPoly(
      ctx,
      [
        [w * 0.5 + spread * 0.28, peak + h * 0.06],
        [w * 0.5 + spread * 0.9, groundY - h * 0.28],
        [w * 0.5 + spread, groundY],
        [w * 0.5 + spread * 0.2, groundY],
      ],
      'rgba(24,38,60,0.28)',
    )

    if (snowy) {
      ctx.save()
      tracePoly(ctx, body)
      ctx.clip()
      ctx.beginPath()
      ctx.moveTo(w * 0.5 - spread, groundY - h * 0.26)
      ctx.quadraticCurveTo(w * 0.5 - spread * 0.4, peak - h * 0.04, w * 0.5 + spread * 0.3, peak + h * 0.04)
      ctx.quadraticCurveTo(w * 0.5 + spread * 0.7, groundY - h * 0.4, w * 0.5 + spread, groundY - h * 0.16)
      scallopedEdge(ctx, w * 0.5 + spread, w * 0.5 - spread, groundY - h * 0.2, 5, h * 0.1)
      ctx.closePath()
      ctx.fillStyle = verticalGradient(ctx, peak, groundY, [
        [0, '#ffffff'],
        [1, '#d4e6f8'],
      ])
      ctx.fill()
      ctx.restore()
    }
  })
}

function paintCactus(seedScale: number): Sprite {
  return paintSprite(240, 400, GROUND_ANCHOR, (ctx, w, h) => {
    const groundY = h - 10
    const cx = w * 0.48
    const trunkW = w * 0.19
    const trunkTop = h * (0.14 + seedScale * 0.08)

    contactShadow(ctx, cx + 16, groundY, w * 0.3, h * 0.03, 0.3)

    const green = verticalGradient(ctx, trunkTop, groundY, [
      [0, '#59a35a'],
      [1, '#2f6c3c'],
    ])
    fillRoundedRect(ctx, cx - trunkW / 2, trunkTop, trunkW, groundY - trunkTop, trunkW / 2, green)

    // Arms: elbow up, capped like the trunk.
    const arm = (dir: 1 | -1, atY: number, reach: number): void => {
      const armW = trunkW * 0.78
      const elbowX = cx + dir * (trunkW * 0.5 + reach)
      fillRoundedRect(ctx, Math.min(cx, elbowX), atY, Math.abs(elbowX - cx) + armW * 0.5, armW, armW / 2, green)
      fillRoundedRect(ctx, elbowX - armW / 2, atY - h * 0.2, armW, h * 0.24, armW / 2, green)
    }
    arm(-1, h * (0.44 + seedScale * 0.05), w * 0.16)
    arm(1, h * (0.56 - seedScale * 0.05), w * 0.13)

    // Ribs and a rim of afternoon light down the left edge.
    ctx.strokeStyle = 'rgba(20,60,32,0.35)'
    ctx.lineWidth = 3
    for (const offset of [-0.3, 0, 0.3]) {
      ctx.beginPath()
      ctx.moveTo(cx + trunkW * offset, trunkTop + h * 0.03)
      ctx.lineTo(cx + trunkW * offset, groundY - h * 0.02)
      ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(210,255,190,0.5)'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(cx - trunkW * 0.36, trunkTop + h * 0.04)
    ctx.lineTo(cx - trunkW * 0.36, groundY - h * 0.03)
    ctx.stroke()
  })
}

function paintStreetlight(): Sprite {
  return paintSprite(220, 460, GROUND_ANCHOR, (ctx, w, h) => {
    const groundY = h - 10
    const x = w * 0.32

    contactShadow(ctx, x + 18, groundY, w * 0.22, h * 0.016, 0.3)

    ctx.strokeStyle = '#3a3a44'
    ctx.lineWidth = w * 0.075
    ctx.beginPath()
    ctx.moveTo(x, groundY)
    ctx.lineTo(x, h * 0.16)
    ctx.quadraticCurveTo(x, h * 0.08, x + w * 0.26, h * 0.08)
    ctx.stroke()

    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    ctx.lineWidth = w * 0.02
    ctx.beginPath()
    ctx.moveTo(x - w * 0.02, groundY - h * 0.02)
    ctx.lineTo(x - w * 0.02, h * 0.18)
    ctx.stroke()

    // Lamp head and its glow.
    fillPoly(
      ctx,
      [
        [x + w * 0.18, h * 0.08],
        [x + w * 0.38, h * 0.08],
        [x + w * 0.33, h * 0.14],
        [x + w * 0.23, h * 0.14],
      ],
      '#2c2c33',
    )
    const glow = ctx.createRadialGradient(x + w * 0.28, h * 0.15, 0, x + w * 0.28, h * 0.15, w * 0.34)
    glow.addColorStop(0, 'rgba(255,225,150,0.85)')
    glow.addColorStop(1, 'rgba(255,225,150,0)')
    ellipse(ctx, x + w * 0.28, h * 0.15, w * 0.34, w * 0.34, glow)

    // Base plate.
    fillRoundedRect(ctx, x - w * 0.09, groundY - h * 0.03, w * 0.18, h * 0.03, 3, '#33333c')
  })
}

function paintBuoy(): Sprite {
  return paintSprite(200, 260, GROUND_ANCHOR, (ctx, w, h) => {
    const cx = w * 0.5
    const waterline = h - h * 0.1

    // Water ring instead of a ground shadow — it is floating.
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.ellipse(cx, waterline, w * 0.42, h * 0.05, 0, 0, Math.PI * 2)
    ctx.stroke()

    fillPoly(
      ctx,
      [
        [cx, h * 0.12],
        [cx - w * 0.26, waterline],
        [cx + w * 0.26, waterline],
      ],
      verticalGradient(ctx, h * 0.12, waterline, [
        [0, '#ff7a5c'],
        [1, '#c9301f'],
      ]),
    )
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fillRect(cx - w * 0.2, h * 0.44, w * 0.4, h * 0.1)
    ctx.fillStyle = 'rgba(255,255,255,0.28)'
    fillPoly(
      ctx,
      [
        [cx, h * 0.12],
        [cx - w * 0.1, waterline],
        [cx - w * 0.02, waterline],
      ],
      'rgba(255,255,255,0.3)',
    )
    // Beacon.
    ellipse(ctx, cx, h * 0.1, w * 0.06, w * 0.06, '#ffe9a8')
  })
}

function paintReed(seedScale: number): Sprite {
  return paintSprite(240, 300, GROUND_ANCHOR, (ctx, w, h) => {
    const groundY = h - 8
    ctx.lineCap = 'round'
    for (let i = -3; i <= 3; i++) {
      const baseX = w * 0.5 + i * w * 0.07
      const lean = i * 0.05 + (seedScale - 0.5) * 0.2
      const tipX = baseX + lean * w * 0.9
      const tipY = h * (0.14 + Math.abs(i) * 0.05)
      ctx.strokeStyle = i % 2 === 0 ? '#4f8f3f' : '#3f7a34'
      ctx.lineWidth = w * 0.028
      ctx.beginPath()
      ctx.moveTo(baseX, groundY)
      ctx.quadraticCurveTo(baseX + lean * w * 0.3, h * 0.5, tipX, tipY)
      ctx.stroke()
      // Seed head on the taller stems.
      if (Math.abs(i) < 2) {
        ctx.strokeStyle = '#8a6a3a'
        ctx.lineWidth = w * 0.05
        ctx.beginPath()
        ctx.moveTo(tipX, tipY)
        ctx.lineTo(tipX + lean * w * 0.06, tipY + h * 0.09)
        ctx.stroke()
      }
    }
  })
}

function paintFlag(accent: string): Sprite {
  return paintSprite(220, 380, GROUND_ANCHOR, (ctx, w, h) => {
    const groundY = h - 10
    const x = w * 0.34

    contactShadow(ctx, x + 14, groundY, w * 0.2, h * 0.016, 0.28)

    ctx.strokeStyle = '#d8dce4'
    ctx.lineWidth = w * 0.05
    ctx.beginPath()
    ctx.moveTo(x, groundY)
    ctx.lineTo(x, h * 0.08)
    ctx.stroke()

    // Pennant with a slight wind curve.
    ctx.beginPath()
    ctx.moveTo(x, h * 0.09)
    ctx.quadraticCurveTo(x + w * 0.36, h * 0.14, x + w * 0.56, h * 0.2)
    ctx.quadraticCurveTo(x + w * 0.3, h * 0.28, x, h * 0.32)
    ctx.closePath()
    ctx.fillStyle = accent
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.28)'
    ctx.beginPath()
    ctx.moveTo(x, h * 0.09)
    ctx.quadraticCurveTo(x + w * 0.36, h * 0.14, x + w * 0.56, h * 0.2)
    ctx.quadraticCurveTo(x + w * 0.32, h * 0.2, x, h * 0.19)
    ctx.closePath()
    ctx.fill()
  })
}

/** Trail marker in the reference: a yellow diamond on a short post. */
function paintTrailSign(accent: string): Sprite {
  return paintSprite(220, 330, GROUND_ANCHOR, (ctx, w, h) => {
    const groundY = h - 10
    const cx = w * 0.44

    contactShadow(ctx, cx + 14, groundY, w * 0.22, h * 0.018, 0.3)

    ctx.strokeStyle = '#6f5334'
    ctx.lineWidth = w * 0.06
    ctx.beginPath()
    ctx.moveTo(cx, groundY)
    ctx.lineTo(cx, h * 0.3)
    ctx.stroke()

    const size = w * 0.3
    const cy = h * 0.26
    fillPoly(
      ctx,
      [
        [cx, cy - size],
        [cx + size, cy],
        [cx, cy + size],
        [cx - size, cy],
      ],
      accent,
    )
    ctx.lineWidth = w * 0.03
    ctx.strokeStyle = 'rgba(60,40,10,0.55)'
    tracePoly(ctx, [
      [cx, cy - size],
      [cx + size, cy],
      [cx, cy + size],
      [cx - size, cy],
    ])
    ctx.stroke()
    fillPoly(
      ctx,
      [
        [cx, cy - size],
        [cx + size, cy],
        [cx, cy],
      ],
      'rgba(255,255,255,0.3)',
    )
    // Snow settled on the upper faces.
    fillPoly(
      ctx,
      [
        [cx, cy - size],
        [cx + size * 0.55, cy - size * 0.45],
        [cx, cy - size * 0.3],
        [cx - size * 0.55, cy - size * 0.45],
      ],
      'rgba(255,255,255,0.9)',
    )
  })
}

export type SceneryArtKind =
  | 'pine'
  | 'palm'
  | 'building'
  | 'streetlight'
  | 'rock'
  | 'buoy'
  | 'cactus'
  | 'flag'
  | 'reed'

export interface SceneryArtOptions {
  readonly snowy: boolean
  readonly seaside: boolean
  readonly accent: string
}

/** Three painted variants per kind — enough that a hillside never visibly tiles. */
export function paintSceneryVariants(
  kind: SceneryArtKind,
  options: SceneryArtOptions,
): Sprite[] {
  const seeds = [0.18, 0.5, 0.86]
  switch (kind) {
    case 'pine':
      return seeds.map((seed) =>
        paintConifer(options.snowy ? SNOW_CONIFER : BARE_CONIFER, seed),
      )
    case 'palm':
      return seeds.map(paintPalm)
    case 'building':
      return [
        paintBuilding(seeds[0], options.seaside ? SEASIDE_BUILDING : CITY_BUILDING),
        paintBuilding(seeds[1], options.seaside ? SEASIDE_BUILDING : CITY_BUILDING),
        options.snowy ? paintChalet() : paintBuilding(seeds[2], options.seaside ? SEASIDE_BUILDING : CITY_BUILDING),
      ]
    case 'streetlight':
      return [paintStreetlight()]
    case 'rock':
      return seeds.map((seed) => paintRock(seed, options.snowy))
    case 'buoy':
      return [paintBuoy()]
    case 'cactus':
      return seeds.map(paintCactus)
    case 'flag':
      return options.snowy
        ? [paintTrailSign(options.accent), paintFlag(options.accent), paintTrailSign(mixHex(options.accent, '#ffffff', 0.3))]
        : [paintFlag(options.accent), paintFlag(mixHex(options.accent, '#ffffff', 0.25))]
    case 'reed':
      return seeds.map(paintReed)
  }
}
