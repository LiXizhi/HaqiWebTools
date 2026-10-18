# 互动序章《失落的光》（`Haqi.html?prologue`）

面向初次接触《魔法哈奇》的孩子与家长（约 8 分钟可交互开场电影），在不改变现有主线任务与存档结构的前提下，将两条故事线合二为一：

1. **成为强大的哈奇魔法师，与伙伴联手拯救世界**（五系魔法卡牌战斗、护盾与治疗配合、组队战斗）。
2. **找回失落的汉字与第二语言词汇**（文字就是魔法的源泉；写出汉字或目标语言单词，即铸造成真正的战斗文字卡）。

完整双语分镜与台词设计见 [docs/story/prologue-lost-light.md](story/prologue-lost-light.md)。

## 1. 入口与 URL 参数

序章运行在 `Haqi.html` 内，复用已加载的 `assets`、`renderer`、`spellSound` 与语言配置，按需动态加载 `js/prologue_app.js`，无需登录账号，也不会写入云端或角色存档。

| 入口 | 行为 |
| --- | --- |
| `Haqi.html`（当前无角色） | 进入标题页且无角色时，自动播放开场动画《失落的光》，播放结束后进入新建角色向导（`01 起名字 - 02 选择抱抱龙 - 03 选择系别`） |
| `Haqi.html`（已有角色，点击「新建角色」） | 先弹出确认对话框询问「新建角色前，是否播放开场动画《失落的光》？」（可选「播放开场动画」或「直接创建角色」），作为界面唯一入口 |
| `Haqi.html?prologue` | 调试直达入口，启动后直接进入序章全屏舞台（`.prologue-layer`），结束后回到标题页并在地址栏清除序章参数 |

支持的调试与直达参数：

- `?prologue` 或 `?prologue=1`：直接进入序章
- `&lang=zh-CN` / `&lang=en`：指定母语（第一行大字幕与界面语言）
- `&second=en` / `&second=zh-CN`：指定第二语言（第二行副字幕与文字卡目标语言）
- `&scene=<id>`：直接跳到指定场景（`cold-open`、`steal-light`、`masters-battle`、`shatter`、`spark`、`light`、`together`、`epilogue`）
- `&assets=local`：强制使用 `assets/prologue/*.webp` 本地副本

## 2. 模块职责与分层

- `data/prologue/script.json`：唯一剧本数据源，包含中英双语角色名、8 个场景与全部镜头（`art`、`fx`、`title`、`line`、`battle-scripted`、`catch-spark`、`hanzi`、`card-forge`、`battle-live`、`end`）。所有对白均绑定具名角色并展示对应 NPC 头像。
- `data/prologue/art.json`：12 张 WebP 美术清单（11 张 `1376×768` 16:9 关键帧插画 + 1 张 `256×256` 透明背景带翅膀 `dark-lord-boss` 独立立绘，记录本地路径、CDN 地址、尺寸、字节数、`sha256` 与原图来源哈希）。
- `js/prologue_script_core.js`：纯函数校验（`validateScript`）、语言配对（`languagePair`、`bilingual`）、URL 解析（`prologueRequested`）、自动推进时长（`readSeconds`、`beatAutoSeconds`）与无 DOM 场景游标（`createRunner`）。
- `js/prologue_battle_core.js`：纯战斗编排，调用真实 `combat_arena_core.js` 与 `word_cards_core.js`，不引用任何 DOM：
  - **第 1 幕（4v1 大师联手战）**：`烈火大师`、`寒冰大师`、`风暴大师`、`生命大师` 4 人组队迎战死亡系 `黑暗魔王`（`MASTERS_SEED = 2027`）。每位大师持有新手指引中的 3 张本系代表技能卡（`MASTER_SHOWCASE_CHOICES`，与 `adventure_creation_preview.js` 的 `TUTORIAL_SKILLS` 完全一致），玩家依次为 4 位大师各选 1 张卡欣赏技能特效，81 种全组合四位大师均完整出手并 0 失误获胜。
  - **第 4 幕（4v2 守护营地再战）**：4 位大师再度联手迎战 2 只死亡系 `暗影小鬼`（`FINALE_SEED = 2027`）。每位大师手中除了之前的 3 张本系代表技能卡外，还新增第 3 幕刚写出并铸造激活的「光」之文字卡（`zh:guang` / `en:sun`，共 4 张可选卡牌），全员出手 0 失误获胜。
- `js/prologue_cinema.js`：关键帧插画叠化、Ken Burns 镜头运动、Canvas 字叶/光雨粒子与标题卡。
- `js/view_prologue_dialog.js`：带左侧 NPC 头像槽（`.pl-avatar`）的双语对白框，支持选卡提示模式（`.is-prompt`）。
- `js/prologue_stage.js`：交互式镜头舞台，复用真实 `V.renderBattle`、`renderer.renderBattle`、带翅膀的 `dark-lord-boss` 独立立绘、居中手牌展示（`.battle-hand` 居中）与底部对话框选卡提示（如「选择一张烈火系的卡牌。」），以及全屏嵌入的 `hanzi/hanzi_guang.html`（右上角提供统一的 `createCloseButton` 退出按钮）。
- `js/prologue_app.js`：序章顶栏控制器（双语切换、Keepwork 语音朗读开关、跳过本幕、统一的 `createCloseButton` 退出按钮）。

## 3. 美术准备与核验

使用 `scripts/prepare_prologue_art.py` 将 11 张 16:9 源图与 1 张透明去背的带翅膀 `dark-lord-boss` 立绘编码为 WebP（每张 `< 200,000` 字节）并生成带内容哈希的文件名与 `data/prologue/art.json`：

```bash
python scripts/prepare_prologue_art.py --check
node --test tests/battle_prologue.test.mjs
```
