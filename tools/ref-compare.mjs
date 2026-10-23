// Renders the reference shot (?scene=ref) at the reference picture's size and writes comparison images:
//   render.png  the 3D view alone
//   side.png    reference (left) | render (right)
//   overlay.png 50/50 blend, to check alignment of horizon, net, shore, scenery
//   gray.png    side by side in grayscale, to compare values (light/dark balance)
// and prints color stats of fixed regions (reference vs render) so changes can be judged by numbers.
//
//   node tools/ref-compare.mjs [--quality low|high] [--out .ref-compare] [--no-build] [--look KEY:VAL,KEY:VAL] [--profile]
// --profile also prints a row-by-row profile of the sea band (horizon to sand), reference vs render:
// mean color, luminance and the brightest 10% (whitecaps / foam) of each row in PROFILE_X.
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
const look = opt('--look', '');
const REF = 'docs/reference/concept-beach.webp';
// Regions in reference pixels [x0, y0, x1, y1]. Sun shadow / lit pair is measured on the render only.
const REGIONS = {
  'sky top': [600, 15, 1000, 70],
  'sky mid': [560, 250, 800, 300],
  'sea far': [600, 470, 1000, 500],
  'sea near': [600, 520, 1000, 550],
  sand: [560, 700, 1000, 760],
  island: [1300, 410, 1450, 450],
};
// Sea band profile: columns clear of players and the net; rows from the horizon down to the sand.
const PROFILE_X = [380, 1000];
const PROFILE_Y = [462, 640, 6];
const SHADOW = [1030, 780, 1060, 800];
const LIT = [700, 760, 800, 780];
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
const types = { '.hdr': 'application/octet-stream', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary' };
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
  page.on('pageerror', (e) => console.log('page error:', String(e)));
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log(`console ${m.type()}:`, m.text().slice(0, 2000)));
  await page.goto(`http://127.0.0.1:${server.address().port}/?debug=1&seed=1&scene=ref&quality=${quality}${look ? `&look=${encodeURIComponent(look)}` : ''}`);
  await page.waitForFunction(() => window.__game?.renderInfo?.().ready, null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => window.__game.renderInfo());
  console.log('renderInfo', JSON.stringify(info));

  const refUrl = `data:image/webp;base64,${readFileSync(REF).toString('base64')}`;
  // Grab the canvas right after a frame is drawn, then compose the comparison images in the page.
  const images = await page.evaluate(
    ({ refUrl, W, H, regions, shadow, lit, profileX, profileY }) =>
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
              // Region stats: mean color, luminance mean / 10th / 90th percentile, mean color of the darkest and lightest 10%.
              const pixels = (img) => {
                const c = canvas(W, H).getContext('2d');
                c.drawImage(img, 0, 0, W, H);
                return c.getImageData(0, 0, W, H).data;
              };
              const stats = (d, [x0, y0, x1, y1]) => {
                const px = [];
                for (let y = y0; y < y1; y++)
                  for (let x = x0; x < x1; x++) {
                    const i = (y * W + x) * 4;
                    px.push([d[i], d[i + 1], d[i + 2], 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]]);
                  }
                px.sort((a, b) => a[3] - b[3]);
                const mean = (arr) => [0, 1, 2, 3].map((k) => Math.round(arr.reduce((s, p) => s + p[k], 0) / arr.length));
                const n = px.length;
                const m = mean(px);
                return { rgb: m.slice(0, 3), L: m[3], p10: Math.round(px[Math.floor(n * 0.1)][3]), p90: Math.round(px[Math.floor(n * 0.9)][3]), dark10: mean(px.slice(0, n / 10)).slice(0, 3), light10: mean(px.slice(-n / 10)).slice(0, 3) };
              };
              const dr = pixels(ref);
              const dn = pixels(ren);
              const table = {};
              for (const [k, box] of Object.entries(regions)) table[k] = { ref: stats(dr, box), ours: stats(dn, box) };
              const shadowRatio = stats(dn, shadow).L / stats(dn, lit).L;
              const profile = [];
              for (let y = profileY[0]; y < profileY[1]; y += profileY[2]) {
                const box = [profileX[0], y, profileX[1], y + profileY[2]];
                profile.push({ y, ref: stats(dr, box), ours: stats(dn, box) });
              }
              resolve({ images: { render: shot, side: side.toDataURL(), overlay: overlay.toDataURL(), gray: gray.toDataURL() }, table, shadowRatio, profile });
            })
            .catch(reject);
        });
      }),
    { refUrl, W, H, regions: REGIONS, shadow: SHADOW, lit: LIT, profileX: PROFILE_X, profileY: PROFILE_Y },
  );
  mkdirSync(out, { recursive: true });
  const fmt = (o) => `rgb ${o.rgb.join(',').padEnd(11)} L ${String(o.L).padStart(3)} p10-90 ${o.p10}-${o.p90}  dark ${o.dark10.join(',')}  light ${o.light10.join(',')}`;
  for (const [k, v] of Object.entries(images.table)) console.log(`${k.padEnd(9)} ref  ${fmt(v.ref)}\n${''.padEnd(9)} ours ${fmt(v.ours)}`);
  console.log(`sun shadow / lit sand (ours): ${images.shadowRatio.toFixed(2)}   (reference: 0.78)`);
  if (args.includes('--profile')) {
    console.log(`sea profile, x ${PROFILE_X.join('-')}: y | ref rgb L light10 | ours rgb L light10`);
    const c = (o) => `${o.rgb.map((v) => String(v).padStart(3)).join(',')} L${String(o.L).padStart(4)} hi ${o.light10.map((v) => String(v).padStart(3)).join(',')}`;
    for (const r of images.profile) console.log(`${String(r.y).padStart(4)} | ${c(r.ref)} | ${c(r.ours)}`);
  }
  writeFileSync(join(out, 'stats.json'), JSON.stringify({ regions: images.table, shadowRatio: images.shadowRatio, profile: images.profile }, null, 2));
  for (const [name, url] of Object.entries(images.images)) {
    writeFileSync(join(out, `${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
  }
  console.log(`wrote ${out}/{render,side,overlay,gray}.png, stats.json`);
} finally {
  await browser.close();
  server.close();
}
