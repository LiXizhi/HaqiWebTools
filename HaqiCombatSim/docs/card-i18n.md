# 计划需求：卡牌多语言文案与海外运营

> 状态：**卡面专名与带数字的说明仍是计划。** 冒险界面的固定句子已经可以换语言，见 [locale.md](locale.md)。  
> 来源：产品负责人李西峙，2026-09-18 钉钉私信 Lily（未改产品 git；草稿备忘仅作意图）。  
> 含义：卡面说明今天主要由程序生成；希望有多语言版本，海外可以先上，不必等国内版号。

本文记录仓库里卡名 / 卡面文字是怎么来的，以及可以怎么本地化。不在本 PR 做 i18n 实现，不编造翻译 API。

## 目标

- 同一套卡牌数值与图集，能出 **中文以外的卡面标题和效果说明**。
- 海外包不依赖把中文烙进卡图再重绘；程序层换文案即可。
- 国内版号与海外发行是产品/法务问题；工程侧只准备「文案可抽离」。

本期不要求翻译任务对白、也不要求改伤害公式。

## 仓库里卡面文字现在怎么来

新卡面管线（2026-09-18）把**图**和**字**拆开：主体图集与五系底图不含标题；标题、费用、冷却、类型徽标、说明由 `CardRenderer` 画上。这是多语言的主要有利点。早期原版卡图曾把中文印在图里，现行绘制路径不再依赖那些印刷字。

### 程序生成的说明（不是策划手写长文）

`js/card_renderer.js` `cardDescription(card)`：

- 有伤害：`基础伤害 {n} · 命中 {accuracy}%`（若同时能治疗则再拼 `· 治疗 {n}`）。
- 只有治疗：`基础治疗 {n} · 命中 {accuracy}%`。
- 否则按 `template.type` 套短句：吸收 / 护盾或陷阱 / 增益减益 / 控制 / 魔力点 / 场地或姿态 / 跳过 / 失误 / 「辅助魔法」。

冒险手牌还有一条更短的 `spellHint`（`view_adventure.js`）：伤害、治疗、charm/ward 的 `desc`，否则「辅助魔法」。`CardRenderer.draw` 优先用传入的 `description`，没有才回退 `cardDescription`。

`data/kids/cards.json` / `data/teen/cards.json` **没有**策划写的 `description` 字段。导出器只搬 XML 的 type、pipcost、accuracy、params 数值（[data-export.md](data-export.md)）。所以卡面正文目前就是公式摘要 + 类型套话。

### 卡名：库里的中文，不是生成器编的

| 来源 | 用途 | 语言 |
|------|------|------|
| `data/kids/card_names.json`（661 条） | `scripts/export_spell_names.py` 从本机 `Database/globalstore.db.mem` **只解析字面量**得到显示名 | 中文（如「灵木刺阵」「海狮冰剑」） |
| kids `cards.json` 701 张 | 运行时模板。其中 661 张能对上卡名；约 40 张系统/过程卡（`Pass`、`Dead`、`HoT`、`DoT_*` 等）没有中文名 | key 为英文标识 |
| 冒险装入时的回退 | `adventure_expansion_core.js` `addCard`：`cardNames[key] \|\| cardNames[base] \|\| \`${schoolName}秘法（${pipcost}魔力）\`` | 中文模板 |
| `spell-effects.json` / `skill-art.json` 的 `name` | 特效工坊与卡面标题；`prepare_spell_effects.mjs` 写入 `names[c.key] \|\| c.key` | 中文或英文 key |
| 对战页 `shortCardName` | 配卡表、圆盘、日志：去掉 key 的学系前缀，**不读** `card_names.json` | 英文 key 残段 |
| teen | `data/teen/cards.json` 约 1272 张；**没有** `card_names.json` | 对战页同样用 key |

devlog_2026-09-17 仍把「配卡面板显示卡牌中文名」列为待办；冒险卡包已经能显示库名，模拟器对战页还没有接上。

### 其它已经写死的中文

这些不是卡面生成器，但海外包一样会碰到：

| 位置 | 内容 |
|------|------|
| `combat_presets_core.js` / `adventure_core.js` `SCHOOL_NAMES` | 烈火 / 寒冰 / 风暴 / 生命 / 死亡（及平衡、神话） |
| `STAGE_NAMES` | 幼年 / 青年 / 成年 / 隐藏形态 |
| charm / ward `desc` | 从 CharmWardList XML 原样导出，多数为中文短句（如 `+45%烈火攻击`）。kids：charm 67 条中 58 条有 desc，ward 122 条中 109 条有 |
| `view_battle.js` `describeEvent` | 整段战斗日志中文 |
| 冒险任务 / NPC | `chapter.json` 对白；Keepwork 登录窗 `lang: 'zhCN'` |
| 字体 | `CardRenderer` 标题/说明用 `"Microsoft YaHei"`；页面 CSS 为 PingFang SC / Microsoft YaHei |

