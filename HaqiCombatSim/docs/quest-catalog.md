# 全岛任务与怪物目录

运行 `npm run export:quests`，从本机原版 kids 配置生成三个目录。`npm run export:adventure` 也会刷新它们。输出不包含生成时间，重复导出应逐字节一致。源码路径均相对 `paraworld/`，输出保存 SHA-256；目录为紧凑 JSON，减少体积。完整源目录及尚未接入的Boss美术清单暂不进入发布 adventure 数据包，避免为尚未接入的剧情增加约10MB启动下载；后续接入时按需投影或拆包。

## 任务范围

`data/adventure/quest-catalog.json` 收录原版 `quest_list.xml` 全部 684 个任务：427 个未标记废除、257 个标记废除。

| 原版分类 | 全部 | 未标记废除 |
|---|---:|---:|
| 魔法营地 | 62 | 39 |
| 哈奇岛 | 86 | 4 |
| 火鸟岛 | 38 | 33 |
| 寒冰岛 | 53 | 48 |
| 沙漠岛 | 64 | 43 |
| 幽暗岛 | 12 | 12 |

另保留魔法师之路分类 270 条、试炼分类 99 条；不强行归属六岛。归属直接来自 `QuestGroup2` 与 `quest_types.xml`，不是通过标题猜测。废除记录也保留，不因导出而重新开放。

每个任务的 `data` 是保序 XML 树：`tag`、`attributes`、`text`、`children` 和有内容的 `tail`。保留原对白与按钮命令、组条件、前置任务、属性上下限、掉落来源及概率、奖励组与学系选择、销毁标志、重复/日期/时间戳和静默执行标志。原脚本与表达式仅作为数据保存，不执行。查询入口包括 `islands`、`goalQuestIds`、`requires` 和 `references`；运行时的营地改编仍留在既有 `chapter.json`。

全部 kids 任务 XML 辅助表同时归档。依据 `QuestHelp.lua:2046–2055`，目标使用 `goal_list_excel.xml`，NPC来自世界文件，CustomGoal与reward表合并核验；旧 `goal_list.xml` 保留来源但不拿来覆盖新版目标。Excel稀疏单元格按 `ss:Index` 处理，怪物生产者包含追加列表。

原始缺口明确保留：任务62523/62524引用的NPC30529未解析；`growrec.xml` 本身XML格式错误，完整原文与解析错误保留在表内。它们不阻断其他完整配置导出。

**导出不等于剧情脚本。** 14个营地教学任务仍标记 `opening-adaptation`，由章节线性执行。其余未废除任务从 `quest-runtime.json` 接取和交付，不播放原对白脚本，也不做变身。红蘑菇对战、充值、人气和原服徽章目标会保持无法推进。

## 怪物与宠物复用

`monster-catalog.json` 包含607个模板文件、611个mob定义和540个非空法阵实例。保留原属性与完整模板树（包括与mob并列的 `cardsets`、`sequences`、`genes`）、世界坐标、法阵脚本、怪物目标和主线任务引用。数据来自整个kids Mob及WorldData目录；保留副本和历史场景，不宣称所有实例均处于原服当前启用状态。

3个原始引用模板缺失：`HaqiLand/MobTemplate_Pineapple_backup.xml`、`IceLand/MobTemplate_LifeBear_backup.xml`、`MobTemplate_TheGreatTreeIronBee_BossLevel4.xml`。报告保留完整路径。Anubis模板仅去掉声明前的空白用于解析，原字节哈希保持原样。

现有宠物实际为359种。530个怪物有按原模型族选择的宠物外观**候选**，23个主线首领要求原模型立绘，58个尚未选图。映射写明 `pet-reuse-proposal`；允许美术替代不意味着原物种、学系或战斗数值相同。候选仍需视觉核验，尤其树人、石怪等轮廓差异大的模型族；当前没有应用到运行时。怪物的生命、牌组、奖励、AI保持原始数据，不从宠物复制。

## 剧情首领WebP

`boss-art-plan.json` 为23个主线首领保存原模型、模板哈希、原始资源清单条目、任务关联和输出要求。包含火鸟战士首领、冰魔伯爵、瘟疫领主真身及上古梦龙守卫等。Boss识别是美术候选筛选，并非原服全部Boss类型的权威分类。

