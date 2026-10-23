// End-to-end play test in a phone-sized landscape Chromium with REAL touch events.
// Checks results through window.__game (no screenshots needed); saves one screenshot for a human look.
//
//   node tools/dev-build.mjs && node tests-e2e/play.mjs [dir=.dev-build] [--shot out.png]
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

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.glb': 'model/gltf-binary', '.webp': 'image/webp' };
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

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['iPhone 13 landscape'] });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('response', (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.url()}`));
await page.goto(`${url}?debug=1&seed=5&points=3`);
await page.waitForFunction(() => window.__game !== undefined, null, { timeout: 15000 }).catch((e) => {
  console.log('page failed to start:', errors.join(' | ') || e.message);
  process.exit(1);
});
const cdp = await context.newCDPSession(page);

const G = (fn, arg) => page.evaluate(fn, arg);
const state = () => G(() => window.__game.getState());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

// 3. Jump button
await G(() => window.__game.restart({ seed: 5 }));
await G(() => window.__game.step(80)); // let the bot serve
const btn = await page.locator('#jump').boundingBox();
await tapAt(btn.x + btn.width / 2, btn.y + btn.height / 2);
await G(() => window.__game.step(1));
let log = await G(() => window.__game.getLog());
check('jump button -> jump event', log.some((e) => e.type === 'jump' && e.player === 0));

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
  // Step until the ball is close to the human player
  for (let i = 0; i < 200; i++) {
    s = await G(() => window.__game.step(1));
    const me = s.players[0];
    if (s.phase !== 'rally') break;
    if (s.ball.vy < 0 && Math.abs(s.ball.x - me.x) < 1.6 && s.ball.y < 2.6) break;
  }
  const me = await G(() => window.__game.courtToScreen(-4, 1));
  const before = (await G(() => window.__game.getLog())).length;
  await flick(me.x + 150, me.y, 4, -60);
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
check('real-time loop advances', s.frame > 120, `frame=${s.frame}`);
check('no invariant violations', !log.some((e) => e.type === 'violation'));
check('no page errors', errors.length === 0, errors.join(' | '));

if (shot) {
  await page.screenshot({ path: shot });
  console.log(`screenshot: ${shot}`);
}
await browser.close();
server.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
