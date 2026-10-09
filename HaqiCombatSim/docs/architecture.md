
## 2026-09-30：单客户端内存读取与 Cache 直接写入

按用户确认的单客户端写入模式，登录读取服务器最新目录；后续角色入口、已加载分片和宠物文件以内存为准，未加载文件首次使用才读。保存不再查询远端版本或读取历史判断远端分支。主动刷新角色目录和重新登录会重新读取；账号/token 变化使旧请求失效。本地未同步进度与登录快照不同仍保留备份选择，避免直接丢弃本地数据。

所有游戏文件写入集中于 `keepwork_file_io.js`，继续使用 `personalPageStore.withWorkspace('HaqiAdventure')` 的 Cache 接口：`savePageData(path,'content',text,true,true,{directWrite:true})`。新增 SDK option 默认关闭，仅游戏调用启用；跳过 SDK 文件预读和合并，不安排后台同步，等待 pageCache PUT 明确成功，不再写后 GET。支持 `.json` 与 `.md` 完整内容，不改变原文件格式或其他 SDK 用户的默认行为。SDK 能力标志未就绪时沿用旧 Cache 暂存/同步接口，不绕开 SDK；旧 CDN 包仍可能有 SDK 内部预读，新选项上线后才消除这部分请求。

成功后更新内存入口和文件缓存；失败、超时或身份变化不标记角色已同步。写入顺序是分文件、当前入口；2026-10-05 已移除角色目录历史快照和父版本链。同客户端角色保存和 SDK 同路径直接写入串行。不可变分片成功后可复用，重试不重复上传已经确认的文件。关系正文、历史及每日额度首次读取后复用内存；SDK 没有新增远端 CAS。

社交关闭后台轮询，岛屿入口读取名单，邮件在打开时读取，公开名片复用内存并在主动刷新时失效；内容未变化不重复发布。会员普通查询合并请求并复用账号内存，手动刷新、充值和账号事件更新状态。角色目录按角色进一步拆分加载尚未在本轮实现；当前登录仍加载既有角色必要分片。


# HaqiCombatSim — 技术架构

## 架构图

以下按当前源码（2026-10-01）展示主要模块与数据流，省略独立预览工具及部分玩法子模块。图中箭头表示启动、调用或数据传递，不是完整的 import 依赖图；GitHub 可直接渲染 Mermaid 图。

### 1. 游戏与实验室的分层

哈奇岛屿的静态渲染（2026-10-05）：视野物件集合跨帧复用，静态Y顺序与动态角色合并。树木仅将连续且不遮挡玩家的片段合成有界缓存，固定深度区间分组并保护当前视野批次，避免内存满后反复重绘；NPC、怪物、建筑与淡化树冠仍按原深度顺序绘制。地表在独立原生模块Worker中使用同一地形画笔，传回ImageBitmap；不可用或失败时恢复原分帧准备。

```mermaid
flowchart LR
    Island[六岛既有JSON与场景] --> ViewSet[带预留边界的视野物件集合]
    ViewSet --> Order[静态Y顺序与移动角色合并]
    Order --> Trees[连续树木片段缓存：最多24MiB]
    Order --> Actors[原角色与遮挡淡化绘制]
    Island --> Tiles[地表调度：视野与前方邻块 / 最多64MiB]
    Tiles --> Worker[island_terrain_worker：同一地形画笔]
    Worker --> Bitmap[可释放ImageBitmap / 过期应答关闭]
    Tiles --> Fallback[Worker失败：原分帧画笔回退]
    Bitmap --> Canvas[冒险Canvas]
    Fallback --> Canvas
    Trees --> Canvas
    Actors --> Canvas
    Actors --> PetPaths[宠物绕障与自动聚会选址：共享按需路径Worker]
    PetPaths --> OriginalPath[原findPath与聚会算法 / 几何版本及离场检查]
    OriginalPath --> Actors
    QuestInputs[任务与装备相关状态：每帧轻量比对] --> MarkerCache[任务标记缓存：状态变化才重新检查]
    MarkerCache --> Actors
    MarkerCache --> Minimap[小地图与交谈邀请复用]
```

任务标记缓存由renderer实例持有，`adventure_quest_marker_cache_core.js`每帧比较任务/库存/装备等相关字段的序列化快照，以覆盖原地修改；坐标、血量、计时和通用revision不参与。状态不变时每个NPC（含无标记）只求值一次，全部NPC共享一次按需属性快照；换角色、场景或内容配置引用时失效。缓存仅用于显示，实际接取/交付仍即时校验原规则。

```mermaid
flowchart TB
    subgraph Entry[页面入口]
        Game["Haqi.html"]
        Lab["HaqiCombatSim.html"]
    end
    subgraph Browser[浏览器编排与展示]
        Boot["adventure_boot.js<br/>语言初始化与启动"]
        Adventure["adventure_app.js<br/>冒险流程编排"]
        App["app.js + state.js<br/>实验室控制与状态"]
        GameView["view_adventure*.js<br/>Canvas 2D 场景与 HTML 菜单"]
        AtlasView["view_haqi_atlas / view_adventure_earth<br/>连续群岛地图 / 配对漩涡导航"]
        LabView["view_battle / batch / params / advisor<br/>实验室界面"]
        IO["浏览器 IO 与服务适配<br/>资源、存档、语言、社交、原服导入<br/>会员身份与官方充值商品价格"]
    end
    subgraph Core[纯规则层：可在 Node 中运行]
        AtlasGeometry["haqi_atlas_core.js<br/>相机 / 局部坐标转换 / 细节层级"]
        Rules["adventure*_core.js<br/>探索、任务、装备、宠物、副本"]
        Combat["combat_*_core.js<br/>战斗、公式、目标与 AI"]
        Shared["rng_core.js + combat_params_core.js<br/>种子随机数与 BalanceParams"]
    end
    Data["运行时 JSON<br/>data/adventure + data/kids<br/>实验室另支持 teen / sample"]
    Services["Keepwork CDN / SDK<br/>及已配置的在线服务"]

    Game --> Boot --> Adventure
    Lab --> App
    GameView -->|玩家意图回调| Adventure
    Adventure -->|状态与演出| GameView
    Adventure -->|只读地图模型| AtlasView
    AtlasView -->|选择目的地 / 浏览配对世界| Adventure
    AtlasView --> AtlasGeometry
    IO -->|按需地图清单与透明 WebP| AtlasView
    LabView -->|操作回调| App
    App -->|状态与结果| LabView
    Adventure --> Rules --> Combat
    App --> Combat
    Combat --> Shared
    Adventure --> IO
    IO --> Services
    Data -->|浏览器加载与校验| Adventure
    Data -->|注入 JSON 读取器| App
```

**分层边界：** 视图负责绘制和事件绑定，控制器协调玩法与 IO；核心规则不访问 DOM、网络或浏览器存储。冒险与实验室复用战斗规则，新增玩家内容以 kids 为范围。冒险细节见 [冒险系统](adventure.md)。

会员充值仅在打开充值页时，由 `adventure_membership.js` 调用 `adventure_recharge_pricing.js` 读取官方公开商品目录（只查询价格，不创建订单），合并并缓存查询；手动刷新可重查。金额、天数、续费日期与魔豆预估由纯 `adventure_recharge_core.js` 计算，再交给视图显示；价格失败时不使用猜测单价，账号身份与付款结果仍以现有 SDK 链路确认。

### 地球世界的按需数据流（2026-10-02）

### 城市节点副本（2026-10-03）

街景 1.0 在既有节点契约上增加可选 `streetscape`；详情见 [城市街景](city-streets.md)。所有原始地理资料保留在制作侧，不进入玩家存档。

```mermaid
flowchart LR
    Source[坐标 / OSM / GeoJSON] --> Import[place_import_core：米制转换 / 裁剪 / 来源]
    Import --> Archive[制作快照与缺口报告]
    Import --> City[单城 JSON streetscape]
    Art[透明 WebP / CDN 清单] --> City
    Generated[种子街道生成版本 1 / 2 / 3] --> City
    Living[版本3：华南组合街区 / 固定比例 / 生活设施] --> Generated
    Atlas[分组WebP Atlas / 裁剪帧 / 可替换招牌挂点] --> Painter
    Atlas --> City
    City --> Collision[street_core / navigation_core：碰撞与寻路]
    City --> Painter[view_city_street：分块缓存 / 视野索引 / 遮挡]
    City --> Motion[street_core：行人与车辆]
    HeroManifest[hero-art：20组现代男女老少] --> People[city_people_core：稳定配对 / 年龄混合 / 指定换装]
    People --> Motion
    Motion --> HeroDraw[hero_renderer：主角同款四向步行与转头]
    City --> Existing[既有节点互动 / 战斗 / 进度 / 返回链]
```

