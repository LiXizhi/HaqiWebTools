# 独立战斗推理、配包与复盘

2026-09-27：首版本机系统。源入口 `js/battle_ai/index_core.js` 不依赖 DOM、网络、存档、账号或大模型；哈奇规则适配器单独导入。只面向 kids，旧策略仍保留。

## 调用

```js
import {analyzeDecision,chooseDecision,compareDecision} from './js/battle_ai/index_core.js';
import {observeBattle,haqiRulesAdapter} from './js/battle_ai/haqi_adapter_core.js';
const observation=observeBattle(arena,unit.id);
const analysis=analyzeDecision(observation,{rulesAdapter:haqiRulesAdapter,difficulty:'expert'});
const pick=chooseDecision(analysis,{mode:'best',seed:arena.seed});
const advice=compareDecision(analysis,playerPick);
// 由调用方提交 pick。分析本身不会操作真实战场。
```

`difficulty` 为 `easy / normal / advanced / expert`；`mode:'best'` 固定最高分，否则按照候选选择概率抽样（专家默认最高分）。候选按卡牌/目标/弃牌去重，最多三项；不为了凑数列出明显较差行动。

`observeBattle` 只保留公开单位状态、已出牌、当前操作者手牌以及本人剩余牌的计数，不提供牌序、敌方手牌/配包、怪物脚本或战斗 RNG。分析结果包含 `stateId`、算法版本、候选、全部已评估行动、证据、置信度和不支持项。提交前可校验 `stateId`；浏览器 Worker 接入已经这样处理。

## 概率与战术

调用真实 `useCard` / `tickDots` / `tickHots`，在隔离状态上保留术、陷阱、棱镜的处理顺序、超级魔力扣除、之敌、反射和各类组合效果。法术命中、闪避、暴击与魔力生成使用原闭区间概率的分析钩子；实战 RNG 路径与取样次数不变。

只展开单次法术的有限概率分支。伤害范围最多分三段，预算外保留全部概率质量并采用条件代表值，`approximateMass` 明示近似部分。大范围伤害不是精确积分；整局胜率不能从出牌分数推导。卡牌审计包含全部701张kids卡，668张具有引擎处理器，33张未支持；具有处理器不代表所有战术价值都已精确建模。

对手模型使用已公开攻击记录，缺少记录时使用本系、等级与魔力可用性构建先验，输出来源标签。先验不等于真实手牌。当前施法与一次持续效果结算用于即时价值；目标、准备牌与爆发采用当前公开状态下的静态条件比较，不展开未来对局树。敌方威胁每个候选只计算一次，避免4v4的分支乘法膨胀。

参数通过 `BalanceParams.battleAI` / `resolveParams` 提供，包括分支预算、候选数、资源价值、生存权重、准备代价、满点压力、弃牌权重、温度和提示阈值。规则适配器可替换；接入其他游戏需要实现其语义和结算接口。

## 公共服务

| 函数 | 输入与输出 |
|---|---|
| `analyzeDecision` | observation + rulesAdapter → 排序候选、证据、近似标记 |
| `chooseDecision` | analysis + 模式/种子 → 既有行动格式 |
| `compareDecision` | analysis + 行动 → 差距、建议与 shouldPrompt |
| `optimizeDeck` | 可用卡/maxCopies、limits、locked、current、role + scoreCard/semantics → deck/diff/起手概率 |
| `reviewBattle` | winner、side、决策分析、公开事件、过程帧、可核对证据 → 接近程度、亮点、诊断 |
| `recommendProgression` | review + available routes/owned/mode → 最多三项建议；不执行成长操作 |
| `evaluateEncounter` | scenarios/seeds + 真实 run 回调 → 实测胜负平、Wilson区间、回合、不支持项 |
| `evaluateImprovements` | baseline/variants/seeds + run → 配对改进幅度和保守区间 |
| `explainResult` | analysis 或 review → 本地中文模板输出 |

