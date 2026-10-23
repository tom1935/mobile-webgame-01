// End-to-end play test in a phone-sized landscape Chromium with REAL touch events.
// Checks results through window.__game (no screenshots needed); saves one screenshot for a human look.
//
//   node tools/dev-build.mjs && node tests-e2e/play.mjs [dir=.dev-build] [--shot out.png] [--2d]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require('/opt/node22/lib/node_modules/playwright');
}
const { chromium, devices } = playwright;

const args = process.argv.slice(2);
const dir = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--shot') ?? '.dev-build';
const shotIdx = args.indexOf('--shot');
const shot = shotIdx >= 0 ? args[shotIdx + 1] : null;
const base = process.env.BASE_PATH ?? '/';
const is2d = args.includes('--2d');
// Gesture checks use the light 3D tier: software WebGL here is too slow for the high tier's post effects.
const extraQuery = is2d ? '&view=2d' : '&quality=low';

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary', '.webp': 'image/webp' };
const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.startsWith(base)) path = '/' + path.slice(base.length);
  if (path.endsWith('/')) path += 'index.html';
  try {
    const body = await readFile(join(dir, path));
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}${base}`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};

// SwiftShader WebGL so the 3D view renders at a usable speed without a GPU.
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ ...devices['iPhone 13 landscape'] });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('response', (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.url()}`));
await page.goto(`${url}?debug=1&seed=5&points=3${extraQuery}`);
await page.waitForFunction(() => window.__game !== undefined, null, { timeout: 15000 }).catch((e) => {
  console.log('page failed to start:', errors.join(' | ') || e.message);
  process.exit(1);
});
// Wait for 3D assets / shaders so long first frames do not stretch the touch gestures below.
await page.waitForFunction(() => window.__game.renderInfo().ready === true, null, { timeout: 60000 });
await new Promise((r) => setTimeout(r, 500));
const info = await page.evaluate(() => window.__game.renderInfo());
console.log('render:', JSON.stringify(info));
const cdp = await context.newCDPSession(page);

const G = (fn, arg) => page.evaluate(fn, arg);
const state = () => G(() => window.__game.getState());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Touch events are delivered with the next animation frame; wait for it so a slow (3D) frame
// cannot deliver the gesture after the test has already stepped the game past the ball.
const nextFrame = () => G(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

async function touch(type, id, x, y) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x, y, id }],
  });
}
async function tapAt(x, y) {
  await touch('touchStart', 1, x, y);
  await sleep(40);
  await touch('touchEnd', 1, x, y);
}
async function flick(x, y, dx, dy) {
  await touch('touchStart', 2, x, y);
  for (let i = 1; i <= 4; i++) {
    await sleep(15);
    await touch('touchMove', 2, x + (dx * i) / 4, y + (dy * i) / 4);
  }
  await touch('touchEnd', 2, x + dx, y + dy);
}

// 1. Everything is drawn inside the screen
const probe = await G(() => window.__game.probe());
check('all objects on screen', probe.every((p) => p.onScreen), JSON.stringify(probe.map((p) => [p.name, Math.round(p.screenX), Math.round(p.screenY)])));
const sim = probe.find((p) => p.name === 'A1');
check('A1 drawn on the left half', sim.screenX < 422);

// 2. Tap moves the player there
await G(() => window.__game.pause());
const target = await G(() => window.__game.courtToScreen(-6, 0.5));
await tapAt(target.x, target.y);
await G(() => window.__game.step(90));
let s = await state();
check('tap -> player runs to the tapped spot', Math.abs(s.players[0].x - -6) < 0.2, `x=${s.players[0].x}`);

// 2b. Fast drag in the move zone still moves (used to be mistaken for a flick)
await G(() => window.__game.restart({ seed: 5 }));
await G(() => window.__game.step(80));
const dragFrom = await G(() => window.__game.courtToScreen(-6, 0.5));
const dragTo = await G(() => window.__game.courtToScreen(-2.5, 0.5));
await touch('touchStart', 3, dragFrom.x, dragFrom.y);
await sleep(10);
await touch('touchMove', 3, (dragFrom.x + dragTo.x) / 2, dragFrom.y);
await sleep(10);
await touch('touchMove', 3, dragTo.x, dragTo.y);
await touch('touchEnd', 3, dragTo.x, dragTo.y);
s = await G(() => window.__game.step(1)); // queued input is applied on the next step
check('fast drag -> moves to the finger', Math.abs(s.players[0].targetX - -2.5) < 0.2, `targetX=${s.players[0].targetX}`);