```mermaid
flowchart LR
    CityLandmark[世界地图城市大地标] --> CityConfig[按需单城JSON：明确节点绑定]
    CityConfig --> RootEntrance[现实地面城市总入口]
    CityConfig --> NodeEntrance[现实地面命名节点入口]
    RootEntrance --> Overview[城市总览：导航引用]
    Overview --> Node[同一节点副本ID]
    NodeEntrance --> Node
    Unconfigured[未配置的命名城市节点] --> Default[city_generated_core：种子街区 / 玩家队伍等级]
    Default --> Node
    Node --> Rules[纯规则：道具 / 条件 / 事件]
    Node --> View[俯视Canvas布景 / 已有NPC与宠物]
    Rules --> Battle[既有kids战斗与真实结算]
    Node --> Learning[既有可选语言交流]
    Rules --> Records[城市 / 副本动作与胜利：records]
    Node --> Local[返回链 / 坐标 / 未结束战斗：本机]
    Local --> Loader[轻量路由恢复活动副本]
    Loader --> CityConfig
    Loader -->|本机默认城市路由| Default
```

`adventure_city_dungeons_core.js` 管理节点契约、明确归属、道具和故事进度；城市加载器负责按需读取与过期请求检查。未配置城市使用 `adventure_city_generated_core.js` 的确定性街区，沿用试炼生命、儿童版技能与奖励，根据当前玩家及准备队伍的最高等级安排挑战。默认城市的来源、布局种子、挑战等级与队伍人数仅存本机以恢复活动场景。副本保留原有战斗结算接口，城市地图构造独立于线性清怪地图。生成技能只在开发期更新单城作者源与轻量路由，不调用运行时内容生成服务。

### 连续地球场景

2026-10-03：地球玩家导航允许已加载水域，`adventure_earth_boat_core.js` 根据地形和桥面推导临时船状态，`view_earth_boat.js` 叠放四向WebP与人物；不写入坐骑装备或云存档。道路采样在宽水域的已知岸端提供码头元数据，地球服务随局部场景更新并按需登记/释放船图集。普通地图抵达保持陆地校验，本机恢复可保留水上坐标。

```mermaid
flowchart LR
    RoadSample[城际道路完整采样] --> ShortBridge[短河桥面]
    RoadSample --> Dock[宽水域已知岸端码头]
    Terrain[已加载地形] --> Navigation[玩家与队伍水陆导航]
    Navigation --> Mode[按位置推导船状态]
    ShortBridge --> Mode
    Mode --> BoatView[四向船WebP与人物叠放]
    Dock --> BoatView
    LocalRestore[本机位置恢复] --> Navigation
```

```mermaid
flowchart LR
    MapButton[右上角地图按钮] --> Chooser[世界选择器：零 Earth 请求]
    Chooser -->|选择地球| Atlas[轻量索引 / 概览 / 城市目录]
    Atlas --> AtlasLayout[earth_atlas_layout_core：按屏幕疏密筛选 / 名称避让 / 点击命中]
    AtlasLayout --> AtlasView[全球图册：固定屏幕尺寸圆点 / 名称与周边点击 / 轻触抖动容错]
    Atlas -->|可见视野| Cache[EarthCache：合并 / 并发 / 字节预算 / 淘汰]
    AtlasView -->|选择城市| Prepare[加载到达区并校验安全落点]
    Prepare -->|成功后切换| Provider[连续地球提供器：局部物件 / 碰撞 / 寻路]
    Provider -->|步行邻域与前方预取| Cache
    Cache --> CDN[HelloWorld 地形 PNG / 城市 CSV]
    Cache --> StreamWorker[按需流送Worker：Offscreen地形与图集分类 / CSV / 道路与物件候选]
    StreamWorker --> StableCache[有界分类 / 道路拓扑 / 逻辑块缓存：输入版本失效]
    StableCache --> Packets[64行背压分包：重叠物件引用 / 仅新增地形分类]
    Packets --> Staging[暂存场景：增量复用 / 碰撞与静态索引 / 地表失效范围]
    Staging --> FrameCommit[帧边界交换引用：epoch与请求版本校验]
    FrameCommit --> Provider
    SharedBudget[earth_work_scheduler：共享2ms准备预算 / 无Worker同规则可暂停回退] --> Staging
    SharedBudget --> SocialStream
    ImageWorker[image_bounds_worker：岛屿与地球共用 / 按需启动 / 空闲释放] --> ResourceWarm[图集透明边界 / 新名单外观与宠物预热 / 异步解码]
    SharedBudget --> ResourceWarm
    ResourceWarm --> Canvas
    Provider -->|进入作者城市| Region[单城 JSON：居民 / 地标 / 故事 / 文化 / 美术引用]
    Region -->|附近交互| Story[内存故事 / 支线 / 语言学习]
    Region --> Portrait[按需 NPC WebP：进入登记 / 离开释放]
    Provider --> SocialStream[社交候选落点 → 视野与距离筛选：最多6位AI]
    SocialStream --> SocialScene[活动角色 / 随行宠物：同步淡入淡出与卸载]
    SocialScene --> Canvas[相机附近 Canvas 2D 渲染]
    Provider --> Wild[轻量出生点：359种四阶段目录 / 原始urban地类距离 / 玩家等级与装备战力]
    Wild --> WildStream[复用AI流送生命周期：视野附近最多6只 / 按需创建虚拟装备遭遇 / 淡入淡出卸载]
    WildStream --> Canvas
    Wild --> Existing
    Provider --> Canvas
    Provider -->|局部道路、真实地类与小装饰| SurfaceBake[单Worker地表烘焙：小物件与投影 / 磨损公路 / 渐隐路肩]
    SurfaceBake -->|OffscreenCanvas成品ImageBitmap / 分帧Canvas回退| SurfaceCache[有限地表分块缓存：边界变化才重排队列]
    SharedBudget --> SurfaceBake
    SurfaceCache --> Canvas
    Provider --> SceneViewCache[静态视野列表：128单位余量 / 索引失效刷新 / 活动角色Y合并]
    SceneViewCache --> Canvas
    Canvas --> FrameMeter[固定计数器：左下角FPS / 500ms更新 / 暂停重置]
    DeviceSettings[本机画质 / 昼夜 / 模拟天气偏好] --> Atmosphere[environment_core：日照 / 独立种子天气]
    Atmosphere --> AtmosphereView[environment painter：48粒子 / 12暖光 / 水体网格 / 颜色覆盖]
    Provider --> AtmosphereView
    AtmosphereView --> Canvas
    Provider --> Crossings[纯规则：短河段桥梁 / 宽水面截断]
    Provider --> CollisionIndex[纯规则局部碰撞索引：流送对象版本变化时刷新]
    CollisionIndex --> Walking[走路 / 寻路：仅查询附近道路和建筑]
    Crossings --> Canvas
    Crossings --> BridgeCollision[桥面通行：原始水体分类保持不变]
    Story --> Existing[现有团队 / 语言学习 / 战斗]
    Existing --> Records[持久化 records 分片]
    Provider --> Local[位置及未结束战斗：本机 IndexedDB]
```

`adventure_earth_core.js` 保持纯规则；浏览器加载由动态导入的 `adventure_earth.js` 负责。打包器明确排除启动包中的 Earth 内容，逐个保留原相对 JSON 路径。图层共享经纬度变换，不建立全球对象列表或位图；完整单城 JSON 与地理数据独立缓存。详见 [地球世界](earth-world.md)。

### 2. 批量模拟与可复现验证

```mermaid
flowchart LR
    UI["实验室批量面板<br/>数据集、参数、seed、场数"] --> Pool["sim_pool.js<br/>任务分配与结果汇总"]
    Pool -->|初始化数据与参数| Worker["sim_worker.js<br/>ES Module Worker"]
    Pool -->|批次任务| Worker
    Worker --> Batch["sim_batch_core.js<br/>runJob"]
    Pool -.->|无 Worker 时本线程回退| Batch
    Batch --> Engine["战斗核心<br/>公式、AI、种子随机数"]
    Engine --> Stats["批次统计<br/>胜率、回合、unsupported"]
    Stats -->|进度与结果| Pool
    Pool -->|汇总展示| UI
    CLI["Node CLI / tests<br/>直接导入纯规则模块"] --> Batch
    CLI --> Engine
```

相同 seed、数据和参数用于重现模拟结果；BalanceParams 统一提供数值覆盖。Worker 将批量运算移出主线程，未支持卡牌效果必须进入统计，不静默忽略。公式来源见 [Lua 对照表](lua-mapping.md)。

### 3. 本地存档与可选云同步

