export const FLICK_MIN_PX = 28;
export const FLICK_MAX_MS = 220;
export const HOLD_MS = 150;
export function createGestureState(toCourtX) {
    return { pointers: new Map(), toCourtX };
}
function flick(p, t) {
    return { cmd: 'flick', dx: p.x - p.x0, dy: p.y - p.y0, ms: Math.max(1, t - p.t0) };
}
export function pointerDown(g, id, x, y, t) {
    g.pointers.set(id, { x0: x, y0: y, t0: t, x, y, mode: 'pending' });
    return [];
}
export function pointerMove(g, id, x, y, t) {
    const p = g.pointers.get(id);
    if (!p)
        return [];
    p.x = x;
    p.y = y;
    if (p.mode === 'pending') {
        const dist = Math.hypot(x - p.x0, y - p.y0);
        if (dist >= FLICK_MIN_PX && t - p.t0 <= FLICK_MAX_MS) {
            p.mode = 'consumed';
            return [flick(p, t)];
        }
        if (t - p.t0 >= HOLD_MS)
            p.mode = 'hold';
    }
    if (p.mode === 'hold')
        return [{ cmd: 'moveTo', x: g.toCourtX(x, y) }];
    return [];
}
export function pointerUp(g, id, x, y, t) {
    const p = g.pointers.get(id);
    if (!p)
        return [];
    g.pointers.delete(id);
    p.x = x;
    p.y = y;
    if (p.mode !== 'pending')
        return [];
    const dist = Math.hypot(x - p.x0, y - p.y0);
    if (dist >= FLICK_MIN_PX && t - p.t0 <= FLICK_MAX_MS * 1.5)
        return [flick(p, t)];
    return [{ cmd: 'moveTo', x: g.toCourtX(p.x0, p.y0) }];
}
/** Call every frame: turns a still finger into a hold after HOLD_MS. */
export function tick(g, t) {
    const out = [];
    for (const p of g.pointers.values()) {
        if (p.mode === 'pending' && t - p.t0 >= HOLD_MS) {
            p.mode = 'hold';
            out.push({ cmd: 'moveTo', x: g.toCourtX(p.x, p.y) });
        }
    }
    return out;
}
export function pointerCancel(g, id) {
    g.pointers.delete(id);
    return [];
}
