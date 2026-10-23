// Dependency-free build: tsc -> .dev-build/, plus index.html pointing at the JS,
// three.js (only the files the game imports) under vendor/, and the assets/ folder.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const OUT = '.dev-build';
rmSync(OUT, { recursive: true, force: true });
execSync('tsc -p tsconfig.json', { stdio: 'inherit' });
const html = readFileSync('index.html', 'utf8').replace('/src/main.ts', './src/main.js');
writeFileSync(join(OUT, 'index.html'), html);

// --- three.js: core build + addons reachable from our imports -------------------------
const THREE_DIR = 'node_modules/three';
const vendor = join(OUT, 'vendor/three');
mkdirSync(vendor, { recursive: true });
for (const f of ['three.module.js', 'three.core.js']) cpSync(join(THREE_DIR, 'build', f), join(vendor, f));

const importRe = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g;
const imports = (file) => [...readFileSync(file, 'utf8').matchAll(importRe)].map((m) => m[1] ?? m[2]);
const walk = (dir) =>
  readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));

const addonsSrc = resolve(THREE_DIR, 'examples/jsm');
const queue = walk(join(OUT, 'src'))
  .filter((f) => f.endsWith('.js'))
  .flatMap(imports)
  .filter((s) => s.startsWith('three/addons/'))
  .map((s) => join(addonsSrc, s.slice('three/addons/'.length)));
const seen = new Set();
while (queue.length) {
  const file = queue.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  if (!existsSync(file)) throw new Error(`missing three addon: ${file}`);
  const dest = join(vendor, 'addons', file.slice(addonsSrc.length + 1));
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(file, dest);
  for (const s of imports(file)) if (s.startsWith('.')) queue.push(resolve(dirname(file), s));
}

// --- assets -----------------------------------------------------------------------------
cpSync('assets', join(OUT, 'assets'), { recursive: true });
console.log(`built ${OUT}/ (three addons: ${seen.size} files)`);
