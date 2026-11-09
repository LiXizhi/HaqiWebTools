# 2026-11 英语入门样板、日更发布与口语最短路径 · 执行方案

2026-11-09 整理。输入有三部分：

- DRI 下发的三条需求：前 30 分钟英语入门样板可玩闭环、日更发布流水线（隔离入口）、口语练习最短路径。
- QA bot 的复测报告《MagicHaqi 产品设计与 Bug 修改方案》（https://magichaqi-bug-77vx.pages.grok.bot/）。复测日期为 2026-11-04，测试对象是线上 `Haqi_v1.html`，共列出 77 条问题。
- 本地源码核对，截至 HaqiWebTools `main` 的 `ee09ff3`（2026-11-09）。

线上的 `official/apps/MagicHaqi/release/Haqi_v1.html` 只是一个包装页，加载的是本目录构建后上传到 CDN 的产物。所以下面所有改动都落在 `HaqiCombatSim/`；文中路径都相对于这个目录。

本文是执行方案，不代表已实现。凡写「已有」的能力都已在源码中核对过；写「待验」的必须经浏览器试玩确认，不能计为已上线。

---

## 0. 结论摘要

1. 现在已经有一条可串起来的英语新手路径：序章 → 建角 → 营地 → 第一次搭档（`We are friends.`）→ 字源岛找小灯（`Where is Xiaodeng?`）→ 新手小屋添灯（`Can I have a lamp?`）。但这条路径上有 **10 个阻断或伤信任的问题**（见 1.3）。这些问题修好之前，不建议拿给新用户录屏验收。
2. 日更发布可以直接用现有的 `uploadRelease.mjs --cdn-only`。这样每天产出一个按内容哈希命名的 CDN 入口，不覆盖正式 `Haqi_v1.html`，天然是隔离入口。需要补的是每日记录和 3 条冒烟清单，以及一条构建产物检查。L5 和 D1 都疑似只在构建后出现。
3. 口语路径的语音识别能力已经接入：`js/language_adventure_voice.js` 调用 Keepwork SDK 的 `startASR`。但第一次搭档这一段目前只能打字，判题也偏严（E18）。最短路径是：5 条任务都走「文字或语音 → 同一个判题函数」，识别不可用时明确降级为打字，不把未接通的语音写成已上线。
4. 有两项与新用户路径直接相关、必须本轮处理的「非功能」问题：
   - E16 合规：建角第 3 步就能看到「死亡」系。
   - V4/V8：正式版露出调试工具和 FPS。调试修改还会写入云端存档。

---

## 1. 需求一：前 30 分钟英语入门样板可玩闭环

### 1.1 目标与验收口径

| 项 | 口径 |
|---|---|
| 目标用户 | 成年人，母语为中文，目标语言为英语，零基础到入门 |
| 公开 URL | 按需求二每日产出的 CDN 入口；定版后再同步到正式 `Haqi_v1.html` |
| 核心验收 | 新用户从打开 URL 起 30 分钟内，**至少完成 1 个说话或线索任务**，且全程没有人讲解 |
| 证据 | 录屏，或逐步截图的步骤清单；写明版本号（CDN 哈希目录名）和 HaqiWebTools 发布 commit |
| 不计入通过 | 测试夹具、调试面板、直接调用业务函数、老账号存档（按 `docs/product-release-qa.md` 的「正式用户路径」） |

「说话或线索任务」在本轮限定为以下三条之一，均已有实现：

- **A 第一次搭档 · 英语路线：** 在莫尼处输入 `We are friends.` 或 `We're friends.`，接回咕噜噜（`js/opening_journey_core.js`、`js/view_opening_journey.js`，设计见 `docs/story/drafts/first-partner.md`）。
- **B 字源岛「让朋友找到你」第二幕：** 向溪禾问路，输入 `Where is Xiaodeng?` 或 `Do you know where Xiaodeng is?`，拿到找石伯的线索（`data/adventure/island-language-courses.json` 中的 `en-hanzi-01`，11-04 至 11-05 改版）。
- **C 新手小屋添灯：** 说或打 `Can I have a lamp?`（`js/home_starter_room_core.js`）。

### 1.2 样板路径与目标时间线

下表的时间是设计目标，需要用 3 到 5 名新用户实测校准。

