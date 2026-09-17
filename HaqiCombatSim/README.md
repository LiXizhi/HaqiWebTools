# HaqiCombatSim — 魔法哈奇 2D 网页战斗模拟器

一个自包含的 H5 应用：把魔法哈奇（Haqi MMO）回合制卡牌战斗的服务端数值逐行移植到浏览器，用来

- **人机对战**：在 2D 网页战场上以寒冰 / 烈火 / 风暴 / 生命 / 死亡任一系与 AI 打 1v1、2v2、3v3、4v4；
- **批量模拟**：在 Web Worker 中几秒内跑几千场对局，得到五系胜率矩阵、平均回合数、卡牌使用统计；
- **数值调参**：在页面中直接修改 HP 曲线、卡牌伤害、能量球概率等参数，即时重跑；
- **AI 建议**：内置自动调参器（把各系胜率收敛到 50%）+ 可接大模型输出自然语言调整建议。

战斗引擎与 UI 完全解耦（`js/*_core.js`），可在浏览器和 Node 中无 UI 运行。

## 运行

用任意静态 http 服务打开 [`HaqiCombatSim.html`](HaqiCombatSim.html)（需要 `fetch` 同目录 JSON 与 Web Worker，`file://` 下不可用）。**不需要构建，零 npm 依赖。**

```bash
cd web/HaqiCombatSim
python3 -m http.server 8791 --bind 127.0.0.1      # 或 VS Code Live Preview
# 浏览器打开 http://127.0.0.1:8791/HaqiCombatSim.html
```

首次使用前导出游戏数据（读取本机 `paraworld/config/Aries/`，该目录不在 git 中）：

```bash
npm run export       # scripts/export_data.mjs → data/kids/*.json 与 data/teen/*.json（gitignored）
npm test             # node --test tests/*.test.mjs（30 例，用 data/sample）
npm run sim -- --data data/teen --mode 1v1 --games 1000 --level 60 --seed 1 [--params p.json] [--json out.json]
```

没有本机数据时页面自动回退到 `data/sample/`（极小示例卡组，仅供演示与测试）。

四个页面（hash 路由）：

| 路由 | 页面 | 作用 |
|------|------|------|
| `#battle` | 人机对战 | 1v1~4v4，我方可选一个操控位手动出牌（点卡 → 点目标），其余由 Bot 托管；事件日志 |
| `#batch` | 批量模拟 | 五系两两对战（含镜像）25 组 × N 场，Worker 池并行，胜率热力图 / Wilson 区间 / 卡牌统计 / 导出 |
| `#params` | 数值面板 | 全局常量、各系乘子、公平模式、单卡覆盖，diff 高亮，JSON 导入导出 |
| `#advisor` | AI 建议 | 规则化建议、启发式自动调参（比例控制 / 坐标下降）、OpenAI 兼容 API 大模型建议 + 一键应用参数块 |

## 目录结构

