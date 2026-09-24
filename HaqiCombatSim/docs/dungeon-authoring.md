# 副本快速制作：给后续 AI 的执行说明

副本是一个可行走的小世界，包含多组怪物、出生点和出口；不要把副本实现成菜单里的一场战斗。先看 [原版副本目录](dungeon-catalog.md)，优先复用真实世界和怪物模板。

## 一条命令重新导出

```sh
npm run export:dungeons
```

读取原仓库 `config/Aries/Scene/AriesGameWorlds.config.xml` 的 kids/通用 `worlds/Instances/` 条目，关联 `config/Aries/WorldData/<World.name>.Arenas_Mobs.xml` 和 `mob_template`。输出 `data/adventure/dungeons.json` 和本目录的 `dungeon-catalog.md`。不执行原 Lua，不读取玩家存档。`--root` 可传给 Python 导出器指定另一份原版仓库。

JSON 保留世界属性、竞技场原 XML、怪物原 XML、源文件 SHA-256、原始三维坐标、四个卡位（包括空位）、普通/简单/困难倍率原记录。缺失文件与不支持卡牌必须保留原因，禁止拿一个相近的普通怪顶替。

## 接入路径

| 内容 | 唯一入口 |
| --- | --- |
| 原版数据导出 | `scripts/export_dungeons.py` |
| 目录与逐组迁移报告 | `scripts/report_dungeons.mjs` |
| 组装世界、位置投影、进入/退出、存档校验 | `js/adventure_dungeons_core.js` |
| 地图渲染、碰撞、寻路 | 现有 `adventure_world_core.js`、`adventure_renderer.js` |
| 入口窗口 | `js/view_adventure_dungeons.js`，共享 `createCloseButton` |
| 多怪战斗/检查点重演 | `combat_pve_core.js` 的 `restorePveBattle` |
| 清怪与经验/奇豆结算 | `adventure_core.js` 的 `settleEncounter` |
| 自动云存档 | `adventure_app.js` → `adventure_autosave.js` → 原角色同步 |

启动仅装入 `data/adventure/dungeon-index.json` 的轻量目录；首次进入任意副本时，通过 `adventure_dungeons.js` 预加载整个 `data/adventure/dungeons.json`，再调用 `installDungeons` 一次注册全部副本。后续进入其他副本复用内存，不按副本拆文件。只能使用原生 ES Module；核心模块不能引用 DOM、网络和存储。

## 快速制作一个新副本

1. 在原世界 XML 添加具有唯一 `name` 和中文 `world_title` 的 kids 世界；定义 `worldpath` 与 `born_pos`。纯网页原创副本直接编辑下方的 `config/dungeons/custom.json`，不需要修改原仓库；不能手改会被导出覆盖的快照。
2. 在对应的 `Arenas_Mobs.xml` 中放置多组 `arena`；每组最多四个 `mob`。怪物模板路径必须存在，空位用空字符串，保留原 `id` 和坐标。至少包含两组普通怪与终点挑战，实际怪物数按题材决定，不复制成一只 Boss。
3. 怪物用真实模板和现有技能；`available_cards`、`sequences`、`genes`、`cardsets` 按原配置导出。数值从数据读取，不硬编码到 JS。新增公式先对照 `docs/lua-mapping.md` 与原 Lua，调参仅使用 BalanceParams。
4. 运行导出。检查生成目录的“可挑战组”和逐组阻断原因；不要删掉不支持技能来伪造通过。
5. 默认投影取原 `(x,z)`，统一缩放到二维坐标，保留方位关系，近邻做确定性避让；连接出生点和营地形成道路。当前二维地面、边缘树和天气复用已发布素材，不是原三维地形/墙体复原。若需精细房间、洞穴、桥和机关，扩展独立地图配置及碰撞规则，不能只画不可碰撞的墙。
6. 在隔离预览页检查从出生点走到每组怪物、出口；检查多怪同时入战、胜利后整组消失、失败不清除、重新进入保留、主动重开重置。所有怪物必须能识别学系与组数；当前使用通用学系小图，专属原版造型需按美术约定另行准备。
7. 提交前运行下列验证，并更新 `docs/devlog/devlog_YYYY-MM-DD.md`。按仓库规则只保留本地修改，除非用户明确要求提交/推送。

```sh
node --test tests/adventure_dungeons.test.mjs tests/adventure_autosave.test.mjs
npm test
npm run build
```

浏览器：`tests/fixtures/dungeons.html` 使用完整真实资源和内存角色，不读写玩家存档。检查桌面和 390px、搜索、进入、共享关闭按钮、怪物点击与出口。正式入口为 `Haqi.html` 右上角“副本”；设置中保留云端记录的恢复和冲突处理。

## 原创副本最小模板

把下面对象添加到 `config/dungeons/custom.json` 的 `worlds` 数组，再运行导出即可出现在入口中。此例复用宝库真实怪物，不修改其战斗数值；坐标是原创二维布局所用的三维平面坐标，y保持0，运行时取x/z。可继续增加怪物组；相同原模板可出现在多个卡位。

