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
- agent shell 连不上本地端口（起 `python -m http.server` 后 `curl 127.0.0.1:<port>` 恒为 `code=000`，netstat 却能看到 LISTENING），所以"本地起服务 + 无头浏览器截图"的验收路径在本环境不可用；`file://` 也因 ES module + fetch 走不通。视觉验收只能在用户自己的浏览器里做。

## 主角形象（头部 / 身体）约定
- 头部与身体都由 `data/adventure/hero-art.json` 的 `heads` / `bodyVariants` 定义；`heads` 里带肤色的家族：`onyx`(深棕)、`cocoa`(中亚棕) = 非洲肤色，`jade/amber`=东亚、`sun/copper`=欧洲、`indigo`=南亚、`wave`=拉美。用户把"黑人"特指 onyx/cocoa，凡涉及"不要默认黑人"的随机池都排除 `^(onyx|cocoa)-`。
- **身体不能跨性别**：`hero_renderer.js` 按 `appearance.gender` 选 `male-walk`/`female-walk` 骨架（帧裁剪/几何不同），`bodyVariant(gender,id)` 对性别不符的 bodyId 返回 null 会静默回落到基础身体，`validHeroBodyId` 也强制前缀一致。想"男生穿女装"必须先改渲染器的骨架选择逻辑。
- 新建角色第 1 步的草稿由 `createHeroDraft(manifest,seed)`（`js/hero_body_core.js`）生成：性别默认男主角，男女两张卡各自随机头部（排除 onyx/cocoa）与服装；`createHeroPicker` 保持确定性，别在里面加随机，否则 `tests/hero_picker.test.mjs` 会挂。
