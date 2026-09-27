# 发行运营工作区

从 [总计划](global-launch-plan.md) 开始。渠道事实在 [channels.json](channels.json)，素材与规则见 [launch-kit.md](launch-kit.md) 和 [operations.md](operations.md)。[onboarding.md](onboarding.md) 记录实际接入缺口。

## 本地工具

```powershell
node scripts/marketing_ops.mjs check
node scripts/marketing_ops.mjs report
node --test tests/marketing_ops.test.mjs
```

`check` 校验渠道和发布队列。`report` 读取 `.cache/marketing/snapshot.json`（不存在则全部指标为未接入），按北京时间日期生成 `.cache/marketing/reports/YYYY-MM-DD.md`。不自行抓取账户、不发送消息、不启动付款、不把未知数值写零。该工具为日报归档与数据质量检查，并不是尚未接入的平台 API。

复制 [snapshot.example.json](snapshot.example.json) 到 `.cache/marketing/snapshot.json` 后，只有核对过的来源才能填写 verified 指标。每条指标需 value、evidence、asOf。留存填写人数／分母／批次，不只写百分比。超 48 小时数据标过期。

定时任务读取 [operations.md](operations.md)，使用现有工具采集已授权来源、核验数据并生成／发送日报；缺权限则报告缺口。原始反馈、账号配置、平台回执、身份 ID、运营运行记录只放 `.cache/marketing/`，不提交 Git。开发日志写 `docs/devlog/`。

当前 API 接入状态：TapTap／Discord／其他媒体、集中埋点、本产品订单均未接入；日报不能代表这些集成已经完成。需要具体链接和后台权限，不需要把密码／Token 写进此目录。
