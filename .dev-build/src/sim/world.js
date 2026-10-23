// The whole game state and one fixed-step update. Pure logic: no rendering, no DOM, no clock.
import { predictBall, solveShot, stepBall } from "./ball.js";
import { DEFAULT_POINTS_TO_WIN, DT, HIT_COOLDOWN_FRAMES, POINT_PAUSE_FRAMES, SERVE_HOLD_HEIGHT, SERVE_X, SWING_BUFFER_FRAMES, } from "./constants.js";
import { updateBot } from "./ai.js";
import { checkInvariants } from "./invariants.js";
import { inReach, jump, onGround, sideSign, stepPlayer } from "./player.js";
import { createRng, gauss } from "./rng.js";
import { awardPoint, chooseReceiver, landingWinner, mayTouch, teamPlayers } from "./rules.js";
import { flickPower, flickToIntent, resolveHit, serveIntent } from "./shots.js";
export const HUMAN_ID = 0;
const DEFAULT_TEAMMATE = { reactionFrames: 8, speedFactor: 1.0, errorSigma: 0.35 };
const DEFAULT_OPPONENTS = { reactionFrames: 12, speedFactor: 0.95, errorSigma: 0.5 };
export function defaultConfig(overrides = {}) {
    return {
        seed: 1,
        pointsToWin: DEFAULT_POINTS_TO_WIN,
        autoplay: false,
        teammate: DEFAULT_TEAMMATE,
        opponents: DEFAULT_OPPONENTS,
        ...overrides,
    };
}
function makePlayer(id, name, team, z) {
    return {
        id,
        name,
        team,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        z,
        targetX: null,
        swingFrames: 0,
        swing: null,
        cooldown: 0,
        lastHitFrame: -999,
        lastJumpFrame: -999,
    };
}
export function createWorld(config = defaultConfig()) {
    const world = {
        config,
        frame: 0,
        rng: createRng(config.seed),
        phase: 'serveWait',
        phaseFrame: 0,
        ball: { x: 0, y: SERVE_HOLD_HEIGHT, vx: 0, vy: 0 },
        players: [
            makePlayer(0, 'A1', 0, 1.0),
            makePlayer(1, 'A2', 0, -1.6),
            makePlayer(2, 'B1', 1, -1.6),
            makePlayer(3, 'B2', 1, 1.0),
        ],
        score: { 0: 0, 1: 0 },
        servingTeam: 1,
        // When a team wins the serve back, its index advances first. Team 0 starts at 1
        // so the human (index 0) is the first server of team 0.
        serverIndex: [1, 0],
        server: 2,
        touches: 0,
        touchTeam: null,
        lastHitter: -1,
        plan: null,
        planFrame: 0,
        events: [],
        winner: null,
    };
    setupServe(world);
    return world;
}
export function isBot(world, p) {
    return p.id !== HUMAN_ID || world.config.autoplay;
}
function difficultyOf(world, p) {
    return p.team === 0 ? world.config.teammate : world.config.opponents;
}
function setPhase(world, phase) {
    world.phase = phase;
    world.phaseFrame = world.frame;
}
export function setupServe(world) {
    const team = world.servingTeam;
    const server = teamPlayers(world, team)[world.serverIndex[team]];
    world.server = server.id;
    for (const p of world.players) {
        const s = sideSign(p.team);
        p.y = 0;
        p.vx = 0;
        p.vy = 0;
        p.swing = null;
        p.swingFrames = 0;
        p.cooldown = 0;
        p.targetX = null;
        const idx = teamPlayers(world, p.team).indexOf(p);
        if (p === server)
            p.x = s * SERVE_X;
        else if (p.team === team)
            p.x = s * 3.0;
        else
            p.x = s * (idx === 0 ? 5.0 : 3.0);
    }
    world.touches = 0;
    world.touchTeam = null;
    world.lastHitter = -1;
    world.plan = null;
    holdBallForServe(world);
    setPhase(world, 'serveWait');
}
function holdBallForServe(world) {
    const server = world.players[world.server];
    world.ball.x = server.x - sideSign(server.team) * 0.3;
    world.ball.y = SERVE_HOLD_HEIGHT;
    world.ball.vx = 0;
    world.ball.vy = 0;
}
function replan(world) {
    const pred = predictBall(world.ball);
    const plan = {
        landX: pred.landX,
        landFrame: world.frame + pred.frames,
        path: pred.path,
        side: (pred.landX < 0 ? 0 : 1),
        receiver: -1,
    };
    plan.receiver = chooseReceiver(world, plan);
    world.plan = plan;
    world.planFrame = world.frame;
}
function serve(world, p, intent) {
    const b = world.ball;
    const v = solveShot(b.x, b.y, intent.targetX + gauss(world.rng, intent.error), intent.flightTime);
    b.vx = v.vx;
    b.vy = v.vy;
    world.lastHitter = p.id;
    world.touchTeam = p.team;
    world.touches = 0; // the serve is not one of the 3 touches
    p.lastHitFrame = world.frame;
    p.cooldown = HIT_COOLDOWN_FRAMES;
    world.events.push({ f: world.frame, type: 'serve', player: p.id, x: b.x, y: b.y, vx: b.vx, vy: b.vy });
    setPhase(world, 'rally');
    replan(world);
}
function applyHumanCommand(world, p, c) {
    switch (c.cmd) {
        case 'moveTo':
            p.targetX = c.x;
            break;
        case 'stop':
            p.targetX = null;
            break;
        case 'jump':
            if (world.phase === 'rally' || (world.phase === 'serveWait' && world.server !== p.id)) {
                if (jump(p)) {
                    p.lastJumpFrame = world.frame;
                    world.events.push({ f: world.frame, type: 'jump', player: p.id, x: p.x });
                }
            }
            break;
        case 'flick':
            if (world.phase === 'serveWait' && world.server === p.id) {
                serve(world, p, serveIntent(p.team, flickPower(c.dx, c.dy, c.ms), 0.3));
            }
            else if (world.phase === 'rally') {
                p.swing = flickToIntent(world, p, c.dx, c.dy, c.ms);
                p.swingFrames = SWING_BUFFER_FRAMES;
            }
            break;
    }
}
function tryHit(world, p) {
    if (p.swingFrames <= 0 || !p.swing)
        return false;
    if (!mayTouch(world, p) || !inReach(p, world.ball))
        return false;
    // Wait for the closest approach: if the ball will be still in reach and closer next frame, hit then.
    const b0 = world.ball;
    const nb = { x: b0.x + b0.vx * DT, y: b0.y + b0.vy * DT, vx: b0.vx, vy: b0.vy };
    if (p.swingFrames > 1 && inReach(p, nb) && Math.abs(nb.x - p.x) < Math.abs(b0.x - p.x) - 1e-4)
        return false;
    const touchNo = (world.touchTeam === p.team ? world.touches : 0) + 1;
    const r = resolveHit(world, p, p.swing, touchNo);
    p.swing = null;
    p.swingFrames = 0;
    if (!r) {
        // Missed completely: the ball keeps flying, the player can't retry right away.
        p.cooldown = HIT_COOLDOWN_FRAMES;
        world.events.push({ f: world.frame, type: 'miss', player: p.id, x: world.ball.x, y: world.ball.y });
        return false;
    }
    if (world.touchTeam !== p.team) {
        world.touchTeam = p.team;
        world.touches = 0;
    }
    world.touches += 1;
    const b = world.ball;
    b.vx = r.vx;
    b.vy = r.vy;
    world.lastHitter = p.id;
    p.lastHitFrame = world.frame;
    p.cooldown = HIT_COOLDOWN_FRAMES;
    p.swing = null;
    p.swingFrames = 0;
    world.events.push({
        f: world.frame,
        type: 'hit',
        player: p.id,
        team: p.team,
        touch: world.touches,
        kind: r.kind,
        x: b.x,
        y: b.y,
        vx: b.vx,
        vy: b.vy,
        targetX: r.targetX,
    });
    return true;
}
function stepRally(world) {
    for (const p of world.players)
        stepPlayer(p, isBot(world, p) ? difficultyOf(world, p).speedFactor : 1);
    // Hits happen before the ball moves so a ball in reach this frame can be played.
    let hit = false;
    for (const p of world.players) {
        if (!hit && tryHit(world, p))
            hit = true;
    }
    if (hit)
        replan(world);
    for (const p of world.players) {
        if (p.swingFrames > 0) {
            p.swingFrames -= 1;
            if (p.swingFrames === 0 && p.swing && !isBot(world, p)) {
                const why = !inReach(p, world.ball)
                    ? `ball out of reach (dx=${(world.ball.x - p.x).toFixed(2)}, dy=${(world.ball.y - p.y).toFixed(2)})`
                    : 'not allowed to touch';
                world.events.push({ f: world.frame, type: 'whiff', player: p.id, reason: why });
                p.swing = null;
            }
        }
        if (p.cooldown > 0)
            p.cooldown -= 1;
    }
    const r = stepBall(world.ball);
    if (r.net) {
        world.events.push({ f: world.frame, type: 'net', x: world.ball.x, y: world.ball.y });
        replan(world);
    }
    if (r.crossed) {
        const toTeam = world.ball.x < 0 ? 0 : 1;
        world.events.push({ f: world.frame, type: 'cross', toTeam, y: world.ball.y });
        world.touchTeam = null;
        world.touches = 0;
        if (world.plan)
            world.plan.receiver = chooseReceiver(world, world.plan);
    }
    if (r.landed) {
        const x = world.ball.x;
        const side = x < 0 ? 0 : 1;
        const w = landingWinner(world, x);
        world.events.push({ f: world.frame, type: 'land', x, side, inCourt: Math.abs(x) <= 8.15 });
        world.ball.vx = 0;
        world.ball.vy = 0;
        awardPoint(world, w.team, w.reason);
        setPhase(world, 'pointEnd');
    }
}
/** Advance the world by one fixed step. `commands` are for the human player this frame. */
export function step(world, commands = []) {
    const human = world.players[HUMAN_ID];
    if (!world.config.autoplay)
        for (const c of commands)
            applyHumanCommand(world, human, c);
    for (const p of world.players) {
        if (!isBot(world, p))
            continue;
        const act = updateBot(world, p, difficultyOf(world, p));
        if (act.jumped) {
            p.lastJumpFrame = world.frame;
            world.events.push({ f: world.frame, type: 'jump', player: p.id, x: p.x });
        }
        if (act.serve && world.phase === 'serveWait')
            serve(world, p, act.serve);
    }
    switch (world.phase) {
        case 'serveWait': {
            for (const p of world.players) {
                if (p.id === world.server)
                    continue;
                stepPlayer(p, isBot(world, p) ? difficultyOf(world, p).speedFactor : 1);
            }
            holdBallForServe(world);
            break;
        }
        case 'rally':
            stepRally(world);
            break;
        case 'pointEnd':
            for (const p of world.players) {
                p.targetX = null;
                stepPlayer(p, 1);
            }
            if (world.frame - world.phaseFrame >= POINT_PAUSE_FRAMES) {
                if (world.winner !== null) {
                    world.events.push({
                        f: world.frame,
                        type: 'matchEnd',
                        winner: world.winner,
                        score: [world.score[0], world.score[1]],
                    });
                    setPhase(world, 'matchEnd');
                }
                else {
                    setupServe(world);
                }
            }
            break;
        case 'matchEnd':
            break;
    }
    for (const msg of checkInvariants(world)) {
        world.events.push({ f: world.frame, type: 'violation', message: msg });
    }
    world.frame += 1;
}
export { onGround };
