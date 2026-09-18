# 计划需求：拉取魔法哈奇真实用户数据

> 状态：**计划中，尚未实现。**  
> 来源：产品负责人李西峙，2026-09-18 钉钉私信 Lily（未改产品 git；草稿备忘仅作意图，不以草稿原文为规格）。  
> 范围：把线上《魔法哈奇》玩家的卡包、装备、VIP 及相关成长字段导入本模拟器 / 冒险，用于真实配装对战，而不是只用官方 CSV 预设。

本文只记录仓库里已经能核对的事实，以及代码无法回答、必须产品/服务端确认的开放问题。不虚构生产接口、账号体系或凭据。

## 目标

玩家（或运营）能把一个真实魔法哈奇角色带进 `HaqiCombatSim.html` 人机对战和后续异步 PVP：

- **卡包**：已学会的牌、当前出战卡组、卡包容量 / 单卡上限。
- **装备**：已穿戴部位、强化、装备附加牌，以及由此算出的战斗属性。
- **VIP**：会员等级对生命 / 攻击等的加成，以及会员专属卡（若账号实际持有）。
- **相关成长**：学系、等级、以及导入战斗所必需的其它角色字段。

成功标准尚未由产品写成验收清单；在接口与字段表确认前，本需求不进入实现。

## 仓库里已经有什么

本目录和兄弟项目 `HaqiCombatEmulator/` 都**没有**读取线上玩家背包、卡组或 VIP 状态的客户端。现有数据全部来自本机 `config/Aries/` 快照、冒险本地/云端存档，或手工配卡。

### 静态规则数据（不是玩家账号）

| 已有能力 | 位置 | 说明 |
|----------|------|------|
| kids / teen 卡牌模板 | `data/{kids,teen}/cards.json`，`scripts/export_data.mjs` | 从 `CardList*.xml` 导出；含 `key`、`type`、`gsid`（部分卡）、数值。kids 与 teen 均有 `*_VIP` 卡 key。 |
| gsid → cardkey | `data/{kids,teen}/gsid_map.json` | 尽力映射。kids 约 316 条、teen 约 185 条解析成功（见 [qa-report.md](qa-report.md)）。未映射 gsid 会得到 `key: null`。 |
| 装备 stat id → 战斗属性 | `js/combat_unit_core.js` `statIdToEntry` | 101 HP 固定、102 超级魔力率、103–110 命中、111–118 攻击%、119–126 抗性%、196–203 暴击、204–211 韧性、212–219 穿透、242 HP%、184/185 起始魔力。卡包容量 **stat 167**、同卡上限 **stat 170** 不在此表，由冒险层单独读取。 |
| 卡包容量裁剪 | `clampDeck`、`BalanceParams.global.deckCapacity` / `deckEachCapacity` | 默认 40 / 6，对应 Lua 卡包道具 stats[167]/[170]（见 [lua-mapping.md](lua-mapping.md)）。Lua 超容量是清空卡组；模拟器改为按顺序裁剪并记 `deckTrimmed`。 |
| 装备段预设（非实物装备） | `gearStats` ← `data/*/stats_by_gear.json` | 按装备分数区间给绝对攻击/抗性等。`docs/plan.md` 第一阶段非目标写明：不用装备实物属性。 |
| 人机对战配卡 | `js/view_battle.js`、`settings.battle.decks` | 本地手工配卡，存 `localStorage` 键 `haqi_combat_sim_v1`。预设卡组来自官方 Aggressive CSV，**过滤** `/Pet\|Rune\|Crazy\|VIP\|1000Accuracy\|_adv/`。 |
| 冒险角色成长 | `js/adventure_core.js` `AdventureSave` / `playerSpec` | 本地 kids 存档：学系、等级、经验、物品、穿戴、强化、已学牌、出战卡组。`playerSpec` 可直接喂给 PvE 引擎。 |
| 冒险装备面板 | `js/adventure_equipment_core.js`、`docs/adventure.md` | 部位、属性预览、附加牌、卡包容量。章节装备 + 商店 1008 件候选，来自 globalstore 快照，不是线上背包。 |
| Keepwork 登录 | `js/adventure_cloud.js` | 仅用于 `Haqi.html` 云端检查点。身份是 Keepwork `username` + token，workspace `HaqiAdventure`。**不读取魔法哈奇角色。** SDK 凭据不得写入存档。 |
| MagicHaqi 家园联动 | `exportPetLink` / `validatePetLink`，`docs/pets-and-shop.md` | 版本 1 只导出冒险宠物；家园按钮指向 Keepwork 上的 MagicHaqi 入口。文档写明「联动筹备中」「本期不写家园云数据」。 |

