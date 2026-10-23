// All units are meters / seconds. x = along the court (net at x = 0), y = height.
// Team 0 plays on the left (x < 0) and attacks toward +x. Team 1 is on the right.

export const FPS = 60;
export const DT = 1 / FPS;

export const COURT_HALF = 8; // each side is 8 m deep (beach court is 16 m long)
export const NET_HEIGHT = 2.24;
export const NET_THICKNESS = 0.06; // half thickness used for collision
export const WALL_X = 11; // players can move a bit behind the back line

export const BALL_RADIUS = 0.15; // a bit bigger than real for forgiveness
export const BALL_GRAVITY = 6.5; // floaty arcade gravity
export const NET_BOUNCE = 0.3; // fraction of vx kept (reversed) when hitting the net

export const PLAYER_SPEED = 5.0;
export const PLAYER_ACCEL = 40;
export const PLAYER_GRAVITY = 22;
export const JUMP_VELOCITY = 7.4; // ~1.25 m jump (arcade)
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

// Shot flight times (seconds). Shorter = faster, flatter.
export const T_PASS = 1.7;
export const T_SET = 1.8;
export const T_LOB = 1.6;
export const T_DRIVE = 0.9;
export const T_SPIKE = 0.4;
export const T_SERVE = 1.7;
export const MAX_ATTACK_VX = 13; // m/s, horizontal speed cap for any shot
export const HARD_BALL_SPEED = 10; // m/s, incoming speed above which receiving gets harder
