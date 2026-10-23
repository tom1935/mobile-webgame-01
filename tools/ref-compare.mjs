// Renders the reference shot (?scene=ref) at the reference picture's size and writes comparison images:
//   render.png  the 3D view alone
//   side.png    reference (left) | render (right)
//   overlay.png 50/50 blend, to check alignment of horizon, net, shore, scenery
//   gray.png    side by side in grayscale, to compare values (light/dark balance)
//
//   node tools/ref-compare.mjs [--quality low|high] [--out .ref-compare] [--no-build]
// Uses the global playwright (same as tests-e2e/play.mjs) and SwiftShader WebGL.
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const quality = opt('--quality', 'low');
const out = opt('--out', '.ref-compare');
const REF = 'docs/reference/concept-beach.webp';
const W = 1672;
const H = 941;

if (!args.includes('--no-build')) execSync('node tools/dev-build.mjs', { stdio: 'inherit' });

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require('/opt/node22/lib/node_modules/playwright');
}

const dir = '.dev-build';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
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

const browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug=1&seed=1&scene=ref&quality=${quality}`);
  await page.waitForFunction(() => window.__game?.renderInfo?.().ready, null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => window.__game.renderInfo());
  console.log('renderInfo', JSON.stringify(info));

  const refUrl = `data:image/webp;base64,${readFileSync(REF).toString('base64')}`;
  // Grab the canvas right after a frame is drawn, then compose the comparison images in the page.
  const images = await page.evaluate(
    ({ refUrl, W, H }) =>
      new Promise((resolve, reject) => {
        requestAnimationFrame(() => {
          const shot = document.querySelector('#game').toDataURL('image/png');
          const load = (src) =>
            new Promise((ok, bad) => {
              const im = new Image();
              im.onload = () => ok(im);
              im.onerror = bad;
              im.src = src;
            });
          Promise.all([load(refUrl), load(shot)])
            .then(([ref, ren]) => {
              const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
              const side = canvas(W * 2, H);
              let g = side.getContext('2d');
              g.drawImage(ref, 0, 0, W, H);
              g.drawImage(ren, W, 0, W, H);
              const overlay = canvas(W, H);
              g = overlay.getContext('2d');
              g.drawImage(ref, 0, 0, W, H);
              g.globalAlpha = 0.5;
              g.drawImage(ren, 0, 0, W, H);
              const gray = canvas(W * 2, H);
              g = gray.getContext('2d');
              g.filter = 'grayscale(1)';
              g.drawImage(ref, 0, 0, W, H);
              g.drawImage(ren, W, 0, W, H);
              resolve({ render: shot, side: side.toDataURL(), overlay: overlay.toDataURL(), gray: gray.toDataURL() });
            })
            .catch(reject);
        });
      }),
    { refUrl, W, H },
  );
  mkdirSync(out, { recursive: true });
  for (const [name, url] of Object.entries(images)) {
    writeFileSync(join(out, `${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
  }
  console.log(`wrote ${out}/{render,side,overlay,gray}.png`);
} finally {
  await browser.close();
  server.close();
}
