# HaqiCombatSim 项目长期约定

## data/ 目录与运行时打包
- `data/` 下的每个文件都必须在 `scripts/package_runtime_data.mjs` 的数据包配置里显式登记，否则打包时报 `未配置的数据包`，`tests/packed_startup.test.mjs` 与 `tests/runtime_data.test.mjs` 立刻失败（后者还断言"五个紧凑包"的数量）。
- 因为 `data/**` 会打包进用户下载产物，演示数据、实验室数据不要放 `data/`，放 `tests/fixtures/` 由测试自己读。

## 运行 npm test 的注意事项
- 本仓库有外部编辑器/生成脚本会在测试运行期间改动 `js/*.js` 与 `data/*.json`，会产出"只在这一次出现"的失败（断言内容对不上当前源码、堆栈行号对不上等）。判定失败真伪前先 `stat -c '%y %n'` 看文件 mtime，稳定后再单独复跑该文件。
- 判定"既有失败"用串行跑（`node --test --test-concurrency=1 tests/*.test.mjs`）比并行更干净，但串并不能消除外部改动带来的干扰。

## 环境限制（WorkBuddy agent shell）
- `child_process.spawnSync` 在本环境对**任何**可执行文件都返回 EBUSY（errno -4082，status=null），`spawn`（异步）正常。测试里需要拉起子进程时改用 Promise 包 `spawn`。
- 本机无法完整重跑 python 导出管线（`assets_manifest.txt` 与当初导出环境不一致，`export_monster_catalog.py` 会因 `int('')` 崩），数据戳记类问题只能外科手术式修正。
- python 无 PIL，`scripts/draw_mount_demo.py` 等依赖 Pillow 的脚本跑不了。
