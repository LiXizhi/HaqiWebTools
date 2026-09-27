# 岛屿伙伴、异步组队与社交体系

2026-09-26 首期实现。入口是 `Haqi.html`，隔离 UI 验收页为 `tests/fixtures/social.html`。本期开放营地中英互学，其余岛屿配置已登记、默认关闭。未提交、推送或发布。

## 已落地的本地玩法

- 左上角色信息下方与坐骑同排放邮件、私聊，窄屏换行；右上副本下拉先 PvE、后红蘑菇 PvP。共享 GUI 关闭按钮，副本下拉支持方向键、Esc 与焦点退出。
- 营地默认六位其他伙伴，范围 5–8；中岛 10–14、大岛 14–20。自己、NPC、宠物不占名额，队友复用现有场景角色。
- 最近滚动 30 天发生真实通信的现有好友优先，按最后时间排序；再选当日当前岛屿活跃、语言互补的人，同层优先好友和共同挑战记录，再按等级距离与稳定种子排序。同方向学习者补充，最后是预设伙伴池。没有每日保留人数或固定轮换比例。
- 排除自己、重复 ID、屏蔽对象、非公开名片；真实账号必须通过名片及快照校验。账号切换清理列表、草稿、连接和未读状态。名片关闭不会伪造本人在线或所在岛屿。
- 十个人设覆盖五系，运行时配出两个语言方向；名单内不重复姓名。复用人物美术。预设伙伴没有好友、邮件能力。
- 热点分散、寻路、前后遮挡、30–90 秒停留、2–5 分钟热点切换；最多四分之一伙伴同时移动。页面隐藏暂停，交谈停步转向，组队跟随。运动参数集中在 BalanceParams.islandSocial。
- 选择副本后进入四人房间（队长固定第一席）。已邀请伙伴占位；空位可点「开放」，1.5–3.5 秒后由岛上伙伴自动加入（参数 `islandSocial.autoJoinMinMs/MaxMs`）。也可在房间下方名单手动邀请。满员或取消开放后再「立即出发」。出发冻结快照，自己操作、其余 SimpleBot，保留现有地图、多组怪物、Boss、治疗与防护规则。
- 组队进入失败不改原进度；更换副本或成员须退出。重开恢复成员初始满血；副本内血量跨场保留，不覆盖单人副本清怪或宠物编队。胜败、消耗和现有奖励只结算当前角色。
- 通关打开队伍战报，逐场种子与行动可导出；真实伙伴卡片有加好友、邮件和私聊入口，不自动发消息。
- 红蘑菇复用 kids free_pvp 1v1，满血开场、无物品扣除、无经济奖励；可导出与核心重演战报。真人对手按每日唯一胜场累计本周分数，预设伙伴不计榜。

## 服务依据与开放开关

核对了本机 Keepwork SDK `src/user/SocialFriends.ts`、`src/core/keepworkSDK.ts`、PersonalPageStore，Maisi `webgames/data/gamerank.md` 与 `miniGameProxyDev.html`、MagicHaqi `view_email.js` / `view_mailbox.js`，以及 coreservice 的 `maseai` 实现。原版 Aries 勇士大厅参考 `CombatRoom/LobbyClientServicePage` 的 PvE/PvP 分类。

`data/adventure/social.json` 当前：

| 配置 | 当前值 | 开放条件 |
|---|---|---|
| gameId | null | 登记独立的 1–9999 项目编号后填写；不借用其他游戏编号 |
| mailVerified | false | 双账号验证收发、实际响应字段、分页、已读与离线数据后开启 |
| chatVerified | false | 仅配置不生效；还须提供通过验证的 chatTransport，实现会话、历史、发送、已读、断开连接 |
| worlds.camp.enabled | true | 本地营地伙伴与玩法可用 |
| 其他 worlds.enabled | false | 各岛热点与容量验收后逐岛开放 |

好友申请沿 SDK 的 applyFriend/listApplies/acceptApply/rejectApply，好友与屏蔽分别走 list/listBlacklist。邮件已实现适配和单项已读界面，但收发保持验证门禁；未验证不请求邮件或生成邮件红点。SDK createChatRoom 只证明有房间接口，不能当作消息服务。不能用个人存档、邮件或 AI 输出替代真实私聊。

应用支持注入已验证 chatTransport：listConversations(session)、history(session,peerId)、send(session,peerId,text)、markRead(session,peerId,lastId)、disconnect()。消息按服务端 ID 去重；读具体会话才调用已读；发送失败保留草稿，结果不明不重试。AI 润色/翻译只修改草稿，用户手动发送。自动伙伴对话单独显示“AI 生成”。

排行榜读写使用 sdk.get/post('/maseai/gameRank')。分组包括模式、世界、语言方向及 UTC 日/周日期；周一为周起点，避免服务旧条目混入。先通过 PersonalPageStore 发布并回读核验名片，再提交成绩。服务可能返回占位用户，只有读到该账号有效名片及兼容快照才展示。活跃仅记有效学习、交付任务或胜利战斗；同日去重，周分按活跃日期数。

公开名片路径为 `withWorkspace('HaqiAdventure')` 的 `social/public.json`，只含展示资料、语言、学系、活跃日期和裁剪的战斗快照；无完整存档、通信正文与凭据。读取他人名片仅替换经校验的账号前缀，写入统一 cache API + syncToGit + 服务器缓存核验。

## 存储与恢复

- `socialActivity`、`socialPvpRecords`、`socialChallenges` 是小型业务记录，进入已有 records 分片，未变化分片复用。
- 最近通信只以账号隔离 localStorage 保存 `{好友ID:{at,source}}`，不存正文。当前无法从已核验服务补齐跨设备的全部 30 天发件历史，此项须在双账号验收时解决，不能宣称已全量同步。
- `coopRun` 包含成员快照、单独清怪记录、出发岛屿、成员血量和逐场检查点，只保存在现有角色 IndexedDB runtime。同步云端时移除整份 coopRun 与战斗临时状态，云端坐标区回到出发岛屿。
- 相同角色版本的本地 runtime 恢复副本及阵容，按需先载入副本数据，检查点沿用战斗重演。runtime 缺失时返回岛屿，不重新发放已结算奖励。
- 战报 JSON 为主动导出；PvP 本局状态目前驻留页面，刷新后需重新开场。娱乐榜不是服务端防作弊榜。

## 验收与剩余外部条件

核心/适配测试覆盖好友优先与降级、种子稳定、收发计入、失败不计入、单邮件已读、账号切换、路径校验、空榜门禁、2/3/4 人冻结恢复、连续副本通关重演、奖励去重和 PvP 计分。

连续通关用 50 级装备生命加成测试规格证明链路，不代表新手两人难度已经调优；没有为测试修改运行时副本数值。营地运行验收和手机 UI 使用隔离页面，不触碰真实账号。

尚需：登记 gameId；两个测试账号执行好友申请、真实邮件、离线私聊、已读同步、30 天双向历史及公开名片可见性联调；其余岛屿密度人工验收。上述完成前，真实通信与排行榜不可标注为上线可用。
