# 界面本地化

`Haqi.html` 的界面语言。默认中文。设置里可以改成 English、日本語或 한국어。语言学习（悬停母语、朗读、自由交谈）见 [language-learning.md](language-learning.md)。卡名表和带数字的卡面说明仍是计划，见 [card-i18n.md](card-i18n.md)。

`HaqiCombatSim.html` 对战页不加载这些词典，界面保持中文。

## 中文就是键

内容 JSON 和源码里的用户可见句子继续写中文，不改成编号。显示时用整句中文去查表。没有译文、译文为空、或语言是 `zh-CN` 时，画面显示这句中文。未翻译的新键写成 `中文||`，右面留空，仍然算这条键。键里的换行写成 `\n`。

没有 `zh-CN.txt`。中文不需要词典。

带数字或名字拼出来的句子，整句才是键。`基础伤害 120 · 命中 85%` 和 `基础伤害 80 · 命中 85%` 是两条不同的键。词典里只有固定短句（例如 `辅助魔法`、`烈火`）时，这种拼出来的句子继续显示中文。

## 词典文件

| 语言 id | 文件 | 朗读语言 |
|---------|------|----------|
| `zh-CN` | 无 | `zh-CN` |
| `en` | `data/adventure/locale/en.txt` | `en-US` |
| `ja` | `data/adventure/locale/ja.txt` | `ja-JP` |
| `ko` | `data/adventure/locale/ko.txt` | `ko-KR` |

语言列表在 `js/locale_core.js` 的 `LOCALES`。中文 / English / 日本語 / 한국어均有词典（`zh-CN` 无文件，键即原文）。缺译文或文件未加载时回退中文。

`en.txt` 一行一条，空行忽略。以 `#` 开头且不含 `|` 的行是注释，用来标明后面的句子来自哪个源码文件，不参与查表。打包进 `dist` 时这些注释会被去掉。开发时直接读源码文件，解析器同样跳过注释。

```text
# js/view_adventure.js
下次再聊||Talk to you later
公式||a|b
```

分隔符是这一行里**唯一最长**的一串 `|`，通常写作 `||`。句子里已经有 `|` 时，分隔符用更长的一串，例如 `|||`。同一长度的 `|` 出现两次则整行丢弃。同一中文键出现多次时，保留第一次。

新语言的中文键与 `en.txt` 对齐：

```text
node scripts/diff_locale.mjs data/adventure/locale/en.txt data/adventure/locale/ja.txt
```

脚本列出对方缺少的键和多出来的键。有差异时退出码为 1。

## 模块

查表和解析不碰浏览器。`*_core.js` 仍禁止 `document` / `fetch`。

| 模块 | 职责 |
|------|------|
| `js/locale_core.js` | 语言列表、`lookup`、解析、对齐、存档字段校正。Node 测试直接 import。 |
| `js/locale_runtime.js` | `tr` / `setText`。浏览器装上翻译函数之前是恒等函数，测试里不会去读词典。 |
| `js/locale.js` | 启动时读取词典、按存档切换显示语言、语言学习的翻译条。只在浏览器里用。 |

`npm run build` 把 `data/adventure/locale/` 里每个 `*.txt` 单独输出到 `dist/data/adventure/locale/`，不并进 `adventure.json`。发布白名单只放行这个目录下的文本文件。

游戏启动时只请求当前需要的语言。界面语言是中文时不下载词典。改成 English 就下载 `en.txt`。语言学习打开后，再下载母语和目标语言里还没有的文件。已经读过的文件不再请求。文件不存在时该语言继续显示中文。

显示语言始终是存档的 `locale`，与学习开关独立。教学句子使用 `languageLearning.target`，教学解释使用 `languageLearning.native`。教学资源独立存放于 `learning.<locale>.txt`，经 `renderLearningTemplate` 严格查目标语言后再填命名占位符；缺内容时禁用课程，不使用普通UI的中文回退。

存档默认值在 `adventure_core.js`：`locale: 'zh-CN'`，`languageLearning: { enabled: false, native: 'zh-CN', target: 'en' }`。未知语言 id 会在 `normalizeLocaleSave` 里收回这些默认值。母语和目标语言相同则把目标改成另一种。

## 界面怎么接上

`view_adventure.js` 的 `el()` 把子节点里的字符串交给 `tr`，再写进文本节点。只有一个文本子节点时，中文原文记在 `data-zh`，语言学习的拖动翻译读的是这个原文，不是已经译过的画面文字。

Canvas 上的地名、卡名和卡面说明在绘制前调用 `tr`（`adventure_renderer.js`、`card_renderer.js`）。`setText(node, source)` 同时写 `data-zh` 和译后的 `textContent`。

新增一句要翻译的界面文字时：

1. 在视图里用 `el()`、`button()` 或 `setText()` 传入完整中文句子。不要在 `*_core.js` 里调用 `tr`。
2. 在 `data/adventure/locale/en.txt` 加一行 `中文||English`。键必须和源码里的字符串逐字相同。
3. 若已有日语或韩语文件，用 `scripts/diff_locale.mjs` 对一下缺行。

## 从源码找出缺句

扫描范围在 `.cursor/skills/locale-scan/scan-paths.json`。只扫清单里的文件和目录，不扫整个仓库。

```text
node scripts/scan_locale.mjs
```

