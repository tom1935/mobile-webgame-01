// Simple side-view renderer on a 2D canvas. No dependencies.
// Used as the debug view (?view=2d) and as a fallback when 3D is unavailable.
import { BALL_RADIUS, COURT_HALF, NET_HEIGHT } from '../sim/constants.ts';
import type { World } from '../sim/types.ts';
import type { ProbeItem, Renderer } from './types.ts';

const VIEW_X_MIN = -11;
const VIEW_X_MAX = 11;

const COLORS = {
  skyTop: '#2f8fe6',
  skyBottom: '#9fd6ff',
  sea: '#1aa6c8',
  seaFoam: '#e9fbff',
  sand: '#ecc98f',
  sandDark: '#d9b375',
  line: '#2a55d0',
  net: '#2b3e9e',
  ball: '#ffd23f',
  ballStripe: '#1f4fd1',
  team0: ['#f4f4f4', '#222831'],
  team1: ['#d93a3a', '#d93a3a'],
  skin: '#f2c9a0',
  hair: '#5a3b26',
  shadow: 'rgba(80, 50, 20, 0.25)',
};

export function createCanvas2DRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext('2d')!;
  let w = 1;
  let h = 1;
  let dpr = 1;
  let scale = 1; // px per meter
  let groundY = 1; // screen y of the sand line

  const sx = (x: number) => (x - VIEW_X_MIN) * scale;
  const sy = (y: number) => groundY - y * scale;

  function drawBackground(): void {
    const g = ctx.createLinearGradient(0, 0, 0, groundY);
    g.addColorStop(0, COLORS.skyTop);
    g.addColorStop(1, COLORS.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, groundY);
    // Sea band behind the court
    const seaTop = groundY - 1.2 * scale;
    ctx.fillStyle = COLORS.sea;
    ctx.fillRect(0, seaTop, w, groundY - seaTop);
    ctx.fillStyle = COLORS.seaFoam;
    ctx.fillRect(0, groundY - 0.25 * scale, w, 0.08 * scale);
    // Sand
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(0, groundY, w, h - groundY);
    ctx.fillStyle = COLORS.sandDark;
    ctx.fillRect(0, groundY, w, 3);
    // Court lines
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx(-COURT_HALF), groundY + 4);
    ctx.lineTo(sx(COURT_HALF), groundY + 4);
    ctx.stroke();
    for (const x of [-COURT_HALF, COURT_HALF]) {
      ctx.beginPath();
      ctx.moveTo(sx(x), groundY - 2);
      ctx.lineTo(sx(x), groundY + 12);
      ctx.stroke();
    }
  }

  function drawNet(): void {
    const top = sy(NET_HEIGHT);
    ctx.fillStyle = COLORS.net;
    ctx.fillRect(sx(0) - 4, top - 6, 8, groundY - top + 6);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    for (let y = top + 6; y < top + 0.9 * scale; y += 5) {
      ctx.beginPath();
      ctx.moveTo(sx(0) - 3, y);
      ctx.lineTo(sx(0) + 3, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.fillRect(sx(0) - 4, top, 8, 4);
  }

  function drawPlayer(world: World, i: number): void {
    const p = world.players[i];
    const [shirt, shorts] = p.team === 0 ? COLORS.team0 : COLORS.team1;
    const x = sx(p.x);
    const feet = sy(p.y);
    const u = scale; // 1 m in px
    const facing = p.team === 0 ? 1 : -1;
    // Shadow
    ctx.fillStyle = COLORS.shadow;
    ctx.beginPath();
    ctx.ellipse(x, groundY + 3, 0.35 * u, 0.08 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    // Legs
    ctx.fillStyle = COLORS.skin;
    ctx.fillRect(x - 0.18 * u, feet - 0.45 * u, 0.13 * u, 0.45 * u);
    ctx.fillRect(x + 0.05 * u, feet - 0.45 * u, 0.13 * u, 0.45 * u);
    // Shorts + shirt
    ctx.fillStyle = shorts;
    ctx.fillRect(x - 0.22 * u, feet - 0.62 * u, 0.44 * u, 0.2 * u);
    ctx.fillStyle = shirt;
    ctx.fillRect(x - 0.22 * u, feet - 0.98 * u, 0.44 * u, 0.38 * u);
    // Arms: raised shortly after a hit, forward otherwise
    const sinceHit = world.frame - p.lastHitFrame;
    ctx.strokeStyle = COLORS.skin;
    ctx.lineWidth = 0.09 * u;
    ctx.beginPath();
    ctx.moveTo(x, feet - 0.9 * u);
    if (sinceHit < 12) ctx.lineTo(x + facing * 0.15 * u, feet - 1.75 * u);
    else ctx.lineTo(x + facing * 0.4 * u, feet - 0.62 * u);
    ctx.stroke();
    // Big chibi head
    ctx.fillStyle = COLORS.skin;
    ctx.beginPath();
    ctx.arc(x, feet - 1.3 * u, 0.32 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.hair;
    ctx.beginPath();
    ctx.arc(x, feet - 1.36 * u, 0.33 * u, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
    // Marker above the human player
    if (p.id === 0) {
      ctx.fillStyle = '#ffe14d';
      ctx.beginPath();
      const my = feet - 1.85 * u;
      ctx.moveTo(x - 8, my - 10);
      ctx.lineTo(x + 8, my - 10);
      ctx.lineTo(x, my);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawBall(world: World): void {
    const b = world.ball;
    const r = Math.max(5, BALL_RADIUS * scale * 1.2);
    // Shadow on the sand gets smaller with height
    const k = Math.max(0.3, 1 - b.y / 8);
    ctx.fillStyle = COLORS.shadow;
    ctx.beginPath();
    ctx.ellipse(sx(b.x), groundY + 3, r * k, r * 0.3 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.ball;
    ctx.beginPath();
    ctx.arc(sx(b.x), sy(b.y), r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.ballStripe;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx(b.x), sy(b.y), r * 0.7, -0.6 + world.frame * 0.1, 1.2 + world.frame * 0.1);
    ctx.stroke();
  }

  return {
    resize(width, height, ratio) {
      w = width;
      h = height;
      dpr = ratio;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      scale = w / (VIEW_X_MAX - VIEW_X_MIN);
      groundY = Math.min(h * 0.82, 6.2 * scale + 10);
    },
    render(world) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawBackground();
      drawNet();
      const order = [...world.players.keys()].sort((a, b) => world.players[a].z - world.players[b].z);
      for (const i of order) drawPlayer(world, i);
      drawBall(world);
    },
    screenToCourtX(px) {
      return px / scale + VIEW_X_MIN;
    },
    courtToScreen(x, y) {
      return { x: sx(x), y: sy(y) };
    },
    probe(world) {
      const items: ProbeItem[] = [];
      const add = (name: string, x: number, y: number) => {
        const X = sx(x);
        const Y = sy(y);
        items.push({ name, simX: x, simY: y, screenX: X, screenY: Y, onScreen: X >= 0 && X <= w && Y >= 0 && Y <= h });
      };
      add('ball', world.ball.x, world.ball.y);
      for (const p of world.players) add(p.name, p.x, p.y);
      return items;
    },
  };
}
