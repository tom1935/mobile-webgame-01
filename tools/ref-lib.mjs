// Shared by tools/ref-compare.mjs and tools/look-fit.mjs: open the reference shot (?scene=ref) in
// headless Chromium (SwiftShader WebGL) at the reference picture's size, and measure the rendered
// frame against docs/reference/concept-beach.webp (region color stats and a row profile of the sea).
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';

export const REF = 'docs/reference/concept-beach.webp';
export const W = 1672;
export const H = 941;
// Regions in reference pixels [x0, y0, x1, y1]. Sun shadow / lit pair is measured on the render only.
export const REGIONS = {
  'sky top': [600, 15, 1000, 70],
  'sky mid': [560, 250, 800, 300],
  'sea far': [600, 470, 1000, 500],
  'sea near': [600, 520, 1000, 550],
  sand: [560, 700, 1000, 760],
  island: [1300, 410, 1450, 450],
};
export const SHADOW = [1030, 780, 1060, 800];
export const LIT = [700, 760, 800, 780];
// Sea band profile: columns clear of players and the net; rows [from, to, step] from the horizon down to the sand.
export const PROFILE_X = [380, 1000];
export const PROFILE_Y = [462, 640, 6];

/** The sea moves; compare at a fixed moment unless the look string sets SEA_FREEZE itself. */
export function withFrozenSea(look) {
  return look.includes('SEA_FREEZE') ? look : ['SEA_FREEZE:20', look].filter(Boolean).join(',');
}

/**
 * Build (unless build = false), serve .dev-build/ and open the reference shot. Returns { page, close }.
 * scale < 1 renders smaller (faster); measurements stay in reference pixels (the frame is scaled up to W x H).
 */
export async function openRefShot({ quality = 'low', look = '', build = true, scale = 1 } = {}) {
  if (build) execSync('node tools/dev-build.mjs', { stdio: 'inherit' });
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
  const close = async () => {
    await browser.close();
    server.close();
  };
  try {
    const page = await browser.newPage({ viewport: { width: Math.round(W * scale), height: Math.round(H * scale) }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.log('page error:', String(e)));
    page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log(`console ${m.type()}:`, m.text().slice(0, 2000)));
    await page.goto(`http://127.0.0.1:${server.address().port}/?debug=1&seed=1&scene=ref&quality=${quality}${look ? `&look=${encodeURIComponent(look)}` : ''}`);
    await page.waitForFunction(() => window.__game?.renderInfo?.().ready, null, { timeout: 90000 });
    await page.waitForTimeout(1500);
    // Reference pixels, kept in the page for measure().
    const refUrl = `data:image/webp;base64,${readFileSync(REF).toString('base64')}`;
    await page.evaluate(
      ({ refUrl, W, H }) =>
        new Promise((ok, bad) => {
          const im = new Image();
          im.onload = () => {
            const c = Object.assign(document.createElement('canvas'), { width: W, height: H }).getContext('2d');
            c.drawImage(im, 0, 0, W, H);
            window.__ref = { img: im, data: c.getImageData(0, 0, W, H).data };
            ok();
          };
          im.onerror = bad;
          im.src = refUrl;
        }),
      { refUrl, W, H },
    );
    return { page, close };
  } catch (e) {
    await close();
    throw e;
  }
}

/** Set look values in the running page (window.__game.setLook) and wait until a frame with them is drawn. */
export async function setLook(page, values) {
  await page.evaluate((v) => window.__game.setLook(v), values);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/**
 * Measure the next drawn frame: region stats, sea row profile, sun shadow ratio, and (images = true)
 * the comparison pictures as data URLs (render, side, overlay, gray).
 */
export async function measure(page, { images = false } = {}) {
  return page.evaluate(
    ({ W, H, regions, shadow, lit, profileX, profileY, images }) =>
      new Promise((resolve, reject) => {
        requestAnimationFrame(() => {
          const gl = document.querySelector('#game');
          const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
          // Copy the WebGL canvas right after the frame is drawn (before it is cleared).
          const ren = canvas(W, H);
          ren.getContext('2d').drawImage(gl, 0, 0, W, H);
          try {
            const ref = window.__ref;
            const dn = ren.getContext('2d').getImageData(0, 0, W, H).data;
            const dr = ref.data;
            // Mean color, luminance mean / 10th / 90th percentile, mean color of the darkest and lightest 10%.
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
            const table = {};
            for (const [k, box] of Object.entries(regions)) table[k] = { ref: stats(dr, box), ours: stats(dn, box) };
            const shadowRatio = stats(dn, shadow).L / stats(dn, lit).L;
            const profile = [];
            for (let y = profileY[0]; y < profileY[1]; y += profileY[2]) {
              const box = [profileX[0], y, profileX[1], y + profileY[2]];
              profile.push({ y, ref: stats(dr, box), ours: stats(dn, box) });
            }
            const out = { table, shadowRatio, profile };
            if (images) {
              const side = canvas(W * 2, H);
              let g = side.getContext('2d');
              g.drawImage(ref.img, 0, 0, W, H);
              g.drawImage(ren, W, 0, W, H);
              const overlay = canvas(W, H);
              g = overlay.getContext('2d');
              g.drawImage(ref.img, 0, 0, W, H);
              g.globalAlpha = 0.5;
              g.drawImage(ren, 0, 0, W, H);
              const gray = canvas(W * 2, H);
              g = gray.getContext('2d');
              g.filter = 'grayscale(1)';
              g.drawImage(ref.img, 0, 0, W, H);
              g.drawImage(ren, W, 0, W, H);
              out.images = { render: ren.toDataURL('image/png'), side: side.toDataURL(), overlay: overlay.toDataURL(), gray: gray.toDataURL() };
            }
            resolve(out);
          } catch (e) {
            reject(e);
          }
        });
      }),
    { W, H, regions: REGIONS, shadow: SHADOW, lit: LIT, profileX: PROFILE_X, profileY: PROFILE_Y, images },
  );
}
