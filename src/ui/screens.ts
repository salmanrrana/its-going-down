import { DIFFICULTIES, isDifficultyId, isLevelId, LEVELS } from '../game/levels'
import type { DifficultyId, LevelId } from '../game/types'
import type { HudState, RunStats } from '../game/game'

/** Persisted between sessions so kids resume where they left off. */
export interface Progress {
  bestScores: Partial<Record<string, number>>
  cleared: string[]
  lastLevel: LevelId
  lastDifficulty: DifficultyId
  muted: boolean
}

export const PROGRESS_STORAGE_KEY = 'its-going-down/progress/v1'

export function runKey(level: LevelId, difficulty: DifficultyId): string {
  return `${level}:${difficulty}`
}

const VALID_RUN_KEYS = new Set(
  LEVELS.flatMap((level) =>
    DIFFICULTIES.map((difficulty) => runKey(level.id, difficulty.id)),
  ),
)

export type ProgressPersistenceIssue = {
  kind: 'storage-unavailable' | 'malformed-data' | 'save-failed'
  message: string
  error: unknown
}

export interface LoadProgressResult {
  progress: Progress
  issue: ProgressPersistenceIssue | null
}

export type SaveProgressResult =
  | { ok: true }
  | { ok: false; issue: ProgressPersistenceIssue }

export function resolvePersistenceIssue(
  current: ProgressPersistenceIssue | null,
  saveResult: SaveProgressResult,
): ProgressPersistenceIssue | null {
  if (!saveResult.ok) return saveResult.issue
  return current?.kind === 'save-failed' ? null : current
}

const createDefaultProgress = (): Progress => ({
  bestScores: {},
  cleared: [],
  lastLevel: 'snowboard',
  lastDifficulty: 'easy',
  muted: false,
})

const createPersistenceIssue = (
  kind: ProgressPersistenceIssue['kind'],
  message: string,
  error: unknown,
): ProgressPersistenceIssue => {
  const issue = { kind, message, error }
  console.warn(`[progress:${kind}] ${message}`, {
    storageKey: PROGRESS_STORAGE_KEY,
    error,
  })
  return issue
}

export function loadProgress(): LoadProgressResult {
  const fallback = createDefaultProgress()
  let raw: string | null
  try {
    raw = localStorage.getItem(PROGRESS_STORAGE_KEY)
  } catch (error) {
    const issue = createPersistenceIssue(
      'storage-unavailable',
      'Progress storage is unavailable; using defaults.',
      error,
    )
    return { progress: fallback, issue }
  }
  if (raw === null) return { progress: fallback, issue: null }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new TypeError('Stored progress must be a JSON object.')
    }
  } catch (error) {
    const issue = createPersistenceIssue(
      'malformed-data',
      'Saved progress is malformed; using defaults.',
      error,
    )
    return { progress: fallback, issue }
  }

  const stored = parsed as Partial<Progress>
  // Storage is user-writable, so retain only real run keys and finite,
  // non-negative scores that the game could have produced.
  const bestScores: Partial<Record<string, number>> = {}
  if (stored.bestScores && typeof stored.bestScores === 'object') {
    for (const [key, value] of Object.entries(stored.bestScores)) {
      if (
        VALID_RUN_KEYS.has(key) &&
        typeof value === 'number' &&
        Number.isSafeInteger(value) &&
        value >= 0
      ) {
        bestScores[key] = value
      }
    }
  }

  const cleared = Array.isArray(stored.cleared)
    ? [...new Set(stored.cleared.filter(
      (key): key is string => typeof key === 'string' && VALID_RUN_KEYS.has(key),
    ))]
    : []

  return {
    progress: {
      bestScores,
      cleared,
      lastLevel: isLevelId(stored.lastLevel) ? stored.lastLevel : fallback.lastLevel,
      lastDifficulty: isDifficultyId(stored.lastDifficulty)
        ? stored.lastDifficulty
        : fallback.lastDifficulty,
      muted: stored.muted === true,
    },
    issue: null,
  }
}

export function saveProgress(p: Progress): SaveProgressResult {
  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(p))
    return { ok: true }
  } catch (error) {
    const issue = createPersistenceIssue(
      'save-failed',
      'Progress could not be saved on this device.',
      error,
    )
    return { ok: false, issue }
  }
}

const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export interface MenuCallbacks {
  onSelectLevel: (id: LevelId) => void
  onSelectDifficulty: (id: DifficultyId) => void
  onStart: () => void
  onToggleMute: () => void
}

