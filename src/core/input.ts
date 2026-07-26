import { clamp } from './math'
import type { InputFrame } from '../game/contracts'
import type { SteeringSource } from './steering'

interface Pointer {
  id: number
  startX: number
  startY: number
  x: number
  y: number
  jumped: boolean
}

export interface DomInputFrame {
  input: InputFrame
  pause: boolean
}

/** Continuous touch intent combining screen-centred steering with relative drag. */
export function touchSteerFromPosition(
  x: number,
  startX: number,
  viewportWidth: number,
): number {
  const width = Math.max(1, viewportWidth)
  const half = width * 0.5
  const centred = (x - half) / (half * 0.82)
  const drag = (x - startX) / (width * 0.32)
  return clamp(centred * 0.72 + drag * 0.28, -1, 1)
}

/** Owns DOM input and exposes one renderer-neutral sample per animation frame. */
export class Input {
  private keys = new Set<string>()
  private pointers = new Map<number, Pointer>()
  private steeringPointerId: number | null = null
  private jumpQueued = false
  private pauseQueued = false
  private width = 1
  private height = 1
  private target: HTMLElement | null = null
  /** Set true once any touch is seen, so the UI can swap hints to touch wording. */
  touchSeen = false

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return
    const k = e.key.toLowerCase()
    if (JUMP_KEYS.has(k) || STEER_KEYS.has(k)) e.preventDefault()
    this.keys.add(k)
    if (JUMP_KEYS.has(k)) this.jumpQueued = true
    if (k === 'escape' || k === 'p') this.pauseQueued = true
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase())
  }

  private onBlur = (): void => {
    this.clear()
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (e.pointerType !== 'mouse') this.touchSeen = true
    const isSteeringPointer = this.steeringPointerId === null
    const pointer: Pointer = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      jumped: !isSteeringPointer,
    }
    if (isSteeringPointer) this.steeringPointerId = e.pointerId
    else this.jumpQueued = true
    this.pointers.set(e.pointerId, pointer)
    this.target?.setPointerCapture(e.pointerId)
  }

  private onPointerMove = (e: PointerEvent): void => {
    const pointer = this.pointers.get(e.pointerId)
    if (!pointer) return
    pointer.x = e.clientX
    pointer.y = e.clientY
    if (!pointer.jumped && pointer.startY - pointer.y > this.height * 0.08) {
      this.jumpQueued = true
      pointer.jumped = true
    }
  }

  private onPointerUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId)
    if (this.steeringPointerId === e.pointerId) {
      const promoted = this.pointers.values().next().value as Pointer | undefined
      if (promoted) {
        promoted.startX = promoted.x
        promoted.startY = promoted.y
        this.steeringPointerId = promoted.id
      } else {
        this.steeringPointerId = null
      }
    }
    if (this.target?.hasPointerCapture(e.pointerId)) {
      this.target.releasePointerCapture(e.pointerId)
    }
  }

  private onContextMenu = (e: Event): void => e.preventDefault()

  attach(target: HTMLElement): void {
    if (this.target === target) return
    this.detach()
    this.target = target
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    target.addEventListener('pointerdown', this.onPointerDown)
    target.addEventListener('pointermove', this.onPointerMove)
    target.addEventListener('pointerup', this.onPointerUp)
    target.addEventListener('pointercancel', this.onPointerUp)
    target.addEventListener('contextmenu', this.onContextMenu)
  }

  detach(): void {
    const target = this.target
    if (!target) return
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    target.removeEventListener('pointerdown', this.onPointerDown)
    target.removeEventListener('pointermove', this.onPointerMove)
    target.removeEventListener('pointerup', this.onPointerUp)
    target.removeEventListener('pointercancel', this.onPointerUp)
    target.removeEventListener('contextmenu', this.onContextMenu)
    for (const id of this.pointers.keys()) {
      if (target.hasPointerCapture(id)) target.releasePointerCapture(id)
    }
    this.target = null
    this.clear()
  }

  resize(width: number, height: number): void {
    this.width = width
    this.height = height
  }

  /** Sample held and edge-triggered controls exactly once per animation frame. */
  sample(): DomInputFrame {
    let rawSteer = 0
    let source: SteeringSource = 'release'
    if (this.keys.has('arrowleft') || this.keys.has('a')) rawSteer -= 1
    if (this.keys.has('arrowright') || this.keys.has('d')) rawSteer += 1
    if (rawSteer !== 0) source = 'keyboard'

    if (rawSteer === 0 && this.steeringPointerId !== null) {
      const pointer = this.pointers.get(this.steeringPointerId)
      if (pointer) {
        rawSteer = touchSteerFromPosition(pointer.x, pointer.startX, this.width)
        source = 'touch'
      }
    }

    const frame: DomInputFrame = {
      input: {
        steer: rawSteer,
        steerSource: source,
        jump: this.jumpQueued,
      },
      pause: this.pauseQueued,
    }
    this.jumpQueued = false
    this.pauseQueued = false
    return frame
  }

  clear(): void {
    this.jumpQueued = false
    this.pauseQueued = false
    this.steeringPointerId = null
    this.keys.clear()
    this.pointers.clear()
  }
}

const STEER_KEYS = new Set(['arrowleft', 'arrowright', 'a', 'd'])
const JUMP_KEYS = new Set([' ', 'spacebar', 'arrowup', 'w'])
