# 公式与常量 ↔ Lua 源码对照表

所有路径相对 `paraworld/script/apps/Aries/Combat/ServerObject/`。行号为 2026-09-16 `dev` 分支快照，改动 JS 前请重新核对。JS 列为计划中的函数名（`js/combat_formulas_core.js` 等）。

## 1. 常量

| 常量 | 值 | 来源 | JS |
|------|----|------|----|
| `MAX_SPELL_PENETRATION` | 70 | `card_server.lua` L69-100 | `params.global.maxSpellPenetration` |
| `critical_strike_damage_ratio` | 1.3 | `card_server.lua` L69-100，`GetCriticalStrikeDamageRatio` L1462 | `params.global.critDamageRatio` |
| `dodge_damage_ratio` | 0.5（kids 在 `InitConstants` L191-200 另有设定） | `card_server.lua` | `params.global.dodgeDamageRatio` |
| 群攻分摊系数 | 0.83（teen 1.0） | `card_server.lua` L69-100 | `params.global.areaSiblingRatio` |
| `maximum_player_pips_count` | kids 7 / teen 14 | `player_server.lua` L58, L173, L186 | `params.global.maxPips` |
| `MAX_ROUNDS_PVP_ARENA` | kids 100 / teen 80 | `player_server.lua` L184, L188 | `params.global.maxRounds` |
| 手牌上限 | 8 | `player_server.lua` L295, L806-823 | `params.global.handSize` |
| 每边单位上限 | 4 | `arena_server.lua` L63-67 | `arena.maxUnitsPerSide` |
| 出牌超时 | 30000 ms | `arena_server.lua` L3259+ 注释 | UI 用，引擎不含 |

## 2. 伤害与治疗（`card_server.lua`）

| Lua | 行号 | 说明 | JS |
|-----|------|------|----|
| `above_min_boost(boost)` | L1454-1460 | `boost+100`，下限 50 | `aboveMinBoost` |
| `damage_expression(base, boost_abs, buffs)` | L1473-1516 | kids：`damage *= aboveMin/100`；`resist *= (100-pen-penRecv)/100`（pen 上限 70）；逐个 buff 乘 `(100+b)/100` 取 ceil；再乘 `damage_percent`、`resist_percent`。teen：负 buff 逐个乘，正 buff 求和后乘一次 | `damageExpression(base, boostAbs, buffs, version)` |
| `heal_expression(base, buffs)` | L1522-1543 | kids 逐个 ceil 乘；teen 浮点乘且最低 1 | `healExpression` |
| `process_heal_penalty(arena, heal)` | L1548+ | `heal * (100 - arena.healPenalty)/100` | `applyHealPenalty` |
| `TryCriticalStrike(caster, target, base, school)` | L1310-1338 | `ret = clamp(crit - resilience + base, 0, 100)`；`random(0,1000) <= ret*10` | `tryCriticalStrike` |
| `TryDoubleAttack` | L1340-1370 | kids / teen 均直接 `return false` | 不实现 |
| `TryCriticalStrike_DOT` | L1372-1394 | 同 crit，用 `_DOT` 属性 | `tryCriticalStrikeDot` |
| `TryDodge(caster, target, base_hit, school)` | L1397-1452 | teen：`hit = base + hitChance - dodge + (casterLv - targetLv) * (targetIsMob ? 5 : 1)`；kids：无等级项；clamp 0..101；加 hit charm；`random(1,10000) <= hit*100` 则命中 | `tryDodge` |
| 命中率评级换算（teen） | L1416-1421 注释 | `rating / (level*50 + 50) + flat%` | `ratingToPercent` |
| accuracy / fizzle | L2514-2560 | `acc = template.accuracy + Σaccuracy charms + caster.accuracyBoost(school)`；`random(0,100) > acc` → fizzle；dispel charm 同 school 时弹出 | `rollAccuracy` |
| 攻击类 buff 组装 | L2645-2737 | `buffs.damage_percent = caster.damageBoost(school)`；`boost_abs += caster.damageBoostAbs(school)`；`ProcessDamageAgainstCharms`（blade / weakness）；`ProcessDamageAgainstWards`（shield / trap，可能改 school）；`resist_percent = target.resist(school)`（负值）；`spell_penetration = caster.pen + card.base_spellpenetration`；`boost_abs += target.resistAbs(school)`；GlobalAura 本系加成入 buffs；然后 dodge ×0.5 / crit ×ratio | `buildAttackContext` → `resolveAttack` |
| `Card.UseCard(key, seq, arena, caster, target, sequence)` | L1676 | 总入口，按 `template.type` 分派 | `useCard` |
| `Card:CreateCardTemplate(datafile)` | L655-724 | 模板字段：`key, spell_name, type, target, pipcost, accuracy, hitchance, spell_school(默认 balance), require_level, can_learn, params{}` | 导出器输出结构 |
| `Card.InitDeckAttackerAITemplates` | L771 | 读取 CSV 权重模板 | 导出器 `ai_decks.json` |
| 仇恨 | L1300-1308, L889-893 | `GetHealThreat = ceil(heal*0.3)`；按系 threat 系数 | PvP 不用，只记录 |

