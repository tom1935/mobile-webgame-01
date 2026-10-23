# Beach Volley (mobile web game)

2v2 beach volleyball for phones (landscape). You control one player; your teammate and the opponents are bots.
Spec (Japanese): [docs/design.md](docs/design.md)

## Controls
Tap / hold to run, flick to hit the ball (up = set, forward = attack, forward while jumping = spike), JUMP button to jump.

## Development
Requires Node 22.18+ (runs TypeScript directly).

```sh
npm test                                  # logic + gesture tests
npm run sim -- --autoplay --matches 20    # headless bot matches, prints stats
npm run sim -- --autoplay --events --frames 600   # JSONL event log
npm run sim -- --autoplay --ascii 200     # text drawing of the court at frame 200
npm run build                             # -> .dev-build/ (static site)
npm run e2e                               # touch-driven browser test (Playwright)
```

URL options: `?debug=1` (coordinates overlay + `window.__game` API), `?seed=N`, `?autoplay=1`, `?points=7`.

GitHub Pages: pushes to `main` deploy via `.github/workflows/pages.yml`
(set repository Settings → Pages → Source to "GitHub Actions").
