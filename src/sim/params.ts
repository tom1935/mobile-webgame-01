// Tunable game-feel parameters. Mutable at runtime (tuning panel ?tune=1, CLI --param KEY=VALUE).
// Fixed rules/geometry stay in constants.ts.

export const DEFAULT_PARAMS = {
  // Player movement
  PLAYER_SPEED: 7.0, // m/s top running speed
  PLAYER_ACCEL: 90, // m/s^2 on the ground (air control is 25% of this)
  // Jump
  JUMP_VELOCITY: 8.0, // m/s initial upward speed (peak = v^2 / 2g)
  PLAYER_GRAVITY: 22, // m/s^2 while jumping
  JUMP_HANG_FRAMES: 12, // frames the player floats at the top of the jump
  // Ball
  BALL_GRAVITY: 6.5, // m/s^2
  // Shot flight times (s). Longer = higher arc, more time to react.
  T_PASS: 2.1,
  T_SET: 2.2,
  T_LOB: 1.8,
  T_DRIVE: 0.9,
  T_SPIKE: 0.4,
  T_SERVE: 1.7,
  MAX_ATTACK_VX: 13, // m/s horizontal speed cap for any shot
  HARD_BALL_SPEED: 10, // m/s incoming speed above which receiving gets harder
  // Touch gestures
  FLICK_MIN_PX: 28, // swipe distance to count as a flick
  FLICK_MAX_MS: 220, // ...within this time
  JUMP_ZONE_RATIO: 0.25, // top part of the screen (fraction of height) where a tap = jump
};

export type Params = typeof DEFAULT_PARAMS;
export type ParamKey = keyof Params;

/** The live values. Read P.X at use time (never copy into module-level constants). */
export const P: Params = { ...DEFAULT_PARAMS };

export function setParams(values: Partial<Record<string, number>>): void {
  for (const [k, v] of Object.entries(values)) {
    if (k in P && typeof v === 'number' && Number.isFinite(v)) P[k as ParamKey] = v;
  }
}

export function resetParams(): void {
  Object.assign(P, DEFAULT_PARAMS);
}

/** Slider ranges for the tuning panel: [min, max, step]. */
export const PARAM_RANGES: Record<ParamKey, [number, number, number]> = {
  PLAYER_SPEED: [3, 12, 0.5],
  PLAYER_ACCEL: [20, 200, 5],
  JUMP_VELOCITY: [5, 11, 0.1],
  PLAYER_GRAVITY: [8, 40, 1],
  JUMP_HANG_FRAMES: [0, 40, 1],
  BALL_GRAVITY: [3, 12, 0.1],
  T_PASS: [1, 3.5, 0.05],
  T_SET: [1, 3.5, 0.05],
  T_LOB: [1, 3.5, 0.05],
  T_DRIVE: [0.5, 2, 0.05],
  T_SPIKE: [0.25, 1.2, 0.05],
  T_SERVE: [0.8, 3, 0.05],
  MAX_ATTACK_VX: [6, 25, 0.5],
  HARD_BALL_SPEED: [5, 20, 0.5],
  FLICK_MIN_PX: [8, 80, 1],
  FLICK_MAX_MS: [80, 500, 10],
  JUMP_ZONE_RATIO: [0.1, 0.5, 0.01],
};