### `template.type` 分支位置（便于逐个移植）

| type 组 | 行号 |
|---------|------|
| `Random` | L1684 |
| `PickPet` | L1728（不实现） |
| Area* 目标收集 | L1740-1748 |
| `Stance` | L1812 |
| 目标合法性（死亡 / Pass / charm / ward 前置条件） | L2298-2366 |
| `SingleAttackWithMultipleDamage` | L2623 |
| `SingleAttack*` 主分支 | L2998-3655 |
| `SingleAttackHP` | L3656 |
| `SingleHeal*` | L3711-3915 |
| `SingleGuardianWithImmolate` | L3916 |
| `DOTAttack` / `DOTAttackWithHOT` | L4041-4204 |
| `AreaAttack*` / `ArenaAttack` | L4205-4733 |
| `AreaPowerPipBoost` | L4734 |
| `SingleCleanse` / `AreaCleanse` | L4839 / L4884 |
| `AreaHeal*` | L4985-5212 |
| `Global`（全局光环） | L5213 |
| `MiniAura` | L5302 |
| `StealCharm` / `Remove*Charm` | L5348+ |

## 3. 单位属性（`player_server.lua`）

| Lua | 行号 | 说明 | JS |
|-----|------|------|----|
| `Player:GetLevel` | L1712 | `petlevel` | `unit.level` |
| `Player:GetUpdatedMaxHP` | L1741-1815 | 见下表；kids 再 `hp += hp*3.14*stat242/100`，teen `hp *= (100+stat242)/100`；kids VIP 加成；最后 `+ stat101` | `maxHpFor(school, level, version)` + `params.perSchool[s].hp` 乘子 |
| `Player:GeneratePip` | L1980-2002 | `random(1,100) <= powerPipChance` → power pip：teen `pips_normal += 2`，kids `pips_power += 1`；否则 `pips_normal += 1`；总数不超上限 | `generatePip` |
| `Player:GetPowerPipChance` | L2108-2166 | kids：`level<10 → 0`，否则 `floor((40-10)*(level-10)/40 + 10)`；teen：`level/2`；+ GlobalAura powerpip + miniaura stat102 + 装备 stat102；arena `force_powerpipchance` 覆盖 | `powerPipChance` |
| 可出牌判定 | L1908-1931 | 本系卡：`pipcost <= normal + power*2`；他系卡：`pipcost <= normal + power` | `canAfford` |
| `Player:CostPips` | L2007+ | 先扣 power 再扣 normal；X 费卡返回实际消耗 | `costPips` |
| `GetDamageBoost / GetResist / GetAccuracyBoost / GetCriticalStrike / GetHitChance / GetDodge / GetSpellPenetration` | 各处，依赖 `GetStatsSum` (L3394+) | 装备 stat id：damage 111-118、resist 119-126（返回负值）、accuracy 103-110、crit 196-203、pen 212-219、hp% 242、hp 101、powerpip 102 | 由 `presets` 直接给百分比，不走 stat id |

