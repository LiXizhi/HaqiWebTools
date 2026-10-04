# 街景 v1 契约

节点仍使用 `dungeon.map/npcs/hotspots/actions/encounters/completion`；`streetscape` 可选。没有该字段时维持旧渲染与矩形障碍。街景地图600–8192单位；角色脚底避让半径8单位。

| 字段 | 契约 |
| --- | --- |
| `version` | 当前为1，未知版本拒绝加载 |
| `geo` | `crs:WGS84`、中心`lon/lat`、`meters`、`unitsPerMeter:16`，游戏x向东、y向南 |
| `provenance` | 来源类型、许可/署名、快照路径、数据日期、查阅日期及艺术处理说明 |
| `surfaces[]` | 独立id、`points:[{x,y}]`、`kind/color`；所有坐标在地图内 |
| `roads[]` | id、折线points、width、`kind:road/walk`；保留sourceId/name/widthSource/bridge |
| `colliders[]` | id与多边形points；同时兼容map.obstacles矩形；水面必须有对应碰撞 |
| `objects[]` | id、`type:building/prop/tree`、art清单key、x/y脚底中心、w/h绘制框；可选footprint、sortY、label、sourceId、provenance |
| `routes[]` | id、`kind:pedestrian/vehicle`、points、speed、count；车辆可选art/stops；行人可选characters外观数组 |
| `characters[]` | `{appearance:boy/girl,headId,bodyId}`，引用正式hero-art；按人数循环选取，可独立换头/服装，保持同性别模板；缺省混合20组现代男女老少 |
| `npcs[].character` | 固定NPC可选同样的外观配置；缺省通过npcCharacter按稳定编号选择主角同款换装外观；portrait仅保留来源，不显示。NPC位置、名字和互动身份不变 |
| `stops[]` | signal为signals.id，distance为沿路线长度的停车线；不是世界x坐标 |
| `signals[]` | id、x/y、period/green秒数、offset秒数；位置与模拟周期分别记录来源 |
| `crossings[]` | x/y、w/h与angle弧度，配置有依据的斑马线 |
| `markings[]` | 可选静态地面标线；全局唯一id、地图内折线points、width大于0且不超过8、六/八位十六进制color；最多512条，进入地表缓存，不增加碰撞 |
| `wear[]` | 可选局部地面使用痕迹；全局唯一id、3—32个地图内points、八位十六进制透明color、kind为footfall/moisture/asphalt-repair/tree-soil/wash；最多512块，按tile裁剪烘焙，无碰撞 |
| `coverage` | roads/buildings/surfaces计数，skipped原因、inferredWidths与原海岸线 |

对象ID在所有街景数组中唯一。背景分块512×512，上限48块；物件按包围盒索引，保留大建筑在屏外锚点时的可见部分。地面缓存不依赖WebP到达，物件在动态图层绘制，避免网络迟到污染缓存。离开街景释放物件图片与缓存，下次进入重新登记。

当前华南样板地表缓存上限24MiB；`transitions.gutters:true`在主路内侧烘焙窄排水带，其他步行路径后绘制以保留通路。停车标线只配置在有用途的停放区，候车小路从亭侧进入等待区，不穿亭体或伸入机动车道。井盖和道路附属设施随真实道路折线定位。

磨损使用独立种子和较低透明度，不改战斗序列；门口、排水沟、树池和检修处分别表达使用原因。新增物件必须在场景中有对应的用途与位置，不能只生成图片。地图底部的盆栽/鞋架应退开门前横向通道，以18单位半径逐点复验。华南样板镜头收边使用clampCameraToWorld，保留像素对齐和统一screenToWorld坐标；小于视野的地图居中，不影响其他主题。

图片清单 `data/adventure/earth/street-art.json`：version、entries字典，每项id/local/cdn/width/height/bytes/sha256/sourceSha256/source/encoding/anchor。可选npcAtlas与residents供通用街区复用。客户端只能使用核验过的Keepwork CDN；本地路径只走既有显式离线模式。

2026-10-04：单图条目继续兼容；图集帧采用 `entries[key]={id,atlas,crop:[x,y,w,h],width,height,anchor,signSlots?}`，资源信息移至 `atlases[atlas]`，共享资源按id去重。signSlots为归一化x/y/w/h、angle弧度、color；物件text在挂点绘制。objects可加ground布尔字段（地表缓存层）与components数组（art、相对脚底x/y、w/h、可选text）。附属组件随建筑排序、遮挡与视野包围盒；不得把装饰全高用作碰撞。默认城市版本3使用华南生活街区，版本1/2恢复原布局。

碰撞与视觉高度分开。实际楼高可留在heightSource，但绘制高度压缩；不得用透明度放开碰撞。城门通道不能把整座建筑占地填死，需要审核后的门洞通行空间。

路线到达开放端点后从另一端再生成；步行来回必须显式写回程点。屏外不绘制、减少动态设置冻结动态而保留对话。所有动态仅内存，离开后重建，不影响战斗随机数。

行人全部复用主角HeroRenderer，人物尺寸、头颈连接点、四向六帧步行及转头来自hero-art清单。旧route.portrait保持可读但不再用于绘制行走角色。未指定characters时，由city_people_core按节点身份确定性混合儿童、成年人和老人，默认选择已配对的头部/身体以保持肤色连接。步行动画按实际前进距离推进，停车/减少动态时使用静止帧；开放端点跳转不计入步态距离。只预热当前场景角色，离场清理演员状态，共享主角图片缓存继续复用。

2026-10-04：所有静态街景美术统一正面略俯视（约12度），楼房露少量屋顶，候车亭/长椅/花池只露薄顶面；完整提示词和质量门槛见 `../../haqi-generate-city-dungeons/references/street-art-direction.md`。objects可用imageOffsetY调整楼体与店面接合，不能改变脚底排序/碰撞锚点；包围盒必须包含上移后的立面。门前走齐平小路，楼间通道保持实际可达，树冠不可整幅做碰撞。


可选doorNodes/facilityNodes/restNodes各最多128个地图内{id,x,y}落脚点；门口、候车、停车和休息用途需完整寻路验证。transitions.aprons最多32个地图内3—16点多边形，配置material和六位十六进制color，表达齐平路缘入口；transitions.tactile最多32个地图内{x,y,w,h}提示铺装，w≤120、h≤24。仅烘焙地表，不额外制造阻挡台阶。所有新增字段缺省时兼容旧作者街景。
