---
name: haqi-populate-city
description: 为魔法哈奇现实世界创建或完善城市的独立按需 JSON，包括当地语言、人物外观权重、姓名、文化素材、NPC图集与可玩的任务故事。用于指定城市及批量城市内容准备，不用于地理数据迁移或发布游戏。
---

# 为现实世界城市配置居民与故事

城市大地标管理内部地点或明确绑定的地图命名节点；生成这些节点的生活副本使用项目 [haqi-generate-city-dungeons](../haqi-generate-city-dungeons/SKILL.md)。本技能继续负责地方资料、人物与基础城市配置，不把附近所有地点自动归属本城。

先定位包含 `Haqi.html`、`docs/earth-world.md` 与 `js/adventure_earth_city_config_core.js` 的 HaqiCombatSim 项目。遵循其 AGENTS.md。修改现有城市时以 `data/adventure/earth/cities/<city-id>.json` 为唯一作者源，保留既有 NPC、故事、章节与奖励身份。

使用 [城市配置契约](references/city-schema.md)；深圳是已接入的完整示例。阅读项目 `.github/skills/haqi-story/SKILL.md` 中的简明故事与历史人物约定。先确认当地名称、国家、经纬度和已有城市，避免同名城市串用。一次只扩展用户指定的城市；批量任务按城市分别验证、写入，不构造包含所有正文的全局 JSON。

## 地方资料与提示词

定位本机 `apps/official/apps/helloworld/MapCopilot.js`，优先当前 apps 仓库。不存在时可查其他 HelloWorld checkout，并注明实际参考版本。以下方法提供内容组织方式，不作为人口或地理事实的证据：

- `genGeoCultureElements`：动物与植物、当地人物与穿着、农业与食物素材、常见建筑。根据城市需要选取数量，不机械补满四项；现代居民使用日常服饰，传统服饰用于有明确背景的角色。
- `genGeoCityElements` / `generateFamousPlaces`：当地识别度高的建筑、街景与地标。生成城市自己的 `cityView.imagePrompt`，不把相邻名城的特色误算为本城。其旧九城市门槛不适用于单城作者流程。
- `generateLocationNames`：当地姓名池、原文字形、音译和姓名顺序。外国人物保留 `nativeName`；姓名语言与界面显示语言分开，尊重个人命名习惯。
- `generateCityNpcsAndDungeons` / `generateCityStoryDialogs`：人物愿望、求助、线索、选择与结果。只采用 Haqi 已实现的交谈、支线、地图、背包、宠物与战斗入口；不复制 HelloCrush、quiz 或不存在的服务器能力。

查证城市主要交流语言、常用地方语言、代表性动植物与建筑。优先当地政府、统计机构、博物馆或保护机构；每条事实关联 `sources` 的稳定 ID、URL、统计日期及查阅日期。地点/物种资料与原创剧情明确区分。文化元素先作为故事或美术准备素材，未接入图片或交互时标注状态。

## 人物与语言

`languages.primary` 保存主要交流语言，各 NPC 单独填写 `languages`。不得根据肤色自动决定姓名、职业、性格、能力或母语。

用户需要当地大多数常见外观，允许使用明确标为游戏创作的 `characterGeneration.appearanceWeights`，使权重合计为 1。保留当地主要居民形象，并按用户意图加入访客与不同背景居民；少量固定 NPC 不必与权重严格同百分比。可复用已有合适头像，也可生成新图集。

民族、国籍、母语和外观是不同字段。有城市级统计时将原分类、日期、范围放入 `demographics`；缺失比例设为 `null`，不得用创作权重冒充统计，不套用全国/省级数字。历史资料标明年份，不写成最新人口。

## 图集与接入

每城优先一张共享透明 WebP，以 `art.npcs.frames` 和 `npc.portrait.crop` 绑定；图集数量可以按城市实际人物需求调整，但单张不超过 200000 字节。先用 imagegen 生成并检查格子顺序、人物完整性与 alpha，再用 `scripts/prepare_earth_npc_art.py source.png city.json --columns N --rows M` 保持比例转换、打包、记录源/输出哈希。复用现有头像时保留真实来源，不重绘已有图集。

通过项目指定的 Keepwork 素材上传流程上传图集，取得实际成功 URL 后填写 `cdn`；GET 核对 SHA-256、尺寸、alpha 与 CORS。不要猜测成功 URL，不让生成服务进入运行时，不把图片打进 dist。上传素材不代表发布游戏或授权同步其他仓库。

在城市 JSON 内保存居民、地标、主线、日常支线、学习句子、文化提示词与美术清单。世界 `index.json.regions` 只新增轻量范围及 `manifest: cities/<id>.json`；地图浏览不读取完整城市包，进入区域才加载。道路沿用自动生成，不增加 roads.json。城市进度和学习奖励按城市/故事编号隔离；NPC数值ID查重，保留既有编号，不采用姓名作为身份。

支线使用已实现的接取→顺序交谈目标→回报；主线若包含战斗，遭遇事件必须接入真实结算。新故事默认只记录经历，未指定奖励时不新增货币或掉落。提供人物动机、清楚的当前目标和简短中文对白；英语学习句保留可说性，地方语言标签不能被误称为已支持的语音课程。

## 验证与交付

运行 `node scripts/check_earth_cities.mjs`、相关 `battle_earth*.test.mjs` 以及项目要求的 `npm run test:battle`。覆盖单城懒加载、重复/取消请求、旧深圳进度迁移、跨城隔离、支线前置与重复交付、存档分片和图集裁剪。交互接入后用隔离内存角色核验桌面与390px，不修改真人存档。

更新 `docs/earth-world.md`、架构图及当天开发/QA记录。交付城市 JSON、图集预览、资料来源与实测范围；默认保留本地修改，不提交、推送或发布。
