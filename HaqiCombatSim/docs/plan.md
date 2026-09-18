# HaqiCombatSim 总体计划

> 状态：**Phase 0~6 已实施完成**（2026-09-16）。实施进度以本文件 checkbox、[qa-report.md](qa-report.md) 和 `devlog/` 为准。与原计划的偏差在各阶段末以「实际」标注。

## 目标

1. 在浏览器中以 2D 网页形式复现魔法哈奇 PvP 战斗（寒冰 / 烈火 / 风暴 / 生命 / 死亡，1v1 / 2v2 / 3v3 / 4v4），支持人机对战。
2. 战斗引擎脱离 UI，可在 Web Worker / Node 中以每秒数百场的速度批量模拟，输出五系胜率矩阵。
3. 数值参数（HP 曲线、卡牌伤害、能量球概率、暴击/命中常量等）可在页面中修改并即时重跑。
4. 提供数值调整建议：内置自动调参器 + 大模型自然语言建议。
5. 引擎公式与 `script/apps/Aries/Combat/ServerObject/*.lua` 逐行对照，结论可回移到线上配置。

## 非目标（第一阶段）

- 宠物、符文、龙图腾、装备实物属性（用装备分数区间预设 + 手动滑杆代替）。
- PvP 排位分 / ELO / 奖励结算。
- 真实多人联机（多人 = 本地 Bot 队友 / 对手）。
- PvE 怪物 AI 的 Genes_Attacker。

## 研究结论摘要

- 权威数值全部在服务端 Lua：伤害 / 治疗 / 暴击 / 闪避 / 命中在 `card_server.lua`；HP 曲线与能量球在 `player_server.lua`；回合状态机在 `arena_server.lua`。详见 [lua-mapping.md](lua-mapping.md)。
- `combat_server.lua` 与 GSL gridnode、`PowerItemManager` 强耦合，无法直接 headless 复用，因此选择 JS 1:1 移植而非桥接。
- 1v1~4v4 在引擎层没有区别，只是每边单位数（上限 4）；差别来自大厅 key 和 arena XML 的人数限制。
- 五系之间**没有相克表**（`boost_table` 已废弃），平衡完全由 HP 曲线、卡牌数值、charm/ward、装备百分比决定。
- 卡牌数据在本机 `config/Aries/`（gitignored）：kids 811 张、teen 1374 张；`deck_attacker_ai/Aggressive{School}.csv` 直接以 cardkey 给出官方 AI 卡组与情境权重，可作为 Bot 策略与预设卡组来源，无需 gsid 映射。

## 阶段与任务

### Phase 0 — 项目骨架
- [x] `HaqiCombatSim.html`（**实际**：自带 `css/style.css`，不引 Tailwind CDN，保证离线可用）
- [x] `package.json`（`type: module`；scripts：`export`、`test`、`sim`；**实际**：零依赖，XML 用自写 `scripts/lib/xml_lite.mjs`）
- [x] `.gitignore`（`node_modules/`；`data/kids/` 与 `data/teen/` 入库）
- [x] `js/app.js`、`state.js`、`utils.js`（**实际**：`config`/`i18n` 并入 `state.js` 与 `combat_presets_core.js` 的 `SCHOOL_NAMES`，未单列）
- [x] `data/sample/` 手写极小数据集（52 卡）：每系 6~8 张卡（单攻 / 群攻 / 治疗 / blade / shield / DOT）、1 个 stats 区间、1 份 AI 权重

### Phase 1 — 数据导出器（`scripts/export_data.mjs`）
- [x] 解析 `CardList*.xml` → 逐个单卡 XML → `cards.json`（字段与 `Card:CreateCardTemplate` 一致，`params` 全部数值化）
- [x] 解析 `CharmWardList*.xml` → `charms.json`（charm / ward / miniaura / globalaura）
- [ ] 解析 `CombatThreatConfig*.xml` → `threat.json`（**实际**：PvP 不用威胁值，暂未导出）
- [x] 解析 `MobStatsByGearScore*.xml` → `stats_by_gear.json`
- [x] 解析 `deck_attacker_ai/*.csv` → `ai_decks.json`（列名 → 条件键，权重数值化）
- [x] 解析 `MobAIDeckByGearScore*.xml` + gsid 尽力映射 → `ai_deck_by_gear.json`，未映射写 `manifest.unmapped`
- [x] 解析 `HP/HP_level_mapping.xml` → `hp_table.json`
- [x] 生成 `manifest.json`（version、卡数、type 分布、已支持 / 未支持 type 列表、导出时间）
- [x] 对真实 `config/Aries` 跑通 kids + teen，记录未支持 type 占比到 [data-export.md](data-export.md)

