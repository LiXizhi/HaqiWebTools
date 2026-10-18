# 世界树 JS 类库

唯一 UI 入口是 `js/word_tree.js` 导出的 `WordTree` 类。字典中文／英文页签直接调用此实现；没有 iframe、srcdoc、旧版渲染器或模式分流。类内部使用 Shadow DOM 隔离样式，不替换宿主 body，不接管宿主窗口。

## 使用

```js
import {WordTree} from './js/word_tree.js';

const tree = new WordTree(container, {
  key: learnerKey,
  getKey: () => currentLearnerKey,
  data: dictionary,              // {language: 'en' | 'zh', entries: [...]}
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
| `language_tree_core.js` / `language_tree_session.js` | 采集归并、状态、题目校验、学习会话 |
| `language_tree_capture.js` / `language_tree_store.js` | 实际呈现观察、本机存储 |
| `language_tree_dictionary_core.js` / `language_tree_gloss_core.js` | 字典适配、掌握清单和词义 |
| `language_tree_mastery_sync.js` / `language_tree_mastery_cloud.js` | 仅掌握词清单的同步与 SDK IO |

旧侧栏页、六叉导航、模拟遗忘曲线、600/1500/3000 专用页面及其旧测试脚本已删除。3000 节点布局仍由当前核心测试覆盖，不保留旧运行模式。独立 `WordTree.html` 已删除，也已从构建入口移除。模拟数据和交互夹具仅保留在 `tests/fixtures/`，不作为产品入口。

验证见 [实际验证报告](language-tree-validation.md)。
