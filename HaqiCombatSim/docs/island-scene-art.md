# 五大岛实际场景美术包（交接与逐岛计划）

2026-10-15 建立。目标：哈奇、火鸟、寒冰、沙漠、幽暗五岛进入游戏后的画面，向世界地图插画的精致度看齐（魔法营地已单独优化，不在本计划内）。每次新会话处理**一个岛**，按下面的步骤做完即可。

## 当前状态

| 岛 | 配置 `sceneArt` | 图集 | CDN | 截图验收 |
|---|---|---|---|---|
| 沙漠 `desert` | 已写 | 已生成（3 张） | **未上传** | 本地已通过 |
| 火鸟 `fire` | 已写 | 待生成 | — | — |
| 寒冰 `ice` | 已写 | 待生成（积雪树已修好，不需要新图） | — | — |
| 幽暗 `dark` | 已写 | 待生成 | — | — |
| 哈奇 `town` | 已写 | 待生成 | — | — |

没有图集的岛自动保持原画面，不会报错。2026-10-15 生图返回 429（个人配额），所以只完成了沙漠。

## 已完成的代码（不需要重做）

- `js/island_scene_art_core.js`（纯核心）：材质查找 `groundTexture`、山体贴图 `mountainSprite`、按种子散布 `islandSceneArtSteps`（避开道路、居民、怪物、建筑、树、水体与山体，不影响采集）、`sceneArtAtlases`。
- `js/island_ground_textures.js`：地表、道路、水体按世界坐标图案填充（主线程与 Worker 共用）；生物群系配置为 `null` 时保留原区域色。
- `adventure_large_terrain.js`：材质与山体贴图接入，图集缺失时回退原多边形；`adventure_terrain_detail.js` 在有材质时跳过程序噪点和石板。
- `adventure_environment_art.js`、`island_terrain_worker.js`、`adventure_renderer.js`：新增 `pattern()` 接口。
- `adventure_assets.js`：`environment-art.json` 中带 `"layer":"terrain"` 的图集会交给地表装饰加载器。
- `adventure_scenery_core.js`：只预热当前岛的美术包。
- `adventure_camp_terrain.js`：烘焙散布的道具和地貌，`sceneArt.flat` 中的帧不画阴影。
- 寒冰岛所有树改用积雪树图集。
- `tests/fixtures/exploration.js`：进入岛屿时调用 `warmScenery`（以前预览页从不加载地表装饰）。
- 打包脚本 `scripts/prepare_island_scene_art.py`：帧名清单在 `KITS`；地表做成可平铺材质；道具和地貌支持真透明、白底、品红底，并去除白边残留；每张 ≤200,000 字节；写入清单并保留未变图片的 CDN 地址。
- 测试：`tests/island_scene_art.test.mjs`（配置/帧存在、可复现、避让），`tests/environment_art.test.mjs`（允许不透明的 2×2 地表图集）。

## 每个岛的标准步骤

1. **生图**（内置 image_gen；可用 `image-generator` 子代理，配额不足时稍后再试）。生成三张，风格参考为本岛插画 `assets/adventure/environment/world-atlas-<id>-layout-*.webp`，加上 `desert-features-11a7dbacd6b7.webp` 与 `camp-props-ab652717f6ac.webp`。要求手绘、可爱、左上光、3/4 俯视、清晰描边，适合儿童，无文字和网格线。
   - `ground`：严格 2×2 的四块**可无缝平铺**正俯视材质，铺满不留边，顺序见下表。
   - `props`：严格 3 列 × 2 行的六个小道具，每格居中并留足边距，带柔和接地阴影，纯白底（寒冰用纯品红 `#FF00FF` 底）。
   - `features`：严格 3×2 的六个较大地貌，规则同上；第 1–2 格是山体，底部宽度占满格子大部分；`flat` 类（池塘）几乎没有高度。