### Phase 2 — 无 UI 战斗引擎（`js/combat_*_core.js`、`rng_core.js`）
- [x] `rng_core.js`：mulberry32，接口 `int(min,max)`、`float()`、`pick(arr)`，与 Lua `math.random(a,b)` 闭区间语义一致
- [x] `combat_params_core.js`：`DEFAULT_PARAMS`（按 version）、`resolveParams`、`diffParams`、`serialize/parse`
- [x] `combat_formulas_core.js`：`aboveMinBoost`、`damageExpression`、`healExpression`、`tryCriticalStrike`、`tryDodge`、`rollAccuracy`、`maxHpFor(school, level, version)`、`powerPipChance(level, version, bonus)`、`generatePip(unit)` —— 每个函数注释 Lua 行号
- [x] `combat_unit_core.js`：单位结构、各系 stat 查询（damage% / resist% / accuracy% / crit / resilience / hit / dodge / penetration / absolute）、charm / ward / absorb / DOT / HOT / stun / miniaura、手牌（上限 8）与卡组抽取、pips（上限 7 kids / 14 teen，power pip 对本系卡计 2）
- [x] `combat_cards_core.js`：效果处理器注册表，第一批 type：`Pass`、`SingleAttack`、`SingleAttackWithDOT`、`SingleAttackWithStun`、`SingleAttackWithSelfStun`、`SingleAttackWithLifeTap`、`SingleAttackWithPercent`、`SingleAttackWithStandingWards`、`SingleAttackWithTrap`、`AreaAttack`、`AreaAttackWithDOT`、`AreaAttackWithStun`、`ArenaAttack`、`DOTAttack`、`DOTAttackWithHOT`、`SingleHeal`、`SingleHealWithHOT`、`SingleHealWithCleanse`、`AreaHeal`、`AreaHealWithHOT`、`AreaHealWithAbsorb`、charm / ward / trap 类（`Blade` / `Trap` / `Shield` / `Weakness` 等经 CharmWardList）、`Global`、`MiniAura`、`AreaPowerPipBoost`、`SingleCleanse`、`AreaCleanse`、`RemovePositiveCharm` / `RemoveNegativeCharm` / `StealCharm` 及 ward 对应项、`Stance`、`Random`；其余登记为 `unsupported`
- [x] `combat_arena_core.js`：`createArena(teams, params, rng)`、`advanceTurn`（生成 pip → 所有单位选牌 → 按顺序结算 → DOT/HOT/aura 递减 → 死亡判定）、`isFinished`（一侧全灭或超 `maxRounds` 判平）、`CombatEvent[]` 事件流
- [x] `combat_policy_core.js`：`Policy` 接口；`DeckAttackerBot`（移植 CSV 情境权重：base_weight + 命中条件列累加，<0 剔除，加权随机）；`SimpleBot`（低血治疗 / 有 blade 出大招 / 否则最高可用伤害打最低 HP 敌人）；`HumanPolicy`（返回 Promise，由 UI resolve）
- [x] `combat_presets_core.js`：`makeUnit({school, level, gearBand, version, deckSource})`；HP 走公式，装备百分比取 `stats_by_gear` 区间，卡组取 `ai_decks` 并按 `require_level` / pipcost 过滤
- [x] 测试（**实际**合并为三个文件）：`formulas.test.mjs`（公式 / HP 曲线 / pips / rng）、`engine.test.mjs`（确定性、1v1~4v4 冒烟、状态机、参数覆盖、DOT 溅射 / X 费、批量聚合、调参器、LLM 解析）、`xml_lite.test.mjs`

### Phase 3 — 批量模拟（`js/sim_*.js`）
- [x] `sim_batch_core.js`：`buildMatrix({schools, modes, levels, gearBand, teamComposition})`、`runOne(matchup, params, seed)`、`aggregate(results)`（胜率 + Wilson 置信区间、平均回合、场均伤害 / 治疗、fizzle 率、卡牌使用与贡献伤害、unsupported 计数）
- [x] `sim_worker.js`：接收 `{version, dataset, params, matchups, gamesPer, seed}`，每 N 场 postMessage 进度
- [x] `sim_pool.js`：按 `navigator.hardwareConcurrency` 建池，按 matchup 分片，合并结果
- [x] 性能目标：sample 数据 1v1 ≥ 500 场/秒/worker；真实数据 4v4 ≥ 50 场/秒/worker（实测 Node 单线程 teen 1v1 ≈ 5800 场/s，4v4 ≈ 1250 场/s）