| 时段 | 内容 | 现有实现 | 本轮要求 |
|---|---|---|---|
| 0–3 分钟 | 标题页选母语 / 第二语言 → 序章《失落的光》 | 无角色时自动播放；可「跳过本幕」 | 序章旁白「尝尝死亡系的魔法」改名（E16）；评估是否提供整段跳过（E14） |
| 3–6 分钟 | 建角：起名、选抱抱龙、选系别 | 原向导 | 系别改名（E16）；抱抱龙补一句用途说明（E15 最小版） |
| 6–15 分钟 | 营地：青龙 → 莫尼 → 选择战斗或英语 → 接回咕噜噜 → 带它打寒冰侦查兵 | 11-09 新增，仅英语目标角色触发 | 首个引导要醒目（E17）；移动教学不能「接了就领奖」（E21）；青龙对白中的人名统一（E20） |
| 15–25 分钟 | 字源岛：阿初问候 → 溪禾问路 → 找小灯 | 已有课程 | 问候接受同义句、答错保留输入（E18）；中途退出能继续练习（E26）；Esc 不关掉整课（E2） |
| 25–30 分钟 | 家园：新手小屋添灯，或回顾本次学会的句子 | 11-06 新增小屋；入口在家园 | 召唤输入框的提示跟随所选物件（E24）；宠物背包有空态说明（E23） |

整段都只突出一个当前目标：`view_adventure.js` 在样板期间已经有单目标显示；其余 HUD 降噪见 Art-HUD-NoviceWeight，放到下一轮。

### 1.3 样板路径上必须先修的问题

下列问题都在新用户 30 分钟内会碰到，按处理顺序排列。

| 优先 | 编号 | 问题 | 修改位置 | 工作量 |
|---|---|---|---|---|
| 1 | E16 | 「死亡」系过不了审：建角第 3 步、确认按钮、序章旁白、技能名都会出现 | 本轮先改玩家可见部分：`js/view_adventure.js:220,246`、`data/prologue/script.json:49`、技能名数据；把系别名表收拢到一个模块（现在约 15 份副本） | M（全量为 L） |
| 2 | V4/V8 | 正式版能看到调试工具和 FPS；调试修改会经 `applyDebug` 写入云端 | 新增发行开关（利用 `__HAQI_PACKED_DATA__`，或 `?debug`），隐藏 `view_adventure_settings.js:147`、`view_adventure.js:400` 的连点入口、`adventure_renderer.js:644` 和 `view_home.js:320` | S |
| 3 | E20 | 青龙说「苏苏、莫卡」，手记和实际 NPC 是「茜茜、莫尼」 | `config/opening-dialogue.json:25,28`，改后重新导出，补齐 en/ja/ko 翻译；不能全局替换（苏苏、莫卡在别处是其他 NPC） | S |
| 4 | E21 | 移动教学接了就能领奖 | 63000 的 `goals` 为空（`data/adventure/chapter.json:2236`）。本轮先改对白（S）；加真实操作目标需要产品确认（M） | S/M |
| 5 | E18 | `Hi, Achu!` 被拒绝并清空输入；答案无关和句型差一点得到同一条提示 | `view_learning_chat.js:70` 不再在判题前清空；`language_course_core.js:25` 增加「接受 / 接近 / 无关」三档反馈；替代答案允许自带 `words` | M |
| 6 | E2 | 输入框聚焦时按 Esc 会关掉整课，进度丢失 | `view_learning_chat.js:96` 中 Esc 分层处理：先收起输入，有进度时先确认；`language_story.js` 关闭时暂存进度 | S–M |
| 7 | E3 | 关掉语言课后会被附近的怪拉进战斗 | 有面板或课程时，野怪停止追击（`adventure_renderer.js:363`）；关闭时重置自动交互（`adventure_app.js:1775`）。需要跑 `npm run test:battle` | M |
| 8 | E26 | 中途退出后要重看 3 屏对白 | 记录对白已看（`island_language_course.js:52-64`）；任务面板和追踪栏改为「继续练习」 | M |
| 9 | E1 | 追踪栏与手记状态不一致；换岛会悄悄替换追踪任务 | `view_adventure.js:347` 按状态显示文案；`adventure_catalog_quests_core.js:257-273` 不再把过滤后的名单写回存档 | M |
| 10 | E17 | 第一个引导只在右上角，不容易发现 | 进营地时自动打开一次第一次搭档的对白，或在画面中部显示提示 | S–M |

随手修（各 S）：E24 提示句、E23 宠物背包空态、M5 语言课写死显示中文（`island_language_course.js:47`）、E27「输入」改为「打字回答」、B5「签到」改为「在线奖励」、E6「宠物家园」改名、E11 副标题用区域名、家园时间本地化。

E19、E22 在本地已修（11-05 提交 `700d71b`），随下一次发布生效。发布后在样板录屏中顺带复核。

### 1.4 分工建议

