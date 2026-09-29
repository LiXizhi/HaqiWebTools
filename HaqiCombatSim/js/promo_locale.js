const english={
  "魔法哈奇 · 宣传片放映室": "Magic Haqi · Screening Room",
  "魔法哈奇": "Magic Haqi",
  "放映室": "Screening Room",
  "同一段冒险，每次都能重新讲述。": "One adventure, a new story every time.",
  "进入游戏": "Enter game",
  "宣传片画面": "Promo screen",
  "魔法哈奇演示舞台": "Magic Haqi demo stage",
  "正在准备魔法世界…": "Preparing the magical world…",
  "放映控制": "Playback controls",
  "播放": "Play",
  "暂停": "Pause",
  "从头播放": "Restart",
  "版本": "Edition",
  "完整篇 · 约3分钟": "Full film · about 3 minutes",
  "精华篇 · 约90秒": "Highlights · about 90 seconds",
  "画幅": "Format",
  "16:9 横屏": "16:9 landscape",
  "4:3 横屏": "4:3 landscape",
  "9:16 手机竖屏": "9:16 portrait",
  "字幕": "Language / subtitles",
  "中文": "Chinese",
  "关闭字幕": "Subtitles off",
  "速度": "Speed",
  "1× 录屏": "1× recording",
  "8× 检查": "8× review",
  "录屏模式": "Recording mode",
  "全屏": "Fullscreen",
  "播放进度": "Playback position",
  "运行整片检查": "Check entire film",
  "导出检查报告": "Export check report",
  "导出字幕 SRT": "Export SRT",
  "准备中": "Preparing",
  "剧本与检查范围": "Script and check scope",
  "正在准备镜头…": "Preparing scene…",
  "播放结束 · 可以从头播放或选择章节": "Playback finished · Restart or choose a chapter",
  "已切换版本，准备播放": "Edition changed · Ready to play",
  "页面已隐藏，播放已暂停": "Page hidden · Playback paused",
  "准备就绪 · 全程使用隔离演示角色": "Ready · Isolated demo characters throughout",
  "真实游戏渲染与规则，独立内存角色。不演示云端登录。好友与语言对话使用注明的演示数据，不访问账号、不发送消息、不保存进度。检查通过代表剧本覆盖流程可运行，不替代线上登录、真实好友、语音与支付验收。": "Uses real game rendering and rules with isolated characters. Social and language scenes use scripted demo data without accounts, messages or saved progress. Checks cover the film, not live login, friends, voice or payments.",
  "编辑 data/promo/film.json 调整镜头、字幕与动作。空格播放或暂停，左右键跳镜头，Esc 退出录屏模式。录屏模式将隐藏控制台；重新按 Esc 恢复。加载与检查报错时暂停，不跳过失败步骤。": "Edit data/promo/film.json to adjust scenes, subtitles and actions. Space plays or pauses; arrow keys change scenes; Esc exits recording mode. Loading or check errors pause playback."
};
export function promoText(text,locale){if(locale!=='en')return text;return english[text]||text.replace(/^剧本检查通过：(\d+) 个镜头；联网服务不在本次检查范围$/, 'All $1 scenes passed; live services are excluded');}
// Remember source nodes once so changing language preserves controls and listeners.
export function capturePromoChrome(root=document){
 const texts=[],attrs=[];const walker=document.createTreeWalker(root.documentElement,NodeFilter.SHOW_TEXT);
 while(walker.nextNode()){const node=walker.currentNode;if(node.parentElement?.closest('script,style'))continue;const source=node.textContent.trim();if(english[source])texts.push({node,source});}
 for(const node of root.querySelectorAll('[aria-label],[title]'))for(const key of ['aria-label','title']){const source=node.getAttribute(key);if(english[source])attrs.push({node,key,source});}
 return locale=>{root.documentElement.lang=locale;for(const {node,source} of texts)node.textContent=promoText(source,locale);for(const {node,key,source} of attrs)node.setAttribute(key,promoText(source,locale));};
}