### Phase 4 — 页面（`js/view_*.js`、`css/`）
- [x] 顶栏：kids / teen 切换（重新加载数据集）、数据集状态（manifest 摘要 / 回退 sample 提示）
- [x] 对战页 `view_battle.js`：模式选择、双方阵容配置（系 / 等级 / 装备段 / 策略）、2D 战场（两侧各 4 槽：头像色块、HP 条、pips、charm/ward 图标、DOT 计时、stun）、手牌区（8 张，可用高亮，显示 pipcost / 伤害区间 / 命中）、点卡 → 选目标 → 结算动画（CSS）、战斗日志、结束面板
- [x] 批量页 `view_batch.js`：矩阵配置（系 × 系、模式、等级段、场次、seed）、进度条、5×5 胜率热力图、按模式对比、卡牌统计表、导出 CSV / JSON
- [x] 数值面板 `view_params.js`：全局常量、按系系数滑杆、单卡表格（筛选 / 编辑 damage_min/max / pipcost / accuracy）、与基线 diff 高亮、导入 / 导出 JSON、"重跑矩阵"
- [x] AI 建议页 `view_advisor.js`：见 Phase 5
- [x] 移动端适配（≥ 375px 宽可用）

### Phase 5 — 数值建议
- [x] `sim_tuner_core.js`：目标函数 Σ(winrate − 0.5)² 覆盖所选矩阵；对 `perSchool.{hp,damage,heal,accuracy,powerPip}` 乘子做坐标下降（步长自适应，迭代与每次评估场次可配，固定 seed 降噪）；输出参数改动清单 + 前后矩阵对比；可一键写回 BalanceParams
- [x] `llm_advisor.js`：`buildPrompt(stats, params, manifest)`（中文，附带每系代表卡与当前系数）、`requestAdvice({endpoint, apiKey, model, prompt})`（OpenAI 兼容 chat/completions，凭据存 localStorage）、解析返回中的 ```json 参数块供一键应用
- [x] 建议页展示：当前矩阵摘要、调参器运行 / 停止 / 应用、LLM 设置与结果 Markdown

### Phase 6 — 验收与文档
- [x] `npm test` 全绿；确定性测试覆盖引擎 + 批量聚合
- [x] 用真实 kids / teen 数据各跑一次 1v1 五系 × 1000 场，把矩阵与未支持卡占比记入 [qa-report.md](qa-report.md)
- [x] 填写 `architecture.md` 的"意图 vs 现实"小节
- [x] 仓库 wiki 收口：新增 `docs/aries/haqi-combat-sim.md`，并在 `docs/CODEMAP.md`、`docs/TOPIC-INDEX.md` 各加一行（按根 AGENTS.md 要求）

### Phase 7 — 卡包 / 配卡 / 决斗圆盘演示（2026-09-17 追加需求）
- [x] `BalanceParams.global.deckCapacity` / `deckEachCapacity` / `deckPresetCopies`（Lua 卡包道具 stats[167]/[170]；默认 40 / 6 / 3，初始卡包 kids 14/3、teen 18/5 可手动改回）
- [x] `clampDeck` 裁剪 + teen 同名技能共享上限；预设卡组改为轮询填充，随容量自动缩放
- [x] 弃牌与出牌解耦（可弃牌 + 跳过）；无手牌跳过区分 `no_cards` / `deck_empty`；双方打空提前判平
- [x] 批量统计：无牌跳过率、单位打空卡包比例、双方打空判平比例；批量页可复用对战页配卡
- [x] 对战页配卡面板（搜索 / 份数 / 预设 / 保存 per version+school）
- [x] SVG 决斗圆盘：站位点、头像 / HP / 魔力点（普通蓝 / 超级金 + 图例）/ 卡包剩余 / 状态徽标；中央卡牌面板 + 施法者→目标能量束 + 飘字；状态明细板
- [x] 事件流分步动画（慢 / 正常 / 快 / 无），跳过动画，跨页切换接回对局
- [x] 测试：`clampDeck`、容量裁剪、打空 → `deck_empty` → 提前平局、弃牌生效时机

## 关键设计决策

1. **纯 JS 移植而非桥接 NPL**：`combat_server.lua` 依赖 GSL 与 PowerItemManager，桩掉成本高且不利于浏览器内批量模拟；移植时以行号对照保证可审计。
2. **无构建、无框架**：与 MagicHaqi 一致，`*_core.js` 可在 Node 直接测试。
3. **随机数集中**：Lua 端 `math.random(0,100)`、`(0,1000)`、`(1,10000)` 等阈值语义在 `rng_core.int(min,max)` 中保持闭区间一致。
4. **参数覆盖层**：数据集只读；所有可调项在 BalanceParams，便于 diff、导入导出、调参器与 LLM 共用。
5. **Bot 策略复用官方 CSV**：`Aggressive{School}.csv` 是线上 Autobot 的真实策略，用它可让胜率矩阵更接近真实玩家 / 机器人对局；`SimpleBot` 作为无数据时的后备。
6. **未支持类型透明化**：manifest 与批量报告都展示未支持卡的数量与出现频次，避免结论被"静默 Pass"污染。

## 风险与对策

| 风险 | 对策 |
|------|------|
| 卡牌 type 长尾多（60+），第一批覆盖不全导致某系胜率失真 | 报告中标注每系"未支持卡占卡组比例"；优先补占比最高的 type |
| 真实装备属性缺失 | 用 `MobStatsByGearScore` 区间 + 手动滑杆；在报告里声明"装备段" |
| Lua 中 kids / teen 分支差异多，移植遗漏 | `lua-mapping.md` 表逐项打勾；测试用例按 version 成对 |
| 批量模拟噪声掩盖小幅参数变化 | 固定 seed、Wilson 区间显示、调参器每次评估场次可调 |
| LLM 建议不可控 | 仅作为建议展示，应用前经 diff 确认；调参器结果为主 |

## Phase 8 — Haqi.html 初心之旅（2026-09-17）

- [x] 独立入口，Canvas 2D世界/法阵与HTML界面，保留现有模拟器
- [x] 原63000–63013、五系、15居民、7种遭遇、本地原版美术、新绘制精灵
- [x] 纯规则模块：任务/装备强化/配卡/成长/宠物、碰撞寻路与交互
- [x] 单独PvE回合控制，原AI序列与HP基因，可重现的决定重演
- [x] 独立版本化存档、JSON导入导出、奖励去重、失败/撤退安全点
- [x] 限制Lua字面量导出、完整CDN条目准备、本地解码与引用验证
- [x] 五系完整章节自动验证，浏览器验证与修复记录见qa-report

范围与明确改编见 [adventure.md](adventure.md)，不将此章节表述为完整MMO移植。

## Phase 9 — WebP、Keepwork CDN 与云端旅途（2026-09-17）

- [x] 90张图片无损WebP，保留alpha/像素/尺寸，Git保留本地副本
- [x] 91项内容哈希命名永久CDN文件；全部实际GET、CORS、字节/哈希核验
- [x] localhost默认local，线上默认Keepwork CDN，可显式测试两种模式
- [x] 按需SDK、中文登录、本地自动存档、手动云端检查点、预览后恢复、替换前备份
- [x] 独立workspace与唯一文件，远端写后读验证，账号变化/本地更新/失败写入保护
- [x] 69个自动测试，实际CDN浏览器解码，桌面/手机菜单、战斗云端重演与本地重载
- [ ] 真正登录Keepwork账号后的服务端保存/另一设备读取验收（无测试账号；真实SDK已验证加载、中文登录及取消，读写流程使用隔离模拟SDK）

未部署网站；资源上传不等同于网站上线。没有引入额外前端库或改变PvP/PvE数值。


## 2026-09-18：全卡美术替换

- [x] 225个kids基础技能/701条定义共享主体，18张常规图集与6张专属九帧图集生成并上传永久CDN。
- [x] 新图集≤100KB，背景<24KB；接入冒险卡包/手牌/演出、特效工坊、全卡检索预览及kids模拟器手牌。
- [x] 全量引用、渲染命令、帧裁剪与远端资源验证；92项工作区测试通过。
- [ ] 当前任务浏览器连接失败，页面视觉/动画连贯性仍待人工验收。

## 2026-09-18：抱抱龙、全宠物与50级商店

- [x] 359项来源宠物、三色初始抱抱龙、四阶段与独立等级卡包
- [x] 四卡位、同位附卡/跟随、独立宠物AI、捕获及战斗重演
- [x] 全局商店、等级科技树、1008件装备、补给与1–50级试炼
- [x] HP持久化、在线饥饿/自动进食、离线仅回血、旧存档迁移
- [x] 家园正式入口与版本化联动接口（双向同步不在本期）
- [x] 359张原CDN WebP本地归档、CORS/哈希/体积核验

具体规则及验收范围见[pets-and-shop.md](pets-and-shop.md)及QA报告。

## 2026-09-18：Vite发布流程

- [x] 参考Maisi/MagicHaqi加入四入口Vite构建，保留原生源码运行。
- [x] 内容哈希发布计划、复用Maisi七牛上传器、逐文件CDN哈希与CORS核验。
- [x] 打包批量Worker支持跨域HTML/CDN部署；新增发布回归测试。

操作见[部署说明](deployment.md)，实际首次发布结果见qa-report。
