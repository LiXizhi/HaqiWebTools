# Haqi.html · 初心之旅

`Haqi.html` 是独立的 kids 单人冒险入口，使用 Canvas 2D 场景与 HTML 菜单。原 `HaqiCombatSim.html` 的 PvP、批量模拟和调参入口保持独立。

## 运行与重新导出

```bash
cd web/HaqiCombatSim
python3 -m http.server 8791 --bind 127.0.0.1
# http://127.0.0.1:8791/Haqi.html
```

没有运行时构建，也不需要 npm install、ParaEngine、父目录、兄弟模拟器或账号。本机 loopback 默认使用 Git 中的 WebP，不需要 CDN 网络；线上域名默认使用永久 Keepwork CDN。`data/adventure/` 与 `assets/adventure/` 是完整的运行时内容；音乐是可选资源。使用 HTTP，不能通过 file:// 运行 ES modules / fetch。

开发者刷新内容时：

```bash
npm run export:adventure       # Python 3 标准库；读取默认 ../../ 或 --root 指定的 paraworld
npm run assets:adventure       # Node >=20 + Python/Pillow；准备、解码、无损转换 WebP
npm run check:adventure        # 纯引用检查 + 本地文件哈希/尺寸/格式检查
npm test                      # 69例，包含原34例、五系章节、资源与云端存档测试
```

卡牌数值沿用本项目已经入库的 `data/kids/cards.json`、`charms.json`。要同步原始 Card XML 的改动，先运行已有的 `npm run export`，再导出本章。导出器用 ElementTree 解析 XML，用限制为数据字面量的 `scripts/lib/lua_data.py` 解析数据库表；不会执行 Lua、MCML、NPL 或嵌入脚本。

资源清单保留原始路径大小写、`.p` / `.z` 后缀、MD5 和长度。查询采用小写及统一斜线，纹理的 `;x y width height` 裁剪矩形单独存储。CDN URL 以完整清单行构成，包含 `,md5,size`。`.p` 保存原图；`.z` 先验证下载容器再解压 ZIP/zlib。`media.json` 另外记录无损 WebP 的本地路径、实际 CDN URL、尺寸、SHA-256、源像素文件哈希及完整源清单行；不会混淆源 MD5 与转换后哈希。裁剪矩形继续来自章节引用，图集尺寸不变。Pillow 完整解码并比较 RGBA 像素；Node 检查 WebP 容器、尺寸、SHA-256；浏览器实际解码并执行 alpha 边界裁切。

## 操作

- WASD / 方向键移动；点击或轻触地面寻路，PC 鼠标左键按住地面持续跟随光标（拖动立即生效），松开停止；点击居民或敌人走近互动。
- E 交谈；B / I 背包，C 卡包，J 任务，P 宠物，Esc 关闭面板。
- 手机左下小摇杆移动（支持斜向与推杆幅度调速，松手停止），下方大按钮交谈；卡牌横向滑动，选牌后点击自己或敌方按钮施法。
- 任务的「追踪目标」自动寻路；装备、强化、宠物和配卡任务直接打开对应面板。
- 战斗中可弃牌、跳过、撤退及导出存档；胜利后收取奖励，失败后回到安全地点。
- 设置可开关背景音乐、导出/导入 JSON、回到开始画面。新游戏会替换当前浏览器存档。

## 章节与来源

| 任务 | 原角色 / 目标 | 浏览器中的完成方式 |
|---|---|---|
| 63000 | 青龙，开启魔法之旅 | 阅读移动与交谈教学，回报 |
| 63001 | 茜茜、莫尼 | 两段原版讨论对白 |
| 63002–63005 | 烈火、寒冰、风暴、生命侦察兵 | 原怪物属性、技能池、战斗奖励；领取本系帽/衣/鞋和仙豆 |
| 63006 | 莫纳 → 青龙 | 领取晶石法杖1912 |
| 63007 | 青龙，强化79016 | 背包装备并强化法杖，原成本70 / 140 / 280仙豆 |
| 63008 | 青龙 → 杰西卡 | 打开出奇蛋17307，再了解宠物 |
| 63009 | 杰西卡 → 青龙，喂养79019 | 口粮17172增加300经验 |
| 63010 | 伏尔坎、艾米娜、高登、爱丽丝、磊奥 | 与五位学系导师交谈 |
| 63011 | 亚尔弗列得 | 阅读原版考核建议，领取翡翠口袋等原奖励 |
| 63012 | 青龙，配卡79037 | 装备24003并保存卡包 |
| 63013 | 死亡侦察兵 | 毕业战，回青龙处领取奖励 |
| 镇区尾声 | 罗德镇长、苏菲、白龙导师 | 居民交谈、水咕噜和死亡泡泡重复遭遇 |