报告三类：源码里有、`en.txt` 没有的静态句子；词典里有、源码里已找不到的键；带 `${}` 的动态句子。未接入模板查表的动态句子不能原样写入词典，应先用 `fill('完整句子 {count}', {count})` 翻译模板再填变量。居民名来自 `npc-catalog.json` 和 `chapter.json` 的 `npcs[].name`。当前任务对白包含 `quest-runtime.json`，副本剧情包含 `dungeon-journeys.json`；任务日志包含接取、交付 NPC 与目标名。世界地图仅扫描通用 UI，不扫描当地城市文化与地点内容；不扫描 teen 和历史待恢复剧本。

用法见技能 `locale-scan`。

### 增量补译

以后新增内容后统一翻译时，执行以下流程。先补英文，再以英文词典为基准补其他已支持的界面语言，保留旧译文；旧的全量覆盖式合并不用于增量补录：

```text
npm run locale:audit
npm run locale:prepare -- tmp/my-en-batches en
npm run locale:translate -- tmp/my-en-batches
npm run locale:merge -- tmp/my-en-batches
npm run locale:prepare -- tmp/my-other-batches others
npm run locale:translate -- tmp/my-other-batches
npm run locale:merge -- tmp/my-other-batches
npm run locale:check
```

批次目录每轮换新名称。`others` 读取扫描配置的 `languages`（目前 ja、ko）；原 `ja-ko` 参数兼容保留。英文未补齐时禁止准备其他语言。新增 `js/view_*.js` 自动扫描，实验室及调试视图排除；现有任务/剧情 JSON 新增数组内容自动纳入，新 JSON 文件需在 `.cursor/skills/locale-scan/scan-paths.json` 登记可见字段和祖先范围。不要扫描整个数据目录。例外按文件限定并记录原因。

自动翻译通过调用者环境设置 `HAQI_TRANSLATION_ENDPOINT`（现有提供方的完整 HTTPS chat-completions 地址）、`HAQI_TRANSLATION_API_KEY`、`HAQI_TRANSLATION_MODEL`；可选 `HAQI_TRANSLATION_WORKERS=1..4`，默认 2。复用本地提供方配置注入环境，不把凭据写入源码、命令示例或报告。脚本使用项目现有名字作为术语参考，支持流式响应。请求/校验失败不会合并词典，重跑同一批次会检查并保留已完成输出；连续失败则停下，修复配置或输出后再重跑。也可以沿用人工/既有 LLM 工具按 manifest 输出 JSON，再执行 merge。

`prepare` 生成待翻译输入及 manifest，须使用新目录。沿用已有 LLM 翻译流程将结果写入 manifest 对应输出；`merge` 对全部批次验证后才追加缺失条目，保留旧译文。校验包含逐行键名、非空译文、重复占位符数量和英文无汉字。独立的 `learning.*.txt` 课程模板不参与 UI 词典对齐。

统一报告写入 `tmp/locale-audit/latest.json`。`locale:check` 检查当前扫描范围缺译、全部语言对齐、占位符、空值和英文汉字；动态拼句和旧键是人工复查项，不自动删除旧译文。新增 UI 应使用 `tr`／`setText`／`fill`，扫描发现字符串不代表显示调用已接入翻译。多语言对话和 Canvas 仍需按改动做运行时检查。

世界地图常用城市名称单独登记在 `data/adventure/earth/common-names.json`（当前100个，上限100个），来源为游戏现用城市目录。全局扫描仅收录此名单的名称，不扩大到城市剧情、街道或整个城市数据目录。增减名单仍按先英文、再其他语言处理；上限和三语言覆盖由 `tests/locale_world_names.test.mjs` 检查。Canvas 标签及其碰撞测量使用相同译名，选中与传送保留原始城市对象、编号及坐标；未补译名称查表回退到原名称。

副本学习剧情按 `languageLearning.target` 显示和配音，按 `native` 显示释义；关闭学习时采用界面语言。缺少目标译文时仍可继续阅读，但不允许用回退中文进行错误语言的配音奖励。

## 测试

`tests/locale_core.test.mjs`：缺译文回退中文、最长 `|` 分隔、重复键保留第一次、对齐差异、语言对、存档默认值。`tests/locale_scan.test.mjs`：字符串提取、JSON 字段、缺句与残留键。

## 首屏启动顺序

`adventure_boot.js` 在加载游戏控制器和配置前，从上次账号活动角色、访客活动角色或访客旧存档仅读取语言偏好，优先加载所需词典。词典完成前加载卡片隐藏且无文字；完成后显示本地化 Logo 名称、Loading 与阶段进度，再启动游戏。中文无需请求词典；缺失词典沿用中文回退。该读取不代替后续存档校验，也不修改存档。


### 场景敌人标签（2026-09-25）

场景敌人标签将名称、数量和状态分别查表后组合，避免增加数量后使原有名称译文失效。单只只显示名称，多只追加已翻译的2只/3只/4只；待迁移状态独立翻译。island-encounters.json的monsters名称已纳入扫描，当前109个不同名称均有英文条目。

### 2026-09-25：卡牌效果模板与英文

card_description_core.js通过视图传入的translate回调，先翻译中文命名占位符模板，再填数值、目标和学系。en.txt已补齐当前生成的卡牌效果说明与相关效果标签；701张kids卡牌生成文本通过无中文残留检查。这些 `{amount}` 模板是运行时实际查表的键，与未接入模板查表的JavaScript `${}` 动态拼句不同。标题仍沿用现有卡名词典，不代表全部其他界面或卡名翻译完成。
