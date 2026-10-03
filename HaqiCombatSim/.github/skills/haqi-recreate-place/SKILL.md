---
name: haqi-recreate-place
description: 按地点或坐标为魔法哈奇制作可步行的真实街景副本，从OSM或GeoJSON提取道路、建筑和水岸，生成WebP布景与居民交互并接入现有城市节点。用于局部景点复刻，不用于全球地图迁移、经营模拟或游戏发布。
---

# 按坐标复刻街景

定位 HaqiCombatSim 并读取 AGENTS.md、目标单城 JSON 和 [街景契约](references/streetscape.md)。保留城市/副本/动作/学习/战斗稳定ID，兼容现有存档与返回链。使用现有 `haqi-generate-city-dungeons` 管理节点归属，`haqi-populate-city` 管理居民，`haqi-story` 处理简明对话。

输入地点名称或坐标；只有名称时先查证地点位置，不能把同名地铁站当景点。默认 WGS84、300米见方、16游戏单位/米；明确声明其他坐标系时先转换并记录，禁止混用高德/百度偏移坐标。现有世界节点位置可能是概略坐标，应核对后校正位置但保留入口身份。

## 获取与检查底图

```powershell
python -X utf8 scripts/fetch_place_geometry.py --lon 113.9157 --lat 22.5454 --meters 300 --output scripts/sources/places/nantou.osm.json
node scripts/import_place_geometry.mjs scripts/sources/places/nantou.osm.json --lon 113.9157 --lat 22.5454 --style old --output .cache/nantou-street.json
```

网络失败时可导入本地 OSM XML/JSON 或 WGS84 GeoJSON：`fetch_place_geometry.py --input <文件> --output <快照>`。默认请求包含客户端标识和100米边缘，最多3次，失败要报告。不得把空响应、部分超时响应或生成街区当成真实数据。原始几何保留于 `scripts/sources/places/`；读取原始数据的来源日期、许可、对象ID与覆盖报告。GeoJSON保留其自身许可，不自动标成OSM。

检查 `report.skipped`、缺失宽度、地下道路及桥梁。宽度缺失的默认值是艺术推定，不是测量。复杂洞、多关系轮廓与过大建筑需要先补充转换/拆分，不能忽略后宣称完整还原。海岸线必须连续且确认陆海方向后闭合；深圳湾示例的向南闭合只适用于该样板，不能照搬全球。坐标原点、范围与数据快照一起保留。

## 布景与生活

真实道路/建筑占地固定，新增立面、摊位、花盆、树木和行人路径标为艺术加工。优先复用 `street-art.json` 的共享WebP；固定斜俯视、低层立面、透明背景、脚底锚点。地标需查官方资料/照片，不能把通用古城门称为精确建筑模型。缺少覆盖时明确说明，沿街补全不得改写真实来源ID。

生成新素材使用 imagegen；按素材准备与上传技能压缩WebP，每张≤200000字节，保留来源/输出哈希、尺寸与锚点。上传成功后才填写永久Keepwork CDN URL，并验证GET哈希、alpha与CORS。`prepare_city_street_art.py` 的分格坐标仅对应已检查的首批图集；新图集先查看实际边界，不盲用相同切分比例。

用现有NPC和动作构建生活互动。车辆/行人只沿审核过的道路运行；红绿灯仅在来源支持的地点设置，灯周期可艺术模拟。漫游不写云存档，不添加真实交易与伤害。新遭遇放外围，不强制清怪才能游览。

行走人物必须使用主角同款可换装角色，优先复用hero-art中20组现代男女老少，不能沿路线平移单张居民WebP。路线可配置characters的appearance/headId/bodyId，也可采用默认年龄混合；固定NPC可以保留portrait或指定character。不要另生成步行人物图集，也不要复制清单中的裁剪和头颈锚点。

## 写回与更新

城市JSON是唯一运行时作者源；导入产物是布景片段，不会自动覆盖剧情。将片段合入节点，补齐出生点、出口、居民、热点、动作与可选遭遇，再使用 `update_earth_city_node.mjs` 先检查后写入。布局更新只替换 `map/streetscape` 与必要点位；素材更新只替换清单引用；内容更新保留既有事件身份。仅用户要求重新制作两个深圳样板时运行 `prepare_shenzhen_streets.mjs --write`，它会重新生成样板布局，不能用于任意城市更新。

每个几何对象保留 provenance/sourceId；完整数据不进入玩家存档。生成版本缺失的旧默认城市继续按v1恢复，新进入采用v2。已有地标与城市总入口共享副本身份，不按距离绑定全部周边城市。

## 验证交付

运行 `node scripts/preview_city_streets.mjs --city data/adventure/earth/cities/<id>.json --output .cache/street-qa/report.html` 生成同尺度底图/艺术布景对照与素材预览。此报告来自配置几何，不是卫星影像；需结合原始快照和官方参考核验。

运行 `node scripts/check_earth_cities.mjs`、相关 `battle_city*.test.mjs` 和 `npm run test:battle`。核验每个交互点可达、窄巷/门洞/水岸碰撞、车辆停让、读档安全落点、取消加载、素材失败和缓存释放。

使用 `tests/fixtures/city-dungeons.html?city=<城市>&node=<节点>` 的隔离内存角色，检查桌面与390px；保存场景截图及底图对照。报告哪些布局来自真实数据、哪些是艺术补全、未覆盖内容和实际验证范围。更新架构、QA和当日开发日志；默认不提交、推送或发布游戏。
