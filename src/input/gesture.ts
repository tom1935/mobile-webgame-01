// Touch gestures -> game commands. Pure logic (no DOM) so it can be unit-tested with numbers.
//
//  - Quick swipe (>= P.FLICK_MIN_PX within P.FLICK_MAX_MS)  -> 'flick' (hit the ball)
//  - Hold (finger down longer than P.HOLD_MS)            -> 'moveTo' following the finger
//  - Tap (short, small movement)                        -> 'moveTo' the tapped spot
// Every finger is tracked separately, so one thumb can hold-to-move while the other flicks.
import { P } from '../sim/params.ts';
import type { Command } from '../sim/types.ts';


type Mode = 'pending' | 'hold' | 'consumed';

interface Pointer {
  x0: number;
  y0: number;
  t0: number;
  x: number;
  y: number;
  mode: Mode;
}

export interface GestureState {
  pointers: Map<number, Pointer>;
  /** Screen (CSS px) -> court x (m). */
  toCourtX: (sx: number, sy: number) => number;
}

export function createGestureState(toCourtX: (sx: number, sy: number) => number): GestureState {
  return { pointers: new Map(), toCourtX };
}

function flick(p: Pointer, t: number): Command {
  return { cmd: 'flick', dx: p.x - p.x0, dy: p.y - p.y0, ms: Math.max(1, t - p.t0) };
}

export function pointerDown(g: GestureState, id: number, x: number, y: number, t: number): Command[] {
  g.pointers.set(id, { x0: x, y0: y, t0: t, x, y, mode: 'pending' });
  return [];
}

export function pointerMove(g: GestureState, id: number, x: number, y: number, t: number): Command[] {
  const p = g.pointers.get(id);
  if (!p) return [];
  p.x = x;
  p.y = y;
  if (p.mode === 'pending') {
    const dist = Math.hypot(x - p.x0, y - p.y0);
    if (dist >= P.FLICK_MIN_PX && t - p.t0 <= P.FLICK_MAX_MS) {
      p.mode = 'consumed';
      return [flick(p, t)];
    }
    if (t - p.t0 >= P.HOLD_MS) p.mode = 'hold';
  }
  if (p.mode === 'hold') return [{ cmd: 'moveTo', x: g.toCourtX(x, y) }];
  return [];
}

export function pointerUp(g: GestureState, id: number, x: number, y: number, t: number): Command[] {
  const p = g.pointers.get(id);
  if (!p) return [];
  g.pointers.delete(id);
  p.x = x;
  p.y = y;
  if (p.mode !== 'pending') return [];
  const dist = Math.hypot(x - p.x0, y - p.y0);
  if (dist >= P.FLICK_MIN_PX && t - p.t0 <= P.FLICK_MAX_MS * 1.5) return [flick(p, t)];
  return [{ cmd: 'moveTo', x: g.toCourtX(p.x0, p.y0) }];
}

/** Call every frame: turns a still finger into a hold after P.HOLD_MS. */
export function tick(g: GestureState, t: number): Command[] {
  const out: Command[] = [];
  for (const p of g.pointers.values()) {
    if (p.mode === 'pending' && t - p.t0 >= P.HOLD_MS) {
      p.mode = 'hold';
      out.push({ cmd: 'moveTo', x: g.toCourtX(p.x, p.y) });
    }
  }
  return out;
}

export function pointerCancel(g: GestureState, id: number): Command[] {
  g.pointers.delete(id);
  return [];
}
