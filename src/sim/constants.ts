// All units are meters / seconds. x = along the court (net at x = 0), y = height.
// Team 0 plays on the left (x < 0) and attacks toward +x. Team 1 is on the right.

export const FPS = 60;
export const DT = 1 / FPS;

export const COURT_HALF = 8; // each side is 8 m deep (beach court is 16 m long)
export const NET_HEIGHT = 2.24;
export const NET_THICKNESS = 0.06; // half thickness used for collision
export const WALL_X = 11; // players can move a bit behind the back line

export const BALL_RADIUS = 0.15; // a bit bigger than real for forgiveness
export const NET_BOUNCE = 0.3; // fraction of vx kept (reversed) when hitting the net

export const PLAYER_MIN_NET_GAP = 0.3; // players stay this far from the net

// Reach box relative to the player's feet. Ball center must be inside to be hit.
export const REACH_X = 0.75;
export const REACH_BOTTOM = 0.2;
export const REACH_TOP = 2.15;

// Input buffering: a flick stays "armed" for this many frames waiting for the ball.
export const SWING_BUFFER_FRAMES = 10;
// After a hit the same player cannot touch again for a while.
export const HIT_COOLDOWN_FRAMES = 18;

export const MAX_TOUCHES = 3;
export const POINT_PAUSE_FRAMES = 90;
export const SERVE_BOT_DELAY_FRAMES = 70;
export const SERVE_X = 8.6; // server stands just behind the back line
export const SERVE_HOLD_HEIGHT = 1.9; // where the ball floats while waiting for the serve

export const DEFAULT_POINTS_TO_WIN = 15;

// Tunable feel parameters (speeds, jump, shot flight times) live in params.ts.
