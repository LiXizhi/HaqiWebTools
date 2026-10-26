# 家园：帮伙伴认路与认物

状态：已接入作者 JSON；2026-10-26。来源为 `data/adventure/curriculum/english-home-practice.json` 的 `en-l1-read-request-*` / `en-l1-listen-request-*`；稳定 S/L 定位由 `docs/story/story-index.json` 导出。

对象：英语 L1 初学者，只复习已认识的 book、bed、clock、lamp、box、table、chair、cup、plate、ball、toy、door、window。目标是理解一个物品词并做选择，不要求照抄或复述。

伙伴想布置阅读角、休息、准备招待或玩寻宝，先用普通对白说清愿望。随后提供一个短请求 `Find the [物品].`，玩家在家园真实物品中选择。错误时伙伴邀请重试或求助；选对后伙伴说 `Thank you!`。不声称已搬运、使用、消耗或生成物品。需要一个目标以及至少一种不同物品。

读与听共用请求含义，但分别记录技能。听力请求默认不显示文字；播放失败没有听力证据。提示可揭示目标及坐标，记 assisted。多次尝试的正确选择不是首选成功。无需新 NPC、美术、奖励或等级限制。

尚缺连续多步的小故事结果和空间指令；当前仅实现故事动机下的物品辨认，不冒充完整接待／布置任务。
