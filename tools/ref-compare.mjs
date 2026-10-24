// Renders the reference shot (?scene=ref) at the reference picture's size and writes comparison images:
//   render.png  the 3D view alone
//   side.png    reference (left) | render (right)
//   overlay.png 50/50 blend, to check alignment of horizon, net, shore, scenery
//   gray.png    side by side in grayscale, to compare values (light/dark balance)
// and prints color stats of fixed regions (reference vs render) so changes can be judged by numbers.
//
//   node tools/ref-compare.mjs [--quality low|high] [--out .ref-compare] [--no-build] [--look KEY:VAL,KEY:VAL] [--profile]
// --profile also prints a row-by-row profile of the sea band (horizon to sand), reference vs render:
// mean color, luminance and the brightest 10% (whitecaps / foam) of each row.
// The sea is stopped at a fixed moment (SEA_FREEZE) unless --look sets it.
// --times 0,3,6 also writes frames.png: the sea band at those moments (SEA_FREEZE seconds), stacked, to check the motion.
// Uses the global playwright (same as tests-e2e/play.mjs) and SwiftShader WebGL.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { measure, openRefShot, PROFILE_X, setLook, withFrozenSea } from './ref-lib.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const quality = opt('--quality', 'low');
const out = opt('--out', '.ref-compare');
const look = withFrozenSea(opt('--look', ''));
const SEA_BAND = [440, 660]; // rows of the reference picture shown in frames.png

const { page, close } = await openRefShot({ quality, look, build: !args.includes('--no-build') });
try {
  const info = await page.evaluate(() => window.__game.renderInfo());
  console.log('renderInfo', JSON.stringify(info));
  const m = await measure(page, { images: true });
  mkdirSync(out, { recursive: true });
  const fmt = (o) => `rgb ${o.rgb.join(',').padEnd(11)} L ${String(o.L).padStart(3)} p10-90 ${o.p10}-${o.p90}  dark ${o.dark10.join(',')}  light ${o.light10.join(',')}`;
  for (const [k, v] of Object.entries(m.table)) console.log(`${k.padEnd(9)} ref  ${fmt(v.ref)}\n${''.padEnd(9)} ours ${fmt(v.ours)}`);
  console.log(`sun shadow / lit sand (ours): ${m.shadowRatio.toFixed(2)}   (reference: 0.78)`);
  if (args.includes('--profile')) {
    console.log(`sea profile, x ${PROFILE_X.join('-')}: y | ref rgb L light10 | ours rgb L light10`);
    const c = (o) => `${o.rgb.map((v) => String(v).padStart(3)).join(',')} L${String(o.L).padStart(4)} hi ${o.light10.map((v) => String(v).padStart(3)).join(',')}`;
    for (const r of m.profile) console.log(`${String(r.y).padStart(4)} | ${c(r.ref)} | ${c(r.ours)}`);
  }
  writeFileSync(join(out, 'stats.json'), JSON.stringify({ regions: m.table, shadowRatio: m.shadowRatio, profile: m.profile }, null, 2));
  for (const [name, url] of Object.entries(m.images)) writeFileSync(join(out, `${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
  console.log(`wrote ${out}/{render,side,overlay,gray}.png, stats.json`);
  const times = opt('--times', '');
  if (times) {
    const shots = [];
    for (const t of times.split(',').map(Number)) {
      await setLook(page, { SEA_FREEZE: t });
      shots.push((await measure(page, { images: true })).images.render);
    }
    const url = await page.evaluate(
      ({ shots, band }) =>
        Promise.all(shots.map((src) => new Promise((ok) => Object.assign(new Image(), { onload: (e) => ok(e.target), src })))).then((ims) => {
          const w = ims[0].width;
          const h = band[1] - band[0];
          const c = Object.assign(document.createElement('canvas'), { width: w, height: (h + 4) * ims.length });
          const g = c.getContext('2d');
          g.fillStyle = '#fff';
          g.fillRect(0, 0, c.width, c.height);
          ims.forEach((im, i) => g.drawImage(im, 0, band[0], w, h, 0, i * (h + 4), w, h));
          return c.toDataURL('image/png');
        }),
      { shots, band: SEA_BAND },
    );
    writeFileSync(join(out, 'frames.png'), Buffer.from(url.split(',')[1], 'base64'));
    console.log(`wrote ${out}/frames.png (t = ${times})`);
  }
} finally {
  await close();
}