冒险存档里与导入相关、已经稳定的字段（`schemaVersion` 2）：

```text
name, school, appearance, xp, level,
inventory, equipment, upgrades, cards, deck,
pets / formation（扩展）, pendingEncounter.player
```

`playerSpec()` 输出形状：`{ id, name, school, level, isBot, stats, deck, fixedCards, deckCapacity, deckEachCapacity }`。这是本引擎目前能直接开战的「角色规格」，真实账号数据最终需要映射到这一层（或等价的 `unitSpec`）。

### 兄弟项目：`HaqiCombatEmulator/`（同仓库，非本目录）

模拟器本目录**没有** VIP 数值实现。兄弟实验室已经有一套**手工填写**的 VIP / 装备计算，仍不是线上拉取：

- `js/rules/character.js`：`vipLevel` 取值 `-1..10`；仅 kids + `mode:'equipment'` 时叠加伤害/抗性/治疗/命中表。
- `js/rules/formulas.js`：kids VIP 对基础 HP 的百分比加成。
- `docs/interfaces.md`：`mode:'equipment'` 读 `equipment:[{gsid, addonLevel}]`、`gems`、`vipLevel`、`extraStats`；`mode:'snapshot'` 只用最终面板，不叠加装备或 VIP。
- 宝石、套装、强化在 Emulator 的配装模式里有基础实现；文档写明完整属性对照尚未通过。

这些表可作为本模拟器补 VIP 公式时的对照，不能当成已接通的用户数据源。

### 明确缺失（代码可确认）

| 能力 | 现状 |
|------|------|
| 魔法哈奇账号登录（nid / 通行证等） | 本仓库无对应模块。Keepwork 登录不能替代。 |
| 拉取线上卡包 / 装备 / VIP 的 HTTP API | 全仓库无调用点、无 URL、无字段契约。原服 `PowerItemManager` 与 GSL 绑定，`docs/plan.md` 已说明无法在浏览器里桥接。 |
| 将线上背包映射为 `unitSpec` / `playerSpec` 的导入器 | 不存在。 |
| 本引擎的 VIP 生命/属性加成 | `baseMaxHp` 注释写明「未含装备 stat242/101 与 VIP」；`computeMaxHp` 只走曲线 × `perSchool.hp` × `applyHpStats`。 |
| 会员卡进入预设卡组 | 对战页与 `presetDeck` 主动排除 key 含 `VIP` 的卡。teen `cards.json` 里模板仍在，只是默认不带。 |
| 冒险 VIP 玩法 | VIP 礼盒等作为收藏物；「未开放会员兑换」（`docs/adventure.md`）。签到「原版会员额外奖尚未接入」。 |
| 玩家数据缓存层 | `runtime_data.js` 只缓存**规则 JSON 包**；`localStorage` 存模拟器设置与冒险存档。没有玩家档案缓存。 |

## 字段映射：代码已经能回答的部分

真实账号若按原版道具体系到达本仓库，下列对应关系已经存在，不必再猜 stat id：

| 线上/配置概念 | 本仓库字段 |
|----------------|------------|
| 卡牌 GSID | `cards[].gsid`；不足时查 `gsid_map.json`；失败则 `key: null` |
| 卡牌 key / 出战列表 | `[{ key, count }]` → `clampDeck` |
| 学会但未带的牌 | 冒险用 `save.cards[key] = copies`；模拟器对战页目前只有出战卡组，没有「收集进度」模型 |
| 卡包道具 | 部位 slot `24`；`stats[167]` 容量、`stats[170]` 单卡上限 |
| 装备附加牌 | 道具 `stats[139]` / `[140]` / `[141]` → card key（冒险 `equipmentCards` / `playerSpec.fixedCards`） |
| 穿戴学系 / 等级需求 | `stats[137]` 学系、`stats[138]` 等级（冒险 `canEquip`） |
| 法杖强化 | 冒险 `save.upgrades[itemId]` + `globalstore.addonlevel.kids.xml` 导出的 1/2/3% 全系攻击 |
| 学系 / 等级 | `school`、`level`；HP 走 `baseMaxHp` + `applyHpStats` |
| 装备分数档（无实物时） | `stats_by_gear.json` 的 `from`/`to`（注释：匹配 GS = 实际 GS + 1000） |

