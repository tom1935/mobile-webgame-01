import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGestureState, pointerDown, pointerMove, pointerUp, tick } from '../src/input/gesture.ts';

// 100 px of screen = 1 m of court, screen x 0 = court x -10
const toCourtX = (sx: number) => sx / 100 - 10;

test('quick swipe up becomes a flick while the finger is still moving', () => {
  const g = createGestureState(toCourtX);
  pointerDown(g, 1, 500, 300, 0);
  assert.deepEqual(pointerMove(g, 1, 502, 290, 16), []);
  const out = pointerMove(g, 1, 505, 260, 60);
  assert.equal(out.length, 1);
  assert.equal(out[0].cmd, 'flick');
  if (out[0].cmd === 'flick') {
    assert.equal(out[0].dy, -40);
    assert.equal(out[0].ms, 60);
  }
  assert.deepEqual(pointerUp(g, 1, 505, 200, 90), [], 'no second command after a flick');
});

test('tap moves the player to the tapped spot', () => {
  const g = createGestureState(toCourtX);
  pointerDown(g, 1, 300, 400, 0);
  assert.deepEqual(pointerUp(g, 1, 303, 401, 80), [{ cmd: 'moveTo', x: -7 }]);
});

test('holding still becomes a hold, then follows the finger', () => {
  const g = createGestureState(toCourtX);
  pointerDown(g, 1, 300, 400, 0);
  assert.deepEqual(tick(g, 100), []);
  assert.deepEqual(tick(g, 160), [{ cmd: 'moveTo', x: -7 }]);
  assert.deepEqual(pointerMove(g, 1, 450, 400, 300), [{ cmd: 'moveTo', x: -5.5 }]);
  // A fast move during a hold is NOT a flick.
  assert.deepEqual(pointerMove(g, 1, 600, 300, 310), [{ cmd: 'moveTo', x: -4 }]);
  assert.deepEqual(pointerUp(g, 1, 600, 300, 400), []);
});

test('slow drag is a hold, not a flick', () => {
  const g = createGestureState(toCourtX);
  pointerDown(g, 1, 300, 400, 0);
  pointerMove(g, 1, 305, 400, 100);
  const out = pointerMove(g, 1, 340, 400, 250);
  assert.equal(out[0]?.cmd, 'moveTo');
});

test('two fingers: hold to move with one, flick with the other', () => {
  const g = createGestureState(toCourtX);
  pointerDown(g, 1, 200, 400, 0);
  tick(g, 200);
  pointerDown(g, 2, 800, 400, 300);
  const out = pointerMove(g, 2, 840, 360, 340);
  assert.equal(out[0]?.cmd, 'flick');
  assert.deepEqual(pointerMove(g, 1, 250, 400, 350), [{ cmd: 'moveTo', x: -7.5 }]);
});