```mermaid
flowchart TB
    State["内存中的角色状态<br/>adventure_app.js"] --> Roles["adventure_roles.js<br/>账号隔离、自动保存、核心变化判定"]
    Roles --> Split["adventure_storage_core.js<br/>持久数据与临时状态拆分 / 组装"]
    Split --> Local["localStorage<br/>本地角色核心存档与待同步状态"]
    Split --> Runtime["adventure_runtime_store.js → IndexedDB<br/>当前生命、饥饿、坐标、计时、未结束战斗"]
    Settings["game_settings.js<br/>设备级画面与音频设置"] --> SettingsDB["独立 IndexedDB<br/>不触发角色同步"]
    Roles -->|登录后，仅核心变化置 dirty| Cloud["adventure_cloud.js<br/>分片组织与同客户端顺序写入"]
    Cloud --> FileIO["keepwork_file_io.js<br/>SDK 能力检测与 Cache 写入"]
    FileIO --> SDK["按需加载 Keepwork SDK<br/>workspace: HaqiAdventure"]
    SDK --> Parts["1. 写入变化的分文件<br/>物品、战斗背包、记录、宠物等"]
    Parts --> Index["2. 发布 roles/index.json<br/>仅保存当前小型状态与文件引用"]
    Index -->|成功应答后更新内存缓存| Cloud
    SDK -->|登录、主动刷新、首次读取未加载文件| Read["校验与组装<br/>保护本地未同步进度"]
    Read --> Roles
```

**存储边界：** 未变化分片复用已有引用；临时状态及设备设置不上传。云同步采用单客户端写入假设，不是多人实时状态服务器。SDK 支持时直接等待 Cache PUT 成功，否则兼容原 Cache 同步链路；失败、超时或身份变化不清除待同步状态。访客与网络失败时仍保留本地体验，详见 [用户存储](user-storage.md)。

## 2026-09-25 用户存储分层

当前云端入口为v2小型状态/引用清单；完整物品收藏、战斗背包、历史记录按角色分别保存，只更新变化的分文件。血量、饥饿、坐标、在线时长和未结束战斗仅存本机IndexedDB。`adventure_storage_core.js`负责纯数据拆装，`adventure_runtime_store.js`负责本地IO，`adventure_roles.js`按核心变化判断dirty。详见[用户存储结构](user-storage.md)；下文早期全量存档说明以该文为准。

## 原服导入分层（2026-09-21）

`haqi_original.js` 负责认证及选择性只读背包IO（默认全量以兼容独立测试页）；`haqi_import_core.js` 纯转换并校验新存档；`haqi_import.js` 暂存、身份核验与预览流程；`view_haqi_import.js` 渲染确认入口。预览复用现有背包/卡包面板，传入克隆存档且禁用持久化回调。最终确认才由 `adventure_app.js` 调用角色存储创建新角色，沿用账号隔离/并发写入检查，不直接写原服或云端。

## 1. 加载与运行模型

- 纯 ES Module + Vanilla JS，自带 `css/style.css`（不依赖 CDN，离线可用）；用任意静态 http 服务打开 `HaqiCombatSim.html` 即运行，无构建。
- `HaqiCombatSim.html` 只含顶栏 / `#main` / 底栏骨架，`<script type="module" src="js/app.js">`。
- 数据通过 `fetch('./data/{version}/*.json')` 加载，失败回退 `./data/sample/`。因此需要 http(s) 或 Live Preview 环境，`file://` 下 Worker 与 fetch 可能受限。
- 批量模拟运行在 `new Worker('./js/sim_worker.js', { type: 'module' })`，Worker 内只 import `*_core.js`。

## 2. 目录结构

见 [README.md](../README.md) "目录结构"。分层约定：

```
view_*.js  (DOM 事件) → app.js 回调 → state.js mutate → render(currentView)
                                    ↘ sim_pool.js → sim_worker.js → *_core.js
```

- `*_core.js`：纯逻辑，无 DOM / fetch / 全局副作用，Node 可直接测试。
- `view_*.js`：只渲染与绑事件，通过 `callbacks` 把意图交回 `app.js`。
- `state.js`：单一状态源，`subscribe/notify`。
- `data_core.js`（`readJson` 注入，浏览器用 fetch、Node 用 fs）、`llm_advisor.js`、`sim_pool.js`：唯一允许做 IO 的非视图模块。

## 3. 数据模型

### 3.1 数据集（只读，来自导出器）

```js
dataset = {
  version: 'kids' | 'teen',
  manifest: { cardCount, typeHistogram, supportedTypes, unsupportedTypes, unmapped, exportedAt },
  cards: { [key]: { key, spellName, type, target, pipcost, accuracy, hitchance, spellSchool,
                    requireLevel, canLearn, params: { damageMin, damageMax, damageSchool, dots, ... } } },
  charms: { charm: {[id]: {...}}, ward: {...}, miniaura: {...}, globalaura: {...} },
  statsByGear: { [school]: [ { from, to, hp, damageAllAbsolute, resistAllAbsolute, powerPipPercent,
                               outputHealPercent, criticalstrikeAllPercent, ... } ] },
  aiDecks: { [style]: { school, cards: [ { key, target: 'hostile'|'self', baseWeight, conditions: {colName: weight} } ] } },
  aiDecksByGear: { [school]: [ { from, to, style, cards: [ { gsid, key|null, count } ] } ] },
  hpTable: { [level]: hp },
}
```

### 3.2 BalanceParams（可写覆盖层，`combat_params_core.js`）

```js
params = {
  version: 'kids' | 'teen',
  global: { maxPips, maxRounds, handSize, deckCapacity, deckEachCapacity, deckPresetCopies,
            critDamageRatio, dodgeDamageRatio, maxSpellPenetration, areaSiblingRatio, healPenalty },
  //   deckCapacity / deckEachCapacity：卡包总容量 / 单卡上限（Lua 卡包道具 stats[167] / [170]），默认 40 / 6，0 = 不限
  //   deckPresetCopies：未自定义配卡时官方卡组每卡份数（默认 3；模拟器项）
  perSchool: { fire: { hp: 1, damage: 1, heal: 1, accuracy: 0, powerPip: 0, resist: 0, crit: 0 }, ice: {...}, ... },
  //   hp/damage/heal 为乘子；accuracy/powerPip/resist/crit 为加法百分点
  cardOverrides: { [cardKey]: { pipcost?, accuracy?, params?: { damageMin?, damageMax?, ... } } },
  fairPlay: null | { maxHp: {fire: n, ...}, forceDamageBoost, forceResist, forceAccuracyBoost, forcePowerPipChance },
}
```

`resolveParams(dataset, params)` 返回引擎实际读取的 `resolved`（卡牌模板已合并 override，perSchool 已归一）。`diffParams(a, b)` 用于面板高亮与调参器输出。

### 3.3 单位（`combat_unit_core.js`）

```js
unit = {
  id, name, side: 0|1, school, level, isBot,
  maxHp, hp, pipsNormal, pipsPower,
  stats: { damagePct: {school: n}, damageAbs: {school: n}, resistPct: {...}, resistAbs: {...},
           accuracyPct: {...}, crit: {...}, resilience: {...}, hitRating, dodgeRating,
           hitPct, dodgePct, penetration: {...}, penetrationReceive, powerPipPct,
           outputHealPct, inputHealPct },
  charms: [ { id, boostDamage, boostAccuracy, school, positive, dispelSchool, ... } ],
  wards:  [ { id, ... } ],
  absorbs: [ { remaining, school } ],
  dots: [ { school, perRound, rounds, casterId } ], hots: [...],
  miniaura: null | { id, rounds }, stun: 0, stances: [...],
  deckSpec: [ {key, count} ],            // setDeck → clampDeck 按 deckCapacity / deckEachCapacity 裁剪，deckTrimmed 记录裁掉张数
  deckSeq: [ cardKey... ], deckMap: [ 0|1|-1|-2|-3 ],  // 洗牌后的序列与状态：未抽 / 手牌 / 待弃 / 已用 / 失误补入
  cooldowns: { [spellName]: rounds },
  totals: { damageDealt, healDone, damageTaken, casts, fizzles, passes, noCardPasses },
}
```

卡包相关纯函数：`clampDeck(deck, {capacity, eachCapacity, cards, version})`、`deckCounts(unit)`（手牌 / 待弃 / 未抽 / 已用 / 失误 / 剩余 / 总数）、`isDeckExhausted(unit)`、`restoreDiscardedCard`。`playTurn` 对 `pick.discardSeqs` 的处理与是否出牌无关（Lua 允许弃牌 + 跳过）；无手牌时 `pass.reason` 为 `no_cards` / `deck_empty`。`checkFinish` 在双方存活单位全部打空且无 DOT 时提前判 `timeout` 平局（`decksExhausted=true`，纯加速，不改变结果）。

### 3.4 竞技场与事件（`combat_arena_core.js`）

```js
arena = {
  params: resolved, rng, round: 0, state: 'active' | 'finished',
  sides: [ [unit...], [unit...] ], globalAura: null | {...}, healPenalty: 0,
  events: CombatEvent[], stats: { perUnit: {...}, perCard: {...}, unsupported: {...} },
  winner: null | 0 | 1 | 'draw',
}
CombatEvent = { round, type: 'pip'|'pick'|'cast'|'fizzle'|'damage'|'heal'|'charm'|'ward'|'dot'|'hot'|'stun'|'death'|'end',
                casterId?, targetId?, cardKey?, amount?, crit?, dodged?, school?, detail? }
```

