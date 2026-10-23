// Fit look values (src/render/look.ts) to the reference picture by numbers: opens the reference shot once,
// changes values live (window.__game.setLook) and keeps the changes that bring the measured colors closer.
//
//   node tools/look-fit.mjs --keys SEA_ABSORB_R,SEA_REFLECT --colors SEA_DEEP --rows 468-560 [--write]
//
//   --keys K,...     numeric values, searched by multiplying (x1.5, x0.67, then smaller steps)
//   --colors K,...   sRGB hex colors, searched per channel
//   --rows A-B       sea profile rows to match (tools/ref-lib.mjs PROFILE_Y), mean color of each row
//   --regions R,...  also match these region means (names from REGIONS in tools/ref-lib.mjs)
//   --hi W           weight of the brightest-10% color of each row (whitecaps, foam), default 0
//   --rounds N       passes over all values (default 6)
//   --look K:V,...   starting values (SEA_FREEZE is set unless given)
//   --write          write the fitted values into DEFAULT_LOOK in src/render/look.ts
//   --scale S        render size for the search (default 0.5; measured in reference pixels either way)
//   --no-build       skip the build
import { readFileSync, writeFileSync } from 'node:fs';
import { measure, openRefShot, setLook, withFrozenSea } from './ref-lib.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const list = (s) => (s ? s.split(',').filter(Boolean) : []);
const keys = list(opt('--keys', ''));
const colors = list(opt('--colors', ''));
const [rowFrom, rowTo] = (opt('--rows', '') || '0-99999').split('-').map(Number);
const regions = list(opt('--regions', ''));
const hiWeight = Number(opt('--hi', '0'));
const rounds = Number(opt('--rounds', '6'));
if (!keys.length && !colors.length) throw new Error('nothing to fit: give --keys and/or --colors');

const { page, close } = await openRefShot({ look: withFrozenSea(opt('--look', '')), build: !args.includes('--no-build'), scale: Number(opt('--scale', '0.5')) });
try {
  const cur = await page.evaluate(() => window.__game.getLook());
  for (const k of [...keys, ...colors]) if (!(k in cur)) throw new Error(`unknown look key ${k}`);

  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  // Error: RMS color distance (0..255 per channel) over the chosen rows / regions.
  let tries = 0;
  const evaluate = async (values) => {
    tries++;
    await setLook(page, values);
    const m = await measure(page);
    let sum = 0;
    let n = 0;
    for (const r of m.profile) {
      if (r.y < rowFrom || r.y > rowTo) continue;
      sum += d2(r.ref.rgb, r.ours.rgb);
      n++;
      if (hiWeight > 0) {
        sum += hiWeight * d2(r.ref.light10, r.ours.light10);
        n += hiWeight;
      }
    }
    for (const k of regions) {
      sum += d2(m.table[k].ref.rgb, m.table[k].ours.rgb);
      n++;
    }
    return Math.sqrt(sum / Math.max(n, 1) / 3);
  };

  // Parameters: numeric keys, and one parameter per color channel.
  const params = [
    ...keys.map((k) => ({ name: k, get: (v) => v[k], set: (v, x) => ({ ...v, [k]: x }), mult: true, step: 0.5 })),
    ...colors.flatMap((k) =>
      [16, 8, 0].map((shift, ch) => ({
        name: `${k}.${'rgb'[ch]}`,
        get: (v) => (v[k] >> shift) & 255,
        set: (v, x) => ({ ...v, [k]: (v[k] & ~(255 << shift)) | (Math.round(Math.min(255, Math.max(0, x))) << shift) }),
        mult: false,
        step: 32,
      })),
    ),
  ];
  let best = Object.fromEntries([...keys, ...colors].map((k) => [k, cur[k]]));
  const t0 = Date.now();
  let bestErr = await evaluate(best);
  console.log(`start error ${bestErr.toFixed(2)} (${Date.now() - t0} ms per try)`);
  for (let round = 0; round < rounds; round++) {
    for (const p of params) {
      for (const dir of [1, -1]) {
        let improved = true;
        while (improved) {
          improved = false;
          const x = p.get(best);
          const nx = p.mult ? x * (dir > 0 ? 1 + p.step : 1 / (1 + p.step)) : x + dir * p.step;
          const cand = p.set(best, nx);
          if (p.get(cand) === x) break;
          const err = await evaluate(cand);
          if (err < bestErr - 1e-3) {
            best = cand;
            bestErr = err;
            improved = true;
            console.log(`  ${p.name} ${Number(p.get(best).toPrecision(3))}: error ${err.toFixed(2)}`);
          }
        }
      }
      p.step = p.mult ? p.step * 0.6 : Math.max(1, Math.round(p.step * 0.6));
    }
    console.log(`round ${round + 1}: error ${bestErr.toFixed(2)}  ${fmtLook(best)}`);
  }
  await setLook(page, best);
  console.log(`\n${tries} tries, ${Math.round((Date.now() - t0) / tries)} ms each`);
  console.log(`best (error ${bestErr.toFixed(2)}): --look ${fmtLook(best)}`);
  if (args.includes('--write')) {
    const path = 'src/render/look.ts';
    let src = readFileSync(path, 'utf8');
    for (const [k, v] of Object.entries(best)) {
      const val = colors.includes(k) ? `0x${v.toString(16).padStart(6, '0')}` : String(Number(v.toPrecision(3)));
      src = src.replace(new RegExp(`(\\n\\s*${k}: )[^,]+,`), `$1${val},`);
    }
    writeFileSync(path, src);
    console.log(`wrote ${path}`);
  }
} finally {
  await close();
}

function fmtLook(v) {
  return Object.entries(v)
    .map(([k, x]) => `${k}:${colors.includes(k) ? `0x${x.toString(16).padStart(6, '0')}` : Number(x.toPrecision(3))}`)
    .join(',');
}