- **谭雯文（牵头）：**
  - 整理样板任务清单和验收口径（本节 1.1 和 1.2 可作初稿）。
  - 产品拍板 2.1 中的决策项。
  - 组织 3 到 5 名新用户、不讲解地试玩，汇总卡点。
- **黄伟强、彭彬彬：**
  - 场景落地：1.3 的 1 至 10 项按顺序认领；建议一人负责「建角、合规、发行开关、追踪」，一人负责「语言课、判题、Esc、继续练习」。
  - 每次合入后走需求二的日更入口。
- **交付物：**
  - 公开可点 URL。
  - 1 份录屏或步骤清单，写明「从打开到完成 A、B 或 C 的用时」。
  - 版本号（CDN 哈希目录名）和 HaqiWebTools commit。
  - 在 `docs/qa-reports/` 记一份报告，`docs/qa-report.md` 追加索引。

---

## 2. 需求二：日更发布流水线（隔离入口）

### 2.1 现有链路

- `npm run upload`：构建 → 按白名单暂存 → 上传到 `https://cdn.keepwork.com/haqi/haqicombatsim/release/<hash>/` → 逐文件核验 → 生成 `release/Haqi_v1.html` → 同步到 apps 仓库并推送（即现在的「release: update Haqi entry wrappers」提交）→ 复制到 Maisi。详见 `docs/deployment.md`。
- `uploadRelease.mjs` 已经支持 `--cdn-only`：只上传并核验 CDN，**不同步 apps 和 Keepwork 正式入口，不提交、不推送 Git**。核验通过后输出可直接访问的 `.../release/<hash>/Haqi.html`。

### 2.2 日更方案

1. **隔离入口：** 每日包统一用 `npm run upload -- --cdn-only`。当天入口就是输出的 `https://cdn.keepwork.com/haqi/haqicombatsim/release/<hash>/Haqi.html`，正式 `Haqi_v1.html` 不受影响。只有样板定版、核心档 QA 通过后，才用不带参数的 `npm run upload` 更新正式入口。
2. **发布前固定检查（构建机执行）：**
   - `npm run test:battle`（战斗相关回归，AGENTS 硬性要求）。
   - 与当天改动相关的定向 Node 测试。
   - **构建产物检查（新增）：** `dist/` 中不能出现以 `data:` 地址作为基准的 `new URL(...)`，也不能出现 `word_tree` 的样式被内联成 `data:text/css`。这一条对应 L5「时光长卷 Failed to construct URL」和 D1「语言树样式加载失败」，两者都疑似只在构建后出现。建议写成 `scripts/check_release_payload.mjs`，接在 `plan:release` 之后。
3. **冒烟 3 条（发布后，用真实输入在当天入口执行，约 10 分钟）：**

   | # | 步骤 | 通过标准 |
   |---|---|---|
   | S1 | 新访客打开当天入口，跳过序章，建一个英语目标角色并进入营地 | 无报错弹窗；无调试工具和 FPS；系别名合规 |
   | S2 | 完成第一次搭档英语路线：输入 `We are friends.` 接回咕噜噜 | 咕噜噜可以入队；答错时有明确提示 |
   | S3 | 刷新页面后重进 | 角色、咕噜噜和第一次搭档的进度都保留 |

   这 3 条是 `haqi-release-qa` 简单档的子集，不代替发布前的核心档或全部档。
4. **每日记录：** 在 `docs/qa-reports/daily_YYYY-MM-DD.md` 写当天入口 URL、CDN 哈希、commit、S1–S3 的结果（通过 / 失败 / 阻塞）、耗时和视口。当天不发布时写明原因，例如「无合入」或「test:battle 失败：…」。`docs/qa-report.md` 只追加一行索引。

### 2.3 分工与验收

- **发布权限同事：** 负责每日包，执行 2.2 的第 1、2 步，并写记录中的入口与版本部分。上传凭据仍走既有 `qiniu.yaml` 流程，不进入仓库。
- **冒烟同事：** 执行 S1–S3，写结果部分。
- **验收：** 每个工作日至少 1 个可访问入口，或写明不发布的原因；每份记录都有 3 条冒烟结果。

### 2.4 本轮要一起修的发布相关问题

- **L5：** `js/adventure_time_scroll.js:11` 的基准改为 `document.baseURI`，或改成和 `runtime_data.js` 一样走页面相对路径。`js/hanzi_memory_art.js:8`、`js/view_home_body_parts.js:16` 用了同样的写法，一并检查。
- **D1：** 样式加载失败时不要整页空白（`js/word_tree.js:30,73`）。根本原因用当天构建产物确认，再决定是否关闭 CSS 内联。
- **V4/V8：** 发行开关依赖构建期常量，日更包要实际看一遍入口确认已隐藏。

