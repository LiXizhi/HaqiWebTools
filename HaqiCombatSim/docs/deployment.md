# Vite 构建与 Keepwork CDN 发布

2026-09-18 按用户要求参考 Maisi `MagicHaqi/vite.config.mjs` 与 `uploadRelease.mjs` 接入。源码仍为原生 ES modules；普通 HTTP 静态服务可以直接运行，Vite 只作为开发和发布依赖。使用 Node 20.19+ 或22.12+（推荐24）与 Python；锁文件固定 Vite 7.3.6，未照搬参考项目旧版 Vite 5。

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

开发和预览默认打开 `HaqiCombatSim.html`；同目录另有 `Haqi.html`、`HaqiCards.html`、`HaqiEffects.html`。打包输出在 `dist/`，JS/CSS使用内容哈希文件名，共享模块自动拆分，运行时JSON合并为5个数据包。**dist不包含任何WebP或音频。所有入口在所有域名（含localhost）默认使用清单已登记的永久Keepwork CDN地址。** 发布不包含开发脚本、文档、凭据、源码映射或第三方运行时库。

`data/datasets.json`只含三个模拟数据集的manifest索引；`adventure.json`、`kids.json`、`teen.json`、`sample.json`按用途容纳其余数据，格式为 `{schemaVersion:1,files:{原路径:数据}}`。统一浏览器加载器 `js/runtime_data.js` 在Vite生产构建中按需请求数据包，并合并并发请求；每次返回独立数据副本，防止章节扩展和数据规范化污染缓存。下载失败可重试；源码静态服务及Vite dev继续读取原始分文件JSON。新增数据读取应使用该加载器，避免发布时请求已不存在的小JSON。

## 上传

2026-09-24：`dungeon-index.json`、`monster-art.json`、`quest-journal.json`、`quest-runtime.json` 统一经过构建期字段白名单并进入 `data/adventure.json`，不再单独输出两个任务文件。任务窗口复用启动阶段的读取器与缓存，因此冒险启动及首次打开任务窗口合计只请求 adventure/kids 两个配置包。代价是任务手记随启动包下载，不再延迟到打开窗口时下载。完整 `dungeons.json` 仍独立按需加载，不并入启动包。

怪物美术移除 adaptations 溯源记录，保留外观绑定和验证所需哈希、尺寸、大小；任务手记移除未使用的 repeat、目标 id 和前置 value；任务运行表移除未使用的条件 name。副本轻量索引已有字段均被实际功能使用，保持其菜单、外观和存档校验信息。源码 JSON 不做裁剪，普通 HTTP/Vite dev 仍按原路径读取。

`npc-catalog.json`同样采用构建期字段白名单：保留居民显示、商店与导师课程、交易限制、兑换条件/费用/奖励及物品属性；移除原始XML、重复原始列/奖励字符串、旧引擎模型与坐标、来源哈希和导出报告。仅精简dist数据包，原始目录保留完整资料。NPC字段或交易逻辑新增读取时，须同步更新投影与行为对照测试。

构建时由 `scripts/package_runtime_data.mjs` 压缩所有JSON，并按运行时字段白名单精简美术清单：保留CDN、裁剪/动画、原卡对照及实际校验字段，删除未使用的生成与溯源元数据；商店缺图记录只保留布尔标记。`card-atlas.json`、`cdn-publish-plan.json`、`skill-art-plan.json`、`expansion-report.json`仅供开发工具使用，不进入dist。源码清单保留完整字段；修改运行时读取字段时应同步更新投影及测试。

```sh
npm run plan:release  # 构建并生成发布计划，不上传
npm run upload        # 构建、上传、逐文件远端核验
npm run verify:release # 对当前dist重新核验，不上传
```

上传复用 Maisi `.github/skills/upload-deploy-cdn-files/qiniu_upload_local_files.py`，依赖 `qiniu`、`pyyaml`。自动向上查找工作目录同级的 `maisi` checkout，也可以设置 `MAISI_ROOT`；`HAQI_CDN_UPLOADER` 可指定上传器文件，`PYTHON` 可指定解释器。凭据完全由原上传器查找既有 `qiniu.yaml`，不进入本仓库或产物。

发布路径为 `https://cdn.keepwork.com/haqi/haqicombatsim/release/<hash>/`。**只上传HTML、JS、CSS、JSON；不上传WebP/Ogg等静态美术与音频。** 它们已通过日常资源准备流程上传，线上继续使用清单中的永久CDN地址。哈希由发布白名单文件的路径、长度及SHA-256生成，配置更新会产生新目录，本地美术副本变化不影响发布哈希。