```
web/HaqiCombatSim/
  HaqiCombatSim.html          # 入口（顶栏 / #main / 底栏，<script type=module src=js/app.js>）
  css/style.css               # 全部样式（含 ≤600px 手机适配）
  js/
    app.js                    # 数据集发现 / 加载、hash 路由、顶栏
    state.js                  # 单一状态源 + localStorage 持久化（params、settings、lastBatch）
    utils.js                  # h() DOM 构建、格式化、下载 / 读文件、toast
    data_core.js              # loadDataset(readJson 注入)、normalizeDataset、discoverDatasets
    rng_core.js               # 可播种 PRNG（mulberry32），int(min,max) 闭区间
    combat_params_core.js     # BalanceParams：默认值、合并、diff、序列化、resolveParams、inferTargetKind
    combat_formulas_core.js   # damage/heal/crit/dodge/accuracy/HP 曲线/pip —— 与 Lua 1:1，逐函数标注行号
    combat_unit_core.js       # 单位状态：HP/pips/charms/wards/auras/DOT/HOT/stun/手牌/冷却 + 属性查询
    combat_cards_core.js      # 按 template.type 分发的卡牌效果处理器（50+ type）+ UNSUPPORTED_TYPES
    combat_arena_core.js      # free_pvp 半回合状态机 + CombatEvent 事件流 + runToEnd
    combat_policy_core.js     # DeckAttackerBot（官方 CSV 情境权重）/ SimpleBot / RandomBot / HumanPolicy
    combat_presets_core.js    # presetDeck / gearStats / unitSpec / matchupMatrix / SCHOOL_NAMES
    sim_batch_core.js         # buildJobs / runJob / mergeStats / wilson / aggregateMatrix（纯函数）
    sim_worker.js             # Web Worker：接收任务、流式回报进度
    sim_pool.js               # Worker 池调度（无 Worker 时主线程回退）
    sim_tuner_core.js         # 自动调参器：tuneProportional / tuneCoordinate
    llm_advisor.js            # buildPrompt / requestAdvice / parseParamPatch / heuristicAdvice
    view_battle.js            # 2D 对战页
    view_batch.js             # 批量模拟页（热力图 + 表格 + 导出）
    view_params.js            # 数值面板
    view_advisor.js           # AI 建议页
  data/
    sample/                   # 已入库的极小示例数据集（52 卡）
    kids/  teen/              # npm run export 生成，gitignored
  scripts/
    export_data.mjs           # config/Aries XML/CSV → JSON 导出器
    run_batch.mjs             # CLI 批量模拟（与页面共用 sim_batch_core）
    lib/xml_lite.mjs          # 零依赖 XML 解析器
  tests/                      # node:test，*.test.mjs
  docs/
    plan.md                   # 总体计划与阶段任务（已全部完成，含「实际」偏差标注）
    design.md                 # 产品设计：页面、交互、统计口径
    architecture.md           # 技术架构：模块、数据流、引擎细节、意图 vs 现实
    lua-mapping.md            # 公式/常量 ↔ Lua 源码行号对照表
    data-export.md            # 数据导出器规格
    qa-report.md              # 验收记录：真实数据五系胜率基线、引擎修正、性能
    devlog/                   # 开发日志，每天一个文件
  AGENTS.md                   # 给编码代理的硬规则
```

## 数据来源

引擎公式移植自 `script/apps/Aries/Combat/ServerObject/`（`card_server.lua`、`player_server.lua`、`arena_server.lua`），对照表见 [docs/lua-mapping.md](docs/lua-mapping.md)。卡牌与预设数据来自本机 `config/Aries/`：

| 文件 | 用途 |
|------|------|
| `Cards/CardList.xml` / `CardList.teen.xml` + 单卡 XML | 卡牌模板（type、pipcost、accuracy、damage_min/max…） |
| `Cards/CharmWardList(.teen).xml` | charm / ward / miniaura / globalaura 数值 |
| `Combat/MobStatsByGearScore(.teen).xml` | 各系按装备分数区间的 HP / 伤害 / 抗性 / 暴击预设 |
| `Combat/deck_attacker_ai/Aggressive{School}.csv` | 官方 Deck_Attacker AI 的情境权重卡组（Bot 出牌策略） |
| `Combat/MobAIDeckByGearScore(.teen).xml` | 按装备分数的 AI 卡组（gsid 形式，尽力映射） |
| `HP/HP_level_mapping.xml` | 旧 HP 表（参考） |

## 相关文档

- 仓库 wiki：[docs/aries/combat-system.md](../../docs/aries/combat-system.md)、[docs/config/aries-haqi-data.md](../../docs/config/aries-haqi-data.md)
- 仓库 wiki 入口：[docs/aries/haqi-combat-sim.md](../../docs/aries/haqi-combat-sim.md)
- 本项目：[docs/plan.md](docs/plan.md) → [docs/architecture.md](docs/architecture.md) → [docs/lua-mapping.md](docs/lua-mapping.md) → [docs/qa-report.md](docs/qa-report.md)
