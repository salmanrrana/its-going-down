import { describe, expect, it } from 'vitest'
import { FIXED_STEP_SECONDS, FixedStepClock } from '../../core/fixed-step'
import type { GameEvent, InputFrame } from '../contracts'
import { JUMP_CLEARANCE } from '../constants'
import { Game } from '../game'
import { getDifficulty, getLevel, LEVELS } from '../levels'
import { SEGMENT_LENGTH } from '../track'
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

function clearInteractiveTrack(game: Game): void {
  for (const segment of game.currentSnapshot.track.segments) {
    segment.obstacles.length = 0
    segment.coins.length = 0
    segment.ramp = null
  }
}

function startRunning(game: Game): void {
  advanceTicks(game, 181)
  clearInteractiveTrack(game)
}

function addObstacleAtNextSegment(game: Game): number {
  const index = Math.floor(game.currentSnapshot.position / SEGMENT_LENGTH) + 1
  game.currentSnapshot.track.segments[index].obstacles.push({
    x: game.currentSnapshot.playerX,
    scale: 1,
    kind: 'rock',
    spent: false,
  })
  return index
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
    expect(at30.lateralVelocity).toBeCloseTo(at120.lateralVelocity, 8)
    expect(at30.steer).toBeCloseTo(at120.steer, 8)
    expect(at30.carve).toBeCloseTo(at120.carve, 8)
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
    const targetIndex = addObstacleAtNextSegment(game)
    const events: GameEvent[] = []
    while (
      game.currentPhase !== 'failed' &&
      Math.floor(game.currentSnapshot.position / SEGMENT_LENGTH) <= targetIndex
    ) {
      events.push(...game.update(FIXED_STEP_SECONDS, noInput))
    }

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

  it('gives every sport enough steering authority to cross most of its course width', () => {
    for (const sportLevel of LEVELS) {
      const game = new Game(sportLevel, difficulty, 17)
      startRunning(game)
      advanceTicks(game, 150, { steer: 1, jump: false })
      expect(game.currentSnapshot.playerX, sportLevel.id).toBeGreaterThan(
        sportLevel.roadWidth * 0.78,
      )
    }
  })

  it('reverses lateral velocity quickly under counter-steer without snapping', () => {
    const game = new Game(level, difficulty, 22)
    startRunning(game)
    advanceTicks(game, 45, { steer: 1, jump: false })
    const before = game.currentSnapshot.lateralVelocity
    expect(before).toBeGreaterThan(0)

    game.update(FIXED_STEP_SECONDS, { steer: -1, jump: false })
    expect(game.currentSnapshot.lateralVelocity).toBeLessThan(before)
    expect(game.currentSnapshot.lateralVelocity).toBeGreaterThan(-before)
    advanceTicks(game, 12, { steer: -1, jump: false })
    expect(game.currentSnapshot.lateralVelocity).toBeLessThan(0)
  })

  it('uses boosted counter-steer only until neutral, then ordinary turn-in', () => {
    const turnIn = new Game(level, difficulty, 27)
    const reversal = new Game(level, difficulty, 27)
    startRunning(turnIn)
    startRunning(reversal)

    turnIn.update(FIXED_STEP_SECONDS, { steer: -1, jump: false })
    reversal.update(FIXED_STEP_SECONDS, { steer: 1, jump: false })
    reversal.update(FIXED_STEP_SECONDS, { steer: -1, jump: false })

    expect(reversal.currentSnapshot.lateralVelocity).toBeLessThan(0)
    expect(Math.abs(reversal.currentSnapshot.lateralVelocity)).toBeLessThanOrEqual(
      Math.abs(turnIn.currentSnapshot.lateralVelocity) * 1.05,
    )
  })

  it('keeps useful but weaker steering authority in the air', () => {
    const grounded = new Game(level, difficulty, 31)
    const airborne = new Game(level, difficulty, 31)
    startRunning(grounded)
    startRunning(airborne)
    airborne.update(FIXED_STEP_SECONDS, { steer: 0, jump: true })
    const groundStart = grounded.currentSnapshot.lateralVelocity
    const airStart = airborne.currentSnapshot.lateralVelocity

    advanceTicks(grounded, 24, { steer: 1, jump: false })
    advanceTicks(airborne, 24, { steer: 1, jump: false })
    const groundGain = grounded.currentSnapshot.lateralVelocity - groundStart
    const airGain = airborne.currentSnapshot.lateralVelocity - airStart
    expect(airGain).toBeGreaterThan(groundGain * 0.2)
    expect(airGain).toBeLessThan(groundGain * 0.75)
    expect(airborne.currentSnapshot.airborne).toBe(true)
  })

  it('makes the verge slower and more heavily damped than the prepared surface', () => {
    const game = new Game(level, difficulty, 36)
    startRunning(game)
    advanceTicks(game, 180, { steer: 1, jump: false })
    expect(game.currentSnapshot.playerX).toBeGreaterThan(level.roadWidth)
    const vergeLateral = Math.abs(game.currentSnapshot.lateralVelocity)
    advanceTicks(game, 60)
    expect(game.currentSnapshot.speed).toBeLessThan(level.physics.topSpeed * difficulty.speedScale * 0.75)
    expect(Math.abs(game.currentSnapshot.lateralVelocity)).toBeLessThan(vergeLateral * 0.35)
  })

  it('lets every manual jump exceed hazard clearance and reports landing impulse', () => {
    for (const sportLevel of LEVELS) {
      const game = new Game(sportLevel, difficulty, 41)
      startRunning(game)
      game.update(FIXED_STEP_SECONDS, { steer: 0, jump: true })
      let apex = game.currentSnapshot.playerY
      let landingImpact = 0
      for (let i = 0; i < 180 && (game.currentSnapshot.airborne || i === 0); i++) {
        game.update(FIXED_STEP_SECONDS, noInput)
        apex = Math.max(apex, game.currentSnapshot.playerY)
        landingImpact = Math.max(landingImpact, game.currentSnapshot.landingImpact)
      }
      expect(apex, sportLevel.id).toBeGreaterThan(JUMP_CLEARANCE)
      expect(landingImpact, sportLevel.id).toBeGreaterThan(0.5)
    }
  })

  it('resolves hazards at longitudinal contact so a timed manual jump clears them', () => {
    const game = new Game(level, difficulty, 52)
    startRunning(game)
    game.update(FIXED_STEP_SECONDS, { steer: 0, jump: true })
    while (game.currentSnapshot.playerY < 360 || game.currentSnapshot.verticalVelocity > 0) {
      game.update(FIXED_STEP_SECONDS, noInput)
    }
    const targetIndex = Math.floor(game.currentSnapshot.position / SEGMENT_LENGTH) + 1
    const obstacle = { x: game.currentSnapshot.playerX, scale: 1, kind: 'rock' as const, spent: false }
    game.currentSnapshot.track.segments[targetIndex].obstacles.push(obstacle)
    const hitsBefore = game.stats.hits
    while (Math.floor(game.currentSnapshot.position / SEGMENT_LENGTH) < targetIndex) {
      game.update(FIXED_STEP_SECONDS, noInput)
    }
    expect(game.stats.hits).toBe(hitsBefore)
    expect(obstacle.spent).toBe(true)
  })

  it('uses interpolated jump height at the exact crossed segment boundary', () => {
    const contactLevel = {
      ...level,
      physics: { ...level.physics, topSpeed: 30000, accel: 30000 },
    }
    const findCrossing = (ascending: boolean): { tick: number; segment: number } => {
      const probe = new Game(contactLevel, difficulty, 57)
      startRunning(probe)
      probe.update(FIXED_STEP_SECONDS, { steer: 0, jump: true })
      for (let tick = 0; tick < 120; tick++) {
        const previous = probe.currentSnapshot
        probe.update(FIXED_STEP_SECONDS, noInput)
        const current = probe.currentSnapshot
        const previousSegment = Math.floor(previous.position / SEGMENT_LENGTH)
        const currentSegment = Math.floor(current.position / SEGMENT_LENGTH)
        for (let segment = previousSegment + 1; segment <= currentSegment; segment++) {
          const boundary = segment * SEGMENT_LENGTH
          const contactT = (boundary - previous.position) / (current.position - previous.position)
          const contactY = previous.playerY + (current.playerY - previous.playerY) * contactT
          if (
            ascending
              ? previous.playerY < JUMP_CLEARANCE &&
                current.playerY > JUMP_CLEARANCE &&
                contactY < JUMP_CLEARANCE
              : previous.playerY > JUMP_CLEARANCE &&
                current.playerY < JUMP_CLEARANCE &&
                contactY > JUMP_CLEARANCE
          ) {
            return { tick, segment }
          }
        }
      }
      throw new Error(`No ${ascending ? 'ascending' : 'descending'} clearance crossing found`)
    }

    for (const ascending of [true, false]) {
      const crossing = findCrossing(ascending)
      const game = new Game(contactLevel, difficulty, 57)
      startRunning(game)
      game.update(FIXED_STEP_SECONDS, { steer: 0, jump: true })
      advanceTicks(game, crossing.tick)
      const obstacle = {
        x: game.currentSnapshot.playerX,
        scale: 1,
        kind: 'rock' as const,
        spent: false,
      }
      game.currentSnapshot.track.segments[crossing.segment].obstacles.push(obstacle)
      game.update(FIXED_STEP_SECONDS, noInput)
      expect(game.stats.hits, ascending ? 'ascending' : 'descending').toBe(ascending ? 1 : 0)
      expect(obstacle.spent).toBe(true)
    }
  })

  it('recovers from a crash with monotonic speed and controlled lateral damping', () => {
    const game = new Game(level, difficulty, 63)
    startRunning(game)
    advanceTicks(game, 90, { steer: 1, jump: false })
    const targetIndex = addObstacleAtNextSegment(game)
    while (
      game.stats.hits === 0 &&
      Math.floor(game.currentSnapshot.position / SEGMENT_LENGTH) <= targetIndex
    ) {
      game.update(FIXED_STEP_SECONDS, noInput)
    }
    const speeds: number[] = []
    const lateral: number[] = []
    for (let i = 0; i < 54; i++) {
      game.update(FIXED_STEP_SECONDS, noInput)
      speeds.push(game.currentSnapshot.speed)
      lateral.push(Math.abs(game.currentSnapshot.lateralVelocity))
    }
    expect(game.stats.hits).toBe(1)
    expect(speeds.every((speed, i) => i === 0 || speed >= speeds[i - 1] - 1e-9)).toBe(true)
    expect(lateral.every((velocity, i) => i === 0 || velocity <= lateral[i - 1] + 1e-9)).toBe(true)
  })

  it('keeps Easy genuinely unlosable even when a child holds either side', () => {
    const easy = getDifficulty('easy')
    for (const sportLevel of LEVELS) {
      for (const steer of [-1, 1]) {
        const heldInput = { steer, jump: false }
        const label = `${sportLevel.id}:${steer}`
        const game = new Game(sportLevel, easy, 85)
        for (let tick = 0; tick < 9000 && game.currentPhase !== 'finished'; tick++) {
          game.update(FIXED_STEP_SECONDS, heldInput)
          expect(Math.abs(game.currentSnapshot.playerX), label).toBeLessThanOrEqual(
            sportLevel.roadWidth,
          )
        }
        expect(game.currentPhase, label).toBe('finished')
        expect(game.stats.completed, label).toBe(true)
      }
    }
  })

  it('applies deterministic, subtle hill speed changes', () => {
    const base = getLevel('car')
    const flatPhysics = { ...base.physics, hillSpeed: 0 }
    const hillyA = new Game(base, difficulty, 74)
    const hillyB = new Game(base, difficulty, 74)
    const noHillEffect = new Game({ ...base, physics: flatPhysics }, difficulty, 74)
    for (const game of [hillyA, hillyB, noHillEffect]) startRunning(game)
    advanceTicks(hillyA, 240)
    advanceTicks(hillyB, 240)
    advanceTicks(noHillEffect, 240)
    expect(hillyA.currentSnapshot.speed).toBe(hillyB.currentSnapshot.speed)
    expect(hillyA.currentSnapshot.position).toBe(hillyB.currentSnapshot.position)
    expect(hillyA.currentSnapshot.speed).not.toBe(noHillEffect.currentSnapshot.speed)
    expect(Math.abs(hillyA.currentSnapshot.speed - noHillEffect.currentSnapshot.speed)).toBeLessThan(
      base.physics.topSpeed * 0.1,
    )
  })
})
