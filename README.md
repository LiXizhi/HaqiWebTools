# HaqiWebTools

Browser tools for **Magic Haqi** combat numbers. This repository is the `web/` tree that used to live next to the [paraworld](https://github.com/LiXizhi/paraworld) NPL scripts; it is not part of the MMO client.

| App | Role |
|-----|------|
| [HaqiCombatEmulator](HaqiCombatEmulator/README.md) | Kids/teen combat lab: 1v1–4v4 play/replay, batch experiments, reports, Keepwork candidate retuning |
| [HaqiCombatSim](HaqiCombatSim/README.md) | 1:1 JS port of server combat rules, 2D vs-bot play, win-rate matrices, `BalanceParams` editor, heuristic/LLM advisor |

Each app is a no-build static HTML + ES module project. Serve that folder over HTTP (not `file://`). See the app README for ports, tests, and data export.

Haqi Lua combat source remains in paraworld: `script/apps/Aries/Combat/`.