`advanceTurn(arena, picks)`：
1. 每个存活单位 `generatePip`；抽牌补到 `handSize`；cooldown / stun 递减。
2. `picks` 为 `{unitId: {cardKey, targetId} | null}`（由 Policy 给出；Human 由 UI 提供）。
3. 按顺序（先 side 0 再 side 1，或按 arena 顺序规则）逐个 `useCard`：合法性 → 扣 pips → accuracy → 分派 type 处理器 → 事件。
4. DOT / HOT 结算与递减，aura / miniaura / charm 时长递减。
5. 死亡判定；`round++`；`isFinished` 判胜负或超 `maxRounds` 判平。

### 3.5 策略（`combat_policy_core.js`）

```js
Policy = { pick(arena, unit, rng) => { cardKey, targetId } | null | Promise<...> }
```

- `DeckAttackerBot(aiDeckStyle)`：对手牌中每张卡查 `aiDecks[style].cards[key]`；权重 = `baseWeight + Σ(命中的条件列权重)`；条件列语义见 [data-export.md](data-export.md)；负权重剔除；加权随机选卡；目标按 `target` 字段（hostile → 敌方按低 HP 加权，self/friendly → 自己或最需要的队友）。
- `SimpleBot`：无 CSV 时的后备：队友 HP < 40% 且有治疗 → 治疗；有 blade 且可出大招 → 大招；否则最高期望伤害卡打最低 HP 敌人；出不起则 Pass。
- `HumanPolicy`：返回 Promise，`view_battle.js` 在玩家点选后 resolve。

## 4. 批量模拟

- `sim_batch_core.js`
  - `buildMatrix({ schools, modes, levels, gearBand, composition })` → `matchup[]`，`composition` ∈ `'mirror-school'`（同系队）| `'mixed'`（随机混编）。
  - `runOne(matchup, resolved, seed)` → `{ winner, rounds, perSide: {damage, heal, fizzles}, cards: {...}, unsupported: {...} }`。
  - `aggregate(results[])` → 胜率、Wilson 95% 区间、平均回合、场均伤害 / 治疗、fizzle 率、卡牌使用频次与贡献伤害、未支持卡出现次数。
- `sim_worker.js`：`onmessage({ dataset, params, matchups, gamesPer, seed })`；每 50 场 `postMessage({type:'progress', done, total})`；结束 `postMessage({type:'done', results})`。
- `sim_pool.js`：按 `hardwareConcurrency` 建 Worker；按 matchup 分片；合并结果；支持取消。

## 5. 调参器（`sim_tuner_core.js`）

- 输入：矩阵配置、当前 params、可调维度（默认 `perSchool.*.{hp, damage}`）、步长、迭代上限、每次评估场次、seed。
- 目标：`loss = Σ_matchups (winrate − 0.5)²`（可加权：1v1 权重高）。
- 算法：坐标下降；每个维度尝试 ±step，取 loss 最小；无改善则 step 减半；到达迭代上限或 step < 最小步长停止。
- 输出：`{ params, history: [{iter, loss, change}], before: matrix, after: matrix }`。
- 运行在 Worker 池上（每次评估是一次批量任务），UI 显示进度并可中止。

## 6. LLM 建议（`llm_advisor.js`）

- `buildPrompt({ aggregate, params, manifest, version })`：中文系统提示（角色：数值策划），附矩阵、平均回合、每系前 5 张高频卡及数值、当前 perSchool 系数、未支持卡占比；要求输出：诊断、建议、可选 ```json 参数块（BalanceParams 子集）。
- `requestAdvice({ endpoint, apiKey, model, prompt })`：`POST {endpoint}/chat/completions`，OpenAI 兼容；凭据仅存 `localStorage`。
- `extractParamsBlock(markdown)`：解析 ```json 块 → 可应用的 params 片段。

## 7. 页面路由（`app.js`）

| 路由 | 视图 | 说明 |
|------|------|------|
| `battle` | `view_battle.js` | 配置阵容 → 对战 → 结束面板 |
| `batch` | `view_batch.js` | 矩阵配置 → 运行 → 热力图 / 表格 / 导出 |
| `params` | `view_params.js` | 参数编辑 / diff / 导入导出 |
| `advisor` | `view_advisor.js` | 调参器 + LLM |

顶栏：数据集下拉（`discoverDatasets` 找到的 kids / teen / sample；切换时 `loadDataset` 并把 params 重置为该 version 默认值，若 localStorage 有同 version 的参数则恢复），数据集状态标签。

## 8. 测试

`npm test` = `node --test tests/*.test.mjs`，零依赖，30 例：

- `tests/formulas.test.mjs`：rng 确定性；`aboveMinBoost` / `damageExpression`（kids 逐项 ceil、teen 正负 buff 分治、穿透上限）/ `healExpression` / 治疗惩罚；crit / dodge / fizzle 阈值与大样本频率；五系 HP 曲线端点与装备 HP%；power pip 概率；`generatePip` 双版本；`canAffordCard` / `costPips` 本系 / 他系；竞技场伤害递增与 absorb。
- `tests/engine.test.mjs`：sample 数据集加载与预设卡组；1v1 跑通；同 seed 结果全等；2v2 / 3v3 / 4v4 完成；Random / Simple 策略；状态机（手牌 / 可出牌 / snapshot）；`perSchool.hp` 生效与 diff；X 费 DOT 与溅射 DOT；`buildJobs` 25 组 + 聚合自洽（A→B + B→A + 平局 = 1、CI 包含点估计）；`matchupMatrix`；`wilson`；调参器在假模型上收敛；LLM 提示词 / 参数块解析 / 启发式补丁。
- `tests/xml_lite.test.mjs`：声明 / 注释 / CDATA / 自闭合 / 实体 / 嵌套 / CRLF。

## 9. 意图 vs 现实

实施完成（2026-09-16）后的对照：

| 计划 | 实际 | 原因 |
|------|------|------|
| Tailwind CDN | 自写 `css/style.css`（约 180 行） | 离线 / 内网可用，避免外链 |
| `fast-xml-parser` devDependency | `scripts/lib/xml_lite.mjs` 零依赖解析器 | 配置 XML 结构简单；`npm install` 都不需要 |
| `config.js`、`i18n.js`、`data_loader.js` | 并入 `state.js` / `combat_presets_core.js` / `data_core.js` | 模块数量已多，避免碎片化 |
| `view_*.js` 通过 `callbacks` 回 `app.js` | `view_*.js` 直接 import `state.js` 的 mutator（`updateParams`、`setSetting`…） | 单页应用无需二级间接层；`view` 仍不含引擎逻辑 |
| `threat.json` | 未导出 | PvP 不使用威胁值 |
| 5 个测试文件 | 3 个测试文件 30 例 | 合并同类用例 |
| `HumanPolicy` 返回 Promise | `HumanPolicy.pick` 返回 `null`，由 `view_battle` 收集人类选择后调用 `playTurn(arena, picks)` | 半回合制下所有行动方同时出牌，同步接口更简单 |
| 单体 charm / ward 目标由 type 决定 | 由模板 `positive` 推断（`inferTargetKind`） | Lua 由客户端选目标、服务器不校验；陷阱 / 虚弱必须贴敌方 |

未支持 type（kids 37 张 5.3%，teen 53 张 4.2%）：`Dead`、`PickPet`、`CatchPet`、`Fizzle`、`SingleFreeze`、`ConversePositiveWard`、`SingleStealth`、`SingleGuardianWithImmolate`、`Enrage`、`SingleTaunt`、`AreaTaunt`、`AreaControl`。均不出现在官方 Aggressive 卡组，预设卡组过滤后批量报告的「未支持」为 0。

性能实测（Node 24 单线程）：teen 1v1 ≈ 5800 场/s，kids 1v1 ≈ 8200 场/s，teen 4v4 ≈ 1250 场/s；浏览器 8 worker teen 1v1 ≈ 14000 场/s。

分层未被打破：`js/*_core.js` 无 DOM / fetch（`node --input-type=module -e "import('./js/x.js')"` 可逐个加载，只有 `app.js`、`sim_worker.js` 依赖 `document` / `self`）。

## 10. 与仓库其他部分的关系

- 只读引用 `script/apps/Aries/Combat/ServerObject/*.lua` 作为规范来源，不修改。
- 只读读取 `config/Aries/`（gitignored）生成数据。
- 已在 `docs/aries/haqi-combat-sim.md`、`docs/CODEMAP.md`、`docs/TOPIC-INDEX.md` 登记。
- 计划中的「线上角色导入」「异步 PVP」「帕鲁式宠物/VIP 口粮」「卡牌多语言」不改变本节模块边界：玩家 IO 与 locale 表只能放在浏览器适配层或数据 JSON，`*_core.js` 仍禁止 `fetch`。对照 [player-import.md](player-import.md)、[async-pvp.md](async-pvp.md)、[pets-vip-innovation.md](pets-vip-innovation.md)、[card-i18n.md](card-i18n.md)。

