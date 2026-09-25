---
name: browser-fixture-check
description: >-
  Screenshot and measure the Haqi adventure UI in a headless browser without a
  Playwright install, using tests/fixtures/*.html pages served over HTTP plus
  Chrome DevTools Protocol over the repo's own ws dependency. Use when a UI
  change needs visual verification, when the user sends an annotated
  screenshot, when a browser tool connection fails, or when checking layout
  sizes (cell heights, overflow, 390px) for Haqi.html panels.
---

# Browser fixture check

The adventure UI is a browser app, so layout claims need a real render. This
skill drives an already-installed Chrome over CDP; no Playwright, no extra
download, and nothing is written to a player save.

## 1. Serve the project

From `web/HaqiCombatSim`, start a static server on a free port and keep it
running (background it; a foreground subshell dies with the tool call):

```text
python -m http.server 8799 --bind 127.0.0.1
```

`file://` will not work: the media and JSON loaders use `fetch`.

## 2. Start headless Chrome

```text
chrome --headless=new --disable-gpu --hide-scrollbars --no-first-run \
  --remote-debugging-port=9222 --user-data-dir=<temp>/chrome-cdp-profile about:blank
```

Windows path: `/c/Program Files/Google/Chrome/Application/chrome.exe`.

## 3. Screenshot or probe a fixture page

Run the scripts from this folder so `ws` resolves from the repo's
`node_modules`. Write output into `.asset-cache/` (git-ignored).

```text
node .cursor/skills/browser-fixture-check/shot.mjs \
  "http://127.0.0.1:8799/tests/fixtures/equipment-slots.html?assets=local&lang=en" \
  .asset-cache/equipment-slots-preview/after-en.png 1280 820

node .cursor/skills/browser-fixture-check/probe.mjs \
  "http://127.0.0.1:8799/tests/fixtures/tabs.html?assets=local&panel=equipment" \
  "document.querySelector('.equipment-modal .equipment-slots').getBoundingClientRect().height" 1280 820
```

`probe.mjs` prints the JSON value of the expression, so it is the cheap way to
check reported sizes (`getComputedStyle`, `getBoundingClientRect`,
`scrollHeight`, `aria-label` text) instead of eyeballing pixels.

Always render at 1280 for desktop and 390×844 for phone.

## 4. Fixture conventions

- Pages live in `tests/fixtures/`, load the real stylesheets and the real view
  modules, and build an in-memory character. They must never read or write
  player storage or the cloud.
- Set `<base href="../../">` so `assets/...` and `data/...` resolve from the
  project root, and use `?assets=local` to read the archived WebP copies
  instead of the CDN.
- `?lang=en` runs the English dictionary (`loadLocaleFiles`), which is how
  reported screenshots are reproduced.
- After the panel is painted set `document.documentElement.dataset.fixtureReady=1`;
  on failure set `dataset.fixtureError`. Both `shot.mjs` and `probe.mjs` wait
  for one of them and report an exception from the page console.
- `tests/fixtures/equipment-slots.html` is the equipment/bag page with the
  炫彩 slots (18/19/70/71) equipped; `tests/fixtures/tabs.html?panel=<name>`
  renders any other panel.

## 5. Environment notes

- Background servers and browsers must be launched with the tool's background
  mode, otherwise they are killed when the call returns.
- `npm run build` can fail once with `[safe-delete] ... ETIMEDOUT` from the
  sandbox's trash shim while it empties `dist/`; retrying succeeds.
- `spawnSync` of the managed node from a temp directory fails with `EBUSY`, so
  `tests/release.test.mjs` cannot pass inside the sandbox. Treat that as
  environmental, not a regression.
- Close the CDP target after each run (the scripts do it); review the PNG with
  the image reader before claiming a layout result.
