# 战斗规则与覆盖

**当前整体状态：experimental / fullParity=false。** 通用效果分支可执行，但未证明完整服务端语义一致。以下通过的公式对照不代表完整战斗验收通过。

## 原 Lua → JS

路径前缀 `script/apps/Aries/Combat/ServerObject/`：

| 原实现 | JS 对应 | 当前证据 |
|---|---|---|
| `card_server.lua:damage_expression`、`heal_expression` | `rules/formulas.js` | 测试直接提取原 Lua 并在 Fengari 执行，比较双版本舍入和增益组合 |
| `player_server.lua:GetUpdatedMaxHP`、`CostPips` | `rules/formulas.js` | 原 Lua 对照：五系、多等级、VIP、能量消耗 |
| `player_server.lua:GetStatsSum` / 各属性 Getter | `rules/character.js` | 装备/宝石/套装/强化/VIP 基础实现；完整属性对照未通过 |
| `arena_server.lua:AdvanceOneTurn_v`、`PlayOneTurn_v`、`FinishCombat_v` | `engine/battle.js` | JS 确定性和回放通过，原 Lua 整场事件对照未完成 |
| `card_server.lua:Card.UseCard` | `engine/effects.js` | 通用效果实验性移植；所有分支逐效果验收未完成 |
| `player_server.lua:ShuffleDeck` / 手牌 / 共享冷却 | `engine/battle.js`、`random.js` | JS 跨环境一致；抽牌全过程 Lua 对照待补 |

`arena_pvp_server.lua` 为占位，实际 PvP 流程在 `arena_server.lua` 的 `_v` 方法中。不要以文件名误判实现入口。

## 双版本差异

- 儿童版普通能量 + 超级能量槽总数最多 7，本系超级能量值 2；青年版普通能量上限 14，异系消耗双倍，平衡系视作本系。
- 儿童版伤害逐个增益向上取整，穿透有上限；青年版正增益相加、负增益相乘，再按原公式取整。
- 儿童版治疗逐增益取整；青年版乘法，非正结果设为 1，正小数保留。
- HP、VIP、暴击上限、闪避后减伤、终局回合上限均区分版本。默认侧回合上限儿童 100 / 青年 80；同权重终局儿童平、青年后手胜。
- 每次仅一个阵营行动，席位依次执行；报告的回合指单方行动回合。

## 明确阻止

机器可读清单位于 `data/manifests/*-coverage.json`，通过 `npm run data:audit` 更新。593/701 儿童卡牌、1130/1272 青年卡牌通过当前可执行检查，**不是规则一致性通过率**。缺失文件、未实现类型、组合 spelllist、风暴充能会阻止相关战斗；独立符文栏与战宠也明确拒绝。未实现类型包括反射盾、冻结、姿态、隐身、守护、部分多段攻击、控制/嘲讽等；Dead/DoT/HoT/Fizzle 等系统表现条目不是普通可选技能。

## 尚待原版对照的重点

- 装备资格/卡组数量约束、特殊物品、战宠成长和切换、符文抽取与补充。
- DOT/HOT 快照与结算顺序、护盾关联及驱散、暴击附加机制、吸血过量伤害基数、牺牲/棱镜/持续状态交互。
- 复活白名单的普通治疗已允许选择倒地角色；守护触发复活未实现。
- PvP 特殊状态、随机调用顺序、竞技场与赛季限制。

有些高级参数尚未完全解析；因此现在全局标记实验性，不发布正式平衡结论。后续应以白名单效果夹具扩展能力门禁，并对每个原分支验证前后状态、事件顺序与随机消耗数，达到 P2 的全部验收后才能移除该标记。

## 卡包生命周期（v0.2）

核对 `player_server.lua:PrepareCard` 附近（803 行起）的最多 8 张手牌逻辑，以及 `DiscardCard` / `RestoreDiscardedCard` / `ValidateDiscardedCards`。默认保留手牌并在己方回合补到 8 张；卡包容量、手牌上限和每轮补牌上限可以显式覆盖，用于实验，覆盖值不宣称是原版装备的合法容量。

使用与弃置永久消耗该副本；未施放成功的 fizzle 卡按已有原版路径回到牌库末尾。没有牌可抽也没有手牌时，不生成兜底卡。手牌中暂时能量不足与卡包耗尽是两个不同状态。

## PvE 剧本（v0.3）

`createBattle` 接受 `scenario.pve=true`：双方各 1–4 人可不相等，`size` 必须等于较大一方人数并决定竞技场；角色 `kind:'player'|'mob'`，`mob` 只允许出现在 PvE。怪物默认 `recycleDeck`（牌库耗尽洗回，对应 `mob_server.lua` 无限牌库），玩家仅在剧本显式 `recycleDeck:true` 时开启；PvP 校验与结果不变。`getObservation` 与 `result.units` 增加 `kind`。怪物属性来自 `MobTemplate` 的 `hp`、五系 `damage_*_percent`/`resist_*_percent`、`power_pip_percent`、`startup_pips_*`，牌库来自 `available_cards`/`cardsets`（见 [game.md](game.md)）。经验的儿童版 `global_exp_bonus=2` 在遭遇战结算层实现，不进入内核。
