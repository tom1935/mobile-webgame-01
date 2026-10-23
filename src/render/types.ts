import type { World } from '../sim/types.ts';

export interface ProbeItem {
  name: string; // 'ball', 'A1', ...
  simX: number;
  simY: number;
  screenX: number; // CSS px
  screenY: number;
  onScreen: boolean;
}

/** Anything that can draw the world. The 2D canvas view and the 3D view both implement this. */
export interface Renderer {
  resize(width: number, height: number, dpr: number): void;
  render(world: World): void;
  /** Screen point (CSS px) -> court x (m), used by touch-to-move. */
  screenToCourtX(sx: number, sy: number): number;
  /** Court point (m) -> screen (CSS px). */
  courtToScreen(x: number, y: number): { x: number; y: number };
  /** Where things are drawn on screen, for automated checks without screenshots. */
  probe(world: World): ProbeItem[];
}