2. 保存到 `.cache/island-scene-art/<id>/{ground,props,features}.png`（子代理只输出 jpg 时，用 `.asset-cache/venv/bin/python` 和 PIL 转成 png）。
3. `.asset-cache/venv/bin/python scripts/prepare_island_scene_art.py <id>`，然后查看生成的 WebP：裁剪完整、无白边、四块材质平铺无明显接缝。
4. 把提示词写入 `assets/adventure/environment/prompts.json` 的 `islandSceneArt.<id>`（打包脚本已在清单里引用这个位置）。
5. 截图验收：`python3 -m http.server 8765` 后打开 `tests/fixtures/exploration.html?island=<id>&assets=local`；可参考会话脚本，用无头 Chrome CDP 拍出生点、4 个地标和 2 座山体。按需调整配置里的 `scale`、`alpha`、`chance`、`cell`、`sizes`，改完运行 `npm run generate:maps && npm run check:maps`。
6. 按 `upload-deploy-cdn-files` / `art-asset-generator` 技能上传 Keepwork CDN（先预览，经用户确认），把 `cdn` 写回 `data/adventure/environment-art.json`，并核验 HTTP 200、SHA-256 与 CORS `*`。
7. `node --test tests/island_scene_art.test.mjs tests/environment_art.test.mjs tests/island_buildings.test.mjs`，再跑 `npm run test:battle`；在 `docs/qa-report.md` 和当日 devlog 记录，并更新本文“当前状态”表。不提交、不推送。

## 各岛帧清单（与 `KITS` 和配置一致，名字不能改）

| 岛 | ground（左上、右上、左下、右下） | props（按行） | features（按行） |
|---|---|---|---|
| fire | volcanicRock 暗红火山岩带细熔岩缝；ashGround 灰褐灰烬地；basaltRoad 玄武岩石板路，部分缝透橙光；lavaFlow 熔岩表面带黑色硬壳 | obsidianRocks 黑曜石堆；lavaVent 冒烟的小熔岩裂口；emberBrazier 石火盆；charredFence 焦木栅栏；bonePile 卡通恐龙头骨；magmaCrystal 红橙熔岩晶簇 | volcano 宽底火山口带熔岩与烟；basaltCrag 玄武岩崖；lavaPool 平的熔岩池；basaltColumns 六棱石柱群；fireShrine 凤凰石龛；ashRockArch 火山岩拱 |
| ice | snowField 新雪带蓝影；frozenTundra 压实雪地夹霜草和小冰面；snowRoad 雪路嵌蓝灰石；iceSheet 带裂纹的冰面 | iceCrystals 冰晶簇；snowman 雪人；snowBoulder 覆雪石；iceLantern 冰灯柱；snowFence 雪栅栏；frostBush 霜灌木 | snowPeak 宽底雪山；iceCrag 冰崖；frozenPond 平的冰池；iceSpires 冰锥群；frozenShrine 雪花石龛；glacierBoulders 冰川巨石 |
| dark | darkRock 暗紫岩地带紫晶屑；marshMud 沼泥；runeRoad 裂缝石板路带紫色符文；darkWater 靛色沼水 | violetCrystals 紫晶；mossyGravestone 圆顶青苔石碑（无字）；glowMushrooms 荧光蘑菇；spiritLantern 紫焰灯柱；deadStump 扭曲树桩；runeStone 符文立石 | darkPeak 宽底紫岩山带晶石；shadowCrag 暗岩崖；swampPool 平的荧光沼池；ruinedArch 哥特残拱；crystalSpire 巨晶塔；brokenTower 残破圆塔 |
| town | lushGrass 鲜绿草地带三叶草和小花；autumnGround 金黄秋草落叶；cobbleRoad 暖色卵石路；riverWater 清澈河水 | flowerCart 花车；streetLamp 铁艺路灯；stoneWell 带小屋顶的石井；hayBales 草垛；barrelStack 木桶木箱；flowerHedge 花篱 | snowyHill 宽底雪顶山；goldenHill 秋色山丘；flowerPond 平的睡莲池；stoneCircle 青苔石阵；gazebo 白色蓝顶凉亭；fountain 石喷泉 |
| desert（已完成） | sandDunes / hardpan / sandstoneRoad / oasisWater | sandstoneBoulder / obelisk / clayPots / animalSkull / shadeCanopy / dryShrub | mesa / sandstoneCrag / oasisPond / ruinedColumns / sphinxStatue / duneRocks |

## 已知问题与可选打磨

- 道路外缘仍有一圈原来的浅色路肩带，材质路面略显“贴纸感”；可考虑让材质覆盖到 `width/2+2`，或按岛调淡 `roads.layers`。
- 地表装饰（采集用的 `stones` 落叶等）在沙漠上有少量秋叶，不符合主题；改动会影响采集，需要单独评估 `adventure_ground_decorations_core.js` 的 `pools`。
- 山体贴图北侧超出原来的碰撞底面，角色走到山后会出现在贴图上方（与营地已有的平面烘焙一致）。
- 桥梁仍是共享木桥，没有按岛换皮。
