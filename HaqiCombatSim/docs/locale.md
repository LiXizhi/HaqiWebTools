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
| `ja` | `data/adventure/locale/ja.txt`（可选，目前没有） | `ja-JP` |
| `ko` | `data/adventure/locale/ko.txt`（可选，目前没有） | `ko-KR` |

语言列表在 `js/locale_core.js` 的 `LOCALES`。日语和韩语已经在设置里，文件不存在时该语言的查表结果仍是中文。

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

语言学习关闭时，显示语言是存档的 `locale`。打开后，画面显示 `languageLearning.target`，母语只用于对照，不改界面。

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

报告三类：源码里有、`en.txt` 没有的静态句子；词典里有、源码里已找不到的键；带 `${}` 的动态句子。动态句子的运行时键是填好变量之后的整句，不要把模板写进词典。任务和目录 JSON 默认不扫。以后要纳入某个 JSON，在清单的 `json` 里写上路径和字段名。

用法见技能 `locale-scan`。

## 测试

`tests/locale_core.test.mjs`：缺译文回退中文、最长 `|` 分隔、重复键保留第一次、对齐差异、语言对、存档默认值。`tests/locale_scan.test.mjs`：字符串提取、JSON 字段、缺句与残留键。
