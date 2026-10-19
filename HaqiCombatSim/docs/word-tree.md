## 2026-10-19：新标记立即验证与奇豆兑换

标记已理解的字词可直接参与出题，不要求12个遇见词、3个标记或2段上下文；自评不伪造遇见次数。新标记绕过一分钟自动重试间隔，生成期间新增标记会补发准备请求；校验通过的果实同时可用，画面优先显示最新三颗。单词很少时允许一个内容词的新句。在线生成仍需登录和模型应答，离线或失败明确提示，不伪造题目。

继续要求两个不同句子、无提示首次连续答对才验证掌握。服务器 mastered.json 的 en/zh 清单只增不减；答错、自评降级或清除本机学习不会删除服务器资格。只有此次新加入服务器且成功应答的词可自动兑换50奇豆，服务器已有词不重新发奖。待兑换回执留在本机，领取记录 languageTreeClaims 随角色 records 分片保存，奇豆进入 battle 分片；本地领取失败可重试，重复回执不会重复增加奇豆。沿用单客户端写入约定，未新增跨客户端事务服务。

# 世界树 JS 类库

## 2026-10-19：四语词库与对话标记

`data/adventure/locale/word_zh.txt`、`word_en.txt`、`word_ja.txt`、`word_ko.txt` 各收录 2,000 个基础词条。中文单字和多字词共存；原有汉字故事、笔顺和完整学习卡继续保留，未提供完整课程的新词只展示词义与已遇见上下文。词汇数量不是语言精通认证。

- **按需加载**：`word_lexicon.js` 不在模块导入时请求数据。打开某语言词树或呈现所选学习语言的正文才加载该文件；双语对应只加载当前目标语言与母语。每种语言的请求 Promise、解析数据和索引共用内存缓存，并发打开只请求一次；失败移除缓存，之后可重试。不请求在线词典、不向浏览器添加第三方依赖。
- **格式**：UTF-8，一行 `原形||JSON`，JSON 含 `meaning`、`forms`、`senses`、可选 `pos`／`reading`。`#` 行保留来源和许可证。词义标识使用 WordNet 3.0 编号及项目校订编号，跨语种通过词义交集对应，不将同义词合成同一个学习节点。
- **匹配**：词形用 `Map`，连续文本用前缀树最长匹配，词义用倒排索引；不逐词遍历 2,000 条记录。原文位置、大小写和标点不变。`worried / worrying / worries → worry`；中日文优先长词；韩语检查词块边界并允许收录的助词尾缀，避免把“선물”里的“물”误作“水”。有歧义的词形不强行归并。
- **词树与正文共用**：四语页签、朗读、正文采集、状态及果实题词汇校验均使用同一索引。词库预置节点的遇见次数为零，正文仍需实际呈现 800ms 才计入遇见。英语词形、常见日语／韩语活用保存在数据中，运行时不猜词尾。
- **对话**：显现结束后自动本地匹配未掌握词；有可靠译文对应时连线，没有对应时仍能点击已收录词。点击任一侧对应词，标记的是目标语言词条，复用词树的三档选择。自评全掌握立即隐藏该原形所有变形的提示；降级后恢复。朗读按钮与词语按钮是兄弟节点，避免按钮嵌套。
- **模型只由按钮触发**：“模型补齐”保留原模型适配器和缓存，发送原文及已对应／已掌握词形的排除清单。补充结果必须保持原文位置、不覆盖本地配对，并再次过滤掌握状态；不自动写回静态词库。网络失败保留本地结果；关闭视图与身份切换使迟到结果失效。模型缓存不再自动覆盖本地匹配。
- **存储兼容**：保留英语原存储键及中文 `:zh`，新增 `:ja`、`:ko`。旧变形节点一次性归并，保留上下文、计数和最近显式标记；无时间信息时优先保守状态，不拼接不同词形的答题证据来制造掌握资格。只保留原来的中英验证掌握清单云同步，日韩及各语言自评标记仍只存本机。

### 来源与维护

