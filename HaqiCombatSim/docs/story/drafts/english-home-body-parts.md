# 纸上朋友：听读辨认部位

状态：已接入本地家园目录、独立听读练习及四幕连续故事；尚未发布。九个身体词的家园覆盖来自已学词的听读辨认，不是新词首次教学或完整掌握。

## 要解决的问题

现有画室验证了孩子编辑画纸与写标签，但不验证画中器官。字源岛已介绍身体词；家园需要在真实可见的图上区分eye/ear、arm/hand、leg/foot等，不能用任意笔画或同一个物件点击冒充理解。

## 已接入的故事与玩法

伙伴想替纸上朋友准备表演，让孩子帮忙检查“看观众、听开场、挥手、向前走”用到的部位。先由伙伴对话引出要做的事，之后听或读简短请求，打开家园中实际摆放的角色画进行点选。目标为已经学过的九词：hair、eye、ear、nose、mouth、arm、hand、leg、foot。

- 角色画必须是当前家园里的同一对象，移除、替换、角色或语言改变时旧练习失效。
- 脸部使用放大视图，身体使用全身视图；每组始终显示全部候选，不只给正确部位一个按钮。用中性编号和连线，按钮不提前显示中英文答案。
- 每个候选使用真实DOM按钮，至少44px命中区域，键盘可操作；连线准确指向图上部位，不能为扩大点击区让眼睛和耳朵重叠。
- 听力播放请求完成后才允许提交；只试听不计。语音失败可改阅读，但只记阅读且注明帮助。错误选择、重复回调、过期图像加载不计成功。
- 复用WordTree的独立听/读证据与间隔调度，不给这些选择增加朗读/输入次数，也不把听读成功直接换成basic或等级通过。
- head、face、body范围相互包含，首批不放进同一组单点辨认题，避免任意点在脸上同时算三个词。它们继续保留原创作入口，后续设计整体与部位的明确比较玩法。

## 美术来源与当前准备

使用项目 [art-asset-generator](C:/lxzsrc/apps/.github/skills/art-asset-generator/SKILL.md)、[imagegen](C:/Users/Administrator/.codex/skills/.system/imagegen/SKILL.md) 与 [upload-deploy-cdn-files](C:/lxzsrc/apps/.github/skills/upload-deploy-cdn-files/SKILL.md)。原生透明生成，未抠色；角色完整穿着T恤和短裤，身体部位清楚。源/输出哈希、生成提示、尺寸和标定点记录于 `data/adventure/home/body-parts.json`。

永久CDN：<https://cdn.keepwork.com/keepwork/cdn/haqi/home/home-body-friend-9df7767bab47.webp>。本地WebP为 `assets/adventure/home/home-body-friend-9df7767bab47.webp`，768×1152，121158字节。已核验浅色、深色及家园底色透明边缘，CDN内容哈希与CORS。按用户偏好仅上传CDN，不复制digitalhuman-resource镜像。

正式目录新增 `body-friend-picture`（纸上朋友角色画）。`view_home_body_parts.js` 只显示实际图和中性编号；控制器通过本轮回执、家园对象及角色/语言上下文接回 `home_comprehension_core` 和 WordTree。直接点整张图只打开查看，不能算选对部位。阅读请求可在图内查看；听力不显示请求文字，可重播，改阅读只计有帮助的阅读。编号通过既有rng核心按回执播种，同轮重开稳定、不同轮次变化，所有候选都有44px按钮。

九词各有read/listen作者变式，S2471—S2488；四幕 `en-l1-paper-friend-stage` 为S2489—S2492，目标依次eye/read、ear/listen、hand/read、foot/listen，后续使用原画。必须先学过词；可从字源岛纸上朋友课程进入，不在辨认题中自动教答案。家园156/180词有作者供给，听读各58词，不代表独立能力已经通过。

仍待完善：更多角色图和姿态的跨图迁移、head/face/body整体比较、充足跨日复现、真实语音与儿童试玩。标准化编号图的成功不代表真人身体动作识别；没有摄像头，不采集孩子照片。
