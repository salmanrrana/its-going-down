import './ui/styles.css'
import { audio } from './core/audio'
import { Input } from './core/input'
import { Game, type HudState, type RunStats } from './game/game'
import { getDifficulty, getLevel } from './game/levels'
import { Renderer } from './game/renderer'
import type { DifficultyId, LevelId } from './game/types'
import {
  Hud,
  loadProgress,
  Menu,
  Modal,
  runKey,
  saveProgress,
  type Progress,
} from './ui/screens'

type AppState = 'menu' | 'playing'

class App {
  private canvas: HTMLCanvasElement
  private renderer: Renderer
  private input = new Input()
  private menu: Menu
  private hud: Hud
  private modal: Modal
  private touchHints: HTMLElement

  private state: AppState = 'menu'
  private game: Game | null = null
  private progress: Progress
  private level: LevelId
  private difficulty: DifficultyId

  private lastFrame = 0
  private rafId = 0
  private hintTimer = 0

  constructor(root: HTMLElement) {
    this.progress = loadProgress()
    this.level = this.progress.lastLevel
    this.difficulty = this.progress.lastDifficulty
    audio.muted = this.progress.muted

    this.canvas = document.createElement('canvas')
    this.canvas.id = 'game-canvas'
    root.appendChild(this.canvas)
    this.renderer = new Renderer(this.canvas)

    this.touchHints = document.createElement('div')
    this.touchHints.className = 'touch-hints'
    this.touchHints.innerHTML = `
      <div class="touch-hints__half">◀</div>
      <div class="touch-hints__half">▶</div>
    `
    root.appendChild(this.touchHints)

    this.hud = new Hud(() => this.pause())
    root.appendChild(this.hud.root)
    root.appendChild(this.hud.countdownRoot)

    this.modal = new Modal({
      onResume: () => this.resume(),
      onRestart: () => this.startRun(),
      onQuit: () => this.toMenu(),
    })
    root.appendChild(this.modal.root)

    this.menu = new Menu({
      onSelectLevel: (id) => {
        this.level = id
        audio.unlock()
        audio.play('select')
        this.refreshMenu()
      },
      onSelectDifficulty: (id) => {
        this.difficulty = id
        audio.unlock()
        audio.play('select')
        this.refreshMenu()
      },
      onStart: () => this.startRun(),
      onToggleMute: () => {
        this.progress.muted = !this.progress.muted
        audio.unlock()
        audio.setMuted(this.progress.muted)
        saveProgress(this.progress)
        this.refreshMenu()
      },
    })
    root.appendChild(this.menu.root)

    this.input.attach(this.canvas)
    // The menu is DOM, so pause/jump keys must also work while it's up.
    window.addEventListener('keydown', this.onGlobalKey)
    window.addEventListener('resize', this.onResize)
    window.addEventListener('orientationchange', this.onResize)
    document.addEventListener('visibilitychange', this.onVisibility)

    this.onResize()
    this.refreshMenu()
    this.lastFrame = performance.now()
    this.rafId = requestAnimationFrame(this.loop)
  }

  private onGlobalKey = (e: KeyboardEvent): void => {
    if (this.state !== 'playing') {
      // Enter / Space from the menu drops straight into the run.
      if ((e.key === 'Enter' || e.key === ' ') && !this.modalOpen) {
        const active = document.activeElement
        // Don't hijack Enter when the player is tabbing through cards.
        if (!(active instanceof HTMLButtonElement)) {
          e.preventDefault()
          this.startRun()
        }
      }
      return
    }
    if (e.key === 'Escape' || e.key.toLowerCase() === 'p') {
      e.preventDefault()
      if (this.modalOpen) this.resume()
      else this.pause()
    }
  }

  private get modalOpen(): boolean {
    return !this.modal.root.hidden
  }

  private onResize = (): void => {
    this.renderer.resize()
    this.input.resize(window.innerWidth, window.innerHeight)
  }

  private onVisibility = (): void => {
    // Tab hidden mid-run: pause rather than let the player crash unseen.
    if (document.hidden && this.state === 'playing' && !this.modalOpen) {
      this.pause()
    }
  }

  private refreshMenu(): void {
    this.menu.update(this.level, this.difficulty, this.progress, this.input.touchSeen)
  }

