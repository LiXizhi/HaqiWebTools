# 主角分层实验室

独立入口：`HaqiHeroPreview.html`。用户于2026-09-26确认正式接入；场景、战斗、角色与坐骑UI、技能预览统一使用分层渲染，坐骑配置与原整身源文件保持不变。

## 查看

在项目目录运行 `python -m http.server 8792 --bind 127.0.0.1`，打开：

- 默认 CDN：`http://127.0.0.1:8792/HaqiHeroPreview.html`
- 明确本地模式：`http://127.0.0.1:8792/HaqiHeroPreview.html?assets=local`

支持男女、步行、骑手站姿及66种可骑乘坐骑；左侧原整身，右侧新分层。可切换四方向身体、十六方向头部，显示连接点、叠加原图或只看身体与脖子。方向键/WASD或右侧画布拖动控制移动。静止时可测试附近NPC注视与随机张望。素材检查模式允许查看全部方向，正常注视限制身体左右45°。底部UI缩略图使用同一渲染类。

## 素材约定

- 正式清单`data/adventure/hero-art.json`与预览清单`data/hero-preview.json`版本2：六套身体、两个独立头部ID；`elf-boy`和`elf-girl`分别为棕发少年、棕色双马尾少女。步行和骑乘共用同性别头部，不生成坐骑专用头部。
- 每个头部4×4共16格，从正面向左按22.5°递增。头图不含脖子，身体清头区域内补短脖子，头叠加覆盖形成连接。生成图的孤立alpha噪点在打包时清除，防止错误包围盒造成悬空。
- 身体使用无损WebP，保持原画布、坐标、格位和身体像素；头部移除及短脖子补绘只在清单的`mask`区域内发生。步行源图含树木、建筑和另一性别，专用身体副本仅清空未使用行，保留原画布与主角行坐标；清单明确记录这些非角色排除区域。
- 坐骑仍直接调用现有`resolveMountDrawPose`，不修改目录或重新提取去头后的布局边界。步行裁剪使用原整身alpha边界，与现有游戏保持相同缩放和留白处理。
- 8张WebP均低于200,000字节，最大182,442字节。CDN位于`keepwork/haqi/hero-preview/20260926/cb13100ea5e8/`；具体成功地址、SHA-256、尺寸和锚点记录在清单。仅上传这些素材，用户选择不复制Git镜像。
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
