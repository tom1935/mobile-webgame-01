// Bot brain. Reads the world, writes targetX / swing / jump requests for one player.
import { NET_HEIGHT, REACH_TOP, SERVE_BOT_DELAY_FRAMES } from "./constants.js";
import { JUMP_PEAK, JUMP_RISE_FRAMES, jump, onGround, sideSign } from "./player.js";
import { interceptX, teamPlayers, touchesOf } from "./rules.js";
import { range, next } from "./rng.js";
import { makeIntent, serveIntent } from "./shots.js";
const SPIKE_CONTACT_Y = JUMP_PEAK + REACH_TOP - 0.25;
function teamIndex(world, p) {
    return teamPlayers(world, p.team).indexOf(p);
}
/** Depth (distance from the net) in the opponent court farthest from the defenders, with some noise. */
function pickGap(world, p, minDepth, maxDepth) {
    const defenders = world.players.filter((q) => q.team !== p.team).map((q) => Math.abs(q.x));
    let best = minDepth;
    let bestScore = -Infinity;
    for (let d = minDepth; d <= maxDepth + 1e-6; d += 0.5) {
        const gap = Math.min(...defenders.map((x) => Math.abs(x - d)));
        const score = gap + range(world.rng, 0, 1.2);
        if (score > bestScore) {
            bestScore = score;
            best = d;
        }
    }
    return best;
}
function attackIntent(world, p, diff, spike) {
    const forward = -sideSign(p.team);
    const depth = pickGap(world, p, 1.5, 7.0);
    if (spike)
        return makeIntent('spike', forward * depth, diff.errorSigma);
    const kind = next(world.rng) < 0.5 ? 'drive' : 'lob';
    return makeIntent(kind, forward * pickGap(world, p, 2.5, 7.0), diff.errorSigma);
}
/** Intent for the next touch of this bot's team (1st = pass, 2nd = set, 3rd = attack). */
function touchIntent(world, p, diff, touchNo) {
    const s = sideSign(p.team);
    if (touchNo === 1)
        return makeIntent('pass', s * 2.2, diff.errorSigma);
    if (touchNo === 2)
        return makeIntent('set', s * 1.3, diff.errorSigma * 0.7);
    return attackIntent(world, p, diff, false);
}
export function updateBot(world, p, diff) {
    const s = sideSign(p.team);
    const idx = teamIndex(world, p);
    if (world.phase === 'serveWait') {
        if (p.id === world.server) {
            p.targetX = null;
            if (world.frame - world.phaseFrame >= SERVE_BOT_DELAY_FRAMES) {
                return { serve: serveIntent(p.team, range(world.rng, 0.1, 0.9), diff.errorSigma) };
            }
            return {};
        }
        p.targetX = s * (idx === 0 ? 5.0 : 3.0);
        return {};
    }
    if (world.phase !== 'rally') {
        p.targetX = null;
        return {};
    }
    const plan = world.plan;
    if (!plan)
        return {};
    if (plan.side !== p.team) {
        // Ball heading to the other side: go back to defensive spots.
        p.targetX = s * (idx === 0 ? 5.2 : 3.0);
        return {};
    }
    const touchNo = touchesOf(world, p.team) + 1;
    if (plan.receiver !== p.id) {
        // Support the teammate who plays the ball.
        if (touchNo === 1)
            p.targetX = s * 1.8; // be ready to set
        else if (touchNo === 2)
            p.targetX = s * 3.6; // be ready to attack
        return {};
    }
    // This bot plays the ball. Wait for reaction time after the trajectory changed.
    if (world.frame - world.planFrame < diff.reactionFrames)
        return {};
    const elapsed = world.frame - world.planFrame;
    const action = {};
    // Try a jump spike on the 3rd touch when the ball comes down near the net, high enough.
    if (touchNo === 3) {
        for (let i = Math.max(0, elapsed - 1); i < plan.path.length; i++) {
            const pt = plan.path[i];
            const prev = plan.path[Math.max(0, i - 1)];
            if (pt.x * s <= 0 || pt.x * s > 3.5)
                continue;
            if (pt.y > SPIKE_CONTACT_Y || pt.y >= prev.y)
                continue;
            if (pt.y < NET_HEIGHT + 0.3)
                break;
            const framesUntil = i + 1 - elapsed;
            p.targetX = pt.x;
            if (onGround(p) && Math.abs(p.x - pt.x) < 0.45 && framesUntil <= JUMP_RISE_FRAMES + 1) {
                if (jump(p))
                    action.jumped = true;
            }
            // Swing only near the top of the jump so the contact point is high.
            if (!onGround(p) && (p.vy < 1.5 || world.ball.y > SPIKE_CONTACT_Y - 0.2)) {
                if (!p.swing || p.swing.kind !== 'spike')
                    p.swing = attackIntent(world, p, diff, true);
                p.swingFrames = 2;
            }
            return action;
        }
    }
    const ix = interceptX(plan, p.team, 1.0);
    p.targetX = ix.x;
    if (world.ball.vy < 0 || Math.abs(world.ball.x - p.x) < 1.0) {
        // Keep the chosen intent while it is still armed (avoid re-rolling targets every frame).
        if (!p.swing || p.swingFrames <= 0)
            p.swing = touchIntent(world, p, diff, touchNo);
        p.swingFrames = 2;
    }
    return action;
}