配包采用职责补足、边际收益和重复收益折减，不枚举全部配包。`locked` 锁定指定牌的确切份数。更换角色、目标或评分函数可供关卡工具复用；哈奇冒险入口当前提供通用稳定方案。不同对手的具体推荐可由调用方的评分函数注入，不能将当前通用方案宣称为全局最优。

## 接入与重演

- 冒险提供纯文字宠物提示、结算页“查看复盘”和成长入口。分析由 Worker 执行；符文仍由玩家显式使用。
- 卡包原“推荐”统一使用AI配包，不再并列两个推荐入口；只改编辑草稿，保存后生效。
- 模拟器和批量页增加四档推理策略。`coordinateTeam` 用已提交的友方意图和公开效果作名义投影，减少重复集火/治疗；不查询未来随机值，不保证队友施法成功。PvE伙伴在真实前序行动后逐人判断。
- 新 PvE 决定携带 `aiVersion:1`、`aiPicks`。实际伙伴决定写入原本地检查点；重演缺少决定时拒绝，不重新调用新算法。无版本的旧记录仍用旧 SimpleBot。
- 快照 PvP 新战报为v2并记录 `rivalPick`；v1继续沿用旧路径。真实怪物强制脚本不改动。
- 复盘会话是本机内存数据，不增加云端收藏/历史写入；刷新后缺失的过程分析不伪装为完整复盘。

## 复盘证据与局限

接近程度使用多个决策时点的双方剩余生命相对值、实际进攻压力和末段差距；这是过程指标，**不是校准后的局势胜率**。开场满血不能单独证明势均力敌，缺少记录时保持中性。相近且无重大失误时默认只有鼓励与可展开复盘。

自动证据包括：连续受到之敌干扰而缺净化、持续伤害压力、反复无牌、未满编队、高额受伤，以及先移盾后攻击的亮点。这些是可观察准备问题，不证明某次升级必胜。容量建议会先提醒检查弃牌与有效牌，避免一律要求更大口袋。

幸运结论必须有带事件索引的、已验证反事实证据。仅看到暴击不会自动称“全靠运气”；当前普通产品复盘不会凭单次暴击虚构因果。关卡工具可通过 `evaluateImprovements` 对操作/配包/容量/属性/阵容变体作独立种子对照，并将显著结果交给复盘。自动枚举全部成长路线和完整对局胜率预测不在首版能力内。

成长入口仅打开已有卡包、背包、宠物、伙伴、强化或任务页。返回世界前先走原结算流程，不自动购买、学习、消费或发消息。已知条件不满足的路线不展示；未配置的商店/获取途径不猜测。

## 运行评测

```sh
node --test tests/battle_ai.test.mjs
node scripts/evaluate_battle_ai.mjs --all --games 10 --seed 4711
node scripts/evaluate_battle_ai.mjs --size 4 --games 2
node scripts/evaluate_battle_ai.mjs --input my-encounters.json --games 20 --out report.json
```

`--input` 是场景数组。PvP 场景为 `{id,near:[unitSpec],far:[unitSpec],params?}`；PvE 为 `{id,mode:'pve',player,party?,monsters:[原怪物模板],params?}`。当前PvE仅应用`params.adventure`覆盖。`runHaqiEncounter` 单独从 `encounter_core.js` 导出；保留强制脚本。场景与数据由调用方加载，不依赖浏览器或账号。

隔离浏览器入口：`tests/fixtures/battle-ai.html` 与 `tests/fixtures/deck.html?bags`。只使用内存角色，不读写玩家进度。

固定种子对照及耗时见`qa-report.md`。轻提示目前只验证明确标注的门槛回归用例，尚没有真实玩家分布的误报率估计；启发式置信度也不等于统计校准后的正确率。

### 战宠选牌提示

