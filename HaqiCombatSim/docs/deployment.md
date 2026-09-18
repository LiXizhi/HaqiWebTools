# Vite 构建与 Keepwork CDN 发布

2026-09-18 按用户要求参考 Maisi `MagicHaqi/vite.config.mjs` 与 `uploadRelease.mjs` 接入。源码仍为原生 ES modules；普通 HTTP 静态服务可以直接运行，Vite 只作为开发和发布依赖。使用 Node 20.19+ 或22.12+（推荐24）与 Python；锁文件固定 Vite 7.3.6，未照搬参考项目旧版 Vite 5。

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

开发和预览默认打开 `HaqiCombatSim.html`；同目录另有 `Haqi.html`、`HaqiCards.html`、`HaqiEffects.html`。打包输出在 `dist/`，JS/CSS使用内容哈希文件名，共享模块自动拆分，`data/` JSON按原路径复制。**dist不包含任何WebP或音频。所有入口在所有域名（含localhost）默认使用清单已登记的永久Keepwork CDN地址。** 发布不包含开发脚本、文档、凭据、源码映射或第三方运行时库。

## 上传

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
