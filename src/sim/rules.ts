// Scoring, serve rotation, who may touch the ball, and who should play it next.
import { BALL_RADIUS, COURT_HALF, MAX_TOUCHES } from './constants.ts';
import { otherTeam, sideSign } from './player.ts';
import type { BallPlan, Player, Team, World } from './types.ts';

export function teamPlayers(world: World, team: Team): Player[] {
  return world.players.filter((p) => p.team === team);
}

export function touchesOf(world: World, team: Team): number {
  return world.touchTeam === team ? world.touches : 0;
}

/** Rules-wise, may this player touch the ball now? */
export function mayTouch(world: World, p: Player): boolean {
  if (world.phase !== 'rally') return false;
  if (p.cooldown > 0) return false;
  // Only on own side of the net (small tolerance).
  if (world.ball.x * sideSign(p.team) < -0.1) return false;
  if (world.touchTeam === p.team) {
    if (world.touches >= MAX_TOUCHES) return false;
    if (world.lastHitter === p.id) return false; // no double touch
  }
  return true;
}

export function isInCourt(x: number): boolean {
  return Math.abs(x) <= COURT_HALF + BALL_RADIUS;
}

/** Decide which team wins the point when the ball lands at x. */
export function landingWinner(world: World, x: number): { team: Team; reason: string } {
  const side: Team = x < 0 ? 0 : 1;
  if (isInCourt(x)) return { team: otherTeam(side), reason: `ball landed in team ${side} court` };
  const lastTeam: Team = world.lastHitter >= 0 ? world.players[world.lastHitter].team : world.servingTeam;
  return { team: otherTeam(lastTeam), reason: `out, last touched by team ${lastTeam}` };
}

/** First point on the predicted path, on the given side, where the ball comes down to height h. */
export function interceptX(plan: BallPlan, team: Team, h: number): { x: number; index: number } {
  const s = sideSign(team);
  for (let i = 1; i < plan.path.length; i++) {
    const a = plan.path[i - 1];
    const b = plan.path[i];
    if (b.x * s > 0 && b.y <= h && b.y < a.y) return { x: b.x, index: i };
  }
  return { x: plan.landX, index: plan.path.length - 1 };
}

/** Who should play the ball next (used by bots; the human may always try). */
export function chooseReceiver(world: World, plan: BallPlan): number {
  const team = plan.side;
  const mates = teamPlayers(world, team);
  if (world.touchTeam === team && world.touches >= MAX_TOUCHES) return -1;
  if (world.touchTeam === team && world.lastHitter >= 0) {
    const other = mates.find((p) => p.id !== world.lastHitter);
    return other ? other.id : -1;
  }
  const ix = interceptX(plan, team, 1.1).x;
  const [a, b] = mates;
  let da = Math.abs(a.x - ix);
  let db = Math.abs(b.x - ix);
  // Give the human the benefit of the doubt: the teammate bot only takes balls
  // that are clearly closer to it.
  const humanControlled = !world.config.autoplay;
  if (humanControlled && a.id === 0) da -= 0.6;
  if (humanControlled && b.id === 0) db -= 0.6;
  return da <= db ? a.id : b.id;
}

export function awardPoint(world: World, team: Team, reason: string): void {
  world.score[team] += 1;
  if (team !== world.servingTeam) {
    world.servingTeam = team;
    world.serverIndex[team] = (world.serverIndex[team] + 1) % 2;
  }
  world.events.push({
    f: world.frame,
    type: 'point',
    team,
    reason,
    score: [world.score[0], world.score[1]],
  });
  const a = world.score[team];
  const b = world.score[otherTeam(team)];
  if (a >= world.config.pointsToWin && a - b >= 2) {
    world.winner = team;
  }
}