架构上曾经规划独立 `i18n.js`，早期并入 `SCHOOL_NAMES` 等常量（[architecture.md](architecture.md)「意图 vs 现实」）。冒险界面后来改用中文整句做键的文本词典，见 [locale.md](locale.md)。没有 `en.json`，也没有运行时翻译服务。带数字拼出来的 `cardDescription` 和卡名表仍没有按语言分文件。

AGENTS.md 硬规则 9：用户可见文案为中文。海外包若要换语言，需要产品先改这条约定的适用范围（例如「默认中文，locale 可选」）。

## 和「不必等版号」的关系

程序绘制文案意味着：

- 换语言不必重出 225 张主体图集（变体本来就共享主体）。
- 海外构建可以继续发同一套 WebP/CDN，只换字符串表。
- 原版印刷卡图若仍作「对照原卡」展示，上面的中文属于历史素材，不是现行卡面权威。

版号本身、哪些国家要哪套包、是否允许海外先上，仓库无法回答。

## 本地化路径（选项，不是实现承诺）

都建立在「图与字已分离」上。可以组合，不必一次做完。

1. **生成说明模板按 locale 分表**  
   把 `cardDescription` / `spellHint` 的中文句子换成 `t('card.damage', { n, acc })`。伤害数字、命中百分比随卡，句子随语言。工作量小，覆盖现行卡面正文。

2. **卡名表按语言分文件**  
   现有 `card_names.json` 当 `zh`；另加 `card_names.en.json` 等。缺词时回退 key 或「{school} spell ({pipcost} pips）」这类生成名，与今天的「××秘法」回退同构。teen 目前连中文名表都没有，要先决定 teen 是否进海外包。

3. **charm/ward `desc` 翻译表或改由数值生成**  
   XML 短句是中文。可以按 id 提供译文，或丢掉 desc、用 `boost_damage` 等字段生成「+45% Fire damage」——后者与卡面生成器一致，但会放弃原句里的专有名称（「烈火之敌」）。

4. **UI chrome 字符串目录**  
   顶栏、按钮、任务、日志。比卡面大一个数量级；若海外只先出模拟器对战页，可以只翻译 `#battle` / `#params`。

不建议：把译文画进 WebP；为每种语言复制图集；调用在线翻译 API 作为运行时依赖（AGENTS.md 限制第三方库，且核心文件禁止随意 `fetch`）。

模拟器对战页若接上 `card_names`，中文名与将来的英译可以走同一查找，不必再靠 `shortCardName` 砍 key。

## 开放问题（代码无法回答）

1. **第一语言**：只英文化，还是 en + 其它？UI 与卡面是否必须同一天齐套？
2. **权威文案**：海外卡名是翻译 globalstore 中文，还是按 type/数值新起英文名（部分库名已是「风暴攻7」「寒冰11」这类占位）？
3. **teen**：海外是否包含 teen 数据集？没有卡名表时只能显示 key 或生成名。
4. **charm/ward**：翻译原 `desc`，还是改生成？原句含中文游戏术语。
5. **范围**：只卡面，还是冒险对白、宠物名（359 个中文名在 `pets.json`）、商店、Keepwork 登录文案？
6. **默认语言与检测**：`navigator.language`、`?lang=`、双包构建？构建是否仍默认中文以满足现行 AGENTS 规则？
7. **版号 / 发行**：哪些域名或入口算海外包；是否禁止海外包出现中文；法务是否要求与国内包内容隔离。仓库无结论。
8. **字体**：拉丁文是否继续 YaHei；RTL 或长德文是否改卡面 5 行截断规则（`CardRenderer` 目前最多 5 行、宽 218）。

## 建议的落地顺序（非实现承诺）

1. 产品定第一语言与范围（仅卡面 vs 含 UI）。
2. 把 `cardDescription` / `SCHOOL_NAMES` / 类型套话抽成 locale 表；数字仍来自模板。不改引擎结算。
3. kids 卡名：以现 `card_names.json` 为 zh，补一份可入库的 en 表（允许缺词回退 key）；teen 另决。
4. 对战页改读显示名，与冒险卡包对齐。
5. charm/ward 与任务对白按需要排队；不要在未定语言包格式前做运行时翻译服务。

相关：[card-study.md](card-study.md)、[art-pipeline.md](art-pipeline.md)、[plan.md](plan.md)「计划需求」。数值仍以 Lua 对照为准，与语言无关。

## 2026-09-25：效果文案入口更新

冒险卡面spellHint及CardRenderer的默认说明现共用 `card_description_core.js` 的describeCard；即时区间、持续回合、治疗、护盾吸收与X费数值分开表达。战斗选牌增加详细说明；以当前resolved参数生成。冷却显示取params.cooldown。上述中文动态句尚未完成独立多语言词条，复杂特殊效果未完整收录时明确提示。

### 2026-09-25 后续：难理解效果与英文已接入

选牌说明已补充棱镜转换方向/触发与用途、吸收盾容量示例、减伤盾与吸收盾的差别，以及眩晕吸收。卡面与详情现在使用先翻译后填值的中文模板；en.txt覆盖当前kids生成效果文案，自动检查701张卡牌无中文残留。前述“动态句尚未翻译”记录已被本次接入取代；复杂效果的完整规则说明仍按明确的未收录提示处理。
