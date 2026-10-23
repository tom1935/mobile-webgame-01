// Dependency-free build for local testing: tsc -> .dev-build/, plus index.html pointing at the JS.
// (The production build uses Vite; this exists so the game can be tested without npm install.)
import { execSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';

rmSync('.dev-build', { recursive: true, force: true });
execSync('tsc -p tsconfig.json', { stdio: 'inherit' });
const html = readFileSync('index.html', 'utf8').replace('/src/main.ts', './src/main.js');
writeFileSync('.dev-build/index.html', html);
console.log('built .dev-build/');