上传器只接收 `.asset-cache/release-payload/<hash>/` 中按白名单暂存的文件；即使有人手动将WebP/Ogg放进dist也不会上传。目录结构与dist一致，不多套一层dist。仅在源码HTTP服务中显式设置 `?assets=local` 才会读取Git归档的美术，用于离线开发；此参数不适用于dist和CDN发布目录。

上传成功后逐项GET检查HTTP状态、通配CORS及完整字节哈希；任一失败命令以非零状态退出。`release/manifest.json`记录本次文件清单与核验状态，只有 `verified: true` 才代表验证完成。修复网络问题后可用 `verify:release` 重新核验。

核验通过后生成 `release/Haqi_v1.html`、`HaqiCombatSim_v1.html`、`HaqiCards_v1.html`、`HaqiEffects_v1.html`，它们在head首部插入该版本CDN目录的base标签，可放到Keepwork页面托管环境；也可直接访问命令输出的CDN HTML地址。仅规划时生成 `_preview.html`，其CDN地址尚未保证存在。`dist/`、`release/`与上传日志不提交Git；正式发布需以当前manifest核验状态为准，不使用以前遗留的入口文件。

批量模拟Worker在生产构建时由Vite打包为内联Blob Worker，支持“HTML在Keepwork、脚本在CDN”的跨域组合。发布HTML把页内链接解析到实际宿主页面，避免base把模拟器页签导航带到CDN目录。开发源码保留标准module Worker，调用方自定义workerUrl保持有效。localhost验证发布HTML无需添加资源参数，默认即为CDN。

发布不会自动同步 `digitalhuman-resource` Git镜像；该可选副本按Maisi上传技能另行征询。美术清单预算、原图来源与独立哈希仍按现有资源准备测试维护。

## 同步到本机Maisi

`upload`或`verify:release`远端核验成功并生成正式入口后，自动查找祖先目录下的 `maisi` checkout（例如 `lxzsrc/maisi`），优先使用 `MAISI_ROOT`。确认仓库Git标记及MagicHaqi入口存在后，将本次四个 `release/Haqi*_v1.html` 复制到 `<maisi>/maisi/maisi/webgames/MagicHaqi/release/`，更新同名文件并逐字节核验。其他文件保持原样；不复制美术、预览HTML或manifest，不替Maisi执行Git提交/推送。

未找到Maisi时打印跳过信息，不影响CDN发布；`plan:release`和失败的上传/核验不会复制。若复制发生IO错误则命令报错，可修复后运行 `verify:release`重新核验并复制。

## 本地美术独立包（Steam / 桌面 / 手机）

H5 的 `npm run build` 与 `npm run upload` 不变：产物仍是 `dist/`，不含 WebP/Ogg，页面默认请求清单里的永久 Keepwork CDN。商店和桌面安装包走另一条构建，不进入上传白名单。

```sh
npm run build:app      # app-dist/，默认本地美术，并复制清单引用的 WebP/Ogg
npm run desktop        # 用已有 app-dist 打开 Electron 窗口
npm run build:desktop  # 当前系统的安装包：Windows 为 NSIS，macOS 上为 dmg
npm run build:steam    # 在 build:desktop 之后把 unpacked 程序放到 steam-depot/
npm run build:android  # 同步到 android/，本机可继续用 Android Studio 打包
npm run build:ios      # 同步到 ios/，归档和签名需要 Mac
```

`HAQI_TARGET=app` 时 Vite 把 `__HAQI_ASSET_MODE__` 写成 `local`，因此不带查询参数也会读包内文件。`?assets=cdn` 仍可强制走 CDN，便于对照。源码服务和 `dist/` 不设置该变量，行为与以前相同。玩法里“有没有图”仍看清单中的 `cdn` 字符串，独立包只是不请求这些地址。

`scripts/package_app_assets.mjs` 只扫描 `app-dist/data` 里的运行时 JSON。本地路径必须存在；对象上有 `webpSha256` 或 `sha256` 时必须与文件一致，`size`/`bytes` 必须与文件长度一致。坐骑图集在清单里写成 `assets/...`，实际文件在 `demos/mount-lab/assets/...`，与 `hero_renderer.js` 的骑乘路径一致。`app-dist/index.html` 只做跳转到 `Haqi.html`，因为 Capacitor 要求入口文件名是 `index.html`。

