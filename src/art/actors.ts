import {
  ellipse,
  fillPoly,
  fillRoundedRect,
  paintSprite,
  shade,
  verticalGradient,
  type Point,
  type Sprite,
} from './canvas'
import type { LevelId } from '../game/types'

/**
 * The player, painted from behind.
 *
 * Poses are baked rather than rotated: a carving snowboarder does not simply
 * tilt, they drop a hip, angle the board on edge, and counter-rotate their
 * shoulders. Five lean frames plus an air frame is enough to read as animation
 * while staying cheap — the renderer picks a frame from carve and adds only a
 * small residual rotation on top.
 */

/** Lean values the frames are baked at, most negative (hard left) first. */
export const LEAN_FRAMES = [-1, -0.5, 0, 0.5, 1] as const

export interface ActorFrames {
  /** Grounded poses, indexed to match `LEAN_FRAMES`. */
  readonly grounded: readonly Sprite[]
  readonly air: Sprite
  /**
   * Fraction of the sprite's height that sits above the contact point. Used to
   * keep the actor the right size relative to the run regardless of pose.
   */
  readonly heightRatio: number
}

interface RiderStyle {
  readonly jacket: string
  readonly jacketDark: string
  readonly trouser: string
  readonly helmet: string
  readonly skin: string
  readonly deck: string
  readonly deckDark: string
  readonly ride: 'board' | 'deck' | 'skates'
}

const ACTOR_WIDTH = 340
const ACTOR_HEIGHT = 380

