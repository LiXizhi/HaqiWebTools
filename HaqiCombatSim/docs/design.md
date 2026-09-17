# HaqiCombatSim — 产品设计

## 用户与场景

- **数值策划**：想知道当前 kids / teen 配置下五系在 1v1~4v4 的胜率是否均衡，改一个系数后多久能看到结果，以及"应该往哪个方向调"。
- **开发者**：想在不启动 GameServer 的前提下验证某张卡、某条公式的实际效果，并把结论对照回 Lua。
- **测试**：想手动打几局，感受节奏（回合数、pips 积累、blade + 大招的爆发）。

## 页面

### 顶栏
- 版本切换：kids / teen（影响公式分支、上限常量、数据集）。
- 数据集状态：卡数、未支持 type 占比；若回退 sample 则醒目提示。
- 当前 BalanceParams 是否有未保存改动（相对基线的 diff 数）。

### 1. 对战页（battle）
- 阵容配置：模式（1v1 / 2v2 / 3v3 / 4v4），每个槽位：系、等级（1~50，teen 可更高）、装备段（来自 `statsByGear` 区间，如 GS 0~200 / 200~300 …）、策略（人类 / DeckAttackerBot / SimpleBot）。默认玩家控 side 0 第 1 槽，其余 Bot。
- 战场（2D，DOM/CSS）：
  - 上方敌方 4 槽、下方友方 4 槽；每槽：系色块头像、名字 / 等级、HP 条与数字、pips（普通 / 能量球分色）、状态图标（charm / ward / absorb / DOT / HOT / stun / miniaura）与剩余回合。
  - 中央：回合数、当前阶段（生成 pip → 选牌 → 结算）、全局光环。
- 手牌区：最多 8 张；卡面显示名称、系色、pipcost、type 简述、伤害 / 治疗区间、accuracy；不可出（pips 不足 / cooldown / stun）置灰。
- 交互：点卡 → 高亮合法目标 → 点目标 → 记入本回合选择 → 点"结算"（或所有单位选完自动结算）。Pass 按钮。
- 结算动画：按顺序逐条播放事件（施法 → 命中 / fizzle / dodge → 数值飘字 → 状态变化），可调速 / 跳过。
- 日志：每回合可折叠的事件列表，含公式明细（base、buffs、resist、pen、crit），便于核对。
- 结束面板：胜方、回合数、双方伤害 / 治疗统计、"再来一局 / 交换阵营 / 转批量"。

### 2. 批量模拟页（batch）
- 配置：参与系（默认五系全选）、模式（多选）、等级（单值或列表）、装备段、队伍组成（同系队 / 随机混编）、每对阵场次（100 / 500 / 1000 / 自定义）、seed。
- 运行：进度条（已完成 / 总场次、速度 场/秒）、可取消。
- 结果：
  - 5×5 胜率热力图（行 = 我方系，列 = 敌方系；对角线 50% 基线；单元格显示胜率与 95% 区间）。
  - 按模式切换的热力图；"各系平均胜率"条形图。
  - 表格：平均回合、场均伤害 / 治疗、fizzle 率、平局率。
  - 卡牌统计：使用频次、贡献伤害 / 治疗、fizzle 次数；未支持卡出现次数（红色标注）。
  - 导出 CSV / JSON；"发送到 AI 建议页"。

### 3. 数值面板（params）
- 全局常量：maxPips、maxRounds、handSize、critDamageRatio、dodgeDamageRatio、maxSpellPenetration、areaSiblingRatio。
- 按系系数：hp / damage / heal 乘子滑杆（0.5~1.5，步 0.01），accuracy / powerPip / resist / crit 加法百分点。
- 单卡表格：搜索 / 按系与 type 筛选；可编辑 pipcost、accuracy、damageMin/Max、heal 等；改动行高亮。
- 与基线 diff 列表；重置到基线；导入 / 导出 JSON；"用当前参数重跑上次矩阵"。
- HP 曲线预览：五系 L1~L50 折线（应用系数后）。

### 4. AI 建议页（advisor）
- 上半：自动调参器
  - 选择可调维度（默认各系 hp、damage）、步长、迭代上限、每次评估场次、目标矩阵（沿用批量页配置）。
  - 运行 / 停止；实时显示 loss 曲线与当前最佳参数。
  - 结果：参数改动清单（"烈火 damage ×0.96 → ×0.93"）、改动前后热力图对比、"应用到数值面板"。
- 下半：大模型建议
  - 设置：endpoint、model、API key（仅存本机）。
  - "生成建议"：把最近一次矩阵 + 当前参数 + 卡牌统计整理成 prompt 发送；展示 Markdown 回复；若含参数 JSON 块，提供"预览 diff → 应用"。

## 统计口径

- 胜率 = 我方胜场 / (总场 − 平局)；平局单独展示。
- 95% 区间用 Wilson score。
- 场均伤害 = 实际扣除 HP 之和（含 DOT），不含被 absorb 吸收部分；另列"吸收量"。
- fizzle 率 = fizzle 次数 / 施法次数。
- 未支持卡占比 = 卡组中未支持 type 的卡数 / 卡组总数（按系汇总）。

## 视觉

- 系色：烈火 #E5533D、寒冰 #4DA3FF、风暴 #8E6BFF、生命 #4CC36B、死亡 #6B6B7A、平衡 #D9A441。
- 深色背景，卡面浅色；移动端手牌横向滚动；最小宽度 375px。
- 不用 emoji；图标用 CSS 形状或 SVG 内联。

## 术语

| 中文 | 英文 key |
|------|----------|
| 烈火 / 寒冰 / 风暴 / 生命 / 死亡 / 平衡 | fire / ice / storm / life / death / balance |
| 能量球 | power pip |
| 法术失误 | fizzle |
| 增益 / 减益 | charm（positive / negative） |
| 护盾 / 陷阱 | ward（shield / trap） |
| 光环 | globalaura / miniaura |
