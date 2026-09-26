# 主角分层实验室

独立入口：`HaqiHeroPreview.html`。用户于2026-09-26确认正式接入；场景、战斗、角色与坐骑UI、技能预览统一使用分层渲染，坐骑配置与原整身源文件保持不变。

## 查看

在项目目录运行 `python -m http.server 8792 --bind 127.0.0.1`，打开：

- 默认 CDN：`http://127.0.0.1:8792/HaqiHeroPreview.html`
- 明确本地模式：`http://127.0.0.1:8792/HaqiHeroPreview.html?assets=local`

支持男女、步行、骑手站姿及66种可骑乘坐骑；左侧原整身，右侧新分层。可切换四方向身体、十六方向头部，显示连接点、叠加原图或只看身体与脖子。方向键/WASD或右侧画布拖动控制移动。静止时可测试附近NPC注视与随机张望。素材检查模式允许查看全部方向，正常注视限制身体左右45°。底部UI缩略图使用同一渲染类。

## 素材约定

- 正式清单`data/adventure/hero-art.json`与预览清单`data/hero-preview.json`版本2：六套身体、十八个独立头部ID；`elf-boy`和`elf-girl`分别为棕发少年、棕色双马尾少女。步行和骑乘共用同性别头部，不生成坐骑专用头部。
- 每个头部4×4共16格，从正面向左按22.5°递增。头图不含脖子，身体清头区域内补短脖子，头叠加覆盖形成连接。生成图的孤立alpha噪点在打包时清除，防止错误包围盒造成悬空。
- 身体使用无损WebP，保持原画布、坐标、格位和身体像素；头部移除及短脖子补绘只在清单的`mask`区域内发生。步行源图含树木、建筑和另一性别，专用身体副本仅清空未使用行，保留原画布与主角行坐标；清单明确记录这些非角色排除区域。
- 坐骑仍直接调用现有`resolveMountDrawPose`，不修改目录或重新提取去头后的布局边界。步行裁剪使用原整身alpha边界，与现有游戏保持相同缩放和留白处理。
- 初版8张WebP均低于200,000字节，最大182,442字节。CDN位于`keepwork/haqi/hero-preview/20260926/cb13100ea5e8/`；具体成功地址、SHA-256、尺寸和锚点记录在清单。仅上传这些素材，用户选择不复制Git镜像。
- 此轮头部来自生成式美术，16格对应目标朝向；相邻角度的形象一致性仍以人工视觉验收为准，并非原模型精确旋转截图。

## 通用类库

`js/hero_renderer.js`的`HeroRenderer`统一服务正式游戏、官网展示、坐骑实验室和独立预览。宿主传入独立素材清单和既有坐骑目录，`prepare({gender,mount,headId})`共享图片缓存，`draw(ctx,appearance,options)`绘制，`createView()`包装UI Canvas。状态计算在`js/hero_pose_core.js`；每个`createActor()`拥有独立视觉RNG。

```js
const appearance = { gender: 'female', mount: null, headId: 'elf-girl' };
await renderer.prepare(appearance);
renderer.draw(ctx, appearance, {
  x: 160, y: 200, size: 78, facing: 0, head: 2, time: 0,
});
```

`facing`沿用前/左/右/后编号0/1/2/3；`head`为0–15。`standing`选择骑手站姿，`original`用于原图对照，`bodyOnly`检查短脖子，`debug`标注锚点，`overlay`叠加原整身。宿主控制动画循环，`draw`不推进注视状态。UI视图提供`update`和`dispose`，动画UI共用一个requestAnimationFrame调度器，挂载后移除的视图自动注销。头部呼吸最大位移0.55像素（基准尺寸），随机张望使用独立种子，不影响战斗随机数或存档；减少动态效果时关闭这些待机动作。增加角色头部时新增`heads[headId]`，按需传入该ID，无需复制身体或坐骑配置。

## 准备与校验

```text
python scripts/prepare_hero_preview.py --male <16方向男头PNG> --female <16方向双马尾女头PNG>
python scripts/prepare_hero_preview.py --verify
node --test tests/hero_preview.test.mjs tests/mount_rider_scale.test.mjs
python scripts/publish_hero_preview.py --uploader <现有qiniu_upload_local_files.py路径>
python scripts/publish_hero_preview.py --verify
```

