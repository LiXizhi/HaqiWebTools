# P2 战斗内核

状态：**部分实现，未通过原版整场验收**。更新时间：2026-09-16。总进度以 [code-plan.md](../code-plan.md) 为准。

## 目标与依赖

P1 数据快照；card/player/arena_server.lua。

## 任务与交付物

- 公开八个共用 API、确定性 PRNG、观察信息与合法动作
- 双版本 1v1–4v4、事件日志、动作回放与核心效果分支
- 待完成：覆盖门禁高级类型及完整原 Lua 整场对照

交付物：engine/、rules/、bots/、api.js、tests/engine、tests/parity。

## 验收条件与记录

- 已：两版本八种规模可运行；事件/无事件/回放结果一致；非法动作原子拒绝
- 已：伤害、治疗、基础HP、能量消耗直接 Lua 执行对照
- 未：所有 Card.UseCard 分支及完整 PvP 生命周期原版对照

具体运行证据与复现命令见 [testing.md](../testing.md)。未完成的验收不因为界面可用而勾选完成。

## 遗留与交接

可执行卡牌数不等于原版一致性覆盖率；详见 combat-rules 未验证交互。

每新增类型先原 Lua 夹具，再接入 capability registry；保持 PARITY_STATUS experimental。

### 2026-09-17 有限卡包

加入 deckCapacity / handSize / drawPerRound 和 discardSeqs。`tests/engine/deck.test.mjs` 验证双版本保留手牌、补牌上限、弃牌与成功使用耗尽、非法弃牌原子拒绝和动作回放。默认最多 8 张；自定义上限为实验参数。整场原版一致性状态不变。