export class Menu {
  readonly root: HTMLElement
  private levelButtons = new Map<LevelId, HTMLButtonElement>()
  private diffButtons = new Map<DifficultyId, HTMLButtonElement>()
  private startBtn: HTMLButtonElement
  private hint: HTMLElement
  private muteBtn: HTMLButtonElement

  constructor(private callbacks: MenuCallbacks) {
    const root = document.createElement('div')
    root.className = 'screen screen--menu'
    root.innerHTML = `
      <div class="menu-tools">
        <button class="icon-btn" data-role="mute" aria-label="Toggle sound">🔊</button>
      </div>
      <div class="title-block">
        <h1 class="title">It's<em>Going Down</em></h1>
        <p class="subtitle">Seven sports · Seven places · One direction</p>
      </div>
      <div class="section">
        <h2 class="section__label"><span class="section__step">1</span>Pick your ride</h2>
        <div class="level-grid" data-role="levels"></div>
      </div>
      <div class="section">
        <h2 class="section__label"><span class="section__step">2</span>Pick your difficulty</h2>
        <div class="difficulty-grid" data-role="difficulties"></div>
      </div>
      <div class="start-row">
        <button class="btn btn--primary" data-role="start">▶ Drop In</button>
        <p class="start-hint" data-role="hint"></p>
      </div>
    `
    this.root = root

    const levelGrid = root.querySelector('[data-role="levels"]') as HTMLElement
    LEVELS.forEach((level, i) => {
      const btn = document.createElement('button')
      btn.className = 'card'
      btn.type = 'button'
      btn.style.setProperty('--delay', `${i * 0.045}s`)
      btn.style.setProperty('--card-accent', level.palette.accent)
      btn.setAttribute('aria-pressed', 'false')
      btn.innerHTML = `
        <span class="card__glyph">${level.glyph}</span>
        <span class="card__name">${level.name}</span>
        <span class="card__location">${level.flag} ${level.location}</span>
        <span class="card__tagline">${level.tagline}</span>
        <span class="card__badge" data-role="best" hidden></span>
      `
      btn.addEventListener('click', () => this.callbacks.onSelectLevel(level.id))
      this.levelButtons.set(level.id, btn)
      levelGrid.appendChild(btn)
    })

    const diffGrid = root.querySelector('[data-role="difficulties"]') as HTMLElement
    DIFFICULTIES.forEach((diff) => {
      const btn = document.createElement('button')
      btn.className = 'diff'
      btn.type = 'button'
      btn.setAttribute('aria-pressed', 'false')
      btn.innerHTML = `
        <span class="diff__glyph">${diff.glyph}</span>
        <span>
          <span class="diff__name">${diff.name}</span>
          <span class="diff__blurb">${diff.blurb}</span>
        </span>
      `
      btn.addEventListener('click', () => this.callbacks.onSelectDifficulty(diff.id))
      this.diffButtons.set(diff.id, btn)
      diffGrid.appendChild(btn)
    })

    this.startBtn = root.querySelector('[data-role="start"]') as HTMLButtonElement
    this.startBtn.addEventListener('click', () => this.callbacks.onStart())
    this.hint = root.querySelector('[data-role="hint"]') as HTMLElement
    this.muteBtn = root.querySelector('[data-role="mute"]') as HTMLButtonElement
    this.muteBtn.addEventListener('click', () => this.callbacks.onToggleMute())
  }

  update(
    level: LevelId,
    difficulty: DifficultyId,
    progress: Progress,
    touch: boolean,
  ): void {
    for (const [id, btn] of this.levelButtons) {
      btn.setAttribute('aria-pressed', String(id === level))
      const badge = btn.querySelector('[data-role="best"]') as HTMLElement
      const best = progress.bestScores[runKey(id, difficulty)]
      if (best) {
        badge.hidden = false
        badge.textContent = `Best ${best.toLocaleString()}`
      } else {
        badge.hidden = true
      }
    }
    for (const [id, btn] of this.diffButtons) {
      btn.setAttribute('aria-pressed', String(id === difficulty))
    }
    this.muteBtn.textContent = progress.muted ? '🔇' : '🔊'
    this.muteBtn.setAttribute(
      'aria-label',
      progress.muted ? 'Unmute sound' : 'Mute sound',
    )

    const jump = difficulty === 'easy' ? '' : touch
      ? ' Swipe up or tap with a second finger to jump.'
      : ' Press <kbd>Space</kbd> to jump.'
    this.hint.innerHTML = touch
      ? `Hold the left or right side of the screen to steer.${jump}`
      : `Steer with <kbd>←</kbd> <kbd>→</kbd> or <kbd>A</kbd> <kbd>D</kbd>.${jump}`
  }

