# Haqi.html · 2D 俯视角魔法哈奇（儿童版）

状态：**可玩的实验切片**，更新时间 2026-09-17。总进度见 [code-plan.md](code-plan.md)，阶段计划见 [plans/G0-foundation.md](plans/G0-foundation.md) 到 [plans/G3-economy-travel.md](plans/G3-economy-travel.md)。

`Haqi.html` 是与 `HaqiCombatEmulator.html` 并列的第二个入口：同一目录、同一套 `js/engine`、`js/rules`、`js/data`、`js/storage.js`，在其上用 Canvas 2D 实现像素风俯视角世界——真实岛屿地图、真实 NPC 摆放、真实任务文本、真实怪物模板与商店，战斗走同一个确定性内核的 PvE 剧本。无构建、无运行时依赖、无应用后端；不引用 `HaqiCombatSim` 的代码。

## 玩法边界

| 已实现 | 未实现 / 明确不做 |
|---|---|
| 角色创建（五系 × 男/女）、IndexedDB 存档、JSON 导入导出 | 联网、账号、真人房间 |
| 哈奇小镇、火鸟岛两张 CDN 地图，锚点校准，海洋/羊皮纸不可行走 | 只有 `.dds.z` 地图的岛（寒冰岛、古埃及、暗黑森林、魔法营地）不能进入 |
| 217 + 9 个摆放 NPC、头顶 `!`/`?` 标记、任务对话（StartDialog/EndDialog/ClientDialogNPC） | `script/apps/Aries/NPCs/**/*_dialog.html` 中的闲聊 MCML 未解析 |
| 任务：`Goal`（击杀）、`GoalItem`（掉落几率）、`CustomGoal`/`ClientGoalItem`（持有）、`ClientDialogNPC`、前置链、等级门、学派限制、奖励选择 | `FlashGame`、`ClientExchangeItem` 任务标记为不可用；怪物不在任何竞技场的任务不提供 |
| 31 + 33 个怪物竞技场，游荡、拉怪距离、刷新时间；1–4 怪 PvE 战斗；基因 AI | 副本、Boss 机制、宠物、装备、符文 |
| 真实卡面、伤害数字、增益/减益标记、怪物死亡台词、经验/奇豆/掉落、失败回出生点 | 逃跑惩罚、复活道具 |
| 63 个 NPC 商店（`npcshop.xml` + `extendedcost`）、背包、卡组编辑、按等级解锁本系卡牌 | 装备穿戴、卡牌交易 |
| 船长 NPC 乘船去有 PNG 地图的岛；`min_level` 门 | 传送门跨岛（目标岛无 PNG 地图） |

## 数据映射（`scripts/import_game_data.py` → `data/game/kids/*.json`）

只读取仓库内真实配置，逐文件记录 sha256 到 `manifest.json`；不存在的文件写入 `missing`，不猜值。

| 输出 | 来源 | 说明 |
|---|---|---|
| `worlds.json` | `Quests/worlds_list.xml`、`Scene/AriesGameWorlds.config.xml`、`WorldMaps/*.xml` / `*.map.html`、`Region/*_Region_Color.xml`、`WorldData/*.Portal.xml` | `born_pos`/`min_level`、地图锚点 `MapCoord ↔ AvatarPosition`、地图图片、传送门。`NewUserIsland.map.html` 是寒冰岛页面的陈旧副本，导入时清空其地图与锚点 |
| `npcs.json` | `WorldData/<world>.NPC.xml`（`Aries` 角色行） | id、名字/头衔、位置、朝向、`item_ex/desc`，按模型分 `object / character / creature`，是否有对话/商店 |
| `arenas.json` | `WorldData/<world>.Arenas_Mobs.xml` | 位置、`respawn_interval`、怪物模板列表、`ai_module` |
| `mobs.json` | `Mob/**/MobTemplate_*.xml`（359 个） | HP、等级、学派、五系伤害/抗性、魔力、`available_cards`（gsid, weight）、`cardsets`、`genes`、经验/奇豆/`loot1`、`speak_dead`。同名文件按文件夹前缀区分 key，任务按完整模板路径匹配 |
| `quests.json` | `Quests/quest_list.xml`、`goal_list_excel.xml`、`custom_goal_list.xml`、`reward_list.xml`、`quest_item_list.xml`、`client_item_list.xml` | 427 个任务、285 个击杀目标；对话页与按钮动作 `gotonext/doaccept/dofinished/donpcdialoged` |
| `shops.json` | `NPCShop/npcshop.xml`（Excel XML）、`Database/extendedcost.db.mem` | 每个 NPC 的商品、分类、价格（`price_list_id` → 货币 gsid × 数量）；无 `exid 0` 规则的 95/1764 行标为“价格未知”不可购买 |
| `hp.json` | `HP/HP_level_mapping.xml` | 每级 HP 表（展示用；战斗 HP 走 `rules/formulas.js` 的 Lua 对照公式） |
| `asset-index.json` | `assets_manifest.txt` | 3,479 条 2D 资源行（地图、卡面、NPC 头像、头顶标记、学派图标、状态图标、光标） |

运行时通过 `js/game/data.js` 的 `buildGameData()` 组装索引（`questById`、`mobByTemplate`、`placedTemplates`、`gsidToCard`）；Node 测试从磁盘读取同一份 JSON。

## 资源规则（`js/game/assets/cdn.js`）