`chapter.json` 保存源任务ID、NPC ID、原坐标/模型、场地ID及怪物槽位、道具GSID、学校限制、经验/货币/选项奖励，以及源文件 SHA256。共14任务、15居民、7种怪物、19个原场地参考。`combat.json` 是45张相关卡牌及 charm/ward 模板的独立快照。怪物的 `round="1-"` 是首回合前的额外动作；死亡侦察兵18回合脚本完整保留。

## 明确的改编

- 任务按63000–63013串联，取消旧的等级上限锁。两张地图为按原地图参考绘制的紧凑步行场景，有建筑/树木/海岸碰撞、深度排序、镜头、小地图和路径提示；原缩略图只在地图面板作参考。
- 毕业后前往哈奇小镇是本章尾声。原63014指向火鸟岛，不在本章。
- 等级1–10累计经验阈值：`0, 41, 114, 255, 495, 869, 1418, 2479, 3654, 4654`。源任务与遭遇的经验数值不变。基础法术按1、1、2、3、4、6、7级学习，每种三份；学习时间及初始卡组为本章安排。
- 装备附带法术作为额外固定卡加入抽牌顺序；普通卡包容量14、同卡3份；翡翠口袋容量20、同卡3份。角色属性使用已装备物品的原stats及强化值，不读取模拟器的自定义调参。
- 旧3D视角、瞬移和自动演示文本替换为浏览器操作说明。逐条 `dialogueAdaptations` 与 `originalText` / `originalLabel` 保留原文。宠物捕捉、选修学系等后续课程明确留待以后。
- 出奇蛋固定孵出10136「咕噜噜」，随行与喂养，不加入战斗。宠物经验使用原XML增量与 `CombatPetProvider:GetLevelInfo` 级别约定：300经验为3级，464经验满级显示5级；不再消耗满级宠物的口粮。
- VIP礼盒、消耗符文、变身奖励保留原ID与数量，作为本章收藏物品；未开放会员兑换、符文消耗施法或变身系统。装备附带法术可以使用。
- 树木、房屋、四方向角色和怪物用新绘制的透明精灵；NPC立绘、原卡面、道具图标和音乐来自清单。部分居民共用可用的原版立绘，见资源说明。
- 战斗独立恢复满生命，无装备耐久、服务器计时、暴怒/节日活动、多玩家威胁排序、捕捉或战宠能力。1名玩家意味着 `threat_highest` 只有一个敌方目标。其他岛屿、家园、帮会和付费系统不在本章。

## 规则、存档与接口

纯模块可在 Node 中直接导入，禁止引用 DOM、存储或网络：

- `adventure_core.js`：`createAdventure`、`applyAction`、`questProgress`、`questReady`、`playerSpec`、`beginEncounter`、`recordDecision`、`settleEncounter`、`parseSave`。
- `adventure_world_core.js`：`createWorld`、`walkable`、`movePosition`、`findPath`、`followPath`、`nearestInteraction`。A* 检查每条边及真实起点连接，移动采用分段碰撞。
- `adventure_content_core.js`：`validateAdventureContent`。必需NPC、任务依赖、目标、奖励、卡牌、效果模板、AI指令、对话动作和资源引用不支持时立即失败。
- `combat_pve_core.js`：`createPveBattle({dataset,player,monsters,seed})`、`playPveRound(battle,decision)`、`restorePveBattle(dataset,content,checkpoint)`。

`AdventureContent` 是 `chapter.json` 中的版本化定义，`AdventureSave` 是 `createAdventure` 返回的JSON对象。专用键 `haqi.adventure.kids.v1` 与模拟器设置隔离。保存角色、经验、物品、装备、强化、拥有的牌、卡包、宠物、任务、位置、遭遇序号与奖励账本；移动时定期保存，完成操作及每次战斗决定立即保存。

战斗检查点只保存种子、起始角色规格和决定序列。加载时以相同种子重新执行决定，还原事件、魔力、生命和随机数状态。导入先验证所有数据并重演战斗，成功后才替换当前进度。奖励领取以任务claimed标志和遭遇ID账本去重；动画尚未结束时重载也不会重复发奖。失败、平局或撤退不删除任务和物品，回到安全地点。

玩法随机使用遭遇种子；地图装饰使用单独的固定种子，动画仅使用时间。云端文件的时间和 UUID 由 IO 层生成，不消耗玩法随机数。


