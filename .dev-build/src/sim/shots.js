// Turning intents (pass / set / spike ...) into ball velocities, and flicks into intents.
import { solveShot } from "./ball.js";
import { COURT_HALF, HARD_BALL_SPEED, MAX_ATTACK_VX, NET_HEIGHT, REACH_X, T_DRIVE, T_LOB, T_PASS, T_SERVE, T_SET, T_SPIKE, } from "./constants.js";
import { onGround, sideSign } from "./player.js";
import { gauss, next, range } from "./rng.js";
export function clampOwnCourt(team, x) {
    const s = sideSign(team);
    const d = Math.min(COURT_HALF - 0.8, Math.max(0.8, x * s));
    return d * s;
}
export function clampOppCourt(team, x) {
    const s = -sideSign(team);
    const d = Math.min(COURT_HALF - 0.5, Math.max(1.0, x * s));
    return d * s;
}
export function makeIntent(kind, targetX, error) {
    const flightTime = kind === 'pass'
        ? T_PASS
        : kind === 'set'
            ? T_SET
            : kind === 'lob'
                ? T_LOB
                : kind === 'drive'
                    ? T_DRIVE
                    : kind === 'spike'
                        ? T_SPIKE
                        : T_SERVE;
    return { kind, targetX, flightTime, error };
}
export function canSpike(p, ball) {
    return !onGround(p) && ball.y > NET_HEIGHT + 0.05;
}
/**
 * Final adjustment at contact time:
 *  - the 3rd touch must go over the net,
 *  - a spike from the ground becomes a drive,
 *  - error grows when the ball is far from the sweet spot.
 * Returns the velocity to give the ball, or null when the player misses it completely.
 */
export function resolveHit(world, p, intent, touchNumber) {
    let kind = intent.kind;
    let targetX = intent.targetX;
    const ball = world.ball;
    const own = sideSign(p.team);
    if (kind === 'spike' && !canSpike(p, ball))
        kind = 'drive';
    const goesOver = Math.sign(targetX) !== own;
    if (touchNumber >= 3 && !goesOver) {
        kind = 'lob';
        targetX = -own * 4.5;
    }
    // 0 = inside the sweet spot (|dx| <= 0.3), 1 = edge of reach
    const offset = Math.max(0, Math.abs(ball.x - p.x) - 0.3) / (REACH_X - 0.3);
    // Hard incoming balls (spikes, drives; not floaty serves/passes) are harder to control and may be shanked.
    const incoming = Math.hypot(ball.vx, ball.vy);
    const cleanChance = Math.max(0.1, Math.min(1, 1 - Math.max(0, incoming - HARD_BALL_SPEED) * 0.25 - offset * 0.3));
    if (next(world.rng) > cleanChance) {
        // Failed dig: half the time the ball just goes past the player untouched.
        if (next(world.rng) < 0.5)
            return null;
        const vx = range(world.rng, -6, 6);
        const vy = range(world.rng, 0.5, 4.5);
        return { kind: 'shank', targetX: ball.x, vx, vy };
    }
    const hardness = Math.max(0, incoming - HARD_BALL_SPEED) * 0.1;
    const sigma = intent.error + 0.5 * offset + hardness;
    targetX += gauss(world.rng, sigma);
    // Keep intended "over the net" shots on the other side and own-side shots on own side.
    if (Math.sign(intent.targetX) === own && kind !== 'lob')
        targetX = clampOwnCourt(p.team, targetX);
    let T = kind === intent.kind ? intent.flightTime : makeIntent(kind, 0, 0).flightTime;
    // Cap horizontal speed so attacks stay readable on a phone screen.
    T = Math.max(T, Math.abs(targetX - ball.x) / MAX_ATTACK_VX);
    const v = solveShot(ball.x, ball.y, targetX, T);
    return { kind, targetX, vx: v.vx, vy: v.vy };
}
/** Flick strength 0..1 from screen distance (px) and duration (ms). */
export function flickPower(dx, dy, ms) {
    const speed = Math.hypot(dx, dy) / Math.max(ms, 16); // px per ms
    return Math.max(0, Math.min(1, (speed - 0.4) / 1.6));
}
/**
 * Interpret a flick for the human player. Screen right = +x, screen up = +y.
 * - toward the net (forward): attack (spike when airborne above the net, else drive)
 * - up: pass / set toward the net on own side (3rd touch: lob over)
 * - backward: pass deeper on own side
 * The flick angle nudges the target, the strength sets the depth of attacks.
 */
export function flickToIntent(world, p, dx, dy, ms) {
    const own = sideSign(p.team);
    const forward = -own; // +1 for team 0
    const power = flickPower(dx, dy, ms);
    const angle = (Math.atan2(-dy, dx * forward) * 180) / Math.PI; // 0 = toward net, 90 = up
    const ball = world.ball;
    if (angle > -100 && angle < 55) {
        const depth = 1.5 + power * 6.0; // distance from the net in the opponent court
        const targetX = forward * depth;
        if (canSpike(p, ball) || (!onGround(p) && angle < 10)) {
            return makeIntent('spike', targetX, 0.35);
        }
        return makeIntent('drive', targetX, 0.4);
    }
    if (angle >= 55 && angle <= 125) {
        // Up: nudge target toward net (angle < 90) or back (angle > 90).
        const nudge = ((90 - angle) / 35) * 1.5;
        const targetX = own * Math.max(0.8, 2.0 - nudge);
        return makeIntent('set', targetX, 0.3);
    }
    const targetX = own * Math.min(COURT_HALF - 1, Math.abs(p.x) + 2.0);
    return makeIntent('pass', targetX, 0.4);
}
export function serveIntent(team, power, error) {
    const depth = 2.5 + power * 5.0;
    return makeIntent('serve', -sideSign(team) * depth, error);
}
