# 世界树当前实现验证 · 2026-10-18

本报告仅覆盖 `WordTree` JS 类库。旧 iframe、侧栏、分层导航与独立压力测试实现及其脚本已删除，不再沿用它们的验收结论。

## 已执行

- `node --test tests/language_tree*.test.mjs tests/word_tree*.test.mjs tests/dictionary_controller.test.mjs`：130/130 通过。涵盖实际呈现去重、词义、五状态与复测、掌握清单写入边界、确定性布局、3000 节点位置稳定、标签配额、命中及渐显渐隐。
- `scripts/check_word_tree_interactions.mjs`：Edge 1280×900、390×900，当前类库测试夹具；词弹窗三项选择、喇叭回调与取消、Escape／背景不能关闭、镜头不动、果实作答通过。语音适配器为测试桩，不代表真实在线发音。
- `scripts/check_word_tree_library.mjs`：同页两个类实例独立工作，无 iframe、不替换宿主 DOM、不向宿主传播弹窗键盘事件；一个实例标记不改变另一个；正常销毁、重复销毁、初始化期间销毁均通过。销毁后绘制统计停止更新，另一个实例仍保留。
- `scripts/check_dictionary_tree.mjs`：实际游戏隔离访客；中英文页签直接挂载类库，选择“不认识”进入原学习卡，返回树，切换战斗卡页签卸载。截图在 `tmp/tree-minimal/`。1280×900 桌面与 390×900 手机视口均通过；已查看手机截图确认布局。
- `npm run test:battle`：1218 项，1215 通过、3 失败。地图加载提示的旧源码匹配 1 项、缺失独立汉字动画 2 项；与重构前相同，未跳过。日志 `tmp/tree-library-battle.log`。
- 已扫描源码、当前测试与脚本：没有旧页面入口／旧渲染器／六叉导航函数的引用。世界树类库和字典适配器不再使用 iframe、srcdoc、frameElement 或整页 HTML 获取。

## 限制

本轮没有重新采样 600／1500／3000 长时运行性能；3000 节点仅有布局核心测试。未验证实体手机、真实账号服务器读写、在线模型和真实发音。浏览器使用本机 Edge 和隔离资料，不修改用户真实角色。未提交、推送或发布。

## 入口

- [类库 API 与模块边界](word-tree.md)
- 字典：`Haqi.html` 的中文／英文页签。
- 独立 WordTree.html 已删除；交互测试改用 tests/fixtures/word-tree-interactions.html，模拟数据不进入运行时源码或构建入口。
