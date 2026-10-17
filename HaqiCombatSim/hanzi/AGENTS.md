# AGENTS.md — `web/HaqiCombatSim/hanzi/`

本目录存放面向儿童与跨产品复用的汉字互动故事页（`hanzi_<拼音>.html`）。每个汉字动画既可以**独立打开或嵌入外网多个产品播放**，也可以通过统一的 `window.parent.postMessage` 协议无缝接入游戏内的**字源岛任务（文字记忆）**与**汉字字典**。

当前正式页面：门（`hanzi_men.html`）、休（`hanzi_xiu.html`）、森（`hanzi_sen.html`）、光（`hanzi_guang.html`）、国（`hanzi_guo.html`）、雨（`hanzi_yu.html`）、明（`hanzi_ming.html`）、武（`hanzi_wu.html`）。在线入口：[hanzi_index.html](./hanzi_index.html)（`<https://cdn.keepwork.com/keepwork/cdn/hanzi/hanzi_index.html>`）。

---

## 一、`window.parent.postMessage` 基础约束（Haqi H5 Protocol v1）

所有当前及未来新增的 `hanzi_*.html` 必须在 `<head>` 中内联标准协议脚本，并遵守以下硬性约束（详细规范见 [../docs/hanzi-animation-protocol.md](../docs/hanzi-animation-protocol.md)）：

### 1. 独立运行与多产品复用无感回退
- 当 `window.parent === window`（直接打开页面）或父窗口未响应 `init`（部署在外网其他产品或静态站点）时，页面**不得抛错、不得阻塞动画或等待超时**，默认使用中文文案正常播放与交互。
- 严禁在片头循环（`introPlay`）或初始化阶段提前触发 `haqiHanziWritten()` 或 `haqiHanziComplete()`。

### 2. 消息信封与安全校验
- 所有消息固定包含 `channel: 'haqi-hanzi'` 与 `version: 1`。
- 页面加载时若 `parent !== window`，发送 `{ channel: 'haqi-hanzi', version: 1, type: 'ready' }`。
- 仅接受 `event.source === parent` 的消息；收到 `type: 'init'`（含 `entryId`、`sessionId`、`locale`、`subtitleLocale`）时，若 `document.referrer` 存在则校验 `event.origin === new URL(document.referrer).origin`，绑定上下文 `{ ...m, origin: event.origin }`。
- 后续所有发送给 `parent` 的消息均携带绑定的 `entryId` 与 `sessionId`，并以 `context.origin` 作为 `targetOrigin`。

### 3. 生命周期事件：`written`（完成书写）与 `completed`（故事结束）
- **`window.haqiHanziWritten()` -> `{ type: 'written' }`**：
  - 在用户（或笔画演示）**刚完成动画内的描字/书写环节**时立即调用（例如 `sceneTrace` / `sWrite` / `finishStroke` 全部笔画完成时；若某字为自动书写演示如 `hanzi_guo.html` 的 `sceneJian`，则在演示书写完成时调用）。
  - 字源岛任务与汉字字典收到 `type: 'written'` 后，立即将该字的书写练习计为已完成并发放书写奖励。
- **`window.haqiHanziComplete()` -> `{ type: 'completed' }`**：
  - 在动画真正进入尾声结算（`sceneFinale` / `sFinale` / `finale`）时调用。
  - 若此前尚未触发 `written`，`haqiHanziComplete()` 会先补发一次 `written` 再发送 `completed`。
  - 若 `init` 晚于 `written` 或 `completed` 到达，收到 `init` 时自动补发已触发的状态。

### 4. 多语言规则：仅字幕双语同显，常用 UI 按 `displayLanguage` 单语翻译
- 父窗口在 `init` 中传入：
  - `locale`：当前界面显示语言（`displayLanguage`，如 `'zh-CN'`、`'en'`、`'ja'`、`'ko'`）。
  - `subtitleLocale`：字幕辅助语言（若界面为非中文则等于 `locale`；若界面为中文但在游戏字典/文字记忆中选择了外语对照，则为所选外语如 `'en'`）。
- 动画发送 `{ type: 'translate', requestId, texts }` 请求翻译，父窗口回复 `{ type: 'translations', requestId, locale, subtitleLocale, translations, uiTranslations }`：
  - **只有字幕（`#capText` / `h2#caption`）是两种语言一起显示的**：主行始终保留中文原文（以配合汉字字形与笔墨动画），当 `subtitleLocale` 为非中文且存在有效译文时，在字幕下方渲染 `<span class="haqi-sub-trans">译文</span>`。使用 `window.haqiHanziCaption(containerEl, zhText)` 渲染。
  - **常用 UI 与提示按 `displayLanguage`（`locale`）单语显示**：按钮（`#start`、`#replay`、`#mute`、`#action`、`#demo`）、章节标题（`#capTitle` / `#chapter`）、进度条（`#progress li`）、交互提示（`#hint`）、片头说明等通过 `scanStatic()` 自动扫描或调用 `window.haqiHanziUi(zhText, element)`，当 `locale` 为非中文且有译文时直接替换为目标语言，否则显示中文。
