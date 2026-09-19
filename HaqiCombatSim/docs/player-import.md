# 计划需求：拉取魔法哈奇真实用户数据

> 状态：**计划中，尚未实现。**  
> 来源：产品负责人李西峙，2026-09-18 钉钉私信 Lily（未改产品 git；草稿备忘仅作意图，不以草稿原文为规格）。  
> 范围：把线上《魔法哈奇》玩家的卡包、装备、VIP 及相关成长字段导入本模拟器 / 冒险，用于真实配装对战，而不是只用官方 CSV 预设。

本文只记录仓库里已经能核对的事实，以及代码无法回答、必须产品/服务端确认的开放问题。不虚构生产接口、账号体系或凭据。

## 装备导入前置核查（2026-09-18）

本轮用户明确目标为原版《魔法哈奇2009》MMORPG，并要求先检查装备加成。以下核查基于 `82f2cba` 工作树；本次仅更新调查与计划，没有实现登录或更改战斗公式。

**结论：并未完整导入。静态道具 stats 已导出，不代表所有属性已进入战斗。**

| 项目 | 本目录实际情况 |
|---|---|
| 基础装备属性 | `adventure_core.js:86` 的 `playerSpec` 只聚合 `statIdToEntry` 可识别项；其余直接跳过。当前覆盖 HP、超级魔力率、百分比攻击/抗性/准确率、部分暴击/韧性/穿透和起始魔力。 |
| 漏映射的战斗属性 | `combat_unit_core.js:13` 未覆盖 151–158 绝对攻击、159–166 绝对抗性、182/183 治疗/受治疗、188 闪避等；224/225 等级评分、226–241 绝对属性百分比、243–245 命中/闪避评分、247 受穿透、254/255 暴击/韧性也不能直接导入。含评分或乘法者必须对照 Lua 换算，不能只加映射。 |
| 强化 | 2026-09-19 已接入原 kids 快照的 468 个 GSID 强化表，当前收录物品可按各自配置强化，六种强化属性进入 playerSpec，存档校验同步扩展。仍按 GSID 保存，缺少同款不同实例区分；部分高阶材料未接入，不等同完整原服装备导入。 |
| 镶嵌宝石 | 没有装备实例的 `serverdata.gem.ins` / 孔位模型，没有宝石属性聚合。背包按 GSID 计数、穿戴按部位记录 GSID，不能表达同款两件装备不同镶嵌和强化。 |
| 套装 | 商店导出没有套装字段或效果表；`playerSpec` 没有按套装件数叠加属性。 |
| 附加牌与卡包 | 已读取装备 139/140/141 附加牌，以及卡包 167/170 容量；这是局部支持，尚未接上真实角色卡组和未映射 GSID 报告。 |
| VIP、原版随从加成 | 没有接入原版角色属性链；当前网页宠物玩法不等同原版随从属性。 |

实际 Node 检查：`shop-candidates.json` 当前有 **1309** 个候选条目（不是均已开放购买）；其中 stat 151 有43项、159有42项、182有22项、183有29项、188有31项，`statIdToEntry` 对这五种均返回 `null`。例如 GSID 1526「生命守护帽」的 stat182=2、1524「雷光突击帽」的 stat183=2、2199「英魂手套」的 stat188=10。这些数量是候选静态表统计，不是账号背包统计，也不是已开放商店数量。

### 原版依据

路径均相对 `paraworld/`：

- `script/kids/3DMapSystemItem/Item_CombatApparel.lua:588–696`：解析 JSON `serverdata`；镶嵌为 `gem.ins`、孔数为 `gem.holecnt`、强化等级为 `addlel`；按装备 GSID 与等级查询攻击百分比、绝对攻击、绝对抗性、生命、暴击、韧性六项强化。
- `script/apps/Aries/Combat/ServerObject/player_server.lua:3394–3540`：`GetStatsSum` 聚合装备、六项强化、宝石、随从和按件数生效的套装。后续还有团队光环及战斗状态，不能将所有来源都冒充装备基础值。
- `script/apps/Aries/Combat/ServerObject/arena_server.lua:10848–10877`：从装备实例收集镶嵌与强化；`FilterInvalidGems:7531` 有 teen 宝石过滤规则，kids/teen 不应混用。
- `player_server.lua:2343–2570、2656–2659、2791–2889`：绝对属性百分比与评分换算需要独立对照；直接汇总 stat 数字不是最终面板。

### 登录调查补充

前文“全仓库无接口”指两个网页项目，不能扩大解释为原版 Lua 没有接口。本轮在原版找到：

- `script/kids/3DMapSystemApp/API/paraworld.auth.lua:94` 的 `paraworld.auth.AuthUser`，路径模板 `%MAIN%/API/Auth/AuthUser.ashx`。
- `script/kids/3DMapSystemApp/API/paraworld.inventory.lua` 的 `GetItemsInBag` 包装器。
- Maisi `MagicHaqi/js/app.js:4090` 的登录使用 `sdk.showLoginWindow`，不能直接作为原版 MMORPG 账号登录实现。

以上是原客户端接口线索，**尚未核验生产域名、浏览器 CORS、会话协议和真实响应**，本轮未发送账号或登录请求。用户已经指定原版身份源；后续应先补齐本地装备计算，再沿原客户端调用链核验鉴权与背包读取，不应因网页里无调用而认定必须新建后端。

验收顺序：完整静态规则 → 按实例解析穿戴/镶嵌/强化 → 来源明细与 Lua 面板对照 → 卡组及附加牌 → 原版登录和只读拉取。未知物品、未知强化档和未映射战斗属性必须明确报告，不能静默当作零。