## 11. Haqi.html 单人冒险（2026-09-17）

新增入口及 `adventure_app.js` 控制器。`view_adventure.js` 只构建DOM并传回事件；`adventure_renderer.js` 绘制Canvas世界/战斗；`adventure_assets.js` 负责HTTP资源与localStorage。规则拆为 `adventure_core.js`（任务/道具/成长/存档结构）、`adventure_world_core.js`（地图/移动/交互）、`adventure_content_core.js`（内容验证）。

`combat_pve_core.js` 复用 `combat_cards_core.js`、`combat_formulas_core.js`、单位和参数解析，不调用PvP半回合推进。PvE完整回合是所有单位生成魔力 → 怪物前置动作 → 玩家 → 怪物普通动作 → 怪物后置动作。怪物使用源脚本/HP基因/可重复技能池；玩家用有限卡包及装备附加牌。仅在公共伤害模块加入 `arena.mode === 'pve'` 分支，PvP行为由原34测试回归覆盖。

存档使用独立键和决定重演；世界装饰随机数与战斗随机数不共享。数据与资源准备为开发命令，所有运行时文件位于本目录，无父目录/兄弟模拟器导入。完整契约见 [adventure.md](adventure.md)。

## 12. WebP / CDN 与可选云存档（2026-09-17）

`adventure_media_core.js` 是纯资源策略：loopback默认local，线上默认CDN，显式查询参数可切换。`adventure_assets.js` 根据 `media.json` 读取WebP并设置CORS；`assets.json`仍为原版来源清单。Pillow开发脚本负责完整解码及无损转换，发布脚本生成内容哈希命名的上传计划、在远端验证后记录URL，不包含上传凭据。运行时不执行资源准备。

`adventure_cloud_core.js` 只处理版本化封装和原存档/战斗重演校验；时钟/UUID从IO层传入。`adventure_cloud.js` 按需加载Keepwork SDK core，使用独立PersonalPageStore workspace写入唯一检查点；验证远端原始JSON，避免SDK缓存/本地回退导致假成功。`view_adventure_cloud.js`只渲染连接、保存、列表、进度比较和确认，控制器负责替换本地进度。

云端恢复前检查账号未变化、本地原文与预览时一致、备份写入成功。任一失败均不覆盖主存档。SDK读写超时不等于请求已取消，失败提示要求刷新检查；不会自动重试覆盖同一文件。2026-09-25 起改为 savePageData(path,content,text,false,true) 暂存，再 syncToGit(path,true)，并通过服务器缓存 API 核验内容。角色目录读取也开启 useCache/useServerCache；保留自动云同步和角色冲突检查。钓鱼镜像仅在纪录变化时写入，完整玩法配置首次进入钓鱼才加载。

## 13. 技能演出

`spell-effects.json`集中定义45张冒险牌的演出类型、五系颜色、时间轴、粒子和召唤角色裁剪；`spell_effects_core.js`验证配置并独立播种视觉数据，`spell_effects.js`绘制Canvas演出。战斗控制器只改变cast事件展示时长，渲染器传入实际caster/target坐标。`HaqiEffects.html`提供无存档副作用的独立预览。详见[技能特效](spell-effects.md)。

## 14. 全卡库特效与共享变体

特效配置升级版本2：701个card引用225个base，变体共用品质光环。`prepare_spell_effects.mjs`显式映射所有导出type，`export_spell_names.py`通过Lua数据解析器导出中文名，`audit_spell_effects.mjs`同时校验全卡库和章节覆盖。工坊额外读取本地kids快照，游戏仍只读取原章节战斗数据；因此不会将未支持的战斗机制自动解锁。群体演出接收目标坐标数组，未修改战斗公式/规则。

## 2026-09-18：装备面板补全

新增 adventure_equipment_core.js 的纯属性展示与无副作用换装预览；装备穿戴仍由 adventure_core.js::applyAction 校验并执行，新增 unequip 动作。view_adventure_equipment.js 负责角色、槽位、背包筛选、详情和操作回调；adventure_app.js 保留面板筛选状态并处理存档与换装后的滚动/焦点。沿用原装备 stats、法杖强化表与固定卡，不修改战斗公式。


## 2026-09-18：共享技能美术

`skill_art_core.js` 校验图集和计算裁剪帧，无浏览器IO；`skill_art.js` 负责去重加载、动态卡面和主体绘制。`CardRenderer` 程序绘制标题与 `cardDescription`（中文套话 + 伤害/治疗数字）。`adventure_assets.js` 预加载章节需要的图集；`spell_art.js` 为工坊提供按需适配；`spell_effects.js` 复用同一主体并播放专属九帧。HaqiCards按学系/搜索分页展示全库；`skill_card_preview.js` 为儿童版模拟器手牌异步补图。美术不消耗战斗RNG，不改变数值规则。清单含本地/CDN、来源和独立哈希，新增WebP严格≤100KB。冒险界面语言见 [locale.md](locale.md)。卡名与带数字的卡面说明仍见 [card-i18n.md](card-i18n.md)。

## 2026-09-18：技能音效与粒子分层

图集主体不终止spell_effects.js的语义粒子分支，复用原kind/attack/secondary与时间轴。spell_sound_core.js只产生确定性的音效配方和跨帧触发节点；spell_sound.js负责Web Audio生命周期与本机开关，控制器按进度驱动，Canvas draw不直接发声。群体技能一套声音，粒子可多目标；两者都不消耗战斗RNG。


## 2026-09-18：调试属性编辑

adventure_debug_core.js 从内容构造数值字段目录，在副本上应用白名单修改、修正装备与配卡并走 parseSave 完整验证。adventure_debug.js 负责独立调试备份和本地写入；view_adventure_debug.js 仅管理表单草稿/预览与回调，adventure_app.js 校验成功且持久化完成后替换当前状态。未修改战斗公式、BalanceParams或存档版本。

## 宠物与商店扩展（2026-09-18）

`adventure_expansion_core`在原章节验证后合并静态宠物目录、原版装备候选与kids卡牌库；`adventure_pets_core`负责收藏、四卡位编队、商店、喂食和联动协议。浏览器IO注入恢复时间并按需加载宠物图集。`view_adventure_pets`只绑定意图回调；controller统一修改进度。

PvE可选接收`party`，主角保留第一项、显式slot控制站位及行动顺序；辅助宠物附卡不新增战斗单位。检查点包含完整入场规格和捕获库存，重演只使用种子与决定。版本2存档通过原本地、JSON和云端路径保存，版本1迁移不覆盖任务成果。参见[pets-and-shop.md](pets-and-shop.md)。帕鲁式深化与 VIP 口粮见[pets-vip-innovation.md](pets-vip-innovation.md)（未实现）。

## 2026-09-18：Vite与CDN发布

用户明确要求参考Maisi/MagicHaqi接入Vite。新增四入口构建、相对资源路径、静态JSON/WebP/Ogg复制、内联批量Worker与内容哈希CDN发布；此项取代早期“禁止打包器”的开发约定，原生ES modules源码仍可直接通过HTTP服务运行。详细命令与发布核验见[部署说明](deployment.md)。

最终构建与发布都排除美术/音频；所有域名默认CDN，源码显式离线模式保留。已核验52文件正式CDN版本与跨域发布页的7500场Worker模拟，详见qa-report。

## 2026-09-18：发布数据包与浏览器IO

runtime_data.js统一浏览器JSON读取；Vite生产构建将源码data的32个运行时JSON投影压缩到5包，manifest索引独立，以免数据集发现触发全版本下载。读取结果复制后交给原加载逻辑，避免共享缓存受规范化和冒险扩展修改。data_core移除fetch包装，保持Node注入式数据加载。详见deployment.md。


## 2026-09-19：世界地图

adventure_world_map_core集中六岛身份、出生点与BalanceParams.worldTravel等级检查；view_adventure_world_map仅展示选中岛屿和传送状态，控制器通过既有travel动作切换场景并保存。adventure_world_core复用可复现地形与碰撞，adventure_terrain区分远方岛屿地表；原版岛屿专属内容仍未导入。存档校验、调试降级和云端位置展示共用岛屿定义。

## 2026-09-20：大型岛屿地图

config/maps 提供六岛源文件与统一地域规则；adventure_map_generator_core 在离线生成阶段写入 data/adventure/maps，adventure_island_layout_core 提供纯几何与元数据查询；adventure_world_core 装配运行时对象并缓存空间桶/道路图；adventure_large_terrain 负责固定内存预算的分块地面和低分辨率导览。view_adventure_local_map 仅绑定目的地意图，adventure_app 负责步行与交互。worldLayoutVersion=2 标识六岛新地图坐标，parseSave 区分旧版尺寸校验和位置迁移；旧任务、战斗与来源数据不修改。详见 island-exploration.md。

