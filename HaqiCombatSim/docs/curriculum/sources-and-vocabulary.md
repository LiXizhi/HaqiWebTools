# 教材依据、范围与词条来源

核验日期：2026-10-26。官方网页用于确定参考体系；本次没有逐词完成全部教材的对齐，没有购买或导入受限教材全文。四语文件里的“候选词”是本项目原创选材建议，不声称每一个都属于某本教材的指定册或官方级别。

## 官方参考登记

| 来源 ID | 参考与官方入口 | 本次核对到什么 | 尚未完成 |
| --- | --- | --- | --- |
| EN-YLE-2025 | [Cambridge 少儿考试](https://www.cambridgeenglish.org/exams-and-tests/qualifications/young-learners/paper/)；[2025 词表 PDF](https://www.cambridgeenglish.org/images/506166-starters-movers-flyers-word-list-2025.pdf)；[教师手册](https://www.cambridgeenglish.org/Images/handbook-for-teachers-pre-a1-starters-a1-movers-and-a2-flyers.pdf) | 官方等级为 Pre A1 Starters、A1 Movers、A2 Flyers；官方资源页提供词表和听说读写参考 | 后续已下载官方 44 页 PDF，读取第 4—16 页并登记英语 L1 的 180 个目标位置；哈希见 english-level-one.json。故事语义、句型及四技能教学覆盖仍待核对 |
| EN-KB-NG | [Kid’s Box New Generation 官方样章](https://assets.cambridge.org/97884132/24411/excerpt/9788413224411_excerpt.pdf)；[官方教材目录](https://shop.cambridge.org/english/family/2100055367) | 教师样章说明与 Cambridge 少儿框架的关系；可作儿童情境、复习编排参考 | 未核完全部册次、单元和词汇；不把游戏 L1/L2/L3 等同教材 Book 1/2/3 |
| ZH-YCT | [YCT 官方介绍](https://www.chinesetest.cn/YCT)；[官方考生手册](https://m.chinesetest.cn/userfiles/file/YCTTest.pdf)；[官方教材入口](https://admin.chinesetest.cn/jiaocheng.do) | 面向中小学生第二语言使用；手册列 1/2/3/4 级词汇参考量 80/150/300/600，另设口试 | 数字是该手册口径，不用作新 HSK 等级换算；《YCT 标准教程》具体版次、册页、字词清单待逐条核对 |
| JA-IRODORI | [官方课程说明](https://www.irodori.jpf.go.jp/en/about.html)；[入门下载](https://www.irodori.jpf.go.jp/en/starter/pdf.html)；[词表与对应表资源](https://www.irodori.jpf.go.jp/en/resources.html) | Starter 为 A1，Elementary 1/2 为 A2；以生活 Can-do 组织；现有更高部分不纳入本项目 | 待选取儿童适用 Can-do、具体课号、表达和词条；成人工作生活情境须重写 |
| JA-MARUGOTO | [官方系列说明](https://marugoto.jpf.go.jp/en/about/series/) | 入门 A1、初级 A2，可补充交流与语言知识组织 | 不直接宣称它是儿童专用教材；待核具体章节，避免把成人话题搬进儿童故事 |
| KO-SEJONG | [在线世宗学堂课程](https://www.iksi.or.kr/lms/main/curriculum.do)；[官方学习路线](https://nuri.iksi.or.kr/front/page/siteguide/learning/roadmap/main.do) | 包含 Introduction、Beginner 1/2；初级课程基于标准初级 1、2 范围，重视日常交流 | 网页课程、教材册号和游戏 Level 分别记；具体教材版本、单元词表、例句需母语者核对，不自行换算 TOPIK／CEFR |

引用官方框架不代表游戏获得官方认证。故事、台词和评估题由项目原创；不复制教材插图、成篇课文、录音或考题到发行包。资料版本更新先核对差异，不悄悄扩大已经约定的教学范围。

## 词汇覆盖如何落到可检查的条目

词汇选择顺序：单元要完成的交流 → 官方范围候选 → 儿童生活常用程度 → 当前真实游戏对象／动作 → 自然例句 → 规范词条映射。暂未收录的核心生活词需要补词库，不能为了匹配现有 `words` 而把剧情改成不自然的孤立词。

每条目标记录以下字段。这里定义的是待建台账格式，不是声称运行时已经存在这些字段。

| 字段 | 要记录的内容 |
| --- | --- |
| `targetId` | 独立稳定 ID，如 `EN-U01-T01`；不是存档课程 ID |
| `language / lemma / sense / forms` | 语言、基本形式、当前词义、此阶段出现的自然词形；专有名词另记 |
| `entryId` | 实际 WordTree 规范词条；未完成映射写“待核”，不能猜中文键 |
| `sourceId / edition / locator / check` | 上表来源、版本、页或单元／Can-do 编号；未逐条验证写“待核”，不自动生成伪引用 |
| `level / unit / receptive / productive` | 项目层次与单元；需要听读识别，还是要主动说写；两者分开 |
| `firstStory / reuseStories` | 首次教学和至少三个后续情境，不能只给首次出现位置 |
| `example / support / evidence` | 自然例句、需要的辅助和验证方式；“出现过”不是掌握证据 |
| `status / reviewer / revision` | 候选、来源已核、语言复审、接入、迁移实测及日期；状态不可只写 done |

现有四语词库使用共享中文键且一键可能包含多个词形／近义词。**2012 个键不等于 2012 个词已经教过，更不等于儿童会使用。** 教材词义和运行时词条若不能一对一，记录差异再处理，保留旧回执，不以删词重排破坏存档。

日语辞书形、礼貌形，韩语原形、活用形，以及英语词形不能各算一个“新掌握词”。但形态规则本身仍需教学；日语 `書` 不能不分语境当作日常“信”，天气“冷”和物品“冰凉”的韩语表达也不能因为共享中文键就互换。

## 项目选材预算，不作为官方词数或毕业线

| 语言 | L1 累计规划 | L2 累计规划 | L3 累计规划 | 使用方式 |
| --- | --- | --- | --- | --- |
| 中文 | 约 80 个核心词／语块 | 约 150 个 | 约 300 个；日常缺口可逐步扩展 | 参考 YCT 1—3 的规模，不承诺这 300 个与官方表逐项相同；扩展不意味着开启完整 YCT 4 课程 |
| 英语 | 约 150—250 个 | 约 350—500 个 | 约 600—800 个 | 从 YLE 候选中按功能选择；不是完整 Flyers 词表，不以数量宣称 A2 达标 |
| 日语 | 约 150—250 个 | 约 350—500 个 | 约 600—800 个 | 词汇与固定表达分开统计；优先儿童适用的生活 Can-do |
| 韩语 | 约 150—250 个 | 约 350—500 个 | 约 600—800 个 | 固定礼貌表达先用，形态与语体逐步展开；不宣称官方世宗词量 |

这些预算只是规划容量，需在逐词来源核验和试玩后调整。当前分语文件提供的是每单元的种子词，不是完整预算词表；补齐完整账本是 [CUR-02](backlog.md) 的明确未完成项。毕业按交流、听读理解和独立写作表现判断，不能用词数替代。

## 当前源码快照：真正被新课程明确练习的目标

统计来源：`data/adventure/island-language-courses.json`，排除 `legacyQuestIds`，对 `steps[].words[]` 原始字符串去重；这是 authored target 统计，不是规范词义去重，也不含对白所有附带生词。

| 语言 | 新课程数／步骤 | 去重目标字符串 | 主要问题 |
| --- | --- | --- | --- |
| 中文 | 8／32 | 14 | 旧中文首岛六任务另计；新八岛大量重复少数词，无完整语音／句型覆盖 |
| 英语 | 9／38 | 16 | 首岛剧情已深化；其他岛多数仍是词级骨架，没有系统词表和迁移测评 |
| 日语 | 9／37 | 15 | 有对象接线，不代表助词、礼貌形、读音和词义已完整复审 |
| 韩语 | 9／37 | 14 | 有对象接线，不代表活用、礼貌体、天气／触感等用词已自然 |

此快照需随课程变更重算。不得据九岛入口齐全宣称任何 Level 已交付。


## 英语 L1 核心清单接入准备

[180 词覆盖账本](en-l1-vocabulary.md)逐条链接到规范词条，来源为官方词表字母表或第 7 页数字范围；少量词取自 Movers／Flyers，项目 L1 不等同考试级别。新增 44 个中文桥接键及英语映射，另补已有“谢谢”的英语词条。日韩对应新增键暂留空，不用机器猜译补齐；原有词条与记录不删除。take、count 作为独立主词条，保留原 use、number 的既有证据，不将旧记录复制成新词的学习证明。180 个目标都有规范 ID，但完整故事／家园覆盖仍为空待创作，清单现已用于运行时文字卡配置，但尚未形成完整教学与进阶流程。
