# 公共接口 v1

统一导出：`js/api.js`。原生 ES Module，在浏览器、Worker、Node 中使用同一个实现。下述格式均 `schemaVersion: 1`。格式版本、引擎版本、机器人版本、配置 hash 各自独立，不混用。

## 角色与场景

```js
const build = {
  name: '寒冰', school: 'ice', level: 50, mode: 'snapshot',
  attributes: {maxHP: 5000, powerPip: 50, damage: 30, resist: 15},
  deck: ['Ice_SingleAttack_Level1'], runes: [], pet: null
};
const scenario = {schemaVersion: 1, size: 1, firstSide: 0, teams: [[build], [build]]};
```

school 为 ice/fire/storm/death/life；size 为 1–4，teams 两组等长；firstSide 0/1。卡牌 key 必须存在且机制可执行。预设工具 `data/presets.js` 可构建当前快照有效卡组。

`mode:'equipment'` 读取 `equipment:[{gsid, addonLevel}]`、`gems:[gsid]`、`vipLevel:-1..10`、`extraStats:{statId:number}`；`mode:'snapshot'` 只使用最终 `attributes`，不叠加上述装备来源。属性对象接受统一数值或分学校 map：damage/resist/accuracy/damageAbsolute/resistAbsolute/critical/resilience/penetration；其他字段包括 maxHP、powerPip、outputHeal、inputHeal、initialPips、initialPowerPips、hit、dodge。独立符文栏/战宠的非空输入目前阻止对局，不静默忽略。

## API

| 函数 | 输入 → 输出 |
|---|---|
| `compileCharacter(build, ruleset)` | 返回 compiled角色：attributes/stats/sources/deck，缺失数据抛错 |
| `createBattle(scenario,ruleset,seed=1,{recordEvents=true}={})` | 独立可变 BattleState，已经进入第一阵营回合 |
| `getObservation(state,unitId)` | 公共角色状态、自己的 hand、legalActions；无敌方手牌/卡组/RNG |
| `getLegalActions(state,unitId)` | 当前阵营该角色所有合法动作，不能行动时空数组 |
| `stepBattle(state,actions)` | 原地推进一个阵营回合，返回 `{state,events,result}`；先完整校验所有动作 |
| `runBattle(scenario,ruleset,seed,{strategy,recordEvents}={})` | 默认仅返回 Result；recordEvents=true 返回完整 BattleState |
| `runBatch(experiment,ruleset,{start,count}={})` | 同步无界面计算，返回每场 Record 数组；start/count 是 index 分片 |
| `createReport(experiment,ruleset,records)` | 排序聚合 Report，缺少预算样本则 partial=true |
| `applyPatch(ruleset,patch)` | Promise<新规则包>，克隆、校验、产生新 hash；不修改输入 |
| `exportReplay(state)` / `replayBattle(replay,ruleset)` | 带种子、原始场景和动作序列的战报 / 重放状态 |

浏览器取消/进度入口：`startExperiment(experiment,ruleset,{workers,onProgress})` 返回 `{promise,cancel}`。Node 自行调用 runBatch，不引入 pool.js。

动作格式：`{unitId:'0-0',kind:'pass'}` 或 `{unitId,kind:'cast',card:key,seq:手牌实例序号,targetId:'1-0'}`。同一张卡的重复副本以 seq 区分。调用方应从 getLegalActions 取值，不自行推断合法性。一次 step 必须包含当前方全部存活角色各一个动作。unitId 为阵营-席位，0 起始。

事件：`{turn,type,...details}`。type 包括 turn/cast/fizzle/damage/heal/death/stun/pass/skip/end。damage 含 caster/target/card/school/amount/actual/absorbed/mark；区分理论扣血与实际损失，指标使用 actual。输出 Result 含 winner（0/1/null）、reason、turns、units 指标、seed、engineVersion、configHash、version、parityStatus。

## 实验和报告

