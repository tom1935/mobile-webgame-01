import { BALL_GRAVITY, BALL_RADIUS, DT, NET_BOUNCE, NET_HEIGHT, NET_THICKNESS, } from "./constants.js";
const NET_ZONE = NET_THICKNESS + BALL_RADIUS;
/** Advance the ball one fixed step, resolving net and ground contact. */
export function stepBall(ball) {
    const prevX = ball.x;
    const prevY = ball.y;
    ball.vy -= BALL_GRAVITY * DT;
    ball.x += ball.vx * DT;
    ball.y += ball.vy * DT;
    let net = false;
    let crossed = false;
    const insideNetSlab = Math.abs(ball.x) < NET_ZONE && ball.y < NET_HEIGHT;
    const passedThrough = Math.sign(prevX) !== Math.sign(ball.x) && prevX !== 0 && ball.y < NET_HEIGHT;
    if (insideNetSlab || passedThrough) {
        net = true;
        if (prevY >= NET_HEIGHT && !passedThrough) {
            // Came down onto the top of the net: pop up and roll off to the side it is on.
            ball.y = NET_HEIGHT;
            ball.vy = Math.abs(ball.vy) * 0.4;
            const s = ball.x === 0 ? Math.sign(prevX) || 1 : Math.sign(ball.x);
            ball.vx = s * Math.max(Math.abs(ball.vx) * 0.5, 0.6);
            ball.x = s * NET_ZONE;
        }
        else {
            // Side hit: bounce back to the side it came from.
            const s = Math.sign(prevX) || 1;
            ball.x = s * NET_ZONE;
            ball.vx = -ball.vx * NET_BOUNCE;
        }
    }
    if (!net && prevX !== 0 && Math.sign(prevX) !== Math.sign(ball.x)) {
        crossed = true;
    }
    let landed = false;
    if (ball.y <= BALL_RADIUS) {
        ball.y = BALL_RADIUS;
        landed = true;
    }
    return { net, crossed, landed };
}
/** Simulate a copy of the ball until it lands. path[i] = position after i+1 steps. */
export function predictBall(ball, maxFrames = 600) {
    const b = { ...ball };
    const path = [];
    for (let i = 0; i < maxFrames; i++) {
        const r = stepBall(b);
        path.push({ x: b.x, y: b.y });
        if (r.landed)
            break;
    }
    return { path, landX: b.x, frames: path.length };
}
/**
 * Initial velocity so the ball goes from (x0, y0) to targetX on the sand in `flightTime` seconds.
 * If the path would hit the net, the flight time is increased until it clears.
 */
export function solveShot(x0, y0, targetX, flightTime) {
    const g = BALL_GRAVITY;
    const yt = BALL_RADIUS;
    let T = flightTime;
    for (let i = 0; i < 60; i++) {
        const vx = (targetX - x0) / T;
        const vy = (yt - y0 + 0.5 * g * T * T) / T;
        const crossesNet = Math.sign(x0) !== Math.sign(targetX) && vx !== 0;
        if (!crossesNet)
            return { vx, vy, flightTime: T };
        const tn = -x0 / vx;
        const yn = y0 + vy * tn - 0.5 * g * tn * tn;
        if (yn >= NET_HEIGHT + BALL_RADIUS + 0.12)
            return { vx, vy, flightTime: T };
        T += 0.05;
    }
    const vx = (targetX - x0) / T;
    return { vx, vy: (yt - y0 + 0.5 * g * T * T) / T, flightTime: T };
}
