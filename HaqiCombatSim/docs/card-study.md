# 卡牌与技能共享图集

新增或修改卡牌请按 [卡牌美术与施法演出制作流程](art-pipeline.md) 操作，包含可复制的生成提示词、增量WebP打包、粒子/音效配置与验收制作单。

## 当前实现（2026-09-18）

`HaqiCards.html?assets=cdn` 展示儿童版全部225个基础技能，覆盖701条卡牌定义；支持学系筛选、名称搜索、分页和原版卡面对照。`?assets=local` 使用仓库WebP。正式冒险的卡包、手牌、技能演出及特效工坊共用 `js/skill_art.js`；儿童版对战模拟器手牌也使用新卡面。

18张普通3×3/4×4图集承载独立技能主体，6张专属3×3图集各承载一个高费技能的九帧动作：海狮冰剑、火魔掷石、旋风爆击、重生、蝠王吸魂、梦龙极光符文。每张新图集严格不超过100,000字节；五系背景仍小于24,000字节。标题、费用、说明、品质光环由程序绘制，等级/品质变体共享主体。普通技能使用主体配合位移、缩放、粒子，专属技能逐帧播放。

`data/adventure/skill-art.json` 记录裁剪格号、九帧顺序、来源条目、本地WebP、永久CDN、输入/输出哈希；生成方案在 `skill-art-plan.json`，完整最终提示词在 [skill-art-prompts.json](skill-art-prompts.json)。内置imagegen参照原卡面生成新画作；系统技能按语义生成，非逐像素复原。

开发准备：`python scripts/prepare_skill_art.py <source-records-directory>`，目录内每个图集ID的JSON提供 `source`（生成PNG绝对路径）和 `prompt`。脚本先无损，再调整质量及分辨率，保留alpha和等分格布局，增加透明留白。上传到 `keepwork/haqi-adventure/skill-atlases/` 后运行 `python scripts/verify_skill_art_cdn.py`，全部远端验证通过才记录CDN URL。审计结果见 [skill-art-audit.json](skill-art-audit.json)。不涉及数值规则改动；teen卡库未重绘。

以下为早期样张记录，九格195KB图集仅保留归档，不再由当前卡牌页面加载。

## 五系卡牌底图样张（历史）

入口：`HaqiCards.html?assets=cdn`（Keepwork CDN），`?assets=local`使用Git中的WebP。此页独立于游戏和特效工坊，不替换现有卡牌或数值。

五张底图由imagegen根据用户提供的原版寒冰「坚固壁垒」截图分别生成：寒冰青蓝、烈火红、风暴金黄、生命绿、死亡紫。保留薄亮边框、奶油色卷轴、放射纹图案区、银色说明区及淡水印；没有烘焙标题、数字、中央技能主体或四角图标。AI结果是视觉重建，非原始纹理的逐像素复原。

`js/card_study.js`程序绘制标题、说明、学系标记、右上魔力点、左侧数值和右侧护盾图标；五系使用同一套中央护盾几何造型以比较风格。文字及两处数值可变，支持显示/隐藏程序层及金卡光环。样张中的护盾数值仅为排版演示。

`data/adventure/card-frames.json`记录五张独立WebP及其CDN URL、SHA-256、尺寸和来源；总计116700字节，单张22832–23612字节，严格小于24,000字节（24KB）。背景按比例缩为208×312或232×348；Canvas文字、数字和图标仍按原分辨率绘制。生成PNG保留在生成工具输出目录，项目使用压缩后WebP。开发准备：`python3 scripts/prepare_card_frames.py <school-to-png-paths.json>`，需要Pillow；先尝试无损，再以90/85/80/75质量编码，仍超限则等比缩小后重试。压缩完成后才能上传，CDN远端字节核验后填写URL。sourceSha256保留本次输入图片哈希；线上运行不需要构建或父仓库。

验证：JS语法检查通过，浏览器五系加载、纯底图切换、动态魔力点检查通过；五个CDN文件均验证HTTP、CORS和SHA-256。本次不修改战斗逻辑，不扩大到全卡库替换。

## 九格主体复用样张

HaqiCards.html 默认展示九张原画重绘卡牌及可选技能演出，原五系程序护盾对照收纳在下方折叠区。选卡切换演出，支持播放/暂停、重播和进度拖动；每张卡下可展开对应原版卡面。系统减少动态效果设置默认暂停并简化运动。

使用内置 imagegen，参考九张原版卡面重新生成一个透明3×3主体图集，经过一次留白修订。实际WebP为672×672、195140字节，每格224×224。与背景小于24KB的约定分开：主体图集承载九种技能，遵守单张运行时WebP不超过200KB的约定。图集与五系背景均记录本地路径和永久Keepwork CDN URL。

`js/card_atlas_study.js` 的 `sprite()` 同时用于卡面和演出，两者读取 `data/adventure/card-atlas.json` 中相同的 `rect`。只下载一个主体图集，九格代表九种技能，不是同技能的九帧动画。演出为静态主体加位移、缩放、旋转及程序粒子，未接入正式战斗引擎。未来逐帧角色动画应使用独立动作行，而不把这九个技能当作连续帧。

来源完整清单条目随每个 `cells[].original` 保留；生成PNG哈希和WebP哈希分开记录。开发准备：`python scripts/prepare_card_atlas.py <generated-png>`，压缩完成后上传CDN并核验，再填写清单URL。生成提示词见[card-atlas-prompts.md](card-atlas-prompts.md)。

验证：WebP完整解码、alpha、九格裁剪、CDN HTTP/CORS/SHA-256与尺寸通过；逐张原版引用哈希和图集预算由测试守护。本机浏览器连接不可用，尚未完成页面视觉及交互验收；已查看生成图及压缩图。生成软光仍有少量边缘碎点，正式采用前可进一步清理。
