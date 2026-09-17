# AGENTS.md — `web/HaqiCombatSim/`

魔法哈奇 2D 网页战斗模拟器与 `Haqi.html` 单人冒险。父级规则见 [/AGENTS.md](../../AGENTS.md)；本目录是独立的纯前端 H5 子项目，**不适用** NPL 的 `NPL.load` / `commonlib.gettable` 规则。

## 先读什么

1. [docs/plan.md](docs/plan.md) — 阶段任务与当前进度
2. [docs/architecture.md](docs/architecture.md) — 模块分层与数据流
3. [docs/lua-mapping.md](docs/lua-mapping.md) — 任何数值公式改动前必须对照的 Lua 源码表
4. [docs/adventure.md](docs/adventure.md) — `Haqi.html` 的内容、存档、资源与已实施范围

## 硬规则

1. **不需要构建。** 纯 ES Module + Vanilla JS，直接打开 `HaqiCombatSim.html` 验证。不要引入 TypeScript、打包器、前端框架。`package.json` 仅用于 `npm run export`（数据导出）和 `npm test`。
2. **引擎与 UI 分层。** 所有战斗逻辑放在 `js/*_core.js`，只能依赖其他 `*_core.js`，不得引用 `document`/`window`/`fetch`；这些模块必须能在 Node 里被 `tests/*.test.mjs` 直接 import。`view_*.js` 只渲染 DOM 和绑定事件，通过回调把意图交给 `app.js`。
3. **公式 1:1 移植并标注来源。** `combat_formulas_core.js` 中每个函数头部注释写出 Lua 文件与行号（例如 `card_server.lua damage_expression L1473-1516`），kids / teen 分支用 `version` 参数区分，不得"顺手简化"。发现 Lua 行为与本地实现不一致时，以 Lua 为准并在 `docs/lua-mapping.md` 记录。
4. **可复现。** 所有随机数走 `rng_core.js` 的实例，禁止直接 `Math.random()`；同一 seed + 同一参数必须得到同一结果（有测试守护）。
5. **参数只走 BalanceParams。** 调参器、数值面板、LLM 建议都只改 `combat_params_core.js` 定义的覆盖层，引擎读取 `resolveParams(dataset, params)` 的结果，不得在引擎里散落魔法数字。
6. **运行时数据入库。** `data/kids/`、`data/teen/`、`data/sample/` 是应用实际加载的 JSON，提交到 git。`scripts/export_data.mjs` 可从本机 `paraworld/config/Aries/` 重新导出以刷新快照；不要把卡牌数值复制进源码。
7. **未支持即透明。** 未实现的 `template.type` 必须计入 `unsupported` 统计并在批量报告中展示，不得静默忽略。
8. **开发日志写 `docs/devlog/devlog_YYYY-MM-DD.md`**，不要在 `docs/` 根目录或别处新增日志。
9. 用户可见文案为中文；代码标识符英文；不加 emoji。

## 美术、Keepwork SDK 与 CDN（用户约定，2026-09-17）

以下是后续开发和上线必须遵守的约定。WebP/CDN 与可选云端检查点已接入；实际验证范围见 [docs/qa-report.md](docs/qa-report.md)。

### 可复用技能与源码

先定位 `lxzsrc/maisi/`（本机 `/Users/mac/lxzsrc/maisi`），读取适用技能再执行。下面路径相对于该仓库；其他机器按实际 checkout 位置解析，不把绝对路径写进游戏运行时代码。

| 用途 | 技能路径 |
|---|---|
| 角色图集、场景、道具生成，WebP 转换、CDN 上传与预览报告 | `.github/skills/art-asset-generator/SKILL.md` |
| Keepwork SDK 的登录、PersonalPageStore 存储、资源上传及现有 CDN 库目录 | `maisi/maisi/webgames/tools/AIChat/skills/keepwork-web-dev/SKILL.md` |
| 通过 Keepwork SDK CLI 压缩 WebP、上传用户 CDN、预览实际发布 URL | `.github/skills/keepwork-copilot/SKILL.md` |
| 使用现有七牛配置上传文件到 Keepwork CDN | `.github/skills/upload-deploy-cdn-files/SKILL.md` |

SDK 源码可在 `lxzsrc/keepworkSDK/`（本机 `/Users/mac/lxzsrc/keepworkSDK`）核对；重点看 `src/store/PersonalPageStore*.ts`、`src/store/CloudDrive.ts`。技能和源码中的现有接口是依据，不猜接口或 CDN 地址。凭据按工具既有安全流程使用，不写进仓库、客户端代码、存档或日志。遵守所用技能的上传预览、确认和结果核验流程。

### 游戏图片与本地副本

