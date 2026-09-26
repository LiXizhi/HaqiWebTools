# 冒险 GUI 风格与组件规范

适用于 `Haqi.html`、冒险弹窗及场景预览页。新增或修改界面前先读本页；模拟器和美术调试工具可以保留工具型布局，但应遵守语义、可访问性和组件复用原则。

## 风格来源与修改位置

游戏使用经典魔法绘本风格：纸色内容面板、金棕边框、绿色主操作。优先复用已有资源，避免同一操作出现文字叉号、不同大小图标和不同皮肤。

| 内容 | 唯一维护入口 |
| --- | --- |
| 基础布局、模态窗口结构 | `css/adventure.css` |
| 绘本颜色、图集图标、主次按钮、共享页签状态、共享关闭按钮尺寸 | `css/adventure_storybook.css` |
| 美术来源、裁剪和永久 CDN | `data/adventure/ui-art.json`、`js/adventure_ui_art.js` |
| 共享关闭按钮 DOM 与事件 | `js/view_adventure_controls.js` |
| 地图窗口布局 | `js/view_adventure_maps.js`、`css/adventure_world_map.css` |

颜色优先使用 `--ink`、`--muted`、`--paper`、`--gold`、`--line`、`--green`。新增窗口只定义自己的布局；共享按钮尺寸、图标和状态必须改共享规则，不能在每个窗口尾部追加覆盖规则来修补。

## 关闭按钮：必须复用组件

```js
import {createCloseButton} from './view_adventure_controls.js';

header.append(title, createCloseButton(callbacks.close));
// 子窗口用明确的无障碍名称，视觉仍保持一致。
header.append(createCloseButton(closeDetails, '关闭物品详情'));
```

- 统一使用图集中的金边绿色关闭图标；点击区域为 **48×48 CSS 像素**，可见图标 **40×40**，手机与桌面一致。
- 尺寸参数为 `--gui-close-hit-size` 和 `--gui-close-icon-size`；全局变更在共享样式中处理，不对单个窗口缩小点击区域。
- 不直接创建 `button('×', ...)`，不以普通“关闭”文字按钮替代窗口角落的关闭图标，不复制 SVG 或图集坐标。
- 组件提供 `type="button"`、中文 `aria-label`、悬浮说明、装饰图标的 `aria-hidden` 和清晰焦点轮廓。图集未加载时自动显示同尺寸 SVG 叉号。
- 放在标题行最右侧，不压缩、不遮挡标题、不放在裁切区域之外。卡牌浮层可用 `extraClass='bag-preview-close'` 控制位置，但保持同一图标和尺寸。
- 视图只传入关闭回调，不在共享组件中修改存档、提交表单或触发业务动作。
- 关闭当前层，不意外退出父层；原生 `dialog` 关闭后恢复触发按钮焦点。顶层弹窗继续沿用控制器的 Escape 与游戏画布焦点处理。关闭图标不能替代保存/确认。

当前已接入：通用面板、NPC对话、当前岛屿地图、世界地图、云存档、卡牌预览、物品详情、宠物详情、教学伙伴窗口。

## 标题、正文与按钮

- 一个窗口只保留一个主标题。主要内容已经表达的信息，不再在摘要、介绍、底栏反复显示。
- 标题左对齐；与标题紧密相关的视图切换放在标题右侧同排，关闭图标放最右侧。长文案在390px宽度核验，不能将关闭按钮推出窗口。
- 内容滚动放在 `.modal-body`，标题和关闭按钮保持可见。避免整个页面横向溢出；需要横向查看的世界地图只允许自身视口滚动。
- `.primary` 表示主要操作，`.secondary` 表示切换或次要操作；禁用状态使用原生 `disabled` 并说明原因，不只依赖变灰。
- 按钮说明实际动作，如“打开世界地图”“返回当前岛屿地图”。相同动作在不同入口保持用词一致。
- 动作可一步完成时，不额外引入选中后再确认的步骤；涉及删除或不可逆覆盖则遵循该操作本身的确认规则。
- 可点击地图地名用真实 DOM 按钮覆盖在图上，不只在 Canvas 中绘制文字，保证鼠标、触屏与键盘均可操作。
- 地图遵循当前约定：岛名或地标一次点击传送，保留战斗状态检查；岛屿不按等级锁定，低于建议等级时提示“那里很危险，确定还要前往吗？”，达到等级直接前往；不重复显示用户等级、位置摘要、任务追踪或底部世界地图入口。

## 页签与分类筛选（2026-09-20）

统一样式维护在 `css/adventure_storybook.css` 的 Shared tabs 段。主分类和二级分类使用相同的选中语言，页面CSS仅负责排列、间距和尺寸，不再自行定义选中底色或边框。

