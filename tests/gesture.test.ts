import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGestureState, pointerDown, pointerMove, pointerUp, type Zone } from '../src/input/gesture.ts';

// Screen 1000x400. 100 px = 1 m, screen x 0 = court x -10, net at screen x 1000.
// Top 100 px = jump zone, left of x=500 = move zone, rest = flick zone.
const toCourtX = (sx: number) => sx / 100 - 10;
const zoneOf = (sx: number, sy: number): Zone => (sy < 100 ? 'jump' : sx < 500 ? 'move' : 'flick');
const make = () => createGestureState(toCourtX, zoneOf);

test('touching the move zone moves immediately and follows the finger', () => {
  const g = make();
  assert.deepEqual(pointerDown(g, 1, 300, 300, 0), [{ cmd: 'moveTo', x: -7 }]);
  assert.deepEqual(pointerMove(g, 1, 450, 300, 30), [{ cmd: 'moveTo', x: -5.5 }]);
  // A fast drag in the move zone is still movement, never a flick.
  assert.deepEqual(pointerMove(g, 1, 200, 250, 40), [{ cmd: 'moveTo', x: -8 }]);
  assert.deepEqual(pointerUp(g, 1, 200, 250, 60), []);
});

test('dragging from the move zone into other zones keeps moving', () => {
  const g = make();
  pointerDown(g, 1, 400, 300, 0);
  assert.deepEqual(pointerMove(g, 1, 700, 50, 100), [{ cmd: 'moveTo', x: -3 }]);
});

test('quick swipe in the flick zone is a flick', () => {
  const g = make();
  assert.deepEqual(pointerDown(g, 1, 700, 300, 0), []);
  assert.deepEqual(pointerMove(g, 1, 702, 290, 16), []);
  const out = pointerMove(g, 1, 705, 260, 60);
  assert.equal(out.length, 1);
  assert.equal(out[0].cmd, 'flick');
  if (out[0].cmd === 'flick') {
    assert.equal(out[0].dy, -40);
    assert.equal(out[0].ms, 60);
  }
  assert.deepEqual(pointerUp(g, 1, 705, 200, 90), [], 'no second command after a flick');
});

test('slower swipe in the flick zone counts on release', () => {
  const g = make();
  pointerDown(g, 1, 700, 300, 0);
  assert.deepEqual(pointerMove(g, 1, 710, 300, 250), []);
  const out = pointerUp(g, 1, 740, 300, 300);
  assert.equal(out[0]?.cmd, 'flick');
});

test('tap in the flick zone does nothing', () => {
  const g = make();
  pointerDown(g, 1, 700, 300, 0);
  assert.deepEqual(pointerUp(g, 1, 703, 301, 80), []);
});

test('touching the top band jumps immediately, and that finger cannot flick', () => {
  const g = make();
  assert.deepEqual(pointerDown(g, 1, 800, 50, 0), [{ cmd: 'jump' }]);
  assert.deepEqual(pointerMove(g, 1, 850, 20, 30), []);
  assert.deepEqual(pointerUp(g, 1, 850, 20, 50), []);
});

test('two fingers: move with one, flick with the other', () => {
  const g = make();
  pointerDown(g, 1, 200, 300, 0);
  pointerDown(g, 2, 800, 300, 100);
  const out = pointerMove(g, 2, 840, 260, 140);
  assert.equal(out[0]?.cmd, 'flick');
  assert.deepEqual(pointerMove(g, 1, 250, 300, 150), [{ cmd: 'moveTo', x: -7.5 }]);
});