## 2026-09-26：岛屿伙伴与快照组队

`adventure_social_core` 处理名单、通信摘要和快照校验，`adventure_social_motion_core` 只做种子行为；`adventure_coop_core` 隔离副本进度、冻结阵容并保留血量；`adventure_social_pvp_core` 复用 free_pvp 及决定重演。`adventure_social` 是 SDK IO 边界，`adventure_social_controller` 连接场景和 UI，view 层只提交意图。组队房间对齐原版四人席：先选副本，空席开放后延迟补 AI。组队继续使用现有 PvE 与地图，不另写战斗公式。服务门禁与模块契约见 [岛屿社交](island-social.md)。

## 独立战斗AI（2026-09-27）

`js/battle_ai/index_core.js` 为纯服务入口；推理、配包、复盘与关卡统计不依赖页面。`haqi_adapter_core`复用真实结算器，`adventure_adapter_core`提供角色资格及入口路由。浏览器client/worker是IO边界。战斗RNG、AI抽样及复盘文案种子彼此隔离。接口和限制见 [battle-ai.md](battle-ai.md)。

## 2026-09-27 角色对话与关系IO

`character_relationship_core.js`负责纯规则、提示词、额度和赠礼；`character_workspace.js`负责账号/角色分文件、缓存API与版本检查；`character_conversation.js`控制LLM、语音和共享聊天视图，`view_character_details.js`负责关系/礼物详情。副本事件在settleEncounter结算内登记，可选第四参数`{now}`由调用方提供；未提供按0处理，不从核心读取系统时钟。参见[关系存储与限制](character-conversations.md)。

## H5 宣传片（2026-09-28）

`HaqiPromo.html` + `promo_app.js` 管理独立 JSON 剧本和时间轴，通过同源 iframe 调用 `promo_stage.js`。舞台复用正式游戏视图和 core 模块，只维护内存角色，不导入主应用或账号/存储客户端。`promo_timeline_core.js` 为纯时间轴与字幕模块。剧本单独打包为 `data/promo/film.json`，不进入游戏启动包；详见 [promo.md](promo.md)。

```mermaid
flowchart LR
    Film[film.json：镜头与操作解说] --> Player[promo_app：播放 / 暂停 / 跳转 / SRT]
    Player --> Stage[promo_stage：同源隔离舞台]
    Stage --> Features[promo_features：地图 / 城市 / 养成 / 生活控制器]
    Stage --> Replay[PvE及红蘑菇真实事件重演]
    Stage --> Duo[promo_duo：正式选角 / 双角色HUD / 共享战场与双手牌]
    Duo --> Views
    Duo --> DuoCore[promo_duo_core：正式双人阵容 / 准备门闩 / 联合PvE]
    DuoCore --> Rules
    Features --> Views[正式游戏界面]
    Features --> Rules[正式core规则]
    Features --> ReadOnly[CDN与静态地图数据只读加载]
    Rules --> Memory[每镜头独立内存角色]
    Replay --> Memory
```



## 全局语言学习规则入口

产品规则统一维护于 [语言学习设计](language-learning.md)。各口语控制器通过 `onSpeech`（副本为 `award`）提交有效事件，`adventure_app.js` 的 `awardLanguageSpeech` 调用纯核 `language_daily_buff_core.js` 分配当日奖励；视图不自行增加属性。角色 runtime 保存每日状态，durable/cloud 投影剔除；战斗入口冻结加成供重演。剧情、课程与自由对话判定仍由各自控制器负责。新增学习场景复用该公共奖励路径，数值、日期、存储、UI 和快照变更按该设计中的维护表联动检查。

语音交互复用：`dialogue_voice_session.js` 为自由角色聊天与副本剧情提供无 DOM 的 ASR/TTS 生命周期，`view_dialogue_microphone.js` 提供共享录音按钮和手势。业务判定、额度、buff 与推进留在调用方，详情见语言学习设计的共用组件边界。