## 目标

玩家（或运营）能把一个真实魔法哈奇角色带进 `HaqiCombatSim.html` 人机对战和后续异步 PVP：

- **卡包**：已学会的牌、当前出战卡组、卡包容量 / 单卡上限。
- **装备**：已穿戴部位、强化、装备附加牌，以及由此算出的战斗属性。
- **VIP**：会员等级对生命 / 攻击等的加成，以及会员专属卡（若账号实际持有）。
- **相关成长**：学系、等级、以及导入战斗所必需的其它角色字段。

角色管理交互已由用户确认，见下节；原版数据导入仍需核验接口与字段表。

## Keepwork 多主角与登录流程（2026-09-18 用户补充）

状态：**多角色管理已实现**；真实Keepwork账号跨设备验收待完成。网页登录使用 **Keepwork 账号**，一个账号最多 **5 个主角角色**。原版《魔法哈奇》2009 账号用于数据导入，两套身份不可混同；原版导入仅提供提示入口，尚未接通。

### 交互验收

- 登录后默认选择最近一次成功进入游戏的角色继续；没有角色时进入新建流程。
- 提供切换角色和新建角色入口。角色项在进入前展示头像/外观、名称、**当前等级和系别**，标记最近使用角色；摘要与实际存档一致。
- 新建或切换成功后更新最近使用记录；仅预览、取消或加载失败不更新。最近角色加载失败时提示原因并返回角色列表，不自动覆盖进度。
- 新建与导入的新角色共用5个名额。满额时说明已达上限，不覆盖已有角色；取消或失败不占名额。
- 新建分为起名字、选择抱抱龙、选择系别；仅抱抱龙步骤提供小字链接：**“导入魔法哈奇角色”**。保持手机可读、可点击和键盘可达。
- 导入成功后形成独立角色；装备、镶嵌、强化、卡包等按本文前置核查要求校验。原版接口未接通时不能模拟导入成功。

### 存储与验证约束

- 在 Keepwork `HaqiAdventure` workspace 内规划版本化角色索引和独立角色存档，使用稳定角色标识；各角色进度、装备、卡组、宠物互不串档。索引保存摘要、最近使用角色及时间。
- 本地缓存按账号与角色隔离；切换前保存当前进度，目标存档校验成功后再替换活动角色。保留访客体验和旧单角色存档，不自动将访客进度绑定到登录账号。
- 云端保存沿用无缓存暂存、`syncToGit`、实际远端读回核验流程。创建/导入前核对最新索引和名额，处理多设备冲突；具体文件协议与并发处理在核对 SDK 能力后实现。
- 验收覆盖0/1/5个角色、默认继续最近角色、切换/新建/导入、加载失败、账号隔离、旧存档迁移和云端冲突/写入失败。

### 本次实现细节

- `adventure_roles_core.js` 约束5角色上限、角色标识、最近角色和存档校验；`adventure_roles.js` 管理账号缓存及角色作用域。旧 `haqi.adventure.kids.v1` 保持原样，首次迁入访客列表；不会自动上传到登录账号。按最新要求，冒险界面不提供文件导入/导出。
- 本地以一个版本化目录原子保存各角色独立的完整进度，key 为 `haqi.roles.v1.guest` 或 `haqi.roles.v1.account.<编码用户名>`。角色云恢复备份、调试备份和更新时间分别以角色ID隔离；旧备份原文件保留。
- Keepwork workspace 为 `HaqiAdventure`，`roles/index.json` 保存当前完整目录，`roles/history/<版本ID>.json` 保存不可变完整目录及父版本。一个目录中的每个角色都有独立进度；本版没有拆分为多个可变角色文件，避免索引和进度分别写入导致半完成状态。
- `loadPage` 只将 SDK 明确的 `Page not found: <完整路径>` 视为首次创建；网络失败不视为零角色。写入采用 `savePageData(...,false,false)`、`syncToGit(...,false)`、实际远端读回核验。
- 登录、角色选择/新建、手动保存时同步；游玩中每分钟尝试自动同步，本地仍持续自动保存。首次访客打开不加载SDK；曾登录的浏览器尝试静默恢复已有会话，没有会话则保留访客界面。
- 写前两次检查云端版本，写后核验；本地跨标签页过期写入拒绝。SDK没有在此使用的原子比较交换接口，所以不声称多设备同时写入是事务。不可变历史保留竞争分支；下次加载通过父版本追溯识别分叉（最多64代，超出时保守要求备份），避免用云端静默替换另一分支的本机缓存。冲突界面先在浏览器保留本机副本，再加载云端；不下载文件。
- 原版2009导入按钮只显示“尚未接入”提示，不冒充已实现导入。无角色时直接起名；已有一个角色时直接继续，显式切换入口仍可管理角色。网页文件导入/导出已移除，云恢复备份改为浏览器内恢复。

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

- 已确认：Keepwork 为网页登录及最多5个角色的归属账号；原版魔法哈奇通行证 / nid 用于2009客户端数据导入。原版授权及会话协议仍需核验。
- 浏览器前端能否持有可读背包的令牌？AGENTS.md 禁止把 SDK token、密码写入游戏存档或客户端源码。
- 是否只允许「当前登录者导入自己的角色」，还是运营可按角色 id 查询任意号？后者涉及隐私与授权。
- Keepwork `showLoginWindow` 用于网页登录；原版导入入口为新建流程抱抱龙页的小字链接，不能以 Keepwork 登录替代原版授权。

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
