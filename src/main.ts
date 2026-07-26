import './ui/styles.css'
import { audio } from './core/audio'
import { FixedStepClock, TickInputBuffer } from './core/fixed-step'
import { Input } from './core/input'
import type { GameEvent, InputFrame } from './game/contracts'
import { Game, type RunStats } from './game/game'
import { getDifficulty, getLevel } from './game/levels'
import { Renderer } from './game/renderer'
import { resolveRunSelection, RunFixtureError } from './game/run-fixture'
import type { DifficultyId, LevelId } from './game/types'
import {
  Hud,
  loadProgress,
  Menu,
  Modal,
  resolvePersistenceIssue,
  runKey,
  saveProgress,
  type Progress,
  type ProgressPersistenceIssue,
} from './ui/screens'

type AppState = 'menu' | 'playing'

class App {
  private canvas: HTMLCanvasElement
  private renderer: Renderer
  private input = new Input()
  private clock = new FixedStepClock()
  private menu: Menu
  private hud: Hud
  private modal: Modal
  private touchHints: HTMLElement

  private state: AppState = 'menu'
  private game: Game | null = null
  private progress: Progress
  private level: LevelId
  private difficulty: DifficultyId
  private readonly fixtureSeed: number | null
  private persistenceIssue: ProgressPersistenceIssue | null

  private lastFrame = 0
  private rafId = 0
  private hintTimer = 0
  private tickInput = new TickInputBuffer()

