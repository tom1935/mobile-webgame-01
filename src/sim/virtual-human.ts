// A scripted "player" that controls the human character ONLY through Commands
// (moveTo / flick / jump), like real touch input would. Used to test that the
// game is playable with the touch controls, without a screen.
import { P } from './params.ts';
import { DT, NET_HEIGHT, REACH_TOP, REACH_X } from './constants.ts';
import { jumpPeak, jumpRiseFrames, onGround } from './player.ts';
import { range } from './rng.ts';
import { interceptX, touchesOf } from './rules.ts';
import type { Command, World } from './types.ts';

export interface VirtualHuman {
  reactionFrames: number;
  /** Flick when the ball is about this many frames from the player. */
  leadFrames: number;
  lastPlanFrame: number;
  flickedForPlan: number;
  jumpedForPlan: number;
}

export function createVirtualHuman(reactionFrames = 15, leadFrames = 4): VirtualHuman {
  return { reactionFrames, leadFrames, lastPlanFrame: -1, flickedForPlan: -1, jumpedForPlan: -1 };
}

/** Screen-space flick that maps to roughly the given angle (deg, 0 = toward net, 90 = up). */
function flickAt(angleDeg: number, speedPxPerMs: number): Command {
  const a = (angleDeg * Math.PI) / 180;
  const ms = 80;
  const len = speedPxPerMs * ms;
  return { cmd: 'flick', dx: Math.cos(a) * len, dy: -Math.sin(a) * len, ms };
}

export function virtualHumanCommands(world: World, vh: VirtualHuman): Command[] {
  const me = world.players[0];
  const out: Command[] = [];
  const b = world.ball;

  if (world.phase === 'serveWait') {
    if (world.server === 0 && world.frame - world.phaseFrame === 45) {
      out.push(flickAt(range(world.rng, 15, 40), range(world.rng, 0.8, 2.0)));
    } else if (world.server !== 0 && world.frame - world.phaseFrame === 10) {
      out.push({ cmd: 'moveTo', x: -5 });
    }
    return out;
  }
  if (world.phase !== 'rally' || !world.plan) return out;

  const plan = world.plan;
  const sincePlan = world.frame - world.planFrame;
  if (sincePlan < vh.reactionFrames) return out;

  if (plan.side !== 0) {
    if (sincePlan === vh.reactionFrames) out.push({ cmd: 'moveTo', x: -4.5 });
    return out;
  }
  if (plan.receiver !== 0) {
    if (sincePlan === vh.reactionFrames) out.push({ cmd: 'moveTo', x: touchesOf(world, 0) === 0 ? -1.8 : -3.6 });
    return out;
  }

  const touchNo = touchesOf(world, 0) + 1;

  // 3rd touch near the net: try to jump-spike.
  if (touchNo === 3) {
    const contactY = jumpPeak() + REACH_TOP - 0.3;
    for (let i = Math.max(0, sincePlan); i < plan.path.length; i++) {
      const pt = plan.path[i];
      const prev = plan.path[Math.max(0, i - 1)];
      if (pt.x > 0 || pt.x < -3.5 || pt.y > contactY || pt.y >= prev.y) continue;
      if (pt.y < NET_HEIGHT + 0.3) break;
      out.push({ cmd: 'moveTo', x: pt.x });
      const framesUntil = i + 1 - sincePlan;
      if (vh.jumpedForPlan !== world.planFrame && onGround(me) && framesUntil <= jumpRiseFrames() + 1 && Math.abs(me.x - pt.x) < 0.5) {
        out.push({ cmd: 'jump' });
        vh.jumpedForPlan = world.planFrame;
      }
      if (!onGround(me) && vh.flickedForPlan !== world.planFrame && framesUntil <= vh.leadFrames) {
        out.push(flickAt(range(world.rng, -40, -10), range(world.rng, 1.0, 2.2)));
        vh.flickedForPlan = world.planFrame;
      }
      return out;
    }
  }

  const ix = interceptX(plan, 0, 1.0);
  if (Math.abs(me.x - ix.x) > 0.05) out.push({ cmd: 'moveTo', x: ix.x });

  // Flick shortly before the ball reaches the player.
  const dx = Math.abs(b.x - me.x);
  const approach = Math.abs(b.vx) * DT * vh.leadFrames + REACH_X;
  const yNext = b.y + b.vy * DT * vh.leadFrames - 0.5 * P.BALL_GRAVITY * (DT * vh.leadFrames) ** 2;
  if (vh.flickedForPlan !== world.planFrame && b.vy < 0 && dx <= approach && yNext <= REACH_TOP) {
    if (touchNo === 3) out.push(flickAt(range(world.rng, 10, 45), range(world.rng, 0.8, 2.0)));
    else out.push(flickAt(range(world.rng, 75, 105), 1.0));
    vh.flickedForPlan = world.planFrame;
  }
  return out;
}
