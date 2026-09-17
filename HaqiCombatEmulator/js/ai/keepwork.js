let loading;
export async function getSDK() {
  if(window.keepwork?.aiChat)return window.keepwork;
  if(!loading)loading=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://cdn.keepwork.com/sdk/keepworkSDK.iife.js?v=c1ff58c09d76';
    script.onload=()=>resolve();script.onerror=()=>reject(new Error('Keepwork SDK 加载失败'));document.head.append(script);
  }).catch(e=>{loading=null;throw e;});
  await loading;
  if(!window.keepwork?.aiChat)throw new Error('Keepwork AI 不可用');
  return window.keepwork;
}
export async function login(){const sdk=await getSDK();await sdk.loginWindow.show({title:'登录 Keepwork · 战斗实验室'});return sdk;}
export async function suggest(report,ruleset,model='keepwork-pro') {
  if(report.partial)throw new Error('请先完成一组实验');
  if(report.configHash!==ruleset.hash)throw new Error('报告与当前配置不一致');
  const sdk=await getSDK(),keys=new Set();
  for(const team of report.experiment.scenario.teams)for(const u of team)for(const key of u.deck)keys.add(key);
  for(const u of Object.values(report.experiment.profiles??{}))for(const key of u.deck)keys.add(key);
  const cards=[...keys].map(key=>ruleset.cards[key]).filter(Boolean);
  const prompt={version:ruleset.version,baseHash:ruleset.hash,parityStatus:report.parityStatus,experiment:report.experiment,summary:report.summary,schools:report.schools,averageTurns:report.averageTurns,cards};
  const reply=await sdk.aiChat.chat({model,messages:[{role:'system',content:'你是魔法哈奇战斗数值分析员。只能根据提供的实验数据提出最多3个候选，不得把实验性模拟称为现网证据，不得把含某系队伍胜率解释为该系因果胜率。保留五系特色，不追求每组对抗都50%。返回纯JSON：{"analysis":"解释及局限","candidates":[{"title":"方案名","reason":"依据","schemaVersion":1,"baseHash":"提供的哈希","changes":[{"path":["cards","卡牌key","params","damage_min"],"before":旧数值,"value":新数值}]}]}。仅修改提供卡牌的现有数值字段：damage_min/max、heal_min/max、cooldown、absorb_pts、boost_damage/heal；或卡牌顶层 accuracy/hitchance/pipcost。不得修改字符串表达式。每候选最多20项改动。不得输出代码。'}, {role:'user',content:JSON.stringify(prompt)}]});
  const text=typeof reply==='string'?reply:reply?.result??reply?.content??reply?.choices?.[0]?.message?.content;
  if(typeof text!=='string')throw new Error('AI 返回格式不可识别');
  const data=JSON.parse(text.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
  if(!Array.isArray(data.candidates)||data.candidates.length>3)throw new Error('AI 候选数量无效');
  return data;
}
