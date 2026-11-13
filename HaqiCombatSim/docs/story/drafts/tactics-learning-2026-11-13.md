# 战术课堂与挑战委托（2026-11-13 Web新增编排）

状态：已在客户端模块实现；浏览器试玩待补。本文是玩法文案与触发对照，不是原版Lua对白。未改写已有主线故事JSON。

| 稳定ID | 场景与意图 | 实现入口 |
| --- | --- | --- |
| D-tactics-learning-coach-01 | 茜茜：借卡练配合，再去实战；明确不消耗正式卡牌 | adventure_npc_core / view_tactics_training |
| D-tactics-learning-focus-01 | 两人配合：给主攻强化，给敌人陷阱，再由对应学派攻击 | tactics_training_core focus |
| D-tactics-learning-focus-02 | 反例：错学派不触发对应状态；状态仍保留；还原后重试 | tactics_training_core castTrainingCard |
| D-tactics-learning-shield-01 | 护盾会削弱下一击，先用一次进攻消耗，再组合爆发 | tactics_training_core break-shield |
| D-tactics-learning-guard-01 | 敌人虚弱加上我方护盾，让同一次来袭更轻 | tactics_training_core guard |
| D-tactics-learning-squad-01 | 四人分别承担强化、陷阱、保护与攻击，观察施法对象 | tactics_training_core squad |
| D-tactics-learning-dot-01 | 持续伤害施放时带入强化与虚弱，各段发生时检查护盾和陷阱 | battle_tactics_core cardTacticAdvice |
| D-tactics-learning-world-01 | 课堂之外，用真实战斗完成组合；胜利后留下实绩 | tactics_progress_core / battle_tactics_journal_core |
| D-tactics-learning-watch-01 | 巡夜灯：读懂强化回合，选择准备、进攻或防护 | dungeon_tactics_core first-watch |
| D-tactics-learning-spark-01 | 火种：识别主攻与守护，选择处理护盾或集中击倒 | dungeon_tactics_core lost-spark |
| D-tactics-learning-ember-01 | 守夜人：识别四类准备，分配集火和防护 | dungeon_tactics_core ember-night |
| D-tactics-learning-reward-01 | 完整通关留下成绩、称号与一次性装备；穿戴时看真实变化 | dungeon_challenge_core / dungeon_first_rewards_core |

文案原则：给当前目标、施法对象和结果；详细规则由玩家主动展开。伤害取实际引擎结果，不写虚构固定倍率。敌人意图是计划，保留控制、击倒和状态消耗的变化空间。下一步来自已保存进度，不以停留时长假装成就。

进阶边界：巡夜灯建议5级、火种建议6级；守夜人属于建议50级的后期四人挑战，末波包含50级敌人。借卡课堂不提供正式卡牌，也不能替代伙伴等级、卡组与装备准备。进场前可展开查看这些事实。