1. `python3 scripts/prepare_boss_art.py` 刷新渲染清单，无额外库需求。
2. 使用Pillow环境运行 `python3 scripts/prepare_boss_art.py --source-previews`，下载并按原清单MD5/字节数校验缩略图，转换原尺寸WebP到 `.asset-cache/boss-art/`。当前19个有缩略图，均64×64，不放大，不作为正式战斗图。
3. macOS运行 `bash ../../bin/paracraft-cli-530.sh /path/to/paraworld` 启动已安装的Paracraft；确认8099 health返回worldEntered。随后在Pillow环境运行 `python3 scripts/render_boss_models.py`，通过原生CLI在独立mini-scene渲染23个原模型为透明512×512 PNG，不改世界对象或存档。支持 `--id boss-40112` 单张检查，结束后停用并隐藏专属渲染控件。
4. `python3 scripts/prepare_boss_art.py --render-dir .asset-cache/boss-art/native --archive` 验证原生图透明、非空、未裁断和分辨率；先无损再高质量有损，输出透明256×256且严格小于48,000字节的暂存WebP。生成的 `renders.json` 保留输入和输出SHA-256。不加 `--archive` 时可只检查部分渲染；归档要求23个齐全，写入 `assets/adventure/bosses/` 和带模型/模板/渲染/图片哈希的 `boss-art.json`。
5. 视觉核验造型/裁剪后，按既有Keepwork资源上传技能发布，验证实际CDN字节与CORS，再接入运行时清单。当前23张高清原生图已完成本地归档、CDN上传与运行时绑定；渲染计划状态为 `cdn-verified`。后续重导出会核验本地图片哈希及模板来源再保留完成状态。

2026-09-22续做：已找到并启动 `/Applications/Paracraft.app`，使用项目自带macOS启动脚本，原配置已自动备份。23张原生Boss WebP均为透明256×256，合计809,766字节，最大44,354字节；已检查整批画面、透明边距、尺寸与哈希。原始PNG、19张64px对照图及预览位于 `.asset-cache/boss-art/`，不进入Git或dist；正式本地WebP可纳入Git，发布不重复上传静态美术。11项目录/资源打包定向测试通过；该阶段尚未上传CDN或接入战斗；后续已完成，见下文。


## 任务手记展示接入（2026-09-22）

底部任务窗口已接入全目录只读展示。`scripts/package_quests.mjs` 从源目录生成 `quest-journal.json`，去掉脚本和无关源元数据，保留684条任务及目标、NPC、前置、条件与奖励。Vite构建发出独立展示文件，普通静态服务读取同名快照；首次打开任务窗口才下载约472KB。网络失败显示教学任务和重试，不阻断游戏。

原14条教学任务仍使用章节进度。2026-09-23起，其余未废除任务在手记和居民对话中接取、追踪和交付。击败副本里对应模板的怪物、按掉落概率收集、与居民交谈、交付空目标，以及强化、镶嵌、喂养和换卡包都会写入存档。剧情对白脚本和变身仍不执行。

## 2026-09-22：原版Boss CDN与战斗外观

23张Paracraft原模型透明WebP已上传至Keepwork永久CDN，逐张核验SHA-256、文件字节数与CORS；256×256，合计809,766字节，最大44,354字节。`boss-art.json`保留原始模型来源、本地文件与实际CDN地址，`boss-art-plan.json`标记cdn-verified。

`package_monster_art.mjs`生成运行时`monster-art.json`，按原始模板路径与模型绑定607项（116项原Boss模型外观、491项宠物外观），共复用25种现有宠物。27项额外外观改编记录在adaptations中，其余沿用已匹配模型；仅改变显示，不改变战斗属性、捕捉身份或存档。地图遭遇与战斗单位统一走`drawMonster`，23种Boss全部支持现有攻击/受击/倒地位移效果。原版脚本未支持的遭遇仍按原有规则禁用，不因美术接入而开放。

验证：419项测试通过，npm run build通过；全部611条原怪物记录、372项副本怪物与7项主线怪物都有外观绑定。独立只读浏览器预览中，23张Boss与25种宠物均在CDN和显式local模式解码成功，Canvas可读；全部Boss分组通过实际renderBattle绘制，桌面与390px检查无脚本错误。预览入口为`tests/fixtures/monster-art.html`，不读取或写入玩家存档；Boss战斗预览使用原属性但不执行AI，不代表新增剧情已可玩。构建只含代码和JSON，不重复携带静态美术。未提交、推送或发布网站。

2026-09-22界面调整：任务窗口默认当前岛屿；非岛屿区域使用进入副本前的岛屿，无记录则哈奇岛。搜索框已移除，岛屿和状态筛选合并到标题栏，保留全部地区选项、分页和前置任务跳转。

2026-09-22续改：展示JSON已移除257条废除任务，现为427条。打包/重新导出自动排除废除任务及指向它们的前置展示条目；UI不再提供废除状态筛选。684条原始记录仅保留于开发来源归档，不发布、不显示。