### HP 基础曲线（`GetUpdatedMaxHP`）

| 系 | kids（L1748-1764，level 1→50 线性插值） | teen（L1766-1786） |
|----|------|------|
| fire | `ceil((1500-415)*(L-1)/49 + 415)` | `ceil(36*(L-1) + 450)` |
| ice | `ceil((2025-500)*(L-1)/49 + 500)` | `ceil(48*(L-1) + 600)` |
| storm | `ceil((1200-400)*(L-1)/49 + 400)` | `ceil(34*(L-1) + 425)` |
| life | `ceil((1800-460)*(L-1)/49 + 460)` | `ceil(42*(L-1) + 540)` |
| death | `ceil((1650-450)*(L-1)/49 + 450)` | `ceil(40*(L-1) + 500)` |
| 其他 | 同 storm | 同 storm |

`Combat/main.lua` L1306-1405 有客户端同款公式（`Combat.GetUpdateMaxHP`），以服务端为准。

## 4. 怪物 / 机器人（`mob_server.lua`）

| Lua | 行号 | 说明 |
|-----|------|------|
| `Mob:GetMaxHP` | L1694-1702 | 模板 `hp` × 难度系数 |
| 模板属性 | — | `damage_*_percent`、`resist_*_percent`、`accuracy_*_percent`、`power_pip_percent` |
| `Mob.InitAutobotEssential` | L1385+ | 按装备分数读取 `MobStatsByGearScore` / `MobAIDeckByGearScore` / CCS，构造 PvP 机器人 |
| `Mob:GetCardAndTarget_Deck_Attacker` | ~L5000-5080 | 按 CSV 条件列累加权重，排序 / 加权随机选卡与目标 |

## 5. 回合状态机（`arena_server.lua`）

| Lua | 行号 | 说明 | JS |
|-----|------|------|----|
| 流程注释 | L3259-3277 | 等待 5s → `StartCombat` → 循环 `AdvanceOneTurn`(选牌 30s) → `PlayOneTurn` → `FinishOneTurn` → 一侧全灭则 `FinishCombat` | `createArena` / `advanceTurn` |
| PvP 变体 | `StartCombat_v` / `AdvanceOneTurn_v` / `PlayOneTurn_v` / `FinishOneTurn_v` / `FinishCombat_v` | mode `free_pvp` | 只实现 PvP 路径 |
| `IsCombatFinished_v` | L3039-3061 | 近侧全灭或远侧全灭 | `isFinished` |
| 开战门槛 | L3368-3416 | `IsBothSideWithAliveUnit` 且 `IsProperPlayerCount` | 引擎直接开战 |
| 人数限制 | L2397-2407, L2733-2751 | `players_atleast / players_max / players_max_eachside` | `mode → unitsPerSide` |
| 公平竞技覆盖 | L2428-2452 | `max_hp_{school}`、`force_damageboost / force_resist / force_accuracyboost / force_powerpipchance` | `params.fairPlay`（可选） |
| pip 生成时机 | L4555-4558, L4596-4597 | `AdvanceOneTurn` 内对每个存活单位 `GeneratePip` | `advanceTurn` 第一步 |
| 玩家自动出牌 | `OnReponse_PickAICardForPlayer` L9140+ | 超时 / 托管时的启发式 | `SimpleBot` 参考 |
| 排位分 | `CalculateWinningAndLosingRankingPoint` L3608-3864 | 非本期范围 | — |

## 6. 数据文件（本机 `config/Aries/`，gitignored）