  focusStart(): void {
    this.startBtn.focus()
  }
}

export class Hud {
  readonly root: HTMLElement
  private scoreEl: HTMLElement
  private coinsEl: HTMLElement
  private speedEl: HTMLElement
  private timeEl: HTMLElement
  private livesEl: HTMLElement
  private progressFill: HTMLElement
  private progressLabel: HTMLElement
  private comboEl: HTMLElement
  private countdownEl: HTMLElement
  private countdownNum: HTMLElement
  private lastCombo = 0
  private lastCountdown: number | null = null

  constructor(onPause: () => void) {
    const root = document.createElement('div')
    root.className = 'hud'
    root.hidden = true
    root.innerHTML = `
      <div class="hud__top">
        <div class="hud__panel">
          <span class="hud__label">Score</span>
          <span class="hud__value" data-role="score">0</span>
        </div>
        <div class="hud__panel">
          <span class="hud__label">Coins</span>
          <span class="hud__value hud__value--sm" data-role="coins">0</span>
          <span class="hud__lives" data-role="lives"></span>
        </div>
        <div class="hud__panel">
          <span class="hud__label">Speed</span>
          <span class="hud__value" data-role="speed">0</span>
        </div>
        <button class="hud__pause" data-role="pause" aria-label="Pause">❚❚</button>
      </div>
      <div class="hud__bottom">
        <div class="progress"><div class="progress__fill" data-role="fill"></div></div>
        <div class="progress__meta">
          <span data-role="progress-label">Start</span>
          <span data-role="time">0:00</span>
        </div>
      </div>
      <div class="combo" data-role="combo"></div>
    `
    this.root = root
    this.scoreEl = root.querySelector('[data-role="score"]') as HTMLElement
    this.coinsEl = root.querySelector('[data-role="coins"]') as HTMLElement
    this.speedEl = root.querySelector('[data-role="speed"]') as HTMLElement
    this.timeEl = root.querySelector('[data-role="time"]') as HTMLElement
    this.livesEl = root.querySelector('[data-role="lives"]') as HTMLElement
    this.progressFill = root.querySelector('[data-role="fill"]') as HTMLElement
    this.progressLabel = root.querySelector('[data-role="progress-label"]') as HTMLElement
    this.comboEl = root.querySelector('[data-role="combo"]') as HTMLElement
    ;(root.querySelector('[data-role="pause"]') as HTMLButtonElement).addEventListener(
      'click',
      onPause,
    )

    const countdown = document.createElement('div')
    countdown.className = 'countdown'
    countdown.hidden = true
    countdown.innerHTML = `<div class="countdown__num" data-role="num">3</div>`
    this.countdownEl = countdown
    this.countdownNum = countdown.querySelector('[data-role="num"]') as HTMLElement
  }

  get countdownRoot(): HTMLElement {
    return this.countdownEl
  }

  show(): void {
    this.root.hidden = false
  }

  hide(): void {
    this.root.hidden = true
    this.countdownEl.hidden = true
  }

  update(hud: HudState): void {
    this.scoreEl.textContent = hud.score.toLocaleString()
    this.coinsEl.textContent = `🪙 ${hud.coins}`
    this.speedEl.textContent = String(hud.speedKph)
    this.timeEl.textContent = formatTime(hud.timeSeconds)
    this.progressFill.style.width = `${(hud.progress01 * 100).toFixed(1)}%`
    this.progressLabel.textContent =
      hud.progress01 > 0.985 ? 'Finish!' : `${Math.floor(hud.progress01 * 100)}% down`

    if (hud.maxLives > 0) {
      const wanted = hud.maxLives
      if (this.livesEl.childElementCount !== wanted) {
        this.livesEl.innerHTML = Array.from(
          { length: wanted },
          () => `<span class="hud__life">❤️</span>`,
        ).join('')
      }
      this.livesEl.childNodes.forEach((node, i) => {
        ;(node as HTMLElement).classList.toggle('hud__life--lost', i >= hud.lives)
      })
    } else if (this.livesEl.childElementCount !== 0) {
      this.livesEl.innerHTML = ''
    }

    if (hud.combo > 1 && hud.combo !== this.lastCombo) {
      this.comboEl.textContent = `${hud.combo}× COMBO`
      this.comboEl.classList.remove('combo--pop')
      // Force reflow so the animation restarts on every new combo tier.
      void this.comboEl.offsetWidth
      this.comboEl.classList.add('combo--pop')
    }
    this.lastCombo = hud.combo

    if (hud.countdown !== this.lastCountdown) {
      this.lastCountdown = hud.countdown
      if (hud.countdown === null || hud.countdown <= 0) {
        this.countdownEl.hidden = true
      } else {
        this.countdownEl.hidden = false
        this.countdownNum.textContent = String(hud.countdown)
        this.countdownNum.style.animation = 'none'
        void this.countdownNum.offsetWidth
        this.countdownNum.style.animation = ''
      }
    }
  }
}