```json
{
  "id": "dungeon:custom_ember_trail",
  "name": "余烬小径",
  "recommendedLevel": 5,
  "born_pos": "{x=0, y=0, z=0}",
  "arenas": [
    {
      "position": [80, 0, 30],
      "slots": [
        "config/Aries/Mob/MobTemplate_FireCavernFireRockyOgre01Level1.xml",
        "config/Aries/Mob/MobTemplate_FireCavernFireRockyOgre01Level1.xml"
      ]
    },
    {
      "position": [180, 0, 100],
      "slots": [
        "config/Aries/Mob/MobTemplate_FireCavernForestSpikyOgreLowerLevel2.xml",
        "config/Aries/Mob/MobTemplate_FireCavernIronShellLevel2.xml"
      ]
    }
  ]
}
```

这是可复制的制作模板，默认配置保持空数组，避免把示例自动当成正式内容。需要新增原创怪物或机制时扩展受校验的数据配置，不向运行时代码塞怪物数值。

## 数据与存档约定

- 世界 ID：`dungeon:<原 World.name>`；遭遇 ID：`<世界 ID>:<原 arena 顺序索引>`。不要重排原竞技场节点或复用旧 ID 表示不同战斗，否则应增加迁移版本。
- 每组的 `slots` 是原模板路径数组；安装器生成 `monsterIds` 和 `monsterSlots`。检查点保留 `dungeonMonsterIds`/`dungeonMonsterSlots`，载入时必须与当前组数据严格相等。
- `dungeonRuns[worldId] = {cleared: [encounterId], position?: {x,y}}`；`dungeonReturn={zone,position}` 是进入前的岛屿位置。旧存档补空记录，云端白名单保留这两个字段。
- 胜利才将组 ID 写入 `cleared`；原经验/奇豆逐怪累计，会员经验逐怪取整；不额外发明宝箱奖品。伙伴按组经验成长。已清除组禁止再次开始，显式“重新开启”才重置。
- 战斗期间不允许进入、退出或重开副本。存档需保留卡牌决定、原种子、怪物卡位；校验或重演失败不得覆盖本地进度。
- 重要操作/升级会请求云同步，相邻操作合并，最短尝试间隔30秒；普通游玩至少每10分钟尝试，失败保留待同步请求并重试。仅已登录且没有冲突时自动上传；访客保留本地自动存档。仍通过无缓存 SDK 写入、远端读回校验与角色版本冲突保护，不强行覆盖另一设备。

## 当前复刻边界

已实现独立世界、原位置关系的二维地图、多组原怪物阵容、原卡位、自由移动、普通模板战斗、经验奇豆和清怪进度。副本内不自动回血，主角和宠物用进入时的生命通关；离开后才恢复岛屿上的自然回复。未实现原场景机关/门锁依赖、过场/剧情、门票/精力、宝箱掉落、难度切换、服务器限次、原三维地形和全部专属美术。

原版怪物先手或场景施法标记、不支持卡牌/目标、缺失模板均阻断对应战斗，其余组可继续探索。35个“全部组可挑战”表示各组能在当前 PvE 引擎开始并重演，不代表全部副本机制已1:1复原。未支持项见自动生成目录，后续迁移要逐项补齐。

## 整包按需预加载与 Vite 构建（2026-09-22）

- 原始完整配置：`data/adventure/dungeons.json`；原创配置入口：`config/dungeons/custom.json`。
- 启动包仅包含自动生成的 `data/adventure/dungeon-index.json`（名称、等级、组数、存档校验所需摘要），不包含怪物模板和出生点详情。
- 第一次进入副本时整包读取 `data/adventure/dungeons.json`，所有副本共享同一个下载请求与成功缓存。失败可重试；关窗口或换角色后不因迟到的下载结果自动传送。
- 本地/云端存档当前在副本中时，先预加载完整包，再校验/重演。仅有历史通关记录不要求下载包。
- 运行现有 `npm run build`，由 `vite.config.mjs` 在主站构建时同时输出单个 `dist/data/adventure/dungeons.json`。不需要独立配置或额外打包命令。
- Vite开发启动、正常构建及 `npm run export:dungeons` 自动更新轻量目录；主站 `data/adventure.json` 排除完整副本内容。源码仍支持普通HTTP静态服务。

## 道路推进规则（2026-09-22）

运行时把各怪物组排列在不交叉的连续道路上，保留导出配置中的原始坐标供追溯。以最高生命值怪物所在的最后一组为Boss组，移至道路末端；其他组保持原顺序。角色只能在道路范围内移动，未击败的第一组挡住前进方向，接近自动开战，不能直接挑战后续组。胜利后该组消失；全部前置组与末端Boss击败后，末端出现出口，走近自动返回原岛。撤退/战败回副本起点，清怪进度保留，菜单允许暂离。旧版自由行走存档若不在合法道路或超越未清关卡，恢复到副本起点。未支持的战斗仍挡路，不会跳过，可菜单暂离。

### 入口与末端双传送点（2026-09-22）

副本入口新增常驻离开传送点，以短路段连接起点，相距150避免出生即退出。走近入口可随时返回原岛，保留清怪进度；重新进入时若上次停在传送点范围，恢复到起点。末端出口由最后Boss组的击败记录控制出现。鼠标拾取、附近交互、自动触发与绘制同时接入两个传送点。10项副本回归与完整构建通过；包含入口可达、无出生误触、离开重进保留进度及Boss条件测试。
