# 计划需求：异步 PVP（非实时对战）

> 状态：**计划中，尚未实现。**  
> 来源：产品负责人李西峙，2026-09-18 钉钉私信 Lily（未改产品 git；草稿备忘仅作意图）。  
> 含义：双方不必同时在线；一方出牌后等待对方稍后回应，再由本引擎结算。不是再做一套伤害公式。

本文区分：引擎里已经能跑的 1v1–4v4 人机 PvP、冒险里的决定重演，以及真正的玩家匹配 / 回合超时 / 战报回放。不虚构匹配服务或房间协议。

## 目标

在现有 `free_pvp` 半回合状态机上，增加「非实时」的玩家对玩家对局：

- **匹配**：把两名（或两队）玩家组成一场，不必同时盯着屏幕。
- **超时**：对方长时间未行动时的规则（判负、托管、过期关闭等）——产品未定时以开放问题记录。
- **回放**：事后能按同一种子与同一系列行动把对局重演出来。
- **与 1v1 / 4v4 的关系**：复用现有人数模式，而不是另起战斗规则。

## 现有 PvP 是什么（仓库事实）

`HaqiCombatSim.html` `#battle` 已是 PvP 规则路径，但对手是 **本地 Bot**，不是网络玩家。

| 事实 | 依据 |
|------|------|
| 模式名 `free_pvp` | `js/combat_arena_core.js` `createArena`；对应 `arena_server.lua` 的 `*_v` 流程 |
| 1v1 / 2v2 / 3v3 / 4v4 | `combat_presets_core.js` `MODES`：只是每边单位数 1–4。`docs/plan.md`：引擎层没有模式分支，大厅 key / arena XML 的人数限制未移植 |
| 半回合交替 | 每 turn 只有 `currentPlayingSide` 一侧行动；`nRemainingRounds` 每 turn 减 1。一边全体行动完再换边 |
| 人机 | 我方可指定一个操控位 `humanSlot`，其余槽位 `DeckAttackerBot` / `SimpleBot` / `RandomBot`。没有第二个人类客户端 |
| 同时在线 | 不存在。对战、批量、调参全在本机或 Web Worker |
| 排位分 / ELO / 奖励 | `docs/plan.md` 第一阶段非目标；Lua `CalculateWinningAndLosingRankingPoint` 在 [lua-mapping.md](lua-mapping.md) 标为非本期 |
| 真实联机 | 同文件非目标：「多人 = 本地 Bot 队友 / 对手」 |

批量页的 `matchupMatrix` 是五系×五系的 **胜率实验矩阵**，不是玩家匹配队列。不要把它理解成匹配服务。

冒险 `Haqi.html` 是 **PvE**（`combat_pve_core.js`，`arena.mode = 'pve'`），四人卡位是宠物编队，不是 4v4 PvP。

## 匹配

**本仓库没有匹配。** 搜不到队列、房间、积分区间或「寻找对手」。

现有的「组成一场」只有：

1. 对战页：用户在 UI 里选模式、双方学系、等级、配卡、种子，点开始。
2. 批量页：`buildJobs` 按系别矩阵生成数千场 Bot 对 Bot。
3. 冒险：走到遇敌点开 PvE。

原服开战门槛（`IsBothSideWithAliveUnit` / `IsProperPlayerCount`）未实现；JS 引擎拿到两边单位后直接 `startCombat`。

因此「按段位匹配 / 好友约战 / 跨 1v1 与 4v4 混排」全部属于未决产品问题。

## 超时：已有的和没有的

仓库里名叫 timeout 的东西有三种，**没有一种是异步对战的「对方没出牌」时钟**。

| 名称 | 行为 | 是否可用于异步 PVP |
|------|------|---------------------|
| 选牌时限 30s | [lua-mapping.md](lua-mapping.md) 引自 `arena_server.lua` L3259+：循环 `AdvanceOneTurn`（选牌 30s）。注释写「UI 用，引擎不含」 | 否。JS 不倒计时；人类一直不点，对局就停在 `phase:'pick'` |
| `maxRounds` 耗尽 | kids 100 / teen 80 **半回合**（`player_server.lua`）。到 0 判平，`arena.timeout = true` | 这是局内回合上限，不是匹配过期 |
| 双方卡包打空 | 存活单位都无牌且无 DOT 时提前 `timeout` 平局（`decksExhausted`）。Lua 会空跳到回合用尽；模拟器加速，结果相同 | 同上，是终局条件 |
| 托管 / 超时代打 | Lua `OnReponse_PickAICardForPlayer`；JS 对战页有「托管」按钮切 Bot，无自动时限 | 可作参考，不是异步规则 |
| Keepwork 25s | `adventure_cloud.js` 的网络 `timeout()` | 存档 IO，与战斗无关 |

原服流程注释：等待 5s → `StartCombat` → 选牌 30s 循环。那是**实时房间**的等待，不是「玩家明天再打开客户端续下」。

异步模式至少还要另定：整场过期、单步过期、过期后是跳过 / 托管 / 判负 / 关闭房间。仓库给不出默认值。

## 回放：已有的和没有的

确定性内核已经具备，缺的是「异步对局」的存档格式与跨会话协议。

### 本目录已有

- **事件流** `CombatEvent[]`：`pip` / `pick` / `cast` / `fizzle` / `damage` / `heal` / … / `combat_end`。对战页用它做分步动画；批量模拟可 `keepEvents: false` 省内存。
- **可复现 RNG**：`rng_core.js`；同 seed + 同参数必须同结果（测试守护）。
- **PvE 决定重演**（不是 PvP）：检查点只存 `seed`、开场 `player`/`party`/`monster`、`decisions[]`。`restorePveBattle` 重跑 `playPveRound`。本地存档、JSON 导入、Keepwork 云检查点都走这条路径。
- 对战页**没有**导出/导入 PvP 战报；切页只是把进行中的本机 `game` 对象接回去，刷新即丢失。

