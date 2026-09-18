# HaqiWebTools

Browser tools for **Magic Haqi** combat numbers. This is a separate git repository from the Haqi NPL client.

**Usual checkout:** clone this repo as `paraworld/web/`, where `paraworld` is the Haqi root (the tree that contains `script/apps/Aries/` and `config/Aries/`). The tools stay next to the game scripts they read, but they are not part of the paraworld git repo (`web/` is gitignored there).

```text
paraworld/                  # Haqi root (NPL client)
  script/apps/Aries/        # combat Lua
  config/Aries/             # card XML / AI decks (local install data)
  web/                      # this repo (HaqiWebTools)
    HaqiCombatEmulator/
    HaqiCombatSim/
```

```sh
cd paraworld
git clone https://github.com/lixizhi/HaqiWebTools.git web
```

| App | Role |
|-----|------|
| [HaqiCombatEmulator](HaqiCombatEmulator/README.md) | Kids/teen combat lab: 1v1–4v4 play/replay, batch experiments, reports, Keepwork candidate retuning |
| [HaqiCombatSim](HaqiCombatSim/README.md) | 1:1 JS port of server combat rules, 2D vs-bot play, win-rate matrices, `BalanceParams` editor, heuristic/LLM advisor |

Each app is a no-build static HTML + ES module project. Serve that folder over HTTP (not `file://`). App datasets used at runtime are in git under each app’s `data/` folder. Haqi Lua combat source remains in paraworld: `script/apps/Aries/Combat/`.

## Vite Build + Keepwork CDN Publish (HaqiCombatSim)

To publish a static release package for `HaqiCombatSim`, use the standalone tooling under `vite-magic-haqi/`.
This does not change the app architecture: runtime is still static HTML + ES modules.

```sh
cd vite-magic-haqi
npm install
npm run build
```

Build output is `vite-magic-haqi/dist/` and includes `HaqiCombatSim` static runtime files.

Prepare a Keepwork CDN upload plan:

```sh
npm run prepare:cdn -- --prefix keepwork/magic-haqi/v1/
```

This generates:
- staged files in `vite-magic-haqi/.asset-cache/publish/` (named by SHA-256)
- publish plan in `vite-magic-haqi/cdn-publish-plan.json`

After uploading those staged files to Keepwork CDN, verify remote integrity (HTTP/CORS/hash/size):

```sh
npm run verify:cdn
```