地球高清表现层（2026-10-02）：`adventure_earth_surface_core.js` 负责纯地类混合与确定性采样；`adventure_earth_surface.js` 将真实分类和预制 WebP 合成为可见 Canvas 小块，使用单任务分帧队列、64 块 LRU 上限和统一像素边缘。`adventure_earth.js` 仅在实际绘制地球场景后读取 `surface-art.json` 与图集，图册阶段不加载。视觉层不改变地理碰撞、怪物随机流或持久数据。详见 [地球地表与装饰](earth-world.md#高清地表与地理装饰2026-10-02)。
# 城市地貌生成补充（2026-10-02）

`adventure_earth_transport_core.js` 复用已加载城市坐标，为通用城市生成有限聚落布局覆盖、铁路与站前设施；不依赖 authored region。铁路走廊先预留，再放置普通街区建筑。`city-art.json` 的交通图集按实际出现的物件类型加载，地理碰撞仍使用原始地类；列车只作为环境物件。

地表像素生成现在经单个原生 module Worker 执行，主线程只收集块内地类、接收转移的像素缓冲并提交 Canvas；失败使用分帧回退。`adventure_earth_city_layout_core.js` 为地表和物件共享街区分区。场景流送分批构建临时数据，校验 epoch 后一次替换，不在异步处理中暴露半完成数组。

高清地表队列按可见块优先，再预热周边一圈，合计受 64 块缓存预算限制；城市铺装在地表像素生成阶段烘焙，街灯等竖立物件保留 Y 排序。地标等比缩放和避让完整道路集合由纯核心函数负责，不依赖当前视口。

Earth 的 `adventure_earth_city_core.js` 只处理人口等级、稳定地理格点和物件候选；`adventure_earth.js` 提供已加载地表查询与安全空间过滤，并仅在场景有城市物件时读取 `city-art.json` 与两张 WebP。城市装饰与地标共用相机相对绘制和 Y 排序，不进入地图浏览或启动依赖。捕鱼通过 `isOcean` 的 Earth 分支读取真实地表分类，海岛规则保持独立。

城市底图补充（2026-10-02）：`surface-art.json.cityGround` 引用独立AI绘制连续街区的四张WebP，HelloWorld city02.png只保留为来源参考；仅实际地球场景加载，整幅像素传入单个 Worker 与主线程回退，城市地类按地理坐标混合采样。场景流送提交单元包含对象数组和 `drawEarthBuilding`，避免图片异步加载时数组与绘制器版本错配；Earth 不使用海岛精灵作为建筑缺图回退。城市底图保留细街巷纹理；场景道路统一为城市之间的连接，旧深圳作者道路不再加载，安全导航保留。


2026-10-02 地球渲染更新：城市道路连接由adventure_earth_transport_core.js按经纬度生成并裁剪，仍为纯核心层；浏览器IO层按需加载四张独立城市WebP，合成一张连续纹理后交给原生Worker。高清资源不进入网站发布包，永久CDN与明确离线模式继续使用同一清单。

2026-10-02 公路视觉调整：城际路面默认52单位，浅灰米色、浅路肩及渐淡外缘，弯道连续描边；地标避让使用当前城际道路。旧深圳道路 JSON 与离线生成脚本已删除，城市组件清单只引用当前使用的数据；程序城市支路不再放入world.paths。

城际连接在纯核心层精简可经更近城市到达的冗余三角长边；adventure_renderer在场景绘制完成后以屏幕坐标显示mapCities和landmarks名称，保持字号稳定并避让人物与其他地名。

### 当前城市地图视野

view_adventure_earth_local_map 将拖动视野通过 adventure_app 回调交给 adventure_earth.localViewport，按需请求既有地形切片与城市 CSV，并返回独立的地形采样、城市坐标与道路。此路径不执行 prepare/update，不改变游戏世界、玩家位置或存档。adventure_renderer.minimap 使用返回数据绘制；earth_map_labels_core 只计算屏幕空间名称避让，视图绘制连接真实坐标的连线。定位按钮只重置视野；窗口 dispose 与视野版本丢弃过期结果。

```mermaid
flowchart LR
    CityView[当前城市地图视图] -->|拖动视野| Controller[adventure_app]
    Controller --> MapIO[adventure_earth.localViewport]
    MapIO --> Data[地形切片与城市 CSV]
    MapIO -->|独立视野数据| CityView
    CityView --> Renderer[adventure_renderer.minimap]
    CityView --> Labels[earth_map_labels_core]
```

2026-10-02 地球流送稳定性：进入场景记录已经生成的逻辑块，避免下一帧重复构建。IO层生成下一邻域后，reuseEarthObjects按稳定编号/坐标复用重叠区域未变物件，并在物件变化时才通知空间索引与社交层。地表缓存以固定地理块为键，新源瓦片只标记采样范围相交的块（包括日期线回绕）；旧画布在替代块完成前继续绘制，过期Worker结果拒绝提交，内存块数仍受原预算限制。


2026-10-02 单城居民与任务：世界索引只保存城市范围与 cities/<id>.json；进入覆盖区加载完整单城配置，交谈复用内存。adventure_earth_city_config_core.js 负责纯配置与进度规则；earthCityProgress 按城市/章节/支线隔离并进入 records 分片，旧深圳进度兼容。NPC图片通过 adventure_assets 的动态登记与释放复用既有角色绘制，离开城市释放，共享图集不进入启动包或dist。交谈复用岛屿样式与共享关闭按钮，意图回调交给 app，战斗事件仍在真实结算推进。


2026-10-03 地球小物件烘焙补充：`adventure_earth_surface_objects.js` 为主线程与 Worker 共享小装饰绘制和投影。草丛、岩石、花草、麦穗、雪堆等按实际精灵及投影范围索引到相交分块，流送时只更新变化的块；高树继续 Y 排序及遮挡淡化。支持 OffscreenCanvas 时 Worker 合成地表、道路与装饰后转移 ImageBitmap，主线程直接纳入有界缓存；不支持合成时仍转移像素并在主线程分帧回退。缓存记录绘制身份，兼容空间索引浅复制，部分缓存期间逐块裁剪临时装饰，避免跨块重复绘制。过期、淘汰和退出的 ImageBitmap 显式 close；完整覆盖后跳过底层源地形与临时道路重画。

固定NPC外观通过 `adventure_city_people_core.js` 的 `npcCharacter` 解析，由 `hero_renderer.js` 统一绘制场景、剧情对话及自由聊天；`adventure_actor_assets.js` 按同一结果预加载头部/服装。旧人物portrait仅保留来源与配置兼容，不参与人物显示。

华南版本3 `frontageRevision:2` 街景通过纯布局核心生成门前路径、楼间连通巷和院墙。物件imageOffsetY只调整楼体图像与门脸接合，不改变脚底、排序和碰撞坐标；视野包围盒与地表烘焙轮廓须包含该偏移。图集中的view及主题camera用于制作/QA契约，运行时不旋转或拉伸纠正不合格透视。

静态生活细节沿用同一Atlas/组件协议；壁挂风扇、信箱与水管属于建筑组件，独立家具按真实底座碰撞。布局核心用独立ground-wear种子生成局部使用痕迹，街景核心校验wear多边形与markings折线，view_city_street按tile裁剪并进入24MiB地表缓存；不增加运行时网络或战斗随机调用。华南主题镜头由纯adventure_camera_core的clampCameraToWorld收边，渲染与screenToWorld复用最终原点，其他主题保持原逻辑。

版本3的圆形脚底、步长与边界留白从BalanceParams进入streetscape元数据；纯adventure_city_street_core提供点位及连续线段碰撞，adventure_world_core移动与adventure_city_navigation_core捷径共用。旧场景没有字段时保持旧算法。设施occludes只影响view_city_street整组透明度，不参与碰撞或存档进度。


2026-10-04街区步行落脚点补充：v3纯布局登记门前/设施/长椅目的地，几何校验限制地图内坐标，生成测试验证实际寻路。过街齐平入口与提示铺装进入现有地表缓存；候车挂牌仍使用同一建筑附属组件与文字缓存。没有新增IO层、玩法状态或战斗随机流。


街区静态渲染优化仍在view_city_street：场景选择建立地面精灵/投影阴影索引和静态资源ID表，tile烘焙按范围跳过无关几何并复用CanvasPattern。迟到Atlas使纹理/pattern/tile一起失效，离场统一释放；不改变核心碰撞、随机数或存档结构。招牌的测量排版与最近使用缓存也在渲染层。

### 宠物标签数据流（2026-10-05）

```mermaid
flowchart LR
    Summary[逐宠物文件摘要：标签与次数] --> Begin[首次进入战斗：比较同种宠物]
    Params[BalanceParams.petTraits] --> Begin
    Begin --> Snapshot[检查点：版本 / 参数 / 怪物标签]
    Begin --> Local[本机遭遇缓存：撤退保持 / 刷新清除]
    Snapshot --> Battle[纯战斗引擎：实际属性与捕获]
    Snapshot --> View[登场标签 / 传奇光圈 / 目标提示]
    Battle --> Merge[捕获结算：加载同种正文 / 最高等级合并 / 次数累计]
    Merge --> Files[逐宠物核心文件与摘要]
    Files --> Summary
```

世界加载不生成野怪标签。新检查点锁定参数与标签用于重演，旧检查点保持旧规则。已收服宠物死亡不重抽。旧同种重复实例在正文就绪且无未结束战斗时归并，来源归档与移除引用分开保存。详情见[宠物标签](pet-traits.md)。

## 2026-10-05 连续哈奇地图

`renderMaps`将群岛与六岛局部入口交给统一视图，保留副本局部地图。`haqi_atlas_core.js`提供纯几何与取景计算，`haqi_atlas_data.js`在打开地图后才读取并缓存version2清单。视图维护单个相机与最多6张静态局部预览，`drawIsland`回调由控制器创建只读场景并调用renderer.minimap的`atlasPreview/showPlayer`选项；预览不接受可写存档。当前人物/伙伴单独绘制，浏览不推进游戏状态。漩涡回调只改变panel与焦点，实际角色传送仍通过travel/travelEarth/teleportToPosition；关闭统一释放地图observer、绘制任务和过期加载应答。


### 2026-10-06 可配置岛屿续篇

潮汐、浮岸、风帆扩展沿用上图的游戏/实验室与IO/规则边界；[配置说明](island-expansion.md)记录作者源、生成流程与存档编号约定。

```mermaid
flowchart LR
    Packs[island-packs/index与每岛JSON] --> Registry[prepare_island_packs：纯登记表与伙伴配置]
    Registry --> MapBuild[generate_island_maps]
    Maps[config/maps/islands：海岸与布局] --> MapBuild
    MapBuild --> RuntimeMaps[运行时地图与出生点索引]
    Packs --> StoryExport[export_story：稳定S/L编号和作者源]
    StoryExport --> Chapters[60/70/80章节与独立副本剧本]
    Packs --> IO[adventure_assets：JSON读取与按需美术]
    RuntimeMaps --> IO
    IO --> Install[adventure_island_packs_core：校验与安装]
    Install --> Existing[现有NPC/目录任务/野外战斗/副本规则]
    Existing --> Save[现有本地与云端存档]
    Art[建筑与群岛清单：本地归档及永久CDN] --> IO
```

包内主线按本岛等级并行解锁。核心安装器无DOM/网络，目录任务与副本仍使用既有动作和保存结构；发布读取器增加island-packs目录，配置进入现有adventure数据包，美术不进入dist。局部地图预览槽数量随已登记岛屿变化，避免九岛互相淘汰。


宣传片补充（2026-10-06）：`promo_stage.js → promo_learning.js → createLearningVoice / createDialogueMapper → Keepwork AI`，仅固定演示句出站，结果缓存在舞台内存。词义映射复用正式解析与双语组件；证据通过后 `awardDailySpeech → arenaSeats → startRedMushroom`，语言加成进入正式赛场快照。宠物展示通过 `createPetScene` 运行内存角色互动；不接角色持久化与真人通信。

宣传片教学与进城适配：`promo_stage.js → promo_tactics_core.js → combat_arena_core.js` 使用正式卡牌预置教学出牌；`promo_features.js → promo_city_route_core.js → adventure_world_core.js` 规划并采样道路路线，城市资源仍由既有 Earth service 与 City dungeon 控制器加载。两条链路均只操作隔离演示角色。

```mermaid
flowchart LR
  PromoStage[promo_stage.js] --> Tactics[promo_tactics_core.js]
  Tactics --> Arena[combat_arena_core.js]
  PromoFeatures[promo_features.js] --> Route[promo_city_route_core.js]
  Route --> World[adventure_world_core.js]
  PromoFeatures --> Earth[adventure_earth.js]
  PromoFeatures --> City[adventure_city_dungeons_core.js]
```

宣传片口岸路线复用 `adventure_city_generated_core.generatedCityRoute` 与 `assets.dungeons.load` 的正式城市加载链路，使用地图CSV的原始入口身份；街景资源通过 `streetArtResources` 注册并等待 `ensureImage`，NPC/行人仍使用生产外观选择。道路图采样只作用于宣传片，不修改世界寻路规则。

## 2026-10-06：本机双人同屏

```mermaid
flowchart LR
  Entry[角色入口：单人 / 双人] --> Local[adventure_local_play：两路输入与两份个人界面]
  Local --> Rules[adventure_local_coop_core：四席阵容 / 同屏相机 / 双方准备 / 结算]
  Rules --> Battle[combat_pve_core / adventure_red_mushroom_core：联合回合]
  Local --> Record[adventure_local_store：按账号隔离的 IndexedDB]
  Record --> Checkpoint[共享阵容 / 联合战斗检查点 / 采集袋 / 冶炼事务]
  Local --> Roles[adventure_roles.commitRoles：一次写入两个角色]
  Roles --> Existing[既有本地分片与 Keepwork 云同步]
```

主界面继续显示玩家1，两名玩家共用一个场景与四个战斗法阵。两份法阵窗口都是同一阵容的编辑器；两份背包、卡包、任务与对话使用各自角色。核心规则保持纯 ES Module；键位独立存于既有游戏设置。联合作战先校验两份选择，在重演副本上执行，IndexedDB 保存成功后才发布新回合。结算先原子更新角色目录，再清除联合检查点，以双方领取标记防止重试重复奖励。

字幕朗读：`promo_app.js → promo_narration.js → loadKeepwork/loadAIChat → speech.getSupportedVoices + speechRTC.createSession/synthesize → Audio`。Keepwork IO与时间轴分离，代次校验隔离迟到请求，暂停与换句interrupt会话并释放音频URL，不回退浏览器系统TTS。

### 双角色标题与设备输入（2026-10-06）

```mermaid
flowchart LR
  Devices[浏览器Gamepad快照] --> IO[player_input.js：轮询已连接设备]
  Settings[本机game_settings：playerInputs / 左右按键组] --> IO
  IO --> Core[player_input_core：分配互斥 / 标准映射 / 死区 / 边沿与连选]
  Core --> Local[adventure_local_play：带玩家归属的control意图]
  Local --> Scene[移动 / 各自菜单 / 联合战斗选择]
  Local --> Solo[adventure_app：单人意图与全局设置导航]
  Roles[两个角色状态] --> Title[复用renderHeroTitle：两张标题与独立生命]
```

硬件API只在浏览器层访问；映射及按键状态迁移可在Node验证。设备偏好在本机全局设置中，不进入角色或云端存档。原“主界面继续显示玩家1”现更新为双人模式显示两个角色标题，任务追踪仍归玩家1。

## 地面装饰自动采集（2026-10-06）

```mermaid
flowchart LR
    Map[岛屿地图与固定装饰种子] --> Deco[groundDecorationSteps：共享坐标与稳定网格ID]
    Deco --> Bake[地表Worker与背景烘焙]
    Deco --> Gather[adventure_gathering_core：图格映射与剩余数量]
    Gather --> Dwell[localPlay：静止1秒与逐单位计时]
    Dwell --> Overlay[圆形进度与短暂碎片叠加]
    Dwell --> Local[本机IndexedDB：共享采集进度与个人采集袋]
```

背景图不因采集失效或重绘。部分已采数量替代单次布尔耗尽值，兼容旧true标记；双方共用一个点的数量，次日刷新沿用原规则。移动、暂停、弹窗和场景切换重置计时，长帧不补发奖励。


### 场景冶炼与领取（2026-10-06）

```mermaid
flowchart LR
    Gather[玩家/携带宠物逐单位采集] --> Credit[本机采集价值与余量]
    Credit --> Still[累计60且静止2秒：场景冶炼]
    Still --> Drop[本机地面掉落：可达坐标/货币/金额/唯一凭证]
    Drop --> Claim[玩家走近：持久化领取事务]
    Claim --> Roles[角色库存与去重凭证一起保存]
    Roles --> Clear[移除本机掉落与事务]
    PetTrait[采集小能手标签] --> Gather
```

金币先落地再领取，场景不提供归自己/平分的选择。账号本机命名空间隔离掉落ID，重载后按领取凭证恢复，宠物移动由localPlay提供临时位置给渲染器，同一个宠物不重复绘制。


### 同屏 AI 陪伴（2026-10-06）

```mermaid
flowchart LR
    Duo[双人入口 / 场外托管] --> Local[adventure_local_play]
    Local --> Planner[companion_ai_core：目标优先级 / 持续采集 / 指令 / 校验]
    Planner --> Movement[原寻路 / 碰撞 / 采集]
    Local --> BattleAI[原BattleAIClient：公开观察]
    BattleAI --> Picks[双人humanDecisions / 检查点 / 独立结算]
    Local --> Companion[companion_ai：浏览器会话与取消]
    Skill[companion-ai.json：长篇skill与基础台词] --> Companion
    Companion --> Voice[既有Keepwork模型 / ASR / TTS]
    Companion --> UI[轻量聊天 / 公共角色气泡 / 麦克风]
    Companion --> LocalDB[独立IndexedDB：角色组合记忆 / 账号额度]
```

行为和出牌不依赖模型响应；本地指令优先处理跟随/等待/采集，目标优先级与路径冷却控制行动，无事停留。模型接收真实资源与活动快照，主动交流不改目标，仅直接请求可建议本地提供的候选，不能执行游戏工具。记忆和额度不进入云端角色核心状态。未来CLI/MCP适配在浏览器服务层替换模型调用，当前未接入。细节见[AI陪伴](companion-ai.md)。

## 2026-10-07：双人共用战斗展示

```mermaid
flowchart LR
    Local[adventure_local_play 两份选牌状态] --> Shared[单人同款共用战场 / 顶部敌方 / 底部友方 / 日志与结算]
    Local --> Hands[左右两份原尺寸重叠手牌与选牌按钮]
    Hands --> Owner[当前选牌玩家]
    Owner --> Shared
    Shared --> Target[目标选择回调交给当前玩家]
    Target --> Ready[两人准备门闩与原战斗引擎]
```

`view_adventure.renderBattle` 的双人选牌视图只挂载手牌与操作，共用视图复用单人顶部、底部、Canvas 和状态提示。键盘选目标时切换当前玩家；卡牌尺寸沿用单人对应窗口档位，半屏空间不足通过网格列重叠。

双人提交行动后，该玩家视图只保留身份和取消按钮；另一份手牌通过布局扩展到全宽。取消准备仍沿用准备门闩，不清除原选中卡。

## 2026-10-07：双人互动与NPC气泡归属

```mermaid
flowchart LR
    Positions[两名玩家位置 / 社交NPC] --> Bubbles[localSocialBubbles：各自附近候选 / 同NPC取较近玩家]
    Bubbles --> Canvas[adventure_renderer 绘制NPC头顶气泡]
    Bubbles --> Local[adventure_local_play 点击归属 / 左右窗口]
    Local --> Menu[view_social_actions 共用互动列表 / 队友邀请替换为跟随]
    Menu --> Gesture[本地双角色表情 / 跳跃 / 冷却]
    Menu --> Chats[character_conversation 按角色独立实例]
    Chats --> Roles[对应角色存档 / 关系会话 / 语音学习奖励]
```

同屏队友的圆形互动入口属于玩家2工具栏；没有装备坐骑时，两名玩家也保留坐骑选择入口。NPC沿用原社交对话距离，单人气泡规则保持原入口，双人渲染与点击共同调用纯核心归属算法。第二角色对话实例按需创建，使用自身角色ID、存档与语言设置，避免写入玩家1的关系或奖励。

## 2026-10-07：照片头部生成

已接入，照片弹窗按“选照片 / 变身 / 校准”推进，最终 WebP 通过 SDK 自动上传永久 CDN，再核验保存；已开放本地源码入口，线上真人质量验证边界见[照片形象](photo-head.md)。

```mermaid
flowchart LR
    Picker[创建角色 / 修改形象] --> PhotoView[共用照片窗口：拍摄 / 裁剪]
    PhotoView --> Service[photo_head_service：身份 / 任务编排]
    Service --> SDK[Keepwork SDK：Image Pro双参考图生成 / CDN上传]
    Service --> Worker[photo_head_worker：逐格去白底，不居中]
    Worker --> WebP[WebP预算 / 逐帧连接点同步缩放]
    WebP --> Service
    Service --> PPS[HaqiAdventure：10条正面小图index / 额度]
    PPS -->|点选才读取| HeadFile[一个形象一个当前JSON / 16方向图集]
    PhotoView -->|仅DIY读取| PPS
    Service --> Local[账号隔离IndexedDB：仅AI输出与任务]
    HeadFile --> Ref[角色与公开名片：headId + customHead]
    Ref --> Renderer[HeroRenderer自定义目录 / 版本隔离 / 预设回退]
```

真人输入只留内存直接提交生成服务，不进入CDN或存档。纯规则和像素模块不依赖DOM/SDK；Worker与存储在浏览器IO层。正式资源目录与自定义目录隔离，NPC随机选择不读取用户形象。

照片DIY补充：`view_photo_head`仅在窗口打开后通过`service.preview`补齐历史缩略图，不触发选择或写入。应用回调传`head + {appearance,bodyId}`给`view_hero_picker`，再走既有角色创建/换装提交；窗口内服装选择不直接改玩家存档。世界启动仍仅创建惰性photoHeads入口，使用角色携带的当前customHead描述，不枚举账号形象库。