---

## 3. 需求三：口语练习最短路径

### 3.1 已有能力

| 能力 | 位置 | 状态 |
|---|---|---|
| 语音识别 | `js/language_adventure_voice.js` 调用 Keepwork SDK 的 `startASR` / `finishASR`；SDK 版本不支持时报「当前Keepwork版本尚未提供语音识别」 | 已接入营地故事、岛屿课程等学习对话；**第一次搭档英语路线尚未接入**，只能打字 |
| 麦克风交互 | `js/view_dialogue_microphone.js`（按住说 / 点按录制 / 滑出取消） | 已有，手势说明混杂（E27） |
| 判题 | `js/language_course_core.js:25` 的 `courseAcceptedAnswer`，已容忍大小写和标点 | 不接受同义句和拼写错误；不区分答错的类型（E18） |
| 示范音频 | 各场景的「听示范」 | 已有 |
| 练习计数 | WordTree 本地记录，同一词 10 次有效练习标为「基本理解」 | 规则见 `docs/word-tree.md`，新入口必须沿用 |

### 3.2 5 条任务（内容侧定稿用的初稿）

优先选用已有场景，不另开新地图，以降低本轮风险。

| # | 场景 | 目标句（及接受的变体） | 线索或结果 | 现状 |
|---|---|---|---|---|
| T1 | 营地 · 莫尼（第一次搭档） | `We are friends.` / `We're friends.` | 接回咕噜噜 | 仅打字，需接入语音 |
| T2 | 字源岛 · 阿初问候 | `Hello, Achu!` / `Hi, Achu!` | 进入下一幕 | 需修 E18 后才接受 Hi |
| T3 | 字源岛 · 溪禾问路 | `Where is Xiaodeng?` / `Do you know where Xiaodeng is?` | 拿到小灯线索 | 已有（11-04 改版），待发布 |
| T4 | 新手小屋 · 添灯 | `Can I have a lamp?` / `Can I have a bedside lamp?` | 灯出现并点亮 | 已有，记录 `lamp` |
| T5 | 火鸟 · 火百灵 | `Stop! Be careful.` | 火百灵停下，任务推进 | 已有，需修 E2（Esc 关整课）和 E3（关课后开战） |

内容侧每条任务交付：中文情境一句、NPC 台词（中英）、目标句和可接受变体、两条典型错误及对应提示、示范音频需求。

### 3.3 工程最小闭环

1. **同一判题入口：** 打字和识别结果都交给同一个判题函数，返回「接受 / 接近 / 无关」三档。答错时保留原输入，「接近」给出差在哪里，「无关」提示本关要说什么。这一项与 E18 是同一处修改。
2. **T1 接入语音：** `view_opening_journey.js` 复用 `view_dialogue_microphone.js` 和 `language_adventure_voice.js`。识别文本回填到输入框，由玩家确认后提交。练习记录沿用现有回执，同一次提交只计一次。
3. **诚实降级：** 浏览器拒绝麦克风权限、SDK 不支持 ASR 或识别出错时，明确提示「语音暂时不可用，可以打字回答」，并展开输入框。界面和记录里都不能把这种情况记作「说话完成」。
4. **入口文案：** 「输入」改为「打字回答」；首次只教「点一下开始说，再点一下结束」，其他手势放进帮助（E27）。
5. **进度：** 中途退出后可以从练习节点继续（E26）；Esc 只关当前层（E2）。

### 3.4 验收

- 在测试号上 5 条任务都能完成。每条分别记录「打字通过」和「语音通过」；语音未验证的写「仅打字」，不写成已上线。
- 每条至少验证一次答错：提示明确，输入保留，不会误判为通过。
- 识别失败、拒绝权限两种情况都能降级到打字。
- 相关测试一并更新：`tests/battle_language_courses.test.mjs`、`tests/language_courses_browser.test.mjs`、`tests/learning_chat_ui.test.mjs`、`tests/battle_opening_journey.test.mjs`。约 30 个浏览器测试按按钮名「输入」定位，改名时要同步修改。

---

## 4. 其余 bug 的归属

除第 1.3 节外，报告中的其他问题按下表处理，不阻塞本轮三项需求。

