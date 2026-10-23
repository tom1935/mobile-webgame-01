// window.__game: drive and inspect the running game from the browser console or Playwright.
// Enabled with ?debug=1. Everything returns plain JSON so no screenshot is needed.
import { renderAscii } from '../sim/ascii.ts';
import type { Command, GameEvent, World } from '../sim/types.ts';
import type { ProbeItem } from '../render/types.ts';
import { P } from '../sim/params.ts';

export interface GameHost {
  world(): World;
  paused: boolean;
  queue(cmd: Command): void;
  stepFrames(n: number): void;
  restart(opts?: { seed?: number; autoplay?: boolean }): void;
  replay(): { seed: number; autoplay: boolean; points: number; commands: ({ f: number } & Command)[] };
  probe(): ProbeItem[];
  courtToScreen(x: number, y: number): { x: number; y: number };
}

export interface DebugApi {
  getState(): unknown;
  pause(): void;
  resume(): void;
  step(n?: number): unknown;
  input(cmd: Command): void;
  getLog(sinceFrame?: number): GameEvent[];
  ascii(): string;
  probe(): ProbeItem[];
  courtToScreen(x: number, y: number): { x: number; y: number };
  exportReplay(): string;
  restart(opts?: { seed?: number; autoplay?: boolean }): void;
  getParams(): Record<string, number>;
}

export function stateSummary(w: World): unknown {
  const r = (n: number) => Math.round(n * 100) / 100;
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

export function installDebugApi(host: GameHost): DebugApi {
  const api: DebugApi = {
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
    getParams: () => ({ ...P }),
  };
  (window as unknown as { __game: DebugApi }).__game = api;
  return api;
}
