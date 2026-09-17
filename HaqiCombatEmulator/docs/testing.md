# 测试与本轮验收记录

日期：2026-09-16。机器：Apple M3 Pro，18 GB 内存。Node v24.19.0，Chrome 152 headless。首轮记录内核 v0.1.0 / experimental；当前 v0.2 增量见文末。

## 可复现命令

```sh
npm ci
npm run data:audit
npm run check
npm test
npm run test:browser
npm run benchmark
HAQI_VERSION=teen npm run benchmark
```

浏览器测试使用本机 Chrome，自动在 127.0.0.1:8766 启动/关闭 Python 静态服务，无应用后端。如该端口被占用，应释放端口或修改测试配置。`test-results/` 是忽略目录；本轮基准副本保存在 [plans/evidence](plans/evidence)。

## 已通过的验证

- 数据审计：儿童 717、青年 1,289 个本地输入文件哈希一致；缺失引用列入清单。
- 静态检查：35 个 JavaScript 模块语法与核心纯函数依赖边界检查通过。
- Node：**21 项测试通过**。双版本 1v1–4v4 确定性、无事件/有事件结果一致、动作回放一致、非法动作不改状态、隐藏信息边界、缺失输入拒绝、快照不叠加 VIP/装备/等级绝对值、补丁校验、四类实验分片与统计。
- 原 Lua 片段对照：直接读取 card_server.lua/player_server.lua 的函数，在开发依赖 Fengari VM 执行。伤害/治疗的边界和舍入、五系多等级/双版本/VIP 的基础 HP、合法能量消费通过。不是仅复制 JS 公式做自我验证。
- Chrome：**5 个端到端用例通过**。桌面手动推进/配装/保存恢复/版本切换/千场实验/回放；Worker/Node 相同结果、取消保留分片、真实 Worker 候选复测隔离；390px 手机布局、AI 断网与非法补丁；万场主线程响应；双版本四规模 Node/浏览器/Worker 同输入一致。
- 桌面和手机截图已实际查看；修正手机战场血量裁切与卡名空间不足。截图由浏览器测试生成，可在 test-results 查看。
- 仓库 `git diff --check` 通过。没有提交、推送或部署。

## 万场性能

固定 4v4 实验预设、等级 50 快照、战术策略、成对交换阵营、seed=20260916，包含聚合报告；不包含读取源 JSON 的冷启动时间。不记录逐事件动画。

| 环境 | 实际场数 | 时间 | 吞吐 | 内存 |
|---|---:|---:|---:|---|
| 儿童版 Node 单线程 | 10,000 | 7.915 秒 | 1,263 场/秒 | 峰值 RSS 243.5 MiB；结束 heap 80.1 MiB |
| 青年版 Node 单线程 | 10,000 | 7.014 秒 | 1,426 场/秒 | 峰值 RSS 238.4 MiB；结束 heap 62.6 MiB |
| 儿童版 Chrome 四 Worker | 10,000 | 2.389 秒 | 约 4,186 场/秒 | 页面 heap 51.6 MiB，不含所有 Worker 进程 RSS |

浏览器期间 25ms 主线程计时器触发 94 次，说明计算期间主线程可响应。三个运行均小于 60 秒；这只代表当前预设和当前已实现机制，不能提前承诺完整移植后相同性能。

完整参数/hash/运行环境原始记录：[儿童 Node](plans/evidence/benchmark-kids.json)、[青年 Node](plans/evidence/benchmark-teen.json)、[Chrome](plans/evidence/benchmark-browser.json)。

## 尚未通过的最终验收

完整配装/所有战宠/独立符文规则、所有效果类型、原 Lua 整场 PvP 事件与随机消耗对照、真实用户 Keepwork 登录与在线 AI 建议、真实移动设备多浏览器操作尚未完成。手机测试是 Chrome 移动视口，并非实体手机全兼容测试。

因此不能用这些基础测试宣称 P1/P2/P5 全部完成，也不能以模拟胜率指导正式服直接改数值。所有报告保留 experimental 标记，下一步见 code-plan。

## 2026-09-17 v0.2 增量

25 项 Node 测试和 6 项 Chrome 用例通过；新增双版本卡包容量、补牌上限、弃牌与耗尽、原子校验、回放和界面配卡/弃牌/出牌/状态验证。此前性能表为 v0.1 历史基准，v0.2 浏览器万场预算测试仍在 60 秒内通过。

## 2026-09-17 v0.2.1 辅助卡组

新增 `tests/engine/support-decks.test.mjs`：两版本五系默认卡组均含攻击/增益/减益；旧默认迁移不改自定义卡组与人物属性；刀/陷阱/弱化的合法目标、机器人选择与真实状态施加。Chrome 增加目录分类、全员/单角色自动配卡与属性保留用例。总计 30 项 Node 测试、7 项 Chrome 用例；万场浏览器性能门槛继续通过。新卡组与 tactical-0.2 会改变结果，不能与旧预设的统计混为同一实验。

## 2026-09-17 v0.2.2 容量、副本与魔力

32 项 Node 测试、8 项 Chrome 用例通过。新增双版本默认 40 容量但不填满、6 张合法/7 张拒绝、统一无界面校验、精简卡组首轮抽中概率、加牌按钮上限、普通/超级魔力数量和不同颜色验证。`test-results/energy-colors.png` 已查看；语法与核心依赖检查、git diff --check 通过。