| 文件 | 加载处 | 导出为 |
|------|--------|--------|
| `Cards/CardList.xml` / `.teen.xml` | `combat_server.lua` L86-110 → `Card.InitCardDataFromXML` | `cards.json` |
| `Cards/CharmWardList(.teen).xml` | `Card.InitCharmAndWardDataFromFile` | `charms.json` |
| `Cards/CombatThreatConfig(.teen).xml` | `Card.InitThreatConfigFromFile` | （PvP 不用，未导出） |
| `Combat/DeckAttackerAITemplates(.teen|.kids).xml` → `deck_attacker_ai/*.csv` | `Card.InitDeckAttackerAITemplates` L771 | `ai_decks.json` |
| `Combat/MobStatsByGearScore(.teen).xml` | `Mob.InitAutobotEssential` | `stats_by_gear.json` |
| `Combat/MobAIDeckByGearScore(.teen).xml` | `Mob.InitAutobotEssential` | `ai_deck_by_gear.json` |
| `HP/HP_level_mapping.xml` | 仅注释引用 | `hp_table.json` |
| `Others/{kids,teen}_skill_extendcost.txt` | gsid ↔ cardkey 线索（`ex_name`） | `manifest.gsidMap` |

## 7. 已知差异登记

实施中发现 JS 与 Lua 不一致或 Lua 自身 kids / teen 行为差异时在此记录。

| 日期 | 项 | 说明 | 处理 |
|------|----|------|------|
| 2026-09-16 | 失误（fizzle）时序 | Lua `Card.UseCard` 先 roll accuracy，失误则**不扣能量、不进冷却**（L2514+ 早于 CostPips） | `useCard` 已按此顺序：`rollFizzle` → `payCard` → `setCooldown` |
| 2026-09-16 | 单体 charm / ward 目标 | Lua 由客户端选目标、服务器不校验阵营；JS 需自行判定 | `inferTargetKind`：模板 `positive=false`（陷阱 / 虚弱）→ hostile，否则 friendly；与 `deck_attacker_ai/*.csv` 首列一致 |
| 2026-09-16 | DOT 段 `"Np"` | `GetNumericalValueFromSection`(L1246) 对 DOT 段（L4100 / L4342）也生效：X 费卡每段 = N × 实际消耗能量 | `buildDotSequence` / `buildHotSequence` 接收 `realcost` |
| 2026-09-16 | 溅射 DOT（负值段） | L1978-2060：`dmg < 0` 为溅射，以 abs 值打持有者及站位 ±1 的存活队友，`PopDoT` 优先弹出负值段 | `tickDots` 已实现；`Fire_DOTAttackWithSplash_Level6` (`-800,0,0`) 依赖此 |
| 2026-09-16 | `SymmetryWards` | 参数为 `target_wards` + `caster_wards`（非 `wards`） | 分别贴目标与施法者 |
| 2026-09-16 | `Global2` | teen 全场属性光环，经 `GetStatsSum` 影响单位属性 | `arena.aura2`，`schoolStat` / `scalarStat` 读取 |
| 2026-09-16 | 先手统计 | 引擎 `firstSide='random'`；聚合层原按“近端胜率”统计会被平局稀释 | `summarizeResult.firstSide` + `stats.firstMoverWins/decisive`，只在有胜负局统计 |
| 2026-09-16 | teen accuracy | 线上 teen 强制 accuracy=100（用 hit / dodge 代替失误） | `global.forceAccuracy100` 默认 teen=true、kids=false，可在数值面板切换 |
| 2026-09-16 | `perSchool.damage` | Lua 无此项，为模拟器附加乘子 | 在 `getDamageBoost` 按施法者本系换算为百分比加成（1 = 原版） |
| 2026-09-17 | 卡包容量 | Lua 由卡包道具 `stats[167]`（总容量）/ `[170]`（单卡上限）在进入战斗时校验（arena_server.lua L8011-8166），超总容量直接清空卡组；道具表不在本地 | `global.deckCapacity` / `deckEachCapacity`，默认 40 / 6（正常玩家卡包；客户端初始卡包为 CombatCardDeckSubPage.lua L38-40 kids 14/3、CombatCardManager.teen.lua L41-43 teen 18/5，可在面板改回）；超容量改为按顺序裁剪并记录 `deckTrimmed`。`deckPresetCopies`（默认 3）为模拟器项，Lua 无对应 |
| 2026-09-17 | teen 同名共享上限 | L8119：teen 同 `spell_name` 的卡共享单卡上限 | `clampDeck` 按 `spellName` 分组 |
| 2026-09-17 | 弃牌时机 | Lua `DiscardCard` 在选牌阶段即可调用，与是否出牌无关 | `playTurn` 先处理 `pick.discardSeqs` 再判断 pass |
| 2026-09-17 | 双方打空提前结束 | Lua 会一直跳过到 `nRemainingRounds` 归零 | 模拟器在双方存活单位全部打空且无 DOT 时直接判 timeout 平局（结果相同，省时） |