  constructor(root: HTMLElement) {
    const loaded = loadProgress()
    this.progress = loaded.progress
    this.persistenceIssue = loaded.issue
    const selection = resolveRunSelection(window.location.search, {
      level: this.progress.lastLevel,
      difficulty: this.progress.lastDifficulty,
    })
    this.level = selection.level
    this.difficulty = selection.difficulty
    this.fixtureSeed = selection.seed
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
        this.persistProgress()
        this.refreshMenu()
      },
    })
    root.appendChild(this.menu.root)

    this.input.attach(this.canvas)
    window.addEventListener('keydown', this.onGlobalKey)
    window.addEventListener('resize', this.onResize)
    window.addEventListener('orientationchange', this.onResize)
    document.addEventListener('visibilitychange', this.onVisibility)

    this.onResize()
    this.refreshMenu()
    this.resetTiming()
    this.rafId = requestAnimationFrame(this.loop)
  }

  private onGlobalKey = (e: KeyboardEvent): void => {
    if (this.state === 'playing') return
    if ((e.key === 'Enter' || e.key === ' ') && !this.modalOpen) {
      const active = document.activeElement
      if (!(active instanceof HTMLButtonElement)) {
        e.preventDefault()
        this.startRun()
      }
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
    this.resetTiming()
    if (document.hidden && this.state === 'playing' && !this.modalOpen) {
      this.pause()
    }
  }

  private persistProgress(): void {
    this.persistenceIssue = resolvePersistenceIssue(
      this.persistenceIssue,
      saveProgress(this.progress),
    )
  }

  private resetTiming(): void {
    this.lastFrame = performance.now()
    this.clock.reset()
  }

  private refreshMenu(): void {
    this.menu.update(this.level, this.difficulty, this.progress, this.input.touchSeen)
  }

  private startRun(): void {
    audio.unlock()
    audio.setMuted(this.progress.muted)
    this.progress.lastLevel = this.level
    this.progress.lastDifficulty = this.difficulty
    this.persistProgress()

    const level = getLevel(this.level)
    const difficulty = getDifficulty(this.difficulty)
    // Normal runs stay fresh; browser automation can pin the course via query params.
    const seed = this.fixtureSeed ?? (Math.random() * 0xffffffff) >>> 0
    this.game = new Game(level, difficulty, seed)

    this.state = 'playing'
    this.tickInput.clear()
    this.input.clear()
    this.menu.root.hidden = true
    this.modal.hide()
    this.hud.show()
    audio.startMusic(level.musicKey)
    this.resetTiming()

    if (this.input.touchSeen || 'ontouchstart' in window) {
      this.touchHints.classList.add('touch-hints--show')
      this.hintTimer = 2.4
    }
  }

  private pause(): void {
    if (
      !this.game ||
      this.state !== 'playing' ||
      this.modalOpen ||
      (this.game.currentPhase !== 'running' && this.game.currentPhase !== 'countdown')
    ) {
      return
    }
    this.dispatchGameEvents(this.game.pause())
    this.tickInput.clear()
    this.input.clear()
    this.resetTiming()
    const level = getLevel(this.level)
    this.modal.showPause(level.name, `${level.flag} ${level.location}`)
  }

  private resume(): void {
    if (!this.game || !this.modalOpen) return
    this.modal.hide()
    this.tickInput.clear()
    this.input.clear()
    this.dispatchGameEvents(this.game.resume())
    this.resetTiming()
  }

  private dispatchGameEvents(events: GameEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case 'hud-changed':
          this.hud.update(event.hud)
          break
        case 'run-ended':
          this.onRunEnd(event.stats)
          break
        case 'sound':
          audio.play(event.sound)
          break
        case 'audio-speed':
          audio.setSpeed(event.speed01, event.active)
          break
        case 'music':
          if (event.action === 'start') audio.startMusic(event.key)
          else audio.stopMusic()
          break
        case 'view-effect':
          this.renderer.handleEffect(event.effect)
          break
        default:
          assertNever(event)
      }
    }
  }

  private onRunEnd(stats: RunStats): void {
    const key = runKey(this.level, this.difficulty)
    const previousBest = this.progress.bestScores[key] ?? 0
    const isBest = stats.score > previousBest
    if (isBest) this.progress.bestScores[key] = stats.score
    if (stats.completed && !this.progress.cleared.includes(key)) {
      this.progress.cleared.push(key)
    }
    this.persistProgress()

    const level = getLevel(this.level)
    this.touchHints.classList.remove('touch-hints--show')
    window.setTimeout(() => {
      this.modal.showResults(
        stats,
        level.name,
        level.surface,
        isBest,
        Math.max(previousBest, stats.score),
        this.persistenceIssue?.message ?? null,
      )
    }, 700)
  }

  private toMenu(): void {
    this.state = 'menu'
    this.game = null
    this.tickInput.clear()
    this.input.clear()
    this.modal.hide()
    this.hud.hide()
    this.touchHints.classList.remove('touch-hints--show')
    audio.stopMusic()
    audio.setSpeed(0, false)
    this.menu.root.hidden = false
    this.refreshMenu()
    this.menu.focusStart()
    this.resetTiming()
  }

  private loop = (now: number): void => {
    this.rafId = requestAnimationFrame(this.loop)
    const elapsed = Math.max(0, (now - this.lastFrame) / 1000)
    this.lastFrame = now

    this.renderer.resize()
    const sampled = this.input.sample()

    if (this.hintTimer > 0) {
      this.hintTimer -= elapsed
      if (this.hintTimer <= 0) {
        this.touchHints.classList.remove('touch-hints--show')
      }
    }

    if (this.state === 'playing' && this.game) {
      if (sampled.pause) {
        if (this.game.currentPhase === 'paused') this.resume()
        else if (!this.modalOpen) this.pause()
        this.renderer.render(this.game.previousSnapshot, this.game.currentSnapshot, 1)
        return
      }
      this.renderGameFrame(elapsed, sampled.input)
    } else {
      this.renderMenuBackdrop(elapsed)
    }
  }

  private renderGameFrame(elapsed: number, sampled: InputFrame): void {
    const game = this.game
    if (!game) return
    this.tickInput.sample(sampled)

    if (this.modalOpen) {
      this.renderer.render(game.previousSnapshot, game.currentSnapshot, 1)
      return
    }

    const result = this.clock.advance(elapsed, (dt) => {
      this.dispatchGameEvents(game.update(dt, this.tickInput.consume()))
      this.renderer.update(dt)
    })
    this.renderer.render(game.previousSnapshot, game.currentSnapshot, result.alpha)
  }

  private attract: Game | null = null
  private attractLevel: LevelId | null = null

  private renderMenuBackdrop(elapsed: number): void {
    if (this.attractLevel !== this.level || !this.attract) {
      this.attractLevel = this.level
      this.attract = new Game(getLevel(this.level), getDifficulty('easy'), 1337, {
        attract: true,
      })
      this.clock.reset()
    }

    const attract = this.attract
    const result = this.clock.advance(elapsed * 0.55, (dt) => {
      this.dispatchGameEvents(attract.update(dt))
      this.renderer.update(dt)
    })
    this.renderer.render(attract.previousSnapshot, attract.currentSnapshot, result.alpha)
  }

  destroy(): void {
    cancelAnimationFrame(this.rafId)
    this.input.detach()
    window.removeEventListener('keydown', this.onGlobalKey)
    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('orientationchange', this.onResize)
    document.removeEventListener('visibilitychange', this.onVisibility)
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled game event: ${JSON.stringify(value)}`)
}

const root = document.getElementById('app')
if (!root) throw new Error('Missing #app root element')
try {
  new App(root)
} catch (error) {
  if (!(error instanceof RunFixtureError)) throw error

  console.error('Invalid deterministic run fixture.', {
    search: window.location.search,
    error,
  })
  const screen = document.createElement('main')
  screen.className = 'screen screen--menu fixture-error'
  const title = document.createElement('h1')
  title.className = 'title'
  title.textContent = 'Invalid run link'
  const detail = document.createElement('p')
  detail.className = 'subtitle'
  detail.textContent = `${error.message} Fix the URL and reload.`
  screen.append(title, detail)
  root.replaceChildren(screen)
}