- 未选中：浅纸色底 `#fff3d4`、棕色文字、细金棕边框。
- 当前选中：深绿色实底 `#244f3b`、浅色文字 `#fff8df`、底部4px金色标记 `#f4ca69` 与加粗文字。不能只改文字颜色或使用一圈细边框表达选中。
- 悬停只加深未选中项，不能覆盖选中底色；键盘 `:focus-visible` 使用独立的3px外框。选中与焦点可以同时辨认，切换不改变尺寸、不挤压标题或关闭按钮。
- 页签不使用通用 `.secondary::before` 的奶油色图集填充，避免它遮盖选中底色；样式不依赖图片，图集加载失败仍可区分状态。系统强制颜色模式补充内框与下划线。
- 现有接入范围：商城两级分类、背包分类和装备部位、卡包方案和学系、宠物详情、强化部位、镶嵌步骤和分类。不要对全局所有 `[aria-pressed=true]` 着色，物品格、卡牌选中、声音开关另有含义。
- 新页签容器添加 `.gui-tabs`，按钮同步 `aria-pressed="true/false"`；已有完整ARIA tabs键盘模式的组件可以使用 `aria-selected`。未实现完整键盘模式时不要仅为样式添加 `role="tab"`。
- 统一颜色变量为 `--gui-tab-idle`、`--gui-tab-ink`、`--gui-tab-border`、`--gui-tab-selected`、`--gui-tab-selected-ink`、`--gui-tab-marker`；调整在公共入口完成，不在各窗口覆盖。

核验入口：`tests/fixtures/tabs.html?panel=shop`，panel还可选 inventory、deck、pet、upgrade、gems、map；`&noatlas` 模拟未启用图集皮肤。验收页仅用内存角色，禁止写玩家存档。检查两级切换、鼠标移开后仍清晰、Tab焦点、桌面和390px手机。

## 设置式选项菜单（2026-09-26）

旅途设置等"选项菜单"型窗口使用 `js/view_adventure_settings.js` 的页签编排与 `js/view_settings_controls.js` 的共享控件，不各自拼按钮列表：

- 页签条吸顶于 `.modal-body`，容器加 `.gui-tabs`，选中态沿用 Shared tabs；页签切换原地显隐内容区（`hidden`），不整面板重绘，焦点留在页签上；因开关触发的重绘通过模块级 `settingsView.tab` 保持当前页签，控制器打开窗口时重置。
- 内容按 `.settings-section` 分区卡片组织；动作与链接用整行可点的 `.settings-cell`（emoji 图标 + 标题/说明 + CSS 箭头），开关用 `.settings-row` 右侧药丸 `.settings-toggle`（已开启/已关闭 + `aria-pressed`），标签在上、选择组在下的用 `.settings-field`。
- 控件只依赖注入的 `el/button`，验收页可复用；核验入口 `tests/fixtures/settings.html?tab=journey|sound|language|about`。新增文案同步 `data/adventure/locale/en.txt`。

## 美术与性能

复用 `ui-art.json` 已有图集与 Keepwork CDN，不为单个窗口下载一套不同皮肤，不把本地绝对路径写进运行时代码。新增资源保留 WebP、alpha、尺寸、来源和哈希，并遵守 AGENTS.md 的字节上限。图标失败时仍应能辨认操作。动画遵循 `prefers-reduced-motion`，避免为 hover 引入持续绘制。

## 修改后的核验

1. 检查现有共享组件是否已能满足需求；新增共享能力先改组件，再接入调用方。
2. 查看桌面与390px手机，确认标题/切换/关闭不挤压、无外部横向溢出、正文能滚动。
3. 用鼠标点击及键盘 Tab/Enter 检查关闭；嵌套窗口只关闭自身，焦点恢复到合理位置。
4. 核验图集正常与图片不可用两种情况；图标40px、点击区域48px保持一致。
5. 至少覆盖地图、通用窗口和一个子窗口，避免只检查正在修改的那一页。改共享样式时同时看云存档、卡牌浮层与宠物详情。
6. 运行相应浏览器检查和构建。界面纯样式调整不为凑覆盖率增加镜像实现的单元测试；实际交互改变要验证行为。
7. 记录到 `docs/devlog/devlog_YYYY-MM-DD.md`；若形成新的全局约定，同步本指引。

### 会员标记与详情（2026-09-21）

人物姓名右侧使用紧凑文字小按钮：会员显示“会员权益”，普通/未确认账号显示“升级会员”，商城入口使用同一文案规则。用户界面不显示“Keepwork VIP”字样，点击均打开会员界面。按钮支持键盘聚焦、中文无障碍名称，点击打开共用模态窗口。详情参照原版 `CombatMagicStarPage.html` 的大徽章、身份信息、特权分区结构，使用本项目书页配色；窄屏改为上下布局。会员权益只展示实际接入的商城专属商品，不映射原版魔法星等级、能量石或奖励。关闭按钮复用 `createCloseButton`，状态与购买资格共同读取 Keepwork 会员适配器。

### 魔法星会员界面与领取（2026-09-21）

入口保持文字按钮；点击后所有用户可查看完整“魔法星”界面。参照原版 `CombatMagicStarPage.html/.lua`，左侧显示星级、有效期、剩余天数与五件法杖，右侧使用统一选中态页签展示属性表、成长秘籍、独有功能和免费领取；底部始终显示“成为VIP”，暂接 SDK `showProfileWindow` 个人资料窗口。手机布局上下排列。原版属性表明确标注暂未应用战斗加成。

