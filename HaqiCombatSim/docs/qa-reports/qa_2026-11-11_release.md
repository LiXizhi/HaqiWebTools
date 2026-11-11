# 2026-11-11 新手交互与策略训练发布复核

## 版本与范围

本地交互改动 4b844fd 合并远端 214051b，合并提交 49a83a6。远端汉字与钓鱼改动保持，双方当日日志合并保留。仅发布哈奇既有正式入口，不发布 apps 其他项目，不同步 Maisi 或资源 Git 镜像。

项目引用的个人 haqi-release-qa 技能在当前安装及迁移目录未找到；按仓库 docs/product-release-qa.md 的正式用户路径原则执行本次变更专项与发布冒烟，不宣称完成全部产品黑盒矩阵。

## 已验证

- 合并后 Node 全目录：2851 总计，2736 通过，0 失败，115 默认浏览器跳过；nov11-release-source-final.log。
- 合并后战斗快速回归：1675/1675 通过；nov11-release-battle.log。
- 旧换岛追踪测试修正为远端的新行为：不重新固定用户取消的任务；有效追踪列表仍显示最新接取的任务。8 项任务专项通过，未回退远端功能。
- 正式构建成功，SDK 下载校验后自动更新默认版本 URL；未改 SDK 功能代码。计划 154 文件，23,449,117 字节，CDN 版本 697d7921f5313f4d。
- 正式构建放映室播放、暂停、跳章与三画幅检查通过，页面异常 0；nov11-release-promo.log。
- 本轮此前已完成：实际新手主线、先单挑再领伙伴路线、四尺寸问题可见性与战斗目标点击、27 项英语浏览器流程及 8 项家园失败专项复测。见当日开发日志。

## 发布闸门与未覆盖范围

正式构建包新访客至风暴、生命训练与领奖已完成，页面异常和 HTTP 错误均为 0。生命战实际经历治疗和加强攻击。随后完成 CDN、正式入口发布及线上访客战斗/刷新恢复复验。
本轮不包含真实支付、麦克风语音、真人社交、所有岛屿穷举。已登录云存档、AI 和游戏服的最近实际验证为 11 月 10 日，本轮不冒充重新验证。故事导出两项独立校验仍受原版 XML 缺失与档案不同步影响；不运行会缩减原档案的导出覆盖。当前运行时数据保留。

## 17:15 正式发布完成

- 源码构建对应已推送 origin/main：4771c3009b811c176de78ca9dd52190bd563c421。
- CDN：697d7921f5313f4d，154 个文件逐项 GET 内容哈希与 CORS 验证通过。
- apps origin：a40784df5337aac9af3235061d3bade11fa61004。
- Keepwork：87db587f91626cfb8e5a2894c737f27a7cc51a83。
- 仅更新 Haqi_v1.html、HaqiOfficialWebsite_v1.html、HaqiOfficialWebsite.html、HaqiPromo_v1.html。原有 AIMovieMaker 工作区修改保持未提交，其他项目未发布。未同步 Maisi、digitalhuman-resource。
- 四个正式入口均 HTTP 200，字节与已验证本地发布页一致，见 nov11-public-verification.json。
- 正式线上入口新访客实际完成自动序章、角色创建、错误英语不推进、有效变体通过、伙伴入队、冰战胜利、领奖、返回青龙；刷新后角色恢复，任务仍为“与居民探讨魔法”。页面错误 0、HTTP 错误 0，见 nov11-production-browser.log 与 nov11-production-verified.png。
- 上线地址：https://keepwork.com/api/raw/official/apps/MagicHaqi/release/Haqi_v1.html

本记录区分变更专项通过与完整产品验收，前述未覆盖范围仍有效。