- **每张运行时 WebP 不超过 200,000 字节（200KB）。** 先尝试无损，超限则使用高质量有损编码并按需等比缩小；保留透明通道，同步校正图集裁剪坐标。资源准备与测试必须检查上限。
- **Git 中可以保留本地美术副本，图片使用 WebP 格式。** 后续新增/转换图片按此准备，保留透明通道、图集帧布局和必要清晰度；在浏览器中核验解码、裁剪和动画。
- **线上版本的图片/美术资源必须使用永久 Keepwork CDN URL。** 本地 WebP 副本用于开发、离线运行和资源归档；通过明确的本地/线上资源配置选择，不能把本地路径或临时外链作为线上默认资源地址。
- 资源清单同时记录本地 WebP 路径、实际上传成功的 CDN URL、尺寸/裁剪、来源及哈希。原版 `assets_manifest.txt` 的完整条目保留为来源追溯；原图清单哈希与转换后 WebP 哈希分开记录。
- Canvas 图片加载要验证 CDN 的 CORS；需要 `getImageData` 的图片在设置 `src` 前设置 `crossOrigin`。发布前检查 CDN 图片可读、alpha 正常、图集裁剪无错位，并验证明确的本地运行模式。

### Keepwork SDK 存储

- 需要登录或跨设备存储时，优先使用 **Keepwork SDK**，不另造后端。云端进度使用 `sdk.personalPageStore.withWorkspace('HaqiAdventure')` 的作用域实例，保存和读取版本化 JSON。通用接口为 `createFile` / `readFile`；本游戏需要持久化确认，使用下述无缓存写入及远端核验路径。
- Keepwork 适配器放在浏览器 IO 层，保持 `*_core.js` 纯净。保留当前本地自动存档、JSON 导入/导出和访客体验；登录取消、网络失败不能阻断游戏。
- `createFile` 硬编码开启后台 server pageCache 写入，可能抢先清除pending，返回值不代表持久化成功。游戏使用 `savePageData(path, 'content', text, false, false)` 显式暂存无缓存写入；`loadPageData(forceRemote=true)` 仍可能回退本地。先 `syncToGit(path, false)`，再通过 `sdk.getFileByFullPath(store.getRemotePagePath(path), undefined, false)` 读取实际远端内容并核验。
- 同步记录存档版本与更新时间；加载云端存档仍走现有校验和战斗重演，处理本地/云端冲突后再替换进度，不能悄悄覆盖较新的进度。SDK token、密码和密钥不得进入游戏存档。
- 按需加载 SDK，不为只使用本地存档的启动流程增加必需网络依赖。引入前核对登录和存储接口；实际账号的远端读写仍需按 QA 记录验证。

### 第三方依赖仅限 Keepwork CDN

- **只允许使用已经托管在 Keepwork CDN 的第三方库。** 所有第三方 JS、CSS、ES module、Worker/WASM 配套依赖均须使用已存在且核验过的 Keepwork CDN 地址；禁止从 unpkg、jsDelivr、cdnjs、esm.sh 等其他 CDN 导入，也不以 npm 打包或本地复制绕过此规则。
- 缺少 Keepwork CDN 版本时，选择已有库或用原生实现；不猜 URL、不引入外部 CDN 兜底。自己编写的项目模块仍可以使用相对路径。
- 以 Maisi `keepwork-web-dev` 技能的 CDN 库目录为准，保持已有完整版本号；实际引入前验证地址与配套版本。不要因为库可用就额外引入，继续保持无构建的 ES modules / Vanilla JS 架构。

Maisi 技能中已登记的相关地址（按需要选择，不要求全部加载）：

| 库 | Keepwork CDN 地址 |
|---|---|
| Keepwork SDK core | `https://cdn.keepwork.com/sdk/keepworkSDK.core.iife.js` |
| Keepwork SDK 完整包 | `https://cdn.keepwork.com/sdk/keepworkSDK.iife.js` |
| Three.js r164 ES module | `https://cdn.keepwork.com/keepwork/cdn/vendor/three/three.module.js` |
| Three.js 0.128.0 传统脚本 | `https://cdn.keepwork.com/npm/three@0.128.0/build/three.min.js` |
| Tailwind CSS 3.4.16 | `https://cdn.keepwork.com/keepwork/cdn/tailwindcss@3.4.16.js` |

Three.js 两种版本二选一，插件必须匹配所选版本；当前 Canvas 2D 场景无需为遵守本约定改用 Three.js。

## 验证

- 卡牌美术约定（2026-09-18）：新技能主体和专属动作图集以100KB为预算，当前打包器严格限制为100,000字节；卡牌背景仍严格小于24,000字节。其他资源保持原200,000字节上限。使用 `scripts/prepare_skill_art.py` 准备共享格图，并核验 `data/adventure/skill-art.json` 的来源、哈希、格号和CDN。

- `npm test`（`node --test tests/`）：公式回归、确定性、冒烟。
- 浏览器打开 `HaqiCombatSim.html`：对战页能完整打完一场 1v1；批量页 1v1 × 五系 × 200 场能出矩阵。
- 改动引擎后，在 `docs/qa-report.md` 追加一条验证记录。
