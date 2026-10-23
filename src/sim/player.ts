import { P } from './params.ts';
import { DT, PLAYER_MIN_NET_GAP, REACH_BOTTOM, REACH_TOP, REACH_X, WALL_X } from './constants.ts';
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
  const maxSpeed = P.PLAYER_SPEED * speedFactor;
  let desired = 0;
  if (p.targetX !== null) {
    const dx = p.targetX - p.x;
    desired = Math.sign(dx) * Math.min(maxSpeed, Math.abs(dx) * 8);
    if (Math.abs(dx) < 0.03) desired = 0;
  }
  const accel = (onGround(p) ? P.PLAYER_ACCEL : P.PLAYER_ACCEL * 0.25) * DT;
  const dv = desired - p.vx;
  p.vx += Math.max(-accel, Math.min(accel, dv));
  p.x += p.vx * DT;

  if (p.y > 0 || p.vy > 0) {
    if (p.hangFrames > 0) {
      // Floating at the top of the jump.
      p.hangFrames -= 1;
      p.vy = 0;
    } else {
      const before = p.vy;
      p.vy -= P.PLAYER_GRAVITY * DT;
      if (before > 0 && p.vy <= 0 && !p.hangUsed) {
        p.hangUsed = true;
        p.hangFrames = Math.round(P.JUMP_HANG_FRAMES);
        p.vy = 0;
      }
    }
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
  p.vy = P.JUMP_VELOCITY;
  p.y = 0.0001;
  p.hangUsed = false;
  p.hangFrames = 0;
  return true;
}

export function inReach(p: Player, ball: Ball): boolean {
  return (
    Math.abs(ball.x - p.x) <= REACH_X &&
    ball.y >= p.y + REACH_BOTTOM &&
    ball.y <= p.y + REACH_TOP
  );
}

/** Height of the feet at the top of a jump (m). */
export function jumpPeak(): number {
  return (P.JUMP_VELOCITY * P.JUMP_VELOCITY) / (2 * P.PLAYER_GRAVITY);
}

/** Frames from take-off to the top of the jump. */
export function jumpRiseFrames(): number {
  return Math.round(P.JUMP_VELOCITY / P.PLAYER_GRAVITY / DT);
}
