# 场景树木与天气素材

2026-09-20。使用内置 image_gen 生成四种自然积雪树和六种透明天气素材。积雪直接融入枝叶与树冠体积，移除旧版树冠白色椭圆叠加；草地树仍使用原图集。四个冬树变体按稳定坐标选取，不消耗战斗随机数。

## 文件与来源

- 运行时清单：[environment-art.json](../data/adventure/environment-art.json)，包含实际CDN、WebP尺寸/字节、转换后哈希、生成源哈希与每帧原始/运行时裁剪。
- 完整生成提示词：[prompts.json](../assets/adventure/environment/prompts.json)。内置 image_gen；现有 sprites.webp 仅作雪树风格参考。
- 雪树：[本地 WebP](../assets/adventure/environment/snow-trees-20e205dd9bda.webp)，652×652，180,648字节；[永久CDN](https://cdn.keepwork.com/keepwork/haqi/adventure/environment/snow-trees-20e205dd9bda.webp)。
- 天气：[本地 WebP](../assets/adventure/environment/weather-c82470b17345.webp)，576×384，111,822字节；[永久CDN](https://cdn.keepwork.com/keepwork/haqi/adventure/environment/weather-c82470b17345.webp)。
- 准备脚本：`scripts/prepare_environment_art.py <雪树生成PNG> <天气生成PNG>`。先尝试无损，再压缩/缩小至每张不超过200,000字节，保留真实alpha及全部裁剪来源。相同哈希保留已上传CDN配置。

两张图片均已从CDN重新读取并核验SHA-256，CORS为 `*`；浏览器getImageData读取成功，透明和可见像素均存在。运行时下载失败回到基础树木/粒子，不阻断游戏；图片默认使用CDN，`assets=local`显式使用源码归档。dist不包含图片。

## 天气与性能

天气沿用 `config/maps/generator.json` 的各地域kind、count、speed和wind：雪花、沙尘、余烬、薄雾、灰烬、萤光共用一张图集。仍只绘制当前屏幕内最多64个效果对象；不按岛屿面积增加粒子。系统减少动态效果时停用天气。树木按视野剔除、脚底深度排序，阴影继续预烘焙。

## 场景测试页

打开 `tests/fixtures/exploration.html?island=ice`，默认CDN；加 `&assets=local` 查看归档。顶部可选择六岛、区域、天气，缩放、回入口、暂停天气或显示游戏HUD。点击地面或方向键/WASD行走。测试角色为内存50级，绕过正常进度只是为了查看所有场景，不读写任何角色存档；正常游戏等级规则不变。页面不进入生产构建。

## 统一地图窗口

普通“世界地图”按钮默认进入“当前地图”，顶部标题为当前岛名，旁边一个按钮切换到世界地图；世界地图标题旁可切回当前地图。法斯特船长和旅行入口默认打开世界地图。移除单独的岛内导览入口，当前地图点击图中地名或列表直接抵达地标；世界地图点击已解锁岛名直接传送，取消选中和二次确认按钮。再次从普通入口打开时仍默认当前地图。
