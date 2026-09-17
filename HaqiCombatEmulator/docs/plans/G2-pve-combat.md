# G2 PvE 战斗

状态：**完成（实验切片；规则一致性沿用 P2 的 experimental 状态）**。更新时间：2026-09-17。总进度以 [code-plan.md](../code-plan.md) 为准。

## 目标与依赖

在共享确定性内核上加最小 PvE 剧本，怪物由真实模板与基因驱动。不引用 HaqiCombatSim。

## 任务与交付物

- `engine/battle.js`：`scenario.pve`（1–4 对 1–4，`size` 取较大一方）、`kind:'mob'` 标签、怪物牌库循环；`ENGINE_VERSION 0.3.0`；`tests/engine/pve.test.mjs`
- `combat/mob-build.js`：模板 → 快照角色（HP、五系伤害/抗性、魔力、加权牌库、等级抬升到牌库 `requireLevel`）
- `bots/genes.js`：Genes_Attacker 风格纯策略（`hp_range`、一次性 `hp_drop`、`priority`、`card`/`card_set`、`target_hostile`），回落 `tactical`
- `combat/encounter.js`：玩家一手 → 怪物整方；胜利结算经验（×2 儿童全局加成）/奇豆/掉落
- `render/battle-scene.js`：地图取景为背景、像素精灵、HP/魔力条、状态徽标、伤害漂字、施法与死亡台词气泡、真实卡面手牌、目标选择、跳过/逃跑、结算面板
- `combat/card-text.js`：卡牌数值文案（伤害区间、持续、治疗、眩晕等）
- `main.js`：拉怪距离触发、失败回出生点、击退、按 `respawn_interval` 刷新

## 验收条件与记录

- 已：`tests/game/combat.test.mjs` 8 项——16 个小镇模板全部编译、317 个已摆放模板中 ≥200 可开战且失败原因具名（`balance`/`metal` 学派、无卡）、权重牌库、基因选择与确定性、遭遇战闭环与奖励、四怪同种子复现、进阶规则、卡牌文案
- 已：Node 平衡抽样（战术策略）——1–10 级镇怪 100% 胜；11–12 级对 700 HP 幽魂章鱼 52–85%；13 级对章鱼首领 35%
- 已：Chrome 用例完成整场战斗并显示结算；手机宽度隐藏菜单栏
- 未：Boss 专属机制、宠物、装备；原版整场一致性（P2 门禁）

## 遗留与交接

`WhiteDragon`（balance）、`HammerBear`（metal）与无卡的 `FireRockyOgre_Boss` 无法开战，遇到时提示并让其进入刷新计时。