## 8. Kids 开篇 PvE 与冒险（2026-09-17）

| 原文件 / 位置 | 本章实现 |
|---|---|
| `arena_server.lua:4208` StartCombat；4515 AdvanceOneTurn；5100 PlayOneTurn，5248附近三阶段顺序 | `combat_pve_core.js` 的 createPveBattle / advancePveRound / playPveRound：kids玩家先手、双方生成魔力、前置额外回合/普通回合/后置额外回合 |
| `mob_server.lua:1928` GetPowerPipChance | 怪物直接使用模板power_pip_percent，不叠加玩家等级曲线 |
| `mob_server.lua:4474` PickFromCards；4759 bonus_round；4852 genes_attacker | 源闭区间权重抽取；分别记录before/normal/after脚本；脚本后HP阈值基因，再回退可重复AI卡池；不伪装为有限玩家卡包 |
| `card_server.lua:3234` kids PvE伤害分支；1340 TryDoubleAttack | 公共卡牌伤害模块标记targetIsMob，PvE使用非PvP补偿分支；kids/teen双击原函数返回false，未增加额外双击 |
| `config/Aries/Mob/NewIslandMonster/*.xml` 与 `WorldData/NewUserIsland.Arenas_Mobs.xml` | 五侦察兵原生命/等级/抗性/攻击修正/起始魔力/台词/卡池/奖励/场地ID；`1-`不是通配回合，而是前置额外动作 |
| `config/Aries/Quests/quest_list.xml` 63000–63013 | ID、居民、对白、目标和按学系筛选的奖励；原文与浏览器替换文本均保留 |
| `Database/globalstore.db.mem`；`combat_unit_core.js` 原stats映射 | 从已装备道具汇总HP/伤害/抗性/命中/暴击/起始魔力；139/140/141装备附加牌；167/170卡包容量/同卡上限 |
| `config/Aries/Others/globalstore.addonlevel.kids.xml` 的1912所在itemset | 原三档70/140/280仙豆及累计1/2/3%全系攻击，由导出数据驱动 |
| `config/Aries/Others/combatpet_levels.xml`；`CombatPet/CombatPetProvider.lua:439`、749 GetLevelInfo | 10136宠物原经验增量15/62/139/248、零基配置级别和满级显示；口粮17172的stat60提供300经验 |

本章刻意改编：紧凑地图、按任务串联、累计经验阈值、学习时机、固定出奇蛋结果、毕业后镇区尾声、浏览器教程。原PvE服务端的组队、限时、季节暴怒、付费、捕捉/宠物战斗不移植。消耗符文/变身奖励只作为收藏保留。完整逐项说明见 [adventure.md](adventure.md)。

补充效果：`card_server.lua:106` 的 `storm_charging_wards` 从Lua数据字面量导出，3138–3164的 `bCharging` 在PvE逐级替换93–97常驻印记并重置为2回合。模板文案虽称增加风暴受伤，其stats162是绝对抗性；原 `mob_server.lua:2096` 对kids怪物不读取该常驻stats，故本章不会自行增加3%伤害。效果状态、叠层、过期仍完整重现；PvP不启用此新增分支。

## WebP / Keepwork 云存档迭代（2026-09-17）

本轮未修改Lua对应的战斗、任务、奖励、装备、宠物、成长规则。新增 `adventure_media_core` 与 `adventure_cloud_core` 属于浏览器资源/存档协议，无原Lua公式映射。云端仍使用同一 `AdventureSave` 和 `restorePveBattle` 决定重演，时钟/UUID由IO层提供，不影响玩法随机流。SDK接口依据 `keepworkSDK/src/store/PersonalPageStore.{base,data,sync}.ts` 及 `src/core/keepworkSDK.{core,utils,pages}.ts` 核对；尤其避开store远端读失败时回退本地的行为。