// 3. Tap on the top band = jump (and does not move the player)
const vp = page.viewportSize();
const before3 = (await state()).players[0].targetX;
await tapAt(vp.width * 0.7, 20);
await G(() => window.__game.step(1));
let log = await G(() => window.__game.getLog());
check('tap top band -> jump event', log.some((e) => e.type === 'jump' && e.player === 0));
check('jump tap does not change move target', (await state()).players[0].targetX === before3);
await G(() => window.__game.step(80));

// 3b. Flick with no ball nearby still swings (animation state)
const fz = await G(() => window.__game.courtToScreen(4, 1.2));
await flick(fz.x, fz.y, 10, -70);
await nextFrame();
await G(() => window.__game.step(2));
s = await state();
check('flick without ball -> swing animation', s.players[0].lastSwing && s.players[0].lastSwing.framesAgo <= 3, JSON.stringify(s.players[0].lastSwing));

// 4. Receive balls with real flicks: step until the ball is about to reach the human, then flick up.
let humanHits = 0;
let attempts = 0;
for (let rally = 0; rally < 12 && humanHits < 3; rally++) {
  await G(() => window.__game.step(1));
  s = await state();
  if (s.phase === 'matchEnd') break;
  if (s.phase !== 'rally' || !s.plan || s.plan.side !== 0 || s.plan.receiver !== 0) {
    await G(() => window.__game.step(20));
    continue;
  }
  attempts++;
  const pos = await G((x) => window.__game.courtToScreen(x, 0.5), s.plan.landX);
  await tapAt(pos.x, pos.y);
  await nextFrame();
  // Step until the ball is close to the human player
  for (let i = 0; i < 200; i++) {
    s = await G(() => window.__game.step(1));
    const me = s.players[0];
    if (s.phase !== 'rally') break;
    if (s.ball.vy < 0 && Math.abs(s.ball.x - me.x) < 1.6 && s.ball.y < 2.6) break;
  }
  const fz2 = await G(() => window.__game.courtToScreen(4, 1.2)); // flick zone (opponent side)
  const before = (await G(() => window.__game.getLog())).length;
  await flick(fz2.x, fz2.y, 4, -60);
  await nextFrame();
  await G(() => window.__game.step(14));
  log = await G(() => window.__game.getLog());
  const newEvents = log.slice(before);
  if (newEvents.some((e) => e.type === 'hit' && e.player === 0)) humanHits++;
  else console.log('  no hit:', JSON.stringify(newEvents.filter((e) => e.player === 0 || e.type === 'land')).slice(0, 300));
  await G(() => window.__game.step(150));
}
check('flick receives the ball', humanHits >= 1, `${humanHits} hits in ${attempts} attempts`);

// 5. Autoplay keeps running without errors / violations
await G(() => window.__game.restart({ seed: 9, autoplay: true }));
await G(() => window.__game.resume());
await sleep(3000);
s = await state();
log = await G(() => window.__game.getLog());
// 3 s of real time; software WebGL in CI can be slow, so only require clear progress.
check('real-time loop advances', s.frame > 60, `frame=${s.frame}`);
check('no invariant violations', !log.some((e) => e.type === 'violation'));
check('no page errors', errors.length === 0, errors.join(' | '));

// 6. Tuning panel: moving a slider changes the live value
await page.goto(`${url}?debug=1&tune=1&seed=5${extraQuery}`);
await page.waitForFunction(() => window.__game !== undefined);
await page.evaluate(() => localStorage.clear());
await page.locator('#tune-toggle').click();
const slider = page.locator('#tune-panel input[type=range]').first();
await slider.evaluate((el) => {
  el.value = '9.5';
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
const tuned = await G(() => window.__game.getParams());
check('tune panel slider changes PLAYER_SPEED', tuned.PLAYER_SPEED === 9.5, `PLAYER_SPEED=${tuned.PLAYER_SPEED}`);
const s0 = await state();
await sleep(500);
const s1 = await state();
check('game keeps running with the panel open', s1.frame > s0.frame);

// 7. High quality tier (bloom, depth of field, MSAA) loads and draws without errors
if (!is2d) {
  errors.length = 0;
  await page.goto(`${url}?debug=1&seed=5&quality=high`);
  await page.waitForFunction(() => window.__game && window.__game.renderInfo().ready === true, null, { timeout: 60000 });
  await sleep(1500);
  const hi = await G(() => window.__game.renderInfo());
  check('high tier renders', hi.quality === 'high' && hi.ready, JSON.stringify(hi));
  check('high tier: no page errors', errors.length === 0, errors.join(' | '));
}

if (shot) {
  await page.screenshot({ path: shot });
  console.log(`screenshot: ${shot}`);
}
await browser.close();
server.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