/** Tapered limb. Straight lines make a figure look like a signpost. */
function limb(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  bend: number,
  widthFrom: number,
  widthTo: number,
  color: string,
): void {
  const mx = (from[0] + to[0]) / 2
  const my = (from[1] + to[1]) / 2
  const nx = -(to[1] - from[1])
  const ny = to[0] - from[0]
  const len = Math.hypot(nx, ny) || 1
  const cx = mx + (nx / len) * bend
  const cy = my + (ny / len) * bend
  const ux = nx / len
  const uy = ny / len

  ctx.beginPath()
  ctx.moveTo(from[0] + ux * widthFrom, from[1] + uy * widthFrom)
  ctx.quadraticCurveTo(cx + ux * widthTo, cy + uy * widthTo, to[0] + ux * widthTo, to[1] + uy * widthTo)
  ctx.lineTo(to[0] - ux * widthTo, to[1] - uy * widthTo)
  ctx.quadraticCurveTo(cx - ux * widthTo, cy - uy * widthTo, from[0] - ux * widthFrom, from[1] - uy * widthFrom)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

function paintRider(style: RiderStyle, lean: number, airborne: boolean): Sprite {
  return paintSprite(ACTOR_WIDTH, ACTOR_HEIGHT, { x: 0.5, y: 0.94 }, (ctx, w, h) => {
    const cx = w * 0.5
    const contactY = h * 0.94
    // Carving pushes the whole rider inside the turn while the board edges up.
    const boardTilt = lean * 0.42
    const hipX = cx - lean * w * 0.1
    // A rider stands in a crouch, never straight-legged: hips sit low over the
    // board and drop further the harder the carve.
    const hipY = contactY - h * (airborne ? 0.3 : 0.25 - Math.abs(lean) * 0.02)
    // Shoulders lead the hips down the fall line, which is what stops the whole
    // figure reading as a scarecrow stood upright on a plank.
    const shoulderX = hipX - lean * w * 0.03
    const shoulderY = hipY - h * (airborne ? 0.18 : 0.2)
    const headY = shoulderY - h * 0.075

    // --- Ride ---------------------------------------------------------------
    ctx.save()
    ctx.translate(cx + lean * w * 0.02, contactY - h * 0.02)
    ctx.rotate(boardTilt)

    if (style.ride === 'skates') {
      for (const side of [-1, 1] as const) {
        const bx = side * w * 0.13
        fillRoundedRect(ctx, bx - w * 0.075, -h * 0.05, w * 0.15, h * 0.05, 5, style.deck)
        fillRoundedRect(ctx, bx - w * 0.065, -h * 0.005, w * 0.13, h * 0.016, 3, style.deckDark)
        for (const t of [-0.6, -0.2, 0.2, 0.6]) {
          ellipse(ctx, bx + t * w * 0.058, h * 0.018, w * 0.017, w * 0.017, '#23242b')
        }
      }
    } else {
      const halfW = w * 0.34
      const halfH = h * 0.022
      // Deck / board, seen in strong foreshortening.
      ctx.beginPath()
      ctx.moveTo(-halfW, 0)
      ctx.quadraticCurveTo(0, -halfH * 2.1, halfW, 0)
      ctx.quadraticCurveTo(0, halfH * 2.1, -halfW, 0)
      ctx.closePath()
      ctx.fillStyle = verticalGradient(ctx, -halfH * 2, halfH * 2, [
        [0, shade(style.deck, 0.3)],
        [1, style.deckDark],
      ])
      ctx.fill()
      // The edge biting into the surface — the whole reason a carve reads.
      ctx.beginPath()
      ctx.moveTo(-halfW, 0)
      ctx.quadraticCurveTo(0, halfH * 2.1, halfW, 0)
      ctx.lineWidth = h * 0.011
      ctx.strokeStyle = lean === 0 ? 'rgba(20,40,70,0.4)' : 'rgba(255,255,255,0.9)'
      ctx.stroke()
      // Graphic stripe down the deck.
      ctx.beginPath()
      ctx.moveTo(-halfW * 0.7, -halfH * 0.2)
      ctx.quadraticCurveTo(0, -halfH * 1.2, halfW * 0.7, -halfH * 0.2)
      ctx.lineWidth = h * 0.009
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.stroke()

      if (style.ride === 'deck') {
        for (const bx of [-0.62, 0.62]) {
          ellipse(ctx, bx * halfW, halfH * 1.5, w * 0.028, w * 0.028, '#e8e2d4')
          ellipse(ctx, bx * halfW, halfH * 1.5, w * 0.013, w * 0.013, '#8a8478')
        }
      } else {
        // Bindings.
        for (const bx of [-0.34, 0.3]) {
          fillRoundedRect(ctx, bx * halfW - w * 0.035, -halfH * 1.5, w * 0.07, halfH * 2.4, 4, '#2a2f3a')
        }
      }
    }
    ctx.restore()

    // --- Legs ---------------------------------------------------------------
    const footL: Point = [cx - w * 0.11 + lean * w * 0.02, contactY - h * 0.045]
    const footR: Point = [cx + w * 0.1 + lean * w * 0.02, contactY - h * 0.045]
    const kneeBend = airborne ? w * 0.055 : w * 0.04 + Math.abs(lean) * w * 0.02
    limb(ctx, [hipX - w * 0.045, hipY], footL, -kneeBend, w * 0.05, w * 0.036, style.trouser)
    limb(ctx, [hipX + w * 0.045, hipY], footR, kneeBend, w * 0.05, w * 0.036, shade(style.trouser, -0.12))

    // Boots.
    fillRoundedRect(ctx, footL[0] - w * 0.045, footL[1] - h * 0.012, w * 0.09, h * 0.032, 5, '#25282f')
    fillRoundedRect(ctx, footR[0] - w * 0.045, footR[1] - h * 0.012, w * 0.09, h * 0.032, 5, '#1e2128')

    // --- Torso --------------------------------------------------------------
    const torso: Point[] = [
      [hipX - w * 0.075, hipY + h * 0.01],
      [shoulderX - w * 0.105, shoulderY],
      [shoulderX + w * 0.105, shoulderY],
      [hipX + w * 0.075, hipY + h * 0.01],
    ]
    ctx.beginPath()
    ctx.moveTo(torso[0][0], torso[0][1])
    ctx.quadraticCurveTo(shoulderX - w * 0.13, (hipY + shoulderY) / 2, torso[1][0], torso[1][1])
    ctx.quadraticCurveTo(shoulderX, shoulderY - h * 0.03, torso[2][0], torso[2][1])
    ctx.quadraticCurveTo(shoulderX + w * 0.13, (hipY + shoulderY) / 2, torso[3][0], torso[3][1])
    ctx.closePath()
    ctx.fillStyle = verticalGradient(ctx, shoulderY - h * 0.03, hipY, [
      [0, style.jacket],
      [1, style.jacketDark],
    ])
    ctx.fill()

    // Hood bunched at the collar and a hem band — silhouette detail at any size.
    ellipse(ctx, shoulderX, shoulderY + h * 0.005, w * 0.1, h * 0.026, shade(style.jacket, -0.2))
    fillRoundedRect(ctx, hipX - w * 0.078, hipY - h * 0.012, w * 0.156, h * 0.026, 5, shade(style.jacket, -0.3))
    // Lit edge on the upwind side.
    ctx.beginPath()
    ctx.moveTo(torso[0][0] + w * 0.012, hipY)
    ctx.quadraticCurveTo(shoulderX - w * 0.118, (hipY + shoulderY) / 2, torso[1][0] + w * 0.012, shoulderY)
    ctx.lineWidth = w * 0.016
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'
    ctx.stroke()

    // --- Arms ---------------------------------------------------------------
    // Trailing arm swings out to counter the turn; leading arm reaches inside.
    // Grounded arms hang forward and down in a relaxed guard rather than
    // straight out sideways; only air pulls them wide for balance.
    const outer: Point = airborne
      ? [shoulderX + w * 0.26, shoulderY - h * 0.09]
      : [shoulderX + w * (0.17 + lean * 0.07), shoulderY + h * (0.1 - lean * 0.05)]
    const inner: Point = airborne
      ? [shoulderX - w * 0.24, shoulderY - h * 0.02]
      : [shoulderX - w * (0.15 - lean * 0.07), shoulderY + h * (0.13 + lean * 0.05)]
    limb(ctx, [shoulderX + w * 0.09, shoulderY + h * 0.015], outer, w * 0.03, w * 0.035, w * 0.026, style.jacket)
    limb(ctx, [shoulderX - w * 0.09, shoulderY + h * 0.015], inner, -w * 0.03, w * 0.035, w * 0.026, style.jacketDark)
    // Gloves.
    ellipse(ctx, outer[0], outer[1], w * 0.032, w * 0.032, '#2a2f3a')
    ellipse(ctx, inner[0], inner[1], w * 0.032, w * 0.032, '#2a2f3a')

    // --- Head ---------------------------------------------------------------
    const headR = w * 0.072
    // Neck.
    fillRoundedRect(ctx, shoulderX - w * 0.028, headY, w * 0.056, h * 0.03, 4, style.skin)
    ellipse(
      ctx,
      shoulderX,
      headY,
      headR,
      headR * 1.02,
      verticalGradient(ctx, headY - headR, headY + headR, [
        [0, shade(style.helmet, 0.32)],
        [1, shade(style.helmet, -0.2)],
      ]),
    )
    // Goggle strap across the back of the helmet.
    ctx.beginPath()
    ctx.ellipse(shoulderX, headY - headR * 0.1, headR * 1.01, headR * 0.28, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#1d2431'
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(shoulderX, headY - headR * 0.1, headR * 1.01, headR * 0.1, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(120,200,255,0.55)'
    ctx.fill()
    // Helmet highlight.
    ctx.beginPath()
    ctx.ellipse(shoulderX - headR * 0.34, headY - headR * 0.42, headR * 0.34, headR * 0.2, -0.5, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.fill()
  })
}

interface VehicleStyle {
  readonly body: string
  readonly trim: string
  readonly helmet: string
  /** Body width as a fraction of the sprite. Karts are narrow, rally cars wide. */
  readonly bodyWidth: number
  readonly roofed: boolean
}

function paintVehicle(style: VehicleStyle, lean: number, airborne: boolean): Sprite {
  return paintSprite(ACTOR_WIDTH, ACTOR_HEIGHT, { x: 0.5, y: 0.94 }, (ctx, w, h) => {
    const cx = w * 0.5
    const contactY = h * 0.94
    // Body roll: the chassis leans out of the turn on its suspension.
    const roll = lean * 0.13
    const halfW = w * style.bodyWidth
    const wheelY = contactY - h * 0.045
    const bodyBottom = contactY - h * 0.05
    const bodyTop = bodyBottom - h * (style.roofed ? 0.16 : 0.13)
    const roofTop = bodyTop - h * (style.roofed ? 0.13 : 0)

    ctx.save()
    ctx.translate(cx, contactY)
    ctx.rotate(roll)
    ctx.translate(-cx, -contactY)

    // Rear wheels, splayed slightly by the roll.
    for (const side of [-1, 1] as const) {
      const wx = cx + side * halfW * 0.96
      const squash = airborne ? 1 : 1 - side * lean * 0.1
      ellipse(ctx, wx, wheelY, w * 0.06, h * 0.062 * squash, '#15161a')
      ellipse(ctx, wx, wheelY, w * 0.03, h * 0.03 * squash, '#a8b0bd')
      ellipse(ctx, wx - w * 0.012, wheelY - h * 0.015, w * 0.014, h * 0.012, 'rgba(255,255,255,0.4)')
    }

    // Chassis.
    ctx.beginPath()
    ctx.moveTo(cx - halfW, bodyBottom)
    ctx.lineTo(cx - halfW * 0.88, bodyTop)
    ctx.quadraticCurveTo(cx, bodyTop - h * 0.02, cx + halfW * 0.88, bodyTop)
    ctx.lineTo(cx + halfW, bodyBottom)
    ctx.quadraticCurveTo(cx, bodyBottom + h * 0.02, cx - halfW, bodyBottom)
    ctx.closePath()
    ctx.fillStyle = verticalGradient(ctx, bodyTop - h * 0.02, bodyBottom, [
      [0, shade(style.body, 0.32)],
      [0.55, style.body],
      [1, shade(style.body, -0.3)],
    ])
    ctx.fill()

    if (style.roofed) {
      // Cabin and rear glass.
      fillPoly(
        ctx,
        [
          [cx - halfW * 0.72, bodyTop],
          [cx - halfW * 0.56, roofTop],
          [cx + halfW * 0.56, roofTop],
          [cx + halfW * 0.72, bodyTop],
        ],
        shade(style.body, -0.12),
      )
      fillPoly(
        ctx,
        [
          [cx - halfW * 0.62, bodyTop - h * 0.012],
          [cx - halfW * 0.48, roofTop + h * 0.022],
          [cx + halfW * 0.48, roofTop + h * 0.022],
          [cx + halfW * 0.62, bodyTop - h * 0.012],
        ],
        '#16324e',
      )
      fillPoly(
        ctx,
        [
          [cx - halfW * 0.48, roofTop + h * 0.022],
          [cx - halfW * 0.05, roofTop + h * 0.022],
          [cx - halfW * 0.34, bodyTop - h * 0.012],
          [cx - halfW * 0.62, bodyTop - h * 0.012],
        ],
        'rgba(180,220,255,0.35)',
      )
    } else {
      // Open kart: roll hoop, seat back and driver.
      ctx.strokeStyle = shade(style.trim, -0.1)
      ctx.lineWidth = w * 0.026
      ctx.beginPath()
      ctx.moveTo(cx - halfW * 0.46, bodyTop)
      ctx.lineTo(cx - halfW * 0.36, bodyTop - h * 0.1)
      ctx.lineTo(cx + halfW * 0.36, bodyTop - h * 0.1)
      ctx.lineTo(cx + halfW * 0.46, bodyTop)
      ctx.stroke()
      fillRoundedRect(ctx, cx - halfW * 0.42, bodyTop - h * 0.09, halfW * 0.84, h * 0.09, 6, style.trim)
      const headR = w * 0.062
      ellipse(
        ctx,
        cx,
        bodyTop - h * 0.115,
        headR,
        headR,
        verticalGradient(ctx, bodyTop - h * 0.115 - headR, bodyTop - h * 0.115 + headR, [
          [0, shade(style.helmet, 0.3)],
          [1, shade(style.helmet, -0.2)],
        ]),
      )
      ctx.beginPath()
      ctx.ellipse(cx, bodyTop - h * 0.125, headR * 0.98, headR * 0.24, 0, 0, Math.PI * 2)
      ctx.fillStyle = '#1d2431'
      ctx.fill()
    }

    // Rear wing / spoiler.
    fillRoundedRect(ctx, cx - halfW * 0.8, bodyTop - h * 0.015, halfW * 1.6, h * 0.022, 4, style.trim)
    // Tail lights.
    fillRoundedRect(ctx, cx - halfW * 0.9, bodyBottom - h * 0.055, halfW * 0.26, h * 0.026, 4, '#ff5a4a')
    fillRoundedRect(ctx, cx + halfW * 0.64, bodyBottom - h * 0.055, halfW * 0.26, h * 0.026, 4, '#ff5a4a')
    // Shoulder highlight.
    ctx.strokeStyle = 'rgba(255,255,255,0.42)'
    ctx.lineWidth = h * 0.008
    ctx.beginPath()
    ctx.moveTo(cx - halfW * 0.84, bodyTop + h * 0.014)
    ctx.quadraticCurveTo(cx, bodyTop - h * 0.004, cx + halfW * 0.84, bodyTop + h * 0.014)
    ctx.stroke()

    ctx.restore()
  })
}

function paintBoat(lean: number, airborne: boolean): Sprite {
  return paintSprite(ACTOR_WIDTH, ACTOR_HEIGHT, { x: 0.5, y: 0.94 }, (ctx, w, h) => {
    const cx = w * 0.5
    const waterline = h * 0.94
    const roll = lean * 0.16
    const halfW = w * 0.3
    const deck = waterline - h * (airborne ? 0.1 : 0.075)

    ctx.save()
    ctx.translate(cx, waterline)
    ctx.rotate(roll)
    ctx.translate(-cx, -waterline)

    // Wake shoulders either side of the transom.
    if (!airborne) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      for (const side of [-1, 1] as const) {
        ctx.beginPath()
        ctx.moveTo(cx + side * halfW, waterline - h * 0.01)
        ctx.quadraticCurveTo(
          cx + side * halfW * 1.9,
          waterline - h * 0.05,
          cx + side * halfW * 2.4,
          waterline + h * 0.012,
        )
        ctx.quadraticCurveTo(cx + side * halfW * 1.6, waterline + h * 0.018, cx + side * halfW, waterline + h * 0.008)
        ctx.closePath()
        ctx.fill()
      }
    }

    // Transom and hull.
    ctx.beginPath()
    ctx.moveTo(cx - halfW, deck)
    ctx.lineTo(cx + halfW, deck)
    ctx.quadraticCurveTo(cx + halfW * 0.92, waterline, cx, waterline + h * 0.012)
    ctx.quadraticCurveTo(cx - halfW * 0.92, waterline, cx - halfW, deck)
    ctx.closePath()
    ctx.fillStyle = verticalGradient(ctx, deck, waterline, [
      [0, '#ffffff'],
      [1, '#c3d1e0'],
    ])
    ctx.fill()
    fillRoundedRect(ctx, cx - halfW, deck - h * 0.016, halfW * 2, h * 0.02, 4, '#2f6fd0')

    // Outboard.
    fillRoundedRect(ctx, cx - w * 0.03, deck + h * 0.004, w * 0.06, h * 0.055, 5, '#2b2f38')

    // Windshield and driver.
    fillPoly(
      ctx,
      [
        [cx - halfW * 0.62, deck - h * 0.016],
        [cx - halfW * 0.46, deck - h * 0.095],
        [cx + halfW * 0.46, deck - h * 0.095],
        [cx + halfW * 0.62, deck - h * 0.016],
      ],
      'rgba(170,215,245,0.85)',
    )
    ctx.strokeStyle = '#e6ecf4'
    ctx.lineWidth = w * 0.012
    ctx.stroke()
    const headR = w * 0.055
    ellipse(ctx, cx - lean * w * 0.02, deck - h * 0.105, headR, headR, '#ff4d6d')
    ellipse(ctx, cx - lean * w * 0.02, deck - h * 0.118, headR * 0.9, headR * 0.34, '#1d2431')

    ctx.restore()
  })
}

const SNOWBOARDER: RiderStyle = {
  jacket: '#e63946',
  jacketDark: '#b02434',
  trouser: '#2b4c8c',
  helmet: '#ff8c1a',
  skin: '#d9a06a',
  deck: '#2bb8f0',
  deckDark: '#12688f',
  ride: 'board',
}

const SKATER: RiderStyle = {
  jacket: '#ffd23f',
  jacketDark: '#d19d12',
  trouser: '#2b2b33',
  helmet: '#33c1a0',
  skin: '#c98b5e',
  deck: '#a9713f',
  deckDark: '#6d4523',
  ride: 'deck',
}

const BLADER: RiderStyle = {
  jacket: '#ff5f8d',
  jacketDark: '#c93a68',
  trouser: '#204a6e',
  helmet: '#f5f5f5',
  skin: '#8d5a3c',
  deck: '#f0f2f6',
  deckDark: '#9aa3b2',
  ride: 'skates',
}

const SURFER: RiderStyle = {
  jacket: '#20c4a8',
  jacketDark: '#12907c',
  trouser: '#12405e',
  helmet: '#2b2b33',
  skin: '#b97a4c',
  deck: '#fff6e0',
  deckDark: '#d3bd94',
  ride: 'board',
}

const KART: VehicleStyle = {
  body: '#ffd23f',
  trim: '#e03b3b',
  helmet: '#2f6fd0',
  bodyWidth: 0.2,
  roofed: false,
}

const RALLY_CAR: VehicleStyle = {
  body: '#ff7a29',
  trim: '#3a2a1c',
  helmet: '#f2f2f2',
  bodyWidth: 0.26,
  roofed: true,
}

/** Bakes every pose the renderer can ask for, once per run. */
export function paintActorFrames(level: LevelId): ActorFrames {
  const rider = (style: RiderStyle): ActorFrames => ({
    grounded: LEAN_FRAMES.map((lean) => paintRider(style, lean, false)),
    air: paintRider(style, 0, true),
    heightRatio: 0.94,
  })
  const vehicle = (style: VehicleStyle): ActorFrames => ({
    grounded: LEAN_FRAMES.map((lean) => paintVehicle(style, lean, false)),
    air: paintVehicle(style, 0, true),
    heightRatio: 0.94,
  })

  switch (level) {
    case 'snowboard':
      return rider(SNOWBOARDER)
    case 'skateboard':
      return rider(SKATER)
    case 'rollerblade':
      return rider(BLADER)
    case 'surf':
      return rider(SURFER)
    case 'gokart':
      return vehicle(KART)
    case 'car':
      return vehicle(RALLY_CAR)
    case 'boat':
      return {
        grounded: LEAN_FRAMES.map((lean) => paintBoat(lean, false)),
        air: paintBoat(0, true),
        heightRatio: 0.94,
      }
  }
}

/** Picks the baked frame closest to a signed lean, plus the residual to rotate. */
export function selectLeanFrame(frames: ActorFrames, lean: number): {
  sprite: Sprite
  residual: number
} {
  const clamped = Math.max(-1, Math.min(1, lean))
  let best = 0
  for (let i = 1; i < LEAN_FRAMES.length; i++) {
    if (Math.abs(LEAN_FRAMES[i] - clamped) < Math.abs(LEAN_FRAMES[best] - clamped)) best = i
  }
  return { sprite: frames.grounded[best], residual: clamped - LEAN_FRAMES[best] }
}
