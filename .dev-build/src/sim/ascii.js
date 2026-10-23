// Side-view text drawing of the court, for debugging without screenshots.
//
//   y
//   ^          o            (ball)
//   |  1       #       3    (player head = id digit, body = '|')
//   |  |  0    #    2  |
//   +==========#==========> x   ('=' court sand, '_' outside, '#' net)
import { BALL_RADIUS, COURT_HALF, NET_HEIGHT } from "./constants.js";
export function renderAscii(world, opts = {}) {
    const xMin = opts.xMin ?? -11;
    const xMax = opts.xMax ?? 11;
    const yMax = opts.yMax ?? 6;
    const cols = opts.cols ?? 89;
    const rows = opts.rows ?? 13;
    const grid = Array.from({ length: rows }, () => Array(cols).fill(' '));
    const col = (x) => Math.round(((x - xMin) / (xMax - xMin)) * (cols - 1));
    const row = (y) => rows - 1 - Math.round((y / yMax) * (rows - 1));
    const put = (x, y, ch) => {
        const c = col(x);
        const r = row(y);
        if (c >= 0 && c < cols && r >= 0 && r < rows)
            grid[r][c] = ch;
    };
    // Ground row
    for (let c = 0; c < cols; c++) {
        const x = xMin + (c / (cols - 1)) * (xMax - xMin);
        grid[rows - 1][c] = Math.abs(x) <= COURT_HALF ? '=' : '_';
    }
    // Net
    for (let y = 0; y <= NET_HEIGHT; y += yMax / (rows - 1))
        put(0, y, '#');
    // Players: body '|' from feet, head = id digit at ~1.4 m above feet
    for (const p of world.players) {
        put(p.x, p.y + 0.5, '|');
        put(p.x, p.y + 1.0, '|');
        put(p.x, p.y + 1.5, String(p.id));
    }
    put(world.ball.x, Math.max(world.ball.y, BALL_RADIUS), 'o');
    const b = world.ball;
    const header = `f=${world.frame} phase=${world.phase} score=${world.score[0]}-${world.score[1]} ` +
        `touchTeam=${world.touchTeam ?? '-'} touches=${world.touches} lastHitter=${world.lastHitter} ` +
        `ball=(${b.x.toFixed(2)},${b.y.toFixed(2)}) v=(${b.vx.toFixed(2)},${b.vy.toFixed(2)})`;
    const legend = world.players
        .map((p) => `${p.id}:${p.name}(${p.x.toFixed(2)},${p.y.toFixed(2)})${p.swingFrames > 0 ? '*' : ''}`)
        .join(' ');
    return [header, ...grid.map((r) => r.join('')), legend].join('\n');
}
