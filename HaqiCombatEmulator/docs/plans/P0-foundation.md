# P0 基础与文档

状态：**基础验收完成**。更新时间：2026-09-16。总进度以 [code-plan.md](../code-plan.md) 为准。

## 目标与依赖

仓库 Wiki、AIChat 目录约定、真实 config 与 GlobalStore 快照。

## 任务与交付物

- 建立 HTML/JS/CSS 和所有职责目录
- 架构、接口、数据管线、总路线图与 Wiki 导航
- 只读数据审计、保留来源与加载顺序

交付物：目录与入口、README/AGENTS、docs、scripts/import_data.py、data/manifests。

## 验收条件与记录

- 入口可通过静态 HTTP 打开，浏览器工作流测试通过
- 717 / 1289 个源 hash 审计通过；缺项清单明确
- 文档入口、阶段计划和公共 API 均存在

具体运行证据与复现命令见 [testing.md](../testing.md)。未完成的验收不因为界面可用而勾选完成。

## 遗留与交接

原源数据缺项见 data-pipeline；不要把 P0 完成解释为后续全部完成。

继续先推进 P1/P2 一致性；开发约定详见项目 AGENTS。
