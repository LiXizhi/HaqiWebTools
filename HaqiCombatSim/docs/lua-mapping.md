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