  private startRun(): void {
    audio.unlock()
    audio.setMuted(this.progress.muted)
    this.progress.lastLevel = this.level
    this.progress.lastDifficulty = this.difficulty
    saveProgress(this.progress)

    const level = getLevel(this.level)
    const difficulty = getDifficulty(this.difficulty)
    // A fresh seed each run keeps the course from ever feeling memorised.
    const seed = (Math.random() * 0xffffffff) >>> 0

    this.game = new Game(
      level,
      difficulty,
      this.input,
      this.renderer,
      {
        onHudChange: (hud: HudState) => this.hud.update(hud),
        onEnd: (stats: RunStats) => this.onRunEnd(stats),
      },
      seed,
    )

    this.state = 'playing'
    this.input.clear()
    this.menu.root.hidden = true
    this.modal.hide()
    this.hud.show()
    audio.startMusic(level.musicKey)

    // Show the touch steering guides briefly on the first touch-device run.
    if (this.input.touchSeen || 'ontouchstart' in window) {
      this.touchHints.classList.add('touch-hints--show')
      this.hintTimer = 2.4
    }
  }

  private pause(): void {
    if (!this.game || this.state !== 'playing' || this.modalOpen) return
    this.game.pause()
    const level = getLevel(this.level)
    this.modal.showPause(level.name, `${level.flag} ${level.location}`)
  }

  private resume(): void {
    if (!this.game) return
    this.modal.hide()
    this.game.resume()
  }

  private onRunEnd(stats: RunStats): void {
    const key = runKey(this.level, this.difficulty)
    const previousBest = this.progress.bestScores[key] ?? 0
    const isBest = stats.score > previousBest
    if (isBest) this.progress.bestScores[key] = stats.score
    if (stats.completed && !this.progress.cleared.includes(key)) {
      this.progress.cleared.push(key)
    }
    saveProgress(this.progress)

    const level = getLevel(this.level)
    this.touchHints.classList.remove('touch-hints--show')
    // Let the finish/fail sting land before the modal covers the screen.
    window.setTimeout(() => {
      this.modal.showResults(
        stats,
        level.name,
        level.surface,
        isBest,
        Math.max(previousBest, stats.score),
      )
    }, 700)
  }

  private toMenu(): void {
    this.state = 'menu'
    this.game = null
    this.modal.hide()
    this.hud.hide()
    this.touchHints.classList.remove('touch-hints--show')
    audio.stopMusic()
    audio.setSpeed(0, false)
    this.menu.root.hidden = false
    this.refreshMenu()
    this.menu.focusStart()
  }

  private loop = (now: number): void => {
    this.rafId = requestAnimationFrame(this.loop)
    // Clamp dt so a backgrounded tab can't teleport the player on return.
    const dt = Math.min((now - this.lastFrame) / 1000, 1 / 20)
    this.lastFrame = now

    this.renderer.resize()

    if (this.hintTimer > 0) {
      this.hintTimer -= dt
      if (this.hintTimer <= 0) {
        this.touchHints.classList.remove('touch-hints--show')
      }
    }

    if (this.state === 'playing' && this.game) {
      this.game.update(dt)
      this.game.render()
      if (this.input.consumePause() && !this.modalOpen) this.pause()
    } else {
      this.renderMenuBackdrop(dt)
    }
  }

  /**
   * The menu isn't a static page — the selected level runs behind the glass as
   * a slow attract-mode flythrough, so picking a card previews the world.
   */
  private attract: Game | null = null
  private attractLevel: LevelId | null = null

  private renderMenuBackdrop(dt: number): void {
    if (this.attractLevel !== this.level || !this.attract) {
      this.attractLevel = this.level
      this.attract = new Game(
        getLevel(this.level),
        getDifficulty('easy'),
        new Input(),
        this.renderer,
        { onHudChange: () => {}, onEnd: () => {} },
        1337,
        { attract: true },
      )
    }
    this.attract.update(dt * 0.55)
    this.attract.render()
  }

  destroy(): void {
    cancelAnimationFrame(this.rafId)
    window.removeEventListener('keydown', this.onGlobalKey)
    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('orientationchange', this.onResize)
    document.removeEventListener('visibilitychange', this.onVisibility)
  }
}

const root = document.getElementById('app')
if (!root) throw new Error('Missing #app root element')
new App(root)
