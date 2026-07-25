export type LevelId =
  | 'snowboard'
  | 'skateboard'
  | 'rollerblade'
  | 'gokart'
  | 'boat'
  | 'surf'
  | 'car'

export type DifficultyId = 'easy' | 'medium' | 'hard'

export interface Palette {
  /** Two-stop vertical sky gradient. */
  skyTop: string
  skyBottom: string
  sun: string
  sunGlow: string
  /** Far mountain / skyline silhouettes, back to front. */
  ridgeFar: string
  ridgeNear: string
  /** The two alternating ground bands either side of the run. */
  groundA: string
  groundB: string
  /** The two alternating surface bands of the run itself. */
  laneA: string
  laneB: string
  /** Edge rumble strips. */
  rumbleA: string
  rumbleB: string
  /** Centre guide line — set to null for levels with no marked centre. */
  centerLine: string | null
  /** Colour the distance fades toward at the horizon. */
  fog: string
  /** Accent used for HUD tint and particles. */
  accent: string
  /** Trail/spray colour kicked up by the player. */
  spray: string
}

export interface Physics {
  /** Cruise speed in world units/sec at full throttle. */
  topSpeed: number
  /** How fast we reach top speed. */
  accel: number
  /** Deceleration after a crash or off-surface. */
  offSurfaceDrag: number
  /** Lateral responsiveness — how quickly steering input becomes movement. */
  steerRate: number
  /** How strongly lateral velocity bleeds off (grip vs. slide). */
  grip: number
  /** Extra sideways pull when the run curves — the "carve" feel. */
  centrifugal: number
  /** Upward impulse on jump. */
  jumpImpulse: number
  /** Downward acceleration while airborne. */
  gravity: number
  /** Visual bob/sway amplitude, for boats and surf. */
  bob: number
  /** How much the craft leans into a turn, in radians at full lock. */
  lean: number
}

export type SceneryKind =
  | 'pine'
  | 'palm'
  | 'building'
  | 'streetlight'
  | 'rock'
  | 'buoy'
  | 'cactus'
  | 'flag'
  | 'reed'

export type ObstacleKind =
  | 'rock'
  | 'tree'
  | 'cone'
  | 'barrel'
  | 'log'
  | 'car'
  | 'hydrant'
  | 'crate'

export interface LevelDef {
  id: LevelId
  /** Sport name, shown big. */
  name: string
  /** Real-world location, shown small. */
  location: string
  /** Short flavour line on the level card. */
  tagline: string
  /** Emoji used as the card glyph — no image assets needed. */
  glyph: string
  /** Flag emoji for the location. */
  flag: string
  /** Surface noun used in UI copy ("slope", "street", "river"...). */
  surface: string
  palette: Palette
  physics: Physics
  scenery: SceneryKind[]
  obstacles: ObstacleKind[]
  /** Semitone offset for the music bed. */
  musicKey: number
  /** Track length in segments. Longer = longer level. */
  length: number
  /** How wide the run is, in world units (half-width). */
  roadWidth: number
  /** 0..1 — how curvy this level's generator gets. */
  curviness: number
  /** 0..1 — how hilly. */
  hilliness: number
  /** Multiplier on how many ramps appear. */
  rampRate: number
  /** Whether the surface renders with water-style animated bands. */
  water: boolean
}

export interface DifficultyDef {
  id: DifficultyId
  name: string
  blurb: string
  glyph: string
  /** Speed multiplier applied to the level's top speed. */
  speedScale: number
  /** Obstacle density multiplier. */
  obstacleScale: number
  /** How many hits before the run ends. 0 = cannot fail. */
  lives: number
  /** Whether the jump control is available at all. */
  jumpEnabled: boolean
  /** Score multiplier. */
  scoreScale: number
  /** Extra steering assist: pulls the player away from obstacles. 0 = none. */
  assist: number
  /** Minimum gap between obstacles, in world units of lateral space. */
  minGap: number
}
