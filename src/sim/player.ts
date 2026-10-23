import {
  DT,
  JUMP_VELOCITY,
  PLAYER_ACCEL,
  PLAYER_GRAVITY,
  PLAYER_MIN_NET_GAP,
  PLAYER_SPEED,
  REACH_BOTTOM,
  REACH_TOP,
  REACH_X,
  WALL_X,
} from './constants.ts';
import type { Ball, Player, Team } from './types.ts';

/** Sign of x on a team's own side: team 0 plays at x < 0. */
export function sideSign(team: Team): number {
  return team === 0 ? -1 : 1;
}

export function otherTeam(team: Team): Team {
  return team === 0 ? 1 : 0;
}

export function onGround(p: Player): boolean {
  return p.y <= 0 && p.vy <= 0;
}

export function clampToSide(team: Team, x: number): number {
  return team === 0
    ? Math.min(-PLAYER_MIN_NET_GAP, Math.max(-WALL_X, x))
    : Math.max(PLAYER_MIN_NET_GAP, Math.min(WALL_X, x));
}

export function stepPlayer(p: Player, speedFactor: number): void {
  const maxSpeed = PLAYER_SPEED * speedFactor;
  let desired = 0;
  if (p.targetX !== null) {
    const dx = p.targetX - p.x;
    desired = Math.sign(dx) * Math.min(maxSpeed, Math.abs(dx) * 8);
    if (Math.abs(dx) < 0.03) desired = 0;
  }
  const accel = (onGround(p) ? PLAYER_ACCEL : PLAYER_ACCEL * 0.25) * DT;
  const dv = desired - p.vx;
  p.vx += Math.max(-accel, Math.min(accel, dv));
  p.x += p.vx * DT;

  if (p.y > 0 || p.vy > 0) {
    p.vy -= PLAYER_GRAVITY * DT;
    p.y += p.vy * DT;
    if (p.y <= 0) {
      p.y = 0;
      p.vy = 0;
    }
  }

  const clamped = clampToSide(p.team, p.x);
  if (clamped !== p.x) {
    p.x = clamped;
    p.vx = 0;
  }
}

export function jump(p: Player): boolean {
  if (!onGround(p)) return false;
  p.vy = JUMP_VELOCITY;
  p.y = 0.0001;
  return true;
}

export function inReach(p: Player, ball: Ball): boolean {
  return (
    Math.abs(ball.x - p.x) <= REACH_X &&
    ball.y >= p.y + REACH_BOTTOM &&
    ball.y <= p.y + REACH_TOP
  );
}

/** Highest point a jumping player can reach (feet peak + REACH_TOP). */
export const JUMP_PEAK = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * PLAYER_GRAVITY);
export const JUMP_RISE_FRAMES = Math.round(JUMP_VELOCITY / PLAYER_GRAVITY / DT);
