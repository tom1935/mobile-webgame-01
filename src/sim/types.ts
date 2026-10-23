import type { Rng } from './rng.ts';

export type Team = 0 | 1;
export type Phase = 'serveWait' | 'rally' | 'pointEnd' | 'matchEnd';
export type ShotKind = 'serve' | 'pass' | 'set' | 'lob' | 'drive' | 'spike' | 'shank';

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Player {
  id: number; // 0 = human (A1), 1 = teammate (A2), 2 = B1, 3 = B2
  name: string;
  team: Team;
  x: number;
  y: number; // feet height, 0 = on the sand
  vx: number;
  vy: number;
  z: number; // render-only depth offset
  targetX: number | null; // where the player wants to run (null = stop)
  swingFrames: number; // > 0 while a swing is armed
  swing: SwingIntent | null;
  cooldown: number; // frames until this player may touch again
  /** Frame of the last hit, for animation. */
  lastHitFrame: number;
  lastJumpFrame: number;
}

/** What the player tries to do with the ball when it comes into reach. */
export interface SwingIntent {
  kind: ShotKind;
  targetX: number;
  flightTime: number;
  error: number; // sigma (m) applied to targetX
}

/** Predicted path of the ball until it touches the sand. */
export interface BallPlan {
  landX: number;
  landFrame: number; // absolute frame
  /** Sampled path, one point per frame. */
  path: { x: number; y: number }[];
  /** Team whose side the ball will land on. */
  side: Team;
  /** Player expected to play the ball next (decided by AI / rules), or -1. */
  receiver: number;
}

export interface Score {
  0: number;
  1: number;
}

export interface Difficulty {
  reactionFrames: number; // delay before bots react to a new trajectory
  speedFactor: number; // multiplier on PLAYER_SPEED
  errorSigma: number; // targeting error (m)
}

export interface WorldConfig {
  seed: number;
  pointsToWin: number;
  /** When true, player 0 is also controlled by the AI. */
  autoplay: boolean;
  teammate: Difficulty;
  opponents: Difficulty;
}

export interface World {
  config: WorldConfig;
  frame: number;
  rng: Rng;
  phase: Phase;
  phaseFrame: number; // frame when the current phase started
  ball: Ball;
  players: Player[];
  score: Score;
  servingTeam: Team;
  /** Index (0/1) within the team of who serves next, per team. */
  serverIndex: [number, number];
  server: number; // player id holding the serve
  touches: number; // touches by the team currently possessing the ball
  touchTeam: Team | null; // team that touched last
  lastHitter: number; // player id, -1 if none
  plan: BallPlan | null;
  planFrame: number; // frame the plan was (re)computed
  events: GameEvent[];
  winner: Team | null;
}

export type GameEvent =
  | { f: number; type: 'serve'; player: number; x: number; y: number; vx: number; vy: number }
  | {
      f: number;
      type: 'hit';
      player: number;
      team: Team;
      touch: number;
      kind: ShotKind;
      x: number;
      y: number;
      vx: number;
      vy: number;
      targetX: number;
    }
  | { f: number; type: 'whiff'; player: number; reason: string }
  | { f: number; type: 'miss'; player: number; x: number; y: number }
  | { f: number; type: 'jump'; player: number; x: number }
  | { f: number; type: 'net'; x: number; y: number }
  | { f: number; type: 'cross'; toTeam: Team; y: number }
  | { f: number; type: 'land'; x: number; side: Team; inCourt: boolean }
  | { f: number; type: 'point'; team: Team; reason: string; score: [number, number] }
  | { f: number; type: 'matchEnd'; winner: Team; score: [number, number] }
  | { f: number; type: 'violation'; message: string };

/** Commands for the human-controlled player. Produced by touch input or scripts. */
export type Command =
  | { cmd: 'moveTo'; x: number }
  | { cmd: 'stop' }
  | { cmd: 'jump' }
  /** Flick in screen space: dx right-positive, dy down-positive (CSS px), duration in ms. */
  | { cmd: 'flick'; dx: number; dy: number; ms: number };
