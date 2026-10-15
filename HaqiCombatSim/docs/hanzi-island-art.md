# 字源岛独立美术

2026-10-12。内置 image_gen 生成的原创儿童幻想岛屿，不代表真实地理或原版游戏资产。已接入 Haqi.html 与哈奇世界地图；游戏版本尚未发布。

## 设计与生成提示

岛屿：温暖明亮的中国儿童幻想游戏手绘俯视岛屿，透明背景，完整海岸，卷曲毛笔与叶片般的轮廓。南部红帆码头，西南青瓦白墙水车村庄和稻田，中部打开书本形屋顶的字源亭，东北石头小岛及桥梁，北部毛笔尖灯塔与金色树木，碧绿浅海。柔和立体卡通质感，不画文字、标签、UI或边框。

建筑：与岛屿一致的手绘三分之四俯视游戏建筑，3列2行独立素材。依次为书本屋顶字源亭、青瓦水车小屋、毛笔尖灯塔、红帆木码头、石匠工坊、金色树木。每个物件完整保留边缘，互不接触，无人物、文字或界面。后续编辑将背景改为真实透明通道，保留各建筑造型。

居民：与场景一致的儿童幻想游戏全身居民，2列2行透明素材，完整人物不相交。左上阿初，年轻男性，青色衣服、卷轴；右上溪禾，年轻女性园丁、浇水壶；左下石伯，灰白胡须的年长石匠、锤子；右下小灯，红披风女孩、灯笼。温暖亲切、清晰轮廓，无文字或界面。

以上为生成提示内容记录；源图 SHA256、尺寸、裁剪坐标和成品 SHA256 保存在资源清单中。岛屿源图为1254×1254，最终建筑源图1536×1024，居民源图1246×1262。

## 资源与重建

| 文件 | 尺寸 | 字节 |
| --- | --- | --- |
| world-atlas-hanzi-40da48b648c2.webp | 640×640 | 190824 |
| buildings-hanzi-61e231ca874d.webp | 816×544 | 195192 |
| hanzi-863000-483f9684b107.webp | 256×256 | 40264 |
| hanzi-863001-2d15dbefe3d2.webp | 256×256 | 34988 |
| hanzi-863002-a293d5f4df7b.webp | 256×256 | 44048 |
| hanzi-863003-89cdac6bb422.webp | 256×256 | 47740 |

资源清单：[island-art.json](../data/adventure/hanzi/island-art.json)。同时登记于 world-map-art.json、building-art.json、npc-art.json；NPC portrait 使用各自的 id 与 crop。

打包脚本：`python scripts/prepare_hanzi_island_art.py --island <源PNG> --buildings <源PNG> --npcs <源PNG>`。保留透明通道，先尝试无损，再按大小限制降低质量。建筑显式裁剪避免跨格污染，NPC成品256×256、小于48000字节；其他每张小于200000字节。重复生成相同哈希保留已验证CDN字段，变更哈希须重新上传核验。

通过 upload-deploy-cdn-files 技能的既有七牛上传脚本上传至 `keepwork/haqi/adventure/hanzi-island/`。六个实际返回的永久URL均已下载比对SHA256，响应支持 `Access-Control-Allow-Origin: *`。仅保留本项目副本与CDN；用户明确不复制 digitalhuman-resource 镜像。未提交、推送或发布游戏。

## 验证

- 地图生成器校验十个岛屿均可达；字源岛4800×4800，六个地标、七处建筑、250棵树、七段桥梁。
- 测试保护独立图集、四位居民portrait、WebP哈希/尺寸/大小和CDN地址，以及旧存档合法位置保留、阻塞位置回码头。
- `npm run test:battle`：1053项，1052通过；既有 `battle_urban_residents.test.mjs:50` 肤色匹配断言失败（0 !== 20），未将其算作通过。
- 隔离浏览器验收页：`tests/fixtures/hanzi-island-art.html`，调用实际场景和世界地图渲染器，不读写玩家存档；可检查六张WebP和各NPC/地标。加 `?assets=local` 使用明确本地模式。

浏览器实测 CDN 与 assets=local 两种模式的六张图片均可解码、alpha/Canvas读取通过；世界地图缩放可显示独立岛屿图与可行走地形。截图保存在 .cache/hanzi-art/world-map.png。

## 布局约束重绘预览

2026-10-12：按用户要求，使用内置 image_gen，以实际地图 JSON 导出的抽象布局为第一参考、原岛屿 WebP 为第二画风参考，生成一版可供比较的透明底图。预览入口 `tests/fixtures/hanzi-map-repaint.html`，资源及源图哈希登记于 `data/adventure/hanzi/map-repaint-preview.json`。当时仅完成独立预览。

2026-10-13：正式接入主程序。`world-map-art.json` 和 `hanzi/island-art.json` 已切换为 `world-atlas-hanzi-layout-66e58c7f8be3.webp`（768×768，191372字节）；新版已上传永久 Keepwork CDN，并核验下载 SHA256 一致和 CORS `*`。字源岛配置 `detailStyle: illustration`，`view_haqi_atlas.js` 在所有缩放级别保留这张底图，缺图时仍回退可选目的地的程序地形。六个地点、玩家及社交角色位置、点击传送继续使用原游戏坐标；完整 `[0,0,768,768]` 裁剪避免内容包围框改变坐标基准。未改变游戏场景的行走地形，未迁移存档，游戏版本未发布。旧准备脚本的自动内容裁剪仅适用于旧版装饰图，新版重建须保留完整画布。