Experiment：`{schemaVersion:1,count:10000,seed:20260916,population:'fixed',strategy:'tactical',scenario,profiles?,replacementSchool?}`。population 支持 fixed/matrix/mixed/replacement；count 须偶数，replacement 须四的倍数。profiles 为各系角色 map，矩阵和混编使用。strategy 为 tactical/random。

Record：`{index,pair,variant,schools,seed,score,turns,units}`；score 为换回原 A 队视角的 1/0.5/0。Report 含 schemaVersion/engineVersion/botVersion/version/configHash/parityStatus、完整 experiment、records、requested/completed/partial、summary、schools、matrix、metrics、replacement 和 averageTurns。95% 区间是配对组得分率区间，具体口径见实验文档。耗时由外层测量，可选 elapsedMs。

Replay：`{schemaVersion,version,engineVersion,configHash,scenario,seed,actions,result}`。导入校验版本/hash，重新执行动作；存档结果不直接作为权威结果。配置 hash 不匹配不能复用。

## 数值补丁

```json
{"schemaVersion":1,"baseHash":"基线哈希","title":"单卡伤害试验","reason":"具体实验依据","changes":[{"path":["cards","真实卡牌key","params","damage_min"],"before":100,"value":95}]}
```

每候选 1–20 改动，最多 3 候选。路径只接受现有 cards 参数白名单、顶层 accuracy/hitchance/pipcost、items 数字 stat；禁止 prototype 路径和重复路径。旧值必须精确匹配有限数值，新值须非负有限数值且不超过 1e7，概率≤100，能量/冷却为≤100整数，min≤max。不能写 JS、公式字符串、文件或任意对象路径。

Patch 的 hash 根据父 hash 与改动生成；候选评估返回 `{baselineHash,baselineValidation,results:[{candidate,configHash,paired,validation}]}`。用户导出后由外部流程决定是否应用，本项目没有正式服写入接口。

## v0.2 卡包与弃牌（2026-09-17）

角色新增 `deckCapacity`（1–200，默认至少 64）、`handSize`（1–20，默认 8）、`drawPerRound`（1–handSize，默认 handSize）。实际配卡 deck.length 不得超过卡包容量。容量不凭空生成卡片。每个己方回合从种子洗牌后的剩余牌库补 `min(drawPerRound, 手牌空位, 剩余牌数)` 张，保留旧手牌。

每角色行动可附加 `discardSeqs:[手牌实例序号]`，弃牌与本次 pass/cast 一起提交。不能弃不存在、重复或本次要施放的卡。整个阵营的动作与弃牌先一起校验，再按席位执行。弃牌永久移除，下个己方回合才补位，不能当场无限换牌。可在 UI 提交前撤销标记。

BattleState 角色新增 `usedCount`、`discardedCount`；剩余牌库为 `deck.length-drawIndex`。getObservation 仅向当前角色提供其牌库余量和上述计数。记录 draw/discard 事件，弃牌进入 actions，可确定性回放。牌库和手牌都耗尽时仅能等待；施法失败仍沿用原规则回到牌库末尾，不计成功使用。

引擎版本升级为 0.2.0，旧引擎动作战报拒绝直接回放。动画只读取事件，不参与 Worker 或无界面结算。

## v0.2.2 单卡上限与默认容量

默认 deckCapacity 改为 40（仍可显式配置 1–200）；实际携带数量可以小于容量，空位不参与抽牌。每个 card key 最多携带 6 张，compileCharacter 对所有调用方统一校验；手动加牌同时受容量和副本数限制。非法旧自定义卡组不会被截断为其他卡组，导入/编译会报错；本机无效保存配置沿用启动时的提示及默认回退，原保存仍在 IndexedDB。

`rules/deck.js:openingChance(total,copies,draws)` 给出均匀无放回首轮抽取至少一张的理论概率，使用实际携带张数而非容量，抽取量=min(handSize,drawPerRound,实际携带数)。固定种子的实战抽牌仍由内核负责，界面概率不改变抽牌。
