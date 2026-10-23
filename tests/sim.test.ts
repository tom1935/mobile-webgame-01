import assert from 'node:assert/strict';
import { test } from 'node:test';
import { predictBall, solveShot, stepBall } from '../src/sim/ball.ts';
import { NET_HEIGHT } from '../src/sim/constants.ts';
import { landingWinner } from '../src/sim/rules.ts';
import type { Command, World } from '../src/sim/types.ts';
import { createVirtualHuman, virtualHumanCommands } from '../src/sim/virtual-human.ts';
import { createWorld, defaultConfig, step } from '../src/sim/world.ts';

function run(world: World, frames: number, input?: (w: World) => Command[]): void {
  for (let i = 0; i < frames && world.phase !== 'matchEnd'; i++) step(world, input ? input(world) : []);
}

test('solveShot lands the ball on the target', () => {
  const v = solveShot(-3, 1.2, -1.5, 1.5);
  const p = predictBall({ x: -3, y: 1.2, vx: v.vx, vy: v.vy });
  assert.ok(Math.abs(p.landX - -1.5) < 0.1, `landX=${p.landX}`);
});

test('solveShot raises the arc so the ball clears the net', () => {
  // A flat shot from low near the net would hit the net without the fix.
  const v = solveShot(-1, 1.0, 3, 0.3);
  const p = predictBall({ x: -1, y: 1.0, vx: v.vx, vy: v.vy });
  const atNet = p.path.find((q) => q.x >= 0);
  assert.ok(atNet && atNet.y > NET_HEIGHT, `y at net = ${atNet?.y}`);
  assert.ok(Math.abs(p.landX - 3) < 0.15, `landX=${p.landX}`);
});

test('a ball thrown into the net bounces back', () => {
  const ball = { x: -2, y: 1.0, vx: 8, vy: 0 };
  let net = false;
  for (let i = 0; i < 120; i++) {
    const r = stepBall(ball);
    net ||= r.net;
    assert.ok(ball.x < 0, `ball went through the net at x=${ball.x}`);
    if (r.landed) break;
  }
  assert.ok(net);
});

test('landing rules', () => {
  const w = createWorld();
  assert.equal(landingWinner(w, -3).team, 1, 'in team 0 court -> team 1 scores');
  assert.equal(landingWinner(w, 5).team, 0, 'in team 1 court -> team 0 scores');
  w.lastHitter = 0; // team 0 hit it out
  assert.equal(landingWinner(w, 9.5).team, 1);
  w.lastHitter = 3; // team 1 hit it out on team 0 side
  assert.equal(landingWinner(w, -9.5).team, 0);
});

test('same seed + same input = same game (determinism)', () => {
  const a = createWorld(defaultConfig({ seed: 42, autoplay: true }));
  const b = createWorld(defaultConfig({ seed: 42, autoplay: true }));
  run(a, 3000);
  run(b, 3000);
  assert.deepEqual(a.events, b.events);
  assert.deepEqual(a.ball, b.ball);
});

test('bot matches finish without invariant violations', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const w = createWorld(defaultConfig({ seed, autoplay: true, pointsToWin: 7 }));
    run(w, 60 * 60 * 10);
    const violations = w.events.filter((e) => e.type === 'violation');
    assert.deepEqual(violations, [], `seed ${seed}`);
    assert.equal(w.phase, 'matchEnd', `seed ${seed} did not finish`);
  }
});

test('the human player can play through touch-like commands only', () => {
  const w = createWorld(defaultConfig({ seed: 7, pointsToWin: 7 }));
  const vh = createVirtualHuman();
  run(w, 60 * 60 * 10, (world) => virtualHumanCommands(world, vh));
  const humanHits = w.events.filter((e) => e.type === 'hit' && e.player === 0);
  const humanServes = w.events.filter((e) => e.type === 'serve' && e.player === 0);
  assert.ok(humanHits.length > 10, `human hits: ${humanHits.length}`);
  assert.ok(humanServes.length > 0, 'human served');
  assert.equal(w.phase, 'matchEnd');
});

test('flick up when the ball arrives sends it up on own side', () => {
  const w = createWorld(defaultConfig({ seed: 3 }));
  // Put the game into a rally with the ball dropping onto the human.
  w.phase = 'rally';
  const me = w.players[0];
  me.x = -4;
  w.ball = { x: -4.3, y: 2.3, vx: 0.5, vy: -2 }; // enters reach (2.15 m) within the flick buffer
  w.touchTeam = null;
  step(w, [{ cmd: 'flick', dx: 0, dy: -100, ms: 80 }]);
  run(w, 30);
  const hit = w.events.find((e) => e.type === 'hit');
  assert.ok(hit && hit.type === 'hit', 'ball was hit');
  if (hit.type === 'hit') {
    assert.equal(hit.player, 0);
    assert.ok(hit.vy > 0, 'ball goes up');
    assert.ok(hit.targetX < 0, 'stays on own side');
  }
});

test('flick without a ball nearby logs a whiff with the reason', () => {
  const w = createWorld(defaultConfig({ seed: 3 }));
  w.phase = 'rally';
  w.players[0].x = -6;
  w.ball = { x: 4, y: 5, vx: 0, vy: 0 };
  step(w, [{ cmd: 'flick', dx: 50, dy: -10, ms: 60 }]);
  run(w, 15);
  const whiff = w.events.find((e) => e.type === 'whiff');
  assert.ok(whiff && whiff.type === 'whiff' && whiff.reason.startsWith('ball out of reach'));
});
