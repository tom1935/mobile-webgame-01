# Beach Volley (mobile web game)

2v2 beach volleyball for phones (landscape). You control one player; your teammate and the opponents are bots.
Spec (Japanese): [docs/design.md](docs/design.md)

## Controls
Touch the left half (your court) to run, flick on the right half to hit (up = set, forward = attack, forward while jumping = spike), tap the top band to jump.

## Development
Requires Node 22.18+ (runs TypeScript directly).

```sh
npm test                                  # logic + gesture tests
npm run sim -- --autoplay --matches 20    # headless bot matches, prints stats
npm run sim -- --autoplay --events --frames 600   # JSONL event log
npm run sim -- --autoplay --ascii 200     # text drawing of the court at frame 200
npm run build                             # -> .dev-build/ (static site)
npm run e2e                               # touch-driven browser test, 3D view (Playwright)
node tests-e2e/play.mjs --2d              # same test on the 2D view (after npm run build)
```

URL options: `?debug=1` (coordinates overlay + `window.__game` API), `?seed=N`, `?autoplay=1`, `?points=7`, `?view=2d` (2D side view instead of 3D), `?quality=high|low`.

3D assets: `assets/` (credits in `assets/CREDITS.md`). `node tools/fetch-assets.mjs` downloads the CC0 sky HDRI and sand textures (Poly Haven / ambientCG) and records them in `assets/manifest.json`.

GitHub Pages: pushes to `main` deploy via `.github/workflows/pages.yml`
(set repository Settings → Pages → Source to "GitHub Actions").
