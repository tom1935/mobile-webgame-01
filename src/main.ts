// Browser entry: fixed-step game loop + touch input + rendering + HUD + debug hooks.
// URL options: ?debug=1  ?tune=1  ?seed=123  ?autoplay=1  ?points=7  ?view=2d  ?quality=high|low
//              ?look=KEY:VAL,... (3D look values, src/render/look.ts)
//              ?scene=ref (3D only: camera + scenery blockout of the reference picture, game frozen)
import { installDebugApi, type GameHost } from './debug/api.ts';
import { createOverlay } from './debug/overlay.ts';
import { installTunePanel } from './debug/tune-panel.ts';
import { createGestureState, pointerCancel, pointerDown, pointerMove, pointerUp, type Zone } from './input/gesture.ts';
import { createCanvas2DRenderer } from './render/canvas2d.ts';
import { applyLookFromUrl } from './render/look.ts';
import { createThreeRenderer, webglAvailable } from './render/three3d.ts';
import type { Renderer } from './render/types.ts';
import { DT } from './sim/constants.ts';
import { P } from './sim/params.ts';
import type { Command, World } from './sim/types.ts';
import { createWorld, defaultConfig, step } from './sim/world.ts';
import { createHud } from './ui/hud.ts';

const params = new URLSearchParams(location.search);
const debug = params.get('debug') === '1';
const points = Number(params.get('points') ?? 15);
const refShot = params.get('scene') === 'ref';
applyLookFromUrl(location.search);

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const hud = createHud(document.querySelector<HTMLElement>('#hud')!);
const overlay = debug ? createOverlay(document.querySelector<HTMLElement>('#debug')!) : null;

function newSeed(): number {
  return params.has('seed') ? Number(params.get('seed')) : Math.floor(Math.random() * 1e9);
}

let world: World = createWorld(
  defaultConfig({ seed: newSeed(), autoplay: params.get('autoplay') === '1', pointsToWin: points }),
);
let pending: Command[] = [];
let recorded: ({ f: number } & Command)[] = [];

// 3D by default; ?view=2d (or no WebGL2) uses the simple 2D side view.
const quality = params.get('quality');
const renderer: Renderer =
  params.get('view') === '2d' || !webglAvailable()
    ? createCanvas2DRenderer(canvas)
    : createThreeRenderer(canvas, world, quality === 'high' || quality === 'low' ? quality : null, refShot);

let resized = true;
function resize(): void {
  resized = true;
  renderer.resize(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio || 1, 2));
}
window.addEventListener('resize', resize);
resize();

function stepOnce(): void {
  for (const c of pending) recorded.push({ f: world.frame, ...c });
  step(world, pending);
  pending = [];
}

const host: GameHost = {
  world: () => world,
  paused: false,
  queue: (cmd) => pending.push(cmd),
  stepFrames: (n) => {
    for (let i = 0; i < n; i++) stepOnce();
    renderer.render(world);
    drawnWorld = world;
    drawnFrame = world.frame;
  },
  restart: (opts = {}) => {
    world = createWorld(
      defaultConfig({
        seed: opts.seed ?? newSeed(),
        autoplay: opts.autoplay ?? world.config.autoplay,
        pointsToWin: world.config.pointsToWin,
      }),
    );
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
  renderInfo: () => renderer.info(),
};
if (debug) installDebugApi(host);
if (debug || params.get('tune') === '1') {
  installTunePanel({ setPaused: (v) => (host.paused = v), isPaused: () => host.paused });
}

// --- Input --------------------------------------------------------------------------
// Zones: top band = jump, own side of the net = move, opponent side = flick.
function zoneOf(sx: number, sy: number): Zone {
  if (sy < window.innerHeight * P.JUMP_ZONE_RATIO) return 'jump';
  return sx < renderer.courtToScreen(0, 0).x ? 'move' : 'flick';
}
const gesture = createGestureState((sx, sy) => renderer.screenToCourtX(sx, sy), zoneOf);
const pushAll = (cmds: Command[]) => {
  for (const c of cmds) pending.push(c);
};

// e.timeStamp = when the touch happened, so a slow frame does not stretch a flick past FLICK_MAX_MS.
canvas.addEventListener('pointerdown', (e) => {
  if (world.phase === 'matchEnd') {
    host.restart();
    return;
  }
  canvas.setPointerCapture(e.pointerId);
  pushAll(pointerDown(gesture, e.pointerId, e.clientX, e.clientY, e.timeStamp));
});
canvas.addEventListener('pointermove', (e) => {
  pushAll(pointerMove(gesture, e.pointerId, e.clientX, e.clientY, e.timeStamp));
});
canvas.addEventListener('pointerup', (e) => {
  pushAll(pointerUp(gesture, e.pointerId, e.clientX, e.clientY, e.timeStamp));
});
canvas.addEventListener('pointercancel', (e) => {
  pushAll(pointerCancel(gesture, e.pointerId));
});
// Keyboard for desktop testing: arrows move, space jumps, W/D/S flick up/forward/down-forward.
window.addEventListener('keydown', (e) => {
  const me = world.players[0];
  if (e.key === 'ArrowLeft') pending.push({ cmd: 'moveTo', x: me.x - 1.5 });
  else if (e.key === 'ArrowRight') pending.push({ cmd: 'moveTo', x: me.x + 1.5 });
  else if (e.key === ' ') pending.push({ cmd: 'jump' });
  else if (e.key === 'w') pending.push({ cmd: 'flick', dx: 0, dy: -120, ms: 80 });
  else if (e.key === 'd') pending.push({ cmd: 'flick', dx: 120, dy: -40, ms: 70 });
  else if (e.key === 's') pending.push({ cmd: 'flick', dx: 120, dy: 60, ms: 60 });
});

// --- Loop ---------------------------------------------------------------------------
let acc = 0;
let last = performance.now();
let drawnWorld: World | null = null;
let drawnFrame = -1;
let fps = 60;
document.addEventListener('visibilitychange', () => {
  last = performance.now();
  acc = 0;
});

function frame(now: number): void {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  fps = fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
  if (!host.paused && !refShot) {
    acc += dt;
    while (acc >= DT) {
      stepOnce();
      acc -= DT;
    }
  }
  // While paused, draw only when something changed (step / restart / resize): the 3D view is heavy.
  if (!host.paused || refShot || world !== drawnWorld || world.frame !== drawnFrame || resized) {
    renderer.render(world);
    drawnWorld = world;
    drawnFrame = world.frame;
    resized = false;
  }
  hud.update(world, renderer.courtToScreen(0, 0).x, window.innerHeight * P.JUMP_ZONE_RATIO);
  if (overlay && world.frame % 4 === 0) overlay(world, fps);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