### 米酒葫芦（2026-09-21）

活动保留原版五段累计在线（1/15/30/60/90分钟），以递增大小的葫芦呈现酿造阶段。每张奖励卡分别展示普通奖励及魔法星额外奖励按钮；普通奖励领取后才能领取对应的额外奖励。普通用户的额外奖励入口打开魔法星详情。顶栏显示今日在线、两类领取进度与会员权益入口，支持查看完整1–10级额外仙豆表。移动端为两列，不嵌套按钮。倒计时、已领取、会员可领取状态与顶部葫芦提示保持同步。

### 通用物品详情（2026-09-21）

2026-09-22：NPC 商店、商城、背包、任务奖励、会员奖励统一复用 ItemDetails。show 打开只读预览；render 供背包附加操作与对比，owned + instanceGuid 指定已有装备实例属性，默认预览不借用已拥有实例的强化值。购买/穿戴/使用仍由调用方分发动作，宠物阶段详情保留专用组件。

奖励图标和名称使用独立的详情按钮，领取按钮的禁用状态不影响查看详情。`ItemDetails`（`js/view_adventure_item_details.js`）统一渲染物品原图、拥有数、基础属性、穿戴条件、附加法术卡牌、获取途径及调用方提供的领取条件，支持尚未拥有的物品；预览不使用已有实例的强化/镶嵌状态。

嵌套详情弹窗统一使用 `DetailDialog`（`js/view_detail_dialog.js`）：原生 dialog、统一关闭按钮、Esc/点击外侧关闭、键盘事件隔离、关闭后恢复触发按钮焦点。魔法星和背包装备详情已共用该类；背包保留自身的装备对比与操作区。调用方应将弹窗挂到当前页面容器，随页面一起销毁，避免散落的全局监听。

### 副本入口图标（2026-09-22）

副本入口使用AI生成的金色石门/绿色传送门，合入原共享WebP图集第五行第一格。清单使用 columns / rows（当前4×5），加载器统一计算背景尺寸与位置；原16格坐标保留，整体预算仍为100,000字节。新增图标来源、提示词和哈希在 ui-art.json 的 additions 内；可用 scripts/prepare_dungeon_icon.py 从保留的原图集和生成原图重新准备。副本卡片优先画已有 Boss 立绘；没有立绘时画场景里同一只宠物，石门只在两者都没有时出现。

### 经验条始终显示本级进度（2026-09-25）

HUD 经验条（`.xp-bar`）必须同时可见"已获得"与"未填满"两种颜色，不得在角色达到等级上限时整条填满。填充比例沿用原版 `EXPArea.lua EXPArea.UpdateUI` L86-94：本级内经验／下一级所需经验，并保留 L93 的最小宽度 `math.max(3,width)`（当前实现为 `.xp-bar i{min-width:3px}`）。轨道色与填充色都在共享样式里定义（基础规则 `css/adventure.css`，绘本主题覆盖在 `css/adventure_storybook.css`），窗口级不再各自覆盖。核验入口：`tests/fixtures/exp-bar.html`（`?assets=local&lang=en&level=&fill=`）。

### 魔法星统一美术（2026-09-25）

魔法星详情和场景跟随伙伴统一使用 `magic-star-art.json` 的蓝色 VIP 等级图集，通过 `adventure_star.js` 的 `drawMagicStarIcon` 选择等级格。UI 不再绘制独立金色 SVG 星；未激活使用基础星灰色样式，具体等级与激活状态由旁边文字说明。

### 魔法星跟随开关（2026-09-26）

魔法星详情的身份区改为竖排图标栈：徽章缩至 56px，其下放单个圆形单选钮"跟随主角"（`.magic-star-follow`，由 `view_adventure_membership.js` 的 `membershipFollowToggle` 生成），等级、激活状态和有效期仍在右侧。控件用原生 `input[type=radio]`：圆形外观配合单键开关语义；浏览器不会取消已选中的单选钮，因此 click/Space/Enter 手写翻转，禁用状态保持可见并给出原因。取消跟随＝场景不再绘制该伙伴，不采用"原地停留"。显隐只由 `adventure_star.js` 的 `starCompanionVisible` 判定，动画期间（标题、隐藏、捕鱼、传送）与会员失效条件不变。

偏好只存本机：字段 `magicStarFollow` 写在角色存档对象上，但 `adventure_storage_core.js` 的 `durableSave` 会剔除它，因此不进 localStorage 核心副本、不上云、也不置脏；`runtimeValues` 把它放进 `prefs` 与角色运行时一起写入 IndexedDB，`restoreRuntime` 无条件恢复（不受 zone/revision 匹配限制）。默认 `undefined` 即跟随。切换由 `adventure_app.js` 的 `setMagicStarFollow` 处理（不走 `applyAction`、不 `revision++`、不触发云端保存），并由 `adventure_cloud_core.js` 的 `checkedProgress` 白名单保留，避免重载时被角色校验剔除。
