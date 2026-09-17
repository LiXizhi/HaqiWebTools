# Haqi Combat Emulator · 哈奇战斗实验室

纯 JavaScript / H5 的魔法哈奇战斗数值实验工具。儿童版与青年版共用无界面内核，通过静态 HTTP 服务直接打开，无需构建、应用后端或 NPL 运行时。

**当前为 v0.2 实验性实现，整个 P0–P5 计划尚未完成。** 可运行双版本五系 1v1–4v4、手动/机器人对战、回放、配装与快照编辑、Worker 批量实验、报告、数值补丁和 Keepwork 候选复测。原版服务端完整战斗一致性、完整配装/战宠/符文系统仍是未通过的验收项；不能把本工具胜率当作正式服平衡结论。缺失卡牌与明确未实现的效果会阻止对局启动。

## 启动

在本目录运行：

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

打开 <http://127.0.0.1:8765/HaqiCombatEmulator.html>。也可直接用编辑器 Live Server 打开 HTML。不要用 `file://`（ES Modules、fetch 和 Worker 需要 HTTP）。数据包已随项目提供，运行时无需 npm 安装。首次使用 AI 功能才加载 Keepwork SDK。

## 开发验证

```sh
npm ci
npm run check
npm test
npm run test:browser  # 本机安装 Chrome；Playwright 启动临时静态服务
npm run benchmark    # 固定儿童版 4v4、10,000 场
HAQI_VERSION=teen npm run benchmark
npm run data:import  # 需要仓库 config/Aries 和 Database 的真实快照
npm run data:audit
```

运行时代码在 `js/`，数据转换 Python 和测试 Lua VM 只用于开发。所有实验数据保存在浏览器 IndexedDB；清除站点数据将删除本机保存，建议导出 JSON。

- [文档导航](docs/README.md)
- [唯一进度入口与路线图](docs/code-plan.md)
- [入门](docs/getting_started.md) · [接口](docs/interfaces.md)
- [覆盖状态与原规则](docs/combat-rules.md) · [数据管线](docs/data-pipeline.md)
- [测试及实测证据](docs/testing.md)

本项目不包含 MMO 世界、真人联网房间、正式服写入或部署发布。