- URL = `https://cdn.keepwork.com/update61/assetdownload/update/` + 清单整行（`path.png.p,md5,size`）。响应带 `access-control-allow-origin: *`，可直接 `fetch` 并用 Cache API 持久缓存（`haqi-cdn-v1`）。
- 只使用 `.p` 的 PNG/JPG；`.z`/zip 与 DDS 一律跳过。地图 `.dds` 路径转成 `.png` 后若清单没有，该岛不可进入。
- 卡面：`texture/aries/item(_teen)/<gsid>_<key>.png`，通过 `ruleset.cards[key].gsids` 解析，排除缩略图。
- 头像：`texture/aries/npcs/portrait/*`；头顶标记 `texture/aries/headon/{exclamation,question,question_grey}.png`；学派图标 `common/themeteen/school_*`；物品图标走 `ruleset.items[gsid].icon`。
- 加载失败返回 `placeholder`，不阻塞游戏；浏览器测试用 Playwright 路由把整个 CDN 替换为纯色 PNG 离线运行。
- 行走精灵是生成的像素图（`scripts/build_sprites.mjs` → `assets/sprites/*.png` + `manifest.json`，45 张：五系男女、6 种村民、5 位导师、16 个小镇怪、通用五系怪与蜜蜂、道具）。它们不是原游戏美术。

## 世界坐标与碰撞

- `world/map.js`：用锚点做最小二乘仿射拟合 `world(x,z) → 图像像素`，再乘 `MAP_SCALE=3`。锚点为人工摆放，残差 10–45 px（图像空间）；留一法验证局部残差修正并不优于纯仿射，故不做变形。
- `world/collision.js`：从地图像素分类（海/羊皮纸/云/描边 → 不可走），在出生点、每个 NPC、竞技场、传送门周围各开 7 px 圆保证可达；可选 `assets/masks/<world>.png` 红/绿覆盖。移动分轴滑行。
- 218 个 NPC 挤在 1024×512 的镇图上：只给玩家附近最近 5 个可对话 NPC、任务标记 NPC 和悬停对象画名字。

## 战斗与数值

- `engine/battle.js` 增加 `scenario.pve=true`：双方 1–4 人不必相等，`kind:'mob'` 单位只允许出现在 PvE；PvP 校验路径不变。`ENGINE_VERSION 0.3.0`。怪物牌库耗尽自动洗回（`recycleDeck`），玩家在 PvE 也开启。
- `combat/mob-build.js`：模板 → `mode:'snapshot'` 角色；牌库按 `available_cards` 权重在 18 张内分配，`cardIssues` 过滤不可执行卡；若牌库含高于怪物等级的卡，编译等级抬到该卡 `requireLevel`（源怪物本就无卡牌等级门）。
- `bots/genes.js`：按 `hp_range`/`hp_drop`（一次性，记忆由调用方持有）/`priority` 选基因，`card`/`card_set` 加权抽卡，`target_hostile` 规则选目标；无匹配则回落到 `tactical` 策略。纯函数、种子随机，受 `scripts/check.mjs` 纯度检查。
- `combat/encounter.js`：玩家出牌后整个怪物方行动；胜利结算经验（儿童版乘 `global_exp_bonus=2`，见 `mob_server.lua`）、奇豆、`loot1` 权重掉落，再由任务系统记录击杀与任务掉落。
- `progression.js`：**经验曲线为占位** `4·L²+26`（仓库没有服务端升级表）；HP 用 Lua 对照公式；卡组容量 14（每 4 级 +2，上限 40），同名卡 3（每 10 级 +1，上限 6）；卡牌解锁等级由 `_LevelN` 层级推算（N·5−4，`Level0_NN` 起步梯，`LevelX` 20 级）。这些不是原服数值，不能据此下平衡结论。
- 起点现实：当前 `config/Aries` 快照里哈奇小镇的任务都在 30–50 级，新手岛（魔法营地）没有 PNG 地图。新角色在小镇 1 级出生，先打 1–10 级镇怪，10 级后找 **法斯特船长** 去火鸟岛接 10–20 级任务；魔法营地任务链在建号时标记完成（`profile.quests.skipped`），否则火鸟岛任务的前置永远无法满足。任务追踪面板在没有任务时会给出这条数据驱动的提示。

## 目录

```
Haqi.html  css/game.css
js/game/main.js               启动、屏幕状态机、固定步长循环、NPC/任务/战斗/乘船编排
js/game/data.js  save.js  progression.js
js/game/assets/cdn.js
js/game/world/{map,collision,camera,input,entities}.js
js/game/render/{sprites,overworld,hud,battle-scene}.js
js/game/quest/{quests,dialog}.js
js/game/combat/{mob-build,encounter,card-text}.js
js/bots/genes.js
js/game/ui/panels.js          任务日志、背包、卡组、商店、系统
scripts/import_game_data.py   scripts/build_sprites.mjs
data/game/kids/*.json  data/game/asset-index.json  assets/sprites/
tests/game/*.test.mjs  tests/engine/pve.test.mjs  tests/browser/haqi.spec.mjs
```

## 验证

`npm run check`（70 模块）、`npm test`（56 项，其中 `tests/game` 21 项、`tests/engine/pve` 3 项）、`npm run test:browser`（含 `haqi.spec.mjs` 2 个用例：建号→行走→镇怪战斗→乘船→接任务→击杀→交任务→存档恢复；商店购买/背包/卡组/日志/地图/系统与 390px 手机布局）。截图输出到 `test-results/haqi-*.png`。