选牌阶段异步生成建议，由距离主角最近的存活战宠（包括主角身旁的支援宠）右上方显示一句纯文字（向右展开，窄屏自动换行避开主角）。点击气泡可收起当前战场的提示；下一回合出现新提示，或通过顶部开关重新开启。不显示标题和操作按钮，不代选卡牌，也不拦截玩家出牌；选牌后气泡收起。宠物提示开关位于声音按钮左侧，撤退保持最右侧；冒险界面不提供 AI 托管入口。未出战、阵亡或缺少可见宠物时不冒泡。开关仅影响本场提示，不修改账号或云存档。分析缓存仅复用于相同公开战场，过期返回不会更新界面。

### 配包与蓄力修正（2026-09-27）

配包先安排可用的通用盾（含结界守护）、本系伤害术/陷阱、攻击与爆发、破盾/去增益，再补份数。默认准备牌目标45%、攻击目标40%，工具与治疗限制份数，避免从全攻击走向全辅助；小容量按骨架优先级降级，缺少已学会卡牌或锁定占满时返回未满足的requirements，不擅自学习、消费符文或突破卡包限制。重复牌表示补充使用次数，不假设同一个增益可以重复叠加。效果通过真实状态规则计算。

五轮推进方案已由下述目标战术模型替代，不再推进五轮随机魔力、冷却或敌方行动。

### 目标战术模型（当前实现）

1. 对存活敌人与少量主要攻击牌作真实结算的条件比较，结合有效伤害、击败收益、准备代价与已有集火目标选择目标。高点数本身不是唯一评分；护盾、抗性、过量伤害和实际扣点都影响价值。
2. 固定按净化、破盾、转换、术、陷阱检查少量准备牌，只有实际提高该次攻击收益才进入组合。它是机制组合比较，不代表预测这些步骤一定能依次执行。默认最多三个有效准备步骤。
3. 从现有普通/超级魔力计算施法缺口与接近储存上限的压力。estimatedWait仅是资源缺口估计，不循环推进回合。已有击败机会、防守救援与接近满点时的释放优先于盲目等待；下一次分析会重新检查目标状态。
4. 根据选定爆发缺少的牌型构造少量弃牌方案，保护主要爆发牌和有效准备牌，最多弃两张普通手牌。缺少爆发牌时先争取爆发牌；已有爆发牌时争取能改善本目标结算的准备牌。保留仅剩的可用攻击牌，不弃宠物卡/符文。补牌概率以自己剩余卡牌数量作无放回估计，绝不读取隐藏顺序；角色条件变化后重新评估。

analyzeDecision.strategy（version:2）给出targetId、attackKey、source（hand或remaining）、base/prepared、steps、comboPipEquivalentSpent和comboDamagePerPip；memory.targetId用于轻度保持集火，目标死亡或明显不划算时切换。forecast.tactic给出本行动的进展与draw.before/after、抽样数量，替代试验性的forecast.charge。普通与超级魔力按真实引擎扣除；等效资源口径中超级魔力计两点，另外保留normalSpent/powerSpent以表达跨系损耗。

出牌评分包含即时结算、当前威胁、战术进展、提前释放的机会成本、满点压力和弃牌补齐收益。所有权重走BalanceParams.battleAI。条件伤害不是整局胜率；对手后续反制、持续效果的完整剩余周期以及多张缺牌同时抽到的组合没有穷举。每次出牌前重新验证合法性与公开状态。

## 提示卡牌来源与实时校验

宠物提示会考虑独立宠物卡堆：普通手牌页推荐宠物卡时明确提示“打开使用宠物卡”，宠物卡页则标注“宠物卡”。显示前按当前 seq + key 核对真实可选牌，排除待弃、未抽到、已使用、魔力不足、冷却、眩晕和目标失效情况；失效建议直接隐藏，不把未来爆发目标当作当前可出牌。

## 结算复盘入口（2026-09-27 更新）

冒险及切磋界面仅在战败且存在具体诊断、已记录亮点或有依据的运气事件说明时显示“查看复盘”。胜利、平局、空报告和仅有回合统计/数据不足说明的报告不显示入口；不再用缺少依据的占位文案填充复盘。成长入口随有效战败复盘显示。推理库仍支持任意结果的独立分析，供关卡评测等使用。