基础词义来自 [Open Multilingual Wordnet](https://github.com/omwn/omw-data)，固定修订 `406bf83b3c507a3d1f26e88252d5d66893fd36bf`：英语 Princeton WordNet、中文 Chinese Open WordNet、日语 Japanese WordNet、韩语 Wiktionary 派生表。频率选词使用作者工具 wordfreq 3.1.1；不发布频率数值，不将词频当作学习等级。`word-overrides.json` 保存项目常用词、基础功能词与明确词形校订；`word-sources.json` 记录实际源文件哈希和条目／词形数。

`python scripts/prepare_word_lexicons.py` 可复现词库，作者环境需安装 wordfreq；源文件下载仅在准备阶段，缓存于 `tmp/word-lexicons/`。运行时不会执行该工具，也不会请求这些外部来源。韩语改编词表保留 CC BY-SA 3.0 标注；各语言附带对应源许可证及中文释义来源许可。发布时 `package_locale.mjs` 保留 `word_*.txt` 的许可证注释，普通句子翻译仍剥离来源注释。

这些是常用词选集，不是完整形态分析器。未收录的少见活用、词义歧义和意译不伪造对应，可显式请求模型补齐；词库的释义标签可继续按儿童阅读场景校订。

专项测试：`tests/word_lexicon.test.mjs`、`tests/battle_word_dialogue.test.mjs`，覆盖实际四语文件、按需缓存／重试、复杂度、最长匹配、词形冲突、迁移、模型触发边界、点击标记与身份失效。测试结果及已有失败见当日开发日志与 QA 记录。

唯一 UI 入口是 `js/word_tree.js` 导出的 `WordTree` 类。字典中英日韩页签直接调用此实现；没有 iframe、srcdoc、旧版渲染器或模式分流。类内部使用 Shadow DOM 隔离样式，不替换宿主 body，不接管宿主窗口。

## 使用

```js
import {WordTree} from './js/word_tree.js';

const tree = new WordTree(container, {
  key: learnerKey,
  getKey: () => currentLearnerKey,
  data: dictionary,              // {language: 'en' | 'zh' | 'ja' | 'ko', entries: [...]}
  index: loadedWordIndex,        // 可选；省略时按 data.language 加载并复用词库缓存
  store: localTreeStore,         // read(key), update(key, reducer)
  online: () => isLoggedIn,
  request: generateQuestions,    // 现有模型适配器 (messages, signal)
  onUnknown: openLearningCard,   // 接管成功返回 true，否则显示简要学习卡
  onMastery: syncMasteredWords,
  syncMastery: restoreAndRetryMastery,
});
await tree.ready;
await tree.refresh();            // 外部本地数据变化后重读
// 只读快照：tree.state / camera / hits / fruits / stats
// 切换页签、角色或移除容器时：
tree.dispose();                  // 可重复调用；初始化途中也可调用
```

容器需有明确宽高。类按需加载自己的 CSS 与词义补充数据，不引入第三方库。dispose 释放绘制、观察器、定时器、页面监听、语音、弹窗与异步请求；每个实例的画布、相机和学习会话独立。

## 当前行为

画面仅有一棵可旋转、缩放、平移的文字树。清晰词数随面积调整为 6～32；未知／不认识优先，五种状态按权重分配展示机会，缺少状态时补位。文字约 420ms 淡入、320ms 淡出。点击词不改变相机，必须选择理解程度；喇叭复用现有语音适配器。

灰色未知、蓝色不认识、绿色基本理解、金色自评全掌握、淡紫色已验证掌握。最后一种在树上隐藏翻译。不同新句连续两次无提示首次答对才验证掌握；答错降为基本理解并恢复翻译。果实是经过校验的句子三选一。

字典未知节点不虚报遇见。实际正文呈现满 800ms 才记入本机；不认识打开原有学习卡。服务器仅存各角色首次获得验证资格的中英文词清单，其余状态／上下文／答题证据仅在 IndexedDB。同步失败下次打开重试，重复自评和普通重开不写。详见 [用户存储](user-storage.md)。

## 模块边界

| 文件 | 职责 |
| --- | --- |
| `word_tree.js` | 唯一公开类；交互、弹窗、生命周期 |
| `view_word_tree.js` | 当前 Canvas 绘制与手势，类库内部模块 |
| `word_tree_layout_core.js` | 确定性树形、投影、标签分配、透明度；纯函数 |
| `word_tree_dictionary.js` | 字典直接挂载，连接原学习卡和掌握同步 |
| `word_lexicon.js` / `word_lexicon_core.js` | 按需文件缓存；纯词库解析、索引、最长匹配、迁移与双语对应 |
| `dialogue_word_learning.js` / `view_word_mark.js` | 对话学习状态适配器；共享三档标记控件 |
| `language_tree_core.js` / `language_tree_session.js` | 采集归并、状态、题目校验、学习会话 |
| `language_tree_capture.js` / `language_tree_store.js` | 实际呈现观察、本机存储 |
| `language_tree_dictionary_core.js` / `language_tree_gloss_core.js` | 字典适配、掌握清单和词义 |
| `language_tree_mastery_sync.js` / `language_tree_mastery_cloud.js` | 仅掌握词清单的同步与 SDK IO |

旧侧栏页、六叉导航、模拟遗忘曲线、600/1500/3000 专用页面及其旧测试脚本已删除。3000 节点布局仍由当前核心测试覆盖，不保留旧运行模式。独立 `WordTree.html` 已删除，也已从构建入口移除。模拟数据和交互夹具仅保留在 `tests/fixtures/`，不作为产品入口。

验证见 [实际验证报告](language-tree-validation.md)。
