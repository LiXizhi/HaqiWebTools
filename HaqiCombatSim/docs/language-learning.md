# 多语言冒险学习

跨对话先读[主计划](language-adventure-plan.md)。UI词典规则见[locale.md](locale.md)。

## 当前实现（2026-09-25）

设置分别选择界面语言、母语和目标语言。开启学习后，在魔法营地点击抱抱龙入口或NPC的“和我聊聊”进入课程；其他岛屿不触发新课程。中英有完整试点内容，其他语言尚无课程，不会回退中文领奖。

20组意图各3组问答，每语言120条表达。27个真实营地NPC复用角色课程，舰长、莫娜等有不同绑定；学园与大门由抱抱龙主持。靠近NPC、地点、背包、物品、换装、捕鱼和战斗事件产生邀请，90秒全局与5分钟来源冷却。物品以实体ID关联常用词、量词和数量。

基础段每次练习两组回答，当次录音识别匹配才能通过。基础通过后开放最多8轮的挑战。模型返回逐字证据与NPC回复，程序校验目标、语言、引用及重复项，合计100分才奖励。自由交谈不奖励。首批挑战都是对话目标；核心支持真实事件条件，但尚未编排需要退出对话完成操作的课程。

基础10奇豆，每课每日2次；挑战按难度30/50/80仙豆，每课每日1次；角色每日上限100奇豆、200仙豆，北京零点更新。跨语言、跨NPC同课共用次数，进度按目标语言独立。上限后仍可练习，开始前显示实际奖励。货币与账本同次本地保存，成功后更新内存并排队云同步。

新入口不再发送旧的说话伤害/判胜动作，旧战斗日志仍可重演。商店移除语言免费购，核心拒绝新的 `paidByTest` 购买。旧档补空 `languageAdventure`，不追补奖励。原有学习者记忆/翻译辅助与新课程进度分别保存。

## 文件与语音参考

- `data/adventure/language-courses.json`：语言能力、课程ID、表达引用、事件、NPC/地点、词汇及目标。
- `data/adventure/locale/learning.zh-CN.txt`、`learning.en.txt`：教学词典；作者源为 `scripts/prepare_language_adventure.mjs`。
- `language_adventure_core.js`：严格模板、独立RNG、规范化、评分和账本；`language_adventure.js`：会话及游戏触发；`view_language_adventure.js`：渲染。
- `language_adventure_voice.js`：按需Keepwork ASR/TTS/AIChat。麦克风转16k PCM，不保存原始录音；转录仅保留当次对话。

参考本机 `apps/official/apps/tools/HelloLearner/js/speech.js` 和 `js/aichat-bridge.js`：关闭自动播放，合成MP3后等待实际播放结束，取消机制防止旧音频继续。HelloLearner还使用浏览器SpeechRecognition和宿主voice桥；本游戏核对SDK源码后直连SpeechRTC ASR，不依赖AIChat宿主。

## 验证边界

隔离页 `tests/fixtures/language-adventure.html` 默认模拟录音，只验证流程；`?live=1` 使用真实语音，不写真实角色档。线上SDK已确认加载并暴露ASR/TTS/chat；桌面/390px展示、中英示范、基础领奖和挑战解锁已查看。真实中英录音、发音、移动端音频解锁和模型目标完成仍待真人验收。挑战需要Keepwork登录。

进度区分无目标语字幕的听力含义选择（`listening`）、提示朗读（`basic`）、无标准答案的挑战完成（`challenge`）和最后练习时间。听力小测必须等播放完成后正确选择母语含义，只记录检查通过、不发货币或口语完成。单次通过仍不证明长期掌握，不得把领奖次数展示成掌握句数。允许变体覆盖数字、标点、英文缩写及作者配置的同义表达；`pairs[].variants` 仍通过目标语言教学词典渲染，缺译文的变体不参与核对。
