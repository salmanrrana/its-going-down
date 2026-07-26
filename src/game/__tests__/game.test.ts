import { describe, expect, it } from 'vitest'
import { FIXED_STEP_SECONDS, FixedStepClock } from '../../core/fixed-step'
import type { GameEvent, InputFrame } from '../contracts'
import { Game } from '../game'
import { getDifficulty, getLevel } from '../levels'
import type { DifficultyDef } from '../types'

const level = getLevel('snowboard')
const difficulty = getDifficulty('medium')
const noInput: InputFrame = { steer: 0, jump: false }

function advanceTicks(game: Game, count: number, input = noInput): GameEvent[] {
  const events: GameEvent[] = []
  for (let i = 0; i < count; i++) {
    events.push(...game.update(FIXED_STEP_SECONDS, input))
  }
  return events
}

function simulateAtCadence(fps: number, seconds: number): Game {
  const game = new Game(level, difficulty, 2468)
  const clock = new FixedStepClock()
  const frames = fps * seconds
  for (let frame = 0; frame < frames; frame++) {
    clock.advance(1 / fps, (dt) => {
      game.update(dt, { steer: 0.45, jump: false })
    })
  }
  return game
}

describe('Game simulation contracts', () => {
  it('keeps track and level references while exposing adjacent snapshots', () => {
    const game = new Game(level, difficulty, 123)
    const initial = game.currentSnapshot

    game.update(FIXED_STEP_SECONDS, noInput)

    expect(game.previousSnapshot).toBe(initial)
    expect(game.currentSnapshot).not.toBe(initial)
    expect(game.currentSnapshot.track).toBe(initial.track)
    expect(game.currentSnapshot.level).toBe(level)
  })

  it('produces equivalent simulation across render cadences', () => {
    const at30 = simulateAtCadence(30, 6).currentSnapshot
    const at120 = simulateAtCadence(120, 6).currentSnapshot

    expect(at30.phase).toBe(at120.phase)
    expect(at30.time).toBeCloseTo(at120.time, 10)
    expect(at30.position).toBeCloseTo(at120.position, 8)
    expect(at30.playerX).toBeCloseTo(at120.playerX, 8)
    expect(at30.speed).toBeCloseTo(at120.speed, 8)
    expect(at30.lean).toBeCloseTo(at120.lean, 8)
  })

  it('emits semantic HUD, sound, audio, and view events without a renderer', () => {
    const game = new Game(level, difficulty, 999)
    const countdownEvents = advanceTicks(game, 181)

    expect(countdownEvents).toContainEqual({ type: 'sound', sound: 'start' })
    expect(countdownEvents.some((event) => event.type === 'hud-changed')).toBe(true)
    expect(countdownEvents.some((event) => event.type === 'audio-speed')).toBe(true)

    const jumpEvents = game.update(FIXED_STEP_SECONDS, { steer: 0, jump: true })
    expect(jumpEvents).toContainEqual({ type: 'sound', sound: 'jump' })
    expect(game.currentSnapshot.airborne).toBe(true)

    const landingEvents = advanceTicks(game, 120)
    expect(landingEvents.some((event) => event.type === 'view-effect')).toBe(true)
    expect(landingEvents).toContainEqual({ type: 'sound', sound: 'land' })
  })

  it('freezes simulation while paused and resumes without a time jump', () => {
    const game = new Game(level, difficulty, 321)
    advanceTicks(game, 200)
    const beforePause = game.currentSnapshot

    expect(game.pause()).toEqual([
      { type: 'audio-speed', speed01: 0, active: false },
      { type: 'music', action: 'stop' },
    ])
    expect(game.currentPhase).toBe('paused')

    expect(game.update(4, { steer: 1, jump: true })).toEqual([])
    expect(game.currentSnapshot.time).toBe(beforePause.time)
    expect(game.currentSnapshot.position).toBe(beforePause.position)

    expect(game.resume()).toEqual([{ type: 'music', action: 'start', key: level.musicKey }])
    game.update(FIXED_STEP_SECONDS, noInput)
    expect(game.currentSnapshot.time).toBeCloseTo(beforePause.time + FIXED_STEP_SECONDS)
  })

  it('ends a failed run with final inactive audio and stable statistics', () => {
    const oneLife: DifficultyDef = { ...difficulty, lives: 1, assist: 0 }
    const game = new Game(level, oneLife, 456)
    advanceTicks(game, 181)
    const segment = game.currentSnapshot.track.segments[
      Math.floor(game.currentSnapshot.position / 200)
    ]
    segment.obstacles.push({
      x: game.currentSnapshot.playerX,
      scale: 1,
      kind: 'rock',
      spent: false,
    })

    const events = game.update(FIXED_STEP_SECONDS, noInput)

    expect(game.currentPhase).toBe('failed')
    expect(game.previousSnapshot).toBe(game.currentSnapshot)
    expect(events.at(-2)?.type).toBe('hud-changed')
    expect(events.at(-1)?.type).toBe('run-ended')
    expect(events.filter((event) => event.type === 'audio-speed').at(-1)).toEqual({
      type: 'audio-speed',
      speed01: 0,
      active: false,
    })
  })

  it('preserves silent, auto-steering attract mode semantics', () => {
    const left = new Game(level, difficulty, 777, { attract: true })
    const right = new Game(level, difficulty, 777, { attract: true })
    const leftEvents = advanceTicks(left, 240, { steer: -1, jump: true })
    advanceTicks(right, 240, { steer: 1, jump: false })

    expect(left.currentPhase).toBe('running')
    expect(left.currentSnapshot.playerX).toBeCloseTo(right.currentSnapshot.playerX, 10)
    expect(leftEvents.every((event) => event.type === 'view-effect')).toBe(true)
  })

  it('suppresses interpolation across an attract-mode loop boundary', () => {
    const shortLevel = { ...level, length: 4 }
    const game = new Game(shortLevel, difficulty, 1, { attract: true })

    game.update(FIXED_STEP_SECONDS, noInput)

    expect(game.currentSnapshot.position).toBe(0)
    expect(game.previousSnapshot).toBe(game.currentSnapshot)
  })
})