### Kids 卡面文字布局（2026-09-17）

`script/kids/3DMapSystemApp/mcml/pe_item.lua` 的 `DrawCardMask` L1856–1902：以151×230卡面为基准，魔力点在(120,5)，描述在(18,142)。`view_adventure.js::spellFace` 与 `.spell-face` 按比例叠加文字，保留原图内印刷标题；去掉额外外框和重复卡名。HTML描述约束在卡面下方文字区以适应移动屏幕，文本仍使用本章效果摘要；未改战斗数值。

### 两个数字的含义

`pe_item.lua` L1873–1894：右上是stats[134]魔力消耗（114显示X），左中是stats[186]冷却回合，缺省0；不是两个不同单位的魔力消耗。`player_server.lua::CostPips` L2008–2095：kids本系超级魔力按2点扣费，异系按1点；卡面数字本身不按持有魔力球动态换算。UI补上左中冷却与悬停/卡包说明，未更改扣费逻辑。

### 2026-09-17：技能演出层

新增45张冒险卡的2D粒子/召唤演出，card key与`combat.json`中原XML `datafile`保持对应，并记录在`spell-effects.json`。使用现有cast/fizzle/damage/heal事件，不移植或修改Lua伤害、命中、魔力、AI公式；生成召唤图集是卡面意象改编，不是原3D演员/动画导出。

### 2026-09-18：装备查看与卸下

角色面板生命与超级魔力率直接复用 combat_formulas_core 的 baseMaxHp / applyHpStats / powerPipChanceByLevel，来源仍为 player_server.lua GetUpdatedMaxHP L1742起与 GetPowerPipChance L2137–2146。属性聚合和装备附加牌继续走 adventure_core::playerSpec，无新公式。新增卸下、对比与 UI 筛选属于浏览器交互补全；卸下卡包按现有 clampDeck 顺序裁剪，和原浏览器穿戴行为一致。

### 2026-09-18：宠物四卡位与成长改编

HP、魔力和卡牌效果继续复用现有Lua移植函数；独立宠物用同系玩家基础HP，不复制MagicHaqi另一套战斗数值。四阶段、学习等级、捕获、共享卡位附卡、饱食、回血、商店价格与50级冒险经验表均为本次网页玩法改编，数值集中在BalanceParams.adventure，不声称1:1移植原战宠规则。新增怪物目标选择使用现有validTargets，主角倒下后仍可攻击存活伙伴。

## 米酒葫芦（2026-09-18）

- 来源（相对 paraworld）：`script/apps/Aries/Desktop/MiJiuHuLu.lua` L326–389（GetObtainAwardState：1/15/30/60/90 分钟、严格大于时限、每日独立领取），L394–428（领取索引及在线时长核对）；`MiJiuHuLu.html` L332–482（五葫芦与可领取/未达到/已领取显示）。
- 对应 `adventure_checkin_core.js`：五档在线时长及每档每日领取，领取不重置其他葫芦的时间；原版 UpdataTime L159 有不足 120 秒直接返回的刷新门槛，网页每秒刷新，不移植该刷新门槛。
- 明确改编：奖励均简化为 100 奇豆，不提供会员奖或抽奖；网页只计可见游玩时间，北京时间零点重置，以本地存档记录。替代上一版“离线五分钟重复领取”设计。未接入服务器防作弊。

### 2026-09-19 卡包装备

- Item_CombatDeck.lua L89–124：卡包使用等级/学系为 stats[168]/[169]，不同于衣物137/138。对应 adventure_item_rules_core::equipmentRequirements，商城与穿戴共用。
- CombatCardDeckSubPage.lua L1163–1171：167总容量、170单卡容量；Database/globalstore.db.mem已导出21种口袋至shop-candidates.json。
- arena_server.lua L8080–8137：儿童版先检查法术拥有资格，再按口袋限制重复张数；网页全卡模式不再把保存的3份许可当成高级卡包最大张数。现有源卡包的学系上限均等于通用上限；不同值的学系额外上限仍未扩展。
- 保留网页未装备14/3兼容行为、顺序裁剪及奇豆商城价格，不将其描述为原服商店价格复刻。

