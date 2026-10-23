// Sanity checks run after every step. Any message returned becomes a 'violation' event.
import { MAX_TOUCHES, NET_HEIGHT, PLAYER_MIN_NET_GAP } from "./constants.js";
const memo = new WeakMap();
export function checkInvariants(world) {
    const out = [];
    const b = world.ball;
    const nums = [b.x, b.y, b.vx, b.vy, ...world.players.flatMap((p) => [p.x, p.y, p.vx, p.vy])];
    if (nums.some((n) => !Number.isFinite(n)))
        out.push('NaN/Infinity in state');
    for (const p of world.players) {
        const ownSide = p.team === 0 ? p.x <= -PLAYER_MIN_NET_GAP + 1e-6 : p.x >= PLAYER_MIN_NET_GAP - 1e-6;
        if (!ownSide)
            out.push(`${p.name} crossed to the other side (x=${p.x.toFixed(2)})`);
        if (p.y < -1e-6)
            out.push(`${p.name} below the sand (y=${p.y.toFixed(3)})`);
    }
    if (world.touches > MAX_TOUCHES)
        out.push(`touches=${world.touches} > ${MAX_TOUCHES}`);
    if (b.y < 0)
        out.push(`ball below the sand (y=${b.y.toFixed(3)})`);
    const m = memo.get(world);
    if (m && world.phase === 'rally') {
        const crossed = Math.sign(m.prevBallX) !== Math.sign(b.x) && m.prevBallX !== 0 && b.x !== 0;
        if (crossed && Math.min(m.prevBallY, b.y) < NET_HEIGHT) {
            out.push(`ball passed through the net (y=${b.y.toFixed(2)})`);
        }
    }
    memo.set(world, { prevBallX: b.x, prevBallY: b.y });
    return out;
}
