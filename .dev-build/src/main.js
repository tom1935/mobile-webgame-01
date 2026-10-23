// Browser entry: fixed-step game loop + touch input + rendering + HUD + debug hooks.
// URL options: ?debug=1  ?seed=123  ?autoplay=1  ?points=7  ?view=2d
import { installDebugApi } from "./debug/api.js";
import { createOverlay } from "./debug/overlay.js";
import { createGestureState, pointerCancel, pointerDown, pointerMove, pointerUp, tick } from "./input/gesture.js";
import { createCanvas2DRenderer } from "./render/canvas2d.js";
import { DT } from "./sim/constants.js";
import { createWorld, defaultConfig, step } from "./sim/world.js";
import { createHud } from "./ui/hud.js";
const params = new URLSearchParams(location.search);
const debug = params.get('debug') === '1';
const points = Number(params.get('points') ?? 15);
const canvas = document.querySelector('#game');
const hud = createHud(document.querySelector('#hud'));
const jumpButton = document.querySelector('#jump');
const overlay = debug ? createOverlay(document.querySelector('#debug')) : null;
function newSeed() {
    return params.has('seed') ? Number(params.get('seed')) : Math.floor(Math.random() * 1e9);
}
let world = createWorld(defaultConfig({ seed: newSeed(), autoplay: params.get('autoplay') === '1', pointsToWin: points }));
let pending = [];
let recorded = [];
const renderer = createCanvas2DRenderer(canvas);
function resize() {
    renderer.resize(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio || 1, 2));
}
window.addEventListener('resize', resize);
resize();
function stepOnce() {
    for (const c of pending)
        recorded.push({ f: world.frame, ...c });
    step(world, pending);
    pending = [];
}
const host = {
    world: () => world,
    paused: false,
    queue: (cmd) => pending.push(cmd),
    stepFrames: (n) => {
        for (let i = 0; i < n; i++)
            stepOnce();
        renderer.render(world);
    },
    restart: (opts = {}) => {
        world = createWorld(defaultConfig({
            seed: opts.seed ?? newSeed(),
            autoplay: opts.autoplay ?? world.config.autoplay,
            pointsToWin: world.config.pointsToWin,
        }));
        pending = [];
        recorded = [];
    },
    replay: () => ({
        seed: world.config.seed,
        autoplay: world.config.autoplay,
        points: world.config.pointsToWin,
        commands: recorded,
    }),
    probe: () => renderer.probe(world),
    courtToScreen: (x, y) => renderer.courtToScreen(x, y),
};
if (debug)
    installDebugApi(host);
// --- Input --------------------------------------------------------------------------
const gesture = createGestureState((sx, sy) => renderer.screenToCourtX(sx, sy));
const pushAll = (cmds) => {
    for (const c of cmds)
        pending.push(c);
};
canvas.addEventListener('pointerdown', (e) => {
    if (world.phase === 'matchEnd') {
        host.restart();
        return;
    }
    canvas.setPointerCapture(e.pointerId);
    pushAll(pointerDown(gesture, e.pointerId, e.clientX, e.clientY, performance.now()));
});
canvas.addEventListener('pointermove', (e) => {
    pushAll(pointerMove(gesture, e.pointerId, e.clientX, e.clientY, performance.now()));
});
canvas.addEventListener('pointerup', (e) => {
    pushAll(pointerUp(gesture, e.pointerId, e.clientX, e.clientY, performance.now()));
});
canvas.addEventListener('pointercancel', (e) => {
    pushAll(pointerCancel(gesture, e.pointerId));
});
jumpButton.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    pending.push({ cmd: 'jump' });
});
// Keyboard for desktop testing: arrows move, space jumps, W/D/S flick up/forward/down-forward.
window.addEventListener('keydown', (e) => {
    const me = world.players[0];
    if (e.key === 'ArrowLeft')
        pending.push({ cmd: 'moveTo', x: me.x - 1.5 });
    else if (e.key === 'ArrowRight')
        pending.push({ cmd: 'moveTo', x: me.x + 1.5 });
    else if (e.key === ' ')
        pending.push({ cmd: 'jump' });
    else if (e.key === 'w')
        pending.push({ cmd: 'flick', dx: 0, dy: -120, ms: 80 });
    else if (e.key === 'd')
        pending.push({ cmd: 'flick', dx: 120, dy: -40, ms: 70 });
    else if (e.key === 's')
        pending.push({ cmd: 'flick', dx: 120, dy: 60, ms: 60 });
});
// --- Loop ---------------------------------------------------------------------------
let acc = 0;
let last = performance.now();
let fps = 60;
document.addEventListener('visibilitychange', () => {
    last = performance.now();
    acc = 0;
});
function frame(now) {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    fps = fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
    pushAll(tick(gesture, now));
    if (!host.paused) {
        acc += dt;
        while (acc >= DT) {
            stepOnce();
            acc -= DT;
        }
    }
    renderer.render(world);
    hud.update(world);
    if (overlay && world.frame % 4 === 0)
        overlay(world, fps);
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
