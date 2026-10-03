# 城市街景副本 1.0

2026-10-03：南头古城与深圳湾海韵园已接入城市节点副本，未配置城市使用连续街区生成版本 2。旧默认副本的本机路由缺少版本时仍按版本 1 恢复；重新进入使用新版本。游戏尚未发布。

## 两处样板与事实边界

两处场景各约 300 米见方，WGS84 局部米制转换，每米 16 游戏单位，地图 4800 × 4800。南头中心为 113.9157,22.5454；海韵园为 113.97665,22.5217。深圳湾保留 `city:shenzhen:bay`，既有动作、道具、战斗和学习编号不变；南头使用 `city:shenzhen:nantou`。每处 6 位可交谈居民，另有路线行人。南头新增生活递送互动与外围可选遭遇，深圳湾原任务条件继续保留。

原始数据在 `scripts/sources/places/`，带抓取时间、接口、坐标系和 OSM 对象编号。南头导入 27 段道路、63 个建筑占地；海韵园导入 26 段道路及岸线，范围内没有可用建筑轮廓。道路宽度缺失时按类型推定，报告中逐项列出。地面与岸线由底图约束，门洞为人工校正；店面外观、招牌、摊位、绿化和居民为艺术补全，不代表真实商户调查。南头已有轮廓不足以覆盖全部沿街立面，补充店面明确标记为艺术生成。高楼只表达压低后的底部与轮廓。

参考：[南头古城官方介绍](https://wtl.sz.gov.cn/lyfw/lyxw/content/post_10984289.html)、[深圳湾绿道资料](https://cgj.sz.gov.cn/xsmh/szlh/jpld/content/post_2053209.html)。地图数据 © OpenStreetMap contributors，遵循 [ODbL 许可与署名](https://www.openstreetmap.org/copyright)。场景画面和互动菜单保留署名入口。

## 运行时契约

城市 JSON 仍是唯一作者源，索引仅保存路由。可选 `streetscape.version:1` 定义 surfaces、roads、colliders、objects、routes、signals 及 provenance；没有此字段的副本继续走旧渲染。契约详见 [技能引用](../.github/skills/haqi-recreate-place/references/streetscape.md)。

- `adventure_city_street_core.js`：多边形与水岸碰撞、脚底半径、安全落点、空间索引和交通停走。碰撞不随遮挡淡化改变。
- `adventure_city_navigation_core.js`：12 单位网格 A*，窄巷考虑脚底宽度，直线检测及路径平滑；保留旧世界寻路。
- `adventure_place_import_core.js`：地理转换、边界裁剪和来源记录。未支持的带洞多边形会报告缺口，需要作者处理，不静默填洞。
- `adventure_city_street_layout_core.js`：按种子组合道路、支巷、沿街店铺、开放空间和少量交通；明确标为艺术生成街区。
- `adventure_city_people_core.js`：直接读取正式主角20组现代居民部件，稳定混合儿童、成年人和老人；可按路线指定换头/换装。全部行人使用主角同款HeroRenderer、人物尺寸及四向步行/转头，步态按实际距离推进。固定NPC继续用WebP，也可配置character使用分层角色。
- `view_city_street.js`：512 单位地面分块，LRU 上限 48 块；物件空间索引按视野查询。人物与车辆独立更新，离场释放街景缓存和图片引用。建筑与树冠挡住玩家或近处交互人物时淡化。

地图校验只为街景放宽到 8192 单位。原副本身份、事件、奖励、返回链和未结束战斗继续复用原系统；原始地理数据不进入存档。旧位置落入新障碍时迁移至附近安全落点。

车辆只沿作者车道行进，红灯停等、接近玩家停车；没有伤害或驾驶。现实样板没有添加无资料支持的信号灯，默认艺术街区提供信号灯。开放车道到边界后循环出现，属于环境演出，不是完整交通仿真。减少动态数量不删除固定可交谈居民。

## 美术与制作

16 张透明 WebP 在 `assets/adventure/earth/streets/`，每张不超过 200,000 字节。共享清单 `data/adventure/earth/street-art.json` 记录永久 Keepwork CDN、原图/转换图哈希、尺寸及来源；招牌由程序绘制。美术共 1,656,884 字节，最大单张 164,082 字节。默认加载 CDN；缺失图片时保留可行走的原生占位和互动。

使用 [haqi-recreate-place](../.github/skills/haqi-recreate-place/SKILL.md) 获取其他地点。`fetch_place_geometry.py` 支持 Overpass 与本地 OSM XML/JSON、GeoJSON；`import_place_geometry.mjs` 只生成可编辑布局片段和缺口报告；`prepare_shenzhen_streets.mjs --write` 重建本轮两个样板。通用地点通过已有城市节点更新工具接入，不能用深圳样板脚本覆盖其他作者内容。

预览：`tests/fixtures/city-dungeons.html?city=shenzhen&node=nantou` 或 `node=bay`，点击「直接进入节点」。预览角色仅在内存，支持步行、互动、恢复演练和性能采样。实际验收结果见 [QA 记录](qa-report.md)。