- 新增故事的所有字幕与 UI 中文文案须同步补充到 `data/adventure/locale/en.txt`、`ja.txt`、`ko.txt`。

---

## 二、先定故事，再定技术

- 核对汉字的读音、含义、部件和笔顺。真实字源、教学约定和艺术化想象要分清；画面隐喻不能冒充文字学事实。
- 用一句话写清本字的情感和动作主题，再安排「引子 → 探索 → 变化 → 成字 → 亲手写字 → 余韵」六段分镜。每一段都让孩子看见或完成一个变化，避免连续播放很久却没有参与点。
- 让物件、人物和动作逐步组成字的结构。成字转场应当是故事的结果，不能在最后突然叠上一张汉字图片。
- 页面标题、拼音、提示、旁白和结尾都服务于同一个字。用户可见文案使用简短、自然的中文，不堆百科知识，不使用 emoji。
- 先画出桌面宽屏和手机竖屏的构图草图，再选择 Canvas 2D 或 3D。技术应服务于字形和叙事；简单、清楚的 2D 比勉强加入 3D 更合适。

## 三、2D 与 3D 动画指南

- **2D 动画参考**：[hanzi_guang.html](./hanzi_guang.html) 与 [hanzi_men.html](./hanzi_men.html)。
  - 为每个字建立独立的色彩、光源、材质和构图语言。背景、主体、笔画和提示要有清楚的前后层级，缩小到手机宽度仍能认出关键形状。
  - 需要描字时，显示正确笔顺、起止点和可见轨迹。拖动过程中给出即时反馈，偏离时允许温和纠正或重试，不要因一次失误卡死故事。
- **3D 动画参考**：[hanzi_sen.html](./hanzi_sen.html)。
  - 只有当空间、景深、环绕或镜头运动能解释字义时才使用 3D。
  - Three.js 必须使用已核验的 Keepwork CDN ES module：`https://cdn.keepwork.com/keepwork/cdn/vendor/three/three.module.js`。不得从其他公共 CDN 引入。
  - 提供 WebGL 不可用或初始化失败的 2D 回退，回退后仍可完成所有故事步骤和描字任务。

## 四、互动、声音、字幕与可访问性

- 至少设计一个真正推动故事的操作（点击、拖动、长按或按笔顺描字），同一动作支持触控、鼠标和键盘。
- 开场提供「开始」按钮由用户手势启动音频；提供静音切换按钮（`#mute`），切换时调用 `window.haqiHanziUi(zh, btn)` 保持多语言同步。
- 桌面宽屏、平板、手机竖屏和手机横屏都必须完整显示主角、笔画、提示、字幕、按钮和触控目标，使用 `env(safe-area-inset-*)` 处理安全区域，尊重 `prefers-reduced-motion`。

## 五、新增或更新故事的流程

1. 在本目录编写或更新 `hanzi_<拼音>.html`，接入 `<head>` 中的 Haqi H5 Protocol v1 脚本，在描字完成处调用 `window.haqiHanziWritten?.()`，在尾声完成处调用 `window.haqiHanziComplete()`，字幕与动态 UI 分别接入 `haqiHanziCaption` / `haqiHanziUi`。
2. 如该字用于游戏字典或字源岛任务，在 `js/adventure_dictionary.js` 的 `localAnimations` 中登记本地路径映射，并在 `data/adventure/locale/en.txt`、`ja.txt`、`ko.txt` 中补齐新增字幕与 UI 词条。
3. 在 [hanzi_index.html](./hanzi_index.html) 的 `<nav class="list">` 中加入或更新入口。
4. 本地验证：独立打开页面验证开场、互动、描字、重播；在游戏字典与字源岛中验证 `ready -> init -> translate -> written -> completed` 消息流、双语字幕与单语 UI 切换；运行 `npm run test:battle` 与 `npm run locale:check`。
5. 需要发布到 CDN 时，按 [AGENT.md](./AGENT.md) 中的七牛上传流程显式指定 `--prefix keepwork/cdn/hanzi/` 上传（除非用户明确要求，平时修改不自动上传）。
