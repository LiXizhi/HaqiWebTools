# 汉字 H5 与父页面协议 v1（`haqi-hanzi`）

汉字互动故事（`hanzi/hanzi_*.html`）设计为可独立运行的单文件 H5 页面：
- **独立打开或嵌入外网其他产品**：当 `window.parent === window` 或父页面未实现本协议时，页面保持完整中文体验，不报错、不阻塞、不依赖外部运行时。
- **嵌入魔法哈奇（字源岛任务 & 汉字字典）**：通过 `window.parent.postMessage` 与宿主通信（宿主桥接模块为 [`js/hanzi_animation_bridge.js`](../js/hanzi_animation_bridge.js)），实现多语言字幕/UI 翻译与书写/完播任务结算。

## 1. 握手与安全校验

所有消息固定包含 `channel: 'haqi-hanzi'`、`version: 1`：

1. **子页面就绪（Child -> Parent）**
   ```json
   { "channel": "haqi-hanzi", "version": 1, "type": "ready" }
   ```
2. **父页面初始化（Parent -> Child）**
   ```json
   {
     "channel": "haqi-hanzi",
     "version": 1,
     "type": "init",
     "entryId": "hanzi-men",
     "sessionId": "hanzi-anim-1",
     "locale": "en",
     "subtitleLocale": "en"
   }
   ```
   - `locale`：宿主当前界面语言（`displayLanguage`，用于常用 UI 单语翻译）。
   - `subtitleLocale`：字幕辅助语言（用于字幕双语显示；若界面为中文但在字典/文字记忆中选择了外语学习，则 `locale` 为 `'zh-CN'`、`subtitleLocale` 为所选外语如 `'en'`）。
   - 父页面仅接收当前 `iframe.contentWindow` 且匹配预期 `origin` 的消息；子页面仅接收 `event.source === window.parent` 的消息（若存在 `document.referrer` 则同时校验 `event.origin`）。后续消息均携带同一 `entryId` 与 `sessionId`。

## 2. 多语言翻译（仅字幕双语同显，常用 UI 单语翻译）

1. **翻译请求（Child -> Parent）**
   ```json
   {
     "channel": "haqi-hanzi",
     "version": 1,
     "type": "translate",
     "entryId": "hanzi-men",
     "sessionId": "hanzi-anim-1",
     "requestId": "1",
     "texts": ["先有一扇门板。一扇，叫做户。", "开始", "重播"]
   }
   ```
2. **翻译响应（Parent -> Child）**
   ```json
   {
     "channel": "haqi-hanzi",
     "version": 1,
     "type": "translations",
     "entryId": "hanzi-men",
     "sessionId": "hanzi-anim-1",
     "requestId": "1",
     "locale": "en",
     "subtitleLocale": "en",
     "translations": {
       "先有一扇门板。一扇，叫做户。": "First comes a single door panel. One panel is called Hu."
     },
     "uiTranslations": {
       "开始": "Start",
       "重播": "Replay"
     }
   }
   ```
   - 父页面通过游戏本地多语言词典（`data/adventure/locale/en.txt`、`ja.txt`、`ko.txt`）查询译文，不调用外部模型，也不把缺失译文伪装成已翻译。
   - **字幕双语同显**：只有故事字幕（`#capText` / `h2#caption`）同时显示两种语言——主行保持中文原文，收到不同于中文的 `translations[zh]` 后在下方插入 `<span class="haqi-sub-trans">译文</span>`。
   - **常用 UI 单语显示**：按钮（`#start`、`#replay`、`#mute`、`#action`、`#demo`）、章节标题（`#capTitle` / `#chapter`）、进度栏（`#progress li`）、交互提示（`#hint`）与片头标签等根据 `locale`（`displayLanguage`）使用 `uiTranslations[zh]` 直接单语替换；当 `locale` 为中文或未收到译文时保持中文。

## 3. 完成书写（`written`）与故事完成（`completed`）通知

1. **完成书写（Child -> Parent）**
   ```json
   {
     "channel": "haqi-hanzi",
     "version": 1,
     "type": "written",
     "entryId": "hanzi-men",
     "sessionId": "hanzi-anim-1"
   }
   ```
   - 当用户在动画内完成描字/书写阶段（或如 `hanzi_guo.html` 完成楷体/简体书写阶段 `sceneJian`）时，调用 `window.haqiHanziWritten()` 发送 `type: 'written'`。
   - **字源岛（文字记忆）**与**汉字字典**收到 `type: 'written'` 后，立即将该字的书写练习判定为完成（触发写字完成结算与奖励）。

2. **故事尾声完成（Child -> Parent）**
   ```json
   {
     "channel": "haqi-hanzi",
     "version": 1,
     "type": "completed",
     "entryId": "hanzi-men",
     "sessionId": "hanzi-anim-1"
   }
   ```
   - 当动画真正到达结尾尾声（`sceneFinale` / `sFinale` / `finale`）时调用 `window.haqiHanziComplete()` 发送 `type: 'completed'`（若此前未发送 `written` 会自动先补发 `written`）。
   - 严禁在片头循环（`introPlay`）、加载、翻译或跳过时调用 `haqiHanziWritten()` 或 `haqiHanziComplete()`。

## 4. 本地映射与兼容性

- 仓库内 `hanzi/` 目录下的 8 个正式汉字动画（`门`、`休`、`森`、`光`、`国`、`雨`、`明`、`武`）均已完整接入本协议，并在 [`js/adventure_dictionary.js`](../js/adventure_dictionary.js) 的 `localAnimations` 中映射到本地 `hanzi/hanzi_<拼音>.html`。

- 2026-10-18新增23个单文件故事，补齐当前字源岛30字。新增URL集中于 `js/hanzi_story_animations.js`，由现有 `localAnimations` 合并；`wu` 词条现在正确指向 `hanzi_wu_dance.html`（舞），原 `hanzi_wu.html`（武）作为额外独立故事保留。规范笔画、离线运行、协议内联及作者源说明见[汉字独立动画](hanzi-stories.md)。

- 2026-10-24 「手」`hanzi/hanzi_shou.html` 按同一 `haqi-hanzi` v1 接入。四笔描红全部完成后才发送 `written`，只在余韵 `sFinale` 发送 `completed`。片头 `introPlay` 不发这两个事件。本地与 CDN 地址见 `js/hanzi_story_animations.js` 与 `js/adventure_dictionary.js`。

- 2026-10-24 「目」`hanzi/hanzi_mu_eye.html`（画龙点睛）按同一 `haqi-hanzi` v1 接入。五笔描红全部完成后才发送 `written`，只在余韵 `sFinale` 发送 `completed`。片头 `introPlay` 不发这两个事件。本地与 CDN 地址见 `js/hanzi_story_animations.js` 与 `js/adventure_dictionary.js`。
