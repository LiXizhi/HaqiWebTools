# AGENTS.md — `web/HaqiCombatSim/`

魔法哈奇 2D 网页战斗模拟器。父级规则见 [/AGENTS.md](../../AGENTS.md)；本目录是独立的纯前端 H5 子项目，**不适用** NPL 的 `NPL.load` / `commonlib.gettable` 规则。

## 先读什么

1. [docs/plan.md](docs/plan.md) — 阶段任务与当前进度
2. [docs/architecture.md](docs/architecture.md) — 模块分层与数据流
3. [docs/lua-mapping.md](docs/lua-mapping.md) — 任何数值公式改动前必须对照的 Lua 源码表

## 硬规则

1. **不需要构建。** 纯 ES Module + Vanilla JS，直接打开 `HaqiCombatSim.html` 验证。不要引入 TypeScript、打包器、前端框架。`package.json` 仅用于 `npm run export`（数据导出）和 `npm test`。
2. **引擎与 UI 分层。** 所有战斗逻辑放在 `js/*_core.js`，只能依赖其他 `*_core.js`，不得引用 `document`/`window`/`fetch`；这些模块必须能在 Node 里被 `tests/*.test.mjs` 直接 import。`view_*.js` 只渲染 DOM 和绑定事件，通过回调把意图交给 `app.js`。
3. **公式 1:1 移植并标注来源。** `combat_formulas_core.js` 中每个函数头部注释写出 Lua 文件与行号（例如 `card_server.lua damage_expression L1473-1516`），kids / teen 分支用 `version` 参数区分，不得"顺手简化"。发现 Lua 行为与本地实现不一致时，以 Lua 为准并在 `docs/lua-mapping.md` 记录。
4. **可复现。** 所有随机数走 `rng_core.js` 的实例，禁止直接 `Math.random()`；同一 seed + 同一参数必须得到同一结果（有测试守护）。
5. **参数只走 BalanceParams。** 调参器、数值面板、LLM 建议都只改 `combat_params_core.js` 定义的覆盖层，引擎读取 `resolveParams(dataset, params)` 的结果，不得在引擎里散落魔法数字。
6. **数据不入库。** `data/kids/`、`data/teen/` 由 `scripts/export_data.mjs` 从本机 `config/Aries/` 生成，已 gitignore；只提交 `data/sample/`。不要把真实卡牌数值复制进源码或文档。
7. **未支持即透明。** 未实现的 `template.type` 必须计入 `unsupported` 统计并在批量报告中展示，不得静默忽略。
8. **开发日志写 `docs/devlog/devlog_YYYY-MM-DD.md`**，不要在 `docs/` 根目录或别处新增日志。
9. 用户可见文案为中文；代码标识符英文；不加 emoji。

## 验证

- `npm test`（`node --test tests/`）：公式回归、确定性、冒烟。
- 浏览器打开 `HaqiCombatSim.html`：对战页能完整打完一场 1v1；批量页 1v1 × 五系 × 200 场能出矩阵。
- 改动引擎后，在 `docs/qa-report.md` 追加一条验证记录。