生成源PNG的哈希保存在清单中，原角色参考位于现有`sprites.webp`与坐骑实验室四张角色图集；不替换这些源文件。上传脚本只在既有上传器返回成功且远端SHA-256/CORS验证通过后登记URL，不读取或输出凭据。

预览入口不加入正式Vite发布入口列表。它通过源码HTTP服务运行；正式素材清单随adventure数据包构建；WebP仅通过CDN加载，不进入dist。构建成功不代表已发布网站。

## 创建角色形象扩展（2026-09-26）

创建页男女卡片分别支持箭头、键盘左右键和横向滑动，循环翻页；纵向手势保持页面滚动。两种性别分别记住草稿选择，下一步/上一步不丢失。新增8组男女16个头部，保留原2个形象，男女各9款。包括波波头、双辫、丸子头、卷发、短辫、侧分和波浪发，肤色与发色多样；形象不作为国籍身份或能力的标签。

头部都为4×4、16方向透明WebP，新增单张99,406–154,308字节。素材位于assets/hero-preview/head-*.webp；16份完整生成提示词见art-references/hero-head-variants.json，使用内置image_gen。新增CDN目录为keepwork/haqi/hero-preview/20260926/92a2b0e61d9e/；24张总素材通过远端SHA-256和CORS校验。身体和坐骑素材没有改动。

headId随角色持久化并进入云端小型角色状态，旧存档无此字段时沿用原默认；未知ID或不匹配性别在渲染时回退默认形象。创建伙伴步骤、系别演示、角色列表、装备、商城、场景、移动残影、战斗及骑乘均传递同一个headId。快速翻页时尚未加载完成的脱离DOM预览不加入动画调度器。

独立创建流程验收入口：tests/fixtures/hero-creation.html?assets=local。仅使用内存存档，可验证完整三步创建、序列化回读、场景/战斗及切换骑乘。美术对照页新增“头部形象”选择器，可分别查看所有新图集。

新增素材重打包：python scripts/prepare_hero_variants.py --sources <本地ID到生成PNG路径的JSON>。不修改身体，不把生成源PNG当作运行时资源。

## 四向逐帧步行（2026-09-26）

`male-walk.webp` / `female-walk.webp` 保留为四向静止身体与加载失败回退。移动时改用 `male-walk-cycle.webp` / `female-walk-cycle.webp`：每张6列×4行，方向顺序前、左、右、后，每向6帧，768×640。以原身体为参考通过内置 image_gen 绘制迈步、摆臂和披风变化，属于绘制步态，不是原生模型动画导出。生成源与参考哈希记录于 `bodies[gender+'-walk'].walk.source`。

新图集为无损透明WebP，男175,884字节、女195,854字节。单帧128×160预留头部空间，统一缩放、按脖子锚点对齐，保留所有可选头部。播放由实际移动距离推进（90世界单位对应1秒，10帧/秒），无位移时回静止身体；减少动态效果时不播步态。骑乘与站姿使用原素材。步态未加载时回退原分层身体，缺头部时仍回退完整原角色。

打包：`python scripts/prepare_hero_walk.py --male <男步态PNG> --female <女步态PNG>`。输入为6×4透明格图；检查24格非空、每向6帧像素不同、边界、200KB限制，保存来源哈希及编码方式。重新生成旧身体会保留已登记的步态配置。

CDN资源位于 `keepwork/haqi/hero-preview/20260926/1012b7632245/`，实际地址见清单；已核验远端SHA-256和CORS。网站构建仍不包含WebP。`HaqiHeroPreview.html` 用WASD/方向键或拖动预览，可用 `?assets=local` 检查归档素材。

## 逐款头颈连接点校准（2026-09-26）

修正打包时所有头部都使用图格底部中心 `[72,134]` 的做法。`art-references/hero-head-anchors.json` 保存九款女头16方向连接点，以及九款男头侧面/邻近转头角度的连接点；男头正面、背面及其直接相邻角度保持原值。连接点依据下颌与耳下颈部位置，避开辫子/长发的最低像素。只调整head frame的neck，保留图集像素、裁剪、大小、身体与坐骑位置。

