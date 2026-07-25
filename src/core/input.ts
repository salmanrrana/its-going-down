/**
 * Unified input. Everything the game needs collapses to three numbers:
 *   steer  -1..1
 *   jump   edge-triggered boolean
 *   pause  edge-triggered boolean
 *
 * Keyboard: arrows / WASD, Space or Up to jump.
 * Touch: hold the left or right half of the screen to steer. Drag your thumb
 *        to steer proportionally. A quick tap with a second finger, or a swipe
 *        up, jumps. Designed so a 4-year-old can just mash a side and go.
 */

interface Pointer {
  id: number
  startX: number
  startY: number
  x: number
  y: number
  startTime: number
  jumped: boolean
}

export class Input {
  steer = 0
  private keys = new Set<string>()
  private pointers = new Map<number, Pointer>()
  private jumpQueued = false
  private pauseQueued = false
  private width = 1
  private height = 1
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
    this.keys.clear()
    this.pointers.clear()
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
    // Second finger down while one is already steering = jump.
    if (this.pointers.size > 0) {
      this.jumpQueued = true
      p.jumped = true
    }
    this.pointers.set(e.pointerId, p)
  }

  private onPointerMove = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId)
    if (!p) return
    p.x = e.clientX
    p.y = e.clientY
    // Swipe up to jump.
    if (!p.jumped && p.startY - p.y > this.height * 0.08) {
      this.jumpQueued = true
      p.jumped = true
    }
  }

  private onPointerUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId)
  }

  private onContextMenu = (e: Event): void => e.preventDefault()

  attach(target: HTMLElement): void {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    target.addEventListener('pointerdown', this.onPointerDown)
    target.addEventListener('pointermove', this.onPointerMove)
    target.addEventListener('pointerup', this.onPointerUp)
    target.addEventListener('pointercancel', this.onPointerUp)
    target.addEventListener('contextmenu', this.onContextMenu)
  }

  resize(width: number, height: number): void {
    this.width = width
    this.height = height
  }

  /** Call once per frame, before reading `steer`. */
  update(): void {
    let s = 0
    if (this.keys.has('arrowleft') || this.keys.has('a')) s -= 1
    if (this.keys.has('arrowright') || this.keys.has('d')) s += 1

    if (s === 0 && this.pointers.size > 0) {
      // Use the oldest active pointer as the steering thumb.
      let thumb: Pointer | null = null
      for (const p of this.pointers.values()) {
        if (!thumb || p.startTime < thumb.startTime) thumb = p
      }
      if (thumb) {
        const half = this.width * 0.5
        // Blend "which half am I holding" with "how far did I drag", so both
        // a static hold and a deliberate drag feel right.
        const side = thumb.x < half ? -1 : 1
        const drag = (thumb.x - thumb.startX) / (this.width * 0.22)
        const held = (thumb.x - half) / (half * 0.75)
        s = Math.abs(drag) > 0.25 ? drag : held
        if (Math.abs(s) < 0.15) s = side * 0.15
      }
    }
    this.steer = Math.max(-1, Math.min(1, s))
  }

  consumeJump(): boolean {
    const j = this.jumpQueued
    this.jumpQueued = false
    return j
  }

  consumePause(): boolean {
    const p = this.pauseQueued
    this.pauseQueued = false
    return p
  }

  clear(): void {
    this.jumpQueued = false
    this.pauseQueued = false
    this.keys.clear()
    this.pointers.clear()
    this.steer = 0
  }
}

const STEER_KEYS = new Set(['arrowleft', 'arrowright', 'a', 'd'])
const JUMP_KEYS = new Set([' ', 'spacebar', 'arrowup', 'w'])
