// window.__game: drive and inspect the running game from the browser console or Playwright.
// Enabled with ?debug=1. Everything returns plain JSON so no screenshot is needed.
import { renderAscii } from "../sim/ascii.js";
export function stateSummary(w) {
    const r = (n) => Math.round(n * 100) / 100;
    return {
        frame: w.frame,
        phase: w.phase,
        score: [w.score[0], w.score[1]],
        server: w.server,
        touchTeam: w.touchTeam,
        touches: w.touches,
        lastHitter: w.lastHitter,
        ball: { x: r(w.ball.x), y: r(w.ball.y), vx: r(w.ball.vx), vy: r(w.ball.vy) },
        plan: w.plan ? { landX: r(w.plan.landX), landFrame: w.plan.landFrame, side: w.plan.side, receiver: w.plan.receiver } : null,
        players: w.players.map((p) => ({
            name: p.name,
            x: r(p.x),
            y: r(p.y),
            vx: r(p.vx),
            targetX: p.targetX === null ? null : r(p.targetX),
            swing: p.swingFrames > 0 ? p.swing?.kind : null,
        })),
    };
}
export function installDebugApi(host) {
    const api = {
        getState: () => stateSummary(host.world()),
        pause: () => {
            host.paused = true;
        },
        resume: () => {
            host.paused = false;
        },
        step: (n = 1) => {
            host.paused = true;
            host.stepFrames(n);
            return stateSummary(host.world());
        },
        input: (cmd) => host.queue(cmd),
        getLog: (sinceFrame = 0) => host.world().events.filter((e) => e.f >= sinceFrame),
        ascii: () => renderAscii(host.world()),
        probe: () => host.probe(),
        courtToScreen: (x, y) => host.courtToScreen(x, y),
        exportReplay: () => JSON.stringify(host.replay()),
        restart: (opts) => host.restart(opts),
    };
    window.__game = api;
    return api;
}
