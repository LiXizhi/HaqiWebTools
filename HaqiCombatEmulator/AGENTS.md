# HaqiCombatEmulator

Read README.md, docs/code-plan.md, docs/architecture.md and the relevant stage plan before editing.

- Browser-only native ES modules. Serve HaqiCombatEmulator.html with a static HTTP server. No application server, framework, bundler or NPL runtime requirement.
- engine/, rules/, bots/ and simulation/runner.js must not depend on DOM, storage, network, wall time or Math.random. All battle random state belongs to a battle; bot choice randomness is independently derived from seed and public observation. simulation/pool.js owns browser Worker scheduling.
- Keep kids and teen rules isolated. Preserve Lua operation order, numeric boundaries and rounding. Cite original function names in rule implementations.
- Data snapshots come only from the supplied config and GlobalStore. Never invent missing production records. Unsupported effects fail closed, including inside AI candidates.
- Never present an unverified simulator result as production balance evidence. Coverage and parity status must accompany reports.
- Keep modules focused. app.js assembles views; it must not implement damage rules or AI strategy.
- README and docs/code-plan.md are the handoff entrypoints. Stage completion needs recorded evidence, not just implemented UI.
- Run npm test, npm run check and git diff --check. Browser tests target this web application, not the native NPL browser console.
- Preserve unrelated files and follow the repository dev branch workflow. Do not deploy as part of routine implementation.
