// Downloads the CC0 sky HDRI and sand PBR textures from Poly Haven / ambientCG into assets/,
// then records them in assets/manifest.json (the 3D view reads that file; missing entries fall back).
//
//   node tools/fetch-assets.mjs            # fetch what is missing
//   node tools/fetch-assets.mjs --force    # re-download
//   node tools/fetch-assets.mjs --only sky # just one kind (sky | sand)
//
// Needs network access to api.polyhaven.com, dl.polyhaven.org (and ambientcg.com for the fallback).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const force = process.argv.includes('--force');
const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null;
const manifestPath = 'assets/manifest.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

// Midday, mostly clear sky with puffy clouds (tropical beach look). First one that exists wins.
const SKY_CANDIDATES = [
  'kloofendal_48d_partly_cloudy_puresky',
  'kloofendal_43d_clear_puresky',
  'qwantani_noon_puresky',
  'kloppenheim_06_puresky',
];
// Fine, light beach sand.
const SAND_CANDIDATES = ['coast_sand_01', 'coast_sand_02', 'coast_sand_05', 'aerial_beach_01', 'sand_01'];
const AMBIENTCG_SAND = ['Ground054', 'Ground080', 'Ground055'];

async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
async function download(url, path) {
  if (existsSync(path) && !force) return path;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(await r.arrayBuffer()));
  console.log('  saved', path);
  return path;
}

async function fetchSky() {
  for (const id of SKY_CANDIDATES) {
    let files;
    try {
      files = await json(`https://api.polyhaven.com/files/${id}`);
    } catch {
      continue;
    }
    const pick = (res) => files.hdri?.[res]?.hdr?.url;
    if (!pick('2k') || !pick('1k')) continue;
    console.log('sky:', id);
    return {
      background: await download(pick('2k'), `assets/env/${id}_2k.hdr`),
      env: await download(pick('1k'), `assets/env/${id}_1k.hdr`),
      source: `https://polyhaven.com/a/${id}`,
      license: 'CC0',
    };
  }
  throw new Error('no sky HDRI found');
}

async function fetchSandPolyHaven() {
  for (const id of SAND_CANDIDATES) {
    let files;
    try {
      files = await json(`https://api.polyhaven.com/files/${id}`);
    } catch {
      continue;
    }
    const map = (k) => files[k]?.['1k']?.jpg?.url;
    if (!map('Diffuse') || !map('nor_gl')) continue;
    console.log('sand:', id);
    const out = {
      color: await download(map('Diffuse'), `assets/textures/${id}_diff_1k.jpg`),
      normal: await download(map('nor_gl'), `assets/textures/${id}_nor_gl_1k.jpg`),
      source: `https://polyhaven.com/a/${id}`,
      license: 'CC0',
      tileMeters: 3,
    };
    if (map('Rough')) out.roughness = await download(map('Rough'), `assets/textures/${id}_rough_1k.jpg`);
    return out;
  }
  throw new Error('no Poly Haven sand texture found');
}

async function fetchSandAmbientCG() {
  // ambientCG ships zips; unzip with the system `unzip`.
  const { execFileSync } = await import('node:child_process');
  for (const id of AMBIENTCG_SAND) {
    const zip = `assets/textures/${id}_1K-JPG.zip`;
    try {
      await download(`https://ambientcg.com/get?file=${id}_1K-JPG.zip`, zip);
    } catch {
      continue;
    }
    const dir = `assets/textures/${id}`;
    mkdirSync(dir, { recursive: true });
    execFileSync('unzip', ['-o', '-q', zip, '-d', dir]);
    execFileSync('rm', [zip]);
    console.log('sand (ambientCG):', id);
    return {
      color: `${dir}/${id}_1K-JPG_Color.jpg`,
      normal: `${dir}/${id}_1K-JPG_NormalGL.jpg`,
      roughness: `${dir}/${id}_1K-JPG_Roughness.jpg`,
      source: `https://ambientcg.com/view?id=${id}`,
      license: 'CC0',
      tileMeters: 3,
    };
  }
  throw new Error('no ambientCG sand texture found');
}

if ((!manifest.sky || force) && (!only || only === 'sky')) {
  try {
    manifest.sky = await fetchSky();
  } catch (e) {
    console.error('sky failed:', e.message);
  }
}
if ((!manifest.sand || force) && (!only || only === 'sand')) {
  try {
    manifest.sand = await fetchSandPolyHaven();
  } catch (e) {
    console.error(e.message, '-> trying ambientCG');
    try {
      manifest.sand = await fetchSandAmbientCG();
    } catch (e2) {
      console.error('sand failed:', e2.message);
    }
  }
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('manifest:', JSON.stringify(manifest));