`python scripts/calibrate_hero_heads.py` 将校准写入预览和正式清单；两种头部打包脚本也自动应用，防止重新生成时丢失。图像哈希及CDN不变，不需要上传素材。已检查全部18款的四向静止/行走、女头斜向转头及骑乘拼合；17项相关测试和构建通过。

## 下次快速调整头身位置

### 调哪里

| 现象 | 修改入口 | 调整方向 |
| --- | --- | --- |
| 某款头型位置不合适 | `art-references/hero-head-anchors.json` → `heads[headId].anchors[方向]` | 锚点 **x减小→头向右，x增大→头向左；y减小→头向下，y增大→头向上** |
| 只有行走身体需要上移，头位置已合适 | 两份清单中的 `bodies[性别+'-walk'].walk.frames[帧].bodyOffsetY`；同时更新 `scripts/prepare_hero_walk.py` | 负值上移身体，正值下移；不移动头部 |

头锚点单位是144×144头部图格像素，不是屏幕像素。绘制位置为 `身体连接点 - 头锚点 × 缩放`，所以改锚点与头的移动方向相反。通常每次先改2–4个图格像素；截图放大倍数会影响看到的位移。

头部16方向索引：`0=前，4=左，8=后，12=右`，中间每格22.5°。身体四方向编号则是 `0=前，1=左，2=右，3=后`，不要混用。步态每方向6帧，按前/左/右/后排列，前向为帧0–5。头型ID可查清单中的 `heads`：例如栗发少女 `amber-girl`、短辫少女 `cocoa-girl`、赤发少女 `copper-girl`。

### 最短操作流程

1. 在 `HaqiHeroPreview.html` 选中头型、身体方向和姿态，先关闭“起伏与张望”比较静态连接，再打开并移动检查行走。只修改有问题的头型/方向；相邻转头角逐步减小偏移，避免转头跳动。
2. 修改锚点配置后执行 `python scripts/calibrate_hero_heads.py`，同时更新 `data/hero-preview.json` 与 `data/adventure/hero-art.json`。不要只改其中一份，也不要只手改生成后的 `frames[].neck`。
3. 刷新预览，确认状态行“头颈校准”哈希与清单 `headCalibration` 一致。当前JS对清单使用 `no-store` 和刷新参数；若修改JS本身，更新HTML的模块版本参数，涉及渲染器时也更新预览里的渲染器import版本，并用新参数打开页面。**先确认新版本真的加载，再判断位置，不能因为旧缓存看不出变化而继续累加偏移。**
4. 检查目标角度、相邻转头角、静止/行走切换，必要时检查骑乘。运行 `node --test tests/hero_preview.test.mjs tests/mount_rider_scale.test.mjs`。数值/哈希测试不能代替肉眼确认衣领衔接。

配置中的 `null` 表示保留当前清单值，**不是恢复默认**。需要撤回一个角度时，写回明确的原锚点数值。只改位置不需重生成或上传WebP；构建、网站发布、Git提交仍按各自授权执行。

### 本轮调试经验与当前基线（2026-09-26）

- 初始所有头部都用 `[72,134]`，把长发/辫子的最低点当成脖子，导致悬空。先做九款女头逐角度校准，男头仅调整侧面，保留满意的前后视图。
- 预览缓存曾使修改看起来无效；连续下移后，新版真正加载时又显得过低。因此回退了最后一轮下移量的一半：相对首轮女头整体下移4图格像素、侧面额外3像素，相邻角度平滑过渡。
- 栗发少女右侧再向右微移，锚点从 `[84,110]` 改为 `[78,110]`，高度不变；邻近索引10–14的水平修正为2/4/6/4/2。
- 男女朝前走仍露颈时，改的是身体：前向六帧 `bodyOffsetY=-5`，默认78px角色约上移2.44px，头部不动；其他方向、静止及骑乘保持原样。
- 用户总体认可当前效果，仍有个别头型可微调。后续以当前配置为基线，避免再整体调整所有角色。详细历史见 [当天开发日志](devlog/devlog_2026-09-26.md)。