export interface ModalCallbacks {
  onResume: () => void
  onRestart: () => void
  onQuit: () => void
}

export class Modal {
  readonly root: HTMLElement
  private card: HTMLElement

  constructor(private callbacks: ModalCallbacks) {
    const root = document.createElement('div')
    root.className = 'modal'
    root.hidden = true
    root.innerHTML = `<div class="modal__card" data-role="card"></div>`
    this.root = root
    this.card = root.querySelector('[data-role="card"]') as HTMLElement
  }

  hide(): void {
    this.root.hidden = true
  }

  showPause(levelName: string, location: string): void {
    this.card.innerHTML = `
      <p class="modal__eyebrow">Paused</p>
      <h2 class="modal__title">${levelName}</h2>
      <p class="modal__sub">${location}</p>
      <div class="modal__actions">
        <button class="btn btn--primary" data-role="resume">▶ Keep Going</button>
        <button class="btn btn--ghost" data-role="restart">↻ Restart Run</button>
        <button class="btn btn--ghost" data-role="quit">✕ Change Level</button>
      </div>
    `
    this.wire()
    this.root.hidden = false
  }

  showResults(
    stats: RunStats,
    levelName: string,
    surface: string,
    isBest: boolean,
    best: number,
    persistenceWarning: string | null = null,
  ): void {
    const won = stats.completed
    this.card.innerHTML = `
      <p class="modal__eyebrow">${won ? 'Run complete' : 'Run over'}</p>
      <h2 class="modal__title ${won ? 'modal__title--win' : 'modal__title--lose'}">
        ${won ? 'You made it!' : 'Wipeout!'}
      </h2>
      <p class="modal__sub">
        ${
          won
            ? `You rode the whole ${surface} on ${levelName}.`
            : `You got ${Math.floor(stats.progress01 * 100)}% down the ${surface}. Go again!`
        }
      </p>
      <div class="stats">
        <div class="stat stat--wide">
          <div class="stat__label">${isBest ? '★ New best score' : 'Score'}</div>
          <div class="stat__value ${isBest ? 'stat__value--gold' : ''}">
            ${stats.score.toLocaleString()}
          </div>
        </div>
        <div class="stat">
          <div class="stat__label">Coins</div>
          <div class="stat__value">${stats.coins}</div>
        </div>
        <div class="stat">
          <div class="stat__label">Best air</div>
          <div class="stat__value">${stats.bestAir.toFixed(1)}s</div>
        </div>
        <div class="stat">
          <div class="stat__label">Time</div>
          <div class="stat__value">${formatTime(stats.timeSeconds)}</div>
        </div>
        <div class="stat">
          <div class="stat__label">Crashes</div>
          <div class="stat__value">${stats.hits}</div>
        </div>
        ${
          best > stats.score
            ? `<div class="stat stat--wide">
                 <div class="stat__label">Your best on this run</div>
                 <div class="stat__value stat__value--gold">${best.toLocaleString()}</div>
               </div>`
            : ''
        }
      </div>
      ${persistenceWarning ? `<p class="modal__warning">${persistenceWarning}</p>` : ''}
      <div class="modal__actions">
        <button class="btn btn--primary" data-role="restart">↻ Go Again</button>
        <button class="btn btn--ghost" data-role="quit">✕ Change Level</button>
      </div>
    `
    this.wire()
    this.root.hidden = false
  }

  private wire(): void {
    const resume = this.card.querySelector('[data-role="resume"]')
    resume?.addEventListener('click', () => this.callbacks.onResume())
    const restart = this.card.querySelector('[data-role="restart"]')
    restart?.addEventListener('click', () => this.callbacks.onRestart())
    const quit = this.card.querySelector('[data-role="quit"]')
    quit?.addEventListener('click', () => this.callbacks.onQuit())
    // Put focus on the primary action so keyboard players can just hit Enter.
    ;(this.card.querySelector('.btn--primary') as HTMLButtonElement | null)?.focus()
  }
}
