# 2026-11-10 联网复验与发布验收

本报告承接 1645 失败清理报告。使用用户在 Edge 正常登录的账号，新建隔离角色“联网验收1110”；未修改原有两个角色，未发生付款或对其他玩家发送消息。

## 已验证

- 新建角色自动进入《失落的光》，退出序章后进入建角，而非先询问是否观看。
- 登录读取云角色列表，进入营地；真实游戏服显示“已连接游戏服务器”。该提示由 adventure_game_server.js 收到 welcome 后发出。手动重新连接再次成功。
- 新角色完成英语解救、领取咕噜噜并入队，任务推进至 2/3，仙豆 100。返回角色列表显示“角色已保存到云端”；执行保存、刷新云端角色并重新进入，伙伴、2/3 进度、仙豆 100 正确恢复，未重复领奖。
- 正式游戏进入寒冰侦察兵战斗，撤退返回训练林地，任务和物品保留，没有卡在战斗页面。
- CDN 6 背景、3 圆盘、3 森林 UI 共 12 项：HTTP 200、通配 CORS、字节长度及 SHA-256 全部一致。
- 实际 AI 角色米娅的英语对话：keepwork-flash 返回完整英文回复及中文释义。
- 修改后宣传片整片检查 36/36 通过，包含真实 AI 评价和映射调用；控制台 error 为空。此检查是辅助证据，不替代云端或真实游戏操作。
- 最终全量自动测试：2817 项，2702 通过，0 失败，115 原有跳过；联网权限下执行。之前受限环境的 EACCES 不计产品失败。

## 本轮发现并修复

1. keepwork-lite 的 /core/v0/gpt/chat 多次 HTTP 500；默认 keepwork-pro 实际流返回纯文本，不能满足 JSON 评价协议。用设置中已登记的 keepwork-flash 对照后真实回复成功。默认评判、词义映射和演示统一使用 flash，用户显式模型选择仍保留，映射缓存键同步换型。仍严格拒绝非 JSON/不完整评价，未伪造奖励。
2. 自动化输入触发缺 key 的键盘事件导致 keyup.toLowerCase 异常；keydown/keyup 忽略无字符串 key 的事件。

## 验收边界

115 个跳过项不计通过。真人双端社交、麦克风录音/真实支付及穷举所有岛屿任务未执行；不宣称无任何缺陷。微信 localhost 扫码回调错误仍属于登录配置限制，本轮用户通过可用登录方式完成验证。前一报告列出的本地战斗、背包、配卡、购买、响应式和独立模拟器结果继续有效。

## 证据

- D:/paracraft-apps/output/haqi/nov10-network-assets.json
- D:/paracraft-apps/output/haqi/nov10-cloud-restored.png
- D:/paracraft-apps/output/haqi/nov10-online-promo-36-pass.png
- D:/paracraft-apps/output/haqi/nov10-network-full-suite.log
- D:/paracraft-apps/output/haqi/nov10-network-build.log

发布状态另以 CDN manifest 和两仓远端验证结果为准。
