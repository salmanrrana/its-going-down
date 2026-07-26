export type QualityLevel = 'low' | 'medium' | 'high'

export interface QualityProfile {
  readonly maxDpr: number
  readonly shadows: boolean
  readonly shadowMapSize: number
  readonly drawDistance: number
  readonly sceneryDensity: number
  readonly maxParticles: number
  readonly antialias: boolean
}

export const QUALITY_PROFILES: Readonly<Record<QualityLevel, QualityProfile>> = {
  low: {
    maxDpr: 1,
    shadows: false,
    shadowMapSize: 512,
    drawDistance: 90,
    sceneryDensity: 0.42,
    maxParticles: 72,
    antialias: false,
  },
  medium: {
    maxDpr: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    drawDistance: 140,
    sceneryDensity: 0.7,
    maxParticles: 128,
    antialias: true,
  },
  high: {
    maxDpr: 2,
    shadows: true,
    shadowMapSize: 1536,
    drawDistance: 210,
    sceneryDensity: 1,
    maxParticles: 220,
    antialias: true,
  },
}

export interface QualitySignals {
  readonly width: number
  readonly height: number
  readonly devicePixelRatio: number
  readonly hardwareConcurrency?: number
  readonly deviceMemory?: number
  readonly coarsePointer?: boolean
  readonly reducedMotion?: boolean
}

export function selectQualityLevel(signals: QualitySignals): QualityLevel {
  const pixels = signals.width * signals.height * Math.min(signals.devicePixelRatio, 2) ** 2
  const constrainedCpu = signals.hardwareConcurrency !== undefined && signals.hardwareConcurrency <= 4
  const constrainedMemory = signals.deviceMemory !== undefined && signals.deviceMemory <= 4
  const mobileSized = Math.min(signals.width, signals.height) <= 600

  if (pixels > 5_000_000 || constrainedMemory || (mobileSized && constrainedCpu)) return 'low'
  if (signals.coarsePointer || signals.reducedMotion || pixels > 2_700_000 || constrainedCpu) {
    return 'medium'
  }
  return 'high'
}

export function detectQualitySignals(win: Window = window): QualitySignals {
  const navigatorWithMemory = win.navigator as Navigator & { deviceMemory?: number }
  return {
    width: Math.max(1, win.innerWidth),
    height: Math.max(1, win.innerHeight),
    devicePixelRatio: win.devicePixelRatio || 1,
    hardwareConcurrency: win.navigator.hardwareConcurrency || undefined,
    deviceMemory: navigatorWithMemory.deviceMemory,
    coarsePointer: win.matchMedia?.('(pointer: coarse)').matches ?? false,
    reducedMotion: win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  }
}
