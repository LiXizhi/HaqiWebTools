# G0 基础：数据导入、CDN 资源、地图与行走、存档

状态：**完成（实验切片）**。更新时间：2026-09-17。总进度以 [code-plan.md](../code-plan.md) 为准，设计见 [game.md](../game.md)。

## 目标与依赖

在不改动模拟器现有入口的前提下，给 `Haqi.html` 提供真实数据、真实地图和可行走的世界。依赖 `js/data/loader.js` 的 ruleset 与 `js/storage.js`。

## 任务与交付物

- `scripts/import_game_data.py`：世界/NPC/竞技场/怪物/任务/商店/HP 表/锚点/区域颜色 → `data/game/kids/*.json`，逐文件哈希 `manifest.json`；`assets_manifest.txt` → `data/game/asset-index.json`
- `js/game/assets/cdn.js`：清单行 URL、Cache API、PNG 解码、占位图
- `Haqi.html` + `css/game.css` + `js/game/main.js`：标题/建号、全窗口 Canvas、固定步长循环、屏幕状态机
- `js/game/world/map.js`（仿射锚点拟合）、`collision.js`、`camera.js`、`input.js`（键盘/点击/触摸摇杆）
- `scripts/build_sprites.mjs` → `assets/sprites/`（45 张生成像素图）+ `js/game/render/sprites.js`
- `js/game/save.js`：IndexedDB 存档、导入导出 JSON

## 验收条件与记录

- 已：导入器覆盖 36 世界 / 366 NPC / 297 竞技场 / 359 怪物 / 427 任务 / 63 商店，`missing` 仅 3 个非关键文件；`tests/game/world.test.mjs` 校验锚点残差、出生点与实体落在图内、碰撞分类与滑行
- 已：Chrome 用例中新角色出生在哈奇小镇可行走点，键盘右移生效，刷新后“继续冒险”恢复
- 限制：只有 PNG 地图的岛可进入；锚点残差 10–45 px 属源数据噪声

## 遗留与交接

`NewUserIsland.map.html` 为寒冰岛副本，导入时清空；若将来 CDN 出现寒冰岛/古埃及/暗黑森林 PNG，`playableWorlds()` 会自动放行。
