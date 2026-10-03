# 城市节点副本契约

2026-10-03：节点可配置 `streetscape.version=1`，扩展多边形碰撞、真实道路、WebP布景、行人和车辆。此模式地图上限8192；没有该字段仍采用下表的旧地图上限及主题。详见 [街景契约](../../haqi-recreate-place/references/streetscape.md)。

扩展单城 JSON v2，保持原章节、居民与地标契约。实现与校验入口为 `js/adventure_city_dungeons_core.js`。

| 字段 | 实际含义 |
| --- | --- |
| `entrance` | `level` 为城市外观1–5档，未知时省略或null；`lon/lat` 为总入口位置；`dungeonId` 为 `city:<city-id>:overview` |
| `nodes[]` | 稳定 `id`、`cityId`、`name`、`lon/lat`、`source`、`dungeon`；城市明确绑定列表 |
| `source` | `{kind:authored,id:<buildings.id>}` 或 `{kind:csv,id:<源CSV城市ID>}`；不按距离自动绑定 |
| `dungeon.id` | `city:<city-id>:<node-id>`；`overview` 为保留节点名 |
| `dungeon.theme` | 已实现 `harbor`、`market`、`wetland`，省略时显示通用街区；都是原创Canvas布景 |
| `dungeon.map` | `w/h` 为600–3000游戏单位，`spawn/exit` 为 `{x,y}`，点位距边缘至少40单位 |
| `map.obstacles[]` | 可选 `{x,y,w,h}` 不可通行矩形；水面与建筑背景需对应障碍，不阻挡出生、出口及互动点 |
| `dungeon.art` | 当前为 `{mode:native-canvas,npcAtlas:<本城NPC图集id>}`；主题为原创Canvas布景，居民引用既有城市WebP |
| `dungeon.npcs[]` | 本城NPC `id` 与副本局部 `x/y`；复用本城图集及原人物资料 |
| `dungeon.hotspots[]` | 稳定局部 `id`、`name`、`x/y`、`kind`、`text`；NPC热点另有 `npcId`；英语对白填 `language:en`、`zh` |
| `hotspot.kind` | `npc/counter/materials/workbench/sign/binoculars/station/garden`；映射实际交互或已有Canvas物件 |
| `dungeon.items` | 场景道具字典，`<id>:{name}`；与玩家正式库存分开 |
| `dungeon.actions[]` | 稳定 `id` 以副本ID加冒号开头，`hotspot` 引用热点，`label/reply` 为动作及中文结果；英语回应另填 `replyEn`，释义随偏好隐藏 |
| `action.requires` | 已完成动作ID列表，全部满足才允许操作 |
| `action.consume/give` | 场景道具ID到正整数数量；一次成功才消耗/给予，重复操作不再结算 |
| `action.requiresBattles` | 必须已获胜的遭遇ID列表；不能用交谈代替胜利 |
| `action.learning` | 稳定 `id` 以副本ID加冒号开头，`title/context/prompts`；每句含稳定 `id/zh/en/question:{zh-CN,en}` |
| `dungeon.encounters[]` | 稳定副本前缀 `id`、已支持kids `monsterId`、`x/y`、可选动作 `requires`；条件满足才出现 |
| `dungeon.completion` | 完成本地点所需动作ID列表；不可与动作/战斗前置形成循环 |

例子以 `cities/shenzhen.json.nodes` 为准，不另维护重复的城市正文。总览从节点列表生成，只负责导航。

现实地面入口由共享 `entrance-art.json` 的石质蓝色WebP绘制，城市宽48–64单位、节点46单位，地名按城市等级着色。作者节点使用上述契约；没有绑定专属内容的城市CSV入口使用 `adventure_city_generated_core.js` 默认街区，运行时内部的 `generated` 主题、blocks、buildings和队伍怪物列表不需要复制进作者JSON。入口一旦明确绑定作者节点，即使用专属场景及其稳定进度身份。

世界 `index.regions[].dungeonIds` 只列总览与节点副本ID，用于本机副本恢复的按需路由。道具、动作和胜利记录保存于 `earthCityProgress.cities[cityId].dungeons[dungeonId] = {version:1,done:[],items:{},cleared:[]}`。本机 `cityReturnStack` 与原 `dungeonReturn` 区分总览返回和现实地图返回，均不进云端。

更新时保留旧节点、副本、动作、战斗和学习身份；需要改名只改显示文案。未支持的自定义布景资源、物件自由拖拽及其他操作必须先扩展运行时，不能只添加配置字段。
