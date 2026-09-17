import {SCHOOLS,SCHOOL_NAMES} from '../rules/formulas.js';
import {section,esc,guard,notice,pct} from './dom.js';
import {suggest,login} from '../ai/keepwork.js';
import {applyPatch} from '../ai/patch.js';
import {evaluateCandidates} from '../ai/evaluate.js';
import {download,save} from '../storage.js';
export function tuningView(host,state) {
  let disposed=false,controller;
  const example={schemaVersion:1,baseHash:state.ruleset.hash,title:'候选方案',reason:'填写数据依据',changes:[]};
  host.innerHTML=section('数值与 AI','保留基线，提出小改动，用相同条件和独立种子复测。',`<div class="two-col"><div class="stack"><div class="panel"><h3>Keepwork 分析</h3><p>基于当前完整报告，最多提出三个数值候选。首次使用时加载 Keepwork SDK；报告与卡牌数据会发送至 Keepwork。</p><div class="row"><button id="ai-login">登录 Keepwork</button><button id="ai-suggest" class="primary">生成建议</button></div><p id="ai-analysis" style="white-space:pre-wrap"></p></div><div class="panel"><h3>候选补丁</h3><p>可粘贴一个补丁或最多三个补丁组成的数组。只允许现有白名单数值字段。</p><textarea class="json-editor" id="patch-json">${esc(JSON.stringify(example,null,2))}</textarea><div class="row" style="margin-top:14px"><button id="validate-patch">校验</button><button id="evaluate-patch" class="primary">复测候选</button><button id="cancel-evaluate" disabled>取消</button></div><p id="evaluate-progress"></p></div></div><div class="stack"><div class="warning">当前内核为实验性移植。AI 建议只适用于本数据快照与实验条件；完整 Lua 战斗对照尚未通过。</div><div class="panel"><h3>复测证据</h3><div id="evaluation-results"><p>完成实验后，在左侧提交候选。</p></div></div></div></div>`);
  const read=()=>{const p=JSON.parse(host.querySelector('#patch-json').value),a=Array.isArray(p)?p:[p];if(!a.length||a.length>3)throw new Error('需要 1–3 个候选');return a;};
  const show=()=>{if(!state.evaluation||!state.report||state.evaluation.baselineHash!==state.ruleset.hash)return;const el=host.querySelector('#evaluation-results');el.innerHTML=`<p>独立种子基线 A 得分率：${pct(state.evaluation.baselineValidation.summary.score)}</p>${state.evaluation.results.map((r,i)=>`<div class="divider"></div><h3>${esc(r.candidate.title??`候选 ${i+1}`)}</h3><p>${esc(r.candidate.reason??'')}</p><p>原种子 ${pct(r.paired.summary.score)} · 独立种子 ${pct(r.validation.summary.score)}</p><div class="scroll"><table><thead><tr><th>学系</th><th>基线 / 候选</th><th>独立验证</th></tr></thead><tbody>${SCHOOLS.map(s=>`<tr><td>${SCHOOL_NAMES[s]}</td><td>${pct(state.report.schools[s].score)} / ${pct(r.paired.schools[s].score)}</td><td>${pct(state.evaluation.baselineValidation.schools[s].score)} / ${pct(r.validation.schools[s].score)}</td></tr>`).join('')}</tbody></table></div><button data-export-candidate="${i}">导出候选与证据</button>`).join('')}`;el.querySelectorAll('[data-export-candidate]').forEach(b=>b.onclick=()=>download('haqi-candidate-evidence.json',{baselineHash:state.evaluation.baselineHash,baselineValidation:state.evaluation.baselineValidation,...state.evaluation.results[Number(b.dataset.exportCandidate)]}));};show();
  host.querySelector('#ai-login').onclick=guard(()=>login());
  host.querySelector('#ai-suggest').onclick=guard(async()=>{if(!state.report)throw new Error('请先完成批量实验');const button=host.querySelector('#ai-suggest');button.disabled=true;try{const result=await suggest(state.report,state.ruleset);for(const p of result.candidates)await applyPatch(state.ruleset,p);if(disposed)return;host.querySelector('#ai-analysis').textContent=result.analysis;host.querySelector('#patch-json').value=JSON.stringify(result.candidates,null,2);}finally{button.disabled=false;}});
  host.querySelector('#validate-patch').onclick=guard(async()=>{for(const p of read())await applyPatch(state.ruleset,p);notice('候选校验通过，基线未改动');});
  host.querySelector('#evaluate-patch').onclick=guard(async()=>{
    if(!state.report||state.report.partial||state.report.configHash!==state.ruleset.hash)throw new Error('需要当前配置的完整实验报告');
    if(state.task)throw new Error('已有实验正在运行');
    controller=new AbortController();state.task={cancel:()=>controller.abort()};host.querySelector('#evaluate-patch').disabled=true;host.querySelector('#cancel-evaluate').disabled=false;
    try{state.evaluation=await evaluateCandidates(state.report,state.ruleset,read(),{signal:controller.signal,onProgress:(label,n,total)=>{if(!disposed)host.querySelector('#evaluate-progress').textContent=`${label} · ${n} / ${total}`;}});await save(`evaluation:${state.version}`,state.evaluation);if(!disposed){show();notice('复测完成，证据已保存');}}
    finally{state.task=null;if(!disposed){host.querySelector('#evaluate-patch').disabled=false;host.querySelector('#cancel-evaluate').disabled=true;}}
  });
  host.querySelector('#cancel-evaluate').onclick=()=>controller?.abort();
  return ()=>{disposed=true;controller?.abort();};
}
