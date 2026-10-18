# 字源岛的独立汉字动画

入口：[一字一故事](../hanzi/hanzi_index.html)。30字词表的权威来源是 `data/adventure/dictionary/zh.json`。

2026-10-18 补齐日、月、山、水、火、木、石、土、人、口、手、目、耳、心、田、上、下、大、小、中、天、云，以及此前错误引用“武”的“舞”，共23个独立故事。原有门、雨、休、森、光、国、明保持原文件；“武”作为额外故事保留，不占用“舞”的身份。词条 `wu` 和存档编号不变，只修正动画为 `hanzi_wu_dance.html`。

## 画面与互动

每字有独立主题、配色和场景：晨光引船、月光水路、拨雾见山、水流绕石、窗边火光、树根枝叶、踏脚石、土中嫩芽、同行的人、山谷回声、手掌接叶、眼中萤火、竹林风铃、心愿信封、四块田、风筝升降、大伞、小船、桥中相会、天空、云荫、彩带舞蹈。

采用原生 Canvas 分层绘制远景、主体、光晕、反光和前景。画面中的轮廓经过连续插值汇入字典现有的规范笔画，不把艺术化联想当作古文字或字源史实。没有新增第三方库、远程请求、图片、WebGL或存档依赖。

六阶段为初见、寻找、变化、成字、写字、余韵。操作按钮和画面点击推动场景；写字使用已有 Make Me a Hanzi 中线与轮廓数据，支持指针拖动、失败重试和逐笔示范。键盘可用 Tab 选按钮，或在画布上按空格/回车示范一笔。所有笔画完成才发送 `written`，进入结尾发送 `completed`。开场不领奖。声音由开始手势解锁，可静音、暂停和重播；减少动态效果时停止环境运动。

桌面采用横向场景，手机竖屏放大主要构图，手机横屏将字幕移至右侧。字幕保留中文，并按宿主配置显示辅助语言；按钮、标题与提示使用宿主界面语言。独立打开使用中文。

## 作者源与生成

- `hanzi/source/stories.mjs`：稳定字ID、主题、标题和六段故事文案。
- `hanzi/source/painting.js`：各字场景、材质、光影与环境运动。
- `hanzi/source/contours.js`：场景轮廓到笔画的转场起点。
- `hanzi/source/player.js`、`story.css`：交互、描写、声音、布局与动画生命周期。
- `hanzi/source/translations.mjs`：新增故事及共用UI的英、日、韩译文。
- `scripts/build_hanzi_stories.mjs`：内联源码、字典笔画、原“光”页面的标准协议脚本和字形许可证，生成23个可独立部署的单文件HTML及显式URL映射。
- `scripts/prepare_hanzi_story_locales.mjs`：只向三种语言词典补充缺失词条，不覆盖原译文；使用真正的 `|` 分隔格式。

```sh
node scripts/build_hanzi_stories.mjs
node scripts/build_hanzi_stories.mjs --check
node scripts/prepare_hanzi_story_locales.mjs
node scripts/prepare_hanzi_story_locales.mjs --check
node --test tests/battle_dictionary.test.mjs tests/battle_hanzi_story_catalog.test.mjs
npm run test:battle
npm run locale:check
```

浏览器专项使用环境变量 `HAQI_PLAYWRIGHT` 指定本机 Playwright 包目录，运行 `node scripts/check_hanzi_stories.mjs` 与 `node scripts/check_hanzi_story_integration.mjs`。前者覆盖23字在1440×900、390×844、844×390和768×1024下的完整流程；`--visual` 只重拍场景和书写页。后者覆盖四种宿主语言、双语字幕、实际指针描写、键盘、暂停、迟到握手和正式字典控制器中的“舞”。输出位于 `tmp/hanzi-stories/`，不操作真实玩家账号。

新增页面的资源地址通过 `js/hanzi_story_animations.js` 的显式 `new URL` 映射进入现有字典加载链路，供静态HTTP和Vite识别。运行时页面不依赖 `source/`；构建网站不需要重复生成页面，修改作者源后应先运行生成与一致性检查。日常修改保留本地，未自动提交、推送或上传CDN。
