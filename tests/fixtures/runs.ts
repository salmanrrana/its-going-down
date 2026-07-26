import { DIFFICULTIES, LEVELS } from '../../src/game/levels'

export const TRACK_TEST_SEEDS = [0, 1, 42, 1337, 0x12345678, 0xffffffff] as const

export const RUN_FIXTURES = LEVELS.flatMap((level) =>
  DIFFICULTIES.flatMap((difficulty) =>
    TRACK_TEST_SEEDS.map((seed) => ({ level, difficulty, seed })),
  ),
)