### 2026-09-19 冒险角色自然恢复（网页改编）
角色脱战自然恢复使用 BalanceParams.adventure.heroRegenPerSecond，默认每秒最大生命值的 2%，50 秒可从空血回满。此为用户指定的网页冒险规则，不修改 Lua 战斗治疗公式。宠物保留每分钟 5% 的既有规则。

### 2026-09-19 装备强化与任务63007

- `script/apps/Aries/Items/item.addonlevel.lua` L130–188：按 GSID 查询当前等级的累计属性、目标等级和对应材料需求；`adventure_upgrade_core.js` 保留此语义，不累加历级属性，不统一套用法杖数值。
- `script/apps/Aries/Combat/ServerObject/player_server.lua` L3434–3474：强化对应111全系攻击、151绝对攻击、159绝对抗性、101生命、196暴击、204韧性，六项进入已穿戴装备属性。
- `script/kids/3DMapSystemItem/ServerObject/PowerAPI_client.lua` L191–199：成功回复 SetItemAddonLevel 后触发79016；本地成功强化任意支持装备后触发。删除旧网页“只要已有强化装备就自动完成”的差异。背包强化不要求先穿戴。
- 本机原 XML 缺失，数据从相邻 HaqiCombatEmulator/data/kids/ruleset.json 的 addons 提取；其 manifest 与本项目已存源 XML SHA-256 均为 c6bf06c76180997bfcd5e18d959ab179089c0f3d43fc483cbfd492e3e20cfb8f。468个GSID按相同配置合为9组。scripts/import_upgrade_snapshot.mjs 强制检查来源哈希，常规 export_adventure.py 仍从原 XML 导出。
- 本次初版的 GSID 共用强化限制已由下方“完整强化窗口与实例”实现替代；原服接口、宝石操作及套装系统仍是独立范围。

### 2026-09-19：普通手牌与宠物卡分离
- player_server.lua `ShuffleFollowPetCards` L773–800：独立牌序和状态，全部宠物卡开战可选；kids 按实例 RNG 随机权重排序。
- `PrepareCard` L804–826、`GetCardsInHand` L829–853：普通卡最多 8 张；宠物卡单独返回，不参与补牌或卡包剩余计数。
- `HasCard` L5253–5267、`UseCard` L5332–5335 / L5379–5390：宠物卡使用 10000 偏移序号，成功消耗指定副本，失误不移入普通卡尾；JS 普通序号从 0 开始，对应宠物序号从 10000 开始。
- MyCards.lua `GetFollowPetCardItems2` L236 起：独立宠物选牌列表。网页用手牌下方按钮切换列表，复用主角魔力、目标、冷却和一回合一次行动规则。
- 用户明确无需兼容旧存档；不保留旧的宠物牌混入 fixedCards 的重演分支。新存档保存 petCards 起始规格，通过独立序号的决定序列重演。

### 2026-09-19 完整强化窗口与实例

- `Avatar_equip_upgrade.kids.html`：750×450桌面窗口、左侧装备/箭头/下一级累计属性/材料/强化按钮、右侧七分类及4×3分页。`Avatar_equip_upgrade.lua` L92–118 保留 GetProps 标签（原版固定防御也显示百分号，计算仍按绝对值）；L149–170 分类和10级以内自动选择1912；一次操作升一级，不增加概率、保护道具或替代材料。
- `Avatar_equipment_subpage.lua` L176–257：已穿戴与背包实例都可选择，满级实例不再列入，排除17233–17248魔法书。`script/kids/3DMapSystemItem/Item_CombatApparel.lua` L619–644：实例保存 serverdata.addlel，强化只改此字段，保留 gem.ins / gem.holecnt。
- `adventure_equipment_instances_core.js` 以本地 GUID 区分同款装备；穿戴 GUID 决定战斗和比较属性。旧 GSID 存档只将既有强化赋给第一件，不复制给所有同款；导入校验、云检查点、调试物品增减同步实例。
- `strengtheningCatalog` 补齐468件原定义（包括商城等级上限外装备），导入脚本核对原数据库及强化XML快照哈希。仅补充定义，不制造高阶装备售价。材料只有17213仙豆及17487祝福魔珠；魔珠说明保留原出处，未伪造尚未实现的原副本掉落。
- 15张原版UI纹理从 assets_manifest.txt 对应原始文件无损转为 WebP；缺失的115件图标整理为4张图集。19张资源均使用已上传且核验SHA-256及CORS的永久Keepwork CDN，保留原清单条目、哈希、裁剪和本地副本。
- 浏览器适配：手机单列，错误/成功为窗口内状态信息，键盘可操作；本地同步操作代替原 PowerAPI 服务回复，不冒充原服联网或服务端持久化。宝石镶嵌、装备继承是其他系统；本次仅保留其已有实例数据。

