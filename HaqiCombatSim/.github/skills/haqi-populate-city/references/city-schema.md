# 城市 JSON v2 契约

可选 `entrance` 与 `nodes` 扩展见 [城市节点副本契约](../../haqi-generate-city-dungeons/references/node-schema.md)。城市大地标是配置容器，每个节点拥有独立副本；作者节点按城市命名空间识别，CSV节点按源ID识别，跨城不能重复接管同一个源节点。世界区域可增加 `dungeonIds` 轻量路由，正文仍只在单城文件中。

每城文件 `data/adventure/earth/cities/<id>.json`。源码验证器：`js/adventure_earth_city_config_core.js`；深圳完整示例：`data/adventure/earth/cities/shenzhen.json`。美术仍是外部 WebP，JSON 不嵌入二进制。

| 字段 | 约定 |
| --- | --- |
| `version`, `id`, `name`, `country`, `center` | version=2；id 为小写字母/数字/连字符；center 为 lon/lat |
| `sources[]` | 稳定 id、title、url 或源码 path；实际查阅日 accessed，统计日期 asOf；调用提示词可以记录 methods |
| `languages` | primary 使用语言码，primaryName 为中文名，alsoUsed 带 code/name/source；城市交流语言与每个人母语区分 |
| `demographics` | classification、asOf、source、groups；未知 percentage 或 racePercentages 用 null；保留原统计分类和覆盖范围 |
| `characterGeneration` | mode=creative-weights；appearanceWeights=[{id,weight}] 合计1；names 保存姓名池、顺序与访客原名；说明为游戏创作权重 |
| `cityView` | 城市独特建筑/风貌的 imagePrompt、source、status；未生成图片时 status=authoring-reference |
| `culturalElements` | animalsAndPlants、people、agriculture、buildings；元素带稳定 id、name、imagePrompt 和 source；明确哪些仅是准备资料 |
| `buildings[]` | 稳定 id、name、lon/lat、frame、w/h，引用 art.landmarks.frames |
| `npcs[]` | 全局唯一正整数 id、中文 name、可选 nativeName、role、lon/lat、frame、portrait、languages、dialogue、greeting、background、appearanceGroup、services |
| `art` | landmarks 复用现有地标契约；npcs 含 id、local、cdn、width/height、bytes、sha256、sourceSha256、source、encoding、frames；每帧=[x,y,w,h] |
| `encounters[]`, `safeAreas[]` | 遭遇引用现有 monsterId 和稳定 id；主线战斗绑定 chapterEvent；安全区为 id、lon/lat、radius |
| `quests` | 一条主线：稳定 id、cityId、name、steps、reward说明；step 含 id/event/name/destination，交谈步骤填写 npcId；战斗步骤不伪造交谈完成 |
| `sideQuests[]` | id 必须以 `<city-id>:` 开头，title/description/startNpc/endNpc/objectives/completion/reward；可选 prerequisites 为同城支线ID |
| `sideQuests[].objectives[]` | 稳定 id、npcId、label、reply；顺序交谈，完成所有目标后回 endNpc；没有采集、真实商品或额外货币接口 |
| `dialogue.stories` | NPC.dialogue 对应字典键；每故事稳定 id、speaker、text；可选 event、destination、choices=[{text,correct,reply}] |
| `learning` | 稳定 id、title、context、optional、prompts=[{id,zh,en,question:{zh-CN,en}}]；当前语音课程支持中文/英语 |

portrait 为 `{id: art.npcs.id, crop: art.npcs.frames[npc.frame]}`。services 当前允许 map、inventory、pet，分别查看地图、玩家背包和玩家宠物，不表示 NPC 出售商品。人物语言展示与界面/学习设置各自独立。

NPC 可选 `dialogueOverrides: [{minStep, key}]`，达到主线步骤后使用对应故事键；多个匹配时采用最高 minStep，使回报对白由城市数据控制。

世界索引只保留 `{id,name,country,bounds:{west,east,south,north},manifest:"cities/<id>.json"}`。设定范围按真实城市位置核验；范围重叠时不要靠数组顺序决定所属城市。真实地表仍决定可通行性，角色坐标经安全陆地检查；图像内道路不充当真实道路。

持久化使用 `earthCityProgress {version:1,cities:{[cityId]:{chapters:{[chapterId]:{version:1,step}},quests:{[questId]:{accepted,stage,complete}}}}}`，属于 records 分片。深圳旧 earthProgress 在首次推进时兼容映射并同步，不删除旧进度。离开城市保留记录，取消加载不恢复旧章节；学习故事身份为 `earth-<cityId>:<learning.id>`，旧深圳 help-together 身份保留。

扩展主线的交谈完成条件使用 story.event == 当前 step.event；可选支线不影响主线顺序。新增奖励必须另行接入现有奖励校验及原子保存，不只写配置。未知特性标为作者提案，不能产生无效交互按钮。
