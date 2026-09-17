# G1 NPC 与任务

状态：**完成（实验切片）**。更新时间：2026-09-17。总进度以 [code-plan.md](../code-plan.md) 为准。

## 目标与依赖

用 `quest_list.xml` 的真实对话与目标驱动 NPC 交互；不解析 MCML 闲聊页。依赖 G0 数据与实体。

## 任务与交付物

- `world/entities.js`：NPC 实体（名字/头衔、朝向、按模型分类的精灵、CDN 头像映射）
- `render/overworld.js`：头顶 `!`/`?`/灰 `?` 标记（CDN `headon`），附近最近 5 个可对话 NPC 显示名字
- `render/hud.js`：对话框（头像、正文、按钮）、任务追踪、空追踪时的数据驱动提示
- `quest/quests.js`：纯状态机——可接（等级、前置链、学派、支持的目标类型、怪物已摆放）、接取、`Goal`/`GoalItem`（几率）/`CustomGoal`/`ClientGoalItem`/`ClientDialogNPC` 进度、完成与奖励选择、放弃、经验货币 → 经验
- `quest/dialog.js`：`gotonext/doaccept/dofinished/donpcdialoged` 对话运行器，NPC 菜单页
- `ui/panels.js`：任务日志（放弃）

## 验收条件与记录

- 已：`tests/game/quests.test.mjs` 8 项——数据引用完整性、教程链跳过、击杀任务全流程、掉落链与几率、对话任务、对话运行器、奖励归类、未摆放怪物的任务不提供
- 已：Chrome 用例在火鸟岛接取「安格斯的困惑」→ 追踪 0/1 → 击杀 → 1/1 → 交任务奖励
- 限制：`FlashGame`、`ClientExchangeItem` 任务不提供；哈奇小镇任务全在 30 级以上

## 遗留与交接

任务 NPC 的闲聊 MCML（`NPCs/**/*_dialog.html`）若要展示，需要单独的只读解析器，不在本阶段。