完整画布对应游戏的 0–4800 坐标，编码时不裁剪透明边缘，不使用旧图的内容包围框；地点、NPC、道路和海岸校验层直接从实际地图读取。预览支持缩放、显隐地点/NPC及叠加原道路和海岸。生成图保留道路拓扑，但局部几何属于 AI 近似，不能声称全部通行坐标已经精确对齐；正式接入前需处理校验层暴露的偏差。

生成提示：

```text
Create a replacement game island map illustration by rendering reference image 1 in the gorgeous painted style of reference image 2. Image 1 is the STRICT spatial layout, image 2 is ONLY an art style and architectural design reference. Output square 1024x1024 RGBA with transparent ocean outside the island. Preserve image 1's full canvas registration: do NOT crop to content, recenter, rotate, change perspective or enlarge the island. Coastline follows precisely the silhouette in image 1, spanning x 13.5%-93.5%, y 8.75%-95.2%, with the protruding northeast arm and southeast notch. The creamy path centerlines, intersections, the turquoise river and wooden bridge crossing locations must stay in EXACTLY the same locations as image 1. Render paths as warm sandy garden paths, keep ALL segments including the triangular loops, central north-south spine, west zigzag, east vertical route and northeast dead end. No obstructing trees on roads; all paths visible from overhead. Low relief, almost orthographic top-down terrain, delicate hand-painted Chinese children's fantasy game art, soft rounded greenery and rocks, warm light, detailed but clean. Replace brown boxes with small buildings matching image 2: book-roof pavilion centered at (55.2%,45%), two tiny blue-tiled white-wall cottages at (31.9%,66.9%) and (28.8%,71.3%), brush-tip lighthouse at (63.3%,23.1%), gold tree at (46.7%,20.6%), stone workshop at (77.1%,60.8%), red-sail wooden harbor at (59.6%,85.8%). Keep buildings modest so they do not cover roads. Morning grove around (74.8%,37.6%). River west of center follows image 1 precisely, several small timber bridges at marked crossings, pond west of village. Violet dots mark required empty walkable ground; remove dots but leave those exact spots clear for NPC overlays: (50%,78.42%), (38.65%,60.23%), (70.46%,55.69%), (52.27%,30.69%). White circles also remain clear walkable ground; do not draw circles. Replace all flat green regions with tasteful grass, shrubs, little patches of flowers, village vegetable plots and gentle rock coast. Do not add detached northern island or change shoreline to match image 2. Tiny shallow turquoise fringe only within 1% of shoreline, then real alpha transparency. NO TEXT, letters, numbers, UI, labels, pins, circles, purple dots, characters or grid. Preserve layout over compositional improvisation. This is an actual game overlay base map, not a decorative poster.
```

## 2026-10-16：按注册岛屿新标准重绘候选

依据 `docs/island-expansion.md#新岛屿制作流程2026-10-13`，重新使用实际地图布局参考 `.cache/registered-islands/hanzi-layout.png` 和字源岛画风参考生成了完整透明 RGBA 候选图。新图保留 4800×4800 地图的海岸、路网、河流、桥位、建筑占位和地标/NPC 留白，成品为 `assets/adventure/environment/world-atlas-hanzi-layout-0eb913503eb2.webp`（768×768，194758 字节，SHA-256 `0eb913503eb226ffc6c1908c18e9d4450a162626b71f1522d7c2bac20d384e11`）。生成提示与来源记录在 `data/adventure/island-map-repaint-prompts.json#hanzi` 和 `data/adventure/hanzi/map-repaint-2026-10-16.json`。

已上传至 `https://cdn.keepwork.com/keepwork/haqi/adventure/hanzi-island/world-atlas-hanzi-layout-0eb913503eb2.webp`，并替换正式 `world-map-art.json` / `hanzi/island-art.json` 条目。下载哈希、194758 字节大小、WebP 类型和 `Access-Control-Allow-Origin: *` 均已核验；道路叠加与正式渲染测试随后执行。


### 2026-10-16 截图反馈修正

南部红帆码头使用帧级锚点偏移 `[220,420]`，使码头底部落在岸线与水面交界；地图逻辑坐标保持不变。帧偏移由通用场景图集绘制器读取。



### 2026-10-16 独立码头素材修正

截图复核确认单帧码头无法同时满足“门楼在岸上、船在水上”。新增独立 `hanziHarbor` 透明 WebP：门楼固定在左侧陆地基座，栈桥向右下跨过岸线，红帆船完全位于水面。新资源已上传并核验 CDN：`https://cdn.keepwork.com/keepwork/haqi/adventure/hanzi-island/hanzi-harbor-08f4c9704813.webp`，144880 字节，CORS `*`。

本地验收页点击“初生码头”后实测：门楼落在岸线左侧，栈桥进入水面，船体完全在水中；建筑与场景测试通过。

### 码头尺寸调整

本地浏览器实测后，字源岛独立码头绘制比例从 1.0 调整为 1.45；不改变地图逻辑坐标和独立码头资源，只放大场景显示尺寸。