teen 同名技能共享单卡上限（`clampDeck` 按 `spellName` 分组）在导入卡组时必须遵守，否则与 Lua `arena_server.lua` L8119 不一致。

gsid 映射是「尽力」而不是完备表。导入实现必须把未映射 GSID 显式失败或列入报告，不能静默丢牌。

## 开放问题（代码无法回答）

下面四项在仓库里找不到依据，需要产品 / 服务端另给规格。**在未确认前不得编造接口。**

### 1. 鉴权

- 玩家用哪套身份：原版魔法哈奇通行证 / nid、Keepwork 账号，还是 MagicHaqi 家园账号？三者目前互不相通。
- 浏览器前端能否持有可读背包的令牌？AGENTS.md 禁止把 SDK token、密码写入游戏存档或客户端源码。
- 是否只允许「当前登录者导入自己的角色」，还是运营可按角色 id 查询任意号？后者涉及隐私与授权。
- Keepwork `showLoginWindow` 已存在，但是否被指定为导入入口，仓库没有决定。

### 2. 接口

- 权威数据在哪：原 GameServer / 道具库、Keepwork 云、或尚未存在的只读网关？
- 本仓库没有可引用的生产 URL、请求字段或响应样例。
- 原 `combat_server.lua` 依赖 GSL 与 `PowerItemManager`，不能当作浏览器 API。
- 返回粒度未知：整包角色快照，还是卡包、装备、VIP 分接口？kids 与 teen 是否同一套？
- 失败语义未知：角色不存在、未建号、跨版本、背包为空时如何提示。

### 3. 字段映射（仍缺的那一段）

代码已覆盖「有了 gsid / 装备 stats 之后怎么打」。仍缺的是**线上 JSON/二进制 → 这些字段**的契约，例如：

- 卡包是 GSID 列表、cardkey 列表，还是背包格子 + 数量？
- 未穿戴的装备、仓库、宝石、符文、战宠是否进入本期？模拟器对战预设排除 Pet/Rune；Emulator 对非空符文栏/战宠目前是直接拒绝开战。
- VIP 是整数等级、到期时间，还是一堆会员道具 GSID？kids 与 teen 公式不同。
- 成长还要哪些：当前 HP、能量点、公平竞技覆盖、排位分？现引擎开局满血、按规则生成 pip；排位分在 `lua-mapping.md` 标为非本期。
- 一个通行证多角色、多学系时如何选择。

### 4. 缓存

- 导入结果放哪：只存在内存、写入 `localStorage`、还是 Keepwork `PersonalPageStore`？后两者已有模式，但都不是玩家档案。
- 缓存多久、过期后是否强制刷新、离线能否用上次快照开战。
- 冒险云存档的无缓存写入 + 远端核验，是进度检查点协议，不能直接当成玩家库缓存策略。
- `runtime_data.js` 的规则包缓存与玩家数据无关，不要复用其 URL 约定。

## 建议的落地顺序（非实现承诺）

1. 产品确认身份源与「允许导入的字段白名单」。
2. 服务端给出只读快照契约（无凭据入库）；用一份匿名样例（可检查入 git 的假数据）接到 `unitSpec` / `playerSpec`。
3. 补 kids VIP 公式（对照 Lua `GetUpdatedMaxHP` 与 Emulator 表），并决定会员卡是否允许进入真实卡组。
4. 对战页增加「从快照开战」，与现有手工配卡并存；未登录 / 拉取失败不得打断本地 Bot 对战。
5. 字段与缓存策略写进本文件后再写代码。

相关计划入口见 [plan.md](plan.md)「计划需求」；异步对战见 [async-pvp.md](async-pvp.md)。会员口粮/治疗与帕鲁式宠物见 [pets-vip-innovation.md](pets-vip-innovation.md)，与本文件的 VIP 字段导入相关但玩法独立。
