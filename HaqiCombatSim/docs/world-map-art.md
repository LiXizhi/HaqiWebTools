# 世界地图美术

新增岛屿使用 [新岛屿制作流程](island-expansion.md#新岛屿制作流程2026-10-13)：先生成真实布局，再以布局图加风格图制作独立透明插画。当前所有岛屿保持插画缩放，加载中及失败不绘制基础地形；下方早期共享图集与地形渐变记录仅作历史追溯。

2026-09-20。原版参考来自 `assets_manifest.txt` 中 `texture/aries/worldmaps/worldmap/worldmap_bg.dds.z`，下载后校验MD5，再解压ZIP中的DDS并保存为参考WebP。原版页面入口见 `script/apps/Aries/Map/LocalMap.lua` 的 `ShowWorldMap`。原图与生成图哈希分别记录于 `data/adventure/world-map-art.json`。

使用内置 image_gen，以原版图片作为参考生成新图；没有直接使用原图中的文字。六岛布局为左上幽暗、右上寒冰、中间哈奇、左下沙漠、下中魔法营地、右下火鸟。岛名、等级和传送按钮保持DOM，可独立更新。小屏保持图片比例，横向滚动查看，初始定位当前岛屿。图片按需加载，失败显示文字目的地列表。

生成后先尝试无损WebP（2,451,948字节），再以高质量有损编码和等比缩小，最终1280×640、190,982字节。原版参考归档不在运行时加载。

## 生成提示词（内置 image_gen）

Use case: stylized-concept. Create a production game world-map background illustration, landscape aspect ratio 2:1, based on the attached ORIGINAL MAGIC HAQI KIDS WORLD MAP as a visual reference, not an edit target. Preserve its charming early-2000s Chinese children's fantasy MMORPG painted storybook spirit, parchment scroll frame, turquoise blue rippling sea, softly outlined colorful miniature islands seen from high oblique overhead view. Improve detail and harmony, readable at small game UI sizes, polished hand-painted watercolor/gouache, no photorealism. Recompose to fill the ENTIRE wide canvas, no empty parchment panel on the right. Exactly SIX distinct separate islands with clear ocean gaps and these normalized centers: upper-left (18%,27%) dark mysterious purple forest island with twisted trees, haunted ruins and violet mist; upper-right (80%,25%) icy island with snowy blue peaks, frozen lake and tiny ice castle; center (49%,44%) the largest green Haqi island with bright blue-roof castle on a hill, little colorful village, cultivated farmland, rivers and beaches; lower-left (21%,75%) golden desert island with sandstone temple, small pyramid, canyon and turquoise oasis palms; lower-middle (49%,81%) a smaller welcoming green MAGIC CAMP island, with a glowing circular magic academy clearing, three little blue canvas tents and a crystal, visually distinct from the central main island and separated by water; lower-right (80%,73%) fiery phoenix island with a dark red volcano, orange lava streams, scorched rocks and warm amber shore. Each island roughly 18–24% of canvas width, central main island ~27%. Keep narrow ocean channels between every pair. Thin elegant cream parchment scroll border along all four edges, modest curls only at bottom corners; a small simple compass rose in open sea at top-center if room. Warm friendly adventurous mood, beautiful organic coastlines, restrained decorative waves. No text at all, no Chinese characters, no numerals, no labels, no banners, no title, no interface buttons, no pins, no watermarks. UI will overlay island names separately. Opaque background. Image must be usable as the whole clickable world map.

## 2026-10-05：透明岛屿图层与连续局部地图

旧整图不再运行时绘制，完整旧来源记录留在清单的 `previousArtwork`。内置 image_gen 生成真实 RGBA 透明3×2六岛图集及独立漩涡，`scripts/prepare_world_atlas_art.py` 复用现有透明图集打包器：先尝试无损，依次降低质量与等比缩小，保持 alpha 并同步裁剪坐标。六岛图集807×538、187,728字节；漩涡128×128、24,452字节。两张资源的永久CDN读取哈希与本地相同，CORS为`*`。

- 六岛图集：`assets/adventure/environment/world-atlas-islands-1c1651e50ce2.webp`，CDN为 https://cdn.keepwork.com/keepwork/haqi/adventure/world-map/world-atlas-islands-1c1651e50ce2.webp 。
- 漩涡：`assets/adventure/environment/world-atlas-vortex-5c06a7f9d959.webp`，CDN为 https://cdn.keepwork.com/keepwork/haqi/adventure/world-map/world-atlas-vortex-5c06a7f9d959.webp 。

### 清单与扩展

`data/adventure/world-map-art.json` version2：`resources`以资源ID记录local/cdn、width/height、size、sha256、生成来源及frames；`islands`记录id、name、resource、可选rect（像素裁剪）、中心x/y和地图显示w/h。未提供rect时使用整张图片，支持以后逐岛添加独立WebP；不用重画或重打包既有六岛。id同时关联现有游戏目的地和`content.worldMaps[id]`局部地图；缺局部数据时保留插画，未登记有效游戏目的地时只预览、不能传送。新增可玩岛屿仍须另行准备游戏内容和目的地规则。

局部坐标线性映射到该岛显示区域，使用原小地图地形并裁剪至海岸。岛屿达到视口适配比例55%至80%时由插画渐变到局部地形；当前人物与伙伴由实际坐标单独叠加。预览底图缓存最多6张，不启动其他岛的模拟，不改存档。图片失败仍可选择目的地；清单失败显示六岛列表，仍先选择后传送。

`portals`以稳定id配对haqi.x/y和earth.lon/lat。`pacific-north`现位于北纬30°、西经140°，`pacific-west`位于北纬32°、东经170°，避开夏威夷与西太平洋岛链（2026-10-06调整）；这是游戏设定入口。哈奇侧分别位于哈奇岛西北/东南海域。点击仅切换地图视图，现实侧显示360°全球、哈奇侧适配完整群岛，不放大或聚焦漩涡；两端仍需选择可用目的地才移动人物，漩涡坐标不作为海上落点。

### 本次生成提示词

工具：内置 image_gen，transparent_background=true。六岛作为一个图集生成，不从旧整图机械抠取。

六岛：Create a production transparent RGBA game asset atlas for a Chinese children's fantasy RPG, charming early 2000s hand-painted watercolor/gouache map style, top-down slightly oblique miniature islands. A strict 3 columns by 2 rows atlas of exactly SIX separate complete island sprites on genuine transparent background with generous EMPTY gutters, each island contained in its equal cell, no overlaps and no cropping. Top row left: small welcoming green Magic Camp with blue tents, circular magic academy clearing and crystal. Top row middle: green Haqi island with blue-roof fairytale castle, bright village, farmland, winding river and sandy coast. Top row right: Firebird island, red rocky volcano, orange lava and amber sandy shores. Bottom row left: Ice island with blue snowy peaks, frozen lake, snowy fir trees and tiny blue ice castle. Bottom row middle: Desert island with sandstone temple, small pyramids, gold dunes and turquoise oasis palms. Bottom row right: Dark island, purple twisted forest, haunted gothic ruins and violet mist. All islands shown as complete isolated land silhouettes, coherent style, detailed yet readable when small, coastline foam only immediately hugging the land. NO sea rectangle, NO ocean background, NO parchment, NO scroll, NO borders, NO compass, NO words, NO letters, NO labels, NO interface. Each island occupies about 75% of its cell width and height, centered in its cell, approximately square visual footprint. This is one coherent atlas image, 3x2 landscape layout.

漩涡：One isolated small stylized magical ocean whirlpool game map icon on genuine transparent background. Top-down circular turquoise blue spiral with deep indigo center, pale cyan foam swirling inward, soft magical blue glow just along its edge. Hand-painted watercolor/gouache fairytale children's MMORPG map art, readable at 38 pixels. Only the circular whirlpool, complete and centered with generous empty margin. No surrounding ocean rectangle, no background scenery, no parchment, no frame, no letters, no words, no symbols, no border. Transparent RGBA game asset.

海面使用独立可平铺的纯海水WebP resources.ocean，oceanTile.size定义世界坐标中的格子边长。海水、岛屿和装饰共用相机坐标变换，不采用独立覆盖缩放或边缘锁定。seaDecor记录随机种子、数量及帧尺寸；通过rng_core稳定生成海上礁石与海鸟坐标，避开岛屿包围盒、漩涡及其他装饰，不在拖动时重抽。相机视口约束在所有岛屿包围盒内；视口比群岛更大的轴固定居中。


## 2026-10-05：对照完整原图补充海港美术

实际读取官网所用world-map-12ae0dadaeb9.webp，并对照用户提供的官网截图。海面新增手绘蓝绿水流、白色碎浪、海鸟、海上礁石与小帆船；六岛图集保留相同格序，沿岸加入木码头、停泊船、港口小屋、灯塔、冰山及环岛礁石，细节烘焙在图片中，不增加交互节点。两张新图由内置image_gen生成，岛屿为真实RGBA透明；旧资源仍可追溯。

生成提示要点：Ocean background ONLY, hand-painted early-2000s fantasy MMORPG turquoise sea, flowing irregular painterly currents, fine white foam wavelets, luminous cyan and deeper blue tonal variation, sparse tiny rocks with circular wake foam, four seabirds, two miniature sailboats and one fishing boat, no geometric grid, no continents, no text/UI. Six-island edit: preserve exactly 3×2 cells and island identities, add wooden dock piers and moored boats, shore rock stacks and foam, green main island harbor buildings/lighthouse, camp landing, volcanic dock, icy port and icebergs, desert trading harbor, ruined misty dark-island pier, transparent gutters and no sea rectangles.

新六岛807×538、188016字节；新海面1536×1024、192026字节。scripts/prepare_world_atlas_art.py --islands/--ocean负责先无损、再高质量WebP预算与来源哈希。实际local/cdn、裁剪、来源和编码参数以version2清单为准。


## 2026-10-06：无限水纹与有限群岛相机

移除包含船只/鸟/礁石的整张海背景，换成纯海水方形可平铺纹理；岛屿船只也移除，保留码头、港口建筑和岸边礁石。新增透明3×2海上装饰图集（rock、reef、lowRock、gull、gulls、glidingGull），随机分布由createRng固定种子控制，坐标长期稳定。海水格子与装饰均用世界坐标随同一相机移动/缩放，水纹可持续平铺；地图操作不能把相机拖出群岛范围，最小缩放为完整群岛适配倍率。较高窄视口允许居中轴自然露出海面，不能继续向该轴拖走。

生成提示：square seamless tileable hand-painted turquoise ocean water ONLY, matching the prior painterly sea, opposing edges continuous, uniform wave density, no objects/ships/birds/rocks/islands. Decorations: strict transparent 3×2, top row sea rock stack/three reef rocks/low jagged rock with immediate foam; bottom row overhead white gull/two gulls/different gliding gull, isolated transparent gutters. Island edit: remove every vessel from all six sprites; preserve complete island/cell arrangement and empty wooden harbors.


## 2026-10-06：详细地图拖动缓存

保留六张局部预览，避免当前岛保护加三张上限使邻岛反复淘汰重建。海水、装饰、岛屿及地形渐变合成为视口四周256 CSS像素余量的缓存画布，最多800万像素（约32MB）；相同缩放下拖动只平移这张图，超出余量、缩放、resize或新图片到达时重建。人物/伙伴、选中圈及DOM地标仍按最新相机逐帧定位，不烘焙到静态缓存。地标按岛分组，使用translate3d且仅在实际可见性变化时修改hidden；拖动期间复用起始画布位置，避免每次pointermove读取布局。关闭清空缓冲及预览。

隔离性能脚本scripts/check_world_atlas_performance.mjs以桌面与390像素、DPR2、两次90帧拖动记录帧间隔与实际renderer.minimap重建数，--assert-cache守护重复拖动不重建预览。测量受机器与浏览器环境影响，不作为所有设备帧率保证。

## 2026-10-13：所有岛屿使用按布局重绘的独立插画

继字源岛后，魔法营地、哈奇岛、火鸟岛、寒冰岛、沙漠岛、幽暗岛、潮汐岛、浮岸岛、风帆岛各生成独立透明底图。第一参考为实际 `data/adventure/maps/<id>.json` 的海岸、道路、河流、桥梁、建筑及NPC点位，第二参考为原六岛/扩展岛图集的画风。使用内置 `image_gen`，哈奇岛另做一次局部清理以去掉参考圆点；完整提示词及参考路径见 `data/adventure/island-map-repaint-prompts.json`。

运行时 `world-map-art.json` 每岛使用独立资源，统一 `detailStyle: illustration`，缩放继续显示同一张底图；文字、玩家和社交角色仍由原坐标叠加。图像不可用时保留目的地选择与失败提示，不回退程序地形。原插画图集保留为来源，不覆盖旧文件。每张新WebP不超过200000字节，保留全画布 `[0,0,width,height]`，不能裁去透明边缘后沿用原坐标。

AI重绘保留主要路网关系，但仍存在局部几何偏差；这批图片用于地图导航表现，不替换实际行走场景或碰撞数据，不迁移玩家存档。

准备与接入：

1. `python scripts/prepare_registered_island_art.py --references` 从实际JSON生成布局参考和生成计划。
2. 每岛用内置图像工具生成，再运行 `python scripts/prepare_registered_island_art.py --id <id> --source <PNG>`；先无损，再有损/等比缩小。源图、地图布局和WebP分别记录哈希。
3. 用既有七牛上传技能上传九张成品，保存真实上传输出；`node scripts/install_registered_island_art.mjs --upload-log <上传日志>` 逐张核验CDN下载哈希、大小、CORS及地图布局未改变，全部通过后更新正式清单。
4. `tests/fixtures/registered-islands.html` 逐张检查正式CDN资源、透明通道及原道路叠加；点击岛名进入 `world-atlas.html?island=<id>`，调用主程序实际地图渲染器。显式 `?assets=local` 使用归档副本。

旧扩展图集准备脚本现在保留已接入的独立插画配置；地图验收与性能脚本不再把“生成程序地形预览”作为插画加载成功的条件。

## 2026-10-06：岛屿默认视野与缩放上限

从哈奇岛屿打开世界地图默认定位当前岛地形；现实世界及副本来源仍保留世界视野，漩涡focusPortal优先适配完整群岛。返回按钮保留。当前岛桌面预留64px、小屏32px，显示完整岛轮廓；缩放上限按相机附近岛屿适配倍率的1.15倍和768px地形预览原尺寸共同限制，窗口变化也重新限制，拖动本身不改变缩放。两个哈奇漩涡调整为(-140,-210)与(270,65)，配对现实坐标及入口ID保持一致。

## 2026-10-06：漩涡随地图缩放

漩涡以完整世界视野为基准，图标从44px按缩放倍率平方根增长到最多96px，防止局部图入口过小或遮挡地形。哈奇与现实图共用atlasPortalSize；按钮点击范围为图标加10px，哈奇Canvas命中同步，现实图入口避让也使用实际尺寸。尺寸仅变化时更新CSS变量，平移不重复更新。


## 2026-10-13：插画岛屿取消基础地形回退

已配置 `detailStyle: illustration` 的岛屿在图片加载中、加载失败及任意缩放下均不生成或绘制程序基础地形，也不显示椭圆占位岛。图片到达后直接绘制插画；等待期间保留海面及原坐标地标，失败时沿用图片不可用提示与目的地选择。此约定替代前文的缺图地形回退；未配置插画模式的地图保留原逻辑。


## 2026-10-14：营地坐标扩容，保留原插画

按本次用户明确选择，魔法营地实际地图从1800×1600扩至3600×3200，世界地图继续使用既有独立透明插画及 `detailStyle: illustration`。本次没有重新生成插画，没有修改 `world-map-art.json` 的原始来源、文件、CDN或SHA-256；不能将本次日期标记为插画生成日期。

海岸、道路中心线、地标、NPC与角色坐标同比放大，叠加仍按 `x/w、y/h` 映射，归一化位置保持一致。建筑与树木实际尺寸保持不变，主路82/支路46和广场270×165也不是等比放大，因此旧插画中的房屋、道路和森林表现比例与实际场景存在差异；插画仅用于导航展示，实际行走与碰撞以运行时地图为准。此次保留插画是用户批准方案中的特定选择。


## 2026-10-26：横向群岛长地图（覆盖前述群岛布局与漩涡导航约定）

群岛沿同一水平轴展开：魔法营地为最左侧起点，其后为字源岛、哈奇岛、火鸟岛、寒冰岛、沙漠岛、幽暗岛、潮汐岛、浮岸岛、风帆岛。保留独立插画、全画布映射、岛屿身份和真实游戏坐标，仅修改图册坐标。岛名固定放在图下，下行显示 BalanceParams 的建议等级；沿用低等级确认，不新增等级锁。

相机垂直居中且完整显示岛屿高度；鼠标／触屏拖动沿横轴浏览；滚轮保持缩放。底栏两侧使用 SVG 箭头图标，点击箭头及键盘左右方向键以320毫秒缓出动画横移。中间是可拖动的进度条，下方列出所有岛名，点击岛名平滑定位；高亮随视口中心最近的岛屿更新，独立于玩家所在岛。小屏岛名竖排，仍同时展示全部岛屿。加减按钮、双指及滚轮缩放，最小倍率保留岛屿可读尺寸，不再把整条群岛缩成微小全景。打开默认定位当前或上次哈奇岛屿，缩放和窗口尺寸变化保留边界约束。

复用两张既有漩涡入口，在火鸟岛之后、寒冰岛之后的海峡各放一处。首批目的地复用现有数据：深圳（114.0579,22.5431）、深圳湾公园（113.97665,22.5217）。清单 `travel: true` 表示哈奇侧点击实际调用已有 `travelEarth`，保留战斗／副本限制、异步身份与取消检查、现实场景准备和原岛返回位置。现实侧点击仍切回哈奇图册。未配置 travel 的入口保持只切地图，不作为海上落点。

本次仅改本地源码和清单，无新美术、CDN上传或网页发布；真实页面传送及触屏手势仍待人工实测。


地图平移动画在拖动地图、拖动进度条、缩放、重新定位、改变视口或关闭地图时取消，连续按方向键从当前画面接续到累计目标；系统偏好减少动画时直接定位。进度条使用原生 range，可用键盘操作；图标按钮保留中文无障碍名称。


手机默认取景：视口宽度小于600px时，岛屿适配预留左右共24px、上下共96px，初始使用适配倍率98%；底部保留岛名及等级空间。桌面继续左右48px、上下120px及90%的默认倍率。此调整使手机岛屿显示更大，不改变横向浏览、滚轮缩放或实际游戏坐标。


### 大量岛屿导航

进度条始终覆盖全部已登记岛屿，不按数量缩小岛名。岛名轨道使用最小宽度（桌面64px、手机竖排28px），超过可用宽度后独立横向滚动，支持触摸滑动、滚轮及滚动条。视口切换到另一个岛屿时，只在其名称不在可视区域内才滚动名称轨道；用户自行浏览名称时不会被每帧拉回。超过12岛时显示当前名称和序号／总数。

滑块可连续拖动，方向键逐岛定位，PageUp／PageDown跨10岛，Home／End到首尾。已有100岛内存夹具验证导航和高亮；这是导航容量验证，不代表新增100岛内容或全部地图美术加载性能验收。