## WebP 与永久 CDN

- `http://127.0.0.1:8791/Haqi.html`：默认本地 WebP；`localhost` / IPv6 loopback 同样处理。
- `Haqi.html?assets=cdn`：本机验收线上资源模式；其余域名（包括局域网 IP）默认 CDN。
- `Haqi.html?assets=local`：明确使用 Git 资源，可用于无网的局域网开发。线上发布不加此参数。
- 91项资源（90张 WebP、1段可选 Ogg）合计8,326,728字节；转换前10,823,856字节，减少23.1%。原PNG从当前工作树移除，历史仍在Git；原始完整条目可重新下载。
- 图片加载在设置 `src` 前指定 `crossOrigin='anonymous'`；所有资源的HTTP、CORS、尺寸、内容哈希已经核验。可选音乐失败不影响游戏。

准备环境只用于开发，游戏不加载 Pillow 或 npm 第三方库：

```bash
python3 -m venv .asset-cache/venv
.asset-cache/venv/bin/pip install Pillow
HAQI_ASSET_PYTHON=.asset-cache/venv/bin/python npm run assets:adventure
.asset-cache/venv/bin/python scripts/prepare_adventure_media.py --verify
npm run plan:adventure-cdn
# 根据 AGENTS.md 的 Maisi 七牛上传技能上传 .asset-cache/publish 中计划列出的文件。
# 文件名为 SHA-256；object key/完整URL在 data/adventure/cdn-publish-plan.json。
npm run verify:adventure-cdn
```

发布脚本本身不存放凭据：先生成计划，使用 Maisi 的上传器上传，最后对每个实际URL重新GET、验证CORS与完整字节，全部成功才写入 `media.json` 的CDN地址。线上资源仅允许 `https://cdn.keepwork.com/`，不使用临时URL或其他CDN。修改原图后重新准备；`--prune-png` 只删除已经验证转换成功且源哈希匹配的PNG。原生成图集丢失时从Git恢复已准备的WebP，或重新提供原始图集。

## Keepwork 云端旅途

开始画面、设置和战斗中的「云端旅途 / 云端存档」提供可选手动检查点。点击连接后才加载已验证的 `https://cdn.keepwork.com/sdk/keepworkSDK.core.iife.js`，使用SDK的中文登录窗；普通本地游玩不加载SDK。

每次保存会在 `sdk.personalPageStore.withWorkspace('HaqiAdventure')` 下新增 `checkpoints/<UTC时间>_<UUID>.json`。封装版本1包含 `app`、`id`、`updatedAt`、完整AdventureSave；不会上传SDK token、密码或密钥。无固定latest文件，不自动覆盖其他设备的记录，也没有后台自动云同步。

`createFile` 硬编码开启后台 server pageCache 写入，可能抢先清除pending；不能据此证明持久化。适配器使用 `savePageData(path, 'content', text, false, false)` 暂存内容并关闭立即后台flush/远端缓存，再等待 `syncToGit(path,false)`，再通过SDK的 `getFileByFullPath(...,undefined,false)` 直接读取远端核验JSON内容。PersonalPageStore的普通读取、甚至 `forceRemote` 读取都可能在失败时回退本地，因此不能用它们证明云端成功。列表使用 `listDir('checkpoints',false,{remoteOnly:true})`；SDK会吞掉目录错误，所以空列表只提示刷新重试，不断言没有存档。

恢复流程先读取实际远端记录，校验版本、角色、任务、装备及战斗重演，再显示本地/云端进度供玩家选择。点击「确认恢复」前不会修改本地存档；先备份到 `haqi.adventure.kids.v1.before-cloud`，再替换主存档。备份写入失败则中止恢复；菜单可导出上次备份。更新时间使用独立 `.updated` 键，不改变原存档兼容性。账号变化使旧预览失效。

网络超时或未确认写入时，本地进度不受影响；SDK请求可能随后完成，因此应先刷新检查再重试。云端记录的可见性遵循用户Keepwork项目设置，不宣称其为加密或私密存储。真正登录账号后的服务端往返尚需验收；当前已验证真实SDK加载/中文登录/取消，以及模拟SDK上的保存、失败、预览、恢复与备份。

## 技能特效

当前45张冒险技能卡均接入配置化粒子和特殊演出，召唤海狮、火凤、火魔等角色。新增透明WebP图集，线上采用Keepwork CDN。支持系统减少动态效果偏好，不改变战斗数值或存档。独立预览页为 `HaqiEffects.html`，开发配置见[技能特效](spell-effects.md)。
