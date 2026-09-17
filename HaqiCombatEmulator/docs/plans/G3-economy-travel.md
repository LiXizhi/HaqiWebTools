# G3 经济、卡组与跨岛

状态：**完成（实验切片）**。更新时间：2026-09-17。总进度以 [code-plan.md](../code-plan.md) 为准。

## 目标与依赖

用 `npcshop.xml` + `extendedcost` 的真实商品与价格，配上背包/卡组管理和跨岛旅行。依赖 G0–G2。

## 任务与交付物

- `ui/panels.js`：商店（分类、真实图标、货币价格、买入）、背包、卡组编辑（已掌握/即将解锁、+/−、一键配卡、清空、校验）、系统（保存/导出/导入/删除、操作说明）
- `progression.js`：货币与物品、卡组容量与同名上限、按等级解锁本系卡牌、默认卡组
- `main.js`：船长 NPC（`isCaptain`）菜单列出可去的岛及 `min_level`；同 gsid 传送门配对（当前无跨岛 PNG 目标，仅同岛）
- `quest/quests.js`：`playableWorlds`、`questOutlook`（每岛下一批任务的开放等级）

## 验收条件与记录

- 已：Chrome 用例——商店实际买入并提示、背包显示奇豆、卡组 −/一键配卡改变张数、任务日志、地图弹窗、系统面板、390px 布局无横向滚动
- 已：`tests/game/combat.test.mjs` 进阶规则；`tests/game/quests.test.mjs` 教程跳过与可去岛列表
- 限制：95/1764 商品无 `exid 0` 价格规则，显示“价格未知”并禁用；装备无法穿戴；只有小镇与火鸟岛可去

## 遗留与交接

若补入更多 PNG 岛图，乘船列表与传送门配对无需改代码；需要为每岛检查碰撞分类（`assets/masks/<world>.png` 可手工修正）。
