// Touch gestures -> game commands. Pure logic (no DOM) so it can be unit-tested with numbers.
//
// The screen is split into zones so gestures never compete:
//   - 'jump'  (top band)           : touch down -> 'jump' immediately
//   - 'move'  (own court side)     : touch down / drag -> 'moveTo' the finger (immediately, no hold delay)
//   - 'flick' (opponent side)      : quick swipe -> 'flick' (hit the ball); taps do nothing
// Every finger is tracked separately, so one thumb can move while the other flicks.
import { P } from '../sim/params.ts';
import type { Command } from '../sim/types.ts';

export type Zone = 'jump' | 'move' | 'flick';

interface Pointer {
  zone: Zone;
  x0: number;
  y0: number;
  t0: number;
  done: boolean; // flick already sent
}

export interface GestureState {
  pointers: Map<number, Pointer>;
  /** Screen (CSS px) -> court x (m). */
  toCourtX: (sx: number, sy: number) => number;
  /** Which zone a touch that starts at this screen point belongs to. */
  zoneOf: (sx: number, sy: number) => Zone;
}

export function createGestureState(
  toCourtX: (sx: number, sy: number) => number,
  zoneOf: (sx: number, sy: number) => Zone,
): GestureState {
  return { pointers: new Map(), toCourtX, zoneOf };
}

function flick(p: Pointer, x: number, y: number, t: number): Command {
  return { cmd: 'flick', dx: x - p.x0, dy: y - p.y0, ms: Math.max(1, t - p.t0) };
}

export function pointerDown(g: GestureState, id: number, x: number, y: number, t: number): Command[] {
  const zone = g.zoneOf(x, y);
  g.pointers.set(id, { zone, x0: x, y0: y, t0: t, done: zone === 'jump' });
  if (zone === 'jump') return [{ cmd: 'jump' }];
  if (zone === 'move') return [{ cmd: 'moveTo', x: g.toCourtX(x, y) }];
  return [];
}

export function pointerMove(g: GestureState, id: number, x: number, y: number, t: number): Command[] {
  const p = g.pointers.get(id);
  if (!p) return [];
  if (p.zone === 'move') return [{ cmd: 'moveTo', x: g.toCourtX(x, y) }];
  if (p.zone === 'flick' && !p.done) {
    const dist = Math.hypot(x - p.x0, y - p.y0);
    if (dist >= P.FLICK_MIN_PX && t - p.t0 <= P.FLICK_MAX_MS) {
      p.done = true;
      return [flick(p, x, y, t)];
    }
  }
  return [];
}

export function pointerUp(g: GestureState, id: number, x: number, y: number, t: number): Command[] {
  const p = g.pointers.get(id);
  if (!p) return [];
  g.pointers.delete(id);
  if (p.zone !== 'flick' || p.done) return [];
  // A slower swipe still counts as a flick when the finger is lifted.
  const dist = Math.hypot(x - p.x0, y - p.y0);
  if (dist >= P.FLICK_MIN_PX && t - p.t0 <= P.FLICK_MAX_MS * 2) return [flick(p, x, y, t)];
  return [];
}

export function pointerCancel(g: GestureState, id: number): Command[] {
  g.pointers.delete(id);
  return [];
}