## 2026-09-20：儿童版宝石镶嵌与剥离

- `30042_SueSue_equipment_extend_panel.lua` L186–258：装备七分类、stat36孔位、26001–26699宝石和26701–26703镶嵌符；L304–347：stat35符加成和五档基础成功率100/80/60/40/25，上限100%。概率集中到BalanceParams.gems。
- `30042_SueSue_equipment_extend_bagpage.html` L46–154、L163–374：满槽只换同类、不允许同级/低级替换、替换需确认、命中限手镯/戒指、穿透限武器、武器和首饰属性限制。与panel.lua的kids类型过滤共同检查。孔数沿用kids stat36，不增加teen打孔系统。
- `30042_SueSue_equipment_extend_panel.html` L203–250：消费前确认，四级及以上要求100%；原奇豆检查是注释代码，本次不扣奇豆。`extend_panel.lua` L395–433：成功推进79017；失败降一级或一级消失。降级目标用原stat38。
- `30042_SueSue_equipment_cutgem_panel.html` L28–41、L89–119、L231–245：99%基础加固定1%（代码覆盖魔法星等级），实际100%；每颗一个17179调羹、检查背包堆叠上限。未引入VIP要求。
- `Item_CombatApparel.lua` L588–616：gem.ins / gem.holecnt附着GUID；保留强化等级。`player_server.lua` L3476–3488：仅已穿戴实例宝石属性加入角色与战斗。
- `scripts/export_adventure_gems.py` 从原Database/globalstore.db.mem导出104项至gems.json，记录原文件SHA-256；maxcopiesinstack索引依据paraworld.globalstore.lua L551。资源层加载，定义不硬编码到规则中。
- 服务端差异：`PowerItemManager.lua` L1696–1733转发EquipGem，仓库没有服务端随机实现。本地按客户端显示概率、seed+持久化gemSerial结算；失败保留装备原宝石并返回stat38低一级宝石，此为明确的本地结算适配，不声称原服服务端1:1。未接入原服背包、支付、宝石合成、新价格或新掉落。现有库存可直接使用；隔离验收页提供材料，不改玩家库存。

## 2026-09-20：原版训练点学习约束

- CombatSkillLearn.lua L173–239：选择本系exID或外系other_exID，本系课程免费，外系按froms消耗训练点；L495–531检查外系点数，L561–613检查战斗等级（-14）、学系（-18）及前置资格。
- Database/extendedcost.db.mem：脚本export_skill_learning.py解码纯数据，校验确定性的单资格奖励，导出105条thisClass/otherClass记录（exID、等级、前置卡牌、学系、费用），源SHA-256保存在chapter.skillLearning。未知条件不放开。
- 对应adventure_learning_core.js，核心保存与界面草稿共用skillLearningStatus。学习费用来自数据，不统一假设所有卡牌1点；没有学习配置的变体不再默认为一级可学。
- 原导师7Mentor.xml与服务端升级发点表缺失。网页发点采用BalanceParams.skillLearning.pointLevels的4/8/12/16/20/25/30/35/40/45/50，均1点；明确属于网页改编。未实现导师顺序菜单、任务课程全量及洗点接口。既有章节本系自动赠卡和旧存档已学资格保留。