| 归属 | 编号 | 说明 |
|---|---|---|
| 本轮顺手（S，新用户可能碰到） | L10/B15 商城确认、L1 私聊禁用输入框、B1/B8 已登录状态、E4 踢线提示与中文错误、E8 会员经验列、L12 加好友文案、E5 捕鱼网说明、E28 联网文案、M1 漩涡先选中再传送、M3 地图高亮、E12 原生 `confirm` 改游戏内弹窗 | 都是单文件或文案改动，位置见第 5 节 |
| 下一迭代 | L2/V1/L9 副本剧情、L8/E7 副本列表、L3/L4/V5 现实城市追踪栏、L7 卡组编辑器、E10 手牌单词卡比例、E13 词块遮挡、E25 愿望气泡、L6 free-talk、B2 会员到期日（需真实 SDK 字段） | 不在 30 分钟样板路径上 |
| 需产品决策 | B4/M2/M4 等级硬锁还是只提示（现为有意设计）、E14 年龄段问卷与序章整段跳过、E15 抱抱龙获得剧情、E21 真实操作目标、E10 单词卡比例、E16 替代名 | 见第 6 节 |
| 需浏览器复现 | E9 城市标签重叠、L4 华强北 NPC 无对白、E3 名牌截断与血量跳动、E11 登录闪帧、B11 `enUS` 404（源码中找不到这个请求） | 复现后再定修法 |
| 美术管线 | V2、V3、V6、V7、Art-* | 另行排期，不与功能修复混在一起 |

---

## 5. 修改位置速查

| 编号 | 位置 |
|---|---|
| E16 | `js/adventure_core.js:56`（`SCHOOL_NAMES`）及约 14 份副本；`js/view_adventure.js:103,220,246`；`data/prologue/script.json:49`；`data/kids/card_names.json`、`data/adventure/spell-effects.json`；`data/adventure/locale/{en,ja,ko}.txt` |
| V4/V8 | `js/view_adventure_settings.js:147-150`；`js/view_adventure.js:400-405`；`js/adventure_app.js:588`；`js/adventure_renderer.js:644-649`；`js/view_home.js:320-323` |
| E18 | `js/language_course_core.js:16-25`；`js/view_learning_chat.js:70`；`js/island_language_course.js:32,38`；`data/adventure/island-language-courses.json:810-830` |
| E2 | `js/view_learning_chat.js:96-97`；`js/language_story.js:12,20` |
| E3 | `js/adventure_renderer.js:363`；`js/adventure_app.js:1621,1775`；`js/adventure_core.js:339-352` |
| E1 | `js/view_adventure.js:347-352,481`；`js/language_quest_core.js:16-28`；`js/adventure_catalog_quests_core.js:190-273` |
| E20 | `config/opening-dialogue.json:25,28` → `data/adventure/chapter.json`、`quest-journal.json` |
| E21 | `data/adventure/chapter.json:2236-2251`；`js/adventure_core.js:87-89,452` |
| E26 | `js/island_language_course.js:52-64`；`js/view_language_scene_intro.js:7` |
| E24 | `js/view_home.js:722` |
| L5 | `js/adventure_time_scroll.js:11` |
| D1 | `js/word_tree.js:30-31,73`；`js/word_tree_dictionary.js:18` |
| M1/M3 | `js/view_haqi_atlas.js:132-139,173,217`；`js/adventure_app.js:176` |
| E12 | 原生 `confirm` 调用：`js/adventure_app.js:1148,1174`、`js/home_app.js:607,636`、`js/view_adventure_quests.js:49`、`js/view_adventure_equipment.js:111,255`、`js/view_adventure_roles.js:77`、`js/view_adventure_settings.js:46` |
| L10/B15 | `js/view_adventure_shop.js:113-150` |

---

## 6. 需要拍板的事项

1. E16 的替代系别名（候选：暗影、幽冥、虚空），以及技能名「蝠王吸魂 / 天魔杀星 / 祭献」是否一并替换。
2. E18 阿初这一关是练「意思对就行」，还是练「指定句型」。它决定同义句是直接通过，还是提示「本关练习 Hello…」。
3. E21 移动教学是只改对白，还是加一个「走到某处 / 和某人交谈」的真实目标。
4. 样板验收用的「说话或线索任务」是否接受「仅打字通过」，还是必须语音通过。建议本轮接受打字，并把语音单独记录。
5. B4 等级不足时是硬锁还是只提示。本轮样板不经过高等级岛，可以延后决定。

## 7. 风险

- 第一次搭档只对英语目标、母语非英语的新角色生效。老账号无法验证，录屏必须用新号。
- 语音识别依赖 Keepwork SDK 版本和浏览器权限，不同设备结果可能不一样。验收记录要写明设备和浏览器。
- E16 涉及的翻译文件以中文原文作键，改名后对应的英、日、韩条目会失效，需要跑 `locale:check`。
- 日更只上传 CDN，不更新正式入口。对外宣传或给新用户的链接要用当天的 CDN 地址，或者等定版后的正式入口。