### 兄弟项目 `HaqiCombatEmulator/`

实验室内核有明确的 PvP 战报：

- `exportReplay(state)` / `replayBattle(replay, ruleset)`
- 形状：`{ schemaVersion, version, engineVersion, configHash, scenario, seed, actions, result }`
- 导入后按动作重执行；存档里的 `result` 不作权威；`configHash` 不一致则拒绝

这是同仓库里最接近「异步回放」的现成契约，但 **HaqiCombatSim 未实现、未共用该模块**（Emulator 的 AGENTS.md 也禁止从 `../HaqiCombatSim` 引用）。若要复用，需要单独做适配或复制契约，而不是假装已经接通。

### 对异步 PVP 的含义

可复用思路：权威是「种子 + 双方开场规格 + 每步行动」，不是飘字动画。动画继续只读事件。

尚未决定：

- 用 PvE 那种 `decisions[]`，还是 Emulator 那种 `actions[]` + `configHash`。
- 未完成的异步局存在哪（Keepwork workspace、新后端、仅本地）。
- 观战是否只放事件摘要，避免把对手牌库细节发给未到自己回合的客户端（Emulator 的 `getObservation` 有隐藏信息边界；本模拟器对战页当前是全知之神视角）。

## 与 1v1 / 4v4 的关系

建议当作**同一套 `free_pvp` 引擎、不同的对局组织方式**：

```text
人数模式     已实现于引擎/UI          异步 PVP
1v1         是（默认对战/批量）      未实现；最可能的第一刀
2v2 / 3v3   是（本地 Bot 队友）      未实现；需要多个人类槽位的异步行动顺序
4v4         是                      未实现；原服每边上限 4（arena_server.lua L63-67）
PvE 宠物4卡位  是（冒险）            无关，不要当成 4v4 PvP
```

人数变化在现引擎里只影响 `near`/`far` 数组长度和站位。异步层要额外处理：

- 每边多个真人时，是整边一起提交（接近当前半回合「行动方全体出牌」），还是每人独立过期。
- 缺人时用 Bot 补位，还是必须凑齐。当前 UI 用 Bot 填满非人类槽。
- 公平竞技 `params.fairPlay`（锁 HP / 强制攻击抗性等）已在引擎，原服用于部分竞技场；异步排位是否启用未说明。
- kids 与 teen 数据集、卡包规则不同，匹配是否允许跨版本未说明。

伤害、pip、卡牌 type 不应为异步再分叉。`combat_pve_core.js` 为 PvE 改了回合顺序和怪物 AI，并加了 `arena.mode === 'pve'` 伤害分支；异步 PVP 应留在 `combat_arena_core.js` 的 `free_pvp` 路径。

## 开放问题（代码无法回答）

1. **匹配**：按学系、等级、装备分、排位分、好友码，还是全随机？是否区分 1v1 与 4v4 队列？
2. **超时**：单步多久、整场多久；过期是跳过、SimpleBot 代打，还是判负。原服 30s 只适用于实时房间。
3. **回放**：对局记录的权威格式、保存位置、是否对观众隐藏手牌。
4. **身份**：与 [player-import.md](player-import.md) 共用哪套登录；未导入真实卡组时，异步局是否仍允许用本地配卡 / 官方预设。
5. **存储与网络**：Keepwork `PersonalPageStore` 现用于冒险检查点，没有对局房间语义。是否另做服务，本仓库无结论。禁止把凭据写入客户端。
6. **结算与排行榜**：胜负是否回写原服或网页排行。Lua `CalculateWinningAndLosingRankingPoint` 未移植（[lua-mapping.md](lua-mapping.md) 非本期）；网页也无 ELO、无排行榜 UI。钉钉补充把「排行榜」单独点名——它可以是异步 PVP 的积分榜、网页访客榜，或只是运营展示，与原服排位分不必同一套。产品未选。

## 运营备注：网页包先测新技能 / 参数

钉钉同时提到：用网页构建试验新技能和参数，确认后再上线。这与本项目原目标一致，不是新引擎：

| 已有能力 | 位置 |
|----------|------|
| 单卡覆盖 pipcost / accuracy / 数值 params | `#params`，`BalanceParams.cardOverrides` |
| 各系 HP/伤害等乘子、公平竞技 | 同一数值面板；`params.fairPlay` |
| 几秒内几千场五系矩阵 | `#batch` / `npm run sim` |
| 人机打一局看手感 | `#battle`；冒险 `Haqi.html` 看 PvE |
| Vite 网页包 | [deployment.md](deployment.md)；与原服 Lua 配置仍是两份，结论需人工回移 |

尚未决定：谁把网页结论写回 `config/Aries` 或线上 Lua、异步局是否必须用「已在网页测过」的参数哈希（Emulator replay 有 `configHash`，本目录没有）、排行榜是否只统计网页异步局。

## 建议的落地顺序（非实现承诺）

1. 先定 1v1 异步：双方提交的行动形状对齐 `playTurn(arena, picks)`。
2. 用现有 seed + `unitSpec` + 每步 picks 做可导入导出的 PvP 检查点（可参考 Emulator replay 字段，不引入其代码）。
3. 匹配与超时作为独立 IO 层，核心文件继续禁止 `fetch` / `document`。
4. 4v4（及 2v2/3v3）在 1v1 检查点稳定后再加多人提交与补位规则。
5. 真实卡组接入见 [player-import.md](player-import.md)；两需求都依赖身份，但战斗结算互相独立。排行榜与「网页先测再上线」只作运营备注，不阻塞 1v1 检查点。

相关计划入口见 [plan.md](plan.md)「计划需求」。
