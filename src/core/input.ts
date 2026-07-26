import type { InputFrame } from '../game/contracts'

interface Pointer {
  id: number
  startX: number
  startY: number
  x: number
  y: number
  startTime: number
  jumped: boolean
}

export interface DomInputFrame {
  input: InputFrame
  pause: boolean
}

/** Owns DOM input and exposes one renderer-neutral sample per animation frame. */
export class Input {
  private keys = new Set<string>()
  private pointers = new Map<number, Pointer>()
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
    const p: Pointer = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      startTime: performance.now(),
      jumped: false,
    }
    if (this.pointers.size > 0) {
      this.jumpQueued = true
      p.jumped = true
    }
    this.pointers.set(e.pointerId, p)
    this.target?.setPointerCapture(e.pointerId)
  }

  private onPointerMove = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId)
    if (!p) return
    p.x = e.clientX
    p.y = e.clientY
    if (!p.jumped && p.startY - p.y > this.height * 0.08) {
      this.jumpQueued = true
      p.jumped = true
    }
  }

  private onPointerUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId)
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
    let steer = 0
    if (this.keys.has('arrowleft') || this.keys.has('a')) steer -= 1
    if (this.keys.has('arrowright') || this.keys.has('d')) steer += 1

    if (steer === 0 && this.pointers.size > 0) {
      let thumb: Pointer | null = null
      for (const p of this.pointers.values()) {
        if (!thumb || p.startTime < thumb.startTime) thumb = p
      }
      if (thumb) {
        const half = this.width * 0.5
        const side = thumb.x < half ? -1 : 1
        const drag = (thumb.x - thumb.startX) / (this.width * 0.22)
        const held = (thumb.x - half) / (half * 0.75)
        steer = Math.abs(drag) > 0.25 ? drag : held
        if (Math.abs(steer) < 0.15) steer = side * 0.15
      }
    }

    const frame: DomInputFrame = {
      input: {
        steer: Math.max(-1, Math.min(1, steer)),
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
    this.keys.clear()
    this.pointers.clear()
  }
}

const STEER_KEYS = new Set(['arrowleft', 'arrowright', 'a', 'd'])
const JUMP_KEYS = new Set([' ', 'spacebar', 'arrowup', 'w'])