Electron 在 `127.0.0.1` 上提供 `app-dist`（打包后是 `resources/app`），不用 `file://`。安装包由 `shell/electron/electron-builder.yml` 生成，Windows 同时产出 NSIS 和 `win-unpacked`。`scripts/build_desktop.mjs` 会先修补 electron-builder 26 在 Windows 上解包后立即重命名目录失败的问题。macOS 目标写在同一配置里，需在 Mac 上执行 `npm run build:desktop`。`steam-depot/app_build.vdf` 里的 `APP_ID` 和 `DEPOT_ID` 要换成 Steamworks 后台的数字后再上传；这一步没有成就、创意工坊或 Steam 云存档。Keepwork 登录仍按需加载 CDN 上的 SDK，失败时本地冒险和本机存档照常可用。

Android 工程在 `android/`，iOS 工程在 `ios/`。`capacitor.config.json` 的 `webDir` 是 `app-dist`。手机系统 WebView 使用 https 本地源。登录 Keepwork 需要网络，清单声明了 `INTERNET`。iOS 归档不能在 Windows 上完成。

## 副本整包按需加载（2026-09-22）

副本保持一个完整JSON，不按世界拆分。`data/adventure/dungeons.json`保留完整原版导出配置，构建时按既有白名单剔除归档XML，独立输出`dist/data/adventure/dungeons.json`。由现有`vite.config.mjs`在同一次构建中作为资源输出，运行`npm run build`即可，无独立构建配置、额外打包命令或JS入口产物。

`data/adventure/locale/*.txt` 同样在这次构建里逐个输出，不并入启动数据包。源码里以 `#` 开头且不含 `|` 的注释会在输出时去掉。游戏按当前界面语言或语言学习的母语/目标语言按需下载，中文不下载词典。发布白名单因此允许 `data/adventure/locale/` 下的 `.txt`，其他文本文件仍然拒绝。

`data/adventure/dungeon-index.json`是生成的轻量菜单/存档校验索引，包含在主启动数据包中。主`adventure.json`不再包含完整副本数据。首次进入任意副本，浏览器读取完整副本JSON并缓存，之后进入其他副本不再下载。源码与发布使用同一相对URL，副本IO专用独立JSON读取器，不走五包路由。当前角色在副本内的本地/云端存档恢复会先预加载；历史清怪记录用轻量索引校验。

Vite开发启动、正常构建及副本导出都会同步更新轻量索引；副本数据修改后按正常流程重新构建发布。发布白名单仍只允许HTML/JS/CSS/JSON，不包含美术或音频。

## 多语言产品官网（2026-09-25）

新增同目录入口 `HaqiOfficialWebsite.html`，中英文官网随 `Haqi.html` 等五个入口一起由 Vite 构建、CDN 发布、生成 `_v1.html` 包装页，并沿用已存在的 Maisi 发布入口同步流程。源文件为 `js/official_website.js`、`js/official_website_i18n.js` 和 `css/official_website.css`。

`data/official-website.json` 是约16KB的独立展示包：`scripts/package_official_website.mjs` 在 Vite dev/build 时根据 kids 卡牌、物品候选目录、原版任务目录、宠物、技能和语言课程生成数量，并摘取五张卡的实际模板与美术引用。它不进入主游戏五包，也不复制美术。普通 HTTP 服务可读取入库快照；更新原始数据后可运行 `node scripts/package_official_website.mjs` 刷新。默认使用永久 CDN，源码可显式 `?assets=local`，中英文参数为 `?lang=zh-CN` / `?lang=en`。

官网复用 `loadSkillArt` / `createSpellEffects` 渲染卡面与演出；不会初始化游戏、登录、读取或修改角色存档。语言切换只写当前URL。数据导入说明限定装备/已学牌/符文，并说明预览确认、独立角色及未迁移内容；学习说明限定当前营地中英试点。

2026-09-25官网调整：第二章节已替换为宠物/坐骑组合展示，官网包增加全部坐骑轻量外观/姿态和宠物名字/美术目录；骑乘复用正式伙伴UI，图片按可见区域加载。原六岛互动章节删除，首屏地图背景保留。展示不会修改游戏存档。

官网小队展示进一步简化：移除列表/搜索，仅保留骑乘角色和三宠物四个可点击展示位，单击各换一位、顶部按钮一次全换；保持完整目录可抽取。主角与坐骑合成后按透明边界放大显示。
